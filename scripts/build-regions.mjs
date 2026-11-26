// Builds the region map from Natural Earth (public domain) GeoJSON.
//
//   node scripts/build-regions.mjs <dir-with-natural-earth-geojson>
//
// Needs ne_50m_admin_0_countries, ne_50m_admin_1_states_provinces and
// ne_50m_populated_places_simple (.geojson) from
// https://github.com/nvkelso/natural-earth-vector/tree/master/geojson
//
// Writes:
//   public/assets/regions.png        4096x2048 equirectangular, 8-bit gray:
//                                    pixel = region index + 1 (0 = sea / none)
//   src/data/regions.generated.json  per region: label point, area share, cities
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";

const W = 4096;
const H = 2048;
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const src = process.argv[2];
if (!src) {
  console.error("usage: node scripts/build-regions.mjs <natural-earth-geojson-dir>");
  process.exit(1);
}
const load = (name) => JSON.parse(fs.readFileSync(path.join(src, `${name}.geojson`), "utf8"));

const { regions } = JSON.parse(fs.readFileSync(path.join(root, "src/data/regions.json"), "utf8"));
if (regions.length > 254) throw new Error("too many regions for an 8-bit map");

// ----- Which feature belongs to which region -----
const byCountry = new Map(); // ADM0_A3 -> region index
const byState = new Map(); //   "RUS/Krasnoyarsk" -> region index
const splitCountries = new Set();
regions.forEach((r, i) => {
  for (const c of r.countries ?? []) {
    if (byCountry.has(c)) throw new Error(`${c} is in two regions`);
    byCountry.set(c, i);
  }
  for (const [c, names] of Object.entries(r.states ?? {})) {
    splitCountries.add(c);
    for (const n of names) byState.set(`${c}/${n}`, i);
  }
});

const raster = new Uint8Array(W * H);
const missing = [];

function fillPolygon(rings, value) {
  // Even-odd scanline fill of one polygon (outer ring + holes), in pixel space.
  const pts = rings.map((ring) =>
    ring.map(([lon, lat]) => [((lon + 180) / 360) * W, ((90 - lat) / 180) * H]),
  );
  let minY = Infinity,
    maxY = -Infinity;
  for (const ring of pts)
    for (const [, y] of ring) {
      minY = Math.min(minY, y);
      maxY = Math.max(maxY, y);
    }
  const y0 = Math.max(0, Math.floor(minY)),
    y1 = Math.min(H - 1, Math.ceil(maxY));
  const xs = [];
  for (let y = y0; y <= y1; y++) {
    const cy = y + 0.5;
    xs.length = 0;
    for (const ring of pts)
      for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
        const [xi, yi] = ring[i],
          [xj, yj] = ring[j];
        if (yi > cy !== yj > cy) xs.push(xi + ((cy - yi) / (yj - yi)) * (xj - xi));
      }
    xs.sort((a, b) => a - b);
    for (let k = 0; k + 1 < xs.length; k += 2) {
      const a = Math.max(0, Math.ceil(xs[k] - 0.5)),
        b = Math.min(W - 1, Math.floor(xs[k + 1] - 0.5));
      for (let x = a; x <= b; x++) raster[y * W + x] = value;
    }
  }
}

function fillFeature(f, value) {
  const g = f.geometry;
  if (!g) return;
  const polys =
    g.type === "Polygon" ? [g.coordinates] : g.type === "MultiPolygon" ? g.coordinates : [];
  for (const p of polys) fillPolygon(p, value);
}

const admin0 = load("ne_50m_admin_0_countries");
const assigned = new Set();
for (const f of admin0.features) {
  const code = f.properties.ADM0_A3;
  if (splitCountries.has(code)) continue;
  const r = byCountry.get(code);
  if (r === undefined) {
    missing.push(`${code} ${f.properties.NAME}`);
    continue;
  }
  fillFeature(f, r + 1);
  assigned.add(code);
}
for (const c of byCountry.keys())
  if (!assigned.has(c)) console.warn(`warning: country ${c} not found in admin-0 data`);

const admin1 = load("ne_50m_admin_1_states_provinces");
const usedStates = new Set();
for (const f of admin1.features) {
  const c = f.properties.adm0_a3;
  if (!splitCountries.has(c)) continue;
  const key = `${c}/${f.properties.name}`;
  const r = byState.get(key);
  if (r === undefined) {
    console.warn(`warning: ${key} is not in any region`);
    continue;
  }
  fillFeature(f, r + 1);
  usedStates.add(key);
}
for (const k of byState.keys())
  if (!usedStates.has(k)) console.warn(`warning: state ${k} not found in admin-1 data`);

// ----- Per-region stats: label point (mean direction of its pixels), area -----
const sum = regions.map(() => ({ x: 0, y: 0, z: 0, w: 0 }));
for (let y = 0; y < H; y++) {
  const lat = ((90 - (y + 0.5) * (180 / H)) * Math.PI) / 180;
  const cosLat = Math.cos(lat);
  for (let x = 0; x < W; x++) {
    const v = raster[y * W + x];
    if (!v) continue;
    const lon = ((((x + 0.5) * 360) / W - 180) * Math.PI) / 180;
    const s = sum[v - 1];
    s.x += cosLat * Math.cos(lon) * cosLat; // weight by cos(lat): equal-area
    s.y += cosLat * Math.sin(lon) * cosLat;
    s.z += Math.sin(lat) * cosLat;
    s.w += cosLat;
  }
}
const totalArea = sum.reduce((a, s) => a + s.w, 0);

const regionAt = (lat, lon) => {
  const x = Math.min(W - 1, Math.max(0, Math.floor(((lon + 180) / 360) * W)));
  const y = Math.min(H - 1, Math.max(0, Math.floor(((90 - lat) / 180) * H)));
  return raster[y * W + x] - 1;
};

// ----- Cities: the biggest populated places inside each region -----
// Natural Earth uses some outdated, local or misspelled names.
const CITY_NAMES = {
  Kiev: "Kyiv",
  Odessa: "Odesa",
  Lvov: "Lviv",
  Kobenhavn: "Copenhagen",
  Shenyeng: "Shenyang",
  Rangoon: "Yangon",
  "Bur Said": "Port Said",
  Banghazi: "Benghazi",
  Xian: "Xi'an",
  "Ulan Ude": "Ulan-Ude",
  "Yuzhno Sakhalinsk": "Yuzhno-Sakhalinsk",
  "Petropavlovsk Kamchatskiy": "Petropavlovsk-Kamchatsky",
  Agana: "Hagatna",
  Samarqand: "Samarkand",
};
const places = load("ne_50m_populated_places_simple")
  .features.map((f) => {
    const raw = f.properties.nameascii || f.properties.name;
    return {
      name: CITY_NAMES[raw] ?? raw,
      lat: f.properties.latitude,
      lon: f.properties.longitude,
      pop: f.properties.pop_max,
    };
  })
  .sort((a, b) => b.pop - a.pop);
// Coastal cities often sit on a sea pixel of the simplified coastline: look
// up to ~0.7 degrees around for the nearest land pixel.
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
const cities = regions.map(() => []);
for (const p of places) {
  const r = regionNear(p.lat, p.lon);
  if (r >= 0 && cities[r].length < 8 && !cities[r].some((c) => c.name === p.name))
    cities[r].push({ name: p.name, lat: +p.lat.toFixed(3), lon: +p.lon.toFixed(3), pop: p.pop });
}

const out = {};
regions.forEach((r, i) => {
  const s = sum[i];
  if (!s.w) throw new Error(`region ${r.id} has no area`);
  const len = Math.hypot(s.x, s.y, s.z);
  let label = {
    lat: (Math.asin(s.z / len) * 180) / Math.PI,
    lon: (Math.atan2(s.y, s.x) * 180) / Math.PI,
  };
  // A crescent-shaped region's mean can fall outside it: fall back to its biggest city.
  if (regionAt(label.lat, label.lon) !== i && cities[i][0])
    label = { lat: cities[i][0].lat, lon: cities[i][0].lon };
  if (!cities[i].length) console.warn(`warning: region ${r.id} has no cities`);
  out[r.id] = {
    index: i + 1,
    label: { lat: +label.lat.toFixed(3), lon: +label.lon.toFixed(3) },
    area: +(s.w / totalArea).toFixed(5),
    cities: cities[i],
  };
});

// ----- Write a grayscale PNG -----
function crc32(buf) {
  let c,
    crc = ~0;
  for (let n = 0; n < buf.length; n++) {
    c = (crc ^ buf[n]) & 0xff;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    crc = (crc >>> 8) ^ c;
  }
  return ~crc >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(W, 0);
ihdr.writeUInt32BE(H, 4);
ihdr[8] = 8;
ihdr[9] = 0;
ihdr[10] = 0;
ihdr[11] = 0;
ihdr[12] = 0; // 8-bit grayscale
const rows = Buffer.alloc((W + 1) * H);
for (let y = 0; y < H; y++) {
  rows[y * (W + 1)] = 0;
  Buffer.from(raster.buffer, y * W, W).copy(rows, y * (W + 1) + 1);
}
const png = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  chunk("IHDR", ihdr),
  chunk("IDAT", zlib.deflateSync(rows, { level: 9 })),
  chunk("IEND", Buffer.alloc(0)),
]);
fs.writeFileSync(path.join(root, "public/assets/regions.png"), png);
fs.writeFileSync(
  path.join(root, "src/data/regions.generated.json"),
  JSON.stringify(out, null, 1) + "\n",
);

console.log(`regions.png ${(png.length / 1024).toFixed(0)} KB, ${regions.length} regions`);
if (missing.length) console.log(`unassigned (sea/none): ${missing.join(", ")}`);
