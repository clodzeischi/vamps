import { describe, expect, it } from "vitest";
import { deserialize, serialize } from "../../save/format";
import { bestPlace, freePlaces, roomsOf, solveSynergy, synergy } from "./building";
import { newCampaign } from "../campaign/campaign";
import {
  demolishBlocker,
  demolishRoom,
  facilityCount,
  setStaff,
  upgradeBase,
  upgradeBlocker,
} from "../people/personnel";

const at = (floor: number, slot: number) => (floor + 1) * 8 + slot;
const total = (rooms: number[]) => [...solveSynergy(rooms).values()].reduce((a, v) => a + v, 0);

describe("base building", () => {
  it("scores lines of 3 and pairs, each room once", () => {
    expect(total([at(0, 0), at(0, 1), at(0, 2)])).toBeCloseTo(0.6); // a side of a floor
    expect(total([at(-1, 3), at(0, 3), at(1, 3)])).toBeCloseTo(0.6); // a column
    expect(total([at(0, 0), at(0, 7)])).toBeCloseTo(0.2); // a pair round the ring
    expect(total([at(0, 0), at(1, 0)])).toBeCloseTo(0.2); // a stacked pair
    expect(total([at(0, 0), at(0, 2)])).toBe(0); // corners of one side don't touch
    // A T: a line of 3 plus one more touching its middle: the fourth gets nothing.
    expect(total([at(0, 0), at(0, 1), at(0, 2), at(1, 1)])).toBeCloseTo(0.6);
    // A whole face of the building: 9 rooms, 3 lines.
    const face = [-1, 0, 1].flatMap((f) => [0, 1, 2].map((s) => at(f, s)));
    expect(total(face)).toBeCloseTo(9 * 0.2);
  });

  it("lays out Padua when the Order is founded, keeping the entrance clear", () => {
    const s = newCampaign("inquisitor", 1);
    const b = s.installations.find((i) => i.kind === "base")!;
    const rooms = roomsOf(b);
    expect(rooms.filter((r) => r.kind === "quarters")).toHaveLength(2);
    expect(rooms.filter((r) => r.kind === "lab")).toHaveLength(1);
    expect(rooms.some((r) => r.floor === 0 && r.slot === 1)).toBe(false);
    expect(freePlaces(b)).toHaveLength(23 - rooms.length);
    expect(synergy(b, "quarters")).toBeCloseTo(0.1); // the two quarters are placed as a pair
    const back = deserialize(serialize(s)).installations.find((i) => i.id === b.id)!;
    expect(back.rooms).toEqual(rooms);
  });

  it("builds on a chosen tile, refuses the entrance and taken tiles, and clears rooms", () => {
    const s = newCampaign("inquisitor", 1);
    s.funds = 1e8;
    const b = s.installations.find((i) => i.kind === "base")!;
    expect(upgradeBlocker(s, b.id, "lab", { floor: 0, slot: 1 })).toBe("That room is taken.");
    const p = bestPlace(b, "lab")!;
    expect(upgradeBase(s, b.id, "lab", p)).toBeNull();
    expect(upgradeBlocker(s, b.id, "workshop", p)).toBe("That room is taken.");
    const lab = roomsOf(b).find((r) => r.kind === "lab")!;
    expect(demolishBlocker(s, b.id, lab)).toBe("Let some scientists go first."); // 4 scientists, 1 lab
    setStaff(s, b, "scientist", 0);
    expect(demolishRoom(s, b.id, lab)).toBeNull();
    expect(facilityCount(b, "lab")).toBe(0);
  });
});
