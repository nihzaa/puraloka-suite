"use client";

/**
 * ESTIMASI (CECEP) — kerangka modul: judul, navigasi bagian, lebar halaman.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * KENAPA LAYOUT, BUKAN TAB DI SATU BERKAS
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Sebelum ini seluruh modul hidup dalam SATU berkas 4.070 baris dengan enam
 * tab — berkas terbesar di repo, mengalahkan keuangan (3.449) dan mandor
 * (3.667) yang keduanya sudah dipecah lebih dulu.
 *
 * Diukur 2026-08-16 lewat sesi ber-login: EMPAT dari enam tab merender NOL
 * tabel, dan "Material & RAP" berupa halaman putih tanpa satu pun penjelasan.
 * Backend-nya sementara itu punya 47 endpoint, 22 permission, 3.043 analisa
 * AHSP, 3.212 harga, 208 skenario, dan 2.221 versi. Ketimpangan itu — bukan
 * gaya visualnya — yang membuat modul ini terasa "kurang intuitif".
 *
 * ── Kenapa boleh dipecah padahal ARAH-VISUAL §6b menulis "tetap tab ✅"
 *
 * §1c dokumen yang SAMA menandai baris itu sebagai *"pekerjaan terbuka, bukan
 * keputusan yang sudah turun"* justru karena ukurannya (3.713 saat itu; 4.070
 * saat diukur ulang). Dan aturan uji §6a, dijalankan jujur, menjawab "pecah":
 *
 *     Tab     = sudut pandang berbeda atas DATA YANG SAMA
 *     Halaman = ENTITAS BERBEDA
 *
 * Katalog AHSP (master nasional, lintas proyek) dan RAP (anggaran satu
 * proyek) bukan dua sudut pandang atas data yang sama. Keduanya entitas
 * berbeda → halaman. §6b diperbarui terbuka di commit yang sama, bukan
 * dilanggar diam-diam.
 *
 * ── Kenapa Katalog & Harga TIDAK ada di daftar bawah
 *
 * Keduanya master data lintas proyek, dan `peta-menu.ts` sudah lama
 * menggolongkannya `md-*` (Master Data). Mereka pindah ke /master/ahsp dan
 * /master/harga. Menaruh dua layar master di tengah alur "susun RAB" adalah
 * salah satu sebab alur ini terasa berbelit: pengguna melewati dua layar yang
 * bukan pekerjaannya sebelum sampai ke pekerjaannya.
 */

import Link from "next/link";
import { usePathname } from "next/navigation";
import { JudulBagian } from "@/components/judul-bagian";
import { C } from "@/lib/warna-ui";

interface Bagian {
  href: string;
  label: string;
  /** Cocok PERSIS, bukan awalan — hanya untuk "/estimasi" sendiri. */
  tepat?: boolean;
  /** Halaman di luar modul ini: ditandai supaya tak pernah tampak "aktif". */
  luar?: boolean;
}

const BAGIAN: Bagian[] = [
  { href: "/estimasi", label: "Ikhtisar", tepat: true },
  { href: "/estimasi/rab", label: "Susun RAB" },
  { href: "/estimasi/rap", label: "Anggaran Pelaksanaan" },
  { href: "/estimasi/struktur", label: "Analisa Struktur" },
  { href: "/estimasi/kas", label: "Proyeksi Kas" },
  { href: "/estimasi/varians", label: "Varians Biaya" },
  /*
    Markup TIDAK dijadikan rute bersarang `/estimasi/markup`.

    Sempat dicoba sebagai re-export, dan hasilnya terlihat di tangkapan layar:
    DUA `<h1>` di satu halaman ("Estimasi & RAB" dari layout, "Markup & Margin"
    dari halamannya) plus padding ganda karena halaman itu membawa `<Halaman>`
    sendiri. Penjaga `uji-judul-halaman-ada` tetap hijau — ia memastikan judul
    ADA, bukan memastikan judulnya tunggal. Hijaunya penjaga bukan bukti
    benarnya hierarki.

    Yang dipindahkan cukup JALAN MASUKNYA: orang yang sedang menyusun RAB
    menemukannya dari sini, tanpa halaman itu harus digandakan atau dibedah.
  */
  { href: "/pengaturan/markup", label: "Markup & PPN", luar: true },
];

/**
 * Keterangan PER HALAMAN, bukan satu untuk seluruh modul.
 *
 * Sampai 2026-08-17 layout ini memaku satu kalimat — "RAB dari analisa AHSP
 * ber-edisi × price book…" — di kelima halaman. Terlihat di tangkapan layar:
 * halaman **RAP** menyatakan dirinya sebagai RAB, padahal RAP justru
 * kebalikannya (belanja internal, bukan nilai jual ke klien). Keterangan yang
 * salah lebih buruk daripada tak ada keterangan: ia mengajari hal yang keliru
 * pada halaman yang memang ada untuk membedakan keduanya.
 *
 * Judulnya sendiri datang dari entri menu (`JudulBagian`), jadi ia sudah benar
 * per halaman. Hanya keterangannya yang tertinggal.
 */
const KETERANGAN: Record<string, string> = {
  "/estimasi":
    "RAB dari analisa AHSP ber-edisi × price book — setiap rupiah bisa ditelusuri ke koefisien & harga sumbernya.",
  "/estimasi/rab":
    "Susun rencana anggaran biaya satu proyek: pilih analisa, isi volume, harga jalan dari price book yang berlaku.",
  "/estimasi/rap":
    "Anggaran biaya pelaksanaan — rencana belanja internal, beda dari RAB yang merupakan nilai jual ke klien.",
  "/estimasi/kas":
    "Perkiraan uang masuk dan keluar per periode, diturunkan dari RAB yang sudah tersusun.",
  "/estimasi/varians":
    "Pagu vs komitmen vs belanja aktual per cost code — apakah belanja masih di dalam anggaran.",
  "/estimasi/struktur":
    "Kekuatan penampang dan volume beton/bekisting/besi dihitung dari input yang sama — desain dan RAP tak bisa berselisih diam-diam.",
};

export default function EstimasiLayout({ children }: { children: React.ReactNode }) {
  const path = usePathname();

  return (
    <div
      style={{
        padding: "var(--pad-atas) var(--pad-x) var(--pad-bawah)",
        width: "100%",
        /*
          `--w-luas`, bukan `--w-page`: tabel di modul ini padat kolom (item
          RAB, katalog, varians), sama seperti procurement/piutang/laporan.
        */
        maxWidth: "var(--w-luas)",
        margin: "0 auto",
      }}
    >
      <div className="rise" style={{ marginBottom: 14 }}>
        <JudulBagian cadangan="Estimasi & RAB" keterangan={KETERANGAN[path] ?? KETERANGAN["/estimasi"]} />
      </div>

      <nav
        aria-label="Bagian estimasi"
        style={{
          display: "flex",
          gap: 2,
          flexWrap: "wrap",
          borderBottom: `1px solid ${C.border}`,
          marginBottom: 18,
        }}
      >
        {BAGIAN.map((b) => {
          const aktif = b.luar ? false : b.tepat ? path === b.href : path.startsWith(b.href);
          return (
            <Link
              key={b.href}
              href={b.href}
              aria-current={aktif ? "page" : undefined}
              style={{
                padding: "9px 14px",
                fontSize: "var(--teks-label)",
                fontWeight: 600,
                textDecoration: "none",
                color: aktif ? C.aksen : C.mid,
                borderBottom: `2px solid ${aktif ? C.aksen : "transparent"}`,
                marginBottom: -1,
                whiteSpace: "nowrap",
              }}
            >
              {b.label}
            </Link>
          );
        })}
      </nav>

      {children}
    </div>
  );
}
