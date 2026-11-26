// Writes the saves the journeys start from (global-setup.ts bundles and runs it):
// bots play real campaigns, with fights left to the player as in the game, and
// the first campaign to reach each situation is kept.
import fs from "node:fs";
import { BLOODLINES } from "../src/data/bloodlines";
import { ITEM_IDS } from "../src/data/equipment";
import { PROJECTS } from "../src/data/research";
import { deserialize, serialize } from "../src/save/format";
import { decideArrivals, playTurn, type BotStats } from "../src/sim/bots/bot";
import { newCampaign } from "../src/sim/campaign/campaign";
import { countRooms, setRooms } from "../src/sim/base/building";
import { advance, dismissEvent } from "../src/sim/core/clock";
import { autoResolveBattle, tactical } from "../src/sim/missions/missions";
import { GOOD_IDS } from "../src/sim/economy/market";
import type { GameState } from "../src/sim/core/state";
import { DAY, HOUR } from "../src/sim/core/time";

tactical.on = true;
const dir = process.argv[2]!;
fs.mkdirSync(dir, { recursive: true });
const saves = new Map<string, string>();
for (const f of fs.readdirSync(dir)) fs.unlinkSync(`${dir}/${f}`);
const keep = (name: string, s: GameState) =>
  void (saves.has(name) || saves.set(name, serialize(s)));

for (const seed of [1, 2, 3, 4]) {
  const s = newCampaign(seed % 2 ? "novice" : "inquisitor", seed);
  const st: BotStats = {};
  if (seed === 1) keep("day-0", s);
  while (s.time - s.startTime < 330 * DAY && !s.gameOver) {
    while (s.events.length) {
      const e = s.events[0]!;
      // Every kind of event a campaign brings up, as it stands on screen.
      keep(`event-${e.kind}`, s);
      if (e.kind === "battle" && e.refId) {
        const err = autoResolveBattle(s, e.refId);
        if (err) throw new Error(`auto-resolve: ${err}`);
      } else if (e.kind === "arrival") {
        decideArrivals(s, st, true);
        if (s.events[0] === e) dismissEvent(s);
      } else dismissEvent(s);
    }
    if (s.gameOver) break;
    playTurn(s, "campaign", st);
    advance(s, HOUR);
    const day = Math.floor((s.time - s.startTime) / DAY);
    if (seed <= 2 && !s.events.length)
      for (const d of [30, 100, 200, 320]) if (day >= d) keep(`day-${d}-${seed}`, s);
    if (!s.events.length && s.missions.some((m) => m.phase === "outbound")) keep("mission-out", s);
    if (!s.events.length && s.leads.length && s.agents.length > 4) keep("with-lead", s);
    if (!s.events.length && s.installations.some((i) => (i.captives?.length ?? 0) > 0))
      keep("with-captive", s);
  }
}
// Bots seldom take anyone alive: if none did, a thrall in a cell built for it.
if (!saves.has("with-captive")) {
  const s = deserialize(saves.get("day-100-1")!);
  const base = s.installations.find((b) => b.kind === "base")!;
  if (!countRooms(base, "containment")) setRooms(base, "containment", 1);
  base.captives = [
    ...(base.captives ?? []),
    {
      id: "cap-e2e-held",
      kind: "thrall",
      bloodline: "ashgrove",
      city: "Rome",
      regionId: base.regionId,
      takenAt: s.time,
    } as never,
  ];
  saves.set("with-captive", serialize(s));
}
// Bots fly one aircraft at a time, so the haul is made by hand: a team on the ground with two aircraft and a captive.
{
  const s = deserialize(saves.get("mission-out")!);
  const m = s.missions[0]!;
  const base = s.aircraft.filter((a) => a.baseId === m.baseId);
  Object.assign(m, {
    phase: "on-site",
    aircraftId: base[0]!.id,
    escorts: base.slice(1, 2).map((a) => a.id),
    haul: true,
  });
  base[0]!.cargo = {
    captives: [{ id: "cap-e2e", kind: "thrall", bloodline: "ashgrove", takenAt: s.time } as never],
    remains: 1,
  } as never;
  s.events = [
    {
      id: "ev-e2e",
      time: s.time,
      kind: "haul",
      title: `The haul: ${m.title}`,
      body: "Everything is aboard.",
      regionId: m.regionId,
      pos: m.pos,
      refId: m.id,
    } as never,
  ];
  saves.set("event-haul", serialize(s));
}
// Bots research and loot little: a campaign that knows everything and has everything to sell.
{
  const s = deserialize(saves.get("day-200-1")!);
  s.research.done = PROJECTS.filter((p) => p.kind === "research").map((p) => p.id);
  s.engineering.done = PROJECTS.filter((p) => p.kind === "engineering" && !p.product).map(
    (p) => p.id,
  );
  const base = s.installations.find((b) => b.kind === "base")!;
  base.remains = 3;
  base.armoury = Object.fromEntries(ITEM_IDS.map((x) => [x, 2]));
  for (const id of GOOD_IDS) if (id !== "tissue") s.market.stock[id] = 3;
  s.market.sold = {
    haematology: { soldAt: s.time, publicAt: s.time, out: true },
    pheromones: { soldAt: s.time, publicAt: s.time + 20 * DAY },
  };
  BLOODLINES.forEach((b, i) => {
    for (let k = 0; k < 2; k++)
      s.market.artifacts.push({
        id: `art-e2e-${i}-${k}`,
        name: k ? "A Templar seal matrix" : "The Book of the Perfect: a Cathar ritual",
        bloodline: b.id,
        regionId: base.regionId,
        city: "Rome",
        value: 300_000,
        takenAt: s.time,
        treasure: !k,
      });
  });
  saves.set("rich", serialize(s));
}
// Bots seldom run out of money: a campaign in the red, told so.
{
  const s = deserialize(saves.get("day-200-1")!);
  s.funds = -400_000;
  s.events = [
    {
      id: "ev-e2e",
      time: s.time,
      kind: "debt",
      title: "In debt",
      body: "The accounts are in the red.",
    } as never,
  ];
  saves.set("event-debt", serialize(s));
}
for (const [name, text] of saves) fs.writeFileSync(`${dir}/${name}.json`, text);
console.log(`${saves.size} saves: ${[...saves.keys()].join(", ")}`);
