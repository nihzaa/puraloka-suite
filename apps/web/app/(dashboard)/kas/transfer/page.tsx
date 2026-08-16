"use client";

/**
 * KAS — TRANSFER DANA. Perpindahan uang antar akun kas.
 *
 * Isinya dipindah dari tab kedua `kas/page.tsx`, tidak ditulis ulang.
 *
 * ── Saringan status kini ada di URL
 *
 * Di versi tab, "lihat transfer yang menunggu" adalah `setTab("transfer") +
 * setTransferStatusFilter("pending")` — dua panggilan state yang tak
 * meninggalkan jejak di alamat. Hasilnya tak bisa dikirim ke siapa pun, dan
 * muat ulang mengembalikannya ke "Semua Status".
 *
 * Sekarang `/kas/transfer?status=pending` adalah alamat sungguhan: dashboard
 * menautkannya, tombol Kembali bekerja, dan tautannya bisa ditempel di chat.
 */

import { Suspense, useCallback } from "react";
import { useTerpasang } from "@/lib/use-terpasang";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowRightLeft, RefreshCw } from "lucide-react";
import { api } from "@/lib/api";
import { useData } from "@/lib/data-cache";
import { useIzin } from "@/lib/use-izin";
import { C } from "@/lib/warna-ui";
import { Kosong } from "@/components/ui-dasar";
import { RangkaBaris, TransferRow } from "../_bersama/komponen";
import { type CashTransfer, fmtCompact, pesanGalat } from "../_bersama/tipe";

/** Status yang dikenali API. Nilai `?status=` di luar daftar diperlakukan
 *  sebagai "semua" — bukan diteruskan mentah ke API, yang akan menghasilkan
 *  daftar kosong tanpa penjelasan. */
const STATUS_SAH = ["pending", "confirmed", "cancelled"] as const;

export default function TransferKasPage() {
  const mounted = useTerpasang();
  if (!mounted) return null;
  return (
    // `useSearchParams` menuntut batas Suspense saat halaman di-prerender.
    <Suspense fallback={<RangkaBaris />}>
      <TransferIsi />
    </Suspense>
  );
}

function TransferIsi() {
  const router = useRouter();
  const params = useSearchParams();

  // ADR-004: capability, bukan nama jabatan. Diangkat ke sini, bukan dipanggil
  // sebaris di JSX: `hasPermission` membaca localStorage, jadi memanggilnya di
  // jalur render membuat pohon server dan klien berbeda. Detail: `lib/use-izin.ts`.
  const bolehKonfirmasi = useIzin("cash:transfer:confirm");

  const dariUrl = params.get("status") ?? "";
  const saring = (STATUS_SAH as readonly string[]).includes(dariUrl) ? dariUrl : "all";

  /*
    ── PINDAH KE LAPIS CACHE BERSAMA (F4-2), 2026-08-16

    `useData` menggantikan useCallback+useEffect+AbortController+queueMicrotask.
    Saringan status masuk sebagai bagian dari URL — kunci cache berubah
    otomatis saat saringannya berganti.
  */
  const jalur = saring !== "all"
    ? `/api/v1/cash/transfers?limit=100&status=${encodeURIComponent(saring)}`
    : "/api/v1/cash/transfers?limit=100";
  const { data, memuat, muatUlang } = useData<{ transfers: CashTransfer[] }>(jalur);
  const transfer = data?.transfers ?? [];
  const muat = useCallback(async () => { await muatUlang(); }, [muatUlang]);

  function gantiSaring(nilai: string) {
    // Saringan ditulis ke URL, bukan ke state lokal — supaya keadaan layar
    // yang sedang dilihat orang bisa dibagikan apa adanya.
    router.replace(nilai === "all" ? "/kas/transfer" : `/kas/transfer?status=${nilai}`);
  }

  async function konfirmasi(id: string) {
    try {
      await api.patch(`/api/v1/cash/transfers/${id}/confirm`);
      // `muat()` (bukan setState lokal): data kini datang dari lapis cache,
      // dan menulis ke situ langsung akan tertimpa saat cache lain
      // menyegarkan diri.
      await muat();
    } catch (err: unknown) {
      alert(pesanGalat(err, "Gagal konfirmasi"));
    }
  }

  async function batalkan(id: string) {
    try {
      await api.patch(`/api/v1/cash/transfers/${id}/cancel`);
      await muat();
    } catch (err: unknown) {
      // Kegagalan ini SEBELUMNYA ditelan `catch {}` — dan tampilan lokal di
      // atas tetap berubah jadi "dibatalkan". Jadi layar menunjukkan transfer
      // yang batal sementara server masih menganggapnya berjalan, dan selisih
      // itu baru terlihat saat halaman dimuat ulang.
      alert(pesanGalat(err, "Gagal membatalkan transfer"));
    }
  }

  const totalTerkonfirmasi = transfer
    .filter(t => t.status === "confirmed")
    .reduce((s, t) => s + t.amount, 0);

  return (
    // Token lebar diulang di tiap halaman bagian — `tata-letak-ratchet.mjs`
    // memeriksa `page.tsx` sendiri-sendiri, tanpa membaca layout induknya.
    <div style={{ width: "100%", maxWidth: "var(--w-page)", margin: "0 auto" }}>
      <div style={{ display: "flex", gap: 8, marginBottom: 16, alignItems: "center", flexWrap: "wrap" }}>
        <select aria-label="Saring status transfer" value={saring} onChange={e => gantiSaring(e.target.value)}
          style={{ padding: "var(--pad-atas) var(--pad-x) var(--pad-bawah)", border: `1px solid ${C.border}`, borderRadius: 6, fontSize: 13, background: "var(--surface)", outline: "none" }}>
          <option value="all">Semua Status</option>
          <option value="pending">Menunggu Konfirmasi</option>
          <option value="confirmed">Dikonfirmasi</option>
          <option value="cancelled">Dibatalkan</option>
        </select>
        <button onClick={() => void muat()} style={{
          display: "flex", alignItems: "center", gap: 4, padding: "8px 12px",
          border: `1px solid ${C.border}`, borderRadius: 6, background: "var(--surface)",
          color: C.mid, fontSize: 12, cursor: "pointer",
        }}>
          <RefreshCw size={13} aria-hidden="true" /> Refresh
        </button>
        {transfer.length > 0 && (
          <span style={{ marginLeft: "auto", fontSize: 12, color: C.mid }}>
            {transfer.length} transfer · Total: <strong style={{ color: C.text }}>{fmtCompact(totalTerkonfirmasi)}</strong> terkonfirmasi
          </span>
        )}
      </div>

      {memuat ? (
        <RangkaBaris />
      ) : transfer.length === 0 ? (
        <Kosong
          ikon={<ArrowRightLeft size={40} aria-hidden="true" />}
          judul={saring === "all" ? "Belum ada transfer dana" : "Tidak ada transfer dengan status itu"}
          sebab={saring === "all"
            ? "Transfer mencatat perpindahan uang antar akun kas — misalnya dari rekening bank ke kas proyek. Saldo tiap akun ikut berubah begitu transfernya dicatat."
            : "Saringan status sedang aktif. Pilih \"Semua Status\" untuk melihat seluruh transfer yang pernah dicatat."}
        />
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {transfer.map(t => (
            <TransferRow key={t.id} t={t} canConfirm={bolehKonfirmasi} onConfirm={konfirmasi} onCancel={batalkan} />
          ))}
        </div>
      )}
    </div>
  );
}
