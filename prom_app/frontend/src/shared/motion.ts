export const easing = [0.22, 1, 0.36, 1] as const;
export const transition = (reduce: boolean | null, exit = false) => ({
  duration: reduce ? 0.08 : exit ? 0.14 : 0.2,
  ease: easing,
});
export const appearance = (reduce: boolean | null) => ({
  initial: { opacity: 0, y: reduce ? 0 : 5 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: reduce ? 0 : 3 },
  transition: transition(reduce),
});
