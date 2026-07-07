import { describe, expect, it } from "vitest";
import {
  Mount,
  canonicalSerialize,
  canonicalize,
  mountHash,
  mountsEqual,
  stableStringify,
} from "../src/core/index.js";
import { makeTrapeze } from "./helpers.js";

describe("stableStringify", () => {
  it("is insensitive to object key order", () => {
    expect(stableStringify({ b: 1, a: [{ y: 2, x: 3 }] })).toBe(
      stableStringify({ a: [{ x: 3, y: 2 }], b: 1 }),
    );
  });

  it("drops undefined-valued keys", () => {
    expect(stableStringify({ a: 1, b: undefined })).toBe('{"a":1}');
  });
});

describe("canonicalization", () => {
  it("erases mount id and name", () => {
    const a = makeTrapeze();
    const b = makeTrapeze({ id: "some-other-id", name: "the flying trapeze" });
    expect(canonicalSerialize(a)).toBe(canonicalSerialize(b));
    expect(mountsEqual(a, b)).toBe(true);
  });

  it("erases anchor ids and declaration order", () => {
    const a = makeTrapeze();
    const b: Mount = {
      id: "renamed",
      spin: "side",
      anchors: [
        { id: "end", kind: "axle" },
        { id: "left-pointer", kind: "finger", side: "L", digit: "index" },
        { id: "slipknot", kind: "loop", side: "R" },
        { id: "the-gap", kind: "gap" },
      ],
      contacts: [
        { anchor: "slipknot", wrap: "over", direction: "cw" },
        { anchor: "the-gap", wrap: "over", direction: "ccw" },
        { anchor: "left-pointer", wrap: "over", direction: "ccw" },
        { anchor: "end", wrap: "over", direction: "cw" },
      ],
      crossings: [],
    };
    expect(mountsEqual(a, b)).toBe(true);
    expect(mountHash(a)).toBe(mountHash(b));
  });

  it("distinguishes which digit carries a wrap (transitions can require a specific finger)", () => {
    const overIndex = makeTrapeze();
    const overMiddle = makeTrapeze();
    overMiddle.anchors[2] = { id: "nth-middle", kind: "finger", side: "L", digit: "middle" };
    overMiddle.contacts[2]!.anchor = "nth-middle";
    expect(mountsEqual(overIndex, overMiddle)).toBe(false);
  });

  it("distinguishes a thumb wrap from a finger wrap", () => {
    const overFinger = makeTrapeze();
    const overThumb = makeTrapeze();
    overThumb.anchors[2] = { id: "nth-thumb", kind: "thumb", side: "L" };
    overThumb.contacts[2]!.anchor = "nth-thumb";
    expect(mountsEqual(overFinger, overThumb)).toBe(false);
  });

  it("distinguishes spin: a side-spin trapeze and its front-spin twin are different mounts", () => {
    const trapeze = makeTrapeze();
    const frontMount = makeTrapeze({ spin: "front" });
    expect(mountsEqual(trapeze, frontMount)).toBe(false);
    expect(mountHash(trapeze)).not.toBe(mountHash(frontMount));
  });

  it("keeps two distinct same-digit anchors distinct from one anchor contacted twice", () => {
    const oneFingerTwice: Mount = Mount.parse({
      ...makeTrapeze(),
      contacts: [
        { anchor: "th-loop", wrap: "over", direction: "cw" },
        { anchor: "nth-index", wrap: "over", direction: "ccw" },
        { anchor: "nth-index", wrap: "over", direction: "ccw" },
        { anchor: "yoyo-gap", wrap: "over", direction: "ccw" },
        { anchor: "axle", wrap: "over", direction: "cw" },
      ],
    });
    const twoFingers: Mount = Mount.parse({
      ...makeTrapeze(),
      anchors: [
        ...makeTrapeze().anchors,
        { id: "nth-middle", kind: "finger", side: "L", digit: "middle" },
      ],
      contacts: [
        { anchor: "th-loop", wrap: "over", direction: "cw" },
        { anchor: "nth-index", wrap: "over", direction: "ccw" },
        { anchor: "nth-middle", wrap: "over", direction: "ccw" },
        { anchor: "yoyo-gap", wrap: "over", direction: "ccw" },
        { anchor: "axle", wrap: "over", direction: "cw" },
      ],
    });
    expect(mountsEqual(oneFingerTwice, twoFingers)).toBe(false);
  });

  it("preserves sidedness: a mirrored mount is a different mount", () => {
    const right = makeTrapeze();
    const mirrored = makeTrapeze();
    mirrored.anchors = [
      { id: "th-loop", kind: "loop", side: "L" },
      { id: "yoyo-gap", kind: "gap" },
      { id: "nth-index", kind: "finger", side: "R", digit: "index" },
      { id: "axle", kind: "axle" },
    ];
    expect(mountsEqual(right, mirrored)).toBe(false);
  });

  it("distinguishes wrap and direction changes", () => {
    const base = makeTrapeze();
    const underWrap = makeTrapeze();
    underWrap.contacts[2]!.wrap = "under";
    const flippedDirection = makeTrapeze();
    flippedDirection.contacts[2]!.direction = "cw";
    expect(mountsEqual(base, underWrap)).toBe(false);
    expect(mountsEqual(base, flippedDirection)).toBe(false);
    expect(mountsEqual(underWrap, flippedDirection)).toBe(false);
  });

  it("distinguishes contact order (traversal is ordered)", () => {
    const trapezeLike = makeTrapeze(); // loop, gap, finger, axle
    const brotherLike = makeTrapeze({
      contacts: [
        { anchor: "th-loop", wrap: "over", direction: "cw" },
        { anchor: "nth-index", wrap: "over", direction: "ccw" },
        { anchor: "yoyo-gap", wrap: "over", direction: "ccw" },
        { anchor: "axle", wrap: "over", direction: "cw" },
      ],
    });
    expect(mountsEqual(trapezeLike, brotherLike)).toBe(false);
  });

  it("is insensitive to crossing list order", () => {
    const a = makeTrapeze({
      crossings: [
        { over: 2, under: 0 },
        { over: 0, under: 1 },
      ],
    });
    const b = makeTrapeze({
      crossings: [
        { over: 0, under: 1 },
        { over: 2, under: 0 },
      ],
    });
    expect(mountsEqual(a, b)).toBe(true);
  });

  it("includes crossings in identity", () => {
    const flat = makeTrapeze();
    const crossed = makeTrapeze({ crossings: [{ over: 0, under: 2 }] });
    expect(mountsEqual(flat, crossed)).toBe(false);
  });

  it("renames anchors by first appearance along the traversal", () => {
    const canonical = canonicalize(makeTrapeze());
    expect(canonical.contacts.map((c) => c.anchor)).toEqual([
      "loop:R:-:0",
      "gap:-:-:0",
      "finger:L:index:0",
      "axle:-:-:0",
    ]);
  });

  it("round-trips: canonical serialization parses back to an equal structure", () => {
    const mount = makeTrapeze({ crossings: [{ over: 2, under: 0 }] });
    const serialized = canonicalSerialize(mount);
    expect(stableStringify(JSON.parse(serialized))).toBe(serialized);
  });

  it("round-trips a Mount through JSON without changing identity", () => {
    const mount = makeTrapeze();
    const revalidated = Mount.parse(JSON.parse(JSON.stringify(mount)));
    expect(mountHash(revalidated)).toBe(mountHash(mount));
  });

  it("throws (rather than mis-hashing) on an unvalidated mount with a dangling anchor ref", () => {
    const mount = makeTrapeze();
    mount.contacts[1]!.anchor = "ghost";
    expect(() => mountHash(mount)).toThrow(/undeclared anchor/);
  });

  it("hash is stable across releases (regression pin)", () => {
    // If canonicalization changes deliberately, regenerate with `pnpm hashes`
    // and update data/names.json in the same commit.
    expect(mountHash(makeTrapeze())).toBe(
      "3f47ad1e087e5ec091e57b46e88c464ccefaf18af980dea959cf6b8a5213942a",
    );
  });
});
