-- ════════════════════════════════════════════════════════════════════════════
-- 285 — Menu untuk halaman tarif payroll (G2a)
-- ════════════════════════════════════════════════════════════════════════════
--
-- ── Kenapa migrasi ini ada
--
-- "Config-first" tanpa jalan masuk ke layarnya hanyalah klaim: kolomnya ada,
-- endpointnya ada, dan tak seorang pun bisa mencapainya. Itu kelas cacat yang
-- sudah tujuh kali terjadi di repo ini, dan G1e mengulanginya persis —
-- `/mutu/uji-material` hidup satu commit penuh tanpa satu pun tautan.
--
-- Karena itu menu didaftarkan di migrasi yang SAMA dengan halamannya, bukan
-- ditunda.
--
-- ── Kenapa `hr-pph21` DINONAKTIFKAN, bukan diarahkan
--
-- Aturan sejak migrasi 232: **SATU route = SATU link sidebar.** Dua item yang
-- menunjuk halaman sama akan menyala bersamaan, sehingga sidebar menyatakan
-- pengguna berada di dua tempat sekaligus.
--
-- PTKP, lapisan PPh 21, dan persentase BPJS diatur di SATU layar karena
-- ketiganya satu keputusan: tarif yang berlaku pada satu tanggal. Memisahkan
-- layarnya memaksa founder membuka tiga halaman untuk menetapkan satu
-- perubahan aturan, dan membuat "tarif sudah lengkap?" jadi pertanyaan yang
-- harus dijawab dengan mengingat.
--
-- `hr-bpjs` yang dipilih jadi tautannya karena label "BPJS & Potongan" paling
-- dekat dengan isi halaman; labelnya diperbarui supaya tak menyesatkan.
--
-- ── Idempoten
--
-- `UPDATE ... WHERE key = ...` menetapkan nilai akhir. Dijalankan berapa kali
-- pun hasilnya sama.
-- ════════════════════════════════════════════════════════════════════════════

UPDATE menu_items
   SET href = '/pengaturan/tarif-payroll',
       label = 'Tarif Payroll (PTKP · PPh 21 · BPJS)',
       is_active = TRUE,
       -- text[], BUKAN jsonb. Percobaan pertama memakai jsonb dan migrasinya
       -- gagal keras (buku tak ditulis, sesuai cacat 043). Bentuk kolom diukur
       -- ke information_schema, bukan ditebak dari nama.
       required_permissions = ARRAY['payroll:tarif:view']::text[]
 WHERE key = 'hr-bpjs';

-- Satu route = satu link (aturan 232). Diatur di layar yang sama dengan BPJS.
UPDATE menu_items SET is_active = FALSE WHERE key = 'hr-pph21';

-- ------------------------------------------------------------
-- Verifikasi
-- ------------------------------------------------------------
DO $$
DECLARE
  n INT;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM menu_items
     WHERE key = 'hr-bpjs' AND href = '/pengaturan/tarif-payroll' AND is_active
  ) THEN
    RAISE EXCEPTION '285 gagal: menu tarif payroll tak menunjuk halaman nyata atau masih mati';
  END IF;

  -- SATU route = SATU link.
  SELECT count(*) INTO n
    FROM menu_items
   WHERE is_active AND href = '/pengaturan/tarif-payroll';
  IF n <> 1 THEN
    RAISE EXCEPTION '285 gagal: % menu aktif menunjuk /pengaturan/tarif-payroll (harus tepat 1)', n;
  END IF;

  RAISE NOTICE '285 OK — tarif payroll punya tepat satu tautan sidebar';
END $$;
