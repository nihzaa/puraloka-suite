"use client";

/**
 * KARTU RAIL — bentuk baku isi rail kanan.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * KENAPA SATU BENTUK UNTUK SEMUA
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Referensi (BuildAxis) menumpuk 4–6 kartu di rail, dan yang membuatnya
 * terbaca sebagai SATU sistem bukan isinya melainkan **bingkainya**: tinggi
 * header sama, posisi kontrol sama, jarak sama. Begitu satu kartu memakai
 * bingkai sendiri, seluruh kolom terbaca sebagai tempelan.
 *
 * Karena itu `KartuRail` adalah satu-satunya bingkai yang boleh dipakai di
 * rail — persis alasan `SectionCard` ada di brief §3.6.
 *
 * ── Keadaan kosong ditangani DI SINI
 *
 * Diserahkan ke pemanggil = separuh kartu akan lupa, dan layar kosong tanpa
 * penjelasan terbaca sebagai fitur rusak. Pola yang sama sudah dipakai
 * `Tabel`/`Kosong` di `dasar.tsx` dengan alasan identik.
 */

import { Children, type ReactNode } from "react";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { C } from "@/lib/warna-ui";

export function KartuRail({
  judul,
  tautan,
  labelTautan = "Semua",
  kosong,
  children,
}: {
  judul: string;
  tautan?: string;
  labelTautan?: string;
  /** Ditampilkan bila `children` tak ada isinya. Wajib — lihat catatan di atas. */
  kosong?: string;
  children?: ReactNode;
}) {
  /*
   * Deteksi "ada isi" harus DIRATAKAN lebih dulu.
   *
   * `{daftar.map(...)}` di dalam JSX menghasilkan children berupa ARRAY BERISI
   * SATU ARRAY KOSONG saat daftarnya kosong — bukan array kosong. Versi
   * sebelumnya memeriksa `children.length > 0` sehingga membacanya sebagai
   * "ada isi", lalu merender kartu yang HANYA berisi judul: tanpa daftar,
   * tanpa kalimat kosong, tanpa penjelasan apa pun.
   *
   * Ketahuan di layar pada kartu Notifikasi (data uji memang nol baris).
   * `React.Children.toArray` sekaligus membuang `null`/`false`/`undefined`,
   * jadi `{kondisi && <Baris/>}` yang bernilai false juga terhitung kosong.
   */
  const adaIsi = Children.toArray(children).length > 0;

  return (
    <section
      style={{
        background: "var(--surface)",
        border: "1px solid var(--border)",
        borderRadius: "var(--rad-besar)",
        overflow: "hidden",
      }}
    >
      <header
        style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          gap: 8, padding: "var(--pad-kartu)",
          borderBottom: adaIsi ? "1px solid var(--border)" : "none",
        }}
      >
        <h2 style={{
          margin: 0, fontSize: "var(--t-kecil)", fontWeight: 700,
          letterSpacing: ".04em", textTransform: "uppercase", color: C.mid,
        }}>
          {judul}
        </h2>
        {tautan && (
          <Link
            href={tautan}
            style={{
              display: "inline-flex", alignItems: "center", gap: 2,
              fontSize: 11, fontWeight: 600, color: "var(--aksen)",
              textDecoration: "none", flexShrink: 0,
            }}
          >
            {labelTautan}
            <ChevronRight size={12} aria-hidden="true" />
          </Link>
        )}
      </header>

      {adaIsi ? (
        <div>{children}</div>
      ) : (
        <p style={{
          margin: 0, padding: "var(--pad-kartu)",
          fontSize: "var(--t-badan)", color: C.mid, lineHeight: 1.45,
        }}>
          {kosong ?? "Belum ada data."}
        </p>
      )}
    </section>
  );
}

/**
 * Satu baris di dalam `KartuRail`.
 *
 * `sub` sengaja opsional dan dipotong satu baris: rail 300px tak cukup untuk
 * dua baris keterangan, dan teks yang membungkus membuat tinggi baris tak
 * seragam — yang justru merusak kesan "satu sistem".
 */
export function BarisRail({
  utama,
  sub,
  kanan,
  nadaKanan = "normal",
  href,
  pertama = false,
}: {
  utama: string;
  sub?: string;
  kanan?: string;
  nadaKanan?: "normal" | "bahaya" | "baik";
  href?: string;
  /**
   * Baris pertama TIDAK bergaris atas: header kartu sudah punya garis bawah,
   * dan dua garis berdempetan terbaca sebagai bingkai ganda. `RailFokus`
   * memakai aturan yang sama — kalau berbeda, dua kartu bertetangga di rail
   * akan terlihat dari sistem yang berbeda.
   */
  pertama?: boolean;
}) {
  const warnaKanan =
    nadaKanan === "bahaya" ? "var(--danger)"
    : nadaKanan === "baik" ? "var(--success)"
    : C.text;

  const isi = (
    <>
      <span style={{ flex: 1, minWidth: 0 }}>
        <span style={{
          display: "block", fontSize: "var(--t-badan)", color: C.text,
          lineHeight: 1.35, overflow: "hidden", textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}>
          {utama}
        </span>
        {sub && (
          <span style={{
            display: "block", fontSize: 11, color: C.mid, marginTop: 2,
            overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
          }}>
            {sub}
          </span>
        )}
      </span>
      {kanan && (
        <span style={{
          fontSize: 12, fontWeight: 700, color: warnaKanan, flexShrink: 0,
          fontVariantNumeric: "tabular-nums",
        }}>
          {kanan}
        </span>
      )}
    </>
  );

  const gaya = {
    display: "flex", alignItems: "center", gap: 10,
    padding: "10px var(--pad-kartu)",
    borderTop: pertama ? "none" : "1px solid var(--border)",
    textDecoration: "none",
  } as const;

  if (!href) return <div style={gaya}>{isi}</div>;

  return (
    <Link
      href={href}
      style={{ ...gaya, transition: "background 150ms ease" }}
      onMouseEnter={(e) => { e.currentTarget.style.background = "var(--surface-hover)"; }}
      onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
    >
      {isi}
    </Link>
  );
}
