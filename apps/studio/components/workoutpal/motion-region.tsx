"use client";

import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import type { ReactNode } from "react";

export function MotionRegion({
  children,
  className,
  open,
}: {
  readonly children: ReactNode;
  readonly className?: string;
  readonly open: boolean;
}) {
  const reducedMotion = useReducedMotion();
  return (
    <AnimatePresence initial={false}>
      {open ? (
        <motion.div
          animate={{ opacity: 1, x: 0 }}
          className={className}
          exit={reducedMotion ? { opacity: 0 } : { opacity: 0, x: 12 }}
          initial={reducedMotion ? { opacity: 0 } : { opacity: 0, x: 12 }}
          transition={{ duration: reducedMotion ? 0 : 0.16, ease: "easeOut" }}
        >
          {children}
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
