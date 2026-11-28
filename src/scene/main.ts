// The scene preview (scene.html, dev only): one setup of the battle view from
// the URL, for looking at models, materials and effects without playing to
// them. `npm run shot` screenshots it (scripts/shot.mjs).
//
//   blocks=house,shop,storage  bank blocks side by side (blockbank.ts ids)
//   map=urban&size=den&seed=3  a generated map instead (&long: the long layout)
//   doors=shut|open|broken     every door so (blocks: shut by default; a map keeps its own)
//   winter, rain, night        weather and light
//   level=1                    levels above the street shown
//   at=12,6                    the tile looked at (default: the middle)
//   dist=16  turn=0            camera distance (m) and turn about the vertical (degrees)
//   fx=blood,stone,…  t=0.25   effects set off at the tile looked at, frozen `t` seconds in:
//                              blood, vampire (a vampire's), crit, metal, stone, wood, soft
//                              (a round striking the floor; soft is grass), glass, door,
//                              steel (a garage door), blast, incendiary, fire, flashbang,
//                              pool (a body lying in its blood), muzzle
//
// window.sceneReady is set once the view has drawn with the props in.
import { BattleView } from "../render/battle/BattleView";
import { loadProps } from "../render/battle/props";
import { BANK } from "../tactical/map/blockbank";
import { stamp } from "../tactical/map/blocks";
import { generateMap, type SiteSize } from "../tactical/map/mapgen";
import {
  breakDoor,
  E,
  edgeAt,
  edgeSkinAt,
  emptyMap,
  isDoor,
  setEdge,
  type BattleMap,
  type Setting,
} from "../tactical/map/map";
import { LEVEL_H, SLAB, TILE } from "../render/battle/scale";
import * as THREE from "three";

const q = new URLSearchParams(location.search);
const num = (k: string, d: number) => (q.has(k) && q.get(k) !== "" ? Number(q.get(k)) : d);
const label = document.getElementById("label")!;

function fromBlocks(): BattleMap {
  const ids = (q.get("blocks") ?? "house,shop,storage,barn").split(",").filter(Boolean);
  const missing = ids.filter((id) => !BANK.some((b) => b.id === id));
  if (missing.length)
    throw new Error(`No block ${missing.join(", ")}. Blocks: ${BANK.map((b) => b.id).join(", ")}`);
  const blocks = ids.map((id) => BANK.find((b) => b.id === id)!);
  const ground = Math.max(...blocks.map((b) => b.below));
  const levels = ground + Math.max(...blocks.map((b) => b.lv.length - b.below));
  const w = blocks.reduce((s, b) => s + b.w + 1, -1);
  const h = Math.max(...blocks.map((b) => b.h));
  // The blocks' own terrain's look when they share one (kerbs and lamps in town, none in the country).
  const t = blocks[0]!.terrains[0];
  const setting: Setting =
    blocks.every((b) => b.terrains[0] === t) && t === "rural"
      ? "rural"
      : t === "industrial"
        ? "industrial"
        : "urban";
  const m = emptyMap(w, h, levels, ground, setting, 1);
  let x = 0;
  for (const b of blocks) {
    stamp(m, b, x, 0);
    x += b.w + 1;
  }
  m.lz = [{ x: Math.floor(w / 2), y: Math.floor(h / 2), z: ground }];
  return m;
}

function fromGenerator(): BattleMap {
  return generateMap({
    setting: q.get("map") as Setting,
    size: (q.get("size") ?? "den") as SiteSize,
    seed: num("seed", 1),
    thralls: 0,
    vampires: 0,
    layout: q.has("long") ? "long" : "square",
  });
}

/** Every door on the map shut, open or broken. */
function setDoors(m: BattleMap, how: string) {
  for (let z = 0; z < m.levels; z++)
    for (let y = 0; y < m.h; y++)
      for (let x = 0; x < m.w; x++)
        for (const [dx, dy] of [
          [1, 0],
          [0, 1],
        ] as const) {
          if (!isDoor(edgeAt(m, x, y, z, dx, dy))) continue;
          if (how === "broken") breakDoor(m, x, y, z, dx, dy);
          else
            setEdge(
              m,
              x,
              y,
              z,
              dx,
              dy,
              how === "open" ? E.DOOR : E.SHUT,
              edgeSkinAt(m, x, y, z, dx, dy),
            );
        }
}

async function main() {
  const m = q.has("map") ? fromGenerator() : fromBlocks();
  const doors = q.get("doors") ?? (q.has("map") ? "" : "shut");
  if (doors) setDoors(m, doors);
  m.winter = q.has("winter");
  m.rain = !m.winter && q.has("rain");
  m.spawns = [];
  await loadProps();
  const view = new BattleView(document.getElementById("view")!);
  view.setMap(m, false);
  view.showLandingZone(false);
  view.setDaylight(q.has("night"));
  view.setLevel(m.ground + num("level", 0));
  const [tx, ty] = (q.get("at") ?? `${m.w / 2},${m.h / 2}`).split(",").map(Number);
  const dist = num("dist", 16),
    turn = (num("turn", 0) * Math.PI) / 180;
  const cx = (tx! + 0.5) * TILE,
    cz = (ty! + 0.5) * TILE,
    cy = m.ground * LEVEL_H;
  view.controls.target.set(cx, cy, cz);
  // Over the shoulder from the south-east, as the battle camera starts; `turn` swings it round.
  const out = { x: 0.3, z: 0.6 };
  view.camera.position.set(
    cx + dist * (out.x * Math.cos(turn) + out.z * Math.sin(turn)),
    cy + dist * 0.8,
    cz + dist * (out.z * Math.cos(turn) - out.x * Math.sin(turn)),
  );
  view.controls.update();
  label.textContent = `${location.search.slice(1) || "defaults"}   ${m.w}×${m.h}`;
  const fx = (q.get("fx") ?? "").split(",").filter(Boolean);
  if (fx.length) {
    await new Promise((r) => setTimeout(r, 600)); // the level drawn first
    setOff(view, fx, { x: tx!, y: ty!, z: m.ground });
    await new Promise((r) => setTimeout(r, num("t", 0.25) * 1000));
    view.fx.frozen = true;
  }
  // Two frames to draw, then ready for a screenshot.
  requestAnimationFrame(() =>
    requestAnimationFrame(() => ((window as unknown as { sceneReady: boolean }).sceneReady = true)),
  );
}

/** Sets off effects at a tile, as the playback would. */
function setOff(view: BattleView, kinds: string[], p: { x: number; y: number; z: number }) {
  const V = THREE.Vector3;
  const floor = p.z * LEVEL_H + SLAB;
  const mid = new V((p.x + 0.5) * TILE, floor, (p.y + 0.5) * TILE);
  const up = (h: number) => mid.clone().setY(floor + h);
  const east = new V(1, 0, 0);
  const along = new V(0, 0, TILE - 0.2);
  for (const k of kinds) {
    if (k === "blood" || k === "vampire" || k === "crit")
      view.fx.blood(up(1.3), new V(1, -0.1, 0.2).normalize(), k === "vampire", k === "crit");
    else if (k === "metal" || k === "stone" || k === "wood" || k === "soft")
      view.fx.impact(
        up(0),
        new V(0, 1, 0),
        new V(0.8, -0.5, 0.2).normalize(),
        ({ metal: "metal", stone: "concrete", wood: "planks", soft: "grass" } as const)[k],
      );
    else if (k === "glass") view.fx.shatter(up(0.9), up(2.6), along, east);
    else if (k === "door" || k === "steel") view.fx.splinter(mid, along, east, 2.2, k === "steel");
    else if (k === "blast" || k === "incendiary") {
      view.fx.explosion(up(0.5), k === "blast" ? 2 : 1.3, k === "blast");
      view.setFire([
        p,
        { ...p, x: p.x + 1 },
        { ...p, y: p.y + 1 },
        { ...p, x: p.x - 1 },
        { ...p, y: p.y - 1 },
      ]);
    } else if (k === "fire") view.setFire([p, { ...p, x: p.x + 1 }, { ...p, y: p.y + 1 }]);
    else if (k === "flashbang") view.fx.flash(up(0.3), 0xffffff, 7);
    else if (k === "muzzle") view.fx.muzzle(up(1.4), east, false);
    else if (k === "pool")
      view.setUnits([
        { id: "a", x: p.x, y: p.y, z: p.z, side: "thrall", dead: true, facing: 0 },
        { id: "b", x: p.x + 2, y: p.y, z: p.z, side: "vampire", dead: true, facing: 1.5 },
      ]);
  }
}

main().catch((e: Error) => {
  label.textContent = String(e.message);
  (window as unknown as { sceneReady: boolean }).sceneReady = true;
});
