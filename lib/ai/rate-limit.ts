import "server-only";

/**
 * Per-user daily cap on AI suggestion calls (Part 8.3).
 *
 * Kept apart from lib/quota/rate-limiter.ts deliberately. That file guards the
 * YouTube Data API's 10,000 unit budget, and an LLM call spends none of it. Folding
 * the two together would invite someone to reason about one budget while changing
 * the other.
 *
 * The brief asks for suggestions to be an explicit action rather than a background
 * job specifically to control LLM call volume. This is the enforcement of that.
 */
import { cacheKeys, increment, isCacheConfigured } from "@/lib/cache/kv";
import { QuotaExceededError } from "@/lib/quota/rate-limiter";
import { secondsUntilQuotaReset } from "@/lib/quota/tracker";

export const AI_SUGGESTIONS_DAILY_CAP = Number(process.env.AI_SUGGESTIONS_DAILY_CAP ?? 10);

const todayUtc = () => new Date().toISOString().slice(0, 10);

/**
 * Counts this attempt and throws when the user is over the cap.
 *
 * Fails CLOSED when the counter is unavailable. A cap that cannot be counted is not
 * a cap, and the alternative reading, that an unreachable cache should grant
 * unlimited LLM calls, gets the safety property exactly backwards. Upstash is
 * already a hard dependency of Part 7, so this is not a new one.
 *
 * Counted BEFORE the call rather than after, which is the opposite of the YouTube
 * tracker's rule. There the concern is not charging for a call that failed; here the
 * concern is that a request which reaches Google has already consumed the free
 * tier's allowance whether or not we liked the answer.
 */
export async function assertCanRequestSuggestions(userId: string): Promise<number> {
  if (!isCacheConfigured()) {
    throw new QuotaExceededError(
      "ai_cap_unavailable",
      "AI suggestions are unavailable because the rate limiter is not reachable.",
      secondsUntilQuotaReset(),
    );
  }

  const used = await increment(cacheKeys.aiSuggestions(userId, todayUtc()), 24 * 60 * 60);

  if (used === null) {
    throw new QuotaExceededError(
      "ai_cap_unavailable",
      "AI suggestions are unavailable because the rate limiter is not reachable.",
      secondsUntilQuotaReset(),
    );
  }

  if (used > AI_SUGGESTIONS_DAILY_CAP) {
    throw new QuotaExceededError(
      "ai_daily_cap",
      `You have used today's ${AI_SUGGESTIONS_DAILY_CAP} AI suggestions. This resets at midnight UTC.`,
      secondsUntilQuotaReset(),
    );
  }

  return AI_SUGGESTIONS_DAILY_CAP - used;
}
