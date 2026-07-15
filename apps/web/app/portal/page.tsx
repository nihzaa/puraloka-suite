"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { api, getStoredUser } from "@/lib/api";
import { MapPin, Calendar, ChevronRight, TrendingUp, AlertCircle } from "lucide-react";

const C = {
  navy: "var(--navy)", navyLight: "var(--navy-light)",
  text: "var(--text-primary)", mid: "var(--text-secondary)", muted: "var(--text-muted)",
  border: "var(--border)", bg: "var(--bg)", surface: "var(--surface)",
  green: "var(--success)", greenBg: "var(--success-bg)",
  yellow: "var(--warning)", yellowBg: "var(--warning-bg)",
  red: "var(--danger)", redBg: "var(--danger-bg)",
  blue: "var(--info)", blueBg: "var(--info-bg)",
};

interface Project {
  id: string;
  name: string;
  location: string;
  status: string;
  contract_model: string;
  contract_value: number;
  start_date: string | null;
  end_date: string | null;
  progress_pct: number;
}

const STATUS_META: Record<string, { label: string; color: string; bg: string }> = {
  planning:  { label: "Perencanaan", color: C.blue,   bg: C.blueBg   },
  active:    { label: "Aktif",       color: C.green,  bg: C.greenBg  },
  on_hold:   { label: "Ditunda",     color: C.yellow, bg: C.yellowBg },
  completed: { label: "Selesai",     color: C.green,  bg: C.greenBg  },
  cancelled: { label: "Dibatalkan",  color: C.red,    bg: C.redBg    },
};

function fmt(n: number) {
  return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(n);
}

function fmtDate(s: string | null) {
  if (!s) return "—";
  return new Date(s).toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric" });
}

export default function PortalHomePage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const user = getStoredUser();

  useEffect(() => {
    api.get("/api/v1/projects").then((res) => {
      setProjects(res.data?.projects ?? []);
    }).finally(() => setLoading(false));
  }, []);

  const activeCount = projects.filter((p) => p.status === "active").length;
  const completedCount = projects.filter((p) => p.status === "completed").length;
  const totalValue = projects.reduce((s, p) => s + (p.contract_value ?? 0), 0);

  return (
    <div style={{ maxWidth: 800, margin: "0 auto" }}>
      {/* Greeting */}
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: C.text, margin: 0 }}>
          Halo, {user?.name?.split(" ")[0]} 👋
        </h1>
        <p style={{ fontSize: 14, color: C.mid, margin: "4px 0 0" }}>
          Berikut status proyek Anda bersama Puraloka Persada
        </p>
      </div>

      {/* KPI cards */}
      {!loading && projects.length > 0 && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12, marginBottom: 24 }}>
          {[
            { label: "Proyek Aktif", value: activeCount, color: C.green },
            { label: "Selesai", value: completedCount, color: C.navy },
            { label: "Total Nilai", value: fmt(totalValue), color: C.navy, small: true },
          ].map((kpi) => (
            <div key={kpi.label} style={{
              background: C.surface, borderRadius: 12, padding: "16px",
              border: `1px solid ${C.border}`,
              boxShadow: "0 1px 3px rgba(0,0,0,0.05)",
            }}>
              <div style={{ fontSize: 11, color: C.mid, fontWeight: 500, marginBottom: 6 }}>{kpi.label}</div>
              <div style={{ fontSize: kpi.small ? 15 : 26, fontWeight: 700, color: kpi.color }}>{kpi.value}</div>
            </div>
          ))}
        </div>
      )}

      {/* Project list */}
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {loading && (
          <div style={{ textAlign: "center", padding: 60, color: C.mid }}>Memuat proyek...</div>
        )}

        {!loading && projects.length === 0 && (
          <div style={{
            background: C.surface, borderRadius: 12, padding: 48,
            border: `1px solid ${C.border}`, textAlign: "center",
          }}>
            <AlertCircle size={36} color={C.muted} style={{ marginBottom: 12 }} />
            <div style={{ fontSize: 15, fontWeight: 600, color: C.text }}>Belum ada proyek</div>
            <div style={{ fontSize: 13, color: C.mid, marginTop: 4 }}>
              Hubungi tim Puraloka untuk informasi lebih lanjut
            </div>
          </div>
        )}

        {projects.map((p) => {
          const meta = STATUS_META[p.status] ?? STATUS_META.planning;
          return (
            <Link key={p.id} href={`/portal/proyek/${p.id}`} style={{ textDecoration: "none" }}>
              <div style={{
                background: C.surface, borderRadius: 12, padding: 20,
                border: `1px solid ${C.border}`,
                boxShadow: "0 1px 3px rgba(0,0,0,0.05)",
                transition: "box-shadow 0.15s, transform 0.15s",
                cursor: "pointer",
              }}
                onMouseEnter={e => {
                  (e.currentTarget as HTMLElement).style.boxShadow = "0 4px 12px rgba(0,51,102,0.1)";
                  (e.currentTarget as HTMLElement).style.transform = "translateY(-1px)";
                }}
                onMouseLeave={e => {
                  (e.currentTarget as HTMLElement).style.boxShadow = "0 1px 3px rgba(0,0,0,0.05)";
                  (e.currentTarget as HTMLElement).style.transform = "translateY(0)";
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                      <h2 style={{ fontSize: 15, fontWeight: 700, color: C.text, margin: 0 }}>{p.name}</h2>
                      <span style={{
                        fontSize: 11, fontWeight: 600, padding: "2px 8px", borderRadius: 20,
                        color: meta.color, background: meta.bg,
                      }}>{meta.label}</span>
                    </div>

                    <div style={{ display: "flex", flexWrap: "wrap", gap: "4px 16px" }}>
                      {p.location && (
                        <div style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 12, color: C.mid }}>
                          <MapPin size={12} />
                          {p.location}
                        </div>
                      )}
                      {p.start_date && (
                        <div style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 12, color: C.mid }}>
                          <Calendar size={12} />
                          {fmtDate(p.start_date)} – {fmtDate(p.end_date)}
                        </div>
                      )}
                    </div>

                    {/* Progress bar */}
                    {p.status === "active" && (
                      <div style={{ marginTop: 12 }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 12, color: C.mid }}>
                            <TrendingUp size={12} />
                            Progress Fisik
                          </div>
                          <span style={{ fontSize: 12, fontWeight: 700, color: C.navy }}>{p.progress_pct ?? 0}%</span>
                        </div>
                        <div style={{ height: 6, background: "var(--border)", borderRadius: 3, overflow: "hidden" }}>
                          <div style={{
                            height: "100%", borderRadius: 3,
                            width: `${p.progress_pct ?? 0}%`,
                            background: C.navy, transition: "width 0.5s ease",
                          }} />
                        </div>
                      </div>
                    )}

                    <div style={{ marginTop: 10, fontSize: 13, fontWeight: 600, color: C.navy }}>
                      {fmt(p.contract_value ?? 0)}
                    </div>
                  </div>
                  <ChevronRight size={18} color={C.muted} style={{ flexShrink: 0, marginTop: 2 }} />
                </div>
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
