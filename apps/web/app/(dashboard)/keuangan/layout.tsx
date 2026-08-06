"use client";

/**
 * KEUANGAN — kerangka modul: judul, KPI, dan navigasi antar-bagian.
 *
 * ── Kenapa layout, bukan tab di satu berkas
 *
 * Sebelum ini, seluruh modul hidup dalam SATU berkas 3.449 baris dengan enam
 * tab. Yang rusak dari itu bukan cuma ukurannya:
 *
 *   • Tab tak ada di URL — muat ulang kembali ke Overview, dan "lihat yang di
 *     tab Kasbon" tak bisa dikirim sebagai tautan.
 *   • Membuka Overview tetap mengunduh kode keenam tab.
 *   • Lima tab terbuka semuanya bertuliskan "Keuangan" di bilah tab.
 *
 * Rute nyata memperbaiki ketiganya, dan Next.js memberi pemecahan kode per
 * rute tanpa diminta.
 *
 * ── Kenapa KPI di layout, bukan di tiap halaman
 *
 * Enam angka teratas (Total Kas, Outstanding, dst.) menggambarkan SELURUH
 * modul, bukan bagian yang sedang dibuka — itu sebabnya di versi tab pun ia
 * berada di atas deretan tab. Menaruhnya di layout membuatnya dimuat sekali
 * dan bertahan saat berpindah bagian: angka yang berkedip-kedip setiap klik
 * membuat orang ragu apakah datanya berubah.
 */

import { useEffect, useState } from "react";
import { Wallet, TrendingUp, TrendingDown, ArrowUpRight, Clock, Banknote } from "lucide-react";
import { api, makeAbortController } from "@/lib/api";
import { C } from "@/lib/warna-ui";
import { NavBagian, type Bagian } from "@/components/nav-bagian";

interface RingkasKeuangan {
  totalKas: number; totalKasMain: number; totalKasCollector: number;
  paidThisMonth: number; periodLabel: string;
  totalKeluar: number; keluarThisMonth: number;
  laborCost: number; materialCost: number;
  advanceBeredar: number;
  totalOutstanding: number; overdueCount: number;
  wagePendingTotal: number; wagePendingCount: number;
  kasbonPendingCount: number;
}

const rp = (n: number) => {
  if (n >= 1_000_000_000) return `Rp ${(n / 1_000_000_000).toFixed(1)}M`;
  if (n >= 1_000_000) return `Rp ${(n / 1_000_000).toFixed(0)}jt`;
  return new Intl.NumberFormat("id-ID", {
    style: "currency", currency: "IDR", maximumFractionDigits: 0,
  }).format(n);
};

function KartuAngka({ label, nilai, sub, ikon, warna, tepi }: {
  label: string; nilai: string; sub: string;
  ikon: React.ReactNode; warna: string; tepi?: string;
}) {
  return (
    <div style={{
      flex: "1 1 180px", minWidth: 180,
      background: "var(--surface)", border: `1px solid ${tepi ?? C.border}`,
      borderRadius: 10, padding: "12px 16px",
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
        <span style={{ color: warna, display: "flex" }}>{ikon}</span>
        <span style={{
          fontSize: 10, fontWeight: 700, letterSpacing: ".05em",
          textTransform: "uppercase", color: C.muted,
        }}>{label}</span>
      </div>
      <div style={{
        fontFamily: "var(--font-display)", fontSize: 22, fontWeight: 700,
        color: warna, lineHeight: 1.1, fontVariantNumeric: "tabular-nums",
      }}>{nilai}</div>
      <div style={{ fontSize: 11, color: C.muted, marginTop: 4, lineHeight: 1.4 }}>{sub}</div>
    </div>
  );
}

export default function KeuanganLayout({ children }: { children: React.ReactNode }) {
  const [ringkas, setRingkas] = useState<RingkasKeuangan | null>(null);
  const [gagal, setGagal] = useState(false);

  useEffect(() => {
    const ac = makeAbortController();
    api.get<RingkasKeuangan>("/api/v1/finance/summary", { signal: ac.signal })
      .then((r) => { setRingkas(r.data); setGagal(false); })
      .catch((e) => { if (e?.name !== "CanceledError") setGagal(true); });
    return () => ac.abort();
  }, []);

  const bagian: Bagian[] = [
    { href: "/keuangan", label: "Ringkasan" },
    { href: "/keuangan/invoice", label: "Invoice" },
    { href: "/keuangan/pembayaran", label: "Pembayaran Masuk" },
    {
      href: "/keuangan/kasbon", label: "Kasbon",
      jumlah: ringkas?.kasbonPendingCount,
      // Kasbon menunggu = uang yang belum keluar karena menunggu SAYA.
      // Itu satu-satunya angka di navigasi ini yang menuntut tindakan hari
      // ini, jadi ia satu-satunya yang boleh merah.
      mendesak: (ringkas?.kasbonPendingCount ?? 0) > 0,
    },
    { href: "/keuangan/arus-kas", label: "Arus Kas" },
    { href: "/keuangan/profitabilitas", label: "Profitabilitas" },
    { href: "/keuangan/contingency", label: "Contingency" },
  ];

  return (
    <div style={{
      padding: "var(--pad-atas) var(--pad-x) var(--pad-bawah)",
      width: "100%", maxWidth: "var(--w-luas)", margin: "0 auto",
    }}>
      <div className="rise" style={{ marginBottom: 20 }}>
        <h1 style={{
          fontFamily: "var(--font-display)", fontSize: 28, fontWeight: 700,
          color: C.text, marginBottom: 4,
        }}>Keuangan</h1>
        <p style={{ fontSize: 13, color: C.mid }}>
          Invoice, pembayaran, kasbon, dan arus kas proyek
        </p>
      </div>

      {/* KPI modul — hanya disembunyikan kalau gagal dimuat. Menampilkan
          "Rp 0" pada data yang tak terbaca adalah kebohongan yang
          menenangkan, dan di layar keuangan itu berbahaya. */}
      {!gagal && (
        <div className="rise rise-2" style={{
          display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 18,
        }}>
          {ringkas ? (
            <>
              <KartuAngka label="Total Kas" nilai={rp(ringkas.totalKas)}
                sub={`Utama ${rp(ringkas.totalKasMain)} · Kolektor ${rp(ringkas.totalKasCollector)}`}
                ikon={<Wallet size={15} />} warna={C.navy} />
              <KartuAngka label="Pendapatan Diterima" nilai={rp(ringkas.paidThisMonth)}
                sub={`periode ${ringkas.periodLabel ?? "ini"}`}
                ikon={<TrendingUp size={15} />} warna={C.green} tepi={C.greenBorder} />
              <KartuAngka label="Biaya Keluar" nilai={rp(ringkas.totalKeluar ?? ringkas.keluarThisMonth)}
                sub={`Upah ${rp(ringkas.laborCost ?? 0)} · Material ${rp(ringkas.materialCost ?? 0)}`}
                ikon={<TrendingDown size={15} />} warna={C.red} tepi={C.redBorder} />
              <KartuAngka label="Advance Beredar" nilai={rp(ringkas.advanceBeredar ?? 0)}
                sub="kasbon belum dilunasi"
                ikon={<ArrowUpRight size={15} />} warna={C.yellow} tepi={C.yellowBorder} />
              <KartuAngka label="Outstanding Invoice" nilai={rp(ringkas.totalOutstanding)}
                sub={ringkas.overdueCount > 0 ? `${ringkas.overdueCount} lewat jatuh tempo` : "semua on-track"}
                ikon={<Clock size={15} />} warna={C.blue} tepi={C.blueBorder} />
              <KartuAngka label="Upah Pending Bayar" nilai={rp(ringkas.wagePendingTotal)}
                sub={`${ringkas.wagePendingCount} laporan disetujui`}
                ikon={<Banknote size={15} />} warna={C.aksen} tepi={C.blueBorder} />
            </>
          ) : (
            // Rangka, bukan spinner: tinggi yang sama dengan kartu sungguhan,
            // jadi isi di bawahnya tak melompat saat data tiba.
            Array.from({ length: 6 }, (_, i) => (
              <div key={i} aria-hidden="true" style={{
                flex: "1 1 180px", minWidth: 180, height: 96,
                background: "var(--surface-subtle)", borderRadius: 10,
                border: `1px solid ${C.border}`,
              }} />
            ))
          )}
        </div>
      )}

      <div className="rise rise-2" style={{
        background: "var(--surface)", border: `1px solid ${C.border}`,
        borderRadius: 14, boxShadow: "var(--naik-1)",
        overflow: "hidden",
      }}>
        <div style={{ padding: "0 8px" }}>
          <NavBagian bagian={bagian} />
        </div>

        {/* Padding isi ADA DI SINI, satu tempat untuk seluruh bagian.
            Diukur 2026-08-07, tiap bagian menyediakan padding-nya sendiri
            dan hasilnya tiga jarak berbeda:

              arus-kas        74px
              profitabilitas  37px
              contingency      1px   ← mepet ke tepi kartu

            Menambalnya per halaman berarti jarak keempat menyusul di halaman
            berikutnya. Yang benar: kartu pembungkus yang menentukan jaraknya,
            dan halaman bagian cukup mengisi. */}
        <div style={{ padding: "20px 24px 24px" }}>
          {children}
        </div>
      </div>
    </div>
  );
}
