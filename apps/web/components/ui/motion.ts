/** One spring for the whole site, so every press, slide and toggle moves the same way. */
export const SPRING = { type: "spring", stiffness: 420, damping: 34, mass: 0.8 } as const;
export const EASE_OUT = [0.16, 1, 0.3, 1] as const;
