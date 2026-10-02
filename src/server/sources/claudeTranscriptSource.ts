import fs from 'node:fs/promises';
import path from 'node:path';
import { TranscriptParser } from './claudeTranscript.js';
import type { NormalizedEvent, Sink, SourceAdapter } from './types.js';

interface Tracked {
  offset: number;
  /** Bytes after the last newline; kept as bytes so split UTF-8 characters survive. */
  remainder: Buffer;
  parser: TranscriptParser;
}

export interface TranscriptSourceOptions {
  /** Usually ~/.claude/projects. */
  root: string;
  /** Files modified within this many days are replayed at startup (history + usage). */
  recoveryDays?: number;
  pollMs?: number;
  clock?: () => number;
}

const MAX_DEPTH = 4;

/**
 * Tails Claude Code JSONL transcripts by polling file sizes. Polling is used
 * instead of fs.watch because recursive watching is unreliable across platforms.
 */
export class ClaudeTranscriptSource implements SourceAdapter {
  readonly name = 'claude-code-transcript';
  private files = new Map<string, Tracked>();
  private timer: NodeJS.Timeout | undefined;
  private polling = false;
  private sink: Sink | undefined;
  private readonly recoveryMs: number;
  private readonly pollMs: number;
  private readonly clock: () => number;

  constructor(private readonly opts: TranscriptSourceOptions) {
    this.recoveryMs = (opts.recoveryDays ?? 30) * 24 * 3600_000;
    this.pollMs = opts.pollMs ?? 1000;
    this.clock = opts.clock ?? Date.now;
  }

  async start(sink: Sink): Promise<void> {
    this.sink = sink;
    const cutoff = this.clock() - this.recoveryMs;
    const files = await this.listFiles();
    // Replay oldest first so the newest session ends up as the agent's current one.
    files.sort((a, b) => a.mtimeMs - b.mtimeMs);
    for (const f of files) {
      if (f.mtimeMs < cutoff) {
        this.files.set(f.path, { offset: f.size, remainder: Buffer.alloc(0), parser: new TranscriptParser() });
        continue;
      }
      await this.readNew(f.path, f.size, true);
    }
    this.timer = setInterval(() => void this.poll(), this.pollMs);
    this.timer.unref?.();
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = undefined;
  }

  /** One polling pass. Public for tests. */
  async poll(): Promise<void> {
    if (this.polling) return;
    this.polling = true;
    try {
      for (const f of await this.listFiles()) {
        const t = this.files.get(f.path);
        if (!t || f.size !== t.offset) await this.readNew(f.path, f.size, false);
      }
    } finally {
      this.polling = false;
    }
  }

  private async listFiles(): Promise<{ path: string; size: number; mtimeMs: number }[]> {
    const out: { path: string; size: number; mtimeMs: number }[] = [];
    const walk = async (dir: string, depth: number): Promise<void> => {
      let entries;
      try {
        entries = await fs.readdir(dir, { withFileTypes: true });
      } catch {
        return;
      }
      for (const e of entries) {
        const p = path.join(dir, e.name);
        if (e.isDirectory() && depth < MAX_DEPTH) await walk(p, depth + 1);
        else if (e.isFile() && e.name.endsWith('.jsonl')) {
          try {
            const st = await fs.stat(p);
            out.push({ path: p, size: st.size, mtimeMs: st.mtimeMs });
          } catch {
            // File vanished between readdir and stat.
          }
        }
      }
    };
    await walk(this.opts.root, 0);
    return out;
  }

  private async readNew(file: string, size: number, historic: boolean): Promise<void> {
    let t = this.files.get(file);
    if (!t || size < t.offset) {
      // New or truncated file: start over.
      t = { offset: 0, remainder: Buffer.alloc(0), parser: new TranscriptParser() };
      this.files.set(file, t);
    }
    if (size === t.offset) return;
    let chunk: Buffer;
    try {
      const fh = await fs.open(file, 'r');
      try {
        const buf = Buffer.alloc(size - t.offset);
        const { bytesRead } = await fh.read(buf, 0, buf.length, t.offset);
        chunk = buf.subarray(0, bytesRead);
        t.offset += bytesRead;
      } finally {
        await fh.close();
      }
    } catch {
      return;
    }
    // Keep an unfinished last line for the next read.
    const bytes = Buffer.concat([t.remainder, chunk]);
    const nl = bytes.lastIndexOf(0x0a);
    t.remainder = nl === -1 ? bytes : bytes.subarray(nl + 1);
    if (nl === -1) return;
    const text = bytes.subarray(0, nl).toString('utf8');
    const events: NormalizedEvent[] = [];
    for (const line of text.split('\n')) events.push(...t.parser.parseLine(line));
    if (events.length) this.sink?.ingest(events, { historic });
  }
}
