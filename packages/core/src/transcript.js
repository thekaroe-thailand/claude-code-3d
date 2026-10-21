import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

// Reads token usage from a Claude Code session transcript (.jsonl).
//
// The transcript format is internal to Claude Code and can change between versions, so everything here is
// defensive: unknown lines are skipped, and if no usage is found the totals stay null (the UI shows "—").
//
// One assistant message can be split across several lines that all carry the same usage, so usage is
// counted once per message.id. Summing every line would overcount several times over.

const EMPTY = () => ({ input: 0, output: 0, cacheRead: 0, cacheWrite: 0 });

const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : 0);

export function usageFromRecord(record) {
  if (record?.type !== 'assistant') return null;
  const message = record.message;
  const usage = message?.usage;
  if (!usage || typeof usage !== 'object') return null;
  const id = message.id ?? record.requestId ?? record.uuid;
  if (typeof id !== 'string') return null;
  return {
    id,
    usage: {
      input: num(usage.input_tokens),
      output: num(usage.output_tokens),
      cacheRead: num(usage.cache_read_input_tokens),
      cacheWrite: num(usage.cache_creation_input_tokens),
    },
  };
}

// Only transcripts inside the Claude config folder are read, so the server cannot be pointed at other files.
export function isAllowedTranscriptPath(file, env = process.env) {
  if (typeof file !== 'string' || !file.endsWith('.jsonl')) return false;
  const base = path.resolve(env.CLAUDE_CONFIG_DIR || path.join(os.homedir(), '.claude'));
  const resolved = path.resolve(file);
  return resolved.startsWith(base + path.sep);
}

export class TranscriptTail {
  constructor(file) {
    this.file = file;
    this.offset = 0;
    this.rest = '';
    this.byId = new Map();
    this.totals = EMPTY();
    this.sawUsage = false;
  }

  // Reads whatever was appended since the last call. Returns true when the totals changed.
  async update() {
    let stat;
    try {
      stat = await fs.stat(this.file);
    } catch {
      return false;
    }
    if (stat.size < this.offset) {
      // The file was replaced or truncated: start over.
      this.offset = 0;
      this.rest = '';
      this.byId.clear();
      this.totals = EMPTY();
      this.sawUsage = false;
    }
    if (stat.size === this.offset) return false;

    const handle = await fs.open(this.file, 'r');
    let chunk;
    try {
      const length = stat.size - this.offset;
      const buffer = Buffer.alloc(length);
      await handle.read(buffer, 0, length, this.offset);
      chunk = buffer.toString('utf8');
      this.offset = stat.size;
    } finally {
      await handle.close();
    }

    const text = this.rest + chunk;
    const lines = text.split('\n');
    this.rest = lines.pop() ?? '';
    let changed = false;
    for (const line of lines) {
      if (!line) continue;
      let record;
      try {
        record = JSON.parse(line);
      } catch {
        continue;
      }
      const found = usageFromRecord(record);
      if (!found) continue;
      const before = this.byId.get(found.id);
      if (before) {
        for (const key of Object.keys(this.totals)) this.totals[key] -= before[key];
      }
      for (const key of Object.keys(this.totals)) this.totals[key] += found.usage[key];
      this.byId.set(found.id, found.usage);
      this.sawUsage = true;
      changed = true;
    }
    return changed;
  }

  // null until at least one message with usage was seen.
  snapshot() {
    return this.sawUsage ? { ...this.totals } : null;
  }
}

export function subtractUsage(total, baseline) {
  if (!total) return null;
  const base = baseline ?? EMPTY();
  const out = {};
  for (const key of Object.keys(EMPTY())) out[key] = Math.max(0, total[key] - base[key]);
  return out;
}
