import { describe, expect, it } from "vitest";
import { BLOODLINES } from "../../data/bloodlines";
import { LORE, LORE_STEP } from "../../data/lore";
import { newCampaign } from "./campaign";
import { addPage } from "../intel/networks";

describe("bloodline lore", () => {
  it("has an entry every page for every line, the last for the lair", () => {
    for (const b of BLOODLINES) expect(LORE[b.id]!.map((e) => e.at)).toEqual([20, 40, 60, 80, 100].map((x) => (x / 20) * LORE_STEP));
  });

  it("logs each new entry as a raid opens it", () => {
    const s = newCampaign("inquisitor", 1);
    s.log = [];
    addPage(s, "jade");
    addPage(s, "jade");
    const lines = s.log.filter((l) => l.text.startsWith("New in the file on The Jade Court"));
    expect(lines.map((l) => l.text)).toEqual([
      "New in the file on The Jade Court: The eastern road (Bloodlines, B).",
      "New in the file on The Jade Court: The Chancellor of the Jade Court (Bloodlines, B).",
    ]);
  });
});
