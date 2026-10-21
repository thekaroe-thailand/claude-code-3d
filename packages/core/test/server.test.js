import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { startServer } from '../src/server.js';

// Plain http.request so the Host and Origin headers can be set freely.
function request(port, { method = 'GET', route = '/', headers = {}, body } = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port, method, path: route, headers }, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, text: Buffer.concat(chunks).toString('utf8') }));
    });
    req.on('error', reject);
    req.end(body);
  });
}

const json = (port, route, payload) =>
  request(port, { method: 'POST', route, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });

const getState = async (port, query = '') => JSON.parse((await request(port, { route: `/state${query}` })).text);

async function waitFor(fn, ms = 3000) {
  const end = Date.now() + ms;
  for (;;) {
    const value = await fn();
    if (value) return value;
    if (Date.now() > end) throw new Error('timed out waiting');
    await new Promise((r) => setTimeout(r, 50));
  }
}

test('hook payloads drive the state over HTTP', async () => {
  const { port, close } = await startServer();
  try {
    assert.equal((await request(port, { route: '/health' })).status, 200);
    assert.equal((await json(port, '/hook', { hook_event_name: 'UserPromptSubmit', session_id: 's1', cwd: '/work/app', prompt: 'private' })).status, 202);
    await json(port, '/hook', { hook_event_name: 'PreToolUse', session_id: 's1', tool_name: 'Read', tool_input: { file_path: '/work/app/src/a.js' } });
    let state = await getState(port);
    assert.equal(state.active, 's1');
    assert.equal(state.sessions.s1.roles.SA.detail, 'src/a.js');
    assert.ok(!JSON.stringify(state).includes('private'));

    // Unknown hooks and junk are ignored without error.
    assert.equal((await json(port, '/hook', { hook_event_name: 'Notification', session_id: 's1' })).status, 202);
    assert.equal((await request(port, { method: 'POST', route: '/hook', body: '{oops' })).status, 400);

    await json(port, '/hook', { hook_event_name: 'Stop', session_id: 's1' });
    state = await getState(port);
    assert.equal(state.sessions.s1.roles.Summary.state, 'done');

    // A second session does not disturb the first, and the page can ask for either.
    await json(port, '/hook', { hook_event_name: 'UserPromptSubmit', session_id: 's2' });
    assert.equal((await getState(port)).active, 's2');
    assert.equal((await getState(port, '?session=s1')).active, 's1');
    assert.equal((await getState(port, '?session=unknown')).active, 's2');

    assert.equal((await request(port, { method: 'POST', route: '/reset' })).status, 200);
    assert.deepEqual((await getState(port)).sessions, {});
  } finally {
    await close();
  }
});

test('recent events are listed by name only', async () => {
  const { port, close } = await startServer();
  try {
    await json(port, '/hook', { hook_event_name: 'UserPromptSubmit', session_id: 'abcdef123456', prompt: 'private text' });
    await json(port, '/hook', { hook_event_name: 'PreToolUse', session_id: 'abcdef123456', tool_name: 'Bash', tool_input: { command: 'echo SECRETCOMMAND' } });
    const res = await request(port, { route: '/debug/events' });
    assert.equal(res.status, 200);
    const events = JSON.parse(res.text);
    assert.deepEqual(events.map((e) => [e.event, e.tool, e.session]), [
      ['UserPromptSubmit', null, 'abcdef12'],
      ['PreToolUse', 'Bash', 'abcdef12'],
    ]);
    assert.ok(!res.text.includes('SECRETCOMMAND') && !res.text.includes('private text'));
  } finally {
    await close();
  }
});

test('token totals come from the transcript, counted once per message', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'c3d-cfg-'));
  const previous = process.env.CLAUDE_CONFIG_DIR;
  process.env.CLAUDE_CONFIG_DIR = dir;
  const file = path.join(dir, 'projects', 'p', 's.jsonl');
  await fs.mkdir(path.dirname(file), { recursive: true });
  const rec = (id, i, o) => JSON.stringify({ type: 'assistant', message: { id, usage: { input_tokens: i, output_tokens: o, cache_read_input_tokens: 500, cache_creation_input_tokens: 20 } } });
  await fs.writeFile(file, `${rec('old', 10, 1000)}\n`);

  const { port, close } = await startServer();
  try {
    await json(port, '/hook', { hook_event_name: 'UserPromptSubmit', session_id: 's1', transcript_path: file });
    const zero = await waitFor(async () => (await getState(port)).sessions.s1.tokens);
    // Tokens spent before the prompt are not counted for this task.
    assert.deepEqual(zero, { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 });

    await fs.appendFile(file, `${rec('m1', 3, 120)}\n${rec('m1', 3, 120)}\n${rec('m2', 4, 80)}\n`);
    const tokens = await waitFor(async () => {
      await json(port, '/hook', { hook_event_name: 'PostToolUse', session_id: 's1', tool_name: 'Read', transcript_path: file });
      const t = (await getState(port)).sessions.s1.tokens;
      return t.output === 200 ? t : null;
    });
    assert.deepEqual(tokens, { input: 7, output: 200, cacheRead: 1000, cacheWrite: 40 });

    // A transcript path outside the Claude folder is ignored.
    await json(port, '/hook', { hook_event_name: 'UserPromptSubmit', session_id: 's9', transcript_path: path.join(os.tmpdir(), 'other.jsonl') });
    assert.equal((await getState(port)).sessions.s9.tokens, null);
  } finally {
    await close();
    if (previous === undefined) delete process.env.CLAUDE_CONFIG_DIR;
    else process.env.CLAUDE_CONFIG_DIR = previous;
    await fs.rm(dir, { recursive: true, force: true });
  }
});

test('requests from other sites or hostnames are refused', async () => {
  const { port, close } = await startServer();
  try {
    const own = `http://127.0.0.1:${port}`;
    assert.equal((await request(port, { route: '/state', headers: { Origin: own } })).status, 200);
    assert.equal((await request(port, { route: '/state', headers: { Origin: 'https://evil.example' } })).status, 403);
    assert.equal((await request(port, { method: 'POST', route: '/hook', headers: { Origin: 'https://evil.example' }, body: '{}' })).status, 403);
    // DNS rebinding: a different Host header pointing at 127.0.0.1.
    assert.equal((await request(port, { route: '/state', headers: { Host: 'evil.example' } })).status, 403);
    assert.equal((await request(port, { route: '/state', headers: { Host: `localhost:${port}` } })).status, 200);
  } finally {
    await close();
  }
});

test('static files are served and cannot escape the public folder', async () => {
  const { port, close } = await startServer();
  try {
    const page = await request(port, { route: '/' });
    assert.equal(page.status, 200);
    assert.match(page.text, /Claude Code 3D/);
    assert.equal((await request(port, { route: '/vendor/three.module.js' })).status, 200);
    assert.equal((await request(port, { route: '/vendor/addons/geometries/RoundedBoxGeometry.js' })).status, 200);
    // Encoded slashes are decoded and rejected. Encoded dots are collapsed by the URL parser first, so the
    // request stays inside the public folder and simply finds nothing.
    assert.equal((await request(port, { route: '/..%2Fpackage.json' })).status, 403);
    assert.equal((await request(port, { route: '/..%2F..%2Fsrc%2Fserver.js' })).status, 403);
    const dots = await request(port, { route: '/%2e%2e/%2e%2e/package.json' });
    assert.equal(dots.status, 404);
    assert.ok(!dots.text.includes('claude-code-3d'));
    assert.equal((await request(port, { route: '/nope.js' })).status, 404);
  } finally {
    await close();
  }
});

test('the preferred port falls back to a free one when taken', async () => {
  const first = await startServer();
  try {
    const second = await startServer({ preferredPort: first.port });
    try {
      assert.notEqual(second.port, first.port);
    } finally {
      await second.close();
    }
  } finally {
    await first.close();
  }
});
