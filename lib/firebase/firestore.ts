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
      homeRegion: data.homeRegion ?? "US",
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

export async function getNicheCache(keywordHash: string): Promise<NicheCacheDoc | null> {
  const snap = await db().doc(paths.nicheCache(keywordHash)).get();
  if (!snap.exists) return null;

  const doc = snap.data() as NicheCacheDoc;
  if (new Date(doc.expiresAt).getTime() <= Date.now()) return null; // expired == miss
  return doc;
}

export async function setNicheCache(
  keywordHash: string,
  doc: NicheCacheDoc,
): Promise<void> {
  await db().doc(paths.nicheCache(keywordHash)).set(doc);
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
export async function getLatestSnapshot(userId: string): Promise<DailySnapshot | null> {
  const snap = await db()
    .collection(`users/${userId}/snapshots`)
    .orderBy("date", "desc")
    .limit(1)
    .get();
  return snap.empty ? null : (snap.docs[0].data() as DailySnapshot);
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

export { FieldValue };
