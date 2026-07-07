import { Grid, OrbitControls } from "@react-three/drei";
import { Canvas, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef, type ComponentRef } from "react";
import { CatmullRomCurve3, Quaternion, TubeGeometry, Vector3 } from "three";
import type { Mount } from "../core/schema.js";
import { layoutMount, type YoYoPose } from "./layout.js";
import {
  FINGER_RADIUS,
  defaultRig,
  type FingerPose,
  type HandPose,
  type Rig,
  type Vec3,
} from "./rig.js";

export type CameraPresetName = "audience" | "player" | "side";

const CAMERA_PRESETS: Record<CameraPresetName, { position: Vec3; target: Vec3 }> = {
  audience: { position: [0, 1.35, 2.4], target: [0, 1.0, 0] },
  player: { position: [0, 1.85, -1.05], target: [0, 0.9, 0.5] },
  side: { position: [2.4, 1.3, 0.2], target: [0, 1.0, 0] },
};

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

function StringTube({ points }: { points: Vector3[] }) {
  const geometry = useMemo(() => {
    // Centripetal parameterization keeps the tight wrap arcs from overshooting.
    const curve = new CatmullRomCurve3(points, false, "centripetal");
    return new TubeGeometry(curve, 512, 0.0055, 8, false);
  }, [points]);
  useEffect(() => () => geometry.dispose(), [geometry]);
  return (
    <mesh geometry={geometry}>
      <meshStandardMaterial color="#f2f0df" roughness={0.9} />
    </mesh>
  );
}

const SAMPLES = 200;
const smoothstep = (t: number) => t * t * (3 - 2 * t);

/** Uniformly resample a layout's spline so two topologies can be point-lerped. */
function sampleString(points: Vec3[]): Vector3[] {
  const curve = new CatmullRomCurve3(
    points.map((p) => new Vector3(...p)),
    false,
    "centripetal",
  );
  return curve.getSpacedPoints(SAMPLES);
}

export interface SceneProps {
  mount: Mount;
  /** Transition target; when set, the string morphs mount → target at `t`. */
  target?: Mount | undefined;
  /** Transition progress 0..1. */
  t?: number;
  preset: CameraPresetName;
}

export function Scene({ mount, target, t = 0, preset }: SceneProps) {
  // Elements never change spin, so one rig serves both ends of a transition.
  const rig: Rig = defaultRig(mount.spin);
  const layout = useMemo(() => layoutMount(mount, rig), [mount, rig]);
  const targetLayout = useMemo(
    () => (target ? layoutMount(target, rig) : null),
    [target, rig],
  );

  const { stringPoints, yoyo } = useMemo(() => {
    const a = sampleString(layout.controlPoints);
    if (!targetLayout) return { stringPoints: a, yoyo: layout.yoyo };
    const b = sampleString(targetLayout.controlPoints);
    const k = smoothstep(Math.min(Math.max(t, 0), 1));
    const [c0, c1] = [layout.yoyo.center, targetLayout.yoyo.center];
    const center: Vec3 = [
      c0[0] + (c1[0] - c0[0]) * k,
      c0[1] + (c1[1] - c0[1]) * k,
      c0[2] + (c1[2] - c0[2]) * k,
    ];
    return {
      stringPoints: a.map((p, i) => p.clone().lerp(b[i]!, k)),
      yoyo: { center, axis: layout.yoyo.axis },
    };
  }, [layout, targetLayout, t]);

  return (
    <Canvas camera={{ fov: 45, position: [...CAMERA_PRESETS.audience.position] }}>
      <color attach="background" args={["#15181d"]} />
      <ambientLight intensity={0.6} />
      <directionalLight position={[2, 4, 3]} intensity={1.4} />
      <directionalLight position={[-3, 2, -2]} intensity={0.4} />
      <Hand pose={rig.hands.R} label="R" />
      <Hand pose={rig.hands.L} label="L" />
      <YoYo pose={yoyo} />
      <StringTube points={stringPoints} />
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
