import { useEffect, useState } from "react";
import {
  STANDARD_ELEMENTS,
  THROWS,
  applyElement,
  legalElements,
  passElement,
  type Element,
  type MotionHint,
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

interface QueuedTransition {
  mount: Mount;
  /** Swing-arc hint from the element that produced this target. */
  hint: MotionHint | null;
}

interface PlayerState {
  current: Mount;
  /** Upcoming transitions, animated one at a time. */
  queue: QueuedTransition[];
  /** Progress through the current transition, 0..1. */
  t: number;
  /** Bumped on hard jumps (dropdown/throw) so the rope reseeds. */
  epoch: number;
}

export function App() {
  const [state, setState] = useState<PlayerState>({
    current: mountById("trapeze"),
    queue: [],
    t: 0,
    epoch: 0,
  });
  const [playing, setPlaying] = useState(true);
  const [physics, setPhysics] = useState(true);
  const [preset, setPreset] = useState<CameraPresetName>("audience");

  const { current, queue, t } = state;
  const target = queue[0];
  // The mount the *next* enqueued element applies to (chaining while playing).
  const tail = queue[queue.length - 1]?.mount ?? current;
  // Once past the beat, the traversal readout switches to the incoming topology.
  const shown = target && t >= 0.5 ? target.mount : current;

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
        if (nt >= 1) {
          return { current: s.queue[0]!.mount, queue: s.queue.slice(1), t: 0, epoch: s.epoch };
        }
        return { ...s, t: nt };
      });
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [playing]);

  const jumpTo = (mount: Mount) =>
    setState((s) => ({ current: mount, queue: [], t: 0, epoch: s.epoch + 1 }));
  const enqueue = (element: Element, from: Mount) =>
    setState((s) => ({
      ...s,
      queue: [...s.queue, { mount: applyElement(element, from), hint: element.motion(from) }],
    }));
  const runDemo = () => {
    const trapeze = mountById("trapeze");
    const passR = passElement({ side: "R", digit: "index" });
    const passL = passElement({ side: "L", digit: "index" });
    const midSwing = applyElement(passR, trapeze);
    setState((s) => ({
      current: trapeze,
      queue: [
        { mount: midSwing, hint: passR.motion(trapeze) },
        { mount: applyElement(passL, midSwing), hint: passL.motion(midSwing) },
      ],
      t: 0,
      epoch: s.epoch + 1,
    }));
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
            onClick={() => enqueue(element, tail)}
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
        <label className="physics">
          <input type="checkbox" checked={physics} onChange={(e) => setPhysics(e.target.checked)} />{" "}
          physics
        </label>
        <span className="now">
          {displayName(current)}
          {target ? ` → ${displayName(target.mount)}` : ""}
          {queue.length > 1 ? ` (+${queue.length - 1} queued)` : ""}
        </span>
      </header>
      <main>
        <Scene
          mount={current}
          target={target?.mount}
          hint={target?.hint}
          t={t}
          physics={physics}
          epoch={state.epoch}
          preset={preset}
        />
      </main>
    </div>
  );
}
