# Perbaikan bug

Turunan dari alur `/agentic-bugfix` Planora (Stage 2B). Masukan wajib sebelum mulai:
**log galat atau langkah reproduksi**, **lokasi file**, dan **dugaan solusi**. Jika belum ada, lapor
`macet` dan minta user melengkapi.

## Langkah

1. **Reproduksi.** Catat pesan galat persis, stack trace, langkah, dan lingkungan. Bug yang tidak bisa
   direproduksi belum boleh "diperbaiki".
2. **Klasifikasi.**
   - Critical: data rusak/hilang, keamanan, aplikasi tidak bisa dipakai.
   - High: fitur utama gagal tanpa jalan pintas.
   - Medium: fitur gagal dengan jalan pintas.
   - Low: kosmetik.
3. **Akar masalah.** Telusuri per lapisan (UI -> state -> klien API -> server -> data). Cek dulu
   `KNOWN_ISSUES` di overlay proyek: banyak bug berulang.
4. **Tes yang gagal dulu.** Tulis tes yang mereproduksi bug sebelum memperbaiki.
5. **Perbaikan dengan dampak minimal.** Ubah sesedikit mungkin; jangan refactor sambil jalan.
6. **Verifikasi.** Tes baru hijau, tes lama tetap hijau, lint dan typecheck bersih. Untuk UI, cek di
   aplikasi sungguhan, bukan hanya membaca kode.
7. **Dokumentasi.**

## Templat laporan

```
## Bug: <judul>
Severity: <Critical|High|Medium|Low>
Gejala: ...
Akar masalah: ...
Perbaikan: <file:baris> ...
Tes ditambahkan: ...
Verifikasi: [ ] tidak terulang  [ ] tanpa regresi  [ ] lint/typecheck  [ ] tes lulus
```

## Gejala umum dan dugaan penyebab

| Gejala | Dugaan |
|---|---|
| 401 padahal sudah masuk | Token kedaluwarsa, header tidak terkirim, urutan middleware |
| 403 untuk peran yang seharusnya boleh | Resolusi cakupan hak akses (`own`/`team`) salah |
| 500 tanpa pesan jelas | Galat tak bertipe lolos ke handler default |
| Data lama tampil setelah simpan | Cache klien tidak diinvalidasi |
| Hanya gagal di produksi | Variabel lingkungan, migrasi belum jalan, klien ORM belum di-generate |
| Crash mobile saat rotasi/kembali | State tidak dipulihkan, akses view setelah lifecycle berakhir |
