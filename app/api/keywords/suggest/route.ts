import { NextResponse } from "next/server";
import { getLatestSnapshot, getNicheCache, getUserProfile } from "@/lib/firebase/firestore";
import { extractKeywords, hashKeywords } from "@/lib/youtube/keywords";
import { resolveRegion, regionName } from "@/lib/youtube/regions";
import { cacheKeys, get as cacheGet } from "@/lib/cache/kv";
import { GeminiUnavailableError, generateText, isGeminiConfigured } from "@/lib/ai/gemini";
import { buildSuggestionPrompt, parseSuggestionResponse } from "@/lib/ai/prompt";
import { assertCanRequestSuggestions } from "@/lib/ai/rate-limit";
import { jsonError, protectedRoute } from "@/lib/utils/api";
import type { TrendingVideo } from "@/types/youtube";

export const runtime = "nodejs";

/**
 * POST /api/keywords/suggest
 *
 * Title and tag suggestions (Part 8.3).
 *
 * Spends NO YouTube quota. Every input is already cached: the daily snapshot, the
 * shared niche cache from Part 6, and the regional trending cache from Part 8.2.
 * The brief is explicit that this must not trigger new API calls, and it does not.
 */
export const POST = protectedRoute("keywords/suggest", async ({ userId, request }) => {
  if (!isGeminiConfigured()) {
    return jsonError(
      503,
      "ai_not_configured",
      "AI suggestions are not set up on this deployment. Add a GEMINI_API_KEY to enable them.",
    );
  }

  let topic: string | undefined;
  try {
    const body = (await request.json()) as { topic?: unknown };
    if (typeof body?.topic === "string" && body.topic.trim()) {
      // Bounded: this goes into a prompt, and an unbounded string is both a cost
      // problem and the obvious lever for prompt injection.
      topic = body.topic.trim().slice(0, 200);
    }
  } catch {
    // A body is optional; suggestions work from the channel alone.
  }

  const [profile, snapshot] = await Promise.all([
    getUserProfile(userId),
    getLatestSnapshot(userId),
  ]);

  if (!profile?.channelId || !snapshot) {
    return jsonError(
      409,
      "no_channel_data",
      "Viewly needs a synced channel before it can suggest anything.",
    );
  }

  const ownVideos = snapshot.recentVideos;
  if (ownVideos.length === 0) {
    return jsonError(
      409,
      "no_uploads",
      "Suggestions are built from your existing videos. Publish something first.",
    );
  }

  // Counted before the call: a request that reaches Google has already spent the
  // free tier's allowance whether or not the answer is usable.
  const remaining = await assertCanRequestSuggestions(userId);

  const keywords = extractKeywords(ownVideos);
  const region = resolveRegion(profile.homeRegion, snapshot.channel.country);

  const [niche, trending] = await Promise.all([
    keywords.length ? getNicheCache(hashKeywords(keywords)) : Promise.resolve(null),
    cacheGet<{ videos: TrendingVideo[] }>(cacheKeys.trending(region)),
  ]);

  const prompt = buildSuggestionPrompt({
    channelTitle: snapshot.channel.title,
    ownVideos,
    competitors: niche?.results ?? [],
    trending: trending?.videos ?? [],
    regionName: regionName(region),
    topic,
  });

  try {
    const raw = await generateText(prompt);
    const parsed = parseSuggestionResponse(raw);

    if (!parsed) {
      // A reply we cannot read is a failure, not an empty result: rendering an
      // empty panel would read as "your channel has no good titles".
      console.error("[keywords/suggest] unparseable reply:", raw.slice(0, 500));
      return jsonError(
        502,
        "ai_unreadable",
        "The AI returned something Viewly could not read. Please try again.",
      );
    }

    return NextResponse.json({
      ...parsed,
      remainingToday: remaining,
      usedTrending: (trending?.videos.length ?? 0) > 0,
      usedCompetitors: (niche?.results.length ?? 0) > 0,
    });
  } catch (err) {
    if (err instanceof GeminiUnavailableError) {
      return jsonError(503, err.code, err.message);
    }
    throw err;
  }
});
