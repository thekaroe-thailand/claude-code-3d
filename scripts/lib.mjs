// Shared helpers for the hook script and the open script: find the background server, start it if needed.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));

export const daemonFile = path.resolve(here, '..', 'packages', 'core', 'src', 'daemon.js');
export const dataDir = path.join(os.homedir(), '.claude-code-3d');
const infoFile = path.join(dataDir, 'server.json');

export const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export function readInfo() {
  try {
    return JSON.parse(fs.readFileSync(infoFile, 'utf8'));
  } catch {
    return null;
  }
}

export async function health(port, timeout = 500) {
  try {
    const res = await fetch(`http://127.0.0.1:${port}/health`, { signal: AbortSignal.timeout(timeout) });
    return (await res.json()).name === 'claude-code-3d';
  } catch {
    return false;
  }
}

export async function postJson(port, route, body, timeout = 800) {
  const res = await fetch(`http://127.0.0.1:${port}${route}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(timeout),
  });
  return res.ok;
}

// The child is detached with no stdio so it outlives the hook and never holds its pipes open.
export function spawnDaemon() {
  const child = spawn(process.execPath, [daemonFile], { detached: true, stdio: 'ignore', windowsHide: true });
  child.on('error', () => {});
  child.unref();
}

// Returns the server info once it answers, starting the background server first if it is not running.
export async function ensureServer({ wait = 4000 } = {}) {
  let info = readInfo();
  if (info?.port && (await health(info.port))) return info;
  spawnDaemon();
  const end = Date.now() + wait;
  while (Date.now() < end) {
    await sleep(150);
    info = readInfo();
    if (info?.port && (await health(info.port))) return info;
  }
  return null;
}

export function log(message) {
  if (!process.env.C3D_DEBUG) return;
  try {
    fs.mkdirSync(dataDir, { recursive: true });
    fs.appendFileSync(path.join(dataDir, 'hook.log'), `${new Date().toISOString()} ${message}\n`);
  } catch {
    // Logging must never break a hook.
  }
}
