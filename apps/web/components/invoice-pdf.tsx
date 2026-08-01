"use client";

import React from "react";
import {
  Document, Page, View, Text, Image, StyleSheet, 
} from "@react-pdf/renderer";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface CompanyProfile {
  company_name: string;
  tagline?: string | null;
  address?: string | null;
  city?: string | null;
  postal_code?: string | null;
  phone?: string | null;
  email?: string | null;
  npwp?: string | null;
  logo_url?: string | null;
  bank_name?: string | null;
  bank_account?: string | null;
  bank_account_name?: string | null;
  invoice_prefix?: string | null;
  invoice_notes?: string | null;
  signature_name?: string | null;
}

export interface InvoiceLineItem {
  id: string;
  description: string;
  qty: number;
  unit: string | null;
  unit_price: number;
  amount: number;
  sort_order: number;
  notes?: string | null;
  expense?: {
    expense_date?: string | null;
    vendor_name?: string | null;
    category?: { name: string } | null;
  } | null;
}

export interface InvoiceData {
  id: string;
  invoice_number: string;
  invoice_type: string;
  base_amount: number;
  commission_amount: number;
  tax_amount: number;
  retensi_amount?: number;
  retensi_pct?: number | null;
  total_amount: number;
  amount_paid: number;
  amount_due: number;
  issued_date: string;
  due_date: string;
  paid_date?: string | null;
  status: string;
  notes?: string | null;
  description?: string | null;
  projects?: { id: string; name: string; location?: string } | null;
  termin_schedules?: { id: string; label: string; termin_number: number } | null;
  client?: { contact_person: string; phone?: string | null; address?: string | null } | null;
  // Untuk expense_billing dan commission_fee — di-fetch terpisah sebelum render PDF
  line_items?: InvoiceLineItem[];
}

export interface InvoicePDFProps {
  invoice: InvoiceData;
  company: CompanyProfile;
  qrDataUrl?: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtRp(n: number): string {
  return "Rp " + Math.round(n).toLocaleString("id-ID");
}

function fmtDateId(d: string): string {
  const months = ["Januari","Februari","Maret","April","Mei","Juni","Juli","Agustus","September","Oktober","November","Desember"];
  const date = new Date(d);
  return `${date.getDate()} ${months[date.getMonth()]} ${date.getFullYear()}`;
}

function statusLabel(status: string): string {
  const map: Record<string, string> = {
    draft: "DRAFT", sent: "BELUM LUNAS", partial: "DIBAYAR SEBAGIAN",
    paid: "LUNAS", overdue: "JATUH TEMPO", cancelled: "DIBATALKAN",
  };
  return map[status] ?? status.toUpperCase();
}

function typeLabel(type: string): string {
  const map: Record<string, string> = {
    termin_billing:     "Termin",
    commission_billing: "Komisi",
    expense_billing:    "Tagihan Pengeluaran",
    commission_fee:     "Fee Komisi",
    retention_release:  "Retensi",
  };
  return map[type] ?? type;
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const NAVY = "var(--navy)";
const GREEN = "var(--success)";
const RED = "var(--danger)";
const MUTED = "var(--text-secondary)";
const BORDER = "var(--border)";
const BG = "var(--bg)";

const styles = StyleSheet.create({
  page: {
    fontFamily: "Helvetica",
    fontSize: 9,
    color: "var(--text-primary)",
    backgroundColor: "#ffffff",
    padding: 40,
  },
  // ── Header ──
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20, paddingBottom: 16, borderBottomWidth: 2, borderBottomColor: NAVY },
  logo: { width: 80, height: 56, objectFit: "contain" },
  logoPlaceholder: { width: 80, height: 56, backgroundColor: "var(--navy-light)", borderRadius: 4, justifyContent: "center", alignItems: "center" },
  logoPlaceholderText: { fontSize: 18, fontFamily: "Helvetica-Bold", color: NAVY },
  companyBlock: { flex: 1, paddingLeft: 12 },
  companyName: { fontFamily: "Helvetica-Bold", fontSize: 13, color: NAVY, marginBottom: 2 },
  companyDetail: { fontSize: 8, color: MUTED, marginBottom: 1 },
  invoiceBlock: { alignItems: "flex-end" },
  invoiceTitle: { fontFamily: "Helvetica-Bold", fontSize: 20, color: NAVY, letterSpacing: 2 },
  invoiceNumber: { fontSize: 9, color: MUTED, marginTop: 2, marginBottom: 6 },
  invoiceMeta: { fontSize: 8, color: "var(--text-primary)", marginBottom: 1 },

  // ── Client + Status row ──
  clientStatusRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16 },
  clientBlock: { flex: 1 },
  sectionLabel: { fontSize: 7, fontFamily: "Helvetica-Bold", color: NAVY, textTransform: "uppercase", letterSpacing: 1, marginBottom: 4 },
  clientName: { fontFamily: "Helvetica-Bold", fontSize: 10, color: "var(--text-primary)", marginBottom: 1 },
  clientDetail: { fontSize: 8, color: MUTED, marginBottom: 1 },
  statusBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 4, alignSelf: "flex-end" },
  statusText: { fontFamily: "Helvetica-Bold", fontSize: 8, letterSpacing: 0.5 },

  // ── Project row ──
  projectRow: { backgroundColor: BG, borderRadius: 4, padding: "8 12", marginBottom: 16 },
  projectLabel: { fontSize: 7, fontFamily: "Helvetica-Bold", color: MUTED, textTransform: "uppercase", letterSpacing: 1, marginBottom: 2 },
  projectName: { fontFamily: "Helvetica-Bold", fontSize: 10, color: "var(--text-primary)" },
  projectLocation: { fontSize: 8, color: MUTED, marginTop: 1 },

  // ── Line items ──
  table: { marginBottom: 16 },
  tableHeader: { flexDirection: "row", backgroundColor: NAVY, padding: "6 10", borderRadius: 2, marginBottom: 0 },
  tableHeaderText: { fontFamily: "Helvetica-Bold", fontSize: 8, color: "#ffffff" },
  tableRow: { flexDirection: "row", padding: "7 10", borderBottomWidth: 1, borderBottomColor: BORDER },
  tableRowAlt: { flexDirection: "row", padding: "7 10", borderBottomWidth: 1, borderBottomColor: BORDER, backgroundColor: "var(--surface-subtle)" },
  colDesc: { flex: 1 },
  colAmt: { width: 100, textAlign: "right" },
  itemLabel: { fontSize: 9, color: "var(--text-primary)" },
  itemSub: { fontSize: 7, color: MUTED, marginTop: 1 },
  amtText: { fontSize: 9, fontFamily: "Helvetica-Bold", color: "var(--text-primary)" },
  amtNeg: { fontSize: 9, fontFamily: "Helvetica-Bold", color: RED },
  amtMuted: { fontSize: 9, color: MUTED },

  // ── Total row ──
  totalRow: { flexDirection: "row", padding: "10 10", backgroundColor: NAVY, borderRadius: 2, marginBottom: 2 },
  totalLabel: { flex: 1, fontFamily: "Helvetica-Bold", fontSize: 10, color: "#ffffff" },
  totalAmount: { width: 100, textAlign: "right", fontFamily: "Helvetica-Bold", fontSize: 10, color: "#ffffff" },

  // ── Footer area ──
  footerRow: { flexDirection: "row", justifyContent: "space-between", marginTop: 20, borderTopWidth: 1, borderTopColor: BORDER, paddingTop: 14 },
  paymentBlock: { flex: 1 },
  payLabel: { fontSize: 7, fontFamily: "Helvetica-Bold", color: MUTED, textTransform: "uppercase", letterSpacing: 1, marginBottom: 5 },
  payDetail: { fontSize: 8.5, color: "var(--text-primary)", marginBottom: 2 },
  payBold: { fontFamily: "Helvetica-Bold" },
  signatureBlock: { alignItems: "center", minWidth: 120 },
  signatureLabel: { fontSize: 8, color: MUTED, marginBottom: 24 },
  signatureLine: { width: 100, borderBottomWidth: 1, borderBottomColor: "var(--text-primary)", marginBottom: 4 },
  signatureName: { fontFamily: "Helvetica-Bold", fontSize: 8.5, color: "var(--text-primary)" },
  qrImage: { width: 70, height: 70, marginBottom: 4 },

  // ── Notes ──
  notesRow: { marginTop: 10, padding: "7 10", backgroundColor: "var(--warning-bg)", borderRadius: 4, borderWidth: 1, borderColor: "var(--warning-border)" },
  notesText: { fontSize: 7.5, color: "#92400E" },

  // ── Verify ──
  verifyText: { fontSize: 6.5, color: MUTED, marginTop: 10, textAlign: "center" },
});

// ─── Component ────────────────────────────────────────────────────────────────

export function InvoicePDF({ invoice, company, qrDataUrl }: InvoicePDFProps) {
  const inv = invoice;
  const comp = company;

  const retensiAmt = Number(inv.retensi_amount ?? 0);
  const baseAmt = Number(inv.base_amount);
  const commAmt = Number(inv.commission_amount ?? 0);
  const taxAmt = Number(inv.tax_amount ?? 0);

  // Status badge colors
  const statusColors: Record<string, { bg: string; color: string }> = {
    paid:      { bg: "var(--success-bg)", color: GREEN },
    sent:      { bg: "var(--danger-bg)", color: RED },
    partial:   { bg: "var(--warning-bg)", color: "var(--warning)" },
    overdue:   { bg: "var(--danger-bg)", color: RED },
    draft:     { bg: "var(--surface-hover)", color: MUTED },
    cancelled: { bg: "var(--surface-hover)", color: MUTED },
  };
  const sc = statusColors[inv.status] ?? { bg: "var(--surface-hover)", color: MUTED };

  return (
    <Document title={`Invoice ${inv.invoice_number}`}>
      <Page size="A4" style={styles.page}>

        {/* ── Header: Logo + Company + Invoice info ── */}
        <View style={styles.header}>
          {/* Logo / company name */}
          <View style={{ flexDirection: "row", alignItems: "flex-start", flex: 1 }}>
            {comp.logo_url ? (
              <Image src={comp.logo_url.split("?")[0]} style={styles.logo} />
            ) : (
              <View style={styles.logoPlaceholder}>
                <Text style={styles.logoPlaceholderText}>
                  {(comp.company_name ?? "P").substring(0, 2).toUpperCase()}
                </Text>
              </View>
            )}
            <View style={styles.companyBlock}>
              <Text style={styles.companyName}>{comp.company_name}</Text>
              {comp.address && <Text style={styles.companyDetail}>{comp.address}</Text>}
              {(comp.city || comp.postal_code) && (
                <Text style={styles.companyDetail}>{[comp.city, comp.postal_code].filter(Boolean).join(", ")}</Text>
              )}
              {comp.phone && <Text style={styles.companyDetail}>Telp: {comp.phone}</Text>}
              {comp.npwp && <Text style={styles.companyDetail}>NPWP: {comp.npwp}</Text>}
            </View>
          </View>

          {/* Invoice title + meta */}
          <View style={styles.invoiceBlock}>
            <Text style={styles.invoiceTitle}>INVOICE</Text>
            <Text style={styles.invoiceNumber}>{inv.invoice_number}</Text>
            <Text style={styles.invoiceMeta}>Tipe: {typeLabel(inv.invoice_type)}</Text>
            <Text style={styles.invoiceMeta}>Tanggal: {fmtDateId(inv.issued_date)}</Text>
            <Text style={styles.invoiceMeta}>Jatuh Tempo: {fmtDateId(inv.due_date)}</Text>
            {inv.paid_date && <Text style={styles.invoiceMeta}>Dibayar: {fmtDateId(inv.paid_date)}</Text>}
          </View>
        </View>

        {/* ── Client + Status ── */}
        <View style={styles.clientStatusRow}>
          <View style={styles.clientBlock}>
            <Text style={styles.sectionLabel}>Tagihan Kepada</Text>
            {inv.client ? (
              <>
                <Text style={styles.clientName}>{inv.client.contact_person}</Text>
                {inv.client.phone && <Text style={styles.clientDetail}>Telp: {inv.client.phone}</Text>}
                {inv.client.address && <Text style={styles.clientDetail}>{inv.client.address}</Text>}
              </>
            ) : (
              <Text style={styles.clientName}>{inv.projects?.name ?? "—"}</Text>
            )}
          </View>
          <View style={[styles.statusBadge, { backgroundColor: sc.bg, borderWidth: 1, borderColor: sc.color + "40" }]}>
            <Text style={[styles.statusText, { color: sc.color }]}>{statusLabel(inv.status)}</Text>
          </View>
        </View>

        {/* ── Project ── */}
        {inv.projects && (
          <View style={styles.projectRow}>
            <Text style={styles.projectLabel}>Proyek</Text>
            <Text style={styles.projectName}>{inv.projects.name}</Text>
            {inv.projects.location && <Text style={styles.projectLocation}>{inv.projects.location}</Text>}
          </View>
        )}

        {/* ── Line items table ── */}
        <View style={styles.table}>
          {/* Header */}
          <View style={styles.tableHeader}>
            <Text style={[styles.tableHeaderText, { flex: 1 }]}>DESKRIPSI</Text>
            <Text style={[styles.tableHeaderText, { width: 56, textAlign: "right" }]}>QTY</Text>
            <Text style={[styles.tableHeaderText, { width: 100, textAlign: "right" }]}>JUMLAH</Text>
          </View>

          {/* expense_billing atau commission_fee: render line_items jika ada */}
          {(inv.invoice_type === "expense_billing" || inv.invoice_type === "commission_fee") && inv.line_items && inv.line_items.length > 0
            ? inv.line_items.map((li, idx) => (
                <View key={li.id} style={idx % 2 === 0 ? styles.tableRow : styles.tableRowAlt}>
                  <View style={styles.colDesc}>
                    <Text style={styles.itemLabel}>{li.description}</Text>
                    {li.expense?.expense_date && (
                      <Text style={styles.itemSub}>
                        {li.expense.expense_date}
                        {li.expense.vendor_name ? ` · ${li.expense.vendor_name}` : ""}
                        {li.expense.category?.name ? ` · ${li.expense.category.name}` : ""}
                      </Text>
                    )}
                    {li.notes && <Text style={[styles.itemSub, { fontStyle: "italic" }]}>{li.notes}</Text>}
                  </View>
                  <Text style={[styles.amtMuted, { width: 56, textAlign: "right" }]}>
                    {li.qty !== 1 ? `${li.qty}${li.unit ? ` ${li.unit}` : ""}` : ""}
                  </Text>
                  <Text style={[styles.amtText, { width: 100, textAlign: "right" }]}>{fmtRp(li.amount)}</Text>
                </View>
              ))
            : (
              /* Single main item (termin / commission_billing / retention_release) */
              <View style={styles.tableRow}>
                <View style={styles.colDesc}>
                  <Text style={styles.itemLabel}>
                    {inv.description || (inv.termin_schedules ? inv.termin_schedules.label : typeLabel(inv.invoice_type))}
                  </Text>
                  {inv.termin_schedules && (
                    <Text style={styles.itemSub}>Termin ke-{inv.termin_schedules.termin_number}</Text>
                  )}
                </View>
                <Text style={[styles.amtMuted, { width: 56, textAlign: "right" }]}></Text>
                <Text style={[styles.amtText, { width: 100, textAlign: "right" }]}>{fmtRp(baseAmt)}</Text>
              </View>
            )
          }

          {/* Commission amount (commission_billing) */}
          {commAmt > 0 && (
            <View style={styles.tableRowAlt}>
              <View style={styles.colDesc}>
                <Text style={styles.itemLabel}>Fee Komisi</Text>
              </View>
              <Text style={[styles.amtMuted, { width: 56, textAlign: "right" }]}></Text>
              <Text style={[styles.amtText, { width: 100, textAlign: "right" }]}>+ {fmtRp(commAmt)}</Text>
            </View>
          )}

          {/* Subtotal line untuk expense_billing dengan banyak items */}
          {inv.invoice_type === "expense_billing" && inv.line_items && inv.line_items.length > 1 && (
            <View style={{ flexDirection: "row", padding: "5 10", borderTopWidth: 1, borderTopColor: BORDER }}>
              <Text style={{ flex: 1, fontSize: 8, color: MUTED }}>Subtotal</Text>
              <Text style={{ width: 56 }}></Text>
              <Text style={{ width: 100, textAlign: "right", fontSize: 8, fontFamily: "Helvetica-Bold", color: MUTED }}>
                {fmtRp(baseAmt)}
              </Text>
            </View>
          )}

          {/* Retensi */}
          {retensiAmt > 0 && (
            <View style={styles.tableRow}>
              <View style={styles.colDesc}>
                <Text style={styles.itemLabel}>Potongan Retensi{inv.retensi_pct ? ` (${inv.retensi_pct}%)` : ""}</Text>
                <Text style={styles.itemSub}>Ditahan hingga serah terima selesai</Text>
              </View>
              <Text style={[styles.amtMuted, { width: 56, textAlign: "right" }]}></Text>
              <Text style={[styles.amtNeg, { width: 100, textAlign: "right" }]}>-{fmtRp(retensiAmt)}</Text>
            </View>
          )}

          {/* Tax */}
          <View style={styles.tableRowAlt}>
            <View style={styles.colDesc}>
              <Text style={styles.itemLabel}>
                {inv.invoice_type === "commission_billing" ? "PPN 11%" : "PPh Final 2%"}
              </Text>
            </View>
            <Text style={[styles.amtMuted, { width: 56, textAlign: "right" }]}></Text>
            <Text style={[styles.amtMuted, { width: 100, textAlign: "right" }]}>-{fmtRp(taxAmt)}</Text>
          </View>

          {/* Separator */}
          <View style={{ height: 1, backgroundColor: BORDER, marginVertical: 1 }} />

          {/* Total */}
          <View style={styles.totalRow}>
            <Text style={styles.totalLabel}>TOTAL INVOICE</Text>
            <Text style={styles.totalAmount}>{fmtRp(Number(inv.total_amount))}</Text>
          </View>

          {/* Paid / due */}
          {Number(inv.amount_paid) > 0 && (
            <>
              <View style={{ flexDirection: "row", padding: "5 10", justifyContent: "space-between" }}>
                <Text style={{ fontSize: 8, color: MUTED }}>Sudah Dibayar</Text>
                <Text style={{ fontSize: 8, color: GREEN, fontFamily: "Helvetica-Bold" }}>-{fmtRp(Number(inv.amount_paid))}</Text>
              </View>
              <View style={{ flexDirection: "row", padding: "5 10", justifyContent: "space-between", backgroundColor: "var(--danger-bg)", borderRadius: 2 }}>
                <Text style={{ fontSize: 8, fontFamily: "Helvetica-Bold", color: RED }}>Sisa Tagihan</Text>
                <Text style={{ fontSize: 8, fontFamily: "Helvetica-Bold", color: RED }}>{fmtRp(Number(inv.amount_due))}</Text>
              </View>
            </>
          )}
        </View>

        {/* ── Footer: Payment info + QR + Signature ── */}
        <View style={styles.footerRow}>
          {/* Payment info */}
          <View style={styles.paymentBlock}>
            <Text style={styles.payLabel}>Pembayaran Ke</Text>
            {comp.bank_name && <Text style={styles.payDetail}><Text style={styles.payBold}>Bank:</Text> {comp.bank_name}</Text>}
            {comp.bank_account && <Text style={styles.payDetail}><Text style={styles.payBold}>No. Rek:</Text> {comp.bank_account}</Text>}
            {comp.bank_account_name && <Text style={styles.payDetail}><Text style={styles.payBold}>A/N:</Text> {comp.bank_account_name}</Text>}
            {comp.email && <Text style={[styles.payDetail, { marginTop: 6 }]}>{comp.email}</Text>}
          </View>

          {/* QR Code + Signature */}
          <View style={{ alignItems: "center", gap: 8 }}>
            {qrDataUrl && (
              <View style={{ alignItems: "center" }}>
                <Image src={qrDataUrl} style={styles.qrImage} />
                <Text style={{ fontSize: 6.5, color: MUTED }}>Scan untuk verifikasi</Text>
              </View>
            )}
            <View style={styles.signatureBlock}>
              <Text style={styles.signatureLabel}>Hormat Kami,</Text>
              <View style={styles.signatureLine} />
              <Text style={styles.signatureName}>{comp.signature_name || comp.company_name}</Text>
            </View>
          </View>
        </View>

        {/* ── Notes ── */}
        {comp.invoice_notes && (
          <View style={styles.notesRow}>
            <Text style={styles.notesText}>{comp.invoice_notes}</Text>
          </View>
        )}
        {inv.notes && (
          <View style={[styles.notesRow, { backgroundColor: "var(--info-bg)", borderColor: "var(--info-border)", marginTop: 4 }]}>
            <Text style={[styles.notesText, { color: "#1E40AF" }]}>{inv.notes}</Text>
          </View>
        )}

        {/* ── Verification footer ── */}
        <Text style={styles.verifyText}>
          Dokumen ini diterbitkan oleh {comp.company_name}. Verifikasi keabsahan dokumen: puraloka.app/verify/invoice/{inv.id}
        </Text>

      </Page>
    </Document>
  );
}
