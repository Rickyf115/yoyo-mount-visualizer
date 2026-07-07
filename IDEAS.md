# Ideas parking lot

Out-of-scope ideas logged here instead of expanding a session (see CLAUDE.md rules).

- **More play styles.** The engine currently assumes 1A (single unresponsive yo-yo, string attached to the throwhand). Future: 5A (counterweight — the loop end becomes a free mass, so `loop` stops being a fixed anchor), 3A (two yo-yos/two loops), 2A/looping (responsive, mounts barely apply), 4A/offstring (no axle winding — the terminal `axle` contact assumption breaks). Each style likely means relaxing a traversal invariant, so gate them behind a `style` field when the time comes.
- **Mirror equivalence.** Canonicalization preserves sidedness, so a left-handed player's trapeze hashes differently. A `mirrorHash` (canonicalize after swapping L/R and flipping direction/throw) would let search dedupe mirror twins without collapsing them.
- **Loop position.** The throwhand slipknot is assumed on the middle finger and carries no digit. If tricks that re-seat the loop matter, give `loop` an optional digit.
- **Where the string end sits.** Some mounts are distinguished by how much tail hangs between the last wrap and the axle (e.g. wrist mounts with big loops). If topology alone under-distinguishes, consider annotating segment slack classes.
