"use client";

import React, { useState } from "react";
import { useTerpasang } from "@/lib/use-terpasang";
import Link from "next/link";
import { useData } from "@/lib/data-cache";
import {
  Wallet, Receipt, AlertTriangle,
  Clock, 
  Banknote, ArrowUpRight, 
  Activity, 
} from "lucide-react";
import {
  ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer,
} from "recharts";

// ─── Design tokens ────────────────────────────────────────────────────────────

import { C } from "@/lib/warna-ui";
import {
  CashflowTooltip,
  CreateInvoiceModal, 
} from "./_bersama/komponen";
import { UmurPiutang, type PetaUmur } from "./_bersama/umur-piutang";
import { AnalitikKeuangan } from "./_bersama/analitik";
import {
  type Summary, type CashflowPoint, type ArusKasChartPoint,
  fmtCompact,
} from "./_bersama/tipe";


// ─── Main page ────────────────────────────────────────────────────────────────

export default function KeuanganPage() {
  const mounted = useTerpasang();
  if (!mounted) return null;
  return <KeuanganContent />;
}

function KeuanganContent() {
  // ADR-004: capability, bukan nama jabatan — diverifikasi ke `requirePermission`.

  //  dihapus: bagian modul kini ditentukan URL, bukan state.

  // Overview period filter
  // Bawaan 3 BULAN, bukan bulan berjalan.
  //
  // Dipotret 2026-08-05: dengan bawaan "Bulan Ini", grafik arus kas terbuka
  // KOSONG bertuliskan "Tidak ada data cashflow untuk periode ini" — bukan
  // karena rusak, tapi karena awal bulan memang belum ada transaksi. Layar
  // pertama sebuah modul keuangan yang kosong terbaca sebagai aplikasi yang
  // belum jadi, dan orang berhenti memercayai angkanya.
  //
  // Tiga bulan juga yang benar untuk melihat TREN — satu bulan tak punya
  // bentuk untuk dibaca.
  const [overviewPeriod, setOverviewPeriod] = useState<"this_month" | "last_3_months" | "last_6_months" | "this_year" | "custom">("last_3_months");
  const [overviewFrom, setOverviewFrom] = useState("");
  const [overviewTo, setOverviewTo] = useState("");

  // Modals
  const [showCreateInvoice, setShowCreateInvoice] = useState(false);

  function computePeriodDates(period: string, customFrom: string, customTo: string) {
    const now = new Date();
    const pad = (n: number) => String(n).padStart(2, "0");
    const isoDate = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    if (period === "this_month") {
      const from = isoDate(new Date(now.getFullYear(), now.getMonth(), 1));
      const to   = isoDate(new Date(now.getFullYear(), now.getMonth() + 1, 0));
      return { from, to };
    }
    if (period === "last_3_months") {
      const from = isoDate(new Date(now.getFullYear(), now.getMonth() - 2, 1));
      const to   = isoDate(new Date(now.getFullYear(), now.getMonth() + 1, 0));
      return { from, to };
    }
    if (period === "last_6_months") {
      const from = isoDate(new Date(now.getFullYear(), now.getMonth() - 5, 1));
      const to   = isoDate(new Date(now.getFullYear(), now.getMonth() + 1, 0));
      return { from, to };
    }
    if (period === "this_year") {
      return { from: `${now.getFullYear()}-01-01`, to: `${now.getFullYear()}-12-31` };
    }
    // custom
    return { from: customFrom, to: customTo };
  }

  /*
    ── PINDAH KE LAPIS CACHE BERSAMA (F4-2), 2026-08-16

    Summary dan cashflow keduanya bergantung pada `{from, to}` yang sama —
    URL dinamisnya jadi kunci cache, jadi berpindah rentang lalu kembali ke
    rentang yang sama tak mengambil ulang selama masih segar. Umur piutang
    TETAP dimuat sekali tanpa bergantung periode, sama seperti sebelumnya.
  */
  const { from: periodFrom, to: periodTo } =
    computePeriodDates(overviewPeriod, overviewFrom, overviewTo);

  const qSummary = new URLSearchParams();
  if (periodFrom) qSummary.set("date_from", periodFrom);
  if (periodTo) qSummary.set("date_to", periodTo);
  const { data: summary, memuat: loadingSummary, muatUlang: muatUlangSummary } =
    useData<Summary>(`/api/v1/finance/summary${qSummary.size ? `?${qSummary}` : ""}`);

  const qCashflow = new URLSearchParams({
    type: "payment,expense,wage,progress_payment,settlement_borongan",
  });
  if (periodFrom) qCashflow.set("date_from", periodFrom);
  if (periodTo) qCashflow.set("date_to", periodTo);
  const { data: dataCashflow } =
    useData<{ chartData: ArusKasChartPoint[] }>(`/api/v1/finance/cashflow-chart?${qCashflow}`);
  // Map ArusKasChartPoint ke bentuk CashflowPoint untuk backward-compat grafik.
  const cashflow: CashflowPoint[] = (dataCashflow?.chartData ?? []).map((p) => ({
    label: p.label, masuk: p.masuk, keluar: p.keluar, net: p.net,
    keluarKasbon: 0, keluarExpense: 0, keluarUpah: 0,
  }));

  // Umur piutang — endpoint ar-aging sudah lama ada tapi TIDAK PERNAH dipakai
  // UI. Ditemukan saat menyisir endpoint keuangan; kelas "API tanpa layar"
  // yang membuat fitur terasa hilang padahal datanya siap.
  //
  // Dimuat terpisah dari summary karena ia tak bergantung periode: piutang
  // yang menunggu 90 hari tetap menunggu 90 hari, apa pun rentang yang
  // sedang dilihat di grafik arus kas. Panel ini pelengkap, bukan angka
  // utama — kalau gagal, komponennya menampilkan keadaan kosong yang jujur,
  // jadi `galat` sengaja tak diperiksa di sini (sama seperti versi lama).
  const { data: umur, memuat: umurMemuat } =
    useData<{ buckets: PetaUmur; total_outstanding: number }>("/api/v1/finance/ar-aging");

  // Efek pemuat invoice/pembayaran/kasbon dihapus di sini: ketiganya kini
  // rute sendiri dan memuat datanya masing-masing. Halaman Ringkasan hanya
  // butuh `summary` + `cashflow` + umur piutang.

  // Arus kas & profitabilitas kini rute sendiri:
  //   /keuangan/arus-kas · /keuangan/profitabilitas

  return (
    <div style={{ /* Padding DIHAPUS: layout bagian ini (kas/keuangan/mandor/layout.tsx)
         sudah memberi `20px 24px 24px` pada pembungkusnya. Menambahkan
         `--pad-x` di sini membuat jarak tepi terhitung DUA KALI —
         diukur 24+36=60px, sementara halaman lain 36px. */
      padding: 0, width: "100%", maxWidth: "var(--w-luas)", margin: "0 auto" }}>

    {/*
      `padding: 0`, sebelumnya `20`.

      Founder: *"isi konten yg dalam card besar ini terlalu longgar"*. Diukur
      dari sumbernya — pembungkus ini BERSARANG di dalam pembungkus halaman
      yang sudah memberi `--pad-x` (36px). Dua lapis padding menumpuk jadi
      56px di kiri-kanan, sementara halaman lain 36px.

      Yang terlihat: isi halaman ini menjorok lebih dalam daripada halaman
      mana pun, dan tepi kirinya tak sejajar dengan judulnya sendiri.

      Dibuang, bukan dikecilkan: satu wadah = satu padding. Kalau nanti butuh
      jarak antar-bagian, itu tugas `gap`, bukan padding kedua.
    */}
    <div style={{ padding: 0 }}>

        {/* Period filter bar */}
        <div style={{ marginBottom: 20 }}>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
            {(["this_month", "last_3_months", "last_6_months", "this_year", "custom"] as const).map(p => {
              const labels: Record<string, string> = {
                this_month: "Bulan Ini", last_3_months: "3 Bulan",
                last_6_months: "6 Bulan", this_year: "Tahun Ini", custom: "Kustom",
              };
              const active = overviewPeriod === p;
              return (
                <button
                  key={p}
                  onClick={() => setOverviewPeriod(p)}
                  style={{
                    padding: "6px 12px", borderRadius: 99, border: `1px solid ${active ? C.navy : C.border}`,
                    background: active ? C.navy : "var(--surface)", color: active ? "var(--surface)" : C.mid,
                    fontSize: 12, fontWeight: active ? 700 : 400, cursor: "pointer",
                    transition: "all 0.15s",
                  }}
                >
                  {labels[p]}
                </button>
              );
            })}
            {overviewPeriod === "custom" && (
              <div style={{ display: "flex", alignItems: "center", gap: 6, marginLeft: 4 }}>
                <input aria-label="Tanggal mulai"
                  type="date"
                  value={overviewFrom}
                  onChange={e => setOverviewFrom(e.target.value)}
                  style={{ padding: "4px 8px", border: `1px solid ${C.border}`, borderRadius: 6, fontSize: 12, color: C.text, outline: "none" }}
                />
                <span style={{ color: C.muted, fontSize: 12 }}>–</span>
                <input aria-label="Tanggal akhir"
                  type="date"
                  value={overviewTo}
                  onChange={e => setOverviewTo(e.target.value)}
                  style={{ padding: "4px 8px", border: `1px solid ${C.border}`, borderRadius: 6, fontSize: 12, color: C.text, outline: "none" }}
                />
              </div>
            )}
            {summary?.periodLabel && (
              <span style={{ marginLeft: 8, fontSize: 12, color: C.muted, fontStyle: "italic" }}>
                Menampilkan: {summary.periodLabel}
              </span>
            )}
          </div>
        </div>

        {/* Alert strip */}
        <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 20 }}>
          {summary && summary.overdueCount > 0 && (
            <div style={{ padding: "12px 16px", borderRadius: 10, background: C.redBg, border: `1px solid ${C.redBorder}`, display: "flex", alignItems: "center", gap: 8 }}>
              <AlertTriangle size={16} color={C.red} style={{ flexShrink: 0 }} />
              <span style={{ fontSize: 13, fontWeight: 600, color: C.red, flex: 1 }}>
                {summary.overdueCount} invoice jatuh tempo · Total {fmtCompact(summary.totalOverdue)}
              </span>
              {/* Tautan, bukan tombol: sekarang benar-benar berpindah
                  halaman DENGAN saringan terbawa di URL. Sebelumnya ini
                  `setTab("invoice") + setInvStatusFilter("overdue")` — dan
                  hasilnya tak bisa dibagikan ke siapa pun. */}
              <Link href="/keuangan/invoice?status=overdue"
                style={{ padding: "4px 12px", borderRadius: 6, border: `1px solid ${C.redBorder}`, background: "var(--surface)", color: C.red, fontSize: 12, fontWeight: 600, whiteSpace: "nowrap", textDecoration: "none" }}>
                Lihat →
              </Link>
            </div>
          )}
          {summary && summary.kasbonPendingCount > 0 && (
            <div style={{ padding: "12px 16px", borderRadius: 10, background: C.yellowBg, border: `1px solid ${C.yellowBorder}`, display: "flex", alignItems: "center", gap: 8 }}>
              <Clock size={16} color={C.yellow} style={{ flexShrink: 0 }} />
              <span style={{ fontSize: 13, fontWeight: 600, color: C.yellow, flex: 1 }}>
                {summary.kasbonPendingCount} kasbon menunggu persetujuan · {fmtCompact(summary.kasbonPendingTotal)}
              </span>
              <Link href="/keuangan/kasbon"
                style={{ padding: "4px 12px", borderRadius: 6, border: `1px solid ${C.yellowBorder}`, background: "var(--surface)", color: C.yellow, fontSize: 12, fontWeight: 600, whiteSpace: "nowrap", textDecoration: "none" }}>
                Review →
              </Link>
            </div>
          )}
          {summary && summary.wagePendingCount > 0 && (
            <div style={{ padding: "12px 16px", borderRadius: 10, background: C.blueBg, border: `1px solid ${C.blueBorder}`, display: "flex", alignItems: "center", gap: 8 }}>
              <Banknote size={16} color={C.blue} style={{ flexShrink: 0 }} />
              <span style={{ fontSize: 13, fontWeight: 600, color: C.blue, flex: 1 }}>
                {summary.wagePendingCount} laporan upah mandor siap dibayar · {fmtCompact(summary.wagePendingTotal)}
              </span>
            </div>
          )}
        </div>

        {/*
          ── ANALITIK (grafik) — bentuk referensi "Cost Reports & Analytics"
          ─────────────────────────────────────────────────────────────────
          Ditaruh SESUDAH spanduk peringatan dan SEBELUM saldo kas: yang
          mendesak dibaca lebih dulu, lalu gambaran besar, baru rincian.

          Komponen terpisah (`_bersama/analitik.tsx`) dengan panggilan
          jaringannya sendiri — halaman ini sudah 523 baris, dan menyisipkan
          empat grafik + state-nya di sini akan membuatnya tak terbaca.

          Ia memuat sendiri dan MENGHILANG kalau gagal: sisanya halaman ini
          lengkap tanpa grafik, jadi spanduk galat di puncak akan membuat
          orang mengira seluruh modul keuangan rusak.
        */}
        <AnalitikKeuangan />

        {/* Saldo per akun kas */}
        {summary && summary.cashAccounts.length > 0 && (
          <div style={{ marginBottom: 24 }}>
            <h3 style={{ fontSize: 13, fontWeight: 700, color: C.text, marginBottom: 12, display: "flex", alignItems: "center", gap: 6 }}>
              <Wallet size={14} color={C.navy} /> Saldo Kas Real-time
            </h3>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {summary.cashAccounts.map(acc => {
                // Bercabang pada `acc.type` langsung, bukan menebak lewat
                // warna. Versi sebelumnya menulis
                //   typeBg === C.navyLight ? A : typeBg === "var(--navy-light)" ? A : B
                // — dua cabang menguji hal yang SAMA, jadi cabang ketiga
                // tak pernah tercapai untuk kolektor. Ketahuan karena
                // TypeScript menolak perbandingan yang mustahil begitu
                // warnanya jadi konstanta bertipe.
                const typeColor = acc.type === "main" ? C.navy : acc.type === "collector" ? C.aksen : C.green;
                const typeBg = acc.type === "main" ? C.navyLight : acc.type === "collector" ? C.navyLight : C.greenBg;
                const typeBorder = acc.type === "petty_cash" ? C.greenBorder : C.blueBorder;
                const typeLabel = acc.type === "main" ? "Kas Utama" : acc.type === "collector" ? "Kolektor" : "Kas Kecil";
                return (
                  <div key={acc.id} style={{ flex: 1, minWidth: 160, padding: "12px 16px", borderRadius: 10, border: `1px solid ${typeBorder}`, background: "var(--surface)" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
                      <div style={{ width: 28, height: 28, borderRadius: 6, background: typeBg, display: "flex", alignItems: "center", justifyContent: "center" }}>
                        <Wallet size={13} color={typeColor} />
                      </div>
                      <div>
                        <div style={{ fontSize: 12, fontWeight: 600, color: C.text, lineHeight: 1.2 }}>{acc.name}</div>
                        <div style={{ fontSize: "var(--t-mikro)", color: typeColor, fontWeight: 600 }}>{typeLabel}</div>
                      </div>
                    </div>
                    <div style={{ fontSize: 17, fontWeight: 800, color: acc.balance < 0 ? C.red : C.text, fontFamily: "var(--font-display)" }}>
                      {fmtCompact(Number(acc.balance))}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Breakdown biaya — 3 semantic group cards */}
        {summary && (
          <div style={{ marginBottom: 24 }}>
            <h3 style={{ fontSize: 13, fontWeight: 700, color: C.text, marginBottom: 12 }}>
              Rincian Biaya — {summary.periodLabel ?? "Periode ini"}
            </h3>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>

              {/* Group 1: Biaya Tenaga Kerja */}
              <div style={{ padding: "16px 16px", borderRadius: 10, border: `1px solid ${C.blueBorder}`, background: C.blueBg }}>
                <h4 style={{ fontSize: "var(--t-kecil)", fontWeight: 700, color: C.blue, textTransform: "uppercase", letterSpacing: "0.06em", margin: "0 0 12px", display: "flex", alignItems: "center", gap: 4 }}>
                  <Banknote size={12} color={C.blue} /> Biaya Tenaga Kerja
                </h4>
                {[
                  { label: "Upah Mandor Dibayar", value: summary.wageThisMonth },
                  { label: "Bayar Progress %", value: summary.progressThisMonth ?? 0 },
                  { label: "Settlement Borongan", value: summary.settlementThisMonth ?? 0 },
                  { label: "Expense Labor", value: summary.laborExpenseCost ?? 0 },
                ].map(row => (
                  <div key={row.label} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "5px 0", borderBottom: "1px solid rgba(191,219,254,0.5)" }}>
                    <span style={{ fontSize: 12, color: C.text }}>{row.label}</span>
                    <span style={{ fontSize: 12, fontWeight: 600, color: row.value > 0 ? C.blue : C.muted, fontFamily: "monospace" }}>
                      {row.value > 0 ? fmtCompact(row.value) : "—"}
                    </span>
                  </div>
                ))}
                <div style={{ display: "flex", justifyContent: "space-between", paddingTop: 8, marginTop: 4, borderTop: `2px solid ${C.blueBorder}` }}>
                  <span style={{ fontSize: 12, fontWeight: 700, color: C.blue }}>Total Labor</span>
                  <span style={{ fontSize: 13, fontWeight: 800, color: C.blue, fontFamily: "var(--font-display)" }}>{fmtCompact(summary.laborCost ?? 0)}</span>
                </div>
              </div>

              {/* Group 2: Material & Operasional */}
              <div style={{ padding: "16px 16px", borderRadius: 10, border: `1px solid ${C.redBorder}`, background: C.redBg }}>
                <h4 style={{ fontSize: "var(--t-kecil)", fontWeight: 700, color: C.red, textTransform: "uppercase", letterSpacing: "0.06em", margin: "0 0 12px", display: "flex", alignItems: "center", gap: 4 }}>
                  <Receipt size={12} color={C.red} /> Material & Operasional
                </h4>
                {[
                  { label: "Material", value: summary.materialCost ?? 0 },
                  { label: "Equipment / Sewa Alat", value: summary.equipmentCost ?? 0 },
                  { label: "Operasional", value: summary.operationalCost ?? 0 },
                  { label: "Lain-lain", value: summary.otherCost ?? 0 },
                ].map(row => (
                  <div key={row.label} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "5px 0", borderBottom: "1px solid rgba(254,202,202,0.5)" }}>
                    <span style={{ fontSize: 12, color: C.text }}>{row.label}</span>
                    <span style={{ fontSize: 12, fontWeight: 600, color: row.value > 0 ? C.red : C.muted, fontFamily: "monospace" }}>
                      {row.value > 0 ? fmtCompact(row.value) : "—"}
                    </span>
                  </div>
                ))}
                <div style={{ display: "flex", justifyContent: "space-between", paddingTop: 8, marginTop: 4, borderTop: `2px solid ${C.redBorder}` }}>
                  <span style={{ fontSize: 12, fontWeight: 700, color: C.red }}>Total Non-Labor</span>
                  <span style={{ fontSize: 13, fontWeight: 800, color: C.red, fontFamily: "var(--font-display)" }}>{fmtCompact(summary.nonLaborCost ?? 0)}</span>
                </div>
              </div>

              {/* Group 3: Advance Mandor */}
              <div style={{ padding: "16px 16px", borderRadius: 10, border: `1px solid ${C.yellowBorder}`, background: C.yellowBg }}>
                <h4 style={{ fontSize: "var(--t-kecil)", fontWeight: 700, color: C.yellow, textTransform: "uppercase", letterSpacing: "0.06em", margin: "0 0 12px", display: "flex", alignItems: "center", gap: 4 }}>
                  <ArrowUpRight size={12} color={C.yellow} /> Advance Mandor (Uang Muka)
                </h4>
                <div style={{ padding: "5px 0", borderBottom: "1px solid rgba(253,230,138,0.5)" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <span style={{ fontSize: 12, color: C.text }}>Kasbon Beredar (aktif)</span>
                    <span style={{ fontSize: 12, fontWeight: 600, color: C.yellow, fontFamily: "monospace" }}>{fmtCompact(summary.advanceBeredar ?? 0)}</span>
                  </div>
                  <div style={{ fontSize: "var(--t-mikro)", color: C.muted, marginTop: 2 }}>approved, belum dilunasi</div>
                </div>
                <div style={{ padding: "5px 0", borderBottom: "1px solid rgba(253,230,138,0.5)" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <span style={{ fontSize: 12, color: C.text }}>Dilunasi Periode Ini</span>
                    <span style={{ fontSize: 12, fontWeight: 600, color: C.green, fontFamily: "monospace" }}>
                      {(summary.kasbonSettledPeriod ?? 0) > 0 ? `−${fmtCompact(summary.kasbonSettledPeriod ?? 0)}` : "—"}
                    </span>
                  </div>
                  <div style={{ fontSize: "var(--t-mikro)", color: C.muted, marginTop: 2 }}>settled di periode ini</div>
                </div>
                <div style={{ padding: "8px 0 0" }}>
                  <div style={{ fontSize: "var(--t-mikro)", color: C.muted, marginBottom: 4 }}>
                    Advance mandor adalah uang muka (aset lancar), bukan biaya langsung. Biaya terjadi saat settlement.
                  </div>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", paddingTop: 8, marginTop: 4, borderTop: `2px solid ${C.yellowBorder}` }}>
                  <span style={{ fontSize: 12, fontWeight: 700, color: C.yellow }}>Net Advance</span>
                  <span style={{ fontSize: 13, fontWeight: 800, color: C.yellow, fontFamily: "var(--font-display)" }}>
                    {fmtCompact(Math.max(0, (summary.advanceBeredar ?? 0) - (summary.kasbonSettledPeriod ?? 0)))}
                  </span>
                </div>
              </div>

            </div>

            {/* Total baris bawah */}
            <div style={{ marginTop: 12, padding: "12px 16px", borderRadius: 10, background: "var(--surface)", border: `1px solid ${C.border}`, display: "flex", gap: 24, flexWrap: "wrap" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ fontSize: 12, color: C.muted }}>Total Biaya Nyata:</span>
                <span style={{ fontSize: 15, fontWeight: 800, color: C.red, fontFamily: "var(--font-display)" }}>{fmtCompact(summary.totalKeluar ?? summary.keluarThisMonth)}</span>
                <span style={{ fontSize: "var(--t-mikro)", color: C.muted }}>(labor + material + ops)</span>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ fontSize: 12, color: C.muted }}>Advance Beredar:</span>
                <span style={{ fontSize: 15, fontWeight: 800, color: C.yellow, fontFamily: "var(--font-display)" }}>{fmtCompact(summary.advanceBeredar ?? 0)}</span>
                <span style={{ fontSize: "var(--t-mikro)", color: C.muted }}>(tidak termasuk biaya)</span>
              </div>
            </div>

            {/* Ringkasan Invoice di bawah breakdown */}
            <div style={{ marginTop: 14, padding: "12px 16px", borderRadius: 10, border: `1px solid ${C.border}`, background: "var(--surface)" }}>
              <h4 style={{ fontSize: "var(--t-kecil)", fontWeight: 700, color: C.muted, textTransform: "uppercase", letterSpacing: "0.06em", margin: "0 0 10px" }}>
                Ringkasan Invoice
              </h4>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 12 }}>
                {[
                  { label: "Total Ditagih", value: summary.totalInvoiced, color: C.navy },
                  { label: "Sudah Lunas", value: summary.totalPaid, color: C.green },
                  { label: "Belum Lunas", value: summary.totalOutstanding, color: C.yellow },
                  { label: "Jatuh Tempo", value: summary.totalOverdue, color: C.red },
                ].map(row => (
                  <div key={row.label} style={{ padding: "8px 12px", borderRadius: 6, border: `1px solid ${C.border}`, background: "var(--surface-subtle)" }}>
                    <div style={{ fontSize: "var(--t-mikro)", color: C.muted, fontWeight: 600, textTransform: "uppercase", marginBottom: 4 }}>{row.label}</div>
                    <div style={{ fontSize: 15, fontWeight: 800, color: row.color, fontFamily: "var(--font-display)" }}>{fmtCompact(row.value)}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Cashflow Chart */}
        <h3 style={{ fontSize: 13, fontWeight: 700, color: C.text, marginBottom: 12, display: "flex", alignItems: "center", gap: 6 }}>
          <Activity size={14} color={C.navy} /> Cashflow — {summary?.periodLabel ?? "Periode ini"}
        </h3>
        {cashflow.length === 0 ? (
          <div style={{ height: 260, display: "flex", alignItems: "center", justifyContent: "center", color: C.muted, fontSize: 13, background: "var(--surface-subtle)", borderRadius: 10, border: `1px solid ${C.border}` }}>
            {loadingSummary ? "Memuat data cashflow..." : "Tidak ada data cashflow untuk periode ini."}
          </div>
        ) : (
          <div style={{ background: "var(--surface-subtle)", borderRadius: 10, border: `1px solid ${C.border}`, padding: "16px 8px 8px" }}>
            <ResponsiveContainer width="100%" height={260}>
              <ComposedChart data={cashflow} margin={{ top: 4, right: 16, bottom: 4, left: 0 }}>
                {/* Gradasi pada batang: pekat di pangkal, memudar ke atas.
                    Arah yang sama dengan seluruh aplikasi, dan di sini ia
                    punya alasan tambahan — batang yang memudar di ujung tak
                    bersaing dengan garis Net yang melintas di atasnya. */}
                <defs>
                  <linearGradient id="gradMasuk" x1="0" y1="1" x2="0" y2="0">
                    <stop offset="0%" stopColor="var(--success)" stopOpacity={0.95} />
                    <stop offset="100%" stopColor="var(--success)" stopOpacity={0.45} />
                  </linearGradient>
                  <linearGradient id="gradKeluar" x1="0" y1="1" x2="0" y2="0">
                    <stop offset="0%" stopColor="var(--danger)" stopOpacity={0.95} />
                    <stop offset="100%" stopColor="var(--danger)" stopOpacity={0.45} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--surface-hover)" vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: "var(--t-kecil)", fill: C.muted }} tickLine={false} axisLine={{ stroke: C.border }} />
                <YAxis tickFormatter={v => fmtCompact(v)} tick={{ fontSize: "var(--t-mikro)", fill: C.muted }} tickLine={false} axisLine={false} width={72} />
                <Tooltip content={<CashflowTooltip />} cursor={{ fill: "var(--surface-hover)", fillOpacity: 0.5 }} />
                <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12, paddingTop: 8 }} />
                <Bar dataKey="masuk" name="Masuk" fill="url(#gradMasuk)" radius={[4, 4, 0, 0]} maxBarSize={38} />
                <Bar dataKey="keluar" name="Keluar" fill="url(#gradKeluar)" radius={[4, 4, 0, 0]} maxBarSize={38} />
                {/* Net digambar TERAKHIR supaya berada di atas batang — ia
                    jawaban dari pertanyaan yang dibawa orang ke layar ini
                    ("bulan ini saya untung atau rugi"), jadi ia yang harus
                    terbaca lebih dulu. */}
                <Line dataKey="net" name="Net" stroke={C.navy} strokeWidth={2.5}
                  dot={{ r: 3.5, fill: "var(--surface)", stroke: C.navy, strokeWidth: 2 }}
                  activeDot={{ r: 5.5, fill: C.navy, strokeWidth: 0 }} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        )}

        {/* ── Umur piutang ──
            Ditaruh SESUDAH arus kas dengan sengaja: arus kas menjawab "apa
            yang terjadi", umur piutang menjawab "apa yang harus dikejar".
            Urutan itu mengikuti cara orang membaca layar keuangan — melihat
            keadaan dulu, baru mencari tindakan. */}
        <h3 style={{
          fontSize: 13, fontWeight: 700, color: C.text,
          margin: "26px 0 12px", display: "flex", alignItems: "center", gap: 6,
        }}>
          <Clock size={14} color={C.navy} aria-hidden="true" /> Umur Piutang
          <span style={{ fontSize: "var(--t-kecil)", fontWeight: 400, color: C.muted }}>
            · sejak kapan uangnya menunggu
          </span>
        </h3>
        {umurMemuat ? (
          <div aria-hidden="true" style={{
            height: 190, borderRadius: 10,
            background: "var(--surface-subtle)", border: `1px solid ${C.border}`,
          }} />
        ) : (
          <UmurPiutang buckets={umur?.buckets ?? null} total={umur?.total_outstanding ?? 0} />
        )}
    </div>






      {/* ── Modal: Buat Invoice ── */}
      {showCreateInvoice && (
        <CreateInvoiceModal
          onClose={() => setShowCreateInvoice(false)}
          onSuccess={() => {
            setShowCreateInvoice(false);
            // Ringkasan dimuat ulang supaya "Outstanding Invoice" langsung
            // mencerminkan tagihan baru. Perpindahan ke daftar invoice
            // TIDAK dilakukan otomatis lagi: setelah modul dipecah, itu
            // berarti meninggalkan halaman yang sedang dibaca orang.
            void muatUlangSummary();
          }}
        />
      )}


    </div>
  );
}
