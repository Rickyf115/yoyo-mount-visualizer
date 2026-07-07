import { describe, expect, it } from "vitest";
import { loadMountFixtures } from "../src/core/index.js";
import { WRAP_RADIUS, WRAP_SPACING, layoutMount } from "../src/viz/layout.js";
import { anchorContactCenter, defaultRig } from "../src/viz/rig.js";
import { makeTrapeze } from "./helpers.js";

const mounts = loadMountFixtures();
const layoutOf = (id: string) => {
  const mount = mounts.get(id)!;
  return layoutMount(mount, defaultRig(mount.spin));
};
const anchorOf = (mountId: string, anchorId: string) =>
  mounts.get(mountId)!.anchors.find((a) => a.id === anchorId)!;

describe("layoutMount", () => {
  it("produces finite control points and one point-run per contact for every fixture", () => {
    for (const mount of mounts.values()) {
      const { controlPoints, contactArcs, yoyo } = layoutMount(mount, defaultRig(mount.spin));
      expect(contactArcs.length).toBe(mount.contacts.length);
      expect(controlPoints.length).toBeGreaterThanOrEqual(mount.contacts.length * 2 - 1);
      for (const p of [...controlPoints, yoyo.center, yoyo.axis]) {
        expect(p.every(Number.isFinite)).toBe(true);
      }
    }
  });

  it("hangs the trapeze yo-yo between the hands, below the string line", () => {
    const rig = defaultRig("side");
    const { yoyo } = layoutOf("trapeze");
    const loop = anchorContactCenter(rig, anchorOf("trapeze", "th-loop"));
    const nthIndex = anchorContactCenter(rig, anchorOf("trapeze", "nth-index"));
    expect(yoyo.center[0]).toBeGreaterThan(nthIndex[0]);
    expect(yoyo.center[0]).toBeLessThan(loop[0]);
    expect(yoyo.center[1]).toBeLessThan(Math.min(loop[1], nthIndex[1]));
  });

  it("hangs the brother yo-yo below the throwhand index (gap abuts the axle)", () => {
    const rig = defaultRig("side");
    const { yoyo } = layoutOf("brother");
    const thIndex = anchorContactCenter(rig, anchorOf("brother", "th-index"));
    expect(yoyo.center[0]).toBeCloseTo(thIndex[0], 5);
    expect(yoyo.center[1]).toBeLessThan(thIndex[1] - 0.2);
  });

  it("hangs the dead-string yo-yo straight below the loop", () => {
    const rig = defaultRig("front");
    const { yoyo } = layoutOf("dead-string");
    const loop = anchorContactCenter(rig, anchorOf("dead-string", "th-loop"));
    expect(yoyo.center[0]).toBeCloseTo(loop[0], 5);
    expect(yoyo.center[2]).toBeCloseTo(loop[2], 5);
    expect(yoyo.center[1]).toBeLessThan(loop[1] - 0.4);
  });

  it("wraps a trapeze around the finger: arc over the top, strands splayed apart", () => {
    const rig = defaultRig("side");
    const center = anchorContactCenter(rig, anchorOf("trapeze", "nth-index"));
    const arc = layoutOf("trapeze").contactArcs[2]!;
    // apex clears the top of the finger
    expect(Math.max(...arc.map((p) => p[1]))).toBeGreaterThan(center[1] + WRAP_RADIUS * 0.8);
    // entry and exit tangent points sit apart — the wrap visibly opens up
    const first = arc[0]!;
    const last = arc[arc.length - 1]!;
    expect(Math.hypot(first[0] - last[0], first[1] - last[1])).toBeGreaterThan(WRAP_RADIUS);
  });

  it("renders an under wrap below the finger", () => {
    const rig = defaultRig("side");
    const underMount = makeTrapeze();
    underMount.contacts[2]!.wrap = "under";
    const arc = layoutMount(underMount, rig).contactArcs[2]!;
    const center = anchorContactCenter(rig, underMount.anchors[2]!);
    expect(Math.min(...arc.map((p) => p[1]))).toBeLessThan(center[1] - WRAP_RADIUS * 0.8);
  });

  it("coils the slipknot loop all the way around the middle finger", () => {
    const rig = defaultRig("side");
    const coil = layoutOf("trapeze").contactArcs[0]!;
    const center = anchorContactCenter(rig, anchorOf("trapeze", "th-loop"));
    expect(coil.length).toBeGreaterThanOrEqual(6);
    // a full coil covers both the top and the bottom of the finger
    expect(Math.max(...coil.map((p) => p[1]))).toBeGreaterThan(center[1] + WRAP_RADIUS * 0.7);
    expect(Math.min(...coil.map((p) => p[1]))).toBeLessThan(center[1] - WRAP_RADIUS * 0.7);
  });

  it("stacks repeated wraps on the same anchor apart along the finger", () => {
    const { contactArcs } = layoutOf("double-or-nothing");
    // double or nothing: contacts [loop, gap, nth, th, nth, axle]
    const meanZ = (arc: readonly (readonly number[])[]) =>
      arc.reduce((s, p) => s + p[2]!, 0) / arc.length;
    expect(meanZ(contactArcs[4]!) - meanZ(contactArcs[2]!)).toBeCloseTo(WRAP_SPACING, 5);
  });

  it("orients the yo-yo axis to the string plane: side spin faces the audience, front spin faces sideways", () => {
    expect(layoutOf("trapeze").yoyo.axis).toEqual([0, 0, 1]);
    expect(layoutOf("front-mount").yoyo.axis).toEqual([1, 0, 0]);
  });

  it("lays the same traversal out in different planes for the trapeze / front mount twins", () => {
    const trapeze = layoutOf("trapeze");
    const front = layoutOf("front-mount");
    const spread = (pts: readonly (readonly number[])[], axis: 0 | 2) =>
      Math.max(...pts.map((p) => p[axis]!)) - Math.min(...pts.map((p) => p[axis]!));
    // side spin spreads across x, front spin across z
    expect(spread(trapeze.controlPoints, 0)).toBeGreaterThan(spread(trapeze.controlPoints, 2));
    expect(spread(front.controlPoints, 2)).toBeGreaterThan(spread(front.controlPoints, 0));
  });
});
