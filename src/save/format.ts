// Save file format: versioned JSON, validated on the way in so a damaged or
// hand-edited file is rejected with a clear message instead of crashing later.
import { AIRCRAFT } from "../data/aircraft";
import { STATS } from "../data/agents";
import { BLOODLINES } from "../data/bloodlines";
import { isDifficultyId } from "../data/difficulty";
import { isKitId } from "../data/kit";
import { CULTURES } from "../data/names";
import { foundOrder } from "../sim/personnel";
import { INSTALLATIONS } from "../data/installations";
import { isRegionId, REGIONS } from "../data/regions";
import { STATE_VERSION, type GameState } from "../sim/state";

export const SAVE_FORMAT = "vamps-save";

export interface SaveFile {
  format: typeof SAVE_FORMAT;
  version: number;
  savedAt: string;
  state: GameState;
}

export class SaveError extends Error {}

export function serialize(state: GameState): string {
  const file: SaveFile = { format: SAVE_FORMAT, version: STATE_VERSION, savedAt: new Date().toISOString(), state };
  return JSON.stringify(file);
}

/** Upgrades older saves step by step. Add a case for each new STATE_VERSION. */
const MIGRATIONS: Record<number, (state: Record<string, unknown>) => void> = {
  // 1 -> 2: agents, aircraft, vampire operations and leads. Old campaigns get
  // the founding team at their first base.
  1: (raw) => {
    const s = raw as unknown as GameState;
    s.agents = [];
    s.candidates = [];
    s.aircraft = [];
    s.operations = [];
    s.leads = [];
    s.nextOperation = {};
    const first = (s.installations ?? []).find((i) => i.kind === "base");
    if (first) foundOrder(s, first.id);
    if (s.lastReport) Object.assign(s.lastReport, { upkeep: 0, leases: 0 });
  },
  // 2 -> 3: teams in the field, vampire sites, intel per bloodline, the fallen.
  2: (raw) => {
    const s = raw as unknown as GameState;
    s.missions = [];
    s.sites = [];
    s.intel = {};
    s.fallen = [];
  },
};

export function deserialize(text: string): GameState {
  let file: Partial<SaveFile>;
  try {
    file = JSON.parse(text) as Partial<SaveFile>;
  } catch {
    throw new SaveError("This is not a Vamps save file (it isn't valid JSON).");
  }
  if (!file || file.format !== SAVE_FORMAT || typeof file.version !== "number" || !file.state)
    throw new SaveError("This is not a Vamps save file.");
  if (file.version > STATE_VERSION)
    throw new SaveError("This save comes from a newer version of the game. Reload the page to update.");
  const state = file.state as unknown as Record<string, unknown>;
  for (let v = file.version; v < STATE_VERSION; v++) {
    const m = MIGRATIONS[v];
    if (!m) throw new SaveError(`Cannot upgrade a version ${v} save.`);
    m(state);
  }
  state.version = STATE_VERSION;
  return validate(state);
}

const num = (v: unknown, what: string) => {
  if (typeof v !== "number" || !Number.isFinite(v)) throw new SaveError(`Save is damaged: ${what} is not a number.`);
  return v;
};

function validate(raw: Record<string, unknown>): GameState {
  const s = raw as unknown as GameState;
  if (!isDifficultyId(s.difficulty)) throw new SaveError("Save is damaged: unknown difficulty.");
  for (const k of ["seed", "rng", "startTime", "time", "funds", "secrecy", "nextId", "monthIndex", "monthStartSupport"] as const)
    num(s[k], k);
  if (typeof s.openWar !== "boolean") throw new SaveError("Save is damaged: openWar.");
  if (!s.regions || typeof s.regions !== "object") throw new SaveError("Save is damaged: regions.");
  // Regions added to the game after the save start at their default support.
  for (const r of REGIONS) {
    const st = s.regions[r.id];
    if (!st) s.regions[r.id] = { support: r.startSupport };
    else num(st.support, `support in ${r.id}`);
  }
  for (const id of Object.keys(s.regions)) if (!isRegionId(id)) delete s.regions[id];
  if (!Array.isArray(s.installations)) throw new SaveError("Save is damaged: installations.");
  for (const i of s.installations) {
    if (!(i.kind in INSTALLATIONS)) throw new SaveError(`Save is damaged: unknown installation type "${i.kind}".`);
    if (!isRegionId(i.regionId)) throw new SaveError(`Save is damaged: unknown region "${i.regionId}".`);
    num(i.pos?.lat, "installation position");
    num(i.pos?.lon, "installation position");
    num(i.readyAt, "installation readyAt");
  }
  const baseIds = new Set(s.installations.filter((i) => i.kind === "base").map((i) => i.id));
  for (const key of ["agents", "candidates", "aircraft", "operations", "leads"] as const)
    if (!Array.isArray(s[key])) throw new SaveError(`Save is damaged: ${key}.`);
  for (const a of [...s.agents, ...s.candidates]) {
    if (typeof a.name !== "string" || !(a.culture in CULTURES)) throw new SaveError("Save is damaged: an agent's name or culture.");
    for (const st of STATS) num(a.stats?.[st.id], `${a.name}'s ${st.name}`);
  }
  // Agents and aircraft whose base is gone are lost with it.
  s.agents = s.agents.filter((a) => baseIds.has(a.baseId));
  for (const a of s.aircraft) if (!(a.kind in AIRCRAFT)) throw new SaveError(`Save is damaged: unknown aircraft "${a.kind}".`);
  s.aircraft = s.aircraft.filter((a) => baseIds.has(a.baseId));
  const bloodlineIds = new Set(BLOODLINES.map((b) => b.id));
  s.operations = s.operations.filter((o) => bloodlineIds.has(o.bloodline) && isRegionId(o.regionId));
  s.leads = s.leads.filter((l) => isRegionId(l.regionId) && s.operations.some((o) => o.id === l.opId));
  if (!s.nextOperation || typeof s.nextOperation !== "object") s.nextOperation = {};

  // Teams in the field. A mission whose aircraft or whole team is gone is dropped.
  for (const key of ["missions", "sites", "fallen"] as const)
    if (!Array.isArray(s[key])) throw new SaveError(`Save is damaged: ${key}.`);
  if (!s.intel || typeof s.intel !== "object") s.intel = {};
  for (const id of Object.keys(s.intel)) if (!bloodlineIds.has(id)) delete s.intel[id];
  s.sites = s.sites.filter((x) => bloodlineIds.has(x.bloodline) && isRegionId(x.regionId));
  const agentIds = new Set(s.agents.map((a) => a.id));
  const aircraftIds = new Set(s.aircraft.map((a) => a.id));
  s.missions = s.missions.filter(
    (m) => isKitId(m.kit) && aircraftIds.has(m.aircraftId) && ["outbound", "on-site", "returning"].includes(m.phase) && Array.isArray(m.agentIds),
  );
  for (const m of s.missions) m.agentIds = m.agentIds.filter((id) => agentIds.has(id));
  // Deployed flags follow the missions, whatever the file says.
  const flying = new Set(s.missions.map((m) => m.aircraftId));
  const out = new Set(s.missions.flatMap((m) => m.agentIds));
  for (const a of s.aircraft) a.deployed = flying.has(a.id);
  for (const a of s.agents) a.deployed = out.has(a.id);
  const missionIds = new Set(s.missions.map((m) => m.id));
  for (const l of s.leads) if (l.missionId && !missionIds.has(l.missionId)) l.missionId = null;
  for (const x of s.sites) if (x.missionId && !missionIds.has(x.missionId)) x.missionId = null;
  // An arrival waiting for orders needs its decision.
  s.events = Array.isArray(s.events) ? s.events.filter((e) => e.kind !== "arrival" || s.missions.some((m) => m.id === e.refId && m.decision)) : [];
  if (!Array.isArray(s.events)) s.events = [];
  if (!Array.isArray(s.log)) s.log = [];
  if (s.lastReport === undefined) s.lastReport = null;
  if (s.gameOver === undefined) s.gameOver = null;
  return s;
}
