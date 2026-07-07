import { describe, expect, it } from "vitest";
import { loadMountFixtures } from "../src/core/index.js";
import { layoutMount } from "../src/viz/layout.js";
import { defaultRig } from "../src/viz/rig.js";
import { makeTrapeze } from "./helpers.js";

const mounts = loadMountFixtures();
const layoutOf = (id: string) => {
  const mount = mounts.get(id)!;
  return layoutMount(mount, defaultRig(mount.spin));
};

describe("layoutMount", () => {
  it("produces finite control points for every fixture", () => {
    for (const mount of mounts.values()) {
      const { controlPoints, yoyo } = layoutMount(mount, defaultRig(mount.spin));
      // one point per contact plus one sag point per segment
      expect(controlPoints.length).toBe(mount.contacts.length * 2 - 1);
      for (const p of [...controlPoints, yoyo.center, yoyo.axis]) {
        expect(p.every(Number.isFinite)).toBe(true);
      }
    }
  });

  it("hangs the trapeze yo-yo between the hands, below the string line", () => {
    const rig = defaultRig("side");
    const { yoyo } = layoutOf("trapeze");
    const loop = rig.hands.R.digits.middle;
    const nthIndex = rig.hands.L.digits.index;
    expect(yoyo.center[0]).toBeGreaterThan(nthIndex[0]);
    expect(yoyo.center[0]).toBeLessThan(loop[0]);
    expect(yoyo.center[1]).toBeLessThan(Math.min(loop[1], nthIndex[1]));
  });

  it("hangs the brother yo-yo below the throwhand index (gap abuts the axle)", () => {
    const rig = defaultRig("side");
    const { yoyo } = layoutOf("brother");
    const thIndex = rig.hands.R.digits.index;
    expect(yoyo.center[0]).toBeCloseTo(thIndex[0], 5);
    expect(yoyo.center[1]).toBeLessThan(thIndex[1] - 0.2);
  });

  it("hangs the dead-string yo-yo straight below the loop", () => {
    const rig = defaultRig("front");
    const { yoyo } = layoutOf("dead-string");
    const loop = rig.hands.R.digits.middle;
    expect(yoyo.center[0]).toBeCloseTo(loop[0], 5);
    expect(yoyo.center[2]).toBeCloseTo(loop[2], 5);
    expect(yoyo.center[1]).toBeLessThan(loop[1] - 0.4);
  });

  it("renders an over wrap above the fingertip and an under wrap below it", () => {
    const rig = defaultRig("side");
    const tip = rig.hands.L.digits.index;

    const over = layoutMount(makeTrapeze(), rig);
    // contact 2 (nth-index) sits at control point index 4 (sag points interleave)
    expect(over.controlPoints[4]![1]).toBeGreaterThan(tip[1]);

    const underMount = makeTrapeze();
    underMount.contacts[2]!.wrap = "under";
    const under = layoutMount(underMount, rig);
    expect(under.controlPoints[4]![1]).toBeLessThan(tip[1]);
  });

  it("stacks repeated wraps on the same anchor apart along the plane normal", () => {
    const { controlPoints } = layoutOf("double-or-nothing");
    // double or nothing: contacts [loop, gap, nth, th, nth, axle] → contact i
    // sits at control point 2i; the two nth-index visits are contacts 2 and 4.
    const firstVisit = controlPoints[4]!;
    const secondVisit = controlPoints[8]!;
    expect(secondVisit[2] - firstVisit[2]).toBeCloseTo(0.028, 5);
    expect(firstVisit[0]).toBeCloseTo(secondVisit[0], 5);
    expect(firstVisit[1]).toBeCloseTo(secondVisit[1], 5);
  });

  it("orients the yo-yo axis to the string plane: side spin faces the audience, front spin faces sideways", () => {
    expect(layoutOf("trapeze").yoyo.axis).toEqual([0, 0, 1]);
    expect(layoutOf("front-mount").yoyo.axis).toEqual([1, 0, 0]);
  });

  it("lays the same traversal out in different planes for the trapeze / front mount twins", () => {
    const trapeze = layoutOf("trapeze");
    const front = layoutOf("front-mount");
    const spreadZ = (pts: readonly (readonly number[])[]) =>
      Math.max(...pts.map((p) => p[2]!)) - Math.min(...pts.map((p) => p[2]!));
    const spreadX = (pts: readonly (readonly number[])[]) =>
      Math.max(...pts.map((p) => p[0]!)) - Math.min(...pts.map((p) => p[0]!));
    // side spin spreads across x, front spin across z
    expect(spreadX(trapeze.controlPoints)).toBeGreaterThan(spreadZ(trapeze.controlPoints));
    expect(spreadZ(front.controlPoints)).toBeGreaterThan(spreadX(front.controlPoints));
  });
});
