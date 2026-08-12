-- ════════════════════════════════════════════════════════════════════════════
-- 339 — Rantai persetujuan: KLAIM PERJALANAN (G1)
-- ════════════════════════════════════════════════════════════════════════════
--
-- ── Kenapa migrasi ini ada
--
-- `audit-approval-satu-pintu.mjs` merah dengan pintu baru:
--
--     klaim-perjalanan.ts:338  → disetujui_oleh ditulis tanpa recordApproval
--
-- Uji yang dipakai sama dengan E1 dan 330: apakah kolomnya MENGELUARKAN uang?
-- Menyetujui klaim mengubahnya jadi utang yang wajib dibayar, dan sebagian
-- tenant menuntut klaim di atas nominal tertentu disetujui atasan langsung
-- lalu keuangan. Ia lulus, jadi masuk engine.
--
-- ── Kenapa migrasi WAJIB menyertai perubahan kode
--
-- `loadSteps()` fail-closed: rantai tak ada → `steps.length === 0` → NOL orang
-- bisa menyetujui. Menambah `ApprovalEntityType` tanpa migrasi ini tidak
-- "memperketat" — ia MELUMPUHKAN modul yang baru dibangun, dan halaman
-- pengaturannya tetap terlihat wajar karena memang tak ada yang salah di sana.
--
-- ── Kenapa `min_amount` NULL
--
-- Klaim bernominal rupiah nyata, dan ambangnya BERMAKNA di sini (berbeda dari
-- opname yang mengukur persen). Tetapi memilih angkanya adalah kebijakan
-- tenant — menebakkannya dari migrasi berarti memutuskan kebijakan keuangan
-- orang lain. NULL = berlaku untuk semua nominal; tenant menaikkannya sendiri
-- lewat halaman pengaturan.
--
-- ── Hanya company yang SUDAH punya rantai lain (pola 282/289/330)
--
-- Tenant tanpa rantai apa pun belum memakai mekanisme ini sama sekali;
-- memasangkan rantai ke seluruh perusahaan berarti menyalakan gerbang di
-- tenant yang tak pernah memintanya.
-- ════════════════════════════════════════════════════════════════════════════

INSERT INTO approval_chains (entity_type, label, is_active, company_id)
SELECT DISTINCT 'klaim_perjalanan', 'Klaim Perjalanan', TRUE, ch.company_id
  FROM approval_chains ch
  JOIN companies co ON co.id = ch.company_id
 WHERE NOT EXISTS (
   SELECT 1 FROM approval_chains x
    WHERE x.entity_type = 'klaim_perjalanan' AND x.company_id = ch.company_id
 );

INSERT INTO approval_steps (chain_id, level, required_permission, min_amount, label, company_id)
SELECT ch.id, 1, 'klaim:setujui', NULL, 'Persetujuan klaim', ch.company_id
  FROM approval_chains ch
 WHERE ch.entity_type = 'klaim_perjalanan'
   AND NOT EXISTS (
     SELECT 1 FROM approval_steps st WHERE st.chain_id = ch.id AND st.level = 1
   );

-- ------------------------------------------------------------
-- Verifikasi
-- ------------------------------------------------------------
DO $$
DECLARE
  n INT;
BEGIN
  SELECT count(*) INTO n FROM approval_chains WHERE entity_type = 'klaim_perjalanan';
  IF n = 0 THEN
    RAISE EXCEPTION '339 gagal: nol rantai klaim_perjalanan terpasang — approval-nya mati total';
  END IF;

  -- Rantai TANPA langkah adalah yang paling berbahaya: `loadSteps` memberi
  -- array kosong, `evaluateEntityApproval` fail-closed, dan modulnya lumpuh
  -- tanpa satu pun galat. Halaman pengaturan pun terlihat wajar — rantainya
  -- ADA, hanya isinya nol.
  SELECT count(*) INTO n
    FROM approval_chains ch
   WHERE ch.entity_type = 'klaim_perjalanan'
     AND NOT EXISTS (SELECT 1 FROM approval_steps st WHERE st.chain_id = ch.id);
  IF n > 0 THEN
    RAISE EXCEPTION '339 gagal: % rantai klaim tanpa satu pun langkah — modulnya lumpuh senyap', n;
  END IF;

  -- Langkah yang menunjuk permission tak ada = fail-closed juga: tak seorang
  -- pun bisa memilikinya.
  SELECT count(*) INTO n
    FROM approval_steps st
    JOIN approval_chains ch ON ch.id = st.chain_id
   WHERE ch.entity_type = 'klaim_perjalanan'
     AND NOT EXISTS (SELECT 1 FROM permissions p WHERE p.key = st.required_permission);
  IF n > 0 THEN
    RAISE EXCEPTION '339 gagal: % langkah klaim menunjuk permission tak ada', n;
  END IF;

  -- company_id langkah WAJIB sama dengan rantainya (T4h: rantai lintas tenant
  -- berarti tenant A bisa melumpuhkan approval tenant B).
  SELECT count(*) INTO n
    FROM approval_steps st
    JOIN approval_chains ch ON ch.id = st.chain_id
   WHERE ch.entity_type = 'klaim_perjalanan' AND st.company_id <> ch.company_id;
  IF n > 0 THEN
    RAISE EXCEPTION '339 gagal: % langkah klaim ber-company_id beda dari rantainya', n;
  END IF;

  RAISE NOTICE '339 OK — klaim perjalanan lewat satu pintu approval';
END $$;
