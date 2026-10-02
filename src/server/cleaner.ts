import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import type { Agent, CleanerItem, CleanerSettings, CleanerState } from '../shared/types.js';
import { expandHome } from './paths.js';

// Office boy cache scan (SPEC §8). DRY-RUN ONLY: this module measures sizes and
// never deletes, moves, or writes anything. Symlinks are never followed.

const LOG_AGE_MS = 7 * 24 * 3600_000;

export interface WalkLimits {
  maxEntries: number;
  maxMs: number;
}

const DEFAULT_LIMITS: WalkLimits = { maxEntries: 200_000, maxMs: 4000 };

/** Total size of regular files under `root`. Returns null when `root` does not exist. */
export async function dirSize(
  root: string,
  limits: WalkLimits = DEFAULT_LIMITS,
  filter?: (file: string, st: { mtimeMs: number }) => boolean,
): Promise<{ bytes: number; partial: boolean } | null> {
  try {
    const st = await fs.lstat(root);
    if (!st.isDirectory()) return null;
  } catch {
    return null;
  }
  const start = Date.now();
  let bytes = 0, entries = 0, partial = false;
  const stack = [root];
  while (stack.length) {
    if (entries >= limits.maxEntries || Date.now() - start > limits.maxMs) {
      partial = true;
      break;
    }
    const dir = stack.pop()!;
    let list;
    try {
      list = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      continue; // unreadable: skip
    }
    for (const e of list) {
      entries++;
      const p = path.join(dir, e.name);
      if (e.isDirectory()) stack.push(p);
      else if (e.isFile()) {
        try {
          const s = await fs.lstat(p);
          if (!filter || filter(p, s)) bytes += s.size;
        } catch {
          // vanished
        }
      }
    }
  }
  return { bytes, partial };
}

export interface ScanTarget {
  path: string;
  label: string;
  agentId?: string;
  /** Only count files matching this predicate (old logs). */
  filter?: (file: string, st: { mtimeMs: number }) => boolean;
}

/** The allowlist: every path the office boy may ever report (and, later, clean). */
export function scanTargets(
  sessionDirs: { agentId: string; cwd: string }[],
  agents: Agent[],
  settings: CleanerSettings,
  now = Date.now(),
): ScanTarget[] {
  const name = (id: string) => agents.find((a) => a.id === id)?.name;
  const out: ScanTarget[] = [];
  for (const { agentId, cwd } of sessionDirs) {
    const who = name(agentId);
    const repo = path.basename(cwd);
    out.push({ path: path.join(cwd, 'node_modules', '.cache'), label: `node_modules/.cache ${who ? `milik ${who}` : `di ${repo}`}`, agentId });
    out.push({ path: path.join(cwd, '.next', 'cache'), label: `.next/cache ${who ? `milik ${who}` : `di ${repo}`}`, agentId });
  }
  const home = os.homedir();
  out.push({ path: path.join(home, '.npm', '_cacache'), label: 'cache npm (~/.npm/_cacache)' });
  out.push({
    path: process.platform === 'darwin' ? path.join(home, 'Library', 'Caches', 'ms-playwright') : path.join(home, '.cache', 'ms-playwright'),
    label: 'cache Playwright',
  });
  for (const p of settings.logPaths) {
    out.push({
      path: expandHome(p),
      label: `log lama (> 7 hari) di ${path.basename(expandHome(p))}`,
      filter: (file, st) => file.endsWith('.log') && now - st.mtimeMs > LOG_AGE_MS,
    });
  }
  return out;
}

/** Claude Code session temp folders (claude-*) directly under the OS temp dir. */
export async function tmpTargets(tmp = os.tmpdir()): Promise<ScanTarget[]> {
  try {
    const list = await fs.readdir(tmp, { withFileTypes: true });
    return list
      .filter((e) => e.isDirectory() && e.name.startsWith('claude-'))
      .map((e) => ({ path: path.join(tmp, e.name), label: `/tmp sesi agent (${e.name})` }));
  } catch {
    return [];
  }
}

export async function scan(targets: ScanTarget[], now = Date.now(), limits?: WalkLimits): Promise<CleanerState> {
  const items: CleanerItem[] = [];
  for (const t of targets) {
    const r = await dirSize(t.path, limits, t.filter);
    if (!r || r.bytes === 0) continue;
    const item: CleanerItem = { path: t.path, label: t.label, bytes: r.bytes };
    if (t.agentId) item.agentId = t.agentId;
    if (r.partial) item.partial = true;
    items.push(item);
  }
  items.sort((a, b) => b.bytes - a.bytes);
  return { mode: 'dry-run', items, totalBytes: items.reduce((s, i) => s + i.bytes, 0), lastScanAt: now };
}
