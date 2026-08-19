"use client";

// ============================================================================
// Penagihan Progress — scope ber-`payment_system: progress_pct`, ajukan
// tagihan berdasarkan persentase pekerjaan selesai.
//
// Restyle F7d (2026-08-20): warna-ui → token CSS, modal manual+useTutupEsc →
// BottomSheet (ESC bawaan komponen), badge status → StatusBadge, kosong →
// EmptyState, loading → SkeletonCard.
//
// ── Migrasi ke useData
//
// Versi sebelumnya memakai `Promise.all` dengan FALLBACK BERANTAI:
// `/mandor/my-scopes` dicoba dulu, dan HANYA kalau gagal (`.catch`) baru
// jatuh ke `/mandor/assignments` + turunan manual. Diverifikasi ke
// `apps/api/src/routes/v1/mandor.ts` baris 2316 — `/mandor/my-scopes`
// adalah endpoint nyata dan berjalan (bukan endpoint yang direncanakan tapi
// belum ada), jadi fallback-nya tak pernah tersentuh dalam pemakaian normal.
// Kedua fetch (`my-scopes`, `progress-payments`) TIDAK saling bergantung —
// keduanya independen, bukan berantai — jadi migrasi ke `useData` paralel
// aman dan fallback lama dibuang.
// ============================================================================

import { useMemo, useState } from "react";
import { useData, invalidasi } from "@/lib/data-cache";
import { type LingkupKerja, type PembayaranProgres, type GalatApi, pesanGalat } from "../_bersama/tipe";
import { kirimLapangan } from "@/lib/kirim-lapangan";
import { TrendingUp, Plus, Clock, AlertCircle, ChevronDown, ChevronUp } from "lucide-react";
import BottomSheet from "@/components/portal/BottomSheet";
import StatusBadge, { type VarianStatus } from "@/components/portal/StatusBadge";
import EmptyState from "@/components/portal/EmptyState";
import SkeletonCard from "@/components/portal/SkeletonCard";
import KpiCard from "@/components/portal/KpiCard";

function fmtRp(n: number) {
  return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(n);
}
function fmtDate(s: string | null) {
  if (!s) return "—";
  return new Date(s).toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric" });
}

function ProgressBar({ pct, color, height = 6 }: { pct: number; color: string; height?: number }) {
  return (
    <div style={{ height, background: "var(--border)", borderRadius: height, overflow: "hidden" }}>
      <div style={{ height: "100%", borderRadius: height, background: color, width: `${Math.min(100, pct)}%`, transition: "width 0.5s" }} />
    </div>
  );
}

const VARIAN_STATUS: Record<string, VarianStatus> = {
  pending: "pending",
  approved: "approved",
  rejected: "rejected",
};

const LABEL_STATUS: Record<string, string> = {
  pending: "Menunggu Konfirmasi",
  approved: "Disetujui",
  rejected: "Ditolak",
};

interface RespScopes { scopes: LingkupKerja[] }
interface RespPayments { payments: PembayaranProgres[] }

export default function PenagihanProgressPage() {
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [sheetTerbuka, setSheetTerbuka] = useState(false);
  const [selectedScope, setSelectedScope] = useState<LingkupKerja | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null);
  const [form, setForm] = useState({ pct_done: "", gross_payment: "", notes: "" });

  const { data: dataScopes, memuat: memuatScopes, galat: galatScopes, muatUlang: muatUlangScopes } =
    useData<RespScopes>("/api/v1/mandor/my-scopes");
  const { data: dataPayments, memuat: memuatPayments, galat: galatPayments, muatUlang: muatUlangPayments } =
    useData<RespPayments>("/api/v1/mandor/progress-payments");

  const loading = memuatScopes || memuatPayments;
  const galatMuat = galatScopes ?? galatPayments;

  const scopes = useMemo(
    () => (dataScopes?.scopes ?? []).filter((s) => s.payment_system === "progress_pct"),
    [dataScopes],
  );
  const payments = dataPayments?.payments ?? [];

  async function loadData() {
    await Promise.all([muatUlangScopes(), muatUlangPayments()]);
    invalidasi("/api/v1/mandor/progress-payments");
  }

  function openSheet(scope: LingkupKerja) {
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
    setSheetTerbuka(true);
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
      setSheetTerbuka(false);
      if (hasil.terkirim) await loadData();
    } catch (err) {
      setToast({ msg: pesanGalat(err, "Gagal mengajukan penagihan"), ok: false });
    } finally {
      setSubmitting(false);
    }
  }

  const pendingCount = payments.filter((p) => p.status === "pending").length;
  const totalPending = payments.filter((p) => p.status === "pending").reduce((s, p) => s + Number(p.gross_payment ?? 0), 0);
  const totalTertagih = payments.filter((p) => p.status === "approved").reduce((s, p) => s + Number(p.gross_payment ?? 0), 0);

  // ── Tren penagihan per bulan
  //
  // DIPERTIMBANGKAN dan DILEPAS. Data yang tersedia di sini hanya
  // `payments` dari `/mandor/progress-payments` TANPA batas waktu — jumlah
  // pengajuan progress-billing per mandor biasanya kecil (beberapa per
  // scope aktif) dan tidak rutin bulanan, jadi "bulan ini vs bulan lalu"
  // dari sampel sekecil itu (sering 0 vs 1) menghasilkan persentase yang
  // dramatis tapi tak bermakna secara finansial — lebih menyesatkan
  // daripada membantu. Total tertagih vs menunggu (KPI di bawah) sudah
  // menjawab pertanyaan yang sebenarnya ditanyakan mandor: "berapa yang
  // sudah cair, berapa yang masih diproses".

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {toast && (
        <div role="alert" aria-live="polite">
          <button
            type="button"
            onClick={() => setToast(null)}
            aria-label={`Tutup pesan: ${toast.msg}`}
            style={{
              position: "fixed", top: 72, right: 20, zIndex: 999,
              background: toast.ok ? "var(--success-bg)" : "var(--danger-bg)",
              border: `1px solid ${toast.ok ? "var(--success)" : "var(--danger)"}`,
              color: toast.ok ? "var(--on-success-bg)" : "var(--on-danger-bg)",
              padding: "12px 20px", borderRadius: 10, fontSize: 13, fontWeight: 600,
              boxShadow: "var(--naik-2)", cursor: "pointer", textAlign: "left",
            }}
          >
            {toast.msg}
          </button>
        </div>
      )}

      <div>
        <h1 style={{ fontSize: 20, fontWeight: 700, color: "var(--text-primary)", margin: 0 }}>Penagihan Progress</h1>
        <p style={{ fontSize: 13, color: "var(--text-secondary)", margin: "4px 0 0" }}>
          Ajukan penagihan berdasarkan persentase pekerjaan selesai
        </p>
      </div>

      {loading && (
        <>
          <SkeletonCard tinggi={110} />
          <SkeletonCard tinggi={150} />
        </>
      )}

      {!loading && galatMuat && (
        <EmptyState
          icon={AlertCircle}
          judul="Gagal memuat data penagihan"
          deskripsi={pesanGalat(galatMuat as GalatApi, "Coba muat ulang halaman ini.")}
        />
      )}

      {!loading && !galatMuat && scopes.length === 0 && (
        <EmptyState
          icon={AlertCircle}
          judul="Tidak ada scope Progress %"
          deskripsi="Halaman ini hanya untuk scope dengan sistem pembayaran progress persentase. Scope borongan/harian tak muncul di sini."
        />
      )}

      {!loading && !galatMuat && scopes.length > 0 && (
        <>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <KpiCard label="Total Tertagih" nilai={fmtRp(totalTertagih)} icon={TrendingUp} />
            <KpiCard label="Menunggu Konfirmasi" nilai={fmtRp(totalPending)} icon={Clock} />
          </div>

          {pendingCount > 0 && (
            <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>
              {pendingCount} tagihan sedang menunggu konfirmasi admin/PM.
            </div>
          )}

          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
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
                <div
                  key={scope.id}
                  style={{
                    background: "var(--surface)", borderRadius: 16, border: "1px solid var(--border)",
                    overflow: "hidden",
                  }}
                >
                  <div style={{ padding: 16, background: isActive ? "var(--surface-subtle)" : "transparent" }}>
                    <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, marginBottom: 14 }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 14, fontWeight: 700, color: "var(--text-primary)", marginBottom: 2 }}>
                          {scope.scope_name}
                        </div>
                        <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>{scope.project?.name}</div>
                        {contractValue > 0 && (
                          <div style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: 2 }}>
                            Nilai Kontrak: {fmtRp(contractValue)}
                          </div>
                        )}
                      </div>
                      <div style={{ textAlign: "right", flexShrink: 0 }}>
                        <div style={{ fontSize: 22, fontWeight: 700, color: "var(--navy)", fontVariantNumeric: "tabular-nums" }}>
                          {physicalPct}%
                        </div>
                        <div style={{ fontSize: 10, color: "var(--text-secondary)" }}>progress fisik</div>
                      </div>
                    </div>

                    <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 14 }}>
                      <div>
                        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                          <span style={{ fontSize: 11, color: "var(--text-secondary)" }}>Progress Fisik</span>
                          <span style={{ fontSize: 11, fontWeight: 600, color: "var(--navy)" }}>{physicalPct}%</span>
                        </div>
                        <ProgressBar pct={physicalPct} color="var(--navy)" />
                      </div>
                      {contractValue > 0 && (
                        <div>
                          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                            <span style={{ fontSize: 11, color: "var(--text-secondary)" }}>Sudah Dibayar</span>
                            <span style={{ fontSize: 11, fontWeight: 600, color: "var(--success)" }}>
                              {fmtRp(totalPaid)} ({paidPct}%)
                            </span>
                          </div>
                          <ProgressBar pct={paidPct} color="var(--success)" height={4} />
                        </div>
                      )}
                    </div>

                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
                      <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
                        {isActive && !hasPending && (
                          <button
                            onClick={() => openSheet(scope)}
                            style={{
                              display: "flex", alignItems: "center", justifyContent: "center", gap: 4,
                              minHeight: 36, padding: "0 14px", borderRadius: "var(--portal-radius-pill)",
                              border: "none", background: "var(--grad-merek)", color: "var(--on-navy)",
                              fontSize: 12, fontWeight: 700, cursor: "pointer",
                            }}
                          >
                            <Plus size={14} aria-hidden="true" /> Ajukan Penagihan
                          </button>
                        )}
                        {hasPending && <StatusBadge status="pending" label="Ada tagihan menunggu konfirmasi" />}
                      </div>
                      {scopePayments.length > 0 && (
                        <button
                          onClick={() => setExpanded((prev) => ({ ...prev, [scope.id]: !isExpanded }))}
                          aria-expanded={isExpanded}
                          style={{
                            display: "flex", alignItems: "center", gap: 4, minHeight: 36,
                            padding: "0 10px", borderRadius: "var(--portal-radius-pill)",
                            border: "1px solid var(--border)", background: "var(--surface)",
                            color: "var(--text-secondary)", fontSize: 12, cursor: "pointer",
                          }}
                        >
                          {isExpanded ? <ChevronUp size={14} aria-hidden="true" /> : <ChevronDown size={14} aria-hidden="true" />}
                          {scopePayments.length} tagihan
                        </button>
                      )}
                    </div>
                  </div>

                  {isExpanded && scopePayments.length > 0 && (
                    <div style={{ borderTop: "1px solid var(--border)" }}>
                      <div
                        style={{
                          padding: "8px 16px 4px", fontSize: 11, fontWeight: 700, color: "var(--text-secondary)",
                          textTransform: "uppercase", letterSpacing: "0.05em",
                        }}
                      >
                        Riwayat Penagihan
                      </div>
                      {scopePayments.map((p) => (
                        <div
                          key={p.id}
                          style={{
                            padding: "10px 16px", borderTop: "1px solid var(--border)",
                            display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8,
                          }}
                        >
                          <div style={{ minWidth: 0 }}>
                            <div style={{ fontSize: 13, fontWeight: 700, color: "var(--text-primary)", fontVariantNumeric: "tabular-nums" }}>
                              {fmtRp(Number(p.gross_payment ?? 0))}
                            </div>
                            <div style={{ fontSize: 11, color: "var(--text-secondary)", marginTop: 2 }}>
                              Progress {p.pct_done}% · {fmtDate(p.created_at ?? null)}
                              {p.notes && ` · ${p.notes}`}
                            </div>
                          </div>
                          <StatusBadge
                            status={VARIAN_STATUS[p.status ?? ""] ?? "netral"}
                            label={LABEL_STATUS[p.status ?? ""] ?? (p.status ?? "—")}
                          />
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}

      <BottomSheet terbuka={sheetTerbuka} onTutup={() => setSheetTerbuka(false)} judul="Ajukan Penagihan">
        {selectedScope && (
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <div style={{ fontSize: 13, color: "var(--text-secondary)" }}>{selectedScope.scope_name}</div>

            <div
              style={{
                background: "var(--navy-light)", borderRadius: 12, padding: 14,
                display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8,
              }}
            >
              <div>
                <div style={{ fontSize: 10, color: "var(--text-secondary)", marginBottom: 2 }}>Progress Fisik</div>
                <div style={{ fontSize: 13, fontWeight: 700, color: "var(--navy)" }}>{selectedScope.progress_pct_done ?? 0}%</div>
              </div>
              <div>
                <div style={{ fontSize: 10, color: "var(--text-secondary)", marginBottom: 2 }}>Sudah Dibayar</div>
                <div style={{ fontSize: 12, fontWeight: 700, color: "var(--success)" }}>
                  {fmtRp(Number(selectedScope.total_progress_paid ?? 0))}
                </div>
              </div>
              <div>
                <div style={{ fontSize: 10, color: "var(--text-secondary)", marginBottom: 2 }}>Sisa Kontrak</div>
                <div style={{ fontSize: 12, fontWeight: 700, color: "var(--text-primary)" }}>
                  {fmtRp(Math.max(0, Number(selectedScope.contract_value ?? 0) - (selectedScope.total_progress_paid ?? 0)))}
                </div>
              </div>
            </div>

            <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <label style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>
                Progress Pekerjaan Saat Ini (%) *
                <div style={{ position: "relative", marginTop: 6 }}>
                  <input
                    type="number" min="0" max="100" step="1"
                    value={form.pct_done}
                    onChange={(e) => setForm((f) => ({ ...f, pct_done: e.target.value }))}
                    placeholder="Contoh: 75"
                    style={{
                      width: "100%", minHeight: 44, padding: "0 40px 0 12px", borderRadius: 12,
                      border: "1px solid var(--border)", fontSize: 14, boxSizing: "border-box",
                    }}
                  />
                  <span style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", fontSize: 13, color: "var(--text-secondary)" }}>%</span>
                </div>
                <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 4, fontWeight: 400 }}>
                  Progress fisik sekarang — akan digunakan sebagai dasar penagihan
                </div>
              </label>

              <label style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>
                Jumlah Tagihan (Rp) *
                <input
                  type="number" min="1"
                  value={form.gross_payment}
                  onChange={(e) => setForm((f) => ({ ...f, gross_payment: e.target.value }))}
                  placeholder="0"
                  style={{
                    width: "100%", marginTop: 6, minHeight: 44, padding: "0 12px", borderRadius: 12,
                    border: "1px solid var(--border)", fontSize: 14, boxSizing: "border-box",
                  }}
                />
                {Number(selectedScope.contract_value ?? 0) > 0 && (
                  <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 4, fontWeight: 400 }}>
                    Maks sisa kontrak: {fmtRp(Math.max(0, Number(selectedScope.contract_value ?? 0) - (selectedScope.total_progress_paid ?? 0)))}
                  </div>
                )}
              </label>

              <label style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>
                Catatan (opsional)
                <textarea
                  value={form.notes}
                  onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                  rows={2}
                  placeholder="Misal: sudah selesai lantai 1 dan 2"
                  style={{
                    width: "100%", marginTop: 6, padding: 12, borderRadius: 12,
                    border: "1px solid var(--border)", fontSize: 14, resize: "vertical",
                    boxSizing: "border-box", fontFamily: "inherit",
                  }}
                />
              </label>

              <div style={{ background: "var(--warning-bg)", borderRadius: 10, padding: "10px 12px", fontSize: 12, color: "var(--on-warning-bg)" }}>
                Tagihan akan dikirim ke admin/PM untuk dikonfirmasi sebelum dibayarkan.
              </div>

              <button
                type="submit"
                disabled={submitting}
                style={{
                  minHeight: 48, padding: "0 20px", borderRadius: "var(--portal-radius-pill)", border: "none",
                  background: "var(--navy)", color: "var(--on-navy)",
                  fontSize: 14, fontWeight: 700, cursor: submitting ? "default" : "pointer",
                  opacity: submitting ? 0.6 : 1,
                  display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
                }}
              >
                {submitting ? "Mengajukan…" : <><TrendingUp size={16} aria-hidden="true" /> Ajukan Penagihan</>}
              </button>
            </form>
          </div>
        )}
      </BottomSheet>
    </div>
  );
}
