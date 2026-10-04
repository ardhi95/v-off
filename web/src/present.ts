import type { AgentEvent, AgentWithRuntime, Department, EventKind, LimitState, Status } from '../../src/shared/types.js';
import type { PlaySpot } from './office/layout.js';

// Pure presentation helpers for the Team Room UI (labels, numbers, filters).

export type FilterKey = 'semua' | 'kerja' | 'macet' | 'lain' | 'idle';

export const FILTERS: { key: FilterKey; label: string; dot: string }[] = [
  { key: 'semua', label: 'Semua', dot: '#f5b83d' },
  { key: 'kerja', label: 'Bekerja', dot: '#35b87a' },
  { key: 'macet', label: 'Terblokir', dot: '#ef6a3c' },
  { key: 'lain', label: 'Rapat & menyimak', dot: '#8b7bff' },
  { key: 'idle', label: 'Istirahat', dot: '#ff7a9c' },
];

/** Mockup filter rules: "Bekerja" includes the office boy, "lain" = meeting + listening. */
export function matchesFilter(filter: FilterKey, s: Status): boolean {
  switch (filter) {
    case 'semua':
      return true;
    case 'kerja':
      return s === 'kerja' || s === 'bersih';
    case 'lain':
      return s === 'bicara' || s === 'simak';
    default:
      return s === filter;
  }
}

export function filterCounts(agents: AgentWithRuntime[]): Record<FilterKey, number> {
  const out = { semua: 0, kerja: 0, macet: 0, lain: 0, idle: 0 };
  for (const a of agents) {
    if (a.hidden) continue;
    for (const f of FILTERS) if (matchesFilter(f.key, a.runtime.status)) out[f.key]++;
  }
  return out;
}

/** Default selection: the first blocked agent, else the first visible one. */
export function defaultSelection(agents: AgentWithRuntime[]): string | null {
  const visible = agents.filter((a) => !a.hidden);
  return (visible.find((a) => a.runtime.status === 'macet') ?? visible[0])?.id ?? null;
}

export function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toLocaleString('id-ID', { maximumFractionDigits: 1 })} jt`;
  if (n >= 1000) return `${Math.round(n / 1000).toLocaleString('id-ID')} rb`;
  return n.toLocaleString('id-ID');
}

/** Estimated cost; null means no price configured for the model. */
export function formatCost(usd: number | null): string {
  if (usd === null) return '—';
  return `US$ ${usd.toLocaleString('id-ID', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function formatDuration(ms: number): string {
  const m = Math.max(0, Math.floor(ms / 60_000));
  if (m < 60) return `${m}m`;
  return `${Math.floor(m / 60)}j ${String(m % 60).padStart(2, '0')}m`;
}

export function formatTime(ts: number): string {
  return new Date(ts).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', hour12: false }).replace('.', ':');
}

export function formatBytes(n: number): string {
  if (n >= 1024 ** 3) return `${(n / 1024 ** 3).toLocaleString('id-ID', { maximumFractionDigits: 1 })} GB`;
  if (n >= 1024 ** 2) return `${(n / 1024 ** 2).toLocaleString('id-ID', { maximumFractionDigits: 1 })} MB`;
  return `${Math.round(n / 1024).toLocaleString('id-ID')} KB`;
}

/** Log chip label and colours per event kind (mockup LOGC). */
export function logKind(ev: Pick<AgentEvent, 'kind' | 'detail'>): { label: string; bg: string; fg: string } {
  const C = {
    Baca: ['rgba(91,141,239,.18)', '#a9c4ff'],
    Edit: ['rgba(53,184,122,.18)', '#7fe0ae'],
    Jalankan: ['rgba(178,141,255,.18)', '#cdb8ff'],
    Cari: ['rgba(138,144,160,.2)', '#c5c9d3'],
    Galat: ['rgba(239,106,60,.2)', '#ffa98a'],
    Rapat: ['rgba(139,123,255,.18)', '#c4b8ff'],
    Info: ['rgba(138,144,160,.2)', '#c5c9d3'],
  } as const;
  const map: Record<EventKind, keyof typeof C> = {
    read: 'Baca', edit: 'Edit', run: 'Jalankan', search: 'Cari', error: 'Galat',
    message: 'Info', stop: 'Info', notify: 'Info', prompt: 'Info',
  };
  let label: keyof typeof C = map[ev.kind] ?? 'Info';
  if (ev.kind === 'message' && /^Subagent/.test(ev.detail)) label = 'Rapat';
  const [bg, fg] = C[label];
  return { label, bg, fg };
}

const KIND_DOT: Record<EventKind, string> = {
  read: '#35b87a', edit: '#35b87a', run: '#35b87a', search: '#35b87a',
  error: '#ef6a3c', notify: '#ef6a3c', message: '#8b7bff', stop: '#8a90a0', prompt: '#8a90a0',
};

const VERB: Partial<Record<EventKind, string>> = {
  read: 'membaca', edit: 'mengedit', run: 'menjalankan', search: 'mencari', error: 'galat —',
};

/** One feed line: "Raka · Tim Engineering" + "mengedit src/api/timesheet.ts". */
export function feedLine(ev: AgentEvent, agents: AgentWithRuntime[], departments: Department[]): { who: string; what: string; dot: string } {
  const a = agents.find((x) => x.id === ev.agentId);
  const dept = departments.find((d) => d.id === a?.dept)?.label;
  const who = a ? (dept ? `${a.name} · ${dept}` : a.name) : ev.agentId;
  const verb = VERB[ev.kind];
  const detail = ev.detail.charAt(0).toLowerCase() + ev.detail.slice(1);
  // Only subagent messages are "meetings"; other messages are neutral info.
  const dot = ev.kind === 'message' && !/^Subagent/.test(ev.detail) ? '#8a90a0' : KIND_DOT[ev.kind] ?? '#8a90a0';
  return { who, what: verb ? `${verb} ${ev.detail}` : detail, dot };
}

/** Where the agent is: dorm bed, play spot, private room, or team desk. */
export function locationOf(a: AgentWithRuntime, departments: Department[], spot?: PlaySpot, asleep = false): string {
  if (asleep) return 'Asrama · tidur di kamar';
  if (a.walker) return 'Berkeliling kantor';
  if (spot) return `Ruang santai · ${spot.act}`;
  if (a.seat && 'room' in a.seat) return a.seat.room === 'ceo' ? 'Ruang CEO' : 'Ruang CTO';
  const dept = departments.find((d) => d.id === a.dept);
  const desk = dept?.desk ? `Meja ${dept.label}` : 'Meja tamu';
  if (a.runtime.status === 'idle') return `${desk} (semua tempat main penuh)`;
  return desk;
}

/** POSIX single-quote a shell word. */
export function shellQuote(s: string): string {
  return /^[\w@%+=:,./-]+$/.test(s) ? s : `'${s.replace(/'/g, `'\\''`)}'`;
}

/**
 * Command that resumes a session and sends it a message. `claude --resume` looks the
 * session up per project folder, so it must run from the session's cwd.
 */
export function resumeCommand(sessionId: string, cwd?: string, message?: string): string {
  const cd = cwd ? `cd ${shellQuote(cwd)} && ` : '';
  const msg = message?.trim() ? ` ${shellQuote(message.trim())}` : '';
  return `${cd}claude --resume ${shellQuote(sessionId)}${msg}`;
}

function luminance(hex: string): number {
  const n = parseInt(hex.replace('#', '').padEnd(6, '0').slice(0, 6), 16);
  const ch = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * ch[0]! + 0.7152 * ch[1]! + 0.0722 * ch[2]!;
}

/** Text colour (white or black) with the higher contrast on `bg` (avatar initials on shirt colours). */
export function inkOn(bg: string): string {
  const L = luminance(bg);
  const vsWhite = 1.05 / (L + 0.05);
  const vsDark = (L + 0.05) / (luminance('#000000') + 0.05);
  return vsWhite >= vsDark ? '#ffffff' : '#000000';
}

/** Banner text while the office is off: why, and until when. */
export function officeOffText(limit: LimitState): string {
  const time = (ts: number) => new Date(ts).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
  const sameDay = (a: number, b: number) => new Date(a).toDateString() === new Date(b).toDateString();
  const until = limit.resetsAt
    ? `sampai limit reset ${sameDay(limit.resetsAt, limit.since) ? 'pukul' : new Date(limit.resetsAt).toLocaleDateString('id-ID', { weekday: 'short', day: 'numeric', month: 'short' }) + ','} ${time(limit.resetsAt)}`
    : `sampai agent bisa bekerja lagi (paling lambat ${time(limit.until)})`;
  return `Limit pemakaian habis. Kantor off, semua agent tidur di Asrama ${until}.`;
}

/** Actions shown per chat bubble; older ones collapse into "+N aksi sebelumnya". */
export const CHAT_ACTIONS_SHOWN = 4;

/** Live indicator line for an agent, like "typing…" in a chat app. */
export function presenceText(status: Status): string | null {
  switch (status) {
    case 'kerja': return 'sedang bekerja';
    case 'bicara': return 'memimpin rapat subagent';
    case 'simak': return 'menunggu prompt Anda';
    case 'macet': return 'terblokir';
    default: return null;
  }
}

// ---- Obrolan tim (team live chat) -----------------------------------------

export type TeamChatItem =
  /** Someone sent this agent a prompt (size only). */
  | { kind: 'user'; ts: number; to: string; text: string }
  /** A run of actions by one agent in one session; `mentions` = agents it called on (subagent, handoff). */
  | { kind: 'agent'; ts: number; agentId: string; sessionId: string; actions: AgentEvent[]; more: number }
  /** Turn end, question or failure of one agent. */
  | { kind: 'status'; ts: number; agentId: string; sessionId: string; text: string; tone: 'done' | 'wait' | 'error' };

/** Newest team chat items kept in view. */
export const TEAM_CHAT_MAX = 80;

/**
 * The office as one group chat: the feed (any order) becomes messages, oldest first. Consecutive
 * actions of the same agent and session form one bubble, like a chat app grouping messages.
 */
export function teamChat(events: AgentEvent[]): TeamChatItem[] {
  const items: TeamChatItem[] = [];
  for (const ev of [...events].sort((a, b) => a.ts - b.ts)) {
    if (ev.kind === 'prompt') {
      items.push({ kind: 'user', ts: ev.ts, to: ev.agentId, text: ev.detail });
      continue;
    }
    const tone = ev.kind === 'stop' ? 'done' : ev.kind === 'notify' ? 'wait' : ev.kind === 'error' ? 'error' : null;
    if (tone) {
      items.push({ kind: 'status', ts: ev.ts, agentId: ev.agentId, sessionId: ev.sessionId, text: ev.detail, tone });
      continue;
    }
    const last = items[items.length - 1];
    if (last?.kind === 'agent' && last.agentId === ev.agentId && last.sessionId === ev.sessionId) {
      last.actions.push(ev);
      last.ts = ev.ts;
    } else {
      items.push({ kind: 'agent', ts: ev.ts, agentId: ev.agentId, sessionId: ev.sessionId, actions: [ev], more: 0 });
    }
  }
  for (const it of items) {
    if (it.kind !== 'agent' || it.actions.length <= CHAT_ACTIONS_SHOWN) continue;
    it.more = it.actions.length - CHAT_ACTIONS_SHOWN;
    it.actions = it.actions.slice(-CHAT_ACTIONS_SHOWN);
  }
  return items.slice(-TEAM_CHAT_MAX);
}

/** Agents a message points at: "@name" for any agent whose name or role appears in the text. */
export function mentionsIn(text: string, agents: { id: string; name: string }[], self: string): string[] {
  const t = text.toLowerCase();
  return agents
    .filter((a) => a.id !== self && a.name.length > 2 && new RegExp(`(^|[^a-z])${a.name.toLowerCase()}([^a-z]|$)`).test(t))
    .map((a) => a.id);
}
