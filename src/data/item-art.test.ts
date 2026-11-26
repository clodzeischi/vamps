// Every item has its art (docs/design/item-art.md): an inventory icon, and a
// model for the battle view (its own, or the shared one its `model` names).
import { describe, expect, it } from "vitest";
import { ITEMS, ITEM_IDS } from "./equipment";

const names = (files: Record<string, unknown>) =>
  new Set(Object.keys(files).map((p) => p.replace(/^.*\/(.*)\.\w+$/, "$1")));
const icons = names(import.meta.glob("/public/assets/items/icons/*.webp"));
const models = names(import.meta.glob("/public/assets/items/models/*.glb"));

describe("item art", () => {
  it.each(ITEM_IDS)("%s has its icon and its model", (id) => {
    expect(icons.has(id)).toBe(true);
    expect(models.has(ITEMS[id].model ?? id)).toBe(true);
  });
});
