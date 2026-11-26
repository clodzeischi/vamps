// The material preview (dev tool, `npm run materials`): every procedural
// material in render/shaders/materials.ts on a sample, under a sun or, at
// night, a lamp that circles so the relief shows. Click a name to fly to it.
// Not part of the game or its build.
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { emptyMap } from "../tactical/map/map";
import { MATERIALS, makeMaterial, type MaterialKey } from "../render/shaders/materials";
import { roadMap, setRoadMap } from "../render/shaders/road";
import { TILE } from "../render/scale";

const keys = (Object.keys(MATERIALS) as MaterialKey[]).filter((k) => k !== "plain");
const COLS = 6, GAP = 7.5;
const at = (i: number) => ({ x: (i % COLS) * GAP + GAP / 2, z: Math.floor(i / COLS) * GAP + GAP / 2 });

// Renderer, scene, camera.
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.15;
document.getElementById("view")!.appendChild(renderer.domElement);
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x6f8aa8);
const camera = new THREE.PerspectiveCamera(38, 1, 0.05, 500);
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;

const sky = new THREE.HemisphereLight(0xcfe0ff, 0x6a5a48, 1.9);
const sun = new THREE.DirectionalLight(0xfff2dc, 2.6);
const span = COLS * GAP, depth = Math.ceil(keys.length / COLS) * GAP;
sun.position.set(span / 2 - 30, 45, depth / 2 + 25);
sun.target.position.set(span / 2, 0, depth / 2);
sun.castShadow = true;
sun.shadow.mapSize.set(4096, 4096);
Object.assign(sun.shadow.camera, { left: -45, right: 45, top: 45, bottom: -45, far: 150 });
sun.shadow.bias = -0.0005;
const lamp = new THREE.PointLight(0xffc880, 0, 14, 1.6);
lamp.castShadow = true;
const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.08), new THREE.MeshBasicMaterial({ color: 0xfff0c0 }));
lamp.add(bulb);
scene.add(sky, sun, sun.target, lamp);

// The road sample gets a road map: a 3-tile road running down its slab, so markings show.
const tilesW = Math.ceil(span / TILE), tilesH = Math.ceil(depth / TILE);
const ri = keys.indexOf("road"), rp = at(ri);
const roadX0 = Math.floor(rp.x / TILE) - 1;
setRoadMap(roadMap(emptyMap(tilesW, tilesH, 1, 0, "urban", 1), (x, y) =>
  x >= roadX0 && x <= roadX0 + 2 && Math.abs(y * TILE - rp.z) < GAP / 2 ? "road" : null));

// The samples: scenery on a slab with a block standing on it; models as a figure and a gun, turning.
const box = new THREE.BoxGeometry(1, 1, 1);
const turning: THREE.Object3D[] = [];
const samples = keys.map((k, i) => {
  const spec = MATERIALS[k];
  const mat = makeMaterial(k, spec.colour);
  const g = new THREE.Group();
  const p = at(i);
  g.position.set(p.x, 0, p.z);
  const add = (sx: number, sy: number, sz: number, x: number, y: number, z: number, parent: THREE.Object3D = g) => {
    const m = new THREE.Mesh(box, mat);
    m.scale.set(sx, sy, sz);
    m.position.set(x, y, z);
    m.castShadow = m.receiveShadow = true;
    parent.add(m);
    return m;
  };
  if ("object" in spec && spec.object) {
    const plinth = new THREE.Mesh(box, new THREE.MeshStandardMaterial({ color: 0x55524c, roughness: 0.9 }));
    plinth.scale.set(3, 0.1, 3);
    plinth.position.y = 0.05;
    plinth.receiveShadow = true;
    g.add(plinth);
    const spin = new THREE.Group();
    spin.position.y = 0.1;
    add(0.55, 1.5, 0.36, 0, 0.75, 0, spin);
    add(0.25, 0.25, 0.25, 0, 1.65, 0, spin);
    add(0.9, 0.09, 0.09, 0.45, 1.0, 0.26, spin);
    add(0.12, 0.25, 0.08, 0.25, 0.85, 0.26, spin);
    g.add(spin);
    turning.push(spin);
  } else {
    add(4.5, 0.1, 4.5, 0, 0.05, 0);
    add(1.5, 2.4, 0.3, -0.6, 1.3, -0.9);
    add(1.2, 1.2, 1.2, 1.1, 0.7, 0.9);
  }
  scene.add(g);
  return { k, g };
});
// Ground between samples.
const floor = new THREE.Mesh(new THREE.PlaneGeometry(span + 20, depth + 20).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x2a2a2c, roughness: 1 }));
floor.position.set(span / 2, -0.001, depth / 2);
floor.receiveShadow = true;
scene.add(floor);

// The list, and labels over the samples.
const list = document.getElementById("list")!;
const labels = document.getElementById("labels")!;
const tags = samples.map(({ k, g }) => {
  const b = document.createElement("button");
  b.innerHTML = `<b>${k}</b><span>${MATERIALS[k].about}</span>`;
  b.onclick = () => look(g.position);
  list.appendChild(b);
  const t = document.createElement("div");
  t.className = "tag";
  t.textContent = k;
  labels.appendChild(t);
  return { t, g };
});

let fly: { from: THREE.Vector3; to: THREE.Vector3; camFrom: THREE.Vector3; camTo: THREE.Vector3; t: number } | null = null;
function look(p: THREE.Vector3) {
  const to = p.clone().add(new THREE.Vector3(0, 0.9, 0));
  fly = { from: controls.target.clone(), to, camFrom: camera.position.clone(), camTo: to.clone().add(new THREE.Vector3(-2.6, 2.4, 4.2)), t: 0 };
}
camera.position.set(span / 2 - 10, 34, depth + 18);
controls.target.set(span / 2, 0, depth / 2);

// Day or night.
const nightBox = document.getElementById("night") as HTMLInputElement;
const setNight = (night: boolean) => {
  sky.intensity = night ? 0.25 : 1.9;
  sun.intensity = night ? 0.15 : 2.6;
  lamp.intensity = night ? 60 : 0;
  bulb.visible = night;
  (scene.background as THREE.Color).setHex(night ? 0x0c0e14 : 0x6f8aa8);
};
let night = false;
nightBox.onchange = () => setNight((night = nightBox.checked));
if (location.hash.includes("night")) (nightBox.checked = true), setNight((night = true));
const sheetBoxEl = document.getElementById("sheet") as HTMLInputElement;
if (location.hash.includes("sheet")) sheetBoxEl.checked = true;

function resize() {
  const w = window.innerWidth - 300, h = window.innerHeight;
  renderer.setSize(w, h);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
window.addEventListener("resize", resize);
resize();

// Close-ups: every sample at once, each in its own tile of the view (lit by the sun; night shows the lamp in the main view).
const sheetBox = document.getElementById("sheet") as HTMLInputElement;
const sheetCam = new THREE.PerspectiveCamera(38, 1, 0.05, 100);
const sheetTags = samples.map(({ k }) => {
  const t = document.createElement("div");
  t.className = "tag";
  t.textContent = k;
  labels.appendChild(t);
  return t;
});
function drawSheet(w: number, h: number) {
  const cols = Math.ceil(Math.sqrt(samples.length * (w / h)));
  const rows = Math.ceil(samples.length / cols);
  const tw = Math.floor(w / cols), th = Math.floor(h / rows);
  renderer.setScissorTest(true);
  samples.forEach(({ k, g }, i) => {
    const cx = (i % cols) * tw, cy = Math.floor(i / cols) * th;
    const model = "object" in MATERIALS[k];
    const target = g.position.clone().add(new THREE.Vector3(model ? 0.1 : -0.2, model ? 1.0 : 0.6, model ? 0 : -0.2));
    sheetCam.position.copy(target).add(model ? new THREE.Vector3(-0.9, 0.35, 1.5) : new THREE.Vector3(-1.5, 1.6, 2.4));
    sheetCam.lookAt(target);
    sheetCam.aspect = tw / th;
    sheetCam.updateProjectionMatrix();
    renderer.setViewport(cx, h - cy - th, tw, th);
    renderer.setScissor(cx, h - cy - th, tw, th);
    renderer.render(scene, sheetCam);
    const tag = sheetTags[i]!;
    tag.style.display = "";
    tag.style.transform = `translate(${cx + 4}px, ${cy + 4}px)`;
  });
  renderer.setScissorTest(false);
  renderer.setViewport(0, 0, w, h);
}

const clock = new THREE.Clock();
const v = new THREE.Vector3();
renderer.setAnimationLoop(() => {
  const dt = clock.getDelta(), t = clock.elapsedTime;
  for (const s of turning) s.rotation.y += dt * 0.4;
  // The lamp circles whatever the camera looks at.
  lamp.position.set(controls.target.x + Math.cos(t * 0.5) * 3, 2.6, controls.target.z + Math.sin(t * 0.5) * 3);
  if (fly) {
    fly.t = Math.min(1, fly.t + dt * 1.2);
    const e = fly.t * fly.t * (3 - 2 * fly.t);
    controls.target.lerpVectors(fly.from, fly.to, e);
    camera.position.lerpVectors(fly.camFrom, fly.camTo, e);
    if (fly.t >= 1) fly = null;
  }
  controls.update();
  const w = renderer.domElement.clientWidth, h = renderer.domElement.clientHeight;
  if (sheetBox.checked) {
    for (const { t: el } of tags) el.style.display = "none";
    if (night) lamp.position.set(0, -100, 0);
    drawSheet(w, h);
    return;
  }
  for (const t of sheetTags) t.style.display = "none";
  renderer.render(scene, camera);
  for (const { t: el, g } of tags) {
    v.copy(g.position).add(new THREE.Vector3(0, 3, 0));
    const behind = v.clone().applyMatrix4(camera.matrixWorldInverse).z > 0;
    v.project(camera);
    el.style.display = behind ? "none" : "";
    el.style.transform = `translate(${((v.x + 1) * w) / 2}px, ${((1 - v.y) * h) / 2}px) translate(-50%, -100%)`;
  }
});
