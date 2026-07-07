import type { Mount } from "../src/core/index.js";

/** A minimal valid trapeze used as a base for schema/canonical tests. */
export function makeTrapeze(overrides: Partial<Mount> = {}): Mount {
  return {
    id: "test-trapeze",
    name: "trapeze",
    anchors: [
      { id: "th-loop", kind: "loop", side: "R" },
      { id: "yoyo-gap", kind: "gap" },
      { id: "nth-index", kind: "finger", side: "L" },
      { id: "axle", kind: "axle" },
    ],
    contacts: [
      { anchor: "th-loop", wrap: "over", direction: "cw" },
      { anchor: "yoyo-gap", wrap: "over", direction: "ccw" },
      { anchor: "nth-index", wrap: "over", direction: "ccw" },
      { anchor: "axle", wrap: "over", direction: "cw" },
    ],
    crossings: [],
    ...overrides,
  };
}
