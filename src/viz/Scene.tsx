import { Grid, OrbitControls } from "@react-three/drei";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef, type ComponentRef } from "react";
import { CatmullRomCurve3, Mesh, Quaternion, TubeGeometry, Vector3 } from "three";
import type { MotionHint } from "../core/elements.js";
import type { Mount } from "../core/schema.js";
import { layoutMount, type MountLayout, type YoYoPose } from "./layout.js";
import {
  contactKinds,
  layoutLength,
  layoutPins,
  pinsAt,
  transitionPath,
  type LayoutPin,
} from "./motion.js";
import {
  FINGER_RADIUS,
  defaultRig,
  type FingerPose,
  type HandPose,
  type Rig,
  type Vec3,
} from "./rig.js";
import {
  createRope,
  ropePoints,
  setRestLength,
  stepRope,
  type Capsule,
  type Pin,
  type RopeState,
} from "../sim/rope.js";

export type CameraPresetName = "audience" | "player" | "side";

const CAMERA_PRESETS: Record<CameraPresetName, { position: Vec3; target: Vec3 }> = {
  audience: { position: [0, 1.35, 2.4], target: [0, 1.0, 0] },
  player: { position: [0, 1.85, -1.05], target: [0, 0.9, 0.5] },
  side: { position: [2.4, 1.3, 0.2], target: [0, 1.0, 0] },
};

const PARTICLES = 120;
const STRING_RADIUS = 0.0055;
const smoothstep = (t: number) => t * t * (3 - 2 * t);

function CameraRig({ preset }: { preset: CameraPresetName }) {
  const controls = useRef<ComponentRef<typeof OrbitControls>>(null);
  const camera = useThree((s) => s.camera);
  useEffect(() => {
    const { position, target } = CAMERA_PRESETS[preset];
    camera.position.set(...position);
    controls.current?.target.set(...target);
    controls.current?.update();
  }, [preset, camera]);
  return <OrbitControls ref={controls} makeDefault />;
}

function Finger({ finger, color }: { finger: FingerPose; color: string }) {
  const { position, quaternion, length } = useMemo(() => {
    const base = new Vector3(...finger.base);
    const tip = new Vector3(...finger.tip);
    const dir = tip.clone().sub(base);
    return {
      position: base.clone().add(tip).multiplyScalar(0.5),
      quaternion: new Quaternion().setFromUnitVectors(new Vector3(0, 1, 0), dir.clone().normalize()),
      length: dir.length(),
    };
  }, [finger]);
  return (
    <mesh position={position} quaternion={quaternion}>
      <capsuleGeometry args={[FINGER_RADIUS, length, 6, 14]} />
      <meshStandardMaterial color={color} roughness={0.7} />
    </mesh>
  );
}

function Hand({ pose, label }: { pose: HandPose; label: "L" | "R" }) {
  const color = label === "R" ? "#d98e73" : "#73a8d9";
  const fingers = [...Object.values(pose.digits), pose.thumb];
  return (
    <group>
      <mesh position={[...pose.palm]}>
        <sphereGeometry args={[0.055, 24, 24]} />
        <meshStandardMaterial color={color} roughness={0.7} />
      </mesh>
      {fingers.map((finger, i) => (
        <Finger key={i} finger={finger} color={color} />
      ))}
    </group>
  );
}

function YoYo({ pose }: { pose: YoYoPose }) {
  // Cylinders extend along +y by default; rotate y onto the spin axis.
  const rotation: Vec3 =
    pose.axis[0] !== 0 ? [0, 0, Math.PI / 2] : pose.axis[2] !== 0 ? [Math.PI / 2, 0, 0] : [0, 0, 0];
  return (
    <group position={[...pose.center]} rotation={[...rotation]}>
      {[0.021, -0.021].map((offset) => (
        <mesh key={offset} position={[0, offset, 0]}>
          <cylinderGeometry args={[0.056, 0.056, 0.026, 40]} />
          <meshStandardMaterial color="#c23b4e" roughness={0.35} metalness={0.15} />
        </mesh>
      ))}
      <mesh>
        <cylinderGeometry args={[0.011, 0.011, 0.018, 16]} />
        <meshStandardMaterial color="#cfcfcf" roughness={0.4} metalness={0.6} />
      </mesh>
    </group>
  );
}

/** Uniformly resample a layout's spline (rope seeds and morph fallback). */
function sampleString(points: Vec3[], samples: number): Vector3[] {
  const curve = new CatmullRomCurve3(
    points.map((p) => new Vector3(...p)),
    false,
    "centripetal",
  );
  return curve.getSpacedPoints(samples);
}

function stringGeometry(points: Vector3[]): TubeGeometry {
  const curve = new CatmullRomCurve3(points, false, "centripetal");
  return new TubeGeometry(curve, 300, STRING_RADIUS, 8, false);
}

/** Static-geometry string (physics off): point-lerped morph between layouts. */
function MorphString({ points }: { points: Vector3[] }) {
  const geometry = useMemo(() => stringGeometry(points), [points]);
  useEffect(() => () => geometry.dispose(), [geometry]);
  return (
    <mesh geometry={geometry}>
      <meshStandardMaterial color="#f2f0df" roughness={0.9} />
    </mesh>
  );
}

/** All hand geometry as rope colliders. */
function ropeColliders(rig: Rig): Capsule[] {
  const capsules: Capsule[] = [];
  for (const hand of Object.values(rig.hands)) {
    for (const finger of [...Object.values(hand.digits), hand.thumb]) {
      capsules.push({ a: finger.base, b: finger.tip, radius: FINGER_RADIUS + STRING_RADIUS });
    }
    capsules.push({ a: hand.palm, b: hand.palm, radius: 0.055 + STRING_RADIUS });
  }
  return capsules;
}

interface PhysicsStringProps {
  seed: Vec3[];
  pins: Pin[];
  restLength: number;
  colliders: Capsule[];
  /** Changing epoch reseeds the rope (hard jumps); transitions keep state. */
  epoch: number;
}

function PhysicsString({ seed, pins, restLength, colliders, epoch }: PhysicsStringProps) {
  const rope = useRef<RopeState | null>(null);
  const mesh = useRef<Mesh>(null);
  const latest = useRef({ pins, restLength, colliders });
  latest.current = { pins, restLength, colliders };
  const seedRef = useRef(seed);
  seedRef.current = seed;

  useEffect(() => {
    rope.current = createRope(seedRef.current);
  }, [epoch]);

  useFrame((_, delta) => {
    if (!rope.current || !mesh.current) return;
    setRestLength(rope.current, latest.current.restLength);
    stepRope(rope.current, delta, latest.current.pins, latest.current.colliders);
    const geometry = stringGeometry(ropePoints(rope.current).map((p) => new Vector3(...p)));
    mesh.current.geometry.dispose();
    mesh.current.geometry = geometry;
  });

  return (
    <mesh ref={mesh}>
      <meshStandardMaterial color="#f2f0df" roughness={0.9} />
    </mesh>
  );
}

export interface SceneProps {
  mount: Mount;
  /** Transition target; when set, the transition animates mount → target at `t`. */
  target?: Mount | undefined;
  /** The element's motion hint for the active transition. */
  hint?: MotionHint | null | undefined;
  /** Transition progress 0..1. */
  t?: number;
  physics?: boolean;
  /** Incremented by hard jumps (dropdown/throw) to reseed the rope. */
  epoch?: number;
  preset: CameraPresetName;
}

export function Scene({ mount, target, hint = null, t = 0, physics = true, epoch = 0, preset }: SceneProps) {
  // Elements never change spin, so one rig serves both ends of a transition.
  const rig: Rig = defaultRig(mount.spin);
  const layout = useMemo(() => layoutMount(mount, rig), [mount, rig]);
  const targetLayout = useMemo(() => (target ? layoutMount(target, rig) : null), [target, rig]);
  const colliders = useMemo(() => ropeColliders(rig), [rig]);
  const k = smoothstep(Math.min(Math.max(t, 0), 1));

  // The yo-yo swings along the element's arc; the string is pinned to it.
  const path = useMemo(
    () => (targetLayout ? transitionPath(hint, rig, layout, targetLayout) : null),
    [hint, rig, layout, targetLayout],
  );
  const yoyoCenter = path ? path(k) : layout.yoyo.center;
  const yoyo: YoYoPose = { center: yoyoCenter, axis: rig.planeNormal };

  // Pins: from-layout before the beat, to-layout after; gap/axle pins ride the yo-yo.
  const pinsFor = (m: Mount, l: MountLayout): LayoutPin[] =>
    layoutPins(l, contactKinds(m.anchors, m.contacts.map((c) => c.anchor)), PARTICLES);
  const fromPins = useMemo(() => pinsFor(mount, layout), [mount, layout]);
  const toPins = useMemo(
    () => (target && targetLayout ? pinsFor(target, targetLayout) : null),
    [target, targetLayout],
  );
  const past = targetLayout !== null && t >= 0.5;
  const activeLayout = past ? targetLayout! : layout;
  const pins = pinsAt(past ? toPins! : fromPins, activeLayout.yoyo.center, yoyoCenter);
  const restLength =
    layoutLength(layout) +
    (targetLayout ? (layoutLength(targetLayout) - layoutLength(layout)) * k : 0);

  const seed = useMemo(
    () => sampleString(layout.controlPoints, PARTICLES - 1).map((p): Vec3 => [p.x, p.y, p.z]),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [epoch],
  );

  // Fallback (physics off): point-lerped morph, as in Session 3.
  const morphPoints = useMemo(() => {
    if (physics) return [];
    const a = sampleString(layout.controlPoints, 200);
    if (!targetLayout) return a;
    const b = sampleString(targetLayout.controlPoints, 200);
    return a.map((p, i) => p.clone().lerp(b[i]!, k));
  }, [physics, layout, targetLayout, k]);

  return (
    <Canvas camera={{ fov: 45, position: [...CAMERA_PRESETS.audience.position] }}>
      <color attach="background" args={["#15181d"]} />
      <ambientLight intensity={0.6} />
      <directionalLight position={[2, 4, 3]} intensity={1.4} />
      <directionalLight position={[-3, 2, -2]} intensity={0.4} />
      <Hand pose={rig.hands.R} label="R" />
      <Hand pose={rig.hands.L} label="L" />
      <YoYo pose={yoyo} />
      {physics ? (
        <PhysicsString
          seed={seed}
          pins={pins}
          restLength={restLength}
          colliders={colliders}
          epoch={epoch}
        />
      ) : (
        <MorphString points={morphPoints} />
      )}
      <Grid
        position={[0, 0, 0]}
        args={[8, 8]}
        cellColor="#2a2f38"
        sectionColor="#3a4150"
        infiniteGrid
        fadeDistance={9}
      />
      <CameraRig preset={preset} />
    </Canvas>
  );
}
