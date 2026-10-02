# Profil Web: React 18 + Vite + TypeScript + Tailwind

Disaring dari `rules/web.md` dan `skills/web/*` Planora. SPA murni: tidak ada SSR, Server Component,
`'use client'`, atau pola Next.js.

## Struktur

```
src/pages/               komponen tingkat rute
src/components/ui/       atom: Button, Input, Badge, Modal
src/components/common/   komposit yang dipakai ulang
src/components/features/ komponen khusus fitur
src/hooks/  src/store/  src/services/  src/types/  src/utils/  src/constants/  src/lib/
```

Overlay proyek boleh berbeda; ikuti struktur repo yang sudah ada.

## Penamaan

Komponen `PascalCase.tsx`; hook `useXxx.ts`; service `xxxService.ts`; interface data diawali `I`
bila proyek memakainya; konstanta `UPPER_SNAKE_CASE`.

## State

- Data server: TanStack Query (kunci query terpusat di `constants/queryKeys`).
- State global ringan (auth, UI): Zustand.
- State lokal: `useState`/`useReducer`.
- Prop drilling maksimal 2 level.

## Akses data

- Komponen dan hook **tidak** memanggil SDK/`fetch` langsung; selalu lewat `src/services/*`.
- Saat backend berganti, isi service yang berubah; signature tetap.

## Form

React Hook Form + Zod (`@hookform/resolvers/zod`). Skema dipakai ulang di BE bila memungkinkan.

## UI dan aksesibilitas

- `<button>` nyata, label untuk setiap input, kontras ≥ 4.5:1, fokus terlihat.
- Hormati `prefers-reduced-motion`.
- Warna lewat token Tailwind atau CSS variable; NEVER hex di JSX.
- Setiap layar punya status kosong, memuat, dan galat.
- Teks UI dalam bahasa produk (Bahasa Indonesia untuk proyek internal).

## Keamanan

- NEVER `dangerouslySetInnerHTML` dari data yang tidak tepercaya.
- Token tidak disimpan di `localStorage` tanpa persetujuan DevSecOps.
- Library berat (PDF, Excel, chart) dimuat dengan dynamic import.
- Hindari paket dengan kerentanan tanpa perbaikan (contoh Planora: `xlsx`/SheetJS diganti `exceljs`).

## Gerbang

`npm run lint` (`--max-warnings 0`), `npm run type-check`, `npm run test` hijau. PR UI menyertakan
tangkapan layar dan checklist verifikasi manual di browser.
