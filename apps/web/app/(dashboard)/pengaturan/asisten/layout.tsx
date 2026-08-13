"use client";

/**
 * ASISTEN — kerangka modul: judul, batas read-only, dan navigasi antar-asisten.
 *
 * ── Kenapa layout, bukan satu halaman dengan empat kartu
 *
 * Versi sebelumnya menaruh keempat asisten berurutan di satu halaman setinggi
 * **4.566 px**. Yang rusak dari itu bukan sekadar panjangnya:
 *
 *   • Mengubah asisten web menuntut menggulir melewati tiga asisten lain.
 *   • Keempat kartu terlihat sama, jadi tak ada penanda sudah sampai di mana.
 *   • Tak bisa dikirim sebagai tautan — "buka pengaturan asisten staf" berarti
 *     "buka halaman ini lalu gulir".
 *   • Menyimpan satu asisten memuat ulang seluruh daftar.
 *
 * Rute nyata memperbaiki keempatnya, dan founder memilih mengikuti pemisahan
 * TJS yang sudah begitu sejak awal. Polanya mengikuti `kas/layout.tsx` dan
 * `keuangan/layout.tsx` persis — modul ketiga yang dipecah tak boleh
 * memperkenalkan pola keempat.
 *
 * ── Kenapa peringatan read-only di layout
 *
 * Ia berlaku untuk KEEMPAT asisten, dan mengulangnya di tiap halaman berarti
 * empat salinan yang pelan-pelan berbeda. Sifat read-only adalah ember [C]
 * (CLAUDE.md §5.3) — ia tak boleh terlihat seperti sesuatu yang berbeda
 * per-asisten.
 */

import { usePathname } from "next/navigation";
import { Globe, HardHat, LineChart, Power, ShieldCheck, UserCog } from "lucide-react";
import { KETERANGAN } from "./_bersama/tipe";
import { KepalaHalaman } from "@/components/dasar";
import { NavBagian } from "@/components/nav-bagian";
import { GAYA_KARTU } from "@/components/ui-dasar";
import { C } from "@/lib/warna-ui";

const BAGIAN = [
  { href: "/pengaturan/asisten", label: "Lapisan AI" },
  { href: "/pengaturan/asisten/pemilik", label: "Asisten pemilik" },
  { href: "/pengaturan/asisten/staf", label: "Asisten staf" },
  { href: "/pengaturan/asisten/web", label: "Asisten web" },
  { href: "/pengaturan/asisten/wawasan", label: "Wawasan portofolio" },
];

/**
 * Judul, keterangan, dan ikon per rute.
 *
 * ── Kenapa judulnya BERUBAH, bukan "Perilaku Asisten" untuk kelimanya
 *
 * Versi pertama memaku satu judul di layout, dan diperiksa berdampingan dengan
 * TJS: di sana tiap halaman punya judulnya sendiri ("Asisten AI Web", bukan
 * "Pengaturan AI"). Bedanya bukan gaya — judul yang tak berubah membuat tab
 * jadi SATU-SATUNYA penanda posisi, dan orang yang mendarat dari tautan
 * langsung tak punya apa pun yang menyebutkan ia ada di mana.
 *
 * Ikonnya juga dibedakan dengan alasan yang sama: lima halaman berikon sama
 * terlihat seperti satu halaman yang gagal berpindah.
 */
/**
 * Keterangan TIDAK ditulis ulang di sini — ia diambil dari `KETERANGAN`.
 *
 * Peta ini sempat MENYALIN keempat kalimat itu kata per kata, dan salinannya
 * sudah menyimpang: keterangan asisten staf kehilangan "dari asisten pemilik",
 * dan wawasan kehilangan "Tidak memakai tool." Dua kalimat yang menjelaskan
 * BATAS sebuah asisten, hilang di tempat yang justru dibaca orang saat
 * mengatur batas itu.
 *
 * `KETERANGAN` di `_bersama/tipe.ts` menyatakan dirinya "dipakai sebagai
 * keterangan halaman" — dan tak ada satu pun yang memakainya, sampai eslint
 * melaporkannya sebagai impor mati. Yang mati bukan konstantanya; yang mati
 * adalah jalur yang seharusnya memakainya.
 */
const KEPALA: Record<string, { judul: string; asisten?: string; keterangan?: string; ikon: React.ReactNode }> = {
  "/pengaturan/asisten": {
    judul: "Lapisan AI",
    // Halaman indeks bukan asisten — keterangannya milik dirinya sendiri.
    keterangan: "Saklar AI dan lama simpan riwayat — berlaku untuk seluruh asisten.",
    ikon: <Power size={19} />,
  },
  "/pengaturan/asisten/pemilik": { judul: "Asisten Pemilik",     asisten: "owner",   ikon: <UserCog size={19} /> },
  "/pengaturan/asisten/staf":    { judul: "Asisten Staf",        asisten: "staff",   ikon: <HardHat size={19} /> },
  "/pengaturan/asisten/web":     { judul: "Asisten Web",         asisten: "web",     ikon: <Globe size={19} /> },
  "/pengaturan/asisten/wawasan": { judul: "Wawasan Portofolio",  asisten: "insight", ikon: <LineChart size={19} /> },
};

export default function AsistenLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  // Cadangan ke indeks: rute yang belum terdaftar lebih baik menampilkan judul
  // induknya daripada kepala halaman kosong.
  const kepala = KEPALA[pathname] ?? KEPALA["/pengaturan/asisten"];

  return (
    <div
      style={{
        padding: "var(--pad-atas) var(--pad-x) var(--pad-bawah)",
        width: "100%",
        maxWidth: "var(--w-form)",
        margin: "0 auto",
      }}
    >
      <KepalaHalaman
        judul={kepala.judul}
        keterangan={kepala.keterangan ?? (kepala.asisten ? KETERANGAN[kepala.asisten] : undefined)}
        ikon={kepala.ikon}
      />

      {/*
        Sifat READ-ONLY dinyatakan sekali, di sini — bukan diulang empat kali.
        Ini ember [C] (CLAUDE.md §5.3): tak ada kotak centang "izinkan
        menulis", dan tak boleh pernah ada. Itu satu-satunya pertahanan prompt
        injection yang tak bergantung pada model berperilaku baik.

        Dinyatakan, bukan disembunyikan: batas yang tak dijelaskan terbaca
        sebagai fitur yang belum jadi.
      */}
      <div
        style={{
          ...GAYA_KARTU,
          padding: "var(--pad-kartu)",
          marginBottom: "var(--gap-bagian)",
          display: "flex",
          gap: 10,
        }}
      >
        <ShieldCheck size={16} style={{ color: C.green, flexShrink: 0, marginTop: 1 }} />
        <p style={{ margin: 0, fontSize: 12.5, color: C.text, lineHeight: 1.6 }}>
          Asisten <strong>hanya bisa membaca</strong>, dan itu tidak bisa diubah dari halaman
          mana pun — tool untuk menyetujui atau mengubah data memang tidak ada di sistem.
          Instruksi apa pun yang Anda tulis tunduk pada batas itu.
        </p>
      </div>

      <div style={{ marginBottom: "var(--gap-bagian)" }}>
        <NavBagian bagian={BAGIAN} />
      </div>

      {children}
    </div>
  );
}
