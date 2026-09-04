"use client";

/**
 * SAKLAR — hidup/mati, satu pilihan.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * KENAPA ADA, DAN KENAPA BUKAN KARTU
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Founder 2026-08-15: *"untuk checkbox yg kaya gini juga ubah aja, jadinya
 * bikin ga konsisten"*.
 *
 * Diukur: **25 checkbox di 21 berkas**. Tapi keduanya BUKAN satu hal:
 *
 *   3  daftar pilihan   "data yang boleh dibaca", dependensi Gantt, jenis arus
 *   22 saklar tunggal   "Terapkan Potongan Retensi", "Aktifkan jadwal ini"
 *
 * Yang pertama jadi `PilihanKartu` — memang daftar, memang perlu dibandingkan
 * berdampingan. Yang kedua TIDAK: menjadikan "Terapkan Potongan Retensi"
 * sebuah kartu berarti kotak besar untuk satu ya/tidak, di form yang sudah
 * padat, sebagian di dalam modal sempit. Seragam di mata, salah di tempatnya.
 *
 * Founder memilih dua bentuk resmi: **kartu untuk memilih dari daftar, saklar
 * untuk hidup/mati.** Berkas ini yang kedua.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * `role="switch"`, BUKAN checkbox yang dicat
 * ══════════════════════════════════════════════════════════════════════════
 *
 * `<input type="checkbox">` tetap dipakai sebagai mesinnya — ia sudah membawa
 * fokus keyboard, Space untuk mengubah, dan pengumuman keadaan. Yang ditambah
 * `role="switch"`, karena pembaca layar mengumumkannya berbeda:
 *
 *   checkbox → "kotak centang, tercentang"      (…tercentang untuk apa?)
 *   switch   → "sakelar, nyala"                  (jelas: sesuatu sedang nyala)
 *
 * Bedanya kecil di layar dan besar di telinga. `a11y-audit` menyebutnya wajib.
 *
 * Penandanya TIGA sekaligus — posisi bulatan, warna jalur, dan teks
 * "nyala/mati" opsional. WCAG 1.4.1: warna tak boleh jadi satu-satunya
 * pembeda, dan sebagian pengguna aplikasi ini memakai layar lama dengan
 * kontras rendah.
 */

import type { ReactNode } from "react";
import { C } from "@/lib/warna-ui";

export function Saklar({
  nyala,
  onUbah,
  label,
  ringkas,
  nonaktif = false,
  id,
}: {
  nyala: boolean;
  onUbah: (nyala: boolean) => void;
  label: ReactNode;
  /** Satu kalimat di bawah label. */
  ringkas?: ReactNode;
  nonaktif?: boolean;
  id?: string;
}) {
  return (
    <label
      style={{
        display: "flex",
        alignItems: "flex-start",
        gap: 10,
        cursor: nonaktif ? "default" : "pointer",
        opacity: nonaktif ? 0.6 : 1,
        minWidth: 0,
      }}
    >
      <span
        style={{
          position: "relative",
          flexShrink: 0,
          width: 34,
          height: 20,
          marginTop: 1,
        }}
      >
        <input
          id={id}
          type="checkbox"
          role="switch"
          checked={nyala}
          disabled={nonaktif}
          onChange={(e) => onUbah(e.target.checked)}
          // Disembunyikan SECARA VISUAL saja — `display:none` akan
          // mengeluarkannya dari urutan Tab, dan saklar yang tak bisa di-Tab
          // adalah saklar yang tak ada bagi sebagian orang.
          style={{
            position: "absolute",
            inset: 0,
            width: "100%",
            height: "100%",
            margin: 0,
            opacity: 0,
            cursor: "inherit",
          }}
        />
        {/* Jalur */}
        <span
          aria-hidden
          style={{
            position: "absolute",
            inset: 0,
            borderRadius: 999,
            background: nyala ? C.navy : "var(--border)",
            transition: "background .15s",
          }}
        />
        {/* Bulatan — POSISINYA yang jadi penanda kedua, bukan warna saja. */}
        <span
          aria-hidden
          style={{
            position: "absolute",
            top: 3,
            left: nyala ? 17 : 3,
            width: 14,
            height: 14,
            borderRadius: 999,
            background: "var(--surface)",
            transition: "left .15s",
            boxShadow: "0 1px 2px rgba(0,0,0,.2)",
          }}
        />
      </span>

      <span style={{ minWidth: 0 }}>
        <span style={{ display: "block", fontSize: 13, fontWeight: 600, color: C.text, lineHeight: 1.4 }}>
          {label}
        </span>
        {ringkas ? (
          <span style={{ display: "block", fontSize: "var(--t-kecil)", color: C.muted, lineHeight: 1.5, marginTop: 2 }}>
            {ringkas}
          </span>
        ) : null}
      </span>
    </label>
  );
}
