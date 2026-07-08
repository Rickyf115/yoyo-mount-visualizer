import type { Anchor, Mount, Spin } from "../core/schema.js";
import {
  FINGER_RADIUS,
  anchorContactCenter,
  anchorFinger,
  defaultRig,
  raiseHands,
  shiftHands,
  type Rig,
  type Vec3,
} from "./rig.js";
import { add, cross, dist, dot, mid, norm, normalize, scale, sub, wrapDelta } from "./vec.js";

/**
 * First-pass Layout(Mount, Rig): walk the mount's contact traversal and
 * derive 3D control points for the string spline plus the yo-yo's pose.
 * Purely geometric heuristics — no physics (that's Session 4). Topology
 * decides everything structural; this module only decides *where*.
 *
 * Hand contacts are rendered as *wrap arcs*: instead of a single point, the
 * string follows an arc around the finger cylinder from the incoming strand,
 * over (or under) the finger, to the outgoing strand — so a trapeze visibly
 * opens up around the non-throwhand index finger, and the slipknot renders
 * as a coil around the middle finger with the tail exiting toward the first
 * segment.
 */

export interface YoYoPose {
  center: Vec3;
  /** Unit spin axis (the rig's string-plane normal). */
  axis: Vec3;
}

export interface MountLayout {
  /** Control points for a Catmull-Rom spline, player end → axle. */
  controlPoints: Vec3[];
  /** Per-contact point runs, parallel to mount.contacts (arcs for hand contacts). */
  contactArcs: Vec3[][];
  yoyo: YoYoPose;
}

/** String rides this far off the finger axis. */
export const WRAP_RADIUS = FINGER_RADIUS + 0.006;
/** Repeated wraps on one anchor stack along the finger by this much. */
export const WRAP_SPACING = 0.02;
const YOYO_HANG = 0.38;
const MOUNT_SAG = 0.16;
const SEGMENT_SAG = 0.02;
export const AXLE_RADIUS = 0.012;

/** World position of a hand anchor (loop/finger/thumb) under the rig. */
function handAnchorPosition(anchor: Anchor, rig: Rig): Vec3 {
  return anchorContactCenter(rig, anchor);
}

/**
 * Where the yo-yo sits. If the traversal has a gap contact, the yo-yo rests
 * on the string there: between the two neighbouring anchors when both are on
 * hands, or hanging below the preceding anchor when the gap directly abuts
 * the axle winding (the string end is at the yo-yo, e.g. brother, 1.5).
 * With no gap contact the yo-yo dangles at the string's end (dead string).
 */
function yoyoCenter(
  mount: Mount,
  rig: Rig,
  anchorById: Map<string, Anchor>,
  extraDrop: number,
): Vec3 {
  const kindAt = (i: number) => anchorById.get(mount.contacts[i]!.anchor)!;
  const posAt = (i: number) => handAnchorPosition(kindAt(i), rig);

  const gapIndex = mount.contacts.findIndex((c) => anchorById.get(c.anchor)!.kind === "gap");
  if (gapIndex === -1) {
    // Unmounted: hang below the last hand anchor before the axle.
    return add(posAt(mount.contacts.length - 2), [0, -(0.4 + extraDrop), 0]);
  }
  const before = kindAt(gapIndex - 1);
  const after = kindAt(gapIndex + 1);
  if (before.kind === "gap" || after.kind === "gap") {
    throw new Error(`mount "${mount.id}": consecutive gap contacts are not supported yet`);
  }
  if (after.kind === "axle") {
    return add(posAt(gapIndex - 1), [0, -(YOYO_HANG + extraDrop), 0]);
  }
  const rest = mid(posAt(gapIndex - 1), posAt(gapIndex + 1));
  return add(rest, [0, -(MOUNT_SAG + extraDrop), 0]);
}

/** Interpolate angles the short way around. */
function lerpAngle(a: number, b: number, t: number): number {
  return a + wrapDelta(b - a) * t;
}

/**
 * Arc of points around a finger at `center`, radius WRAP_RADIUS, in the
 * plane perpendicular to the finger axis. The arc runs from the incoming
 * strand's direction, through the over/under apex, to the outgoing strand's
 * direction. With no incoming strand (the slipknot loop starting the
 * string), it coils most of the way around the finger before exiting.
 */
function wrapArc(
  center: Vec3,
  fingerAxis: Vec3,
  entry: Vec3 | undefined,
  exit: Vec3,
  over: boolean,
): Vec3[] {
  const axis = normalize(fingerAxis);
  // In-plane basis: e1 points world-up (projected), e2 completes it.
  const upProj = sub([0, 1, 0], scale(axis, dot([0, 1, 0], axis)));
  const e1 = norm(upProj) > 1e-6 ? normalize(upProj) : normalize(cross(axis, [1, 0, 0]));
  const e2 = normalize(cross(axis, e1));
  const angleOf = (p: Vec3): number => {
    const v = sub(p, center);
    return Math.atan2(dot(v, e2), dot(v, e1));
  };
  const pointAt = (theta: number): Vec3 =>
    add(center, add(scale(e1, WRAP_RADIUS * Math.cos(theta)), scale(e2, WRAP_RADIUS * Math.sin(theta))));

  const apex = over ? 0 : Math.PI;

  // A taut strand from world point P touches the finger circle at one of the
  // two tangent angles θP ± acos(r/d) — that offset is what makes the two
  // strands of a wrap visibly separate around the finger.
  const tangentCandidates = (p: Vec3): [number, number] => {
    const theta = angleOf(p);
    const d = norm(sub(p, center));
    const beta = d > WRAP_RADIUS ? Math.acos(WRAP_RADIUS / d) : Math.PI / 2;
    return [theta + beta, theta - beta];
  };
  const closerToApex = (cands: [number, number]): number =>
    Math.abs(wrapDelta(cands[0] - apex)) <= Math.abs(wrapDelta(cands[1] - apex))
      ? cands[0]
      : cands[1];

  const exitCands = tangentCandidates(exit);
  if (entry === undefined) {
    // Slipknot coil: come from behind the finger, all the way around, out.
    const exitTangent = closerToApex(exitCands);
    const start = exitTangent + Math.PI * 1.65;
    const steps = 7;
    return Array.from({ length: steps }, (_, i) =>
      pointAt(start + ((exitTangent - start) * i) / (steps - 1)),
    );
  }

  const entryTangent = closerToApex(tangentCandidates(entry));
  // Exit on the opposite rotational side of the apex when possible, so a
  // trapeze's strands leave the finger splayed apart rather than overlapping.
  const entrySide = Math.sign(wrapDelta(entryTangent - apex));
  const opposite = exitCands.find((c) => Math.sign(wrapDelta(c - apex)) === -entrySide);
  const exitTangent = entrySide !== 0 && opposite !== undefined ? opposite : closerToApex(exitCands);

  // entry → apex → exit, each leg the short way around.
  const points: Vec3[] = [];
  const steps = 3;
  for (let i = 0; i < steps; i++) points.push(pointAt(lerpAngle(entryTangent, apex, i / steps)));
  for (let i = 0; i <= steps; i++) points.push(pointAt(lerpAngle(apex, exitTangent, i / steps)));
  return points;
}

export interface LayoutOptions {
  /** Additional yo-yo drop below the heuristic rest position (string budget). */
  extraDrop?: number;
}

export function layoutMount(mount: Mount, rig: Rig, options: LayoutOptions = {}): MountLayout {
  const anchorById = new Map(mount.anchors.map((a) => [a.id, a]));
  const yoyo: YoYoPose = {
    center: yoyoCenter(mount, rig, anchorById, options.extraDrop ?? 0),
    axis: rig.planeNormal,
  };

  // Pass 1 — contact centers. Repeated wraps on one anchor stack along the
  // finger toward the tip so double wraps stay legible.
  const visits = new Map<string, number>();
  const centers: Vec3[] = mount.contacts.map((contact) => {
    const anchor = anchorById.get(contact.anchor)!;
    const visit = visits.get(contact.anchor) ?? 0;
    visits.set(contact.anchor, visit + 1);
    switch (anchor.kind) {
      case "gap":
        return add(yoyo.center, [0, AXLE_RADIUS, 0]);
      case "axle":
        return yoyo.center;
      default: {
        const finger = anchorFinger(rig, anchor);
        const along = normalize(sub(finger.tip, finger.base));
        return add(handAnchorPosition(anchor, rig), scale(along, visit * WRAP_SPACING));
      }
    }
  });

  // Pass 2 — per-contact point runs: wrap arcs around fingers (using the
  // neighbouring contact centers to aim the tangents), single points at the
  // gap and axle.
  const contactArcs: Vec3[][] = mount.contacts.map((contact, i) => {
    const anchor = anchorById.get(contact.anchor)!;
    const center = centers[i]!;
    if (anchor.kind === "gap" || anchor.kind === "axle") return [center];
    const finger = anchorFinger(rig, anchor);
    const axis = sub(finger.tip, finger.base);
    const entry = anchor.kind === "loop" && i === 0 ? undefined : centers[i - 1]!;
    return wrapArc(center, axis, entry, centers[i + 1]!, contact.wrap === "over");
  });

  // Assemble: join the runs, inserting a slightly sagged midpoint into each
  // span so the spline reads as string rather than wire.
  const controlPoints: Vec3[] = [];
  contactArcs.forEach((run, i) => {
    if (i > 0) {
      const prev = controlPoints[controlPoints.length - 1]!;
      const next = run[0]!;
      const sag = Math.min(SEGMENT_SAG, dist(prev, next) * 0.08);
      controlPoints.push(add(mid(prev, next), [0, -sag, 0]));
    }
    controlPoints.push(...run);
  });

  return { controlPoints, contactArcs, yoyo };
}

// ---------------------------------------------------------------------------
// constant string length

/** Polyline length of a layout's control points. */
export function layoutLength(layout: MountLayout): number {
  let length = 0;
  for (let i = 1; i < layout.controlPoints.length; i++) {
    length += dist(layout.controlPoints[i - 1]!, layout.controlPoints[i]!);
  }
  return length;
}

/** The one string every mount is laid out on, loop to axle (scene meters). */
export const STRING_LENGTH = 1.45;

export interface FittedLayout {
  rig: Rig;
  layout: MountLayout;
  /** Hand-spread factor the fit settled on (1 = default rig). */
  spread: number;
}

function bisect(f: (x: number) => number, lo: number, hi: number, iterations = 28): number {
  // f is monotonically increasing; find f(x) ≈ 0.
  let a = lo;
  let b = hi;
  for (let i = 0; i < iterations; i++) {
    const m = (a + b) / 2;
    if (f(m) > 0) b = m;
    else a = m;
  }
  return (a + b) / 2;
}

/**
 * Lay a mount out on the fixed-length string: hands slide together until the
 * traversal fits the budget (wrap-heavy mounts pull the hands in), then the
 * yo-yo drops to consume whatever is left (a bare string hangs deep). This is
 * what makes string length consistent across mounts and transitions.
 */
export function fitLayout(mount: Mount, spin: Spin): FittedLayout {
  const base = defaultRig(spin);
  const lengthAt = (rig: Rig, extraDrop: number) =>
    layoutLength(layoutMount(mount, rig, { extraDrop }));

  let spread = 1;
  if (lengthAt(base, 0) > STRING_LENGTH) {
    spread = bisect((s) => lengthAt(shiftHands(base, s), 0) - STRING_LENGTH, 0.12, 1);
  }
  let rig = spread === 1 ? base : shiftHands(base, spread);
  const drop = Math.max(0, bisect((e) => lengthAt(rig, e) - STRING_LENGTH, 0, 1.4));
  let layout = layoutMount(mount, rig, { extraDrop: drop });

  // Floor guard: a long hang (deep sleeper) lifts both hands instead of
  // letting the yo-yo sink through the ground. Rigid, so length is unchanged.
  const clearance = 0.1 - layout.yoyo.center[1];
  if (clearance > 0) {
    rig = raiseHands(rig, clearance);
    layout = layoutMount(mount, rig, { extraDrop: drop });
  }
  return { rig, layout, spread };
}
