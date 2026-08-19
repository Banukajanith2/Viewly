import "server-only";

/**
 * Gemini client (Part 8.3).
 *
 * Plain REST rather than @google/generative-ai. One generateContent call needs a
 * fetch and a JSON body, and the project is built to a small-footprint constraint,
 * so a whole SDK for one endpoint is not worth the dependency.
 *
 * GEMINI_API_KEY is server-side only and must never reach the browser, which is why
 * this module starts with "server-only" and the suggestion flow goes through a
 * route handler rather than being called from a component.
 */

/**
 * Models to try, in order, newest first.
 *
 * A CHAIN rather than a single ID, for two reasons both observed while building
 * this. Free-tier flash models return 503 "this model is currently experiencing
 * high demand" under load, and the newest model is the busiest precisely because it
 * is newest. Separately, gemini-2.0-flash was RETIRED under this code mid-build,
 * answering 404 with the name of its replacement. A chain survives both: a busy or
 * retired head falls through to the next entry instead of failing the request.
 *
 * GEMINI_MODEL overrides the head of the chain without losing the fallbacks. To see
 * what is currently available, GET the v1beta/models endpoint with the key in an
 * x-goog-api-key header.
 */
const MODEL_CHAIN: readonly string[] = [
  ...(process.env.GEMINI_MODEL ? [process.env.GEMINI_MODEL] : []),
  "gemini-3.7-flash",
  "gemini-3.6-flash",
  "gemini-3.5-flash",
].filter((m, i, all) => all.indexOf(m) === i);

const ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/models";

/** A slow LLM call must not hold a serverless function open indefinitely. */
const TIMEOUT_MS = 20_000;

export class GeminiUnavailableError extends Error {
  readonly code = "ai_unavailable";
  constructor(message: string) {
    super(message);
    this.name = "GeminiUnavailableError";
  }
}

export function isGeminiConfigured(): boolean {
  return Boolean(process.env.GEMINI_API_KEY);
}

/** One attempt against one model. Null means "try the next model". */
async function tryModel(model: string, prompt: string, key: string): Promise<string | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const res = await fetch(`${ENDPOINT}/${model}:generateContent`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        // Header rather than a query string: a key in the URL ends up in access
        // logs and any proxy in between.
        "x-goog-api-key": key,
      },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          // Low but not zero. At 0 the model returns near-identical titles every
          // run, which makes the button feel broken on a second press.
          temperature: 0.7,
          maxOutputTokens: 4096,
          responseMimeType: "application/json",
          // Thinking OFF, and this is load-bearing rather than a tuning preference.
          // Gemini 3.x flash reasons before answering by default, and those tokens
          // come out of maxOutputTokens AND the clock. At the original 1024 the
          // model spent the whole budget thinking and returned JSON truncated
          // mid-string, which surfaced as an unreadable reply, while other attempts
          // simply ran past the 20s timeout. Disabling it took the same request
          // from a timeout to 2.9 seconds and 310 output tokens. Writing five
          // titles in a fixed JSON shape is a formatting task, not a reasoning one.
          thinkingConfig: { thinkingBudget: 0 },
        },
      }),
      signal: controller.signal,
    });

    if (res.ok) {
      const data = (await res.json()) as {
        candidates?: Array<{
          finishReason?: string;
          content?: { parts?: Array<{ text?: string }> };
        }>;
      };

      // A truncated reply is not a bad model, it is too small a token budget, and
      // it must be named as such. Left generic it looks like the model is broken,
      // and the next person raises the temperature instead of the limit.
      const finish = data.candidates?.[0]?.finishReason;
      if (finish && finish !== "STOP") {
        console.error("[gemini] %s: finishReason %s", model, finish);
        if (finish === "MAX_TOKENS") return null;
      }
      // Only the text parts. Newer models also return a thoughtSignature on the
      // same part, which is not content and must not be concatenated into it.
      const text =
        data.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("") ?? "";

      // An empty body from a 200 is a failed generation, not an answer. Fall
      // through so the next model gets a turn rather than returning nothing.
      return text.trim() ? text : null;
    }

    const body = await res.text().catch(() => "");
    console.error("[gemini] %s: %d %s", model, res.status, body.slice(0, 300));

    // Key-level failures are not model problems. Stop rather than burning the same
    // exhausted allowance, or the same bad key, against every entry in the chain.
    if (res.status === 429) {
      throw new GeminiUnavailableError(
        "The AI suggestion service is rate limited right now. Try again in a few minutes.",
      );
    }
    if (res.status === 401 || res.status === 403) {
      throw new GeminiUnavailableError(
        "The AI suggestion key was rejected. Check GEMINI_API_KEY.",
      );
    }

    // Anything else is a model-level problem, including a 404 for a retired ID.
    // Falling through to the next entry is exactly the right response to both.
    return null;
  } catch (err) {
    if (err instanceof GeminiUnavailableError) throw err;
    if (err instanceof Error && err.name === "AbortError") {
      console.error("[gemini] %s: timed out after %dms", model, TIMEOUT_MS);
      return null;
    }
    console.error("[gemini] %s:", model, err);
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Sends one prompt and returns the raw text reply, walking the model chain.
 *
 * Errors are deliberately coarse to the caller. The upstream body can echo the
 * prompt and, in some failure modes, parts of the request URL, so it is logged
 * server-side and never returned.
 */
export async function generateText(prompt: string): Promise<string> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) {
    throw new GeminiUnavailableError(
      "AI suggestions are not configured on this deployment.",
    );
  }

  for (const model of MODEL_CHAIN) {
    const text = await tryModel(model, prompt, key);
    if (text !== null) return text;
  }

  // Every model refused or was busy. Says so plainly rather than blaming the user.
  throw new GeminiUnavailableError(
    "All AI models are busy right now. Please try again in a few minutes.",
  );
}
