# WBS v-off

Disusun oleh Project Manager (`wulan`) per 2026-10-02. Sumber: `docs/SPEC.md`, `CHANGELOG.md`, riwayat git,
daftar PR GitHub, dan `npm test` (18 file, 171 tes lulus).

Kolom **Pemilik** memakai id agent v-off (lihat `.claude/skills/v-off-roles/SKILL.md`). Estimasi dalam
hari kerja (HK) satu orang/agent. Item yang selesai mencatat commit sebagai bukti, bukan estimasi.

## Ringkasan status

| Kode | Paket kerja | Status | Bukti / catatan |
|---|---|---|---|
| 1 | Kerangka & data | Selesai | `e35fc13` |
| 2 | Ruang Tim 3D | Selesai | `07a4608`, `aa29dad` |
| 3 | Interaksi | Selesai | `8c7f363` |
| 4 | Perilaku hidup | Selesai | `e2c67e5` |
| 5 | Laporan | Selesai | `c8785cb` |
| 6 | Pengaturan | Selesai | `56a9c46` |
| 7 | Setup & distribusi | Sebagian | `bb3522b`; paket belum terbit di npm (404) |
| 8 | Verifikasi penerimaan v1 | Belum mulai | Kriteria SPEC §12 belum diuji manual |
| 9 | Rilis 0.1.0 | Belum mulai | PR #9 masih terbuka |
| 10 | Backlog v1.x | Belum mulai | Dari "Belum tersedia" di CHANGELOG |

## 1. Kerangka & data (selesai)

| Kode | Tugas | Pemilik | Bergantung pada |
|---|---|---|---|
| 1.1 | Server Node + TS, bind `127.0.0.1`, REST + SSE (SPEC §9) | `raka` | – |
| 1.2 | Model data bersama `src/shared/types.ts` (SPEC §4) | `bima` | – |
| 1.3 | Adapter hook Claude Code (`claudeHook.ts`) | `raka` | 1.1, 1.2 |
| 1.4 | Parser dan tail transkrip JSONL | `dodi` | 1.2 |
| 1.5 | Aturan status (SPEC §6) dan pemetaan sesi (SPEC §7) | `raka` | 1.2 |
| 1.6 | Tes unit parser, status, matcher | `yoga` | 1.3–1.5 |
| 1.7 | Perbaikan replay transkrip dan polling lebih cepat | `raka` | 1.4 (`9136a37`) |

## 2. Ruang Tim 3D (selesai)

| Kode | Tugas | Pemilik | Bergantung pada |
|---|---|---|---|
| 2.1 | Port renderer WebGL mockup (`kit.ts`, `staticScene.ts`) | `dewi` | design/mockup |
| 2.2 | 18 karakter hewan dan ekspresi per status | `dewi`, `sari` | 2.1 |
| 2.3 | Kamera orbit dan preset | `dewi` | 2.1 |
| 2.4 | Nama tim di lantai, label nama ramping | `dewi` | 2.1 (`aa29dad`) |

## 3. Interaksi (selesai)

| Kode | Tugas | Pemilik | Bergantung pada |
|---|---|---|---|
| 3.1 | Panel detail agent, "Tandai sudah ditangani", istirahat/kembali | `dewi` | 1.1, 2.2 |
| 3.2 | Filter status dan feed aktivitas tanpa isi prompt | `dewi` | 1.1 |
| 3.3 | Dialog ringkasan sesi, salin `claude --resume` | `dewi` | 3.1 |

## 4. Perilaku hidup (selesai)

| Kode | Tugas | Pemilik | Bergantung pada |
|---|---|---|---|
| 4.1 | Rute jalan meja ↔ ruang santai, tempat main "lengket" | `dewi` | 2.1 |
| 4.2 | Pemindai cache office boy, dry-run (SPEC §8) | `raka`, `udin` | 1.1 |
| 4.3 | Rute Udin dari hasil pindai, celetukan | `dewi` | 4.2 |

## 5. Laporan (selesai)

| Kode | Tugas | Pemilik | Bergantung pada |
|---|---|---|---|
| 5.1 | Agregasi token, biaya, sesi, sukses, hambatan (SPEC §10) | `dodi` | 1.4 |
| 5.2 | Riwayat hambatan 31 hari (`history.ts`) | `raka` | 1.5 |
| 5.3 | Halaman `/laporan` dan kartu pos PNG | `dewi`, `mega` | 5.1 |

## 6. Pengaturan (selesai)

| Kode | Tugas | Pemilik | Bergantung pada |
|---|---|---|---|
| 6.1 | Validasi config dan `PUT /api/config`, SSE `config-updated` | `raka` | 1.1 |
| 6.2 | Halaman `/pengaturan`: agent, departemen, sumber, harga, suasana | `dewi` | 6.1 |

## 7. Setup & distribusi (sebagian)

| Kode | Tugas | Pemilik | Est. | Bergantung pada | Status |
|---|---|---|---|---|---|
| 7.1 | `v-off setup` (idempoten, cadangan, `--remove`, `--dry-run`) | `raka` | – | 1.3 | Selesai |
| 7.2 | CLI `start`/`setup`, README, CHANGELOG, CI | `fajar` | – | 7.1 | Selesai |
| 7.3 | Skill `v-off-roles` (18 peran Planora) | `wulan` | – | – | Selesai, di PR #9 |
| 7.4 | Uji `npm pack` lalu `npx` dari tarball di mesin bersih | `yoga` | 0,5 | 7.2 | Belum |
| 7.5 | Terbitkan `v-off@0.1.0` ke npm | Ardhi | 0,25 | 9.3 | Belum, butuh akun npm pemilik |

## 8. Verifikasi penerimaan v1 (belum mulai)

Satu tugas per kriteria SPEC §12. Pemilik semua: `yoga`, kecuali yang disebut lain.

| Kode | Kriteria | Est. | Bergantung pada |
|---|---|---|---|
| 8.1 | KP1: sesi aktif muncul ≤ 3 detik setelah ada aktivitas | 0,25 | 7.4 |
| 8.2 | KP2: permintaan izin → Terblokir, alasan tampil di panel | 0,25 | 7.4 |
| 8.3 | KP3: idle 10 menit → ruang santai; aktivitas baru → kembali | 0,25 | 7.4 |
| 8.4 | KP4: token dan biaya laporan ±1% dari transkrip (`mega`) | 0,5 | 7.4 |
| 8.5 | KP5: Pengaturan tersimpan dan langsung terlihat | 0,25 | 7.4 |
| 8.6 | KP6: nol request keluar di DevTools (`fajar`) | 0,25 | 7.4 |
| 8.7 | KP7: office boy tidak pernah menghapus file (`fajar`) | 0,25 | 7.4 |
| 8.8 | Non-fungsional SPEC §11: ≥ 50 fps 18 agent, Chrome/Edge/Safari/Firefox, reduced-motion, layout < 1100px | 1 | 7.4 |
| 8.9 | Audit keamanan: bind lokal, tidak ada shell dari input browser (`fajar`) | 0,5 | – |

## 9. Rilis 0.1.0 (belum mulai)

| Kode | Tugas | Pemilik | Est. | Bergantung pada |
|---|---|---|---|---|
| 9.1 | Review dan merge PR #9 | `andi` | 0,25 | – |
| 9.2 | Gerbang teknis | `rina` | 0,25 | 8.*, 9.1 |
| 9.3 | Gerbang bisnis, keputusan rilis | `hendra` (Ardhi) | 0,25 | 9.2 |
| 9.4 | Tag `v0.1.0`, catatan rilis GitHub | `wulan` | 0,25 | 7.5 |

## 10. Backlog v1.x (belum mulai, belum dijadwalkan)

Estimasi kasar, perlu dipecah oleh `andi` sebelum masuk sprint.

| Kode | Tugas | Pemilik | Est. | Bergantung pada |
|---|---|---|---|---|
| 10.1 | Adapter Codex CLI di balik `SourceAdapter` (`app.ts`) | `raka`, `dodi` | 3 | Format log Codex (`bima`) |
| 10.2 | Adapter Gemini CLI | `raka`, `dodi` | 3 | Format log Gemini (`bima`) |
| 10.3 | Pembersihan cache nyata: `POST /api/cleaner/clean` (kini 501), konfirmasi UI, allowlist | `raka`, `dewi` | 3 | Audit `fajar` sebelum merge |
| 10.4 | Acara sosial di ruang santai | `sari`, `dewi` | 2 | Desain `sari` |

## Jalur kritis rilis

`9.1` → `7.4` → `8.1–8.9` (paralel) → `9.2` → `9.3` → `7.5` → `9.4`. Total ±4 HK jika 8.x dikerjakan
berurutan oleh satu orang, ±2 HK jika paralel.

## Risiko

| Risiko | Dampak | Mitigasi | Pemilik |
|---|---|---|---|
| Format hooks Claude Code berubah | Status Terblokir/izin tidak masuk | Cek ulang https://code.claude.com/docs/en/hooks sebelum rilis; transkrip tetap jadi cadangan | `raka` |
| Nama `v-off` sudah diambil orang lain di npm saat terbit | Rilis tertunda | Cek nama sesaat sebelum 7.5; siapkan nama cadangan dengan scope (`@ardhi95/v-off`) | Ardhi |
| Performa 3D < 50 fps di laptop lemah | KP non-fungsional gagal | Ukur di 8.8; opsi turunkan bayangan | `dewi` |
| Fitur hapus cache (10.3) menyentuh path di luar allowlist | Kehilangan data pengguna | Tes path traversal dan symlink; audit `fajar` wajib | `fajar` |
| Kriteria §12 hanya dites otomatis, belum manual | Bug lolos ke rilis | Paket 8 wajib PASS sebelum 9.2 | `yoga` |
