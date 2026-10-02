# Ardhi — Personal Landing Page

Landing page personal statis (HTML + CSS + JavaScript murni, tanpa build step) dengan animasi interaktif.

## Fitur
- Latar partikel (canvas) yang bereaksi terhadap gerakan mouse
- Loader, judul huruf-per-huruf beranimasi, efek mengetik peran
- Kursor kustom, tombol "magnetic", kartu tilt 3D dengan glow mengikuti mouse
- Scroll reveal, progress bar, navbar auto-hide, link aktif per section
- Counter statistik & skill bar beranimasi, timeline yang terisi saat di-scroll
- Filter proyek, form kontak dengan validasi + confetti (klik nama di hero juga 🎉)
- Tema gelap/terang (tersimpan), menu mobile, menghormati `prefers-reduced-motion`

## Menjalankan
Buka `index.html` langsung di browser, atau:

```bash
npx serve .
```

## Kustomisasi
Semua konten ada di `index.html` — ganti nama, deskripsi, skill (`data-level`), statistik (`data-to`),
timeline, proyek, dan link sosial. Ganti `hello@example.com` di `index.html` dan `script.js` dengan email Anda.
Warna utama diatur lewat variabel `--accent*` di `style.css`.
