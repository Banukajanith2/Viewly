import Link from "next/link";
import { redirect } from "next/navigation";
import { DashboardNav } from "@/components/layout/dashboard-nav";
import { SiteFooter } from "@/components/layout/site-footer";
import { SignOutButton } from "@/components/auth/sign-out-button";
import { QuotaBanner } from "@/components/layout/quota-banner";
import { getSessionUser } from "@/lib/auth/session";
import { getQuotaStatus } from "@/lib/quota/status";

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
  const quota = await getQuotaStatus();

  return (
    <>
      <header className="border-b">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-4 px-6 py-3">
          <Link href="/overview" className="font-semibold tracking-tight">
            Viewly
          </Link>
          <div className="flex items-center gap-3">
            <span className="hidden text-sm text-muted-foreground sm:inline">
              {user.email}
            </span>
            <SignOutButton />
          </div>
        </div>
        <div className="mx-auto w-full max-w-6xl px-6 pb-2">
          <DashboardNav />
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl flex-1 px-6 py-8">
        <QuotaBanner status={quota} />
        {children}
      </main>
      <SiteFooter />
    </>
  );
}
