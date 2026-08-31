-- ============================================================================
-- 539 · Peta peran dibenahi — klien & mandor melihat pembukuan, direktur tidak
-- ============================================================================
--
-- ══════════════════════════════════════════════════════════════════════════
-- TIGA TEMUAN, DIUKUR 2026-08-29
-- ══════════════════════════════════════════════════════════════════════════
--
-- ── 1. `client` melihat buku besar perusahaan
--
-- Klien adalah PIHAK LUAR yang membayar kontraktor. Peran `client` memegang:
--
--     gl:view            'bagan akun, jurnal, dan buku besar'
--     gudang:susut:view  'pemetaan AHSP↔gudang dan rencana susut per material'
--     assets:view        'register aset, mutasi, penyusutan, sewa alat'
--     gudang:view        'isi gudang dan riwayat pergerakannya'
--     finance:view       'dashboard keuangan, invoice, kasbon'
--
-- `gudang:susut:view` yang paling mahal: rencana susut material adalah MARGIN
-- kontraktor. Klien yang melihatnya tahu persis berapa yang dilebihkan.
--
-- Yang membuat ini bukan kekhawatiran teoretis: rute GL dijaga HANYA
-- `requirePermission('gl:view')` — tak ada pemeriksaan peran tambahan. Middleware
-- Next.js menahan klien di `/portal`, tetapi itu menjaga HALAMAN, bukan API.
-- Klien yang memanggil `GET /api/v1/gl/…` dengan tokennya sendiri menerima
-- jawabannya. Diverifikasi lewat `get_role_permissions('client')` — fungsi yang
-- SAMA yang dipakai gerbang API, bukan dari membaca kode.
--
-- Ada 3 akun `client` aktif, dua beralamat Gmail. Orang sungguhan.
--
-- ── 2. `mandor` memegang empat izin yang sama, dan TAK SATU PUN dipakai
--
-- Mandor adalah pekerja lapangan. Ia memegang `gl:view`, `assets:view`,
-- `gudang:susut:view`, `finance:view` — dan `mandor-portal` (18 halaman) tak
-- memanggil satu pun rute `gl`, `assets`, atau `finance`. Diukur: nol.
--
-- `gudang:view` DIPERTAHANKAN untuk mandor — ia perlu tahu stok material di
-- proyeknya. Itu bedanya dengan klien, yang tak punya urusan dengan gudang.
--
-- ── 3. `direktur` melihat lebih sedikit daripada `admin`
--
--     admin     227 dari 230 izin
--     direktur  143              ← 84 kurang
--     pm        136              ← nyaris setara direktur
--
-- Jabatan tertinggi melihat lebih sedikit daripada admin, dan hampir sama
-- dengan PM. Yang hilang termasuk `audit:view`, `change_order:approve`,
-- `finance:manage`, `gl:post`, `approval:chains:manage` — semuanya wajar bagi
-- direktur.
--
-- ══════════════════════════════════════════════════════════════════════════
-- YANG DILAKUKAN, DAN YANG SENGAJA TIDAK
-- ══════════════════════════════════════════════════════════════════════════
--
-- Direktur disamakan dengan admin PER COMPANY — bukan disalin dari template ke
-- semua tenant. Alasannya: tenant boleh mengubah peran adminnya sendiri (peran
-- adalah data konfigurasi per-tenant, ADR-004), jadi menyalin template akan
-- MENIMPA kurasi yang mungkin sudah mereka lakukan.
--
-- Tiga izin yang TAK DIPEGANG SIAPA PUN tetap tak dipegang siapa pun:
--
--     approval:override_sod  menyetujui pengajuan SENDIRI — memberikannya ke
--                            direktur membuat seluruh rantai approval jadi
--                            hiasan, dan pemisahan tugas adalah pengendalian
--                            internal, bukan formalitas
--     mitra:daftar_hitam     menutup penghidupan orang; lewat proses, bukan
--                            satu klik
--     otomasi:umpan:baca     untuk akun MESIN (penjadwal), bukan manusia
--
-- Ketiganya tetap bisa diberikan lewat UI pengaturan peran. Yang diputuskan di
-- sini hanya BAWAANNYA.
--
-- Delapan peran lain TIDAK DISENTUH — `akuntan`, `auditor_internal`, `qaqc`,
-- `k3_officer`, `estimator`, `hrd`, `site_manager`, `manajer_keuangan` sudah
-- konsisten dengan tugasnya. Yang ber-izin sedikit (`payroll_officer` 6,
-- `penagihan` 7, `kasir` 9) memang peran sempit, dan izinnya tepat sasaran.
--
-- ── Cakupan: template DAN 72 tenant
--
-- Ada 1.440 role bawaan tersalin di 72 company. Memperbaiki template saja
-- berarti kebocoran klien TETAP TERBUKA di semua perusahaan yang sudah ada —
-- tenant baru lahir benar, yang lama tidak. Karena itu keduanya.
--
-- ── Idempoten: DELETE yang sudah tak ada = 0 baris; INSERT memakai
--    ON CONFLICT DO NOTHING.
-- ============================================================================

DO $$
DECLARE
  n_client   int;
  n_mandor   int;
  n_direktur int;
  n_sisa     int;
BEGIN
  -- ── 1. Cabut dari `client` ────────────────────────────────────────────
  --
  -- Lima izin, template + seluruh tenant. Diukur sebelum migrasi: 365 baris.
  WITH dibuang AS (
    DELETE FROM role_permissions rp
     USING roles r, permissions p
     WHERE rp.role_id = r.id
       AND rp.permission_id = p.id
       AND r.name = 'client'
       AND p.key IN ('gl:view', 'assets:view', 'gudang:view',
                     'gudang:susut:view', 'finance:view')
    RETURNING 1
  )
  SELECT count(*) INTO n_client FROM dibuang;

  -- ── 2. Cabut dari `mandor` ────────────────────────────────────────────
  --
  -- EMPAT, bukan lima: `gudang:view` dipertahankan karena mandor perlu tahu
  -- stok material di proyeknya.
  WITH dibuang AS (
    DELETE FROM role_permissions rp
     USING roles r, permissions p
     WHERE rp.role_id = r.id
       AND rp.permission_id = p.id
       AND r.name = 'mandor'
       AND p.key IN ('gl:view', 'assets:view',
                     'gudang:susut:view', 'finance:view')
    RETURNING 1
  )
  SELECT count(*) INTO n_mandor FROM dibuang;

  -- ── 3. Samakan `direktur` dengan `admin`, per company ─────────────────
  --
  -- `IS NOT DISTINCT FROM` — bukan `=` — supaya baris template (company_id
  -- NULL) cocok dengan template, dan tenant cocok dengan tenantnya sendiri.
  -- Dengan `=`, NULL = NULL bernilai NULL dan template TIDAK IKUT diperbaiki:
  -- tenant baru akan lahir dengan direktur 143 izin lagi.
  WITH ditambah AS (
    INSERT INTO role_permissions (role_id, permission_id)
    SELECT rd.id, p.id
      FROM roles rd
      JOIN roles ra
        ON ra.name = 'admin'
       AND ra.company_id IS NOT DISTINCT FROM rd.company_id
      JOIN role_permissions rpa ON rpa.role_id = ra.id
      JOIN permissions p ON p.id = rpa.permission_id
     WHERE rd.name = 'direktur'
    ON CONFLICT DO NOTHING
    RETURNING 1
  )
  SELECT count(*) INTO n_direktur FROM ditambah;

  -- ══ VERIFIKASI ════════════════════════════════════════════════════════
  --
  -- Migrasi yang melaporkan sukses tanpa memeriksa hasilnya adalah harapan.
  -- Ketiga pemeriksaan di bawah menyatakan KEADAAN AKHIR, bukan jumlah baris
  -- yang tersentuh — jumlah bisa nol karena sudah benar, atau nol karena
  -- kondisinya salah tulis, dan keduanya terlihat sama.

  /* 1. Nol izin pembukuan tersisa di client — di company MANA PUN. */
  SELECT count(*) INTO n_sisa
    FROM roles r
    JOIN role_permissions rp ON rp.role_id = r.id
    JOIN permissions p ON p.id = rp.permission_id
   WHERE r.name = 'client'
     AND p.key IN ('gl:view', 'assets:view', 'gudang:view',
                   'gudang:susut:view', 'finance:view');
  IF n_sisa > 0 THEN
    RAISE EXCEPTION
      '539 gagal: client masih memegang % izin pembukuan/gudang', n_sisa;
  END IF;

  /* 2. Nol izin pembukuan tersisa di mandor (gudang:view dikecualikan). */
  SELECT count(*) INTO n_sisa
    FROM roles r
    JOIN role_permissions rp ON rp.role_id = r.id
    JOIN permissions p ON p.id = rp.permission_id
   WHERE r.name = 'mandor'
     AND p.key IN ('gl:view', 'assets:view', 'gudang:susut:view', 'finance:view');
  IF n_sisa > 0 THEN
    RAISE EXCEPTION
      '539 gagal: mandor masih memegang % izin pembukuan', n_sisa;
  END IF;

  /* 3. Tak ada company yang direkturnya masih tertinggal dari adminnya. */
  SELECT count(*) INTO n_sisa
    FROM roles rd
    JOIN roles ra
      ON ra.name = 'admin'
     AND ra.company_id IS NOT DISTINCT FROM rd.company_id
   WHERE rd.name = 'direktur'
     AND EXISTS (
       SELECT 1 FROM role_permissions rpa
        WHERE rpa.role_id = ra.id
          AND NOT EXISTS (SELECT 1 FROM role_permissions rpd
                           WHERE rpd.role_id = rd.id
                             AND rpd.permission_id = rpa.permission_id));
  IF n_sisa > 0 THEN
    RAISE EXCEPTION
      '539 gagal: % company punya direktur yang izinnya tertinggal dari admin', n_sisa;
  END IF;

  /* 4. Ketiga izin berbahaya TETAP tak dipegang siapa pun. */
  SELECT count(*) INTO n_sisa
    FROM role_permissions rp
    JOIN permissions p ON p.id = rp.permission_id
   WHERE p.key IN ('approval:override_sod', 'mitra:daftar_hitam');
  IF n_sisa > 0 THEN
    RAISE EXCEPTION
      '539 gagal: % pemegang izin yang seharusnya kosong (override_sod / daftar_hitam)',
      n_sisa;
  END IF;

  RAISE NOTICE
    '539 OK: client -% izin, mandor -% izin, direktur +% izin; verifikasi 4/4 lulus',
    n_client, n_mandor, n_direktur;
END $$;
