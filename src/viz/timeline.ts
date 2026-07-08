import type { MotionHint } from "../core/elements.js";
import type { Mount } from "../core/schema.js";

/**
 * Burst timeline: a queued run of transitions plays as *one* continuous
 * motion. Easing is applied to the whole burst, not per transition — so a
 * breakaway → mount → pass → pass sequence accelerates once at the start and
 * settles once at the end instead of stopping between every hop.
 */

export interface BurstStep {
  mount: Mount;
  hint: MotionHint | null;
}

export interface Timeline {
  /** Where the burst started. */
  base: Mount;
  burst: BurstStep[];
  /** Unesaed progress through the whole burst, 0..1. */
  raw: number;
}

export interface TimelineFrame {
  current: Mount;
  target: BurstStep | undefined;
  /** Eased progress through the active transition, 0..1. */
  t: number;
}

export const smoothstep = (t: number): number => {
  const x = Math.min(Math.max(t, 0), 1);
  return x * x * (3 - 2 * x);
};

/** Inverse of smoothstep on [0, 1] (bisection; smoothstep is monotonic). */
export function invertSmoothstep(y: number): number {
  let lo = 0;
  let hi = 1;
  for (let i = 0; i < 40; i++) {
    const m = (lo + hi) / 2;
    if (smoothstep(m) < y) lo = m;
    else hi = m;
  }
  return (lo + hi) / 2;
}

export function frameAt(timeline: Timeline): TimelineFrame {
  const n = timeline.burst.length;
  if (n === 0) return { current: timeline.base, target: undefined, t: 0 };
  const eased = smoothstep(timeline.raw) * n;
  const index = Math.min(Math.floor(eased), n - 1);
  return {
    current: index === 0 ? timeline.base : timeline.burst[index - 1]!.mount,
    target: timeline.burst[index],
    t: eased - index,
  };
}

/**
 * Append steps while keeping the currently-visible position fixed: the
 * eased position must not jump when the burst grows under a playing head.
 */
export function extendBurst(timeline: Timeline, steps: BurstStep[]): Timeline {
  const burst = [...timeline.burst, ...steps];
  if (timeline.burst.length === 0 || timeline.raw === 0) {
    return { ...timeline, burst, raw: 0 };
  }
  const easedPosition = smoothstep(timeline.raw) * timeline.burst.length;
  return { ...timeline, burst, raw: invertSmoothstep(easedPosition / burst.length) };
}
