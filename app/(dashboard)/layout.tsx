import Link from "next/link";
import { redirect } from "next/navigation";
import { DashboardNav, DashboardNavMobile } from "@/components/layout/dashboard-nav";
import { PageTransition } from "@/components/layout/page-transition";
import { SiteFooter } from "@/components/layout/site-footer";
import { SignOutButton } from "@/components/auth/sign-out-button";
import { ThemeToggle } from "@/components/layout/theme-toggle";
import { QuotaBanner } from "@/components/layout/quota-banner";
import { ConnectChannelBanner } from "@/components/layout/connect-channel-banner";
import { getSessionUser } from "@/lib/auth/session";
import { getQuotaStatus } from "@/lib/quota/status";
import { getUserProfile } from "@/lib/firebase/firestore";

/**
 * Server-side auth guard for every dashboard route. Rendering is blocked before any
 * child page runs, so a page never has to defend itself against an anonymous visitor.
 * The API routes repeat this check independently, since a layout guard protects the
 * UI only.
 */
export default async function DashboardLayout({ children }: LayoutProps<"/">) {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  // Shared budget state, memoised for 60 seconds so this does not cost a Firestore
  // read on every page load. Rendered here rather than per page so a limit that
  // affects everyone is announced everywhere.
  //
  // The profile is fetched alongside it for the same reason: until a channel is
  // linked every page is empty for one shared cause, so the prompt to fix it
  // belongs in the layout rather than repeated on each page.
  const [quota, profile] = await Promise.all([
    getQuotaStatus(),
    getUserProfile(user.uid),
  ]);
  const needsChannel = !profile?.channelId;

  return (
    <>
      {/*
        Fixed viewport frame: the rail and header never move, only the column on
        the right scrolls.

        `fixed inset-0` rather than `h-svh`. As an ordinary flex child of <body>
        the frame still participated in page flow, so the document could end up
        taller than the viewport and the whole thing scrolled, carrying the rail
        and header away and leaving dead space under the content. Taking it out of
        flow entirely means nothing it contains can make the page scroll, whatever
        the shared <body> styles happen to be.
      */}
      <div className="fixed inset-0 flex">
        <DashboardNav />

        {/* min-w-0 matters: without it a wide table or chart inside a flex child
            refuses to shrink and pushes the whole page into a horizontal scroll. */}
        <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
          {/* shrink-0 keeps the header at its natural height instead of being
              compressed by the scrolling region below it. */}
          <header className="bg-background shrink-0 border-b">
            <div className="flex w-full items-center justify-between gap-4 px-6 py-3">
              {/* Hidden on md+ because the rail shows the mark there. The rail is
                  hidden below md, so this is the only wordmark on small screens. */}
              <Link
                href="/overview"
                className="font-semibold tracking-tight md:invisible"
              >
                Viewly
              </Link>
              <div className="flex items-center gap-3">
                <span className="text-muted-foreground hidden text-sm sm:inline">
                  {user.email}
                </span>
                <ThemeToggle />
                <SignOutButton />
              </div>
            </div>
            <div className="px-6 pb-2 md:hidden">
              <DashboardNavMobile />
            </div>
          </header>

          {/* The only scrolling element. The footer lives inside it, so it sits
              after the content rather than being pinned to the viewport. */}
          <div className="flex flex-1 flex-col overflow-y-auto">
            <main className="mx-auto w-full max-w-6xl flex-1 px-6 py-8">
              <QuotaBanner status={quota} />
              {/* The banner suppresses itself on Settings, which is where the
                  connect button already lives. */}
              {needsChannel && <ConnectChannelBanner />}
              <PageTransition>{children}</PageTransition>
            </main>
            <SiteFooter />
          </div>
        </div>
      </div>
    </>
  );
}
