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

/** A physical hand anchor the yo-yo swings around during an element. */
export interface PivotSpec {
  kind: "finger" | "thumb" | "loop";
  side: Side;
  digit?: Digit;
}

/**
 * How a transition moves, for animation: the yo-yo (and the string it
 * drags) swings around `pivot`. `sweep: "over"` forces the path across the
 * apex above the pivot — a pass or mount arcs over the finger even when
 * start and end positions are close — `"under"` forces it below (an
 * underpass scoops beneath the finger), and `"shortest"` takes the direct
 * arc (a dismount just drops off). Purely descriptive: geometry stays in viz.
 */
export interface MotionHint {
  pivot: PivotSpec;
  sweep: "over" | "under" | "shortest";
}

export interface Element {
  /** Stable identifier used by trick steps (ElementRef). */
  name: string;
  description: string;
  /**
   * Rough execution difficulty (1 easy … 5 hard). Not a pathfinding cost —
   * a filter/sort signal for browsing enumerated paths (Sessions 7–8).
   */
  difficulty: number;
  /** Why the element cannot apply to this mount, or null when it is legal. */
  precondition(mount: Mount): string | null;
  /** Transform a legal source mount. Call through applyElement. */
  apply(mount: Mount): Mount;
  /** Animation hint for a legal application; null = straight interpolation. */
  motion(mount: Mount): MotionHint | null;
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
  difficulty: 1,
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
  motion() {
    // The yo-yo swings up and over the catching finger.
    return { pivot: { kind: "finger", side: "L", digit: "index" }, sweep: "over" };
  },
};

export interface PassSpec {
  side: Side;
  digit?: Digit;
  thumb?: boolean;
  /** Scoop beneath the target instead of over it (an underpass). */
  under?: boolean;
  /**
   * Whip a loop of slack over the target instead of swinging the yo-yo.
   * Topologically identical to the plain pass — a *parallel edge* in the
   * mount multigraph (same endpoints, different element, harder).
   */
  slack?: boolean;
}

/**
 * Pass the string's tail over (or under) a finger or thumb, adding a wrap
 * just before the axle winding. Two passes take a trapeze to double or
 * nothing (via the mid-swing state after the first pass); the slack variant
 * reaches the same mounts by whipping the string instead of the yo-yo.
 */
export function passElement(spec: PassSpec): Element {
  const target: AnchorSpec = spec.thumb
    ? { kind: "thumb", side: spec.side }
    : { kind: "finger", side: spec.side, digit: spec.digit ?? "index" };
  const targetLabel = spec.thumb ? `${spec.side} thumb` : `${spec.side} ${target.digit}`;
  const family = spec.slack ? "slack-pass" : spec.under ? "underpass" : "pass";
  const name = `${family}-${spec.side}-${spec.thumb ? "thumb" : target.digit}`;
  const wrap = spec.under ? "under" : "over";
  return {
    name,
    description: spec.slack
      ? `whip a loop of slack over the ${targetLabel}`
      : `${spec.under ? "carry the string's tail under" : "pass the string's tail over"} the ${targetLabel}`,
    difficulty: spec.slack ? 4 : spec.under ? 3 : spec.thumb ? 3 : 2,
    precondition(m) {
      if (gapIndex(m) === -1) return "requires the yo-yo mounted on the string";
      return noCrossings(m);
    },
    apply(m) {
      const { anchors, id } = ensureAnchor(m.anchors, target);
      const contacts = [...m.contacts];
      contacts.splice(contacts.length - 1, 0, { anchor: id, wrap, direction: "ccw" });
      return result(m, name, anchors, contacts);
    },
    motion() {
      // A slack pass moves string, not the yo-yo — no swing arc.
      if (spec.slack) return null;
      return {
        pivot: spec.thumb
          ? { kind: "thumb", side: spec.side }
          : { kind: "finger", side: spec.side, digit: target.digit! },
        sweep: spec.under ? "under" : "over",
      };
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
  difficulty: 2,
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
  motion(m) {
    // The yo-yo pops over the anchor it is hopping across.
    const g = gapIndex(m);
    if (g === -1) return null;
    const anchor = anchorMap(m).get(m.contacts[g + 1]!.anchor)!;
    if (anchor.kind !== "finger" && anchor.kind !== "thumb") return null;
    return {
      pivot:
        anchor.kind === "thumb"
          ? { kind: "thumb", side: anchor.side! }
          : { kind: "finger", side: anchor.side!, digit: anchor.digit! },
      sweep: "over",
    };
  },
};

/** Hop the yo-yo the other way: back over the previous anchor. */
export const hopBackElement: Element = {
  name: "hop-back",
  description: "hop the yo-yo back over the previous anchor toward the loop",
  difficulty: 2,
  precondition(m) {
    const g = gapIndex(m);
    if (g === -1) return "requires the yo-yo mounted on the string";
    const anchors = anchorMap(m);
    const prev = anchors.get(m.contacts[g - 1]!.anchor)!;
    if (prev.kind === "loop") return "the yo-yo is already on the first strand";
    if (prev.kind === "gap") return "consecutive gap contacts are not supported";
    return noCrossings(m);
  },
  apply(m) {
    const g = gapIndex(m);
    const contacts = [...m.contacts];
    [contacts[g - 1], contacts[g]] = [contacts[g]!, contacts[g - 1]!];
    return result(m, "hop-back", m.anchors, contacts);
  },
  motion(m) {
    const g = gapIndex(m);
    if (g === -1) return null;
    const anchor = anchorMap(m).get(m.contacts[g - 1]!.anchor)!;
    if (anchor.kind !== "finger" && anchor.kind !== "thumb") return null;
    return {
      pivot:
        anchor.kind === "thumb"
          ? { kind: "thumb", side: anchor.side! }
          : { kind: "finger", side: anchor.side!, digit: anchor.digit! },
      sweep: "over",
    };
  },
};

/**
 * Roll the yo-yo one full loop around its supporting anchor. Topologically
 * the identity — a *self-edge* in the mount multigraph, which is exactly
 * what repeaters are made of (cycles are legitimate tricks, Session 7).
 */
export const rollElement: Element = {
  name: "roll",
  description: "roll the yo-yo a full loop around its supporting anchor (repeater)",
  difficulty: 2,
  precondition(m) {
    const g = gapIndex(m);
    if (g === -1) return "requires the yo-yo mounted on the string";
    const anchors = anchorMap(m);
    const next = anchors.get(m.contacts[g + 1]!.anchor)!;
    if (next.kind !== "finger" && next.kind !== "thumb") {
      return "requires a finger or thumb after the yo-yo to roll around";
    }
    return noCrossings(m);
  },
  apply(m) {
    return result(m, "roll", m.anchors, [...m.contacts]);
  },
  motion(m) {
    const g = gapIndex(m);
    if (g === -1) return null;
    const anchor = anchorMap(m).get(m.contacts[g + 1]!.anchor)!;
    if (anchor.kind !== "finger" && anchor.kind !== "thumb") return null;
    return {
      pivot:
        anchor.kind === "thumb"
          ? { kind: "thumb", side: anchor.side! }
          : { kind: "finger", side: anchor.side!, digit: anchor.digit! },
      sweep: "over", // start ≈ end ⇒ a full 2π loop over the support
    };
  },
};

/** Drop every wrap and let the yo-yo swing free: back to a bare string. */
export const dismountElement: Element = {
  name: "dismount",
  description: "drop all wraps; the yo-yo swings free on a bare string",
  difficulty: 1,
  precondition(m) {
    if (gapIndex(m) === -1) return "requires a mounted yo-yo";
    return noCrossings(m);
  },
  apply(m) {
    const contacts = [m.contacts[0]!, m.contacts[m.contacts.length - 1]!];
    return result(m, "dismount", m.anchors, contacts);
  },
  motion(m) {
    // The yo-yo drops off and pendulums down from the throwhand.
    const loop = anchorMap(m).get(m.contacts[0]!.anchor)!;
    return { pivot: { kind: "loop", side: loop.side! }, sweep: "shortest" };
  },
};

/** The working element library (Session 5). */
export const STANDARD_ELEMENTS: readonly Element[] = [
  mountElement,
  dismountElement,
  hopElement,
  hopBackElement,
  rollElement,
  passElement({ side: "R", digit: "index" }),
  passElement({ side: "L", digit: "index" }),
  passElement({ side: "R", thumb: true }),
  passElement({ side: "R", digit: "index", under: true }),
  passElement({ side: "L", digit: "index", under: true }),
  passElement({ side: "R", digit: "index", slack: true }),
  passElement({ side: "L", digit: "index", slack: true }),
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
