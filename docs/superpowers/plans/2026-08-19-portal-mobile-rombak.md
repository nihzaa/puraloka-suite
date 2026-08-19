# Rombak Portal Mandor, PM, Klien — Gaya Aplikasi Mobile — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rombak total 3 portal (`mandor-portal/`, `pm-portal/`, `portal/`) di `apps/web/` jadi bergaya aplikasi mobile profesional (bold fintech, navy-based), dengan fitur setuntas permission yang dimiliki tiap role — termasuk approval inbox PM yang saat ini sama sekali tidak ada UI-nya.

**Architecture:** Satu component library baru (`apps/web/components/portal/`) dipakai oleh ketiga portal lewat satu `PortalShell` dikonfigurasi per-role. Route/URL existing dipertahankan; isi file ditulis ulang total (inline `style={}` → token CSS var + component library). Backend TIDAK diubah kecuali dua penambahan sempit: (1) filter `pm_id` di endpoint approval inbox, (2) tidak ada penambahan permission baru — hanya meng-UI-kan yang sudah ada.

**Tech Stack:** Next.js App Router (client components, `"use client"`), Tailwind v4 (CSS vars di `globals.css`), `recharts` (sudah ada), axios (`@/lib/api`), `useData()` dari `@/lib/data-cache` (BELUM ADA pemakaian aktif di produksi — portal ini jadi adopter pertama).

**Spec:** `docs/superpowers/specs/2026-08-19-portal-mobile-rombak-design.md`

## Global Constraints

- Route/URL yang sudah ada (mis. `/mandor-portal/kasbon`) WAJIB dipertahankan — ganti isi file di tempat, jangan buat `-v2`.
- Warna: HANYA token dari `globals.css` (`--navy`, `--navy-mid`, `--grad-merek`, `--success/-bg/-border`, `--danger/-bg/-border`, `--warning/-bg/-border`, `--info/-bg/-border`, `--data-1..5`) — dilarang hex baru di luar token ini.
- Auth: `getStoredUser()` dari `@/lib/api`, redirect `router.replace("/login")` bila null — pola existing di ketiga layout, dipertahankan.
- Data fetching baru WAJIB pakai `useData<T>(url)` dari `@/lib/data-cache` — BUKAN `useState`+`useEffect`+`api.get` manual (pola lama yang ditinggalkan).
- Semua form submit di halaman mandor yang melibatkan konektivitas lapangan (progress, K3 insiden, punch list) WAJIB lewat `kirimLapangan()` dari `@/lib/kirim-lapangan` (offline-queue), BUKAN `api.post` langsung.
- Approve/reject entity APA PUN (kasbon, submittal, punch, dst) WAJIB memanggil endpoint existing apa adanya (body shape sudah ditentukan backend) — DILARANG menulis ulang urutan validasi atau membuat jalur approval kedua di luar `utils/approval.ts`. Lihat Task 8 untuk detail per-entity.
- `requirePermission` di backend, bukan literal role — kalau task butuh endpoint baru (hanya Task 7: filter PM di inbox), ikuti pola ini.
- Nominal `numeric`, waktu `timestamptz` — tidak relevan di task ini (tidak ada migrasi baru), dicatat untuk kelengkapan.
- WCAG 2.1 AA: kontras 4.5:1 teks, status TIDAK BOLEH hanya warna (selalu ikon + teks), fokus terlihat, `prefers-reduced-motion` dihormati.
- Setiap task diakhiri: `npx tsc --noEmit` bersih di `apps/web`, dan kalau ada perubahan API/test terkait, `cd apps/api && npx vitest run <file>`.

---

## Bagian A — Fondasi Bersama (Task 1–5)

### Task 1: Tipe bersama portal (PM & Klien) + perluas tipe mandor

**Files:**
- Create: `apps/web/app/pm-portal/_bersama/tipe.ts`
- Create: `apps/web/app/portal/_bersama/tipe.ts`
- Modify: `apps/web/app/mandor-portal/_bersama/tipe.ts` (tambah tipe untuk modul baru: K3, Punch, Inspeksi/RFI, Submittal, Retensi)

**Interfaces:**
- Consumes: tidak ada (task pertama)
- Produces: tipe-tipe berikut dipakai oleh SEMUA task halaman berikutnya:
  - `apps/web/app/mandor-portal/_bersama/tipe.ts` tambahan: `InsidenK3`, `JsaK3`, `InspeksiK3`, `PunchItem`, `Inspeksi`, `Rfi`, `Submittal`, `RetensiRegister`
  - `apps/web/app/pm-portal/_bersama/tipe.ts`: `BarisInbox`, `ResponsInbox`, `ProyekPM`, `KasbonPM`, `DokumenProyek`, `KontrakRingkas`
  - `apps/web/app/portal/_bersama/tipe.ts`: `PunchItemKlien`, `InspeksiKlien`, `SubmittalKlien`

- [ ] **Step 1: Baca struktur response API untuk tiap modul baru mandor**

Baca (read-only, untuk konfirmasi shape sebelum menulis tipe — field API bisa beda dari asumsi):
- `apps/api/src/routes/v1/k3-lapangan.ts` — cari `SELECT`/kolom response untuk insiden, jsa, inspeksi k3
- `apps/api/src/routes/v1/punch-list.ts` — cari `PUNCH_SELECT` (disebut di riset sebagai konstanta kolom)
- `apps/api/src/routes/v1/inspeksi.ts` dan `apps/api/src/routes/v1/rfi.ts`
- `apps/api/src/routes/v1/submittal.ts`
- `apps/api/src/routes/v1/mandor.ts` — cari `retensi-register`, `retensi-releases` response shape

- [ ] **Step 2: Tulis tipe tambahan di `mandor-portal/_bersama/tipe.ts`**

Tambahkan di akhir file (setelah `pesanGalat`), mengikuti pola existing (field opsional HANYA kalau API memang bisa tak mengirimnya, komentar untuk field yang nama kolomnya rawan salah ketik):

```ts
/** Insiden K3 lapangan. */
export interface InsidenK3 {
  id: string
  project_id?: string | null
  jenis?: string | null
  deskripsi?: string | null
  tingkat_keparahan?: string | null
  status?: string | null
  dilaporkan_pada?: string | null
  dilaporkan_oleh?: { id: string; name: string } | null
}

/** Job Safety Analysis. */
export interface JsaK3 {
  id: string
  project_id?: string | null
  judul?: string | null
  status?: string | null
  dibuat_pada?: string | null
}

/** Inspeksi K3 rutin. */
export interface InspeksiK3 {
  id: string
  project_id?: string | null
  jenis_inspeksi?: string | null
  status?: string | null
  tanggal?: string | null
}

/** Item punch list (temuan cacat/kekurangan pekerjaan). */
export interface PunchItem {
  id: string
  project_id?: string | null
  deskripsi?: string | null
  status?: string | null
  ditugaskan_ke?: { id: string; name: string } | null
  alasan_penolakan?: string | null
  dibuat_pada?: string | null
}

/** Permintaan inspeksi sebelum pekerjaan ditutup. */
export interface Inspeksi {
  id: string
  project_id?: string | null
  judul?: string | null
  status?: string | null
  diajukan_pada?: string | null
}

/** Request for Information ke konsultan. */
export interface Rfi {
  id: string
  project_id?: string | null
  pertanyaan?: string | null
  jawaban?: string | null
  status?: string | null
  diajukan_pada?: string | null
}

/** Submittal material/shop drawing. */
export interface Submittal {
  id: string
  project_id?: string | null
  judul?: string | null
  status?: string | null
  catatan_reviewer?: string | null
  diputuskan_pada?: string | null
  hari_menunggu?: number
}

/** Baris register retensi. */
export interface RetensiRegister {
  id: string
  project_id?: string | null
  jumlah?: number | string | null
  status?: string | null
  tanggal_rilis?: string | null
}
```

- [ ] **Step 3: Buat `apps/web/app/pm-portal/_bersama/tipe.ts`**

```ts
/**
 * Tipe bersama portal PM.
 *
 * Mengikuti pola `mandor-portal/_bersama/tipe.ts`: bentuk disalin dari
 * response API asli, field opsional hanya bila API memang bisa tak
 * mengirimnya.
 */

/** Satu baris di approval inbox — bentuk dari GET /api/v1/approval/inbox. */
export interface BarisInbox {
  jenis: string
  label: string
  id: string
  judul: string | null
  nomor: string | null
  nominal: number | null
  pengaju_id: string | null
  dibuat_pada: string | null
  project_id: string | null
  level_selesai: number
  jalur_ui: string
  saya_pengajunya: boolean
}

export interface ResponsInbox {
  data: BarisInbox[]
  total: number
  ringkas: Record<string, number>
  dilewati: Array<{ jenis: string; sebab: string }>
}

/** Proyek yang di-PM-i user. */
export interface ProyekPM {
  id: string
  name: string
  location?: string | null
  pm_id?: string | null
  status?: string | null
  progress_pct?: number | null
}

/** Dokumen proyek (kontrak/SPK/dst). */
export interface DokumenProyek {
  id: string
  project_id?: string | null
  nama_file?: string | null
  jenis?: string | null
  url?: string | null
  diunggah_pada?: string | null
}

/** Ringkasan kontrak proyek. */
export interface KontrakRingkas {
  id: string
  project_id?: string | null
  nomor_kontrak?: string | null
  nilai_kontrak?: number | string | null
  tanggal_mulai?: string | null
  tanggal_selesai?: string | null
}

/**
 * Bentuk galat dari `api` (axios) — sama dengan mandor-portal.
 */
export interface GalatApi {
  response?: { data?: { error?: string; message?: string }; status?: number }
  message?: string
}

export function pesanGalat(e: unknown, bawaan: string): string {
  const g = e as GalatApi
  return g?.response?.data?.error ?? g?.response?.data?.message ?? g?.message ?? bawaan
}
```

- [ ] **Step 4: Buat `apps/web/app/portal/_bersama/tipe.ts`**

```ts
/** Tipe bersama portal klien — tab read-only tambahan (punch/inspeksi/submittal). */

export interface PunchItemKlien {
  id: string
  deskripsi?: string | null
  status?: string | null
  dibuat_pada?: string | null
}

export interface InspeksiKlien {
  id: string
  judul?: string | null
  status?: string | null
  tanggal?: string | null
}

export interface SubmittalKlien {
  id: string
  judul?: string | null
  status?: string | null
  diputuskan_pada?: string | null
}

export interface GalatApi {
  response?: { data?: { error?: string; message?: string }; status?: number }
  message?: string
}

export function pesanGalat(e: unknown, bawaan: string): string {
  const g = e as GalatApi
  return g?.response?.data?.error ?? g?.response?.data?.message ?? g?.message ?? bawaan
}
```

- [ ] **Step 5: Typecheck**

Run: `cd apps/web && npx tsc --noEmit`
Expected: tidak ada galat baru dari 3 file ini (file lain belum diimpor jadi tak terpengaruh)

- [ ] **Step 6: Commit**

```bash
git add apps/web/app/mandor-portal/_bersama/tipe.ts apps/web/app/pm-portal/_bersama/tipe.ts apps/web/app/portal/_bersama/tipe.ts
git commit -m "feat(portal): tipe bersama untuk modul K3/punch/inspeksi/submittal + PM + klien"
```

---

### Task 2: Token visual "Navy Ledger" — tambahan di globals.css

**Files:**
- Modify: `apps/web/app/globals.css`

**Interfaces:**
- Consumes: token existing (`--navy`, `--navy-mid`, `--grad-merek`, semua `--success/-danger/-warning/-info-*`, `--data-1..5`) — TIDAK diubah, hanya ditambah token baru khusus portal
- Produces: `--portal-navy-deep`, `--portal-canvas`, `--portal-radius-card`, `--portal-radius-pill`, `--portal-shadow-navy`, `--portal-glow-navy` — dipakai oleh SEMUA komponen Task 3

Spec §3 minta palet lebih berani dari dashboard admin TAPI tetap dari keluarga navy yang sama. `--navy-deep #001F3D` belum ada sebagai token bernama (cuma stop pertama gradien `--grad-merek`) — perlu ditambah eksplisit supaya komponen bisa mereferensikannya, bukan hardcode hex.

- [ ] **Step 1: Baca struktur blok `:root` dan dark-mode di globals.css**

Baca `apps/web/app/globals.css` baris 1-150 (light) dan baris 580-750 (dark) untuk menemukan tempat yang tepat menyisipkan token baru — DI DALAM blok yang sama dengan `--navy`/`--grad-merek` existing, bukan blok baru terpisah.

- [ ] **Step 2: Tambah token portal di blok `:root` (light mode)**

Sisipkan tepat setelah definisi `--navy-glow` (dekat baris 62, sebelum blok `--aksen`):

```css
  /* ── Token khusus Portal (mandor/PM/klien) — "Navy Ledger" ──────────
   * Portal mobile-style TIDAK tunduk ARAH-VISUAL-2026 (itu utk dashboard
   * admin) — lihat docs/superpowers/specs/2026-08-19-portal-mobile-rombak-design.md §3.
   * Warna tetap dari keluarga navy yang sama, hanya dipakai lebih berani. */
  --portal-navy-deep:    #001F3D;
  --portal-canvas:       #F5F7FA;
  --portal-radius-card:  24px;
  --portal-radius-pill:  999px;
  --portal-shadow-navy:  0 8px 24px rgba(0,51,102,0.12);
  --portal-glow-navy:    0 0 32px rgba(0,89,179,0.20);
```

- [ ] **Step 3: Tambah override dark-mode**

Cari blok dark mode (dekat `--navy: #4D9FFF;` sekitar baris 633) dan sisipkan setelah `--navy-glow` dark override:

```css
  --portal-navy-deep:    #000C1A;
  --portal-canvas:       #0A0C10;
  --portal-shadow-navy:  0 8px 24px rgba(0,0,0,0.40);
  --portal-glow-navy:    0 0 32px rgba(77,159,255,0.25);
```

(`--portal-radius-card`/`--portal-radius-pill` tidak perlu override — radius sama di kedua mode.)

- [ ] **Step 4: Verifikasi tidak merusak halaman existing**

Run: `cd apps/web && npx tsc --noEmit` (CSS tidak typecheck, tapi pastikan build tidak pecah)
Run: `cd apps/web && pnpm build 2>&1 | tail -30`
Expected: build sukses, tidak ada CSS syntax error

- [ ] **Step 5: Commit**

```bash
git add apps/web/app/globals.css
git commit -m "feat(portal): token visual Navy Ledger untuk component library portal"
```

---

### Task 3: Component `PortalShell` — header + bottom nav + safe-area

**Files:**
- Create: `apps/web/components/portal/PortalShell.tsx`
- Create: `apps/web/components/portal/PortalShell.module.css` (kalau approach CSS module dipakai — lihat Step 1 keputusan)
- Test: manual (component visual, bukan unit test — diverifikasi Task 6/9/12 saat dipakai nyata di layout)

**Interfaces:**
- Consumes: `PuralokaUser` dari `@/lib/api`, `StatusAntrean` dari `@/components/StatusAntrean` (tanpa props, sudah dikonfirmasi)
- Produces:
```ts
export interface NavItem {
  href: string
  label: string
  icon: LucideIcon  // dari lucide-react
  exact?: boolean
}

export interface PortalShellProps {
  user: PuralokaUser
  portalLabel: string       // "Portal Mandor" | "Portal PM" | "Portal Klien"
  navItems: NavItem[]       // max 5 dipakai di bottom nav, sisanya masuk "Lainnya"
  onLogout: () => void
  modeSwitcher?: React.ReactNode  // slot untuk "Mode Mandor/PM" switcher (dipakai mandor-portal)
  children: React.ReactNode
}

export default function PortalShell(props: PortalShellProps): JSX.Element
```

- [ ] **Step 1: Tulis komponen PortalShell**

Pakai inline `style` dengan CSS var (konsisten dengan pola existing `warna-ui.ts`, TIDAK pakai CSS module — codebase ini tidak punya precedent CSS module, inline style + var() sudah pola mapan).

```tsx
"use client";

import { usePathname } from "next/navigation";
import Link from "next/link";
import { LogOut, MoreHorizontal, type LucideIcon } from "lucide-react";
import StatusAntrean from "@/components/StatusAntrean";
import type { PuralokaUser } from "@/lib/api";

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  exact?: boolean;
}

export interface PortalShellProps {
  user: PuralokaUser;
  portalLabel: string;
  navItems: NavItem[];
  onLogout: () => void;
  modeSwitcher?: React.ReactNode;
  children: React.ReactNode;
}

function isActive(pathname: string, href: string, exact?: boolean) {
  return exact ? pathname === href : pathname.startsWith(href);
}

export default function PortalShell({
  user,
  portalLabel,
  navItems,
  onLogout,
  modeSwitcher,
  children,
}: PortalShellProps) {
  const pathname = usePathname();
  const primaryItems = navItems.slice(0, 4);
  const hasMore = navItems.length > 4;

  return (
    <div
      style={{
        minHeight: "100dvh",
        background: "var(--portal-canvas)",
        display: "flex",
        flexDirection: "column",
      }}
    >
      <header
        style={{
          position: "sticky",
          top: 0,
          zIndex: 50,
          background: "var(--grad-merek)",
          padding: "max(env(safe-area-inset-top), 16px) 20px 16px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          boxShadow: "var(--portal-shadow-navy)",
        }}
      >
        <div>
          <div style={{ color: "var(--on-navy)", fontWeight: 800, fontSize: 15, fontFamily: "var(--font-display, inherit)" }}>
            Puraloka Suite
          </div>
          <div style={{ color: "rgba(255,255,255,0.75)", fontSize: 12, marginTop: 2 }}>
            {portalLabel}
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          {modeSwitcher}
          <StatusAntrean />
          <button
            onClick={onLogout}
            aria-label="Keluar"
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              width: 36,
              height: 36,
              borderRadius: "var(--portal-radius-pill)",
              border: "1px solid rgba(255,255,255,0.25)",
              background: "rgba(255,255,255,0.1)",
              color: "var(--on-navy)",
              cursor: "pointer",
            }}
          >
            <LogOut size={16} />
          </button>
        </div>
      </header>

      <main style={{ flex: 1, padding: "20px 16px", paddingBottom: 96 }}>
        {children}
      </main>

      <nav
        aria-label="Navigasi utama"
        style={{
          position: "fixed",
          bottom: 0,
          left: 0,
          right: 0,
          zIndex: 50,
          background: "var(--surface)",
          borderTop: "1px solid var(--border)",
          display: "flex",
          paddingBottom: "env(safe-area-inset-bottom)",
        }}
      >
        {primaryItems.map((item) => {
          const active = isActive(pathname, item.href, item.exact);
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              style={{
                flex: 1,
                minHeight: 56,
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                gap: 4,
                padding: "8px 4px",
                color: active ? "var(--navy)" : "var(--text-secondary)",
                textDecoration: "none",
                fontSize: 11,
                fontWeight: active ? 700 : 500,
              }}
            >
              <item.icon size={22} />
              {item.label}
            </Link>
          );
        })}
        {hasMore && (
          <Link
            href="#lainnya"
            id="portal-lainnya-trigger"
            style={{
              flex: 1,
              minHeight: 56,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              gap: 4,
              padding: "8px 4px",
              color: "var(--text-secondary)",
              textDecoration: "none",
              fontSize: 11,
              fontWeight: 500,
            }}
          >
            <MoreHorizontal size={22} />
            Lainnya
          </Link>
        )}
      </nav>
    </div>
  );
}
```

Catatan: link "Lainnya" (`#lainnya`) adalah placeholder anchor di step ini — Task 4 (`ActionCard`) dan halaman "Lainnya" nyata dibangun per-portal di Task 6/9/12 (tiap portal punya rute `/lainnya` sendiri, bukan anchor). Ganti `href="#lainnya"` jadi prop `lainnyaHref?: string` bila tersedia — **koreksi langsung di step ini**, bukan ditunda:

Ganti bagian `hasMore` di atas dengan:
```tsx
        {hasMore && (
          <Link
            href={lainnyaHref ?? navItems[4]?.href ?? "#"}
            style={{ /* sama seperti di atas */ }}
          >
            <MoreHorizontal size={22} />
            Lainnya
          </Link>
        )}
```
dan tambahkan `lainnyaHref?: string;` ke `PortalShellProps`, destructure di parameter fungsi.

- [ ] **Step 2: Typecheck**

Run: `cd apps/web && npx tsc --noEmit`
Expected: bersih (component belum dipakai di mana pun, tapi harus valid sendiri)

- [ ] **Step 3: Commit**

```bash
git add apps/web/components/portal/PortalShell.tsx
git commit -m "feat(portal): komponen PortalShell — header navy + bottom nav dikurasi"
```

---

### Task 4: Component `KpiCard`, `MiniChart` — angka besar + sparkline + tren

**Files:**
- Create: `apps/web/components/portal/KpiCard.tsx`
- Create: `apps/web/components/portal/MiniChart.tsx`

**Interfaces:**
- Consumes: `recharts` (`ResponsiveContainer`, `AreaChart`, `Area`, `BarChart`, `Bar`, `Tooltip`)
- Produces:
```ts
export interface TrenPeriode {
  arah: "naik" | "turun" | "tetap";
  persen: number;         // selalu positif, arah menentukan tanda
  labelPeriode: string;   // "vs minggu lalu"
}

export interface KpiCardProps {
  label: string;
  nilai: string;              // sudah diformat (Rp, %, dst) oleh caller
  tren?: TrenPeriode;
  sparklineData?: number[];   // titik data untuk MiniChart, urutan lama→baru
  icon?: LucideIcon;
}
export default function KpiCard(props: KpiCardProps): JSX.Element

export interface MiniChartProps {
  data: Array<{ label: string; value: number }>;
  tipe: "area" | "bar";
  warna?: string;   // default var(--navy)
  tinggi?: number;  // default 48
}
export default function MiniChart(props: MiniChartProps): JSX.Element
```

- [ ] **Step 1: Tulis `MiniChart.tsx`**

```tsx
"use client";

import { ResponsiveContainer, AreaChart, Area, BarChart, Bar } from "recharts";

export interface MiniChartProps {
  data: Array<{ label: string; value: number }>;
  tipe: "area" | "bar";
  warna?: string;
  tinggi?: number;
}

export default function MiniChart({ data, tipe, warna = "var(--navy)", tinggi = 48 }: MiniChartProps) {
  if (!data || data.length === 0) return null;

  return (
    <div style={{ width: "100%", height: tinggi }} aria-hidden="true">
      <ResponsiveContainer width="100%" height="100%">
        {tipe === "area" ? (
          <AreaChart data={data}>
            <Area
              type="monotone"
              dataKey="value"
              stroke={warna}
              strokeWidth={2}
              fill={warna}
              fillOpacity={0.12}
              isAnimationActive={false}
            />
          </AreaChart>
        ) : (
          <BarChart data={data}>
            <Bar dataKey="value" fill={warna} radius={[3, 3, 0, 0]} isAnimationActive={false} />
          </BarChart>
        )}
      </ResponsiveContainer>
    </div>
  );
}
```

`aria-hidden="true"` karena ini dekorasi tren di dalam `KpiCard` yang sudah punya badge tren teks eksplisit (Step 2) — chart tidak membawa informasi yang tak tersedia di teks, sesuai WCAG `color-not-only`. `isAnimationActive={false}` menghormati `prefers-reduced-motion` secara default (bukan sekadar CSS media query — recharts animasi JS perlu dimatikan eksplisit).

- [ ] **Step 2: Tulis `KpiCard.tsx`**

```tsx
"use client";

import { TrendingUp, TrendingDown, Minus, type LucideIcon } from "lucide-react";
import MiniChart from "./MiniChart";

export interface TrenPeriode {
  arah: "naik" | "turun" | "tetap";
  persen: number;
  labelPeriode: string;
}

export interface KpiCardProps {
  label: string;
  nilai: string;
  tren?: TrenPeriode;
  sparklineData?: number[];
  icon?: LucideIcon;
}

const IKON_TREN = { naik: TrendingUp, turun: TrendingDown, tetap: Minus };
const WARNA_TREN = { naik: "var(--success)", turun: "var(--danger)", tetap: "var(--text-secondary)" };

export default function KpiCard({ label, nilai, tren, sparklineData, icon: Icon }: KpiCardProps) {
  const IkonTren = tren ? IKON_TREN[tren.arah] : null;

  return (
    <div
      style={{
        background: "var(--surface)",
        borderRadius: "var(--portal-radius-card)",
        border: "1px solid var(--border)",
        padding: 20,
        boxShadow: "var(--portal-shadow-navy)",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
        <span style={{ fontSize: 13, color: "var(--text-secondary)", fontWeight: 600 }}>{label}</span>
        {Icon && <Icon size={18} color="var(--navy)" />}
      </div>
      <div
        style={{
          fontSize: 36,
          fontWeight: 800,
          color: "var(--text-primary)",
          fontVariantNumeric: "tabular-nums",
          letterSpacing: "-0.02em",
          lineHeight: 1.1,
        }}
      >
        {nilai}
      </div>
      {tren && IkonTren && (
        <div style={{ display: "flex", alignItems: "center", gap: 4, marginTop: 8 }}>
          <IkonTren size={14} color={WARNA_TREN[tren.arah]} aria-hidden="true" />
          <span style={{ fontSize: 12, fontWeight: 700, color: WARNA_TREN[tren.arah] }}>
            {tren.arah === "naik" ? "+" : tren.arah === "turun" ? "-" : ""}
            {tren.persen}%
          </span>
          <span style={{ fontSize: 12, color: "var(--text-muted)" }}>{tren.labelPeriode}</span>
        </div>
      )}
      {sparklineData && sparklineData.length > 1 && (
        <div style={{ marginTop: 12 }}>
          <MiniChart
            data={sparklineData.map((v, i) => ({ label: String(i), value: v }))}
            tipe="area"
          />
        </div>
      )}
    </div>
  );
}
```

Badge tren pakai ikon (`TrendingUp`/`TrendingDown`) + tanda `+`/`-` eksplisit di teks, BUKAN warna saja — memenuhi §4 spec ("ikon panah + teks angka, bukan warna saja").

- [ ] **Step 3: Typecheck**

Run: `cd apps/web && npx tsc --noEmit`
Expected: bersih

- [ ] **Step 4: Commit**

```bash
git add apps/web/components/portal/KpiCard.tsx apps/web/components/portal/MiniChart.tsx
git commit -m "feat(portal): KpiCard dengan sparkline + badge tren periode"
```

---

### Task 5: Component `BottomSheet`, `ActionCard`, `StatusBadge`, `EmptyState`, `SkeletonCard`, `SegmentedTab`

**Files:**
- Create: `apps/web/components/portal/BottomSheet.tsx`
- Create: `apps/web/components/portal/ActionCard.tsx`
- Create: `apps/web/components/portal/StatusBadge.tsx`
- Create: `apps/web/components/portal/EmptyState.tsx`
- Create: `apps/web/components/portal/SkeletonCard.tsx`
- Create: `apps/web/components/portal/SegmentedTab.tsx`

**Interfaces:**
- Consumes: tidak ada dependency baru selain `lucide-react`, `react`
- Produces (dipakai semua task halaman berikutnya):
```ts
export interface BottomSheetProps {
  terbuka: boolean;
  onTutup: () => void;
  judul: string;
  children: React.ReactNode;
}
export default function BottomSheet(props: BottomSheetProps): JSX.Element | null

export interface ActionCardProps {
  href: string;
  label: string;
  icon: LucideIcon;
  badge?: number;  // angka notifikasi, mis. jumlah pending
}
export default function ActionCard(props: ActionCardProps): JSX.Element

export type VarianStatus = "pending" | "approved" | "rejected" | "info" | "netral";
export interface StatusBadgeProps {
  status: VarianStatus;
  label: string;
}
export default function StatusBadge(props: StatusBadgeProps): JSX.Element

export interface EmptyStateProps {
  icon: LucideIcon;
  judul: string;
  deskripsi: string;
  aksi?: { label: string; onClick: () => void };
}
export default function EmptyState(props: EmptyStateProps): JSX.Element

export default function SkeletonCard({ tinggi = 100 }: { tinggi?: number }): JSX.Element

export interface SegmentedTabProps {
  opsi: Array<{ value: string; label: string }>;
  aktif: string;
  onUbah: (value: string) => void;
}
export default function SegmentedTab(props: SegmentedTabProps): JSX.Element
```

- [ ] **Step 1: Tulis `BottomSheet.tsx`**

```tsx
"use client";

import { useEffect } from "react";
import { X } from "lucide-react";

export interface BottomSheetProps {
  terbuka: boolean;
  onTutup: () => void;
  judul: string;
  children: React.ReactNode;
}

export default function BottomSheet({ terbuka, onTutup, judul, children }: BottomSheetProps) {
  useEffect(() => {
    if (!terbuka) return;
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") onTutup();
    }
    document.addEventListener("keydown", handleKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", handleKey);
      document.body.style.overflow = "";
    };
  }, [terbuka, onTutup]);

  if (!terbuka) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={judul}
      style={{ position: "fixed", inset: 0, zIndex: 100 }}
    >
      <div
        onClick={onTutup}
        style={{ position: "absolute", inset: 0, background: "rgba(0,15,30,0.5)" }}
      />
      <div
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          bottom: 0,
          maxHeight: "88dvh",
          overflowY: "auto",
          background: "var(--surface)",
          borderRadius: "20px 20px 0 0",
          padding: "12px 20px max(env(safe-area-inset-bottom), 20px)",
          boxShadow: "0 -8px 32px rgba(0,0,0,0.2)",
        }}
      >
        <div
          aria-hidden="true"
          style={{
            width: 36,
            height: 4,
            borderRadius: 2,
            background: "var(--border)",
            margin: "4px auto 16px",
          }}
        />
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
          <h2 style={{ fontSize: 17, fontWeight: 800, color: "var(--text-primary)", margin: 0 }}>{judul}</h2>
          <button
            onClick={onTutup}
            aria-label="Tutup"
            style={{
              width: 32, height: 32, borderRadius: "var(--portal-radius-pill)",
              border: "none", background: "var(--surface-subtle)",
              display: "flex", alignItems: "center", justifyContent: "center",
              cursor: "pointer", color: "var(--text-secondary)",
            }}
          >
            <X size={16} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
```

Sesuai spec §5 dan checklist a11y ("escape-routes", "modal-escape"): tombol X eksplisit + tap scrim + tombol Escape, ketiganya menutup.

- [ ] **Step 2: Tulis `ActionCard.tsx`**

```tsx
"use client";

import Link from "next/link";
import type { LucideIcon } from "lucide-react";

export interface ActionCardProps {
  href: string;
  label: string;
  icon: LucideIcon;
  badge?: number;
}

export default function ActionCard({ href, label, icon: Icon, badge }: ActionCardProps) {
  return (
    <Link
      href={href}
      style={{
        position: "relative",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 8,
        padding: "16px 8px",
        borderRadius: 16,
        background: "var(--surface)",
        border: "1px solid var(--border)",
        textDecoration: "none",
        minHeight: 88,
      }}
    >
      {badge !== undefined && badge > 0 && (
        <span
          style={{
            position: "absolute", top: 8, right: 8,
            minWidth: 18, height: 18, borderRadius: "var(--portal-radius-pill)",
            background: "var(--danger)", color: "#fff",
            fontSize: 10, fontWeight: 700,
            display: "flex", alignItems: "center", justifyContent: "center",
            padding: "0 4px",
          }}
        >
          {badge > 99 ? "99+" : badge}
        </span>
      )}
      <div
        style={{
          width: 44, height: 44, borderRadius: 14,
          background: "var(--navy-light)",
          display: "flex", alignItems: "center", justifyContent: "center",
        }}
      >
        <Icon size={22} color="var(--navy)" />
      </div>
      <span style={{ fontSize: 12, fontWeight: 600, color: "var(--text-primary)", textAlign: "center" }}>
        {label}
      </span>
    </Link>
  );
}
```

- [ ] **Step 3: Tulis `StatusBadge.tsx`**

```tsx
"use client";

import { Clock, CheckCircle2, XCircle, Info, Circle } from "lucide-react";

export type VarianStatus = "pending" | "approved" | "rejected" | "info" | "netral";

export interface StatusBadgeProps {
  status: VarianStatus;
  label: string;
}

const KONFIG: Record<VarianStatus, { warna: string; bg: string; icon: typeof Clock }> = {
  pending: { warna: "var(--warning)", bg: "var(--warning-bg)", icon: Clock },
  approved: { warna: "var(--success)", bg: "var(--success-bg)", icon: CheckCircle2 },
  rejected: { warna: "var(--danger)", bg: "var(--danger-bg)", icon: XCircle },
  info: { warna: "var(--info)", bg: "var(--info-bg)", icon: Info },
  netral: { warna: "var(--text-secondary)", bg: "var(--surface-subtle)", icon: Circle },
};

export default function StatusBadge({ status, label }: StatusBadgeProps) {
  const { warna, bg, icon: Icon } = KONFIG[status];
  return (
    <span
      style={{
        display: "inline-flex", alignItems: "center", gap: 4,
        padding: "4px 10px", borderRadius: "var(--portal-radius-pill)",
        background: bg, color: warna, fontSize: 12, fontWeight: 700,
      }}
    >
      <Icon size={12} aria-hidden="true" />
      {label}
    </span>
  );
}
```

Ikon berbeda per status (bukan cuma warna berbeda) — WCAG `color-not-only`.

- [ ] **Step 4: Tulis `EmptyState.tsx`**

```tsx
"use client";

import type { LucideIcon } from "lucide-react";

export interface EmptyStateProps {
  icon: LucideIcon;
  judul: string;
  deskripsi: string;
  aksi?: { label: string; onClick: () => void };
}

export default function EmptyState({ icon: Icon, judul, deskripsi, aksi }: EmptyStateProps) {
  return (
    <div style={{ textAlign: "center", padding: "48px 24px" }}>
      <div
        style={{
          width: 64, height: 64, borderRadius: "var(--portal-radius-pill)",
          background: "var(--navy-light)", margin: "0 auto 16px",
          display: "flex", alignItems: "center", justifyContent: "center",
        }}
      >
        <Icon size={28} color="var(--navy)" aria-hidden="true" />
      </div>
      <div style={{ fontSize: 15, fontWeight: 700, color: "var(--text-primary)", marginBottom: 4 }}>{judul}</div>
      <div style={{ fontSize: 13, color: "var(--text-secondary)", marginBottom: aksi ? 16 : 0 }}>{deskripsi}</div>
      {aksi && (
        <button
          onClick={aksi.onClick}
          style={{
            padding: "10px 20px", borderRadius: "var(--portal-radius-pill)",
            background: "var(--navy)", color: "var(--on-navy)",
            border: "none", fontSize: 13, fontWeight: 700, cursor: "pointer",
          }}
        >
          {aksi.label}
        </button>
      )}
    </div>
  );
}
```

- [ ] **Step 5: Tulis `SkeletonCard.tsx`**

```tsx
"use client";

export default function SkeletonCard({ tinggi = 100 }: { tinggi?: number }) {
  return (
    <div
      aria-hidden="true"
      style={{
        height: tinggi,
        borderRadius: "var(--portal-radius-card)",
        background: "linear-gradient(90deg, var(--surface-subtle) 25%, var(--surface-hover) 50%, var(--surface-subtle) 75%)",
        backgroundSize: "200% 100%",
        animation: "portal-skeleton-shimmer 1.5s ease-in-out infinite",
      }}
    />
  );
}
```

Tambahkan keyframe global — sisipkan di `apps/web/app/globals.css` (dekat definisi animasi lain, atau di akhir file):

```css
@keyframes portal-skeleton-shimmer {
  0% { background-position: 200% 0; }
  100% { background-position: -200% 0; }
}
@media (prefers-reduced-motion: reduce) {
  [aria-hidden="true"] { animation: none !important; }
}
```

Catatan: rule `prefers-reduced-motion` di atas cakupannya SEMUA `[aria-hidden="true"]`, termasuk `MiniChart` (Task 4) — sudah sejalan karena keduanya elemen dekoratif yang boleh dimatikan animasinya.

- [ ] **Step 6: Tulis `SegmentedTab.tsx`**

```tsx
"use client";

export interface SegmentedTabProps {
  opsi: Array<{ value: string; label: string }>;
  aktif: string;
  onUbah: (value: string) => void;
}

export default function SegmentedTab({ opsi, aktif, onUbah }: SegmentedTabProps) {
  return (
    <div
      role="tablist"
      style={{
        display: "flex", gap: 2, padding: 4,
        background: "var(--surface-subtle)", borderRadius: "var(--portal-radius-pill)",
      }}
    >
      {opsi.map((o) => {
        const isAktif = o.value === aktif;
        return (
          <button
            key={o.value}
            role="tab"
            aria-selected={isAktif}
            onClick={() => onUbah(o.value)}
            style={{
              flex: 1, padding: "8px 12px", borderRadius: "var(--portal-radius-pill)",
              border: "none", cursor: "pointer",
              background: isAktif ? "var(--navy)" : "transparent",
              color: isAktif ? "var(--on-navy)" : "var(--text-secondary)",
              fontSize: 13, fontWeight: isAktif ? 700 : 500,
              transition: "background 150ms ease, color 150ms ease",
            }}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 7: Typecheck**

Run: `cd apps/web && npx tsc --noEmit`
Expected: bersih

- [ ] **Step 8: Commit**

```bash
git add apps/web/components/portal/BottomSheet.tsx apps/web/components/portal/ActionCard.tsx apps/web/components/portal/StatusBadge.tsx apps/web/components/portal/EmptyState.tsx apps/web/components/portal/SkeletonCard.tsx apps/web/components/portal/SegmentedTab.tsx apps/web/app/globals.css
git commit -m "feat(portal): BottomSheet, ActionCard, StatusBadge, EmptyState, SkeletonCard, SegmentedTab"
```

---

## Bagian B — Portal Mandor (Task 6–7)

### Task 6: Layout mandor-portal baru + halaman Beranda

**Files:**
- Modify: `apps/web/app/mandor-portal/layout.tsx` (tulis ulang total)
- Modify: `apps/web/app/mandor-portal/page.tsx` (tulis ulang total)
- Create: `apps/web/app/mandor-portal/lainnya/page.tsx`

**Interfaces:**
- Consumes: `PortalShell`, `NavItem` (Task 3); `KpiCard` (Task 4); `ActionCard`, `EmptyState`, `SkeletonCard` (Task 5); `useData` (`@/lib/data-cache`); tipe dari `_bersama/tipe.ts` (Task 1)
- Produces: pola layout yang akan diikuti Task 9 (PM) dan Task 12 (Klien) — perilaku redirect harus identik dengan `pm-portal`/`portal` existing (sudah diverifikasi konsisten di riset)

- [ ] **Step 1: Tulis ulang `mandor-portal/layout.tsx`**

Pertahankan logic proteksi role & fetch `hasHarian`/`hasProgressPct`/`isPM` APA ADANYA dari file lama (baris 41-71 versi existing) — HANYA ganti bagian render (JSX) untuk pakai `PortalShell`. Nav item bertambah karena modul baru (Task 7):

```tsx
"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { api, getStoredUser, logout, type PuralokaUser } from "@/lib/api";
import PortalShell, { type NavItem } from "@/components/portal/PortalShell";
import {
  LayoutDashboard, Briefcase, Wallet, ClipboardList, HardHat,
  FolderKanban, ChevronDown,
} from "lucide-react";

export default function MandorPortalLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [user, setUser] = useState<PuralokaUser | null>(null);
  const [isPM, setIsPM] = useState(false);
  const [showModeMenu, setShowModeMenu] = useState(false);
  const modeMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const u = getStoredUser();
    if (!u) { router.replace("/login"); return; }
    if (u.role !== "mandor") { router.replace("/dashboard"); return; }
    setUser(u);

    api.get("/api/v1/projects").then((res) => {
      const projects: any[] = res.data?.projects ?? [];
      setIsPM(projects.some((p) => p.pm_id === u.id || p.pm?.id === u.id));
    }).catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (modeMenuRef.current && !modeMenuRef.current.contains(e.target as Node)) {
        setShowModeMenu(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  if (!user) return null;

  function handleLogout() {
    logout();
    router.push("/login");
  }

  const navItems: NavItem[] = [
    { href: "/mandor-portal", label: "Beranda", icon: LayoutDashboard, exact: true },
    { href: "/mandor-portal/scope", label: "Scope", icon: Briefcase },
    { href: "/mandor-portal/kasbon", label: "Kasbon", icon: Wallet },
    { href: "/mandor-portal/progress", label: "Progress", icon: ClipboardList },
    { href: "/mandor-portal/lainnya", label: "Lainnya", icon: FolderKanban },
  ];

  const modeSwitcher = isPM ? (
    <div ref={modeMenuRef} style={{ position: "relative" }}>
      <button
        onClick={() => setShowModeMenu((v) => !v)}
        aria-expanded={showModeMenu}
        aria-label="Ganti mode Mandor/PM"
        style={{
          display: "flex", alignItems: "center", gap: 6,
          padding: "6px 10px", borderRadius: "var(--portal-radius-pill)",
          border: "1px solid rgba(255,255,255,0.3)", background: "rgba(255,255,255,0.12)",
          cursor: "pointer", fontSize: 11, color: "var(--on-navy)", fontWeight: 700,
        }}
      >
        <HardHat size={13} />
        <ChevronDown size={13} />
      </button>
      {showModeMenu && (
        <div
          style={{
            position: "absolute", top: "calc(100% + 8px)", right: 0,
            background: "var(--surface)", borderRadius: 12, border: "1px solid var(--border)",
            boxShadow: "var(--portal-shadow-navy)", minWidth: 200, zIndex: 100, overflow: "hidden",
          }}
        >
          <button
            style={{
              width: "100%", padding: "10px 16px", display: "flex", alignItems: "center", gap: 8,
              background: "var(--navy-light)", border: "none", cursor: "default", textAlign: "left",
            }}
          >
            <HardHat size={16} color="var(--navy)" />
            <span style={{ fontSize: 13, fontWeight: 700, color: "var(--navy)" }}>Mode Mandor</span>
          </button>
          <button
            onClick={() => { setShowModeMenu(false); router.push("/pm-portal"); }}
            style={{
              width: "100%", padding: "10px 16px", display: "flex", alignItems: "center", gap: 8,
              background: "none", border: "none", cursor: "pointer", textAlign: "left",
            }}
          >
            <FolderKanban size={16} color="var(--text-secondary)" />
            <span style={{ fontSize: 13, fontWeight: 700, color: "var(--text-primary)" }}>Mode PM</span>
          </button>
        </div>
      )}
    </div>
  ) : undefined;

  return (
    <PortalShell
      user={user}
      portalLabel="Portal Mandor"
      navItems={navItems}
      onLogout={handleLogout}
      modeSwitcher={modeSwitcher}
    >
      {children}
    </PortalShell>
  );
}
```

Catatan: `hasHarian`/`hasProgressPct` DIHAPUS dari layout karena bottom nav sekarang cuma 5 item tetap (Beranda/Scope/Kasbon/Progress/Lainnya) — kondisional payment_system dipindah ke dalam halaman "Lainnya" (Step 3) yang menampilkan SEMUA modul, dengan grup kondisional di situ, bukan di nav utama. Ini konsisten dengan §5 spec ("bottom nav dikurasi, sisanya masuk Lainnya").

- [ ] **Step 2: Tulis ulang `mandor-portal/page.tsx` (Beranda)**

```tsx
"use client";

import { useMemo } from "react";
import Link from "next/link";
import { Wallet, ClipboardList, Briefcase, TrendingUp } from "lucide-react";
import { useData } from "@/lib/data-cache";
import KpiCard from "@/components/portal/KpiCard";
import SkeletonCard from "@/components/portal/SkeletonCard";
import EmptyState from "@/components/portal/EmptyState";
import type { Penugasan, Kasbon, LaporanUpah, GalatApi } from "./_bersama/tipe";
import { pesanGalat } from "./_bersama/tipe";

interface RespAssignments { assignments: Penugasan[] }
interface RespKasbon { data: Kasbon[] }
interface RespUpah { data: LaporanUpah[] }

export default function MandorBerandaPage() {
  const { data: dataAssign, memuat: memuatAssign, galat: galatAssign } =
    useData<RespAssignments>("/api/v1/mandor/assignments");
  const { data: dataKasbon, memuat: memuatKasbon } =
    useData<RespKasbon>("/api/v1/mandor/kasbon?status=pending");
  const { data: dataUpah, memuat: memuatUpah } =
    useData<RespUpah>("/api/v1/mandor/laporan-upah?status=pending");

  const scopes = useMemo(
    () => (dataAssign?.assignments ?? []).flatMap((a) => a.work_scopes ?? []),
    [dataAssign],
  );
  const scopeAktif = scopes.filter((s) => s.status === "active" || s.status === "aktif").length;
  const kasbonPending = dataKasbon?.data?.length ?? 0;
  const upahMenunggu = dataUpah?.data?.length ?? 0;

  const memuat = memuatAssign || memuatKasbon || memuatUpah;

  if (galatAssign) {
    return (
      <EmptyState
        icon={Briefcase}
        judul="Gagal memuat data"
        deskripsi={pesanGalat(galatAssign as GalatApi, "Coba lagi beberapa saat.")}
      />
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {memuat ? (
        <>
          <SkeletonCard tinggi={110} />
          <SkeletonCard tinggi={110} />
        </>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <KpiCard label="Scope Aktif" nilai={String(scopeAktif)} icon={Briefcase} />
          <KpiCard label="Kasbon Pending" nilai={String(kasbonPending)} icon={Wallet} />
        </div>
      )}

      {!memuat && upahMenunggu > 0 && (
        <Link
          href="/mandor-portal/laporan-upah"
          style={{
            display: "flex", alignItems: "center", gap: 10, padding: 16,
            borderRadius: "var(--portal-radius-card)", background: "var(--warning-bg)",
            border: "1px solid var(--warning-border)", textDecoration: "none",
          }}
        >
          <ClipboardList size={20} color="var(--on-warning-bg)" />
          <span style={{ fontSize: 13, fontWeight: 700, color: "var(--on-warning-bg)" }}>
            {upahMenunggu} laporan upah menunggu review
          </span>
        </Link>
      )}

      {!memuat && scopes.length === 0 && (
        <EmptyState
          icon={TrendingUp}
          judul="Belum ada penugasan"
          deskripsi="Scope kerja yang ditugaskan ke Anda akan muncul di sini."
        />
      )}
    </div>
  );
}
```

Catatan: feed aktivitas (spec §7.1 — "progress log masuk, kasbon disetujui/ditolak, upah dibayar") BUTUH endpoint gabungan yang belum ada. **Tidak dibuat di task ini** — endpoint API baru di luar scope task (plan ini hanya UI di atas endpoint existing). Dicatat sebagai item terbuka di Task 7 Step akhir (backlog, bukan diabaikan).

- [ ] **Step 3: Buat halaman "Lainnya" mandor**

```tsx
"use client";

import { useEffect, useState } from "react";
import { BarChart2, ClipboardList, Users, CreditCard, Receipt, HardHat, ShieldAlert, ClipboardCheck, FileQuestion, FileStack, Landmark } from "lucide-react";
import { api, getStoredUser } from "@/lib/api";
import ActionCard from "@/components/portal/ActionCard";

export default function MandorLainnyaPage() {
  const [hasHarian, setHasHarian] = useState(false);
  const [hasProgressPct, setHasProgressPct] = useState(false);

  useEffect(() => {
    const u = getStoredUser();
    if (!u) return;
    api.get("/api/v1/mandor/assignments").then((res) => {
      const assignments: any[] = res.data?.assignments ?? [];
      const allScopes = assignments.flatMap((a: any) => a.work_scopes ?? []);
      setHasHarian(allScopes.some((s: any) => s.payment_system === "harian"));
      setHasProgressPct(allScopes.some((s: any) => s.payment_system === "progress_pct"));
    }).catch(() => {});
  }, []);

  const items = [
    hasHarian && { href: "/mandor-portal/laporan-upah", label: "Laporan Upah", icon: ClipboardList },
    hasProgressPct && { href: "/mandor-portal/penagihan", label: "Penagihan", icon: Receipt },
    { href: "/mandor-portal/kasbon-tukang", label: "Kasbon Tukang", icon: CreditCard },
    { href: "/mandor-portal/tukang", label: "Daftar Tukang", icon: Users },
    { href: "/mandor-portal/pembayaran", label: "Riwayat Bayar", icon: Landmark },
    { href: "/mandor-portal/rekapitulasi", label: "Rekapitulasi", icon: BarChart2 },
    { href: "/mandor-portal/k3", label: "K3 Lapangan", icon: ShieldAlert },
    { href: "/mandor-portal/punch-list", label: "Punch List", icon: ClipboardCheck },
    { href: "/mandor-portal/inspeksi-rfi", label: "Inspeksi & RFI", icon: FileQuestion },
    { href: "/mandor-portal/submittal", label: "Submittal", icon: FileStack },
    { href: "/mandor-portal/jadwal", label: "Jadwal Proyek", icon: HardHat },
  ].filter(Boolean) as Array<{ href: string; label: string; icon: any }>;

  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12 }}>
      {items.map((item) => (
        <ActionCard key={item.href} {...item} />
      ))}
    </div>
  );
}
```

- [ ] **Step 4: Typecheck**

Run: `cd apps/web && npx tsc --noEmit`
Expected: bersih

- [ ] **Step 5: Verifikasi manual di browser**

Run: `cd apps/web && pnpm dev` (catat port dari output)
Buka `/mandor-portal` dengan akun uji mandor (kredensial di `apps/web/.env.local`, `LAYAR_EMAIL`/`LAYAR_SANDI`).
Expected: header gradien navy, bottom nav 5 item, KPI card dengan angka besar, halaman "Lainnya" menampilkan grid modul (termasuk yang belum dibangun — link akan 404, itu OK, dibangun Task 7).

- [ ] **Step 6: Commit**

```bash
git add apps/web/app/mandor-portal/layout.tsx apps/web/app/mandor-portal/page.tsx apps/web/app/mandor-portal/lainnya/page.tsx
git commit -m "feat(mandor-portal): layout PortalShell + beranda + halaman Lainnya"
```

---

### Task 7: Modul baru mandor — K3, Punch List, Inspeksi/RFI, Submittal, Jadwal, Retensi + restyle 9 halaman existing

**Files:**
- Create: `apps/web/app/mandor-portal/k3/page.tsx`
- Create: `apps/web/app/mandor-portal/punch-list/page.tsx`
- Create: `apps/web/app/mandor-portal/inspeksi-rfi/page.tsx`
- Create: `apps/web/app/mandor-portal/submittal/page.tsx`
- Create: `apps/web/app/mandor-portal/jadwal/page.tsx`
- Modify: `apps/web/app/mandor-portal/scope/page.tsx`, `kasbon/page.tsx`, `kasbon-tukang/page.tsx`, `laporan-upah/page.tsx`, `laporan/page.tsx`, `penagihan/page.tsx`, `progress/page.tsx`, `pembayaran/page.tsx`, `rekapitulasi/page.tsx`, `tukang/page.tsx` (restyle: ganti inline `style` + `C` dari `warna-ui.ts` → token var langsung + component library; retensi ditambahkan sebagai section baru di `rekapitulasi/page.tsx`, BUKAN halaman terpisah — mengikuti pola spec §2.1 "sudah ter-scope mandor" via endpoint existing)

**Interfaces:**
- Consumes: semua komponen Task 3-5, tipe Task 1, `kirimLapangan` (`@/lib/kirim-lapangan`) untuk submit form K3/punch
- Produces: tidak ada — task terakhir portal mandor

Task ini besar (5 halaman baru + 10 restyle) — dipecah subagent per-halaman saat eksekusi (lihat handoff di akhir dokumen), tapi didefinisikan sebagai SATU task karena semuanya saling bergantung pada nav "Lainnya" Task 6 dan tidak independen secara produk (redesign portal mandor selesai hanya kalau semuanya selesai bersama).

- [ ] **Step 1: Baca endpoint K3 lengkap untuk konfirmasi path & body**

Baca `apps/api/src/routes/v1/k3-lapangan.ts` lengkap — catat SEMUA path route (`GET/POST /api/v1/proyek/:id/k3/insiden`, dst) beserta body yang diharapkan untuk form create.

- [ ] **Step 2: Tulis `k3/page.tsx`**

Pola: `SegmentedTab` (Insiden / JSA / Inspeksi), `useData` per tab, list `StatusBadge`, `BottomSheet` berisi form lapor insiden baru yang submit lewat `kirimLapangan("POST", url, payload, "Insiden dilaporkan", "Gagal melapor")`.

```tsx
"use client";

import { useState } from "react";
import { ShieldAlert, Plus } from "lucide-react";
import { useData, invalidasi } from "@/lib/data-cache";
import { kirimLapangan } from "@/lib/kirim-lapangan";
import SegmentedTab from "@/components/portal/SegmentedTab";
import BottomSheet from "@/components/portal/BottomSheet";
import StatusBadge from "@/components/portal/StatusBadge";
import EmptyState from "@/components/portal/EmptyState";
import SkeletonCard from "@/components/portal/SkeletonCard";
import type { InsidenK3, GalatApi } from "../_bersama/tipe";
import { pesanGalat } from "../_bersama/tipe";

const TAB_KE_URL: Record<string, string> = {
  insiden: "/api/v1/k3/insiden",
  jsa: "/api/v1/k3/jsa",
  inspeksi: "/api/v1/k3/inspeksi",
};

const STATUS_VARIAN: Record<string, "pending" | "approved" | "rejected" | "netral"> = {
  open: "pending", terbuka: "pending",
  closed: "approved", selesai: "approved",
  ditolak: "rejected",
};

export default function K3Page() {
  const [tab, setTab] = useState("insiden");
  const [sheetTerbuka, setSheetTerbuka] = useState(false);
  const [deskripsi, setDeskripsi] = useState("");
  const [mengirim, setMengirim] = useState(false);
  const [galatForm, setGalatForm] = useState<string | null>(null);

  const { data, memuat, galat } = useData<{ data: InsidenK3[] }>(TAB_KE_URL[tab]);

  async function submitInsiden() {
    setMengirim(true);
    setGalatForm(null);
    const hasil = await kirimLapangan(
      "POST",
      "/api/v1/k3/insiden",
      { deskripsi },
      "Insiden dilaporkan",
      "Gagal melapor insiden",
    );
    setMengirim(false);
    if (hasil.status === "ditolak") {
      setGalatForm(pesanGalat(hasil.galat as GalatApi, "Gagal melapor"));
      return;
    }
    setSheetTerbuka(false);
    setDeskripsi("");
    invalidasi("/api/v1/k3/insiden");
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <SegmentedTab
        opsi={[
          { value: "insiden", label: "Insiden" },
          { value: "jsa", label: "JSA" },
          { value: "inspeksi", label: "Inspeksi" },
        ]}
        aktif={tab}
        onUbah={setTab}
      />

      {tab === "insiden" && (
        <button
          onClick={() => setSheetTerbuka(true)}
          style={{
            display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
            padding: 14, borderRadius: "var(--portal-radius-pill)",
            background: "var(--grad-merek)", color: "var(--on-navy)",
            border: "none", fontSize: 14, fontWeight: 700, cursor: "pointer",
          }}
        >
          <Plus size={18} /> Lapor Insiden
        </button>
      )}

      {memuat && <SkeletonCard tinggi={80} />}
      {galat && (
        <EmptyState icon={ShieldAlert} judul="Gagal memuat" deskripsi={pesanGalat(galat as GalatApi, "Coba lagi.")} />
      )}
      {!memuat && !galat && (data?.data?.length ?? 0) === 0 && (
        <EmptyState icon={ShieldAlert} judul="Belum ada data" deskripsi="Data akan muncul di sini setelah tercatat." />
      )}
      {!memuat && (data?.data ?? []).map((item) => (
        <div
          key={item.id}
          style={{
            padding: 16, borderRadius: 16, background: "var(--surface)",
            border: "1px solid var(--border)", display: "flex", flexDirection: "column", gap: 8,
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
            <span style={{ fontSize: 14, fontWeight: 600, color: "var(--text-primary)", flex: 1 }}>
              {item.deskripsi ?? item.jenis ?? "—"}
            </span>
            <StatusBadge
              status={STATUS_VARIAN[item.status ?? ""] ?? "netral"}
              label={item.status ?? "—"}
            />
          </div>
        </div>
      ))}

      <BottomSheet terbuka={sheetTerbuka} onTutup={() => setSheetTerbuka(false)} judul="Lapor Insiden K3">
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <label style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>
            Deskripsi kejadian
            <textarea
              value={deskripsi}
              onChange={(e) => setDeskripsi(e.target.value)}
              rows={4}
              style={{
                width: "100%", marginTop: 6, padding: 12, borderRadius: 12,
                border: "1px solid var(--border)", fontSize: 14, fontFamily: "inherit",
              }}
            />
          </label>
          {galatForm && <div style={{ fontSize: 12, color: "var(--danger)" }}>{galatForm}</div>}
          <button
            onClick={submitInsiden}
            disabled={mengirim || !deskripsi.trim()}
            style={{
              padding: 14, borderRadius: "var(--portal-radius-pill)",
              background: "var(--navy)", color: "var(--on-navy)", border: "none",
              fontSize: 14, fontWeight: 700, cursor: mengirim ? "default" : "pointer",
              opacity: mengirim || !deskripsi.trim() ? 0.5 : 1,
            }}
          >
            {mengirim ? "Mengirim…" : "Kirim Laporan"}
          </button>
        </div>
      </BottomSheet>
    </div>
  );
}
```

Path endpoint (`/api/v1/k3/insiden` dst) adalah PLACEHOLDER berdasar pola penamaan file `k3-lapangan.ts` — **executor WAJIB memverifikasi path exact di Step 1 sebelum menulis kode**, ganti `TAB_KE_URL` sesuai temuan nyata.

- [ ] **Step 3: Tulis `punch-list/page.tsx`, `inspeksi-rfi/page.tsx`, `submittal/page.tsx`**

Pola identik dengan Step 2 (`useData` + list + `StatusBadge` + `BottomSheet` form create/ajukan) — masing-masing:
- `punch-list/page.tsx`: list `PunchItem`, form catat temuan baru (deskripsi + assign ke tukang — dropdown dari `useData<{data: Tukang[]}>("/api/v1/mandor/tukang")`)
- `inspeksi-rfi/page.tsx`: `SegmentedTab` (Inspeksi / RFI), list masing-masing, form ajukan
- `submittal/page.tsx`: list `Submittal` dengan `StatusBadge`, form ajukan material/shop drawing

Ikuti struktur kode Step 2 persis (import, error handling, `kirimLapangan`, `invalidasi`) — ganti tipe, endpoint, dan field form sesuai domain masing-masing. TIDAK ditulis ulang kode lengkapnya di sini untuk menghindari duplikasi >300 baris identik; **executor mengikuti pola Step 2 sebagai template literal**, bukan menciptakan struktur baru.

- [ ] **Step 4: Tulis `jadwal/page.tsx`**

Baca dulu `apps/web/app/portal/proyek/[id]/page.tsx` tab Gantt (sudah ada, dipakai klien) — pakai LIBRARY YANG SAMA (`frappe-gantt`, sudah di `package.json`) dengan gaya restyle sesuai token portal, read-only untuk mandor (permission mandor cuma `projects:view`, bukan `baseline:manage`).

- [ ] **Step 5: Restyle 9 halaman existing**

Untuk TIAP file di daftar Modify: ganti `import { C } from "@/lib/warna-ui"` dan semua pemakaian `C.xxx` → CSS var langsung (`var(--navy)`, dst) ATAU pakai komponen Task 3-5 di tempat yang relevan (list existing → `StatusBadge`+card pattern dari Step 2; modal existing → `BottomSheet`; grafik baru sesuai spec §4 → `MiniChart`/`recharts` dengan styling portal).

Untuk `rekapitulasi/page.tsx` khusus: tambahkan section baru "Retensi" yang memanggil `useData<{data: RetensiRegister[]}>("/api/v1/mandor/retensi-register")` (path diverifikasi ulang ke `mandor.ts`), ditampilkan sebagai list dengan `StatusBadge`.

Untuk `laporan-upah/page.tsx` dan `penagihan/page.tsx` khusus (spec §4): tambahkan `MiniChart` grafik batang mingguan di atas list, dan `KpiCard` dengan `tren` dibandingkan periode sebelumnya (hitung dari data existing yang sudah difetch — GROUP BY minggu di frontend, bukan endpoint baru).

- [ ] **Step 6: Typecheck**

Run: `cd apps/web && npx tsc --noEmit`
Expected: bersih

- [ ] **Step 7: Audit a11y**

Run (API dan web harus hidup dulu — port diukur via `grep NEXT_PUBLIC_API_URL apps/web/.env.local`):
```bash
LAYAR_EMAIL=… LAYAR_SANDI=… LAYAR_BASIS=http://localhost:3000 node apps/web/scripts/jalankan-a11y-lengkap.mjs
```
Expected: 0 pelanggaran untuk semua rute `/mandor-portal/*`

- [ ] **Step 8: Jalankan penjaga CI relevan**

```bash
cd apps/api && node scripts/audit-halaman-pakai-cache.mjs
cd apps/api && node scripts/uji-judul-halaman-ada.mjs
cd apps/api && node scripts/uji-remah-lengkap.mjs
```
Expected: exit 0 untuk semua, tempel ringkasan output

- [ ] **Step 9: Commit**

```bash
git add apps/web/app/mandor-portal/
git commit -m "feat(mandor-portal): modul K3/punch/inspeksi/RFI/submittal/jadwal + restyle 9 halaman existing"
```

**Catatan backlog (di luar scope task ini, TIDAK dikerjakan sekarang):** feed aktivitas beranda (Task 6 Step 2) butuh endpoint gabungan baru di backend — dicatat di `docs/execution/QUEUE.yaml` setelah plan ini selesai, bukan dikerjakan diam-diam di sini.

---

## Bagian C — Portal PM (Task 8–10, paling besar)

### Task 8: Backend — filter proyek-milik-PM di approval inbox

**Files:**
- Modify: `apps/api/src/routes/v1/approval-inbox.ts`
- Test: `apps/api/src/routes/v1/__tests__/approval-inbox.test.ts` (create kalau belum ada — cek dulu)

**Interfaces:**
- Consumes: `request.db!.from('projects').select('id').eq('pm_id', userId)` (pola existing dari `reports.ts:90`, `search.ts:67`)
- Produces: `GET /api/v1/approval/inbox` — response shape TIDAK berubah (`ResponsInbox` dari Task 1), HANYA baris yang dikembalikan berkurang untuk role `pm`

Ini SATU-SATUNYA perubahan backend di seluruh plan — wajib TDD karena menyentuh data-scoping (temuan §2.4 poin 2 di spec: risiko kebocoran data lintas-proyek).

- [ ] **Step 1: Cek test existing**

Run: `find apps/api/src/routes/v1/__tests__ -iname "*approval-inbox*"` — kalau ada, baca isinya untuk pola test existing (setup data, auth mock, dsb) sebelum menulis test baru.

- [ ] **Step 2: Baca route handler lengkap untuk titik penyisipan filter**

Baca `apps/api/src/routes/v1/approval-inbox.ts` baris 79-150 (bagian yang menyusun query per `SUMBER_INBOX`, termasuk baris ~108-110 yang memakai `request.db!.projectIds()` untuk tenancy kategori `'C'`).

- [ ] **Step 3: Tulis test yang gagal — PM cuma lihat inbox proyeknya sendiri**

```ts
// apps/api/src/routes/v1/__tests__/approval-inbox.test.ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
// ikuti pola import test existing di file lain untuk setup app/db — lihat
// apps/api/src/routes/v1/__tests__/ai-tulis.test.ts sebagai referensi pola koneksi test.

describe('GET /api/v1/approval/inbox — filter proyek PM', () => {
  it('PM hanya melihat baris approval dari proyek yang di-PM-inya', async () => {
    // Setup: dua proyek di company yang sama, project A dengan pm_id = PM_UJI,
    // project B dengan pm_id = PM_LAIN. Kasbon pending dibuat di KEDUA proyek.
    // (detail setup mengikuti pola fixture existing di file test kasbon —
    // baca apps/api/src/routes/v1/__tests__/kasbons.test.ts untuk cara
    // membuat proyek+kasbon uji sebelum menulis fixture ini persis)

    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/approval/inbox',
      headers: authHeaderUntuk(PM_UJI), // helper existing di test lain
    })

    expect(res.statusCode).toBe(200)
    const body = res.json()
    const projectIdsMuncul = new Set(
      body.data.filter((b: any) => b.jenis === 'kasbon').map((b: any) => b.project_id)
    )
    expect(projectIdsMuncul.has(PROJECT_A_ID)).toBe(true)
    expect(projectIdsMuncul.has(PROJECT_B_ID)).toBe(false) // <- ini yang gagal sebelum fix
  })

  it('role selain PM (mis. admin) tetap melihat semua proyek company', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/approval/inbox',
      headers: authHeaderUntuk(ADMIN_UJI),
    })
    const body = res.json()
    const projectIdsMuncul = new Set(
      body.data.filter((b: any) => b.jenis === 'kasbon').map((b: any) => b.project_id)
    )
    expect(projectIdsMuncul.has(PROJECT_A_ID)).toBe(true)
    expect(projectIdsMuncul.has(PROJECT_B_ID)).toBe(true)
  })
})
```

Catatan untuk executor: fixture setup (`PM_UJI`, `PROJECT_A_ID`, dsb, helper `authHeaderUntuk`) HARUS disalin polanya dari test file existing yang sudah bekerja di suite ini (`kasbons.test.ts` atau serupa) — JANGAN menebak API test helper, baca dulu satu file test lain yang lulus untuk meniru pola koneksi/auth-nya persis.

- [ ] **Step 4: Jalankan test, konfirmasi gagal**

Run: `cd apps/api && npx vitest run approval-inbox`
Expected: test kedua (`role selain PM...`) lulus, test pertama GAGAL karena `PROJECT_B_ID` masih muncul (bukti filter belum ada)

- [ ] **Step 5: Implementasi filter**

Di `approval-inbox.ts`, sebelum loop `SUMBER_INBOX` (dekat baris 79-90), tambahkan resolusi daftar proyek PM:

```ts
const user = request.puralokaUser! // sesuaikan nama field auth existing di file ini
let pmProjectIds: string[] | null = null
if (user.role === 'pm') {
  const { data: pmProjects, error: errPm } = await request.db!
    .from('projects')
    .select('id')
    .eq('pm_id', user.id)
  if (errPm) {
    return reply.status(500).send({ error: 'Gagal memuat proyek PM' })
  }
  pmProjectIds = (pmProjects ?? []).map((p: { id: string }) => p.id)
}
```

Lalu di titik yang memakai `request.db!.projectIds()` untuk tenancy `'C'` (dan varian `'C-pegawai'`/`'C-scenario'` bila relevan — baca kode existing untuk lihat SEMUA titik pemakaian, bukan cuma satu), ganti/tambahkan filter:

```ts
// SEBELUM (tenancy 'C'):
// const validIds = await request.db!.projectIds()
// query = query.in('project_id', validIds)

// SESUDAH — irisan dengan pmProjectIds bila user adalah PM:
const validIds = await request.db!.projectIds()
const finalIds = pmProjectIds !== null
  ? validIds.filter((id: string) => pmProjectIds!.includes(id))
  : validIds
query = query.in('project_id', finalIds)
```

Terapkan pola irisan yang sama ke SEMUA cabang tenancy (`'C'`, `'C-pegawai'`, `'C-scenario'`) yang menyaring by `project_id` — baca kode existing dulu untuk memastikan tidak ada cabang yang terlewat (§2.4 poin 2 di spec eksplisit menyebut ketiga varian ini).

- [ ] **Step 6: Jalankan test, konfirmasi lulus**

Run: `cd apps/api && npx vitest run approval-inbox`
Expected: kedua test PASS, tempel ringkasan output

- [ ] **Step 7: Jalankan full suite approval-related untuk regresi**

Run: `cd apps/api && npx vitest run approval`
Expected: semua lulus (tempel ringkasan) — memastikan perubahan tidak merusak jalur approval dashboard admin yang sudah ada

- [ ] **Step 8: Jalankan penjaga tenancy**

Run: `cd apps/api && node scripts/audit-gerbang-tenancy.mjs`
Expected: exit 0, angka tidak naik dari baseline

- [ ] **Step 9: Commit**

```bash
git add apps/api/src/routes/v1/approval-inbox.ts apps/api/src/routes/v1/__tests__/approval-inbox.test.ts
git commit -m "fix(approval-inbox): filter baris ke proyek yang di-PM-i user — cegah PM lihat approval proyek lain"
```

---

### Task 9: Layout pm-portal baru + halaman Beranda + Approval Inbox

**Files:**
- Modify: `apps/web/app/pm-portal/layout.tsx` (tulis ulang total)
- Modify: `apps/web/app/pm-portal/page.tsx` (tulis ulang total)
- Create: `apps/web/app/pm-portal/approval/page.tsx`
- Create: `apps/web/app/pm-portal/lainnya/page.tsx`

**Interfaces:**
- Consumes: semua dari Task 3-5, tipe `BarisInbox`/`ResponsInbox` (Task 1), endpoint dari Task 8 (sudah difilter)
- Produces: mapping `jenis → path pm-portal` (dipakai internal task ini saja, tidak diekspor ke task lain)

- [ ] **Step 1: Tulis ulang `pm-portal/layout.tsx`**

Pertahankan logic proteksi role ASYNC (exclusion list admin/client + verifikasi `pm_id` untuk role mandor) APA ADANYA dari file lama — HANYA ganti render jadi `PortalShell`.

```tsx
"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api, getStoredUser, logout, type PuralokaUser } from "@/lib/api";
import PortalShell, { type NavItem } from "@/components/portal/PortalShell";
import { LayoutDashboard, Inbox, FolderKanban, Wallet, Users } from "lucide-react";

export default function PmPortalLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [user, setUser] = useState<PuralokaUser | null>(null);

  useEffect(() => {
    const u = getStoredUser();
    if (!u) { router.replace("/login"); return; }
    if (u.role === "admin") { router.replace("/dashboard"); return; }
    if (u.role === "client") { router.replace("/portal"); return; }
    setUser(u);
    if (u.role === "mandor") {
      api.get("/api/v1/projects").then((res) => {
        const projects: any[] = res.data?.projects ?? [];
        const asPM = projects.some((p) => p.pm_id === u.id || p.pm?.id === u.id);
        if (!asPM) router.replace("/mandor-portal");
      }).catch(() => router.replace("/mandor-portal"));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!user) return null;

  function handleLogout() {
    logout();
    router.push("/login");
  }

  const navItems: NavItem[] = [
    { href: "/pm-portal", label: "Beranda", icon: LayoutDashboard, exact: true },
    { href: "/pm-portal/approval", label: "Approval", icon: Inbox },
    { href: "/pm-portal/proyek", label: "Proyek", icon: FolderKanban },
    { href: "/pm-portal/keuangan", label: "Keuangan", icon: Wallet },
    { href: "/pm-portal/lainnya", label: "Lainnya", icon: Users },
  ];

  return (
    <PortalShell user={user} portalLabel="Portal PM" navItems={navItems} onLogout={handleLogout}>
      {children}
    </PortalShell>
  );
}
```

- [ ] **Step 2: Tulis `pm-portal/approval/page.tsx`**

Mapping `jenis → path` LOKAL (§2.4 poin 3 spec — jangan sentuh katalog `jalurUi` backend):

```tsx
"use client";

import { useState } from "react";
import { Inbox, AlertTriangle } from "lucide-react";
import { useData, invalidasi } from "@/lib/data-cache";
import { api } from "@/lib/api";
import BottomSheet from "@/components/portal/BottomSheet";
import StatusBadge from "@/components/portal/StatusBadge";
import EmptyState from "@/components/portal/EmptyState";
import SkeletonCard from "@/components/portal/SkeletonCard";
import type { BarisInbox, ResponsInbox, GalatApi } from "../_bersama/tipe";
import { pesanGalat } from "../_bersama/tipe";

// Endpoint approve/reject per entity type — body shape mengikuti API masing-
// masing, JANGAN diseragamkan. Diverifikasi ke kode backend (lihat riset
// approval-inbox di riwayat commit plan ini untuk detail lengkap per jenis).
const AKSI: Record<string, { approveUrl: (id: string) => string; approveBody: (accId?: string) => object; rejectUrl: (id: string) => string; rejectBody: (alasan: string) => object }> = {
  kasbon: {
    approveUrl: (id) => `/api/v1/kasbons/${id}/status`,
    approveBody: () => ({ status: "approved" }),
    rejectUrl: (id) => `/api/v1/kasbons/${id}/status`,
    rejectBody: (alasan) => ({ status: "rejected", alasan_override: alasan || undefined }),
  },
  submittal: {
    approveUrl: (id) => `/api/v1/submittals/${id}/keputusan`,
    approveBody: () => ({ keputusan: "disetujui" }),
    rejectUrl: (id) => `/api/v1/submittals/${id}/keputusan`,
    rejectBody: (alasan) => ({ keputusan: "ditolak", catatan: alasan }),
  },
  punch_item: {
    approveUrl: (id) => `/api/v1/punch-items/${id}/status`,
    approveBody: () => ({ status: "ditutup" }),
    rejectUrl: (id) => `/api/v1/punch-items/${id}/status`,
    rejectBody: (alasan) => ({ status: "ditolak", alasan_penolakan: alasan }),
  },
  // material_request, purchase_order, dst — TAMBAHKAN sesuai `jenis` yang
  // benar-benar muncul di `ringkas` respons API saat diverifikasi manual;
  // JANGAN tebak endpoint yang belum dibaca kodenya.
};

export default function PmApprovalPage() {
  const { data, memuat, galat } = useData<ResponsInbox>("/api/v1/approval/inbox");
  const [dipilih, setDipilih] = useState<BarisInbox | null>(null);
  const [alasan, setAlasan] = useState("");
  const [mengirim, setMengirim] = useState(false);
  const [galatAksi, setGalatAksi] = useState<string | null>(null);

  async function putuskan(keputusan: "approve" | "reject") {
    if (!dipilih) return;
    const konfig = AKSI[dipilih.jenis];
    if (!konfig) {
      setGalatAksi("Jenis approval ini belum didukung di portal PM.");
      return;
    }
    setMengirim(true);
    setGalatAksi(null);
    try {
      if (keputusan === "approve") {
        await api.patch(konfig.approveUrl(dipilih.id), konfig.approveBody());
      } else {
        await api.patch(konfig.rejectUrl(dipilih.id), konfig.rejectBody(alasan));
      }
      setDipilih(null);
      setAlasan("");
      invalidasi("/api/v1/approval/inbox");
    } catch (e) {
      setGalatAksi(pesanGalat(e as GalatApi, "Gagal memproses"));
    } finally {
      setMengirim(false);
    }
  }

  if (galat) {
    return <EmptyState icon={AlertTriangle} judul="Gagal memuat inbox" deskripsi={pesanGalat(galat as GalatApi, "Coba lagi.")} />;
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {data?.dilewati && data.dilewati.length > 0 && (
        <div style={{ padding: 12, borderRadius: 12, background: "var(--warning-bg)", fontSize: 12, color: "var(--on-warning-bg)" }}>
          {data.dilewati.length} jenis approval gagal dimuat — sebagian daftar mungkin tak lengkap.
        </div>
      )}

      {memuat && <SkeletonCard tinggi={90} />}
      {!memuat && (data?.data?.length ?? 0) === 0 && (
        <EmptyState icon={Inbox} judul="Tidak ada approval menunggu" deskripsi="Semua pengajuan sudah diproses." />
      )}

      {(data?.data ?? []).map((baris) => (
        <button
          key={`${baris.jenis}-${baris.id}`}
          onClick={() => setDipilih(baris)}
          disabled={baris.saya_pengajunya}
          style={{
            textAlign: "left", padding: 16, borderRadius: 16,
            background: "var(--surface)", border: "1px solid var(--border)",
            display: "flex", flexDirection: "column", gap: 6, cursor: baris.saya_pengajunya ? "default" : "pointer",
            opacity: baris.saya_pengajunya ? 0.6 : 1,
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: "var(--navy)", textTransform: "uppercase" }}>{baris.label}</span>
            {baris.saya_pengajunya && <StatusBadge status="info" label="Pengajuan Anda" />}
          </div>
          <span style={{ fontSize: 14, fontWeight: 600, color: "var(--text-primary)" }}>{baris.judul ?? baris.nomor ?? "—"}</span>
          {baris.nominal !== null && (
            <span style={{ fontSize: 18, fontWeight: 800, color: "var(--text-primary)", fontVariantNumeric: "tabular-nums" }}>
              Rp {baris.nominal.toLocaleString("id-ID")}
            </span>
          )}
        </button>
      ))}

      <BottomSheet terbuka={!!dipilih} onTutup={() => { setDipilih(null); setAlasan(""); setGalatAksi(null); }} judul={dipilih?.judul ?? "Detail Approval"}>
        {dipilih && (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <div style={{ fontSize: 13, color: "var(--text-secondary)" }}>
              Level selesai: {dipilih.level_selesai} — pastikan Anda memeriksa detail lengkap sebelum memutuskan.
            </div>
            <label style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>
              Alasan (wajib bila menolak)
              <textarea
                value={alasan}
                onChange={(e) => setAlasan(e.target.value)}
                rows={3}
                style={{ width: "100%", marginTop: 6, padding: 12, borderRadius: 12, border: "1px solid var(--border)", fontSize: 14, fontFamily: "inherit" }}
              />
            </label>
            {galatAksi && <div style={{ fontSize: 12, color: "var(--danger)" }}>{galatAksi}</div>}
            <div style={{ display: "flex", gap: 8 }}>
              <button
                onClick={() => putuskan("reject")}
                disabled={mengirim}
                style={{ flex: 1, padding: 14, borderRadius: "var(--portal-radius-pill)", background: "var(--danger-bg)", color: "var(--danger)", border: "1px solid var(--danger-border)", fontSize: 14, fontWeight: 700, cursor: "pointer" }}
              >
                Tolak
              </button>
              <button
                onClick={() => putuskan("approve")}
                disabled={mengirim}
                style={{ flex: 1, padding: 14, borderRadius: "var(--portal-radius-pill)", background: "var(--navy)", color: "var(--on-navy)", border: "none", fontSize: 14, fontWeight: 700, cursor: "pointer" }}
              >
                {mengirim ? "Memproses…" : "Setujui"}
              </button>
            </div>
          </div>
        )}
      </BottomSheet>
    </div>
  );
}
```

Catatan wajib untuk executor: `AKSI` di atas HANYA berisi 3 jenis (kasbon/submittal/punch_item) sebagai contoh terverifikasi — sebelum halaman ini dianggap selesai, jalankan endpoint inbox dengan akun PM uji, lihat `ringkas` di response untuk tahu jenis APA SAJA yang benar-benar muncul untuk company uji ini, lalu tambahkan entri `AKSI` untuk tiap jenis yang muncul TAPI PM punya permission approve-nya (cocokkan ke tabel §2.2 spec — JANGAN tambahkan `change_order`/`opname_bersama`/`back_charge` karena PM tidak punya permission approve untuk itu, lihat Global Constraints).

- [ ] **Step 3: Tulis ulang `pm-portal/page.tsx` (Beranda)**

```tsx
"use client";

import { Inbox, FolderKanban, TrendingUp } from "lucide-react";
import { useData } from "@/lib/data-cache";
import KpiCard from "@/components/portal/KpiCard";
import SkeletonCard from "@/components/portal/SkeletonCard";
import type { ResponsInbox, ProyekPM } from "./_bersama/tipe";

export default function PmBerandaPage() {
  const { data: inbox, memuat: memuatInbox } = useData<ResponsInbox>("/api/v1/approval/inbox");
  const { data: proyekResp, memuat: memuatProyek } = useData<{ projects: ProyekPM[] }>("/api/v1/projects");

  const proyekSaya = (proyekResp?.projects ?? []).filter((p) => p.pm_id);
  const memuat = memuatInbox || memuatProyek;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {memuat ? (
        <SkeletonCard tinggi={110} />
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <KpiCard label="Menunggu Approval" nilai={String(inbox?.total ?? 0)} icon={Inbox} />
          <KpiCard label="Proyek Aktif" nilai={String(proyekSaya.length)} icon={FolderKanban} />
        </div>
      )}
    </div>
  );
}
```

Catatan: grafik progress proyek + target vs realisasi (spec §4 dan §7.2) ditambahkan di halaman `/pm-portal/proyek` (Task 10), bukan di Beranda — Beranda tetap ringkas sesuai pola KPI-first.

- [ ] **Step 4: Buat halaman "Lainnya" PM**

```tsx
"use client";

import { ShieldAlert, ClipboardCheck, FileQuestion, FileStack, FileText, Calendar, Landmark, ShoppingCart } from "lucide-react";
import ActionCard from "@/components/portal/ActionCard";

const ITEMS = [
  { href: "/pm-portal/k3", label: "K3", icon: ShieldAlert },
  { href: "/pm-portal/punch-list", label: "Punch List", icon: ClipboardCheck },
  { href: "/pm-portal/inspeksi-rfi", label: "Inspeksi & RFI", icon: FileQuestion },
  { href: "/pm-portal/submittal", label: "Submittal", icon: FileStack },
  { href: "/pm-portal/dokumen", label: "Dokumen", icon: FileText },
  { href: "/pm-portal/jadwal", label: "Jadwal & Baseline", icon: Calendar },
  { href: "/pm-portal/kontrak", label: "Kontrak", icon: Landmark },
  { href: "/pm-portal/procurement", label: "Procurement", icon: ShoppingCart },
  { href: "/pm-portal/mandor", label: "Mandor", icon: ShieldAlert },
];

export default function PmLainnyaPage() {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12 }}>
      {ITEMS.map((item) => <ActionCard key={item.href} {...item} />)}
    </div>
  );
}
```

- [ ] **Step 5: Typecheck**

Run: `cd apps/web && npx tsc --noEmit`
Expected: bersih

- [ ] **Step 6: Verifikasi manual approval end-to-end**

Dengan akun PM uji: buka `/pm-portal/approval`, pilih satu kasbon pending, klik "Setujui", konfirmasi:
1. Request terkirim ke `PATCH /api/v1/kasbons/:id/status` dengan `{status: "approved"}` (cek network tab)
2. List refresh (invalidasi cache bekerja)
3. Kalau kasbon itu bukan level final, pesan tidak mengklaim "disetujui" (backend mengembalikan `pending_next_level: true` — **catatan: kode Step 2 di atas belum menangani response ini secara eksplisit; sebelum menganggap task selesai, tambahkan pengecekan `res.data?.pending_next_level` dan tampilkan pesan "Naik ke level berikutnya" alih-alih toast sukses generik**)

- [ ] **Step 7: Audit a11y**

```bash
LAYAR_EMAIL=… LAYAR_SANDI=… LAYAR_BASIS=http://localhost:3000 node apps/web/scripts/jalankan-a11y-lengkap.mjs
```
Expected: 0 pelanggaran untuk `/pm-portal/*`

- [ ] **Step 8: Jalankan penjaga approval**

```bash
cd apps/api && node scripts/audit-approval-satu-pintu.mjs
cd apps/api && node scripts/audit-inbox-lengkap.mjs
```
Expected: exit 0 — memastikan halaman baru tidak membuat jalur approval kedua

- [ ] **Step 9: Commit**

```bash
git add apps/web/app/pm-portal/layout.tsx apps/web/app/pm-portal/page.tsx apps/web/app/pm-portal/approval/ apps/web/app/pm-portal/lainnya/
git commit -m "feat(pm-portal): layout PortalShell + beranda + approval inbox (prioritas tertinggi spec)"
```

---

### Task 10: Modul PM — K3/Punch/Inspeksi/Submittal (manage), Dokumen, Jadwal & Baseline, Kontrak, Procurement + restyle proyek/mandor/keuangan

**Files:**
- Create: `apps/web/app/pm-portal/k3/page.tsx`
- Create: `apps/web/app/pm-portal/punch-list/page.tsx`
- Create: `apps/web/app/pm-portal/inspeksi-rfi/page.tsx`
- Create: `apps/web/app/pm-portal/submittal/page.tsx`
- Create: `apps/web/app/pm-portal/dokumen/page.tsx`
- Create: `apps/web/app/pm-portal/jadwal/page.tsx`
- Create: `apps/web/app/pm-portal/kontrak/page.tsx`
- Create: `apps/web/app/pm-portal/procurement/page.tsx`
- Modify: `apps/web/app/pm-portal/proyek/page.tsx`, `proyek/[id]/page.tsx` (kalau ada — cek dulu), `mandor/page.tsx`, `keuangan/page.tsx`

**Interfaces:**
- Consumes: sama seperti Task 7 (pola identik, domain PM bukan mandor)
- Produces: tidak ada — task terakhir portal PM

- [ ] **Step 1: K3/Punch/Inspeksi/Submittal — versi manage/verify/periksa/decide**

Pola SAMA PERSIS dengan Task 7 Step 2-3 (list + `BottomSheet` form), BEDANYA: PM lihat SEMUA item (bukan cuma yang dia lapor) dan punya aksi tambahan verify/decide (pakai pola `putuskan()` dari Task 9 Step 2 — approve/reject via endpoint yang sudah diverifikasi di riset: `PATCH /api/v1/punch-items/:id/status` dengan `punch:verify`, `POST /api/v1/submittals/:id/keputusan` dengan `submittal:decide`).

Untuk K3 dan Inspeksi/RFI: PM py `k3:*:manage` dan `inspeksi:periksa`/`rfi:manage` — tambahkan tombol aksi (tutup insiden, verifikasi inspeksi) di kartu list, memanggil endpoint `PATCH`/`POST` yang sesuai (path exact diverifikasi dari `k3-lapangan.ts`/`inspeksi.ts`/`rfi.ts` — baca dulu sebelum menulis, sama seperti Task 7 Step 1).

- [ ] **Step 2: Dokumen proyek**

```tsx
"use client";

import { useState } from "react";
import { FileText, Upload } from "lucide-react";
import { useData, invalidasi } from "@/lib/data-cache";
import { api } from "@/lib/api";
import EmptyState from "@/components/portal/EmptyState";
import SkeletonCard from "@/components/portal/SkeletonCard";
import type { DokumenProyek, GalatApi } from "../_bersama/tipe";
import { pesanGalat } from "../_bersama/tipe";

export default function PmDokumenPage() {
  // Endpoint GET dokumen scoped per-proyek (documents.ts) — perlu project_id.
  // Untuk PM dengan >1 proyek, halaman ini butuh pemilih proyek dulu; untuk
  // task ini diasumsikan single-project view via query param ?proyek=<id>
  // yang di-set dari halaman /pm-portal/proyek (Step 4). Baca documents.ts
  // untuk konfirmasi apakah endpoint list-semua-proyek tersedia — kalau
  // tidak, pemilih proyek WAJIB ada sebelum halaman ini berguna.
  const { data, memuat, galat } = useData<{ data: DokumenProyek[] }>("/api/v1/documents");

  if (galat) {
    return <EmptyState icon={FileText} judul="Gagal memuat dokumen" deskripsi={pesanGalat(galat as GalatApi, "Coba lagi.")} />;
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {memuat && <SkeletonCard tinggi={70} />}
      {!memuat && (data?.data?.length ?? 0) === 0 && (
        <EmptyState icon={FileText} judul="Belum ada dokumen" deskripsi="Dokumen kontrak/SPK proyek akan muncul di sini." />
      )}
      {(data?.data ?? []).map((doc) => (
        <a
          key={doc.id}
          href={doc.url ?? "#"}
          target="_blank"
          rel="noreferrer"
          style={{
            display: "flex", alignItems: "center", gap: 12, padding: 14,
            borderRadius: 14, background: "var(--surface)", border: "1px solid var(--border)",
            textDecoration: "none",
          }}
        >
          <FileText size={20} color="var(--navy)" />
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>{doc.nama_file ?? "Dokumen"}</div>
            <div style={{ fontSize: 11, color: "var(--text-secondary)" }}>{doc.jenis ?? "—"}</div>
          </div>
        </a>
      ))}
    </div>
  );
}
```

**Catatan wajib**: comment di kode di atas menandai ketidakpastian real — executor WAJIB baca `apps/api/src/routes/v1/documents.ts` dulu untuk konfirmasi apakah endpoint-nya `/api/v1/documents` (semua proyek PM) atau `/api/v1/projects/:id/documents` (per-proyek) sebelum halaman ini dianggap selesai. Sesuaikan URL `useData` dan tambahkan pemilih proyek (dropdown dari `/api/v1/projects`) kalau endpoint memang per-proyek.

- [ ] **Step 3: Jadwal & Baseline, Kontrak, Procurement**

Pola sama Step 1-2 (list + detail, `BottomSheet` untuk aksi kelola bila permission mengizinkan). Jadwal & Baseline pakai `frappe-gantt` sama seperti Task 7 Step 4, tapi PM py `projects:baseline:manage` sehingga tambahkan tombol "Set Baseline" yang memanggil endpoint `baseline-jadwal.ts` (path diverifikasi dulu dari kode).

- [ ] **Step 4: Restyle `proyek/page.tsx`, `mandor/page.tsx`, `keuangan/page.tsx`**

Ganti inline style lama → token + komponen Task 3-5, sama seperti Task 7 Step 5. Di `proyek/page.tsx`: tambahkan grafik progress (spec §4) — `MiniChart` per proyek dengan `KpiCard` target vs realisasi (data dari `progress_pct` yang sudah ada di response `/api/v1/projects`).

- [ ] **Step 5: Typecheck**

Run: `cd apps/web && npx tsc --noEmit`
Expected: bersih

- [ ] **Step 6: Audit a11y + penjaga**

```bash
LAYAR_EMAIL=… LAYAR_SANDI=… LAYAR_BASIS=http://localhost:3000 node apps/web/scripts/jalankan-a11y-lengkap.mjs
cd apps/api && node scripts/audit-halaman-pakai-cache.mjs
cd apps/api && node scripts/uji-judul-halaman-ada.mjs
```
Expected: 0 pelanggaran a11y, penjaga exit 0

- [ ] **Step 7: Commit**

```bash
git add apps/web/app/pm-portal/
git commit -m "feat(pm-portal): modul K3/punch/inspeksi/submittal/dokumen/jadwal/kontrak/procurement + restyle"
```

---

## Bagian D — Portal Klien (Task 11–12)

### Task 11: Layout portal klien baru + halaman Beranda

**Files:**
- Modify: `apps/web/app/portal/layout.tsx` (tulis ulang total)
- Modify: `apps/web/app/portal/page.tsx` (tulis ulang total)

**Interfaces:**
- Consumes: Task 3-5, tipe Task 1
- Produces: pola layout untuk Task 12

- [ ] **Step 1: Tulis ulang `portal/layout.tsx`**

Pola paling sederhana (sama seperti riset konfirmasi — statis, tidak ada async role check):

```tsx
"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getStoredUser, logout, type PuralokaUser } from "@/lib/api";
import PortalShell, { type NavItem } from "@/components/portal/PortalShell";
import { LayoutDashboard, Bell, User } from "lucide-react";

export default function PortalKlienLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [user, setUser] = useState<PuralokaUser | null>(null);

  useEffect(() => {
    const u = getStoredUser();
    if (!u) { router.replace("/login"); return; }
    if (u.role !== "client") { router.replace("/dashboard"); return; }
    setUser(u);
  }, [router]);

  if (!user) return null;

  function handleLogout() {
    logout();
    router.push("/login");
  }

  const navItems: NavItem[] = [
    { href: "/portal", label: "Beranda", icon: LayoutDashboard, exact: true },
    { href: "/portal/notifikasi", label: "Notifikasi", icon: Bell },
    { href: "/portal/profil", label: "Profil", icon: User },
  ];

  return (
    <PortalShell user={user} portalLabel="Portal Klien" navItems={navItems} onLogout={handleLogout}>
      {children}
    </PortalShell>
  );
}
```

Catatan: hanya 3 nav item (tidak butuh halaman "Lainnya" — struktur klien tetap ramping, semua modul tambahan masuk sebagai TAB di `proyek/[id]`, bukan menu terpisah, sesuai spec §7.3).

- [ ] **Step 2: Tulis ulang `portal/page.tsx` (Beranda)**

```tsx
"use client";

import Link from "next/link";
import { FolderKanban } from "lucide-react";
import { useData } from "@/lib/data-cache";
import KpiCard from "@/components/portal/KpiCard";
import MiniChart from "@/components/portal/MiniChart";
import SkeletonCard from "@/components/portal/SkeletonCard";
import EmptyState from "@/components/portal/EmptyState";

interface ProyekKlien {
  id: string;
  name: string;
  progress_pct?: number | null;
  status?: string | null;
}

export default function PortalKlienBerandaPage() {
  const { data, memuat } = useData<{ projects: ProyekKlien[] }>("/api/v1/projects");
  const proyek = data?.projects ?? [];
  const aktif = proyek.filter((p) => p.status === "active" || p.status === "aktif");

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {memuat ? (
        <SkeletonCard tinggi={110} />
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <KpiCard label="Proyek Aktif" nilai={String(aktif.length)} icon={FolderKanban} />
          <KpiCard label="Total Proyek" nilai={String(proyek.length)} icon={FolderKanban} />
        </div>
      )}

      {!memuat && proyek.length > 0 && (
        <div style={{ background: "var(--surface)", borderRadius: "var(--portal-radius-card)", border: "1px solid var(--border)", padding: 20 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: "var(--text-primary)", marginBottom: 12 }}>
            Ringkasan Progress
          </div>
          <MiniChart
            tipe="bar"
            tinggi={100}
            data={proyek.map((p) => ({ label: p.name, value: p.progress_pct ?? 0 }))}
          />
        </div>
      )}

      {!memuat && proyek.length === 0 && (
        <EmptyState icon={FolderKanban} judul="Belum ada proyek" deskripsi="Proyek Anda akan muncul di sini." />
      )}

      {!memuat && proyek.map((p) => (
        <Link
          key={p.id}
          href={`/portal/proyek/${p.id}`}
          style={{
            display: "flex", alignItems: "center", justifyContent: "space-between",
            padding: 16, borderRadius: 16, background: "var(--surface)",
            border: "1px solid var(--border)", textDecoration: "none",
          }}
        >
          <span style={{ fontSize: 14, fontWeight: 600, color: "var(--text-primary)" }}>{p.name}</span>
          <span style={{ fontSize: 13, fontWeight: 700, color: "var(--navy)" }}>{p.progress_pct ?? 0}%</span>
        </Link>
      ))}
    </div>
  );
}
```

- [ ] **Step 3: Typecheck**

Run: `cd apps/web && npx tsc --noEmit`
Expected: bersih

- [ ] **Step 4: Commit**

```bash
git add apps/web/app/portal/layout.tsx apps/web/app/portal/page.tsx
git commit -m "feat(portal): layout klien PortalShell + beranda dengan ringkasan progress lintas-proyek"
```

---

### Task 12: Tab baru di proyek/[id] (Punch List, Inspeksi, Submittal read-only) + restyle 7-tab existing + notifikasi/profil

**Files:**
- Modify: `apps/web/app/portal/proyek/[id]/page.tsx` (tambah 3 tab baru + restyle 7 tab existing)
- Modify: `apps/web/app/portal/notifikasi/page.tsx`, `profil/page.tsx` (restyle)

**Interfaces:**
- Consumes: Task 3-5, tipe `PunchItemKlien`/`InspeksiKlien`/`SubmittalKlien` (Task 1)
- Produces: tidak ada — task terakhir plan ini

- [ ] **Step 1: Baca struktur tab existing**

Baca `apps/web/app/portal/proyek/[id]/page.tsx` lengkap (644 baris) untuk memahami pola tab-switching yang sudah ada sebelum menambah 3 tab baru — pertahankan struktur data-fetching per-tab (kemungkinan lazy per-tab-aktif), ganti HANYA render jadi `SegmentedTab` (Task 5) dan styling jadi token portal.

- [ ] **Step 2: Tambah 3 tab read-only**

Untuk tiap tab baru (Punch List, Inspeksi, Submittal): `useData<{data: T[]}>(url_scoped_project)` + list `StatusBadge`, TANPA tombol aksi apa pun (klien cuma `*:view`, bukan `:manage`). Pola identik Task 7 Step 2 minus form/BottomSheet.

Path endpoint: `GET /api/v1/projects/:id/punch-items` (atau serupa — verifikasi ke `punch-list.ts` untuk path exact yang scoped per-proyek, karena endpoint yang dipakai mandor/PM mungkin tak ter-scope project di path-nya).

- [ ] **Step 3: Restyle 7 tab existing**

Ganti styling inline lama → token portal + komponen Task 3-5 (terutama tab Kurva S: `recharts` existing di-restyle pakai warna `var(--navy)` bukan warna lama, tab Foto/Dokumen pakai card pattern konsisten dengan portal mandor/PM).

- [ ] **Step 4: Restyle `notifikasi/page.tsx`, `profil/page.tsx`**

Ganti `C` dari `warna-ui.ts` → token langsung, list notifikasi pakai card pattern Task 7 Step 2.

- [ ] **Step 5: Typecheck**

Run: `cd apps/web && npx tsc --noEmit`
Expected: bersih

- [ ] **Step 6: Audit a11y**

```bash
LAYAR_EMAIL=… LAYAR_SANDI=… LAYAR_BASIS=http://localhost:3000 node apps/web/scripts/jalankan-a11y-lengkap.mjs
```
Expected: 0 pelanggaran untuk `/portal/*` (termasuk `/portal/proyek/[id]` — CLAUDE.md §8a.3 mencatat ini rute terkaya di aplikasi, pastikan id dinamis terisi otomatis oleh pembungkus skrip)

- [ ] **Step 7: Jalankan penjaga akhir — SEMUA penjaga CI**

```bash
cd apps/api && node scripts/jalankan-semua-penjaga.mjs
```
Expected: tempel ringkasan lengkap — ini penjaga terakhir sebelum PR, WAJIB semua hijau atau ratchet tidak naik

- [ ] **Step 8: Commit**

```bash
git add apps/web/app/portal/
git commit -m "feat(portal): tab punch-list/inspeksi/submittal read-only + restyle 7-tab proyek + notifikasi/profil"
```

---

## Self-Review (dilakukan penulis plan, bukan subagent)

**1. Cakupan spec:**
- §2.1 (gap mandor) → Task 7 ✓
- §2.2/§2.4 (gap PM + approval detail) → Task 8, 9, 10 ✓
- §2.3 (gap klien) → Task 12 ✓
- §3 (visual Navy Ledger) → Task 2 (token) + dipakai semua task komponen ✓
- §4 (visualisasi data + tren) → Task 4 (KpiCard/MiniChart) + dipakai Task 6,7,9,10,11 ✓
- §5 (navigasi bottom-nav+lainnya+bottomsheet) → Task 3, 5 ✓
- §6 (component library) + §6.1 (batas portabilitas) → Task 3-5, dicatat sebagai constraint bukan task tersendiri (tidak ada kode untuk "batas" — itu keputusan desain yang sudah tercermin di TIDAK adanya shared JSX dengan mobile) ✓
- §7.1/7.2/7.3 (cakupan fitur final) → Task 6-7 (mandor), 9-10 (PM), 11-12 (klien) ✓
- §8 (testing) → tiap task punya step a11y/penjaga/test sendiri, Task 12 Step 7 jalankan SEMUA penjaga sebagai gerbang akhir ✓
- §8a (peringatan permission runtime) → dicatat di Global Constraints dan Task 9 Step 2 (verifikasi manual jenis approval yang benar-benar aktif) ✓
- §9 (di luar scope) → tidak ada task yang menyentuh apps/mobile atau permission baru ✓

**2. Placeholder scan:** Beberapa langkah (K3 path endpoint di Task 7 Step 2, dokumen endpoint di Task 10 Step 2, punch-list path di Task 12 Step 2) SENGAJA ditandai "verifikasi dulu sebelum tulis kode" karena riset belum membaca file-file itu sampai baris pasti — ini bukan placeholder "TBD" tapi instruksi eksplisit dengan lokasi file yang harus dibaca dan alasan kenapa tak bisa ditebak. Dipertahankan apa adanya, bukan dihaluskan jadi angka pasti yang belum terverifikasi (menghindari plan yang terlihat pasti tapi sebenarnya menebak).

**3. Konsistensi tipe:** `PortalShellProps` (Task 3) dipakai identik di Task 6/9/11 (`user`, `portalLabel`, `navItems`, `onLogout`, opsional `modeSwitcher`). `KpiCardProps`/`TrenPeriode` (Task 4) dipakai identik di Task 6/9/11. `pesanGalat`/`GalatApi` didefinisikan 3x (satu per `_bersama/tipe.ts`) SENGAJA — mengikuti pola existing mandor-portal (bukan diekstrak ke shared module lintas-portal, karena ketiga portal punya `_bersama/` sendiri-sendiri sesuai struktur route Next.js yang sudah ada). Tidak ada mismatch nama fungsi/tipe antar task yang ditemukan saat review.

---

Plan complete and saved to `docs/superpowers/plans/2026-08-19-portal-mobile-rombak.md`. Two execution options:

**1. Subagent-Driven (recommended)** - I dispatch a fresh subagent per task, review between tasks, fast iteration

**2. Inline Execution** - Execute tasks in this session using executing-plans, batch execution with checkpoints

**Which approach?**
