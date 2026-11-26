import { describe, expect, it } from "vitest";
import { runGame } from "./batch";

describe("batch runner", () => {
  it("plays a whole campaign headless, the same way every time", () => {
    const job = { difficulty: "inquisitor", seed: 7, policy: "builder", months: 2 } as const;
    const a = runGame(job);
    const b = runGame(job);
    expect(a.snapshots).toHaveLength(3); // start, month 1, month 2
    expect(a.snapshots).toEqual(b.snapshots);
    expect(a.counts).toEqual(b.counts);
    expect(a.counts.dispatched).toBeGreaterThan(0);
    expect(runGame({ ...job, policy: "idle" }).counts.dispatched).toBeUndefined();
  });
});
