"use client";

// ============================================================================
// Riwayat Pembayaran — gabungan upah/progress/settlement yang SUDAH diterima,
// dikelompokkan per bulan.
//
// Restyle F7d (2026-08-20): warna-ui → token CSS, kosong/loading →
// EmptyState/SkeletonCard.
//
// ⚠️ Badge TIPE transaksi (upah/progress/settlement) TIDAK memakai
// `StatusBadge`. Dicoba, lalu dilepas: `StatusBadge` punya 5 varian dengan
// SATU ikon tetap masing-masing (`VarianStatus` di `StatusBadge.tsx`), dan
// tak ada tiga varian bebas-ikon yang bisa dipetakan ke tiga tipe transaksi
// tanpa membuat dua di antaranya berbagi ikon/warna — itu justru MELANGGAR
// prinsip color-not-only yang jadi alasan `StatusBadge` ada (lihat komentar
// di berkasnya). Pil `<span>` manual di bawah (memakai `TYPE_META`)
// dipertahankan justru supaya upah/progress/settlement tetap terbedakan
// lewat ikon, bukan cuma warna.
//
// ── KPI + tren
//
// Ditambahkan KpiCard "Total Diterima" dengan `tren` DIISI, dihitung
// PRO-RATA (Fix Round 1, 2026-08-20): tren mentah "bulan ini vs bulan
// lalu" pada bulan yang belum penuh dulunya membandingkan hari 1..N bulan
// ini vs SELURUH bulan lalu (hari 1..akhir) — bias "turun palsu" hampir
// sepanjang bulan (mis. tanggal 3: 3 hari vs 31 hari). Sekarang dibandingkan
// 1..N vs 1..N — periode setara, lihat `useMemo` bertanda "tren" di bawah
// untuk detail dan contoh angka.
// ============================================================================

import { useMemo, useState } from "react";
import { useData } from "@/lib/data-cache";
import { Wallet, FileText, TrendingUp, CheckCircle, AlertCircle } from "lucide-react";
import SegmentedTab from "@/components/portal/SegmentedTab";
import EmptyState from "@/components/portal/EmptyState";
import SkeletonCard from "@/components/portal/SkeletonCard";
import KpiCard, { type TrenPeriode } from "@/components/portal/KpiCard";
import type { GalatApi } from "../_bersama/tipe";
import { pesanGalat } from "../_bersama/tipe";

function fmtRp(n: number) {
  return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(n);
}
function fmtDate(s: string | null) {
  if (!s) return "—";
  return new Date(s).toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric" });
}

type TipeItem = "upah" | "progress" | "settlement";

type PaymentItem = {
  id: string;
  type: TipeItem;
  amount: number;
  date: string | null;
  label: string;
  scopeName: string;
  projectName: string;
  status: string;
};

/** Bentuk baris mentah dari tiga endpoint sumber — field yang dipakai saja. */
interface WageReportRow {
  id: string;
  status?: string | null;
  net_amount?: number | string | null;
  paid_at?: string | null;
  week_start?: string | null;
  week_end?: string | null;
  scope?: { scope_name?: string | null } | null;
  project?: { name?: string | null } | null;
}
interface ProgressPaymentRow {
  id: string;
  status?: string | null;
  gross_payment?: number | string | null;
  updated_at?: string | null;
  created_at?: string | null;
  pct_done?: number | null;
  work_scope?: { scope_name?: string | null; project?: { name?: string | null } | null } | null;
  project?: { name?: string | null } | null;
}
interface SettlementRow {
  id: string;
  net_payment?: number | string | null;
  created_at?: string | null;
  work_scope?: { scope_name?: string | null; project?: { name?: string | null } | null } | null;
}

const TYPE_META: Record<TipeItem, { label: string; icon: React.ReactNode; color: string; bg: string }> = {
  upah:       { label: "Upah Harian",  icon: <FileText size={16} aria-hidden="true" />,    color: "var(--navy)",   bg: "var(--navy-light)" },
  progress:   { label: "Progress %",   icon: <TrendingUp size={16} aria-hidden="true" />,  color: "var(--success)",  bg: "var(--success-bg)"   },
  settlement: { label: "Settlement",   icon: <CheckCircle size={16} aria-hidden="true" />, color: "var(--info)",  bg: "var(--info-bg)"  },
};

const FILTER_OPTIONS: Array<{ value: "all" | TipeItem; label: string }> = [
  { value: "all",        label: "Semua" },
  { value: "upah",       label: "Upah Harian" },
  { value: "progress",   label: "Progress %" },
  { value: "settlement", label: "Settlement" },
];

export default function RiwayatPembayaranPage() {
  const [filter, setFilter] = useState<"all" | TipeItem>("all");

  /*
    ── PINDAH KE LAPIS CACHE BERSAMA (F4-2), 2026-08-16

    Tiga GET diganti `useData`. `borongan-settlements` semula punya
    `.catch(() => ({ data: { settlements: [] } }))` — endpoint yang belum
    tentu tersedia tak boleh menggagalkan seluruh halaman. `useData` tak
    mendukung catch per-request, jadi galatnya diambil TAPI SENGAJA tak
    dimasukkan ke `galatMuat` gabungan (lihat di bawah) — perilakunya sama:
    upah dan progress tetap tampil meski settlement gagal dimuat.

    TIDAK ada cache offline di jalur BACA halaman ini.
  */
  const { data: dataWage, memuat: memuatWage, galat: galatWage } =
    useData<{ reports: WageReportRow[] }>("/api/v1/mandor/wage-reports");
  const { data: dataProgress, memuat: memuatProgress, galat: galatProgress } =
    useData<{ payments: ProgressPaymentRow[] }>("/api/v1/mandor/progress-payments");
  const { data: dataSettle, memuat: memuatSettle } =
    useData<{ settlements: SettlementRow[] }>("/api/v1/mandor/borongan-settlements");

  const loading = memuatWage || memuatProgress || memuatSettle;
  // Settlement SENGAJA dikecualikan — lihat catatan di atas.
  const galatMuat = galatWage ?? galatProgress;

  const items = useMemo(() => {
    const combined: PaymentItem[] = [];

    // Laporan upah yang sudah dibayar
    const reports = dataWage?.reports ?? [];
    for (const r of reports) {
      if (r.status === "paid" || r.status === "approved") {
        combined.push({
          id: `upah_${r.id}`,
          type: "upah",
          amount: Number(r.net_amount ?? 0),
          date: r.paid_at ?? r.week_end ?? null,
          label: `Minggu ${fmtDate(r.week_start ?? null)} – ${fmtDate(r.week_end ?? null)}`,
          scopeName: r.scope?.scope_name ?? "—",
          projectName: r.project?.name ?? "—",
          status: r.status,
        });
      }
    }

    // Progress payments yang sudah disetujui
    const progressPayments = dataProgress?.payments ?? [];
    for (const p of progressPayments) {
      if (p.status === "approved") {
        combined.push({
          id: `progress_${p.id}`,
          type: "progress",
          amount: Number(p.gross_payment ?? 0),
          date: p.updated_at ?? p.created_at ?? null,
          label: `Progress ${p.pct_done}%`,
          scopeName: p.work_scope?.scope_name ?? "—",
          projectName: p.project?.name ?? p.work_scope?.project?.name ?? "—",
          status: p.status,
        });
      }
    }

    // Settlement borongan
    const settlements = dataSettle?.settlements ?? [];
    for (const s of settlements) {
      combined.push({
        id: `settlement_${s.id}`,
        type: "settlement",
        amount: Number(s.net_payment ?? 0),
        date: s.created_at ?? null,
        label: "Settlement Borongan",
        scopeName: s.work_scope?.scope_name ?? "—",
        projectName: s.work_scope?.project?.name ?? "—",
        status: "settled",
      });
    }

    // Urutkan terbaru dulu
    combined.sort((a, b) => {
      const da = a.date ? new Date(a.date).getTime() : 0;
      const db = b.date ? new Date(b.date).getTime() : 0;
      return db - da;
    });

    return combined;
  }, [dataWage, dataProgress, dataSettle]);

  const filtered = filter === "all" ? items : items.filter((i) => i.type === filter);
  const totalReceived = filtered.reduce((s, i) => s + i.amount, 0);
  const jumlahTransaksi = filtered.length;

  /**
   * Tren "bulan ini vs bulan lalu", PRO-RATA (Fix Round 1, 2026-08-20).
   *
   * ── Kenapa pro-rata, bukan bulan-penuh-vs-bulan-penuh
   *
   * Versi sebelumnya membandingkan SELURUH akumulasi bulan berjalan
   * (hari 1..hari-ini) terhadap SELURUH bulan lalu (hari 1..akhir bulan).
   * Itu perbandingan periode timpang: tanggal 3 Agustus membandingkan 3
   * hari data terhadap 31 hari data, dan pola pembayaran mandor yang
   * MENGGUMPAL (banyak dibayar sekali per minggu/bulan, mis. tanggal gajian
   * tetap) membuat sisi "bulan ini" hampir selalu lebih kecil sampai
   * mendekati akhir bulan — bukan karena penerimaan sungguhan turun,
   * melainkan karena harinya belum habis. Efeknya: badge "turun" tampil
   * palsu di layar mandor selama ~3 minggu setiap bulan.
   *
   * Pro-rata membandingkan PERIODE YANG SAMA PANJANGNYA: hari 1..N bulan
   * ini vs hari 1..N bulan lalu (N = tanggal hari ini, dipotong ke jumlah
   * hari riil bulan lalu kalau bulan lalu lebih pendek — mis. 31 Jan
   * dibandingkan ke 28/29 Feb).
   *
   * Contoh (asumsi "hari ini" = 3 Agustus 2026):
   *   - Total transaksi 1–3 Agustus 2026 (bulan ini, 3 hari)  = Rp X
   *   - Total transaksi 1–3 Juli 2026    (bulan lalu, 3 hari) = Rp Y
   *   - delta = (X - Y) / Y × 100
   * BUKAN 1–3 Agustus vs 1–31 Juli seperti sebelumnya.
   */
  const { tren, baruPeriodeIni } = useMemo((): { tren: TrenPeriode | undefined; baruPeriodeIni: string | null } => {
    const now = new Date();
    const tanggalHariIni = now.getDate(); // N — panjang jendela pro-rata
    const bulanIni = now.getMonth();
    const tahunIni = now.getFullYear();
    let bulanLalu = bulanIni - 1;
    let tahunLalu = tahunIni;
    if (bulanLalu < 0) { bulanLalu = 11; tahunLalu -= 1; }

    // Panjang bulan lalu bisa < N (mis. N=31 dari Januari, Februari cuma
    // 28/29 hari) — potong jendela bulan lalu ke hari terakhirnya sendiri
    // supaya tak "meminjam" hari dari bulan sebelum itu.
    const akhirBulanLalu = new Date(tahunLalu, bulanLalu + 1, 0).getDate();
    const jendelaLalu = Math.min(tanggalHariIni, akhirBulanLalu);

    let totalBulanIni = 0;
    let totalBulanLalu = 0;
    for (const item of filtered) {
      if (!item.date) continue;
      const d = new Date(item.date);
      const tgl = d.getDate();
      if (d.getFullYear() === tahunIni && d.getMonth() === bulanIni && tgl <= tanggalHariIni) {
        totalBulanIni += item.amount;
      } else if (d.getFullYear() === tahunLalu && d.getMonth() === bulanLalu && tgl <= jendelaLalu) {
        totalBulanLalu += item.amount;
      }
    }

    if (totalBulanLalu === 0 && totalBulanIni === 0) return { tren: undefined, baruPeriodeIni: null };
    // Kenaikan dari NOL tak punya persentase yang bermakna (Rp 50rb dan
    // Rp 500jt sama-sama jadi "+100%" kalau dipaksa jadi angka). `KpiCard`
    // SELALU merender "±N%" begitu `tren` diisi — tak ada cara menampilkan
    // tren tanpa angka persen lewat propnya. Daripada mengarang N, `tren`
    // di sini dibiarkan `undefined` dan keadaannya diberi tahu lewat teks
    // polos terpisah ("Mulai diterima bulan ini") — bukan badge tren.
    if (totalBulanLalu === 0) {
      return { tren: undefined, baruPeriodeIni: `Mulai diterima bulan ini (1–${tanggalHariIni})` };
    }

    const delta = ((totalBulanIni - totalBulanLalu) / totalBulanLalu) * 100;
    const labelPeriode = `vs 1–${jendelaLalu} bulan lalu`;
    if (Math.abs(delta) < 1) return { tren: { arah: "tetap", persen: 0, labelPeriode }, baruPeriodeIni: null };
    return {
      tren: {
        arah: delta > 0 ? "naik" : "turun",
        persen: Math.round(Math.abs(delta)),
        labelPeriode,
      },
      baruPeriodeIni: null,
    };
  }, [filtered]);

  // Group by month
  const byMonth: Record<string, PaymentItem[]> = {};
  filtered.forEach((item) => {
    const key = item.date
      ? new Date(item.date).toLocaleDateString("id-ID", { month: "long", year: "numeric" })
      : "Tanggal tidak diketahui";
    if (!byMonth[key]) byMonth[key] = [];
    byMonth[key].push(item);
  });

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div>
        <h1 style={{ fontSize: 20, fontWeight: 700, color: "var(--text-primary)", margin: 0 }}>Riwayat Pembayaran</h1>
        <p style={{ fontSize: 13, color: "var(--text-secondary)", margin: "4px 0 0" }}>
          Semua pembayaran yang telah diterima
        </p>
      </div>

      {!loading && galatMuat && (
        // `role="alert"` — hilang sempat saat pindah ke EmptyState (Fix
        // Round 1): banner galat MUAT lama mengumumkannya ke screen reader
        // otomatis lewat `role="alert"` di wadahnya; EmptyState sendiri
        // tak menyertakan peran itu (ia dipakai juga untuk kondisi
        // "kosong" biasa yang bukan galat, jadi wajar tak dipaksakan di
        // komponennya). Dipasang di sini, di wadah pembungkusnya.
        <div role="alert">
          <EmptyState
            icon={AlertCircle}
            judul="Gagal memuat sebagian riwayat"
            deskripsi={pesanGalat(galatMuat as GalatApi, "Coba muat ulang halaman ini.")}
          />
        </div>
      )}

      {loading && (
        <>
          <SkeletonCard tinggi={110} />
          <SkeletonCard tinggi={80} />
          <SkeletonCard tinggi={80} />
        </>
      )}

      {!loading && items.length > 0 && (
        <div>
          <KpiCard
            label={`Total Diterima${filter === "all" ? "" : ` — ${TYPE_META[filter as TipeItem]?.label}`}`}
            nilai={fmtRp(totalReceived)}
            tren={tren}
            icon={Wallet}
          />
          {/* Field yang sempat hilang saat restyle (Fix Round 1): teks
              "{n} transaksi" dari kartu ringkasan lama. */}
          <div style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: 8, padding: "0 4px" }}>
            {jumlahTransaksi} transaksi
            {baruPeriodeIni && <> · {baruPeriodeIni}</>}
          </div>
        </div>
      )}

      <SegmentedTab
        opsi={FILTER_OPTIONS}
        aktif={filter}
        onUbah={(v) => setFilter(v as typeof filter)}
      />

      {!loading && filtered.length === 0 && (
        <EmptyState
          icon={Wallet}
          judul="Belum ada riwayat pembayaran"
          deskripsi={
            filter === "all"
              ? "Pembayaran yang sudah diproses (upah, progress, settlement) akan muncul di sini."
              : `Belum ada pembayaran tipe "${TYPE_META[filter as TipeItem]?.label}".`
          }
        />
      )}

      {!loading && Object.keys(byMonth).length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          {Object.entries(byMonth).map(([month, monthItems]) => {
            const monthTotal = monthItems.reduce((s, i) => s + i.amount, 0);
            return (
              <div key={month}>
                <div
                  style={{
                    display: "flex", justifyContent: "space-between", alignItems: "center",
                    marginBottom: 8, padding: "0 4px",
                  }}
                >
                  <span style={{ fontSize: 13, fontWeight: 700, color: "var(--text-primary)" }}>{month}</span>
                  <span style={{ fontSize: 12, fontWeight: 700, color: "var(--success)", fontVariantNumeric: "tabular-nums" }}>
                    {fmtRp(monthTotal)}
                  </span>
                </div>

                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {monthItems.map((item) => {
                    const meta = TYPE_META[item.type];
                    return (
                      <div
                        key={item.id}
                        style={{
                          background: "var(--surface)", borderRadius: 16, padding: 14,
                          border: "1px solid var(--border)", display: "flex", alignItems: "center", gap: 12,
                        }}
                      >
                        <div
                          style={{
                            width: 40, height: 40, borderRadius: 10, background: meta.bg, color: meta.color,
                            display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
                          }}
                        >
                          {meta.icon}
                        </div>

                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 2, flexWrap: "wrap" }}>
                            <span style={{ fontSize: 13, fontWeight: 700, color: "var(--text-primary)" }}>{item.scopeName}</span>
                            <span
                              style={{
                                fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: "var(--portal-radius-pill)",
                                color: meta.color, background: meta.bg,
                              }}
                            >
                              {meta.label}
                            </span>
                          </div>
                          <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>
                            {item.projectName} · {item.label}
                          </div>
                          <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 1 }}>{fmtDate(item.date)}</div>
                        </div>

                        <div style={{ textAlign: "right", flexShrink: 0 }}>
                          <div style={{ fontSize: 15, fontWeight: 700, color: "var(--text-primary)", fontVariantNumeric: "tabular-nums" }}>
                            {fmtRp(item.amount)}
                          </div>
                          <div style={{ fontSize: 10, color: "var(--success)", fontWeight: 700, marginTop: 2 }}>Diterima</div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
