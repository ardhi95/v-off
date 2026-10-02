import fs from 'node:fs/promises';
import path from 'node:path';
import type { Config } from '../shared/types.js';
import { defaultConfig } from './defaults.js';
import { vOffHome } from './paths.js';

export function configPath(): string {
  return path.join(vOffHome(), 'config.json');
}

/** Fill keys missing from a stored config with defaults, so older files keep working. */
export function withDefaults(raw: Partial<Config>): Config {
  const d = defaultConfig();
  return {
    version: 1,
    agents: Array.isArray(raw.agents) ? raw.agents : d.agents,
    departments: Array.isArray(raw.departments) ? raw.departments : d.departments,
    pricing: raw.pricing && typeof raw.pricing === 'object' ? raw.pricing : d.pricing,
    sources: { ...d.sources, ...raw.sources },
    rules: { ...d.rules, ...raw.rules },
    ambience: { ...d.ambience, ...raw.ambience },
  };
}

export async function loadConfig(file = configPath()): Promise<Config> {
  try {
    return withDefaults(JSON.parse(await fs.readFile(file, 'utf8')) as Partial<Config>);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return defaultConfig();
    throw new Error(`Config tidak bisa dibaca (${file}): ${(err as Error).message}`);
  }
}

/** Write atomically: temp file + rename, so a crash never leaves a half-written config. */
export async function saveConfig(config: Config, file = configPath()): Promise<void> {
  await fs.mkdir(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(config, null, 2) + '\n', 'utf8');
  await fs.rename(tmp, file);
}

/** Minimal shape check for PUT /api/config. Returns an error message or null. */
export function validateConfig(value: unknown): string | null {
  if (!value || typeof value !== 'object') return 'Config harus berupa objek.';
  const c = value as Partial<Config>;
  if (!Array.isArray(c.agents)) return 'agents harus berupa array.';
  if (!Array.isArray(c.departments)) return 'departments harus berupa array.';
  const ids = new Set<string>();
  for (const a of c.agents) {
    if (!a || typeof a.id !== 'string' || !a.id) return 'Setiap agent butuh id.';
    if (typeof a.name !== 'string' || !a.name) return `Agent ${a.id} butuh nama.`;
    if (ids.has(a.id)) return `Id agent ganda: ${a.id}`;
    if (!Array.isArray(a.match)) return `Agent ${a.id}: match harus berupa array.`;
    ids.add(a.id);
  }
  for (const d of c.departments) {
    if (!d || typeof d.id !== 'string' || !d.id) return 'Setiap departemen butuh id.';
  }
  return null;
}
