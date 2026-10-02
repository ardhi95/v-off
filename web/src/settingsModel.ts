import type { Agent, Config, Department, MatchRule, Seat } from '../../src/shared/types.js';

// Pure helpers for the Settings page (tested in web/test/settings.test.ts).

export const SHIRT_COLORS: [string, string][] = [
  ['#3b6fd8', 'biru'], ['#d9488b', 'merah muda'], ['#2f9e8f', 'hijau tosca'], ['#e0a030', 'kuning'], ['#8e44ad', 'ungu'],
  ['#c0392b', 'merah'], ['#e67e22', 'oranye'], ['#16a085', 'hijau'], ['#6a5acd', 'nila'], ['#4a5578', 'abu kebiruan'],
];

export const DEPT_COLORS = ['#3b6fd8', '#8e44ad', '#16a085', '#e67e22', '#d9488b', '#2fb5c9', '#e0a030'];

export const TOOLS = ['Claude Code', 'Codex', 'Gemini CLI'];

export function slugify(text: string, taken: Iterable<string>): string {
  const base = text.toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 32) || 'agent';
  const used = new Set(taken);
  let id = base, i = 2;
  while (used.has(id)) id = `${base}-${i++}`;
  return id;
}

// ---- match rules <-> text (one rule per line) ----

const KEYS: [string, keyof MatchRuleUnion][] = [['folder', 'cwdGlob'], ['branch', 'gitBranch'], ['env', 'env'], ['sesi', 'sessionName']];
type MatchRuleUnion = { cwdGlob: string; gitBranch: string; env: string; sessionName: string };
const ALIASES: Record<string, keyof MatchRuleUnion> = { folder: 'cwdGlob', cwd: 'cwdGlob', branch: 'gitBranch', env: 'env', sesi: 'sessionName', session: 'sessionName' };

export function rulesToText(rules: MatchRule[]): string {
  return rules
    .map((r) => {
      const [k, v] = Object.entries(r)[0] ?? [];
      const label = KEYS.find(([, key]) => key === k)?.[0];
      return label ? `${label}: ${v}` : '';
    })
    .filter(Boolean)
    .join('\n');
}

export function textToRules(text: string): { rules: MatchRule[]; errors: string[] } {
  const rules: MatchRule[] = [];
  const errors: string[] = [];
  text.split('\n').forEach((raw, i) => {
    const line = raw.trim();
    if (!line) return;
    const m = /^([a-z]+)\s*:\s*(.+)$/i.exec(line);
    const key = m ? ALIASES[m[1]!.toLowerCase()] : undefined;
    const value = m?.[2]!.trim();
    if (!key || !value) {
      errors.push(`Baris ${i + 1}: pakai "folder:", "branch:", "env:", atau "sesi:".`);
      return;
    }
    if (key === 'env' && !/^[A-Za-z_][A-Za-z0-9_]*=.+$/.test(value)) {
      errors.push(`Baris ${i + 1}: env harus berbentuk NAMA=nilai.`);
      return;
    }
    rules.push({ [key]: value } as MatchRule);
  });
  return { rules, errors };
}

// ---- seats ----

const seatKey = (s: Seat) => ('room' in s ? `room:${s.room}` : `${s.pod}:${s.side}:${s.offset}`);

/**
 * Seat for an agent after a department change: keep the current seat when it
 * already belongs to that department's desk, else the first free chair at the
 * new desk. Departments without a desk return undefined (the floor gives the
 * agent any free chair).
 */
export function seatForDept(agent: Agent, deptId: string, agents: Agent[], departments: Department[]): Seat | undefined {
  const cur = agent.seat;
  if (cur && 'room' in cur && agent.dept === deptId) return cur;
  if (cur && 'pod' in cur && cur.pod === deptId) return cur;
  const dept = departments.find((d) => d.id === deptId);
  if (!dept?.desk) return undefined;
  const taken = new Set(agents.filter((a) => a.id !== agent.id && a.seat).map((a) => seatKey(a.seat!)));
  const half = Math.floor((dept.desk.w / 2 - 30) / 60) * 60;
  for (const side of ['b', 'f'] as const) {
    for (let offset = -half; offset <= half; offset += 60) {
      const s: Seat = { pod: deptId, side, offset };
      if (!taken.has(seatKey(s))) return s;
    }
  }
  return undefined;
}

export function newAgent(config: Config): Agent {
  const id = slugify('agent baru', config.agents.map((a) => a.id));
  const dept = config.departments.find((d) => d.desk) ?? config.departments[0];
  const used = new Set(config.agents.map((a) => a.shirt));
  const shirt = (SHIRT_COLORS.find(([c]) => !used.has(c)) ?? SHIRT_COLORS[0]!)[0];
  const base: Agent = {
    id, name: 'Agent baru', role: 'Developer', short: 'Dev', dept: dept?.id ?? '', animal: 'dog', shirt,
    tool: 'Claude Code', match: [{ env: `V_OFF_AGENT=${id}` }], quips: [],
  };
  const seat = seatForDept(base, base.dept, config.agents, config.departments);
  return seat ? { ...base, seat } : base;
}

export function newDepartment(label: string, departments: Department[]): Department {
  const used = new Set(departments.map((d) => d.color));
  return {
    id: slugify(label, departments.map((d) => d.id)),
    label: label.trim(),
    color: DEPT_COLORS.find((c) => !used.has(c)) ?? DEPT_COLORS[departments.length % DEPT_COLORS.length]!,
  };
}

/** Map an unknown session's folder to an agent: adds a "folder: <cwd>/**" rule. */
export function assignFolder(config: Config, agentId: string, cwd: string): Config {
  const glob = `${cwd.replace(/\/+$/, '')}/**`;
  return {
    ...config,
    agents: config.agents.map((a) =>
      a.id === agentId && !a.match.some((r) => 'cwdGlob' in r && r.cwdGlob === glob) ? { ...a, match: [...a.match, { cwdGlob: glob }] } : a,
    ),
  };
}

export function isDirty(a: Config, b: Config): boolean {
  return JSON.stringify(a) !== JSON.stringify(b);
}
