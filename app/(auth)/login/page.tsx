import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { BarChart3, Radar, Timer } from "lucide-react";
import { GoogleSignIn } from "@/components/auth/google-sign-in";
import { EmailAuth } from "@/components/auth/email-auth";
import { AuthorCredit } from "@/components/layout/author-credit";
import { ViewlyMark } from "@/components/layout/viewly-mark";
import { getSessionUser } from "@/lib/auth/session";

export const metadata: Metadata = { title: "Sign in" };

/**
 * Sign-in.
 *
 * A split card: the action on the left, what the product actually does on the
 * right. The right panel is built from CSS and inline SVG rather than a
 * photograph, which keeps the page free of an external asset and lets the motif be
 * a chart, which is at least honest about what this tool is.
 *
 * Email and Google are both offered because both are enabled in Firebase. There is
 * exactly one social button rather than a row of them, for the same reason: the
 * other providers are not configured, so their buttons would be dead.
 */
export default async function LoginPage() {
  if (await getSessionUser()) redirect("/overview");

  return (
    <main className="relative flex min-h-svh items-center justify-center overflow-hidden px-4 py-0">
      <BackdropShapes />

      <div className="bg-card relative z-10 grid w-full max-w-5xl overflow-hidden rounded-2xl border shadow-2xl lg:grid-cols-2">
        {/* ---------------------------------------------------------- form */}
        <div className="flex flex-col justify-center px-8 py-8 sm:px-12">
          <div className="mx-auto w-full max-w-sm">
            <div className="flex items-center justify-center gap-2.5">
              <ViewlyMark className="size-8" style={{ color: "var(--viz-series)" }} />
              <span className="text-3xl font-semibold tracking-tight">Viewly</span>
            </div>

            <p className="text-muted-foreground mt-4 text-center text-sm leading-relaxed">
              Analytics and competitor intelligence for YouTube creators, without the
              subscription.
            </p>

            <div className="mt-8">
              <EmailAuth />
            </div>

            <div className="my-6 flex items-center gap-3">
              <span className="bg-border h-px flex-1" />
              <span className="text-muted-foreground text-xs">Or</span>
              <span className="bg-border h-px flex-1" />
            </div>

            <GoogleSignIn />


            <p className="text-muted-foreground text-center text-xs leading-relaxed">
              By continuing you agree to the{" "}
              <Link
                href="https://www.youtube.com/t/terms"
                target="_blank"
                rel="noreferrer"
                className="hover:text-foreground underline underline-offset-4"
              >
                YouTube Terms of Service
              </Link>{" "}
              and the{" "}
              <Link
                href="https://policies.google.com/privacy"
                target="_blank"
                rel="noreferrer"
                className="hover:text-foreground underline underline-offset-4"
              >
                Google Privacy Policy
              </Link>
              .
            </p>

            <div className="mt-6 flex justify-center">
              <AuthorCredit />
            </div>
          </div>
        </div>

        {/* --------------------------------------------------------- brand */}
        {/* Hidden below lg. On a phone it would be a tall band of colour above the
            only thing on the page that does anything. */}
        <BrandPanel />
      </div>
    </main>
  );
}

/**
 * The coloured half.
 *
 * Uses --viz-series, the same blue as every chart line in the app, so the first
 * screen and the product agree with each other.
 */
function BrandPanel() {
  const FEATURES = [
    { icon: BarChart3, text: "Retention diagnostics that say where viewers leave" },
    { icon: Radar, text: "Competitors your size, found from your own uploads" },
    { icon: Timer, text: "One daily sync, so the dashboard costs nothing to open" },
  ];

  return (
    <div
      className="relative hidden flex-col justify-center overflow-hidden p-12 lg:flex"
      style={{
        background:
          "linear-gradient(150deg, color-mix(in oklab, var(--viz-series) 92%, black) 0%, var(--viz-series) 45%, color-mix(in oklab, var(--viz-3) 70%, var(--viz-series)) 100%)",
      }}
    >
      <ChartMotif />

      <div className="relative z-10">
        <div className="flex items-center gap-3 text-white">
          <ViewlyMark className="size-9" />
          <span className="text-4xl font-semibold tracking-tight">Viewly</span>
        </div>

        <p className="mt-5 max-w-sm text-[15px] leading-relaxed text-white/85">
          Built to run entirely on free tiers, so the whole thing costs nothing to
          operate and there is no upsell waiting behind a chart.
        </p>

        <ul className="mt-10 space-y-4">
          {FEATURES.map(({ icon: Icon, text }) => (
            <li key={text} className="flex items-start gap-3 text-sm text-white/90">
              <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-lg bg-white/15">
                <Icon className="size-4" aria-hidden />
              </span>
              <span className="leading-relaxed">{text}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

/**
 * Decorative chart line across the brand panel.
 *
 * Not real data and not presented as any: it carries no axis, no labels and no
 * numbers, so it reads as a motif rather than as a claim about a channel.
 */
function ChartMotif() {
  return (
    <svg
      className="pointer-events-none absolute inset-0 h-full w-full"
      viewBox="0 0 400 300"
      preserveAspectRatio="none"
      aria-hidden
    >
      <defs>
        <linearGradient id="login-fill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="white" stopOpacity="0.22" />
          <stop offset="100%" stopColor="white" stopOpacity="0" />
        </linearGradient>
        <pattern id="login-grid" width="40" height="40" patternUnits="userSpaceOnUse">
          <path d="M40 0V40M0 40H40" fill="none" stroke="white" strokeOpacity="0.07" />
        </pattern>
      </defs>

      <rect width="400" height="300" fill="url(#login-grid)" />
      <path
        d="M0 232 L52 214 L104 236 L156 178 L208 196 L260 132 L312 150 L364 88 L400 96 L400 300 L0 300 Z"
        fill="url(#login-fill)"
      />
      <path
        d="M0 232 L52 214 L104 236 L156 178 L208 196 L260 132 L312 150 L364 88 L400 96"
        fill="none"
        stroke="white"
        strokeOpacity="0.5"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}

/**
 * The soft shapes bleeding off the corners behind the card.
 *
 * Pure CSS: blurred radial fields rather than images, so they cost nothing to load
 * and tint themselves from the brand token in both themes.
 */
function BackdropShapes() {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
      <div
        className="absolute -top-40 -left-40 size-128 rounded-full opacity-20 blur-3xl"
        style={{ background: "var(--viz-series)" }}
      />
      <div
        className="absolute -right-40 -bottom-40 size-136 rounded-full opacity-20 blur-3xl"
        style={{ background: "var(--viz-3)" }}
      />
    </div>
  );
}
