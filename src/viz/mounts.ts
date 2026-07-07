import { canonicalSerialize } from "../core/canonical.js";
import { Mount } from "../core/schema.js";

/**
 * Browser-side fixture loading. Vite inlines every mount JSON at build time;
 * each one is validated through the schema so a malformed fixture fails
 * loudly on app start, same as in the node loader.
 * (src/core/fixtures.ts is node-only — it reads the filesystem.)
 */

const modules = import.meta.glob("../../data/mounts/*.json", {
  eager: true,
  import: "default",
});

export const MOUNTS: Mount[] = Object.values(modules)
  .map((raw) => Mount.parse(raw))
  .sort((a, b) => (a.name ?? a.id).localeCompare(b.name ?? b.id));

export function mountById(id: string): Mount {
  const mount = MOUNTS.find((m) => m.id === id);
  if (!mount) throw new Error(`unknown mount fixture "${id}"`);
  return mount;
}

/**
 * Topological name lookup, browser-side: element-produced mounts are
 * recognized by canonical serialization (no crypto needed), so applying
 * mount to a breakaway dead string displays as "trapeze".
 */
const NAME_BY_CANONICAL = new Map(MOUNTS.map((m) => [canonicalSerialize(m), m.name ?? m.id]));

export function displayName(mount: Mount): string {
  return NAME_BY_CANONICAL.get(canonicalSerialize(mount)) ?? "unnamed mount";
}

/** The fixture topologically equal to this mount, if any. */
export function fixtureTwin(mount: Mount): Mount | undefined {
  const serial = canonicalSerialize(mount);
  return MOUNTS.find((m) => canonicalSerialize(m) === serial);
}
