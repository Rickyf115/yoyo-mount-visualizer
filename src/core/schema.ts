import { z } from "zod";

/**
 * Core topological schema for the String Trick Engine.
 *
 * A mount is an ordered traversal of the string through a set of anchors,
 * annotated with crossing information. Geometry is derived later (Session 2);
 * nothing in this module knows about 3D coordinates.
 *
 * Traversal convention:
 * - `contacts` lists the string's contact events in order, walking the string
 *   from the player end to the yo-yo end.
 * - The first contact is always the slipknot loop on the throwhand
 *   (kind `loop`); the last is always the winding around the axle
 *   (kind `axle`). Each appears exactly once.
 * - A `gap` contact marks a point where the string passes through the yo-yo's
 *   gap and rides over the axle — i.e. the yo-yo is resting ("mounted") on
 *   the string at that point in the traversal.
 * - Segment i is the span of string between contacts[i] and contacts[i+1].
 *   Crossings reference segments by index.
 */

export const AnchorKind = z.enum(["finger", "thumb", "axle", "gap", "loop"]);
export type AnchorKind = z.infer<typeof AnchorKind>;

export const Side = z.enum(["L", "R"]);
export type Side = z.infer<typeof Side>;

/** Anchor kinds that belong to a hand and therefore require a side. */
const HAND_KINDS: ReadonlySet<AnchorKind> = new Set(["finger", "thumb", "loop"]);

export const Anchor = z
  .object({
    /** Fixture-local identifier, e.g. "nth-index". Not part of mount identity. */
    id: z.string().min(1),
    kind: AnchorKind,
    /** Required for hand anchors (finger/thumb/loop); forbidden for axle/gap. */
    side: Side.optional(),
  })
  .strict()
  .superRefine((anchor, ctx) => {
    if (HAND_KINDS.has(anchor.kind) && anchor.side === undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `anchor "${anchor.id}" of kind "${anchor.kind}" requires a side`,
        path: ["side"],
      });
    }
    if (!HAND_KINDS.has(anchor.kind) && anchor.side !== undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `anchor "${anchor.id}" of kind "${anchor.kind}" must not have a side`,
        path: ["side"],
      });
    }
  });
export type Anchor = z.infer<typeof Anchor>;

export const Wrap = z.enum(["over", "under"]);
export type Wrap = z.infer<typeof Wrap>;

export const Direction = z.enum(["cw", "ccw"]);
export type Direction = z.infer<typeof Direction>;

export const ContactEvent = z
  .object({
    /** References an Anchor.id declared on the same mount. */
    anchor: z.string().min(1),
    wrap: Wrap,
    direction: Direction,
  })
  .strict();
export type ContactEvent = z.infer<typeof ContactEvent>;

/**
 * Segment `over` passes over segment `under`.
 * Segment indices refer to spans between consecutive contacts.
 */
export const Crossing = z
  .object({
    over: z.number().int().nonnegative(),
    under: z.number().int().nonnegative(),
  })
  .strict()
  .refine((c) => c.over !== c.under, {
    message: "a segment cannot cross itself",
  });
export type Crossing = z.infer<typeof Crossing>;

export const Mount = z
  .object({
    /** Fixture-local identifier. Not part of mount identity. */
    id: z.string().min(1),
    /** Optional human label for fixture readability. Authoritative naming lives in the name registry. */
    name: z.string().min(1).optional(),
    anchors: z.array(Anchor).min(2),
    contacts: z.array(ContactEvent).min(2),
    crossings: z.array(Crossing),
  })
  .strict()
  .superRefine((mount, ctx) => {
    // Unique anchor ids.
    const anchorById = new Map<string, Anchor>();
    mount.anchors.forEach((anchor, i) => {
      if (anchorById.has(anchor.id)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `duplicate anchor id "${anchor.id}"`,
          path: ["anchors", i, "id"],
        });
      }
      anchorById.set(anchor.id, anchor);
    });

    // Every contact references a declared anchor.
    const usedAnchorIds = new Set<string>();
    mount.contacts.forEach((contact, i) => {
      if (!anchorById.has(contact.anchor)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `contact references undeclared anchor "${contact.anchor}"`,
          path: ["contacts", i, "anchor"],
        });
      }
      usedAnchorIds.add(contact.anchor);
    });

    // Every declared anchor is contacted at least once.
    mount.anchors.forEach((anchor, i) => {
      if (!usedAnchorIds.has(anchor.id)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `anchor "${anchor.id}" is declared but never contacted`,
          path: ["anchors", i],
        });
      }
    });

    // Traversal endpoints: starts at the loop, ends at the axle, and the
    // terminal anchors appear nowhere else in the traversal.
    const kindAt = (i: number): AnchorKind | undefined =>
      anchorById.get(mount.contacts[i]!.anchor)?.kind;
    const first = kindAt(0);
    const last = kindAt(mount.contacts.length - 1);
    if (first !== undefined && first !== "loop") {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `traversal must start at the throwhand loop (got kind "${first}")`,
        path: ["contacts", 0],
      });
    }
    if (last !== undefined && last !== "axle") {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `traversal must end at the axle (got kind "${last}")`,
        path: ["contacts", mount.contacts.length - 1],
      });
    }
    mount.contacts.forEach((_, i) => {
      const kind = kindAt(i);
      if (kind === "loop" && i !== 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "the loop may only appear as the first contact",
          path: ["contacts", i],
        });
      }
      if (kind === "axle" && i !== mount.contacts.length - 1) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "the axle may only appear as the last contact",
          path: ["contacts", i],
        });
      }
    });

    // Crossings reference valid segments and don't contradict each other.
    const segmentCount = mount.contacts.length - 1;
    const seenPairs = new Set<string>();
    mount.crossings.forEach((crossing, i) => {
      for (const key of ["over", "under"] as const) {
        if (crossing[key] >= segmentCount) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: `crossing ${key} segment ${crossing[key]} out of range (mount has ${segmentCount} segments)`,
            path: ["crossings", i, key],
          });
        }
      }
      const pair = [crossing.over, crossing.under].sort((a, b) => a - b).join("/");
      if (seenPairs.has(pair)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `duplicate or contradictory crossing for segment pair ${pair}`,
          path: ["crossings", i],
        });
      }
      seenPairs.add(pair);
    });
  });
export type Mount = z.infer<typeof Mount>;

/** Reference to a mount by its fixture-local id. (The database, Session 6, keys by canonical hash instead.) */
export const MountRef = z.string().min(1);
export type MountRef = z.infer<typeof MountRef>;

/** Reference to an element by name. Elements arrive in Session 3. */
export const ElementRef = z.string().min(1);
export type ElementRef = z.infer<typeof ElementRef>;

/**
 * One hop in a trick. An explicit `element` pins the route exactly
 * (identity-bearing); omitting it means "any legal element that maps here".
 */
export const Step = z
  .object({
    element: ElementRef.optional(),
    to: MountRef,
  })
  .strict();
export type Step = z.infer<typeof Step>;

export const Trick = z
  .object({
    name: z.string().min(1),
    start: MountRef,
    steps: z.array(Step).min(1),
    /** Free-form provenance/accuracy notes for hand-authored fixtures. */
    notes: z.string().optional(),
  })
  .strict();
export type Trick = z.infer<typeof Trick>;

const SHA256_HEX = /^[0-9a-f]{64}$/;

/**
 * Naming is decoupled from identity: a mount is identified by its canonical
 * hash and may carry zero, one, or many names.
 */
export const NameEntry = z
  .object({
    mountHash: z.string().regex(SHA256_HEX, "mountHash must be a sha256 hex digest"),
    names: z.array(z.string().min(1)).min(1),
    generated: z.boolean(),
  })
  .strict()
  .refine((e) => new Set(e.names).size === e.names.length, {
    message: "names within an entry must be unique",
    path: ["names"],
  });
export type NameEntry = z.infer<typeof NameEntry>;

export const NameRegistry = z.array(NameEntry).superRefine((entries, ctx) => {
  const seen = new Set<string>();
  entries.forEach((entry, i) => {
    if (seen.has(entry.mountHash)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `duplicate registry entry for mount hash ${entry.mountHash}`,
        path: [i, "mountHash"],
      });
    }
    seen.add(entry.mountHash);
  });
});
export type NameRegistry = z.infer<typeof NameRegistry>;
