"use client";

// ============================================================================
// Cashflow Forecast — proyeksi pencairan kas (Tahap 3, Task 21).
//
// Pemilih proyek → pemilih versi RAB terkunci/disetujui (daftar Task 19,
// `GET /api/v1/estimate-versions`) → tabel periode.
//
// ── Bentuk backend BEDA TOTAL dari dugaan brief — dikoreksi Task 21
//
// Brief menebak `{ period: string; masuk; keluar; saldo }` per periode
// (kas masuk vs keluar berpasangan). Dibaca baris-per-baris ke
// `estimate-versions.ts:208-227` + `lib/cashflow-forecast.ts` (fungsi murni
// ber-test): endpoint ini adalah READ-MODEL SATU ARAH — proyeksi PENCAIRAN
// (distribusi `total_amount` versi estimasi ke N periode lewat kurva
// normal-CDF, pola sama kurva-S), BUKAN kas masuk vs keluar. Tak ada kolom
// "masuk"/"keluar"/"saldo" — hanya `disbursement` (pencairan periode ini)
// dan `cumulative` (kumulatif s/d periode ini, berakhir PERSIS di
// `baseline_total`). Tabel di sini karena itu menampilkan pencairan +
// kumulatif, bukan tiga kolom berpasangan yang brief tebak.
//
// Gerbang `cecep:estimate:view`, PM PUNYA (diverifikasi live 2026-08-21).
// ============================================================================

import { useMemo, useState } from "react";
import { Banknote } from "lucide-react";
import { useData } from "@/lib/data-cache";
import EmptyState from "@/components/portal/EmptyState";
import SkeletonCard from "@/components/portal/SkeletonCard";
import type { ProyekPM, RespRabDaftar, RespCashflowForecast, GalatApi } from "../../_bersama/tipe";
import { pesanGalat } from "../../_bersama/tipe";

interface RespProyek {
  projects: ProyekPM[];
}

function fmtRupiah(v: number | string | null | undefined): string {
  if (v === null || v === undefined) return "—";
  const n = typeof v === "string" ? Number(v) : v;
  if (!Number.isFinite(n)) return "—";
  return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(n);
}

export default function PmCashflowPage() {
  const [proyekId, setProyekId] = useState("");
  const [versiId, setVersiId] = useState("");

  const { data: dataProyek } = useData<RespProyek>("/api/v1/projects");
  const daftarProyek = useMemo(() => (dataProyek?.projects ?? []).filter((p) => p.pm), [dataProyek]);
  const proyekAktif = proyekId || daftarProyek[0]?.id || "";

  // Versi RAB milik proyek aktif — hanya yang terkunci/disetujui yang
  // masuk akal jadi baseline forecast (draf masih berubah).
  const { data: dataRab } = useData<RespRabDaftar>("/api/v1/estimate-versions?limit=200");
  const versiProyek = useMemo(
    () =>
      (dataRab?.data ?? []).filter(
        (b) => b.project_id === proyekAktif && (b.status === "approved" || b.status === "frozen")
      ),
    [dataRab, proyekAktif]
  );
  const versiAktif = versiId || versiProyek[0]?.id || "";

  const url = versiAktif ? `/api/v1/estimate-versions/${versiAktif}/cashflow-forecast?periods=12` : null;
  const { data, memuat, galat: galatMuat } = useData<RespCashflowForecast>(url);
  const galat = galatMuat ? pesanGalat(galatMuat as GalatApi, "Gagal memuat proyeksi kas.") : null;

  const totalPencairan = useMemo(
    () => (data?.forecast ?? []).reduce((s, p) => s + p.disbursement, 0),
    [data]
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--gap-bagian)" }}>
      <h1 style={{ fontSize: 20, fontWeight: 700, color: "var(--text-primary)", margin: 0 }}>Proyeksi Kas</h1>
      <p style={{ fontSize: 12, color: "var(--text-secondary)", margin: 0 }}>
        Perkiraan pencairan dana per periode dari RAB terkunci/disetujui — bukan kas aktual.
      </p>

      {daftarProyek.length > 1 && (
        <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <span style={{ fontSize: 12, fontWeight: 600, color: "var(--text-secondary)" }}>Proyek</span>
          <select
            value={proyekAktif}
            onChange={(e) => { setProyekId(e.target.value); setVersiId(""); }}
            style={{ minHeight: 44, padding: "0 12px", borderRadius: 12, border: "1px solid var(--border)", fontSize: 14, background: "var(--surface)", color: "var(--text-primary)" }}
          >
            {daftarProyek.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
      )}

      {proyekAktif && versiProyek.length > 0 && (
        <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <span style={{ fontSize: 12, fontWeight: 600, color: "var(--text-secondary)" }}>Versi RAB</span>
          <select
            value={versiAktif}
            onChange={(e) => setVersiId(e.target.value)}
            style={{ minHeight: 44, padding: "0 12px", borderRadius: 12, border: "1px solid var(--border)", fontSize: 14, background: "var(--surface)", color: "var(--text-primary)" }}
          >
            {versiProyek.map((v) => (
              <option key={v.id} value={v.id}>
                {v.scenario_name ?? "Utama"} · revisi {v.version_number} · {v.status === "frozen" ? "Terkunci" : "Disetujui"}
              </option>
            ))}
          </select>
        </label>
      )}

      {!proyekAktif && <EmptyState icon={Banknote} judul="Pilih proyek" deskripsi="Proyeksi kas dihitung per versi RAB." />}
      {proyekAktif && versiProyek.length === 0 && (
        <EmptyState icon={Banknote} judul="Belum ada RAB terkunci/disetujui" deskripsi="Proyeksi kas butuh baseline RAB yang sudah disetujui atau dikunci." />
      )}
      {memuat && <SkeletonCard tinggi={140} />}
      {galat && <EmptyState icon={Banknote} judul="Gagal memuat" deskripsi={galat} />}

      {!memuat && !galat && data && (
        <>
          <div
            style={{
              padding: "var(--pad-kartu)",
              borderRadius: "var(--portal-radius-card)",
              background: "var(--surface)",
              border: "1px solid var(--border)",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span style={{ fontSize: 12, color: "var(--text-secondary)" }}>Baseline (nilai RAB)</span>
              <span style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>{fmtRupiah(data.baseline_total)}</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", marginTop: 6 }}>
              <span style={{ fontSize: 12, color: "var(--text-secondary)" }}>Jumlah periode</span>
              <span style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>{data.periods} minggu</span>
            </div>
          </div>

          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12, fontVariantNumeric: "tabular-nums" }}>
              <caption className="sr-only">Proyeksi pencairan kas per periode dan kumulatifnya.</caption>
              <thead>
                <tr style={{ background: "var(--surface-subtle)" }}>
                  <th style={{ padding: "8px 8px", textAlign: "left", fontSize: 10, fontWeight: 700, color: "var(--text-secondary)", textTransform: "uppercase", borderBottom: "1px solid var(--border)" }}>Periode</th>
                  <th style={{ padding: "8px 8px", textAlign: "right", fontSize: 10, fontWeight: 700, color: "var(--text-secondary)", textTransform: "uppercase", borderBottom: "1px solid var(--border)" }}>Pencairan</th>
                  <th style={{ padding: "8px 8px", textAlign: "right", fontSize: 10, fontWeight: 700, color: "var(--text-secondary)", textTransform: "uppercase", borderBottom: "1px solid var(--border)" }}>Kumulatif</th>
                </tr>
              </thead>
              <tbody>
                {data.forecast.map((p) => (
                  <tr key={p.period} style={{ borderBottom: "1px solid var(--border)" }}>
                    <td style={{ padding: "8px 8px", color: "var(--text-primary)" }}>M{p.period}</td>
                    <td style={{ padding: "8px 8px", textAlign: "right", color: "var(--text-primary)" }}>{fmtRupiah(p.disbursement)}</td>
                    <td style={{ padding: "8px 8px", textAlign: "right", fontWeight: 700, color: "var(--navy)" }}>{fmtRupiah(p.cumulative)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr style={{ background: "var(--surface-subtle)" }}>
                  <td style={{ padding: "8px 8px", fontWeight: 700, color: "var(--text-primary)" }}>Total</td>
                  <td style={{ padding: "8px 8px", textAlign: "right", fontWeight: 700, color: "var(--navy)" }}>{fmtRupiah(totalPencairan)}</td>
                  <td style={{ padding: "8px 8px" }} />
                </tr>
              </tfoot>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
