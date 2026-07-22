# 04 — Database Migration Plan (Sub-Fase 1B)

**Nomor terakhir diverifikasi:** `074_seed_cash_view.sql` (ls `db/migrations/` 2026-07-23). 1B mulai **075**.

## ⚠️ Day-0: Rekonsiliasi drift tracking 073 (WAJIB sebelum migration 1B pertama)

Bawaan 1A: migration 073 (append-only trigger) applied ke DB tapi belum tercatat `schema_migrations` (apply pg langsung di PR #13). Sebelum migration 1B pertama, tandai 073 applied di tracking (verifikasi trigger ada dulu) supaya `supabase db diff`/`push` akurat. Ini bukan migration baru — hanya rekonsiliasi tracking. Detail: [08-day-one-checklist.md](08-day-one-checklist.md).

## Migration 1B

| Nomor | Nama | Epic | Sifat | Rollback |
|---|---|---|---|---|
| 075 | `company_settings` | 1B.1 | **Additive** (CREATE TABLE + seed) | DROP TABLE |
| 076 | `menu_registry` | 1B.2 | **Additive** (`menu_items` + seed 1:1 sidebar) | DROP TABLE |
| 077 | `module_feature_flags` | 1B.3 | **Additive** (`modules`+`feature_flags`, seed existing=ON) | DROP TABLE |
| 078 | `users_role_fk_expand` | 1B.4 | **DESTRUKTIF (Red-Line)** — expand kolom role_id FK | DROP COLUMN role_id |
| 0XX | `users_role_contract` | 1B.4 | **DESTRUKTIF (Red-Line)** — drop enum setelah stabil | re-create enum dari 001 |

## Aturan (dari 1A, dipertahankan)

- **Kembar 2 folder** identik (`db/` + `supabase/`).
- **Verifikasi column-level** setelah apply (bukan "tabel ada") — pelajaran bug 058.
- **Verifikasi via koneksi baru** untuk DDL persistensi (pelajaran F5.5 — apply in-tx via pooler bisa tak persist).
- Migration 075-077 = Green-Zone (additive, otonom). Migration 078+ = **Red-Line #1**, DANGER GATE.

## Skema kunci (dari target-arch, ringkas)

```sql
-- 075
CREATE TABLE company_settings (
  id UUID PK DEFAULT gen_random_uuid(),
  key TEXT NOT NULL UNIQUE,           -- 'tax.ppn_rate'
  value JSONB NOT NULL,
  value_type TEXT NOT NULL,           -- number|string|boolean|json
  category TEXT NOT NULL,             -- tax|approval|notification
  description TEXT,
  updated_by UUID REFERENCES users(id),
  updated_at TIMESTAMPTZ DEFAULT now()
);
-- seed: tax.ppn_rate=0.11, tax.pph_final_rate=0.02

-- 076
CREATE TABLE menu_items (
  id UUID PK DEFAULT gen_random_uuid(),
  parent_id UUID REFERENCES menu_items(id),
  label TEXT NOT NULL, href TEXT, icon TEXT,
  required_permission TEXT REFERENCES permissions(key),
  sort_order INT NOT NULL DEFAULT 0,
  company_id UUID NULL,               -- L2, nullable sekarang
  is_active BOOLEAN DEFAULT true
);
```

RLS: tabel config/menu/module dapat policy `has_permission()` (pola 1A) — read authenticated, write `settings:manage`.
