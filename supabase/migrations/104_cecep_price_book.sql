-- Migration 104 — CECEP Milestone 2: Versioned Price Book (Program C)
--
-- Aggregate Root PER ENTRY (`44` §5, `03b` §A.6) — "bukan Price Book sebagai satu
-- entity besar; konsekuensi langsung Foundational Principle Ketiga". Satu baris =
-- satu harga, satu versi, satu lokasi, satu sumber.
--
-- Business Responsibility (`44` §5): "Harga adalah knowledge, bukan angka —
-- satu baris harga di satu lokasi pada satu waktu harus IMMUTABLE begitu terpakai,
-- supaya Estimate Item lama tidak berubah retroaktif saat harga baru masuk."
--
-- ── Kenapa Price Book dibangun SEBELUM CBS (menyimpang dari daftar `49`) ──────
-- Daftar Milestone 2 di `49` menulis "CBS → Assembly → Price Book → ...", tapi itu
-- BUKAN rantai FK: `37 §2` + `44 §4` menunjukkan Assembly TIDAK mereferensikan CBS
-- (input Assembly = Reference Library/RBS/Formula), dan CBS dirujuk oleh Estimate
-- Item yang domain Milestone 3. CBS sendiri punya DUA keputusan yang `03b` tandai
-- "belum diambil" (B.4 rumah Standard CBS, B.5 pola versioning) dan TIDAK ditutup
-- di `44`/`45`/`46` — membangunnya sekarang = ❌ Invented (dilarang ADR-009).
-- Price Book: fully-derived (`44` §5 ✓), kontrak lengkap (`45` §C), versioning JUSTRU
-- sudah resolved, dan hanya bergantung RBS (migration 103, sudah ada). Urutan
-- ANTAR-Milestone (1→2→3→4) tetap tidak dibalik; ini penataan DI DALAM Milestone 2
-- mengikuti dependency nyata, bukan nomor daftar.
--
-- ── Struktur 8-atribut wajib (`03b` §A.6 Shared Kernel) ─────────────────────
-- Version / Effective Date / Expired Date / Location / Currency / Supplier /
-- Confidence Level / Verified By — seragam untuk keempat jenis Price Book.
-- "4 jenis" (Material/Equipment/Labor/Subcontract) = kategori resource yang
-- dirujuk, BUKAN field sendiri (No Data Duplication) → diturunkan via resources.
--
-- ── Yang SENGAJA tidak ada (Open — ADR-009) ─────────────────────────────────
--   unit       → kontrak Price Book Entry (`45` §C) TIDAK memuat unit di 11
--                elemennya; harga "per satuan resource" tapi satuannya milik
--                resource, yang resolusinya masih ditunda (lihat migration 103).
--   company_id → Phase 7 (Program D).

-- ─── 1. TABLE ───────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS price_book_entries (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Referensi RBS (`03b` §A.6 Context Mapping: "Price Book Entry → RBS entry").
  -- MERUJUK, tidak menyalin — No Data Duplication.
  resource_id      UUID NOT NULL REFERENCES resources(id),

  -- Money Value Object (`45` §143): (amount, currency).
  amount           NUMERIC(18, 2) NOT NULL CHECK (amount >= 0),
  currency         TEXT NOT NULL DEFAULT 'IDR',

  -- 8-atribut wajib (`03b` §A.6).
  version_number   INT NOT NULL DEFAULT 1 CHECK (version_number >= 1),
  effective_date   DATE NOT NULL,
  expired_date     DATE,                        -- null = aktif tanpa batas sampai di-expire
  location         TEXT,
  supplier         TEXT,
  -- Confidence Level Value Object (`03b` baris 37: "High/Medium/Low").
  confidence_level TEXT CHECK (confidence_level IN ('high', 'medium', 'low')),

  -- Lifecycle `03b` §A.6: Draft → Verified → Active → Expired.
  status           TEXT NOT NULL DEFAULT 'draft'
                   CHECK (status IN ('draft', 'verified', 'active', 'expired')),

  -- "Verified By" — jejak siapa mengesahkan harga (bagian 8-atribut wajib).
  verified_by      UUID REFERENCES users(id) ON DELETE SET NULL,
  verified_at      TIMESTAMPTZ,

  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by       UUID REFERENCES users(id) ON DELETE SET NULL,
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by       UUID REFERENCES users(id) ON DELETE SET NULL,

  -- Rentang tanggal harus koheren.
  CONSTRAINT price_book_date_range CHECK (expired_date IS NULL OR expired_date >= effective_date),
  -- 'verified' ke atas WAJIB punya jejak pengesahan (attestation tak boleh kosong).
  CONSTRAINT price_book_verified_trace CHECK (
    status = 'draft' OR (verified_by IS NOT NULL AND verified_at IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_price_book_resource ON price_book_entries(resource_id);
CREATE INDEX IF NOT EXISTS idx_price_book_status   ON price_book_entries(status);

COMMENT ON TABLE price_book_entries IS
  'CECEP Versioned Price Book — satu baris = satu harga ter-versi (Aggregate Root '
  'per entry). Immutable begitu di-verify; Estimate Item merujuk entry aktif, '
  'JANGAN menyalin harga (No Data Duplication, ADR-009).';

-- ─── 2. HARD GUARD: immutable begitu keluar dari draft ──────────────────────
--
-- Inti alasan Price Book ada (`44` §5): harga yang sudah terpakai TIDAK boleh
-- berubah retroaktif, kalau tidak Estimate Item lama ikut berubah nilainya diam-
-- diam. `45` §C: "Allowed Mutation: Hanya via Draft→Verified". Maka begitu status
-- ≠ draft, field inti dikunci; hanya transisi status (lewat trigger #3) yang boleh.
-- Harga baru = ENTRY baru (version_number naik), bukan edit di tempat.

CREATE OR REPLACE FUNCTION fn_price_book_immutable()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
BEGIN
  IF OLD.status <> 'draft' THEN
    IF ( NEW.resource_id, NEW.amount, NEW.currency, NEW.version_number,
         NEW.effective_date, NEW.expired_date, NEW.location, NEW.supplier,
         NEW.confidence_level )
       IS DISTINCT FROM
       ( OLD.resource_id, OLD.amount, OLD.currency, OLD.version_number,
         OLD.effective_date, OLD.expired_date, OLD.location, OLD.supplier,
         OLD.confidence_level )
    THEN
      RAISE EXCEPTION
        'Price Book Entry sudah di-verify (status=%): harga & atribut inti tak bisa '
        'diubah — Estimate Item yang merujuknya tak boleh berubah retroaktif. '
        'Buat entry baru (version berikutnya) untuk harga baru.', OLD.status
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  RETURN NEW;
END $function$;

DROP TRIGGER IF EXISTS trg_price_book_immutable ON price_book_entries;
CREATE TRIGGER trg_price_book_immutable
  BEFORE UPDATE ON price_book_entries
  FOR EACH ROW EXECUTE FUNCTION fn_price_book_immutable();

-- ─── 3. HARD GUARD: transisi lifecycle maju saja ────────────────────────────
--   draft → verified → active → expired. Tidak boleh mundur.
--   Draft→Verified mengisi verified_at otomatis (verified_by wajib dari pemanggil).

CREATE OR REPLACE FUNCTION fn_price_book_status_transition()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
BEGIN
  IF NEW.status = OLD.status THEN
    RETURN NEW;
  END IF;

  IF NOT (
       (OLD.status = 'draft'    AND NEW.status = 'verified')
    OR (OLD.status = 'verified' AND NEW.status = 'active')
    OR (OLD.status = 'active'   AND NEW.status = 'expired')
  ) THEN
    RAISE EXCEPTION
      'Transisi status Price Book tidak sah: % → %. Alur sah: '
      'draft→verified→active→expired (maju saja).', OLD.status, NEW.status
      USING ERRCODE = 'check_violation';
  END IF;

  IF NEW.status = 'verified' AND NEW.verified_at IS NULL THEN
    NEW.verified_at := now();
  END IF;

  RETURN NEW;
END $function$;

DROP TRIGGER IF EXISTS trg_price_book_status_transition ON price_book_entries;
CREATE TRIGGER trg_price_book_status_transition
  BEFORE UPDATE OF status ON price_book_entries
  FOR EACH ROW EXECUTE FUNCTION fn_price_book_status_transition();

-- ─── 4. HARD GUARD: entry non-draft tidak boleh dihapus ─────────────────────
--
-- Draft belum pernah dirujuk (consumer hanya merujuk entry AKTIF) → boleh dibuang.
-- Begitu di-verify, entry mengemban attestation dan bisa menjadi/sudah aktif
-- dirujuk Estimate Item — menghapusnya memutus jejak harga historis.

CREATE OR REPLACE FUNCTION fn_price_book_no_delete_verified()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
BEGIN
  IF OLD.status <> 'draft' THEN
    RAISE EXCEPTION
      'Price Book Entry berstatus % tidak boleh dihapus — Estimate Item mungkin '
      'merujuknya. Expire-kan, jangan hapus. (Hanya draft yang boleh dibuang.)',
      OLD.status
      USING ERRCODE = 'restrict_violation';
  END IF;
  RETURN OLD;
END $function$;

DROP TRIGGER IF EXISTS trg_price_book_no_delete_verified ON price_book_entries;
CREATE TRIGGER trg_price_book_no_delete_verified
  BEFORE DELETE ON price_book_entries
  FOR EACH ROW EXECUTE FUNCTION fn_price_book_no_delete_verified();

-- updated_at otomatis.
CREATE OR REPLACE FUNCTION fn_price_book_touch_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END $function$;

DROP TRIGGER IF EXISTS trg_price_book_touch ON price_book_entries;
CREATE TRIGGER trg_price_book_touch
  BEFORE UPDATE ON price_book_entries
  FOR EACH ROW EXECUTE FUNCTION fn_price_book_touch_updated_at();

-- ─── 5. Capability (ADR-004) ────────────────────────────────────────────────
-- `03b` §A.6 Ownership: pemilik fungsional beda per kategori (Material→Procurement,
-- Labor→HR/Payroll, dst) TAPI "struktur seragam". Kepemilikan operasional per
-- kategori diatur lewat SIAPA yang dberi capability (UI, ADR-004) — BUKAN dipecah
-- jadi 4 capability di sini (itu akan meng-hardcode struktur menu, ditolak No-Menu
-- Test). Satu view + satu manage; verifikasi termasuk manage.

INSERT INTO permissions (key, module, label, description, sort_order) VALUES
  ('cecep:price:view',   'cecep', 'Lihat Harga',
   'Melihat Price Book (harga resource ter-versi)', 14),
  ('cecep:price:manage', 'cecep', 'Kelola Harga',
   'Membuat, memverifikasi, mengaktifkan, dan meng-expire entry Price Book', 15)
ON CONFLICT (key) DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r, permissions p
WHERE r.name = 'admin' AND p.key = 'cecep:price:manage'
ON CONFLICT (role_id, permission_id) DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r, permissions p
WHERE r.name IN ('admin', 'pm') AND p.key = 'cecep:price:view'
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- ─── 6. RLS ─────────────────────────────────────────────────────────────────

ALTER TABLE price_book_entries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS price_book_read ON price_book_entries;
CREATE POLICY price_book_read ON price_book_entries
  FOR SELECT USING (has_permission('cecep:price:view'));

DROP POLICY IF EXISTS price_book_write ON price_book_entries;
CREATE POLICY price_book_write ON price_book_entries
  FOR ALL USING (has_permission('cecep:price:manage'))
  WITH CHECK (has_permission('cecep:price:manage'));
