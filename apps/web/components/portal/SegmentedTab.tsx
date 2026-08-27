"use client";

/**
 * TAB SEGMEN PORTAL — `role="tablist"` yang muat di layar 390px.
 *
 * ── Mode `melipat` (ditambahkan 2026-08-27)
 *
 * Bawaannya tiap opsi `flex: 1` — sama lebar, satu baris. Itu benar untuk
 * 2-3 opsi pendek, dan SALAH begitu labelnya panjang: empat opsi termasuk
 * "Neraca & Laba-Rugi" akan berbagi lebar sama rata dan terpotong di 360px.
 *
 * Karena itu empat halaman (`gl` dan `pengadaan-lanjutan` di dua portal)
 * menulis `role="tab"` sendiri, lengkap dengan komentar yang menjelaskan
 * alasannya. Alasannya sah — yang salah adalah komponen ini tak menyediakan
 * jalannya.
 *
 * `melipat` membuat opsi memakai lebar isinya dan membungkus ke baris
 * berikutnya bila perlu. OPT-IN, jadi 114 pemakaian yang sudah ada tak
 * berubah sedikit pun.
 */
export interface SegmentedTabProps {
  opsi: Array<{ value: string; label: string }>;
  aktif: string;
  onUbah: (value: string) => void;
  /**
   * Opsi memakai lebar isinya dan boleh melipat ke baris berikutnya.
   *
   * Pakai bila opsinya banyak ATAU labelnya panjang. Tanpa ini, label
   * panjang terpotong di layar sempit — dan terpotongnya diam, tak ada
   * yang memberi tahu.
   */
  melipat?: boolean;
}

export default function SegmentedTab({ opsi, aktif, onUbah, melipat = false }: SegmentedTabProps) {
  return (
    <div
      role="tablist"
      style={{
        display: "flex",
        gap: melipat ? 6 : 2,
        padding: 4,
        background: "var(--surface-subtle)",
        /*
          Sudut pil hanya benar untuk satu baris. Begitu ia melipat, pil
          raksasa membungkus dua baris terlihat seperti wadah yang salah —
          radius kartu yang tepat di situ.
        */
        borderRadius: melipat ? 14 : "var(--portal-radius-pill)",
        flexWrap: melipat ? "wrap" : "nowrap",
      }}
    >
      {opsi.map((o) => {
        const isAktif = o.value === aktif;
        return (
          <button
            key={o.value}
            type="button"
            role="tab"
            aria-selected={isAktif}
            onClick={() => onUbah(o.value)}
            style={{
              /*
                `flex: 1` membagi lebar SAMA RATA — benar untuk label pendek,
                dan memotong label panjang tanpa gejala. Saat `melipat`,
                tombol memakai lebar isinya.
              */
              flex: melipat ? "0 0 auto" : 1,
              minHeight: 44,
              padding: "8px 12px",
              borderRadius: "var(--portal-radius-pill)",
              border: "none",
              cursor: "pointer",
              background: isAktif ? "var(--navy)" : "transparent",
              color: isAktif ? "var(--on-navy)" : "var(--text-secondary)",
              fontSize: 13,
              fontWeight: isAktif ? 700 : 500,
              transition: "background 150ms ease, color 150ms ease",
            }}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
