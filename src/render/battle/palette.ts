// Colours: each floor and wall skin's, the kerb's, each side's; and making a material glow.
import * as THREE from "three";
import { SKINS, type Skin } from "../../tactical/map/map";
import { type UnitSpec } from "./BattleView";

export const PALETTE: Record<Skin, number> = {
  none: 0x777777,
  grass: 0x3d5a34,
  road: 0x34363b,
  pavement: 0x6b6a66,
  indoor: 0x7a6650,
  dirt: 0x6a5338,
  wood: 0x8a6a44,
  stone: 0x777a80,
  roof: 0x4c4642,
  brick: 0x8a4a3a,
  plaster: 0xb8ae98,
  car: 0x5a6f8a,
  crate: 0x9a7a4a,
  tree: 0x2f5a2a,
  hedge: 0x335f30,
  hay: 0xc9a55a,
  fence: 0x8a7550,
  bin: 0x3f4a40,
  table: 0x6a4a30,
  bench: 0x6a5036,
  planks: 0x7a5a3a,
  parapet: 0x6a625a,
  tarmac: 0x2c2d31,
  grave: 0x8a8a86,
  rock: 0x5a564e,
  sarcophagus: 0x7a7266,
  pillar: 0x8a8478,
  altar: 0x5a1e22,
  rubble: 0x6e665a,
  crypt: 0x3e3a36,
  truck: 0x5a6f8a,
  bed: 0xc8ccd0,
  shelf: 0x9aa0a6,
  counter: 0x5a4a3c,
  fridge: 0xd8dcde,
  pump: 0xc83a2c,
  rack: 0x3c5c8a,
  tile: 0xb8bcb8,
  concrete: 0x8a8a86,
  metal: 0x6e7a80,
  clinic: 0xd4d8d4,
  sofa: 0x4a5a3c,
  tv: 0x2a2624,
};
/** A material that glows faintly in its own colour (units and loot, so they read at night). */
export function glowing<M extends THREE.MeshStandardMaterial>(
  mat: M,
  colour: number,
  intensity: number,
): M {
  mat.emissive.setHex(colour);
  mat.emissiveIntensity = intensity;
  return mat;
}

export const SKIN_INDEX = Object.fromEntries(SKINS.map((k, i) => [k, i])) as Record<Skin, number>;
/** Kerbstones: grey granite. */
export const KERB_STONE = 0x8c8b86;

export const SIDE_COLOURS: Record<UnitSpec["side"], number> = {
  agent: 0x8fb4e0,
  thrall: 0xc0784a,
  vampire: 0xc8243a,
  civilian: 0xc8c0a8,
  hostage: 0xe8d890,
};
