import { NextResponse } from "next/server";
import { getUserProfile, setTrackedCompetitors } from "@/lib/firebase/firestore";
import { jsonError, protectedRoute } from "@/lib/utils/api";

export const runtime = "nodejs";

/**
 * Which competitors a user gets breakout alerts for (Part 8.4).
 *
 * Capped, because the list drives a per-user, per-competitor notification loop in
 * the cron. An unbounded list would let one account turn a daily job into an
 * arbitrarily long one for everybody.
 */
const MAX_TRACKED = 25;

export const PUT = protectedRoute("competitors/track", async ({ userId, request }) => {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonError(400, "invalid_json", "The request body was not valid JSON.");
  }

  const raw = (body as Record<string, unknown>)?.channelId;
  const tracked = (body as Record<string, unknown>)?.tracked;

  if (typeof raw !== "string" || !/^UC[\w-]{22}$/.test(raw)) {
    return jsonError(400, "invalid_channel_id", "A valid YouTube channel ID is required.");
  }
  if (typeof tracked !== "boolean") {
    return jsonError(400, "invalid_tracked", "The tracked field must be true or false.");
  }

  const profile = await getUserProfile(userId);
  const current = new Set(profile?.trackedCompetitorIds ?? []);

  if (tracked) {
    if (!current.has(raw) && current.size >= MAX_TRACKED) {
      return jsonError(
        400,
        "too_many_tracked",
        `You can track up to ${MAX_TRACKED} competitors. Untrack one first.`,
      );
    }
    current.add(raw);
  } else {
    current.delete(raw);
  }

  await setTrackedCompetitors(userId, [...current]);
  return NextResponse.json({ tracked: [...current] });
});
