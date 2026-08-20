"use client";

// ============================================================================
// Varians per Cost Code — lintas-proyek (Tahap 3, Task 21).
//
// Pemilih proyek, daftar baris per cost code (pagu/commitment/aktual/
// varians). Warna varians negatif `--danger`, positif `--text-secondary`
// (BUKAN hijau mencolok — `ARAH-VISUAL-2026.md`: warna sukses dipakai
// hemat).
//
// ── Bentuk backend dikoreksi Task 21 dari dugaan brief
//
// Brief menebak `{ cost_code; nama; anggaran; komitmen; aktual; varians }`.
// Dibaca baris-per-baris ke `lib/varians-cost-code.ts` (`BarisVarians`,
// fungsi murni `agregasiVarians()`, 12 test) + rute
// `cost-control.ts:744-840`:
//  - Field asli `code`/`name`/`pagu`/`commitment`/`actual`/`exposure`/
//    `variance` — nama BEDA dari dugaan brief.
//  - `variance` bisa `null` (pagu belum diketahui — RAP belum punya
//    jembatan resource↔cost_code), BUKAN 0. Ditampilkan sebagai "—", bukan
//    "Rp 0" yang menyiratkan pagu memang nol.
//  - `commitment` dilaporkan sebagai TOTAL PROYEK di setiap baris (PO tidak
//    per cost code — jembatan material↔cost_code belum ada), BUKAN angka
//    per-baris yang independen. Dinyatakan lewat catatan `meta.batas`.
//  - Baris tanpa pemetaan kategori→cost code TETAP muncul (`code: "—"`,
//    `name: "Belum dipetakan ke Cost Code"`), tidak dibuang.
//  - Gerbang `cecep:cost_map:view` (BUKAN `cecep:cost_code:view`), PM
//    PUNYA (diverifikasi live 2026-08-21).
// ============================================================================

import { useMemo, useState } from "react";
import { Scale } from "lucide-react";
import { useData } from "@/lib/data-cache";
import EmptyState from "@/components/portal/EmptyState";
import SkeletonCard from "@/components/portal/SkeletonCard";
import type { ProyekPM, RespVarians, GalatApi } from "../../_bersama/tipe";
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

export default function PmVariansPage() {
  const [proyekId, setProyekId] = useState("");

  const { data: dataProyek } = useData<RespProyek>("/api/v1/projects");
  const daftarProyek = useMemo(() => (dataProyek?.projects ?? []).filter((p) => p.pm), [dataProyek]);
  const proyekAktif = proyekId || daftarProyek[0]?.id || "";

  const url = proyekAktif ? `/api/v1/projects/${proyekAktif}/varians` : null;
  const { data, memuat, galat: galatMuat } = useData<RespVarians>(url);
  const galat = galatMuat ? pesanGalat(galatMuat as GalatApi, "Gagal memuat varians.") : null;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--gap-bagian)" }}>
      <h1 style={{ fontSize: 20, fontWeight: 700, color: "var(--text-primary)", margin: 0 }}>Varians Cost Code</h1>

      {daftarProyek.length > 1 && (
        <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <span style={{ fontSize: 12, fontWeight: 600, color: "var(--text-secondary)" }}>Proyek</span>
          <select
            value={proyekAktif}
            onChange={(e) => setProyekId(e.target.value)}
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

      {!proyekAktif && <EmptyState icon={Scale} judul="Pilih proyek" deskripsi="Varians dihitung per proyek." />}
      {memuat && <SkeletonCard tinggi={140} />}
      {galat && <EmptyState icon={Scale} judul="Gagal memuat" deskripsi={galat} />}

      {!memuat && !galat && data && (
        <>
          <div
            style={{
              padding: "var(--pad-kartu)",
              borderRadius: "var(--portal-radius-card)",
              background: "var(--surface)",
              border: "1px solid var(--border)",
              display: "flex",
              flexDirection: "column",
              gap: 6,
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span style={{ fontSize: 12, color: "var(--text-secondary)" }}>Total aktual</span>
              <span style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>{fmtRupiah(data.meta.total_actual)}</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span style={{ fontSize: 12, color: "var(--text-secondary)" }}>Commitment (PO mengikat, total proyek)</span>
              <span style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>{fmtRupiah(data.meta.commitment_total)}</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", paddingTop: 6, borderTop: "1px solid var(--border)" }}>
              <span style={{ fontSize: 13, fontWeight: 700, color: "var(--text-primary)" }}>Total exposure</span>
              <span style={{ fontSize: 16, fontWeight: 700, color: "var(--navy)" }}>{fmtRupiah(data.meta.exposure_total)}</span>
            </div>
            {data.meta.actual_belum_dipetakan > 0 && (
              <div style={{ fontSize: 11, color: "var(--on-warning-bg)", background: "var(--warning-bg)", padding: "6px 8px", borderRadius: 8, marginTop: 4 }}>
                {fmtRupiah(data.meta.actual_belum_dipetakan)} belum terpetakan ke cost code manapun.
              </div>
            )}
          </div>

          {data.data.length === 0 && (
            <EmptyState icon={Scale} judul="Belum ada belanja" deskripsi="Proyek ini belum punya belanja tercatat." />
          )}

          {data.data.map((b) => (
            <div
              key={b.cost_code_id ?? "belum-dipetakan"}
              style={{
                padding: "var(--pad-kartu)",
                borderRadius: "var(--portal-radius-card)",
                background: "var(--surface)",
                border: "1px solid var(--border)",
                display: "flex",
                flexDirection: "column",
                gap: 6,
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: "var(--text-primary)" }}>{b.code}</div>
                  <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>{b.name}</div>
                </div>
                {b.serapan_pct !== null && (
                  <span style={{ fontSize: 11, fontWeight: 700, color: "var(--text-secondary)", flexShrink: 0 }}>{b.serapan_pct.toFixed(1)}%</span>
                )}
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6, fontSize: 12 }}>
                <div>
                  <div style={{ color: "var(--text-secondary)" }}>Pagu</div>
                  <div style={{ fontWeight: 600, color: "var(--text-primary)" }}>{b.pagu > 0 ? fmtRupiah(b.pagu) : "—"}</div>
                </div>
                <div>
                  <div style={{ color: "var(--text-secondary)" }}>Aktual</div>
                  <div style={{ fontWeight: 600, color: "var(--text-primary)" }}>{fmtRupiah(b.actual)}</div>
                </div>
                <div>
                  <div style={{ color: "var(--text-secondary)" }}>Commitment</div>
                  <div style={{ fontWeight: 600, color: "var(--text-primary)" }}>{fmtRupiah(b.commitment)}</div>
                </div>
                <div>
                  <div style={{ color: "var(--text-secondary)" }}>Varians</div>
                  <div
                    style={{
                      fontWeight: 700,
                      color: b.variance === null ? "var(--text-secondary)" : b.variance < 0 ? "var(--danger)" : "var(--text-secondary)",
                    }}
                  >
                    {b.variance === null ? "Belum diketahui" : fmtRupiah(b.variance)}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </>
      )}
    </div>
  );
}
