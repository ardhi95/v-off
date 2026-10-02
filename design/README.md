# Desain v-off (mockup)

Mockup interaktif dibuat di Claude (Design canvas). Versi live (privat milik Ardhi): https://claude.ai/artifact/QfKAfG6FTjHvAUVTrBLqsU

File di `mockup/` adalah sumber artboard tersebut.

| File | Layar | Isi |
|---|---|---|
| `Main.dc.html` | Ruang Tim 3D | Kanvas WebGL, label nama, filter status, feed, panel detail agent |
| `Laporan.dc.html` | Laporan & Scorecard | KPI, tabel per agent (bisa diurutkan), grafik aktivitas, per departemen, kartu pos |
| `Pengaturan.dc.html` | Pengaturan Tim | Daftar agent yang bisa diedit, departemen, sumber data, suasana kantor |
| `canvas.json` | — | Indeks artboard (abaikan untuk implementasi) |

## Cara membaca `Main.dc.html`

Seluruh logika ada di blok `<script type="text/x-dc" data-dc-script>` (kelas `Component`).

- `constructor`: data contoh. `this.PODS` (meja tim), `this.AG` (18 agent beserta peran, status, hewan, log), `ZOO` (hewan per agent), `this.PATH` (rute office boy), dan `this.VIEWS` (preset kamera).
- `buildStatic()`: seluruh lantai dan furnitur (satuan cm, sumbu Y ke atas, kamera default dari +Z).
- `seated()` / `sitBody()` / `standBody()` / `walker()`: tubuh karakter (duduk, berdiri, berjalan).
- `animalHead()` / `tail()`: kepala dan ekor per spesies, plus ekspresi per status.
- `playSpots()` / `assignSpots()`: tempat bermain untuk agent idle.
- `updateOB()`: animasi office boy (berjalan antar waypoint, berhenti untuk mengepel).
- `renderVals()`: data untuk UI (tag, filter, panel detail, feed).

## Token visual

- Latar `#0f1218`, panel `#161a22`, garis `#252b38`, teks `#e8eaf0`, teks redup `#9aa1b2`, aksen `#f5b83d`.
- Status: Bekerja `#35b87a`, Terblokir `#ef6a3c`, Memimpin rapat `#8b7bff`, Menyimak `#8a90a0`, Istirahat `#ff7a9c`, Bersih-bersih `#2fb5c9`.
- Font: Plus Jakarta Sans (UI) dan JetBrains Mono (angka/kode).
- Sudut membulat (panel 18px, tombol 12px, chip pill), tanpa gaya pixel.
