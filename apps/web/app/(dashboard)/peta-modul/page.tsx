"use client";

/**
 * PETA MODUL — satu halaman yang menjawab "apa saja yang ada di produk ini".
 *
 * ══════════════════════════════════════════════════════════════════════════
 * KENAPA HALAMAN INI ADA
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Sampai 2026-08-07, sidebar memuat 228 item — dan **108 di antaranya menunjuk
 * halaman "segera hadir"**. Hampir separuh sidebar adalah janji, dan tiap janji
 * itu baru ketahuan sesudah diklik.
 *
 * Sidebar dirombak jadi 74 item: hanya halaman yang benar-benar ada. Yang
 * hilang bukan informasinya, melainkan **cara menyampaikannya**: 108 item yang
 * masing-masing mengecewakan saat diklik diganti satu halaman yang
 * menjawabnya sekaligus.
 *
 * ── Kenapa ini lebih berguna, bukan sekadar lebih ringkas
 *
 * Pertanyaan yang sebenarnya dibawa orang bukan "apakah menu X ada?" melainkan
 * "apa yang sudah bisa saya pakai, dan apa yang masih ditunggu?". Sidebar tak
 * pernah bisa menjawab itu — ia hanya bisa menampilkan daftar. Halaman ini
 * menjawabnya dalam satu layar, lengkap dengan alasan tiap penantian.
 *
 * ── Lima status, dan kenapa tak boleh diratakan
 *
 *   hidup      bisa dipakai sekarang
 *   sebagian   sebagian lapisnya jalan; sisanya belum
 *   rencana    akan dibangun
 *   gerbang    sengaja menunggu pemicu (mis. "menunggu tender mensyaratkan")
 *   eksternal  keputusan sadar untuk TIDAK dibangun — dikerjakan di alat lain
 *
 * Menyamakan `rencana` dengan `eksternal` membuat pembaca menghitung seluruhnya
 * sebagai utang, padahal sebagian adalah pilihan. Itu sebabnya tiap status
 * punya warna, ikon, DAN kata sendiri — bukan warna saja (WCAG 1.4.1).
 */

import { useMemo, useState } from "react";
import { KepalaHalaman } from "@/components/dasar";
import Link from "next/link";
import {
  CircleCheck, CircleDashed, Clock, ExternalLink, Lock, Search, Map } from "lucide-react";
import { PETA_MENU, rekapStatus, type StatusMenu } from "@/lib/peta-menu";
import { C } from "@/lib/warna-ui";
import { TabBagian } from "@/components/tab-bagian";

const RUPA: Record<StatusMenu, { label: string; warna: string; bg: string; border: string; Icon: typeof Clock }> = {
  hidup: {
    label: "Bisa dipakai", warna: "var(--success)", bg: "var(--success-bg)",
    border: "var(--success-border)", Icon: CircleCheck,
  },
  sebagian: {
    label: "Sebagian jalan", warna: "var(--warning)", bg: "var(--warning-bg)",
    border: "var(--warning-border)", Icon: CircleDashed,
  },
  rencana: {
    label: "Direncanakan", warna: C.mid, bg: "var(--surface-subtle)",
    border: "var(--border)", Icon: Clock,
  },
  gerbang: {
    label: "Menunggu pemicu", warna: "var(--info)", bg: "var(--info-bg)",
    border: "var(--info-border)", Icon: Lock,
  },
  eksternal: {
    label: "Pakai alat lain", warna: C.mid, bg: "var(--surface-subtle)",
    border: "var(--border)", Icon: ExternalLink,
  },
};

const SARING = ["semua", "hidup", "sebagian", "rencana", "gerbang", "eksternal"] as const;
type Saring = (typeof SARING)[number];

export default function PetaModulPage() {
  const [saring, setSaring] = useState<Saring>("semua");
  const [cari, setCari] = useState("");
  const rekap = useMemo(() => rekapStatus(), []);

  const kata = cari.trim().toLowerCase();
  const grup = useMemo(() => PETA_MENU.map((g) => ({
    ...g,
    items: g.items.filter((i) => {
      if (saring !== "semua" && i.status !== saring) return false;
      if (!kata) return true;
      return (i.label + " " + (i.guna ?? "")).toLowerCase().includes(kata);
    }),
  })).filter((g) => g.items.length > 0), [saring, kata]);

  const tampil = grup.reduce((s, g) => s + g.items.length, 0);

  return (
    <div style={{ width: "100%", maxWidth: "var(--w-page)", margin: "0 auto" }}>
      {/* LAPIS 1 — KEADAAN */}
      <div className="rise" style={{ marginBottom: "var(--gap-bagian)" }}>
        <KepalaHalaman judul="Peta Modul"         ikon={<Map size={19} />}
      /><p style={{ fontSize: 13, color: C.mid, margin: "6px 0 0", maxWidth: "70ch", lineHeight: 1.55 }}>
          Seluruh modul yang direncanakan produk ini beserta keadaannya hari ini.
          Sidebar hanya memuat yang <strong>bisa dipakai</strong>; sisanya ada di sini —
          supaya “belum ada” bisa dibaca sekali, bukan ditemukan satu per satu saat diklik.
        </p>
      </div>

      <div className="rise rise-2" style={{
        display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
        gap: "var(--gap-grid)", marginBottom: "var(--gap-bagian)",
      }}>
        {(["hidup", "sebagian", "rencana", "gerbang", "eksternal"] as const).map((s) => {
          const r = RUPA[s];
          return (
            <div key={s} style={{
              background: "var(--surface)", border: `1px solid ${C.border}`,
              borderRadius: 12, padding: "var(--pad-kartu)",
              borderLeft: `3px solid ${r.warna}`,
            }}>
              <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.04em", color: C.mid, textTransform: "uppercase" }}>
                {r.label}
              </div>
              <div style={{ fontSize: 24, fontWeight: 700, color: C.text, fontVariantNumeric: "tabular-nums", marginTop: 4 }}>
                {rekap[s]}
              </div>
            </div>
          );
        })}
      </div>

      {/* LAPIS 2 — SARINGAN */}
      <TabBagian
        label="Saring menurut keadaan"
        aktif={saring}
        onPilih={setSaring}
        bagian={SARING.map((s) => ({
          kunci: s,
          label: s === "semua" ? "Semua" : RUPA[s].label,
          jumlah: s === "semua" ? rekap.total : rekap[s],
        }))}
      />

      <div style={{ position: "relative", marginBottom: "var(--gap-bagian)", maxWidth: 380 }}>
        <Search size={15} aria-hidden="true" style={{
          position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: C.muted,
        }} />
        <input
          type="search"
          value={cari}
          onChange={(e) => setCari(e.target.value)}
          placeholder="Cari modul…"
          aria-label="Cari modul"
          style={{
            width: "100%", padding: "9px 12px 9px 34px", fontSize: 13, fontFamily: "inherit",
            border: `1px solid ${C.border}`, borderRadius: 10,
            background: "var(--surface)", color: C.text,
          }}
        />
      </div>

      {/* LAPIS 3 — DETAIL */}
      {tampil === 0 ? (
        <p style={{ fontSize: 13, color: C.muted, padding: "24px 0" }}>
          Tak ada modul yang cocok dengan saringan ini.
        </p>
      ) : (
        grup.map((g) => (
          <section key={g.key} style={{ marginBottom: "var(--gap-bagian)" }}>
            <h2 style={{
              fontSize: 13, fontWeight: 700, color: C.text, margin: "0 0 8px",
              letterSpacing: "0.02em", textTransform: "uppercase",
            }}>
              {g.label}
            </h2>
            <div style={{
              display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))",
              gap: "var(--gap-grid)",
            }}>
              {g.items.map((i) => {
                const r = RUPA[i.status];
                const Ikon = r.Icon;
                const isi = (
                  <>
                    <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
                      <Ikon size={14} aria-hidden="true" style={{ color: r.warna, flexShrink: 0 }} />
                      <span style={{ fontSize: 13, fontWeight: 600, color: C.text }}>{i.label}</span>
                      {/* Status disebut dengan KATA, bukan cuma warna ikon. */}
                      <span style={{
                        marginLeft: "auto", fontSize: 10, fontWeight: 700, padding: "1px 6px",
                        borderRadius: 999, color: r.warna, background: r.bg,
                        border: `1px solid ${r.border}`, whiteSpace: "nowrap",
                      }}>
                        {r.label}
                      </span>
                    </div>
                    {i.guna && (
                      <p style={{ fontSize: 12, color: C.mid, margin: 0, lineHeight: 1.5 }}>{i.guna}</p>
                    )}
                    {i.catatan && (
                      <p style={{ fontSize: 11, color: C.muted, margin: "6px 0 0", lineHeight: 1.5 }}>
                        {i.catatan}
                      </p>
                    )}
                  </>
                );

                const gaya: React.CSSProperties = {
                  display: "block", background: "var(--surface)",
                  border: `1px solid ${C.border}`, borderRadius: 12,
                  padding: "var(--pad-kartu)", textDecoration: "none",
                };

                // Yang sudah hidup bisa dibuka langsung; sisanya tak bisa
                // diklik ke mana-mana — dan itu jujur.
                return i.href ? (
                  <Link key={i.key} href={i.href} style={gaya}>{isi}</Link>
                ) : (
                  <div key={i.key} style={gaya}>{isi}</div>
                );
              })}
            </div>
          </section>
        ))
      )}
    </div>
  );
}
