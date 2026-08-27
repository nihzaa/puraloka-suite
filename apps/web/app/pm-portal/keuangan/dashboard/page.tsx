"use client";

// ============================================================================
// Dashboard Keuangan — PINTU MASUK modul Keuangan (Task 32, awal Tahap 6).
//
// KPI + grafik tagih-vs-bayar + komposisi kasbon + umur piutang + tabel
// per-proyek + invoice tertunggak. Satu request (`useData`), tanpa RAB
// (lihat komentar kepala `keuangan-ikhtisar.ts` — RAB diaudit tak sehat,
// keputusan founder 2026-08-09).
//
// ⚠️ SEMUA nominal di `RespKeuanganIkhtisar` datang sebagai STRING
// (`.toFixed(2)` di backend) — dikonversi lewat `Number(...)` di `fmtRupiah`/
// `fmtRupiahRingkas`, tak pernah dirender mentah. Diverifikasi langsung ke
// `keuangan-ikhtisar.ts:296-313` untuk Task 32, bukan disalin dari dugaan.
//
// Tabel "Per Proyek" memakai `<Tabel>` bersama (`@/components/dasar`),
// BUKAN `<table>` mentah — `<Tabel>` sudah dipakai lintas-shell di
// `pm-portal/mandor/page.tsx` dan `mandor-portal/scope/page.tsx`, jadi
// aman dipakai di sini juga. Ia menjaga caption, `scope="row"`,
// `tabular-nums`, dan `overflow-x` sendiri — lihat `uji-tabel-terbaca.mjs`
// dan `tabel-mentah-ratchet.mjs` (portal IKUT dihitung penjaga itu).
// ============================================================================

import { useMemo } from "react";
import { Wallet, TrendingUp, AlertTriangle, Clock } from "lucide-react";
import { useData } from "@/lib/data-cache";
import { Tabel } from "@/components/dasar";
import EmptyState from "@/components/portal/EmptyState";
import KepalaPortal from "@/components/portal/KepalaPortal";
import SkeletonCard from "@/components/portal/SkeletonCard";
import type { RespKeuanganIkhtisar, GalatApi } from "../../_bersama/tipe";
import { pesanGalat } from "../../_bersama/tipe";

type BarisProyekKeuangan = RespKeuanganIkhtisar["per_proyek"][number];

function fmtRupiah(v: string | number | null | undefined): string {
  if (v === null || v === undefined) return "—";
  const n = typeof v === "string" ? Number(v) : v;
  if (!Number.isFinite(n)) return "—";
  return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(n);
}
function fmtRupiahRingkas(v: string | number | null | undefined): string {
  // BUKAN `v ?? 0`: null/undefined harus tetap KOSONG ("—"), bukan
  // dirender sebagai "Rp 0" — nol adalah FAKTA (nilainya memang 0),
  // tak-ada-data adalah keadaan lain (lib/format.ts, kepala berkas).
  if (v === null || v === undefined) return "—";
  const n = typeof v === "string" ? Number(v) : v;
  if (!Number.isFinite(n)) return "—";
  if (Math.abs(n) >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(1)} M`;
  if (Math.abs(n) >= 1_000_000) return `${(n / 1_000_000).toFixed(0)} jt`;
  return fmtRupiah(n);
}

function KartuKpi({ label, nilai, aksen }: { label: string; nilai: string; aksen?: "warning" | "danger" }) {
  const warna = aksen === "danger" ? "var(--danger)" : aksen === "warning" ? "var(--on-warning-bg)" : "var(--text-primary)";
  return (
    <div style={{ background: "var(--surface)", borderRadius: "var(--portal-radius-card)", padding: "var(--pad-kartu-lega)", border: "1px solid var(--border)", flex: "1 1 140px", minWidth: 140 }}>
      <div style={{ fontSize: 11, color: "var(--text-secondary)", marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 17, fontWeight: 700, color: warna, fontVariantNumeric: "tabular-nums" }}>{nilai}</div>
    </div>
  );
}

export default function PmDashboardKeuanganPage() {
  const { data, memuat, galat, muatUlang } = useData<RespKeuanganIkhtisar>("/api/v1/keuangan/ikhtisar");

  const maksBulanan = useMemo(() => {
    if (!data?.bulanan?.length) return 1;
    return Math.max(1, ...data.bulanan.map((b) => Math.max(Number(b.tagih), Number(b.bayar))));
  }, [data]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--gap-bagian)" }}>
      <KepalaPortal judul="Dashboard Keuangan" />

      {memuat && <SkeletonCard tinggi={160} />}
      {galat && (
        <EmptyState icon={AlertTriangle} judul="Gagal memuat" deskripsi={pesanGalat(galat as GalatApi, "Coba muat ulang.")}
          aksi={{ label: "Muat ulang", onClick: () => void muatUlang() }} />
      )}

      {!memuat && data && (
        <>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <KartuKpi label="Nilai Kontrak" nilai={fmtRupiahRingkas(data.kpi.nilai_kontrak)} />
            <KartuKpi label="Tertagih" nilai={fmtRupiahRingkas(data.kpi.tertagih)} />
            <KartuKpi label="Terbayar" nilai={fmtRupiahRingkas(data.kpi.terbayar)} />
            <KartuKpi label="Piutang" nilai={fmtRupiahRingkas(data.kpi.piutang)} aksen={Number(data.kpi.piutang) > 0 ? "warning" : undefined} />
            <KartuKpi label="Kasbon Beredar" nilai={fmtRupiahRingkas(data.kpi.kasbon_beredar)} />
            <KartuKpi label="Invoice Lewat Tempo" nilai={String(data.kpi.invoice_lewat_tempo)} aksen={data.kpi.invoice_lewat_tempo > 0 ? "danger" : undefined} />
          </div>

          <div style={{ background: "var(--surface)", borderRadius: "var(--portal-radius-card)", padding: "var(--pad-kartu-lega)", border: "1px solid var(--border)" }}>
            <h2 style={{ fontSize: 14, fontWeight: 700, color: "var(--text-primary)", margin: "0 0 12px" }}>
              Tagih vs Bayar (12 bulan)
            </h2>
            {data.bulanan.length === 0 && <EmptyState icon={TrendingUp} judul="Belum ada data" deskripsi="Belum ada tagihan/pembayaran tercatat." />}
            {data.bulanan.length > 0 && (
              <>
                <div style={{ display: "flex", alignItems: "flex-end", gap: 6, height: 120, overflowX: "auto" }}>
                  {data.bulanan.map((b) => (
                    <div key={b.bulan} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 3, minWidth: 34 }}>
                      <div style={{ display: "flex", alignItems: "flex-end", gap: 2, height: 90 }}>
                        <div title={`Tagih ${fmtRupiah(b.tagih)}`} style={{ width: 8, height: `${Math.max(2, (Number(b.tagih) / maksBulanan) * 90)}px`, background: "var(--navy)", borderRadius: 2 }} />
                        <div title={`Bayar ${fmtRupiah(b.bayar)}`} style={{ width: 8, height: `${Math.max(2, (Number(b.bayar) / maksBulanan) * 90)}px`, background: "var(--success)", borderRadius: 2 }} />
                      </div>
                      <span style={{ fontSize: 9, color: "var(--text-secondary)" }}>{b.bulan}</span>
                    </div>
                  ))}
                </div>
                <div style={{ display: "flex", gap: 12, marginTop: 8, fontSize: 11, color: "var(--text-secondary)" }}>
                  <span style={{ display: "flex", alignItems: "center", gap: 4 }}><span style={{ width: 8, height: 8, borderRadius: 2, background: "var(--navy)", display: "inline-block" }} /> Tagih</span>
                  <span style={{ display: "flex", alignItems: "center", gap: 4 }}><span style={{ width: 8, height: 8, borderRadius: 2, background: "var(--success)", display: "inline-block" }} /> Bayar</span>
                </div>
              </>
            )}
          </div>

          <div style={{ background: "var(--surface)", borderRadius: "var(--portal-radius-card)", padding: "var(--pad-kartu-lega)", border: "1px solid var(--border)" }}>
            <h2 style={{ fontSize: 14, fontWeight: 700, color: "var(--text-primary)", margin: "0 0 12px" }}>
              Komposisi Kasbon
            </h2>
            {data.komposisi_kasbon.length === 0 && <EmptyState icon={Wallet} judul="Belum ada kasbon" deskripsi="Kasbon approved/settled belum ada." />}
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {data.komposisi_kasbon.map((k) => (
                <div key={k.kunci} style={{ display: "flex", justifyContent: "space-between", fontSize: 13 }}>
                  <span style={{ color: "var(--text-secondary)" }}>{k.nama} ({k.jumlah})</span>
                  <span style={{ fontWeight: 600, color: "var(--text-primary)", fontVariantNumeric: "tabular-nums" }}>{fmtRupiah(k.nilai)}</span>
                </div>
              ))}
            </div>
          </div>

          <div style={{ background: "var(--surface)", borderRadius: "var(--portal-radius-card)", padding: "var(--pad-kartu-lega)", border: "1px solid var(--border)" }}>
            <h2 style={{ fontSize: 14, fontWeight: 700, color: "var(--text-primary)", margin: "0 0 12px" }}>
              Umur Piutang
            </h2>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {data.umur_piutang.map((u) => (
                <div key={u.nama} style={{ display: "flex", justifyContent: "space-between", fontSize: 13 }}>
                  <span style={{ color: "var(--text-secondary)" }}>{u.nama} ({u.jumlah})</span>
                  <span style={{ fontWeight: 600, color: Number(u.nilai) > 0 && u.nama !== "Belum jatuh tempo" ? "var(--danger)" : "var(--text-primary)", fontVariantNumeric: "tabular-nums" }}>{fmtRupiah(u.nilai)}</span>
                </div>
              ))}
            </div>
          </div>

          {data.invoice_tertunggak.length > 0 && (
            <div style={{ background: "var(--surface)", borderRadius: "var(--portal-radius-card)", padding: "var(--pad-kartu-lega)", border: "1px solid var(--warning-border)" }}>
              <h2 style={{ fontSize: 14, fontWeight: 700, color: "var(--text-primary)", margin: "0 0 12px", display: "flex", alignItems: "center", gap: 6 }}>
                <Clock size={16} color="var(--on-warning-bg)" aria-hidden="true" /> Invoice Tertunggak
              </h2>
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {data.invoice_tertunggak.map((i) => (
                  <div key={i.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 0", borderBottom: "1px solid var(--border)" }}>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>{i.nomor}</div>
                      <div style={{ fontSize: 11, color: "var(--text-secondary)" }}>{i.proyek ?? "—"} · lewat {i.hari_lewat} hari</div>
                    </div>
                    <span style={{ fontSize: 13, fontWeight: 700, color: "var(--danger)", fontVariantNumeric: "tabular-nums" }}>{fmtRupiah(i.sisa)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div style={{ background: "var(--surface)", borderRadius: "var(--portal-radius-card)", padding: "var(--pad-kartu-lega)", border: "1px solid var(--border)" }}>
            <h2 style={{ fontSize: 14, fontWeight: 700, color: "var(--text-primary)", margin: "0 0 12px" }}>
              Per Proyek
            </h2>
            <Tabel<BarisProyekKeuangan>
              caption="Ringkasan keuangan per proyek: nilai kontrak, yang sudah tertagih, sisa piutang, dan persentase tertagih terhadap kontrak."
              data={data.per_proyek}
              kunciBaris={(p) => p.id}
              kosong={<EmptyState icon={Wallet} judul="Belum ada proyek" deskripsi="Belum ada proyek aktif dengan data keuangan." />}
              kolom={[
                { kunci: "proyek", judul: "Proyek", kepalaBaris: true, render: (p) => p.nama },
                { kunci: "kontrak", judul: "Kontrak", rata: "kanan", render: (p) => fmtRupiahRingkas(p.kontrak) },
                { kunci: "tertagih", judul: "Tertagih", rata: "kanan", render: (p) => fmtRupiahRingkas(p.tertagih) },
                {
                  kunci: "piutang", judul: "Piutang", rata: "kanan",
                  render: (p) => (
                    <span style={{ color: Number(p.piutang) > 0 ? "var(--on-warning-bg)" : "var(--text-primary)" }}>
                      {fmtRupiahRingkas(p.piutang)}
                    </span>
                  ),
                },
                { kunci: "pct", judul: "%", rata: "kanan", render: (p) => `${p.pct_tertagih}%` },
              ]}
            />
          </div>
        </>
      )}
    </div>
  );
}
