// The material catalogue: every procedural material by name, how to make it,
// and which one each map skin uses as a floor, a wall or a prop. The
// renderer (BattleView) and the preview page (materials.html) both build
// from here.
import * as THREE from "three";
import type { Skin } from "../../tactical/map";
import { BRICK } from "./brick";
import { CANVAS, LEATHER, POLYMER, VELVET, WOOL } from "./fabric";
import { BARK, HAY, HEDGE_LEAVES, TREE_LEAVES } from "./foliage";
import { DIRT, GRASS } from "./ground";
import { LAMPS } from "./lamps";
import { ASHLAR, CARVED, COPING, PLASTER, ROCK } from "./masonry";
import { BRASS, CAR_PAINT, GLASS, GUN_METAL, STREET_METAL, VEHICLE_PAINT } from "./metal";
import { shaded, shadedObject, tone, type Feature } from "./patch";
import { CRYPT_FLOOR, FLAGSTONE, PAVEMENT, ROOF } from "./paving";
import { ROAD_SURFACE } from "./road";
import { BARN_BOARDS, CRATE_WOOD, FENCE_WOOD, FLOORBOARDS, FURNITURE_WOOD, MODEL_WOOD } from "./wood";

export interface MaterialSpec {
  /** What it's for, for the preview page. */
  about: string;
  feature: Feature | null;
  roughness: number;
  metalness: number;
  /** Patterns ride on the object (units, weapons, models), not the world. */
  object?: boolean;
  /** A colour to preview it with (instances bring their own). */
  colour: number;
}

export const MATERIALS = {
  plain: { about: "Flat colour, lit (anything without its own material)", feature: null, roughness: 0.85, metalness: 0.05, colour: 0x888888 },
  // Ground and floors
  road: { about: "Asphalt: roads (markings) and car parks", feature: ROAD_SURFACE, roughness: 0.92, metalness: 0, colour: 0x34363b },
  grass: { about: "Grass: lawns, parks, fields", feature: GRASS, roughness: 0.95, metalness: 0, colour: 0x3d5a34 },
  dirt: { about: "Dirt: tracks, fields, barn floors", feature: DIRT, roughness: 0.97, metalness: 0, colour: 0x6a5338 },
  pavement: { about: "Pavement slabs, 60 cm", feature: PAVEMENT, roughness: 0.85, metalness: 0, colour: 0x6b6a66 },
  flagstone: { about: "Stone flagstones: plaza, chapel", feature: FLAGSTONE, roughness: 0.8, metalness: 0, colour: 0x777a80 },
  cryptFloor: { about: "Crypt floor: old worn flagstones", feature: CRYPT_FLOOR, roughness: 0.7, metalness: 0, colour: 0x3e3a36 },
  floorboards: { about: "Indoor floorboards", feature: FLOORBOARDS, roughness: 0.6, metalness: 0, colour: 0x7a6650 },
  roof: { about: "Flat roof: bitumen felt", feature: ROOF, roughness: 0.9, metalness: 0, colour: 0x4c4642 },
  // Walls
  brick: { about: "Brick, running bond (procedural normal map)", feature: BRICK, roughness: 0.9, metalness: 0, colour: 0x8a4a3a },
  plaster: { about: "Plaster: damp, cracks, peeling to brick", feature: PLASTER, roughness: 0.92, metalness: 0, colour: 0xb8ae98 },
  ashlar: { about: "Cut stone in courses: chapel, castle, cellar", feature: ASHLAR, roughness: 0.88, metalness: 0, colour: 0x777a80 },
  coping: { about: "Copings and parapets", feature: COPING, roughness: 0.85, metalness: 0, colour: 0x6a625a },
  barnBoards: { about: "Barn and shed planking", feature: BARN_BOARDS, roughness: 0.9, metalness: 0, colour: 0x7a5a3a },
  rock: { about: "Raw rock: catacombs, crags, rubble", feature: ROCK, roughness: 0.95, metalness: 0, colour: 0x5a564e },
  // Props
  carved: { about: "Carved stone: graves, pillars, sarcophagi, altar", feature: CARVED, roughness: 0.7, metalness: 0, colour: 0x8a8a86 },
  crate: { about: "Crates: rough sawn boards", feature: CRATE_WOOD, roughness: 0.85, metalness: 0, colour: 0x9a7a4a },
  furniture: { about: "Furniture, pews, stairs", feature: FURNITURE_WOOD, roughness: 0.55, metalness: 0, colour: 0x6a4a30 },
  fence: { about: "Fences: weathered rails", feature: FENCE_WOOD, roughness: 0.92, metalness: 0, colour: 0x8a7550 },
  hay: { about: "Hay bales", feature: HAY, roughness: 0.95, metalness: 0, colour: 0xc9a55a },
  leaves: { about: "Tree crowns", feature: TREE_LEAVES, roughness: 0.8, metalness: 0, colour: 0x2f5a2a },
  hedge: { about: "Hedges", feature: HEDGE_LEAVES, roughness: 0.85, metalness: 0, colour: 0x335f30 },
  bark: { about: "Tree trunks", feature: BARK, roughness: 0.95, metalness: 0, colour: 0x4a3626 },
  carPaint: { about: "Car paint: dirt, scratches, a little rust", feature: CAR_PAINT, roughness: 0.32, metalness: 0.35, colour: 0x8a2f2f },
  carGlass: { about: "Car windows and roof (dark glass)", feature: GLASS, roughness: 0.08, metalness: 0.2, colour: 0x22262c },
  streetMetal: { about: "Bins, lamp posts: painted, rusty", feature: STREET_METAL, roughness: 0.55, metalness: 0.4, colour: 0x3f4a40 },
  // Models: units, weapons, kit (object space)
  vehicle: { about: "Vehicle paint on a model (the helicopter)", feature: VEHICLE_PAINT, roughness: 0.45, metalness: 0.3, object: true, colour: 0x3a4a3e },
  wool: { about: "Wool twill: cassocks, habits, coats", feature: WOOL, roughness: 0.9, metalness: 0, object: true, colour: 0x2a2a30 },
  canvas: { about: "Canvas: tactical kit, bags, webbing", feature: CANVAS, roughness: 0.9, metalness: 0, object: true, colour: 0x5a5a40 },
  velvet: { about: "Velvet: the elders, vestments (sheen)", feature: VELVET, roughness: 0.95, metalness: 0, object: true, colour: 0x5a0a14 },
  leather: { about: "Leather: boots, belts, holsters", feature: LEATHER, roughness: 0.55, metalness: 0, object: true, colour: 0x3a2416 },
  gunMetal: { about: "Gun metal: blued or parkerized steel", feature: GUN_METAL, roughness: 0.45, metalness: 0.85, object: true, colour: 0x55575c },
  brass: { about: "Brass: cartridges, crucifixes, fittings", feature: BRASS, roughness: 0.3, metalness: 0.85, object: true, colour: 0xd4a84e },
  polymer: { about: "Polymer: grips, stocks, cases", feature: POLYMER, roughness: 0.6, metalness: 0, object: true, colour: 0x34363a },
  modelWood: { about: "Wood on a model: stocks, carried crates", feature: MODEL_WOOD, roughness: 0.5, metalness: 0, object: true, colour: 0x6a3f22 },
} satisfies Record<string, MaterialSpec>;

export type MaterialKey = keyof typeof MATERIALS;

/**
 * How much of its painted colour variation scenery keeps (user, 2026-11-19:
 * a quiet level so units and items read; the relief and the light do the
 * work). Models keep all of theirs.
 */
export const SCENERY_CONTRAST = 0.45;
const SCENERY_TONE = tone(SCENERY_CONTRAST);

/**
 * A new material from the catalogue, lit by the lamps. Scenery passes no
 * colour (white: each instance brings its own); a single model passes one
 * (often the catalogue's `colour`).
 */
export function makeMaterial(key: MaterialKey, colour?: number): THREE.MeshStandardMaterial {
  const s: MaterialSpec = MATERIALS[key];
  const mat = new THREE.MeshStandardMaterial({ roughness: s.roughness, metalness: s.metalness, ...(colour !== undefined ? { color: colour } : {}) });
  const features = s.feature ? (s.object ? [s.feature, LAMPS] : [s.feature, SCENERY_TONE, LAMPS]) : [LAMPS];
  return s.object ? shadedObject(mat, ...features) : shaded(mat, ...features);
}

/** Which material a map skin uses, as a floor, a wall or a prop. */
export function surfaceFor(skin: Skin, part: "floor" | "wall" | "prop"): MaterialKey {
  if (part === "floor")
    switch (skin) {
      case "road": case "tarmac": return "road";
      case "grass": return "grass";
      case "dirt": return "dirt";
      case "pavement": return "pavement";
      case "stone": return "flagstone";
      case "crypt": return "cryptFloor";
      case "indoor": case "wood": return "floorboards";
      case "roof": return "roof";
      default: return "plain";
    }
  if (part === "wall")
    switch (skin) {
      case "brick": return "brick";
      case "plaster": case "none": return "plaster";
      case "stone": return "ashlar";
      case "planks": return "barnBoards";
      case "rock": return "rock";
      default: return "plain";
    }
  switch (skin) {
    case "crate": return "crate";
    case "table": case "bench": case "wood": return "furniture";
    case "fence": return "fence";
    case "hay": return "hay";
    case "hedge": return "hedge";
    case "tree": return "leaves";
    case "bin": return "streetMetal";
    case "car": return "carPaint";
    case "parapet": return "coping";
    case "grave": case "sarcophagus": case "altar": case "pillar": return "carved";
    case "rock": case "rubble": return "rock";
    default: return "plain";
  }
}
