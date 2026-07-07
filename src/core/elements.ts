import { Mount, type Anchor, type ContactEvent, type Digit, type Side, type Spin } from "./schema.js";

/**
 * Elements: named operations Mount → Mount with legality preconditions.
 * They are the labeled edges of the mount multigraph — a trick is a path of
 * elements, and Session 7's enumerator applies every element to every known
 * mount to grow the graph.
 *
 * Elements never change spin: regenerations (future) are the only edges that
 * cross between the front-spin and side-spin halves of the graph. Throws are
 * not elements — they are entry points (see THROWS below).
 *
 * Browser-safe: pure topology, no node imports. Results are re-validated
 * through the Mount schema so a buggy transform fails loudly.
 */

export interface Element {
  /** Stable identifier used by trick steps (ElementRef). */
  name: string;
  description: string;
  /** Why the element cannot apply to this mount, or null when it is legal. */
  precondition(mount: Mount): string | null;
  /** Transform a legal source mount. Call through applyElement. */
  apply(mount: Mount): Mount;
}

export class IllegalElementError extends Error {
  constructor(
    readonly element: Element,
    readonly mount: Mount,
    reason: string,
  ) {
    super(`${element.name} on "${mount.id}": ${reason}`);
    this.name = "IllegalElementError";
  }
}

/** Apply with precondition checking; the result is schema-validated. */
export function applyElement(element: Element, mount: Mount): Mount {
  const reason = element.precondition(mount);
  if (reason !== null) throw new IllegalElementError(element, mount, reason);
  return Mount.parse(element.apply(mount));
}

export function legalElements(elements: readonly Element[], mount: Mount): Element[] {
  return elements.filter((e) => e.precondition(mount) === null);
}

// ---------------------------------------------------------------------------
// helpers

const anchorMap = (m: Mount) => new Map(m.anchors.map((a) => [a.id, a]));

const gapIndex = (m: Mount): number => {
  const anchors = anchorMap(m);
  return m.contacts.findIndex((c) => anchors.get(c.anchor)!.kind === "gap");
};

/** Elements do not reason about crossings yet (no fixture has any). */
const noCrossings = (m: Mount): string | null =>
  m.crossings.length > 0 ? "mounts with crossings are not supported yet" : null;

interface AnchorSpec {
  kind: "finger" | "thumb" | "gap";
  side?: Side;
  digit?: Digit;
}

/**
 * Reuse the anchor for the same physical finger/thumb/gap if the mount
 * already touches it, otherwise add one with a deterministic id.
 * (Canonicalization erases ids, so the id only matters for readability.)
 */
function ensureAnchor(anchors: Anchor[], spec: AnchorSpec): { anchors: Anchor[]; id: string } {
  const existing = anchors.find(
    (a) => a.kind === spec.kind && a.side === spec.side && a.digit === spec.digit,
  );
  if (existing) return { anchors, id: existing.id };
  const base = [spec.kind, spec.side, spec.digit].filter(Boolean).join("-");
  let id = base;
  for (let n = 2; anchors.some((a) => a.id === id); n++) id = `${base}-${n}`;
  const anchor: Anchor =
    spec.kind === "gap"
      ? { id, kind: "gap" }
      : spec.kind === "thumb"
        ? { id, kind: "thumb", side: spec.side! }
        : { id, kind: "finger", side: spec.side!, digit: spec.digit! };
  return { anchors: [...anchors, anchor], id };
}

/** Drop anchors no longer referenced by any contact (schema forbids strays). */
function pruneAnchors(anchors: Anchor[], contacts: ContactEvent[]): Anchor[] {
  const used = new Set(contacts.map((c) => c.anchor));
  return anchors.filter((a) => used.has(a.id));
}

function result(source: Mount, label: string, anchors: Anchor[], contacts: ContactEvent[]): Mount {
  return {
    id: `${label}(${source.id})`,
    spin: source.spin,
    anchors: pruneAnchors(anchors, contacts),
    contacts,
    crossings: [],
  };
}

// ---------------------------------------------------------------------------
// the session-3 element set

/**
 * Mount the yo-yo: from a bare string, swing the yo-yo onto the strand over
 * the non-throwhand index. Side spin lands a trapeze; front spin lands a
 * front mount — same operation, one per graph half.
 */
export const mountElement: Element = {
  name: "mount",
  description: "swing the yo-yo onto the string over the non-throwhand index",
  precondition(m) {
    if (m.contacts.length !== 2) return "requires a bare string (no wraps or mounts)";
    return noCrossings(m);
  },
  apply(m) {
    const step1 = ensureAnchor(m.anchors, { kind: "gap" });
    const step2 = ensureAnchor(step1.anchors, { kind: "finger", side: "L", digit: "index" });
    const [loop, axle] = [m.contacts[0]!, m.contacts[m.contacts.length - 1]!];
    return result(m, "mount", step2.anchors, [
      loop,
      { anchor: step1.id, wrap: "over", direction: "ccw" },
      { anchor: step2.id, wrap: "over", direction: "ccw" },
      axle,
    ]);
  },
};

/**
 * Pass the string's tail over a finger or thumb, adding a wrap just before
 * the axle winding. Two passes take a trapeze to double or nothing (via the
 * mid-swing state after the first pass).
 */
export function passElement(spec: { side: Side; digit?: Digit; thumb?: boolean }): Element {
  const target: AnchorSpec = spec.thumb
    ? { kind: "thumb", side: spec.side }
    : { kind: "finger", side: spec.side, digit: spec.digit ?? "index" };
  const targetLabel = spec.thumb ? `${spec.side} thumb` : `${spec.side} ${target.digit}`;
  return {
    name: `pass-${spec.side}-${spec.thumb ? "thumb" : target.digit}`,
    description: `pass the string's tail over the ${targetLabel}`,
    precondition(m) {
      if (gapIndex(m) === -1) return "requires the yo-yo mounted on the string";
      return noCrossings(m);
    },
    apply(m) {
      const { anchors, id } = ensureAnchor(m.anchors, target);
      const contacts = [...m.contacts];
      contacts.splice(contacts.length - 1, 0, { anchor: id, wrap: "over", direction: "ccw" });
      return result(m, `pass-${spec.side}-${spec.thumb ? "thumb" : target.digit}`, anchors, contacts);
    },
  };
}

/**
 * Hop the yo-yo off its strand, over the next anchor along the traversal,
 * and onto the following strand.
 */
export const hopElement: Element = {
  name: "hop",
  description: "hop the yo-yo over the next anchor toward the string's end",
  precondition(m) {
    const g = gapIndex(m);
    if (g === -1) return "requires the yo-yo mounted on the string";
    const anchors = anchorMap(m);
    const next = anchors.get(m.contacts[g + 1]!.anchor)!;
    if (next.kind === "axle") return "the yo-yo is already on the last strand";
    if (next.kind === "gap") return "consecutive gap contacts are not supported";
    return noCrossings(m);
  },
  apply(m) {
    const g = gapIndex(m);
    const contacts = [...m.contacts];
    [contacts[g], contacts[g + 1]] = [contacts[g + 1]!, contacts[g]!];
    return result(m, "hop", m.anchors, contacts);
  },
};

/** Drop every wrap and let the yo-yo swing free: back to a bare string. */
export const dismountElement: Element = {
  name: "dismount",
  description: "drop all wraps; the yo-yo swings free on a bare string",
  precondition(m) {
    if (gapIndex(m) === -1) return "requires a mounted yo-yo";
    return noCrossings(m);
  },
  apply(m) {
    const contacts = [m.contacts[0]!, m.contacts[m.contacts.length - 1]!];
    return result(m, "dismount", m.anchors, contacts);
  },
};

/** The working element set. Broadens substantially in Session 5. */
export const STANDARD_ELEMENTS: readonly Element[] = [
  mountElement,
  hopElement,
  dismountElement,
  passElement({ side: "R", digit: "index" }),
  passElement({ side: "L", digit: "index" }),
];

// ---------------------------------------------------------------------------
// throw entries

function deadString(spin: Spin): Mount {
  return {
    id: `dead-string-${spin}`,
    spin,
    anchors: [
      { id: "th-loop", kind: "loop", side: "R" },
      { id: "axle", kind: "axle" },
    ],
    contacts: [
      { anchor: "th-loop", wrap: "over", direction: "cw" },
      { anchor: "axle", wrap: "over", direction: "cw" },
    ],
    crossings: [],
  };
}

export interface ThrowEntry {
  name: string;
  spin: Spin;
  /** The state a fresh throw drops you into: a spinning bare string. */
  result(): Mount;
}

/**
 * Throws are entry points into the mount graph, not elements: a front throw
 * enters the front-spin half, a breakaway the side-spin half. Only future
 * regeneration elements will connect the halves.
 */
export const THROWS: Record<"front" | "breakaway", ThrowEntry> = {
  front: { name: "front throw", spin: "front", result: () => Mount.parse(deadString("front")) },
  breakaway: { name: "breakaway", spin: "side", result: () => Mount.parse(deadString("side")) },
};
