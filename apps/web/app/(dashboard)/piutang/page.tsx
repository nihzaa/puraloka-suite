"use client";

// Register Piutang (PETA §3 #3) — AR aging 30/60/90 + register retensi + register
// uang muka (DP recoupment). Satu tugas halaman: menunjukkan di mana uang tertahan
// dan mana yang harus dikejar sekarang. Signature: "Spektrum Umur Piutang" —
// bar proporsional per bucket dengan ramp urgensi, klik segmen = filter tabel.

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api";
import {
  RefreshCw, Landmark, HandCoins, AlertTriangle, Receipt, ShieldAlert,
} from "lucide-react";

const C = {
  navy: "var(--navy)", navyLight: "var(--navy-light)",
  text: "var(--text-primary)", mid: "var(--text-secondary)", muted: "var(--text-muted)",
  border: "var(--border)",
  red: "var(--danger)", redBg: "var(--danger-bg)", redBorder: "var(--danger-border)",
  yellow: "var(--warning)", yellowBg: "var(--warning-bg)",
  blue: "var(--info)", blueBg: "var(--info-bg)", blueBorder: "var(--info-border)",
  green: "var(--success)", greenBg: "var(--success-bg)",
};

const card: React.CSSProperties = {
  background: "var(--surface)", border: "1px solid var(--border)",
  borderRadius: 14, boxShadow: "0 1px 4px rgba(0,0,0,0.06)",
};

// Ramp urgensi bucket — makin tua umur piutang, makin gelap merahnya.
const BUCKETS = [
  { key: "current", label: "Belum jatuh tempo", color: "#003366" },
  { key: "d1_30",   label: "1–30 hari",         color: "#D97706" },
  { key: "d31_60",  label: "31–60 hari",        color: "#C2410C" },
  { key: "d61_90",  label: "61–90 hari",        color: "#B91C1C" },
  { key: "d90_plus", label: ">90 hari",         color: "#7F1D1D" },
] as const;
type BucketKey = (typeof BUCKETS)[number]["key"];

interface AgingRow {
  id: string; invoice_number: string; invoice_type: string;
  issued_date: string; due_date: string; total_amount: number; amount_due: number;
  status: string; days_past_due: number; bucket: BucketKey;
  project: { id: string; name: string } | null;
  client: { id: string; name: string } | null;
}
interface AgingData {
  as_of: string; buckets: Record<BucketKey, number>;
  total_outstanding: number; invoice_count: number; rows: AgingRow[];
}
interface RetentionRow {
  project: { id: string; name: string; status: string; end_date: string | null };
  client: { id: string; name: string } | null;
  retention_pct: number | null; withheld: number; released: number; outstanding: number;
  on_retention_termins: { id: string; label: string; amount: number; status: string; due_days: number | null }[];
  estimated_release_due: string | null; is_due_estimate: boolean;
}
interface DpRow {
  project: { id: string; name: string; status: string; contract_value: number };
  client: { id: string; name: string } | null;
  dp_billed: number; dp_paid: number; recouped: number; remaining_to_recoup: number;
}

const fmt = (n: number) =>
  new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(n);
const fmtDate = (d: string) =>
  new Date(d).toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" });

const INVOICE_TYPE_LABEL: Record<string, string> = {
  termin_billing: "Termin", commission_billing: "Komisi", expense_billing: "Pengeluaran",
  commission_fee: "Fee Komisi", retention_release: "Pencairan Retensi",
};

export default function PiutangPage() {
  const [aging, setAging] = useState<AgingData | null>(null);
  const [retention, setRetention] = useState<RetentionRow[] | null>(null);
  const [dp, setDp] = useState<DpRow[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [forbidden, setForbidden] = useState(false);
  const [bucketFilter, setBucketFilter] = useState<BucketKey | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    Promise.all([
      api.get<AgingData>("/api/v1/finance/ar-aging"),
      api.get<{ rows: RetentionRow[] }>("/api/v1/finance/retention-register"),
      api.get<{ rows: DpRow[] }>("/api/v1/finance/dp-register"),
    ])
      .then(([a, r, d]) => { setAging(a.data); setRetention(r.data.rows); setDp(d.data.rows); })
      .catch((err: unknown) => {
        if ((err as { response?: { status?: number } })?.response?.status === 403) setForbidden(true);
      })
      .finally(() => setLoading(false));
  }, []);
  useEffect(() => { load(); }, [load]);

  const overdueTotal = useMemo(() => {
    if (!aging) return 0;
    return aging.buckets.d1_30 + aging.buckets.d31_60 + aging.buckets.d61_90 + aging.buckets.d90_plus;
  }, [aging]);

  const filteredRows = useMemo(() => {
    if (!aging) return [];
    return bucketFilter ? aging.rows.filter(r => r.bucket === bucketFilter) : aging.rows;
  }, [aging, bucketFilter]);

  const retentionOutstandingTotal = (retention ?? []).reduce((s, r) => s + r.outstanding, 0);
  const dpRemainingTotal = (dp ?? []).reduce((s, r) => s + r.remaining_to_recoup, 0);

  const th: React.CSSProperties = { padding: "9px 14px", fontSize: 11, fontWeight: 700, color: C.mid, textAlign: "left", textTransform: "uppercase", letterSpacing: "0.05em", whiteSpace: "nowrap" };
  const td: React.CSSProperties = { padding: "10px 14px", fontSize: 13, color: C.text, borderTop: `1px solid ${C.border}`, whiteSpace: "nowrap" };
  const sectionTitle: React.CSSProperties = { fontFamily: "var(--font-display)", fontSize: 15, fontWeight: 700, color: C.text, display: "flex", alignItems: "center", gap: 8 };

  if (forbidden) {
    return (
      <div style={{ ...card, padding: 40, textAlign: "center", margin: 24 }}>
        <ShieldAlert size={28} style={{ color: C.muted, marginBottom: 10 }} />
        <div style={{ fontSize: 14, fontWeight: 600, color: C.text }}>Butuh akses data finansial</div>
        <div style={{ fontSize: 13, color: C.mid, marginTop: 4 }}>Halaman ini memerlukan permission finance:view:all. Hubungi admin untuk mendapat akses.</div>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      {/* ── Header ── */}
      <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <div>
          <h1 style={{ fontFamily: "var(--font-display)", fontSize: 22, fontWeight: 800, color: C.text, letterSpacing: "-0.4px", margin: 0 }}>
            Register Piutang
          </h1>
          <div style={{ fontSize: 13, color: C.mid, marginTop: 3 }}>
            Umur tagihan, retensi tertahan, dan uang muka yang belum dipotong
            {aging && <> · per {fmtDate(aging.as_of)}</>}
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <div style={{ textAlign: "right" }}>
            <div style={{ fontSize: 11, color: C.muted, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em" }}>Total Piutang Berjalan</div>
            <div style={{ fontFamily: "var(--font-display)", fontSize: 20, fontWeight: 800, color: C.navy }}>{aging ? fmt(aging.total_outstanding) : "—"}</div>
          </div>
          <button onClick={load} disabled={loading} title="Muat ulang"
            style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 12px", borderRadius: 8, border: `1px solid ${C.border}`, background: "var(--surface)", color: C.mid, fontSize: 13, cursor: "pointer" }}>
            <RefreshCw size={14} style={loading ? { animation: "spin 1s linear infinite" } : undefined} /> Muat ulang
          </button>
        </div>
      </div>

      {/* ── Spektrum Umur Piutang (signature) ── */}
      <div style={{ ...card, padding: "18px 20px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <div style={sectionTitle}><Receipt size={16} style={{ color: C.navy }} /> Spektrum Umur Piutang</div>
          {overdueTotal > 0 && (
            <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, fontWeight: 600, color: C.red }}>
              <AlertTriangle size={13} /> {fmt(overdueTotal)} lewat jatuh tempo
            </div>
          )}
        </div>

        {aging && aging.total_outstanding > 0 ? (
          <>
            <div style={{ display: "flex", width: "100%", height: 34, borderRadius: 8, overflow: "hidden", border: `1px solid ${C.border}` }}>
              {BUCKETS.map(b => {
                const amount = aging.buckets[b.key];
                if (amount <= 0) return null;
                const pct = (amount / aging.total_outstanding) * 100;
                const active = bucketFilter === null || bucketFilter === b.key;
                return (
                  <button key={b.key}
                    onClick={() => setBucketFilter(bucketFilter === b.key ? null : b.key)}
                    title={`${b.label}: ${fmt(amount)}`}
                    style={{
                      width: `${pct}%`, minWidth: 14, border: "none", cursor: "pointer",
                      background: b.color, opacity: active ? 1 : 0.25,
                      transition: "opacity 0.15s",
                    }}
                    aria-label={`Filter bucket ${b.label}`}
                  />
                );
              })}
            </div>
            <div style={{ display: "flex", gap: 10, marginTop: 12, flexWrap: "wrap" }}>
              {BUCKETS.map(b => {
                const amount = aging.buckets[b.key];
                const selected = bucketFilter === b.key;
                return (
                  <button key={b.key} onClick={() => setBucketFilter(selected ? null : b.key)}
                    style={{
                      display: "flex", alignItems: "center", gap: 8, padding: "7px 12px",
                      borderRadius: 8, cursor: "pointer", fontSize: 12,
                      border: selected ? `1.5px solid ${b.color}` : `1px solid ${C.border}`,
                      background: selected ? "var(--surface-hover)" : "var(--surface)",
                    }}>
                    <span style={{ width: 10, height: 10, borderRadius: 3, background: b.color, flexShrink: 0 }} />
                    <span style={{ color: C.mid }}>{b.label}</span>
                    <b style={{ color: amount > 0 ? C.text : C.muted, fontFamily: "var(--font-display)" }}>{fmt(amount)}</b>
                  </button>
                );
              })}
            </div>
          </>
        ) : (
          <div style={{ padding: "22px 0", fontSize: 13, color: C.mid }}>
            {loading ? "Memuat data piutang…" : "Tidak ada piutang berjalan — semua invoice sudah lunas. Invoice baru akan muncul di sini begitu diterbitkan."}
          </div>
        )}
      </div>

      {/* ── Tabel invoice terbuka ── */}
      <div style={{ ...card, overflow: "hidden" }}>
        <div style={{ padding: "14px 20px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={sectionTitle}>
            Invoice Belum Lunas
            {bucketFilter && (
              <span style={{ fontSize: 12, fontWeight: 500, color: C.mid }}>
                — {BUCKETS.find(b => b.key === bucketFilter)?.label}
                <button onClick={() => setBucketFilter(null)} style={{ marginLeft: 8, border: "none", background: "none", color: C.blue, fontSize: 12, cursor: "pointer", padding: 0 }}>hapus filter</button>
              </span>
            )}
          </div>
          <span style={{ fontSize: 12, color: C.muted }}>{filteredRows.length} invoice</span>
        </div>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead><tr style={{ background: "var(--bg)" }}>
              <th style={th}>Invoice</th><th style={th}>Proyek</th><th style={th}>Klien</th>
              <th style={th}>Jatuh Tempo</th><th style={{ ...th, textAlign: "right" }}>Umur</th>
              <th style={th}>Bucket</th><th style={{ ...th, textAlign: "right" }}>Sisa Tagihan</th>
            </tr></thead>
            <tbody>
              {filteredRows.map(r => {
                const b = BUCKETS.find(x => x.key === r.bucket)!;
                return (
                  <tr key={r.id}>
                    <td style={td}>
                      <div style={{ fontWeight: 600 }}>{r.invoice_number}</div>
                      <div style={{ fontSize: 11, color: C.muted }}>{INVOICE_TYPE_LABEL[r.invoice_type] ?? r.invoice_type}</div>
                    </td>
                    <td style={td}>{r.project?.name ?? "—"}</td>
                    <td style={td}>{r.client?.name ?? "—"}</td>
                    <td style={td}>{fmtDate(r.due_date)}</td>
                    <td style={{ ...td, textAlign: "right", color: r.days_past_due > 0 ? C.red : C.mid }}>
                      {r.days_past_due > 0 ? `${r.days_past_due} hari` : "belum"}
                    </td>
                    <td style={td}>
                      <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12 }}>
                        <span style={{ width: 9, height: 9, borderRadius: 3, background: b.color }} />{b.label}
                      </span>
                    </td>
                    <td style={{ ...td, textAlign: "right", fontWeight: 700 }}>{fmt(r.amount_due)}</td>
                  </tr>
                );
              })}
              {!loading && filteredRows.length === 0 && (
                <tr><td colSpan={7} style={{ ...td, textAlign: "center", color: C.mid, padding: "26px 14px" }}>
                  {bucketFilter ? "Tidak ada invoice di bucket ini." : "Tidak ada invoice terbuka."}
                </td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Register Retensi + Register Uang Muka ── */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(420px, 1fr))", gap: 18 }}>
        {/* Retensi */}
        <div style={{ ...card, overflow: "hidden" }}>
          <div style={{ padding: "14px 20px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div style={sectionTitle}><Landmark size={16} style={{ color: C.navy }} /> Register Retensi</div>
            <div style={{ fontSize: 12, color: C.mid }}>Tertahan: <b style={{ color: C.text }}>{fmt(retentionOutstandingTotal)}</b></div>
          </div>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead><tr style={{ background: "var(--bg)" }}>
                <th style={th}>Proyek</th><th style={{ ...th, textAlign: "right" }}>Ditahan</th>
                <th style={{ ...th, textAlign: "right" }}>Dicairkan</th><th style={{ ...th, textAlign: "right" }}>Sisa</th>
                <th style={th}>Estimasi Cair</th>
              </tr></thead>
              <tbody>
                {(retention ?? []).map(r => (
                  <tr key={r.project.id}>
                    <td style={td}>
                      <div style={{ fontWeight: 600 }}>{r.project.name}</div>
                      <div style={{ fontSize: 11, color: C.muted }}>{r.client?.name ?? "—"}{r.retention_pct ? ` · retensi ${r.retention_pct}%` : ""}</div>
                    </td>
                    <td style={{ ...td, textAlign: "right" }}>{fmt(r.withheld)}</td>
                    <td style={{ ...td, textAlign: "right", color: C.green }}>{r.released > 0 ? fmt(r.released) : "—"}</td>
                    <td style={{ ...td, textAlign: "right", fontWeight: 700 }}>{fmt(r.outstanding)}</td>
                    <td style={td}>
                      {r.estimated_release_due ? (
                        <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12, color: r.is_due_estimate ? C.red : C.mid, fontWeight: r.is_due_estimate ? 700 : 400 }}>
                          {r.is_due_estimate && <AlertTriangle size={12} />}
                          {fmtDate(r.estimated_release_due)}{r.is_due_estimate ? " — siap ditagih" : ""}
                        </span>
                      ) : <span style={{ fontSize: 12, color: C.muted }}>—</span>}
                    </td>
                  </tr>
                ))}
                {!loading && (retention ?? []).length === 0 && (
                  <tr><td colSpan={5} style={{ ...td, textAlign: "center", color: C.mid, padding: "26px 14px" }}>
                    Belum ada retensi tercatat. Retensi muncul saat invoice memakai potongan retensi.
                  </td></tr>
                )}
              </tbody>
            </table>
          </div>
          <div style={{ padding: "8px 20px 12px", fontSize: 11, color: C.muted }}>
            Estimasi cair = tanggal selesai proyek + hari retensi termin (bukan tanggal resmi — BAST formal belum dicatat sistem).
          </div>
        </div>

        {/* Uang Muka */}
        <div style={{ ...card, overflow: "hidden" }}>
          <div style={{ padding: "14px 20px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div style={sectionTitle}><HandCoins size={16} style={{ color: C.navy }} /> Register Uang Muka (DP)</div>
            <div style={{ fontSize: 12, color: C.mid }}>Belum dipotong: <b style={{ color: C.text }}>{fmt(dpRemainingTotal)}</b></div>
          </div>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead><tr style={{ background: "var(--bg)" }}>
                <th style={th}>Proyek</th><th style={{ ...th, textAlign: "right" }}>DP Terbayar</th>
                <th style={{ ...th, textAlign: "right" }}>Sudah Dipotong</th><th style={th}>Progres Pemotongan</th>
              </tr></thead>
              <tbody>
                {(dp ?? []).map(r => {
                  const pct = r.dp_paid > 0 ? Math.min((r.recouped / r.dp_paid) * 100, 100) : 0;
                  return (
                    <tr key={r.project.id}>
                      <td style={td}>
                        <div style={{ fontWeight: 600 }}>{r.project.name}</div>
                        <div style={{ fontSize: 11, color: C.muted }}>{r.client?.name ?? "—"}</div>
                      </td>
                      <td style={{ ...td, textAlign: "right" }}>{fmt(r.dp_paid)}</td>
                      <td style={{ ...td, textAlign: "right" }}>{fmt(r.recouped)}</td>
                      <td style={{ ...td, minWidth: 160 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <div style={{ flex: 1, height: 7, borderRadius: 4, background: "var(--surface-hover)", overflow: "hidden" }}>
                            <div style={{ width: `${pct}%`, height: "100%", background: pct >= 100 ? C.green : C.navy, borderRadius: 4 }} />
                          </div>
                          <span style={{ fontSize: 11, fontWeight: 700, color: r.remaining_to_recoup > 0 ? C.text : C.green, whiteSpace: "nowrap" }}>
                            {r.remaining_to_recoup > 0 ? `sisa ${fmt(r.remaining_to_recoup)}` : "selesai"}
                          </span>
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {!loading && (dp ?? []).length === 0 && (
                  <tr><td colSpan={4} style={{ ...td, textAlign: "center", color: C.mid, padding: "26px 14px" }}>
                    Belum ada uang muka tercatat. DP muncul saat termin on_sign ditagih, dan dipotong lewat form invoice termin.
                  </td></tr>
                )}
              </tbody>
            </table>
          </div>
          <div style={{ padding: "8px 20px 12px", fontSize: 11, color: C.muted }}>
            Sisa DP dipotong dari invoice termin berikutnya lewat form Buat Invoice di halaman Keuangan.
          </div>
        </div>
      </div>
    </div>
  );
}
