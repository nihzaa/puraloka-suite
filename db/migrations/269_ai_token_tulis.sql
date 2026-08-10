-- ============================================================================
-- 269 — TOKEN TULIS: CRUD terbatas lewat konfirmasi manusia (S6)
-- ============================================================================
--
-- ── Keputusan founder, dan ia MELAMPAUI TJS
--
-- Founder 2026-08-10 memilih "CRUD terbatas + token konfirmasi" setelah saya
-- mengukur bahwa TJS TIDAK punya CRUD lewat asisten sama sekali: dari 38
-- tool-nya, tujuh yang menulis semuanya `preview_approve_*`. Nol create,
-- nol update, nol delete.
--
-- ── I-1 tetap utuh, dan itu syarat mutlaknya
--
-- Tak satu pun TOOL menulis. Tool hanya MENYIAPKAN; tulisannya terjadi lewat
-- `POST /api/v1/ai/tulis` yang menuntut token — permintaan yang lahir dari
-- KLIK manusia, bukan dari kalimat model.
--
-- Bedanya menentukan: injeksi lewat dokumen bisa membuat model memanggil tool
-- penyiapan, ia tak bisa membuat manusia menekan tombol.
--
-- ── Kenapa tabel TERPISAH dari `ai_token_setujui`
--
-- Keduanya token sekali-pakai, dan menggabungkannya terasa rapi. Ditolak:
-- yang satu MENYETUJUI baris yang sudah ada, yang satu MEMBUAT baris baru.
-- Satu kolom `jenis` untuk membedakannya berarti tiap query harus ingat
-- menyaringnya — dan yang lupa akan memakai token setujui untuk menulis.
--
-- Tabel terpisah membuat kekeliruan itu mustahil, bukan sekadar tak
-- disarankan.
--
-- ── NOL delete, di jenis apa pun
--
-- Tak ada kolom `aksi` bernilai 'hapus', dan CHECK di bawah menegakkannya.
-- Menghapus lewat kalimat adalah operasi yang tak punya jejak niat: yang
-- menyesal tak bisa membuktikan ia tak bermaksud, dan yang berniat tak bisa
-- dibedakan dari yang keliru.
-- ============================================================================

CREATE TABLE IF NOT EXISTS ai_token_tulis (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id   UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,

  token        TEXT NOT NULL UNIQUE,

  -- Token milik ORANG. Meneruskannya tak memindahkan wewenang — pelajaran
  -- yang sama dengan `ai_token_setujui` (P-4 / perbaikan C-2).
  user_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,

  /** Sama dengan `ENTITAS_TULIS[].jenis` di `lib/ai-tool-siapkan.ts`. */
  jenis        TEXT NOT NULL,

  -- 'buat' | 'ubah'. TAK ADA 'hapus' — lihat kepala berkas.
  aksi         TEXT NOT NULL CHECK (aksi IN ('buat', 'ubah')),

  /** Proyek tujuan — diresolusi saat penyiapan, bukan diterima dari model. */
  project_id   UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,

  /*
   * Muatan yang AKAN ditulis, apa adanya.
   *
   * Disimpan supaya yang ditulis adalah yang DILIHAT: kalau muatannya disusun
   * ulang saat eksekusi, apa yang tersimpan bisa berbeda dari apa yang
   * dikonfirmasi manusia — dan bedanya tak akan pernah terlihat.
   */
  muatan       JSONB NOT NULL,

  /** Kalimat yang DITAMPILKAN ke manusia sebelum ia menekan tombol. */
  ringkasan    TEXT NOT NULL,

  kanal        TEXT NOT NULL DEFAULT 'web',
  kedaluwarsa  TIMESTAMPTZ NOT NULL,
  dipakai_pada TIMESTAMPTZ,
  /** Id baris yang tercipta — jejak dari niat ke hasil. */
  hasil_id     UUID,
  dibuat_pada  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ai_tulis_user ON ai_token_tulis(user_id, dibuat_pada DESC);

COMMENT ON TABLE ai_token_tulis IS
  'Token sekali-pakai untuk tulisan yang DISIAPKAN asisten. Tool tak pernah '
  'menulis (I-1); tulisannya terjadi lewat rute yang menuntut token DAN klik '
  'manusia. Terpisah dari ai_token_setujui supaya token setujui tak bisa '
  'dipakai menulis.';

-- ── RLS: pola yang sama dengan 260/263/266 ─────────────────────────────────
ALTER TABLE ai_token_tulis ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS ai_tulis_dasar ON ai_token_tulis;
CREATE POLICY ai_tulis_dasar ON ai_token_tulis FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS tenant_isolation ON ai_token_tulis;
CREATE POLICY tenant_isolation ON ai_token_tulis
  AS RESTRICTIVE FOR ALL
  USING (company_id = (SELECT auth_company_id()))
  WITH CHECK (company_id = (SELECT auth_company_id()));

-- ── Permission ─────────────────────────────────────────────────────────────
--
-- TERPISAH dari `ai:chat`. Yang boleh BERTANYA bukan otomatis yang boleh
-- MENCATAT — dan kalau keduanya satu izin, memberi akses asisten kepada
-- seseorang diam-diam memberinya jalan menulis.
INSERT INTO permissions (key, label, description, module, sort_order)
VALUES ('ai:tulis', 'Catat lewat Asisten',
        'Menyimpan catatan yang disiapkan asisten (butuh konfirmasi token)', 'ai', 31)
ON CONFLICT (key) DO NOTHING;

-- ------------------------------------------------------------
-- Verifikasi — pola migrasi 142.
-- ------------------------------------------------------------
DO $$
DECLARE n int; v_comp UUID; v_user UUID; v_proj UUID;
BEGIN
  IF to_regclass('public.ai_token_tulis') IS NULL THEN
    RAISE EXCEPTION '269 gagal: tabel tidak terbentuk';
  END IF;

  -- 'hapus' WAJIB ditolak basis, bukan hanya oleh kode.
  SELECT p.id, pr.id, pr.company_id INTO v_user, v_proj, v_comp
    FROM projects pr, users p WHERE pr.company_id IS NOT NULL LIMIT 1;

  IF v_proj IS NOT NULL THEN
    BEGIN
      INSERT INTO ai_token_tulis
        (company_id, token, user_id, jenis, aksi, project_id, muatan, ringkasan, kedaluwarsa)
      VALUES (v_comp, 'uji-269-hapus', v_user, 'uji', 'hapus', v_proj, '{}'::jsonb, 'uji',
              now() + interval '1 minute');
      RAISE EXCEPTION '269 gagal: aksi ''hapus'' TIDAK ditolak — CRUD lewat kalimat bisa menghapus';
    EXCEPTION WHEN check_violation THEN NULL;
    END;

    -- Token ganda ditolak: dua baris dengan token sama membuat klaim atomik
    -- kehilangan artinya.
    INSERT INTO ai_token_tulis
      (company_id, token, user_id, jenis, aksi, project_id, muatan, ringkasan, kedaluwarsa)
    VALUES (v_comp, 'uji-269', v_user, 'uji', 'buat', v_proj, '{}'::jsonb, 'uji',
            now() + interval '1 minute');
    BEGIN
      INSERT INTO ai_token_tulis
        (company_id, token, user_id, jenis, aksi, project_id, muatan, ringkasan, kedaluwarsa)
      VALUES (v_comp, 'uji-269', v_user, 'uji', 'buat', v_proj, '{}'::jsonb, 'uji',
              now() + interval '1 minute');
      RAISE EXCEPTION '269 gagal: token ganda tidak ditolak';
    EXCEPTION WHEN unique_violation THEN NULL;
    END;
    DELETE FROM ai_token_tulis WHERE token LIKE 'uji-269%';
  END IF;

  SELECT count(*) INTO n FROM pg_policies
   WHERE tablename = 'ai_token_tulis' AND policyname = 'tenant_isolation'
     AND permissive = 'RESTRICTIVE';
  IF n <> 1 THEN
    RAISE EXCEPTION '269 gagal: tenant_isolation belum RESTRICTIVE';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM permissions WHERE key = 'ai:tulis') THEN
    RAISE EXCEPTION '269 gagal: permission ai:tulis tidak ada';
  END IF;
END $$;
