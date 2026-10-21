// Runs the server in the background so every Claude Code session on this machine shares one scene.
// Started on demand by the hook script and by the open script, never by hand.
//
// Discovery: ~/.claude-code-3d/server.json holds the port. A lock file stops two starters racing.
// The server exits by itself after an hour with no events and no open pages.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { startServer } from './server.js';

const dataDir = path.join(os.homedir(), '.claude-code-3d');
const infoFile = path.join(dataDir, 'server.json');
const lockFile = path.join(dataDir, 'server.lock');
const LOCK_STALE_MS = 15000;
const IDLE_EXIT_MS = 60 * 60 * 1000;

fs.mkdirSync(dataDir, { recursive: true });

function pidAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    return err.code === 'EPERM';
  }
}

async function serverAnswers(port) {
  try {
    const res = await fetch(`http://127.0.0.1:${port}/health`, { signal: AbortSignal.timeout(600) });
    return (await res.json()).name === 'claude-code-3d';
  } catch {
    return false;
  }
}

// Returns true when this process now holds the lock.
function takeLock() {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      fs.writeFileSync(lockFile, String(process.pid), { flag: 'wx' });
      return true;
    } catch (err) {
      if (err.code !== 'EEXIST') return false;
      try {
        const age = Date.now() - fs.statSync(lockFile).mtimeMs;
        const owner = Number(fs.readFileSync(lockFile, 'utf8'));
        if (age < LOCK_STALE_MS && owner && pidAlive(owner)) return false;
        fs.rmSync(lockFile, { force: true });
      } catch {
        return false;
      }
    }
  }
  return false;
}

function readInfo() {
  try {
    return JSON.parse(fs.readFileSync(infoFile, 'utf8'));
  } catch {
    return null;
  }
}

const existing = readInfo();
if (existing?.port && (await serverAnswers(existing.port))) process.exit(0);
if (!takeLock()) process.exit(0);

let handle;
let closing = false;

async function shutdown() {
  if (closing) return;
  closing = true;
  try {
    if (readInfo()?.pid === process.pid) fs.rmSync(infoFile, { force: true });
    fs.rmSync(lockFile, { force: true });
    await handle?.close();
  } finally {
    process.exit(0);
  }
}

try {
  handle = await startServer({ preferredPort: 3737, idleExitMs: IDLE_EXIT_MS, onIdle: shutdown });
  fs.writeFileSync(infoFile, JSON.stringify({ pid: process.pid, port: handle.port, url: handle.url, startedAt: Date.now() }));
  fs.rmSync(lockFile, { force: true });
} catch {
  fs.rmSync(lockFile, { force: true });
  process.exit(1);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
process.on('exit', () => {
  try {
    if (readInfo()?.pid === process.pid) fs.rmSync(infoFile, { force: true });
  } catch {
    // Nothing to clean up if the folder is gone.
  }
});
