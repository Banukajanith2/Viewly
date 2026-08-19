"use client";

import { useEffect, useState } from "react";
import { Bell, BellOff } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { fetchJson } from "@/lib/utils/fetch-json";
import {
  currentPermission,
  onForegroundMessage,
  pushSupport,
  registerForPush,
} from "@/lib/firebase/messaging";
import type { PushBlockReason } from "@/lib/firebase/messaging";

/**
 * Breakout alert opt-in (Part 8.4).
 *
 * Reads the browser's permission state on mount rather than storing "enabled" in
 * our own database. The browser is the authority: a user can revoke notification
 * permission in site settings at any time without telling us, and a toggle that
 * insisted it was still on would be lying.
 */

const BLOCKED_MESSAGE: Record<PushBlockReason, string> = {
  unsupported: "This browser does not support web push notifications.",
  insecure:
    "Push notifications need a secure connection. This works on localhost and on your deployed site, but not over plain HTTP.",
  denied:
    "Notifications are blocked for this site. You will need to allow them in your browser's site settings, as the page cannot ask again once refused.",
  dismissed: "The permission prompt was closed without an answer. Press the button to try again.",
  "no-vapid-key":
    "Push is not configured on this deployment. Add NEXT_PUBLIC_FIREBASE_VAPID_KEY to enable it.",
  failed: "Registration failed. Please try again.",
};

export function PushToggle() {
  const [state, setState] = useState<"loading" | "ready" | "on" | "blocked">("loading");
  const [reason, setReason] = useState<PushBlockReason | null>(null);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    let alive = true;

    void (async () => {
      const support = await pushSupport();
      if (!alive) return;

      if (!support.ok) {
        setReason(support.reason ?? "unsupported");
        setState("blocked");
        return;
      }

      const permission = currentPermission();
      if (permission === "denied") {
        setReason("denied");
        setState("blocked");
      } else {
        setState(permission === "granted" ? "on" : "ready");
      }
    })();

    return () => {
      alive = false;
    };
  }, []);

  // A message arriving while this tab is focused raises no system notification, so
  // it would otherwise vanish.
  useEffect(() => {
    if (state !== "on") return;
    return onForegroundMessage((title, body) => toast.info(title, { description: body }));
  }, [state]);

  async function enable() {
    setPending(true);
    try {
      const result = await registerForPush();

      if (!result.ok) {
        setReason(result.reason);
        setState(result.reason === "dismissed" ? "ready" : "blocked");
        toast.error("Could not enable alerts", {
          description: BLOCKED_MESSAGE[result.reason],
        });
        return;
      }

      await fetchJson("/api/notifications/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: result.token }),
      });

      setState("on");
      toast.success("Breakout alerts enabled", {
        description:
          "You will get at most one alert per competitor per day, and only for channels you track.",
      });
    } catch {
      // fetchJson has already raised the toast.
    } finally {
      setPending(false);
    }
  }

  if (state === "loading") {
    return <p className="text-muted-foreground text-sm">Checking notification support...</p>;
  }

  if (state === "blocked") {
    return (
      <p className="text-muted-foreground flex items-start gap-2 text-sm">
        <BellOff className="mt-0.5 size-4 shrink-0" />
        {BLOCKED_MESSAGE[reason ?? "unsupported"]}
      </p>
    );
  }

  if (state === "on") {
    return (
      <div className="space-y-2">
        <p className="flex items-center gap-2 text-sm">
          <Bell className="size-4" style={{ color: "var(--viz-good)" }} />
          Breakout alerts are on for this browser.
        </p>
        <p className="text-muted-foreground text-xs">
          Alerts are per browser, so enable them again on any other device you use. To
          turn them off, block notifications for this site in your browser settings.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <Button size="sm" onClick={enable} disabled={pending} className="gap-1.5">
        <Bell className="size-3.5" />
        {pending ? "Enabling..." : "Enable breakout alerts"}
      </Button>
      <p className="text-muted-foreground text-xs">
        Get told when a competitor you track publishes something running well past
        their own average, instead of having to check the dashboard.
      </p>
    </div>
  );
}
