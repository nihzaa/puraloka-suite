"use client";

import { useEffect, useReducer, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import {
  MapPin, Calendar, ArrowRight, Search, Plus,
  Building2, CheckCircle2, PauseCircle, FileText, RefreshCw,
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
  start_date: string;
  end_date: string;
  actual_end_date: string | null;
  status: "draft" | "active" | "on_hold" | "completed" | "cancelled";
  progress_pct: number;
  clients: Client | null;
  pm: PM | null;
}

type SortKey = "newest" | "value_desc" | "progress_desc" | "deadline_asc";
type StatusFilter = "all" | "active" | "completed" | "on_hold" | "draft";

// ─── Helpers ──────────────────────────────────────────────────────────────────

const fmt = (n: number) =>
  new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(n);

const fmtDate = (d: string) =>
  new Date(d).toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" });

const daysUntil = (d: string) =>
  Math.ceil((new Date(d).getTime() - Date.now()) / 86400000);

const initials = (name: string) =>
  name.split(" ").slice(0, 2).map((w) => w[0]).join("").toUpperCase();

// ─── Design tokens ────────────────────────────────────────────────────────────

const C = {
  navy: "#003366", navyLight: "#EBF2FF",
  text: "#111827", mid: "#6B7280", muted: "#9CA3AF",
  border: "#E5E7EB", bg: "#F8F9FA",
  green: "#15803d", greenBg: "#F0FDF4", greenBorder: "#BBF7D0",
  red: "#B91C1C", redBg: "#FEF2F2",
  yellow: "#D97706", yellowBg: "#FFFBEB", yellowBorder: "#FDE68A",
};

const card: React.CSSProperties = {
  background: "#FFFFFF",
  border: "1px solid #E5E7EB",
  borderRadius: 14,
  boxShadow: "0 1px 4px rgba(0,0,0,0.06)",
};

const STATUS_META: Record<string, { label: string; color: string; bg: string }> = {
  active:      { label: "Aktif",       color: C.navy,   bg: C.navyLight },
  in_progress: { label: "Berlangsung", color: C.navy,   bg: C.navyLight },
  completed:   { label: "Selesai",     color: C.green,  bg: C.greenBg },
  on_hold:     { label: "Ditunda",     color: C.yellow, bg: C.yellowBg },
  draft:       { label: "Draft",       color: C.muted,  bg: "#F3F4F6" },
  cancelled:   { label: "Batal",       color: C.red,    bg: C.redBg },
};

// ─── Sub-components ───────────────────────────────────────────────────────────

function Skeleton({ h = 20, w = "100%" }: { h?: number; w?: string | number }) {
  return (
    <div style={{
      height: h, width: w, borderRadius: 8,
      background: "linear-gradient(90deg, #F3F4F6 0%, #E5E7EB 50%, #F3F4F6 100%)",
      backgroundSize: "200% 100%",
      animation: "shimmer 1.5s ease-in-out infinite",
    }} />
  );
}

function StatusBadge({ status }: { status: string }) {
  const m = STATUS_META[status] ?? { label: status, color: C.muted, bg: "#F3F4F6" };
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 4,
      padding: "3px 10px", borderRadius: 99, fontSize: 11, fontWeight: 600,
      color: m.color, background: m.bg,
    }}>
      <span style={{ width: 5, height: 5, borderRadius: "50%", background: m.color }} />
      {m.label}
    </span>
  );
}

function ModelBadge({ model }: { model: "termin" | "komisi" }) {
  return (
    <span style={{
      display: "inline-block", padding: "2px 8px", borderRadius: 4,
      fontSize: 10, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase",
      background: "#F3F4F6", color: C.mid,
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
    }}>
      {initials(name)}
    </div>
  );
}

function ProgressBar({ pct }: { pct: number }) {
  return (
    <div style={{ height: 6, background: "#F3F4F6", borderRadius: 3, overflow: "hidden" }}>
      <div style={{
        height: "100%", width: `${Math.min(pct, 100)}%`,
        background: "linear-gradient(90deg, #003366, #0066CC)",
        borderRadius: 3, transition: "width 0.4s ease",
      }} />
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

  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Search with debounce
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [sort, setSort] = useState<SortKey>("newest");

  // Modal state
  const [showModal, setShowModal] = useState(false);

  useEffect(() => { fetchProjects(); }, []);

  async function fetchProjects() {
    setLoading(true);
    setError("");
    try {
      const { data } = await api.get<{ projects: Project[] }>("/api/v1/projects");
      setProjects(data.projects);
    } catch {
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
          p.location.toLowerCase().includes(q)
        );
      }
      return true;
    })
    .sort((a, b) => {
      if (sort === "value_desc") return Number(b.contract_value) - Number(a.contract_value);
      if (sort === "progress_desc") return Number(b.progress_pct) - Number(a.progress_pct);
      if (sort === "deadline_asc") return new Date(a.end_date).getTime() - new Date(b.end_date).getTime();
      return 0; // newest — API already returns desc by created_at
    });

  const STATUS_TABS: { key: StatusFilter; label: string; icon: React.ReactNode }[] = [
    { key: "all",       label: "Semua",   icon: <Building2 size={13} /> },
    { key: "active",    label: "Aktif",   icon: <CheckCircle2 size={13} /> },
    { key: "completed", label: "Selesai", icon: <CheckCircle2 size={13} /> },
    { key: "on_hold",   label: "Ditunda", icon: <PauseCircle size={13} /> },
    { key: "draft",     label: "Draft",   icon: <FileText size={13} /> },
  ];

  const counts = projects.reduce<Record<string, number>>((acc, p) => {
    acc[p.status] = (acc[p.status] ?? 0) + 1;
    acc.all = (acc.all ?? 0) + 1;
    return acc;
  }, {});

  const isFiltered = search.trim() !== "" || statusFilter !== "all";

  return (
    <div style={{ padding: "32px 36px 64px", width: "100%" }}>

      {/* ── Header ── */}
      <div className="rise" style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 28 }}>
        <div>
          <h1 style={{ fontFamily: "var(--font-display)", fontSize: 28, fontWeight: 700, color: C.text, marginBottom: 4 }}>
            Proyek
          </h1>
          <p style={{ fontSize: 13, color: C.mid }}>
            Kelola semua proyek konstruksi Puraloka Persada
          </p>
        </div>
        <button
          onClick={() => setShowModal(true)}
          style={{
            display: "flex", alignItems: "center", gap: 6,
            padding: "10px 18px", borderRadius: 8, border: "none",
            background: C.navy, color: "#fff", fontSize: 13, fontWeight: 600,
            cursor: "pointer", transition: "background 0.15s",
          }}
          onMouseEnter={e => { e.currentTarget.style.background = "#002244"; }}
          onMouseLeave={e => { e.currentTarget.style.background = C.navy; }}
        >
          <Plus size={15} />
          Tambah Proyek
        </button>
      </div>

      {/* ── Filter bar ── */}
      <div className="rise rise-1" style={{ ...card, padding: "16px 20px", marginBottom: 20 }}>
        {/* Search + Sort row */}
        <div style={{ display: "flex", gap: 12, marginBottom: 14 }}>
          <div style={{ flex: 1, position: "relative" }}>
            <Search size={14} style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: C.muted, pointerEvents: "none" }} />
            <input
              value={searchInput}
              onChange={e => handleSearchChange(e.target.value)}
              placeholder="Cari nama proyek, klien, atau lokasi..."
              style={{
                width: "100%", padding: "9px 12px 9px 34px",
                border: "1px solid #E5E7EB", borderRadius: 8,
                fontSize: 13, color: C.text, background: "#FFFFFF",
                outline: "none", transition: "border-color 0.15s, box-shadow 0.15s",
                boxSizing: "border-box",
              }}
              onFocus={e => { e.target.style.borderColor = C.navy; e.target.style.boxShadow = "0 0 0 3px rgba(0,51,102,0.08)"; }}
              onBlur={e => { e.target.style.borderColor = "#E5E7EB"; e.target.style.boxShadow = "none"; }}
            />
          </div>
          <select
            value={sort}
            onChange={e => setSort(e.target.value as SortKey)}
            style={{
              padding: "9px 12px", border: "1px solid #E5E7EB", borderRadius: 8,
              fontSize: 13, color: C.text, background: "#FFFFFF",
              cursor: "pointer", outline: "none",
            }}
          >
            <option value="newest">Terbaru</option>
            <option value="value_desc">Nilai Tertinggi</option>
            <option value="progress_desc">Progress Tertinggi</option>
            <option value="deadline_asc">Tenggat Terdekat</option>
          </select>
        </div>

        {/* Status tabs + result count */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ display: "flex", gap: 4 }}>
            {STATUS_TABS.map(tab => {
              const active = statusFilter === tab.key;
              return (
                <button
                  key={tab.key}
                  onClick={() => setStatusFilter(tab.key)}
                  style={{
                    display: "flex", alignItems: "center", gap: 5,
                    padding: "6px 12px", borderRadius: 6, border: "none",
                    fontSize: 12, fontWeight: active ? 600 : 400,
                    cursor: "pointer", transition: "all 0.12s",
                    background: active ? C.navyLight : "transparent",
                    color: active ? C.navy : C.mid,
                  }}
                  onMouseEnter={e => { if (!active) { e.currentTarget.style.background = "#F3F4F6"; e.currentTarget.style.color = C.text; } }}
                  onMouseLeave={e => { if (!active) { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = C.mid; } }}
                >
                  {tab.label}
                  <span style={{
                    fontSize: 10, fontWeight: 600,
                    background: active ? "rgba(0,51,102,0.12)" : "#F3F4F6",
                    color: active ? C.navy : C.muted,
                    padding: "1px 6px", borderRadius: 99,
                  }}>
                    {counts[tab.key] ?? 0}
                  </span>
                </button>
              );
            })}
          </div>
          {!loading && isFiltered && (
            <span style={{ fontSize: 12, color: C.muted, flexShrink: 0 }}>
              {filtered.length} proyek ditemukan
            </span>
          )}
        </div>
      </div>

      {/* ── Error ── */}
      {error && (
        <div style={{ background: "#FEF2F2", border: "1px solid #FECACA", borderRadius: 10, padding: "12px 16px", color: C.red, fontSize: 13, marginBottom: 20, display: "flex", alignItems: "center", gap: 10 }}>
          {error}
          <button onClick={fetchProjects} style={{ color: C.navy, background: "none", border: "none", cursor: "pointer", fontSize: 12, display: "inline-flex", alignItems: "center", gap: 4, fontWeight: 500 }}>
            <RefreshCw size={11} /> Coba lagi
          </button>
        </div>
      )}

      {/* ── Grid ── */}
      {loading ? (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 16 }}>
          {[1, 2, 3, 4].map(i => (
            <div key={i} style={{ ...card, padding: 20, display: "flex", flexDirection: "column", gap: 12 }}>
              <Skeleton h={20} w="60%" />
              <Skeleton h={14} w="40%" />
              <Skeleton h={8} />
              <Skeleton h={14} w="50%" />
            </div>
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div style={{ ...card, padding: "56px 32px", textAlign: "center" }}>
          <Building2 size={40} style={{ color: "#E5E7EB", marginBottom: 12 }} />
          <p style={{ fontSize: 15, fontWeight: 600, color: C.text, marginBottom: 6 }}>Belum ada proyek</p>
          <p style={{ fontSize: 13, color: C.muted, marginBottom: 20 }}>
            {isFiltered ? "Tidak ada proyek yang sesuai filter." : "Mulai tambahkan proyek pertama Anda."}
          </p>
          {!isFiltered && (
            <button
              onClick={() => setShowModal(true)}
              style={{
                display: "inline-flex", alignItems: "center", gap: 6,
                padding: "10px 18px", borderRadius: 8, border: "none",
                background: C.navy, color: "#fff", fontSize: 13, fontWeight: 600, cursor: "pointer",
              }}
            >
              <Plus size={14} /> Tambah Proyek
            </button>
          )}
        </div>
      ) : (
        <div className="rise rise-2" style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 16 }}>
          {filtered.map(p => (
            <ProjectCard
              key={p.id}
              project={p}
              onClick={() => router.push(`/proyek/${p.id}`)}
            />
          ))}
        </div>
      )}

      {/* ── Modal ── */}
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

// ─── Project card ─────────────────────────────────────────────────────────────

function ProjectCard({ project: p, onClick }: { project: Project; onClick: () => void }) {
  const days = daysUntil(p.end_date);
  const overdue = p.status !== "completed" && days < 0;

  return (
    <div
      onClick={onClick}
      style={{
        ...card, padding: 20, cursor: "pointer",
        transition: "all 0.15s ease",
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
      {/* Top row: badges */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
        <StatusBadge status={p.status} />
        <ModelBadge model={p.contract_model} />
      </div>

      {/* Name + location */}
      <h3 style={{ fontSize: 16, fontWeight: 700, color: C.text, marginBottom: 4, lineHeight: 1.3 }}>
        {p.name}
      </h3>
      <div style={{ display: "flex", alignItems: "center", gap: 4, marginBottom: 14 }}>
        <MapPin size={12} style={{ color: C.muted, flexShrink: 0 }} />
        <span style={{ fontSize: 13, color: C.muted }}>{p.location}</span>
      </div>

      {/* Client + PM */}
      <div style={{
        display: "flex", alignItems: "center", gap: 16,
        paddingBottom: 14, borderBottom: "1px solid #F3F4F6", marginBottom: 14,
      }}>
        {p.clients && (
          <div style={{ display: "flex", alignItems: "center", gap: 7, flex: 1, minWidth: 0 }}>
            <Avatar name={p.clients.contact_person} size={26} />
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 10, color: C.muted, marginBottom: 1 }}>Klien</div>
              <div style={{ fontSize: 12, fontWeight: 500, color: C.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {p.clients.contact_person}
              </div>
            </div>
          </div>
        )}
        {p.clients && p.pm && (
          <div style={{ width: 1, height: 28, background: "#F3F4F6", flexShrink: 0 }} />
        )}
        {p.pm && (
          <div style={{ display: "flex", alignItems: "center", gap: 7, flex: 1, minWidth: 0 }}>
            <Avatar name={p.pm.name} size={26} />
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 10, color: C.muted, marginBottom: 1 }}>PM</div>
              <div style={{ fontSize: 12, fontWeight: 500, color: C.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {p.pm.name}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Progress */}
      <div style={{ marginBottom: 14 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 7 }}>
          <span style={{ fontSize: 12, color: C.muted }}>Progress</span>
          <span style={{ fontSize: 13, fontWeight: 700, color: C.navy }}>{p.progress_pct}%</span>
        </div>
        <ProgressBar pct={Number(p.progress_pct)} />
      </div>

      {/* Bottom: value + deadline + arrow */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
        <div>
          <div style={{ fontSize: 10, color: C.muted, marginBottom: 2 }}>Nilai Kontrak</div>
          <div style={{ fontSize: 14, fontWeight: 700, color: C.text }}>{fmt(Number(p.contract_value))}</div>
        </div>
        <div style={{ textAlign: "right" }}>
          <div style={{ fontSize: 10, color: C.muted, marginBottom: 2 }}>Tenggat</div>
          <div style={{
            display: "flex", alignItems: "center", gap: 4,
            fontSize: 12, color: overdue ? C.red : C.mid,
          }}>
            <Calendar size={11} />
            {fmtDate(p.end_date)}
            {overdue && <span style={{ fontSize: 10, color: C.red }}>({Math.abs(days)}h terlambat)</span>}
          </div>
        </div>
        <div style={{
          width: 32, height: 32, borderRadius: 8,
          background: C.navyLight, display: "flex", alignItems: "center", justifyContent: "center",
          flexShrink: 0,
        }}>
          <ArrowRight size={14} style={{ color: C.navy }} />
        </div>
      </div>
    </div>
  );
}
