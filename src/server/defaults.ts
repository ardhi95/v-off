import type { Agent, Config, Department } from '../shared/types.js';

// Default office layout and roster, ported from design/mockup/Main.dc.html
// (this.PODS, this.AG, ZOO). Units are centimetres, Y up.

export const DEFAULT_DEPARTMENTS: Department[] = [
  { id: 'pimpinan', label: 'Pimpinan', color: '#f5b83d' },
  { id: 'produk', label: 'Tim Produk', color: '#f5b83d', rug: '#6a5a3c', desk: { x: -520, z: -120, w: 240, d: 150, divider: true } },
  { id: 'eng', label: 'Tim Engineering', color: '#5b8def', rug: '#3c4f73', desk: { x: 480, z: -120, w: 360, d: 150, divider: true } },
  { id: 'qa', label: 'Tim Kualitas & Keamanan · SOC', color: '#ef6a3c', rug: '#5a3a3e', desk: { x: 0, z: 360, w: 240, d: 120, divider: false } },
  { id: 'data', label: 'Tim Data', color: '#2fb5c9', rug: '#2f5058', desk: { x: 560, z: 380, w: 240, d: 150, divider: false } },
  { id: 'pmo', label: 'PMO · Project Manager', color: '#b28dff', rug: '#4a3f63', desk: { x: -560, z: 380, w: 200, d: 100, divider: false } },
  { id: 'ops', label: 'Operasional', color: '#2fb5c9' },
  { id: 'tamu', label: 'Tamu', color: '#8a90a0' },
];

type AgentSeed = Omit<Agent, 'match'>;

const SEEDS: AgentSeed[] = [
  { id: 'hendra', name: 'Hendra', role: 'CEO', short: 'CEO', dept: 'pimpinan', animal: 'lion', tool: 'Claude Code',
    shirt: '#2c3550', pants: '#262c3f', shoe: '#3a2a20', accessories: { tie: true }, seat: { room: 'ceo' },
    quips: ['Angka Q3 bagus sekali!'] },
  { id: 'rina', name: 'Rina', role: 'CTO', short: 'CTO', dept: 'pimpinan', animal: 'owl', tool: 'Claude Code',
    shirt: '#5d50a8', pants: '#2b2f3a', shoe: '#2b2e35', accessories: { glasses: true }, seat: { room: 'cto' },
    quips: ['Arsitekturnya aman, lanjut!'] },
  { id: 'ayu', name: 'Ayu', role: 'Scrum Master', short: 'Scrum', dept: 'produk', animal: 'rabbit', tool: 'Claude Code',
    shirt: '#e2668f', pants: '#2f3542', shoe: '#f5b83d', seat: { pod: 'produk', side: 'b', offset: -60 },
    quips: ['Ayo stand-up dulu, 5 menit!'] },
  { id: 'sari', name: 'Sari', role: 'UI/UX Designer', short: 'UI/UX', dept: 'produk', animal: 'cat', tool: 'Claude Code',
    shirt: '#3fb0c9', pants: '#3a3f4f', shoe: '#ffffff', accessories: { beret: true }, seat: { pod: 'produk', side: 'b', offset: 60 },
    quips: ['Tombolnya kurang bulat…'] },
  { id: 'laras', name: 'Laras', role: 'Business Analyst', short: 'Analis', dept: 'produk', animal: 'fox', tool: 'Claude Code',
    shirt: '#9a63c4', pants: '#2f3542', shoe: '#e2668f', seat: { pod: 'produk', side: 'f', offset: -60 },
    quips: ['User story-nya beres!'] },
  { id: 'dimas', name: 'Dimas', role: 'Product Owner', short: 'PO', dept: 'produk', animal: 'bear', tool: 'Claude Code',
    shirt: '#f0b33f', pants: '#3a4a68', shoe: '#2b2e35', seat: { pod: 'produk', side: 'f', offset: 60 },
    quips: ['Yang paling penting dulu ya.'] },
  { id: 'raka', name: 'Raka', role: 'Backend Developer', short: 'Backend', dept: 'eng', animal: 'panda', tool: 'Claude Code',
    shirt: '#4a78d6', pants: '#3a4a68', shoe: '#ef6a3c', seat: { pod: 'eng', side: 'b', offset: 0 },
    quips: ['Satu bug lagi, janji!'] },
  { id: 'bima', name: 'Bima', role: 'Solution Architect', short: 'Arsitek', dept: 'eng', animal: 'koala', tool: 'Claude Code',
    shirt: '#2f9f8c', pants: '#2f3542', shoe: '#2b2e35', accessories: { phones: '#f5b83d' }, seat: { pod: 'eng', side: 'b', offset: -120 },
    quips: ['Diagram SSO hampir jadi!'] },
  { id: 'dewi', name: 'Dewi', role: 'Web Developer', short: 'Web', dept: 'eng', animal: 'hamster', tool: 'Codex',
    shirt: '#ee8a3a', pants: '#33384a', shoe: '#ffffff', accessories: { phones: '#e2668f' }, seat: { pod: 'eng', side: 'b', offset: 120 },
    quips: ['Dasbornya cantik kan?'] },
  { id: 'agus', name: 'Agus', role: 'Android Developer', short: 'Android', dept: 'eng', animal: 'frog', tool: 'Claude Code',
    shirt: '#3ddc84', pants: '#2f3542', shoe: '#2b2e35', seat: { pod: 'eng', side: 'f', offset: -60 },
    quips: ['Gradle-nya masih build…'] },
  { id: 'nina', name: 'Nina', role: 'iOS Developer', short: 'iOS', dept: 'eng', animal: 'penguin', tool: 'Codex',
    shirt: '#e9e9ee', pants: '#2b2f3a', shoe: '#5b8def', seat: { pod: 'eng', side: 'f', offset: 60 },
    quips: ['Mode gelapnya sudah rapi!'] },
  { id: 'yoga', name: 'Yoga', role: 'QA Engineer', short: 'QA', dept: 'qa', animal: 'dog', tool: 'Codex',
    shirt: '#7fb547', pants: '#3a4a68', shoe: '#5b8def', accessories: { cap: '#ef6a3c' }, seat: { pod: 'qa', side: 'f', offset: 60 },
    quips: ['Lho, kok tesnya merah?'] },
  { id: 'fajar', name: 'Fajar', role: 'DevSecOps', short: 'DevSecOps', dept: 'qa', animal: 'raccoon', tool: 'Claude Code',
    shirt: '#c4483e', pants: '#2b2f3a', shoe: '#2b2e35', accessories: { hood: true }, seat: { pod: 'qa', side: 'f', offset: -60 },
    quips: ['Ada CVE! Tahan dulu rilisnya.'] },
  { id: 'wulan', name: 'Wulan', role: 'Project Manager · PMO Lead', short: 'PM', dept: 'pmo', animal: 'elephant', tool: 'Claude Code',
    shirt: '#b28dff', pants: '#2f3542', shoe: '#2b2e35', seat: { pod: 'pmo', side: 'b', offset: 0 },
    quips: ['Timeline masih aman, tapi…'] },
  { id: 'andi', name: 'Andi', role: 'Tech Lead', short: 'Tech Lead', dept: 'eng', animal: 'wolf', tool: 'Claude Code',
    shirt: '#2b3a55', pants: '#2f3542', shoe: '#2b2e35', accessories: { glasses: true }, seat: { pod: 'eng', side: 'e', offset: 0 },
    quips: ['PR-nya sudah saya review.'] },
  { id: 'dodi', name: 'Dodi', role: 'Data Engineer', short: 'Data Eng', dept: 'data', animal: 'beaver', tool: 'Claude Code',
    shirt: '#2f8a9a', pants: '#3a4a68', shoe: '#f5b83d', seat: { pod: 'data', side: 'b', offset: -60 },
    quips: ['Pipeline-nya hijau semua!'] },
  { id: 'mega', name: 'Mega', role: 'Data Analyst', short: 'Analis Data', dept: 'data', animal: 'sheep', tool: 'Codex',
    shirt: '#e07a5f', pants: '#2f3542', shoe: '#ffffff', seat: { pod: 'data', side: 'b', offset: 60 },
    quips: ['Utilisasi naik 12%!'] },
  { id: 'udin', name: 'Udin', role: 'Office Boy · Pembersih Cache', short: 'OB', dept: 'ops', animal: 'monkey', tool: 'Claude Code',
    shirt: '#2fb5c9', pants: '#2b2f3a', shoe: '#f5b83d', accessories: { cap: '#1f6f8b' }, walker: true,
    quips: ['Permisi, bersih-bersih dulu!'] },
];

/** Every agent can be targeted out of the box with V_OFF_AGENT=<id>. */
export const DEFAULT_AGENTS: Agent[] = SEEDS.map((a) => ({ ...a, match: [{ env: `V_OFF_AGENT=${a.id}` }] }));

export function defaultConfig(): Config {
  return structuredClone({
    version: 1,
    agents: DEFAULT_AGENTS,
    departments: DEFAULT_DEPARTMENTS,
    // Prices are user-editable and intentionally empty: never hard-code prices (SPEC §10).
    pricing: {},
    sources: {
      claudeCode: { enabled: true },
      codex: { enabled: false },
      gemini: { enabled: false },
      webhook: { enabled: true },
    },
    rules: { workWindowSec: 90, idleAfterSec: 600 },
    ambience: { socialEvents: true, animations: true, blockedSound: false },
    cleaner: { intervalMin: 15, logPaths: [] },
  } satisfies Config);
}
