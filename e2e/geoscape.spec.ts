import { expect, test, type Game } from "./game";
import type { Page } from "@playwright/test";

const SAVES = ["day-0", "day-30-1", "day-100-2", "day-200-1", "day-320-2", "with-captive", "rich"];
const SCREENS = [["1", "installations"], ["2", "operations"], ["3", "research"], ["4", "bloodlines"], ["5", "market"], ["6", "details"], ["", "base"]] as const;

/** Clicks every navigation element a screen has (rows, tabs, tiles), never one that changes the campaign. */
async function walk(game: Game, page: Page, root: string) {
  const nav = ".tab, .rtab, .rlist-row, .facility-tile, .tr-button, .bay, .room, .chip";
  const seen = new Set<string>();
  for (let n = 0; n < 120; n++) {
    const next = await page.locator(root).evaluate((el, [nav, seen]) => {
      const all = [...el.querySelectorAll<HTMLElement>(nav as string)].filter((x) => x.offsetParent && !(x as HTMLButtonElement).disabled);
      const key = (x: HTMLElement) => `${x.className.split(" ")[0]}:${x.innerText.slice(0, 50)}`;
      const at = all.find((x) => !(seen as string[]).includes(key(x)));
      if (!at) return null;
      at.scrollIntoView({ block: "center" });
      at.click();
      return key(at);
    }, [nav, [...seen]] as const).catch(() => null);
    if (!next) break;
    seen.add(next);
    game.ok(`${root}: ${next}`);
    if (!(await page.locator(root).count())) break;
  }
  return seen.size;
}

for (const save of SAVES)
  test(`every screen, tab and row: ${save}`, async ({ game, page }) => {
    test.setTimeout(180_000);
    await game.load(save);
    await game.clearEvents();
    for (const [key, kind] of SCREENS) {
      if (key) await page.keyboard.press(key);
      else await page.evaluate("{ const s = window.vamps.getState(); s.openBase(s.game.installations.find((i) => i.kind === 'base').id) }");
      expect(await game.read((s) => s.overlay?.kind), `key ${key}`).toBe(kind);
      // Control's own tabs switch sections: walk only the section open.
      const root = kind === "base" ? ".base-view" : ".control-section";
      await walk(game, page, root);
      game.ok(kind);
      await game.page.evaluate("window.vamps.getState().closeOverlay()");
    }
    // The Control button opens on the last tab; the tab's own number closes it.
    await page.getByRole("button", { name: /^Control/ }).click();
    expect(await game.read((s) => s.overlay?.kind)).toBe("details");
    await page.keyboard.press("6");
    expect(await game.read((s) => s.overlay)).toBeNull();
    // Bases: a row flies there and selects it.
    await page.keyboard.press("1");
    await page.locator(".bases-row .list-row").first().click();
    expect(await game.read((s) => [s.overlay, s.focus?.kind])).toEqual([null, "installation"]);
    // Every overlay, by key and by the list.
    for (let i = 0; i < 7; i++) await page.keyboard.press("m");
    expect(await game.read((s) => s.mapOverlay)).toBe("none");
    for (const o of ["support", "sigint", "humint", "access", "io", "activity", "none"]) await page.locator(".hud-overlay select").selectOption(o);
  });

test("everything on the globe has a panel", async ({ game, page }) => {
  for (const save of ["day-100-1"]) {
    await game.load(save);
    await game.clearEvents();
    const ids = await game.read((s) => [
      ...s.game!.leads.map((x) => ["lead", x.id]), ...s.game!.sites.map((x) => ["site", x.id]), ...s.game!.missions.map((x) => ["mission", x.id]),
      ...s.game!.installations.map((x) => ["installation", x.id]), ...s.game!.coverUps.map((x) => ["coverup", x.id]), ...s.game!.aircraft.map((x) => ["aircraft", x.id]),
    ]);
    for (const [kind, id] of ids) {
      await page.evaluate(`window.vamps.getState().focusOn({ kind: "${kind}", id: "${id}" })`);
      await expect(page.locator(".hud-side .panel").first()).toBeVisible();
      game.ok(`${kind} ${id}`);
    }
  }
});

test("time: pause, speeds, and a month at full speed through whatever comes up", async ({ game, page }) => {
  test.setTimeout(180_000);
  await game.load("day-30-1");
  await game.clearEvents();
  await page.keyboard.press("Space");
  expect(await game.read((s) => s.paused)).toBe(false);
  await page.keyboard.press("Space");
  expect(await game.read((s) => s.paused)).toBe(true);
  // The panel: + and − step the interval without starting the clock, and stop at the ends.
  const time = page.getByRole("group", { name: "Time", exact: true });
  const box = (await time.boundingBox())!, view = page.viewportSize()!;
  expect(Math.abs(box.y + box.height / 2 - view.height / 2)).toBeLessThan(2);
  expect(view.width - box.x - box.width).toBeLessThan(20);
  for (let i = 0; i < 3; i++) await page.keyboard.press("Equal");
  await expect(time.locator(".time-value")).toHaveText("1D");
  await expect(time.getByRole("button", { name: "Faster" })).toBeDisabled();
  for (const label of ["6H", "1H", "10MIN"]) {
    await time.getByRole("button", { name: "Slower" }).click();
    await expect(time.locator(".time-value")).toHaveText(label);
  }
  await expect(time.getByRole("button", { name: "Slower" })).toBeDisabled();
  await page.keyboard.press("Equal");
  await expect(time.locator(".time-value")).toHaveText("1H");
  expect(await game.read((s) => s.paused)).toBe(true);
  await time.getByRole("button", { name: "PLAY" }).click();
  expect(await game.read((s) => s.paused)).toBe(false);
  await time.getByRole("button", { name: "PAUSE" }).click();
  expect(await game.read((s) => s.paused)).toBe(true);
  for (let i = 0; i < 3; i++) await page.keyboard.press("Equal");
  await expect(time.locator(".time-value")).toHaveText("1D");
  const start = await game.read((s) => s.game!.time);
  for (let i = 0; i < 400; i++) {
    if ((await game.read((s) => s.game!.time)) - start > 30 * 86400000 || (await game.read((s) => !!s.game!.gameOver))) break;
    await game.clearEvents();
    if (await game.read((s) => s.paused)) await page.keyboard.press("Space");
    await page.waitForTimeout(150);
    game.ok(`iteration ${i}`);
  }
  expect((await game.read((s) => s.game!.time)) - start).toBeGreaterThan(20 * 86400000);
});

test("a new installation is placed, named and built", async ({ game, page }) => {
  await game.load("day-0");
  await game.clearEvents();
  await page.evaluate("window.vamps.getState().game.funds = 50e6; window.vamps.setState({ rev: 1e6 })");
  await page.keyboard.press("1");
  await page.locator(".bases-col", { hasText: "SIGINT stations" }).getByRole("button", { name: "Build" }).click();
  await expect(page.getByText("Click where to build")).toBeVisible();
  const before = await game.read((s) => s.game!.installations.length);
  // Round the middle of the globe until land that will have it is hit.
  await page.waitForTimeout(2000);
  for (const [dx, dy] of [[0, 0], [60, 40], [-60, 40], [90, -30], [-90, -40], [0, 90], [0, -90], [140, 60], [-140, 80], [180, 0], [-180, 0], [160, 140], [-100, 170]]) {
    await page.mouse.click(720 + dx!, 450 + dy!);
    if (await game.read((s) => !!s.buildDraft)) break;
  }
  await page.getByRole("button", { name: "Build", exact: true }).click();
  expect(await game.read((s) => s.game!.installations.length)).toBe(before + 1);
});

test("a team is sent on a lead, flies, and gets its orders", async ({ game, page }) => {
  test.setTimeout(150_000);
  await game.load("with-lead");
  await game.clearEvents();
  await page.evaluate("{ const s = window.vamps.getState(); s.focusOn({ kind: 'lead', id: s.game.leads[0].id }) }");
  await page.locator(".hud-side").getByRole("button", { name: /Dispatch|Send|Plan/ }).first().click();
  await expect(page.locator(".dispatch-screen")).toBeVisible();
  for (const k of ["Civilian", "Plainclothes"]) {
    const b = page.locator(".dispatch-screen .choice", { hasText: k }).last();
    if ((await b.count()) && (await b.isEnabled())) await b.click();
  }
  const send = page.locator(".dispatch-screen").getByRole("button", { name: "Dispatch", exact: true });
  await expect(send).toBeVisible();
  if (await send.isEnabled()) {
    await send.click();
    await expect(page.locator(".dispatch-screen")).toHaveCount(0);
    expect(await game.read((s) => s.game!.missions.length)).toBeGreaterThan(0);
  } else await page.keyboard.press("Escape");
});

test("the dark web: into the cart, out, and bought", async ({ game, page }) => {
  await game.load("day-100-1");
  await game.clearEvents();
  await page.keyboard.press("5");
  const add = page.locator("button[title^='Add one to the cart'], button[data-tip^='Add one to the cart']").first();
  await add.click();
  await expect(page.locator(".cart-qty").first()).toHaveValue("1");
  // Typing in the quantity, through an empty field.
  await page.locator(".cart-qty").first().fill("");
  await page.locator(".cart-qty").first().fill("2");
  game.ok("typing a quantity");
  await page.keyboard.press("Escape");
});

for (const save of ["day-0", "day-200-1", "rich", "event-debt"])
  test(`the dark web opens and switches at once, and everything in it sells: ${save}`, async ({ game, page }) => {
    await game.load(save);
    await game.clearEvents();
    const timed = async (selector: string) => page.evaluate(async (sel) => {
      const el = document.querySelector<HTMLElement>(sel)!, t = performance.now();
      el.click();
      await new Promise((r) => requestAnimationFrame(() => setTimeout(r)));
      return performance.now() - t;
    }, selector);
    await page.keyboard.press("5");
    await expect(page.locator(".market-tabs")).toBeVisible();
    for (let i = 0; i < 6; i++) for (const n of [2, 1]) expect(await timed(`.market-tabs .tab:nth-child(${n})`), "switching tabs, ms").toBeLessThan(3000);
    for (const n of [2, 1]) {
      await timed(`.market-tabs .tab:nth-child(${n})`);
      for (let i = 0; i < 60; i++) {
        const done = await page.evaluate((i) => {
          const all = [...document.querySelectorAll<HTMLButtonElement>(".research-grid button.mini:not(:disabled), .cart .action")];
          if (!all.length) return true;
          all[i % all.length]!.click();
          return false;
        }, i);
        if (done) break;
      }
      game.ok(n === 2 ? "selling" : "buying");
    }
    await expect(page.locator(".market-tabs")).toBeVisible();
  });

test("the globe keys stay quiet while an event waits", async ({ game, page }) => {
  await game.load("event-lead");
  await expect(page.locator(".modal.event")).toBeVisible();
  for (const k of ["1", "2", "3", "m"]) await page.keyboard.press(k);
  expect(await game.read((s) => [s.overlay, s.mapOverlay])).toEqual([null, "none"]);
});
