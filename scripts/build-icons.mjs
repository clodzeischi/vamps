// Copies the icons the game uses from game-icons.net (CC BY 3.0, via the
// @iconify-json/game-icons package) into src/ui/icons.generated.ts, so the
// bundle carries only these, not all 4,000.
//
//   node scripts/build-icons.mjs
//
// To add an icon: find one at https://game-icons.net, add `ourName: "its-name"`
// below, and run the script. Credit stays in the main menu's Credits.
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const set = require("@iconify-json/game-icons/icons.json");

/** Our name → game-icons name. */
const ICONS = {
  // The dock: places, dashboards, screens
  bases: "castle",
  operations: "radar-sweep",
  research: "fizzing-flask",
  engineering: "gears",
  bloodlines: "fangs",
  covert: "cloak-dagger",
  market: "coins",
  map: "world",
  // Base facilities
  overview: "castle",
  quarters: "bunk-beds",
  recruit: "team-upgrade",
  hangars: "control-tower",
  labs: "test-tubes",
  workshops: "anvil-impact",
  containment: "prisoner",
  stores: "wooden-crate",
  construction: "hammer-nails",
  // Agent stats (stat-faith is the OPV emblem: components/Icon.tsx)
  "stat-combat": "crossed-swords",
  "stat-tradecraft": "domino-mask",
  "stat-insight": "all-seeing-eye",
  "stat-vitality": "heart-drop",
  // Aircraft
  helicopter: "helicopter",
  jet: "commercial-airplane",
  // Status
  "status-field": "airplane-departure",
  "status-covert": "cloak",
  "status-wounded": "medical-drip",
  "status-ready": "check-mark",
  // Research and engineering
  "field-medicine": "medical-pack",
  "combat-surgery": "scalpel",
  "composite-armour": "breastplate",
  "signal-analysis": "radar-dish",
  "advanced-signals": "sound-waves",
  "pattern-analysis": "brain",
  "vampire-physiology": "vampire-dracula",
  "uv-weaponry": "sun",
  pheromones: "nose-side",
  haematology: "blood",
  "interrogate-thrall": "handcuffs",
  "interrogate-vampire": "fanged-skull",
  "ceramic-plate": "chest-armor",
  "uv-munitions": "silver-bullet",
  "station-retrofit": "radio-tower",
  "build-helicopter": "helicopter",
  "make-plasma": "chemical-drop",
  "make-blockers": "spray",
  "make-sterilisers": "desk-lamp",
  "make-inserts": "checked-shield",
  // Actions and things
  close: "cross-mark",
  funds: "coins",
  secrecy: "cloak",
  lead: "magnifying-glass",
  sigint: "satellite-communication",
  asset: "shaking-hands",
  hire: "shaking-hands",
  release: "exit-door",
  destroy: "fire",
  turn: "body-swapping",
  sell: "receive-money",
  buy: "pay-money",
  abandon: "trash-can",
  start: "play-button",
  time: "hourglass",
  done: "check-mark",
  locked: "padlock",
  fuel: "fuel-tank",
  build: "hammer-nails",
  expand: "hammer-nails",
  findings: "scroll-unfurled",
  unlocks: "key",
  // The battlescape
  shoot: "crosshair",
  overwatch: "eye-target",
  hunker: "checked-shield",
  reload: "reload-gun-barrel",
  evacuate: "exit-door",
  door: "exit-door",
  "end-turn": "hourglass",
  rifle: "ak47",
  pistol: "pistol-gun",
  shotgun: "shotgun",
  claws: "claws",
  "next-unit": "next-button",
  knife: "bowie-knife",
  capture: "manacles",
  smg: "uzi",
  // Equipment
  armoury: "ammo-box",
  "soft-vest": "kevlar-vest",
  "tactical-vest": "armor-vest",
  incendiary: "fire-bomb",
  medkit: "first-aid-kit",
  "pistol-sd": "silenced",
  "rifle-sd": "ak47",
  helmet: "brodie-helmet",
  "mag-pistol": "bullets",
  "mag-smg": "machine-gun-magazine",
  "mag-rifle": "machine-gun-magazine",
  "mag-pistol-silver": "silver-bullet",
  "mag-smg-silver": "silver-bullet",
  "mag-rifle-silver": "silver-bullet",
  "biopsy-kit": "syringe",
  "uhmwpe-vest": "kevlar-vest",
  "stf-vest": "kevlar-vest",
  "heavy-plate": "breastplate",
  "trauma-kit-adv": "medical-pack",
  "uv-flare": "sunbeams",
  "tissue-sample": "corked-tube",
  "fuel-tanks": "jerrycan",
  archives: "scroll-unfurled",
  shells: "shotgun-rounds",
  "shotgun-semi": "shotgun",
  m249: "machine-gun",
  m240b: "autogun",
  "box-m249": "ammo-box",
  "belt-m240b": "heavy-bullets",
  m110: "winchester-rifle",
  "mag-m110": "machine-gun-magazine",
  rpg: "missile-launcher",
  rocket: "rocket",
  // The inventory
  inventory: "backpack",
  "use-item": "light-backpack",
  burst: "bullet-impacts",
  snap: "on-target",
  aimed: "target-laser",
};

const missing = Object.entries(ICONS)
  .filter(([, theirs]) => !set.icons[theirs])
  .map(([ours, theirs]) => `${ours} → ${theirs}`);
if (missing.length) {
  console.error(`Not in game-icons: ${missing.join(", ")}`);
  process.exit(1);
}

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const file = path.join(root, "src/ui/icons.generated.ts");
// Each game-icon once; our names point at them.
const used = [...new Set(Object.values(ICONS))];
const bodies = used.map((n) => `  ${JSON.stringify(n)}: ${JSON.stringify(set.icons[n].body)},`);
const names = Object.entries(ICONS).map(
  ([k, n]) => `  ${JSON.stringify(k)}: B[${JSON.stringify(n)}],`,
);
fs.writeFileSync(
  file,
  `// Generated by scripts/build-icons.mjs from game-icons.net (CC BY 3.0). Do not edit.\n` +
    `// Each is the inside of a 512×512 SVG, drawn in currentColor.\n` +
    `const B = {\n${bodies.join("\n")}\n};\n\nexport const ICONS = {\n${names.join("\n")}\n} as const;\n\nexport type IconName = keyof typeof ICONS;\n`,
);
console.log(
  `${Object.keys(ICONS).length} names, ${used.length} icons → ${path.relative(root, file)} (${Math.round(fs.statSync(file).size / 1024)} KB)`,
);
