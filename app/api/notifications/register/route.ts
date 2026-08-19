import { NextResponse } from "next/server";
import {
  countFcmTokens,
  deleteFcmTokenByValue,
  saveFcmToken,
} from "@/lib/firebase/firestore";
import { jsonError, protectedRoute } from "@/lib/utils/api";

export const runtime = "nodejs";

/**
 * Push registration (Part 8.4).
 *
 * The browser obtains an FCM token and posts it here rather than writing it to
 * Firestore directly. firestore.rules denies clients both read and write on
 * fcm_tokens because a registration token is a capability: anyone holding one can
 * push to that device through this project.
 */

/** Bounds an untrusted string before it is stored. FCM tokens run ~150-200 chars. */
const MAX_TOKEN_LENGTH = 4096;

export const POST = protectedRoute("notifications/register", async ({ userId, request }) => {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonError(400, "invalid_json", "The request body was not valid JSON.");
  }

  const token = (body as Record<string, unknown>)?.token;
  if (typeof token !== "string" || !token.trim() || token.length > MAX_TOKEN_LENGTH) {
    return jsonError(400, "invalid_token", "A valid registration token is required.");
  }

  const userAgent = request.headers.get("user-agent")?.slice(0, 200) ?? undefined;
  await saveFcmToken(userId, token.trim(), userAgent);

  return NextResponse.json({ registered: true, devices: await countFcmTokens(userId) });
});

export const DELETE = protectedRoute("notifications/unregister", async ({ userId, request }) => {
  const token = new URL(request.url).searchParams.get("token");
  if (!token) {
    return jsonError(400, "missing_token", "A token query parameter is required.");
  }

  await deleteFcmTokenByValue(userId, token);
  return NextResponse.json({ registered: false, devices: await countFcmTokens(userId) });
});
