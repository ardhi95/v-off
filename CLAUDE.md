# v-off — Kantor Virtual untuk AI Agent

Panduan untuk Claude Code saat bekerja di repo ini. Baca file ini dulu, lalu `docs/SPEC.md`.

## Apa yang dibangun

**v-off** adalah aplikasi lokal yang menampilkan aktivitas AI coding agent (Claude Code, Codex, Gemini CLI) sebagai **kantor virtual 3D**. Setiap agent tampil sebagai karakter **hewan lucu** yang duduk di meja timnya. Statusnya terlihat langsung: bekerja, terblokir, memimpin rapat, menyimak, atau istirahat (bermain di ruang santai). Ada juga office boy (Udin) yang berkeliling "membersihkan cache".

Pemilik produk: Ardhi (PMO). Bahasa antarmuka: **Bahasa Indonesia**.

## Sumber kebenaran desain

Mockup yang sudah disetujui ada di `design/mockup/`. Lihat `design/README.md` untuk cara membacanya.

- `Main.dc.html`: Ruang Tim 3D, panel detail agent, filter status, dan feed aktivitas. **Paling penting.** Di dalamnya ada renderer WebGL buatan sendiri yang lengkap: tata letak lantai, furnitur, 18 karakter hewan, animasi office boy, dan ruang santai. Ini referensi visual dan perilaku.
- `Laporan.dc.html`: scorecard per agent, grafik aktivitas, rincian per departemen, dan kartu pos akhir hari.
- `Pengaturan.dc.html`: mengatur agent (nama, peran, departemen, tool, warna), departemen, sumber data, dan suasana kantor.

Format `.dc.html` memakai runtime templating khusus (`<x-dc>`, `{{hole}}`, `<sc-for>`, `<sc-if>`, kelas `Component extends DCLogic`). **Jangan menyalin runtime-nya.** Port markup dan logikanya ke stack aplikasi di bawah. Angka di mockup adalah **data contoh**. Aplikasi harus memakai data asli.

## Stack yang disarankan

- **Server**: Node.js ≥ 18 + TypeScript. Bind ke `127.0.0.1` secara default. Tanpa telemetri.
- **Frontend**: Vite + TypeScript + React (atau Preact) untuk UI. Untuk 3D boleh pilih:
  - (a) **three.js**: disarankan untuk jangka panjang. Bangun ulang geometri dari mockup (ellipsoid, tube, box, superellipse) memakai `SphereGeometry` + `scale`, `CapsuleGeometry`, `BoxGeometry`, `ExtrudeGeometry`, plus `MeshStandardMaterial`, bayangan, dan `CSS2DRenderer` untuk label nama.
  - (b) port langsung renderer WebGL dari `Main.dc.html` (kelas `kit()`, `buildStatic()`, `buildPeople()`, `animalHead()` dst). Lebih cepat, tapi lebih sulit dirawat.
- **Realtime**: Server-Sent Events (`/api/stream`) atau WebSocket.
- **Penyimpanan konfigurasi**: `~/.v-off/config.json` (agent, departemen, preferensi). Riwayat ringkas: SQLite (`better-sqlite3`) atau file JSON.
- CLI: `npx v-off` (jalankan server dan buka browser) dan `npx v-off setup` (pasang hooks Claude Code).

## Urutan kerja (fase)

Kerjakan fase demi fase. Commit di akhir tiap fase dengan tes yang lolos.

1. **Kerangka & data**: server, pembacaan log lokal, endpoint REST/SSE, dan model data (lihat SPEC §4–§6). Tes unit untuk parser log dan aturan status.
2. **Ruang Tim 3D**: tata letak lantai, meja tim, ruang CEO/CTO, SOC, dan ruang santai sesuai mockup. Karakter hewan dengan ekspresi per status. Kamera orbit beserta preset.
3. **Interaksi**: klik agent membuka panel detail, filter status, feed aktivitas, "Tandai sudah ditangani", serta "Istirahat & main" / "Kembali bekerja".
4. **Perilaku hidup**: agent idle pindah ke ruang santai, office boy berjalan di rute, dan gelembung celetukan.
5. **Laporan**: agregasi token, biaya, sesi, sukses, dan hambatan per agent/departemen/periode dari data asli. Ekspor kartu pos sebagai PNG.
6. **Pengaturan**: CRUD agent dan departemen, sumber data, dan preferensi. Simpan ke config.
7. **Setup & distribusi**: `npx v-off setup` untuk hooks Claude Code, README, dan rilis.

## Aturan penting

- **Privasi**: semua data dibaca lokal. Jangan mengirim isi log ke mana pun. Jangan menampilkan isi prompt penuh di UI, cukup ringkasan aksi (nama file, perintah).
- **Keamanan**: fitur "office boy pembersih cache" di v1 **hanya menampilkan** ukuran cache yang bisa dibersihkan (dry-run). Penghapusan nyata hanya boleh lewat aksi eksplisit pengguna dengan konfirmasi, dan hanya di daftar path yang diizinkan (lihat SPEC §8).
- Server tidak boleh menjalankan perintah shell berdasarkan input dari browser, kecuali aksi pembersihan cache yang sudah dikonfirmasi dan path-nya ada di allowlist.
- Aksesibilitas: tombol nyata (`<button>`), label untuk setiap input, kontras teks minimal 4.5:1, dan hormati `prefers-reduced-motion` (hentikan animasi berjalan/bermain).
- Teks UI dalam Bahasa Indonesia. Nama variabel dan kode dalam bahasa Inggris.

## Perintah

Pemakai: `npx v-off` (server + buka browser), `npx v-off setup [--remove] [--dry-run] [--port N]`.

```
npm install
npm run dev        # server (tsx watch, :4747) + Vite UI (:5173, proxy /api)
npm test           # unit test (vitest), server + logika web
npm run typecheck  # server dan web
npm run build      # tsc -> dist/server, vite -> dist/web (disajikan server di :4747)
```

Variabel lingkungan: `V_OFF_PORT` (default 4747), `V_OFF_HOST` (default 127.0.0.1),
`V_OFF_HOME` (default `~/.v-off`), `CLAUDE_CONFIG_DIR` (default `~/.claude`).

## Struktur kode

- `src/shared/types.ts`: model data (SPEC §4), dipakai server dan UI.
- `src/server/defaults.ts`: 18 agent dan departemen default dari mockup.
- `src/server/sources/`: adapter sumber data di balik `SourceAdapter`. `claudeHook.ts` (payload hook),
  `claudeTranscript.ts` (parser JSONL), `claudeTranscriptSource.ts` (tail file dengan polling).
- Sesi tanpa hooks (SPEC §6): `claudeTranscript.ts` mengubah `end_turn` jadi `stop` dan `AskUserQuestion`/`ExitPlanMode`
  jadi `notify`; `Store.guessWait` (di `tick`) menandai tool terbuka ≥ 90 detik sebagai "Mungkin menunggu izin"
  (`Block.auto`, tidak masuk hambatan). Blokir `auto` hilang setelah 30 menit sepi.
- `src/server/status.ts`: aturan status (SPEC §6), fungsi murni. `matcher.ts`: pemetaan sesi ke agent (SPEC §7).
  `roleGuess.ts`: roster = **katalog peran**, bukan staf wajib. Setiap sesi yang tak cocok aturan pemetaan
  diklasifikasikan ke peran terdekat (kata kunci lokal, ditiru dari `roleFor` di virtual-agents-office): peran
  eksplisit (`/v-off-roles raka`, "sebagai QA Engineer"), lalu skor jejak kerja tertinggi di antara peran yang ada
  (pindah hanya jika peran lain unggul 1,5×), lalu cadangan Tech Lead (sesi kode) / Project Manager. Tidak ada tamu
  kecuali roster kosong. Peran tanpa sesi disembunyikan dari Ruang Tim (`Store.isVisible`); toggle "Aktif" di
  Pengaturan (`hidden`) mengeluarkan peran dari klasifikasi. Aturan cwd/branch/`V_OFF_AGENT` tidak pernah ditimpa.
  Isi prompt hanya dipindai, tidak disimpan.
- `src/server/cleaner.ts`: pemindai cache office boy (SPEC §8), **dry-run saja**: hanya mengukur, tidak pernah
  menghapus atau mengikuti symlink. Jalan 3 detik setelah start lalu tiap `cleaner.intervalMin` menit.
- `src/server/history.ts`: `~/.v-off/history.json`, riwayat hambatan (31 hari). Token dan sesi dibangun ulang dari
  transkrip saat start; hambatan dari hooks hanya ada live, jadi disimpan di sini.
- `src/server/setup.ts` (Fase 7): `v-off setup` memasang hooks Claude Code `type: "command"`, `async: true` yang
  menjalankan `~/.v-off/hook.mjs` (ditandai `--v-off-hook`). Format hooks mengikuti
  https://code.claude.com/docs/en/hooks; periksa ulang saat Claude Code berubah. `cli.ts`: `start`/`setup`.
- `src/server/store.ts`: state di memori, feed, token/biaya, laporan. `http.ts`: REST + SSE (SPEC §9), plus UI statis.
  Kantor off (SPEC §6.1): `matchUsageLimit` di `summarize.ts` mengenali pesan limit; `Store.trackLimit` memegang
  `LimitState` (dicek sebelum dedupe hook/transkrip karena teks limit sering hanya ada di transkrip).
- `web/src/office/`: renderer WebGL hasil port dari `Main.dc.html` (opsi b). `kit.ts` (geometri),
  `staticScene.ts` (lantai & furnitur), `characters.ts` (hewan & ekspresi), `people.ts` (kursi, tempat main,
  cache geometri per agent), `camera.ts` (orbit, `panBy` untuk geser dalam batas `PAN_X`/`PAN_Z`, & preset; `layout.ts` `allViews` menambah preset per meja tim, dipilih lewat dropdown
  "Meja tim" di bar kamera), `renderer.ts` (loop, office boy, label).
- `web/src/OfficeStage.tsx`: kanvas, label nama, kontrol kamera. Seret kiri = putar; seret kanan/tengah, Shift, atau
  toggle "Geser" = geser denah; dua jari = geser + pinch zoom. Pointer capture menjaga drag di luar kanvas. `api.ts`: `/api/state` + SSE. `actions.ts`: aksi REST.
- Panel kanan = **Obrolan tim** (`TeamChat.tsx`): live chat grup seluruh kantor, menggantikan panel Detail agent.
  Feed (SSE, buffer 200 di klien, 150 di snapshot) jadi pesan per agent (avatar, nama), prompt tampil sebagai
  "Anda → @agent", nama agent lain di teks jadi mention, agent yang bekerja punya titik mengetik. Agent yang dipilih
  di denah disematkan di bawah chat (status, lokasi, hambatan + "Tandai sudah ditangani", aksi) dan pesannya disorot.
  `present.ts` `teamChat`/`mentionsIn`/`presenceText` (dites). Isi tetap ringkasan aksi, tidak pernah teks
  prompt/jawaban. `GET /api/agents/:id/sessions` (`Store.agentSessions`) tetap tersedia untuk daftar sesi agent.
- `FilterBar.tsx`, `ActivityFeed.tsx`, `SessionDialog.tsx`, `MessageDialog.tsx`: interaksi (Fase 3).
  `present.ts`: helper murni (filter, format angka, teks feed, lokasi) yang dites.
- Asrama: `layout.ts` (`DORM`, `BEDS`, `assignBeds`, rute `exitChain` untuk kasur), `staticScene.ts` (`buildDorm`,
  pintu di dinding kiri, grup `dormW`/`dormOn`/`dormOff`), `characters.ts` (`sleepBody`: badan berdiri yang
  direbahkan), `people.ts` (tidur, label, cincin di kaki kasur). `App.tsx` membagi kasur saat `state.limit` ada.
- `web/src/office/behavior.ts` (Fase 4): tempat main yang "lengket" dengan prioritas, stop office boy dari
  hasil pindai cache, pemilihan celetukan. Rute jalan meja <-> ruang santai ada di `layout.ts` (`route`).
- `web/src/ReportPage.tsx` (Fase 5): halaman `/laporan`. `reportModel.ts` (view model murni, dites),
  `postcardPng.ts` (kartu pos digambar di canvas 2D lalu diunduh sebagai PNG). Routing ada di `App.tsx`.
- `web/src/SettingsPage.tsx` (Fase 6): halaman `/pengaturan`, edit draf config lalu `PUT /api/config`.
  `settingsModel.ts` (helper murni, dites): id slug, teks aturan pemetaan <-> `MatchRule`, kursi saat pindah
  departemen, tetapkan folder tamu. Server memvalidasi ketat (`config.ts`) dan menyiarkan SSE `config-updated`;
  klien memuat ulang `/api/state`. Token transkrip dihitung per id pesan, jadi membaca ulang transkrip
  (sumber data di-restart) tidak menggandakan angka.
