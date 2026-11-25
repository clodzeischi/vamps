import { describe, expect, it } from "vitest";
import { actionFor, bindingsOf, DEFAULT_KEYS, rebind, resetScope, scopeChanged } from "./keys";

describe("key bindings", () => {
  it("each screen has its own keys: 3 is Research on the globe, the third operative in battle", () => {
    const k = bindingsOf({});
    expect(actionFor(k, "Digit3", "geo")).toBe("geoTab3");
    expect(actionFor(k, "Digit3", "battle")).toBe("agent3");
  });

  it("taking a key in use swaps the two, on that screen only", () => {
    const k = rebind(bindingsOf({}), "geoTab3", "Digit1");
    expect(k.geoTab3).toBe("Digit1");
    expect(k.geoTab1).toBe("Digit3");
    expect(k.agent1).toBe("Digit1"); // battle untouched
  });

  it("keys saved for retired actions are dropped", () => {
    const k = bindingsOf({ geoSpeed1: "Digit9" } as never);
    expect("geoSpeed1" in k).toBe(false);
  });

  it("defaults come back one screen at a time", () => {
    let k = rebind(bindingsOf({}), "geoTab6", "KeyP");
    k = rebind(k, "shoot", "KeyY");
    const geoReset = bindingsOf(resetScope(k, "geo"));
    expect(geoReset.geoTab6).toBe(DEFAULT_KEYS.geoTab6);
    expect(geoReset.shoot).toBe("KeyY");
    expect(scopeChanged(geoReset, "geo")).toBe(false);
    expect(scopeChanged(geoReset, "battle")).toBe(true);
  });
});
