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
- `src/server/status.ts`: aturan status (SPEC §6), fungsi murni. `matcher.ts`: pemetaan sesi ke agent (SPEC §7).
- `src/server/store.ts`: state di memori, feed, token/biaya, laporan. `http.ts`: REST + SSE (SPEC §9), plus UI statis.
- `web/src/office/`: renderer WebGL hasil port dari `Main.dc.html` (opsi b). `kit.ts` (geometri),
  `staticScene.ts` (lantai & furnitur), `characters.ts` (hewan & ekspresi), `people.ts` (kursi, tempat main,
  cache geometri per agent), `camera.ts` (orbit & preset), `renderer.ts` (loop, office boy, label).
- `web/src/OfficeStage.tsx`: kanvas, label nama, kontrol kamera. `api.ts`: `/api/state` + SSE. `actions.ts`: aksi REST.
- `web/src/AgentPanel.tsx`, `FilterBar.tsx`, `ActivityFeed.tsx`, `SessionDialog.tsx`: interaksi (Fase 3).
  `present.ts`: helper murni (filter, format angka, teks feed, lokasi) yang dites.
