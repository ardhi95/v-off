# Spesifikasi v-off v1

## 1. Tujuan

Memberi PMO dan tim cara cepat dan menyenangkan untuk melihat **apa yang sedang dikerjakan setiap AI agent**, **siapa yang terblokir**, dan **berapa biayanya**, semuanya dalam satu kantor virtual 3D yang berjalan lokal.

## 2. Pengguna & skenario utama

- **PM / PMO Lead**: membuka v-off di layar kedua. Sekilas tahu agent mana yang terblokir, lalu klik untuk melihat penyebabnya.
- **Tech Lead**: memantau agent engineering dan menandai hambatan yang sudah ditangani.
- **Direksi**: melihat Laporan mingguan (biaya, sesi, tingkat sukses) dan kartu pos akhir hari.

## 3. Layar & fitur

### 3.1 Ruang Tim (layar utama), lihat `Main.dc.html`

- Kanvas 3D, sekitar 21 × 22 m:
  - Ruang CEO dan CTO (dinding kaca, papan nama pintu).
  - Area presentasi dengan TV papan sprint.
  - 5 meja tim kotak: Produk, Engineering (dengan Tech Lead di ujung), Kualitas & Keamanan (SOC dengan dinding 6 monitor, rak server, firewall, sirene, CCTV, perangkat uji QA), Data (tumpukan database), dan PMO (papan Gantt dan lampu risiko).
  - Ruang santai: pingpong, foosball, 2 arcade, sofa + TV + konsol, bean bag, dan pantry (mesin kopi, kursi bar, kulkas).
- Setiap agent adalah **karakter hewan** (lihat tabel §4.3) dengan baju warna agent, aksesori peran, ekspresi sesuai status, dan ekor.
- Label nama melayang (avatar inisial, nama, peran singkat, titik status). Klik label atau karakter untuk memilih.
- Cincin lantai di bawah kursi berwarna status. Agent terpilih bercincin kuning.
- Layar laptop/monitor menyala sesuai status, dan mati saat agent pergi istirahat.
- Kamera: seret = putar, scroll = zoom. Preset: Seluruh kantor, Meja tim, Pusat keamanan, Ruang CEO, Ruang CTO, Ruang santai, Tampak atas. Ada juga tombol putar, zoom, dan putar otomatis.
- Filter chip: Semua / Bekerja / Terblokir / Rapat & menyimak / Istirahat. Agent yang tidak cocok diredupkan, tidak disembunyikan.
- Feed "Aktivitas terbaru" berisi 6–10 event terakhir.
- Gelembung celetukan acak tiap ±3,6 detik: satu agent, tampil 2,8 detik. Teksnya dari konfigurasi per agent, dan khusus per tempat bermain saat istirahat.

### 3.2 Panel detail agent

Berisi:

- Avatar, nama, peran, departemen, status, tool, spesies, dan lokasi.
- Kotak peringatan untuk agent terblokir: alasan, petunjuk, dan tombol **Tandai sudah ditangani**.
- Tugas saat ini, repo, dan progres.
- Token hari ini, biaya, dan durasi sesi.
- Log aktivitas (jenis: Baca, Edit, Jalankan, Cari, Galat, Rapat, Info, Hapus).

Tombol aksi:

- **Lihat sesi lengkap**: membuka transkrip dalam bentuk ringkasan.
- **Kirim pesan**: v1 cukup menyalin perintah `claude --resume <session>` ke clipboard.
- **Arahkan kamera**
- **Istirahat & main** / **Kembali bekerja**

### 3.3 Laporan, lihat `Laporan.dc.html`

- Periode: Hari ini / 7 hari / 30 hari.
- KPI: total sesi, tingkat sukses, biaya, token, dan hambatan.
- Tabel per agent yang bisa diurutkan (sesi, sukses, biaya) dengan bar porsi biaya.
- Grafik aktivitas per jam, hari, atau minggu, serta rincian per departemen.
- Kartu pos akhir hari yang bisa diunduh sebagai PNG.

### 3.4 Pengaturan Tim, lihat `Pengaturan.dc.html`

- Edit agent: nama, peran, departemen, tool, warna baju, spesies hewan, dan tampil/sembunyi.
- Tambah atau ganti nama departemen dan warnanya.
- Sumber data (aktif/nonaktif + path): Claude Code, Codex CLI, Gemini CLI, dan webhook.
- Suasana: acara sosial, animasi, suara notifikasi saat terblokir.
- Simpan dan batalkan, dengan indikator perubahan yang belum disimpan.

## 4. Model data

### 4.1 Agent

```ts
type Status = 'kerja' | 'macet' | 'bicara' | 'simak' | 'idle' | 'bersih';
interface Agent {
  id: string; name: string; role: string; short: string;
  dept: string;                       // id departemen
  animal: Species; shirt: string; pants?: string; shoe?: string;
  accessories?: { tie?: boolean; glasses?: boolean; phones?: string; beret?: boolean; cap?: string; hood?: boolean };
  seat: { pod: string; side: 'b' | 'f' | 'e'; offset: number } | { room: 'ceo' | 'cto' };
  tool: 'Claude Code' | 'Codex' | 'Gemini CLI' | string;
  match: MatchRule[];                 // pemetaan ke sesi, lihat §7
  quips?: string[];
  walker?: boolean;                   // office boy
}
```

### 4.2 Departemen dan meja

`{ id, label, color, rug, desk: { x, z, w, d, divider } }`. Nilai default ada di `this.PODS` pada mockup.

### 4.3 Daftar agent awal (dari mockup)

| Agent | Peran | Departemen | Hewan |
|---|---|---|---|
| Hendra | CEO | Pimpinan (Ruang CEO) | Singa |
| Rina | CTO | Pimpinan (Ruang CTO) | Burung hantu |
| Wulan | Project Manager · PMO Lead | PMO | Gajah |
| Dimas | Product Owner | Produk | Beruang |
| Ayu | Scrum Master | Produk | Kelinci |
| Laras | Business Analyst | Produk | Rubah |
| Sari | UI/UX Designer | Produk | Kucing |
| Andi | Tech Lead | Engineering | Serigala |
| Bima | Solution Architect | Engineering | Koala |
| Raka | Backend Developer | Engineering | Panda |
| Dewi | Web Developer | Engineering | Hamster |
| Agus | Android Developer | Engineering | Katak |
| Nina | iOS Developer | Engineering | Pinguin |
| Dodi | Data Engineer | Data | Berang-berang |
| Mega | Data Analyst | Data | Domba |
| Yoga | QA Engineer | Kualitas & Keamanan | Anjing |
| Fajar | DevSecOps | Kualitas & Keamanan | Rakun |
| Udin | Office Boy · Pembersih Cache | Operasional | Monyet |

### 4.4 Event (dinormalisasi dari semua sumber)

```ts
interface AgentEvent {
  ts: number; agentId: string; sessionId: string; source: 'claude-code' | 'codex' | 'gemini' | 'webhook';
  kind: 'read' | 'edit' | 'run' | 'search' | 'error' | 'message' | 'stop' | 'notify' | 'prompt';
  detail: string;                     // ringkas: path file / perintah / pesan galat (maks 160 karakter)
  usage?: { input: number; output: number; cacheRead: number; cacheWrite: number; model?: string };
}
```

## 5. Sumber data

Format dan lokasi di bawah perlu **diverifikasi terhadap dokumentasi resmi terbaru** sebelum diimplementasikan.

1. **Hooks Claude Code**: `npx v-off setup` menambahkan hook di `~/.claude/settings.json` yang mengirim payload JSON hook (dari stdin) ke `POST http://127.0.0.1:4747/api/hook`. Event yang dipakai: `SessionStart`, `UserPromptSubmit`, `PreToolUse`, `PostToolUse`, `Notification`, `Stop`, `SubagentStop`, dan `SessionEnd`. Setup harus idempoten, menyimpan backup settings, dan menyediakan `npx v-off setup --remove`.
2. **Transkrip Claude Code** (JSONL di `~/.claude/projects/`): dibaca dengan file watcher untuk riwayat, token (`usage`), dan pemulihan saat server baru jalan.
3. **Codex CLI** (`~/.codex/sessions/`) dan **Gemini CLI**: parser terpisah di balik antarmuka `SourceAdapter`.
4. **Webhook umum** `POST /api/status` `{ agentId, status, task?, detail? }`: untuk CI, skrip, atau tool lain.

## 6. Aturan status (bisa dikonfigurasi)

| Status | Kapan |
|---|---|
| `kerja` (Bekerja) | Ada tool use atau pesan dalam 90 detik terakhir |
| `macet` (Terblokir) | `Notification` meminta izin atau input; atau galat terakhir cocok dengan pola: tes gagal, `rate limit`, `usage limit`, `API Error`, build gagal. Simpan alasan dan petunjuknya |
| `bicara` (Memimpin rapat) | Agent sedang menjalankan subagent atau orkestrasi (ada event `SubagentStop` atau tool `Task` aktif) |
| `simak` (Menyimak) | Sesi aktif tetapi menunggu prompt pengguna (`Stop` < 10 menit) |
| `idle` (Istirahat) | Tidak ada aktivitas ≥ 10 menit, atau di-set manual. Karakter pindah ke ruang santai |
| `bersih` | Khusus office boy |

**Sesi tanpa hooks** (hanya transkrip; aturan ditiru dari virtual-agents-office):

- Pesan asisten dengan `stop_reason: end_turn` tanpa tool call = `Stop` (Menyimak, lalu Istirahat setelah 10 menit).
- Tool `AskUserQuestion` / `ExitPlanMode` yang belum dijawab = `macet` "Ada pertanyaan untuk Anda".
- Tool yang masih terbuka dan transkrip diam ≥ 90 detik (tanpa subagent aktif) = `macet` "Mungkin menunggu izin".
  Tebakan ini tidak dihitung sebagai hambatan di Laporan, karena perintah yang lama terlihat sama.
- Semua tebakan dari transkrip hilang sendiri setelah 30 menit tanpa aktivitas, supaya sesi yang ditinggal tidak
  terblokir selamanya. Sesi yang punya hooks memakai event hooks, bukan tebakan ini.

"Tandai sudah ditangani" mengubah `macet` menjadi `kerja` sampai ada galat baru. Override manual "Istirahat & main" berlaku sampai ada aktivitas baru atau tombol "Kembali bekerja" ditekan.

### 6.1 Kantor off (limit habis)

- Pemicu: pesan batas pemakaian akun dari Claude Code, di transkrip (`isApiErrorMessage`) atau di hook `StopFailure`.
  Contoh: `Claude AI usage limit reached|<epoch>`, `5-hour limit reached ∙ resets 3pm`, `You've hit your limit · resets 3pm (Asia/Jakarta)`.
  Rate limit biasa (`Rate limit exceeded`) tidak memicu.
- Selama off, `GET /api/state` berisi `limit: { since, resetsAt?, until, reason, agentId }` dan SSE mengirim `limit-updated`.
- Selesai saat: `until` tercapai (waktu reset, atau `since` + 5 jam bila tidak ada), Notification `quota_auto_resume_fired`,
  balasan model setelah `since` (tool use, token), atau `POST /api/limit/clear`.
- Tampilan: semua agent berjalan ke **Asrama** (ruangan di kiri kantor, pintu di dinding kiri, 20 kamar dengan kasur, meja
  lampu, dan lampu tidur) lalu tidur telentang berselimut warna baju, mata terpejam, label "Zzz". Status asli agent tetap
  dihitung; panel menampilkan "Tidur · limit habis".

## 7. Pemetaan agent ↔ sesi

Setiap agent punya `match: MatchRule[]` yang dievaluasi berurutan:

- `{ cwdGlob: "~/work/pmo-portal/**" }`
- `{ gitBranch: "feat/timesheet-*" }`
- `{ env: "V_OFF_AGENT=raka" }`: hook bisa meneruskan variabel ini
- `{ sessionName: "..." }`

Daftar agent adalah **katalog peran**, bukan staf wajib. Sesi yang tidak cocok dengan aturan di atas
diklasifikasikan ke peran terdekat yang ada di katalog (dan aktif), berurutan:

1. Peran yang disebut di sesi: `/v-off-roles <id|peran>` atau "sebagai <peran>".
2. Skor jejak kerja tertinggi dari path file dan perintah (mis. `.kt` → Android, Dockerfile → DevSecOps, file
   tes → QA). Sesi baru pindah peran hanya jika peran lain unggul 1,5×.
3. Cadangan: Tech Lead untuk sesi kode, Project Manager untuk sesi tanpa kode, lalu agent pertama mana pun.

Klasifikasi berjalan lokal dengan kata kunci; isi prompt hanya dipindai dan tidak disimpan. Ruang Tim hanya
menampilkan peran yang punya sesi (30 hari terakhir) atau status webhook, ditambah office boy. Tamu "Agent tanpa
nama" hanya muncul jika katalog tidak punya peran aktif sama sekali. Pengguna tetap bisa memaksa pemetaan lewat
aturan `match` di Pengaturan.

## 8. Office boy (Udin), pembersih cache

- v1 berjalan **dry-run**. Secara berkala (default 15 menit) server menghitung ukuran folder di allowlist: `node_modules/.cache`, `~/.npm/_cacache`, `.next/cache`, folder cache Playwright, `/tmp` milik sesi agent, dan log lebih dari 7 hari di path yang dikonfigurasi.
- Rute animasi Udin mengunjungi meja agent yang punya cache terbesar. Label menampilkan "Membersihkan <nama cache> · <ukuran>", dan total "bisa dibersihkan" tampil di panel detail.
- Penghapusan nyata hanya terjadi lewat tombol di panel Udin. Tombol itu menampilkan daftar dan total, lalu meminta **konfirmasi**, dan hanya menyentuh path di allowlist.

## 9. API (server lokal, port default 4747)

```
GET  /api/state              -> { agents, departments, events(last 50), cleaner }
GET  /api/stream             -> SSE: agent-updated, event-added, cleaner-updated, limit-updated
POST /api/hook               <- payload hook Claude Code
POST /api/status             <- webhook umum
GET  /api/agents/:id/sessions -> sesi agent (aktif dulu) untuk tab Percakapan; riwayat per sesi: GET /api/sessions/:id
POST /api/agents/:id/resolve -> tandai hambatan ditangani
POST /api/agents/:id/idle    {idle: boolean}
GET  /api/report?period=day|week|month
GET  /api/config  PUT /api/config
POST /api/cleaner/clean      {paths[], confirm: true}
POST /api/limit/clear        -> buka kantor sebelum limit reset (§6.1)
```

## 10. Laporan & biaya

- Biaya = token × tabel harga per model. Tabel harga ada di config dan bisa diedit. Jangan hard-code harga; tampilkan "estimasi".
- Sukses = sesi yang berakhir tanpa galat yang belum ditangani.
- Hambatan = jumlah transisi ke `macet`.

## 11. Non-fungsional

- Berjalan di Chrome, Edge, Safari, dan Firefox terbaru. 18 agent tetap ≥ 50 fps di laptop biasa. Pilih ulang agent < 50 ms, dengan geometri karakter yang di-cache dan hanya cincin yang dibangun ulang.
- Tanpa koneksi internet setelah instalasi (font di-bundle).
- `prefers-reduced-motion`: hentikan animasi berjalan dan bermain, dan kamera tidak bergerak otomatis.
- Layout responsif. Di layar < 1100px, panel detail turun ke bawah kanvas.

## 12. Kriteria penerimaan v1

1. `npx v-off` membuka browser ke Ruang Tim, dan sesi Claude Code yang aktif muncul sebagai agent dalam ≤ 3 detik setelah ada aktivitas.
2. Ketika Claude Code meminta izin, karakter agent tersebut berubah jadi Terblokir (ekspresi cemas, cincin oranye) dan panel menampilkan alasannya.
3. Setelah 10 menit tanpa aktivitas, karakter pindah ke ruang santai dan bermain. Saat ada aktivitas baru, ia kembali ke mejanya.
4. Laporan menampilkan token dan biaya yang cocok (±1%) dengan total dari transkrip untuk periode yang sama.
5. Perubahan di Pengaturan tersimpan ke `~/.v-off/config.json` dan langsung terlihat di Ruang Tim.
6. Tidak ada request jaringan keluar saat aplikasi berjalan (periksa di DevTools).
7. Office boy tidak pernah menghapus file tanpa konfirmasi eksplisit.

## 13. Di luar cakupan v1

Multi-pengguna/remote viewing, autentikasi, mengirim pesan langsung ke sesi agent, dan model 3D buatan desainer (bisa menggantikan karakter primitif nanti).
