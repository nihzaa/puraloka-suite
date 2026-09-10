"use client";

// ============================================================================
// JUDUL BAGIAN — nama halaman yang sedang dibuka, diambil dari MENU.
//
// ══════════════════════════════════════════════════════════════════════════
// KENAPA KOMPONEN INI ADA
// ══════════════════════════════════════════════════════════════════════════
//
// Enam layout (`kas`, `keuangan`, `mandor`, `procurement`, …) merender `<h1>`
// bernama modulnya: "Manajemen Kas", "Pengadaan & Persediaan". Itu benar
// sampai 2026-08-08, ketika tab-bagian dihapus karena 38 dari 39 tabnya
// duplikat sidebar.
//
// Sesudah tab hilang, `<h1>` itu jadi satu-satunya judul — dan ia menyebut
// MODUL, bukan halaman. Membuka "Rekonsiliasi Bank" menampilkan judul
// "Manajemen Kas", jadi orang yang menekan tautan dari luar tak punya
// konfirmasi bahwa ia sampai di tempat yang benar.
//
// Halaman anaknya sendiri tak bisa disuruh menyediakan judul: diukur, 4 dari 5
// halaman `/kas/*` dan `/keuangan/*` tak punya `<h1>` sama sekali. Menghapus
// judul layout akan meninggalkan mereka tanpa judul — cacat a11y yang lebih
// buruk daripada judul yang terlalu umum.
//
// ── Kenapa dari MENU, bukan daftar tulis-tangan
//
// `menu_items` sudah memuat label tiap route sejak migrasi 232, dan labelnya
// dijaga tetap satu-route-satu-link. Daftar tulis-tangan kedua akan menyimpang
// begitu satu label diubah — dan yang menyimpang tak akan berbunyi.
// ============================================================================

import { Suspense, useEffect, useMemo, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { muatMenu, menuDariCache } from "@/lib/muat-menu";
import { C } from "@/lib/warna-ui";
import { IkonMenu } from "@/lib/ikon-menu";

interface NodeMenu {
  key: string;
  label: string;
  href: string | null;
  /**
   * Nama ikon di DB. Sudah dikirim `/api/v1/menu` sejak awal — komponen ini
   * yang tak pernah membacanya, dan itulah kenapa 34 halaman di empat modul
   * terbesar tampil tanpa ikon judul sementara sidebar-nya bergambar.
   */
  icon?: string;
  children?: NodeMenu[];
}

export interface JudulBagianProps {
  /** Dipakai bila menu belum termuat atau route-nya tak ada di menu. */
  cadangan: string;
  /**
   * Kalimat penjelas di bawah judul.
   *
   * Sengaja OPSIONAL dan jarang diisi dari layout: keterangan modul ("Akun kas,
   * perpindahan dana, dan pengeluaran proyek") benar di halaman ringkasan tapi
   * MENYESATKAN di sub-halaman — ia menjanjikan isi yang tak ada di sana.
   * Halaman yang butuh penjelas menulisnya sendiri, di dekat isinya.
   */
  keterangan?: string;
  /** Elemen di sisi kanan (tombol aksi). */
  aksi?: React.ReactNode;
}

function ratakan(n: NodeMenu[]): NodeMenu[] {
  const hasil: NodeMenu[] = [];
  for (const x of n) {
    hasil.push(x);
    if (x.children?.length) hasil.push(...ratakan(x.children));
  }
  return hasil;
}

/**
 * Ikon yang pantas untuk sebuah node menu.
 *
 * Sub-menu ber-ikon `Dot` (seluruhnya, sejak migrasi 360) memakai ikon GRUP
 * INDUKNYA — sebuah titik di dalam ubin gradien 40px tak mengabarkan apa pun,
 * sementara lambang modulnya menjawab "saya masih di bagian mana?".
 *
 * Induk dicari lewat pohon menu, BUKAN dari segmen pertama URL: `/procurement/
 * stok` ada di bawah Pengadaan sedangkan `/gudang/lokasi` di bawah Gudang, dan
 * keduanya tak bisa dibedakan dari bentuk URL-nya.
 */
function ikonUntuk(akar: NodeMenu[], target: NodeMenu): string | null {
  if (target.icon && target.icon !== "Dot") return target.icon;

  const cari = (simpul: NodeMenu[], indukIkon: string | null): string | null => {
    for (const n of simpul) {
      if (n.key === target.key) return indukIkon;
      if (n.children?.length) {
        const k = cari(n.children, n.icon && n.icon !== "Dot" ? n.icon : indukIkon);
        if (k) return k;
      }
    }
    return null;
  };

  return cari(akar, null) ?? target.icon ?? null;
}

/**
 * Ubin ikon judul — BENTUKNYA HARUS SAMA PERSIS dengan `KepalaHalaman`.
 *
 * Dua komponen judul hidup di repo ini (`KepalaHalaman` untuk halaman yang
 * menggambar judulnya sendiri, komponen ini untuk halaman yang mewarisi judul
 * dari layout modulnya). Kalau ubinnya berbeda walau sedikit — 42px lawan
 * 40px, radius lain, gradien lain — perbedaannya tak terlihat saat menatap
 * satu halaman, dan langsung terasa saat BERPINDAH: seolah pindah aplikasi.
 * Itu persis cacat yang dilaporkan founder sebagai "iconnya belum konsisten".
 *
 * Nilai-nilainya disalin dari `dasar.tsx`; `uji-ubin-judul-seragam.mjs`
 * memerahkan CI bila keduanya menyimpang.
 *
 * `aria-hidden`: judul di sebelahnya sudah menyebut halamannya, jadi ikon ini
 * hanya menambah kebisingan bagi pembaca layar.
 */
function UbinIkon({ nama }: { nama: string | null }) {
  if (!nama) return null;
  return (
    <span
      data-ubin-ikon
      aria-hidden="true"
      style={{
        display: "grid", placeItems: "center", flexShrink: 0,
        width: 40, height: 40,
        borderRadius: "var(--rad-sedang)",
        background: "var(--grad-aksen)",
        color: "var(--on-aksen)",
        boxShadow: "var(--naik-1)",
      }}
    >
      <IkonMenu nama={nama} size={19} />
    </span>
  );
}

function JudulBagianIsi({ cadangan, keterangan, aksi }: JudulBagianProps) {
  const pathname = usePathname();
  const params = useSearchParams();
  const [menu, setMenu] = useState<NodeMenu[]>([]);

  useEffect(() => {
    /*
      Cache dulu supaya judul tak berkedip saat pindah halaman; jaringan
      menyusul lewat `muatMenu()` yang MENYATUKAN permintaan.

      Sebelum 2026-09-05 komponen ini memanggil `/api/v1/menu` sendiri, dan
      begitu pula `remah-halaman` — keduanya dirender bersamaan di tiap
      halaman dashboard. Diukur di produksi: 9 panggilan untuk 5 halaman,
      59,5 KB per panggilan, 536 KB untuk data yang identik.

      `queueMicrotask`, bukan `setMenu` langsung: setState SINKRON di dalam
      effect memicu render kedua sebelum yang pertama selesai
      (`react-hooks/set-state-in-effect`).
    */
    const dariCache = menuDariCache<NodeMenu>();
    if (dariCache) queueMicrotask(() => setMenu(dariCache));

    let batal = false;
    muatMenu<NodeMenu>()
      .then((daftar) => { if (!batal) setMenu(daftar); })
      .catch(() => { /* judul cadangan sudah cukup; jangan gagalkan halaman */ });
    return () => { batal = true; };
  }, []);

  // Satu pencarian menghasilkan judul DAN ikon — keduanya dari baris menu yang
  // sama. Kalau ikonnya dicari terpisah, kedua pencarian bisa mendarat di baris
  // berbeda saat query berubah, dan halamannya menampilkan judul satu menu
  // dengan ikon menu lain. Tak ada galat; hanya salah.
  const { judul, ikon: NamaIkon } = useMemo(() => {
    const rata = ratakan(menu).filter((n) => n.href);
    const kueri = params?.toString();
    const penuh = kueri ? `${pathname}?${kueri}` : pathname;

    // Cocok PERSIS dulu (termasuk query — sub-menu tab dibedakan olehnya),
    // baru cocok tanpa query.
    const node = rata.find((n) => n.href === penuh)
      ?? rata.find((n) => n.href === pathname);

    return {
      judul: node?.label ?? cadangan,
      /*
        SELURUH sub-menu ber-ikon `Dot` sejak migrasi 360 — seragam dengan
        sengaja. Ubin gradien 40px berisi satu titik kecil adalah ubin kosong
        yang mahal, jadi untuk `Dot` ikon INDUKNYA yang dipakai: pembaca
        melihat lambang modul yang sedang ia buka ("ini masih di Pengadaan"),
        bukan titik yang tak mengabarkan apa pun.

        `ikonGrupUntuk` mencari induk di pohon menu, bukan menebak dari
        segmen pertama URL — `/procurement/stok` ada di bawah grup Pengadaan
        sementara `/gudang/lokasi` ada di bawah Gudang, dan URL tak
        membedakan keduanya.
      */
      ikon: node ? ikonUntuk(menu, node) : null,
    };
  }, [menu, pathname, params, cadangan]);

  return (
    <div className="rise" style={{
      display: "flex", justifyContent: "space-between", alignItems: "flex-start",
      gap: 12, flexWrap: "wrap", marginBottom: "var(--gap-bagian)",
    }}>
      <div style={{ display: "flex", alignItems: "flex-start", gap: "var(--r3)", minWidth: 0 }}>
        <UbinIkon nama={NamaIkon} />
      <div style={{ minWidth: 0 }}>
        <h1 style={{
          fontFamily: "var(--font-display)",
          // `--t-halaman` (26px), BUKAN 20px dipaku.
          //
          // Diukur di peramban 2026-08-12 menyapu seluruh rute dashboard:
          // `<h1>` tersebar di lima ukuran, dua kelompok besar 26px (x67,
          // lewat `KepalaHalaman`) dan 20px (x39, lewat komponen ini). Dua
          // konvensi hidup berdampingan untuk elemen yang sama.
          //
          // Akibatnya terlihat saat BERPINDAH halaman, bukan saat menatap
          // satu halaman -- dan itu sebabnya ia bertahan lama: tiap halaman
          // terlihat wajar sendirian. Judul yang mengecil membuat halamannya
          // terasa seperti sub-halaman dari yang barusan ditinggalkan.
          fontSize: "var(--t-halaman)", fontWeight: 700,
          letterSpacing: "-0.02em", lineHeight: 1.15,
          color: C.text, margin: 0,
        }}>
          {judul}
        </h1>
        {keterangan && (
          <p style={{ fontSize: 13, color: C.mid, margin: "6px 0 0", maxWidth: "70ch", lineHeight: 1.55 }}>
            {keterangan}
          </p>
        )}
      </div>
      </div>
      {aksi && <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>{aksi}</div>}
    </div>
  );
}

/**
 * Batas Suspense DITANGGUNG KOMPONEN, bukan diserahkan ke pemanggil.
 *
 * `JudulBagianIsi` memanggil `useSearchParams()` — sub-menu tab dibedakan
 * query (migrasi 233) — dan Next 16 menolak prerender halaman mana pun yang
 * memuatnya tanpa batas Suspense.
 *
 * Kalau batas itu diserahkan ke pemanggil, ia akan terlupa: diukur 2026-08-08,
 * KELIMA pemanggil melupakannya, dan empat di antaranya `layout.tsx` — jadi
 * satu kelupaan menjatuhkan seluruh cabang halaman di bawahnya. Galatnya pun
 * muncul di halaman yang kebetulan diprerender lebih dulu, bukan di berkas
 * yang bersalah, sehingga penyebabnya sulit ditemukan.
 *
 * Pola yang sama sudah dipakai `Tabel`/`Kosong` di `dasar.tsx`: keadaan yang
 * mudah terlupa ditangani DI DALAM komponen, karena "separuh halaman akan
 * lupa" bukan kemungkinan melainkan hasil pengukuran.
 *
 * Fallback memakai `cadangan` — judul yang sudah wajib diisi pemanggil — jadi
 * tak ada kedipan kosong dan tinggi barisnya tetap sama.
 */
export function JudulBagian(props: JudulBagianProps) {
  return (
    <Suspense fallback={<JudulBagianRangka {...props} />}>
      <JudulBagianIsi {...props} />
    </Suspense>
  );
}

/**
 * Bentuk yang sama persis, memakai judul cadangan — nol pergeseran tata letak.
 *
 * Ubinnya ikut dilukis sebagai KOTAK KOSONG ber-radius sama, bukan dihilangkan:
 * ikonnya belum diketahui sebelum menu termuat, dan menunda seluruh ubin
 * membuat judul melompat 52px ke kanan begitu menu tiba. Ruang yang dipesan
 * lebih baik daripada ruang yang mendadak muncul (Core Web Vitals: CLS).
 */
function JudulBagianRangka({ cadangan, keterangan, aksi }: JudulBagianProps) {
  return (
    <div style={{
      display: "flex", justifyContent: "space-between", alignItems: "flex-start",
      gap: 12, flexWrap: "wrap", marginBottom: "var(--gap-bagian)",
    }}>
      <div style={{ display: "flex", alignItems: "flex-start", gap: "var(--r3)", minWidth: 0 }}>
      <span aria-hidden="true" style={{
        flexShrink: 0, width: 40, height: 40,
        borderRadius: "var(--rad-sedang)", background: "var(--grad-aksen)",
        opacity: 0.35, boxShadow: "var(--naik-1)",
      }} />
      <div style={{ minWidth: 0 }}>
        <h1 style={{
          fontFamily: "var(--font-display)",
          // `--t-halaman` (26px), BUKAN 20px dipaku.
          //
          // Diukur di peramban 2026-08-12 menyapu seluruh rute dashboard:
          // `<h1>` tersebar di lima ukuran, dua kelompok besar 26px (x67,
          // lewat `KepalaHalaman`) dan 20px (x39, lewat komponen ini). Dua
          // konvensi hidup berdampingan untuk elemen yang sama.
          //
          // Akibatnya terlihat saat BERPINDAH halaman, bukan saat menatap
          // satu halaman -- dan itu sebabnya ia bertahan lama: tiap halaman
          // terlihat wajar sendirian. Judul yang mengecil membuat halamannya
          // terasa seperti sub-halaman dari yang barusan ditinggalkan.
          fontSize: "var(--t-halaman)", fontWeight: 700,
          letterSpacing: "-0.02em", lineHeight: 1.15,
          color: C.text, margin: 0,
        }}>
          {cadangan}
        </h1>
        {keterangan && (
          <p style={{ fontSize: 13, color: C.mid, margin: "6px 0 0", maxWidth: "70ch", lineHeight: 1.55 }}>
            {keterangan}
          </p>
        )}
      </div>
      </div>
      {aksi && <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>{aksi}</div>}
    </div>
  );
}
