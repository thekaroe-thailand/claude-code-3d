import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { roleForTool, roleForAgentType } from '../src/rules.js';
import { normalizeHook, describeTool } from '../src/adapter.js';
import { createState, reduce, expireStale, STALE_WORKING_MS } from '../src/state.js';
import { TranscriptTail, usageFromRecord, subtractUsage, isAllowedTranscriptPath } from '../src/transcript.js';

test('tools map to roles', () => {
  assert.equal(roleForTool('Read'), 'SA');
  assert.equal(roleForTool('Grep'), 'SA');
  assert.equal(roleForTool('mcp__github__get_issue'), 'SA');
  assert.equal(roleForTool('Edit'), 'Dev');
  assert.equal(roleForTool('Write'), 'Dev');
  assert.equal(roleForTool('Bash', 'npm test'), 'Tester');
  assert.equal(roleForTool('Bash', 'cargo test --release'), 'Tester');
  assert.equal(roleForTool('Bash', 'git status'), 'Dev');
  assert.equal(roleForTool('Agent', '', 'Explore'), 'SA');
  assert.equal(roleForTool('Agent', '', 'code-reviewer'), 'Tester');
  assert.equal(roleForTool('Agent', '', 'general-purpose'), 'Dev');
  assert.equal(roleForTool('TodoWrite'), null);
  assert.equal(roleForTool(undefined), null);
  assert.equal(roleForAgentType(''), 'Dev');
});

test('hook payloads are normalised', () => {
  const pre = normalizeHook({
    hook_event_name: 'PreToolUse',
    session_id: 's1',
    transcript_path: '/x/t.jsonl',
    cwd: '/work/app',
    tool_name: 'Edit',
    tool_input: { file_path: 'C:\\work\\app\\src\\index.js', old_string: 'SECRET', new_string: 'SECRET2' },
  });
  assert.deepEqual(pre, {
    event: 'PreToolUse',
    session_id: 's1',
    transcript_path: '/x/t.jsonl',
    cwd: '/work/app',
    tool: 'Edit',
    path: 'src/index.js',
  });
  // File contents and prompts must never be copied into events.
  assert.ok(!JSON.stringify(pre).includes('SECRET'));

  const bash = normalizeHook({ hook_event_name: 'PreToolUse', session_id: 's1', tool_name: 'Bash', tool_input: { command: 'npm   test\n--silent' } });
  assert.equal(bash.command, 'npm test --silent');

  assert.equal(normalizeHook({ hook_event_name: 'PostToolUseFailure', session_id: 's1', tool_name: 'Bash', tool_input: {} }).event, 'PostToolUse');
  assert.equal(normalizeHook({ hook_event_name: 'UserPromptSubmit', session_id: 's1', prompt: 'private text' }).prompt, undefined);
  assert.equal(normalizeHook({ hook_event_name: 'Notification', session_id: 's1' }), null);
  assert.equal(normalizeHook(null), null);
  assert.equal(normalizeHook('x'), null);
  assert.equal(describeTool('Grep', { pattern: 'foo.*bar' }).path, 'foo.*bar');
  assert.equal(describeTool('Read', 'not an object'), null);
});

test('reducer follows a turn from prompt to stop', () => {
  let s = createState();
  const send = (ev) => {
    s = reduce(s, { session_id: 'a', ...ev });
  };
  send({ event: 'UserPromptSubmit' });
  assert.equal(s.sessions.a.roles.SA.state, 'working');
  send({ event: 'PreToolUse', tool: 'Edit', path: 'src/a.js' });
  assert.deepEqual([s.sessions.a.roles.Dev.state, s.sessions.a.roles.Dev.detail], ['working', 'src/a.js']);
  send({ event: 'PostToolUse', tool: 'Edit' });
  assert.equal(s.sessions.a.roles.Dev.state, 'waiting');
  send({ event: 'SubagentStop', agent_type: 'Explore' });
  assert.equal(s.sessions.a.roles.SA.done, true);
  send({ event: 'Stop' });
  assert.equal(s.sessions.a.roles.Summary.state, 'done');
  assert.ok(s.sessions.a.endedAt);
  assert.ok(Object.values(s.sessions.a.roles).every((r) => r.state !== 'working'));
});

test('reading the prompt ends when the first tool starts', () => {
  let s = createState();
  const send = (ev) => {
    s = reduce(s, { session_id: 'a', ...ev });
  };
  send({ event: 'UserPromptSubmit' });
  assert.equal(s.sessions.a.roles.SA.tool, 'Reading prompt');
  send({ event: 'PreToolUse', tool: 'Bash', command: 'ls' });
  assert.equal(s.sessions.a.roles.SA.state, 'waiting');
  assert.equal(s.sessions.a.roles.Dev.state, 'working');

  // A Read by the scout itself simply replaces the placeholder.
  send({ event: 'UserPromptSubmit' });
  send({ event: 'PreToolUse', tool: 'Read', path: 'a.js' });
  assert.deepEqual([s.sessions.a.roles.SA.state, s.sessions.a.roles.SA.tool], ['working', 'Read']);
});

test('overlapping tools of one role stay busy until the last one finishes', () => {
  let s = createState();
  const send = (ev) => {
    s = reduce(s, { session_id: 'a', ...ev });
  };
  send({ event: 'PreToolUse', tool: 'Read', path: 'a' });
  send({ event: 'PreToolUse', tool: 'Grep', path: 'b' });
  send({ event: 'PostToolUse', tool: 'Read' });
  assert.equal(s.sessions.a.roles.SA.state, 'working');
  send({ event: 'PostToolUse', tool: 'Grep' });
  assert.equal(s.sessions.a.roles.SA.state, 'waiting');
});

test('a new prompt resets the view but keeps the working directory', () => {
  let s = createState();
  s = reduce(s, { event: 'SessionStart', session_id: 'a', cwd: '/work/app' });
  s = reduce(s, { event: 'Stop', session_id: 'a' });
  s = reduce(s, { event: 'UserPromptSubmit', session_id: 'a' });
  assert.equal(s.sessions.a.cwd, '/work/app');
  assert.equal(s.sessions.a.roles.Summary.state, 'waiting');
  assert.equal(s.sessions.a.endedAt, null);
});

test('sessions stay separate and the latest one is active', () => {
  let s = createState();
  s = reduce(s, { event: 'UserPromptSubmit', session_id: 'a' });
  s = reduce(s, { event: 'UserPromptSubmit', session_id: 'b' });
  s = reduce(s, { event: 'PreToolUse', session_id: 'a', tool: 'Edit', path: 'x' });
  assert.equal(s.active, 'a');
  assert.equal(s.sessions.b.roles.Dev.state, 'waiting');
  assert.equal(s.sessions.a.roles.Dev.state, 'working');
});

test('lost PostToolUse events do not leave a role busy forever', () => {
  let s = createState();
  s = reduce(s, { event: 'PreToolUse', session_id: 'a', tool: 'Bash', command: 'npm test' });
  const later = Date.now() + STALE_WORKING_MS + 1000;
  assert.equal(expireStale(s, later), true);
  assert.equal(s.sessions.a.roles.Tester.state, 'waiting');
  assert.equal(expireStale(s, later), false);
});

test('token usage is counted once per message id', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'c3d-'));
  const file = path.join(dir, 't.jsonl');
  const usage = (i, o) => ({ input_tokens: i, output_tokens: o, cache_read_input_tokens: 1000, cache_creation_input_tokens: 50 });
  const rec = (id, u, extra = {}) => JSON.stringify({ type: 'assistant', message: { id, usage: u, content: [] }, ...extra });
  const lines = [
    JSON.stringify({ type: 'user', message: { content: 'hello' } }),
    // One message split across three lines with identical usage.
    rec('m1', usage(2, 100)),
    rec('m1', usage(2, 100)),
    rec('m1', usage(2, 100)),
    rec('m2', usage(3, 40)),
    'not json at all',
    JSON.stringify({ type: 'assistant', message: { id: 'm3' } }),
  ];
  await fs.writeFile(file, `${lines.join('\n')}\n`);

  const tail = new TranscriptTail(file);
  assert.equal(await tail.update(), true);
  assert.deepEqual(tail.snapshot(), { input: 5, output: 140, cacheRead: 2000, cacheWrite: 100 });

  // Appending a partial line must not break parsing; it completes on the next read.
  const full = rec('m4', usage(1, 10));
  await fs.appendFile(file, full.slice(0, 20));
  assert.equal(await tail.update(), false);
  await fs.appendFile(file, `${full.slice(20)}\n`);
  assert.equal(await tail.update(), true);
  assert.equal(tail.snapshot().output, 150);

  // The same id arriving again with a larger usage replaces the old one.
  await fs.appendFile(file, `${rec('m4', usage(1, 30))}\n`);
  await tail.update();
  assert.equal(tail.snapshot().output, 170);

  // A replaced (shorter) file starts over.
  await fs.writeFile(file, `${rec('z', usage(7, 8))}\n`);
  await tail.update();
  assert.deepEqual(tail.snapshot(), { input: 7, output: 8, cacheRead: 1000, cacheWrite: 50 });

  assert.deepEqual(subtractUsage(tail.snapshot(), { input: 1, output: 3, cacheRead: 0, cacheWrite: 0 }), { input: 6, output: 5, cacheRead: 1000, cacheWrite: 50 });
  assert.equal(subtractUsage(null, null), null);
  await fs.rm(dir, { recursive: true, force: true });
});

test('a transcript without usage gives no totals instead of zeros', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'c3d-'));
  const file = path.join(dir, 't.jsonl');
  await fs.writeFile(file, `${JSON.stringify({ type: 'user' })}\n${JSON.stringify({ type: 'something-new', usage: 5 })}\n`);
  const tail = new TranscriptTail(file);
  await tail.update();
  assert.equal(tail.snapshot(), null);
  assert.equal(usageFromRecord({ type: 'assistant', message: { usage: { output_tokens: 'many' }, id: 'x' } }).usage.output, 0);
  await fs.rm(dir, { recursive: true, force: true });
});

test('only transcripts inside the Claude config folder are allowed', () => {
  const env = { CLAUDE_CONFIG_DIR: path.resolve(os.tmpdir(), 'cfg') };
  assert.equal(isAllowedTranscriptPath(path.join(env.CLAUDE_CONFIG_DIR, 'projects', 'p', 's.jsonl'), env), true);
  assert.equal(isAllowedTranscriptPath(path.join(env.CLAUDE_CONFIG_DIR, 'projects', 'p', 's.txt'), env), false);
  assert.equal(isAllowedTranscriptPath(path.join(os.tmpdir(), 'elsewhere.jsonl'), env), false);
  assert.equal(isAllowedTranscriptPath(path.join(env.CLAUDE_CONFIG_DIR, '..', 'cfg-evil', 's.jsonl'), env), false);
  assert.equal(isAllowedTranscriptPath(undefined, env), false);
});
