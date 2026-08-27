"use client";

// ============================================================================
// Register Piutang — Portal Admin/Direktur (Task 14, awal Tahap 3). Salinan
// APA ADANYA dari `pm-portal/keuangan/piutang/page.tsx` (Task 32 PM) — 3 tab
// (Aging / Retensi / Uang Muka), endpoint yang sama.
//
// Tab lewat `<SegmentedTab>` (@/components/portal) + `useState` lokal —
// BUKAN `useSearchParams`, jadi halaman ini tak butuh <Suspense>.
//
// Ketiga endpoint (`ar-aging`, `retention-register`, `dp-register`) memulangkan
// nominal sebagai NUMBER (bukan string) — beda dari `keuangan/ikhtisar` yang
// seluruhnya string. `useData` diberi `null` untuk tab yang tak aktif supaya
// hanya tab yang sedang dilihat yang memicu request.
//
// ⚠️ GERBANG `finance:view:all` — SAMA seperti `admin-portal/keuangan`
// (Dashboard): direktur TIDAK punya permission ini, ketiga `useData` di
// halaman ini akan memulangkan HTTP 403 untuk akun direktur. Deteksi lewat
// STATUS CODE, bukan isi pesan (lihat komentar kepala `admin-portal/
// keuangan/page.tsx`).
// ============================================================================

import { useState } from "react";
import { Landmark, AlertCircle, AlertTriangle } from "lucide-react";
import { useData } from "@/lib/data-cache";
import { formatRupiah, formatTanggal } from "@/lib/format";
import EmptyState from "@/components/portal/EmptyState";
import KepalaPortal from "@/components/portal/KepalaPortal";
import SkeletonCard from "@/components/portal/SkeletonCard";
import SegmentedTab from "@/components/portal/SegmentedTab";
import type { RespArAging, RespRetensi, RespDp, GalatApi } from "../../_bersama/tipe";
import { pesanGalat } from "../../_bersama/tipe";

const LABEL_BUCKET: Record<string, string> = {
  current: "Belum jatuh tempo", "1-30": "1–30 hari", "31-60": "31–60 hari",
  "61-90": "61–90 hari", "90+": "Lewat 90 hari",
};

type Tab = "aging" | "retensi" | "dp";

function Akses403() {
  return (
    <EmptyState
      icon={AlertTriangle}
      judul="Akses terbatas"
      deskripsi="Register Piutang memerlukan izin finance:view:all. Peran Anda saat ini tidak memilikinya — hubungi admin bila ini keliru."
    />
  );
}

export default function AdminPiutangPage() {
  const [tab, setTab] = useState<Tab>("aging");

  const { data: dataAging, memuat: memuatAging, galat: galatAging } =
    useData<RespArAging>(tab === "aging" ? "/api/v1/finance/ar-aging" : null);
  const { data: dataRetensi, memuat: memuatRetensi, galat: galatRetensi } =
    useData<RespRetensi>(tab === "retensi" ? "/api/v1/finance/retention-register" : null);
  const { data: dataDp, memuat: memuatDp, galat: galatDp } =
    useData<RespDp>(tab === "dp" ? "/api/v1/finance/dp-register" : null);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--gap-bagian)" }}>
      <KepalaPortal judul="Register Piutang" />

      <SegmentedTab
        opsi={[
          { value: "aging", label: "Umur Piutang" },
          { value: "retensi", label: "Retensi" },
          { value: "dp", label: "Uang Muka" },
        ]}
        aktif={tab}
        onUbah={(v) => setTab(v as Tab)}
      />

      {tab === "aging" && (
        <>
          {memuatAging && <SkeletonCard tinggi={120} />}
          {!memuatAging && galatAging && (galatAging as GalatApi)?.response?.status === 403 && <Akses403 />}
          {!memuatAging && galatAging && (galatAging as GalatApi)?.response?.status !== 403 && (
            <EmptyState icon={AlertCircle} judul="Gagal memuat" deskripsi={pesanGalat(galatAging as GalatApi, "Coba lagi.")} />
          )}
          {!memuatAging && dataAging && (
            <>
              <div style={{ fontSize: 13, color: "var(--text-secondary)" }}>
                Total piutang: <strong style={{ color: "var(--text-primary)" }}>{formatRupiah(dataAging.total_outstanding)}</strong> ({dataAging.invoice_count} invoice)
                {dataAging.truncated && <span style={{ color: "var(--on-warning-bg)" }}> — dipotong 1000 baris</span>}
              </div>
              {dataAging.rows.length === 0 && <EmptyState icon={Landmark} judul="Tidak ada piutang" deskripsi="Semua invoice lunas." />}
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {dataAging.rows.map((r) => (
                  <div key={r.id} style={{ background: "var(--surface)", borderRadius: "var(--portal-radius-card)", padding: "var(--pad-kartu)", border: "1px solid var(--border)" }}>
                    <div style={{ display: "flex", justifyContent: "space-between" }}>
                      <span style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>{r.invoice_number}</span>
                      <span style={{ fontSize: 12, fontWeight: 600, color: "var(--on-warning-bg)" }}>{LABEL_BUCKET[r.bucket] ?? r.bucket}</span>
                    </div>
                    <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>{r.project?.name ?? "—"} · {r.client?.name ?? "—"}</div>
                    <div style={{ display: "flex", justifyContent: "space-between", marginTop: 6 }}>
                      <span style={{ fontSize: 12, color: "var(--text-secondary)" }}>Jatuh tempo {formatTanggal(r.due_date)} · lewat {r.days_past_due} hari</span>
                      <span style={{ fontSize: 14, fontWeight: 700, color: "var(--danger)", fontVariantNumeric: "tabular-nums" }}>{formatRupiah(r.amount_due)}</span>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </>
      )}

      {tab === "retensi" && (
        <>
          {memuatRetensi && <SkeletonCard tinggi={120} />}
          {!memuatRetensi && galatRetensi && (galatRetensi as GalatApi)?.response?.status === 403 && <Akses403 />}
          {!memuatRetensi && galatRetensi && (galatRetensi as GalatApi)?.response?.status !== 403 && (
            <EmptyState icon={AlertCircle} judul="Gagal memuat" deskripsi={pesanGalat(galatRetensi as GalatApi, "Coba lagi.")} />
          )}
          {!memuatRetensi && dataRetensi && (
            <>
              <div style={{ fontSize: 13, color: "var(--text-secondary)" }}>
                Total retensi tertahan: <strong style={{ color: "var(--text-primary)" }}>{formatRupiah(dataRetensi.total_outstanding)}</strong>
              </div>
              {dataRetensi.rows.length === 0 && <EmptyState icon={Landmark} judul="Tidak ada retensi" deskripsi="Belum ada retensi tertahan/dicairkan." />}
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {dataRetensi.rows.map((r) => (
                  <div key={r.project.id} style={{ background: "var(--surface)", borderRadius: "var(--portal-radius-card)", padding: "var(--pad-kartu)", border: `1px solid ${r.is_due_estimate ? "var(--warning-border)" : "var(--border)"}` }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>{r.project.name}</div>
                    <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>{r.client?.name ?? "—"}</div>
                    <div style={{ display: "flex", justifyContent: "space-between", marginTop: 6, fontSize: 12 }}>
                      <span style={{ color: "var(--text-secondary)" }}>Ditahan {formatRupiah(r.withheld)} · Dicairkan {formatRupiah(r.released)}</span>
                      <span style={{ fontWeight: 700, color: "var(--on-warning-bg)", fontVariantNumeric: "tabular-nums" }}>{formatRupiah(r.outstanding)}</span>
                    </div>
                    {r.is_due_estimate && (
                      <div style={{ fontSize: 11, color: "var(--on-warning-bg)", marginTop: 4 }}>
                        Estimasi jatuh tempo pencairan: {formatTanggal(r.estimated_release_due)} (BAST formal belum ada di sistem)
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </>
          )}
        </>
      )}

      {tab === "dp" && (
        <>
          {memuatDp && <SkeletonCard tinggi={120} />}
          {!memuatDp && galatDp && (galatDp as GalatApi)?.response?.status === 403 && <Akses403 />}
          {!memuatDp && galatDp && (galatDp as GalatApi)?.response?.status !== 403 && (
            <EmptyState icon={AlertCircle} judul="Gagal memuat" deskripsi={pesanGalat(galatDp as GalatApi, "Coba lagi.")} />
          )}
          {!memuatDp && dataDp && (
            <>
              <div style={{ fontSize: 13, color: "var(--text-secondary)" }}>
                Sisa DP belum di-recoup: <strong style={{ color: "var(--text-primary)" }}>{formatRupiah(dataDp.total_remaining_to_recoup)}</strong>
              </div>
              {dataDp.rows.length === 0 && <EmptyState icon={Landmark} judul="Tidak ada DP" deskripsi="Belum ada uang muka tercatat." />}
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {dataDp.rows.map((r) => (
                  <div key={r.project.id} style={{ background: "var(--surface)", borderRadius: "var(--portal-radius-card)", padding: "var(--pad-kartu)", border: "1px solid var(--border)" }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>{r.project.name}</div>
                    <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>{r.client?.name ?? "—"}</div>
                    <div style={{ display: "flex", justifyContent: "space-between", marginTop: 6, fontSize: 12 }}>
                      <span style={{ color: "var(--text-secondary)" }}>DP dibayar {formatRupiah(r.dp_paid)} · Dipotong {formatRupiah(r.recouped)}</span>
                      <span style={{ fontWeight: 700, color: "var(--text-primary)", fontVariantNumeric: "tabular-nums" }}>{formatRupiah(r.remaining_to_recoup)}</span>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}
