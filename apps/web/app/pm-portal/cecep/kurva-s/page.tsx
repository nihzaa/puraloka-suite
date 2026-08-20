"use client";

// ============================================================================
// Kurva-S / EVM — lintas-proyek (Tahap 3, Task 21).
//
// SATU endpoint (`GET /projects/:id/kurva-s`, hanya `authenticate`) memuat
// Kurva-S + EVM + ETC + BAC sekaligus — dibangun sebagai SATU halaman, bukan
// empat, konsisten dengan bentuk datanya (riset Task 17, diverifikasi ULANG
// Task 21 langsung ke `kurva-s.ts:1-517`).
//
// `bacSource` DITAMPILKAN EKSPLISIT (bukan disembunyikan) — dua proyek EVM
// bisa sama-sama "benar" dengan basis biaya berbeda (RAP terkunci vs RAB vs
// nilai kontrak), dan menyembunyikan sumbernya membuat perbandingan lintas
// proyek menyesatkan (spec §"jangan sembunyikan sumber basis", sama alasan
// dengan edisi AHSP §3c rombak).
// ============================================================================

import { useMemo, useState } from "react";
import { TrendingUp, Gauge, Flag } from "lucide-react";
import { useData } from "@/lib/data-cache";
import EmptyState from "@/components/portal/EmptyState";
import SkeletonCard from "@/components/portal/SkeletonCard";
import KpiCard from "@/components/portal/KpiCard";
import MiniChart from "@/components/portal/MiniChart";
import type { ProyekPM, RespKurvaS, GalatApi } from "../../_bersama/tipe";
import { pesanGalat } from "../../_bersama/tipe";

interface RespProyek {
  projects: ProyekPM[];
}

const LABEL_SUMBER_BAC: Record<string, string> = {
  rap_locked: "RAP terkunci",
  rab: "RAB",
  contract_value: "Nilai kontrak",
};

const LABEL_SUMBER_RENCANA: Record<string, string> = {
  rab_schedule: "Jadwal RAB manual",
  gantt: "Tanggal Gantt",
  normal_cdf: "Kurva normal (perkiraan)",
};

function fmtRupiah(v: number | string | null | undefined): string {
  if (v === null || v === undefined) return "—";
  const n = typeof v === "string" ? Number(v) : v;
  if (!Number.isFinite(n)) return "—";
  return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(n);
}
function fmtPct(v: number | null | undefined, digit = 1): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return "—";
  return `${v.toFixed(digit)}%`;
}
function fmtAngka(v: number | null | undefined, digit = 2): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return "—";
  return v.toFixed(digit);
}
function fmtTanggal(s: string | null): string {
  if (!s) return "—";
  return new Date(s).toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric" });
}

function Baris({ label, nilai, aksen }: { label: string; nilai: string; aksen?: boolean }) {
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        padding: "8px 0",
        borderBottom: "1px solid var(--border)",
      }}
    >
      <span style={{ fontSize: 12, color: "var(--text-secondary)" }}>{label}</span>
      <span
        style={{
          fontSize: 13,
          fontWeight: 700,
          color: aksen ? "var(--navy)" : "var(--text-primary)",
          fontVariantNumeric: "tabular-nums",
        }}
      >
        {nilai}
      </span>
    </div>
  );
}

export default function PmKurvaSPage() {
  const [proyekId, setProyekId] = useState("");

  const { data: dataProyek } = useData<RespProyek>("/api/v1/projects");
  const daftarProyek = useMemo(() => (dataProyek?.projects ?? []).filter((p) => p.pm), [dataProyek]);
  const proyekAktif = proyekId || daftarProyek[0]?.id || "";

  const url = proyekAktif ? `/api/v1/projects/${proyekAktif}/kurva-s` : null;
  const { data, memuat, galat: galatMuat } = useData<RespKurvaS>(url);
  const galat = galatMuat ? pesanGalat(galatMuat as GalatApi, "Gagal memuat kurva-S.") : null;

  const evm = data?.meta.evm;

  // MiniChart butuh SATU seri; rencana-vs-aktual ditampilkan sebagai dua
  // sparkline berdampingan (sama pola KpiCard) supaya tetap dekoratif +
  // ringkas, sesuai komponen yang sudah ada — bukan chart baru.
  //
  // `?? 0` DIHAPUS (fix review): backend `kurva-s.ts:365-372` SENGAJA
  // mengirim `null` untuk minggu yang belum lewat ("Tampilkan null untuk
  // minggu yang belum lewat (future weeks)") — beda dari 0 rupiah/persen.
  // Memaksanya jadi 0 membuat kurva 52-minggu di minggu ke-10 naik ke 18%
  // lalu TERJUN ke 0 dan datar 42 minggu — terbaca seperti proyek berhenti
  // total, padahal cuma minggu depan yang belum terjadi. `null` diteruskan
  // apa adanya; `MiniChart`/Recharts `type="monotone"` melompatinya, bukan
  // menariknya ke nol.
  const seriRencana = useMemo(
    () => (data?.chartData ?? []).map((t) => ({ label: t.week, value: t.rencana })),
    [data]
  );
  const seriAktual = useMemo(
    () => (data?.chartData ?? []).map((t) => ({ label: t.week, value: t.aktual })),
    [data]
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--gap-bagian)" }}>
      <h1 style={{ fontSize: 20, fontWeight: 700, color: "var(--text-primary)", margin: 0 }}>Kurva-S &amp; EVM</h1>

      {daftarProyek.length > 1 && (
        <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <span style={{ fontSize: 12, fontWeight: 600, color: "var(--text-secondary)" }}>Proyek</span>
          <select
            value={proyekAktif}
            onChange={(e) => setProyekId(e.target.value)}
            style={{
              minHeight: 44,
              padding: "0 12px",
              borderRadius: 12,
              border: "1px solid var(--border)",
              fontSize: 14,
              background: "var(--surface)",
              color: "var(--text-primary)",
            }}
          >
            {daftarProyek.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
      )}

      {!proyekAktif && <EmptyState icon={TrendingUp} judul="Pilih proyek" deskripsi="Kurva-S dihitung per proyek." />}
      {memuat && <SkeletonCard tinggi={200} />}
      {galat && <EmptyState icon={TrendingUp} judul="Gagal memuat" deskripsi={galat} />}

      {!memuat && !galat && data && evm && (
        <>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "var(--gap-grid)" }}>
            <KpiCard label="CPI (biaya)" nilai={fmtAngka(evm.cpi)} icon={Gauge} />
            <KpiCard label="SPI (jadwal)" nilai={fmtAngka(evm.spi)} icon={Gauge} />
          </div>

          <div
            style={{
              padding: "var(--pad-kartu)",
              borderRadius: "var(--portal-radius-card)",
              background: "var(--surface)",
              border: "1px solid var(--border)",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "var(--text-secondary)", marginBottom: 6 }}>
              <span>Rencana kumulatif (%)</span>
              <span>{fmtPct(data.meta.latestRencanaPct)}</span>
            </div>
            <MiniChart data={seriRencana} tipe="area" warna="var(--navy)" tinggi={56} />
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "var(--text-secondary)", marginTop: 12, marginBottom: 6 }}>
              <span>Aktual kumulatif (%)</span>
              <span>{fmtPct(data.meta.latestActualPct)}</span>
            </div>
            <MiniChart data={seriAktual} tipe="area" warna="var(--info)" tinggi={56} />
            <div
              style={{
                marginTop: 12,
                paddingTop: 10,
                borderTop: "1px solid var(--border)",
                fontSize: 12,
                color: data.meta.deviasi < 0 ? "var(--danger)" : "var(--text-secondary)",
                fontWeight: 600,
              }}
            >
              Deviasi serapan vs rencana: {data.meta.deviasi > 0 ? "+" : ""}
              {fmtPct(data.meta.deviasi)}
            </div>
            <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 4 }}>
              Sumber rencana: {LABEL_SUMBER_RENCANA[data.meta.rencanaSource] ?? data.meta.rencanaSource}
              {data.meta.rencanaSource === "gantt" && ` · cakupan ${fmtPct(data.meta.cakupanJadwalPct)} (${data.meta.itemBerjadwal}/${data.meta.itemTotal} item)`}
            </div>
          </div>

          <div
            style={{
              padding: "var(--pad-kartu)",
              borderRadius: "var(--portal-radius-card)",
              background: "var(--surface)",
              border: "1px solid var(--border)",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
              <span style={{ fontSize: 13, fontWeight: 700, color: "var(--text-secondary)" }}>Detail EVM</span>
              <span
                style={{
                  fontSize: 11,
                  fontWeight: 700,
                  color: "var(--navy)",
                  background: "var(--info-bg)",
                  padding: "2px 8px",
                  borderRadius: "var(--portal-radius-pill)",
                }}
              >
                Basis: {LABEL_SUMBER_BAC[evm.bacSource] ?? evm.bacSource}
              </span>
            </div>
            <Baris label="BAC (anggaran total)" nilai={fmtRupiah(evm.bac)} aksen />
            <Baris label="AC (biaya aktual)" nilai={fmtRupiah(evm.ac)} />
            <Baris label="EV (nilai hasil)" nilai={fmtRupiah(evm.ev)} />
            <Baris label="PV (nilai rencana)" nilai={fmtRupiah(evm.pv)} />
            <Baris label="SV (varians jadwal)" nilai={fmtRupiah(evm.sv)} />
            <Baris label="CV (varians biaya)" nilai={fmtRupiah(evm.cv)} />
            <Baris label="ETC (sisa biaya)" nilai={fmtRupiah(evm.etc)} />
            <Baris label="EAC (estimasi akhir)" nilai={fmtRupiah(evm.eac)} aksen />
            <Baris label="VAC (varians akhir)" nilai={fmtRupiah(evm.vac)} />
            <Baris label="TCPI (efisiensi diperlukan)" nilai={fmtAngka(evm.tcpi)} />
          </div>

          <div style={{ fontSize: 13, fontWeight: 700, color: "var(--text-secondary)" }}>Milestone</div>
          {data.milestones.length === 0 && (
            <EmptyState icon={Flag} judul="Belum ada milestone" deskripsi="Milestone proyek ini belum ditetapkan." />
          )}
          {data.milestones.map((m, i) => (
            <div
              key={`${m.title ?? "milestone"}-${i}`}
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                padding: "var(--pad-kartu)",
                borderRadius: "var(--portal-radius-card)",
                background: "var(--surface)",
                border: "1px solid var(--border)",
              }}
            >
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>{m.title ?? "—"}</div>
                <div style={{ fontSize: 11, color: "var(--text-secondary)" }}>Minggu {m.week} · {fmtTanggal(m.date)}</div>
              </div>
              <span style={{ fontSize: 11, color: "var(--text-secondary)" }}>{m.status ?? "—"}</span>
            </div>
          ))}
        </>
      )}
    </div>
  );
}
