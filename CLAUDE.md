# Puraloka Suite — Context for Claude Code

## Tentang Project
Aplikasi manajemen konstruksi untuk **Puraloka Persada** milik Nizar (nihzaa).
Platform bernama **Puraloka Suite** — web dashboard admin + mobile app + backend API.

## Repository
- GitHub: `https://github.com/nihzaa/puraloka-suite` (Private)
- Local: `E:\Project\puraloka-suite`

---

## Tech Stack

| Layer | Teknologi |
|---|---|
| Backend API | Node.js + Fastify + TypeScript |
| Web Dashboard | Next.js 16 + Tailwind CSS v4 + TypeScript |
| Mobile | React Native + Expo (belum disetup) |
| Database | PostgreSQL via Supabase |
| Auth | Supabase Auth (email/password + Google OAuth aktif) |
| Storage | Supabase Storage |
| Package Manager | pnpm (monorepo dengan pnpm workspaces) |
| Language | TypeScript semua layer |

## Monorepo Structure
```
puraloka-suite/
├── apps/
│   ├── api/          → Fastify backend (port 3001)
│   ├── web/          → Next.js dashboard (port 3000)
│   └── mobile/       → React Native Expo (belum disetup)
├── packages/
│   └── shared/       → Types & constants bersama
├── db/
│   ├── migrations/   → SQL migration files (001-011)
│   └── seeds/        → Seed data dummy
├── supabase/
│   └── migrations/   → Copy dari db/migrations (untuk supabase db push)
└── CLAUDE.md
```

---

## Supabase Configuration
- Project name: `puraloka-suite-dev`
- Project URL: `https://tgozokxyvwmyvajgqfxw.supabase.co`
- Region: Southeast Asia (Singapore)
- Auth providers aktif: Email/Password, Google OAuth
- **RLS: DISABLED di semua tabel** (sengaja untuk development, perlu diaktifkan kembali dengan proper policies sebelum production)

---

## Database — 23 Tabel

### Core Tables
- `users` — semua user (admin, pm, mandor, client). Auth dihandle Supabase, kolom `auth_id` FK ke `auth.users`
- `clients` — data klien (mayoritas perorangan, bukan perusahaan)
- `projects` — master proyek konstruksi

### Finance Tables
- `termin_schedules` — jadwal penagihan untuk model termin
- `expense_category_templates` — template kategori pengeluaran global
- `project_expense_categories` — kategori per proyek (clone dari template)
- `expense_reports` — laporan pengeluaran untuk model komisi
- `expense_items` — detail item per laporan pengeluaran
- `invoices` — invoice ke klien
- `payments` — pembayaran masuk dari klien
- `tax_records` — rekap pajak per invoice

### Mandor Tables
- `mandor_assignments` — kontainer penugasan mandor ke proyek
- `work_scopes` — unit pekerjaan per mandor (tiap scope punya payment_system sendiri)
- `daily_wage_logs` — log upah harian
- `kasbons` — kasbon mandor (berlaku semua payment_system)
- `progress_payments` — pembayaran per persentase progress
- `borongan_settlements` — settlement akhir pekerjaan borongan

### Monitoring Tables
- `milestones` — target pencapaian proyek
- `progress_logs` — log progress harian
- `project_photos` — foto dokumentasi lapangan
- `documents` — dokumen proyek

### System Tables
- `notifications` — notifikasi ke user
- `audit_logs` — rekam jejak perubahan data

---

## Business Logic Kritis

### Contract Models
- `termin` — tagih klien per tahap sesuai `termin_schedules`
- `komisi` — lapor pengeluaran via `expense_reports`, tagih total + `commission_pct`

### Tax Schemes
- `pph_final` — default untuk klien perorangan, PPh final pasal 4(2) tarif 2%
- `ppn` — untuk B2B, PPN 11%

### Mandor Payment Systems
- `harian` — bayar per minggu, input total upah langsung (tidak dirinci per tukang)
- `borongan` — bayar setelah selesai, ada settlement akhir
- `progress_pct` — bayar per persentase progress, kasbon limit 80% dari earned value

### Kasbon Rules
- Berlaku untuk SEMUA payment_system
- Selalu di level mandor (bukan per tukang individual)
- Tujuan: `gaji_tukang`, `uang_makan`, `pembelian_alat`, `operasional`, `lain_lain`
- Fund source: `owner_advance` atau `client_fund`

### Roles & Access
- `admin` — akses penuh, bisa register user baru
- `pm` — kelola proyek yang di-assign
- `mandor` — lihat scope sendiri, input progress, lihat kasbon sendiri
- `client` — read-only portal proyek mereka

---

## API Endpoints (yang sudah ada)

**Base URL:** `http://localhost:3001`

| Method | Endpoint | Deskripsi |
|---|---|---|
| GET | `/health` | Health check |
| POST | `/api/v1/auth/login` | Login, return token |
| POST | `/api/v1/auth/register` | Daftarkan user baru (admin only) |
| GET | `/api/v1/auth/me` | Data user yang login |
| POST | `/api/v1/auth/refresh` | Refresh token |
| GET | `/api/v1/projects` | List semua proyek + join clients & PM |
| GET | `/api/v1/projects/:id` | Detail proyek + semua nested data |
| GET | `/api/v1/dashboard?period=` | Dashboard aggregation data |

**Period params:** `last_30_days`, `last_3_months`, `last_6_months`, `this_year`, `all_time`

**Auth header:** `Authorization: Bearer <token>`

---

## API File Structure
```
apps/api/src/
├── index.ts              → Fastify entry point (port 3001)
├── utils/
│   └── supabase.ts       → Supabase client (service role)
├── plugins/
│   └── auth.ts           → authenticate middleware + requireRole guard
└── routes/
    └── v1/
        ├── auth.ts       → Auth routes
        ├── projects.ts   → Projects routes
        └── dashboard.ts  → Dashboard aggregation route
```

---

## Web App Structure
```
apps/web/
├── app/
│   ├── layout.tsx                    → Root layout (fonts: Bricolage Grotesque + Plus Jakarta Sans)
│   ├── globals.css                   → Design tokens (Tailwind v4 @theme)
│   ├── page.tsx                      → Root redirect ke /dashboard
│   ├── login/
│   │   └── page.tsx                  → Login page (berfungsi, email+password)
│   └── (dashboard)/
│       ├── layout.tsx                → Dashboard layout dengan sidebar
│       └── dashboard/
│           └── page.tsx              → Dashboard home (BERFUNGSI dengan data real)
├── components/
│   ├── sidebar.tsx                   → Sidebar navigasi
│   └── topbar.tsx                    → Top navigation bar
├── lib/
│   ├── supabase.ts                   → Supabase client (anon key)
│   └── api.ts                        → Axios client + login/logout/cookie handling
└── middleware.ts                     → Auth guard (redirect berdasarkan cookie token)
```

---

## Design System — AKAN DIUBAH KE LIGHT THEME

**Status saat ini:** Dark theme dengan navy/blue accent
**Target redesign:** Light theme modern

**Warna brand:**
- Logo/Brand: `#003366` (navy deep) → akan jadi AKSEN, bukan warna utama
- Aksen sekunder: `#0066CC` untuk link dan icon aktif

**Target color system (light theme):**
- Background: `#F8F9FA` warm white
- Surface/card: `#FFFFFF` dengan shadow tipis
- Aksen utama: `#003366` untuk tombol, active state, highlight
- Text primary: `#111827`
- Text secondary: `#6B7280`
- Border: `#E5E7EB`
- Success: `#15803d`, Warning: `#D97706`, Danger: `#B91C1C`

**Fonts:**
- Display/Headings: `Bricolage Grotesque`
- Body: `Plus Jakarta Sans`

**Prinsip UI:**
- Clean, modern, enterprise-grade seperti Notion/Stripe/Linear light mode
- Tidak boleh terlihat seperti template generik
- Konsisten di web dan mobile nanti

---

## Auth Flow
1. User buka app → `middleware.ts` cek cookie `puraloka_token`
2. Tidak ada token → redirect ke `/login`
3. Login sukses → token disimpan di cookie + user data di localStorage
4. Semua API call otomatis sisipkan token via axios interceptor
5. Token expire → hapus cookie manual, login ulang

**Catatan penting:** Token Supabase expire setelah ~1 jam. Kalau dashboard return 401, hapus cookie `puraloka_token` dan `puraloka_refresh` di DevTools → Application → Cookies, lalu login ulang.

---

## Environment Variables

**apps/api/.env:**
```
PORT=3001
SUPABASE_URL=https://tgozokxyvwmyvajgqfxw.supabase.co
SUPABASE_SECRET_KEY=<service role key>
JWT_SECRET=<secret>
```

**apps/web/.env.local:**
```
NEXT_PUBLIC_API_URL=http://localhost:3001
NEXT_PUBLIC_SUPABASE_URL=https://tgozokxyvwmyvajgqfxw.supabase.co
NEXT_PUBLIC_SUPABASE_KEY=<publishable key>
```

---

## Cara Menjalankan

**Backend API:**
```bash
cd E:\Project\puraloka-suite\apps\api
node --loader ts-node/esm src/index.ts
```

**Frontend Web:**
```bash
cd E:\Project\puraloka-suite\apps\web
pnpm dev
```

---

## Seed Data (sudah ada di database)
- 5 proyek (4 aktif, 1 selesai) di Bandung
- 12 users: 1 admin (nizarzul16@gmail.com), 2 PM, 4 mandor, 5 client
- Data lengkap: termin, invoice, kasbon, progress logs, milestones, payments
- Data periode: Februari - Mei 2026

---

## Status Dashboard (SUDAH BERFUNGSI)
Dashboard home page sudah menampilkan data real:
- ✅ KPI cards: proyek aktif, total kontrak, invoice outstanding, kas bersih
- ✅ Cashflow area chart 8 minggu
- ✅ Donut chart distribusi status proyek
- ✅ Progress bar per proyek aktif
- ✅ Tabel invoice belum lunas
- ✅ Alert banner invoice overdue
- ✅ Period filter: 30 hari, 3 bulan, 6 bulan, tahun ini, semua
- ✅ Auth guard (redirect ke login jika tidak ada token)

---

## Known Issues & TODO

### Harus diselesaikan sebelum production:
1. **RLS policies** — RLS saat ini DISABLED. Perlu dibuat proper RLS policies per role sebelum production
2. **Token refresh** — belum ada auto-refresh token, user harus login ulang kalau expired
3. **Google OAuth** — provider aktif di Supabase tapi belum diwire ke tombol login di frontend

### Next development tasks (urutan prioritas):
1. **Redesign UI ke light theme** — dengan aksen #003366, style modern clean
2. **Draggable widget dashboard** — pakai `react-grid-layout`, layout tersimpan per user
3. **Halaman Proyek** — list + detail proyek
4. **Halaman Keuangan** — invoice, expense, cashflow
5. **Halaman Mandor** — assignment, kasbon, upah
6. **Halaman Laporan** — export PDF/Excel
7. **More API endpoints** — mandor, kasbon, invoices, expenses, progress
8. **Remote config untuk mobile** — CMS dari dashboard untuk kontrol banner/widget mobile
9. **Mobile app** — React Native Expo (belum disetup)
10. **Google OAuth** — implementasi di frontend

---

## Naming Conventions
- Database: `snake_case`, plural
- TypeScript: `camelCase` variabel, `PascalCase` komponen/types
- Files: `kebab-case`
- Git branches: `feature/nama-fitur`
- Commit: Conventional Commits (`feat:`, `fix:`, `chore:`, dll)