# Agent instructions — String Trick Engine

Read [ROADMAP.md](./ROADMAP.md) before doing anything. This project is built one roadmap session per working session: one milestone, one PR-sized change, tests green at the end. Update the **Current state** section below when you finish a session.

## Current state

- **Session 1 (core schema & canonical mounts): DONE.** Zod schemas, canonicalization + sha256 identity, 10 staple mount fixtures (incl. houdini and front mount), name registry with the brother/undermount alias, Cascade trick skeleton, 55 tests green. Identity includes finger digits and spin (front vs side) per owner direction; throws are graph entry points, not mount properties.
- **Scope assumption: 1A only** — single unresponsive yo-yo, string on the throwhand. Other styles are logged in `IDEAS.md`, not modeled.
- **Next up: Session 2 (static visualizer).** Vite + react-three-fiber app, first-pass `Layout(Mount, Rig) -> ControlPoint[]`, three camera presets, fixture dropdown.

## Commands

- `pnpm test` — vitest suite. Must be green before every commit.
- `pnpm typecheck` — strict tsc, no emit.
- `pnpm hashes` — print canonical hashes of all mount fixtures (as name-registry JSON).

## Conventions

- TypeScript ESM everywhere; imports use `.js` extensions (`import ... from "./schema.js"`). Strict tsconfig with `exactOptionalPropertyTypes` and `noUncheckedIndexedAccess` — keep it that way.
- Modules by concern: `src/core/` (done), later `src/viz/`, `src/sim/`, `src/search/`. Fixtures live in `data/`, dev utilities in `scripts/`, tests in `test/`.
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
