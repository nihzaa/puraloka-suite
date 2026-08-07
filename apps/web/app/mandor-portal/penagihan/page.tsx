"use client";

import { useEffect, useState } from "react";
import { useTutupEsc } from "@/lib/use-tutup-esc";
import { api } from "@/lib/api";
import { type Penugasan, type LingkupKerja, type PembayaranProgres, pesanGalat } from "../_bersama/tipe";
import { kirimLapangan } from "@/lib/kirim-lapangan";
import { TrendingUp, Plus, Clock, CheckCircle, XCircle, AlertCircle, ChevronDown, ChevronUp } from "lucide-react";

import { C } from "@/lib/warna-ui";

function fmtRp(n: number) {
  return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(n);
}
function fmtDate(s: string | null) {
  if (!s) return "—";
  return new Date(s).toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric" });
}

function ProgressBar({ pct, color, height = 6 }: { pct: number; color: string; height?: number }) {
  return (
    <div style={{ height, background: C.border, borderRadius: height, overflow: "hidden" }}>
      <div style={{ height: "100%", borderRadius: height, background: color, width: `${Math.min(100, pct)}%`, transition: "width 0.5s" }} />
    </div>
  );
}

const PAYMENT_STATUS: Record<string, { label: string; color: string; bg: string; icon: React.ReactNode }> = {
  pending:  { label: "Menunggu Konfirmasi", color: C.yellow, bg: C.yellowBg, icon: <Clock size={12} /> },
  approved: { label: "Disetujui",           color: C.green,  bg: C.greenBg,  icon: <CheckCircle size={12} /> },
  rejected: { label: "Ditolak",             color: C.red,    bg: C.redBg,    icon: <XCircle size={12} /> },
};

export default function PenagihanProgressPage() {
  const [scopes, setScopes] = useState<LingkupKerja[]>([]);
  const [payments, setPayments] = useState<PembayaranProgres[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [showModal, setShowModal] = useState(false);
  // Modal di portal ini tak punya prop `onClose` — ia dikendalikan state
  // lokal — sehingga penjaga `modal-esc-ratchet` tak menjangkaunya, dan
  // kelima modal portal mandor menjebak pemakai keyboard tanpa terdeteksi.
  // Penjaganya ikut diperluas; ini perbaikan kodenya.
  useTutupEsc(showModal ? () => setShowModal(false) : null);
  const [selectedScope, setSelectedScope] = useState<any>(null);
  const [submitting, setSubmitting] = useState(false);
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null);

  const [form, setForm] = useState({ pct_done: "", gross_payment: "", notes: "" });

  useEffect(() => { loadData(); }, []);

  async function loadData() {
    setLoading(true);
    try {
      // Ambil scopes bertipe progress_pct dari my-scopes
      const [sRes, pRes] = await Promise.all([
        api.get("/api/v1/mandor/my-scopes").catch(() =>
          api.get<{ assignments: Penugasan[] }>("/api/v1/mandor/assignments").then((r) => {
            const asgns = r.data?.assignments ?? [];
            const all = asgns.flatMap((a) =>
              (a.work_scopes ?? []).map((s) => ({ ...s, project: a.project, contract_value: 0, total_progress_paid: 0 }))
            );
            return { data: { scopes: all } };
          })
        ),
        api.get<{ payments: PembayaranProgres[] }>("/api/v1/mandor/progress-payments"),
      ]);

      const allScopes: any[] = sRes.data?.scopes ?? [];
      const progressScopes = allScopes.filter((s) => s.payment_system === "progress_pct");
      setScopes(progressScopes);

      const init: Record<string, boolean> = {};
      progressScopes.forEach((s) => { if (s.status === "active") init[s.id] = true; });
      setExpanded(init);

      setPayments(pRes.data?.payments ?? []);
    } finally {
      setLoading(false);
    }
  }

  function openModal(scope: LingkupKerja) {
    setSelectedScope(scope);
    const currentPct = scope.progress_pct_done ?? 0;
    const contractValue = Number(scope.contract_value ?? 0);
    const totalPaid = scope.total_progress_paid ?? 0;
    const remaining = Math.max(0, contractValue - totalPaid);
    setForm({
      pct_done: String(currentPct),
      gross_payment: remaining > 0 ? String(Math.round(remaining * 0.3)) : "",
      notes: "",
    });
    setShowModal(true);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedScope || !form.pct_done || !form.gross_payment) {
      setToast({ msg: "Persentase dan jumlah tagihan wajib diisi", ok: false });
      return;
    }
    const grossAmt = Number(form.gross_payment);
    if (isNaN(grossAmt) || grossAmt <= 0) {
      setToast({ msg: "Jumlah tagihan tidak valid", ok: false });
      return;
    }
    setSubmitting(true);
    try {
      // F4-3 — lewat antrean offline; sinyal buruk adalah norma di lapangan.
      const hasil = await kirimLapangan("POST", "/api/v1/mandor/progress-payments", {
        work_scope_id: selectedScope.id,
        pct_done: Number(form.pct_done),
        gross_payment: grossAmt,
        notes: form.notes || undefined,
      }, "Penagihan berhasil diajukan, menunggu konfirmasi admin", "Gagal mengajukan penagihan");

      setToast({ msg: hasil.pesan, ok: hasil.aman });
      if (!hasil.aman) return;
      setShowModal(false);
      if (hasil.terkirim) await loadData();
    } catch (err) {
      setToast({ msg: pesanGalat(err, "Gagal mengajukan penagihan"), ok: false });
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) return <div style={{ textAlign: "center", padding: 60, color: C.mid }}>Memuat...</div>;

  if (scopes.length === 0) {
    return (
      <div style={{ maxWidth: 700, margin: "0 auto", textAlign: "center", padding: 60 }}>
        <AlertCircle size={36} color={C.muted} style={{ marginBottom: 12 }} />
        <div style={{ fontSize: 15, fontWeight: 600, color: C.text }}>Tidak ada scope Progress %</div>
        <div style={{ fontSize: 13, color: C.mid, marginTop: 4 }}>
          Halaman ini hanya untuk scope dengan sistem pembayaran progress persentase
        </div>
      </div>
    );
  }

  const pendingCount = payments.filter((p) => p.status === "pending").length;
  const totalPending = payments.filter((p) => p.status === "pending").reduce((s, p) => s + Number(p.gross_payment ?? 0), 0);

  return (
    <div style={{ maxWidth: 800, margin: "0 auto" }}>
      {toast && (
        // Toast sebagai TOMBOL, bukan `<div onClick>`: ia memang bisa ditekan
        // (untuk menutup), jadi harus bisa difokus dan menanggapi Enter/Space.
        //
        // `role="alert"` ada di WADAHNYA, bukan di tombolnya. Versi pertama
        // menaruhnya langsung di `<button>` dan lint benar menolaknya: `alert`
        // adalah peran non-interaktif, jadi memasangnya ke tombol justru
        // MENGHAPUS makna "ini bisa ditekan". Memisahkan keduanya membuat
        // pembaca layar mengumumkan pesannya begitu muncul DAN tetap tahu
        // bahwa ia bisa ditutup — tanpa itu, pesan "berhasil"/"gagal" hanya
        // terlihat oleh yang kebetulan menatap sudut kanan atas layar.
        <div role="alert" aria-live="polite">
        <button
          type="button"
          onClick={() => setToast(null)}
          aria-label={`Tutup pesan: ${toast.msg}`}
          style={{
          position: "fixed", top: 72, right: 20, zIndex: 999,
          background: toast.ok ? C.greenBg : C.redBg,
          border: `1px solid ${toast.ok ? C.green : C.red}`,
          color: toast.ok ? C.green : C.red,
          padding: "12px 20px", borderRadius: 10, fontSize: 13, fontWeight: 500,
          boxShadow: "var(--naik-2)", cursor: "pointer",
          textAlign: "left",
        }}>
          {toast.msg}
        </button>
        </div>
      )}

      <div style={{ marginBottom: 20 }}>
        <h1 style={{ fontSize: 20, fontWeight: 700, color: C.text, margin: 0 }}>Penagihan Progress</h1>
        <p style={{ fontSize: 13, color: C.mid, margin: "4px 0 0" }}>Ajukan penagihan berdasarkan persentase pekerjaan selesai</p>
      </div>

      {/* KPI */}
      {pendingCount > 0 && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 20 }}>
          <div style={{ background: C.yellowBg, borderRadius: 10, padding: 16, border: `1px solid ${C.yellow}30` }}>
            <div style={{ fontSize: 11, color: C.yellow, fontWeight: 600, marginBottom: 6 }}>Tagihan Menunggu</div>
            <div style={{ fontSize: 26, fontWeight: 700, color: C.yellow }}>{pendingCount}</div>
          </div>
          <div style={{ background: C.surface, borderRadius: 10, padding: 16, border: `1px solid ${C.border}` }}>
            <div style={{ fontSize: 11, color: C.mid, fontWeight: 500, marginBottom: 6 }}>Total Pending</div>
            <div style={{ fontSize: 15, fontWeight: 700, color: C.text }}>{fmtRp(totalPending)}</div>
          </div>
        </div>
      )}

      {/* Scopes */}
      <div style={{ display: "flex", flexDirection: "column", gap: "var(--gap-grid)" }}>
        {scopes.map((scope) => {
          const contractValue = Number(scope.contract_value ?? 0);
          const totalPaid = scope.total_progress_paid ?? 0;
          const paidPct = contractValue > 0 ? Math.min(100, Math.round((totalPaid / contractValue) * 100)) : 0;
          const physicalPct = scope.progress_pct_done ?? 0;
          const scopePayments = payments.filter((p) => p.work_scope_id === scope.id);
          const isExpanded = expanded[scope.id] ?? false;
          const hasPending = scopePayments.some((p) => p.status === "pending");
          const isActive = scope.status === "active";

          return (
            <div key={scope.id} style={{
              background: C.surface, borderRadius: 10, border: `1px solid ${C.border}`,
              overflow: "hidden", boxShadow: "var(--naik-1)",
            }}>
              {/* Header */}
              <div style={{ padding: "16px 20px", background: isActive ? "var(--surface-subtle)" : "transparent" }}>
                <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, marginBottom: 14 }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: C.text, marginBottom: 2 }}>{scope.scope_name}</div>
                    <div style={{ fontSize: 12, color: C.mid }}>{scope.project?.name}</div>
                    {contractValue > 0 && (
                      <div style={{ fontSize: 12, color: C.mid, marginTop: 2 }}>Nilai Kontrak: {fmtRp(contractValue)}</div>
                    )}
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <div style={{ fontSize: 22, fontWeight: 700, color: C.navy }}>{physicalPct}%</div>
                    <div style={{ fontSize: 10, color: C.mid }}>progress fisik</div>
                  </div>
                </div>

                {/* Progress bars */}
                <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 14 }}>
                  <div>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                      <span style={{ fontSize: 11, color: C.mid }}>Progress Fisik</span>
                      <span style={{ fontSize: 11, fontWeight: 600, color: C.navy }}>{physicalPct}%</span>
                    </div>
                    <ProgressBar pct={physicalPct} color={C.navy} />
                  </div>
                  {contractValue > 0 && (
                    <div>
                      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                        <span style={{ fontSize: 11, color: C.mid }}>Sudah Dibayar</span>
                        <span style={{ fontSize: 11, fontWeight: 600, color: C.green }}>
                          {fmtRp(totalPaid)} ({paidPct}%)
                        </span>
                      </div>
                      <ProgressBar pct={paidPct} color={C.green} height={4} />
                    </div>
                  )}
                </div>

                {/* Actions */}
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
                  <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                    {isActive && !hasPending && (
                      <button onClick={() => openModal(scope)} style={{
                        display: "flex", alignItems: "center", gap: 4,
                        padding: "6px 12px", borderRadius: 6,
                        border: "none", background: C.navy, color: "var(--surface)",
                        fontSize: 12, fontWeight: 600, cursor: "pointer",
                      }}>
                        <Plus size={13} /> Ajukan Penagihan
                      </button>
                    )}
                    {hasPending && (
                      <span style={{
                        display: "flex", alignItems: "center", gap: 4,
                        fontSize: 12, color: C.yellow, fontWeight: 500,
                        padding: "6px 12px", borderRadius: 6, background: C.yellowBg, border: `1px solid ${C.yellow}40`,
                      }}>
                        <Clock size={12} /> Ada tagihan menunggu konfirmasi
                      </span>
                    )}
                  </div>
                  {scopePayments.length > 0 && (
                    <button
                      onClick={() => setExpanded((prev) => ({ ...prev, [scope.id]: !isExpanded }))}
                      style={{
                        display: "flex", alignItems: "center", gap: 4,
                        padding: "6px 8px", borderRadius: 6,
                        border: `1px solid ${C.border}`, background: "var(--surface)",
                        color: C.mid, fontSize: 12, cursor: "pointer",
                      }}
                    >
                      {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                      {scopePayments.length} tagihan
                    </button>
                  )}
                </div>
              </div>

              {/* Riwayat tagihan */}
              {isExpanded && scopePayments.length > 0 && (
                <div style={{ borderTop: `1px solid ${C.border}` }}>
                  <div style={{ padding: "8px 20px 4px", fontSize: 11, fontWeight: 600, color: C.mid, textTransform: "uppercase", letterSpacing: "0.05em" }}>
                    Riwayat Penagihan
                  </div>
                  {scopePayments.map((p) => {
                    const meta = PAYMENT_STATUS[p.status ?? ""] ?? PAYMENT_STATUS.pending;
                    return (
                      <div key={p.id} style={{
                        padding: "8px 20px", borderTop: `1px solid ${C.border}`,
                        display: "flex", justifyContent: "space-between", alignItems: "center",
                      }}>
                        <div>
                          <div style={{ fontSize: 13, fontWeight: 600, color: C.text }}>{fmtRp(Number(p.gross_payment ?? 0))}</div>
                          <div style={{ fontSize: 11, color: C.mid, marginTop: 2 }}>
                            Progress {p.pct_done}% · {fmtDate(p.created_at ?? null)}
                            {p.notes && ` · ${p.notes}`}
                          </div>
                        </div>
                        <span style={{
                          display: "flex", alignItems: "center", gap: 4,
                          fontSize: 11, fontWeight: 600, padding: "2px 8px", borderRadius: 20,
                          color: meta.color, background: meta.bg,
                        }}>
                          {meta.icon} {meta.label}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Modal Ajukan Penagihan */}
      {showModal && selectedScope && (
        <div style={{
          position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", zIndex: 1000,
          display: "flex", alignItems: "center", justifyContent: "center", padding: "var(--pad-kartu-lega)",
        }} onClick={(e) => { if (e.target === e.currentTarget) setShowModal(false); }}>
          <div style={{
            background: "var(--surface)", borderRadius: 14, padding: "var(--pad-kartu-lega)", width: "100%", maxWidth: 460,
            boxShadow: "var(--naik-3)",
          }}>
            <div style={{ marginBottom: 20 }}>
              <h2 style={{ fontSize: 15, fontWeight: 700, color: C.text, margin: "0 0 4px" }}>Ajukan Penagihan</h2>
              <div style={{ fontSize: 13, color: C.mid }}>{selectedScope.scope_name}</div>
            </div>

            {/* Info ringkasan */}
            <div style={{
              background: C.navyLight, borderRadius: 10, padding: "12px 16px", marginBottom: 20,
              display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8,
            }}>
              <div>
                <div style={{ fontSize: 10, color: C.mid, marginBottom: 2 }}>Progress Fisik</div>
                <div style={{ fontSize: 13, fontWeight: 700, color: C.navy }}>{selectedScope.progress_pct_done ?? 0}%</div>
              </div>
              <div>
                <div style={{ fontSize: 10, color: C.mid, marginBottom: 2 }}>Sudah Dibayar</div>
                <div style={{ fontSize: 12, fontWeight: 600, color: C.green }}>{fmtRp(Number(selectedScope.total_progress_paid ?? 0))}</div>
              </div>
              <div>
                <div style={{ fontSize: 10, color: C.mid, marginBottom: 2 }}>Sisa Kontrak</div>
                <div style={{ fontSize: 12, fontWeight: 600, color: C.text }}>
                  {fmtRp(Math.max(0, (selectedScope.contract_value ?? 0) - (selectedScope.total_progress_paid ?? 0)))}
                </div>
              </div>
            </div>

            <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <div>
                <label htmlFor="pct-done" style={{ fontSize: 12, fontWeight: 600, color: C.text, display: "block", marginBottom: 5 }}>
                  Progress Pekerjaan Saat Ini (%) *
                </label>
                <div style={{ position: "relative" }}>
                  <input id="pct-done"
                    type="number" min="0" max="100" step="1"
                    value={form.pct_done}
                    onChange={(e) => setForm((f) => ({ ...f, pct_done: e.target.value }))}
                    placeholder="Contoh: 75"
                    style={{ width: "100%", padding: "8px 40px 8px 12px", borderRadius: 6, border: `1px solid ${C.border}`, fontSize: 13, boxSizing: "border-box" }}
                  />
                  <span style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", fontSize: 13, color: C.mid }}>%</span>
                </div>
                <div style={{ fontSize: 11, color: C.muted, marginTop: 4 }}>
                  Progress fisik sekarang — akan digunakan sebagai dasar penagihan
                </div>
              </div>

              <div>
                <label htmlFor="gross-payment" style={{ fontSize: 12, fontWeight: 600, color: C.text, display: "block", marginBottom: 5 }}>
                  Jumlah Tagihan (Rp) *
                </label>
                <input id="gross-payment"
                  type="number" min="1"
                  value={form.gross_payment}
                  onChange={(e) => setForm((f) => ({ ...f, gross_payment: e.target.value }))}
                  placeholder="0"
                  style={{ width: "100%", padding: "8px 12px", borderRadius: 6, border: `1px solid ${C.border}`, fontSize: 13, boxSizing: "border-box" }}
                />
                {Number(selectedScope.contract_value ?? 0) > 0 && (
                  <div style={{ fontSize: 11, color: C.muted, marginTop: 4 }}>
                    Maks sisa kontrak: {fmtRp(Math.max(0, (selectedScope.contract_value ?? 0) - (selectedScope.total_progress_paid ?? 0)))}
                  </div>
                )}
              </div>

              <div>
                <label htmlFor="notes" style={{ fontSize: 12, fontWeight: 600, color: C.text, display: "block", marginBottom: 5 }}>
                  Catatan (opsional)
                </label>
                <textarea id="notes"
                  value={form.notes}
                  onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                  rows={2}
                  placeholder="Misal: sudah selesai lantai 1 dan 2"
                  style={{ width: "100%", padding: "8px 12px", borderRadius: 6, border: `1px solid ${C.border}`, fontSize: 13, resize: "none", boxSizing: "border-box" }}
                />
              </div>

              <div style={{ background: C.yellowBg, borderRadius: 6, padding: "8px 12px", fontSize: 12, color: C.yellow }}>
                ⓘ Tagihan akan dikirim ke admin/PM untuk dikonfirmasi sebelum dibayarkan
              </div>

              <div style={{ display: "flex", gap: 8 }}>
                <button type="button" onClick={() => setShowModal(false)} style={{
                  flex: 1, padding: "8px", borderRadius: 10, border: `1px solid ${C.border}`,
                  background: "var(--surface)", color: C.mid, fontSize: 13, fontWeight: 600, cursor: "pointer",
                }}>Batal</button>
                <button type="submit" disabled={submitting} style={{
                  flex: 2, padding: "8px", borderRadius: 10, border: "none",
                  background: submitting ? C.mid : C.navy, color: "var(--surface)",
                  fontSize: 13, fontWeight: 600, cursor: submitting ? "wait" : "pointer",
                  display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
                }}>
                  {submitting ? "Mengajukan..." : <><TrendingUp size={14} /> Ajukan Penagihan</>}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
