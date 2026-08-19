/**
 * Prompt construction for title and tag suggestions (Part 8.3).
 *
 * Pure and separate from the API client on purpose: prompts are the part worth
 * testing and iterating on, and they should not require an API key or a network
 * call to exercise. No "server-only", so this runs under plain node.
 */
import type { TrendingVideo, VideoSummary } from "@/types/youtube";
import type { CompetitorCandidate } from "@/types/youtube";

export interface SuggestionContext {
  channelTitle: string;
  /** The creator's own recent uploads, for voice and subject matter. */
  ownVideos: VideoSummary[];
  /** Already-cached competitor results. Part 8.3 must not spend new API calls. */
  competitors: CompetitorCandidate[];
  /** Region chart, when the user has loaded it. */
  trending: TrendingVideo[];
  regionName: string | null;
  /** What the creator wants to make, when they have said. */
  topic?: string;
}

export interface Suggestion {
  title: string;
  reason: string;
}

export interface SuggestionResult {
  titles: Suggestion[];
  tags: string[];
}

/** Caps on how much context is sent, so one call cannot balloon in size. */
const MAX_OWN = 10;
const MAX_COMPETITOR = 8;
const MAX_TRENDING = 10;
const MAX_TITLE_CHARS = 100;

const clean = (s: string) => s.replace(/\s+/g, " ").trim().slice(0, 140);

/**
 * Builds the instruction sent to the model.
 *
 * Written to constrain rather than inspire. A model asked for "engaging YouTube
 * titles" reliably returns clickbait with brackets and emoji, which is a good way
 * to get a creator's channel to look like every content farm. The rules below exist
 * because the default output is bad, not because the model needs encouragement.
 *
 * The creator's own titles are included so suggestions sound like them. Competitor
 * and trending titles are included as evidence of what the niche responds to, and
 * are explicitly labelled as other people's work so the model does not copy them.
 */
export function buildSuggestionPrompt(ctx: SuggestionContext): string {
  const own = ctx.ownVideos
    .slice(0, MAX_OWN)
    .map((v) => `- ${clean(v.title)} (${v.viewCount ?? 0} views)`)
    .join("\n");

  const rivals = ctx.competitors
    .slice(0, MAX_COMPETITOR)
    .flatMap((c) => (c.latestVideo ? [`- ${clean(c.latestVideo.title)}`] : []))
    .join("\n");

  const hot = ctx.trending
    .slice(0, MAX_TRENDING)
    .map((v) => `- ${clean(v.title)}`)
    .join("\n");

  const sections = [
    `You are helping a YouTube creator titled "${clean(ctx.channelTitle)}".`,
    ctx.topic
      ? `They are planning a video about: ${clean(ctx.topic)}`
      : "They have not named a specific topic, so suggest titles for their next video in their established subject area.",
    own ? `Their own recent uploads and view counts:\n${own}` : "",
    rivals ? `Recent uploads from OTHER channels in the same niche (for reference only, do not copy):\n${rivals}` : "",
    hot && ctx.regionName
      ? `Currently trending in ${ctx.regionName} (for reference only, do not copy):\n${hot}`
      : "",
    `Rules:
- Write ${SUGGESTION_COUNT} title options, each under ${MAX_TITLE_CHARS} characters.
- Match the creator's existing voice and subject matter. Do not invent facts about videos that do not exist.
- No clickbait punctuation: no ALL CAPS words, no emoji, no bracketed tags like [MUST WATCH], no "you won't believe".
- Do not promise a result the creator has not said they can deliver.
- Then list 10 to 15 lowercase tags relevant to the channel, most specific first.
- For each title give a short reason grounded in the data above.`,
    `Reply with ONLY valid JSON, no markdown fence, in exactly this shape:
{"titles":[{"title":"...","reason":"..."}],"tags":["...","..."]}`,
  ];

  return sections.filter(Boolean).join("\n\n");
}

export const SUGGESTION_COUNT = 5;

/**
 * Parses the model's reply.
 *
 * Models wrap JSON in markdown fences despite being told not to, and occasionally
 * add a sentence before it. Rather than trusting the instruction, this finds the
 * JSON object and validates the shape, because a malformed reply must produce a
 * clear error rather than a page rendering "undefined".
 */
export function parseSuggestionResponse(raw: string): SuggestionResult | null {
  if (!raw) return null;

  // Strip a markdown fence if one is present, then take the outermost object.
  const unfenced = raw.replace(/^\s*```(?:json)?/i, "").replace(/```\s*$/, "");
  const start = unfenced.indexOf("{");
  const end = unfenced.lastIndexOf("}");
  if (start === -1 || end <= start) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(unfenced.slice(start, end + 1));
  } catch {
    return null;
  }

  const obj = parsed as { titles?: unknown; tags?: unknown };

  const titles: Suggestion[] = Array.isArray(obj.titles)
    ? obj.titles
        .map((t) => {
          const item = t as { title?: unknown; reason?: unknown };
          return {
            title: typeof item.title === "string" ? item.title.trim() : "",
            reason: typeof item.reason === "string" ? item.reason.trim() : "",
          };
        })
        .filter((t) => t.title.length > 0)
    : [];

  const tags: string[] = Array.isArray(obj.tags)
    ? obj.tags
        .filter((t): t is string => typeof t === "string")
        .map((t) => t.trim().toLowerCase())
        .filter((t) => t.length > 0)
    : [];

  // A reply with no usable titles is a failure, not an empty success: showing an
  // empty panel would look like "your channel has no good titles".
  if (titles.length === 0) return null;

  return { titles, tags: [...new Set(tags)] };
}
