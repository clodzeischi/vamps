// Save file format: versioned JSON, validated on the way in so a damaged or
// hand-edited file is rejected with a clear message instead of crashing later.
import { AIRCRAFT } from "../data/aircraft";
import { STATS } from "../data/agents";
import { BLOODLINES } from "../data/bloodlines";
import { isDifficultyId } from "../data/difficulty";
import { isKitId } from "../data/kit";
import { isCoverUpTemplate } from "../sim/coverups";
import { isCharter } from "../sim/missions";
import { isMediaLevel } from "../sim/media";
import { CULTURES } from "../data/names";
import { equipFirstBase, foundOrder } from "../sim/personnel";
import { newBloodlineStates } from "../sim/bloodlines";
import { newStory } from "../sim/story";
import { isAssetKind } from "../sim/humint";
import { DAY } from "../sim/time";
import { isProjectId, projectById } from "../data/research";
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
  // 3 -> 4: cover-up operations, media campaigns, incident heat.
  3: (raw) => {
    const s = raw as unknown as GameState;
    s.coverUps = [];
    s.heat = 0;
    s.lastIncident = null;
    s.media = {};
    s.mediaSpent = 0;
    if (s.lastReport) s.lastReport.media = 0;
  },
  // 4 -> 5: research and engineering, staff, labs, containment, captives. The
  // first base gets the founding science wing, as a new campaign would.
  4: (raw) => {
    const s = raw as unknown as GameState;
    s.research = { done: [] };
    s.engineering = { done: [] };
    s.projects = [];
    s.debtMonths = 0;
    s.hostileWarned = false;
    s.bloodlines = newBloodlineStates();
    // The story begins: a campaign already past day 45 gets two weeks before Padua falls.
    s.assets = [];
    s.story = newStory(s.startTime);
    s.story.fallAt = Math.max(s.story.fallAt, s.time + 14 * DAY);
    const first = (s.installations ?? []).find((i) => i.kind === "base");
    if (first) equipFirstBase(first);
    if (s.lastReport) s.lastReport.staff = 0;
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
    (m) => isKitId(m.kit) && (aircraftIds.has(m.aircraftId) || isCharter(m.aircraftId)) && ["outbound", "on-site", "returning"].includes(m.phase) && Array.isArray(m.agentIds),
  );
  for (const m of s.missions) m.agentIds = m.agentIds.filter((id) => agentIds.has(id));

  // Cover-ups and media campaigns.
  if (!Array.isArray(s.coverUps)) throw new SaveError("Save is damaged: coverUps.");
  s.coverUps = s.coverUps.filter((c) => isCoverUpTemplate(c.template) && isRegionId(c.regionId) && Array.isArray(c.agentIds));
  for (const c of s.coverUps) {
    for (const k of ["cost", "days", "agents", "gain", "expiresAt", "startedAt", "doneAt"] as const) num(c[k], `cover-up ${k}`);
    c.agentIds = c.agentIds.filter((id) => agentIds.has(id));
  }
  // A running cover-up that lost its agents can't go on.
  s.coverUps = s.coverUps.filter((c) => !c.startedAt || c.agentIds.length === c.agents);
  if (typeof s.heat !== "number" || !Number.isFinite(s.heat)) s.heat = 0;
  if (s.lastIncident && !isRegionId(s.lastIncident.regionId)) s.lastIncident = null;
  s.lastIncident ??= null;
  if (!s.media || typeof s.media !== "object") s.media = {};
  for (const [id, l] of Object.entries(s.media)) if (!isRegionId(id) || !isMediaLevel(l)) delete s.media[id];
  if (typeof s.mediaSpent !== "number" || !Number.isFinite(s.mediaSpent)) s.mediaSpent = 0;

  // Research and engineering; staff, captives and remains at bases.
  for (const key of ["research", "engineering"] as const) {
    const t = s[key];
    if (!t || !Array.isArray(t.done)) throw new SaveError(`Save is damaged: ${key}.`);
    t.done = t.done.filter((id) => isProjectId(id) && projectById(id)!.kind === key);
  }
  // The war with each bloodline; a lair must exist while it's recorded.
  if (!s.bloodlines || typeof s.bloodlines !== "object") throw new SaveError("Save is damaged: bloodlines.");
  for (const [id, st] of Object.entries(newBloodlineStates())) {
    const b = (s.bloodlines[id] ??= st);
    b.destroyedAt = typeof b.destroyedAt === "number" ? b.destroyedAt : null;
    if (b.lairId && !s.sites.some((x) => x.id === b.lairId)) b.lairId = null;
    b.lairId ??= null;
  }
  for (const id of Object.keys(s.bloodlines)) if (!bloodlineIds.has(id)) delete s.bloodlines[id];
  // HUMINT assets.
  if (!Array.isArray(s.assets)) s.assets = [];
  s.assets = s.assets.filter((a) => isAssetKind(a.kind) && isRegionId(a.regionId) && Number.isFinite(a.monthly) && Number.isFinite(a.pos?.lat));
  for (const l of s.leads) if (l.asset !== undefined && !isAssetKind(l.asset)) delete l.asset;
  // The story's acts.
  if (!s.story || typeof s.story !== "object" || ![1, 2, 3].includes(s.story.act)) throw new SaveError("Save is damaged: story.");
  num(s.story.fallAt, "story fallAt");
  for (const k of ["fallWarned", "exposed", "won"] as const) s.story[k] = s.story[k] === true;
  for (const k of ["fellAt", "returnedAt"] as const) s.story[k] = typeof s.story[k] === "number" ? s.story[k] : null;
  // Saves from before the Act I beats: count the ones whose day has passed as played.
  if (!Array.isArray(s.story.beats)) s.story.beats = s.time - s.startTime > 2 * 86_400_000 ? ["briefing", "sao-paulo", "boston-volunteer", "boston-nest", "agnes", "where-would-we-go"].filter((_, i) => (s.time - s.startTime) / 86_400_000 > [0, 6, 11, 17, 24, 34][i]!) : [];
  if (typeof s.debtMonths !== "number" || !Number.isFinite(s.debtMonths)) s.debtMonths = 0;
  s.hostileWarned = s.hostileWarned === true;
  if (!Array.isArray(s.projects)) throw new SaveError("Save is damaged: projects.");
  // A project whose base is gone goes with it.
  s.projects = s.projects.filter((a) => isProjectId(a.projectId) && baseIds.has(a.baseId));
  for (const a of s.projects) {
    num(a.progress, "project progress");
    num(a.staff, "project staff");
  }
  for (const b of s.installations) {
    if (b.kind !== "base") continue;
    for (const k of ["labs", "workshops", "containment", "scientists", "engineers", "remains"] as const)
      if (b[k] !== undefined) num(b[k], `${b.name} ${k}`);
    if (b.captives !== undefined) {
      if (!Array.isArray(b.captives)) throw new SaveError(`Save is damaged: captives at ${b.name}.`);
      b.captives = b.captives.filter((c) => (c.kind === "thrall" || c.kind === "vampire") && bloodlineIds.has(c.bloodline));
    }
  }

  // Deployed flags follow the missions and cover-ups, whatever the file says.
  const flying = new Set(s.missions.map((m) => m.aircraftId));
  const out = new Set([...s.missions.flatMap((m) => m.agentIds), ...s.coverUps.flatMap((c) => c.agentIds)]);
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
