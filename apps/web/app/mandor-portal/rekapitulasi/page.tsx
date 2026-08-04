"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { TrendingUp, Wallet, CheckCircle, AlertCircle, MinusCircle, BarChart2 } from "lucide-react";

import { C } from "@/lib/warna-ui";

const card: React.CSSProperties = {
  background: C.surface, border: `1px solid ${C.border}`,
  borderRadius: 12, boxShadow: "0 1px 3px rgba(0,0,0,0.05)",
};

function fmtRp(n: number) {
  return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(n);
}

interface Rekap {
  total_earned: number;
  total_paid: number;
  outstanding: number;
  kasbon_beredar: number;
  sisa_bersih: number;
  projects: Array<{ id: string; name: string; earned: number; paid: number }>;
}

interface SummaryCard {
  label: string;
  value: number;
  icon: React.ReactNode;
  color: string;
  bg: string;
  sub?: string;
}

export default function RekapitulasiPage() {
  const [data, setData] = useState<Rekap | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true);
    try {
      const res = await api.get("/api/v1/mandor/rekapitulasi");
      setData(res.data);
    } catch {
      setData(null);
    } finally {
      setLoading(false);
    }
  }

  const summaryCards: SummaryCard[] = data
    ? [
        {
          label: "Total Earned",
          value: data.total_earned,
          icon: <TrendingUp size={18} />,
          color: C.navy, bg: C.navyLight,
          sub: "Nilai pekerjaan yang sudah selesai/disetujui",
        },
        {
          label: "Total Dibayar",
          value: data.total_paid,
          icon: <CheckCircle size={18} />,
          color: C.green, bg: C.greenBg,
          sub: "Upah & settlement yang sudah diterima",
        },
        {
          label: "Outstanding",
          value: data.outstanding,
          icon: <AlertCircle size={18} />,
          color: data.outstanding > 0 ? C.yellow : C.mid,
          bg: data.outstanding > 0 ? C.yellowBg : C.bg,
          sub: "Earned belum dibayar",
        },
        {
          label: "Kasbon Beredar",
          value: data.kasbon_beredar,
          icon: <Wallet size={18} />,
          color: data.kasbon_beredar > 0 ? C.orange : C.mid,
          bg: data.kasbon_beredar > 0 ? C.orangeBg : C.bg,
          sub: "Kasbon yang belum dilunasi",
        },
        {
          label: "Sisa Bersih",
          value: data.sisa_bersih,
          icon: <MinusCircle size={18} />,
          color: data.sisa_bersih >= 0 ? C.green : C.red,
          bg: data.sisa_bersih >= 0 ? C.greenBg : C.redBg,
          sub: "Outstanding setelah dikurangi kasbon beredar",
        },
      ]
    : [];

  return (
    <div style={{ maxWidth: 800, margin: "0 auto" }}>
      <div style={{ marginBottom: 20 }}>
        <h1 style={{ fontSize: 20, fontWeight: 700, color: C.text, margin: 0 }}>Rekapitulasi Keuangan</h1>
        <p style={{ fontSize: 13, color: C.mid, margin: "4px 0 0" }}>
          Ringkasan earned vs dibayar vs kasbon beredar
        </p>
      </div>

      {loading && (
        <div style={{ textAlign: "center", padding: 60, color: C.mid }}>Memuat data...</div>
      )}

      {!loading && !data && (
        <div style={{ ...card, padding: 60, textAlign: "center" }}>
          <BarChart2 size={36} color={C.muted} style={{ marginBottom: 12 }} />
          <div style={{ fontSize: 15, fontWeight: 600, color: C.text }}>Data tidak tersedia</div>
          <div style={{ fontSize: 13, color: C.mid, marginTop: 4 }}>
            Belum ada data keuangan untuk ditampilkan
          </div>
        </div>
      )}

      {!loading && data && (
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          {/* Hero gradient card */}
          <div style={{
            background: `linear-gradient(135deg, ${C.navy} 0%, var(--aksen-terang) 100%)`,
            borderRadius: 16, padding: "22px 24px", color: "var(--surface)",
          }}>
            <div style={{ fontSize: 12, opacity: 0.8, marginBottom: 6, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em" }}>
              Sisa Bersih Setelah Kasbon
            </div>
            <div style={{ fontSize: 32, fontWeight: 800, lineHeight: 1.1 }}>
              {fmtRp(data.sisa_bersih)}
            </div>
            {data.sisa_bersih < 0 && (
              <div style={{ marginTop: 6, fontSize: 12, opacity: 0.9, background: "rgba(255,100,100,0.3)", borderRadius: 6, padding: "4px 10px", display: "inline-block" }}>
                Kasbon melebihi outstanding — perlu penyelesaian
              </div>
            )}
            {data.sisa_bersih >= 0 && data.sisa_bersih > 0 && (
              <div style={{ marginTop: 6, fontSize: 12, opacity: 0.8 }}>
                Dana yang dapat dicairkan setelah semua kasbon dilunasi
              </div>
            )}
            {data.sisa_bersih === 0 && data.total_earned === 0 && (
              <div style={{ marginTop: 6, fontSize: 12, opacity: 0.7 }}>
                Belum ada pekerjaan yang dihitung
              </div>
            )}
          </div>

          {/* Summary cards — 2-col grid */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 12 }}>
            {summaryCards.map((sc) => (
              <div key={sc.label} style={{ ...card, padding: "16px 18px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
                  <div style={{
                    width: 36, height: 36, borderRadius: 10,
                    background: sc.bg, color: sc.color,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    flexShrink: 0,
                  }}>
                    {sc.icon}
                  </div>
                  <div style={{ fontSize: 12, fontWeight: 600, color: C.mid, textTransform: "uppercase", letterSpacing: "0.05em" }}>
                    {sc.label}
                  </div>
                </div>
                <div style={{ fontSize: 22, fontWeight: 800, color: sc.color }}>
                  {fmtRp(sc.value)}
                </div>
                {sc.sub && (
                  <div style={{ fontSize: 11, color: C.muted, marginTop: 4 }}>{sc.sub}</div>
                )}
              </div>
            ))}
          </div>

          {/* Visual breakdown bar */}
          {data.total_earned > 0 && (
            <div style={{ ...card, padding: "18px 20px" }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: C.text, marginBottom: 14 }}>
                Komposisi Keuangan
              </div>
              <div style={{ marginBottom: 12 }}>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: C.mid, marginBottom: 5 }}>
                  <span>Dibayar</span>
                  <span style={{ fontWeight: 600 }}>{((data.total_paid / data.total_earned) * 100).toFixed(1)}%</span>
                </div>
                <div style={{ height: 10, background: C.border, borderRadius: 5, overflow: "hidden" }}>
                  <div style={{
                    height: "100%", borderRadius: 5,
                    width: `${Math.min(100, (data.total_paid / data.total_earned) * 100)}%`,
                    background: C.green, transition: "width 0.6s ease",
                  }} />
                </div>
              </div>

              {data.outstanding > 0 && (
                <div style={{ marginBottom: 12 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: C.mid, marginBottom: 5 }}>
                    <span>Outstanding</span>
                    <span style={{ fontWeight: 600 }}>{((data.outstanding / data.total_earned) * 100).toFixed(1)}%</span>
                  </div>
                  <div style={{ height: 10, background: C.border, borderRadius: 5, overflow: "hidden" }}>
                    <div style={{
                      height: "100%", borderRadius: 5,
                      width: `${Math.min(100, (data.outstanding / data.total_earned) * 100)}%`,
                      background: C.yellow, transition: "width 0.6s ease",
                    }} />
                  </div>
                </div>
              )}

              {data.kasbon_beredar > 0 && (
                <div>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: C.mid, marginBottom: 5 }}>
                    <span>Kasbon beredar vs outstanding</span>
                    <span style={{ fontWeight: 600 }}>
                      {data.outstanding > 0 ? ((data.kasbon_beredar / data.outstanding) * 100).toFixed(1) : "100"}%
                    </span>
                  </div>
                  <div style={{ height: 10, background: C.border, borderRadius: 5, overflow: "hidden" }}>
                    <div style={{
                      height: "100%", borderRadius: 5,
                      width: `${Math.min(100, data.outstanding > 0 ? (data.kasbon_beredar / data.outstanding) * 100 : 100)}%`,
                      background: C.orange, transition: "width 0.6s ease",
                    }} />
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Per-project breakdown */}
          {data.projects.length > 1 && (
            <div style={{ ...card, padding: "18px 20px" }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: C.text, marginBottom: 14 }}>
                Per Proyek
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                {data.projects.map((proj) => {
                  const outstanding = proj.earned - proj.paid;
                  return (
                    <div key={proj.id} style={{
                      padding: "14px 16px", borderRadius: 10,
                      border: `1px solid ${C.border}`, background: C.bg,
                    }}>
                      <div style={{ fontSize: 14, fontWeight: 600, color: C.text, marginBottom: 10 }}>
                        {proj.name}
                      </div>
                      <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
                        <div>
                          <div style={{ fontSize: 10, color: C.muted, marginBottom: 2, fontWeight: 600, textTransform: "uppercase" }}>Earned</div>
                          <div style={{ fontSize: 14, fontWeight: 700, color: C.navy }}>{fmtRp(proj.earned)}</div>
                        </div>
                        <div>
                          <div style={{ fontSize: 10, color: C.muted, marginBottom: 2, fontWeight: 600, textTransform: "uppercase" }}>Dibayar</div>
                          <div style={{ fontSize: 14, fontWeight: 700, color: C.green }}>{fmtRp(proj.paid)}</div>
                        </div>
                        {outstanding > 0 && (
                          <div>
                            <div style={{ fontSize: 10, color: C.muted, marginBottom: 2, fontWeight: 600, textTransform: "uppercase" }}>Outstanding</div>
                            <div style={{ fontSize: 14, fontWeight: 700, color: C.yellow }}>{fmtRp(outstanding)}</div>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Empty state: no projects */}
          {data.total_earned === 0 && data.projects.length === 0 && (
            <div style={{ ...card, padding: 48, textAlign: "center" }}>
              <BarChart2 size={32} color={C.muted} style={{ marginBottom: 10 }} />
              <div style={{ fontSize: 15, fontWeight: 600, color: C.text }}>Belum ada data keuangan</div>
              <div style={{ fontSize: 13, color: C.mid, marginTop: 4 }}>
                Data akan muncul setelah ada laporan upah atau pembayaran yang disetujui
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
