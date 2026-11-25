import { expect, skirmish, test } from "./game";

test.describe.configure({ timeout: 240_000 });

test("the inventory: dragging things about, and letting go outside", async ({ game, page }) => {
  await skirmish(game, page, ["Town", "Tactical"]);
  await page.keyboard.press("i");
  const win = page.locator(".inv-window");
  await expect(win).toBeVisible();
  const state = () => page.evaluate(() => {
    const b = (window as unknown as { __skirmish: { b: { units: { name: string; tu: number; gear: { weapon?: string; stowed: { item: string; in: string; x: number; y: number }[] } }[]; floor: unknown[] } } }).__skirmish.b;
    const u = b.units.find((x) => x.name === document.querySelector(".inv-head span")!.textContent)!;
    return JSON.parse(JSON.stringify({ tu: u.tu, weapon: u.gear.weapon ?? null, stowed: u.gear.stowed, floor: b.floor.length }));
  });
  const centre = async (sel: string) => { const r = (await page.locator(sel).first().boundingBox())!; return [r.x + r.width / 2, r.y + r.height / 2] as const; };
  const drag = async (from: string, to: readonly [number, number]) => {
    const [x, y] = await centre(from);
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(...to, { steps: 8 });
  };
  const start = await state();
  // A plain click moves nothing and costs nothing.
  await page.mouse.click(...(await centre("[data-drop=pocket0] .inv-item")));
  expect(await state()).toEqual(start);
  // Pocket to ground: the pocket's cost and the ground's, as the item says on the way.
  await drag("[data-drop=pocket0] .inv-item", await centre("[data-drop=floor]"));
  await expect(page.locator(".inv-cursor-note")).toHaveText("9 TU");
  await page.mouse.up();
  let now = await state();
  expect([now.tu, now.floor, now.stowed.length]).toEqual([start.tu - 9, start.floor + 1, start.stowed.length - 1]);
  // And back, into the pack's far corner.
  const pack = (await page.locator("[data-drop=pack]").boundingBox())!;
  await drag("[data-drop=floor] .inv-item", [pack.x + pack.width - 10, pack.y + pack.height - 30]);
  await page.mouse.up();
  now = await state();
  expect(now.floor).toBe(start.floor);
  const there = now.stowed.at(-1);
  expect([there.in, there.x]).toEqual(["pack", 3]);
  // Let go outside the window, or Esc: nothing moves, and the window stays.
  await drag("[data-drop=pack] .inv-item", [20, 450]);
  await page.mouse.up();
  await expect(win).toBeVisible();
  await drag("[data-drop=weapon] .inv-item", await centre("[data-drop=floor]"));
  await page.keyboard.press("Escape");
  await page.mouse.up();
  await expect(win).toBeVisible();
  expect(await state()).toEqual(now);
  // Armour stays on.
  await drag("[data-drop=armour] .inv-item", await centre("[data-drop=floor]"));
  await expect(page.locator(".inv-cursor")).toHaveCount(0);
  await page.mouse.up();
  // Equal margins.
  const m = await page.evaluate(() => {
    const w = document.querySelector(".inv-window")!.getBoundingClientRect(), k = [...document.querySelectorAll(".inv-sheet, .inv-col, .inv-bottom, .inv-menu")].map((e) => e.getBoundingClientRect());
    return { left: Math.min(...k.map((r) => r.left)) - w.left, right: w.right - Math.max(...k.map((r) => r.right)) };
  });
  expect(Math.abs(m.left - m.right)).toBeLessThanOrEqual(2);
  if (process.env.SHOT) await page.screenshot({ path: process.env.SHOT });
  // A press on the dark outside closes it.
  await page.mouse.click(20, 450);
  await expect(win).toHaveCount(0);
});

test("the base's equip window: from the armoury to the pack and back", async ({ game, page }) => {
  await game.load("rich");
  await game.clearEvents();
  await page.evaluate("{ const s = window.vamps.getState(); s.openBase(s.game.installations.find((i) => i.kind === 'base').id) }");
  await page.evaluate("{ const s = window.vamps.getState(), a = s.game.agents.find((x) => x.baseId === s.overlay.baseId); a.gear = { stowed: [] }; s.openBase(a.baseId, 'personnel', a.id); window.vamps.setState({ rev: s.rev + 1 }) }");
  await page.locator(".detail").getByRole("button", { name: /Equip|Inventory|gear/i }).first().click();
  const carried = () => page.evaluate("(() => { const s = window.vamps.getState(); return s.game.agents.find((x) => x.id === s.overlay.item).gear.stowed.length })()");
  const stock = (await page.locator(".inv-stock").first().boundingBox())!, pack = (await page.locator("[data-drop=pack]").boundingBox())!;
  await page.mouse.move(stock.x + 20, stock.y + 8);
  await page.mouse.down();
  await page.mouse.move(pack.x + 68, pack.y + 85, { steps: 8 });
  await page.mouse.up();
  expect(await carried()).toBe(1);
  const item = (await page.locator("[data-drop=pack] .inv-item").boundingBox())!, armoury = (await page.locator("[data-drop=armoury]").boundingBox())!;
  await page.mouse.move(item.x + 10, item.y + 10);
  await page.mouse.down();
  await page.mouse.move(armoury.x + 40, armoury.y + 40, { steps: 8 });
  await page.mouse.up();
  expect(await carried()).toBe(0);
  if (process.env.SHOT2) await page.screenshot({ path: process.env.SHOT2 });
});
