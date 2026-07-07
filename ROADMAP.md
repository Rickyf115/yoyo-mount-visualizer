# String Trick Engine — Project Roadmap

A system for modeling yo-yo string mounts, visualizing them in 3D, animating transitions, and ultimately discovering new tricks via pathfinding over a mount graph. Built to be developed incrementally with coding agents, one milestone per session.

## Core architectural principle

**Topology first, geometry second.** A mount is not a set of 3D coordinates — it is an ordered traversal of the string through a set of anchors (fingers, thumbs, yo-yo axle/gap), annotated with crossing information (which segment passes over/under which, and wrap direction). The 3D layout is *derived* from this topological description plus a hand/body rig.

This matters because:

- Two mounts are "the same" if they are topologically equivalent, regardless of how the hands are posed. Canonical topological representation gives you deduplication for free.
- Transitions ("elements") become discrete, enumerable operations on the topology (pass a segment over a finger, hop the yo-yo to another string, dismount, roll). This is what makes pathfinding tractable — the state space is finite and graph search works.
- Known tricks become test fixtures: a trick is a path (sequence of elements) through mount space, and the engine can verify each step produces the expected next mount.

## Technology stack

| Concern | Choice | Rationale |
|---|---|---|
| Language | TypeScript everywhere | One language across core model, viz, sim, and search; agents work the full stack without switching |
| Schema & validation | Zod | Runtime validation of mount/trick JSON, inferred TS types, great error messages for hand-authored data |
| 3D rendering | Three.js via react-three-fiber, bundled with Vite | Mature, well-documented (good for agents), declarative scene graph, easy camera preset switching |
| String rendering (phase 1) | Catmull-Rom spline through derived control points → TubeGeometry | No physics needed for static mounts; looks clean immediately |
| String physics (phase 2) | Custom Verlet / XPBD rope, pinned to contact points | Position-based rope is ~200 lines, stable, and standard practice; heavyweight engines (Rapier, cannon-es) are poor fits for constrained string |
| Animation | Keyframe interpolation over rig poses + topology change events; timeline scrubber in UI | Transitions are (start mount, element, end mount) with tweened rig motion |
| Persistence | JSON fixture files → SQLite via better-sqlite3 | Fixtures until the model stabilizes; SQLite when the trick database and search results need real queries |
| Path engine | Bounded DFS enumeration over the multigraph, cycles allowed | Goal is discovering *all* valid paths (candidate tricks) up to a depth limit, not shortest routes; repeaters require cycle support |
| Testing | Vitest | Known tricks as regression fixtures; every session ends green |
| Repo layout | Single package, modules: `core/`, `viz/`, `sim/`, `search/`, `data/` | Monorepo tooling is overhead you don't need yet |

## Data model sketch

```
Anchor      = { id, kind: finger | thumb | axle | gap | loop, side: L | R }
Segment     = span of string between two consecutive contact events
ContactEvent= { anchor, wrap: over | under, direction: cw | ccw }
Mount       = { id, name, contacts: ContactEvent[], crossings: Crossing[] }   // topological
Rig         = hand/arm positions + yo-yo position                             // geometric
Layout(Mount, Rig) -> ControlPoint[]                                          // derivation
Element     = named operation: Mount -> Mount (with legality preconditions)
              // future (Session 9): + entry/exit momentum profiles, scored pairwise along a path
Step        = { element?: ElementRef, to: MountRef }                          // element optional = "any legal route"
Trick       = { name, start: MountRef, steps: Step[] }                       // alternating mounts and edges
NameEntry   = { mountHash, names: string[], generated: boolean }              // naming is separate from identity
```

Key consequences:

- **The mount space is a directed multigraph.** Multiple distinct elements can connect the same pair of mounts (or even the same mount to itself), and the element used is part of a trick's identity — a slack to kamikaze is a different trick from reaching kamikaze via 1.5 mount → submount → underpass, and would remain different even if the mount endpoints coincided. A path is therefore the full alternating sequence of nodes *and* labeled edges, not just the node sequence.
- **Trick entry supports both levels of precision.** A step with an explicit element pins that hop exactly (identity-bearing). A step with no element means "any legal element that maps here" — cheap entry for tricks like Cascade that are naturally described as pure mount sequences, with the engine inferring a connector. Both forms live in the same schema.
- **A mount's identity is its canonical topological form (hash), never its name.** Names live in a separate registry: a mount can have zero names (newly discovered), multiple names (aliases like brother / undermount), or a generated name. Generated names are derived from structure (string wraps, involved fingers) or fall back to a short hash, flagged `generated: true` so a human can rename later.

The `Layout` function is the bridge between the topological world (search, database, equivalence) and the geometric world (rendering, animation, physics).

## Session plan

Each session is scoped so an agent can complete it end to end: clear deliverable, tests passing, something demoable. Keep a `CLAUDE.md` (or equivalent agent instructions file) at the repo root summarizing conventions, the data model, and the current session's goal — update it at the end of every session.

### Session 1 — Core schema and canonical mounts
Define the Zod schema for anchors, contact events, mounts, tricks, and the name registry. Implement canonicalization (two topologically identical mounts serialize identically) and equality via canonical hash. Hand-author fixtures covering the Cascade path plus staples: dead string (baseline), trapeze, brother, double or nothing, double brother, triple or nothing, split bottom mount, 1.5 mount. Include an alias case (brother / undermount) to prove naming is decoupled from identity. Unit tests cover validation, canonical equality, hash stability, and round-trip serialization.

**Done when:** `pnpm test` green; fixtures load and canonicalize; a README section documents the schema with one worked example.

### Session 2 — Static visualizer
Vite + react-three-fiber app. Simple rig: two stylized hands (spheres/capsules per finger are fine), a yo-yo (two discs + axle), and the string rendered as a spline tube through control points produced by a first-pass `Layout` function. Camera presets: audience (front), player (behind/first-person), side profile — hot-switchable buttons plus free orbit. Dropdown to select any fixture mount.

**Done when:** all five fixture mounts render legibly from all three presets, and string over/under crossings are visually correct.

### Session 3 — Transitions and timeline
Define the `Element` abstraction with preconditions (e.g., "hop" requires the yo-yo on a string segment; "dismount" requires a mount, not dead string). Implement 3–4 elements: mount (throw into trapeze), hop, pass, dismount. Animate a transition by interpolating rig keyframes while the topology switches at a defined beat. UI gets play/pause and a scrubber.

**Done when:** trapeze → double or nothing plays as a smooth animation, and each element's precondition logic is unit tested.

### Session 4 — String realism (optional but satisfying)
Replace the static spline with a Verlet/XPBD rope: fixed-length constraint chain, pinned at contact points, gravity, a few solver iterations per frame, simple collision against finger/axle cylinders. The topology still dictates *where* the string is pinned; physics just makes it hang and swing naturally during transitions.

**Done when:** static mounts show natural sag; transitions from Session 3 replay with the rope active and no explosions at 60fps.

### Session 5 — Element library and authoring
Broaden the element set: rolls, underpasses, string hits, and at least one slack element — slacks matter early because they create parallel edges (alternative entries into the same mount) that the pathfinder must distinguish; laceration-style catches can wait. Each element carries a difficulty weight — not for pathfinding cost, but as a filter/sort signal when browsing enumerated paths later. Add a small authoring/debug view: pick a current mount, see which elements are legal, click one, watch the result. This doubles as manual validation of the transition system and becomes your primary tool for encoding real tricks.

**Done when:** at least 8–10 elements exist with tests, and a known 3–4 step trick can be assembled interactively.

### Session 6 — Trick database
Introduce SQLite (better-sqlite3). Tables: mounts (keyed by canonical hash), mount_names, elements, tricks, trick_steps (ordered, with nullable element_id — null means "engine may infer"). Import all fixtures. Enter 5–10 real tricks: Cascade as the flagship pure-mount-sequence fixture, plus at least one pair of tricks that share endpoints but differ in route/element (e.g., slack to kamikaze vs. 1.5 mount → submount → underpass into kamikaze) to prove element-level identity is preserved. Integrity test: for every step, either the pinned element legally maps mount N to mount N+1, or (if unpinned) at least one legal element does.

**Done when:** the integrity test passes for every stored trick, and the two kamikaze-entry tricks are stored and retrieved as distinct.

### Session 7 — Path enumeration over the mount multigraph
Build the graph: nodes are canonical mounts, edges are *labeled* legal element applications (generated by applying every element to every known mount, adding newly discovered mounts as nodes). Because it's a multigraph, keep every distinct element edge between the same mount pair — do not collapse parallel edges. The engine's job is **enumeration, not optimization**: given a start mount (and optionally an end mount), produce *every* valid labeled path up to a depth limit. Cycles and mount revisits must be allowed — repeaters and roll loops are legitimate tricks, and a shortest-path algorithm would structurally exclude them. Implement as bounded DFS with the depth limit as the only hard cutoff; expose filters (must-visit mounts, must-use/exclude elements, max slack count, endpoint constraints) so the result set is browsable rather than a firehose. Validation: for each stored trick, its exact labeled path must appear in the enumeration at that trick's depth with matching constraints.

**Done when:** validation passes, and a query like "start at trapeze, depth ≤ 5, end anywhere" streams enumerated paths into a browsable list, each renderable as an animation.

### Session 8 — Discovery and curation
Session 7 produces the raw path space; this session makes it useful. Diff the enumeration against the database to surface what's *new*, at both levels: (a) mounts not yet catalogued, and (b) novel routes — unrecorded edge-labeled paths between known mounts, since a new way into a known mount (a slack entry where only an underpass route was recorded) is itself a new trick. Scoring here is curation, not optimization: signals like element difficulty, symmetry, repetition structure, and novelty are sort/filter axes for browsing candidates, with one-click playback, save-as-trick, and discard. Every newly discovered mount gets persisted under its canonical hash with an auto-generated name (structure-derived where possible, short-hash fallback, `generated: true`), so the graph grows a browsable, renamable catalog of unnamed mounts as a side effect of search. Add pruning (depth limits, dead-end detection, canonical dedup) as the graph grows.

**Done when:** the system proposes at least a few plausible novel transitions or short tricks that a player can evaluate, each viewable as an animation.

### Session 9 (future) — Momentum and flow
Momentum lives on edge *pairs*, not edges: each element gains an entry and exit momentum profile (small tag vocabulary to start — swing direction front/back/lateral, pendulum phase, spin), and a compatibility function scores how well step N's exit flows into step N+1's entry. This makes path evaluation stateful — the walker's effective state is (mount, incoming momentum), i.e., search over the line graph — but it layers onto the Session 7 enumerator without changing path validity: flow-coherence is a new curation axis in Session 8 (sort by flow, filter to momentum-coherent paths, or apply as an optional hard pruning constraint for tighter enumeration). Seed the compatibility table by annotating the stored fixture tricks, which are presumably flow-coherent by construction since humans invented them; incoherent-but-valid paths the enumerator finds are then either discoveries or evidence the tags need refining. Later refinements can graduate tags to continuous values (swing amplitude, timing windows) if the discrete model proves too coarse.

**Done when:** enumerated paths carry a flow score, sorting Cascade-style fixtures above deliberately jarring synthetic paths, and a momentum-coherence filter in the browser demonstrably changes the result set.

## Working-with-agents notes

- One session, one milestone, one PR-sized change. Resist scope creep mid-session; log ideas in `IDEAS.md` instead.
- Tests are the contract between sessions. An agent starting Session N should be able to trust everything Session N−1 left green.
- The fixture tricks are sacred: never edit a fixture to make a test pass — fix the engine.
- Defer visual polish. The rig can look like a crash-test dummy until Session 8; topology correctness is the product.
