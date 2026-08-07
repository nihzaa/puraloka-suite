"use client";

// ============================================================================
// TAB DI DALAM SATU HALAMAN — dipakai halaman yang memuat beberapa modul.
//
// ══════════════════════════════════════════════════════════════════════════
// KENAPA KOMPONEN INI ADA
// ══════════════════════════════════════════════════════════════════════════
//
// Lima halaman menampung beberapa modul sekaligus, bertumpuk ke bawah tanpa
// pemisah yang bisa ditunjuk:
//
//     /dokumen/kendali       register gambar · transmittal · notulen · jadwal
//     /kepatuhan             kesiapan · izin kerja · dokumen · evaluasi subkon
//     /aset/operasional      perawatan · seluruh alat
//     /procurement/lanjutan  kontrak payung · expediting · nota kredit
//     /jadwal                sumber daya · pekerjaan & kelonggaran · method
//
// Akibatnya 18 item menu menunjuk kelimanya, dan semuanya mendarat di puncak
// halaman. Yang mengklik "Notulen Rapat" harus menggulir melewati register
// gambar dan transmittal untuk menemukannya — kalau ia tahu harus menggulir.
//
// ── Kenapa tab, bukan memecah jadi lima halaman
//
// Modul-modul itu SALING DIBACA BERSAMA. Orang yang memeriksa transmittal
// biasanya juga memeriksa register gambar yang dikirimnya; yang membuka izin
// kerja juga melihat kesiapan pihaknya. Memecahnya jadi halaman terpisah
// memaksa bolak-balik, dan KPI di puncak halaman kehilangan gunanya karena ia
// meringkas seluruh modul.
//
// Tab memberi keduanya: satu tempat, tapi tiap modul punya alamat sendiri.
//
// ── Berbeda dari `nav-bagian.tsx`
//
// `NavBagian` berpindah HALAMAN (tiap tab punya route sendiri). Yang ini
// berpindah BAGIAN di dalam satu halaman — datanya sudah dimuat sekaligus,
// jadi berpindah tab tak menunggu jaringan.
//
// ── Aksesibilitas
//
// `role="tablist"` + `role="tab"` + `aria-selected` adalah satu paket: memakai
// `role="tab"` tanpa induk `tablist` melanggar ARIA, dan axe-core melaporkannya
// sebagai pelanggaran CRITICAL. Itu bukan hipotesis — terjadi pada 2026-08-07
// di `/laporan` (9 pelanggaran) dan `/estimasi` (6).
//
// Tab aktif juga ditandai warna DAN tebal huruf DAN garis bawah, bukan warna
// saja (WCAG 1.4.1).
// ============================================================================

import { C } from "@/lib/warna-ui";

export interface BagianTab<T extends string> {
  kunci: T;
  label: string;
  /** Angka kecil di sebelah label — mis. jumlah baris yang menuntut tindakan. */
  jumlah?: number;
  /** `true` bila angkanya perlu ditandai merah, bukan abu. */
  mendesak?: boolean;
}

export interface TabBagianProps<T extends string> {
  bagian: readonly BagianTab<T>[];
  aktif: T;
  onPilih: (k: T) => void;
  /** Dibaca pembaca layar sebagai nama kelompok tabnya. */
  label: string;
}

export function TabBagian<T extends string>({
  bagian, aktif, onPilih, label,
}: TabBagianProps<T>) {
  return (
    <div
      role="tablist"
      aria-label={label}
      style={{
        display: "flex", gap: 4, flexWrap: "wrap",
        borderBottom: `1px solid ${C.border}`,
        marginBottom: "var(--gap-bagian)",
      }}
    >
      {bagian.map((b) => {
        const ini = b.kunci === aktif;
        return (
          <button
            key={b.kunci}
            type="button"
            role="tab"
            aria-selected={ini}
            data-tab={b.kunci}
            onClick={() => onPilih(b.kunci)}
            style={{
              display: "inline-flex", alignItems: "center", gap: 6,
              padding: "8px 14px", fontSize: 13, fontFamily: "inherit",
              // Tiga penanda sekaligus, bukan warna saja (WCAG 1.4.1).
              fontWeight: ini ? 700 : 500,
              color: ini ? C.navy : C.mid,
              background: "none", border: "none",
              borderBottom: ini ? `2px solid ${C.navy}` : "2px solid transparent",
              marginBottom: -1, cursor: "pointer", whiteSpace: "nowrap",
            }}
          >
            {b.label}
            {b.jumlah !== undefined && b.jumlah > 0 && (
              <span
                style={{
                  fontSize: 11, fontWeight: 700, padding: "1px 6px",
                  borderRadius: 999, lineHeight: 1.6,
                  color: b.mendesak ? "var(--danger)" : C.mid,
                  background: b.mendesak ? "var(--danger-bg)" : "var(--surface-subtle)",
                  border: `1px solid ${b.mendesak ? "var(--danger-border)" : C.border}`,
                }}
              >
                {b.jumlah}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
