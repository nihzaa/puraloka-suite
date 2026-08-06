-- 204 — SERTIFIKAT IPC (Interim Payment Certificate) — INTI #2
--
-- ════════════════════════════════════════════════════════════════════════════
-- CELAH YANG DITUTUP — dan kenapa ia tak pernah menimbulkan galat
-- ════════════════════════════════════════════════════════════════════════════
--
-- Gerbang progres SUDAH ADA dan SUDAH terpasang: `lib/ipc-progres.ts` dipanggil
-- di `finance.ts:560`, dan ia menolak termin `on_progress` yang ditagih sebelum
-- ambangnya tercapai. Itu bagian yang sudah benar.
--
-- Yang hilang: **angkanya tidak pernah disimpan.**
--
-- Gerbang itu menghitung "progres saat ini 47%, ambang 40% → lolos", lalu
-- membuang hasilnya. Header `lib/ipc-progres.ts` sendiri menuliskan alasan
-- kenapa itu tak cukup:
--
--     "IPC adalah sertifikat: ia mencatat berapa progres yang diakui PADA SAAT
--      penagihan, siapa yang mengakuinya, dan dasar apa yang dipakai. Sekadar
--      menolak-atau-meloloskan tak meninggalkan jejak apa pun, dan enam bulan
--      kemudian tak ada yang bisa menjawab 'waktu itu progresnya berapa?'"
--
-- Enam bulan kemudian `projects.progress_pct` sudah berubah. Saat owner
-- mempersoalkan sebuah termin, yang tersedia hanya progres HARI INI — bukan
-- progres yang jadi dasar penagihan waktu itu. Tak ada galat, tak ada log,
-- hanya angka yang diam-diam sudah bergerak.
--
-- Diukur 2026-08-07: 40 termin (18 dibayar · 15 menunggu · 7 tertagih),
-- 26 invoice, 271 log progres, 15 proyek Rp 4,88 miliar — dan NOL sertifikat.
-- Setiap satu dari 7 termin tertagih itu tak punya jejak dasar penagihannya.
--
-- ── Kenapa tabel, bukan kolom di `invoices`
--
-- Sertifikat terbit SEBELUM invoice, dan bisa ada tanpa invoice: itu justru
-- gunanya — progres diakui dan disetujui dulu, penagihan menyusul. Menaruhnya
-- sebagai kolom invoice memaksa urutan terbalik, dan membuat sertifikat yang
-- ditolak tak punya tempat sama sekali.
--
-- ── Yang DIHITUNG vs yang DISIMPAN
--
-- `nilai_bersih` TIDAK disimpan — ia diturunkan dari komponennya. Kolom hasil
-- yang basi adalah cara paling sunyi untuk membayar angka yang salah: ia
-- terlihat benar sampai salah satu komponennya berubah.
--
-- Yang DISIMPAN adalah angka yang harus BEKU: progres yang diakui, nilai
-- kontrak, dan persentase retensi PADA SAAT sertifikat terbit. Ketiganya
-- berubah di tabel induknya, dan sertifikat yang membacanya ulang bukan lagi
-- sertifikat — ia cuma laporan hari ini.

BEGIN;

CREATE TABLE IF NOT EXISTS sertifikat_ipc (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id        UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  termin_id         UUID REFERENCES termin_schedules(id) ON DELETE SET NULL,
  invoice_id        UUID REFERENCES invoices(id) ON DELETE SET NULL,

  nomor             TEXT NOT NULL,
  tanggal           DATE NOT NULL DEFAULT CURRENT_DATE,

  -- ── Angka yang DIBEKUKAN saat sertifikat terbit ────────────────────────
  --
  -- Dibaca ulang dari induknya, sertifikat ini kehilangan seluruh gunanya:
  -- `projects.progress_pct` bergerak tiap hari, dan yang dipersoalkan owner
  -- adalah angka SAAT ITU.
  progres_diakui_pct  NUMERIC(6,3) NOT NULL,
  nilai_kontrak       NUMERIC(16,2) NOT NULL,
  retensi_pct         NUMERIC(6,3) NOT NULL DEFAULT 0,

  -- Sudah ditagih pada sertifikat-sertifikat SEBELUMNYA. Tanpa angka ini,
  -- tiap IPC menagih ulang seluruh nilai progres dari nol.
  kumulatif_sebelumnya NUMERIC(16,2) NOT NULL DEFAULT 0,

  -- Potongan uang muka pada periode ini. Terpisah dari retensi: retensi
  -- ditahan lalu dikembalikan, uang muka sudah dibayar lalu dipotong.
  potongan_dp        NUMERIC(16,2) NOT NULL DEFAULT 0,
  potongan_lain      NUMERIC(16,2) NOT NULL DEFAULT 0,
  potongan_lain_alasan TEXT,

  status            TEXT NOT NULL DEFAULT 'draft',
  catatan           TEXT,

  -- Siapa yang MENGAKUI progresnya — bagian "siapa yang mengakuinya".
  disetujui_oleh    UUID REFERENCES users(id) ON DELETE SET NULL,
  disetujui_pada    TIMESTAMPTZ,

  created_by        UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT sertifikat_ipc_nomor_unik UNIQUE (nomor),

  CONSTRAINT sertifikat_ipc_status_check CHECK (
    status = ANY (ARRAY['draft','disetujui','ditagihkan','ditolak','batal'])
  ),

  -- Progres 0–100. Di luar itu bukan "data aneh yang bisa diperbaiki nanti":
  -- 150% berarti menagih satu setengah kali nilai kontrak.
  CONSTRAINT sertifikat_ipc_progres_wajar CHECK (
    progres_diakui_pct >= 0 AND progres_diakui_pct <= 100
  ),
  CONSTRAINT sertifikat_ipc_retensi_wajar CHECK (
    retensi_pct >= 0 AND retensi_pct <= 100
  ),
  CONSTRAINT sertifikat_ipc_nilai_positif CHECK (nilai_kontrak > 0),
  CONSTRAINT sertifikat_ipc_potongan_tak_negatif CHECK (
    potongan_dp >= 0 AND potongan_lain >= 0 AND kumulatif_sebelumnya >= 0
  ),

  -- Potongan "lain-lain" WAJIB punya alasan. Tanpa ini ia jadi tempat sampah
  -- yang menyerap selisih apa pun tanpa pernah ditanyakan — dan itu persis
  -- kolom yang paling sering dipakai menyembunyikan kesalahan hitung.
  CONSTRAINT sertifikat_ipc_potongan_lain_beralasan CHECK (
    potongan_lain = 0 OR (potongan_lain_alasan IS NOT NULL AND length(btrim(potongan_lain_alasan)) >= 5)
  ),

  -- Disetujui berarti ADA yang menyetujui, pada waktu tertentu. Status
  -- "disetujui" tanpa penyetuju adalah tanda tangan kosong.
  CONSTRAINT sertifikat_ipc_persetujuan_lengkap CHECK (
    status <> 'disetujui' OR (disetujui_oleh IS NOT NULL AND disetujui_pada IS NOT NULL)
  ),

  -- Ditagihkan berarti sudah lewat persetujuan DAN punya invoice-nya.
  CONSTRAINT sertifikat_ipc_ditagihkan_lengkap CHECK (
    status <> 'ditagihkan' OR (invoice_id IS NOT NULL AND disetujui_pada IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_sertifikat_ipc_project ON sertifikat_ipc(project_id);
CREATE INDEX IF NOT EXISTS idx_sertifikat_ipc_termin  ON sertifikat_ipc(termin_id);
CREATE INDEX IF NOT EXISTS idx_sertifikat_ipc_status  ON sertifikat_ipc(status);

-- Satu termin tak boleh punya DUA sertifikat yang masih hidup.
--
-- Dua sertifikat aktif atas termin yang sama = termin yang sama ditagih dua
-- kali, dan itu baru ketahuan saat owner menolak invoice kedua. Yang
-- `ditolak`/`batal` sengaja tak ikut: sertifikat yang ditolak harus bisa
-- diganti yang baru.
CREATE UNIQUE INDEX IF NOT EXISTS idx_sertifikat_ipc_satu_per_termin
  ON sertifikat_ipc(termin_id)
  WHERE termin_id IS NOT NULL AND status IN ('draft','disetujui','ditagihkan');

ALTER TABLE sertifikat_ipc ENABLE ROW LEVEL SECURITY;
ALTER TABLE sertifikat_ipc FORCE ROW LEVEL SECURITY;

-- Isolasi tenant — RESTRICTIVE, di-AND-kan dengan permission di bawah.
-- Ember [C]: permission tak pernah bisa menembus batas company.
DROP POLICY IF EXISTS tenant_isolation ON sertifikat_ipc;
CREATE POLICY tenant_isolation ON sertifikat_ipc AS RESTRICTIVE
  USING (project_company_id(project_id) = (SELECT auth_company_id()));

-- Permission, BUKAN literal peran (ADR-004 Rule #2 — pelajaran migrasi 202).
--
-- `finance:invoice:create` — DIVERIFIKASI ada di tabel `permissions` sebelum
-- migrasi ini dijalankan. Percobaan pertama menulis `finance:invoice:manage`,
-- yang TIDAK ADA: policy-nya akan menolak setiap orang tanpa satu pun galat,
-- dan gejalanya cuma "layar IPC kosong". Key permission bukan sesuatu yang
-- boleh ditebak dari pola namanya.
DROP POLICY IF EXISTS sertifikat_ipc_baca   ON sertifikat_ipc;
DROP POLICY IF EXISTS sertifikat_ipc_kelola ON sertifikat_ipc;
CREATE POLICY sertifikat_ipc_baca ON sertifikat_ipc FOR SELECT
  USING ((SELECT has_permission('finance:view')));
CREATE POLICY sertifikat_ipc_kelola ON sertifikat_ipc FOR ALL
  USING ((SELECT has_permission('finance:invoice:create')))
  WITH CHECK ((SELECT has_permission('finance:invoice:create')));

COMMIT;
