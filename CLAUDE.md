# Puraloka Suite — Konteks untuk Claude Code

> **Dokumen ini sengaja TIDAK memuat angka.**
>
> Versi sebelumnya menyatakan "migration 001-058" dan "Database — 27+ Tabel",
> lalu ditambal catatan "sudah basi — migration nyata s.d. 116; dev 90 tabel" —
> dan **tambalan itu pun basi**. Angka di dokumen konteks membusuk, dan agent yang
> membacanya berhalusinasi dengan percaya diri. Audit 2026-08-02 mencatat ini
> sebagai racun konteks paling produktif di repo (temuan F-004).
>
> Aturan barunya: **kalau sebuah fakta bisa basi, jangan tulis faktanya — tulis
> cara mengukurnya.** Setiap angka di bawah punya perintahnya sendiri.
>
> Isi lama tersimpan di git history (`git show 6efa24c:CLAUDE.md`).

---

## 0. Urutan baca wajib di awal sesi

1. **`docs/execution/CHARTER.md`** — sumber kewenangan, urutan fase, Protokol
   Keputusan, Gerbang Keras. Ini yang menentukan boleh-tidaknya sebuah tindakan.
2. **`docs/execution/QUEUE.yaml`** — antrean kerja. Ambil item prioritas tertinggi
   yang tidak terblokir. Jangan melompati fase.
3. **`docs/execution/JOURNAL.md`** — 10 entri terakhir.
4. **`STATUS.md`** — fase aktif + keputusan terbuka.
5. **`docs/execution/RATIFIKASI.md`** — apa yang sedang menunggu founder.

Lalu jalankan ritual awal sesi (`CHARTER.md` §8). Aturan pokoknya:
**kalau kenyataan tidak cocok dengan dokumen, kenyataan yang menang** — perbaiki
dokumennya, catat di jurnal.

## 1. Cara mengukur (pengganti semua angka yang dulu ditulis di sini)

```bash
# Identitas koneksi + sidik jari schema — SELALU jalankan lebih dulu.
node scripts/db/introspect.mjs identity

# Jumlah tabel, status RLS, jumlah policy per tabel
node scripts/db/introspect.mjs tables

# Tabel mana yang sudah/belum punya company_id (daftar LENGKAP)
node scripts/db/introspect.mjs tenancy-coverage

# Bukti tidak ada nominal bertipe float
node scripts/db/introspect.mjs money-types

# Buku migrasi vs berkas
node scripts/db/introspect.mjs migration-ledger

# Buku migrasi vs ARTEFAK FISIK di schema (verdict yang bisa dipercaya)
node scripts/db/ledger-diff.mjs
```

Angka endpoint, halaman, dan test:

```bash
grep -rEn "\.(get|post|put|patch|delete)\(" apps/api/src/routes --include=*.ts | grep -v __tests__ | wc -l
find apps/web/app -name 'page.tsx' | wc -l
cd apps/api && npx vitest run          # tempel ringkasannya, jangan diklaim
```

**Aturan mengikat:** angka schema apa pun yang masuk dokumen HARUS berasal dari
`scripts/db/introspect.mjs`. Skrip sekali-pakai dilarang jadi sumber angka —
alasannya (dan kisah galat `ENOTFOUND base`) ada di header `scripts/db/_koneksi.mjs`.

## 2. Tentang project

Aplikasi manajemen konstruksi milik **Puraloka Persada** (Nizar / nihzaa), sedang
bertransformasi menjadi **ERP konstruksi SaaS multi-tenant** yang dijual ke banyak
perusahaan — termasuk satu pemilik dengan beberapa PT. Tujuan lengkap: `CHARTER.md` §2.

- GitHub: `nihzaa/puraloka-suite` (**PRIVATE** — diverifikasi `gh repo view`)
- Lokal: `E:\Project\puraloka-suite`

## 3. Stack

| Lapis | Teknologi |
|---|---|
| Backend API | Node.js + Fastify + TypeScript (port 3001) |
| Web | Next.js + Tailwind CSS v4 + TypeScript (port 3000) |
| Mobile | React Native + Expo |
| Database | PostgreSQL via Supabase |
| Auth | Supabase Auth (email/password + Google OAuth) |
| Storage | Supabase Storage |
| Package manager | pnpm (workspaces) |
| Test | Vitest — **integration test terhadap Postgres NYATA**, bukan mock |

## 4. Struktur

```
apps/api/src/routes/v1/   → route Fastify (satu berkas per domain)
apps/api/src/utils/       → notifications, audit, approval, penalty, webpush
apps/api/src/lib/         → pure function kalkulasi finansial (AHSP, PPN, EVM)
apps/api/scripts/         → penjaga arsitektural yang dijalankan CI
apps/web/app/             → halaman Next.js (dashboard, portal, mandor-portal)
apps/web/components/      → komponen bersama
scripts/db/               → alat introspeksi & ledger-diff (KANONIK)
db/migrations/            → migrasi SQL bernomor
docs/execution/           → CHARTER, QUEUE, JOURNAL, DECISIONS, RATIFIKASI
```

`packages/shared` terdaftar di workspace tetapi **kosong** — jangan menganggapnya
berisi types bersama.

`.worktrees/` berisi git worktree aktif dengan pekerjaan belum ter-merge, dan
menduplikasi seluruh pohon `docs/`. Sudah dikeluarkan dari jangkauan pencarian
lewat `.claudeignore`. **Jangan membaca dokumen dari sana** — isinya versi lain.

## 5. Yang WAJIB diketahui sebelum menyentuh kode

### 5.1 Otorisasi — permission, bukan peran (ADR-004)

Kode hanya boleh memakai `requirePermission`. Literal `'admin'`/`'pm'`/`'mandor'`/
`'client'` **dilarang** sebagai gerbang otorisasi — peran adalah data konfigurasi
per-tenant, bukan konstanta. Sisa pelanggaran dibersihkan di Fase 3 (`QUEUE.yaml`
F3-1). **Jangan menambah yang baru.**

### 5.2 Tenancy

Akses data lewat `request.db` (sadar tenant), bukan `supabase` mentah. Penjaga CI
`audit-gerbang-tenancy.mjs` memakai **ratchet**: jumlah rute tanpa gerbang tidak
boleh naik.

### 5.3 Ember [C] — tidak boleh dikonfigurasi

RLS aktif/mati · invariant pembukuan berpasangan · immutability audit log ·
default gagal-tertutup · struktur rumus finansial · isolasi tenant.
Jangan pernah membuatnya bisa diubah dari UI, sekalipun diminta.

### 5.4 Uang & waktu

Semua nominal `numeric` (nol float — buktikan dengan `money-types`). Semua waktu
`timestamptz`. Jangan memperkenalkan `float`/`timestamp without time zone`.

### 5.5 Migrasi

Menulis ke `supabase_migrations.schema_migrations` adalah **Gerbang Keras G-2**.
Buku itu menentukan apa yang di-replay CI; entri palsu = migrasi dilewati senyap
selamanya. Verdict "sudah jalan" hanya sah bila **artefak fisiknya terbukti ada**
(`ledger-diff.mjs`), bukan dari penebakan nama.

> ⚠️ **Cacat P0 aktif:** migrasi 047 dan 167 sama-sama mendefinisikan `accounts`/
> `journal_entries` dengan bentuk tak kompatibel (047 single-tenant, 167 ber-`company_id`).
> Di lingkungan baru, 047 jalan lebih dulu lalu 167 **no-op senyap** → GL tenant-blind
> tanpa satu pun pesan galat. Detail + usul perbaikan: `RATIFIKASI.md` **R-001**.
> **Jangan bangun apa pun di atas GL sebelum ini selesai.**

## 6. Penjaga CI (jangan dilemahkan — G-5)

`.github/workflows/ci.yml` menjalankan, selain lint/typecheck/test/build:

| Penjaga | Yang dijaga |
|---|---|
| `lint:ratchet` | nol error; warning tak boleh bertambah |
| `audit-gerbang-tenancy.mjs` | rute tanpa saringan tenant tak boleh bertambah |
| `audit-kegagalan-senyap.mjs` | query yang errornya tak pernah dilihat |
| `audit-tulis-tanpa-periksa.mjs` | update/delete/insert tanpa cek hasil |
| `audit-catch-senyap.mjs` | error ditelan tanpa jejak |
| `audit-migrasi-skema-dipaku.mjs` | skema tak boleh dipaku |
| `audit-rancangan-submenu.mjs` | sub-menu berisiko wajib punya rancangan |
| `gen-indeks-docs.mjs --check` | indeks docs wajib mutakhir |

Semuanya ratchet: angka hari ini adalah lantai. Melemahkannya butuh ratifikasi.

## 7. Menjalankan

```bash
cd apps/api && npx tsx src/index.ts    # API  :3001
cd apps/web && pnpm dev                # Web  :3000
cd apps/api && npx vitest run          # test (integration, butuh DB)
```

Env: `apps/api/.env`, `apps/web/.env.local` (contoh: `.env.example` masing-masing).
**Jebakan:** berkas `.env` di repo ini diawali BOM dan nilainya dibungkus tanda
kutip. Parser env buatan sendiri harus melucuti keduanya — atau cukup pakai
`scripts/db/_koneksi.mjs` yang sudah menanganinya.

## 8. Kejujuran (CHARTER §7 — tidak bisa ditawar)

- Dilarang mengklaim test hijau tanpa menempelkan ringkasan run sungguhan.
- "Kolom DB sudah ada" **bukan** selesai. Config-first berarti ada halaman
  pengaturannya di UI.
- Ragu antara dua kesimpulan? **Ukur**, jangan pilih yang lebih nyaman.
- Salah? Tulis "saya salah" di `JOURNAL.md`, perbaiki, lanjut.

## 9. Dokumen rujukan

| Kebutuhan | Berkas |
|---|---|
| Kewenangan, fase, gerbang | `docs/execution/CHARTER.md` |
| Antrean kerja | `docs/execution/QUEUE.yaml` |
| Menunggu founder | `docs/execution/RATIFIKASI.md` |
| Buku migrasi vs kenyataan | `docs/execution/LEDGER-DIFF.md` |
| Koreksi angka audit | `docs/audit/2026-08-02/KOREKSI.md` |
| Prioritas ERP + registry AKTIF/STALE | `docs/PETA-PRIORITAS-ERP.md` |
| Status per-menu terverifikasi kode | `docs/ERP-KONTRAKTOR-TAKSONOMI-MENU.md` |
| Endpoint | `docs/API_ENDPOINTS.md` (bukan dokumen ini) |
| Skema DB | ukur sendiri: `node scripts/db/introspect.mjs columns` |
| Strategi multi-tenant | `docs/superpowers/specs/2026-07-18-enterprise-architecture/Engineering-Constitution/adr/ADR-011-multi-tenant-strategy.md` |
| Scope ERP + AI | `docs/KEPUTUSAN-SCOPE-ERP-AI.md` |
