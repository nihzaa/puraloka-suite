-- ============================================================================
-- 251 — MENU PENYEDIA AI (TJS-B1)
-- ============================================================================
--
-- Mendaftarkan `/pengaturan/penyedia-ai` di grup Administrasi, TEPAT SESUDAH
-- Kredensial & Integrasi. Kedekatan itu disengaja: kunci API-nya di sana,
-- model & batas biayanya di sini. Admin yang baru memasang kunci Anthropic
-- akan bertanya "sekarang modelnya apa" — dan jawabannya menu berikutnya.
--
-- Menaruhnya jauh (mis. paling bawah) membuat dua halaman yang selalu dipakai
-- berpasangan terpisah oleh enam menu lain.
--
-- ── Disaring `settings:ai:view`, bukan `:manage`
--
-- Alasan yang sama seperti menu Kredensial dan Jadwal: halaman ini menjawab
-- "kenapa tagihan AI naik" dan "kenapa asisten berhenti menjawab". Yang paling
-- butuh menanyakannya sering bukan orang yang berwenang mengubah konfigurasinya.
--
-- Menyembunyikan halaman dari yang tak boleh mengubah membuat mereka bertanya
-- ke dukungan alih-alih membaca angkanya sendiri.
-- ============================================================================

-- Geser dari BAWAH ke atas supaya tak pernah ada dua baris ber-sort_order sama
-- di tengah transaksi. Urutan terbalik itu bukan gaya — UNIQUE-nya tak ada,
-- tapi blok verifikasi di bawah menolak bentrok, dan menggeser dari atas
-- membuat bentrok sementara yang lolos karena tak ada constraint.
UPDATE menu_items SET sort_order = 1612 WHERE key = 'sistem'          AND sort_order = 1611;
UPDATE menu_items SET sort_order = 1611 WHERE key = 'audit'           AND sort_order = 1610;
UPDATE menu_items SET sort_order = 1610 WHERE key = 'pengaturan-jadwal' AND sort_order = 1609;

INSERT INTO menu_items (
  key, label, href, icon, sort_order, section,
  parent_id, is_active, kesiapan, required_permissions
)
VALUES (
  'pengaturan-penyedia-ai', 'Penyedia AI', '/pengaturan/penyedia-ai', 'Dot',
  1609, 'main',
  (SELECT id FROM menu_items WHERE key = 'g-administrasi'),
  true, 'hidup', ARRAY['settings:ai:view']
)
ON CONFLICT (key) DO UPDATE SET
  label = EXCLUDED.label, href = EXCLUDED.href,
  sort_order = EXCLUDED.sort_order, parent_id = EXCLUDED.parent_id,
  is_active = true, kesiapan = EXCLUDED.kesiapan,
  required_permissions = EXCLUDED.required_permissions;

-- ------------------------------------------------------------
-- Verifikasi — pola migrasi 142.
-- ------------------------------------------------------------
DO $$
DECLARE v_bentrok INT;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM menu_items WHERE key = 'pengaturan-penyedia-ai') THEN
    RAISE EXCEPTION '251 gagal: menu pengaturan-penyedia-ai tidak terbentuk';
  END IF;

  -- R-1: satu href tepat satu menu aktif. Dua menu ke halaman yang sama
  -- membuat sorotan sidebar berpindah-pindah tanpa sebab yang terlihat.
  IF (SELECT count(*) FROM menu_items WHERE href = '/pengaturan/penyedia-ai' AND is_active) <> 1 THEN
    RAISE EXCEPTION '251 gagal: href /pengaturan/penyedia-ai tidak tepat satu menu aktif (R-1)';
  END IF;

  SELECT count(*) INTO v_bentrok FROM (
    SELECT sort_order FROM menu_items
    WHERE parent_id = (SELECT id FROM menu_items WHERE key = 'g-administrasi') AND is_active
    GROUP BY sort_order HAVING count(*) > 1
  ) s;
  IF v_bentrok > 0 THEN
    RAISE EXCEPTION '251 gagal: % sort_order bentrok di grup Administrasi', v_bentrok;
  END IF;

  -- Permission-nya harus benar-benar ada, bukan nama yang salah ketik. Menu
  -- yang menyaring permission tak dikenal tidak pernah terlihat siapa pun —
  -- dan gejalanya "halamannya hilang", bukan "ada yang salah".
  IF NOT EXISTS (SELECT 1 FROM permissions WHERE key = 'settings:ai:view') THEN
    RAISE EXCEPTION '251 gagal: permission settings:ai:view tidak ada';
  END IF;
END $$;
