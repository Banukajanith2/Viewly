"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { fetchJson } from "@/lib/utils/fetch-json";
import { REGIONS, regionName } from "@/lib/youtube/regions";

/**
 * Home region control (Part 8.2).
 *
 * Says where the current value came from, which matters because an unset region is
 * inferred from the channel's own country. Without that line a creator cannot tell
 * a deliberate choice from a default, and would have no reason to trust either.
 */
export function RegionSelector({
  current,
  isExplicit,
  channelCountry,
}: {
  current: string;
  isExplicit: boolean;
  channelCountry?: string | null;
}) {
  const router = useRouter();
  const [value, setValue] = useState(current);
  const [pending, setPending] = useState(false);

  async function save() {
    setPending(true);
    try {
      await fetchJson("/api/user/region", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ region: value }),
      });
      toast.success("Home region updated", {
        description: `Trending and keyword suggestions now use ${regionName(value)}.`,
      });
      router.refresh();
    } catch {
      // fetchJson has already raised the toast.
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="space-y-3">
      <div className="space-y-1.5">
        <Label htmlFor="region">Home region</Label>
        <select
          id="region"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          className="border-input bg-background focus-visible:ring-ring h-9 w-full max-w-xs rounded-md border px-3 py-1 text-sm focus-visible:ring-2 focus-visible:outline-none"
        >
          {REGIONS.map((r) => (
            <option key={r.code} value={r.code}>
              {r.name}
            </option>
          ))}
        </select>
      </div>

      <p className="text-muted-foreground text-xs">
        {isExplicit
          ? "Trending and keyword suggestions use this region."
          : channelCountry
            ? `Not set, so Viewly is using your channel's own country (${regionName(channelCountry) ?? channelCountry}). Pick one to override it.`
            : "Not set, and your channel does not report a country, so Viewly is defaulting to the United States."}
      </p>

      {value !== current && (
        <Button size="sm" onClick={save} disabled={pending}>
          {pending ? "Saving..." : "Save region"}
        </Button>
      )}
    </div>
  );
}
