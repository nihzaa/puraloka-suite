-- ============================================================
-- PURALOKA SUITE — Migration 171
-- GL-1c: capability buku besar
-- ============================================================
--
-- ── ADR-004: permission adalah arsitektur, role adalah konfigurasi
--
-- Kode HANYA boleh memeriksa capability (`requirePermission('gl:...')`),
-- tak pernah nama jabatan. Role yang memegang capability ini bisa diubah
-- lewat UI tanpa menyentuh kode.
--
-- ── Empat capability, dan kenapa dipisah begitu
--
-- `gl:view`      melihat bagan akun, jurnal, buku besar
-- `gl:manage`    membuat & menyunting jurnal DRAFT + mengelola bagan akun
-- `gl:post`      MEM-POSTING jurnal — memindahkannya jadi catatan permanen
-- `gl:void`      MEMBATALKAN jurnal yang sudah di-posting
--
-- `post` dan `void` dipisah dari `manage` bukan demi kerumitan: menyusun
-- jurnal dan mengesahkannya adalah dua tanggung jawab berbeda di setiap
-- pembukuan yang sehat. Staf keuangan menyusun; yang berwenang mengesahkan.
-- Menggabungkannya menghapus pemisahan itu secara struktural — dan
-- memisahkannya nanti jauh lebih mahal daripada sekarang.
--
-- ── Siapa yang mendapatkannya (Engineering Default Rule #3)
--
-- Diturunkan MEKANIS dari capability yang sudah ada, bukan dari nama role:
--
--   gl:view    → siapa pun yang punya `finance:view`
--   gl:manage  → siapa pun yang punya `finance:manage`
--   gl:post    → siapa pun yang punya `finance:manage`
--   gl:void    → siapa pun yang punya `finance:manage`
--
-- Scope-nya IDENTIK dengan yang sudah berlaku untuk pembukuan lain
-- (invoice, pembayaran, pajak), jadi ini behavior-preserving: tak ada role
-- yang mendapat akses baru yang sebelumnya tak ia punya.
--
-- Pemisahan post/void baru bermakna saat founder memutuskan role mana yang
-- kehilangannya — itu keputusan konfigurasi lewat UI, bukan migrasi.
-- ============================================================

INSERT INTO permissions (key, module, label, description, sort_order)
VALUES
  ('gl:view',   'keuangan', 'Lihat Buku Besar',
   'Melihat bagan akun, jurnal, dan buku besar', 700),
  ('gl:manage', 'keuangan', 'Kelola Jurnal & Bagan Akun',
   'Membuat/menyunting jurnal draft dan mengelola Chart of Accounts', 701),
  ('gl:post',   'keuangan', 'Posting Jurnal',
   'Mengesahkan jurnal menjadi catatan permanen yang tak bisa diubah', 702),
  ('gl:void',   'keuangan', 'Batalkan Jurnal',
   'Membatalkan jurnal yang sudah di-posting (jejaknya tetap tercatat)', 703)
ON CONFLICT (key) DO NOTHING;

-- ── Derivasi ke role: dari CAPABILITY yang setara, bukan nama jabatan ───────
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r CROSS JOIN permissions p
 WHERE p.key = 'gl:view'
   AND EXISTS (SELECT 1 FROM role_permissions rp JOIN permissions p2 ON p2.id = rp.permission_id
                WHERE rp.role_id = r.id AND p2.key = 'finance:view')
ON CONFLICT DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r CROSS JOIN permissions p
 WHERE p.key IN ('gl:manage', 'gl:post', 'gl:void')
   AND EXISTS (SELECT 1 FROM role_permissions rp JOIN permissions p2 ON p2.id = rp.permission_id
                WHERE rp.role_id = r.id AND p2.key = 'finance:manage')
ON CONFLICT DO NOTHING;

-- ── Verifikasi: capability benar-benar sampai ke role ───────────────────────
-- Migrasi permission yang "berhasil" tanpa satu role pun memegangnya
-- menghasilkan menu yang tak bisa dibuka siapa-siapa — dan gejalanya cuma
-- "halaman kosong", bukan error.
DO $$
DECLARE
  v_kurang TEXT := '';
  r RECORD;
BEGIN
  FOR r IN SELECT unnest(ARRAY['gl:view','gl:manage','gl:post','gl:void']) AS k LOOP
    IF NOT EXISTS (
      SELECT 1 FROM role_permissions rp
        JOIN permissions p ON p.id = rp.permission_id
       WHERE p.key = r.k
    ) THEN
      v_kurang := v_kurang || r.k || ' ';
    END IF;
  END LOOP;

  IF v_kurang <> '' THEN
    RAISE EXCEPTION
      'Capability GL tak dipegang role mana pun sesudah migrasi 171: %. '
      'Menu buku besar akan tampil kosong untuk semua orang.', v_kurang;
  END IF;
END $$;
