-- ════════════════════════════════════════════════════════════════════════════
-- 443 — MENU: Dokumen Penawaran
--
-- Halaman `/tender/penawaran` dibangun bersama migrasi 407. Tanpa baris menu
-- ini ia YATIM: hanya bisa dibuka dengan mengetik URL, dan `audit-nav-yatim`
-- memerahkannya dengan benar.
--
-- ── Kenapa sub-menu di bawah Register Tender, bukan menu setara
--
-- Penawaran adalah DOKUMEN dari sebuah tender. Menaruhnya sejajar membuat dua
-- entri teratas yang menjawab pertanyaan yang sama ("tender apa saja?"), dan
-- yang membacanya harus menebak mana yang ia butuhkan.
--
-- ── Kenapa kunci `crm-proposal`, bukan kunci baru
--
-- `peta-menu.ts` sudah memakai kunci itu untuk entri yang SAMA — dulu
-- berstatus `rencana` tanpa href. Membuat kunci baru berarti dua entri untuk
-- satu halaman, dan `audit-peta-menu-vs-db` memerahkannya dengan benar:
-- halaman `/m/<key>` untuk kunci yang hanya ada di basis akan menampilkan
-- "Menu tidak dikenal".
--
-- Versi pertama migrasi ini memakai `tender-penawaran` dan tertangkap penjaga
-- itu (124 -> 125). Pelajarannya: kunci menu adalah kontrak antara basis dan
-- `peta-menu.ts`, bukan penamaan bebas.
--
-- ── Izin: `projects:view`, sama dengan Register Tender
--
-- Alasan yang sama tertulis di migrasi 148: menambah permission baru berarti
-- menambah baris yang harus di-seed ke TIAP role, dan satu role yang terlewat
-- membuat menunya hilang tanpa satu pun pesan kesalahan.
--
-- Yang MENULIS penawaran tetap dijaga `projects:edit` di rutenya — melihat
-- daftar dan menyunting surat memang dua hal berbeda.
--
-- Idempoten; verifikasi GAGAL KERAS.
-- ════════════════════════════════════════════════════════════════════════════

BEGIN;

INSERT INTO menu_items (key, label, href, icon, required_permissions, sort_order, section, is_active)
VALUES (
  'crm-proposal', 'Dokumen Penawaran', '/tender/penawaran', 'FileText',
  ARRAY['projects:view'],
  -- 104 — di dalam rentang grup `g-crm-tender` (100), tepat sesudah
  -- `crm-lead` (103).
  --
  -- Versi pertama memakai 27 karena menyalin pola migrasi 148, yang memang
  -- item TOP-LEVEL. `crm-proposal` bukan: ia sudah jadi ANAK `g-crm-tender`
  -- sejak migrasi 153, dan nomor di luar rentang induknya membuat urutannya
  -- jatuh ke tie-break, bukan ke niat siapa pun. `audit-sidebar-urutan`
  -- menangkapnya sebagai "anak di luar rentang".
  104, 'main', true
)
ON CONFLICT (key) DO UPDATE
  SET label = EXCLUDED.label,
      href = EXCLUDED.href,
      icon = EXCLUDED.icon,
      required_permissions = EXCLUDED.required_permissions,
      sort_order = EXCLUDED.sort_order,
      section = EXCLUDED.section,
      is_active = true,
      updated_at = now();

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM menu_items
     WHERE key = 'crm-proposal' AND is_active AND href = '/tender/penawaran'
       AND sort_order = 104
  ) THEN
    RAISE EXCEPTION '408 GAGAL: menu Dokumen Penawaran tak terpasang/aktif';
  END IF;
  RAISE NOTICE '443 OK: menu Dokumen Penawaran aktif di grup g-crm-tender (sort 104)';
END $$;

COMMIT;
