import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { Mount, NameRegistry, Trick } from "./schema.js";

/** Loads and validates the hand-authored JSON fixtures under data/. */

const DATA_DIR = fileURLToPath(new URL("../../data", import.meta.url));

function readJson(path: string): unknown {
  return JSON.parse(readFileSync(path, "utf8"));
}

export function loadMountFixtures(dir = join(DATA_DIR, "mounts")): Map<string, Mount> {
  const mounts = new Map<string, Mount>();
  for (const file of readdirSync(dir).filter((f) => f.endsWith(".json")).sort()) {
    const mount = Mount.parse(readJson(join(dir, file)));
    if (mounts.has(mount.id)) {
      throw new Error(`duplicate mount fixture id "${mount.id}" in ${file}`);
    }
    mounts.set(mount.id, mount);
  }
  return mounts;
}

export function loadTrickFixtures(dir = join(DATA_DIR, "tricks")): Map<string, Trick> {
  const tricks = new Map<string, Trick>();
  for (const file of readdirSync(dir).filter((f) => f.endsWith(".json")).sort()) {
    const trick = Trick.parse(readJson(join(dir, file)));
    if (tricks.has(trick.name)) {
      throw new Error(`duplicate trick fixture "${trick.name}" in ${file}`);
    }
    tricks.set(trick.name, trick);
  }
  return tricks;
}

export function loadNameRegistry(path = join(DATA_DIR, "names.json")): NameRegistry {
  return NameRegistry.parse(readJson(path));
}
