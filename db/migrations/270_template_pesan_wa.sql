-- ============================================================================
-- 270 — TEMPLATE PESAN WhatsApp: isi pesan jadi DATA, bukan kode
-- ============================================================================
--
-- ── Masalahnya diukur, bukan diduga
--
-- Seluruh teks pesan WhatsApp hari ini adalah literal di kode:
-- `wa-nomor.ts:142` (kode verifikasi), `wa-webhook.ts:200` (penolakan izin).
-- Mengubah satu kata berarti deploy — dan pemilik yang ingin nada pesannya
-- berbeda tak punya jalan sama sekali.
--
-- ── Pembagian tanggung jawab, ditiru dari TJS
--
-- `automation-tjs/.../lib/wa/templates.ts` memisahkan ISI dari STATUS
-- PENYEDIA, dengan alasan yang tepat: "template yang sama bisa punya status
-- berbeda di penyedia berbeda: disetujui di Meta, belum diajukan di BSP lain.
-- Satu kolom status tidak bisa mewakili itu."
--
-- Pembagian itu ditiru. Yang BERBEDA: TJS menaruh isinya di
-- `notification_templates` yang sudah ada; di sini `notification_rules` TIDAK
-- punya kolom teks sama sekali (diukur — hanya event_type, label, description,
-- is_active). Jadi tabel isinya dibuat baru.
--
-- ── Kenapa penting, dan ini bukan soal kerapian
--
-- TJS mencatatnya: penyedia RESMI (Meta dan BSP di atasnya) MELARANG pesan
-- bebas di luar jendela 24 jam. Yang boleh hanya template yang sudah
-- disetujui, dan persetujuannya 1-2 hari kerja.
--
-- Puraloka hari ini memakai Evolution (tak resmi, bebas kirim). Begitu satu
-- tenant pindah ke penyedia resmi, notifikasi berhenti total — dan tanpa
-- tabel ini, memperbaikinya butuh menulis ulang tiap literal di kode.
--
-- ── Placeholder: DAFTAR TERTUTUP, bukan interpolasi bebas
--
-- Template memuat `{{nama}}`, `{{nomor_invoice}}`, dsb. Yang bisa diisi hanya
-- yang terdaftar di `variabel` — dan itu disengaja:
--
--   1. `{{apapun}}` yang tak dikenal akan tampil MENTAH di WhatsApp pelanggan
--      kalau tak divalidasi. Pesan yang berisi "{{nama_klien}}" terbaca
--      sebagai sistem yang rusak.
--   2. Interpolasi bebas dari objek apa pun berarti satu template yang salah
--      tulis bisa membocorkan field yang tak dimaksudkan — mis. `{{api_key}}`
--      kalau konteksnya kebetulan memuatnya.
-- ============================================================================

CREATE TABLE IF NOT EXISTS wa_template (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,

  /*
   * Kode template — dipakai KODE untuk mencarinya.
   *
   * Bukan id: kode yang stabil membuat pemanggil tak perlu tahu id baris, dan
   * template bisa diganti isinya tanpa menyentuh satu baris kode pun.
   */
  kode        TEXT NOT NULL,
  label       TEXT NOT NULL,
  isi         TEXT NOT NULL,

  /*
   * Variabel yang BOLEH dipakai template ini.
   *
   * Daftar tertutup — lihat alasan di kepala berkas. Disimpan per template,
   * bukan global, karena konteks tiap peristiwa berbeda: template verifikasi
   * punya `{{kode}}`, template invoice punya `{{nomor_invoice}}`, dan
   * mencampurnya berarti template bisa memakai variabel yang saat dikirim
   * tak punya nilai.
   */
  variabel    TEXT[] NOT NULL DEFAULT '{}',

  aktif       BOOLEAN NOT NULL DEFAULT true,
  dibuat_pada TIMESTAMPTZ NOT NULL DEFAULT now(),
  diperbarui_pada TIMESTAMPTZ NOT NULL DEFAULT now(),
  diperbarui_oleh UUID REFERENCES users(id) ON DELETE SET NULL,

  -- Satu kode tepat satu template per tenant. Dua template berkode sama
  -- membuat pemanggil mendapat yang mana saja — dan bedanya baru terlihat
  -- saat pelanggan menerima pesan yang salah.
  UNIQUE (company_id, kode)
);

CREATE INDEX IF NOT EXISTS idx_wa_template_cari ON wa_template (company_id, kode, aktif);

COMMENT ON TABLE wa_template IS
  'Isi pesan WhatsApp sebagai DATA. Sebelum tabel ini seluruh teks adalah '
  'literal di kode (wa-nomor.ts:142, wa-webhook.ts:200) dan mengubah satu kata '
  'butuh deploy. Placeholder dibatasi daftar tertutup `variabel`.';

-- ── Status di sisi PENYEDIA — terpisah, mengikuti pelajaran TJS ────────────
--
-- Template yang sama bisa disetujui di satu penyedia dan belum diajukan di
-- penyedia lain. Satu kolom status di tabel isi tak bisa mewakili itu.
CREATE TABLE IF NOT EXISTS wa_template_penyedia (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  template_id UUID NOT NULL REFERENCES wa_template(id) ON DELETE CASCADE,
  penyedia_id UUID NOT NULL REFERENCES penyedia_layanan(id) ON DELETE CASCADE,

  /** 'belum_diajukan' | 'menunggu' | 'disetujui' | 'ditolak'. */
  status      TEXT NOT NULL DEFAULT 'belum_diajukan',
  /** Nama template di sisi penyedia — bisa berbeda dari `kode` kita. */
  nama_penyedia TEXT,
  alasan_tolak  TEXT,
  diperbarui_pada TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE (template_id, penyedia_id)
);

-- ── RLS: pola yang sama dengan 260/263/266/269 ─────────────────────────────
ALTER TABLE wa_template ENABLE ROW LEVEL SECURITY;
ALTER TABLE wa_template_penyedia ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS wa_tpl_dasar ON wa_template;
CREATE POLICY wa_tpl_dasar ON wa_template FOR ALL USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS tenant_isolation ON wa_template;
CREATE POLICY tenant_isolation ON wa_template
  AS RESTRICTIVE FOR ALL
  USING (company_id = (SELECT auth_company_id()))
  WITH CHECK (company_id = (SELECT auth_company_id()));

DROP POLICY IF EXISTS wa_tpl_p_dasar ON wa_template_penyedia;
CREATE POLICY wa_tpl_p_dasar ON wa_template_penyedia FOR ALL USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS tenant_isolation ON wa_template_penyedia;
CREATE POLICY tenant_isolation ON wa_template_penyedia
  AS RESTRICTIVE FOR ALL
  USING (company_id = (SELECT auth_company_id()))
  WITH CHECK (company_id = (SELECT auth_company_id()));

-- ── Permission ─────────────────────────────────────────────────────────────
INSERT INTO permissions (key, label, description, module, sort_order)
VALUES ('settings:wa:template', 'Kelola Template WhatsApp',
        'Mengubah isi pesan WhatsApp tanpa deploy', 'settings', 42)
ON CONFLICT (key) DO NOTHING;

-- ── Template bawaan: yang HARI INI hardcoded ───────────────────────────────
--
-- Isinya disalin PERSIS dari kode supaya perilakunya tak berubah saat
-- pemanggilnya beralih ke tabel ini. Perubahan nada adalah keputusan pemilik,
-- bukan efek samping migrasi.
INSERT INTO wa_template (company_id, kode, label, isi, variabel)
SELECT c.id, v.kode, v.label, v.isi, v.variabel
  FROM companies c
 CROSS JOIN (VALUES
   ('verifikasi_nomor', 'Kode verifikasi nomor',
    E'Kode verifikasi Puraloka Suite: {{kode}}\n\nBerlaku {{menit}} menit. Jangan bagikan kode ini kepada siapa pun — termasuk yang mengaku dari Puraloka.',
    ARRAY['kode', 'menit']),
   ('asisten_tanpa_izin', 'Asisten — peran tanpa izin',
    'Peran Anda belum memiliki akses ke asisten. Hubungi admin perusahaan.',
    ARRAY[]::text[]),
   ('asisten_gagal', 'Asisten — sedang tak bisa dihubungi',
    'Asisten sedang tidak bisa dihubungi. Coba lagi sebentar lagi.',
    ARRAY[]::text[])
 ) AS v(kode, label, isi, variabel)
 WHERE EXISTS (SELECT 1 FROM company_members m WHERE m.company_id = c.id)
ON CONFLICT (company_id, kode) DO NOTHING;

-- ------------------------------------------------------------
-- Verifikasi — pola migrasi 142.
-- ------------------------------------------------------------
DO $$
DECLARE n int; v_comp UUID; v_isi TEXT;
BEGIN
  IF to_regclass('public.wa_template') IS NULL
     OR to_regclass('public.wa_template_penyedia') IS NULL THEN
    RAISE EXCEPTION '270 gagal: tabel tidak terbentuk';
  END IF;

  SELECT count(*) INTO n FROM pg_policies
   WHERE tablename IN ('wa_template', 'wa_template_penyedia')
     AND policyname = 'tenant_isolation' AND permissive = 'RESTRICTIVE';
  IF n <> 2 THEN
    RAISE EXCEPTION '270 gagal: tenant_isolation belum RESTRICTIVE di kedua tabel';
  END IF;

  SELECT c.id INTO v_comp FROM companies c
   WHERE EXISTS (SELECT 1 FROM company_members m WHERE m.company_id = c.id) LIMIT 1;

  IF v_comp IS NOT NULL THEN
    -- Ketiga template bawaan WAJIB ada; pemanggil yang beralih ke tabel ini
    -- akan mengirim pesan KOSONG kalau salah satunya hilang.
    SELECT count(*) INTO n FROM wa_template
     WHERE company_id = v_comp
       AND kode IN ('verifikasi_nomor', 'asisten_tanpa_izin', 'asisten_gagal');
    IF n <> 3 THEN
      RAISE EXCEPTION '270 gagal: template bawaan tidak lengkap (% dari 3)', n;
    END IF;

    -- Template verifikasi WAJIB memuat placeholder kodenya. Tanpa itu,
    -- pengguna menerima pesan yang menyuruhnya memasukkan kode yang tak
    -- pernah disebut.
    SELECT isi INTO v_isi FROM wa_template
     WHERE company_id = v_comp AND kode = 'verifikasi_nomor';
    IF position('{{kode}}' in v_isi) = 0 THEN
      RAISE EXCEPTION '270 gagal: template verifikasi tak memuat {{kode}}';
    END IF;

    -- Kode ganda per tenant WAJIB ditolak.
    BEGIN
      INSERT INTO wa_template (company_id, kode, label, isi)
      VALUES (v_comp, 'verifikasi_nomor', 'Ganda', 'x');
      RAISE EXCEPTION '270 gagal: kode template ganda tidak ditolak';
    EXCEPTION WHEN unique_violation THEN NULL;
    END;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM permissions WHERE key = 'settings:wa:template') THEN
    RAISE EXCEPTION '270 gagal: permission settings:wa:template tidak ada';
  END IF;
END $$;
