// Writes drafted blocks to src/data/blocks/ (docs/design/block-design.md).
//
//   npm run draft -- rural                 every rural draft (scripts/blocks/rural.ts)
//   npm run draft -- rural barn barn-b     just these
//   npm run draft -- rural barn --force    overwrite a file changed since (in the editor)
//
// Each block is written with the format's own writer and checked with the
// editor's checks. The runner keeps a fingerprint of what it last wrote
// (scripts/blocks/written.json): a file still as it left it is rewritten
// freely; one that says anything else (edited in the editor since, or never
// written by a draft) is left alone unless named with --force.
import { build } from "esbuild";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "../..");
const [terrain, ...rest] = process.argv.slice(2);
if (!terrain) {
  console.log("usage: npm run draft -- <terrain file in scripts/blocks> [ids…] [--force]");
  process.exit(1);
}
const force = rest.includes("--force");
const ids = rest.filter((a) => !a.startsWith("--"));
// Overwriting a block someone may have edited in the editor: only one named on purpose.
if (force && !ids.length) {
  console.log("--force overwrites edits made in the editor: name the blocks it's for.");
  process.exit(1);
}

const out = path.join(root, "node_modules/.cache/draft-blocks.mjs");
await build({
  stdin: {
    contents: `export { DRAFTS } from "./scripts/blocks/${terrain}.ts";
export { blockJson, compile } from "./src/tactical/map/blocks.ts";
export { blockIssues } from "./src/editor/checks.ts";`,
    resolveDir: root,
    loader: "ts",
  },
  bundle: true,
  platform: "node",
  format: "esm",
  outfile: out,
  logLevel: "warning",
});
const { DRAFTS, blockJson, compile, blockIssues } = await import(
  `${pathToFileURL(out).href}?${Date.now()}`
);

const unknown = ids.filter((id) => !DRAFTS[id]);
if (unknown.length) {
  console.log(`No draft ${unknown.join(", ")}. Drafts: ${Object.keys(DRAFTS).join(", ")}`);
  process.exit(1);
}
const ledger = path.join(root, "scripts/blocks/written.json");
const written = fs.existsSync(ledger) ? JSON.parse(fs.readFileSync(ledger, "utf8")) : {};
const hash = (t) => createHash("sha1").update(t).digest("hex");
let problems = 0;
for (const id of ids.length ? ids : Object.keys(DRAFTS)) {
  const b = DRAFTS[id]();
  if (b.id !== id) throw new Error(`draft ${id} makes a block called ${b.id}`);
  const text = blockJson(b);
  const issues = blockIssues(compile(b), b, b.nodes);
  problems += issues.length;
  const file = path.join(root, "src/data/blocks", `${id}.json`);
  const was = fs.existsSync(file) ? fs.readFileSync(file, "utf8") : null;
  const ours = was === null || written[id] === hash(was);
  const state =
    was === text
      ? "unchanged"
      : !ours && !force
        ? "NOT WRITTEN: changed since the draft wrote it (in the editor?); name it with --force to overwrite"
        : (fs.writeFileSync(file, text), was === null ? "written" : "rewritten");
  if (was === text || ours || force) written[id] = hash(fs.readFileSync(file, "utf8"));
  console.log(`${id}: ${state}${issues.length ? "" : ", no problems"}`);
  for (const i of issues)
    console.log(`   ${i.text}${i.x !== undefined ? ` (${i.x}, ${i.y}, level ${i.z})` : ""}`);
}
fs.writeFileSync(
  ledger,
  JSON.stringify(Object.fromEntries(Object.entries(written).sort()), null, 2) + "\n",
);
process.exit(problems ? 1 : 0);
