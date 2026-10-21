import http from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createState, reduce, expireStale, pruneSessions } from './state.js';
import { normalizeHook } from './adapter.js';
import { TranscriptTail, isAllowedTranscriptPath, subtractUsage } from './transcript.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.join(here, '..', 'public');

const MAX_BODY_BYTES = 256 * 1024;
const TICK_MS = 2000;
// How long after a turn ends the transcript is still polled for the last responses.
const TOKEN_GRACE_MS = 15000;
const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
};

// Binds to 127.0.0.1 only. Port 0 lets the OS pick a free port.
// `preferredPort` is tried first so the URL stays the same between runs;
// if it is taken, the server falls back to a free port instead of failing.
// With `idleExitMs`, `onIdle` is called once nobody has watched or sent events for that long.
export function startServer({ port = 0, preferredPort = null, idleExitMs = 0, onIdle = null } = {}) {
  let state = createState();
  // Each browser tab, with the session it asked for (null = follow the latest one).
  const clients = new Map();
  // Token tracking per session: the transcript reader and the totals at the start of the current prompt.
  const metas = new Map();
  let actualPort = 0;
  let lastActivity = Date.now();

  const snapshotFor = (sessionId) => ({
    active: sessionId && state.sessions[sessionId] ? sessionId : state.active,
    sessions: state.sessions,
  });

  const broadcast = () => {
    for (const [res, { session }] of clients) res.write(`data: ${JSON.stringify(snapshotFor(session))}\n\n`);
  };

  const send = (res, code, body, type = 'application/json', extra = {}) => {
    res.writeHead(code, { 'Content-Type': type, 'Cache-Control': 'no-store', ...extra });
    res.end(body);
  };

  const readBody = (req) =>
    new Promise((resolve, reject) => {
      const chunks = [];
      let size = 0;
      req.on('data', (chunk) => {
        size += chunk.length;
        if (size > MAX_BODY_BYTES) {
          reject(new Error('body too large'));
          req.destroy();
          return;
        }
        chunks.push(chunk);
      });
      req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
      req.on('error', reject);
    });

  const serveStatic = async (res, file, cache = 'no-store') => {
    try {
      const type = TYPES[path.extname(file)] ?? 'application/octet-stream';
      send(res, 200, await readFile(file), type, { 'Cache-Control': cache });
    } catch {
      send(res, 404, 'not found', 'text/plain');
    }
  };

  // ----- tokens -----

  function trackTranscript(sessionId, file) {
    if (!file || !isAllowedTranscriptPath(file)) return;
    const meta = metas.get(sessionId);
    if (meta && meta.file === file) return;
    metas.set(sessionId, { file, tail: new TranscriptTail(file), baseline: null, baselineSet: false, chain: Promise.resolve() });
  }

  // Reads new transcript lines without delaying the request that triggered it.
  function scheduleRefresh(sessionId, { resetBaseline = false } = {}) {
    const meta = metas.get(sessionId);
    if (!meta) return;
    meta.chain = meta.chain
      .then(async () => {
        await meta.tail.update();
        if (resetBaseline || !meta.baselineSet) {
          meta.baseline = meta.tail.snapshot();
          meta.baselineSet = true;
        }
        const session = state.sessions[sessionId];
        if (!session) return;
        const next = subtractUsage(meta.tail.snapshot(), meta.baseline);
        if (JSON.stringify(next) !== JSON.stringify(session.tokens)) {
          session.tokens = next;
          broadcast();
        }
      })
      .catch(() => {});
  }

  // ----- events -----

  // The last events received, newest last. Names only (no paths, commands or prompts): used to see what
  // Claude Code actually sent when the scene does not look right.
  const recent = [];

  function applyEvent(ev) {
    lastActivity = Date.now();
    recent.push({ at: new Date().toISOString(), event: ev.event, tool: ev.tool ?? null, session: String(ev.session_id).slice(0, 8) });
    if (recent.length > 200) recent.shift();
    trackTranscript(ev.session_id, ev.transcript_path);
    state = reduce(state, ev);
    pruneSessions(state);
    broadcast();
    scheduleRefresh(ev.session_id, { resetBaseline: ev.event === 'UserPromptSubmit' });
    if (ev.event === 'Stop') {
      // The transcript is written a little after the hook fires.
      for (const delay of [1200, 4000]) setTimeout(() => scheduleRefresh(ev.session_id), delay).unref();
    }
  }

  const tick = setInterval(() => {
    const now = Date.now();
    if (expireStale(state, now)) broadcast();
    for (const id of metas.keys()) {
      const session = state.sessions[id];
      if (!session?.startedAt) continue;
      if (!session.endedAt || now - session.endedAt < TOKEN_GRACE_MS) scheduleRefresh(id);
    }
    if (idleExitMs && onIdle && clients.size === 0 && now - lastActivity > idleExitMs) onIdle();
  }, TICK_MS);
  tick.unref();

  // ----- http -----

  const originOk = (req) => {
    // Browsers attach Origin to cross-site requests. Only our own page may talk to the server.
    const origin = req.headers.origin;
    if (!origin) return true;
    return origin === `http://127.0.0.1:${actualPort}` || origin === `http://localhost:${actualPort}`;
  };

  // Rejects DNS-rebinding: a web page cannot reach the server by pointing its own hostname at 127.0.0.1.
  const hostOk = (req) => {
    const host = (req.headers.host ?? '').toLowerCase();
    return host === `127.0.0.1:${actualPort}` || host === `localhost:${actualPort}`;
  };

  const handle = async (req, res) => {
    if (!hostOk(req) || !originOk(req)) {
      send(res, 403, 'forbidden', 'text/plain');
      return;
    }
    const url = new URL(req.url, 'http://127.0.0.1');

    if (req.method === 'GET' && url.pathname === '/events') {
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-store',
        Connection: 'keep-alive',
      });
      const session = url.searchParams.get('session');
      clients.set(res, { session });
      lastActivity = Date.now();
      res.write(`data: ${JSON.stringify(snapshotFor(session))}\n\n`);
      req.on('close', () => {
        clients.delete(res);
        lastActivity = Date.now();
      });
      return;
    }

    if (req.method === 'GET' && url.pathname === '/health') {
      send(res, 200, JSON.stringify({ ok: true, name: 'claude-code-3d', pid: process.pid, port: actualPort }));
      return;
    }

    if (req.method === 'GET' && url.pathname === '/debug/events') {
      send(res, 200, JSON.stringify(recent));
      return;
    }

    if (req.method === 'GET' && url.pathname === '/state') {
      send(res, 200, JSON.stringify(snapshotFor(url.searchParams.get('session'))));
      return;
    }

    if (req.method === 'POST' && (url.pathname === '/event' || url.pathname === '/hook')) {
      let body;
      try {
        body = JSON.parse(await readBody(req));
      } catch {
        send(res, 400, '{"error":"invalid json"}');
        return;
      }
      // /hook takes the raw Claude Code hook payload, /event the generic event used by the demo.
      const ev = url.pathname === '/hook' ? normalizeHook(body) : body;
      if (typeof ev?.event !== 'string') {
        send(res, url.pathname === '/hook' ? 202 : 400, url.pathname === '/hook' ? '{"ignored":true}' : '{"error":"missing event"}');
        return;
      }
      applyEvent(ev);
      send(res, 202, '{"ok":true}');
      return;
    }

    if (req.method === 'POST' && url.pathname === '/reset') {
      state = createState();
      metas.clear();
      broadcast();
      send(res, 200, '{"ok":true}');
      return;
    }

    if (req.method !== 'GET') {
      send(res, 405, 'method not allowed', 'text/plain');
      return;
    }

    const rel = url.pathname === '/' ? 'index.html' : decodeURIComponent(url.pathname.slice(1));
    const file = path.join(publicDir, rel);
    if (!file.startsWith(publicDir + path.sep)) {
      send(res, 403, 'forbidden', 'text/plain');
      return;
    }
    await serveStatic(res, file, rel.startsWith('vendor/') ? 'public, max-age=86400' : 'no-store');
  };

  const server = http.createServer((req, res) => {
    handle(req, res).catch(() => {
      if (!res.headersSent) send(res, 500, '{"error":"server error"}');
    });
  });

  return new Promise((resolve, reject) => {
    let fellBack = false;
    server.on('error', (err) => {
      if (err.code === 'EADDRINUSE' && preferredPort && !fellBack) {
        fellBack = true;
        server.listen(0, '127.0.0.1');
        return;
      }
      reject(err);
    });
    server.once('listening', () => {
      actualPort = server.address().port;
      resolve({
        url: `http://127.0.0.1:${actualPort}/`,
        port: actualPort,
        getState: () => state,
        close: () =>
          new Promise((done) => {
            clearInterval(tick);
            for (const res of clients.keys()) res.end();
            server.close(() => done());
          }),
      });
    });
    server.listen(preferredPort ?? port, '127.0.0.1');
  });
}
