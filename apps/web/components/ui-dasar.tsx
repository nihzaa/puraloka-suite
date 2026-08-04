"use client";

/**
 * KOMPONEN DASAR — arah visual 2026 (R-012).
 *
 * ── Kenapa berkas ini ada
 *
 * 59 halaman dibangun bertahap, jadi kartu, tabel, dan panel punya bentuk
 * sedikit berbeda di tiap halaman. Itu penyebab utama kesan "buatan sendiri"
 * — bukan warnanya, melainkan ketidak-konsistenannya.
 *
 * Empat komponen di sini menggantikan puluhan variasi. Yang berubah bersama:
 * kerapatan, radius, cara angka ditampilkan, dan keadaan kosong.
 *
 * ── Aturan gradasi (paling mudah dilanggar)
 *
 * Gradasi HANYA untuk permukaan data — donat, batang, area grafik, dan satu
 * kartu KPI yang paling penting. TIDAK PERNAH untuk teks atau latar kartu
 * biasa.
 *
 * Alasannya bukan selera: teks di atas gradasi punya kontras yang BERUBAH
 * sepanjang bidangnya. Ia bisa lulus WCAG di satu ujung dan gagal di ujung
 * lain, dan `kontras-ratchet` tak bisa menangkapnya karena ia menghitung dari
 * pasangan token, bukan dari piksel.
 *
 * ── Satu aksen per layar
 *
 * Kalau tiga kartu KPI bergradasi, tak ada yang menonjol — dan halaman kembali
 * monoton dengan warna yang berbeda. Karena itu `sorot` adalah prop, dan
 * pemanggil hanya boleh menyalakannya pada SATU kartu.
 */

import { useEffect, useRef, useState } from "react";
import { TrendingUp, TrendingDown, Minus } from "lucide-react";

const C = {
  text: "var(--text-primary)", mid: "var(--text-secondary)",
  muted: "var(--text-muted)", border: "var(--border)",
  surface: "var(--surface)", subtle: "var(--surface-subtle)",
  aksen: "var(--aksen)", green: "var(--success)", red: "var(--danger)",
};

// ═══════════════════════════════════════════════════════════════════════════
// ANGKA BERGERAK — hitung naik saat nilainya berubah
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Menghitung naik dari nilai lama ke nilai baru.
 *
 * Bukan hiasan: angka yang berubah mendadak tak terlihat berubah. Hitungan
 * naik membuat mata menangkap BAHWA ia berubah, dan itu yang penting pada
 * dashboard yang di-refresh berkala.
 *
 * `prefers-reduced-motion` mematikannya — sebagian orang benar-benar mual
 * oleh gerakan, dan angka yang bergerak adalah pemicu yang lazim.
 */
function useAngkaBergerak(target: number, aktif = true): number {
  const [nilai, setNilai] = useState(aktif ? 0 : target);
  const rafRef = useRef<number | undefined>(undefined);
  const dariRef = useRef(0);

  useEffect(() => {
    if (!aktif || typeof window === "undefined") return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      // ⚠️ `setNilai` TIDAK dipanggil langsung di badan effect.
      //
      // `react-hooks/set-state-in-effect` menolaknya, dan penolakannya benar:
      // setState sinkron di dalam effect memicu render bertingkat. Pada kartu
      // KPI yang jumlahnya empat sampai delapan per halaman, itu berarti
      // delapan render tambahan tiap kali datanya berubah.
      //
      // rAF satu frame menundanya ke luar fase render — dan untuk kasus
      // "matikan animasi" itu tak terasa sama sekali.
      rafRef.current = requestAnimationFrame(() => {
        setNilai(target);
        dariRef.current = target;
      });
      return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
    }

    const dari = dariRef.current;
    const mulai = performance.now();
    const durasi = 400;

    const langkah = (t: number) => {
      const p = Math.min(1, (t - mulai) / durasi);
      // ease-out: cepat di awal lalu melambat, seperti benda yang berhenti
      // karena gesekan. Linear terasa mekanis.
      const e = 1 - Math.pow(1 - p, 3);
      setNilai(dari + (target - dari) * e);
      if (p < 1) rafRef.current = requestAnimationFrame(langkah);
      else dariRef.current = target;
    };
    rafRef.current = requestAnimationFrame(langkah);
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
  }, [target, aktif]);

  return nilai;
}

// ═══════════════════════════════════════════════════════════════════════════
// KARTU KPI
// ═══════════════════════════════════════════════════════════════════════════

export interface KartuKPIProps {
  label: string;
  /** Nilai sudah terformat (mis. "Rp 2,5 M"). */
  nilai: string;
  /** Untuk animasi hitung-naik. Kosongkan bila nilainya bukan angka. */
  nilaiAngka?: number;
  /** Perubahan terhadap periode sebelumnya, dalam persen. */
  delta?: number | null;
  /** `true` = naik itu bagus (pendapatan). `false` = naik itu buruk (biaya). */
  naikBagus?: boolean;
  /** Keterangan kecil di bawah angka. */
  keterangan?: string;
  ikon?: React.ReactNode;
  /** Deret angka untuk sparkline. Minimal 2 titik. */
  spark?: number[];
  /**
   * Kartu yang PALING PENTING di layar ini. Hanya SATU per halaman —
   * kalau semuanya disorot, tak ada yang menonjol.
   */
  sorot?: boolean;
  onClick?: () => void;
}

export function KartuKPI({
  label, nilai, nilaiAngka, delta, naikBagus = true,
  keterangan, ikon, spark, sorot, onClick,
}: KartuKPIProps) {
  const angka = useAngkaBergerak(nilaiAngka ?? 0, nilaiAngka !== undefined);
  const tampil = nilaiAngka !== undefined
    ? nilai.replace(/[\d.,]+/, (m) => {
        // Ganti bagian numerik saja, pertahankan "Rp"/"%"/pemisah ribuan.
        const desimal = m.includes(",") ? 1 : 0;
        return angka.toLocaleString("id-ID", {
          minimumFractionDigits: desimal, maximumFractionDigits: desimal,
        });
      })
    : nilai;

  const naik = (delta ?? 0) > 0;
  const turun = (delta ?? 0) < 0;
  const baik = naik ? naikBagus : turun ? !naikBagus : null;

  const Pembungkus = onClick ? "button" : "div";

  return (
    <Pembungkus
      onClick={onClick}
      style={{
        display: "block", width: "100%", textAlign: "left",
        padding: "var(--pad-kartu-lega)",
        borderRadius: 14, position: "relative", overflow: "hidden",
        cursor: onClick ? "pointer" : "default",
        // Gradasi HANYA pada kartu yang disorot. Ini yang membuatnya menonjol
        // — dan alasan kenapa hanya boleh satu per layar.
        background: sorot ? "var(--grad-aksen)" : C.surface,
        border: `1px solid ${sorot ? "transparent" : C.border}`,
        transition: "transform 150ms ease, box-shadow 150ms ease",
      }}
      onMouseEnter={(e) => {
        if (!onClick) return;
        e.currentTarget.style.transform = "translateY(-2px)";
        e.currentTarget.style.boxShadow = "var(--shadow-md)";
      }}
      onMouseLeave={(e) => {
        if (!onClick) return;
        e.currentTarget.style.transform = "translateY(0)";
        e.currentTarget.style.boxShadow = "none";
      }}
    >
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        gap: 8, marginBottom: 8,
      }}>
        <span style={{
          fontSize: 11, fontWeight: 600, letterSpacing: ".03em",
          textTransform: "uppercase",
          color: sorot ? "rgba(255,255,255,.78)" : C.muted,
        }}>{label}</span>
        {ikon && (
          <span aria-hidden="true" style={{
            color: sorot ? "rgba(255,255,255,.7)" : C.muted,
            display: "flex", flexShrink: 0,
          }}>{ikon}</span>
        )}
      </div>

      <div style={{ display: "flex", alignItems: "baseline", gap: 8, flexWrap: "wrap" }}>
        <span style={{
          fontSize: "var(--teks-kpi)", fontWeight: 700, lineHeight: 1.05,
          fontVariantNumeric: "tabular-nums",
          fontFamily: "var(--font-display, inherit)",
          color: sorot ? "var(--on-aksen)" : C.text,
        }}>{tampil}</span>

        {delta != null && delta !== 0 && (
          // Delta memakai IKON + tanda, bukan hanya warna (WCAG 1.4.1).
          // Halaman ini juga dibaca di HP di lapangan, tempat perbedaan
          // warna tipis praktis hilang di bawah sinar matahari.
          <span style={{
            display: "inline-flex", alignItems: "center", gap: 3,
            fontSize: "var(--teks-delta)", fontWeight: 600,
            padding: "2px 7px", borderRadius: 999,
            fontVariantNumeric: "tabular-nums",
            background: sorot ? "rgba(255,255,255,.16)"
              : baik ? "var(--success-bg)" : "var(--danger-bg)",
            color: sorot ? "var(--on-aksen)" : baik ? C.green : C.red,
          }}>
            {naik ? <TrendingUp size={11} aria-hidden="true" />
              : turun ? <TrendingDown size={11} aria-hidden="true" />
              : <Minus size={11} aria-hidden="true" />}
            {naik ? "+" : ""}{delta.toLocaleString("id-ID", { maximumFractionDigits: 1 })}%
          </span>
        )}
      </div>

      {keterangan && (
        <div style={{
          fontSize: 11.5, marginTop: 5,
          color: sorot ? "rgba(255,255,255,.7)" : C.muted,
        }}>{keterangan}</div>
      )}

      {spark && spark.length > 1 && (
        <Sparkline data={spark} sorot={sorot} />
      )}
    </Pembungkus>
  );
}

/** Grafik mini di kaki kartu KPI — bentuk tren, bukan angka pastinya. */
function Sparkline({ data, sorot }: { data: number[]; sorot?: boolean }) {
  const maks = Math.max(...data);
  const min = Math.min(...data);
  const rentang = maks - min || 1;
  const titik = data.map((v, i) => {
    const x = (i / (data.length - 1)) * 100;
    const y = 100 - ((v - min) / rentang) * 100;
    return `${x},${y}`;
  }).join(" ");

  return (
    <svg
      viewBox="0 0 100 100" preserveAspectRatio="none"
      aria-hidden="true"
      style={{ width: "100%", height: 26, marginTop: 9, display: "block" }}
    >
      <polyline
        points={titik} fill="none"
        stroke={sorot ? "rgba(255,255,255,.85)" : "var(--aksen)"}
        strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// PANEL — pembungkus baku untuk grafik & daftar
// ═══════════════════════════════════════════════════════════════════════════

export function Panel({
  judul, keterangan, aksi, children, padat,
}: {
  judul: string;
  keterangan?: string;
  /** Kontrol di kanan judul — pemilih periode, tombol, dsb. */
  aksi?: React.ReactNode;
  children: React.ReactNode;
  /** `true` untuk isi yang mengatur paddingnya sendiri (mis. tabel). */
  padat?: boolean;
}) {
  return (
    <section style={{
      borderRadius: 14, border: `1px solid ${C.border}`,
      background: C.surface, overflow: "hidden",
    }}>
      <header style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        gap: 12, flexWrap: "wrap",
        padding: "12px var(--pad-kartu-lega)",
        borderBottom: `1px solid ${C.border}`,
      }}>
        <div style={{ minWidth: 0 }}>
          <h2 style={{
            margin: 0, fontSize: 14, fontWeight: 700, color: C.text,
            fontFamily: "var(--font-display, inherit)",
          }}>{judul}</h2>
          {keterangan && (
            <p style={{ margin: "2px 0 0", fontSize: 11.5, color: C.muted }}>
              {keterangan}
            </p>
          )}
        </div>
        {aksi}
      </header>
      <div style={{ padding: padat ? 0 : "var(--pad-kartu-lega)" }}>
        {children}
      </div>
    </section>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// KEADAAN KOSONG
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Ditangani DI KOMPONEN, bukan diserahkan ke pemanggil.
 *
 * Kalau diserahkan, separuh halaman akan lupa — dan layar kosong tanpa
 * penjelasan terbaca sebagai fitur rusak, bukan sebagai "belum ada isinya".
 * Itu sudah terjadi berkali-kali di repo ini.
 */
export function Kosong({
  judul, keterangan, aksi,
}: { judul: string; keterangan?: string; aksi?: React.ReactNode }) {
  return (
    <div style={{
      padding: "28px 16px", textAlign: "center",
      border: `1px dashed ${C.border}`, borderRadius: 12, background: C.subtle,
    }}>
      <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: C.text }}>
        {judul}
      </p>
      {keterangan && (
        <p style={{
          margin: "6px auto 0", fontSize: 12, color: C.mid,
          maxWidth: 400, lineHeight: 1.55,
        }}>{keterangan}</p>
      )}
      {aksi && <div style={{ marginTop: 12 }}>{aksi}</div>}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// GRAFIK BATANG — satu batang bergradasi, sisanya diam
// ═══════════════════════════════════════════════════════════════════════════

export interface BatangData {
  label: string;
  nilai: number;
  /** Batang yang disorot — HANYA SATU yang boleh true. */
  sorot?: boolean;
}

/**
 * Grafik batang sederhana.
 *
 * Meniru pola referensi: batang tersorot memakai gradasi, sisanya abu-abu
 * diam. Itu yang membuat "yang mana yang penting" terbaca sebelum ada yang
 * membaca sumbunya — dan yang tak bisa dilakukan kalau semua batang berwarna.
 */
export function GrafikBatang({
  data, tinggi = 180, format,
}: {
  data: BatangData[];
  tinggi?: number;
  format?: (n: number) => string;
}) {
  const maks = Math.max(...data.map((d) => d.nilai), 1);
  const fmt = format ?? ((n: number) => n.toLocaleString("id-ID"));

  return (
    <div>
      <div
        role="img"
        aria-label={
          `Grafik batang: ` +
          data.map((d) => `${d.label} ${fmt(d.nilai)}`).join(", ")
        }
        style={{
          display: "flex", alignItems: "flex-end", gap: 6,
          height: tinggi, paddingTop: 8,
        }}
      >
        {data.map((d, i) => {
          const pct = (d.nilai / maks) * 100;
          return (
            <div key={`${d.label}-${i}`} style={{
              flex: 1, display: "flex", flexDirection: "column",
              alignItems: "center", gap: 6, height: "100%",
            }}>
              <div style={{
                flex: 1, width: "100%", display: "flex", alignItems: "flex-end",
              }}>
                <div
                  title={`${d.label}: ${fmt(d.nilai)}`}
                  style={{
                    width: "100%", height: `${Math.max(2, pct)}%`,
                    borderRadius: "6px 6px 3px 3px",
                    background: d.sorot ? "var(--grad-aksen-tegak)" : "var(--data-diam)",
                    transition: "height 400ms cubic-bezier(.16,1,.3,1)",
                  }}
                />
              </div>
              <span style={{
                fontSize: 10.5, color: d.sorot ? C.text : C.muted,
                fontWeight: d.sorot ? 600 : 400, whiteSpace: "nowrap",
              }}>{d.label}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// DONAT — gradasi mengikuti perjalanan, bukan warna rata
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Cincin proporsi.
 *
 * Gradasi bergerak gelap→terang searah jarum jam, jadi mata mengikuti
 * PERJALANANNYA — bukan sekadar membaca potongannya. Itu yang membedakannya
 * dari donat berwarna rata, dan yang membuat referensi terasa hidup.
 */
export function Donat({
  pct, label, nilai, ukuran = 150,
}: { pct: number; label: string; nilai: string; ukuran?: number }) {
  const r = 42;
  const keliling = 2 * Math.PI * r;
  const isi = Math.min(100, Math.max(0, pct));
  const id = `grad-donat-${Math.round(isi)}`;

  return (
    <div style={{ position: "relative", width: ukuran, height: ukuran, margin: "0 auto" }}>
      <svg
        viewBox="0 0 100 100" style={{ width: "100%", height: "100%" }}
        role="img" aria-label={`${label}: ${nilai}, ${isi.toFixed(1)} persen`}
      >
        <defs>
          <linearGradient id={id} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="var(--aksen-pekat)" />
            <stop offset="60%" stopColor="var(--aksen)" />
            <stop offset="100%" stopColor="var(--aksen-terang)" />
          </linearGradient>
        </defs>
        <circle cx="50" cy="50" r={r} fill="none"
          stroke="var(--data-diam)" strokeWidth={11} />
        <circle
          cx="50" cy="50" r={r} fill="none"
          stroke={`url(#${id})`} strokeWidth={11} strokeLinecap="round"
          strokeDasharray={`${(isi / 100) * keliling} ${keliling}`}
          transform="rotate(-90 50 50)"
          style={{ transition: "stroke-dasharray 600ms cubic-bezier(.16,1,.3,1)" }}
        />
      </svg>
      <div style={{
        position: "absolute", inset: 0, display: "flex",
        flexDirection: "column", alignItems: "center", justifyContent: "center",
        pointerEvents: "none",
      }}>
        <span style={{ fontSize: 10.5, color: C.muted }}>{label}</span>
        <span style={{
          fontSize: 19, fontWeight: 700, color: C.text, marginTop: 1,
          fontVariantNumeric: "tabular-nums",
          fontFamily: "var(--font-display, inherit)",
        }}>{nilai}</span>
      </div>
    </div>
  );
}
