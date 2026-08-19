import { NextResponse } from "next/server";
import { requireUserId } from "@/lib/auth/session";
import { getUserProfile, markDiscoveryRun } from "@/lib/firebase/firestore";
import { assertCanUserSearch } from "@/lib/quota/rate-limiter";
import { discoverCompetitors, NoKeywordsError } from "@/lib/youtube/competitor-engine";
import { handleRouteError, jsonError } from "@/lib/utils/api";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * Development safety valve. With ALLOW_LIVE_SEARCH=false a cache miss returns an
 * empty result instead of spending 100 units, so the pipeline can be exercised end
 * to end without touching the shared budget. Unset means allowed, which is the
 * correct production default.
 */
const allowLiveSearch = process.env.ALLOW_LIVE_SEARCH !== "false";

/**
 * POST /api/competitors/discover (Part 6)
 *
 * Order of operations is the whole point of this route:
 *   1. Authenticate.
 *   2. Check the rate limiter BEFORE any external work. Rejects inside the 7 day
 *      cooldown, or when today's global search budget is near its ceiling.
 *   3. Run the pipeline, which consults the shared niche cache before spending.
 *   4. Record the run so the cooldown starts.
 *
 * The response reports cached versus fresh so the UI can say "last updated 3 days
 * ago, shared with other creators in your niche" rather than implying a live
 * per-user search happened.
 */
export async function POST() {
  try {
    const userId = await requireUserId();

    const profile = await getUserProfile(userId);
    if (!profile?.channelId) {
      return jsonError(
        409,
        "no_channel_linked",
        "Connect a YouTube channel in settings first.",
      );
    }

    // Throws QuotaExceededError, which handleRouteError turns into a 429 carrying
    // a Retry-After hint. Checked before any API call, never after.
    await assertCanUserSearch(userId);

    const result = await discoverCompetitors(userId, profile.channelId, {
      allowLiveSearch,
    });

    const liveSearchSkipped = result.source === "fresh" && !allowLiveSearch;

    // Recorded for a cache hit too: the cooldown protects the keyword-extraction
    // calls as well as search.list, and without it a client could re-run discovery
    // in a loop for 2 units a time.
    //
    // Not recorded when the dev valve suppressed the search, because no discovery
    // actually happened. Starting a 7 day cooldown for a run that produced nothing
    // would be wrong on its own terms, quite apart from making the flow untestable.
    if (!liveSearchSkipped) await markDiscoveryRun(userId);

    return NextResponse.json({
      source: result.source,
      cachedAt: result.cachedAt,
      expiresAt: result.expiresAt,
      keywordHash: result.keywordHash,
      keywords: result.keywords,
      candidateCount: result.candidates.length,
      candidates: result.candidates,
      // True when a miss was not allowed to spend. Lets the UI explain an empty
      // result instead of implying the niche has no competitors.
      liveSearchSkipped,
    });
  } catch (err) {
    if (err instanceof NoKeywordsError) {
      return jsonError(409, err.code, err.message);
    }
    return handleRouteError(err, "competitors/discover");
  }
}
