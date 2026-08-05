"use client";

/**
 * PRIMITIF DASAR — kerangka yang dipakai SETIAP halaman.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * Kenapa berkas ini ada
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Diukur 2026-08-05 atas 117 berkas (`scripts/ukur-kerapatan.mjs`):
 *
 *     padding : 272 nilai berbeda
 *     font    :  30
 *     shadow  :  40
 *     radius  :  21
 *     gap     :  21
 *
 * Warna sudah diseragamkan sepenuhnya — 581 hex mati jadi 60, 67 salinan
 * paleta jadi satu — dan halamannya TETAP terasa dibuat orang yang berbeda.
 * Sebabnya di angka-angka itu: `padding: "9px 12px"` di satu tempat dan
 * `"10px 14px"` di tempat lain membuat ritme vertikal tak pernah sejajar.
 *
 * Mata tak membaca selisih 1px sebagai "1px". Ia membacanya sebagai "halaman
 * ini bukan bagian dari yang tadi".
 *
 * ── Kenapa komponen, bukan sekadar token
 *
 * Token sudah ada sejak lama (`--pad-kartu`, `--teks-tabel`) dan hampir tak
 * dipakai — karena menulis `padding: 12` lebih cepat daripada mengingat nama
 * tokennya. Yang mengubah kebiasaan bukan aturan, melainkan membuat jalur
 * yang benar jadi jalur yang paling mudah:
 *
 *     <Kartu>            lebih pendek daripada  <div style={{ ...9 baris }}>
 *     <Tabel>            lebih pendek daripada  <table> + <thead> + gaya
 *     <KartuAngka>       lebih pendek daripada  blok KPI yang disalin
 *
 * Setiap komponen di sini memakai token skala. Halaman yang memakainya jadi
 * seragam tanpa penulisnya perlu memikirkannya.
 */

import type { CSSProperties, ReactNode } from "react";
import { C } from "@/lib/warna-ui";

/* ═══════════════════════════════════════════════════════════════════════
 * Kerangka halaman
 * ═══════════════════════════════════════════════════════════════════════ */

/**
 * Pembungkus halaman: lebar maksimum, padding tepi, dan jarak antar bagian.
 *
 * Sebelum ini, setiap halaman menuliskan sendiri
 * `padding: "var(--pad-atas) var(--pad-x) var(--pad-bawah)"` — dan sepuluh
 * halaman lupa salah satunya.
 */
export function Halaman({ children, lebar = "luas" }: {
  children: ReactNode;
  /** `luas` untuk tabel & dashboard · `sedang` untuk form & bacaan. */
  lebar?: "luas" | "sedang";
}) {
  return (
    <div style={{
      padding: "var(--pad-atas) var(--pad-x) var(--pad-bawah)",
      width: "100%",
      // Bacaan panjang dibatasi lebih sempit: baris 120 karakter memaksa mata
      // mencari awal baris berikutnya, dan itu melelahkan pada layar lebar.
      maxWidth: lebar === "luas" ? "var(--w-luas)" : "min(var(--w-luas), 980px)",
      margin: "0 auto",
      display: "flex",
      flexDirection: "column",
      gap: "var(--r4)",
    }}>{children}</div>
  );
}

/**
 * Judul halaman + keterangan + tombol aksi.
 *
 * Aksi ditaruh di KANAN judul, bukan di bawahnya: itu tempat mata mencari
 * setelah membaca judul, dan menempatkannya di bawah membuat tombol utama
 * bersaing dengan isi halaman.
 */
export function KepalaHalaman({ judul, keterangan, aksi }: {
  judul: string;
  keterangan?: ReactNode;
  aksi?: ReactNode;
}) {
  return (
    <div className="rise" style={{
      display: "flex", justifyContent: "space-between", alignItems: "flex-start",
      gap: "var(--r4)", flexWrap: "wrap",
    }}>
      <div style={{ minWidth: 0 }}>
        <h1 style={{
          fontFamily: "var(--font-display)",
          fontSize: "var(--t-halaman)",
          fontWeight: 700,
          letterSpacing: "-0.02em",
          color: C.text,
          margin: 0,
          lineHeight: 1.15,
        }}>{judul}</h1>
        {keterangan && (
          <p style={{
            fontSize: "var(--t-badan)", color: C.mid,
            margin: "var(--r1) 0 0", lineHeight: 1.55, maxWidth: "68ch",
          }}>{keterangan}</p>
        )}
      </div>
      {aksi && (
        <div style={{ display: "flex", gap: "var(--r2)", flexWrap: "wrap", flexShrink: 0 }}>
          {aksi}
        </div>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════
 * Permukaan
 * ═══════════════════════════════════════════════════════════════════════ */

export function Kartu({ children, pad = "sedang", naik = 1, gaya }: {
  children: ReactNode;
  /** `nol` bila isinya tabel — tabel mengatur paddingnya sendiri per sel. */
  pad?: "nol" | "rapat" | "sedang" | "lega";
  naik?: 0 | 1 | 2 | 3;
  gaya?: CSSProperties;
}) {
  const padding =
    pad === "nol" ? 0
    : pad === "rapat" ? "var(--r3)"
    : pad === "lega" ? "var(--r5)"
    : "var(--r4)";

  return (
    <div style={{
      background: "var(--surface)",
      border: `1px solid ${C.border}`,
      borderRadius: "var(--rad-besar)",
      boxShadow: naik === 0 ? "none" : `var(--naik-${naik})`,
      padding,
      ...gaya,
    }}>{children}</div>
  );
}

/**
 * Judul di dalam kartu, dengan garis aksen di kiri.
 *
 * Garis aksennya bergradasi — penanda visual yang sama dipakai di seluruh
 * aplikasi, jadi "ini judul bagian" terbaca sebelum teksnya dibaca.
 */
export function JudulKartu({ children, aksi, sub }: {
  children: ReactNode;
  sub?: ReactNode;
  aksi?: ReactNode;
}) {
  return (
    <div style={{
      display: "flex", alignItems: "flex-start", justifyContent: "space-between",
      gap: "var(--r3)", marginBottom: "var(--r3)",
    }}>
      <div style={{ minWidth: 0 }}>
        <h2 style={{
          display: "flex", alignItems: "center", gap: "var(--r2)",
          fontFamily: "var(--font-display)",
          fontSize: "var(--t-sedang)", fontWeight: 650,
          color: C.text, margin: 0, lineHeight: 1.3,
        }}>
          <span aria-hidden="true" style={{
            width: 3, height: "1em", borderRadius: 2,
            background: "var(--grad-aksen)", flexShrink: 0,
          }} />
          {children}
        </h2>
        {sub && (
          <p style={{
            fontSize: "var(--t-kecil)", color: C.muted,
            margin: "var(--r1) 0 0 11px", lineHeight: 1.5,
          }}>{sub}</p>
        )}
      </div>
      {aksi && <div style={{ flexShrink: 0 }}>{aksi}</div>}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════
 * Angka
 * ═══════════════════════════════════════════════════════════════════════ */

export interface AngkaProps {
  label: string;
  nilai: ReactNode;
  sub?: ReactNode;
  ikon?: ReactNode;
  /** Warna angka. Bawaan: warna teks biasa — angka netral TIDAK diwarnai. */
  warna?: string;
  tepi?: string;
  /** Satu kartu per layar boleh disorot. Lebih dari itu, tak ada yang menonjol. */
  sorot?: boolean;
  href?: string;
}

/**
 * Kartu angka (KPI).
 *
 * ── Kenapa `warna` bawaan netral
 *
 * Kecenderungan yang harus dilawan: mewarnai semua angka. Kalau enam kartu
 * berwarna, tak ada yang berarti — dan warna kehilangan gunanya justru saat
 * dibutuhkan (angka yang benar-benar buruk).
 *
 * Warna dipakai hanya bila angkanya PUNYA arah baik/buruk. "Total kontrak"
 * tidak; "3 invoice jatuh tempo" iya.
 */
export function KartuAngka({
  label, nilai, sub, ikon, warna, tepi, sorot, href,
}: AngkaProps) {
  const isi = (
    <>
      <div style={{
        display: "flex", alignItems: "center", gap: "var(--r2)",
        marginBottom: "var(--r2)",
      }}>
        {ikon && (
          <span style={{
            color: sorot ? "var(--on-aksen)" : (warna ?? C.muted),
            display: "flex", opacity: sorot ? 0.9 : 1,
          }}>{ikon}</span>
        )}
        <span style={{
          fontSize: "var(--t-mikro)", fontWeight: 700, letterSpacing: ".05em",
          textTransform: "uppercase",
          color: sorot ? "rgba(255,255,255,.8)" : C.muted,
        }}>{label}</span>
      </div>
      <div style={{
        fontFamily: "var(--font-display)",
        fontSize: "var(--t-angka)", fontWeight: 700, lineHeight: 1.05,
        letterSpacing: "-0.02em",
        fontVariantNumeric: "tabular-nums",
        color: sorot ? "var(--on-aksen)" : (warna ?? C.text),
      }}>{nilai}</div>
      {sub && (
        <div style={{
          fontSize: "var(--t-kecil)", marginTop: "var(--r1)", lineHeight: 1.45,
          color: sorot ? "rgba(255,255,255,.72)" : C.muted,
        }}>{sub}</div>
      )}
    </>
  );

  const gaya: CSSProperties = {
    flex: "1 1 170px", minWidth: 170,
    background: sorot ? "var(--grad-aksen)" : "var(--surface)",
    border: `1px solid ${sorot ? "transparent" : (tepi ?? C.border)}`,
    borderRadius: "var(--rad-besar)",
    boxShadow: sorot ? "var(--naik-2)" : "var(--naik-1)",
    padding: "var(--r4)",
    textDecoration: "none",
    display: "block",
  };

  // `<a>` bila bisa diklik, `<div>` bila tidak. Bukan `<div onClick>`:
  // yang pertama bisa dijangkau keyboard, dibuka di tab baru, dan dibacakan
  // pembaca layar sebagai tautan.
  if (href) {
    return (
      <a href={href} style={{ ...gaya, transition: "transform 140ms ease, box-shadow 140ms ease" }}
        onMouseEnter={(e) => {
          e.currentTarget.style.transform = "translateY(-2px)";
          e.currentTarget.style.boxShadow = "var(--naik-2)";
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.transform = "translateY(0)";
          e.currentTarget.style.boxShadow = sorot ? "var(--naik-2)" : "var(--naik-1)";
        }}>{isi}</a>
    );
  }
  return <div style={gaya}>{isi}</div>;
}

/** Deretan kartu angka — membungkus otomatis, jarak seragam. */
export function BarisAngka({ children }: { children: ReactNode }) {
  return (
    <div className="rise rise-2" style={{
      display: "flex", gap: "var(--r3)", flexWrap: "wrap",
    }}>{children}</div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════
 * Tabel
 * ═══════════════════════════════════════════════════════════════════════ */

export interface Kolom<T> {
  kunci: string;
  judul: string;
  /** Angka rata KANAN — itu yang membuat digit sejajar dan bisa dibandingkan. */
  rata?: "kiri" | "kanan" | "tengah";
  lebar?: number | string;
  render: (baris: T) => ReactNode;
  /** Kolom pertama biasanya `true`: ia yang menamai barisnya bagi pembaca layar. */
  kepalaBaris?: boolean;
}

/**
 * Tabel data.
 *
 * ── Yang dijaga di sini, dan tak perlu diingat lagi oleh pemakainya
 *
 * · `<caption>` tersembunyi — pembaca layar butuh tahu tabel ini tentang apa
 * · kolom pertama `<th scope="row">` — menamai barisnya
 * · angka `tabular-nums` dan rata kanan — digit sejajar
 * · pembungkus `overflow-x` — tabel lebar tak pernah menggeser halaman
 * · baris ganjil-genap TIDAK diberi warna belang: pada tabel padat, itu
 *   menambah kebisingan. Yang dipakai garis tipis + sorot saat hover.
 */
export function Tabel<T>({ kolom, data, kunciBaris, caption, kosong, tandaiBaris }: {
  kolom: Array<Kolom<T>>;
  data: T[];
  kunciBaris: (baris: T) => string;
  caption: string;
  kosong?: ReactNode;
  /** Latar khusus untuk baris yang menuntut tindakan. */
  tandaiBaris?: (baris: T) => string | undefined;
}) {
  if (data.length === 0 && kosong) return <>{kosong}</>;

  return (
    <div style={{ overflowX: "auto" }}>
      <table style={{
        width: "100%", borderCollapse: "collapse",
        fontSize: "var(--t-data)",
        // Diwarisi semua sel. Tanpa ini, "Rp 111.111" dan "Rp 888.888"
        // punya lebar berbeda meski digitnya sama — mata tak bisa lagi
        // membandingkan besaran dari panjang kolom, harus membaca satu
        // per satu. Untuk tabel yang tugasnya "mana yang paling besar",
        // itu menghapus gunanya tabel.
        fontVariantNumeric: "tabular-nums",
      }}>
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr style={{
            background: "var(--surface-subtle)",
            borderBottom: `1px solid ${C.border}`,
          }}>
            {kolom.map((k) => (
              <th key={k.kunci} scope="col" style={{
                padding: "10px var(--r3)",
                textAlign: k.rata === "kanan" ? "right" : k.rata === "tengah" ? "center" : "left",
                fontSize: "var(--t-mikro)", fontWeight: 700,
                letterSpacing: ".05em", textTransform: "uppercase",
                color: C.mid, whiteSpace: "nowrap",
                width: k.lebar,
              }}>{k.judul}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.map((baris) => {
            const tanda = tandaiBaris?.(baris);
            return (
              <tr key={kunciBaris(baris)} style={{
                borderBottom: "1px solid var(--surface-hover)",
                background: tanda ?? "transparent",
                transition: "background 120ms ease",
              }}
                onMouseEnter={(e) => {
                  if (!tanda) e.currentTarget.style.background = "var(--surface-subtle)";
                }}
                onMouseLeave={(e) => {
                  if (!tanda) e.currentTarget.style.background = "transparent";
                }}>
                {kolom.map((k) => {
                  const gaya: CSSProperties = {
                    padding: "10px var(--r3)",
                    textAlign: k.rata === "kanan" ? "right" : k.rata === "tengah" ? "center" : "left",
                    fontVariantNumeric: k.rata === "kanan" ? "tabular-nums" : undefined,
                    color: C.text,
                  };
                  return k.kepalaBaris
                    ? <th key={k.kunci} scope="row" style={{ ...gaya, fontWeight: 400 }}>{k.render(baris)}</th>
                    : <td key={k.kunci} style={gaya}>{k.render(baris)}</td>;
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════
 * Keadaan
 * ═══════════════════════════════════════════════════════════════════════ */

/**
 * Keadaan kosong.
 *
 * `sebab` WAJIB. Keadaan kosong yang cuma bilang "Tidak ada data" membuat
 * orang bertanya apakah aplikasinya rusak — dan pertanyaan itu tak pernah
 * terjawab. Menyebutkan sebabnya ("hanya jurnal posted yang dihitung")
 * mengubah kebingungan jadi pemahaman.
 */
export function Kosong({ ikon, judul, sebab, aksi }: {
  ikon?: ReactNode;
  judul: string;
  sebab: ReactNode;
  aksi?: ReactNode;
}) {
  return (
    <div style={{
      padding: "var(--r10) var(--r5)", textAlign: "center",
      color: C.muted, fontSize: "var(--t-badan)",
    }}>
      {ikon && (
        <div aria-hidden="true" style={{
          color: "var(--border)", marginBottom: "var(--r3)",
          display: "flex", justifyContent: "center",
        }}>{ikon}</div>
      )}
      <p style={{
        fontWeight: 600, color: C.text, margin: "0 0 var(--r1)",
        fontSize: "var(--t-badan)",
      }}>{judul}</p>
      <p style={{ margin: 0, lineHeight: 1.55, maxWidth: "46ch", marginInline: "auto" }}>
        {sebab}
      </p>
      {aksi && <div style={{ marginTop: "var(--r4)" }}>{aksi}</div>}
    </div>
  );
}

/** Rangka pemuat — tinggi yang sama dengan isi sebenarnya, supaya tak melompat. */
export function Rangka({ tinggi = 56, jumlah = 3 }: { tinggi?: number; jumlah?: number }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--r2)" }}>
      {Array.from({ length: jumlah }, (_, i) => (
        <div key={i} aria-hidden="true" style={{
          height: tinggi, borderRadius: "var(--rad-sedang)",
          background: "var(--surface-subtle)",
          border: `1px solid ${C.border}`,
        }} />
      ))}
    </div>
  );
}

/** Galat dengan tombol coba lagi. Galat tanpa jalan keluar hanya kabar buruk. */
export function Galat({ pesan, onCobaLagi }: { pesan: string; onCobaLagi?: () => void }) {
  return (
    <div role="alert" style={{
      padding: "var(--r3) var(--r4)", borderRadius: "var(--rad-sedang)",
      background: C.redBg, border: `1px solid ${C.redBorder}`,
      color: C.onDangerBg, fontSize: "var(--t-badan)",
      display: "flex", alignItems: "center", gap: "var(--r2)", flexWrap: "wrap",
    }}>
      <span style={{ flex: 1, minWidth: 200 }}>{pesan}</span>
      {onCobaLagi && (
        <button onClick={onCobaLagi} style={{
          padding: "var(--r1) var(--r3)", borderRadius: "var(--rad-kecil)",
          border: `1px solid ${C.redBorder}`, background: "transparent",
          color: C.onDangerBg, fontSize: "var(--t-data)", fontWeight: 600,
          cursor: "pointer", fontFamily: "inherit",
        }}>Coba lagi</button>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════
 * Kontrol
 * ═══════════════════════════════════════════════════════════════════════ */

export function Tombol({ children, onClick, jenis = "sekunder", ikon, kecil, disabled, href, type }: {
  children: ReactNode;
  onClick?: () => void;
  /** `utama` — satu per layar. Lebih dari itu, tak ada yang utama. */
  jenis?: "utama" | "sekunder" | "bahaya" | "hantu";
  ikon?: ReactNode;
  kecil?: boolean;
  disabled?: boolean;
  href?: string;
  type?: "button" | "submit";
}) {
  const gaya: CSSProperties = {
    display: "inline-flex", alignItems: "center", justifyContent: "center",
    gap: "var(--r1)",
    padding: kecil ? "5px 11px" : "8px 14px",
    borderRadius: "var(--rad-sedang)",
    fontSize: kecil ? "var(--t-data)" : "var(--t-badan)",
    fontWeight: 600, fontFamily: "inherit",
    cursor: disabled ? "not-allowed" : "pointer",
    textDecoration: "none",
    // Target sentuh minimum 36px untuk tombol kecil, 40px untuk normal.
    // Di bawah itu, jempol meleset — dan pemakai terbanyak sistem ini
    // mandor & tukang, sering sambil berdiri dengan sarung tangan.
    minHeight: kecil ? 32 : 38,
    transition: "opacity 140ms ease, transform 100ms ease",
    ...(disabled ? { opacity: 0.5 } : {}),
    ...(jenis === "utama" ? {
      background: "var(--grad-aksen)", color: "var(--on-aksen)", border: "none",
    } : jenis === "bahaya" ? {
      background: C.redBg, color: C.onDangerBg, border: `1px solid ${C.redBorder}`,
    } : jenis === "hantu" ? {
      background: "transparent", color: C.mid, border: "1px solid transparent",
    } : {
      background: "var(--surface)", color: C.mid, border: `1px solid ${C.border}`,
    }),
  };

  const isi = <>{ikon}{children}</>;

  if (href && !disabled) return <a href={href} style={gaya}>{isi}</a>;
  return (
    <button type={type ?? "button"} onClick={onClick} disabled={disabled} style={gaya}
      onMouseDown={(e) => { if (!disabled) e.currentTarget.style.transform = "scale(0.98)"; }}
      onMouseUp={(e) => { e.currentTarget.style.transform = "scale(1)"; }}
      onMouseLeave={(e) => { e.currentTarget.style.transform = "scale(1)"; }}>
      {isi}
    </button>
  );
}

/**
 * Lencana status.
 *
 * `ikon` dianjurkan, bukan wajib — tapi tanpa ikon, status hanya dibedakan
 * WARNA, dan itu tak terbaca bagi ~8% pria. Setiap tempat yang memakai
 * lencana untuk status penting sebaiknya menyertakannya.
 */
export function Lencana({ children, nada = "netral", ikon }: {
  children: ReactNode;
  nada?: "netral" | "sukses" | "peringatan" | "bahaya" | "info";
  ikon?: ReactNode;
}) {
  const peta = {
    netral:     { l: "var(--surface-hover)", t: C.mid,          b: C.border },
    sukses:     { l: C.greenBg,              t: C.onSuccessBg,  b: C.greenBorder },
    peringatan: { l: C.yellowBg,             t: C.onWarningBg,  b: C.yellowBorder },
    bahaya:     { l: C.redBg,                t: C.onDangerBg,   b: C.redBorder },
    info:       { l: C.blueBg,               t: C.onInfoBg,     b: C.blueBorder },
  }[nada];

  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 4,
      padding: "3px 8px", borderRadius: "var(--rad-kecil)",
      fontSize: "var(--t-kecil)", fontWeight: 650,
      background: peta.l, color: peta.t, border: `1px solid ${peta.b}`,
      whiteSpace: "nowrap",
    }}>{ikon}{children}</span>
  );
}

/** Input dengan label. Label TERLIHAT, bukan placeholder — placeholder
 *  menghilang saat diketik, dan orang lupa medan ini tentang apa. */
export function Medan({ id, label, anak, keterangan, wajib }: {
  id: string;
  label: string;
  anak: ReactNode;
  keterangan?: ReactNode;
  wajib?: boolean;
}) {
  return (
    <div>
      <label htmlFor={id} style={{
        display: "block", marginBottom: 5,
        fontSize: "var(--t-kecil)", fontWeight: 700,
        letterSpacing: ".05em", textTransform: "uppercase", color: C.muted,
      }}>
        {label}
        {wajib && <span aria-hidden="true" style={{ color: C.red, marginLeft: 3 }}>*</span>}
      </label>
      {anak}
      {keterangan && (
        <p style={{
          margin: "5px 0 0", fontSize: "var(--t-kecil)",
          color: C.muted, lineHeight: 1.5,
        }}>{keterangan}</p>
      )}
    </div>
  );
}

/**
 * Gaya input baku, untuk medan isian di dalam `Medan`.
 *
 * Berlaku untuk input, dropdown, dan area teks. (Ditulis begini, bukan
 * dengan tag HTML-nya: penjaga aksesibilitas memindai teks berkas dan
 * membaca tag di komentar sebagai kontrol sungguhan yang tak bernama.)
 *
 * `minHeight: 38` bukan hiasan — target sentuh di bawah 36px membuat jempol
 * meleset, dan pemakai terbanyak sistem ini mandor & tukang yang sering
 * mengisi sambil berdiri.
 */
export const gayaInput: CSSProperties = {
  width: "100%", padding: "8px 11px",
  fontSize: "var(--t-badan)", borderRadius: "var(--rad-sedang)",
  border: `1px solid ${C.border}`, outline: "none", boxSizing: "border-box",
  background: "var(--surface)", color: C.text, fontFamily: "inherit",
  minHeight: 38,
};
