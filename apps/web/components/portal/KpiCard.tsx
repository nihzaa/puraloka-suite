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
        // ⚠️ `minWidth: 0` WAJIB — jangan dihapus karena "tak kelihatan efeknya".
        //
        // Grid item bawaannya `min-width: auto`, artinya ia menolak menyusut
        // di bawah lebar konten terpanjangnya. Label seperti "Kasbon Beredar"
        // memaksa kartu jadi 266px di dalam kolom yang jatahnya ~183px, dan
        // halamannya mendapat SCROLL HORIZONTAL — diukur 434px di viewport
        // 390px pada /mandor-portal/rekapitulasi (2026-08-20).
        //
        // Gejalanya menipu: grid induknya `1fr 1fr` (benar), halamannya tak
        // salah apa-apa, dan cacatnya hanya muncul saat label cukup panjang
        // ATAU angkanya cukup besar — jadi ia lolos di halaman yang datanya
        // kebetulan pendek. Perbaikannya di sini, sekali, untuk semua pemakai.
        minWidth: 0,
        // Ukuran angka di bawah diskalakan terhadap LEBAR KARTU INI, bukan
        // lebar layar — lihat komentar `fontSize` di sana.
        containerType: "inline-size",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 8,
          marginBottom: 8,
        }}
      >
        <span
          style={{
            fontSize: 13,
            color: "var(--text-secondary)",
            fontWeight: 600,
            minWidth: 0,
            overflowWrap: "anywhere",
          }}
        >
          {label}
        </span>
        {Icon && <Icon size={18} color="var(--navy)" aria-hidden="true" style={{ flexShrink: 0 }} />}
      </div>

      <div
        style={{
          // Angka MENYUSUT mengikuti lebar kartu, bukan memaksa kartu melebar.
          //
          // 36px dipaku membuat "Rp 4.500.000" menuntut ~230px; di grid dua
          // kolom pada layar 390px jatahnya cuma ~183px, dan kartunya melebar
          // keluar layar. `clamp` menjaga angka tetap besar saat muat, lalu
          // mengecil dengan anggun saat nominalnya panjang — daripada
          // memotong angka uang (yang menyesatkan) atau membungkusnya.
          // Satuan `cqi` = 1% lebar KARTU (container query inline size), BUKAN
          // `vw` (1% lebar LAYAR). Bedanya menentukan di sini: kartu KPI biasa
          // duduk di grid dua kolom, jadi lebarnya cuma ~separuh layar. Dengan
          // `vw`, "Rp 4.500.000" diukur seolah punya selebar layar penuh lalu
          // TERPOTONG di tepi kartu — digit terakhirnya hilang, dan pengukuran
          // overflow tetap melaporkan "bersih" karena kartunya meng-clip.
          //
          // Angka uang yang terpotong lebih berbahaya daripada angka kecil:
          // "Rp 4.500.00" terbaca sebagai nominal yang berbeda.
          //
          // 13cqi ≈ 24px pada kartu 183px (grid 2 kolom, layar 390px), dan
          // naik sampai 36px pada kartu lebar (satu kolom / tablet).
          fontSize: "clamp(18px, 13cqi, 36px)",
          fontWeight: 800,
          color: "var(--text-primary)",
          fontVariantNumeric: "tabular-nums",
          letterSpacing: "-0.02em",
          lineHeight: 1.15,
          minWidth: 0,
          // ⚠️ JANGAN ganti dengan `overflowWrap: "anywhere"`.
          //
          // Percobaan pertama memakai itu, dan hasilnya "Rp 4.500.000" patah
          // jadi "Rp 4.50" / "0.000" — dua baris yang sekilas terbaca
          // "Rp 4,50". Memotong angka UANG di posisi sembarang lebih buruk
          // daripada angka yang mengecil: yang satu salah baca, yang lain
          // cuma kurang gagah.
          whiteSpace: "nowrap",
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

      {sparklineData && sparklineData.length > 1 ? (
        <div style={{ marginTop: 12 }}>
          <MiniChart
            data={sparklineData.map((v, i) => ({ label: String(i), value: v }))}
            tipe="area"
          />
        </div>
      ) : sparklineData ? (
        /*
          Deret KOSONG (atau satu titik) — kartunya tetap harus BICARA.

          Diukur 2026-09-01 di /admin-portal: `invoice_belum_lunas`
          memulangkan `[]` karena memang tak ada invoice belum lunas.
          Benar, tetapi kartunya lalu berdiri tanpa grafik di sebelah tiga
          kartu yang punya — dan kekosongan itu terbaca sebagai GAGAL MUAT,
          bukan sebagai kabar baik.

          Ketahuan dari MEMOTRET, bukan dari kode: `sparklineData.length > 1`
          adalah syarat yang benar, dan `tsc` tak punya pendapat soal apa
          yang dilihat orang.

          Tingginya disamakan dengan MiniChart supaya kartu-kartu dalam satu
          baris tetap sejajar. Kartu yang tingginya beda-beda membuat mata
          menyangka salah satunya belum selesai dimuat.
        */
        <div
          style={{
            marginTop: 12,
            height: 48,
            display: "flex",
            alignItems: "center",
            fontSize: 12,
            color: "var(--text-muted)",
          }}
        >
          Belum ada riwayat pada periode ini
        </div>
      ) : null}
    </div>
  );
}
