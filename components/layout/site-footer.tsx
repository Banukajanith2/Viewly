import Link from "next/link";

/**
 * Compliance footer (Part 9.4).
 *
 * The "Powered by YouTube" attribution plus links to the YouTube Terms of Service
 * and the Google Privacy Policy are required by the YouTube API Services terms, and
 * are checked during the quota-increase review. This renders on every page for that
 * reason, so do not tuck it behind a route that a reviewer might not visit.
 */
export function SiteFooter() {
  return (
    <footer className="border-t mt-auto">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-2 px-6 py-6 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
        <p>Powered by YouTube</p>
        <nav className="flex flex-wrap items-center gap-4">
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
