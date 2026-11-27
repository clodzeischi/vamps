// The map gallery (dev tool, `npm run gallery`): page through seeds of the real
// generator, look at every level of one map, and see what the checks flag.
// Not part of the game or its build. State lives in the URL hash.
import { generateMap, mapSize, type MapRequest, type SiteSize } from "../tactical/map/mapgen";
import {
  isLit,
  levelName,
  skinAt,
  tileAt,
  TILE_INFO,
  type BattleMap,
  type Setting,
} from "../tactical/map/map";
import { blockedDoorways, statsOf, type Issue } from "./checks";
import { drawLevel, edgesOf, type Overlays } from "./draw";

type Basement = "auto" | "on" | "off";
interface State {
  setting: Setting;
  size: SiteSize;
  basement: Basement;
  seed: number;
  count: number;
  /** Thumbnail level, relative to the ground. */
  rel: number;
  /** The map open in the detail view, and its level (absolute). */
  open: number | null;
  z: number | null;
  ov: Overlays;
}

const SETTINGS: Setting[] = ["urban", "rural", "apartments", "industrial", "lair", "montsegur"];
const SIZES: SiteSize[] = ["nest", "den", "haven", "lair"];
const COUNTS = [12, 24, 48, 96];
const ENEMIES: Record<SiteSize, [number, number]> = {
  nest: [3, 1],
  den: [5, 2],
  haven: [7, 3],
  lair: [8, 4],
};
/** `gallery.html?blocks`: urban maps from the block generator (proof of concept). */
const BLOCKS = new URLSearchParams(location.search).has("blocks");
const deep = (s: Setting) => s === "lair" || s === "montsegur";

// ---------------------------------------------------------------------------
// State and the URL

const st: State = {
  setting: "urban",
  size: "den",
  basement: "auto",
  seed: 1,
  count: 24,
  rel: 0,
  open: null,
  z: null,
  ov: { lights: true, lz: true, spawns: false, issues: true, grid: true },
};

function readHash() {
  const q = new URLSearchParams(location.hash.slice(1));
  const get = (k: string) => q.get(k);
  const s = get("setting") as Setting | null;
  if (s && SETTINGS.includes(s)) st.setting = s;
  const z = get("size") as SiteSize | null;
  if (z && SIZES.includes(z)) st.size = z;
  const b = get("basement") as Basement | null;
  if (b === "auto" || b === "on" || b === "off") st.basement = b;
  const n = (k: string) =>
    get(k) !== null && Number.isFinite(Number(get(k))) ? Number(get(k)) : null;
  st.seed = Math.max(0, n("seed") ?? st.seed);
  st.count = COUNTS.includes(n("count") ?? -1) ? n("count")! : st.count;
  st.rel = n("rel") ?? st.rel;
  st.open = n("open");
  st.z = n("z");
  const ov = get("ov");
  if (ov !== null)
    for (const k of Object.keys(st.ov) as (keyof Overlays)[]) st.ov[k] = ov.includes(k[0]!);
  if (deep(st.setting)) st.size = "lair";
}

function writeHash() {
  const q = new URLSearchParams({
    setting: st.setting,
    size: st.size,
    basement: st.basement,
    seed: String(st.seed),
    count: String(st.count),
    rel: String(st.rel),
    ov: (Object.keys(st.ov) as (keyof Overlays)[])
      .filter((k) => st.ov[k])
      .map((k) => k[0])
      .join(""),
  });
  if (st.open !== null) q.set("open", String(st.open));
  if (st.z !== null) q.set("z", String(st.z));
  history.replaceState(null, "", "#" + q.toString());
}

// ---------------------------------------------------------------------------
// Generation (cached per request)

interface Result {
  seed: number;
  m: BattleMap | null;
  err: string | null;
  ms: number;
  issues: Issue[];
}

const cache = new Map<string, Result>();

function request(seed: number): MapRequest {
  const [thralls, vampires] = ENEMIES[st.size];
  return {
    setting: st.setting,
    size: deep(st.setting) ? "lair" : st.size,
    seed,
    thralls,
    vampires,
    civilians: st.setting === "urban" ? 2 : 0,
    blocks: BLOCKS && st.setting === "urban",
    basement: st.basement === "auto" ? undefined : st.basement === "on",
  };
}

function generate(seed: number): Result {
  const key = `${st.setting}|${st.size}|${st.basement}|${BLOCKS}|${seed}`;
  const hit = cache.get(key);
  if (hit) return hit;
  if (cache.size > 2000) cache.clear();
  const t0 = performance.now();
  let res: Result;
  try {
    const m = generateMap(request(seed));
    res = { seed, m, err: null, ms: performance.now() - t0, issues: blockedDoorways(m) };
  } catch (e) {
    res = {
      seed,
      m: null,
      err: e instanceof Error ? e.message : String(e),
      ms: performance.now() - t0,
      issues: [],
    };
  }
  cache.set(key, res);
  return res;
}

// ---------------------------------------------------------------------------
// DOM helpers

function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: Partial<HTMLElementTagNameMap[K]> & { cls?: string } = {},
  ...kids: (Node | string)[]
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  const { cls, ...rest } = props;
  if (cls) el.className = cls;
  Object.assign(el, rest);
  el.append(...kids);
  return el;
}

function select<T extends string | number>(
  value: T,
  options: readonly T[],
  onChange: (v: T) => void,
  label = (v: T) => String(v),
) {
  const el = h("select");
  for (const o of options)
    el.append(h("option", { value: String(o), textContent: label(o), selected: o === value }));
  el.onchange = () => onChange(options.find((o) => String(o) === el.value)!);
  return el;
}

/** A canvas sized for `s` px a tile, crisp on high-DPI screens. */
function mapCanvas(m: BattleMap, s: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const dpr = window.devicePixelRatio || 1;
  const cv = h("canvas");
  cv.width = Math.round(m.w * s * dpr);
  cv.height = Math.round(m.h * s * dpr);
  cv.style.width = `${m.w * s}px`;
  cv.style.height = `${m.h * s}px`;
  const c = cv.getContext("2d")!;
  c.setTransform(dpr, 0, 0, dpr, 0, 0);
  return [cv, c];
}

const app = document.getElementById("app")!;
let job = 0;

// ---------------------------------------------------------------------------
// The toolbar

function toolbar(): HTMLElement {
  const bar = h("header");
  const set = (f: () => void) => () => {
    f();
    render();
  };
  bar.append(
    h("b", { textContent: "Gallery" }),
    h(
      "label",
      {},
      "Setting ",
      select(st.setting, SETTINGS, (v) =>
        set(() => {
          st.setting = v;
          st.size = deep(v) ? "lair" : st.size === "lair" ? "den" : st.size;
          st.rel = 0;
          st.z = null;
        })(),
      ),
    ),
  );
  const size = select(
    st.size,
    SIZES,
    (v) => set(() => (st.size = v))(),
    (v) => `${v} (${mapSize(st.setting, v)})`,
  );
  size.disabled = deep(st.setting);
  const seed = h("input", { type: "number", value: String(st.seed), min: "0" });
  seed.onchange = set(() => (st.seed = Math.max(0, Math.floor(Number(seed.value) || 0))));
  bar.append(
    h("label", {}, "Size ", size),
    h(
      "label",
      {},
      "Basement ",
      select(st.basement, ["auto", "on", "off"] as const, (v) => set(() => (st.basement = v))()),
    ),
    h("label", {}, st.open === null ? "From seed " : "Seed ", seed),
  );
  if (st.open === null) {
    bar.append(
      h(
        "label",
        {},
        "Show ",
        select(st.count, COUNTS, (v) => set(() => (st.count = v))()),
      ),
      h("button", {
        textContent: "◀ Prev",
        title: "Previous page (←)",
        onclick: set(() => (st.seed = Math.max(0, st.seed - st.count))),
      }),
      h("button", {
        textContent: "Next ▶",
        title: "Next page (→)",
        onclick: set(() => (st.seed += st.count)),
      }),
      h("button", {
        textContent: "Random",
        title: "Random page (R)",
        onclick: set(() => (st.seed = Math.floor(Math.random() * 1e6))),
      }),
    );
    const levels = deep(st.setting) ? [-2, -1, 0, 1] : [-1, 0, 1, 2];
    const seg = h("span", { cls: "seg" });
    for (const r of levels) {
      const label = r === 0 ? "Ground" : r < 0 ? `${r}` : `+${r}`;
      seg.append(
        h("button", {
          textContent: label,
          cls: r === st.rel ? "on" : "",
          title: "Level shown in the thumbnails (↑ ↓)",
          onclick: set(() => (st.rel = r)),
        }),
      );
    }
    bar.append(h("label", {}, "Level ", seg));
  }
  const ovs = h("span", { cls: "ovs" });
  const names: Record<keyof Overlays, string> = {
    lights: "Lights",
    lz: "Landing zone",
    spawns: "Spawns",
    issues: "Flags",
    grid: "Grid",
  };
  for (const k of Object.keys(names) as (keyof Overlays)[]) {
    const cb = h("input", { type: "checkbox", checked: st.ov[k] });
    cb.onchange = set(() => (st.ov[k] = cb.checked));
    ovs.append(h("label", {}, cb, names[k]));
  }
  bar.append(ovs);
  return bar;
}

function legend(): HTMLElement {
  const sw = (c: string, t: string, shape = "sq") => {
    const i = h("i", { cls: shape });
    i.style.setProperty("--c", c);
    return h("span", { cls: "key" }, i, t);
  };
  return h(
    "footer",
    {},
    sw("#120e0b", "wall", "line"),
    sw("#8fd3ff", "window", "line"),
    sw("#f0b848", "doorway", "line"),
    sw("#b8863f", "low prop", "sq"),
    sw("#24521f", "high prop", "dot"),
    sw("#ffe08a", "lamp", "dot"),
    sw("#5fe0a0", "landing zone", "sq"),
    sw("#e05040", "thrall", "dot"),
    sw("#b060ff", "vampire", "dot"),
    sw("#ff3b3b", "flagged tile", "ring"),
    h("span", { cls: "keys", textContent: "← → page or seed · ↑ ↓ level · R random · Esc back" }),
  );
}

// ---------------------------------------------------------------------------
// The grid of seeds

function grid() {
  const mine = ++job;
  const wrap = h("main", { cls: "grid" });
  const summary = h("div", { cls: "summary", textContent: "Generating…" });
  app.append(summary, wrap);
  const n = mapSize(st.setting, st.size);
  const s = Math.max(3, Math.floor((st.count > 48 ? 150 : 220) / n));
  const seeds = Array.from({ length: st.count }, (_, i) => st.seed + i);
  const done: Result[] = [];
  let i = 0;
  const step = () => {
    if (mine !== job) return;
    const t0 = performance.now();
    while (i < seeds.length && performance.now() - t0 < 30) {
      const res = generate(seeds[i++]!);
      done.push(res);
      wrap.append(card(res, s));
    }
    const flagged = done.filter((r) => r.issues.length).length,
      failed = done.filter((r) => r.err).length;
    const avg = done.reduce((a, r) => a + r.ms, 0) / Math.max(1, done.length);
    summary.textContent = `Seeds ${st.seed}–${st.seed + st.count - 1} · ${done.length}/${seeds.length} maps · ${flagged} flagged · ${failed} failed · ${avg.toFixed(1)} ms a map (first run; cached after)`;
    if (i < seeds.length) requestAnimationFrame(step);
  };
  step();
}

function card(res: Result, s: number): HTMLElement {
  const el = h("button", { cls: "card", title: res.err ?? `Seed ${res.seed}: open (click)` });
  el.onclick = () => {
    st.open = res.seed;
    st.z = res.m ? res.m.ground + st.rel : null;
    render();
  };
  if (!res.m) {
    el.append(
      h("div", { cls: "fail", textContent: res.err ?? "failed" }),
      h("div", { cls: "cap", textContent: `${res.seed}` }),
    );
    return el;
  }
  const z = res.m.ground + st.rel;
  const [cv, c] = mapCanvas(res.m, s);
  if (z >= 0 && z < res.m.levels) drawLevel(c, res.m, z, s, st.ov, res.issues);
  else {
    c.fillStyle = "#121214";
    c.fillRect(0, 0, res.m.w * s, res.m.h * s);
  }
  const cap = h("div", { cls: "cap" }, h("span", { textContent: `${res.seed}` }));
  if (res.issues.length)
    cap.append(h("span", { cls: "flag", textContent: `⚑ ${res.issues.length}` }));
  el.append(cv, cap);
  return el;
}

// ---------------------------------------------------------------------------
// One map

function detail(seed: number) {
  const res = generate(seed);
  const wrap = h("main", { cls: "detail" });
  app.append(wrap);
  const side = h("aside");
  const stage = h("section");
  wrap.append(side, stage);
  side.append(
    h(
      "div",
      { cls: "row" },
      h("button", {
        textContent: "← All seeds",
        title: "Back to the grid (Esc)",
        onclick: () => ((st.open = null), (st.z = null), render()),
      }),
      h("button", { textContent: "◀", title: "Previous seed (←)", onclick: () => go(-1) }),
      h("button", { textContent: "▶", title: "Next seed (→)", onclick: () => go(1) }),
    ),
    h("h2", { textContent: `Seed ${seed}` }),
  );
  if (!res.m) {
    stage.append(h("div", { cls: "fail", textContent: res.err ?? "failed" }));
    return;
  }
  const m = res.m;
  const z = Math.max(0, Math.min(m.levels - 1, st.z ?? m.ground));
  st.z = z;

  // Every level, small; click one to look at it.
  const levels = h("div", { cls: "levels" });
  const ts = Math.max(2, Math.floor(130 / m.w));
  for (let k = m.levels - 1; k >= 0; k--) {
    const [cv, c] = mapCanvas(m, ts);
    drawLevel(c, m, k, ts, { ...st.ov, grid: false }, res.issues);
    const b = h(
      "button",
      { cls: "lvl" + (k === z ? " on" : ""), onclick: () => ((st.z = k), render()) },
      cv,
      h("span", { textContent: levelName(m, k) }),
    );
    levels.append(b);
  }
  side.append(levels);

  const sts = statsOf(m);
  const tbl = h("table");
  const row = (k: string, v: string | number) =>
    tbl.append(h("tr", {}, h("td", { textContent: k }), h("td", { textContent: String(v) })));
  row("Size", `${m.w} × ${m.h}, ${m.levels} levels`);
  row("Ground level", m.ground);
  row("Walkable tiles", sts.walkable);
  row("Props", sts.props);
  row("Doorways", sts.doors);
  row("Windows", sts.windows);
  row("Lamps", sts.lights);
  row("Spawns", sts.spawns);
  row("Generated in", `${res.ms.toFixed(1)} ms`);
  side.append(tbl);
  if (res.issues.length) {
    const list = h("ul", { cls: "issues" });
    for (const p of res.issues) {
      const li = h("li", { textContent: `${p.text} at ${p.x}, ${p.y} (${levelName(m, p.z)})` });
      li.onclick = () => ((st.z = p.z), render());
      list.append(li);
    }
    side.append(h("h3", { textContent: `Flags (${res.issues.length})` }), list);
  }

  // The level, big, with a readout of the tile under the mouse.
  const s = Math.max(
    6,
    Math.floor(Math.min(window.innerWidth - 330, window.innerHeight - 150) / m.w),
  );
  const [cv, c] = mapCanvas(m, s);
  drawLevel(c, m, z, s, st.ov, res.issues);
  const info = h("div", { cls: "info", textContent: `${levelName(m, z)} · hover a tile` });
  cv.onmousemove = (ev) => {
    const x = Math.floor(ev.offsetX / s),
      y = Math.floor(ev.offsetY / s);
    if (x < 0 || y < 0 || x >= m.w || y >= m.h) return;
    const t = tileAt(m, x, y, z);
    const bits = [`${x}, ${y}`, levelName(m, z), TILE_INFO[t].name, skinAt(m, x, y, z)];
    const e = edgesOf(m, x, y, z);
    if (e) bits.push(e);
    if (isLit(m, { x, y, z })) bits.push("lit");
    const sp = m.spawns.find((p) => p.x === x && p.y === y && p.z === z);
    if (sp) bits.push(sp.elder ? "eldest" : sp.side);
    const is = res.issues.find((p) => p.x === x && p.y === y && p.z === z);
    if (is) bits.push(`⚑ ${is.text}`);
    info.textContent = bits.join(" · ");
  };
  stage.append(cv, info);
}

function go(d: number) {
  if (st.open === null) return;
  st.open = Math.max(0, st.open + d);
  st.seed = st.open;
  render();
}

// ---------------------------------------------------------------------------

function render() {
  job++;
  if (st.open !== null) st.seed = st.open;
  writeHash();
  app.replaceChildren(toolbar());
  if (st.open === null) grid();
  else detail(st.open);
  app.append(legend());
}

window.addEventListener("keydown", (ev) => {
  if (ev.target instanceof HTMLInputElement || ev.target instanceof HTMLSelectElement) return;
  const levels = deep(st.setting) ? [-2, -1, 0, 1] : [-1, 0, 1, 2];
  if (st.open === null) {
    if (ev.key === "ArrowRight") st.seed += st.count;
    else if (ev.key === "ArrowLeft") st.seed = Math.max(0, st.seed - st.count);
    else if (ev.key === "r" || ev.key === "R") st.seed = Math.floor(Math.random() * 1e6);
    else if (ev.key === "ArrowUp") st.rel = Math.min(levels.at(-1)!, st.rel + 1);
    else if (ev.key === "ArrowDown") st.rel = Math.max(levels[0]!, st.rel - 1);
    else return;
  } else {
    if (ev.key === "ArrowRight") return void go(1);
    if (ev.key === "ArrowLeft") return void go(-1);
    if (ev.key === "Escape") ((st.open = null), (st.z = null));
    else if (ev.key === "ArrowUp") st.z = (st.z ?? 0) + 1;
    else if (ev.key === "ArrowDown") st.z = Math.max(0, (st.z ?? 0) - 1);
    else return;
  }
  ev.preventDefault();
  render();
});

let resize = 0;
window.addEventListener("resize", () => {
  clearTimeout(resize);
  resize = window.setTimeout(() => st.open !== null && render(), 150);
});

readHash();
render();
