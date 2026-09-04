"use client";

// ============================================================================
// Rekonsiliasi Bank — daftar koran per akun kas. Portal Admin/Direktur
// (Task 16, Tahap 3). Salinan APA ADANYA dari `pm-portal/keuangan/
// rekonsiliasi-bank/page.tsx` (Task 35 PM) — TIDAK ada tombol tulis di
// halaman ini di versi PM, jadi TIDAK PERLU gerbang tambahan di sini.
// Gerbang `rekonsiliasi:manage`/`rekonsiliasi:lock` ada di halaman DETAIL
// (`[id]/page.tsx`), bukan di sini.
//
// HANYA Rekonsiliasi Bank — BUKAN Rekonsiliasi Material (yang sudah punya
// halamannya sendiri di `gudang/rekonsiliasi/page.tsx` sejak Task 25, dan
// TIDAK diduplikasi di sini; lihat koreksi di kepala task-35-brief.md).
//
// Bentuk respons diverifikasi baris-per-baris ke `apps/api/src/routes/v1/
// rekonsiliasi-bank.ts` (`GET /rekonsiliasi`, baris 38-109) + `apps/api/src/
// lib/rekonsiliasi-bank.ts` — bukan hanya dibaca dari brief.
//
// `POST /rekonsiliasi` (impor koran) TIDAK dibangun di sini: endpoint itu
// butuh array `baris` yang sudah diurai dari Excel/CSV lewat alur 2-langkah
// (urai → periksa di layar → simpan) yang di luar anggaran breakdown mobile
// ini (lihat komentar kepala `rekonsiliasi-bank.ts:506-526`). Impor koran
// baru tetap lewat desktop/task terpisah — dicatat sebagai concern laporan,
// bukan kelalaian tersembunyi.
//
// TANPA `useSearchParams` — tak butuh <Suspense>.
// ============================================================================

import Link from "next/link";
import { Landmark } from "lucide-react";
import { useData } from "@/lib/data-cache";
import { formatRupiah, formatTanggal } from "@/lib/format";
import EmptyState from "@/components/portal/EmptyState";
import KepalaPortal from "@/components/portal/KepalaPortal";
import SkeletonCard from "@/components/portal/SkeletonCard";
import StatusBadge, { type VarianStatus } from "@/components/portal/StatusBadge";
import type { RespRekonsiliasiDaftar, GalatApi } from "../../_bersama/tipe";
import { pesanGalat } from "../../_bersama/tipe";

// `terbuka`/`dikunci` — label manusia wajib (audit-jenis-tulis-punya-label.mjs).
const LABEL_STATUS: Record<string, string> = { terbuka: "Terbuka", dikunci: "Dikunci" };
const VARIAN_STATUS: Record<string, VarianStatus> = { terbuka: "pending", dikunci: "approved" };

export default function AdminRekonsiliasiBankPage() {
  const { data, memuat, galat } = useData<RespRekonsiliasiDaftar>("/api/v1/rekonsiliasi");

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--gap-bagian)" }}>
      <KepalaPortal judul="Rekonsiliasi Bank" />

      {memuat && <SkeletonCard tinggi={120} />}
      {galat && (
        <EmptyState
          icon={Landmark}
          judul="Gagal memuat"
          deskripsi={pesanGalat(galat as GalatApi, "Coba muat ulang.")}
        />
      )}
      {!memuat && !galat && data && data.koran.length === 0 && (
        <EmptyState
          icon={Landmark}
          judul="Belum ada koran diimpor"
          deskripsi="Impor rekening koran dilakukan lewat dashboard web."
        />
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {(data?.koran ?? []).map((k) => (
          <Link key={k.id} href={`/admin-portal/keuangan/rekonsiliasi-bank/${k.id}`} style={{ textDecoration: "none" }}>
            <div
              style={{
                background: "var(--surface)",
                borderRadius: 16,
                padding: "var(--pad-kartu-lega)",
                border: "1px solid var(--border)",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: "var(--text-primary)" }}>{k.nama_akun}</div>
                  <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>
                    {formatTanggal(k.periode_dari)} – {formatTanggal(k.periode_sampai)}
                  </div>
                </div>
                <StatusBadge status={VARIAN_STATUS[k.status]} label={LABEL_STATUS[k.status] ?? k.status} />
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", marginTop: 8, fontSize: 12 }}>
                <span style={{ color: "var(--text-secondary)" }}>
                  {k.jumlah_cocok}/{k.jumlah_baris} baris cocok
                </span>
                <span
                  style={{
                    fontWeight: 600,
                    color: k.belum_cocok > 0 ? "var(--on-warning-bg)" : "var(--success)",
                  }}
                >
                  {k.belum_cocok > 0 ? `${k.belum_cocok} belum cocok` : "Tuntas"}
                </span>
              </div>
              <div style={{ fontSize: "var(--t-kecil)", color: "var(--text-secondary)", marginTop: 4 }}>
                Saldo akhir koran: {formatRupiah(k.saldo_akhir)}
              </div>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
