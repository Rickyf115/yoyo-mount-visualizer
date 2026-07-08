import { describe, expect, it } from "vitest";
import { THROWS, applyElement, mountElement, passElement } from "../src/core/elements.js";
import {
  extendBurst,
  frameAt,
  invertSmoothstep,
  smoothstep,
  type BurstStep,
  type Timeline,
} from "../src/viz/timeline.js";

const base = THROWS.breakaway.result();
const s1: BurstStep = { mount: applyElement(mountElement, base), hint: mountElement.motion(base) };
const passR = passElement({ side: "R", digit: "index" });
const s2: BurstStep = { mount: applyElement(passR, s1.mount), hint: passR.motion(s1.mount) };

describe("burst timeline", () => {
  it("inverts smoothstep", () => {
    for (const t of [0, 0.2, 0.5, 0.77, 1]) {
      expect(invertSmoothstep(smoothstep(t))).toBeCloseTo(t, 6);
    }
  });

  it("an empty burst shows the base at rest", () => {
    const frame = frameAt({ base, burst: [], raw: 0.4 });
    expect(frame.current).toBe(base);
    expect(frame.target).toBeUndefined();
  });

  it("walks the burst as raw advances, easing across the whole run", () => {
    const timeline: Timeline = { base, burst: [s1, s2], raw: 0 };
    expect(frameAt(timeline).current).toBe(base);
    expect(frameAt(timeline).target).toBe(s1);
    // halfway raw = eased midpoint of the burst = boundary between the steps
    const mid = frameAt({ ...timeline, raw: 0.5 });
    expect(mid.target).toBe(s2);
    expect(mid.current).toBe(s1.mount);
    // near the end the head is deep into the last transition
    const late = frameAt({ ...timeline, raw: 0.95 });
    expect(late.target).toBe(s2);
    expect(late.t).toBeGreaterThan(0.8);
  });

  it("is continuous across the step boundary (no stop between transitions)", () => {
    const timeline: Timeline = { base, burst: [s1, s2], raw: 0 };
    const easedAt = (raw: number) => smoothstep(raw) * 2;
    // velocity just before and after the boundary is identical (same curve)
    const before = easedAt(0.5) - easedAt(0.499);
    const after = easedAt(0.501) - easedAt(0.5);
    expect(before).toBeCloseTo(after, 4);
    // and the frame decomposition matches up at the seam
    const justBefore = frameAt({ ...timeline, raw: 0.4999 });
    const justAfter = frameAt({ ...timeline, raw: 0.5001 });
    expect(justBefore.t).toBeGreaterThan(0.999);
    expect(justAfter.t).toBeLessThan(0.001);
  });

  it("extending a playing burst keeps the visible position fixed", () => {
    const timeline: Timeline = { base, burst: [s1], raw: 0.6 };
    const before = smoothstep(timeline.raw) * 1;
    const extended = extendBurst(timeline, [s2]);
    const after = smoothstep(extended.raw) * 2;
    expect(after).toBeCloseTo(before, 6);
    expect(extended.burst.length).toBe(2);
  });
});
