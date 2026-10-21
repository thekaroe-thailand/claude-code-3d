// Starts the server and plays a fake session through it. No Claude Code needed.
import { startServer } from '../src/server.js';
import { openBrowser } from '../src/cli.js';

const SESSION = 'demo-session';
// Long enough for the team lead to walk to each desk and brief the role.
const STEP_MS = 4200;

// Each step is one generic event as the server expects it.
const script = [
  { event: 'UserPromptSubmit' },
  { event: 'PreToolUse', tool: 'Read', path: 'src/server.js' },
  { event: 'PostToolUse', tool: 'Read' },
  { event: 'PreToolUse', tool: 'Grep', path: 'startServer' },
  { event: 'PostToolUse', tool: 'Grep' },
  { event: 'PreToolUse', tool: 'Edit', path: 'src/state.js' },
  { event: 'PostToolUse', tool: 'Edit' },
  { event: 'SubagentStop', role: 'Dev' },
  { event: 'PreToolUse', tool: 'Bash', command: 'npm test' },
  { event: 'PostToolUse', tool: 'Bash', command: 'npm test' },
  { event: 'Stop' },
];

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// The demo replays forever so a page opened late still sees the action. Use --once to play a single time.
const once = process.argv.includes('--once');
const noOpen = process.argv.includes('--no-open');

const { url, close } = await startServer({ preferredPort: 3737 });
console.log(`demo running at ${url}`);
console.log('Open that address in a browser if it did not open by itself. Press Ctrl+C to stop.');
if (!noOpen) openBrowser(url);

const shutdown = async () => {
  await close();
  process.exit(0);
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

const post = (route, body) =>
  fetch(`${url}${route}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });

async function playOnce() {
  for (const step of script) {
    await post('event', { ...step, session_id: SESSION });
    console.log(`sent ${step.event}${step.tool ? ` (${step.tool})` : ''}`);
    await sleep(STEP_MS);
  }
}

// Wait briefly so the page can connect before the first event.
await sleep(STEP_MS);

for (;;) {
  await playOnce();
  if (once) break;
  console.log('demo finished, replaying in a few seconds...');
  await sleep(8000);
  await post('reset');
  await sleep(3000);
}
console.log('demo finished. Press Ctrl+C to stop the server.');
