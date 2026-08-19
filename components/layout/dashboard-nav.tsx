"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import {
  BarChart3,
  Gauge,
  Hash,
  LayoutGrid,
  Settings,
  Share2,
  Users,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { ViewlyMark } from "@/components/layout/viewly-mark";
import { cn } from "@/lib/utils";

/**
 * Collapsed icon rail that expands on hover and on keyboard focus.
 *
 * Three things this deliberately does NOT do:
 *
 * It does not expand by pushing the page. The panel is absolutely positioned over
 * the content while the rail keeps a fixed gutter, so nothing reflows. A layout
 * that reshuffles every time the pointer crosses it is unusable.
 *
 * It does not rely on hover alone. Hover does not exist on touch, and a keyboard
 * user tabbing into a collapsed rail would be navigating labels they cannot read,
 * so focus opens it too and every link keeps an accessible name either way.
 *
 * It does not animate for people who asked it not to. useReducedMotion drops the
 * spring entirely rather than shortening it.
 */

interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  /** Kept short: this is read at a glance, not studied. */
  hint: string;
}

/** The views of the channel itself, in the order a creator works through them. */
const NAV: NavItem[] = [
  { href: "/overview", label: "Overview", icon: LayoutGrid, hint: "Channel at a glance" },
  { href: "/analytics", label: "Analytics", icon: BarChart3, hint: "Trends and insights" },
  { href: "/retention", label: "Retention", icon: Gauge, hint: "Where viewers leave" },
  { href: "/competitors", label: "Competitors", icon: Users, hint: "Channels your size" },
  { href: "/keyword-inspector", label: "Keywords", icon: Hash, hint: "Niche and trending" },
  { href: "/cross-platform", label: "Cross-platform", icon: Share2, hint: "TikTok and Reels" },
];

/**
 * Pinned to the bottom of the rail.
 *
 * Settings configures the account rather than showing anything about the channel,
 * so it does not belong in the same reading order as the views above it. Bottom
 * placement is also where people look for it, which matters more than the taxonomy.
 */
const FOOTER_NAV: NavItem[] = [
  { href: "/settings", label: "Settings", icon: Settings, hint: "Account and alerts" },
];

const RAIL = 64;
const PANEL = 248;

/**
 * Firm and quick, with no bounce.
 *
 * A spring that overshoots is fine for something with no layout consequence, but a
 * panel that springs past its own width and settles back reads as a rendering
 * glitch. This is damped hard on purpose.
 */
const PANEL_SPRING = { type: "spring" as const, stiffness: 420, damping: 38, mass: 0.9 };

export function DashboardNav() {
  const pathname = usePathname();
  const reduced = useReducedMotion();
  const [expanded, setExpanded] = useState(false);

  return (
    <nav
      aria-label="Dashboard"
      // Fixed gutter. This width never animates, which is what stops the page
      // reflowing when the panel opens over it.
      className="relative z-30 hidden shrink-0 md:block"
      style={{ width: RAIL }}
      onMouseEnter={() => setExpanded(true)}
      onMouseLeave={() => setExpanded(false)}
      // Focus is what makes the rail usable without a pointer. These bubble from
      // the links, so every item is covered.
      onFocus={() => setExpanded(true)}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setExpanded(false);
      }}
    >
      <motion.div
        className="bg-card absolute inset-y-0 left-0 flex flex-col overflow-hidden border-r"
        initial={false}
        animate={{
          width: expanded ? PANEL : RAIL,
          boxShadow: expanded
            ? "0 12px 32px -8px rgb(0 0 0 / 0.28)"
            : "0 0px 0px 0px rgb(0 0 0 / 0)",
        }}
        transition={reduced ? { duration: 0 } : PANEL_SPRING}
      >
        {/* Brand. Occupies the top of the rail so the icon column starts below the
            header line rather than flush against it, and the wordmark completes
            itself when the panel opens. */}
        <Link
          href="/overview"
          aria-label="Viewly, go to overview"
          className="focus-visible:ring-ring flex h-14 shrink-0 items-center gap-3 px-4 focus-visible:ring-2 focus-visible:outline-none"
        >
          <ViewlyMark className="size-6 shrink-0" style={{ color: "var(--viz-series)" }} />
          <AnimatePresence initial={false} mode="wait">
            {expanded && (
              <motion.span
                key="wordmark"
                className="text-base font-semibold tracking-tight whitespace-nowrap"
                initial={reduced ? false : { opacity: 0, x: -4 }}
                animate={{ opacity: 1, x: 0 }}
                exit={reduced ? { opacity: 0 } : { opacity: 0, x: -4 }}
                transition={
                  reduced
                    ? { duration: 0 }
                    : { duration: 0.16, delay: 0.06, ease: [0.22, 1, 0.36, 1] }
                }
              >
                Viewly
              </motion.span>
            )}
          </AnimatePresence>
        </Link>

        <ul className="flex flex-1 flex-col gap-1 p-2">
          {NAV.map((item) => (
            <RailItem key={item.href} item={item} pathname={pathname}
              expanded={expanded} reduced={Boolean(reduced)} />
          ))}
        </ul>

        {/* mt-auto on the list above would fight the flex-1; a separate group with
            a divider keeps the split explicit. */}
        <ul className="flex flex-col gap-1 border-t p-2">
          {FOOTER_NAV.map((item) => (
            <RailItem key={item.href} item={item} pathname={pathname}
              expanded={expanded} reduced={Boolean(reduced)} />
          ))}
        </ul>

      </motion.div>
    </nav>
  );
}

/** One rail entry. Shared so the pinned group cannot drift from the main one. */
function RailItem({
  item,
  pathname,
  expanded,
  reduced,
}: {
  item: NavItem;
  pathname: string;
  expanded: boolean;
  reduced: boolean;
}) {
  const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
  const Icon = item.icon;

  return (
    <li>
      <Link
        href={item.href}
        aria-current={active ? "page" : undefined}
        className={cn(
          "flex items-center gap-3 rounded-lg p-3 transition-colors",
          "focus-visible:ring-ring focus-visible:ring-2 focus-visible:outline-none",
          active
            ? "bg-accent text-accent-foreground font-medium"
            : "text-muted-foreground hover:bg-accent/50 hover:text-foreground",
        )}
      >
        {/* The active item keeps its own accent, so the current page is
            identifiable while collapsed, when no label is readable. */}
        <Icon
          className="size-5 shrink-0"
          style={active ? { color: "var(--viz-series)" } : undefined}
          aria-hidden
        />

        {/* The label stays in the accessibility tree either way, so the link is
            never an unnamed icon. Only its visible form changes: sr-only when
            collapsed rather than removed. */}
        <AnimatePresence initial={false} mode="wait">
          {expanded ? (
            <motion.span
              key="label"
              className="flex min-w-0 flex-col"
              initial={reduced ? false : { opacity: 0, x: -4 }}
              animate={{ opacity: 1, x: 0 }}
              exit={reduced ? { opacity: 0 } : { opacity: 0, x: -4 }}
              // Trails the panel slightly. Fading text in at the same rate the
              // panel opens makes it look smeared mid-transition.
              transition={
                reduced
                  ? { duration: 0 }
                  : { duration: 0.16, delay: 0.06, ease: [0.22, 1, 0.36, 1] }
              }
            >
              <span className="truncate text-sm leading-tight whitespace-nowrap">
                {item.label}
              </span>
              <span className="text-muted-foreground truncate text-xs leading-tight whitespace-nowrap">
                {item.hint}
              </span>
            </motion.span>
          ) : (
            <span key="sr" className="sr-only">
              {item.label}
            </span>
          )}
        </AnimatePresence>
      </Link>
    </li>
  );
}

/**
 * Horizontal nav for narrow screens.
 *
 * A hover rail is meaningless on a phone, so small screens keep the scrolling row
 * rather than a rail that could never expand.
 */
export function DashboardNavMobile() {
  const pathname = usePathname();

  return (
    <nav aria-label="Dashboard" className="flex gap-1 overflow-x-auto md:hidden">
      {[...NAV, ...FOOTER_NAV].map((item) => {
        const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
        const Icon = item.icon;
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex items-center gap-1.5 rounded-md px-3 py-2 text-sm whitespace-nowrap transition-colors",
              active
                ? "bg-accent text-accent-foreground font-medium"
                : "text-muted-foreground hover:bg-accent/50 hover:text-foreground",
            )}
          >
            <Icon className="size-4" aria-hidden />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
