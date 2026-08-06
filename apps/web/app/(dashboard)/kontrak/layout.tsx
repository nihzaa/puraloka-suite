"use client";

/**
 * KONTRAK — kerangka modul: navigasi antar-bagian.
 *
 * Setipis `lapangan/layout.tsx`, dan karena alasan yang sama: dua halaman
 * anak (`rfi`, `asuransi`) sudah lebih dulu ada dengan pembungkus lebar,
 * judul, dan tombol aksinya masing-masing. Membungkusnya lagi di sini
 * menghasilkan padding bertumpuk dan dua judul di satu layar.
 *
 * ── Kenapa RFI ada di /kontrak, bukan di /lapangan
 *
 * Terlihat salah tempat sampai alasannya dibaca. RFI adalah surat resmi ke
 * konsultan/pemberi kerja, dan nilainya bukan menyimpan pertanyaan — itu
 * bisa dilakukan email. Yang tak bisa dilakukan email: menghitung berapa
 * lama pekerjaan menggantung menunggu jawaban, lalu MENAUTKAN angka itu ke
 * klaim perpanjangan waktu (`routes/v1/rfi.ts` menyimpan `eot_id` persis
 * untuk itu). Ia dokumen kontraktual yang kebetulan lahir di lapangan.
 * Letaknya tidak dipindahkan di sini — memindahkan rute yang sudah dipakai
 * akan mematahkan tautan yang sudah beredar.
 */

import { NavBagian, type Bagian } from "@/components/nav-bagian";

const BAGIAN: Bagian[] = [
  { href: "/kontrak", label: "Ringkasan" },
  { href: "/kontrak/rfi", label: "RFI" },
  { href: "/kontrak/asuransi", label: "Asuransi" },
];

export default function KontrakLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <div style={{
        width: "100%", maxWidth: "var(--w-page)", margin: "0 auto",
        padding: "var(--pad-atas) var(--pad-x) 0",
      }}>
        <NavBagian bagian={BAGIAN} />
      </div>
      {children}
    </>
  );
}
