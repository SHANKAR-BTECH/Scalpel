"use client";
/** One place for motion settings: respects the visitor's "reduce motion" setting everywhere. */
import { MotionConfig } from "framer-motion";

export function Motion({ children }: { children: React.ReactNode }) {
  return <MotionConfig reducedMotion="user" transition={{ type: "spring", stiffness: 380, damping: 34 }}>{children}</MotionConfig>;
}
