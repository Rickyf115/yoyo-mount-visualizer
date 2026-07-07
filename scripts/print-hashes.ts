/**
 * Prints the canonical hash of every mount fixture, as name-registry JSON.
 * Use when authoring new fixtures or after a deliberate canonicalization
 * change: `pnpm hashes`.
 */
import { loadMountFixtures, mountHash } from "../src/core/index.js";

const entries = [...loadMountFixtures().values()].map((mount) => ({
  mountHash: mountHash(mount),
  names: [mount.name ?? mount.id],
  generated: false,
}));

console.log(JSON.stringify(entries, null, 2));
