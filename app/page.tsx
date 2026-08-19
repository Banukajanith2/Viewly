import Link from "next/link";
import { redirect } from "next/navigation";
import {
  ArrowRight,
  BarChart3,
  Bell,
  Gauge,
  Globe2,
  Hash,
  Link2,
  RefreshCw,
  Share2,
  ShieldCheck,
  Sparkles,
  Users,
  Wallet,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { SiteFooter } from "@/components/layout/site-footer";
import { ViewlyMark } from "@/components/layout/viewly-mark";
import { Reveal, RevealGroup, RevealItem } from "@/components/marketing/reveal";
import {
  CompetitorsMockup,
  DashboardMockup,
  RetentionMockup,
  SuggestionsMockup,
} from "@/components/marketing/mockups";
import { getSessionUser } from "@/lib/auth/session";

/**
 * Landing page.
 *
 * Claims are kept to what the product actually does. There are no invented user
 * counts, no testimonials and no customer logos, because none exist, and a
 * portfolio project that opens with fabricated social proof undermines the very
 * thing it is meant to demonstrate. The mockups are labelled illustrative for the
 * same reason.
 */

const FEATURES = [
  {
    icon: Gauge,
    accent: "var(--viz-1)",
    title: "Retention diagnostics",
    body: "Finds the opening loss, the steepest drop after it, and how far the median viewer gets. Stated as a sentence you can act on, not another curve to squint at.",
  },
  {
    icon: Users,
    accent: "var(--viz-2)",
    title: "Competitor discovery",
    body: "Channels between 0.3x and 3.5x your subscriber count, found from the topics of your own uploads. Abandoned channels are dropped, so the list is people you can actually learn from.",
  },
  {
    icon: Bell,
    accent: "var(--viz-3)",
    title: "Breakout alerts",
    body: "A push notification when a channel you track publishes something running well past their own average. At most one per competitor per day.",
  },
  {
    icon: Hash,
    accent: "var(--viz-4)",
    title: "Keyword inspector",
    body: "The terms your channel is built on, ranked by how often you actually use them, and marked against what is trending where you are.",
  },
  {
    icon: Globe2,
    accent: "var(--viz-5)",
    title: "Regional focus",
    body: "Trending is requested with your own region code instead of the API default, so a creator in Colombo is not shown what is popular in California.",
  },
  {
    icon: Sparkles,
    accent: "var(--viz-6)",
    title: "AI title suggestions",
    body: "Title and tag ideas grounded in your own uploads and your cached competitor data, on a button rather than as a background job.",
  },
  {
    icon: Share2,
    accent: "var(--viz-1)",
    title: "Cross-platform view",
    body: "Log TikTok, Instagram, X and LinkedIn posts by hand and compare them to YouTube on average views per post, which is the number that is actually comparable.",
  },
  {
    icon: BarChart3,
    accent: "var(--viz-2)",
    title: "Charts that behave",
    body: "One y-axis, always. Ranges split by what they cost, so you never spend your daily allowance just by clicking around. Every table exports to CSV.",
  },
];

const STEPS = [
  {
    icon: Link2,
    title: "Connect your channel",
    body: "Read-only access through Google, and only the two scopes the app needs. Nothing is ever posted or changed on your behalf.",
  },
  {
    icon: RefreshCw,
    title: "Your first snapshot is taken",
    body: "It runs the moment you connect, so the dashboard has data immediately rather than after some overnight job.",
  },
  {
    icon: BarChart3,
    title: "Read what changed, and why",
    body: "Every page afterwards reads that saved snapshot, so opening the app costs nothing and stays fast.",
  },
];

export default async function HomePage() {
  if (await getSessionUser()) redirect("/overview");

  return (
    <>
      <SiteHeader />

      <main className="flex-1">
        <Hero />
        <Features />
        <HowItWorks />
        <Principles />
        <FinalCta />
      </main>

      <SiteFooter />
    </>
  );
}

/* ------------------------------------------------------------------ header */

function SiteHeader() {
  return (
    <header className="bg-background/80 sticky top-0 z-40 border-b backdrop-blur-md">
      <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-4 px-6 py-3">
        <Link href="/" className="flex items-center gap-2.5" aria-label="Viewly, home">
          <ViewlyMark className="size-6" style={{ color: "var(--viz-series)" }} />
          <span className="text-lg font-semibold tracking-tight">Viewly</span>
        </Link>

        <nav className="text-muted-foreground hidden items-center gap-6 text-sm sm:flex">
          <a href="#features" className="hover:text-foreground transition-colors">
            Features
          </a>
          <a href="#how" className="hover:text-foreground transition-colors">
            How it works
          </a>
          <a href="#principles" className="hover:text-foreground transition-colors">
            Why it is free
          </a>
        </nav>

        <Button asChild size="sm">
          <Link href="/login">Get started</Link>
        </Button>
      </div>
    </header>
  );
}

/* -------------------------------------------------------------------- hero */

function Hero() {
  return (
    <section className="relative overflow-hidden">
      {/* Blurred fields rather than images: nothing to download, and they tint
          themselves from the brand token in both themes. */}
      <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
        <div
          className="absolute -top-48 left-1/4 size-128 rounded-full opacity-20 blur-3xl"
          style={{ background: "var(--viz-series)" }}
        />
        <div
          className="absolute -right-40 top-32 size-96 rounded-full opacity-15 blur-3xl"
          style={{ background: "var(--viz-3)" }}
        />
      </div>

      <div className="relative mx-auto w-full max-w-6xl px-6 pt-20 pb-16 sm:pt-28">
        <Reveal className="mx-auto max-w-3xl text-center">
          <span className="text-muted-foreground inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs">
            <span
              aria-hidden
              className="size-1.5 rounded-full"
              style={{ background: "var(--viz-good)" }}
            />
            Free to run, and free to use
          </span>

          <h1 className="mt-6 text-4xl font-semibold tracking-tight text-balance sm:text-6xl">
            Know why your views moved, not just that they did.
          </h1>

          <p className="text-muted-foreground mx-auto mt-6 max-w-2xl text-lg text-pretty">
            Viewly reads your YouTube analytics and the channels you compete with, then
            tells you the one thing worth changing next.
          </p>

          <div className="mt-9 flex flex-wrap justify-center gap-3">
            <Button asChild size="lg" className="gap-1.5">
              <Link href="/login">
                Get started
                <ArrowRight className="size-4" />
              </Link>
            </Button>
            <Button asChild size="lg" variant="outline">
              <a href="#features">See what it does</a>
            </Button>
          </div>

          <p className="text-muted-foreground mt-5 flex items-center justify-center gap-1.5 text-xs">
            <ShieldCheck className="size-3.5" aria-hidden />
            Read-only access. Nothing is posted or changed on your behalf.
          </p>
        </Reveal>

        <Reveal delay={0.12} y={28} className="mx-auto mt-16 max-w-4xl">
          <DashboardMockup />
          <p className="text-muted-foreground mt-3 text-center text-xs">
            Illustrative. Figures shown are examples, not a real channel.
          </p>
        </Reveal>
      </div>
    </section>
  );
}

/* ---------------------------------------------------------------- features */

function Features() {
  return (
    <section id="features" className="scroll-mt-20 border-t py-20 sm:py-28">
      <div className="mx-auto w-full max-w-6xl px-6">
        <Reveal className="mx-auto max-w-2xl text-center">
          <h2 className="text-3xl font-semibold tracking-tight text-balance sm:text-4xl">
            Everything a creator actually checks, in one place
          </h2>
          <p className="text-muted-foreground mt-4 text-pretty">
            Built around the questions you ask after publishing, rather than around a
            list of metrics that happened to be available.
          </p>
        </Reveal>

        {/* Two feature spotlights, each paired with the screen it describes. */}
        <div className="mt-16 grid items-center gap-10 lg:grid-cols-2">
          <Reveal>
            <h3 className="text-2xl font-semibold tracking-tight">
              Find the exact moment people leave
            </h3>
            <p className="text-muted-foreground mt-4 text-pretty">
              Every retention curve slopes down, so the shape alone never tells you
              what to fix. Viewly rebases each curve to its own starting point, then
              names the opening loss, the steepest fall after it, and how many make it
              to the middle.
            </p>
            <ul className="mt-6 space-y-3 text-sm">
              {[
                "Averaged across your last five uploads, not one lucky video",
                "Reported in seconds when your uploads are a comparable length",
                "Runs on demand and caches for a day, so it never surprises you",
              ].map((item) => (
                <li key={item} className="flex items-start gap-2.5">
                  <span
                    aria-hidden
                    className="mt-1.5 size-1.5 shrink-0 rounded-full"
                    style={{ background: "var(--viz-1)" }}
                  />
                  <span className="text-muted-foreground">{item}</span>
                </li>
              ))}
            </ul>
          </Reveal>
          <Reveal delay={0.1}>
            <RetentionMockup />
          </Reveal>
        </div>

        <div className="mt-20 grid items-center gap-10 lg:grid-cols-2">
          <Reveal delay={0.1} className="lg:order-2">
            <h3 className="text-2xl font-semibold tracking-tight">
              See who you are actually competing with
            </h3>
            <p className="text-muted-foreground mt-4 text-pretty">
              Discovery reads the topics of your own uploads and finds channels in your
              size band, then flags the ones with a video suddenly outrunning their own
              average. Results are shared across creators in the same niche, so
              research stays fast without spending anyone&rsquo;s budget twice.
            </p>
            <ul className="mt-6 space-y-3 text-sm">
              {[
                "Between 0.3x and 3.5x your subscriber count",
                "Channels dormant for six months are dropped",
                "Track any of them and get a push when they break out",
              ].map((item) => (
                <li key={item} className="flex items-start gap-2.5">
                  <span
                    aria-hidden
                    className="mt-1.5 size-1.5 shrink-0 rounded-full"
                    style={{ background: "var(--viz-2)" }}
                  />
                  <span className="text-muted-foreground">{item}</span>
                </li>
              ))}
            </ul>
          </Reveal>
          <Reveal className="space-y-4 lg:order-1">
            <CompetitorsMockup />
            <SuggestionsMockup />
          </Reveal>
        </div>

        {/* The full set. */}
        <RevealGroup className="mt-24 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {FEATURES.map(({ icon: Icon, accent, title, body }) => (
            <RevealItem key={title}>
              <div className="bg-card hover:border-foreground/15 h-full rounded-xl border p-5 transition-colors">
                <span
                  aria-hidden
                  className="flex size-9 items-center justify-center rounded-lg"
                  style={{ background: `color-mix(in oklab, ${accent} 14%, transparent)` }}
                >
                  <Icon className="size-4.5" style={{ color: accent }} />
                </span>
                <h3 className="mt-4 font-medium">{title}</h3>
                <p className="text-muted-foreground mt-2 text-sm leading-relaxed">{body}</p>
              </div>
            </RevealItem>
          ))}
        </RevealGroup>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------- how it works */

function HowItWorks() {
  return (
    <section id="how" className="bg-muted/30 scroll-mt-20 border-t py-20 sm:py-28">
      <div className="mx-auto w-full max-w-6xl px-6">
        <Reveal className="mx-auto max-w-2xl text-center">
          <h2 className="text-3xl font-semibold tracking-tight text-balance sm:text-4xl">
            Connected in about a minute
          </h2>
          <p className="text-muted-foreground mt-4 text-pretty">
            No card, no trial, no onboarding call.
          </p>
        </Reveal>

        <RevealGroup className="mt-14 grid gap-6 md:grid-cols-3">
          {STEPS.map(({ icon: Icon, title, body }, i) => (
            <RevealItem key={title}>
              <div className="relative h-full">
                <span
                  aria-hidden
                  className="text-muted-foreground/15 absolute -top-6 right-2 text-6xl font-semibold tabular-nums"
                >
                  {i + 1}
                </span>
                <div className="bg-card relative h-full rounded-xl border p-6">
                  <span
                    aria-hidden
                    className="flex size-10 items-center justify-center rounded-lg"
                    style={{
                      background: "color-mix(in oklab, var(--viz-series) 14%, transparent)",
                    }}
                  >
                    <Icon className="size-5" style={{ color: "var(--viz-series)" }} />
                  </span>
                  <h3 className="mt-4 font-medium">{title}</h3>
                  <p className="text-muted-foreground mt-2 text-sm leading-relaxed">
                    {body}
                  </p>
                </div>
              </div>
            </RevealItem>
          ))}
        </RevealGroup>
      </div>
    </section>
  );
}

/* -------------------------------------------------------------- principles */

function Principles() {
  const POINTS = [
    {
      icon: Wallet,
      title: "Free because it is cheap to run",
      body: "Viewly runs entirely on free tiers. There is no paid plan waiting behind a chart, because there is no bill to cover.",
    },
    {
      icon: ShieldCheck,
      title: "Read-only, and only two scopes",
      body: "It can read your analytics and nothing else. No uploading, no editing, no commenting, and you can revoke access from Settings at any time.",
    },
    {
      icon: RefreshCw,
      title: "One sync a day, then nothing",
      body: "Your dashboard reads a saved snapshot rather than calling YouTube on every page load, which is what keeps it fast and free.",
    },
  ];

  return (
    <section id="principles" className="scroll-mt-20 border-t py-20 sm:py-28">
      <div className="mx-auto w-full max-w-6xl px-6">
        <Reveal className="mx-auto max-w-2xl text-center">
          <h2 className="text-3xl font-semibold tracking-tight text-balance sm:text-4xl">
            Why it is free, honestly
          </h2>
          <p className="text-muted-foreground mt-4 text-pretty">
            The YouTube API gives roughly ten thousand quota units a day to the whole
            app, not to each person. Most of the engineering here is about respecting
            that number, which is also why it costs nothing to offer.
          </p>
        </Reveal>

        <RevealGroup className="mt-14 grid gap-6 md:grid-cols-3">
          {POINTS.map(({ icon: Icon, title, body }) => (
            <RevealItem key={title}>
              <div className="h-full rounded-xl border p-6">
                <Icon className="size-5" style={{ color: "var(--viz-good)" }} aria-hidden />
                <h3 className="mt-4 font-medium">{title}</h3>
                <p className="text-muted-foreground mt-2 text-sm leading-relaxed">{body}</p>
              </div>
            </RevealItem>
          ))}
        </RevealGroup>
      </div>
    </section>
  );
}

/* --------------------------------------------------------------- final cta */

function FinalCta() {
  return (
    <section className="border-t">
      <div className="mx-auto w-full max-w-6xl px-6 py-20 sm:py-28">
        <Reveal>
          <div
            className="relative overflow-hidden rounded-2xl border p-10 text-center sm:p-16"
            style={{
              background:
                "linear-gradient(150deg, color-mix(in oklab, var(--viz-series) 12%, transparent) 0%, color-mix(in oklab, var(--viz-3) 10%, transparent) 100%)",
            }}
          >
            <ViewlyMark
              className="mx-auto size-9"
              style={{ color: "var(--viz-series)" }}
            />
            <h2 className="mt-6 text-3xl font-semibold tracking-tight text-balance sm:text-4xl">
              Find out what to change next
            </h2>
            <p className="text-muted-foreground mx-auto mt-4 max-w-xl text-pretty">
              Connect your channel and your first snapshot is taken straight away.
            </p>
            <Button asChild size="lg" className="mt-8 gap-1.5">
              <Link href="/login">
                Get started
                <ArrowRight className="size-4" />
              </Link>
            </Button>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
