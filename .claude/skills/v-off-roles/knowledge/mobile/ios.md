# Profil Mobile: iOS

Praktik umum. **Stack dan pola nyata ditentukan overlay proyek mobile** (lihat
`PROJECT_OVERLAY_TEMPLATE.md`). Jika overlay belum ada, berhenti dan lapor `macet`.

## Arsitektur (default bila overlay tidak menentukan)

- Swift, SwiftUI, Swift Concurrency (`async/await`, `@MainActor` untuk state UI).
- Lapisan: View -> ViewModel/`@Observable` model -> Service/UseCase -> Repository -> sumber data
  (`URLSession`, SwiftData/Core Data, Keychain).
- Dependensi lewat Swift Package Manager.
- Navigasi: `NavigationStack` dengan rute bertipe.

## Kode

- NEVER force unwrap (`!`) atau `try!` di jalur produksi.
- View tanpa logika bisnis; preview untuk setiap View.
- String lewat String Catalog (`Localizable.xcstrings`).
- Galat bertipe (`enum ... : Error`) dan ditampilkan sebagai pesan yang ramah.

## Keamanan

- Token dan kredensial di Keychain, bukan `UserDefaults`.
- App Transport Security aktif; pengecualian hanya dengan alasan tertulis.
- Izin (`NS...UsageDescription`) seminimal mungkin dengan teks penjelasan.
- Privacy manifest (`PrivacyInfo.xcprivacy`) diperbarui saat menambah SDK atau API sensitif.
- Validasi URL scheme dan universal link.

## Aksesibilitas

Label VoiceOver, Dynamic Type, mode gelap, target sentuh ≥ 44pt, hormati Reduce Motion.

## Tes

- Unit: XCTest atau Swift Testing untuk ViewModel dan service.
- UI: XCUITest untuk alur kritis.
- Gerbang: `xcodebuild test` di simulator hijau. Jika build atau penandatanganan gagal, lapor `macet`.
  Jangan mengubah pengaturan signing atau provisioning tanpa izin user.
