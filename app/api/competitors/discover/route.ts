import { NextResponse } from "next/server";
import { getUserProfile, markDiscoveryRun } from "@/lib/firebase/firestore";
import { invalidateQuotaStatus } from "@/lib/quota/status";
import { discoverCompetitors, NoKeywordsError } from "@/lib/youtube/competitor-engine";
import { jsonError, protectedRoute } from "@/lib/utils/api";

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
 * The only route in the app that can reach search.list, at 100 units of a ~10,000
 * unit budget shared by every user. `rateLimit: "search"` on the wrapper is what
 * enforces the 7 day cooldown and the global safety ceiling, and it runs before this
 * handler is entered, so no external work can happen ahead of the check.
 *
 * The response reports cached versus fresh so the UI can say "last updated 3 days
 * ago, shared with other creators in your niche" rather than implying a live
 * per-user search took place.
 */
export const POST = protectedRoute(
  "competitors/discover",
  async ({ userId }) => {
    const profile = await getUserProfile(userId);
    if (!profile?.channelId) {
      return jsonError(409, "no_channel_linked", "Connect a YouTube channel in settings first.");
    }

    let result;
    try {
      result = await discoverCompetitors(userId, profile.channelId, { allowLiveSearch });
    } catch (err) {
      // A channel with nothing published is a normal state for a new creator, not a
      // failure, so it gets its own actionable message rather than a generic 500.
      if (err instanceof NoKeywordsError) return jsonError(409, err.code, err.message);
      throw err;
    }

    const liveSearchSkipped = result.source === "fresh" && !allowLiveSearch;

    // Recorded for a cache hit too: the cooldown protects the keyword-extraction
    // calls as well as search.list, and without it a client could re-run discovery
    // in a loop for 2 units a time.
    //
    // Not recorded when the dev valve suppressed the search, because no discovery
    // actually happened. Starting a 7 day cooldown for a run that produced nothing
    // would be wrong on its own terms, quite apart from making the flow untestable.
    if (!liveSearchSkipped) await markDiscoveryRun(userId);

    // A fresh run just spent ~112 units in one go, easily enough to move the app
    // into its warning band. Drop the cached status so the banner reflects reality
    // now rather than up to a minute from now.
    if (result.source === "fresh" && !liveSearchSkipped) await invalidateQuotaStatus();

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
  },
  { rateLimit: "search" },
);
