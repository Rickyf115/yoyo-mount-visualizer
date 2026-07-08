import { describe, expect, it } from "vitest";
import {
  THROWS,
  applyElement,
  dismountElement,
  mountElement,
  passElement,
} from "../src/core/elements.js";
import { loadMountFixtures } from "../src/core/index.js";
import { layoutMount } from "../src/viz/layout.js";
import {
  commonContacts,
  contactInfos,
  layoutPins,
  resolvePivot,
  transitionPath,
  yoyoArcPath,
} from "../src/viz/motion.js";
import { anchorContactCenter, defaultRig } from "../src/viz/rig.js";

const mounts = loadMountFixtures();
const rig = defaultRig("side");

const sample = (path: (t: number) => readonly number[], n = 64) =>
  Array.from({ length: n + 1 }, (_, i) => path(i / n));

describe("yoyoArcPath", () => {
  it("matches its endpoints", () => {
    const path = yoyoArcPath([0.5, 0.6, 0], [-0.2, 0.7, 0], [0, 1.1, 0], [0, 0, 1], "over");
    expect(path(0).map((v) => +v.toFixed(6))).toEqual([0.5, 0.6, 0]);
    expect(path(1).map((v) => +v.toFixed(6))).toEqual([-0.2, 0.7, 0]);
  });

  it("with sweep=over crosses above the pivot even when the short way would not", () => {
    // both endpoints hang below the pivot
    const pivot: [number, number, number] = [0, 1.1, 0];
    const path = yoyoArcPath([0.4, 0.6, 0], [-0.3, 0.55, 0], pivot, [0, 0, 1], "over");
    const maxY = Math.max(...sample(path).map((p) => p[1]!));
    expect(maxY).toBeGreaterThan(pivot[1]);
  });

  it("with sweep=shortest stays below when both endpoints are below", () => {
    const pivot: [number, number, number] = [0, 1.1, 0];
    const path = yoyoArcPath([0.4, 0.6, 0], [-0.3, 0.55, 0], pivot, [0, 0, 1], "shortest");
    const maxY = Math.max(...sample(path).map((p) => p[1]!));
    expect(maxY).toBeLessThan(pivot[1]);
  });

  it("with sweep=under crosses beneath the pivot even when the short way would not", () => {
    // both endpoints sit above the pivot: the underpass scoops beneath it
    const pivot: [number, number, number] = [0, 1.0, 0];
    const path = yoyoArcPath([0.3, 1.3, 0], [-0.3, 1.25, 0], pivot, [0, 0, 1], "under");
    const minY = Math.min(...sample(path).map((p) => p[1]!));
    expect(minY).toBeLessThan(pivot[1]);
  });

  it("makes a full loop over the pivot when start and end coincide", () => {
    const start: [number, number, number] = [0.4, 0.6, 0];
    const pivot: [number, number, number] = [0, 1.1, 0];
    const path = yoyoArcPath(start, start, pivot, [0, 0, 1], "over");
    const points = sample(path);
    const maxY = Math.max(...points.map((p) => p[1]!));
    const minX = Math.min(...points.map((p) => p[0]!));
    expect(maxY).toBeGreaterThan(pivot[1]); // over the top
    expect(minX).toBeLessThan(pivot[0]); // …and around the far side
  });
});

describe("transitionPath from element hints", () => {
  it("mount swings the yo-yo up over the catching finger", () => {
    const from = THROWS.breakaway.result();
    const to = applyElement(mountElement, from);
    const hint = mountElement.motion(from)!;
    const pivot = resolvePivot(hint, rig);
    const nthIndex = anchorContactCenter(rig, {
      id: "x",
      kind: "finger",
      side: "L",
      digit: "index",
    });
    expect(pivot).toEqual(nthIndex);
    const path = transitionPath(hint, rig, layoutMount(from, rig), layoutMount(to, rig));
    const maxY = Math.max(...sample(path).map((p) => p[1]!));
    expect(maxY).toBeGreaterThan(pivot[1]);
  });

  it("pass swings around the target finger and returns near its start", () => {
    const trapeze = mounts.get("trapeze")!;
    const element = passElement({ side: "R", digit: "index" });
    const to = applyElement(element, trapeze);
    const hint = element.motion(trapeze)!;
    const pivot = resolvePivot(hint, rig);
    const path = transitionPath(hint, rig, layoutMount(trapeze, rig), layoutMount(to, rig));
    const points = sample(path);
    const maxY = Math.max(...points.map((p) => p[1]!));
    expect(maxY).toBeGreaterThan(pivot[1]); // over the throwhand index
    // mounted position barely moves, so the swing must come back around
    const travel = Math.hypot(
      path(1)[0]! - path(0)[0]!,
      path(1)[1]! - path(0)[1]!,
    );
    expect(travel).toBeLessThan(0.2);
  });

  it("dismount pendulums down without being forced over the hand", () => {
    const trapeze = mounts.get("trapeze")!;
    const to = applyElement(dismountElement, trapeze);
    const hint = dismountElement.motion(trapeze)!;
    expect(hint.sweep).toBe("shortest");
    const path = transitionPath(hint, rig, layoutMount(trapeze, rig), layoutMount(to, rig));
    const pivot = resolvePivot(hint, rig);
    const maxY = Math.max(...sample(path).map((p) => p[1]!));
    expect(maxY).toBeLessThan(pivot[1]);
  });
});

describe("layoutPins", () => {
  it("pins the rope ends and tags kinds, monotonically increasing", () => {
    const trapeze = mounts.get("trapeze")!;
    const layout = layoutMount(trapeze, rig);
    const pins = layoutPins(layout, contactInfos(trapeze), 120);
    expect(pins[0]!.index).toBe(0);
    expect(pins[pins.length - 1]!.index).toBe(119);
    expect(pins[0]!.kind).toBe("loop");
    expect(pins[pins.length - 1]!.kind).toBe("axle");
    const indices = pins.map((p) => p.index);
    expect([...indices].sort((a, b) => a - b)).toEqual(indices);
    // wraps hold entry/apex/exit: the finger contact contributes 3 pins
    expect(pins.filter((p) => p.kind === "finger").length).toBe(3);
    // hand pins carry their side so they can follow gliding hands
    expect(pins[0]!.side).toBe("R");
    expect(pins.find((p) => p.kind === "finger")!.side).toBe("L");
  });
});

describe("commonContacts", () => {
  it("a pass keeps every original contact pinned (pure insertion)", () => {
    const trapeze = mounts.get("trapeze")!;
    const to = applyElement(passElement({ side: "R", digit: "index" }), trapeze);
    const shared = commonContacts(trapeze, to);
    expect(shared.from.size).toBe(trapeze.contacts.length);
    expect(shared.to.size).toBe(trapeze.contacts.length);
  });

  it("a dismount keeps only the loop and axle", () => {
    const trapeze = mounts.get("trapeze")!;
    const to = applyElement(dismountElement, trapeze);
    const shared = commonContacts(trapeze, to);
    expect(shared.from).toEqual(new Set([0, trapeze.contacts.length - 1]));
  });

  it("a mount keeps only the loop and axle of the bare string", () => {
    const dead = THROWS.breakaway.result();
    const to = applyElement(mountElement, dead);
    const shared = commonContacts(dead, to);
    expect(shared.from).toEqual(new Set([0, 1]));
    expect(shared.to).toEqual(new Set([0, 3]));
  });
});
