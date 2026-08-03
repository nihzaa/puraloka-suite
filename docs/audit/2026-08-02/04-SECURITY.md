# 04 — AUDIT KEAMANAN

## 4.1 Ringkasan

Berbeda dari asumsi brief, **RLS tidak dorman**: 122 dari 122 tabel `public` punya
`relrowsecurity = true`, dengan **375 policy**. Otorisasi Fastify **bukan** satu-satunya
lapis. Meski demikian API tetap memakai `service_role` (bypass RLS), jadi preHandler
tetap lapis pertahanan *efektif* untuk jalur API.

## 4.2 Matriks otorisasi — endpoint tanpa `preHandler`

Metode: parser AST-ringan atas 49 file route, mencari deklarasi `.get/.post/...` lalu
memeriksa 14 baris berikutnya untuk `preHandler`.

**Hasil: 198 deklarasi route, 5 tanpa `preHandler`.**

| File:line | Endpoint | Penilaian |
|---|---|---|
| `auth.ts:19` | `POST /api/v1/auth/login` | **SAH** — pintu masuk, tak mungkin ber-auth |
| `auth.ts:177` | `POST /api/v1/auth/refresh` | **SAH** — memvalidasi refresh token sendiri |
| `auth.ts:215` | `POST /api/v1/auth/google-callback` | **SAH** — OAuth callback |
| `auth.ts:285` | `POST /api/v1/auth/logout` | **SAH** — hanya menghapus cookie |
| `settings.ts:65` | `GET /api/v1/public/invoice/:id` | **SENGAJA PUBLIK** — halaman verifikasi QR |

### Catatan atas `GET /api/v1/public/invoice/:id`

Dibaca penuh (`settings.ts:65-110`). Desainnya **lebih hati-hati dari dugaan awal**:
- Field dibatasi (nomor, total, status, tanggal, nama proyek) — tanpa data klien/PII.
- Perusahaan **diturunkan dari invoice itu sendiri** (`projects.company_id`), bukan dari
  "baris pertama `company_profile`" — komentar T4i di kode menyebut ini eksplisit sebagai
  perbaikan kebocoran lintas-tenant.

**Sisa risiko (P2, bukan P0):** `id` adalah UUID v4 → enumerasi praktis mustahil, tapi
siapa pun yang memegang URL bisa melihat nominal invoice selamanya (tanpa expiry/token).
`[FIX-LATER]` — pertimbangkan signed token ber-kedaluwarsa.

## 4.3 Gerbang tenancy (alat milik repo sendiri)

`node apps/api/scripts/audit-gerbang-tenancy.mjs`:

```
Gerbang yang DITEMUKAN otomatis (19): ambilEOT, ambilInspeksiMilikTenant,
ambilPunchMilikTenant, ambilRap, ambilRfiMilikTenant, ambilSubmittalMilikTenant,
canParticipateInChain, coMilikTenant, evaluateEntityApproval, grupMilikSaya,
idAnggotaCompany, proyekBolehDibaca, proyekMilikTenant, resolveScopeItemOwnership,
scopeIdsTenant, skenarioIdsTenant, skenarioMilikTenant, tolakRoleTenantLain, versiMilikTenant

Rute ber-supabase-mentah: 164 · bergerbang 157 · TANPA gerbang 7
```

7 rute tanpa saringan tenant: `auth.ts:19`, `auth.ts:215`, `mandor.ts:35`
(`POST /mandor/kasbon-photo/upload`), `notifications.ts:637/662` (subscribe/unsubscribe
push), `roles.ts:236` (`GET /permissions` — katalog bersama), `roles.ts:338`
(`GET /auth/me/permissions`).

**Yang paling layak ditinjau:** `POST /api/v1/mandor/kasbon-photo/upload` — rute yang
**menulis** dan memakai supabase mentah tanpa gerbang tenant terdeteksi.
`[FIX-LATER]` — perlu pembacaan manual apakah ownership dicek di dalam handler.

Ratchet ini **berjalan di CI** (`.github/workflows/ci.yml`) sehingga angka 7 tak boleh naik.

## 4.4 Rahasia

- **Repo PRIVATE** — diverifikasi: `gh repo view` → `{"isPrivate":true,"visibility":"PRIVATE"}`.
  Premis brief ("repo ini PUBLIC") **tidak benar**; risiko histori-secret turun drastis.
- `git grep` untuk `eyJ…`, `sb_secret_`, `postgres://user:pass@`: **nol hit di kode**
  (`*.ts`, `*.tsx`, `*.json`). Hit yang muncul hanyalah **kata** `service_role` di
  dokumen naratif (`AUDIT_REPORT.md`, `CLAUDE.md`, `STATUS.md`) — bukan nilai rahasia.
- `.env` **tidak** ter-track; `.env.example` tersedia untuk api & web.
- `BELUM DIVERIFIKASI`: pemindaian `git log -p` penuh atas seluruh histori untuk secret
  yang pernah ter-commit lalu dihapus — biaya terlalu besar untuk sesi ini, dan
  mitigasinya (repo privat) sudah ada.

## 4.5 Kekuatan yang terverifikasi

- **RLS 100% menyala** (122/122) dengan 375 policy — jauh di atas praktik umum.
- **192 trigger** DB, termasuk `protect_created_at` yang dipulihkan migrasi 166 dan
  diuji `created-at-immutable.test.ts`.
- Test khusus keamanan yang **nyata ada dan lulus**: `authz-endpoints.test.ts`,
  `rls-contract.test.ts`, `rls-financial-group.test.ts`, `rls-operational-group.test.ts`,
  `rls-ownership-recursion.test.ts`, `tenant-isolation-nyata.test.ts`,
  `search-tenant-isolation.test.ts`, `scope-item-tenancy.test.ts`,
  `photo-attach-ownership.test.ts`, `rate-limit-429.test.ts`.
- **12 file test** menguji jalur **403** secara eksplisit.

## 4.6 Yang belum diverifikasi

- Validasi MIME sejati vs ekstensi pada upload: ada `validateMime` menurut `AUDIT_REPORT.md`,
  **tidak dibaca ulang baris demi baris** di audit ini. `BELUM DIVERIFIKASI`.
- Helmet/CORS/body-limit/rate-limit: `rate-limit-429.test.ts` membuktikan rate limit hidup;
  header keamanan lain `BELUM DIVERIFIKASI`.
- Anti-self-lockout (penolakan pencabutan permission kritis dari pemegang terakhir):
  `BELUM DIVERIFIKASI` — `roles-replace-all.test.ts` ada tapi isinya tidak dibaca.
- Immutabilitas `audit_logs` terhadap user biasa: trigger `protect_created_at` terbukti,
  proteksi DELETE `BELUM DIVERIFIKASI`.
- Storage policy yang dibuat manual lewat dashboard: `BELUM DIVERIFIKASI`.
