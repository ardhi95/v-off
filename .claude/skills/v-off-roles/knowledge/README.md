# Knowledge tim engineering

Knowledge ini disaring dari `agentic-sdlc-planora` (rules, skills, dan workflow fase 3–5) lalu dibuat
generik supaya bisa dipakai di proyek lain. Isinya tiga lapis. **Lapis yang lebih atas menang** jika ada
aturan yang bertentangan.

| Lapis | Lokasi | Isi |
|---|---|---|
| 1. Overlay proyek | Di repo target: `docs/agentic/`, `.v-off/knowledge/`, atau `CLAUDE.md` | Stack nyata, struktur folder, ADR, known issues, perintah build/tes |
| 2. Profil stack | `knowledge/be/`, `knowledge/web/`, `knowledge/mobile/` | Pola per teknologi |
| 3. Umum | `knowledge/common/` | Aturan yang berlaku di semua stack |

## Cara memuat (resolver)

1. Cari overlay proyek dulu. Baca `CLAUDE.md` repo target, lalu `docs/agentic/config.yaml` atau
   `.v-off/knowledge/*.md` bila ada.
2. Tentukan profil stack dari overlay atau dari berkas proyek (`package.json`, `build.gradle(.kts)`,
   `*.xcodeproj`/`Package.swift`, `pubspec.yaml`). Jika stack tidak cocok dengan profil yang tersedia,
   pakai lapis umum saja dan tandai `[ASSUMPTION]`.
3. Muat **hanya** file yang dibutuhkan peran (tabel di bawah) dan yang cocok dengan kata kunci tugas.
   Maksimal sekitar 6 file per tugas.

## Peta peran ke knowledge

| Peran | Selalu | Sesuai tugas |
|---|---|---|
| Backend Developer (`raka`) | `common/engineering-rules.md`, `be/node-express-prisma.md` | `be/database-migration.md`, `common/testing.md`, `common/bug-fix.md` |
| Web Developer (`dewi`) | `common/engineering-rules.md`, `web/react-vite.md` | `common/testing.md`, `common/bug-fix.md` |
| Android Developer (`agus`) | `common/engineering-rules.md`, `mobile/android.md` | `common/testing.md`, `common/bug-fix.md` |
| iOS Developer (`nina`) | `common/engineering-rules.md`, `mobile/ios.md` | `common/testing.md`, `common/bug-fix.md` |
| QA Engineer (`yoga`) | `qa/qa-playbook.md`, `common/testing.md` | `common/bug-fix.md`, `common/definition-of-done.md` |
| Tech Lead (`andi`) | `lead/tech-lead-playbook.md`, `common/code-review.md` | semua profil stack yang disentuh PR |
| Solution Architect (`bima`) | `common/engineering-rules.md` | profil stack target, `be/database-migration.md` |
| DevSecOps (`fajar`) | `common/engineering-rules.md` (§Keamanan), `common/code-review.md` (§Keamanan) | profil stack yang diaudit |
| Data Engineer (`dodi`) | `common/engineering-rules.md` | `be/database-migration.md`, `common/testing.md` |

## Proyek mobile (Android dan iOS)

Planora tidak punya aplikasi mobile. Android dan iOS akan dipakai di **proyek lain**, jadi
`mobile/android.md` dan `mobile/ios.md` hanya berisi praktik umum. Sebelum codegen mobile, proyek itu
wajib punya overlay. Salin `mobile/PROJECT_OVERLAY_TEMPLATE.md` ke repo proyek tersebut
(`docs/agentic/mobile.md` atau `.v-off/knowledge/mobile.md`) lalu isi. Tanpa overlay, developer mobile
lapor `macet` dan meminta user melengkapinya.
