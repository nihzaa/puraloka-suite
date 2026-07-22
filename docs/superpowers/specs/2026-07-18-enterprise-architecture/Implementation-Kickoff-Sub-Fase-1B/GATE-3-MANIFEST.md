# Gate 3 Manifest — Kickoff Sub-Fase 1B (Configuration Foundation)

**Status:** DRAFT untuk review founder. Dokumen 00-10 + eksekusi **belum ditulis full** — manifest ini mendaftar struktur + isi ringkas tiap dokumen untuk di-review dulu (per instruksi: berhenti di Gate 3). Setelah "lanjut semua", dokumen ditulis penuh.

**Penomoran:** Sub-Fase 1B = bagian kedua Program A (= Phase 1). Lihat [../Master-Delivery-Blueprint/NUMBERING-GLOSSARY.md](../Master-Delivery-Blueprint/NUMBERING-GLOSSARY.md).

---

## Lingkup Sub-Fase 1B (dari `Phase1/02-target-architecture.md § SUB-FASE 1B` — bukan karangan)

| Epic | Nama | Cakupan | Kompleksitas | execution/? |
|---|---|---|---|---|
| **1B.1** | Configuration Engine | Tabel `company_settings`; migrasi **tax rate hardcode** → config. ⚠️ **Lokasi hardcode terverifikasi ulang: `apps/api/src/lib/tax-calculation.ts:4-5`** (`ppn:0.11, pph_final:0.02`) — BUKAN `termin-payment.ts:175` (target-arch usang; tax calc sudah diekstrak ke pure function di Epic 1). Migrasi harus pertahankan test `tax-calculation.test.ts` (8 test) | Sedang | **Ya** (sentuh calc finansial + test existing) |
| **1B.2** | Menu Registry | Tabel `menu_items`; refactor `apps/web/components/sidebar.tsx` (530 baris, ~24 menu hardcoded JSX) → renderer DB-driven. Visibility `perms.has(...)` dipertahankan, hanya sumber data pindah | Tinggi | **Ya** (refactor UI besar + caching + invalidation) |
| **1B.3** | Module Registry & Feature Flags | Tabel module registry + feature flags | Sedang | **Ya** (pola baru, perlu desain) |
| **1B.4** | `users.role` enum → FK (OPSIONAL, TERAKHIR) | Migrasi `users.role` dari enum `user_role` 4-nilai → TEXT/FK ke `roles`. Menuntaskan RBAC config-driven (role custom `direktur` bisa di-assign) | **TINGGI (risiko tertinggi 1B)** | **Ya** (blast radius auth + RLS + smoke test ulang) |

**Tax hardcode — koreksi lokasi (Kontrak Operasi #1):** verifikasi langsung menemukan target-arch (`termin-payment.ts:175`) sudah usang. Aktual: `lib/tax-calculation.ts:4-5`. Kickoff 1B.1 pakai lokasi nyata.

---

## Dependency Graph & Urutan (aku tentukan dari risiko, bukan asal)

```
1B.1 Config Engine ──┐
1B.2 Menu Registry ──┼──► gate core 1B (1B.1-1B.3 selesai)
1B.3 Module/Flags  ──┘         │
                              ▼
              1B.4 enum→FK (OPSIONAL, di belakang gate core)
                    + migration + smoke test 4 role sendiri
```

**Kenapa 1B.4 terakhir & terpisah gate (justifikasi risiko):**
- `users.role` dibaca di **setiap request** (`plugins/auth.ts`), **semua RLS policy** (via `auth_role()`), `get_role_permissions` RPC, 55+ inline `user.role`. Blast radius terbesar di seluruh 1B.
- 1B.1-1B.3 **additive** (tabel baru), tidak menyentuh auth path → aman duluan, gate core tidak tergantung 1B.4.
- 1B.4 butuh expand-contract sendiri (kolom `role_id` baru → backfill → swap → drop enum) + **smoke test 4 role ulang** (mengubah resolusi role) + kemungkinan sentuh 049-era RLS helper.
- **1B.4 OPSIONAL:** kalau founder pilih Opsi B (tunda), gate core 1B tetap bisa lulus tanpanya.

---

## Struktur direktori & isi ringkas tiap dokumen (BELUM ditulis full)

### Dokumen PERENCANAAN (00-10) — `Implementation-Kickoff-Sub-Fase-1B/`

| File | Isi ringkas |
|---|---|
| `README.md` | Peta paket + link glossary + status |
| `00-executive-summary.md` | Readiness score 1B + starting point (Epic pertama = 1B.1) |
| `01-implementation-readiness.md` | Skor per dimensi dgn evidence file:line (Config Engine, Menu, dsb) — grep langsung |
| `02-sub-fase-1b-sequence.md` | 1B.1-1B.4 sbg unit eksekusi (Objective/Dependency/Input/Output/Deliverable/Rollback/DoD) |
| `03-folder-and-module-order.md` | Urutan file: migration company_settings → API settings → sidebar refactor |
| `04-database-migration-plan.md` | Nomor migration **mulai 075** (074 terpakai; diverifikasi). company_settings, menu_items, dst. 1B.4 enum migration terpisah |
| `05-feature-implementation-order.md` | Dependency graph Epic-level (di atas) + task breakdown |
| `06-testing-execution-plan.md` | Test config-read, menu-render, feature-flag; 1B.1 pertahankan tax-calculation.test.ts |
| `07-release-and-rollback-plan.md` | Rollback per migration; 1B.4 expand-contract + rollback enum |
| `08-day-one-checklist.md` | Pre-coding: verifikasi migration terakhir, Gate 1A→1B approved (✅) |
| `09-definition-of-ready.md` | DoR per task; kategori khusus 1B.4 (auth-critical, smoke test wajib) |
| `10-go-no-go-checklist.md` | Checklist N-poin + adversarial review sebelum finalisasi |

### Dokumen EKSEKUSI — proporsional (playbook § Siklus Penuh)

| File | Status rencana |
|---|---|
| `STATUS.md` | Kerangka per-epik (1B.1-1B.4), status kosong — **WAJIB** |
| `execution/1b2-menu-registry.md` | **Ya** — refactor sidebar kompleks (caching/invalidation) |
| `execution/1b4-role-enum-migration.md` | **Ya** — auth-critical, expand-contract, smoke test |
| `execution/` untuk 1B.1, 1B.3 | **SKIP** + alasan: 1B.1 additive + pola tax config lugas; 1B.3 CRUD tabel standar. Cukup di sequence doc |
| Decision log | **TIDAK diperlukan** untuk core 1B (1B.1-1B.3 murni teknis, nol keputusan founder menggantung). 1B.4 punya **satu** keputusan founder (Opsi A migrasi vs Opsi B tunda) → dicatat di `02-sequence` § 1B.4, bukan decision log terpisah kecuali founder minta |
| `SUB-FASE-1B-COMPLETION-AUDIT.md` | Template kosong, diisi di gate akhir — **WAJIB di gate** |

---

## Readiness Score (draft — difinalkan di 00/01 saat ditulis full)

| Dimensi | Skor draft | Catatan |
|---|---|---|
| Architecture | 9/10 | Desain 1B sudah di target-arch |
| Prasyarat (Gate 1A) | 10/10 | Gate 1A→1B approved, RBAC/RLS solid |
| Repository | 8/10 | Perlu verifikasi migration 075 start + drift 073 belum tracked |
| Config Engine readiness | 8/10 | Tax hardcode terlokalisasi (pure fn) — mudah dimigrasi |
| Menu Registry readiness | 6/10 | sidebar.tsx 530 baris — refactor non-trivial |
| 1B.4 risk | 4/10 | Auth blast radius besar — sengaja opsional/terakhir |

**Rata-rata draft ~7.5/10** — sehat untuk mulai 1B.1, dengan 1B.4 di-gate ketat.

---

## Day One Checklist (ringkas)

- [ ] Konfirmasi Gate 1A→1B approved (✅ sudah)
- [ ] Verifikasi nomor migration terakhir (074) → 1B mulai 075
- [ ] Rekonsiliasi drift tracking 073 (dari run implementasi F5.5) — cek sebelum migration 1B pertama
- [ ] Baca `lib/tax-calculation.ts` + `tax-calculation.test.ts` (target 1B.1)
- [ ] Baca `sidebar.tsx` penuh (target 1B.2)

---

## ITEM YANG BUTUH KEPUTUSAN FOUNDER (sebelum implementasi 1B)

1. **1B.4 Opsi A vs B** — migrasi enum→FK sekarang (menuntaskan config-driven, risiko tinggi) ATAU tunda dengan alasan. Rekomendasi: Opsi A tapi **paling akhir + gate sendiri**.
2. **Scope 1B.2 caching** — client-side cache menu + invalidation: strategi apa (revalidate on admin change vs TTL)? Keputusan produk/UX.
3. **Konfirmasi lingkup 1B sempit** — target-arch batasi 1B.1 ke **tax rate saja** (approval limits/payment terms ditunda ke 1C). Konfirmasi tetap sesempit itu.

**Tidak ada yang di-commit/push/migrate. Semua planning. BERHENTI di sini menunggu review scope + "lanjut semua".**
