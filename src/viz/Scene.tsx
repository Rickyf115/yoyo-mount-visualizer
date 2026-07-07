import { Grid, Line, OrbitControls } from "@react-three/drei";
import { Canvas, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef, type ComponentRef } from "react";
import { CatmullRomCurve3, TubeGeometry, Vector3 } from "three";
import type { Mount } from "../core/schema.js";
import { layoutMount, type YoYoPose } from "./layout.js";
import { defaultRig, type HandPose, type Rig, type Vec3 } from "./rig.js";

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

function Hand({ pose, label }: { pose: HandPose; label: "L" | "R" }) {
  const color = label === "R" ? "#d98e73" : "#73a8d9";
  const tips = [...Object.values(pose.digits), pose.thumb];
  return (
    <group>
      <mesh position={[...pose.palm]}>
        <sphereGeometry args={[0.05, 24, 24]} />
        <meshStandardMaterial color={color} roughness={0.7} />
      </mesh>
      {tips.map((tip, i) => (
        <group key={i}>
          <mesh position={[...tip]}>
            <sphereGeometry args={[0.03, 16, 16]} />
            <meshStandardMaterial color={color} roughness={0.7} />
          </mesh>
          <Line points={[pose.palm, tip]} color={color} lineWidth={5} transparent opacity={0.55} />
        </group>
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

function StringTube({ points }: { points: Vec3[] }) {
  const geometry = useMemo(() => {
    const curve = new CatmullRomCurve3(
      points.map((p) => new Vector3(...p)),
      false,
      "catmullrom",
      0.6,
    );
    return new TubeGeometry(curve, 256, 0.0055, 8, false);
  }, [points]);
  useEffect(() => () => geometry.dispose(), [geometry]);
  return (
    <mesh geometry={geometry}>
      <meshStandardMaterial color="#f2f0df" roughness={0.9} />
    </mesh>
  );
}

export function Scene({ mount, preset }: { mount: Mount; preset: CameraPresetName }) {
  const rig: Rig = defaultRig(mount.spin);
  const layout = useMemo(() => layoutMount(mount, rig), [mount, rig]);
  return (
    <Canvas camera={{ fov: 45, position: [...CAMERA_PRESETS.audience.position] }}>
      <color attach="background" args={["#15181d"]} />
      <ambientLight intensity={0.6} />
      <directionalLight position={[2, 4, 3]} intensity={1.4} />
      <directionalLight position={[-3, 2, -2]} intensity={0.4} />
      <Hand pose={rig.hands.R} label="R" />
      <Hand pose={rig.hands.L} label="L" />
      <YoYo pose={layout.yoyo} />
      <StringTube points={layout.controlPoints} />
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
