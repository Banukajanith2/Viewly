"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const NAV = [
  { href: "/overview", label: "Overview" },
  { href: "/analytics", label: "Analytics" },
  { href: "/retention", label: "Retention" },
  { href: "/competitors", label: "Competitors" },
  { href: "/keyword-inspector", label: "Keywords" },
  { href: "/cross-platform", label: "Cross-platform" },
  { href: "/settings", label: "Settings" },
];

export function DashboardNav() {
  const pathname = usePathname();

  return (
    <nav className="flex gap-1 overflow-x-auto">
      {NAV.map((item) => {
        const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
        return (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              "rounded-md px-3 py-2 text-sm whitespace-nowrap transition-colors",
              active
                ? "bg-accent text-accent-foreground font-medium"
                : "text-muted-foreground hover:text-foreground hover:bg-accent/50",
            )}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
