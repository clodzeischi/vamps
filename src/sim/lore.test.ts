import { describe, expect, it } from "vitest";
import { BLOODLINES } from "../data/bloodlines";
import { LORE, LORE_STEP, loreKnown } from "../data/lore";
import { newCampaign } from "./campaign";
import { addIntel } from "./state";

describe("bloodline lore", () => {
  it("has an entry every 20 intel for every line", () => {
    for (const b of BLOODLINES) expect(LORE[b.id]!.map((e) => e.at)).toEqual([20, 40, 60, 80, 100].map((x) => (x / 20) * LORE_STEP));
    expect(loreKnown("jade", 45).map((e) => e.at)).toEqual([20, 40]);
  });

  it("logs each new entry as intel crosses it", () => {
    const s = newCampaign("inquisitor", 1);
    s.log = [];
    while ((s.intel.jade ?? 0) < 45) addIntel(s, "jade", 5);
    const lines = s.log.filter((l) => l.text.startsWith("New in the file on The Jade Court"));
    expect(lines.map((l) => l.text)).toEqual([
      "New in the file on The Jade Court: The eastern road (Bloodlines, B).",
      "New in the file on The Jade Court: The Chancellor of the Jade Court (Bloodlines, B).",
    ]);
  });
});
