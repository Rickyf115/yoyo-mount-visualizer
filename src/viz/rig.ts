import type { Digit, Side, Spin } from "../core/schema.js";

/**
 * The geometric half of the engine: a Rig poses the hands and defines the
 * string plane. Topology (the Mount) decides where the string goes; the rig
 * decides where the anchors are in space. Units are meters-ish, y is up,
 * the player stands at the origin facing +z (the audience).
 */

export type Vec3 = readonly [number, number, number];

export interface HandPose {
  palm: Vec3;
  /** Fingertip positions keyed by digit. */
  digits: Record<Digit, Vec3>;
  thumb: Vec3;
}

export interface Rig {
  hands: Record<Side, HandPose>;
  /**
   * Unit normal of the string plane — also the yo-yo's spin axis. Repeated
   * wraps on one anchor are stacked along this axis so they stay visible.
   */
  planeNormal: Vec3;
}

const DIGITS: Digit[] = ["index", "middle", "ring", "pinky"];

/**
 * Build a hand: fingertips fan out from the palm along `fingerDir`, spread
 * along `spreadDir` (index first), thumb tucked toward the string plane.
 */
function hand(palm: Vec3, fingerDir: Vec3, spreadDir: Vec3): HandPose {
  const digits = {} as Record<Digit, Vec3>;
  DIGITS.forEach((digit, i) => {
    const spread = (1 - i) * 0.035; // index +0.035 … pinky -0.035
    digits[digit] = [
      palm[0] + fingerDir[0] * 0.14 + spreadDir[0] * spread,
      palm[1] + fingerDir[1] * 0.14 + spreadDir[1] * spread + 0.05,
      palm[2] + fingerDir[2] * 0.14 + spreadDir[2] * spread,
    ];
  });
  const thumb: Vec3 = [
    palm[0] + fingerDir[0] * 0.06 - spreadDir[0] * 0.07,
    palm[1] + 0.01,
    palm[2] + fingerDir[2] * 0.06 - spreadDir[2] * 0.07,
  ];
  return { palm, digits, thumb };
}

/**
 * Side spin (breakaway family): the string plane faces the audience (x–y),
 * hands spread left/right, yo-yo spin axis points at the audience.
 */
const SIDE_RIG: Rig = {
  hands: {
    R: hand([0.55, 1.15, 0], [-1, 0, 0], [0, 0, 1]),
    L: hand([-0.55, 1.15, 0], [1, 0, 0], [0, 0, 1]),
  },
  planeNormal: [0, 0, 1],
};

/**
 * Front spin: the string plane runs toward the audience (y–z), the
 * non-throwhand reaches forward, spin axis points left–right.
 */
const FRONT_RIG: Rig = {
  hands: {
    R: hand([0.12, 1.15, -0.5], [0, 0, 1], [1, 0, 0]),
    L: hand([-0.12, 1.15, 0.55], [0, 0, -1], [1, 0, 0]),
  },
  planeNormal: [1, 0, 0],
};

export function defaultRig(spin: Spin): Rig {
  return spin === "side" ? SIDE_RIG : FRONT_RIG;
}
