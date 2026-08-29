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

-- ── template_input → template_rab ───────────────────────────────────────────
DROP POLICY IF EXISTS tenant_isolation ON template_input;
CREATE POLICY tenant_isolation ON template_input AS RESTRICTIVE FOR ALL
  USING (EXISTS (
    SELECT 1 FROM template_rab t
     WHERE t.id = template_input.template_id
       AND (t.company_id IS NULL OR t.company_id = (SELECT auth_company_id()))))
  WITH CHECK (EXISTS (
    SELECT 1 FROM template_rab t
     WHERE t.id = template_input.template_id
       AND (t.company_id IS NULL OR t.company_id = (SELECT auth_company_id()))));

DROP POLICY IF EXISTS template_input_baca ON template_input;
CREATE POLICY template_input_baca ON template_input FOR SELECT USING (true);

-- ── template_item → template_rab ────────────────────────────────────────────
DROP POLICY IF EXISTS tenant_isolation ON template_item;
CREATE POLICY tenant_isolation ON template_item AS RESTRICTIVE FOR ALL
  USING (EXISTS (
    SELECT 1 FROM template_rab t
     WHERE t.id = template_item.template_id
       AND (t.company_id IS NULL OR t.company_id = (SELECT auth_company_id()))))
  WITH CHECK (EXISTS (
    SELECT 1 FROM template_rab t
     WHERE t.id = template_item.template_id
       AND (t.company_id IS NULL OR t.company_id = (SELECT auth_company_id()))));

DROP POLICY IF EXISTS template_item_baca ON template_item;
CREATE POLICY template_item_baca ON template_item FOR SELECT USING (true);

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
