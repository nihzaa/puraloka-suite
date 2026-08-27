"use client";

// ============================================================================
// Price Book — Master Data CECEP (Tahap 3, Task 18), READ-ONLY.
//
// PM punya `cecep:price:view` TAPI TIDAK `cecep:price:manage` — halaman ini
// sengaja tanpa form tambah harga, bukan kelalaian.
//
// Dikelompokkan per status (`active` dulu, lalu `verified`/`draft`/`expired`
// dilipat default) — lifecycle DB-guarded draft→verified→active→expired,
// hanya `active` yang dipakai resolusi harga sesungguhnya.
//
// Bentuk `HargaSatuan`/`RespHargaSatuan` diverifikasi PERSIS ke
// `apps/api/src/routes/v1/price-book.ts:63-98` (GET /cecep/price-book) —
// dua kali (brief + verifikasi ulang independen Task 18). `resource`
// BERSARANG (embed PostgREST), BUKAN field flat `resource_code`/
// `resource_name`. `supplier` (BUKAN `source_note` — field itu tak ada).
// ============================================================================

import { useMemo, useState } from "react";
import { DollarSign, ChevronDown } from "lucide-react";
import { useData } from "@/lib/data-cache";
import EmptyState from "@/components/portal/EmptyState";
import SkeletonCard from "@/components/portal/SkeletonCard";
import StatusBadge, { type VarianStatus } from "@/components/portal/StatusBadge";
import type { RespHargaSatuan, HargaSatuan, GalatApi } from "../../_bersama/tipe";
import { pesanGalat } from "../../_bersama/tipe";

function fmtRupiah(v: number | string | null | undefined): string {
  if (v === null || v === undefined) return "—";
  const n = typeof v === "string" ? Number(v) : v;
  if (!Number.isFinite(n)) return "—";
  return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(n);
}
function fmtTanggal(s: string | null): string {
  if (!s) return "—";
  return new Date(s).toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric" });
}

const LABEL_STATUS: Record<string, string> = {
  draft: "Draf", verified: "Terverifikasi", active: "Aktif", expired: "Kedaluwarsa",
};
const VARIAN_STATUS: Record<string, VarianStatus> = {
  draft: "netral", verified: "info", active: "approved", expired: "rejected",
};
const URUTAN_STATUS = ["active", "verified", "draft", "expired"];

export default function PmPriceBookPage() {
  const [terbuka, setTerbuka] = useState<Set<string>>(new Set(["active"]));
  const { data, memuat, galat } = useData<RespHargaSatuan>("/api/v1/cecep/price-book?limit=300");

  const kelompok = useMemo(() => {
    const m = new Map<string, HargaSatuan[]>();
    for (const h of data?.data ?? []) {
      const k = h.status;
      m.set(k, [...(m.get(k) ?? []), h]);
    }
    return m;
  }, [data]);

  function toggle(status: string) {
    setTerbuka((prev) => {
      const next = new Set(prev);
      if (next.has(status)) next.delete(status); else next.add(status);
      return next;
    });
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--gap-bagian)" }}>
      <div>
        <h1 style={{ fontSize: 20, fontWeight: 700, color: "var(--text-primary)", margin: 0 }}>
          Price Book
        </h1>
        <p style={{ fontSize: 13, color: "var(--text-secondary)", margin: "4px 0 0" }}>
          Harga satuan tersimpan — hanya status Aktif yang dipakai menghitung RAB.
        </p>
      </div>

      {memuat && <SkeletonCard tinggi={72} />}
      {galat && (
        <EmptyState icon={DollarSign} judul="Gagal memuat" deskripsi={pesanGalat(galat as GalatApi, "Coba muat ulang.")} />
      )}
      {!memuat && !galat && (data?.data ?? []).length === 0 && (
        <EmptyState icon={DollarSign} judul="Belum ada harga" deskripsi="Price book perusahaan masih kosong." />
      )}

      {URUTAN_STATUS.map((status) => {
        const baris = kelompok.get(status) ?? [];
        if (baris.length === 0) return null;
        const buka = terbuka.has(status);
        return (
          <div key={status} style={{ borderRadius: "var(--portal-radius-card)", background: "var(--surface)", border: "1px solid color-mix(in srgb, var(--border) 40%, transparent)", boxShadow: "var(--naik-1)", overflow: "hidden" }}>
            <button
              type="button"
              onClick={() => toggle(status)}
              aria-expanded={buka}
              style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between", padding: "var(--pad-kartu)", background: "transparent", border: "none", cursor: "pointer" }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "var(--gap-grid)" }}>
                <StatusBadge status={VARIAN_STATUS[status] ?? "netral"} label={LABEL_STATUS[status] ?? status} />
                <span style={{ fontSize: 12, color: "var(--text-secondary)" }}>{baris.length} harga</span>
              </div>
              <ChevronDown size={16} color="var(--text-secondary)" aria-hidden="true" style={{ transform: buka ? "none" : "rotate(-90deg)", transition: "transform 150ms" }} />
            </button>
            {buka && (
              <div style={{ borderTop: "1px solid var(--border)" }}>
                {baris.map((h) => (
                  <div key={h.id} style={{ display: "flex", justifyContent: "space-between", padding: "var(--pad-baris)" }}>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>{h.resource?.name ?? h.resource?.code ?? "—"}</div>
                      <div style={{ fontSize: 11, color: "var(--text-secondary)" }}>
                        {h.location ?? "Umum"} · berlaku {fmtTanggal(h.effective_date)}
                        {h.supplier ? ` · ${h.supplier}` : ""}
                      </div>
                    </div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: "var(--navy)", flexShrink: 0 }}>{fmtRupiah(h.amount)}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
