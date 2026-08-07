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
import { JudulBagian } from "@/components/judul-bagian";
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


  return (
    <div style={{
      padding: "var(--pad-atas) var(--pad-x) var(--pad-bawah)",
      width: "100%", maxWidth: "var(--w-luas)", margin: "0 auto",
    }}>
      {/* Animasi `spin` dipakai `Btn` saat `loading` — didefinisikan sekali di
          layout, bukan diulang di sembilan halaman. */}
      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>

      <div className="rise" style={{ marginBottom: 20 }}>
        <JudulBagian cadangan="Pengadaan & Persediaan" keterangan="Permintaan material, pesanan ke supplier, penerimaan barang, dan hutang" />
      </div>

      <div className="rise rise-2" style={{
        background: "var(--surface)", border: `1px solid ${C.border}`,
        borderRadius: 14, boxShadow: "var(--naik-1)", overflow: "hidden",
      }}>

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
