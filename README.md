# yoyo-mount-visualizer

String Trick Engine: model yo-yo string mounts topologically, visualize them in 3D, animate transitions, and eventually discover new tricks via pathfinding over the mount graph. See [ROADMAP.md](./ROADMAP.md) for the full plan; this repo is built one session at a time.

**Status:** Session 2 complete — core schema + canonical mounts (Session 1) and the static 3D visualizer.

**Scope assumption:** everything models **1A** — a single unresponsive yo-yo with the string attached to the throwhand. Other styles (5A counterweight, 3A, 4A offstring, responsive 2A) are future work; see `IDEAS.md`.

```sh
pnpm install
pnpm dev         # mount visualizer (Vite dev server)
pnpm test        # vitest suite
pnpm typecheck   # tsc --noEmit
pnpm hashes      # print canonical hashes of all mount fixtures
```

## The visualizer

`pnpm dev` serves a react-three-fiber scene that renders any fixture mount: stylized hands, a yo-yo, and the string as a Catmull-Rom tube through control points derived by the first-pass `Layout` function ([`src/viz/layout.ts`](./src/viz/layout.ts)). Camera presets — **audience** (front), **player** (behind), **side** — are hot-switchable, with free orbit always on.

The geometry side lives in [`src/viz/rig.ts`](./src/viz/rig.ts): the player stands at the origin facing +z (the audience), and each spin has a default rig — side spin spreads the hands left/right with the string plane facing the audience; front spin reaches the non-throwhand forward with the string plane running toward the audience. `layoutMount(mount, rig)` walks the contact traversal: hand anchors take fingertip positions from the rig, over/under wraps offset the string above/below the fingertip, repeated wraps on one anchor stack along the plane normal, and the yo-yo rests on the segment at its `gap` contact (or dangles at the string's end without one). Pure heuristics, no physics — that's Session 4.

## The schema

**Topology first, geometry second.** A mount is not 3D coordinates — it is an ordered traversal of the string through a set of *anchors*, annotated with crossing information. Geometry is derived later from the topology plus a hand rig (Session 2).

All types are Zod schemas in [`src/core/schema.ts`](./src/core/schema.ts); parsing validates structure *and* topological well-formedness.

### Traversal convention

- The string is walked from the **player end** to the **yo-yo end**: the first contact is always the slipknot loop on the throwhand (kind `loop`), the last is always the string's winding around the axle (kind `axle`). Each appears exactly once.
- A `gap` contact means the string passes through the yo-yo's gap and rides over the axle at that point — i.e. the yo-yo is *mounted* on that part of the string. The string's own final approach into the gap to reach its axle winding is **not** recorded as a gap contact; it is implicit in the terminal `axle` contact.
- `finger`/`thumb` contacts are wraps. `wrap: over | under` says which side of the anchor the string passes; `direction: cw | ccw` records the wrap sense. Canonicalization treats both as opaque labels — their precise geometric meaning gets pinned down by the `Layout` function in Session 2.
- Every `finger` anchor carries a `digit` (`index | middle | ring | pinky`); the thumb is its own anchor kind. **Which digit matters**: a double or nothing (throwhand index) and a houdini mount (throwhand thumb) are different mounts because transitions can require a specific finger.
- Every mount records its `spin` (`front | side`) — the plane the yo-yo is spinning in, relative to the player. Spin governs which transitions are legal (rolls follow the spin), so the same string traversal with different spin is a different mount: a side-spin trapeze *is* the trapeze, while the identical traversal with front spin is just a front mount (both are fixtures). **Throws are not mount properties** — a front throw and a breakaway are *entry points* into the graph, landing you in the front-spin or side-spin half. Spin therefore splits the mount graph in two; regeneration elements can later reconnect the halves, and until then every trick keeps a single spin throughout.
- **Segment `i`** is the span of string between `contacts[i]` and `contacts[i+1]`. Crossings reference segments by index: `{ over, under }` means segment `over` passes over segment `under`.
- Fixtures are authored for a right-handed player: throwhand side `R`, non-throwhand side `L`.

### Worked example: trapeze

The yo-yo hangs on the string strand that runs from the throwhand up to the non-throwhand index finger; the rest of the string continues over that finger and back down to the axle.

```json
{
  "id": "trapeze",
  "name": "trapeze",
  "spin": "side",
  "anchors": [
    { "id": "th-loop", "kind": "loop", "side": "R" },
    { "id": "yoyo-gap", "kind": "gap" },
    { "id": "nth-index", "kind": "finger", "side": "L", "digit": "index" },
    { "id": "axle", "kind": "axle" }
  ],
  "contacts": [
    { "anchor": "th-loop", "wrap": "over", "direction": "cw" },
    { "anchor": "yoyo-gap", "wrap": "over", "direction": "ccw" },
    { "anchor": "nth-index", "wrap": "over", "direction": "ccw" },
    { "anchor": "axle", "wrap": "over", "direction": "cw" }
  ],
  "crossings": []
}
```

Read the contacts in order: string starts at the throwhand loop → the yo-yo rests on this strand (gap) → strand continues over the non-throwhand index finger → down to the axle winding. Compare [`data/mounts/double-or-nothing.json`](./data/mounts/double-or-nothing.json), which is the same traversal with two extra finger wraps — and note that the same anchor may be contacted multiple times (that's what a wrap is).

### Identity: canonicalization and hashing

A mount's identity is its **canonical topological form**, never its name or its fixture id ([`src/core/canonical.ts`](./src/core/canonical.ts)).

`canonicalize(mount)` erases everything that is labeling rather than topology:

- `id` and `name` are dropped.
- Anchor ids and declaration order are erased: anchors are renamed `kind:side:digit:n` in order of first appearance along the traversal (`-` stands in for absent side/digit).
- Crossings are sorted.

It preserves the spin (front vs side), the ordered traversal (contact order, wrap, direction), which digit carries each wrap, and sidedness (a left-handed player's trapeze is a different mount; mirror-equivalence can be layered on later if wanted).

`canonicalSerialize` renders that form as deterministic JSON (sorted keys), and `mountHash` is its sha256 — so *two topologically identical mounts serialize identically*, and equality, deduplication, and (later) database identity are hash comparisons.

### Naming is decoupled from identity

The name registry ([`data/names.json`](./data/names.json), schema `NameEntry`) maps canonical hashes to names. A mount can have zero names (newly discovered), several (the fixtures include the `brother` / `undermount` alias pair), or an auto-generated one (`generated: true`). Renaming never changes identity.

The registry fixture stores real hashes and the test suite recomputes them from the mount fixtures, so it doubles as the hash-stability regression pin. If canonicalization ever changes *deliberately*, regenerate with `pnpm hashes` and update `data/names.json` in the same commit.

### Tricks

A trick is a path through mount space: `{ name, start, steps }`, where each step is `{ element?, to }`. An explicit `element` pins the route exactly (identity-bearing — a slack into kamikaze is a different trick from an underpass into kamikaze even between the same mounts); omitting it means "any legal element that maps here". Elements arrive in Session 3; until then the Cascade fixture ([`data/tricks/cascade.json`](./data/tricks/cascade.json)) exercises the pure-mount-sequence form.

### Fixture accuracy note

The ten staple mounts (dead string, trapeze, front mount, brother, 1.5, double or nothing, double brother, triple or nothing, split bottom, houdini) are hand-authored first passes. Exact strand assignments (which segment the yo-yo rests on in double or nothing, wrap directions) are provisional until Session 2's visualizer makes them inspectable — corrections are data+hash updates, never engine edits to make tests pass.

## Repo layout

```
src/core/     schema, canonicalization, name registry, fixture loading
src/viz/      rig + Layout (pure, tested) and the react-three-fiber app
data/mounts/  one JSON fixture per mount
data/tricks/  trick fixtures (mount paths)
data/names.json  name registry keyed by canonical hash
test/         vitest suites: validation, canonical equality, hash stability, fixtures, layout
scripts/      dev utilities (print-hashes)
```

`sim/` and `search/` modules arrive in later sessions. Browser code must not import node-only modules (`src/core/fixtures.ts` reads the filesystem, `src/core/canonical.ts` uses `node:crypto`); the app loads fixtures via Vite glob imports in `src/viz/mounts.ts` instead.
