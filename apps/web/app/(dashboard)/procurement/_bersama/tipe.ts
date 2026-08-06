/**
 * PROCUREMENT — bentuk data yang dikirim API, dipakai lintas bagian.
 *
 * Ditulis sebagai `interface`, bukan `any`, khusus untuk yang dipakai LEBIH
 * DARI SATU halaman. Daftar yang hanya dipakai di satu tempat sengaja tidak
 * diangkat ke sini: tipe bersama yang cuma punya satu pemakai adalah biaya
 * pemeliharaan tanpa manfaat.
 */

/**
 * Balasan `/api/v1/procurement/dashboard`.
 *
 * Field-nya disalin persis dari `apps/api/src/routes/v1/procurement.ts`
 * (blok `GET /api/v1/procurement/dashboard`) — bukan ditebak dari nama
 * kartunya. Kalau endpoint berubah, `uji-bentuk-balasan.mjs` yang menangkap.
 */
export interface KpiProcurement {
  mr_pending_approval: number;
  mr_draft: number;
  po_this_month: number;
  po_value_this_month: number;
  overdue_invoices: number;
  overdue_amount: number;
  due_soon_invoices: number;
  total_outstanding: number;
  low_stock_count: number;
}

/** Purchase Order sebagaimana dikirim `GET /procurement/purchase-orders`. */
export interface PurchaseOrder {
  id: string;
  po_number: string;
  status: string;
  order_date: string;
  expected_delivery_date: string | null;
  total_amount: number | string;
  payment_terms?: string | null;
  created_at?: string;
  project?: { id?: string; name?: string } | null;
  supplier?: { id?: string; name?: string; phone?: string | null } | null;
  created_by?: { id?: string; name?: string } | null;
  items?: Array<{
    id: string;
    qty_ordered: number;
    qty_received: number;
    unit: string;
    unit_price: number;
    total_price: number;
    material?: { id?: string; name?: string } | null;
  }>;
}

/** Supplier sebagaimana dikirim `GET /procurement/suppliers`. */
export interface Supplier {
  id: string;
  name: string;
  code?: string | null;
  contact_person?: string | null;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  city?: string | null;
  payment_terms?: string | null;
  is_active?: boolean;
}

/** Ringkasan PO untuk modal pengiriman ke vendor (Modul 9b). */
export interface PoRingkas {
  id: string;
  po_number: string;
  supplier?: { name?: string; phone?: string | null } | null;
}

export interface PesanKirimPo {
  po_number: string;
  pesan: string;
  /** `null` bila nomor supplier tak sah — tombol WA WAJIB disembunyikan. */
  wa_url: string | null;
  email_tujuan: string | null;
  sudah_dikirim: { whatsapp_at: string | null; email_at: string | null };
}

export interface LogKirimPo {
  id: string;
  channel: string;
  recipient: string | null;
  status: string;
  sent_at: string;
  sender?: { name?: string } | null;
}

/** Syarat pembayaran supplier — dipakai form supplier dan tampilan detailnya. */
export const PAYMENT_TERMS = [
  { value: "cod",          label: "COD — Bayar saat terima" },
  { value: "prepaid",      label: "Prepaid — Bayar sebelum kirim" },
  { value: "net_7",        label: "Net 7 hari" },
  { value: "net_14",       label: "Net 14 hari" },
  { value: "net_30",       label: "Net 30 hari" },
  { value: "open_account", label: "Open Account — Hutang bebas" },
] as const;
