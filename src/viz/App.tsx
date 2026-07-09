import { useEffect, useState } from "react";
import {
  STANDARD_ELEMENTS,
  THROWS,
  applyElement,
  mountElement,
  passElement,
  rollElement,
  type Element,
} from "../core/elements.js";
import type { Mount } from "../core/schema.js";
import { MOUNTS, displayName, fixtureTwin, mountById } from "./mounts.js";
import { Scene, type CameraPresetName } from "./Scene.js";
import { extendBurst, frameAt, type BurstStep, type Timeline } from "./timeline.js";

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
  timeline: Timeline;
  /** Bumped on hard jumps (dropdown/throw) so the rope reseeds. */
  epoch: number;
}

/** Tricks start from a throw: the app opens on a breakaway dead string. */
const INITIAL: PlayerState = {
  timeline: { base: THROWS.breakaway.result(), burst: [], raw: 0 },
  epoch: 0,
};

const step = (element: Element, from: Mount): BurstStep => ({
  mount: applyElement(element, from),
  hint: element.motion(from),
});

export function App() {
  const [state, setState] = useState<PlayerState>(INITIAL);
  const [playing, setPlaying] = useState(true);
  const [physics, setPhysics] = useState(true);
  const [preset, setPreset] = useState<CameraPresetName>("audience");

  const { timeline, epoch } = state;
  const frame = frameAt(timeline);
  // The mount the *next* enqueued element applies to (chaining while playing).
  const tail = timeline.burst[timeline.burst.length - 1]?.mount ?? timeline.base;
  // Once past the beat, the traversal readout switches to the incoming topology.
  const shown = frame.target && frame.t >= 0.5 ? frame.target.mount : frame.current;

  useEffect(() => {
    if (!playing) return;
    let raf: number;
    let last = performance.now();
    const tick = (now: number) => {
      const dt = (now - last) / 1000;
      last = now;
      setState((s) => {
        const n = s.timeline.burst.length;
        if (n === 0) return s;
        const raw = s.timeline.raw + dt / (n * TRANSITION_SECONDS);
        if (raw >= 1) {
          const final = s.timeline.burst[n - 1]!.mount;
          return { ...s, timeline: { base: final, burst: [], raw: 0 } };
        }
        return { ...s, timeline: { ...s.timeline, raw } };
      });
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing]);

  const jumpTo = (mount: Mount) =>
    setState((s) => ({ timeline: { base: mount, burst: [], raw: 0 }, epoch: s.epoch + 1 }));
  const enqueue = (element: Element) =>
    setState((s) => {
      const from = s.timeline.burst[s.timeline.burst.length - 1]?.mount ?? s.timeline.base;
      return { ...s, timeline: extendBurst(s.timeline, [step(element, from)]) };
    });
  const runDemo = (build: (base: Mount) => BurstStep[]) => () => {
    const base = THROWS.breakaway.result();
    setState((s) => ({
      timeline: { base, burst: build(base), raw: 0 },
      epoch: s.epoch + 1,
    }));
    setPlaying(true);
  };
  // The full trick from the throw: breakaway → mount → pass → pass.
  const donDemo = runDemo((base) => {
    const s1 = step(mountElement, base);
    const s2 = step(passElement({ side: "R", digit: "index" }), s1.mount);
    const s3 = step(passElement({ side: "L", digit: "index" }), s2.mount);
    return [s1, s2, s3];
  });
  // A repeater: self-edges in the multigraph, played as three swings.
  const rollDemo = runDemo((base) => {
    const s1 = step(mountElement, base);
    const roll = () => step(rollElement, s1.mount);
    return [s1, roll(), roll(), roll()];
  });

  return (
    <div className="app">
      <header>
        <h1>String Trick Engine</h1>
        <label>
          Mount{" "}
          <select
            value={fixtureTwin(frame.current)?.id ?? ""}
            onChange={(e) => jumpTo(mountById(e.target.value))}
          >
            {fixtureTwin(frame.current) === undefined && <option value="" />}
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
        <span className="group-label">demo</span>
        <button onClick={donDemo}>breakaway → double or nothing</button>
        <button onClick={rollDemo}>trapeze rolls ×3</button>
        <span className="group-label">timeline</span>
        <button onClick={() => setPlaying((p) => !p)} disabled={!frame.target}>
          {playing ? "⏸" : "▶"}
        </button>
        <input
          type="range"
          min={0}
          max={1}
          step={0.001}
          value={timeline.raw}
          disabled={!frame.target}
          onChange={(e) => {
            setPlaying(false);
            setState((s) => ({ ...s, timeline: { ...s.timeline, raw: Number(e.target.value) } }));
          }}
        />
        <label className="physics">
          <input type="checkbox" checked={physics} onChange={(e) => setPhysics(e.target.checked)} />{" "}
          physics
        </label>
        <span className="now">
          {displayName(frame.current)}
          {frame.target ? ` → ${displayName(frame.target.mount)}` : ""}
          {timeline.burst.length > 1
            ? ` (burst of ${timeline.burst.length})`
            : ""}
        </span>
      </header>
      <div className="body">
        <aside className="elements" aria-label="element library">
          <h2>Elements</h2>
          {STANDARD_ELEMENTS.map((element) => {
            const reason = element.precondition(tail);
            return (
              <div key={element.name} className={reason ? "element illegal" : "element"}>
                <button
                  disabled={reason !== null}
                  title={element.description}
                  onClick={() => enqueue(element)}
                >
                  <span className="element-name">{element.name}</span>
                  <span className="difficulty" aria-label={`difficulty ${element.difficulty}`}>
                    {"●".repeat(element.difficulty)}
                  </span>
                </button>
                <small>{reason ?? element.description}</small>
              </div>
            );
          })}
        </aside>
        <main>
          <Scene
            mount={frame.current}
            target={frame.target?.mount}
            hint={frame.target?.hint}
            t={frame.t}
            physics={physics}
            epoch={epoch}
            preset={preset}
          />
        </main>
      </div>
    </div>
  );
}
