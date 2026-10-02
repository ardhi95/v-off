# Definition of Done dan gerbang mutu

Gerbang per fase mengikuti pola checkpoint Planora: **PASS** lanjut, **WARN** lanjut dengan catatan,
**FAIL** berhenti. Pilihan untuk user: `y` / `revise` / `retry` / `skip` / `abort`.

| Gerbang | Pemilik | Syarat PASS |
|---|---|---|
| Analisis | `laras`, `bima` | Story punya kriteria penerimaan; TSD punya kontrak API dan model data |
| Rencana | `ayu`, `wulan` | Estimasi ≤ kapasitas; setiap item punya pemilik dan ketergantungan |
| Kode | developer | Build, lint, typecheck bersih; tes unit untuk logika baru |
| Review | `andi` | Tidak ada `MUST FIX`; CI hijau |
| Uji | `yoga` | Kasus wajib lulus; tidak ada bug Critical/High terbuka; regresi lulus |
| Keamanan | `fajar` | Tidak ada temuan Critical/High terbuka |
| Rilis | `rina`, `hendra` | Semua gerbang di atas PASS atau WARN yang diterima |

## Definition of Done per item

- [ ] Kriteria penerimaan terpenuhi dan diverifikasi.
- [ ] Kode di-review dan disetujui Tech Lead.
- [ ] Tes otomatis ditambahkan; seluruh suite hijau.
- [ ] QA menguji dan menandatangani.
- [ ] Tidak ada rahasia, log debug, atau TODO tanpa tiket.
- [ ] Dokumentasi atau catatan rilis diperbarui bila perilaku berubah.
