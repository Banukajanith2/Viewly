import "server-only";

/**
 * Upstash Redis cache (Part 7).
 *
 * Sits in front of Firestore, not in front of the YouTube API. The YouTube budget is
 * already protected by the quota tracker; what this protects is the Firestore free
 * tier of roughly 50,000 reads a day. Every dashboard load reads a snapshot, so
 * without this an active user costs a database read per page view for data that
 * changes once a day.
 *
 * Two rules hold everywhere in this file:
 *
 *  1. Every key is namespaced. The Upstash database is shared with another project,
 *     so an un-prefixed key could collide with something we do not own. For the same
 *     reason there is no flush helper here, and there should never be one.
 *  2. The cache is never allowed to break the app. Upstash being down, misconfigured,
 *     or rate limited degrades to reading Firestore directly. A caching layer that
 *     can take the site offline is worse than no caching layer.
 */
import { Redis } from "@upstash/redis";

/** Namespace for every key this app writes. Never write outside it. */
const PREFIX = "viewly:";

let client: Redis | null | undefined;

/**
 * Returns the client, or null when Upstash is not configured. Null is a supported
 * state, not an error: the app runs correctly without a cache, just with more
 * Firestore reads, which is the right behaviour for local development.
 */
function redis(): Redis | null {
  if (client !== undefined) return client;

  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;

  client = url && token ? new Redis({ url, token }) : null;
  return client;
}

export const isCacheConfigured = (): boolean => redis() !== null;

function namespaced(key: string): string {
  return key.startsWith(PREFIX) ? key : PREFIX + key;
}

export async function get<T>(key: string): Promise<T | null> {
  const r = redis();
  if (!r) return null;

  try {
    return (await r.get<T>(namespaced(key))) ?? null;
  } catch (err) {
    console.warn("[kv] get failed, falling through to source:", describe(err));
    return null;
  }
}

export async function set<T>(key: string, value: T, ttlSeconds: number): Promise<void> {
  const r = redis();
  if (!r) return;

  // A non-positive TTL would mean "no expiry" to Redis, which is the opposite of
  // what a caller passing 0 intends. Skip the write instead of caching forever.
  if (ttlSeconds <= 0) return;

  try {
    await r.set(namespaced(key), value, { ex: Math.floor(ttlSeconds) });
  } catch (err) {
    console.warn("[kv] set failed, continuing uncached:", describe(err));
  }
}

export async function del(key: string): Promise<void> {
  const r = redis();
  if (!r) return;

  try {
    await r.del(namespaced(key));
  } catch (err) {
    console.warn("[kv] del failed:", describe(err));
  }
}

/**
 * Read-through cache.
 *
 * On a miss the loader runs and its result is cached. A loader returning null or
 * undefined is NOT cached: absence is usually the state most likely to change soon,
 * and caching it turns "not synced yet" into "not synced for the next three hours".
 */
export async function cached<T>(
  key: string,
  ttlSeconds: number,
  loader: () => Promise<T | null>,
): Promise<T | null> {
  const hit = await get<T>(key);
  if (hit !== null) return hit;

  const value = await loader();
  if (value !== null && value !== undefined) await set(key, value, ttlSeconds);
  return value;
}

function describe(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/* ------------------------------------------------------------------- keys */

/**
 * Every cache key in the app, declared once. Same reasoning as the Firestore path
 * helpers: a typo in an inline key string is a silent permanent cache miss, which
 * is close to impossible to notice from the outside.
 */
export const cacheKeys = {
  latestSnapshot: (userId: string) => `snapshot:latest:${userId}`,
  nicheCache: (keywordHash: string) => `niche:${keywordHash}`,
  quotaStatus: () => "quota:status",
  retention: (userId: string) => `retention:${userId}`,
  /** Keyed by REGION, not by user: the chart is identical for everyone there. */
  trending: (region: string) => `trending:${region.toUpperCase()}`,
} as const;

/** Dashboard snapshots change once a day, so hours of staleness cost nothing. */
export const TTL = {
  snapshot: 3 * 60 * 60,
  /**
   * Well under the 7 day Firestore TTL. This is only the hot path, and a short
   * window bounds how long a deleted or rewritten niche entry can linger.
   */
  niche: 60 * 60,
  /** Short: this is what tells every user the shared budget is gone. */
  quotaStatus: 60,
  /**
   * Retention diagnostics cost one analytics call per video, so a page load must
   * never trigger them. A day of staleness is the right trade: a retention curve
   * is cumulative over a video's whole life and barely moves between mornings.
   */
  retention: 24 * 60 * 60,
  /**
   * Trending moves through the day but not by the minute, and this is shared by
   * every creator in the region, so three hours keeps it current for a cost of a
   * handful of units a day across the whole app.
   */
  trending: 3 * 60 * 60,
} as const;
