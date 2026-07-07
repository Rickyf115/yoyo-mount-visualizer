import { createHash } from "node:crypto";
import { canonicalSerialize } from "./canonical.js";
import type { Mount } from "./schema.js";

/**
 * A mount's identity: sha256 of its canonical serialization. Node-only
 * (node:crypto) — browser code compares `canonicalSerialize` strings instead.
 */
export function mountHash(mount: Mount): string {
  return createHash("sha256").update(canonicalSerialize(mount), "utf8").digest("hex");
}
