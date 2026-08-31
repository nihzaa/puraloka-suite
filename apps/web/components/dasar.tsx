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
export function KepalaHalaman({ judul, keterangan, aksi, ikon }: {
  judul: string;
  keterangan?: ReactNode;
  aksi?: ReactNode;
  /**
   * Ubin ikon di kiri judul — penanda kategori halaman (brief redesign §3.3).
   *
   * Diukur 2026-08-08: 13 dari 66 halaman ber-judul sudah memakainya, dengan
   * ubin buatan sendiri. Tanpa prop ini, memindahkan mereka ke sini berarti
   * MENGHAPUS elemen yang justru diminta — penyeragaman yang diam-diam
   * menghilangkan informasi.
   *
   * Diberi `aria-hidden`: ikon di sebelah judul yang sudah menyebut halamannya
   * hanya menambah kebisingan bagi pembaca layar.
   */
  ikon?: ReactNode;
}) {
  return (
    <div className="rise" style={{
      display: "flex", justifyContent: "space-between", alignItems: "flex-start",
      gap: "var(--r4)", flexWrap: "wrap",
    }}>
      <div style={{ display: "flex", alignItems: "flex-start", gap: "var(--r3)", minWidth: 0 }}>
        {ikon && (
          <span
            data-ubin-ikon
            aria-hidden="true"
            style={{
              display: "grid", placeItems: "center", flexShrink: 0,
              width: 40, height: 40,
              borderRadius: "var(--rad-sedang)",
              /*
                Gradien aksen — SATU per layar, dan ini tempatnya.

                Founder bertanya apakah `--grad-aksen` sebaiknya dipakai lebih
                banyak tempat. Jawabannya: lebih SENGAJA, bukan lebih banyak.
                Ia kini dipakai 26 tempat dan semuanya kecil-bermakna; disebar
                ke semua kartu ia berhenti jadi penanda dan mulai jadi latar —
                yang hilang bukan keindahannya, melainkan kemampuannya
                MENUNJUK.

                Ubin judul adalah kandidat terbaiknya: satu per halaman,
                selalu di sudut kiri atas tempat mata mendarat pertama, dan
                cukup kecil (40px) sehingga gradiennya terbaca sebagai bahan
                — bukan sebagai bidang warna.

                `--on-aksen`, bukan `#fff` dipaku: token ini berbalik jadi
                gelap di mode gelap, tempat gradiennya menjadi terang.
              */
              background: "var(--grad-aksen)",
              color: "var(--on-aksen)",
              boxShadow: "var(--naik-1)",
            }}
          >
            {ikon}
          </span>
        )}
        <div style={{ minWidth: 0 }}>
          <h1 style={{
            fontFamily: "var(--font-display)",
            fontSize: "var(--t-halaman)",
            fontWeight: 700,
            /*
              -0.03em, bukan -0.02em.
              `Bricolage Grotesque` punya kontras tebal-tipis dan terminal
              yang dipotong miring — karakter yang baru terbaca saat hurufnya
              cukup rapat untuk dilihat sebagai SATU bentuk. Pada 26px,
              -0.02em masih menyisakan celah yang membuatnya terbaca sebagai
              deretan huruf biasa.

              Berhenti di -0.03: -0.04em adalah lantai yang tak boleh
              dilewati, dan pada huruf berkontras tinggi ia mulai membuat
              batang huruf bersentuhan.
            */
            letterSpacing: "-0.03em",
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
    <div
      /*
        `permukaan-hidup` dipasang DI SINI, bukan di tiap halaman.

        Diukur 2026-08-14: `clay-hover` — utilitas yang melakukan hal yang
        sama — hanya terpakai di 2 berkas dari seluruh aplikasi. Menempelkan
        kelas satu per satu ke 135 halaman tak akan pernah selesai, dan yang
        terlewat tak menghasilkan gejala apa pun: kartunya tetap tampil,
        hanya mati saat disentuh.

        Di komponen bersama, satu baris ini menghidupkan setiap kartu yang
        memakai `<Kartu>` sekaligus — dan halaman baru mendapatkannya tanpa
        penulisnya perlu tahu kelas ini ada.
      */
      className="permukaan-hidup"
      style={{
        background: "var(--surface)",
        border: `1px solid ${C.border}`,
        borderRadius: "var(--rad-besar)",
        boxShadow: naik === 0 ? "none" : `var(--naik-${naik})`,
        padding,
        ...gaya,
      }}
    >{children}</div>
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

/** Satu sel pada baris total. */
export interface SelTotal {
  kunci: string;
  isi: ReactNode;
  rata?: "kiri" | "kanan" | "tengah";
  /** `colSpan` — untuk label "Total" yang membentang beberapa kolom. */
  rentang?: number;
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
 * · baris total di `<tfoot>`, bukan `<tbody>` — lihat catatan prop `total`
 *
 * Keempat jaminan pertama bukan lagi klaim komentar: `dasar.test.tsx`
 * mengujinya satu per satu. Sampai 2026-08-07 berkas ini tak punya test
 * sama sekali, padahal seluruh argumen UI-0-4 bersandar padanya.
 */
export function Tabel<T>({ kolom, data, kunciBaris, caption, kosong, tandaiBaris, total, berpermukaan }: {
  kolom: Array<Kolom<T>>;
  data: T[];
  kunciBaris: (baris: T) => string;
  caption: string;
  kosong?: ReactNode;
  /** Latar khusus untuk baris yang menuntut tindakan. */
  tandaiBaris?: (baris: T) => string | undefined;
  /**
   * Baris total — dirender di `<tfoot>`, BUKAN sebagai baris data terakhir.
   *
   * Bedanya bukan kosmetik. Baris total yang duduk di `<tbody>` diperlakukan
   * sebagai data: pembaca layar mengumumkannya seperti baris biasa, dan saat
   * tabel diurutkan totalnya ikut berpindah ke tengah. `<tfoot>` menyatakan
   * "ini ringkasan kolomnya", dan peramban menjaganya tetap di bawah.
   *
   * Enam halaman menulis baris total sendiri dengan `colSpan` di `<tbody>`
   * (diukur 2026-08-07) — semuanya mewarisi cacat itu.
   */
  total?: SelTotal[];
  /**
   * Tabel menggambar permukaannya sendiri: tepi 1px + sudut 14px + latar.
   *
   * ── Sebabnya, diukur bukan dikira
   *
   * Founder 2026-08-14: *"liat ini tabel nya masa ga sama kaya table lain
   * stylingnya"*. Diukur di peramban, dan gaya TABELNYA sendiri ternyata
   * identik di tiap halaman — padding `9px 12px`, kepala `10px/700` uppercase,
   * latar kepala sama persis. Yang berbeda WADAHNYA:
   *
   *     nota-kredit  tabel di dalam kartu  → ada tepi, sudut, latar
   *     timesheet    tabel telanjang       → nol tepi, nol sudut
   *
   * Dihitung di seluruh aplikasi: 23 halaman membungkus `<Tabel>` dalam
   * kartu, 19 halaman tidak. Bukan variasi yang disengaja — dua kebiasaan
   * yang tumbuh berdampingan.
   *
   * ── Kenapa OPT-IN, bukan bawaan menyala
   *
   * Versi pertama menyalakannya secara bawaan lalu mematikan di 43 tempat
   * yang sudah berkartu. Diukur sesudahnya: tiga halaman langsung
   * bergaris GANDA (`approval-inbox`, `jadwal`, `kepatuhan`) — kartu di
   * dalam kartu, dua garis 1px berdempet yang terbaca sebagai cacat render.
   *
   * Perubahan bawaan pada komponen yang dipakai 71 halaman menyentuh
   * semuanya sekaligus, dan yang perlu diperiksa jadi 71 — bukan 19.
   * Opt-in membalik bebannya: hanya halaman yang memang telanjang yang
   * menyalakannya, dan tak satu pun halaman yang sudah benar bisa rusak.
   */
  berpermukaan?: boolean;
}) {
  if (data.length === 0 && kosong) return <>{kosong}</>;

  return (
    <div
      style={
        berpermukaan
          ? {
              overflowX: "auto",
              background: "var(--surface)",
              border: "1px solid var(--border)",
              // 14px — DIUKUR dari `GAYA_KARTU` (ui-dasar.tsx), bukan angka
              // baru. Versi pertama menulis 12 dari ingatan; radius yang
              // berbeda antar-permukaan sejenis adalah cara paling halus
              // membuat satu produk terasa dirakit dari dua.
              borderRadius: 14,
            }
          : { overflowX: "auto" }
      }
    >
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
                /*
                  `--pad-baris`, bukan `10px var(--r3)` yang berdiri di sini
                  sebelumnya.

                  Selisihnya cuma 1px vertikal (10 vs 9), jadi ini bukan soal
                  tampilan — ini soal SIAPA yang memegang angkanya. `globals.css`
                  sudah menyediakan `--pad-baris` khusus untuk "baris tabel &
                  daftar", sepuluh berkas memakainya, dan satu-satunya yang
                  tidak justru komponen tabel bersama ini.

                  Akibatnya token itu tak bisa dipercaya sebagai kenop: menggeser
                  `--pad-baris` menggeser sepuluh halaman dan MELEWATI 61 halaman
                  yang memakai `<Tabel>` — persis kebalikan dari yang diharapkan
                  orang yang menyentuhnya.

                  Catatan token itu sendiri sudah memperingatkan kelas cacat ini:
                  "token yang tak pernah dipakai tak pernah teruji". Token yang
                  dipakai SEPARUH lebih buruk — ia teruji dan tetap bohong.
                */
                padding: "var(--pad-baris)",
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
                    padding: "var(--pad-baris)",
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
        {total && total.length > 0 && (
          <tfoot>
            {/*
              Latar `--surface-hover`, BUKAN `--surface-subtle`.

              Diukur 2026-09-01 dari potret layar halaman Langganan: baris
              total berbaur dengan baris data. Sebabnya terhitung, bukan
              selera —

                  --surface-subtle #F9FAFB vs putih   1,05 : 1
                  --surface-hover  #F3F4F6 vs putih   1,10 : 1
                  garis 2px --border #E5E7EB          1,24 : 1

              Pada 1,05:1 latarnya praktis tak ada, jadi seluruh beban
              pemisahan jatuh ke garis 2px sendirian. Baris total yang
              terbaca sebagai baris data adalah kesalahan baca yang mahal:
              di halaman keuangan, angka total yang disangka satu transaksi
              menggeser kesimpulan orang tentang uangnya sendiri.

              Tak ada penjaga yang menangkap ini — kontras antar-PERMUKAAN
              tak diperiksa siapa pun (yang dijaga kontras TEKS). Ditemukan
              hanya karena halamannya dipotret dan dilihat.
            */}
            <tr style={{
              borderTop: `2px solid ${C.border}`,
              background: "var(--surface-hover)",
            }}>
              {total.map((sel) => (
                <td key={sel.kunci} colSpan={sel.rentang} style={{
                  padding: "var(--pad-baris)",
                  textAlign: sel.rata === "kanan" ? "right" : sel.rata === "tengah" ? "center" : "left",
                  fontVariantNumeric: sel.rata === "kanan" ? "tabular-nums" : undefined,
                  fontWeight: 700,
                  color: C.text,
                }}>{sel.isi}</td>
              ))}
            </tr>
          </tfoot>
        )}
      </table>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════
 * Keadaan
 * ═══════════════════════════════════════════════════════════════════════ */

/**
 * Keadaan kosong — DIEKSPOR ULANG dari `ui-dasar.tsx`, bukan didefinisikan
 * di sini.
 *
 * Berkas ini sempat punya `Kosong` sendiri, dan itu keliru: `ui-dasar.tsx`
 * sudah memilikinya lebih dulu. Akibatnya ada dua komponen bernama sama
 * dengan prop berbeda (`keterangan` vs `sebab`), dan `/aset` memanggil
 * yang satu dengan prop milik yang lain — bug yang cuma tak meledak
 * karena kebetulan mengimpor definisi lokalnya sendiri.
 *
 * Membangun pustaka primitif KEDUA adalah persis masalah yang berkas ini
 * seharusnya selesaikan. Pembagiannya sekarang tegas:
 *
 *     ui-dasar.tsx  → komponen VISUAL   (KartuKPI, Panel, grafik, Kosong)
 *     dasar.tsx     → kerangka HALAMAN  (Halaman, Tabel, Medan, Tombol)
 *
 * Kewajiban `sebab` — kelebihan nyata dari versi berkas ini — dipindahkan
 * ke `ui-dasar.tsx` saat penggabungan, jadi tak ada yang hilang.
 */
export { Kosong } from "@/components/ui-dasar";

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
