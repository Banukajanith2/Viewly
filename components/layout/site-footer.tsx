import Link from "next/link";

/**
 * Compliance footer (Part 9.4).
 *
 * The "Powered by YouTube" attribution plus links to the YouTube Terms of Service
 * and the Google Privacy Policy are required by the YouTube API Services terms, and
 * are checked during the quota-increase review. This renders on every page for that
 * reason, so do not tuck it behind a route a reviewer might not visit.
 */

const AUTHOR = {
  name: "Banuka Janith",
  portfolio: "https://banukajanith2.github.io/Portfolio/",
  /**
   * Points at the GitHub profile for now. Swap this for the repository URL once the
   * repo is public: it is referenced in exactly one place so the change is one line.
   */
  github: "https://github.com/banukajanith2",
} as const;

/**
 * GitHub mark as inline SVG.
 *
 * lucide-react dropped its brand icons, so there is no `Github` export to import.
 * Inlining the path avoids adding a whole icon package for one mark, and keeps the
 * footer dependency-free.
 */
function GithubMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" fill="currentColor" aria-hidden className={className}>
      <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27s1.36.09 2 .27c1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8Z" />
    </svg>
  );
}

export function SiteFooter() {
  return (
    <footer className="mt-auto border-t">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-3 px-6 py-6 text-xs sm:flex-row sm:items-center sm:justify-between">
        <div className="text-muted-foreground flex items-center gap-3">
          <span>Powered by YouTube</span>
          <span aria-hidden className="opacity-40">
            ·
          </span>
          <span>
            Built by{" "}
            <Link
              href={AUTHOR.portfolio}
              target="_blank"
              rel="noreferrer"
              className="text-foreground font-medium underline-offset-4 hover:underline"
            >
              {AUTHOR.name}
            </Link>
          </span>
          <Link
            href={AUTHOR.github}
            target="_blank"
            rel="noreferrer"
            aria-label={`${AUTHOR.name} on GitHub`}
            className="hover:text-foreground transition-colors"
          >
            <GithubMark className="size-4" />
          </Link>
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
