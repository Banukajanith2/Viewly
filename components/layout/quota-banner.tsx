"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { formatRetryAfter } from "@/lib/utils/formatters";
import type { QuotaStatus } from "@/lib/quota/status";

/**
 * App-wide banner shown when the shared YouTube budget is low or gone.
 *
 * The budget belongs to the whole app rather than to one account, so when it runs
 * out it runs out for everybody at once. Announcing it up front is the difference
 * between "this app is broken" and "this resets in four hours".
 *
 * Rendered from the dashboard layout, so it appears on every signed-in page.
 */
export function QuotaBanner({ status }: { status: QuotaStatus }) {
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (status.level !== "exhausted") return;

    // One toast per browser session, so navigating between pages does not nag.
    // The banner below stays put regardless, which is the persistent signal.
    const key = "viewly-quota-toast-" + status.resetsAt.slice(0, 13);
    if (sessionStorage.getItem(key)) return;
    sessionStorage.setItem(key, "1");

    toast.warning("Daily YouTube limit reached", {
      description:
        "Viewly shares one API budget across everyone using it, and today's is " +
        `spent. Live lookups resume ${formatRetryAfter(status.secondsUntilReset)}. ` +
        "Your dashboard still works from this morning's saved data.",
      duration: 10_000,
    });
  }, [status.level, status.resetsAt, status.secondsUntilReset]);

  if (status.level === "ok" || dismissed) return null;

  const exhausted = status.level === "exhausted";

  return (
    <Alert
      variant={exhausted ? "destructive" : "default"}
      className="mb-6"
      role="status"
      aria-live="polite"
    >
      <AlertTitle>
        {exhausted
          ? "Daily YouTube limit reached for everyone"
          : "Shared YouTube budget is running low"}
      </AlertTitle>
      <AlertDescription className="space-y-2">
        <p>
          {exhausted ? (
            <>
              Viewly shares a single YouTube API budget across all of its creators,
              and today&apos;s allowance is spent. Competitor discovery and live
              refreshes resume {formatRetryAfter(status.secondsUntilReset)}, when the
              quota resets at midnight UTC. Everything on your dashboard still loads
              from the saved daily snapshot in the meantime.
            </>
          ) : (
            <>
              Most of today&apos;s shared YouTube budget is used up, so competitor
              discovery may be turned away until it resets{" "}
              {formatRetryAfter(status.secondsUntilReset)}. Cached data is unaffected.
            </>
          )}
        </p>
        <button
          type="button"
          onClick={() => setDismissed(true)}
          className="text-xs underline underline-offset-4 opacity-80 hover:opacity-100"
        >
          Dismiss
        </button>
      </AlertDescription>
    </Alert>
  );
}
