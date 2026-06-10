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
| Auth | Supabase Auth (email/password + Google OAuth) |
| Storage | Supabase Storage |
| Realtime | Supabase Realtime |
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
Setiap proyek punya `contract_model`:
- `termin` — tagih klien per tahap sesuai `termin_schedules`
- `komisi` — lo lapor semua pengeluaran via `expense_reports`, tagih total pengeluaran + persentase komisi (`commission_pct`)

### Tax Schemes
- `pph_final` — default untuk klien perorangan, PPh final pasal 4(2) tarif 2%
- `ppn` — untuk B2B, PPN 11% (disiapkan, belum jadi fitur utama)

### Mandor Payment Systems
Setiap `work_scope` punya `payment_system` sendiri:
- `harian` — bayar per minggu, input total upah langsung (tidak dirinci per tukang)
- `borongan` — bayar setelah selesai, ada settlement akhir
- `progress_pct` — bayar per persentase progress, ada kasbon limit 80% dari earned value

### Kasbon Rules
- Berlaku untuk SEMUA payment_system
- Selalu di level mandor (bukan per tukang individual)
- Tujuan: `gaji_tukang`, `uang_makan`, `pembelian_alat`, `operasional`, `lain_lain`
- Fund source: `owner_advance` (talangan owner) atau `client_fund` (dari DP klien)
- Untuk `progress_pct`: kasbon limit = 80% dari earned value (bisa di-override per scope)
- Melebihi limit → warning + butuh approval override dari admin

### Roles & Access
- `admin` — akses penuh semua data, bisa register user baru
- `pm` — kelola proyek yang di-assign, input progress, kelola mandor
- `mandor` — lihat scope pekerjaan sendiri, input progress, lihat kasbon sendiri
- `client` — lihat progress proyek mereka saja, lihat invoice, tidak bisa edit apapun

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
        └── projects.ts   → Projects routes
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
│   │   └── page.tsx                  → Login page (sudah ada, berfungsi)
│   └── (dashboard)/
│       ├── layout.tsx                → Dashboard layout (placeholder, belum dibangun)
│       └── dashboard/
│           └── page.tsx              → Dashboard home (placeholder)
├── lib/
│   ├── supabase.ts                   → Supabase client (anon key)
│   └── api.ts                        → Axios client + login/logout/getStoredUser
└── middleware.ts                     → Auth guard (redirect berdasarkan cookie token)
```

---

## Design System — "Architectural Precision"

**Konsep:** Modern, bersih, industrial/blueprint. Konsisten di web dan mobile.

**Fonts:**
- Display/Headings: `Bricolage Grotesque` (geometric, architectural)
- Body: `Plus Jakarta Sans` (clean, Indonesian-made)

**CSS Variables (dari globals.css):**
```css
--color-ink: #16140f          /* near-black, primary text */
--color-ink-soft: #2b2823     /* sidebar background */
--color-paper: #faf8f3        /* warm off-white background */
--color-paper-pure: #ffffff   /* pure white for cards */
--color-amber: #d97706        /* primary accent */
--color-amber-deep: #b45309   /* hover state */
--color-amber-glow: #fbbf24   /* highlight */
--color-clay: #57534e         /* secondary text */
--color-line: #e7e2d6         /* borders/dividers */
--color-success: #15803d
--color-danger: #b91c1c
```

**Prinsip UI yang HARUS dijaga:**
- Tidak boleh pakai font Inter, Roboto, Arial, system fonts
- Tidak boleh pakai purple gradient on white (cliché)
- Selalu gunakan CSS variables di atas untuk warna
- Animasi: class `rise`, `rise-1`, `rise-2`, dst (sudah didefinisikan di globals.css)
- Dark sidebar (`--color-ink-soft`) + light content area (`--color-paper`)
- Tailwind v4 — config via `@theme` di CSS, bukan `tailwind.config.js`

---

## Auth Flow
1. User buka app → `middleware.ts` cek cookie `puraloka_token`
2. Tidak ada token → redirect ke `/login`
3. Login sukses → token disimpan di cookie + user data di localStorage
4. Semua API call otomatis sisipkan token via axios interceptor
5. Token expire → perlu refresh atau login ulang

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

## Seed Data (sudah ada di database)
- 5 proyek aktif/completed di Bandung
- 12 users (1 admin: nizarzul16@gmail.com, 2 PM, 4 mandor, 5 client)
- Data lengkap: termin, invoice, kasbon, progress logs, milestones, dll

---

## Naming Conventions
- Database: `snake_case`, plural
- TypeScript: `camelCase` variabel, `PascalCase` komponen/types
- Files: `kebab-case`
- Git branches: `feature/nama-fitur`
- Commit: Conventional Commits (`feat:`, `fix:`, `chore:`, dll)

---

## Yang Belum Dibangun (Next Steps)
1. **Dashboard layout** — sidebar navigasi + header + content area
2. **Dashboard home** — summary cards + list proyek + notifikasi
3. **Halaman Proyek** — list + detail proyek
4. **Halaman Keuangan** — invoice, expense, cashflow
5. **Halaman Mandor** — assignment, kasbon, upah
6. **Halaman Laporan** — export PDF/Excel
7. **Client Portal** — view-only untuk klien
8. **Mobile app** — React Native Expo (belum disetup sama sekali)
9. **More API endpoints** — mandor, kasbon, invoices, expenses, progress
10. **Google OAuth** — implementasi di frontend login page
