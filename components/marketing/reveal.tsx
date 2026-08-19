"use client";

import { motion, useReducedMotion } from "motion/react";

/**
 * Reveals content as it scrolls into view.
 *
 * `whileInView` with `once` so a section animates the first time it is reached and
 * never again: re-animating on every scroll past is the thing that makes a page
 * feel like a demo reel rather than a product.
 *
 * The viewport margin fires the animation slightly BEFORE the element reaches the
 * bottom edge. Waiting until it is fully visible means the reader watches it fade
 * in, which reads as slow; starting early means it has usually settled by the time
 * they look at it.
 *
 * Reduced motion returns the children untouched rather than shortening the
 * animation, because that setting is a request to stop, not to hurry.
 */
export function Reveal({
  children,
  delay = 0,
  y = 16,
  className,
}: {
  children: React.ReactNode;
  delay?: number;
  y?: number;
  className?: string;
}) {
  const reduced = useReducedMotion();
  if (reduced) return <div className={className}>{children}</div>;

  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "0px 0px -80px 0px" }}
      transition={{
        duration: 0.5,
        delay,
        // The same decelerating curve as the app shell, so the marketing page and
        // the product move alike.
        ease: [0.22, 1, 0.36, 1],
      }}
    >
      {children}
    </motion.div>
  );
}

/**
 * Staggers a list of children.
 *
 * Separate from Reveal because a stagger needs a parent to own the timing. Kept
 * small: a long stagger across six cards means the last one arrives well after the
 * reader has already looked at it.
 */
export function RevealGroup({
  children,
  className,
  stagger = 0.07,
}: {
  children: React.ReactNode;
  className?: string;
  stagger?: number;
}) {
  const reduced = useReducedMotion();
  if (reduced) return <div className={className}>{children}</div>;

  return (
    <motion.div
      className={className}
      initial="hidden"
      whileInView="visible"
      viewport={{ once: true, margin: "0px 0px -80px 0px" }}
      variants={{ visible: { transition: { staggerChildren: stagger } } }}
    >
      {children}
    </motion.div>
  );
}

export function RevealItem({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  const reduced = useReducedMotion();
  if (reduced) return <div className={className}>{children}</div>;

  return (
    <motion.div
      className={className}
      variants={{
        hidden: { opacity: 0, y: 16 },
        visible: {
          opacity: 1,
          y: 0,
          transition: { duration: 0.5, ease: [0.22, 1, 0.36, 1] },
        },
      }}
    >
      {children}
    </motion.div>
  );
}
