# 02 — AUDIT DOKUMENTASI

584 berkas `.md` terdeteksi. Yang **aktif** jauh lebih sedikit — lihat §2.3 soal worktree.

## 2.1 Tabel dokumen utama

Tanggal = `git log -1 --format=%ad` per berkas.

| Path | Tipe | Isi ringkas | Kegunaan | Status | Diubah | Drift vs kode |
|---|---|---|---|---|---|---|
| `CLAUDE.md` | reference | Konteks proyek untuk agent: stack, struktur, endpoint, business logic, status fitur | Dibaca agent AI tiap sesi | **USANG SEBAGIAN — berbahaya** | 2026-07-26 | **SALAH BERAT.** `:75` "migrations (001-058)" → nyata **174**. `:93` "Database — 27+ Tabel" → nyata **122**. `:788` "DB Migrations: 058 total" → nyata 174. Header `:5` sendiri mengaku basi tapi menyebut "s.d. 116; dev 90 tabel" — **itu pun sudah basi lagi** |
| `STATUS.md` | execution | Penunjuk satu-pintu: fase aktif, keputusan terbuka, peta baca | Titik masuk manusia + agent | **AKTIF — paling tepercaya** | 2026-08-02 | Akurat. rev-19 mencatat temuan `created_at` & baseline basi dengan jujur |
| `AUTOPILOT.md` | reference | Protokol eksekusi otonom | Aturan main agent | AKTIF | 2026-07-31 | `BELUM DIVERIFIKASI` isi detailnya |
| `AUDIT_REPORT.md` | audit | Audit keamanan lama: CRITICAL-1 RLS, STORAGE-1, OPEN-4 foto | Riwayat temuan + bukti perbaikan | **AKTIF sebagai arsip** | 2026-07-24 | Menyebut "migration 049 … ~46 tabel" — nyata kini **122 tabel ber-RLS**. Angka historis, bukan salah |
| `DEMO.md` | scratch | Skrip demo | Presentasi | **YATIM** (9 hari tak tersentuh) | 2026-07-16 | `BELUM DIVERIFIKASI` |
| `DOMAIN.md` | reference | Istilah domain konstruksi | Kamus bersama | AKTIF | 2026-07-24 | `BELUM DIVERIFIKASI` |
| `HARDCODE-CENSUS.md` | audit | Sensus nilai ter-hardcode | Backlog config-first | AKTIF | 2026-07-24 | `BELUM DIVERIFIKASI` |
| `docs/ROADMAP.md` | planning | Antrean pekerjaan (134 item) | Urutan kerja | **AKTIF** | 2026-08-02 | Mutakhir |
| `docs/PETA-PRIORITAS-ERP.md` | planning | Dokumen induk prioritas + registry AKTIF/STALE | Penentu dokumen mana dipercaya | **AKTIF — kunci** | 2026-08-01 | Mutakhir |
| `docs/ERP-KONTRAKTOR-TAKSONOMI-MENU.md` | reference | Status per-menu ERP terverifikasi kode | Ukur kemajuan nyata | **AKTIF** | 2026-08-02 | Mutakhir |
| `docs/API_ENDPOINTS.md` | reference | Daftar endpoint | Rujukan API | AKTIF | 2026-08-01 | `BELUM DIVERIFIKASI` per-baris vs 198 rute nyata |
| `docs/DATABASE_SCHEMA.md` | reference | Skema DB | Rujukan tabel | AKTIF | 2026-08-01 | `BELUM DIVERIFIKASI` vs 122 tabel |
| `docs/MODULE_STATUS.md` | execution | Status modul | Lacak kemajuan | AKTIF | 2026-08-01 | `BELUM DIVERIFIKASI` |
| `docs/ERP_MASTER_PLAN.md` | planning | Rencana induk modul (termasuk Modul 10 GL) | Sumber urutan GL-1..GL-4 | AKTIF | 2026-07-31 | Konsisten dengan migrasi 167 |
| `docs/INDEKS-DOKUMEN.md` | reference | Indeks seluruh dokumen | Navigasi | **AKTIF — dijaga CI** | 2026-08-02 | Dijaga `gen-indeks-docs.mjs --check` |
| `docs/DEVELOPMENT_LOG.md` | execution | Log pengembangan | Riwayat | AKTIF | 2026-07-31 | — |
| `docs/PROTOKOL-SESI.md` | reference | Protokol sesi kerja | Aturan agent | AKTIF | 2026-07-31 | — |
| `docs/RANCANGAN-DIKERJAKAN.md` | planning | Rancangan yang sedang dikerjakan | Antrean desain | **AKTIF** | 2026-08-02 | Mutakhir |
| `docs/KEPUTUSAN-MULTI-COMPANY.md` | ADR-lite | Tripwire multi-company | Pemicu keputusan | **SUPERSEDED** oleh ADR-011 | 2026-07-29 | Diamandemen eksplisit — ditandai benar |
| `docs/KEPUTUSAN-SCOPE-ERP-AI.md` | ADR-lite | Scope: ERP lengkap + AI; 4 kantong masuk kembali | **Dokumen scope yang menang** | **AKTIF — paling baru** | 2026-08-01 | Konsisten dengan STATUS.md |

## 2.2 Peta ADR

`docs/superpowers/specs/2026-07-18-enterprise-architecture/Engineering-Constitution/adr/` — 13 berkas:

| ADR | Judul | Status | Kepatuhan kode |
|---|---|---|---|
| ADR-000 | batching strategy | — | — |
| ADR-001 | structure & governance | — | — |
| ADR-002 | enforcement levels | — | — |
| ADR-004 | **permission is architecture, role is configuration** | ACCEPTED | ⚠️ **DILANGGAR 53×** — lihat §2.4 |
| ADR-005 | RLS ownership via SECURITY DEFINER | ACCEPTED | ✅ 375 policy hidup; `rls-ownership-recursion.test.ts` lulus |
| ADR-006 | retire workflow engine shadow | ACCEPTED | `BELUM DIVERIFIKASI` |
| ADR-007 | configurable approval engine | ACCEPTED | ✅ `evaluateEntityApproval` dipakai 4 modul; `approval-chain-berjenjang.test.ts` lulus |
| ADR-008 | notification routing engine | ACCEPTED | ✅ `recipient-resolution.test.ts` lulus |
| ADR-009 | CECEP persistence derivation | ACCEPTED | ✅ tabel CECEP hidup, `cost_codes` 44 baris |
| ADR-011 | **multi-tenant strategy** | **ACCEPTED** | ✅ Sebagian — 42/122 tabel ber-`company_id`, `companies` 1 baris, gerbang 157/164 |
| ADR-011-T1/T3/T4 | audit klasifikasi tabel / pra-eksekusi / celah tenancy | — | Dokumen kerja turunan |

**ADR-003 dan ADR-010 tidak ada.** Penomoran melompat tanpa penjelasan di direktori.
`[FIX-LATER]` — nomor yang hilang membuat pembaca menduga dokumen tercecer.

## 2.3 Duplikasi worktree — sumber halusinasi paling nyata

`.worktrees/docs-protokol/` dan `.worktrees/warm-clay-design-system/` **menduplikasi
seluruh pohon `docs/`**: 48 berkas CECEP, 32 enterprise-architecture, 20
Implementation-Kickoff-1B, 10 ADR, 27 `.superpowers/sdd`, dst.

Bahayanya konkret: `grep -r` dan agent AI yang menelusuri repo akan menemukan **dua versi**
dokumen yang sama dengan isi berbeda, tanpa penanda mana yang menang. Ini persis mekanisme
halusinasi yang brief khawatirkan. **P1 — `[FIX-LATER]`.**

## 2.4 Pelanggaran ADR-004 (role literal sebagai gerbang otorisasi)

`grep` menemukan **53 lokasi** yang memakai literal role. Contoh terverifikasi:

```
apps/api/src/routes/v1/cash.ts:511    currentUser.role === 'admin' || currentUser.role === 'pm'
apps/api/src/routes/v1/clients.ts:25  all === 'true' && user.role === 'admin'
apps/api/src/routes/v1/kasbons.ts:135 user.role === 'admin' || user.role === 'pm'
apps/api/src/routes/v1/users.ts:34    request.currentUser?.role === 'admin'
```

Bandingkan dengan **286** pemakaian `requirePermission` — jadi pola dominan sudah benar,
tetapi 53 sisa ini adalah utang yang **bertabrakan langsung dengan multi-tenant**:
`STATUS.md` sendiri mencatat bahayanya — "peran global `admin` membawa 95 permission ke
company tempat orangnya hanya `mandor`". **P1.**

## 2.5 Kontradiksi antar dokumen

| Pasangan | Kontradiksi |
|---|---|
| `CLAUDE.md:75,93,788` ↔ DB nyata | 58 migrasi & 27 tabel vs **174 migrasi & 122 tabel** |
| `CLAUDE.md:5` ↔ DB nyata | Koreksi sendiri menyebut "116 migrasi, 90 tabel" — **juga sudah basi** |
| `docs/KEPUTUSAN-MULTI-COMPANY.md` ↔ `ADR-011` | "JANGAN tambah `company_id` sekarang" vs "tambahkan" — **terselesaikan**, ADR-011 mengamandemen eksplisit |
| Scope 2026-07-26 ↔ `KEPUTUSAN-SCOPE-ERP-AI.md` | 4 kantong dicoret vs dimasukkan kembali — **terselesaikan**, ditandai "menang atas yang lama" |
| Taksonomi menu ↔ Blueprint (soal "RFI") | *Request for Inspection* vs *Request for Information* — **terselesaikan**: DB punya **dua** tabel, `inspection_requests` DAN `information_requests` |
| `supabase_migrations` (162) ↔ berkas (174) | Buku vs kenyataan, 12 versi |

Pola yang layak dipuji: **hampir semua kontradiksi sudah dikenali dan diselesaikan secara
eksplisit** dengan dokumen yang menyatakan "menang atas yang lama". Yang tersisa sebagai
bahaya nyata hanya `CLAUDE.md`.

## 2.6 Keputusan di kode tapi tak terdokumentasi

- Nama tabel GL adalah `accounts`/`journal_entries`/`journal_entry_lines`, **bukan**
  ber-prefix `gl_`. Tak ada dokumen yang menyatakan konvensi ini — auditor (saya) tertipu
  sekali karenanya.
- `packages/shared` kosong total padahal CLAUDE.md menyatakannya berisi types bersama.

## 2.7 Dokumen yang HILANG

1. **`README.md` di root** — tak ada. Onboarding manusia bertumpu pada `CLAUDE.md` yang basi.
2. **ADR-003 & ADR-010** — nomor melompat.
3. **Runbook operasional** — prosedur restore/backup/incident: `BELUM DIVERIFIKASI` adanya.
4. **Dokumen konvensi penamaan DB** (kasus `accounts` vs `gl_accounts`).
5. **Threat model / data-classification** untuk SaaS multi-tenant.
