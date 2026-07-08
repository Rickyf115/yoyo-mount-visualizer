# Agent instructions — String Trick Engine

Read [ROADMAP.md](./ROADMAP.md) before doing anything. This project is built one roadmap session per working session: one milestone, one PR-sized change, tests green at the end. Update the **Current state** section below when you finish a session.

## Current state

- **Session 1 (core schema & canonical mounts): DONE.** Zod schemas, canonicalization + sha256 identity, 10 staple mount fixtures (incl. houdini and front mount), name registry with the brother/undermount alias, Cascade trick skeleton, 55 tests green. Identity includes finger digits and spin (front vs side) per owner direction; throws are graph entry points, not mount properties.
- **Scope assumption: 1A only** — single unresponsive yo-yo, string on the throwhand. Other styles are logged in `IDEAS.md`, not modeled.
- **Session 2 (static visualizer): DONE.** Vite + react-three-fiber app (`pnpm dev`): stylized hands, yo-yo, Catmull-Rom string tube through control points from the first-pass `layoutMount(Mount, Rig)` in `src/viz/layout.ts` (pure + unit tested); per-spin default rigs in `src/viz/rig.ts` (player at origin facing +z/audience); camera presets audience/player/side plus free orbit; fixture dropdown with traversal breadcrumb. 63 tests green.
- **Session 3 (transitions & timeline): DONE.** `Element` abstraction in `src/core/elements.ts` (browser-safe): precondition returns reason-or-null, `applyElement` validates results via schema; elements mount/hop/dismount + parameterized `passElement`; `THROWS` entry points (front → front half, breakaway → side half); element results hash-checked against fixtures (mount∘breakaway ≡ trapeze, pass∘pass ≡ double or nothing, thumb pass ≡ houdini). `mountHash` moved to node-only `src/core/hash.ts` so `canonical.ts` is browser-safe; the app names element-produced mounts by `canonicalSerialize`. Timeline UI: throw/element buttons (legal-only), queued transitions, play/pause + scrubber, string morph via resampled-spline point lerp. 84 tests green.
- **Session 4 realism rework (post-review): DONE.** Constant string length via `fitLayout` (hands slide along the spread axis to fit wrap-heavy mounts, surplus drops the yo-yo, floor guard raises hands; rope rest length set once, never retargeted); hands glide between per-mount fits during transitions (`lerpRig`, hand-delta-aware pins); wraps form by collision — only LCS-common contacts stay pinned during a swing, new pins engage at PIN_BEAT 0.82; burst timeline (`src/viz/timeline.ts`) eases across whole queued runs so chained transitions never stop midway; app opens on a breakaway dead string and the demo runs breakaway → mount → pass → pass. `scripts/measure-fit.ts` prints per-fixture fit diagnostics. 112 tests green.
- **Session 4 (swing motion & string physics): DONE.** Elements carry `motion(mount)` hints (pivot anchor + sweep over/shortest); `src/viz/motion.ts` turns them into yo-yo arc paths (one rule: "over" forces the arc across the pivot apex, full 2π loop when start ≈ end) and computes rope pins from layouts (entry/apex/exit per wrap, gap/axle pins ride the yo-yo). `src/sim/rope.ts` is a pure fixed-timestep Verlet rope (120 particles, distance constraints, capsule collision with fingers, deterministic for tests); hand pins switch topology at the halfway beat, the solver carries the string across. Physics checkbox in the UI falls back to the Session 3 point-lerp morph. Shared tuple vector math in `src/viz/vec.ts`. 100 tests green.
- **Next up: Session 5 (element library & authoring)** — rolls, underpasses, string hits, at least one slack element (parallel edges!); difficulty weights; authoring/debug view (pick mount → legal elements → click → watch).

## Commands

- `pnpm dev` — mount visualizer (Vite dev server); `pnpm build` / `pnpm preview` for production.
- `pnpm test` — vitest suite. Must be green before every commit.
- `pnpm typecheck` — strict tsc, no emit.
- `pnpm hashes` — print canonical hashes of all mount fixtures (as name-registry JSON).

## Conventions

- TypeScript ESM everywhere; imports use `.js` extensions (`import ... from "./schema.js"`). Strict tsconfig with `exactOptionalPropertyTypes` and `noUncheckedIndexedAccess` — keep it that way.
- Modules by concern: `src/core/`, `src/viz/`, `src/sim/` (done), later `src/search/`. Fixtures live in `data/`, dev utilities in `scripts/`, tests in `test/`. `src/sim/rope.ts` stays pure and deterministic (fixed timestep, no three.js) so it remains unit-testable.
- Browser code must not import node-only modules: `src/core/fixtures.ts` (fs) and `src/core/hash.ts` (node:crypto) stay server/test-side; `canonical.ts` and `elements.ts` are browser-safe. The app loads fixtures via Vite glob imports in `src/viz/mounts.ts` and compares mounts by `canonicalSerialize`, never hash. Keep `layoutMount` pure (no three.js/React imports) so it stays unit-testable.
- Zod schemas are the source of truth for types (`type X = z.infer<typeof X>`); topological well-formedness is enforced in `superRefine`, not in downstream code.

## Data model invariants (do not break silently)

- A mount's `contacts` walk the string from the throwhand `loop` (always first) to the `axle` winding (always last); a `gap` contact = the yo-yo resting on the string at that point. Segment `i` spans `contacts[i]` → `contacts[i+1]`.
- **Identity = `mountHash` (sha256 of the canonical serialization).** Canonicalization erases mount id/name and anchor ids (renamed `kind:side:digit:n` by first appearance along the traversal), sorts crossings, and preserves spin, traversal order, wrap, direction, digit, and sidedness. Names live only in `data/names.json`.
- `spin` (`front | side`) is identity-bearing (spin gates transitions; side-spin trapeze = trapeze, front-spin twin = front mount) and splits the graph in two. **Throws are graph entry points, not mount properties**: front throw enters the front half, breakaway the side half (entry edges land with elements, Session 3/7); regeneration elements later reconnect the halves. Until regens exist a trick keeps one spin throughout (fixture-tested).
- Fingers carry an identity-bearing `digit` (double or nothing ≠ houdini).
- `data/names.json` stores real hashes and tests recompute them — it is the hash-stability regression pin. If you change canonicalization *deliberately*, regenerate with `pnpm hashes` and update the registry in the same commit; if it changed *accidentally*, that test failure is telling you to fix your code.
- Trick steps: `element` present = route pinned (identity-bearing); absent = "any legal element". Both forms must stay supported.

## Rules

- **Fixtures are sacred:** never edit a fixture to make a test pass — fix the engine. (Correcting a fixture's *yo-yo accuracy* — e.g. which strand the yo-yo rests on in double or nothing, flagged provisional in the README — is legitimate, and takes a matching `data/names.json` hash update.)
- Tests are the contract between sessions; leave everything green.
- Log out-of-scope ideas in `IDEAS.md` instead of expanding the session.
- Defer visual polish; topology correctness is the product.
