-- ════════════════════════════════════════════════════════════════════════════
-- 282 — Rantai persetujuan untuk RENCANA MUTU PROYEK (G1e)
-- ════════════════════════════════════════════════════════════════════════════
--
-- ── Kenapa migrasi ini ada
--
-- Versi pertama `POST /rencana-mutu/:id/setujui` menulis `disetujui_oleh`
-- langsung, dan `audit-approval-satu-pintu.mjs` merahkannya. Penjaga itu
-- benar, dan alasannya tertulis di dalamnya sendiri:
--
--   "Menulis `approved_by` langsung berarti entitas yang menurut konfigurasi
--    butuh dua level bisa lolos dengan satu ketukan — dan konfigurasinya
--    tetap terlihat benar di halaman pengaturan."
--
-- Persetujuan RMP MENGIKAT: sesudahnya ITP tak boleh diubah tanpa revisi
-- baru, dan dokumen inilah yang ditunjukkan ke pemilik dan auditor. Sebagian
-- tenant akan menghendaki dua tanda tangan (QA lalu direktur). Tulis-langsung
-- membuat rantai dua langkah lolos dengan satu ketukan.
--
-- ── Kenapa `min_amount` NULL
--
-- RMP tak menyentuh uang. Yang berjenjang di sini adalah KEWENANGAN, bukan
-- besaran — persis seperti `submittal` (keputusan konsultan atas material)
-- dan `lessons_learned`, yang keduanya juga bernominal null.
--
-- Memberi ambang nominal pada dokumen tanpa nilai akan membuat evaluator
-- membandingkan `null` dengan angka, dan hasil perbandingan itu tak berarti
-- apa-apa.
--
-- ── Kenapa satu langkah, bukan dua
--
-- Seed ini menetapkan LANTAI, bukan kebijakan. Semua rantai lain di repo ini
-- juga satu langkah (diukur 2026-08-11: change_order, estimate_version,
-- kasbon, lessons_learned, material_request, project_expense, submittal —
-- ketujuhnya level 1 saja).
--
-- Jumlah langkah adalah KONFIGURASI PER TENANT, diatur lewat halaman
-- pengaturan approval — bukan konstanta yang dipaku di migrasi. Yang penting
-- dari migrasi ini bukan angka langkahnya, melainkan bahwa jalurnya lewat
-- mesin: tenant yang menambah level kedua besok akan langsung ditegakkan,
-- tanpa menyentuh kode.
--
-- ── Idempoten
--
-- `WHERE NOT EXISTS` pada keduanya. Dijalankan berapa kali pun hasilnya sama.
-- ════════════════════════════════════════════════════════════════════════════

-- ------------------------------------------------------------
-- 1. Rantai — satu per company yang sudah punya rantai lain.
--
-- Company yang belum punya rantai apa pun sengaja TIDAK diberi: ia belum
-- dipakai, dan menebak kebutuhan tenant yang belum ada adalah cara paling
-- umum konfigurasi jadi salah tanpa ketahuan.
-- ------------------------------------------------------------
-- ⚠ `JOIN companies`, bukan sekadar membaca `ch.company_id`.
--
-- Percobaan pertama migrasi ini GAGAL dengan pelanggaran foreign key: ada
-- baris `approval_chains` yang menunjuk company yang sudah tidak ada —
-- sisa fixture uji yang company-nya dihapus tanpa membersihkan rantainya.
-- Membaca `company_id` dari sana berarti menyalin rujukan yatim itu ke baris
-- baru, dan basis menolaknya.
--
-- Penolakan itu hasil yang BENAR: migrasinya gagal keras, dan
-- `apply-migrasi.mjs` menolak menulis ke buku migrasi (cacat 043). Yang salah
-- adalah asumsi saya bahwa `approval_chains.company_id` selalu menunjuk
-- company yang hidup.
INSERT INTO approval_chains (entity_type, label, is_active, company_id)
SELECT DISTINCT 'rencana_mutu', 'Rencana Mutu Proyek', TRUE, ch.company_id
  FROM approval_chains ch
  JOIN companies co ON co.id = ch.company_id
 WHERE NOT EXISTS (
   SELECT 1 FROM approval_chains x
    WHERE x.entity_type = 'rencana_mutu' AND x.company_id = ch.company_id
 );

-- ------------------------------------------------------------
-- 2. Langkah level 1 — `mutu:rmp:approve` (di-seed migrasi 280).
--
-- Permission TERSENDIRI, bukan `ncr:manage`: yang menyusun rencana mutu dan
-- yang menyetujuinya tak harus orang yang sama, dan menyamakan keduanya
-- membuat penyusun bisa menyetujui pekerjaannya sendiri.
-- ------------------------------------------------------------
INSERT INTO approval_steps (chain_id, level, required_permission, min_amount, label, company_id)
SELECT ch.id, 1, 'mutu:rmp:approve', NULL, 'Persetujuan mutu', ch.company_id
  FROM approval_chains ch
 WHERE ch.entity_type = 'rencana_mutu'
   AND NOT EXISTS (
     SELECT 1 FROM approval_steps st WHERE st.chain_id = ch.id AND st.level = 1
   );

-- ------------------------------------------------------------
-- 3. Verifikasi
-- ------------------------------------------------------------
DO $$
DECLARE
  n_rantai INT;
  n_langkah INT;
  n_tanpa_langkah INT;
BEGIN
  SELECT count(*) INTO n_rantai FROM approval_chains WHERE entity_type = 'rencana_mutu';
  IF n_rantai = 0 THEN
    RAISE EXCEPTION '282 gagal: tak ada rantai approval rencana_mutu terbentuk';
  END IF;

  SELECT count(*) INTO n_langkah
    FROM approval_steps st JOIN approval_chains ch ON ch.id = st.chain_id
   WHERE ch.entity_type = 'rencana_mutu';
  IF n_langkah = 0 THEN
    RAISE EXCEPTION '282 gagal: rantai rencana_mutu ada tapi NOL langkah';
  END IF;

  -- Rantai tanpa langkah adalah bentuk kegagalan yang paling berbahaya di
  -- sini: `evaluateEntityApproval` mengembalikan `no_steps`, dan SETIAP
  -- persetujuan ditolak dengan pesan konfigurasi — halaman terlihat rusak,
  -- padahal yang kurang cuma satu baris seed.
  SELECT count(*) INTO n_tanpa_langkah
    FROM approval_chains ch
   WHERE ch.entity_type = 'rencana_mutu'
     AND NOT EXISTS (SELECT 1 FROM approval_steps st WHERE st.chain_id = ch.id);
  IF n_tanpa_langkah > 0 THEN
    RAISE EXCEPTION '282 gagal: % rantai rencana_mutu tanpa satu pun langkah', n_tanpa_langkah;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM permissions WHERE key = 'mutu:rmp:approve') THEN
    RAISE EXCEPTION '282 gagal: permission mutu:rmp:approve tak ada (migrasi 280 belum jalan?)';
  END IF;

  RAISE NOTICE '282 OK — % rantai rencana_mutu, % langkah', n_rantai, n_langkah;
END $$;
