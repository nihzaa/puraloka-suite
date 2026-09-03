-- ═══════════════════════════════════════════════════════════════════════════
-- 564 — SITUS_DOMAIN: satu perusahaan, banyak alamat
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Permintaan founder 2026-09-04, persis kalimatnya: *"default-nya pakai
-- subdomainnya sendiri, tapi kalau perusahaan punya domain sendiri juga bisa."*
--
-- Dua jalur, bukan salah satu:
--
--   default   `porto.<slug>.duckdns.org`   diberikan otomatis saat provisioning
--   opsional  `ptmakmur.co.id`             dibawa pelanggan sendiri
--
-- Dibuka sesudah GERBANG MUTLAK dicabut founder (STATUS.md baris 101,
-- RATIFIKASI 2026-09-04). Kelima prasyarat ADR-011 §9.5 diukur lunas: P1 nol
-- DEFAULT_COMPANY_ID · P2 kill-switch 9/9 dua arah · P3 293 tabel
-- terklasifikasi · T5A hijau · ratchet tenancy ambang 2.
--
-- ── Kenapa TABEL, bukan kolom di `companies`
--
-- Satu perusahaan bisa punya BEBERAPA alamat sekaligus, dan itu bukan kasus
-- langka melainkan bentuk normalnya: subdomain bawaan tetap hidup sebagai
-- cadangan sementara domain sendiri dipasang, lalu keduanya jalan bersamaan
-- supaya tautan lama tak mati.
--
-- Kolom tunggal memaksa memilih salah satu, dan yang memilih akan mematikan
-- tautan yang sudah tersebar.
--
-- ── Kenapa `host` yang UNIK, bukan (company_id, host)
--
-- Satu hostname hanya boleh menunjuk SATU perusahaan. Kalau dua perusahaan
-- bisa mengklaim host yang sama, resolusi tenant jadi ambigu — dan yang
-- menang adalah siapa pun yang barisnya kebetulan lebih dulu dibaca.
--
-- Itu bukan cacat tampilan: pengunjung `ptmakmur.co.id` bisa melihat profil
-- perusahaan lain, lengkap dengan proyek dan legalitasnya.
--
-- ── Kategori tenancy: B (milik tenant)
--
-- Barisnya milik satu company dan wajib disaring. Dipagari PERMISSIVE +
-- RESTRICTIVE seperti tabel ber-tenant lain (pola migrasi 131).
--
-- ⚠ Kecuali SATU jalur baca: resolusi tenant terjadi SEBELUM tenant diketahui
-- — itu ayam-dan-telur. Jalur itu memakai fungsi SECURITY DEFINER di bawah,
-- yang hanya memulangkan `company_id` untuk satu host, tak pernah isinya.
--
-- Idempoten: aman dijalankan berkali-kali.

CREATE TABLE IF NOT EXISTS situs_domain (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id   UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,

  -- Hostname TANPA skema dan TANPA port. Disimpan huruf kecil supaya
  -- pencocokan tak pernah bergantung pada cara pengunjung mengetik.
  host         TEXT NOT NULL,

  -- `bawaan` = subdomain yang kita berikan; `kustom` = domain milik pelanggan.
  -- Bedanya bukan kosmetik: yang `kustom` butuh verifikasi kepemilikan sebelum
  -- boleh menyajikan konten, yang `bawaan` tidak (kita yang memilikinya).
  jenis        TEXT NOT NULL DEFAULT 'bawaan',

  -- ⚠ Domain KUSTOM lahir BELUM terverifikasi.
  --
  -- Tanpa ini, siapa pun bisa mendaftarkan `bca.co.id` dan menyajikan
  -- profilnya di sana begitu DNS-nya kebetulan mengarah ke kita. Verifikasi
  -- kepemilikan (TXT record) adalah syarat menyalakan, bukan formalitas.
  --
  -- Subdomain `bawaan` terverifikasi sejak lahir — domainnya milik kita.
  terverifikasi BOOLEAN NOT NULL DEFAULT false,
  token_verifikasi TEXT,

  -- Satu perusahaan boleh punya beberapa host; SATU di antaranya utama —
  -- dipakai untuk tautan kanonik dan `<link rel="canonical">`.
  utama        BOOLEAN NOT NULL DEFAULT false,

  aktif        BOOLEAN NOT NULL DEFAULT true,
  dibuat_pada  TIMESTAMPTZ NOT NULL DEFAULT now(),
  diubah_pada  TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT situs_domain_jenis_sah CHECK (jenis IN ('bawaan', 'kustom')),

  -- Host WAJIB huruf kecil, tanpa skema, tanpa garis miring, tanpa port.
  -- Ditegakkan di basis karena satu baris salah bentuk membuat resolusi
  -- tenant gagal senyap — dan gagalnya terlihat seperti "situs mati".
  CONSTRAINT situs_domain_host_bentuk CHECK (
    host = lower(host)
    AND host !~ '[/:]'
    AND host ~ '^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$'
  )
);

-- Satu host = satu perusahaan. Alasannya di kepala berkas.
CREATE UNIQUE INDEX IF NOT EXISTS situs_domain_host_unik ON situs_domain (host);

-- Paling banyak SATU host utama per perusahaan.
CREATE UNIQUE INDEX IF NOT EXISTS situs_domain_satu_utama
  ON situs_domain (company_id) WHERE utama;

CREATE INDEX IF NOT EXISTS situs_domain_company ON situs_domain (company_id);

-- ── RLS ─────────────────────────────────────────────────────────────────────
ALTER TABLE situs_domain ENABLE ROW LEVEL SECURITY;
ALTER TABLE situs_domain FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS situs_domain_baca ON situs_domain;
CREATE POLICY situs_domain_baca ON situs_domain
  FOR ALL USING (company_id = auth_company_id())
  WITH CHECK (company_id = auth_company_id());

-- RESTRICTIVE: policy PERMISSIVE digabung OR, jadi satu policy yang hanya
-- memeriksa izin akan MEMBATALKAN penyaringan saudaranya. Pagar ini menahan
-- apa pun yang lolos dari sisi permissive.
DROP POLICY IF EXISTS situs_domain_pagar ON situs_domain;
CREATE POLICY situs_domain_pagar ON situs_domain
  AS RESTRICTIVE FOR ALL USING (company_id = auth_company_id());

-- ── Resolusi tenant dari hostname ───────────────────────────────────────────
--
-- ⚠ SECURITY DEFINER, dan itu disengaja.
--
-- Resolusi tenant terjadi SEBELUM tenant diketahui — pengunjung anonim membuka
-- `ptmakmur.co.id`, dan sistem harus tahu itu milik siapa sebelum bisa
-- menyaring apa pun. RLS tak bisa menolong di titik itu; ia justru penyebab
-- ayam-dan-telurnya.
--
-- Yang membuat ini aman: fungsi memulangkan `company_id` SAJA — satu UUID,
-- tak pernah isi situsnya. Penyaringan konten tetap terjadi sesudahnya, lewat
-- jalur yang sama seperti sekarang.
--
-- Dan hanya host `aktif` + `terverifikasi` yang dijawab: domain kustom yang
-- belum dibuktikan kepemilikannya tak bisa menyajikan apa pun.
CREATE OR REPLACE FUNCTION situs_company_dari_host(p_host TEXT)
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT company_id
    FROM situs_domain
   WHERE host = lower(trim(p_host))
     AND aktif
     AND terverifikasi
   LIMIT 1
$$;

REVOKE ALL ON FUNCTION situs_company_dari_host(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION situs_company_dari_host(TEXT) TO authenticated, anon, service_role;

-- ── Verifikasi ──────────────────────────────────────────────────────────────
DO $$
DECLARE
  n_policy INTEGER;
  ada_fn   BOOLEAN;
BEGIN
  SELECT count(*) INTO n_policy FROM pg_policy p
    JOIN pg_class c ON c.oid = p.polrelid WHERE c.relname = 'situs_domain';
  IF n_policy < 2 THEN
    RAISE EXCEPTION 'situs_domain hanya punya % policy, butuh permissive + restrictive', n_policy;
  END IF;

  SELECT EXISTS(SELECT 1 FROM pg_proc WHERE proname = 'situs_company_dari_host') INTO ada_fn;
  IF NOT ada_fn THEN
    RAISE EXCEPTION 'situs_company_dari_host tidak terbentuk';
  END IF;

  RAISE NOTICE 'situs_domain siap — % policy, resolver hostname ada', n_policy;
END $$;
