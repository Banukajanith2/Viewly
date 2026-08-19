"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Activity } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { fetchJson } from "@/lib/utils/fetch-json";

interface DiagnoseResponse {
  source: "cache" | "live";
  videos: Array<{ hasData: boolean }>;
}

/**
 * Runs the retention diagnostics.
 *
 * Each upload analysed costs one analytics call against the user's daily cap, so
 * this is an explicit action rather than something a page load triggers. The label
 * states the cost before the click, on the same principle as the range filter: a
 * user should never spend their allowance by navigating.
 */
export function DiagnoseButton({ videoCount, hasResult }: { videoCount: number; hasResult: boolean }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function run() {
    setPending(true);
    try {
      const body = await fetchJson<DiagnoseResponse>(
        "/api/channel/retention/diagnose?refresh=1",
      );
      const withData = body.videos.filter((v) => v.hasData).length;

      if (withData === 0) {
        toast.info("No retention data yet", {
          description:
            "YouTube only reports retention once a video passes a minimum view count. Nothing was wasted; this fills in as your videos pick up views.",
        });
      } else {
        toast.success("Diagnostics updated", {
          description: `Analysed ${withData} upload${withData === 1 ? "" : "s"}. Cached for a day, so revisiting this page is free.`,
        });
      }
      router.refresh();
    } catch {
      // fetchJson already raised the toast, including a 429 with its wait time.
    } finally {
      setPending(false);
    }
  }

  return (
    <Button onClick={run} disabled={pending} size="sm" className="gap-1.5">
      <Activity className="size-3.5" />
      {pending
        ? "Analysing..."
        : hasResult
          ? "Re-run diagnostics"
          : `Analyse last ${videoCount} upload${videoCount === 1 ? "" : "s"}`}
    </Button>
  );
}
