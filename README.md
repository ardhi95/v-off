# v-off — Virtual Agent Office

Kantor virtual 3D lokal untuk memantau AI coding agent (Claude Code, Codex, Gemini CLI).
Lihat `CLAUDE.md` (panduan kerja) dan `docs/SPEC.md` (spesifikasi).

## Status

Fase 1 (kerangka & data) selesai: server lokal, pembacaan transkrip Claude Code,
endpoint hook, REST dan SSE, aturan status, serta pemetaan agent. UI 3D menyusul di Fase 2.

## Menjalankan

```bash
npm install
npm run dev          # server di http://127.0.0.1:4747
npm test
```

## API (127.0.0.1:4747)

```
GET  /api/state              GET  /api/stream (SSE)
POST /api/hook               POST /api/status
POST /api/agents/:id/resolve POST /api/agents/:id/idle  {idle}
GET  /api/agents/:id/log     GET  /api/report?period=day|week|month
GET  /api/config             PUT  /api/config
POST /api/cleaner/clean      (dry-run di v1, belum tersedia)
```

Contoh mengirim hook secara manual, dengan agent dipilih lewat `?agent=`:

```bash
curl -X POST 'http://127.0.0.1:4747/api/hook?agent=raka' \
  -d '{"session_id":"abc","hook_event_name":"PreToolUse","tool_name":"Bash","tool_input":{"command":"npm test"}}'
```
