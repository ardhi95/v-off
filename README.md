# v-off — Virtual Agent Office

Kantor virtual 3D lokal untuk memantau AI coding agent (Claude Code, Codex, Gemini CLI).
Lihat `CLAUDE.md` (panduan kerja) dan `docs/SPEC.md` (spesifikasi).

## Status

- Fase 1 (kerangka & data): server lokal, pembacaan transkrip Claude Code, endpoint hook,
  REST dan SSE, aturan status, serta pemetaan agent.
- Fase 2 (Ruang Tim 3D): kantor 3D sesuai mockup, karakter hewan dengan ekspresi per status,
  label nama, kamera orbit dengan preset, data live lewat SSE.
- Fase 3 (Interaksi): panel detail agent, filter status, feed aktivitas, "Tandai sudah ditangani",
  "Istirahat & main" / "Kembali bekerja", ringkasan sesi, salin perintah `claude --resume`.
- Fase 4 (Perilaku hidup): agent berjalan antara meja dan ruang santai, office boy berhenti di area
  dengan cache terbesar (pindai dry-run, tidak ada file dihapus), gelembung celetukan.
- Fase 5 (Laporan): `/laporan` dengan KPI, scorecard per agent, grafik sesi per jam/hari/minggu,
  rincian per departemen, dan kartu pos akhir hari (unduh PNG). Biaya = estimasi dari tabel harga di config.

## Menjalankan

```bash
npm install
npm run dev          # server :4747 + UI dev di http://127.0.0.1:5173
npm run build && npm start   # UI hasil build di http://127.0.0.1:4747
npm test
```

## API (127.0.0.1:4747)

```
GET  /api/state              GET  /api/stream (SSE)
POST /api/hook               POST /api/status
POST /api/agents/:id/resolve POST /api/agents/:id/idle  {idle}
GET  /api/agents/:id/log     GET  /api/sessions/:id
GET  /api/report?period=day|week|month
GET  /api/config             PUT  /api/config
POST /api/cleaner/clean      (dry-run di v1, belum tersedia)
```

Contoh mengirim hook secara manual, dengan agent dipilih lewat `?agent=`:

```bash
curl -X POST 'http://127.0.0.1:4747/api/hook?agent=raka' \
  -d '{"session_id":"abc","hook_event_name":"PreToolUse","tool_name":"Bash","tool_input":{"command":"npm test"}}'
```
