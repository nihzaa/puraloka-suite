-- ============================================================================
-- 181 — F2-5: storage tenant-scoped; `expense-receipts` berhenti terbuka.
--
-- ══════════════════════════════════════════════════════════════════════════
-- CELAH YANG DITUTUP
-- ══════════════════════════════════════════════════════════════════════════
--
-- Bucket `expense-receipts` PRIVAT, tetapi tiga policy-nya berlaku untuk role
-- `public` dan hanya menyaring bucket:
--
--     expense_receipts_select  [SELECT] USING (bucket_id = 'expense-receipts')
--     expense_receipts_delete  [DELETE] USING (bucket_id = 'expense-receipts')
--     expense_receipts_insert  [INSERT]
--
-- "Privat" pada `storage.buckets` hanya menutup URL publik — ia TIDAK
-- menyaring `storage.objects`. Policy di ataslah yang menentukan, dan ia
-- mengizinkan siapa pun.
--
-- DIBUKTIKAN, bukan disimpulkan (2026-08-04, transaksi ber-ROLLBACK):
--
--     anon (tanpa login sama sekali) : 1 baris ❌ BISA BACA
--     authenticated (tenant mana pun): 1 baris ❌ BISA BACA
--
-- Bukti pengeluaran memuat nominal, tanggal, dan sering foto nota dengan nama
-- pemasok. Daftarnya saja sudah memetakan pola belanja sebuah perusahaan.
--
-- ── ⚠️ KENAPA MIGRASI INI SAJA TIDAK CUKUP — dan apa yang juga diperbaiki
--
-- `storage.objects` adalah tabel GLOBAL: ia tidak punya salinan per-schema.
-- Migrasi 016 (yang MEMBUAT tiga policy publik itu) ikut ter-replay setiap
-- kali suite test membangun schema `test` — dan replay itu menghidupkan
-- kembali policy yang migrasi ini hapus.
--
-- Gejalanya: test F2-5 hijau saat dijalankan sendirian, MERAH di suite penuh.
-- Kelas cacat yang sama sudah muncul tujuh kali di Fase 0 — test menyentuh
-- keadaan bersama — dan kali ini arahnya terbalik: bukan test yang mengotori
-- produksi, melainkan MIGRASI LAMA yang mengotori hasil test.
--
-- Karena itu 016 ikut diperbaiki di tempatnya: policy publiknya dijadikan
-- service_role-only sejak lahir. Menambal hanya di 181 akan meninggalkan
-- lubang yang terbuka kembali di setiap lingkungan baru, dan replay-nya
-- membuat lubang itu tak terlihat sebagai regresi.
--
-- ── Kenapa TIGA policy dihapus, bukan diperketat
--
-- Ketiganya redundan: `expense_receipts_service_only` sudah memberi akses
-- penuh kepada `service_role`, dan SELURUH akses aplikasi ke bucket ini
-- menempuh service_role (`apps/api/src/routes/v1/cash.ts` memakai klien
-- server dengan secret key, lalu menyerahkan `createSignedUrl` ke pemakai).
--
-- Menyisakan policy `public` yang "diperketat" hanya menambah permukaan yang
-- harus benar. Yang tidak ada tak bisa salah.
--
-- ── Pola yang diikuti
--
-- `payment-proofs`, `kasbon-photos`, `project-documents` sudah memakai bentuk
-- ini: satu policy `*_service_only`, nol policy `public`. Migrasi ini membuat
-- `expense-receipts` seragam dengan mereka — bukan menciptakan pola baru.
-- ============================================================================

DO $$
DECLARE v_service int;
BEGIN
  -- Gerbang: jangan hapus jalur publik sebelum jalur service terbukti ada.
  -- Tanpa gerbang, kegagalan urutan membuat bucket tak bisa diakses SIAPA PUN
  -- — termasuk aplikasi — dan unggahan bukti pengeluaran berhenti diam-diam.
  SELECT count(*) INTO v_service
    FROM pg_policies
   WHERE schemaname = 'storage' AND tablename = 'objects'
     AND policyname = 'expense_receipts_service_only';

  IF v_service = 0 THEN
    RAISE EXCEPTION '181: policy expense_receipts_service_only tak ada. '
                    'Menghapus policy publik sekarang akan memutus akses '
                    'aplikasi ke bucket expense-receipts.';
  END IF;
END $$;

DROP POLICY IF EXISTS expense_receipts_select ON storage.objects;
DROP POLICY IF EXISTS expense_receipts_delete ON storage.objects;
DROP POLICY IF EXISTS expense_receipts_insert ON storage.objects;

-- ── project-photos: sisa policy dari era unggah-langsung ────────────────────
--
-- Ditemukan oleh test F2-5, bukan oleh pembacaan saya — dan itu justru
-- gunanya menulis test yang memeriksa SELURUH bucket, bukan yang sedang
-- dikerjakan saja.
--
-- Tiga policy `public` tertinggal dari masa ketika browser mengunggah langsung
-- memakai anon key. `apps/web/lib/storage.ts` mencatat perpindahan itu apa
-- adanya ("sebelumnya file ini upload langsung ke bucket project-photos dengan
-- anon key"), dan `progress.ts:20` menegaskan bucket ini kini service_role-only
-- (migrasi 098).
--
-- Policy-nya tak ikut dibersihkan saat itu. Ia tak menimbulkan gejala — hanya
-- membiarkan siapa pun membaca dan MENGHAPUS foto progres proyek.
DO $$
DECLARE v_service int;
BEGIN
  SELECT count(*) INTO v_service
    FROM pg_policies
   WHERE schemaname = 'storage' AND tablename = 'objects'
     AND policyname = 'project_photos_service_only';

  IF v_service = 0 THEN
    RAISE EXCEPTION '181: project_photos_service_only tak ada — menghapus '
                    'policy publik akan memutus akses aplikasi.';
  END IF;
END $$;

DROP POLICY IF EXISTS project_photos_public_read ON storage.objects;
DROP POLICY IF EXISTS project_photos_allow_insert ON storage.objects;
DROP POLICY IF EXISTS project_photos_allow_delete ON storage.objects;

-- ── Verifikasi di dalam migrasi ─────────────────────────────────────────────
--
-- Migrasi yang "berhasil" tanpa mencapai maksudnya adalah kegagalan yang
-- menyamar. Blok ini menolak keadaan itu.
DO $$
DECLARE v_publik int;
BEGIN
  SELECT count(*) INTO v_publik
    FROM pg_policies
   WHERE schemaname = 'storage' AND tablename = 'objects'
     AND (policyname LIKE 'expense_receipts%' OR policyname LIKE 'project_photos%')
     AND policyname NOT LIKE '%_service_only';

  IF v_publik > 0 THEN
    RAISE EXCEPTION '181: masih ada % policy non-service pada bucket tenant.', v_publik;
  END IF;

  RAISE NOTICE '181: expense-receipts & project-photos kini hanya service_role — '
               'seragam dengan payment-proofs, kasbon-photos, project-documents.';
END $$;
