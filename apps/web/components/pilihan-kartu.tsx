"use client";

/**
 * PILIHAN KARTU — kosakata bersama untuk memilih dari beberapa opsi.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * KENAPA ADA
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Diukur 2026-08-14: **5 berkas memakai `<input type="radio">`**, dan kelimanya
 * sudah membungkusnya dalam kartu ber-border yang menyala saat terpilih —
 * dengan lima bentuk berbeda. Ada yang `borderRadius: 10`, ada `1.5px solid`,
 * ada yang memakai `C.navyLight`, ada `var(--surface-2)`, ada yang lupa
 * `accentColor` sama sekali.
 *
 * Pola yang sama sudah ditemukan empat kali di repo ini — 16 `inputStyle`
 * (isian.tsx), 27 varian `<h1>` (UIR-2), 8 bentuk kartu (K-2), 4 gaya tab.
 * Tiap kali sebabnya sama: halaman ditulis pada waktu berbeda dan menyalin
 * dari tetangga terdekat. Tak satu pun salah saat ditulis.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * KENAPA LINGKARAN RADIO DIBUANG
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Founder 2026-08-14: *"stylingnya saya gamau pake model radio button. kurang
 * kekinian"*.
 *
 * Yang dibuang **tampilannya**, bukan mekanismenya. `<input>` aslinya tetap
 * ada dan tetap menerima fokus keyboard — hanya disembunyikan secara visual
 * dengan `opacity: 0` di atas kartunya, bukan dengan `display: none` yang akan
 * mengeluarkannya dari urutan Tab sepenuhnya.
 *
 * Ini bukan kehati-hatian berlebih. Mengganti radio dengan `<div onClick>`
 * adalah cara paling umum sebuah kontrol berhenti bisa dipakai keyboard, dan
 * `jsx-a11y` sudah menandainya di `roles/page.tsx` (4 peringatan). Pengguna
 * berperangkat lama justru yang paling sering memakai keyboard — `a11y-audit`
 * menyebut ini wajib, bukan opsional.
 *
 * Yang menggantikan lingkaran: **centang di pojok** + border navy + latar
 * `--navy-light`. Tiga penanda sekaligus, karena warna saja tak cukup (WCAG
 * 1.4.1 — informasi tak boleh disampaikan warna semata).
 *
 * ══════════════════════════════════════════════════════════════════════════
 * SATU KOMPONEN, DUA PERILAKU
 * ══════════════════════════════════════════════════════════════════════════
 *
 *   ganda={false}  radio  — satu pilihan (bawaan)
 *   ganda={true}   checkbox — beberapa sekaligus
 *
 * Disatukan karena tampilannya memang sama dan HARUS tetap sama; yang berbeda
 * cuma apakah memilih yang kedua mematikan yang pertama. Dua komponen terpisah
 * akan menyimpang persis seperti lima radio tadi menyimpang.
 *
 * `role`-nya ikut berubah otomatis (`radio` vs `checkbox`), jadi pembaca layar
 * mengumumkan "satu dari tiga" atau "kotak centang" sesuai kenyataannya —
 * bukan sesuai tampilannya.
 */

import type { ReactNode } from "react";
import { Check } from "lucide-react";
import { C } from "@/lib/warna-ui";

export interface OpsiKartu {
  /** Nilai yang disimpan. */
  nilai: string;
  /** Judul pendek — dibaca lebih dulu oleh mata dan pembaca layar. */
  label: string;
  /** Satu kalimat pembeda. Opsional, tetapi hampir selalu layak diisi. */
  ringkas?: string;
  /** Penjelasan panjang, muncul di bawah. */
  detail?: ReactNode;
  /** Ikon opsional di kiri judul. */
  ikon?: ReactNode;
  /**
   * Isi rata-kanan — mis. saldo akun kas.
   *
   * Ada karena `termin-payment-modal` memang membutuhkannya: memilih akun kas
   * tanpa melihat saldonya berarti memilih buta. Menyeragamkan kartunya dengan
   * MENGHAPUS kolom itu akan menyeragamkan tampilan sambil membuang informasi
   * yang jadi alasan orang bisa memilih dengan benar.
   */
  kanan?: ReactNode;
  /**
   * Pilihan yang TIDAK bisa dimatikan — mis. aturan yang memang mengikat.
   *
   * Ditampilkan menyala dan tercentang, tetapi tak bisa diklik. Menyembunyikan
   * aturan semacam itu membuat orang mengira ia tak ada; menampilkannya
   * sebagai kotak biasa membuat orang mengira ia bisa dimatikan.
   */
  terkunci?: boolean;
}

export function PilihanKartu({
  opsi,
  nilai,
  onUbah,
  ganda = false,
  nama,
  label,
  keterangan,
  nonaktif = false,
  kolom,
  minLebar = 220,
}: {
  opsi: readonly OpsiKartu[];
  /** `string` saat tunggal, `string[]` saat ganda. */
  nilai: string | readonly string[];
  onUbah: (nilai: string) => void;
  ganda?: boolean;
  /** Wajib saat `ganda={false}` — mengikat radio jadi satu kelompok. */
  nama: string;
  label: string;
  keterangan?: ReactNode;
  nonaktif?: boolean;
  /** Jumlah kolom. Bawaan: menyesuaikan lebar, minimal `minLebar` per kartu. */
  kolom?: number;
  /**
   * Lebar minimum tiap kartu sebelum grid turun jadi satu kolom.
   *
   * Bawaan 220px. Dinaikkan saat isinya panjang — daftar tool asisten memakai
   * 340px karena di bawah itu nama + keterangannya membungkus tiap dua kata.
   */
  minLebar?: number;
}) {
  const terpilihSet = new Set(
    typeof nilai === "string" ? (nilai ? [nilai] : []) : nilai,
  );

  return (
    <fieldset
      style={{ border: "none", padding: 0, margin: "0 0 14px", minWidth: 0 }}
      disabled={nonaktif}
    >
      <legend
        style={{
          fontSize: 12,
          fontWeight: 550,
          color: C.mid,
          marginBottom: 6,
          padding: 0,
        }}
      >
        {label}
      </legend>

      <div
        style={{
          display: "grid",
          // `auto-fit` + `minmax`: kartu melebar sendiri di layar lebar dan
          // menumpuk di ponsel, tanpa media query. Lebar minimum 220px karena
          // di bawah itu `ringkas` mulai terpotong dua baris.
          gridTemplateColumns: kolom
            ? `repeat(${kolom}, minmax(0, 1fr))`
            : `repeat(auto-fit, minmax(${minLebar}px, 1fr))`,
          gap: 8,
        }}
      >
        {opsi.map((o) => {
          const terpilih = terpilihSet.has(o.nilai) || Boolean(o.terkunci);
          const dikunci = Boolean(o.terkunci);

          return (
            <label
              key={o.nilai}
              style={{
                position: "relative",
                display: "block",
                padding: "12px 34px 12px 13px",
                borderRadius: "var(--radius-sm, 10px)",
                // Dua penanda selain warna: ketebalan border dan centang.
                // WCAG 1.4.1 — warna saja tak boleh jadi satu-satunya pembeda.
                border: `1.5px solid ${terpilih ? C.navy : C.border}`,
                background: terpilih ? C.navyLight : "var(--surface)",
                cursor: nonaktif || dikunci ? "default" : "pointer",
                opacity: nonaktif ? 0.6 : 1,
                transition: "border-color .15s, background .15s",
                minWidth: 0,
              }}
            >
              <input
                type={ganda ? "checkbox" : "radio"}
                name={nama}
                value={o.nilai}
                checked={terpilih}
                disabled={nonaktif || dikunci}
                onChange={() => onUbah(o.nilai)}
                // Disembunyikan SECARA VISUAL saja. `display:none` akan
                // mengeluarkannya dari urutan Tab, dan kontrol yang tak bisa
                // di-Tab adalah kontrol yang tak ada bagi sebagian orang.
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

              {/* Penanda terpilih. `aria-hidden` karena keadaannya sudah
                  diumumkan `<input>` di atas — membacanya dua kali membuat
                  pembaca layar mengeja "tercentang tercentang". */}
              <span
                aria-hidden
                style={{
                  position: "absolute",
                  top: 11,
                  right: 11,
                  width: 17,
                  height: 17,
                  borderRadius: 5,
                  display: "grid",
                  placeItems: "center",
                  border: `1.5px solid ${terpilih ? C.navy : C.border}`,
                  background: terpilih ? C.navy : "transparent",
                  flexShrink: 0,
                }}
              >
                {terpilih ? <Check size={11} strokeWidth={3.5} color={C.onNavy} /> : null}
              </span>

              <span
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  fontSize: 13,
                  fontWeight: 600,
                  color: C.text,
                  lineHeight: 1.35,
                  // Ruang untuk isi rata-kanan, kalau ada. Tanpa ini, label
                  // panjang akan menabrak angkanya.
                  paddingRight: o.kanan ? 8 : 0,
                }}
              >
                {o.ikon}
                <span style={{ minWidth: 0, flex: 1 }}>{o.label}</span>
                {o.kanan ? (
                  <span style={{ fontWeight: 600, fontSize: 12, flexShrink: 0 }}>{o.kanan}</span>
                ) : null}
              </span>

              {o.ringkas ? (
                <span
                  style={{
                    display: "block",
                    fontSize: "var(--t-kecil)",
                    color: C.mid,
                    marginTop: 2,
                    lineHeight: 1.45,
                  }}
                >
                  {o.ringkas}
                </span>
              ) : null}

              {o.detail ? (
                <span
                  style={{
                    display: "block",
                    fontSize: "var(--t-kecil)",
                    color: C.muted,
                    marginTop: 5,
                    lineHeight: 1.5,
                  }}
                >
                  {o.detail}
                </span>
              ) : null}

              {dikunci ? (
                <span
                  style={{
                    display: "block",
                    fontSize: "var(--t-kecil)",
                    color: C.mid,
                    marginTop: 5,
                    fontWeight: 550,
                  }}
                >
                  Selalu aktif — tidak bisa dimatikan
                </span>
              ) : null}
            </label>
          );
        })}
      </div>

      {keterangan ? (
        <p
          style={{
            fontSize: "var(--t-kecil)",
            color: C.muted,
            lineHeight: 1.55,
            margin: "8px 0 0",
            maxWidth: "60ch",
          }}
        >
          {keterangan}
        </p>
      ) : null}
    </fieldset>
  );
}
