import "server-only";

/**
 * Rate limiting (Part 4).
 *
 * Two different jobs, deliberately kept separate:
 *
 *  1. Protect the SHARED YouTube Data API budget. search.list costs 100 of ~10,000
 *     daily units for the whole app, so one enthusiastic user could exhaust the day
 *     for everyone. Guarded by a 7 day per-user discovery cooldown plus a global
 *     80% safety ceiling.
 *  2. Protect against runaway client-side polling of the Analytics API, which has
 *     its own quota and its own ways to be abused. Guarded by a per-user daily cap.
 *
 * Each check has three shapes:
 *   check*  returns a structured result (use when you want to branch on the reason)
 *   can*    returns a boolean (use for simple gating and tests)
 *   assert* throws QuotaExceededError (use in route handlers, caught into a 429)
 */
import { getUserProfile } from "@/lib/firebase/firestore";
import {
  getGlobalUsageToday,
  getUserUsageToday,
  hasSearchBudget,
  secondsUntilQuotaReset,
} from "@/lib/quota/tracker";

export const DISCOVERY_COOLDOWN_DAYS = Number(
  process.env.DISCOVERY_COOLDOWN_DAYS ?? 7,
);

export const ANALYTICS_DAILY_CAP = Number(process.env.ANALYTICS_DAILY_CAP ?? 50);

const DAY_MS = 24 * 60 * 60 * 1000;

export type RateLimitReason =
  | "discovery_cooldown"
  | "global_search_budget"
  | "analytics_daily_cap";

export type RateLimitResult =
  | { allowed: true }
  | {
      allowed: false;
      reason: RateLimitReason;
      message: string;
      /** Seconds the caller should wait. Feeds the Retry-After header. */
      retryAfterSeconds: number;
    };

export class QuotaExceededError extends Error {
  readonly reason: RateLimitReason;
  readonly retryAfterSeconds: number;

  constructor(reason: RateLimitReason, message: string, retryAfterSeconds: number) {
    super(message);
    this.name = "QuotaExceededError";
    this.reason = reason;
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

/* ------------------------------------------------------ competitor search */

/**
 * Gate for anything that spends search.list.
 *
 * Checks the cheap per-user condition before the global one so the common
 * rejection costs a single Firestore read, and reports the cooldown as the reason
 * even when the global budget is also low, since that is the actionable message.
 */
export async function checkUserSearch(userId: string): Promise<RateLimitResult> {
  const profile = await getUserProfile(userId);

  if (profile?.lastDiscoveryRunAt) {
    const elapsed = Date.now() - new Date(profile.lastDiscoveryRunAt).getTime();
    const cooldown = DISCOVERY_COOLDOWN_DAYS * DAY_MS;

    if (elapsed < cooldown) {
      const retryAfterSeconds = Math.ceil((cooldown - elapsed) / 1000);
      return {
        allowed: false,
        reason: "discovery_cooldown",
        message:
          `Competitor discovery runs once every ${DISCOVERY_COOLDOWN_DAYS} days. ` +
          `Next run available in ${Math.ceil(retryAfterSeconds / 3600)} hours. ` +
          "Your existing results are still on the competitors page.",
        retryAfterSeconds,
      };
    }
  }

  const globalUsage = await getGlobalUsageToday();
  if (!hasSearchBudget(globalUsage)) {
    return {
      allowed: false,
      reason: "global_search_budget",
      message:
        "Viewly's shared daily YouTube search budget is nearly used up. " +
        "Discovery reopens after the quota resets at midnight UTC.",
      retryAfterSeconds: secondsUntilQuotaReset(),
    };
  }

  return { allowed: true };
}

export async function canUserSearch(userId: string): Promise<boolean> {
  return (await checkUserSearch(userId)).allowed;
}

export async function assertCanUserSearch(userId: string): Promise<void> {
  const result = await checkUserSearch(userId);
  if (!result.allowed) {
    throw new QuotaExceededError(result.reason, result.message, result.retryAfterSeconds);
  }
}

/* ------------------------------------------------------------- analytics */

export async function checkUserAnalytics(userId: string): Promise<RateLimitResult> {
  const usage = await getUserUsageToday(userId);

  if (usage.reportsQueryCalls >= ANALYTICS_DAILY_CAP) {
    return {
      allowed: false,
      reason: "analytics_daily_cap",
      message:
        `You have hit today's limit of ${ANALYTICS_DAILY_CAP} analytics refreshes. ` +
        "Dashboard data still loads from this morning's cached snapshot.",
      retryAfterSeconds: secondsUntilQuotaReset(),
    };
  }

  return { allowed: true };
}

export async function canUserCallAnalytics(userId: string): Promise<boolean> {
  return (await checkUserAnalytics(userId)).allowed;
}

export async function assertCanUserCallAnalytics(userId: string): Promise<void> {
  const result = await checkUserAnalytics(userId);
  if (!result.allowed) {
    throw new QuotaExceededError(result.reason, result.message, result.retryAfterSeconds);
  }
}
