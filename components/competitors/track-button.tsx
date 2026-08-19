"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Bell, BellOff } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { fetchJson } from "@/lib/utils/fetch-json";

/**
 * Track or untrack one competitor for breakout alerts (Part 8.4).
 *
 * Optimistic, because the only thing this changes is which channels a background
 * job considers, and a button that waits on a round trip to show a bell feels
 * broken. On failure it reverts and says so, rather than leaving a lie on screen.
 */
export function TrackButton({
  channelId,
  channelTitle,
  tracked: initial,
}: {
  channelId: string;
  channelTitle: string;
  tracked: boolean;
}) {
  const router = useRouter();
  const [tracked, setTracked] = useState(initial);
  const [pending, setPending] = useState(false);

  async function toggle() {
    const next = !tracked;
    setTracked(next);
    setPending(true);

    try {
      await fetchJson("/api/competitors/track", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ channelId, tracked: next }),
      });
      toast.success(next ? `Tracking ${channelTitle}` : `Stopped tracking ${channelTitle}`, {
        description: next
          ? "You will be alerted when they publish something taking off, at most once a day."
          : undefined,
      });
      router.refresh();
    } catch {
      setTracked(!next);
      // fetchJson has already raised the toast with the reason.
    } finally {
      setPending(false);
    }
  }

  return (
    <Button
      size="sm"
      variant={tracked ? "secondary" : "ghost"}
      onClick={toggle}
      disabled={pending}
      aria-pressed={tracked}
      aria-label={tracked ? `Stop tracking ${channelTitle}` : `Track ${channelTitle}`}
      className="shrink-0 gap-1.5"
    >
      {tracked ? <Bell className="size-3.5" /> : <BellOff className="size-3.5" />}
      {tracked ? "Tracking" : "Track"}
    </Button>
  );
}
