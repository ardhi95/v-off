# Profil BE: Node.js + Express + Prisma + PostgreSQL

Disaring dari `rules/be.md` dan `skills/be/*` Planora. Nama file, middleware, dan peran spesifik
proyek ada di overlay proyek; di sini hanya polanya.

## Alur request

```
Route (tipis) -> auth middleware -> permission middleware -> validasi Zod -> service -> Prisma -> respons
```

- Route handler hanya: ambil input tervalidasi, panggil service, bentuk respons.
- Service tidak bergantung pada `req`/`res`.
- Satu `PrismaClient` singleton (mis. `src/lib/prisma.ts`). NEVER `new PrismaClient()` di banyak tempat.

## Respons dan galat

- Sukses: `{ data: T }`; daftar berpaginasi: `{ data: T[], meta: { page, pageSize, total } }`.
- Galat: `{ error: { code: string, message: string } }`, lewat helper respons terpusat.
- Status: `200` baca/ubah, `201` buat, `204` hapus tanpa body.
- Lempar `AppError(statusCode, code, message)`; teruskan dengan `next(err)` ke satu error middleware
  4-argumen. NEVER `res.status(500).send(err.stack)`.
- Galat Zod -> 400 dengan detail per field. Token tidak valid -> 401.

## Keamanan

- Verifikasi token identitas di middleware untuk semua rute terlindungi; ambil peran dari tabel
  `users` lokal, bukan dari body atau claim yang dikirim klien.
- Otorisasi granular: `requirePermission(module, action, scopeResolver)` setelah auth. Cakupan
  `own` (pemilik) dan `team` (anggota) diperiksa ke database.
- Pemisahan tugas: penyetuju ≠ pengaju, dicek eksplisit di service.
- Operasi diri sendiri (ubah profil, ganti sandi): `req.user.id === targetId`.
- `$queryRaw` hanya dengan tagged template. NEVER `$queryRawUnsafe` dengan string gabungan.
- Endpoint publik hanya health check.

## Data

- `prisma/schema.prisma` adalah sumber kebenaran skema; lihat `be/database-migration.md`.
- UUID sebagai primary key.
- `include`/`select` untuk relasi; filter hak akses di `where`.
- Beberapa penulisan atomik: `prisma.$transaction([...])`.
- Tabel audit hanya `INSERT` (lindungi juga di level role DB).

## Validasi

- Skema Zod di `src/validators/`, dipakai di middleware sebelum service.
- `req.body` selalu `unknown` saat runtime; parse dulu.
- Pakai ulang skema Zod dari frontend bila bentuknya sama.

## Tes

- Vitest + Supertest. Integrasi ke database Postgres tes terpisah.
- Wajib: batas otorisasi per endpoint, mesin status, pemisahan tugas, imutabilitas.

## Upload file

- Simpan di direktori privat di luar document root; nama fisik di-hash; nama asli di metadata.
- Cek otorisasi sebelum men-stream file.

## Deploy

- Urutan: `prisma migrate deploy` -> `prisma generate` -> build -> restart. Jangan restart sebelum
  `generate` selesai.
