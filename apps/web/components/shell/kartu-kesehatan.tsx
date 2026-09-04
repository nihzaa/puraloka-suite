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

import { useRef, useState } from "react";
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
  const [memuatAi, setMemuatAi] = useState(false);
  const [sudahMinta, setSudahMinta] = useState(false);

  /*
   * ══════════════════════════════════════════════════════════════════════
   * AI DIPANGGIL SAAT DIKLIK, BUKAN SAAT HALAMAN DIBUKA — diubah 2026-08-09
   * ══════════════════════════════════════════════════════════════════════
   *
   * Founder: *"ai disini ada alternatif gak? soalnya lumayan makan biaya
   * token api nya"*.
   *
   * Diukur sebelum mengubah apa pun, dan sebabnya bukan satu:
   *
   *   1. DUA komponen memanggil endpoint yang sama — kartu ini dan
   *      `rail-asisten` — dan keduanya tampil bersamaan di beranda.
   *      Satu kali buka dashboard = DUA panggilan berbayar.
   *   2. Nol cache: tiap muat ulang halaman memanggil lagi.
   *   3. `useEffect` tanpa syarat berarti biaya keluar bahkan saat orang
   *      cuma lewat di beranda menuju halaman lain.
   *
   * Yang ketiga paling boros justru karena tak terlihat: tak ada yang tahu
   * biayanya keluar.
   *
   * Sekarang kartunya tampil LENGKAP tanpa AI — skor, ring, dan kalimat
   * penilaian deterministik semuanya sudah ada sejak render pertama. AI
   * hanya menambah satu kalimat saran, dan itu diminta secara sadar.
   *
   * `sudahMinta` mencegah panggilan kedua: sesudah jawabannya datang,
   * tombolnya hilang. Kalau orang ingin memperbaruinya, muat ulang halaman —
   * dan itu keputusan sadar juga.
   */
  const minta = useRef(false);

  function mintaWawasan() {
    if (minta.current) return;
    minta.current = true;
    setMemuatAi(true);
    setSudahMinta(true);
    const ac = makeAbortController();
    api.get<JawabanWawasan>("/api/v1/ai/insight", { signal: ac.signal })
      .then((r) => setAi(r.data?.wawasan ?? null))
      .catch(() => setAi(null))
      .finally(() => setMemuatAi(false));
  }

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
          ANGKANYA DI DALAM LINGKARAN.

          Founder 2026-08-09: *"angka 21/100 nya di dalam lingkaran aja
          kayanya"* — dan itu memang bentuk yang benar untuk ring progres:
          lingkaran adalah gauge, dan gauge membaca nilainya di pusatnya.
          Versi sebelumnya menaruh angka di samping, sehingga ring jadi hiasan
          tanpa label dan kolom teks di kanannya harus memuat DUA hal (angka +
          kalimat) dalam lebar yang cuma cukup untuk satu.

          Teks SVG, bukan div ber-`position:absolute` di atasnya: satu elemen,
          ikut menskala dengan `viewBox`, dan tak bisa bergeser dari pusat
          ring kalau ukuran kartunya berubah.

          `aria-hidden` pada ring TETAP — skor dibacakan sekali lewat
          `aria-label` di pembungkusnya, supaya pembaca layar tak mendengar
          "21" lalu "100" sebagai dua angka lepas.
        */}
        <svg
          width={UKURAN} height={UKURAN} viewBox={`0 0 ${UKURAN} ${UKURAN}`}
          role="img" aria-label={`Skor kesehatan ${h.skor} dari 100`}
          focusable="false" style={{ flexShrink: 0 }}
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
          {/*
            `dominantBaseline="central"` bukan `middle`: `middle` menyejajarkan
            ke tengah x-height sehingga angka terlihat turun beberapa piksel
            dari pusat ring — cukup untuk terbaca miring pada lingkaran.
          */}
          <text
            x={UKURAN / 2} y={UKURAN / 2 - 4}
            textAnchor="middle" dominantBaseline="central"
            style={{
              fontFamily: "var(--font-display)", fontSize: 26, fontWeight: 700,
              fill: C.text, fontVariantNumeric: "tabular-nums",
            }}
          >
            {h.skor}
          </text>
          <text
            x={UKURAN / 2} y={UKURAN / 2 + 15}
            textAnchor="middle" dominantBaseline="central"
            style={{ fontSize: "var(--t-kecil)", fontWeight: 500, fill: C.mid }}
          >
            /100
          </text>
        </svg>

        <div style={{ minWidth: 0 }}>
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
        TOMBOL AI — hanya tampil kalau belum pernah diminta.

        Labelnya menyebut "AI" secara terus terang, bukan "muat saran": orang
        berhak tahu bahwa mengklik ini memanggil layanan berbayar. Itu
        sebabnya ia tak dijalankan otomatis.

        Sesudah dijawab, tombolnya HILANG (bukan jadi "muat ulang") —
        menyediakan tombol ulang di sebelah jawaban yang sudah ada adalah
        undangan mengeklik dua kali untuk kalimat yang hampir sama.
      */}
      {!sudahMinta && (
        <button
          type="button"
          onClick={mintaWawasan}
          style={{
            display: "inline-flex", alignItems: "center", gap: 6,
            alignSelf: "flex-start",
            padding: "6px 10px", borderRadius: "var(--rad-sedang)",
            border: "1px solid var(--border)", background: "var(--surface-subtle)",
            fontSize: "var(--t-kecil)", fontWeight: 600, color: "var(--navy)",
            cursor: "pointer", transition: "background 150ms ease",
          }}
          onMouseEnter={(e) => { e.currentTarget.style.background = "var(--surface-hover)"; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = "var(--surface-subtle)"; }}
        >
          <Sparkles size={13} aria-hidden="true" />
          Minta saran AI
        </button>
      )}

      {memuatAi && (
        <p style={{ margin: 0, fontSize: "var(--t-kecil)", color: C.mid }}>
          Menyusun saran…
        </p>
      )}

      {/*
        AI diminta, tetapi tak menjawab. Dinyatakan, bukan didiamkan: tombol
        yang hilang tanpa hasil apa pun terbaca sebagai aplikasi rusak.
        Skornya sendiri tak terpengaruh — ia tak pernah datang dari AI.
      */}
      {sudahMinta && !memuatAi && !ai?.rekomendasi && (
        <p style={{ margin: 0, fontSize: "var(--t-kecil)", color: C.mid }}>
          Saran AI belum tersedia. Angka di atas tetap dihitung dari data Anda.
        </p>
      )}

      {/*
        Penutup menyebut CARA hitungnya, dan tautan ke tempat angkanya bisa
        ditelusuri. Referensi punya tombol "View Full AI Analysis" yang tak
        menjelaskan apa-apa — dan justru itu yang membuat "78/100" tak bisa
        ditindaklanjuti: orang tak tahu apa yang harus diperbaiki.

        Tautannya ke /proyek, DIPERIKSA ke disk — bukan halaman analisis khayalan.
      */}
      {/*
        SATU TAUTAN, bukan paragraf penjelasan.

        Sebelumnya di sini ada kalimat "Dihitung dari invoice lewat tempo,
        milestone telat, proyek mandek, dan proyek lewat tenggat." — empat baris
        pada kolom selebar ini. Founder benar bahwa itu berlebihan: kartunya
        ikut memanjang, dan karena hero di sebelahnya meregang menyamai tinggi
        tetangganya, HERO ikut jadi 386px untuk isi yang cuma ~200px.

        Penjelasan cara hitungnya tidak dibuang, hanya dipindah ke tempat yang
        memang untuk membaca panjang — halaman analisis. Yang tersisa di sini
        satu tautan, persis "View Full AI Analysis" referensi.
      */}
      <div style={{ paddingTop: 8, borderTop: "1px solid var(--border)" }}>
        <Link
          href="/proyek"
          style={{
            display: "inline-flex", alignItems: "center", gap: 4,
            fontSize: "var(--t-kecil)", fontWeight: 600, color: "var(--navy)",
            textDecoration: "none",
          }}
        >
          Lihat analisis lengkap
          <ArrowRight size={13} aria-hidden="true" />
        </Link>
      </div>
    </section>
  );
}
