// Screenshots of the dev pages, for checking a look without playing to it.
//
//   npm run shot -- <out-dir> "<name>|<query>" ["<name>|<query>" …]
//
// A query alone opens scene.html (src/scene/main.ts lists its parameters);
// one starting with a page ("gallery.html?…#…") opens that page. Uses the dev
// server on SHOT_PORT (5199) if one is up, else starts one for the run.
// Prints the page errors; each shot waits for window.sceneReady where the
// page sets it.
import { spawn } from "node:child_process";
import { mkdirSync } from "node:fs";
import { chromium } from "playwright";

const PORT = Number(process.env.SHOT_PORT ?? 5199);
const base = `http://localhost:${PORT}/`;
const [out, ...shots] = process.argv.slice(2);
if (!out || !shots.length) {
  console.log('usage: npm run shot -- <out-dir> "<name>|<query>" …');
  process.exit(1);
}
mkdirSync(out, { recursive: true });

const up = () =>
  fetch(base)
    .then((r) => r.ok)
    .catch(() => false);
let server = null;
if (!(await up())) {
  server = spawn("npx", ["vite", "--port", String(PORT), "--strictPort"], { stdio: "ignore" });
  for (let i = 0; i < 60 && !(await up()); i++) await new Promise((r) => setTimeout(r, 250));
}

const browser = await chromium.launch({
  args: process.platform === "darwin" ? ["--use-angle=metal"] : [],
});
try {
  for (const s of shots) {
    const [name, query = ""] = s.split("|");
    const url = /^[\w-]+\.html/.test(query) ? base + query : `${base}scene.html?${query}`;
    const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
    page.on("pageerror", (e) => console.log(`${name}: ${e.message}`));
    // Errors, and the GL warnings a bad draw gives (it fails silently otherwise).
    page.on(
      "console",
      (m) =>
        (m.type() === "error" || /GL_INVALID/.test(m.text())) &&
        console.log(`${name}: ${m.text()}`),
    );
    await page.goto(url, { waitUntil: "networkidle" });
    await page.waitForFunction(() => window.sceneReady, null, { timeout: 15000 }).catch(() => {});
    await page.waitForTimeout(1200); // shadows and the lamps' baked light settle
    await page.screenshot({ path: `${out}/${name}.png` });
    console.log(`${out}/${name}.png`);
    await page.close();
  }
} finally {
  await browser.close();
  server?.kill();
}
