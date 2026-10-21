// Claude Code hook: forwards a small, redacted copy of the hook event to the local 3D office server.
//
// Rules this script keeps:
// - It never writes to stdout (for some events stdout would be added to Claude's context).
// - It always exits 0, and fast, so it can never slow down or break a Claude Code session.
// - It only forwards what the scene needs. Prompts, file contents and tool output are dropped here.
import { readInfo, postJson, ensureServer, log } from './lib.mjs';

const INPUT_KEYS = ['command', 'file_path', 'notebook_path', 'path', 'pattern', 'url', 'query', 'description', 'subagent_type'];

const clip = (value, max = 300) => (typeof value === 'string' ? value.slice(0, max) : undefined);

function readStdin(timeoutMs = 3000) {
  return new Promise((resolve) => {
    let data = '';
    const done = () => resolve(data);
    const timer = setTimeout(done, timeoutMs);
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (chunk) => {
      data += chunk;
      if (data.length > 2_000_000) done();
    });
    process.stdin.on('end', () => {
      clearTimeout(timer);
      done();
    });
    process.stdin.on('error', done);
  });
}

function redact(input) {
  const out = {
    hook_event_name: clip(input.hook_event_name, 60),
    session_id: clip(input.session_id, 120),
    transcript_path: clip(input.transcript_path, 600),
    cwd: clip(input.cwd, 600),
    tool_name: clip(input.tool_name, 120),
    agent_type: clip(input.agent_type, 120),
  };
  if (input.tool_input && typeof input.tool_input === 'object') {
    out.tool_input = {};
    for (const key of INPUT_KEYS) {
      const value = clip(input.tool_input[key]);
      if (value !== undefined) out.tool_input[key] = value;
    }
  }
  return out;
}

async function send(port, payload) {
  try {
    return await postJson(port, '/hook', payload);
  } catch (err) {
    log(`post failed on ${port}: ${err.message}`);
    return false;
  }
}

try {
  const raw = await readStdin();
  if (raw.trim()) {
    const payload = redact(JSON.parse(raw));
    const info = readInfo();
    if (!(info?.port && (await send(info.port, payload)))) {
      // The server is not running yet (or moved): start it, then try once more.
      const started = await ensureServer({ wait: 3000 });
      if (started) await send(started.port, payload);
    }
  }
} catch (err) {
  log(`hook error: ${err.message}`);
}
process.exit(0);
