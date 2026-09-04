"use client";

// ============================================================================
// Laporan & BI — Portal PM (Task 43, Tahap 7).
//
// Dua tab: KPI Perusahaan (CPI/SPI berbobot BAC, umur piutang, backlog tender)
// dan Arus Kas (ringkasan periode tahun berjalan). Bacaan-saja, tanpa satu pun
// tombol tulis — modul ini murni pelaporan.
//
// ⚠️ CATATAN CAKUPAN (Task 38 Step 1): `bi-eksekutif`/`bi-proyek` TIDAK
// dibangun ulang di sini (halaman lain sudah ada), `bi-biaya` sudah tercakup
// Task 24 (Tahap 4). Tab "Arus Kas" di sini BEDA dari Dashboard Keuangan
// (Task 32, `pm-portal/keuangan/dashboard`): yang itu snapshot real-time,
// ini laporan PERIODE (tahun berjalan, `date_from`/`date_to` eksplisit).
// `bi-terjadwal` (`status: 'sebagian'`) di luar cakupan.
//
// ⚠️ Backlog tender (`RingkasanBidPM`) TIDAK menyembunyikan tombol keputusan
// apa pun — halaman ini hanya membaca ANGKA yang sudah dihitung server
// (`hitungBacklog()`), bukan tempat memutuskan menang/kalah tender. Tak ada
// gerbang permission tambahan yang relevan di sini di luar `reports:view`
// yang sudah menjaga endpoint (dan kedua baris role `pm` — global & tenant —
// terverifikasi PUNYA `reports:view` lewat query DB langsung).
// ============================================================================

import { useState } from "react";
import { TrendingUp, AlertTriangle, Landmark, Briefcase } from "lucide-react";
import { useData } from "@/lib/data-cache";
import { formatRupiah } from "@/lib/format";
import EmptyState from "@/components/portal/EmptyState";
import KepalaPortal from "@/components/portal/KepalaPortal";
import SkeletonCard from "@/components/portal/SkeletonCard";
import SegmentedTab from "@/components/portal/SegmentedTab";
import type { RespKpiPerusahaan, RespCashflowLaporan, GalatApi } from "../_bersama/tipe";
import { pesanGalat } from "../_bersama/tipe";

function fmtRupiahRingkas(v: number | null | undefined): string {
  // BUKAN `v ?? 0`: null/undefined harus tetap KOSONG ("—"), bukan
  // dirender sebagai "Rp 0" — nol adalah FAKTA (nilainya memang 0),
  // tak-ada-data adalah keadaan lain (lib/format.ts, kepala berkas).
  // `formatRupiah(n)` di bawah tetap menangani kasus `< 1jt` (Task 45).
  if (v === null || v === undefined) return "—";
  if (!Number.isFinite(v)) return "—";
  if (Math.abs(v) >= 1_000_000_000) return `${(v / 1_000_000_000).toFixed(1)} M`;
  if (Math.abs(v) >= 1_000_000) return `${(v / 1_000_000).toFixed(0)} jt`;
  return formatRupiah(v);
}

const WARNA_KEADAAN: Record<string, string> = {
  baik: "var(--success)",
  perhatian: "var(--on-warning-bg)",
  buruk: "var(--danger)",
  tak_ada_data: "var(--text-secondary)",
};

type Tab = "kpi" | "cashflow";

function tahunIni(): { dari: string; sampai: string } {
  const y = new Date().getFullYear();
  return { dari: `${y}-01-01`, sampai: new Date().toISOString().slice(0, 10) };
}

export default function PmLaporanPage() {
  const [tab, setTab] = useState<Tab>("kpi");
  const [periode] = useState(tahunIni());

  const { data: dataKpi, memuat: memuatKpi, galat: galatKpi } =
    useData<RespKpiPerusahaan>(tab === "kpi" ? "/api/v1/reports/kpi-perusahaan" : null);
  const { data: dataCf, memuat: memuatCf, galat: galatCf } =
    useData<RespCashflowLaporan>(
      tab === "cashflow" ? `/api/v1/reports/cashflow?date_from=${periode.dari}&date_to=${periode.sampai}` : null,
    );

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--gap-bagian)" }}>
      <KepalaPortal judul="Laporan &amp; BI" />

      <SegmentedTab
        opsi={[
          { value: "kpi", label: "KPI Perusahaan" },
          { value: "cashflow", label: "Arus Kas" },
        ]}
        aktif={tab}
        onUbah={(v) => setTab(v as Tab)}
      />

      {tab === "kpi" && (
        <div aria-live="polite">
          {memuatKpi && <SkeletonCard tinggi={160} />}
          {galatKpi && (
            <EmptyState icon={AlertTriangle} judul="Gagal memuat" deskripsi={pesanGalat(galatKpi as GalatApi, "Coba lagi.")} />
          )}
          {!memuatKpi && dataKpi && (
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                <div style={{ background: "var(--surface)", borderRadius: 14, padding: 12, border: "1px solid color-mix(in srgb, var(--border) 40%, transparent)", boxShadow: "var(--naik-1)", flex: "1 1 140px" }}>
                  <div style={{ fontSize: "var(--t-kecil)", color: "var(--text-secondary)" }}>CPI Perusahaan</div>
                  <div style={{ fontSize: 17, fontWeight: 700, color: WARNA_KEADAAN[dataKpi.evm.statusCpi.keadaan] }}>
                    {dataKpi.evm.cpi?.toFixed(2) ?? "—"}
                  </div>
                </div>
                <div style={{ background: "var(--surface)", borderRadius: 14, padding: 12, border: "1px solid color-mix(in srgb, var(--border) 40%, transparent)", boxShadow: "var(--naik-1)", flex: "1 1 140px" }}>
                  <div style={{ fontSize: "var(--t-kecil)", color: "var(--text-secondary)" }}>SPI Perusahaan</div>
                  <div style={{ fontSize: 17, fontWeight: 700, color: WARNA_KEADAAN[dataKpi.evm.statusSpi.keadaan] }}>
                    {dataKpi.evm.spi?.toFixed(2) ?? "—"}
                  </div>
                </div>
              </div>
              <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>{dataKpi.evm.statusCpi.arti}</div>
              <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>{dataKpi.evm.statusSpi.arti}</div>
              <div style={{ fontSize: "var(--t-kecil)", color: "var(--text-muted)" }}>
                {dataKpi.evm.proyekDihitung} dari {dataKpi.evm.proyekTotal} proyek ikut dihitung
                {" · "}dasar BAC: {dataKpi.evm.dasar_bac}
              </div>

              {dataKpi.evm.cpiTerendah && (
                <div style={{ background: "var(--danger-bg)", borderRadius: 12, padding: 12 }}>
                  <div style={{ fontSize: 12, color: "var(--on-danger-bg)" }}>
                    CPI terendah: {dataKpi.evm.cpiTerendah.name}
                  </div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: "var(--on-danger-bg)" }}>
                    {dataKpi.evm.cpiTerendah.cpi?.toFixed(2) ?? "—"}
                  </div>
                </div>
              )}

              <div style={{ background: "var(--surface)", borderRadius: 14, padding: 14, border: "1px solid color-mix(in srgb, var(--border) 40%, transparent)", boxShadow: "var(--naik-1)" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8 }}>
                  <Landmark size={16} color="var(--navy)" aria-hidden="true" />
                  <span style={{ fontSize: 13, fontWeight: 700, color: "var(--text-primary)" }}>Umur Piutang</span>
                </div>
                <div style={{ fontSize: 13, color: "var(--text-secondary)" }}>
                  Total {fmtRupiahRingkas(dataKpi.piutang.total)} ({dataKpi.piutang.count} invoice)
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 8 }}>
                  {(Object.keys(dataKpi.piutang.buckets) as Array<keyof typeof dataKpi.piutang.buckets>).map((k) => (
                    <div key={k} style={{ fontSize: "var(--t-kecil)", color: "var(--text-secondary)" }}>
                      <span style={{ fontWeight: 600, color: "var(--text-primary)" }}>{fmtRupiahRingkas(dataKpi.piutang.buckets[k])}</span>
                      {" "}
                      {{ current: "belum jatuh tempo", d1_30: "1–30 hr", d31_60: "31–60 hr", d61_90: "61–90 hr", d90_plus: ">90 hr" }[k]}
                    </div>
                  ))}
                </div>
              </div>

              <div style={{ background: "var(--surface)", borderRadius: 14, padding: 14, border: "1px solid color-mix(in srgb, var(--border) 40%, transparent)", boxShadow: "var(--naik-1)" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8 }}>
                  <Briefcase size={16} color="var(--navy)" aria-hidden="true" />
                  <span style={{ fontSize: 13, fontWeight: 700, color: "var(--text-primary)" }}>Backlog &amp; Tender</span>
                </div>
                <div style={{ fontSize: 13, color: "var(--text-secondary)" }}>
                  Backlog {fmtRupiahRingkas(dataKpi.backlog.backlogNilai)} ({dataKpi.backlog.backlogJumlah} proyek dimenangkan belum selesai)
                </div>
                <div style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: 4 }}>
                  Pipeline {fmtRupiahRingkas(dataKpi.backlog.pipelineNilai)} ({dataKpi.backlog.pipelineJumlah} tender berjalan)
                </div>
                <div style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: 4 }}>
                  Win rate: {dataKpi.backlog.winRatePct !== null ? `${dataKpi.backlog.winRatePct}%` : "belum ada tender diputuskan"}
                  {" "}({dataKpi.backlog.menang} menang, {dataKpi.backlog.kalah} kalah)
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {tab === "cashflow" && (
        <div aria-live="polite">
          {memuatCf && <SkeletonCard tinggi={160} />}
          {galatCf && (
            <EmptyState icon={AlertTriangle} judul="Gagal memuat" deskripsi={pesanGalat(galatCf as GalatApi, "Coba lagi.")} />
          )}
          {!memuatCf && dataCf && (
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <div style={{ fontSize: "var(--t-kecil)", color: "var(--text-muted)" }}>
                Periode {dataCf.period.dateFrom} s.d. {dataCf.period.dateTo}
              </div>
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                <div style={{ background: "var(--surface)", borderRadius: 14, padding: 12, border: "1px solid color-mix(in srgb, var(--border) 40%, transparent)", boxShadow: "var(--naik-1)", flex: "1 1 100px" }}>
                  <div style={{ fontSize: "var(--t-kecil)", color: "var(--text-secondary)" }}>Masuk</div>
                  <div style={{ fontSize: 15, fontWeight: 700, color: "var(--success)" }}>{fmtRupiahRingkas(dataCf.summary.totalIn)}</div>
                </div>
                <div style={{ background: "var(--surface)", borderRadius: 14, padding: 12, border: "1px solid color-mix(in srgb, var(--border) 40%, transparent)", boxShadow: "var(--naik-1)", flex: "1 1 100px" }}>
                  <div style={{ fontSize: "var(--t-kecil)", color: "var(--text-secondary)" }}>Keluar</div>
                  <div style={{ fontSize: 15, fontWeight: 700, color: "var(--danger)" }}>{fmtRupiahRingkas(dataCf.summary.totalOut)}</div>
                </div>
                <div style={{ background: "var(--surface)", borderRadius: 14, padding: 12, border: "1px solid color-mix(in srgb, var(--border) 40%, transparent)", boxShadow: "var(--naik-1)", flex: "1 1 100px" }}>
                  <div style={{ fontSize: "var(--t-kecil)", color: "var(--text-secondary)" }}>Net</div>
                  <div style={{ fontSize: 15, fontWeight: 700, color: dataCf.summary.netFlow >= 0 ? "var(--success)" : "var(--danger)" }}>
                    {fmtRupiahRingkas(dataCf.summary.netFlow)}
                  </div>
                </div>
              </div>

              {dataCf.byMonth.length === 0 && (
                <EmptyState icon={TrendingUp} judul="Belum ada data" deskripsi="Belum ada arus kas tercatat tahun ini." />
              )}
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {dataCf.byMonth.map((b) => (
                  <div
                    key={b.period}
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      padding: 10,
                      borderRadius: 10,
                      background: "var(--surface)",
                      border: "1px solid var(--border)",
                    }}
                  >
                    <span style={{ fontSize: 12, color: "var(--text-secondary)" }}>{b.label}</span>
                    <span style={{ fontSize: 13, fontWeight: 700, color: b.net >= 0 ? "var(--success)" : "var(--danger)" }}>
                      {fmtRupiahRingkas(b.net)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
