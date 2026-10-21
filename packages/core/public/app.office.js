import * as THREE from 'three';
import { eventsUrl } from '/themes.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

// Four workstations in a row along the back wall, in pipeline order.
const ROLES = [
  { id: 'SA', color: 0x4a7dff, css: '#4a7dff', x: -6, skin: 0xf1c9a5, hair: 0x2b1d14, accessory: 'glasses' },
  { id: 'Dev', color: 0x20a7a0, css: '#20a7a0', x: -2, skin: 0xd9a77f, hair: 0x1b1b1b, accessory: 'headphones' },
  { id: 'Tester', color: 0xef8a2e, css: '#ef8a2e', x: 2, skin: 0xf6d3b3, hair: 0x7a4b1f, accessory: 'cap' },
  { id: 'Summary', color: 0xe0559a, css: '#e0559a', x: 6, skin: 0xc68c63, hair: 0x2a1a12, accessory: 'longHair' },
];

const IDLE_GREY = 0x8a8f99;
const DONE_GREEN = 0x3fbf74;
const DESK_Z = -2.9;
const PERSON_Z = -3.7;
const STAND_HIP = 1.02;
const SEAT_HIP = 0.62;
const SCREEN_W = 640;
const SCREEN_H = 360;
const SCREEN_Y = 3.75;

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
renderer.toneMappingExposure = 1.05;
container.appendChild(renderer.domElement);

const scene = new THREE.Scene();
const FOV = 40;
const camera = new THREE.PerspectiveCamera(FOV, 1, 0.1, 120);
const target = new THREE.Vector3(0, 2.0, -0.6);

// Soft reflections from a generic room environment make materials feel less flat.
{
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environmentIntensity = 0.45;
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

function truncate(text, max) {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

function turnToward(current, goal, maxStep) {
  const diff = ((goal - current + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
  return current + THREE.MathUtils.clamp(diff, -maxStep, maxStep);
}

// ---------- lights ----------

scene.add(new THREE.HemisphereLight(0xfff4e0, 0x7b7466, 0.95));

const sun = new THREE.DirectionalLight(0xfff0d6, 2.2);
sun.position.set(-5, 14, 9);
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

function makeFloorTexture() {
  const canvas = makeCanvas(512, 512);
  const g = canvas.getContext('2d');
  const rows = 8;
  const plankH = canvas.height / rows;
  for (let row = 0; row < rows; row++) {
    const offset = seeded(row + 1) * 256;
    for (let k = -1; k < 3; k++) {
      const x = offset + k * 256;
      const light = 58 + seeded(row * 7 + k + 3) * 9;
      g.fillStyle = `hsl(32, 38%, ${light}%)`;
      g.fillRect(x, row * plankH, 256, plankH);
      g.fillStyle = 'rgba(60, 35, 15, 0.35)';
      g.fillRect(x, row * plankH, 2, plankH);
    }
    g.fillStyle = 'rgba(60, 35, 15, 0.35)';
    g.fillRect(0, row * plankH, 512, 2);
  }
  const texture = canvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(ROOM_W / 4, (ROOM_Z_FRONT - ROOM_Z_BACK) / 4);
  return texture;
}

const room = new THREE.Group();
scene.add(room);

// Dark base plate so the room reads as a diorama. Its top sits just below the floor.
box(room, [ROOM_W + 0.8, 0.5, ROOM_Z_FRONT - ROOM_Z_BACK + 0.8], 0x2a2c34, [0, -0.27, ROOM_CENTER_Z], { cast: false });

const floor = new THREE.Mesh(
  new THREE.PlaneGeometry(ROOM_W, ROOM_Z_FRONT - ROOM_Z_BACK),
  new THREE.MeshStandardMaterial({ map: makeFloorTexture(), roughness: 0.6 }),
);
floor.rotation.x = -Math.PI / 2;
floor.position.set(0, 0, ROOM_CENTER_Z);
floor.receiveShadow = true;
room.add(floor);

const WALL_BACK = 0xece6da;
const WALL_SIDE = 0xe2dccd;
const SKIRTING = 0xb9ae98;
const wallDepth = ROOM_Z_FRONT - ROOM_Z_BACK + 0.3;
const wallCenterZ = ROOM_Z_BACK - 0.15 + wallDepth / 2;

box(room, [ROOM_W + 0.6, ROOM_H, 0.3], WALL_BACK, [0, ROOM_H / 2, ROOM_Z_BACK - 0.15], { cast: false });
box(room, [0.3, ROOM_H, wallDepth], WALL_SIDE, [-ROOM_W / 2 - 0.15, ROOM_H / 2, wallCenterZ], { cast: false });
box(room, [0.3, ROOM_H, wallDepth], WALL_SIDE, [ROOM_W / 2 + 0.15, ROOM_H / 2, wallCenterZ], { cast: false });

box(room, [ROOM_W, 0.18, 0.06], SKIRTING, [0, 0.09, ROOM_Z_BACK + 0.03], { cast: false });
box(room, [0.06, 0.18, ROOM_Z_FRONT - ROOM_Z_BACK], SKIRTING, [-ROOM_W / 2 + 0.03, 0.09, ROOM_CENTER_Z], { cast: false });
box(room, [0.06, 0.18, ROOM_Z_FRONT - ROOM_Z_BACK], SKIRTING, [ROOM_W / 2 - 0.03, 0.09, ROOM_CENTER_Z], { cast: false });
// Crown moulding along the back wall.
box(room, [ROOM_W, 0.12, 0.08], 0xffffff, [0, ROOM_H - 0.06, ROOM_Z_BACK + 0.04], { cast: false });

// Windows on the left wall.
for (const z of [-2.9, 2.2]) {
  const x = -ROOM_W / 2;
  box(room, [0.1, 2.2, 1.9], 0xffffff, [x + 0.05, 2.6, z], { cast: false });
  const pane = new THREE.Mesh(
    new THREE.PlaneGeometry(1.6, 1.9),
    new THREE.MeshBasicMaterial({ color: 0xc6e6ff, toneMapped: false }),
  );
  pane.rotation.y = Math.PI / 2;
  pane.position.set(x + 0.11, 2.6, z);
  room.add(pane);
  box(room, [0.04, 1.9, 0.07], 0xffffff, [x + 0.12, 2.6, z], { cast: false });
  box(room, [0.04, 0.07, 1.6], 0xffffff, [x + 0.12, 2.6, z], { cast: false });
  box(room, [0.2, 0.06, 2.1], 0xffffff, [x + 0.1, 1.5, z], { cast: false });
}

// Bookshelf on the right wall.
{
  const x = ROOM_W / 2 - 0.3;
  const z = 0.2;
  rbox(room, [0.5, 3.0, 3.4], 0x8a6a48, [x, 1.5, z], 0.03);
  for (let shelf = 0; shelf < 4; shelf++) {
    const y = 0.35 + shelf * 0.85;
    box(room, [0.52, 0.06, 3.3], 0x6f5337, [x - 0.02, y, z], { cast: false });
    if (shelf === 3) continue;
    let cursor = z - 1.5;
    for (let b = 0; b < 14 && cursor < z + 1.45; b++) {
      const w = 0.12 + seeded(shelf * 20 + b) * 0.1;
      const h = 0.5 + seeded(shelf * 31 + b + 5) * 0.25;
      const hue = Math.floor(seeded(shelf * 17 + b + 9) * 360);
      const color = new THREE.Color(`hsl(${hue}, 45%, 52%)`);
      box(room, [0.32, h, w], color, [x - 0.04, y + 0.03 + h / 2, cursor + w / 2], { cast: false });
      cursor += w + 0.02;
    }
  }
}

// Wall clock between the second and third status screens. Hands follow real time.
const clockGroup = new THREE.Group();
clockGroup.position.set(0, SCREEN_Y - 0.2, ROOM_Z_BACK + 0.05);
room.add(clockGroup);
{
  const ring = addMesh(clockGroup, new THREE.CylinderGeometry(0.4, 0.4, 0.08, 32), material(0x2b2e36), [0, 0, 0], { cast: false });
  ring.rotation.x = Math.PI / 2;
  const face = addMesh(clockGroup, new THREE.CylinderGeometry(0.34, 0.34, 0.09, 32), material(0xf8f5ee), [0, 0, 0.005], { cast: false });
  face.rotation.x = Math.PI / 2;
}
const hourHand = new THREE.Group();
const minuteHand = new THREE.Group();
clockGroup.add(hourHand, minuteHand);
box(hourHand, [0.035, 0.2, 0.02], 0x20232b, [0, 0.1, 0.06], { cast: false });
box(minuteHand, [0.025, 0.3, 0.02], 0x20232b, [0, 0.15, 0.075], { cast: false });

function plant(x, z, scale = 1) {
  const group = new THREE.Group();
  group.position.set(x, 0, z);
  group.scale.setScalar(scale);
  room.add(group);
  cylinder(group, 0.38, 0.28, 0.6, 0xb5694a, [0, 0.3, 0]);
  const leaves = [0x3f8f4f, 0x4aa05a, 0x358045];
  const spots = [[0, 1.05, 0, 0.5], [0.3, 1.4, 0.1, 0.38], [-0.28, 1.35, -0.1, 0.4], [0.05, 1.7, 0.05, 0.3]];
  spots.forEach(([lx, ly, lz, r], i) => sphere(group, r, leaves[i % leaves.length], [lx, ly, lz]));
}
plant(-8.6, -5.2, 1.1);
plant(8.6, -5.2, 1.1);
plant(8.7, 4.4, 0.9);

// Rug and meeting table in the middle of the room.
rbox(room, [9.4, 0.02, 4.8], 0x4b5a78, [0, 0.011, 1.4], 0.008, { cast: false });
rbox(room, [8.8, 0.025, 4.2], 0xcdbf9f, [0, 0.013, 1.4], 0.008, { cast: false });
rbox(room, [8.4, 0.03, 3.8], 0x4b5a78, [0, 0.015, 1.4], 0.008, { cast: false });

{
  const group = new THREE.Group();
  group.position.set(0, 0, 1.4);
  room.add(group);
  rbox(group, [3.6, 0.1, 1.5], 0x9a7a54, [0, 0.8, 0], 0.04);
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      box(group, [0.1, 0.76, 0.1], 0x3a3d46, [sx * 1.65, 0.38, sz * 0.6]);
    }
  }
  box(group, [0.5, 0.01, 0.38], 0xffffff, [-0.9, 0.86, 0.1]);
  box(group, [0.5, 0.01, 0.38], 0xfff3d6, [-0.8, 0.865, 0.0]);
  cylinder(group, 0.07, 0.06, 0.11, 0xffffff, [1.0, 0.91, 0.25], 16);
  cylinder(group, 0.07, 0.06, 0.11, 0xf0c04a, [1.35, 0.91, -0.2], 16);
  cylinder(group, 0.14, 0.1, 0.2, 0xb5694a, [0, 0.95, 0], 18);
  sphere(group, 0.2, 0x4aa05a, [0, 1.17, 0]);
  // Stools around the table.
  for (const [sx, sz] of [[-1.1, 1.15], [1.1, 1.15], [-1.1, -1.15], [1.1, -1.15]]) {
    cylinder(group, 0.26, 0.26, 0.08, 0x3a4a63, [sx, 0.5, sz], 20);
    cylinder(group, 0.05, 0.05, 0.46, 0x1c1e24, [sx, 0.24, sz], 10);
  }
}

// Sofa against the left wall, with a side table.
{
  const group = new THREE.Group();
  group.position.set(-8.95, 0, 3.6);
  group.rotation.y = Math.PI / 2;
  room.add(group);
  rbox(group, [2.4, 0.4, 1.0], 0x4d6b7a, [0, 0.35, 0], 0.08);
  rbox(group, [2.4, 0.75, 0.28], 0x4d6b7a, [0, 0.85, -0.38], 0.08);
  for (const sx of [-1, 1]) rbox(group, [0.26, 0.62, 1.0], 0x45616f, [sx * 1.07, 0.52, 0], 0.07);
  for (const sx of [-1, 1]) rbox(group, [0.9, 0.22, 0.78], 0x5f8394, [sx * 0.5, 0.65, 0.08], 0.09);
  const pillow = rbox(group, [0.5, 0.46, 0.14], 0xe08a3c, [-0.8, 0.95, -0.16], 0.06);
  pillow.rotation.z = 0.12;
  const pillow2 = rbox(group, [0.46, 0.4, 0.14], 0xe0c34a, [0.85, 0.92, -0.17], 0.06);
  pillow2.rotation.z = -0.1;
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) cylinder(group, 0.04, 0.03, 0.14, 0x1c1e24, [sx * 1.05, 0.07, sz * 0.4], 8);

  cylinder(room, 0.34, 0.34, 0.05, 0x9a7a54, [-8.8, 0.55, 1.2], 24);
  cylinder(room, 0.04, 0.04, 0.5, 0x1c1e24, [-8.8, 0.28, 1.2], 10);
  cylinder(room, 0.07, 0.06, 0.1, 0xffffff, [-8.7, 0.63, 1.1], 16);
  sphere(room, 0.14, 0x4aa05a, [-8.9, 0.72, 1.3]);
}

// Floor lamp in the front-left corner of the rug.
{
  const x = -5.4;
  const z = 3.5;
  cylinder(room, 0.2, 0.22, 0.04, 0x2b2e36, [x, 0.02, z], 20);
  cylinder(room, 0.025, 0.025, 1.6, 0x2b2e36, [x, 0.85, z], 8);
  const shade = addMesh(
    room,
    new THREE.CylinderGeometry(0.26, 0.34, 0.36, 24, 1, true),
    material(0xfff0cf, { emissive: 0xffd9a0, emissiveIntensity: 0.9, side: THREE.DoubleSide }),
    [x, 1.78, z],
    { cast: false },
  );
  shade.receiveShadow = false;
  const glow = new THREE.PointLight(0xffd9a0, 6, 6, 2);
  glow.position.set(x, 1.7, z);
  scene.add(glow);
}

// Water cooler and bin on the right wall.
{
  const x = 8.85;
  rbox(room, [0.55, 1.0, 0.55], 0xe8ecef, [x, 0.5, 3.0], 0.05);
  addMesh(room, new THREE.CylinderGeometry(0.2, 0.2, 0.5, 24), material(0x7fc4ff, { transparent: true, opacity: 0.7, roughness: 0.2 }), [x, 1.3, 3.0], { cast: false });
  box(room, [0.1, 0.06, 0.1], 0x2b2e36, [x - 0.28, 0.82, 3.0], { cast: false });
  cylinder(room, 0.2, 0.17, 0.5, 0x3a3d46, [x, 0.25, 3.9], 16);
}

// Framed art on the right wall.
function makePosterTexture(seed) {
  const canvas = makeCanvas(256, 192);
  const g = canvas.getContext('2d');
  g.fillStyle = '#f4efe2';
  g.fillRect(0, 0, 256, 192);
  for (let i = 0; i < 6; i++) {
    const hue = Math.floor(seeded(seed * 10 + i) * 360);
    g.fillStyle = `hsl(${hue}, 55%, 55%)`;
    g.beginPath();
    g.arc(30 + seeded(seed + i * 3) * 196, 30 + seeded(seed + i * 5) * 132, 18 + seeded(seed + i * 7) * 34, 0, Math.PI * 2);
    g.fill();
  }
  return canvasTexture(canvas);
}
for (const [z, seed] of [[-3.9, 3], [3.9, 8]]) {
  const x = ROOM_W / 2;
  box(room, [0.06, 1.2, 1.6], 0x2b2e36, [x - 0.03, 2.9, z], { cast: false });
  const art = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 1.0), new THREE.MeshBasicMaterial({ map: makePosterTexture(seed), toneMapped: false }));
  art.rotation.y = -Math.PI / 2;
  art.position.set(x - 0.07, 2.9, z);
  room.add(art);
}

// ---------- status screens ----------

function drawScreen(obj, r, t) {
  const { ctx } = obj.screen;
  const { role } = obj;
  ctx.fillStyle = '#10131a';
  ctx.fillRect(0, 0, SCREEN_W, SCREEN_H);
  ctx.fillStyle = role.css;
  ctx.fillRect(0, 0, SCREEN_W, 64);

  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';
  ctx.fillStyle = '#ffffff';
  ctx.font = `700 34px ${FONT}`;
  ctx.fillText(role.id, 24, 34);
  ctx.textAlign = 'right';
  ctx.font = `600 22px ${FONT}`;
  ctx.fillText(r.state === 'working' ? 'WORKING' : r.state === 'done' ? 'DONE' : 'WAITING', SCREEN_W - 24, 34);
  ctx.textAlign = 'left';

  if (r.state === 'working') {
    ctx.fillStyle = '#ffffff';
    ctx.font = `600 30px ${FONT}`;
    ctx.fillText(r.tool ?? '', 24, 104);
    if (r.detail) {
      ctx.fillStyle = '#9aa3b5';
      ctx.font = `500 20px ${FONT}`;
      ctx.fillText(truncate(r.detail, 40), 24, 136);
    }
    const tick = Math.floor(t * 4);
    for (let i = 0; i < 5; i++) {
      const w = 140 + ((i * 97 + tick * 53) % 360);
      ctx.fillStyle = role.css;
      ctx.globalAlpha = 0.35 + ((i + tick) % 3) * 0.2;
      ctx.fillRect(24, 170 + i * 30, w, 13);
    }
    ctx.globalAlpha = 1;
    if (Math.floor(t * 2) % 2 === 0) {
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(24, 170 + 5 * 30, 12, 18);
    }
  } else if (r.state === 'done' || r.done) {
    ctx.strokeStyle = '#3fbf74';
    ctx.lineWidth = 22;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(250, 220);
    ctx.lineTo(305, 275);
    ctx.lineTo(405, 160);
    ctx.stroke();
  } else {
    ctx.fillStyle = '#6f7480';
    ctx.font = `500 28px ${FONT}`;
    ctx.fillText('Waiting for work', 24, 110);
    for (let i = 0; i < 3; i++) {
      ctx.beginPath();
      ctx.arc(34 + i * 30, 160, 7, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  obj.screen.texture.needsUpdate = true;
}

// ---------- people ----------

// One humanoid rig for workers and the team lead: pelvis with torso, head, arms and two-segment legs.
function createPerson({ shirt, pants, skin, hair, jacket = false, accessory = null }) {
  const root = new THREE.Group();
  const pelvis = new THREE.Group();
  pelvis.position.y = STAND_HIP;
  root.add(pelvis);

  const torso = addMesh(pelvis, new THREE.CapsuleGeometry(0.26, 0.23, 6, 16), material(shirt), [0, 0.33, 0]);
  if (jacket) {
    box(pelvis, [0.18, 0.24, 0.03], 0xf4f4f4, [0, 0.35, 0.255], { cast: false });
    box(pelvis, [0.06, 0.24, 0.03], 0xb02a37, [0, 0.34, 0.27], { cast: false });
  }

  const legs = [-1, 1].map((side) => {
    const hip = new THREE.Group();
    hip.position.set(side * 0.14, 0, 0);
    pelvis.add(hip);
    addMesh(hip, new THREE.CapsuleGeometry(0.1, 0.22, 4, 10), material(pants), [0, -0.21, 0]);
    const knee = new THREE.Group();
    knee.position.y = -0.42;
    hip.add(knee);
    addMesh(knee, new THREE.CapsuleGeometry(0.085, 0.33, 4, 10), material(pants), [0, -0.25, 0]);
    box(knee, [0.17, 0.1, 0.3], 0x1b1b1b, [0, -0.55, 0.06]);
    return { hip, knee };
  });

  const arms = [-1, 1].map((side) => {
    const pivot = new THREE.Group();
    pivot.position.set(side * 0.34, 0.6, 0);
    pelvis.add(pivot);
    addMesh(pivot, new THREE.CapsuleGeometry(0.085, 0.33, 4, 10), material(shirt), [0, -0.27, 0]);
    sphere(pivot, 0.085, skin, [0, -0.56, 0]);
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
    box(head, [0.075, 0.016, 0.016], hair, [side * 0.095, 0.11, 0.245], { cast: false });
  }
  sphere(head, 0.034, skin, [0, -0.03, 0.262]).castShadow = false;
  box(head, [0.09, 0.016, 0.012], 0x8a3f36, [0, -0.1, 0.245], { cast: false });

  if (accessory === 'glasses') {
    for (const side of [-1, 1]) {
      addMesh(head, new THREE.TorusGeometry(0.07, 0.012, 8, 20), material(0x1a1a1a), [side * 0.095, 0.03, 0.255], { cast: false });
    }
    box(head, [0.06, 0.012, 0.012], 0x1a1a1a, [0, 0.04, 0.26], { cast: false });
  } else if (accessory === 'headphones') {
    addMesh(head, new THREE.TorusGeometry(0.29, 0.02, 8, 24, Math.PI), material(0x1b1b1b), [0, 0.02, 0], { cast: false });
    for (const side of [-1, 1]) cylinder(head, 0.085, 0.085, 0.06, 0xe0e0e0, [side * 0.29, 0.02, 0]).rotation.z = Math.PI / 2;
  } else if (accessory === 'cap') {
    const cap = sphere(head, 0.29, 0xffffff, [0, 0.11, -0.02]);
    cap.scale.set(1, 0.6, 1);
    box(head, [0.36, 0.025, 0.2], 0xffffff, [0, 0.11, 0.27], { cast: false });
  } else if (accessory === 'longHair') {
    box(head, [0.62, 0.6, 0.14], hair, [0, -0.13, -0.2]);
  } else if (accessory === 'headset') {
    addMesh(head, new THREE.TorusGeometry(0.29, 0.016, 8, 24, Math.PI), material(0x1b1b1b), [0, 0.02, 0], { cast: false });
    cylinder(head, 0.075, 0.075, 0.06, 0x1b1b1b, [0.29, 0.02, 0]).rotation.z = Math.PI / 2;
    box(head, [0.012, 0.012, 0.22], 0x1b1b1b, [0.26, -0.04, 0.13], { cast: false });
    sphere(head, 0.03, 0x1b1b1b, [0.2, -0.1, 0.23]).castShadow = false;
  }

  return { root, pelvis, torso, head, armL: arms[0], armR: arms[1], legL: legs[0], legR: legs[1] };
}

function poseSeated(person) {
  person.pelvis.position.y = SEAT_HIP;
  for (const leg of [person.legL, person.legR]) {
    leg.hip.rotation.x = -Math.PI / 2;
    leg.knee.rotation.x = Math.PI / 2;
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
  g.fillStyle = '#3fbf74';
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
  g.fillStyle = '#1c1e24';
  g.fillRect(0, 0, 256, 64);
  g.fillStyle = role.css;
  g.fillRect(0, 0, 10, 64);
  g.fillStyle = '#ffffff';
  g.font = `700 34px ${FONT}`;
  g.textBaseline = 'middle';
  g.textAlign = 'center';
  g.fillText(role.id.toUpperCase(), 138, 34);
  return canvasTexture(canvas);
}

function buildStation(role, index) {
  const station = new THREE.Group();
  station.position.x = role.x;
  scene.add(station);

  // Desk, laptop, mug, plant, lamp, nameplate and the task ticket the lead hands over.
  rbox(station, [2.5, 0.08, 1.1], 0xc2a27a, [0, 0.8, DESK_Z], 0.03);
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      box(station, [0.08, 0.76, 0.08], 0x3a3d46, [sx * 1.15, 0.38, DESK_Z + sz * 0.48]);
    }
  }
  box(station, [0.9, 0.04, 0.6], 0x9aa0ab, [-0.1, 0.86, DESK_Z + 0.05]);
  const lid = new THREE.Group();
  lid.position.set(-0.1, 0.88, DESK_Z + 0.35);
  lid.rotation.x = -0.22;
  station.add(lid);
  box(lid, [0.9, 0.58, 0.03], 0x80858f, [0, 0.29, 0]);
  const logo = addMesh(
    lid,
    new THREE.SphereGeometry(0.07, 16, 12),
    material(0xcccccc, { emissive: 0x000000, emissiveIntensity: 1.4 }),
    [0, 0.3, 0.03],
    { cast: false },
  );
  logo.scale.z = 0.3;

  cylinder(station, 0.09, 0.08, 0.14, 0xffffff, [0.85, 0.91, DESK_Z + 0.15], 16);
  cylinder(station, 0.1, 0.08, 0.16, 0xb5694a, [-0.95, 0.91, DESK_Z - 0.25], 16);
  sphere(station, 0.15, 0x4aa05a, [-0.95, 1.07, DESK_Z - 0.25]);

  cylinder(station, 0.11, 0.11, 0.03, 0x2b2e36, [1.0, 0.85, DESK_Z - 0.3], 16);
  cylinder(station, 0.015, 0.015, 0.5, 0x2b2e36, [1.0, 1.1, DESK_Z - 0.3], 8);
  addMesh(station, new THREE.ConeGeometry(0.17, 0.2, 20), material(role.color), [1.0, 1.4, DESK_Z - 0.3]);
  const bulb = sphere(station, 0.05, 0xdddddd, [1.0, 1.28, DESK_Z - 0.3], { emissive: 0x000000, emissiveIntensity: 1.6 });
  bulb.castShadow = false;

  box(station, [0.7, 0.1, 0.05], 0x1c1e24, [0.62, 0.88, DESK_Z + 0.5], { cast: false });
  const plate = new THREE.Mesh(new THREE.PlaneGeometry(0.66, 0.165), new THREE.MeshBasicMaterial({ map: makeNameplateTexture(role), toneMapped: false }));
  plate.position.set(0.62, 0.88, DESK_Z + 0.53);
  plate.rotation.x = -0.25;
  station.add(plate);

  const ticket = new THREE.Group();
  ticket.position.set(0.4, 0.855, DESK_Z + 0.05);
  ticket.rotation.y = 0.25;
  ticket.visible = false;
  station.add(ticket);
  box(ticket, [0.34, 0.012, 0.25], 0xffffff, [0, 0, 0], { cast: false });
  box(ticket, [0.34, 0.014, 0.05], role.color, [0, 0, -0.1], { cast: false });
  for (let i = 0; i < 3; i++) box(ticket, [0.24 - i * 0.04, 0.014, 0.012], 0x9aa0ab, [-0.04, 0, -0.03 + i * 0.045], { cast: false });

  // Chair.
  const chair = new THREE.Group();
  chair.position.set(0, 0, PERSON_Z - 0.05);
  station.add(chair);
  rbox(chair, [0.8, 0.1, 0.8], 0x30343f, [0, 0.47, 0], 0.04);
  rbox(chair, [0.8, 0.85, 0.1], 0x30343f, [0, 0.97, -0.4], 0.04);
  for (const sx of [-1, 1]) rbox(chair, [0.08, 0.06, 0.5], 0x1c1e24, [sx * 0.44, 0.7, 0.05], 0.02);
  cylinder(chair, 0.05, 0.05, 0.4, 0x1c1e24, [0, 0.25, 0], 10);
  cylinder(chair, 0.38, 0.38, 0.05, 0x1c1e24, [0, 0.06, 0], 5);

  // Person.
  const person = createPerson({
    shirt: role.color,
    pants: 0x2c3140,
    skin: role.skin,
    hair: role.hair,
    accessory: role.accessory,
  });
  person.root.position.set(0, 0, PERSON_Z);
  poseSeated(person);
  station.add(person.root);

  // Check mark that floats over the head when the role is done.
  const check = new THREE.Sprite(new THREE.SpriteMaterial({ map: checkTexture, transparent: true, depthTest: false }));
  check.scale.setScalar(0.6);
  check.position.set(0, 2.2, PERSON_Z);
  check.visible = false;
  station.add(check);

  // Status screen on the wall behind the person.
  const canvas = makeCanvas(SCREEN_W, SCREEN_H);
  const texture = canvasTexture(canvas);
  rbox(station, [3.2, 1.9, 0.1], 0x1c1e24, [0, SCREEN_Y, ROOM_Z_BACK + 0.05], 0.05, { cast: false });
  const screenMesh = new THREE.Mesh(
    new THREE.PlaneGeometry(3.0, 1.7),
    new THREE.MeshBasicMaterial({ map: texture, toneMapped: false }),
  );
  screenMesh.position.set(0, SCREEN_Y, ROOM_Z_BACK + 0.11);
  station.add(screenMesh);

  // Coloured glow over the desk while the role works.
  const light = new THREE.PointLight(role.color, 0, 6, 2);
  light.position.set(0, 2.4, DESK_Z - 0.6);
  station.add(light);

  const tagEl = document.createElement('div');
  tagEl.className = 'tag';
  tagEl.style.borderColor = role.css;
  tagLayer.appendChild(tagEl);

  const obj = {
    role,
    index,
    person,
    logo,
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
    anchor: new THREE.Vector3(role.x, 2.45, PERSON_Z),
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
  const x = -ROOM_W / 2;
  box(room, [0.1, 1.85, 2.9], 0xd8d4c8, [x + 0.05, 2.65, -0.3], { cast: false });
  const board = new THREE.Mesh(new THREE.PlaneGeometry(2.7, 1.66), new THREE.MeshBasicMaterial({ map: boardTexture, toneMapped: false }));
  board.rotation.y = Math.PI / 2;
  board.position.set(x + 0.11, 2.65, -0.3);
  room.add(board);
}

function drawBoard() {
  const g = boardCanvas.getContext('2d');
  g.fillStyle = '#f7f5ee';
  g.fillRect(0, 0, BOARD_W, BOARD_H);
  g.fillStyle = '#2b2e36';
  g.fillRect(0, 0, BOARD_W, 84);
  g.fillStyle = '#ffffff';
  g.font = `700 42px ${FONT}`;
  g.textBaseline = 'middle';
  g.textAlign = 'left';
  g.fillText('TASK BOARD', 32, 44);

  ROLES.forEach((role, i) => {
    const r = roleState(role.id);
    const y = 106 + i * 98;
    g.fillStyle = '#ffffff';
    g.fillRect(24, y, BOARD_W - 48, 84);
    g.strokeStyle = '#e0dccf';
    g.lineWidth = 2;
    g.strokeRect(24, y, BOARD_W - 48, 84);
    g.fillStyle = role.css;
    g.fillRect(24, y, 14, 84);
    g.fillStyle = '#1d1d1b';
    g.font = `700 32px ${FONT}`;
    g.fillText(role.id, 60, y + 30);
    g.font = `500 22px ${FONT}`;
    g.fillStyle = '#5c5c55';
    const detail = r.state === 'working' ? `${r.tool}${r.detail ? ` · ${r.detail}` : ''}` : r.state === 'done' || r.done ? 'Finished' : 'Waiting for task';
    g.fillText(truncate(detail, 34), 60, y + 62);

    const chip = r.state === 'working' ? ['DOING', role.css] : r.state === 'done' || r.done ? ['DONE', '#3fbf74'] : ['TO DO', '#9aa0ab'];
    g.fillStyle = chip[1];
    g.beginPath();
    g.roundRect(BOARD_W - 190, y + 22, 140, 40, 20);
    g.fill();
    g.fillStyle = '#ffffff';
    g.font = `700 22px ${FONT}`;
    g.textAlign = 'center';
    g.fillText(chip[0], BOARD_W - 120, y + 43);
    g.textAlign = 'left';
  });
  boardTexture.needsUpdate = true;
}

// ---------- team lead ----------

const lead = createPerson({
  shirt: 0x1f3a5f,
  pants: 0x23262f,
  skin: 0xe8b894,
  hair: 0x9a9a9a,
  jacket: true,
  accessory: 'headset',
});
scene.add(lead.root);
poseStanding(lead);

// Task card the lead carries to a desk.
const leadCard = new THREE.Group();
lead.armR.add(leadCard);
leadCard.position.set(0, -0.6, 0.1);
box(leadCard, [0.26, 0.32, 0.015], 0xffffff, [0, 0, 0], { cast: false });
box(leadCard, [0.26, 0.06, 0.017], 0xe0553a, [0, 0.13, 0], { cast: false });
for (let i = 0; i < 3; i++) box(leadCard, [0.18, 0.016, 0.017], 0x9aa0ab, [0, 0.04 - i * 0.06, 0], { cast: false });
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
  'Reading prompt': 'งานใหม่เข้ามาแล้ว ช่วยอ่านโจทย์ก่อนนะ',
  Read: 'ช่วยอ่านไฟล์นี้หน่อย',
  Grep: 'ช่วยค้นหาในโค้ดให้หน่อย',
  Glob: 'ช่วยหารายชื่อไฟล์ให้หน่อย',
  WebSearch: 'ช่วยค้นข้อมูลบนเว็บหน่อย',
  WebFetch: 'ช่วยดึงข้อมูลจากหน้าเว็บนี้หน่อย',
  Edit: 'ช่วยแก้โค้ดตรงนี้ที',
  Write: 'ช่วยเขียนไฟล์นี้หน่อย',
  NotebookEdit: 'ช่วยแก้ notebook ตัวนี้ที',
  Bash: 'ช่วยรันคำสั่งนี้หน่อย ขอผลด่วน',
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
  if (task.type === 'praise') return [`${task.role} เยี่ยมมาก ขอบคุณนะ`, ''];
  if (task.type === 'wrapUp') return ['สรุปคำตอบส่งให้ลูกค้าได้เลย!', ''];
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
    S.mode === 'walking' && S.task ? `Lead · Heading to ${roleName}`
    : S.mode === 'talking' ? `Lead · Briefing ${roleName}`
    : S.mode === 'walking' ? 'Lead · Back to the board'
    : 'Lead · Overseeing';
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

    const glow = working ? obj.role.color : finished ? DONE_GREEN : 0x000000;
    for (const part of [obj.logo, obj.bulb]) {
      part.material.color.set(working || finished ? glow : 0xcccccc);
      part.material.emissive.set(glow);
    }
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
  // The lead's tag and speech bubble go under their feet so they do not hide the worker tags and wall screens.
  leadAnchor.set(p.x, 0, p.z);
  placeOverlay(leadTag, leadAnchor, 8, true);
  placeOverlay(bubble, leadAnchor, 46, true);
}

// ---------- animation ----------

const startedAt = performance.now();
const ARM_REST = -1.15;
let lastFrame = performance.now();

function animateWorker(obj, t) {
  const working = obj.state === 'working';
  const { armL, armR, head, torso, pelvis } = obj.person;
  const ph = obj.phase;
  const now = performance.now();

  if (working) {
    armL.rotation.x = ARM_REST - 0.05 + Math.sin(t * 14 + ph) * 0.1;
    armR.rotation.x = ARM_REST - 0.05 + Math.sin(t * 14 + ph + Math.PI) * 0.1;
    armR.rotation.z = 0;
    head.rotation.x = 0.12 + Math.sin(t * 3 + ph) * 0.03;
    head.rotation.y = Math.sin(t * 1.2 + ph) * 0.08;
    pelvis.position.y = SEAT_HIP + Math.sin(t * 6 + ph) * 0.008;
  } else if (obj.finished) {
    armL.rotation.x = ARM_REST;
    armR.rotation.x = Math.PI - 0.35;
    armR.rotation.z = Math.sin(t * 9 + ph) * 0.45;
    head.rotation.x = 0;
    head.rotation.y = Math.sin(t * 1.5 + ph) * 0.1;
    pelvis.position.y = SEAT_HIP;
  } else {
    armL.rotation.x = ARM_REST + Math.sin(t * 0.9 + ph) * 0.02;
    armR.rotation.x = ARM_REST + Math.sin(t * 0.9 + ph + 1) * 0.02;
    armR.rotation.z = 0;
    head.rotation.x = 0;
    head.rotation.y = Math.sin(t * 0.6 + ph) * 0.25;
    pelvis.position.y = SEAT_HIP;
  }
  // A short nod when the lead hands over a task card.
  if (now < obj.nodUntil) {
    head.rotation.x += Math.sin((obj.nodUntil - now) / 900 * Math.PI * 3) * 0.2;
  }
  torso.scale.y = 1 + Math.sin(t * 1.6 + ph) * 0.012;

  const glowTarget = working ? 14 : 0;
  obj.light.intensity += (glowTarget - obj.light.intensity) * 0.1;
  obj.bulb.scale.setScalar(working ? 1 + Math.sin(t * 6 + ph) * 0.15 : 1);
  obj.check.position.y = 2.2 + Math.sin(t * 2 + ph) * 0.06;

  const screen = obj.screen;
  if (screen.dirty || (working && now - screen.last > 120)) {
    drawScreen(obj, screen.current ?? EMPTY_ROLE, t);
    screen.dirty = false;
    screen.last = now;
  }
}

function frame() {
  const now = performance.now();
  const dt = Math.min((now - lastFrame) / 1000, 0.1);
  lastFrame = now;
  const t = (now - startedAt) / 1000;

  for (const obj of objects) animateWorker(obj, t);
  updateLead(dt, t);

  const date = new Date();
  const minutes = date.getMinutes() + date.getSeconds() / 60;
  minuteHand.rotation.z = -(minutes / 60) * Math.PI * 2;
  hourHand.rotation.z = -(((date.getHours() % 12) + minutes / 60) / 12) * Math.PI * 2;

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
