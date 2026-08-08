"use client";

/**
 * KARTU KESEHATAN — pendamping hero, di posisi kartu "AI Insights" referensi.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * BENTUKNYA MENIRU REFERENSI, ANGKANYA TIDAK
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Referensi: ring skor + "78/100 Project Success Probability" + satu baris
 * "Key Insight" + tombol "View Full AI Analysis". Bentuk itu bagus dan ditiru
 * seluruhnya — keempat bagiannya ada di sini.
 *
 * Isinya berbeda pada satu hal yang menentukan: **78 itu karangan.** Tak ada
 * model di baliknya, dan kata "probability" menjanjikan ramalan yang tak
 * pernah dihitung.
 *
 * Di sini tugasnya DIBAGI, dan pembagian itu yang membuat kartunya jujur:
 *
 *   SKOR (ring)     dihitung deterministik dari data nyata — `lib/kesehatan.ts`,
 *                   10 test. Model tak pernah menyentuhnya.
 *   KALIMAT         dari Claude lewat `/api/v1/ai/insight`, dan HANYA kalimat.
 *                   Skema jawabannya cuma punya dua field teks, jadi model
 *                   tak punya tempat untuk menaruh angka karangan.
 *
 * ── Kalau AI tak menjawab, kartunya tidak rusak
 *
 * Kunci belum dipasang, kuota habis, jaringan putus — endpoint tetap membalas
 * 200 dengan `sumber: "deterministik"`, dan kartu ini memakai kalimat yang
 * dihitung sendiri (`h.sorotan`). Skornya sama persis di kedua keadaan, karena
 * skor memang tak pernah datang dari AI.
 *
 * Itu sebabnya AI di sini tak diberi keadaan "gagal" yang terlihat: yang gagal
 * cuma kalimat penjelasnya, dan versi deterministiknya sudah cukup.
 *
 * ── Ring digambar SVG, bukan pustaka chart
 *
 * Satu lingkaran progres tak butuh Recharts. `stroke-dasharray` cukup, dan ia
 * tak menambah satu byte pun ke bundle awal.
 */

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight, Sparkles } from "lucide-react";
import { api, makeAbortController } from "@/lib/api";
import { hitungKesehatan, type MasukanKesehatan } from "@/lib/kesehatan";
import { C } from "@/lib/warna-ui";

const UKURAN = 96;
const TEBAL = 8;
const R = (UKURAN - TEBAL) / 2;
const KELILING = 2 * Math.PI * R;

/** Bentuk jawaban `/api/v1/ai/insight`. `wawasan` null = jalur deterministik. */
interface JawabanWawasan {
  sumber: "ai" | "deterministik";
  wawasan: { penilaian: string; rekomendasi: string } | null;
}

export function KartuKesehatan({ masukan }: { masukan: MasukanKesehatan }) {
  const h = hitungKesehatan(masukan);
  const [ai, setAi] = useState<JawabanWawasan["wawasan"]>(null);

  /*
   * Dipanggil terpisah dari data dashboard, dan sengaja: panggilan ke model
   * jauh lebih lambat daripada query DB. Kalau digabung, seluruh kartu — skor
   * termasuk — menunggu jaringan pihak ketiga sebelum tampil.
   *
   * Galat sengaja tidak ditampilkan. Yang hilang cuma kalimat penjelas, dan
   * versi deterministiknya sudah terpasang sejak render pertama.
   */
  useEffect(() => {
    const ac = makeAbortController();
    api.get<JawabanWawasan>("/api/v1/ai/insight", { signal: ac.signal })
      .then((r) => setAi(r.data?.wawasan ?? null))
      .catch(() => setAi(null));
    return () => ac.abort();
  }, []);

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
          {/*
            Kalimat penilaian. Versi AI kalau ada, versi hitungan kalau tidak —
            dan keduanya sama-sama sah, jadi tak ada keadaan "sedang memuat"
            yang berkedip di sini.
          */}
          <p style={{ margin: "6px 0 0", fontSize: "var(--t-badan)", color: C.mid, lineHeight: 1.45 }}>
            {ai?.penilaian
              ? ai.penilaian
              : h.sorotan
                ? <>Paling menekan: <strong style={{ color: C.text, fontWeight: 600 }}>{h.sorotan}</strong></>
                : "Tak ada yang menekan skor saat ini."}
          </p>
        </div>
      </div>

      {/*
        "Key Insight" referensi — muncul HANYA kalau AI benar-benar menjawab.
        Blok kosong berlabel "Key Insight" adalah janji yang tak ditepati; lebih
        baik kartunya sedikit lebih pendek.
      */}
      {ai?.rekomendasi && (
        <div style={{
          display: "flex", gap: 8, alignItems: "flex-start",
          padding: "8px 10px", borderRadius: "var(--rad-sedang)",
          background: "var(--navy-light)",
        }}>
          <span aria-hidden="true" style={{ flexShrink: 0, marginTop: 1, color: "var(--navy)" }}>
            <Sparkles size={14} />
          </span>
          <p style={{ margin: 0, fontSize: "var(--t-badan)", color: C.text, lineHeight: 1.45 }}>
            <strong style={{ fontWeight: 700 }}>Saran:</strong> {ai.rekomendasi}
          </p>
        </div>
      )}

      {/*
        Penutup menyebut CARA hitungnya, dan tautan ke tempat angkanya bisa
        ditelusuri. Referensi punya tombol "View Full AI Analysis" yang tak
        menjelaskan apa-apa — dan justru itu yang membuat "78/100" tak bisa
        ditindaklanjuti: orang tak tahu apa yang harus diperbaiki.

        Tautannya ke /proyek, DIPERIKSA ke disk — bukan halaman analisis khayalan.
      */}
      <div style={{
        display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap",
        paddingTop: 8, borderTop: "1px solid var(--border)",
      }}>
        <p style={{ margin: 0, fontSize: 11, color: C.muted, lineHeight: 1.45, flex: 1, minWidth: 140 }}>
          Dihitung dari invoice lewat tempo, milestone telat, proyek mandek, dan
          proyek lewat tenggat.
        </p>
        <Link
          href="/proyek"
          style={{
            display: "inline-flex", alignItems: "center", gap: 4, flexShrink: 0,
            fontSize: "var(--t-kecil)", fontWeight: 600, color: "var(--navy)",
            textDecoration: "none",
          }}
        >
          Telusuri proyek
          <ArrowRight size={13} aria-hidden="true" />
        </Link>
      </div>
    </section>
  );
}
