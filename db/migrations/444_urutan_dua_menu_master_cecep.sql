-- ════════════════════════════════════════════════════════════════════════════
-- 444 — sort_order dua menu CECEP di luar rentang grup barunya (cacat dari 443)
--
-- ── Cacat yang diperbaiki
--
-- Migrasi 443 memindahkan `crm-estimating` dan `md-price-book` ke grup
-- `g-master-data`, tetapi TIDAK menyesuaikan `sort_order`-nya. Keduanya
-- membawa urutan lama dari grup asalnya:
--
--     crm-estimating   205   ← di luar rentang sah (51–149)
--     md-price-book    106   ← masih sah, tetapi jauh dari saudaranya (58–64)
--
-- `audit-sidebar-urutan` merah: "1 anak di luar rentang gso+1..gso+99".
--
-- ── Kenapa ini bukan cacat kosmetik
--
-- Penjaganya menyatakan sendiri: anak di luar rentang tak terlihat salah hari
-- ini, karena urutan ANTAR-grup ditentukan sort_order GRUPNYA. Ia menggigit
-- saat grup berikutnya lahir di rentang yang sudah ditempati anak grup lain —
-- dan tabrakan itu tak mengeluarkan galat, hanya urutan aneh yang sulit
-- dilacak asalnya berbulan-bulan kemudian.
--
-- ── Angkanya dibaca dari DB, bukan dikarang
--
-- Anggota `g-master-data` yang ada (2026-08-17) berhenti di 64; keduanya
-- disisipkan sesudahnya supaya urutan lama tak bergeser sama sekali:
--
--     58 pengaturan-perusahaan · 59 md-field-tambahan · 61 md-wbs
--     62 md-karyawan · 63 md-penomoran · 64 md-template-dok
--
-- Katalog AHSP diletakkan SEBELUM price book: analisa dulu, harganya
-- kemudian — urutan yang sama dengan cara keduanya dipakai menyusun RAB.
--
-- ── Idempoten
--
-- `UPDATE ... WHERE key = ...` menetapkan nilai akhir. Dijalankan berapa kali
-- pun hasilnya sama.
-- ════════════════════════════════════════════════════════════════════════════

UPDATE menu_items SET sort_order = 65 WHERE key = 'crm-estimating';
UPDATE menu_items SET sort_order = 66 WHERE key = 'md-price-book';

-- ════════════════════════════════════════════════════════════════════════════
-- VERIFIKASI — migrasi ini GAGAL bila masih ada anak di luar rentang induknya
-- ════════════════════════════════════════════════════════════════════════════
DO $$
DECLARE
  v_luar text;
BEGIN
  -- Cakupannya SELURUH menu aktif ber-induk, bukan cuma dua key di atas:
  -- konvensi gso+1..gso+99 dipatuhi semua grup, jadi kalau perbaikan ini
  -- menyisakan pelanggar lain lebih baik ketahuan di sini daripada dari CI.
  SELECT string_agg(c.key || ' (' || c.sort_order || ' di ' || p.key || '='
                    || p.sort_order || ')', ', ' ORDER BY c.key)
    INTO v_luar
    FROM menu_items c JOIN menu_items p ON p.id = c.parent_id
   WHERE c.is_active AND p.is_active
     AND (c.sort_order <= p.sort_order OR c.sort_order > p.sort_order + 99);

  IF v_luar IS NOT NULL THEN
    RAISE EXCEPTION '444 gagal: anak di luar rentang sort_order induknya: %', v_luar;
  END IF;
END $$;
