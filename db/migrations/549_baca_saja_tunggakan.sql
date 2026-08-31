-- ============================================================================
-- 549 — BACA-SAJA saat menunggak
-- ============================================================================
--
-- Diukur 2026-08-31: `tandai-lewat-tempo.ts` mengubah status tagihan jadi
-- `lewat_tempo`, dan `dorong-entitlement.ts` sama sekali TIDAK MEMBACANYA.
-- Akibatnya pelanggan yang berhenti membayar **tetap memakai seluruh modul
-- selamanya** — satu-satunya yang menahannya adalah founder menelepon.
--
-- Ironisnya gerbang modul yang baru dibangun menegakkan PAKET tapi tak
-- menegakkan PEMBAYARAN.
--
-- ══════════════════════════════════════════════════════════════════════════
-- KENAPA BACA-SAJA, BUKAN TUTUP PENUH
-- ══════════════════════════════════════════════════════════════════════════
--
-- Keputusan founder 2026-08-31: lewat tempo 30 hari → baca-saja.
--
-- Menutup penuh menghentikan orang bekerja, dan yang paling sering telat bayar
-- bukan pelanggan yang kabur melainkan yang LUPA. Menghentikan pekerjaan
-- lapangan sebuah kontraktor karena invoice terlambat tiga hari diproses
-- bagian keuangannya adalah cara cepat kehilangan pelanggan yang sebenarnya
-- mau membayar.
--
-- Baca-saja menahan hal yang tepat: data tetap TERBACA dan bisa DIEKSPOR,
-- tapi tak ada yang bisa ditambah. Pelanggan tak kehilangan apa pun, dan
-- pemulihannya seketika begitu dibayar.
--
-- Pola ini punya preseden yang terdokumentasi baik — Microsoft 365:
-- Expired (30 hari, akses penuh) → Disabled (90 hari, baca-saja, admin tetap
-- bisa masuk untuk reaktivasi) → baru dihapus. Total 120 hari sebelum data
-- hilang, dan admin bisa memulihkan di KEDUA tahap.
--
-- ⚠ Data TIDAK PERNAH dihapus oleh mekanisme ini. Menghapus data pelanggan
-- karena tunggakan bukan penegakan, itu penghancuran — dan CLAUDE.md §8a.5
-- menuntut konfirmasi bahkan untuk data dummy.
--
-- ══════════════════════════════════════════════════════════════════════════
-- KENAPA BARIS SNAPSHOT, BUKAN KOLOM BARU DI companies
-- ══════════════════════════════════════════════════════════════════════════
--
-- Baca-saja adalah keadaan yang DIDORONG konsol vendor, sama seperti
-- entitlement modul: kebenarannya milik konsol, produk hanya menyimpan
-- salinannya. Menaruhnya di `companies` berarti dua mekanisme sinkronisasi
-- untuk satu sumber yang sama — dan yang kedua pasti akan tertinggal.
--
-- Kuncinya `sistem.baca_saja`, berawalan `sistem.` supaya tak pernah
-- tertukar dengan `modul.*` maupun `kuota.*`. `terbuka = false` berarti
-- TENANT SEDANG BACA-SAJA (bukan "modul tertutup").

COMMENT ON COLUMN entitlement_snapshot.kunci IS
  'Kunci katalog (modul.* / kuota.*) ATAU kunci sistem (sistem.baca_saja). Yang berawalan sistem. bukan fitur yang dijual — ia keadaan tenant yang didorong konsol vendor.';

-- ── Penanda kapan tenant masuk baca-saja ────────────────────────────────────
--
-- Dipakai layar produk untuk mengatakan SEJAK KAPAN, bukan sekadar "akun
-- Anda terbatas". Pesan tanpa tanggal tak bisa ditindaklanjuti siapa pun —
-- bagian keuangan pelanggan perlu tahu tagihan MANA yang belum masuk.
ALTER TABLE entitlement_snapshot
  ADD COLUMN IF NOT EXISTS alasan TEXT;

COMMENT ON COLUMN entitlement_snapshot.alasan IS
  'Kalimat siap tampil untuk keadaan sistem (mis. tunggakan sejak kapan, nomor tagihannya). NULL untuk baris modul/kuota biasa.';

-- ============================================================================
-- VERIFIKASI
-- ============================================================================
DO $$
DECLARE v_kolom INT;
BEGIN
  SELECT count(*) INTO v_kolom FROM information_schema.columns
   WHERE table_schema = 'public' AND table_name = 'entitlement_snapshot'
     AND column_name = 'alasan';
  IF v_kolom <> 1 THEN
    RAISE EXCEPTION '549 gagal: kolom alasan tak terpasang';
  END IF;

  -- Kolom `terbuka` WAJIB tetap nullable: `sistem.baca_saja` memakai NULL
  -- untuk "tenant sehat", dan NOT NULL akan memaksa setiap tenant punya
  -- barisnya — termasuk yang tak pernah menunggak.
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'entitlement_snapshot'
       AND column_name = 'terbuka' AND is_nullable = 'NO'
  ) THEN
    RAISE EXCEPTION '549 gagal: kolom terbuka jadi NOT NULL — sistem.baca_saja butuh NULL untuk keadaan sehat';
  END IF;

  RAISE NOTICE '549 OK — entitlement_snapshot siap membawa keadaan sistem';
END $$;
