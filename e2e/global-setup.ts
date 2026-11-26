import { execFileSync } from "node:child_process";
import { build } from "esbuild";
import { SAVES } from "./paths";

/** Plays the bot campaigns the journeys start from (saves.ts). */
export default async function setup() {
  const out = "node_modules/.cache/vamps-e2e/saves.mjs";
  await build({
    entryPoints: ["e2e/saves.ts"],
    outfile: out,
    bundle: true,
    platform: "node",
    format: "esm",
    logLevel: "warning",
  });
  execFileSync(process.execPath, [out, SAVES], { stdio: "inherit" });
}
