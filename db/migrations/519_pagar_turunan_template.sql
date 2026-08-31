-- ============================================================================
-- 519 — Turunan template & invoice SaaS: pagar lewat INDUK
-- ============================================================================
-- Koreksi terhadap migrasi 518. Di sana saya mengecualikan `template_input`,
-- `template_item`, dan `saas_invoice_line_items` dengan alasan "tak punya
-- kunci tenant". Alasannya BENAR secara harfiah dan SALAH secara akibat.
--
-- `f2-3-batch3-tenancy-turunan` menemukannya dengan cara yang lebih dapat
-- dipercaya daripada peta kategori tulisan tangan: ia membaca FK dari SKEMA.
--
--     template_input  (71 baris)  → template_rab
--     template_item   (161 baris) → template_rab, assemblies
--     saas_invoice_line_items (0) → saas_invoices
--
-- Induknya PUNYA `company_id`, dan induk itu justru yang dipagari 518 karena
-- memuat struktur harga milik perusahaan. Anaknya membawa ISI template itu —
-- rincian input dan itemnya. Membiarkan anak telanjang membuat pagar induknya
-- hampir tak berarti: yang bocor bukan judul templatenya, melainkan isinya.
--
-- Kategori C persis untuk keadaan ini: tabel tanpa `company_id` sendiri yang
-- mewarisi tenancy lewat induk. Policy adalah SATU-SATUNYA yang menahan.
--
-- Pola predikatnya menyalin tabel C yang sudah ada (mis. migrasi 131):
-- EXISTS ke induk, disaring `auth_company_id()`.
-- ============================================================================

/*
  ⚠ DIBUNGKUS PEMERIKSAAN KEBERADAAN — DITAMBAHKAN 2026-08-31.

  `template_rab`, `template_input`, dan `template_item` TIDAK dibuat oleh
  migrasi mana pun di repo ini — diukur dengan memindai seluruh CREATE TABLE
  di db/migrations. Ketiganya ada di basis dev karena lahir di luar jalur
  migrasi.

  Tanpa pemeriksaan ini migrasi mati di lingkungan baru:

      relation "template_input" does not exist

  Sama dengan perbaikan 518 pada commit sebelumnya. Pagarnya menyala begitu
  tabelnya muncul; selama belum ada, tak ada yang bisa bocor.

  `saas_invoice_line_items` di bawah TIDAK dibungkus — tabel itu memang
  dibuat migrasi, jadi ketiadaannya akan menjadi gejala yang layak diteriakkan.
*/
DO $pagar_turunan_template$
BEGIN
  IF to_regclass('public.template_rab') IS NULL
     OR to_regclass('public.template_input') IS NULL
     OR to_regclass('public.template_item') IS NULL THEN
    RAISE NOTICE '519: tabel template_* tak ada di basis ini — pagar turunan dilewati. '
                 'Tak satu pun migrasi membuatnya; ketiganya lahir di luar jalur migrasi.';
    RETURN;
  END IF;

  -- ── template_input → template_rab ─────────────────────────────────────────
  EXECUTE 'DROP POLICY IF EXISTS tenant_isolation ON template_input';
  EXECUTE 'CREATE POLICY tenant_isolation ON template_input AS RESTRICTIVE FOR ALL
    USING (EXISTS (
      SELECT 1 FROM template_rab t
       WHERE t.id = template_input.template_id
         AND (t.company_id IS NULL OR t.company_id = (SELECT auth_company_id()))))
    WITH CHECK (EXISTS (
      SELECT 1 FROM template_rab t
       WHERE t.id = template_input.template_id
         AND (t.company_id IS NULL OR t.company_id = (SELECT auth_company_id()))))';

  EXECUTE 'DROP POLICY IF EXISTS template_input_baca ON template_input';
  EXECUTE 'CREATE POLICY template_input_baca ON template_input FOR SELECT USING (true)';

  -- ── template_item → template_rab ──────────────────────────────────────────
  EXECUTE 'DROP POLICY IF EXISTS tenant_isolation ON template_item';
  EXECUTE 'CREATE POLICY tenant_isolation ON template_item AS RESTRICTIVE FOR ALL
    USING (EXISTS (
      SELECT 1 FROM template_rab t
       WHERE t.id = template_item.template_id
         AND (t.company_id IS NULL OR t.company_id = (SELECT auth_company_id()))))
    WITH CHECK (EXISTS (
      SELECT 1 FROM template_rab t
       WHERE t.id = template_item.template_id
         AND (t.company_id IS NULL OR t.company_id = (SELECT auth_company_id()))))';

  EXECUTE 'DROP POLICY IF EXISTS template_item_baca ON template_item';
  EXECUTE 'CREATE POLICY template_item_baca ON template_item FOR SELECT USING (true)';
END $pagar_turunan_template$;

-- ── saas_invoice_line_items → saas_invoices ─────────────────────────────────
DROP POLICY IF EXISTS tenant_isolation ON saas_invoice_line_items;
CREATE POLICY tenant_isolation ON saas_invoice_line_items AS RESTRICTIVE FOR ALL
  USING (EXISTS (
    SELECT 1 FROM saas_invoices i
     WHERE i.id = saas_invoice_line_items.invoice_id
       AND (i.company_id IS NULL OR i.company_id = (SELECT auth_company_id()))))
  WITH CHECK (EXISTS (
    SELECT 1 FROM saas_invoices i
     WHERE i.id = saas_invoice_line_items.invoice_id
       AND (i.company_id IS NULL OR i.company_id = (SELECT auth_company_id()))));

DROP POLICY IF EXISTS saas_invoice_line_items_baca ON saas_invoice_line_items;
CREATE POLICY saas_invoice_line_items_baca ON saas_invoice_line_items FOR SELECT USING (true);

-- ── VERIFIKASI ──────────────────────────────────────────────────────────────
DO $$
DECLARE
  v_tabel text; v_r int; v_p int; v_saring int;
BEGIN
  FOREACH v_tabel IN ARRAY ARRAY['template_input','template_item','saas_invoice_line_items'] LOOP
    /*
      Tabel yang TAK ADA dilewati — 2026-08-31, sama dengan 518.

      Tanpa ini verifikasi menuduh "isi template terbaca lintas tenant" atas
      tabel yang belum ada, dan pembacanya akan mengira ada kebocoran.
      Tak ada tabel berarti tak ada yang bocor.
    */
    IF to_regclass('public.' || v_tabel) IS NULL THEN
      RAISE NOTICE '519: tabel % tak ada di basis ini — verifikasi pagar dilewati', v_tabel;
      CONTINUE;
    END IF;

    SELECT count(*) INTO v_r FROM pg_policies
     WHERE schemaname=current_schema() AND tablename=v_tabel AND permissive='RESTRICTIVE';
    SELECT count(*) INTO v_p FROM pg_policies
     WHERE schemaname=current_schema() AND tablename=v_tabel AND permissive='PERMISSIVE';
    SELECT count(*) INTO v_saring FROM pg_policies
     WHERE schemaname=current_schema() AND tablename=v_tabel
       AND permissive='RESTRICTIVE' AND qual LIKE '%auth_company_id%';

    IF v_r = 0 THEN
      RAISE EXCEPTION '519 gagal: % tanpa RESTRICTIVE — isi template terbaca lintas tenant', v_tabel;
    END IF;
    IF v_p = 0 THEN
      RAISE EXCEPTION '519 gagal: % RESTRICTIVE tanpa PERMISSIVE — tabelnya mati total', v_tabel;
    END IF;
    -- Pagar yang tak menyebut auth_company_id() bukan pagar tenant.
    IF v_saring = 0 THEN
      RAISE EXCEPTION '519 gagal: pagar % tak menyaring auth_company_id()', v_tabel;
    END IF;
  END LOOP;
END $$;
