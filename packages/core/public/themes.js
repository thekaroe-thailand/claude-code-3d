// Theme registry and the page chrome shared by every theme: theme picker, session picker, token readout.
// To add a theme: write its scene module in public/, add one entry here,
// and (optionally) a [data-theme="<id>"] block in style.css for the page chrome.
export const THEMES = [
  { id: 'samurai', label: 'ซามูไร 侍', module: '/app.js' },
  { id: 'office', label: 'ออฟฟิศ Office', module: '/app.office.js' },
  { id: 'isan', label: 'ชาวนาอีสาน ยุคเก่า', module: '/app.isan.js' },
];

export const DEFAULT_THEME = 'samurai';
const THEME_KEY = 'claude-code-3d.theme';
const SESSION_KEY = 'claude-code-3d.session';

const isKnown = (id) => THEMES.some((theme) => theme.id === id);

function read(key) {
  try {
    return localStorage.getItem(key);
  } catch {
    // Storage can be blocked, the defaults are fine.
    return null;
  }
}

function write(key, value) {
  try {
    if (value) localStorage.setItem(key, value);
    else localStorage.removeItem(key);
  } catch {
    // Ignore: the URL parameter still carries the choice.
  }
}

// Order of precedence: ?theme= in the URL, then the last choice saved in this browser, then the default.
export function pickTheme() {
  const fromUrl = new URLSearchParams(location.search).get('theme');
  if (isKnown(fromUrl)) return fromUrl;
  const saved = read(THEME_KEY);
  return isKnown(saved) ? saved : DEFAULT_THEME;
}

// The session this page follows. Empty means "whichever session was active last".
export function selectedSession() {
  const fromUrl = new URLSearchParams(location.search).get('session');
  if (fromUrl !== null) return fromUrl;
  return read(SESSION_KEY) ?? '';
}

// Scene modules open their live connection through this so they follow the chosen session.
export function eventsUrl() {
  const session = selectedSession();
  return session ? `/events?session=${encodeURIComponent(session)}` : '/events';
}

// Each theme builds its own 3D scene and listeners, so switching reloads the page.
// The server keeps the session state, so the new scene shows the same session.
function reloadWith(params) {
  const url = new URL(location.href);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  location.href = url.toString();
}

export function switchTheme(id) {
  write(THEME_KEY, id);
  reloadWith({ theme: id });
}

export function switchSession(id) {
  write(SESSION_KEY, id);
  reloadWith({ session: id });
}

function formatTokens(n) {
  if (n >= 1e6) return `${(n / 1e6).toFixed(2)}M`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(1)}k`;
  return String(Math.round(n));
}

const baseName = (p) => String(p ?? '').split(/[\\/]+/).filter(Boolean).pop() ?? '';

function sessionLabel(id, session) {
  const busy = Object.values(session.roles).some((r) => r.state === 'working');
  const folder = baseName(session.cwd) || 'session';
  return `${busy ? '● ' : ''}${folder} · ${id.slice(0, 6)}`;
}

export function mountChrome(currentTheme) {
  const wrap = document.createElement('div');
  wrap.className = 'theme-picker';

  const themeLabel = document.createElement('label');
  themeLabel.append('Theme ');
  const themeSelect = document.createElement('select');
  for (const theme of THEMES) {
    const option = document.createElement('option');
    option.value = theme.id;
    option.textContent = theme.label;
    option.selected = theme.id === currentTheme;
    themeSelect.append(option);
  }
  themeSelect.addEventListener('change', () => switchTheme(themeSelect.value));
  themeLabel.append(themeSelect);
  wrap.append(themeLabel);

  // Only shown when more than one Claude Code session is being watched.
  const sessionLabelEl = document.createElement('label');
  sessionLabelEl.append('Session ');
  sessionLabelEl.hidden = true;
  const sessionSelect = document.createElement('select');
  sessionSelect.addEventListener('change', () => switchSession(sessionSelect.value));
  sessionLabelEl.append(sessionSelect);
  wrap.append(sessionLabelEl);
  document.body.append(wrap);

  const tokensEl = document.getElementById('tokens');
  let lastOptions = '';

  const source = new EventSource(eventsUrl());
  source.onmessage = (msg) => {
    const snap = JSON.parse(msg.data);
    const session = snap.active ? snap.sessions[snap.active] : null;

    if (tokensEl) {
      const t = session?.tokens;
      tokensEl.textContent = t ? `${formatTokens(t.input + t.cacheWrite)} / ${formatTokens(t.output)}` : '—';
      tokensEl.title = t
        ? `This task only. New input ${formatTokens(t.input)} · cache write ${formatTokens(t.cacheWrite)} · cache read ${formatTokens(t.cacheRead)} · output ${formatTokens(t.output)}`
        : 'Token usage is not available for this session yet.';
    }

    const ids = Object.keys(snap.sessions);
    const wanted = selectedSession();
    const options = [['', 'Latest']].concat(ids.map((id) => [id, sessionLabel(id, snap.sessions[id])]));
    const signature = JSON.stringify(options) + wanted;
    if (signature === lastOptions) return;
    lastOptions = signature;
    sessionSelect.replaceChildren(
      ...options.map(([value, text]) => {
        const option = document.createElement('option');
        option.value = value;
        option.textContent = text;
        option.selected = value === wanted;
        return option;
      }),
    );
    sessionLabelEl.hidden = ids.length < 2;
  };
}
