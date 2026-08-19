import { NextResponse } from "next/server";
import {
  addCrossPlatformPost,
  deleteCrossPlatformPost,
  listCrossPlatformPosts,
} from "@/lib/firebase/firestore";
import { validatePost } from "@/lib/insights/cross-platform";
import { jsonError, protectedRoute } from "@/lib/utils/api";

export const runtime = "nodejs";

/**
 * Cross-platform posts (Part 8.5).
 *
 * Manual entry only in v1: no TikTok or Instagram API, so nothing here touches an
 * external service or spends YouTube quota. There is deliberately no rate limiter
 * for that reason, and the firestore.rules entry denies direct client writes so
 * that validatePost is the only way data gets in.
 */

export const GET = protectedRoute("cross-platform/list", async ({ userId }) => {
  return NextResponse.json({ posts: await listCrossPlatformPosts(userId) });
});

export const POST = protectedRoute("cross-platform/create", async ({ userId, request }) => {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonError(400, "invalid_json", "The request body was not valid JSON.");
  }

  const input = body as Record<string, unknown>;
  const result = validatePost({
    platform: String(input.platform ?? ""),
    postedAt: String(input.postedAt ?? ""),
    title: typeof input.title === "string" ? input.title : undefined,
    url: typeof input.url === "string" ? input.url : undefined,
    // Coerced here rather than in validatePost, so the validator keeps a typed
    // contract and this boundary owns the untrusted-input problem.
    views: Number(input.views),
    likes: Number(input.likes),
    comments: Number(input.comments),
  });

  if (!result.ok) {
    return jsonError(400, "invalid_post", result.error);
  }

  const postId = await addCrossPlatformPost(userId, result.value);
  return NextResponse.json({ postId, post: result.value }, { status: 201 });
});

export const DELETE = protectedRoute("cross-platform/delete", async ({ userId, request }) => {
  const postId = new URL(request.url).searchParams.get("postId");
  if (!postId) {
    return jsonError(400, "missing_post_id", "A postId query parameter is required.");
  }

  // Path-scoped to the caller, so there is no way to name another user's document.
  await deleteCrossPlatformPost(userId, postId);
  return NextResponse.json({ deleted: postId });
});
