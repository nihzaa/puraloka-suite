"use client";

// ============================================================================
// Detail Proyek — versi Klien, Task 12. Restyle total dari `lib/warna-ui`
// (C.*) + tab manual ke token portal + `SegmentedTab` (Task 5), dan tambah
// 3 tab BACA SAJA: Punch List, Inspeksi, Submittal (spec §2.3).
//
// Klien HANYA `*:view` untuk ketiganya (diverifikasi ke role_permissions:
// client punya punch:view/inspeksi:view/submittal:view, TANPA :manage) —
// karena itu tab ini murni daftar + StatusBadge, tanpa satu pun tombol aksi.
// Endpoint SAMA PERSIS dengan yang dipakai mandor/PM
// (GET /api/v1/projects/:projectId/{punch-items,inspections,submittals}) —
// scope tenant + akses klien ke proyek ini sudah dijamin gerbang
// `GET /api/v1/projects/:id` yang memuat halaman ini (client hanya bisa
// membuka proyeknya sendiri).
//
// Logika data-fetching per-tab (useEffect+api.get, bukan useData) TIDAK
// diubah — halaman ini sudah lazy-load per-tab-aktif, mengganti ke useData
// akan mengubah PERILAKU (cache lintas-tab), bukan cuma presentasi, dan itu
// di luar cakupan restyle (instruksi Step 1 plan: "pertahankan struktur
// data-fetching per-tab").
// ============================================================================

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { useTutupEsc } from "@/lib/use-tutup-esc";
import {
  MapPin, Calendar, TrendingUp, CheckCircle2, Clock,
  AlertCircle, ChevronLeft, FileText, Camera, Download,
  Image as IconClose, ChevronRight as ChevronRightIcon,
  ClipboardCheck, FileQuestion, FileStack,
} from "lucide-react";
import {
  ComposedChart, Line, Area, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer,
} from "recharts";
import SegmentedTab from "@/components/portal/SegmentedTab";
import StatusBadge, { type VarianStatus } from "@/components/portal/StatusBadge";
import EmptyState from "@/components/portal/EmptyState";
import SkeletonCard from "@/components/portal/SkeletonCard";
import type { PunchItemKlien, InspeksiKlien, SubmittalKlien } from "../../_bersama/tipe";

const kartu: React.CSSProperties = {
  background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 16,
};

function fmt(n: number) {
  return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(n);
}
function fmtDate(s: string | null) {
  if (!s) return "—";
  return new Date(s).toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" });
}
function fmtDateShort(s: string | null | undefined) {
  if (!s) return "—";
  return new Date(s).toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric" });
}

const LABEL_STATUS_PROYEK: Record<string, string> = {
  planning: "Perencanaan", active: "Aktif", on_hold: "Ditunda",
  completed: "Selesai", cancelled: "Dibatalkan",
};
const VARIAN_STATUS_PROYEK: Record<string, VarianStatus> = {
  planning: "info", active: "approved", on_hold: "pending",
  completed: "approved", cancelled: "netral",
};

const LABEL_INVOICE: Record<string, string> = {
  unpaid: "Belum Lunas", paid: "Lunas", overdue: "Jatuh Tempo",
  partial: "Sebagian", sent: "Terkirim",
};
const VARIAN_INVOICE: Record<string, VarianStatus> = {
  unpaid: "pending", paid: "approved", overdue: "rejected",
  partial: "pending", sent: "info",
};

const MILESTONE_STATUS: Record<string, { icon: React.ReactNode; warna: string }> = {
  completed: { icon: <CheckCircle2 size={16} aria-hidden="true" />, warna: "var(--success)" },
  on_track: { icon: <Clock size={16} aria-hidden="true" />, warna: "var(--info)" },
  at_risk: { icon: <AlertCircle size={16} aria-hidden="true" />, warna: "var(--warning)" },
  overdue: { icon: <AlertCircle size={16} aria-hidden="true" />, warna: "var(--danger)" },
  pending: { icon: <Clock size={16} aria-hidden="true" />, warna: "var(--text-muted)" },
};

const LABEL_FOTO: Record<string, string> = {
  progress: "Progres", defect: "Masalah/Defect", serah_terima: "Serah Terima", other: "Lainnya",
};
const LABEL_DOKUMEN: Record<string, string> = {
  contract: "Kontrak", drawing: "Gambar Kerja", report: "Laporan", other: "Lainnya",
};

const LABEL_PUNCH: Record<string, string> = {
  terbuka: "Terbuka", dikerjakan: "Dikerjakan", menunggu_cek: "Menunggu Verifikasi",
  ditutup: "Ditutup", ditolak: "Ditolak",
};
const VARIAN_PUNCH: Record<string, VarianStatus> = {
  terbuka: "netral", dikerjakan: "pending", menunggu_cek: "pending", ditutup: "approved", ditolak: "rejected",
};
const LABEL_INSPEKSI: Record<string, string> = {
  diminta: "Menunggu Pemeriksaan", dijadwalkan: "Dijadwalkan",
  lolos: "Lolos", tidak_lolos: "Tidak Lolos", dibatalkan: "Dibatalkan",
};
const VARIAN_INSPEKSI: Record<string, VarianStatus> = {
  diminta: "pending", dijadwalkan: "pending", lolos: "approved", tidak_lolos: "rejected", dibatalkan: "netral",
};
const LABEL_SUBMITTAL: Record<string, string> = {
  draft: "Draft", diajukan: "Diajukan", disetujui: "Disetujui", ditolak: "Ditolak", revisi: "Perlu Revisi",
};
const VARIAN_SUBMITTAL: Record<string, VarianStatus> = {
  draft: "netral", diajukan: "pending", disetujui: "approved", ditolak: "rejected", revisi: "pending",
};

// ─── Types ────────────────────────────────────────────────────────────────────

interface Project {
  id: string; name: string; location: string; status: string;
  contract_value: number; start_date: string; end_date: string;
  progress_pct: number; notes: string | null;
  pm: { name: string; phone: string } | null;
  milestones: Array<{ id: string; title: string; target_date: string; status: string; completed_at: string | null; description: string | null }>;
  progress_logs: Array<{ id: string; pct_overall: number; notes: string | null; logged_at: string; weather: string | null; worker_count: number | null }>;
  invoices: Array<{ id: string; invoice_number: string; total_amount: number; amount_due: number; due_date: string; status: string }>;
}

interface Photo {
  id: string; file_url: string; caption: string | null;
  category: string; created_at: string;
}

interface Document {
  id: string; file_name: string; doc_type: string;
  description: string | null; file_url: string; uploaded_at: string;
  file_size: number | null;
}

interface GanttItem {
  id: string; no_urut: string; uraian: string; level: number;
  parent_id: string | null; planned_start: string | null; planned_end: string | null;
  progress_pct: number; sort_order: number;
}

interface ChartPoint {
  week: string; rencana: number; aktual: number | null; progress: number | null;
}
interface KurvaSData {
  meta: {
    contractValue: number; totalWeeks: number;
    latestActualPct: number; latestRencanaPct: number; deviasi: number;
    evm: { ev: number; pv: number; bac: number; spi: number | null; cpi: number | null };
  };
  chartData: ChartPoint[];
}

// ─── Sub-tabs ─────────────────────────────────────────────────────────────────

function KurvaSTab({ projectId }: { projectId: string }) {
  const [data, setData] = useState<KurvaSData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get(`/api/v1/projects/${projectId}/kurva-s`)
      .then((res) => setData(res.data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [projectId]);

  if (loading) return <SkeletonCard tinggi={280} />;
  if (!data) return <EmptyState icon={TrendingUp} judul="Data Kurva S belum tersedia" deskripsi="Grafik akan muncul begitu progres tercatat." />;

  const { meta, chartData } = data;
  const warnaDeviasi = meta.deviasi >= 0 ? "var(--success)" : "var(--danger)";
  const warnaSpi = meta.evm.spi === null ? "var(--text-primary)" : meta.evm.spi >= 1 ? "var(--success)" : meta.evm.spi >= 0.8 ? "var(--warning)" : "var(--danger)";

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--gap-bagian)" }}>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {[
          { label: "Progress Fisik", value: `${meta.latestActualPct.toFixed(1)}%`, warna: "var(--navy)" },
          { label: "Target Rencana", value: `${meta.latestRencanaPct.toFixed(1)}%`, warna: "var(--info)" },
          { label: "Deviasi", value: `${meta.deviasi >= 0 ? "+" : ""}${meta.deviasi.toFixed(1)}%`, warna: warnaDeviasi },
          ...(meta.evm.spi !== null ? [{ label: "SPI", value: meta.evm.spi.toFixed(2), warna: warnaSpi }] : []),
        ].map((k) => (
          <div key={k.label} style={{ ...kartu, padding: "12px 16px", flex: 1, minWidth: 120 }}>
            <div style={{ fontSize: 11, color: "var(--text-secondary)", marginBottom: 3, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em" }}>{k.label}</div>
            <div style={{ fontSize: 22, fontWeight: 800, color: k.warna, fontVariantNumeric: "tabular-nums" }}>{k.value}</div>
          </div>
        ))}
      </div>
      <div style={{ ...kartu, padding: "var(--pad-kartu-lega)" }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: "var(--text-primary)", marginBottom: 16 }}>Kurva S — Rencana vs Progress Fisik</div>
        <ResponsiveContainer width="100%" height={280}>
          <ComposedChart data={chartData} margin={{ top: 4, right: 8, left: -16, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
            <XAxis dataKey="week" tick={{ fontSize: 10, fill: "var(--text-muted)" }} tickLine={false} />
            <YAxis tick={{ fontSize: 10, fill: "var(--text-muted)" }} tickLine={false} tickFormatter={(v) => `${v}%`} domain={[0, 100]} />
            <Tooltip formatter={(v, name) => [typeof v === "number" ? `${v.toFixed(1)}%` : v, name]} contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid var(--border)" }} />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            <Area type="monotone" dataKey="rencana" name="Rencana" stroke="var(--navy)" strokeDasharray="5 4" strokeWidth={2} fill="var(--info-bg)" fillOpacity={0.6} dot={false} connectNulls />
            <Line type="monotone" dataKey="progress" name="Progress Fisik" stroke="var(--success)" strokeWidth={2.5} dot={{ r: 3, fill: "var(--success)" }} connectNulls />
          </ComposedChart>
        </ResponsiveContainer>
        <div style={{ marginTop: 10, fontSize: 11, color: "var(--text-muted)", textAlign: "center" }}>
          Grafik menampilkan rencana progres proyek vs realisasi fisik di lapangan
        </div>
      </div>
    </div>
  );
}

function GanttTab({ projectId }: { projectId: string }) {
  const [items, setItems] = useState<GanttItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get(`/api/v1/projects/${projectId}/rab/gantt`)
      .then((res) => setItems(res.data?.tasks ?? res.data ?? []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [projectId]);

  if (loading) return <SkeletonCard tinggi={200} />;
  if (!items.length) return <EmptyState icon={Calendar} judul="Jadwal belum diinput" deskripsi="Jadwal pelaksanaan akan muncul di sini." />;

  const startDates = items.filter((t) => t.planned_start).map((t) => new Date(t.planned_start!).getTime());
  const endDates = items.filter((t) => t.planned_end).map((t) => new Date(t.planned_end!).getTime());
  if (!startDates.length) return <EmptyState icon={Calendar} judul="Jadwal belum diinput" deskripsi="Jadwal pelaksanaan akan muncul di sini." />;

  const minDate = new Date(Math.min(...startDates));
  const maxDate = new Date(Math.max(...endDates));
  const totalDays = Math.max(Math.ceil((maxDate.getTime() - minDate.getTime()) / 86400000) + 1, 1);
  const today = new Date();
  const todayPct = Math.max(0, Math.min(100, ((today.getTime() - minDate.getTime()) / 86400000 / totalDays) * 100));

  const levelIndent = [0, 0, 16, 32];
  const barColor = ["var(--navy)", "var(--navy)", "var(--info)", "var(--info)"];

  return (
    <div style={{ ...kartu, padding: "var(--pad-kartu-lega)", overflowX: "auto" }}>
      <div style={{ fontSize: 13, fontWeight: 700, color: "var(--text-primary)", marginBottom: 4 }}>Jadwal Pelaksanaan (Gantt)</div>
      <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 16 }}>Rencana — baca saja</div>
      <div style={{ minWidth: 600 }}>
        <div style={{ display: "flex", marginBottom: 6, paddingLeft: 200 }}>
          {[0, 0.25, 0.5, 0.75, 1].map((frac) => {
            const d = new Date(minDate.getTime() + frac * totalDays * 86400000);
            return (
              <div key={frac} style={{ flex: frac === 0 ? "0 0 0" : 1, fontSize: 10, color: "var(--text-muted)", textAlign: "center" }}>
                {frac > 0 ? d.toLocaleDateString("id-ID", { day: "2-digit", month: "short" }) : ""}
              </div>
            );
          })}
        </div>
        {items.filter((t) => t.planned_start && t.planned_end).map((t) => {
          const left = ((new Date(t.planned_start!).getTime() - minDate.getTime()) / 86400000 / totalDays) * 100;
          const width = Math.max(((new Date(t.planned_end!).getTime() - new Date(t.planned_start!).getTime()) / 86400000 / totalDays) * 100, 0.5);
          const indent = levelIndent[t.level] ?? 0;
          const warna = barColor[t.level] ?? barColor[2];
          return (
            <div key={t.id} style={{ display: "flex", alignItems: "center", marginBottom: 4, minHeight: 28 }}>
              <div style={{ width: 200, flexShrink: 0, paddingLeft: indent, paddingRight: 8, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                <span style={{ fontSize: 11, color: t.level <= 1 ? "var(--text-primary)" : "var(--text-secondary)", fontWeight: t.level <= 1 ? 600 : 400 }}>
                  {t.no_urut} {t.uraian}
                </span>
              </div>
              <div style={{ flex: 1, position: "relative", height: 20, background: "var(--surface-subtle)", borderRadius: 6, overflow: "hidden" }}>
                <div style={{ position: "absolute", left: `${todayPct}%`, top: 0, bottom: 0, width: 1, background: "var(--danger)", zIndex: 2 }} />
                <div style={{
                  position: "absolute", left: `${left}%`, width: `${width}%`,
                  top: 3, bottom: 3, background: warna, borderRadius: 4, opacity: 0.85,
                }} title={`${fmtDateShort(t.planned_start)} – ${fmtDateShort(t.planned_end)}`} />
                {t.progress_pct > 0 && (
                  <div style={{
                    position: "absolute", left: `${left}%`, width: `${width * t.progress_pct / 100}%`,
                    top: 3, bottom: 3, background: "var(--success)", borderRadius: "4px 0 0 4px", opacity: 0.6,
                  }} />
                )}
              </div>
              <div style={{ width: 36, textAlign: "right", fontSize: 10, color: "var(--text-muted)", flexShrink: 0, paddingLeft: 6 }}>
                {t.progress_pct > 0 ? `${t.progress_pct}%` : ""}
              </div>
            </div>
          );
        })}
        <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 12, paddingLeft: 200 }}>
          <div style={{ width: 12, height: 2, background: "var(--danger)" }} />
          <span style={{ fontSize: 10, color: "var(--text-muted)" }}>Hari ini</span>
          <div style={{ width: 12, height: 8, background: "var(--success)", borderRadius: 4, opacity: 0.6, marginLeft: 10 }} />
          <span style={{ fontSize: 10, color: "var(--text-muted)" }}>Sudah selesai</span>
        </div>
      </div>
    </div>
  );
}

function FotoTab({ projectId }: { projectId: string }) {
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterCat, setFilterCat] = useState<string>("all");
  const [lightbox, setLightbox] = useState<number | null>(null);

  useTutupEsc(lightbox !== null ? () => setLightbox(null) : null);

  useEffect(() => {
    api.get(`/api/v1/projects/${projectId}/photos`)
      .then((res) => setPhotos(res.data?.photos ?? res.data ?? []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [projectId]);

  const cats = ["all", ...Array.from(new Set(photos.map((p) => p.category)))];
  const filtered = filterCat === "all" ? photos : photos.filter((p) => p.category === filterCat);

  if (loading) return <SkeletonCard tinggi={200} />;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--gap-bagian)" }}>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        {cats.map((cat) => (
          <button
            key={cat}
            type="button"
            onClick={() => setFilterCat(cat)}
            aria-pressed={filterCat === cat}
            style={{
              padding: "6px 14px", borderRadius: "var(--portal-radius-pill)", fontSize: 12, fontWeight: 600, minHeight: 32,
              background: filterCat === cat ? "var(--info-bg)" : "var(--surface)",
              color: filterCat === cat ? "var(--navy)" : "var(--text-secondary)",
              border: `1px solid ${filterCat === cat ? "var(--navy)" : "var(--border)"}`,
              cursor: "pointer",
            }}
          >
            {cat === "all" ? "Semua" : LABEL_FOTO[cat] ?? cat}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <EmptyState icon={Camera} judul="Belum ada foto dokumentasi" deskripsi="Foto progres lapangan akan muncul di sini." />
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8 }}>
          {filtered.map((photo, idx) => (
            <div
              key={photo.id}
              role="button"
              tabIndex={0}
              onClick={() => setLightbox(idx)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  setLightbox(idx);
                }
              }}
              style={{ borderRadius: 12, overflow: "hidden", cursor: "pointer", position: "relative", aspectRatio: "4/3", background: "var(--surface-subtle)" }}
            >
              <img src={photo.file_url} alt={photo.caption ?? ""} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
              <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, padding: "6px 8px", background: "linear-gradient(transparent, rgba(0,0,0,0.6))" }}>
                <span style={{ fontSize: 10, color: "#fff", fontWeight: 500 }}>
                  {LABEL_FOTO[photo.category] ?? photo.category}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}

      {lightbox !== null && (
        <div
          onClick={() => setLightbox(null)}
          style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.92)", zIndex: 9999, display: "flex", alignItems: "center", justifyContent: "center" }}
        >
          <button aria-label="Tutup foto" onClick={() => setLightbox(null)} style={{ position: "absolute", top: 16, right: 16, background: "none", border: "none", color: "#fff", cursor: "pointer" }}>
            <IconClose size={24} aria-hidden="true" />
          </button>
          {lightbox > 0 && (
            <button aria-label="Foto sebelumnya" onClick={(e) => { e.stopPropagation(); setLightbox((l) => l! - 1); }} style={{ position: "absolute", left: 16, background: "none", border: "none", color: "#fff", cursor: "pointer" }}>
              <ChevronLeft size={28} aria-hidden="true" />
            </button>
          )}
          {lightbox < filtered.length - 1 && (
            <button aria-label="Foto berikutnya" onClick={(e) => { e.stopPropagation(); setLightbox((l) => l! + 1); }} style={{ position: "absolute", right: 16, background: "none", border: "none", color: "#fff", cursor: "pointer" }}>
              <ChevronRightIcon size={28} aria-hidden="true" />
            </button>
          )}
          <div onClick={(e) => e.stopPropagation()} style={{ maxWidth: "90vw", maxHeight: "85vh" }}>
            <img src={filtered[lightbox].file_url} alt="" style={{ maxWidth: "90vw", maxHeight: "80vh", borderRadius: 8, objectFit: "contain" }} />
            {filtered[lightbox].caption && (
              <div style={{ color: "#ccc", textAlign: "center", marginTop: 10, fontSize: 13 }}>{filtered[lightbox].caption}</div>
            )}
            <div style={{ color: "#888", textAlign: "center", marginTop: 4, fontSize: 11 }}>
              {LABEL_FOTO[filtered[lightbox].category]} · {fmtDateShort(filtered[lightbox].created_at)} · {lightbox + 1}/{filtered.length}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function DokumenTab({ projectId }: { projectId: string }) {
  const [docs, setDocs] = useState<Document[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get(`/api/v1/projects/${projectId}/documents`)
      .then((res) => setDocs(res.data?.documents ?? res.data ?? []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [projectId]);

  function fmtSize(bytes: number | null) {
    if (!bytes) return "";
    if (bytes > 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
    return `${Math.round(bytes / 1024)} KB`;
  }

  if (loading) return <SkeletonCard tinggi={80} />;
  if (!docs.length) return <EmptyState icon={FileText} judul="Belum ada dokumen yang dibagikan" deskripsi="Kontrak/SPK/gambar kerja akan muncul di sini." />;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {docs.map((doc) => (
        <div key={doc.id} style={{ ...kartu, padding: 14, display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ width: 38, height: 38, borderRadius: 12, background: "var(--info-bg)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            <FileText size={17} color="var(--navy)" aria-hidden="true" />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{doc.file_name}</div>
            <div style={{ fontSize: 11, color: "var(--text-secondary)", marginTop: 2 }}>
              {LABEL_DOKUMEN[doc.doc_type] ?? doc.doc_type}
              {doc.file_size ? ` · ${fmtSize(doc.file_size)}` : ""}
              {` · ${fmtDateShort(doc.uploaded_at)}`}
            </div>
            {doc.description && <div style={{ fontSize: 11, color: "var(--text-secondary)", marginTop: 2 }}>{doc.description}</div>}
          </div>
          <a
            href={doc.file_url}
            target="_blank" rel="noopener noreferrer"
            style={{ display: "flex", alignItems: "center", gap: 4, padding: "6px 12px", borderRadius: 8, background: "var(--info-bg)", color: "var(--navy)", fontSize: 12, fontWeight: 600, textDecoration: "none", flexShrink: 0 }}
          >
            <Download size={12} aria-hidden="true" /> Unduh
          </a>
        </div>
      ))}
    </div>
  );
}

function PunchListTab({ projectId }: { projectId: string }) {
  const [items, setItems] = useState<PunchItemKlien[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get(`/api/v1/projects/${projectId}/punch-items`)
      .then((res) => setItems(res.data?.data ?? []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [projectId]);

  if (loading) return <SkeletonCard tinggi={80} />;
  if (!items.length) return <EmptyState icon={ClipboardCheck} judul="Belum ada temuan" deskripsi="Temuan cacat/kekurangan pekerjaan akan muncul di sini." />;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {items.map((item) => (
        <div key={item.id} style={{ ...kartu, padding: 14, display: "flex", flexDirection: "column", gap: 6 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
            <span style={{ fontSize: 14, fontWeight: 700, color: "var(--text-primary)" }}>{item.judul ?? item.nomor ?? "Temuan"}</span>
            <StatusBadge status={VARIAN_PUNCH[item.status ?? ""] ?? "netral"} label={LABEL_PUNCH[item.status ?? ""] ?? item.status ?? "—"} />
          </div>
          {item.lokasi && <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>{item.lokasi}</div>}
          {item.deskripsi && <div style={{ fontSize: 13, color: "var(--text-secondary)" }}>{item.deskripsi}</div>}
        </div>
      ))}
    </div>
  );
}

function InspeksiTab({ projectId }: { projectId: string }) {
  const [items, setItems] = useState<InspeksiKlien[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get(`/api/v1/projects/${projectId}/inspections`)
      .then((res) => setItems(res.data?.data ?? []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [projectId]);

  if (loading) return <SkeletonCard tinggi={80} />;
  if (!items.length) return <EmptyState icon={FileQuestion} judul="Belum ada inspeksi" deskripsi="Izin cor/tutup pekerjaan akan muncul di sini." />;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {items.map((item) => (
        <div key={item.id} style={{ ...kartu, padding: 14, display: "flex", flexDirection: "column", gap: 6 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
            <span style={{ fontSize: 14, fontWeight: 700, color: "var(--text-primary)" }}>{item.judul ?? item.nomor ?? "Inspeksi"}</span>
            <StatusBadge status={VARIAN_INSPEKSI[item.status ?? ""] ?? "netral"} label={LABEL_INSPEKSI[item.status ?? ""] ?? item.status ?? "—"} />
          </div>
          {item.lokasi && <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>{item.lokasi}</div>}
          {item.diminta_untuk && <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>Dijadwalkan: {fmtDateShort(item.diminta_untuk)}</div>}
        </div>
      ))}
    </div>
  );
}

function SubmittalTab({ projectId }: { projectId: string }) {
  const [items, setItems] = useState<SubmittalKlien[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get(`/api/v1/projects/${projectId}/submittals`)
      .then((res) => setItems(res.data?.data ?? []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [projectId]);

  if (loading) return <SkeletonCard tinggi={80} />;
  if (!items.length) return <EmptyState icon={FileStack} judul="Belum ada submittal" deskripsi="Material/shop drawing yang diajukan akan muncul di sini." />;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {items.map((item) => (
        <div key={item.id} style={{ ...kartu, padding: 14, display: "flex", flexDirection: "column", gap: 6 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
            <span style={{ fontSize: 14, fontWeight: 700, color: "var(--text-primary)" }}>{item.judul ?? item.nomor ?? "Submittal"}</span>
            <StatusBadge status={VARIAN_SUBMITTAL[item.status ?? ""] ?? "netral"} label={LABEL_SUBMITTAL[item.status ?? ""] ?? item.status ?? "—"} />
          </div>
          {item.jenis && <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>{item.jenis}</div>}
          {item.diajukan_pada && <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>Diajukan: {fmtDateShort(item.diajukan_pada)}</div>}
        </div>
      ))}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

type TabKey = "overview" | "kurva-s" | "gantt" | "foto" | "dokumen" | "progress" | "invoice" | "punch" | "inspeksi" | "submittal";

const TABS: { key: TabKey; label: string }[] = [
  { key: "overview", label: "Ringkasan" },
  { key: "kurva-s", label: "Kurva S" },
  { key: "gantt", label: "Jadwal" },
  { key: "punch", label: "Punch List" },
  { key: "inspeksi", label: "Inspeksi" },
  { key: "submittal", label: "Submittal" },
  { key: "foto", label: "Foto" },
  { key: "dokumen", label: "Dokumen" },
  { key: "progress", label: "Log Progress" },
  { key: "invoice", label: "Invoice" },
];

export default function PortalProyekDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [project, setProject] = useState<Project | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<TabKey>("overview");

  useEffect(() => {
    setProject(null);
    setLoading(true);
    api.get(`/api/v1/projects/${id}`).then((res) => {
      setProject(res.data);
    }).catch(() => router.replace("/portal"))
      .finally(() => setLoading(false));
  }, [id, router]);

  if (loading) return <SkeletonCard tinggi={300} />;
  if (!project) return null;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--gap-bagian)" }}>
      <button
        type="button"
        onClick={() => router.back()}
        style={{ display: "flex", alignItems: "center", gap: 6, background: "none", border: "none", cursor: "pointer", fontSize: 13, color: "var(--navy)", fontWeight: 600, padding: 0, alignSelf: "flex-start" }}
      >
        <ChevronLeft size={16} aria-hidden="true" /> Kembali
      </button>

      <div style={{ ...kartu, padding: "var(--pad-kartu-lega)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, flexWrap: "wrap" }}>
          <h1 style={{ fontSize: 20, fontWeight: 700, color: "var(--text-primary)", margin: 0, flex: 1 }}>{project.name}</h1>
          <StatusBadge status={VARIAN_STATUS_PROYEK[project.status] ?? "netral"} label={LABEL_STATUS_PROYEK[project.status] ?? project.status} />
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: "6px 20px", marginTop: 10 }}>
          {project.location && (
            <div style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 13, color: "var(--text-secondary)" }}>
              <MapPin size={13} aria-hidden="true" /> {project.location}
            </div>
          )}
          <div style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 13, color: "var(--text-secondary)" }}>
            <Calendar size={13} aria-hidden="true" /> {fmtDate(project.start_date)} – {fmtDate(project.end_date)}
          </div>
        </div>
        <div style={{ marginTop: 16 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 13, color: "var(--text-secondary)" }}>
              <TrendingUp size={13} aria-hidden="true" /> Progress Fisik
            </div>
            <span style={{ fontSize: 15, fontWeight: 700, color: "var(--navy)", fontVariantNumeric: "tabular-nums" }}>{project.progress_pct ?? 0}%</span>
          </div>
          <div style={{ height: 8, background: "var(--surface-subtle)", borderRadius: 999, overflow: "hidden" }}>
            <div style={{ height: "100%", borderRadius: 999, width: `${project.progress_pct ?? 0}%`, background: "var(--grad-aksen)", transition: "width 0.5s ease" }} />
          </div>
        </div>
        <div style={{ marginTop: 14, padding: "12px 16px", background: "var(--info-bg)", borderRadius: 12 }}>
          <div style={{ fontSize: 12, color: "var(--text-secondary)", marginBottom: 2 }}>Nilai Kontrak</div>
          <div style={{ fontSize: 20, fontWeight: 700, color: "var(--navy)", fontVariantNumeric: "tabular-nums" }}>{fmt(project.contract_value ?? 0)}</div>
        </div>
      </div>

      <div style={{ overflowX: "auto", WebkitOverflowScrolling: "touch" as never }}>
        <SegmentedTab
          opsi={TABS.map((t) => ({ value: t.key, label: t.label }))}
          aktif={activeTab}
          onUbah={(v) => setActiveTab(v as TabKey)}
        />
      </div>

      {activeTab === "kurva-s" && <KurvaSTab projectId={project.id} />}
      {activeTab === "gantt" && <GanttTab projectId={project.id} />}
      {activeTab === "punch" && <PunchListTab projectId={project.id} />}
      {activeTab === "inspeksi" && <InspeksiTab projectId={project.id} />}
      {activeTab === "submittal" && <SubmittalTab projectId={project.id} />}
      {activeTab === "foto" && <FotoTab projectId={project.id} />}
      {activeTab === "dokumen" && <DokumenTab projectId={project.id} />}

      {activeTab === "overview" && (
        <div style={{ display: "flex", flexDirection: "column", gap: "var(--gap-bagian)" }}>
          {project.pm && (
            <div style={{ ...kartu, padding: "var(--pad-kartu-lega)" }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: "var(--text-secondary)", marginBottom: 10, textTransform: "uppercase", letterSpacing: "0.05em" }}>Project Manager</div>
              <div style={{ fontSize: 15, fontWeight: 600, color: "var(--text-primary)" }}>{project.pm.name}</div>
              {project.pm.phone && (
                <a
                  href={`https://wa.me/62${project.pm.phone.replace(/^0/, "")}`}
                  target="_blank" rel="noopener noreferrer"
                  style={{ display: "inline-flex", alignItems: "center", gap: 6, marginTop: 8, padding: "8px 14px", borderRadius: "var(--portal-radius-pill)", background: "#0F7A3F", color: "#fff", fontSize: 13, fontWeight: 600, textDecoration: "none" }}
                >
                  Hubungi via WhatsApp
                </a>
              )}
            </div>
          )}
          {project.milestones?.length > 0 && (
            <div style={{ ...kartu, padding: "var(--pad-kartu-lega)" }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: "var(--text-secondary)", marginBottom: 12, textTransform: "uppercase", letterSpacing: "0.05em" }}>Milestone</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {project.milestones.map((m) => {
                  const ms = MILESTONE_STATUS[m.status] ?? MILESTONE_STATUS.pending;
                  return (
                    <div key={m.id} style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
                      <span style={{ color: ms.warna, marginTop: 1, flexShrink: 0 }}>{ms.icon}</span>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>{m.title}</div>
                        {m.description && <div style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: 1 }}>{m.description}</div>}
                        <div style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: 2 }}>
                          Target: {fmtDateShort(m.target_date)}
                          {m.completed_at && ` · Selesai ${fmtDateShort(m.completed_at)}`}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
          {project.notes && (
            <div style={{ ...kartu, padding: "var(--pad-kartu-lega)" }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: "var(--text-secondary)", marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.05em" }}>Catatan</div>
              <div style={{ fontSize: 13, color: "var(--text-primary)", lineHeight: 1.6 }}>{project.notes}</div>
            </div>
          )}
        </div>
      )}

      {activeTab === "progress" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {(!project.progress_logs?.length) && (
            <EmptyState icon={TrendingUp} judul="Belum ada log progress" deskripsi="Catatan progres harian lapangan akan muncul di sini." />
          )}
          {project.progress_logs?.map((log) => (
            <div key={log.id} style={{ ...kartu, padding: "var(--pad-kartu-lega)" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8, flexWrap: "wrap", gap: 6 }}>
                <div style={{ fontSize: 13, color: "var(--text-secondary)", display: "flex", alignItems: "center", gap: 4 }}>
                  <Calendar size={13} aria-hidden="true" />
                  {fmtDateShort(log.logged_at)}
                  {log.weather && <span style={{ marginLeft: 4, fontSize: 12 }}>{log.weather}</span>}
                  {log.worker_count !== null && log.worker_count > 0 && (
                    <span style={{ marginLeft: 4, fontSize: 12 }}>· {log.worker_count} pekerja</span>
                  )}
                </div>
                {log.pct_overall !== null && (
                  <div style={{ fontSize: 14, fontWeight: 700, color: "var(--navy)", background: "var(--info-bg)", padding: "3px 10px", borderRadius: "var(--portal-radius-pill)", fontVariantNumeric: "tabular-nums" }}>
                    {log.pct_overall}%
                  </div>
                )}
              </div>
              {log.notes && <div style={{ fontSize: 13, color: "var(--text-primary)", lineHeight: 1.6 }}>{log.notes}</div>}
            </div>
          ))}
        </div>
      )}

      {activeTab === "invoice" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {(!project.invoices?.length) && (
            <EmptyState icon={FileText} judul="Belum ada invoice" deskripsi="Tagihan proyek ini akan muncul di sini." />
          )}
          {project.invoices?.map((inv) => (
            <div key={inv.id} style={{ ...kartu, padding: "var(--pad-kartu-lega)" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
                <div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <FileText size={15} color="var(--navy)" aria-hidden="true" />
                    <span style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>{inv.invoice_number}</span>
                  </div>
                  <div style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: 4 }}>Jatuh tempo: {fmtDateShort(inv.due_date)}</div>
                </div>
                <StatusBadge status={VARIAN_INVOICE[inv.status] ?? "netral"} label={LABEL_INVOICE[inv.status] ?? inv.status} />
              </div>
              <div style={{ marginTop: 12, display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
                <div>
                  <div style={{ fontSize: 11, color: "var(--text-secondary)" }}>Total</div>
                  <div style={{ fontSize: 15, fontWeight: 700, color: "var(--text-primary)", fontVariantNumeric: "tabular-nums" }}>{fmt(inv.total_amount)}</div>
                </div>
                {inv.amount_due > 0 && (
                  <div style={{ textAlign: "right" }}>
                    <div style={{ fontSize: 11, color: "var(--text-secondary)" }}>Sisa tagihan</div>
                    <div style={{ fontSize: 15, fontWeight: 700, color: "var(--danger)", fontVariantNumeric: "tabular-nums" }}>{fmt(inv.amount_due)}</div>
                  </div>
                )}
                {inv.status === "paid" && (
                  <div style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 13, color: "var(--success)", fontWeight: 700 }}>
                    <CheckCircle2 size={15} aria-hidden="true" /> Lunas
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
