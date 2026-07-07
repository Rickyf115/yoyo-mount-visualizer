import type { Anchor, Mount } from "../core/schema.js";
import type { Rig, Vec3 } from "./rig.js";

/**
 * First-pass Layout(Mount, Rig): walk the mount's contact traversal and
 * derive 3D control points for the string spline plus the yo-yo's pose.
 * Purely geometric heuristics — no physics (that's Session 4). Topology
 * decides everything structural; this module only decides *where*.
 */

export interface YoYoPose {
  center: Vec3;
  /** Unit spin axis (the rig's string-plane normal). */
  axis: Vec3;
}

export interface MountLayout {
  /** Control points for a Catmull-Rom spline, player end → axle. */
  controlPoints: Vec3[];
  yoyo: YoYoPose;
}

const FINGER_RADIUS = 0.033;
const YOYO_HANG = 0.38;
const MOUNT_SAG = 0.16;
const SEGMENT_SAG = 0.02;
/** Repeated wraps on one anchor stack along the plane normal by this much. */
const WRAP_SPACING = 0.028;
const AXLE_RADIUS = 0.012;

const add = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const scale = (a: Vec3, s: number): Vec3 => [a[0] * s, a[1] * s, a[2] * s];
const mid = (a: Vec3, b: Vec3): Vec3 => scale(add(a, b), 0.5);
const dist = (a: Vec3, b: Vec3): number => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

/** World position of a hand anchor (loop/finger/thumb) under the rig. */
function handAnchorPosition(anchor: Anchor, rig: Rig): Vec3 {
  const handPose = rig.hands[anchor.side!];
  switch (anchor.kind) {
    case "loop":
      // The slipknot sits on the throwhand middle finger.
      return handPose.digits.middle;
    case "finger":
      return handPose.digits[anchor.digit!];
    case "thumb":
      return handPose.thumb;
    default:
      throw new Error(`anchor "${anchor.id}" of kind "${anchor.kind}" is not a hand anchor`);
  }
}

/**
 * Where the yo-yo sits. If the traversal has a gap contact, the yo-yo rests
 * on the string there: between the two neighbouring anchors when both are on
 * hands, or hanging below the preceding anchor when the gap directly abuts
 * the axle winding (the string end is at the yo-yo, e.g. brother, 1.5).
 * With no gap contact the yo-yo dangles at the string's end (dead string).
 */
function yoyoCenter(mount: Mount, rig: Rig, anchorById: Map<string, Anchor>): Vec3 {
  const kindAt = (i: number) => anchorById.get(mount.contacts[i]!.anchor)!;
  const posAt = (i: number) => handAnchorPosition(kindAt(i), rig);

  const gapIndex = mount.contacts.findIndex((c) => anchorById.get(c.anchor)!.kind === "gap");
  if (gapIndex === -1) {
    // Unmounted: hang below the last hand anchor before the axle.
    return add(posAt(mount.contacts.length - 2), [0, -0.55, 0]);
  }
  const before = kindAt(gapIndex - 1);
  const after = kindAt(gapIndex + 1);
  if (after.kind === "axle") {
    if (before.kind === "gap") {
      throw new Error(`mount "${mount.id}": consecutive gap contacts are not supported yet`);
    }
    return add(posAt(gapIndex - 1), [0, -YOYO_HANG, 0]);
  }
  if (before.kind === "gap" || after.kind === "gap") {
    throw new Error(`mount "${mount.id}": consecutive gap contacts are not supported yet`);
  }
  const rest = mid(posAt(gapIndex - 1), posAt(gapIndex + 1));
  return add(rest, [0, -MOUNT_SAG, 0]);
}

export function layoutMount(mount: Mount, rig: Rig): MountLayout {
  const anchorById = new Map(mount.anchors.map((a) => [a.id, a]));
  const yoyo: YoYoPose = {
    center: yoyoCenter(mount, rig, anchorById),
    axis: rig.planeNormal,
  };

  // Contact points: anchor surface positions, with over/under expressed
  // vertically and repeated wraps on one anchor stacked along the plane
  // normal so double wraps stay legible.
  const visits = new Map<string, number>();
  const contactPoints: Vec3[] = mount.contacts.map((contact) => {
    const anchor = anchorById.get(contact.anchor)!;
    const visit = visits.get(contact.anchor) ?? 0;
    visits.set(contact.anchor, visit + 1);
    const stack = scale(rig.planeNormal, visit * WRAP_SPACING);

    let point: Vec3;
    switch (anchor.kind) {
      case "gap":
        point = add(yoyo.center, [0, AXLE_RADIUS, 0]);
        break;
      case "axle":
        point = yoyo.center;
        break;
      default: {
        const tip = handAnchorPosition(anchor, rig);
        const overUnder: Vec3 = [0, contact.wrap === "over" ? FINGER_RADIUS : -FINGER_RADIUS, 0];
        point = add(tip, overUnder);
      }
    }
    return add(point, stack);
  });

  // Insert a slightly sagged midpoint into each span so the spline reads as
  // string rather than wire.
  const controlPoints: Vec3[] = [];
  contactPoints.forEach((point, i) => {
    if (i > 0) {
      const prev = contactPoints[i - 1]!;
      const sag = Math.min(SEGMENT_SAG, dist(prev, point) * 0.08);
      controlPoints.push(add(mid(prev, point), [0, -sag, 0]));
    }
    controlPoints.push(point);
  });

  return { controlPoints, yoyo };
}
