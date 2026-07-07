import type { Anchor, Digit, Side, Spin } from "../core/schema.js";

/**
 * The geometric half of the engine: a Rig poses the hands and defines the
 * string plane. Topology (the Mount) decides where the string goes; the rig
 * decides where the anchors are in space. Units are meters-ish, y is up,
 * the player stands at the origin facing +z (the audience).
 *
 * Fingers are segments (base knuckle → tip) pointing along the string-plane
 * normal — that is what lets string wrap *around* them: the strands live in
 * the plane perpendicular to the finger axis. Contact points sit at
 * knuckle-relative parameters along the finger: the slipknot loop rides the
 * middle finger near the middle knuckle, wraps sit out toward the fingertip.
 */

export type Vec3 = readonly [number, number, number];

export interface FingerPose {
  base: Vec3;
  tip: Vec3;
}

export interface HandPose {
  palm: Vec3;
  /** Finger segments keyed by digit. */
  digits: Record<Digit, FingerPose>;
  thumb: FingerPose;
}

export interface Rig {
  hands: Record<Side, HandPose>;
  /**
   * Unit normal of the string plane — also the yo-yo's spin axis and the
   * rough direction fingers point.
   */
  planeNormal: Vec3;
}

export const FINGER_RADIUS = 0.024;

/** Where along the finger each kind of contact sits (0 = base knuckle, 1 = tip). */
const LOOP_T = 0.45;
const FINGER_WRAP_T = 0.72;
const THUMB_WRAP_T = 0.65;

const DIGITS: Digit[] = ["index", "middle", "ring", "pinky"];

const lerp = (a: Vec3, b: Vec3, t: number): Vec3 => [
  a[0] + (b[0] - a[0]) * t,
  a[1] + (b[1] - a[1]) * t,
  a[2] + (b[2] - a[2]) * t,
];

/**
 * Build a hand whose fingers point along `fingerDir`, stacked along
 * `stackDir` (index first), with the thumb rising from the palm's inner edge.
 */
function hand(palm: Vec3, fingerDir: Vec3, stackDir: Vec3, thumbSide: Vec3): HandPose {
  const digits = {} as Record<Digit, FingerPose>;
  DIGITS.forEach((digit, i) => {
    // Spacing must exceed the finger diameter (2 × FINGER_RADIUS) or the
    // capsules clip into each other.
    const stack = (1.5 - i) * 0.056; // index +0.084 … pinky -0.084
    const base: Vec3 = [
      palm[0] + fingerDir[0] * 0.045 + stackDir[0] * stack,
      palm[1] + fingerDir[1] * 0.045 + stackDir[1] * stack,
      palm[2] + fingerDir[2] * 0.045 + stackDir[2] * stack,
    ];
    const tip: Vec3 = [
      base[0] + fingerDir[0] * 0.13,
      base[1] + fingerDir[1] * 0.13,
      base[2] + fingerDir[2] * 0.13,
    ];
    digits[digit] = { base, tip };
  });
  const thumbBase: Vec3 = [
    palm[0] + thumbSide[0] * 0.055,
    palm[1] + 0.02,
    palm[2] + thumbSide[2] * 0.055 + fingerDir[2] * 0.02,
  ];
  const thumb: FingerPose = {
    base: thumbBase,
    tip: [
      thumbBase[0] + thumbSide[0] * 0.025 + fingerDir[0] * 0.02,
      thumbBase[1] + 0.095,
      thumbBase[2] + thumbSide[2] * 0.025 + fingerDir[2] * 0.02,
    ],
  };
  return { palm, digits, thumb };
}

/**
 * Side spin (breakaway family): the string plane faces the audience (x–y),
 * hands spread left/right with fingers pointing at the audience, yo-yo spin
 * axis toward the audience. Thumbs rise on each hand's inner edge.
 */
const SIDE_RIG: Rig = {
  hands: {
    R: hand([0.55, 1.12, -0.05], [0, 0, 1], [0, 1, 0], [-1, 0, 0]),
    L: hand([-0.55, 1.12, -0.05], [0, 0, 1], [0, 1, 0], [1, 0, 0]),
  },
  planeNormal: [0, 0, 1],
};

/**
 * Front spin: the string plane runs toward the audience (y–z), the
 * non-throwhand reaches forward, fingers point across the plane (±x),
 * spin axis left–right.
 */
const FRONT_RIG: Rig = {
  hands: {
    R: hand([0.16, 1.12, -0.5], [-1, 0, 0], [0, 1, 0], [0, 0, -1]),
    L: hand([-0.16, 1.12, 0.55], [1, 0, 0], [0, 1, 0], [0, 0, 1]),
  },
  planeNormal: [1, 0, 0],
};

export function defaultRig(spin: Spin): Rig {
  return spin === "side" ? SIDE_RIG : FRONT_RIG;
}

/** The finger segment a hand anchor lives on. */
export function anchorFinger(rig: Rig, anchor: Anchor): FingerPose {
  const handPose = rig.hands[anchor.side!];
  switch (anchor.kind) {
    case "loop":
      return handPose.digits.middle; // slipknot on the throwhand middle finger
    case "finger":
      return handPose.digits[anchor.digit!];
    case "thumb":
      return handPose.thumb;
    default:
      throw new Error(`anchor "${anchor.id}" of kind "${anchor.kind}" is not a hand anchor`);
  }
}

/** Knuckle-relative contact point of a hand anchor on its finger axis. */
export function anchorContactCenter(rig: Rig, anchor: Anchor): Vec3 {
  const finger = anchorFinger(rig, anchor);
  const t =
    anchor.kind === "loop" ? LOOP_T : anchor.kind === "thumb" ? THUMB_WRAP_T : FINGER_WRAP_T;
  return lerp(finger.base, finger.tip, t);
}
