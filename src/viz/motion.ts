import type { MotionHint } from "../core/elements.js";
import type { Anchor, AnchorKind } from "../core/schema.js";
import { AXLE_RADIUS, type MountLayout } from "./layout.js";
import { anchorContactCenter, type Rig, type Vec3 } from "./rig.js";
import { add, cross, dist, dot, lerp3, normalize, perp, scale, sub, wrapDelta } from "./vec.js";

/**
 * Transition motion: the yo-yo swings along circular arcs around the
 * element's pivot anchor instead of gliding on a straight line. Sweep
 * "over" forces the arc across the apex above the pivot — a mount or pass
 * arcs up and over the finger (a full loop when start and end coincide) —
 * while "shortest" pendulums directly (dismount).
 *
 * Also home of the rope pin schedule: which layout points pin which rope
 * particles, and how the yo-yo-attached pins follow the swing.
 */

export type YoyoPath = (t: number) => Vec3;

/** Where the hint's pivot anchor sits under this rig. */
export function resolvePivot(hint: MotionHint, rig: Rig): Vec3 {
  const anchor: Anchor =
    hint.pivot.kind === "finger"
      ? { id: "pivot", kind: "finger", side: hint.pivot.side, digit: hint.pivot.digit! }
      : { id: "pivot", kind: hint.pivot.kind, side: hint.pivot.side };
  return anchorContactCenter(rig, anchor);
}

export function yoyoArcPath(
  from: Vec3,
  to: Vec3,
  pivot: Vec3 | null,
  axis: Vec3,
  sweep: "over" | "shortest",
): YoyoPath {
  if (pivot === null) return (t) => lerp3(from, to, t);

  const n = normalize(axis);
  const upProj = perp([0, 1, 0], n);
  const e1 = normalize(upProj);
  const e2 = normalize(cross(n, e1));

  const decompose = (p: Vec3) => {
    const v = sub(p, pivot);
    const axial = dot(v, n);
    const inPlane = perp(v, n);
    return {
      axial,
      radius: Math.hypot(dot(inPlane, e1), dot(inPlane, e2)),
      theta: Math.atan2(dot(inPlane, e2), dot(inPlane, e1)),
    };
  };
  const a = decompose(from);
  const b = decompose(to);

  // Short-way delta; for "over", force the arc across the apex (θ = 0,
  // straight up from the pivot) by taking the long way when the short way
  // misses it — a full 2π swing when start and end coincide.
  let delta = wrapDelta(b.theta - a.theta);
  if (sweep === "over") {
    const end = a.theta + delta;
    const coversApex = [-2 * Math.PI, 0, 2 * Math.PI].some(
      (k) => Math.min(a.theta, end) <= k && k <= Math.max(a.theta, end),
    );
    if (!coversApex || Math.abs(delta) < 1e-6) {
      const dir = delta !== 0 ? -Math.sign(delta) : a.theta > 0 ? -1 : 1;
      delta = delta + dir * 2 * Math.PI;
    }
  }

  return (t) => {
    const theta = a.theta + delta * t;
    const radius = a.radius + (b.radius - a.radius) * t;
    const axial = a.axial + (b.axial - a.axial) * t;
    return add(
      pivot,
      add(
        scale(n, axial),
        add(scale(e1, radius * Math.cos(theta)), scale(e2, radius * Math.sin(theta))),
      ),
    );
  };
}

/** Build the yo-yo's path for a transition (null hint = straight line). */
export function transitionPath(
  hint: MotionHint | null,
  rig: Rig,
  from: MountLayout,
  to: MountLayout,
): YoyoPath {
  const pivot = hint ? resolvePivot(hint, rig) : null;
  return yoyoArcPath(from.yoyo.center, to.yoyo.center, pivot, rig.planeNormal, hint?.sweep ?? "shortest");
}

// ---------------------------------------------------------------------------
// rope pins

export interface LayoutPin {
  /** Rope particle index. */
  index: number;
  position: Vec3;
  /** Contact kind this pin belongs to; gap/axle pins ride the yo-yo. */
  kind: AnchorKind;
}

/**
 * Choose pin points along a layout: for each contact run, its first, middle,
 * and last control points (a wrap needs entry/apex/exit held; single-point
 * runs pin once), mapped to rope particle indices by arclength fraction.
 */
export function layoutPins(
  layout: MountLayout,
  kinds: AnchorKind[],
  particleCount: number,
): LayoutPin[] {
  const { controlPoints, contactArcs } = layout;
  const cumulative: number[] = [0];
  for (let i = 1; i < controlPoints.length; i++) {
    cumulative.push(cumulative[i - 1]! + dist(controlPoints[i - 1]!, controlPoints[i]!));
  }
  const total = cumulative[cumulative.length - 1]!;

  const pins: LayoutPin[] = [];
  const taken = new Set<number>();
  let cursor = 0;
  contactArcs.forEach((run, contact) => {
    if (contact > 0) cursor += 1; // skip the sag point between runs
    const subIndices = [...new Set([0, Math.floor((run.length - 1) / 2), run.length - 1])];
    for (const sub of subIndices) {
      const global = cursor + sub;
      const fraction = total === 0 ? 0 : cumulative[global]! / total;
      const index = Math.round(fraction * (particleCount - 1));
      if (taken.has(index)) continue;
      taken.add(index);
      pins.push({ index, position: controlPoints[global]!, kind: kinds[contact]! });
    }
    cursor += run.length;
  });
  return pins;
}

/**
 * Pin positions for a moment of a transition: hand pins hold their layout
 * spots; gap/axle pins translate with the swinging yo-yo.
 */
export function pinsAt(
  pins: LayoutPin[],
  layoutYoyoCenter: Vec3,
  animatedYoyoCenter: Vec3,
): { index: number; position: Vec3 }[] {
  const offset = sub(animatedYoyoCenter, layoutYoyoCenter);
  return pins.map((pin) =>
    pin.kind === "gap" || pin.kind === "axle"
      ? { index: pin.index, position: add(pin.position, offset) }
      : { index: pin.index, position: pin.position },
  );
}

/** Contact kinds parallel to a mount's contacts (for tagging pins). */
export function contactKinds(anchors: Anchor[], contactAnchorIds: string[]): AnchorKind[] {
  const byId = new Map(anchors.map((a) => [a.id, a]));
  return contactAnchorIds.map((id) => byId.get(id)!.kind);
}

/** Polyline length of a layout's control points (rope rest-length target). */
export function layoutLength(layout: MountLayout): number {
  let length = 0;
  for (let i = 1; i < layout.controlPoints.length; i++) {
    length += dist(layout.controlPoints[i - 1]!, layout.controlPoints[i]!);
  }
  return length;
}

/** The gap pin's offset from the yo-yo center (string rides over the axle). */
export const GAP_PIN_OFFSET: Vec3 = [0, AXLE_RADIUS, 0];
