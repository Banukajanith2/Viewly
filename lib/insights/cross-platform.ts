/**
 * Cross-platform post validation and comparison (Part 8.5).
 *
 * Pure: no "server-only", Firestore or googleapis imports, so it runs under plain
 * node and is safe to import from a client component. The form and the API route
 * share these rules rather than each having their own idea of what a valid entry
 * is, because two copies of a validation rule become two different rules.
 */
import type { CrossPlatformPost } from "@/types/youtube";

export const PLATFORMS = ["tiktok", "instagram", "x", "linkedin", "other"] as const;
export type Platform = (typeof PLATFORMS)[number];

export const PLATFORM_LABELS: Record<Platform, string> = {
  tiktok: "TikTok",
  instagram: "Instagram",
  x: "X",
  linkedin: "LinkedIn",
  other: "Other",
};

/**
 * Upper bound on a single entry's counts.
 *
 * Not a real limit on how far a post can travel, just a typo guard: a creator
 * logging by hand can add a couple of zeros, and one bad row rescales every chart
 * on the page so nothing else is readable. Ten billion is comfortably past the
 * most-viewed post on any platform while still catching a slip.
 */
export const MAX_COUNT = 10_000_000_000;

export interface PostInput {
  platform: string;
  postedAt: string;
  title?: string;
  url?: string;
  views: number;
  likes: number;
  comments: number;
}

export type ValidationResult =
  | { ok: true; value: Omit<CrossPlatformPost, "postId" | "createdAt"> }
  | { ok: false; error: string };

const isPlatform = (v: string): v is Platform => (PLATFORMS as readonly string[]).includes(v);

/** YYYY-MM-DD, and a date that actually exists (rejects 2026-02-31). */
function parseDateOnly(value: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const d = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(d.getTime())) return null;
  // Round-trip check: the Date constructor rolls 02-31 forward to 03-03 rather
  // than failing, so the only reliable test is whether it survives formatting.
  return d.toISOString().slice(0, 10) === value ? d : null;
}

function checkCount(value: unknown, field: string): string | null {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return `${field} must be a number.`;
  }
  if (!Number.isInteger(value)) return `${field} must be a whole number.`;
  if (value < 0) return `${field} cannot be negative.`;
  if (value > MAX_COUNT) return `${field} looks like a typo. Check the zeros.`;
  return null;
}

/**
 * Validates one manually entered post.
 *
 * Returns a message rather than throwing, so the same call can drive an inline
 * form error and an API 400 without either side interpreting an exception.
 */
export function validatePost(input: PostInput, now: Date = new Date()): ValidationResult {
  if (!isPlatform(input.platform)) {
    return { ok: false, error: "Pick one of the supported platforms." };
  }

  const posted = parseDateOnly(input.postedAt);
  if (!posted) return { ok: false, error: "Enter the post date as YYYY-MM-DD." };

  // A future post date is always a mistake, and it would sort above everything
  // real and skew any per-day comparison.
  const endOfToday = new Date(`${now.toISOString().slice(0, 10)}T23:59:59.999Z`);
  if (posted.getTime() > endOfToday.getTime()) {
    return { ok: false, error: "That date is in the future." };
  }

  for (const [field, value] of [
    ["Views", input.views],
    ["Likes", input.likes],
    ["Comments", input.comments],
  ] as const) {
    const err = checkCount(value, field);
    if (err) return { ok: false, error: err };
  }

  const title = input.title?.trim();
  const url = input.url?.trim();

  if (url && !/^https?:\/\/\S+$/i.test(url)) {
    return { ok: false, error: "The link must start with http:// or https://" };
  }

  return {
    ok: true,
    value: {
      platform: input.platform,
      postedAt: posted.toISOString(),
      views: input.views,
      likes: input.likes,
      comments: input.comments,
      // Omitted rather than stored empty: Firestore is configured to ignore
      // undefined, so an absent field stays absent instead of becoming "".
      ...(title ? { title } : {}),
      ...(url ? { url } : {}),
    },
  };
}

export interface PlatformSummary {
  platform: Platform;
  posts: number;
  views: number;
  likes: number;
  comments: number;
  /** Mean views per post, which is what makes platforms comparable at all. */
  averageViews: number;
  /** Likes plus comments as a share of views, or null when there are no views. */
  engagementRate: number | null;
}

/**
 * Per-platform totals.
 *
 * Reports average views per post alongside the total on purpose. A creator who has
 * posted 40 TikToks and 3 Reels will always show a bigger TikTok total, and reading
 * that as "TikTok works better" is exactly the wrong conclusion to draw. The
 * average is the comparable number; the total is context.
 */
export function summariseByPlatform(posts: CrossPlatformPost[]): PlatformSummary[] {
  const byPlatform = new Map<Platform, CrossPlatformPost[]>();

  for (const post of posts) {
    if (!isPlatform(post.platform)) continue;
    const list = byPlatform.get(post.platform) ?? [];
    list.push(post);
    byPlatform.set(post.platform, list);
  }

  return [...byPlatform.entries()]
    .map(([platform, list]) => {
      const views = list.reduce((a, p) => a + p.views, 0);
      const likes = list.reduce((a, p) => a + p.likes, 0);
      const comments = list.reduce((a, p) => a + p.comments, 0);
      return {
        platform,
        posts: list.length,
        views,
        likes,
        comments,
        averageViews: list.length ? views / list.length : 0,
        engagementRate: views > 0 ? (likes + comments) / views : null,
      };
    })
    .sort((a, b) => b.averageViews - a.averageViews);
}
