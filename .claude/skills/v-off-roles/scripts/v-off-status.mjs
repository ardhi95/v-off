#!/usr/bin/env node
// Lapor status satu peran ke v-off lewat webhook POST /api/status (SPEC §5.4).
// Pemakaian: node v-off-status.mjs <agentId> <kerja|macet|bicara|simak|idle|bersih> ["tugas singkat"] ["detail"]
// Tanpa dependensi. Tidak pernah gagal keras: jika v-off tidak berjalan, keluar dengan kode 0.
// Privasi: kirim hanya ringkasan aksi (nama file, nama tugas), jangan isi prompt atau kode.
import http from 'node:http';

const STATUSES = ['kerja', 'macet', 'bicara', 'simak', 'idle', 'bersih'];
const [agentId, status, task, detail] = process.argv.slice(2);

if (!agentId || !STATUSES.includes(status)) {
  console.error(`Pemakaian: v-off-status.mjs <agentId> <${STATUSES.join('|')}> [tugas] [detail]`);
  process.exit(2);
}

const body = JSON.stringify({ agentId, status, task: task?.slice(0, 120), detail: detail?.slice(0, 240) });
const req = http.request(
  {
    host: process.env.V_OFF_HOST || '127.0.0.1',
    port: Number(process.env.V_OFF_PORT) || 4747,
    path: '/api/status',
    method: 'POST',
    headers: { 'content-type': 'application/json', 'content-length': Buffer.byteLength(body) },
    timeout: 1500,
  },
  (res) => {
    res.resume();
    res.on('end', () => {
      if (res.statusCode === 404) console.error(`v-off: agent "${agentId}" tidak ditemukan (cek Pengaturan).`);
      process.exit(0);
    });
  },
);
req.on('error', () => process.exit(0));
req.on('timeout', () => {
  req.destroy();
  process.exit(0);
});
req.end(body);
