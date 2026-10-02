# v-off — Kantor Virtual untuk AI Agent

v-off menampilkan aktivitas AI coding agent (Claude Code; Codex dan Gemini CLI menyusul) sebagai
**kantor virtual 3D** di browser. Setiap agent adalah karakter hewan di meja timnya. Statusnya terlihat
langsung: bekerja, terblokir, memimpin rapat, menyimak, atau istirahat di ruang santai.

Semua berjalan **lokal**: server hanya mendengar di `127.0.0.1`, data dibaca dari komputer Anda, tidak ada
telemetri, dan tidak ada request ke internet saat aplikasi berjalan.

## Mulai cepat

Butuh Node.js 18 atau lebih baru.

```bash
npx v-off setup   # pasang hooks Claude Code (sekali saja)
npx v-off         # jalankan server dan buka http://127.0.0.1:4747
```

Lalu buka sesi Claude Code seperti biasa. Sesi muncul di Ruang Tim dalam hitungan detik.

Tanpa `setup` pun v-off tetap membaca transkrip di `~/.claude/projects/`, tapi status izin (Terblokir) dan
pembaruan per aksi paling cepat lewat hooks.

## Apa yang dipasang `v-off setup`

- `~/.v-off/hook.mjs`: skrip kecil tanpa dependensi. Membaca JSON hook dari stdin dan mengirimnya ke
  `POST http://127.0.0.1:4747/api/hook`. Tidak pernah mencetak apa pun dan selalu selesai dalam ±2 detik.
- Entri `hooks` di `~/.claude/settings.json` untuk event `SessionStart`, `UserPromptSubmit`, `PreToolUse`,
  `PostToolUse`, `PostToolUseFailure`, `PermissionRequest`, `Notification`, `Stop`, `StopFailure`,
  `SubagentStop`, dan `SessionEnd`. Semuanya `type: "command"` dengan `async: true`, jadi Claude Code
  tidak pernah menunggu v-off dan tidak ada pesan galat saat v-off sedang mati.
- Sebelum menulis, `settings.json` lama dicadangkan ke `settings.json.v-off-backup-<waktu>`. Hook lain milik
  Anda tidak disentuh. Menjalankan `setup` dua kali aman (idempoten).

```bash
npx v-off setup --dry-run   # lihat hasil tanpa menulis
npx v-off setup --remove    # copot hooks v-off dan skripnya
npx v-off setup --port 5000 # kalau server dijalankan di port lain
```

## Memetakan sesi ke agent

Sesi Claude Code dicocokkan ke agent dengan aturan di **Pengaturan → Daftar agent → Detail**, dicek berurutan:

```
folder: ~/work/pmo-portal/**      # folder kerja sesi (glob)
branch: feat/timesheet-*          # git branch
env: V_OFF_AGENT=raka             # variabel lingkungan saat menjalankan claude
sesi: nama-sesi                   # nama sesi
```

Cara paling cepat: `V_OFF_AGENT=raka claude`. Sesi yang tidak cocok tampil sebagai "Agent tanpa nama";
tetapkan foldernya ke agent dari Pengaturan → Sesi tanpa agent.

## Halaman

- **Ruang Tim** (`/`): kantor 3D, filter status, feed aktivitas, panel detail agent ("Tandai sudah
  ditangani", "Istirahat & main", ringkasan sesi, salin `claude --resume <sesi>`).
- **Laporan** (`/laporan`): sesi, tingkat sukses, estimasi biaya, token, dan hambatan per agent,
  departemen, dan periode, plus kartu pos akhir hari (PNG).
- **Pengaturan Tim** (`/pengaturan`): agent, departemen, sumber data, harga model, aturan status,
  pembersih cache, suasana. Tersimpan ke `~/.v-off/config.json`.

## Biaya

Biaya adalah **estimasi**: token × harga per model di Pengaturan → Harga model (US$ per 1 juta token).
v-off tidak menyertakan harga bawaan; isi sesuai harga resmi yang berlaku. Model yang terdeteksi tanpa harga
ditampilkan di sana.

## Office boy (Udin)

Udin menghitung ukuran cache yang bisa dibersihkan: `node_modules/.cache` dan `.next/cache` di folder sesi,
`~/.npm/_cacache`, cache Playwright, folder `claude-*` di temp, dan file `*.log` > 7 hari di folder yang Anda
tentukan. Versi ini **hanya menghitung (dry-run)**: tidak ada file yang dihapus.

## Webhook untuk tool lain

```bash
curl -X POST http://127.0.0.1:4747/api/status \
  -H 'content-type: application/json' \
  -d '{"agentId":"yoga","status":"macet","task":"Tes gagal: 3 dari 48","detail":"Cek timesheet.spec.ts"}'
```

Status: `kerja`, `macet`, `bicara`, `simak`, `idle`, `bersih`.

## API lokal

```
GET  /api/state              GET  /api/stream (SSE)
POST /api/hook               POST /api/status
POST /api/agents/:id/resolve POST /api/agents/:id/idle  {idle}
GET  /api/agents/:id/log     GET  /api/sessions/:id
GET  /api/report?period=day|week|month
GET  /api/config             PUT  /api/config
GET  /api/models             POST /api/cleaner/clean (belum tersedia, 501)
```

Request dari halaman web lain (Origin asing) dan Host selain localhost ditolak.

## Privasi

- Isi prompt tidak pernah disimpan atau ditampilkan; hanya panjangnya. Aksi diringkas (nama file, perintah,
  maks 160 karakter).
- File yang ditulis v-off: `~/.v-off/config.json`, `~/.v-off/history.json` (riwayat hambatan 31 hari),
  `~/.v-off/hook.mjs`, dan entri hooks di `~/.claude/settings.json`.

## Variabel lingkungan

| Variabel | Default | Fungsi |
|---|---|---|
| `V_OFF_PORT` | `4747` | Port server (juga dibaca skrip hook) |
| `V_OFF_HOST` | `127.0.0.1` | Alamat bind |
| `V_OFF_HOME` | `~/.v-off` | Folder config dan riwayat |
| `V_OFF_NO_OPEN` | – | Jangan buka browser otomatis |
| `CLAUDE_CONFIG_DIR` | `~/.claude` | Folder Claude Code |
| `V_OFF_AGENT` | – | Tetapkan sesi Claude Code ke agent tertentu |

## Masalah umum

- **Agent tidak muncul**: pastikan `npx v-off setup` sudah dijalankan dan sesi Claude Code dimulai *setelah*
  itu. Cek `~/.claude/settings.json` berisi entri dengan `--v-off-hook`.
- **Port dipakai**: `npx v-off --port 5000`, lalu `npx v-off setup --port 5000`.
- **3D tidak tampil**: browser perlu WebGL. Panel, filter, dan laporan tetap jalan.

## Pengembangan

```bash
npm install
npm run dev        # server (tsx watch, :4747) + Vite UI (:5173, proxy /api)
npm test           # vitest
npm run typecheck
npm run build      # dist/server + dist/web
```

Panduan kontribusi dan arsitektur: `CLAUDE.md`. Spesifikasi: `docs/SPEC.md`. Desain: `design/`.
