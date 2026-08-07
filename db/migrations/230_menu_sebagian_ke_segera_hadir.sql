-- ════════════════════════════════════════════════════════════════════════════
-- 230 — 22 menu berjanji lebih daripada yang ada di halamannya
--
-- ── Cacat yang diperbaiki (jenis D dari klasifikasi 87 item)
--
-- Sesudah migrasi 223–229, sisa item yang berbagi href terbagi jelas menurut
-- status yang tercatat di `peta-menu.ts`:
--
--   status `hidup`     isinya BENAR-BENAR ada di halaman induk. "Kas & Bank"
--                      di `/kas` memang menampilkan kas dan bank. Biarkan.
--
--   status `sebagian`  sebagian lapisnya ada (biasanya DB + API), tapi yang
--                      dijanjikan LABELNYA belum. "Work Order" menunjuk
--                      `/mandor`, dan halaman itu tak punya work order.
--
-- Yang kedua inilah yang merusak kepercayaan. Orang mengklik "Back-Charge",
-- mendarat di daftar mandor biasa, dan menyimpulkan salah satu dari dua hal:
-- fiturnya tak ada, atau ia tak bisa menemukannya. Keduanya salah, dan
-- keduanya membuatnya berhenti memakai sub-menu.
--
-- ── Kenapa `/m/<key>` lebih baik daripada halaman induk
--
-- `app/(dashboard)/m/[key]/page.tsx` bukan "coming soon" kosong. Ia menjawab
-- tiga hal, berbeda per menu: APA yang akan dikerjakan di sana, KENAPA belum
-- ada (dan "belum sempat" dibedakan dari "menunggu tender mensyaratkan"), dan
-- KE MANA sementara ini.
--
-- Jadi pilihannya bukan antara "halaman berisi" dan "halaman kosong",
-- melainkan antara **mendarat di tempat yang tak menjawab** dan **diberi tahu
-- keadaannya beserta jalan sementaranya**. Yang kedua lebih jujur, dan lebih
-- berguna.
--
-- Ini terasa mundur — sebuah menu "kehilangan" halamannya. Tapi yang hilang
-- hanyalah kesan bahwa fiturnya ada; kesan itu memang tak pernah benar.
--
-- ── Yang TIDAK ikut
--
-- Item berstatus `hidup` tetap di halaman induknya, meski berbagi href. Dua
-- nama untuk satu halaman yang benar-benar berisi adalah sinonim yang sah:
-- "Kas & Bank" (kelompok Keuangan) dan "Kas Kecil" (kelompok Keuangan) sama-
-- sama menuju `/kas`, dan keduanya benar. Yang menyala di sidebar diatur
-- `lib/menu-berbagi-href.ts`.
--
-- ── Idempoten: UPDATE menetapkan nilai akhir.
-- ════════════════════════════════════════════════════════════════════════════

UPDATE menu_items SET href = '/m/' || key
 WHERE key IN (
   -- /mandor — halaman daftar mandor; tak satu pun dari ini ada di sana
   'kt-subkon', 'lp-tenaga', 'md-subkon', 'sk-backcharge',
   'sk-kontrak', 'sk-paket', 'sk-wo',
   -- /procurement — halaman ringkasan pengadaan
   'iv-gudang', 'iv-minstok', 'md-gudang',
   -- /estimasi — sudah bertab, tapi keempat ini tak punya tabnya
   'cc-acl', 'crm-boq', 'md-cost-code', 'sy-import',
   -- /proyek — daftar proyek.
   --
   -- `bi-proyek` ("Dashboard per Proyek") SENGAJA TIDAK ikut: ia satu-satunya
   -- jalan masuk ke halaman daftar proyek. Versi pertama migrasi ini
   -- memindahkan ketiganya, dan `audit-nav-yatim.mjs` langsung merah —
   -- `/proyek` jadi hanya bisa dibuka dengan mengetik URL.
   'kt-register', 'lp-serah',
   -- lain-lain
   'fn-aset-tetap', 'hr-reimburse', 'tg-tambah', 'bi-kpi', 'crm-lead');

-- ------------------------------------------------------------
-- Verifikasi
-- ------------------------------------------------------------
DO $$
DECLARE
  v_hilang TEXT;
  v_salah  TEXT;
  v_kunci  TEXT[] := ARRAY[
    'kt-subkon','lp-tenaga','md-subkon','sk-backcharge','sk-kontrak','sk-paket','sk-wo',
    'iv-gudang','iv-minstok','md-gudang',
    'cc-acl','crm-boq','md-cost-code','sy-import',
    'kt-register','lp-serah',
    'fn-aset-tetap','hr-reimburse','tg-tambah','bi-kpi','crm-lead'];
BEGIN
  SELECT string_agg(k, ', ' ORDER BY k) INTO v_hilang
    FROM unnest(v_kunci) AS k
   WHERE NOT EXISTS (SELECT 1 FROM menu_items mi WHERE mi.key = k);
  IF v_hilang IS NOT NULL THEN
    RAISE EXCEPTION '230 gagal: key menu tidak ada: %', v_hilang;
  END IF;

  SELECT string_agg(key || '=' || href, ', ' ORDER BY key) INTO v_salah
    FROM menu_items
   WHERE key = ANY(v_kunci) AND href <> '/m/' || key;
  IF v_salah IS NOT NULL THEN
    RAISE EXCEPTION '230 gagal: href tidak /m/<key>: %', v_salah;
  END IF;
END $$;
