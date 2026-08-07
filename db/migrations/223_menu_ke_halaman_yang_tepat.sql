-- ════════════════════════════════════════════════════════════════════════════
-- 223 — Menu yang mendarat di halaman umum, padahal halaman khususnya ADA
--
-- ── Cacat yang diperbaiki (T-3, bagian pertama)
--
-- 128 item menu berbagi 21 href. Klik "Kasbon" → mendarat di halaman Mandor
-- umum. Klik "Material Request" → halaman Pengadaan umum. Label menjanjikan hal
-- spesifik, yang muncul halaman umum — dan pengguna belajar bahwa sub-menu tak
-- bisa dipercaya, lalu berhenti memakainya. Itu menghapus nilai dari taksonomi
-- 191 sub-menu yang disusun justru supaya orang bisa menemukan sesuatu.
--
-- Migrasi ini menangani bagian yang paling jelas: item yang **halaman
-- khususnya sudah ada** dan hanya salah ditunjuk.
--
-- ── Cara memilih tujuan: diverifikasi satu per satu, BUKAN dicocokkan otomatis
--
-- Percobaan pertama memakai pencocokan nama label ke nama route. Hasilnya
-- mengusulkan "KPI Perusahaan" → `/pengaturan/perusahaan` dan "Piutang Klien"
-- → `/klien`. Keduanya salah, dan salahnya jenis yang sama dengan cacat yang
-- sedang diperbaiki: mendaratkan orang di halaman yang tak menjawab.
--
-- Jadi setiap baris di bawah dipilih dengan membaca halamannya, dan yang tak
-- bisa dipertanggungjawabkan TIDAK dimasukkan — ia ditangani migrasi 224
-- (dikembalikan ke halaman "segera hadir" yang jujur).
--
-- ── Idempoten: UPDATE menetapkan nilai akhir.
-- ════════════════════════════════════════════════════════════════════════════

-- ── Keuangan ────────────────────────────────────────────────────────────────
UPDATE menu_items SET href = '/keuangan/invoice'       WHERE key = 'tg-invoice';
UPDATE menu_items SET href = '/keuangan/pembayaran'    WHERE key = 'kt-termin';
UPDATE menu_items SET href = '/keuangan/arus-kas'      WHERE key = 'bi-arus-kas';
UPDATE menu_items SET href = '/keuangan/profitabilitas' WHERE key = 'cc-profit';

-- ── Mandor & subkon ─────────────────────────────────────────────────────────
UPDATE menu_items SET href = '/mandor/upah'      WHERE key = 'sk-upah';
UPDATE menu_items SET href = '/mandor/upah'      WHERE key = 'hr-upah';
UPDATE menu_items SET href = '/mandor/kasbon'    WHERE key = 'sk-kasbon';
UPDATE menu_items SET href = '/mandor/penagihan' WHERE key = 'sk-claim';
UPDATE menu_items SET href = '/mandor/tukang'    WHERE key = 'sk-mandor';

-- ── Pengadaan & gudang ──────────────────────────────────────────────────────
UPDATE menu_items SET href = '/procurement/permintaan' WHERE key = 'pr-mr';
UPDATE menu_items SET href = '/procurement/pesanan'    WHERE key = 'pr-po';
UPDATE menu_items SET href = '/procurement/penerimaan' WHERE key = 'pr-grn';
UPDATE menu_items SET href = '/procurement/supplier'   WHERE key = 'md-supplier';
UPDATE menu_items SET href = '/procurement/hutang'     WHERE key = 'fn-ap';
UPDATE menu_items SET href = '/procurement/material'   WHERE key = 'cc-pagu-material';
UPDATE menu_items SET href = '/procurement/stok'       WHERE key = 'iv-mutasi';
UPDATE menu_items SET href = '/procurement/laporan'    WHERE key = 'bi-biaya';

-- ── Kalender ────────────────────────────────────────────────────────────────
--
-- `md-klien` TIDAK disertakan: ia sudah menunjuk `/klien` dengan benar. Dan
-- `fn-kasbon` tak ada di `menu_items` sama sekali — blok verifikasi menangkap
-- kedua hal itu sebelum migrasi ini pernah dijalankan.
UPDATE menu_items SET href = '/kalender' WHERE key = 'md-kalender';

-- ── Akuntansi: dua item, satu halaman, TAB berbeda ──────────────────────────
--
-- `/akuntansi` punya lima tab nyata (akun · jurnal · besar · neraca · laporan)
-- yang dibaca dari state komponen. Menunjuk `?tab=` di sini akan MENJANJIKAN
-- sesuatu yang tak dibaca kode — tab-nya belum berasal dari URL.
--
-- Jadi keduanya dibiarkan menunjuk `/akuntansi`, dan penanda "berbagi halaman"
-- di sidebar (`menu-berbagi-href.ts`) sudah menyatakannya kepada pengguna.
-- Membuat tab dari URL adalah pekerjaan kode, bukan migrasi — dicatat di
-- RENCANA-PERBAIKAN-SIDEBAR sebagai lanjutan.

-- ------------------------------------------------------------
-- Verifikasi
-- ------------------------------------------------------------
DO $$
DECLARE
  v_hilang TEXT;
  v_kunci  TEXT[] := ARRAY[
    'tg-invoice','kt-termin','bi-arus-kas','cc-profit',
    'sk-upah','hr-upah','sk-kasbon','sk-claim','sk-mandor',
    'pr-mr','pr-po','pr-grn','md-supplier','fn-ap','cc-pagu-material',
    'iv-mutasi','bi-biaya','md-kalender'];
BEGIN
  -- Key karangan mengenai NOL baris tanpa galat — migrasi akan melapor sukses
  -- sambil tak melakukan apa pun. Pelajaran dari migrasi 220.
  SELECT string_agg(k, ', ' ORDER BY k) INTO v_hilang
    FROM unnest(v_kunci) AS k
   WHERE NOT EXISTS (SELECT 1 FROM menu_items mi WHERE mi.key = k);

  IF v_hilang IS NOT NULL THEN
    RAISE EXCEPTION '223 gagal: key menu tidak ada: %', v_hilang;
  END IF;
END $$;
