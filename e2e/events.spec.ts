import { expect, test } from "./game";

// Every kind of event a campaign brings up (saves.ts keeps the first of each).
const KINDS = [
  "lead",
  "arrival",
  "battle",
  "debrief",
  "haul",
  "coverup",
  "coverup-result",
  "vampire",
  "research",
  "site",
  "sigil",
  "story",
  "monthly",
  "debt",
  "game-over",
];

for (const kind of KINDS)
  test(`event: ${kind}`, async ({ game, page }) => {
    const fs = await import("node:fs");
    const { SAVES } = await import("./paths");
    test.skip(!fs.existsSync(`${SAVES}/event-${kind}.json`), "no bot campaign came to one");
    await game.load(`event-${kind}`);
    const modal = page.locator(".modal.event");
    await expect(modal).toBeVisible();
    expect(await game.read((s) => s.game!.events[0]!.kind)).toBe(kind);
    // Nothing of it is off the screen.
    const box = (await modal.boundingBox())!;
    expect(box.y).toBeGreaterThanOrEqual(0);
    expect(box.y + box.height).toBeLessThanOrEqual(900);
    if (kind === "battle") return;
    if (kind === "game-over") {
      await page.getByRole("button", { name: "Return to the main menu" }).click();
      return void (await expect(page.getByRole("heading", { name: "VAMPS" })).toBeVisible());
    }
    const show = modal.getByRole("button", { name: /Show on the globe|Review the offer/ });
    if (await show.count()) await show.click();
    await game.clearEvents();
    await page.waitForTimeout(300);
  });
