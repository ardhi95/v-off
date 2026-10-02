import fs from 'node:fs/promises';
import path from 'node:path';
import type { BlockRecord } from './store.js';
import { vOffHome } from './paths.js';

// Short history kept across restarts. Token usage and sessions are rebuilt from
// transcripts at startup; blocks from hooks (permission prompts) exist only
// live, so they are saved here.

export interface HistoryFile {
  version: 1;
  blocks: BlockRecord[];
}

export function historyPath(): string {
  return path.join(vOffHome(), 'history.json');
}

export async function loadHistory(file = historyPath()): Promise<HistoryFile> {
  try {
    const raw = JSON.parse(await fs.readFile(file, 'utf8')) as Partial<HistoryFile>;
    const blocks = Array.isArray(raw.blocks)
      ? raw.blocks.filter((b): b is BlockRecord => !!b && typeof b.ts === 'number' && typeof b.agentId === 'string')
        .map((b) => ({ ts: b.ts, agentId: b.agentId, sessionId: typeof b.sessionId === 'string' ? b.sessionId : '' }))
      : [];
    return { version: 1, blocks };
  } catch {
    return { version: 1, blocks: [] };
  }
}

export async function saveHistory(data: HistoryFile, file = historyPath()): Promise<void> {
  await fs.mkdir(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(data) + '\n', 'utf8');
  await fs.rename(tmp, file);
}
