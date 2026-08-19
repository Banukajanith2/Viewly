import Link from "next/link";
import { redirect } from "next/navigation";
import { Button } from "@/components/ui/button";
import { SiteFooter } from "@/components/layout/site-footer";
import { getSessionUser } from "@/lib/auth/session";

const FEATURES = [
  {
    title: "Retention diagnostics",
    body: "Find the exact seconds where viewers leave, stated in plain language rather than another curve to squint at.",
  },
  {
    title: "Breakout competitor alerts",
    body: "Track channels your size and get told when one of their videos suddenly outruns their own average.",
  },
  {
    title: "Shared niche research",
    body: "Discovery results are cached and shared across creators in the same niche, so research stays fast and free.",
  },
];

export default async function HomePage() {
  if (await getSessionUser()) redirect("/overview");

  return (
    <>
      <main className="flex-1">
        <section className="mx-auto w-full max-w-4xl px-6 py-24 text-center">
          <h1 className="text-balance text-4xl font-semibold tracking-tight sm:text-5xl">
            Know why your views moved, not just that they did.
          </h1>
          <p className="mx-auto mt-5 max-w-2xl text-pretty text-muted-foreground">
            Viewly reads your YouTube analytics and the channels you compete with, then
            tells you the one thing worth changing next.
          </p>
          <div className="mt-8 flex justify-center gap-3">
            <Button asChild size="lg">
              <Link href="/login">Get started</Link>
            </Button>
          </div>
        </section>

        <section className="mx-auto grid w-full max-w-5xl gap-6 px-6 pb-24 sm:grid-cols-3">
          {FEATURES.map((feature) => (
            <div key={feature.title} className="rounded-lg border p-5">
              <h2 className="font-medium">{feature.title}</h2>
              <p className="mt-2 text-sm text-muted-foreground">{feature.body}</p>
            </div>
          ))}
        </section>
      </main>
      <SiteFooter />
    </>
  );
}
