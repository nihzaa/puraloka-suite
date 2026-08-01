"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { api } from "@/lib/api";
import {
  MapPin, Calendar, TrendingUp, CheckCircle2, Clock,
  AlertCircle, ChevronLeft, FileText, Camera, Download,
  Image as X, ChevronRight as ChevronRightIcon,
} from "lucide-react";
import {
  ComposedChart, Line, Area, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer,
} from "recharts";

const C = {
  navy: "var(--navy)", navyLight: "var(--navy-light)",
  text: "var(--text-primary)", mid: "var(--text-secondary)", muted: "var(--text-muted)",
  border: "var(--border)", bg: "var(--bg)", surface: "var(--surface)",
  green: "var(--success)", greenBg: "var(--success-bg)", greenBorder: "var(--success-border)",
  red: "var(--danger)", redBg: "var(--danger-bg)", redBorder: "var(--danger-border)",
  yellow: "var(--warning)", yellowBg: "var(--warning-bg)", yellowBorder: "var(--warning-border)",
  blue: "var(--navy-mid)", blueBg: "var(--info-bg)",
};

const card: React.CSSProperties = {
  background: C.surface, border: `1px solid ${C.border}`,
  borderRadius: 12, boxShadow: "0 1px 3px rgba(0,0,0,0.05)",
};

function fmt(n: number) {
  return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(n);
}
function fmtDate(s: string | null) {
  if (!s) return "—";
  return new Date(s).toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" });
}
function fmtDateShort(s: string | null) {
  if (!s) return "—";
  return new Date(s).toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric" });
}

const STATUS_META: Record<string, { label: string; color: string; bg: string }> = {
  planning:  { label: "Perencanaan", color: C.blue,   bg: C.blueBg   },
  active:    { label: "Aktif",       color: C.green,  bg: C.greenBg  },
  on_hold:   { label: "Ditunda",     color: C.yellow, bg: C.yellowBg },
  completed: { label: "Selesai",     color: C.green,  bg: C.greenBg  },
  cancelled: { label: "Dibatalkan",  color: C.red,    bg: C.redBg    },
};

const INVOICE_STATUS: Record<string, { label: string; color: string; bg: string }> = {
  unpaid:  { label: "Belum Lunas",  color: C.red,    bg: C.redBg    },
  paid:    { label: "Lunas",        color: C.green,  bg: C.greenBg  },
  overdue: { label: "Jatuh Tempo",  color: C.red,    bg: C.redBg    },
  partial: { label: "Sebagian",     color: C.yellow, bg: C.yellowBg },
  sent:    { label: "Terkirim",     color: C.blue,   bg: C.blueBg   },
};

const MILESTONE_STATUS: Record<string, { icon: React.ReactNode; color: string }> = {
  completed: { icon: <CheckCircle2 size={16} />, color: C.green },
  on_track:  { icon: <Clock size={16} />,        color: C.blue  },
  at_risk:   { icon: <AlertCircle size={16} />,  color: C.yellow },
  overdue:   { icon: <AlertCircle size={16} />,  color: C.red   },
  pending:   { icon: <Clock size={16} />,        color: C.muted },
};

const PHOTO_CATEGORY_LABEL: Record<string, string> = {
  progress: "Progres", defect: "Masalah/Defect",
  serah_terima: "Serah Terima", other: "Lainnya",
};
const DOC_TYPE_LABEL: Record<string, string> = {
  contract: "Kontrak", drawing: "Gambar Kerja",
  report: "Laporan", other: "Lainnya",
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

  if (loading) return <div style={{ textAlign: "center", padding: 60, color: C.mid }}>Memuat kurva S...</div>;
  if (!data) return <div style={{ ...card, padding: 40, textAlign: "center", color: C.mid }}>Data kurva S belum tersedia</div>;

  const { meta, chartData } = data;
  const devColor = meta.deviasi >= 0 ? C.green : C.red;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        {[
          { label: "Progress Fisik", value: `${meta.latestActualPct.toFixed(1)}%`, color: C.navy },
          { label: "Target Rencana", value: `${meta.latestRencanaPct.toFixed(1)}%`, color: C.blue },
          { label: "Deviasi", value: `${meta.deviasi >= 0 ? "+" : ""}${meta.deviasi.toFixed(1)}%`, color: devColor },
          ...(meta.evm.spi !== null ? [{ label: "SPI", value: meta.evm.spi.toFixed(2), color: meta.evm.spi >= 1 ? C.green : meta.evm.spi >= 0.8 ? C.yellow : C.red }] : []),
        ].map(k => (
          <div key={k.label} style={{ ...card, padding: "12px 16px", flex: 1, minWidth: 120 }}>
            <div style={{ fontSize: 11, color: C.mid, marginBottom: 3, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em" }}>{k.label}</div>
            <div style={{ fontSize: 22, fontWeight: 800, color: k.color }}>{k.value}</div>
          </div>
        ))}
      </div>
      <div style={{ ...card, padding: 20 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: C.text, marginBottom: 16 }}>Kurva S — Rencana vs Progress Fisik</div>
        <ResponsiveContainer width="100%" height={280}>
          <ComposedChart data={chartData} margin={{ top: 4, right: 8, left: -16, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={C.border} />
            <XAxis dataKey="week" tick={{ fontSize: 10, fill: C.muted }} tickLine={false} />
            <YAxis tick={{ fontSize: 10, fill: C.muted }} tickLine={false} tickFormatter={(v) => `${v}%`} domain={[0, 100]} />
            <Tooltip formatter={(v, name) => [typeof v === "number" ? `${v.toFixed(1)}%` : v, name]} contentStyle={{ fontSize: 12, borderRadius: 8, border: `1px solid ${C.border}` }} />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            <Area type="monotone" dataKey="rencana" name="Rencana" stroke={C.navy} strokeDasharray="5 4" strokeWidth={2} fill={C.navyLight} fillOpacity={0.25} dot={false} connectNulls />
            <Line type="monotone" dataKey="progress" name="Progress Fisik" stroke={C.green} strokeWidth={2.5} dot={{ r: 3, fill: C.green }} connectNulls />
          </ComposedChart>
        </ResponsiveContainer>
        <div style={{ marginTop: 10, fontSize: 11, color: C.muted, textAlign: "center" }}>
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

  if (loading) return <div style={{ textAlign: "center", padding: 60, color: C.mid }}>Memuat data gantt...</div>;
  if (!items.length) return <div style={{ ...card, padding: 40, textAlign: "center", color: C.mid }}>Jadwal pelaksanaan belum diinput.</div>;

  const startDates = items.filter(t => t.planned_start).map(t => new Date(t.planned_start!).getTime());
  const endDates = items.filter(t => t.planned_end).map(t => new Date(t.planned_end!).getTime());
  if (!startDates.length) return <div style={{ ...card, padding: 40, textAlign: "center", color: C.mid }}>Jadwal pelaksanaan belum diinput.</div>;

  const minDate = new Date(Math.min(...startDates));
  const maxDate = new Date(Math.max(...endDates));
  const totalDays = Math.max(Math.ceil((maxDate.getTime() - minDate.getTime()) / 86400000) + 1, 1);
  const today = new Date();
  const todayPct = Math.max(0, Math.min(100, ((today.getTime() - minDate.getTime()) / 86400000 / totalDays) * 100));

  const levelIndent = [0, 0, 16, 32];
  const barColor = ["#003366", "#003366", "#0066CC", "#60A5FA"];

  return (
    <div style={{ ...card, padding: 20, overflowX: "auto" }}>
      <div style={{ fontSize: 13, fontWeight: 700, color: C.text, marginBottom: 4 }}>Jadwal Pelaksanaan (Gantt)</div>
      <div style={{ fontSize: 11, color: C.muted, marginBottom: 16 }}>Rencana — read only</div>
      <div style={{ minWidth: 600 }}>
        {/* Header tanggal */}
        <div style={{ display: "flex", marginBottom: 6, paddingLeft: 200 }}>
          {[0, 0.25, 0.5, 0.75, 1].map(frac => {
            const d = new Date(minDate.getTime() + frac * totalDays * 86400000);
            return (
              <div key={frac} style={{ flex: frac === 0 ? "0 0 0" : 1, fontSize: 10, color: C.muted, textAlign: "center" }}>
                {frac > 0 ? d.toLocaleDateString("id-ID", { day: "2-digit", month: "short" }) : ""}
              </div>
            );
          })}
        </div>
        {/* Rows */}
        {items.filter(t => t.planned_start && t.planned_end).map(t => {
          const left = ((new Date(t.planned_start!).getTime() - minDate.getTime()) / 86400000 / totalDays) * 100;
          const width = Math.max(((new Date(t.planned_end!).getTime() - new Date(t.planned_start!).getTime()) / 86400000 / totalDays) * 100, 0.5);
          const indent = levelIndent[t.level] ?? 0;
          const color = barColor[t.level] ?? barColor[2];
          return (
            <div key={t.id} style={{ display: "flex", alignItems: "center", marginBottom: 4, minHeight: 28 }}>
              {/* Label */}
              <div style={{ width: 200, flexShrink: 0, paddingLeft: indent, paddingRight: 8, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                <span style={{ fontSize: 11, color: t.level <= 1 ? C.text : C.mid, fontWeight: t.level <= 1 ? 600 : 400 }}>
                  {t.no_urut} {t.uraian}
                </span>
              </div>
              {/* Bar area */}
              <div style={{ flex: 1, position: "relative", height: 20, background: "var(--surface-subtle)", borderRadius: 4, overflow: "hidden" }}>
                {/* Today line */}
                <div style={{ position: "absolute", left: `${todayPct}%`, top: 0, bottom: 0, width: 1, background: C.red, zIndex: 2 }} />
                {/* Bar */}
                <div style={{
                  position: "absolute", left: `${left}%`, width: `${width}%`,
                  top: 3, bottom: 3, background: color, borderRadius: 3, opacity: 0.85,
                }} title={`${fmtDateShort(t.planned_start)} – ${fmtDateShort(t.planned_end)}`} />
                {/* Progress fill */}
                {t.progress_pct > 0 && (
                  <div style={{
                    position: "absolute", left: `${left}%`, width: `${width * t.progress_pct / 100}%`,
                    top: 3, bottom: 3, background: C.green, borderRadius: "3px 0 0 3px", opacity: 0.6,
                  }} />
                )}
              </div>
              <div style={{ width: 36, textAlign: "right", fontSize: 10, color: C.muted, flexShrink: 0, paddingLeft: 6 }}>
                {t.progress_pct > 0 ? `${t.progress_pct}%` : ""}
              </div>
            </div>
          );
        })}
        {/* Today legend */}
        <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 12, paddingLeft: 200 }}>
          <div style={{ width: 12, height: 2, background: C.red }} />
          <span style={{ fontSize: 10, color: C.muted }}>Hari ini</span>
          <div style={{ width: 12, height: 8, background: C.green, borderRadius: 2, opacity: 0.6, marginLeft: 10 }} />
          <span style={{ fontSize: 10, color: C.muted }}>Sudah selesai</span>
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

  useEffect(() => {
    api.get(`/api/v1/projects/${projectId}/photos`)
      .then((res) => setPhotos(res.data?.photos ?? res.data ?? []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [projectId]);

  const cats = ["all", ...Array.from(new Set(photos.map(p => p.category)))];
  const filtered = filterCat === "all" ? photos : photos.filter(p => p.category === filterCat);

  if (loading) return <div style={{ textAlign: "center", padding: 60, color: C.mid }}>Memuat foto...</div>;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {/* Filter */}
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        {cats.map(cat => (
          <button key={cat} onClick={() => setFilterCat(cat)} style={{
            padding: "5px 12px", borderRadius: 99, fontSize: 12,
            background: filterCat === cat ? C.navy : "var(--surface)",
            color: filterCat === cat ? "#fff" : C.mid,
            border: filterCat === cat ? "none" : `1px solid ${C.border}`,
            cursor: "pointer", fontWeight: filterCat === cat ? 600 : 400,
          }}>
            {cat === "all" ? "Semua" : PHOTO_CATEGORY_LABEL[cat] ?? cat}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <div style={{ ...card, padding: 60, textAlign: "center" }}>
          <Camera size={28} style={{ color: "var(--border)", marginBottom: 10 }} />
          <div style={{ fontSize: 13, color: C.muted }}>Belum ada foto dokumentasi</div>
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10 }}>
          {filtered.map((photo, idx) => (
            <div
              key={photo.id}
              onClick={() => setLightbox(idx)}
              style={{ borderRadius: 10, overflow: "hidden", cursor: "pointer", position: "relative", aspectRatio: "4/3", background: "var(--surface-subtle)" }}
            >
              <img src={photo.file_url} alt={photo.caption ?? ""} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
              <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, padding: "6px 8px", background: "linear-gradient(transparent, rgba(0,0,0,0.6))" }}>
                <span style={{ fontSize: 10, color: "#fff", fontWeight: 500 }}>
                  {PHOTO_CATEGORY_LABEL[photo.category] ?? photo.category}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Lightbox */}
      {lightbox !== null && (
        <div
          onClick={() => setLightbox(null)}
          style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.92)", zIndex: 9999, display: "flex", alignItems: "center", justifyContent: "center" }}
        >
          <button aria-label="Tutup foto" onClick={() => setLightbox(null)} style={{ position: "absolute", top: 16, right: 16, background: "none", border: "none", color: "#fff", cursor: "pointer" }}>
            <X size={24} />
          </button>
          {lightbox > 0 && (
            <button aria-label="Foto sebelumnya" onClick={e => { e.stopPropagation(); setLightbox(l => l! - 1); }} style={{ position: "absolute", left: 16, background: "none", border: "none", color: "#fff", cursor: "pointer" }}>
              <ChevronLeft size={28} />
            </button>
          )}
          {lightbox < filtered.length - 1 && (
            <button aria-label="Foto berikutnya" onClick={e => { e.stopPropagation(); setLightbox(l => l! + 1); }} style={{ position: "absolute", right: 16, background: "none", border: "none", color: "#fff", cursor: "pointer" }}>
              <ChevronRightIcon size={28} />
            </button>
          )}
          <div onClick={e => e.stopPropagation()} style={{ maxWidth: "90vw", maxHeight: "85vh" }}>
            <img src={filtered[lightbox].file_url} alt="" style={{ maxWidth: "90vw", maxHeight: "80vh", borderRadius: 8, objectFit: "contain" }} />
            {filtered[lightbox].caption && (
              <div style={{ color: "#ccc", textAlign: "center", marginTop: 10, fontSize: 13 }}>{filtered[lightbox].caption}</div>
            )}
            <div style={{ color: "#888", textAlign: "center", marginTop: 4, fontSize: 11 }}>
              {PHOTO_CATEGORY_LABEL[filtered[lightbox].category]} · {fmtDateShort(filtered[lightbox].created_at)} · {lightbox + 1}/{filtered.length}
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

  if (loading) return <div style={{ textAlign: "center", padding: 60, color: C.mid }}>Memuat dokumen...</div>;
  if (!docs.length) return (
    <div style={{ ...card, padding: 60, textAlign: "center" }}>
      <FileText size={28} style={{ color: "var(--border)", marginBottom: 10 }} />
      <div style={{ fontSize: 13, color: C.muted }}>Belum ada dokumen yang dibagikan</div>
    </div>
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {docs.map(doc => (
        <div key={doc.id} style={{ ...card, padding: "14px 16px", display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ width: 38, height: 38, borderRadius: 10, background: C.navyLight, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            <FileText size={17} color={C.navy} />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: C.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{doc.file_name}</div>
            <div style={{ fontSize: 11, color: C.muted, marginTop: 2 }}>
              {DOC_TYPE_LABEL[doc.doc_type] ?? doc.doc_type}
              {doc.file_size ? ` · ${fmtSize(doc.file_size)}` : ""}
              {` · ${fmtDateShort(doc.uploaded_at)}`}
            </div>
            {doc.description && <div style={{ fontSize: 11, color: C.mid, marginTop: 2 }}>{doc.description}</div>}
          </div>
          <a
            href={doc.file_url}
            target="_blank" rel="noopener noreferrer"
            style={{ display: "flex", alignItems: "center", gap: 5, padding: "6px 12px", borderRadius: 7, background: C.navyLight, color: C.navy, fontSize: 12, fontWeight: 600, textDecoration: "none", flexShrink: 0 }}
          >
            <Download size={12} /> Unduh
          </a>
        </div>
      ))}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

type TabKey = "overview" | "kurva-s" | "gantt" | "foto" | "dokumen" | "progress" | "invoice";

export default function PortalProyekDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [project, setProject] = useState<Project | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<TabKey>("overview");

  useEffect(() => {
    api.get(`/api/v1/projects/${id}`).then((res) => {
      setProject(res.data);
    }).catch(() => router.replace("/portal"))
      .finally(() => setLoading(false));
  }, [id, router]);

  if (loading) return (
    <div style={{ textAlign: "center", padding: 80, color: C.mid }}>Memuat data proyek...</div>
  );
  if (!project) return null;

  const meta = STATUS_META[project.status] ?? STATUS_META.planning;

  const tabs: { key: TabKey; label: string; icon?: React.ReactNode }[] = [
    { key: "overview",  label: "Ringkasan" },
    { key: "kurva-s",   label: "Kurva S" },
    { key: "gantt",     label: "Jadwal" },
    { key: "foto",      label: "Foto" },
    { key: "dokumen",   label: "Dokumen" },
    { key: "progress",  label: "Log Progress" },
    { key: "invoice",   label: "Invoice" },
  ];

  return (
    <div style={{ maxWidth: 800, margin: "0 auto" }}>
      {/* Back */}
      <button onClick={() => router.back()} style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 16, background: "none", border: "none", cursor: "pointer", fontSize: 14, color: C.navy, fontWeight: 500, padding: 0 }}>
        <ChevronLeft size={16} /> Kembali
      </button>

      {/* Header card */}
      <div style={{ ...card, padding: 20, marginBottom: 16 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, flexWrap: "wrap" }}>
          <h1 style={{ fontSize: 20, fontWeight: 700, color: C.text, margin: 0, flex: 1 }}>{project.name}</h1>
          <span style={{ fontSize: 12, fontWeight: 600, padding: "4px 10px", borderRadius: 20, color: meta.color, background: meta.bg, flexShrink: 0 }}>{meta.label}</span>
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: "6px 20px", marginTop: 10 }}>
          {project.location && (
            <div style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 13, color: C.mid }}>
              <MapPin size={13} /> {project.location}
            </div>
          )}
          <div style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 13, color: C.mid }}>
            <Calendar size={13} /> {fmtDate(project.start_date)} – {fmtDate(project.end_date)}
          </div>
        </div>
        {/* Progress bar */}
        <div style={{ marginTop: 16 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 13, color: C.mid }}>
              <TrendingUp size={13} /> Progress Fisik
            </div>
            <span style={{ fontSize: 15, fontWeight: 700, color: C.navy }}>{project.progress_pct ?? 0}%</span>
          </div>
          <div style={{ height: 8, background: "var(--border)", borderRadius: 4, overflow: "hidden" }}>
            <div style={{ height: "100%", borderRadius: 4, width: `${project.progress_pct ?? 0}%`, background: C.navy, transition: "width 0.5s ease" }} />
          </div>
        </div>
        <div style={{ marginTop: 14, padding: "12px 16px", background: C.navyLight, borderRadius: 10 }}>
          <div style={{ fontSize: 12, color: C.mid, marginBottom: 2 }}>Nilai Kontrak</div>
          <div style={{ fontSize: 20, fontWeight: 700, color: C.navy }}>{fmt(project.contract_value ?? 0)}</div>
        </div>
      </div>

      {/* Tabs — scrollable horizontal */}
      <div style={{ display: "flex", overflowX: "auto", borderBottom: `1px solid ${C.border}`, marginBottom: 16, gap: 0, WebkitOverflowScrolling: "touch" as never }}>
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            style={{
              padding: "10px 16px", fontSize: 13, fontWeight: activeTab === tab.key ? 600 : 400,
              color: activeTab === tab.key ? C.navy : C.mid,
              borderBottom: activeTab === tab.key ? `2px solid ${C.navy}` : "2px solid transparent",
              background: "none", border: "none", borderRadius: 0,
              cursor: "pointer", transition: "all 0.15s", whiteSpace: "nowrap", flexShrink: 0,
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {activeTab === "kurva-s"  && <KurvaSTab   projectId={project.id} />}
      {activeTab === "gantt"    && <GanttTab    projectId={project.id} />}
      {activeTab === "foto"     && <FotoTab     projectId={project.id} />}
      {activeTab === "dokumen"  && <DokumenTab  projectId={project.id} />}

      {/* Tab: Ringkasan */}
      {activeTab === "overview" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {project.pm && (
            <div style={{ ...card, padding: 16 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: C.mid, marginBottom: 10, textTransform: "uppercase", letterSpacing: "0.05em" }}>Project Manager</div>
              <div style={{ fontSize: 15, fontWeight: 600, color: C.text }}>{project.pm.name}</div>
              {project.pm.phone && (
                <a
                  href={`https://wa.me/62${project.pm.phone.replace(/^0/, "")}`}
                  target="_blank" rel="noopener noreferrer"
                  style={{ display: "inline-flex", alignItems: "center", gap: 6, marginTop: 8, padding: "6px 14px", borderRadius: 8, background: "#25D366", color: "var(--surface)", fontSize: 13, fontWeight: 500, textDecoration: "none" }}
                >
                  💬 Hubungi via WhatsApp
                </a>
              )}
            </div>
          )}
          {project.milestones?.length > 0 && (
            <div style={{ ...card, padding: 16 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: C.mid, marginBottom: 12, textTransform: "uppercase", letterSpacing: "0.05em" }}>Milestone</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {project.milestones.map((m) => {
                  const ms = MILESTONE_STATUS[m.status] ?? MILESTONE_STATUS.pending;
                  return (
                    <div key={m.id} style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
                      <span style={{ color: ms.color, marginTop: 1, flexShrink: 0 }}>{ms.icon}</span>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 14, fontWeight: 500, color: C.text }}>{m.title}</div>
                        {m.description && <div style={{ fontSize: 12, color: C.mid, marginTop: 1 }}>{m.description}</div>}
                        <div style={{ fontSize: 12, color: C.mid, marginTop: 2 }}>
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
            <div style={{ ...card, padding: 16 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: C.mid, marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.05em" }}>Catatan</div>
              <div style={{ fontSize: 14, color: C.text, lineHeight: 1.6 }}>{project.notes}</div>
            </div>
          )}
        </div>
      )}

      {/* Tab: Log Progress */}
      {activeTab === "progress" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {(!project.progress_logs?.length) && (
            <div style={{ ...card, padding: 40, textAlign: "center", color: C.mid }}>Belum ada log progress</div>
          )}
          {project.progress_logs?.map((log) => (
            <div key={log.id} style={{ ...card, padding: 16 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                <div style={{ fontSize: 13, color: C.mid }}>
                  <Calendar size={13} style={{ display: "inline", marginRight: 4 }} />
                  {fmtDateShort(log.logged_at)}
                  {log.weather && <span style={{ marginLeft: 8, fontSize: 12 }}>{log.weather}</span>}
                  {log.worker_count !== null && log.worker_count > 0 && (
                    <span style={{ marginLeft: 8, fontSize: 12 }}>· {log.worker_count} pekerja</span>
                  )}
                </div>
                {log.pct_overall !== null && (
                  <div style={{ fontSize: 16, fontWeight: 700, color: C.navy, background: C.navyLight, padding: "2px 10px", borderRadius: 20 }}>
                    {log.pct_overall}%
                  </div>
                )}
              </div>
              {log.notes && <div style={{ fontSize: 13, color: C.text, lineHeight: 1.6 }}>{log.notes}</div>}
            </div>
          ))}
        </div>
      )}

      {/* Tab: Invoice */}
      {activeTab === "invoice" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {(!project.invoices?.length) && (
            <div style={{ ...card, padding: 40, textAlign: "center", color: C.mid }}>Belum ada invoice</div>
          )}
          {project.invoices?.map((inv) => {
            const st = INVOICE_STATUS[inv.status] ?? INVOICE_STATUS.unpaid;
            return (
              <div key={inv.id} style={{ ...card, padding: 16 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
                  <div>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <FileText size={15} color={C.navy} />
                      <span style={{ fontSize: 14, fontWeight: 600, color: C.text }}>{inv.invoice_number}</span>
                    </div>
                    <div style={{ fontSize: 12, color: C.mid, marginTop: 4 }}>Jatuh tempo: {fmtDateShort(inv.due_date)}</div>
                  </div>
                  <span style={{ fontSize: 11, fontWeight: 600, padding: "3px 8px", borderRadius: 20, color: st.color, background: st.bg, flexShrink: 0 }}>{st.label}</span>
                </div>
                <div style={{ marginTop: 12, display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
                  <div>
                    <div style={{ fontSize: 11, color: C.mid }}>Total</div>
                    <div style={{ fontSize: 15, fontWeight: 700, color: C.text }}>{fmt(inv.total_amount)}</div>
                  </div>
                  {inv.amount_due > 0 && (
                    <div style={{ textAlign: "right" }}>
                      <div style={{ fontSize: 11, color: C.mid }}>Sisa tagihan</div>
                      <div style={{ fontSize: 15, fontWeight: 700, color: C.red }}>{fmt(inv.amount_due)}</div>
                    </div>
                  )}
                  {inv.status === "paid" && (
                    <div style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 13, color: C.green, fontWeight: 600 }}>
                      <CheckCircle2 size={15} /> Lunas
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
