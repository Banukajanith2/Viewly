"use client";

import { toast } from "sonner";
import { formatRetryAfter } from "@/lib/utils/formatters";

/**
 * Client-side fetch wrapper that turns the app's typed error responses into toasts.
 *
 * Every route returns the same shape on failure (see lib/utils/api.ts), so handling
 * it once here means a rate-limit rejection surfaces as a readable explanation
 * everywhere, rather than each call site inventing its own message or, worse,
 * failing silently. A 429 is the case that matters: the shared budget is a normal
 * operating condition of this app, not an exception.
 */

export interface ApiErrorPayload {
  error: string;
  message: string;
  retryAfter?: number;
}

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly retryAfter?: number;

  constructor(status: number, payload: ApiErrorPayload) {
    super(payload.message);
    this.name = "ApiError";
    this.status = status;
    this.code = payload.error;
    this.retryAfter = payload.retryAfter;
  }
}

/** Reasons that mean a shared limit was hit rather than something being broken. */
const SHARED_LIMIT_CODES = new Set(["global_search_budget", "discovery_cooldown"]);

export interface FetchJsonOptions extends RequestInit {
  /** Set false to handle errors entirely at the call site. */
  toastOnError?: boolean;
}

export async function fetchJson<T>(
  input: string,
  { toastOnError = true, ...init }: FetchJsonOptions = {},
): Promise<T> {
  let res: Response;
  try {
    res = await fetch(input, init);
  } catch {
    if (toastOnError) {
      toast.error("Network problem", { description: "Check your connection and retry." });
    }
    throw new ApiError(0, { error: "network", message: "Request failed to send." });
  }

  if (res.ok) return (await res.json()) as T;

  const payload: ApiErrorPayload = await res
    .json()
    .catch(() => ({ error: "unknown", message: "Something went wrong." }));

  if (toastOnError) showErrorToast(res.status, payload);
  throw new ApiError(res.status, payload);
}

function showErrorToast(status: number, payload: ApiErrorPayload) {
  if (status === 429) {
    const wait = payload.retryAfter
      ? ` Try again ${formatRetryAfter(payload.retryAfter)}.`
      : "";

    // A shared-budget rejection is nobody's fault, so it reads as information.
    // A personal cooldown is also expected. Neither should look like a crash.
    toast.warning(
      SHARED_LIMIT_CODES.has(payload.error) && payload.error === "global_search_budget"
        ? "Daily limit reached for everyone"
        : "Limit reached",
      { description: payload.message + wait, duration: 10_000 },
    );
    return;
  }

  if (status === 401) {
    toast.error("Signed out", { description: "Sign in again to continue." });
    return;
  }

  if (status === 403 && payload.error === "youtube_not_linked") {
    toast.error("YouTube not connected", {
      description: "Connect your channel in settings first.",
    });
    return;
  }

  toast.error("Something went wrong", { description: payload.message });
}
