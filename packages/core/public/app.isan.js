import * as THREE from 'three';
import { eventsUrl } from '/themes.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

// Isan farmer theme: a stilted field hut (เถียงนา) with a thatched roof, rice paddies at sunset,
// and an old-photograph look added by the page CSS. Other themes live in app.js and app.office.js.

// Four workers in a row on the hut deck, in pipeline order.
const ROLES = [
  { id: 'SA', th: 'คนเบิ่งนา', title: 'Field Watcher', color: 0x34508a, css: '#7aa8e6', x: -6, skin: 0xd9a77f, hair: 0x15100d, accessory: 'ngop', sash: 'red' },
  { id: 'Dev', th: 'ช่างเฮ็ด', title: 'Craftsman', color: 0xb8502f, css: '#ea7a52', x: -2, skin: 0xc99772, hair: 0x15100d, accessory: 'turban', sash: 'blue' },
  { id: 'Tester', th: 'คนชิมข้าว', title: 'Rice Taster', color: 0xc89a2c, css: '#e6bb48', x: 2, skin: 0xe3b88e, hair: 0x1a120c, accessory: 'flatHat', sash: 'red' },
  { id: 'Summary', th: 'หมอลำ', title: 'Mor Lam', color: 0xa14a84, css: '#dd7bb4', x: 6, skin: 0xd2a07a, hair: 0x1a120c, accessory: 'bunFlower', sash: 'pink' },
];
const LEAD_NAME = 'พ่อใหญ่';

const IDLE_GREY = 0x9a8f7c;
const DONE_GREEN = 0x8fc77a;
const DECK_H = 0.9;
const DESK_Z = -2.95;
const DESK_H = 0.4;
const PERSON_Z = -3.85;
const MAT_TOP = 0.03;
const STAND_HIP = 1.02;
const KNEEL_HIP = 0.21;
const SCREEN_W = 640;
const SCREEN_H = 360;
const SCREEN_Y = 2.45;

// The hut deck. The front is open so the camera sees the workers and the fields beyond.
const DECK_X = 9.8;
const DECK_Z_BACK = -6;
const DECK_Z_FRONT = 1.6;
const DECK_CENTER_Z = (DECK_Z_BACK + DECK_Z_FRONT) / 2;
const ROOF_EAVE_Y = 4.7;
const ROOF_RIDGE_Y = 7.5;
const ROOF_RIDGE_Z = -2.4;

// Village headman: where he waits, and how fast he walks along the deck.
const HOME = new THREE.Vector3(-7.7, 0, -0.3);
const HOME_YAW = 0.9;
const WALK_SPEED = 2.6;
const CORRIDOR_Z = -1.2;
const TALK_SECONDS = 2.8;
const MAX_QUEUE = 3;

const container = document.getElementById('scene');
const tagLayer = document.getElementById('tags');

const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
container.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.fog = new THREE.Fog(0xd9a46c, 34, 80);
const FOV = 40;
const camera = new THREE.PerspectiveCamera(FOV, 1, 0.1, 160);
const target = new THREE.Vector3(0, 2.6, 0.4);

{
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environmentIntensity = 0.25;
}

// ---------- helpers ----------

const material = (color, opts = {}) =>
  new THREE.MeshStandardMaterial({ color, roughness: 0.85, metalness: 0.02, ...opts });

function addMesh(parent, geometry, mat, [x, y, z] = [0, 0, 0], { cast = true, receive = true } = {}) {
  const mesh = new THREE.Mesh(geometry, mat);
  mesh.position.set(x, y, z);
  mesh.castShadow = cast;
  mesh.receiveShadow = receive;
  parent.add(mesh);
  return mesh;
}

const box = (parent, size, color, pos, opts) =>
  addMesh(parent, new THREE.BoxGeometry(...size), material(color), pos, opts);

const rbox = (parent, size, color, pos, radius = 0.04, opts) =>
  addMesh(
    parent,
    new RoundedBoxGeometry(size[0], size[1], size[2], 3, Math.min(radius, Math.min(...size) / 2 - 0.001)),
    material(color),
    pos,
    opts,
  );

const cylinder = (parent, rTop, rBottom, h, color, pos, segments = 16) =>
  addMesh(parent, new THREE.CylinderGeometry(rTop, rBottom, h, segments), material(color), pos);

const sphere = (parent, r, color, pos, opts) =>
  addMesh(parent, new THREE.SphereGeometry(r, 18, 12), material(color, opts), pos);

// Deterministic pseudo random so the scenery looks the same on every load.
const seeded = (n) => {
  const v = Math.sin(n * 127.1) * 43758.5453;
  return v - Math.floor(v);
};

function makeCanvas(w, h) {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  return canvas;
}

function canvasTexture(canvas, { repeat = null } = {}) {
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = renderer.capabilities.getMaxAnisotropy();
  if (repeat) {
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(repeat[0], repeat[1]);
  }
  return texture;
}

const FONT = '"Leelawadee UI", "Tahoma", "TH Sarabun New", system-ui, sans-serif';

function truncate(text, max) {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

function turnToward(current, goal, maxStep) {
  const diff = ((goal - current + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
  return current + THREE.MathUtils.clamp(diff, -maxStep, maxStep);
}

// ---------- textures ----------

// Plaid cloth (ผ้าขาวม้า) for sashes, waist cloths and turbans.
function makePlaidTexture(base, stripe) {
  const canvas = makeCanvas(64, 64);
  const g = canvas.getContext('2d');
  g.fillStyle = base;
  g.fillRect(0, 0, 64, 64);
  g.fillStyle = stripe;
  g.globalAlpha = 0.85;
  g.fillRect(0, 8, 64, 8);
  g.fillRect(0, 40, 64, 4);
  g.fillRect(8, 0, 8, 64);
  g.fillRect(40, 0, 4, 64);
  g.globalAlpha = 1;
  return canvasTexture(canvas, { repeat: [2, 2] });
}
const PLAIDS = {
  red: makePlaidTexture('#a82f26', '#f1e6cc'),
  blue: makePlaidTexture('#22406e', '#e6dcc2'),
  pink: makePlaidTexture('#c4668f', '#f6e3cf'),
};

// Silk skirt (ผ้าซิ่น) with horizontal bands.
function makeSinTexture(a, b) {
  const canvas = makeCanvas(64, 64);
  const g = canvas.getContext('2d');
  g.fillStyle = a;
  g.fillRect(0, 0, 64, 64);
  g.fillStyle = b;
  g.fillRect(0, 10, 64, 10);
  g.fillRect(0, 36, 64, 4);
  g.fillStyle = '#e6c26a';
  g.fillRect(0, 22, 64, 3);
  return canvasTexture(canvas, { repeat: [1, 1] });
}

function makeThatchTexture() {
  const canvas = makeCanvas(256, 256);
  const g = canvas.getContext('2d');
  g.fillStyle = '#a98438';
  g.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 70; i++) {
    const x = seeded(i * 1.7) * 256;
    const w = 6 + seeded(i * 2.3) * 12;
    g.fillStyle = seeded(i * 3.1) > 0.5 ? 'rgba(235, 205, 130, 0.35)' : 'rgba(80, 52, 20, 0.3)';
    g.fillRect(x, 0, w, 256);
  }
  g.fillStyle = 'rgba(70, 45, 18, 0.45)';
  for (let y = 0; y < 256; y += 64) g.fillRect(0, y, 256, 4);
  return canvasTexture(canvas, { repeat: [6, 1.6] });
}

// Woven bamboo (ฟาก): coarse slats so the texture does not shimmer at a distance.
function makeBambooTexture(w = 4, h = 2) {
  const canvas = makeCanvas(256, 256);
  const g = canvas.getContext('2d');
  g.fillStyle = '#b99a58';
  g.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 8; i++) {
    g.fillStyle = `rgba(${i % 2 ? '255,235,170' : '90,60,20'}, 0.18)`;
    g.fillRect(i * 32, 0, 30, 256);
    g.fillStyle = 'rgba(60, 40, 14, 0.4)';
    g.fillRect(i * 32, 0, 3, 256);
  }
  g.fillStyle = 'rgba(60, 40, 14, 0.5)';
  g.fillRect(0, 0, 256, 6);
  g.fillRect(0, 128, 256, 6);
  return canvasTexture(canvas, { repeat: [w, h] });
}

function makeDeckTexture() {
  const canvas = makeCanvas(512, 256);
  const g = canvas.getContext('2d');
  const rows = 6;
  for (let r = 0; r < rows; r++) {
    const light = 40 + seeded(r * 3.3) * 8;
    g.fillStyle = `hsl(30, 40%, ${light}%)`;
    g.fillRect(0, (r * 256) / rows, 512, 256 / rows);
    g.fillStyle = 'rgba(30, 18, 6, 0.55)';
    g.fillRect(0, (r * 256) / rows, 512, 3);
    const joint = seeded(r * 5.1) * 400 + 40;
    g.fillRect(joint, (r * 256) / rows, 3, 256 / rows);
  }
  return canvasTexture(canvas, { repeat: [ (DECK_X * 2) / 8, (DECK_Z_FRONT - DECK_Z_BACK) / 5 ] });
}

function makeMatTexture() {
  const canvas = makeCanvas(128, 128);
  const g = canvas.getContext('2d');
  g.fillStyle = '#c9a65e';
  g.fillRect(0, 0, 128, 128);
  for (let y = 0; y < 8; y++) {
    for (let x = 0; x < 8; x++) {
      g.fillStyle = (x + y) % 2 ? 'rgba(120, 70, 30, 0.35)' : 'rgba(255, 235, 170, 0.22)';
      g.fillRect(x * 16, y * 16, 16, 16);
    }
  }
  g.fillStyle = '#8c2f24';
  g.fillRect(0, 0, 128, 8);
  g.fillRect(0, 120, 128, 8);
  return canvasTexture(canvas);
}

function makeDirtTexture(base, speck) {
  const canvas = makeCanvas(256, 256);
  const g = canvas.getContext('2d');
  g.fillStyle = base;
  g.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 60; i++) {
    g.fillStyle = seeded(i) > 0.5 ? `${speck}0.12)` : 'rgba(255, 235, 190, 0.07)';
    g.beginPath();
    g.arc(seeded(i * 1.3) * 256, seeded(i * 2.9) * 256, 6 + seeded(i * 4.1) * 22, 0, Math.PI * 2);
    g.fill();
  }
  return canvasTexture(canvas, { repeat: [10, 8] });
}

// Water in the paddies mirrors the sunset sky.
function makeWaterTexture() {
  const canvas = makeCanvas(128, 256);
  const g = canvas.getContext('2d');
  const grad = g.createLinearGradient(0, 0, 0, 256);
  grad.addColorStop(0, '#6a5a8a');
  grad.addColorStop(0.35, '#d9805a');
  grad.addColorStop(0.7, '#f2b66e');
  grad.addColorStop(1, '#e89a58');
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 256);
  g.fillStyle = 'rgba(255, 240, 200, 0.18)';
  for (let i = 0; i < 9; i++) g.fillRect(0, 12 + i * 28 + seeded(i) * 10, 128, 6);
  return canvasTexture(canvas);
}

// Sunset sky, sun and layered hills painted on a backdrop behind the field.
function makeBackdropTexture() {
  const canvas = makeCanvas(2048, 1024);
  const g = canvas.getContext('2d');
  const sky = g.createLinearGradient(0, 0, 0, 760);
  sky.addColorStop(0, '#2d3b66');
  sky.addColorStop(0.35, '#7a5a8c');
  sky.addColorStop(0.62, '#e07a58');
  sky.addColorStop(0.85, '#f6b96c');
  sky.addColorStop(1, '#f3c987');
  g.fillStyle = sky;
  g.fillRect(0, 0, 2048, 1024);
  const sun = g.createRadialGradient(560, 700, 10, 560, 700, 340);
  sun.addColorStop(0, 'rgba(255, 244, 200, 1)');
  sun.addColorStop(0.18, 'rgba(255, 214, 140, 0.95)');
  sun.addColorStop(1, 'rgba(255, 160, 90, 0)');
  g.fillStyle = sun;
  g.fillRect(0, 300, 1400, 724);
  g.fillStyle = 'rgba(255, 190, 150, 0.35)';
  for (let i = 0; i < 9; i++) {
    g.beginPath();
    g.ellipse(200 + i * 220, 190 + seeded(i * 3) * 200, 200 + seeded(i) * 120, 20 + seeded(i * 2) * 14, 0, 0, Math.PI * 2);
    g.fill();
  }
  const hills = [['#8f6f8e', 700, 60], ['#6d5a78', 770, 48], ['#4a4458', 830, 38]];
  hills.forEach(([color, base, amp], layer) => {
    g.fillStyle = color;
    g.beginPath();
    g.moveTo(0, 1024);
    for (let x = 0; x <= 2048; x += 32) {
      g.lineTo(x, base - Math.sin(x * 0.004 + layer * 2) * amp - Math.sin(x * 0.011 + layer) * amp * 0.4);
    }
    g.lineTo(2048, 1024);
    g.fill();
  });
  // Sugar palm silhouettes: a slim trunk and a fan of drooping fronds.
  g.fillStyle = '#2b2a33';
  g.strokeStyle = '#2b2a33';
  g.lineCap = 'round';
  for (let i = 0; i < 24; i++) {
    const x = 40 + i * 85 + seeded(i) * 40;
    const y = 860 - seeded(i * 4) * 20;
    const h = 120 + seeded(i * 7) * 70;
    g.lineWidth = 5;
    g.beginPath();
    g.moveTo(x, y);
    g.lineTo(x + 3, y - h);
    g.stroke();
    g.lineWidth = 3.5;
    for (let k = 0; k < 9; k++) {
      const a = Math.PI + (k / 8) * Math.PI;
      const len = 46 + seeded(i * 11 + k) * 22;
      g.beginPath();
      g.moveTo(x + 3, y - h);
      g.quadraticCurveTo(x + 3 + Math.cos(a) * len * 0.7, y - h + Math.sin(a) * len * 0.9 - 6, x + 3 + Math.cos(a) * len, y - h + Math.sin(a) * len * 0.5 + 16);
      g.stroke();
    }
  }
  return canvasTexture(canvas);
}

// ---------- lights ----------

scene.add(new THREE.HemisphereLight(0xffd9b0, 0x5a4636, 0.6));

const sun = new THREE.DirectionalLight(0xffa860, 2.1);
sun.position.set(-12, 8, 12);
sun.target.position.set(0, 0, 0);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.left = -16;
sun.shadow.camera.right = 16;
sun.shadow.camera.top = 14;
sun.shadow.camera.bottom = -12;
sun.shadow.camera.near = 1;
sun.shadow.camera.far = 50;
sun.shadow.bias = -0.0005;
sun.shadow.normalBias = 0.03;
scene.add(sun, sun.target);

// ---------- ground, sky and paddies ----------

const world = new THREE.Group();
scene.add(world);

const backdrop = new THREE.Mesh(
  new THREE.PlaneGeometry(120, 56),
  new THREE.MeshBasicMaterial({ map: makeBackdropTexture(), fog: false, toneMapped: false }),
);
backdrop.position.set(0, 20, -22);
world.add(backdrop);

const ground = new THREE.Mesh(
  new THREE.PlaneGeometry(90, 40),
  new THREE.MeshStandardMaterial({ map: makeDirtTexture('#8c7a3e', 'rgba(60, 45, 15, '), roughness: 1 }),
);
ground.rotation.x = -Math.PI / 2;
ground.position.set(0, 0, -2);
ground.receiveShadow = true;
world.add(ground);

// Packed earth yard in front of the hut.
{
  const yard = new THREE.Mesh(
    new THREE.PlaneGeometry(34, 6.2),
    new THREE.MeshStandardMaterial({ map: makeDirtTexture('#a07a48', 'rgba(70, 45, 20, '), roughness: 1 }),
  );
  yard.rotation.x = -Math.PI / 2;
  yard.position.set(0, 0.015, DECK_Z_FRONT + 3.1);
  yard.receiveShadow = true;
  world.add(yard);
}

// Paddy plots with mud dikes (คันนา).
const waterTexture = makeWaterTexture();
const dikeMaterial = material(0x6f5330, { roughness: 1 });

function addDike(x, z, w, d) {
  const dike = addMesh(world, new THREE.BoxGeometry(w, 0.2, d), dikeMaterial, [x, 0.1, z], { cast: false });
  dike.scale.y = 1;
}

function addWaterPlot(x0, z0, w, d) {
  const plot = new THREE.Mesh(
    new THREE.PlaneGeometry(w, d),
    new THREE.MeshBasicMaterial({ map: waterTexture, toneMapped: false }),
  );
  plot.rotation.x = -Math.PI / 2;
  plot.position.set(x0 + w / 2, 0.06, z0 + d / 2);
  world.add(plot);
}

function addMudPlot(x0, z0, w, d) {
  const plot = new THREE.Mesh(new THREE.PlaneGeometry(w, d), new THREE.MeshStandardMaterial({ color: 0x5c4426, roughness: 1 }));
  plot.rotation.x = -Math.PI / 2;
  plot.position.set(x0 + w / 2, 0.05, z0 + d / 2);
  plot.receiveShadow = true;
  world.add(plot);
}

// Rice is drawn as instanced blades that sway in the wind (vertex shader).
const riceTime = { value: 0 };
const riceGeometry = new THREE.ConeGeometry(0.035, 0.5, 4, 1);
riceGeometry.translate(0, 0.25, 0);
const riceMaterial = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9 });
riceMaterial.onBeforeCompile = (shader) => {
  shader.uniforms.uTime = riceTime;
  shader.vertexShader = shader.vertexShader
    .replace('#include <common>', '#include <common>\nuniform float uTime;')
    .replace(
      '#include <begin_vertex>',
      `#include <begin_vertex>
       float sway = sin(uTime * 1.8 + instanceMatrix[3].x * 0.8 + instanceMatrix[3].z * 0.6) * 0.07;
       transformed.x += sway * position.y * 2.0;`,
    );
};

function addRice(x0, z0, w, d, { color = 0x6f9a3a, height = 0.5, spacing = 0.3, seed = 1 } = {}) {
  const nx = Math.floor(w / spacing);
  const nz = Math.floor(d / spacing);
  const mesh = new THREE.InstancedMesh(riceGeometry, riceMaterial, nx * nz);
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  const s = new THREE.Vector3();
  const p = new THREE.Vector3();
  const c = new THREE.Color();
  let i = 0;
  for (let ix = 0; ix < nx; ix++) {
    for (let iz = 0; iz < nz; iz++) {
      const r1 = seeded(i * 3.7 + seed);
      const r2 = seeded(i * 5.9 + seed * 2);
      p.set(x0 + (ix + 0.5) * spacing + (r1 - 0.5) * 0.12, 0.05, z0 + (iz + 0.5) * spacing + (r2 - 0.5) * 0.12);
      e.set((r2 - 0.5) * 0.3, r1 * 6.28, (r1 - 0.5) * 0.3);
      q.setFromEuler(e);
      s.set(1, (height * (0.8 + r1 * 0.5)) / 0.5, 1);
      m.compose(p, q, s);
      mesh.setMatrixAt(i, m);
      c.set(color).offsetHSL((r1 - 0.5) * 0.03, (r2 - 0.5) * 0.12, (r2 - 0.5) * 0.12);
      mesh.setColorAt(i, c);
      i++;
    }
  }
  mesh.castShadow = false;
  mesh.receiveShadow = true;
  mesh.frustumCulled = false;
  world.add(mesh);
}

// Front fields. Rows of plots separated by dikes.
{
  const z0 = 6.9;
  addDike(0, z0 - 0.25, 90, 0.5);
  addDike(0, 11.6, 90, 0.5);
  addDike(0, 15.6, 90, 0.5);
  for (const x of [-22, -8, 7, 21]) {
    addDike(x, 9.25, 0.5, 4.8);
    addDike(x + (x < 0 ? 3 : -3), 13.6, 0.5, 4.2);
  }
  // Row A
  addRice(-35, 7.15, 13.0, 4.1, { color: 0x6f9a3a, height: 0.5, seed: 2 });
  addRice(-21.5, 7.15, 13.0, 4.1, { color: 0x7ea845, height: 0.52, seed: 6 });
  addWaterPlot(-7.7, 7.15, 14.4, 4.1);
  addRice(-5.5, 7.6, 1.6, 0.9, { color: 0x6f9a3a, height: 0.3, seed: 5 });
  addRice(7.25, 7.15, 13.5, 4.1, { color: 0xc9a43a, height: 0.62, seed: 3 });
  // Row B
  addWaterPlot(-30, 11.85, 24, 3.5);
  addRice(-5, 11.85, 11.5, 3.5, { color: 0x7ea845, height: 0.45, seed: 4 });
  addWaterPlot(6.8, 11.85, 16, 3.5);
  addMudPlot(-4.5, 15.85, 40, 6);
}

// Rice fields behind the hut stay low: only the far strip is visible past the roof.
addRice(-30, -16, 24, 5, { color: 0xc9a43a, height: 0.62, spacing: 0.4, seed: 7 });
addRice(-4, -16, 30, 5, { color: 0x6f9a3a, height: 0.5, spacing: 0.4, seed: 8 });

// ---------- palms, haystack, jars, cart and other farm props ----------

function buildPalm(x, z, height) {
  const group = new THREE.Group();
  group.position.set(x, 0, z);
  world.add(group);
  const segments = 6;
  let lean = 0;
  for (let i = 0; i < segments; i++) {
    const h = height / segments;
    const r1 = 0.26 - i * 0.02;
    const seg = cylinder(group, r1 - 0.02, r1, h + 0.05, 0x5a4630, [lean, h * i + h / 2, 0], 10);
    lean += 0.05;
    seg.rotation.z = -0.04;
  }
  const crown = new THREE.Group();
  crown.position.set(lean, height, 0);
  group.add(crown);
  for (let i = 0; i < 11; i++) {
    const angle = (i / 11) * Math.PI * 2;
    const leaf = new THREE.Group();
    leaf.rotation.y = angle;
    crown.add(leaf);
    const blade = addMesh(leaf, new THREE.SphereGeometry(1, 8, 5), material(0x3d5a2a, { roughness: 1 }), [1.4, -0.1, 0], { cast: false });
    blade.scale.set(1.5, 0.06, 0.34);
    leaf.rotation.z = -0.35 - seeded(i) * 0.25;
  }
  for (let i = 0; i < 4; i++) sphere(crown, 0.16, 0x5a3a20, [0.15 * Math.cos(i * 1.6), -0.3, 0.15 * Math.sin(i * 1.6)]);
  group.userData.crown = crown;
  return group;
}
const palms = [
  buildPalm(-12.2, 0.6, 8.6),
  buildPalm(12.4, -1.2, 9.2),
  buildPalm(-15.5, 5.2, 7.6),
  buildPalm(15.8, 4.2, 8.0),
  buildPalm(-6, -12, 8.4),
  buildPalm(7, -13, 9),
];

function buildHaystack(x, z, scale = 1) {
  const group = new THREE.Group();
  group.position.set(x, 0, z);
  group.scale.setScalar(scale);
  world.add(group);
  cylinder(group, 0.05, 0.05, 2.4, 0x4a3322, [0, 1.2, 0], 8);
  addMesh(group, new THREE.CylinderGeometry(0.35, 1.0, 1.1, 20), material(0xc2a050, { roughness: 1 }), [0, 0.55, 0]);
  addMesh(group, new THREE.ConeGeometry(1.15, 1.2, 20), material(0xb88e3c, { roughness: 1 }), [0, 1.6, 0]);
  sphere(group, 0.14, 0xb88e3c, [0, 2.35, 0]);
}
buildHaystack(-11.6, 4.3, 1.1);
buildHaystack(-9.7, 5.4, 0.8);

// Clay water jar (ตุ่ม) turned on a lathe.
const jarGeometry = new THREE.LatheGeometry(
  [[0, 0], [0.22, 0.02], [0.4, 0.22], [0.46, 0.45], [0.38, 0.68], [0.24, 0.8], [0.27, 0.86], [0.2, 0.9], [0, 0.88]].map(([x, y]) => new THREE.Vector2(x, y)),
  22,
);
function buildJar(parent, x, y, z, scale = 1, color = 0x9b4f2d) {
  const jar = addMesh(parent, jarGeometry, material(color, { roughness: 0.55 }), [x, y, z]);
  jar.scale.setScalar(scale);
  return jar;
}
buildJar(world, -7.6, 0, 3.2, 1.2);
buildJar(world, -6.7, 0, 3.6, 1.0, 0x8a4426);
buildJar(world, -8.3, 0, 4.0, 0.9, 0xa65a34);

// Foot-pedal rice mortar (ครกกระเดื่อง).
const mortarBeam = new THREE.Group();
{
  const group = new THREE.Group();
  group.position.set(8.8, 0, 3.4);
  group.rotation.y = -0.3;
  world.add(group);
  for (const sz of [-0.3, 0.3]) box(group, [0.12, 1.1, 0.12], 0x4a3322, [0, 0.55, sz]);
  addMesh(group, new THREE.LatheGeometry([[0, 0], [0.4, 0.05], [0.42, 0.3], [0.3, 0.34], [0, 0.3]].map(([x, y]) => new THREE.Vector2(x, y)), 18), material(0x6b4a2a), [1.2, 0, 0]);
  mortarBeam.position.set(0, 1.0, 0);
  group.add(mortarBeam);
  box(mortarBeam, [2.6, 0.14, 0.16], 0x6b4a2a, [0.6, 0, 0]);
  const pestle = cylinder(mortarBeam, 0.07, 0.1, 0.9, 0x5a3a20, [1.9, -0.45, 0], 10);
  pestle.castShadow = true;
  box(mortarBeam, [0.4, 0.1, 0.4], 0x6b4a2a, [-0.9, 0.05, 0]);
}

// Ox cart (เกวียน): big spoked wheels and a plank bed.
function buildWheel(parent, x, z) {
  const wheel = new THREE.Group();
  wheel.position.set(x, 1.0, z);
  parent.add(wheel);
  const rim = addMesh(wheel, new THREE.TorusGeometry(0.95, 0.09, 8, 28), material(0x5a3a20));
  rim.rotation.y = Math.PI / 2;
  const hub = addMesh(wheel, new THREE.CylinderGeometry(0.16, 0.16, 0.3, 12), material(0x4a3020));
  hub.rotation.z = Math.PI / 2;
  for (let i = 0; i < 8; i++) {
    const spoke = box(wheel, [0.08, 0.9, 0.08], 0x6b4a2a, [0, 0, 0], { cast: true });
    spoke.rotation.x = (i / 8) * Math.PI;
  }
}
{
  const cart = new THREE.Group();
  cart.position.set(11.2, 0, 3.9);
  cart.rotation.y = 0.5;
  world.add(cart);
  buildWheel(cart, -1.1, 0);
  buildWheel(cart, 1.1, 0);
  box(cart, [2.4, 0.12, 1.6], 0x7a5a36, [0, 1.15, 0]);
  for (const sx of [-1, 1]) box(cart, [0.08, 0.5, 1.6], 0x6b4a2a, [sx * 1.15, 1.45, 0]);
  const shaft = box(cart, [0.1, 0.1, 2.4], 0x5a3a20, [0.5, 1.0, 1.9]);
  shaft.rotation.x = -0.12;
  box(cart, [1.8, 0.4, 1.2], 0xc2a050, [0, 1.45, 0], { cast: true });
}

// Chickens pecking in the yard.
const chickens = [];
function buildChicken(x, z, color, rot) {
  const group = new THREE.Group();
  group.position.set(x, 0, z);
  group.rotation.y = rot;
  world.add(group);
  const body = sphere(group, 0.2, color, [0, 0.3, 0]);
  body.scale.set(1.0, 0.8, 1.3);
  const neck = new THREE.Group();
  neck.position.set(0, 0.42, 0.18);
  group.add(neck);
  sphere(neck, 0.09, color, [0, 0.12, 0.05]);
  addMesh(neck, new THREE.ConeGeometry(0.03, 0.09, 6), material(0xe0a23a), [0, 0.11, 0.15]).rotation.x = Math.PI / 2;
  box(neck, [0.02, 0.07, 0.07], 0xc0392b, [0, 0.22, 0.04], { cast: false });
  const tail = box(group, [0.04, 0.3, 0.22], 0x3a2a1a, [0, 0.45, -0.28]);
  tail.rotation.x = 0.7;
  for (const sx of [-0.06, 0.06]) cylinder(group, 0.01, 0.01, 0.2, 0xd9a23a, [sx, 0.1, 0.02], 6);
  chickens.push({ neck, phase: seeded(x * 7 + z) * 10 });
}
buildChicken(2.5, 3.2, 0xc07838, 0.6);
buildChicken(3.4, 4.1, 0x2a2018, -0.8);
buildChicken(-2.0, 3.7, 0xe9dcc0, 2.2);
buildChicken(-0.6, 4.6, 0xb5652e, -2.4);

// Water buffalo (ควาย) grazing in the paddy.
const buffalo = { head: new THREE.Group(), tail: new THREE.Group() };
{
  const group = new THREE.Group();
  group.position.set(10.5, 0.05, 9.3);
  group.rotation.y = -2.2;
  group.scale.setScalar(1.25);
  world.add(group);
  const hide = 0x4a4540;
  const body = sphere(group, 0.7, hide, [0, 1.0, 0]);
  body.scale.set(0.8, 0.8, 1.5);
  sphere(group, 0.5, hide, [0, 1.05, 0.9]).scale.set(1, 0.95, 1);
  for (const sx of [-0.3, 0.3]) {
    for (const sz of [-0.75, 0.75]) cylinder(group, 0.12, 0.1, 0.8, 0x3a3632, [sx, 0.4, sz], 8);
  }
  buffalo.head.position.set(0, 1.15, 1.35);
  group.add(buffalo.head);
  const skull = box(buffalo.head, [0.5, 0.45, 0.7], hide, [0, -0.1, 0.25]);
  skull.rotation.x = 0.3;
  box(buffalo.head, [0.38, 0.3, 0.3], 0x5a524a, [0, -0.28, 0.62]);
  for (const sx of [-1, 1]) {
    const horn = addMesh(buffalo.head, new THREE.TorusGeometry(0.4, 0.05, 6, 16, Math.PI * 0.8), material(0xcfc7b4), [sx * 0.28, 0.02, 0.0]);
    horn.rotation.set(0.2, sx * 0.4, sx === 1 ? 0.2 : Math.PI - 0.2);
    box(buffalo.head, [0.18, 0.08, 0.14], hide, [sx * 0.3, -0.04, 0.05], { cast: false });
  }
  for (const sx of [-0.12, 0.12]) sphere(buffalo.head, 0.03, 0x111111, [sx * 1.4, -0.02, 0.5]).castShadow = false;
  buffalo.tail.position.set(0, 1.2, -1.0);
  group.add(buffalo.tail);
  cylinder(buffalo.tail, 0.03, 0.02, 0.7, hide, [0, -0.35, 0], 6);
  sphere(buffalo.tail, 0.07, 0x2a2622, [0, -0.72, 0]);
}

// Scarecrow (หุ่นไล่กา) in the front-left paddy.
const scarecrow = new THREE.Group();
{
  scarecrow.position.set(-11.5, 0.05, 9.2);
  world.add(scarecrow);
  cylinder(scarecrow, 0.05, 0.06, 2.6, 0x5a3a20, [0, 1.3, 0], 8);
  const arms = box(scarecrow, [1.8, 0.07, 0.07], 0x5a3a20, [0, 1.85, 0]);
  arms.castShadow = true;
  box(scarecrow, [0.6, 0.9, 0.3], 0x2a3f6a, [0, 1.55, 0]);
  box(scarecrow, [1.7, 0.4, 0.04], 0x2a3f6a, [0, 1.85, 0], { cast: false });
  box(scarecrow, [0.5, 0.18, 0.32], 0xa82f26, [0, 1.15, 0], { cast: false });
  const head = buildJarHead();
  head.position.set(0, 2.25, 0);
  scarecrow.add(head);
}
function buildJarHead() {
  const group = new THREE.Group();
  sphere(group, 0.24, 0x9b4f2d, [0, 0, 0], { roughness: 0.6 });
  addMesh(group, new THREE.ConeGeometry(0.55, 0.28, 20), material(0xd8bf7a), [0, 0.28, 0], { cast: false });
  sphere(group, 0.03, 0x111111, [-0.08, 0.02, 0.22]).castShadow = false;
  sphere(group, 0.03, 0x111111, [0.08, 0.02, 0.22]).castShadow = false;
  return group;
}

// Egrets standing in the water.
for (const [x, z, r] of [[-3, 9.2, 0.5], [4.5, 9.8, -1.2]]) {
  const bird = new THREE.Group();
  bird.position.set(x, 0.06, z);
  bird.rotation.y = r;
  world.add(bird);
  sphere(bird, 0.16, 0xf5f1e6, [0, 0.55, 0]).scale.set(0.8, 0.8, 1.4);
  cylinder(bird, 0.018, 0.018, 0.5, 0x2a2a20, [0, 0.25, 0], 6);
  const neck = cylinder(bird, 0.025, 0.03, 0.4, 0xf5f1e6, [0, 0.85, 0.18], 6);
  neck.rotation.x = 0.5;
  sphere(bird, 0.06, 0xf5f1e6, [0, 1.02, 0.3]);
  addMesh(bird, new THREE.ConeGeometry(0.02, 0.18, 5), material(0xe2a83a), [0, 1.02, 0.42]).rotation.x = Math.PI / 2;
}

// ---------- the hut ----------

// Stilts (เสา), deck, and the steps at the front.
const deckGroup = new THREE.Group();
world.add(deckGroup);
{
  const deck = new THREE.Mesh(
    new THREE.BoxGeometry(DECK_X * 2, 0.14, DECK_Z_FRONT - DECK_Z_BACK),
    new THREE.MeshStandardMaterial({ map: makeDeckTexture(), roughness: 0.85 }),
  );
  deck.position.set(0, DECK_H - 0.07, DECK_CENTER_Z);
  deck.castShadow = true;
  deck.receiveShadow = true;
  deckGroup.add(deck);
  for (let x = -9.2; x <= 9.3; x += 3.07) {
    for (const z of [-5.4, -2.2, 1.2]) cylinder(deckGroup, 0.15, 0.17, DECK_H, 0x5a3f26, [x, DECK_H / 2 - 0.07, z], 10);
  }
  cylinder(deckGroup, 0.1, 0.1, DECK_X * 2, 0x6b4a2a, [0, DECK_H - 0.26, DECK_Z_FRONT - 0.15], 10).rotation.z = Math.PI / 2;
  for (let i = 0; i < 3; i++) box(deckGroup, [1.9, 0.12, 0.5], 0x7a5a36, [4.8, DECK_H - 0.34 - i * 0.28, DECK_Z_FRONT + 0.4 + i * 0.5]);
}

// Hut posts, roof, end walls and back wall.
const hut = new THREE.Group();
world.add(hut);
const WOOD = 0x5a3f26;
{
  const post = (x, z, h) => cylinder(hut, 0.14, 0.16, h, WOOD, [x, DECK_H + h / 2, z], 10);
  post(-DECK_X + 0.2, DECK_Z_BACK + 0.2, ROOF_EAVE_Y - DECK_H);
  post(DECK_X - 0.2, DECK_Z_BACK + 0.2, ROOF_EAVE_Y - DECK_H);
  post(-DECK_X + 0.2, DECK_Z_FRONT - 0.2, ROOF_EAVE_Y - DECK_H);
  post(DECK_X - 0.2, DECK_Z_FRONT - 0.2, ROOF_EAVE_Y - DECK_H);
  for (const x of [-4, 0, 4]) post(x, DECK_Z_BACK + 0.2, ROOF_EAVE_Y - DECK_H);

  // Woven bamboo back wall.
  const wallTexture = makeBambooTexture(10, 2);
  // The wall reaches a little past the eave so no gap shows under the sloping thatch.
  const wallHeight = ROOF_EAVE_Y + 0.5 - DECK_H;
  const back = new THREE.Mesh(
    new THREE.BoxGeometry(DECK_X * 2, wallHeight, 0.12),
    new THREE.MeshStandardMaterial({ map: wallTexture, roughness: 0.9 }),
  );
  back.position.set(0, DECK_H + wallHeight / 2, DECK_Z_BACK + 0.06);
  back.receiveShadow = true;
  hut.add(back);
  box(hut, [DECK_X * 2, 0.14, 0.2], WOOD, [0, DECK_H + 1.0, DECK_Z_BACK + 0.18], { cast: false });

  // Left end wall with a gable above it. The right end stays open.
  const gable = new THREE.Shape();
  gable.moveTo(DECK_Z_BACK, DECK_H);
  gable.lineTo(DECK_Z_BACK, ROOF_EAVE_Y);
  gable.lineTo(ROOF_RIDGE_Z, ROOF_RIDGE_Y);
  gable.lineTo(DECK_Z_FRONT, ROOF_EAVE_Y);
  gable.lineTo(DECK_Z_FRONT, DECK_H);
  gable.closePath();
  const gableMesh = new THREE.Mesh(
    new THREE.ShapeGeometry(gable),
    new THREE.MeshStandardMaterial({ map: makeBambooTexture(0.45, 0.2), roughness: 0.9, side: THREE.DoubleSide }),
  );
  gableMesh.rotation.y = -Math.PI / 2;
  gableMesh.position.set(-DECK_X + 0.1, 0, 0);
  gableMesh.receiveShadow = true;
  hut.add(gableMesh);

  // Open right end: a low rail only.
  cylinder(hut, 0.06, 0.06, DECK_Z_FRONT - DECK_Z_BACK - 0.4, WOOD, [DECK_X - 0.15, DECK_H + 0.95, DECK_CENTER_Z], 8).rotation.x = Math.PI / 2;

  // Thatched back slope of the roof, seen from underneath, with rafters.
  const slopeLength = Math.hypot(ROOF_RIDGE_Z - (DECK_Z_BACK - 0.4), ROOF_RIDGE_Y - ROOF_EAVE_Y);
  const slopeAngle = Math.atan2(ROOF_RIDGE_Y - ROOF_EAVE_Y, ROOF_RIDGE_Z - (DECK_Z_BACK - 0.4));
  const slope = new THREE.Mesh(
    new THREE.BoxGeometry(DECK_X * 2 + 1.4, 0.28, slopeLength),
    new THREE.MeshStandardMaterial({ map: makeThatchTexture(), roughness: 1 }),
  );
  slope.position.set(0, (ROOF_EAVE_Y + ROOF_RIDGE_Y) / 2, (DECK_Z_BACK - 0.4 + ROOF_RIDGE_Z) / 2);
  slope.rotation.x = -slopeAngle;
  slope.castShadow = false;
  slope.receiveShadow = true;
  hut.add(slope);
  for (let x = -9.4; x <= 9.5; x += 1.25) {
    const rafter = cylinder(hut, 0.05, 0.05, slopeLength, 0x6b4a2a, [x, (ROOF_EAVE_Y + ROOF_RIDGE_Y) / 2 - 0.2, (DECK_Z_BACK - 0.4 + ROOF_RIDGE_Z) / 2 + 0.05], 6);
    rafter.rotation.x = Math.PI / 2 - slopeAngle;
    rafter.castShadow = false;
  }
  cylinder(hut, 0.13, 0.13, DECK_X * 2 + 1.4, WOOD, [0, ROOF_RIDGE_Y - 0.15, ROOF_RIDGE_Z], 10).rotation.z = Math.PI / 2;
  cylinder(hut, 0.09, 0.09, DECK_X * 2 + 1.4, WOOD, [0, ROOF_EAVE_Y - 0.05, DECK_Z_BACK - 0.2], 8).rotation.z = Math.PI / 2;
  cylinder(hut, 0.09, 0.09, DECK_X * 2, WOOD, [0, ROOF_EAVE_Y + 1.4, DECK_Z_BACK + 1.5], 8).rotation.z = Math.PI / 2;
  // Fringe of hanging grass at the lower roof edge.
  box(hut, [DECK_X * 2 + 1.4, 0.4, 0.12], 0x8a6a2c, [0, ROOF_EAVE_Y - 0.3, DECK_Z_BACK - 0.5], { cast: false });
}

// ---------- hut dressing: sacks, baskets, fish trap, lamps ----------

// Hanging lamps (ตะเกียงเจ้าพายุ) between the status signs.
const lamps = [];
function buildHurricaneLamp(parent, x, y, z) {
  const group = new THREE.Group();
  group.position.set(x, y, z);
  parent.add(group);
  cylinder(group, 0.01, 0.01, 0.5, 0x2a2018, [0, 0.6, 0], 6);
  cylinder(group, 0.05, 0.08, 0.1, 0xb8873a, [0, 0.3, 0], 12);
  const glass = addMesh(group, new THREE.SphereGeometry(0.11, 14, 10), material(0xffe4b0, { emissive: 0xff9a3c, emissiveIntensity: 1.2, roughness: 0.3 }), [0, 0.15, 0], { cast: false });
  glass.scale.y = 1.3;
  cylinder(group, 0.08, 0.1, 0.06, 0xb8873a, [0, 0.0, 0], 12);
  return { group, glass };
}
for (const x of [-4, 4]) {
  buildHurricaneLamp(world, x, DECK_H + 2.2, DECK_Z_BACK + 0.45);
  const light = new THREE.PointLight(0xffa04a, 6, 7, 2);
  light.position.set(x, DECK_H + 2.5, DECK_Z_BACK + 0.9);
  scene.add(light);
  lamps.push({ light, base: 6, phase: x });
}

// Fish trap (ไซ) hanging between the signs.
{
  const trap = addMesh(world, new THREE.CylinderGeometry(0.12, 0.34, 1.3, 14, 1, true), material(0xb99a58, { side: THREE.DoubleSide }), [0, DECK_H + 2.3, DECK_Z_BACK + 0.4], { cast: false });
  trap.rotation.x = 0.1;
  for (let i = 0; i < 4; i++) {
    const ring = addMesh(world, new THREE.TorusGeometry(0.12 + i * 0.07, 0.012, 6, 16), material(0x6b4a2a), [0, DECK_H + 2.85 - i * 0.4, DECK_Z_BACK + 0.4], { cast: false });
    ring.rotation.x = Math.PI / 2;
  }
}

// Rice sacks and baskets along the back wall.
for (const [x, z, s] of [[-8.7, -5.2, 1], [-8.0, -4.9, 0.9], [8.6, -5.2, 1], [7.9, -4.8, 0.85]]) {
  const sack = rbox(world, [0.6, 0.8, 0.45], 0xc9b078, [x, DECK_H + 0.4, z], 0.12);
  sack.scale.setScalar(s);
  box(world, [0.3, 0.06, 0.02], 0x8c2f24, [x, DECK_H + 0.5 * s, z + 0.23 * s], { cast: false });
}
{
  const tray = addMesh(world, new THREE.CylinderGeometry(0.7, 0.7, 0.05, 28), material(0xc9a65e), [-8.4, DECK_H + 1.4, DECK_Z_BACK + 0.2]);
  tray.rotation.x = Math.PI / 2 - 0.15;
  addMesh(world, new THREE.TorusGeometry(0.7, 0.04, 8, 28), material(0x6b4a2a), [-8.4, DECK_H + 1.4, DECK_Z_BACK + 0.22], { cast: false }).rotation.x = -0.15;
}

// ---------- status signs (enamel plates) ----------

function drawScreen(obj, r, t) {
  const { ctx } = obj.screen;
  const { role } = obj;
  ctx.fillStyle = '#f7ecd0';
  ctx.fillRect(0, 0, SCREEN_W, SCREEN_H);
  ctx.strokeStyle = role.css;
  ctx.lineWidth = 22;
  ctx.strokeRect(14, 14, SCREEN_W - 28, SCREEN_H - 28);
  ctx.strokeStyle = '#2a1d12';
  ctx.lineWidth = 3;
  ctx.strokeRect(30, 30, SCREEN_W - 60, SCREEN_H - 60);
  ctx.fillStyle = role.css;
  ctx.fillRect(30, 30, SCREEN_W - 60, 76);

  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';
  ctx.fillStyle = '#ffffff';
  ctx.font = `700 46px ${FONT}`;
  ctx.fillText(role.th, 50, 70);
  ctx.textAlign = 'right';
  ctx.font = `600 22px ${FONT}`;
  ctx.fillText(role.title.toUpperCase(), SCREEN_W - 50, 72);
  ctx.textAlign = 'left';

  if (r.state === 'working') {
    ctx.fillStyle = '#2a1d12';
    ctx.font = `700 40px ${FONT}`;
    ctx.fillText(r.tool ?? '', 50, 144);
    if (r.detail) {
      ctx.fillStyle = '#7a5a32';
      ctx.font = `500 24px ${FONT}`;
      ctx.fillText(truncate(r.detail, 38), 50, 180);
    }
    ctx.fillStyle = '#a82f26';
    ctx.font = `700 26px ${FONT}`;
    ctx.fillText('กำลังเฮ็ด', 50, 222);
    // Rice stalks that grow while the role works.
    const tick = (t * 1.2) % 1;
    for (let i = 0; i < 9; i++) {
      const h = 22 + ((i * 37 + Math.floor(t * 3) * 17) % 40) * (0.4 + tick * 0.6);
      ctx.fillStyle = i % 2 ? '#7a9a3a' : '#c9a43a';
      ctx.fillRect(50 + i * 28, 300 - h, 8, h);
      ctx.beginPath();
      ctx.arc(54 + i * 28, 300 - h, 8, 0, Math.PI * 2);
      ctx.fill();
    }
  } else if (r.state === 'done' || r.done) {
    ctx.save();
    ctx.translate(SCREEN_W / 2, 215);
    ctx.rotate(-0.18);
    ctx.strokeStyle = '#2e7d3a';
    ctx.lineWidth = 10;
    ctx.beginPath();
    ctx.arc(0, 0, 82, 0, Math.PI * 2);
    ctx.stroke();
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(0, 0, 68, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = '#2e7d3a';
    ctx.font = `700 46px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.fillText('เสร็จแล้ว', 0, 4);
    ctx.restore();
  } else {
    ctx.fillStyle = '#5a4222';
    ctx.font = `700 64px ${FONT}`;
    ctx.fillText('รอคำสั่ง', 50, 180);
    ctx.fillStyle = '#7a5a32';
    ctx.font = `600 30px ${FONT}`;
    ctx.fillText('พักกินข้าวเหนียวก่อนเด้อ', 50, 250);
  }
  // Rust and chips, fixed so the plate looks the same every frame.
  ctx.fillStyle = 'rgba(90, 50, 20, 0.35)';
  for (let i = 0; i < 26; i++) {
    const edge = i % 4;
    const x = edge < 2 ? 20 + seeded(i * 2) * (SCREEN_W - 40) : (edge === 2 ? 22 : SCREEN_W - 22) + (seeded(i) - 0.5) * 10;
    const y = edge < 2 ? (edge === 0 ? 22 : SCREEN_H - 22) + (seeded(i * 3) - 0.5) * 10 : 20 + seeded(i * 5) * (SCREEN_H - 40);
    ctx.beginPath();
    ctx.arc(x, y, 3 + seeded(i * 7) * 4, 0, Math.PI * 2);
    ctx.fill();
  }
  obj.screen.texture.needsUpdate = true;
}

// ---------- people ----------

// One humanoid rig for workers and the village headman: pelvis, torso, head, arms, two-segment legs.
function createPerson({ shirt, pants, skin, hair, accessory = null, sash = null, lead = false, sarong = false, female = false }) {
  const root = new THREE.Group();
  const pelvis = new THREE.Group();
  pelvis.position.y = STAND_HIP;
  root.add(pelvis);

  const torso = addMesh(pelvis, new THREE.CapsuleGeometry(0.26, 0.23, 6, 16), material(shirt), [0, 0.33, 0]);

  // Waist cloth and a plaid sash across the chest (ผ้าขาวม้า / สไบ).
  const waistMap = lead ? PLAIDS.red : sash === 'blue' ? PLAIDS.blue : sash === 'pink' ? PLAIDS.pink : PLAIDS.red;
  addMesh(pelvis, new THREE.CylinderGeometry(0.28, 0.28, 0.13, 20), new THREE.MeshStandardMaterial({ map: waistMap, roughness: 0.9 }), [0, 0.07, 0], { cast: false });
  const sashMesh = box(pelvis, [0.13, 0.7, 0.03], 0xffffff, [0.02, 0.42, 0.25], { cast: false });
  sashMesh.material = new THREE.MeshStandardMaterial({ map: female ? PLAIDS.pink : waistMap, roughness: 0.9 });
  sashMesh.rotation.z = -0.55;

  // Legs. Kneeling workers hide theirs under a wrapped cloth (sarong / ผ้าซิ่น).
  const legs = [-1, 1].map((side) => {
    const hip = new THREE.Group();
    hip.position.set(side * 0.14, 0, 0);
    pelvis.add(hip);
    addMesh(hip, new THREE.CapsuleGeometry(0.11, 0.2, 4, 10), material(pants), [0, -0.21, 0]);
    const knee = new THREE.Group();
    knee.position.y = -0.42;
    hip.add(knee);
    addMesh(knee, new THREE.CapsuleGeometry(0.09, 0.31, 4, 10), material(pants), [0, -0.25, 0]);
    const shoe = box(knee, [0.17, 0.08, 0.28], 0x7a5a36, [0, -0.54, 0.06]);
    return { hip, knee, shoe };
  });
  if (sarong) {
    const cloth = sphere(pelvis, 0.52, 0xffffff, [0, 0.03, 0.2]);
    cloth.scale.set(1.15, 0.5, 1.05);
    cloth.material = new THREE.MeshStandardMaterial({ map: female ? makeSinTexture('#7a2a52', '#d9a24a') : makeSinTexture('#274a7a', '#e8dcc0'), roughness: 0.9 });
  }

  const arms = [-1, 1].map((side) => {
    const pivot = new THREE.Group();
    pivot.position.set(side * 0.34, 0.6, 0);
    pelvis.add(pivot);
    addMesh(pivot, new THREE.CapsuleGeometry(0.1, 0.31, 4, 10), material(shirt), [0, -0.27, 0]);
    sphere(pivot, 0.085, skin, [0, -0.57, 0]);
    return pivot;
  });

  cylinder(pelvis, 0.08, 0.09, 0.12, skin, [0, 0.73, 0], 12);
  const head = new THREE.Group();
  head.position.set(0, 0.97, 0);
  pelvis.add(head);
  sphere(head, 0.26, skin, [0, 0, 0]);
  const hairMesh = sphere(head, 0.275, hair, [0, 0.07, -0.04]);
  hairMesh.scale.set(1, 0.85, 1.02);
  for (const side of [-1, 1]) {
    sphere(head, 0.05, skin, [side * 0.26, -0.01, 0]).castShadow = false;
    sphere(head, 0.035, 0x1a1a1a, [side * 0.095, 0.03, 0.235]).castShadow = false;
    const brow = box(head, [0.085, 0.022, 0.016], hair, [side * 0.095, 0.11, 0.245], { cast: false });
    brow.rotation.z = side * 0.18;
  }
  sphere(head, 0.034, skin, [0, -0.03, 0.262]).castShadow = false;
  box(head, [0.09, 0.016, 0.012], female ? 0x9a3a4a : 0x6a3a30, [0, -0.11, 0.245], { cast: false });
  if (lead) {
    box(head, [0.22, 0.04, 0.02], 0xe8e4da, [0, -0.07, 0.25], { cast: false });
  }

  if (accessory === 'ngop') {
    // Wide conical straw hat (งอบ).
    addMesh(head, new THREE.ConeGeometry(0.56, 0.26, 28), material(0xd3b56c, { roughness: 1 }), [0, 0.22, 0], { cast: false });
    addMesh(head, new THREE.TorusGeometry(0.5, 0.012, 6, 28), material(0x8a6a2c), [0, 0.1, 0], { cast: false }).rotation.x = Math.PI / 2;
  } else if (accessory === 'turban') {
    // Plaid head cloth (ผ้าขาวม้าโพกหัว).
    const wrap = addMesh(head, new THREE.SphereGeometry(0.29, 18, 12), new THREE.MeshStandardMaterial({ map: PLAIDS.blue, roughness: 0.9 }), [0, 0.09, 0], { cast: false });
    wrap.scale.set(1.02, 0.62, 1.04);
    box(head, [0.16, 0.1, 0.1], 0x22406e, [0.2, 0.08, -0.22], { cast: false }).rotation.z = 0.4;
  } else if (accessory === 'flatHat') {
    // Flat woven hat.
    addMesh(head, new THREE.CylinderGeometry(0.58, 0.58, 0.035, 30), material(0xc9ad62, { roughness: 1 }), [0, 0.19, 0], { cast: false });
    const dome = sphere(head, 0.27, 0xc9ad62, [0, 0.2, 0]);
    dome.scale.set(1, 0.55, 1);
    addMesh(head, new THREE.TorusGeometry(0.28, 0.02, 6, 24), new THREE.MeshStandardMaterial({ map: PLAIDS.red }), [0, 0.2, 0], { cast: false }).rotation.x = Math.PI / 2;
  } else if (accessory === 'bunFlower') {
    // Hair bun with a white champa flower.
    sphere(head, 0.13, hair, [0, 0.27, -0.16]);
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2;
      sphere(head, 0.045, 0xf8f1e0, [Math.cos(a) * 0.07, 0.3 + Math.sin(a) * 0.03, -0.1 + Math.sin(a) * 0.06]).castShadow = false;
    }
  }
  if (female && accessory !== 'bunFlower') sphere(head, 0.12, hair, [0, 0.25, -0.17]);

  if (lead) {
    // Plaid head cloth, walking stick in the left hand.
    const wrap = addMesh(head, new THREE.SphereGeometry(0.29, 18, 12), new THREE.MeshStandardMaterial({ map: PLAIDS.red, roughness: 0.9 }), [0, 0.1, 0], { cast: false });
    wrap.scale.set(1.02, 0.6, 1.04);
    const stick = cylinder(arms[0], 0.022, 0.026, 1.3, 0x6b4a2a, [0, -0.97, 0.02], 8);
    stick.castShadow = true;
  }

  return { root, pelvis, torso, head, armL: arms[0], armR: arms[1], legL: legs[0], legR: legs[1] };
}

// Sitting on the mat with the legs tucked to the side under the cloth.
function poseKneeling(person) {
  person.pelvis.position.y = KNEEL_HIP;
  for (const leg of [person.legL, person.legR]) {
    leg.hip.rotation.x = -Math.PI / 2 + 0.25;
    leg.knee.rotation.x = Math.PI - 0.25;
    leg.shoe.visible = false;
  }
}

function poseStanding(person) {
  person.pelvis.position.y = STAND_HIP;
  for (const leg of [person.legL, person.legR]) {
    leg.hip.rotation.x = 0;
    leg.knee.rotation.x = 0;
  }
}

// ---------- stations ----------

const checkTexture = (() => {
  const canvas = makeCanvas(128, 128);
  const g = canvas.getContext('2d');
  g.fillStyle = '#3f8a3f';
  g.beginPath();
  g.arc(64, 64, 56, 0, Math.PI * 2);
  g.fill();
  g.strokeStyle = '#ffffff';
  g.lineWidth = 14;
  g.lineCap = 'round';
  g.lineJoin = 'round';
  g.beginPath();
  g.moveTo(36, 66);
  g.lineTo(56, 86);
  g.lineTo(92, 44);
  g.stroke();
  return canvasTexture(canvas);
})();

function makeNameplateTexture(role) {
  const canvas = makeCanvas(256, 64);
  const g = canvas.getContext('2d');
  g.fillStyle = '#3a2a1a';
  g.fillRect(0, 0, 256, 64);
  g.fillStyle = role.css;
  g.fillRect(0, 0, 10, 64);
  g.fillStyle = '#f1e3c3';
  g.font = `700 30px ${FONT}`;
  g.textBaseline = 'middle';
  g.textAlign = 'left';
  g.fillText(role.th, 24, 34);
  g.font = `600 18px ${FONT}`;
  g.fillStyle = '#b39a74';
  g.fillText(role.title.toUpperCase(), 152, 36);
  return canvasTexture(canvas);
}

// A sickle (เคียว) lying on the mat: handle plus a curved blade.
function buildSickle() {
  const group = new THREE.Group();
  box(group, [0.04, 0.04, 0.34], 0x6b4a2a, [0, 0, -0.2]);
  const blade = addMesh(group, new THREE.TorusGeometry(0.2, 0.016, 6, 16, Math.PI * 1.1), material(0x9aa0a8, { metalness: 0.7, roughness: 0.4 }), [0.2, 0, 0.02], { cast: false });
  blade.rotation.x = Math.PI / 2;
  blade.rotation.z = Math.PI * 0.55;
  return group;
}

function buildStation(role, index) {
  const station = new THREE.Group();
  station.position.set(role.x, DECK_H, 0);
  scene.add(station);

  // Woven mat (เสื่อ) under the worker.
  const matMaterial = new THREE.MeshStandardMaterial({ map: makeMatTexture(), roughness: 1 });
  const mat = new THREE.Mesh(new THREE.BoxGeometry(2.0, MAT_TOP, 2.0), matMaterial);
  mat.position.set(0, MAT_TOP / 2, PERSON_Z + 0.5);
  mat.receiveShadow = true;
  station.add(mat);

  // Low wooden table with a palm-leaf manuscript, ink pot, sticky-rice basket and a lamp.
  rbox(station, [2.2, 0.07, 1.0], 0x6b4a2a, [0, DESK_H, DESK_Z], 0.02);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) cylinder(station, 0.05, 0.06, DESK_H - 0.03, 0x4a3020, [sx * 1.0, (DESK_H - 0.03) / 2, DESK_Z + sz * 0.4], 8);

  for (let i = 0; i < 4; i++) {
    const leaf = box(station, [0.92, 0.012, 0.2], 0xcaa86a, [-0.25, DESK_H + 0.045 + i * 0.012, DESK_Z + 0.02 + i * 0.012], { cast: false });
    leaf.rotation.y = 0.04 * (i - 1.5);
  }
  box(station, [0.03, 0.02, 0.24], 0xa82f26, [-0.55, DESK_H + 0.09, DESK_Z + 0.02], { cast: false });
  box(station, [0.03, 0.02, 0.24], 0xa82f26, [0.05, DESK_H + 0.09, DESK_Z + 0.02], { cast: false });
  cylinder(station, 0.045, 0.05, 0.07, 0x7a4a2a, [0.5, DESK_H + 0.075, DESK_Z + 0.2], 10);
  const stylus = cylinder(station, 0.008, 0.008, 0.3, 0x2a1d12, [0.3, DESK_H + 0.06, DESK_Z + 0.32], 6);
  stylus.rotation.z = Math.PI / 2;
  stylus.rotation.y = 0.4;

  // Sticky-rice basket (กระติบข้าว).
  cylinder(station, 0.1, 0.12, 0.15, 0xc99a3b, [-0.9, DESK_H + 0.11, DESK_Z - 0.2], 14);
  const lid = sphere(station, 0.105, 0xb98a2f, [-0.9, DESK_H + 0.2, DESK_Z - 0.2]);
  lid.scale.set(1, 0.5, 1);

  // Clay oil lamp: its flame glows in the role colour while the worker is busy.
  cylinder(station, 0.05, 0.065, 0.04, 0x8a4a2a, [0.2, DESK_H + 0.055, DESK_Z + 0.4], 10);
  const flame = addMesh(
    station,
    new THREE.SphereGeometry(0.03, 10, 8),
    material(0xffcf7a, { emissive: 0xff8a1f, emissiveIntensity: 1.2 }),
    [0.2, DESK_H + 0.11, DESK_Z + 0.4],
    { cast: false },
  );
  flame.scale.y = 1.6;

  // Hurricane lamp on the table: the glass glows in the role colour.
  const lantern = new THREE.Group();
  lantern.position.set(0.85, DESK_H + 0.035, DESK_Z - 0.2);
  station.add(lantern);
  cylinder(lantern, 0.07, 0.09, 0.1, 0xb8873a, [0, 0.05, 0], 12);
  const bulb = addMesh(lantern, new THREE.SphereGeometry(0.1, 14, 10), material(0xe8dcc0, { emissive: 0x000000, emissiveIntensity: 1.6, roughness: 0.3 }), [0, 0.22, 0], { cast: false });
  bulb.scale.y = 1.35;
  cylinder(lantern, 0.04, 0.09, 0.06, 0xb8873a, [0, 0.4, 0], 12);
  addMesh(lantern, new THREE.TorusGeometry(0.07, 0.01, 6, 14, Math.PI), material(0x2a2018), [0, 0.44, 0], { cast: false });

  box(station, [0.5, 0.05, 0.08], 0x2a1d12, [-0.85, DESK_H + 0.07, DESK_Z + 0.45], { cast: false });
  const plate = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.125), new THREE.MeshBasicMaterial({ map: makeNameplateTexture(role), toneMapped: false }));
  plate.position.set(-0.85, DESK_H + 0.115, DESK_Z + 0.5);
  plate.rotation.x = -0.35;
  station.add(plate);

  // Palm-leaf bundle (ใบลาน) the headman hands over.
  const ticket = new THREE.Group();
  ticket.position.set(0.45, DESK_H + 0.08, DESK_Z - 0.05);
  ticket.rotation.y = 0.3;
  ticket.visible = false;
  station.add(ticket);
  box(ticket, [0.5, 0.06, 0.14], 0xd1ad6a, [0, 0, 0], { cast: false });
  for (const sx of [-0.15, 0.15]) box(ticket, [0.03, 0.075, 0.16], 0xa82f26, [sx, 0, 0], { cast: false });

  const sickle = buildSickle();
  sickle.position.set(0.95, MAT_TOP + 0.02, PERSON_Z + 0.2);
  sickle.rotation.y = -0.4;
  station.add(sickle);

  const person = createPerson({
    shirt: role.color,
    pants: 0x2a2f3a,
    skin: role.skin,
    hair: role.hair,
    accessory: role.accessory,
    sash: role.sash,
    sarong: true,
    female: role.id === 'Tester' || role.id === 'Summary',
  });
  person.root.position.set(0, MAT_TOP, PERSON_Z);
  poseKneeling(person);
  station.add(person.root);

  const check = new THREE.Sprite(new THREE.SpriteMaterial({ map: checkTexture, transparent: true, depthTest: false }));
  check.scale.setScalar(0.6);
  check.position.set(0, 2.0, PERSON_Z);
  check.visible = false;
  station.add(check);

  // Enamel status plate hung from the rafters by ropes.
  const canvas = makeCanvas(SCREEN_W, SCREEN_H);
  const texture = canvasTexture(canvas);
  rbox(station, [3.3, 1.95, 0.08], 0x3a2a1a, [0, SCREEN_Y, DECK_Z_BACK + 0.2], 0.03, { cast: false });
  const screenMesh = new THREE.Mesh(
    new THREE.PlaneGeometry(3.1, 1.75),
    new THREE.MeshBasicMaterial({ map: texture, toneMapped: false }),
  );
  screenMesh.position.set(0, SCREEN_Y, DECK_Z_BACK + 0.25);
  station.add(screenMesh);
  for (const sx of [-1.4, 1.4]) cylinder(station, 0.012, 0.012, 1.45, 0x7a5a2c, [sx, SCREEN_Y + 1.6, DECK_Z_BACK + 0.22], 6);

  const light = new THREE.PointLight(role.color, 0, 6, 2);
  light.position.set(0, 2.0, DESK_Z - 0.6);
  station.add(light);

  const tagEl = document.createElement('div');
  tagEl.className = 'tag';
  tagEl.style.borderColor = role.css;
  tagLayer.appendChild(tagEl);

  const obj = {
    role,
    index,
    person,
    logo: flame,
    bulb,
    check,
    light,
    ticket,
    tagEl,
    handed: false,
    nodUntil: 0,
    phase: index * 1.7,
    state: 'waiting',
    finished: false,
    anchor: new THREE.Vector3(role.x, DECK_H + 2.05, PERSON_Z),
    screen: { ctx: canvas.getContext('2d'), texture, dirty: true, last: 0, current: null },
  };
  drawScreen(obj, { state: 'waiting', tool: null, detail: null, done: false }, 0);
  return obj;
}

const objects = ROLES.map(buildStation);

// Painted arrows on the deck between the workers show the hand-off direction.
const arrowShape = new THREE.Shape();
arrowShape.moveTo(-0.4, -0.18);
arrowShape.lineTo(0.05, -0.18);
arrowShape.lineTo(0.05, -0.32);
arrowShape.lineTo(0.45, 0);
arrowShape.lineTo(0.05, 0.32);
arrowShape.lineTo(0.05, 0.18);
arrowShape.lineTo(-0.4, 0.18);
arrowShape.closePath();
const arrows = [0, 1, 2].map((i) => {
  const mesh = new THREE.Mesh(
    new THREE.ShapeGeometry(arrowShape),
    new THREE.MeshBasicMaterial({ color: IDLE_GREY, toneMapped: false }),
  );
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.set((ROLES[i].x + ROLES[i + 1].x) / 2, DECK_H + 0.02, DESK_Z + 0.1);
  scene.add(mesh);
  return mesh;
});

// ---------- task board on the left end wall ----------

const BOARD_W = 832;
const BOARD_H = 512;
const boardCanvas = makeCanvas(BOARD_W, BOARD_H);
const boardTexture = canvasTexture(boardCanvas);
{
  const x = -DECK_X + 0.1;
  box(world, [0.1, 1.9, 2.95], 0x3a2a1a, [x + 0.12, DECK_H + 2.1, -0.3], { cast: false });
  const board = new THREE.Mesh(new THREE.PlaneGeometry(2.7, 1.66), new THREE.MeshBasicMaterial({ map: boardTexture, toneMapped: false }));
  board.rotation.y = Math.PI / 2;
  board.position.set(x + 0.19, DECK_H + 2.1, -0.3);
  world.add(board);
}

function drawBoard() {
  const g = boardCanvas.getContext('2d');
  g.fillStyle = '#4a3322';
  g.fillRect(0, 0, BOARD_W, BOARD_H);
  g.fillStyle = '#2f2014';
  g.fillRect(0, 0, BOARD_W, 84);
  g.fillStyle = '#e8cf8e';
  g.font = `700 44px ${FONT}`;
  g.textBaseline = 'middle';
  g.textAlign = 'left';
  g.fillText('กระดานงาน  TASK BOARD', 32, 44);

  ROLES.forEach((role, i) => {
    const r = roleState(role.id);
    const y = 106 + i * 98;
    // Palm-leaf strip with a string hole at each end.
    g.fillStyle = '#d6b878';
    g.fillRect(24, y, BOARD_W - 48, 84);
    g.fillStyle = '#4a3322';
    g.beginPath();
    g.arc(42, y + 42, 7, 0, Math.PI * 2);
    g.arc(BOARD_W - 42, y + 42, 7, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = role.css;
    g.fillRect(60, y, 10, 84);
    g.fillStyle = '#2a1d12';
    g.font = `700 34px ${FONT}`;
    g.fillText(role.th, 86, y + 28);
    g.font = `500 22px ${FONT}`;
    g.fillStyle = '#6b4f2a';
    const detail = r.state === 'working' ? `${r.tool}${r.detail ? ` · ${r.detail}` : ''}` : r.state === 'done' || r.done ? 'เสร็จแล้ว' : 'รอคำสั่ง';
    g.fillText(truncate(detail, 32), 86, y + 62);

    const chip = r.state === 'working' ? ['กำลังเฮ็ด', '#a82f26'] : r.state === 'done' || r.done ? ['เสร็จ', '#2e7d3a'] : ['รอ', '#8a7a5c'];
    g.fillStyle = chip[1];
    g.beginPath();
    g.roundRect(BOARD_W - 210, y + 18, 140, 48, 10);
    g.fill();
    g.fillStyle = '#f6ecd0';
    g.font = `700 26px ${FONT}`;
    g.textAlign = 'center';
    g.fillText(chip[0], BOARD_W - 140, y + 43);
    g.textAlign = 'left';
  });
  boardTexture.needsUpdate = true;
}

// ---------- village headman (team lead) ----------

const lead = createPerson({
  shirt: 0x24304a,
  pants: 0x3a3f4a,
  skin: 0xcf9a72,
  hair: 0xcfcfcf,
  lead: true,
  accessory: null,
});
scene.add(lead.root);
poseStanding(lead);

// Palm-leaf bundle that the headman carries to a worker.
const leadCard = new THREE.Group();
lead.armR.add(leadCard);
leadCard.position.set(0, -0.62, 0.1);
box(leadCard, [0.14, 0.4, 0.06], 0xd1ad6a, [0, 0, 0], { cast: false });
for (const sy of [-0.12, 0.12]) box(leadCard, [0.16, 0.025, 0.08], 0xa82f26, [0, sy, 0], { cast: false });
leadCard.visible = false;

const leadTag = document.createElement('div');
leadTag.className = 'tag lead';
tagLayer.appendChild(leadTag);

const bubble = document.createElement('div');
bubble.className = 'bubble';
bubble.innerHTML = '<div class="line1"></div><div class="line2"></div>';
tagLayer.appendChild(bubble);
const bubbleLine1 = bubble.querySelector('.line1');
const bubbleLine2 = bubble.querySelector('.line2');

const leadState = {
  mode: 'idle',
  yaw: HOME_YAW,
  faceYaw: HOME_YAW,
  path: [],
  task: null,
  talkT: 0,
  handedOver: false,
  phase: 0,
  queue: [],
};
lead.root.position.set(HOME.x, DECK_H, HOME.z);
lead.root.rotation.y = HOME_YAW;

// Isan dialect: เบิ่ง = look, เฮ็ด = do/make, แน่ / เด้อ = polite particles.
const PHRASES = {
  'Reading prompt': 'มีงานใหม่มาแล้วเด้อ ไปอ่านเบิ่งก่อนแน่',
  Read: 'ไปเบิ่งไฟล์นี้แน่เด้อ',
  Grep: 'ไปไล่หาในโค้ดแน่',
  Glob: 'ไปเบิ่งว่ามีไฟล์หยังแน่',
  WebSearch: 'ไปถามข่าวคราวทางเว็บแน่เด้อ',
  WebFetch: 'ไปเอาของจากเว็บมาแน่',
  Edit: 'มาเฮ็ดโค้ดตรงนี้ให้ดีแน่เด้อ',
  Write: 'มาเขียนไฟล์นี้แน่เด้อ',
  NotebookEdit: 'มาเฮ็ดสมุดโน้ตตัวนี้แน่',
  Bash: 'ลองรันเบิ่งแน่ ว่าเฮ็ดได้บ่',
};

const spotFor = (roleId) => new THREE.Vector3(ROLES.find((r) => r.id === roleId).x + 2.0, 0, DESK_Z);

// Walk along the front of the deck so the headman never steps on the workers' tables.
function buildPath(from, to) {
  const points = [];
  const lowFrom = from.z < CORRIDOR_Z - 0.2;
  const lowTo = to.z < CORRIDOR_Z - 0.2;
  if ((lowFrom || lowTo) && Math.abs(from.x - to.x) > 0.3) {
    if (lowFrom) points.push(new THREE.Vector3(from.x, 0, CORRIDOR_Z));
    points.push(new THREE.Vector3(to.x, 0, CORRIDOR_Z));
  }
  points.push(to.clone());
  return points;
}

function bubbleTextFor(task) {
  if (task.type === 'praise') return [`${task.role} เก่งหลาย ขอบใจเด้อ`, ''];
  if (task.type === 'wrapUp') return ['เสร็จแล้วเด้อ บอกลูกค้าได้เลย!', ''];
  const phrase = PHRASES[task.tool] ?? 'มาช่วยเฮ็ดงานนี้แน่เด้อ';
  const line2 = task.tool === 'Reading prompt' ? '' : `${task.tool}${task.detail ? ` · ${truncate(task.detail, 34)}` : ''}`;
  return [`${task.role} ${phrase}`, line2];
}

function goHome() {
  leadState.task = null;
  leadState.path = buildPath(lead.root.position, HOME);
  leadState.mode = 'walking';
}

function startNext() {
  const task = leadState.queue.shift();
  if (!task) {
    goHome();
    return;
  }
  leadState.task = task;
  leadState.handedOver = false;
  leadCard.visible = task.type === 'assign';
  leadState.path = buildPath(lead.root.position, spotFor(task.role));
  leadState.mode = 'walking';
}

function enqueue(task) {
  leadState.queue.push(task);
  while (leadState.queue.length > MAX_QUEUE) leadState.queue.shift();
  // Idle, or already walking back with nothing to deliver: go straight to the new task.
  if (leadState.mode === 'idle' || (leadState.mode === 'walking' && !leadState.task)) startNext();
}

function resetLead() {
  leadState.queue.length = 0;
  leadCard.visible = false;
  bubble.classList.remove('show');
  for (const obj of objects) obj.handed = false;
  if (leadState.mode !== 'idle') goHome();
}

function arrive() {
  if (leadState.task) {
    leadState.mode = 'talking';
    leadState.talkT = 0;
    leadState.faceYaw = -Math.PI / 2 + 0.55;
    const [line1, line2] = bubbleTextFor(leadState.task);
    bubbleLine1.textContent = line1;
    bubbleLine2.textContent = line2;
    bubbleLine2.style.display = line2 ? '' : 'none';
    const role = ROLES.find((r) => r.id === leadState.task.role);
    bubble.style.borderColor = role.css;
    bubble.classList.add('show');
  } else {
    leadState.mode = 'idle';
    leadState.faceYaw = HOME_YAW;
    if (leadState.queue.length) startNext();
  }
}

function handOver(task) {
  leadCard.visible = false;
  const obj = objects.find((o) => o.role.id === task.role);
  obj.handed = true;
  obj.ticket.visible = true;
  obj.nodUntil = performance.now() + 900;
}

function updateLead(dt, t) {
  const S = leadState;
  const pos = lead.root.position;
  let walking = false;

  if (S.mode === 'walking') {
    const goal = S.path[0];
    const dx = goal.x - pos.x;
    const dz = goal.z - pos.z;
    const dist = Math.hypot(dx, dz);
    const step = WALK_SPEED * dt;
    if (dist <= step) {
      pos.x = goal.x;
      pos.z = goal.z;
      S.path.shift();
      if (!S.path.length) arrive();
    } else {
      pos.x += (dx / dist) * step;
      pos.z += (dz / dist) * step;
      S.yaw = turnToward(S.yaw, Math.atan2(dx, dz), 9 * dt);
      walking = true;
    }
  } else if (S.mode === 'talking') {
    S.yaw = turnToward(S.yaw, S.faceYaw, 6 * dt);
    S.talkT += dt;
    if (S.task.type === 'assign' && !S.handedOver && S.talkT > 1.3) {
      S.handedOver = true;
      handOver(S.task);
    }
    if (S.talkT >= TALK_SECONDS) {
      bubble.classList.remove('show');
      if (S.queue.length) startNext();
      else goHome();
    }
  } else {
    S.yaw = turnToward(S.yaw, HOME_YAW + Math.sin(t * 0.4) * 0.45, 2 * dt);
  }
  lead.root.rotation.y = S.yaw;

  if (walking) S.phase += dt * 8;
  const swing = walking ? Math.sin(S.phase) : 0;
  lead.legL.hip.rotation.x = swing * 0.55;
  lead.legR.hip.rotation.x = -swing * 0.55;
  lead.legL.knee.rotation.x = walking ? Math.max(0, Math.sin(S.phase + 1.2)) * 0.8 : 0;
  lead.legR.knee.rotation.x = walking ? Math.max(0, Math.sin(S.phase + 1.2 + Math.PI)) * 0.8 : 0;
  lead.pelvis.position.y = STAND_HIP + (walking ? Math.abs(Math.sin(S.phase)) * 0.035 : 0);

  const carrying = leadCard.visible;
  const allDone = objects[objects.length - 1].finished;
  if (S.mode === 'talking') {
    const reach = THREE.MathUtils.smoothstep(S.talkT, 0.4, 1.0) * (S.handedOver ? 0 : 1);
    lead.armR.rotation.x = carrying ? -0.5 - reach * 0.9 : -0.9 + Math.sin(t * 4) * 0.15;
    lead.armL.rotation.x = Math.sin(t * 5) * 0.06;
    lead.head.rotation.x = 0.05 + Math.sin(t * 6) * 0.04;
  } else if (walking) {
    lead.armL.rotation.x = -swing * 0.25;
    lead.armR.rotation.x = carrying ? -0.9 : swing * 0.5;
    lead.head.rotation.x = 0;
  } else if (allDone && S.mode === 'idle') {
    lead.armL.rotation.x = Math.sin(t * 1.2) * 0.03;
    lead.armR.rotation.x = Math.PI - 0.4;
    lead.armR.rotation.z = Math.sin(t * 8) * 0.4;
    lead.head.rotation.x = 0;
  } else {
    lead.armL.rotation.x = Math.sin(t * 1.2) * 0.03;
    lead.armR.rotation.x = Math.sin(t * 1.2 + 1) * 0.04;
    lead.head.rotation.x = 0;
  }
  if (!(allDone && S.mode === 'idle')) lead.armR.rotation.z = 0;
  lead.head.rotation.y = S.mode === 'idle' ? Math.sin(t * 0.7) * 0.2 : 0;

  const roleName = S.task?.role ?? '';
  leadTag.textContent =
    S.mode === 'walking' && S.task ? `${LEAD_NAME} · เดินไปหา ${roleName}`
    : S.mode === 'talking' ? `${LEAD_NAME} · สั่งงาน ${roleName}`
    : S.mode === 'walking' ? `${LEAD_NAME} · เดินกลับ`
    : `${LEAD_NAME} · เฝ้าเบิ่งงาน`;
}

// ---------- state ----------

// Snapshot from the server. Only the active session is shown.
let snapshot = { active: null, sessions: {} };

function currentSession() {
  return snapshot.active ? snapshot.sessions[snapshot.active] : null;
}

const EMPTY_ROLE = { state: 'waiting', tool: null, detail: null, done: false };

function roleState(id) {
  return currentSession()?.roles[id] ?? EMPTY_ROLE;
}

const isFinished = (r) => r.done || r.state === 'done';

function tagText(role, r) {
  if (r.state === 'working') return `${role.id} · Working · ${r.tool}`;
  if (r.state === 'done') return `${role.id} · Done`;
  return `${role.id} · Waiting`;
}

// Pipeline bar labels carry the Thai role names.
for (const step of document.querySelectorAll('#pipeline .step')) {
  const role = ROLES.find((r) => r.id === step.dataset.role);
  if (role) step.querySelector('.name').textContent = `${role.id} ${role.th}`;
}

function applyState() {
  for (const obj of objects) {
    const r = roleState(obj.role.id);
    const working = r.state === 'working';
    const finished = isFinished(r);
    obj.state = r.state;
    obj.finished = finished;
    obj.check.visible = finished;
    obj.ticket.visible = obj.handed || finished;
    obj.screen.dirty = true;
    obj.screen.current = r;

    obj.tagEl.textContent = tagText(obj.role, r);
    if (r.done) {
      const mark = document.createElement('span');
      mark.className = 'done-tick';
      mark.textContent = '✓';
      obj.tagEl.appendChild(mark);
    }

    // Lamp glass and the clay-lamp flame glow in the role colour while working, green when finished.
    const glow = working ? obj.role.color : finished ? DONE_GREEN : 0x000000;
    obj.bulb.material.color.set(working || finished ? glow : 0xe8dcc0);
    obj.bulb.material.emissive.set(glow);
    obj.logo.material.color.set(working ? glow : finished ? DONE_GREEN : 0xffcf7a);
    obj.logo.material.emissive.set(working ? glow : finished ? DONE_GREEN : 0xff8a1f);
  }

  arrows.forEach((arrow, i) => {
    const from = roleState(ROLES[i].id);
    const to = roleState(ROLES[i + 1].id);
    const lit = isFinished(from) || to.state === 'working' || isFinished(to);
    arrow.material.color.set(lit ? ROLES[i].color : IDLE_GREY);
  });

  for (const step of document.querySelectorAll('#pipeline .step')) {
    const r = roleState(step.dataset.role);
    const finished = isFinished(r);
    step.classList.toggle('working', r.state === 'working');
    step.classList.toggle('done', finished);
    step.querySelector('.state').textContent =
      r.state === 'working' ? `Working · ${r.tool}` : finished ? 'Done' : 'Waiting';
  }

  const finishedCount = ROLES.filter((role) => isFinished(roleState(role.id))).length;
  document.getElementById('progress-bar').style.width = `${(finishedCount / ROLES.length) * 100}%`;
  drawBoard();
}

// Compare the new snapshot with the previous one and queue work for the headman.
let previous = null;

function remember(next, session) {
  previous = {
    active: next.active,
    startedAt: session?.startedAt ?? null,
    roles: session ? structuredClone(session.roles) : null,
  };
}

function planLeadWork(next) {
  const session = next.active ? next.sessions[next.active] : null;

  // First snapshot after load: show the current state, but do not replay old assignments.
  if (!previous) {
    if (session) {
      for (const obj of objects) {
        const r = session.roles[obj.role.id];
        obj.handed = r.state === 'working' || r.done || r.state === 'done';
      }
    }
    remember(next, session);
    return;
  }

  if (!session) {
    resetLead();
    remember(next, session);
    return;
  }

  const newTask = next.active !== previous.active || session.startedAt !== previous.startedAt;
  if (newTask) {
    resetLead();
  }

  for (const role of ROLES) {
    const r = session.roles[role.id];
    const p = (!newTask && previous.roles?.[role.id]) || EMPTY_ROLE;
    if (r.state === 'working' && r.tool !== 'Thinking' && (p.state !== 'working' || p.tool !== r.tool || p.detail !== r.detail)) {
      enqueue({ type: 'assign', role: role.id, tool: r.tool, detail: r.detail });
    } else if (role.id === 'Summary' && r.state === 'done' && p.state !== 'done') {
      enqueue({ type: 'wrapUp', role: role.id });
    } else if (role.id !== 'Summary' && r.done && !p.done) {
      enqueue({ type: 'praise', role: role.id });
    }
  }
  remember(next, session);
}

const pad = (n) => String(n).padStart(2, '0');

function formatElapsed(ms) {
  const total = Math.floor(ms / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
}

function updateTimer() {
  const session = currentSession();
  const el = document.getElementById('elapsed');
  if (!session?.startedAt) {
    el.textContent = '00:00';
    return;
  }
  el.textContent = formatElapsed((session.endedAt ?? Date.now()) - session.startedAt);
}

// ---------- camera ----------

// The view is fitted to the hut width, then the user can orbit and zoom a little.
// A wider framing than the indoor themes so the paddies, palms and sunset sky stay in view.
const HALF_W = 13.8;
const HALF_H = 7.7;
const DEFAULT_VIEW = { azimuth: 0, elevation: 0.46, zoom: 1 };
const view = { ...DEFAULT_VIEW };

function placeCamera() {
  const tanV = Math.tan(THREE.MathUtils.degToRad(FOV / 2));
  const aspect = camera.aspect;
  const dist = Math.max(HALF_H / tanV, HALF_W / (tanV * aspect)) * view.zoom;
  const horizontal = dist * Math.cos(view.elevation);
  camera.position.set(
    target.x + horizontal * Math.sin(view.azimuth),
    target.y + dist * Math.sin(view.elevation),
    target.z + horizontal * Math.cos(view.azimuth),
  );
  camera.lookAt(target);
}

const canvasEl = renderer.domElement;
let drag = null;
canvasEl.addEventListener('pointerdown', (e) => {
  drag = { x: e.clientX, y: e.clientY };
  canvasEl.setPointerCapture(e.pointerId);
});
canvasEl.addEventListener('pointermove', (e) => {
  if (!drag) return;
  if (e.buttons === 0) {
    drag = null;
    return;
  }
  view.azimuth = THREE.MathUtils.clamp(view.azimuth - (e.clientX - drag.x) * 0.005, -0.7, 0.7);
  view.elevation = THREE.MathUtils.clamp(view.elevation + (e.clientY - drag.y) * 0.004, 0.35, 1.1);
  drag = { x: e.clientX, y: e.clientY };
  placeCamera();
});
for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) {
  canvasEl.addEventListener(type, () => {
    drag = null;
  });
}
canvasEl.addEventListener('wheel', (e) => {
  e.preventDefault();
  view.zoom = THREE.MathUtils.clamp(view.zoom * Math.exp(e.deltaY * 0.001), 0.55, 1.3);
  placeCamera();
}, { passive: false });
canvasEl.addEventListener('dblclick', () => {
  Object.assign(view, DEFAULT_VIEW);
  placeCamera();
});

const projected = new THREE.Vector3();

// Overlays sit above their anchor by default, or below it when `below` is set.
function placeOverlay(el, worldPoint, offsetY = 0, below = false) {
  projected.copy(worldPoint).project(camera);
  const x = (projected.x * 0.5 + 0.5) * window.innerWidth;
  const y = (-projected.y * 0.5 + 0.5) * window.innerHeight + offsetY;
  el.style.transform = `translate(${x}px, ${y}px) translate(-50%, ${below ? '0' : '-100%'})`;
}

const leadAnchor = new THREE.Vector3();

function updateOverlays() {
  for (const obj of objects) placeOverlay(obj.tagEl, obj.anchor);
  const p = lead.root.position;
  // The headman's tag and bubble go under his feet so they do not hide the worker tags and signs.
  leadAnchor.set(p.x, DECK_H, p.z);
  placeOverlay(leadTag, leadAnchor, 8, true);
  placeOverlay(bubble, leadAnchor, 46, true);
}

// ---------- fireflies ----------

const FIREFLY_COUNT = 90;
const fireflyPositions = new Float32Array(FIREFLY_COUNT * 3);
const fireflyColors = new Float32Array(FIREFLY_COUNT * 3);
const fireflySeeds = Array.from({ length: FIREFLY_COUNT }, (_, i) => seeded(i + 31));
for (let i = 0; i < FIREFLY_COUNT; i++) {
  fireflyPositions[i * 3] = (seeded(i * 1.9) - 0.5) * 34;
  fireflyPositions[i * 3 + 1] = 0.4 + seeded(i * 4.3) * 2.6;
  fireflyPositions[i * 3 + 2] = 2.5 + seeded(i * 6.1) * 10;
}
const fireflyGeometry = new THREE.BufferGeometry();
fireflyGeometry.setAttribute('position', new THREE.BufferAttribute(fireflyPositions, 3));
fireflyGeometry.setAttribute('color', new THREE.BufferAttribute(fireflyColors, 3));
const fireflyTexture = (() => {
  const canvas = makeCanvas(64, 64);
  const g = canvas.getContext('2d');
  const grad = g.createRadialGradient(32, 32, 1, 32, 32, 30);
  grad.addColorStop(0, 'rgba(255, 250, 190, 1)');
  grad.addColorStop(0.3, 'rgba(210, 255, 120, 0.6)');
  grad.addColorStop(1, 'rgba(180, 255, 80, 0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  return canvasTexture(canvas);
})();
const fireflies = new THREE.Points(
  fireflyGeometry,
  new THREE.PointsMaterial({ map: fireflyTexture, size: 0.34, transparent: true, depthWrite: false, vertexColors: true, blending: THREE.AdditiveBlending, fog: false }),
);
fireflies.frustumCulled = false;
scene.add(fireflies);

// ---------- animation ----------

const startedAt = performance.now();
const ARM_REST = -0.95;
let lastFrame = performance.now();

function animateWorker(obj, t) {
  const working = obj.state === 'working';
  const { armL, armR, head, torso, pelvis } = obj.person;
  const ph = obj.phase;
  const now = performance.now();

  if (working) {
    // Scratching on palm leaves: the right hand writes, the left hand holds the leaf.
    armL.rotation.x = ARM_REST - 0.05;
    armR.rotation.x = ARM_REST - 0.05 + Math.sin(t * 6 + ph) * 0.08;
    armR.rotation.z = Math.sin(t * 3 + ph) * 0.12;
    head.rotation.x = 0.16 + Math.sin(t * 3 + ph) * 0.03;
    head.rotation.y = Math.sin(t * 1.2 + ph) * 0.08;
    pelvis.position.y = KNEEL_HIP + Math.sin(t * 6 + ph) * 0.006;
  } else if (obj.finished) {
    armL.rotation.x = ARM_REST;
    armR.rotation.x = Math.PI - 0.35;
    armR.rotation.z = Math.sin(t * 9 + ph) * 0.45;
    head.rotation.x = 0;
    head.rotation.y = Math.sin(t * 1.5 + ph) * 0.1;
    pelvis.position.y = KNEEL_HIP;
  } else {
    armL.rotation.x = -0.25 + Math.sin(t * 0.9 + ph) * 0.02;
    armR.rotation.x = -0.25 + Math.sin(t * 0.9 + ph + 1) * 0.02;
    armR.rotation.z = 0;
    head.rotation.x = 0;
    head.rotation.y = Math.sin(t * 0.6 + ph) * 0.25;
    pelvis.position.y = KNEEL_HIP;
  }
  // A wai (hands together and a bow) when the headman hands over a task.
  if (now < obj.nodUntil) {
    head.rotation.x += Math.sin(((obj.nodUntil - now) / 900) * Math.PI * 3) * 0.25;
    torso.rotation.x = Math.sin(((obj.nodUntil - now) / 900) * Math.PI) * 0.2;
  } else {
    torso.rotation.x = 0;
  }
  torso.scale.y = 1 + Math.sin(t * 1.6 + ph) * 0.012;

  const glowTarget = working ? 14 : 0;
  obj.light.intensity += (glowTarget - obj.light.intensity) * 0.1;
  obj.check.position.y = 2.0 + Math.sin(t * 2 + ph) * 0.06;

  const screen = obj.screen;
  if (screen.dirty || (working && now - screen.last > 120)) {
    drawScreen(obj, screen.current ?? EMPTY_ROLE, t);
    screen.dirty = false;
    screen.last = now;
  }
}

function animateAmbient(dt, t) {
  riceTime.value = t;
  for (const l of lamps) l.light.intensity = l.base * (0.9 + Math.sin(t * 7 + l.phase) * 0.06 + Math.sin(t * 13 + l.phase * 2) * 0.04);
  for (const [i, palm] of palms.entries()) {
    const crown = palm.userData.crown;
    crown.rotation.z = Math.sin(t * 0.7 + i) * 0.03;
    crown.rotation.y = Math.sin(t * 0.3 + i * 2) * 0.05;
  }
  scarecrow.rotation.y = Math.sin(t * 0.9) * 0.15;
  scarecrow.rotation.z = Math.sin(t * 1.3) * 0.03;
  // The buffalo grazes and flicks its tail.
  buffalo.head.rotation.x = 0.25 + Math.sin(t * 0.5) * 0.35 + Math.max(0, Math.sin(t * 0.2)) * 0.2;
  buffalo.tail.rotation.z = Math.sin(t * 2.2) * 0.35;
  buffalo.tail.rotation.x = Math.sin(t * 1.5) * 0.1;
  for (const c of chickens) {
    const peck = Math.max(0, Math.sin(t * 3 + c.phase)) ** 6;
    c.neck.rotation.x = peck * 0.9;
  }
  const busy = objects.some((o) => o.state === 'working');
  mortarBeam.rotation.z = Math.sin(t * (busy ? 3.2 : 1.1)) * 0.16;

  for (let i = 0; i < FIREFLY_COUNT; i++) {
    const s = fireflySeeds[i];
    fireflyPositions[i * 3] += Math.sin(t * 0.6 + s * 20) * 0.35 * dt;
    fireflyPositions[i * 3 + 1] += Math.cos(t * 0.8 + s * 14) * 0.25 * dt;
    fireflyPositions[i * 3 + 2] += Math.sin(t * 0.5 + s * 9) * 0.3 * dt;
    const blink = Math.max(0, Math.sin(t * (1.2 + s) + s * 30));
    const b = 0.15 + blink * 0.85;
    fireflyColors[i * 3] = b;
    fireflyColors[i * 3 + 1] = b;
    fireflyColors[i * 3 + 2] = b * 0.7;
  }
  fireflyGeometry.attributes.position.needsUpdate = true;
  fireflyGeometry.attributes.color.needsUpdate = true;
}

function frame() {
  const now = performance.now();
  const dt = Math.min((now - lastFrame) / 1000, 0.1);
  lastFrame = now;
  const t = (now - startedAt) / 1000;

  for (const obj of objects) animateWorker(obj, t);
  updateLead(dt, t);
  animateAmbient(dt, t);

  renderer.render(scene, camera);
  updateOverlays();
  requestAnimationFrame(frame);
}

function resize() {
  const w = window.innerWidth;
  const h = window.innerHeight;
  renderer.setSize(w, h);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  placeCamera();
}

window.addEventListener('resize', resize);
resize();
drawBoard();
requestAnimationFrame(frame);

const source = new EventSource(eventsUrl());
source.onmessage = (msg) => {
  const next = JSON.parse(msg.data);
  planLeadWork(next);
  snapshot = next;
  applyState();
  updateTimer();
};

setInterval(updateTimer, 250);

document.getElementById('reset').addEventListener('click', () => {
  fetch('/reset', { method: 'POST' });
});
