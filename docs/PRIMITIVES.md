# Primitive movement animator — rework plan

## Why

Transitions have been a kinematic script (arcs, pin schedules, beats) fighting a
dynamic simulation (the rope). Every reported artifact — slack-looking morphs,
mid-trick stalls, wraps popping over/under fingers, string snagging the hand,
backwards swings — came from heuristics refereeing that fight. The rework
inverts the architecture:

**Each edge is a specific primitive movement.** The movement is the first-class
thing, with its own bespoke deterministic animation. A mount is *where a
sequence of movements leaves you*. Topology schemas, canonical hashes, and the
mount graph are **tabled** — they stay in `src/core/` with tests green, and
re-attach to this architecture later (each primitive maps to a topology
operation; a mount schema becomes the recipe's postcondition).

## Scope reductions (deliberate)

- **Two working fingers**: the index and middle finger (per hand). The rest of
  the hand stays in the model and renders, but the string never interacts with
  it yet. (The slipknot loop lives on the throwhand middle finger; the index
  fingers do the catching.)
- **Side spin first** (breakaway family). Front spin follows once the
  primitives are proven.
- **No emergent physics during movement.** The rope keeps exactly two jobs:
  sag/settle on *static* states, and (later) a light lag blend layered on the
  deterministic shape. It can never fight the animator.

## Core model: `StringState`

One constant-length string described by an ordered **attachment list** — what
it touches, walked from the player end to the yo-yo end:

```
Attachment =
  | loopKnot   { finger }                          // slipknot, always first
  | fingerBend { finger, wrapAngle, entrySide }    // continuous 0..2π+ contact
  | gapRest    { }                                 // yo-yo resting on the string here
  | axleEnd    { }                                 // string end, always last
```

The key generalization over the old layout: `wrapAngle` is **continuous**. A
finger just pressing the string is a bend of ~0.2 rad; a full trapeze wrap is
~π; the slipknot coil ~2π. Geometry (spline control points on the fixed length
budget, hands auto-spaced, floor guard) derives from the attachment list — the
existing `fitLayout` machinery survives with wrap arcs parameterized by angle
instead of fixed tangent-to-tangent spans.

A **primitive movement** is a pure, unit-testable function:

```
Primitive: (state: StringState, params) → Anim
Anim:      (t: 0..1) → { string: StringState, yoyo: Pose }
```

Primitives compose by sequencing (the burst timeline survives unchanged).
Because `Anim` is pure, every frame is assertable in tests: length conserved,
wrap angles monotonic, yo-yo on its arc, attachments never teleport.

## The primitive inventory

Built strictly one at a time, each verified visually before the next starts.

| # | Primitive | What it is | Acceptance looks like |
|---|-----------|------------|----------------------|
| P1 | **swing** | Free pendulum of the yo-yo on the string from its current support (hand or finger), through a given arc, correct spin direction | Dead-string yo-yo swings taut, string bows slightly, no stretch |
| P2 | **intercept** | A finger presses into a moving/static string: a `fingerBend` appears at ~0 rad and the effective pivot switches to that finger | String visibly bends around the index mid-swing; nothing wraps yet |
| P3 | **wrap-over** | The swing continues past the finger's apex: the bend's `wrapAngle` grows continuously with the yo-yo's angular progress | The wrap *forms* — you watch the string curl around the finger; never pops |
| P4 | **land** | The yo-yo settles onto a strand: a `gapRest` engages where the yo-yo meets the string | Trapeze emerges from P1+P2+P3+P4 chained |
| P5 | **release** | Inverse of P2/P3: a finger drops out, its wrap unwinds with the swing | Dismount = releases chained with a swing out |
| P6 | **hop** | The yo-yo pops off its strand ballistically and lands (same or adjacent strand) | Visible pop, string momentarily slack under it |
| P7 | **roll** | Mounted full-circle around the supporting finger (P2→P3→P5 cyclically, wrap angle up then back down) | Repeater reads as a smooth loop |
| P8 | **pass / underpass** | The tail (yo-yo end) carried over/under a finger while mounted | Wrap grows on the target finger as the tail crosses it |
| P9 | **slack whip** | String-only movement (no yo-yo swing) forming a wrap | Later; needs string overshoot flourish |

Throws stay entry points: they initialize a `StringState`, they aren't
primitives.

## Delivery order (one primitive chunk per PR)

1. **Foundation + P1**: `src/anim/` module — `StringState`, attachment-list →
   geometry derivation (angle-parameterized wrap arcs on the fixed length
   budget), renderer, and the pendulum swing. App gains a *primitive
   playground* panel (finger pickers: index/middle; direction; play/scrub);
   the mount dropdown and element panel go dormant.
2. **P2 + P3**: intercept and wrap-over on the non-throwhand index — the heart
   of the whole system. Sign-off gate: the trapeze wrap forming correctly.
3. **P4 + P5**: land and release — full trapeze in, full dismount out.
4. **P6 + P7**: hop and roll.
5. **P8**: pass/underpass (double or nothing assembled from primitives).
6. **Re-attach topology**: primitive recipes emit mount schemas as
   postconditions; hashes, the name registry, and the graph return on top of
   the new architecture; the element library becomes named recipes.

## What survives from the current code

- `src/core/` untouched (schemas, canonicalization, elements-as-topology,
  tests) — dormant until step 6.
- `fitLayout`'s budget logic (constant length, hand spacing, floor guard) —
  regeneralized to continuous wrap angles.
- The burst timeline (`src/viz/timeline.ts`) — sequences primitives instead of
  element transitions.
- `src/sim/rope.ts` — static settle + future lag blend only.
- Swing-direction convention: side spin sweeps clockwise as seen from the
  audience (righty breakaway), `SWING_DIRECTION`.
