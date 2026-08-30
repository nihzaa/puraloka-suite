-- ════════════════════════════════════════════════════════════════════════════
-- 335 — Template WBS (F2): tiga lubang tenancy, dan struktur yang diketik ulang
-- ════════════════════════════════════════════════════════════════════════════
--
-- ── Lubang yang ditutup, diukur 2026-08-12
--
-- 13 dari 15 proyek punya NOL item RAB. Dua yang terisi punya 285 dan 88 item,
-- dan **8 dari 16 kategori uniknya identik** — "PEKERJAAN PERSIAPAN",
-- "PEKERJAAN BETON", "PEKERJAAN PASANGAN", dan seterusnya, diketik ulang kata
-- demi kata.
--
-- `cbs_templates` + `cbs_nodes` sudah ada untuk persis itu. Isinya: SATU baris
-- bernama "Smoke" berstatus `superseded`, dua node. Nol pembaca di seluruh
-- kode — hanya peta tenancy dan peta menu yang menyebutnya. Pola yang sama
-- dengan `requires_opname` (D1) dan lima kolom kontrak `work_scopes` (E1):
-- schema yang menjanjikan kemampuan, tak pernah dipakai.
--
-- ── TIGA lubang tenancy yang ketahuan saat mengukur
--
-- **1. `WITH CHECK` mengizinkan `company_id IS NULL` saat MENULIS.**
--
--     tenant_isolation: (company_id IS NULL OR company_id = auth_company_id())
--
-- Itu benar untuk MEMBACA — template `standard` adalah katalog bersama yang
-- memang terlihat semua tenant. Tetapi pada WITH CHECK ia berarti tenant mana
-- pun bisa MEMBUAT baris ber-company NULL, dan baris itu langsung terlihat
-- seluruh tenant lain. Struktur pekerjaan satu perusahaan bocor ke pesaingnya
-- tanpa satu pun galat.
--
-- Diperbaiki dengan memisahkan: baca boleh melihat NULL, tulis TIDAK boleh
-- menghasilkan NULL kecuali `source = 'standard'` (katalog yang memang milik
-- bersama, dan hanya bisa ditulis lewat migrasi).
--
-- **2. `cbs_template_identity` UNIQUE (code, version_number) — tanpa company.**
--
-- Tenant B ditolak kode yang dipakai tenant A, dan penolakannya membocorkan
-- bahwa kode itu ada di tenant lain. Cacat #4 migrasi 135, dan cacat yang
-- sama baru ditutup F1 di tiga tabel lain.
--
-- **3. `FORCE ROW LEVEL SECURITY` mati.**
--
-- Tanpa FORCE, pemilik tabel MELEWATI RLS sepenuhnya. Rute yang memakai
-- service-role — dan repo ini punya banyak — membaca lintas tenant tanpa
-- gerbang. Diukur: `serah_terima` (E2) punya FORCE, ketiga tabel WBS tidak.
--
-- ── Yang TIDAK dibangun di sini
--
-- Tabel baru. `cbs_templates`/`cbs_nodes` sudah punya bentuk yang benar
-- (pohon ber-parent, kode, versi, status draft/active/superseded). Membuat
-- tabel kelima untuk hal yang sama berarti dua kebenaran tentang "apa itu
-- template struktur pekerjaan" — dan dua kebenaran cepat atau lambat berbeda.
-- ════════════════════════════════════════════════════════════════════════════

-- ── 1. FORCE RLS ────────────────────────────────────────────────────────────
ALTER TABLE cbs_templates FORCE ROW LEVEL SECURITY;
ALTER TABLE cbs_nodes     FORCE ROW LEVEL SECURITY;
ALTER TABLE wbs_nodes     FORCE ROW LEVEL SECURITY;

-- ── 2. Unik per-tenant ──────────────────────────────────────────────────────
--
-- `company_id` NULL diperlakukan sebagai satu kelompok tersendiri (katalog
-- standard), dan NULLS NOT DISTINCT membuatnya benar-benar unik di sana —
-- tanpa itu, dua template standard berkode sama lolos karena NULL <> NULL.
ALTER TABLE cbs_templates DROP CONSTRAINT IF EXISTS cbs_template_identity;
DROP INDEX IF EXISTS cbs_template_identity;
CREATE UNIQUE INDEX IF NOT EXISTS cbs_template_identity_per_tenant
  ON cbs_templates (company_id, code, version_number) NULLS NOT DISTINCT;

-- ── 2b. Baris warisan yang melanggar aturan barunya ─────────────────────────
--
-- Diukur: SATU template `CBS-SMOKE` (source `company`, status `superseded`,
-- company_id NULL) — sisa smoke test 2026-07-24.
--
-- TIDAK diperbaiki datanya, dan bukan karena malas: `fn_cbs_template_immutable`
-- (yang sudah ada sejak awal) MELARANG mengubah `source` pada template
-- non-draft, dan trigger itu benar — Estimate Item yang merujuk nodenya tak
-- boleh berubah retroaktif. Melemahkannya demi migrasi ini berarti menukar
-- jaminan lama dengan kerapian baru.
--
-- Jadi CHECK-nya yang mengenali warisan: baris `superseded` dikecualikan.
-- Ia tak bisa dipakai membuat apa pun (statusnya terminal), tak muncul sebagai
-- pilihan, dan tak bisa diubah. Yang dijaga CHECK adalah baris BARU.

-- ── 3. Menulis TIDAK boleh menghasilkan company_id NULL ───────────────────── menghasilkan company_id NULL ─────────────────────
--
-- Kecuali `source = 'standard'`: katalog bersama yang ditulis lewat migrasi,
-- bukan lewat UI. Yang membedakan keduanya bukan izin melainkan ASAL — dan
-- asal itu tercatat di kolomnya sendiri.
ALTER TABLE cbs_templates DROP CONSTRAINT IF EXISTS cbs_templates_tenant_wajar;
ALTER TABLE cbs_templates
  ADD CONSTRAINT cbs_templates_tenant_wajar
  CHECK (
    company_id IS NOT NULL
    OR source = 'standard'
    -- Warisan: baris `superseded` ber-company NULL dari sebelum aturan ini.
    -- Statusnya terminal, jadi ia tak bisa dipakai membuat apa pun.
    OR status = 'superseded'
  );

ALTER TABLE cbs_nodes DROP CONSTRAINT IF EXISTS cbs_nodes_tenant_wajar;
ALTER TABLE cbs_nodes
  ADD CONSTRAINT cbs_nodes_tenant_wajar
  CHECK (company_id IS NOT NULL OR template_id IN (
    -- Subquery TAK BISA dipakai di CHECK Postgres. Node warisan dikenali dari
    -- template_id-nya secara harfiah — daftar yang tak akan bertambah, karena
    -- baris baru wajib bercompany.
    '47f1c283-1743-4b65-b542-c7663792e21c'::uuid
  ));

-- Policy tulis: NULL hanya lolos untuk katalog standard.
DROP POLICY IF EXISTS tenant_isolation ON cbs_templates;
CREATE POLICY tenant_isolation ON cbs_templates
  FOR ALL
  -- BACA: NULL terlihat (katalog bersama). Ini yang dipakai memilih template
  -- standard sebagai dasar template perusahaan sendiri.
  USING (company_id IS NULL OR company_id = (SELECT auth_company_id()))
  -- TULIS: NULL DITOLAK. Tanpa ini, tenant mana pun bisa membuat baris yang
  -- terlihat seluruh tenant lain.
  WITH CHECK (company_id = (SELECT auth_company_id()));

DROP POLICY IF EXISTS tenant_isolation ON cbs_nodes;
CREATE POLICY tenant_isolation ON cbs_nodes
  FOR ALL
  USING (company_id IS NULL OR company_id = (SELECT auth_company_id()))
  WITH CHECK (company_id = (SELECT auth_company_id()));

-- ── 4. Node WAJIB sekompanyi dengan templatenya ─────────────────────────────
--
-- Node tenant A yang menggantung di template tenant B akan muncul di layar
-- tenant B: pohonnya dibaca lewat `template_id`, dan tak ada gerbang di antara.
--
-- HANYA ini yang ditambahkan. Dua hal lain yang sempat saya tulis ternyata
-- SUDAH ditegakkan `fn_cbs_node_guard` sejak awal:
--
--   · struktur template non-draft beku ("buat versi Template baru")
--   · induk node wajib di template yang sama
--
-- Menambahkan trigger kedua untuk aturan yang sama berarti dua tempat yang
-- bisa berselisih, dan dua pesan galat berbeda untuk satu pelanggaran. Yang
-- lama dibiarkan memegangnya.
CREATE OR REPLACE FUNCTION fn_cbs_node_sekompanyi()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_company UUID;
BEGIN
  SELECT company_id INTO v_company FROM cbs_templates WHERE id = NEW.template_id;

  IF NEW.company_id IS DISTINCT FROM v_company THEN
    RAISE EXCEPTION
      'Node CBS milik company yang berbeda dari templatenya — struktur satu perusahaan akan muncul di layar perusahaan lain'
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_cbs_node_sekompanyi ON cbs_nodes;
CREATE TRIGGER trg_cbs_node_sekompanyi
  BEFORE INSERT OR UPDATE OF template_id, company_id ON cbs_nodes
  FOR EACH ROW EXECUTE FUNCTION fn_cbs_node_sekompanyi();

-- ── 6. Satu versi AKTIF per kode ────────────────────────────────────────────
--
-- Dua versi aktif berkode sama berarti "template PERUMAHAN" menunjuk dua
-- struktur berbeda, dan yang terpilih bergantung urutan baris — yang tak
-- dijamin apa pun.
CREATE UNIQUE INDEX IF NOT EXISTS cbs_template_satu_aktif
  ON cbs_templates (company_id, code) NULLS NOT DISTINCT
  WHERE status = 'active';

-- ── 7. Izin ─────────────────────────────────────────────────────────────────
--
-- `cecep:cbs:view` / `cecep:cbs:manage` SUDAH ADA dan sudah dipakai policy.
-- Tidak dibuat yang baru: dua izin untuk hal yang sama menghasilkan dua
-- kebenaran tentang siapa berwenang (pelajaran 289).
--
-- Yang diperiksa: keduanya benar-benar diberikan. Izin yang tak diberikan
-- membuat rutenya 403 untuk semua orang termasuk admin (cacat migrasi 321).
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
  FROM roles r
  CROSS JOIN permissions p
 WHERE p.key IN ('cecep:cbs:view', 'cecep:cbs:manage')
   AND EXISTS (
     SELECT 1 FROM role_permissions rp
       JOIN permissions pe ON pe.id = rp.permission_id
      WHERE rp.role_id = r.id AND pe.key = 'settings:manage'
   )
   AND NOT EXISTS (
     SELECT 1 FROM role_permissions x WHERE x.role_id = r.id AND x.permission_id = p.id
   );

-- ------------------------------------------------------------
-- Verifikasi
-- ------------------------------------------------------------
DO $$
DECLARE
  co    UUID;
  co2   UUID;
  t1    UUID;
  n1    UUID;
  n     INT;
  gagal BOOLEAN;
  co2_dibuat BOOLEAN := FALSE;
BEGIN
  SELECT id INTO co FROM companies ORDER BY created_at LIMIT 1;
  SELECT id INTO co2 FROM companies WHERE id <> co LIMIT 1;

  /*
    ⚠ COMPANY KEDUA DIBUAT SENDIRI BILA TAK ADA — DIPERBAIKI 2026-08-31.

    Versi sebelumnya menyerah:

        HARD FAIL — 335_template_wbs.sql
          335 gagal: butuh dua company untuk menguji isolasi —
                     verifikasi tak bisa dipercaya

    Kalimat itu benar sebagai penilaian: verifikasi isolasi tenant memang tak
    berarti apa-apa dengan satu tenant. Yang keliru kesimpulannya — ia
    menghentikan SELURUH rantai migrasi di lingkungan baru mana pun, karena
    basis yang baru lahir memang cuma punya satu company. CI, VPS baru, mesin
    developer baru: semuanya.

    Menyerah bukan satu-satunya pilihan. Verifikasi ini sudah membuat dan
    membuang fixture-nya sendiri (blok "Bersihkan" di bawah), jadi ia boleh
    membuat tenant kedua dengan cara yang sama.

    `co2_dibuat` menandai supaya yang dibuat di sini DIBUANG lagi, dan tenant
    yang memang sudah ada tak pernah tersentuh.
  */
  IF co IS NULL THEN
    RAISE EXCEPTION '335 gagal: nol company — basis belum berisi apa pun';
  END IF;

  IF co2 IS NULL THEN
    INSERT INTO companies (code, name)
    VALUES ('verif335-tenant-kedua', 'Tenant uji isolasi 335')
    RETURNING id INTO co2;
    co2_dibuat := TRUE;
    RAISE NOTICE '335: company kedua dibuat sementara untuk menguji isolasi tenant.';
  END IF;

  -- 1. FORCE RLS menyala di ketiganya.
  SELECT count(*) INTO n FROM pg_class
   WHERE relname IN ('cbs_templates', 'cbs_nodes', 'wbs_nodes') AND relforcerowsecurity;
  IF n <> 3 THEN
    RAISE EXCEPTION '335 gagal: % dari 3 tabel ber-FORCE RLS — pemilik tabel melewati gerbang', n;
  END IF;

  -- 2. Template ber-company NULL DITOLAK kecuali standard.
  gagal := FALSE;
  BEGIN
    INSERT INTO cbs_templates (code, name, source, version_number, status, company_id)
    VALUES ('VERIF335-NULL', 'uji', 'company', 1, 'draft', NULL);
  EXCEPTION WHEN check_violation THEN gagal := TRUE;
  END;
  IF NOT gagal THEN
    RAISE EXCEPTION '335 gagal: template company ber-company_id NULL DITERIMA — ia terlihat seluruh tenant';
  END IF;

  -- 3. Template standard ber-NULL tetap boleh (katalog bersama).
  INSERT INTO cbs_templates (code, name, source, version_number, status, company_id)
  VALUES ('VERIF335-STD', 'uji standard', 'standard', 1, 'draft', NULL);

  -- 4. Kode SAMA di dua tenant DITERIMA — itu inti perbaikan unik.
  INSERT INTO cbs_templates (code, name, source, version_number, status, company_id)
  VALUES ('VERIF335-SAMA', 'uji A', 'company', 1, 'draft', co) RETURNING id INTO t1;
  INSERT INTO cbs_templates (code, name, source, version_number, status, company_id)
  VALUES ('VERIF335-SAMA', 'uji B', 'company', 1, 'draft', co2);

  -- 5. Kode sama DI TENANT YANG SAMA tetap ditolak.
  gagal := FALSE;
  BEGIN
    INSERT INTO cbs_templates (code, name, source, version_number, status, company_id)
    VALUES ('VERIF335-SAMA', 'uji A2', 'company', 1, 'draft', co);
  EXCEPTION WHEN unique_violation THEN gagal := TRUE;
  END;
  IF NOT gagal THEN
    RAISE EXCEPTION '335 gagal: kode+versi kembar DALAM SATU tenant diterima';
  END IF;

  -- 6. Node ber-company BEDA dari templatenya DITOLAK.
  gagal := FALSE;
  BEGIN
    INSERT INTO cbs_nodes (template_id, name, sort_order, company_id)
    VALUES (t1, 'node asing', 1, co2);
  EXCEPTION WHEN check_violation THEN gagal := TRUE;
  END;
  IF NOT gagal THEN
    RAISE EXCEPTION '335 gagal: node ber-company beda dari templatenya DITERIMA';
  END IF;

  -- 7. Node sekompanyi diterima, dan anaknya menempel.
  INSERT INTO cbs_nodes (template_id, name, sort_order, company_id)
  VALUES (t1, 'PEKERJAAN PERSIAPAN', 1, co) RETURNING id INTO n1;
  INSERT INTO cbs_nodes (template_id, parent_id, name, sort_order, company_id)
  VALUES (t1, n1, 'Bouwplank', 1, co);

  -- 8. Induk dari template LAIN ditolak.
  --
  -- Dijaga `fn_cbs_node_guard` yang SUDAH ADA, bukan oleh migrasi ini —
  -- diverifikasi di sini karena F2 bergantung padanya, dan jaminan yang
  -- dipakai tanpa diperiksa adalah jaminan yang bisa hilang tanpa disadari.
  gagal := FALSE;
  BEGIN
    INSERT INTO cbs_nodes (template_id, parent_id, name, sort_order, company_id)
    SELECT id, n1, 'anak salah induk', 1, co
      FROM cbs_templates WHERE code = 'VERIF335-STD';
  EXCEPTION WHEN check_violation THEN gagal := TRUE;
  END;
  IF NOT gagal THEN
    RAISE EXCEPTION '335 gagal: induk node dari template LAIN diterima';
  END IF;

  -- 9. Template AKTIF terkunci strukturnya — juga `fn_cbs_node_guard`.
  UPDATE cbs_templates SET status = 'active', activated_at = now() WHERE id = t1;
  gagal := FALSE;
  BEGIN
    INSERT INTO cbs_nodes (template_id, name, sort_order, company_id)
    VALUES (t1, 'sisipan setelah aktif', 9, co);
  EXCEPTION WHEN check_violation THEN gagal := TRUE;
  END;
  IF NOT gagal THEN
    RAISE EXCEPTION '335 gagal: struktur template AKTIF masih bisa diubah';
  END IF;

  -- 10. Menghapus node template aktif juga ditolak.
  gagal := FALSE;
  BEGIN
    DELETE FROM cbs_nodes WHERE id = n1;
  EXCEPTION WHEN check_violation THEN gagal := TRUE;
  END;
  IF NOT gagal THEN
    RAISE EXCEPTION '335 gagal: node template AKTIF bisa DIHAPUS';
  END IF;

  -- 11. Dua versi AKTIF berkode sama ditolak.
  INSERT INTO cbs_templates (code, name, source, version_number, status, company_id)
  VALUES ('VERIF335-SAMA', 'uji A v2', 'company', 2, 'draft', co);
  gagal := FALSE;
  BEGIN
    UPDATE cbs_templates SET status = 'active'
     WHERE code = 'VERIF335-SAMA' AND version_number = 2 AND company_id = co;
  EXCEPTION WHEN unique_violation THEN gagal := TRUE;
  END;
  IF NOT gagal THEN
    RAISE EXCEPTION '335 gagal: dua versi AKTIF berkode sama diterima — mana yang dipakai tak tentu';
  END IF;

  -- Bersihkan.
  --
  -- Status TAK BISA mundur (`fn_cbs_template_status_transition`: maju saja),
  -- jadi node template yang sudah aktif tak bisa dihapus lewat jalur biasa —
  -- dan itu memang jaminannya. Trigger dinonaktifkan HANYA untuk sesi ini,
  -- di dalam transaksi verifikasi, semata untuk membersihkan fixture.
  SET LOCAL session_replication_role = 'replica';
  DELETE FROM cbs_nodes WHERE template_id IN (SELECT id FROM cbs_templates WHERE code LIKE 'VERIF335-%');
  DELETE FROM cbs_templates WHERE code LIKE 'VERIF335-%';
  SET LOCAL session_replication_role = 'origin';

  /*
    Tenant uji dibuang bila memang KITA yang membuatnya. Tenant yang sudah ada
    sebelum migrasi ini tak pernah disentuh.

    `session_replication_role = 'replica'` diperlukan: ada trigger yang menolak
    penghapusan company mana pun —

        Company "..." tidak boleh dihapus. Nonaktifkan (is_active=false)
        atau jalankan prosedur off-boarding tenant.

    — dan penjagaan itu memang benar untuk tenant sungguhan. Yang dihapus di
    sini baris yang lahir beberapa pernyataan sebelumnya di transaksi yang
    sama, semata sebagai fixture. Polanya sama dengan pembersihan cbs_nodes di
    atas, dan lingkupnya `LOCAL` — tak keluar dari transaksi ini.
  */
  IF co2_dibuat THEN
    SET LOCAL session_replication_role = 'replica';
    DELETE FROM companies WHERE id = co2;
    SET LOCAL session_replication_role = 'origin';
  END IF;

  -- 12. Izin diberikan.
  SELECT count(*) INTO n
    FROM permissions p
   WHERE p.key IN ('cecep:cbs:view', 'cecep:cbs:manage')
     AND NOT EXISTS (SELECT 1 FROM role_permissions rp WHERE rp.permission_id = p.id);
  IF n > 0 THEN
    RAISE EXCEPTION '335 gagal: % izin CBS tak diberikan ke peran mana pun', n;
  END IF;

  RAISE NOTICE '335 OK — FORCE RLS, unik per-tenant, node sekompanyi, template aktif terkunci';
END $$;
