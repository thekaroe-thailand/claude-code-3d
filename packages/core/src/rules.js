// Maps tools to the four fixed roles. Rules come from spec.md section 4.
export const ROLES = ['SA', 'Dev', 'Tester', 'Summary'];

const READ_TOOLS = new Set(['Read', 'Grep', 'Glob', 'LS', 'WebSearch', 'WebFetch', 'ToolSearch', 'Skill']);
const WRITE_TOOLS = new Set(['Edit', 'MultiEdit', 'Write', 'NotebookEdit']);
const SUBAGENT_TOOLS = new Set(['Agent', 'Task']);
const TEST_COMMAND = /\b(test|tests|build|pytest|jest|vitest|mocha|tsc|lint|typecheck|check|cargo test|go test)\b/i;

// Subagent types (or their descriptions) are matched by keyword. Anything unknown goes to Dev.
export function roleForAgentType(type = '') {
  const t = String(type).toLowerCase();
  if (/(explor|research|plan|guide|search|investigat|analy)/.test(t)) return 'SA';
  if (/(test|review|verif|qa|audit|check)/.test(t)) return 'Tester';
  if (/(summar|writer|report|doc)/.test(t)) return 'Summary';
  return 'Dev';
}

// `command` is the Bash command, `subagentType` is tool_input.subagent_type for Agent/Task calls.
export function roleForTool(tool, command = '', subagentType = '') {
  if (!tool) return null;
  if (READ_TOOLS.has(tool) || tool.startsWith('mcp__')) return 'SA';
  if (WRITE_TOOLS.has(tool)) return 'Dev';
  if (SUBAGENT_TOOLS.has(tool)) return roleForAgentType(subagentType);
  if (tool === 'Bash' || tool === 'PowerShell') return TEST_COMMAND.test(command) ? 'Tester' : 'Dev';
  return null;
}
