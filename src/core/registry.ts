import { mountHash } from "./canonical.js";
import type { Mount, NameEntry, NameRegistry } from "./schema.js";

/**
 * Name lookups over a registry. Names are annotations on canonical hashes;
 * they never participate in mount identity.
 */

export function entryForHash(registry: NameRegistry, hash: string): NameEntry | undefined {
  return registry.find((e) => e.mountHash === hash);
}

export function namesFor(registry: NameRegistry, mount: Mount): string[] {
  return entryForHash(registry, mountHash(mount))?.names ?? [];
}

/** Primary display name, or undefined for an unnamed (newly discovered) mount. */
export function primaryNameFor(registry: NameRegistry, mount: Mount): string | undefined {
  return namesFor(registry, mount)[0];
}
