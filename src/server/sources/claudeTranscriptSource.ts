import fs from 'node:fs/promises';
import path from 'node:path';
import { TranscriptParser } from './claudeTranscript.js';
import type { NormalizedEvent, Sink, SourceAdapter } from './types.js';

interface Tracked {
  offset: number;
  /** Bytes after the last newline; kept as bytes so split UTF-8 characters survive. */
  remainder: Buffer;
  parser: TranscriptParser;
  mtimeMs: number;
}

export interface TranscriptSourceOptions {
  /** Usually ~/.claude/projects. */
  root: string;
  /** Files modified within this many days are replayed at startup (history + usage). */
  recoveryDays?: number;
  pollMs?: number;
  /** Walk the whole folder tree every N polls to find new files (default 5). */
  rescanEvery?: number;
  clock?: () => number;
}

const MAX_DEPTH = 4;
/** Files changed within this window are stat'ed on every poll; others only on a full rescan. */
const HOT_MS = 24 * 3600_000;
/** Read large transcripts in pieces so a huge file never needs one huge buffer. */
const CHUNK = 4 * 1024 * 1024;

/**
 * Tails Claude Code JSONL transcripts by polling file sizes. Polling is used
 * instead of fs.watch because recursive watching is unreliable across platforms.
 */
export class ClaudeTranscriptSource implements SourceAdapter {
  readonly name = 'claude-code-transcript';
  private files = new Map<string, Tracked>();
  private timer: NodeJS.Timeout | undefined;
  private polling = false;
  private polls = 0;
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
        this.files.set(f.path, { offset: f.size, remainder: Buffer.alloc(0), parser: new TranscriptParser(), mtimeMs: f.mtimeMs });
        continue;
      }
      await this.readNew(f.path, f.size, f.mtimeMs, true);
    }
    this.timer = setInterval(() => void this.poll(), this.pollMs);
    this.timer.unref?.();
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = undefined;
  }

  /**
   * One polling pass. Public for tests. Only recently changed files are
   * stat'ed each pass; the full folder walk (new files, revived old ones)
   * runs every `rescanEvery` passes, so a large ~/.claude/projects stays cheap.
   */
  async poll(): Promise<void> {
    if (this.polling) return;
    this.polling = true;
    try {
      const full = this.polls++ % Math.max(1, this.opts.rescanEvery ?? 5) === 0;
      if (full) {
        for (const f of await this.listFiles()) {
          const t = this.files.get(f.path);
          if (!t || f.size !== t.offset) await this.readNew(f.path, f.size, f.mtimeMs, false);
        }
        return;
      }
      const hot = this.clock() - HOT_MS;
      for (const [file, t] of this.files) {
        if (t.mtimeMs < hot) continue;
        let st;
        try {
          st = await fs.stat(file);
        } catch {
          continue; // removed; the next full rescan forgets it
        }
        if (st.size !== t.offset) await this.readNew(file, st.size, st.mtimeMs, false);
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

  private async readNew(file: string, size: number, mtimeMs: number, historic: boolean): Promise<void> {
    let t = this.files.get(file);
    if (!t || size < t.offset) {
      // New or truncated file: start over.
      t = { offset: 0, remainder: Buffer.alloc(0), parser: new TranscriptParser(), mtimeMs };
      this.files.set(file, t);
    }
    t.mtimeMs = mtimeMs;
    if (size === t.offset) return;
    let fh;
    try {
      fh = await fs.open(file, 'r');
    } catch {
      return;
    }
    try {
      while (t.offset < size) {
        const buf = Buffer.alloc(Math.min(CHUNK, size - t.offset));
        const { bytesRead } = await fh.read(buf, 0, buf.length, t.offset);
        if (bytesRead === 0) break;
        t.offset += bytesRead;
        this.consume(t, buf.subarray(0, bytesRead), historic);
      }
    } catch {
      // Read error: keep what was consumed; the next poll continues from offset.
    } finally {
      await fh.close();
    }
  }

  /** Parse complete lines; keep an unfinished last line (as bytes, so split UTF-8 survives). */
  private consume(t: Tracked, chunk: Buffer, historic: boolean): void {
    const bytes = t.remainder.length ? Buffer.concat([t.remainder, chunk]) : chunk;
    const nl = bytes.lastIndexOf(0x0a);
    t.remainder = nl === -1 ? Buffer.from(bytes) : Buffer.from(bytes.subarray(nl + 1));
    if (nl === -1) return;
    const events: NormalizedEvent[] = [];
    for (const line of bytes.subarray(0, nl).toString('utf8').split('\n')) events.push(...t.parser.parseLine(line));
    if (events.length) this.sink?.ingest(events, { historic });
  }
}
