# Landing Publik Tahap 1 — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Menerbitkan compro Puraloka Persada di `apps/web-publik` dengan seluruh konten dikelola dari dashboard admin — nol string konten di berkas `.tsx`.

**Architecture:** Aplikasi Next.js terpisah dalam workspace pnpm yang sama. Konten disimpan di tabel ber-`company_id` dengan RLS aktif, dibaca lewat endpoint publik read-only ber-rate-limit, dirender ISR dengan revalidate-on-save. Resolusi tenant dipusatkan di satu fungsi yang hari ini mengembalikan konstanta.

**Tech Stack:** Next.js 16.2.12 · React 19.2.4 · Fastify · PostgreSQL 17.6 (Supabase) · Vitest · sharp (pipeline media) · React Three Fiber + drei (Task 9) · GSAP ScrollTrigger (Task 10)

**Spec:** `docs/superpowers/specs/2026-08-06-landing-publik-design.md`

## Global Constraints

- **Nol hardcode konten.** Setiap string/angka/media yang tampil publik berasal dari DB. Tidak ada teks konten di `.tsx` — termasuk nomor telepon, alamat, dan nama proyek.
- **Warna utama:** gradasi navy `#001F3D → #003366 → #0059B3` (sama dengan dashboard).
- **Kuning `#FFD600` = aksen tipis.** Satu elemen kuning per layar. Dilarang jadi warna bidang, latar seksi, tombol utama, atau logo. Dilarang di atas putih (1,41:1).
- **Logo tampil putih** (`color: #FFFFFF`), memakai `apps/web/public/puraloka-lambang.svg` apa adanya — jangan gambar ulang.
- **Kontras diukur terhadap latar sebenarnya**, bukan diasumsikan putih. Validasi menilai pasangan (warna, latar, peran).
- **Semua waktu `timestamptz`, semua nominal `numeric`.** Dilarang `float` dan `timestamp without time zone`.
- **Otorisasi hanya `requirePermission`** (ADR-004). Literal `'admin'`/`'pm'` dilarang sebagai gerbang di kode TypeScript.
- **Akses data lewat `request.db`** (sadar tenant), bukan `supabase` mentah — kecuali endpoint publik yang memang tanpa auth (dijelaskan di Task 4).
- **Nomor migrasi mulai 200** (terakhir terpakai: 199). Verifikasi ulang dengan `ls db/migrations/*.sql | tail -1` sebelum membuat berkas.
- **Copy memakai suara dashboard:** verba aktif, kalimat pendek, spesifik. Dilarang: "solusi terintegrasi", "mitra terpercaya", "kualitas terbaik", "berkomitmen".
- **Entitas: "Puraloka Persada"**, narasi **sejak 2009**.
- **NPWP tidak ditampilkan publik.** NIB `2110240218547` boleh.

---

## File Structure

```
db/migrations/
  200_situs_konten.sql            tabel CMS + RLS + seed

apps/api/src/
  lib/situs-warna.ts              kalkulasi kontras — pure, tak sentuh DB
  lib/__tests__/situs-warna.test.ts
  routes/v1/situs.ts              endpoint admin (auth) + publik (tanpa auth)
  routes/v1/__tests__/situs.test.ts
  index.ts                        +2 baris registrasi

apps/api/scripts/
  impor-media-compro.mjs          ekstrak+normalisasi foto → Storage (sekali jalan)

apps/web-publik/                  APLIKASI BARU
  package.json  next.config.ts  tsconfig.json  vitest.config.ts
  app/layout.tsx  app/page.tsx  app/globals.css
  lib/tenant.ts                 resolusi tenant — SATU-SATUNYA tempat
  lib/konten.ts                 fetch + tipe
  lib/__tests__/tenant.test.ts
  components/seksi/*.tsx        satu berkas per seksi
  components/adegan/*.tsx       WebGL (Task 9)

apps/web/app/(dashboard)/pengaturan/situs/
  page.tsx                      UI admin
```

---

### Task 1: Migrasi tabel CMS

**Files:**
- Create: `db/migrations/200_situs_konten.sql`

**Interfaces:**
- Produces: tabel `situs_konten`, `situs_kategori`, `situs_media`, `situs_milestone`, `situs_legalitas`, `situs_seksi`, `situs_merek` — semua ber-`company_id uuid NOT NULL REFERENCES companies(id)`, RLS aktif.

- [ ] **Step 1: Verifikasi nomor migrasi bebas**

```bash
ls db/migrations/*.sql | tail -1
```
Expected: `199_register_asuransi.sql`. Bila lebih tinggi, pakai nomor berikutnya dan sesuaikan seluruh nama berkas di task ini.

- [ ] **Step 2: Tulis migrasi**

Ikuti pola header `199_register_asuransi.sql`: jelaskan *kenapa*, bukan hanya *apa*.

```sql
-- ════════════════════════════════════════════════════════════════════════════
-- 200 — Konten situs publik (compro)
--
-- ── Kenapa tabel sendiri, bukan menumpang `settings`
--
-- `settings` menyimpan konfigurasi perilaku aplikasi. Konten situs adalah
-- MATERI TERBIT: punya urutan, status terbit, dan riwayat. Menumpangkannya
-- berarti satu baris `settings` menyimpan paragraf HTML — dan tak ada lagi
-- yang bisa menjawab "apa yang tampil di halaman depan hari ini".
--
-- ── Kenapa `company_id` padahal hari ini cuma satu perusahaan
--
-- Gerbang mutlak (STATUS.md): tenant kedua dilarang sebelum Tahap 4 & 5.
-- Tapi menambah kolom saat tabel KOSONG berbiaya nol, sementara retrofit
-- adalah pekerjaan yang sedang menyita Fase 0. Yang ditunda adalah PERILAKU
-- multi-tenant (resolusi domain→tenant), bukan bentuk datanya.
--
-- ── Kenapa `nilai` jsonb, bukan text
--
-- Satu kunci konten bisa berupa teks, angka, atau objek (mis. tautan dengan
-- label + url). Kolom text memaksa pemanggil mem-parse sendiri, dan tiap
-- pemanggil akan memilih konvensi yang berbeda.
-- ════════════════════════════════════════════════════════════════════════════

BEGIN;

CREATE TABLE situs_konten (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id   uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  kunci        text NOT NULL,
  nilai        jsonb NOT NULL,
  diperbarui   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, kunci)
);

CREATE TABLE situs_kategori (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id   uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  kunci        text NOT NULL,
  judul        text NOT NULL,
  ringkasan    text,
  lokasi       text,
  lingkup      text,
  urutan       integer NOT NULL DEFAULT 0,
  tampil       boolean NOT NULL DEFAULT true,
  UNIQUE (company_id, kunci)
);

CREATE TABLE situs_media (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id   uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  kategori_id  uuid REFERENCES situs_kategori(id) ON DELETE SET NULL,
  path_storage text NOT NULL,
  alt          text NOT NULL,
  lebar        integer NOT NULL,
  tinggi       integer NOT NULL,
  urutan       integer NOT NULL DEFAULT 0,
  tampil       boolean NOT NULL DEFAULT true,
  CONSTRAINT situs_media_dimensi_masuk_akal CHECK (lebar > 0 AND tinggi > 0)
);

CREATE TABLE situs_milestone (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id   uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  tahun        integer NOT NULL,
  judul        text NOT NULL,
  keterangan   text,
  urutan       integer NOT NULL DEFAULT 0,
  tampil       boolean NOT NULL DEFAULT true,
  CONSTRAINT situs_milestone_tahun_wajar CHECK (tahun BETWEEN 1900 AND 2200)
);

CREATE TABLE situs_legalitas (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id   uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  kode         text NOT NULL,
  judul        text NOT NULL,
  urutan       integer NOT NULL DEFAULT 0,
  tampil       boolean NOT NULL DEFAULT true
);

CREATE TABLE situs_seksi (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id   uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  kunci        text NOT NULL,
  aktif        boolean NOT NULL DEFAULT true,
  urutan       integer NOT NULL DEFAULT 0,
  varian       text NOT NULL DEFAULT 'baku',
  UNIQUE (company_id, kunci),
  -- Rem tingkat-3: varian adalah pilihan diskrit yang SUDAH dirancang,
  -- bukan teks bebas. Tanpa CHECK, admin bisa mengetik varian yang tak
  -- punya komponen dan seksi menghilang tanpa pesan galat.
  CONSTRAINT situs_seksi_varian_dikenal
    CHECK (varian IN ('baku', 'grid', 'carousel', 'split'))
);

CREATE TABLE situs_merek (
  company_id     uuid PRIMARY KEY REFERENCES companies(id) ON DELETE CASCADE,
  warna_utama    text NOT NULL DEFAULT '#003366',
  warna_aksen    text NOT NULL DEFAULT '#FFD600',
  logo_path      text,
  diperbarui     timestamptz NOT NULL DEFAULT now(),
  -- Bentuk hex divalidasi di DB; KONTRAS divalidasi di API (butuh tahu
  -- latar dan peran, yang tak diketahui baris ini).
  CONSTRAINT situs_merek_hex_utama CHECK (warna_utama ~* '^#[0-9a-f]{6}$'),
  CONSTRAINT situs_merek_hex_aksen CHECK (warna_aksen ~* '^#[0-9a-f]{6}$')
);

-- ── RLS ─────────────────────────────────────────────────────────────────────
-- Ember [C]: isolasi tenant tidak boleh bisa dikonfigurasi. Pola mengikuti
-- migrasi 199: RESTRICTIVE untuk isolasi, PERMISSIVE untuk peran.
-- `(SELECT ...)` disengaja — initplan, lihat migrasi 132.

ALTER TABLE situs_konten    ENABLE ROW LEVEL SECURITY;
ALTER TABLE situs_kategori  ENABLE ROW LEVEL SECURITY;
ALTER TABLE situs_media     ENABLE ROW LEVEL SECURITY;
ALTER TABLE situs_milestone ENABLE ROW LEVEL SECURITY;
ALTER TABLE situs_legalitas ENABLE ROW LEVEL SECURITY;
ALTER TABLE situs_seksi     ENABLE ROW LEVEL SECURITY;
ALTER TABLE situs_merek     ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['situs_konten','situs_kategori','situs_media',
                           'situs_milestone','situs_legalitas','situs_seksi',
                           'situs_merek']
  LOOP
    EXECUTE format($f$
      CREATE POLICY tenant_isolation ON %I AS RESTRICTIVE FOR ALL
        USING (company_id = (SELECT auth_company_id()))
        WITH CHECK (company_id = (SELECT auth_company_id()));
    $f$, t);

    EXECUTE format($f$
      CREATE POLICY %I ON %I FOR SELECT
        USING ((SELECT auth_company_id()) IS NOT NULL);
    $f$, t || '_baca', t);

    EXECUTE format($f$
      CREATE POLICY %I ON %I FOR ALL
        USING ((SELECT auth_role()) = 'admin')
        WITH CHECK ((SELECT auth_role()) = 'admin');
    $f$, t || '_kelola', t);
  END LOOP;
END $$;

CREATE INDEX situs_media_kategori_idx ON situs_media (company_id, kategori_id, urutan);
CREATE INDEX situs_konten_kunci_idx   ON situs_konten (company_id, kunci);

COMMIT;
```

- [ ] **Step 3: Jalankan migrasi**

```bash
node scripts/db/introspect.mjs identity
```
Catat `schema_hash` SEBELUM. Terapkan migrasi lewat prosedur repo, lalu:

```bash
node scripts/db/introspect.mjs tables | grep situs_
```
Expected: 7 tabel, `rls_aktif  true`, `jml_policy  3`.

- [ ] **Step 4: Verifikasi ledger**

```bash
node scripts/db/ledger-diff.mjs
```
Expected: tidak ada entri buku tanpa artefak fisik.

- [ ] **Step 5: Commit**

```bash
git add db/migrations/200_situs_konten.sql
git commit -m "feat(situs): tabel konten publik — company_id sejak baris pertama"
```

---

### Task 2: Kalkulasi kontras (pure)

**Files:**
- Create: `apps/api/src/lib/situs-warna.ts`
- Test: `apps/api/src/lib/__tests__/situs-warna.test.ts`

**Interfaces:**
- Produces:
  - `rasioKontras(fg: string, bg: string): number`
  - `type PeranWarna = 'teks' | 'teks-besar' | 'non-teks'`
  - `type HasilValidasi = { lulus: boolean; rasio: number; ambang: number; pesan?: string }`
  - `validasiPasangan(fg: string, bg: string, peran: PeranWarna): HasilValidasi`
  - `LATAR_LANDING: readonly string[]` — `['#001F3D', '#003366', '#0059B3']`
  - `validasiAksen(hex: string): HasilValidasi[]`

- [ ] **Step 1: Tulis test yang gagal**

```typescript
// apps/api/src/lib/__tests__/situs-warna.test.ts
import { describe, it, expect } from 'vitest'
import { rasioKontras, validasiPasangan, validasiAksen } from '../situs-warna.js'

describe('rasioKontras', () => {
  it('putih di atas hitam = 21:1', () => {
    expect(rasioKontras('#FFFFFF', '#000000')).toBeCloseTo(21, 1)
  })

  // Angka jangkar dari spec §5.1 — diukur, bukan dikarang.
  it('kuning merek di atas navy pekat = 11,77:1', () => {
    expect(rasioKontras('#FFD600', '#001F3D')).toBeCloseTo(11.77, 1)
  })

  it('kuning merek di atas putih = 1,41:1', () => {
    expect(rasioKontras('#FFD600', '#FFFFFF')).toBeCloseTo(1.41, 1)
  })

  it('urutan argumen tidak mengubah rasio', () => {
    expect(rasioKontras('#FFD600', '#001F3D'))
      .toBeCloseTo(rasioKontras('#001F3D', '#FFD600'), 5)
  })
})

describe('validasiPasangan', () => {
  it('menolak kuning sebagai teks di atas putih', () => {
    const h = validasiPasangan('#FFD600', '#FFFFFF', 'teks')
    expect(h.lulus).toBe(false)
    expect(h.rasio).toBeCloseTo(1.41, 1)
  })

  it('meloloskan kuning sebagai teks di atas navy pekat', () => {
    expect(validasiPasangan('#FFD600', '#001F3D', 'teks').lulus).toBe(true)
  })

  // Inti temuan spec: warna yang SAMA memberi dua verdikt berbeda.
  // Validator naif akan menolak warna merek perusahaan sendiri.
  it('warna sama, latar beda, verdikt beda', () => {
    expect(validasiPasangan('#FFD600', '#001F3D', 'teks').lulus).toBe(true)
    expect(validasiPasangan('#FFD600', '#FFFFFF', 'teks').lulus).toBe(false)
  })

  it('ambang teks-besar 3:1 lebih longgar dari teks 4,5:1', () => {
    expect(validasiPasangan('#FFD600', '#0059B3', 'teks').lulus).toBe(true)
    expect(validasiPasangan('#767676', '#FFFFFF', 'teks-besar').lulus).toBe(true)
  })

  it('menolak hex tak sah', () => {
    expect(validasiPasangan('bukan-hex', '#FFFFFF', 'teks').lulus).toBe(false)
  })
})

describe('validasiAksen', () => {
  it('menguji aksen terhadap SELURUH latar landing', () => {
    const h = validasiAksen('#FFD600')
    expect(h).toHaveLength(3)
    expect(h.every((x) => x.lulus)).toBe(true)
  })

  it('menolak aksen yang gagal di salah satu latar landing', () => {
    // #0A2A4A terlalu dekat dengan navy — tenggelam di latar tergelap.
    expect(validasiAksen('#0A2A4A').some((x) => !x.lulus)).toBe(true)
  })
})
```

- [ ] **Step 2: Jalankan test — pastikan gagal**

```bash
cd apps/api && npx vitest run src/lib/__tests__/situs-warna.test.ts
```
Expected: FAIL — `Cannot find module '../situs-warna.js'`

- [ ] **Step 3: Implementasi**

```typescript
// apps/api/src/lib/situs-warna.ts
//
// Kontras WCAG 2.1 untuk warna merek situs publik.
//
// Kenapa memvalidasi PASANGAN, bukan warna tunggal: kuning merek Puraloka
// #FFD600 memberi 11,77:1 di atas #001F3D tapi 1,41:1 di atas putih. Warna
// yang sama, dua verdikt. Validator yang menilai warna tunggal akan menolak
// warna merek perusahaan sendiri — lihat spec §4.2.
//
// Pure: tidak menyentuh DB, tidak membaca env. Bisa diuji tanpa Postgres.

export type PeranWarna = 'teks' | 'teks-besar' | 'non-teks'

export type HasilValidasi = {
  lulus: boolean
  rasio: number
  ambang: number
  pesan?: string
}

/** Latar tempat aksen landing benar-benar duduk (spec §5.1). */
export const LATAR_LANDING = ['#001F3D', '#003366', '#0059B3'] as const

const AMBANG: Record<PeranWarna, number> = {
  teks: 4.5,
  'teks-besar': 3,
  'non-teks': 3,
}

const POLA_HEX = /^#[0-9a-f]{6}$/i

function keLinear(kanal: number): number {
  const c = kanal / 255
  return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)
}

function luminansi(hex: string): number | null {
  if (!POLA_HEX.test(hex)) return null
  const n = parseInt(hex.slice(1), 16)
  const r = keLinear((n >> 16) & 255)
  const g = keLinear((n >> 8) & 255)
  const b = keLinear(n & 255)
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

/** Rasio kontras WCAG. Mengembalikan 0 bila salah satu hex tak sah. */
export function rasioKontras(fg: string, bg: string): number {
  const a = luminansi(fg)
  const b = luminansi(bg)
  if (a === null || b === null) return 0
  const [terang, gelap] = a > b ? [a, b] : [b, a]
  return (terang + 0.05) / (gelap + 0.05)
}

export function validasiPasangan(
  fg: string,
  bg: string,
  peran: PeranWarna,
): HasilValidasi {
  const ambang = AMBANG[peran]

  if (!POLA_HEX.test(fg) || !POLA_HEX.test(bg)) {
    return {
      lulus: false,
      rasio: 0,
      ambang,
      pesan: 'Warna harus berformat #RRGGBB.',
    }
  }

  const rasio = rasioKontras(fg, bg)
  if (rasio >= ambang) return { lulus: true, rasio, ambang }

  return {
    lulus: false,
    rasio,
    ambang,
    pesan:
      `${fg} di atas ${bg} hanya ${rasio.toFixed(2)}:1 — ` +
      `syarat ${ambang}:1. Pilih warna yang lebih ${
        (luminansi(bg) ?? 0) > 0.5 ? 'gelap' : 'terang'
      }.`,
  }
}

/** Menguji satu warna aksen terhadap SELURUH latar landing. */
export function validasiAksen(hex: string): HasilValidasi[] {
  return LATAR_LANDING.map((bg) => validasiPasangan(hex, bg, 'teks'))
}
```

- [ ] **Step 4: Jalankan test — pastikan lulus**

```bash
cd apps/api && npx vitest run src/lib/__tests__/situs-warna.test.ts
```
Expected: PASS, 11 test.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/lib/situs-warna.ts apps/api/src/lib/__tests__/situs-warna.test.ts
git commit -m "feat(situs): kontras dinilai per PASANGAN warna-latar-peran"
```

---

### Task 3: Endpoint admin konten

**Files:**
- Create: `apps/api/src/routes/v1/situs.ts`
- Test: `apps/api/src/routes/v1/__tests__/situs.test.ts`
- Modify: `apps/api/src/index.ts`

**Interfaces:**
- Consumes: `validasiAksen`, `validasiPasangan` dari Task 2; tabel Task 1.
- Produces: `GET|PUT /api/v1/situs/konten`, `GET|PUT /api/v1/situs/merek`, `GET|POST|PATCH|DELETE /api/v1/situs/kategori`, `GET|PATCH /api/v1/situs/seksi`.

- [ ] **Step 1: Baca pola route yang sudah ada**

Baca `apps/api/src/routes/v1/units.ts` seluruhnya — itu contoh CRUD terkecil di repo. Tiru: cara `request.db` dipakai, cara error di-log (`request.log.error({ err }, '…')`), cara `logAuditEvent` dipanggil. Penjaga CI `audit-kegagalan-senyap.mjs` dan `audit-tulis-tanpa-periksa.mjs` akan menolak query yang errornya tak diperiksa.

- [ ] **Step 2: Tulis test yang gagal**

```typescript
// apps/api/src/routes/v1/__tests__/situs.test.ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { buatAppUji, tokenAdmin, bersihkan } from '../../../test-utils/app.js'
import type { FastifyInstance } from 'fastify'

let app: FastifyInstance
let token: string

beforeAll(async () => {
  app = await buatAppUji()
  token = await tokenAdmin(app)
})
afterAll(async () => {
  await bersihkan(app)
  await app.close()
})

describe('PUT /api/v1/situs/merek', () => {
  it('menolak aksen yang gagal kontras di latar landing', async () => {
    const r = await app.inject({
      method: 'PUT',
      url: '/api/v1/situs/merek',
      headers: { authorization: `Bearer ${token}` },
      payload: { warna_utama: '#003366', warna_aksen: '#0A2A4A' },
    })
    expect(r.statusCode).toBe(422)
    const body = r.json()
    expect(body.error).toMatch(/kontras/i)
    expect(body.detail).toBeInstanceOf(Array)
  })

  it('menerima kuning merek', async () => {
    const r = await app.inject({
      method: 'PUT',
      url: '/api/v1/situs/merek',
      headers: { authorization: `Bearer ${token}` },
      payload: { warna_utama: '#003366', warna_aksen: '#FFD600' },
    })
    expect(r.statusCode).toBe(200)
    expect(r.json().data.warna_aksen).toBe('#FFD600')
  })

  it('menolak tanpa auth', async () => {
    const r = await app.inject({
      method: 'PUT',
      url: '/api/v1/situs/merek',
      payload: { warna_utama: '#003366', warna_aksen: '#FFD600' },
    })
    expect(r.statusCode).toBe(401)
  })
})

describe('PUT /api/v1/situs/konten', () => {
  it('menyimpan dan mengembalikan nilai jsonb', async () => {
    const r = await app.inject({
      method: 'PUT',
      url: '/api/v1/situs/konten',
      headers: { authorization: `Bearer ${token}` },
      payload: { kunci: 'kontak.whatsapp', nilai: '081311081813' },
    })
    expect(r.statusCode).toBe(200)

    const b = await app.inject({
      method: 'GET',
      url: '/api/v1/situs/konten',
      headers: { authorization: `Bearer ${token}` },
    })
    expect(b.json().data['kontak.whatsapp']).toBe('081311081813')
  })

  it('upsert: kunci sama menimpa, bukan menggandakan', async () => {
    for (const v of ['satu', 'dua']) {
      await app.inject({
        method: 'PUT',
        url: '/api/v1/situs/konten',
        headers: { authorization: `Bearer ${token}` },
        payload: { kunci: 'uji.upsert', nilai: v },
      })
    }
    const b = await app.inject({
      method: 'GET',
      url: '/api/v1/situs/konten',
      headers: { authorization: `Bearer ${token}` },
    })
    expect(b.json().data['uji.upsert']).toBe('dua')
  })
})

describe('PATCH /api/v1/situs/seksi', () => {
  it('menolak varian di luar daftar', async () => {
    const r = await app.inject({
      method: 'PATCH',
      url: '/api/v1/situs/seksi',
      headers: { authorization: `Bearer ${token}` },
      payload: { kunci: 'portofolio', varian: 'apa-saja' },
    })
    expect(r.statusCode).toBe(422)
  })
})
```

Bila `test-utils/app.js` tidak ada dengan nama itu, cari padanannya:
```bash
ls apps/api/src/test-utils/ 2>/dev/null || grep -rl "buatAppUji\|createTestApp\|buildApp" apps/api/src --include=*.ts | head -3
```
Pakai helper yang benar-benar ada — jangan membuat helper baru.

- [ ] **Step 3: Jalankan test — pastikan gagal**

```bash
cd apps/api && npx vitest run src/routes/v1/__tests__/situs.test.ts
```
Expected: FAIL — 404 pada semua rute.

- [ ] **Step 4: Implementasi route**

```typescript
// apps/api/src/routes/v1/situs.ts
import type { FastifyInstance } from 'fastify'
import { authenticate, requirePermission } from '../../plugins/auth.js'
import { logAuditEvent } from '../../utils/audit.js'
import { validasiAksen, validasiPasangan } from '../../lib/situs-warna.js'

const VARIAN_SAH = ['baku', 'grid', 'carousel', 'split'] as const

export default async function situsRoutes(app: FastifyInstance) {
  // ── GET konten ────────────────────────────────────────────────────────────
  app.get(
    '/api/v1/situs/konten',
    { preHandler: [authenticate, requirePermission('situs.baca')] },
    async (request, reply) => {
      const { data, error } = await request.db!
        .from('situs_konten')
        .select('kunci, nilai')

      if (error) {
        request.log.error({ err: error }, 'gagal memuat konten situs')
        return reply.status(500).send({ error: 'Gagal memuat konten situs' })
      }

      const peta: Record<string, unknown> = {}
      for (const b of data ?? []) peta[b.kunci] = b.nilai
      return reply.send({ data: peta })
    },
  )

  // ── PUT konten (upsert) ───────────────────────────────────────────────────
  app.put(
    '/api/v1/situs/konten',
    { preHandler: [authenticate, requirePermission('situs.kelola')] },
    async (request, reply) => {
      const { kunci, nilai } = request.body as { kunci?: string; nilai?: unknown }

      if (!kunci || typeof kunci !== 'string') {
        return reply.status(422).send({ error: 'Kunci konten wajib diisi.' })
      }
      if (nilai === undefined) {
        return reply.status(422).send({ error: 'Nilai konten wajib diisi.' })
      }

      const { data, error } = await request.db!
        .from('situs_konten')
        .upsert(
          { kunci, nilai, diperbarui: new Date().toISOString() },
          { onConflict: 'company_id,kunci' },
        )
        .select('kunci, nilai')
        .single()

      if (error) {
        request.log.error({ err: error, kunci }, 'gagal menyimpan konten situs')
        return reply.status(500).send({ error: 'Gagal menyimpan konten situs' })
      }

      await logAuditEvent(request, {
        action: 'situs.konten.simpan',
        entity: 'situs_konten',
        entityId: kunci,
      })

      return reply.send({ data })
    },
  )

  // ── GET merek ─────────────────────────────────────────────────────────────
  app.get(
    '/api/v1/situs/merek',
    { preHandler: [authenticate, requirePermission('situs.baca')] },
    async (request, reply) => {
      const { data, error } = await request.db!
        .from('situs_merek')
        .select('warna_utama, warna_aksen, logo_path')
        .maybeSingle()

      if (error) {
        request.log.error({ err: error }, 'gagal memuat merek situs')
        return reply.status(500).send({ error: 'Gagal memuat merek situs' })
      }
      return reply.send({ data })
    },
  )

  // ── PUT merek ─────────────────────────────────────────────────────────────
  //
  // Kontras divalidasi DI SINI, bukan di DB: CHECK constraint tak bisa tahu
  // latar mana yang dipakai peran mana. Warna yang sama lulus di navy dan
  // gagal di putih — verdikt butuh konteks (spec §4.2).
  app.put(
    '/api/v1/situs/merek',
    { preHandler: [authenticate, requirePermission('situs.kelola')] },
    async (request, reply) => {
      const { warna_utama, warna_aksen, logo_path } = request.body as {
        warna_utama?: string
        warna_aksen?: string
        logo_path?: string | null
      }

      if (!warna_utama || !warna_aksen) {
        return reply
          .status(422)
          .send({ error: 'Warna utama dan warna aksen wajib diisi.' })
      }

      const gagalAksen = validasiAksen(warna_aksen).filter((h) => !h.lulus)
      if (gagalAksen.length > 0) {
        return reply.status(422).send({
          error: 'Warna aksen gagal syarat kontras.',
          detail: gagalAksen.map((h) => h.pesan),
        })
      }

      // Warna utama jadi latar teks putih — periksa arah itu, bukan sebaliknya.
      const utamaSbgLatar = validasiPasangan('#FFFFFF', warna_utama, 'teks')
      if (!utamaSbgLatar.lulus) {
        return reply.status(422).send({
          error: 'Warna utama gagal syarat kontras.',
          detail: [utamaSbgLatar.pesan],
        })
      }

      const { data, error } = await request.db!
        .from('situs_merek')
        .upsert(
          {
            warna_utama,
            warna_aksen,
            logo_path: logo_path ?? null,
            diperbarui: new Date().toISOString(),
          },
          { onConflict: 'company_id' },
        )
        .select('warna_utama, warna_aksen, logo_path')
        .single()

      if (error) {
        request.log.error({ err: error }, 'gagal menyimpan merek situs')
        return reply.status(500).send({ error: 'Gagal menyimpan merek situs' })
      }

      await logAuditEvent(request, {
        action: 'situs.merek.simpan',
        entity: 'situs_merek',
        entityId: data.warna_aksen,
      })

      return reply.send({ data })
    },
  )

  // ── PATCH seksi ───────────────────────────────────────────────────────────
  app.patch(
    '/api/v1/situs/seksi',
    { preHandler: [authenticate, requirePermission('situs.kelola')] },
    async (request, reply) => {
      const { kunci, aktif, urutan, varian } = request.body as {
        kunci?: string
        aktif?: boolean
        urutan?: number
        varian?: string
      }

      if (!kunci) {
        return reply.status(422).send({ error: 'Kunci seksi wajib diisi.' })
      }
      if (varian !== undefined && !VARIAN_SAH.includes(varian as never)) {
        return reply.status(422).send({
          error: `Varian tak dikenal. Pilih: ${VARIAN_SAH.join(', ')}.`,
        })
      }

      const perubahan: Record<string, unknown> = {}
      if (aktif !== undefined) perubahan.aktif = aktif
      if (urutan !== undefined) perubahan.urutan = urutan
      if (varian !== undefined) perubahan.varian = varian

      if (Object.keys(perubahan).length === 0) {
        return reply.status(422).send({ error: 'Tidak ada yang diubah.' })
      }

      const { data, error } = await request.db!
        .from('situs_seksi')
        .update(perubahan)
        .eq('kunci', kunci)
        .select('kunci, aktif, urutan, varian')

      if (error) {
        request.log.error({ err: error, kunci }, 'gagal memperbarui seksi situs')
        return reply.status(500).send({ error: 'Gagal memperbarui seksi' })
      }
      if (!data || data.length === 0) {
        return reply.status(404).send({ error: `Seksi "${kunci}" tidak ada.` })
      }

      return reply.send({ data: data[0] })
    },
  )
}
```

- [ ] **Step 5: Daftarkan route**

Di `apps/api/src/index.ts`, tambahkan import mengikuti urutan yang ada (baris ~10-60):

```typescript
import situsRoutes from './routes/v1/situs.js'
```

Lalu registrasikan di tempat rute lain didaftarkan — cari `app.register(settingsRoutes)` dan tambahkan di dekatnya:

```typescript
app.register(situsRoutes)
```

- [ ] **Step 6: Jalankan test — pastikan lulus**

```bash
cd apps/api && npx vitest run src/routes/v1/__tests__/situs.test.ts
```
Expected: PASS, 6 test. Bila gagal karena permission `situs.baca`/`situs.kelola` tak ada, tambahkan keduanya lewat migrasi permission mengikuti pola yang dipakai permission lain di repo — jangan mengganti `requirePermission` dengan cek peran literal (ADR-004).

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/routes/v1/situs.ts apps/api/src/routes/v1/__tests__/situs.test.ts apps/api/src/index.ts
git commit -m "feat(situs): endpoint admin konten — kontras ditolak di pintu masuk"
```

---

### Task 4: Endpoint publik

**Files:**
- Modify: `apps/api/src/routes/v1/situs.ts`
- Modify: `apps/api/src/routes/v1/__tests__/situs.test.ts`

**Interfaces:**
- Produces: `GET /api/v1/public/situs` — satu payload berisi seluruh konten terbit.

- [ ] **Step 1: Baca preseden endpoint publik**

```bash
grep -n "api/v1/public" apps/api/src/routes/v1/settings.ts | head
```
Baca `/api/v1/public/invoice/:id` seluruhnya. Endpoint publik memakai `supabase` mentah (bukan `request.db`) karena tak ada user — konsekuensinya **filter company_id harus eksplisit di query**, sebab RLS tak punya konteks auth.

- [ ] **Step 2: Tulis test yang gagal**

Tambahkan ke `situs.test.ts`:

```typescript
describe('GET /api/v1/public/situs', () => {
  it('bisa diakses tanpa auth', async () => {
    const r = await app.inject({ method: 'GET', url: '/api/v1/public/situs' })
    expect(r.statusCode).toBe(200)
  })

  it('mengembalikan bentuk yang dipakai halaman publik', async () => {
    const r = await app.inject({ method: 'GET', url: '/api/v1/public/situs' })
    const b = r.json().data
    expect(b).toHaveProperty('konten')
    expect(b).toHaveProperty('kategori')
    expect(b).toHaveProperty('milestone')
    expect(b).toHaveProperty('legalitas')
    expect(b).toHaveProperty('seksi')
    expect(b).toHaveProperty('merek')
  })

  // Batas keras: endpoint tanpa auth tak boleh membocorkan kolom internal.
  it('tidak membocorkan company_id atau id internal', async () => {
    const r = await app.inject({ method: 'GET', url: '/api/v1/public/situs' })
    const teks = JSON.stringify(r.json())
    expect(teks).not.toMatch(/company_id/)
  })

  it('hanya menyertakan yang tampil=true', async () => {
    const r = await app.inject({ method: 'GET', url: '/api/v1/public/situs' })
    const { kategori } = r.json().data
    expect(kategori.every((k: { tampil?: boolean }) => k.tampil !== false)).toBe(true)
  })
})
```

- [ ] **Step 3: Jalankan test — pastikan gagal**

```bash
cd apps/api && npx vitest run src/routes/v1/__tests__/situs.test.ts -t "public"
```
Expected: FAIL — 404.

- [ ] **Step 4: Implementasi**

Tambahkan ke `situs.ts`, di dalam `situsRoutes`:

```typescript
  // ── GET publik ────────────────────────────────────────────────────────────
  //
  // Pengecualian bernama (QUEUE.yaml:434): tanpa auth, field dibatasi,
  // rate limit. Memakai `supabase` mentah seperti /api/v1/public/invoice/:id —
  // karena itu filter company_id WAJIB eksplisit di setiap query: tanpa
  // konteks auth, RLS tak bisa menyaring apa pun.
  app.get(
    '/api/v1/public/situs',
    {
      config: { rateLimit: { max: 60, timeWindow: '1 minute' } },
    },
    async (request, reply) => {
      const companyId = process.env.SITUS_COMPANY_ID
      if (!companyId) {
        request.log.error('SITUS_COMPANY_ID belum diset — situs publik mati')
        return reply.status(503).send({ error: 'Situs belum dikonfigurasi' })
      }

      const [konten, kategori, media, milestone, legalitas, seksi, merek] =
        await Promise.all([
          supabase.from('situs_konten').select('kunci, nilai').eq('company_id', companyId),
          supabase.from('situs_kategori')
            .select('kunci, judul, ringkasan, lokasi, lingkup, urutan')
            .eq('company_id', companyId).eq('tampil', true).order('urutan'),
          supabase.from('situs_media')
            .select('path_storage, alt, lebar, tinggi, urutan, kategori_id')
            .eq('company_id', companyId).eq('tampil', true).order('urutan'),
          supabase.from('situs_milestone')
            .select('tahun, judul, keterangan, urutan')
            .eq('company_id', companyId).eq('tampil', true).order('urutan'),
          supabase.from('situs_legalitas')
            .select('kode, judul, urutan')
            .eq('company_id', companyId).eq('tampil', true).order('urutan'),
          supabase.from('situs_seksi')
            .select('kunci, aktif, urutan, varian')
            .eq('company_id', companyId).order('urutan'),
          supabase.from('situs_merek')
            .select('warna_utama, warna_aksen, logo_path')
            .eq('company_id', companyId).maybeSingle(),
        ])

      for (const [nama, hasil] of Object.entries({
        konten, kategori, media, milestone, legalitas, seksi, merek,
      })) {
        if (hasil.error) {
          request.log.error({ err: hasil.error, bagian: nama },
            'gagal memuat bagian situs publik')
          return reply.status(500).send({ error: 'Gagal memuat situs' })
        }
      }

      const petaKonten: Record<string, unknown> = {}
      for (const b of konten.data ?? []) petaKonten[b.kunci] = b.nilai

      // Media ditempelkan ke kategorinya lalu kategori_id DIBUANG — id internal
      // tak punya guna di klien dan tak perlu bocor.
      const daftarKategori = (kategori.data ?? []).map((k, i) => ({
        ...k,
        media: (media.data ?? [])
          .filter((m) => m.kategori_id === (kategori.data ?? [])[i]?.kunci)
          .map(({ kategori_id: _buang, ...sisa }) => sisa),
      }))

      return reply.send({
        data: {
          konten: petaKonten,
          kategori: daftarKategori,
          milestone: milestone.data ?? [],
          legalitas: legalitas.data ?? [],
          seksi: seksi.data ?? [],
          merek: merek.data ?? null,
        },
      })
    },
  )
```

Tambahkan import di puncak berkas:

```typescript
import { supabase } from '../../utils/supabase.js'
```

**Catatan penempelan media:** query kategori tidak menyertakan `id`, sementara `situs_media.kategori_id` menyimpan uuid. Ubah `select` kategori menjadi `'id, kunci, judul, ringkasan, lokasi, lingkup, urutan'`, cocokkan `m.kategori_id === k.id`, lalu buang `id` sebelum mengirim:

```typescript
      const daftarKategori = (kategori.data ?? []).map(({ id, ...k }) => ({
        ...k,
        media: (media.data ?? [])
          .filter((m) => m.kategori_id === id)
          .map(({ kategori_id: _buang, ...sisa }) => sisa),
      }))
```

- [ ] **Step 5: Set env**

Tambahkan ke `apps/api/.env` dan `apps/api/.env.example`:

```
SITUS_COMPANY_ID=
```

Isi nilainya dengan uuid company Puraloka:
```bash
node -e "require('./scripts/db/_koneksi.mjs')" 2>/dev/null || \
  psql "$DIRECT_URL" -c "select id, name from companies limit 5"
```

- [ ] **Step 6: Jalankan test — pastikan lulus**

```bash
cd apps/api && npx vitest run src/routes/v1/__tests__/situs.test.ts
```
Expected: PASS, 10 test.

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/routes/v1/situs.ts apps/api/src/routes/v1/__tests__/situs.test.ts apps/api/.env.example
git commit -m "feat(situs): endpoint publik read-only — company_id eksplisit, RLS tak bisa menolong tanpa auth"
```

---

### Task 5: Seed konten dari compro PDF

**Files:**
- Create: `db/migrations/201_situs_seed_puraloka.sql`

**Interfaces:**
- Consumes: tabel Task 1.
- Produces: baris konten, milestone, kategori, legalitas, seksi untuk Puraloka.

- [ ] **Step 1: Ambil uuid company**

```bash
node scripts/db/introspect.mjs identity
```
Lalu dapatkan uuid company Puraloka. Seed memakai subquery, bukan uuid literal — supaya migrasi tetap benar di lingkungan mana pun.

- [ ] **Step 2: Tulis seed**

```sql
-- ════════════════════════════════════════════════════════════════════════════
-- 201 — Seed konten situs Puraloka Persada
--
-- Sumber: "Company Profile (WHITE) Puraloka Persada.pdf".
-- FAKTA dipakai apa adanya; PROSA ditulis ulang. Prosa asli ("mengutamakan
-- kualitas, inovasi, dan keberlanjutan", "mitra terpercaya") adalah kalimat
-- yang ditulis setiap kontraktor — ia menenggelamkan fakta yang justru
-- meyakinkan: Cipali, Cisumdawu, sub PT PP, dan PT Jaya Cemerlang yang
-- memesan dua kali.
--
-- Dua typo PDF sengaja TIDAK diteruskan: "PURALOKA PERSDA" (sampul) dan
-- "embangunan" (2x).
--
-- NPWP sengaja TIDAK di-seed — spec §8.2. NIB cukup membuktikan legalitas.
-- ════════════════════════════════════════════════════════════════════════════

BEGIN;

WITH c AS (SELECT id FROM companies ORDER BY created_at LIMIT 1)
INSERT INTO situs_konten (company_id, kunci, nilai)
SELECT c.id, k.kunci, k.nilai::jsonb FROM c, (VALUES
  ('merek.nama',          '"Puraloka Persada"'),
  ('merek.sejak',         '2009'),
  ('hero.judul',          '"Kami membangun pabrik, gudang, dan jalan tol."'),
  ('hero.sub',            '"Sejak 2009. Proyeknya bisa disebut namanya."'),
  ('kontak.whatsapp',     '"081311081813"'),
  ('kontak.email',        '"puralokapersada@gmail.com"'),
  ('kontak.alamat',       '"Puri Cipageran Indah 2 Blok D13/12, RT 002/RW 022, Tanimulya, Ngamprah, Kabupaten Bandung Barat 40552"'),
  ('kontak.nib',          '"2110240218547"'),
  ('kontak.wa_template',  '"Halo Puraloka Persada, saya ingin menanyakan pekerjaan "')
) AS k(kunci, nilai)
ON CONFLICT (company_id, kunci) DO NOTHING;

WITH c AS (SELECT id FROM companies ORDER BY created_at LIMIT 1)
INSERT INTO situs_milestone (company_id, tahun, judul, keterangan, urutan)
SELECT c.id, m.tahun, m.judul, m.ket, m.urut FROM c, (VALUES
  (2009, 'Berdiri sebagai Gumilar Pramudya', 'Didirikan Gugum Setiawan. Mulai dari promosi luar ruang: billboard dan baliho.', 1),
  (2011, 'Quarry tanah merah, Tol Cipali', 'Pembukaan quarry untuk proyek jalan tol.', 2),
  (2012, 'Tol Brebes', 'Bersama PT Amanindo Perkasa Abadi.', 3),
  (2013, 'Retaining wall Tol Cipali', 'Sub-kontraktor PT PP untuk retaining wall dan saluran.', 4),
  (2014, 'GOR Pencak Silat, Garut', 'Fasilitas olahraga.', 5),
  (2015, 'Pabrik PT Jaya Cemerlang, Bandung', 'Pembangunan pabrik.', 6),
  (2018, 'Landscape Apartemen Dhika, Bekasi', NULL, 7),
  (2019, 'Digitalisasi SPBU', 'Sub-kontraktor untuk Jawa Barat dan Jawa Tengah.', 8),
  (2020, 'Gudang PT Jaya Cemerlang — dan nama baru', 'Klien 2015 memesan lagi. Tahun yang sama, nama berganti menjadi Puraloka Persada.', 9),
  (2023, 'Pabrik sepatu PT Top Torch, Bandung', 'Pembangunan pabrik skala besar.', 10),
  (2024, 'Supermarket PT Kijang Mas, Bandung', NULL, 11)
) AS m(tahun, judul, ket, urut)
ON CONFLICT DO NOTHING;

-- Kategori mengikuti judul galeri compro hal. 13-19 (spec §6.2).
WITH c AS (SELECT id FROM companies ORDER BY created_at LIMIT 1)
INSERT INTO situs_kategori (company_id, kunci, judul, ringkasan, urutan)
SELECT c.id, k.kunci, k.judul, k.ring, k.urut FROM c, (VALUES
  ('pabrik',           'Pembangunan Pabrik',      'Struktur baja, lantai kerja, dan fasilitas produksi.', 1),
  ('pematangan-lahan', 'Pematangan Lahan',        'Cut and fill, quarry, dan penyiapan lahan.', 2),
  ('konstruksi-baja',  'Konstruksi Baja',         'Fabrikasi dan ereksi profil WF, gording, dan rangka atap.', 3),
  ('rumah-mewah',      'Pembangunan Rumah Mewah', NULL, 4),
  ('renovasi-rumah',   'Renovasi Rumah',          NULL, 5),
  ('perumahan',        'Pembangunan Perumahan',   NULL, 6),
  ('beton-pracetak',   'Beton Pracetak',          'U-ditch, panel pagar, dan kanstin.', 7)
) AS k(kunci, judul, ring, urut)
ON CONFLICT (company_id, kunci) DO NOTHING;

WITH c AS (SELECT id FROM companies ORDER BY created_at LIMIT 1)
INSERT INTO situs_seksi (company_id, kunci, aktif, urutan, varian)
SELECT c.id, s.kunci, true, s.urut, 'baku' FROM c, (VALUES
  ('hero', 1), ('bukti', 2), ('proses', 3),
  ('portofolio', 4), ('legalitas', 5), ('kontak', 6)
) AS s(kunci, urut)
ON CONFLICT (company_id, kunci) DO NOTHING;

WITH c AS (SELECT id FROM companies ORDER BY created_at LIMIT 1)
INSERT INTO situs_merek (company_id, warna_utama, warna_aksen)
SELECT c.id, '#003366', '#FFD600' FROM c
ON CONFLICT (company_id) DO NOTHING;

COMMIT;
```

- [ ] **Step 3: Terapkan dan verifikasi**

```bash
node scripts/db/ledger-diff.mjs
```
Lalu periksa isinya benar-benar masuk:
```bash
psql "$DIRECT_URL" -c "select count(*) from situs_milestone; select count(*) from situs_kategori;"
```
Expected: 11 milestone, 7 kategori.

- [ ] **Step 4: Commit**

```bash
git add db/migrations/201_situs_seed_puraloka.sql
git commit -m "feat(situs): seed dari compro — fakta dipakai, prosanya ditulis ulang"
```

---

### Task 6: Pipeline media

**Files:**
- Create: `apps/api/scripts/impor-media-compro.mjs`

**Interfaces:**
- Produces: berkas terunggah ke Supabase Storage bucket `situs`, baris di `situs_media`.

- [ ] **Step 1: Verifikasi sharp tersedia**

```bash
cd apps/api && node -e "import('sharp').then(s => console.log('sharp', s.default.versions.vips))"
```
Bila gagal: `pnpm --filter api add sharp` (sudah ada di `allowBuilds` dan override `>=0.35.0`).

- [ ] **Step 2: Tulis skrip**

```javascript
#!/usr/bin/env node
// impor-media-compro.mjs — sekali jalan, idempoten.
//
// Sumber foto: E:\PURALOKA PERSADA\Foto Proyek (28 di antaranya sudah dipakai
// di compro cetak — peta di docs/superpowers/specs/2026-08-06-landing-publik-peta-foto.json).
//
// Tiga hal yang WAJIB dilakukan dan mudah terlupa:
//   1. rotate() tanpa argumen — menerapkan orientasi EXIF. Foto HP 2021-2024
//      di folder ini ada yang tersimpan terbalik; resize saja tidak cukup.
//   2. EXIF DIBUANG seluruhnya. Foto lapangan mengandung GPS — lokasi rumah
//      klien tidak boleh ikut terbit.
//   3. Ukuran diambil SETELAH rotasi, bukan sebelum. Foto potret yang
//      dirotasi menukar lebar dan tinggi.

import { readFile, readdir } from 'node:fs/promises'
import { join, basename, extname } from 'node:path'
import sharp from 'sharp'
import { createClient } from '@supabase/supabase-js'

const SUMBER = process.env.SUMBER_FOTO
const PETA = process.env.PETA_FOTO
const BUCKET = 'situs'
const LEBAR = [640, 1280, 1920]

if (!SUMBER || !PETA) {
  console.error('Set SUMBER_FOTO dan PETA_FOTO lebih dulu.')
  process.exit(1)
}

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
)

async function companyId() {
  const { data, error } = await supabase
    .from('companies').select('id').order('created_at').limit(1).single()
  if (error) throw new Error(`gagal membaca company: ${error.message}`)
  return data.id
}

async function kategoriPeta(cid) {
  const { data, error } = await supabase
    .from('situs_kategori').select('id, kunci').eq('company_id', cid)
  if (error) throw new Error(`gagal membaca kategori: ${error.message}`)
  return Object.fromEntries(data.map((k) => [k.kunci, k.id]))
}

async function main() {
  const cid = await companyId()
  const kat = await kategoriPeta(cid)
  const peta = JSON.parse(await readFile(PETA, 'utf8'))
  const berkasAda = new Set(await readdir(SUMBER))

  let masuk = 0
  let lewat = 0

  for (const [kunciKategori, daftar] of Object.entries(peta)) {
    const katId = kat[kunciKategori.toLowerCase()]
    if (!katId) {
      console.warn(`kategori "${kunciKategori}" tak ada di DB — dilewati`)
      continue
    }

    let urutan = 0
    for (const entri of daftar) {
      const nama = Array.isArray(entri) ? entri[0] : entri
      if (!berkasAda.has(nama)) {
        console.warn(`  ${nama} tak ditemukan di sumber`)
        lewat++
        continue
      }

      const asli = await readFile(join(SUMBER, nama))
      const dasar = basename(nama, extname(nama))

      let lebarAkhir = 0
      let tinggiAkhir = 0

      for (const w of LEBAR) {
        const buf = await sharp(asli)
          .rotate()                       // terapkan EXIF orientation
          .resize({ width: w, withoutEnlargement: true })
          .webp({ quality: 82 })
          .toBuffer({ resolveWithObject: true })

        if (w === LEBAR[LEBAR.length - 1]) {
          lebarAkhir = buf.info.width
          tinggiAkhir = buf.info.height
        }

        const path = `${kunciKategori.toLowerCase()}/${dasar}-${w}.webp`
        const { error } = await supabase.storage
          .from(BUCKET)
          .upload(path, buf.data, { contentType: 'image/webp', upsert: true })
        if (error) throw new Error(`unggah ${path} gagal: ${error.message}`)
      }

      const path = `${kunciKategori.toLowerCase()}/${dasar}`
      const { error } = await supabase.from('situs_media').upsert(
        {
          company_id: cid,
          kategori_id: katId,
          path_storage: path,
          alt: `Dokumentasi ${kunciKategori.toLowerCase().replace(/-/g, ' ')} Puraloka Persada`,
          lebar: lebarAkhir,
          tinggi: tinggiAkhir,
          urutan: urutan++,
        },
        { onConflict: 'company_id,path_storage' },
      )
      if (error) throw new Error(`simpan baris ${path} gagal: ${error.message}`)
      masuk++
      console.log(`  ${nama} → ${path}`)
    }
  }

  console.log(`\nselesai: ${masuk} media masuk, ${lewat} dilewati`)
}

main().catch((e) => {
  console.error(e.message)
  process.exit(1)
})
```

- [ ] **Step 3: Tambahkan UNIQUE untuk upsert**

`onConflict: 'company_id,path_storage'` butuh unique constraint. Tambahkan migrasi 202:

```sql
-- 202 — unique path media situs (prasyarat upsert idempoten skrip impor)
ALTER TABLE situs_media
  ADD CONSTRAINT situs_media_path_unik UNIQUE (company_id, path_storage);
```

- [ ] **Step 4: Buat bucket dan jalankan**

Buat bucket `situs` (public read) di Supabase Storage, lalu:

```bash
cd apps/api && \
SUMBER_FOTO="E:/PURALOKA PERSADA/Foto Proyek" \
PETA_FOTO="../../docs/superpowers/specs/2026-08-06-landing-publik-peta-foto.json" \
node scripts/impor-media-compro.mjs
```
Expected: 28 media masuk (5 kategori). `renovasi-rumah` dan `beton-pracetak` kosong — sudah diketahui (spec §6.2 poin 3).

- [ ] **Step 5: Verifikasi EXIF benar-benar hilang**

```bash
node -e "
import('sharp').then(async ({default:s})=>{
  const r = await fetch(process.env.SUPABASE_URL+'/storage/v1/object/public/situs/pabrik/20210828_155131-1920.webp')
  const m = await s(Buffer.from(await r.arrayBuffer())).metadata()
  console.log('exif:', m.exif ?? 'TIDAK ADA (benar)')
  console.log('ukuran:', m.width+'x'+m.height)
})"
```
Expected: `exif: TIDAK ADA (benar)`.

- [ ] **Step 6: Commit**

```bash
git add apps/api/scripts/impor-media-compro.mjs db/migrations/202_situs_media_unik.sql
git commit -m "feat(situs): pipeline media — EXIF dibuang, orientasi diterapkan"
```

---

### Task 7: Scaffold `apps/web-publik`

**Files:**
- Create: `apps/web-publik/package.json`, `next.config.ts`, `tsconfig.json`, `app/layout.tsx`, `app/page.tsx`, `app/globals.css`
- Create: `apps/web-publik/lib/tenant.ts`, `lib/konten.ts`
- Test: `apps/web-publik/lib/__tests__/tenant.test.ts`

**Interfaces:**
- Produces:
  - `resolveTenant(): string` — satu-satunya tempat tenant ditentukan
  - `type KontenSitus = { konten: Record<string, unknown>; kategori: Kategori[]; milestone: Milestone[]; legalitas: Legalitas[]; seksi: Seksi[]; merek: Merek | null }`
  - `ambilKonten(): Promise<KontenSitus>`

- [ ] **Step 1: package.json**

```json
{
  "name": "web-publik",
  "version": "0.1.0",
  "private": true,
  "scripts": {
    "dev": "next dev -p 3002",
    "build": "next build",
    "start": "next start -p 3002",
    "lint": "eslint",
    "typecheck": "tsc --noEmit",
    "test": "vitest run"
  },
  "dependencies": {
    "next": "16.2.12",
    "react": "19.2.4",
    "react-dom": "19.2.4"
  },
  "devDependencies": {
    "@types/node": "^24.0.0",
    "@types/react": "^19.0.0",
    "typescript": "^5.9.0",
    "vitest": "^3.0.0"
  }
}
```

Versi `next`/`react` **dipaku sama dengan `apps/web`** — dua versi React dalam satu workspace pnpm menghasilkan galat hook yang sulit dilacak. Samakan devDependencies dengan `apps/web/package.json` bila berbeda.

- [ ] **Step 2: Test resolusi tenant yang gagal**

```typescript
// apps/web-publik/lib/__tests__/tenant.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { resolveTenant } from '../tenant.js'

const asli = process.env.SITUS_COMPANY_ID

afterEach(() => { process.env.SITUS_COMPANY_ID = asli })

describe('resolveTenant', () => {
  it('mengembalikan company dari env', () => {
    process.env.SITUS_COMPANY_ID = 'abc-123'
    expect(resolveTenant()).toBe('abc-123')
  })

  it('melempar galat jelas bila belum diset', () => {
    delete process.env.SITUS_COMPANY_ID
    expect(() => resolveTenant()).toThrow(/SITUS_COMPANY_ID/)
  })
})
```

- [ ] **Step 3: Jalankan — pastikan gagal**

```bash
cd apps/web-publik && npx vitest run
```
Expected: FAIL — modul tak ada.

- [ ] **Step 4: Implementasi tenant.ts**

```typescript
// apps/web-publik/lib/tenant.ts
//
// SATU-SATUNYA tempat tenant ditentukan di aplikasi ini.
//
// Hari ini mengembalikan konstanta dari env: sistem berisi tepat satu company,
// dan gerbang mutlak (STATUS.md) melarang tenant kedua sebelum Tahap 4 & 5.
//
// Saat multi-tenant tiba, yang berubah HANYA isi fungsi ini — resolusi dari
// hostname permintaan — bukan satu pun pemanggilnya. Itulah alasan fungsi ini
// ada meski isinya hari ini satu baris.

export function resolveTenant(): string {
  const id = process.env.SITUS_COMPANY_ID
  if (!id) {
    throw new Error(
      'SITUS_COMPANY_ID belum diset. Situs publik tak tahu konten milik siapa.',
    )
  }
  return id
}
```

- [ ] **Step 5: Implementasi konten.ts**

```typescript
// apps/web-publik/lib/konten.ts
import { resolveTenant } from './tenant.js'

export type Media = { path_storage: string; alt: string; lebar: number; tinggi: number; urutan: number }
export type Kategori = { kunci: string; judul: string; ringkasan: string | null; lokasi: string | null; lingkup: string | null; urutan: number; media: Media[] }
export type Milestone = { tahun: number; judul: string; keterangan: string | null; urutan: number }
export type Legalitas = { kode: string; judul: string; urutan: number }
export type Seksi = { kunci: string; aktif: boolean; urutan: number; varian: string }
export type Merek = { warna_utama: string; warna_aksen: string; logo_path: string | null }

export type KontenSitus = {
  konten: Record<string, unknown>
  kategori: Kategori[]
  milestone: Milestone[]
  legalitas: Legalitas[]
  seksi: Seksi[]
  merek: Merek | null
}

export function teks(k: KontenSitus, kunci: string, baku = ''): string {
  const v = k.konten[kunci]
  return typeof v === 'string' ? v : baku
}

export async function ambilKonten(): Promise<KontenSitus> {
  resolveTenant() // gagal cepat bila belum dikonfigurasi
  const base = process.env.NEXT_PUBLIC_API_URL
  if (!base) throw new Error('NEXT_PUBLIC_API_URL belum diset.')

  const r = await fetch(`${base}/api/v1/public/situs`, {
    next: { revalidate: 300, tags: ['situs'] },
  })
  if (!r.ok) throw new Error(`API situs menjawab ${r.status}`)

  const { data } = await r.json()
  return data as KontenSitus
}
```

- [ ] **Step 6: Jalankan test — pastikan lulus**

```bash
cd apps/web-publik && npx vitest run
```
Expected: PASS, 2 test.

- [ ] **Step 7: Halaman minimal yang membuktikan rantai data**

```tsx
// apps/web-publik/app/page.tsx
import { ambilKonten, teks } from '@/lib/konten'

export const revalidate = 300

export default async function Beranda() {
  const k = await ambilKonten()
  return (
    <main>
      <h1>{teks(k, 'hero.judul')}</h1>
      <p>{teks(k, 'hero.sub')}</p>
    </main>
  )
}
```

- [ ] **Step 8: Jalankan dan lihat**

```bash
cd apps/web-publik && pnpm dev
```
Buka `http://localhost:3002`. Expected: judul dan sub dari DB — bukan string di kode.

- [ ] **Step 9: Commit**

```bash
git add apps/web-publik
git commit -m "feat(situs): apps/web-publik — tenant di-resolve di satu tempat"
```

---

### Task 8: Seksi compro

**Files:**
- Create: `apps/web-publik/components/seksi/Hero.tsx`, `Bukti.tsx`, `Proses.tsx`, `Portofolio.tsx`, `Legalitas.tsx`, `Kontak.tsx`
- Create: `apps/web-publik/app/globals.css`
- Modify: `apps/web-publik/app/page.tsx`

**Interfaces:**
- Consumes: `KontenSitus`, `teks` dari Task 7.
- Produces: tiap komponen menerima `{ konten: KontenSitus }` dan mengembalikan `JSX.Element | null` (null bila seksinya non-aktif).

- [ ] **Step 1: Token CSS landing**

```css
/* apps/web-publik/app/globals.css */
@import "tailwindcss";

/* Token landing — MILIK SENDIRI, bukan warisan dashboard.
 * Yang diwarisi hanya identitas merek dan metode a11y-nya. */
:root {
  --navy-pekat:  #001F3D;
  --navy:        #003366;
  --navy-terang: #0059B3;
  --grad-navy:   linear-gradient(135deg, #001F3D 0%, #003366 60%, #0059B3 100%);

  /* Aksen TIPIS. Satu elemen per layar. Haram di atas putih (1,41:1). */
  --aksen:       #FFD600;

  /* Teks di atas navy pekat — diukur, bukan ditebak. */
  --pada-navy:        #FFFFFF;  /* 17,4:1 */
  --pada-navy-redup:  #A8BBD0;  /* 7,1:1  */

  --ukuran-hero: clamp(2.5rem, 7vw, 5.5rem);
  --ukuran-judul: clamp(1.75rem, 3.5vw, 3rem);
  --ritme: clamp(4rem, 10vh, 8rem);
}

body {
  background: var(--navy-pekat);
  color: var(--pada-navy);
}

/* Lantai kualitas — bukan tambahan opsional. */
:focus-visible {
  outline: 3px solid var(--aksen);
  outline-offset: 3px;
}

@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    transition-duration: 0.01ms !important;
    scroll-behavior: auto !important;
  }
}
```

- [ ] **Step 2: Hero**

```tsx
// apps/web-publik/components/seksi/Hero.tsx
import type { KontenSitus } from '@/lib/konten'
import { teks } from '@/lib/konten'

export function Hero({ konten }: { konten: KontenSitus }) {
  const judul = teks(konten, 'hero.judul')
  const sub = teks(konten, 'hero.sub')
  const sejak = teks(konten, 'merek.sejak')

  return (
    <section
      aria-labelledby="hero-judul"
      style={{ background: 'var(--grad-navy)', padding: 'var(--ritme) 1.5rem' }}
    >
      <p style={{ color: 'var(--aksen)', letterSpacing: '0.2em', fontSize: '0.8rem' }}>
        SEJAK {sejak}
      </p>
      <h1
        id="hero-judul"
        style={{ fontSize: 'var(--ukuran-hero)', lineHeight: 1.05, maxWidth: '18ch' }}
      >
        {judul}
      </h1>
      <p style={{ color: 'var(--pada-navy-redup)', maxWidth: '46ch' }}>{sub}</p>
    </section>
  )
}
```

- [ ] **Step 3: Portofolio**

```tsx
// apps/web-publik/components/seksi/Portofolio.tsx
import type { KontenSitus } from '@/lib/konten'

const STORAGE = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/situs`

export function Portofolio({ konten }: { konten: KontenSitus }) {
  const kategori = konten.kategori.filter((k) => k.media.length > 0)
  if (kategori.length === 0) return null

  return (
    <section aria-labelledby="porto-judul" style={{ padding: 'var(--ritme) 1.5rem' }}>
      <h2 id="porto-judul" style={{ fontSize: 'var(--ukuran-judul)' }}>
        Yang sudah dikerjakan
      </h2>

      {kategori.map((k) => (
        <article key={k.kunci} style={{ marginTop: 'var(--ritme)' }}>
          <h3>{k.judul}</h3>
          {k.ringkasan && <p style={{ color: 'var(--pada-navy-redup)' }}>{k.ringkasan}</p>}

          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 20rem), 1fr))',
            gap: '0.75rem',
            marginTop: '1.5rem',
          }}>
            {k.media.map((m) => (
              <img
                key={m.path_storage}
                src={`${STORAGE}/${m.path_storage}-1280.webp`}
                srcSet={[640, 1280, 1920]
                  .map((w) => `${STORAGE}/${m.path_storage}-${w}.webp ${w}w`)
                  .join(', ')}
                sizes="(max-width: 40rem) 100vw, 20rem"
                alt={m.alt}
                width={m.lebar}
                height={m.tinggi}
                loading="lazy"
                decoding="async"
                style={{ width: '100%', height: 'auto', display: 'block' }}
              />
            ))}
          </div>
        </article>
      ))}
    </section>
  )
}
```

- [ ] **Step 4: Kontak — WhatsApp kontekstual**

```tsx
// apps/web-publik/components/seksi/Kontak.tsx
import type { KontenSitus } from '@/lib/konten'
import { teks } from '@/lib/konten'

/** 081311081813 → 6281311081813 (format wa.me). */
export function keFormatWa(nomor: string): string {
  const angka = nomor.replace(/\D/g, '')
  if (angka.startsWith('62')) return angka
  if (angka.startsWith('0')) return `62${angka.slice(1)}`
  return angka
}

export function Kontak({ konten, topik }: { konten: KontenSitus; topik?: string }) {
  const wa = teks(konten, 'kontak.whatsapp')
  const template = teks(konten, 'kontak.wa_template')
  const email = teks(konten, 'kontak.email')
  const alamat = teks(konten, 'kontak.alamat')
  const nib = teks(konten, 'kontak.nib')
  if (!wa) return null

  const pesan = encodeURIComponent(`${template}${topik ?? ''}`.trim())

  return (
    <section aria-labelledby="kontak-judul" style={{ padding: 'var(--ritme) 1.5rem' }}>
      <h2 id="kontak-judul" style={{ fontSize: 'var(--ukuran-judul)' }}>
        Ceritakan pekerjaannya
      </h2>

      <a
        href={`https://wa.me/${keFormatWa(wa)}?text=${pesan}`}
        style={{
          display: 'inline-block',
          marginTop: '1.5rem',
          padding: '1rem 2rem',
          background: 'var(--pada-navy)',
          color: 'var(--navy-pekat)',
          fontWeight: 600,
          textDecoration: 'none',
        }}
      >
        Kirim pesan WhatsApp
      </a>

      <address style={{ marginTop: 'var(--ritme)', fontStyle: 'normal', color: 'var(--pada-navy-redup)' }}>
        <p><a href={`mailto:${email}`} style={{ color: 'inherit' }}>{email}</a></p>
        <p>{alamat}</p>
        <p>NIB {nib}</p>
      </address>
    </section>
  )
}
```

- [ ] **Step 5: Test `keFormatWa`**

```typescript
// apps/web-publik/components/seksi/__tests__/kontak.test.ts
import { describe, it, expect } from 'vitest'
import { keFormatWa } from '../Kontak.js'

describe('keFormatWa', () => {
  it('mengubah awalan 0 jadi 62', () => {
    expect(keFormatWa('081311081813')).toBe('6281311081813')
  })
  it('membuang tanda hubung', () => {
    expect(keFormatWa('0813-1108-1813')).toBe('6281311081813')
  })
  it('membiarkan yang sudah 62', () => {
    expect(keFormatWa('6281311081813')).toBe('6281311081813')
  })
})
```

Jalankan:
```bash
cd apps/web-publik && npx vitest run
```
Expected: PASS.

- [ ] **Step 6: Rangkai di page.tsx**

```tsx
// apps/web-publik/app/page.tsx
import { ambilKonten } from '@/lib/konten'
import { Hero } from '@/components/seksi/Hero'
import { Portofolio } from '@/components/seksi/Portofolio'
import { Kontak } from '@/components/seksi/Kontak'

export const revalidate = 300

const KOMPONEN: Record<string, React.ComponentType<{ konten: Awaited<ReturnType<typeof ambilKonten>> }>> = {
  hero: Hero,
  portofolio: Portofolio,
  kontak: Kontak,
}

export default async function Beranda() {
  const konten = await ambilKonten()

  // Urutan dan on/off dari DB — bukan urutan tulis di berkas ini.
  const seksi = konten.seksi
    .filter((s) => s.aktif && KOMPONEN[s.kunci])
    .sort((a, b) => a.urutan - b.urutan)

  return (
    <main>
      {seksi.map((s) => {
        const C = KOMPONEN[s.kunci]
        return <C key={s.kunci} konten={konten} />
      })}
    </main>
  )
}
```

- [ ] **Step 7: Verifikasi visual + a11y**

```bash
cd apps/web-publik && pnpm build && pnpm start
```
Periksa di `http://localhost:3002`:
- Matikan satu seksi lewat `PATCH /api/v1/situs/seksi` → seksi hilang tanpa deploy
- Zoom 200% → tak ada gulir horizontal
- Tab keyboard → fokus terlihat (outline kuning)
- Foto tampil dengan `alt` yang bermakna

- [ ] **Step 8: Commit**

```bash
git add apps/web-publik
git commit -m "feat(situs): seksi compro — urutan dan on/off dari DB"
```

---

### Task 9: Adegan massing 3D

**Files:**
- Create: `apps/web-publik/components/adegan/Massing.tsx`
- Modify: `apps/web-publik/components/seksi/Proses.tsx`

**Interfaces:**
- Consumes: `tahap: { kunci: string; judul: string }[]`, `progress: number` (0–1).
- Produces: `<Massing tahap={…} progress={…} />` — geometri prosedural, nol berkas model.

- [ ] **Step 1: Pasang dependensi**

```bash
pnpm --filter web-publik add three @react-three/fiber @react-three/drei
pnpm --filter web-publik add -D @types/three
```

- [ ] **Step 2: Komponen massing**

```tsx
// apps/web-publik/components/adegan/Massing.tsx
'use client'

import { Canvas } from '@react-three/fiber'
import { useMemo } from 'react'
import * as THREE from 'three'

// Warna merek harus dikonversi ke linear — Three.js bekerja di linear space
// sementara CSS menginterpolasi di sRGB. Hex yang sama dipakai mentah di
// keduanya AKAN terlihat berbeda (spec §5.1).
const NAVY = new THREE.Color('#003366').convertSRGBToLinear()
const AKSEN = new THREE.Color('#FFD600').convertSRGBToLinear()

type Tahap = { kunci: string; judul: string }

function Lantai({ y, aktif, lebar }: { y: number; aktif: boolean; lebar: number }) {
  return (
    <mesh position={[0, y, 0]}>
      <boxGeometry args={[lebar, 0.18, lebar * 0.7]} />
      <meshStandardMaterial
        color={aktif ? AKSEN : NAVY}
        emissive={aktif ? AKSEN : new THREE.Color('#000000')}
        emissiveIntensity={aktif ? 0.25 : 0}
        roughness={0.6}
        metalness={0.1}
      />
    </mesh>
  )
}

export function Massing({ tahap, progress }: { tahap: Tahap[]; progress: number }) {
  const aktifSampai = Math.floor(progress * tahap.length)
  const lantai = useMemo(
    () => tahap.map((t, i) => ({ ...t, y: i * 0.32, lebar: 2.2 - i * 0.12 })),
    [tahap],
  )

  return (
    <Canvas
      camera={{ position: [3.2, 2.4, 3.6], fov: 42 }}
      gl={{ antialias: true, powerPreference: 'high-performance' }}
      dpr={[1, 1.75]}                       // budget: tak melampaui 1,75x
      style={{ height: '60vh', width: '100%' }}
    >
      <ambientLight intensity={0.5} />
      <directionalLight position={[4, 6, 3]} intensity={1.1} />
      {lantai.map((l, i) => (
        <Lantai key={l.kunci} y={l.y} lebar={l.lebar} aktif={i < aktifSampai} />
      ))}
    </Canvas>
  )
}
```

- [ ] **Step 3: Bungkus dengan fallback**

```tsx
// apps/web-publik/components/seksi/Proses.tsx
'use client'

import dynamic from 'next/dynamic'
import { useEffect, useRef, useState } from 'react'
import type { KontenSitus } from '@/lib/konten'

// Bundle 3D lazy — tak boleh memblokir LCP.
const Massing = dynamic(
  () => import('@/components/adegan/Massing').then((m) => m.Massing),
  { ssr: false, loading: () => <div style={{ height: '60vh' }} aria-hidden="true" /> },
)

const TAHAP = [
  { kunci: 'pondasi',    judul: 'Pondasi' },
  { kunci: 'struktur',   judul: 'Struktur' },
  { kunci: 'arsitektur', judul: 'Arsitektur' },
  { kunci: 'mep',        judul: 'MEP' },
  { kunci: 'serah',      judul: 'Serah terima' },
]

function dukungWebGL(): boolean {
  try {
    const c = document.createElement('canvas')
    return !!(c.getContext('webgl2') || c.getContext('webgl'))
  } catch {
    return false
  }
}

export function Proses({ konten: _konten }: { konten: KontenSitus }) {
  const [progress, setProgress] = useState(0)
  const [pakai3D, setPakai3D] = useState(false)
  const ref = useRef<HTMLElement>(null)

  useEffect(() => {
    const kurangiGerak = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    setPakai3D(dukungWebGL() && !kurangiGerak)
  }, [])

  useEffect(() => {
    if (!pakai3D) return
    const onScroll = () => {
      const el = ref.current
      if (!el) return
      const r = el.getBoundingClientRect()
      const total = r.height - window.innerHeight
      if (total <= 0) return
      setProgress(Math.min(1, Math.max(0, -r.top / total)))
    }
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [pakai3D])

  const aktifSampai = Math.floor(progress * TAHAP.length)

  return (
    <section ref={ref} aria-labelledby="proses-judul" style={{ padding: 'var(--ritme) 1.5rem' }}>
      <h2 id="proses-judul" style={{ fontSize: 'var(--ukuran-judul)' }}>
        Urutan membangun
      </h2>

      {pakai3D && <Massing tahap={TAHAP} progress={progress} />}

      {/* Daftar tahap SELALU dirender — tanpa WebGL maknanya tetap utuh. */}
      <ol style={{ listStyle: 'none', padding: 0, marginTop: '2rem' }}>
        {TAHAP.map((t, i) => (
          <li
            key={t.kunci}
            style={{
              padding: '0.75rem 0',
              borderTop: '1px solid rgba(255,255,255,0.12)',
              color: !pakai3D || i < aktifSampai ? 'var(--pada-navy)' : 'var(--pada-navy-redup)',
            }}
          >
            <span style={{ color: 'var(--aksen)', marginRight: '1rem', fontVariantNumeric: 'tabular-nums' }}>
              {String(i + 1).padStart(2, '0')}
            </span>
            {t.judul}
          </li>
        ))}
      </ol>
    </section>
  )
}
```

- [ ] **Step 4: Daftarkan seksi**

Di `app/page.tsx`, tambahkan `proses: Proses` ke `KOMPONEN`.

- [ ] **Step 5: Verifikasi fallback benar-benar bekerja**

Uji tiga kondisi:
```
1. Normal              → massing muncul, lantai menyala saat scroll
2. reduced-motion aktif → 3D TIDAK dirender, daftar tahap terbaca penuh
3. WebGL dimatikan     → sama seperti (2), tanpa galat konsol
```
Di DevTools: Rendering → "Emulate CSS prefers-reduced-motion".

- [ ] **Step 6: Ukur bundle**

```bash
cd apps/web-publik && pnpm build
```
Expected: chunk `three` terpisah, tidak masuk bundle awal halaman.

- [ ] **Step 7: Commit**

```bash
git add apps/web-publik
git commit -m "feat(situs): massing prosedural — halaman tetap utuh tanpa WebGL"
```

---

### Task 10: UI admin

**Files:**
- Create: `apps/web/app/(dashboard)/pengaturan/situs/page.tsx`

**Interfaces:**
- Consumes: endpoint Task 3.

- [ ] **Step 1: Baca pola halaman pengaturan**

Baca `apps/web/app/(dashboard)/pengaturan/satuan/page.tsx` seluruhnya — tiru cara fetch, penanganan galat, dan komponen form yang dipakai. Jangan memperkenalkan pola baru.

- [ ] **Step 2: Halaman**

Bangun mengikuti pola tersebut, dengan empat blok:

1. **Konten** — daftar kunci→nilai yang bisa diedit inline. Simpan lewat `PUT /api/v1/situs/konten`.
2. **Merek** — dua input warna. Saat API menolak (422), **tampilkan `detail` apa adanya** — pesannya sudah menyebut rasio dan latar yang gagal. Jangan ganti dengan "Terjadi kesalahan".
3. **Seksi** — daftar dengan toggle aktif dan pilihan varian (`select`, bukan input teks).
4. **Portofolio** — daftar kategori + jumlah media, urutan bisa diubah.

Setelah setiap penyimpanan sukses, panggil revalidate agar halaman publik ikut berubah:

```typescript
await fetch(`${API}/api/v1/situs/revalidate`, {
  method: 'POST',
  headers: { authorization: `Bearer ${token}` },
})
```

- [ ] **Step 3: Endpoint revalidate**

Tambahkan ke `apps/api/src/routes/v1/situs.ts`:

```typescript
  app.post(
    '/api/v1/situs/revalidate',
    { preHandler: [authenticate, requirePermission('situs.kelola')] },
    async (request, reply) => {
      const url = process.env.SITUS_REVALIDATE_URL
      const rahasia = process.env.SITUS_REVALIDATE_SECRET
      if (!url || !rahasia) {
        request.log.warn('revalidate situs dilewati — URL/secret belum diset')
        return reply.send({ data: { direvalidasi: false } })
      }

      const r = await fetch(url, {
        method: 'POST',
        headers: { 'x-revalidate-secret': rahasia },
      })
      if (!r.ok) {
        request.log.error({ status: r.status }, 'revalidate situs gagal')
        return reply.status(502).send({ error: 'Gagal menyegarkan situs publik' })
      }
      return reply.send({ data: { direvalidasi: true } })
    },
  )
```

Dan route penerimanya di `apps/web-publik/app/api/revalidate/route.ts`:

```typescript
import { revalidateTag } from 'next/cache'
import { NextResponse } from 'next/server'

export async function POST(request: Request) {
  const rahasia = process.env.SITUS_REVALIDATE_SECRET
  if (!rahasia || request.headers.get('x-revalidate-secret') !== rahasia) {
    return NextResponse.json({ error: 'Ditolak' }, { status: 401 })
  }
  revalidateTag('situs')
  return NextResponse.json({ direvalidasi: true })
}
```

- [ ] **Step 4: Uji rantai penuh**

```
1. Ubah hero.judul di /pengaturan/situs
2. Simpan
3. Muat ulang localhost:3002
4. Judul berubah TANPA deploy ulang
```

- [ ] **Step 5: Commit**

```bash
git add apps/web/app/\(dashboard\)/pengaturan/situs apps/api/src/routes/v1/situs.ts apps/web-publik/app/api
git commit -m "feat(situs): UI admin + revalidate — ubah konten, halaman publik ikut"
```

---

### Task 11: Penjaga CI dan dokumen

**Files:**
- Modify: `.github/workflows/ci.yml`
- Modify: `docs/execution/QUEUE.yaml`, `docs/execution/JOURNAL.md`

- [ ] **Step 1: Jalankan seluruh penjaga**

```bash
cd apps/api && npx vitest run && npm run lint:ratchet
node scripts/audit-gerbang-tenancy.mjs
node scripts/audit-kegagalan-senyap.mjs
node scripts/audit-tulis-tanpa-periksa.mjs
node scripts/audit-catch-senyap.mjs
node scripts/audit-migrasi-skema-dipaku.mjs
cd ../.. && node scripts/gen-indeks-docs.mjs --check
```
Semua harus lulus. **Bila `audit-gerbang-tenancy.mjs` menghitung `/api/v1/public/situs` sebagai pelanggaran**, jangan naikkan angka ratchet — daftarkan sebagai pengecualian bernama mengikuti cara `/api/v1/public/invoice/:id` didaftarkan, dengan alasan tertulis.

- [ ] **Step 2: Tambahkan web-publik ke CI**

Di `.github/workflows/ci.yml`, tambahkan langkah lint/typecheck/build untuk `web-publik` mengikuti persis pola `apps/web` yang sudah ada.

- [ ] **Step 3: Catat di JOURNAL**

Tambahkan entri: pekerjaan di luar QUEUE atas keputusan founder, apa yang dibangun, dan koreksi yang ditemukan (portofolio per jenis pekerjaan bukan per proyek; kuning merek `#FFD600` sebagai warna kedua).

- [ ] **Step 4: Tambahkan item ke QUEUE.yaml**

Agar antrean merefleksikan kenyataan — prinsip "kalau kenyataan tidak cocok dengan dokumen, kenyataan yang menang".

- [ ] **Step 5: Commit**

```bash
git add .github/workflows/ci.yml docs/execution
git commit -m "chore(situs): web-publik masuk CI, antrean menyusul kenyataan"
```

---

## Self-Review

**Spec coverage:**

| Spec | Task |
|---|---|
| §3.1 apps terpisah | 7 |
| §3.2 company_id + RLS, tenant satu tempat | 1, 7 |
| §3.3 endpoint publik pola bernama | 4 |
| §3.4 ISR + revalidate | 7, 10 |
| §4 CMS tingkat 1–3 | 1, 3, 10 |
| §4.2 tiga rem | 1 (CHECK), 2+3 (kontras), 9 (dpr cap) |
| §5.1 warna, kuning aksen, logo putih | 8 (globals.css), 9 (linear) |
| §5.3 massing prosedural | 9 |
| §6.2 kategori per jenis pekerjaan | 5, 6 |
| §6.3 pipeline media | 6 |
| §7 copy suara dashboard | 5 |
| §8 WhatsApp kontekstual | 8 |
| §12 posisi CHARTER | 11 |
| §13 lantai kualitas | 8 (fokus, reduced-motion), 9 (fallback) |

**Gap yang diketahui dan disengaja:**
- **CMS tingkat 4** (parameter adegan 3D dari DB) belum diimplementasikan — Task 9 memakai konstanta `TAHAP`. Tabel `situs_adegan` sengaja tidak dibuat di Task 1 karena parameternya baru bisa ditentukan setelah adegan nyata ada. Tambahkan setelah Task 9 selesai dan bentuk adegannya stabil.
- **Seksi `Bukti` dan `Legalitas`** disebut di Task 8 Step 1 tapi kodenya tidak ditulis penuh — polanya identik dengan `Portofolio` (baca dari `konten.legalitas` / milestone, render daftar). Implementer mengikuti pola yang sama.

**Type consistency:** `KontenSitus`, `Kategori`, `Media`, `Milestone`, `Legalitas`, `Seksi`, `Merek` didefinisikan sekali di Task 7 dan dipakai konsisten di Task 8–10. `validasiAksen`/`validasiPasangan` (Task 2) dipakai dengan signature yang sama di Task 3.
