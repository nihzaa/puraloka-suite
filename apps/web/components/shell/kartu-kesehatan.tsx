"use client";

/**
 * KARTU KESEHATAN — pendamping hero, di posisi kartu "AI Insights" referensi.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * BENTUKNYA MENIRU REFERENSI, ANGKANYA TIDAK
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Referensi: ring skor + "78/100 Project Success Probability" + satu baris
 * "Key Insight" + tombol. Bentuk itu bagus dan ditiru.
 *
 * Isinya berbeda pada satu hal yang menentukan: **78 itu karangan.** Tak ada
 * model di baliknya, dan kata "probability" menjanjikan ramalan yang tak
 * pernah dihitung. Yang di sini hasil aritmetika atas data nyata
 * (`lib/kesehatan.ts`, 10 test) — karena itu judulnya **Kesehatan
 * portofolio**, bukan "AI".
 *
 * Sesuai brief §7.2: yang bisa dihitung deterministik boleh tampil sekarang,
 * asal namanya jujur. Wadah AI yang sesungguhnya ada di rail (`RailAsisten`)
 * dan menunggu modelnya.
 *
 * ── Ring digambar SVG, bukan pustaka chart
 *
 * Satu lingkaran progres tak butuh Recharts. `stroke-dasharray` cukup, dan ia
 * tak menambah satu byte pun ke bundle awal.
 */

import { hitungKesehatan, type MasukanKesehatan } from "@/lib/kesehatan";
import { C } from "@/lib/warna-ui";

const UKURAN = 96;
const TEBAL = 8;
const R = (UKURAN - TEBAL) / 2;
const KELILING = 2 * Math.PI * R;

export function KartuKesehatan({ masukan }: { masukan: MasukanKesehatan }) {
  const h = hitungKesehatan(masukan);

  const warna =
    h.nada === "baik" ? "var(--success)"
    : h.nada === "perhatian" ? "var(--warning)"
    : "var(--danger)";

  return (
    <section
      aria-labelledby="kesehatan-judul"
      style={{
        background: "var(--surface)",
        border: "1px solid var(--border)",
        borderRadius: "var(--rad-besar)",
        padding: "var(--pad-kartu)",
        display: "flex", flexDirection: "column", gap: 10,
        minWidth: 0,
      }}
    >
      <h2 id="kesehatan-judul" style={{
        margin: 0, fontSize: "var(--t-kecil)", fontWeight: 700,
        letterSpacing: ".04em", textTransform: "uppercase", color: C.mid,
      }}>
        Kesehatan portofolio
      </h2>

      <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
        {/*
          Ring: dua lingkaran bertumpuk — jalur redup + busur berwarna.
          `aria-hidden` karena angkanya sudah ditulis sebagai teks di sebelahnya;
          dibacakan dua kali hanya jadi kebisingan.
        */}
        <svg
          width={UKURAN} height={UKURAN} viewBox={`0 0 ${UKURAN} ${UKURAN}`}
          aria-hidden="true" focusable="false" style={{ flexShrink: 0 }}
        >
          <circle
            cx={UKURAN / 2} cy={UKURAN / 2} r={R}
            fill="none" stroke="var(--surface-hover)" strokeWidth={TEBAL}
          />
          <circle
            cx={UKURAN / 2} cy={UKURAN / 2} r={R}
            fill="none" stroke={warna} strokeWidth={TEBAL} strokeLinecap="round"
            strokeDasharray={`${(h.skor / 100) * KELILING} ${KELILING}`}
            transform={`rotate(-90 ${UKURAN / 2} ${UKURAN / 2})`}
            style={{ transition: "stroke-dasharray 600ms cubic-bezier(0.16,1,0.3,1)" }}
          />
        </svg>

        <div style={{ minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: 3 }}>
            <span style={{
              fontFamily: "var(--font-display)", fontSize: 30, fontWeight: 700,
              lineHeight: 1, color: C.text, fontVariantNumeric: "tabular-nums",
            }}>
              {h.skor}
            </span>
            <span style={{ fontSize: 13, color: C.mid, fontWeight: 500 }}>/100</span>
          </div>
          <p style={{ margin: "6px 0 0", fontSize: "var(--t-badan)", color: C.mid, lineHeight: 1.45 }}>
            {h.sorotan
              ? <>Paling menekan: <strong style={{ color: C.text, fontWeight: 600 }}>{h.sorotan}</strong></>
              : "Tak ada yang menekan skor saat ini."}
          </p>
        </div>
      </div>

      {/*
        Kalimat penutup menyebut CARA hitungnya. Referensi tak melakukannya —
        dan justru itu yang membuat "78/100" tak bisa ditindaklanjuti: orang tak
        tahu apa yang harus diperbaiki untuk menaikkannya.
      */}
      <p style={{
        margin: 0, paddingTop: 8, borderTop: "1px solid var(--border)",
        fontSize: 11, color: C.muted, lineHeight: 1.45,
      }}>
        Dihitung dari invoice lewat tempo, milestone telat, proyek mandek, dan
        proyek lewat tenggat.
      </p>
    </section>
  );
}
