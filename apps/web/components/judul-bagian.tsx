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

import { useEffect, useMemo, useState } from "react";
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

export function JudulBagian({ cadangan, keterangan, aksi }: JudulBagianProps) {
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
          fontFamily: "var(--font-display)", fontSize: 20, fontWeight: 700,
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
