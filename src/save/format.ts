// Save file format: versioned JSON, validated on the way in so a damaged or
// hand-edited file is rejected with a clear message instead of crashing later.
import { isItemId, type ItemId } from "../data/equipment";
import { cleanGear } from "../sim/inventory";
import { furnish, NEW_BASE, ROOM_KINDS } from "../sim/building";
import { AIRCRAFT } from "../data/aircraft";
import { ROLES } from "../data/aptitudes";
import { BLOODLINES } from "../data/bloodlines";
import { isDifficultyId } from "../data/difficulty";
import { isKitId } from "../data/kit";
import { isCoverUpTemplate } from "../sim/coverups";
import { PRIOR } from "../sim/intel";
import { TIER_DIFFICULTY } from "../sim/judged";
import { isHired } from "../sim/missions";
import { unpackBattle } from "../tactical/save";
import { isMediaLevel } from "../sim/media";
import { CULTURES } from "../data/names";
import { newBloodlineStates } from "../sim/bloodlines";
import { newNetworks } from "../sim/networks";
import { cleanAptitudes, rollAptitudes } from "../sim/aptitudes";
import { rng } from "../sim/rng";
import { isAssetKind } from "../sim/humint";
import { isGoodId } from "../sim/market";
import { DAY } from "../sim/time";
import { regionalContribution } from "../sim/economy";
import { openLedger } from "../sim/ledger";
import { isProjectId, projectById } from "../data/research";
import { INSTALLATIONS, STAFF_KINDS } from "../data/installations";
import { isRegionId, REGIONS } from "../data/regions";
import { STATE_VERSION, type GameState, type GoodId, basesOf } from "../sim/state";

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

/** Item counts as saved: known items, whole positive numbers. */
function cleanItems(x: unknown): Partial<Record<ItemId, number>> {
  const out: Partial<Record<ItemId, number>> = {};
  if (x && typeof x === "object") for (const [k, v] of Object.entries(x)) if (isItemId(k) && Number.isInteger(v) && (v as number) > 0) out[k] = v as number;
  return out;
}

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
  // Until 1.0, older saves aren't upgraded (docs/WEB_PORT.md, Architecture).
  if (file.version < STATE_VERSION)
    throw new SaveError("This save comes from an older version of the game and can no longer be loaded.");
  return validate(file.state as unknown as Record<string, unknown>);
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
  const baseIds = new Set(basesOf(s).map((i) => i.id));
  for (const key of ["agents", "candidates", "aircraft", "operations", "leads"] as const)
    if (!Array.isArray(s[key])) throw new SaveError(`Save is damaged: ${key}.`);
  for (const p of [...s.agents, ...s.candidates]) {
    if (typeof p.name !== "string" || !(p.culture in CULTURES) || !ROLES.includes(p.role)) throw new SaveError("Save is damaged: a person's name, culture or role.");
  }
  for (const a of s.agents) num(a.vitality, `${a.name}'s Vitality`);
  // Agents and aircraft whose base is gone are lost with it.
  s.agents = s.agents.filter((a) => baseIds.has(a.baseId));
  for (const a of s.agents) {
    if (!a.gear) continue;
    a.gear = cleanGear(a.gear, isItemId);
  }
  if (s.shipments !== undefined)
    s.shipments = Array.isArray(s.shipments)
      ? s.shipments.filter((x) => x && baseIds.has(x.toBaseId) && Number.isFinite(x.arriveAt)).map((x) => ({ id: x.id, toBaseId: x.toBaseId, arriveAt: x.arriveAt, items: cleanItems(x.items), ...(x.darkWeb ? { darkWeb: true } : {}) }))
      : [];
  for (const b of s.installations) {
    if (!b.armoury) continue;
    if (typeof b.armoury !== "object") { delete b.armoury; continue; }
    for (const [k, v] of Object.entries(b.armoury)) if (!isItemId(k) || !Number.isInteger(v) || (v as number) <= 0) delete (b.armoury as Record<string, unknown>)[k];
  }
  if (!Array.isArray(s.staff)) throw new SaveError("Save is damaged: staff.");
  s.staff = s.staff.filter((p) => p && typeof p.id === "string" && typeof p.name === "string" &&
    STAFF_KINDS.includes(p.role) && baseIds.has(p.baseId));
  // Everyone's aptitudes: damaged ones are rolled again.
  for (const p of [...s.agents, ...s.staff, ...s.candidates]) p.aptitudes = cleanAptitudes(p.aptitudes, p.role) ?? rollAptitudes(rng(s), p.role);
  // The month's books (Details screen): damaged ones open fresh.
  const bookOk = (b: unknown): boolean => !!b && typeof b === "object" && Array.isArray((b as { secrecy?: unknown }).secrecy) &&
    typeof (b as { support?: unknown }).support === "object" && typeof (b as { contribution?: unknown }).contribution === "object";
  if (!s.ledger || !bookOk(s.ledger.current)) s.ledger = { current: openLedger(s, (id) => regionalContribution(s, id)), previous: null };
  else if (s.ledger.previous && !bookOk(s.ledger.previous)) s.ledger.previous = null;
  for (const a of s.aircraft) if (!(a.kind in AIRCRAFT)) throw new SaveError(`Save is damaged: unknown aircraft "${a.kind}".`);
  s.aircraft = s.aircraft.filter((a) => baseIds.has(a.baseId));
  const bloodlineIds = new Set(BLOODLINES.map((b) => b.id));
  s.operations = s.operations.filter((o) => bloodlineIds.has(o.bloodline) && isRegionId(o.regionId));
  // The intelligence section and its cases (sim/intel.ts). A lead is about an operation, or is noise with a case of its own.
  if (!Array.isArray(s.cases)) s.cases = [];
  s.cases = s.cases.filter((c) => c && typeof c.id === "string" && Number.isFinite(c.prior) && c.prior > 0 && c.prior < 1 && Array.isArray(c.evidence));
  for (const c of s.cases) {
    c.real = c.real === true;
    c.evidence = c.evidence.filter((e) => e && Number.isFinite(e.lr) && e.lr > 0 && typeof e.text === "string");
  }
  const caseById = new Map(s.cases.map((c) => [c.id, c]));
  const vias = Object.keys(PRIOR);
  s.leads = s.leads.filter((l) => isRegionId(l.regionId) && vias.includes(l.via) && caseById.has(l.caseId) &&
    (s.operations.some((o) => o.id === l.opId) || !caseById.get(l.caseId)!.real));
  if (!s.section || typeof s.section !== "object") throw new SaveError("Save is damaged: section.");
  const sec = s.section;
  if (sec.find && !(sec.find.kind === "house" ? bloodlineIds.has(sec.find.id) : sec.find.kind === "region" && isRegionId(sec.find.id))) sec.find = null;
  sec.find ??= null;
  if (sec.fixing && !s.leads.some((l) => l.id === sec.fixing)) sec.fixing = null;
  sec.fixing ??= null;
  sec.findPoints = Number.isFinite(sec.findPoints) ? Math.max(0, sec.findPoints) : 0;
  sec.fixPoints = Number.isFinite(sec.fixPoints) ? Math.max(0, sec.fixPoints) : 0;
  if (!s.nextOperation || typeof s.nextOperation !== "object") s.nextOperation = {};

  // Teams in the field. A mission whose aircraft or whole team is gone is dropped.
  for (const key of ["missions", "sites", "fallen"] as const)
    if (!Array.isArray(s[key])) throw new SaveError(`Save is damaged: ${key}.`);
  // The houses' networks: a damaged one is placed again from the seed (what we had climbed is lost).
  if (!s.networks || typeof s.networks !== "object") s.networks = {};
  const fresh = newNetworks(s.seed ?? 0);
  for (const id of bloodlineIds) {
    const n = s.networks[id];
    if (!n || !Array.isArray(n.sites) || !n.sites.length || !n.sites.every((x) => x && typeof x.id === "string" && isRegionId(x.regionId) && ["nest", "den", "lair"].includes(x.kind)))
      s.networks[id] = fresh[id]!;
    const net = s.networks[id]!;
    net.clues = Number.isFinite(net.clues) && net.clues > 0 ? Math.floor(net.clues) : 0;
    net.pages = Number.isFinite(net.pages) && net.pages > 0 ? Math.floor(net.pages) : 0;
    net.nextAssaultAt = Number.isFinite(net.nextAssaultAt) ? net.nextAssaultAt : null;
    for (const x of net.sites) { x.known = x.known === true; x.raided = x.raided === true; }
  }
  for (const id of Object.keys(s.networks)) if (!bloodlineIds.has(id)) delete s.networks[id];
  s.sites = s.sites.filter((x) => bloodlineIds.has(x.bloodline) && isRegionId(x.regionId) && typeof x.netId === "string");
  const agentIds = new Set(s.agents.map((a) => a.id));
  const aircraftIds = new Set(s.aircraft.map((a) => a.id));
  s.missions = s.missions.filter(
    (m) => isKitId(m.kit) && (aircraftIds.has(m.aircraftId) || isHired(m.aircraftId)) && ["outbound", "on-site", "returning"].includes(m.phase) && Array.isArray(m.agentIds),
  );
  for (const m of s.missions) m.agentIds = m.agentIds.filter((id) => agentIds.has(id));
  // A battle under way that doesn't unpack is dropped: it starts over from its Contact event.
  for (const m of s.missions) {
    const live = m.battle?.live;
    if (!live) continue;
    try {
      if (typeof live.title !== "string") throw new Error("no title");
      unpackBattle(live.battle);
    } catch {
      delete m.battle!.live;
    }
  }

  // Cover-ups and media campaigns.
  if (!Array.isArray(s.coverUps)) throw new SaveError("Save is damaged: coverUps.");
  s.coverUps = s.coverUps.filter((c) => isCoverUpTemplate(c.template) && isRegionId(c.regionId) && Array.isArray(c.agentIds) &&
    ["coverup", "call", "disinfo"].includes(c.kind) && c.tier in TIER_DIFFICULTY && !!c.weights && typeof c.weights === "object");
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
  // The dark web (the market) and pledges.
  if (!s.market || typeof s.market !== "object") throw new SaveError("Save is damaged: market.");
  s.market.stock = s.market.stock && typeof s.market.stock === "object" ? s.market.stock : {};
  s.market.demand = s.market.demand && typeof s.market.demand === "object" ? s.market.demand : {};
  for (const k of Object.keys(s.market.stock) as GoodId[]) if (!isGoodId(k) || !Number.isFinite(s.market.stock[k])) delete s.market.stock[k];
  for (const k of Object.keys(s.market.demand) as (GoodId | "artifacts")[]) {
    const v = s.market.demand[k];
    if ((k !== "artifacts" && !isGoodId(k)) || typeof v !== "number" || !Number.isFinite(v)) delete s.market.demand[k];
  }
  s.market.artifacts = Array.isArray(s.market.artifacts) ? s.market.artifacts.filter((a) => typeof a?.name === "string" && Number.isFinite(a.value) && isRegionId(a.regionId)) : [];
  s.market.found = Array.isArray(s.market.found) ? s.market.found.filter((n) => typeof n === "string") : [];
  s.market.earned = Number.isFinite(s.market.earned) ? s.market.earned : 0;
  if (s.market.sold !== undefined) {
    const sold = s.market.sold && typeof s.market.sold === "object" ? s.market.sold : {};
    s.market.sold = {};
    for (const [k, v] of Object.entries(sold))
      if (projectById(k) && v && Number.isFinite(v.soldAt) && Number.isFinite(v.publicAt)) s.market.sold[k] = { soldAt: v.soldAt, publicAt: v.publicAt, ...(v.out ? { out: true } : {}) };
  }
  for (const r of Object.values(s.regions)) {
    if (r.pledge !== undefined && !Number.isFinite(r.pledge)) delete r.pledge;
    if (r.credit !== undefined && !Number.isFinite(r.credit)) delete r.credit;
  }
  // The story's acts.
  if (!s.story || typeof s.story !== "object" || ![1, 2, 3].includes(s.story.act)) throw new SaveError("Save is damaged: story.");
  num(s.story.fallAt, "story fallAt");
  for (const k of ["exposed", "won"] as const) s.story[k] = s.story[k] === true;
  for (const k of ["fellAt", "returnedAt"] as const) s.story[k] = typeof s.story[k] === "number" ? s.story[k] : null;
  // The cardinal's Act II dispatches, and the Act I beats played.
  s.story.dispatches = Number.isFinite(s.story.dispatches) ? s.story.dispatches : 0;
  if (typeof s.story.nextDispatchAt !== "number") s.story.nextDispatchAt = s.story.act === 2 ? s.time + 10 * DAY : null;
  if (!Array.isArray(s.story.beats)) throw new SaveError("Save is damaged: story beats.");
  if (typeof s.debtMonths !== "number" || !Number.isFinite(s.debtMonths)) s.debtMonths = 0;
  s.hostileWarned = s.hostileWarned === true;
  if (!Array.isArray(s.projects)) throw new SaveError("Save is damaged: projects.");
  // A project whose base is gone goes with it.
  // Research is the Order's (only a captive's questioning has a base); engineering is a base's.
  s.projects = s.projects.filter((a) => isProjectId(a.projectId) && (projectById(a.projectId)!.kind === "research" && !a.captiveId ? a.baseId === "" : baseIds.has(a.baseId)));
  for (const a of s.projects) {
    num(a.progress, "project progress");
    if (a.short !== undefined && a.short !== true) delete a.short;
    if (a.count !== undefined && (!Number.isInteger(a.count) || a.count < 2)) delete a.count;
  }
  // A lead must be one of ours, of the role (a lead engineer, at that base).
  const staffs = (id: string | undefined, role: string, baseId?: string) => s.staff.some((p) => p.id === id && p.role === role && (!baseId || p.baseId === baseId));
  for (const b of s.installations) if (b.leadEngineer !== undefined && !staffs(b.leadEngineer, "engineer", b.id)) delete b.leadEngineer;
  if (s.leadScientist !== undefined && !staffs(s.leadScientist, "scientist")) delete s.leadScientist;
  if (s.leadAnalyst !== undefined && !staffs(s.leadAnalyst, "analyst")) delete s.leadAnalyst;
  for (const b of s.installations) {
    if (b.kind !== "base") continue;
    for (const k of ["hangars", "sigintCentre", "remains"] as const)
      if (b[k] !== undefined) num(b[k], `${b.name} ${k}`);
    // A base without a building (damaged) is laid out as a new one.
    if (!Array.isArray(b.rooms)) furnish(b, NEW_BASE);
    else b.rooms = b.rooms.filter((r) => ROOM_KINDS.includes(r?.kind) &&
      Number.isInteger(r.floor) && r.floor >= -1 && r.floor <= 1 && Number.isInteger(r.slot) && r.slot >= 0 && r.slot < 8);
    if (b.captives !== undefined) {
      if (!Array.isArray(b.captives)) throw new SaveError(`Save is damaged: captives at ${b.name}.`);
      b.captives = b.captives.filter((c) => (c.kind === "thrall" || c.kind === "vampire") && bloodlineIds.has(c.bloodline));
    }
  }

  for (const c of s.aircraft) {
    if (!c.cargo) continue;
    const ok = typeof c.cargo === "object" && Number.isInteger(c.cargo.remains) && c.cargo.remains >= 0 && Array.isArray(c.cargo.captives);
    if (!ok) delete c.cargo;
    else {
      c.cargo.captives = c.cargo.captives.filter((x) => (x?.kind === "thrall" || x?.kind === "vampire") && bloodlineIds.has(x.bloodline));
      if (c.cargo.items) c.cargo.items = cleanItems(c.cargo.items);
    }
  }
  for (const c of s.aircraft) if (c.ferry && !(baseIds.has(c.baseId) && Number.isFinite(c.ferry.arriveAt) && Array.isArray(c.ferry.people))) delete c.ferry;
  for (const a of s.agents) if (a.arriveAt !== undefined && !Number.isFinite(a.arriveAt)) delete a.arriveAt;
  for (const m of s.missions) {
    if (m.escorts) m.escorts = Array.isArray(m.escorts) ? m.escorts.filter((id) => aircraftIds.has(id)) : [];
    if (m.wings !== undefined) {
      m.wings = Array.isArray(m.wings) ? m.wings.filter((w) => w && aircraftIds.has(w.aircraftId) && baseIds.has(w.baseId) && Array.isArray(w.agentIds) && Number.isFinite(w.arriveAt)) : [];
      for (const w of m.wings) if (w.escorts) w.escorts = w.escorts.filter((id) => aircraftIds.has(id));
    }
  }
  const missionIds = new Set(s.missions.map((m) => m.id));
  for (const l of s.leads) if (l.missionId && !missionIds.has(l.missionId)) l.missionId = null;
  for (const x of s.sites) if (x.missionId && !missionIds.has(x.missionId)) x.missionId = null;
  // An arrival waiting for orders needs its decision.
  s.events = Array.isArray(s.events) ? s.events.filter(
        (e) =>
          (e.kind !== "arrival" || s.missions.some((m) => m.id === e.refId && m.decision)) &&
          (e.kind !== "battle" || s.missions.some((m) => m.id === e.refId && m.battle)),
      ) : [];
  if (!Array.isArray(s.events)) s.events = [];
  if (!Array.isArray(s.log)) s.log = [];
  if (s.lastReport === undefined) s.lastReport = null;
  if (s.gameOver === undefined) s.gameOver = null;
  return s;
}
