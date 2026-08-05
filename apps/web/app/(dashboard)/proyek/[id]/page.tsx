"use client";

import { useCallback, useEffect, useReducer, useState } from "react";
import { useTutupEsc } from "@/lib/use-tutup-esc";
import { createPortal } from "react-dom";
import { useParams, useRouter } from "next/navigation";
import { api, getStoredUser } from "@/lib/api";
import { useIzin } from "@/lib/use-izin";
import {
  MapPin, Calendar, RefreshCw,
  User, TrendingUp,
  Clock, CheckCircle2, AlertCircle,
  Wallet, Receipt,
  Pencil, Trash2,
  CreditCard, CheckSquare, Banknote, FileText,
  ChevronDown, Printer, BarChart3, Activity,
  DollarSign, Target, ArrowUpRight, ArrowDownRight,
} from "lucide-react";
import { ProjectModal } from "@/components/project-modal";
import { useToast } from "@/components/toast";
import { ProgressSection } from "@/components/progress-section";
import { MilestoneSection } from "@/components/milestone-section";
import { RabSection } from "@/components/rab-section";
import { DocumentSection } from "@/components/document-section";
import { ContractGeneratorModal } from "@/components/contract-generator-modal";
import { KurvaSSection } from "@/components/kurva-s-section";
import { TerminPaymentModal, type TerminInfo } from "@/components/termin-payment-modal";
import { MandorSection } from "@/components/mandor-section";
import { ChangeOrderSection } from "@/components/change-order-section";
import { GanttSection } from "@/components/gantt-section";
import { LookAheadSection } from "@/components/look-ahead-section";
import { RantaiKontrakSection } from "@/components/rantai-kontrak-section";
import { KlaimSection } from "@/components/klaim-section";
import { SuratSection } from "@/components/surat-section";
import { InstruksiLapanganSection } from "@/components/instruksi-lapangan-section";
import { PhotoGallery } from "@/components/photo-gallery";
import { RabScheduleModal, AbsorptionLogModal } from "@/components/rab-schedule-modal";
import { AbsorptionLogTable } from "@/components/absorption-log-table";

// ─── Types ────────────────────────────────────────────────────────────────────

interface Client { id: string; contact_person: string; phone: string; email: string; address: string | null; client_type: string }
interface PM { id: string; name: string; email: string; phone: string }
interface TerminSchedule {
  id: string; termin_number: number; label: string; amount: number;
  pct_of_contract: number; target_date: string | null;
  status: "pending" | "billed" | "paid"; notes: string | null;
  trigger_type: "on_sign" | "on_progress" | "on_retention" | null;
  trigger_pct: number | null;
  due_days: number | null;
}
interface Milestone {
  id: string; title: string; description: string | null;
  target_date: string; completed_at: string | null;
  status: "pending" | "on_track" | "at_risk" | "overdue" | "completed";
  sort_order: number;
}
interface Kasbon {
  id: string; amount: number; fund_source: string; purpose: string;
  kasbon_date: string; status: string; notes: string | null;
}
interface BoronganSettlement {
  id: string; borongan_value: number; total_kasbon: number;
  remaining_balance: number; settled_at: string;
}
interface WorkScope {
  id: string; scope_name: string; description: string | null;
  payment_system: "harian" | "borongan" | "progress_pct";
  borongan_value: number | null; progress_pct_done: number; status: string;
  start_date: string | null; end_date: string | null;
  kasbons: Kasbon[];
  borongan_settlements: BoronganSettlement[];
}
interface MandorAssignment {
  id: string; status: string; assigned_at: string; notes: string | null;
  mandor: { id: string; name: string; phone: string | null } | null;
  assigner: { id: string; name: string } | null;
  work_scopes: WorkScope[];
}
interface ProgressLog {
  id: string; pct_overall: number; weather: string | null;
  worker_count: number | null; notes: string | null; logged_at: string;
  reporter: { id: string; name: string } | null;
}
interface Invoice {
  id: string; invoice_number: string; invoice_type: string;
  base_amount: number; total_amount: number; amount_paid: number;
  amount_due: number; issued_date: string; due_date: string;
  paid_date: string | null; status: string; notes: string | null;
}
interface Project {
  id: string; name: string; description: string | null; location: string;
  contract_model: "termin" | "komisi"; tax_scheme: "pph_final" | "ppn";
  contract_value: number; commission_pct: number | null;
  retention_pct: number; retention_amount: number;
  start_date: string; end_date: string; actual_end_date: string | null;
  status: string; progress_pct: number; notes: string | null;
  clients: Client | null; pm: PM | null;
  termin_schedules: TerminSchedule[];
  milestones: Milestone[];
  mandor_assignments: MandorAssignment[];
  progress_logs: ProgressLog[];
  invoices: Invoice[];
  scopeless_kasbons: Kasbon[];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const fmt = (n: number) =>
  new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(n);

const fmtCompact = (n: number): string => {
  const abs = Math.abs(n);
  const sign = n < 0 ? "-" : "";
  if (abs >= 1_000_000_000) return `${sign}Rp ${(abs / 1_000_000_000).toFixed(1)}M`;
  if (abs >= 1_000_000) return `${sign}Rp ${(abs / 1_000_000).toFixed(1)}Jt`;
  if (abs >= 1_000) return `${sign}Rp ${(abs / 1_000).toFixed(0)}Rb`;
  return `${sign}Rp ${abs.toFixed(0)}`;
};

const fmtDate = (d: string) =>
  new Date(d).toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" });

const fmtDateShort = (d: string) =>
  new Date(d).toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" });

const daysUntil = (d: string) =>
  Math.ceil((new Date(d).getTime() - Date.now()) / 86400000);

const daysSince = (d: string) =>
  Math.floor((Date.now() - new Date(d).getTime()) / 86400000);


// ─── Design tokens ────────────────────────────────────────────────────────────

import { C } from "@/lib/warna-ui";

const card: React.CSSProperties = {
  background: "var(--surface)",
  border: "1px solid var(--border)",
  borderRadius: 14,
  boxShadow: "var(--naik-1)",
};

const STATUS_META: Record<string, { label: string; color: string; bg: string }> = {
  // project statuses
  active:      { label: "Aktif",       color: C.navy,    bg: C.navyLight },
  in_progress: { label: "Berlangsung", color: C.navy,    bg: C.navyLight },
  completed:   { label: "Selesai",     color: C.green,   bg: C.greenBg },
  on_hold:     { label: "Ditunda",     color: C.yellow,  bg: C.yellowBg },
  draft:       { label: "Draft",       color: C.muted,   bg: "var(--surface-hover)" },
  cancelled:   { label: "Batal",       color: C.red,     bg: C.redBg },
  // termin statuses
  pending:     { label: "Pending",     color: C.muted,   bg: "var(--surface-hover)" },
  billed:      { label: "Ditagih",     color: "var(--info)", bg: "var(--info-bg)" },
  paid:        { label: "Lunas",       color: C.green,   bg: C.greenBg },
  // milestone statuses
  on_track:    { label: "On Track",    color: C.green,   bg: C.greenBg },
  at_risk:     { label: "Berisiko",    color: C.yellow,  bg: C.yellowBg },
  overdue:     { label: "Terlambat",   color: C.red,     bg: C.redBg },
  // kasbon/invoice/assignment statuses
  approved:    { label: "Disetujui",   color: C.green,   bg: C.greenBg },
  rejected:    { label: "Ditolak",     color: C.red,     bg: C.redBg },
  settled:     { label: "Lunas",       color: C.green,   bg: C.greenBg },
  sent:        { label: "Terkirim",    color: "var(--info)", bg: "var(--info-bg)" },
  partial:     { label: "Sebagian",    color: C.yellow,  bg: C.yellowBg },
  assigned:    { label: "Ditugaskan",  color: C.navy,    bg: C.navyLight },
  inactive:    { label: "Nonaktif",    color: C.muted,   bg: "var(--surface-hover)" },
};

const PURPOSE_LABEL: Record<string, string> = {
  gaji_tukang: "Upah tukang", uang_makan: "Uang makan",
  pembelian_alat: "Beli alat", operasional: "Operasional", lain_lain: "Lain-lain",
};
const INVOICE_TYPE_LABEL: Record<string, string> = {
  termin_billing: "Termin", commission_billing: "Komisi", retention_release: "Retensi",
};

// ─── Sub-components ───────────────────────────────────────────────────────────

function Skeleton({ h = 20, w = "100%" }: { h?: number; w?: string | number }) {
  return (
    <div style={{
      height: h, width: w, borderRadius: 6,
      background: "linear-gradient(90deg, var(--surface-hover) 0%, var(--border) 50%, var(--surface-hover) 100%)",
      backgroundSize: "200% 100%",
      animation: "shimmer 1.5s ease-in-out infinite",
    }} />
  );
}

function Badge({ status }: { status: string }) {
  const m = STATUS_META[status] ?? { label: status, color: C.muted, bg: "var(--surface-hover)" };
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 4,
      padding: "2px 8px", borderRadius: 99, fontSize: 11, fontWeight: 600,
      color: m.color, background: m.bg,
    }}>
      <span style={{ width: 5, height: 5, borderRadius: "50%", background: m.color }} />
      {m.label}
    </span>
  );
}

function SectionTitle({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <h2 style={{ display: "flex", alignItems: "center", gap: 8, fontFamily: "var(--font-display)", fontSize: 15, fontWeight: 600, color: C.text, marginBottom: 16, ...style }}>
      <span style={{ width: 3, height: 16, background: C.navy, borderRadius: 0, flexShrink: 0 }} />
      {children}
    </h2>
  );
}

function InfoRow({ icon, label, value, valueColor }: {
  icon: React.ReactNode; label: string; value: React.ReactNode; valueColor?: string;
}) {
  return (
    <div style={{ display: "flex", alignItems: "flex-start", gap: 8, paddingBottom: 12, marginBottom: 12, borderBottom: "1px solid var(--surface-subtle)" }}>
      <span style={{ color: C.muted, marginTop: 2, flexShrink: 0 }}>{icon}</span>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 11, color: C.muted, marginBottom: 2 }}>{label}</div>
        <div style={{ fontSize: 13, fontWeight: 500, color: valueColor ?? C.text }}>{value}</div>
      </div>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function ProjectDetailPage() {
  const [mounted, mount] = useReducer(() => true, false);
  useEffect(mount, [mount]);
  if (!mounted) return null;
  return <ProjectDetailContent />;
}

function ProjectDetailContent() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;
  const { showToast } = useToast();
  // Diangkat dari JSX: `hasPermission` di jalur render membuat pohon server
  // dan klien berbeda. Detail: `lib/use-izin.ts`.
  const bolehKontrak = useIzin("projects:contract");
  const bolehBayarTermin = useIzin("finance:termin:pay");
  const bolehAturMandor = useIzin("mandor:assign");

  const [project, setProject] = useState<Project | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showEditModal, setShowEditModal] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showContractModal, setShowContractModal] = useState(false);
  const [payingTermin, setPayingTermin] = useState<TerminInfo | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [rabCollapsed, setRabCollapsed] = useState(false);
  const [ganttCollapsed, setGanttCollapsed] = useState(false);
  const [showScheduleModal, setShowScheduleModal] = useState(false);
  const [showAbsorptionModal, setShowAbsorptionModal] = useState(false);
  const [serapanPct, setSerapanPct] = useState<number | null>(null);
  const [serapanRefreshKey, setSerapanRefreshKey] = useState(0);
  const [evmData, setEvmData] = useState<{
    bac: number; ac: number; ev: number; pv: number;
    cpi: number; spi: number; eac: number; vac: number;
  } | null>(null);
  const [showPrintModal, setShowPrintModal] = useState(false);

  // Modal yang dirender LANGSUNG oleh komponen halaman ini (bukan komponen
  // modal terpisah ber-prop `onClose`), jadi jalan keluar papan tiknya harus
  // dipasang di sini. Tanpa ini keduanya menjebak: Tab berputar di dalam
  // dialog dan satu-satunya jalan keluar adalah mengambil tetikus.
  useTutupEsc(showDeleteConfirm ? () => setShowDeleteConfirm(false) : null);
  useTutupEsc(showPrintModal ? () => setShowPrintModal(false) : null);

  const handleOverallSerapanChange = useCallback((pct: number) => {
    setSerapanPct(pct);
  }, []);

  const currentUser = getStoredUser();
  // ADR-004: capability, bukan nama jabatan. Role kustom `direktur` punya
  // permission ini tapi UI lama menyembunyikan tombolnya karena mengecek
  // `role === "admin"`. Tiap key diverifikasi ke `requirePermission` di
  // rute API-nya — bukan ditebak dari nama tombolnya.
  const isAdmin = useIzin("projects:delete");
  const canEditProject = useIzin("projects:edit");

  useEffect(() => { if (id) fetchProject(); }, [id]);

  useEffect(() => { setSerapanPct(null); setEvmData(null); }, [id]);

  useEffect(() => {
    if (!id) return;
    api.get<{ meta?: { evm?: typeof evmData } }>(`/api/v1/projects/${id}/kurva-s`)
      .then(res => { if (res.data.meta?.evm) setEvmData(res.data.meta.evm as typeof evmData); })
      .catch(() => {});
  }, [id]);

  async function fetchProject() {
    setLoading(true);
    setError("");
    try {
      const { data } = await api.get<{ project: Project }>(`/api/v1/projects/${id}`);
      setProject(data.project);
    } catch {
      setError("Proyek tidak ditemukan atau gagal memuat.");
    } finally {
      setLoading(false);
    }
  }

  async function handleDelete() {
    setDeleting(true);
    try {
      await api.delete(`/api/v1/projects/${id}`);
      showToast("success", "Proyek berhasil dihapus.");
      router.push("/proyek");
    } catch {
      showToast("error", "Gagal menghapus proyek. Coba lagi.");
      setDeleting(false);
      setShowDeleteConfirm(false);
    }
  }

  function handleEditSuccess() {
    fetchProject();
    showToast("success", "Proyek berhasil diperbarui!");
  }

  if (loading) {
    return (
      <div style={{ padding: "32px 36px" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          <Skeleton h={32} w={300} />
          <div style={{ ...card, padding: 24 }}><div style={{ display: "flex", flexDirection: "column", gap: 12 }}><Skeleton h={24} w="50%" /><Skeleton h={16} w="30%" /><Skeleton h={100} /></div></div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
            <div style={{ ...card, padding: 24 }}><Skeleton h={200} /></div>
            <div style={{ ...card, padding: 24 }}><Skeleton h={200} /></div>
          </div>
        </div>
      </div>
    );
  }

  if (error || !project) {
    return (
      <div style={{ padding: "32px 36px" }}>
        <div style={{ ...card, padding: "48px 32px", textAlign: "center" }}>
          <AlertCircle size={40} style={{ color: "var(--danger-border)", marginBottom: 12 }} />
          <p style={{ fontSize: 15, fontWeight: 600, color: C.text, marginBottom: 6 }}>{error || "Proyek tidak ditemukan"}</p>
          <button onClick={fetchProject} style={{ color: C.navy, background: "none", border: "none", cursor: "pointer", fontSize: 13, display: "inline-flex", alignItems: "center", gap: 4, fontWeight: 500 }}>
            <RefreshCw size={13} /> Coba lagi
          </button>
        </div>
      </div>
    );
  }

  const p = project;
  const daysLeft = daysUntil(p.end_date);
  const isOverdue = p.status !== "completed" && daysLeft < 0;

  // Aggregate kasbon: scope-based + scopeless (project-level)
  const allKasbons = [
    ...p.mandor_assignments.flatMap(ma =>
      (ma.work_scopes ?? []).flatMap(ws =>
        (ws.kasbons ?? []).map(k => ({ ...k, mandorName: ma.mandor?.name ?? "—", scopeName: ws.scope_name }))
      )
    ),
    ...(p.scopeless_kasbons ?? []).map(k => {
      const ma = p.mandor_assignments.find(a => a.status === "assigned");
      return { ...k, mandorName: ma?.mandor?.name ?? "—", scopeName: "Umum (tanpa scope)" };
    }),
  ];
  const kasbonPending = allKasbons.filter(k => k.status === "pending").reduce((s, k) => s + Number(k.amount), 0);
  const kasbonApproved = allKasbons.filter(k => k.status === "approved").reduce((s, k) => s + Number(k.amount), 0);
  const kasbonSettled = allKasbons.filter(k => k.status === "settled").reduce((s, k) => s + Number(k.amount), 0);

  // Termin yang syaratnya sudah terpenuhi tapi masih pending (belum ditagih)
  const overdueTerminCount = (p.termin_schedules ?? []).filter(t => {
    if (t.status !== "pending") return false;
    if (t.trigger_type === "on_sign") return true;
    if (t.trigger_type === "on_progress" && t.trigger_pct !== null) return p.progress_pct >= t.trigger_pct;
    return false;
  }).length;

  return (
    <div style={{ padding: "var(--pad-atas) var(--pad-x) var(--pad-bawah)", width: "100%", maxWidth: "var(--w-luas)", margin: "0 auto" }}>

      {/* ── Sticky section navigator ── */}
      <div style={{
        position: "sticky", top: 0, zIndex: 40,
        background: "rgba(var(--bg-rgb, 248,249,250), 0.92)",
        backdropFilter: "blur(8px)",
        borderBottom: "1px solid var(--border)",
        marginBottom: 20, marginLeft: -36, marginRight: -36,
        padding: "8px 36px",
        display: "flex", alignItems: "center", gap: 4, overflowX: "auto",
      }}>
        {[
          { href: "#sec-info", label: "Info" },
          ...(p.contract_model === "termin" && (p.termin_schedules?.length ?? 0) > 0
            ? [{ href: "#sec-termin", label: "Termin" + (overdueTerminCount > 0 ? ` ⚠${overdueTerminCount}` : "") }]
            : []),
          { href: "#sec-rab", label: "RAB" },
          { href: "#sec-serapan", label: "Serapan" },
          { href: "#sec-gantt", label: "Gantt" },
          { href: "#sec-co", label: "Change Order" },
          { href: "#sec-kurvas", label: "Kurva S" },
          { href: "#sec-dokumen", label: "Dokumen" },
          { href: "#sec-foto", label: "Foto" },
          { href: "#sec-mandor", label: "Mandor" },
          ...(allKasbons.length > 0 ? [{ href: "#sec-kasbon", label: "Kasbon" }] : []),
          { href: "#sec-progress", label: "Progress Log" },
          { href: "#sec-milestone", label: "Milestone" },
          ...(p.invoices?.length ?? 0) > 0 ? [{ href: "#sec-invoice", label: "Invoice" }] : [],
        ].map(item => (
          <a
            key={item.href}
            href={item.href}
            style={{
              padding: "4px 8px", borderRadius: 6, fontSize: 11, fontWeight: 600,
              color: item.label.includes("⚠") ? C.red : C.mid,
              background: item.label.includes("⚠") ? C.redBg : "transparent",
              border: item.label.includes("⚠") ? `1px solid ${C.redBorder}` : "none",
              textDecoration: "none", whiteSpace: "nowrap", flexShrink: 0,
              transition: "all 0.15s",
            }}
            onMouseEnter={e => {
              if (!item.label.includes("⚠")) {
                e.currentTarget.style.background = "var(--surface-hover)";
                e.currentTarget.style.color = C.navy;
              }
            }}
            onMouseLeave={e => {
              if (!item.label.includes("⚠")) {
                e.currentTarget.style.background = "transparent";
                e.currentTarget.style.color = C.mid;
              }
            }}
          >
            {item.label}
          </a>
        ))}
      </div>

      {/* ── Breadcrumb ── */}
      <div className="rise" style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 20 }}>
        <span style={{ fontSize: 13, color: C.muted }}>Puraloka Suite</span>
        <span style={{ color: "var(--border-strong)", fontSize: 13 }}>/</span>
        <button
          onClick={() => router.push("/proyek")}
          style={{ display: "inline-flex", alignItems: "center", gap: 2, background: "none", border: "none", cursor: "pointer", color: C.mid, fontSize: 13, padding: 0 }}
          onMouseEnter={e => { e.currentTarget.style.color = C.navy; e.currentTarget.style.textDecoration = "underline"; }}
          onMouseLeave={e => { e.currentTarget.style.color = C.mid; e.currentTarget.style.textDecoration = "none"; }}
        >
          Proyek
        </button>
        <span style={{ color: "var(--border-strong)", fontSize: 13 }}>/</span>
        <span style={{ fontSize: 13, fontWeight: 600, color: C.text }}>{p.name}</span>
      </div>

      {/* ── Header card ── */}
      <div className="rise rise-1" style={{ ...card, padding: 24, marginBottom: 20 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 16, flexWrap: "wrap" }}>
          <div style={{ flex: 1 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
              <Badge status={p.status} />
              <span style={{
                display: "inline-block", padding: "2px 8px", borderRadius: 6,
                fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em",
                background: "var(--surface-hover)", color: C.mid,
              }}>
                {p.contract_model === "termin" ? "TERMIN" : "KOMISI"}
              </span>
              <span style={{
                display: "inline-block", padding: "2px 8px", borderRadius: 6,
                fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em",
                background: C.navyLight, color: C.navy,
              }}>
                {p.tax_scheme === "pph_final" ? "PPh Final" : "PPN"}
              </span>
            </div>
            <h1 style={{ fontFamily: "var(--font-display)", fontSize: 24, fontWeight: 800, color: C.text, marginBottom: 8, lineHeight: 1.2 }}>
              {p.name}
            </h1>
            <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
              <MapPin size={13} style={{ color: C.muted }} />
              <span style={{ fontSize: 13, color: C.muted }}>{p.location}</span>
            </div>
            {p.description && (
              <p style={{ fontSize: 13, color: C.mid, marginTop: 10, lineHeight: 1.6, maxWidth: 560 }}>{p.description}</p>
            )}
          </div>

          {/* Action buttons */}
          <div style={{ display: "flex", gap: 8, flexShrink: 0, flexWrap: "wrap" }}>
            {bolehKontrak && (
              <button
                onClick={() => setShowContractModal(true)}
                style={{
                  display: "inline-flex", alignItems: "center", gap: 6,
                  padding: "6px 12px", borderRadius: 6, fontSize: 12, fontWeight: 600,
                  background: "var(--navy)", color: "var(--surface)",
                  border: "none", cursor: "pointer",
                }}
                onMouseEnter={e => { e.currentTarget.style.background = "var(--aksen-pekat)"; }}
                onMouseLeave={e => { e.currentTarget.style.background = "var(--navy)"; }}
              >
                <FileText size={13} /> Generate Kontrak
              </button>
            )}
            <ActionBtn onClick={() => setShowPrintModal(true)}>
              <Printer size={13} /> Ringkasan
            </ActionBtn>
            <ActionBtn onClick={() => setShowEditModal(true)}>
              <Pencil size={13} /> Edit
            </ActionBtn>
            {isAdmin && (
              <ActionBtn danger onClick={() => setShowDeleteConfirm(true)}>
                <Trash2 size={13} /> Hapus
              </ActionBtn>
            )}
          </div>
        </div>
      </div>

      {/* ── Quick stats bar ── */}
      <div className="rise rise-2" style={{ ...card, padding: "16px 24px", marginBottom: 20, display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 0 }}>
        <QuickStat label="Hari Berjalan" value={`${daysSince(p.start_date)} hari`} />
        <QuickStat
          label="Hari Tersisa"
          value={isOverdue ? `${Math.abs(daysLeft)} hari terlambat` : `${daysLeft} hari`}
          valueColor={isOverdue ? C.red : undefined}
          divider
        />
        <QuickStat
          label="Invoice Terbayar"
          value={fmt((p.invoices ?? []).filter(i => i.status === "paid" || Number(i.amount_paid) > 0).reduce((s, i) => s + Number(i.amount_paid), 0))}
          divider
        />
        <QuickStat
          label="Total Kasbon"
          value={fmt(allKasbons.reduce((s, k) => s + Number(k.amount), 0))}
          divider
        />
      </div>

      {/* ── Financial mini-dashboard ── */}
      {(() => {
        const totalInvoiced = (p.invoices ?? []).reduce((s, i) => s + Number(i.total_amount), 0);
        const totalPaid = (p.invoices ?? []).filter(i => i.status === "paid" || Number(i.amount_paid) > 0).reduce((s, i) => s + Number(i.amount_paid), 0);
        const outstanding = (p.invoices ?? []).reduce((s, i) => s + Number(i.amount_due), 0);
        const kasbonBeredar = allKasbons.filter(k => k.status === "approved").reduce((s, k) => s + Number(k.amount), 0);
        const contractVal = Number(p.contract_value);
        const rabTotal = evmData?.bac ?? contractVal;
        const sisaAnggaran = rabTotal - (evmData?.ac ?? 0);
        const cpi = evmData?.cpi ?? null;
        const spi = evmData?.spi ?? null;
        const eac = evmData?.eac ?? null;

        const FinCard = ({ icon, label, value, sub, color, bg }: {
          icon: React.ReactNode; label: string; value: string;
          sub?: string; color: string; bg: string;
        }) => (
          <div style={{
            padding: "12px 16px", borderRadius: 10, background: bg,
            border: `1px solid ${color}22`, display: "flex", flexDirection: "column", gap: 6,
          }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <span style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", color }}>{label}</span>
              <span style={{ color, opacity: 0.7 }}>{icon}</span>
            </div>
            <div style={{ fontSize: 17, fontWeight: 800, color, fontFamily: "var(--font-display)", lineHeight: 1 }}>{value}</div>
            {sub && <div style={{ fontSize: 10, color, opacity: 0.65 }}>{sub}</div>}
          </div>
        );

        const EVMBadge = ({ label, val, good }: { label: string; val: number | null; good: (v: number) => boolean }) => {
          if (val === null) return null;
          const ok = good(val);
          const warn = !ok && Math.abs(val - 1) < 0.2;
          const color = ok ? C.green : warn ? C.yellow : C.red;
          const bg = ok ? C.greenBg : warn ? C.yellowBg : C.redBg;
          return (
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", padding: "8px 12px", borderRadius: 10, background: bg, border: `1px solid ${color}33`, minWidth: 80 }}>
              <span style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", color, letterSpacing: "0.05em", marginBottom: 4 }}>{label}</span>
              <span style={{ fontSize: 17, fontWeight: 800, color, lineHeight: 1 }}>{val.toFixed(2)}</span>
              <span style={{ fontSize: 10, color, marginTop: 3, opacity: 0.7 }}>{ok ? "Baik" : warn ? "Perhatian" : "Kritis"}</span>
            </div>
          );
        };

        return (
          <div className="rise rise-2b" style={{ marginBottom: 20 }}>
            {/* Financial cards 2×3 */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8, marginBottom: 10 }}>
              <FinCard
                icon={<DollarSign size={14} />}
                label="Nilai Kontrak"
                value={fmtCompact(contractVal)}
                sub={`RAB: ${fmtCompact(rabTotal)}`}
                color={C.navy}
                bg={C.navyLight}
              />
              <FinCard
                icon={<Receipt size={14} />}
                label="Invoice Tertagih"
                value={fmtCompact(totalInvoiced)}
                sub={`Terbayar: ${fmtCompact(totalPaid)}`}
                color={C.green}
                bg={C.greenBg}
              />
              <FinCard
                icon={<AlertCircle size={14} />}
                label="Piutang Aktif"
                value={outstanding > 0 ? fmtCompact(outstanding) : "Lunas"}
                sub={outstanding > 0 ? "Belum diterima" : "Semua invoice lunas"}
                color={outstanding > 0 ? C.yellow : C.green}
                bg={outstanding > 0 ? C.yellowBg : C.greenBg}
              />
              <FinCard
                icon={<Wallet size={14} />}
                label="Kasbon Beredar"
                value={fmtCompact(kasbonBeredar)}
                sub="Status: approved"
                color={kasbonBeredar > 0 ? "var(--data-5)" : C.muted}
                bg={kasbonBeredar > 0 ? "var(--warning-bg)" : "var(--surface-subtle)"}
              />
              <FinCard
                icon={<BarChart3 size={14} />}
                label="Sisa Anggaran"
                value={evmData ? fmtCompact(Math.max(0, sisaAnggaran)) : "—"}
                sub={evmData ? (sisaAnggaran < 0 ? "⚠ Over budget" : `Terpakai: ${fmtCompact(evmData.ac)}`) : "Menunggu data Kurva S"}
                color={evmData && sisaAnggaran < 0 ? C.red : C.navy}
                bg={evmData && sisaAnggaran < 0 ? C.redBg : C.navyLight}
              />
              <FinCard
                icon={<Target size={14} />}
                label="Estimasi Biaya Akhir"
                value={eac ? fmtCompact(eac) : "—"}
                sub={eac && rabTotal > 0 ? (eac > rabTotal ? `+${fmtCompact(eac - rabTotal)} dari RAB` : `-${fmtCompact(rabTotal - eac)} hemat`) : "Menunggu data EVM"}
                color={eac && rabTotal > 0 ? (eac > rabTotal ? C.red : C.green) : C.muted}
                bg={eac && rabTotal > 0 ? (eac > rabTotal ? C.redBg : C.greenBg) : "var(--surface-subtle)"}
              />
            </div>
            {/* EVM performance badges — hanya tampil kalau ada data */}
            {(cpi !== null || spi !== null) && (
              <div style={{
                ...card, padding: "12px 16px",
                display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap",
              }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6, marginRight: 4 }}>
                  <Activity size={14} style={{ color: C.navy }} />
                  <span style={{ fontSize: 11, fontWeight: 700, color: C.text }}>Performa EVM</span>
                </div>
                <EVMBadge label="CPI" val={cpi} good={v => v >= 1} />
                <EVMBadge label="SPI" val={spi} good={v => v >= 1} />
                {evmData?.vac !== undefined && (
                  <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 6 }}>
                    {evmData.vac >= 0
                      ? <ArrowDownRight size={14} style={{ color: C.green }} />
                      : <ArrowUpRight size={14} style={{ color: C.red }} />}
                    <span style={{ fontSize: 11, fontWeight: 600, color: evmData.vac >= 0 ? C.green : C.red }}>
                      VAC {evmData.vac >= 0 ? "+" : ""}{fmtCompact(evmData.vac)}
                    </span>
                    <span style={{ fontSize: 10, color: C.muted }}>
                      {evmData.vac >= 0 ? "Hemat dari RAB" : "Melebihi RAB"}
                    </span>
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })()}

      {/* ── Termin alert banner ── */}
      {(() => {
        const readyTermins = (p.termin_schedules ?? []).filter(t => {
          if (t.status !== "pending") return false;
          if (t.trigger_type === "on_sign") return true;
          if (t.trigger_type === "on_progress" && t.trigger_pct !== null) {
            return p.progress_pct >= t.trigger_pct;
          }
          return false;
        });
        if (readyTermins.length === 0) return null;
        return (
          <div className="rise rise-2b" style={{
            marginBottom: 20, padding: "12px 16px", borderRadius: 10,
            background: "linear-gradient(135deg, var(--warning-bg), var(--warning-bg))",
            border: "1px solid var(--warning-border)",
            display: "flex", alignItems: "flex-start", gap: 12,
          }}>
            <div style={{
              width: 36, height: 36, borderRadius: 10, flexShrink: 0,
              background: "var(--warning-bg)", border: "1.5px solid #FCD34D",
              display: "flex", alignItems: "center", justifyContent: "center",
            }}>
              <Receipt size={18} color="var(--warning)" />
            </div>
            <div>
              <p style={{ fontSize: 13, fontWeight: 700, color: "var(--on-warning-bg)", margin: "0 0 4px" }}>
                {readyTermins.length} Termin Siap Ditagih
              </p>
              <p style={{ fontSize: 12, color: "var(--warning)", margin: 0 }}>
                {readyTermins.map(t =>
                  `${t.label} (${t.pct_of_contract}% — ${fmt(t.amount)})`
                ).join(" · ")}
              </p>
            </div>
          </div>
        );
      })()}

      {/* ── Info grid + Progress ring ── */}
      <div id="sec-info" className="rise rise-3" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20, marginBottom: 20 }}>
        {/* Left: project info */}
        <div style={{ ...card, padding: 24 }}>
          <SectionTitle>Informasi Proyek</SectionTitle>
          <InfoRow icon={<User size={14} />} label="Klien" value={
            <div>
              <div>{p.clients?.contact_person ?? "—"}</div>
              {p.clients?.phone && <div style={{ fontSize: 12, color: C.muted, marginTop: 2 }}>{p.clients.phone}</div>}
              {p.clients?.email && <div style={{ fontSize: 12, color: C.muted }}>{p.clients.email}</div>}
            </div>
          } />
          <InfoRow icon={<User size={14} />} label="Project Manager" value={
            <div>
              <div>{p.pm?.name ?? "—"}</div>
              {p.pm?.phone && <div style={{ fontSize: 12, color: C.muted, marginTop: 2 }}>{p.pm.phone}</div>}
            </div>
          } />
          <InfoRow icon={<Calendar size={14} />} label="Tanggal Mulai" value={fmtDate(p.start_date)} />
          <InfoRow
            icon={<Calendar size={14} />}
            label="Tenggat Selesai"
            value={fmtDate(p.end_date)}
            valueColor={isOverdue ? C.red : undefined}
          />
          {p.actual_end_date && (
            <InfoRow icon={<CheckCircle2 size={14} />} label="Tanggal Selesai Aktual" value={fmtDate(p.actual_end_date)} valueColor={C.green} />
          )}
          <InfoRow icon={<Receipt size={14} />} label="Nilai Kontrak" value={
            <span style={{ fontSize: 15, fontWeight: 700, color: C.navy }}>{fmt(Number(p.contract_value))}</span>
          } />
          {p.retention_pct > 0 && (
            <InfoRow icon={<Wallet size={14} />} label={`Retensi (${p.retention_pct}%)`} value={fmt(Number(p.retention_amount))} valueColor={C.yellow} />
          )}
          {p.commission_pct && (
            <InfoRow icon={<TrendingUp size={14} />} label="Komisi" value={`${p.commission_pct}%`} />
          )}
        </div>

        {/* Right: status progress — redesigned */}
        {(() => {
          const fisikPct = Math.min(100, Math.max(0, Number(p.progress_pct)));
          const serap = Math.min(100, Math.max(0, serapanPct ?? 0));
          const diff = fisikPct - serap;
          const diffColor = Math.abs(diff) <= 5 ? C.green : diff > 5 ? C.yellow : C.red;
          const diffLabel = Math.abs(diff) <= 5 ? "On Track" : diff > 5 ? "Fisik Lebih Maju" : "Perlu Perhatian";

          const upcomingMilestone = (p.milestones ?? [])
            .filter(m => m.status !== "completed")
            .sort((a, b) => new Date(a.target_date).getTime() - new Date(b.target_date).getTime())[0];

          // SVG arc ring helper
          const r = 38, cx = 48, cy = 48, stroke = 9;
          const circumference = 2 * Math.PI * r;
          function arcDash(pct: number) {
            const v = Math.min(100, Math.max(0, pct));
            return `${(v / 100) * circumference} ${circumference}`;
          }

          return (
            <div style={{ ...card, padding: 20, display: "flex", flexDirection: "column", gap: 12 }}>
              {/* Header row */}
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <SectionTitle style={{ margin: 0 }}>Status Progress</SectionTitle>
                <span style={{
                  fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 20,
                  background: isOverdue ? "var(--danger-bg)" : p.status === "completed" ? "var(--success-bg)" : "var(--navy-light)",
                  color: isOverdue ? C.red : p.status === "completed" ? C.green : C.navy,
                  border: `1px solid ${isOverdue ? "var(--danger-border)" : p.status === "completed" ? "var(--success-border)" : C.navy}`,
                }}>
                  {p.status === "completed"
                    ? `Selesai`
                    : isOverdue ? `${Math.abs(daysLeft)}h terlambat`
                    : daysLeft === 0 ? "Jatuh tempo hari ini"
                    : `${daysLeft} hari lagi`}
                </span>
              </div>

              {/* Dual ring + metrics */}
              <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
                {/* SVG dual ring */}
                <div style={{ flexShrink: 0, position: "relative" }}>
                  <svg width={96} height={96} style={{ transform: "rotate(-90deg)" }}>
                    {/* Track fisik */}
                    <circle cx={cx} cy={cy} r={r} fill="none" stroke="var(--info-bg)" strokeWidth={stroke} />
                    {/* Track serapan (inner, slightly smaller) */}
                    <circle cx={cx} cy={cy} r={r - stroke - 3} fill="none" stroke="var(--warning-bg)" strokeWidth={stroke - 2} />
                    {/* Arc fisik */}
                    <circle cx={cx} cy={cy} r={r} fill="none"
                      stroke={fisikPct >= 80 ? "var(--success)" : C.navy}
                      strokeWidth={stroke}
                      strokeDasharray={arcDash(fisikPct)}
                      strokeLinecap="round"
                      style={{ transition: "stroke-dasharray 0.8s ease" }}
                    />
                    {/* Arc serapan (inner ring) */}
                    <circle cx={cx} cy={cy} r={r - stroke - 3} fill="none"
                      stroke="var(--data-5)"
                      strokeWidth={stroke - 2}
                      strokeDasharray={arcDash(serap)}
                      strokeLinecap="round"
                      style={{ transition: "stroke-dasharray 0.8s ease" }}
                    />
                  </svg>
                  {/* Center label */}
                  <div style={{
                    position: "absolute", top: "50%", left: "50%",
                    transform: "translate(-50%,-50%)",
                    textAlign: "center", lineHeight: 1.1,
                  }}>
                    <div style={{ fontSize: 15, fontWeight: 800, color: C.navy }}>{fisikPct.toFixed(0)}%</div>
                    <div style={{ fontSize: 10, color: C.muted }}>fisik</div>
                  </div>
                </div>

                {/* Metric cards */}
                <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 8 }}>
                  {/* Progress Fisik */}
                  <div>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                        <div style={{ width: 8, height: 8, borderRadius: 0, background: fisikPct >= 80 ? "var(--success)" : C.navy }} />
                        <span style={{ fontSize: 10, fontWeight: 700, color: C.text, textTransform: "uppercase", letterSpacing: "0.04em" }}>Progress Fisik</span>
                      </div>
                      <span style={{ fontSize: 15, fontWeight: 800, color: fisikPct >= 80 ? C.green : C.navy, lineHeight: 1 }}>{fisikPct.toFixed(1)}%</span>
                    </div>
                    <div style={{ height: 8, borderRadius: 99, background: "var(--info-bg)", overflow: "hidden" }}>
                      <div style={{
                        height: "100%", borderRadius: 99, width: `${fisikPct}%`,
                        background: fisikPct >= 80 ? "linear-gradient(90deg,var(--success),var(--success))" : "linear-gradient(90deg,var(--navy),var(--aksen-terang))",
                        transition: "width 0.8s ease",
                      }} />
                    </div>
                    <div style={{ fontSize: 10, color: C.muted, marginTop: 3 }}>
                      Update: {p.progress_logs?.[0]?.logged_at ? fmtDateShort(p.progress_logs[0].logged_at) : "—"}
                    </div>
                  </div>

                  {/* Serapan Dana */}
                  <div>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                        <div style={{ width: 8, height: 8, borderRadius: 0, background: "var(--data-5)" }} />
                        <span style={{ fontSize: 10, fontWeight: 700, color: C.text, textTransform: "uppercase", letterSpacing: "0.04em" }}>Serapan Dana</span>
                        {canEditProject && (
                          <button onClick={() => setShowAbsorptionModal(true)} style={{
                            padding: "0px 6px", borderRadius: 6, fontSize: 10, fontWeight: 700,
                            background: "var(--warning-bg)", color: "var(--warning)", border: "1px solid #FED7AA", cursor: "pointer",
                          }}>+ Update</button>
                        )}
                      </div>
                      {serapanPct === null
                        ? <span style={{ display: "inline-block", width: 40, height: 16, borderRadius: 6, background: "linear-gradient(90deg,var(--warning-border),var(--warning-bg),var(--warning-border))", backgroundSize: "200% 100%", animation: "shimmer 1.5s ease-in-out infinite" }} />
                        : <span style={{ fontSize: 15, fontWeight: 800, color: "var(--data-5)", lineHeight: 1 }}>{serap.toFixed(1)}%</span>
                      }
                    </div>
                    {/* Segmented bar */}
                    <div style={{ height: 8, borderRadius: 99, background: "var(--warning-bg)", overflow: "hidden", position: "relative" }}>
                      <div style={{
                        height: "100%", borderRadius: 99, width: `${serap}%`,
                        background: "linear-gradient(90deg,var(--data-5),var(--data-5))",
                        transition: "width 0.8s ease",
                      }} />
                      {/* Tick marks every 25% */}
                      {[25,50,75].map(t => (
                        <div key={t} style={{
                          position: "absolute", top: 0, bottom: 0, left: `${t}%`,
                          width: 1, background: "rgba(255,255,255,0.5)",
                        }} />
                      ))}
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between", marginTop: 3 }}>
                      <span style={{ fontSize: 10, color: C.muted }}>
                        {serapanPct === null
                          ? "Menghitung dari RAB..."
                          : serap === 0
                            ? "Belum ada entri serapan"
                            : "Kumulatif per item RAB"}
                      </span>
                      {canEditProject && (
                        <button onClick={() => setShowScheduleModal(true)} style={{
                          fontSize: 10, color: C.mid, background: "none", border: "none", cursor: "pointer", textDecoration: "underline", padding: 0,
                        }}>Atur rencana</button>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* Deviasi row */}
              {(fisikPct > 0 || serap > 0) && (
                <div style={{
                  display: "flex", alignItems: "center", justifyContent: "space-between",
                  padding: "8px 12px", borderRadius: 6,
                  background: Math.abs(diff) <= 5 ? "var(--success-bg)" : diff > 5 ? "var(--warning-bg)" : "var(--danger-bg)",
                  border: `1px solid ${Math.abs(diff) <= 5 ? "var(--success-border)" : diff > 5 ? "var(--warning-border)" : "var(--danger-border)"}`,
                }}>
                  <div>
                    <span style={{ fontSize: 11, fontWeight: 600, color: diffColor }}>{diffLabel}</span>
                    <span style={{ fontSize: 10, color: C.muted, marginLeft: 6 }}>Fisik vs Serapan</span>
                  </div>
                  <span style={{ fontSize: 13, fontWeight: 800, color: diffColor }}>
                    {diff > 0 ? "+" : ""}{diff.toFixed(1)}%
                  </span>
                </div>
              )}

              {/* Milestone berikutnya */}
              {upcomingMilestone && (
                <div style={{
                  display: "flex", alignItems: "center", gap: 8,
                  padding: "8px 12px", borderRadius: 6,
                  background: "var(--warning-bg)", border: "1px solid var(--warning-border)",
                }}>
                  <div style={{ width: 6, height: 6, borderRadius: "50%", background: C.yellow, flexShrink: 0 }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <span style={{ fontSize: 11, fontWeight: 600, color: "var(--on-warning-bg)" }}>{upcomingMilestone.title}</span>
                    <span style={{ fontSize: 10, color: "var(--warning)", marginLeft: 6 }}>· {fmtDateShort(upcomingMilestone.target_date)}</span>
                  </div>
                  <span style={{ fontSize: 10, color: C.muted, flexShrink: 0 }}>Milestone Berikutnya</span>
                </div>
              )}
            </div>
          );
        })()}
      </div>

      {/* ── Activity feed ── */}
      {(() => {
        // Kumpulkan event dari berbagai sumber, sort descending by date, ambil 8 terbaru
        type ActivityEvent = { date: string; icon: React.ReactNode; text: string; sub?: string; color: string; bg: string };
        const events: ActivityEvent[] = [];

        // Progress logs
        for (const log of (p.progress_logs ?? []).slice(0, 5)) {
          const who = log.reporter?.name ?? "Tim";
          events.push({
            date: log.logged_at,
            icon: <TrendingUp size={12} />,
            text: log.pct_overall != null
              ? `Progress diperbarui ke ${log.pct_overall}%`
              : "Log progress harian dicatat",
            sub: `oleh ${who}${log.weather ? ` · Cuaca: ${log.weather}` : ""}${log.worker_count ? ` · ${log.worker_count} pekerja` : ""}`,
            color: C.navy, bg: C.navyLight,
          });
        }

        // Kasbon
        for (const k of allKasbons.slice(0, 5)) {
          const statusInfo = k.status === "approved"
            ? { text: "Kasbon disetujui", color: C.green, bg: C.greenBg }
            : k.status === "rejected"
              ? { text: "Kasbon ditolak", color: C.red, bg: C.redBg }
              : { text: "Kasbon diajukan", color: C.yellow, bg: C.yellowBg };
          events.push({
            date: k.kasbon_date,
            icon: <Wallet size={12} />,
            text: `${statusInfo.text} — ${fmt(Number(k.amount))}`,
            sub: `${(k as any).mandorName} · ${PURPOSE_LABEL[k.purpose] ?? k.purpose}`,
            color: statusInfo.color, bg: statusInfo.bg,
          });
        }

        // Milestones completed
        for (const m of (p.milestones ?? []).filter(m => m.completed_at)) {
          events.push({
            date: m.completed_at!,
            icon: <CheckCircle2 size={12} />,
            text: `Milestone selesai: ${m.title}`,
            color: C.green, bg: C.greenBg,
          });
        }

        // Invoice
        for (const inv of (p.invoices ?? []).slice(0, 3)) {
          events.push({
            date: inv.issued_date,
            icon: <Receipt size={12} />,
            text: `Invoice ${inv.invoice_number} diterbitkan — ${fmt(Number(inv.total_amount))}`,
            sub: inv.status === "paid" ? "Sudah lunas" : `Jatuh tempo: ${fmtDateShort(inv.due_date)}`,
            color: inv.status === "paid" ? C.green : C.info,
            bg: inv.status === "paid" ? C.greenBg : C.infoBg,
          });
        }

        if (events.length === 0) return null;

        const sorted = events
          .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
          .slice(0, 8);

        return (
          <div className="rise rise-3b" style={{ ...card, padding: 20, marginBottom: 20 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <Activity size={15} style={{ color: C.navy }} />
                <span style={{ fontSize: 13, fontWeight: 700, color: C.text, fontFamily: "var(--font-display)" }}>Aktivitas Terbaru</span>
              </div>
              <span style={{ fontSize: 11, color: C.muted }}>7 hari terakhir</span>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
              {sorted.map((ev, i) => (
                <div key={i} style={{
                  display: "flex", gap: 12, padding: "9px 0",
                  borderBottom: i < sorted.length - 1 ? `1px solid var(--border)` : "none",
                  alignItems: "flex-start",
                }}>
                  <div style={{
                    width: 28, height: 28, borderRadius: 6, flexShrink: 0,
                    background: ev.bg, color: ev.color,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    marginTop: 1,
                  }}>
                    {ev.icon}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12, fontWeight: 500, color: C.text, lineHeight: 1.4 }}>{ev.text}</div>
                    {ev.sub && <div style={{ fontSize: 11, color: C.muted, marginTop: 2 }}>{ev.sub}</div>}
                  </div>
                  <div style={{ fontSize: 10, color: C.muted, flexShrink: 0, paddingTop: 2 }}>
                    {fmtDateShort(ev.date)}
                  </div>
                </div>
              ))}
            </div>
          </div>
        );
      })()}

      {/* ── Termin schedules ── */}
      <div id="sec-termin" />
      {p.contract_model === "termin" && (p.termin_schedules?.length ?? 0) > 0 && (() => {
        const termins = [...(p.termin_schedules ?? [])].sort((a, b) => a.termin_number - b.termin_number);
        const paid = termins.filter(t => t.status === "paid").length;
        const paidValue = termins.filter(t => t.status === "paid").reduce((s, t) => s + Number(t.amount), 0);
        const totalValue = termins.reduce((s, t) => s + Number(t.amount), 0);

        // Termin overdue: sudah bisa ditagih (trigger terpenuhi) tapi masih pending > 7 hari
        const overdueTermins = termins.filter(t => {
          if (t.status !== "pending") return false;
          if (t.trigger_type === "on_sign") return true; // langsung bisa tagih sejak awal
          if (t.trigger_type === "on_progress" && t.trigger_pct !== null) {
            return p.progress_pct >= t.trigger_pct;
          }
          return false;
        });

        return (
          <div className="rise rise-3" style={{ ...card, padding: 24, marginBottom: 20 }}>
            {/* Header */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <SectionTitle style={{ margin: 0 }}>Jadwal Termin</SectionTitle>
                {overdueTermins.length > 0 && (
                  <span style={{
                    display: "inline-flex", alignItems: "center", gap: 4,
                    padding: "2px 8px", borderRadius: 20, fontSize: 11, fontWeight: 700,
                    background: C.redBg, color: C.red, border: `1px solid ${C.redBorder}`,
                  }}>
                    <AlertCircle size={11} />
                    {overdueTermins.length} belum ditagih
                  </span>
                )}
              </div>
              <div style={{ fontSize: 12, color: C.muted }}>{paid} / {termins.length} terbayar</div>
            </div>

            {/* Overdue alert */}
            {overdueTermins.length > 0 && (
              <div style={{
                marginBottom: 16, padding: "12px 12px", borderRadius: 10,
                background: C.redBg, border: `1px solid ${C.redBorder}`,
                display: "flex", alignItems: "flex-start", gap: 8,
              }}>
                <AlertCircle size={16} style={{ color: C.red, flexShrink: 0, marginTop: 1 }} />
                <div>
                  <div style={{ fontSize: 12, fontWeight: 700, color: C.red, marginBottom: 2 }}>
                    {overdueTermins.length === 1
                      ? `Termin "${overdueTermins[0].label}" sudah bisa ditagih tapi belum dibuat invoicenya`
                      : `${overdueTermins.length} termin sudah memenuhi syarat penagihan tapi belum ada invoice`}
                  </div>
                  <div style={{ fontSize: 11, color: C.mid }}>
                    {overdueTermins.map(t => {
                      const triggerInfo = t.trigger_type === "on_sign"
                        ? "sejak kontrak ditandatangani"
                        : t.trigger_type === "on_progress"
                          ? `sejak progress mencapai ${t.trigger_pct}% (sekarang ${p.progress_pct.toFixed(0)}%)`
                          : "";
                      return `${t.label} — ${fmt(Number(t.amount))} ${triggerInfo ? `(${triggerInfo})` : ""}`;
                    }).join(" · ")}
                  </div>
                </div>
              </div>
            )}

            {/* Progress bar lunas */}
            <div style={{ marginBottom: 16, padding: "12px 16px", background: "var(--surface-subtle)", borderRadius: 10, border: "1px solid var(--surface-hover)" }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
                <span style={{ fontSize: 12, color: C.mid }}>Total terbayar</span>
                <span style={{ fontSize: 12, fontWeight: 700, color: paid === termins.length ? C.green : C.navy }}>
                  {fmt(paidValue)} <span style={{ color: C.muted, fontWeight: 400 }}>dari {fmt(totalValue)}</span>
                </span>
              </div>
              <div style={{ height: 8, background: "var(--border)", borderRadius: 999, overflow: "hidden" }}>
                <div style={{
                  height: "100%", borderRadius: 999,
                  width: `${totalValue > 0 ? (paidValue / totalValue) * 100 : 0}%`,
                  background: paid === termins.length
                    ? "linear-gradient(90deg, var(--success), var(--success))"
                    : "linear-gradient(90deg, var(--navy), var(--aksen-terang))",
                  transition: "width 0.5s ease",
                }} />
              </div>
            </div>

            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, fontVariantNumeric: "tabular-nums" }}>
              <thead>
                <tr style={{ background: "var(--surface-subtle)", borderBottom: "1px solid var(--border)" }}>
                  {["No", "Label", "Nilai", "% Kontrak", "Syarat Tagih", "Status", ""].map((h, i) => (
                    <th key={i} style={{
                      padding: "8px 12px",
                      textAlign: i >= 2 && i !== 6 ? "right" : i === 6 ? "center" : "left",
                      fontSize: 11, fontWeight: 600, letterSpacing: "0.05em",
                      textTransform: "uppercase", color: C.mid,
                    }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {termins.map(t => {
                  const canPay = bolehBayarTermin && t.status !== "paid";
                  const isOverdueTermin = overdueTermins.some(ot => ot.id === t.id);

                  // Keterangan syarat tagih
                  let triggerLabel = "—";
                  if (t.trigger_type === "on_sign") triggerLabel = "Saat kontrak ditandatangani";
                  else if (t.trigger_type === "on_progress" && t.trigger_pct !== null) {
                    const reached = p.progress_pct >= t.trigger_pct;
                    triggerLabel = `Progress ≥ ${t.trigger_pct}%`;
                    if (reached && t.status === "pending") triggerLabel += " ✓";
                  }
                  else if (t.trigger_type === "on_retention") triggerLabel = "Retensi / akhir proyek";

                  return (
                    <tr
                      key={t.id}
                      style={{
                        borderBottom: "1px solid var(--surface-hover)",
                        background: t.status === "paid"
                          ? "var(--success-bg)"
                          : isOverdueTermin ? "var(--danger-bg)"
                          : "transparent",
                      }}
                      onMouseEnter={e => {
                        if (t.status !== "paid" && !isOverdueTermin) e.currentTarget.style.background = "var(--surface-subtle)";
                      }}
                      onMouseLeave={e => {
                        e.currentTarget.style.background = t.status === "paid"
                          ? "var(--success-bg)"
                          : isOverdueTermin ? "var(--danger-bg)"
                          : "transparent";
                      }}
                    >
                      <td style={{ padding: "12px 12px", color: C.muted, fontWeight: 600 }}>{t.termin_number}</td>
                      <td style={{ padding: "12px 12px", color: C.text, fontWeight: 500 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                          {t.label}
                          {isOverdueTermin && (
                            <span title="Belum ditagih padahal syarat sudah terpenuhi">
                              <AlertCircle size={13} style={{ color: C.red }} />
                            </span>
                          )}
                        </div>
                      </td>
                      <td style={{ padding: "12px 12px", textAlign: "right", color: C.text, fontWeight: 600, fontFamily: "monospace" }}>{fmt(Number(t.amount))}</td>
                      <td style={{ padding: "12px 12px", textAlign: "right", color: C.mid }}>{t.pct_of_contract}%</td>
                      <td style={{ padding: "12px 12px", textAlign: "right" }}>
                        <span style={{
                          fontSize: 11,
                          color: isOverdueTermin ? C.red : C.mid,
                          fontWeight: isOverdueTermin ? 600 : 400,
                        }}>
                          {triggerLabel}
                        </span>
                      </td>
                      <td style={{ padding: "12px 12px", textAlign: "right" }}>
                        <Badge status={t.status} />
                      </td>
                      <td style={{ padding: "12px 12px", textAlign: "center" }}>
                        {canPay ? (
                          <button
                            aria-label={`Catat pembayaran termin ${t.termin_number}`}
                            onClick={() => setPayingTermin({
                              id: t.id,
                              termin_number: t.termin_number,
                              label: t.label,
                              amount: Number(t.amount),
                              pct_of_contract: t.pct_of_contract,
                              status: t.status,
                            })}
                            style={{
                              display: "inline-flex", alignItems: "center", gap: 4,
                              padding: "4px 12px", borderRadius: 6, border: "none",
                              background: isOverdueTermin ? C.red : C.navyLight,
                              color: isOverdueTermin ? C.onNavy : C.navy,
                              fontSize: 11, fontWeight: 600, cursor: "pointer",
                              transition: "all 0.15s", whiteSpace: "nowrap",
                            }}
                            onMouseEnter={e => {
                              e.currentTarget.style.background = isOverdueTermin ? "var(--on-danger-bg)" : C.navy;
                              e.currentTarget.style.color = "var(--surface)";
                            }}
                            onMouseLeave={e => {
                              e.currentTarget.style.background = isOverdueTermin ? C.red : C.navyLight;
                              e.currentTarget.style.color = isOverdueTermin ? "#fff" : C.navy;
                            }}
                          >
                            <Banknote size={12} />
                            {isOverdueTermin ? "Tagih Sekarang" : "Tandai Terbayar"}
                          </button>
                        ) : t.status === "paid" ? (
                          <span style={{ fontSize: 11, color: C.green, display: "flex", alignItems: "center", gap: 4, justifyContent: "center" }}>
                            <CheckCircle2 size={13} /> Lunas
                          </span>
                        ) : null}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        );
      })()}

      {/* ── RAB ── */}
      <div id="sec-rab" className="rise rise-3" style={{ ...card, padding: 24, marginBottom: 20 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: rabCollapsed ? 0 : 16 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div style={{ width: 36, height: 36, borderRadius: 10, background: "linear-gradient(135deg, var(--navy), var(--aksen-terang))", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              <FileText size={18} color="var(--surface)" />
            </div>
            <div>
              <div style={{ fontSize: 15, fontWeight: 700, color: C.text, fontFamily: "var(--font-display)" }}>RAB — Rencana Anggaran Biaya</div>
              {rabCollapsed && <div style={{ fontSize: 11, color: C.muted }}>Klik untuk expand</div>}
            </div>
          </div>
          <button
            onClick={() => setRabCollapsed(c => !c)}
            style={{
              display: "flex", alignItems: "center", gap: 6,
              padding: "6px 12px", borderRadius: 6, border: `1px solid ${C.border}`,
              background: "var(--surface-subtle)", cursor: "pointer", fontSize: 12, color: C.mid,
            }}
          >
            {rabCollapsed ? "Tampilkan" : "Sembunyikan"}
            <ChevronDown size={13} style={{ transform: rabCollapsed ? "rotate(-90deg)" : "none", transition: "transform 0.2s" }} />
          </button>
        </div>
        {!rabCollapsed && <RabSection
          projectId={p.id}
          userRole={currentUser?.role}
          hideHeader
          serapanRefreshKey={serapanRefreshKey}
          onOverallSerapanChange={handleOverallSerapanChange}
        />}
      </div>

      {/* ── Riwayat Serapan Dana ── */}
      <div id="sec-serapan" />
      <AbsorptionLogTable
        projectId={p.id}
        refreshKey={serapanRefreshKey}
        canEdit={canEditProject}
        onAddClick={() => setShowAbsorptionModal(true)}
        onDeleted={() => setSerapanRefreshKey(k => k + 1)}
      />

      {/* ── Gantt Chart ── */}
      <div id="sec-gantt" className="rise rise-3" style={{ ...card, padding: 24, marginBottom: 20 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: ganttCollapsed ? 0 : 16 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div style={{ width: 36, height: 36, borderRadius: 10, background: "linear-gradient(135deg, var(--navy), var(--aksen-terang))", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              <Clock size={18} color="var(--surface)" />
            </div>
            <div>
              <div style={{ fontSize: 15, fontWeight: 700, color: C.text, fontFamily: "var(--font-display)" }}>Gantt Chart — Timeline WBS</div>
              {ganttCollapsed && <div style={{ fontSize: 11, color: C.muted }}>Klik untuk expand</div>}
            </div>
          </div>
          <button
            onClick={() => setGanttCollapsed(c => !c)}
            style={{
              display: "flex", alignItems: "center", gap: 6,
              padding: "6px 12px", borderRadius: 6, border: `1px solid ${C.border}`,
              background: "var(--surface-subtle)", cursor: "pointer", fontSize: 12, color: C.mid,
            }}
          >
            {ganttCollapsed ? "Tampilkan" : "Sembunyikan"}
            <ChevronDown size={13} style={{ transform: ganttCollapsed ? "rotate(-90deg)" : "none", transition: "transform 0.2s" }} />
          </button>
        </div>
        {!ganttCollapsed && (
          <GanttSection
            projectId={p.id}
            userRole={currentUser?.role}
            projectStart={p.start_date}
            projectEnd={p.end_date}
          />
        )}
      </div>

      {/* ── Look-ahead 3 minggu ──
          Ditaruh TEPAT SESUDAH Gantt, bukan di bawah Kurva-S: keduanya membaca
          `planned_start/end` yang sama, dan pertanyaan "harus siapkan apa?"
          muncul persis setelah orang melihat jadwalnya. */}
      <div id="sec-lookahead" className="rise rise-3" style={{ ...card, padding: 24, marginBottom: 20 }}>
        <LookAheadSection projectId={p.id} />

        {/* Rantai kontrak: EOT + denda keterlambatan + jaminan. Ditaruh SESUDAH
            look-ahead karena keduanya soal WAKTU — dan pertanyaan "apakah kita
            kena denda?" muncul persis setelah melihat mana yang telat. */}
        <RantaiKontrakSection projectId={p.id} />

        {/* Klaim: pilar KETIGA rantai yang sama. Ditaruh langsung di bawah EOT
            karena satu peristiwa sering memicu keduanya — lahan terlambat
            diserahkan menuntut perpanjangan waktu DAN biaya tambahan.
            Memisahkannya ke halaman lain membuat yang kedua sering terlupa. */}
        <KlaimSection projectId={p.id} />

        {/* Surat & instruksi lapangan: sumber BUKTI untuk klaim di atas.
            Ditaruh sesudahnya, bukan sebelum — orang datang ke sini setelah
            bertanya "apa dasarnya?", dan urutan itu yang menentukan
            penempatannya. Instruksi lisan bahkan sering jadi satu-satunya
            dasar klaim yang ada. */}
        <SuratSection projectId={p.id} />
        <InstruksiLapanganSection projectId={p.id} />
      </div>

      {/* ── Change Order ── */}
      <div id="sec-co" className="rise rise-3" style={{ ...card, padding: 24, marginBottom: 20 }}>
        <ChangeOrderSection
          projectId={p.id}
          userRole={currentUser?.role}
          contractValue={p.contract_value}
        />
      </div>

      {/* ── Kurva S ── */}
      <div id="sec-kurvas" className="rise rise-3" style={{ ...card, padding: 24, marginBottom: 20 }}>
        <KurvaSSection projectId={p.id} userRole={currentUser?.role} />
      </div>

      {/* ── Dokumen ── */}
      <div id="sec-dokumen" className="rise rise-3" style={{ ...card, padding: 24, marginBottom: 20 }}>
        <DocumentSection projectId={p.id} userRole={currentUser?.role} />
      </div>

      {/* ── Galeri Foto ── */}
      <div id="sec-foto" className="rise rise-3" style={{ ...card, padding: 24, marginBottom: 20 }}>
        <PhotoGallery projectId={p.id} userRole={currentUser?.role} />
      </div>

      {/* ── Mandor + Work scopes ── */}
      <div id="sec-mandor" className="rise rise-3" style={{ ...card, padding: 24, marginBottom: 20 }}>
        <MandorSection
          projectId={p.id}
          assignments={p.mandor_assignments ?? []}
          scopelessKasbons={p.scopeless_kasbons ?? []}
          canEdit={bolehAturMandor}
          onRefresh={fetchProject}
        />
      </div>

      {/* ── Kasbon summary ── */}
      {allKasbons.length > 0 && (
        <div id="sec-kasbon" className="rise rise-4" style={{ ...card, padding: 24, marginBottom: 20 }}>
          <SectionTitle>Ringkasan Kasbon</SectionTitle>

          {/* Summary pills */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12, marginBottom: 20 }}>
            <KasbonPill label="Disetujui" value={kasbonApproved} color={C.green} bg={C.greenBg} border={C.greenBorder} />
            <KasbonPill label="Menunggu" value={kasbonPending} color={C.yellow} bg={C.yellowBg} border={C.yellowBorder} />
            <KasbonPill label="Lunas" value={kasbonSettled} color={C.muted} bg="var(--surface-subtle)" border={C.border} />
          </div>

          {/* Kasbon list */}
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, fontVariantNumeric: "tabular-nums" }}>
            <thead>
              <tr style={{ background: "var(--surface-subtle)", borderBottom: "1px solid var(--border)" }}>
                {["Mandor", "Scope", "Tujuan", "Jumlah", "Tanggal", "Status"].map((h, i) => (
                  <th key={h} style={{ padding: "8px 12px", textAlign: i >= 3 ? "right" : "left", fontSize: 11, fontWeight: 600, letterSpacing: "0.05em", textTransform: "uppercase", color: C.mid }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {allKasbons.slice(0, 10).map(k => (
                <tr key={k.id} style={{ borderBottom: "1px solid var(--surface-hover)" }}
                  onMouseEnter={e => { e.currentTarget.style.background = "var(--surface-subtle)"; }}
                  onMouseLeave={e => { e.currentTarget.style.background = "transparent"; }}
                >
                  <td style={{ padding: "12px 12px", color: C.text, fontWeight: 500 }}>{(k as any).mandorName}</td>
                  <td style={{ padding: "12px 12px", color: C.mid, fontSize: 12 }}>{(k as any).scopeName}</td>
                  <td style={{ padding: "12px 12px", color: C.mid }}>{PURPOSE_LABEL[k.purpose] ?? k.purpose}</td>
                  <td style={{ padding: "12px 12px", textAlign: "right", color: k.status === "approved" ? C.text : k.status === "settled" ? C.green : C.yellow, fontWeight: 600, fontFamily: "monospace" }}>{fmt(Number(k.amount))}</td>
                  <td style={{ padding: "12px 12px", textAlign: "right", color: C.muted, fontSize: 12 }}>{fmtDateShort(k.kasbon_date)}</td>
                  <td style={{ padding: "12px 12px", textAlign: "right" }}><Badge status={k.status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
          {allKasbons.length > 10 && (
            <p style={{ textAlign: "center", fontSize: 12, color: C.muted, marginTop: 12 }}>
              + {allKasbons.length - 10} kasbon lainnya
            </p>
          )}
        </div>
      )}

      {/* ── Progress logs (dynamic section with photo support) ── */}
      <div id="sec-progress" className="rise rise-4" style={{ marginBottom: 20 }}>
        <ProgressSection
          projectId={p.id}
          workScopes={(p.mandor_assignments ?? []).flatMap(ma =>
            (ma.work_scopes ?? []).map(ws => ({ id: ws.id, scope_name: ws.scope_name }))
          )}
          userRole={currentUser?.role}
          userId={currentUser?.id}
        />
      </div>

      {/* ── Milestones (dynamic CRUD section) ── */}
      <div id="sec-milestone" className="rise rise-5" style={{ marginBottom: 20 }}>
        <MilestoneSection
          projectId={p.id}
          userRole={currentUser?.role}
        />
      </div>

      {/* ── Invoices ── */}
      {(p.invoices?.length ?? 0) > 0 && (
        <div id="sec-invoice" className="rise rise-5" style={{ ...card, padding: 24, marginBottom: 20 }}>
          <SectionTitle>Invoice</SectionTitle>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, fontVariantNumeric: "tabular-nums" }}>
            <thead>
              <tr style={{ background: "var(--surface-subtle)", borderBottom: "1px solid var(--border)" }}>
                {["No Invoice", "Tipe", "Total", "Dibayar", "Sisa", "Jatuh Tempo", "Status"].map((h, i) => (
                  <th key={h} style={{ padding: "8px 12px", textAlign: i >= 2 ? "right" : "left", fontSize: 11, fontWeight: 600, letterSpacing: "0.05em", textTransform: "uppercase", color: C.mid }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {(p.invoices ?? []).map(inv => {
                const invDays = daysUntil(inv.due_date);
                const invOverdue = inv.status !== "paid" && invDays < 0;
                return (
                  <tr key={inv.id} style={{ borderBottom: "1px solid var(--surface-hover)", background: invOverdue ? "var(--danger-bg)" : "transparent" }}
                    onMouseEnter={e => { if (!invOverdue) e.currentTarget.style.background = "var(--surface-subtle)"; }}
                    onMouseLeave={e => { e.currentTarget.style.background = invOverdue ? "var(--danger-bg)" : "transparent"; }}
                  >
                    <td style={{ padding: "12px 12px", color: C.navy, fontFamily: "var(--font-display)", fontSize: 11, fontWeight: 600 }}>{inv.invoice_number}</td>
                    <td style={{ padding: "12px 12px", color: C.mid }}>{INVOICE_TYPE_LABEL[inv.invoice_type] ?? inv.invoice_type}</td>
                    <td style={{ padding: "12px 12px", textAlign: "right", color: C.text, fontWeight: 600, fontFamily: "monospace" }}>{fmt(Number(inv.total_amount))}</td>
                    <td style={{ padding: "12px 12px", textAlign: "right", color: C.green, fontFamily: "monospace" }}>{fmt(Number(inv.amount_paid))}</td>
                    <td style={{ padding: "12px 12px", textAlign: "right", color: Number(inv.amount_due) > 0 ? C.yellow : C.green, fontWeight: 600, fontFamily: "monospace" }}>{fmt(Number(inv.amount_due))}</td>
                    <td style={{ padding: "12px 12px", textAlign: "right", color: invOverdue ? C.red : C.mid, fontSize: 12 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 2, justifyContent: "flex-end" }}>
                        <Clock size={10} />{fmtDateShort(inv.due_date)}
                      </div>
                    </td>
                    <td style={{ padding: "12px 12px", textAlign: "right" }}><Badge status={inv.status} /></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* ── Notes ── */}
      {p.notes && (
        <div className="rise rise-6" style={{ ...card, padding: 24, marginBottom: 20 }}>
          <SectionTitle>Catatan</SectionTitle>
          <p style={{ fontSize: 13, color: C.mid, lineHeight: 1.7 }}>{p.notes}</p>
        </div>
      )}

      {/* ── Activity Feed ── */}
      <ActivityFeed project={p} />

      {/* ── Termin payment modal ── */}
      {payingTermin && (
        <TerminPaymentModal
          projectId={id}
          termin={payingTermin}
          onClose={() => setPayingTermin(null)}
          onSuccess={() => {
            setPayingTermin(null);
            fetchProject();
            showToast("success", `Termin "${payingTermin.label}" berhasil ditandai terbayar`);
          }}
        />
      )}

      {/* ── Contract generator modal ── */}
      {showContractModal && (
        <ContractGeneratorModal
          projectId={id}
          projectName={p.name}
          onClose={() => setShowContractModal(false)}
        />
      )}

      {/* ── Jadwal Rencana Serapan ── */}
      {showScheduleModal && (
        <RabScheduleModal
          projectId={id}
          projectStart={p.start_date}
          projectEnd={p.end_date}
          onClose={() => setShowScheduleModal(false)}
        />
      )}

      {/* ── Update Serapan Dana ── */}
      {showAbsorptionModal && (
        <AbsorptionLogModal
          projectId={id}
          projectStart={p.start_date}
          projectEnd={p.end_date}
          onClose={() => setShowAbsorptionModal(false)}
          onSaved={() => {
            setSerapanRefreshKey(k => k + 1);
          }}
        />
      )}

      {/* ── Edit modal ── */}
      {showEditModal && (
        <ProjectModal
          mode="edit"
          projectId={id}
          initialData={{
            name: p.name,
            location: p.location,
            client_id: (p.clients as any)?.id ?? "",
            pm_id: (p.pm as any)?.id ?? "",
            description: p.description ?? "",
            contract_model: p.contract_model,
            contract_value: String(Math.round(Number(p.contract_value))),
            tax_scheme: p.tax_scheme,
            commission_pct: p.commission_pct ? String(p.commission_pct) : "",
            retention_pct: String(p.retention_pct ?? 5),
            start_date: p.start_date,
            end_date: p.end_date,
          }}
          onClose={() => setShowEditModal(false)}
          onSuccess={handleEditSuccess}
        />
      )}

      {/* ── Delete confirmation ── */}
      {showDeleteConfirm && createPortal(
        <div
          style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000, padding: 24 }}
          onClick={e => { if (e.target === e.currentTarget) setShowDeleteConfirm(false); }}
        >
          <div style={{ background: "var(--surface)", borderRadius: 14, padding: 28, maxWidth: 420, width: "100%", boxShadow: "var(--naik-3)" }}>
            <div style={{ width: 44, height: 44, borderRadius: "50%", background: C.redBg, display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 16 }}>
              <Trash2 size={20} style={{ color: C.red }} />
            </div>
            <h3 style={{ fontSize: 15, fontWeight: 700, color: C.text, marginBottom: 8 }}>Hapus proyek ini?</h3>
            <p style={{ fontSize: 13, color: C.mid, lineHeight: 1.6, marginBottom: 24 }}>
              Semua data terkait akan diarsipkan. Proyek akan ditandai sebagai <strong>Batal</strong> dan tidak akan muncul di daftar aktif.
            </p>
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button
                onClick={() => setShowDeleteConfirm(false)}
                disabled={deleting}
                style={{ padding: "8px 16px", borderRadius: 6, border: "1px solid var(--border)", background: "var(--surface)", fontSize: 13, fontWeight: 500, color: C.mid, cursor: "pointer" }}
              >
                Batal
              </button>
              <button
                onClick={handleDelete}
                disabled={deleting}
                style={{ padding: "8px 16px", borderRadius: 6, border: "none", background: deleting ? "var(--text-muted)" : C.red, color: "var(--surface)", fontSize: 13, fontWeight: 600, cursor: deleting ? "not-allowed" : "pointer", transition: "background 0.15s" }}
                onMouseEnter={e => { if (!deleting) e.currentTarget.style.background = "var(--on-danger-bg)"; }}
                onMouseLeave={e => { if (!deleting) e.currentTarget.style.background = C.red; }}
              >
                {deleting ? "Mengarsipkan..." : "Ya, Hapus"}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* ── Print / Export Ringkasan Modal ── */}
      {showPrintModal && createPortal(
        <div
          style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1100, padding: 24 }}
          onClick={e => { if (e.target === e.currentTarget) setShowPrintModal(false); }}
        >
          <div style={{
            background: "var(--surface)", borderRadius: 14, width: "100%", maxWidth: 680,
            maxHeight: "90vh", display: "flex", flexDirection: "column",
            boxShadow: "var(--naik-3)",
          }}>
            {/* Modal header */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 24px", borderBottom: "1px solid var(--border)" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <Printer size={18} style={{ color: C.navy }} />
                <span style={{ fontSize: 15, fontWeight: 700, color: C.text, fontFamily: "var(--font-display)" }}>Ringkasan Proyek</span>
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <button
                  onClick={() => window.print()}
                  style={{
                    display: "inline-flex", alignItems: "center", gap: 6,
                    padding: "6px 12px", borderRadius: 6, fontSize: 12, fontWeight: 600,
                    background: C.navy, color: "var(--surface)", border: "none", cursor: "pointer",
                  }}
                >
                  <Printer size={13} /> Cetak / Simpan PDF
                </button>
                <button
                  onClick={() => setShowPrintModal(false)}
                  style={{ padding: "6px 8px", borderRadius: 6, border: "1px solid var(--border)", background: "var(--surface)", fontSize: 13, color: C.mid, cursor: "pointer" }}
                >
                  ✕
                </button>
              </div>
            </div>
            {/* Print preview content */}
            <div id="print-content" style={{ overflowY: "auto", padding: "24px 28px" }}>
              {/* Project header */}
              <div style={{ marginBottom: 20, paddingBottom: 16, borderBottom: "2px solid var(--border)" }}>
                <div style={{ fontSize: 20, fontWeight: 800, color: C.navy, fontFamily: "var(--font-display)", marginBottom: 4 }}>{p.name}</div>
                <div style={{ display: "flex", gap: 16, fontSize: 12, color: C.mid, flexWrap: "wrap" }}>
                  <span>📍 {p.location}</span>
                  <span>👤 Klien: {(p.clients as any)?.name ?? "—"}</span>
                  <span>🗓 {fmtDate(p.start_date)} — {fmtDate(p.end_date)}</span>
                  <span style={{
                    padding: "2px 8px", borderRadius: 99, fontSize: 11, fontWeight: 700,
                    background: C.navyLight, color: C.navy,
                  }}>{p.status}</span>
                </div>
              </div>

              {/* KPI grid 2×3 */}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8, marginBottom: 20 }}>
                {[
                  { label: "Nilai Kontrak", value: fmt(Number(p.contract_value)) },
                  { label: "Progress Fisik", value: `${Number(p.progress_pct).toFixed(1)}%` },
                  { label: "Serapan Dana", value: serapanPct !== null ? `${serapanPct.toFixed(1)}%` : "—" },
                  { label: "Invoice Terbayar", value: fmt((p.invoices ?? []).filter(i => i.status === "paid").reduce((s, i) => s + Number(i.amount_paid), 0)) },
                  { label: "Total Kasbon", value: fmt(allKasbons.reduce((s, k) => s + Number(k.amount), 0)) },
                  { label: "Hari Tersisa", value: daysLeft > 0 ? `${daysLeft} hari` : `${Math.abs(daysLeft)} hari terlambat` },
                ].map(item => (
                  <div key={item.label} style={{ padding: "12px 12px", borderRadius: 10, background: "var(--surface-subtle)", border: "1px solid var(--border)" }}>
                    <div style={{ fontSize: 10, color: C.muted, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 4 }}>{item.label}</div>
                    <div style={{ fontSize: 15, fontWeight: 700, color: C.text }}>{item.value}</div>
                  </div>
                ))}
              </div>

              {/* EVM row */}
              {evmData && (
                <div style={{ padding: "12px 16px", borderRadius: 10, background: C.navyLight, border: `1px solid ${C.navy}22`, marginBottom: 20 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: C.navy, marginBottom: 10, textTransform: "uppercase", letterSpacing: "0.05em" }}>Earned Value Management</div>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8 }}>
                    {[
                      { label: "CPI", val: evmData.cpi.toFixed(2), ok: evmData.cpi >= 1 },
                      { label: "SPI", val: evmData.spi.toFixed(2), ok: evmData.spi >= 1 },
                      { label: "EAC", val: fmtCompact(evmData.eac), ok: evmData.eac <= evmData.bac },
                      { label: "VAC", val: fmtCompact(evmData.vac), ok: evmData.vac >= 0 },
                    ].map(e => (
                      <div key={e.label} style={{ textAlign: "center" }}>
                        <div style={{ fontSize: 10, color: C.mid, marginBottom: 2 }}>{e.label}</div>
                        <div style={{ fontSize: 13, fontWeight: 700, color: e.ok ? C.green : C.red }}>{e.val}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Milestones */}
              {(p.milestones ?? []).length > 0 && (
                <div style={{ marginBottom: 20 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: C.text, marginBottom: 10, textTransform: "uppercase", letterSpacing: "0.05em" }}>Milestone</div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    {(p.milestones ?? []).map(m => (
                      <div key={m.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 12px", borderRadius: 6, background: m.status === "completed" ? C.greenBg : "var(--surface-subtle)", border: "1px solid var(--border)" }}>
                        <span style={{ color: m.status === "completed" ? C.green : C.muted, fontSize: 13 }}>{m.status === "completed" ? "✓" : "○"}</span>
                        <span style={{ flex: 1, fontSize: 12, color: C.text }}>{m.title}</span>
                        <span style={{ fontSize: 11, color: C.muted }}>{fmtDateShort(m.target_date)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Mandor list */}
              {(p.mandor_assignments ?? []).length > 0 && (
                <div style={{ marginBottom: 20 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: C.text, marginBottom: 10, textTransform: "uppercase", letterSpacing: "0.05em" }}>Tim Pelaksana</div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    {(p.mandor_assignments ?? []).map(ma => (
                      <div key={ma.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 12px", borderRadius: 6, background: "var(--surface-subtle)", border: "1px solid var(--border)" }}>
                        <span style={{ fontSize: 12, fontWeight: 600, color: C.text }}>{ma.mandor?.name ?? "—"}</span>
                        <span style={{ fontSize: 11, color: C.muted }}>· {(ma.work_scopes ?? []).length} scope pekerjaan</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div style={{ fontSize: 10, color: C.muted, textAlign: "center", paddingTop: 12, borderTop: "1px solid var(--border)" }}>
                Dicetak dari Puraloka Suite · {new Date().toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" })}
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}

    </div>
  );
}

// ─── Small sub-components ─────────────────────────────────────────────────────

function ActionBtn({ children, navy, danger, onClick }: {
  children: React.ReactNode; navy?: boolean; danger?: boolean; onClick?: () => void;
}) {
  const bg = navy ? "var(--navy)" : danger ? "var(--danger-bg)" : "var(--surface)";
  const col = navy ? "var(--surface)" : danger ? "var(--danger)" : "var(--text-secondary)";
  const border = navy ? "none" : danger ? "1px solid var(--danger-border)" : "1px solid var(--border)";
  const hoverBg = navy ? "var(--aksen-pekat)" : danger ? "var(--danger-bg)" : "var(--surface-subtle)";
  const hoverBorder = navy ? "var(--aksen-pekat)" : danger ? "var(--danger)" : "var(--border-strong)";
  return (
    <button
      onClick={onClick}
      style={{
        display: "inline-flex", alignItems: "center", gap: 4,
        padding: "8px 12px", borderRadius: 6, fontSize: 13, fontWeight: 500,
        cursor: "pointer", transition: "all 0.12s",
        border, background: bg, color: col,
      }}
      onMouseEnter={e => { e.currentTarget.style.background = hoverBg; e.currentTarget.style.borderColor = hoverBorder; }}
      onMouseLeave={e => { e.currentTarget.style.background = bg; e.currentTarget.style.borderColor = navy ? "transparent" : danger ? "var(--danger-border)" : "var(--border)"; }}
    >
      {children}
    </button>
  );
}

function KasbonPill({ label, value, color, bg, border }: {
  label: string; value: number; color: string; bg: string; border: string;
}) {
  return (
    <div style={{ background: bg, border: `1px solid ${border}`, borderRadius: 10, padding: "12px 16px" }}>
      <div style={{ fontSize: 11, color, fontWeight: 600, marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.04em" }}>{label}</div>
      <div style={{ fontSize: 15, fontWeight: 700, color, fontFamily: "var(--font-display)" }}>{
        new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(value)
      }</div>
    </div>
  );
}

function QuickStat({ label, value, valueColor, divider }: {
  label: string; value: string; valueColor?: string; divider?: boolean;
}) {
  return (
    <div style={{
      paddingLeft: divider ? 24 : 0,
      borderLeft: divider ? "1px solid var(--border)" : "none",
    }}>
      <div style={{ fontSize: 11, color: "var(--text-muted)", fontWeight: 500, marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.05em" }}>{label}</div>
      <div style={{ fontSize: 17, fontWeight: 700, color: valueColor ?? "var(--text-primary)", fontFamily: "var(--font-display)", lineHeight: 1.2 }}>{value}</div>
    </div>
  );
}

// ─── Activity Feed ────────────────────────────────────────────────────────────

interface ActivityItem {
  id: string;
  type: "progress" | "kasbon" | "invoice" | "milestone";
  title: string;
  subtitle: string;
  date: string;
  iconBg: string;
  iconColor: string;
  icon: React.ReactNode;
}

function ActivityFeed({ project: p }: { project: Project }) {
  const items: ActivityItem[] = [];

  // Progress logs
  for (const log of (p.progress_logs ?? [])) {
    items.push({
      id: `prog-${log.id}`,
      type: "progress",
      title: `Progress diperbarui ke ${log.pct_overall}%`,
      subtitle: `oleh ${log.reporter?.name ?? "—"}${log.weather ? ` · ${log.weather}` : ""}${log.worker_count != null ? ` · ${log.worker_count} pekerja` : ""}`,
      date: log.logged_at,
      iconBg: "var(--navy-light)", iconColor: "var(--navy)",
      icon: <TrendingUp size={14} />,
    });
  }

  // Kasbons from all work scopes
  for (const ma of (p.mandor_assignments ?? [])) {
    for (const ws of (ma.work_scopes ?? [])) {
      for (const k of (ws.kasbons ?? [])) {
        const statusLabel = k.status === "approved" ? "disetujui" : k.status === "settled" ? "lunas" : "diajukan";
        items.push({
          id: `kasbon-${k.id}`,
          type: "kasbon",
          title: `Kasbon ${fmt(Number(k.amount))} ${statusLabel}`,
          subtitle: `oleh ${ma.mandor?.name ?? "—"} · ${ws.scope_name}`,
          date: k.kasbon_date,
          iconBg: "var(--warning-bg)", iconColor: "var(--warning)",
          icon: <Banknote size={14} />,
        });
      }
    }
  }

  // Invoices that are paid
  for (const inv of (p.invoices ?? [])) {
    if (Number(inv.amount_paid) > 0 && inv.paid_date) {
      items.push({
        id: `inv-${inv.id}`,
        type: "invoice",
        title: `${inv.invoice_number} terbayar ${fmt(Number(inv.amount_paid))}`,
        subtitle: `Invoice ${INVOICE_TYPE_LABEL[inv.invoice_type] ?? inv.invoice_type}`,
        date: inv.paid_date,
        iconBg: "var(--success-bg)", iconColor: "var(--success)",
        icon: <CreditCard size={14} />,
      });
    }
  }

  // Milestones completed
  for (const m of (p.milestones ?? [])) {
    if (m.status === "completed" && m.completed_at) {
      items.push({
        id: `ms-${m.id}`,
        type: "milestone",
        title: `Milestone "${m.title}" selesai`,
        subtitle: `Target: ${fmtDateShort(m.target_date)}`,
        date: m.completed_at,
        iconBg: "var(--navy-light)", iconColor: "var(--navy)",
        icon: <CheckSquare size={14} />,
      });
    }
  }

  // Sort newest first
  items.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  const timeAgo = (d: string) => {
    const days = Math.floor((Date.now() - new Date(d).getTime()) / 86400000);
    if (days === 0) return "Hari ini";
    if (days === 1) return "Kemarin";
    if (days < 30) return `${days} hari lalu`;
    const months = Math.floor(days / 30);
    return `${months} bulan lalu`;
  };

  return (
    <div className="rise rise-6" style={{ ...card, padding: 24 }}>
      <SectionTitle>Aktivitas Terbaru</SectionTitle>
      {items.length === 0 ? (
        <p style={{ fontSize: 13, color: C.muted, textAlign: "center", padding: "16px 0" }}>
          Belum ada aktivitas untuk proyek ini.
        </p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
          {items.slice(0, 20).map((item, idx) => (
            <div key={item.id} style={{
              display: "flex", alignItems: "flex-start", gap: 12,
              paddingTop: idx === 0 ? 0 : 12,
              paddingBottom: idx === items.slice(0, 20).length - 1 ? 0 : 12,
              borderBottom: idx === items.slice(0, 20).length - 1 ? "none" : "1px solid var(--surface-hover)",
            }}>
              <div style={{
                width: 32, height: 32, borderRadius: "50%", flexShrink: 0,
                background: item.iconBg, color: item.iconColor,
                display: "flex", alignItems: "center", justifyContent: "center",
              }}>
                {item.icon}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 500, color: C.text, lineHeight: 1.4 }}>{item.title}</div>
                <div style={{ fontSize: 11, color: C.muted, marginTop: 2 }}>{item.subtitle}</div>
              </div>
              <div style={{ fontSize: 11, color: C.muted, flexShrink: 0, marginTop: 2 }}>
                {timeAgo(item.date)}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
