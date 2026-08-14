"use client";

/**
 * KOMPONEN BERSAMA — modul Keuangan.
 *
 * Dipakai lebih dari satu rute setelah modul dipecah:
 *   Skeleton            — semua halaman
 *   InvoiceRow          — /invoice dan /pembayaran
 *   CreateInvoiceModal  — dibuka dari /invoice DAN dari ringkasan
 *   AddKasbonModal      — dibuka dari /kasbon DAN dari ringkasan
 *
 * Menyalinnya ke tiap halaman berarti perbaikan di satu tempat tak sampai
 * ke tempat lain — dan pada modal invoice, itu berarti dua form yang
 * mengirim payload berbeda ke endpoint yang sama.
 */

import { useEffect, useRef, useState } from "react";
import { useTerpasang } from "@/lib/use-terpasang";
import { createPortal } from "react-dom";
import {
  AlertTriangle, Banknote, 
  ArrowDownLeft, CheckCircle2, FileText, Receipt,
  Wallet, X,
} from "lucide-react";
import { api } from "@/lib/api";
import { useTutupEsc } from "@/lib/use-tutup-esc";
import { C } from "@/lib/warna-ui";
import {
  type Invoice, type CashAccount, type Project, type ProjectDetail,
  type MandorScope, 
  type BillableExpense, type LineItemDraft, type InvoiceMode, type PenaltyInfo,
  INVOICE_STATUS, INVOICE_TYPE_LABEL, ACCOUNT_TYPE_LABEL,
  fmt, fmtCompact, fmtDate, daysUntil,
} from "./tipe";
import { formatRupiah } from "@/lib/format";
import { Saklar } from "@/components/saklar";
export function Skeleton({ h = 20, w = "100%" }: { h?: number; w?: string | number }) {
  return <div style={{ height: h, width: w, borderRadius: 6, background: "linear-gradient(90deg, var(--surface-hover) 0%, var(--border) 50%, var(--surface-hover) 100%)", backgroundSize: "200% 100%", animation: "shimmer 1.5s ease-in-out infinite" }} />;
}

export function InvoiceRow({ inv, onPayClick, onPdfClick, loadingPdf, canEdit }: { inv: Invoice; onPayClick: (inv: Invoice) => void; onPdfClick: (inv: Invoice) => void; loadingPdf: boolean; canEdit: boolean }) {
  const days = daysUntil(inv.due_date);
  const overdue = inv.status !== "paid" && inv.status !== "cancelled" && days < 0;
  const dueSoon = !overdue && inv.status !== "paid" && inv.status !== "cancelled" && days >= 0 && days <= 7;
  const [dendaOpen, setDendaOpen] = useState(false);

  return (
    <>
    <tr
      style={{ borderBottom: "1px solid var(--surface-hover)", background: overdue ? "var(--surface-subtle)" : "transparent" }}
      onMouseEnter={e => { if (!overdue) e.currentTarget.style.background = "var(--surface-subtle)"; }}
      onMouseLeave={e => { e.currentTarget.style.background = overdue ? "var(--surface-subtle)" : "transparent"; }}
    >
      <td style={{ padding: "var(--pad-baris)" }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: C.navy, fontFamily: "var(--font-display)", marginBottom: 2 }}>
          {inv.invoice_number}
        </div>
        <div style={{ fontSize: 10, color: C.muted }}>
          {INVOICE_TYPE_LABEL[inv.invoice_type] ?? inv.invoice_type}
          {inv.termin_schedules && ` · Termin ${inv.termin_schedules.termin_number}`}
        </div>
      </td>
      <td style={{ padding: "var(--pad-baris)" }}>
        <div style={{ fontSize: 13, fontWeight: 500, color: C.text, marginBottom: 2 }}>{inv.projects?.name ?? "—"}</div>
        {inv.projects?.location && <div style={{ fontSize: 11, color: C.muted }}>{inv.projects.location}</div>}
      </td>
      <td style={{ padding: "var(--pad-baris)", textAlign: "right", fontFamily: "monospace", fontSize: 13, fontWeight: 600, color: C.text }}>
        {fmt(Number(inv.total_amount))}
      </td>
      <td style={{ padding: "var(--pad-baris)", textAlign: "right", fontFamily: "monospace", fontSize: 13, color: C.green }}>
        {fmt(Number(inv.amount_paid))}
      </td>
      <td style={{ padding: "var(--pad-baris)", textAlign: "right", fontFamily: "monospace", fontSize: 13, fontWeight: 600, color: Number(inv.amount_due) > 0 ? C.yellow : C.green }}>
        {fmt(Number(inv.amount_due))}
      </td>
      <td style={{ padding: "var(--pad-baris)", textAlign: "right" }}>
        <div style={{ fontSize: 12, color: overdue ? C.red : dueSoon ? C.yellow : C.mid, fontWeight: overdue || dueSoon ? 600 : 400 }}>
          {fmtDate(inv.due_date)}
        </div>
        {overdue && <div style={{ fontSize: 10, color: C.red }}>{Math.abs(days)}h lewat</div>}
        {dueSoon && <div style={{ fontSize: 10, color: C.yellow }}>{days}h lagi</div>}
      </td>
      <td style={{ padding: "var(--pad-baris)", textAlign: "center" }}>
        <StatusBadge status={overdue ? "overdue" : inv.status} map={INVOICE_STATUS} />
      </td>
      <td style={{ padding: "var(--pad-baris)", textAlign: "center" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 4, alignItems: "center" }}>
          {canEdit && inv.status !== "paid" && inv.status !== "cancelled" && (
            <button
              onClick={() => onPayClick(inv)}
              style={{
                display: "inline-flex", alignItems: "center", gap: 4,
                padding: "4px 12px", borderRadius: 6, border: "none",
                background: C.navyLight, color: C.navy,
                fontSize: 11, fontWeight: 600, cursor: "pointer",
                transition: "all 0.15s", whiteSpace: "nowrap",
              }}
              onMouseEnter={e => { e.currentTarget.style.background = C.navy; e.currentTarget.style.color = "var(--surface)"; }}
              onMouseLeave={e => { e.currentTarget.style.background = C.navyLight; e.currentTarget.style.color = C.navy; }}
            >
              <Banknote size={12} /> Bayar
            </button>
          )}
          {inv.status === "paid" && (
            <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 11, color: C.green }}>
              <CheckCircle2 size={13} /> Lunas
            </span>
          )}
          {/* PDF Download button */}
          <button aria-label="Download PDF"
            onClick={() => onPdfClick(inv)}
            disabled={loadingPdf}
            title="Download PDF"
            style={{
              display: "inline-flex", alignItems: "center", gap: 4,
              padding: "4px 8px", borderRadius: 6,
              border: `1px solid ${C.border}`, background: loadingPdf ? "var(--surface-hover)" : "var(--surface)",
              color: loadingPdf ? C.muted : C.mid, fontSize: 11, cursor: loadingPdf ? "not-allowed" : "pointer",
              transition: "all 0.15s", whiteSpace: "nowrap",
            }}
            onMouseEnter={e => { if (!loadingPdf) { e.currentTarget.style.background = "var(--surface-hover)"; e.currentTarget.style.color = C.text; } }}
            onMouseLeave={e => { if (!loadingPdf) { e.currentTarget.style.background = "var(--surface)"; e.currentTarget.style.color = C.mid; } }}
          >
            <FileText size={11} /> {loadingPdf ? "..." : "PDF"}
          </button>
          {/* Denda: estimasi/otoritatif + pemutihan. Muncul utk invoice belum lunas telat / lunas. */}
          {inv.status !== "cancelled" && (
            <button aria-label="Denda keterlambatan" onClick={() => setDendaOpen(true)} title="Denda keterlambatan"
              style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "4px 8px", borderRadius: 6, border: `1px solid ${C.border}`, background: "var(--surface)", color: overdue ? C.red : C.mid, fontSize: 11, cursor: "pointer", whiteSpace: "nowrap" }}>
              <AlertTriangle size={11} /> Denda
            </button>
          )}
        </div>
      </td>
    </tr>
    {dendaOpen && createPortal(<PenaltyModal invoiceId={inv.id} invoiceNumber={inv.invoice_number} onClose={() => setDendaOpen(false)} />, document.body)}
    </>
  );
}

export function CreateInvoiceModal({ onClose, onSuccess }: { onClose: () => void; onSuccess: () => void }) {
  useTutupEsc(onClose);
  const mounted = useTerpasang();

  const [projects, setProjects] = useState<Project[]>([]);
  const [projectId, setProjectId] = useState("");
  const [projectDetail, setProjectDetail] = useState<ProjectDetail | null>(null);
  const [loadingProject, setLoadingProject] = useState(false);

  // Mode pilihan per proyek (dipilih user jika komisi)
  const [invoiceMode, setInvoiceMode] = useState<InvoiceMode>("termin_billing");

  // Termin
  const [terminId, setTerminId] = useState("");

  // Expense billing — list pengeluaran yang bisa ditagih
  const [billableExpenses, setBillableExpenses] = useState<BillableExpense[]>([]);
  const [loadingExpenses, setLoadingExpenses] = useState(false);
  const [lineItems, setLineItems] = useState<LineItemDraft[]>([]);

  // Commission fee (mode: fee komisi saja)
  const [commissionFeeSuggest, setCommissionFeeSuggest] = useState<{
    commission_pct: number; total_expense: number; suggested_fee: number;
    already_billed_fee: number; remaining_fee: number;
  } | null>(null);
  const [commissionFeeAmount, setCommissionFeeAmount] = useState("");

  // Legacy komisi (commission_billing)
  const [totalPengeluaran, setTotalPengeluaran] = useState("");
  const [commissionPct, setCommissionPct] = useState("");

  // Shared
  const [baseAmount, setBaseAmount] = useState("");
  const [description, setDescription] = useState("");
  const [useRetensi, setUseRetensi] = useState(false);
  const [retensiPct, setRetensiPct] = useState("");
  // Potongan uang muka (DP recoupment) — saldo dari GET /finance/dp-register
  const [useDpDeduction, setUseDpDeduction] = useState(false);
  const [dpDeductionAmount, setDpDeductionAmount] = useState("");
  const [dpAvailable, setDpAvailable] = useState<number | null>(null);
  const [issuedDate, setIssuedDate] = useState(new Date().toISOString().split("T")[0]);
  const [dueDate, setDueDate] = useState(() => {
    const d = new Date(); d.setDate(d.getDate() + 30);
    return d.toISOString().split("T")[0];
  });
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    api.get<{ projects: Project[] }>("/api/v1/projects").then(r => setProjects(r.data.projects)).catch(() => {});
  }, []);

  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = ""; };
  }, []);

  // Reset saat ganti proyek
  useEffect(() => {
    if (!projectId) {
      setProjectDetail(null); setTerminId(""); setBaseAmount(""); setDescription("");
      setCommissionPct(""); setRetensiPct(""); setUseRetensi(false);
      setUseDpDeduction(false); setDpDeductionAmount(""); setDpAvailable(null);
      setLineItems([]); setBillableExpenses([]); setCommissionFeeSuggest(null); setCommissionFeeAmount("");
      return;
    }
    setLoadingProject(true);
    api.get<{ project: ProjectDetail }>(`/api/v1/projects/${projectId}`)
      .then(r => {
        const pd = r.data.project;
        setProjectDetail(pd);
        setTerminId(""); setBaseAmount(""); setDescription(""); setLineItems([]);
        setCommissionFeeSuggest(null); setCommissionFeeAmount("");
        if (pd.commission_pct) setCommissionPct(String(pd.commission_pct));
        if (pd.retention_pct) setRetensiPct(String(pd.retention_pct));
        // Default mode
        setInvoiceMode(pd.contract_model === "termin" ? "termin_billing" : "expense_billing");
      })
      .catch(() => {})
      .finally(() => setLoadingProject(false));
  }, [projectId]);

  // Saldo DP yang masih bisa dipotong (recoupment) untuk proyek terpilih
  useEffect(() => {
    if (!projectId) return;
    setUseDpDeduction(false); setDpDeductionAmount("");
    api.get<{ rows: { project: { id: string }; remaining_to_recoup: number }[] }>("/api/v1/finance/dp-register")
      .then(r => {
        const row = r.data.rows.find(x => x.project.id === projectId);
        setDpAvailable(row ? row.remaining_to_recoup : 0);
      })
      .catch(() => setDpAvailable(null));
  }, [projectId]);

  // Load billable expenses saat mode expense_billing dipilih
  useEffect(() => {
    if (invoiceMode !== "expense_billing" || !projectId) return;
    setLoadingExpenses(true);
    api.get<{ expenses: BillableExpense[] }>(`/api/v1/finance/billable-expenses?project_id=${projectId}`)
      .then(r => setBillableExpenses(r.data.expenses))
      .catch(() => setBillableExpenses([]))
      .finally(() => setLoadingExpenses(false));
  }, [invoiceMode, projectId]);

  // Load commission fee suggest saat mode commission_fee dipilih
  useEffect(() => {
    if (invoiceMode !== "commission_fee" || !projectId) return;
    api.get<typeof commissionFeeSuggest>(`/api/v1/finance/commission-fee-suggest?project_id=${projectId}`)
      .then(r => {
        setCommissionFeeSuggest(r.data);
        if (r.data && r.data.remaining_fee > 0) setCommissionFeeAmount(String(Math.round(r.data.remaining_fee)));
      })
      .catch(() => {});
  }, [invoiceMode, projectId]);

  // Termin auto-fill
  useEffect(() => {
    if (!terminId || !projectDetail) return;
    const t = projectDetail.termin_schedules.find(ts => ts.id === terminId);
    if (t) { setBaseAmount(String(t.amount)); setDescription(`Tagihan ${t.label}`); }
  }, [terminId, projectDetail]);

  // Legacy komisi auto-calc base
  useEffect(() => {
    if (invoiceMode !== "commission_billing") return;
    const pen = parseFloat(totalPengeluaran) || 0;
    const pct = parseFloat(commissionPct) || 0;
    if (pen > 0) setBaseAmount(String(Math.round(pen + pen * pct / 100)));
  }, [totalPengeluaran, commissionPct, invoiceMode]);

  // ── Helpers expense billing ──────────────────────────────────────────────────

  function addExpenseAsLineItem(exp: BillableExpense) {
    if (lineItems.find(li => li.expense_id === exp.id)) return; // sudah ada
    setLineItems(prev => [...prev, {
      key: crypto.randomUUID(),
      expense_id: exp.id,
      description: exp.description,
      qty: Number(exp.qty),
      unit: exp.unit ?? "",
      unit_price: Number(exp.unit_price),
      amount: exp.remaining,
      notes: "",
      isManual: false,
    }]);
  }

  function addManualLineItem() {
    setLineItems(prev => [...prev, {
      key: crypto.randomUUID(),
      expense_id: null,
      description: "",
      qty: 1,
      unit: "",
      unit_price: 0,
      amount: 0,
      notes: "",
      isManual: true,
    }]);
  }

  function removeLineItem(key: string) {
    setLineItems(prev => prev.filter(li => li.key !== key));
  }

  function updateLineItem(key: string, patch: Partial<LineItemDraft>) {
    setLineItems(prev => prev.map(li => {
      if (li.key !== key) return li;
      const updated = { ...li, ...patch };
      // Auto-calc amount dari qty × unit_price jika manual
      if (li.isManual && (patch.qty !== undefined || patch.unit_price !== undefined)) {
        updated.amount = Math.round(updated.qty * updated.unit_price);
      }
      return updated;
    }));
  }

  // ── Kalkulasi ──────────────────────────────────────────────────────────────

  const taxScheme = projectDetail?.tax_scheme ?? "pph_final";
  const taxRate   = taxScheme === "ppn" ? 11 : 2;
  const taxLabel  = taxScheme === "ppn" ? "PPN 11%" : "PPh Final 2%";

  const lineItemsTotal = lineItems.reduce((s, li) => s + Number(li.amount), 0);

  let base = 0;
  if (invoiceMode === "expense_billing") base = lineItemsTotal;
  else if (invoiceMode === "commission_fee") base = parseFloat(commissionFeeAmount) || 0;
  else base = parseFloat(baseAmount) || 0;

  const retensiAmt    = useRetensi ? Math.round(base * (parseFloat(retensiPct) || 0) / 100) : 0;
  const netAfterRet   = base - retensiAmt;
  const taxAmount     = Math.round(netAfterRet * taxRate / 100);
  const pengeluaran   = parseFloat(totalPengeluaran) || 0;
  const komisiPct     = parseFloat(commissionPct) || 0;
  const komisiAmt     = invoiceMode === "commission_billing" ? Math.round(pengeluaran * komisiPct / 100) : 0;

  // Potongan DP: hanya invoice termin progres (bukan termin on_sign = invoice DP-nya sendiri)
  const selectedTermin = projectDetail?.termin_schedules.find(ts => ts.id === terminId);
  const dpEligible    = invoiceMode === "termin_billing" && !!terminId
    && selectedTermin?.trigger_type !== "on_sign" && (dpAvailable ?? 0) > 0;
  const dpAmt         = dpEligible && useDpDeduction ? (parseFloat(dpDeductionAmount) || 0) : 0;
  const totalInvoice  = base - retensiAmt - dpAmt + taxAmount;

  const isTermin     = invoiceMode === "termin_billing";
  const isExpBilling = invoiceMode === "expense_billing";
  const isCommFee    = invoiceMode === "commission_fee";
  const isCommBill   = invoiceMode === "commission_billing";

  // ── Submit ─────────────────────────────────────────────────────────────────

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    if (!projectId) { setError("Pilih proyek terlebih dahulu"); return; }
    if (isTermin && !terminId) { setError("Pilih termin yang akan ditagih"); return; }
    if (isExpBilling && lineItems.length === 0) { setError("Tambahkan minimal 1 item tagihan"); return; }
    if (isExpBilling) {
      for (const li of lineItems) {
        if (!li.description.trim()) { setError("Semua item harus punya deskripsi"); return; }
        if (li.amount <= 0) { setError(`Nominal item "${li.description}" harus lebih dari 0`); return; }
        if (!li.isManual && li.expense_id) {
          const exp = billableExpenses.find(e => e.id === li.expense_id);
          if (exp && li.amount > exp.remaining + 0.01) {
            setError(`"${li.description}": melebihi sisa tagihan (maks ${fmt(exp.remaining)})`); return;
          }
        }
      }
    }
    if ((isCommFee || isCommBill) && base <= 0) { setError("Nominal harus lebih dari 0"); return; }
    if (!isExpBilling && !isCommFee && !isTermin && (!baseAmount || base <= 0)) { setError("Nominal dasar harus lebih dari 0"); return; }
    if (!dueDate) { setError("Jatuh tempo wajib diisi"); return; }
    if (useRetensi && (!retensiPct || parseFloat(retensiPct) <= 0)) { setError("Persentase retensi harus lebih dari 0"); return; }
    if (dpEligible && useDpDeduction) {
      if (dpAmt <= 0) { setError("Nominal potongan uang muka harus lebih dari 0"); return; }
      if (dpAvailable != null && dpAmt > dpAvailable) { setError(`Potongan uang muka melebihi saldo DP (maks ${fmt(dpAvailable)})`); return; }
      if (dpAmt > netAfterRet) { setError("Potongan uang muka melebihi nilai tagihan setelah retensi"); return; }
    }

    setLoading(true);
    try {
      const payload: Record<string, unknown> = {
        project_id: projectId,
        invoice_type: invoiceMode,
        due_date: dueDate,
        issued_date: issuedDate,
        notes: notes || undefined,
        description: description || undefined,
        tax_amount: taxAmount,
      };
      if (useRetensi) { payload.retensi_pct = parseFloat(retensiPct); payload.retensi_amount = retensiAmt; }
      if (dpAmt > 0) {
        payload.dp_deduction_amount = dpAmt;
        if (base > 0) payload.dp_deduction_pct = Math.round((dpAmt / base) * 10000) / 100;
      }

      if (isTermin) {
        payload.termin_schedule_id = terminId;
        payload.base_amount = base;
      } else if (isExpBilling) {
        payload.line_items = lineItems.map((li, idx) => ({
          expense_id: li.expense_id ?? null,
          description: li.description,
          qty: li.qty,
          unit: li.unit || undefined,
          unit_price: li.unit_price,
          amount: li.amount,
          sort_order: idx,
          notes: li.notes || undefined,
        }));
      } else if (isCommFee) {
        payload.commission_fee_amount = base;
        payload.description = description || "Fee Komisi Proyek";
      } else {
        // commission_billing (legacy)
        payload.base_amount = base;
        payload.commission_pct = komisiPct;
        payload.commission_amount = komisiAmt;
        payload.total_pengeluaran = pengeluaran;
      }

      await api.post("/api/v1/finance/invoices", payload);
      onSuccess();
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
      setError(msg ?? "Gagal membuat invoice");
    } finally {
      setLoading(false);
    }
  }

  const labelStyle: React.CSSProperties = { display: "block", fontSize: 12, fontWeight: 600, color: C.mid, marginBottom: 6 };
  const inputStyle: React.CSSProperties = { width: "100%", padding: "8px 12px", border: `1px solid ${C.border}`, borderRadius: 6, fontSize: 13, color: C.text, background: "var(--surface)", outline: "none", boxSizing: "border-box" };
  const inputRpStyle: React.CSSProperties = { ...inputStyle, paddingLeft: 32 };

  const MODE_OPTIONS: { value: InvoiceMode; label: string; desc: string; color: string; bg: string }[] = projectDetail?.contract_model === "termin"
    ? [{ value: "termin_billing", label: "Tagihan Termin", desc: "Tagih sesuai jadwal termin", color: C.navy, bg: C.navyLight }]
    : [
        { value: "expense_billing", label: "Tagihan Pengeluaran", desc: "Pilih item pengeluaran spesifik", color: "var(--on-success-bg)", bg: "var(--success-bg)" },
        { value: "commission_fee",  label: "Fee Komisi",         desc: "Invoice fee komisi saja", color: "var(--aksen-pekat)", bg: "var(--navy-light)" },
        { value: "commission_billing", label: "Komisi Langsung", desc: "Tagih total pengeluaran + komisi sekaligus", color: "var(--on-warning-bg)", bg: "var(--warning-bg)" },
      ];

  if (!mounted) return null;
  return createPortal(
    <div style={{ position: "fixed", inset: 0, zIndex: 9999, background: "rgba(0,0,0,0.45)", backdropFilter: "blur(3px)", display: "flex", alignItems: "center", justifyContent: "center", padding: "var(--pad-kartu-lega)" }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={{ background: "var(--surface)", borderRadius: 14, width: "100%", maxWidth: 600, boxShadow: "var(--naik-3)", display: "flex", flexDirection: "column", maxHeight: "94vh" }}>

        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 24px", borderBottom: `1px solid ${C.border}`, flexShrink: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div style={{ width: 36, height: 36, borderRadius: 10, background: "linear-gradient(135deg, var(--navy), var(--aksen-terang))", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <Receipt size={17} color="var(--surface)" />
            </div>
            <h3 style={{ fontSize: 15, fontWeight: 700, color: C.text, margin: 0 }}>Buat Invoice Baru</h3>
          </div>
          <button aria-label="Tutup" onClick={onClose} style={{ background: "transparent", border: "none", cursor: "pointer", color: C.muted, padding: 4 }}><X size={18} /></button>
        </div>

        {/* Body */}
        <form onSubmit={handleSubmit} style={{ padding: "20px 24px", display: "flex", flexDirection: "column", gap: 12, overflowY: "auto", flex: 1 }}>

          {/* ── Proyek ── */}
          <div>
            <label htmlFor="project-id" style={labelStyle}>Proyek <span style={{ color: C.red }}>*</span></label>
            <select id="project-id" aria-label="Proyek" value={projectId} onChange={e => setProjectId(e.target.value)} required style={inputStyle}>
              <option value="">-- Pilih proyek --</option>
              {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>

          {loadingProject && <div style={{ fontSize: 12, color: C.muted }}>Memuat data proyek...</div>}

          {projectDetail && (<>

            {/* ── Mode/Tipe Invoice ── */}
            <div>
              <span id="tipe-invoice" style={labelStyle}>Tipe Invoice <span style={{ color: C.red }}>*</span></span>
              <div role="group" aria-labelledby="tipe-invoice" style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                {MODE_OPTIONS.map(m => (
                  <button key={m.value} type="button" onClick={() => setInvoiceMode(m.value)}
                    style={{ padding: "6px 12px", borderRadius: 6, border: `2px solid ${invoiceMode === m.value ? m.color : C.border}`,
                      background: invoiceMode === m.value ? m.bg : "var(--surface)", cursor: "pointer", textAlign: "left" }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: invoiceMode === m.value ? m.color : C.text }}>{m.label}</div>
                    <div style={{ fontSize: 10, color: C.muted, marginTop: 1 }}>{m.desc}</div>
                  </button>
                ))}
              </div>
              <div style={{ marginTop: 6, fontSize: 11, color: C.muted }}>Pajak: {taxLabel}</div>
            </div>

            {/* ── TERMIN: pilih termin ── */}
            {isTermin && (
              <div>
                <label htmlFor="termin-id" style={labelStyle}>Pilih Termin yang Ditagih <span style={{ color: C.red }}>*</span></label>
                <select id="termin-id" aria-label="Pilih termin yang ditagih" value={terminId} onChange={e => setTerminId(e.target.value)} required style={inputStyle}>
                  <option value="">-- Pilih termin --</option>
                  {projectDetail.termin_schedules.map(t => (
                    <option key={t.id} value={t.id} disabled={t.status === "billed" || t.status === "paid"}>
                      {t.label} — {fmt(t.amount)} {t.status === "billed" ? "✓ Sudah ditagih" : t.status === "paid" ? "✓ Lunas" : ""}
                    </option>
                  ))}
                </select>
                {projectDetail.termin_schedules.length === 0 && (
                  <div style={{ fontSize: 11, color: C.red, marginTop: 4 }}>Proyek ini belum memiliki jadwal termin</div>
                )}
              </div>
            )}

            {/* ── EXPENSE BILLING: pilih + tambah item ── */}
            {isExpBilling && (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>

                {/* Pilih dari pengeluaran */}
                <div style={{ padding: "var(--pad-baris)", borderRadius: 6, background: "var(--success-bg)", border: "1px solid var(--success-border)" }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: "var(--on-success-bg)", marginBottom: 8 }}>
                    Pengeluaran Tersedia ({billableExpenses.length})
                  </div>
                  {loadingExpenses && <div style={{ fontSize: 12, color: C.muted }}>Memuat...</div>}
                  {!loadingExpenses && billableExpenses.length === 0 && (
                    <div style={{ fontSize: 12, color: C.muted }}>Tidak ada pengeluaran approved yang belum sepenuhnya ditagih</div>
                  )}
                  {!loadingExpenses && billableExpenses.length > 0 && (
                    <div style={{ display: "flex", flexDirection: "column", gap: 6, maxHeight: 180, overflowY: "auto" }}>
                      {billableExpenses.map(exp => {
                        const alreadyAdded = lineItems.some(li => li.expense_id === exp.id);
                        return (
                          <div key={exp.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 8px", borderRadius: 6, background: "var(--surface)", border: `1px solid ${alreadyAdded ? "var(--success-border)" : C.border}` }}>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ fontSize: 12, fontWeight: 600, color: C.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                {exp.description}
                              </div>
                              <div style={{ fontSize: 10, color: C.muted }}>
                                {exp.expense_date} · {exp.category?.name ?? "—"} {exp.vendor_name ? `· ${exp.vendor_name}` : ""}
                              </div>
                            </div>
                            <div style={{ textAlign: "right", flexShrink: 0 }}>
                              <div style={{ fontSize: 12, fontWeight: 700, color: C.green }}>{fmt(exp.remaining)}</div>
                              {exp.billed_amount > 0 && <div style={{ fontSize: 10, color: C.muted }}>sisa dari {fmt(exp.total_amount)}</div>}
                            </div>
                            <button type="button" disabled={alreadyAdded} onClick={() => addExpenseAsLineItem(exp)}
                              style={{ padding: "4px 8px", borderRadius: 6, border: "none", background: alreadyAdded ? C.border : C.navy, color: "var(--surface)", fontSize: 11, cursor: alreadyAdded ? "default" : "pointer", flexShrink: 0 }}>
                              {alreadyAdded ? "✓" : "+ Tambah"}
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* Line items yang sudah dipilih */}
                {lineItems.length > 0 && (
                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: C.text }}>Item yang Ditagihkan ({lineItems.length})</div>
                    {lineItems.map(li => (
                      <div key={li.key} style={{ padding: "8px 12px", borderRadius: 6, border: `1px solid ${C.border}`, background: li.isManual ? "var(--warning-bg)" : "var(--bg)" }}>
                        <div style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
                          <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 6 }}>
                            {li.isManual ? (
                              <input value={li.description} onChange={e => updateLineItem(li.key, { description: e.target.value })}
                                placeholder="Deskripsi item (wajib)" style={{ ...inputStyle, padding: "6px 8px", fontSize: 12 }} />
                            ) : (
                              <div style={{ fontSize: 12, fontWeight: 600, color: C.text }}>{li.description}</div>
                            )}
                            <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                              {li.isManual && (<>
                                <input type="number" min={0.001} step={0.001} value={li.qty || ""} onChange={e => updateLineItem(li.key, { qty: parseFloat(e.target.value) || 1 })}
                                  placeholder="Qty" style={{ ...inputStyle, padding: "4px 8px", fontSize: 11, width: 64, flexShrink: 0 }} />
                                <input value={li.unit} onChange={e => updateLineItem(li.key, { unit: e.target.value })}
                                  placeholder="Satuan" style={{ ...inputStyle, padding: "4px 8px", fontSize: 11, width: 72, flexShrink: 0 }} />
                                <div style={{ position: "relative", flexShrink: 0, width: 120 }}>
                                  <span style={{ position: "absolute", left: 7, top: "50%", transform: "translateY(-50%)", fontSize: 10, color: C.muted }}>Rp</span>
                                  <input type="number" min={0} value={li.unit_price || ""} onChange={e => updateLineItem(li.key, { unit_price: parseFloat(e.target.value) || 0 })}
                                    placeholder="Harga satuan" style={{ ...inputStyle, padding: "4px 8px 4px 24px", fontSize: 11 }} />
                                </div>
                              </>)}
                              <div style={{ marginLeft: "auto", textAlign: "right", flexShrink: 0 }}>
                                <div style={{ fontSize: 11, color: C.muted, marginBottom: 2 }}>Tagihkan:</div>
                                <div style={{ position: "relative", width: 130 }}>
                                  <span style={{ position: "absolute", left: 7, top: "50%", transform: "translateY(-50%)", fontSize: 10, color: C.muted }}>Rp</span>
                                  <input type="number" min={0.01}
                                    max={!li.isManual && li.expense_id ? (billableExpenses.find(e => e.id === li.expense_id)?.remaining ?? undefined) : undefined}
                                    value={li.amount || ""}
                                    onChange={e => updateLineItem(li.key, { amount: parseFloat(e.target.value) || 0 })}
                                    style={{ ...inputStyle, padding: "4px 8px 4px 24px", fontSize: 12, fontWeight: 700 }} />
                                </div>
                                {!li.isManual && li.expense_id && (() => {
                                  const exp = billableExpenses.find(e => e.id === li.expense_id);
                                  return exp ? <div style={{ fontSize: 10, color: C.muted, marginTop: 2 }}>maks {fmt(exp.remaining)}</div> : null;
                                })()}
                              </div>
                            </div>
                          </div>
                          <button type="button" aria-label="Hapus baris item invoice" onClick={() => removeLineItem(li.key)}
                            style={{ background: "transparent", border: "none", cursor: "pointer", color: C.muted, padding: 2, flexShrink: 0 }}>
                            <X size={14} />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Tombol tambah item manual */}
                <button type="button" onClick={addManualLineItem}
                  style={{ padding: "8px", borderRadius: 6, border: `1px dashed ${C.border}`, background: "var(--surface)", color: C.mid, fontSize: 12, cursor: "pointer" }}>
                  + Tambah Item Manual (upah / item tidak tercatat)
                </button>
              </div>
            )}

            {/* ── COMMISSION FEE: nominal fee saja ── */}
            {isCommFee && (
              <div style={{ padding: "var(--pad-baris)", borderRadius: 6, background: "var(--navy-light)", border: "1px solid #C4B5FD", display: "flex", flexDirection: "column", gap: 8 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: "var(--aksen-pekat)" }}>Fee Komisi</div>
                {commissionFeeSuggest && (
                  <div style={{ background: "var(--surface)", borderRadius: 6, padding: "8px 12px", fontSize: 12, display: "flex", flexDirection: "column", gap: 4 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", color: C.mid }}>
                      <span>Total pengeluaran proyek</span><span>{fmt(commissionFeeSuggest.total_expense)}</span>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between", color: C.mid }}>
                      <span>Fee komisi proyek ({commissionFeeSuggest.commission_pct}%)</span><span>{fmt(commissionFeeSuggest.suggested_fee)}</span>
                    </div>
                    {commissionFeeSuggest.already_billed_fee > 0 && (
                      <div style={{ display: "flex", justifyContent: "space-between", color: C.mid }}>
                        <span>Sudah ditagih sebelumnya</span><span>- {fmt(commissionFeeSuggest.already_billed_fee)}</span>
                      </div>
                    )}
                    <div style={{ display: "flex", justifyContent: "space-between", fontWeight: 700, color: "var(--aksen-pekat)", borderTop: `1px solid ${C.border}`, paddingTop: 4, marginTop: 2 }}>
                      <span>Sisa fee yang disarankan</span><span>{fmt(commissionFeeSuggest.remaining_fee)}</span>
                    </div>
                  </div>
                )}
                <div>
                  <label htmlFor="commission-fee-amount" style={labelStyle}>Nominal Fee Komisi <span style={{ color: C.red }}>*</span></label>
                  <div style={{ position: "relative" }}>
                    <span style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", fontSize: 11, color: C.muted }}>Rp</span>
                    <input id="commission-fee-amount" type="number" min={1} value={commissionFeeAmount} onChange={e => setCommissionFeeAmount(e.target.value)}
                      style={inputRpStyle} placeholder="0" />
                  </div>
                  <div style={{ fontSize: 11, color: C.muted, marginTop: 4 }}>Bisa diubah dari saran di atas</div>
                </div>
              </div>
            )}

            {/* ── KOMISI LANGSUNG (legacy): input total pengeluaran + % ── */}
            {isCommBill && (
              <div style={{ padding: "var(--pad-baris)", borderRadius: 6, background: "var(--warning-bg)", border: "1px solid var(--warning-border)", display: "flex", flexDirection: "column", gap: 8 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: "var(--on-warning-bg)" }}>Komisi Langsung</div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                  <div>
                    <label htmlFor="total-pengeluaran" style={labelStyle}>Total Pengeluaran <span style={{ color: C.red }}>*</span></label>
                    <div style={{ position: "relative" }}>
                      <span style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", fontSize: 11, color: C.muted }}>Rp</span>
                      <input id="total-pengeluaran" type="number" min={1} value={totalPengeluaran} onChange={e => setTotalPengeluaran(e.target.value)} required style={inputRpStyle} placeholder="0" />
                    </div>
                  </div>
                  <div>
                    <label style={labelStyle}>Komisi %
                      {projectDetail.commission_pct && <span style={{ fontWeight: 400, color: C.muted }}> (proyek: {projectDetail.commission_pct}%)</span>}
                    </label>
                    <div style={{ position: "relative" }}>
                      <input type="number" min={0} max={100} step={0.5} value={commissionPct} onChange={e => setCommissionPct(e.target.value)} style={{ ...inputStyle, paddingRight: 28 }} placeholder="0" />
                      <span style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", fontSize: 11, color: C.muted }}>%</span>
                    </div>
                  </div>
                </div>
                {pengeluaran > 0 && (
                  <div style={{ background: "var(--surface)", borderRadius: 6, padding: "8px 12px", fontSize: 12, display: "flex", flexDirection: "column", gap: 2 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", color: C.mid }}><span>Pengeluaran</span><span>{fmt(pengeluaran)}</span></div>
                    <div style={{ display: "flex", justifyContent: "space-between", color: C.mid }}><span>Fee ({commissionPct || 0}%)</span><span>+ {fmt(komisiAmt)}</span></div>
                    <div style={{ display: "flex", justifyContent: "space-between", fontWeight: 700, color: C.text, borderTop: `1px solid ${C.border}`, paddingTop: 4, marginTop: 2 }}><span>Subtotal</span><span>{fmt(pengeluaran + komisiAmt)}</span></div>
                  </div>
                )}
              </div>
            )}

            {/* ── Nominal Dasar (hanya untuk termin / commission_billing) ── */}
            {(isTermin || isCommBill) && (
              <div>
                <label htmlFor="base-amount" style={labelStyle}>Nominal Dasar <span style={{ color: C.red }}>*</span>
                  {isCommBill && <span style={{ fontWeight: 400, color: C.muted }}> (auto-dihitung)</span>}
                </label>
                <div style={{ position: "relative" }}>
                  <span style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", fontSize: 11, color: C.muted }}>Rp</span>
                  <input id="base-amount" type="number" min={1} value={baseAmount} onChange={e => setBaseAmount(e.target.value)}
                    readOnly={isCommBill} required style={{ ...inputRpStyle, background: isCommBill ? "var(--surface-subtle)" : "var(--surface)" }} placeholder="0" />
                </div>
              </div>
            )}

            {/* ── Deskripsi ── */}
            <div>
              <label htmlFor="description" style={labelStyle}>Deskripsi Invoice</label>
              <input id="description" type="text" value={description} onChange={e => setDescription(e.target.value)} style={inputStyle} placeholder="Tampil di PDF invoice" />
            </div>

            {/* ── Retensi toggle ── */}
            <div style={{ padding: "8px 12px", borderRadius: 6, border: `1px solid ${C.border}`, background: useRetensi ? "var(--warning-bg)" : "var(--surface-subtle)" }}>
              <Saklar
                nyala={useRetensi}
                onUbah={setUseRetensi}
                label="Terapkan Potongan Retensi"
              />
              {useRetensi && (
                <div style={{ marginTop: 10, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                  <div>
                    <label style={labelStyle}>Persentase Retensi
                      {projectDetail.retention_pct > 0 && <span style={{ fontWeight: 400 }}> (proyek: {projectDetail.retention_pct}%)</span>}
                    </label>
                    <div style={{ position: "relative" }}>
                      <input type="number" min={0} max={100} step={0.5} value={retensiPct} onChange={e => setRetensiPct(e.target.value)} style={{ ...inputStyle, paddingRight: 28 }} placeholder="5" />
                      <span style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", fontSize: 11, color: C.muted }}>%</span>
                    </div>
                  </div>
                  <div>
                    <span style={labelStyle}>Potongan Retensi</span>
                    <div style={{ padding: "8px 12px", background: "var(--surface-subtle)", borderRadius: 6, fontSize: 13, fontWeight: 700, color: C.red, border: `1px solid ${C.border}` }}>
                      -{fmt(retensiAmt)}
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* ── Potongan Uang Muka (DP recoupment) — hanya termin progres ── */}
            {dpEligible && (
              <div style={{ padding: "8px 12px", borderRadius: 6, border: `1px solid ${C.border}`, background: useDpDeduction ? C.blueBg : "var(--surface-subtle)" }}>
                {/* Saldo DP tetap BERDAMPINGAN dengan saklarnya, bukan
                    dipindah ke bawah: yang memutuskan memotong DP butuh
                    melihat sisanya pada saat memutuskan, bukan sesudahnya. */}
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <Saklar
                      nyala={useDpDeduction}
                      onUbah={(v) => {
                        setUseDpDeduction(v);
                        if (v && !dpDeductionAmount && dpAvailable != null) {
                          setDpDeductionAmount(String(Math.min(dpAvailable, Math.max(netAfterRet, 0))));
                        }
                      }}
                      label="Potong Uang Muka (DP)"
                    />
                  </div>
                  <span style={{ fontSize: 12, color: C.mid, flexShrink: 0 }}>
                    Saldo DP: <b style={{ color: C.navy }}>{fmt(dpAvailable ?? 0)}</b>
                  </span>
                </div>
                {useDpDeduction && (
                  <div style={{ marginTop: 10 }}>
                    <label htmlFor="dp-deduction-amount" style={labelStyle}>Nominal Potongan DP</label>
                    <div style={{ position: "relative" }}>
                      <span style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", fontSize: 12, color: C.muted }}>Rp</span>
                      <input id="dp-deduction-amount" type="number" min={0} max={dpAvailable ?? undefined} value={dpDeductionAmount}
                        onChange={e => setDpDeductionAmount(e.target.value)} style={inputRpStyle} />
                    </div>
                    <div style={{ marginTop: 6, fontSize: 11, color: C.muted }}>
                      DP yang sudah dibayar klien dipotong dari tagihan ini. Sisa DP setelah invoice ini: {fmt(Math.max((dpAvailable ?? 0) - dpAmt, 0))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* ── Tanggal ── */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <div>
                <label htmlFor="issued-date" style={labelStyle}>Tanggal Terbit</label>
                <input id="issued-date" aria-label="Tanggal" type="date" value={issuedDate} onChange={e => setIssuedDate(e.target.value)} style={inputStyle} />
              </div>
              <div>
                <label htmlFor="due-date" style={labelStyle}>Jatuh Tempo <span style={{ color: C.red }}>*</span></label>
                <input id="due-date" aria-label="Tanggal" type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} required style={inputStyle} />
              </div>
            </div>

            {/* ── Catatan ── */}
            <div>
              <label htmlFor="notes" style={labelStyle}>Catatan</label>
              <textarea id="notes" value={notes} onChange={e => setNotes(e.target.value)} rows={2}
                style={{ ...inputStyle, resize: "vertical", fontFamily: "inherit" }} />
            </div>

            {/* ── Summary footer real-time ── */}
            {base > 0 && (
              <div style={{ borderRadius: 10, border: `1px solid ${C.border}`, overflow: "hidden" }}>
                <div style={{ background: "var(--bg)", padding: "8px 12px", fontSize: 11, fontWeight: 700, color: C.mid, textTransform: "uppercase", letterSpacing: "0.06em" }}>Ringkasan Invoice</div>
                <div style={{ padding: "8px 12px", display: "flex", flexDirection: "column", gap: 4 }}>
                  {isExpBilling && lineItems.map(li => (
                    <SummaryRow key={li.key} label={li.description || "Item"} value={fmt(li.amount)} />
                  ))}
                  {isExpBilling && lineItems.length > 1 && (
                    <SummaryRow label="Subtotal item" value={fmt(lineItemsTotal)} />
                  )}
                  {!isExpBilling && <SummaryRow label={isCommFee ? "Fee Komisi" : "Nominal Dasar"} value={fmt(base)} />}
                  {useRetensi && retensiAmt > 0 && <SummaryRow label={`Potongan Retensi (${retensiPct}%)`} value={`-${fmt(retensiAmt)}`} valueColor={C.red} />}
                  {dpAmt > 0 && <SummaryRow label="Potongan Uang Muka (DP)" value={`-${fmt(dpAmt)}`} valueColor={C.blue} />}
                  <SummaryRow label={taxLabel} value={`-${fmt(taxAmount)}`} valueColor={C.muted} />
                  <div style={{ borderTop: `2px solid ${C.border}`, marginTop: 4, paddingTop: 8, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <span style={{ fontSize: 13, fontWeight: 800, color: C.text }}>TOTAL INVOICE</span>
                    <span style={{ fontSize: 15, fontWeight: 800, color: C.navy, fontFamily: "var(--font-display)" }}>{fmt(totalInvoice)}</span>
                  </div>
                </div>
              </div>
            )}
          </>)}

          {error && <div style={{ padding: "8px 12px", borderRadius: 6, background: C.redBg, border: `1px solid ${C.redBorder}`, fontSize: 13, color: C.red }}>{error}</div>}

          <div style={{ display: "flex", gap: 8, paddingTop: 4 }}>
            <button type="button" onClick={onClose} style={{ flex: 1, padding: "8px", borderRadius: 6, border: `1px solid ${C.border}`, background: "var(--surface)", color: C.text, fontSize: 13, cursor: "pointer" }}>Batal</button>
            <button type="submit" disabled={loading || !projectDetail}
              style={{ flex: 2, padding: "8px", borderRadius: 6, border: "none", background: (loading || !projectDetail) ? "var(--text-muted)" : C.navy, color: "var(--surface)", fontSize: 13, fontWeight: 600, cursor: (loading || !projectDetail) ? "not-allowed" : "pointer" }}>
              {loading ? "Menyimpan..." : "Buat Invoice"}
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body
  );
}

export function AddKasbonModal({ onClose, onSuccess }: { onClose: () => void; onSuccess: () => void }) {
  useTutupEsc(onClose);
  const mounted = useTerpasang();

  const [scopes, setScopes] = useState<MandorScope[]>([]);
  const [scopeId, setScopeId] = useState("");
  const [amount, setAmount] = useState("");
  const [fundSource, setFundSource] = useState("owner_advance");
  const [purpose, setPurpose] = useState("operasional");
  const [kasbonDate, setKasbonDate] = useState(new Date().toISOString().split("T")[0]);
  const [notes, setNotes] = useState("");
  const [cashAccounts, setCashAccounts] = useState<CashAccount[]>([]);
  const [cashAccountId, setCashAccountId] = useState("");
  const [autoApprove, setAutoApprove] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    document.body.style.overflow = "hidden";
    // Load work scopes dengan mandor assignment info
    Promise.all([
      api.get<{ accounts: CashAccount[] }>("/api/v1/cash/accounts"),
      api.get<{ scopes: MandorScope[] }>("/api/v1/mandor/scopes"),
    ]).then(([accRes, scopeRes]) => {
      setCashAccounts(accRes.data.accounts);
      const main = accRes.data.accounts.find(a => a.type === "main");
      if (main) setCashAccountId(main.id);
      setScopes(scopeRes.data.scopes ?? []);
    }).catch(() => {
      // Fallback: coba ambil scopes dari assignments
      api.get<{ accounts: CashAccount[] }>("/api/v1/cash/accounts").then(r => {
        setCashAccounts(r.data.accounts);
        const main = r.data.accounts.find(a => a.type === "main");
        if (main) setCashAccountId(main.id);
      }).catch(() => {});
    });
    return () => { document.body.style.overflow = ""; };
  }, []);

  const selectedScope = scopes.find(s => s.id === scopeId);
  const selectedAccount = cashAccounts.find(a => a.id === cashAccountId);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!scopeId || !amount) { setError("Work scope dan nominal wajib diisi"); return; }
    const amt = parseFloat(amount);
    if (isNaN(amt) || amt <= 0) { setError("Nominal harus lebih dari 0"); return; }
    if (autoApprove && !cashAccountId) { setError("Pilih akun kas untuk kasbon yang langsung disetujui"); return; }

    setLoading(true);
    try {
      await api.post("/api/v1/kasbons", {
        work_scope_id: scopeId,
        amount: amt,
        fund_source: fundSource,
        purpose,
        kasbon_date: kasbonDate,
        notes: notes.trim() || undefined,
        cash_account_id: autoApprove ? cashAccountId : undefined,
        auto_approve: autoApprove,
      });
      onSuccess();
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
      setError(msg ?? "Gagal menyimpan kasbon");
    } finally {
      setLoading(false);
    }
  }

  if (!mounted) return null;
  return createPortal(
    <div style={{ position: "fixed", inset: 0, zIndex: 9999, background: "rgba(0,0,0,0.45)", backdropFilter: "blur(3px)", display: "flex", alignItems: "center", justifyContent: "center", padding: "var(--pad-kartu-lega)" }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={{ background: "var(--surface)", borderRadius: 14, width: "100%", maxWidth: 520, boxShadow: "var(--naik-3)", display: "flex", flexDirection: "column", maxHeight: "90vh" }}>

        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "20px 24px", borderBottom: `1px solid ${C.border}` }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div style={{ width: 36, height: 36, borderRadius: 10, background: "linear-gradient(135deg, var(--warning), var(--warning))", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <Banknote size={17} color="var(--surface)" />
            </div>
            <div>
              <h3 style={{ fontSize: 15, fontWeight: 700, color: C.text, margin: 0 }}>Tambah Kasbon Mandor</h3>
              <p style={{ fontSize: 11, color: C.muted, margin: 0 }}>Dibuat langsung oleh admin/PM</p>
            </div>
          </div>
          <button aria-label="Tutup" onClick={onClose} style={{ background: "transparent", border: "none", cursor: "pointer", color: C.muted, padding: 4 }}><X size={18} /></button>
        </div>

        {/* Body */}
        <form onSubmit={handleSubmit} style={{ padding: "20px 24px", display: "flex", flexDirection: "column", gap: 12, overflowY: "auto", flex: 1 }}>

          {/* Work scope (mandor + proyek) */}
          <div>
            <label htmlFor="scope-id" style={{ display: "block", fontSize: 12, fontWeight: 600, color: C.mid, marginBottom: 6 }}>Work Scope Mandor <span style={{ color: C.red }}>*</span></label>
            <select id="scope-id" aria-label="Work scope mandor yang mengajukan kasbon" value={scopeId} onChange={e => setScopeId(e.target.value)} required
              style={{ width: "100%", padding: "8px 12px", border: `1px solid ${C.border}`, borderRadius: 6, fontSize: 13, color: C.text, background: "var(--surface)", outline: "none", boxSizing: "border-box" }}>
              <option value="">-- Pilih mandor & scope --</option>
              {scopes.map(s => (
                <option key={s.id} value={s.id}>
                  {s.assignment?.mandor?.name ?? "?"} — {s.scope_name} ({s.assignment?.project?.name ?? "?"})
                </option>
              ))}
            </select>
            {selectedScope && (
              <div style={{ marginTop: 6, fontSize: 11, color: C.muted }}>
                Mandor: <strong style={{ color: C.text }}>{selectedScope.assignment?.mandor?.name}</strong>
                {" · "}Proyek: <strong style={{ color: C.text }}>{selectedScope.assignment?.project?.name}</strong>
              </div>
            )}
          </div>

          {/* Nominal + Tanggal */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div>
              <label htmlFor="amount" style={{ display: "block", fontSize: 12, fontWeight: 600, color: C.mid, marginBottom: 6 }}>Nominal <span style={{ color: C.red }}>*</span></label>
              <div style={{ position: "relative" }}>
                <span style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", fontSize: 12, color: C.muted }}>Rp</span>
                <input id="amount" type="number" min={1} value={amount} onChange={e => setAmount(e.target.value)} required
                  style={{ width: "100%", padding: "8px 12px 8px 32px", border: `1px solid ${C.border}`, borderRadius: 6, fontSize: 13, outline: "none", boxSizing: "border-box" }}
                  onFocus={e => { e.target.style.borderColor = C.navy; }} onBlur={e => { e.target.style.borderColor = C.border; }} />
              </div>
            </div>
            <div>
              <label htmlFor="kasbon-date" style={{ display: "block", fontSize: 12, fontWeight: 600, color: C.mid, marginBottom: 6 }}>Tanggal</label>
              <input id="kasbon-date" aria-label="Tanggal" type="date" value={kasbonDate} onChange={e => setKasbonDate(e.target.value)}
                style={{ width: "100%", padding: "8px 12px", border: `1px solid ${C.border}`, borderRadius: 6, fontSize: 13, outline: "none", boxSizing: "border-box" }} />
            </div>
          </div>

          {/* Keperluan + Sumber Dana */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div>
              <label htmlFor="purpose" style={{ display: "block", fontSize: 12, fontWeight: 600, color: C.mid, marginBottom: 6 }}>Keperluan <span style={{ color: C.red }}>*</span></label>
              <select id="purpose" aria-label="Keperluan kasbon" value={purpose} onChange={e => setPurpose(e.target.value)}
                style={{ width: "100%", padding: "8px 12px", border: `1px solid ${C.border}`, borderRadius: 6, fontSize: 13, background: "var(--surface)", outline: "none", boxSizing: "border-box" }}>
                <option value="gaji_tukang">Gaji Tukang</option>
                <option value="uang_makan">Uang Makan</option>
                <option value="pembelian_alat">Pembelian Alat</option>
                <option value="operasional">Operasional</option>
                <option value="lain_lain">Lain-lain</option>
              </select>
            </div>
            <div>
              <label htmlFor="fund-source" style={{ display: "block", fontSize: 12, fontWeight: 600, color: C.mid, marginBottom: 6 }}>Sumber Dana</label>
              <select id="fund-source" aria-label="Sumber dana kasbon" value={fundSource} onChange={e => setFundSource(e.target.value)}
                style={{ width: "100%", padding: "8px 12px", border: `1px solid ${C.border}`, borderRadius: 6, fontSize: 13, background: "var(--surface)", outline: "none", boxSizing: "border-box" }}>
                <option value="owner_advance">Dana Owner</option>
                <option value="client_fund">Dana Klien</option>
              </select>
            </div>
          </div>

          {/* Catatan */}
          <div>
            <label htmlFor="notes-3" style={{ display: "block", fontSize: 12, fontWeight: 600, color: C.mid, marginBottom: 6 }}>Keterangan / Alasan</label>
            <textarea id="notes-3" value={notes} onChange={e => setNotes(e.target.value)} rows={2}
              placeholder="Contoh: untuk beli material rangka atap minggu ini..."
              style={{ width: "100%", padding: "8px 12px", border: `1px solid ${C.border}`, borderRadius: 6, fontSize: 13, outline: "none", resize: "vertical", boxSizing: "border-box", fontFamily: "inherit" }}
              onFocus={e => { e.target.style.borderColor = C.navy; }} onBlur={e => { e.target.style.borderColor = C.border; }} />
          </div>

          {/* Mode: langsung setujui vs pending */}
          <div style={{ padding: "var(--pad-baris)", borderRadius: 10, background: autoApprove ? C.greenBg : C.yellowBg, border: `1px solid ${autoApprove ? C.greenBorder : C.yellowBorder}` }}>
            {/* Keterangannya BERUBAH mengikuti keadaan saklar — ia menyatakan
                apa yang akan terjadi, bukan apa yang sedang disetel. Itu yang
                membuat orang tak perlu menebak akibat sebelum menekan. */}
            <Saklar
              id="auto-approve-invoice"
              nyala={autoApprove}
              onUbah={setAutoApprove}
              label="Setujui langsung"
              ringkas={
                autoApprove
                  ? "Kasbon langsung disetujui dan saldo kas berkurang"
                  : "Kasbon masuk sebagai pending, mandor atau admin bisa approve nanti"
              }
            />

            {/* Pilih kas sumber jika auto-approve */}
            {autoApprove && (
              <div style={{ marginTop: 12 }}>
                <label htmlFor="cash-account-id" style={{ display: "block", fontSize: 11, fontWeight: 600, color: C.mid, marginBottom: 5 }}>Potong dari akun kas:</label>
                <select id="cash-account-id" aria-label="Akun kas yang dipotong untuk kasbon ini" value={cashAccountId} onChange={e => setCashAccountId(e.target.value)}
                  style={{ width: "100%", padding: "8px 8px", border: `1px solid ${C.border}`, borderRadius: 6, fontSize: 12, background: "var(--surface)", outline: "none", boxSizing: "border-box" }}>
                  <option value="">-- Pilih akun kas --</option>
                  {cashAccounts.map(a => (
                    <option key={a.id} value={a.id}>
                      {a.name} · Saldo {new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(Number(a.balance))}
                    </option>
                  ))}
                </select>
                {selectedAccount && amount && (
                  <div style={{ marginTop: 6, fontSize: 11, color: Number(selectedAccount.balance) >= parseFloat(amount || "0") ? C.green : C.red }}>
                    Saldo setelah: {new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(Number(selectedAccount.balance) - (parseFloat(amount) || 0))}
                  </div>
                )}
              </div>
            )}
          </div>

          {error && <div style={{ padding: "8px 12px", borderRadius: 6, background: C.redBg, border: `1px solid ${C.redBorder}`, fontSize: 13, color: C.red }}>{error}</div>}

          <div style={{ display: "flex", gap: 8, paddingTop: 4 }}>
            <button type="button" onClick={onClose} style={{ flex: 1, padding: "8px", borderRadius: 6, border: `1px solid ${C.border}`, background: "var(--surface)", color: C.text, fontSize: 13, cursor: "pointer" }}>Batal</button>
            <button type="submit" disabled={loading} style={{ flex: 2, padding: "8px", borderRadius: 6, border: "none", background: loading ? "var(--text-muted)" : autoApprove ? C.green : C.yellow, color: "var(--surface)", fontSize: 13, fontWeight: 600, cursor: loading ? "not-allowed" : "pointer" }}>
              {loading ? "Menyimpan..." : autoApprove ? "Buat & Setujui Kasbon" : "Buat Kasbon (Pending)"}
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body
  );
}

export function StatusBadge({ status, map }: { status: string; map: Record<string, { label: string; color: string; bg: string; border: string }> }) {
  const m = map[status] ?? { label: status, color: C.muted, bg: "var(--surface-hover)", border: "var(--border)" };
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 4,
      padding: "2px 8px", borderRadius: 99, fontSize: 11, fontWeight: 600,
      color: m.color, background: m.bg, border: `1px solid ${m.border}`,
      whiteSpace: "nowrap",
    }}>
      <span style={{ width: 5, height: 5, borderRadius: "50%", background: m.color, flexShrink: 0 }} />
      {m.label}
    </span>
  );
}

export function PenaltyModal({ invoiceId, invoiceNumber, onClose }: { invoiceId: string; invoiceNumber: string; onClose: () => void }) {
  useTutupEsc(onClose);
  const [info, setInfo] = useState<PenaltyInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const canWaive = (() => { try { return (JSON.parse(localStorage.getItem("puraloka_permissions") || "[]") as string[]).includes("finance:penalty:waive"); } catch { return false; } })();
  const fmtIdr = formatRupiah;
  const BASIS: Record<string, string> = { invoice_telat: "nilai invoice telat", outstanding_proyek: "sisa outstanding", kontrak_total: "nilai kontrak" };

  const loadInfo = () => {
    setLoading(true);
    api.get<PenaltyInfo>(`/api/v1/finance/invoice/${invoiceId}/penalty`)
      .then(({ data }) => setInfo(data))
      .catch((e) => setErr(e?.response?.data?.error ?? "Gagal memuat denda"))
      .finally(() => setLoading(false));
  };
  useEffect(loadInfo, [invoiceId]);

  async function submitWaive(waived: boolean) {
    if (!reason.trim()) { setErr("Alasan wajib diisi"); return; }
    setBusy(true); setErr(null);
    try {
      await api.patch(`/api/v1/finance/invoice/${invoiceId}/waive-penalty`, { waived, reason: reason.trim() });
      setReason(""); loadInfo();
    } catch (e) {
      setErr((e as { response?: { data?: { error?: string } } })?.response?.data?.error ?? "Gagal menyimpan");
    } finally { setBusy(false); }
  }

  const auth = info?.authoritative;
  const est = info?.estimate;
  return (
    <div onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", zIndex: 1200, display: "flex", alignItems: "center", justifyContent: "center", padding: "var(--pad-kartu-lega)" }}>
      <div style={{ background: "var(--surface)", borderRadius: 14, width: "100%", maxWidth: 460, boxShadow: "var(--naik-3)", maxHeight: "90vh", overflowY: "auto" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 20px", borderBottom: "1px solid var(--border)" }}>
          <div>
            <h2 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: "var(--text-primary)" }}>Denda Keterlambatan</h2>
            <div style={{ fontSize: 12, color: "var(--text-muted)" }}>{invoiceNumber}</div>
          </div>
          <button aria-label="Tutup" onClick={onClose} style={{ padding: 6, border: "none", background: "transparent", cursor: "pointer", color: "var(--text-muted)" }}><X size={18} /></button>
        </div>
        <div style={{ padding: "var(--pad-kartu-lega)", display: "flex", flexDirection: "column", gap: 12 }}>
          {loading ? <div style={{ textAlign: "center", padding: "var(--pad-kartu-lega)", color: "var(--text-muted)", fontSize: 13 }}>Memuat…</div> : (
            <>
              {info?.waived && (
                <div style={{ padding: "8px 12px", borderRadius: 10, background: "var(--warning-bg)", border: "1px solid var(--warning-border)", fontSize: 12, color: "var(--text-primary)" }}>
                  <b>Denda diputihkan.</b> {info.waived_reason && <span style={{ color: "var(--text-secondary)" }}>Alasan: {info.waived_reason}</span>}
                </div>
              )}
              {!est?.enabled && !auth && (
                <div style={{ fontSize: 13, color: "var(--text-secondary)" }}>Denda keterlambatan <b>nonaktif</b> untuk invoice ini. Aktifkan di Konfigurasi Keuangan atau atur per proyek.</div>
              )}
              {auth ? (
                <div style={{ padding: "var(--pad-baris)", borderRadius: 10, background: "var(--danger-bg)", border: "1px solid var(--danger-border)" }}>
                  <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.04em", color: "var(--text-muted)", marginBottom: 4 }}>Denda resmi (tercatat)</div>
                  <div style={{ fontSize: 24, fontWeight: 800, color: "var(--danger)", fontFamily: "var(--font-display)" }}>{fmtIdr(Number(auth.penalty_amount))}</div>
                  <div style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: 4 }}>{auth.days_late} hari telat · basis {BASIS[auth.basis] ?? auth.basis} {fmtIdr(Number(auth.base_amount))} · per {auth.anchor_date}</div>
                </div>
              ) : est?.enabled && (
                <div style={{ padding: "var(--pad-baris)", borderRadius: 10, background: "var(--surface-subtle)", border: "1px dashed var(--border)" }}>
                  <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.04em", color: "var(--text-muted)", marginBottom: 4 }}>Estimasi per {est.as_of} · belum final</div>
                  <div style={{ fontSize: 24, fontWeight: 800, color: est.applicable ? "var(--warning)" : "var(--text-muted)", fontFamily: "var(--font-display)" }}>{fmtIdr(Number(est.penaltyAmount))}</div>
                  <div style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: 4 }}>
                    {est.applicable ? `${est.daysLate} hari telat · basis ${BASIS[est.basis] ?? est.basis} ${fmtIdr(Number(est.baseAmount))}` : est.reason === "not_late" ? "Belum jatuh tempo / belum telat" : est.reason === "waived" ? "Diputihkan" : "Tidak berlaku"}
                  </div>
                  <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 6 }}>Estimasi tampilan — angka resmi dihitung saat invoice lunas.</div>
                </div>
              )}
              {err && <div style={{ fontSize: 12, color: "var(--danger)" }}>{err}</div>}
              {canWaive && (
                <div style={{ borderTop: "1px solid var(--border)", paddingTop: 12 }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: "var(--text-primary)", marginBottom: 6 }}>{info?.waived ? "Batalkan pemutihan" : "Putihkan denda invoice ini"}</div>
                  <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Alasan (wajib — tercatat di audit)"
                    style={{ width: "100%", padding: "8px 12px", borderRadius: 6, border: "1px solid var(--border)", fontSize: 13, boxSizing: "border-box", marginBottom: 8 }} />
                  <button onClick={() => submitWaive(!info?.waived)} disabled={busy || !reason.trim()}
                    style={{ padding: "8px 16px", borderRadius: 6, border: "none", background: busy || !reason.trim() ? "var(--text-muted)" : (info?.waived ? "var(--navy)" : "var(--danger)"), color: "#fff", fontSize: 13, fontWeight: 600, cursor: busy || !reason.trim() ? "not-allowed" : "pointer" }}>
                    {busy ? "Menyimpan…" : info?.waived ? "Batalkan pemutihan" : "Putihkan denda"}
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export function SummaryRow({ label, value, valueColor }: { label: string; value: string; valueColor?: string }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12 }}>
      <span style={{ color: C.mid }}>{label}</span>
      <span style={{ fontWeight: 600, color: valueColor ?? C.text }}>{value}</span>
    </div>
  );
}


export function PayInvoiceModal({ invoice, onClose, onSuccess }: { invoice: Invoice; onClose: () => void; onSuccess: () => void }) {
  useTutupEsc(onClose);
  const mounted = useTerpasang();

  const [paidAt, setPaidAt] = useState(new Date().toISOString().split("T")[0]);
  const [amountPaid, setAmountPaid] = useState(String(Math.round(Number(invoice.amount_due))));
  const [paymentMethod, setPaymentMethod] = useState("transfer_bank");
  const [cashAccountId, setCashAccountId] = useState("");
  const [cashAccounts, setCashAccounts] = useState<CashAccount[]>([]);
  const [refNumber, setRefNumber] = useState("");
  const [bankName, setBankName] = useState("");
  const [notes, setNotes] = useState("");
  const [proofFile, setProofFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    document.body.style.overflow = "hidden";
    api.get<{ accounts: CashAccount[] }>("/api/v1/cash/accounts")
      .then(r => {
        setCashAccounts(r.data.accounts);
        const main = r.data.accounts.find(a => a.type === "main");
        if (main) setCashAccountId(main.id);
      }).catch(() => {});
    return () => { document.body.style.overflow = ""; };
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    const amt = parseFloat(amountPaid);
    if (!paidAt || isNaN(amt) || amt <= 0) { setError("Tanggal dan nominal wajib diisi"); return; }
    setLoading(true);
    try {
      const fd = new FormData();
      fd.append("invoice_id", invoice.id);
      fd.append("paid_at", paidAt);
      fd.append("amount_paid", String(amt));
      fd.append("payment_method", paymentMethod);
      if (cashAccountId) fd.append("cash_account_id", cashAccountId);
      if (refNumber.trim()) fd.append("ref_number", refNumber.trim());
      if (bankName.trim()) fd.append("bank_name", bankName.trim());
      if (notes.trim()) fd.append("notes", notes.trim());
      if (proofFile) fd.append("proof", proofFile);

      await api.post(`/api/v1/finance/invoice/${invoice.id}/pay`, fd, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      setSuccess(true);
      setTimeout(() => { onSuccess(); onClose(); }, 1200);
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
      setError(msg ?? "Gagal menyimpan pembayaran");
    } finally {
      setLoading(false);
    }
  }

  if (!mounted) return null;
  return createPortal(
    <div style={{ position: "fixed", inset: 0, zIndex: 9999, background: "rgba(0,0,0,0.45)", backdropFilter: "blur(3px)", display: "flex", alignItems: "center", justifyContent: "center", padding: "var(--pad-kartu-lega)" }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={{ background: "var(--surface)", borderRadius: 14, width: "100%", maxWidth: 480, boxShadow: "var(--naik-3)", display: "flex", flexDirection: "column", maxHeight: "90vh" }}>
        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "20px 24px", borderBottom: `1px solid ${C.border}` }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div style={{ width: 36, height: 36, borderRadius: 10, background: "linear-gradient(135deg, var(--success), var(--success))", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <Banknote size={17} color="var(--surface)" />
            </div>
            <div>
              <h3 style={{ fontSize: 15, fontWeight: 700, color: C.text, margin: 0 }}>Catat Pembayaran</h3>
              <p style={{ fontSize: 11, color: C.muted, margin: 0 }}>{invoice.invoice_number} · {invoice.projects?.name}</p>
            </div>
          </div>
          <button aria-label="Tutup" onClick={onClose} style={{ background: "transparent", border: "none", cursor: "pointer", color: C.muted, padding: 4 }}><X size={18} /></button>
        </div>

        <div style={{ padding: "20px 24px", overflowY: "auto", flex: 1 }}>
          {/* Invoice info */}
          <div style={{ background: C.greenBg, border: `1px solid ${C.greenBorder}`, borderRadius: 10, padding: "12px 16px", marginBottom: 20, display: "flex", justifyContent: "space-between" }}>
            <div>
              <div style={{ fontSize: 11, color: C.green, fontWeight: 600, marginBottom: 2 }}>Sisa Tagihan</div>
              <div style={{ fontSize: 20, fontWeight: 800, color: C.green, fontFamily: "var(--font-display)" }}>{fmt(Number(invoice.amount_due))}</div>
            </div>
            <div style={{ textAlign: "right" }}>
              <div style={{ fontSize: 11, color: C.green, fontWeight: 600, marginBottom: 2 }}>Total Invoice</div>
              <div style={{ fontSize: 13, fontWeight: 600, color: C.mid }}>{fmt(Number(invoice.total_amount))}</div>
            </div>
          </div>

          {success ? (
            <div style={{ textAlign: "center", padding: "24px 0" }}>
              <CheckCircle2 size={48} color={C.green} style={{ marginBottom: 12 }} />
              <p style={{ fontSize: 15, fontWeight: 700, color: C.green }}>Pembayaran berhasil dicatat!</p>
            </div>
          ) : (
            <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <div>
                  <label htmlFor="paid-at" style={{ display: "block", fontSize: 12, fontWeight: 600, color: C.mid, marginBottom: 6 }}>Tanggal Bayar <span style={{ color: C.red }}>*</span></label>
                  <input id="paid-at" aria-label="Tanggal" type="date" value={paidAt} onChange={e => setPaidAt(e.target.value)} required
                    style={{ width: "100%", padding: "8px 12px", border: `1px solid ${C.border}`, borderRadius: 6, fontSize: 13, outline: "none", boxSizing: "border-box" }} />
                </div>
                <div>
                  <label htmlFor="amount-paid" style={{ display: "block", fontSize: 12, fontWeight: 600, color: C.mid, marginBottom: 6 }}>Nominal <span style={{ color: C.red }}>*</span></label>
                  <div style={{ position: "relative" }}>
                    <span style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", fontSize: 12, color: C.muted }}>Rp</span>
                    <input id="amount-paid" type="number" min={1} value={amountPaid} onChange={e => setAmountPaid(e.target.value)} required
                      style={{ width: "100%", padding: "8px 12px 8px 32px", border: `1px solid ${C.border}`, borderRadius: 6, fontSize: 13, outline: "none", boxSizing: "border-box" }} />
                  </div>
                </div>
              </div>

              {/* Kas Tujuan */}
              <div>
                <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: C.mid, marginBottom: 6 }}>
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                    <Wallet size={12} /> Masuk ke Kas
                  </span>
                </label>
                {cashAccounts.length === 0 ? (
                  <div style={{ padding: "8px 12px", border: `1px solid ${C.border}`, borderRadius: 6, fontSize: 12, color: C.muted }}>Memuat...</div>
                ) : (
                  <select aria-label="Akun kas penerima pembayaran" value={cashAccountId} onChange={e => setCashAccountId(e.target.value)}
                    style={{ width: "100%", padding: "8px 12px", border: `1px solid ${C.border}`, borderRadius: 6, fontSize: 13, background: "var(--surface)", outline: "none", boxSizing: "border-box" }}>
                    <option value="">— Tidak masuk ke kas —</option>
                    {cashAccounts.map(a => (
                      <option key={a.id} value={a.id}>
                        {a.name} ({ACCOUNT_TYPE_LABEL[a.type] ?? a.type}) · Saldo {new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(a.balance)}
                      </option>
                    ))}
                  </select>
                )}
              </div>

              <div>
                <label htmlFor="payment-method" style={{ display: "block", fontSize: 12, fontWeight: 600, color: C.mid, marginBottom: 6 }}>Metode Pembayaran</label>
                <select id="payment-method" aria-label="Metode pembayaran" value={paymentMethod} onChange={e => setPaymentMethod(e.target.value)}
                  style={{ width: "100%", padding: "8px 12px", border: `1px solid ${C.border}`, borderRadius: 6, fontSize: 13, background: "var(--surface)", outline: "none", boxSizing: "border-box" }}>
                  <option value="transfer_bank">Transfer Bank</option>
                  <option value="cash">Tunai</option>
                  <option value="qris">QRIS</option>
                  <option value="cek">Cek</option>
                  <option value="giro">Giro</option>
                </select>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <div>
                  <label htmlFor="ref-number" style={{ display: "block", fontSize: 12, fontWeight: 600, color: C.mid, marginBottom: 6 }}>No. Referensi</label>
                  <input id="ref-number" type="text" value={refNumber} onChange={e => setRefNumber(e.target.value)} placeholder="No. TF"
                    style={{ width: "100%", padding: "8px 12px", border: `1px solid ${C.border}`, borderRadius: 6, fontSize: 13, outline: "none", boxSizing: "border-box" }} />
                </div>
                <div>
                  <label htmlFor="bank-name" style={{ display: "block", fontSize: 12, fontWeight: 600, color: C.mid, marginBottom: 6 }}>Bank</label>
                  <input id="bank-name" type="text" value={bankName} onChange={e => setBankName(e.target.value)} placeholder="BCA, Mandiri..."
                    style={{ width: "100%", padding: "8px 12px", border: `1px solid ${C.border}`, borderRadius: 6, fontSize: 13, outline: "none", boxSizing: "border-box" }} />
                </div>
              </div>

              {/* Bukti upload */}
              <div>
                <label htmlFor="bukti-transfer" style={{ display: "block", fontSize: 12, fontWeight: 600, color: C.mid, marginBottom: 6 }}>
                  Bukti Transfer <span style={{ color: C.muted, fontWeight: 400 }}>(opsional)</span>
                </label>
                <input id="bukti-transfer" ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp,application/pdf" style={{ display: "none" }} onChange={e => {
                  const f = e.target.files?.[0] ?? null;
                  if (f && f.size > 5 * 1024 * 1024) { alert("Ukuran file maksimal 5 MB"); e.target.value = ""; return; }
                  setProofFile(f);
                }} />
                {proofFile ? (
                  <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 12px", borderRadius: 6, background: C.greenBg, border: `1px solid ${C.greenBorder}` }}>
                    <FileText size={16} color={C.green} />
                    <span style={{ flex: 1, fontSize: 12, color: C.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{proofFile.name}</span>
                    <button type="button" aria-label="Buang bukti transfer yang dipilih" onClick={() => setProofFile(null)} style={{ background: "transparent", border: "none", cursor: "pointer", color: C.red }}><X size={14} /></button>
                  </div>
                ) : (
                  <button type="button" onClick={() => fileRef.current?.click()}
                    style={{ width: "100%", padding: "8px", border: `2px dashed ${C.border}`, borderRadius: 6, background: "var(--surface-subtle)", color: C.mid, fontSize: 12, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
                    <ArrowDownLeft size={14} /> Upload bukti transfer
                  </button>
                )}
              </div>

              <div>
                <label htmlFor="notes-2" style={{ display: "block", fontSize: 12, fontWeight: 600, color: C.mid, marginBottom: 6 }}>Catatan</label>
                <textarea id="notes-2" value={notes} onChange={e => setNotes(e.target.value)} rows={2}
                  style={{ width: "100%", padding: "8px 12px", border: `1px solid ${C.border}`, borderRadius: 6, fontSize: 13, outline: "none", resize: "vertical", boxSizing: "border-box", fontFamily: "inherit" }} />
              </div>

              {error && <div style={{ padding: "8px 12px", borderRadius: 6, background: C.redBg, border: `1px solid ${C.redBorder}`, fontSize: 13, color: C.red }}>{error}</div>}

              <div style={{ display: "flex", gap: 8, paddingTop: 4 }}>
                <button type="button" onClick={onClose} style={{ flex: 1, padding: "8px", borderRadius: 6, border: `1px solid ${C.border}`, background: "var(--surface)", fontSize: 13, cursor: "pointer" }}>Batal</button>
                <button type="submit" disabled={loading} style={{ flex: 2, padding: "8px", borderRadius: 6, border: "none", background: loading ? "var(--text-muted)" : C.green, color: "var(--surface)", fontSize: 13, fontWeight: 600, cursor: loading ? "not-allowed" : "pointer" }}>
                  {loading ? "Menyimpan..." : "Catat Pembayaran"}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}


/**
 * Membuat PDF invoice di sisi peramban dan mengunduhnya.
 *
 * Dipindah dari dalam komponen halaman jadi fungsi mandiri saat modul
 * dipecah: /invoice dan ringkasan sama-sama memakainya, dan dua salinan
 * berarti dua PDF yang bisa berbeda isinya untuk invoice yang sama.
 *
 * Semua impor berat (@react-pdf/renderer, qrcode) dimuat MALAS di dalam
 * fungsi. Kalau di-impor di puncak berkas, setiap halaman keuangan ikut
 * mengunduhnya — padahal mayoritas kunjungan tak pernah menekan Unduh.
 */
export async function unduhInvoicePdf(inv: Invoice): Promise<void> {
  try {
    const [{ pdf }, { InvoicePDF }, QRCode] = await Promise.all([
      import("@react-pdf/renderer"),
      import("@/components/invoice-pdf"),
      import("qrcode"),
    ]);

    const [companyRes, qrDataUrl] = await Promise.all([
      api.get<{ company: import("@/components/invoice-pdf").CompanyProfile }>("/api/v1/settings/company"),
      QRCode.toDataURL(`https://puraloka.app/verify/invoice/${inv.id}`, { width: 200, margin: 1 }),
    ]);
    const company = companyRes.data.company;

    // Fetch line items jika expense_billing atau commission_fee
    let lineItems: import("@/components/invoice-pdf").InvoiceLineItem[] | undefined;
    if (inv.invoice_type === "expense_billing" || inv.invoice_type === "commission_fee") {
      try {
        const lineRes = await api.get<{ line_items: import("@/components/invoice-pdf").InvoiceLineItem[] }>(
          `/api/v1/finance/invoice-line-items/${inv.id}`
        );
        lineItems = lineRes.data.line_items;
      } catch {
        lineItems = [];
      }
    }

    const invoiceData: import("@/components/invoice-pdf").InvoiceData = {
      ...inv,
      retensi_amount: inv.retensi_amount ?? undefined,
      retensi_pct: inv.retensi_pct ?? undefined,
      commission_amount: inv.commission_amount,
      tax_amount: inv.tax_amount,
      description: inv.description ?? undefined,
      line_items: lineItems,
    };

    const React = await import("react");
    const blob = await pdf(
      React.createElement(InvoicePDF, { invoice: invoiceData, company, qrDataUrl }) as any
    ).toBlob();

    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `Invoice-${inv.invoice_number.replace(/\//g, "-")}.pdf`;
    a.click();
    URL.revokeObjectURL(url);
  } catch (err) {
    console.error("PDF generation failed", err);
  } finally {
  }
}


export function CashflowTooltip({ active, payload, label }: { active?: boolean; payload?: Array<{ name: string; value: number; color: string }>; label?: string }) {
  if (!active || !payload?.length) return null;
  return (
    <div style={{ background: "var(--surface)", border: `1px solid ${C.border}`, borderRadius: 10, padding: "8px 12px", fontSize: 12, boxShadow: "var(--naik-2)", minWidth: 180 }}>
      <p style={{ fontWeight: 700, color: C.text, marginBottom: 8 }}>{label}</p>
      {payload.map((p, i) => (
        <div key={i} style={{ display: "flex", justifyContent: "space-between", gap: "var(--gap-grid)", marginBottom: 4 }}>
          <span style={{ color: C.mid }}>{p.name}</span>
          <span style={{ fontWeight: 600, color: p.color }}>{fmtCompact(p.value)}</span>
        </div>
      ))}
    </div>
  );
}
