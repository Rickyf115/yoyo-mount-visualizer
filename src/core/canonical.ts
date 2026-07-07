import { createHash } from "node:crypto";
import type { Mount } from "./schema.js";

/**
 * Canonicalization: two topologically identical mounts serialize identically,
 * so equality (and deduplication, and database identity) is a string/hash
 * comparison.
 *
 * What canonicalization erases:
 * - `id` and `name` — labels, not identity.
 * - Anchor ids and declaration order. Anchors are renamed to
 *   `kind:side:digit:n` where n counts distinct anchors of that
 *   (kind, side, digit) class in order of first appearance along the
 *   traversal ("-" stands in for absent side/digit).
 * - Crossing list order (sorted).
 *
 * What it preserves:
 * - The spin (front vs side): spin governs which transitions are legal and
 *   splits the mount graph in two, so it is part of the mount's identity.
 *   (Throws are graph entry points, not mount properties.)
 * - The traversal: contact order, wrap, and direction.
 * - Which digit carries a wrap: transitions can require a specific finger
 *   (double or nothing on the throwhand index vs houdini on the throwhand
 *   thumb), so digits — like the finger/thumb kind split — are identity.
 * - Sidedness. A mirrored mount is a different mount (a left-handed player's
 *   trapeze hashes differently). Mirror-equivalence can be layered on later
 *   if we decide we want it.
 */

export interface CanonicalContact {
  anchor: string;
  wrap: Mount["contacts"][number]["wrap"];
  direction: Mount["contacts"][number]["direction"];
}

export interface CanonicalMount {
  spin: Mount["spin"];
  contacts: CanonicalContact[];
  crossings: { over: number; under: number }[];
}

/** Deterministic JSON: object keys sorted recursively, arrays in order. */
export function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(",")}]`;
  }
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([k, v]) => `${JSON.stringify(k)}:${stableStringify(v)}`);
  return `{${entries.join(",")}}`;
}

export function canonicalize(mount: Mount): CanonicalMount {
  const anchorsById = new Map(mount.anchors.map((a) => [a.id, a]));
  const canonicalIds = new Map<string, string>();
  const classCounters = new Map<string, number>();

  for (const contact of mount.contacts) {
    if (canonicalIds.has(contact.anchor)) continue;
    const anchor = anchorsById.get(contact.anchor);
    if (!anchor) {
      throw new Error(
        `mount "${mount.id}" contacts undeclared anchor "${contact.anchor}" — validate with the Mount schema first`,
      );
    }
    const cls = `${anchor.kind}:${anchor.side ?? "-"}:${anchor.digit ?? "-"}`;
    const n = classCounters.get(cls) ?? 0;
    classCounters.set(cls, n + 1);
    canonicalIds.set(contact.anchor, `${cls}:${n}`);
  }

  const contacts: CanonicalContact[] = mount.contacts.map((c) => ({
    anchor: canonicalIds.get(c.anchor)!,
    wrap: c.wrap,
    direction: c.direction,
  }));

  const crossings = mount.crossings
    .map(({ over, under }) => ({ over, under }))
    .sort((a, b) => a.over - b.over || a.under - b.under);

  return { spin: mount.spin, contacts, crossings };
}

/** The canonical serialized form: identical for topologically equal mounts. */
export function canonicalSerialize(mount: Mount): string {
  return stableStringify(canonicalize(mount));
}

/** A mount's identity: sha256 of its canonical serialization. */
export function mountHash(mount: Mount): string {
  return createHash("sha256").update(canonicalSerialize(mount), "utf8").digest("hex");
}

export function mountsEqual(a: Mount, b: Mount): boolean {
  return canonicalSerialize(a) === canonicalSerialize(b);
}
