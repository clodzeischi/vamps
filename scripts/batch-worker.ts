// Worker thread for scripts/batch.mjs: runs the jobs it's sent, one at a time.
import { parentPort } from "node:worker_threads";
import { runGame, type BatchJob } from "../src/sim/bots/batch";

parentPort!.on("message", (job: BatchJob | null) => {
  if (!job) return process.exit(0);
  parentPort!.postMessage(runGame(job));
});
