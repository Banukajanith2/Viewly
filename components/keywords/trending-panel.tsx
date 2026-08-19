"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Globe2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { fetchJson } from "@/lib/utils/fetch-json";

interface TrendingResponse {
  source: "cache" | "live";
  region: string;
  regionName: string | null;
  videos: unknown[];
}

/**
 * Loads the region's trending chart (Part 8.2).
 *
 * One videos.list call, 1 unit, and the result is cached per region and shared by
 * every creator there, so the second person to press this in a given region spends
 * nothing. Still an explicit action rather than a page-load fetch, because it is
 * the only thing on the page that can touch the shared budget at all.
 */
export function TrendingPanel({
  region,
  regionLabel,
  hasCache,
}: {
  region: string;
  regionLabel: string;
  hasCache: boolean;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function load() {
    setPending(true);
    try {
      const body = await fetchJson<TrendingResponse>("/api/trending");
      toast.success(
        body.source === "cache"
          ? `Loaded ${regionLabel} trending from the shared cache`
          : `Fetched ${regionLabel} trending`,
        {
          description:
            body.source === "cache"
              ? "Another creator in your region already loaded this, so it cost nothing."
              : `${body.videos.length} videos, 1 quota unit. Now cached for everyone in ${region}.`,
        },
      );
      router.refresh();
    } catch {
      // fetchJson has already raised the toast, including a 429.
    } finally {
      setPending(false);
    }
  }

  return (
    <Button onClick={load} disabled={pending} size="sm" variant="outline" className="gap-1.5">
      <Globe2 className="size-3.5" />
      {pending ? "Loading..." : hasCache ? "Refresh trending" : `Load ${region} trending`}
    </Button>
  );
}
