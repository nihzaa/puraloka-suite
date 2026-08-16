"use client";

import { useParams, useRouter } from "next/navigation";
import { useData } from "@/lib/data-cache";
import {
  ArrowLeft, Phone, Banknote, Users, AlertTriangle, Briefcase,
  Calendar, CheckCircle2, Clock, XCircle,
} from "lucide-react";

import { C } from "@/lib/warna-ui";
import { formatRupiah } from "@/lib/format";

const card: React.CSSProperties = {
  background: "var(--surface)", border: `1px solid ${C.border}`,
  borderRadius: 14, boxShadow: "var(--naik-1)",
};

const fmt = formatRupiah;
const fmtDate = (s: string) =>
  new Date(s).toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" });
const fmtDateShort = (s: string) =>
  new Date(s).toLocaleDateString("id-ID", { day: "numeric", month: "short" });

function formatWA(phone: string) {
  const digits = phone.replace(/\D/g, "");
  return `https://wa.me/${digits.startsWith("0") ? "62" + digits.slice(1) : digits}`;
}

// D3 — Consistent badge helpers
function getPaymentSystemBadge(type: string) {
  const map: Record<string, { label: string; bg: string; color: string; border: string }> = {
    borongan:     { label: "Borongan",  bg: "var(--navy-light)", color: "var(--on-info-bg)", border: "var(--info-border)" },
    harian:       { label: "Harian",    bg: "var(--success-bg)", color: "var(--on-success-bg)", border: "var(--success-border)" },
    progress_pct: { label: "Progress%", bg: "var(--navy-light)", color: "var(--aksen-pekat)", border: "var(--aksen-terang)" },
  };
  return map[type] ?? { label: type, bg: "var(--surface-hover)", color: "var(--text-secondary)", border: "var(--border)" };
}

function getWageStatusBadge(status: string) {
  const map: Record<string, { label: string; bg: string; color: string; border: string; icon: React.ReactNode }> = {
    draft:     { label: "Draft",     bg: "var(--surface-subtle)",  color: "var(--text-secondary)", border: "var(--border)",  icon: <Clock size={12} /> },
    submitted: { label: "Diajukan",  bg: "var(--warning-bg)",  color: "var(--warning)", border: "var(--warning-border)",  icon: <Clock size={12} /> },
    approved:  { label: "Disetujui", bg: "var(--success-bg)",  color: "var(--success)", border: "var(--success-border)",  icon: <CheckCircle2 size={12} /> },
    rejected:  { label: "Ditolak",   bg: "var(--danger-bg)",  color: "var(--danger)", border: "var(--danger-border)",  icon: <XCircle size={12} /> },
    paid:      { label: "Dibayar",   bg: "var(--info-bg)",  color: "var(--info)", border: "var(--info-border)",  icon: <CheckCircle2 size={12} /> },
  };
  return map[status] ?? map.draft!;
}

// D4 — Consistent progress/budget color helpers
function getProgressColor(pct: number): string {
  if (pct >= 90) return "var(--warning)";
  if (pct >= 70) return "var(--success)";
  if (pct >= 30) return "var(--info)";
  return "var(--text-muted)";
}

function getBudgetColor(pct: number): string {
  if (pct >= 90) return "var(--danger)";
  if (pct >= 70) return "var(--warning)";
  return "var(--success)";
}

interface MandorProfile {
  mandor: { id: string; name: string; phone: string | null; email: string; is_active: boolean };
  kpi: { totalPaid: number; totalKasbonOutstanding: number; activeScopeCount: number; activeWorkersThisMonth: number; totalRegisteredWorkers: number };
  assignments: Array<{
    id: string;
    assigned_at: string;
    project: { id: string; name: string; location: string } | null;
    work_scopes: Array<{
      id: string; scope_name: string; payment_system: string; status: string;
      borongan_value: number | null;
      progress_pct_done: number; start_date: string | null; end_date: string | null;
      total_paid: number;
    }>;
  }>;
  reports: Array<{
    id: string; week_start: string; week_end: string; status: string;
    net_amount: number; payment_method: string | null; paid_at: string | null;
    scope: { id: string; scope_name: string } | null;
    assignment: { project: { id: string; name: string } | null } | null;
  }>;
  kasbons: Array<{
    id: string; amount: number; amount_settled: number; purpose: string; kasbon_date: string;
    worker: { id: string; name: string } | null;
    project: { id: string; name: string } | null;
  }>;
}

export default function MandorProfilePage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();

  /*
    ── PINDAH KE LAPIS CACHE BERSAMA (F4-2), 2026-08-16

    `useData` mengunci cache lewat URL, yang sudah memuat `id` — jadi pindah
    dari satu mandor ke mandor lain otomatis memuat entri cache yang BERBEDA.

    Tapi `useData` TAK mengosongkan `data` lama saat url berganti — ia hanya
    menaikkan `memuat` lalu menimpa `data` setelah jawaban baru tiba. Kalau
    dibaca polos, itu membuka kembali cacat yang catatan lama di sini
    memperbaiki: pindah dari mandor A ke B akan menampilkan profil A sekejap
    di bawah URL B. Karena itu `data.mandor.id` (bukan hanya `memuat`)
    dicocokkan ke `id` dari URL — kalau belum cocok, dianggap masih memuat.
  */
  const { data: mentah, memuat: sedangMuat, galat } =
    useData<MandorProfile>(`/api/v1/mandor/profile/${id}`);
  const data = mentah && mentah.mandor.id === id ? mentah : null;
  const loading = sedangMuat || (!!mentah && mentah.mandor.id !== id);

  if (loading) return (
    <div style={{ padding: "60px 32px", textAlign: "center", color: C.muted, background: C.bg, minHeight: "100vh" }}>
      Memuat profil mandor...
    </div>
  );
  if (galat || !data) return (
    <div style={{ padding: "60px 32px", textAlign: "center", color: C.red, background: C.bg, minHeight: "100vh" }}>
      {galat ? "Gagal memuat profil mandor" : "Data tidak ditemukan"}
    </div>
  );

  const { mandor, kpi, assignments, reports, kasbons } = data;
  const allScopes = assignments.flatMap(a =>
    a.work_scopes.map(sc => ({ ...sc, project: a.project, assignment_id: a.id }))
  );

  return (
    // Padding disediakan `mandor/layout.tsx` — lihat catatan di sana.
    // Menambahkannya lagi di sini membuat jaraknya ganda.
    <div style={{ width: "100%", maxWidth: "var(--w-page)", margin: "0 auto" }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "flex-start", gap: 16, marginBottom: 28 }}>
        <button
          onClick={() => router.back()}
          style={{ padding: "var(--pad-atas) var(--pad-x) var(--pad-bawah)", borderRadius: 6, border: `1px solid ${C.border}`, background: "var(--surface)", cursor: "pointer", display: "flex", alignItems: "center", gap: 6, fontSize: 13, color: C.mid, flexShrink: 0, marginTop: 2 }}>
          <ArrowLeft size={14} /> Kembali
        </button>
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <div style={{ width: 56, height: 56, borderRadius: 14, background: C.navyLight, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22, fontWeight: 800, color: C.navy, flexShrink: 0 }}>
            {mandor.name.charAt(0).toUpperCase()}
          </div>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              {/* `<h2>`, bukan `<h1>`: judul halaman ("Mandor") sekarang
                  milik layout modul. Dua `<h1>` dalam satu dokumen membuat
                  pembaca layar kehilangan tingkatan yang menuntunnya. */}
              <h2 style={{ fontSize: 22, fontWeight: 800, color: C.text, margin: 0 }}>{mandor.name}</h2>
              {!mandor.is_active && (
                <span style={{ fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 6, background: "var(--surface-hover)", color: C.muted }}>Nonaktif</span>
              )}
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 4 }}>
              <span style={{ fontSize: 13, color: C.muted }}>{mandor.email}</span>
              {mandor.phone && (
                <a href={formatWA(mandor.phone)} target="_blank" rel="noopener noreferrer"
                  style={{ fontSize: 13, color: C.green, textDecoration: "none", display: "flex", alignItems: "center", gap: 4, fontWeight: 500 }}>
                  <Phone size={12} /> {mandor.phone}
                </a>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* KPI cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 28 }}>
        {[
          { label: "Total Upah Dibayar", value: fmt(kpi.totalPaid), icon: <Banknote size={16} color={C.green} />, bg: C.greenBg, color: C.green },
          { label: "Kasbon Outstanding", value: fmt(kpi.totalKasbonOutstanding), icon: <AlertTriangle size={16} color={C.red} />, bg: C.redBg, color: kpi.totalKasbonOutstanding > 0 ? C.red : C.mid },
          { label: "Scope Aktif", value: kpi.activeScopeCount, suffix: "scope", icon: <Briefcase size={16} color={C.navy} />, bg: C.navyLight, color: C.navy },
          { label: "Pekerja Terdaftar", value: kpi.totalRegisteredWorkers, suffix: "orang", icon: <Users size={16} color={C.blue} />, bg: C.blueBg, color: C.blue, sub: kpi.activeWorkersThisMonth > 0 ? `${kpi.activeWorkersThisMonth} aktif 30 hari terakhir` : null },
        ].map((s, i) => (
          <div key={i} style={{ ...card, padding: "12px 16px" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
              <span style={{ fontSize: 11, color: C.muted, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em" }}>{s.label}</span>
              <div style={{ width: 30, height: 30, borderRadius: 6, background: s.bg, display: "flex", alignItems: "center", justifyContent: "center" }}>{s.icon}</div>
            </div>
            <div style={{ fontSize: 20, fontWeight: 700, color: s.color }}>
              {s.value}
              {(s as any).suffix && <span style={{ fontSize: 12, fontWeight: 400, color: C.muted, marginLeft: 4 }}>{(s as any).suffix}</span>}
            </div>
            {(s as any).sub && <div style={{ fontSize: 11, color: C.muted, marginTop: 2 }}>{(s as any).sub}</div>}
          </div>
        ))}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 380px", gap: 20, alignItems: "start" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          {/* Section: Scope & Progress */}
          <div style={card}>
            <div style={{ padding: "16px 20px", borderBottom: `1px solid ${C.border}`, display: "flex", alignItems: "center", gap: 8 }}>
              <Briefcase size={16} color={C.navy} />
              <span style={{ fontSize: 15, fontWeight: 700, color: C.text }}>Scope & Progress</span>
              <span style={{ fontSize: 12, color: C.muted, marginLeft: "auto" }}>{allScopes.length} scope</span>
            </div>
            {allScopes.length === 0 ? (
              <div style={{ padding: "32px 20px", textAlign: "center", color: C.muted, fontSize: 13 }}>Belum ada scope aktif</div>
            ) : (
              <div style={{ padding: "12px 16px", display: "flex", flexDirection: "column", gap: 8 }}>
                {allScopes.map(sc => {
                  const budgetPct = sc.borongan_value && sc.borongan_value > 0
                    ? Math.min((sc.total_paid / sc.borongan_value) * 100, 100)
                    : 0;
                  const budgetColor = getBudgetColor(budgetPct);
                  const progressColor = getProgressColor(sc.progress_pct_done);
                  const sisa = sc.borongan_value ? sc.borongan_value - sc.total_paid : null;

                  return (
                    <div key={sc.id} style={{ borderRadius: 10, border: `1px solid ${C.border}`, background: "var(--surface-subtle)", padding: "12px 16px" }}>
                      {/* Scope header */}
                      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, marginBottom: 10 }}>
                        <div>
                          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 3, flexWrap: "wrap" }}>
                            <span style={{ fontSize: 13, fontWeight: 700, color: C.text }}>{sc.scope_name}</span>
                            {(() => { const b = getPaymentSystemBadge(sc.payment_system); return (
                              <span style={{ fontSize: 10, fontWeight: 600, padding: "2px 6px", borderRadius: 10, background: b.bg, color: b.color, border: `1px solid ${b.border}` }}>{b.label}</span>
                            ); })()}
                            <span style={{ fontSize: 10, fontWeight: 600, padding: "2px 6px", borderRadius: 10, background: sc.status === "active" ? C.greenBg : "var(--surface-hover)", color: sc.status === "active" ? C.green : C.mid, border: `1px solid ${sc.status === "active" ? C.greenBorder : C.border}` }}>
                              {sc.status === "active" ? "Aktif" : "Selesai"}
                            </span>
                          </div>
                          <div style={{ fontSize: 12, color: C.muted }}>{sc.project?.name ?? "—"}</div>
                        </div>
                        {sc.borongan_value && (
                          <div style={{ textAlign: "right", flexShrink: 0 }}>
                            <div style={{ fontSize: 13, fontWeight: 700, color: C.navy }}>{fmt(sc.borongan_value)}</div>
                            <div style={{ fontSize: 11, color: C.muted }}>nilai kontrak</div>
                          </div>
                        )}
                      </div>

                      {/* Progress fisik */}
                      <div style={{ marginBottom: 8 }}>
                        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                          <span style={{ fontSize: 11, color: C.muted, fontWeight: 500 }}>Progress Fisik</span>
                          <span style={{ fontSize: 11, fontWeight: 700, color: progressColor }}>{sc.progress_pct_done.toFixed(0)}%</span>
                        </div>
                        <div style={{ height: 6, borderRadius: 6, background: C.border, overflow: "hidden" }}>
                          <div style={{ height: "100%", borderRadius: 6, background: progressColor, width: `${sc.progress_pct_done}%`, transition: "width 0.3s" }} />
                        </div>
                      </div>

                      {/* Budget vs aktual (C2) */}
                      {sc.borongan_value && sc.borongan_value > 0 && (
                        <div>
                          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                            <span style={{ fontSize: 11, color: C.muted, fontWeight: 500 }}>Serapan Anggaran</span>
                            <span style={{ fontSize: 11, fontWeight: 700, color: budgetColor }}>{budgetPct.toFixed(0)}%</span>
                          </div>
                          <div style={{ height: 6, borderRadius: 6, background: C.border, overflow: "hidden", marginBottom: 6 }}>
                            <div style={{ height: "100%", borderRadius: 6, background: budgetColor, width: `${budgetPct}%`, transition: "width 0.3s" }} />
                          </div>
                          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 6 }}>
                            {[
                              { label: "Sudah Dibayar", value: fmt(sc.total_paid), color: C.text },
                              { label: "Sisa Anggaran", value: sisa !== null ? fmt(Math.max(sisa, 0)) : "—", color: sisa !== null && sisa < 0 ? C.red : C.green },
                              { label: "Status", value: budgetPct > 90 ? "Kritis" : budgetPct > 70 ? "Waspada" : "Aman", color: budgetColor },
                            ].map((b, j) => (
                              <div key={j} style={{ background: "var(--surface)", borderRadius: 6, padding: "6px 8px", border: `1px solid ${C.border}` }}>
                                <div style={{ fontSize: 10, color: C.muted, marginBottom: 2 }}>{b.label}</div>
                                <div style={{ fontSize: 12, fontWeight: 700, color: b.color }}>{b.value}</div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Section: Riwayat Laporan Upah */}
          <div style={card}>
            <div style={{ padding: "16px 20px", borderBottom: `1px solid ${C.border}`, display: "flex", alignItems: "center", gap: 8 }}>
              <Calendar size={16} color={C.navy} />
              <span style={{ fontSize: 15, fontWeight: 700, color: C.text }}>Riwayat Laporan Upah</span>
              <span style={{ fontSize: 12, color: C.muted, marginLeft: "auto" }}>10 terbaru</span>
            </div>
            {reports.length === 0 ? (
              <div style={{ padding: "32px 20px", textAlign: "center", color: C.muted, fontSize: 13 }}>Belum ada laporan upah</div>
            ) : (
              <div>
                {reports.map((r, idx) => {
                  const st = getWageStatusBadge(r.status);
                  const isLast = idx === reports.length - 1;
                  return (
                    <div key={r.id} style={{ padding: "12px 20px", borderBottom: isLast ? "none" : `1px solid ${C.border}`, display: "flex", alignItems: "center", gap: 12 }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 3, flexWrap: "wrap" }}>
                          <span style={{ fontSize: 13, fontWeight: 600, color: C.text }}>{r.scope?.scope_name ?? "—"}</span>
                          <span style={{ fontSize: 10, fontWeight: 600, padding: "2px 6px", borderRadius: 6, background: st.bg, color: st.color, border: `1px solid ${st.border}`, display: "flex", alignItems: "center", gap: 2 }}>
                            {st.icon} {st.label}
                          </span>
                        </div>
                        <div style={{ fontSize: 11, color: C.muted }}>
                          {r.assignment?.project?.name ?? "—"} · {fmtDateShort(r.week_start)} – {fmtDateShort(r.week_end)}
                          {r.payment_method && <span style={{ marginLeft: 8 }}>· {r.payment_method === "cash" ? "Cash" : "Transfer"}</span>}
                        </div>
                      </div>
                      <div style={{ textAlign: "right", flexShrink: 0 }}>
                        <div style={{ fontSize: 13, fontWeight: 700, color: C.navy }}>{fmt(r.net_amount)}</div>
                        {r.paid_at && <div style={{ fontSize: 11, color: C.muted }}>{fmtDate(r.paid_at)}</div>}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Sidebar kanan: Kasbon Aktif */}
        <div style={card}>
          <div style={{ padding: "16px 20px", borderBottom: `1px solid ${C.border}`, display: "flex", alignItems: "center", gap: 8 }}>
            <AlertTriangle size={16} color={C.red} />
            <span style={{ fontSize: 15, fontWeight: 700, color: C.text }}>Kasbon Tukang Aktif</span>
            <span style={{ fontSize: 12, fontWeight: 600, padding: "0px 8px", borderRadius: 10, background: C.redBg, color: C.red, marginLeft: "auto" }}>
              {kasbons.length}
            </span>
          </div>
          {kasbons.length === 0 ? (
            <div style={{ padding: "32px 20px", textAlign: "center", color: C.muted, fontSize: 13 }}>Tidak ada kasbon aktif</div>
          ) : (
            <div>
              {kasbons.map((k, idx) => {
                const remaining = k.amount - k.amount_settled;
                const pct = k.amount > 0 ? (k.amount_settled / k.amount) * 100 : 0;
                const isLast = idx === kasbons.length - 1;
                const purposeLabel: Record<string, string> = {
                  gaji_tukang: "Gaji", uang_makan: "Makan", pembelian_alat: "Alat", operasional: "Ops", lain_lain: "Lain",
                };
                return (
                  <div key={k.id} style={{ padding: "12px 20px", borderBottom: isLast ? "none" : `1px solid ${C.border}` }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 6 }}>
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 600, color: C.text }}>{k.worker?.name ?? "—"}</div>
                        <div style={{ fontSize: 11, color: C.muted }}>
                          {purposeLabel[k.purpose] ?? k.purpose} · {fmtDate(k.kasbon_date)}
                        </div>
                      </div>
                      <div style={{ textAlign: "right" }}>
                        <div style={{ fontSize: 13, fontWeight: 700, color: C.red }}>{fmt(remaining)}</div>
                        <div style={{ fontSize: 10, color: C.muted }}>dari {fmt(k.amount)}</div>
                      </div>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <div style={{ flex: 1, height: 3, borderRadius: 0, background: C.border, overflow: "hidden" }}>
                        <div style={{ height: "100%", borderRadius: 0, background: C.yellow, width: `${pct}%` }} />
                      </div>
                      <span style={{ fontSize: 10, color: C.muted }}>{Math.round(pct)}%</span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
