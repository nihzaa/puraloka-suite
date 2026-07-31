"use client";

import { useCallback, useEffect, useState } from "react";
import {
  ComposedChart, Line, Area, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ReferenceLine, ResponsiveContainer,
} from "recharts";
import { api } from "@/lib/api";
import { TrendingUp, RefreshCw, AlertTriangle, Info } from "lucide-react";

// ─── Design tokens ──────────────────────────────────────────────────────────────

const C = {
  navy: "var(--navy)", navyLight: "var(--navy-light)",
  blue: "var(--navy-mid)", blueLight: "#DBEAFE",
  text: "var(--text-primary)", mid: "var(--text-secondary)", muted: "var(--text-muted)",
  border: "var(--border)", bg: "var(--bg)",
  green: "var(--success)", greenLight: "#DCFCE7",
  red: "var(--danger)", redLight: "#FEE2E2",
  yellow: "var(--warning)", yellowLight: "#FEF3C7",
  orange: "#C2410C", orangeLight: "#FFEDD5",
};

// ─── Types ───────────────────────────────────────────────────────────────────────

interface ChartPoint {
  week: string;
  weekNum: number;
  date: string;
  rencana: number;
  serapan: number | null;   // serapan dana manual PM
  aktual: number | null;    // aktual kas (kasbon + expense + upah)
  progress: number | null;
}

interface Milestone {
  title: string;
  date: string | null;
  status: string;
  weekIdx: number;
  week: number;
}

interface EvmValues {
  bac: number;
  /** Basis BAC yang dipakai — RAP terkunci (biaya) lebih benar daripada RAB (nilai jual). */
  bacSource?: "rap_locked" | "rab" | "contract_value";
  paguRAP?: number;
  ac: number;
  ev: number;
  pv: number;
  sv: number;
  cv: number;
  cpi: number | null;
  spi: number | null;
  eac: number | null;
  etc: number | null;
  vac: number | null;
  tcpi: number | null;
  evPct: number;
  pvPct: number;
  acPct: number;
}

interface Meta {
  startDate: string;
  endDate: string;
  contractValue: number;
  totalWeeks: number;
  hasRAB: boolean;
  hasSchedule: boolean;
  /** Sumber kurva rencana — menentukan seberapa jauh SPI boleh dipercaya. */
  rencanaSource?: 'rab_schedule' | 'gantt' | 'normal_cdf';
  /** % NILAI pekerjaan yang punya tanggal rencana (bukan % jumlah baris). */
  cakupanJadwalPct?: number;
  itemBerjadwal?: number;
  itemTotal?: number;
  totalRABValue: number;
  latestActualPct: number;
  latestSerapanPct: number;
  latestRencanaPct: number;
  deviasi: number;
  evm: EvmValues;
}

interface KurvaSData {
  meta: Meta;
  chartData: ChartPoint[];
  milestones: Milestone[];
}

// ─── Helpers ─────────────────────────────────────────────────────────────────────

const fmt = (n: number) =>
  new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(n);

const fmtPct = (n: number | null, digits = 1) =>
  n === null ? "—" : `${n >= 0 ? "" : ""}${n.toFixed(digits)}%`;

const fmtCompact = (n: number) => {
  if (Math.abs(n) >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(1)} M`;
  if (Math.abs(n) >= 1_000_000) return `${(n / 1_000_000).toFixed(0)} Jt`;
  if (Math.abs(n) >= 1_000) return `${(n / 1_000).toFixed(0)} Rb`;
  return String(n);
};

function fmtDateShort(dateStr: string) {
  return new Date(dateStr).toLocaleDateString("id-ID", { day: "numeric", month: "short" });
}

function evmColor(index: number | null, goodAbove = true): string {
  if (index === null) return C.muted;
  if (goodAbove) return index >= 1 ? C.green : index >= 0.8 ? C.yellow : C.red;
  return index <= 1 ? C.green : index <= 1.1 ? C.yellow : C.red;
}

function evmBg(index: number | null, goodAbove = true): string {
  if (index === null) return "var(--surface-subtle)";
  if (goodAbove) return index >= 1 ? C.greenLight : index >= 0.8 ? C.yellowLight : C.redLight;
  return index <= 1 ? C.greenLight : index <= 1.1 ? C.yellowLight : C.redLight;
}

function evmLabel(index: number | null, goodAbove = true): string {
  if (index === null) return "Belum cukup data";
  if (goodAbove) return index >= 1 ? "On track" : index >= 0.8 ? "Perlu perhatian" : "At risk";
  return index <= 1 ? "On track" : index <= 1.1 ? "Perlu perhatian" : "At risk";
}

// ─── Custom Tooltip ──────────────────────────────────────────────────────────────

function CustomTooltip({ active, payload, label }: {
  active?: boolean;
  payload?: Array<{ name: string; value: number | null; color: string }>;
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div style={{
      background: "var(--surface)", border: `1px solid ${C.border}`, borderRadius: 10,
      padding: "10px 14px", fontSize: 12, boxShadow: "0 4px 16px rgba(0,0,0,0.10)",
      minWidth: 180,
    }}>
      <p style={{ fontWeight: 700, color: C.text, marginBottom: 6 }}>{label}</p>
      {payload.map((p, i) =>
        p.value !== null && p.value !== undefined ? (
          <div key={i} style={{ display: "flex", justifyContent: "space-between", gap: 16, marginBottom: 3 }}>
            <span style={{ color: C.mid }}>{p.name}</span>
            <span style={{ fontWeight: 600, color: p.color }}>{fmtPct(p.value)}</span>
          </div>
        ) : null
      )}
    </div>
  );
}

// ─── EVM Card ────────────────────────────────────────────────────────────────────

function EvmCard({
  label, value, sub, colorIndex, goodAbove = true, isRupiah = false,
}: {
  label: string;
  value: number | null;
  sub?: string;
  colorIndex?: number | null;
  goodAbove?: boolean;
  isRupiah?: boolean;
}) {
  const hasIndex = colorIndex !== undefined;
  const col = hasIndex ? evmColor(colorIndex ?? null, goodAbove) : C.text;
  const bg = hasIndex ? evmBg(colorIndex ?? null, goodAbove) : "var(--surface)";
  const status = hasIndex ? evmLabel(colorIndex ?? null, goodAbove) : undefined;

  const displayValue = value === null
    ? "—"
    : isRupiah
    ? `Rp ${fmtCompact(value)}`
    : value.toFixed(2);

  return (
    <div style={{
      background: bg, border: `1px solid ${C.border}`, borderRadius: 10,
      padding: "12px 14px", flex: 1, minWidth: 100,
    }}>
      <p style={{ fontSize: 10, color: C.muted, margin: "0 0 4px", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em" }}>{label}</p>
      <p style={{ fontSize: 19, fontWeight: 800, color: col, margin: "0 0 2px", fontFamily: "var(--font-display)" }}>{displayValue}</p>
      {status && (
        <p style={{ fontSize: 10, color: col, margin: 0, fontWeight: 600 }}>{status}</p>
      )}
      {sub && !status && (
        <p style={{ fontSize: 10, color: C.mid, margin: 0 }}>{sub}</p>
      )}
    </div>
  );
}

// ─── Summary KPI strip ───────────────────────────────────────────────────────────

function KpiCard({ label, value, sub, accent }: { label: string; value: string; sub?: string; accent?: string }) {
  return (
    <div style={{
      background: "var(--surface)", border: `1px solid ${C.border}`, borderRadius: 12,
      padding: "14px 18px", flex: 1,
    }}>
      <p style={{ fontSize: 11, color: C.muted, margin: "0 0 4px", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em" }}>{label}</p>
      <p style={{ fontSize: 22, fontWeight: 800, color: accent ?? C.text, margin: "0 0 2px", fontFamily: "var(--font-display)" }}>{value}</p>
      {sub && <p style={{ fontSize: 11, color: C.mid, margin: 0 }}>{sub}</p>}
    </div>
  );
}

// ─── Main Component ──────────────────────────────────────────────────────────────

interface Props {
  projectId: string;
  userRole?: string;
}

export function KurvaSSection({ projectId, userRole }: Props) {
  const isClient = userRole === "client";
  const [data, setData] = useState<KurvaSData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showEvmDetail, setShowEvmDetail] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.get<KurvaSData>(`/api/v1/projects/${projectId}/kurva-s`);
      setData(res.data);
    } catch {
      setError("Gagal memuat data Kurva S");
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => { load(); }, [load]);

  if (loading) {
    return <div style={{ padding: 24, textAlign: "center", color: C.muted, fontSize: 13 }}>Memuat Kurva S...</div>;
  }

  if (error || !data) {
    return <div style={{ padding: 24, textAlign: "center", color: C.red, fontSize: 13 }}>{error ?? "Data tidak tersedia"}</div>;
  }

  const { meta, chartData, milestones } = data;
  const evm = meta.evm;
  const deviasi = meta.deviasi;
  const deviasiColor = deviasi >= 0 ? C.green : C.red;

  // Milestone yang dalam range chart
  const milestoneMarkers = milestones.filter(m => m.week >= 1 && m.week <= meta.totalWeeks);
  const tickInterval = meta.totalWeeks <= 20 ? 0 : meta.totalWeeks <= 40 ? 3 : 7;

  const hasEVM = evm && (evm.bac > 0 || evm.ac > 0);

  return (
    <div>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{
            width: 36, height: 36, borderRadius: 10,
            background: "linear-gradient(135deg, #003366, #0066CC)",
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>
            <TrendingUp size={18} color="var(--surface)" />
          </div>
          <div>
            <h3 style={{ fontSize: 15, fontWeight: 700, color: C.text, margin: 0 }}>Kurva S — Realisasi Anggaran</h3>
            <p style={{ fontSize: 11, color: C.muted, margin: 0 }}>
              {fmtDateShort(meta.startDate)} – {fmtDateShort(meta.endDate)} · {meta.totalWeeks} minggu
            </p>
          </div>
        </div>
        <button
          onClick={load}
          style={{ background: "transparent", border: `1px solid ${C.border}`, borderRadius: 8, padding: "6px 10px", cursor: "pointer", color: C.mid, display: "flex", alignItems: "center", gap: 4, fontSize: 12 }}
        >
          <RefreshCw size={13} /> Refresh
        </button>
      </div>

      {/* Warning: RAB / jadwal belum diinput */}
      {!meta.hasRAB && (
        <div style={{
          display: "flex", alignItems: "center", gap: 8,
          padding: "10px 14px", borderRadius: 10, marginBottom: 16,
          background: C.yellowLight, border: `1px solid #FDE68A`,
          fontSize: 12, color: "#92400E",
        }}>
          <AlertTriangle size={14} color={C.yellow} />
          <span>RAB belum diupload. Kurva rencana menggunakan distribusi normal. Upload RAB untuk akurasi lebih baik.</span>
        </div>
      )}
      {/* Sumber kurva rencana — WAJIB terlihat.
          SPI = EV / PV, jadi seluruh angka SPI hanya sekuat asal-usul PV-nya.
          Sebelum ini banner hanya membedakan "ada jadwal manual" vs "tidak",
          dan kalimat "pakai distribusi normal" TETAP tampil walau PV
          sebenarnya sudah diturunkan dari tanggal Gantt — pesan yang salah
          justru membuat pemakai meremehkan angka yang benar. */}
      {meta.hasRAB && !meta.hasSchedule && !isClient && meta.rencanaSource === 'gantt' && (
        <div style={{
          display: "flex", alignItems: "center", gap: 8,
          padding: "10px 14px", borderRadius: 10, marginBottom: 16,
          background: "#F0FDF4", border: `1px solid #BBF7D0`,
          fontSize: 12, color: "#15803d",
        }}>
          <AlertTriangle size={14} color="#15803d" />
          <span>
            Kurva rencana diturunkan dari <strong>tanggal Gantt</strong>
            {typeof meta.cakupanJadwalPct === 'number' && (
              <> — mencakup <strong>{meta.cakupanJadwalPct}%</strong> nilai pekerjaan
                {meta.itemBerjadwal != null && meta.itemTotal != null &&
                  ` (${meta.itemBerjadwal} dari ${meta.itemTotal} kategori)`}</>
            )}
            . Isi jadwal per minggu di halaman proyek untuk rencana yang lebih rinci.
          </span>
        </div>
      )}
      {meta.hasRAB && !meta.hasSchedule && !isClient && meta.rencanaSource !== 'gantt' && (
        <div style={{
          display: "flex", alignItems: "center", gap: 8,
          padding: "10px 14px", borderRadius: 10, marginBottom: 16,
          background: "#FFFBEB", border: `1px solid #FDE68A`,
          fontSize: 12, color: "#B45309",
        }}>
          <AlertTriangle size={14} color="#D97706" />
          <span>
            <strong>SPI belum bisa dipercaya.</strong> Belum ada jadwal rencana
            maupun tanggal Gantt, jadi kurva rencana memakai distribusi normal —
            bentuk lonceng generik yang tidak mewakili rencana proyek ini.
            Isi tanggal rencana di Gantt, atau jadwal per minggu di halaman proyek.
          </span>
        </div>
      )}

      {/* KPI Row */}
      <div style={{ display: "flex", gap: 12, marginBottom: 20, flexWrap: "wrap" }}>
        {!isClient && (
          <KpiCard
            label="Serapan Dana"
            value={fmtPct(meta.latestSerapanPct ?? 0)}
            sub="input manual PM"
          />
        )}
        <KpiCard
          label="Target Rencana"
          value={fmtPct(meta.latestRencanaPct)}
          sub="sesuai jadwal"
        />
        <KpiCard
          label="Progress Fisik"
          value={fmtPct(evm?.evPct ?? 0)}
          sub={evm?.ev ? fmt(evm.ev) : "—"}
        />
        <KpiCard
          label="Deviasi Serapan"
          value={deviasi === 0 ? "±0%" : (deviasi > 0 ? "+" : "") + fmtPct(deviasi)}
          sub={deviasi >= 0 ? "di atas rencana" : "di bawah rencana"}
          accent={deviasiColor}
        />
      </div>

      {/* EVM Cards */}
      {hasEVM && (
        <div style={{ marginBottom: 20 }}>
          <div style={{
            display: "flex", alignItems: "center", justifyContent: "space-between",
            marginBottom: 10,
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <p style={{ fontSize: 11, fontWeight: 700, color: C.mid, textTransform: "uppercase", letterSpacing: "0.05em", margin: 0 }}>
                Earned Value Management (EVM)
              </p>
              <button aria-label="Tentang EVM"
                onClick={() => setShowEvmDetail(v => !v)}
                title="Tentang EVM"
                style={{ background: "none", border: "none", cursor: "pointer", padding: 0, color: C.muted, display: "flex" }}
              >
                <Info size={13} />
              </button>
            </div>
            {/* Basis BAC disebut eksplisit: angka CPI/SPI berubah arti tergantung
                basisnya, dan perubahan diam-diam pada angka yang dipakai
                mengambil keputusan adalah bentuk kesalahan yang paling sulit
                terdeteksi. */}
            <span style={{ fontSize: 11, color: C.muted }}>
              BAC: {fmt(evm.bac)}
              {evm.bacSource === "rap_locked" && (
                <span style={{ color: C.green, marginLeft: 6 }}>· pagu RAP (biaya)</span>
              )}
              {evm.bacSource === "rab" && (
                <span style={{ marginLeft: 6 }}>· nilai RAB (termasuk margin)</span>
              )}
              {evm.bacSource === "contract_value" && (
                <span style={{ marginLeft: 6 }}>· nilai kontrak</span>
              )}
            </span>
          </div>

          {/* EVM detail info */}
          {showEvmDetail && (
            <div style={{
              background: "#F8FAFF", border: `1px solid ${C.blueLight}`, borderRadius: 8,
              padding: "10px 14px", fontSize: 11, color: C.mid, marginBottom: 10,
              lineHeight: 1.6,
            }}>
              <strong style={{ color: C.text }}>EVM (Earned Value Management)</strong> — sistem pengukuran kinerja proyek berdasarkan perbandingan biaya rencana, biaya aktual, dan nilai pekerjaan yang telah diselesaikan.<br />
              <strong>CPI</strong> (Cost Performance Index): efisiensi biaya. ≥1 = hemat, &lt;1 = boros.&nbsp;
              <strong>SPI</strong> (Schedule Performance Index): efisiensi jadwal. ≥1 = cepat, &lt;1 = terlambat.&nbsp;
              <strong>EAC</strong>: perkiraan total biaya akhir. <strong>VAC</strong>: selisih antara anggaran dan EAC.<br />
              <strong style={{ color: C.text }}>Basis BAC</strong> — semua angka di atas dihitung terhadap BAC.
              Bila proyek sudah punya <strong>pagu RAP terkunci</strong>, BAC memakai pagu itu (rencana belanja
              nyata). Bila belum, BAC memakai nilai RAB — dan RAB adalah harga jual yang sudah mengandung margin,
              sehingga CPI cenderung terlihat lebih baik daripada keadaan sebenarnya. Kunci pagu RAP di tab
              Material &amp; RAP untuk mendapat angka yang jujur.
            </div>
          )}

          {/* Row 1: CPI, SPI, EAC */}
          <div style={{ display: "flex", gap: 10, marginBottom: 10, flexWrap: "wrap" }}>
            <EvmCard
              label="CPI — Efisiensi Biaya"
              value={evm.cpi}
              colorIndex={evm.cpi}
              goodAbove={true}
            />
            <EvmCard
              label="SPI — Efisiensi Jadwal"
              value={evm.spi}
              colorIndex={evm.spi}
              goodAbove={true}
            />
            <EvmCard
              label="EAC — Estimasi Total"
              value={evm.eac}
              sub={evm.eac !== null
                ? `vs ${evm.bacSource === "rap_locked" ? "pagu RAP" : "RAB"} ${fmt(evm.bac)}`
                : undefined}
              isRupiah={true}
              colorIndex={evm.eac !== null && evm.bac > 0 ? evm.bac / (evm.eac || 1) : null}
              goodAbove={true}
            />
          </div>

          {/* Row 2: ETC, VAC, TCPI */}
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <EvmCard
              label="ETC — Sisa Biaya"
              value={evm.etc}
              sub="estimasi biaya untuk selesai"
              isRupiah={true}
            />
            <EvmCard
              label="VAC — Variance at Completion"
              value={evm.vac}
              sub={evm.vac !== null ? (evm.vac >= 0 ? "di bawah anggaran" : "melebihi anggaran") : undefined}
              isRupiah={true}
              colorIndex={evm.vac !== null ? (evm.vac >= 0 ? 1.2 : evm.vac >= -evm.bac * 0.1 ? 0.85 : 0.5) : null}
              goodAbove={true}
            />
            <EvmCard
              label="TCPI — Target Efisiensi"
              value={evm.tcpi}
              sub="efisiensi yg harus dicapai"
              colorIndex={evm.tcpi}
              goodAbove={false}
            />
          </div>
        </div>
      )}

      {/* Chart — 3 garis */}
      <div style={{ background: "var(--surface)", border: `1px solid ${C.border}`, borderRadius: 12, padding: "20px 16px 12px" }}>
        <ResponsiveContainer width="100%" height={340}>
          <ComposedChart data={chartData} margin={{ top: 4, right: 8, bottom: 4, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--surface-hover)" />

            <XAxis
              dataKey="week"
              tick={{ fontSize: 10, fill: C.muted }}
              tickLine={false}
              axisLine={{ stroke: C.border }}
              interval={tickInterval === 0 ? "preserveStartEnd" : tickInterval}
            />

            <YAxis
              domain={[0, 100]}
              tickFormatter={v => `${v}%`}
              tick={{ fontSize: 10, fill: C.muted }}
              tickLine={false}
              axisLine={false}
              width={40}
            />

            <Tooltip content={<CustomTooltip />} />

            <Legend
              iconType="circle"
              iconSize={8}
              wrapperStyle={{ fontSize: 12, paddingTop: 12 }}
            />

            {/* Milestone reference lines */}
            {milestoneMarkers.map((m, i) => (
              <ReferenceLine
                key={i}
                x={`M${m.week}`}
                stroke={m.status === "completed" ? C.green : m.status === "overdue" ? C.red : C.yellow}
                strokeDasharray="4 3"
                strokeWidth={1.5}
                label={{
                  value: m.title.length > 12 ? m.title.substring(0, 12) + "…" : m.title,
                  position: "insideTopLeft",
                  fontSize: 9,
                  fill: m.status === "completed" ? C.green : C.yellow,
                  angle: -90,
                  offset: -2,
                }}
              />
            ))}

            {/* Garis 1: Rencana S-curve */}
            <Area
              type="monotone"
              dataKey="rencana"
              name="Rencana"
              stroke="#0066CC"
              strokeWidth={2}
              strokeDasharray="6 3"
              fill={C.blueLight}
              fillOpacity={0.35}
              dot={false}
              connectNulls
            />

            {/* Garis 2: Serapan Dana (manual PM) — disembunyikan dari client */}
            {!isClient && (
              <Line
                type="monotone"
                dataKey="serapan"
                name="Serapan Dana"
                stroke="#EA580C"
                strokeWidth={2.5}
                dot={false}
                connectNulls={false}
              />
            )}

            {/* Garis 3: Aktual Kas (kasbon + expense + upah) — admin/pm only */}
            {!isClient && (
              <Line
                type="monotone"
                dataKey="aktual"
                name="Aktual Kas"
                stroke={C.navy}
                strokeWidth={1.5}
                strokeDasharray="3 3"
                dot={false}
                connectNulls={false}
              />
            )}

            {/* Garis 4: Progress Fisik dari log harian */}
            <Line
              type="monotone"
              dataKey="progress"
              name="Progress Fisik"
              stroke={C.green}
              strokeWidth={2}
              strokeDasharray="5 4"
              dot={{ r: 3, fill: C.green, strokeWidth: 0 }}
              connectNulls={false}
            />
          </ComposedChart>
        </ResponsiveContainer>

        {/* Legend tambahan */}
        <div style={{ display: "flex", gap: 16, paddingTop: 4, paddingLeft: 8, flexWrap: "wrap" }}>
          {milestoneMarkers.length > 0 && (
            <div style={{ fontSize: 11, color: C.muted, display: "flex", alignItems: "center", gap: 4 }}>
              <span style={{ display: "inline-block", width: 16, borderBottom: `1.5px dashed ${C.yellow}` }} />
              Milestone
            </div>
          )}
          <div style={{ fontSize: 11, color: C.muted }}>
            Minggu ke-1 = {fmtDateShort(meta.startDate)}
          </div>
        </div>
      </div>

      {/* EVM basis data — detail */}
      {hasEVM && (
        <div style={{
          marginTop: 12,
          background: C.bg, border: `1px solid ${C.border}`, borderRadius: 8,
          padding: "10px 16px", display: "flex", gap: 24, flexWrap: "wrap",
        }}>
          <span style={{ fontSize: 11, color: C.mid }}>
            <strong style={{ color: C.text }}>BAC</strong> {fmt(evm.bac)}
          </span>
          <span style={{ fontSize: 11, color: C.mid }}>
            <strong style={{ color: C.text }}>EV</strong> {fmt(evm.ev)} ({fmtPct(evm.evPct)})
          </span>
          <span style={{ fontSize: 11, color: C.mid }}>
            <strong style={{ color: C.text }}>PV</strong> {fmt(evm.pv)} ({fmtPct(evm.pvPct)})
          </span>
          <span style={{ fontSize: 11, color: C.mid }}>
            <strong style={{ color: C.text }}>AC</strong> {fmt(evm.ac)} ({fmtPct(evm.acPct)})
          </span>
          <span style={{ fontSize: 11, color: evm.cv >= 0 ? C.green : C.red }}>
            <strong>CV</strong> {evm.cv >= 0 ? "+" : ""}{fmt(evm.cv)}
          </span>
          <span style={{ fontSize: 11, color: evm.sv >= 0 ? C.green : C.red }}>
            <strong>SV</strong> {evm.sv >= 0 ? "+" : ""}{fmt(evm.sv)}
          </span>
        </div>
      )}

      {/* Milestone list */}
      {milestones.length > 0 && (
        <div style={{ marginTop: 16 }}>
          <p style={{ fontSize: 12, fontWeight: 700, color: C.mid, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 8 }}>
            Milestone
          </p>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {milestones.map((m, i) => {
              const statusColor = m.status === "completed" ? C.green : m.status === "overdue" ? C.red : m.status === "at_risk" ? C.yellow : C.muted;
              return (
                <div key={i} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <div style={{ width: 8, height: 8, borderRadius: "50%", background: statusColor, flexShrink: 0 }} />
                  <span style={{ fontSize: 12, color: C.text, flex: 1 }}>{m.title}</span>
                  <span style={{ fontSize: 11, color: C.muted }}>
                    {m.date ? fmtDateShort(m.date) : "—"} · M{m.week}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
