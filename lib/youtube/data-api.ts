import "server-only";

/**
 * YouTube Data API v3 wrapper (Part 5).
 *
 * Two rules govern every function here:
 *
 *  1. Never call search.list to enumerate a channel's uploads. The uploads playlist
 *     ID is derivable from the channel ID with zero API calls, and reading it costs
 *     1 unit against search.list's 100. That is a 100x difference on the app's most
 *     frequent operation, and it is the single most important optimisation in the
 *     system. See getUploadsPlaylistId below.
 *  2. Record every successful call through the quota tracker, immediately, with the
 *     user it was made on behalf of. A call nobody recorded is budget nobody can see.
 *
 * Public metadata is read with the API key rather than a user's OAuth token, so
 * looking up a competitor never needs that competitor's consent, and a user with an
 * expired token can still have their dashboard rendered from cache.
 */
import { google, type youtube_v3 } from "googleapis";
import { getCachedChannel, setCachedChannel } from "@/lib/firebase/firestore";
import { recordCall } from "@/lib/quota/tracker";
import type { ChannelStats, VideoSummary } from "@/types/youtube";

/** playlistItems.list and videos.list both cap at 50 results per call. */
const MAX_RESULTS_PER_CALL = 50;

function dataApi(): youtube_v3.Youtube {
  const apiKey = process.env.YOUTUBE_API_KEY;
  if (!apiKey) throw new Error("Missing YOUTUBE_API_KEY.");
  return google.youtube({ version: "v3", auth: apiKey });
}

/**
 * Derives the uploads playlist ID from a channel ID by string substitution
 * (UCxxxx to UUxxxx). Costs zero quota and zero latency.
 *
 * Every channel's uploads playlist is its channel ID with the UC prefix swapped for
 * UU. Fetching it via channels.list(part=contentDetails) would work too, but it is a
 * wasted unit for a value that is a pure function of the input.
 */
export function getUploadsPlaylistId(channelId: string): string {
  if (!channelId.startsWith("UC")) {
    throw new Error(`Expected a UC-prefixed channel ID, got: ${channelId}`);
  }
  return `UU${channelId.slice(2)}`;
}

/** ISO 8601 duration (PT1H2M3S) to seconds. */
export function parseDuration(iso: string | null | undefined): number {
  if (!iso) return 0;
  const m = iso.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+(?:\.\d+)?)S)?/);
  if (!m) return 0;
  return Number(m[1] ?? 0) * 3600 + Number(m[2] ?? 0) * 60 + Math.round(Number(m[3] ?? 0));
}

/** Distinguishes "this channel has never uploaded" from a genuine API failure. */
function isPlaylistNotFound(err: unknown): boolean {
  const e = err as { code?: number; errors?: Array<{ reason?: string }> };
  return e?.code === 404 || e?.errors?.some((x) => x.reason === "playlistNotFound") === true;
}

/** Statistics come back as strings, and are absent when a channel hides them. */
function toNumber(value: string | null | undefined): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function mapChannel(item: youtube_v3.Schema$Channel): ChannelStats {
  const stats = item.statistics ?? {};
  const channelId = item.id ?? "";

  return {
    channelId,
    title: item.snippet?.title ?? "Untitled channel",
    description: item.snippet?.description ?? "",
    thumbnailUrl:
      item.snippet?.thumbnails?.medium?.url ??
      item.snippet?.thumbnails?.default?.url ??
      undefined,
    subscriberCount: toNumber(stats.subscriberCount),
    viewCount: toNumber(stats.viewCount),
    videoCount: toNumber(stats.videoCount),
    // Hidden counts report as 0, which is indistinguishable from a real 0 unless
    // this flag is carried through. The UI must show "hidden", not "0 subscribers".
    subscriberCountHidden: stats.hiddenSubscriberCount === true,
    uploadsPlaylistId:
      item.contentDetails?.relatedPlaylists?.uploads ??
      (channelId ? getUploadsPlaylistId(channelId) : ""),
    country: item.snippet?.country ?? undefined,
    lastUpdated: new Date().toISOString(),
  };
}

/**
 * channels.list, 1 unit, cached in channels/{channelId} for 24 hours.
 *
 * `force` skips the cache. Only the daily sync should pass it: an interactive
 * request must never be able to spend a unit on demand, or the cache is decorative.
 */
export async function getChannelStats(
  channelId: string,
  userId: string,
  { force = false }: { force?: boolean } = {},
): Promise<ChannelStats> {
  if (!force) {
    const cached = await getCachedChannel(channelId, 24);
    if (cached) return cached;
  }

  const res = await dataApi().channels.list({
    part: ["snippet", "statistics", "contentDetails"],
    id: [channelId],
  });
  await recordCall("channels.list", userId);

  const item = res.data.items?.[0];
  if (!item) throw new Error(`Channel not found: ${channelId}`);

  const stats = mapChannel(item);
  await setCachedChannel(stats);
  return stats;
}

/**
 * channels.list for many channels at once, 1 unit total for up to 50 IDs.
 *
 * Part 6 scores dozens of discovery candidates, and batching is the difference
 * between 1 unit and 50. Cached channels are filtered out before the call, so a
 * warm niche cache can cost nothing at all.
 */
export async function getChannelStatsBatch(
  channelIds: string[],
  userId: string,
): Promise<ChannelStats[]> {
  const unique = [...new Set(channelIds)];
  const results: ChannelStats[] = [];
  const misses: string[] = [];

  for (const id of unique) {
    const cached = await getCachedChannel(id, 24);
    if (cached) results.push(cached);
    else misses.push(id);
  }

  for (let i = 0; i < misses.length; i += MAX_RESULTS_PER_CALL) {
    const batch = misses.slice(i, i + MAX_RESULTS_PER_CALL);

    const res = await dataApi().channels.list({
      part: ["snippet", "statistics", "contentDetails"],
      id: batch,
      maxResults: MAX_RESULTS_PER_CALL,
    });
    await recordCall("channels.list", userId);

    for (const item of res.data.items ?? []) {
      const stats = mapChannel(item);
      await setCachedChannel(stats);
      results.push(stats);
    }
  }

  return results;
}

/**
 * The channel's most recent uploads, newest first.
 *
 * playlistItems.list against the derived uploads playlist, 1 unit. Do not "improve"
 * this by switching to search.list with order=date: that returns the same data for
 * 100 units and would blow the app's entire daily budget in about 100 requests.
 *
 * withStats adds one videos.list call (1 unit for up to 50 videos) to attach view
 * counts, tags and duration, which playlistItems.list does not return.
 */
export async function getRecentUploads(
  channelId: string,
  count: number,
  userId: string,
  { withStats = true }: { withStats?: boolean } = {},
): Promise<VideoSummary[]> {
  const playlistId = getUploadsPlaylistId(channelId);
  const wanted = Math.min(Math.max(count, 1), MAX_RESULTS_PER_CALL);

  let res;
  try {
    res = await dataApi().playlistItems.list({
      part: ["snippet", "contentDetails"],
      playlistId,
      maxResults: wanted,
    });
  } catch (err) {
    // A channel with no uploads has no uploads playlist, and YouTube answers 404
    // playlistNotFound rather than an empty list. That is an ordinary state for a
    // new creator, not a failure, so it must not abort a sync.
    if (isPlaylistNotFound(err)) return [];
    throw err;
  }
  await recordCall("playlistItems.list", userId);

  const videos: VideoSummary[] = (res.data.items ?? [])
    .map((item): VideoSummary | null => {
      const videoId = item.contentDetails?.videoId ?? item.snippet?.resourceId?.videoId;
      if (!videoId) return null;

      return {
        videoId,
        title: item.snippet?.title ?? "Untitled",
        // contentDetails carries the true publish time; snippet.publishedAt is when
        // the video was added to the playlist, which differs for older uploads.
        publishedAt:
          item.contentDetails?.videoPublishedAt ??
          item.snippet?.publishedAt ??
          new Date().toISOString(),
        thumbnailUrl:
          item.snippet?.thumbnails?.medium?.url ??
          item.snippet?.thumbnails?.default?.url ??
          undefined,
      };
    })
    .filter((v): v is VideoSummary => v !== null);

  if (!withStats || videos.length === 0) return videos;
  return attachVideoStats(videos, userId);
}

/** videos.list, 1 unit per 50 videos. Merges statistics, tags and duration in place. */
export async function attachVideoStats(
  videos: VideoSummary[],
  userId: string,
): Promise<VideoSummary[]> {
  const byId = new Map(videos.map((v) => [v.videoId, { ...v }]));
  const ids = [...byId.keys()];

  for (let i = 0; i < ids.length; i += MAX_RESULTS_PER_CALL) {
    const batch = ids.slice(i, i + MAX_RESULTS_PER_CALL);

    const res = await dataApi().videos.list({
      part: ["snippet", "statistics", "contentDetails"],
      id: batch,
      maxResults: MAX_RESULTS_PER_CALL,
    });
    await recordCall("videos.list", userId);

    for (const item of res.data.items ?? []) {
      const existing = item.id ? byId.get(item.id) : undefined;
      if (!existing) continue;

      existing.viewCount = toNumber(item.statistics?.viewCount);
      existing.likeCount = toNumber(item.statistics?.likeCount);
      existing.commentCount = toNumber(item.statistics?.commentCount);
      existing.tags = item.snippet?.tags ?? [];
      existing.durationSeconds = parseDuration(item.contentDetails?.duration);
    }
  }

  // Preserve the playlist's newest-first ordering rather than the API's.
  return videos.map((v) => byId.get(v.videoId) ?? v);
}
