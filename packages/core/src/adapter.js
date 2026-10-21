// Turns the JSON that Claude Code sends to a hook on stdin into the generic event the scene understands.
// Field names follow the Claude Code hooks reference: hook_event_name, session_id, transcript_path, cwd,
// tool_name, tool_input, agent_type. Unknown shapes are ignored rather than rejected.

const EVENT_NAMES = {
  SessionStart: 'SessionStart',
  UserPromptSubmit: 'UserPromptSubmit',
  PreToolUse: 'PreToolUse',
  PostToolUse: 'PostToolUse',
  PostToolUseFailure: 'PostToolUse',
  SubagentStop: 'SubagentStop',
  Stop: 'Stop',
};

const clip = (text, max) => {
  const s = String(text).replace(/\s+/g, ' ').trim();
  return s.length > max ? `${s.slice(0, max - 1)}…` : s;
};

// Last two path segments are enough to recognise a file on a small label.
function shortPath(p) {
  const parts = String(p).split(/[\\/]+/).filter(Boolean);
  return parts.slice(-2).join('/');
}

// One short line about what the tool is doing. Never includes file contents or prompts.
export function describeTool(tool, input = {}) {
  if (!input || typeof input !== 'object') return null;
  if (tool === 'Bash' || tool === 'PowerShell') return input.command ? { command: clip(input.command, 120) } : null;
  const file = input.file_path ?? input.notebook_path ?? input.path;
  if (file) return { path: shortPath(file) };
  if (input.pattern) return { path: clip(input.pattern, 80) };
  if (input.url) return { path: clip(input.url, 80) };
  if (input.query) return { path: clip(input.query, 80) };
  if (input.description) return { path: clip(input.description, 80) };
  return null;
}

export function normalizeHook(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const event = EVENT_NAMES[raw.hook_event_name ?? raw.event];
  if (!event) return null;

  const ev = {
    event,
    session_id: typeof raw.session_id === 'string' ? raw.session_id : 'default',
  };
  if (typeof raw.transcript_path === 'string') ev.transcript_path = raw.transcript_path;
  if (typeof raw.cwd === 'string') ev.cwd = raw.cwd;

  if (event === 'PreToolUse' || event === 'PostToolUse') {
    ev.tool = typeof raw.tool_name === 'string' ? raw.tool_name : undefined;
    const input = raw.tool_input && typeof raw.tool_input === 'object' ? raw.tool_input : {};
    Object.assign(ev, describeTool(ev.tool, input));
    if (typeof input.subagent_type === 'string') ev.subagent_type = input.subagent_type;
    else if (input.description) ev.subagent_type = String(input.description);
  }
  if (event === 'SubagentStop' && typeof raw.agent_type === 'string') ev.agent_type = raw.agent_type;
  return ev;
}
