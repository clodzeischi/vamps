// The block editor (dev tool, `npm run blocks`): draws map blocks
// (docs/design/levels.md) level by level on a grid, with the battle view's
// 3D preview beside it, and saves them as JSON in src/data/blocks/ through
// the dev server (scripts/block-files.mjs). Not part of the game's build.
//
// Expanding it: tools live in ./tools.ts (one entry each); the menus for
// terrains, block kinds, fronts, missions and node roles come from
// tactical/blocks.ts, skins and furniture from tactical/map.ts.
import { BattleView } from "../render/BattleView";
import {
  BLOCK, BLOCK_SIZES, BLOCK_TYPE_NAME, BLOCK_TYPES, DEFAULT_LINKS, LINK_NAME, LINKS, blockJson, compile, edgeIndex, emptyLevel, fromFile, newBlock, SIDES, TARGETS, TERRAIN_NAME, TERRAINS,
  type BlockData, type BlockMeta, type BlockType, type Link, type Side, type Terrain,
} from "../tactical/blocks";
import { skinAt, tileAt, T, TILE_INFO, type BattleMap, type Skin } from "../tactical/map";
import { drawLevel, edgesOf } from "../gallery/draw";
import { blockIssues, type BlockIssue } from "./checks";
import { ROLE_COLOUR, TOOLS, type Editor, type Pick, type Tool, type OptionSpec } from "./tools";

// ---------------------------------------------------------------------------
// State

interface State extends Editor {
  /** The file this block was loaded from or last saved to (null: never saved). */
  fileId: string | null;
  dirty: boolean;
  tool: Tool;
  undo: string[];
  redo: string[];
  hover: Pick | null;
  night: boolean;
  weather: "clear" | "rain" | "snow";
  list: { id: string; name: string; terrains: string[]; type: BlockType; links: Record<Side, Link[]> | null; w: number; h: number }[];
}

const DEFAULT_META = (): BlockMeta => ({ id: "new-block", name: "New block", notes: "", terrains: ["light"], type: "structure", links: DEFAULT_LINKS(), targets: [], wallSet: [] });

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

const first = newBlock(DEFAULT_META());
const st: State = {
  data: first, map: compile(first), z: 0, opt: load("vamps.blockEditor.opt"), fileId: null, dirty: false,
  tool: TOOLS[0]!, undo: [], redo: [], hover: null, night: false, weather: "clear", list: [],
};

// ---------------------------------------------------------------------------
// The page

const app = document.getElementById("app")!;
app.innerHTML = `
<header>
  <b>Block editor</b>
  <select id="open" title="Open a block"></select>
  <button id="new">New</button>
  <button id="dup" title="A copy under a new id">Duplicate</button>
  <button id="save" title="Ctrl+S">Save</button>
  <button id="del" class="danger">Delete</button>
  <span id="title"></span>
  <span class="spacer"></span>
  <span>Level</span><span class="seg" id="levels"></span>
  <button id="addUp" title="Add a level on top">+ above</button>
  <button id="addDown" title="Add a basement below">+ below</button>
  <button id="cutUp" class="danger" title="Remove the top level">− top</button>
  <button id="cutDown" class="danger" title="Remove the lowest level">− bottom</button>
  <button id="undo" title="Ctrl+Z">Undo</button>
  <button id="redo" title="Ctrl+Shift+Z">Redo</button>
</header>
<div class="body">
  <aside>
    <section><h3>Tools</h3><div class="tools" id="tools"></div></section>
    <section id="options"></section>
    <section><h3>Block</h3><div id="meta"></div></section>
  </aside>
  <main>
    <canvas id="grid"></canvas>
    <div class="info" id="info"></div>
    <div id="issues"></div>
  </main>
  <div class="preview">
    <div class="bar">
      <span class="seg" id="time"></span>
      <span class="seg" id="weather"></span>
    </div>
    <div class="view" id="view"></div>
  </div>
</div>`;
const $ = <E extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as E;
const canvas = $<HTMLCanvasElement>("grid");
const ctx = canvas.getContext("2d")!;

function message(text: string) {
  const el = document.createElement("div");
  el.className = "msg";
  el.textContent = text;
  document.body.append(el);
  setTimeout(() => el.remove(), 2600);
}

// ---------------------------------------------------------------------------
// Editing: snapshots for undo, and what follows every change

const snapshot = () => JSON.stringify(st.data);
function restore(json: string) {
  st.data = JSON.parse(json) as BlockData;
  st.map = compile(st.data);
  st.z = Math.min(st.z, st.map.levels - 1);
  buildMeta();
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
  refresh();
  schedulePreview();
}
function undo() {
  const s = st.undo.pop();
  if (!s) return;
  st.redo.push(snapshot());
  restore(s);
  changed();
}
function redo() {
  const s = st.redo.pop();
  if (!s) return;
  st.undo.push(snapshot());
  restore(s);
  changed();
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
  buildMeta();
  refresh();
  schedulePreview(true);
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
        for (const [dx, dy] of [[-1, 0], [0, -1]] as const) {
          const a = edgeIndex(old.w, x, y, dx, dy), b = edgeIndex(w, x, y, dx, dy);
          N[b.list][b.i] = L[a.list][a.i]!;
        }
      }
  });
  const fits = (p: { x: number; y: number; z: number }, pw = 1, ph = 1) => p.x + pw <= w && p.y + ph <= h && p.z + shift >= 0 && p.z + shift < levels;
  st.data = {
    ...old, w, h, below, lv,
    furniture: old.furniture.filter((f) => fits(f, f.w, f.h)).map((f) => ({ ...f, z: f.z + shift })),
    lights: old.lights.filter((l) => fits(l)).map((l) => ({ ...l, z: l.z + shift })),
    signs: old.signs.filter((x) => fits(x)).map((x) => ({ ...x, z: x.z + shift })),
    canopies: old.canopies.filter((c) => c.x1 < w && c.y1 < h && c.z + shift >= 0 && c.z + shift < levels).map((c) => ({ ...c, z: c.z + shift })),
    vehicles: old.vehicles.filter((v) => fits(v, v.w, v.h)).map((v) => ({ ...v, z: v.z + shift })),
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
    const items = st.list.filter((b) => (t ? b.terrains?.[0] === t : !TERRAINS.includes(b.terrains?.[0] as never)));
    if (!items.length) continue;
    const g = document.createElement("optgroup");
    g.label = t ? TERRAIN_NAME[t] : "No terrain";
    for (const b of items) g.append(new Option(`${b.name} (${b.id}, ${b.w}×${b.h})`, b.id));
    sel.append(g);
  }
  sel.value = st.fileId ?? "";
}

async function openBlock(id: string) {
  if (st.dirty && !confirm("Drop the changes to this block?")) return void ($<HTMLSelectElement>("open").value = st.fileId ?? "");
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
  if (!/^[a-z0-9][a-z0-9_-]*$/.test(id)) return message("The id must be lower case letters, digits, - or _");
  st.data.id = id;
  if (id !== st.fileId && st.list.some((b) => b.id === id) && !confirm(`There's already a block "${id}". Overwrite it?`)) return;
  try {
    const r = await fetch(`/__blocks/${id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: blockJson(st.data) });
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
// Panels

function buildTools() {
  const el = $("tools");
  el.innerHTML = "";
  for (const t of TOOLS) {
    const b = document.createElement("button");
    b.innerHTML = `${t.name} <kbd>${t.key.replace("Digit", "").replace("Key", "")}</kbd>`;
    b.className = t === st.tool ? "on" : "";
    b.onclick = () => pickTool(t);
    el.append(b);
  }
}

function pickTool(t: Tool) {
  st.tool = t;
  buildTools();
  buildOptions();
  draw();
}

function buildOptions() {
  const el = $("options");
  el.innerHTML = `<h3>${st.tool.name}</h3><div class="help">${st.tool.help}</div>`;
  for (const o of st.tool.options(st)) el.append(optionControl(o));
}

function optionControl(o: OptionSpec): HTMLElement {
  const key = `${st.tool.id}.${o.id}`;
  const cur = st.opt[key] ?? o.choices[0]?.value;
  const wrap = document.createElement("div");
  wrap.className = "field";
  wrap.innerHTML = `<span>${o.label}</span>`;
  const set = (v: string) => {
    st.opt[key] = v;
    keep("vamps.blockEditor.opt", st.opt);
    buildOptions();
    draw();
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
  } else if (o.choices.length <= 5) {
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

/** The block's settings: id, name, size, terrains, kind, fronts, missions, wall swaps, notes. */
function buildMeta() {
  const el = $("meta");
  el.innerHTML = "";
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
  const size = document.createElement("select");
  for (const [w, h] of BLOCK_SIZES) size.append(new Option(`${w} × ${h} tiles`, `${w}x${h}`, false, w === st.map.w && h === st.map.h));
  size.onchange = () => {
    const [w, h] = size.value.split("x").map(Number) as [number, number];
    if ((w < st.map.w || h < st.map.h) && !confirm("Shrinking cuts off what's beyond the new size. Go on?")) return void (size.value = `${st.map.w}x${st.map.h}`);
    reshape(w, h, st.map.ground, st.map.levels, 0);
  };
  field("Size", size);
  const checks = <V extends string>(label: string, all: readonly V[], cur: V[], name: (v: V) => string, onSet: (v: V[]) => void) => {
    const box = document.createElement("div");
    box.className = "checks";
    for (const v of all) {
      const l = document.createElement("label");
      const c = document.createElement("input");
      c.type = "checkbox";
      c.checked = cur.includes(v);
      c.onchange = () => {
        onSet(all.filter((x) => (x === v ? c.checked : cur.includes(x))));
        changed();
        buildMeta();
      };
      l.append(c, name(v));
      box.append(l);
    }
    field(label, box);
  };
  checks("Terrains (the first sets its look here)", TERRAINS, st.data.terrains, (t) => TERRAIN_NAME[t], (v) => (st.data.terrains = v));
  const type = document.createElement("select");
  for (const t of BLOCK_TYPES) type.append(new Option(BLOCK_TYPE_NAME[t], t, false, t === st.data.type));
  type.onchange = () => ((st.data.type = type.value as BlockType), changed());
  field("Type", type);
  // What may stand on each side: a grid of sides against types (and the map's edge).
  const grid = document.createElement("table");
  grid.className = "links";
  grid.innerHTML = `<tr><th></th>${LINKS.map((l) => `<th title="${LINK_NAME[l]}">${LINK_NAME[l].replace(" ground", "").replace("Map ", "")}</th>`).join("")}</tr>`;
  for (const side of SIDES) {
    const tr = document.createElement("tr");
    tr.innerHTML = `<td>${{ n: "North", e: "East", s: "South", w: "West" }[side]}</td>`;
    for (const l of LINKS) {
      const td = document.createElement("td"), c = document.createElement("input");
      c.type = "checkbox";
      c.checked = st.data.links[side].includes(l);
      c.onchange = () => {
        st.data.links[side] = LINKS.filter((x) => (x === l ? c.checked : st.data.links[side].includes(x)));
        changed();
      };
      td.append(c);
      tr.append(td);
    }
    grid.append(tr);
  }
  field("Next to it, side by side (both blocks must agree)", grid);
  checks("Target for", TARGETS, st.data.targets, (t) => t, (v) => (st.data.targets = v));
  const walls: Skin[] = ["brick", "plaster", "clinic", "metal", "stone", "planks"];
  checks("Wall skins a map may swap in", walls, (st.data.wallSet ?? []) as Skin[], (s) => s, (v) => (st.data.wallSet = v));
  const notes = document.createElement("textarea");
  notes.value = st.data.notes ?? "";
  notes.oninput = () => ((st.data.notes = notes.value), (st.dirty = true), refreshTitle());
  field("Notes", notes);
}

function levelName(z: number) {
  const g = st.map.ground;
  return z < g ? `Basement ${g - z}` : z === g ? "Ground" : `Floor ${z - g + 1}`;
}

function buildLevels() {
  const el = $("levels");
  el.innerHTML = "";
  for (let z = 0; z < st.map.levels; z++) {
    const b = document.createElement("button");
    b.textContent = levelName(z);
    b.className = z === st.z ? "on" : "";
    b.onclick = () => setLevel(z);
    el.append(b);
  }
}

function setLevel(z: number) {
  st.z = Math.max(0, Math.min(st.map.levels - 1, z));
  refresh();
  view?.setLevel(st.z);
}

function refreshTitle() {
  $("title").innerHTML = `${st.data.name} <span style="color:var(--dim)">${st.fileId ? `src/data/blocks/${st.fileId}.json` : "not saved yet"}</span>${st.dirty ? ' <span class="dirty">●</span>' : ""}`;
}

let issues: BlockIssue[] = [];
function refresh() {
  issues = blockIssues(st.map, st.data, st.data.nodes, st.list.map((b) => ({ id: b.id, type: b.type, links: b.links })));
  const el = $("issues");
  el.innerHTML = "";
  if (!issues.length) el.innerHTML = '<span class="ok">No problems found.</span>';
  else {
    const ul = document.createElement("ul");
    ul.className = "issues";
    for (const i of issues) {
      const li = document.createElement("li");
      li.textContent = i.z !== undefined ? `${levelName(i.z)} (${i.x}, ${i.y}): ${i.text}` : i.text;
      if (i.z !== undefined) li.onclick = () => setLevel(i.z!);
      ul.append(li);
    }
    el.append(ul);
  }
  buildLevels();
  refreshTitle();
  draw();
}

// ---------------------------------------------------------------------------
// The grid

let S = 32;
function sizeCanvas() {
  const room = Math.min(window.innerHeight - 190, window.innerWidth - 300 - 520);
  S = Math.max(14, Math.min(44, Math.floor(room / Math.max(st.map.w, st.map.h))));
  canvas.width = st.map.w * S;
  canvas.height = st.map.h * S;
}

const LINK_COLOUR: Record<Link, string> = { corridor: "#9aa0a8", structure: "#c0603c", open: "#5fb060", void: "#000" };

function draw() {
  const m = st.map;
  if (canvas.width !== m.w * S || canvas.height !== m.h * S) sizeCanvas();
  drawLevel(ctx, m, st.z, S, { lights: true, lz: false, spawns: false, issues: true, grid: true }, issues.filter((i) => i.z !== undefined).map((i) => ({ x: i.x!, y: i.y!, z: i.z!, text: i.text })));
  // Block lines every 10 tiles, for the big blocks.
  ctx.strokeStyle = "rgba(240,184,72,0.35)";
  ctx.lineWidth = 1;
  for (let x = BLOCK; x < m.w; x += BLOCK) ctx.strokeRect(x * S + 0.5, 0, 0, m.h * S);
  for (let y = BLOCK; y < m.h; y += BLOCK) ctx.strokeRect(0, y * S + 0.5, m.w * S, 0);
  // Each side: a strip in the colours of what may stand there.
  for (const side of SIDES) {
    const ls = st.data.links[side];
    const horiz = side === "n" || side === "s", len = (horiz ? m.w : m.h) * S, seg = len / Math.max(1, ls.length);
    ls.forEach((l, k) => {
      ctx.fillStyle = LINK_COLOUR[l];
      const t = 4, off = k * seg;
      if (horiz) ctx.fillRect(off, side === "n" ? 0 : m.h * S - t, seg, t);
      else ctx.fillRect(side === "w" ? 0 : m.w * S - t, off, t, seg);
    });
  }
  // "No wall" exceptions: a dashed line where a wall would have been.
  const L = st.data.lv[st.z]!;
  ctx.strokeStyle = "rgba(240,184,72,0.7)";
  ctx.lineWidth = 2;
  ctx.setLineDash([4, 4]);
  ctx.beginPath();
  for (let y = 0; y <= m.h; y++)
    for (let x = 0; x <= m.w; x++) {
      if (y < m.h && L.ew[y * (m.w + 1) + x] === "open") ctx.moveTo(x * S, y * S + 3), ctx.lineTo(x * S, (y + 1) * S - 3);
      if (x < m.w && L.ns[y * m.w + x] === "open") ctx.moveTo(x * S + 3, y * S), ctx.lineTo((x + 1) * S - 3, y * S);
    }
  ctx.stroke();
  ctx.setLineDash([]);
  // Furniture: its outline and which way it faces.
  for (const f of m.furniture) if (f.z === st.z) footprint(f.x, f.y, f.w, f.h, f.dx, f.dy, "#f0e0c0", f.kind);
  // Lamps by kind.
  for (const l of m.lights) {
    if (l.z !== st.z) continue;
    ctx.fillStyle = "#ffe08a";
    if (l.wall) ctx.fillRect((l.x + 0.5 + l.wall[0] * 0.42) * S - 4, (l.y + 0.5 + l.wall[1] * 0.42) * S - 4, 8, 8);
    else if (l.ceiling) ctx.strokeStyle = "#ffe08a", ctx.lineWidth = 2, ctx.strokeRect((l.x + 0.3) * S, (l.y + 0.3) * S, S * 0.4, S * 0.4);
  }
  // Nodes.
  ctx.font = `bold ${Math.max(9, S * 0.34)}px system-ui`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  for (const n of st.data.nodes) {
    if (n.z !== st.z) continue;
    const cx = (n.x + 0.5) * S, cy = (n.y + 0.5) * S;
    ctx.fillStyle = ROLE_COLOUR[n.role] ?? "#fff";
    ctx.beginPath();
    ctx.arc(cx, cy, S * 0.3, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#111";
    ctx.fillText(n.role[0]!.toUpperCase(), cx, cy + 1);
  }
  // The pointer: a tile, an edge, a rectangle, a ghost.
  const p = st.hover;
  if (!p) return;
  if (stroke?.rect) {
    const x0 = Math.min(stroke.rect.x, p.x), y0 = Math.min(stroke.rect.y, p.y), x1 = Math.max(stroke.rect.x, p.x), y1 = Math.max(stroke.rect.y, p.y);
    ctx.strokeStyle = stroke.erase ? "#ff6b5b" : "#f0b848";
    ctx.lineWidth = 2;
    ctx.strokeRect(x0 * S, y0 * S, (x1 - x0 + 1) * S, (y1 - y0 + 1) * S);
    return;
  }
  const g = st.tool.ghost?.(st, p);
  if (g) return footprint(g.x, g.y, g.w, g.h, g.dx, g.dy, g.ok ? "#7ad08a" : "#ff6b5b", "");
  ctx.strokeStyle = "#f0b848";
  ctx.lineWidth = 3;
  if (st.tool.target(st) === "edge") {
    ctx.beginPath();
    const x = p.x + (p.dx > 0 ? 1 : 0), y = p.y + (p.dy > 0 ? 1 : 0);
    if (p.dx) ctx.moveTo(x * S, p.y * S), ctx.lineTo(x * S, (p.y + 1) * S);
    else ctx.moveTo(p.x * S, y * S), ctx.lineTo((p.x + 1) * S, y * S);
    ctx.stroke();
  } else ctx.strokeRect(p.x * S + 1.5, p.y * S + 1.5, S - 3, S - 3);
}

function footprint(x: number, y: number, w: number, h: number, dx: number, dy: number, colour: string, label: string) {
  ctx.strokeStyle = colour;
  ctx.lineWidth = 2;
  ctx.strokeRect(x * S + 2, y * S + 2, w * S - 4, h * S - 4);
  // The front: a bar along the side it faces.
  const cx = (x + w / 2) * S, cy = (y + h / 2) * S;
  ctx.lineWidth = 4;
  ctx.beginPath();
  if (dx) ctx.moveTo(cx + (dx * w * S) / 2 - dx * 5, y * S + 6), ctx.lineTo(cx + (dx * w * S) / 2 - dx * 5, (y + h) * S - 6);
  else ctx.moveTo(x * S + 6, cy + (dy * h * S) / 2 - dy * 5), ctx.lineTo((x + w) * S - 6, cy + (dy * h * S) / 2 - dy * 5);
  ctx.stroke();
  if (label) {
    ctx.fillStyle = colour;
    ctx.font = `${Math.max(9, S * 0.3)}px system-ui`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(label, cx, cy);
  }
}

// ---------------------------------------------------------------------------
// The pointer

interface Stroke { erase: boolean; key: string; axis: "h" | "v" | null; rect: { x: number; y: number } | null }
let stroke: Stroke | null = null;

/** The tile under the pointer and the nearest edge of it (along the stroke's axis once it has one). */
function pickAt(e: PointerEvent): Pick | null {
  // By the canvas's size on screen, not its pixels: the page may show it scaled.
  const r = canvas.getBoundingClientRect();
  const fx = ((e.clientX - r.left - canvas.clientLeft) / canvas.clientWidth) * st.map.w;
  const fy = ((e.clientY - r.top - canvas.clientTop) / canvas.clientHeight) * st.map.h;
  const x = Math.floor(fx), y = Math.floor(fy);
  if (x < 0 || y < 0 || x >= st.map.w || y >= st.map.h) return null;
  const u = fx - x, v = fy - y;
  const axis = stroke?.axis ?? null;
  const horizontal = axis ? axis === "h" : Math.min(v, 1 - v) < Math.min(u, 1 - u);
  return horizontal ? { x, y, dx: 0, dy: v < 0.5 ? -1 : 1 } : { x, y, dx: u < 0.5 ? -1 : 1, dy: 0 };
}

const keyOf = (p: Pick, edge: boolean) => (edge ? `${p.x + Math.max(p.dx, 0)},${p.y + Math.max(p.dy, 0)},${p.dx ? "v" : "h"}` : `${p.x},${p.y}`);

canvas.addEventListener("contextmenu", (e) => e.preventDefault());
canvas.addEventListener("pointerdown", (e) => {
  const p = pickAt(e);
  if (!p) return;
  const t = st.tool, edge = t.target(st) === "edge";
  if (e.altKey && t.sample) {
    t.sample(st, p);
    buildOptions();
    return;
  }
  canvas.setPointerCapture(e.pointerId);
  begin();
  const erase = e.button === 2;
  stroke = { erase, key: keyOf(p, edge), axis: edge ? (p.dx ? "v" : "h") : null, rect: e.shiftKey && t.rect ? { x: p.x, y: p.y } : null };
  if (!stroke.rect) {
    t.apply(st, p, erase, true);
    changed();
  }
});
canvas.addEventListener("pointermove", (e) => {
  const p = pickAt(e);
  st.hover = p;
  if (p) {
    const t = tileAt(st.map, p.x, p.y, st.z);
    $("info").textContent = `(${p.x}, ${p.y}) ${levelName(st.z)}: ${TILE_INFO[t].name}${t === T.VOID ? "" : ` · ${skinAt(st.map, p.x, p.y, st.z)}`}  ${edgesOf(st.map, p.x, p.y, st.z)}`;
  }
  if (stroke && p && !stroke.rect) {
    const edge = st.tool.target(st) === "edge";
    const k = keyOf(p, edge);
    if (k !== stroke.key) {
      stroke.key = k;
      st.tool.apply(st, p, stroke.erase, false);
      changed();
      return;
    }
  }
  draw();
});
canvas.addEventListener("pointerup", (e) => {
  const p = pickAt(e) ?? st.hover;
  if (stroke?.rect && p && st.tool.rect) {
    st.tool.rect(st, Math.min(stroke.rect.x, p.x), Math.min(stroke.rect.y, p.y), Math.max(stroke.rect.x, p.x), Math.max(stroke.rect.y, p.y), stroke.erase);
    changed();
  }
  stroke = null;
  draw();
});
canvas.addEventListener("pointerleave", () => {
  st.hover = null;
  draw();
});

window.addEventListener("keydown", (e) => {
  const tag = (e.target as HTMLElement)?.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
  const mod = e.metaKey || e.ctrlKey;
  if (mod && e.code === "KeyS") return e.preventDefault(), void save();
  if (mod && e.code === "KeyZ") return e.preventDefault(), e.shiftKey ? redo() : undo();
  if (mod && e.code === "KeyY") return e.preventDefault(), redo();
  if (mod) return;
  if (e.code === "BracketRight" || e.code === "PageUp") return setLevel(st.z + 1);
  if (e.code === "BracketLeft" || e.code === "PageDown") return setLevel(st.z - 1);
  const t = TOOLS.find((x) => x.key === e.code);
  if (t) return pickTool(t);
  if (st.tool.onKey?.(st, e.code)) {
    buildOptions();
    draw();
  }
});
window.addEventListener("beforeunload", (e) => {
  if (st.dirty) e.preventDefault();
});
window.addEventListener("resize", () => {
  sizeCanvas();
  draw();
});

// ---------------------------------------------------------------------------
// The 3D preview (the battle view itself)

let view: BattleView | null = null;
try {
  view = new BattleView($("view"));
  // The skirmish camera: WASD pans, Q / E turn, the wheel steps a level (the editor's level follows).
  view.onLevelStep = (d) => setLevel(st.z + d);
} catch (e) {
  $("view").innerHTML = `<div style="padding:40px;color:var(--dim)">No 3D preview: ${e}</div>`;
}
let previewTimer = 0;
function previewMap(): BattleMap {
  const m = compile(st.data);
  // The battle view looks at a landing zone: the middle of the street level, not drawn.
  m.lz = [{ x: Math.floor(m.w / 2), y: Math.floor(m.h / 2), z: m.ground }];
  m.rain = st.weather === "rain";
  m.winter = st.weather === "snow";
  return m;
}
let placed = false;
function schedulePreview(now = false) {
  if (!view) return;
  clearTimeout(previewTimer);
  previewTimer = window.setTimeout(() => {
    view!.setMap(previewMap(), placed);
    placed = true;
    view!.showLandingZone(false);
    view!.setDaylight(st.night);
    view!.setLevel(st.z);
  }, now ? 0 : 350);
}

function buildPreviewBar() {
  const seg = (id: string, items: [string, string][], cur: string, onPick: (v: string) => void) => {
    const el = $(id);
    el.innerHTML = "";
    for (const [v, label] of items) {
      const b = document.createElement("button");
      b.textContent = label;
      b.className = v === cur ? "on" : "";
      b.onclick = () => (onPick(v), buildPreviewBar());
      el.append(b);
    }
  };
  seg("time", [["day", "Day"], ["night", "Night"]], st.night ? "night" : "day", (v) => ((st.night = v === "night"), view?.setDaylight(st.night)));
  seg("weather", [["clear", "Clear"], ["rain", "Rain"], ["snow", "Snow"]], st.weather, (v) => ((st.weather = v as State["weather"]), schedulePreview(true)));
}

// ---------------------------------------------------------------------------
// Header buttons, and away

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
  st.data.id = `${st.data.id}-copy`;
  st.data.name = `${st.data.name} (copy)`;
  st.fileId = null;
  st.dirty = true;
  buildMeta();
  refresh();
};
$("save").onclick = () => void save();
$("del").onclick = () => void remove();
$("undo").onclick = undo;
$("redo").onclick = redo;
$("addUp").onclick = () => reshape(st.map.w, st.map.h, st.map.ground, st.map.levels + 1, 0);
$("addDown").onclick = () => reshape(st.map.w, st.map.h, st.map.ground + 1, st.map.levels + 1, 1);
$("cutUp").onclick = () => {
  if (st.map.levels - 1 <= st.map.ground) return message("The street level stays");
  if (confirm(`Remove level ${levelName(st.map.levels - 1)} and everything on it?`)) reshape(st.map.w, st.map.h, st.map.ground, st.map.levels - 1, 0);
};
$("cutDown").onclick = () => {
  if (st.map.ground === 0) return message("There's no basement to remove");
  if (confirm(`Remove level ${levelName(0)} and everything on it?`)) reshape(st.map.w, st.map.h, st.map.ground - 1, st.map.levels - 1, -1);
};

buildTools();
buildOptions();
buildMeta();
buildPreviewBar();
sizeCanvas();
st.z = st.map.ground;
refresh();
schedulePreview(true);
void fetchList().then(() => {
  const id = decodeURIComponent(location.hash.slice(1));
  if (id) void openBlock(id);
});
