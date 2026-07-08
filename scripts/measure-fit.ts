// Ad-hoc fit diagnostics (dev utility): pnpm tsx scripts/measure-fit.ts
import { loadMountFixtures } from "../src/core/index.js";
import { STRING_LENGTH, fitLayout, layoutLength } from "../src/viz/layout.js";
import { spreadAxis } from "../src/viz/rig.js";
import { dot } from "../src/viz/vec.js";

const mounts = loadMountFixtures();
console.log("target", STRING_LENGTH);
for (const m of mounts.values()) {
  const f = fitLayout(m, m.spin);
  const axis = spreadAxis(f.rig);
  const sep = Math.abs(dot(f.rig.hands.R.palm, axis) - dot(f.rig.hands.L.palm, axis));
  const arcs = f.layout.contactArcs.reduce((s, run) => {
    let l = 0;
    for (let i = 1; i < run.length; i++) {
      l += Math.hypot(
        run[i]![0] - run[i - 1]![0],
        run[i]![1] - run[i - 1]![1],
        run[i]![2] - run[i - 1]![2],
      );
    }
    return s + l;
  }, 0);
  console.log(
    m.id.padEnd(20),
    "spread",
    f.spread.toFixed(2),
    "handSep",
    sep.toFixed(3),
    "len",
    layoutLength(f.layout).toFixed(3),
    "arcLen",
    arcs.toFixed(3),
    "yoyoY",
    f.layout.yoyo.center[1].toFixed(2),
  );
}
