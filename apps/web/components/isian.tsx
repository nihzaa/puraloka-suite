"use client";

/**
 * ISIAN — kosakata form bersama.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * KENAPA ADA
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Diukur 2026-08-11: **16 halaman mendefinisikan `inputStyle` sendiri**, dengan
 * **11 bentuk berbeda**, dan tak satu pun komponen input bersama di repo ini.
 * Empat di antaranya bahkan tak punya penanda fokus sama sekali.
 *
 * Pola yang sama sudah ditemukan tiga kali hari ini — 27 varian `<h1>` (UIR-2),
 * 8 bentuk kartu (K-2), 4 gaya tab (`audit-tab-seragam`). Tiap kali sebabnya
 * sama: halaman ditulis pada waktu berbeda dan menyalin dari tetangga
 * terdekat, dan tak ada satu pun yang salah saat ditulis.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * DUA HAL YANG DIPERBAIKI, BUKAN SEKADAR DISERAGAMKAN
 * ══════════════════════════════════════════════════════════════════════════
 *
 * 1. RADIUS. Seluruh varian memakai 6px, sementara kartu pembungkusnya 14px.
 *    Kontrol yang jauh lebih tajam dari wadahnya terlihat seperti ditempel,
 *    bukan bagian dari kartunya — dan itu yang membuat halaman terasa "tidak
 *    menyatu" tanpa bisa ditunjuk apa salahnya. Sekarang `--radius-sm` (10px),
 *    seukuran kontrol tetapi sekeluarga dengan kartunya.
 *
 * 2. FOKUS. Kebanyakan varian hanya `outline: none` — fokus keyboard HILANG
 *    sepenuhnya. Orang yang menavigasi dengan Tab tak tahu di mana ia berada.
 *    Ini bukan soal selera; `a11y-audit` menyebutnya wajib, dan pengguna
 *    berperangkat lama justru yang paling sering memakai keyboard.
 *
 * Bentuknya mengikuti `settings/page.tsx` TJS yang founder tunjuk: label kecil
 * tebal DI ATAS kotak, kotak ber-radius, cincin fokus bernada aksen.
 */

import type { CSSProperties, ReactNode } from "react";
import { C } from "@/lib/warna-ui";
import { Pilihan, type PropsPilihan } from "@/components/pilihan";

/**
 * Gaya dasar kotak isian. Diekspor supaya `<select>` dan `<textarea>` yang
 * belum punya pembungkusnya sendiri tetap seragam tanpa menyalin nilainya.
 */
export const GAYA_ISIAN: CSSProperties = {
  width: "100%",
  padding: "var(--pad-baris)",
  border: `1px solid ${C.border}`,
  // 10px — sekeluarga dengan kartu (14px), bukan 6px yang terlihat ditempel.
  borderRadius: "var(--radius-sm)",
  fontSize: 13,
  background: "var(--surface)",
  color: C.text,
  boxSizing: "border-box",
  fontFamily: "inherit",
};

/**
 * Satu baris form: label + kotak + bantuan/galat.
 *
 * `label` WAJIB dan selalu tersambung lewat `htmlFor`. Placeholder yang
 * dipakai sebagai pengganti label hilang begitu orang mulai mengetik — dan
 * yang lupa isian itu untuk apa tak punya cara mengingatnya kembali.
 */
export function Isian({
  id,
  label,
  bantuan,
  galat,
  wajib,
  children,
}: {
  id: string;
  label: string;
  /** Kalimat penjelas di bawah kotak. Sebutkan BENTUK yang diterima. */
  bantuan?: ReactNode;
  /** Pesan galat. Menggantikan `bantuan` saat ada — bukan menumpuknya. */
  galat?: string | null;
  wajib?: boolean;
  children: ReactNode;
}) {
  return (
    <div style={{ display: "grid", gap: 5 }}>
      <label
        htmlFor={id}
        style={{ fontSize: 12, fontWeight: 600, color: C.text }}
      >
        {label}
        {wajib && (
          <span aria-hidden style={{ color: C.danger, marginInlineStart: 3 }}>
            *
          </span>
        )}
      </label>

      {children}

      {/*
        Galat MENGGANTIKAN bantuan, tidak menumpuknya. Dua baris teks di bawah
        satu kotak membuat yang penting tenggelam — dan saat ada galat, yang
        penting selalu galatnya.
      */}
      {galat ? (
        <p
          role="alert"
          style={{ margin: 0, fontSize: "var(--t-kecil)", color: C.danger, lineHeight: 1.5 }}
        >
          {galat}
        </p>
      ) : bantuan ? (
        <p style={{ margin: 0, fontSize: "var(--t-kecil)", color: C.muted, lineHeight: 1.5 }}>
          {bantuan}
        </p>
      ) : null}
    </div>
  );
}

/**
 * Kotak teks dengan cincin fokus.
 *
 * Cincinnya `:focus-visible`, bukan `:focus` — kalau `:focus`, cincin ikut
 * muncul saat diklik mouse, dan yang memakai mouse membacanya sebagai
 * gangguan lalu terbiasa mengabaikannya. Diterapkan lewat kelas CSS di
 * `globals.css`, karena pseudo-class tak bisa ditulis di style inline.
 */
export function KotakIsian(
  props: React.InputHTMLAttributes<HTMLInputElement> & { salah?: boolean },
) {
  const { salah, style, className, ...sisa } = props;
  return (
    <input
      {...sisa}
      aria-invalid={salah || undefined}
      className={`isian-fokus ${className ?? ""}`.trim()}
      style={{
        ...GAYA_ISIAN,
        ...(salah && { borderColor: C.danger }),
        ...style,
      }}
    />
  );
}

/** `<select>` dengan bentuk yang sama — supaya form tak bercampur dua gaya. */
/*
  Tipe props mengikuti komponen, bukan elemen DOM.

  Sampai 2026-09-04 isinya `<select>` asli, jadi SelectHTMLAttributes
  tepat. Sesudah 236 dropdown diganti `<Pilihan>`, meneruskan seluruh
  handler bertipe HTMLSelectElement tak lagi benar — dan tsc menolaknya
  dengan alasan yang tepat, karena yang dirender kini <button>.
*/
export function PilihanIsian(props: PropsPilihan) {
  const { style, className, ...sisa } = props;
  return (
    <Pilihan
      {...sisa}
      className={`isian-fokus ${className ?? ""}`.trim()}
      style={{ ...GAYA_ISIAN, ...style }}
    />
  );
}

/** `<textarea>` yang tinggi minimalnya masuk akal dan bisa ditarik. */
export function TeksIsian(
  props: React.TextareaHTMLAttributes<HTMLTextAreaElement>,
) {
  const { style, className, ...sisa } = props;
  return (
    <textarea
      {...sisa}
      className={`isian-fokus ${className ?? ""}`.trim()}
      style={{
        ...GAYA_ISIAN,
        resize: "vertical",
        lineHeight: 1.6,
        ...style,
      }}
    />
  );
}

/**
 * Kelompok isian dua kolom — pola `grid grid-cols-2` di TJS.
 *
 * Satu kolom memanjang membuat form pengaturan jadi gulungan panjang yang
 * hubungan antar-medannya hilang. Menumpuk jadi satu kolom di layar sempit
 * lewat `auto-fit`, bukan lewat breakpoint yang harus ditebak.
 */
export function BarisIsian({
  children,
  kolomMin = 260,
}: {
  children: ReactNode;
  kolomMin?: number;
}) {
  return (
    <div
      style={{
        display: "grid",
        gap: 14,
        gridTemplateColumns: `repeat(auto-fit, minmax(min(100%, ${kolomMin}px), 1fr))`,
      }}
    >
      {children}
    </div>
  );
}
