# Changelog

## Belum dirilis

- Kantor off saat limit pemakaian habis: semua agent berjalan ke Asrama (ruangan baru di kiri kantor, 20 kamar) dan
  tidur sampai limit reset, kuota pulih, atau tombol "Buka kantor". `GET /api/state` mendapat `limit`, SSE
  `limit-updated`, dan endpoint `POST /api/limit/clear`.
- Renderer tidak lagi dibuat ulang (dan kamera tidak reset) setiap kali `/api/state` dimuat ulang.

## 0.1.0 — 2026-10-02

Rilis pertama.

- Ruang Tim 3D (port renderer mockup): 5 meja tim, ruang CEO/CTO, SOC, ruang santai, 18 karakter hewan
  dengan ekspresi per status, kamera orbit dengan preset.
- Data asli dari hooks Claude Code dan transkrip `~/.claude/projects/`; aturan status, pemetaan sesi ke
  agent, webhook `/api/status`, SSE.
- Panel detail agent, filter status, feed aktivitas, ringkasan sesi tanpa isi prompt.
- Perilaku hidup: agent berjalan ke ruang santai saat idle, office boy menghitung cache (dry-run),
  gelembung celetukan.
- Laporan: sesi, sukses, estimasi biaya, token, hambatan per agent/departemen/periode, kartu pos PNG.
- Pengaturan: agent, departemen, sumber data, harga model, aturan status, suasana.
- `npx v-off setup`: hooks Claude Code async (idempoten, dengan cadangan, `--remove`, `--dry-run`).

Belum tersedia: adapter Codex CLI dan Gemini CLI, penghapusan cache nyata, acara sosial.
