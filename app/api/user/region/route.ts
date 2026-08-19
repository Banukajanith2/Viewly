import { NextResponse } from "next/server";
import { setHomeRegion } from "@/lib/firebase/firestore";
import { isSupportedRegion } from "@/lib/youtube/regions";
import { jsonError, protectedRoute } from "@/lib/utils/api";

export const runtime = "nodejs";

/**
 * PUT /api/user/region
 *
 * Sets the creator's home region (Part 8.2), which then applies to trending and
 * keyword-suggestion queries.
 *
 * Validated against the supported list rather than accepting any two letters: an
 * unsupported regionCode makes the YouTube call fail at request time, which would
 * spend a unit to learn something checkable for free.
 */
export const PUT = protectedRoute("user/region", async ({ userId, request }) => {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonError(400, "invalid_json", "The request body was not valid JSON.");
  }

  const region = String((body as Record<string, unknown>)?.region ?? "");

  if (!isSupportedRegion(region)) {
    return jsonError(
      400,
      "unsupported_region",
      "That region is not one YouTube reports a trending chart for.",
    );
  }

  await setHomeRegion(userId, region);
  return NextResponse.json({ region: region.toUpperCase() });
});
