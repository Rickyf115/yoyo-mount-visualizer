/**
 * Position-based (Verlet) rope for string realism. The topology still
 * dictates *where* the string is pinned; this module only makes it hang and
 * swing naturally between pins.
 *
 * Pure and framework-free: viz feeds it pin positions and colliders each
 * frame and reads back particle positions for the tube geometry. Fixed
 * timestep with an accumulator so behaviour is frame-rate independent and
 * deterministic for tests.
 */

export type Vec3 = readonly [number, number, number];

export interface RopeState {
  positions: Float64Array; // xyz interleaved, particleCount * 3
  previous: Float64Array;
  particleCount: number;
  /** Rest length of each inter-particle segment. */
  segmentLength: number;
  /** Unspent simulation time carried between steps. */
  accumulator: number;
}

export interface Pin {
  /** Particle index to pin (0 … particleCount-1). */
  index: number;
  position: Vec3;
}

/** Capsule collider (finger, palm as a=b sphere). */
export interface Capsule {
  a: Vec3;
  b: Vec3;
  radius: number;
}

export interface RopeParams {
  gravity: number;
  /** Velocity kept per step (1 = undamped). */
  damping: number;
  constraintIterations: number;
  /** Fixed simulation timestep in seconds. */
  timestep: number;
}

export const DEFAULT_PARAMS: RopeParams = {
  gravity: -3.5, // gentler than earth so the scaled-down scene reads calmly
  damping: 0.985,
  constraintIterations: 14,
  timestep: 1 / 120,
};

/** Seed a rope along a polyline, at rest (previous = current). */
export function createRope(points: Vec3[], slack = 1.02): RopeState {
  const particleCount = points.length;
  if (particleCount < 2) throw new Error("a rope needs at least 2 particles");
  const positions = new Float64Array(particleCount * 3);
  points.forEach((p, i) => positions.set(p, i * 3));
  let length = 0;
  for (let i = 1; i < particleCount; i++) {
    length += Math.hypot(
      positions[i * 3]! - positions[(i - 1) * 3]!,
      positions[i * 3 + 1]! - positions[(i - 1) * 3 + 1]!,
      positions[i * 3 + 2]! - positions[(i - 1) * 3 + 2]!,
    );
  }
  return {
    positions,
    previous: positions.slice(),
    particleCount,
    segmentLength: (length * slack) / (particleCount - 1),
    accumulator: 0,
  };
}

/** Retarget the rope's rest length (e.g. when the pinned topology changes). */
export function setRestLength(rope: RopeState, polylineLength: number, slack = 1.02): void {
  rope.segmentLength = (polylineLength * slack) / (rope.particleCount - 1);
}

function integrate(rope: RopeState, params: RopeParams): void {
  const { positions, previous } = rope;
  const dt2 = params.timestep * params.timestep;
  for (let i = 0; i < rope.particleCount; i++) {
    const o = i * 3;
    for (let k = 0; k < 3; k++) {
      const cur = positions[o + k]!;
      const vel = (cur - previous[o + k]!) * params.damping;
      previous[o + k] = cur;
      positions[o + k] = cur + vel + (k === 1 ? params.gravity * dt2 : 0);
    }
  }
}

function satisfyDistances(rope: RopeState): void {
  const { positions, segmentLength } = rope;
  for (let i = 1; i < rope.particleCount; i++) {
    const a = (i - 1) * 3;
    const b = i * 3;
    const dx = positions[b]! - positions[a]!;
    const dy = positions[b + 1]! - positions[a + 1]!;
    const dz = positions[b + 2]! - positions[a + 2]!;
    const d = Math.hypot(dx, dy, dz);
    if (d === 0) continue;
    const correction = ((d - segmentLength) / d) * 0.5;
    positions[a] = positions[a]! + dx * correction;
    positions[a + 1] = positions[a + 1]! + dy * correction;
    positions[a + 2] = positions[a + 2]! + dz * correction;
    positions[b] = positions[b]! - dx * correction;
    positions[b + 1] = positions[b + 1]! - dy * correction;
    positions[b + 2] = positions[b + 2]! - dz * correction;
  }
}

function applyPins(rope: RopeState, pins: readonly Pin[]): void {
  for (const pin of pins) {
    rope.positions.set(pin.position, pin.index * 3);
  }
}

function pushOutOfCapsules(rope: RopeState, capsules: readonly Capsule[]): void {
  for (const c of capsules) {
    const ax = c.a[0];
    const ay = c.a[1];
    const az = c.a[2];
    const abx = c.b[0] - ax;
    const aby = c.b[1] - ay;
    const abz = c.b[2] - az;
    const abLen2 = abx * abx + aby * aby + abz * abz;
    for (let i = 0; i < rope.particleCount; i++) {
      const o = i * 3;
      const px = rope.positions[o]! - ax;
      const py = rope.positions[o + 1]! - ay;
      const pz = rope.positions[o + 2]! - az;
      const t = abLen2 === 0 ? 0 : Math.min(1, Math.max(0, (px * abx + py * aby + pz * abz) / abLen2));
      const cx = px - abx * t;
      const cy = py - aby * t;
      const cz = pz - abz * t;
      const d = Math.hypot(cx, cy, cz);
      if (d >= c.radius || d === 0) continue;
      const push = c.radius / d;
      rope.positions[o] = ax + abx * t + cx * push;
      rope.positions[o + 1] = ay + aby * t + cy * push;
      rope.positions[o + 2] = az + abz * t + cz * push;
    }
  }
}

/**
 * Advance the rope by `elapsed` seconds (any frame delta; internally fixed
 * 120 Hz sub-steps, capped to avoid spiral-of-death on tab stalls).
 */
export function stepRope(
  rope: RopeState,
  elapsed: number,
  pins: readonly Pin[],
  capsules: readonly Capsule[] = [],
  params: RopeParams = DEFAULT_PARAMS,
): void {
  rope.accumulator = Math.min(rope.accumulator + elapsed, 0.1);
  while (rope.accumulator >= params.timestep) {
    rope.accumulator -= params.timestep;
    integrate(rope, params);
    for (let iter = 0; iter < params.constraintIterations; iter++) {
      applyPins(rope, pins);
      satisfyDistances(rope);
      pushOutOfCapsules(rope, capsules);
    }
    applyPins(rope, pins);
  }
}

export function ropePoints(rope: RopeState): Vec3[] {
  const out: Vec3[] = [];
  for (let i = 0; i < rope.particleCount; i++) {
    out.push([rope.positions[i * 3]!, rope.positions[i * 3 + 1]!, rope.positions[i * 3 + 2]!]);
  }
  return out;
}
