# Warm Clay — Redesign UI/UX Puraloka Suite (2026)

**Status:** Disetujui untuk lanjut ke implementation plan
**Tanggal:** 2026-07-15
**Cakupan:** Full redesign — design system + seluruh halaman web (dashboard, proyek, keuangan, kas, mandor, procurement, portal client/mandor, dst) + parity token/komponen di mobile app.

---

## 1. Latar Belakang & Tujuan

Puraloka Suite saat ini memakai light/dark theme berbasis token CSS yang solid secara teknis (`apps/web/app/globals.css`), tapi terasa seperti dashboard SaaS generik: flat card, radius kecil (12px), shadow tipis datar, warna status saturated standar (hijau/kuning/merah Bootstrap-style). User ingin arah baru yang:

- Mengikuti tren desain 2026 — tidak kaku, terasa "hidup"/fun dipakai sehari-hari
- Tetap **long-lasting** — bukan gaya yang cepat terasa basi dalam 1-2 tahun
- Tetap kredibel untuk software yang menangani uang (invoice, kasbon, cash management) dan dipakai lintas peran (admin, PM, mandor lapangan yang kurang tech-savvy, client)
- Mempertahankan identitas brand navy Puraloka Persada

Arah yang dipilih setelah eksplorasi mockup (3 varian palet dibandingkan langsung): **Varian A — navy dipertahankan sebagai warna utama, aksen amber/terracotta untuk kehidupan visual.** Nama arah desain: **"Warm Clay"** — claymorphism-lite (bukan neumorphism monokrom keras) dengan basis warna hangat.

---

## 2. Prinsip Desain

1. **Navy tetap identitas, amber/terracotta adalah kehidupan.** Warna dasar UI (chrome, tombol utama, header) tetap navy — bukan diganti. Amber/terracotta dipakai selektif: progress bar, highlight, badge, ilustrasi/empty state. Ini menjaga kepercayaan finansial (software ini menangani uang klien) sambil tetap terasa hangat.
2. **Tactile, bukan flat.** Card, tombol, modal punya radius besar + shadow berlapis lembut + inset highlight tipis. Interaksi terasa: hover = lift halus, klik/aktif = sedikit "tertekan". Ini yang membuat UI terasa fun tanpa jadi cartoonish.
3. **Data tetap raja di area padat.** Di tabel, Gantt chart, dan Kurva S/EVM — kontainer luar tetap claymorphism, tapi baris/sel/bar di dalamnya di-tone-down (radius kecil, shadow minimal, spacing rapat) supaya tetap scannable. Konsisten dengan cara ERP finance/EVM sungguhan menampilkan data padat.
4. **Tipografi yang sudah punya karakter, dieksploitasi lebih jauh.** Bricolage Grotesque (display) + Plus Jakarta Sans (body) dipertahankan — sudah organik dan cocok — tapi dipakai lebih berani di angka KPI dan hierarki, bukan sekadar dipasang.
5. **Dark mode adalah warga kelas satu, bukan invert otomatis.** Setiap keputusan warna baru di light mode punya padanan dark mode yang sengaja disesuaikan (terutama shadow claymorphism dan amber/terracotta supaya tidak neon di atas gelap).

---

## 2A. Konvensi Kode Komponen (Arsitektur, bukan cuma Visual)

Redesign ini juga menaikkan level konvensi penulisan komponen ke pola yang sudah terbukti di project lain milik user (`automation-tjs/admin-dashboard`), yang mengikuti standar **shadcn/ui** — pola paling umum dipakai di ekosistem React/Next.js modern:

- **Lokasi terpusat**: primitive/base component di `apps/web/components/ui/` (satu file per komponen: `button.tsx`, `card.tsx`, `badge.tsx`, dst). Komponen spesifik domain/fitur (mis. `rab-section.tsx`, `mandor-section.tsx`) tetap di `apps/web/components/` root seperti sekarang — hanya primitive yang pindah ke `ui/`.
- **Styling via Tailwind utility class**, bukan inline `style={{ background: "var(--navy)" }}`. Warna tetap bersumber dari CSS custom property (design token §3), tapi diekspos ke Tailwind lewat `@theme` mapping (mis. `bg-primary` → `var(--primary)`), sehingga dipakai sebagai class (`className="bg-primary"`), bukan inline style.
- **Varian komponen via `class-variance-authority` (cva)** — setiap komponen dengan variant (Button: primary/secondary/accent/danger/ghost; Badge: ok/warn/danger/info) didefinisikan sebagai satu `cva(...)` config, bukan lookup object manual.
- **`cn()` helper** (`clsx` + `tailwind-merge`) di `apps/web/lib/utils.ts` untuk menggabungkan className dengan aman (menghindari konflik utility class yang saling override).
- **`data-slot` attribute** pada elemen root tiap komponen (mis. `data-slot="card"`) — memudahkan styling kontekstual dari parent (`has-data-[slot=...]`) dan konsisten dengan pola automation-tjs.
- Dependency baru yang perlu ditambahkan ke `apps/web/package.json`: `clsx`, `tailwind-merge`, `class-variance-authority`. Headless primitive library (`@base-ui/react`, dipakai automation-tjs untuk Dialog/Select/dsb yang butuh accessibility behavior kompleks) **ditunda** — baru dievaluasi saat fase yang benar-benar butuh (Modal/Dialog di fase halaman, bukan fase design system dasar).

Ini adalah keputusan arsitektur, bukan sekadar penempatan file — migrasi dari inline-style ke utility-class+cva adalah upgrade konvensi kode yang disengaja, disetujui user secara eksplisit setelah membandingkan dengan `automation-tjs`.

---

## 3. Design Tokens

### 3.1 Warna — Light Mode

| Token | Hex | Pemakaian |
|---|---|---|
| `--bg` | `#FBF7F1` | Background halaman (warm cream, bukan putih dingin) |
| `--surface` | `#FFFFFF` | Card, modal, panel utama |
| `--surface-2` | `#F4EEE4` | Nested element, hover state, row alternating |
| `--surface-subtle` | `#F7F2EA` | Section background di dalam card |
| `--border` | `rgba(43,38,33,0.08)` | Border tipis nyaris invisible |
| `--border-strong` | `rgba(43,38,33,0.14)` | Border yang perlu sedikit lebih terlihat (input focus ring base, dsb) |
| `--text-primary` | `#2B2621` | Teks utama (warm charcoal, bukan hitam pekat) |
| `--text-secondary` | `#8A7F72` | Teks sekunder/label |
| `--text-muted` | `#B0A695` | Placeholder, teks non-esensial |
| `--primary` (navy) | `#003B5C` | Tombol utama, active nav, highlight identitas brand |
| `--primary-soft` | `#E4EEF2` | Background ikon/badge bertema navy |
| `--accent` (amber) | `#E08A3C` | Progress bar, highlight sekunder, aksen dekoratif |
| `--accent-soft` | `#FBE8D3` | Background badge/ikon bertema amber |
| `--accent-2` (terracotta) | `#C75D3D` | Aksen kedua untuk gradasi progress bar, CTA sekunder hangat |
| `--success` | `#4C7A54` | Status positif (warm green, bukan saturated) |
| `--success-bg` | `#E7F0E4` | |
| `--warning` | `#C48A2E` | Status perlu perhatian |
| `--warning-bg` | `#FBEFD8` | |
| `--danger` | `#B5533F` | Status negatif/ditolak |
| `--danger-bg` | `#F8E4DD` | |
| `--info` | `#3E6E8E` | Info netral (varian navy lebih terang) |
| `--info-bg` | `#E8F0F4` | |

### 3.2 Warna — Dark Mode

| Token | Hex/Value | Catatan |
|---|---|---|
| `--bg` | `#14181F` | Gelap netral, bukan hitam pekat |
| `--surface` | `#1D222B` | |
| `--surface-2` | `#242A35` | |
| `--surface-subtle` | `#191E26` | |
| `--border` | `rgba(255,255,255,0.07)` | |
| `--border-strong` | `rgba(255,255,255,0.14)` | |
| `--text-primary` | `#F2EFE9` | Warm off-white, bukan putih pekat |
| `--text-secondary` | `#9CA3AF` | |
| `--text-muted` | `#6B7280` | |
| `--primary` (navy→terang) | `#4D9FFF` | Sama seperti sistem lama — navy jadi terang di dark |
| `--primary-soft` | `rgba(77,159,255,0.12)` | |
| `--accent` (amber, di-redupkan) | `#E8A868` | Sedikit lebih lembut dari light mode supaya tidak neon |
| `--accent-soft` | `rgba(232,168,104,0.14)` | |
| `--accent-2` (terracotta, di-redupkan) | `#D97F5E` | |
| `--success` | `#6FA97A` | |
| `--warning` | `#D9A24F` | |
| `--danger` | `#D97B68` | |
| `--info` | `#6FA8C9` | |

Semua `-bg` varian status di dark mode pakai formula `rgba(<hex>, 0.12–0.16)` konsisten dengan pola dark mode yang sudah ada di codebase.

### 3.3 Shadow & Depth (Claymorphism-lite)

| Token | Light | Dark |
|---|---|---|
| `--shadow-1` (resting) | `0 1px 2px rgba(43,38,33,.06), 0 1px 1px rgba(43,38,33,.04)` | `0 1px 2px rgba(0,0,0,.30), 0 1px 1px rgba(0,0,0,.20)` |
| `--shadow-2` (raised/hover) | `0 8px 20px -6px rgba(43,38,33,.14), 0 2px 6px rgba(43,38,33,.06)` | `0 8px 20px -6px rgba(0,0,0,.45), 0 2px 6px rgba(0,0,0,.25)` |
| `--shadow-inset` | `inset 0 1px 0 rgba(255,255,255,.6)` | `inset 0 1px 0 rgba(255,255,255,.04)` |
| `--shadow-press` (active/click) | `0 1px 1px rgba(43,38,33,.08)` | `0 1px 1px rgba(0,0,0,.35)` |

### 3.4 Radius Scale

| Token | Value | Pemakaian |
|---|---|---|
| `--radius-sm` | `10px` | Badge, chip, input kecil |
| `--radius-md` | `14px` | Button, list item, table container corner |
| `--radius-lg` | `20px` | Card, panel |
| `--radius-xl` | `24px` | Modal, hero section |
| `--radius-pill` | `999px` | Badge status, tombol pill, avatar |
| `--radius-dense` | `8px` | Sel/baris di area data-dense (tabel, chart internal) |

### 3.5 Tipografi

- Display: **Bricolage Grotesque** (dipertahankan) — dipakai lebih berani: angka KPI 26–32px weight 800, heading section 18–20px weight 700.
- Body: **Plus Jakarta Sans** (dipertahankan) — body 14–14.5px weight 400/500, label 12–13px weight 600 uppercase tracking-wide untuk eyebrow/kolom header.
- Tidak ada penggantian font family — perubahan hanya di scale & weight usage.

### 3.6 Motion

- Hover card/button: `transform: translateY(-2px) atau (-3px)` + shadow naik dari `--shadow-1` ke `--shadow-2`, durasi 150–200ms ease.
- Active/press: `transform: translateY(0) scale(0.98)`, shadow turun ke `--shadow-press`, durasi 100ms.
- Theme switch (light/dark): pertahankan transition serentak yang sudah ada di globals.css (`background-color, border-color, color, box-shadow, fill, stroke` 220ms ease).
- Reduced motion: hormati `prefers-reduced-motion` — matikan translateY/scale, sisakan transisi warna saja.

---

## 4. Komponen

### 4.1 Button
- **Primary**: `--primary` bg, teks putih, radius `--radius-md`, `--shadow-1` + `--shadow-inset` resting (naik ke `--shadow-2` saat hover — sama seperti KPI card, supaya efek hover terasa kontras), active press.
- **Secondary/ghost**: `--surface-2` bg, `--text-primary`, border `--border`.
- **Accent** (CTA hangat, dipakai untuk aksi "fun"/promosi minor, bukan aksi utama): `--accent` bg.
- **Danger**: `--danger` bg, dipakai untuk reject/delete.
- Semua button: radius `--radius-md`, padding `12px 22px` (default size), font-weight 700.

### 4.2 Card
- **KPI card**: radius `--radius-lg`, `--shadow-1` + `--shadow-inset` resting, hover ke `--shadow-2` + lift 3px. Ikon dalam lingkaran radius `--radius-md` dengan bg `-soft` varian warna kontekstual.
- **Panel/list container** (project list, activity feed, dst): radius `--radius-lg`, sama shadow treatment, header dengan tag pill kanan atas (`--surface-2` bg, radius pill).
- **List item di dalam panel** (project item, dsb): radius `--radius-md`, bg `--surface-2`, hover translateX(3px) halus.

### 4.3 Badge / Status Pill
- Radius `--radius-pill`, padding `5px 11px`, font-weight 700, font-size 12px.
- Varian: `ok` (success), `warn` (warning), `danger` (danger), `info` (info) — semua pakai pasangan `-bg` + warna teks solid.

### 4.4 Input / Select / Textarea
- Radius `--radius-md` (bukan `--radius-sm` seperti card kecil — cukup besar untuk terasa lembut tapi tidak berlebihan di form padat).
- Border `--border`, focus state: border `--primary` + glow ring `box-shadow: 0 0 0 3px var(--primary-soft)`.
- Tetap konsisten dengan `.input-base` yang sudah ada, hanya update radius & focus glow color.

### 4.5 Modal
- Radius `--radius-xl`, `--shadow-2` kuat, backdrop blur ringan (`backdrop-filter: blur(4px)`) di atas overlay gelap transparan.
- Tetap render via `createPortal` (pola yang sudah ada & sudah benar, dipertahankan).

### 4.6 Toast
- Radius `--radius-md`, shadow `--shadow-2`, slide-in dari kanan/atas (pola animasi yang sudah ada dipertahankan, hanya update shape/shadow token).

### 4.7 Tabel & Area Data-Dense (Gantt, Kurva S/EVM)
- **Kontainer luar** (card pembungkus tabel/chart): claymorphism penuh — radius `--radius-lg`, shadow `--shadow-1`.
- **Di dalam** (row, cell, chart bar/axis): radius `--radius-dense` (8px) atau 0 untuk cell, shadow minimal/none, spacing rapat (padding vertikal 8–10px per row, bukan 14px seperti card list), border antar-row tipis (`--border`) atau zebra-stripe `--surface-2`.
- Header kolom tabel: sticky, `--text-secondary`, uppercase tracking-wide, tanpa shadow.
- Prinsip: semakin padat datanya (banyak baris/angka dipindai cepat), semakin dikurangi ornamentasinya — supaya mata tidak lelah tapi kontainer luar tetap terasa "Warm Clay".

### 4.8 Sidebar & Topbar
- Sidebar: bg `--surface`, item aktif pakai `--primary-soft` bg + `--primary` text + radius `--radius-md`, bukan garis indikator flat.
- Topbar: bg `--surface`, shadow `--shadow-1` tipis di bawahnya, search button & notification bell pakai radius `--radius-pill`/`--radius-md`.

### 4.9 Empty State
- Ilustrasi/ikon besar pakai warna `--accent`/`--accent-2` (di sinilah warna hangat paling leluasa dipakai karena tidak berkaitan langsung dengan data finansial), copy singkat + CTA jelas.

---

## 5. Halaman & Modul yang Terdampak

Semua halaman di `apps/web/app/(dashboard)/**` dan komponen di `apps/web/components/**` (lihat struktur lengkap di CLAUDE.md) mengikuti token & komponen di atas. Modul dengan kebutuhan khusus:

- **Kurva S/EVM, Gantt Chart**: ikuti aturan §4.7 — chart tetap pakai warna primary/accent untuk garis/bar sesuai makna data (Rencana/Aktual/Progress Fisik), bukan direstyle sembarangan.
- **Procurement (8 tab)**: tab navigation pakai pill style baru; tabel-tabel di dalamnya (MR, PO, GR, stok) ikuti §4.7.
- **Portal Client & Mandor Portal**: token sama persis dengan dashboard admin — konsistensi visual lintas role adalah bagian dari "long-lasting", bukan didesain terpisah.
- **Mobile app (Expo)**: bukan implementasi native identik pixel-for-pixel, tapi token warna, radius, dan filosofi shadow/motion yang sama diterapkan sepadan dengan konvensi React Native (mis. `elevation`/`shadowRadius` alih-alih CSS box-shadow).

---

## 6. Rencana Fase Implementasi (untuk writing-plans)

Urutan fase, masing-masing punya milestone yang bisa direview terpisah:

1. **Design system** — update `globals.css` (token light+dark lengkap §3), update komponen dasar bersama (button, card, badge, input, modal shell, toast) yang dipakai lintas halaman.
2. **Dashboard + Detail Proyek** — halaman paling sering dibuka: dashboard home, proyek list, proyek detail (RAB, Kurva S, Gantt, Progress Log, Change Order, Milestone, Dokumen).
3. **Keuangan + Kas** — invoice, kasbon lintas proyek, cash accounts, transfer, expenses.
4. **Mandor** — halaman admin mandor (ringkasan, work scope, kasbon, wage report) + detail profil mandor.
5. **Procurement** — 8 tab (Supplier, Material, MR, PO, GR, Hutang Supplier, Stok, Laporan).
6. **Halaman pendukung** — Klien, Users, Notifikasi (panel + history), Audit, Kalender, Sistem, Pengaturan, Search/command palette.
7. **Portal Client + Mandor Portal** — terapkan token yang sama ke kedua portal read-only/terbatas.
8. **Mobile app (Expo)** — parity token & komponen dasar di React Native.

Tiap fase = satu unit kerja yang bisa diselesaikan, ditest visual, dan direview sebelum lanjut ke fase berikutnya.

---

## 7. Di Luar Cakupan

- Tidak mengubah struktur data/API — ini murni redesign visual, tidak ada perubahan skema database atau endpoint.
- Tidak menambah fitur baru (RFI, punch list, retensi, dll dari riset benchmark ERP) — itu inisiatif terpisah yang sudah dibahas di percakapan, belum di-spec.
- Tidak mengganti font family.
- Tidak redesign ulang arsitektur navigasi/IA (sidebar tetap struktur menu yang sama).

---

## 8. Kriteria Sukses

- Semua halaman memakai token baru (tidak ada hardcoded hex lama seperti `#003366` tersisa di komponen).
- Light & dark mode sama-sama diverifikasi visual per fase (skrinsyot/manual check via `webapp-testing` skill saat implementasi).
- Area data-dense (tabel, Gantt, Kurva S) tetap terasa scannable — diverifikasi dengan melihat halaman Procurement/RAB yang paling padat datanya.
- Identitas navy Puraloka Persada tetap dikenali di setiap halaman.
