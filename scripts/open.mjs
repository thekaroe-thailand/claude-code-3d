// Starts the background server if needed and opens the 3D office in the default browser.
//   node scripts/open.mjs [--no-open] [--theme=samurai|office|isan]
import { spawn } from 'node:child_process';
import { ensureServer } from './lib.mjs';

const args = process.argv.slice(2);
const noOpen = args.includes('--no-open');
const theme = args.find((a) => a.startsWith('--theme='))?.slice('--theme='.length);

function openBrowser(url) {
  const [cmd, cmdArgs] =
    process.platform === 'win32' ? ['rundll32', ['url.dll,FileProtocolHandler', url]]
    : process.platform === 'darwin' ? ['open', [url]]
    : ['xdg-open', [url]];
  try {
    const child = spawn(cmd, cmdArgs, { detached: true, stdio: 'ignore', windowsHide: true });
    child.on('error', () => {});
    child.unref();
  } catch {
    // The address is printed anyway, so the user can open it by hand.
  }
}

const info = await ensureServer({ wait: 8000 });
if (!info) {
  console.log('Claude Code 3D could not start its local server. Make sure Node.js 18 or newer is installed, then try again.');
  process.exit(1);
}

const url = theme ? `${info.url}?theme=${encodeURIComponent(theme)}` : info.url;
console.log(`Claude Code 3D is running at ${url}`);
if (!noOpen) openBrowser(url);
process.exit(0);
