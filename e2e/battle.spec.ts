import { expect, skirmish, test } from "./game";
import type { Page } from "@playwright/test";

test.describe.configure({ timeout: 240_000 });

const myTurn = (page: Page) =>
  expect(
    page.getByRole("button", { name: "End turn" }).or(page.locator(".battle-result")),
  ).toBeVisible({ timeout: 90_000 });

for (const choices of [
  ["Town", "Night"],
  ["Farm", "Day", "Snow"],
  ["Farm", "Night", "Full"],
  ["Apartments", "Rain", "A prisoner"],
  ["Industrial", "Plainclothes"],
  ["Town", "Hospital"],
  ["Town", "Supermarket"],
  ["Balls to the walls"],
  ["Lair"],
])
  test(`skirmish: ${choices.join(", ")}`, async ({ game, page }) => {
    await skirmish(game, page, choices);
    // The HUD: levels, sound, inventory, backpack, modes, the agents in turn.
    for (const k of ["r", "f", "Tab", "2", "2", "c", "c", "m", "u", "u", "l"])
      await page.keyboard.press(k);
    await page.keyboard.press("i");
    await page.keyboard.press("Escape");
    await expect(page.locator(".inv-window")).toHaveCount(0);
    await page.keyboard.press("Escape");
    await expect(page.locator(".pause-layout")).toBeVisible();
    await expect(page.getByRole("button", { name: "Save", exact: true })).toHaveCount(0);
    await page.getByRole("button", { name: "Resume" }).click();
    game.ok("HUD");
    await myTurn(page);
    // Walk where the mouse is, right of and below the agent; then the enemy's turn.
    await page.mouse.move(780, 480);
    await page.mouse.click(780, 480, { button: "right" });
    await myTurn(page);
    await page.keyboard.press("Enter");
    await page.waitForTimeout(500);
    await myTurn(page);
    game.ok("a turn");
    await page.getByRole("button", { name: "☰ Menu" }).click();
    await page.getByRole("button", { name: "Quit to Main Menu" }).click();
    await expect(page.getByRole("tab", { name: "Skirmish" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
  });

test("grenades, the backpack strip and force fire", async ({ game, page }) => {
  await skirmish(game, page, ["Town", "Tactical"]);
  await page.keyboard.press("g");
  await expect(page.locator(".battle-throw-hint")).toBeVisible();
  for (const [x, y] of [
    [760, 420],
    [820, 480],
    [700, 520],
    [640, 380],
  ])
    await page.mouse.move(x!, y!, { steps: 3 });
  await page.keyboard.press("Escape");
  await page.keyboard.press("u");
  await page.locator(".strip-item", { hasText: "Incendiary" }).click();
  await page.mouse.click(800, 420);
  await page.waitForTimeout(400);
  await myTurn(page);
  await page.keyboard.down("Control");
  await page.mouse.move(820, 400, { steps: 4 });
  await page.mouse.click(820, 400);
  await page.keyboard.up("Control");
  await page.waitForTimeout(400);
  await myTurn(page);
});

test("a battle to its end: withdraw from the landing zone", async ({ game, page }) => {
  await skirmish(game, page, ["Farm", "Day"]);
  for (let i = 0; i < 20 && !(await page.locator(".battle-result").count()); i++) {
    await page.keyboard.press("x");
    await page.waitForTimeout(700);
    if (i > 10) await page.keyboard.press("Enter");
    await myTurn(page);
  }
  await page.getByRole("button", { name: "To the menu" }).click();
  await expect(page.getByRole("heading", { name: "VAMPS" })).toBeVisible();
});

test("a campaign battle: command it, reload the page, carry on, save and quit", async ({
  game,
  page,
}) => {
  await game.load("event-battle");
  await page.getByRole("button", { name: "Take command" }).click();
  await game.inBattle();
  await page.keyboard.press("Enter");
  await page.waitForTimeout(500);
  await myTurn(page);
  const turn = await page.evaluate("window.__skirmish.b.turn");
  await page.reload();
  await game.loadAutosave();
  await game.inBattle();
  expect(await page.evaluate("window.__skirmish.b.turn")).toBe(turn);
  // Saved to a slot, played on, loaded again from the menu: the turn it was saved at.
  await page.getByRole("button", { name: "☰ Menu" }).click();
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await page.getByRole("button", { name: /^Slot 1/ }).click();
  await page.keyboard.press("Enter"); // the menu has the keyboard: the turn doesn't end
  await page.getByRole("button", { name: "Resume" }).click();
  expect(await page.evaluate("window.__skirmish.b.turn")).toBe(turn);
  await page.keyboard.press("Enter");
  await expect.poll(() => page.evaluate("window.__skirmish.b.turn")).not.toBe(turn);
  await page.getByRole("button", { name: "☰ Menu" }).click();
  await page.getByRole("button", { name: "Load", exact: true }).click();
  await page.getByRole("button", { name: /^Slot 1/ }).click();
  await expect.poll(() => page.evaluate("window.__skirmish.b.turn")).toBe(turn);
  await game.inBattle();
  await page.getByRole("button", { name: "☰ Menu" }).click();
  await page.getByRole("button", { name: "Quit to Main Menu" }).click();
  await expect(page.getByRole("heading", { name: "VAMPS" })).toBeVisible();
  await game.loadAutosave();
  await game.inBattle();
});

test("a campaign battle: withdrawn, debriefed, and the war goes on", async ({ game, page }) => {
  await game.load("event-battle");
  await page.getByRole("button", { name: "Take command" }).click();
  await game.inBattle();
  for (let i = 0; i < 25 && !(await page.locator(".battle-result").count()); i++) {
    await page.keyboard.press("x");
    await page.waitForTimeout(700);
    if (i > 10) await page.keyboard.press("Enter");
    await myTurn(page);
  }
  await page.getByRole("button", { name: "Debrief" }).click();
  await expect(page.locator(".geoscape")).toBeVisible();
  await game.clearEvents();
  await page.keyboard.press("5");
  await page.waitForTimeout(800);
});

// Fought to the end by a player who shoots what there is and walks about: every
// kind of shot, death, torpor, fire and enemy turn plays through the view.
for (const [n, choices] of [
  ["Town", "Den"],
  ["Balls to the walls", "Haven"],
  ["Apartments", "A prisoner"],
  ["Industrial", "Rain"],
  ["Farm", "Day"],
  ["Lair"],
].entries())
  test(`fought out: ${choices.join(", ")}`, async ({ game, page }) => {
    test.setTimeout(420_000);
    await skirmish(game, page, choices);
    let seed = n + 1;
    const rand = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    const end = Date.now() + Number(process.env.BATTLE_MS ?? 45_000);
    while (Date.now() < end && !(await page.locator(".battle-result").count())) {
      game.ok("the fight");
      if (!(await page.getByRole("button", { name: "End turn" }).count())) {
        await page.waitForTimeout(150);
        continue;
      }
      const r = rand();
      const chip = page.locator(".target-chip").first();
      if (r < 0.55 && (await chip.count())) await chip.click({ timeout: 1500 }).catch(() => {});
      else if (r < 0.75)
        await page.mouse.click(350 + rand() * 740, 200 + rand() * 450, { button: "right" });
      else if (r < 0.8) {
        await page.keyboard.press("g");
        await page.mouse.click(400 + rand() * 640, 250 + rand() * 350);
        await page.keyboard.press("Escape");
      } else if (r < 0.9)
        await page.keyboard.press(["Tab", "m", "l", "c"][Math.floor(rand() * 4)]!);
      else await page.keyboard.press("Enter");
      await page.waitForTimeout(80);
    }
    game.ok("the fight's end");
  });
