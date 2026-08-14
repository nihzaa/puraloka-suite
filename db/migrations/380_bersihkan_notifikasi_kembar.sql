-- ============================================================================
-- 380 — Membersihkan 9.759 notifikasi KEMBAR (disetujui founder 2026-08-14)
-- ============================================================================
--
-- ── Asalnya
--
-- Founder: *"emang ini semuanya hasil test? kenapa banyak banget?"*
--
-- Diukur: 14.568 notifikasi, 14.563 belum dibaca — 5.598 di antaranya di akun
-- founder sendiri, sehingga lonceng menampilkan `99+` terus-menerus.
--
-- Sebabnya BUKAN test. Dedup harian alur `2.10 kasbon-outstanding` mati karena
-- SATU BYTE: kunci ditulis dengan pemisah `NUL` (kode 0), dicari dengan SPASI.
-- Tak terlihat di editor mana pun. Sudah diperbaiki commit `e8ba8d02`
-- (12 Agustus) — tetapi residunya tinggal.
--
-- Bedanya terukur:
--
--     11 Agustus : 8.478 baris untuk 234 kombinasi unik   ← dedup mati
--     12 Agustus :   150 baris untuk 150 kombinasi unik   ← sudah waras
--     13 Agustus :   156 baris untuk 156 kombinasi unik
--
-- ── Yang dihapus, dan yang TIDAK
--
--     9.759  kembar     → DIHAPUS
--     1.027  asli       → dipertahankan (baris PERTAMA tiap kombinasi)
--     3.782  tanpa record_id → TIDAK DISENTUH
--
-- Baris tanpa `record_id` tak bisa dinilai kembar: tanpa penunjuk entitas, dua
-- notifikasi berjudul sama bisa saja merujuk dua hal berbeda. Menghapusnya
-- berdasarkan judul/pesan akan membuang notifikasi yang memang sengaja
-- berulang. Yang tak bisa dipastikan, tidak dihapus.
--
-- ── Yang DIPERTAHANKAN baris PERTAMA, bukan terakhir
--
-- `sent_at` paling awal adalah saat peristiwanya benar-benar diberitahukan.
-- Menyimpan yang terakhir berarti memindahkan tanggal pemberitahuan ke waktu
-- pengulangan — dan pada notifikasi yang jadi rujukan ("sudah dikabari kapan?")
-- itu memalsukan jejaknya.
--
-- ── Kenapa lewat migrasi, bukan skrip sekali-pakai
--
-- Ini penghapusan data. Skrip sekali-pakai tak meninggalkan jejak yang bisa
-- ditelusuri enam bulan lagi, dan CLAUDE.md sudah mencatat kisah galatnya
-- (`scripts/db/_koneksi.mjs`). Migrasi bernomor tercatat di buku, punya blok
-- verifikasi, dan bisa dibaca sebagai keputusan — bukan sebagai kejadian.
--
-- Disetujui founder lewat AskUserQuestion, 2026-08-14: *"Hapus duplikatnya
-- saja"*.
-- ============================================================================

DO $$
DECLARE
  n_sebelum int;
  n_hapus   int;
  n_sesudah int;
  n_sisa    int;
  n_polos_sebelum int;
  n_polos_sesudah int;
BEGIN
  SELECT count(*) INTO n_sebelum FROM public.notifications;

  /*
    Jumlah baris tanpa `record_id` DIUKUR SEBELUM, bukan ditulis sebagai angka.

    Percobaan pertama memakai literal `3782` — angka yang saya ukur beberapa
    menit sebelumnya. Migrasi gagal: suite test terus menulis notifikasi, dan
    angkanya sudah 3.833 saat migrasi benar-benar dijalankan.

    Penjaganya BENAR menahan (ia mencegah penghapusan melebar), tetapi
    patokannya salah bentuk. Angka mati di blok verifikasi membusuk sama
    seperti angka mati di dokumen — pelajaran yang sudah jadi pembuka
    CLAUDE.md. Yang benar: bandingkan sebelum dengan sesudah.
  */
  SELECT count(*) INTO n_polos_sebelum
    FROM public.notifications WHERE action_data->>'record_id' IS NULL;

  WITH bernomor AS (
    SELECT id,
           row_number() OVER (
             PARTITION BY user_id, type, action_data->>'record_id', sent_at::date
             ORDER BY sent_at
           ) AS urutan
      FROM public.notifications
     WHERE action_data->>'record_id' IS NOT NULL
  )
  DELETE FROM public.notifications n
   USING bernomor b
   WHERE n.id = b.id AND b.urutan > 1;

  GET DIAGNOSTICS n_hapus = ROW_COUNT;
  SELECT count(*) INTO n_sesudah FROM public.notifications;

  -- ── Verifikasi 1: nol kembar tersisa ─────────────────────────────────────
  SELECT count(*) INTO n_sisa FROM (
    SELECT row_number() OVER (
             PARTITION BY user_id, type, action_data->>'record_id', sent_at::date
             ORDER BY sent_at
           ) AS urutan
      FROM public.notifications
     WHERE action_data->>'record_id' IS NOT NULL
  ) x WHERE x.urutan > 1;

  IF n_sisa > 0 THEN
    RAISE EXCEPTION '380 gagal: masih % notifikasi kembar tersisa', n_sisa;
  END IF;

  -- ── Verifikasi 2: yang TANPA record_id tak tersentuh ─────────────────────
  --
  -- Kalau angka ini ikut turun, penghapusannya melebar melewati apa yang
  -- disetujui — dan notifikasi yang tak bisa dinilai kembar ikut hilang.
  SELECT count(*) INTO n_polos_sesudah
    FROM public.notifications WHERE action_data->>'record_id' IS NULL;

  IF n_polos_sesudah < n_polos_sebelum THEN
    RAISE EXCEPTION '380 gagal: baris tanpa record_id berkurang % → % — '
                    'penghapusan melebar dari yang disetujui',
      n_polos_sebelum, n_polos_sesudah;
  END IF;

  -- ── Verifikasi 3: tak menghapus lebih dari yang diperkirakan ─────────────
  --
  -- 9.759 adalah angka yang diukur sebelum menulis migrasi ini. Batas 12.000
  -- memberi ruang bagi kembar yang lahir sesudah pengukuran (suite test terus
  -- berjalan) tanpa membiarkan penghapusan yang jelas kebablasan lewat.
  IF n_hapus > 12000 THEN
    RAISE EXCEPTION '380 gagal: % baris terhapus, jauh di atas 9.759 yang diukur', n_hapus;
  END IF;

  RAISE NOTICE '380: % → % notifikasi (% kembar dihapus) · nol kembar tersisa',
    n_sebelum, n_sesudah, n_hapus;
END $$;
