import "server-only";

/**
 * App-wide quota status, for telling every user at once that a shared limit is gone.
 *
 * The YouTube budget is shared by the whole app, so when it runs out it runs out for
 * everyone, not just the person who spent it. Without this, the tenth creator of the
 * day gets an unexplained failure on a button that worked yesterday.
 *
 * Deliberately coarse. Exact remaining units are never returned to a client:
 * publishing "1,400 units left" tells an abuser exactly how much room is available
 * and exactly when the app is weakest. A level and a reset time are all the UI needs.
 */
import {
  DAILY_QUOTA_UNITS,
  getGlobalUsageToday,
  hasSearchBudget,
  secondsUntilQuotaReset,
} from "@/lib/quota/tracker";
import { TTL, cacheKeys, del as cacheDel, get as cacheGet, set as cacheSet } from "@/lib/cache/kv";

export type QuotaLevel = "ok" | "low" | "exhausted";

export interface QuotaStatus {
  level: QuotaLevel;
  /** Whether competitor discovery can run at all right now. */
  searchAvailable: boolean;
  /** ISO timestamp of the next UTC midnight reset. */
  resetsAt: string;
  secondsUntilReset: number;
}

/** Below this share of the budget remaining, warn but keep working. */
const LOW_THRESHOLD = 0.15;

/** Below this, treat the day as spent. */
const EXHAUSTED_THRESHOLD = 0.02;

/**
 * Cached in KV rather than in process (Part 7). The dashboard layout reads this on
 * every page load, and the Firestore free tier is ~50k reads/day, so an uncached
 * read here would spend the database budget to report on the API budget.
 *
 * Shared rather than per-instance matters for the message itself: with a per-process
 * memo, two serverless instances could disagree about whether the budget is gone, so
 * one user is told the limit is reached while another is not. A shared cache means
 * everyone sees the same answer, which is the entire point of an app-wide notice.
 *
 * The reset time is recomputed on read rather than cached, so a value stored 59
 * seconds ago still counts down correctly.
 */
export async function getQuotaStatus(): Promise<QuotaStatus> {
  const secondsUntilReset = secondsUntilQuotaReset();
  const resetsAt = new Date(Date.now() + secondsUntilReset * 1000).toISOString();

  const hit = await cacheGet<Pick<QuotaStatus, "level" | "searchAvailable">>(
    cacheKeys.quotaStatus(),
  );
  if (hit) return { ...hit, resetsAt, secondsUntilReset };

  return computeQuotaStatus(secondsUntilReset, resetsAt);
}

async function computeQuotaStatus(
  secondsUntilReset: number,
  resetsAt: string,
): Promise<QuotaStatus> {
  let value: QuotaStatus;
  try {
    const usage = await getGlobalUsageToday();
    const remainingShare = Math.max(0, 1 - usage.totalUnits / DAILY_QUOTA_UNITS);

    const level: QuotaLevel =
      remainingShare <= EXHAUSTED_THRESHOLD
        ? "exhausted"
        : remainingShare <= LOW_THRESHOLD
          ? "low"
          : "ok";

    value = {
      level,
      searchAvailable: hasSearchBudget(usage),
      resetsAt,
      secondsUntilReset,
    };
  } catch {
    // A ledger read failure must not take the dashboard down. Assume healthy and
    // let the route-level rate limiters be the real enforcement, which they are.
    value = { level: "ok", searchAvailable: true, resetsAt, secondsUntilReset };
  }

  // Only the derived judgement is cached, never the raw counts.
  await cacheSet(
    cacheKeys.quotaStatus(),
    { level: value.level, searchAvailable: value.searchAvailable },
    TTL.quotaStatus,
  );
  return value;
}

/**
 * Clears the cached judgement. Called after a large deliberate spend so the banner
 * appears promptly rather than up to a minute later.
 */
export async function invalidateQuotaStatus(): Promise<void> {
  await cacheDel(cacheKeys.quotaStatus());
}
