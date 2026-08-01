"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { ClipboardList, Plus, Trash2, CheckCircle, Clock, XCircle } from "lucide-react";

const C = {
  navy: "var(--navy)", navyLight: "var(--navy-light)",
  text: "var(--text-primary)", mid: "var(--text-secondary)", muted: "var(--text-muted)",
  border: "var(--border)", bg: "var(--bg)", surface: "var(--surface)",
  green: "var(--success)", greenBg: "var(--success-bg)",
  yellow: "var(--warning)", yellowBg: "var(--warning-bg)",
  red: "var(--danger)", redBg: "var(--danger-bg)",
};

function fmt(n: number) {
  return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(n);
}
function fmtDate(s: string | null) {
  if (!s) return "—";
  return new Date(s).toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric" });
}

const STATUS_META: Record<string, { label: string; color: string; bg: string; icon: any }> = {
  submitted: { label: "Menunggu", color: C.yellow, bg: C.yellowBg, icon: Clock },
  approved:  { label: "Disetujui", color: C.green,  bg: C.greenBg,  icon: CheckCircle },
  rejected:  { label: "Ditolak",   color: C.red,    bg: C.redBg,    icon: XCircle },
  paid:      { label: "Dibayar",   color: C.green,  bg: C.greenBg,  icon: CheckCircle },
};

interface Assignment {
  id: string;
  project: { id: string; name: string };
  work_scopes: Array<{ id: string; scope_name: string; payment_system: string }>;
}

interface Worker {
  id: string;
  name: string;
  phone: string | null;
}

interface WageRow {
  worker_name: string;
  worker_id?: string;
  days_worked: number;
  daily_rate: number;
  overtime_hours: number;
  overtime_rate: number;
}

export default function LaporanUpahPage() {
  const [tab, setTab] = useState<"riwayat" | "buat">("riwayat");
  const [reports, setReports] = useState<any[]>([]);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [workers, setWorkers] = useState<Worker[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null);

  // Form state
  const [selectedAssignment, setSelectedAssignment] = useState("");
  const [selectedScope, setSelectedScope] = useState("");
  const [weekStart, setWeekStart] = useState("");
  const [notes, setNotes] = useState("");
  const [rows, setRows] = useState<WageRow[]>([{ worker_name: "", days_worked: 0, daily_rate: 0, overtime_hours: 0, overtime_rate: 0 }]);

  useEffect(() => {
    Promise.all([
      api.get("/api/v1/mandor/wage-reports"),
      api.get("/api/v1/mandor/assignments"),
      api.get("/api/v1/mandor/workers"),
    ]).then(([rRes, aRes, wRes]) => {
      const rpts = rRes.data?.reports ?? [];
      // Filter hanya scope harian
      setReports(rpts.filter((r: any) => r.scope?.payment_system === "harian"));
      const asgns = (aRes.data?.assignments ?? []).filter((a: any) =>
        (a.work_scopes ?? []).some((s: any) => s.payment_system === "harian")
      );
      setAssignments(asgns);
      setWorkers(wRes.data?.workers ?? []);
    }).finally(() => setLoading(false));
  }, []);

  const scopesForAssignment = assignments
    .find((a) => a.id === selectedAssignment)
    ?.work_scopes.filter((s) => s.payment_system === "harian") ?? [];

  function addRow() {
    setRows((r) => [...r, { worker_name: "", days_worked: 0, daily_rate: 0, overtime_hours: 0, overtime_rate: 0 }]);
  }
  function removeRow(i: number) {
    setRows((r) => r.filter((_, idx) => idx !== i));
  }
  function updateRow(i: number, field: keyof WageRow, value: string | number) {
    setRows((r) => r.map((row, idx) => idx === i ? { ...row, [field]: value } : row));
  }

  const total = rows.reduce((s, r) => s + (r.days_worked * r.daily_rate) + (r.overtime_hours * r.overtime_rate), 0);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedAssignment || !selectedScope || !weekStart || rows.length === 0) {
      setToast({ msg: "Lengkapi semua field wajib", ok: false });
      return;
    }
    const validRows = rows.filter((r) => r.worker_name.trim() && r.days_worked > 0 && r.daily_rate > 0);
    if (validRows.length === 0) {
      setToast({ msg: "Minimal satu tukang dengan hari kerja dan tarif", ok: false });
      return;
    }
    setSubmitting(true);
    try {
      await api.post("/api/v1/mandor/wage-reports", {
        assignment_id: selectedAssignment,
        scope_id: selectedScope,
        week_start: weekStart,
        notes: notes || undefined,
        items: validRows,
      });
      setToast({ msg: "Laporan upah berhasil dikirim", ok: true });
      setTab("riwayat");
      // Refresh
      const res = await api.get("/api/v1/mandor/wage-reports");
      setReports((res.data?.reports ?? []).filter((r: any) => r.scope?.payment_system === "harian"));
      // Reset form
      setSelectedAssignment(""); setSelectedScope(""); setWeekStart(""); setNotes("");
      setRows([{ worker_name: "", days_worked: 0, daily_rate: 0, overtime_hours: 0, overtime_rate: 0 }]);
    } catch (err: any) {
      setToast({ msg: err.response?.data?.error ?? "Gagal mengirim laporan", ok: false });
    } finally {
      setSubmitting(false);
    }
  }

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
          padding: "12px 20px", borderRadius: 10, fontSize: 14, fontWeight: 500,
          boxShadow: "0 4px 16px rgba(0,0,0,0.1)",
          textAlign: "left",
        }}>
          {toast.msg}
        </button>
        </div>
      )}

      <div style={{ marginBottom: 20 }}>
        <h1 style={{ fontSize: 20, fontWeight: 700, color: C.text, margin: 0 }}>Laporan Upah</h1>
        <p style={{ fontSize: 13, color: C.mid, margin: "4px 0 0" }}>Kirim dan lihat riwayat laporan upah mingguan</p>
      </div>

      {/* Tab switcher */}
      <div style={{ display: "flex", gap: 4, marginBottom: 20, background: "var(--surface-hover)", borderRadius: 10, padding: 4 }}>
        {(["riwayat", "buat"] as const).map((t) => (
          <button key={t} onClick={() => setTab(t)} style={{
            flex: 1, padding: "8px 16px", borderRadius: 8, border: "none", cursor: "pointer",
            background: tab === t ? "var(--surface)" : "transparent",
            color: tab === t ? C.navy : C.mid,
            fontWeight: tab === t ? 600 : 400, fontSize: 13,
            boxShadow: tab === t ? "0 1px 4px rgba(0,0,0,0.08)" : "none",
            transition: "all 0.15s",
          }}>
            {t === "riwayat" ? "Riwayat Laporan" : "Buat Laporan"}
          </button>
        ))}
      </div>

      {/* RIWAYAT TAB */}
      {tab === "riwayat" && (
        <div>
          {loading && <div style={{ textAlign: "center", padding: 40, color: C.mid }}>Memuat...</div>}
          {!loading && reports.length === 0 && (
            <div style={{ background: C.surface, borderRadius: 12, padding: 40, border: `1px solid ${C.border}`, textAlign: "center" }}>
              <ClipboardList size={28} color={C.muted} style={{ marginBottom: 8 }} />
              <div style={{ fontSize: 14, color: C.mid }}>Belum ada laporan upah</div>
              <button onClick={() => setTab("buat")} style={{
                marginTop: 12, padding: "8px 20px", borderRadius: 8, border: "none",
                background: C.navy, color: "var(--surface)", cursor: "pointer", fontSize: 13, fontWeight: 600,
              }}>Buat Laporan Pertama</button>
            </div>
          )}
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {reports.map((r) => {
              const meta = STATUS_META[r.status] ?? STATUS_META.submitted;
              const Icon = meta.icon;
              return (
                <div key={r.id} style={{
                  background: C.surface, borderRadius: 12, padding: "14px 16px",
                  border: `1px solid ${C.border}`, boxShadow: "0 1px 3px rgba(0,0,0,0.04)",
                }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                    <div>
                      <div style={{ fontSize: 14, fontWeight: 600, color: C.text }}>
                        {r.scope?.scope_name ?? "—"}
                      </div>
                      <div style={{ fontSize: 12, color: C.mid, marginTop: 2 }}>
                        {r.assignment?.project?.name ?? "—"} · {fmtDate(r.week_start)} – {fmtDate(r.week_end)}
                      </div>
                    </div>
                    <span style={{ fontSize: 11, fontWeight: 600, padding: "3px 10px", borderRadius: 20, color: meta.color, background: meta.bg, display: "flex", alignItems: "center", gap: 4 }}>
                      <Icon size={11} /> {meta.label}
                    </span>
                  </div>
                  <div style={{ marginTop: 10, display: "flex", gap: 16 }}>
                    <div style={{ fontSize: 12, color: C.mid }}>
                      Subtotal: <span style={{ fontWeight: 600, color: C.text }}>{fmt(r.subtotal ?? 0)}</span>
                    </div>
                    <div style={{ fontSize: 12, color: C.mid }}>
                      Potongan: <span style={{ fontWeight: 600, color: C.red }}>−{fmt(r.total_deduction ?? 0)}</span>
                    </div>
                    <div style={{ fontSize: 12, color: C.mid }}>
                      Bersih: <span style={{ fontWeight: 700, color: C.green }}>{fmt(r.net_amount ?? 0)}</span>
                    </div>
                  </div>
                  {r.review_notes && (
                    <div style={{ marginTop: 8, fontSize: 12, color: C.mid, background: C.redBg, borderRadius: 6, padding: "6px 10px" }}>
                      Catatan: {r.review_notes}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* BUAT LAPORAN TAB */}
      {tab === "buat" && (
        <form onSubmit={handleSubmit}>
          <div style={{ background: C.surface, borderRadius: 12, padding: 20, border: `1px solid ${C.border}`, display: "flex", flexDirection: "column", gap: 16 }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              {/* Proyek */}
              <div>
                <label htmlFor="selected-assignment" style={{ fontSize: 12, fontWeight: 600, color: C.text, display: "block", marginBottom: 6 }}>Proyek *</label>
                <select id="selected-assignment" aria-label="Pilih proyek" value={selectedAssignment} onChange={(e) => { setSelectedAssignment(e.target.value); setSelectedScope(""); }}
                  style={{ width: "100%", padding: "8px 10px", borderRadius: 8, border: `1px solid ${C.border}`, fontSize: 13, background: "var(--surface)" }}>
                  <option value="">Pilih proyek...</option>
                  {assignments.map((a) => (
                    <option key={a.id} value={a.id}>{a.project.name}</option>
                  ))}
                </select>
              </div>
              {/* Scope */}
              <div>
                <label htmlFor="selected-scope" style={{ fontSize: 12, fontWeight: 600, color: C.text, display: "block", marginBottom: 6 }}>Scope Pekerjaan *</label>
                <select id="selected-scope" aria-label="Pilih lingkup pekerjaan" value={selectedScope} onChange={(e) => setSelectedScope(e.target.value)}
                  disabled={!selectedAssignment}
                  style={{ width: "100%", padding: "8px 10px", borderRadius: 8, border: `1px solid ${C.border}`, fontSize: 13, background: "var(--surface)", opacity: selectedAssignment ? 1 : 0.5 }}>
                  <option value="">Pilih scope...</option>
                  {scopesForAssignment.map((s) => (
                    <option key={s.id} value={s.id}>{s.scope_name}</option>
                  ))}
                </select>
              </div>
              {/* Minggu */}
              <div>
                <label htmlFor="week-start" style={{ fontSize: 12, fontWeight: 600, color: C.text, display: "block", marginBottom: 6 }}>Tanggal Mulai Minggu (Senin) *</label>
                <input id="week-start" aria-label="Tanggal mulai" type="date" value={weekStart} onChange={(e) => setWeekStart(e.target.value)}
                  style={{ width: "100%", padding: "8px 10px", borderRadius: 8, border: `1px solid ${C.border}`, fontSize: 13 }} />
              </div>
              {/* Catatan */}
              <div>
                <label htmlFor="notes" style={{ fontSize: 12, fontWeight: 600, color: C.text, display: "block", marginBottom: 6 }}>Catatan</label>
                <input id="notes" type="text" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Opsional"
                  style={{ width: "100%", padding: "8px 10px", borderRadius: 8, border: `1px solid ${C.border}`, fontSize: 13 }} />
              </div>
            </div>

            {/* Tabel tukang */}
            <div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                <span style={{ fontSize: 12, fontWeight: 600, color: C.text }}>Detail Tukang *</span>
                <button type="button" onClick={addRow} style={{
                  display: "flex", alignItems: "center", gap: 4, padding: "5px 12px", borderRadius: 6,
                  border: `1px solid ${C.navy}`, background: C.navyLight, color: C.navy, fontSize: 12, fontWeight: 600, cursor: "pointer",
                }}>
                  <Plus size={13} /> Tambah Baris
                </button>
              </div>

              {/* Header */}
              <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr 1fr 1fr 32px", gap: 6, marginBottom: 6 }}>
                {["Nama Tukang", "Hari Kerja", "Tarif/Hari", "Lembur (jam)", "Tarif Lembur", ""].map((h) => (
                  <div key={h} style={{ fontSize: 11, fontWeight: 600, color: C.mid }}>{h}</div>
                ))}
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {rows.map((row, i) => (
                  <div key={i} style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr 1fr 1fr 32px", gap: 6, alignItems: "center" }}>
                    <div style={{ position: "relative" }}>
                      <input
                        value={row.worker_name}
                        onChange={(e) => updateRow(i, "worker_name", e.target.value)}
                        placeholder="Nama tukang"
                        list={`workers-list-${i}`}
                        style={{ width: "100%", padding: "7px 10px", borderRadius: 7, border: `1px solid ${C.border}`, fontSize: 13 }}
                      />
                      <datalist id={`workers-list-${i}`}>
                        {workers.map((w) => <option key={w.id} value={w.name} />)}
                      </datalist>
                    </div>
                    <input type="number" min="0" max="7" step="0.5" value={row.days_worked || ""} onChange={(e) => updateRow(i, "days_worked", Number(e.target.value))}
                      placeholder="0" style={{ padding: "7px 8px", borderRadius: 7, border: `1px solid ${C.border}`, fontSize: 13, textAlign: "right" }} />
                    <input type="number" min="0" value={row.daily_rate || ""} onChange={(e) => updateRow(i, "daily_rate", Number(e.target.value))}
                      placeholder="0" style={{ padding: "7px 8px", borderRadius: 7, border: `1px solid ${C.border}`, fontSize: 13, textAlign: "right" }} />
                    <input type="number" min="0" value={row.overtime_hours || ""} onChange={(e) => updateRow(i, "overtime_hours", Number(e.target.value))}
                      placeholder="0" style={{ padding: "7px 8px", borderRadius: 7, border: `1px solid ${C.border}`, fontSize: 13, textAlign: "right" }} />
                    <input type="number" min="0" value={row.overtime_rate || ""} onChange={(e) => updateRow(i, "overtime_rate", Number(e.target.value))}
                      placeholder="0" style={{ padding: "7px 8px", borderRadius: 7, border: `1px solid ${C.border}`, fontSize: 13, textAlign: "right" }} />
                    <button type="button" aria-label="Hapus baris tukang ini dari laporan" onClick={() => removeRow(i)} disabled={rows.length === 1}
                      style={{ width: 28, height: 28, borderRadius: 6, border: `1px solid ${C.border}`, background: "var(--surface)", cursor: rows.length === 1 ? "default" : "pointer", display: "flex", alignItems: "center", justifyContent: "center", opacity: rows.length === 1 ? 0.3 : 1 }}>
                      <Trash2 size={13} color={C.red} />
                    </button>
                  </div>
                ))}
              </div>
            </div>

            {/* Total */}
            <div style={{ borderTop: `1px solid ${C.border}`, paddingTop: 12, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontSize: 13, color: C.mid }}>Total Upah</span>
              <span style={{ fontSize: 18, fontWeight: 700, color: C.navy }}>{fmt(total)}</span>
            </div>

            <button type="submit" disabled={submitting} style={{
              padding: "11px 24px", borderRadius: 10, border: "none",
              background: submitting ? C.mid : C.navy, color: "var(--surface)",
              fontSize: 14, fontWeight: 600, cursor: submitting ? "wait" : "pointer",
            }}>
              {submitting ? "Mengirim..." : "Kirim Laporan"}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
