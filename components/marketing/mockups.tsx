/**
 * Product mockups for the landing page.
 *
 * Inline SVG rather than screenshots or stock photography. Three reasons: they stay
 * crisp at any size, they read from the theme tokens so they are correct in both
 * light and dark, and they pull nothing over the network, which matters for a
 * project whose whole premise is running on free tiers.
 *
 * IMPORTANT: every number and label here is illustrative, and the components are
 * named and captioned so nobody mistakes them for a real channel's figures. They
 * exist to show the SHAPE of each feature. Do not paste real analytics in, and do
 * not present these as results.
 */

/** Shared chrome so every mockup looks like the same application. */
function Frame({
  title,
  children,
  className,
}: {
  title: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`bg-card overflow-hidden rounded-xl border shadow-sm ${className ?? ""}`}
    >
      <div className="flex items-center gap-2 border-b px-3 py-2">
        <span className="flex gap-1.5" aria-hidden>
          <span className="bg-muted-foreground/25 size-2 rounded-full" />
          <span className="bg-muted-foreground/25 size-2 rounded-full" />
          <span className="bg-muted-foreground/25 size-2 rounded-full" />
        </span>
        <span className="text-muted-foreground truncate text-[11px]">{title}</span>
      </div>
      {children}
    </div>
  );
}

/**
 * The dashboard overview: stat tiles and a trend line.
 *
 * Carries the same accent discipline as the real product, an accent in the chip and
 * a hairline only, so the mockup does not promise a different design to the one a
 * user actually gets.
 */
export function DashboardMockup({ className }: { className?: string }) {
  const TILES = [
    { label: "Subscribers", value: "12.4K", accent: "var(--viz-1)" },
    { label: "Views (28d)", value: "486K", accent: "var(--viz-2)" },
    { label: "Watch time", value: "31.2K", accent: "var(--viz-3)" },
    { label: "Avg view", value: "48.1%", accent: "var(--viz-4)" },
  ];

  return (
    <Frame title="Viewly, Overview" className={className}>
      <div className="space-y-4 p-4">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {TILES.map((t) => (
            <div key={t.label} className="relative overflow-hidden rounded-lg border p-2.5">
              <span
                aria-hidden
                className="absolute inset-x-0 top-0 h-0.5"
                style={{ background: t.accent }}
              />
              <p className="text-muted-foreground text-[9px] tracking-wide uppercase">
                {t.label}
              </p>
              <p className="mt-1 text-base font-semibold tabular-nums">{t.value}</p>
            </div>
          ))}
        </div>

        <div className="rounded-lg border p-3">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-[11px] font-medium">Daily views</span>
            <span className="text-muted-foreground text-[9px]">28 days</span>
          </div>
          <svg viewBox="0 0 320 90" className="h-24 w-full" aria-hidden>
            <defs>
              <linearGradient id="mock-fill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--viz-series)" stopOpacity="0.28" />
                <stop offset="100%" stopColor="var(--viz-series)" stopOpacity="0" />
              </linearGradient>
            </defs>
            {[22, 45, 68].map((y) => (
              <line
                key={y}
                x1="0"
                x2="320"
                y1={y}
                y2={y}
                stroke="var(--border)"
                strokeWidth="1"
              />
            ))}
            <path
              d="M0 72 L32 64 L64 70 L96 48 L128 55 L160 34 L192 41 L224 24 L256 30 L288 16 L320 21 L320 90 L0 90 Z"
              fill="url(#mock-fill)"
            />
            <path
              d="M0 72 L32 64 L64 70 L96 48 L128 55 L160 34 L192 41 L224 24 L256 30 L288 16 L320 21"
              fill="none"
              stroke="var(--viz-series)"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <circle cx="320" cy="21" r="3" fill="var(--viz-series)" />
          </svg>
        </div>
      </div>
    </Frame>
  );
}

/** Retention curve with the hook boundary and the steepest drop annotated. */
export function RetentionMockup({ className }: { className?: string }) {
  return (
    <Frame title="Viewly, Retention" className={className}>
      <div className="space-y-3 p-4">
        <div
          className="flex items-start gap-2 rounded-lg border p-2.5"
          style={{
            borderColor: "color-mix(in oklab, var(--viz-critical) 35%, transparent)",
            background: "color-mix(in oklab, var(--viz-critical) 7%, transparent)",
          }}
        >
          <span
            aria-hidden
            className="mt-0.5 size-1.5 shrink-0 rounded-full"
            style={{ background: "var(--viz-critical)" }}
          />
          <p className="text-[11px] leading-snug">
            You lose about 45% of viewers in the first 15 seconds
          </p>
        </div>

        <svg viewBox="0 0 320 110" className="h-28 w-full" aria-hidden>
          <defs>
            <linearGradient id="mock-ret" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--viz-series)" stopOpacity="0.26" />
              <stop offset="100%" stopColor="var(--viz-series)" stopOpacity="0" />
            </linearGradient>
          </defs>
          {/* The steepest post-opening fall, shaded as a region. */}
          <rect x="150" y="0" width="34" height="110" fill="var(--viz-warning)" opacity="0.14" />
          <path
            d="M0 8 L28 30 L56 44 L84 52 L112 58 L150 64 L184 82 L220 88 L260 94 L300 99 L320 101 L320 110 L0 110 Z"
            fill="url(#mock-ret)"
          />
          <path
            d="M0 8 L28 30 L56 44 L84 52 L112 58 L150 64 L184 82 L220 88 L260 94 L300 99 L320 101"
            fill="none"
            stroke="var(--viz-series)"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          {/* Hook boundary, dashed so it reads as annotation rather than data. */}
          <line
            x1="40"
            x2="40"
            y1="0"
            y2="110"
            stroke="var(--viz-critical)"
            strokeWidth="1.5"
            strokeDasharray="4 3"
            opacity="0.8"
          />
          <text x="45" y="12" fill="currentColor" opacity="0.5" fontSize="8">
            hook
          </text>
        </svg>
      </div>
    </Frame>
  );
}

/** Competitor list with a breakout flagged. */
export function CompetitorsMockup({ className }: { className?: string }) {
  const ROWS = [
    { name: "Channel A", subs: "9.8K", breakout: true },
    { name: "Channel B", subs: "14.2K", breakout: false },
    { name: "Channel C", subs: "7.1K", breakout: false },
  ];

  return (
    <Frame title="Viewly, Competitors" className={className}>
      <div className="divide-y">
        {ROWS.map((r) => (
          <div key={r.name} className="flex items-center gap-3 px-4 py-2.5">
            <span
              aria-hidden
              className="size-7 shrink-0 rounded-full"
              style={{ background: "color-mix(in oklab, var(--viz-1) 22%, transparent)" }}
            />
            <div className="min-w-0 flex-1">
              <p className="truncate text-[11px] font-medium">{r.name}</p>
              <p className="text-muted-foreground text-[9px]">{r.subs} subscribers</p>
            </div>
            {r.breakout && (
              <span
                className="shrink-0 rounded-full px-2 py-0.5 text-[9px] font-medium"
                style={{
                  background: "color-mix(in oklab, var(--viz-2) 18%, transparent)",
                  color: "var(--viz-2)",
                }}
              >
                Breakout
              </span>
            )}
          </div>
        ))}
      </div>
    </Frame>
  );
}

/** Title suggestions, as the AI panel renders them. */
export function SuggestionsMockup({ className }: { className?: string }) {
  const TITLES = [
    "How I shade a portrait in 10 minutes",
    "The pencil mistake beginners keep making",
    "Drawing hands, step by step",
  ];

  return (
    <Frame title="Viewly, Keywords" className={className}>
      <div className="space-y-2 p-4">
        {TITLES.map((t) => (
          <div key={t} className="rounded-lg border p-2.5">
            <p className="text-[11px] leading-snug">{t}</p>
            <p className="text-muted-foreground mt-1 text-[9px] tabular-nums">
              {t.length} characters
            </p>
          </div>
        ))}
        <div className="flex flex-wrap gap-1 pt-1">
          {["pencil art", "shading", "tutorial"].map((tag) => (
            <span
              key={tag}
              className="bg-muted rounded-full px-2 py-0.5 text-[9px]"
            >
              {tag}
            </span>
          ))}
        </div>
      </div>
    </Frame>
  );
}
