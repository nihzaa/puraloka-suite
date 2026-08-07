-- ════════════════════════════════════════════════════════════════════════════
-- 231 — Dua sampai empat nama untuk satu halaman, DI KELOMPOK YANG SAMA
--
-- ── Pertanyaan founder yang melahirkan migrasi ini
--
--   "jadi solusinya gimana biar tiap route itu 1 link aja di sidebarnya"
--
-- Jawaban yang jujur: **sebagian bisa, sebagian tidak** — dan bedanya bukan
-- selera, melainkan bisa diukur.
--
-- Dari 49 item yang masih berbagi href, diukur menurut KELOMPOK induknya:
--
--   35 item  kelompok BERBEDA  → sinonim lintas-peran, WAJIB dipertahankan
--   27 item  kelompok SAMA     → duplikat murni, inilah yang diberesi di sini
--
-- (Angkanya tumpang tindih: satu href bisa punya dua duplikat sekelompok
--  sekaligus satu sinonim dari kelompok lain.)
--
-- ── Kenapa sinonim lintas-kelompok TIDAK boleh dihapus
--
--     [SDM & Payroll]    "Upah Harian Lapangan"   ┐ keduanya /mandor/upah
--     [Mandor & Subkon]  "Upah Harian & Borongan" ┘
--
-- Staf HR mencari upah di kelompok SDM. Pelaksana mencarinya di kelompok
-- Mandor. Menghapus salah satunya membuat satu peran kehilangan jalan masuk —
-- dan ia tak akan menebak harus mencari di kelompok orang lain. Itu justru
-- kebalikan dari tujuan "satu route satu link".
--
-- Sidebar sudah menandainya: `lib/menu-berbagi-href.ts` menyalakan satu wakil
-- dan meredupkan sisanya dengan titik + keterangan pembaca layar.
--
-- ── Yang diberesi: duplikat DALAM SATU KELOMPOK
--
-- Tiga nama berbeda di kelompok Penagihan yang semuanya menuju `/piutang`
-- tidak melayani peran berbeda — ia cuma membuat kelompok itu terlihat lebih
-- penuh daripada isinya.
--
-- Untuk tiap kelompok, SATU yang bertahan dipilih dari ISI HALAMANNYA (dibaca,
-- bukan ditebak): `/tender` menampilkan register tender, jadi "Register Tender"
-- yang tinggal; `/piutang` menampilkan piutang berjalan, jadi "Piutang Klien".
-- Sisanya ke `/m/<key>` yang menjelaskan apa, kenapa belum, dan ke mana
-- sementara ini.
--
-- ── Idempoten: UPDATE menetapkan nilai akhir.
-- ════════════════════════════════════════════════════════════════════════════

-- ── /tender — halaman menampilkan REGISTER TENDER (nomor, pemberi kerja, nilai)
--    `crm-tender` "Register Tender" bertahan.
UPDATE menu_items SET href = '/m/' || key
 WHERE key IN ('crm-backlog', 'crm-gonogo', 'crm-winloss');

-- ── /piutang — halaman menampilkan "Total Piutang Berjalan" + aging
--    `fn-ar` "Piutang Klien" bertahan (kelompok Keuangan, lintas-kelompok).
--    Ketiga item kelompok Penagihan di bawah adalah duplikat sekelompok.
UPDATE menu_items SET href = '/m/' || key
 WHERE key IN ('tg-followup', 'tg-retensi', 'tg-uangmuka');

-- ── /keuangan — `tg-termin` "Termin" bertahan; Progress Billing hal berbeda
UPDATE menu_items SET href = '/m/' || key WHERE key = 'tg-progress';

-- ── /procurement — `pr-3way` bertahan (3-Way Match memang di ringkasan)
UPDATE menu_items SET href = '/m/' || key WHERE key = 'pr-jadwal-bayar';

-- ── /kas — `fn-kas` "Kas & Bank" bertahan; kas kecil belum punya layarnya
UPDATE menu_items SET href = '/m/' || key WHERE key = 'fn-petty';

-- ── /dokumen/kendali — matriks distribusi & e-sign belum punya modulnya
--    (empat tab yang ada: gambar · transmittal · notulen · jadwal)
UPDATE menu_items SET href = '/m/' || key
 WHERE key IN ('dk-distribusi', 'dk-esign');

-- ── /aset/operasional — `lp-alat` "Log Pemakaian Alat" bertahan: tabel
--    "Seluruh alat" memang berisi meter pemakaian. Perawatan & biaya operasi
--    adalah kolom di tabel yang sama, bukan layar sendiri.
UPDATE menu_items SET href = '/m/' || key
 WHERE key IN ('as-maintenance', 'as-opex');

-- ── /laporan?tab=pajak — `fn-pajak` "PPN & PPh" bertahan
UPDATE menu_items SET href = '/m/' || key WHERE key = 'fn-efaktur';

-- ── /procurement/rfq — `pr-rfq` bertahan; tabulasi satu layar dengannya,
--    dan itu SENGAJA (lihat catatan `tabulasi-penawaran.ts`: tabulasi
--    diturunkan tiap kali diminta supaya "termurah" tak bisa basi).
UPDATE menu_items SET href = '/m/' || key WHERE key = 'pr-tabulasi';


-- ── /aset — lima item di kelompok "Alat & Aset" menuju halaman yang sama.
--
-- Tabelnya sudah memuat kolom Kode · Kategori · Status · Nilai buku ·
-- PENYUSUTAN, dan tab milik/sewa memisahkan kepemilikan. Jadi "Register Aset",
-- "Penyusutan", dan "Sewa Alat" adalah tiga cara menyebut tampilan yang sama —
-- sama persis dengan kasus /aset/operasional.
--
-- `md-aset` "Aset & Alat" bertahan sebagai jalan masuk utama; `as-sewa`
-- diarahkan ke tab sewa (bukan dimatikan) karena tab itu memang ada.
UPDATE menu_items SET href = '/aset?tab=sewa' WHERE key = 'as-sewa';
UPDATE menu_items SET href = '/m/' || key
 WHERE key IN ('as-mutasi', 'as-penyusutan', 'as-register', 'as-utilisasi');

-- ------------------------------------------------------------
-- Verifikasi
-- ------------------------------------------------------------
DO $$
DECLARE
  v_hilang TEXT;
  v_salah  TEXT;
  v_sisa   TEXT;
  v_kunci  TEXT[] := ARRAY[
    'crm-backlog','crm-gonogo','crm-winloss',
    'tg-followup','tg-retensi','tg-uangmuka',
    'tg-progress','pr-jadwal-bayar','fn-petty',
    'dk-distribusi','dk-esign','as-maintenance','as-opex',
    'fn-efaktur','pr-tabulasi',
    'as-mutasi','as-penyusutan','as-register','as-utilisasi'];
  -- Yang WAJIB tetap menunjuk halaman nyata — kalau ikut terpindah, halamannya
  -- kehilangan jalan masuk dan `audit-nav-yatim.mjs` akan merah.
  v_bertahan TEXT[] := ARRAY[
    'crm-tender','fn-ar','tg-termin','pr-3way','fn-kas','pr-rfq','lp-alat','fn-pajak',
    'md-aset','as-sewa'];
BEGIN
  SELECT string_agg(k, ', ' ORDER BY k) INTO v_hilang
    FROM unnest(v_kunci || v_bertahan) AS k
   WHERE NOT EXISTS (SELECT 1 FROM menu_items mi WHERE mi.key = k);
  IF v_hilang IS NOT NULL THEN
    RAISE EXCEPTION '231 gagal: key menu tidak ada: %', v_hilang;
  END IF;

  SELECT string_agg(key || '=' || href, ', ' ORDER BY key) INTO v_salah
    FROM menu_items WHERE key = ANY(v_kunci) AND href <> '/m/' || key;
  IF v_salah IS NOT NULL THEN
    RAISE EXCEPTION '231 gagal: href tidak /m/<key>: %', v_salah;
  END IF;

  SELECT string_agg(key, ', ' ORDER BY key) INTO v_sisa
    FROM menu_items WHERE key = ANY(v_bertahan) AND (href IS NULL OR href LIKE '/m/%');
  IF v_sisa IS NOT NULL THEN
    RAISE EXCEPTION '231 gagal: yang harus BERTAHAN ikut terpindah: %', v_sisa;
  END IF;
END $$;
