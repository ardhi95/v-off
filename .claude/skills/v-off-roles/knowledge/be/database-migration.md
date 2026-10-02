# Perubahan skema dan migrasi

Contoh perintah memakai Prisma; prinsipnya berlaku untuk ORM lain (Flyway, Liquibase, Alembic, Room).

## Aturan

- NEVER `ALTER TABLE` manual atau DDL di skrip tersembunyi. Semua lewat migrasi yang tercatat di git.
- ALWAYS commit file skema dan file migrasi bersamaan.
- ALWAYS tinjau SQL hasil generate sebelum commit.
- NEVER menjalankan migrasi ke produksi dari sesi agent. Itu tugas pipeline atau user.

## Langkah

1. Ubah skema (`schema.prisma`).
2. `npx prisma migrate dev --name <deskripsi_singkat>` di lokal (database dev).
3. Tinjau `prisma/migrations/<ts>_<nama>/migration.sql`:
   - [ ] Tidak ada `DROP COLUMN`/`DROP TABLE` yang tidak disengaja.
   - [ ] Kolom `NOT NULL` baru di tabel berisi data punya default, atau dipecah dua tahap
         (tambah nullable -> isi data -> jadikan NOT NULL).
   - [ ] Indeks dan constraint yang diharapkan ada.
   - [ ] Mengganti nama kolom tidak di-generate sebagai drop + add (data hilang).
4. Commit skema + migrasi.
5. Pipeline: `migrate deploy` -> `generate` -> restart.

## Desain skema

- Primary key UUID; `createdAt`/`updatedAt` di setiap tabel.
- Indeks untuk kolom filter yang sering dipakai (`projectId`, `status`).
- `JSONB` untuk atribut fleksibel, bukan untuk relasi.
- Nilai turunan sederhana: pertimbangkan generated column.
- Record final berversi; jangan menimpa.

## Rollback

- Setiap migrasi yang berisiko punya rencana mundur tertulis di PR (migrasi kebalikan atau langkah
  manual yang aman).
