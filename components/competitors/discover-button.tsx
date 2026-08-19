"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Search } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { fetchJson } from "@/lib/utils/fetch-json";

interface DiscoverResponse {
  source: "cache" | "fresh";
  candidateCount: number;
  liveSearchSkipped: boolean;
  keywords: string[];
}

/**
 * Runs competitor discovery.
 *
 * The only control in the app that can reach search.list, at 100 units of a budget
 * shared by every user, so the button says what it will do before it does it. Rate
 * limit rejections come back as a 429 and are surfaced by fetchJson as a readable
 * toast rather than a dead button.
 */
export function DiscoverButton({ hasResults }: { hasResults: boolean }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);

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
      router.refresh();
    } catch {
      // fetchJson has already raised the toast, including the 429 with its wait time.
    } finally {
      setPending(false);
    }
  }

  return (
    <Button onClick={run} disabled={pending} size="sm" className="gap-1.5">
      <Search className="size-3.5" />
      {pending ? "Searching..." : hasResults ? "Refresh discovery" : "Find competitors"}
    </Button>
  );
}
