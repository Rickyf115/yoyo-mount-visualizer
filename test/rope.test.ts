import { describe, expect, it } from "vitest";
import {
  createRope,
  ropePoints,
  setRestLength,
  stepRope,
  type Capsule,
  type Pin,
  type Vec3,
} from "../src/sim/rope.js";

/** A horizontal line of N points from a to b. */
function line(a: Vec3, b: Vec3, n = 41): Vec3[] {
  return Array.from({ length: n }, (_, i) => {
    const t = i / (n - 1);
    return [
      a[0] + (b[0] - a[0]) * t,
      a[1] + (b[1] - a[1]) * t,
      a[2] + (b[2] - a[2]) * t,
    ] as Vec3;
  });
}

const endPins = (n = 41): Pin[] => [
  { index: 0, position: [-0.5, 1, 0] },
  { index: n - 1, position: [0.5, 1, 0] },
];

const settle = (rope: ReturnType<typeof createRope>, pins: Pin[], caps: Capsule[] = []) => {
  for (let i = 0; i < 240; i++) stepRope(rope, 1 / 60, pins, caps);
};

describe("verlet rope", () => {
  it("sags below the line between two pinned ends", () => {
    const rope = createRope(line([-0.5, 1, 0], [0.5, 1, 0]), 1.1);
    settle(rope, endPins());
    const points = ropePoints(rope);
    const midY = points[20]![1];
    expect(midY).toBeLessThan(0.99);
    expect(midY).toBeGreaterThan(0.7); // sags, but doesn't fall away
  });

  it("keeps pinned particles exactly at their pins", () => {
    const rope = createRope(line([-0.5, 1, 0], [0.5, 1, 0]), 1.1);
    settle(rope, endPins());
    const points = ropePoints(rope);
    expect(points[0]).toEqual([-0.5, 1, 0]);
    expect(points[40]).toEqual([0.5, 1, 0]);
  });

  it("preserves total length within tolerance after settling", () => {
    const rope = createRope(line([-0.5, 1, 0], [0.5, 1, 0]), 1.1);
    const rest = rope.segmentLength * 40;
    settle(rope, endPins());
    const points = ropePoints(rope);
    let length = 0;
    for (let i = 1; i < points.length; i++) {
      length += Math.hypot(
        points[i]![0] - points[i - 1]![0],
        points[i]![1] - points[i - 1]![1],
        points[i]![2] - points[i - 1]![2],
      );
    }
    expect(Math.abs(length - rest) / rest).toBeLessThan(0.05);
  });

  it("does not explode over a long run (finite, bounded positions)", () => {
    const rope = createRope(line([-0.5, 1, 0], [0.5, 1, 0]), 1.1);
    for (let i = 0; i < 1200; i++) stepRope(rope, 1 / 60, endPins());
    for (const p of ropePoints(rope)) {
      expect(p.every(Number.isFinite)).toBe(true);
      expect(Math.abs(p[1])).toBeLessThan(5);
    }
  });

  it("is deterministic for identical inputs", () => {
    const run = () => {
      const rope = createRope(line([-0.5, 1, 0], [0.5, 1, 0]), 1.1);
      settle(rope, endPins());
      return ropePoints(rope);
    };
    expect(run()).toEqual(run());
  });

  it("stays outside capsule colliders", () => {
    // Drape over a horizontal finger between the pins, then check clearance.
    const capsule: Capsule = { a: [0, 0.9, -0.1], b: [0, 0.9, 0.1], radius: 0.03 };
    const rope = createRope(line([-0.5, 1, 0], [0.5, 1, 0]), 1.3);
    settle(rope, endPins(), [capsule]);
    for (const p of ropePoints(rope)) {
      const t = Math.min(1, Math.max(0, (p[2] + 0.1) / 0.2));
      const cx = p[0] - 0;
      const cy = p[1] - 0.9;
      const cz = p[2] - (-0.1 + 0.2 * t);
      expect(Math.hypot(cx, cy, cz)).toBeGreaterThan(0.029);
    }
  });

  it("tracks moving pins without instability", () => {
    const rope = createRope(line([-0.5, 1, 0], [0.5, 1, 0]), 1.1);
    for (let frame = 0; frame < 300; frame++) {
      const angle = (frame / 300) * Math.PI * 2;
      const pins: Pin[] = [
        { index: 0, position: [-0.5, 1, 0] },
        { index: 40, position: [0.5 * Math.cos(angle), 1 + 0.3 * Math.sin(angle), 0] },
      ];
      stepRope(rope, 1 / 60, pins);
    }
    for (const p of ropePoints(rope)) expect(p.every(Number.isFinite)).toBe(true);
  });

  it("re-targeting rest length changes the sag", () => {
    const rope = createRope(line([-0.5, 1, 0], [0.5, 1, 0]), 1.02);
    settle(rope, endPins());
    const taut = ropePoints(rope)[20]![1];
    setRestLength(rope, 1.4);
    settle(rope, endPins());
    const slack = ropePoints(rope)[20]![1];
    expect(slack).toBeLessThan(taut - 0.05);
  });
});
