# Aturan engineering umum

Berlaku untuk semua stack. Format ALWAYS / NEVER / WHEN-THEN, mengikuti Planora.

## Arsitektur berlapis

- ALWAYS pisahkan lapisan: batas masuk (route, layar, CLI) -> validasi dan otorisasi -> logika bisnis
  (service, use case, ViewModel) -> akses data (repository) -> respons.
- NEVER taruh logika bisnis di lapisan batas (route handler, komponen UI, Activity/ViewController).
- ALWAYS buat logika bisnis bisa dites tanpa HTTP, UI, atau database sungguhan.
- ALWAYS pakai satu instance klien bersama (DB, HTTP, SDK) lewat modul tunggal atau dependency injection.
- WHEN butuh logika yang sudah ada di modul lain THEN pakai ulang atau pindahkan ke modul bersama,
  jangan menyalin.

## Galat

- ALWAYS lempar galat bertipe (kode + pesan + status) untuk galat bisnis dan validasi.
- NEVER menelan galat tanpa log. Log dengan konteks: `[Modul.fungsi]`.
- NEVER kirim stack trace atau pesan internal ke klien atau ke layar pengguna.
- ALWAYS punya satu titik penanganan galat terpusat per aplikasi.

## Keamanan (tidak bisa dilewati)

- NEVER hard-code rahasia (connection string, API key, service account). Baca dari environment atau
  secret store. NEVER commit `.env`; sediakan `.env.example` tanpa nilai asli.
- ALWAYS validasi semua input di batas sistem (body, query, params, deep link, intent, file).
- ALWAYS verifikasi identitas di server. NEVER percaya `userId` atau peran yang dikirim klien.
- ALWAYS otorisasi per aksi dan per sumber daya (bukan hanya "sudah login").
- ALWAYS query terparameter. NEVER gabungkan string ke SQL.
- NEVER log token, kata sandi, atau data pribadi utuh. Samarkan.
- NEVER CORS `*` di produksi.
- WHEN menambah dependensi THEN cek lisensi dan kerentanan yang diketahui dulu.

## Data

- ALWAYS ubah skema lewat migrasi yang tercatat di git dan bisa di-rollback.
- ALWAYS paginasi daftar yang bisa membesar. NEVER N+1 query.
- WHEN beberapa penulisan harus atomik THEN bungkus dalam satu transaksi.
- WHEN record sudah final (disetujui, selesai) THEN buat versi baru, jangan menimpa.

## Kualitas kode

- ALWAYS mode ketat bahasa (TypeScript `strict`, Kotlin tanpa `!!`, Swift tanpa force unwrap).
  NEVER `any` tanpa alasan tertulis.
- NEVER tinggalkan `console.log`/`print` debug, kode yang dikomentari, atau import yang tidak dipakai.
- ALWAYS nama deskriptif; fungsi diawali kata kerja.
- ALWAYS ikuti pola yang sudah ada di repo sebelum memperkenalkan pola baru. Jika tidak ada pola,
  tandai `[ASSUMPTION]` dan minta review.

## Kejujuran fitur

- NEVER membuat fitur yang pura-pura berfungsi (mock disajikan sebagai data asli, tombol tanpa aksi).
  Tandai keterbatasan secara jujur di UI atau di catatan PR.

## No regression

- ALWAYS jalankan tes, lint, dan typecheck yang ada sebelum menyatakan selesai.
- NEVER mengubah atau menghapus tes yang ada supaya lulus, kecuali perilakunya memang berubah dan
  disebutkan di catatan PR.
- WHEN tes merah THEN lapor `macet` dengan jumlah gagal dan nama tes, jangan menyatakan selesai.

## Git

- ALWAYS commit `feat|fix|chore|docs|style|refactor|test: deskripsi`; branch `feature/...`, `fix/...`.
- ALWAYS PR berisi deskripsi, cara verifikasi, dan tangkapan layar bila UI berubah.
- NEVER push langsung ke branch utama, force-push, atau menghapus branch tanpa izin user.
