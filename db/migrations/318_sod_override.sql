-- ════════════════════════════════════════════════════════════════════════════
-- 318 — Segregation of Duties: override yang TERCATAT (TJS-P4)
-- ════════════════════════════════════════════════════════════════════════════
--
-- ── Cacat yang diukur 2026-08-12
--
-- `recordApproval` (satu-satunya pintu persetujuan, ADR-007) menerima
-- `approvedBy` dan TIDAK PERNAH membandingkannya dengan pengaju. Sembilan
-- jenis entitas, 18 pemanggilan, nol pengecekan.
--
-- Yang ada hanyalah penanda TAMPILAN: `approval-inbox.ts` mengirim
-- `saya_pengajunya: boolean` dan halamannya menampilkan lencana "pengajuan
-- Anda". Komentar di UI berbunyi *"supaya ia tak membuka dokumennya hanya
-- untuk menemukan tombolnya tak ada"* — mengandaikan ada penolakan di hilir.
--
-- Penolakan itu tidak ada. Rute approve tetap menerima permintaan dari
-- pengajunya sendiri; yang berubah cuma lencananya.
--
-- Ini bentuk cacat yang sama dengan yang sudah berulang di repo ini: gerbang
-- di UI, bukan di server. Tombol yang disembunyikan itu UX, bukan batas
-- keamanan — dan rute API bisa dipanggil langsung.
--
-- ── Kenapa TABEL, bukan `audit_logs`
--
-- `logAuditEvent` fire-and-forget: errornya di-log, tidak pernah di-throw,
-- karena "audit yang gagal tidak boleh menggagalkan aksi bisnis". Benar untuk
-- jejak umum — SALAH untuk override SoD.
--
-- Kriteria TJS-P4 berbunyi *"override MUNGKIN tapi TERCATAT"*. Kalau
-- pencatatannya boleh gagal diam-diam, yang tersisa hanya "override mungkin",
-- dan itu persis larangan tanpa gigi yang hendak dicegah.
--
-- Jadi: baris override ditulis LEBIH DULU, dan approval hanya berjalan kalau
-- penulisannya berhasil. Gagal mencatat = gagal override.
--
-- ── Kenapa override tetap diizinkan
--
-- Catatan QUEUE.yaml: *"Larangan tanpa jalan keluar akan dimatikan orang;
-- larangan yang bisa di-override tapi tercatat bertahan."*
--
-- Puraloka nyata punya proyek yang dijalankan 2-3 orang. Melarang mutlak
-- berarti pada hari direktur satu-satunya sedang cuti, seluruh pengadaan
-- berhenti — dan yang terjadi berikutnya bukan kepatuhan, melainkan seseorang
-- mematikan aturannya, atau lebih buruk: memakai akun orang lain.
--
-- Yang dijaga bukan "tidak pernah terjadi", melainkan "tidak pernah terjadi
-- tanpa jejak".
-- ════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS sod_override (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id    uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,

  -- Entitas yang disetujui oleh pengajunya sendiri.
  entity_type   text NOT NULL,
  entity_id     uuid NOT NULL,
  level         int  NOT NULL,

  -- Orang yang sama di dua peran. Disimpan KEDUANYA meski identik: kalau
  -- suatu saat aturan SoD diperluas (mis. atasan-bawahan langsung), bentuk
  -- barisnya tak perlu berubah, dan baris lama tetap terbaca apa adanya.
  pengaju_id    uuid NOT NULL REFERENCES users(id),
  penyetuju_id  uuid NOT NULL REFERENCES users(id),

  -- Alasan WAJIB dan tak boleh kosong. Override tanpa alasan adalah override
  -- tanpa pertanggungjawaban — tercatat tapi tak bisa dinilai siapa pun.
  alasan        text NOT NULL CHECK (btrim(alasan) <> ''),

  dibuat_pada   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sod_override_company   ON sod_override (company_id, dibuat_pada DESC);
CREATE INDEX IF NOT EXISTS idx_sod_override_entitas   ON sod_override (entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_sod_override_penyetuju ON sod_override (penyetuju_id, dibuat_pada DESC);

-- ── Immutable: jejak yang bisa diedit bukan jejak (Ember [C], CLAUDE.md §5.3)
CREATE OR REPLACE FUNCTION fn_sod_override_immutable() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION
    'sod_override tak bisa diubah atau dihapus — override yang bisa dihapus '
    'sesudahnya membuat seluruh pencatatannya tak berarti.';
END $$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_sod_override_immutable ON sod_override;
CREATE TRIGGER trg_sod_override_immutable
  BEFORE UPDATE OR DELETE ON sod_override
  FOR EACH ROW EXECUTE FUNCTION fn_sod_override_immutable();

-- ── RLS
--
-- T5A (2026-08-12) menemukan 30 tabel MATI TOTAL karena RLS menyala tanpa satu
-- pun policy PERMISSIVE: `(OR semua PERMISSIVE) AND (AND semua RESTRICTIVE)`,
-- dan OR atas himpunan kosong bernilai FALSE. Tabel baru wajib punya
-- policy-nya di migrasi yang sama, bukan "menyusul".
--
-- Bentuk policy MENGIKUTI yang sudah dipakai 313/314 (`has_permission(...)`),
-- bukan karangan baru. Versi pertama berkas ini menulis
-- `company_id = current_tenant_id()` — fungsi yang TIDAK ADA di basis ini
-- maupun di migrasi mana pun. Policy yang memanggil fungsi tak ada gagal saat
-- dievaluasi, dan tabelnya jadi mati dengan cara yang lebih membingungkan
-- daripada tak punya policy sama sekali.
ALTER TABLE sod_override ENABLE ROW LEVEL SECURITY;

--
-- Izin BACA-nya `approval:chains:manage`, diukur dari `permissions` (satu-
-- satunya izin ber-prefiks approval yang ada). Yang berwenang menyusun rantai
-- persetujuan adalah juga yang berkepentingan melihat siapa melewatinya.
--
-- `approval:view` sempat saya tulis di sini — izin yang tidak ada. Policy
-- yang menyebut izin tak terdaftar tidak error: `has_permission` hanya
-- mengembalikan false, dan tabelnya jadi tak terbaca siapa pun. Persis mode
-- kegagalan T5A, dengan penyebab yang lebih halus.
DROP POLICY IF EXISTS sod_override_baca ON sod_override;
CREATE POLICY sod_override_baca ON sod_override
  FOR SELECT USING ((SELECT has_permission('approval:chains:manage')));

DROP POLICY IF EXISTS sod_override_tulis ON sod_override;
CREATE POLICY sod_override_tulis ON sod_override
  FOR INSERT WITH CHECK ((SELECT has_permission('approval:override_sod')));

-- Tak ada policy UPDATE/DELETE: dua-duanya sudah ditolak trigger di atas.
-- Ditulis dua kali dengan sengaja — policy menjaga dari sisi tenant, trigger
-- menjaga dari sisi service-role yang MELEWATI RLS sepenuhnya.

-- ── Izin
--
-- Prefiks diukur dari `permissions` yang ada, bukan ditebak. Kelasnya sama
-- dengan izin lintas-modul lain yang bukan milik satu domain.
-- `sort_order` NOT NULL tanpa DEFAULT — dihitung dari yang ada, bukan
-- dipaku angka. Memaku 999 membuat izin baru berikutnya bertabrakan urutan.
INSERT INTO permissions (key, module, label, description, sort_order)
SELECT 'approval:override_sod', 'approval', 'Override pemisahan wewenang',
       'Menyetujui pengajuan sendiri. Setiap pemakaian tercatat permanen di sod_override beserta alasannya.',
       COALESCE((SELECT max(sort_order) FROM permissions), 0) + 1
 WHERE NOT EXISTS (SELECT 1 FROM permissions WHERE key = 'approval:override_sod');

-- ------------------------------------------------------------
-- Verifikasi — dibuktikan langsung di DB, bukan diandaikan
-- ------------------------------------------------------------
DO $$
DECLARE
  n INT;
  co uuid;
  u1 uuid;
  ov uuid;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM permissions WHERE key = 'approval:override_sod') THEN
    RAISE EXCEPTION '318 gagal: izin approval:override_sod tak terbentuk';
  END IF;

  -- Policy PERMISSIVE wajib ada, kalau tidak tabelnya mati total (T5A).
  SELECT count(*) INTO n
    FROM pg_policy p JOIN pg_class c ON c.oid = p.polrelid
   WHERE c.relname = 'sod_override' AND p.polpermissive;
  IF n < 2 THEN
    RAISE EXCEPTION '318 gagal: sod_override punya % policy PERMISSIVE (butuh >= 2) — tabel akan mati total', n;
  END IF;

  -- Alasan kosong harus DITOLAK.
  SELECT id INTO co FROM companies LIMIT 1;
  SELECT id INTO u1 FROM users LIMIT 1;
  IF co IS NOT NULL AND u1 IS NOT NULL THEN
    BEGIN
      INSERT INTO sod_override (company_id, entity_type, entity_id, level, pengaju_id, penyetuju_id, alasan)
      VALUES (co, '[318-UJI]', gen_random_uuid(), 1, u1, u1, '   ');
      RAISE EXCEPTION '318 gagal: alasan kosong (spasi) DITERIMA — CHECK tak bekerja';
    EXCEPTION WHEN check_violation THEN
      NULL;  -- yang diharapkan
    END;

    -- Baris sah masuk, lalu dibuktikan TAK BISA diubah maupun dihapus.
    INSERT INTO sod_override (company_id, entity_type, entity_id, level, pengaju_id, penyetuju_id, alasan)
    VALUES (co, '[318-UJI]', gen_random_uuid(), 1, u1, u1, 'verifikasi migrasi 318')
    RETURNING id INTO ov;

    BEGIN
      UPDATE sod_override SET alasan = 'diubah' WHERE id = ov;
      RAISE EXCEPTION '318 gagal: baris override BISA diubah — jejaknya tak bernilai';
    EXCEPTION WHEN raise_exception THEN
      IF SQLERRM LIKE '318 gagal%' THEN RAISE; END IF;
    END;

    BEGIN
      DELETE FROM sod_override WHERE id = ov;
      RAISE EXCEPTION '318 gagal: baris override BISA dihapus — jejaknya tak bernilai';
    EXCEPTION WHEN raise_exception THEN
      IF SQLERRM LIKE '318 gagal%' THEN RAISE; END IF;
    END;

    -- Bersihkan baris uji. Trigger menolak DELETE biasa, jadi dimatikan
    -- sesaat — inilah alasan verifikasi ini aman: ia berjalan di dalam
    -- transaksi migrasi, bukan di jalur aplikasi.
    ALTER TABLE sod_override DISABLE TRIGGER trg_sod_override_immutable;
    DELETE FROM sod_override WHERE entity_type = '[318-UJI]';
    ALTER TABLE sod_override ENABLE TRIGGER trg_sod_override_immutable;
  ELSE
    RAISE NOTICE '318: basis tanpa company/user — verifikasi perilaku dilewati';
  END IF;

  RAISE NOTICE '318 OK — sod_override ada, immutable, ber-RLS, alasan wajib';
END $$;
