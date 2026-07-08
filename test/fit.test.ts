import { describe, expect, it } from "vitest";
import { loadMountFixtures } from "../src/core/index.js";
import { STRING_LENGTH, fitLayout, layoutLength } from "../src/viz/layout.js";
import { spreadAxis } from "../src/viz/rig.js";
import { dot } from "../src/viz/vec.js";

const mounts = loadMountFixtures();

describe("fitLayout (constant string length)", () => {
  it("lays every fixture out within 2% of the one string length", () => {
    for (const mount of mounts.values()) {
      const { layout } = fitLayout(mount, mount.spin);
      const length = layoutLength(layout);
      expect(
        Math.abs(length - STRING_LENGTH) / STRING_LENGTH,
        `${mount.id}: ${length.toFixed(3)} vs ${STRING_LENGTH}`,
      ).toBeLessThan(0.02);
    }
  });

  it("pulls the hands closer for wrap-heavy mounts", () => {
    const spreadOf = (id: string) => {
      const mount = mounts.get(id)!;
      const fitted = fitLayout(mount, mount.spin);
      const axis = spreadAxis(fitted.rig);
      return Math.abs(
        dot(fitted.rig.hands.R.palm, axis) - dot(fitted.rig.hands.L.palm, axis),
      );
    };
    expect(spreadOf("double-or-nothing")).toBeLessThan(spreadOf("trapeze"));
    expect(spreadOf("triple-or-nothing")).toBeLessThan(spreadOf("double-or-nothing"));
  });

  it("drops the bare-string yo-yo deep to consume the whole budget", () => {
    const dead = mounts.get("dead-string")!;
    const { layout, rig, spread } = fitLayout(dead, dead.spin);
    expect(spread).toBe(1); // a bare string never needs the hands to move
    const loopY = rig.hands.R.digits.middle.base[1];
    expect(loopY - layout.yoyo.center[1]).toBeGreaterThan(0.7);
  });

  it("keeps the yo-yo above the floor for every fixture", () => {
    for (const mount of mounts.values()) {
      const { layout } = fitLayout(mount, mount.spin);
      expect(layout.yoyo.center[1], mount.id).toBeGreaterThan(0.06);
    }
  });
});
