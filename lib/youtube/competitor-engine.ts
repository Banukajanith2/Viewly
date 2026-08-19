import "server-only";

/**
 * Competitor discovery engine (Part 6).
 *
 * The pipeline exists to spend search.list as rarely as possible. One search.list is
 * 100 units of a ~10,000 unit budget shared by the entire app, so the app gets about
 * 100 searches per day across all creators combined. Two defences keep that viable:
 *
 *  - A per-user 7 day cooldown (enforced in the rate limiter, not here).
 *  - A niche cache keyed by a hash of the normalised keywords rather than by user,
 *    so every creator in the same niche shares one discovery run. This is the whole
 *    reason the pipeline is shaped this way: without it, N creators in one niche cost
 *    N * 100 units instead of 100.
 *
 * Step order matters. The cache is consulted before anything is spent, and the
 * expensive call happens only after a confirmed miss.
 */
import {
  getNicheCache,
  getUserProfile,
  setNicheCache,
} from "@/lib/firebase/firestore";
import {
  attachVideoStats,
  getChannelStats,
  getChannelStatsBatch,
  getRecentUploads,
} from "@/lib/youtube/data-api";
import {
  buildSearchQuery,
  daysSincePublished,
  extractKeywords,
  extractSearchTerms,
  hashKeywords,
  isStaleChannel,
  scoreBreakout,
  viewVelocity,
} from "@/lib/youtube/keywords";
import { google, type youtube_v3 } from "googleapis";
import { recordCall } from "@/lib/quota/tracker";
import type {
  CompetitorCandidate,
  DiscoveryResult,
  NicheCacheDoc,
  VideoSummary,
} from "@/types/youtube";

// Pure logic lives in ./keywords so it can be exercised without server-only or
// Firestore in the way. Re-exported here so callers have one import site.
export {
  buildSearchQuery,
  daysSincePublished,
  extractKeywords,
  isStaleChannel,
  extractSearchTerms,
  hashKeywords,
  normalizeKeywords,
  rankKeywordsByFrequency,
  scoreBreakout,
  viewVelocity,
  BREAKOUT_MULTIPLIER,
} from "@/lib/youtube/keywords";

/** Cache lifetime for a shared discovery run. */
export const NICHE_CACHE_TTL_DAYS = 7;

/** Subscriber band that counts as a peer, from the brief. */
export const SUBSCRIBER_RANGE = { min: 0.3, max: 3.5 } as const;

/** Uploads sampled per candidate when computing their average. */
const VIDEOS_PER_CANDIDATE = 5;

/**
 * Hard cap on candidates carried into Step 4. Each costs a playlistItems.list
 * (1 unit), so this bounds the cheap half of discovery linearly.
 *
 * Set at 20 rather than 12 because the staleness filter below discards candidates
 * only after their uploads have been fetched. A real run kept 3 of 8 once dead
 * channels were removed, so the pool has to start wider. Against the 100 units
 * search.list already cost, 8 extra units to avoid returning a near-empty list is
 * an easy trade.
 */
const MAX_CANDIDATES_TO_SCORE = 20;

/**
 * A candidate with no upload in this long is dropped. Six months is deliberately
 * lenient: it clears out abandoned channels without punishing a creator who took a
 * season off.
 */
const MAX_CANDIDATE_STALENESS_DAYS = 180;

/** Results requested from search.list. Costs 100 units regardless of the count. */
const SEARCH_RESULTS = 25;

function dataApi(): youtube_v3.Youtube {
  const apiKey = process.env.YOUTUBE_API_KEY;
  if (!apiKey) throw new Error("Missing YOUTUBE_API_KEY.");
  return google.youtube({ version: "v3", auth: apiKey });
}

/* ------------------------------------------------------- the pipeline */

export interface DiscoveryOptions {
  /**
   * When false, a cache miss returns an empty fresh result instead of spending
   * 100 units. Lets the pipeline be exercised end to end without paying for it.
   */
  allowLiveSearch?: boolean;
}

/**
 * Full discovery for one user.
 *
 * The caller is responsible for checking the rate limiter first and for recording
 * lastDiscoveryRunAt afterwards. Keeping that in the route rather than here means
 * this function stays callable from a script or a test without tripping cooldowns.
 */
export async function discoverCompetitors(
  userId: string,
  channelId: string,
  { allowLiveSearch = true }: DiscoveryOptions = {},
): Promise<DiscoveryResult> {
  // Step 1. Keywords from the user's own best recent uploads.
  const uploads = await getRecentUploads(channelId, 10, userId);

  // Two orderings, deliberately. `keywords` is the sorted set that produces the
  // shareable hash; `searchTerms` is frequency-ranked and describes the niche.
  const keywords = extractKeywords(uploads);
  const searchTerms = extractSearchTerms(uploads);

  if (keywords.length === 0) {
    throw new NoKeywordsError(
      "Your channel needs a few published videos before Viewly can work out which " +
        "niche you compete in.",
    );
  }

  const keywordHash = hashKeywords(keywords);

  // Step 2. Shared cache first. A hit costs zero quota, for anyone in this niche.
  const cached = await getNicheCache(keywordHash);
  if (cached) {
    return {
      keywords: cached.keywords,
      keywordHash,
      candidates: cached.results,
      source: "cache",
      cachedAt: cached.cachedAt,
      expiresAt: cached.expiresAt,
    };
  }

  if (!allowLiveSearch) {
    const now = new Date().toISOString();
    return {
      keywords,
      keywordHash,
      candidates: [],
      source: "fresh",
      cachedAt: now,
      expiresAt: now,
    };
  }

  // Step 3. Confirmed miss, so spend the 100 units.
  const ownChannel = await getChannelStats(channelId, userId);
  const candidates = await runDiscovery(userId, searchTerms, ownChannel.subscriberCount);

  const now = new Date();
  const expires = new Date(now.getTime() + NICHE_CACHE_TTL_DAYS * 86_400_000);

  const doc: NicheCacheDoc = {
    keywords,
    results: candidates,
    cachedAt: now.toISOString(),
    expiresAt: expires.toISOString(),
  };
  await setNicheCache(keywordHash, doc);

  return {
    keywords,
    keywordHash,
    candidates,
    source: "fresh",
    cachedAt: doc.cachedAt,
    expiresAt: doc.expiresAt,
  };
}

export class NoKeywordsError extends Error {
  readonly code = "no_keywords";
  constructor(message: string) {
    super(message);
    this.name = "NoKeywordsError";
  }
}

/**
 * The expensive path: search.list, then filter, then score.
 *
 * Kept separate from discoverCompetitors so the cost is visible in one place. Every
 * unit this app will ever regret spending is spent inside this function.
 */
async function runDiscovery(
  userId: string,
  searchTerms: string[],
  ownSubscriberCount: number,
): Promise<CompetitorCandidate[]> {
  const query = buildSearchQuery(searchTerms);
  const profile = await getUserProfile(userId);

  // 100 units. The only search.list call in the entire application.
  const res = await dataApi().search.list({
    part: ["snippet"],
    q: query,
    type: ["channel"],
    maxResults: SEARCH_RESULTS,
    // Part 8.2: region-aware results rather than defaulting to US or global.
    regionCode: profile?.homeRegion ?? "US",
  });
  await recordCall("search.list", userId);

  const channelIds = (res.data.items ?? [])
    .map((item) => item.id?.channelId)
    .filter((id): id is string => Boolean(id));

  if (channelIds.length === 0) return [];

  // Batched: 1 unit per 50 channels, and cache hits cost nothing at all.
  const channels = await getChannelStatsBatch(channelIds, userId);

  // Peer band. A channel 50x your size is not a competitor, it is a different sport.
  const min = ownSubscriberCount * SUBSCRIBER_RANGE.min;
  const max = ownSubscriberCount * SUBSCRIBER_RANGE.max;

  const peers = channels
    .filter((c) => c.subscriberCount >= min && c.subscriberCount <= max)
    // Closest in size first, so the cap keeps the most relevant candidates.
    .sort(
      (a, b) =>
        Math.abs(a.subscriberCount - ownSubscriberCount) -
        Math.abs(b.subscriberCount - ownSubscriberCount),
    )
    .slice(0, MAX_CANDIDATES_TO_SCORE);

  return scoreCandidates(userId, peers);
}

/**
 * Step 4. Average views and view velocity per candidate.
 *
 * Uploads are fetched per candidate (1 unit each, playlistItems.list), but statistics
 * for every candidate's videos are fetched in one batched videos.list pass. For 12
 * candidates that is 12 + 2 units instead of 24.
 */
async function scoreCandidates(
  userId: string,
  peers: Awaited<ReturnType<typeof getChannelStatsBatch>>,
): Promise<CompetitorCandidate[]> {
  const uploadsByChannel = new Map<string, VideoSummary[]>();

  for (const peer of peers) {
    if (peer.videoCount === 0) continue;
    try {
      const videos = await getRecentUploads(
        peer.channelId,
        VIDEOS_PER_CANDIDATE,
        userId,
        { withStats: false },
      );
      if (videos.length) uploadsByChannel.set(peer.channelId, videos);
    } catch {
      // A single unavailable channel must not sink the whole discovery run.
    }
  }

  // One batched statistics pass across every candidate's videos.
  const flat = [...uploadsByChannel.values()].flat();
  const enriched = flat.length ? await attachVideoStats(flat, userId) : [];
  const statsById = new Map(enriched.map((v) => [v.videoId, v]));

  const candidates: CompetitorCandidate[] = [];

  for (const peer of peers) {
    const videos = (uploadsByChannel.get(peer.channelId) ?? []).map(
      (v) => statsById.get(v.videoId) ?? v,
    );
    if (videos.length === 0) continue;

    const views = videos.map((v) => v.viewCount ?? 0);
    const averageViews = views.reduce((a, b) => a + b, 0) / views.length;

    // getRecentUploads returns newest first.
    const latest = videos[0];

    // Correctly sized but abandoned. Not a competitor.
    if (isStaleChannel(latest.publishedAt, MAX_CANDIDATE_STALENESS_DAYS)) continue;

    candidates.push({
      channelId: peer.channelId,
      title: peer.title,
      thumbnailUrl: peer.thumbnailUrl,
      subscriberCount: peer.subscriberCount,
      viewCount: peer.viewCount,
      videoCount: peer.videoCount,
      averageViews,
      viewVelocity: viewVelocity(latest),
      isBreakout: scoreBreakout(latest.viewCount ?? 0, averageViews),
      daysSinceLastUpload: daysSincePublished(latest.publishedAt),
      latestVideo: latest,
    });
  }

  // Breakouts first, then fastest moving.
  return candidates.sort((a, b) => {
    if (a.isBreakout !== b.isBreakout) return a.isBreakout ? -1 : 1;
    return b.viewVelocity - a.viewVelocity;
  });
}
