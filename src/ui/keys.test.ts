import { describe, expect, it } from "vitest";
import { actionFor, bindingsOf, DEFAULT_KEYS, rebind, resetScope, scopeChanged } from "./keys";

describe("key bindings", () => {
  it("each screen has its own keys: R is research on the globe, level up in battle", () => {
    const k = bindingsOf({});
    expect(actionFor(k, "KeyR", "geo")).toBe("geoResearch");
    expect(actionFor(k, "KeyR", "battle")).toBe("levelUp");
  });

  it("taking a key in use swaps the two, on that screen only", () => {
    const k = rebind(bindingsOf({}), "geoResearch", "KeyI");
    expect(k.geoResearch).toBe("KeyI");
    expect(k.geoInstallations).toBe("KeyR");
    expect(k.inventory).toBe("KeyI"); // battle untouched
  });

  it("defaults come back one screen at a time", () => {
    let k = rebind(bindingsOf({}), "geoMarket", "KeyP");
    k = rebind(k, "shoot", "KeyY");
    const geoReset = bindingsOf(resetScope(k, "geo"));
    expect(geoReset.geoMarket).toBe(DEFAULT_KEYS.geoMarket);
    expect(geoReset.shoot).toBe("KeyY");
    expect(scopeChanged(geoReset, "geo")).toBe(false);
    expect(scopeChanged(geoReset, "battle")).toBe(true);
  });
});
