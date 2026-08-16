"use client";

import { useState } from "react";
import Link from "next/link";
import { useData } from "@/lib/data-cache";
import { MapPin, Calendar, ChevronRight, TrendingUp, AlertCircle } from "lucide-react";

import { C } from "@/lib/warna-ui";

function fmt(n: number) {
  return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(n);
}
function fmtDate(s: string | null) {
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

export default function PMProyekPage() {
  const [filter, setFilter] = useState("all");

  // ── PINDAH KE LAPIS CACHE BERSAMA (F4-2), 2026-08-16 — tak ada
  // mekanisme offline di portal PM.
  const { data, memuat: loading, galat: galatMuat } = useData<{ projects: any[] }>("/api/v1/projects");
  const projects = data?.projects ?? [];

  const filtered = filter === "all" ? projects : projects.filter((p) => p.status === filter);

  return (
    <div style={{ maxWidth: 900, margin: "0 auto" }}>
      <h1 style={{ fontSize: 20, fontWeight: 700, color: C.text, margin: "0 0 16px" }}>Proyek Saya</h1>

      {/* Filter */}
      <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
        {["all", "active", "planning", "on_hold", "completed"].map((s) => (
          <button
            key={s}
            onClick={() => setFilter(s)}
            style={{ padding: "4px 12px", borderRadius: 20, fontSize: 12, fontWeight: 500, cursor: "pointer", border: `1px solid ${filter === s ? C.navy : C.border}`, background: filter === s ? C.navyLight : "var(--surface)", color: filter === s ? C.navy : C.mid }}
          >
            {s === "all" ? "Semua" : STATUS_META[s]?.label ?? s}
          </button>
        ))}
      </div>

      {loading && <div style={{ textAlign: "center", padding: 60, color: C.mid }}>Memuat proyek...</div>}

      {!loading && galatMuat && (
        <div role="alert" style={{ background: C.redBg, border: `1px solid ${C.red}`, borderRadius: 10, padding: "12px 16px", marginBottom: 16, fontSize: 13, color: C.red }}>
          Gagal memuat proyek. Coba muat ulang halaman.
        </div>
      )}

      {!loading && !galatMuat && filtered.length === 0 && (
        <div style={{ background: C.surface, borderRadius: 10, padding: 48, border: `1px solid ${C.border}`, textAlign: "center" }}>
          <AlertCircle size={32} color={C.muted} style={{ marginBottom: 8 }} />
          <div style={{ fontSize: 13, color: C.mid }}>Belum ada proyek</div>
        </div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {filtered.map((p) => {
          const meta = STATUS_META[p.status] ?? STATUS_META.planning;
          const isLate = p.status === "active" && p.end_date && new Date(p.end_date) < new Date();
          return (
            <Link key={p.id} href={`/pm-portal/proyek/${p.id}`} style={{ textDecoration: "none" }}>
              <div style={{ background: C.surface, borderRadius: 10, padding: "16px 20px", border: `1px solid ${isLate ? C.red + "40" : C.border}`, boxShadow: "var(--naik-1)", cursor: "pointer" }}>
                <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6, flexWrap: "wrap" }}>
                      <h2 style={{ fontSize: 15, fontWeight: 700, color: C.text, margin: 0 }}>{p.name}</h2>
                      <span style={{ fontSize: 11, fontWeight: 600, padding: "2px 8px", borderRadius: 20, color: meta.color, background: meta.bg }}>{meta.label}</span>
                      {isLate && <span style={{ fontSize: 11, fontWeight: 600, padding: "2px 8px", borderRadius: 20, color: C.red, background: C.redBg }}>Terlambat</span>}
                    </div>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: "4px 16px", marginBottom: 8 }}>
                      {p.client?.name && <div style={{ fontSize: 12, color: C.mid }}>{p.client.name}</div>}
                      {p.location && (
                        <div style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 12, color: C.mid }}>
                          <MapPin size={12} />{p.location}
                        </div>
                      )}
                      {p.start_date && (
                        <div style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 12, color: C.mid }}>
                          <Calendar size={12} />{fmtDate(p.start_date)} – {fmtDate(p.end_date)}
                        </div>
                      )}
                    </div>
                    {p.status === "active" && (
                      <>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 12, color: C.mid }}>
                            <TrendingUp size={12} />Progress Fisik
                          </div>
                          <span style={{ fontSize: 12, fontWeight: 700, color: C.navy }}>{p.progress_pct ?? 0}%</span>
                        </div>
                        <div style={{ height: 5, background: "var(--border)", borderRadius: 0, overflow: "hidden" }}>
                          <div style={{ height: "100%", borderRadius: 0, width: `${p.progress_pct ?? 0}%`, background: isLate ? C.red : C.navy, transition: "width 0.5s" }} />
                        </div>
                      </>
                    )}
                    <div style={{ marginTop: 8, fontSize: 13, fontWeight: 600, color: C.navy }}>{fmt(p.contract_value ?? 0)}</div>
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
