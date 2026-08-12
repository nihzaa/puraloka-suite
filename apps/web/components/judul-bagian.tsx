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
import { api, MENU_CACHE_KEY } from "@/lib/api";
import { C } from "@/lib/warna-ui";

interface NodeMenu {
  key: string;
  label: string;
  href: string | null;
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

function JudulBagianIsi({ cadangan, keterangan, aksi }: JudulBagianProps) {
  const pathname = usePathname();
  const params = useSearchParams();
  const [menu, setMenu] = useState<NodeMenu[]>([]);

  useEffect(() => {
    // Cache dulu supaya judul tak berkedip saat pindah halaman; jaringan
    // menyusul dan memperbaruinya bila berubah.
    try {
      const c = localStorage.getItem(MENU_CACHE_KEY);
      if (c) setMenu(JSON.parse(c) as NodeMenu[]);
    } catch { /* cache rusak bukan alasan halaman gagal */ }

    let batal = false;
    api.get<NodeMenu[] | { menu: NodeMenu[] }>("/api/v1/menu")
      .then(({ data }) => {
        if (batal) return;
        setMenu(Array.isArray(data) ? data : (data.menu ?? []));
      })
      .catch(() => { /* judul cadangan sudah cukup; jangan gagalkan halaman */ });
    return () => { batal = true; };
  }, []);

  const judul = useMemo(() => {
    const rata = ratakan(menu).filter((n) => n.href);
    const kueri = params?.toString();
    const penuh = kueri ? `${pathname}?${kueri}` : pathname;

    // Cocok PERSIS dulu (termasuk query — sub-menu tab dibedakan olehnya),
    // baru cocok tanpa query.
    return rata.find((n) => n.href === penuh)?.label
      ?? rata.find((n) => n.href === pathname)?.label
      ?? cadangan;
  }, [menu, pathname, params, cadangan]);

  return (
    <div className="rise" style={{
      display: "flex", justifyContent: "space-between", alignItems: "flex-start",
      gap: 12, flexWrap: "wrap", marginBottom: "var(--gap-bagian)",
    }}>
      <div>
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

/** Bentuk yang sama persis, memakai judul cadangan — nol pergeseran tata letak. */
function JudulBagianRangka({ cadangan, keterangan, aksi }: JudulBagianProps) {
  return (
    <div style={{
      display: "flex", justifyContent: "space-between", alignItems: "flex-start",
      gap: 12, flexWrap: "wrap", marginBottom: "var(--gap-bagian)",
    }}>
      <div>
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
      {aksi && <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>{aksi}</div>}
    </div>
  );
}
