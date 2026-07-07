import { useEffect, useState } from "react";
import {
  STANDARD_ELEMENTS,
  THROWS,
  applyElement,
  legalElements,
  passElement,
} from "../core/elements.js";
import type { Mount } from "../core/schema.js";
import { MOUNTS, displayName, fixtureTwin, mountById } from "./mounts.js";
import { Scene, type CameraPresetName } from "./Scene.js";

const PRESETS: CameraPresetName[] = ["audience", "player", "side"];
const TRANSITION_SECONDS = 1.4;

/** Human-readable walk of the traversal, e.g. "loop → gap(yo-yo) → L index ↑ → axle". */
function traversalSummary(mount: Mount): string {
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

interface PlayerState {
  current: Mount;
  /** Upcoming transition targets, animated one at a time. */
  queue: Mount[];
  /** Progress through the current transition, 0..1. */
  t: number;
}

export function App() {
  const [state, setState] = useState<PlayerState>({
    current: mountById("trapeze"),
    queue: [],
    t: 0,
  });
  const [playing, setPlaying] = useState(true);
  const [preset, setPreset] = useState<CameraPresetName>("audience");

  const { current, queue, t } = state;
  const target = queue[0];
  // The mount the *next* enqueued element applies to (chaining while playing).
  const tail = queue[queue.length - 1] ?? current;
  // Once past the beat, the traversal readout switches to the incoming topology.
  const shown = target && t >= 0.5 ? target : current;

  useEffect(() => {
    if (!playing) return;
    let raf: number;
    let last = performance.now();
    const step = (now: number) => {
      const dt = (now - last) / 1000;
      last = now;
      setState((s) => {
        if (s.queue.length === 0) return s;
        const nt = s.t + dt / TRANSITION_SECONDS;
        if (nt >= 1) return { current: s.queue[0]!, queue: s.queue.slice(1), t: 0 };
        return { ...s, t: nt };
      });
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [playing]);

  const jumpTo = (mount: Mount) => setState({ current: mount, queue: [], t: 0 });
  const enqueue = (mount: Mount) =>
    setState((s) => ({ ...s, queue: [...s.queue, mount] }));
  const runDemo = () => {
    const trapeze = mountById("trapeze");
    const midSwing = applyElement(passElement({ side: "R", digit: "index" }), trapeze);
    const don = applyElement(passElement({ side: "L", digit: "index" }), midSwing);
    setState({ current: trapeze, queue: [midSwing, don], t: 0 });
    setPlaying(true);
  };

  return (
    <div className="app">
      <header>
        <h1>String Trick Engine</h1>
        <label>
          Mount{" "}
          <select
            value={fixtureTwin(current)?.id ?? ""}
            onChange={(e) => jumpTo(mountById(e.target.value))}
          >
            {fixtureTwin(current) === undefined && <option value="" />}
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
        <span className={`spin spin-${shown.spin}`}>{shown.spin} spin</span>
        <code className="walk">{traversalSummary(shown)}</code>
      </header>
      <header className="timeline">
        <span className="group-label">throw</span>
        {Object.values(THROWS).map((entry) => (
          <button key={entry.name} onClick={() => jumpTo(entry.result())}>
            {entry.name}
          </button>
        ))}
        <span className="group-label">element</span>
        {legalElements(STANDARD_ELEMENTS, tail).map((element) => (
          <button
            key={element.name}
            title={element.description}
            onClick={() => enqueue(applyElement(element, tail))}
          >
            {element.name}
          </button>
        ))}
        <span className="group-label">demo</span>
        <button onClick={runDemo}>trapeze → double or nothing</button>
        <span className="group-label">timeline</span>
        <button onClick={() => setPlaying((p) => !p)} disabled={!target}>
          {playing ? "⏸" : "▶"}
        </button>
        <input
          type="range"
          min={0}
          max={1}
          step={0.001}
          value={t}
          disabled={!target}
          onChange={(e) => {
            setPlaying(false);
            setState((s) => ({ ...s, t: Number(e.target.value) }));
          }}
        />
        <span className="now">
          {displayName(current)}
          {target ? ` → ${displayName(target)}` : ""}
          {queue.length > 1 ? ` (+${queue.length - 1} queued)` : ""}
        </span>
      </header>
      <main>
        <Scene mount={current} target={target} t={t} preset={preset} />
      </main>
    </div>
  );
}
