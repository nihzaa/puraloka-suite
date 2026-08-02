-- ============================================================
-- PURALOKA SUITE — Migration 174
-- GL-1d: arahkan menu Buku Besar & Jurnal ke halaman NYATA
-- ============================================================
--
-- ── Keadaan sebelum ini
--
-- `fn-gl` (Buku Besar) dan `fn-jurnal` (Jurnal Umum) sudah terdaftar di menu
-- registry, tapi keduanya menunjuk `/m/<key>` — halaman peta menu untuk
-- sub-menu yang belum punya halamannya sendiri.
--
-- Itu benar saat keduanya memang belum dibangun. Sekarang halamannya ada
-- (`/akuntansi`, GL-1d), jadi menunjuk `/m/` berarti fitur yang sudah hidup
-- tetap tak bisa dijangkau siapa pun dari menu — kelas cacat "berhasil tanpa
-- bisa dipakai" yang berulang di repo ini.
--
-- ── Kenapa satu halaman untuk dua menu
--
-- Buku Besar dan Jurnal Umum adalah dua cara MELIHAT data yang sama: jurnal
-- adalah catatannya, buku besar adalah tampilan per-akunnya. Memisahkannya
-- jadi dua halaman memaksa orang berpindah-pindah untuk pekerjaan yang sama.
--
-- `/akuntansi` memuat keduanya sebagai tab, plus neraca saldo. Kedua entri
-- menu dipertahankan karena orang mencarinya dengan dua nama berbeda —
-- akuntan mencari "Jurnal", pemilik mencari "Buku Besar".
--
-- ── Permission
--
-- `gl:view` (migrasi 171). Sebelumnya kosong (`[]`) — artinya menu tampil
-- untuk SEMUA orang, termasuk yang tak berhak melihat pembukuan.
-- ============================================================

UPDATE menu_items
   SET href = '/akuntansi',
       required_permissions = ARRAY['gl:view'],
       updated_at = now()
 WHERE key IN ('fn-gl', 'fn-jurnal');

-- ── Verifikasi ──────────────────────────────────────────────────────────────
-- Menu yang "diperbarui" tapi masih menunjuk /m/ akan mengulangi persis cacat
-- yang migrasi ini perbaiki — dan gejalanya cuma "halaman kosong", bukan error.
DO $$
DECLARE
  v_salah TEXT := '';
  r RECORD;
BEGIN
  FOR r IN SELECT key, href, required_permissions FROM menu_items
            WHERE key IN ('fn-gl', 'fn-jurnal') LOOP
    IF r.href <> '/akuntansi' THEN
      v_salah := v_salah || r.key || ' (href=' || COALESCE(r.href, 'NULL') || ') ';
    ELSIF NOT ('gl:view' = ANY(r.required_permissions)) THEN
      v_salah := v_salah || r.key || ' (tanpa gl:view) ';
    END IF;
  END LOOP;

  IF v_salah <> '' THEN
    RAISE EXCEPTION 'Menu GL tak terarah dengan benar sesudah migrasi 174: %', v_salah;
  END IF;
END $$;
