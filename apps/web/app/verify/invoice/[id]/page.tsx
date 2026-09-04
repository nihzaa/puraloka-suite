"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { CheckCircle2, XCircle, Clock, AlertTriangle } from "lucide-react";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

interface InvoicePublic {
  id: string;
  invoice_number: string;
  invoice_type: string;
  total_amount: number;
  amount_due: number;
  issued_date: string;
  due_date: string;
  paid_date: string | null;
  status: string;
  project_name: string | null;
}

interface Company {
  company_name: string;
  logo_url?: string | null;
}

function fmtRp(n: number): string {
  return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(n);
}

function fmtDate(d: string): string {
  return new Date(d).toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" });
}

const STATUS_MAP: Record<string, { label: string; color: string; bg: string; icon: React.ReactNode }> = {
  paid:      { label: "LUNAS",            color: "var(--success)", bg: "var(--success-bg)", icon: <CheckCircle2 size={48} color="var(--success)" /> },
  sent:      { label: "BELUM LUNAS",      color: "var(--danger)", bg: "var(--danger-bg)", icon: <AlertTriangle size={48} color="var(--danger)" /> },
  partial:   { label: "DIBAYAR SEBAGIAN", color: "var(--warning)", bg: "var(--warning-bg)", icon: <Clock size={48} color="var(--warning)" /> },
  overdue:   { label: "JATUH TEMPO",      color: "var(--danger)", bg: "var(--danger-bg)", icon: <AlertTriangle size={48} color="var(--danger)" /> },
  draft:     { label: "DRAFT",            color: "var(--text-secondary)", bg: "var(--surface-subtle)", icon: <Clock size={48} color="var(--text-secondary)" /> },
  cancelled: { label: "DIBATALKAN",       color: "var(--text-secondary)", bg: "var(--surface-subtle)", icon: <XCircle size={48} color="var(--text-secondary)" /> },
};

const TYPE_MAP: Record<string, string> = {
  termin_billing: "Termin", commission_billing: "Komisi", retention_release: "Retensi",
};

export default function VerifyInvoicePage() {
  const params = useParams();
  const id = params.id as string;

  const [state, setState] = useState<"loading" | "found" | "not_found">("loading");
  const [invoice, setInvoice] = useState<InvoicePublic | null>(null);
  const [company, setCompany] = useState<Company>({ company_name: "Puraloka Persada" });

  useEffect(() => {
    if (!id) return;
    fetch(`${API_URL}/api/v1/public/invoice/${id}`)
      .then(r => r.json())
      .then(data => {
        if (data.found) {
          setInvoice(data.invoice);
          setCompany(data.company ?? { company_name: "Puraloka Persada" });
          const today = new Date().toISOString().split("T")[0];
          if (data.invoice.status !== "paid" && data.invoice.due_date < today) {
            setInvoice(prev => prev ? { ...prev, status: "overdue" } : prev);
          }
          setState("found");
        } else {
          setState("not_found");
        }
      })
      .catch(() => setState("not_found"));
  }, [id]);

  const statusMeta = invoice ? (STATUS_MAP[invoice.status] ?? STATUS_MAP.sent) : null;

  return (
    <div style={{ minHeight: "100vh", background: "var(--bg)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 24, fontFamily: "system-ui, sans-serif" }}>

      {/* Header */}
      <div style={{ marginBottom: 32, textAlign: "center" }}>
        {company.logo_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={company.logo_url} alt={company.company_name} style={{ height: 48, objectFit: "contain", marginBottom: 8 }} />
        ) : (
          <div style={{ fontWeight: 800, fontSize: 22, color: "var(--navy)", marginBottom: 4 }}>{company.company_name}</div>
        )}
        <div style={{ fontSize: 12, color: "var(--text-muted)", letterSpacing: "0.1em", textTransform: "uppercase" }}>
          Verifikasi Invoice
        </div>
      </div>

      {/* Card */}
      <div style={{ background: "var(--surface)", borderRadius: 14, boxShadow: "var(--naik-2)", maxWidth: 480, width: "100%", overflow: "hidden" }}>
        {state === "loading" && (
          <div style={{ padding: 64, textAlign: "center", color: "var(--text-muted)" }}>
            <div style={{ fontSize: 13 }}>Memverifikasi invoice...</div>
          </div>
        )}

        {state === "not_found" && (
          <div style={{ padding: 48, textAlign: "center" }}>
            <XCircle size={56} color="var(--danger-border)" style={{ marginBottom: 16 }} />
            <div style={{ fontSize: 17, fontWeight: 700, color: "var(--text-primary)", marginBottom: 8 }}>Invoice Tidak Ditemukan</div>
            <div style={{ fontSize: 13, color: "var(--text-secondary)", lineHeight: 1.5 }}>
              ID invoice tidak valid atau invoice telah dihapus. Pastikan Anda memindai QR code yang benar.
            </div>
            <div style={{ marginTop: 16, padding: "8px 12px", borderRadius: 6, background: "var(--danger-bg)", border: "1px solid var(--danger-border)", display: "inline-block" }}>
              <span style={{ fontSize: "var(--t-kecil)", fontFamily: "monospace", color: "var(--danger)" }}>{id}</span>
            </div>
          </div>
        )}

        {state === "found" && invoice && statusMeta && (
          <>
            {/* Status banner */}
            <div style={{ padding: "32px 32px 24px", background: statusMeta.bg, textAlign: "center", borderBottom: "1px solid var(--border)" }}>
              <div style={{ marginBottom: 12 }}>{statusMeta.icon}</div>
              <div style={{ fontSize: 24, fontWeight: 800, color: statusMeta.color, letterSpacing: "0.05em", marginBottom: 4 }}>
                {statusMeta.label}
              </div>
              <div style={{ fontSize: 13, color: "var(--text-secondary)" }}>Status Invoice</div>
            </div>

            {/* Details */}
            <div style={{ padding: "24px 32px" }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 16 }}>
                Detail Invoice
              </div>

              {[
                { label: "Nomor Invoice", value: invoice.invoice_number },
                { label: "Tipe", value: TYPE_MAP[invoice.invoice_type] ?? invoice.invoice_type },
                { label: "Proyek", value: invoice.project_name ?? "—" },
                { label: "Total Invoice", value: fmtRp(Number(invoice.total_amount)) },
                { label: "Sisa Tagihan", value: fmtRp(Number(invoice.amount_due)) },
                { label: "Tanggal Terbit", value: fmtDate(invoice.issued_date) },
                { label: "Jatuh Tempo", value: fmtDate(invoice.due_date) },
                ...(invoice.paid_date ? [{ label: "Dibayar Pada", value: fmtDate(invoice.paid_date) }] : []),
              ].map((row, i) => (
                <div key={i} style={{
                  display: "flex", justifyContent: "space-between", alignItems: "flex-start",
                  padding: "10px 0", borderBottom: "1px solid var(--surface-hover)",
                }}>
                  <span style={{ fontSize: 12, color: "var(--text-secondary)" }}>{row.label}</span>
                  <span style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)", textAlign: "right", maxWidth: "60%" }}>{row.value}</span>
                </div>
              ))}
            </div>

            {/* Footer */}
            <div style={{ padding: "16px 32px", background: "var(--bg)", borderTop: "1px solid var(--border)", textAlign: "center" }}>
              <div style={{ fontSize: "var(--t-kecil)", color: "var(--text-muted)", lineHeight: 1.5 }}>
                Dokumen ini diterbitkan oleh <strong style={{ color: "var(--text-primary)" }}>{company.company_name}</strong>
                <br />
                dan telah diverifikasi secara digital
              </div>
              <div style={{ marginTop: 8, fontSize: "var(--t-mikro)", fontFamily: "monospace", color: "var(--border-strong)" }}>
                ID: {invoice.id}
              </div>
            </div>
          </>
        )}
      </div>

      <div style={{ marginTop: 24, fontSize: "var(--t-kecil)", color: "var(--border-strong)", textAlign: "center" }}>
        © {new Date().getFullYear()} {company.company_name} · Powered by Puraloka Suite
      </div>
    </div>
  );
}
