"use client";

/**
 * KPI PERUSAHAAN (C1) — lima angka yang menjawab "bagaimana keadaan kita".
 *
 * ══════════════════════════════════════════════════════════════════════════
 * KENAPA KOMPONEN INI ADA
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Diukur 2026-08-12: kelima angkanya SUDAH dihitung, masing-masing di lib-nya
 * sendiri dan tampil di satu layar — CPI/SPI di kurva-S per proyek, margin di
 * kendali biaya, umur piutang di keuangan, backlog di tender.
 *
 * Yang tak ada: satu tempat yang menampilkannya BERSAMAAN. Untuk menjawab
 * "bagaimana keadaan perusahaan", seseorang harus membuka empat layar dan
 * menjumlahkan sendiri di kepala.
 *
 * ── Yang menentukan rancangannya
 *
 * 1. ANGKA + ARTINYA, bukan angka saja. "CPI 0,87" tak berarti apa-apa bagi
 *    orang yang tak hafal EVM. Server mengirimkan kalimatnya; layar ini
 *    menampilkannya sebagai bagian utama kartu, bukan tooltip.
 *
 * 2. PROYEK TERBURUK ditunjuk langsung. Angka perusahaan yang buruk tak
 *    berguna kalau pembacanya masih harus mencari sendiri penyebabnya di
 *    daftar 16 proyek.
 *
 * 3. DASAR PERHITUNGAN disebutkan. Angka di sini memakai nilai kontrak dan
 *    rencana linear; kurva-S per proyek memakai pagu RAP dan baseline
 *    sesungguhnya. Keduanya sah dan hasilnya berbeda — menyembunyikan itu
 *    membuat orang mengira salah satunya rusak.
 */

import { useCallback, useEffect, useState } from "react";
import { api, makeAbortController } from "@/lib/api";
import { TrendingUp, TrendingDown, Clock, Wallet, Layers, AlertTriangle } from "lucide-react";

import { C } from "@/lib/warna-ui";
import { GAYA_KARTU } from "@/components/ui-dasar";

type Keadaan = "baik" | "perhatian" | "buruk" | "tak_ada_data";

interface Status {
  keadaan: Keadaan;
  arti: string;
}

interface ProyekKpi {
  id: string;
  name: string;
  cpi: number | null;
  spi: number | null;
  bac: number;
  ac: number;
}

interface Tanggapan {
  tanggal: string;
  evm: {
    cpi: number | null;
    spi: number | null;
    proyekDihitung: number;
    proyekTotal: number;
    cpiTerendah: ProyekKpi | null;
    spiTerendah: ProyekKpi | null;
    totalBac: number;
    totalAc: number;
    perProyek: ProyekKpi[];
    statusCpi: Status;
    statusSpi: Status;
    dasar_bac: string;
    dasar_pv: string;
  };
  piutang: {
    buckets: Record<string, number>;
    total: number;
    count: number;
  };
  backlog: {
    backlogNilai: number;
    backlogJumlah: number;
    pipelineNilai: number;
    pipelineJumlah: number;
    winRatePct: number | null;
  };
}

const WARNA: Record<Keadaan, { teks: string; bg: string; border: string }> = {
  baik:         { teks: "var(--success)",      bg: "var(--success-bg)", border: "var(--success-border)" },
  perhatian:    { teks: "var(--warning-teks)", bg: "var(--warning-bg)", border: "var(--warning-border)" },
  buruk:        { teks: "var(--danger)",       bg: "var(--danger-bg)",  border: "var(--danger-border)" },
  tak_ada_data: { teks: "var(--text-secondary)", bg: "var(--surface-subtle)", border: "var(--border)" },
};

const LABEL_BUCKET: Record<string, string> = {
  current: "Belum jatuh tempo",
  d1_30: "1–30 hari",
  d31_60: "31–60 hari",
  d61_90: "61–90 hari",
  d90_plus: "Lebih dari 90 hari",
};

const rupiah = (n: number) =>
  "Rp " + Math.round(n).toLocaleString("id-ID");

/** Rupiah ringkas untuk kartu — "Rp 4,88 M" lebih terbaca daripada 10 digit. */
function rupiahRingkas(n: number): string {
  const a = Math.abs(n);
  if (a >= 1_000_000_000) return `Rp ${(n / 1_000_000_000).toFixed(2).replace(".", ",")} M`;
  if (a >= 1_000_000) return `Rp ${(n / 1_000_000).toFixed(1).replace(".", ",")} jt`;
  return rupiah(n);
}

export function KpiPerusahaan() {
  const [data, setData] = useState<Tanggapan | null>(null);
  const [memuat, setMemuat] = useState(true);
  const [galat, setGalat] = useState("");

  const muat = useCallback((signal: AbortSignal) => {
    setMemuat(true);
    setGalat("");
    return api.get<Tanggapan>("/api/v1/reports/kpi-perusahaan", { signal })
      .then((r) => setData(r.data))
      .catch((e) => {
        if ((e as { code?: string })?.code === "ERR_CANCELED") return;
        setGalat(
          (e as { response?: { data?: { error?: string } } })?.response?.data?.error
            ?? "Gagal memuat KPI perusahaan.",
        );
      })
      .finally(() => setMemuat(false));
  }, []);

  useEffect(() => {
    const ac = makeAbortController();
    queueMicrotask(() => { void muat(ac.signal); });
    return () => ac.abort();
  }, [muat]);

  if (memuat) {
    return (
      <div style={{ padding: "40px 0", textAlign: "center", color: C.muted, fontSize: 13 }}>
        Memuat KPI perusahaan…
      </div>
    );
  }

  if (galat) {
    return (
      <div role="alert" style={{
        ...GAYA_KARTU, padding: "10px 14px",
        borderColor: "var(--danger-border)", background: "var(--danger-bg)",
        color: "var(--danger)", fontSize: 13,
      }}>
        {galat}
      </div>
    );
  }

  if (!data) return null;
  const { evm, piutang, backlog } = data;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--gap-bagian)" }}>
      {/* Dua indeks EVM — yang paling sering ditanya, jadi paling atas. */}
      <div style={{ display: "flex", gap: "var(--gap-grid)", flexWrap: "wrap" }}>
        <KartuIndeks
          judul="CPI — Indeks Biaya"
          nilai={evm.cpi}
          status={evm.statusCpi}
          ikon={<Wallet size={15} />}
          terburuk={evm.cpiTerendah}
          bacaTerburuk={(p) => p.cpi}
        />
        <KartuIndeks
          judul="SPI — Indeks Jadwal"
          nilai={evm.spi}
          status={evm.statusSpi}
          ikon={<Clock size={15} />}
          terburuk={evm.spiTerendah}
          bacaTerburuk={(p) => p.spi}
        />
      </div>

      {/* Tiga angka pendukung. */}
      <div style={{ display: "flex", gap: "var(--gap-grid)", flexWrap: "wrap" }}>
        <KartuAngka
          label="Nilai kontrak berjalan"
          nilai={rupiahRingkas(evm.totalBac)}
          keterangan={`${evm.proyekDihitung} proyek dihitung dari ${evm.proyekTotal}`}
          ikon={<Layers size={14} />}
        />
        <KartuAngka
          label="Biaya terserap"
          nilai={rupiahRingkas(evm.totalAc)}
          keterangan={evm.totalBac > 0
            ? `${Math.round((evm.totalAc / evm.totalBac) * 100)}% dari nilai kontrak`
            : "Belum ada nilai kontrak"}
          ikon={<TrendingDown size={14} />}
        />
        <KartuAngka
          label="Piutang belum tertagih"
          nilai={rupiahRingkas(piutang.total)}
          keterangan={`${piutang.count} tagihan`}
          ikon={<Clock size={14} />}
        />
        <KartuAngka
          label="Backlog tender"
          nilai={rupiahRingkas(backlog.backlogNilai)}
          keterangan={backlog.winRatePct === null
            ? `${backlog.backlogJumlah} menang, belum tuntas`
            : `${backlog.backlogJumlah} pekerjaan · menang ${backlog.winRatePct}%`}
          ikon={<TrendingUp size={14} />}
        />
      </div>

      {/* Umur piutang — dirinci karena "Rp 119 juta" tak memberitahu
          seberapa gawat. Rp 119 juta yang lewat 90 hari adalah masalah;
          jumlah yang sama yang belum jatuh tempo bukan. */}
      <div style={{ ...GAYA_KARTU, overflow: "hidden" }}>
        <div style={{ padding: "var(--pad-kartu-lega)", borderBottom: `1px solid ${C.border}` }}>
          <h3 style={{ fontSize: 14, fontWeight: 700, color: C.text, margin: 0 }}>Umur Piutang</h3>
          <p style={{ fontSize: 12, color: C.mid, margin: "4px 0 0", lineHeight: 1.5 }}>
            Semakin tua tagihan, semakin kecil kemungkinan tertagih penuh.
          </p>
        </div>
        {Object.entries(LABEL_BUCKET).map(([kunci, label], i, arr) => {
          const nilai = piutang.buckets[kunci] ?? 0;
          const pct = piutang.total > 0 ? (nilai / piutang.total) * 100 : 0;
          // Semakin tua, semakin gawat — warnanya mengikuti umurnya.
          const gawat = kunci === "d90_plus" || kunci === "d61_90";
          return (
            <div key={kunci} style={{
              display: "grid", gridTemplateColumns: "180px 1fr 140px", gap: 12,
              padding: "10px var(--pad-kartu-lega)", alignItems: "center", fontSize: 13,
              borderBottom: i < arr.length - 1 ? `1px solid ${C.border}` : "none",
            }}>
              <div style={{ color: nilai > 0 && gawat ? "var(--danger)" : C.mid }}>{label}</div>
              <div style={{ height: 6, background: "var(--surface-subtle)", borderRadius: 999, overflow: "hidden" }}>
                <div style={{
                  width: `${pct}%`, height: "100%",
                  background: gawat ? "var(--danger)" : C.navy,
                }} />
              </div>
              <div style={{
                textAlign: "right", fontVariantNumeric: "tabular-nums",
                color: nilai > 0 ? C.text : C.muted,
              }}>
                {nilai > 0 ? rupiah(nilai) : "—"}
              </div>
            </div>
          );
        })}
      </div>

      {/* Dasar perhitungan — disebutkan, bukan disembunyikan. */}
      <p style={{ fontSize: 11.5, color: C.muted, lineHeight: 1.6, margin: 0 }}>
        CPI &amp; SPI di sini memakai <strong>{evm.dasar_bac}</strong> sebagai nilai anggaran
        dan rencana <strong>{evm.dasar_pv}</strong>. Kurva-S per proyek memakai pagu RAP dan
        baseline jadwal yang sesungguhnya, jadi angkanya bisa berbeda — keduanya sah untuk
        pertanyaan yang berbeda.
      </p>
    </div>
  );
}

function KartuIndeks({ judul, nilai, status, ikon, terburuk, bacaTerburuk }: {
  judul: string;
  nilai: number | null;
  status: Status;
  ikon: React.ReactNode;
  terburuk: ProyekKpi | null;
  bacaTerburuk: (p: ProyekKpi) => number | null;
}) {
  const w = WARNA[status.keadaan];
  return (
    <div style={{
      ...GAYA_KARTU, padding: "var(--pad-kartu-lega)", flex: "1 1 320px", minWidth: 300,
      borderColor: w.border, background: w.bg,
    }}>
      <div style={{
        fontSize: 11, fontWeight: 700, color: C.mid, textTransform: "uppercase",
        letterSpacing: "0.04em", display: "flex", alignItems: "center", gap: 6,
      }}>
        {ikon} {judul}
      </div>
      <div style={{
        fontSize: 34, fontWeight: 700, color: w.teks, marginTop: 6,
        fontVariantNumeric: "tabular-nums", lineHeight: 1.1,
      }}>
        {nilai === null ? "—" : nilai.toFixed(2).replace(".", ",")}
      </div>
      {/* Kalimatnya, bukan angkanya, yang bisa ditindaklanjuti. */}
      <div style={{ fontSize: 13, color: C.text, marginTop: 6, lineHeight: 1.5 }}>
        {status.arti}
      </div>

      {terburuk && bacaTerburuk(terburuk) !== null && (
        <div style={{
          marginTop: 12, paddingTop: 10, borderTop: `1px solid ${w.border}`,
          fontSize: 12, color: C.mid, display: "flex", alignItems: "flex-start", gap: 6,
        }}>
          <AlertTriangle size={13} aria-hidden="true" style={{ marginTop: 2, flexShrink: 0, color: w.teks }} />
          <span>
            Terendah: <strong style={{ color: C.text }}>{terburuk.name}</strong>{" "}
            <span style={{ fontVariantNumeric: "tabular-nums" }}>
              ({bacaTerburuk(terburuk)!.toFixed(2).replace(".", ",")})
            </span>
          </span>
        </div>
      )}
    </div>
  );
}

function KartuAngka({ label, nilai, keterangan, ikon }: {
  label: string; nilai: string; keterangan: string; ikon: React.ReactNode;
}) {
  return (
    <div style={{ ...GAYA_KARTU, padding: "var(--pad-kartu-lega)", flex: "1 1 200px", minWidth: 185 }}>
      <div style={{
        fontSize: 11, fontWeight: 600, color: C.mid, textTransform: "uppercase",
        letterSpacing: "0.04em", display: "flex", alignItems: "center", gap: 5,
      }}>
        {ikon} {label}
      </div>
      <div style={{
        fontSize: 22, fontWeight: 700, color: C.text, marginTop: 4,
        fontVariantNumeric: "tabular-nums",
      }}>
        {nilai}
      </div>
      <div style={{ fontSize: 12, color: C.mid, marginTop: 2, lineHeight: 1.4 }}>{keterangan}</div>
    </div>
  );
}
