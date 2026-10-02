import fs from 'node:fs/promises';
import path from 'node:path';
import { SPECIES_IDS, type Config } from '../shared/types.js';
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
    cleaner: { ...d.cleaner, ...raw.cleaner },
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

const HEX = /^#[0-9a-f]{6}$/i;
const ID = /^[a-z0-9][a-z0-9-]{0,39}$/;
const isNum = (v: unknown, min = 0) => typeof v === 'number' && Number.isFinite(v) && v >= min;
const isStr = (v: unknown, max = 200) => typeof v === 'string' && v.length <= max;

function checkRule(r: unknown): boolean {
  if (!r || typeof r !== 'object') return false;
  const keys = Object.keys(r);
  if (keys.length !== 1) return false;
  const [k] = keys as [string];
  const v = (r as Record<string, unknown>)[k];
  if (!['cwdGlob', 'gitBranch', 'env', 'sessionName'].includes(k) || !isStr(v, 500) || !(v as string).trim()) return false;
  return k !== 'env' || /^[A-Za-z_][A-Za-z0-9_]*=.+$/.test(v as string);
}

/** Shape and value check for PUT /api/config. Returns an Indonesian error message or null. */
export function validateConfig(value: unknown): string | null {
  if (!value || typeof value !== 'object') return 'Config harus berupa objek.';
  const c = value as Partial<Config>;
  if (!Array.isArray(c.agents)) return 'agents harus berupa array.';
  if (!Array.isArray(c.departments)) return 'departments harus berupa array.';
  if (c.agents.length > 200) return 'Maksimal 200 agent.';

  const deptIds = new Set<string>();
  for (const d of c.departments) {
    if (!d || typeof d.id !== 'string' || !ID.test(d.id)) return 'Setiap departemen butuh id (huruf kecil, angka, tanda minus).';
    if (deptIds.has(d.id)) return `Id departemen ganda: ${d.id}`;
    if (!isStr(d.label, 80) || !d.label.trim()) return `Departemen ${d.id} butuh nama.`;
    if (!isStr(d.color) || !HEX.test(d.color)) return `Warna departemen ${d.label} tidak valid.`;
    deptIds.add(d.id);
  }

  const ids = new Set<string>();
  for (const a of c.agents) {
    if (!a || typeof a.id !== 'string' || !ID.test(a.id)) return 'Setiap agent butuh id (huruf kecil, angka, tanda minus).';
    if (ids.has(a.id)) return `Id agent ganda: ${a.id}`;
    ids.add(a.id);
    const who = typeof a.name === 'string' && a.name ? a.name : a.id;
    if (!isStr(a.name, 60) || !a.name.trim()) return `Agent ${a.id} butuh nama.`;
    if (!isStr(a.role, 80)) return `Peran ${who} terlalu panjang.`;
    if (!isStr(a.short, 30)) return `Peran singkat ${who} terlalu panjang.`;
    if (!deptIds.has(a.dept)) return `Departemen ${who} tidak ada: ${String(a.dept)}`;
    if (!(SPECIES_IDS as readonly string[]).includes(a.animal)) return `Hewan ${who} tidak dikenal.`;
    if (!isStr(a.shirt) || !HEX.test(a.shirt)) return `Warna baju ${who} tidak valid.`;
    if (!isStr(a.tool, 40) || !a.tool) return `Tool ${who} wajib diisi.`;
    if (!Array.isArray(a.match) || a.match.length > 20 || !a.match.every(checkRule)) return `Aturan pemetaan ${who} tidak valid.`;
    if (a.quips !== undefined && (!Array.isArray(a.quips) || a.quips.length > 30 || !a.quips.every((q) => isStr(q, 80)))) return `Celetukan ${who} tidak valid (maks 80 karakter).`;
  }

  if (c.pricing !== undefined) {
    if (!c.pricing || typeof c.pricing !== 'object') return 'Tabel harga tidak valid.';
    for (const [model, p] of Object.entries(c.pricing)) {
      if (!model.trim() || model.length > 100) return 'Nama model tidak valid.';
      if (!p || !isNum(p.input) || !isNum(p.output) || !isNum(p.cacheRead) || !isNum(p.cacheWrite)) return `Harga ${model} harus angka ≥ 0.`;
    }
  }
  if (c.rules !== undefined) {
    if (!isNum(c.rules?.workWindowSec, 10) || !isNum(c.rules?.idleAfterSec, 60)) return 'Aturan status: jendela kerja ≥ 10 detik, istirahat ≥ 60 detik.';
    if (c.rules.idleAfterSec <= c.rules.workWindowSec) return 'Batas istirahat harus lebih lama dari jendela kerja.';
  }
  if (c.cleaner !== undefined) {
    if (!isNum(c.cleaner?.intervalMin, 1)) return 'Interval pindai minimal 1 menit.';
    if (!Array.isArray(c.cleaner.logPaths) || !c.cleaner.logPaths.every((p) => isStr(p, 500) && p.trim())) return 'Path log tidak valid.';
  }
  if (c.sources !== undefined) {
    for (const [k, s] of Object.entries(c.sources)) {
      if (!s || typeof s.enabled !== 'boolean' || (s.path !== undefined && !isStr(s.path, 500))) return `Sumber data ${k} tidak valid.`;
    }
  }
  return null;
}
