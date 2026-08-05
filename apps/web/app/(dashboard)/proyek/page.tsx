"use client";

import { useEffect, useReducer, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { api, makeAbortController } from "@/lib/api";
import { useIzin } from "@/lib/use-izin";
import {
  MapPin, Calendar, ArrowRight, Search, Plus,
  Building2, RefreshCw,
  LayoutGrid, List, TrendingUp, Wallet, AlertTriangle, Clock,
  User,
} from "lucide-react";
import { ProjectModal } from "@/components/project-modal";
import { useToast } from "@/components/toast";

// ─── Types ────────────────────────────────────────────────────────────────────

interface Client { id: string; contact_person: string; phone: string; client_type: string }
interface PM { id: string; name: string; email: string; phone: string }
interface Project {
  id: string;
  name: string;
  description: string | null;
  location: string;
  contract_model: "termin" | "komisi";
  tax_scheme: "pph_final" | "ppn";
  contract_value: number;
  commission_pct: number | null;
  start_date: string;
  end_date: string;
  actual_end_date: string | null;
  status: "draft" | "active" | "on_hold" | "completed" | "cancelled";
  progress_pct: number;
  notes: string | null;
  created_at: string;
  clients: Client | null;
  pm: PM | null;
}

type SortKey = "newest" | "value_desc" | "progress_desc" | "deadline_asc";
type StatusFilter = "all" | "active" | "completed" | "on_hold" | "draft";
type ViewMode = "grid" | "list";

// ─── Helpers ──────────────────────────────────────────────────────────────────

const fmt = (n: number) =>
  new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(n);

const fmtCompact = (n: number) => {
  if (n >= 1_000_000_000) return `Rp ${(n / 1_000_000_000).toFixed(1)}M`;
  if (n >= 1_000_000) return `Rp ${(n / 1_000_000).toFixed(0)}jt`;
  return fmt(n);
};

const fmtDate = (d: string) =>
  new Date(d).toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" });

const fmtDateShort = (d: string) =>
  new Date(d).toLocaleDateString("id-ID", { day: "numeric", month: "short" });

const daysUntil = (d: string) =>
  Math.ceil((new Date(d).getTime() - Date.now()) / 86400000);

const initials = (name: string) =>
  name.split(" ").slice(0, 2).map((w) => w[0]).join("").toUpperCase();

// ─── Design tokens ────────────────────────────────────────────────────────────

import { C } from "@/lib/warna-ui";

const card: React.CSSProperties = {
  background: "var(--surface)",
  border: "1px solid var(--border)",
  borderRadius: 14,
  boxShadow: "var(--naik-1)",
};

const STATUS_META: Record<string, { label: string; color: string; bg: string; border: string }> = {
  active:      { label: "Aktif",       color: C.navy,   bg: C.navyLight,  border: "var(--info-border)" },
  in_progress: { label: "Berlangsung", color: C.navy,   bg: C.navyLight,  border: "var(--info-border)" },
  completed:   { label: "Selesai",     color: C.green,  bg: C.greenBg,   border: C.greenBorder },
  on_hold:     { label: "Ditunda",     color: C.yellow, bg: C.yellowBg,  border: C.yellowBorder },
  draft:       { label: "Draft",       color: C.muted,  bg: "var(--surface-hover)",   border: "var(--border)" },
  cancelled:   { label: "Batal",       color: C.red,    bg: C.redBg,     border: C.redBorder },
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

function StatusBadge({ status }: { status: string }) {
  const m = STATUS_META[status] ?? { label: status, color: C.muted, bg: "var(--surface-hover)", border: "var(--border)" };
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 4,
      padding: "2px 8px", borderRadius: 99, fontSize: 11, fontWeight: 600,
      color: m.color, background: m.bg, border: `1px solid ${m.border}`,
    }}>
      <span style={{ width: 5, height: 5, borderRadius: "50%", background: m.color, flexShrink: 0 }} />
      {m.label}
    </span>
  );
}

function ModelBadge({ model }: { model: "termin" | "komisi" }) {
  return (
    <span style={{
      display: "inline-block", padding: "2px 8px", borderRadius: 6,
      fontSize: 10, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase",
      background: "var(--surface-hover)", color: C.mid, border: "1px solid var(--border)",
    }}>
      {model === "termin" ? "TERMIN" : "KOMISI"}
    </span>
  );
}

function Avatar({ name, size = 28 }: { name: string; size?: number }) {
  return (
    <div style={{
      width: size, height: size, borderRadius: "50%",
      background: C.navyLight, color: C.navy,
      display: "flex", alignItems: "center", justifyContent: "center",
      fontSize: size * 0.36, fontWeight: 700, flexShrink: 0,
      border: "1.5px solid var(--info-border)",
    }}>
      {initials(name)}
    </div>
  );
}

function ProgressBar({ pct, color = C.navy }: { pct: number; color?: string }) {
  return (
    <div style={{ height: 6, background: "var(--surface-hover)", borderRadius: 0, overflow: "hidden" }}>
      <div style={{
        height: "100%", width: `${Math.min(pct, 100)}%`,
        background: `linear-gradient(90deg, ${color}, ${color}CC)`,
        borderRadius: 0, transition: "width 0.5s ease",
      }} />
    </div>
  );
}

// Summary KPI card
function SummaryCard({ label, value, sub, icon, accent }: {
  label: string; value: string; sub?: string; icon: React.ReactNode; accent?: string;
}) {
  return (
    <div
      style={{
        flex: 1, background: "var(--surface)", borderRadius: 10, padding: "16px 16px",
        border: "1px solid var(--border)", display: "flex", alignItems: "center", gap: 12,
        boxShadow: "var(--naik-1)", transition: "all 0.15s",
      }}
      onMouseEnter={e => { e.currentTarget.style.boxShadow = "0 6px 18px rgba(0,51,102,0.10)"; e.currentTarget.style.transform = "translateY(-2px)"; }}
      onMouseLeave={e => { e.currentTarget.style.boxShadow = "0 1px 3px rgba(0,0,0,0.05)"; e.currentTarget.style.transform = "translateY(0)"; }}
    >
      <div style={{
        width: 42, height: 42, borderRadius: 10, flexShrink: 0,
        background: accent ? `${accent}15` : C.navyLight,
        display: "flex", alignItems: "center", justifyContent: "center",
      }}>
        {icon}
      </div>
      <div style={{ minWidth: 0 }}>
        <p style={{ fontSize: 11, color: C.muted, margin: "0 0 2px", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em" }}>
          {label}
        </p>
        <p style={{ fontSize: 20, fontWeight: 800, color: accent ?? C.text, margin: "0 0 1px", fontFamily: "var(--font-display)" }}>
          {value}
        </p>
        {sub && <p style={{ fontSize: 11, color: C.muted, margin: 0 }}>{sub}</p>}
      </div>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function ProyekPage() {
  const [mounted, mount] = useReducer(() => true, false);
  useEffect(mount, [mount]);
  if (!mounted) return null;
  return <ProyekContent />;
}

function ProyekContent() {
  const router = useRouter();
  const { showToast } = useToast();
  // Diangkat dari JSX: `hasPermission` di jalur render membuat pohon server
  // dan klien berbeda. Detail: `lib/use-izin.ts`.
  const bolehBuatProyek = useIzin("projects:create");

  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [viewMode, setViewMode] = useState<ViewMode>("grid");

  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [sort, setSort] = useState<SortKey>("newest");
  const [showModal, setShowModal] = useState(false);

  useEffect(() => {
    fetchProjects();
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      abortRef.current?.abort();
    };
  }, []);

  async function fetchProjects() {
    abortRef.current?.abort();
    abortRef.current = makeAbortController();
    setLoading(true);
    setError("");
    try {
      const { data } = await api.get<{ projects: Project[] }>("/api/v1/projects", {
        signal: abortRef.current.signal,
      });
      setProjects(data.projects);
    } catch (err: unknown) {
      if ((err as { name?: string })?.name === "CanceledError") return;
      setError("Gagal memuat proyek. Pastikan API server berjalan.");
    } finally {
      setLoading(false);
    }
  }

  function handleSearchChange(val: string) {
    setSearchInput(val);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => setSearch(val), 300);
  }

  function handleCreateSuccess() {
    fetchProjects();
    showToast("success", "Proyek berhasil dibuat!");
  }

  // Filter + sort
  const filtered = projects
    .filter((p) => {
      if (statusFilter !== "all" && p.status !== statusFilter) return false;
      if (search) {
        const q = search.toLowerCase();
        return (
          p.name.toLowerCase().includes(q) ||
          (p.clients?.contact_person ?? "").toLowerCase().includes(q) ||
          p.location.toLowerCase().includes(q) ||
          (p.pm?.name ?? "").toLowerCase().includes(q)
        );
      }
      return true;
    })
    .sort((a, b) => {
      if (sort === "value_desc") return Number(b.contract_value) - Number(a.contract_value);
      if (sort === "progress_desc") return Number(b.progress_pct) - Number(a.progress_pct);
      if (sort === "deadline_asc") return new Date(a.end_date).getTime() - new Date(b.end_date).getTime();
      // "newest" — sort by created_at descending
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    });

  const STATUS_TABS: { key: StatusFilter; label: string }[] = [
    { key: "all",       label: "Semua" },
    { key: "active",    label: "Aktif" },
    { key: "completed", label: "Selesai" },
    { key: "on_hold",   label: "Ditunda" },
    { key: "draft",     label: "Draft" },
  ];

  const counts = projects.reduce<Record<string, number>>((acc, p) => {
    acc[p.status] = (acc[p.status] ?? 0) + 1;
    acc.all = (acc.all ?? 0) + 1;
    return acc;
  }, {});

  // Summary aggregations
  const totalContract = projects.reduce((s, p) => s + Number(p.contract_value), 0);
  const activeCount = projects.filter(p => p.status === "active").length;
  const overdueCount = projects.filter(p => p.status !== "completed" && daysUntil(p.end_date) < 0).length;
  const avgProgress = projects.length > 0
    ? projects.filter(p => p.status === "active").reduce((s, p) => s + Number(p.progress_pct), 0) / Math.max(activeCount, 1)
    : 0;

  const isFiltered = search.trim() !== "" || statusFilter !== "all";

  return (
    <div style={{ padding: "var(--pad-atas) var(--pad-x) var(--pad-bawah)", width: "100%", maxWidth: "var(--w-page)", margin: "0 auto" }}>

      {/* ── Header ── */}
      <div className="rise" style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 24 }}>
        <div>
          <h1 style={{ fontFamily: "var(--font-display)", fontSize: 28, fontWeight: 700, color: C.text, marginBottom: 4 }}>
            Proyek
          </h1>
          <p style={{ fontSize: 13, color: C.mid }}>
            Kelola semua proyek konstruksi Puraloka Persada
          </p>
        </div>
        {bolehBuatProyek && (
          <button
            onClick={() => setShowModal(true)}
            style={{
              display: "flex", alignItems: "center", gap: 6,
              padding: "8px 16px", borderRadius: 6, border: "none",
              background: C.navy, color: "var(--surface)", fontSize: 13, fontWeight: 600,
              cursor: "pointer", transition: "background 0.15s",
            }}
            onMouseEnter={e => { e.currentTarget.style.background = "var(--aksen-pekat)"; }}
            onMouseLeave={e => { e.currentTarget.style.background = C.navy; }}
          >
            <Plus size={15} />
            Tambah Proyek
          </button>
        )}
      </div>

      {/* ── Summary KPI bar ── */}
      {!loading && projects.length > 0 && (
        <div className="rise rise-1" style={{ display: "flex", gap: 12, marginBottom: 20, flexWrap: "wrap" }}>
          <SummaryCard
            label="Total Kontrak"
            value={fmtCompact(totalContract)}
            sub={`${projects.length} proyek total`}
            icon={<Wallet size={20} color={C.navy} />}
          />
          <SummaryCard
            label="Proyek Aktif"
            value={String(activeCount)}
            sub={`${counts.completed ?? 0} selesai`}
            icon={<Building2 size={20} color={C.navy} />}
          />
          <SummaryCard
            label="Avg Progress"
            value={`${avgProgress.toFixed(1)}%`}
            sub="rata-rata proyek aktif"
            icon={<TrendingUp size={20} color={C.navy} />}
          />
          {overdueCount > 0 && (
            <SummaryCard
              label="Terlambat"
              value={String(overdueCount)}
              sub="melebihi tenggat"
              icon={<AlertTriangle size={20} color={C.red} />}
              accent={C.red}
            />
          )}
        </div>
      )}

      {/* ── Filter bar ── */}
      <div className="rise rise-2" style={{ ...card, padding: "12px 16px", marginBottom: 20 }}>
        <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
          {/* Search */}
          <div style={{ flex: 1, position: "relative" }}>
            <Search size={14} style={{ position: "absolute", left: 11, top: "50%", transform: "translateY(-50%)", color: C.muted, pointerEvents: "none" }} />
            <input
              value={searchInput}
              onChange={e => handleSearchChange(e.target.value)}
              placeholder="Cari nama proyek, klien, PM, atau lokasi..."
              style={{
                width: "100%", padding: "8px 12px 8px 32px",
                border: "1px solid var(--border)", borderRadius: 6,
                fontSize: 13, color: C.text, background: "var(--surface)",
                outline: "none", transition: "border-color 0.15s, box-shadow 0.15s",
                boxSizing: "border-box",
              }}
              onFocus={e => { e.target.style.borderColor = C.navy; e.target.style.boxShadow = "0 0 0 3px rgba(0,51,102,0.08)"; }}
              onBlur={e => { e.target.style.borderColor = "var(--border)"; e.target.style.boxShadow = "none"; }}
            />
          </div>
          {/* Sort */}
          <select aria-label="Urutan"
            value={sort}
            onChange={e => setSort(e.target.value as SortKey)}
            style={{
              padding: "8px 12px", border: "1px solid var(--border)", borderRadius: 6,
              fontSize: 13, color: C.text, background: "var(--surface)",
              cursor: "pointer", outline: "none",
            }}
          >
            <option value="newest">Terbaru</option>
            <option value="value_desc">Nilai Tertinggi</option>
            <option value="progress_desc">Serapan Tertinggi</option>
            <option value="deadline_asc">Tenggat Terdekat</option>
          </select>
          {/* View toggle */}
          <div style={{ display: "flex", border: "1px solid var(--border)", borderRadius: 6, overflow: "hidden" }}>
            {(["grid", "list"] as ViewMode[]).map(v => (
              <button aria-label={v === "grid" ? "Grid" : "List"}
                key={v}
                onClick={() => setViewMode(v)}
                title={v === "grid" ? "Grid" : "List"}
                style={{
                  width: 36, height: 36, display: "flex", alignItems: "center", justifyContent: "center",
                  border: "none", cursor: "pointer", transition: "all 0.12s",
                  background: viewMode === v ? C.navyLight : "var(--surface)",
                  color: viewMode === v ? C.navy : C.muted,
                }}
              >
                {v === "grid" ? <LayoutGrid size={15} /> : <List size={15} />}
              </button>
            ))}
          </div>
        </div>

        {/* Status tabs + count */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
            {STATUS_TABS.map(tab => {
              const active = statusFilter === tab.key;
              return (
                <button
                  key={tab.key}
                  aria-label={`Tampilkan proyek berstatus ${tab.label}`}
                  aria-pressed={active}
                  onClick={() => setStatusFilter(tab.key)}
                  style={{
                    display: "inline-flex", alignItems: "center", gap: 4,
                    padding: "4px 12px", borderRadius: 6, border: "none",
                    fontSize: 12, fontWeight: active ? 600 : 400,
                    cursor: "pointer", transition: "all 0.12s",
                    background: active ? C.navyLight : "transparent",
                    color: active ? C.navy : C.mid,
                  }}
                  onMouseEnter={e => { if (!active) { e.currentTarget.style.background = "var(--surface-hover)"; e.currentTarget.style.color = C.text; } }}
                  onMouseLeave={e => { if (!active) { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = C.mid; } }}
                >
                  {tab.label}
                  <span style={{
                    fontSize: 10, fontWeight: 700,
                    background: active ? "color-mix(in srgb, var(--aksen) 18%, transparent)" : "var(--surface-hover)",
                    color: active ? C.navy : C.muted,
                    padding: "0px 6px", borderRadius: 99,
                  }}>
                    {counts[tab.key] ?? 0}
                  </span>
                </button>
              );
            })}
          </div>
          {!loading && (
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              {isFiltered && (
                <span style={{ fontSize: 12, color: C.muted }}>
                  {filtered.length} dari {projects.length} proyek
                </span>
              )}
              <button
                onClick={fetchProjects}
                style={{ background: "transparent", border: "none", cursor: "pointer", color: C.muted, display: "flex", alignItems: "center", gap: 4, fontSize: 12, padding: "4px 8px", borderRadius: 6 }}
                onMouseEnter={e => { e.currentTarget.style.background = "var(--surface-hover)"; e.currentTarget.style.color = C.text; }}
                onMouseLeave={e => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = C.muted; }}
              >
                <RefreshCw size={12} /> Refresh
              </button>
            </div>
          )}
        </div>
      </div>

      {/* ── Error ── */}
      {error && (
        <div style={{
          background: C.redBg, border: `1px solid ${C.redBorder}`, borderRadius: 10,
          padding: "12px 16px", color: C.red, fontSize: 13, marginBottom: 20,
          display: "flex", alignItems: "center", gap: 8,
        }}>
          <AlertTriangle size={15} />
          {error}
          <button onClick={fetchProjects} style={{ color: C.navy, background: "none", border: "none", cursor: "pointer", fontSize: 12, display: "inline-flex", alignItems: "center", gap: 4, fontWeight: 600, marginLeft: "auto" }}>
            <RefreshCw size={11} /> Coba lagi
          </button>
        </div>
      )}

      {/* ── Content ── */}
      {loading ? (
        <div style={{ display: "grid", gridTemplateColumns: viewMode === "grid" ? "repeat(2, 1fr)" : "1fr", gap: 12 }}>
          {[1, 2, 3, 4].map(i => (
            <div key={i} style={{ ...card, padding: 20, display: "flex", flexDirection: "column", gap: 12 }}>
              <div style={{ display: "flex", gap: 8 }}><Skeleton h={22} w={70} /><Skeleton h={22} w={55} /></div>
              <Skeleton h={20} w="70%" />
              <Skeleton h={14} w="45%" />
              <Skeleton h={8} />
              <div style={{ display: "flex", justifyContent: "space-between" }}><Skeleton h={14} w="40%" /><Skeleton h={14} w="30%" /></div>
            </div>
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div style={{ ...card, padding: "56px 32px", textAlign: "center" }}>
          <Building2 size={40} style={{ color: "var(--border)", marginBottom: 12 }} />
          <p style={{ fontSize: 15, fontWeight: 600, color: C.text, marginBottom: 6 }}>
            {isFiltered ? "Tidak ada proyek yang cocok" : "Belum ada proyek"}
          </p>
          <p style={{ fontSize: 13, color: C.muted, marginBottom: 20 }}>
            {isFiltered
              ? "Coba ubah filter atau kata kunci pencarian."
              : "Mulai tambahkan proyek pertama Anda."}
          </p>
          {isFiltered ? (
            <button
              onClick={() => { setSearch(""); setSearchInput(""); setStatusFilter("all"); }}
              style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "8px 16px", borderRadius: 6, border: `1px solid ${C.border}`, background: "var(--surface)", color: C.text, fontSize: 13, cursor: "pointer" }}
            >
              Reset filter
            </button>
          ) : bolehBuatProyek ? (
            <button
              onClick={() => setShowModal(true)}
              style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "8px 16px", borderRadius: 6, border: "none", background: C.navy, color: "var(--surface)", fontSize: 13, fontWeight: 600, cursor: "pointer" }}
            >
              <Plus size={14} /> Tambah Proyek
            </button>
          ) : null}
        </div>
      ) : viewMode === "grid" ? (
        <div className="rise rise-3" style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 16 }}>
          {filtered.map(p => (
            <ProjectCardGrid key={p.id} project={p} onClick={() => router.push(`/proyek/${p.id}`)} />
          ))}
        </div>
      ) : (
        <div className="rise rise-3" style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {filtered.map(p => (
            <ProjectCardList key={p.id} project={p} onClick={() => router.push(`/proyek/${p.id}`)} />
          ))}
        </div>
      )}

      {/* ── Create modal ── */}
      {showModal && (
        <ProjectModal
          mode="create"
          onClose={() => setShowModal(false)}
          onSuccess={handleCreateSuccess}
        />
      )}
    </div>
  );
}

// ─── Grid card ────────────────────────────────────────────────────────────────

function ProjectCardGrid({ project: p, onClick }: { project: Project; onClick: () => void }) {
  const days = daysUntil(p.end_date);
  const overdue = p.status !== "completed" && days < 0;
  const dueSoon = !overdue && p.status !== "completed" && days >= 0 && days <= 14;

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={e => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault()   // Spasi jangan menggulir daftar proyek
          onClick()
        }
      }}
      style={{
        ...card, padding: 20, cursor: "pointer",
        transition: "all 0.15s ease",
        borderColor: overdue ? C.redBorder : dueSoon ? C.yellowBorder : "var(--border)",
      }}
      onMouseEnter={e => {
        e.currentTarget.style.boxShadow = "0 6px 20px rgba(0,51,102,0.10)";
        e.currentTarget.style.transform = "translateY(-2px)";
      }}
      onMouseLeave={e => {
        e.currentTarget.style.boxShadow = "0 1px 4px rgba(0,0,0,0.06)";
        e.currentTarget.style.transform = "translateY(0)";
      }}
    >
      {/* Top: badges + deadline pill */}
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 10, flexWrap: "wrap" }}>
        <StatusBadge status={p.status} />
        <ModelBadge model={p.contract_model} />
        {overdue && (
          <span style={{
            marginLeft: "auto", display: "inline-flex", alignItems: "center", gap: 2,
            padding: "2px 8px", borderRadius: 99, fontSize: 10, fontWeight: 700,
            background: C.redBg, color: C.red, border: `1px solid ${C.redBorder}`,
          }}>
            <AlertTriangle size={9} /> {Math.abs(days)}h terlambat
          </span>
        )}
        {dueSoon && (
          <span style={{
            marginLeft: "auto", display: "inline-flex", alignItems: "center", gap: 2,
            padding: "2px 8px", borderRadius: 99, fontSize: 10, fontWeight: 700,
            background: C.yellowBg, color: C.yellow, border: `1px solid ${C.yellowBorder}`,
          }}>
            <Clock size={9} /> {days}h lagi
          </span>
        )}
      </div>

      {/* Name */}
      <h3 style={{ fontSize: 15, fontWeight: 700, color: C.text, marginBottom: 4, lineHeight: 1.35 }}>
        {p.name}
      </h3>

      {/* Location */}
      <div style={{ display: "flex", alignItems: "center", gap: 4, marginBottom: 14 }}>
        <MapPin size={11} style={{ color: C.muted, flexShrink: 0 }} />
        <span style={{ fontSize: 12, color: C.muted }}>{p.location}</span>
      </div>

      {/* Client + PM */}
      <div style={{
        display: "flex", alignItems: "center", gap: 12,
        paddingBottom: 14, borderBottom: "1px solid var(--surface-hover)", marginBottom: 14,
      }}>
        {p.clients && (
          <div style={{ display: "flex", alignItems: "center", gap: 6, flex: 1, minWidth: 0 }}>
            <Avatar name={p.clients.contact_person} size={26} />
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 10, color: C.muted }}>Klien</div>
              <div style={{ fontSize: 12, fontWeight: 500, color: C.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {p.clients.contact_person}
              </div>
            </div>
          </div>
        )}
        {p.clients && p.pm && <div style={{ width: 1, height: 28, background: "var(--surface-hover)", flexShrink: 0 }} />}
        {p.pm && (
          <div style={{ display: "flex", alignItems: "center", gap: 6, flex: 1, minWidth: 0 }}>
            <Avatar name={p.pm.name} size={26} />
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 10, color: C.muted }}>PM</div>
              <div style={{ fontSize: 12, fontWeight: 500, color: C.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {p.pm.name}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Serapan progress */}
      <div style={{ marginBottom: 14 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
          <span style={{ fontSize: 11, color: C.muted }}>Serapan Anggaran</span>
          <span style={{ fontSize: 13, fontWeight: 700, color: C.navy }}>{Number(p.progress_pct).toFixed(1)}%</span>
        </div>
        <ProgressBar pct={Number(p.progress_pct)} color="var(--info)" />
      </div>

      {/* Bottom: value + deadline + arrow */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
        <div>
          <div style={{ fontSize: 10, color: C.muted, marginBottom: 2 }}>Nilai Kontrak</div>
          <div style={{ fontSize: 13, fontWeight: 700, color: C.text }}>{fmtCompact(Number(p.contract_value))}</div>
        </div>
        <div style={{ textAlign: "right" }}>
          <div style={{ fontSize: 10, color: C.muted, marginBottom: 2 }}>Tenggat</div>
          <div style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 12, color: overdue ? C.red : C.mid, fontWeight: overdue ? 600 : 400 }}>
            <Calendar size={11} />
            {fmtDate(p.end_date)}
          </div>
        </div>
        <div style={{
          width: 30, height: 30, borderRadius: 6, flexShrink: 0,
          background: C.navyLight, display: "flex", alignItems: "center", justifyContent: "center",
        }}>
          <ArrowRight size={13} style={{ color: C.navy }} />
        </div>
      </div>
    </div>
  );
}

// ─── List card ────────────────────────────────────────────────────────────────

function ProjectCardList({ project: p, onClick }: { project: Project; onClick: () => void }) {
  const days = daysUntil(p.end_date);
  const overdue = p.status !== "completed" && days < 0;
  const dueSoon = !overdue && p.status !== "completed" && days >= 0 && days <= 14;

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={e => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault()   // Spasi jangan menggulir daftar
          onClick()
        }
      }}
      style={{
        ...card, padding: "16px 20px", cursor: "pointer",
        display: "grid",
        gridTemplateColumns: "1fr 160px 160px 120px 36px",
        alignItems: "center", gap: 16,
        transition: "all 0.15s ease",
        borderColor: overdue ? C.redBorder : "var(--border)",
      }}
      onMouseEnter={e => {
        e.currentTarget.style.boxShadow = "0 4px 14px rgba(0,51,102,0.09)";
        e.currentTarget.style.borderColor = overdue ? C.redBorder : "var(--info-border)";
      }}
      onMouseLeave={e => {
        e.currentTarget.style.boxShadow = "0 1px 4px rgba(0,0,0,0.06)";
        e.currentTarget.style.borderColor = overdue ? C.redBorder : "var(--border)";
      }}
    >
      {/* Col 1: name + location + badges */}
      <div style={{ minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 5, flexWrap: "wrap" }}>
          <StatusBadge status={p.status} />
          <ModelBadge model={p.contract_model} />
        </div>
        <div style={{ fontSize: 13, fontWeight: 700, color: C.text, marginBottom: 3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {p.name}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <span style={{ display: "flex", alignItems: "center", gap: 2, fontSize: 11, color: C.muted }}>
            <MapPin size={10} /> {p.location}
          </span>
          {p.clients && (
            <span style={{ display: "flex", alignItems: "center", gap: 2, fontSize: 11, color: C.muted }}>
              <User size={10} /> {p.clients.contact_person}
            </span>
          )}
        </div>
      </div>

      {/* Col 2: contract value + PM */}
      <div>
        <div style={{ fontSize: 13, fontWeight: 700, color: C.text, marginBottom: 3 }}>
          {fmtCompact(Number(p.contract_value))}
        </div>
        {p.pm && (
          <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <Avatar name={p.pm.name} size={18} />
            <span style={{ fontSize: 11, color: C.mid, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {p.pm.name}
            </span>
          </div>
        )}
      </div>

      {/* Col 3: serapan progress */}
      <div>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 5 }}>
          <span style={{ fontSize: 10, color: C.muted }}>Serapan</span>
          <span style={{ fontSize: 11, fontWeight: 700, color: C.navy }}>{Number(p.progress_pct).toFixed(1)}%</span>
        </div>
        <ProgressBar pct={Number(p.progress_pct)} color="var(--info)" />
      </div>

      {/* Col 4: deadline */}
      <div style={{ textAlign: "right" }}>
        <div style={{ fontSize: 10, color: C.muted, marginBottom: 3 }}>Tenggat</div>
        <div style={{ fontSize: 12, fontWeight: overdue ? 600 : 400, color: overdue ? C.red : dueSoon ? C.yellow : C.mid }}>
          {fmtDateShort(p.end_date)}
        </div>
        {overdue && <div style={{ fontSize: 10, color: C.red, marginTop: 2 }}>{Math.abs(days)}h terlambat</div>}
        {dueSoon && <div style={{ fontSize: 10, color: C.yellow, marginTop: 2 }}>{days}h lagi</div>}
      </div>

      {/* Col 5: arrow */}
      <div style={{
        width: 30, height: 30, borderRadius: 6,
        background: C.navyLight, display: "flex", alignItems: "center", justifyContent: "center",
      }}>
        <ArrowRight size={13} style={{ color: C.navy }} />
      </div>
    </div>
  );
}
