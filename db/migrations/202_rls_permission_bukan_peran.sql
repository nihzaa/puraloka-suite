-- 202 — RLS PEMBEDA: ganti literal peran dengan has_permission() (ADR-004 Rule #2)
--
-- ── Kesalahan yang diperbaiki di sini
--
-- Sembilan migrasi PEMBEDA (193–201) menulis policy RLS dengan bentuk:
--
--     auth_role() = ANY (ARRAY['admin','pm'])
--
-- Itu melanggar ADR-004 Rule #2 — aturan yang CLAUDE.md repo ini sendiri
-- kutip di §5.1. Penjaga `audit-rls-literal-peran.mjs` menangkapnya:
-- 68 → 86, dan seluruh 18 kenaikan berasal dari sembilan migrasi itu.
--
-- ── Kenapa ini bukan sekadar kerapian
--
-- Peran adalah DATA KONFIGURASI per-tenant, bukan konstanta. Migrasi 1B.4
-- sudah men-drop enum `users.role` dan menggantinya dengan FK ke tabel
-- `roles` — tenant boleh membuat peran sendiri lewat UI.
--
-- Pelanggan yang membuat peran "Direktur Operasional" dan memberinya
-- `projects:contract` akan mendapati layar tender KOSONG. Bukan galat, bukan
-- pesan "tidak berwenang" — kosong, seolah memang belum ada tender. Ia akan
-- menyimpulkan fitur itu rusak, dan tak satu pun log mencatat apa pun.
--
-- ── Pemetaan permission diambil dari KODE, bukan tebakan
--
-- Tiap key di bawah disalin dari `requirePermission(...)` di rute yang
-- membaca/menulis tabelnya, supaya lapisan RLS dan lapisan rute menjawab
-- pertanyaan yang sama:
--
--   stock_transfers            procurement:view / procurement:material:manage
--   penerimaan_material_klien  procurement:view / procurement:material:manage
--   rfq, rfq_penawaran         procurement:view / procurement:po:manage
--   polis_asuransi             projects:view    / projects:contract
--   pos_contingency            projects:view    / projects:contract
--   penggunaan_contingency     projects:view    / projects:contract
--   tender_subkon              projects:view    / projects:contract
--   penawaran_subkon           projects:view    / projects:contract
--
-- `polis_asuransi` bacaannya dinaikkan ke `projects:view`: rutenya memakai
-- `projects:contract` untuk BACA maupun TULIS, tapi menyamakan keduanya di
-- RLS berarti siapa pun yang boleh melihat proyek tak bisa melihat polisnya
-- — padahal register asuransi justru dibaca lintas peran. Yang MENULIS tetap
-- `projects:contract`.
--
-- ── Isolasi tenant tidak disentuh
--
-- Policy `tenant_isolation` (RESTRICTIVE) di tiap tabel tetap apa adanya.
-- Ia di-AND-kan dengan yang di bawah, jadi permission tak pernah bisa
-- menembus batas company. Ember [C] — tak boleh dikonfigurasi.

BEGIN;

-- ── procurement ───────────────────────────────────────────────────────────

DROP POLICY IF EXISTS stock_transfers_baca   ON stock_transfers;
DROP POLICY IF EXISTS stock_transfers_kelola ON stock_transfers;
CREATE POLICY stock_transfers_baca ON stock_transfers FOR SELECT
  USING ((SELECT has_permission('procurement:view')));
CREATE POLICY stock_transfers_kelola ON stock_transfers FOR ALL
  USING ((SELECT has_permission('procurement:material:manage')))
  WITH CHECK ((SELECT has_permission('procurement:material:manage')));

DROP POLICY IF EXISTS penerimaan_klien_baca   ON penerimaan_material_klien;
DROP POLICY IF EXISTS penerimaan_klien_kelola ON penerimaan_material_klien;
CREATE POLICY penerimaan_klien_baca ON penerimaan_material_klien FOR SELECT
  USING ((SELECT has_permission('procurement:view')));
CREATE POLICY penerimaan_klien_kelola ON penerimaan_material_klien FOR ALL
  USING ((SELECT has_permission('procurement:material:manage')))
  WITH CHECK ((SELECT has_permission('procurement:material:manage')));

DROP POLICY IF EXISTS rfq_baca   ON rfq;
DROP POLICY IF EXISTS rfq_kelola ON rfq;
CREATE POLICY rfq_baca ON rfq FOR SELECT
  USING ((SELECT has_permission('procurement:view')));
CREATE POLICY rfq_kelola ON rfq FOR ALL
  USING ((SELECT has_permission('procurement:po:manage')))
  WITH CHECK ((SELECT has_permission('procurement:po:manage')));

DROP POLICY IF EXISTS rfq_penawaran_baca   ON rfq_penawaran;
DROP POLICY IF EXISTS rfq_penawaran_kelola ON rfq_penawaran;
CREATE POLICY rfq_penawaran_baca ON rfq_penawaran FOR SELECT
  USING ((SELECT has_permission('procurement:view')));
CREATE POLICY rfq_penawaran_kelola ON rfq_penawaran FOR ALL
  USING ((SELECT has_permission('procurement:po:manage')))
  WITH CHECK ((SELECT has_permission('procurement:po:manage')));

-- ── proyek ────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS polis_baca   ON polis_asuransi;
DROP POLICY IF EXISTS polis_kelola ON polis_asuransi;
CREATE POLICY polis_baca ON polis_asuransi FOR SELECT
  USING ((SELECT has_permission('projects:view')));
CREATE POLICY polis_kelola ON polis_asuransi FOR ALL
  USING ((SELECT has_permission('projects:contract')))
  WITH CHECK ((SELECT has_permission('projects:contract')));

DROP POLICY IF EXISTS pos_contingency_baca   ON pos_contingency;
DROP POLICY IF EXISTS pos_contingency_kelola ON pos_contingency;
CREATE POLICY pos_contingency_baca ON pos_contingency FOR SELECT
  USING ((SELECT has_permission('projects:view')));
CREATE POLICY pos_contingency_kelola ON pos_contingency FOR ALL
  USING ((SELECT has_permission('projects:contract')))
  WITH CHECK ((SELECT has_permission('projects:contract')));

DROP POLICY IF EXISTS penggunaan_contingency_baca   ON penggunaan_contingency;
DROP POLICY IF EXISTS penggunaan_contingency_kelola ON penggunaan_contingency;
CREATE POLICY penggunaan_contingency_baca ON penggunaan_contingency FOR SELECT
  USING ((SELECT has_permission('projects:view')));
CREATE POLICY penggunaan_contingency_kelola ON penggunaan_contingency FOR ALL
  USING ((SELECT has_permission('projects:contract')))
  WITH CHECK ((SELECT has_permission('projects:contract')));

DROP POLICY IF EXISTS tender_subkon_baca   ON tender_subkon;
DROP POLICY IF EXISTS tender_subkon_kelola ON tender_subkon;
CREATE POLICY tender_subkon_baca ON tender_subkon FOR SELECT
  USING ((SELECT has_permission('projects:view')));
CREATE POLICY tender_subkon_kelola ON tender_subkon FOR ALL
  USING ((SELECT has_permission('projects:contract')))
  WITH CHECK ((SELECT has_permission('projects:contract')));

DROP POLICY IF EXISTS penawaran_subkon_baca   ON penawaran_subkon;
DROP POLICY IF EXISTS penawaran_subkon_kelola ON penawaran_subkon;
CREATE POLICY penawaran_subkon_baca ON penawaran_subkon FOR SELECT
  USING ((SELECT has_permission('projects:view')));
CREATE POLICY penawaran_subkon_kelola ON penawaran_subkon FOR ALL
  USING ((SELECT has_permission('projects:contract')))
  WITH CHECK ((SELECT has_permission('projects:contract')));

COMMIT;
