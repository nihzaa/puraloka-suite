"use client";

/**
 * ASISTEN — wadah untuk AI, dengan keadaan yang JUJUR.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * KENAPA WADAHNYA DIBANGUN SEKARANG, ISINYA BELUM
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Founder: *"nantinya memang akan diintegrasikan dengan AI"* — jadi tempatnya
 * disiapkan sekarang supaya tata letak tak perlu dirombak lagi nanti.
 *
 * Diukur 2026-08-08 dan DIPERBARUI hari yang sama: endpoint AI pertama sudah
 * ada — `/api/v1/ai/insight`, dipakai kartu Kesehatan Portofolio di beranda.
 * Yang belum ada adalah **asisten percakapan**, yaitu yang dijanjikan panel
 * ini: tempat bertanya bebas, bukan satu kalimat penjelas yang sudah tampil
 * di tempat lain.
 *
 * Jadi lencananya tetap "SEGERA", tetapi sekarang atas alasan yang sempit dan
 * bisa diperiksa — bukan "AI belum ada sama sekali", yang sudah tidak benar.
 * Peringatan yang basi menyesatkan sesi berikutnya persis seperti angka yang
 * basi (CLAUDE.md §5.5).
 *
 * Referensi mengisi panel ini dengan "78/100 Project Success Probability" dan
 * empat chip saran yang bisa diklik. Kalau ditiru apa adanya, kita memasang
 * tombol yang tak melakukan apa pun dan angka yang tak dihitung dari apa pun.
 * Itu bukan fitur — itu maket. Brief §7.1 menyebutnya terus terang:
 * *"bangun wadahnya, jangan palsukan isinya."*
 *
 * ── Yang TIDAK kosong: peringatan deterministik
 *
 * Brief §7.2 memberi jalan tengah yang jujur: apa pun yang bisa **dihitung**
 * dari data nyata boleh tampil sekarang — dan namanya bukan "AI", melainkan
 * **Peringatan Sistem**. Itulah yang dilakukan `RailFokus` di atasnya, dan
 * itu sebabnya kartu ini tak perlu berpura-pura pintar untuk berguna.
 */

import { Sparkles } from "lucide-react";
import { C } from "@/lib/warna-ui";

export function RailAsisten() {
  return (
    <section
      aria-labelledby="rail-asisten-judul"
      style={{
        background: "var(--surface)",
        border: "1px solid var(--border)",
        borderRadius: "var(--rad-besar)",
        overflow: "hidden",
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
        {/*
          Lencana "Segera" — bukan "Beta" seperti referensi. "Beta" menyiratkan
          ada yang bisa dicoba; di sini belum ada apa-apa untuk dicoba, dan
          menyiratkan sebaliknya adalah janji yang tak ditepati sejak hari
          pertama.
        */}
        <span style={{
          marginInlineStart: "auto", flexShrink: 0,
          padding: "1px 7px", borderRadius: "var(--rad-pil)",
          background: "var(--surface-hover)", color: C.mid,
          fontSize: 10, fontWeight: 700, letterSpacing: ".03em",
        }}>
          SEGERA
        </span>
      </header>

      <div style={{ padding: "var(--pad-kartu)" }}>
        <p style={{
          margin: 0, fontSize: "var(--t-badan)", color: C.mid, lineHeight: 1.5,
        }}>
          Tanya-jawab bebas belum aktif. Sementara ini, pembacaan AI atas
          kondisi portofolio sudah tampil di{" "}
          <strong style={{ color: C.text, fontWeight: 600 }}>Kesehatan portofolio</strong>{" "}
          di beranda, dan hal yang menunggu keputusan ada di{" "}
          <strong style={{ color: C.text, fontWeight: 600 }}>Perlu keputusan</strong>{" "}
          di atas.
        </p>
      </div>
    </section>
  );
}
