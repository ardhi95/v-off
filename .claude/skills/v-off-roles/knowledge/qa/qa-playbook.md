# Playbook QA Engineer

Turunan dari fase 4 Planora (unit, integrasi, kontrak, cakupan, E2E) ditambah praktik QA manual.

## Alur

1. **Pahami cakupan.** Baca user story, kriteria penerimaan, TSD, dan diagram urutan.
2. **Rencana uji.** Per fitur: cakupan, di luar cakupan, risiko, lingkungan, data uji, kriteria lulus.
3. **Kasus uji.** Turunkan dari setiap kriteria penerimaan, ditambah kasus wajib di
   `common/testing.md`.
4. **Otomasi.** Prioritaskan alur kritis dan regresi. Ikuti kerangka tes proyek.
5. **Eksekusi.** Jalankan otomatis + eksplorasi manual. Catat bukti (log, tangkapan layar).
6. **Laporan bug.** Satu bug satu laporan (templat di bawah), dengan severity.
7. **Regresi.** Sebelum rilis, jalankan suite regresi penuh.
8. **Tanda tangan.** Lulus jika tidak ada bug Critical/High terbuka dan semua kasus wajib lulus.

## Templat kasus uji

```
ID: TC-<fitur>-<nomor>
Story: <ID story>
Prasyarat: ...
Langkah: 1. ... 2. ...
Hasil yang diharapkan: ...
Prioritas: P0 | P1 | P2
Jenis: fungsional | negatif | otorisasi | regresi | aksesibilitas
```

## Templat laporan bug

```
Judul: <apa yang salah, di mana>
Severity: Critical | High | Medium | Low
Lingkungan: <versi, browser/perangkat, OS>
Langkah reproduksi: 1. ... 2. ...
Hasil aktual: ...
Hasil yang diharapkan: ...
Bukti: <log, tangkapan layar>
```

## E2E web (Playwright)

- 1–2 alur sukses kritis + 1–2 jalur galat per fitur.
- Mock API eksternal lewat `context.route`; data deterministik.
- Selector `getByRole`/`getByLabel`. NEVER CSS/XPath, NEVER `waitForTimeout`.
- Tes independen; bersihkan cookie dan storage.
- Viewport mobile dan desktop untuk alur yang dipakai di keduanya.

## Mobile

- Android: Compose UI Test/Espresso. iOS: XCUITest. Ikuti overlay proyek mobile.
- Uji rotasi, kembali dari background, jaringan putus, izin ditolak.

## Batasan

- QA tidak memperbaiki kode produksi; temuan diserahkan ke developer pemilik.
- NEVER menguji terhadap data atau sistem produksi tanpa izin user.
- NEVER menandai lulus jika ada kasus wajib yang dilewati; tandai sebagai WARN dengan alasan.
