import { useState } from "react";
import { MOUNTS, mountById } from "./mounts.js";
import { Scene, type CameraPresetName } from "./Scene.js";

const PRESETS: CameraPresetName[] = ["audience", "player", "side"];

/** Human-readable walk of the traversal, e.g. "loop → gap(yo-yo) → L index ↑ → axle". */
function traversalSummary(mountId: string): string {
  const mount = mountById(mountId);
  const anchors = new Map(mount.anchors.map((a) => [a.id, a]));
  return mount.contacts
    .map((c) => {
      const a = anchors.get(c.anchor)!;
      switch (a.kind) {
        case "loop":
          return "loop";
        case "axle":
          return "axle";
        case "gap":
          return "gap(yo-yo)";
        case "thumb":
          return `${a.side} thumb ${c.wrap === "over" ? "↑" : "↓"}`;
        case "finger":
          return `${a.side} ${a.digit} ${c.wrap === "over" ? "↑" : "↓"}`;
      }
    })
    .join(" → ");
}

export function App() {
  const [mountId, setMountId] = useState("trapeze");
  const [preset, setPreset] = useState<CameraPresetName>("audience");
  const mount = mountById(mountId);

  return (
    <div className="app">
      <header>
        <h1>String Trick Engine</h1>
        <label>
          Mount{" "}
          <select value={mountId} onChange={(e) => setMountId(e.target.value)}>
            {MOUNTS.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name ?? m.id}
              </option>
            ))}
          </select>
        </label>
        <div className="presets" role="group" aria-label="camera preset">
          {PRESETS.map((p) => (
            <button key={p} className={p === preset ? "active" : ""} onClick={() => setPreset(p)}>
              {p}
            </button>
          ))}
        </div>
        <span className={`spin spin-${mount.spin}`}>{mount.spin} spin</span>
        <code className="walk">{traversalSummary(mountId)}</code>
      </header>
      <main>
        <Scene mount={mount} preset={preset} />
      </main>
    </div>
  );
}
