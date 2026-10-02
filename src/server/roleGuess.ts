import type { Agent } from '../shared/types.js';

// Sessions no match rule claims are classified into an office role by keywords,
// like virtual-agents-office's `roleFor`: deterministic, local, nothing leaves the machine.
// The roster is a catalog: a session takes the closest role that exists in it.
//   explicit: the session names its role ("/v-off-roles raka", "kerjakan sebagai CTO").
//   evidence: the work itself (Kotlin files -> Android, Dockerfile -> DevSecOps, ...).
//   fallback: no evidence yet -> Tech Lead for code work, Project Manager otherwise.

export type RoleKey =
  | 'ceo' | 'cto' | 'pm' | 'po' | 'scrum' | 'ba' | 'uiux' | 'techlead' | 'architect'
  | 'backend' | 'web' | 'android' | 'ios' | 'dataeng' | 'dataanalyst' | 'qa' | 'devsecops';

/** Phrases (lowercase) that name each role, matched against agent roles and explicit text. */
export const ROLE_ALIASES: Record<RoleKey, string[]> = {
  ceo: ['ceo', 'chief executive'],
  cto: ['cto', 'chief technology'],
  pm: ['project manager', 'pmo', 'manajer proyek'],
  po: ['product owner'],
  scrum: ['scrum master', 'scrum'],
  ba: ['business analyst', 'analis bisnis'],
  uiux: ['ui/ux', 'ui ux', 'uiux', 'ux designer', 'ui designer', 'desainer'],
  techlead: ['tech lead', 'techlead', 'technical lead'],
  architect: ['solution architect', 'architect', 'arsitek'],
  backend: ['backend', 'back-end', 'back end'],
  web: ['web developer', 'frontend', 'front-end', 'front end'],
  android: ['android'],
  ios: ['ios'],
  dataeng: ['data engineer'],
  dataanalyst: ['data analyst', 'analis data'],
  qa: ['qa engineer', 'quality assurance', 'tester', 'qa'],
  devsecops: ['devsecops', 'devops', 'security engineer'],
};

export interface RoleHint {
  /** The session named its role: an agent id or a role. */
  explicit?: { agentId?: string; role?: RoleKey };
  /** Roles the work points at; each entry is one point. */
  evidence?: RoleKey[];
  /** The call touched code (edited a source file or ran a command): picks the fallback role. */
  code?: boolean;
}

function norm(text: string): string {
  return text.toLowerCase().replace(/[·|_]/g, ' ').replace(/\s+/g, ' ').trim();
}

/** Whole-word (or phrase) match, so "qa" does not hit "aqua" and "ios" not "radios". */
function hasPhrase(haystack: string, phrase: string): boolean {
  const esc = phrase.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&');
  return new RegExp(`(^|[^a-z0-9])${esc}($|[^a-z0-9])`).test(haystack);
}

/** Role named by a free-text label, e.g. an agent's role or "/v-off-roles backend". Longest alias wins. */
export function roleFromText(text: string): RoleKey | undefined {
  const t = norm(text);
  let best: { key: RoleKey; len: number } | undefined;
  for (const [key, aliases] of Object.entries(ROLE_ALIASES) as [RoleKey, string[]][]) {
    for (const a of aliases) if (a.length > (best?.len ?? 0) && hasPhrase(t, a)) best = { key, len: a.length };
  }
  return best?.key;
}

const ROLE_SKILL = /(?:\/v-off-roles|<command-name>\/?v-off-roles<\/command-name>[\s\S]*?<command-args>)\s*([^\n<]{1,60})/i;
// Not bare "jadi": in Indonesian it usually means "so" ("jadi backend-nya error").
const AS_ROLE = /\b(?:sebagai|menjadi|act as|as an?)\s+([^\n.,;:!?]{2,30})/gi;

/**
 * An explicit role in a prompt: the v-off-roles skill with an argument, or "sebagai <peran>".
 * The prompt is only scanned here, never stored or shown (privacy).
 */
export function explicitRole(text: string): RoleHint['explicit'] | undefined {
  const skill = ROLE_SKILL.exec(text);
  if (skill) {
    const arg = skill[1]!.trim();
    const role = roleFromText(arg);
    if (role) return { role };
    const id = /^[a-z0-9-]+/i.exec(arg)?.[0]?.toLowerCase();
    if (id) return { agentId: id };
  }
  for (const m of text.matchAll(AS_ROLE)) {
    const role = roleFromText(m[1]!);
    if (role) return { role };
  }
  return undefined;
}

/** Explicit role from a Skill tool call (`{ skill: 'v-off-roles', args: 'raka' }`). */
export function explicitRoleFromSkill(input: unknown): RoleHint['explicit'] | undefined {
  const i = (input && typeof input === 'object' ? input : {}) as Record<string, unknown>;
  const skill = typeof i.skill === 'string' ? i.skill : '';
  if (!/(^|:)v-off-roles$/.test(skill)) return undefined;
  return explicitRole(`/v-off-roles ${typeof i.args === 'string' ? i.args : ''}`);
}

// Path / command signals. Order does not matter: every rule that matches adds a point.
const PATH_RULES: [RegExp, RoleKey][] = [
  [/\.(kt|kts)$|androidmanifest\.xml$|(^|\/)android\/|build\.gradle(\.kts)?$/i, 'android'],
  [/\.(swift|xib|storyboard|pbxproj|xcconfig)$|(^|\/)ios\/|podfile$|\.xcodeproj\//i, 'ios'],
  [/\.(tsx|jsx|vue|svelte|css|scss|sass|less|html)$/i, 'web'],
  [/(^|\/)(web|frontend|client|components|pages|app\/ui)\/.*\.(ts|js)$/i, 'web'],
  [/\.(go|java|rb|php|cs|rs|ex|exs)$/i, 'backend'],
  [/(^|\/)(server|backend|api|routes|controllers?|services|migrations?|models)\/.*\.(ts|js|py)$/i, 'backend'],
  [/\.(test|spec)\.[a-z]+$|_test\.(go|py)$|(^|\/)(tests?|__tests__|e2e|cypress|playwright)\//i, 'qa'],
  [/(^|\/)dockerfile$|docker-compose\.ya?ml$|(^|\/)\.github\/workflows\/|\.tf$|(^|\/)(k8s|helm|terraform|deploy)\/|(^|\/)security\.md$/i, 'devsecops'],
  [/\.(sql|ipynb)$|(^|\/)(etl|pipelines?|dags|dbt|warehouse)\//i, 'dataeng'],
  [/\.(csv|parquet)$|(^|\/)(dashboards?|analytics|reports?)\//i, 'dataanalyst'],
  [/\.(fig|sketch|xd)$|(^|\/)(design|mockups?|wireframes?)\//i, 'uiux'],
  [/(^|[\/_\- ])(fsd|brd|prd|user[-_ ]?stor(y|ies)|requirements?)([\/_\-. ]|$)/i, 'ba'],
  [/(^|[\/_\- ])(tsd|adr|architecture|arsitektur|sequence)([\/_\-. ]|$)|\.puml$/i, 'architect'],
  [/(^|[\/_\- ])(wbs|timeline|gantt|raid|status[-_ ]report|laporan[-_ ]status)([\/_\-. ]|$)|\.mpp$/i, 'pm'],
  [/(^|[\/_\- ])(sprint|backlog|retro|standup)([\/_\-. ]|$)/i, 'scrum'],
  [/(^|[\/_\- ])(roadmap|prioriti[sz]ation)([\/_\-. ]|$)/i, 'po'],
];

const COMMAND_RULES: [RegExp, RoleKey][] = [
  [/\b(gradlew|adb|assemble(debug|release))\b/, 'android'],
  [/\b(xcodebuild|xcrun|pod install|swift (build|test))\b/, 'ios'],
  [/\b(vitest|jest|pytest|phpunit|playwright|cypress|go test|npm (run )?test|yarn test|pnpm test)\b/, 'qa'],
  [/\b(docker|kubectl|helm|terraform|trivy|semgrep|snyk|npm audit|gitleaks)\b/, 'devsecops'],
  // Not plain git diff/log: every session runs those.
  [/\bgh pr (review|diff|checks)\b/, 'techlead'],
  [/\b(dbt|airflow|psql|spark-submit)\b/, 'dataeng'],
  [/\b(php artisan|rails |manage\.py|go run|uvicorn|nest )/, 'backend'],
  [/\b(vite|next (dev|build)|npm run (dev|build)|tailwind)\b/, 'web'],
];

function str(v: unknown): string | undefined {
  return typeof v === 'string' && v ? v : undefined;
}

/** Roles a tool call points at, from its file path or shell command. */
export function evidenceFromTool(name: string, input: unknown): RoleKey[] {
  const i = (input && typeof input === 'object' ? input : {}) as Record<string, unknown>;
  const out: RoleKey[] = [];
  const file = str(i.file_path) ?? str(i.notebook_path) ?? (name === 'Glob' || name === 'Grep' ? undefined : str(i.path));
  if (file) for (const [re, role] of PATH_RULES) if (re.test(file.replace(/\\/g, '/'))) out.push(role);
  const cmd = name === 'Bash' ? str(i.command) : undefined;
  if (cmd) for (const [re, role] of COMMAND_RULES) if (re.test(cmd)) out.push(role);
  return out;
}

const CODE_FILE = /\.(ts|tsx|js|jsx|mjs|cjs|py|go|java|kt|kts|swift|rb|php|cs|rs|c|cc|cpp|h|vue|svelte|css|scss|html|sql|sh)$/i;
const EDIT_TOOLS = new Set(['Edit', 'MultiEdit', 'Write', 'NotebookEdit']);

/** Did the call touch code? Editing a source file or running a shell command counts. */
export function touchesCode(name: string, input: unknown): boolean {
  if (name === 'Bash') return true;
  const i = (input && typeof input === 'object' ? input : {}) as Record<string, unknown>;
  const file = str(i.file_path) ?? str(i.notebook_path);
  return EDIT_TOOLS.has(name) && !!file && CODE_FILE.test(file);
}

/** The office agent holding a role, or undefined when the roster has no such role. */
export function agentForRole(agents: Agent[], role: RoleKey): Agent | undefined {
  return agents.find((a) => !a.walker && roleFromText(a.role) === role);
}

/**
 * Highest-scoring role that exists in the roster. The current role is kept until another
 * scores 1.5× more, so a session does not hop desks on every file.
 */
export function closestRole(scores: Map<RoleKey, number>, available: Set<RoleKey>, current?: RoleKey): RoleKey | undefined {
  let best: [RoleKey, number] | undefined;
  for (const [role, n] of scores) if (available.has(role) && n > 0 && (!best || n > best[1])) best = [role, n];
  if (!best) return undefined;
  const cur = current && available.has(current) ? scores.get(current) ?? 0 : 0;
  return cur > 0 && cur * 1.5 >= best[1] ? current : best[0];
}

/** Role for a session without evidence: Tech Lead for code, Project Manager otherwise, else anyone. */
export function fallbackAgent(agents: Agent[], code: boolean): Agent | undefined {
  const order: RoleKey[] = code ? ['techlead', 'pm'] : ['pm', 'techlead'];
  for (const r of order) {
    const a = agentForRole(agents, r);
    if (a) return a;
  }
  return agents.find((a) => !a.walker);
}
