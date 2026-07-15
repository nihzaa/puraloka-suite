"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { api, getStoredUser } from "@/lib/api";
import { FolderKanban, TrendingUp, AlertTriangle, CheckCircle, Clock, ChevronRight } from "lucide-react";

const C = {
  navy: "var(--navy)", navyLight: "var(--navy-light)",
  text: "var(--text-primary)", mid: "var(--text-secondary)", muted: "var(--text-muted)",
  border: "var(--border)", bg: "var(--bg)", surface: "var(--surface)",
  green: "var(--success)", greenBg: "var(--success-bg)",
  yellow: "var(--warning)", yellowBg: "var(--warning-bg)",
  red: "var(--danger)", redBg: "var(--danger-bg)",
  blue: "var(--info)", blueBg: "var(--info-bg)",
};

function fmt(n: number) {
  return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(n);
}

const STATUS_META: Record<string, { label: string; color: string; bg: string }> = {
  planning:  { label: "Perencanaan", color: C.blue,   bg: C.blueBg   },
  active:    { label: "Aktif",       color: C.green,  bg: C.greenBg  },
  on_hold:   { label: "Ditunda",     color: C.yellow, bg: C.yellowBg },
  completed: { label: "Selesai",     color: C.green,  bg: C.greenBg  },
  cancelled: { label: "Dibatalkan",  color: C.red,    bg: C.redBg    },
};

export default function PMDashboardPage() {
  const [projects, setProjects] = useState<any[]>([]);
  const [pendingKasbons, setPendingKasbons] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const user = getStoredUser();

  useEffect(() => {
    Promise.all([
      api.get("/api/v1/projects"),
      api.get("/api/v1/finance/kasbons?status=pending"),
    ]).then(([pRes, kRes]) => {
      setProjects(pRes.data?.projects ?? []);
      setPendingKasbons(kRes.data?.kasbons ?? []);
    }).finally(() => setLoading(false));
  }, []);

  const activeProjects = projects.filter((p) => p.status === "active");
  const overdueProjects = activeProjects.filter((p) => p.end_date && new Date(p.end_date) < new Date());
  const totalContractValue = projects.reduce((s, p) => s + (p.contract_value ?? 0), 0);

  return (
    <div style={{ maxWidth: 900, margin: "0 auto" }}>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: C.text, margin: 0 }}>
          Halo, {user?.name?.split(" ")[0]} 👋
        </h1>
        <p style={{ fontSize: 14, color: C.mid, margin: "4px 0 0" }}>Ringkasan proyek yang Anda kelola</p>
      </div>

      {/* KPI Cards */}
      {!loading && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 12, marginBottom: 24 }}>
          <div style={{ background: C.surface, borderRadius: 12, padding: 16, border: `1px solid ${C.border}`, boxShadow: "0 1px 3px rgba(0,0,0,0.05)" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
              <FolderKanban size={16} color={C.navy} />
              <span style={{ fontSize: 11, color: C.mid, fontWeight: 500 }}>Proyek Aktif</span>
            </div>
            <div style={{ fontSize: 28, fontWeight: 700, color: C.navy }}>{activeProjects.length}</div>
            <div style={{ fontSize: 11, color: C.mid, marginTop: 2 }}>dari {projects.length} total</div>
          </div>

          <div style={{ background: C.surface, borderRadius: 12, padding: 16, border: `1px solid ${C.border}`, boxShadow: "0 1px 3px rgba(0,0,0,0.05)" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
              <Clock size={16} color={C.yellow} />
              <span style={{ fontSize: 11, color: C.mid, fontWeight: 500 }}>Kasbon Pending</span>
            </div>
            <div style={{ fontSize: 28, fontWeight: 700, color: C.yellow }}>{pendingKasbons.length}</div>
            <div style={{ fontSize: 11, color: C.mid, marginTop: 2 }}>menunggu persetujuan</div>
          </div>

          <div style={{ background: C.surface, borderRadius: 12, padding: 16, border: `1px solid ${C.border}`, boxShadow: "0 1px 3px rgba(0,0,0,0.05)" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
              <TrendingUp size={16} color={C.green} />
              <span style={{ fontSize: 11, color: C.mid, fontWeight: 500 }}>Total Nilai Kontrak</span>
            </div>
            <div style={{ fontSize: 16, fontWeight: 700, color: C.green }}>{fmt(totalContractValue)}</div>
          </div>

          <div style={{ background: overdueProjects.length > 0 ? C.redBg : C.surface, borderRadius: 12, padding: 16, border: `1px solid ${overdueProjects.length > 0 ? C.red + "40" : C.border}`, boxShadow: "0 1px 3px rgba(0,0,0,0.05)" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
              <AlertTriangle size={16} color={overdueProjects.length > 0 ? C.red : C.muted} />
              <span style={{ fontSize: 11, color: C.mid, fontWeight: 500 }}>Proyek Terlambat</span>
            </div>
            <div style={{ fontSize: 28, fontWeight: 700, color: overdueProjects.length > 0 ? C.red : C.mid }}>
              {overdueProjects.length}
            </div>
          </div>
        </div>
      )}

      {/* Pending Kasbon Alert */}
      {!loading && pendingKasbons.length > 0 && (
        <div style={{ background: C.yellowBg, border: `1px solid ${C.yellow}40`, borderRadius: 12, padding: "14px 16px", marginBottom: 20, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <AlertTriangle size={18} color={C.yellow} />
            <span style={{ fontSize: 13, fontWeight: 600, color: C.yellow }}>
              {pendingKasbons.length} kasbon menunggu persetujuan Anda
            </span>
          </div>
          <Link href="/pm-portal/keuangan" style={{ fontSize: 12, fontWeight: 600, color: C.navy, textDecoration: "none", padding: "5px 12px", borderRadius: 8, background: C.navyLight }}>
            Lihat →
          </Link>
        </div>
      )}

      {/* Project List */}
      <section>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <h2 style={{ fontSize: 15, fontWeight: 700, color: C.text, margin: 0 }}>Proyek Saya</h2>
          <Link href="/pm-portal/proyek" style={{ fontSize: 13, color: C.navy, textDecoration: "none", fontWeight: 500 }}>
            Lihat semua →
          </Link>
        </div>

        {loading && <div style={{ textAlign: "center", padding: 60, color: C.mid }}>Memuat...</div>}

        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {activeProjects.slice(0, 5).map((p) => {
            const meta = STATUS_META[p.status] ?? STATUS_META.planning;
            const isLate = p.end_date && new Date(p.end_date) < new Date();
            return (
              <Link key={p.id} href={`/pm-portal/proyek/${p.id}`} style={{ textDecoration: "none" }}>
                <div style={{ background: C.surface, borderRadius: 12, padding: "16px 20px", border: `1px solid ${isLate ? C.red + "50" : C.border}`, boxShadow: "0 1px 3px rgba(0,0,0,0.04)", cursor: "pointer" }}>
                  <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6, flexWrap: "wrap" }}>
                        <span style={{ fontSize: 14, fontWeight: 700, color: C.text }}>{p.name}</span>
                        <span style={{ fontSize: 11, fontWeight: 600, padding: "2px 8px", borderRadius: 20, color: meta.color, background: meta.bg }}>{meta.label}</span>
                        {isLate && <span style={{ fontSize: 11, fontWeight: 600, padding: "2px 8px", borderRadius: 20, color: C.red, background: C.redBg }}>Terlambat</span>}
                      </div>
                      <div style={{ fontSize: 12, color: C.mid, marginBottom: 8 }}>
                        {p.client?.name ?? "—"} · {fmt(p.contract_value ?? 0)}
                      </div>
                      <div style={{ height: 5, background: "var(--border)", borderRadius: 3, overflow: "hidden" }}>
                        <div style={{ height: "100%", borderRadius: 3, width: `${p.progress_pct ?? 0}%`, background: isLate ? C.red : C.navy, transition: "width 0.5s" }} />
                      </div>
                      <div style={{ fontSize: 11, color: C.mid, marginTop: 4 }}>{p.progress_pct ?? 0}% selesai</div>
                    </div>
                    <ChevronRight size={16} color={C.muted} style={{ flexShrink: 0, marginTop: 2 }} />
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      </section>
    </div>
  );
}
