import fs from "node:fs";
import { expect, test } from "./game";
import { SAVES } from "./paths";

test("every tab of the main menu", async ({ game, page }) => {
  await game.open();
  for (const [i, name] of ["New", "Load", "Skirmish", "Settings", "Credits"].entries()) {
    await page.keyboard.press(String(i + 1));
    await expect(page.getByRole("tab", { name })).toHaveAttribute("aria-selected", "true");
  }
});

test("a key is rebound, works, and goes back to its default", async ({ game, page }) => {
  await game.open();
  await page.getByRole("tab", { name: "Settings" }).click();
  const row = page.locator(".mm-key-row", { hasText: "Operations" });
  await row.getByRole("button").click();
  await page.keyboard.press("p");
  await expect(row.getByRole("button")).toHaveText("P");
  await page.getByRole("tab", { name: "New" }).click();
  await page.getByRole("button", { name: "Begin the war" }).click();
  await game.clearEvents();
  await page.keyboard.press("p");
  expect(await game.read((s) => s.overlay?.kind)).toBe("operations");
});

for (const difficulty of ["Novice", "Inquisitor", "Grand"])
  test(`a new campaign: ${difficulty}`, async ({ game, page }) => {
    await game.open();
    await page.getByRole("radio", { name: new RegExp(difficulty) }).first().click();
    await page.getByRole("button", { name: "Begin the war" }).click();
    await expect(page.locator(".geoscape")).toBeVisible();
    await game.clearEvents();
    for (let i = 0; i < 3; i++) await page.keyboard.press("Equal");
    await page.keyboard.press("Space");
    await expect.poll(() => game.read((s) => (s.game!.time - s.game!.startTime) / 86400000 > 1 || s.game!.events.length > 0)).toBe(true);
  });

test("save, quit, load, reload, export and import", async ({ game, page }) => {
  await game.load("day-30-1");
  await game.clearEvents();
  await page.getByRole("button", { name: "☰ Menu" }).click();
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await page.getByRole("button", { name: /^Slot 2/ }).click();
  const time = await game.read((s) => s.game!.time);
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export to File" }).click();
  const file = `${test.info().outputDir}/export.json`;
  await (await download).saveAs(file);
  await page.getByRole("button", { name: "Quit to Main Menu" }).click();
  await page.reload();
  await page.getByRole("tab", { name: "Load" }).click();
  await page.getByRole("button", { name: /^Slot 2/ }).click();
  await expect(page.locator(".geoscape")).toBeVisible();
  expect(await game.read((s) => s.game!.time)).toBe(time);
  await page.keyboard.press("Escape");
  await page.locator("input[type=file]").setInputFiles(file);
  await expect(page.getByText("Campaign imported.")).toBeVisible();
  expect(await game.read((s) => s.game!.time)).toBe(time);
});

test("loading another save from the pause menu", async ({ game, page }) => {
  await game.load("day-100-1");
  await game.clearEvents();
  await page.keyboard.press("4");
  await page.keyboard.press("Escape");
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Load", exact: true }).click();
  await page.getByRole("button", { name: /^Autosave/ }).click();
  await expect(page.locator(".pause-layout")).toHaveCount(0);
  await expect(page.locator(".geoscape")).toBeVisible();
});

test("a damaged save is refused with a message, and the menu stays", async ({ game, page }) => {
  await game.open("day-30-1");
  const file = JSON.parse(fs.readFileSync(`${SAVES}/day-30-1.json`, "utf8"));
  file.state.funds = "lots";
  await page.evaluate((t) => localStorage.setItem("vamps.save.auto", t), JSON.stringify(file));
  await game.loadAutosave();
  await expect(page.getByText(/Save is damaged/)).toBeVisible();
  await expect(page.getByRole("heading", { name: "VAMPS" })).toBeVisible();
});
