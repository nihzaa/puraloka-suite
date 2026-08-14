-- ============================================================================
-- 381 — Rantai approval untuk PURCHASE ORDER
-- ============================================================================
--
-- ── Yang bolong sebelum ini
--
-- Diukur 2026-08-14, saat hendak membangun automation 4.6 (fast-track
-- approval PO kecil):
--
--     entitas yang punya rantai approval : 12  (kasbon, MR, change order, …)
--     purchase_order                     : TIDAK ADA
--     gerbang PO                         : satu `procurement:po:manage`
--     PO terbesar di basis dev           : Rp 40.200.000
--
-- Siapa pun yang punya izin kelola PO bisa memindahkan PO nominal berapa pun
-- ke `sent` — **terkirim ke vendor** — tanpa satu pun persetujuan. Kasbon
-- Rp 1 juta lewat rantai; PO Rp 40 juta tidak.
--
-- Ketimpangan itu tak pernah melaporkan dirinya. Jalur PO tidak gagal, tidak
-- melempar galat, tidak menulis apa pun ke log — ia hanya tak pernah bertanya.
-- Ketahuan karena automation 4.6 MENUNTUT adanya jalur lambat untuk
-- dipercepat, dan ternyata tak ada.
--
-- ── Kenapa seed-nya LONGGAR, dan itu disengaja
--
-- Satu langkah, `min_amount`/`max_amount` NULL, permission SAMA PERSIS dengan
-- gerbang lama (`procurement:po:manage`).
--
-- Artinya perilaku hari ini **tidak berubah sama sekali**: siapa yang tadinya
-- bisa mengirim PO, tetap bisa. Yang berubah cuma satu hal — sekarang ADA
-- TEMPAT untuk mengetatkannya, dan tempat itu di UI (Pengaturan → Approval),
-- bukan di kode.
--
-- Founder: *"kalo nanti aja dan bisa dikonfig lewat ui lagi gimana?"* —
-- dan itu lebih baik daripada usulan saya sebelumnya, yang menaruh satu angka
-- ambang sebagai gerbang penghenti pekerjaan. Memasang mekanismenya dengan
-- nilai longgar membuat founder memutuskan sambil MELIHAT bentuknya di layar,
-- bukan menjawab pertanyaan abstrak tentang angka yang belum ada wujudnya.
--
-- Seed ketat akan langsung menahan PO yang sedang berjalan di lapangan —
-- perubahan kebijakan yang diselundupkan lewat migrasi, persis yang TIDAK
-- boleh dilakukan tanpa keputusan pemilik.
--
-- ── Automation 4.6 tak perlu dibangun
--
-- Fast-track PO kecil = satu langkah ber-`max_amount`. Mesinnya sudah
-- mendukung sejak awal (`utils/approval.ts` membaca min/max), dan UI-nya
-- sudah bisa mengisinya. Jadi 4.6 lahir dari konfigurasi, bukan dari kode.
--
-- ── Idempoten
--
-- Mengikuti pola migrasi 339 (klaim_perjalanan): `NOT EXISTS` per company,
-- jadi aman dijalankan ulang dan aman untuk tenant yang lahir kemudian.
-- ============================================================================

-- ------------------------------------------------------------
-- 1. Rantai per company
-- ------------------------------------------------------------
INSERT INTO approval_chains (entity_type, label, is_active, company_id)
SELECT DISTINCT 'purchase_order', 'Purchase Order', TRUE, ch.company_id
  FROM approval_chains ch
  JOIN companies co ON co.id = ch.company_id
 WHERE NOT EXISTS (
   SELECT 1 FROM approval_chains x
    WHERE x.entity_type = 'purchase_order' AND x.company_id = ch.company_id
 );

-- ------------------------------------------------------------
-- 2. Satu langkah, LONGGAR
-- ------------------------------------------------------------
-- `min_amount`/`max_amount` NULL = berlaku untuk semua nominal. Founder
-- mengisi ambangnya lewat UI; migrasi tak boleh memilihkan angka kebijakan.
INSERT INTO approval_steps (chain_id, level, required_permission, min_amount, max_amount, label, company_id)
SELECT ch.id, 1, 'procurement:po:manage', NULL, NULL, 'Persetujuan pengiriman PO', ch.company_id
  FROM approval_chains ch
 WHERE ch.entity_type = 'purchase_order'
   AND NOT EXISTS (
     SELECT 1 FROM approval_steps st WHERE st.chain_id = ch.id AND st.level = 1
   );

-- ------------------------------------------------------------
-- 3. Verifikasi
-- ------------------------------------------------------------
DO $$
DECLARE
  n_rantai INT;
  n_kosong INT;
  n_ketat  INT;
BEGIN
  SELECT count(*) INTO n_rantai FROM approval_chains WHERE entity_type = 'purchase_order';
  IF n_rantai = 0 THEN
    RAISE EXCEPTION '381 gagal: nol rantai purchase_order terpasang — approval PO mati total';
  END IF;

  /*
    Rantai TANPA langkah adalah keadaan paling berbahaya, bukan paling aman.

    `loadSteps()` bersifat fail-closed: nol langkah berarti NOL ORANG bisa
    menyetujui, jadi seluruh pengiriman PO terkunci — dan gejalanya muncul
    sebagai "403 Akses ditolak" yang menuntun ke dugaan salah (izin pengguna),
    bukan ke sebabnya (rantai kosong).
  */
  SELECT count(*) INTO n_kosong
    FROM approval_chains ch
   WHERE ch.entity_type = 'purchase_order'
     AND NOT EXISTS (SELECT 1 FROM approval_steps st WHERE st.chain_id = ch.id);
  IF n_kosong > 0 THEN
    RAISE EXCEPTION '381 gagal: % rantai purchase_order tanpa satu pun langkah — '
                    'fail-closed akan mengunci SELURUH pengiriman PO', n_kosong;
  END IF;

  /*
    Seed WAJIB longgar. Kalau ada langkah ber-ambang lahir dari migrasi ini,
    berarti saya menyelundupkan keputusan kebijakan yang bukan milik saya —
    dan PO yang sedang berjalan di lapangan ikut tertahan tanpa ada yang
    memutuskan begitu.
  */
  SELECT count(*) INTO n_ketat
    FROM approval_steps st
    JOIN approval_chains ch ON ch.id = st.chain_id
   WHERE ch.entity_type = 'purchase_order'
     AND (st.min_amount IS NOT NULL OR st.max_amount IS NOT NULL);
  IF n_ketat > 0 THEN
    RAISE EXCEPTION '381 gagal: % langkah PO punya ambang nominal — seed harus LONGGAR, '
                    'ambangnya keputusan tenant lewat UI', n_ketat;
  END IF;

  RAISE NOTICE '381: % rantai purchase_order terpasang · semuanya punya langkah · nol ambang dipaku',
    n_rantai;
END $$;
