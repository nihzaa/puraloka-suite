"use client";

/**
 * RAIL FOKUS — versi TERURAI dari "Fokus hari ini".
 *
 * ══════════════════════════════════════════════════════════════════════════
 * KENAPA ADA, PADAHAL SIDEBAR SUDAH PUNYA
 * ══════════════════════════════════════════════════════════════════════════
 *
 * `SidebarFokus` dan komponen ini membaca endpoint yang SAMA
 * (`/api/v1/dashboard/fokus`) dan sengaja hidup berdampingan, dengan pembagian
 * kerja yang tegas:
 *
 *   SIDEBAR   ~196px · dua angka total · hadir di SETIAP halaman
 *   RAIL      ~300px · lima baris terurai · hanya di halaman IKHTISAR
 *
 * Sidebar tak dicabut justru karena rail bisa mati: di halaman tabel (RAB,
 * buku besar, daftar upah) rail tidak dipasang, dan di situlah orang paling
 * lama bekerja. Kalau fokus hanya hidup di rail, yang mendesak menghilang
 * persis saat orang sedang tenggelam dalam pekerjaan lain.
 *
 * Yang berubah hanya KERINCIAN, bukan sumbernya. Server sudah lama mengirim
 * lima angka terpisah; sidebar membuangnya karena memang tak muat.
 *
 * ── Yang dijaga di sini
 *
 * **Nol adalah kabar baik, dan harus terlihat begitu.** Widget yang menghilang
 * saat kosong membuat orang bertanya apakah ia rusak. Aturan ini diwarisi dari
 * `SidebarFokus`, dan sengaja tidak ditafsir ulang.
 *
 * **Gagal memuat ≠ tidak ada yang menunggu.** Menampilkan "0" pada data yang
 * tak terbaca adalah kebohongan yang menenangkan — kartunya disembunyikan.
 *
 * **Angka pakai `tabular-nums`.** Lima baris angka yang tak sejajar terbaca
 * sebagai daftar yang tak dirawat.
 */

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { AlertTriangle, CheckCircle2, ChevronRight, Clock } from "lucide-react";
import { api, makeAbortController } from "@/lib/api";
import { barisFokus, totalFokus, type RincianFokus } from "@/lib/fokus";
import { C } from "@/lib/warna-ui";

interface Jawaban {
  lewat: number;
  menunggu: number;
  tautan: string;
  rincian?: RincianFokus;
}

export function RailFokus() {
  const [data, setData] = useState<Jawaban | null>(null);
  const [gagal, setGagal] = useState(false);

  const muat = useCallback((signal?: AbortSignal) => {
    return api
      .get<Jawaban>("/api/v1/dashboard/fokus", { signal })
      .then((r) => { setData(r.data); setGagal(false); })
      .catch((e) => {
        if (e?.name === "CanceledError") return;
        setGagal(true);
      });
  }, []);

  useEffect(() => {
    const ac = makeAbortController();
    muat(ac.signal);
    return () => ac.abort();
  }, [muat]);

  if (gagal || !data) return null;

  const baris = barisFokus(data.rincian);
  const { lewat } = totalFokus(baris);

  return (
    <section
      aria-labelledby="rail-fokus-judul"
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
          borderBottom: baris.length ? "1px solid var(--border)" : "none",
        }}
      >
        <h2
          id="rail-fokus-judul"
          style={{
            margin: 0, fontSize: "var(--t-kecil)", fontWeight: 700,
            letterSpacing: ".04em", textTransform: "uppercase",
            color: C.mid,
          }}
        >
          Perlu keputusan
        </h2>
        {lewat > 0 && (
          <span
            style={{
              display: "inline-flex", alignItems: "center", gap: 4,
              padding: "2px 8px", borderRadius: "var(--rad-pil)",
              background: "var(--danger-bg)", color: "var(--danger)",
              fontSize: 11, fontWeight: 700, fontVariantNumeric: "tabular-nums",
            }}
          >
            <AlertTriangle size={11} aria-hidden="true" />
            {lewat} lewat
          </span>
        )}
      </header>

      {baris.length === 0 ? (
        <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "var(--pad-kartu)" }}>
          <CheckCircle2 size={16} color="var(--success)" aria-hidden="true" />
          <span style={{ fontSize: "var(--t-badan)", color: C.mid }}>
            Tidak ada yang menunggu keputusan
          </span>
        </div>
      ) : (
        <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
          {baris.map((b, i) => (
            <li key={b.kunci} style={{ borderTop: i === 0 ? "none" : "1px solid var(--border)" }}>
              <Link
                href={b.href}
                style={{
                  display: "flex", alignItems: "center", gap: 10,
                  padding: "10px var(--pad-kartu)", textDecoration: "none",
                  transition: "background 150ms ease",
                }}
                onMouseEnter={(e) => { e.currentTarget.style.background = "var(--surface-hover)"; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
              >
                {/*
                  Ikon MENGULANG informasi nada, bukan menggantikannya — lencana
                  angka di kanan sudah berwarna, dan warna saja tak boleh jadi
                  satu-satunya pembawa makna (WCAG 1.4.1). Labelnya pun sudah
                  menyebut "jatuh tempo" / "menunggu".
                */}
                {b.nada === "lewat"
                  ? <AlertTriangle size={14} color="var(--danger)" aria-hidden="true" style={{ flexShrink: 0 }} />
                  : <Clock size={14} color={C.mid} aria-hidden="true" style={{ flexShrink: 0 }} />}

                <span style={{
                  flex: 1, minWidth: 0, fontSize: "var(--t-badan)",
                  color: C.text, lineHeight: 1.35,
                }}>
                  {b.label}
                </span>

                <span style={{
                  fontSize: 13, fontWeight: 700, fontVariantNumeric: "tabular-nums",
                  color: b.nada === "lewat" ? "var(--danger)" : C.text,
                  flexShrink: 0,
                }}>
                  {b.jumlah}
                </span>
                <ChevronRight size={13} color={C.mid} aria-hidden="true" style={{ flexShrink: 0 }} />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
