-- ════════════════════════════════════════════════════════════════════════════
-- 470 — riwayat elemen struktur: "kenapa dulu 300×500?" akhirnya bisa dijawab
--
-- ── Masalahnya
--
-- `struktur_elemen` menyimpan SATU `input` dan SATU `hasil_ringkas`. Menghitung
-- ulang menimpanya. Akibatnya tiga pertanyaan yang pasti muncul di proyek
-- sungguhan tak punya jawaban sama sekali:
--
--   1. "Kenapa balok ini dulu 300×500, sekarang 300×520?"
--   2. "Sejak kapan elemen ini jadi TIDAK AMAN — dan karena input apa?"
--   3. "Siapa yang mengubah mutu betonnya, dan kapan?"
--
-- Pertanyaan ketiga bukan soal saling menyalahkan. Ia muncul saat lembar
-- perhitungan yang SUDAH DITANDATANGANI ternyata memuat angka yang berbeda
-- dari yang terpasang di lapangan — dan yang menandatangani perlu tahu apakah
-- dokumennya yang basi, atau desainnya yang berubah sesudah diteken.
--
-- ── Apa yang disimpan, dan apa yang TIDAK — mengikuti 458
--
-- Migrasi 458 sengaja TIDAK menyimpan angka antara, dengan alasan yang masih
-- berlaku persis di sini: fungsi `analisa*` PURE, jadi input yang sama selalu
-- menghasilkan keluaran yang sama. Menyimpan turunannya berarti dua sumber
-- kebenaran yang bisa berselisih diam-diam.
--
-- Tabel ini karena itu menyimpan **INPUT** apa adanya — sebabnya, bukan
-- akibatnya — plus ringkasan verdict SECUKUPNYA untuk menjawab "sejak kapan
-- tidak aman" tanpa perlu menghitung ulang seluruh riwayat.
--
-- Kalau rumusnya nanti diperbaiki, riwayat input tetap sah dan bisa dihitung
-- ulang dengan rumus baru. Riwayat ANGKA HASIL akan jadi sampah yang
-- menyesatkan: ia terlihat seperti fakta sejarah padahal cuma keluaran versi
-- rumus yang sudah tak dipakai.
--
-- ── Kenapa tabel terpisah, bukan kolom `riwayat jsonb` di elemennya
--
-- Kolom jsonb yang tumbuh tak punya rem. Satu elemen yang dihitung ulang
-- ratusan kali (dan itu wajar saat mencari dimensi yang pas) akan membuat
-- SETIAP pembacaan daftar elemen ikut menyeret seluruh riwayatnya — halaman
-- daftar yang melambat tanpa sebab yang terlihat.
--
-- ── Idempoten
--
-- Seluruh migrasi ini aman dijalankan berulang, dan diakhiri blok verifikasi
-- yang MELEDAK kalau artefaknya tak benar-benar ada (pola migrasi 142).
-- ════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.struktur_riwayat (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id    uuid NOT NULL,
  elemen_id     uuid NOT NULL,
  project_id    uuid NOT NULL,

  /*
    Nomor urut PER ELEMEN, bukan global. "Revisi 3" harus berarti revisi
    ketiga elemen ini, bukan baris ke-3 di seluruh basis.
  */
  urutan        integer NOT NULL,

  /* SEBAB perubahan — disimpan apa adanya, lihat catatan kepala. */
  input         jsonb NOT NULL,
  jenis         text NOT NULL,
  jumlah        integer NOT NULL DEFAULT 1,

  /*
    Verdict SECUKUPNYA. Cukup untuk menjawab "sejak kapan tidak aman"
    tanpa menghitung ulang seluruh riwayat, tanpa menjadi sumber kebenaran
    kedua untuk angka teknisnya.
  */
  aman          boolean,
  beton_m3      numeric,
  bekisting_m2  numeric,
  besi_kg       numeric,

  /*
    Alasan yang diketik orang. Boleh kosong — memaksa alasan pada tiap
    hitung-ulang membuat orang mengetik "." dan kolomnya jadi tak berguna.
  */
  alasan        text,

  dicatat_pada  timestamptz NOT NULL DEFAULT now(),
  dicatat_oleh  uuid,

  CONSTRAINT struktur_riwayat_elemen_fk
    FOREIGN KEY (elemen_id) REFERENCES public.struktur_elemen(id) ON DELETE CASCADE,
  CONSTRAINT struktur_riwayat_urutan_unik UNIQUE (elemen_id, urutan)
);

/*
  Pembacaan yang PASTI terjadi: "riwayat elemen ini, terbaru dulu".
  Tanpa indeks ini, tiap pembukaan panel riwayat memindai seluruh tabel.
*/
CREATE INDEX IF NOT EXISTS struktur_riwayat_elemen_idx
  ON public.struktur_riwayat (elemen_id, urutan DESC);

CREATE INDEX IF NOT EXISTS struktur_riwayat_proyek_idx
  ON public.struktur_riwayat (project_id, dicatat_pada DESC);

-- ── Tenancy ────────────────────────────────────────────────────────────────
ALTER TABLE public.struktur_riwayat ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS struktur_riwayat_tenant_isolation ON public.struktur_riwayat;
CREATE POLICY struktur_riwayat_tenant_isolation ON public.struktur_riwayat
  FOR ALL USING (company_id = auth_company_id())
  WITH CHECK (company_id = auth_company_id());

GRANT SELECT, INSERT, UPDATE, DELETE ON public.struktur_riwayat TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.struktur_riwayat TO service_role;

-- ════════════════════════════════════════════════════════════════════════════
-- VERIFIKASI — migrasi yang "berhasil" tanpa artefak adalah kebohongan senyap
-- ════════════════════════════════════════════════════════════════════════════
DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM information_schema.tables
   WHERE table_schema = 'public' AND table_name = 'struktur_riwayat';
  IF n <> 1 THEN RAISE EXCEPTION '470 gagal: tabel struktur_riwayat tidak ada'; END IF;

  /*
    ⚠ `table_schema = 'public'` WAJIB di tiap query di atas.

    Basis ini punya skema `test` dan `extensions` yang membayangi belasan
    tabel `public` bernama sama. Tanpa saringan itu, hitungan kolom pulang
    DUA KALI dan verifikasi ini lulus/gagal karena alasan yang keliru.
  */
  SELECT count(*) INTO n FROM information_schema.columns
   WHERE table_schema = 'public' AND table_name = 'struktur_riwayat'
     AND column_name IN ('company_id', 'elemen_id', 'urutan', 'input', 'aman');
  IF n <> 5 THEN
    RAISE EXCEPTION '470 gagal: kolom inti struktur_riwayat kurang (ketemu %)', n;
  END IF;

  /* RLS aktif adalah ember [C] — tak boleh bisa dimatikan dari mana pun. */
  SELECT count(*) INTO n FROM pg_tables
   WHERE schemaname = 'public' AND tablename = 'struktur_riwayat' AND rowsecurity;
  IF n <> 1 THEN RAISE EXCEPTION '470 gagal: RLS struktur_riwayat TIDAK aktif'; END IF;

  SELECT count(*) INTO n FROM pg_policies
   WHERE schemaname = 'public' AND tablename = 'struktur_riwayat';
  IF n < 1 THEN RAISE EXCEPTION '470 gagal: struktur_riwayat tanpa policy'; END IF;

  /*
    Keunikan (elemen_id, urutan) menahan dua revisi bernomor sama. Tanpanya
    "revisi 3" bisa menunjuk dua baris berbeda, dan riwayat yang ambigu
    lebih buruk daripada tidak ada riwayat: ia terlihat berwenang.
  */
  SELECT count(*) INTO n FROM pg_constraint
   WHERE conname = 'struktur_riwayat_urutan_unik';
  IF n <> 1 THEN RAISE EXCEPTION '470 gagal: kunci unik (elemen_id, urutan) tidak ada'; END IF;

  /* Nominal WAJIB numeric — nol float, CLAUDE.md §5.4. */
  SELECT count(*) INTO n FROM information_schema.columns
   WHERE table_schema = 'public' AND table_name = 'struktur_riwayat'
     AND column_name IN ('beton_m3', 'bekisting_m2', 'besi_kg')
     AND data_type <> 'numeric';
  IF n <> 0 THEN RAISE EXCEPTION '470 gagal: % kolom nominal bukan numeric', n; END IF;

  /* Waktu WAJIB timestamptz. */
  SELECT count(*) INTO n FROM information_schema.columns
   WHERE table_schema = 'public' AND table_name = 'struktur_riwayat'
     AND column_name = 'dicatat_pada' AND data_type <> 'timestamp with time zone';
  IF n <> 0 THEN RAISE EXCEPTION '470 gagal: dicatat_pada bukan timestamptz'; END IF;

  RAISE NOTICE '470 OK: struktur_riwayat + RLS + indeks + kunci unik terpasang';
END $$;
