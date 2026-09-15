-- ============================================================================
-- 574 — Counter invoice tertinggal di belakang nomor yang SUDAH BEREDAR
-- ============================================================================
--
-- ── Cacat yang ditutup
--
-- Diukur 2026-09-14 dari test merah `t6-penomoran-per-company`:
--
--     counter 2026-03 = 26, sementara invoice 27 sudah beredar —
--     invoice berikutnya akan bernomor kembar
--
-- Keadaan `Puraloka Persada` saat berkas ini ditulis:
--
--     invoice tertinggi beredar : 27   (INV/2026/09/027)
--     counter 2026-01 … 2026-06 : 26   → berikutnya 027  ❌ KEMBAR
--     counter 2026-07           : 218  ✅
--     counter 2026-08           : 2329 ✅
--     counter 2026-09           : 99   ✅
--     counter 2026-10 … 2026-12 : 26   → berikutnya 027  ❌ KEMBAR
--
-- Sembilan dari dua belas bulan akan menerbitkan `027` — nomor yang SUDAH
-- ADA pada invoice tertanggal 2026-09-04.
--
-- ── ⚠ Kenapa basis TIDAK menahannya
--
-- Keunikan invoice adalah `UNIQUE (project_id, invoice_number)` — **per
-- PROYEK**, bukan per company. Dua invoice di proyek BERBEDA milik company
-- yang sama boleh bernomor sama, dan basis tak akan mengeluh.
--
-- Jadi nomor kembar ini tak akan gagal saat disimpan. Ia lahir diam-diam,
-- lalu keluar ke klien sebagai dokumen tagihan yang nomornya sudah dipakai.
-- Migrasi 135 menyebut akibatnya dengan tepat: *"untuk dokumen yang keluar ke
-- pihak ketiga, nomor kembar bukan ketidakrapian — itu cacat audit."*
--
-- ── Kenapa migrasi 135 tidak cukup, dan ia TIDAK salah
--
-- 135 sudah mengantisipasi persis masalah ini. Ia menyalin nomor tertinggi
-- format LAMA (`INV/PRL/YYYY/NNN`, tahunan) ke SETIAP bulan tahun itu, dengan
-- alasan yang ditulis di tempatnya: *"supaya counter bulan mana pun tidak
-- mulai dari 001 dan bertabrakan dengan nomor lama yang masih beredar"*.
--
-- Yang tak bisa dilakukannya: menjaga keadaan SESUDAH ia berjalan. Sinkronisasi
-- 135 sekali jalan, dan `INV/2026/09/027` lahir 2026-09-04 — jauh sesudahnya.
-- Ia menaikkan counter BULANNYA SENDIRI (September kini 99) dan tak menyentuh
-- sebelas bulan lain.
--
-- Bentuk cacat yang layak dicatat: **sinkronisasi sekali-jalan yang benar,
-- lalu data baru menggesernya lagi.** Tak ada gejala sampai ada yang membuat
-- invoice di bulan yang tertinggal.
--
-- ── Yang dikerjakan
--
-- Menaikkan tiap counter invoice ke nomor tertinggi yang benar-benar beredar
-- di tahun yang sama — DUA format sekaligus, dan hanya MENAIKKAN.
--
-- `GREATEST` memastikan counter yang sudah lebih tinggi (Juli 218, Agustus
-- 2.329) tak pernah turun. Menurunkan counter jauh lebih berbahaya daripada
-- melompati nomor: lompatan meninggalkan lubang pada urutan, penurunan
-- menerbitkan nomor kembar.
-- ============================================================================

WITH tertinggi_per_tahun AS (
  /*
    Nomor tertinggi yang beredar per (company, tahun) — KEDUA format:
      INV/PRL/2026/026   lama, tahunan
      INV/2026/09/027    sekarang, bulanan
    Keduanya diakhiri `/NNN`, jadi pengambilan urutannya sama.
  */
  SELECT project_company_id(project_id) AS company_id,
         substring(invoice_number FROM '(\d{4})') AS tahun,
         max(NULLIF(regexp_replace(invoice_number, '^.*/', ''), '')::BIGINT) AS urut
    FROM public.invoices
   WHERE invoice_number ~ '/\d+$'
     AND substring(invoice_number FROM '(\d{4})') IS NOT NULL
     AND project_company_id(project_id) IS NOT NULL
   GROUP BY 1, 2
)
UPDATE public.document_number_series s
   SET last_number = GREATEST(s.last_number, t.urut)
  FROM tertinggi_per_tahun t
 WHERE s.doc_type = 'invoice'
   AND s.company_id = t.company_id
   AND s.period LIKE t.tahun || '-%'
   AND s.last_number < t.urut;

-- ─── Verifikasi ─────────────────────────────────────────────────────────────
--
-- Memeriksa yang SEBENARNYA ditakutkan: apakah masih ada counter yang, kalau
-- dipakai sekarang, menerbitkan nomor yang sudah beredar di tahun itu.
--
-- Bukan "apakah UPDATE mengenai baris" — UPDATE yang mengenai nol baris pada
-- basis yang sudah benar adalah hasil yang SAH, dan verifikasi yang menuntut
-- sebaliknya akan merah di lingkungan bersih (pelajaran migrasi 372, §571).
DO $$
DECLARE
  n_tertinggal INT;
  contoh       TEXT;
BEGIN
  WITH tertinggi_per_tahun AS (
    SELECT project_company_id(project_id) AS company_id,
           substring(invoice_number FROM '(\d{4})') AS tahun,
           max(NULLIF(regexp_replace(invoice_number, '^.*/', ''), '')::BIGINT) AS urut
      FROM public.invoices
     WHERE invoice_number ~ '/\d+$'
       AND substring(invoice_number FROM '(\d{4})') IS NOT NULL
       AND project_company_id(project_id) IS NOT NULL
     GROUP BY 1, 2
  )
  SELECT count(*),
         min(s.period || ' (counter ' || s.last_number || ' < beredar ' || t.urut || ')')
    INTO n_tertinggal, contoh
    FROM public.document_number_series s
    JOIN tertinggi_per_tahun t
      ON t.company_id = s.company_id AND s.period LIKE t.tahun || '-%'
   WHERE s.doc_type = 'invoice' AND s.last_number < t.urut;

  IF n_tertinggal > 0 THEN
    RAISE EXCEPTION
      '574 gagal: % counter invoice masih di bawah nomor yang sudah beredar — %. '
      'Invoice berikutnya di periode itu akan bernomor KEMBAR, dan basis tak '
      'menahannya (unik hanya per project_id).', n_tertinggal, contoh;
  END IF;

  RAISE NOTICE '574 OK — nol counter invoice tertinggal di belakang nomor yang beredar';
END $$;
