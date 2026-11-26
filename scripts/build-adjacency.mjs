// Builds the region adjacency used for SIGINT spill-over: two regions are
// neighbours if they share a border or face each other across a short stretch
// of sea (the Channel, Gibraltar, the Sicilian narrows...).
//
//   node scripts/build-adjacency.mjs
//
// Reads public/assets/regions.png (from scripts/build-regions.mjs) and
// src/data/regions.json; writes src/data/adjacency.generated.json:
// { regionId: [neighbourId, ...] }.
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
/** How far apart two coasts can be and still count as neighbours. */
const SEA_GAP_KM = 160;
/** Contacts made only by overseas territories (French Guiana, Reunion, the
 *  French Antilles, Greenland), which a station at home wouldn't hear. */
const EXCLUDE = [
  ["france_benelux", "andean_north"],
  ["france_benelux", "brazil"],
  ["france_benelux", "caribbean"],
  ["france_benelux", "southern_africa"],
  ["nordic", "canada_west"],
];

const png = fs.readFileSync(path.join(root, "public/assets/regions.png"));
let W = 0,
  H = 0;
const idat = [];
for (let off = 8; off < png.length;) {
  const len = png.readUInt32BE(off);
  const type = png.toString("ascii", off + 4, off + 8);
  const data = png.subarray(off + 8, off + 8 + len);
  if (type === "IHDR") {
    W = data.readUInt32BE(0);
    H = data.readUInt32BE(4);
    if (data[8] !== 8 || data[9] !== 0 || data[12] !== 0)
      throw new Error("regions.png: expected 8-bit grayscale, not interlaced");
  } else if (type === "IDAT") idat.push(data);
  off += 12 + len;
}
const rows = zlib.inflateSync(Buffer.concat(idat));
const px = new Uint8Array(W * H);
for (let y = 0; y < H; y++) {
  if (rows[y * (W + 1)] !== 0) throw new Error("regions.png: unexpected row filter");
  rows.copy(px, y * W, y * (W + 1) + 1, (y + 1) * (W + 1));
}

const { regions } = JSON.parse(fs.readFileSync(path.join(root, "src/data/regions.json"), "utf8"));
const pairs = regions.map(() => new Set());
const kmPerPxY = 20015 / H;
const at = (x, y) => px[y * W + (((x % W) + W) % W)];

for (let y = 1; y < H - 1; y++) {
  const lat = 90 - ((y + 0.5) / H) * 180;
  const kmPerPxX = Math.max(1, (40075 / W) * Math.cos((lat * Math.PI) / 180));
  const rx = Math.min(W / 4, Math.ceil(SEA_GAP_KM / kmPerPxX));
  const ry = Math.ceil(SEA_GAP_KM / kmPerPxY);
  const sx = Math.max(1, Math.floor(rx / 12));
  const sy = Math.max(1, Math.floor(ry / 12));
  for (let x = 0; x < W; x++) {
    const v = at(x, y);
    if (!v) continue;
    // Only edge pixels can be next to another region.
    if (at(x - 1, y) === v && at(x + 1, y) === v && at(x, y - 1) === v && at(x, y + 1) === v)
      continue;
    for (let dy = -ry; dy <= ry; dy += sy) {
      const yy = y + dy;
      if (yy < 0 || yy >= H) continue;
      for (let dx = -rx; dx <= rx; dx += sx) {
        const km = Math.hypot(dx * kmPerPxX, dy * kmPerPxY);
        if (km > SEA_GAP_KM) continue;
        const w = at(x + dx, yy);
        if (w && w !== v) pairs[v - 1]?.add(w - 1);
      }
    }
    // Shared borders: direct neighbours always count.
    for (const w of [at(x - 1, y), at(x + 1, y), at(x, y - 1), at(x, y + 1)])
      if (w && w !== v) pairs[v - 1]?.add(w - 1);
  }
}

const idx = Object.fromEntries(regions.map((r, i) => [r.id, i]));
for (const [a, b] of EXCLUDE) {
  if (!(a in idx) || !(b in idx)) throw new Error(`EXCLUDE: unknown region in ${a}/${b}`);
  pairs[idx[a]].delete(idx[b]);
  pairs[idx[b]].delete(idx[a]);
}
const out = {};
regions.forEach((r, i) => {
  const set = new Set([...pairs[i]].filter((j) => regions[j]));
  for (let j = 0; j < regions.length; j++) if (pairs[j].has(i) && regions[j]) set.add(j); // symmetric
  out[r.id] = [...set].map((j) => regions[j].id).sort();
});
const text =
  "{\n" +
  Object.entries(out)
    .map(([id, l]) => ` ${JSON.stringify(id)}: ${JSON.stringify(l)}`)
    .join(",\n") +
  "\n}\n";
fs.writeFileSync(path.join(root, "src/data/adjacency.generated.json"), text);
const counts = Object.values(out).map((l) => l.length);
console.log(
  `adjacency.generated.json: ${regions.length} regions, ${counts.reduce((a, b) => a + b, 0) / 2} pairs, min ${Math.min(...counts)} max ${Math.max(...counts)}`,
);
