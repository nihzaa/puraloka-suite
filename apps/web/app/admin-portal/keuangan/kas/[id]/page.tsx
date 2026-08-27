"use client";

// ============================================================================
// Detail Akun Kas — Portal Admin/Direktur (Task 17, Tahap 3). Salinan dari
// `pm-portal/keuangan/kas/[id]/page.tsx` (Task 33 PM) — saldo + riwayat
// transfer (masuk/keluar) + riwayat pengeluaran + tombol "Konfirmasi
// Diterima" untuk transfer PENDING yang `to_account_id` adalah akun ini
// (`cash:transfer:confirm`, PM PUNYA juga — `cash.ts:304-306`).
//
// ── SATU-SATUNYA PENAMBAHAN FUNGSIONAL (bukan cuma gerbang) di seluruh
//    Tahap 3 — bukan salinan APA ADANYA seperti Task 14/15/16 ──────────────
//
// admin+direktur SAMA-SAMA punya `cash:account:manage` yang PM TIDAK PUNYA
// (dikonfirmasi live query Task 13). PM Portal SENGAJA TIDAK membangun
// tombol "Batalkan" (komentar kepala sumbernya: "TIDAK ADA tombol
// Batalkan... PM TIDAK PUNYA", `cash.ts:355-358`) — di sini WAJIB
// ditambahkan, bukan disalin sebagai ketiadaan.
//
// `PATCH /cash/transfers/:id/cancel` diverifikasi ULANG langsung ke kode
// (`cash.ts:355-379`, dibaca penuh Task 17 Step 1 — TIDAK ada preseden PM
// untuk fungsi ini, jadi tak bisa disalin dari kode PM):
//   - gerbang `cash:account:manage` (preHandler, `cash.ts:357`)
//   - satu-satunya penolakan status: `status === 'cancelled'` → 400 "Transfer
//     sudah dibatalkan" (`cash.ts:368`). TIDAK ADA pemeriksaan status
//     `confirmed` di endpoint ini — beda dari `/confirm` yang menolak DUA
//     status (`confirmed` DAN `cancelled`, `cash.ts:317-318`). Artinya
//     server SENGAJA mengizinkan membatalkan transfer yang sudah
//     dikonfirmasi. UI di sini tetap menyembunyikan tombol untuk status
//     confirmed (brief Step 6: "tombol TIDAK tampil untuk transfer
//     berstatus confirmed/cancelled") sebagai pagar UX tambahan — bukan
//     karena backend menolaknya, tapi supaya alur normal (klik dari daftar
//     pending) tidak membuka celah membatalkan transfer yang uangnya sudah
//     berpindah tanpa konfirmasi eksplisit tambahan. Backend tetap sumber
//     kebenaran; kalau kelak dibutuhkan alur "batalkan yang sudah
//     confirmed", itu perubahan sengaja, bukan bug.
//   - respons: `{ transfer: { id, status } }` — HANYA DUA FIELD (`cash.ts:
//     374`, `.select('id, status')`), BUKAN bentuk yang sama dengan
//     `/confirm` yang menyertakan `confirmed_at` (`cash.ts:348`,
//     `.select('id, status, confirmed_at')`). Respons tidak dipakai di sini
//     (halaman `invalidasi()` lalu re-fetch `GET /cash/accounts/:id`), jadi
//     perbedaan bentuk ini tidak berdampak ke kode, tapi dicatat supaya
//     sesi berikutnya tidak menebak `{ transfer }` dua endpoint ini identik.
//
// Pembatalan berlaku dari KEDUA SISI akun (tombol tampil untuk transfer
// pending baik akun ini `from_account` maupun `to_account`), BEDA dari
// konfirmasi yang HANYA sisi `to_account` (`masuk`) — sesuai brief: gerbang
// `bolehBatalkan` TIDAK bergantung pada variabel `masuk`.
//
// Style tombol "Batalkan": outline `var(--danger-border)`/`var(--danger-bg)`/
// `var(--danger)` — sekunder, pola sama tombol "Tolak" di
// `admin-portal/inbox/page.tsx:653`.
//
// `GET /cash/accounts/:id` bergerbang `cash:view` DAN mempersempit PM ke akun
// proyek MILIKNYA sendiri bila akun itu terikat proyek (`cash.ts:93-99`) —
// admin/direktur company-wide tidak dipersempit begitu. 403/404 dari server
// ditampilkan lewat state `galat` biasa.
//
// State galat AKSI (`galatAksi`, konfirmasi/batalkan) TERPISAH dari galat
// MUAT (`galat` dari `useData`) — pelajaran Task 31 PM, diwarisi Tahap 3.
// ============================================================================

import { useState, useSyncExternalStore } from "react";
import { useParams } from "next/navigation";
import { Wallet, CheckCircle, XCircle } from "lucide-react";
import { useData, invalidasi } from "@/lib/data-cache";
import { api, hasPermission } from "@/lib/api";
import { formatRupiah, formatTanggal } from "@/lib/format";
import EmptyState from "@/components/portal/EmptyState";
import SkeletonCard from "@/components/portal/SkeletonCard";
import StatusBadge, { type VarianStatus } from "@/components/portal/StatusBadge";
import type { RespCashAccountDetail, GalatApi } from "../../../_bersama/tipe";
import { pesanGalat } from "../../../_bersama/tipe";

// `langganan`: pola PERSIS Task 15/16 — perubahan permission (login/switch
// company) tercermin tanpa reload.
const langganan = (cb: () => void) => { window.addEventListener("storage", cb); return () => window.removeEventListener("storage", cb); };

const VARIAN_TRANSFER: Record<string, VarianStatus> = { pending: "pending", confirmed: "approved", cancelled: "rejected" };
const LABEL_TRANSFER: Record<string, string> = { pending: "Menunggu", confirmed: "Terkonfirmasi", cancelled: "Dibatalkan" };

export default function AdminDetailAkunKasPage() {
  // admin+direktur SAMA-SAMA punya `cash:account:manage` (beda dari
  // GL/Rekonsiliasi Task 15/16 yang membelah admin-vs-direktur) — keduanya
  // akan me-render TRUE di sini. Tetap dilewatkan lewat `hasPermission()`,
  // BUKAN dipaku `true`, supaya kalau kelak permission ini dicabut dari
  // salah satu peran, UI ikut menyesuaikan tanpa kode disentuh lagi.
  const bolehBatalkan = useSyncExternalStore(langganan, () => hasPermission("cash:account:manage"), () => false);

  const params = useParams<{ id: string }>();
  const id = params.id;
  const [mengonfirmasi, setMengonfirmasi] = useState<string | null>(null);
  const [membatalkan, setMembatalkan] = useState<string | null>(null);
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

  async function batalkan(transferId: string) {
    setMembatalkan(transferId);
    setGalatAksi(null);
    try {
      await api.patch(`/api/v1/cash/transfers/${transferId}/cancel`, {});
      if (url) invalidasi(url);
    } catch (e) {
      setGalatAksi(pesanGalat(e as GalatApi, "Gagal membatalkan transfer"));
    } finally {
      setMembatalkan(null);
    }
  }

  if (memuat) return <SkeletonCard tinggi={200} />;
  if (galat || !data) {
    return <EmptyState icon={Wallet} judul="Gagal memuat" deskripsi={pesanGalat(galat as GalatApi, "Akun tidak ditemukan atau Anda tidak punya akses.")} />;
  }

  const { account, transfers, expenses } = data;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--gap-bagian)" }}>
      <h1 style={{
        fontSize: "var(--t-judul)", fontWeight: 700,
        color: "var(--text-primary)", margin: 0, letterSpacing: "-0.01em",
      }}>{account.name}</h1>

      <div style={{ background: "var(--surface)", borderRadius: 16, padding: "var(--pad-kartu-lega)", border: "1px solid var(--border)" }}>
        <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>Saldo Saat Ini</div>
        <div style={{ fontSize: 22, fontWeight: 700, color: "var(--text-primary)", fontVariantNumeric: "tabular-nums" }}>{formatRupiah(account.balance)}</div>
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
                    <div style={{ fontSize: 11, color: "var(--text-secondary)" }}>{formatTanggal(t.transfer_date)}</div>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <div style={{ fontSize: 14, fontWeight: 700, color: masuk ? "var(--success)" : "var(--danger)", fontVariantNumeric: "tabular-nums" }}>
                      {masuk ? "+" : "−"}{formatRupiah(t.amount)}
                    </div>
                    <StatusBadge status={VARIAN_TRANSFER[t.status] ?? "netral"} label={LABEL_TRANSFER[t.status] ?? t.status} />
                  </div>
                </div>
                {t.status === "pending" && (masuk || (!masuk && bolehBatalkan)) && (
                  <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                    {masuk && (
                      <button type="button" onClick={() => void konfirmasi(t.id)} disabled={mengonfirmasi === t.id || membatalkan === t.id}
                        style={{
                          minHeight: 36, padding: "0 12px", borderRadius: "var(--portal-radius-pill)", fontSize: 12, fontWeight: 700, border: "none",
                          background: mengonfirmasi === t.id ? "var(--surface-subtle)" : "var(--success)",
                          color: mengonfirmasi === t.id ? "var(--text-muted)" : "var(--on-success-bg)",
                          cursor: mengonfirmasi === t.id || membatalkan === t.id ? "default" : "pointer",
                          display: "flex", alignItems: "center", gap: 4,
                        }}>
                        <CheckCircle size={14} aria-hidden="true" /> {mengonfirmasi === t.id ? "Mengonfirmasi…" : "Konfirmasi Diterima"}
                      </button>
                    )}
                    {/* Batalkan: SATU-SATUNYA aksi Kas yang PM tak punya (Task 17).
                        Pembatalan berlaku dari KEDUA sisi akun (bukan hanya `masuk`
                        seperti konfirmasi) — pola sesuai brief Step 4. */}
                    {bolehBatalkan && (
                      <button type="button" onClick={() => void batalkan(t.id)} disabled={mengonfirmasi === t.id || membatalkan === t.id}
                        style={{
                          minHeight: 36, padding: "0 12px", borderRadius: "var(--portal-radius-pill)", fontSize: 12, fontWeight: 700,
                          border: "1px solid var(--danger-border)",
                          background: membatalkan === t.id ? "var(--surface-subtle)" : "var(--danger-bg)",
                          color: membatalkan === t.id ? "var(--text-muted)" : "var(--danger)",
                          cursor: mengonfirmasi === t.id || membatalkan === t.id ? "default" : "pointer",
                          display: "flex", alignItems: "center", gap: 4,
                        }}>
                        <XCircle size={14} aria-hidden="true" /> {membatalkan === t.id ? "Membatalkan…" : "Batalkan"}
                      </button>
                    )}
                  </div>
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
                <div style={{ fontSize: 11, color: "var(--text-secondary)" }}>{e.projects?.name ?? "—"} · {formatTanggal(e.expense_date)}</div>
              </div>
              <span style={{ fontSize: 13, fontWeight: 700, color: "var(--text-primary)", fontVariantNumeric: "tabular-nums" }}>{formatRupiah(e.total_amount)}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
