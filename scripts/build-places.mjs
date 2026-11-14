// Builds the naming gazetteer: every Natural Earth populated place (public
// domain), assigned to a region with the region map. Used to suggest names for
// new installations ("Station Szeged") from the nearest town.
//
//   node scripts/build-places.mjs <dir-with-natural-earth-geojson>
//
// Needs ne_10m_populated_places_simple.geojson from
// https://github.com/nvkelso/natural-earth-vector/tree/master/geojson
// and public/assets/regions.png (from scripts/build-regions.mjs).
//
// Writes src/data/places.generated.json: { regionId: [[name, lat, lon], ...] },
// biggest first.
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const src = process.argv[2];
if (!src) {
  console.error("usage: node scripts/build-places.mjs <natural-earth-geojson-dir>");
  process.exit(1);
}

// ----- Read the region map (8-bit grayscale, written by build-regions.mjs) -----
const png = fs.readFileSync(path.join(root, "public/assets/regions.png"));
let W = 0, H = 0;
const idat = [];
for (let off = 8; off < png.length; ) {
  const len = png.readUInt32BE(off);
  const type = png.toString("ascii", off + 4, off + 8);
  const data = png.subarray(off + 8, off + 8 + len);
  if (type === "IHDR") {
    W = data.readUInt32BE(0);
    H = data.readUInt32BE(4);
    if (data[8] !== 8 || data[9] !== 0 || data[12] !== 0) throw new Error("regions.png: expected 8-bit grayscale, not interlaced");
  } else if (type === "IDAT") idat.push(data);
  off += 12 + len;
}
const rows = zlib.inflateSync(Buffer.concat(idat));
const raster = new Uint8Array(W * H);
for (let y = 0; y < H; y++) {
  if (rows[y * (W + 1)] !== 0) throw new Error("regions.png: unexpected row filter");
  rows.copy(raster, y * W, y * (W + 1) + 1, (y + 1) * (W + 1));
}
const regionAt = (lat, lon) => {
  const x = Math.min(W - 1, Math.max(0, Math.floor(((lon + 180) / 360) * W)));
  const y = Math.min(H - 1, Math.max(0, Math.floor(((90 - lat) / 180) * H)));
  return raster[y * W + x] - 1;
};
// Coastal towns can sit on a sea pixel: look up to ~0.7 degrees around.
const regionNear = (lat, lon) => {
  const r = regionAt(lat, lon);
  if (r >= 0) return r;
  const step = 180 / H;
  for (let d = 1; d <= 16; d++)
    for (let dy = -d; dy <= d; dy++)
      for (let dx = -d; dx <= d; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== d) continue;
        const q = regionAt(lat + dy * step, lon + dx * step);
        if (q >= 0) return q;
      }
  return -1;
};

// ----- Places -----
const { regions } = JSON.parse(fs.readFileSync(path.join(root, "src/data/regions.json"), "utf8"));
// Same corrections as build-regions.mjs, plus a few more for smaller towns.
const NAMES = {
  Kiev: "Kyiv", Odessa: "Odesa", Lvov: "Lviv", Kobenhavn: "Copenhagen", Shenyeng: "Shenyang", Rangoon: "Yangon",
  "Bur Said": "Port Said", Banghazi: "Benghazi", Xian: "Xi'an", "Ulan Ude": "Ulan-Ude", "Yuzhno Sakhalinsk": "Yuzhno-Sakhalinsk",
  "Petropavlovsk Kamchatskiy": "Petropavlovsk-Kamchatsky", Agana: "Hagatna", Samarqand: "Samarkand",
};
const features = JSON.parse(fs.readFileSync(path.join(src, "ne_10m_populated_places_simple.geojson"), "utf8")).features;
const out = Object.fromEntries(regions.map((r) => [r.id, []]));
const seen = regions.map(() => new Set());
const sorted = features
  .map((f) => ({ name: f.properties.nameascii || f.properties.name, lat: f.properties.latitude, lon: f.properties.longitude, pop: f.properties.pop_max }))
  .sort((a, b) => b.pop - a.pop);
let dropped = 0;
for (const p of sorted) {
  const r = regionNear(p.lat, p.lon);
  const name = NAMES[p.name] ?? p.name;
  if (r < 0 || !regions[r]) { dropped++; continue; }
  if (seen[r].has(name)) continue;
  seen[r].add(name);
  out[regions[r].id].push([name, +p.lat.toFixed(2), +p.lon.toFixed(2)]);
}
const text = "{\n" + Object.entries(out).map(([id, list]) => ` ${JSON.stringify(id)}: ${JSON.stringify(list)}`).join(",\n") + "\n}\n";
fs.writeFileSync(path.join(root, "src/data/places.generated.json"), text);
const counts = Object.values(out).map((l) => l.length);
console.log(`places.generated.json ${(text.length / 1024).toFixed(0)} KB, ${counts.reduce((a, b) => a + b, 0)} places (min ${Math.min(...counts)} per region), ${dropped} at sea`);
