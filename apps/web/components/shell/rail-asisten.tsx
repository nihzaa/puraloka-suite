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
 *                 `/api/v1/ai/insight` (Claude, `claude-opus-5`). Kalimat
 *                 yang tampil di sini datang dari sana.
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

import { useEffect, useState } from "react";
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
  const [selesai, setSelesai] = useState(false);

  useEffect(() => {
    const ac = makeAbortController();
    api
      .get<JawabanWawasan>("/api/v1/ai/insight", { signal: ac.signal })
      .then((r) => setWawasan(r.data?.wawasan ?? null))
      .catch(() => setWawasan(null))
      .finally(() => setSelesai(true));
    return () => ac.abort();
  }, []);

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
        {!selesai ? (
          <div style={{
            height: 34, borderRadius: "var(--rad-sedang)",
            background: "var(--surface-hover)",
          }} />
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
        */}
        <Link
          href="/proyek"
          style={{
            display: "inline-flex", alignItems: "center", gap: 4, marginTop: 10,
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
