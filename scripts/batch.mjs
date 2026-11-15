// Runs hundreds of headless campaigns in parallel and summarises them.
//
//   npm run batch                                   # 100 games each: 3 difficulties × 3 bot policies, 12 months
//   npm run batch -- --games 500 --months 24 --difficulty grand --policy builder
//   npm run batch -- --threads 8 --seed 1000 --out reports/my-run.json
//
// Options:
//   --games N        games per difficulty × policy (default 100)
//   --months N       campaign length in months (default 12)
//   --difficulty L   novice,inquisitor,grand or all (default all)
//   --policy L       idle,responder,builder or all (default all); see src/sim/bot.ts
//   --seed N         first seed (default 1); game i uses seed N+i, the same across policies
//   --threads N      worker threads (default: CPU cores − 1)
//   --out FILE       full results as JSON (default reports/batch-<time>.json; reports/ is git-ignored)
//
// The sim is bundled with esbuild into node_modules/.cache, then each worker
// runs whole games (src/sim/batch.ts) and sends back monthly snapshots.
import { build } from "esbuild";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { Worker } from "node:worker_threads";

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");

// ----- Options -----
const argv = process.argv.slice(2);
const opt = (name, def) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 && argv[i + 1] !== undefined ? argv[i + 1] : def;
};
const list = (v, all) => (v === "all" ? all : v.split(",").map((x) => x.trim()).filter(Boolean));
const DIFFICULTIES = ["novice", "inquisitor", "grand"];
const POLICIES = ["idle", "responder", "builder"];
const games = Number(opt("games", 100));
const months = Number(opt("months", 12));
const seed0 = Number(opt("seed", 1));
const difficulties = list(opt("difficulty", "all"), DIFFICULTIES);
const policies = list(opt("policy", "all"), POLICIES);
const threads = Math.max(1, Number(opt("threads", Math.max(1, os.cpus().length - 1))));
const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
const out = path.resolve(root, opt("out", `reports/batch-${stamp}.json`));
for (const d of difficulties) if (!DIFFICULTIES.includes(d)) throw new Error(`Unknown difficulty "${d}"`);
for (const p of policies) if (!POLICIES.includes(p)) throw new Error(`Unknown policy "${p}"`);

// ----- Bundle the sim -----
const workerFile = path.join(root, "node_modules/.cache/vamps-batch/worker.mjs");
await build({
  entryPoints: [path.join(root, "scripts/batch-worker.ts")],
  outfile: workerFile,
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node20",
  logLevel: "warning",
});

// ----- Run -----
const jobs = [];
for (const difficulty of difficulties)
  for (const policy of policies)
    for (let i = 0; i < games; i++) jobs.push({ difficulty, seed: seed0 + i, policy, months });

const t0 = Date.now();
const results = [];
let next = 0;
let lastPrint = 0;
const progress = () => {
  const now = Date.now();
  if (now - lastPrint < 250 && results.length < jobs.length) return;
  lastPrint = now;
  const secs = (now - t0) / 1000;
  process.stderr.write(`\r  ${results.length}/${jobs.length} games · ${secs.toFixed(1)} s · ${(results.length / Math.max(secs, 0.001)).toFixed(0)} games/s   `);
};
console.error(`Running ${jobs.length} games (${difficulties.join(", ")} × ${policies.join(", ")}, ${months} months) on ${threads} threads…`);
await new Promise((resolve, reject) => {
  let live = Math.min(threads, jobs.length);
  for (let w = 0; w < Math.min(threads, jobs.length); w++) {
    const worker = new Worker(workerFile);
    const feed = () => worker.postMessage(next < jobs.length ? jobs[next++] : null);
    worker.on("message", (r) => {
      results.push(r);
      progress();
      feed();
    });
    worker.on("error", reject);
    worker.on("exit", () => {
      if (--live === 0) resolve();
    });
    feed();
  }
});
const elapsed = (Date.now() - t0) / 1000;
process.stderr.write("\n");

// ----- Summarise -----
const q = (xs, p) => {
  if (!xs.length) return NaN;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.max(0, Math.round(p * (s.length - 1))))];
};
const mean = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : NaN);
const fmt = {
  money: (v) => (Math.abs(v) >= 1e6 ? `${(v / 1e6).toFixed(1)}M` : `${Math.round(v / 1e3)}k`),
  n1: (v) => v.toFixed(1),
  n2: (v) => v.toFixed(2),
  int: (v) => String(Math.round(v)),
  pct: (v) => `${Math.round(v * 100)}%`,
};
/** "p10 · median · p90" of a value across games. */
const spread = (xs, f) => `${f(q(xs, 0.1))} · ${f(q(xs, 0.5))} · ${f(q(xs, 0.9))}`;
const pad = (s, n) => String(s).padEnd(n);

const summary = [];
for (const difficulty of difficulties)
  for (const policy of policies) {
    const rs = results.filter((r) => r.job.difficulty === difficulty && r.job.policy === policy);
    if (!rs.length) continue;
    const end = rs.map((r) => r.snapshots.at(-1));
    const over = rs.filter((r) => r.gameOverMonth !== null);
    const counts = {};
    for (const r of rs) for (const [k, v] of Object.entries(r.counts)) counts[k] = (counts[k] ?? 0) + v;
    for (const k of Object.keys(counts)) counts[k] = Math.round((counts[k] / rs.length) * 10) / 10;
    // Median of each month across games (games that ended early drop out).
    const timeline = [];
    for (let m = 0; m <= months; m++) {
      const snaps = rs.map((r) => r.snapshots.find((x) => x.month === m)).filter(Boolean);
      if (!snaps.length) break;
      timeline.push({
        month: m, games: snaps.length,
        funds: q(snaps.map((x) => x.funds), 0.5), secrecy: q(snaps.map((x) => x.secrecy), 0.5), support: q(snaps.map((x) => x.support), 0.5),
      });
    }
    summary.push({
      difficulty, policy, games: rs.length,
      gameOverRate: over.length / rs.length,
      gameOverMedianMonth: over.length ? q(over.map((r) => r.gameOverMonth), 0.5) : null,
      openWarRate: end.filter((x) => x.openWar).length / rs.length,
      end: Object.fromEntries(
        ["funds", "secrecy", "support", "homeSupport", "hostile", "friendly", "agents", "fallen", "stations", "intel", "intelMax", "researched"].map((k) => [
          k, { p10: q(end.map((x) => x[k]), 0.1), median: q(end.map((x) => x[k]), 0.5), p90: q(end.map((x) => x[k]), 0.9), mean: mean(end.map((x) => x[k])) },
        ]),
      ),
      counts,
      timeline,
      msPerGame: mean(rs.map((r) => r.ms)),
    });
    // Terminal report.
    console.log(`\n${difficulty.toUpperCase()} · ${policy} · ${rs.length} games · ${months} months`);
    console.log(`  ${pad("game over", 18)}${fmt.pct(over.length / rs.length)}${over.length ? ` (median month ${q(over.map((r) => r.gameOverMonth), 0.5)})` : ""}   open war ${fmt.pct(end.filter((x) => x.openWar).length / rs.length)}`);
    console.log(`  ${pad("", 18)}p10 · median · p90 at the end`);
    const rows = [
      ["funds", end.map((x) => x.funds), fmt.money],
      ["secrecy", end.map((x) => x.secrecy), fmt.int],
      ["support (avg)", end.map((x) => x.support), fmt.n2],
      ["support (home)", end.map((x) => x.homeSupport), fmt.n2],
      ["hostile regions", end.map((x) => x.hostile), fmt.int],
      ["agents", end.map((x) => x.agents), fmt.int],
      ["fallen", end.map((x) => x.fallen), fmt.int],
      ["stations", end.map((x) => x.stations), fmt.int],
      ["intel (best)", end.map((x) => x.intelMax), fmt.int],
      ["researched", end.map((x) => x.researched), fmt.int],
    ];
    for (const [label, xs, f] of rows) console.log(`  ${pad(label, 18)}${spread(xs, f)}`);
    const pick = (k) => counts[k] ?? 0;
    console.log(
      `  ${pad("per game", 18)}leads ${pick("event_lead")} · dispatched ${pick("dispatched")} · success ${pick("debrief: Success")} / partial ${pick("debrief: Partial success")} / fail ${pick("debrief: Failure")} · cover-ups ${pick("coverups")}/${pick("event_coverup")} offers · research done ${pick("event_research")}`,
    );
    const tl = timeline.filter((_, i) => i % Math.max(1, Math.ceil(timeline.length / 7)) === 0 || i === timeline.length - 1);
    console.log(`  ${pad("median by month", 18)}${tl.map((t) => `m${t.month}: ${fmt.money(t.funds)} s${Math.round(t.secrecy)} ${t.support >= 0 ? "+" : ""}${t.support.toFixed(1)}`).join(" | ")}`);
  }

fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, JSON.stringify({ options: { games, months, seed0, difficulties, policies, threads }, elapsedSeconds: elapsed, summary, results }, null, 0));
console.log(`\n${results.length} games in ${elapsed.toFixed(1)} s (${(results.length / elapsed).toFixed(1)} games/s). Full results: ${path.relative(root, out)}`);
