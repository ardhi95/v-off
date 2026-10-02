import type { EventKind } from '../shared/types.js';

export const DETAIL_MAX = 160;

export function clip(text: string, max = DETAIL_MAX): string {
  const oneLine = text.replace(/\s+/g, ' ').trim();
  return oneLine.length > max ? oneLine.slice(0, max - 1) + '…' : oneLine;
}

const TOOL_KINDS: Record<string, EventKind> = {
  Read: 'read',
  NotebookRead: 'read',
  Edit: 'edit',
  MultiEdit: 'edit',
  Write: 'edit',
  NotebookEdit: 'edit',
  Bash: 'run',
  BashOutput: 'run',
  KillShell: 'run',
  Grep: 'search',
  Glob: 'search',
  LS: 'search',
  WebSearch: 'search',
  WebFetch: 'search',
  Task: 'message',
  Agent: 'message',
};

/** Tools that start a subagent ("rapat"). */
export function isSubagentTool(name: string): boolean {
  return name === 'Task' || name === 'Agent';
}

export function toolKind(name: string): EventKind {
  return TOOL_KINDS[name] ?? 'run';
}

function str(v: unknown): string | undefined {
  return typeof v === 'string' && v ? v : undefined;
}

/**
 * Turn a tool call into a short, privacy-safe summary: file path, command, or pattern.
 * Never includes file contents or full prompts.
 */
export function summarizeTool(name: string, input: unknown): string {
  const i = (input && typeof input === 'object' ? input : {}) as Record<string, unknown>;
  const file = str(i.file_path) ?? str(i.notebook_path) ?? str(i.path);
  switch (name) {
    case 'Read':
    case 'NotebookRead':
    case 'Edit':
    case 'MultiEdit':
    case 'Write':
    case 'NotebookEdit':
      return clip(file ?? name);
    case 'Bash':
      return clip(str(i.command)?.split('\n')[0] ?? 'Bash');
    case 'Grep':
      return clip(`"${str(i.pattern) ?? ''}"${file ? ` di ${file}` : ''}`);
    case 'Glob':
      return clip(str(i.pattern) ?? 'Glob');
    case 'WebFetch':
      return clip(str(i.url) ?? 'WebFetch');
    case 'WebSearch':
      return clip(`"${str(i.query) ?? ''}"`);
    case 'Task':
    case 'Agent':
      return clip(`Subagent: ${str(i.description) ?? str(i.subagent_type) ?? 'tugas'}`);
    default:
      return clip(file ? `${name} ${file}` : name);
  }
}

export interface BlockMatch {
  reason: string;
  hint: string;
}

// SPEC §6: failed tests, rate/usage limit, API Error, failed build.
const BLOCK_PATTERNS: { re: RegExp; reason: string; hint: string }[] = [
  { re: /usage limit/i, reason: 'Batas pemakaian tercapai', hint: 'Kuota pemakaian habis. Tunggu sampai kuota pulih atau ganti akun/paket.' },
  { re: /rate.?limit/i, reason: 'Kena rate limit', hint: 'Terlalu banyak permintaan ke API. Agent perlu menunggu sebelum lanjut.' },
  { re: /API Error/i, reason: 'Galat API', hint: 'Permintaan ke API model gagal. Periksa koneksi atau status layanan, lalu lanjutkan sesi.' },
  { re: /\b[1-9]\d*\s+(?:tests?\s+)?(?:failed|failing|gagal)\b|\btests? failed\b|^\s*FAIL\b/im, reason: 'Tes gagal', hint: 'Ada tes yang gagal. Putuskan: perbaiki kode atau ubah ekspektasi tes.' },
  { re: /\bbuild failed\b|\bBUILD FAILED\b|compilation failed|failed to compile|\berror TS\d+\b/i, reason: 'Build gagal', hint: 'Build tidak berhasil. Lihat galat terakhir di log aktivitas.' },
];

export function matchBlock(text: string): BlockMatch | null {
  if (isUsageLimit(text)) return { reason: BLOCK_PATTERNS[0]!.reason, hint: BLOCK_PATTERNS[0]!.hint };
  for (const p of BLOCK_PATTERNS) {
    if (p.re.test(text)) return { reason: p.reason, hint: p.hint };
  }
  return null;
}

// Account usage limit (quota) messages, e.g. "Claude AI usage limit reached|1759420800",
// "5-hour limit reached ∙ resets 3pm", "You've hit your limit · resets 3pm (Asia/Jakarta)".
// A plain 429 "rate limit" is transient and does not close the office.
const USAGE_LIMIT_RE = /usage limit|(?:session|weekly|daily|opus|sonnet|\d+-hour)\s+limit|hit your (?:\w+ )?limit|limit (?:reached|will reset|resets)|out of (?:extra )?usage/i;
const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

function isUsageLimit(text: string): boolean {
  return USAGE_LIMIT_RE.test(text.replace(/rate.?limit(?:ed)?/gi, ''));
}

/** Detect an account usage-limit message. Returns the reset time when the message states one. */
export function matchUsageLimit(text: string, now: number): { resetsAt?: number } | null {
  if (!isUsageLimit(text)) return null;
  const resetsAt = parseResetAt(text, now);
  return resetsAt === undefined ? {} : { resetsAt };
}

/**
 * Reset time from a limit message: an epoch suffix ("…|1759420800") or
 * "resets 3pm", "resets 10:30am", "resets Oct 9, 10am", "resets 15:00".
 * Clock times are read in the server's local time zone (the zone in
 * parentheses is ignored) and mean the next such time after `now`.
 */
export function parseResetAt(text: string, now: number): number | undefined {
  const epoch = /\|(\d{10})\b/.exec(text);
  if (epoch) return Number(epoch[1]) * 1000;
  const m = /\bresets?\s+(?:at\s+)?(?:([A-Za-z]{3,9})\s+(\d{1,2}),?\s+(?:at\s+)?)?(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/i.exec(text);
  if (!m) return undefined;
  let hour = Number(m[3]);
  const minute = m[4] ? Number(m[4]) : 0;
  const ampm = m[5]?.toLowerCase();
  if (ampm) {
    if (hour < 1 || hour > 12) return undefined;
    hour = (hour % 12) + (ampm === 'pm' ? 12 : 0);
  } else if (!m[4]) {
    return undefined; // a bare number is not a clock time
  }
  if (hour > 23 || minute > 59) return undefined;
  const d = new Date(now);
  if (m[1]) {
    const month = MONTHS.indexOf(m[1].slice(0, 3).toLowerCase());
    if (month < 0) return undefined;
    d.setMonth(month, Number(m[2]));
  }
  d.setHours(hour, minute, 0, 0);
  if (m[1]) {
    if (d.getTime() < now - 24 * 3600_000) d.setFullYear(d.getFullYear() + 1);
  } else if (d.getTime() <= now) {
    d.setDate(d.getDate() + 1);
  }
  return d.getTime();
}

/** Notification types that mean the agent waits on the user (docs: hooks › Notification). */
const WAITING_TYPES = new Set(['permission_prompt', 'idle_prompt', 'elicitation_dialog', 'elicitation_url_dialog', 'agent_needs_input']);

/**
 * Classify a Claude Code Notification. Returns null for purely informational
 * notifications (auth_success, agent_completed, quota_auto_resume_*, …).
 */
export function notifyBlock(message: string, type?: string): BlockMatch | null {
  if (type && !WAITING_TYPES.has(type)) return null;
  const permission = type === 'permission_prompt' || (!type && /permission|izin/i.test(message));
  if (permission) {
    const tool = /use (\w+)/i.exec(message)?.[1];
    return {
      reason: tool ? `Menunggu izin: ${tool}` : 'Menunggu izin',
      hint: 'Agent meminta izin sebelum melanjutkan. Buka terminal sesi untuk menyetujui atau menolak.',
    };
  }
  return {
    reason: 'Menunggu input',
    hint: 'Agent menunggu jawaban Anda di terminal sesi.',
  };
}

/** Turn-ending API failures (StopFailure error_type). */
export function apiFailureBlock(errorType: string | undefined, message: string): BlockMatch {
  const byType: Record<string, BlockMatch> = {
    rate_limit: { reason: 'Kena rate limit', hint: 'Terlalu banyak permintaan ke API. Lanjutkan sesi setelah batas pulih.' },
    overloaded: { reason: 'API sedang penuh', hint: 'Layanan model sedang sibuk. Coba lanjutkan sesi beberapa saat lagi.' },
    billing_error: { reason: 'Masalah tagihan', hint: 'Periksa paket atau tagihan akun, lalu lanjutkan sesi.' },
    authentication_failed: { reason: 'Login gagal', hint: 'Masuk ulang ke Claude Code di terminal sesi.' },
    max_output_tokens: { reason: 'Batas output tercapai', hint: 'Jawaban terpotong. Minta agent melanjutkan.' },
  };
  return (errorType ? byType[errorType] : undefined) ?? matchBlock(message) ?? { reason: 'Galat API', hint: 'Permintaan ke API model gagal. Lanjutkan sesi setelah masalah teratasi.' };
}
