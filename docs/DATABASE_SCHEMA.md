# Database Schema — Puraloka Suite

**Database**: PostgreSQL via Supabase  
**Project**: `tgozokxyvwmyvajgqfxw` (Singapore)  
**RLS**: AKTIF — migration 049 applied. Service_role bypass (API), anon/JWT enforce (client).  
**Last migration**: 058 (applied ke Supabase, Juni 2026)  

---

## Tabel Existing (001–038) — JANGAN UBAH SKEMA

### Core Tables

#### `users`
```sql
id UUID PRIMARY KEY DEFAULT gen_random_uuid()
auth_id UUID UNIQUE REFERENCES auth.users(id)
name TEXT NOT NULL
email TEXT UNIQUE NOT NULL
phone TEXT
role TEXT NOT NULL CHECK (role IN ('admin', 'pm', 'mandor', 'client'))
is_active BOOLEAN DEFAULT true
avatar_url TEXT
push_subscription JSONB  -- Web Push subscription (migration 038)
created_at TIMESTAMPTZ DEFAULT NOW()
updated_at TIMESTAMPTZ DEFAULT NOW()
```

#### `clients`
```sql
id UUID PRIMARY KEY DEFAULT gen_random_uuid()
name TEXT NOT NULL
phone TEXT
email TEXT
address TEXT
type TEXT DEFAULT 'individual' CHECK (type IN ('individual', 'company'))
is_active BOOLEAN DEFAULT true
created_at TIMESTAMPTZ DEFAULT NOW()
updated_at TIMESTAMPTZ DEFAULT NOW()
```

#### `projects`
```sql
id UUID PRIMARY KEY DEFAULT gen_random_uuid()
name TEXT NOT NULL
client_id UUID REFERENCES clients(id)
pm_id UUID REFERENCES users(id)
created_by UUID REFERENCES users(id)
status TEXT NOT NULL DEFAULT 'planning'
  CHECK (status IN ('planning', 'active', 'on_hold', 'completed', 'cancelled'))
contract_model TEXT NOT NULL CHECK (contract_model IN ('termin', 'komisi'))
tax_scheme TEXT NOT NULL CHECK (tax_scheme IN ('pph_final', 'ppn'))
contract_value DECIMAL(15,2)
commission_pct DECIMAL(5,2)  -- hanya untuk model komisi
start_date DATE
end_date DATE
address TEXT
description TEXT
is_deleted BOOLEAN DEFAULT false  -- soft-delete (migration 036)
deleted_at TIMESTAMPTZ
deleted_by UUID REFERENCES users(id)
created_at TIMESTAMPTZ DEFAULT NOW()
updated_at TIMESTAMPTZ DEFAULT NOW()
```

### Finance Tables

#### `termin_schedules`
```sql
id UUID PRIMARY KEY DEFAULT gen_random_uuid()
project_id UUID REFERENCES projects(id)
termin_number INTEGER NOT NULL
label TEXT
percentage DECIMAL(5,2)
amount DECIMAL(15,2)
due_date DATE
status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'invoiced', 'paid'))
paid_at TIMESTAMPTZ
payment_proof_url TEXT
notes TEXT
created_at TIMESTAMPTZ DEFAULT NOW()
updated_at TIMESTAMPTZ DEFAULT NOW()
```

#### `invoices`
```sql
id UUID PRIMARY KEY DEFAULT gen_random_uuid()
project_id UUID REFERENCES projects(id)
termin_id UUID REFERENCES termin_schedules(id)
invoice_number TEXT UNIQUE
status TEXT DEFAULT 'draft' CHECK (status IN ('draft', 'sent', 'paid', 'overdue', 'cancelled'))
subtotal DECIMAL(15,2)
tax_amount DECIMAL(15,2)
tax_pct DECIMAL(5,2)
amount_due DECIMAL(15,2)
due_date DATE
paid_at TIMESTAMPTZ
notes TEXT
line_items JSONB  -- invoice line items (migration 034)
created_at TIMESTAMPTZ DEFAULT NOW()
updated_at TIMESTAMPTZ DEFAULT NOW()
```

#### `payments`
```sql
id UUID PRIMARY KEY DEFAULT gen_random_uuid()
invoice_id UUID REFERENCES invoices(id)
project_id UUID REFERENCES projects(id)
cash_account_id UUID REFERENCES cash_accounts(id)
amount DECIMAL(15,2)
payment_date DATE
method TEXT
reference TEXT
notes TEXT
created_at TIMESTAMPTZ DEFAULT NOW()
```

#### `expense_category_templates`
```sql
id UUID PRIMARY KEY DEFAULT gen_random_uuid()
name TEXT NOT NULL
description TEXT
sort_order INTEGER
is_active BOOLEAN DEFAULT true
created_at TIMESTAMPTZ DEFAULT NOW()
```

#### `project_expense_categories`
```sql
id UUID PRIMARY KEY DEFAULT gen_random_uuid()
project_id UUID REFERENCES projects(id)
template_id UUID REFERENCES expense_category_templates(id)
name TEXT NOT NULL
budget DECIMAL(15,2)
sort_order INTEGER
created_at TIMESTAMPTZ DEFAULT NOW()
```

#### `expense_reports`
```sql
id UUID PRIMARY KEY DEFAULT gen_random_uuid()
project_id UUID REFERENCES projects(id)
submitted_by UUID REFERENCES users(id)
title TEXT
status TEXT DEFAULT 'draft' CHECK (status IN ('draft', 'submitted', 'approved', 'rejected'))
total_amount DECIMAL(15,2)
approved_by UUID REFERENCES users(id)
approved_at TIMESTAMPTZ
rejection_reason TEXT
notes TEXT
created_at TIMESTAMPTZ DEFAULT NOW()
updated_at TIMESTAMPTZ DEFAULT NOW()
```

#### `expense_items`
```sql
id UUID PRIMARY KEY DEFAULT gen_random_uuid()
report_id UUID REFERENCES expense_reports(id)
category_id UUID REFERENCES project_expense_categories(id)
description TEXT
amount DECIMAL(15,2)
receipt_url TEXT
created_at TIMESTAMPTZ DEFAULT NOW()
```

#### `tax_records`
```sql
id UUID PRIMARY KEY DEFAULT gen_random_uuid()
invoice_id UUID REFERENCES invoices(id)
project_id UUID REFERENCES projects(id)
tax_scheme TEXT
tax_pct DECIMAL(5,2)
tax_amount DECIMAL(15,2)
created_at TIMESTAMPTZ DEFAULT NOW()
```

### Mandor Tables

#### `mandor_assignments`
```sql
id UUID PRIMARY KEY DEFAULT gen_random_uuid()
project_id UUID REFERENCES projects(id)
mandor_id UUID REFERENCES users(id)
assigned_by UUID REFERENCES users(id)
notes TEXT
is_active BOOLEAN DEFAULT true
created_at TIMESTAMPTZ DEFAULT NOW()
```

#### `work_scopes`
```sql
id UUID PRIMARY KEY DEFAULT gen_random_uuid()
assignment_id UUID REFERENCES mandor_assignments(id)
project_id UUID REFERENCES projects(id)
mandor_id UUID REFERENCES users(id)
name TEXT NOT NULL
payment_system TEXT NOT NULL CHECK (payment_system IN ('harian', 'borongan', 'progress_pct'))
contract_value DECIMAL(15,2)
start_date DATE
end_date DATE
progress_pct DECIMAL(5,2) DEFAULT 0
status TEXT DEFAULT 'active' CHECK (status IN ('active', 'completed', 'cancelled'))
notes TEXT
created_at TIMESTAMPTZ DEFAULT NOW()
updated_at TIMESTAMPTZ DEFAULT NOW()
```

#### `work_scope_items` (migration 023)
```sql
id UUID PRIMARY KEY DEFAULT gen_random_uuid()
scope_id UUID REFERENCES work_scopes(id)
name TEXT NOT NULL
unit TEXT NOT NULL  -- m², m³, batang, kg, ton, unit, ls, set, titik, panjang, hari, bulan, m, dll
volume_plan DECIMAL(10,3)
volume_done DECIMAL(10,3) DEFAULT 0
unit_price DECIMAL(15,2)
category TEXT  -- 12 kategori: struktur, pondasi, dinding, atap, dll
specs JSONB  -- key-value spesifikasi teknis
notes TEXT
created_at TIMESTAMPTZ DEFAULT NOW()
updated_at TIMESTAMPTZ DEFAULT NOW()
```

#### `workers` (migration 018 + 028)
```sql
id UUID PRIMARY KEY DEFAULT gen_random_uuid()
mandor_id UUID REFERENCES users(id)  -- akan diubah ke global (pending)
name TEXT NOT NULL
phone TEXT
skills TEXT[]  -- array skills (migration 028)
tipe TEXT CHECK (tipe IN ('tukang', 'laden', 'kenek'))  -- PENDING implementasi
is_active BOOLEAN DEFAULT true
created_at TIMESTAMPTZ DEFAULT NOW()
updated_at TIMESTAMPTZ DEFAULT NOW()
```

#### `daily_wage_logs`
```sql
id UUID PRIMARY KEY DEFAULT gen_random_uuid()
scope_id UUID REFERENCES work_scopes(id)
project_id UUID REFERENCES projects(id)
mandor_id UUID REFERENCES users(id)
week_start DATE
week_end DATE
total_wage DECIMAL(15,2)
worker_count INTEGER
status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'paid'))
cash_account_id UUID REFERENCES cash_accounts(id)
payment_method TEXT
approved_by UUID REFERENCES users(id)
approved_at TIMESTAMPTZ
rejection_reason TEXT
notes TEXT
created_at TIMESTAMPTZ DEFAULT NOW()
updated_at TIMESTAMPTZ DEFAULT NOW()
```

#### `kasbons`
```sql
id UUID PRIMARY KEY DEFAULT gen_random_uuid()
project_id UUID REFERENCES projects(id)
mandor_id UUID REFERENCES users(id)
scope_id UUID REFERENCES work_scopes(id)
amount DECIMAL(15,2)
purpose TEXT CHECK (purpose IN ('gaji_tukang', 'uang_makan', 'pembelian_alat', 'operasional', 'lain_lain'))
fund_source TEXT DEFAULT 'owner_advance' CHECK (fund_source IN ('owner_advance', 'client_fund'))
status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'settled'))
cash_account_id UUID REFERENCES cash_accounts(id)
photo_url TEXT  -- foto nota kasbon (migration 031)
approved_by UUID REFERENCES users(id)
approved_at TIMESTAMPTZ
rejection_reason TEXT
notes TEXT
created_at TIMESTAMPTZ DEFAULT NOW()
updated_at TIMESTAMPTZ DEFAULT NOW()
```

#### `worker_kasbons`
```sql
id UUID PRIMARY KEY DEFAULT gen_random_uuid()
worker_id UUID REFERENCES workers(id)
mandor_id UUID REFERENCES users(id)
project_id UUID REFERENCES projects(id)
amount DECIMAL(15,2)
purpose TEXT
status TEXT DEFAULT 'pending'
created_at TIMESTAMPTZ DEFAULT NOW()
updated_at TIMESTAMPTZ DEFAULT NOW()
```

#### `progress_payments`
```sql
id UUID PRIMARY KEY DEFAULT gen_random_uuid()
scope_id UUID REFERENCES work_scopes(id)
pct_completed DECIMAL(5,2)
amount DECIMAL(15,2)
paid_at TIMESTAMPTZ
created_at TIMESTAMPTZ DEFAULT NOW()
```

#### `borongan_settlements`
```sql
id UUID PRIMARY KEY DEFAULT gen_random_uuid()
scope_id UUID REFERENCES work_scopes(id)
settlement_amount DECIMAL(15,2)
deductions JSONB
net_amount DECIMAL(15,2)
settled_at TIMESTAMPTZ
notes TEXT
created_at TIMESTAMPTZ DEFAULT NOW()
```

### Monitoring Tables

#### `milestones`
```sql
id UUID PRIMARY KEY DEFAULT gen_random_uuid()
project_id UUID REFERENCES projects(id)
title TEXT NOT NULL
description TEXT
target_date DATE
completed_at TIMESTAMPTZ
status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'overdue'))
sort_order INTEGER
created_by UUID REFERENCES users(id)
created_at TIMESTAMPTZ DEFAULT NOW()
updated_at TIMESTAMPTZ DEFAULT NOW()
```

#### `progress_logs`
```sql
id UUID PRIMARY KEY DEFAULT gen_random_uuid()
project_id UUID REFERENCES projects(id)
reported_by UUID REFERENCES users(id)
pct_overall DECIMAL(5,2)
weather TEXT
worker_count INTEGER
notes TEXT
logged_at DATE
created_at TIMESTAMPTZ DEFAULT NOW()
```

#### `project_photos`
```sql
id UUID PRIMARY KEY DEFAULT gen_random_uuid()
project_id UUID REFERENCES projects(id)
progress_log_id UUID REFERENCES progress_logs(id)
url TEXT NOT NULL
caption TEXT
taken_at TIMESTAMPTZ
uploaded_by UUID REFERENCES users(id)
created_at TIMESTAMPTZ DEFAULT NOW()
```

#### `documents`
```sql
id UUID PRIMARY KEY DEFAULT gen_random_uuid()
project_id UUID REFERENCES projects(id)
name TEXT NOT NULL
url TEXT NOT NULL
file_type TEXT
file_size INTEGER
uploaded_by UUID REFERENCES users(id)
created_at TIMESTAMPTZ DEFAULT NOW()
```

### Cash Management Tables

#### `cash_accounts`
```sql
id UUID PRIMARY KEY DEFAULT gen_random_uuid()
name TEXT NOT NULL
type TEXT CHECK (type IN ('main_cash', 'bank', 'petty_cash'))
balance DECIMAL(15,2) DEFAULT 0  -- diupdate otomatis via DB triggers
is_active BOOLEAN DEFAULT true
notes TEXT
created_at TIMESTAMPTZ DEFAULT NOW()
updated_at TIMESTAMPTZ DEFAULT NOW()
```

#### `cash_transfers`
```sql
id UUID PRIMARY KEY DEFAULT gen_random_uuid()
from_account_id UUID REFERENCES cash_accounts(id)
to_account_id UUID REFERENCES cash_accounts(id)
amount DECIMAL(15,2)
transfer_date DATE
status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'confirmed'))
confirmed_by UUID REFERENCES users(id)
confirmed_at TIMESTAMPTZ
notes TEXT
created_by UUID REFERENCES users(id)
created_at TIMESTAMPTZ DEFAULT NOW()
```

#### `project_expenses`
```sql
id UUID PRIMARY KEY DEFAULT gen_random_uuid()
project_id UUID REFERENCES projects(id)
category_id UUID REFERENCES project_expense_categories(id)
cash_account_id UUID REFERENCES cash_accounts(id)
amount DECIMAL(15,2)
description TEXT
expense_date DATE
receipt_url TEXT
source TEXT DEFAULT 'owner_advance' CHECK (source IN ('owner_advance', 'client_fund'))
status TEXT DEFAULT 'draft' CHECK (status IN ('draft', 'submitted', 'approved', 'rejected'))
submitted_by UUID REFERENCES users(id)
approved_by UUID REFERENCES users(id)
approved_at TIMESTAMPTZ
rejection_reason TEXT
created_at TIMESTAMPTZ DEFAULT NOW()
updated_at TIMESTAMPTZ DEFAULT NOW()
```

### System Tables

#### `notifications` (migration 038 — enhanced)
```sql
id UUID PRIMARY KEY DEFAULT gen_random_uuid()
user_id UUID REFERENCES users(id)
title TEXT NOT NULL
body TEXT
type TEXT  -- 'kasbon', 'invoice', 'milestone', 'wage_report', 'project', dll
action_type TEXT  -- 'approve_kasbon', 'reject_kasbon', 'approve_wage_report', dll
action_data JSONB  -- { kasbon_id, project_id, mandor_name, ... }
is_read BOOLEAN DEFAULT false
is_actioned BOOLEAN DEFAULT false
actioned_at TIMESTAMPTZ
priority TEXT DEFAULT 'normal' CHECK (priority IN ('low', 'normal', 'high', 'urgent'))
created_at TIMESTAMPTZ DEFAULT NOW()
```

#### `audit_logs`
```sql
id UUID PRIMARY KEY DEFAULT gen_random_uuid()
user_id UUID REFERENCES users(id) ON DELETE SET NULL  -- trail survives user deletion
table_name TEXT
record_id UUID
action TEXT CHECK (action IN ('INSERT', 'UPDATE', 'DELETE'))
old_data JSONB
new_data JSONB
ip_address TEXT
created_at TIMESTAMPTZ DEFAULT NOW()
```

---

## Migration Plan — Tabel Baru (Fase 2: E-Procurement)

Nomor migration berikut: **039, 040, 041**

### Migration 039 — Material Management

```sql
-- File: db/migrations/039_material_management.sql

CREATE TABLE material_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  sort_order INTEGER,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE materials (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category_id UUID NOT NULL REFERENCES material_categories(id),
  code TEXT UNIQUE,  -- kode material internal (optional)
  name TEXT NOT NULL,
  unit TEXT NOT NULL,  -- satuan: kg, m², m³, batang, sak, dll
  min_stock_qty DECIMAL(10,3) DEFAULT 0,  -- threshold untuk alert stok kritis
  description TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE project_stocks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id),
  material_id UUID NOT NULL REFERENCES materials(id),
  qty_on_hand DECIMAL(10,3) DEFAULT 0,
  last_opname_at TIMESTAMPTZ,
  last_opname_qty DECIMAL(10,3),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(project_id, material_id)
);

CREATE TABLE stock_movements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id),
  material_id UUID NOT NULL REFERENCES materials(id),
  movement_type TEXT NOT NULL CHECK (movement_type IN ('in', 'out', 'opname', 'adjustment')),
  qty DECIMAL(10,3) NOT NULL,  -- positif = masuk, negatif = keluar
  qty_after DECIMAL(10,3) NOT NULL,  -- saldo setelah movement
  reference_type TEXT,  -- 'goods_receipt', 'usage', 'opname', dll
  reference_id UUID,  -- ID dari tabel referensi
  notes TEXT,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_materials_category ON materials(category_id);
CREATE INDEX idx_project_stocks_project ON project_stocks(project_id);
CREATE INDEX idx_project_stocks_material ON project_stocks(material_id);
CREATE INDEX idx_stock_movements_project ON stock_movements(project_id, created_at DESC);
CREATE INDEX idx_stock_movements_material ON stock_movements(material_id);
```

### Migration 040 — Supplier Management

```sql
-- File: db/migrations/040_supplier_management.sql

CREATE TABLE suppliers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  phone TEXT,
  address TEXT,
  email TEXT,
  payment_method TEXT DEFAULT 'transfer' CHECK (payment_method IN ('transfer', 'cash', 'cod', 'bon')),
  bank_name TEXT,
  bank_account TEXT,
  bank_account_name TEXT,
  credit_term_days INTEGER DEFAULT 0,  -- H+N jatuh tempo
  notes TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE supplier_invoices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_id UUID NOT NULL REFERENCES suppliers(id),
  project_id UUID REFERENCES projects(id),
  po_id UUID,  -- REFERENCES purchase_orders(id) — ditambahkan di migration 041
  invoice_number TEXT,  -- nomor bon/invoice supplier
  amount DECIMAL(15,2) NOT NULL,
  due_date DATE,
  payment_method TEXT CHECK (payment_method IN ('transfer', 'cash', 'cod', 'bon')),
  status TEXT DEFAULT 'unpaid' CHECK (status IN ('unpaid', 'partial', 'paid')),
  notes TEXT,
  invoice_photo_url TEXT,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE supplier_payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_invoice_id UUID NOT NULL REFERENCES supplier_invoices(id),
  amount DECIMAL(15,2) NOT NULL,
  paid_at TIMESTAMPTZ DEFAULT NOW(),
  payment_proof_url TEXT,
  cash_account_id UUID REFERENCES cash_accounts(id),
  notes TEXT,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_supplier_invoices_supplier ON supplier_invoices(supplier_id);
CREATE INDEX idx_supplier_invoices_project ON supplier_invoices(project_id);
CREATE INDEX idx_supplier_invoices_status ON supplier_invoices(status);
CREATE INDEX idx_supplier_invoices_due_date ON supplier_invoices(due_date) WHERE status != 'paid';
CREATE INDEX idx_supplier_payments_invoice ON supplier_payments(supplier_invoice_id);
```

### Migration 041 — Procurement Workflow

```sql
-- File: db/migrations/041_procurement_workflow.sql

CREATE TABLE material_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id),
  requested_by UUID NOT NULL REFERENCES users(id),
  mr_number TEXT UNIQUE,  -- auto-generated: MR-YYYYMMDD-XXXX
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'rejected', 'cancelled', 'po_created')),
  total_estimated_value DECIMAL(15,2),
  approved_by UUID REFERENCES users(id),
  approved_at TIMESTAMPTZ,
  rejection_reason TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE material_request_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  mr_id UUID NOT NULL REFERENCES material_requests(id) ON DELETE CASCADE,
  material_id UUID NOT NULL REFERENCES materials(id),
  qty_requested DECIMAL(10,3) NOT NULL,
  qty_approved DECIMAL(10,3),  -- bisa lebih kecil dari requested
  estimated_price DECIMAL(15,2),
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE purchase_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id),
  supplier_id UUID NOT NULL REFERENCES suppliers(id),
  mr_id UUID REFERENCES material_requests(id),
  po_number TEXT UNIQUE,  -- auto-generated: PO-YYYYMMDD-XXXX
  status TEXT DEFAULT 'draft'
    CHECK (status IN ('draft', 'confirmed', 'partial_received', 'received', 'cancelled')),
  expected_date DATE,
  total_amount DECIMAL(15,2),
  notes TEXT,
  confirmed_by UUID REFERENCES users(id),
  confirmed_at TIMESTAMPTZ,
  created_by UUID NOT NULL REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE purchase_order_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  po_id UUID NOT NULL REFERENCES purchase_orders(id) ON DELETE CASCADE,
  material_id UUID NOT NULL REFERENCES materials(id),
  qty_ordered DECIMAL(10,3) NOT NULL,
  qty_received DECIMAL(10,3) DEFAULT 0,
  unit_price DECIMAL(15,2) NOT NULL,
  total_price DECIMAL(15,2) GENERATED ALWAYS AS (qty_ordered * unit_price) STORED,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE goods_receipts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  po_id UUID NOT NULL REFERENCES purchase_orders(id),
  project_id UUID NOT NULL REFERENCES projects(id),
  received_at TIMESTAMPTZ DEFAULT NOW(),
  received_by UUID REFERENCES users(id),
  delivery_note_url TEXT,  -- foto surat jalan
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE goods_receipt_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  gr_id UUID NOT NULL REFERENCES goods_receipts(id) ON DELETE CASCADE,
  po_item_id UUID NOT NULL REFERENCES purchase_order_items(id),
  material_id UUID NOT NULL REFERENCES materials(id),
  qty_received DECIMAL(10,3) NOT NULL,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- FK yang tertunda dari migration 040
ALTER TABLE supplier_invoices
  ADD CONSTRAINT fk_supplier_invoices_po
  FOREIGN KEY (po_id) REFERENCES purchase_orders(id);

-- Indexes
CREATE INDEX idx_material_requests_project ON material_requests(project_id);
CREATE INDEX idx_material_requests_status ON material_requests(status);
CREATE INDEX idx_material_requests_requested_by ON material_requests(requested_by);
CREATE INDEX idx_mr_items_mr ON material_request_items(mr_id);
CREATE INDEX idx_purchase_orders_project ON purchase_orders(project_id);
CREATE INDEX idx_purchase_orders_supplier ON purchase_orders(supplier_id);
CREATE INDEX idx_purchase_orders_status ON purchase_orders(status);
CREATE INDEX idx_po_items_po ON purchase_order_items(po_id);
CREATE INDEX idx_goods_receipts_po ON goods_receipts(po_id);
CREATE INDEX idx_goods_receipt_items_gr ON goods_receipt_items(gr_id);

-- Auto-update stock setelah goods receipt dikonfirmasi
-- (via application logic atau DB trigger — implementasi di application layer)
```

### Migration 043 — RAB Material Tracking (Fase 5)

```sql
-- File: db/migrations/043_rab_material_tracking.sql

ALTER TABLE materials ADD COLUMN rab_unit_cost DECIMAL(15,2);

CREATE TABLE project_rab_materials (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id          UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  material_id         UUID NOT NULL REFERENCES materials(id),
  rab_quantity        DECIMAL(15,3) NOT NULL CHECK (rab_quantity > 0),
  rab_unit_cost       DECIMAL(15,2) NOT NULL CHECK (rab_unit_cost >= 0),
  requested_quantity  DECIMAL(15,3) NOT NULL DEFAULT 0,  -- diupdate tiap MR dibuat
  received_quantity   DECIMAL(15,3) NOT NULL DEFAULT 0,  -- diupdate tiap GR dikonfirmasi
  notes               TEXT,
  created_by          UUID REFERENCES users(id),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(project_id, material_id)
);

-- PO delivery tracking (independent dari migration 041)
CREATE TABLE po_delivery_log (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  po_number        TEXT NOT NULL,
  project_id       UUID REFERENCES projects(id),
  delivery_channel TEXT NOT NULL CHECK (delivery_channel IN ('whatsapp', 'email')),
  sent_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  sent_by          UUID REFERENCES users(id),
  recipient        TEXT,
  status           TEXT DEFAULT 'sent' CHECK (status IN ('sent', 'failed', 'confirmed')),
  notes            TEXT
);
```

### Migration 044 — Field Opname Reports (Fase 5)

```sql
-- File: db/migrations/044_field_opname_reports.sql

CREATE TABLE field_opname_reports (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  work_scope_id    UUID NOT NULL REFERENCES work_scopes(id),
  project_id       UUID NOT NULL REFERENCES projects(id),
  opname_date      DATE NOT NULL,
  measured_by      UUID NOT NULL REFERENCES users(id),
  scope_item_id    UUID,
  planned_volume   DECIMAL(15,3),
  measured_volume  DECIMAL(15,3) NOT NULL CHECK (measured_volume >= 0),
  unit             TEXT NOT NULL,
  completion_pct   DECIMAL(5,2) NOT NULL CHECK (completion_pct BETWEEN 0 AND 100),
  photo_urls       TEXT[],
  notes            TEXT,
  status           TEXT NOT NULL DEFAULT 'submitted'
    CHECK (status IN ('submitted', 'verified', 'disputed')),
  verified_by      UUID REFERENCES users(id),
  verified_at      TIMESTAMPTZ,
  dispute_reason   TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Kolom tambahan di progress_payments
ALTER TABLE progress_payments
  ADD COLUMN opname_report_id UUID REFERENCES field_opname_reports(id),
  ADD COLUMN requires_opname  BOOLEAN NOT NULL DEFAULT true;

-- Kolom tambahan di work_scopes (digital e-sign)
ALTER TABLE work_scopes
  ADD COLUMN contract_pdf_url      TEXT,
  ADD COLUMN contract_signed_at    TIMESTAMPTZ,
  ADD COLUMN mandor_signature_url  TEXT,
  ADD COLUMN pm_signature_url      TEXT,
  ADD COLUMN contract_status       TEXT NOT NULL DEFAULT 'unsigned'
    CHECK (contract_status IN ('unsigned', 'signed', 'disputed'));
```

### Migration 045 — Asset Management (Fase 6)

```sql
-- File: db/migrations/045_asset_management.sql

CREATE TABLE assets (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_code         TEXT NOT NULL UNIQUE,
  name               TEXT NOT NULL,
  category           TEXT NOT NULL
    CHECK (category IN ('alat_berat','alat_tangan','kendaraan','scaffolding','lainnya')),
  brand              TEXT, model TEXT, serial_number TEXT,
  purchase_date      DATE,
  purchase_price     DECIMAL(15,2),
  current_value      DECIMAL(15,2),
  useful_life_months INTEGER NOT NULL DEFAULT 60,
  depreciation_method TEXT NOT NULL DEFAULT 'straight_line'
    CHECK (depreciation_method IN ('straight_line','double_declining')),
  current_project_id UUID REFERENCES projects(id),
  status             TEXT NOT NULL DEFAULT 'available'
    CHECK (status IN ('available','deployed','maintenance','disposed')),
  condition          TEXT NOT NULL DEFAULT 'good'
    CHECK (condition IN ('excellent','good','fair','poor')),
  photo_url          TEXT, notes TEXT,
  created_by         UUID REFERENCES users(id),
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE asset_movements (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_id         UUID NOT NULL REFERENCES assets(id),
  from_project_id  UUID REFERENCES projects(id),
  to_project_id    UUID REFERENCES projects(id),
  movement_type    TEXT NOT NULL
    CHECK (movement_type IN ('deploy','return','transfer','maintenance')),
  moved_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  moved_by         UUID REFERENCES users(id),
  approved_by      UUID REFERENCES users(id),
  condition_before TEXT, condition_after TEXT,
  return_expected_at DATE, returned_at TIMESTAMPTZ,
  photo_url        TEXT, notes TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE asset_depreciation_logs (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_id             UUID NOT NULL REFERENCES assets(id),
  project_id           UUID REFERENCES projects(id),
  period_year          INTEGER NOT NULL,
  period_month         INTEGER NOT NULL CHECK (period_month BETWEEN 1 AND 12),
  depreciation_amount  DECIMAL(15,2) NOT NULL,
  book_value_after     DECIMAL(15,2) NOT NULL,
  depreciation_method  TEXT NOT NULL,
  journal_entry_id     UUID,   -- FK ke journal_entries setelah GL ada
  notes                TEXT,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(asset_id, period_year, period_month)
);
```

### Migration 046 — Audit Trail Enhancement (Fase 5)

```sql
-- File: db/migrations/046_audit_trail_enhancement.sql

ALTER TABLE audit_logs
  ADD COLUMN IF NOT EXISTS before_value  JSONB,
  ADD COLUMN IF NOT EXISTS after_value   JSONB,
  ADD COLUMN IF NOT EXISTS diff          JSONB,
  ADD COLUMN IF NOT EXISTS ip_address    TEXT,
  ADD COLUMN IF NOT EXISTS user_agent    TEXT,
  ADD COLUMN IF NOT EXISTS severity      TEXT NOT NULL DEFAULT 'info'
    CHECK (severity IN ('info','warning','critical'));

CREATE INDEX idx_audit_logs_severity   ON audit_logs(severity);
CREATE INDEX idx_audit_logs_created_at ON audit_logs(created_at DESC);
CREATE INDEX idx_audit_logs_table_name ON audit_logs(table_name);
```

### Migration 047 — General Ledger (Fase 7)

```sql
-- File: db/migrations/047_general_ledger.sql
-- JANGAN dijalankan sebelum CoA divalidasi oleh akuntan.

CREATE TABLE accounts (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code           TEXT NOT NULL UNIQUE,
  name           TEXT NOT NULL,
  account_type   TEXT NOT NULL CHECK (account_type IN ('asset','liability','equity','revenue','expense')),
  normal_balance TEXT NOT NULL CHECK (normal_balance IN ('debit','credit')),
  parent_id      UUID REFERENCES accounts(id),
  project_id     UUID REFERENCES projects(id),
  description    TEXT,
  is_active      BOOLEAN NOT NULL DEFAULT true,
  sort_order     INTEGER,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE journal_entries (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entry_number      TEXT NOT NULL UNIQUE,
  entry_date        DATE NOT NULL,
  description       TEXT NOT NULL,
  reference_type    TEXT,
  reference_id      UUID,
  is_auto_generated BOOLEAN NOT NULL DEFAULT false,
  is_reversed       BOOLEAN NOT NULL DEFAULT false,
  reversed_by_id    UUID REFERENCES journal_entries(id),
  created_by        UUID REFERENCES users(id),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE journal_entry_lines (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  journal_entry_id UUID NOT NULL REFERENCES journal_entries(id) ON DELETE CASCADE,
  account_id       UUID NOT NULL REFERENCES accounts(id),
  debit_amount     DECIMAL(18,2) NOT NULL DEFAULT 0,
  credit_amount    DECIMAL(18,2) NOT NULL DEFAULT 0,
  description      TEXT,
  project_id       UUID REFERENCES projects(id),
  CONSTRAINT chk_debit_xor_credit CHECK (
    (debit_amount > 0 AND credit_amount = 0) OR
    (credit_amount > 0 AND debit_amount = 0)
  )
);
```

### Migration 042 — RLS Policies (Fase 5 — sebelum production)

```sql
-- File: db/migrations/042_rls_policies.sql
-- WAJIB dikerjakan sebelum go-live
-- Aktifkan RLS per tabel dan buat policies per role

-- Contoh untuk tabel projects:
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin can do anything on projects"
  ON projects FOR ALL TO authenticated
  USING (
    EXISTS (SELECT 1 FROM users WHERE auth_id = auth.uid() AND role = 'admin')
  );

CREATE POLICY "pm can read and update own projects"
  ON projects FOR SELECT TO authenticated
  USING (
    pm_id = (SELECT id FROM users WHERE auth_id = auth.uid())
    OR
    EXISTS (SELECT 1 FROM users WHERE auth_id = auth.uid() AND role = 'admin')
  );

-- ... dst untuk semua tabel
```

---

## Applied Migrations (049–058) — Sudah Dieksekusi ke Supabase

### Migration 049 — RLS Policies
- RLS enabled di ~46 tabel
- 3 helper functions: `auth_role()`, `auth_user_id()`, `auth_client_id()`
- Defense-in-depth: anon/JWT enforce, service_role bypass

### Migration 052 — ERP Phase 1 (RAB + Progress + Work Scopes)
```sql
-- rab_items: tambah 4 kolom komponen biaya
ALTER TABLE rab_items
  ADD COLUMN material_pct NUMERIC(5,2) NOT NULL DEFAULT 0,
  ADD COLUMN upah_pct NUMERIC(5,2) NOT NULL DEFAULT 0,
  ADD COLUMN alat_pct NUMERIC(5,2) NOT NULL DEFAULT 0,
  ADD COLUMN other_pct NUMERIC(5,2) NOT NULL DEFAULT 0,
  ADD COLUMN planned_start DATE,
  ADD COLUMN planned_end DATE,
  ADD COLUMN gantt_dependencies UUID[];

-- Constraint: total 0 (belum diisi) atau 99.9-100.1 (sudah diisi)
ALTER TABLE rab_items ADD CONSTRAINT rab_items_pct_sum CHECK (
  (material_pct = 0 AND upah_pct = 0 AND alat_pct = 0 AND other_pct = 0)
  OR (ROUND(material_pct + upah_pct + alat_pct + other_pct, 1) BETWEEN 99.9 AND 100.1)
);

-- progress_logs: dual mode support
ALTER TABLE progress_logs
  ADD COLUMN mode TEXT NOT NULL DEFAULT 'daily' CHECK (mode IN ('daily', 'detail')),
  ADD COLUMN rab_item_id UUID REFERENCES rab_items(id) ON DELETE SET NULL,
  ADD COLUMN pct_completion NUMERIC(5,2),
  ALTER COLUMN pct_overall DROP NOT NULL;  -- nullable

-- work_scopes: optional link ke RAB sub-kategori
ALTER TABLE work_scopes ADD COLUMN rab_category_id UUID REFERENCES rab_items(id) ON DELETE SET NULL;
```

### Migration 053 — Change Orders
```sql
CREATE TABLE change_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  co_number TEXT NOT NULL,  -- auto CO-001, CO-002, ...
  title TEXT NOT NULL,
  description TEXT,
  status TEXT DEFAULT 'draft' CHECK (status IN ('draft','submitted','approved','rejected')),
  baseline_contract_value NUMERIC(15,2),
  submitted_at TIMESTAMPTZ, approved_at TIMESTAMPTZ, approved_by UUID REFERENCES users(id),
  rejected_at TIMESTAMPTZ, rejected_reason TEXT,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE TABLE change_order_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  change_order_id UUID NOT NULL REFERENCES change_orders(id) ON DELETE CASCADE,
  item_type TEXT NOT NULL CHECK (item_type IN ('kerja_tambah','kerja_kurang','perubahan_volume','perubahan_spec')),
  rab_item_id UUID REFERENCES rab_items(id) ON DELETE SET NULL,
  description TEXT NOT NULL,
  unit TEXT, volume_delta NUMERIC(15,3), unit_price NUMERIC(15,2),
  amount_delta NUMERIC(15,2) NOT NULL,
  notes TEXT, created_at TIMESTAMPTZ DEFAULT NOW()
);
```

### Migration 054 — Gantt Dependency Rules
```sql
ALTER TABLE rab_items ADD COLUMN gantt_dep_rules JSONB;
-- Format: [{ item_id: UUID, threshold_pct: number, label: string }]
```

### Migration 055 — Document & Photo Enhancements
```sql
ALTER TABLE project_photos ADD COLUMN category TEXT DEFAULT 'progress'
  CHECK (category IN ('progress','defect','serah_terima','other'));

CREATE TABLE document_access_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  accessed_at TIMESTAMPTZ DEFAULT NOW(),
  action TEXT NOT NULL CHECK (action IN ('view','download'))
);
```

### Migration 056 — Kasbon Redesign
```sql
-- kasbons: work_scope_id jadi nullable, tambah project_id wajib
ALTER TABLE kasbons ALTER COLUMN work_scope_id DROP NOT NULL;
ALTER TABLE kasbons ADD COLUMN project_id UUID REFERENCES projects(id);

-- work_scopes: hapus kasbon_limit_pct
ALTER TABLE work_scopes DROP COLUMN IF EXISTS kasbon_limit_pct;
```

### Migration 057 — Clients User Link
```sql
ALTER TABLE clients ADD COLUMN user_id UUID REFERENCES users(id) ON DELETE SET NULL;
CREATE INDEX idx_clients_user_id ON clients(user_id);
-- Auto-link by email via UPDATE join
```

### Migration 058 — Procurement Enhancements
```sql
ALTER TABLE materials ADD COLUMN min_stock NUMERIC(10,3) DEFAULT 0;
ALTER TABLE material_requests 
  ADD COLUMN rejection_notes TEXT,
  ADD COLUMN approved_at TIMESTAMPTZ;
ALTER TABLE purchase_orders
  ADD COLUMN canceled_at TIMESTAMPTZ,
  ADD COLUMN cancel_notes TEXT;
```

---

## Database Triggers (Sudah Ada)

| Trigger | Tabel | Fungsi |
|---------|-------|--------|
| `protect_created_at_*` | 10 tabel kritis | Cegah update created_at setelah INSERT |
| `update_cash_balance_*` | `cash_accounts` | Auto-update balance saat expense/payment/transfer |
| `set_updated_at_*` | Semua tabel dengan `updated_at` | Auto-update timestamp |

---

## Relasi Antar Tabel (Key FKs)

```
auth.users
    └── users (auth_id)
            ├── projects (pm_id, created_by, deleted_by)
            ├── mandor_assignments (mandor_id, assigned_by)
            ├── work_scopes (mandor_id)
            ├── kasbons (mandor_id, approved_by)
            ├── daily_wage_logs (mandor_id, approved_by)
            ├── notifications (user_id)
            └── audit_logs (user_id ON DELETE SET NULL)

clients
    └── projects (client_id)

projects
    ├── termin_schedules (project_id)
    ├── invoices (project_id, termin_id)
    ├── payments (project_id)
    ├── project_expense_categories (project_id)
    ├── expense_reports (project_id)
    ├── mandor_assignments (project_id)
    ├── work_scopes (project_id)
    ├── kasbons (project_id)
    ├── milestones (project_id)
    ├── progress_logs (project_id)
    ├── project_photos (project_id)
    ├── documents (project_id)
    ├── project_expenses (project_id)
    └── project_stocks (project_id)  [Fase 2]

suppliers [Fase 2]
    ├── supplier_invoices (supplier_id)
    └── purchase_orders (supplier_id)

materials [Fase 2]
    ├── project_stocks (material_id)
    ├── stock_movements (material_id)
    ├── material_request_items (material_id)
    ├── purchase_order_items (material_id)
    └── goods_receipt_items (material_id)
```
