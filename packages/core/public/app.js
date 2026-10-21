import * as THREE from 'three';
import { eventsUrl } from '/themes.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

// Samurai theme: a feudal-era hall at dusk. The original office scene is kept in app.office.js.

// Four stations in a row along the back wall, in pipeline order.
const ROLES = [
  { id: 'SA', kanji: '斥候', title: 'Scout', color: 0x4f7fd6, css: '#4f7fd6', x: -6, skin: 0xf1c9a5, hair: 0x15100d, accessory: 'strawHat' },
  { id: 'Dev', kanji: '鍛冶', title: 'Smith', color: 0xe2543a, css: '#e2543a', x: -2, skin: 0xd9a77f, hair: 0x15100d, accessory: 'hachimaki' },
  { id: 'Tester', kanji: '検分', title: 'Inspector', color: 0xe2a83a, css: '#e2a83a', x: 2, skin: 0xf6d3b3, hair: 0x15100d, accessory: 'jingasa' },
  { id: 'Summary', kanji: '軍師', title: 'Strategist', color: 0xb07ad6, css: '#b07ad6', x: 6, skin: 0xc68c63, hair: 0x15100d, accessory: 'eboshi' },
];
const LEAD_NAME = '大将 Taishō';

const IDLE_GREY = 0x8a8f99;
const DONE_GREEN = 0x7bc47f;
const GOLD = 0xc9a24a;
const DESK_Z = -2.95;
const DESK_H = 0.45;
const PERSON_Z = -3.85;
const CUSHION_TOP = 0.1;
const STAND_HIP = 1.02;
const KNEEL_HIP = 0.21;
const SCREEN_W = 640;
const SCREEN_H = 360;
const SCREEN_Y = 3.4;

// Room extents. The front wall is left out so the camera can see inside.
const ROOM_W = 19;
const ROOM_Z_BACK = -6;
const ROOM_Z_FRONT = 5;
const ROOM_H = 5.2;
const ROOM_CENTER_Z = (ROOM_Z_BACK + ROOM_Z_FRONT) / 2;

// Team lead: where they wait, and how fast they walk between desks.
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
const FOV = 40;
const camera = new THREE.PerspectiveCamera(FOV, 1, 0.1, 120);
const target = new THREE.Vector3(0, 2.0, -0.6);

{
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environmentIntensity = 0.3;
}

// ---------- helpers ----------

const material = (color, opts = {}) =>
  new THREE.MeshStandardMaterial({ color, roughness: 0.75, metalness: 0.05, ...opts });

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

// Box with softened edges, used for furniture.
const rbox = (parent, size, color, pos, radius = 0.04, opts) =>
  addMesh(
    parent,
    new RoundedBoxGeometry(size[0], size[1], size[2], 3, Math.min(radius, Math.min(...size) / 2 - 0.001)),
    material(color),
    pos,
    opts,
  );

const cylinder = (parent, rTop, rBottom, h, color, pos, segments = 20) =>
  addMesh(parent, new THREE.CylinderGeometry(rTop, rBottom, h, segments), material(color), pos);

const sphere = (parent, r, color, pos, opts) =>
  addMesh(parent, new THREE.SphereGeometry(r, 20, 14), material(color, opts), pos);

// Deterministic pseudo random so the decoration looks the same on every load.
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

function canvasTexture(canvas) {
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = renderer.capabilities.getMaxAnisotropy();
  return texture;
}

const FONT = 'system-ui, "Segoe UI", "Noto Sans Thai", sans-serif';
const FONT_JP = '"Yu Mincho", "Hiragino Mincho ProN", "MS Mincho", "Noto Serif JP", serif';

function truncate(text, max) {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

function turnToward(current, goal, maxStep) {
  const diff = ((goal - current + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
  return current + THREE.MathUtils.clamp(diff, -maxStep, maxStep);
}

// A flat picture on a wall. `toneMapped: false` keeps paper and paint at their drawn brightness.
function picture(parent, canvas, [w, h], pos, rotationY = 0) {
  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(w, h),
    new THREE.MeshBasicMaterial({ map: canvasTexture(canvas), toneMapped: false }),
  );
  mesh.position.set(...pos);
  mesh.rotation.y = rotationY;
  parent.add(mesh);
  return mesh;
}

// ---------- lights ----------

scene.add(new THREE.HemisphereLight(0xffe0c0, 0x3a2c24, 0.55));

const sun = new THREE.DirectionalLight(0xffb870, 1.3);
sun.position.set(-6, 12, 8);
sun.target.position.set(0, 0, -1);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.left = -14;
sun.shadow.camera.right = 14;
sun.shadow.camera.top = 12;
sun.shadow.camera.bottom = -12;
sun.shadow.camera.near = 1;
sun.shadow.camera.far = 40;
sun.shadow.bias = -0.0005;
sun.shadow.normalBias = 0.03;
scene.add(sun, sun.target);

// ---------- room ----------

// Tatami mats, 2:1, laid in brick bond. Broad tone changes only, thin detail would shimmer.
function makeTatamiTexture() {
  const canvas = makeCanvas(512, 512);
  const g = canvas.getContext('2d');
  const matH = 128;
  for (let row = 0; row < 4; row++) {
    const offset = (row % 2) * 128;
    for (let k = -1; k < 3; k++) {
      const x = offset + k * 256;
      const y = row * matH;
      g.fillStyle = `hsl(60, 24%, ${44 + seeded(row * 5 + k + 2) * 5}%)`;
      g.fillRect(x, y, 256, matH);
      g.fillStyle = 'rgba(255, 255, 220, 0.05)';
      for (let s = 0; s < 5; s++) g.fillRect(x + s * 52, y, 26, matH);
      // Cloth borders along the long edges, softer than the short edges so the floor does not read as stripes.
      g.fillStyle = 'rgba(38, 44, 24, 0.55)';
      g.fillRect(x, y, 256, 4);
      g.fillRect(x, y + matH - 4, 256, 4);
      g.fillStyle = 'rgba(30, 34, 18, 0.7)';
      g.fillRect(x, y, 3, matH);
    }
  }
  const texture = canvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(ROOM_W / 3.6, (ROOM_Z_FRONT - ROOM_Z_BACK) / 3.6);
  return texture;
}

const room = new THREE.Group();
scene.add(room);

// Dark base plate so the room reads as a diorama. Its top sits just below the floor.
box(room, [ROOM_W + 0.8, 0.5, ROOM_Z_FRONT - ROOM_Z_BACK + 0.8], 0x1c1410, [0, -0.27, ROOM_CENTER_Z], { cast: false });

const floor = new THREE.Mesh(
  new THREE.PlaneGeometry(ROOM_W, ROOM_Z_FRONT - ROOM_Z_BACK),
  new THREE.MeshStandardMaterial({ map: makeTatamiTexture(), roughness: 0.9 }),
);
floor.rotation.x = -Math.PI / 2;
floor.position.set(0, 0, ROOM_CENTER_Z);
floor.receiveShadow = true;
room.add(floor);

const PLASTER = 0xe6dcc3;
const DARK_WOOD = 0x3a2a1d;
const LACQUER = 0x1b1b20;
const wallDepth = ROOM_Z_FRONT - ROOM_Z_BACK + 0.3;
const wallCenterZ = ROOM_Z_BACK - 0.15 + wallDepth / 2;
const innerX = ROOM_W / 2;

box(room, [ROOM_W + 0.6, ROOM_H, 0.3], PLASTER, [0, ROOM_H / 2, ROOM_Z_BACK - 0.15], { cast: false });
box(room, [0.3, ROOM_H, wallDepth], PLASTER, [-innerX - 0.15, ROOM_H / 2, wallCenterZ], { cast: false });
box(room, [0.3, ROOM_H, wallDepth], PLASTER, [innerX + 0.15, ROOM_H / 2, wallCenterZ], { cast: false });

// Dark timber frame: posts, lintels and a low wainscot.
const post = (x, z) => box(room, [0.3, ROOM_H, 0.3], DARK_WOOD, [x, ROOM_H / 2, z], { cast: false });
for (const x of [-innerX + 0.15, -4, 4, innerX - 0.15]) post(x, ROOM_Z_BACK + 0.15);
for (const z of [-1.75, 1.15, ROOM_Z_FRONT - 0.15]) {
  post(-innerX + 0.15, z);
  post(innerX - 0.15, z);
}
box(room, [ROOM_W, 0.3, 0.3], DARK_WOOD, [0, 4.75, ROOM_Z_BACK + 0.15], { cast: false });
box(room, [ROOM_W, 0.16, 0.3], DARK_WOOD, [0, 2.2, ROOM_Z_BACK + 0.15], { cast: false });
box(room, [0.3, 0.3, wallDepth - 0.3], DARK_WOOD, [-innerX + 0.15, 4.75, wallCenterZ], { cast: false });
box(room, [0.3, 0.3, wallDepth - 0.3], DARK_WOOD, [innerX - 0.15, 4.75, wallCenterZ], { cast: false });
box(room, [ROOM_W, 1.0, 0.08], 0x2c1f16, [0, 0.5, ROOM_Z_BACK + 0.04], { cast: false });
box(room, [0.08, 1.0, ROOM_Z_FRONT - ROOM_Z_BACK], 0x2c1f16, [-innerX + 0.04, 0.5, ROOM_CENTER_Z], { cast: false });
box(room, [0.08, 1.0, ROOM_Z_FRONT - ROOM_Z_BACK], 0x2c1f16, [innerX - 0.04, 0.5, ROOM_CENTER_Z], { cast: false });

// Tiled roof edge above the walls.
box(room, [ROOM_W + 1.0, 0.4, 1.1], 0x2b2b30, [0, ROOM_H + 0.15, ROOM_Z_BACK + 0.35], { cast: false });
box(room, [1.1, 0.4, wallDepth], 0x2b2b30, [-innerX - 0.35, ROOM_H + 0.15, wallCenterZ], { cast: false });
box(room, [1.1, 0.4, wallDepth], 0x2b2b30, [innerX + 0.35, ROOM_H + 0.15, wallCenterZ], { cast: false });
box(room, [ROOM_W + 1.0, 0.08, 1.14], 0x8a8a92, [0, ROOM_H + 0.37, ROOM_Z_BACK + 0.35], { cast: false });

// Shoji screens on the left wall: warm paper with a lattice, lit from outside.
function makeShojiCanvas() {
  const canvas = makeCanvas(256, 288);
  const g = canvas.getContext('2d');
  const grad = g.createLinearGradient(0, 0, 0, 288);
  grad.addColorStop(0, '#fff0cf');
  grad.addColorStop(1, '#f2d9a0');
  g.fillStyle = grad;
  g.fillRect(0, 0, 256, 288);
  g.fillStyle = '#4a3524';
  for (let i = 0; i <= 4; i++) g.fillRect(i * 62 - (i === 4 ? 6 : 0), 0, 6, 288);
  for (let j = 0; j <= 6; j++) g.fillRect(0, j * 47 - (j === 6 ? 6 : 0), 256, 6);
  return canvas;
}
for (const z of [-2.9, 2.2]) {
  box(room, [0.12, 2.7, 2.5], DARK_WOOD, [-innerX + 0.06, 2.35, z], { cast: false });
  picture(room, makeShojiCanvas(), [2.2, 2.4], [-innerX + 0.13, 2.35, z], Math.PI / 2);
}

// Gold-leaf screens (byobu) on the right wall: mountains, mist and a pine.
function makeGoldScreenCanvas(seed) {
  const canvas = makeCanvas(512, 416);
  const g = canvas.getContext('2d');
  const grad = g.createLinearGradient(0, 0, 0, 416);
  grad.addColorStop(0, '#e6c26a');
  grad.addColorStop(1, '#b88a2e');
  g.fillStyle = grad;
  g.fillRect(0, 0, 512, 416);
  g.fillStyle = 'rgba(255, 244, 205, 0.55)';
  for (let i = 0; i < 4; i++) g.fillRect(0, 70 + i * 70 + seeded(seed + i) * 20, 512, 26);
  g.fillStyle = '#2a3f4c';
  g.beginPath();
  g.moveTo(0, 300);
  g.lineTo(90, 190 + seeded(seed) * 30);
  g.lineTo(180, 290);
  g.lineTo(290, 150 + seeded(seed + 2) * 30);
  g.lineTo(400, 280);
  g.lineTo(470, 210);
  g.lineTo(512, 300);
  g.lineTo(512, 416);
  g.lineTo(0, 416);
  g.fill();
  g.fillStyle = 'rgba(255, 244, 205, 0.5)';
  g.fillRect(0, 285, 512, 34);
  g.fillStyle = '#1d1a14';
  g.fillRect(350 + seeded(seed) * 20, 190, 14, 226);
  for (let i = 0; i < 5; i++) {
    g.beginPath();
    g.ellipse(332 + i * 18 + seeded(seed + i) * 12, 200 + i * 26, 72 - i * 6, 20, 0, 0, Math.PI * 2);
    g.fill();
  }
  g.fillStyle = '#c0392b';
  g.beginPath();
  g.arc(80, 90, 38, 0, Math.PI * 2);
  g.fill();
  return canvas;
}
for (const [z, seed] of [[-3.3, 3], [3.6, 9]]) {
  box(room, [0.1, 2.9, 3.6], DARK_WOOD, [innerX - 0.05, 2.35, z], { cast: false });
  picture(room, makeGoldScreenCanvas(seed), [3.4, 2.7], [innerX - 0.11, 2.35, z], -Math.PI / 2);
}

// Katana, shared by the alcove stand, the lead and the workers.
function buildKatana() {
  const group = new THREE.Group();
  box(group, [0.05, 0.05, 0.85], 0x15151a, [0, 0, 0.36], { cast: true });
  box(group, [0.046, 0.046, 0.28], 0x3a2a2a, [0, 0, -0.2]);
  for (let i = 0; i < 4; i++) box(group, [0.052, 0.052, 0.025], 0x1b1b1b, [0, 0, -0.3 + i * 0.065], { cast: false });
  addMesh(group, new THREE.CylinderGeometry(0.065, 0.065, 0.014, 16), material(GOLD, { metalness: 0.7, roughness: 0.35 }), [0, 0, -0.04]).rotation.x = Math.PI / 2;
  box(group, [0.056, 0.056, 0.05], GOLD, [0, 0, 0.8], { cast: false });
  return group;
}

// Tokonoma alcove on the right wall: hanging scroll, ikebana and a sword stand.
function makeScrollCanvas() {
  const canvas = makeCanvas(160, 360);
  const g = canvas.getContext('2d');
  g.fillStyle = '#243a5e';
  g.fillRect(0, 0, 160, 360);
  g.fillStyle = '#efe3c4';
  g.fillRect(14, 22, 132, 316);
  g.fillStyle = '#c9a24a';
  g.fillRect(14, 22, 132, 6);
  g.fillRect(14, 332, 132, 6);
  g.fillStyle = '#15100d';
  g.font = `700 112px ${FONT_JP}`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText('武', 80, 150);
  g.font = `700 70px ${FONT_JP}`;
  g.fillText('士', 80, 250);
  g.fillStyle = '#b3261e';
  g.fillRect(112, 296, 22, 22);
  return canvas;
}
{
  const x = innerX;
  const z = 0.2;
  box(room, [0.1, 3.4, 2.3], 0xcbbd98, [x - 0.06, 2.1, z], { cast: false });
  box(room, [0.2, 3.5, 0.2], DARK_WOOD, [x - 0.12, 1.85, z - 1.15], { cast: false });
  box(room, [0.2, 3.5, 0.2], DARK_WOOD, [x - 0.12, 1.85, z + 1.15], { cast: false });
  box(room, [0.2, 0.2, 2.5], DARK_WOOD, [x - 0.12, 3.6, z], { cast: false });
  picture(room, makeScrollCanvas(), [0.85, 1.9], [x - 0.13, 2.45, z - 0.1], -Math.PI / 2);
  box(room, [0.9, 0.22, 2.2], 0x2d1f16, [x - 0.5, 0.11, z]);
  cylinder(room, 0.11, 0.13, 0.34, 0x2e5a5a, [x - 0.45, 0.39, z - 0.55], 16);
  box(room, [0.02, 0.7, 0.02], 0x4a3322, [x - 0.45, 0.85, z - 0.55], { cast: false });
  for (const [bx, by, bz] of [[0, 1.2, 0], [0.08, 1.05, 0.1], [-0.06, 0.95, -0.1]]) sphere(room, 0.1, 0xf5b7c8, [x - 0.45 + bx, by, z - 0.55 + bz]);
  // Sword stand holding two katana.
  const standX = x - 0.55;
  box(room, [0.3, 0.05, 0.8], 0x15100d, [standX, 0.25, z + 0.55]);
  for (const sz of [-0.3, 0.3]) box(room, [0.06, 0.5, 0.06], 0x15100d, [standX, 0.5, z + 0.55 + sz]);
  for (const [sy, sx] of [[0.42, -0.04], [0.62, 0.04]]) {
    const sword = buildKatana();
    sword.position.set(standX + sx, sy, z + 0.05);
    room.add(sword);
  }
}

// Family crest on the back wall between the second and third status boards.
{
  const canvas = makeCanvas(256, 256);
  const g = canvas.getContext('2d');
  g.fillStyle = '#1b1b20';
  g.beginPath();
  g.arc(128, 128, 126, 0, Math.PI * 2);
  g.fill();
  g.strokeStyle = '#c9a24a';
  g.lineWidth = 8;
  g.beginPath();
  g.arc(128, 128, 112, 0, Math.PI * 2);
  g.stroke();
  g.fillStyle = '#c9a24a';
  for (let i = 0; i < 3; i++) {
    g.save();
    g.translate(128, 128);
    g.rotate((i * Math.PI * 2) / 3);
    g.beginPath();
    g.ellipse(0, -52, 30, 54, 0, 0, Math.PI * 2);
    g.fill();
    g.restore();
  }
  const crest = new THREE.Mesh(new THREE.PlaneGeometry(0.76, 0.76), new THREE.MeshBasicMaterial({ map: canvasTexture(canvas), transparent: true, toneMapped: false }));
  crest.position.set(0, SCREEN_Y, ROOM_Z_BACK + 0.04);
  room.add(crest);
}

// Armour on a stand in the back-left corner.
function buildArmor(x, z, scale = 1) {
  const group = new THREE.Group();
  group.position.set(x, 0, z);
  group.scale.setScalar(scale);
  room.add(group);
  const red = 0x8c1d18;
  box(group, [0.9, 0.1, 0.9], 0x15100d, [0, 0.05, 0]);
  cylinder(group, 0.05, 0.05, 0.6, 0x15100d, [0, 0.4, 0], 8);
  for (let i = 0; i < 3; i++) {
    box(group, [0.78 + i * 0.08, 0.12, 0.5 + i * 0.05], i % 2 ? 0x1b1b24 : red, [0, 0.62 - i * 0.1, 0.02 + i * 0.03]);
  }
  box(group, [0.7, 0.68, 0.45], 0x1b1b24, [0, 1.08, 0]);
  for (let i = 0; i < 4; i++) box(group, [0.72, 0.07, 0.47], red, [0, 0.82 + i * 0.16, 0], { cast: false });
  for (const side of [-1, 1]) {
    const sode = box(group, [0.34, 0.5, 0.14], red, [side * 0.52, 1.1, 0]);
    sode.rotation.z = side * 0.2;
    box(group, [0.36, 0.05, 0.16], GOLD, [side * 0.5, 1.33, 0], { cast: false });
  }
  const bowl = sphere(group, 0.28, 0x2a2a30, [0, 1.66, 0]);
  bowl.scale.set(1, 0.85, 1);
  box(group, [0.72, 0.14, 0.52], red, [0, 1.48, -0.03]);
  const mask = sphere(group, 0.17, 0x7d1a15, [0, 1.52, 0.17]);
  mask.scale.set(1, 0.9, 0.7);
  const horns = addMesh(group, new THREE.TorusGeometry(0.3, 0.03, 8, 28, Math.PI), material(GOLD, { metalness: 0.7, roughness: 0.3 }), [0, 1.78, 0.14], { cast: false });
  horns.rotation.z = Math.PI;
  horns.position.y = 2.1;
}
buildArmor(-8.4, -5.0, 1.15);

// Sakura tree in a large pot, back-right corner.
{
  const group = new THREE.Group();
  group.position.set(8.4, 0, -4.9);
  group.scale.setScalar(1.15);
  room.add(group);
  cylinder(group, 0.5, 0.4, 0.55, 0x3a4a63, [0, 0.28, 0]);
  const trunk = cylinder(group, 0.09, 0.16, 1.6, 0x4a3322, [0, 1.3, 0], 10);
  trunk.rotation.z = 0.08;
  for (const [bx, by, bz, r, c] of [
    [0, 2.3, 0, 0.75, 0xf5b7c8], [0.55, 2.0, 0.1, 0.5, 0xf8c8d4], [-0.55, 2.05, -0.1, 0.55, 0xf2a9bd],
    [0.1, 2.75, 0.1, 0.45, 0xf8c8d4], [-0.2, 2.1, 0.5, 0.4, 0xf5b7c8],
  ]) sphere(group, r, c, [bx, by, bz], { roughness: 0.9 });
}

// Nobori banners near the front corners.
function makeBannerCanvas(text, bg, fg) {
  const canvas = makeCanvas(128, 384);
  const g = canvas.getContext('2d');
  g.fillStyle = bg;
  g.fillRect(0, 0, 128, 384);
  g.fillStyle = '#c9a24a';
  g.fillRect(0, 0, 8, 384);
  g.fillRect(120, 0, 8, 384);
  g.fillStyle = fg;
  g.font = `700 72px ${FONT_JP}`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  [...text].forEach((ch, i) => g.fillText(ch, 64, 48 + i * (336 / text.length)));
  return canvas;
}
const banners = [
  { x: -8.9, z: 4.5, canvas: makeBannerCanvas('風林火山', '#14213d', '#e6c26a') },
  { x: 8.9, z: 4.5, canvas: makeBannerCanvas('天下布武', '#8c1d18', '#f3e7c9') },
].map(({ x, z, canvas }) => {
  const group = new THREE.Group();
  group.position.set(x, 0, z);
  room.add(group);
  cylinder(group, 0.04, 0.05, 3.7, 0x15100d, [0, 1.85, 0], 8);
  box(group, [0.9, 0.05, 0.05], 0x15100d, [0.4 * Math.sign(-x), 3.55, 0], { cast: false });
  cylinder(group, 0.1, 0.1, 0.06, 0x15100d, [0, 0.03, 0], 16);
  const cloth = new THREE.Mesh(new THREE.PlaneGeometry(0.75, 2.4), new THREE.MeshStandardMaterial({ map: canvasTexture(canvas), side: THREE.DoubleSide, roughness: 0.9 }));
  cloth.position.set(0.4 * Math.sign(-x), 2.3, 0);
  cloth.castShadow = true;
  group.add(cloth);
  return cloth;
});

// Paper floor lanterns (andon). Each has a warm light that flickers.
const andons = [];
function buildAndon(x, z) {
  const group = new THREE.Group();
  group.position.set(x, 0, z);
  room.add(group);
  rbox(group, [0.46, 0.16, 0.46], 0x2c1f16, [0, 0.08, 0], 0.02);
  addMesh(group, new THREE.BoxGeometry(0.34, 0.8, 0.34), material(0xffe0a8, { emissive: 0xff9f43, emissiveIntensity: 1.0, roughness: 0.9 }), [0, 0.56, 0], { cast: false });
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) box(group, [0.04, 0.84, 0.04], 0x2c1f16, [sx * 0.18, 0.58, sz * 0.18], { cast: false });
  rbox(group, [0.5, 0.07, 0.5], 0x2c1f16, [0, 1.02, 0], 0.02);
  const light = new THREE.PointLight(0xffa84a, 5, 6, 2);
  light.position.set(0, 0.7, 0);
  group.add(light);
  andons.push({ light, base: 5, phase: seeded(x * 3 + z) * 10 });
}
buildAndon(-4, -5.35);
buildAndon(4, -5.35);
buildAndon(-8.4, 3.6);
buildAndon(8.4, 3.6);

// War council table in the middle: a low table with a campaign map and cushions around it.
function makeMapCanvas() {
  const canvas = makeCanvas(512, 256);
  const g = canvas.getContext('2d');
  g.fillStyle = '#ead9b0';
  g.fillRect(0, 0, 512, 256);
  g.fillStyle = '#c9b27a';
  g.fillRect(0, 0, 512, 10);
  g.fillRect(0, 246, 512, 10);
  g.fillStyle = '#b9a56d';
  g.beginPath();
  g.moveTo(70, 190);
  g.lineTo(130, 90);
  g.lineTo(230, 70);
  g.lineTo(300, 120);
  g.lineTo(380, 100);
  g.lineTo(450, 160);
  g.lineTo(390, 210);
  g.lineTo(220, 220);
  g.closePath();
  g.fill();
  g.strokeStyle = '#6b5a38';
  g.lineWidth = 3;
  g.stroke();
  g.strokeStyle = '#3f6f8a';
  g.lineWidth = 4;
  g.beginPath();
  g.moveTo(230, 72);
  g.quadraticCurveTo(250, 140, 300, 160);
  g.quadraticCurveTo(340, 175, 380, 210);
  g.stroke();
  for (const [x, y, c] of [[150, 120, '#b3261e'], [250, 100, '#b3261e'], [340, 140, '#14213d'], [400, 170, '#14213d'], [200, 180, '#14213d']]) {
    g.fillStyle = c;
    g.fillRect(x, y, 6, 34);
    g.beginPath();
    g.moveTo(x + 6, y);
    g.lineTo(x + 30, y + 8);
    g.lineTo(x + 6, y + 16);
    g.fill();
  }
  return canvas;
}
{
  const group = new THREE.Group();
  group.position.set(0, 0, 1.5);
  room.add(group);
  rbox(group, [3.0, 0.1, 1.5], 0x3a2a1d, [0, 0.4, 0], 0.03);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) box(group, [0.12, 0.36, 0.12], 0x2c1f16, [sx * 1.3, 0.18, sz * 0.6]);
  const map = new THREE.Mesh(new THREE.PlaneGeometry(2.8, 1.3), new THREE.MeshBasicMaterial({ map: canvasTexture(makeMapCanvas()), toneMapped: false }));
  map.rotation.x = -Math.PI / 2;
  map.position.y = 0.455;
  group.add(map);
  cylinder(group, 0.1, 0.12, 0.12, 0x2e5a5a, [1.05, 0.52, 0.45], 16);
  for (const sx of [-0.2, 0.05]) cylinder(group, 0.045, 0.04, 0.05, 0xefe3c4, [1.28 + sx, 0.49, 0.2], 12);
  for (const [cx, cz] of [[-1.0, 1.15], [1.0, 1.15], [-1.0, -1.15], [1.0, -1.15]]) {
    rbox(group, [0.8, 0.1, 0.8], 0x7a2a2a, [cx, 0.05, cz], 0.04);
    box(group, [0.8, 0.012, 0.06], GOLD, [cx, 0.105, cz - 0.3], { cast: false });
  }
}

// Taiko drum on a stand, front-left.
{
  const group = new THREE.Group();
  group.position.set(-6.2, 0, 3.0);
  group.rotation.y = 0.3;
  room.add(group);
  for (const sz of [-1, 1]) {
    const leg = box(group, [0.12, 1.1, 0.12], 0x2c1f16, [0, 0.5, sz * 0.5]);
    leg.rotation.x = sz * 0.0;
    box(group, [1.0, 0.12, 0.2], 0x2c1f16, [0, 0.06, sz * 0.5]);
  }
  const drum = addMesh(group, new THREE.CylinderGeometry(0.55, 0.55, 0.85, 32), material(0x6b3a1e, { roughness: 0.6 }), [0, 0.95, 0]);
  drum.rotation.z = Math.PI / 2;
  for (const sx of [-1, 1]) {
    const skin = addMesh(group, new THREE.CylinderGeometry(0.5, 0.5, 0.03, 32), material(0xf0e2c0, { roughness: 0.8 }), [sx * 0.43, 0.95, 0]);
    skin.rotation.z = Math.PI / 2;
    const ring = addMesh(group, new THREE.TorusGeometry(0.53, 0.03, 8, 32), material(0x8c1d18), [sx * 0.43, 0.95, 0], { cast: false });
    ring.rotation.y = Math.PI / 2;
  }
  for (let i = 0; i < 14; i++) {
    const a = (i / 14) * Math.PI * 2;
    sphere(group, 0.024, GOLD, [0.34, 0.95 + Math.sin(a) * 0.55, Math.cos(a) * 0.55], { metalness: 0.7, roughness: 0.3 }).castShadow = false;
  }
  for (const sz of [-0.1, 0.1]) {
    const stick = cylinder(group, 0.012, 0.018, 0.5, 0xd9c08a, [0.1, 1.55, sz], 8);
    stick.rotation.z = Math.PI / 2;
    stick.rotation.y = sz * 3;
  }
}

// Tea corner, front-right: low round table, teapot, cups and two cushions.
{
  const group = new THREE.Group();
  group.position.set(6.2, 0, 2.9);
  room.add(group);
  cylinder(group, 0.62, 0.62, 0.07, 0x4a3222, [0, 0.38, 0], 32);
  cylinder(group, 0.12, 0.2, 0.34, 0x2c1f16, [0, 0.18, 0], 12);
  sphere(group, 0.13, 0x2e5a5a, [0.12, 0.5, 0.05]).scale.set(1, 0.85, 1);
  cylinder(group, 0.04, 0.04, 0.05, 0x2e5a5a, [0.12, 0.62, 0.05], 10);
  for (const [cx, cz] of [[-0.2, 0.2], [-0.1, -0.25], [0.3, 0.3]]) cylinder(group, 0.05, 0.035, 0.05, 0xf3e6c4, [cx, 0.445, cz], 14);
  for (const [cx, cz] of [[-1.0, 0], [1.0, 0.1]]) {
    rbox(group, [0.8, 0.1, 0.8], 0x2a3f6e, [cx, 0.05, cz], 0.04);
    box(group, [0.06, 0.012, 0.8], GOLD, [cx, 0.105, cz], { cast: false });
  }
}

// Falling sakura petals drifting through the hall.
const PETAL_COUNT = 70;
const petalPositions = new Float32Array(PETAL_COUNT * 3);
const petalSeeds = Array.from({ length: PETAL_COUNT }, (_, i) => seeded(i + 11));
function respawnPetal(i, anywhere) {
  petalPositions[i * 3] = (seeded(i * 3.1 + performance.now() * 0.001) - 0.5) * ROOM_W;
  petalPositions[i * 3 + 1] = anywhere ? seeded(i * 7.7) * 6 : 6 + Math.random() * 1.5;
  petalPositions[i * 3 + 2] = ROOM_Z_BACK + 0.5 + Math.random() * (ROOM_Z_FRONT - ROOM_Z_BACK - 1);
}
for (let i = 0; i < PETAL_COUNT; i++) respawnPetal(i, true);
const petalGeometry = new THREE.BufferGeometry();
petalGeometry.setAttribute('position', new THREE.BufferAttribute(petalPositions, 3));
const petalTexture = (() => {
  const canvas = makeCanvas(64, 64);
  const g = canvas.getContext('2d');
  const grad = g.createRadialGradient(32, 32, 2, 32, 32, 28);
  grad.addColorStop(0, '#ffe3ec');
  grad.addColorStop(1, '#f2a3bb');
  g.fillStyle = grad;
  g.beginPath();
  g.ellipse(32, 32, 26, 14, 0.6, 0, Math.PI * 2);
  g.fill();
  return canvasTexture(canvas);
})();
const petals = new THREE.Points(
  petalGeometry,
  new THREE.PointsMaterial({ map: petalTexture, size: 0.2, transparent: true, depthWrite: false, sizeAttenuation: true }),
);
petals.frustumCulled = false;
scene.add(petals);

// ---------- status boards ----------

// Ink brush ring (enso) used for the finished state.
function drawEnso(g, cx, cy, r, color) {
  g.strokeStyle = color;
  g.lineWidth = 16;
  g.lineCap = 'round';
  g.beginPath();
  g.arc(cx, cy, r, 0.35 * Math.PI, 1.85 * Math.PI);
  g.stroke();
}

function drawScreen(obj, r, t) {
  const { ctx } = obj.screen;
  const { role } = obj;
  ctx.fillStyle = '#16110e';
  ctx.fillRect(0, 0, SCREEN_W, SCREEN_H);
  ctx.strokeStyle = '#b8923f';
  ctx.lineWidth = 4;
  ctx.strokeRect(10, 10, SCREEN_W - 20, SCREEN_H - 20);
  ctx.fillStyle = role.css;
  ctx.fillRect(10, 10, SCREEN_W - 20, 76);

  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';
  ctx.fillStyle = '#ffffff';
  ctx.font = `700 46px ${FONT_JP}`;
  ctx.fillText(role.kanji, 34, 50);
  const kanjiWidth = ctx.measureText(role.kanji).width;
  ctx.font = `600 26px ${FONT}`;
  ctx.fillText(role.title.toUpperCase(), 34 + kanjiWidth + 16, 52);
  ctx.textAlign = 'right';
  ctx.font = `700 34px ${FONT_JP}`;
  ctx.fillText(r.state === 'working' ? '作業中' : r.state === 'done' || r.done ? '完了' : '待機', SCREEN_W - 34, 50);
  ctx.textAlign = 'left';

  if (r.state === 'working') {
    ctx.fillStyle = '#f6e3b4';
    ctx.font = `600 34px ${FONT}`;
    ctx.fillText(r.tool ?? '', 34, 128);
    if (r.detail) {
      ctx.fillStyle = '#a8977e';
      ctx.font = `500 22px ${FONT}`;
      ctx.fillText(truncate(r.detail, 38), 34, 164);
    }
    // Brush strokes that grow and fade like ink being written.
    const tick = Math.floor(t * 3);
    for (let i = 0; i < 4; i++) {
      const w = 160 + ((i * 97 + tick * 61) % 340);
      ctx.fillStyle = role.css;
      ctx.globalAlpha = 0.35 + ((i + tick) % 3) * 0.2;
      ctx.beginPath();
      ctx.roundRect(34, 200 + i * 36, w, 16, 8);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  } else if (r.state === 'done' || r.done) {
    drawEnso(ctx, 320, 215, 78, '#7bc47f');
    ctx.fillStyle = '#7bc47f';
    ctx.font = `700 84px ${FONT_JP}`;
    ctx.textAlign = 'center';
    ctx.fillText('完', 320, 222);
    ctx.textAlign = 'left';
  } else {
    ctx.fillStyle = '#6f6254';
    ctx.font = `700 70px ${FONT_JP}`;
    ctx.fillText('待機中', 34, 160);
    ctx.font = `500 26px ${FONT}`;
    ctx.fillText('Waiting for orders', 34, 220);
  }
  obj.screen.texture.needsUpdate = true;
}

// ---------- people ----------

// One humanoid rig for workers and the team lead: pelvis with torso, head, arms and two-segment legs.
function createPerson({ shirt, pants, skin, hair, accessory = null, lead = false }) {
  const root = new THREE.Group();
  const pelvis = new THREE.Group();
  pelvis.position.y = STAND_HIP;
  root.add(pelvis);

  const torso = addMesh(pelvis, new THREE.CapsuleGeometry(0.26, 0.23, 6, 16), material(shirt), [0, 0.33, 0]);
  // Kimono collar and obi sash.
  for (const side of [-1, 1]) {
    const lapel = box(pelvis, [0.03, 0.24, 0.015], 0xe9e2cf, [side * 0.05, 0.46, 0.258], { cast: false });
    lapel.rotation.z = -side * 0.3;
  }
  cylinder(pelvis, 0.275, 0.275, 0.11, 0x1b1b24, [0, 0.07, 0], 20);
  if (lead) {
    // Wide shoulders of a kamishimo and a gold crest.
    for (const side of [-1, 1]) {
      const wing = box(pelvis, [0.42, 0.05, 0.4], 0x14213d, [side * 0.3, 0.64, 0], { cast: false });
      wing.rotation.z = -side * 0.3;
      box(pelvis, [0.42, 0.015, 0.025], GOLD, [side * 0.3, 0.66, 0.2], { cast: false }).rotation.z = -side * 0.3;
    }
    addMesh(pelvis, new THREE.CylinderGeometry(0.06, 0.06, 0.012, 16), material(GOLD, { metalness: 0.6, roughness: 0.4 }), [0, 0.3, 0.26], { cast: false }).rotation.x = Math.PI / 2;
    const sword = buildKatana();
    sword.position.set(-0.3, 0.08, 0.05);
    sword.rotation.set(0.1, 0.12, 0);
    pelvis.add(sword);
  }

  const legs = [-1, 1].map((side) => {
    const hip = new THREE.Group();
    hip.position.set(side * 0.14, 0, 0);
    pelvis.add(hip);
    addMesh(hip, new THREE.CapsuleGeometry(0.13, 0.18, 4, 10), material(pants), [0, -0.21, 0]);
    const knee = new THREE.Group();
    knee.position.y = -0.42;
    hip.add(knee);
    addMesh(knee, new THREE.CapsuleGeometry(0.11, 0.29, 4, 10), material(pants), [0, -0.25, 0]);
    const shoe = box(knee, [0.17, 0.1, 0.3], 0xefe9dc, [0, -0.55, 0.06]);
    return { hip, knee, shoe };
  });

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
  box(head, [0.09, 0.016, 0.012], 0x8a3f36, [0, -0.11, 0.245], { cast: false });
  if (lead) box(head, [0.2, 0.035, 0.02], hair, [0, -0.07, 0.25], { cast: false });

  // Chonmage topknot for the bare-headed.
  if (accessory === 'hachimaki' || lead) {
    const knot = cylinder(head, 0.045, 0.05, 0.22, hair, [0, 0.3, 0.06], 10);
    knot.rotation.x = 0.7;
    box(head, [0.1, 0.03, 0.1], 0xf4f0e6, [0, 0.24, 0.02], { cast: false });
  }

  if (accessory === 'strawHat') {
    const hat = addMesh(head, new THREE.ConeGeometry(0.52, 0.24, 28), material(0xd8bf7a, { roughness: 0.95 }), [0, 0.22, 0], { cast: false });
    hat.scale.set(1, 1, 1);
  } else if (accessory === 'hachimaki') {
    const band = addMesh(head, new THREE.TorusGeometry(0.268, 0.03, 8, 28), material(0xf4f0e6), [0, 0.1, 0], { cast: false });
    band.rotation.x = Math.PI / 2;
    box(head, [0.08, 0.2, 0.03], 0xf4f0e6, [0.06, 0.03, -0.29], { cast: false });
  } else if (accessory === 'jingasa') {
    addMesh(head, new THREE.ConeGeometry(0.47, 0.13, 28), material(0x1a1a1f, { roughness: 0.4, metalness: 0.2 }), [0, 0.25, 0], { cast: false });
    sphere(head, 0.035, GOLD, [0, 0.33, 0]).castShadow = false;
  } else if (accessory === 'eboshi') {
    const hat = box(head, [0.26, 0.42, 0.2], 0x15151a, [0, 0.38, -0.03], { cast: false });
    hat.rotation.x = -0.25;
    box(head, [0.3, 0.04, 0.24], 0x15151a, [0, 0.2, 0], { cast: false });
  }

  return { root, pelvis, torso, head, armL: arms[0], armR: arms[1], legL: legs[0], legR: legs[1] };
}

// Seiza: kneeling with the shins folded flat under the thighs. Used by the workers.
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
  g.fillStyle = '#2e7d4f';
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
  g.fillStyle = '#2b1d14';
  g.fillRect(0, 0, 256, 64);
  g.fillStyle = role.css;
  g.fillRect(0, 0, 10, 64);
  g.fillStyle = '#f6e3b4';
  g.font = `700 36px ${FONT_JP}`;
  g.textBaseline = 'middle';
  g.textAlign = 'left';
  g.fillText(role.kanji, 24, 34);
  g.font = `600 22px ${FONT}`;
  g.fillText(role.title.toUpperCase(), 118, 36);
  return canvasTexture(canvas);
}

function buildStation(role, index) {
  const station = new THREE.Group();
  station.position.x = role.x;
  scene.add(station);

  // Cushion (zabuton) under the kneeling worker.
  rbox(station, [0.95, CUSHION_TOP, 1.15], 0x7a2a2a, [0, CUSHION_TOP / 2, PERSON_Z + 0.12], 0.04);
  box(station, [0.95, 0.012, 0.06], GOLD, [0, CUSHION_TOP + 0.002, PERSON_Z + 0.6], { cast: false });

  // Low writing desk with paper, ink stone and brush.
  rbox(station, [2.3, 0.08, 1.0], 0x4a3222, [0, DESK_H, DESK_Z], 0.02);
  for (const sx of [-1, 1]) rbox(station, [0.08, DESK_H - 0.04, 0.9], 0x33231a, [sx * 1.05, (DESK_H - 0.04) / 2, DESK_Z], 0.02);
  const paper = box(station, [0.85, 0.012, 0.52], 0xf3e6c4, [-0.3, DESK_H + 0.05, DESK_Z + 0.05], { cast: false });
  paper.rotation.y = 0.04;
  for (let i = 0; i < 4; i++) box(station, [0.62 - i * 0.06, 0.014, 0.012], 0x15100d, [-0.35, DESK_H + 0.057, DESK_Z - 0.12 + i * 0.07], { cast: false });
  const seal = addMesh(
    station,
    new THREE.CylinderGeometry(0.05, 0.05, 0.016, 16),
    material(0xb3261e, { emissive: 0x000000, emissiveIntensity: 1.4 }),
    [0.05, DESK_H + 0.06, DESK_Z + 0.2],
    { cast: false },
  );
  box(station, [0.2, 0.04, 0.12], 0x15100d, [0.55, DESK_H + 0.06, DESK_Z + 0.12]);
  const brush = cylinder(station, 0.01, 0.014, 0.34, 0x3a2a1d, [0.4, DESK_H + 0.1, DESK_Z + 0.3], 8);
  brush.rotation.z = Math.PI / 2;
  brush.rotation.y = 0.5;

  // Small desk lantern. Its paper glows in the role colour while the role works.
  box(station, [0.2, 0.04, 0.2], 0x2c1f16, [0.9, DESK_H + 0.06, DESK_Z - 0.25]);
  const bulb = addMesh(
    station,
    new THREE.BoxGeometry(0.16, 0.3, 0.16),
    material(0xe8dcc0, { emissive: 0x000000, emissiveIntensity: 1.6, roughness: 0.9 }),
    [0.9, DESK_H + 0.23, DESK_Z - 0.25],
    { cast: false },
  );
  box(station, [0.24, 0.04, 0.24], 0x2c1f16, [0.9, DESK_H + 0.4, DESK_Z - 0.25]);

  box(station, [0.55, 0.05, 0.08], 0x15100d, [-0.85, DESK_H + 0.07, DESK_Z + 0.45], { cast: false });
  const plate = new THREE.Mesh(new THREE.PlaneGeometry(0.52, 0.13), new THREE.MeshBasicMaterial({ map: makeNameplateTexture(role), toneMapped: false }));
  plate.position.set(-0.85, DESK_H + 0.12, DESK_Z + 0.5);
  plate.rotation.x = -0.35;
  station.add(plate);

  // Scroll that the lead hands over.
  const ticket = new THREE.Group();
  ticket.position.set(0.45, DESK_H + 0.08, DESK_Z + 0.22);
  ticket.rotation.y = 0.3;
  ticket.visible = false;
  station.add(ticket);
  cylinder(ticket, 0.04, 0.04, 0.5, 0xf3e6c4, [0, 0, 0], 12).rotation.z = Math.PI / 2;
  for (const sx of [-0.18, 0.18]) box(ticket, [0.025, 0.09, 0.09], 0xb3261e, [sx, 0, 0], { cast: false });

  // Katana laid on the floor to the worker's right.
  const katana = buildKatana();
  katana.position.set(0.95, 0.05, PERSON_Z - 0.35);
  katana.rotation.y = 0.05;
  station.add(katana);

  // Person.
  const person = createPerson({
    shirt: role.color,
    pants: 0x1f2540,
    skin: role.skin,
    hair: role.hair,
    accessory: role.accessory,
  });
  person.root.position.set(0, CUSHION_TOP, PERSON_Z);
  poseKneeling(person);
  station.add(person.root);

  // Check mark that floats over the head when the role is done.
  const check = new THREE.Sprite(new THREE.SpriteMaterial({ map: checkTexture, transparent: true, depthTest: false }));
  check.scale.setScalar(0.6);
  check.position.set(0, 1.95, PERSON_Z);
  check.visible = false;
  station.add(check);

  // Status board on the wall behind the worker, hung from the lintel by cords.
  const canvas = makeCanvas(SCREEN_W, SCREEN_H);
  const texture = canvasTexture(canvas);
  rbox(station, [3.3, 1.95, 0.1], 0x2b1d14, [0, SCREEN_Y, ROOM_Z_BACK + 0.06], 0.04, { cast: false });
  box(station, [3.3, 0.04, 0.12], GOLD, [0, SCREEN_Y + 0.99, ROOM_Z_BACK + 0.06], { cast: false });
  box(station, [3.3, 0.04, 0.12], GOLD, [0, SCREEN_Y - 0.99, ROOM_Z_BACK + 0.06], { cast: false });
  for (const sx of [-1.3, 1.3]) cylinder(station, 0.012, 0.012, 0.95, 0x8c1d18, [sx, 4.35, ROOM_Z_BACK + 0.1], 6);
  const screenMesh = new THREE.Mesh(
    new THREE.PlaneGeometry(3.0, 1.7),
    new THREE.MeshBasicMaterial({ map: texture, toneMapped: false }),
  );
  screenMesh.position.set(0, SCREEN_Y, ROOM_Z_BACK + 0.13);
  station.add(screenMesh);

  // Coloured glow over the desk while the role works.
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
    logo: seal,
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
    anchor: new THREE.Vector3(role.x, 2.0, PERSON_Z),
    screen: { ctx: canvas.getContext('2d'), texture, dirty: true, last: 0, current: null },
  };
  drawScreen(obj, { state: 'waiting', tool: null, detail: null, done: false }, 0);
  return obj;
}

const objects = ROLES.map(buildStation);

// Arrows on the floor between desks show the hand-off direction.
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
  mesh.position.set((ROLES[i].x + ROLES[i + 1].x) / 2, 0.03, DESK_Z + 0.1);
  scene.add(mesh);
  return mesh;
});

// ---------- task board on the left wall ----------

const BOARD_W = 832;
const BOARD_H = 512;
const boardCanvas = makeCanvas(BOARD_W, BOARD_H);
const boardTexture = canvasTexture(boardCanvas);
{
  box(room, [0.1, 1.9, 2.95], 0x2b1d14, [-innerX + 0.05, 2.65, -0.3], { cast: false });
  const board = new THREE.Mesh(new THREE.PlaneGeometry(2.7, 1.66), new THREE.MeshBasicMaterial({ map: boardTexture, toneMapped: false }));
  board.rotation.y = Math.PI / 2;
  board.position.set(-innerX + 0.11, 2.65, -0.3);
  room.add(board);
}

function drawBoard() {
  const g = boardCanvas.getContext('2d');
  g.fillStyle = '#2f2118';
  g.fillRect(0, 0, BOARD_W, BOARD_H);
  g.fillStyle = '#1b130d';
  g.fillRect(0, 0, BOARD_W, 84);
  g.fillStyle = '#e6c26a';
  g.font = `700 44px ${FONT_JP}`;
  g.textBaseline = 'middle';
  g.textAlign = 'left';
  g.fillText('任務 TASK BOARD', 32, 44);

  ROLES.forEach((role, i) => {
    const r = roleState(role.id);
    const y = 106 + i * 98;
    g.fillStyle = '#efe3c6';
    g.fillRect(24, y, BOARD_W - 48, 84);
    g.fillStyle = role.css;
    g.fillRect(24, y, 14, 84);
    g.fillStyle = '#2a1d14';
    g.font = `700 36px ${FONT_JP}`;
    g.fillText(role.kanji, 58, y + 30);
    g.font = `600 22px ${FONT}`;
    g.fillStyle = '#6b5a44';
    g.fillText(role.title, 58 + 90, y + 32);
    g.font = `500 22px ${FONT}`;
    const detail = r.state === 'working' ? `${r.tool}${r.detail ? ` · ${r.detail}` : ''}` : r.state === 'done' || r.done ? 'Finished' : 'Waiting for orders';
    g.fillText(truncate(detail, 34), 58, y + 64);

    const chip = r.state === 'working' ? ['進行', '#b3261e'] : r.state === 'done' || r.done ? ['完了', '#2e7d4f'] : ['待機', '#8a7a62'];
    g.fillStyle = chip[1];
    g.fillRect(BOARD_W - 170, y + 14, 110, 56);
    g.fillStyle = '#f6e3b4';
    g.font = `700 34px ${FONT_JP}`;
    g.textAlign = 'center';
    g.fillText(chip[0], BOARD_W - 115, y + 43);
    g.textAlign = 'left';
  });
  boardTexture.needsUpdate = true;
}

// ---------- team lead ----------

const lead = createPerson({
  shirt: 0x14213d,
  pants: 0x15151a,
  skin: 0xe8b894,
  hair: 0xbdbdbd,
  lead: true,
});
scene.add(lead.root);
poseStanding(lead);

// Rolled scroll the lead carries to a desk.
const leadCard = new THREE.Group();
lead.armR.add(leadCard);
leadCard.position.set(0, -0.62, 0.1);
cylinder(leadCard, 0.04, 0.04, 0.4, 0xf3e6c4, [0, 0, 0], 12);
for (const sy of [-0.15, 0.15]) cylinder(leadCard, 0.045, 0.045, 0.04, 0xb3261e, [0, sy, 0], 12);
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
lead.root.position.copy(HOME);
lead.root.rotation.y = HOME_YAW;

const PHRASES = {
  'Reading prompt': 'ศึกใหม่มาถึงแล้ว ช่วยอ่านสารก่อนนะ',
  Read: 'ไปสอดแนมไฟล์นี้หน่อย',
  Grep: 'ช่วยตามรอยในโค้ดให้ที',
  Glob: 'ช่วยสำรวจรายชื่อไฟล์หน่อย',
  WebSearch: 'ช่วยหาข่าวจากต่างแดน (เว็บ) หน่อย',
  WebFetch: 'ช่วยไปรับสารจากหน้าเว็บนี้ที',
  Edit: 'ช่วยตีโค้ดตรงนี้ให้คมหน่อย',
  Write: 'ช่วยจารึกไฟล์นี้ให้หน่อย',
  NotebookEdit: 'ช่วยแก้บันทึก notebook ตัวนี้ที',
  Bash: 'ทดสอบคมดาบหน่อย รันคำสั่งนี้เลย',
};

const spotFor = (roleId) => new THREE.Vector3(ROLES.find((r) => r.id === roleId).x + 2.0, 0, DESK_Z);

// Walk along the aisle in front of the desks so the lead never cuts through furniture.
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
  if (task.type === 'praise') return [`${task.role} ฝีมือเยี่ยม ขอบใจมาก`, ''];
  if (task.type === 'wrapUp') return ['ศึกจบแล้ว ส่งรายงานให้ลูกค้าได้เลย!', ''];
  const phrase = PHRASES[task.tool] ?? 'ช่วยจัดการงานนี้หน่อย';
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
  // Idle, or already walking back to the board with nothing to deliver: go straight to the new task.
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
    // Face the worker, turned a little toward the camera so the face stays visible.
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

  // Pose.
  if (walking) S.phase += dt * 9;
  const swing = walking ? Math.sin(S.phase) : 0;
  lead.legL.hip.rotation.x = swing * 0.6;
  lead.legR.hip.rotation.x = -swing * 0.6;
  lead.legL.knee.rotation.x = walking ? Math.max(0, Math.sin(S.phase + 1.2)) * 0.9 : 0;
  lead.legR.knee.rotation.x = walking ? Math.max(0, Math.sin(S.phase + 1.2 + Math.PI)) * 0.9 : 0;
  lead.pelvis.position.y = STAND_HIP + (walking ? Math.abs(Math.sin(S.phase)) * 0.04 : 0);

  const carrying = leadCard.visible;
  const allDone = objects[objects.length - 1].finished;
  if (S.mode === 'talking') {
    const reach = THREE.MathUtils.smoothstep(S.talkT, 0.4, 1.0) * (S.handedOver ? 0 : 1);
    lead.armR.rotation.x = carrying ? -0.5 - reach * 0.9 : -0.9 + Math.sin(t * 4) * 0.15;
    lead.armL.rotation.x = -0.7 + Math.sin(t * 5) * 0.25;
    lead.head.rotation.x = 0.05 + Math.sin(t * 6) * 0.04;
  } else if (walking) {
    lead.armL.rotation.x = -swing * 0.5;
    lead.armR.rotation.x = carrying ? -0.9 : swing * 0.5;
    lead.head.rotation.x = 0;
  } else if (allDone && S.mode === 'idle') {
    lead.armL.rotation.x = Math.sin(t * 1.2) * 0.04;
    lead.armR.rotation.x = Math.PI - 0.4;
    lead.armR.rotation.z = Math.sin(t * 8) * 0.4;
    lead.head.rotation.x = 0;
  } else {
    lead.armL.rotation.x = Math.sin(t * 1.2) * 0.04;
    lead.armR.rotation.x = Math.sin(t * 1.2 + 1) * 0.04;
    lead.head.rotation.x = 0;
  }
  if (!(allDone && S.mode === 'idle')) lead.armR.rotation.z = 0;
  lead.head.rotation.y = S.mode === 'idle' ? Math.sin(t * 0.7) * 0.2 : 0;

  const roleName = S.task?.role ?? '';
  leadTag.textContent =
    S.mode === 'walking' && S.task ? `${LEAD_NAME} · Heading to ${roleName}`
    : S.mode === 'talking' ? `${LEAD_NAME} · Briefing ${roleName}`
    : S.mode === 'walking' ? `${LEAD_NAME} · Back to the board`
    : `${LEAD_NAME} · Overseeing`;
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

// Pipeline bar labels carry the kanji title of each role.
for (const step of document.querySelectorAll('#pipeline .step')) {
  const role = ROLES.find((r) => r.id === step.dataset.role);
  if (role) step.querySelector('.name').textContent = `${role.id} ${role.kanji}`;
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

    // The desk lantern paper and the seal glow in the role colour while working, green when finished.
    const glow = working ? obj.role.color : finished ? DONE_GREEN : 0x000000;
    obj.bulb.material.color.set(working || finished ? glow : 0xe8dcc0);
    obj.bulb.material.emissive.set(glow);
    obj.logo.material.color.set(working || finished ? glow : 0xb3261e);
    obj.logo.material.emissive.set(glow);
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

// Compare the new snapshot with the previous one and queue work for the lead.
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
    if (r.state === 'working' && (p.state !== 'working' || p.tool !== r.tool || p.detail !== r.detail)) {
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

// The view is fitted to the room width, then the user can orbit and zoom a little.
const HALF_W = 11.2;
const HALF_H = 5.8;
const DEFAULT_VIEW = { azimuth: 0, elevation: 0.62, zoom: 1 };
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
  // The lead's tag and speech bubble go under their feet so they do not hide the worker tags and boards.
  leadAnchor.set(p.x, 0, p.z);
  placeOverlay(leadTag, leadAnchor, 8, true);
  placeOverlay(bubble, leadAnchor, 46, true);
}

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
    // Writing with a brush: the right hand sweeps, the left hand steadies the paper.
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
    // Waiting in seiza with hands resting on the thighs.
    armL.rotation.x = -0.25 + Math.sin(t * 0.9 + ph) * 0.02;
    armR.rotation.x = -0.25 + Math.sin(t * 0.9 + ph + 1) * 0.02;
    armR.rotation.z = 0;
    head.rotation.x = 0;
    head.rotation.y = Math.sin(t * 0.6 + ph) * 0.25;
    pelvis.position.y = KNEEL_HIP;
  }
  // A short bow when the lead hands over a scroll.
  if (now < obj.nodUntil) {
    head.rotation.x += Math.sin(((obj.nodUntil - now) / 900) * Math.PI * 3) * 0.25;
    torso.rotation.x = Math.sin(((obj.nodUntil - now) / 900) * Math.PI) * 0.2;
  } else {
    torso.rotation.x = 0;
  }
  torso.scale.y = 1 + Math.sin(t * 1.6 + ph) * 0.012;

  const glowTarget = working ? 14 : 0;
  obj.light.intensity += (glowTarget - obj.light.intensity) * 0.1;
  obj.check.position.y = 1.95 + Math.sin(t * 2 + ph) * 0.06;

  const screen = obj.screen;
  if (screen.dirty || (working && now - screen.last > 120)) {
    drawScreen(obj, screen.current ?? EMPTY_ROLE, t);
    screen.dirty = false;
    screen.last = now;
  }
}

function animateAmbient(dt, t) {
  for (const a of andons) {
    a.light.intensity = a.base * (0.9 + Math.sin(t * 7 + a.phase) * 0.06 + Math.sin(t * 13 + a.phase * 2) * 0.04);
  }
  banners.forEach((cloth, i) => {
    cloth.rotation.y = Math.sin(t * 1.3 + i * 2) * 0.08;
    cloth.rotation.z = Math.sin(t * 0.9 + i) * 0.015;
  });
  for (let i = 0; i < PETAL_COUNT; i++) {
    const s = petalSeeds[i];
    petalPositions[i * 3] += (0.25 + Math.sin(t * 0.8 + s * 20) * 0.35) * dt;
    petalPositions[i * 3 + 1] -= (0.3 + s * 0.35) * dt;
    petalPositions[i * 3 + 2] += Math.cos(t * 0.6 + s * 12) * 0.2 * dt;
    if (petalPositions[i * 3 + 1] < 0.05 || petalPositions[i * 3] > ROOM_W / 2) respawnPetal(i, false);
  }
  petalGeometry.attributes.position.needsUpdate = true;
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
