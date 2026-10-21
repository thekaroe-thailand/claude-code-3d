import { spawn } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { startServer } from './server.js';

// Opens the page in the default browser. Failure is ignored, the URL is printed anyway.
export function openBrowser(url) {
  const cmd = process.platform === 'win32' ? 'explorer' : process.platform === 'darwin' ? 'open' : 'xdg-open';
  try {
    spawn(cmd, [url], { detached: true, stdio: 'ignore' }).on('error', () => {}).unref();
  } catch {
    // Ignore: the user can open the printed URL manually.
  }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const noOpen = process.argv.includes('--no-open');
  const { url } = await startServer({ preferredPort: 3737 });
  console.log(`claude-code-3d running at ${url}`);
  if (!noOpen) openBrowser(url);
}
