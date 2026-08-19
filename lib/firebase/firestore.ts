import "server-only";

/**
 * Firestore access layer (Part 2).
 *
 * Every collection path in the app is named here exactly once. Route handlers and
 * lib modules go through these helpers rather than hand-writing paths, so a schema
 * change is a single-file edit and firestore.rules can't drift from the code.
 */
import { FieldValue, type Firestore } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase/admin";
import {
  TTL,
  cacheKeys,
  cached,
  del as cacheDel,
  get as cacheGet,
  set as cacheSet,
} from "@/lib/cache/kv";
import type {
  ChannelStats,
  CrossPlatformPost,
  DailySnapshot,
  NicheCacheDoc,
  UserProfile,
  YouTubeTokenDoc,
} from "@/types/youtube";

/* ------------------------------------------------------------------ paths */

export const paths = {
  user: (userId: string) => `users/${userId}`,
  youtubeToken: (userId: string) => `users/${userId}/tokens/youtube`,
  channel: (channelId: string) => `channels/${channelId}`,
  nicheCache: (keywordHash: string) => `niche_cache/${keywordHash}`,
  quotaUsage: (date: string) => `quota_usage/${date}`,
  quotaUsageUser: (date: string, userId: string) => `quota_usage/${date}/users/${userId}`,
  quotaHistory: (date: string) => `quota_history/${date}`,
  crossPlatformPost: (userId: string, postId: string) =>
    `users/${userId}/cross_platform_posts/${postId}`,
  snapshot: (userId: string, date: string) => `users/${userId}/snapshots/${date}`,
} as const;

export function db(): Firestore {
  return adminDb();
}

/** UTC day key, e.g. "2026-08-19". Quota resets are UTC-based, matching Google's. */
export function todayKey(now: Date = new Date()): string {
  return now.toISOString().slice(0, 10);
}

/* ------------------------------------------------------------------ users */

export async function getUserProfile(userId: string): Promise<UserProfile | null> {
  const snap = await db().doc(paths.user(userId)).get();
  return snap.exists ? (snap.data() as UserProfile) : null;
}

/**
 * Creates the user doc on first login, or refreshes the mutable identity fields.
 * Deliberately does not touch trackedCompetitorIds or lastDiscoveryRunAt - a login
 * must never reset the discovery cooldown, or the cooldown becomes trivially bypassable.
 */
export async function upsertUserProfile(
  userId: string,
  data: Pick<UserProfile, "email" | "displayName"> & Partial<UserProfile>,
): Promise<void> {
  const ref = db().doc(paths.user(userId));
  const snap = await ref.get();

  if (!snap.exists) {
    const profile: UserProfile = {
      uid: userId,
      email: data.email,
      displayName: data.displayName ?? null,
      photoURL: data.photoURL ?? null,
      channelId: null,
      channelTitle: null,
      createdAt: new Date().toISOString(),
      trackedCompetitorIds: [],
      lastDiscoveryRunAt: null,
      // homeRegion is deliberately NOT defaulted here. Writing "US" at creation
      // would make "never chose a region" indistinguishable from "chose the United
      // States", and the channel's own country is a far better answer than either.
      // resolveRegion() picks it up at read time instead (Part 8.2).
      ...(data.homeRegion ? { homeRegion: data.homeRegion } : {}),
    };
    await ref.set(profile);
    return;
  }

  await ref.set(
    {
      email: data.email,
      displayName: data.displayName ?? null,
      ...(data.photoURL !== undefined ? { photoURL: data.photoURL } : {}),
    },
    { merge: true },
  );
}

/**
 * Sets the creator's home region (Part 8.2).
 *
 * Separate from upsertUserProfile, which runs on every sign-in: folding this in
 * would mean a login could silently overwrite a choice the user made on purpose,
 * the same reason that function does not touch lastDiscoveryRunAt.
 */
export async function setHomeRegion(userId: string, region: string): Promise<void> {
  await db().doc(paths.user(userId)).set({ homeRegion: region.toUpperCase() }, { merge: true });
}

export async function setUserChannel(
  userId: string,
  channelId: string,
  channelTitle: string,
): Promise<void> {
  await db().doc(paths.user(userId)).set({ channelId, channelTitle }, { merge: true });
}

export async function markDiscoveryRun(userId: string, at = new Date()): Promise<void> {
  await db()
    .doc(paths.user(userId))
    .set({ lastDiscoveryRunAt: at.toISOString() }, { merge: true });
}

/** Users with a linked YouTube account - the daily-sync cron's work list (Part 5). */
export async function listUsersWithLinkedChannel(): Promise<UserProfile[]> {
  const snap = await db().collection("users").where("channelId", "!=", null).get();
  return snap.docs.map((d) => d.data() as UserProfile);
}

/* ----------------------------------------------------------------- tokens */

export async function getYouTubeToken(userId: string): Promise<YouTubeTokenDoc | null> {
  const snap = await db().doc(paths.youtubeToken(userId)).get();
  return snap.exists ? (snap.data() as YouTubeTokenDoc) : null;
}

export async function saveYouTubeToken(
  userId: string,
  token: Partial<YouTubeTokenDoc>,
): Promise<void> {
  await db()
    .doc(paths.youtubeToken(userId))
    .set({ ...token, updatedAt: new Date().toISOString() }, { merge: true });
}

export async function deleteYouTubeToken(userId: string): Promise<void> {
  await db().doc(paths.youtubeToken(userId)).delete();
}

/* ------------------------------------------------------------ niche cache */

/**
 * Two layers of cache in front of one 100 unit API call (Part 7).
 *
 * KV answers the hot path without a Firestore read, Firestore holds the 7 day
 * shared entry, and only a miss on both spends quota. Cross-checking the document's
 * own expiresAt on every path means a KV entry can never outlive the data it copies.
 */
export async function getNicheCache(keywordHash: string): Promise<NicheCacheDoc | null> {
  const key = cacheKeys.nicheCache(keywordHash);

  const hit = await cacheGet<NicheCacheDoc>(key);
  if (hit && new Date(hit.expiresAt).getTime() > Date.now()) return hit;

  const snap = await db().doc(paths.nicheCache(keywordHash)).get();
  if (!snap.exists) return null;

  const doc = snap.data() as NicheCacheDoc;
  const msLeft = new Date(doc.expiresAt).getTime() - Date.now();
  if (msLeft <= 0) return null; // expired == miss

  // Never cache for longer than the entry has left to live, or a stale niche could
  // be served after the document it came from has already expired.
  await cacheSet(key, doc, Math.min(TTL.niche, Math.floor(msLeft / 1000)));
  return doc;
}

export async function setNicheCache(
  keywordHash: string,
  doc: NicheCacheDoc,
): Promise<void> {
  await db().doc(paths.nicheCache(keywordHash)).set(doc);

  const msLeft = new Date(doc.expiresAt).getTime() - Date.now();
  await cacheSet(
    cacheKeys.nicheCache(keywordHash),
    doc,
    Math.min(TTL.niche, Math.floor(msLeft / 1000)),
  );
}

/* --------------------------------------------------------------- channels */

/**
 * Cached public channel metadata. Returns null when the cache is missing or older
 * than maxAgeHours, which the caller treats as "go spend a quota unit".
 * 24 hours by default: subscriber and view counts simply do not move fast enough
 * to justify a fresh call per dashboard load.
 */
export async function getCachedChannel(
  channelId: string,
  maxAgeHours = 24,
): Promise<ChannelStats | null> {
  const snap = await db().doc(paths.channel(channelId)).get();
  if (!snap.exists) return null;

  const doc = snap.data() as ChannelStats;
  const ageMs = Date.now() - new Date(doc.lastUpdated).getTime();
  return ageMs < maxAgeHours * 3600_000 ? doc : null;
}

/** Reads the cached channel regardless of age. For rendering while a refresh is due. */
export async function getChannelAnyAge(channelId: string): Promise<ChannelStats | null> {
  const snap = await db().doc(paths.channel(channelId)).get();
  return snap.exists ? (snap.data() as ChannelStats) : null;
}

export async function setCachedChannel(stats: ChannelStats): Promise<void> {
  await db().doc(paths.channel(stats.channelId)).set(stats);
}

/* -------------------------------------------------------------- snapshots */

/**
 * One document per user per day, written by the daily-sync cron. Dashboards read
 * these instead of calling the YouTube API, which is what keeps a page load at
 * zero quota units.
 */
export async function saveSnapshot(
  userId: string,
  snapshot: DailySnapshot,
): Promise<void> {
  await db().doc(paths.snapshot(userId, snapshot.date)).set(snapshot);
  // The sync just produced newer data, so the cached copy is now wrong. Dropping it
  // rather than overwriting keeps this correct even if the write below fails.
  await cacheDel(cacheKeys.latestSnapshot(userId));
}

export async function getSnapshot(
  userId: string,
  date: string,
): Promise<DailySnapshot | null> {
  const snap = await db().doc(paths.snapshot(userId, date)).get();
  return snap.exists ? (snap.data() as DailySnapshot) : null;
}

/**
 * Most recent snapshot regardless of date. Today's may not exist yet: Vercel Hobby
 * cron fires once a day somewhere inside its scheduled hour, so a user loading the
 * dashboard beforehand must still see yesterday's data rather than an empty page.
 */
/**
 * Read through KV (Part 7). This is the hottest read in the app: every dashboard
 * page load calls it, and the underlying document changes once a day. Serving it
 * from Firestore each time would spend the ~50k/day read budget on data that is
 * identical for hours.
 */
export async function getLatestSnapshot(userId: string): Promise<DailySnapshot | null> {
  return cached<DailySnapshot>(
    cacheKeys.latestSnapshot(userId),
    TTL.snapshot,
    async () => {
      const snap = await db()
        .collection(`users/${userId}/snapshots`)
        .orderBy("date", "desc")
        .limit(1)
        .get();
      return snap.empty ? null : (snap.docs[0].data() as DailySnapshot);
    },
  );
}

/** Oldest first, for trend charts. */
export async function listRecentSnapshots(
  userId: string,
  limit = 30,
): Promise<DailySnapshot[]> {
  const snap = await db()
    .collection(`users/${userId}/snapshots`)
    .orderBy("date", "desc")
    .limit(limit)
    .get();
  return snap.docs.map((d) => d.data() as DailySnapshot).reverse();
}

/* ---------------------------------------------------------- cross-platform */

export async function addCrossPlatformPost(
  userId: string,
  post: Omit<CrossPlatformPost, "postId" | "createdAt">,
): Promise<string> {
  const ref = db().collection(`users/${userId}/cross_platform_posts`).doc();
  await ref.set({ ...post, postId: ref.id, createdAt: new Date().toISOString() });
  return ref.id;
}

/**
 * Every logged post, newest first.
 *
 * Ordered by postedAt rather than createdAt: a creator backfilling last month's
 * TikToks enters them in whatever order they find them, and the list is about when
 * things were published, not when they were typed in.
 */
export async function listCrossPlatformPosts(
  userId: string,
  limit = 200,
): Promise<CrossPlatformPost[]> {
  const snap = await db()
    .collection(`users/${userId}/cross_platform_posts`)
    .orderBy("postedAt", "desc")
    .limit(limit)
    .get();
  return snap.docs.map((d) => d.data() as CrossPlatformPost);
}

export async function deleteCrossPlatformPost(
  userId: string,
  postId: string,
): Promise<void> {
  // Scoped under the user's own path, so a mismatched id deletes nothing rather
  // than reaching another user's document.
  await db().doc(paths.crossPlatformPost(userId, postId)).delete();
}

export { FieldValue };
