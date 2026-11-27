// Save file format: versioned JSON, validated on the way in so a damaged or
// hand-edited file is rejected with a clear message instead of crashing later.
import { AIRCRAFT } from "../data/aircraft";
import { ROLES, type StaffRole } from "../data/aptitudes";
import { BLOODLINES } from "../data/bloodlines";
import { isDifficultyId } from "../data/difficulty";
import { isItemId } from "../data/equipment";
import { INSTALLATIONS, STAFF_KINDS } from "../data/installations";
import { isKitId } from "../data/kit";
import { CULTURES } from "../data/names";
import { isRegionId, REGIONS } from "../data/regions";
import { isProjectId, projectById } from "../data/research";
import { areAptitudes } from "../sim/people/aptitudes";
import { ROOM_KINDS } from "../sim/base/building";
import { isCoverUpTemplate } from "../sim/campaign/coverups";
import { isAssetKind } from "../sim/intel/humint";
import { PRIOR } from "../sim/intel/intel";
import { isGear } from "../sim/people/inventory";
import { TIER_DIFFICULTY } from "../sim/intel/judged";
import { isGoodId } from "../sim/economy/market";
import { isMediaLevel } from "../sim/campaign/media";
import { isHired } from "../sim/missions/dispatch";
import { basesOf, STATE_VERSION, type Captive, type GameState } from "../sim/core/state";
import { unpackBattle } from "../tactical/save";

const SAVE_FORMAT = "vamps-save";

interface SaveFile {
  format: typeof SAVE_FORMAT;
  version: number;
  savedAt: string;
  state: GameState;
}

export class SaveError extends Error {}

export function serialize(state: GameState): string {
  const file: SaveFile = {
    format: SAVE_FORMAT,
    version: STATE_VERSION,
    savedAt: new Date().toISOString(),
    state,
  };
  return JSON.stringify(file);
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
    throw new SaveError(
      "This save comes from a newer version of the game. Reload the page to update.",
    );
  // Until 1.0, older saves aren't upgraded (docs/WEB_PORT.md, Architecture).
  if (file.version < STATE_VERSION)
    throw new SaveError(
      "This save comes from an older version of the game and can no longer be loaded.",
    );
  return validate(file.state);
}

function num(v: unknown, what: string) {
  if (typeof v !== "number" || !Number.isFinite(v))
    throw new SaveError(`Save is damaged: ${what} is not a number.`);
}

function need(ok: unknown, what: string): asserts ok {
  if (!ok) throw new SaveError(`Save is damaged: ${what}.`);
}

const isObject = (x: unknown): x is Record<string, unknown> =>
  !!x && typeof x === "object" && !Array.isArray(x);
const isCount = (x: unknown) => Number.isInteger(x) && (x as number) >= 0;
const isTime = (x: unknown) => x === null || (typeof x === "number" && Number.isFinite(x));
const isBloodline = (id: string) => BLOODLINES.some((b) => b.id === id);
const areItems = (x: unknown) =>
  isObject(x) && Object.entries(x).every(([k, n]) => isItemId(k) && isCount(n));
const isCaptive = (c: Captive | null) =>
  !!c && (c.kind === "thrall" || c.kind === "vampire") && isBloodline(c.bloodline);
const isBook = (b: unknown) =>
  isObject(b) && Array.isArray(b.secrecy) && isObject(b.support) && isObject(b.contribution);

const LISTS = [
  "installations",
  "agents",
  "staff",
  "candidates",
  "cases",
  "aircraft",
  "operations",
  "leads",
  "missions",
  "sites",
  "fallen",
  "coverUps",
  "assets",
  "projects",
  "events",
  "log",
] as const;
const OBJECTS = [
  "regions",
  "section",
  "networks",
  "bloodlines",
  "nextOperation",
  "media",
  "market",
  "research",
  "engineering",
  "story",
  "ledger",
] as const;
const NUMBERS = [
  "seed",
  "rng",
  "startTime",
  "time",
  "funds",
  "secrecy",
  "heat",
  "mediaSpent",
  "debtMonths",
  "nextId",
  "monthIndex",
  "monthStartSupport",
] as const;

function validate(raw: unknown): GameState {
  need(isObject(raw), "state");
  const s = raw as unknown as GameState;
  check(s);
  settle(s);
  return s;
}

/** Is everything there, of the right shape, and known to the game? If not the save is refused. */
function check(s: GameState) {
  checkTopLevel(s);
  checkWorld(s);
  checkBases(s);
  checkPeopleAndAircraft(s);
  checkHouses(s);
  checkFieldWork(s);
  checkResearchAndMarket(s);
  checkStory(s);
}

/** The state's lists, objects, numbers and flags are all there. */
function checkTopLevel(s: GameState) {
  for (const k of LISTS)
    need(Array.isArray(s[k]) && (s[k] as unknown[]).every((x) => isObject(x)), k);
  for (const k of OBJECTS) need(isObject(s[k]), k);
  for (const k of NUMBERS) num(s[k], k);
  need(isDifficultyId(s.difficulty), "unknown difficulty");
  need(typeof s.openWar === "boolean" && typeof s.hostileWarned === "boolean", "flags");
  need(s.gameOver === null || typeof s.gameOver === "string", "gameOver");
  need(s.lastReport === null || isObject(s.lastReport), "lastReport");
  need(
    s.lastIncident === null || (isObject(s.lastIncident) && isRegionId(s.lastIncident.regionId)),
    "lastIncident",
  );
  need(
    isBook(s.ledger.current) && (s.ledger.previous === null || isBook(s.ledger.previous)),
    "ledger",
  );
}

/** The world: regions, support, pledges, media campaigns; everything in a known region. */
function checkWorld(s: GameState) {
  for (const r of REGIONS) num(s.regions[r.id]?.support, `support in ${r.id}`);
  for (const [id, r] of Object.entries(s.regions)) {
    need(isRegionId(id), `unknown region "${id}"`);
    if (r.pledge !== undefined) num(r.pledge, `pledge of ${id}`);
    if (r.credit !== undefined) num(r.credit, `record of ${id}`);
    if (r.activity !== undefined) num(r.activity, `activity in ${id}`);
  }
  for (const key of [
    "installations",
    "operations",
    "leads",
    "missions",
    "sites",
    "coverUps",
    "assets",
  ] as const)
    for (const x of s[key]) need(isRegionId(x.regionId), `unknown region "${x.regionId}" (${key})`);
  for (const [id, level] of Object.entries(s.media))
    need(isRegionId(id) && isMediaLevel(level), `media campaign in ${id}`);
}

/** Bases: the building and what it holds. */
function checkBases(s: GameState) {
  for (const i of s.installations) {
    need(i.kind in INSTALLATIONS, `unknown installation type "${i.kind}"`);
    num(i.pos?.lat, "installation position");
    num(i.pos?.lon, "installation position");
    num(i.readyAt, "installation readyAt");
    for (const k of ["hangars", "sigintCentre", "remains"] as const)
      if (i[k] !== undefined) num(i[k], `${i.name} ${k}`);
    need(i.armoury === undefined || areItems(i.armoury), `armoury at ${i.name}`);
    need(
      i.captives === undefined || (Array.isArray(i.captives) && i.captives.every(isCaptive)),
      `captives at ${i.name}`,
    );
    need(
      i.kind !== "base" ||
        (Array.isArray(i.rooms) &&
          i.rooms.every(
            (r) =>
              isObject(r) &&
              ROOM_KINDS.includes(r.kind) &&
              Number.isInteger(r.floor) &&
              r.floor >= -1 &&
              r.floor <= 1 &&
              Number.isInteger(r.slot) &&
              r.slot >= 0 &&
              r.slot < 8,
          )),
      `rooms at ${i.name}`,
    );
  }
}

/** People (names, cultures, roles, aptitudes, gear) and aircraft (cargo, transfers). */
function checkPeopleAndAircraft(s: GameState) {
  for (const p of [...s.agents, ...s.staff, ...s.candidates]) {
    need(
      typeof p.id === "string" &&
        typeof p.name === "string" &&
        p.culture in CULTURES &&
        ROLES.includes(p.role),
      "a person's name, culture or role",
    );
    need(areAptitudes(p.aptitudes, p.role), `${p.name}'s aptitudes`);
  }
  for (const p of [...s.agents, ...s.staff])
    if (p.arriveAt !== undefined) num(p.arriveAt, `${p.name}'s arrival`);
  for (const p of s.staff) need(STAFF_KINDS.includes(p.role), `${p.name}'s role`);
  for (const a of s.agents) {
    num(a.vitality, `${a.name}'s Vitality`);
    num(a.hp, `${a.name}'s health`);
    need(a.gear === undefined || isGear(a.gear, isItemId), `${a.name}'s gear`);
    need(a.lowViz === undefined || isGear(a.lowViz, isItemId), `${a.name}'s low-viz gear`);
  }
  for (const c of s.aircraft) {
    need(c.kind in AIRCRAFT, `unknown aircraft "${c.kind}"`);
    need(c.tanks === undefined || typeof c.tanks === "boolean", `fuel tanks of ${c.name}`);
    need(
      !c.cargo ||
        (isCount(c.cargo.remains) &&
          Array.isArray(c.cargo.captives) &&
          c.cargo.captives.every(isCaptive) &&
          (c.cargo.items === undefined || areItems(c.cargo.items))),
      `cargo of ${c.name}`,
    );
    need(
      !c.ferry || (Number.isFinite(c.ferry.arriveAt) && Array.isArray(c.ferry.people)),
      `transfer of ${c.name}`,
    );
  }
  need(
    s.shipments === undefined ||
      (Array.isArray(s.shipments) &&
        s.shipments.every(
          (x) =>
            isObject(x) &&
            Number.isFinite(x.arriveAt) &&
            areItems(x.items) &&
            (x.aircraft === undefined ||
              (isObject(x.aircraft) &&
                Object.entries(x.aircraft).every(
                  ([k, n]) => k in AIRCRAFT && Number.isInteger(n) && (n as number) >= 0,
                ))),
        )),
    "shipments",
  );
}

/** What the section is looking for: a house, or a region. */
const isFindTarget = (find: unknown) =>
  isObject(find) &&
  ((find.kind === "house" && isBloodline(find.id as string)) ||
    (find.kind === "region" && isRegionId(find.id as string)));

/** The houses and the hunt for them: networks, cases, leads, the section's work. */
function checkHouses(s: GameState) {
  for (const b of BLOODLINES) {
    const n = s.networks[b.id];
    need(
      n &&
        Array.isArray(n.sites) &&
        n.sites.length &&
        n.sites.every(
          (x) =>
            isObject(x) &&
            typeof x.id === "string" &&
            isRegionId(x.regionId) &&
            ["nest", "den", "lair"].includes(x.kind) &&
            typeof x.known === "boolean" &&
            typeof x.raided === "boolean",
        ) &&
        isCount(n.clues) &&
        isCount(n.pages) &&
        isTime(n.nextAssaultAt),
      `network of ${b.name}`,
    );
    need(
      isObject(s.bloodlines[b.id]) &&
        isTime(s.bloodlines[b.id]!.destroyedAt) &&
        isObject(s.bloodlines[b.id]!.strain),
      `war with ${b.name}`,
    );
  }
  for (const x of [...s.operations, ...s.sites])
    need(isBloodline(x.bloodline), `unknown bloodline "${x.bloodline}"`);
  for (const x of s.sites) need(typeof x.netId === "string", "site netId");
  for (const c of s.cases)
    need(
      typeof c.id === "string" &&
        typeof c.real === "boolean" &&
        c.prior > 0 &&
        c.prior < 1 &&
        Array.isArray(c.evidence) &&
        c.evidence.every(
          (e) => isObject(e) && Number.isFinite(e.lr) && e.lr > 0 && typeof e.text === "string",
        ),
      "cases",
    );
  const cases = new Set(s.cases.map((c) => c.id));
  for (const l of s.leads)
    need(
      l.via in PRIOR && cases.has(l.caseId) && (l.asset === undefined || isAssetKind(l.asset)),
      "leads",
    );
  const find = s.section.find;
  need(find === null || isFindTarget(find), "section find");
  num(s.section.findPoints, "section findPoints");
  num(s.section.fixPoints, "section fixPoints");
}

/** Teams in the field, cover-ups and HUMINT assets. */
function checkFieldWork(s: GameState) {
  for (const m of s.missions) {
    need(
      isKitId(m.kit) &&
        ["outbound", "on-site", "returning"].includes(m.phase) &&
        Array.isArray(m.agentIds),
      "missions",
    );
    need(m.escorts === undefined || Array.isArray(m.escorts), "mission escorts");
    need(
      m.wings === undefined ||
        (Array.isArray(m.wings) &&
          m.wings.every(
            (w) => isObject(w) && Array.isArray(w.agentIds) && Number.isFinite(w.arriveAt),
          )),
      "mission wings",
    );
  }
  for (const c of s.coverUps) {
    need(
      isCoverUpTemplate(c.template) &&
        Array.isArray(c.agentIds) &&
        ["coverup", "call", "disinfo"].includes(c.kind) &&
        c.tier in TIER_DIFFICULTY &&
        isObject(c.weights),
      "coverUps",
    );
    for (const k of ["cost", "days", "agents", "gain", "expiresAt", "startedAt", "doneAt"] as const)
      num(c[k], `cover-up ${k}`);
  }
  for (const a of s.assets)
    need(
      isAssetKind(a.kind) && Number.isFinite(a.monthly) && Number.isFinite(a.pos?.lat),
      "assets",
    );
}

/** Research, engineering and the dark web. */
function checkResearchAndMarket(s: GameState) {
  for (const key of ["research", "engineering"] as const)
    need(
      Array.isArray(s[key].done) && s[key].done.every((id) => projectById(id)?.kind === key),
      key,
    );
  for (const p of s.projects) {
    need(isProjectId(p.projectId), `unknown project "${p.projectId}"`);
    num(p.progress, "project progress");
    need(p.count === undefined || isCount(p.count), "project count");
  }
  const mk = s.market;
  need(
    isObject(mk.stock) &&
      Object.entries(mk.stock).every(([k, n]) => isGoodId(k) && Number.isFinite(n)),
    "market stock",
  );
  need(
    isObject(mk.demand) &&
      Object.entries(mk.demand).every(
        ([k, n]) => (k === "artifacts" || isGoodId(k)) && Number.isFinite(n),
      ),
    "market demand",
  );
  need(
    Array.isArray(mk.artifacts) &&
      mk.artifacts.every(
        (a) => typeof a?.name === "string" && Number.isFinite(a.value) && isRegionId(a.regionId),
      ),
    "artifacts",
  );
  need(Array.isArray(mk.found) && mk.found.every((n) => typeof n === "string"), "artifacts found");
  num(mk.earned, "market earned");
  need(
    mk.sold === undefined ||
      (isObject(mk.sold) &&
        Object.entries(mk.sold).every(
          ([k, v]) => isProjectId(k) && Number.isFinite(v?.soldAt) && Number.isFinite(v?.publicAt),
        )),
    "research sold",
  );
}

/** The story: the act, its flags and times. */
function checkStory(s: GameState) {
  const st = s.story;
  need(
    [1, 2, 3].includes(st.act) &&
      typeof st.exposed === "boolean" &&
      typeof st.won === "boolean" &&
      Array.isArray(st.beats),
    "story",
  );
  num(st.fallAt, "story fallAt");
  num(st.dispatches, "story dispatches");
  need(isTime(st.fellAt) && isTime(st.returnedAt) && isTime(st.nextDispatchAt), "story times");
}

/**
 * Loose ends, not damage: play itself leaves references to things that are
 * gone (a lead whose operation is over, a parcel for a lost base, a lead
 * scientist who left) until the next tick clears them. They're dropped.
 */
function settle(s: GameState) {
  const ids = (xs: readonly { id: string }[]) => new Set(xs.map((x) => x.id));
  // With its base go its people, aircraft, parcels and jobs (the Order's research has no base).
  const bases = ids(basesOf(s));
  s.agents = s.agents.filter((a) => bases.has(a.baseId));
  s.staff = s.staff.filter((p) => bases.has(p.baseId));
  s.aircraft = s.aircraft.filter((a) => bases.has(a.baseId));
  if (s.shipments) s.shipments = s.shipments.filter((x) => bases.has(x.toBaseId));
  s.projects = s.projects.filter((p) =>
    projectById(p.projectId)!.kind === "research" && !p.captiveId
      ? p.baseId === ""
      : bases.has(p.baseId),
  );
  // Leads: ours, of the role (a lead engineer, at that base).
  const staffs = (id: string | undefined, role: StaffRole, baseId?: string) =>
    s.staff.some((p) => p.id === id && p.role === role && (!baseId || p.baseId === baseId));
  for (const b of s.installations)
    if (!staffs(b.leadEngineer, "engineer", b.id)) delete b.leadEngineer;
  if (!staffs(s.leadScientist, "scientist")) delete s.leadScientist;
  if (!staffs(s.leadAnalyst, "analyst")) delete s.leadAnalyst;

  // A real lead is about an operation.
  const ops = ids(s.operations);
  const noise = new Set(s.cases.filter((c) => !c.real).map((c) => c.id));
  s.leads = s.leads.filter((l) => ops.has(l.opId ?? "") || noise.has(l.caseId));
  if (!s.leads.some((l) => l.id === s.section.fixing)) s.section.fixing = null;
  const sites = ids(s.sites);
  for (const b of Object.values(s.bloodlines))
    if (b.lairId && !sites.has(b.lairId)) b.lairId = null;

  // Teams: without the dead and the aircraft lost.
  const agents = ids(s.agents),
    craft = ids(s.aircraft);
  s.missions = s.missions.filter((m) => craft.has(m.aircraftId) || isHired(m.aircraftId));
  for (const m of s.missions) {
    m.agentIds = m.agentIds.filter((id) => agents.has(id));
    if (m.escorts) m.escorts = m.escorts.filter((id) => craft.has(id));
    if (m.wings) m.wings = m.wings.filter((w) => craft.has(w.aircraftId) && bases.has(w.baseId));
    for (const w of m.wings ?? [])
      if (w.escorts) w.escorts = w.escorts.filter((id) => craft.has(id));
    // A battle under way that doesn't unpack starts over from its Contact event.
    if (m.battle?.live) {
      try {
        unpackBattle(m.battle.live.battle);
      } catch {
        delete m.battle.live;
      }
    }
  }
  const missions = ids(s.missions);
  for (const x of [...s.leads, ...s.sites])
    if (x.missionId && !missions.has(x.missionId)) x.missionId = null;
  // A running cover-up that lost its agents can't go on.
  for (const c of s.coverUps) c.agentIds = c.agentIds.filter((id) => agents.has(id));
  s.coverUps = s.coverUps.filter((c) => !c.startedAt || c.agentIds.length === c.agents);
  // An event waiting for orders needs its decision or its battle.
  s.events = s.events.filter(
    (e) =>
      (e.kind !== "arrival" || s.missions.some((m) => m.id === e.refId && m.decision)) &&
      (e.kind !== "battle" || s.missions.some((m) => m.id === e.refId && m.battle)),
  );
}
