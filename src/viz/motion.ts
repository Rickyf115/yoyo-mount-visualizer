import type { MotionHint } from "../core/elements.js";
import type { Anchor, AnchorKind, Mount, Side } from "../core/schema.js";
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
  /** Hand side for hand contacts, so pins can follow moving hands. */
  side?: Side | undefined;
  /** Index into mount.contacts this pin came from. */
  contact: number;
}

export interface ContactInfo {
  kind: AnchorKind;
  side?: Side | undefined;
}

/**
 * Choose pin points along a layout: for each contact run, its first, middle,
 * and last control points (a wrap needs entry/apex/exit held; single-point
 * runs pin once), mapped to rope particle indices by arclength fraction.
 */
export function layoutPins(
  layout: MountLayout,
  contacts: ContactInfo[],
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
      pins.push({
        index,
        position: controlPoints[global]!,
        kind: contacts[contact]!.kind,
        side: contacts[contact]!.side,
        contact,
      });
    }
    cursor += run.length;
  });
  return pins;
}

/**
 * Pin positions for a moment of a transition: gap/axle pins translate with
 * the swinging yo-yo, hand pins translate with their (gliding) hand.
 */
export function pinsAt(
  pins: LayoutPin[],
  layoutYoyoCenter: Vec3,
  animatedYoyoCenter: Vec3,
  handDelta: Record<Side, Vec3> = { L: [0, 0, 0], R: [0, 0, 0] },
): { index: number; position: Vec3 }[] {
  const yoyoOffset = sub(animatedYoyoCenter, layoutYoyoCenter);
  return pins.map((pin) => {
    if (pin.kind === "gap" || pin.kind === "axle") {
      return { index: pin.index, position: add(pin.position, yoyoOffset) };
    }
    const offset = pin.side ? handDelta[pin.side] : ([0, 0, 0] as Vec3);
    return { index: pin.index, position: add(pin.position, offset) };
  });
}

/** Contact kind+side info parallel to a mount's contacts (for tagging pins). */
export function contactInfos(mount: Mount): ContactInfo[] {
  const byId = new Map(mount.anchors.map((a) => [a.id, a]));
  return mount.contacts.map((c) => {
    const anchor = byId.get(c.anchor)!;
    return { kind: anchor.kind, side: anchor.side };
  });
}

/**
 * Longest common subsequence of two mounts' contacts, by physical identity
 * (anchor kind/side/digit + wrap + direction). Returns the retained contact
 * indices per side. During a transition only the *shared* contacts stay
 * pinned: abandoned wraps release immediately, and new wraps are formed by
 * the swinging yo-yo dragging the rope around the finger (collision), with
 * their pins engaging only at the late beat.
 */
export function commonContacts(from: Mount, to: Mount): { from: Set<number>; to: Set<number> } {
  const signature = (m: Mount) => {
    const byId = new Map(m.anchors.map((a) => [a.id, a]));
    return m.contacts.map((c) => {
      const a = byId.get(c.anchor)!;
      return `${a.kind}:${a.side ?? "-"}:${a.digit ?? "-"}:${c.wrap}:${c.direction}`;
    });
  };
  const sa = signature(from);
  const sb = signature(to);
  const n = sa.length;
  const m = sb.length;
  const dp: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i]![j] = sa[i] === sb[j] ? dp[i + 1]![j + 1]! + 1 : Math.max(dp[i + 1]![j]!, dp[i]![j + 1]!);
    }
  }
  const fromSet = new Set<number>();
  const toSet = new Set<number>();
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (sa[i] === sb[j]) {
      fromSet.add(i);
      toSet.add(j);
      i++;
      j++;
    } else if (dp[i + 1]![j]! >= dp[i]![j + 1]!) i++;
    else j++;
  }
  return { from: fromSet, to: toSet };
}

/** The gap pin's offset from the yo-yo center (string rides over the axle). */
export const GAP_PIN_OFFSET: Vec3 = [0, AXLE_RADIUS, 0];
