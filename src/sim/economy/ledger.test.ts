// The month's books behind the Details screen (sim/economy/ledger.ts): what moved
// secrecy, and where support and money stood, this month and last.
import { describe, expect, it } from "vitest";
import { deserialize, serialize } from "../../save/format";
import { newCampaign } from "../campaign/campaign";
import { changeSupport, monthEnd, regionalContribution } from "./economy";
import { changeSecrecy } from "../campaign/secrecy";
import { noteSecrecy } from "./ledger";

const quiet = () => {
  const s = newCampaign("inquisitor", 5);
  s.story.fallAt = 8.64e15;
  return s;
};

describe("the month's books", () => {
  it("open with the campaign, with every region's support and contribution", () => {
    const s = quiet();
    expect(s.ledger?.previous).toBeNull();
    expect(s.ledger?.current.secrecyStart).toBe(s.secrecy);
    expect(s.ledger?.current.contribution.italy).toBe(regionalContribution(s, "italy"));
  });

  it("record what moved secrecy, repeats of one cause adding up", () => {
    const s = quiet();
    s.secrecy = 80;
    changeSecrecy(s, -2, "a team is seen moving toward Lyon");
    changeSecrecy(s, -1, "a team is seen moving toward Lyon");
    changeSecrecy(s, 3, "a story buried");
    noteSecrecy(s, 0.1, "quiet days: the story dies down");
    const book = s.ledger!.current.secrecy;
    expect(book.find((e) => e.reason.includes("Lyon"))).toMatchObject({ delta: -3, count: 2 });
    expect(book.find((e) => e.reason === "a story buried")?.delta).toBe(3);
    expect(book).toHaveLength(3);
  });

  it("only record what secrecy actually moved (it stops at 100)", () => {
    const s = quiet();
    s.secrecy = 99;
    changeSecrecy(s, 5, "a story buried");
    expect(s.ledger!.current.secrecy[0]!.delta).toBeCloseTo(1);
  });

  it("close at month end: last month keeps what each region paid, and new books open", () => {
    const s = quiet();
    const paid = regionalContribution(s, "italy");
    changeSecrecy(s, -4, "something loud");
    monthEnd(s);
    const prev = s.ledger!.previous!;
    expect(prev.paid?.italy).toBe(paid);
    expect(prev.secrecy.some((e) => e.reason === "something loud")).toBe(true);
    expect(prev.secrecyEnd).toBe(s.secrecy);
    expect(s.ledger!.current.secrecy).toHaveLength(0);
    // Support moving now shows against where the month opened.
    const start = s.ledger!.current.support.italy!;
    changeSupport(s, "italy", 1);
    expect(s.regions.italy!.support - start).toBeCloseTo(1);
  });

  it("survive a save", () => {
    const s = quiet();
    changeSecrecy(s, -2, "noise");
    const back = deserialize(serialize(s));
    expect(back.ledger.current.secrecy[0]?.reason).toBe("noise");
  });
});
