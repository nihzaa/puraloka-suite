-- ============================================================================
-- 530 - Tabrakan sort_order & anak di luar rentang: dinomori ulang berjarak 10
-- ============================================================================
--
-- Cacat yang ditutup
--
-- `audit-sidebar-urutan.mjs` merah:
--
--     sort_order bentrok    : 15   (g-kontrak 6, g-lapangan 5, g-jadwal 4)
--     anak di luar rentang  : 22   (g-keuangan 14, g-dokumen 5, g-hr 2, g-crm 1)
--
-- Dua item aktif dengan `sort_order` sama di satu grup berarti urutannya
-- ditentukan tie-break yang tak seorang pun tetapkan - dan bisa berubah antar
-- query. Anak di luar rentang `induk+1..induk+99` menggigit belakangan: saat
-- grup berikutnya lahir di rentang yang sudah ditempati, anak itu melompat ke
-- grup yang salah.
--
-- Kenapa berjarak 10, bukan +1
--
-- Penjaganya sendiri yang menuliskan alasannya, dan migrasi 319 buktinya:
--
--     "Nomori grupnya ulang dengan JARAK 10, bukan +1: angka rapat adalah
--      sebab langsung tabrakan ini - dengan +1, sisipan berikutnya tak punya
--      ruang dan penulisnya memakai angka yang sudah ada."
--
-- Rentang induk 99 lebar, jadi jarak 10 memberi ruang 9 sisipan per posisi -
-- cukup untuk sembilan gelombang sisipan sebelum perlu dinomori ulang lagi.
--
-- Yang TIDAK dilakukan
--
-- Induk MATI dengan anak hidup (94 item, 13 grup) TIDAK disentuh. Itu bukan
-- salah nomor melainkan DUA GENERASI grup menu yang hidup berdampingan:
-- g-ai/g-master-data/g-akuntansi (lama, mati) versus
-- g-hse/g-qaqc/g-master (baru, hidup). Menghidupkan grup lama membuat menu
-- ganda; memindahkan anaknya adalah keputusan struktur menu yang butuh
-- founder. Dicatat, bukan ditebak.
--
-- URUTAN RELATIF DIPERTAHANKAN. Yang diubah hanya angkanya, bukan susunannya -
-- kecuali pada tabrakan, di mana `key` jadi tie-break supaya hasilnya sama
-- tiap kali migrasi ini dijalankan.
--
-- Idempoten. Verifikasi di blok akhir (pola migrasi 142).

/*
  JARAKNYA DIHITUNG, bukan dipaku 10.

  Percobaan pertama memakai jarak 10 tetap, dan gagal:

      530 gagal: masih 73 anak di luar rentang induk+1..induk+99

  Diukur: `g-keuangan` punya 28 anak aktif. Jarak 10 butuh 280 slot, sementara
  rentang induknya hanya 99. Delapan grup lain juga melewatinya (g-master 18,
  g-kontrak 17, g-lapangan 17, g-jadwal 15, g-subkon 14, g-cost 14, g-crm 13).

  Nasihat "jarak 10" dari penjaganya benar untuk grup kecil, dan mustahil untuk
  grup besar. Jaraknya kini dihitung per grup: `floor(99 / jumlah_anak)`,
  minimal 1 — jadi ruang sisip semaksimal yang muat, dan tak pernah melampaui
  rentang induk.

      g-keuangan (28 anak) → jarak 3   (28*3 = 84 ≤ 99)
      grup 9 anak atau kurang → jarak 10, seperti nasihat aslinya
*/
WITH induk AS (
  SELECT id, key, sort_order FROM menu_items WHERE parent_id IS NULL AND is_active
), cacah AS (
  SELECT i.id, i.sort_order,
         count(a.id) AS n_anak,
         GREATEST(1, LEAST(10, 99 / GREATEST(count(a.id), 1))) AS jarak
    FROM induk i LEFT JOIN menu_items a ON a.parent_id = i.id AND a.is_active
   GROUP BY i.id, i.sort_order
), urut AS (
  SELECT a.id,
         cc.sort_order + cc.jarak * row_number() OVER (
           PARTITION BY cc.id ORDER BY a.sort_order, a.key) AS baru
    FROM menu_items a JOIN cacah cc ON cc.id = a.parent_id
   WHERE a.is_active
)
UPDATE menu_items m
   SET sort_order = u.baru, updated_at = now()
  FROM urut u
 WHERE m.id = u.id AND m.sort_order IS DISTINCT FROM u.baru;

-- Verifikasi (pola migrasi 142)
DO $$
DECLARE
  n_bentrok INT;
  n_luar    INT;
  n_anak    INT;
  n_jarak   INT;
BEGIN
  SELECT count(*) INTO n_anak
    FROM menu_items a JOIN menu_items i ON i.id = a.parent_id
   WHERE a.is_active AND i.is_active AND i.parent_id IS NULL;

  IF n_anak = 0 THEN
    RAISE NOTICE '530 dilewati: nol anak menu aktif di basis ini. Bukan galat.';
    RETURN;
  END IF;

  SELECT count(*) INTO n_bentrok FROM (
    SELECT a.parent_id, a.sort_order
      FROM menu_items a JOIN menu_items i ON i.id = a.parent_id
     WHERE a.is_active AND i.is_active AND i.parent_id IS NULL
     GROUP BY a.parent_id, a.sort_order HAVING count(*) > 1) x;
  IF n_bentrok > 0 THEN
    RAISE EXCEPTION '530 gagal: masih % sort_order bentrok di bawah grup akar', n_bentrok;
  END IF;

  SELECT count(*) INTO n_luar
    FROM menu_items a JOIN menu_items i ON i.id = a.parent_id
   WHERE a.is_active AND i.is_active AND i.parent_id IS NULL
     AND (a.sort_order <= i.sort_order OR a.sort_order > i.sort_order + 99);
  IF n_luar > 0 THEN
    RAISE EXCEPTION '530 gagal: masih % anak di luar rentang induk+1..induk+99', n_luar;
  END IF;

  /*
    Jarak 10 diperiksa, bukan diasumsikan: kalau ada grup yang anaknya lebih
    dari sembilan, `induk + 10*n` akan melewati induk+99 dan cek di atas sudah
    menangkapnya. Catatan ini menyebut angkanya supaya yang membaca log tahu
    berapa ruang sisip yang tersisa.
  */
  /*
    Jarak TERSEMPIT dilaporkan, bukan angka 10 yang dipaku.

    Pesan lamanya menyebut "berjarak 10" sementara jaraknya dihitung per grup
    dan bisa serapat 3 (g-keuangan, 28 anak). Pesan sukses yang menyebut angka
    yang tak berlaku adalah bentuk lain dari bohong ke pembacanya — dan hari
    ini sudah dua kali harus diperbaiki (320 dan 323).
  */
  SELECT GREATEST(1, LEAST(10, 99 / GREATEST(count(a.id), 1))) INTO n_jarak
    FROM menu_items i JOIN menu_items a ON a.parent_id = i.id AND a.is_active
   WHERE i.parent_id IS NULL AND i.is_active
   GROUP BY i.id ORDER BY 1 LIMIT 1;

  RAISE NOTICE '530 OK: % anak menu dinomori ulang, jarak tersempit %, nol bentrok, nol di luar rentang',
    n_anak, n_jarak;
END $$;
