"use client";

// ============================================================================
// KpiCard — angka besar + badge tren + sparkline, dipakai di ringkasan portal
// mobile (mandor/PM/klien).
//
// Kartu ini dirender di atas `--surface` (permukaan biasa, putih/gelap sesuai
// mode) — BUKAN di atas gradien merek. Karena itu teksnya memakai
// `--text-primary`/`--text-secondary`/`--text-muted`, bukan `--on-merek*`
// (yang khusus untuk teks di atas `--grad-merek`).
//
// Badge tren tidak boleh mengandalkan warna saja (WCAG 1.4.1, use-of-color):
// ikon panah (TrendingUp/TrendingDown/Minus) SELALU disertai tanda +/- dan
// angka persen eksplisit di teks. Warna hanya penguat, bukan satu-satunya
// pembeda arah.
//
// Nilai KPI memakai fontVariantNumeric: "tabular-nums" supaya lebar digit
// seragam — angka yang berubah (mis. live update) tidak menggeser layout.
// ============================================================================

import { TrendingUp, TrendingDown, Minus, type LucideIcon } from "lucide-react";
import MiniChart from "./MiniChart";

export interface TrenPeriode {
  arah: "naik" | "turun" | "tetap";
  /** Selalu positif — `arah` yang menentukan tanda +/- di tampilan. */
  persen: number;
  labelPeriode: string;
}

export interface KpiCardProps {
  label: string;
  /** Sudah diformat (Rp, %, dst) oleh caller. */
  nilai: string;
  tren?: TrenPeriode;
  /** Titik data untuk MiniChart, urutan lama→baru. */
  sparklineData?: number[];
  icon?: LucideIcon;
}

const IKON_TREN: Record<TrenPeriode["arah"], LucideIcon> = {
  naik: TrendingUp,
  turun: TrendingDown,
  tetap: Minus,
};

const WARNA_TREN: Record<TrenPeriode["arah"], string> = {
  naik: "var(--success)",
  turun: "var(--danger)",
  tetap: "var(--text-secondary)",
};

export default function KpiCard({ label, nilai, tren, sparklineData, icon: Icon }: KpiCardProps) {
  const IkonTren = tren ? IKON_TREN[tren.arah] : null;

  return (
    <div
      style={{
        background: "var(--surface)",
        borderRadius: "var(--portal-radius-card)",
        border: "1px solid var(--border)",
        padding: 20,
        boxShadow: "var(--portal-shadow-navy)",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 8,
        }}
      >
        <span style={{ fontSize: 13, color: "var(--text-secondary)", fontWeight: 600 }}>
          {label}
        </span>
        {Icon && <Icon size={18} color="var(--navy)" aria-hidden="true" />}
      </div>

      <div
        style={{
          fontSize: 36,
          fontWeight: 800,
          color: "var(--text-primary)",
          fontVariantNumeric: "tabular-nums",
          letterSpacing: "-0.02em",
          lineHeight: 1.1,
        }}
      >
        {nilai}
      </div>

      {tren && IkonTren && (
        <div style={{ display: "flex", alignItems: "center", gap: 4, marginTop: 8 }}>
          <IkonTren size={14} color={WARNA_TREN[tren.arah]} aria-hidden="true" />
          <span style={{ fontSize: 12, fontWeight: 700, color: WARNA_TREN[tren.arah] }}>
            {tren.arah === "naik" ? "+" : tren.arah === "turun" ? "-" : ""}
            {tren.persen}%
          </span>
          <span style={{ fontSize: 12, color: "var(--text-muted)" }}>{tren.labelPeriode}</span>
        </div>
      )}

      {sparklineData && sparklineData.length > 1 && (
        <div style={{ marginTop: 12 }}>
          <MiniChart
            data={sparklineData.map((v, i) => ({ label: String(i), value: v }))}
            tipe="area"
          />
        </div>
      )}
    </div>
  );
}
