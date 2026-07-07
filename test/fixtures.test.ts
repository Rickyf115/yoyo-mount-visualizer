import { describe, expect, it } from "vitest";
import {
  entryForHash,
  loadMountFixtures,
  loadNameRegistry,
  loadTrickFixtures,
  mountHash,
  namesFor,
  primaryNameFor,
} from "../src/core/index.js";

const mounts = loadMountFixtures();
const registry = loadNameRegistry();
const tricks = loadTrickFixtures();

const STAPLES = [
  "dead-string",
  "trapeze",
  "brother",
  "one-and-a-half",
  "double-or-nothing",
  "double-brother",
  "triple-or-nothing",
  "split-bottom",
  "houdini",
  "front-mount",
];

describe("mount fixtures", () => {
  it("include all staple mounts", () => {
    expect([...mounts.keys()].sort()).toEqual([...STAPLES].sort());
  });

  it("houdini differs from double or nothing only by the throwhand anchor, yet hashes apart", () => {
    const houdini = mounts.get("houdini")!;
    const don = mounts.get("double-or-nothing")!;
    expect(houdini.contacts.length).toBe(don.contacts.length);
    expect(houdini.spin).toBe(don.spin);
    expect(mountHash(houdini)).not.toBe(mountHash(don));
  });

  it("front mount is the trapeze traversal with front spin — same contacts, different mount", () => {
    const trapeze = mounts.get("trapeze")!;
    const frontMount = mounts.get("front-mount")!;
    expect(frontMount.contacts).toEqual(trapeze.contacts);
    expect(frontMount.spin).not.toBe(trapeze.spin);
    expect(mountHash(frontMount)).not.toBe(mountHash(trapeze));
  });

  it("spin splits the fixture set into two halves", () => {
    const all = [...mounts.values()];
    expect(all.filter((m) => m.spin === "side").length).toBeGreaterThan(0);
    expect(all.filter((m) => m.spin === "front").length).toBeGreaterThan(0);
  });

  it("all load, validate, and canonicalize", () => {
    for (const mount of mounts.values()) {
      expect(mountHash(mount)).toMatch(/^[0-9a-f]{64}$/);
    }
  });

  it("are pairwise topologically distinct", () => {
    const hashes = [...mounts.values()].map(mountHash);
    expect(new Set(hashes).size).toBe(hashes.length);
  });
});

describe("name registry fixture", () => {
  it("has an entry with a matching hash for every mount fixture", () => {
    for (const mount of mounts.values()) {
      const entry = entryForHash(registry, mountHash(mount));
      expect(entry, `no registry entry for fixture "${mount.id}"`).toBeDefined();
      expect(entry!.generated).toBe(false);
    }
  });

  it("has no orphan entries pointing at unknown mounts", () => {
    const known = new Set([...mounts.values()].map(mountHash));
    for (const entry of registry) {
      expect(known.has(entry.mountHash), `orphan registry entry ${entry.names[0]}`).toBe(true);
    }
  });

  it("keeps naming decoupled from identity: brother and undermount alias one mount", () => {
    const brother = mounts.get("brother")!;
    expect(namesFor(registry, brother)).toEqual(["brother", "undermount"]);
    expect(primaryNameFor(registry, brother)).toBe("brother");
  });
});

describe("trick fixtures", () => {
  it("include the Cascade path", () => {
    expect(tricks.has("Cascade")).toBe(true);
  });

  it("every step references a known mount fixture", () => {
    for (const trick of tricks.values()) {
      expect(mounts.has(trick.start), `${trick.name}: unknown start "${trick.start}"`).toBe(true);
      for (const step of trick.steps) {
        expect(mounts.has(step.to), `${trick.name}: unknown mount "${step.to}"`).toBe(true);
      }
    }
  });

  it("Cascade is a pure mount sequence (all steps unpinned)", () => {
    const cascade = tricks.get("Cascade")!;
    expect(cascade.steps.every((s) => s.element === undefined)).toBe(true);
  });

  it("every trick keeps one spin throughout (spin cannot change without a regeneration)", () => {
    for (const trick of tricks.values()) {
      const spins = new Set(
        [trick.start, ...trick.steps.map((s) => s.to)].map((ref) => mounts.get(ref)!.spin),
      );
      expect(spins.size, `${trick.name} mixes spins: ${[...spins].join(", ")}`).toBe(1);
    }
  });
});
