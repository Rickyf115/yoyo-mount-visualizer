import { describe, expect, it } from "vitest";
import {
  IllegalElementError,
  Mount,
  STANDARD_ELEMENTS,
  THROWS,
  applyElement,
  dismountElement,
  hopElement,
  legalElements,
  loadMountFixtures,
  mountElement,
  mountHash,
  passElement,
} from "../src/core/index.js";

const fixtures = loadMountFixtures();
const fx = (id: string) => fixtures.get(id)!;

describe("throw entries", () => {
  it("a front throw enters the front-spin half as the dead string", () => {
    expect(mountHash(THROWS.front.result())).toBe(mountHash(fx("dead-string")));
  });

  it("a breakaway enters the side-spin half — same traversal, different mount", () => {
    const side = THROWS.breakaway.result();
    expect(side.spin).toBe("side");
    expect(mountHash(side)).not.toBe(mountHash(fx("dead-string")));
  });
});

describe("mount element", () => {
  it("maps the breakaway dead string to the trapeze", () => {
    expect(mountHash(applyElement(mountElement, THROWS.breakaway.result()))).toBe(
      mountHash(fx("trapeze")),
    );
  });

  it("maps the front-throw dead string to the front mount (one element, both graph halves)", () => {
    expect(mountHash(applyElement(mountElement, THROWS.front.result()))).toBe(
      mountHash(fx("front-mount")),
    );
  });

  it("is illegal on anything but a bare string", () => {
    expect(mountElement.precondition(fx("trapeze"))).toMatch(/bare string/);
  });
});

describe("pass element", () => {
  it("two passes take a trapeze to double or nothing", () => {
    const midSwing = applyElement(passElement({ side: "R", digit: "index" }), fx("trapeze"));
    const don = applyElement(passElement({ side: "L", digit: "index" }), midSwing);
    expect(mountHash(don)).toBe(mountHash(fx("double-or-nothing")));
  });

  it("passing over the throwhand thumb instead lands the houdini mount", () => {
    const midSwing = applyElement(passElement({ side: "R", thumb: true }), fx("trapeze"));
    const houdini = applyElement(passElement({ side: "L", digit: "index" }), midSwing);
    expect(mountHash(houdini)).toBe(mountHash(fx("houdini")));
  });

  it("requires the yo-yo mounted on the string", () => {
    expect(passElement({ side: "R", digit: "index" }).precondition(fx("dead-string"))).toMatch(
      /mounted/,
    );
  });
});

describe("hop element", () => {
  it("hops the trapeze yo-yo over the non-throwhand index", () => {
    const hopped = applyElement(hopElement, fx("trapeze"));
    const expected = Mount.parse({
      id: "expected",
      spin: "side",
      anchors: fx("trapeze").anchors,
      contacts: [
        { anchor: "th-loop", wrap: "over", direction: "cw" },
        { anchor: "nth-index", wrap: "over", direction: "ccw" },
        { anchor: "yoyo-gap", wrap: "over", direction: "ccw" },
        { anchor: "axle", wrap: "over", direction: "cw" },
      ],
      crossings: [],
    });
    expect(mountHash(hopped)).toBe(mountHash(expected));
  });

  it("is illegal when the yo-yo is already on the last strand (gap abuts the axle)", () => {
    expect(hopElement.precondition(fx("brother"))).toMatch(/last strand/);
  });

  it("is illegal on an unmounted string", () => {
    expect(hopElement.precondition(fx("dead-string"))).toMatch(/mounted/);
  });
});

describe("dismount element", () => {
  it("drops a trapeze back to the breakaway dead string", () => {
    expect(mountHash(applyElement(dismountElement, fx("trapeze")))).toBe(
      mountHash(THROWS.breakaway.result()),
    );
  });

  it("drops double or nothing all the way to a bare string too", () => {
    expect(mountHash(applyElement(dismountElement, fx("double-or-nothing")))).toBe(
      mountHash(THROWS.breakaway.result()),
    );
  });

  it("requires a mounted yo-yo", () => {
    expect(dismountElement.precondition(fx("dead-string"))).toMatch(/mounted/);
  });
});

describe("element mechanics", () => {
  it("applyElement throws IllegalElementError with the reason", () => {
    expect(() => applyElement(dismountElement, fx("dead-string"))).toThrow(IllegalElementError);
    expect(() => applyElement(dismountElement, fx("dead-string"))).toThrow(/mounted/);
  });

  it("elements never change spin (only future regens cross the halves)", () => {
    for (const fixture of fixtures.values()) {
      for (const element of legalElements(STANDARD_ELEMENTS, fixture)) {
        expect(applyElement(element, fixture).spin).toBe(fixture.spin);
      }
    }
  });

  it("every element result is schema-valid for every fixture it applies to", () => {
    for (const fixture of fixtures.values()) {
      for (const element of legalElements(STANDARD_ELEMENTS, fixture)) {
        expect(Mount.safeParse(applyElement(element, fixture)).success).toBe(true);
      }
    }
  });

  it("legalElements on a dead string offers exactly the mount", () => {
    expect(legalElements(STANDARD_ELEMENTS, fx("dead-string")).map((e) => e.name)).toEqual([
      "mount",
    ]);
  });

  it("legalElements on a trapeze offers hop, dismount, and both passes", () => {
    expect(legalElements(STANDARD_ELEMENTS, fx("trapeze")).map((e) => e.name)).toEqual([
      "hop",
      "dismount",
      "pass-R-index",
      "pass-L-index",
    ]);
  });
});
