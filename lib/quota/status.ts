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
 * In-process cache. The dashboard layout reads this on every page load, and the
 * Firestore free tier is ~50k reads/day, so an uncached read here would spend the
 * database budget to report on the API budget. 60 seconds is well inside the
 * resolution anyone needs from a daily counter.
 *
 * Part 7 replaces this with the shared KV cache so the value is consistent across
 * serverless instances rather than per-instance.
 */
const CACHE_TTL_MS = 60_000;
let cached: { value: QuotaStatus; at: number } | undefined;

export async function getQuotaStatus(): Promise<QuotaStatus> {
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) return cached.value;

  const secondsUntilReset = secondsUntilQuotaReset();
  const resetsAt = new Date(Date.now() + secondsUntilReset * 1000).toISOString();

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

  cached = { value, at: Date.now() };
  return value;
}

/** Clears the memo. Used after a large deliberate spend so the UI updates promptly. */
export function invalidateQuotaStatus(): void {
  cached = undefined;
}
