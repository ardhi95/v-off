# Pengujian

Turunan dari fase 4 Planora (unit, integrasi, kontrak, cakupan, E2E).

## Piramida

1. **Unit** (paling banyak): logika murni, service, ViewModel, util. Cepat, tanpa jaringan.
2. **Integrasi**: endpoint dengan database tes terpisah; repository dengan DB sungguhan.
3. **Kontrak**: bentuk respons API sesuai TSD; klien dan server sepakat.
4. **E2E** (sedikit): 1–2 alur kritis per fitur, ditambah 1–2 jalur galat.

## Kasus yang wajib ada

- Jalur sukses.
- Validasi: input kosong, salah tipe, di luar rentang.
- **Batas otorisasi** per endpoint/aksi terlindungi: peran yang boleh, peran yang ditolak (403),
  cakupan `own`/`team` yang salah sasaran.
- **Mesin status**: transisi valid dan tidak valid (409).
- **Pemisahan tugas**: penyetuju tidak boleh sama dengan pengaju.
- **Imutabilitas**: mengubah record yang sudah final harus ditolak.
- Galat dependensi: timeout, 500 dari layanan lain, jaringan putus.

## Aturan

- ALWAYS nama tes `should <perilaku> when <kondisi>` (atau bahasa proyek, konsisten).
- ALWAYS tes terisolasi: tanpa state bersama, bisa jalan paralel, bersihkan data/cookie/storage.
- ALWAYS mock layanan eksternal agar deterministik. NEVER memanggil layanan produksi dari tes.
- ALWAYS tes integrasi ke database **tes** terpisah, bukan dev atau produksi.
- NEVER jeda tetap (`sleep`, `waitForTimeout`). Tunggu kondisi (`expect(...).toBeVisible()`).
- ALWAYS selector E2E berbasis peran/label aksesibilitas, bukan CSS/XPath.
- WHEN tes flaky THEN karantina dengan tiket dan pemilik, jangan dihapus diam-diam.

## Cakupan

- Target default: logika bisnis ≥ 80% baris, ≥ 70% cabang. Overlay proyek boleh menetapkan lain.
- Laporan cakupan menyebut celah spesifik (file, fungsi, cabang) dan tes yang disarankan, bukan hanya
  persentase.
- Cakupan tinggi tidak menggantikan kasus wajib di atas.
