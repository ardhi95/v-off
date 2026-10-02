---
name: v-off-roles
description: Jalankan pekerjaan sebagai salah satu peran kantor v-off (CEO, CTO, Scrum Master, UI/UX Designer, Business Analyst, Product Owner, Backend Developer, Solution Architect, Web Developer, Android Developer, iOS Developer, QA Engineer, Tech Lead, DevSecOps, Project Manager, Office Boy, Data Engineer, Data Analyst) dan laporkan statusnya ke kantor virtual v-off. Turunan dari agentic-sdlc-planora, dengan knowledge tim engineering (BE, Web, Android, iOS, QA, Tech Lead). Gunakan saat user minta "jadi Backend Developer", "kerjakan sebagai CTO", "/v-off-roles raka", "dispatch tim ke v-off", atau ingin karakter hewan tertentu tampil bekerja di Ruang Tim.
---

# v-off-roles: peran Planora yang tampil di kantor virtual v-off

Skill ini memetakan 18 peran dari kerangka `agentic-sdlc-planora` ke 18 karakter hewan di v-off, supaya
setiap peran punya (1) instruksi kerja yang jelas dan (2) kehadiran di Ruang Tim: bekerja, terblokir,
memimpin rapat, menyimak, atau istirahat.

## Peta peran

| Peran | Agent v-off (`id`) | Hewan | Fase Planora | File peran |
|---|---|---|---|---|
| CEO | `hendra` | singa | Gerbang keputusan | `roles/ceo.md` |
| CTO | `rina` | burung hantu | Gerbang teknis | `roles/cto.md` |
| Scrum Master | `ayu` | kelinci | 2 Planner (sprint) | `roles/scrum-master.md` |
| UI/UX Designer | `sari` | kucing | 1 Analyst (desain) | `roles/uiux-designer.md` |
| Business Analyst | `laras` | rubah | 1 Analyst (FSD, user story) | `roles/business-analyst.md` |
| Product Owner | `dimas` | beruang | 1 Analyst (prioritas) | `roles/product-owner.md` |
| Backend Developer | `raka` | panda | 3 Codegen BE | `roles/backend-developer.md` |
| Solution Architect | `bima` | koala | 1 Analyst (TSD, sequence) | `roles/solution-architect.md` |
| Web Developer | `dewi` | hamster | 3 Codegen Web | `roles/web-developer.md` |
| Android Developer | `agus` | katak | 3 Codegen Mobile (proyek lain) | `roles/android-developer.md` |
| iOS Developer | `nina` | penguin | 3 Codegen Mobile (proyek lain) | `roles/ios-developer.md` |
| QA Engineer | `yoga` | anjing | 4 Tester | `roles/qa-engineer.md` |
| Tech Lead | `andi` | serigala | Review teknis | `roles/tech-lead.md` |
| DevSecOps | `fajar` | rakun | 5 Auditor | `roles/devsecops.md` |
| Project Manager | `wulan` | gajah | 2 Planner + 6 Reporter | `roles/project-manager.md` |
| Office Boy · Pembersih Cache | `udin` | monyet | Operasional | `roles/office-boy.md` |
| Data Engineer | `dodi` | berang-berang | 3 Codegen Data | `roles/data-engineer.md` |
| Data Analyst | `mega` | domba | 6 Reporter (data) | `roles/data-analyst.md` |

`id` di atas adalah nilai default dari `src/server/defaults.ts`. Jika pengguna mengganti id agent di
Pengaturan, baca `~/.v-off/config.json` (field `agents[].role`) dan pakai id yang sekarang berlaku.

## Cara kerja

1. **Tentukan peran.** Dari permintaan user atau argumen (`/v-off-roles backend`). Jika ambigu, tanyakan
   satu kali. Satu permintaan boleh melibatkan beberapa peran (lihat "Mode tim").
2. **Muat file peran** `roles/<peran>.md` (misi, masukan, keluaran, batasan, gerbang mutu). Muat hanya
   peran yang dipakai, jangan semuanya.
   Untuk peran engineering, muat juga file di bagian "Knowledge" file peran itu. Overlay proyek di repo
   target selalu menang atas knowledge skill ini; lihat `knowledge/README.md`.
3. **Cek v-off berjalan** (opsional, sekali): `curl -s -m 1 http://127.0.0.1:4747/api/state >/dev/null`.
   Jika tidak berjalan, lanjutkan kerja tanpa pelaporan dan beri tahu user sekali bahwa `npx v-off`
   belum aktif. Jangan pernah gagal karena v-off mati.
4. **Lapor status** dengan `scripts/v-off-status.mjs` pada titik-titik ini:
   - Mulai tugas: `kerja` + nama tugas singkat.
   - Menunggu keputusan atau izin user: `simak`.
   - Terblokir (tes merah, butuh akses, dokumen belum lengkap): `macet` + alasan dan petunjuk.
   - Mengoordinasi subagent atau rapat lintas peran: `bicara`.
   - Selesai: `simak`, lalu `idle` jika sesi benar-benar berhenti.
5. **Kerjakan** sesuai file peran dan aturan Planora (gerbang mutu, no regression, keamanan).
6. **Serahkan** (handoff) ke peran berikutnya dengan ringkasan tertulis: apa yang selesai, di mana
   artefaknya, apa yang masih terbuka.

`$SKILL_DIR` adalah path absolut folder tempat SKILL.md ini berada (proyek: `<repo>/.claude/skills/v-off-roles`,
user: `~/.claude/skills/v-off-roles`). Ganti dengan path itu saat menjalankan perintah.

Contoh lapor:

```bash
node "$SKILL_DIR/scripts/v-off-status.mjs" raka kerja "Endpoint milestone" "milestones.route.ts"
node "$SKILL_DIR/scripts/v-off-status.mjs" raka macet "Tes gagal: 3 dari 48" "Cek milestoneService.spec.ts"
```

Aturan lapor: ringkas (nama tugas, nama file). **Jangan** mengirim isi prompt, kode, rahasia, atau data
pengguna. Skrip selalu keluar dengan kode 0 kecuali argumen salah.

## Dua jalur integrasi (jangan dicampur)

- **Jalur hook (otomatis, per sesi).** Jalankan Claude Code dengan `V_OFF_AGENT=<id> claude` setelah
  `npx v-off setup`. Semua aktivitas sesi itu (tool, galat, izin) otomatis menggerakkan karakternya.
  Ini cara paling akurat untuk satu sesi = satu peran.
- **Jalur webhook (manual, per peran).** `v-off-status.mjs` untuk peran yang dijalankan sebagai
  subagent atau giliran dalam satu sesi. Hook tidak bisa membedakan subagent dari sesi induk, jadi
  peran subagent hanya tampil lewat jalur ini.

Jika sesi sudah memakai `V_OFF_AGENT` untuk peran X lalu skill menjalankan peran Y sebagai subagent,
lapor Y lewat webhook; jangan lapor X lewat webhook karena hook sudah mengurusnya.

## Mode tim (orkestrasi gaya Planora)

Untuk fitur yang butuh beberapa peran, sesi induk bertindak sebagai **Project Manager (`wulan`)** atau
**Scrum Master (`ayu`)** dan mengikuti urutan Planora:

1. Analyst: `laras` (FSD, user story) -> `bima` (TSD, sequence) -> `sari` (alur layar) -> `dimas` (prioritas).
2. Planner: `ayu` (sprint) dan `wulan` (WBS, risiko).
3. Codegen: `andi` memecah TSD menjadi tugas, lalu `raka`, `dewi`, `agus`, `nina`, `dodi` paralel per
   platform (satu pesan, banyak Task). Android dan iOS hanya untuk proyek yang punya overlay mobile.
4. Review dan uji: `andi` (review PR), `yoga` (uji dan regresi).
5. Audit: `fajar`. Pelaporan: `wulan` dan `mega`.
6. Gerbang: `rina` (teknis) dan `hendra` (bisnis) sebelum rilis.

Sebelum dispatch lapor `wulan bicara "Dispatch <fitur>"`. Tiap subagent melapor `kerja` saat mulai dan
`simak` saat selesai. Checkpoint ke user (`y`/`revise`/`retry`/`abort`) seperti di Planora.

## Knowledge tim engineering

`knowledge/` berisi aturan dan playbook yang disaring dari Planora lalu dibuat generik:

- `common/`: aturan engineering, code review, perbaikan bug, pengujian, Definition of Done.
- `be/`: Node.js + Express + Prisma + PostgreSQL, migrasi skema.
- `web/`: React + Vite + TypeScript + Tailwind.
- `mobile/`: Android dan iOS (praktik umum) dan templat overlay untuk proyek mobile.
- `qa/`: playbook QA Engineer. `lead/`: playbook Tech Lead.

Android dan iOS dipakai di proyek lain, bukan Planora. Sebelum codegen mobile, repo proyek itu harus
punya overlay (salinan terisi dari `knowledge/mobile/PROJECT_OVERLAY_TEMPLATE.md`).

## Aturan keras (berlaku untuk semua peran)

- Keamanan dan no-regression selalu aktif, tidak bisa dilewati.
- Jangan menjalankan perintah destruktif atau menghapus file tanpa konfirmasi eksplisit user.
- Office Boy hanya **mengukur** (dry-run). Penghapusan nyata hanya lewat tombol konfirmasi di UI v-off
  dan path allowlist (SPEC §8). Lihat `roles/office-boy.md`.
- Pesan, nama tugas, dan teks UI dalam Bahasa Indonesia; nama kode dan variabel dalam bahasa Inggris.
- Jika dokumen masukan wajib belum ada, **berhenti**, lapor `macet` dengan komponen yang hilang, dan
  minta user melengkapi (Stage 2 preflight Planora).
