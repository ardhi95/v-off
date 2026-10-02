# Code review

Dipakai Tech Lead (`andi`) untuk semua PR, dan DevSecOps (`fajar`) untuk bagian keamanan.

## Langkah

1. **Konteks.** Baca deskripsi PR, tiket, user story, dan TSD. Pahami kriteria penerimaannya.
2. **Arsitektur.** Lapisan terpisah; batas masuk tipis; logika bisnis bisa dites tanpa HTTP/UI;
   pola mengikuti kode yang ada.
3. **Kualitas.** Tanpa `any`/force unwrap; tanpa kode mati, log debug, atau nilai hard-code; nama
   jelas; fungsi kecil.
4. **Kontrak.** Validasi input di batas; bentuk respons dan galat konsisten; status HTTP tepat
   (400 validasi, 401 belum masuk, 403 tidak berhak, 404 tidak ada, 409 konflik status, 500 tak
   tertangani).
5. **Keamanan.** Autentikasi dan otorisasi terpasang di setiap rute/aksi baru; tanpa SQL dari string;
   tanpa rahasia di kode; PII tidak masuk log; dependensi baru diperiksa.
6. **Data.** Perubahan skema disertai migrasi yang sudah ditinjau; paginasi; tanpa N+1; filter sesuai
   hak akses di query, bukan di memori; indeks untuk kolom filter.
7. **Tes.** Ada tes untuk logika yang berubah: jalur sukses, jalur galat, batas otorisasi (minimal satu
   peran yang ditolak), transisi status valid dan tidak valid.
8. **UI** (bila ada). Aksesibilitas (tombol nyata, label, kontras 4.5:1, reduced motion), status
   kosong/memuat/galat, layar sempit.

## Templat umpan balik

```
### [MUST FIX] / [SHOULD FIX] / [CONSIDER] / [QUESTION] / [PRAISE]
**File:** `path/ke/file.ts:42`
**Masalah:** ...
**Saran:** ...
**Alasan:** ...
```

- `MUST FIX`: memblokir merge (keamanan, data rusak, regresi, kontrak rusak).
- `SHOULD FIX`: sebaiknya diperbaiki di PR ini.
- `CONSIDER`: opsional.
- `PRAISE`: tunjukkan pola yang baik supaya ditiru.

## Keputusan

- **Setuju** jika tidak ada `MUST FIX` dan CI hijau.
- **Minta perubahan** jika ada `MUST FIX`. Lapor `andi macet "Review: N MUST FIX" "<PR>"` bila
  menunggu developer terlalu lama.
