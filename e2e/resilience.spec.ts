// What goes wrong outside the rules: deploys, storage, the graphics card.
import { expect, test } from "./game";
import type { Page } from "@playwright/test";

test("a tab left open across a deploy can still open a battle", async ({ game, page }) => {
  await game.open();
  await page.waitForTimeout(4000); // the battlescape is fetched once the menu is up
  await page.route(/SkirmishScreen.*\.js/, (r) => r.abort());
  await page.getByRole("tab", { name: "Skirmish" }).click();
  await page.getByRole("button", { name: "Deploy" }).click();
  await game.inBattle();
});

test("a battlescape that can't be fetched says so, instead of a blank page", async ({ game, page }) => {
  await page.route(/SkirmishScreen.*\.js/, (r) => r.abort());
  await game.open();
  await page.getByRole("tab", { name: "Skirmish" }).click();
  await page.getByRole("button", { name: "Deploy" }).click();
  await expect(page.getByRole("alert")).toContainText("The game has been updated");
  game.errors.length = 0;
});

test("a screen that throws offers the main menu, and the menu works", async ({ game, page }) => {
  await game.load("day-30-1");
  await game.clearEvents();
  await page.evaluate("{ window.vamps.getState().game.log = null; window.vamps.setState({ rev: 1e9 }) }");
  await expect(page.getByRole("alert")).toContainText("Something broke");
  await page.getByRole("button", { name: "Main menu" }).click();
  await expect(page.getByRole("heading", { name: "VAMPS" })).toBeVisible();
  await game.loadAutosave();
  await expect(page.locator(".geoscape")).toBeVisible();
  game.errors.length = 0;
});

const lost = (page: Page) => page.evaluate(() => [...document.querySelectorAll("canvas")].filter((c) => (c.getContext("webgl2") as WebGL2RenderingContext | null)?.isContextLost()).length);

test("twenty battles in a row keep the globe alive", async ({ game, page }) => {
  test.setTimeout(400_000);
  await game.open();
  for (let i = 0; i < 20; i++) {
    await page.getByRole("tab", { name: "Skirmish" }).click();
    await page.getByRole("button", { name: "Deploy" }).click();
    await game.inBattle();
    await page.getByRole("button", { name: "☰ Menu" }).click();
    await page.getByRole("button", { name: "Quit to Main Menu" }).click();
    expect(await lost(page), `after battle ${i + 1}`).toBe(0);
  }
});

test("settings from an older version don't break a skirmish", async ({ game, page }) => {
  await page.addInitScript(() => localStorage.setItem("vamps.settings.v1", JSON.stringify({ bloom: false, masterVolume: "loud", keys: null, skirmish: { setting: "castle", size: "huge", bloodline: "gone", landmark: "x", kit: "none", arrival: "boat" } })));
  await game.open();
  for (const t of ["Settings", "Skirmish"]) await page.getByRole("tab", { name: t }).click();
  await page.getByRole("button", { name: "Deploy" }).click();
  await game.inBattle();
});

test("without WebGL the player is told", async ({ game, page }) => {
  await page.addInitScript(() => { const g = HTMLCanvasElement.prototype.getContext; HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement, t: string, ...a: unknown[]) { return /webgl/.test(t) ? null : (g as any).call(this, t, ...a); } as any; });
  await page.goto("./");
  await expect(page.getByRole("alert")).toContainText("WebGL");
  game.errors.length = 0;
});

// Nothing a player needs is off the screen, at the smallest size supported and the usual one.
for (const [width, height] of [[1280, 720], [1440, 900], [1920, 1080]] as const)
  test(`everything fits: ${width}x${height}`, async ({ game, page }) => {
    await page.setViewportSize({ width, height });
    const off = () => page.evaluate(() => [...document.querySelectorAll<HTMLElement>(".hud-block, .hud-block button, .base-view-head > *, .modal, .modal-row button, .installations-pop *, .facility-tile, .lead-panel > .action:last-child, .mm-actions button")]
      .filter((e) => e.offsetParent !== null)
      .map((e) => {
        const r = e.getBoundingClientRect(), pop = e.closest(".installations-pop")?.getBoundingClientRect();
        const out = r.left < -1 || r.top < -1 || r.right > innerWidth + 1 || r.bottom > innerHeight + 1;
        const spill = pop && !e.closest(".installations-list") && (r.left < pop.left - 1 || r.right > pop.right + 1);
        return out || spill ? `${e.className || e.tagName} "${(e.innerText ?? "").slice(0, 30)}"` : "";
      }).filter(Boolean));
    await game.open("with-lead");
    for (const t of ["Skirmish", "New"]) { await page.getByRole("tab", { name: t }).click(); expect(await off(), t).toEqual([]); }
    await game.loadAutosave();
    await expect(page.locator(".geoscape")).toBeVisible();
    await game.clearEvents();
    for (const k of ["", "i", "o", "r", "b", "c", "k", "f", "h"]) {
      if (k) await page.keyboard.press(k);
      await page.waitForTimeout(300);
      expect(await off(), `key ${k}`).toEqual([]);
      // Titles and tabs don't run over each other.
      const overlap = await page.evaluate(() => { const k = [...document.querySelectorAll(".base-view-head > *")].map((e) => { const r = document.createRange(); r.selectNodeContents(e); const a = r.getBoundingClientRect(), b = e.getBoundingClientRect(); return { left: a.left, width: a.width, right: getComputedStyle(e).overflow === "hidden" ? Math.min(a.right, b.right) : a.right }; }); return k.some((r, i) => i > 0 && r.left < k[i - 1]!.right - 1 && r.width > 0); });
      expect(overlap, `header ${k}`).toBe(false);
      if (k === "b") {
        await page.getByRole("button", { name: /^Houses/ }).click();
        const [title, tabs] = [(await page.locator(".base-view-head .crumb").boundingBox())!, (await page.locator(".rtabs").boundingBox())!];
        expect(title.x + title.width).toBeLessThanOrEqual(tabs.x);
        expect(await off(), "houses").toEqual([]);
      }
      if (k) await page.keyboard.press("Escape");
    }
    await page.evaluate("{ const s = window.vamps.getState(); s.focusOn({ kind: 'lead', id: s.game.leads[0].id }) }");
    await page.waitForTimeout(300);
    expect(await off(), "lead panel").toEqual([]);
  });
