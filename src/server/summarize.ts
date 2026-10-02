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
  for (const p of BLOCK_PATTERNS) {
    if (p.re.test(text)) return { reason: p.reason, hint: p.hint };
  }
  return null;
}

/** Classify a Claude Code Notification message (permission vs. waiting for input). */
export function notifyBlock(message: string, type?: string): BlockMatch {
  const permission = type === 'permission_prompt' || /permission|izin/i.test(message);
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
