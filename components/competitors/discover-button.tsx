"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Search } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { fetchJson } from "@/lib/utils/fetch-json";

interface DiscoverResponse {
  source: "cache" | "fresh";
  candidateCount: number;
  liveSearchSkipped: boolean;
  keywords: string[];
}

/**
 * Runs competitor discovery, behind a confirmation.
 *
 * This is the only control in the app that can reach search.list. That call costs
 * 100 units of a budget of roughly 10,000 shared by EVERY user of the app, and a
 * real run measured 112 units once the follow-up lookups are counted, so a single
 * careless click removes about one percent of the day's capacity for everybody.
 *
 * It also starts a 7 day cooldown on this account, which is not reversible from
 * the UI. Those two facts are why this asks first: a confirmation is warranted when
 * the cost is borne by people who did not click, and when the action cannot be
 * undone.
 *
 * The dialog is honest that the cost is conditional. If another creator in the same
 * niche has already run discovery, the shared cache answers and nothing is spent,
 * which is the entire point of the Part 6 design.
 *
 * The cooldown length arrives as a prop rather than being imported: it lives in
 * lib/quota/rate-limiter, which is marked "server-only", so pulling it in here
 * would break the build. The server page that renders this already has it.
 */
export function DiscoverButton({
  hasResults,
  cooldownDays,
}: {
  hasResults: boolean;
  cooldownDays: number;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [open, setOpen] = useState(false);

  async function run() {
    setPending(true);
    try {
      const body = await fetchJson<DiscoverResponse>("/api/competitors/discover", {
        method: "POST",
      });

      if (body.liveSearchSkipped) {
        toast.info("Live search is disabled", {
          description:
            "Nothing was cached for your niche and live search is turned off in this " +
            "environment, so no quota was spent.",
        });
      } else if (body.source === "cache") {
        toast.success("Loaded from your niche's shared cache", {
          description: `${body.candidateCount} channels, no quota spent. Other creators in your niche share this result.`,
        });
      } else {
        toast.success("Discovery complete", {
          description: `${body.candidateCount} channels found for ${body.keywords.slice(0, 3).join(", ")}.`,
        });
      }
      setOpen(false);
      router.refresh();
    } catch {
      // fetchJson has already raised the toast, including the 429 with its wait time.
    } finally {
      setPending(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" className="gap-1.5">
          <Search className="size-3.5" />
          {hasResults ? "Refresh discovery" : "Find competitors"}
        </Button>
      </DialogTrigger>

      <DialogContent>
        <DialogHeader>
          <DialogTitle>Run competitor discovery?</DialogTitle>
          <DialogDescription>
            This is the only action in Viewly that can spend a large amount of the
            shared daily quota.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 text-sm">
          <p className="text-muted-foreground">
            If another creator in your niche has already run this, the shared cache
            answers and{" "}
            <span className="text-foreground font-medium">nothing is spent</span>.
          </p>

          <div className="space-y-2 rounded-lg border p-3">
            <p className="text-muted-foreground text-xs">Otherwise, a fresh search:</p>
            <ul className="text-muted-foreground space-y-1.5 text-xs">
              <li className="flex items-start gap-2">
                <span
                  aria-hidden
                  className="mt-1.5 size-1.5 shrink-0 rounded-full"
                  style={{ background: "var(--viz-warning)" }}
                />
                <span>
                  Spends about{" "}
                  <span className="text-foreground font-medium tabular-nums">
                    112 units
                  </span>{" "}
                  of roughly 10,000 shared by everyone using Viewly today.
                </span>
              </li>
              <li className="flex items-start gap-2">
                <span
                  aria-hidden
                  className="mt-1.5 size-1.5 shrink-0 rounded-full"
                  style={{ background: "var(--viz-warning)" }}
                />
                <span>
                  Locks your account out of running it again for{" "}
                  <span className="text-foreground font-medium">
                    {cooldownDays} days
                  </span>
                  . This cannot be undone.
                </span>
              </li>
            </ul>
          </div>
        </div>

        <DialogFooter>
          <DialogClose asChild>
            <Button variant="ghost" size="sm" disabled={pending}>
              Cancel
            </Button>
          </DialogClose>
          <Button size="sm" onClick={run} disabled={pending} className="gap-1.5">
            <Search className="size-3.5" />
            {pending ? "Searching..." : "Yes, run discovery"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
