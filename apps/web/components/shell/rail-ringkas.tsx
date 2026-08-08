"use client";

/**
 * KARTU RINGKAS RAIL — satu baris, bukan daftar.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * KENAPA ADA BENTUK KEDUA DI RAIL
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Founder 2026-08-09: *"soal peringatan krisis dan perlu keputusan itu bikin
 * 1 baris aja, gausah kasih detail isinya apa aja nya"*.
 *
 * Rail selebar 300px, dan dua kartu itu sebelumnya masing-masing memuat 3–5
 * baris terurai. Hasilnya kolom yang penuh sebelum kalender muncul — padahal
 * keduanya menjawab pertanyaan yang sama pendeknya: **ada berapa, dan ke mana
 * saya klik.** Rinciannya sudah tersedia di dua tempat lain: kartu "Peringatan
 * Kritis" di kolom tengah, dan halaman tujuan masing-masing.
 *
 * Jadi pembagiannya sekarang:
 *
 *   `KartuRail`     kartu rail yang memang berisi daftar (kalender, progres)
 *   `RailRingkas`   kartu rail yang cuma perlu menyampaikan SATU angka
 *
 * ── Kenapa satu komponen, bukan dua kartu yang kebetulan mirip
 *
 * "Peringatan kritis" dan "Perlu keputusan" bersebelahan di rail. Kalau
 * keduanya menyusun tampilannya sendiri, perbedaan sekecil dua piksel padding
 * akan terbaca sebagai dua kartu dari sistem berbeda — persis alasan
 * `KartuRail` ada.
 *
 * ── Keadaan nol tetap ditampilkan
 *
 * Nol adalah kabar baik dan harus terlihat begitu; kartu yang menghilang saat
 * kosong membuat orang bertanya apakah ia rusak. Aturan yang sama sudah
 * dipakai `SidebarFokus`, `RailFokus`, dan `KartuRail`.
 */

import type { ReactNode } from "react";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { C } from "@/lib/warna-ui";

export function RailRingkas({
  judul,
  jumlah,
  satuan,
  href,
  nada = "normal",
  ikon,
  kosong,
}: {
  judul: string;
  /** Angka utama. `0` DITAMPILKAN, bukan disembunyikan — lihat catatan di atas. */
  jumlah: number;
  /** Kata di belakang angka, mis. "hal mendesak". Bentuk tunggal/jamak sama di ID. */
  satuan: string;
  href: string;
  /** `bahaya` hanya bila benar-benar mendesak — kalau semua merah, tak ada yang merah. */
  nada?: "normal" | "bahaya";
  ikon?: ReactNode;
  /** Kalimat saat `jumlah` nol. Wajib: "0" telanjang tak memberi tahu apa-apa. */
  kosong: string;
}) {
  const adaIsi = jumlah > 0;
  const warna = adaIsi && nada === "bahaya" ? "var(--danger)" : C.text;

  return (
    <section
      style={{
        background: "var(--surface)",
        border: "1px solid var(--border)",
        borderRadius: "var(--rad-besar)",
        overflow: "hidden",
        flexShrink: 0,
      }}
    >
      <Link
        href={href}
        style={{
          display: "flex", alignItems: "center", gap: 10,
          padding: "var(--pad-kartu)", textDecoration: "none",
          transition: "background 150ms ease",
        }}
        onMouseEnter={(e) => { e.currentTarget.style.background = "var(--surface-hover)"; }}
        onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
      >
        {ikon && (
          <span
            aria-hidden="true"
            style={{
              display: "grid", placeItems: "center", flexShrink: 0,
              width: 30, height: 30, borderRadius: "var(--rad-kecil)",
              /*
                Latar ikon mengikuti nada, tetapi TEKSNYA tidak selalu:
                latar redup + ikon berwarna aman di kedua mode, sedangkan
                angka besar berwarna merah pada nol akan berbohong.
              */
              background: adaIsi && nada === "bahaya" ? "var(--danger-bg)" : "var(--navy-light)",
              color: adaIsi && nada === "bahaya" ? "var(--danger)" : "var(--navy)",
            }}
          >
            {ikon}
          </span>
        )}

        <span style={{ flex: 1, minWidth: 0 }}>
          <span style={{
            display: "block", fontSize: 11, fontWeight: 700,
            letterSpacing: ".04em", textTransform: "uppercase", color: C.mid,
          }}>
            {judul}
          </span>
          <span style={{
            display: "block", marginTop: 2,
            fontSize: "var(--t-badan)", color: C.text, lineHeight: 1.35,
            overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
          }}>
            {adaIsi ? (
              <>
                <strong style={{
                  fontWeight: 700, color: warna,
                  fontVariantNumeric: "tabular-nums",
                }}>
                  {jumlah}
                </strong>
                {" "}{satuan}
              </>
            ) : kosong}
          </span>
        </span>

        <ChevronRight size={14} color={C.mid} aria-hidden="true" style={{ flexShrink: 0 }} />
      </Link>
    </section>
  );
}
