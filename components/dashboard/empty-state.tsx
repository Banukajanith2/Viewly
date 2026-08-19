import Link from "next/link";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";

/**
 * Shared empty state.
 *
 * Every dashboard page has three of these: no channel linked, no snapshot yet, and
 * nothing to show. Each explains WHY the page is empty and offers the next action,
 * because "no data" on its own reads as a bug.
 */
export function EmptyState({
  title,
  body,
  action,
  icon,
}: {
  title: string;
  body: ReactNode;
  action?: { href: string; label: string };
  icon?: ReactNode;
}) {
  return (
    <div className="bg-card flex flex-col items-center rounded-xl border px-6 py-14 text-center">
      {icon && <div className="text-muted-foreground mb-3">{icon}</div>}
      <h2 className="text-base font-medium">{title}</h2>
      <p className="text-muted-foreground mt-1.5 max-w-md text-sm text-pretty">{body}</p>
      {action && (
        <Button asChild size="sm" className="mt-5">
          <Link href={action.href}>{action.label}</Link>
        </Button>
      )}
    </div>
  );
}
