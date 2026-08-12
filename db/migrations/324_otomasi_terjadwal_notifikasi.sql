-- ============================================================================
-- 324 — OTOMASI TERJADWAL: ATURAN ROUTING NOTIFIKASI
-- ============================================================================
--
-- Lima automation dari katalog `06-agentic-ai-and-automation-architecture.md`
-- yang gerbangnya Phase 2 — RULE-BASED, NOL ketergantungan AI:
--
--   2.10  Kasbon Outstanding Aging      kasbon disetujui tapi tak kunjung lunas
--   3.10  Dependency Threshold Breach   pendahulu Gantt belum cukup progresnya
--   3.11  Auto Progress Reminder        mandor belum lapor progres hari ini
--   5.1   Invoice dari Termin           termin memenuhi syarat tagih
--   6.6   Kasbon Tukang Auto-Reminder   cicilan kasbon tukang menggantung
--
-- ── Kenapa migrasi ini TIDAK menyentuh `notifications.type`
--
-- Kolom itu TEXT tanpa CHECK (`038_notifications_enhanced.sql`), jadi tipe baru
-- tak butuh DDL. Yang dibutuhkan justru barisnya di `notification_rules`:
-- `resolveRecipients()` menyaring `.eq('event_type', …)` — tanpa baris di sana
-- ia mengembalikan daftar KOSONG, dan automation berjalan sukses tanpa
-- mengirim apa pun kepada siapa pun.
--
-- Itu kelas cacat yang sama dengan L-4 "kolom jadwal tanpa pembaca": hijau di
-- log, mati di kenyataan. Karena itu blok verifikasi di bawah tidak berhenti
-- pada "baris ada", tetapi menuntut TIAP aturan baru punya minimal satu target.
--
-- ── Kenapa penerimanya berbeda-beda, bukan 'admin' semua
--
-- Diturunkan dari siapa yang bisa BERTINDAK atas pesannya, bukan dari siapa
-- yang berhak tahu:
--
--   kasbon tukang        → mandor proyek; dialah yang memotong upah
--   progres belum lapor  → mandor proyek; dia yang harus melapor
--   dependency breach    → PM proyek; dia yang menata ulang urutan kerja
--   kasbon outstanding   → admin + PM; keputusan penagihan balik
--   termin siap tagih    → admin + PM; mereka yang menerbitkan invoice
--
-- Mengirim semuanya ke admin membuat notifikasi jadi kebisingan, dan
-- notifikasi yang diabaikan sama nilainya dengan yang tak pernah terkirim.
-- ============================================================================

-- ─── 1. Aturan routing untuk lima kejadian baru ─────────────────────────────
--
-- ⚠ `notification_rules.company_id` NOT NULL, tetapi `event_type` UNIQUE
-- GLOBAL (bukan unik per company) — diukur pada schema hidup, bukan dibaca
-- dari migrasi 101 yang lahir sebelum kolom company_id ada.
--
-- Konsekuensinya: satu event_type hanya bisa dimiliki SATU tenant. Selama
-- basis ini masih satu perusahaan, seed ini benar. Begitu tenant kedua masuk,
-- ia tak akan bisa punya aturannya sendiri — dan `resolveRecipients` akan
-- membaca aturan milik tenant lain atau tak menemukan apa pun.
--
-- Cacat itu MILIK migrasi 101, bukan lahir di sini, dan memperbaikinya berarti
-- mengganti constraint unik yang dipakai `ON CONFLICT` di banyak tempat —
-- pekerjaan tersendiri yang butuh keputusan. Dicatat di JOURNAL sebagai utang
-- yang harus lunas SEBELUM tenant kedua dibuat, bukan ditambal diam-diam.

INSERT INTO notification_rules (event_type, label, description, company_id)
SELECT v.event_type, v.label, v.description, c.id
FROM (VALUES
  ('kasbon_outstanding',      'Kasbon Belum Lunas',
   'Kasbon sudah disetujui namun belum dilunasi melewati ambang hari'),
  ('worker_kasbon_reminder',  'Cicilan Kasbon Tukang',
   'Kasbon tukang belum lunas dan perlu dipotong dari upah'),
  ('progress_belum_lapor',    'Progres Belum Dilaporkan',
   'Mandor belum mengirim laporan progres untuk hari berjalan'),
  ('gantt_dep_breach',        'Ambang Dependency Terlampaui',
   'Pekerjaan penerus dimulai padahal pendahulunya belum mencapai ambang progres')
) AS v(event_type, label, description)
-- Tenant yang sama dengan pemilik aturan lama, supaya seluruh aturan satu atap.
CROSS JOIN LATERAL (
  SELECT company_id AS id FROM notification_rules
  ORDER BY created_at LIMIT 1
) c
ON CONFLICT (event_type) DO NOTHING;

-- `invoice_due` sudah ada sejak migrasi 101 dan dipakai 5.1 — tidak dibuat ulang.

-- ─── 2. Target: siapa yang menerima ─────────────────────────────────────────

-- `company_id` diwarisi dari aturan induknya — target tak boleh mendarat di
-- tenant lain daripada aturan yang memilikinya.

-- Mandor proyek — kasbon tukang & laporan progres adalah pekerjaan mereka.
INSERT INTO notification_rule_targets (rule_id, target_type, company_id)
SELECT r.id, 'project_mandors', r.company_id FROM notification_rules r
WHERE r.event_type IN ('worker_kasbon_reminder', 'progress_belum_lapor')
ON CONFLICT DO NOTHING;

-- PM proyek — urutan kerja dan penagihan.
INSERT INTO notification_rule_targets (rule_id, target_type, company_id)
SELECT r.id, 'project_pm', r.company_id FROM notification_rules r
WHERE r.event_type IN ('gantt_dep_breach', 'kasbon_outstanding', 'progress_belum_lapor')
ON CONFLICT DO NOTHING;

-- Admin — hanya yang berkonsekuensi uang. Sengaja TIDAK termasuk
-- `progress_belum_lapor`: itu urusan harian lapangan, dan admin yang menerima
-- puluhan pesan tiap pagi akan berhenti membaca semuanya.
--
-- Role dicari per-company: `roles.name` tak dijamin unik lintas tenant, dan
-- FK-nya menunjuk `roles(name)`, jadi baris admin milik tenant lain akan
-- lolos tanpa saringan ini.
INSERT INTO notification_rule_targets (rule_id, target_type, role_name, company_id)
SELECT r.id, 'role', 'admin', r.company_id FROM notification_rules r
WHERE r.event_type IN ('kasbon_outstanding', 'worker_kasbon_reminder')
  AND EXISTS (SELECT 1 FROM roles ro WHERE ro.name = 'admin')
ON CONFLICT DO NOTHING;

-- ─── 3. Verifikasi — bukan "baris ada", tapi "punya penerima" ───────────────

DO $$
DECLARE
  yatim TEXT;
  n     INT;
BEGIN
  -- Basis kosong (mis. lingkungan bersih sebelum seed) tak punya company
  -- rujukan, jadi seed di atas tidak menyisipkan apa pun. Itu SAH — bukan
  -- kegagalan — selama dinyatakan, bukan lolos diam-diam.
  IF NOT EXISTS (SELECT 1 FROM companies) THEN
    RAISE NOTICE '324: basis tanpa company — seed aturan dilewati';
    RETURN;
  END IF;

  SELECT count(*) INTO n FROM notification_rules
  WHERE event_type IN ('kasbon_outstanding', 'worker_kasbon_reminder',
                       'progress_belum_lapor', 'gantt_dep_breach');
  IF n <> 4 THEN
    RAISE EXCEPTION '324 gagal: harusnya 4 aturan baru, yang ada %', n;
  END IF;

  -- Aturan tanpa target = automation yang jalan sukses tanpa penerima.
  SELECT string_agg(r.event_type, ', ') INTO yatim
  FROM notification_rules r
  WHERE r.event_type IN ('kasbon_outstanding', 'worker_kasbon_reminder',
                         'progress_belum_lapor', 'gantt_dep_breach')
    AND NOT EXISTS (
      SELECT 1 FROM notification_rule_targets t WHERE t.rule_id = r.id
    );
  IF yatim IS NOT NULL THEN
    RAISE EXCEPTION '324 gagal: aturan tanpa penerima — % (notifikasi akan hilang senyap)', yatim;
  END IF;

  RAISE NOTICE '324 OK — 4 aturan routing baru, semuanya punya penerima';
END $$;
