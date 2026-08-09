"use client";

/**
 * ASISTEN — kartu AI di rail, bentuk referensi dengan isi yang jujur.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * APA YANG SUDAH NYATA, APA YANG BELUM
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Referensi: sapaan, empat chip saran, dan kolom "Type your question...".
 * Bentuk itu ditiru — tapi hanya bagian yang benar-benar bekerja.
 *
 *   SUDAH NYATA   pembacaan AI atas kondisi portofolio, lewat
 *                 `/api/v1/ai/insight`. Kalimat yang tampil di sini datang
 *                 dari sana. Modelnya dibaca dari env (`ANTHROPIC_MODEL`,
 *                 bawaan Haiku) — jangan sebut nama model di komentar ini,
 *                 ia akan basi begitu env-nya diganti.
 *   BELUM ADA     tanya-jawab bebas. Tak ada endpoint percakapan, tak ada
 *                 riwayat, tak ada konteks.
 *
 * Karena itu **kolom input tidak dipasang**. Kolom teks yang tak bisa dikirim
 * adalah janji yang tak ditepati sejak piksel pertama — dan itu persis cacat
 * "View Full AI Analysis" di referensi yang sedang kita hindari (§9).
 *
 * Chip saran juga tidak: keempatnya di referensi memicu percakapan, dan tanpa
 * percakapan ia cuma tombol yang tak melakukan apa-apa.
 *
 * ── Yang tampil sebagai gantinya
 *
 * Satu kalimat pembacaan AI + tautan ke kartu Kesehatan Portofolio yang
 * memuat angkanya. Lebih sedikit daripada referensi, tetapi seluruhnya bisa
 * ditindaklanjuti.
 */

import { useRef, useState } from "react";
import Link from "next/link";
import { ArrowRight, Sparkles } from "lucide-react";
import { api, makeAbortController } from "@/lib/api";
import { C } from "@/lib/warna-ui";

interface JawabanWawasan {
  sumber: "ai" | "deterministik";
  wawasan: { penilaian: string; rekomendasi: string } | null;
}

export function RailAsisten() {
  const [wawasan, setWawasan] = useState<JawabanWawasan["wawasan"]>(null);
  const [memuat, setMemuat] = useState(false);
  const [selesai, setSelesai] = useState(false);

  /*
   * ══════════════════════════════════════════════════════════════════════
   * DIPANGGIL SAAT DIKLIK, BUKAN SAAT RAIL DIRENDER — diubah 2026-08-09
   * ══════════════════════════════════════════════════════════════════════
   *
   * Founder: *"ai disini ada alternatif gak? soalnya lumayan makan biaya
   * token api nya"*.
   *
   * Kartu ini penyumbang biaya TERBESAR di antara dua pemanggil endpoint AI,
   * dan sebabnya letaknya: rail hidup di beranda, jadi `useEffect` di sini
   * memanggil model SETIAP KALI beranda dibuka — termasuk saat orang cuma
   * lewat menuju halaman lain. Digabung kartu Kesehatan yang memanggil
   * endpoint yang sama, satu kali buka beranda = dua panggilan berbayar.
   *
   * Sekarang kartunya tampil dengan tombol, dan biaya hanya keluar saat
   * seseorang benar-benar menginginkan pembacaannya.
   *
   * `pemicu.jalan` (bukan state) mencegah klik ganda memanggil dua kali:
   * state React diperbarui asinkron, jadi dua klik cepat berturut-turut bisa
   * lolos dari penjagaan berbasis `memuat`.
   */
  const pemicu = useRef(false);

  function mintaWawasan() {
    if (pemicu.current) return;
    pemicu.current = true;
    setMemuat(true);
    const ac = makeAbortController();
    api
      .get<JawabanWawasan>("/api/v1/ai/insight", { signal: ac.signal })
      .then((r) => setWawasan(r.data?.wawasan ?? null))
      .catch(() => setWawasan(null))
      .finally(() => { setMemuat(false); setSelesai(true); });
  }

  return (
    <section
      aria-labelledby="rail-asisten-judul"
      style={{
        background: "var(--surface)",
        border: "1px solid var(--border)",
        borderRadius: "var(--rad-besar)",
        overflow: "hidden",
        flexShrink: 0,
      }}
    >
      <header style={{
        display: "flex", alignItems: "center", gap: 8,
        padding: "var(--pad-kartu)",
        borderBottom: "1px solid var(--border)",
      }}>
        <span aria-hidden="true" style={{
          display: "grid", placeItems: "center", flexShrink: 0,
          width: 26, height: 26, borderRadius: "var(--rad-sedang)",
          background: "var(--navy-light)", color: "var(--navy)",
        }}>
          <Sparkles size={14} />
        </span>
        <h2 id="rail-asisten-judul" style={{
          margin: 0, fontSize: "var(--t-kecil)", fontWeight: 700,
          letterSpacing: ".04em", textTransform: "uppercase", color: C.mid,
        }}>
          Asisten
        </h2>
      </header>

      <div style={{ padding: "var(--pad-kartu)" }}>
        {!selesai && !memuat ? (
          /*
            KEADAAN AWAL — tombol, bukan kerangka pemuatan.

            Kerangka abu-abu di sini akan berbohong: ia menyiratkan sesuatu
            sedang dimuat, padahal tak ada permintaan yang berjalan. Yang
            benar adalah menyatakan bahwa pembacaan itu TERSEDIA dan menunggu
            diminta.

            Kalimat di atas tombol menjelaskan apa yang akan didapat, supaya
            orang tak perlu mengklik untuk tahu apa gunanya.
          */
          <>
            <p style={{
              margin: 0, fontSize: "var(--t-badan)", color: C.mid, lineHeight: 1.5,
            }}>
              Minta pembacaan singkat atas kondisi portofolio Anda.
            </p>
            <button
              type="button"
              onClick={mintaWawasan}
              style={{
                /*
                  `flex` + `width: fit-content`, BUKAN `inline-flex`.

                  Pembungkusnya BLOK biasa, bukan kolom flex — jadi
                  `alignSelf` tak berlaku dan `inline-flex` membuat tombol ini
                  berbagi baris dengan tautan "Telusuri proyek" di bawahnya.
                  Di rail 275px keduanya bertabrakan; di beranda tak terlihat
                  karena kartunya lebih lebar.
                */
                display: "flex", width: "fit-content",
                alignItems: "center", gap: 6, marginTop: 10,
                padding: "6px 10px", borderRadius: "var(--rad-sedang)",
                border: "1px solid var(--border)", background: "var(--surface-subtle)",
                fontSize: "var(--t-kecil)", fontWeight: 600, color: "var(--navy)",
                cursor: "pointer", transition: "background 150ms ease",
              }}
              onMouseEnter={(e) => { e.currentTarget.style.background = "var(--surface-hover)"; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = "var(--surface-subtle)"; }}
            >
              <Sparkles size={13} aria-hidden="true" />
              Minta pembacaan AI
            </button>
          </>
        ) : memuat ? (
          <div
            role="status"
            aria-live="polite"
            style={{
              height: 34, borderRadius: "var(--rad-sedang)",
              background: "var(--surface-hover)",
              display: "grid", placeItems: "center",
              fontSize: "var(--t-kecil)", color: C.mid,
            }}
          >
            Membaca portofolio…
          </div>
        ) : wawasan ? (
          <>
            <p style={{
              margin: 0, fontSize: "var(--t-badan)", color: C.text, lineHeight: 1.5,
            }}>
              {wawasan.penilaian}
            </p>
            <p style={{
              margin: "8px 0 0", padding: "8px 10px",
              borderRadius: "var(--rad-sedang)", background: "var(--navy-light)",
              fontSize: 12, color: C.text, lineHeight: 1.45,
            }}>
              <strong style={{ fontWeight: 700 }}>Saran:</strong> {wawasan.rekomendasi}
            </p>
          </>
        ) : (
          /*
            AI tak menjawab (kunci belum dipasang, kuota habis, jaringan
            putus). Kartunya berkata terus terang alih-alih menghilang —
            widget yang lenyap terbaca sebagai aplikasi rusak.
          */
          <p style={{
            margin: 0, fontSize: "var(--t-badan)", color: C.mid, lineHeight: 1.5,
          }}>
            Pembacaan AI belum tersedia saat ini. Angka portofolio tetap
            dihitung dan tampil di{" "}
            <strong style={{ color: C.text, fontWeight: 600 }}>Kesehatan portofolio</strong>.
          </p>
        )}

        {/*
          Tak ada kolom input dan tak ada chip saran — keduanya butuh endpoint
          percakapan yang belum ada. Yang dipasang cuma tautan ke tempat
          angkanya bisa ditelusuri, dan tautan itu benar-benar bekerja.

          `display: flex` (blok), BUKAN `inline-flex`.

          Tombol "Minta pembacaan AI" di atas juga `inline-flex`, dan di rail
          selebar 275px keduanya berebut satu baris — tombolnya menabrak
          tautan ini. Terlihat di tangkapan layar `/keuangan` sesudah rail
          dipasang; di beranda tak pernah muncul karena kartunya lebih lebar.

          Blok memaksa keduanya bertumpuk, apa pun lebar railnya.
        */}
        <Link
          href="/proyek"
          style={{
            display: "flex", alignItems: "center", gap: 4, marginTop: 10,
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
