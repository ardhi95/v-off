# Profil Mobile: Android

Praktik umum. **Stack dan pola nyata ditentukan overlay proyek mobile** (lihat
`PROJECT_OVERLAY_TEMPLATE.md`). Jika overlay belum ada, berhenti dan lapor `macet`.

## Arsitektur (default bila overlay tidak menentukan)

- Kotlin, Jetpack Compose, satu Activity.
- Lapisan: UI (Composable) -> ViewModel (`StateFlow` UI state) -> UseCase (opsional) -> Repository ->
  sumber data (Retrofit/Ktor, Room, DataStore).
- DI: Hilt atau Koin, mengikuti proyek.
- Navigasi: Navigation Compose dengan argumen bertipe.
- Coroutine: `viewModelScope`; I/O di `Dispatchers.IO` lewat repository; NEVER `GlobalScope`.

## Kode

- NEVER `!!`. Pakai tipe nullable dan penanganan eksplisit.
- UI state immutable (`data class`), satu sumber kebenaran per layar.
- Composable tanpa logika bisnis; preview untuk setiap komponen.
- String di `strings.xml`, bukan hard-code.

## Keamanan

- Kredensial dan token di Android Keystore / EncryptedSharedPreferences atau DataStore terenkripsi.
- Izin seminimal mungkin; minta saat dibutuhkan, dengan penjelasan.
- `usesCleartextTraffic=false`; network security config; pertimbangkan certificate pinning bila
  overlay mewajibkan.
- R8/ProGuard aktif di build rilis; tanpa log sensitif di rilis.
- Validasi deep link dan intent eksternal.

## Aksesibilitas

`contentDescription` untuk ikon bermakna, target sentuh ≥ 48dp, dukung skala font dan TalkBack.

## Tes

- Unit: ViewModel dan UseCase (JUnit, Turbine untuk Flow, MockK).
- UI: Compose UI Test atau Espresso untuk alur kritis.
- Gerbang: `./gradlew lint test assembleDebug` hijau. Jika Gradle gagal, lapor `macet` dengan potongan
  galat yang relevan.
