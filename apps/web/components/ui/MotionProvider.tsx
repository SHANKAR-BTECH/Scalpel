"use client";
import { LazyMotion, MotionConfig, domAnimation } from "motion/react";

/** Loads only the small animation feature set, and turns motion off for visitors who ask their device for less motion. */
export function MotionProvider({ children }: { children: React.ReactNode }) {
  return (
    <LazyMotion features={domAnimation} strict>
      <MotionConfig reducedMotion="user">{children}</MotionConfig>
    </LazyMotion>
  );
}
