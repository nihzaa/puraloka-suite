"use client";

// ============================================================================
// Laporan Upah — riwayat laporan upah mingguan (harian) + form kirim baru.
//
// Restyle F7d (2026-08-20): warna-ui → token CSS, modal-tab lama → SegmentedTab,
// badge status → StatusBadge, kosong/loading → EmptyState/SkeletonCard.
//
// ── Grafik upah per-minggu
//
// Ditambahkan bar chart di atas daftar Riwayat: total `net_amount` per
// `week_start`, dari `reports` yang SUDAH diambil untuk daftar riwayat —
// tidak ada endpoint baru. Titik data diurutkan lama→baru (kiri→kanan).
//
// Tren periode (`KpiCard.tren`) TIDAK ditampilkan di halaman ini: laporan
// upah dikirim mandor sendiri secara tidak teratur (sekali per minggu per
// scope aktif), jadi "minggu ini vs minggu lalu" pada data yang jumlahnya
// kecil dan jarang berturut-turut lebih menyesatkan daripada informatif —
// satu minggu kosong (scope belum jalan) akan terbaca sebagai "turun 100%".
// Grafik batang mentahnya sendiri tetap ditampilkan sebagai teks tabel di
// bawahnya (lihat catatan MiniChart di komponen KpiCard/MiniChart).
// ============================================================================

import { useMemo, useState } from "react";
import { useData, invalidasi } from "@/lib/data-cache";
import { type LaporanUpah, type GalatApi, pesanGalat } from "../_bersama/tipe";
import { kirimLapangan } from "@/lib/kirim-lapangan";
import { ClipboardList, Plus, Trash2 } from "lucide-react";
import { BarChart, Bar, ResponsiveContainer, XAxis, YAxis, Tooltip, CartesianGrid } from "recharts";
import SegmentedTab from "@/components/portal/SegmentedTab";
import KepalaPortal from "@/components/portal/KepalaPortal";
import StatusBadge, { type VarianStatus } from "@/components/portal/StatusBadge";
import EmptyState from "@/components/portal/EmptyState";
import SkeletonCard from "@/components/portal/SkeletonCard";
import { Pilihan } from "@/components/pilihan";

function fmt(n: number) {
  return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(n);
}
function fmtDate(s: string | null) {
  if (!s) return "—";
  return new Date(s).toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric" });
}

const VARIAN_STATUS: Record<string, VarianStatus> = {
  submitted: "pending",
  approved: "approved",
  rejected: "rejected",
  paid: "approved",
};

const LABEL_STATUS: Record<string, string> = {
  submitted: "Menunggu",
  approved: "Disetujui",
  rejected: "Ditolak",
  paid: "Dibayar",
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
  const [submitting, setSubmitting] = useState(false);
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null);

  // Form state
  const [selectedAssignment, setSelectedAssignment] = useState("");
  const [selectedScope, setSelectedScope] = useState("");
  const [weekStart, setWeekStart] = useState("");
  const [notes, setNotes] = useState("");
  const [rows, setRows] = useState<WageRow[]>([{ worker_name: "", days_worked: 0, daily_rate: 0, overtime_hours: 0, overtime_rate: 0 }]);

  /*
    ── PINDAH KE LAPIS CACHE BERSAMA (F4-2), 2026-08-16

    Tiga GET diganti `useData`. Filter "hanya scope harian" dipindah ke
    turunan `useMemo` di bawah — sebelumnya dilakukan sekali saat data
    datang, sekarang dihitung ulang dari data mentah tiap render (murah,
    dan tetap benar setelah `muatUlang`).

    TIDAK ada cache offline di jalur BACA — `kirimLapangan` di bawah hanya
    membungkus jalur TULIS (kirim laporan upah), tidak disentuh.
  */
  const { data: dataReports, memuat: memuatReports, galat: galatMuatReports, muatUlang: muatUlangReports } =
    useData<{ reports: LaporanUpah[] }>("/api/v1/mandor/wage-reports");
  const { data: dataAssign, memuat: memuatAssign, galat: galatMuatAssign } =
    useData<{ assignments: Assignment[] }>("/api/v1/mandor/assignments");
  const { data: dataWorkers } =
    useData<{ workers: Worker[] }>("/api/v1/mandor/workers");

  const loading = memuatReports || memuatAssign;
  const galatMuat = galatMuatReports ?? galatMuatAssign;

  const reports = useMemo(
    () => (dataReports?.reports ?? []).filter((r) => r.scope?.payment_system === "harian"),
    [dataReports],
  );
  const assignments = useMemo(
    () => (dataAssign?.assignments ?? []).filter((a) =>
      (a.work_scopes ?? []).some((s) => s.payment_system === "harian")),
    [dataAssign],
  );
  const workers = dataWorkers?.workers ?? [];

  // Total upah bersih per minggu (week_start), lama→baru — sumbu data untuk
  // bar chart di atas riwayat. Dihitung dari `reports` yang sudah diambil,
  // bukan endpoint terpisah.
  const dataMingguan = useMemo(() => {
    const perMinggu = new Map<string, number>();
    for (const r of reports) {
      if (!r.week_start) continue;
      const nilai = Number(r.net_amount ?? 0);
      perMinggu.set(r.week_start, (perMinggu.get(r.week_start) ?? 0) + nilai);
    }
    return [...perMinggu.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .slice(-8)
      .map(([minggu, total]) => ({
        label: new Date(minggu).toLocaleDateString("id-ID", { day: "2-digit", month: "short" }),
        total,
      }));
  }, [reports]);

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
      // F4-3 — lewat antrean offline. Halaman ini yang paling merugikan bila
      // hilang: satu laporan bisa memuat puluhan baris tukang yang diketik
      // manual di lokasi proyek.
      const hasil = await kirimLapangan("POST", "/api/v1/mandor/wage-reports", {
        assignment_id: selectedAssignment,
        scope_id: selectedScope,
        week_start: weekStart,
        notes: notes || undefined,
        items: validRows,
      }, "Laporan upah berhasil dikirim", "Gagal mengirim laporan");

      setToast({ msg: hasil.pesan, ok: hasil.aman });
      // Baris tukang TIDAK dikosongkan bila kirimannya tak aman.
      if (!hasil.aman) return;
      setTab("riwayat");
      if (hasil.terkirim) {
        await muatUlangReports();
        invalidasi("/api/v1/mandor/wage-reports");
      }
      // Reset form
      setSelectedAssignment(""); setSelectedScope(""); setWeekStart(""); setNotes("");
      setRows([{ worker_name: "", days_worked: 0, daily_rate: 0, overtime_hours: 0, overtime_rate: 0 }]);
    } catch (err) {
      setToast({ msg: pesanGalat(err, "Gagal mengirim laporan"), ok: false });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--gap-bagian)" }}>
      {toast && (
        // Toast sebagai TOMBOL, bukan `<div onClick>`: ia memang bisa ditekan
        // (untuk menutup), jadi harus bisa difokus dan menanggapi Enter/Space.
        //
        // `role="alert"` ada di WADAHNYA, bukan di tombolnya — `alert` adalah
        // peran non-interaktif, memasangnya ke tombol MENGHAPUS makna "ini
        // bisa ditekan". Memisahkan keduanya membuat pembaca layar
        // mengumumkan pesannya begitu muncul DAN tetap tahu ia bisa ditutup.
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
        <KepalaPortal judul="Laporan Upah" />
        <p style={{ fontSize: 13, color: "var(--text-secondary)", margin: "4px 0 0" }}>
          Kirim dan lihat riwayat laporan upah mingguan
        </p>
      </div>

      <SegmentedTab
        opsi={[
          { value: "riwayat", label: "Riwayat Laporan" },
          { value: "buat", label: "Buat Laporan" },
        ]}
        aktif={tab}
        onUbah={(v) => setTab(v as typeof tab)}
      />

      {/* RIWAYAT TAB */}
      {tab === "riwayat" && (
        <div style={{ display: "flex", flexDirection: "column", gap: "var(--gap-bagian)" }}>
          {loading && (
            <>
              <SkeletonCard tinggi={140} />
              <SkeletonCard tinggi={80} />
            </>
          )}

          {!loading && galatMuat && (
            <EmptyState
              icon={ClipboardList}
              judul="Gagal memuat laporan upah"
              deskripsi={pesanGalat(galatMuat as GalatApi, "Coba muat ulang halaman ini.")}
            />
          )}

          {!loading && !galatMuat && reports.length === 0 && (
            <EmptyState
              icon={ClipboardList}
              judul="Belum ada laporan upah"
              deskripsi="Laporan upah mingguan yang Anda kirim akan muncul di sini, lengkap dengan status review dan rincian potongannya."
              aksi={{ label: "Buat Laporan Pertama", onClick: () => setTab("buat") }}
            />
          )}

          {!loading && !galatMuat && dataMingguan.length > 1 && (
            <div
              style={{
                padding: "var(--pad-kartu-lega)", borderRadius: "var(--portal-radius-card)", background: "var(--surface)",
                border: "1px solid var(--border)",
              }}
            >
              <div style={{ fontSize: 13, fontWeight: 700, color: "var(--text-primary)", marginBottom: 12 }}>
                Upah Bersih per Minggu
              </div>
              <div style={{ width: "100%", height: 140 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={dataMingguan} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                    <XAxis dataKey="label" tick={{ fontSize: 11, fill: "var(--text-secondary)" }} axisLine={false} tickLine={false} />
                    <YAxis
                      tick={{ fontSize: 10, fill: "var(--text-secondary)" }}
                      axisLine={false}
                      tickLine={false}
                      tickFormatter={(v) => `${Math.round(v / 1000)}rb`}
                      width={40}
                    />
                    <Tooltip
                      formatter={(v) => fmt(Number(v))}
                      contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid var(--border)" }}
                    />
                    <Bar dataKey="total" fill="var(--navy)" radius={[4, 4, 0, 0]} isAnimationActive={false} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
              {/* Grafik di atas dekoratif secara visual, tapi datanya bukan
                  dekorasi — angka yang sama tersedia sebagai teks di tiap
                  kartu laporan di bawah, jadi tak ada informasi yang HANYA
                  bisa diakses lewat grafik. */}
            </div>
          )}

          {!loading && !galatMuat && reports.length > 0 && (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {reports.map((r) => (
                <div
                  key={r.id}
                  style={{
                    padding: "var(--pad-kartu-lega)", borderRadius: 16, background: "var(--surface)",
                    border: "1px solid var(--border)", display: "flex", flexDirection: "column", gap: 8,
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 14, fontWeight: 700, color: "var(--text-primary)" }}>
                        {r.scope?.scope_name ?? "—"}
                      </div>
                      <div style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: 2 }}>
                        {r.assignment?.project?.name ?? "—"} · {fmtDate(r.week_start ?? null)} – {fmtDate(r.week_end ?? null)}
                      </div>
                    </div>
                    <StatusBadge
                      status={VARIAN_STATUS[r.status ?? ""] ?? "netral"}
                      label={LABEL_STATUS[r.status ?? ""] ?? (r.status ?? "—")}
                    />
                  </div>
                  <div style={{ display: "flex", gap: "var(--gap-bagian)", flexWrap: "wrap" }}>
                    <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>
                      Subtotal:{" "}
                      <span style={{ fontWeight: 600, color: "var(--text-primary)", fontVariantNumeric: "tabular-nums" }}>
                        {fmt(Number(r.subtotal ?? 0))}
                      </span>
                    </div>
                    <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>
                      Potongan:{" "}
                      <span style={{ fontWeight: 600, color: "var(--danger)", fontVariantNumeric: "tabular-nums" }}>
                        −{fmt(Number(r.total_deduction ?? 0))}
                      </span>
                    </div>
                    <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>
                      Bersih:{" "}
                      <span style={{ fontWeight: 700, color: "var(--success)", fontVariantNumeric: "tabular-nums" }}>
                        {fmt(Number(r.net_amount ?? 0))}
                      </span>
                    </div>
                  </div>
                  {r.review_notes && (
                    <div
                      style={{
                        fontSize: 12, color: "var(--text-secondary)", background: "var(--surface-subtle)",
                        borderRadius: 8, padding: "6px 10px",
                      }}
                    >
                      Catatan: {r.review_notes}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* BUAT LAPORAN TAB */}
      {tab === "buat" && (
        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "var(--gap-bagian)" }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div>
              <label htmlFor="selected-assignment" style={{ fontSize: 12, fontWeight: 600, color: "var(--text-primary)", display: "block", marginBottom: 6 }}>
                Proyek *
              </label>
              <Pilihan
                id="selected-assignment"
                aria-label="Pilih proyek"
                value={selectedAssignment}
                onChange={(e) => { setSelectedAssignment(e.target.value); setSelectedScope(""); }}
                style={{
                  width: "100%", minHeight: 44, padding: "0 12px", borderRadius: 12,
                  border: "1px solid var(--border)", fontSize: 14, background: "var(--surface)",
                  color: "var(--text-primary)", boxSizing: "border-box",
                }}
              >
                <option value="">Pilih proyek...</option>
                {assignments.map((a) => (
                  <option key={a.id} value={a.id}>{a.project.name}</option>
                ))}
              </Pilihan>
            </div>
            <div>
              <label htmlFor="selected-scope" style={{ fontSize: 12, fontWeight: 600, color: "var(--text-primary)", display: "block", marginBottom: 6 }}>
                Scope Pekerjaan *
              </label>
              <Pilihan
                id="selected-scope"
                aria-label="Pilih lingkup pekerjaan"
                value={selectedScope}
                onChange={(e) => setSelectedScope(e.target.value)}
                disabled={!selectedAssignment}
                style={{
                  width: "100%", minHeight: 44, padding: "0 12px", borderRadius: 12,
                  border: "1px solid var(--border)", fontSize: 14, color: "var(--text-primary)",
                  background: selectedAssignment ? "var(--surface)" : "var(--surface-subtle)",
                  boxSizing: "border-box",
                }}
              >
                <option value="">Pilih scope...</option>
                {scopesForAssignment.map((s) => (
                  <option key={s.id} value={s.id}>{s.scope_name}</option>
                ))}
              </Pilihan>
            </div>
            <div>
              <label htmlFor="week-start" style={{ fontSize: 12, fontWeight: 600, color: "var(--text-primary)", display: "block", marginBottom: 6 }}>
                Tanggal Mulai Minggu (Senin) *
              </label>
              <input
                id="week-start"
                aria-label="Tanggal mulai"
                type="date"
                value={weekStart}
                onChange={(e) => setWeekStart(e.target.value)}
                style={{
                  width: "100%", minHeight: 44, padding: "0 12px", borderRadius: 12,
                  border: "1px solid var(--border)", fontSize: 14, boxSizing: "border-box",
                }}
              />
            </div>
            <div>
              <label htmlFor="notes" style={{ fontSize: 12, fontWeight: 600, color: "var(--text-primary)", display: "block", marginBottom: 6 }}>
                Catatan
              </label>
              <input
                id="notes"
                type="text"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Opsional"
                style={{
                  width: "100%", minHeight: 44, padding: "0 12px", borderRadius: 12,
                  border: "1px solid var(--border)", fontSize: 14, boxSizing: "border-box",
                }}
              />
            </div>
          </div>

          {/* Tabel tukang */}
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
              <span style={{ fontSize: 13, fontWeight: 700, color: "var(--text-primary)" }}>Detail Tukang *</span>
              <button
                type="button"
                onClick={addRow}
                style={{
                  display: "flex", alignItems: "center", justifyContent: "center", gap: 4,
                  minHeight: 36, padding: "0 12px", borderRadius: "var(--portal-radius-pill)",
                  border: "1px solid var(--navy)", background: "var(--navy-light)", color: "var(--navy)",
                  fontSize: 12, fontWeight: 700, cursor: "pointer",
                }}
              >
                <Plus size={14} aria-hidden="true" /> Tambah Baris
              </button>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {rows.map((row, i) => (
                <div
                  key={i}
                  style={{
                    padding: 12, borderRadius: 12, border: "1px solid var(--border)",
                    background: "var(--surface)", display: "flex", flexDirection: "column", gap: 8,
                  }}
                >
                  <div style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
                    <div style={{ flex: 1, position: "relative" }}>
                      <input
                        value={row.worker_name}
                        onChange={(e) => updateRow(i, "worker_name", e.target.value)}
                        placeholder="Nama tukang"
                        list={`workers-list-${i}`}
                        aria-label={`Nama tukang baris ${i + 1}`}
                        style={{
                          width: "100%", minHeight: 44, padding: "0 12px", borderRadius: 10,
                          border: "1px solid var(--border)", fontSize: 14, boxSizing: "border-box",
                        }}
                      />
                      <datalist id={`workers-list-${i}`}>
                        {workers.map((w) => <option key={w.id} value={w.name} />)}
                      </datalist>
                    </div>
                    <button
                      type="button"
                      aria-label="Hapus baris tukang ini dari laporan"
                      onClick={() => removeRow(i)}
                      disabled={rows.length === 1}
                      style={{
                        width: 44, height: 44, borderRadius: 10, border: "1px solid var(--border)",
                        background: "var(--surface)", cursor: rows.length === 1 ? "default" : "pointer",
                        display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
                        opacity: rows.length === 1 ? 0.4 : 1,
                      }}
                    >
                      <Trash2 size={16} color="var(--danger)" aria-hidden="true" />
                    </button>
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                    <label style={{ fontSize: 11, color: "var(--text-secondary)" }}>
                      Hari kerja
                      <input
                        type="number" min="0" max="7" step="0.5"
                        value={row.days_worked || ""}
                        onChange={(e) => updateRow(i, "days_worked", Number(e.target.value))}
                        placeholder="0"
                        style={{
                          width: "100%", marginTop: 4, minHeight: 40, padding: "0 10px", borderRadius: 10,
                          border: "1px solid var(--border)", fontSize: 14, textAlign: "right", boxSizing: "border-box",
                        }}
                      />
                    </label>
                    <label style={{ fontSize: 11, color: "var(--text-secondary)" }}>
                      Tarif/hari (Rp)
                      <input
                        type="number" min="0"
                        value={row.daily_rate || ""}
                        onChange={(e) => updateRow(i, "daily_rate", Number(e.target.value))}
                        placeholder="0"
                        style={{
                          width: "100%", marginTop: 4, minHeight: 40, padding: "0 10px", borderRadius: 10,
                          border: "1px solid var(--border)", fontSize: 14, textAlign: "right", boxSizing: "border-box",
                        }}
                      />
                    </label>
                    <label style={{ fontSize: 11, color: "var(--text-secondary)" }}>
                      Lembur (jam)
                      <input
                        type="number" min="0"
                        value={row.overtime_hours || ""}
                        onChange={(e) => updateRow(i, "overtime_hours", Number(e.target.value))}
                        placeholder="0"
                        style={{
                          width: "100%", marginTop: 4, minHeight: 40, padding: "0 10px", borderRadius: 10,
                          border: "1px solid var(--border)", fontSize: 14, textAlign: "right", boxSizing: "border-box",
                        }}
                      />
                    </label>
                    <label style={{ fontSize: 11, color: "var(--text-secondary)" }}>
                      Tarif lembur (Rp)
                      <input
                        type="number" min="0"
                        value={row.overtime_rate || ""}
                        onChange={(e) => updateRow(i, "overtime_rate", Number(e.target.value))}
                        placeholder="0"
                        style={{
                          width: "100%", marginTop: 4, minHeight: 40, padding: "0 10px", borderRadius: 10,
                          border: "1px solid var(--border)", fontSize: 14, textAlign: "right", boxSizing: "border-box",
                        }}
                      />
                    </label>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div
            style={{
              borderTop: "1px solid var(--border)", paddingTop: 12,
              display: "flex", justifyContent: "space-between", alignItems: "center",
            }}
          >
            <span style={{ fontSize: 13, color: "var(--text-secondary)" }}>Total Upah</span>
            <span style={{ fontSize: 18, fontWeight: 800, color: "var(--navy)", fontVariantNumeric: "tabular-nums" }}>
              {fmt(total)}
            </span>
          </div>

          <button
            type="submit"
            disabled={submitting}
            style={{
              minHeight: 48, padding: "0 24px", borderRadius: "var(--portal-radius-pill)", border: "none",
              background: submitting ? "var(--surface-hover)" : "var(--grad-merek)",
              color: submitting ? "var(--text-muted)" : "var(--on-navy)",
              fontSize: 14, fontWeight: 700, cursor: submitting ? "default" : "pointer",
            }}
          >
            {submitting ? "Mengirim…" : "Kirim Laporan"}
          </button>
        </form>
      )}
    </div>
  );
}
