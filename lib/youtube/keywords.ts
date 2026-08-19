/**
 * Pure keyword and scoring logic for competitor discovery (Part 6, steps 1 and 4).
 *
 * Deliberately free of "server-only", Firestore and googleapis imports. This is the
 * part of the engine whose correctness is not obvious by reading it: the hash
 * decides whether two creators share a cached discovery run, and a subtly
 * order-dependent or unstable hash would silently turn every lookup into a 100 unit
 * cache miss. Keeping it dependency-free means it can be exercised directly.
 */
import { createHash } from "node:crypto";
import type { VideoSummary } from "@/types/youtube";

/** A video beating its own channel's average by this much is a breakout. */
export const BREAKOUT_MULTIPLIER = 2.5;

/**
 * Words too common to identify a niche. Without this, title-derived keywords produce
 * hashes that collide across unrelated channels, which would serve one niche's
 * competitors to another.
 */
const STOP_WORDS = new Set([
  // Common words of any length.
  "the", "and", "but", "for", "with", "from", "into", "onto", "are", "was",
  "were", "been", "this", "that", "these", "those", "its", "how", "why",
  "what", "when", "where", "who", "you", "your", "youre", "our", "their",
  "does", "did", "can", "will", "just", "get", "got", "new", "best", "top",
  "video", "videos", "shorts", "part", "episode", "full", "official", "watch",
  "subscribe", "like", "channel", "tutorial", "guide", "review", "make",
  // Two-letter words. The minimum token length is 2 so that real topics such as
  // js, ai, ml, ui, ux and c# survive, which means the common two-letter English
  // words have to be excluded explicitly here instead.
  "an", "or", "to", "of", "in", "on", "at", "by", "is", "be", "it", "as", "we",
  "my", "me", "do", "so", "if", "no", "up", "us", "he", "am", "id", "im", "ok",
  "vs", "ep", "re", "ve", "ll", "st", "nd", "rd", "th",
]);

/**
 * Lowercase, strip punctuation, drop stop words and very short tokens, dedupe, sort.
 *
 * The sort is what makes the resulting hash order-independent, so two creators whose
 * videos yield the same keywords in a different order land on the same cache entry.
 * That is the difference between sharing a cached result and each paying 100 units.
 *
 * `+` and `#` survive tokenisation on purpose, so "c++" and "c#" stay distinct
 * topics rather than collapsing into "c".
 *
 * The minimum length is 2, not 3. A length-3 floor silently deleted js, ai, ml, ui
 * and c#, which for a creator tool are often the single most identifying term in a
 * niche. Two-letter English filler is excluded through STOP_WORDS instead, which is
 * a list we control rather than a blunt rule we do not.
 */
export function normalizeKeywords(raw: string[]): string[] {
  const seen = new Set<string>();

  for (const entry of raw) {
    for (const token of entry.toLowerCase().split(/[^a-z0-9+#]+/)) {
      // Creators often write tags as hashtags. "#art" and "art" are the same topic,
      // and leaving the hash on would split one niche into two cache entries. Only a
      // LEADING hash is stripped, so "c#" keeps its trailing one.
      const word = token.trim().replace(/^#+/, "");
      if (word.length < 2 || word.length > 30) continue;
      if (STOP_WORDS.has(word)) continue;
      if (/^\d+$/.test(word)) continue; // bare numbers carry no topic signal
      seen.add(word);
    }
  }

  return [...seen].sort();
}

/** SHA-256 of the joined, lowercased keywords. Stable across processes and deploys. */
export function hashKeywords(keywords: string[]): string {
  return createHash("sha256").update(keywords.join(" ").toLowerCase()).digest("hex");
}

/**
 * Keywords from the user's top N most-viewed recent uploads.
 *
 * Sorting by views before taking the top N matters: a creator's most recent uploads
 * are not necessarily representative, but their best performing ones describe the
 * niche they actually compete in.
 */
export function extractKeywords(videos: VideoSummary[], limit = 10): string[] {
  return normalizeKeywords(topVideoStrings(videos, limit));
}

/**
 * Terms ranked by how often they occur across the sampled uploads, most frequent
 * first, ties broken alphabetically so the result is deterministic.
 *
 * This exists because the query and the hash want opposite orderings. The hash needs
 * a SORTED set, since sorting is what makes it order-independent and therefore
 * shareable. A query built from that same sorted set is alphabetical, which is
 * arbitrary: on a channel whose tags are hashtags, every "#" term sorts ahead of
 * every letter, so the query would be five hashtags picked by nothing but ASCII.
 * Frequency is the signal that actually describes what the channel is about.
 */
export interface RankedKeyword {
  keyword: string;
  /** How many source strings the term appeared in. */
  count: number;
}

/**
 * The same ranking, with the counts kept.
 *
 * The keyword inspector shows how often each term is used, and a bare ordering
 * cannot answer that. Ranking lives here once and rankKeywordsByFrequency drops the
 * counts, rather than two functions each deciding what "most frequent" means.
 */
export function rankKeywordsWithCounts(raw: string[]): RankedKeyword[] {
  const counts = new Map<string, number>();

  for (const entry of raw) {
    // Count each keyword once per source string, so a word repeated inside one
    // title does not outrank a word appearing across many videos.
    for (const word of normalizeKeywords([entry])) {
      counts.set(word, (counts.get(word) ?? 0) + 1);
    }
  }

  return [...counts.entries()]
    .sort((a, b) => (b[1] - a[1]) || a[0].localeCompare(b[0]))
    .map(([keyword, count]) => ({ keyword, count }));
}

export function rankKeywordsByFrequency(raw: string[]): string[] {
  return rankKeywordsWithCounts(raw).map((k) => k.keyword);
}

/**
 * Ranked terms straight from a set of uploads, counts included.
 *
 * Uses the same top-N-by-views sample as extractSearchTerms, so the inspector shows
 * the terms discovery would actually search on rather than a different list.
 */
export function rankVideoKeywords(videos: VideoSummary[], limit = 10): RankedKeyword[] {
  return rankKeywordsWithCounts(topVideoStrings(videos, limit));
}

/** Raw title and tag strings from the top N most-viewed uploads. */
function topVideoStrings(videos: VideoSummary[], limit: number): string[] {
  const top = [...videos]
    .sort((a, b) => (b.viewCount ?? 0) - (a.viewCount ?? 0))
    .slice(0, limit);

  const raw: string[] = [];
  for (const video of top) {
    raw.push(video.title);
    if (video.tags?.length) raw.push(...video.tags);
  }
  return raw;
}

/**
 * The terms handed to search.list, most representative first. Full keyword lists are
 * too long and too specific to match anything, so only the leading terms are used.
 */
export function extractSearchTerms(videos: VideoSummary[], limit = 10, terms = 5): string[] {
  return rankKeywordsByFrequency(topVideoStrings(videos, limit)).slice(0, terms);
}

export function buildSearchQuery(terms: string[], limit = 5): string {
  return terms.slice(0, limit).join(" ");
}

/**
 * A video outrunning its own channel's average, not an absolute view threshold.
 * Comparing against the channel's own baseline is what makes this meaningful for a
 * 2,000 subscriber channel and a 200,000 subscriber one alike.
 */
export function scoreBreakout(latestViews: number, channelAverageViews: number): boolean {
  if (channelAverageViews <= 0) return false;
  return latestViews > channelAverageViews * BREAKOUT_MULTIPLIER;
}

/**
 * Whole days since a video was published. Negative clock skew is clamped to 0.
 */
export function daysSincePublished(publishedAt: string, now: Date = new Date()): number {
  const ms = now.getTime() - new Date(publishedAt).getTime();
  return Math.max(0, Math.floor(ms / 86_400_000));
}

/**
 * Whether a channel has gone quiet for long enough to stop being a competitor.
 *
 * The subscriber band alone is not enough. A real discovery run returned channels
 * whose most recent upload was from 2021: correctly sized, entirely irrelevant. You
 * cannot compete with someone who left. Staleness is only knowable after fetching a
 * candidate's uploads, so this filters at scoring time rather than before.
 */
export function isStaleChannel(
  latestPublishedAt: string,
  maxDays: number,
  now: Date = new Date(),
): boolean {
  return daysSincePublished(latestPublishedAt, now) > maxDays;
}

/**
 * Latest video views divided by hours since publication.
 *
 * Floored at one hour: a video published minutes ago would otherwise divide by a
 * near-zero denominator and report an absurd velocity.
 */
export function viewVelocity(video: VideoSummary, now: Date = new Date()): number {
  const hours = Math.max(
    1,
    (now.getTime() - new Date(video.publishedAt).getTime()) / 3_600_000,
  );
  return (video.viewCount ?? 0) / hours;
}
