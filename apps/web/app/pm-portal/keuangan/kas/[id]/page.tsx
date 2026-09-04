"use client";

// ============================================================================
// Detail Akun Kas — Cash Management, Task 33 Step 3.
//
// Saldo + riwayat transfer (masuk/keluar) + riwayat pengeluaran dari akun ini
// + tombol "Konfirmasi" HANYA untuk transfer PENDING yang `to_account_id`
// adalah akun ini (`cash:transfer:confirm`, PM PUNYA — dikonfirmasi
// `cash.ts:304-306`).
//
// TIDAK ADA tombol "Batalkan" transfer (`PATCH .../cancel` butuh
// `cash:account:manage`, PM TIDAK PUNYA — `cash.ts:355-358`) dan TIDAK ADA
// aksi apa pun atas daftar pengeluaran (approve/reject hanya lewat inbox
// terpusat Task 36, Temuan #2 Task 31).
//
// `GET /cash/accounts/:id` bergerbang `cash:view` DAN mempersempit PM ke akun
// proyek MILIKNYA sendiri bila akun itu terikat proyek (`cash.ts:93-99`) —
// akun tanpa proyek (kas utama company) tetap terlihat. 403/404 dari server
// untuk kasus ini ditampilkan lewat state `galat` biasa (bukan ditangani
// khusus), pesannya sudah jelas ("Akses ditolak"/"Akun tidak ditemukan").
//
// State galat AKSI (`galatAksi`, konfirmasi transfer) TERPISAH dari galat
// MUAT (`galat` dari `useData`) — pelajaran Task 31, sama seperti
// `keuangan/kas/page.tsx`.
// ============================================================================

import { useState } from "react";
import { useParams } from "next/navigation";
import { Wallet, CheckCircle } from "lucide-react";
import { useData, invalidasi } from "@/lib/data-cache";
import { api } from "@/lib/api";
import EmptyState from "@/components/portal/EmptyState";
import SkeletonCard from "@/components/portal/SkeletonCard";
import StatusBadge, { type VarianStatus } from "@/components/portal/StatusBadge";
import type { RespCashAccountDetail, GalatApi } from "../../../_bersama/tipe";
import { pesanGalat } from "../../../_bersama/tipe";

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
const VARIAN_TRANSFER: Record<string, VarianStatus> = { pending: "pending", confirmed: "approved", cancelled: "rejected" };
const LABEL_TRANSFER: Record<string, string> = { pending: "Menunggu", confirmed: "Terkonfirmasi", cancelled: "Dibatalkan" };

export default function PmDetailAkunKasPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const [mengonfirmasi, setMengonfirmasi] = useState<string | null>(null);
  const [galatAksi, setGalatAksi] = useState<string | null>(null);

  const url = id ? `/api/v1/cash/accounts/${id}` : null;
  const { data, memuat, galat } = useData<RespCashAccountDetail>(url);

  async function konfirmasi(transferId: string) {
    setMengonfirmasi(transferId);
    setGalatAksi(null);
    try {
      await api.patch(`/api/v1/cash/transfers/${transferId}/confirm`, {});
      if (url) invalidasi(url);
    } catch (e) {
      setGalatAksi(pesanGalat(e as GalatApi, "Gagal mengonfirmasi transfer"));
    } finally {
      setMengonfirmasi(null);
    }
  }

  if (memuat) return <SkeletonCard tinggi={200} />;
  if (galat || !data) {
    return <EmptyState icon={Wallet} judul="Gagal memuat" deskripsi={pesanGalat(galat as GalatApi, "Akun tidak ditemukan atau Anda tidak punya akses.")} />;
  }

  const { account, transfers, expenses } = data;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--gap-bagian)" }}>
      <h1 style={{ fontSize: 20, fontWeight: 700, color: "var(--text-primary)", margin: 0 }}>{account.name}</h1>

      <div style={{ background: "var(--surface)", borderRadius: 16, padding: "var(--pad-kartu-lega)", border: "1px solid var(--border)" }}>
        <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>Saldo Saat Ini</div>
        <div style={{ fontSize: 22, fontWeight: 700, color: "var(--text-primary)", fontVariantNumeric: "tabular-nums" }}>{fmtRupiah(account.balance)}</div>
        {account.projects && <div style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: 4 }}>{account.projects.name}</div>}
      </div>

      {galatAksi && <div role="alert" style={{ fontSize: 12, color: "var(--danger)" }}>{galatAksi}</div>}

      <div>
        <h2 style={{ fontSize: 14, fontWeight: 700, color: "var(--text-primary)", margin: "0 0 10px" }}>Riwayat Transfer</h2>
        {transfers.length === 0 && <EmptyState icon={Wallet} judul="Belum ada transfer" deskripsi="Transfer masuk/keluar akun ini akan muncul di sini." />}
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {transfers.map((t) => {
            const masuk = t.to_account.id === account.id;
            return (
              <div key={t.id} style={{ background: "var(--surface)", borderRadius: 12, padding: 12, border: "1px solid var(--border)" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div>
                    <span style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>
                      {masuk ? `Dari ${t.from_account.name}` : `Ke ${t.to_account.name}`}
                    </span>
                    <div style={{ fontSize: "var(--t-kecil)", color: "var(--text-secondary)" }}>{fmtTanggal(t.transfer_date)}</div>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <div style={{ fontSize: 14, fontWeight: 700, color: masuk ? "var(--success)" : "var(--danger)", fontVariantNumeric: "tabular-nums" }}>
                      {masuk ? "+" : "−"}{fmtRupiah(t.amount)}
                    </div>
                    <StatusBadge status={VARIAN_TRANSFER[t.status] ?? "netral"} label={LABEL_TRANSFER[t.status] ?? t.status} />
                  </div>
                </div>
                {t.status === "pending" && masuk && (
                  <button type="button" onClick={() => void konfirmasi(t.id)} disabled={mengonfirmasi === t.id}
                    style={{
                      marginTop: 8, minHeight: 36, padding: "0 12px", borderRadius: "var(--portal-radius-pill)", fontSize: 12, fontWeight: 700, border: "none",
                      background: mengonfirmasi === t.id ? "var(--surface-subtle)" : "var(--success)",
                      color: mengonfirmasi === t.id ? "var(--text-muted)" : "var(--on-success-bg)",
                      cursor: mengonfirmasi === t.id ? "default" : "pointer",
                      display: "flex", alignItems: "center", gap: 4,
                    }}>
                    <CheckCircle size={14} aria-hidden="true" /> {mengonfirmasi === t.id ? "Mengonfirmasi…" : "Konfirmasi Diterima"}
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </div>

      <div>
        <h2 style={{ fontSize: 14, fontWeight: 700, color: "var(--text-primary)", margin: "0 0 10px" }}>Pengeluaran dari Akun Ini</h2>
        {expenses.length === 0 && <EmptyState icon={Wallet} judul="Belum ada pengeluaran" deskripsi="Pengeluaran approved dari kas kecil ini akan muncul di sini." />}
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {expenses.map((e) => (
            <div key={e.id} style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderBottom: "1px solid var(--border)" }}>
              <div>
                <div style={{ fontSize: 13, color: "var(--text-primary)" }}>{e.description}</div>
                <div style={{ fontSize: "var(--t-kecil)", color: "var(--text-secondary)" }}>{e.projects?.name ?? "—"} · {fmtTanggal(e.expense_date)}</div>
              </div>
              <span style={{ fontSize: 13, fontWeight: 700, color: "var(--text-primary)", fontVariantNumeric: "tabular-nums" }}>{fmtRupiah(e.total_amount)}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
