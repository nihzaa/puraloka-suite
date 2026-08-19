"use client";

// ============================================================================
// Rekapitulasi Keuangan — ringkasan earned vs dibayar vs kasbon beredar.
//
// Restyle F7d (2026-08-20): warna-ui → token CSS, kartu → KpiCard, komposisi
// → donat (recharts PieChart) menggantikan tiga progress bar terpisah.
//
// ── Kenapa TIDAK ADA tren periode di halaman ini
//
// `GET /api/v1/mandor/rekapitulasi` (diverifikasi ke `mandor.ts` baris 2481)
// memulangkan HANYA angka agregat SAAT INI (`total_earned`, `total_paid`,
// `outstanding`, `kasbon_beredar`, `sisa_bersih`) dan breakdown per-proyek —
// TIDAK ADA riwayat/deret waktu apa pun (tak ada tanggal per baris, tak ada
// snapshot bulan lalu). Endpoint ini dirancang sebagai potret SAAT INI, bukan
// seri waktu.
//
// Menghitung "naik/turun X% vs bulan lalu" dari SATU angka snapshot tunggal
// tanpa pembanding historis berarti mengarang pembandingnya — itu justru
// yang dilarang brief task ini ("kalau data historisnya tidak cukup untuk
// menghitung tren yang jujur, JANGAN tampilkan tren palsu"). Endpoint lain
// (`wage-reports`, `progress-payments`) punya tanggal dan dipakai untuk tren
// jujur di halaman `laporan-upah` dan `pembayaran` — tapi mencampur data dari
// endpoint LAIN ke sini akan mendefinisikan ulang "outstanding"/"kasbon
// beredar" versi halaman ini secara tidak konsisten dengan angka yang
// dikembalikan API. Lebih aman berhenti di komposisi (donat), yang memang
// snapshot, dan tak mengklaim tren apa pun.
// ============================================================================

import { useData } from "@/lib/data-cache";
import { TrendingUp, Wallet, CheckCircle, AlertCircle, MinusCircle, BarChart2 } from "lucide-react";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from "recharts";
import KpiCard from "@/components/portal/KpiCard";
import EmptyState from "@/components/portal/EmptyState";
import SkeletonCard from "@/components/portal/SkeletonCard";
import type { GalatApi } from "../_bersama/tipe";
import { pesanGalat } from "../_bersama/tipe";

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

export default function RekapitulasiPage() {
  // ── PINDAH KE LAPIS CACHE BERSAMA (F4-2), 2026-08-16 — halaman ini
  // hanya baca, tak ada tulis lapangan, jadi tak ada cache offline yang
  // perlu dipertahankan.
  const { data, memuat: loading, galat: galatMuat } = useData<Rekap>("/api/v1/mandor/rekapitulasi");

  // Komposisi keuangan untuk donat: Dibayar / Outstanding / Kasbon Beredar.
  // Ketiganya bagian dari `total_earned` (kasbon beredar mengurangi
  // outstanding secara konseptual, tapi ditampilkan sebagai irisan sendiri
  // di sini supaya proporsinya terlihat langsung — angka mentahnya tetap
  // sama seperti KPI card di atasnya).
  const dataKomposisi = data
    ? [
        { name: "Dibayar", value: data.total_paid, color: "var(--success)" },
        { name: "Outstanding", value: Math.max(0, data.outstanding), color: "var(--warning)" },
        { name: "Kasbon Beredar", value: Math.max(0, data.kasbon_beredar), color: "var(--danger)" },
      ].filter((d) => d.value > 0)
    : [];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div>
        <h1 style={{ fontSize: 20, fontWeight: 700, color: "var(--text-primary)", margin: 0 }}>Rekapitulasi Keuangan</h1>
        <p style={{ fontSize: 13, color: "var(--text-secondary)", margin: "4px 0 0" }}>
          Ringkasan earned vs dibayar vs kasbon beredar
        </p>
      </div>

      {loading && (
        <>
          <SkeletonCard tinggi={90} />
          <SkeletonCard tinggi={110} />
          <SkeletonCard tinggi={110} />
        </>
      )}

      {!loading && !data && (
        <EmptyState
          icon={BarChart2}
          judul={galatMuat ? "Gagal memuat data" : "Data tidak tersedia"}
          deskripsi={galatMuat ? pesanGalat(galatMuat as GalatApi, "Coba muat ulang halaman ini.") : "Belum ada data keuangan untuk ditampilkan."}
        />
      )}

      {!loading && data && (
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {/* Hero: sisa bersih */}
          <div
            style={{
              background: "var(--grad-merek)", borderRadius: "var(--portal-radius-card)",
              padding: "20px 24px", color: "var(--on-navy)",
            }}
          >
            <div style={{ fontSize: 12, marginBottom: 6, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em" }}>
              Sisa Bersih Setelah Kasbon
            </div>
            <div style={{ fontSize: 32, fontWeight: 800, lineHeight: 1.1, fontVariantNumeric: "tabular-nums" }}>
              {fmtRp(data.sisa_bersih)}
            </div>
            {data.sisa_bersih < 0 && (
              <div
                style={{
                  marginTop: 8, fontSize: 12, fontWeight: 600, background: "rgba(0,0,0,0.18)",
                  borderRadius: 8, padding: "4px 10px", display: "inline-block",
                }}
              >
                Kasbon melebihi outstanding — perlu penyelesaian
              </div>
            )}
            {data.sisa_bersih > 0 && (
              <div style={{ marginTop: 6, fontSize: 12 }}>
                Dana yang dapat dicairkan setelah semua kasbon dilunasi
              </div>
            )}
            {data.sisa_bersih === 0 && data.total_earned === 0 && (
              <div style={{ marginTop: 6, fontSize: 12 }}>
                Belum ada pekerjaan yang dihitung
              </div>
            )}
          </div>

          {/* KPI grid */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <KpiCard label="Total Earned" nilai={fmtRp(data.total_earned)} icon={TrendingUp} />
            <KpiCard label="Total Dibayar" nilai={fmtRp(data.total_paid)} icon={CheckCircle} />
            <KpiCard label="Outstanding" nilai={fmtRp(data.outstanding)} icon={AlertCircle} />
            <KpiCard label="Kasbon Beredar" nilai={fmtRp(data.kasbon_beredar)} icon={Wallet} />
          </div>

          {/* Donat komposisi + rincian teks (grafik bukan satu-satunya akses
              ke data — angka yang sama tersedia sebagai legenda + KPI di
              atas). */}
          {dataKomposisi.length > 0 && (
            <div
              style={{
                padding: 16, borderRadius: "var(--portal-radius-card)", background: "var(--surface)",
                border: "1px solid var(--border)",
              }}
            >
              <div style={{ fontSize: 13, fontWeight: 700, color: "var(--text-primary)", marginBottom: 12 }}>
                Komposisi Keuangan
              </div>
              <div style={{ width: "100%", height: 200 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={dataKomposisi}
                      dataKey="value"
                      nameKey="name"
                      innerRadius="55%"
                      outerRadius="80%"
                      paddingAngle={2}
                      isAnimationActive={false}
                    >
                      {dataKomposisi.map((entry) => (
                        <Cell key={entry.name} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(v) => fmtRp(Number(v))} contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid var(--border)" }} />
                    <Legend
                      verticalAlign="bottom"
                      height={36}
                      formatter={(value) => <span style={{ fontSize: 12, color: "var(--text-secondary)" }}>{value}</span>}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              {/* Rincian teks eksplisit — angka yang sama seperti irisan
                  donat, supaya tak ada informasi yang hanya bisa diakses
                  lewat grafik. */}
              <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 4 }}>
                {dataKomposisi.map((d) => (
                  <div key={d.name} style={{ display: "flex", justifyContent: "space-between", fontSize: 12 }}>
                    <span style={{ color: "var(--text-secondary)" }}>{d.name}</span>
                    <span style={{ fontWeight: 700, color: "var(--text-primary)", fontVariantNumeric: "tabular-nums" }}>
                      {fmtRp(d.value)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Per-project breakdown */}
          {data.projects.length > 1 && (
            <div
              style={{
                padding: 16, borderRadius: "var(--portal-radius-card)", background: "var(--surface)",
                border: "1px solid var(--border)",
              }}
            >
              <div style={{ fontSize: 13, fontWeight: 700, color: "var(--text-primary)", marginBottom: 12 }}>
                Per Proyek
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {data.projects.map((proj) => {
                  const outstanding = proj.earned - proj.paid;
                  return (
                    <div
                      key={proj.id}
                      style={{
                        padding: 12, borderRadius: 12, border: "1px solid var(--border)",
                        background: "var(--surface-subtle)",
                      }}
                    >
                      <div style={{ fontSize: 13, fontWeight: 700, color: "var(--text-primary)", marginBottom: 8 }}>
                        {proj.name}
                      </div>
                      <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
                        <div>
                          <div style={{ fontSize: 10, color: "var(--text-muted)", marginBottom: 2, fontWeight: 700, textTransform: "uppercase" }}>
                            Earned
                          </div>
                          <div style={{ fontSize: 13, fontWeight: 700, color: "var(--navy)", fontVariantNumeric: "tabular-nums" }}>
                            {fmtRp(proj.earned)}
                          </div>
                        </div>
                        <div>
                          <div style={{ fontSize: 10, color: "var(--text-muted)", marginBottom: 2, fontWeight: 700, textTransform: "uppercase" }}>
                            Dibayar
                          </div>
                          <div style={{ fontSize: 13, fontWeight: 700, color: "var(--success)", fontVariantNumeric: "tabular-nums" }}>
                            {fmtRp(proj.paid)}
                          </div>
                        </div>
                        {outstanding > 0 && (
                          <div>
                            <div style={{ fontSize: 10, color: "var(--text-muted)", marginBottom: 2, fontWeight: 700, textTransform: "uppercase" }}>
                              Outstanding
                            </div>
                            <div style={{ fontSize: 13, fontWeight: 700, color: "var(--warning)", fontVariantNumeric: "tabular-nums" }}>
                              {fmtRp(outstanding)}
                            </div>
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
            <EmptyState
              icon={MinusCircle}
              judul="Belum ada data keuangan"
              deskripsi="Data akan muncul setelah ada laporan upah atau pembayaran yang disetujui."
            />
          )}
        </div>
      )}
    </div>
  );
}
