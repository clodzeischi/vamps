// A seeded monkey: clicks and presses at random, from campaigns at every
// stage. It finds the crashes nobody thought to write a journey for.
// MONKEY_STEPS sets how long; MONKEY_SEED another run.
import { expect, test } from "./game";

const STEPS = Number(process.env.MONKEY_STEPS ?? 250);
const SEED = Number(process.env.MONKEY_SEED ?? 1);
const KEYS = ["Escape", "Escape", "Space", "Equal", "Minus", "1", "2", "3", "4", "5", "6", "m", "Tab", "Enter"];
const BATTLE_KEYS = ["Escape", "Tab", "1", "2", "3", "t", "l", "g", "u", "i", "c", "m", "r", "f", "x", "Enter"];

const rng = (a: number) => () => {
  a = (a + 0x6d2b79f5) | 0;
  let t = Math.imul(a ^ (a >>> 15), 1 | a);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

for (const [n, save] of ["day-0", "day-30-2", "day-100-1", "day-200-2", "day-320-1", "with-captive", "event-battle", "event-haul", "mission-out"].entries())
  test(`monkey: ${save}`, async ({ game, page }) => {
    test.setTimeout(300_000);
    const rand = rng(SEED * 1000 + n);
    const pick = <T,>(xs: readonly T[]) => xs[Math.floor(rand() * xs.length)]!;
    await game.load(save);
    const trail: string[] = [];
    for (let i = 0; i < STEPS; i++) {
      const screen = await game.read((s) => s.screen);
      if (screen === "menu") {
        await page.getByRole("tab", { name: "Load" }).click();
        const go = page.getByRole("button", { name: /^Autosave/ });
        if (await go.count()) await go.click();
        else {
          await page.getByRole("tab", { name: "New" }).click();
          await page.getByRole("button", { name: "Begin the war" }).click();
        }
        trail.push("continue");
        continue;
      }
      const battle = screen === "battle" || screen === "skirmish";
      const r = rand();
      if (r < 0.6) {
        // A control that's really there to be clicked: nothing over it.
        const x = rand();
        const what = await page.evaluate((x) => {
          const all = [...document.querySelectorAll<HTMLElement>("button, select, input:not([type=file]), a.x")].filter((el) => {
            if ((el as HTMLButtonElement).disabled) return false;
            const b = el.getBoundingClientRect();
            const at = b.width && document.elementFromPoint(b.x + b.width / 2, b.y + b.height / 2);
            return at && (el.contains(at) || at === el) && !/Export/.test(el.innerText ?? "");
          });
          const el = all[Math.floor(x * all.length)];
          if (!el) return "nothing";
          if (el instanceof HTMLSelectElement) {
            el.selectedIndex = Math.floor(x * 997) % Math.max(1, el.options.length);
            el.dispatchEvent(new Event("change", { bubbles: true }));
          } else el.click();
          return `click ${el.className.slice(0, 30)} "${(el.innerText ?? "").slice(0, 40).replace(/\n/g, " / ")}"`;
        }, x);
        trail.push(what);
      } else if (r < 0.8) {
        const k = pick(battle ? BATTLE_KEYS : KEYS);
        trail.push(`key ${k}`);
        await page.keyboard.press(k);
      } else {
        const x = 300 + rand() * 840, y = 150 + rand() * 600;
        const button = battle && rand() < 0.6 ? "right" : "left";
        trail.push(`${button} click ${Math.round(x)},${Math.round(y)}`);
        await page.mouse.move(x, y);
        await page.mouse.click(x, y, { button });
      }
      if (rand() < 0.2) await page.waitForTimeout(battle ? 600 : 120);
      if (game.errors.length) break;
    }
    await page.waitForTimeout(500);
    expect(game.errors, `after:\n${trail.slice(-25).join("\n")}`).toEqual([]);
    // Still on its feet: something is on screen.
    await expect(page.locator(".screen").first()).toBeVisible();
  });
