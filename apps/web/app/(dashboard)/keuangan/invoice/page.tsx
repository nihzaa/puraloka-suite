"use client";

/**
 * INVOICE — daftar tagihan ke klien.
 *
 * ── Yang berubah selain jadi rute sendiri
 *
 * Filter status dan kata kunci sekarang tersimpan di URL. Sebelumnya
 * keduanya state biasa, jadi "invoice yang jatuh tempo" tak bisa dikirim
 * sebagai tautan — dan tombol Kembali peramban membuang saringan yang baru
 * saja diketik.
 *
 * Ini juga yang membuat pranala dari halaman lain bekerja sungguhan:
 * `/keuangan/invoice?status=overdue` kini membuka daftar yang benar, bukan
 * daftar penuh yang harus disaring ulang dengan tangan.
 */

import { Suspense, useCallback, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Plus, Receipt, RefreshCw, Search } from "lucide-react";
import { hasPermission } from "@/lib/api";
import { useData } from "@/lib/data-cache";
import { C } from "@/lib/warna-ui";
import {
  Skeleton, InvoiceRow, CreateInvoiceModal, PayInvoiceModal, unduhInvoicePdf,
} from "../_bersama/komponen";
import type { Invoice } from "../_bersama/tipe";

const STATUS = [
  { v: "all", l: "Semua Status" },
  { v: "draft", l: "Draft" },
  { v: "sent", l: "Terkirim" },
  { v: "partial", l: "Parsial" },
  { v: "paid", l: "Lunas" },
  { v: "overdue", l: "Jatuh Tempo" },
  { v: "cancelled", l: "Batal" },
];

function InvoicePageInner() {
  const router = useRouter();
  const params = useSearchParams();
  const status = params.get("status") ?? "all";
  const cari = params.get("q") ?? "";

  const [cariKetik, setCariKetik] = useState(cari);
  const [bayar, setBayar] = useState<Invoice | null>(null);
  const [pdfId, setPdfId] = useState<string | null>(null);
  const [buatBaru, setBuatBaru] = useState(false);
  const tunda = useRef<ReturnType<typeof setTimeout> | null>(null);

  // `hasPermission` membaca localStorage — kosong di server, terisi di
  // klien. Memanggilnya saat render pertama membuat HTML server dan klien
  // BERBEDA (tombol "Buat Invoice" ada di satu sisi, tidak di sisi lain), dan
  // React membuang seluruh pohon lalu merendernya ulang. Gejalanya kedipan
  // saat halaman dibuka, dengan galat hidrasi di konsol.
  //
  // `useSyncExternalStore` memang dirancang untuk ini: argumen ketiganya
  // ADALAH nilai yang dipakai server. Render pertama selalu "belum boleh",
  // lalu izin sebenarnya masuk — tanpa render kedua, jadi tak menambah
  // hutang `react-hooks/set-state-in-effect` seperti useState+useEffect.
  const bolehUbah = useSyncExternalStore(
    () => () => {},                              // izin tak berubah setelah muat
    () => hasPermission("finance:invoice:pay"),  // klien
    () => false,                                 // server: anggap belum boleh
  );

  /** Tulis saringan ke URL. `replace`, bukan `push`: tiap huruf yang diketik
   *  tak boleh jadi satu entri riwayat — tombol Kembali harus keluar dari
   *  halaman, bukan mengupas ketikan satu per satu. */
  const setSaring = useCallback((ubah: Record<string, string>) => {
    const p = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(ubah)) {
      if (!v || v === "all") p.delete(k);
      else p.set(k, v);
    }
    router.replace(`/keuangan/invoice${p.size ? `?${p}` : ""}`, { scroll: false });
  }, [params, router]);

  /*
    ── PINDAH KE LAPIS CACHE BERSAMA (F4-2), 2026-08-16

    URL-nya DINAMIS mengikuti `status` — itu justru menguntungkan: `useData`
    memakai URL sebagai kunci cache, jadi ganti status lalu kembali tak
    mengambil ulang selama masih segar. Awalan `finance/` WAJIB — versi
    pertama halaman ini menghilangkannya dan menghasilkan 404 yang hanya
    terlihat di konsol; dijaga `scripts/uji-endpoint-ada.mjs`.

    Pencarian TETAP disaring di sisi klien sesudah data datang — endpoint ini
    tak menerima parameter `search`, jadi `cari` bukan bagian kunci cache.
  */
  const jalur = status !== "all"
    ? `/api/v1/finance/invoices?limit=200&status=${encodeURIComponent(status)}`
    : "/api/v1/finance/invoices?limit=200";
  const { data, memuat, galat: galatMuat, muatUlang } = useData<{ invoices: Invoice[] }>(jalur);

  const invoices = useMemo(() => {
    const semua = data?.invoices ?? [];
    const k = cari.trim().toLowerCase();
    return k
      ? semua.filter((i) =>
          i.invoice_number.toLowerCase().includes(k) ||
          (i.projects?.name ?? "").toLowerCase().includes(k))
      : semua;
  }, [data, cari]);

  const muat = useCallback(async () => { await muatUlang(); }, [muatUlang]);

  /*
    Galat MUAT dan galat AKSI (unduh PDF) sengaja dipisah — satu state untuk
    keduanya membuat gagal mengunduh menghapus pesan gagal memuat.
  */
  const [galatAksi, setGalatAksi] = useState<string | null>(null);
  // Daftar kosong dan daftar-yang-gagal-dimuat terlihat sama persis di
  // layar. Membedakannya penting di sini: "tak ada invoice jatuh tempo"
  // adalah kabar baik yang salah kalau sebenarnya API-nya mati.
  const gagal = galatAksi ?? (galatMuat ? "Gagal memuat daftar invoice." : null);

  function ketik(v: string) {
    setCariKetik(v);
    if (tunda.current) clearTimeout(tunda.current);
    tunda.current = setTimeout(() => setSaring({ q: v }), 300);
  }

  async function unduhPdf(inv: Invoice) {
    setPdfId(inv.id);
    try {
      await unduhInvoicePdf(inv);
    } catch {
      // Gagal mengunduh tak boleh diam: orang akan menekan tombolnya
      // berulang kali dan menyimpulkan aplikasinya menggantung.
      setGalatAksi("Gagal membuat PDF. Coba lagi, atau muat ulang halaman.");
    } finally {
      setPdfId(null);
    }
  }

  return (
    // Padding disediakan `keuangan/layout.tsx` — lihat catatan di sana.
    // Menambahkannya lagi di sini membuat jaraknya ganda dan berbeda-beda
    // antar bagian (diukur: 74px / 37px / 1px sebelum diseragamkan).
    <div style={{
      width: "100%", padding: "var(--pad-atas) var(--pad-x) var(--pad-bawah)", maxWidth: "var(--w-luas)", margin: "0 auto",
    }}>
      {/* ── Saringan ── */}
      <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
        <div style={{ flex: 1, minWidth: 220, position: "relative" }}>
          <Search size={13} aria-hidden="true" style={{
            position: "absolute", left: 10, top: "50%",
            transform: "translateY(-50%)", color: C.muted, pointerEvents: "none",
          }} />
          <input
            value={cariKetik}
            onChange={(e) => ketik(e.target.value)}
            aria-label="Cari nomor invoice atau nama proyek"
            placeholder="Cari no. invoice atau nama proyek..."
            style={{
              width: "100%", padding: "8px 12px 8px 32px",
              border: `1px solid ${C.border}`, borderRadius: 6,
              fontSize: 13, color: C.text, outline: "none",
              boxSizing: "border-box", background: "var(--surface)",
            }}
            onFocus={(e) => { e.target.style.borderColor = C.navy; }}
            onBlur={(e) => { e.target.style.borderColor = C.border; }}
          />
        </div>
        <select
          aria-label="Saring invoice menurut status"
          value={status}
          onChange={(e) => setSaring({ status: e.target.value })}
          style={{
            padding: "8px 12px", border: `1px solid ${C.border}`,
            borderRadius: 6, fontSize: 13, color: C.text,
            background: "var(--surface)", outline: "none",
          }}
        >
          {STATUS.map((s) => <option key={s.v} value={s.v}>{s.l}</option>)}
        </select>
        <button onClick={() => void muat()} style={{
          display: "flex", alignItems: "center", gap: 4, padding: "8px 12px",
          border: `1px solid ${C.border}`, borderRadius: 6,
          background: "var(--surface)", color: C.mid, fontSize: 12, cursor: "pointer",
        }}>
          <RefreshCw size={13} aria-hidden="true" /> Muat ulang
        </button>
        {bolehUbah && (
          <button onClick={() => setBuatBaru(true)} style={{
            display: "flex", alignItems: "center", gap: 4, padding: "8px 12px",
            border: "none", borderRadius: 6, background: "var(--grad-aksen)",
            color: "var(--on-aksen)", fontSize: 12, fontWeight: 600, cursor: "pointer",
          }}>
            <Plus size={13} aria-hidden="true" /> Buat Invoice
          </button>
        )}
      </div>

      {gagal && (
        <div role="alert" style={{
          padding: "12px 12px", borderRadius: 10, marginBottom: 14,
          background: C.redBg, border: `1px solid ${C.redBorder}`,
          color: C.onDangerBg, fontSize: 13,
        }}>
          {gagal}{" "}
          <button onClick={() => void muat()} style={{
            marginLeft: 6, padding: "2px 8px", borderRadius: 6,
            border: `1px solid ${C.redBorder}`, background: "transparent",
            color: C.onDangerBg, fontSize: 12, fontWeight: 600, cursor: "pointer",
          }}>Coba lagi</button>
        </div>
      )}

      {memuat ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {[1, 2, 3].map((i) => (
            <div key={i} style={{ padding: 16, borderRadius: 10, border: `1px solid ${C.border}` }}>
              <Skeleton h={14} />
            </div>
          ))}
        </div>
      ) : invoices.length === 0 ? (
        <div style={{ padding: "48px 0", textAlign: "center", color: C.muted, fontSize: 13 }}>
          <Receipt size={36} aria-hidden="true" style={{ color: "var(--border)", marginBottom: 12 }} />
          <p style={{ fontWeight: 600, color: C.text, marginBottom: 4 }}>
            {gagal ? "Daftar tak bisa dimuat" : "Tidak ada invoice"}
          </p>
          <p>{status !== "all" || cari ? "Coba longgarkan saringannya." : "Buat invoice pertama lewat tombol di atas."}</p>
        </div>
      ) : (
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, fontVariantNumeric: "tabular-nums" }}>
            <caption className="sr-only">Daftar invoice beserta status pembayarannya</caption>
            <thead>
              <tr style={{ background: "var(--surface-subtle)", borderBottom: `1px solid ${C.border}` }}>
                {["No Invoice", "Proyek", "Total", "Terbayar", "Sisa", "Jatuh Tempo", "Status", "Aksi"].map((h, i) => (
                  <th key={h} scope="col" style={{
                    // Disamakan dengan `<Tabel>` bersama (components/dasar.tsx):
                    // `--pad-baris`, `--t-mikro`, bobot 700. Diukur di peramban
                    // 2026-08-12, tabel ini merender kepala 11px/600 sementara
                    // 61 halaman ber-`<Tabel>` merender 10px/700 — cukup untuk
                    // terbaca sebagai tabel dari aplikasi lain.
                    padding: "var(--pad-baris)",
                    textAlign: i >= 2 && i <= 4 ? "right" : i === 7 ? "center" : "left",
                    fontSize: "var(--t-mikro)", fontWeight: 700, letterSpacing: "0.05em",
                    textTransform: "uppercase", color: C.mid, whiteSpace: "nowrap",
                  }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {invoices.map((inv) => (
                <InvoiceRow key={inv.id} inv={inv} onPayClick={setBayar}
                  onPdfClick={unduhPdf} loadingPdf={pdfId === inv.id} canEdit={bolehUbah} />
              ))}
            </tbody>
          </table>
          <p style={{ fontSize: 11, color: C.muted, textAlign: "right", paddingTop: 12 }}>
            {invoices.length} invoice ditampilkan
          </p>
        </div>
      )}

      {buatBaru && (
        <CreateInvoiceModal
          onClose={() => setBuatBaru(false)}
          onSuccess={() => { setBuatBaru(false); void muat(); }}
        />
      )}
      {bayar && (
        <PayInvoiceModal
          invoice={bayar}
          onClose={() => setBayar(null)}
          onSuccess={() => { setBayar(null); void muat(); }}
        />
      )}
    </div>
  );
}

export default function InvoicePage() {
  // `useSearchParams` menuntut Suspense di App Router.
  return (
    <Suspense fallback={<div style={{ padding: 20 }}><Skeleton h={40} /></div>}>
      <InvoicePageInner />
    </Suspense>
  );
}
