-- ============================================================
-- PURALOKA SUITE — Migration 001
-- Extensions & Enums
-- ============================================================

-- Enable UUID generation
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Enable pgcrypto for secure hashing
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================
-- ENUMS
-- ============================================================

-- User roles
CREATE TYPE user_role AS ENUM (
  'admin',
  'pm',
  'mandor',
  'client'
);

-- Project status
CREATE TYPE project_status AS ENUM (
  'draft',
  'active',
  'on_hold',
  'completed',
  'cancelled'
);

-- Contract model
CREATE TYPE contract_model AS ENUM (
  'termin',
  'komisi'
);

-- Tax scheme
CREATE TYPE tax_scheme AS ENUM (
  'pph_final',
  'ppn'
);

-- Termin status
CREATE TYPE termin_status AS ENUM (
  'pending',
  'billed',
  'paid'
);

-- Invoice type
CREATE TYPE invoice_type AS ENUM (
  'termin_billing',
  'commission_billing',
  'retention_release'
);

-- Invoice status
CREATE TYPE invoice_status AS ENUM (
  'draft',
  'sent',
  'partial',
  'paid',
  'overdue',
  'cancelled'
);

-- Tax type
CREATE TYPE tax_type AS ENUM (
  'pph_final_42',
  'ppn',
  'wht'
);

-- Tax record status
CREATE TYPE tax_record_status AS ENUM (
  'pending',
  'reported',
  'paid'
);

-- Expense report status
CREATE TYPE expense_report_status AS ENUM (
  'draft',
  'submitted',
  'approved',
  'rejected'
);

-- Expense category type
CREATE TYPE expense_category_type AS ENUM (
  'material',
  'labor',
  'equipment',
  'operational',
  'other'
);

-- Mandor assignment status
CREATE TYPE assignment_status AS ENUM (
  'active',
  'completed',
  'terminated'
);

-- Work scope payment system
CREATE TYPE payment_system AS ENUM (
  'harian',
  'borongan',
  'progress_pct'
);

-- Work scope status
CREATE TYPE work_scope_status AS ENUM (
  'active',
  'completed',
  'terminated'
);

-- Kasbon fund source
CREATE TYPE kasbon_fund_source AS ENUM (
  'owner_advance',
  'client_fund'
);

-- Kasbon purpose
CREATE TYPE kasbon_purpose AS ENUM (
  'gaji_tukang',
  'uang_makan',
  'pembelian_alat',
  'operasional',
  'lain_lain'
);

-- Kasbon status
CREATE TYPE kasbon_status AS ENUM (
  'pending',
  'approved',
  'rejected',
  'settled'
);

-- Milestone status
CREATE TYPE milestone_status AS ENUM (
  'pending',
  'in_progress',
  'completed',
  'overdue'
);

-- Document type
CREATE TYPE document_type AS ENUM (
  'kontrak',
  'gambar_kerja',
  'foto_progress',
  'invoice',
  'berita_acara',
  'spk',
  'lainnya'
);

-- Notification channel
CREATE TYPE notification_channel AS ENUM (
  'push',
  'whatsapp',
  'email'
);

-- Payment method
CREATE TYPE payment_method AS ENUM (
  'transfer_bank',
  'cash',
  'qris',
  'cek',
  'giro'
);
