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
import { useData } from "@/lib/data-cache";
import { useRouter, useSearchParams } from "next/navigation";
import { FilePlus2, Plus, Receipt, RefreshCw, Search } from "lucide-react";
import { hasPermission } from "@/lib/api";
import { C } from "@/lib/warna-ui";
import {
  Skeleton, InvoiceRow, CreateInvoiceModal, PayInvoiceModal, unduhInvoicePdf,
} from "../_bersama/komponen";
import { Kosong } from "@/components/ui-dasar";
import type { Invoice } from "../_bersama/tipe";
import { ModalTagihanCo } from "@/components/tagihan-co";
import { Pilihan } from "@/components/pilihan";

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

  /*
    Lapis cache bersama (F4-2). URL ikut `status` saja — `cari` TIDAK masuk
    URL karena endpoint ini tak menerima parameter `search` (mengirimkannya
    diam-diam diabaikan), jadi pencarian disaring di sisi klien.

    Akibatnya bagus: mengetik di kotak cari tak menembak API sama sekali, dan
    bolak-balik antar status memakai cache.

    Awalan `finance/` WAJIB — versi pertama halaman ini menghilangkannya dan
    menghasilkan 404 yang hanya terlihat di konsol, sementara halamannya
    tampil rapi bertuliskan "Tidak ada invoice". Kegagalan yang menyamar jadi
    kabar baik. Dijaga `scripts/uji-endpoint-ada.mjs`.
  */
  const urlInvoice = useMemo(() => {
    const q = new URLSearchParams({ limit: "200" });
    if (status !== "all") q.set("status", status);
    return `/api/v1/finance/invoices?${q}`;
  }, [status]);

  const sumber = useData<{ invoices: Invoice[] }>(urlInvoice);
  const memuat = sumber.memuat;

  /*
    Daftar kosong dan daftar-yang-gagal-dimuat terlihat SAMA PERSIS di layar.
    Membedakannya penting di sini: "tak ada invoice jatuh tempo" adalah kabar
    BAIK yang salah kalau sebenarnya API-nya mati.
  */
  const gagalMuat = sumber.galat ? "Gagal memuat daftar invoice." : null;

  /*
    Galat AKSI (unduh PDF) punya state SENDIRI — dijaga
    `uji-galat-muat-terpisah.mjs`. Kalau keduanya berbagi, gagal unduh PDF
    akan MENGHAPUS pesan "gagal memuat daftar", dan orang kehilangan alasan
    daftarnya kosong.
  */
  const [gagalAksi, setGagalAksi] = useState<string | null>(null);
  const gagal = gagalMuat ?? gagalAksi;

  const invoices = useMemo(() => {
    const semua = sumber.data?.invoices ?? [];
    const k = cari.trim().toLowerCase();
    if (!k) return semua;
    return semua.filter((i) =>
      i.invoice_number.toLowerCase().includes(k) ||
      (i.projects?.name ?? "").toLowerCase().includes(k));
  }, [sumber.data, cari]);
  const [cariKetik, setCariKetik] = useState(cari);
  const [bayar, setBayar] = useState<Invoice | null>(null);
  const [pdfId, setPdfId] = useState<string | null>(null);
  const [buatBaru, setBuatBaru] = useState(false);
  const [tagihanCo, setTagihanCo] = useState(false);
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

  const muat = useCallback(async () => { await sumber.muatUlang(); }, [sumber]);

  // `queueMicrotask`, bukan panggilan langsung: `muat()` memanggil
  // `setMemuat(true)` di baris pertamanya, dan setState SINKRON di dalam
  // effect memicu render kedua sebelum yang pertama selesai
  // (`react-hooks/set-state-in-effect`). Menunda satu microtask
  // memindahkannya keluar dari fase render tanpa jeda yang terlihat.
  // Pola yang sama dipakai di /akuntansi dan /aset.
  /*
    Effect pemuatan awal DIHAPUS — `useData` yang mengambil datanya,
    termasuk pembatalan saat komponen lepas.
  */

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
      setGagalAksi("Gagal membuat PDF. Coba lagi, atau muat ulang halaman.");
    } finally {
      setPdfId(null);
    }
  }

  return (
    // Padding disediakan `keuangan/layout.tsx` — lihat catatan di sana.
    // Menambahkannya lagi di sini membuat jaraknya ganda dan berbeda-beda
    // antar bagian (diukur: 74px / 37px / 1px sebelum diseragamkan).
    <div style={{
      width: "100%", /* Padding DIHAPUS: layout bagian ini (kas/keuangan/mandor/layout.tsx)
         sudah memberi `20px 24px 24px` pada pembungkusnya. Menambahkan
         `--pad-x` di sini membuat jarak tepi terhitung DUA KALI —
         diukur 24+36=60px, sementara halaman lain 36px. */
      padding: 0, maxWidth: "var(--w-luas)", margin: "0 auto",
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
        <Pilihan
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
        </Pilihan>
        <button onClick={() => muat()} style={{
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
        {/*
          Tagihan PEKERJAAN TAMBAH — jalur terpisah, bukan pilihan di dalam
          "Buat Invoice".

          Sebabnya bukan kerapian: change order bercara tagih `separate_co` /
          `final_account` sengaja TIDAK menaikkan nilai kontrak supaya IPC tak
          ikut menagihnya, jadi nilainya HARUS datang dari CO-nya dan tak
          boleh diketik. Menyatukannya dengan form invoice biasa — yang
          seluruh isinya memang diketik — melahirkan satu kotak nilai yang
          boleh diisi untuk sebagian tipe dan tidak untuk sebagian lain, dan
          kotak seperti itu akan diisi orang.
        */}
        {bolehUbah && (
          <button onClick={() => setTagihanCo(true)} style={{
            display: "flex", alignItems: "center", gap: 4, padding: "8px 12px",
            border: `1px solid ${C.border}`, borderRadius: 6,
            background: "var(--surface)", color: C.text,
            fontSize: 12, fontWeight: 600, cursor: "pointer",
          }}>
            <FilePlus2 size={13} aria-hidden="true" /> Pekerjaan tambah
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
          <button onClick={() => muat()} style={{
            marginLeft: 6, padding: "2px 8px", borderRadius: 6,
            border: `1px solid ${C.redBorder}`, background: "transparent",
            color: C.onDangerBg, fontSize: 12, fontWeight: 600, cursor: "pointer",
          }}>Coba lagi</button>
        </div>
      )}

      {memuat ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {[1, 2, 3].map((i) => (
            <div key={i} style={{ padding: "var(--pad-kartu-lega)", borderRadius: 10, border: `1px solid ${C.border}` }}>
              <Skeleton h={14} />
            </div>
          ))}
        </div>
      ) : invoices.length === 0 ? (
        /*
          `<Kosong>`, bukan digambar sendiri.

          91 halaman lain memakainya; yang digambar sendiri menyimpang cepat
          atau lambat — padding 48 vs 40, ikon 36 vs 28, judul `<p>` vs `<div>`.
          Selisih itu tak terlihat sendirian, dan langsung terasa saat berpindah
          dari halaman berisi ke halaman kosong.

          ⚠ Cabang `gagal` DIPERTAHANKAN. Galat MUAT dan "memang belum ada
          isinya" adalah dua keadaan berbeda dengan langkah lanjut berbeda:
          yang satu "coba lagi", yang satu "buat yang pertama". Menyamakannya
          membuat kegagalan jaringan tampil sebagai kabar baik — persis cacat
          yang `uji-galat-muat-terpisah.mjs` jaga.
        */
        <Kosong
          ikon={<Receipt size={28} />}
          judul={gagal ? "Daftar tak bisa dimuat" : "Tidak ada invoice"}
          sebab={
            gagal
              ? "Sambungan ke server terputus saat memuat daftar. Coba muat ulang."
              : status !== "all" || cari
                ? "Tidak ada invoice yang cocok dengan saringan ini. Coba longgarkan saringannya."
                : "Invoice menagihkan progres pekerjaan ke klien. Buat yang pertama lewat tombol di atas."
          }
        />
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
                  onPdfClick={unduhPdf} loadingPdf={pdfId === inv.id} canEdit={bolehUbah}
                  onStatusChanged={() => { void muat(); }} />
              ))}
            </tbody>
          </table>
          <p style={{ fontSize: "var(--t-kecil)", color: C.muted, textAlign: "right", paddingTop: 12 }}>
            {invoices.length} invoice ditampilkan
          </p>
        </div>
      )}

      {buatBaru && (
        <CreateInvoiceModal
          onClose={() => setBuatBaru(false)}
          onSuccess={() => { setBuatBaru(false); muat(); }}
        />
      )}
      {bayar && (
        <PayInvoiceModal
          invoice={bayar}
          onClose={() => setBayar(null)}
          onSuccess={() => { setBayar(null); muat(); }}
        />
      )}
      {tagihanCo && (
        <ModalTagihanCo
          onClose={() => setTagihanCo(false)}
          // TIDAK menutup modalnya. Satu proyek bisa punya beberapa pekerjaan
          // tambah yang menunggu, dan menutup sesudah satu terbit memaksa
          // orang membukanya lagi untuk tiap CO — daftarnya sudah dimuat
          // ulang sendiri di dalam.
          onSukses={() => { void muat(); }}
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
