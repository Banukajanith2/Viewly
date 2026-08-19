"use client";

import { usePathname } from "next/navigation";
import { motion, useReducedMotion } from "motion/react";

/**
 * Settles page content in on navigation.
 *
 * Keyed on the pathname, so React remounts on a route change and the entrance
 * replays per page rather than once per session.
 *
 * There is deliberately NO exit animation and no AnimatePresence. Every page here
 * is a Server Component that reads Firestore before it can render, so navigation
 * already costs a second or more. mode="wait" would hold the incoming page back
 * until the outgoing one finished fading, adding a further ~0.3s to a transition
 * that is already the slow part. The loading skeleton is what fills that gap, and
 * it needs to appear the instant the route changes.
 *
 * Short and small on purpose. A long slide makes an app feel slower than no
 * animation at all, because nothing is legible until it finishes.
 */
export function PageTransition({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const reduced = useReducedMotion();

  // Honours the OS setting rather than merely shortening the animation. Reduced
  // motion is a request to stop, not to hurry.
  if (reduced) return <>{children}</>;

  return (
    <motion.div
      key={pathname}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{
        duration: 0.26,
        // The same decelerating curve the rail spring settles on, so the whole
        // interface accelerates alike. That consistency is most of what reads as
        // polish rather than as decoration.
        ease: [0.22, 1, 0.36, 1],
      }}
    >
      {children}
    </motion.div>
  );
}
