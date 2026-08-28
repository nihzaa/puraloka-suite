-- ============================================================================
-- 516 · `protect_builtin_roles` mengunci role milik TENANT, bukan hanya template
-- ============================================================================
--
-- ══════════════════════════════════════════════════════════════════════════
-- CACATNYA: trigger yang lahir sebelum multi-tenant ada
-- ══════════════════════════════════════════════════════════════════════════
--
-- Migrasi 050 memasang trigger ini ketika basis masih SATU perusahaan:
--
--     IF OLD.is_builtin = true THEN
--       RAISE EXCEPTION 'Role bawaan tidak bisa dihapus';
--     END IF;
--
-- Saat itu benar. `is_builtin` berarti "role sistem", dan role sistem memang
-- tak boleh dihapus siapa pun.
--
-- Multi-tenant (migrasi 363) mengubah artinya tanpa mengubah triggernya.
-- Sekarang `roles` memuat DUA hal yang bentuknya sama:
--
--     company_id IS NULL      → TEMPLATE global, acuan provisioning
--     company_id IS NOT NULL  → SALINAN milik satu tenant
--
-- Dan `fn_instantiate_tenant_roles` (migrasi 506) menyalin `is_builtin` APA
-- ADANYA dari template. Jadi tiap tenant baru lahir dengan 20 role yang
-- ditandai `is_builtin = true` — lalu terkunci oleh trigger yang mengira
-- semuanya role sistem global.
--
-- Diukur 2026-08-29:
--
--     template global        : 21   (20 ber-is_builtin)
--     salinan milik tenant   : 1512 (1440 ber-is_builtin)  ← semuanya terkunci
--
-- Akibatnya bukan kasus langka, melainkan **perilaku default provisioning**:
-- begitu sebuah perusahaan di-onboard, adminnya tak akan pernah bisa menghapus
-- 20 dari 21 role bawaannya sendiri. Bukan karena kebijakan yang diputuskan
-- siapa pun — karena trigger tujuh ratus migrasi lalu tak tahu tenant itu ada.
--
-- Dan galatnya menyesatkan: "Role bawaan tidak bisa dihapus" terbaca seperti
-- aturan yang disengaja, jadi orang berhenti mencari.
--
-- ══════════════════════════════════════════════════════════════════════════
-- YANG DIUBAH
-- ══════════════════════════════════════════════════════════════════════════
--
-- Trigger kini hanya menolak DELETE atas TEMPLATE global. Salinan milik tenant
-- boleh dihapus pemiliknya sendiri — dan hanya oleh pemiliknya, karena RLS
-- (`tenant_isolation`, RESTRICTIVE) sudah menyaring baris mana yang terlihat.
-- Dua lapis dengan tugas berbeda: RLS menentukan MILIK SIAPA, trigger
-- menentukan APA YANG SISTEM.
--
-- Pesan galatnya juga ditulis ulang. Yang lama tak menyebut mengapa, sehingga
-- pembacanya tak bisa membedakan "ini memang dilarang" dari "ini cacat".
--
-- ── Yang TIDAK berubah
--
-- Template global (`company_id IS NULL`) tetap terlindungi persis seperti
-- semula. Menghapusnya akan membuat provisioning tenant berikutnya kehilangan
-- acuan — kegagalan yang baru terlihat saat pelanggan baru di-onboard, jauh
-- dari perbuatan yang menyebabkannya.
--
-- ── Idempoten: CREATE OR REPLACE FUNCTION, trigger tak disentuh.
-- ============================================================================

CREATE OR REPLACE FUNCTION protect_builtin_roles()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  /*
    Hanya TEMPLATE global yang dilindungi. Salinan per-tenant adalah data
    milik tenant itu — siapa yang boleh melihatnya sudah diputuskan RLS.
  */
  IF OLD.is_builtin = true AND OLD.company_id IS NULL THEN
    RAISE EXCEPTION
      'Role template global "%" tak bisa dihapus — ia acuan provisioning tenant baru. '
      'Role bawaan MILIK PERUSAHAAN boleh dihapus dari pengaturan peran.',
      OLD.name
      USING ERRCODE = 'restrict_violation';
  END IF;
  RETURN OLD;
END $$;

-- ── VERIFIKASI ──────────────────────────────────────────────────────────────
DO $$
DECLARE
  tmpl_terkunci int;
  tenant_bebas  int;
  def           text;
BEGIN
  /*
    Fungsi wajib benar-benar memuat syarat company_id — bukan sekadar
    "tak melempar". CREATE OR REPLACE yang gagal diam-diam meninggalkan versi
    lama, dan gejalanya baru muncul saat tenant mencoba menghapus role.
  */
  SELECT pg_get_functiondef(oid) INTO def
    FROM pg_proc WHERE proname = 'protect_builtin_roles';
  IF def IS NULL OR def !~ 'company_id IS NULL' THEN
    RAISE EXCEPTION '516 gagal: fungsi tak memuat syarat company_id IS NULL';
  END IF;

  SELECT count(*) INTO tmpl_terkunci
    FROM roles WHERE is_builtin AND company_id IS NULL;
  SELECT count(*) INTO tenant_bebas
    FROM roles WHERE is_builtin AND company_id IS NOT NULL;

  RAISE NOTICE
    '516 OK: % role template tetap terkunci; % role bawaan milik tenant kini bisa dihapus pemiliknya',
    tmpl_terkunci, tenant_bebas;
END $$;
