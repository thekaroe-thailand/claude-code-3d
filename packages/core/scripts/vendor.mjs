// Copies the three.js files the scene needs from node_modules into public/vendor.
// The copies are committed so the plugin works without `npm install`. Run `npm run vendor` after updating three.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const three = path.join(root, 'node_modules', 'three');
const out = path.join(root, 'public', 'vendor');

const files = [
  ['build/three.module.js', 'three.module.js'],
  ['build/three.core.js', 'three.core.js'],
  ['examples/jsm/geometries/RoundedBoxGeometry.js', 'addons/geometries/RoundedBoxGeometry.js'],
  ['examples/jsm/environments/RoomEnvironment.js', 'addons/environments/RoomEnvironment.js'],
  ['LICENSE', 'three-LICENSE.txt'],
];

if (!fs.existsSync(three)) {
  console.error('three is not installed. Run `npm install` first.');
  process.exit(1);
}
for (const [from, to] of files) {
  const target = path.join(out, to);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.copyFileSync(path.join(three, from), target);
  console.log(`copied ${to}`);
}
