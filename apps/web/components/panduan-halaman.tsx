"use client";

/**
 * PANDUAN HALAMAN — menjawab "saya di mana, dan saya harus apa?" sebelum
 * pengguna menyentuh satu kontrol pun.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * KENAPA ADA
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Founder 2026-08-13, tentang seluruh grup AI & Otomasi:
 *
 *   "di tiap halaman itu kayak asing dan menerka nerka cara pake nya, dan
 *    tulisan dan ui nya kurang berasa intuitif"
 *
 * Diukur dari tangkapan layar tiap halaman, dan sebabnya sama di semuanya:
 * **halaman dibuka langsung dengan kontrol.** "Instruksi tambahan" berupa
 * textarea kosong. "Batas biaya per bulan" berupa input kosong. Tabel plafon
 * berisi 20 baris "belum diatur".
 *
 * Tiap kontrolnya sudah punya kalimat penjelas — tetapi penjelas itu ada DI
 * BAWAH kontrolnya, dan menjawab "kotak ini apa", bukan "halaman ini untuk
 * apa dan saya mulai dari mana". Orang yang belum tahu maksud halamannya
 * membaca lima penjelasan terpisah lalu menyusun sendiri gambaran besarnya.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * TIGA PERTANYAAN, DIJAWAB SEBELUM KONTROL PERTAMA
 * ══════════════════════════════════════════════════════════════════════════
 *
 *   `untuk`     apa yang halaman ini kerjakan, dalam satu kalimat kerja
 *   `langkah`   urutan yang harus dilalui — mana dulu, mana menunggu
 *   `catatan`   batas atau syarat yang mengejutkan kalau baru diketahui
 *               SESUDAH mengisi
 *
 * `langkah` yang membuat bedanya paling besar. Tanpa urutan yang terlihat,
 * halaman berisi enam kontrol terbaca sebagai enam keputusan sejajar — dan
 * pengguna mengisi yang paling atas lebih dulu, meski itu yang paling
 * bergantung pada yang lain.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * KENAPA BUKAN KARTU BERBINGKAI SEPERTI YANG LAIN
 * ══════════════════════════════════════════════════════════════════════════
 *
 * `craft-floor` menolak "kartu seukuran sama berisi ikon + judul + teks
 * sebagai struktur halaman" — dan halaman ini sudah punya kartu untuk tiap
 * bagian pengaturan. Menambah satu kartu lagi di atas membuat panduan
 * terlihat setara dengan pengaturan, padahal ia PEMBUKA.
 *
 * Jadi bentuknya prosa dengan garis tepi tipis, bukan kotak: ia terbaca
 * sebagai kalimat pengantar, dan bobot visualnya lebih ringan daripada kartu
 * yang harus ditindaklanjuti.
 *
 * ⚠ `ARAH-VISUAL-2026` §3d: satu aksen per layar, dan aksennya NAVY. Panduan
 * ini tak memperkenalkan warna baru — nomor langkahnya memakai permukaan
 * netral, bukan lencana berwarna.
 */

import type { ReactNode } from "react";
import { C } from "@/lib/warna-ui";

export interface Langkah {
  /** Kalimat kerja: "Isi kunci API", bukan "Kunci API". */
  teks: ReactNode;
  /**
   * Sudah beres? Menampilkan centang alih-alih nomor.
   *
   * Boleh `undefined` untuk langkah yang tak bisa diukur otomatis — lebih
   * jujur daripada menebak, dan lebih baik daripada centang yang salah.
   */
  selesai?: boolean;
}

export function PanduanHalaman({
  untuk,
  langkah,
  catatan,
}: {
  untuk: ReactNode;
  langkah?: Langkah[];
  catatan?: ReactNode;
}) {
  return (
    <section
      aria-label="Panduan halaman"
      style={{
        /*
          Jarak ATAS ikut disetel, tidak hanya bawah.

          Diukur di layar (halaman Alur Otomasi): tanpa `marginTop`, panduan
          menempel persis di bawah keterangan judul dan garis tepinya tak
          terlihat — hasilnya terbaca sebagai paragraf lanjutan judul, bukan
          blok tersendiri. Halaman lain kebetulan aman karena induknya
          memakai `grid gap`; yang tidak memakainya jadi rusak diam-diam.

          Menyetel keduanya di komponen membuat panduan berperilaku sama di
          halaman mana pun ia dipasang — tak bergantung pada kebetulan tata
          letak induknya.
        */
        marginTop: "var(--gap-bagian)",
        marginBottom: "var(--gap-bagian)",
        paddingLeft: 14,
        // Tetap 1px: garis tepi tebal berwarna adalah hiasan yang menyamar
        // jadi struktur. Pemisahannya datang dari JARAK, bukan dari garis
        // yang lebih tebal.
        borderLeft: `1px solid ${C.border}`,
      }}
    >
      <p style={{ margin: 0, fontSize: 13.5, color: C.text, lineHeight: 1.65, maxWidth: "68ch" }}>
        {untuk}
      </p>

      {langkah && langkah.length > 0 && (
        // `<ol>` sungguhan, bukan div bernomor: urutan ini INFORMASI, dan
        // pembaca layar harus mendengarnya sebagai daftar berurutan.
        <ol
          style={{
            listStyle: "none",
            margin: "12px 0 0",
            padding: 0,
            display: "flex",
            flexDirection: "column",
            gap: 7,
          }}
        >
          {langkah.map((l, i) => (
            <li
              key={i}
              style={{
                display: "flex",
                alignItems: "flex-start",
                gap: 9,
                fontSize: 12.5,
                color: l.selesai ? C.muted : C.text,
                lineHeight: 1.55,
                maxWidth: "66ch",
              }}
            >
              <span
                aria-hidden="true"
                style={{
                  flexShrink: 0,
                  width: 18,
                  height: 18,
                  marginTop: 1,
                  borderRadius: "50%",
                  display: "grid",
                  placeItems: "center",
                  fontSize: 10.5,
                  fontWeight: 700,
                  background: l.selesai ? "var(--success-bg)" : "var(--surface-subtle)",
                  color: l.selesai ? "var(--success)" : C.mid,
                  border: `1px solid ${l.selesai ? "var(--success)" : C.border}`,
                }}
              >
                {l.selesai ? "✓" : i + 1}
              </span>
              {/*
                Status ikut ditulis untuk pembaca layar — lencana centang saja
                tak terbaca, dan pengguna yang memakainya akan mendengar
                langkah yang sudah beres persis sama dengan yang belum.
              */}
              <span>
                {l.selesai && <span className="sr-only">Sudah beres: </span>}
                {l.teks}
              </span>
            </li>
          ))}
        </ol>
      )}

      {catatan && (
        <p
          style={{
            margin: "12px 0 0",
            fontSize: 12,
            color: C.muted,
            lineHeight: 1.6,
            maxWidth: "68ch",
          }}
        >
          {catatan}
        </p>
      )}
    </section>
  );
}
