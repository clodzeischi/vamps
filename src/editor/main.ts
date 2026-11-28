// The block editor (dev tool, `npm run blocks`): makes map blocks
// (docs/design/levels.md) in the battle view itself, page by page in the order a
// level is made: the block's settings, the blockout (floors and their walls),
// the passages (doors, windows, openings, stairs, columns), the dressing
// (props, which are the cover, lamps, markings) and the nodes. What the pointer
// would place is drawn by the game's own renderer before the click; why it
// can't go there shows under the view, as in a battle. Saves JSON in
// src/data/blocks/ through the dev server (scripts/block-files.mjs). Not part
// of the game's build.
//
// Expanding it: tools and pages live in ./tools.ts; the menus for terrains,
// block kinds, fronts, missions and node roles come from
// tactical/map/blocks.ts, skins and furniture from tactical/map/map.ts.
import * as THREE from "three";
import { BattleView } from "../render/battle/BattleView";
import { LEVEL_H, SLAB, TILE } from "../render/battle/scale";
import {
  BLOCK_SIZES,
  BLOCK_TYPE_NAME,
  BLOCK_TYPES,
  blockJson,
  compile,
  edgeIndex,
  emptyLevel,
  fromFile,
  newBlock,
  SIDES,
  TARGETS,
  TERRAIN_NAME,
  TERRAINS,
  type BlockData,
  type BlockMeta,
  type BlockType,
  type Terrain,
} from "../tactical/map/blocks";
import { skinAt, tileAt, T, TILE_INFO, type BattleMap, type Skin } from "../tactical/map/map";
import { edgesOf } from "../gallery/draw";
import { blockIssues, type BlockIssue } from "./checks";
import { AIM, BAD, ERASE, EditorOverlay, OK, type Cursor } from "./overlay";
import {
  allProps,
  chosenProp,
  findProps,
  ROLE_COLOUR,
  STAGES,
  type Cover,
  type Editor,
  type OptionSpec,
  type Pick,
  type PropEntry,
  type Stage,
  type Tool,
} from "./tools";

// ---------------------------------------------------------------------------
// State

interface State extends Editor {
  /** The file this block was loaded from or last saved to (null: never saved). */
  fileId: string | null;
  dirty: boolean;
  stage: Stage;
  tool: Tool | null;
  undo: string[];
  redo: string[];
  hover: Pick | null;
  night: boolean;
  weather: "clear" | "rain" | "snow";
  list: { id: string; name: string; terrains: string[]; type: BlockType; w: number; h: number }[];
}

const DEFAULT_META = (): BlockMeta => ({
  id: "new-block",
  name: "New block",
  notes: "",
  terrains: ["light"],
  type: "structure",
  entrances: ["s"],
  targets: [],
  wallSet: [],
});

function load(key: string): Record<string, string> {
  try {
    return JSON.parse(localStorage.getItem(key) ?? "{}") as Record<string, string>;
  } catch {
    return {};
  }
}
function keep(key: string, v: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(v));
  } catch {
    /* storage blocked: fine */
  }
}
const OPT_KEY = "vamps.blockEditor.opt";
const keepOpt = () => keep(OPT_KEY, st.opt);

const first = newBlock(DEFAULT_META());
const opts = load(OPT_KEY);
const startStage = STAGES.find((s) => s.id === opts["editor.stage"]) ?? STAGES[1]!;
const st: State = {
  data: first,
  map: compile(first),
  z: 0,
  opt: opts,
  fileId: null,
  dirty: false,
  stage: startStage,
  tool: null,
  undo: [],
  redo: [],
  hover: null,
  night: false,
  weather: "clear",
  list: [],
};

// ---------------------------------------------------------------------------
// The page

const app = document.getElementById("app")!;
app.innerHTML = `
<header>
  <b>Block editor</b>
  <select id="open" title="Open a block"></select>
  <button id="new">New</button>
  <button id="dup" title="A copy under a new id, a version of this block">Duplicate</button>
  <button id="save" title="Ctrl+S">Save</button>
  <button id="del" class="danger">Delete</button>
  <span id="title"></span>
  <span class="spacer"></span>
  <button id="undo" title="Ctrl+Z">Undo</button>
  <button id="redo" title="Ctrl+Shift+Z">Redo</button>
  <span class="seg" id="time"></span>
  <span class="seg" id="weather"></span>
</header>
<div class="body">
  <aside class="left" id="left"></aside>
  <div class="viewport">
    <div class="view" id="view"></div>
    <div class="info" id="info"></div>
    <div class="levels" id="levels"></div>
    <div class="say" id="say" hidden></div>
    <div class="hint" id="hint"></div>
  </div>
  <aside class="right"><h3>Checks</h3><div id="issues"></div></aside>
</div>
<nav class="pages" id="pages"></nav>`;
const $ = <E extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as E;

/** A word under the view for a moment (saved, opened, can't). */
let sayTimer = 0;
function message(text: string) {
  const el = $("say");
  el.textContent = text;
  el.hidden = false;
  clearTimeout(sayTimer);
  sayTimer = window.setTimeout(() => (el.hidden = true), 2600);
}

// ---------------------------------------------------------------------------
// Editing: snapshots for undo, and what follows every change

const snapshot = () => JSON.stringify(st.data);
function restore(json: string) {
  st.data = JSON.parse(json) as BlockData;
  st.map = compile(st.data);
  st.z = Math.min(st.z, st.map.levels - 1);
}
/** Before a change: keep the block as it was. */
function begin() {
  st.undo.push(snapshot());
  if (st.undo.length > 200) st.undo.shift();
  st.redo = [];
}
/** After a change. */
function changed() {
  st.dirty = true;
  st.map = compile(st.data);
  shown = null; // changed in place: draw it again
  refresh();
}
function undo() {
  const s = st.undo.pop();
  if (!s) return;
  st.redo.push(snapshot());
  restore(s);
  changed();
  if (st.stage.id === "block") buildLeft();
}
function redo() {
  const s = st.redo.pop();
  if (!s) return;
  st.undo.push(snapshot());
  restore(s);
  changed();
  if (st.stage.id === "block") buildLeft();
}

function setBlock(b: BlockData, fileId: string | null) {
  st.data = b;
  st.map = compile(b);
  st.fileId = fileId;
  st.dirty = false;
  st.undo = [];
  st.redo = [];
  st.z = b.below;
  if (fileId) history.replaceState(null, "", `#${fileId}`);
  placed = false;
  shown = null;
  buildLeft();
  refresh();
}

/** The block with other levels or another size (what fits is kept); `shift` moves the levels up (a basement added below). */
function reshape(w: number, h: number, below: number, levels: number, shift: number) {
  begin();
  const old = st.data;
  const lv = Array.from({ length: levels }, () => emptyLevel(w, h));
  old.lv.forEach((L, z) => {
    const N = lv[z + shift];
    if (!N) return;
    for (let y = 0; y < Math.min(h, old.h); y++)
      for (let x = 0; x < Math.min(w, old.w); x++) {
        N.floor[y * w + x] = L.floor[y * old.w + x]!;
        N.obj[y * w + x] = L.obj[y * old.w + x]!;
        for (const [dx, dy] of [
          [-1, 0],
          [0, -1],
        ] as const) {
          const a = edgeIndex(old.w, x, y, dx, dy),
            b = edgeIndex(w, x, y, dx, dy);
          N[b.list][b.i] = L[a.list][a.i]!;
        }
      }
  });
  const fits = (p: { x: number; y: number; z: number }, pw = 1, ph = 1) =>
    p.x + pw <= w && p.y + ph <= h && p.z + shift >= 0 && p.z + shift < levels;
  st.data = {
    ...old,
    w,
    h,
    below,
    lv,
    furniture: old.furniture
      .filter((f) => fits(f, f.w, f.h))
      .map((f) => ({ ...f, z: f.z + shift })),
    flights: old.flights
      .filter((f) => fits(f, f.w, f.h) && f.z + shift + 1 < levels)
      .map((f) => ({ ...f, z: f.z + shift })),
    lights: old.lights.filter((l) => fits(l)).map((l) => ({ ...l, z: l.z + shift })),
    signs: old.signs.filter((x) => fits(x)).map((x) => ({ ...x, z: x.z + shift })),
    canopies: old.canopies
      .filter((c) => c.x1 < w && c.y1 < h && c.z + shift >= 0 && c.z + shift < levels)
      .map((c) => ({ ...c, z: c.z + shift })),
    vehicles: old.vehicles.filter((v) => fits(v, v.w, v.h)).map((v) => ({ ...v, z: v.z + shift })),
    decor: old.decor
      .filter((d) => d.x <= w && d.y <= h && d.z + shift >= 0 && d.z + shift < levels)
      .map((d) => ({ ...d, z: d.z + shift })),
    bayLines: old.bayLines.filter((l) => l.x < w && l.y < h),
    nodes: old.nodes.filter((n) => fits(n)).map((n) => ({ ...n, z: n.z + shift })),
  };
  st.z = Math.max(0, Math.min(levels - 1, st.z + shift));
  changed();
}

// ---------------------------------------------------------------------------
// Files (through the dev server)

async function fetchList() {
  try {
    const r = await fetch("/__blocks");
    st.list = r.ok ? await r.json() : [];
  } catch {
    st.list = [];
  }
  const sel = $<HTMLSelectElement>("open");
  sel.innerHTML = `<option value="">Open a block… (${st.list.length})</option>`;
  for (const t of [...TERRAINS, ""] as (Terrain | "")[]) {
    const items = st.list.filter((b) =>
      t ? b.terrains?.[0] === t : !TERRAINS.includes(b.terrains?.[0] as never),
    );
    if (!items.length) continue;
    const g = document.createElement("optgroup");
    g.label = t ? TERRAIN_NAME[t] : "No terrain";
    for (const b of items) g.append(new Option(`${b.name} (${b.id}, ${b.w}×${b.h})`, b.id));
    sel.append(g);
  }
  sel.value = st.fileId ?? "";
}

async function openBlock(id: string) {
  if (st.dirty && !confirm("Drop the changes to this block?"))
    return void ($<HTMLSelectElement>("open").value = st.fileId ?? "");
  try {
    const r = await fetch(`/__blocks/${encodeURIComponent(id)}`);
    if (!r.ok) throw new Error((await r.json()).error);
    setBlock(fromFile(await r.json()), id);
    message(`Opened ${id}`);
  } catch (e) {
    message(`Couldn't open ${id}: ${e}`);
  }
}

async function save() {
  const id = st.data.id.trim().toLowerCase();
  if (!/^[a-z0-9][a-z0-9_-]*$/.test(id))
    return message("The id must be lower case letters, digits, - or _");
  st.data.id = id;
  if (
    id !== st.fileId &&
    st.list.some((b) => b.id === id) &&
    !confirm(`There's already a block "${id}". Overwrite it?`)
  )
    return;
  try {
    const r = await fetch(`/__blocks/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: blockJson(st.data),
    });
    if (!r.ok) throw new Error((await r.json()).error);
    st.fileId = id;
    st.dirty = false;
    history.replaceState(null, "", `#${id}`);
    await fetchList();
    refresh();
    message(`Saved src/data/blocks/${id}.json`);
  } catch (e) {
    message(`Couldn't save: ${e}`);
  }
}

async function remove() {
  if (!st.fileId || !confirm(`Delete the block "${st.fileId}" for good?`)) return;
  await fetch(`/__blocks/${st.fileId}`, { method: "DELETE" });
  message(`Deleted ${st.fileId}`);
  setBlock(newBlock(DEFAULT_META()), null);
  history.replaceState(null, "", "#");
  await fetchList();
}

// ---------------------------------------------------------------------------
// Pages and tools

function buildPages() {
  const el = $("pages");
  el.innerHTML = "";
  STAGES.forEach((s, i) => {
    const b = document.createElement("button");
    b.className = s === st.stage ? "on" : "";
    b.innerHTML = `<i>${s.icon}</i><span>${s.name}</span>`;
    b.title = `${s.help} (Shift+${i + 1})`;
    b.onclick = () => pickStage(s);
    el.append(b);
  });
}

function pickStage(s: Stage) {
  st.stage = s;
  st.opt["editor.stage"] = s.id;
  const last = s.tools.find((t) => t.id === st.opt[`editor.tool.${s.id}`]);
  st.tool = last ?? s.tools[0] ?? null;
  keepOpt();
  buildPages();
  buildLeft();
  updateOverlay();
  updateHint();
}

function pickTool(t: Tool) {
  st.tool = t;
  st.opt[`editor.tool.${st.stage.id}`] = t.id;
  keepOpt();
  buildLeft();
  updateOverlay();
  updateHint();
}

/** The left panel: the page's tools and the chosen one's options (the block page: its settings). */
function buildLeft() {
  const el = $("left");
  el.innerHTML = `<h2>${st.stage.icon} ${st.stage.name}</h2><div class="help">${st.stage.help}</div>`;
  if (st.stage.id === "block") {
    el.append(blockForm(), levelsBox());
    return;
  }
  if (st.stage.tools.length > 1) {
    const tools = document.createElement("div");
    tools.className = "tools";
    st.stage.tools.forEach((t, i) => {
      const b = document.createElement("button");
      b.innerHTML = `${t.name} <kbd>${i + 1}</kbd>`;
      b.className = t === st.tool ? "on" : "";
      b.onclick = () => pickTool(t);
      tools.append(b);
    });
    el.append(tools);
  }
  const t = st.tool;
  if (!t) return;
  const opts = document.createElement("section");
  opts.className = "options";
  opts.innerHTML = `<details class="help"><summary>${t.name}: how it works</summary>${t.help}</details>`;
  const specs = t.options(st);
  if (t.id === "props") opts.append(propBrowser());
  for (const o of specs)
    if (!(t.id === "props" && (o.id === "cover" || o.id === "piece")))
      opts.append(optionControl(t, o));
  el.append(opts);
  if (st.stage.id === "blockout") el.append(levelsBox());
}

function optionControl(t: Tool, o: OptionSpec): HTMLElement {
  const key = `${t.id}.${o.id}`;
  const cur = st.opt[key] ?? o.choices[0]?.value;
  const wrap = document.createElement("div");
  wrap.className = "field";
  wrap.innerHTML = `<span>${o.label}</span>`;
  const set = (v: string) => {
    st.opt[key] = v;
    keepOpt();
    buildLeft();
    hovered();
  };
  if (o.choices.some((c) => c.colour)) {
    const sw = document.createElement("div");
    sw.className = "swatches";
    let group: string | undefined;
    for (const c of o.choices) {
      if (c.group && c.group !== group) {
        group = c.group;
        const g = document.createElement("div");
        g.className = "group";
        g.textContent = group;
        sw.append(g);
      }
      const b = document.createElement("button");
      b.className = c.value === cur ? "on" : "";
      b.innerHTML = `<i style="--c:${c.colour ?? "transparent"}"></i>${c.label}`;
      b.onclick = () => set(c.value);
      sw.append(b);
    }
    wrap.append(sw);
  } else if (o.choices.length <= 10) {
    const seg = document.createElement("span");
    seg.className = "seg";
    for (const c of o.choices) {
      const b = document.createElement("button");
      b.className = c.value === cur ? "on" : "";
      b.textContent = c.label;
      b.onclick = () => set(c.value);
      seg.append(b);
    }
    wrap.append(seg);
  } else {
    const sel = document.createElement("select");
    for (const c of o.choices) sel.append(new Option(c.label, c.value, false, c.value === cur));
    sel.onchange = () => set(sel.value);
    wrap.append(sel);
  }
  return wrap;
}

// ---------------------------------------------------------------------------
// The prop browser: every prop, filtered as you type, its cover on each row

const COVER_TAG: Record<Cover, string> = { high: "High", low: "Low", none: "None" };
const COVER_TIP: Record<Cover, string> = {
  high: "High cover: blocks sight and fire; nobody stands there",
  low: "Low cover: half cover, seen and shot over",
  none: "No cover: dressing, walked over and seen through",
};
let propQuery = "";
const PROPS = allProps();

function propBrowser(): HTMLElement {
  const wrap = document.createElement("div");
  wrap.className = "browser";
  const input = document.createElement("input");
  input.type = "search";
  input.id = "propSearch";
  input.placeholder = "Find a prop… ( / )";
  input.value = propQuery;
  const chips = document.createElement("div");
  chips.className = "seg chips";
  const list = document.createElement("div");
  list.className = "plist";
  const filter = () => (st.opt["props.filter"] ?? "all") as Cover | "all";
  let hits: PropEntry[] = [];
  const pick = (h: PropEntry) => {
    st.opt["props.cover"] = h.cover;
    st.opt["props.piece"] = h.value;
    keepOpt();
    const focused = document.activeElement === input;
    buildLeft();
    if (focused) {
      const i = $<HTMLInputElement>("propSearch");
      i.focus();
      i.setSelectionRange(i.value.length, i.value.length);
    }
    hovered();
  };
  const show = () => {
    const f = filter();
    hits = findProps(input.value, PROPS).filter((h) => f === "all" || h.cover === f);
    const chosen = chosenProp(st);
    list.innerHTML = "";
    if (!hits.length) list.innerHTML = `<div class="none">Nothing by that name.</div>`;
    let group = "";
    for (const h of hits) {
      if (h.group && h.group !== group) {
        group = h.group;
        const g = document.createElement("div");
        g.className = "group";
        g.textContent = group;
        list.append(g);
      }
      const b = document.createElement("button");
      b.className = `prow${h.value === chosen && h.cover === st.opt["props.cover"] ? " on" : ""}`;
      b.innerHTML = `<i style="--c:${h.colour ?? "transparent"}"></i><span>${h.label}</span><b class="cov ${h.cover}" title="${COVER_TIP[h.cover]}">${COVER_TAG[h.cover]}</b>`;
      b.onclick = () => pick(h);
      list.append(b);
    }
    list.querySelector(".on")?.scrollIntoView({ block: "nearest" });
  };
  for (const [v, label] of [
    ["all", "All"],
    ["high", "High cover"],
    ["low", "Low cover"],
    ["none", "No cover"],
  ] as const) {
    const b = document.createElement("button");
    b.textContent = label;
    b.className = filter() === v ? "on" : "";
    b.title = v === "all" ? "Every prop" : COVER_TIP[v];
    b.onclick = () => {
      st.opt["props.filter"] = v;
      keepOpt();
      for (const c of chips.children) c.classList.toggle("on", c === b);
      show();
    };
    chips.append(b);
  }
  input.oninput = () => ((propQuery = input.value), show());
  input.onkeydown = (e) => {
    if (e.key === "Enter" && hits[0]) {
      // Picked: back to the view, so the keys are the editor's again.
      input.blur();
      pick(hits[0]);
    } else if (e.key === "Escape") {
      input.value = propQuery = "";
      show();
      input.blur();
    }
  };
  wrap.append(input, chips, list);
  queueMicrotask(show);
  return wrap;
}

// ---------------------------------------------------------------------------
// The block page: its settings, and its levels

function blockForm(): HTMLElement {
  const el = document.createElement("section");
  el.className = "options";
  const field = (label: string, input: HTMLElement) => {
    const f = document.createElement("label");
    f.className = "field";
    f.innerHTML = `<span>${label}</span>`;
    f.append(input);
    el.append(f);
  };
  const text = (k: "id" | "name", label: string) => {
    const i = document.createElement("input");
    i.value = st.data[k];
    i.oninput = () => ((st.data[k] = i.value), (st.dirty = true), refreshTitle());
    field(label, i);
  };
  text("id", "Id (the file name)");
  text("name", "Name");
  {
    // A version of another block: counted with it on a map (blank: a block of its own).
    const i = document.createElement("input");
    i.value = st.data.variantOf ?? "";
    i.placeholder = "blank: a block of its own";
    i.oninput = () => {
      st.data.variantOf = i.value.trim() || undefined;
      st.dirty = true;
      refreshTitle();
    };
    field("Variant of (a block's id)", i);
  }
  const size = document.createElement("select");
  for (const [w, h] of BLOCK_SIZES)
    size.append(
      new Option(`${w} × ${h} tiles`, `${w}x${h}`, false, w === st.map.w && h === st.map.h),
    );
  size.onchange = () => {
    const [w, h] = size.value.split("x").map(Number) as [number, number];
    if (
      (w < st.map.w || h < st.map.h) &&
      !confirm("Shrinking cuts off what's beyond the new size. Go on?")
    )
      return void (size.value = `${st.map.w}x${st.map.h}`);
    reshape(w, h, st.map.ground, st.map.levels, 0);
  };
  field("Size", size);
  const checks = <V extends string>(
    label: string,
    all: readonly V[],
    cur: V[],
    name: (v: V) => string,
    onSet: (v: V[]) => void,
  ) => {
    const box = document.createElement("div");
    box.className = "checks";
    for (const v of all) {
      const l = document.createElement("label");
      const c = document.createElement("input");
      c.type = "checkbox";
      c.checked = cur.includes(v);
      c.onchange = () => {
        begin();
        onSet(all.filter((x) => (x === v ? c.checked : cur.includes(x))));
        changed();
        buildLeft();
      };
      l.append(c, name(v));
      box.append(l);
    }
    field(label, box);
  };
  checks(
    "Terrains (the first sets its look here)",
    TERRAINS,
    st.data.terrains,
    (t) => TERRAIN_NAME[t],
    (v) => (st.data.terrains = v),
  );
  const type = document.createElement("select");
  for (const t of BLOCK_TYPES)
    type.append(new Option(BLOCK_TYPE_NAME[t], t, false, t === st.data.type));
  type.onchange = () => (begin(), (st.data.type = type.value as BlockType), changed(), buildLeft());
  field("Type", type);
  checks(
    "Entrances (south is the front, on the road)",
    SIDES,
    st.data.entrances,
    (k) => ({ n: "North", e: "East", s: "South", w: "West" })[k],
    (v) => (st.data.entrances = v),
  );
  checks(
    "Target for",
    TARGETS,
    st.data.targets,
    (t) => t,
    (v) => (st.data.targets = v),
  );
  const walls: Skin[] = ["brick", "plaster", "clinic", "metal", "stone", "planks"];
  checks(
    "Wall skins a map may swap in",
    walls,
    (st.data.wallSet ?? []) as Skin[],
    (s) => s,
    (v) => (st.data.wallSet = v),
  );
  const notes = document.createElement("textarea");
  notes.value = st.data.notes ?? "";
  notes.oninput = () => ((st.data.notes = notes.value), (st.dirty = true), refreshTitle());
  field("Notes", notes);
  return el;
}

function levelsBox(): HTMLElement {
  const el = document.createElement("section");
  el.className = "options";
  el.innerHTML = `<h3>Levels</h3>`;
  const row = document.createElement("div");
  row.className = "row";
  const btn = (label: string, title: string, f: () => void, danger = false) => {
    const b = document.createElement("button");
    b.textContent = label;
    b.title = title;
    if (danger) b.className = "danger";
    b.onclick = f;
    row.append(b);
  };
  btn("+ above", "Add a level on top", () =>
    reshape(st.map.w, st.map.h, st.map.ground, st.map.levels + 1, 0),
  );
  btn("+ below", "Add a basement below", () =>
    reshape(st.map.w, st.map.h, st.map.ground + 1, st.map.levels + 1, 1),
  );
  btn(
    "− top",
    "Remove the top level",
    () => {
      if (st.map.levels - 1 <= st.map.ground) return message("The street level stays");
      if (confirm(`Remove level ${levelName(st.map.levels - 1)} and everything on it?`))
        reshape(st.map.w, st.map.h, st.map.ground, st.map.levels - 1, 0);
    },
    true,
  );
  btn(
    "− bottom",
    "Remove the lowest level",
    () => {
      if (st.map.ground === 0) return message("There's no basement to remove");
      if (confirm(`Remove level ${levelName(0)} and everything on it?`))
        reshape(st.map.w, st.map.h, st.map.ground - 1, st.map.levels - 1, -1);
    },
    true,
  );
  el.append(row);
  return el;
}

// ---------------------------------------------------------------------------
// Levels, checks, the title

function levelName(z: number) {
  const g = st.map.ground;
  return z < g ? `Basement ${g - z}` : z === g ? "Ground" : `Floor ${z - g + 1}`;
}

/** The levels, top at the top, down the view's right side; the wheel steps through them. */
function buildLevels() {
  const el = $("levels");
  el.innerHTML = "";
  for (let z = st.map.levels - 1; z >= 0; z--) {
    const b = document.createElement("button");
    b.textContent = levelName(z);
    b.className = z === st.z ? "on" : "";
    b.onclick = () => setLevel(z);
    el.append(b);
  }
}

function setLevel(z: number) {
  st.z = Math.max(0, Math.min(st.map.levels - 1, z));
  buildLevels();
  view?.setLevel(st.z);
  hovered();
}

function refreshTitle() {
  $("title").innerHTML =
    `${st.data.name} <span class="dim">${st.fileId ? `src/data/blocks/${st.fileId}.json` : "not saved yet"}</span>${st.dirty ? ' <span class="dirty">●</span>' : ""}`;
}

let issues: BlockIssue[] = [];
function refresh() {
  issues = blockIssues(st.map, st.data, st.data.nodes);
  const el = $("issues");
  el.innerHTML = "";
  if (!issues.length) el.innerHTML = '<span class="ok">No problems found.</span>';
  else {
    const ul = document.createElement("ul");
    ul.className = "issues";
    for (const i of issues) {
      const li = document.createElement("li");
      li.innerHTML =
        i.z !== undefined
          ? `<span class="dim">${levelName(i.z)} (${i.x}, ${i.y})</span> ${i.text}`
          : i.text;
      if (i.z !== undefined)
        li.onclick = () => {
          setLevel(i.z!);
          view?.input.focus({ x: i.x!, y: i.y!, z: i.z! });
        };
      ul.append(li);
    }
    el.append(ul);
  }
  buildLevels();
  refreshTitle();
  hovered();
}

// ---------------------------------------------------------------------------
// The view: the battle view, drawing the block (and what the pointer would do to it)

let view: BattleView | null = null;
let overlay: EditorOverlay | null = null;
try {
  view = new BattleView($("view"));
  overlay = new EditorOverlay(view.scene);
  // The skirmish camera: right-drag pans, middle-drag turns, WASD pans, Q / E turn, the wheel steps a level.
  view.onLevelStep = (d) => setLevel(st.z + d);
} catch (e) {
  $("view").innerHTML = `<div style="padding:40px;color:var(--dim)">No 3D view: ${e}</div>`;
}

let placed = false;
let shown: BlockData | null = null;
let pending: BlockData | null = null;
/** Draws this version of the block next frame (one draw a frame, the latest wins). */
function show(d: BlockData) {
  if (!view || d === shown) return;
  const later = pending;
  pending = d;
  if (later) return;
  requestAnimationFrame(() => {
    const b = pending!;
    pending = null;
    shown = b;
    const m: BattleMap = b === st.data ? st.map : compile(b);
    // The battle view looks at a landing zone: the middle of the street level, not drawn.
    m.lz = [{ x: Math.floor(m.w / 2), y: Math.floor(m.h / 2), z: m.ground }];
    m.rain = st.weather === "rain";
    m.winter = st.weather === "snow";
    view!.setMap(m, placed);
    placed = true;
    view!.showLandingZone(false);
    view!.setDaylight(st.night);
    view!.setLevel(st.z);
  });
}

/** The block with what a click here would do: what's drawn while the pointer rests. */
function proposed(): BlockData {
  const t = st.tool,
    p = st.hover;
  if (!t || !p || stroke || rightDown || t.id === "nodes") return st.data;
  const g = t.ghost?.(st, p);
  if (g && !g.ok) return st.data;
  const copy = structuredClone(st.data);
  t.apply({ ...st, data: copy }, p, false, true);
  return JSON.stringify(copy) === snapshot() ? st.data : copy;
}

/** Everything that follows the pointer moving, the level or the block changing. */
function hovered() {
  show(proposed());
  updateOverlay();
  updateHint();
  updateInfo();
}

function updateOverlay() {
  if (!overlay) return;
  overlay.setGrid(st.map.w, st.map.h, st.z);
  overlay.setMarks({
    z: st.z,
    ground: st.map.ground,
    w: st.map.w,
    h: st.map.h,
    issues: issues.filter((i) => i.z === st.z && i.x !== undefined) as { x: number; y: number }[],
    nodes: st.stage.id === "nodes" || st.stage.id === "block" ? st.data.nodes : null,
    roleColour: ROLE_COLOUR,
    entrances: st.stage.id === "block" || st.stage.id === "blockout" ? st.data.entrances : null,
  });
  overlay.setCursor(cursor(), st.z);
}

/** What the pointer shows: a tile, a wall, a rectangle being dragged, or the footprint of what would go down. */
function cursor(): Cursor | null {
  const p = st.hover,
    t = st.tool;
  if (!p || !t) return null;
  if (stroke?.rect) {
    return {
      kind: "rect",
      x0: Math.min(stroke.rect.x, p.x),
      y0: Math.min(stroke.rect.y, p.y),
      x1: Math.max(stroke.rect.x, p.x),
      y1: Math.max(stroke.rect.y, p.y),
      colour: stroke.erase ? ERASE : AIM,
    };
  }
  const erasing = !!rightDown;
  if (t.target(st) === "edge")
    return { kind: "edge", x: p.x, y: p.y, dx: p.dx, dy: p.dy, colour: erasing ? ERASE : AIM };
  const g = erasing ? null : t.ghost?.(st, p);
  if (g?.point) return { kind: "point", x: g.x, y: g.y, colour: g.ok ? OK : BAD };
  if (g)
    return {
      kind: "footprint",
      x: g.x,
      y: g.y,
      w: g.w,
      h: g.h,
      dx: g.dx,
      dy: g.dy,
      colour: g.ok ? OK : BAD,
    };
  return { kind: "tile", x: p.x, y: p.y, colour: erasing ? ERASE : AIM };
}

/** Under the view, as in a battle: why it can't go there, else what's wrong here, else what the mouse does. */
function updateHint() {
  const el = $("hint");
  const t = st.tool,
    p = st.hover;
  const g = t && p && !rightDown && !stroke ? t.ghost?.(st, p) : null;
  const here = p ? issues.filter((i) => i.z === st.z && i.x === p.x && i.y === p.y) : [];
  el.className = "hint";
  if (g && !g.ok) {
    el.classList.add("bad");
    el.textContent = g.why ?? "It can't go there";
  } else if (here.length) {
    el.classList.add("warn");
    el.textContent = [...new Set(here.map((i) => i.text))].join(" · ");
  } else el.textContent = t ? t.how : st.stage.help;
}

function updateInfo() {
  const p = st.hover;
  if (!p) return void ($("info").textContent = levelName(st.z));
  const t = tileAt(st.map, p.x, p.y, st.z);
  $("info").textContent =
    `${levelName(st.z)} (${p.x}, ${p.y}) ${TILE_INFO[t].name}${t === T.VOID ? "" : ` · ${skinAt(st.map, p.x, p.y, st.z)}`}  ${edgesOf(st.map, p.x, p.y, st.z)}`;
}

// ---------------------------------------------------------------------------
// The pointer in the view

interface Stroke {
  erase: boolean;
  key: string;
  axis: "h" | "v" | null;
  rect: { x: number; y: number } | null;
}
let stroke: Stroke | null = null;
/** A right press: a click erases; a drag pans (shift-drag: a rectangle erased). */
let rightDown: { x: number; y: number } | null = null;

const ray = new THREE.Raycaster();
/** The tile under the pointer on the level being edited (floor or not) and the nearest edge of it. */
function pickAt(e: PointerEvent): Pick | null {
  if (!view) return null;
  const el = view.renderer.domElement;
  const r = el.getBoundingClientRect();
  ray.setFromCamera(
    new THREE.Vector2(
      ((e.clientX - r.left) / r.width) * 2 - 1,
      -((e.clientY - r.top) / r.height) * 2 + 1,
    ),
    view.camera,
  );
  const hit = new THREE.Vector3();
  const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -(st.z * LEVEL_H + SLAB));
  if (!ray.ray.intersectPlane(plane, hit)) return null;
  const fx = hit.x / TILE,
    fy = hit.z / TILE;
  const x = Math.floor(fx),
    y = Math.floor(fy);
  if (x < 0 || y < 0 || x >= st.map.w || y >= st.map.h) return null;
  const u = fx - x,
    v = fy - y;
  const axis = stroke?.axis ?? null;
  const horizontal = axis ? axis === "h" : Math.min(v, 1 - v) < Math.min(u, 1 - u);
  const cx = Math.round(fx),
    cy = Math.round(fy);
  return horizontal
    ? { x, y, dx: 0, dy: v < 0.5 ? -1 : 1, cx, cy }
    : { x, y, dx: u < 0.5 ? -1 : 1, dy: 0, cx, cy };
}

const keyOf = (p: Pick, edge: boolean) =>
  edge
    ? `${p.x + Math.max(p.dx, 0)},${p.y + Math.max(p.dy, 0)},${p.dx ? "v" : "h"}`
    : `${p.x},${p.y}`;

const samePick = (a: Pick | null, b: Pick | null) =>
  a === b ||
  (!!a &&
    !!b &&
    a.x === b.x &&
    a.y === b.y &&
    a.dx === b.dx &&
    a.dy === b.dy &&
    a.cx === b.cx &&
    a.cy === b.cy);

function onDown(e: PointerEvent) {
  const t = st.tool;
  if (!t || !view) return;
  const p = pickAt(e);
  if (e.button === 2) {
    rightDown = { x: e.clientX, y: e.clientY };
    // Shift-right-drag: a rectangle erased (the camera doesn't pan).
    if (e.shiftKey && t.rect && p) {
      view.controls.enabled = false;
      begin();
      stroke = { erase: true, key: "", axis: null, rect: { x: p.x, y: p.y } };
    }
    hovered();
    return;
  }
  if (e.button !== 0 || !p) return;
  if (e.altKey && t.sample) {
    t.sample(st, p);
    keepOpt();
    buildLeft();
    hovered();
    return;
  }
  view.renderer.domElement.setPointerCapture(e.pointerId);
  const edge = t.target(st) === "edge";
  begin();
  stroke = {
    erase: false,
    key: keyOf(p, edge),
    axis: edge ? (p.dx ? "v" : "h") : null,
    rect: e.shiftKey && t.rect ? { x: p.x, y: p.y } : null,
  };
  if (!stroke.rect) {
    t.apply(st, p, false, true);
    changed();
  } else hovered();
}

function onMove(e: PointerEvent) {
  const p = pickAt(e);
  const t = st.tool;
  if (stroke && p && t && !stroke.rect) {
    const k = keyOf(p, t.target(st) === "edge");
    if (k !== stroke.key) {
      stroke.key = k;
      st.hover = p;
      t.apply(st, p, stroke.erase, false);
      changed();
      return;
    }
  }
  if (samePick(p, st.hover)) return;
  st.hover = p;
  hovered();
}

function onUp(e: PointerEvent) {
  const t = st.tool;
  const p = pickAt(e) ?? st.hover;
  if (stroke?.rect && p && t?.rect) {
    t.rect(
      st,
      Math.min(stroke.rect.x, p.x),
      Math.min(stroke.rect.y, p.y),
      Math.max(stroke.rect.x, p.x),
      Math.max(stroke.rect.y, p.y),
      stroke.erase,
    );
    stroke = null;
    changed();
  } else if (e.button === 2 && rightDown && !stroke && t && p) {
    // A right click (not a pan): take away what's here.
    if (Math.hypot(e.clientX - rightDown.x, e.clientY - rightDown.y) < 5) {
      begin();
      t.apply(st, p, true, true);
      changed();
    }
  }
  if (e.button === 2) rightDown = null;
  stroke = null;
  if (view) view.controls.enabled = true;
  hovered();
}

if (view) {
  // Captured on the way down, so a shift-right-drag can stop the camera's pan before it starts.
  const host = $("view");
  host.addEventListener("pointerdown", onDown, { capture: true });
  host.addEventListener("pointermove", onMove);
  window.addEventListener("pointerup", onUp);
  host.addEventListener("pointerleave", () => {
    if (stroke) return;
    st.hover = null;
    hovered();
  });
}

window.addEventListener("keydown", (e) => {
  const tag = (e.target as HTMLElement)?.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
  const mod = e.metaKey || e.ctrlKey;
  if (mod && e.code === "KeyS") return (e.preventDefault(), void save());
  if (mod && e.code === "KeyZ") return (e.preventDefault(), e.shiftKey ? redo() : undo());
  if (mod && e.code === "KeyY") return (e.preventDefault(), redo());
  if (mod) return;
  const digit = /^Digit([1-9])$/.exec(e.code)?.[1];
  if (digit && e.shiftKey) {
    const s = STAGES[Number(digit) - 1];
    if (s) pickStage(s);
    return;
  }
  if (digit) {
    const t = st.stage.tools[Number(digit) - 1];
    if (t) pickTool(t);
    return;
  }
  if (e.key === "/") {
    // Find a prop: to the dressing page's props, into its search.
    e.preventDefault();
    const dressing = STAGES.find((s) => s.id === "dressing")!;
    if (st.stage !== dressing) pickStage(dressing);
    const props = dressing.tools.find((t) => t.id === "props");
    if (props && st.tool !== props) pickTool(props);
    $<HTMLInputElement>("propSearch")?.focus();
    return;
  }
  if (e.code === "BracketRight" || e.code === "PageUp") return setLevel(st.z + 1);
  if (e.code === "BracketLeft" || e.code === "PageDown") return setLevel(st.z - 1);
  const t = st.tool;
  if (!t) return;
  // T over something placed turns it; elsewhere it turns the way for the next one.
  if (e.code === "KeyT" && st.hover && t.turnAt) {
    begin();
    if (t.turnAt(st, st.hover)) return changed();
    st.undo.pop();
  }
  if (t.onKey?.(st, e.code)) {
    keepOpt();
    buildLeft();
    hovered();
  }
});
window.addEventListener("beforeunload", (e) => {
  if (st.dirty) e.preventDefault();
});

// ---------------------------------------------------------------------------
// Header: files, undo, the light and the weather

function buildLookBar() {
  const seg = (id: string, items: [string, string][], cur: string, onPick: (v: string) => void) => {
    const el = $(id);
    el.innerHTML = "";
    for (const [v, label] of items) {
      const b = document.createElement("button");
      b.textContent = label;
      b.className = v === cur ? "on" : "";
      b.onclick = () => (onPick(v), buildLookBar());
      el.append(b);
    }
  };
  seg(
    "time",
    [
      ["day", "Day"],
      ["night", "Night"],
    ],
    st.night ? "night" : "day",
    (v) => ((st.night = v === "night"), view?.setDaylight(st.night)),
  );
  seg(
    "weather",
    [
      ["clear", "Clear"],
      ["rain", "Rain"],
      ["snow", "Snow"],
    ],
    st.weather,
    (v) => {
      st.weather = v as State["weather"];
      shown = null;
      show(proposed());
    },
  );
}

$("open").onchange = (e) => {
  const id = (e.target as HTMLSelectElement).value;
  if (id) void openBlock(id);
};
$("new").onclick = () => {
  if (st.dirty && !confirm("Drop the changes to this block?")) return;
  setBlock(newBlock(DEFAULT_META()), null);
  history.replaceState(null, "", "#");
};
$("dup").onclick = () => {
  // A copy is a version of the same block (counted with it on a map) until told otherwise.
  st.data.variantOf = st.data.variantOf || st.data.id;
  st.data.id = `${st.data.id}-copy`;
  st.data.name = `${st.data.name} (copy)`;
  st.fileId = null;
  st.dirty = true;
  buildLeft();
  refresh();
};
$("save").onclick = () => void save();
$("del").onclick = () => void remove();
$("undo").onclick = undo;
$("redo").onclick = redo;

// Dev only: the editor's state, for browser checks.
if (import.meta.env.DEV) (window as unknown as { editor?: State }).editor = st;

st.z = st.map.ground;
buildPages();
pickStage(st.stage);
buildLookBar();
refresh();
void fetchList().then(() => {
  const id = decodeURIComponent(location.hash.slice(1));
  if (id) void openBlock(id);
});
