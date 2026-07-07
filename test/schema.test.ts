import { describe, expect, it } from "vitest";
import { Anchor, Mount, NameEntry, NameRegistry, Trick } from "../src/core/index.js";
import { makeTrapeze } from "./helpers.js";

describe("Anchor schema", () => {
  it("accepts hand anchors with a side and sideless axle/gap", () => {
    expect(
      Anchor.safeParse({ id: "nth-index", kind: "finger", side: "L", digit: "index" }).success,
    ).toBe(true);
    expect(Anchor.safeParse({ id: "th-thumb", kind: "thumb", side: "R" }).success).toBe(true);
    expect(Anchor.safeParse({ id: "axle", kind: "axle" }).success).toBe(true);
    expect(Anchor.safeParse({ id: "yoyo-gap", kind: "gap" }).success).toBe(true);
  });

  it("rejects a finger without a side", () => {
    expect(Anchor.safeParse({ id: "nth-index", kind: "finger", digit: "index" }).success).toBe(
      false,
    );
  });

  it("rejects a finger without a digit", () => {
    expect(Anchor.safeParse({ id: "nth-index", kind: "finger", side: "L" }).success).toBe(false);
  });

  it("rejects a digit on non-finger kinds", () => {
    expect(
      Anchor.safeParse({ id: "th-thumb", kind: "thumb", side: "R", digit: "index" }).success,
    ).toBe(false);
    expect(Anchor.safeParse({ id: "axle", kind: "axle", digit: "index" }).success).toBe(false);
  });

  it("rejects an axle with a side", () => {
    expect(Anchor.safeParse({ id: "axle", kind: "axle", side: "R" }).success).toBe(false);
  });

  it("rejects unknown kinds", () => {
    expect(Anchor.safeParse({ id: "x", kind: "elbow", side: "L" }).success).toBe(false);
  });
});

describe("Mount schema", () => {
  it("accepts a valid trapeze", () => {
    expect(Mount.safeParse(makeTrapeze()).success).toBe(true);
  });

  it("rejects a mount without a spin", () => {
    const { spin: _spin, ...rest } = makeTrapeze();
    expect(Mount.safeParse(rest).success).toBe(false);
  });

  it("rejects duplicate anchor ids", () => {
    const mount = makeTrapeze();
    mount.anchors.push({ id: "nth-index", kind: "finger", side: "L", digit: "index" });
    mount.contacts.splice(2, 0, { anchor: "nth-index", wrap: "over", direction: "cw" });
    expect(Mount.safeParse(mount).success).toBe(false);
  });

  it("rejects contacts referencing undeclared anchors", () => {
    const mount = makeTrapeze();
    mount.contacts[1]!.anchor = "ghost-finger";
    expect(Mount.safeParse(mount).success).toBe(false);
  });

  it("rejects declared-but-unused anchors", () => {
    const mount = makeTrapeze();
    mount.anchors.push({ id: "th-thumb", kind: "thumb", side: "R" });
    expect(Mount.safeParse(mount).success).toBe(false);
  });

  it("requires the traversal to start at the loop", () => {
    const mount = makeTrapeze();
    mount.contacts.reverse();
    expect(Mount.safeParse(mount).success).toBe(false);
  });

  it("requires the traversal to end at the axle", () => {
    const mount = makeTrapeze();
    mount.contacts.pop();
    expect(Mount.safeParse(mount).success).toBe(false);
  });

  it("rejects the loop appearing mid-traversal", () => {
    const mount = makeTrapeze();
    mount.contacts.splice(2, 0, { anchor: "th-loop", wrap: "over", direction: "cw" });
    expect(Mount.safeParse(mount).success).toBe(false);
  });

  it("allows repeated contacts on the same anchor (wraps)", () => {
    const mount = makeTrapeze();
    mount.contacts.splice(2, 0, { anchor: "nth-index", wrap: "over", direction: "ccw" });
    expect(Mount.safeParse(mount).success).toBe(true);
  });

  it("rejects crossings referencing out-of-range segments", () => {
    const mount = makeTrapeze({ crossings: [{ over: 0, under: 3 }] });
    expect(Mount.safeParse(mount).success).toBe(false);
  });

  it("rejects self-crossing segments", () => {
    const mount = makeTrapeze({ crossings: [{ over: 1, under: 1 }] });
    expect(Mount.safeParse(mount).success).toBe(false);
  });

  it("rejects contradictory crossings for the same segment pair", () => {
    const mount = makeTrapeze({
      crossings: [
        { over: 0, under: 2 },
        { over: 2, under: 0 },
      ],
    });
    expect(Mount.safeParse(mount).success).toBe(false);
  });

  it("accepts valid crossings", () => {
    const mount = makeTrapeze({ crossings: [{ over: 0, under: 2 }] });
    expect(Mount.safeParse(mount).success).toBe(true);
  });
});

describe("Trick schema", () => {
  it("accepts pinned and unpinned steps in the same trick", () => {
    const trick = {
      name: "test trick",
      start: "trapeze",
      steps: [{ to: "double-or-nothing" }, { element: "dismount", to: "dead-string" }],
    };
    expect(Trick.safeParse(trick).success).toBe(true);
  });

  it("rejects an empty step list", () => {
    expect(Trick.safeParse({ name: "t", start: "trapeze", steps: [] }).success).toBe(false);
  });
});

describe("Name registry schema", () => {
  const hash = "a".repeat(64);

  it("accepts aliases and rejects malformed hashes", () => {
    expect(
      NameEntry.safeParse({ mountHash: hash, names: ["brother", "undermount"], generated: false })
        .success,
    ).toBe(true);
    expect(
      NameEntry.safeParse({ mountHash: "not-a-hash", names: ["x"], generated: false }).success,
    ).toBe(false);
  });

  it("rejects duplicate names within an entry", () => {
    expect(
      NameEntry.safeParse({ mountHash: hash, names: ["brother", "brother"], generated: false })
        .success,
    ).toBe(false);
  });

  it("rejects two registry entries for the same hash", () => {
    const entry = { mountHash: hash, names: ["x"], generated: true };
    expect(NameRegistry.safeParse([entry, { ...entry, names: ["y"] }]).success).toBe(false);
  });
});
