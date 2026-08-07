"use client";

/**
 * PROCUREMENT — kerangka modul: judul dan navigasi antar-bagian.
 *
 * ── Kenapa layout, bukan tab di satu berkas
 *
 * Sebelum ini seluruh modul hidup dalam SATU berkas 2.464 baris dengan
 * DELAPAN tab. Yang rusak dari itu bukan cuma ukurannya — sama persis dengan
 * temuan di `/kas` dan `/keuangan`:
 *
 *   • Tab tak ada di URL — muat ulang kembali ke Supplier, dan "lihat PO yang
 *     belum dikirim" tak bisa dikirim sebagai tautan ke rekan.
 *   • Membuka Supplier tetap mengunduh kode kedelapan tab, termasuk `xlsx`
 *     yang dimuat tab Laporan dan modal opname yang menembak dua endpoint.
 *   • Delapan tab terbuka semuanya bertuliskan "Procurement" di bilah tab.
 *
 * Rute nyata memperbaiki ketiganya, dan Next.js memberi pemecahan kode per
 * rute tanpa diminta. Polanya mengikuti `kas/layout.tsx` persis — modul
 * ketiga yang dipecah tak boleh memperkenalkan pola keempat.
 *
 * ── Kenapa lencana dimuat DI SINI
 *
 * Angka "menunggu" di navigasi berasal dari `/api/v1/procurement/dashboard`,
 * satu panggilan yang menjawab seluruh modul. Kalau tiap halaman
 * memanggilnya sendiri, lencananya berkedip tiap kali orang berpindah bagian
 * — dan angka yang berkedip membuat orang ragu apakah datanya berubah.
 *
 * ── Kenapa TIDAK ada tombol aksi global di sini
 *
 * Berbeda dengan `/kas` (yang punya "Transfer" & "Catat Pengeluaran" sebagai
 * aksi terhadap MODUL), tiap aksi pembuatan di sini terikat pada satu bagian:
 * "Buat MR" hanya masuk akal di Permintaan, "Catat Penerimaan" butuh PO yang
 * sudah dikonfirmasi. Menaruhnya di layout berarti tombol yang membuat objek
 * yang tak terlihat di halaman yang sedang dibuka.
 */

import { useEffect, useState } from "react";
import { api, makeAbortController } from "@/lib/api";
import { C } from "@/lib/warna-ui";
import { NavBagian, type Bagian } from "@/components/nav-bagian";
import type { KpiProcurement } from "./_bersama/tipe";

export default function ProcurementLayout({ children }: { children: React.ReactNode }) {
  const [kpi, setKpi] = useState<KpiProcurement | null>(null);

  useEffect(() => {
    const ac = makeAbortController();
    api.get<KpiProcurement>("/api/v1/procurement/dashboard", { signal: ac.signal })
      .then((r) => setKpi(r.data))
      // Lencana adalah pelengkap, bukan angka utama. Kalau gagal, navigasi
      // tetap tampil TANPA lencana — nol yang dikarang jauh lebih buruk
      // daripada lencana yang absen, karena "0 menunggu" terbaca sebagai
      // "tidak ada yang perlu saya kerjakan".
      .catch(() => setKpi(null));
    return () => ac.abort();
  }, []);

  const bagian: Bagian[] = [
    { href: "/procurement", label: "Ringkasan" },
    {
      href: "/procurement/permintaan", label: "Permintaan",
      jumlah: kpi?.mr_pending_approval,
      // MR menunggu persetujuan = pekerjaan lapangan yang berhenti menunggu
      // SAYA. Itu satu-satunya angka di navigasi ini yang menuntut tindakan
      // hari ini, jadi ia satu-satunya yang boleh merah.
      mendesak: (kpi?.mr_pending_approval ?? 0) > 0,
    },
    { href: "/procurement/pesanan",    label: "Pesanan" },
    { href: "/procurement/penerimaan", label: "Penerimaan" },
    { href: "/procurement/hutang",     label: "Hutang Supplier", jumlah: kpi?.overdue_invoices },
    { href: "/procurement/stok",       label: "Stok",            jumlah: kpi?.low_stock_count },
    { href: "/procurement/supplier",   label: "Supplier" },
    // Kualifikasi menyusul Supplier: yang dinilai adalah supplier yang sudah
    // terdaftar, jadi urutannya mengikuti urutan kerjanya.
    { href: "/procurement/kualifikasi", label: "Kualifikasi Vendor" },
    { href: "/procurement/material",   label: "Material" },
    { href: "/procurement/laporan",    label: "Laporan" },
  ];

  return (
    <div style={{
      padding: "var(--pad-atas) var(--pad-x) var(--pad-bawah)",
      width: "100%", maxWidth: "var(--w-luas)", margin: "0 auto",
    }}>
      {/* Animasi `spin` dipakai `Btn` saat `loading` — didefinisikan sekali di
          layout, bukan diulang di sembilan halaman. */}
      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>

      <div className="rise" style={{ marginBottom: 20 }}>
        <h1 style={{
          fontFamily: "var(--font-display)", fontSize: 28, fontWeight: 700,
          color: C.text, marginBottom: 4,
        }}>Pengadaan &amp; Persediaan</h1>
        <p style={{ fontSize: 13, color: C.mid }}>
          Permintaan material, pesanan ke supplier, penerimaan barang, dan hutang
        </p>
      </div>

      <div className="rise rise-2" style={{
        background: "var(--surface)", border: `1px solid ${C.border}`,
        borderRadius: 14, boxShadow: "var(--naik-1)", overflow: "hidden",
      }}>
        <div style={{ padding: "0 8px" }}>
          <NavBagian bagian={bagian} />
        </div>

        {/* Padding isi ADA DI SINI, satu tempat untuk seluruh bagian —
            pelajaran langsung dari `keuangan/layout.tsx`, tempat tiap bagian
            sempat menyediakan paddingnya sendiri dan menghasilkan tiga jarak
            berbeda. */}
        <div style={{ padding: "20px 24px 24px" }}>
          {children}
        </div>
      </div>
    </div>
  );
}
