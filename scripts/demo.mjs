// Kirim event hook palsu ke server lokal supaya kantor terisi untuk percobaan.
// Pakai: node scripts/demo.mjs [port]
const port = process.argv[2] ?? '4747';
const url = `http://127.0.0.1:${port}/api/hook`;
const post = (body) =>
  fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }).catch(() => {});
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const sessions = [
  { id: 'demo-1', cwd: '/Users/demo/work/pmo-portal' },
  { id: 'demo-2', cwd: '/Users/demo/work/billing-api' },
  { id: 'demo-3', cwd: '/Users/demo/work/mobile-app' },
];
const ev = (s, name, extra = {}) => post({ session_id: s.id, cwd: s.cwd, hook_event_name: name, ...extra });
const tool = (s, name, input, n) => ev(s, 'PreToolUse', { tool_name: name, tool_input: input, tool_use_id: `${s.id}-${n}` });
const done = (s, name, n) => ev(s, 'PostToolUse', { tool_name: name, tool_use_id: `${s.id}-${n}`, tool_result: { stdout: 'ok' } });

for (const s of sessions) await ev(s, 'SessionStart', { source: 'startup' });
for (const s of sessions) await ev(s, 'UserPromptSubmit', { prompt: 'kerjakan fitur timesheet' });

const [a, b, c] = sessions;
await tool(a, 'Edit', { file_path: `${a.cwd}/src/timesheet.ts` }, 1);
await tool(b, 'Bash', { command: 'npm test' }, 1);
await ev(c, 'PermissionRequest', { tool_name: 'Bash', tool_input: { command: 'rm -rf build' } });
console.log('Demo aktif: demo-1 bekerja, demo-2 menjalankan tes, demo-3 menunggu izin. Buka dashboard.');

await sleep(8000);
await done(a, 'Edit', 1);
await done(b, 'Bash', 1);
await ev(a, 'Stop');
await ev(b, 'PostToolUseFailure', { tool_name: 'Bash', tool_use_id: 'demo-2-2', error: 'Tests failed: 2 failing' });
console.log('demo-1 selesai, demo-2 error. Selesai.');
