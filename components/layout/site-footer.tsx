import Link from "next/link";
import { AuthorCredit } from "@/components/layout/author-credit";

/**
 * Compliance footer (Part 9.4).
 *
 * The "Powered by YouTube" attribution plus links to the YouTube Terms of Service
 * and the Google Privacy Policy are required by the YouTube API Services terms, and
 * are checked during the quota-increase review. This renders on every page for that
 * reason, so do not tuck it behind a route a reviewer might not visit.
 */

export function SiteFooter() {
  return (
    <footer className="mt-auto border-t">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-3 px-6 py-6 text-xs sm:flex-row sm:items-center sm:justify-between">
        <div className="text-muted-foreground flex items-center gap-3">
          <span>Powered by YouTube</span>
          <span aria-hidden className="opacity-40">
            ·
          </span>
          <AuthorCredit />
        </div>

        <nav className="text-muted-foreground flex flex-wrap items-center gap-4">
          <Link
            href="https://www.youtube.com/t/terms"
            target="_blank"
            rel="noreferrer"
            className="hover:text-foreground underline-offset-4 hover:underline"
          >
            YouTube Terms of Service
          </Link>
          <Link
            href="https://policies.google.com/privacy"
            target="_blank"
            rel="noreferrer"
            className="hover:text-foreground underline-offset-4 hover:underline"
          >
            Google Privacy Policy
          </Link>
          <Link
            href="/settings"
            className="hover:text-foreground underline-offset-4 hover:underline"
          >
            Manage access
          </Link>
        </nav>
      </div>
    </footer>
  );
}
