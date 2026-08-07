-- ════════════════════════════════════════════════════════════════════════════
-- 224 — 19 menu per-proyek mendarat di DAFTAR proyek, bukan di isinya
--
-- ── Cacat yang diperbaiki (T-3, bagian kedua)
--
-- "Kurva S", "Gantt Chart", "Change Order", "Milestone", "Denda Keterlambatan"
-- — semuanya dikerjakan PER PROYEK. Ia hidup di dalam halaman detail proyek,
-- bukan sebagai halaman tersendiri.
--
-- Menunya menunjuk `/proyek`, yaitu DAFTAR proyek. Jadi yang mengklik "Kurva S"
-- mendapat tabel berisi 15 proyek dan tak satu pun kurva. Ia harus menebak
-- proyek mana, membukanya, lalu menggulir mencari bagian yang dicari.
--
-- ── Yang mengejutkan: penyelesaiannya SUDAH DIBANGUN, tapi tak pernah dipasang
--
-- `peta-menu.ts` punya field `tabProyek`, dan `app/(dashboard)/m/[key]/page.tsx`
-- (baris 214-236) sudah menampilkan **daftar proyek untuk dipilih**, lalu
-- menautkannya ke `/proyek/<id>#<anchor>`. Komentarnya bahkan menyatakan
-- niatnya: *"Ini yang membuat halaman tetap BERGUNA, bukan sekadar
-- pemberitahuan."*
--
-- Seluruh mekanismenya jadi. Yang tak pernah dikerjakan: mengarahkan menunya
-- ke sana. Jadi kode itu tak pernah dijalankan satu kali pun.
--
-- ── Dan cacat kedua di dalamnya
--
-- Nilai `tabProyek` TIDAK cocok dengan `id` anchor yang sebenarnya ada:
--
--     tabProyek        id nyata di proyek/[id]/page.tsx
--     'kurva-s'   →    id="sec-kurvas"
--     'change-order' → id="sec-co"
--     'look-ahead' →   id="sec-lookahead"
--     'kontrak'   →    (tak ada anchor sama sekali)
--
-- Tak satu pun dari 19 tautan itu akan menggulir ke tujuannya; semuanya
-- mendarat di puncak halaman. Fitur yang dibangun rapi, diberi komentar
-- panjang, dan tak pernah bekerja — karena tak pernah dipanggil.
--
-- Diperbaiki di `peta-menu.ts` bersama migrasi ini.
--
-- ── Kenapa `/m/<key>` dan bukan langsung ke proyek
--
-- Menu sidebar adalah tautan TETAP; ia tak tahu proyek mana yang dimaksud.
-- `/m/<key>` menjawabnya dengan menanyakan — satu klik tambahan, tapi klik
-- yang MENJAWAB, bukan klik yang mendarat di tempat salah.
--
-- ── Idempoten: UPDATE menetapkan nilai akhir.
-- ════════════════════════════════════════════════════════════════════════════

UPDATE menu_items SET href = '/m/' || key
 WHERE key IN (
   -- Kontrak (bagian info kontrak di halaman proyek)
   'crm-bidbond', 'kt-eot', 'kt-ld', 'kt-bond', 'kt-co',
   -- Jadwal & progres
   'jd-wbs', 'jd-gantt', 'jd-kurva-s', 'jd-lookahead', 'jd-milestone', 'jd-evm',
   -- Biaya
   'cc-rab', 'cc-etc', 'cc-bac',
   -- Lapangan
   'sk-opname', 'lp-dpr', 'lp-cuaca', 'lp-foto',
   -- Dokumen
   'dk-register');

-- ------------------------------------------------------------
-- Verifikasi
-- ------------------------------------------------------------
DO $$
DECLARE
  v_hilang TEXT;
  v_salah  TEXT;
  v_kunci  TEXT[] := ARRAY[
    'crm-bidbond','kt-eot','kt-ld','kt-bond','kt-co',
    'jd-wbs','jd-gantt','jd-kurva-s','jd-lookahead','jd-milestone','jd-evm',
    'cc-rab','cc-etc','cc-bac',
    'sk-opname','lp-dpr','lp-cuaca','lp-foto','dk-register'];
BEGIN
  SELECT string_agg(k, ', ' ORDER BY k) INTO v_hilang
    FROM unnest(v_kunci) AS k
   WHERE NOT EXISTS (SELECT 1 FROM menu_items mi WHERE mi.key = k);
  IF v_hilang IS NOT NULL THEN
    RAISE EXCEPTION '224 gagal: key menu tidak ada: %', v_hilang;
  END IF;

  -- href WAJIB `/m/<key>` persis. `'/m/' || key` mustahil salah ketik, tapi
  -- pemeriksaan ini yang menangkap kalau migrasi berikutnya menimpanya.
  SELECT string_agg(key || '=' || href, ', ' ORDER BY key) INTO v_salah
    FROM menu_items
   WHERE key = ANY(v_kunci) AND href <> '/m/' || key;
  IF v_salah IS NOT NULL THEN
    RAISE EXCEPTION '224 gagal: href tidak /m/<key>: %', v_salah;
  END IF;
END $$;
