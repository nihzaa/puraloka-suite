-- ════════════════════════════════════════════════════════════════════════════
-- 330 — Rantai persetujuan: VERIFIKASI OPNAME (D1) & BACK-CHARGE (D3)
-- ════════════════════════════════════════════════════════════════════════════
--
-- ── Kenapa migrasi ini ada: saya melewatkan penjaganya
--
-- `audit-approval-satu-pintu.mjs` merah dengan dua pintu baru:
--
--     back-charge.ts:     0 → 1   (`disetujui_oleh` ditulis langsung)
--     opname-bersama.ts:  0 → 1   (`diverifikasi_oleh` ditulis langsung)
--
-- Keduanya lolos ke commit 35938928 (D1) dan f2a1076e (D3) karena saya
-- menjalankan tujuh penjaga API dan penjaga ini TIDAK termasuk. Bukan
-- penjaganya yang buta — saya yang tak menjalankannya.
--
-- ── Kenapa keduanya memang keputusan berjenjang, bukan sekadar penanda
--
-- Uji yang dipakai: apakah kolomnya membuka pintu UANG?
--
--   back-charge      MEMOTONG pembayaran subkon. Rp 8 juta hilang dari yang
--                    diterima mandor karena satu ketukan. Ini persis kelas
--                    keputusan yang sebagian tenant tuntut disetujui dua
--                    lapis: pelaksana yang mengusulkan, keuangan yang
--                    membebankan.
--
--   verifikasi       MEMBUKA pintu pembayaran. Sesudah D1, pembayaran
--   opname           borongan/progress_pct DITOLAK tanpa opname terverifikasi
--                    — jadi tanda tangan verifikasi ITULAH yang mencairkan
--                    uang, bukan tombol bayarnya.
--
-- Keduanya lulus. Kalau tidak lulus, jawabannya bukan menambah rantai
-- melainkan mengganti nama kolomnya (penjaga menyarankan itu eksplisit).
--
-- ── Kenapa migrasi WAJIB menyertai perubahan kode
--
-- `loadSteps()` fail-closed: rantai tak ada atau `is_active = false`
-- menghasilkan `steps.length === 0`, dan NOL orang bisa menyetujui. Jadi
-- menambah `ApprovalEntityType` tanpa migrasi ini tidak "memperketat" —
-- ia MELUMPUHKAN kedua modul secara diam-diam, dan halaman pengaturannya
-- tetap terlihat wajar karena memang tak ada yang salah di sana.
--
-- ── Kenapa hanya company yang SUDAH punya rantai lain (bukan 291-nya)
--
-- Pola 282/289. `SELECT DISTINCT ... FROM approval_chains` membatasi ke
-- tenant yang approval-nya memang sudah dipakai. Tenant tanpa rantai apa pun
-- belum memakai mekanisme ini sama sekali; memasangkan rantai ke 291
-- perusahaan berarti menyalakan gerbang di tenant yang tak pernah memintanya.
--
-- ── Kenapa `min_amount` NULL untuk opname, TIDAK untuk back-charge
--
-- Opname mengukur PERSEN pekerjaan, bukan rupiah — `min_amount` tak punya
-- makna di sana (pola `submittal`, `rencana_mutu`, `cuti_karyawan`).
--
-- Back-charge bernominal rupiah nyata, tetapi ambangnya tetap NULL di sini:
-- memilih angka ambang adalah keputusan tenant, dan menebakkannya dari
-- migrasi berarti memutuskan kebijakan keuangan orang lain. NULL = berlaku
-- untuk semua nominal; tenant menaikkannya sendiri lewat halaman pengaturan.
--
-- ── Permission: yang SUDAH ada, bukan yang baru
--
-- `opname:verifikasi` (325) dan `backcharge:setujui` (327) sudah dipakai
-- `requirePermission` di rutenya. Permission kedua untuk hal yang sama
-- menghasilkan dua kebenaran tentang siapa berwenang — dan dua kebenaran
-- cepat atau lambat berbeda (289).
-- ════════════════════════════════════════════════════════════════════════════

-- ── 1. Verifikasi opname ────────────────────────────────────────────────────
INSERT INTO approval_chains (entity_type, label, is_active, company_id)
SELECT DISTINCT 'opname_bersama', 'Verifikasi Opname Bersama', TRUE, ch.company_id
  FROM approval_chains ch
  JOIN companies co ON co.id = ch.company_id
 WHERE NOT EXISTS (
   SELECT 1 FROM approval_chains x
    WHERE x.entity_type = 'opname_bersama' AND x.company_id = ch.company_id
 );

INSERT INTO approval_steps (chain_id, level, required_permission, min_amount, label, company_id)
SELECT ch.id, 1, 'opname:verifikasi', NULL, 'Verifikasi berita acara', ch.company_id
  FROM approval_chains ch
 WHERE ch.entity_type = 'opname_bersama'
   AND NOT EXISTS (
     SELECT 1 FROM approval_steps st WHERE st.chain_id = ch.id AND st.level = 1
   );

-- ── 2. Back-charge ──────────────────────────────────────────────────────────
INSERT INTO approval_chains (entity_type, label, is_active, company_id)
SELECT DISTINCT 'back_charge', 'Persetujuan Back-Charge', TRUE, ch.company_id
  FROM approval_chains ch
  JOIN companies co ON co.id = ch.company_id
 WHERE NOT EXISTS (
   SELECT 1 FROM approval_chains x
    WHERE x.entity_type = 'back_charge' AND x.company_id = ch.company_id
 );

INSERT INTO approval_steps (chain_id, level, required_permission, min_amount, label, company_id)
SELECT ch.id, 1, 'backcharge:setujui', NULL, 'Persetujuan pembebanan', ch.company_id
  FROM approval_chains ch
 WHERE ch.entity_type = 'back_charge'
   AND NOT EXISTS (
     SELECT 1 FROM approval_steps st WHERE st.chain_id = ch.id AND st.level = 1
   );

-- ------------------------------------------------------------
-- Verifikasi
-- ------------------------------------------------------------
DO $$
DECLARE
  jenis   TEXT;
  n_rantai INT;
  n_tanpa  INT;
BEGIN
  FOREACH jenis IN ARRAY ARRAY['opname_bersama', 'back_charge'] LOOP
    SELECT count(*) INTO n_rantai FROM approval_chains WHERE entity_type = jenis;
    IF n_rantai = 0 THEN
      RAISE EXCEPTION '330 gagal: nol rantai % terpasang', jenis;
    END IF;

    -- Rantai TANPA langkah adalah yang paling berbahaya: `loadSteps` memberi
    -- array kosong, `evaluateEntityApproval` fail-closed, dan modulnya lumpuh
    -- tanpa satu pun galat. Halaman pengaturan pun terlihat wajar — rantainya
    -- ADA, hanya isinya nol.
    SELECT count(*) INTO n_tanpa
      FROM approval_chains ch
     WHERE ch.entity_type = jenis
       AND NOT EXISTS (SELECT 1 FROM approval_steps st WHERE st.chain_id = ch.id);
    IF n_tanpa > 0 THEN
      RAISE EXCEPTION '330 gagal: % rantai % tanpa satu pun langkah — modulnya akan lumpuh senyap', n_tanpa, jenis;
    END IF;

    -- Langkah yang menunjuk permission tak ada = fail-closed juga: tak seorang
    -- pun bisa memilikinya.
    SELECT count(*) INTO n_tanpa
      FROM approval_steps st
      JOIN approval_chains ch ON ch.id = st.chain_id
     WHERE ch.entity_type = jenis
       AND NOT EXISTS (SELECT 1 FROM permissions p WHERE p.key = st.required_permission);
    IF n_tanpa > 0 THEN
      RAISE EXCEPTION '330 gagal: % langkah % menunjuk permission tak ada', n_tanpa, jenis;
    END IF;

    -- company_id langkah WAJIB sama dengan rantainya (T4h: rantai lintas
    -- tenant berarti tenant A bisa melumpuhkan approval tenant B).
    SELECT count(*) INTO n_tanpa
      FROM approval_steps st
      JOIN approval_chains ch ON ch.id = st.chain_id
     WHERE ch.entity_type = jenis AND st.company_id <> ch.company_id;
    IF n_tanpa > 0 THEN
      RAISE EXCEPTION '330 gagal: % langkah % ber-company_id beda dari rantainya', n_tanpa, jenis;
    END IF;

    RAISE NOTICE '330 — % : % rantai, semuanya berlangkah', jenis, n_rantai;
  END LOOP;

  RAISE NOTICE '330 OK — opname & back-charge lewat satu pintu approval';
END $$;
