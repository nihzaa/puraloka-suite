-- Migration 154: guard `to_regclass` harus SADAR-SCHEMA
--
-- ══════════════════════════════════════════════════════════════════════════
-- CACAT YANG DIPERBAIKI
-- ══════════════════════════════════════════════════════════════════════════
--
-- Migrasi 080 membangun view `critical_audit_events` di balik guard:
--
--     IF to_regclass('audit_logs') IS NOT NULL THEN … END IF;
--
-- Niatnya benar dan tertulis di komentarnya: "hanya jika audit_logs ada (view
-- tak relevan di schema test minimal yang tidak menyertakan audit_logs)".
--
-- Tapi `to_regclass` TANPA kualifikasi skema mengikuti `search_path`, dan
-- pencarian itu tidak berhenti di schema pertama. Dijalankan dengan
-- `search_path = test, extensions`, ia TETAP menemukan `public.audit_logs` —
-- guard lolos, lalu `CREATE VIEW` gagal karena di schema `test` tabelnya
-- memang tak ada:
--
--     column al.user_id does not exist
--
-- Diverifikasi langsung, bukan disimpulkan:
--     SET search_path TO ujiA, extensions;
--     SELECT to_regclass('audit_logs');         → audit_logs      (KETEMU!)
--     SELECT to_regclass('public.audit_logs');  → public.audit_logs
--
-- ── Dampaknya nyata
--
-- EMPAT berkas integration test (`kasbons`, `change-orders`, dan dua backfill)
-- tak bisa membangun schema testnya sama sekali. Keempatnya melaporkan
-- "4 skipped" — bukan gagal, melainkan DILEWATI, sehingga mudah dikira normal.
-- Ia sudah dua kali muncul di verifikasi dan dua kali dicatat sebagai "bukan
-- regresi" tanpa diperbaiki.
--
-- ── Kenapa migrasi maju, bukan menyunting 080
--
-- Berkas yang sudah tercatat di riwayat tak boleh berubah isinya — itu membuat
-- riwayat berbohong pada lingkungan yang benar-benar pernah menjalankannya.
-- 154 memasang ulang view yang sama dengan guard yang benar; di production
-- hasilnya identik (view sudah ada dan tetap ada), di schema test ia kini
-- benar-benar dilewati.

BEGIN;

-- ── Bagian 080 selain view, ditulis ulang IDEMPOTEN ─────────────────────────
--
-- 080 melakukan empat hal: (1) view `critical_audit_events`, (2) `role_id` jadi
-- NOT NULL, (3) `DROP COLUMN role`, (4) `DROP TYPE user_role`. Hanya (1) yang
-- cacat guard-nya, tapi test tak bisa menjalankan 080 sama sekali — ia gagal di
-- (1) sebelum mencapai sisanya.
--
-- Karena itu (2)–(4) ditulis ulang di sini secara idempoten, supaya subset test
-- bisa memakai 154 SEBAGAI PENGGANTI 080 tanpa kehilangan apa pun. Di
-- production ketiganya sudah dijalankan 080 dan blok ini tak berbuat apa-apa.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
              WHERE table_schema = current_schema() AND table_name = 'users'
                AND column_name = 'role_id' AND is_nullable = 'YES') THEN
    EXECUTE 'ALTER TABLE users ALTER COLUMN role_id SET NOT NULL';
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.columns
              WHERE table_schema = current_schema() AND table_name = 'users'
                AND column_name = 'role') THEN
    EXECUTE 'ALTER TABLE users DROP COLUMN role';
  END IF;

  IF EXISTS (SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
              WHERE t.typname = 'user_role' AND n.nspname = current_schema()) THEN
    EXECUTE 'DROP TYPE user_role';
  END IF;
END $$;

DO $$
BEGIN
  -- `current_schema()` — bukan `search_path`. Yang ditanyakan: apakah tabelnya
  -- ada DI SINI, di schema tempat migrasi ini sedang berjalan. Itulah
  -- pertanyaan yang sebenarnya dimaksud guard 080.
  IF EXISTS (
    SELECT 1 FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE c.relname = 'audit_logs'
       AND n.nspname = current_schema()
  ) THEN
    DROP VIEW IF EXISTS critical_audit_events;
    CREATE VIEW critical_audit_events AS
      SELECT
        al.id,
        al.created_at,
        u.name       AS user_name,
        u.email      AS user_email,
        r.name       AS user_role,
        al.action,
        al.table_name,
        al.record_id,
        al.old_values,
        al.new_values,
        al.diff,
        al.ip_address,
        al.severity
      FROM audit_logs al
      LEFT JOIN users u ON u.id = al.user_id
      LEFT JOIN roles r ON r.id = u.role_id
      WHERE al.severity = 'critical'
      ORDER BY al.created_at DESC;
    RAISE NOTICE '154: critical_audit_events dipasang ulang di schema %', current_schema();
  ELSE
    RAISE NOTICE '154: audit_logs tak ada di schema % — view dilewati (inilah yang seharusnya terjadi di schema test)', current_schema();
  END IF;
END $$;

-- ── Verifikasi ──────────────────────────────────────────────────────────────
DO $$
DECLARE ada_tabel BOOLEAN; ada_view BOOLEAN;
BEGIN
  SELECT EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
                  WHERE c.relname = 'audit_logs' AND n.nspname = current_schema())
    INTO ada_tabel;
  SELECT EXISTS (SELECT 1 FROM pg_views WHERE viewname = 'critical_audit_events'
                   AND schemaname = current_schema())
    INTO ada_view;

  -- Invarian: view ADA jika dan hanya jika tabelnya ada di schema yang sama.
  -- Kalau tabelnya ada tapi view-nya tidak, sesuatu menghalangi pembuatannya
  -- dan itu harus berbunyi sekarang — bukan saat seseorang membuka /audit.
  IF ada_tabel AND NOT ada_view THEN
    RAISE EXCEPTION '154 GAGAL: audit_logs ada di schema % tapi view critical_audit_events tak terbentuk', current_schema();
  END IF;

  RAISE NOTICE '154 OK: guard sadar-schema (tabel=% · view=%)', ada_tabel, ada_view;
END $$;

COMMIT;
