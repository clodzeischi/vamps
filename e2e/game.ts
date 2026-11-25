// The journeys' test: a page that fails the test on any crash, and the few
// things every journey does.
import fs from "node:fs";
import { test as base, expect, type Page } from "@playwright/test";
import type { useStore } from "../src/ui/store";
import { SAVES } from "./paths";

type Store = ReturnType<typeof useStore.getState>;
export type Vamps = { vamps: typeof useStore; __skirmish: { b: import("../src/tactical/battle").Battle } };

export const saveNames = () => (fs.existsSync(SAVES) ? fs.readdirSync(SAVES).map((f) => f.replace(".json", "")) : []);

export class Game {
  constructor(readonly page: Page, readonly errors: string[]) {}

  /** Opens the game at the main menu, with a save in the autosave slot if given. Quiet, without bloom. */
  async open(save?: string) {
    const text = save && fs.readFileSync(`${SAVES}/${save}.json`, "utf8");
    await this.page.addInitScript(([text, bloom]) => {
      // Only once, so a reload keeps what the game has written.
      if (localStorage.getItem("vamps.settings.v1")) return;
      localStorage.setItem("vamps.settings.v1", JSON.stringify({ bloom: !!bloom, masterVolume: 0 }));
      if (!text) return;
      localStorage.setItem("vamps.save.auto", text);
      localStorage.setItem("vamps.save.auto.meta", JSON.stringify({ slot: "auto", savedAt: new Date().toISOString(), label: "Test campaign" }));
    }, [text, process.env.E2E_BLOOM] as const);
    await this.page.goto("./");
    await expect(this.page.getByRole("heading", { name: "VAMPS" })).toBeVisible();
  }
  /** Straight into a save, as the player would: Continue. */
  async load(save: string) {
    await this.open(save);
    await this.page.getByRole("button", { name: "Continue", exact: true }).click();
    await expect(this.page.locator(".geoscape, .skirmish").first()).toBeVisible();
  }
  /** Reads the store (the e2e build puts it on window). */
  read<T>(fn: (s: Store) => T): Promise<T> {
    return this.page.evaluate(`(${fn.toString()})(window.vamps.getState())`) as Promise<T>;
  }
  /** Waits for the battle to be drawn and the player's move. */
  async inBattle() {
    await expect(this.page.locator(".loading-screen")).toHaveCount(0, { timeout: 60_000 });
    await expect(this.page.getByRole("button", { name: "End turn" })).toBeVisible({ timeout: 60_000 });
  }
  /** Puts off whatever is on screen, so the globe is free. */
  async clearEvents() {
    for (let i = 0; i < 30 && (await this.read((s) => s.game!.events.length)); i++) {
      const kind = await this.read((s) => s.game!.events[0]!.kind);
      if (kind === "arrival") await this.page.locator(".order").last().click();
      else if (kind === "battle") await this.page.getByRole("button", { name: /Leave it to the team/ }).click();
      else if (kind === "haul") await this.page.getByRole("button", { name: "Take off" }).click();
      else await this.page.locator(".modal.event").getByRole("button", { name: /^(Continue|Later)$/ }).click();
    }
  }
  /** Nothing has gone wrong so far; says what was being done if it has. */
  ok(doing: string) {
    expect(this.errors, doing).toEqual([]);
  }
}

export async function skirmish(game: Game, page: Page, choices: string[]) {
  await game.open();
  await page.getByRole("tab", { name: "Skirmish" }).click();
  for (const c of choices) await page.getByRole("radio", { name: c, exact: true }).click();
  await page.getByRole("button", { name: "Deploy" }).click();
  await game.inBattle();
}

export const test = base.extend<{ game: Game }>({
  game: async ({ page }, use) => {
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(`crash: ${e.stack ?? e.message}`));
    page.on("console", (m) => m.type() === "error" && errors.push(`console: ${m.text()} (${m.location().url})`));
    page.on("response", (r) => r.status() >= 400 && errors.push(`HTTP ${r.status()}: ${r.url()}`));
    page.on("crash", () => errors.push("the page itself crashed"));
    await use(new Game(page, errors));
    expect(errors, "page errors").toEqual([]);
  },
});
export { expect };
