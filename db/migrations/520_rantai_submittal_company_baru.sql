-- ============================================================================
-- 520 — Rantai submittal untuk company yang lahir SESUDAH migrasi 159
-- ============================================================================
-- Ditemukan `submittal-aturan.test.ts` 2026-08-30.
--
-- Migrasi 159 menyemai rantai `submittal` untuk SEMUA company yang ada SAAT IA
-- BERJALAN. Company yang dibuat sesudahnya tak pernah mendapatkannya — dan
-- tanpa rantai, `evaluateEntityApproval` fail-closed: submittal-nya TAK BISA
-- DIPUTUSKAN siapa pun. Bukan ditolak dengan pesan, melainkan mati.
--
-- Diukur sebelum migrasi ini: dua company AKTIF berisi tanpa rantai —
-- PT Puraloka Nusantara (3 proyek, 1 anggota) dan PT Puraloka Properti
-- (2 proyek, 1 anggota). Keduanya perusahaan sungguhan milik founder.
--
-- ⚠ HANYA company AKTIF. Menyalin rantai ke tenant NONAKTIF sudah pernah
-- dicoba 2026-08-07 dan MERUSAK DUA TEST LAIN yang menghitung level lintas
-- company dengan asumsi hanya ada satu — catatannya ada di
-- `submittal-aturan.test.ts` baris 209. Arah itu jangan diulang.
--
-- Idempoten: `NOT EXISTS` di kedua sisipan, jadi menjalankannya dua kali tak
-- menambah baris.
-- ============================================================================

INSERT INTO approval_chains (company_id, entity_type, label, is_active)
SELECT c.id, 'submittal', 'Persetujuan Submittal', true
  FROM companies c
 WHERE c.is_active
   AND NOT EXISTS (
     SELECT 1 FROM approval_chains ac
      WHERE ac.company_id = c.id AND ac.entity_type = 'submittal');

-- Rantai tanpa langkah sama matinya dengan tak punya rantai: `loadSteps`
-- memulangkan kosong, dan engine fail-closed menolak semua keputusan.
INSERT INTO approval_steps (company_id, chain_id, level, required_permission, min_amount, label)
SELECT ac.company_id, ac.id, 1, 'submittal:decide', NULL, 'Keputusan konsultan/pemberi kerja'
  FROM approval_chains ac
 WHERE ac.entity_type = 'submittal'
   AND NOT EXISTS (SELECT 1 FROM approval_steps s WHERE s.chain_id = ac.id);

-- ── Verifikasi ──────────────────────────────────────────────────────────────
DO $$
DECLARE v_tanpa_rantai INT; v_tanpa_langkah INT;
BEGIN
  SELECT count(*) INTO v_tanpa_rantai FROM companies c
   WHERE c.is_active
     AND NOT EXISTS (SELECT 1 FROM approval_chains ac
                      WHERE ac.company_id = c.id AND ac.entity_type = 'submittal');
  IF v_tanpa_rantai <> 0 THEN
    RAISE EXCEPTION '520 gagal: % company aktif masih tanpa rantai submittal — '
      'submittal-nya tak bisa diputuskan siapa pun', v_tanpa_rantai;
  END IF;

  SELECT count(*) INTO v_tanpa_langkah FROM approval_chains ac
   WHERE ac.entity_type = 'submittal'
     AND NOT EXISTS (SELECT 1 FROM approval_steps s WHERE s.chain_id = ac.id);
  IF v_tanpa_langkah <> 0 THEN
    RAISE EXCEPTION '520 gagal: % rantai submittal tanpa langkah — sama matinya '
      'dengan tak punya rantai', v_tanpa_langkah;
  END IF;
END $$;
