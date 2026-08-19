"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * App-wide prompt shown until a YouTube channel is linked.
 *
 * Rendered from the dashboard layout rather than per page, because until a channel
 * is connected EVERY page is empty for the same single reason. Repeating the fix on
 * each one would either duplicate the call to action or leave some pages looking
 * broken with no explanation.
 *
 * A client component only so it can read the pathname and stay quiet on Settings,
 * which is where the connect button already lives. Whether a channel is linked is
 * decided on the server, so no data is fetched here.
 *
 * Deliberately not dismissible. The quota banner can be dismissed because the app
 * still works without acting on it; this one gates every feature there is, so
 * hiding it would leave someone with an app of empty pages and no way back.
 */
/**
 * YouTube mark as inline SVG.
 *
 * lucide-react dropped its brand icons, so there is no `Youtube` export and
 * importing one fails the build rather than warning. Same reason the GitHub mark
 * in author-credit.tsx is inlined.
 */
function YouTubeMark({ className, style }: { className?: string; style?: React.CSSProperties }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden className={className} style={style}>
      <path d="M23.5 6.2a3 3 0 0 0-2.11-2.13C19.5 3.55 12 3.55 12 3.55s-7.5 0-9.39.52A3 3 0 0 0 .5 6.2C0 8.1 0 12 0 12s0 3.9.5 5.8a3 3 0 0 0 2.11 2.13c1.89.52 9.39.52 9.39.52s7.5 0 9.39-.52a3 3 0 0 0 2.11-2.13C24 15.9 24 12 24 12s0-3.9-.5-5.8ZM9.55 15.57V8.43L15.82 12l-6.27 3.57Z" />
    </svg>
  );
}

export function ConnectChannelBanner() {
  const pathname = usePathname();

  // Settings is the destination. Pointing at it from the top of it is noise.
  if (pathname === "/settings" || pathname.startsWith("/settings/")) return null;

  return (
    <div
      className="mb-6 flex flex-wrap items-center gap-4 rounded-xl border p-4 sm:p-5"
      style={{
        borderColor: "color-mix(in oklab, var(--viz-series) 35%, transparent)",
        background: "color-mix(in oklab, var(--viz-series) 7%, transparent)",
      }}
    >
      <span
        aria-hidden
        className="flex size-10 shrink-0 items-center justify-center rounded-lg"
        style={{ background: "color-mix(in oklab, var(--viz-series) 16%, transparent)" }}
      >
        <YouTubeMark className="size-5" style={{ color: "var(--viz-series)" }} />
      </span>

      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium">Connect your YouTube account</p>
        <p className="text-muted-foreground mt-0.5 text-sm">
          Viewly needs read-only access before it can show you anything. Nothing is
          ever posted or changed on your behalf, and you can revoke it at any time.
        </p>
      </div>

      <Button asChild size="sm" className="shrink-0 gap-1.5">
        <Link href="/settings">
          Connect YouTube
          <ArrowRight className="size-3.5" />
        </Link>
      </Button>
    </div>
  );
}
