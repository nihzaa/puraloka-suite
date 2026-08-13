"use client";

/**
 * ARUS KAS — mutasi uang masuk dan keluar, lintas proyek.
 *
 * Isinya dipindah UTUH dari tab kelima keuangan/page.tsx, tidak ditulis
 * ulang. Itu disengaja: 267 baris ini menangani enam jenis transaksi
 * (pembayaran, pengeluaran, upah, kasbon, progres, settlement borongan), dan
 * menulisnya ulang "sambil merapikan" adalah cara paling mudah menghilangkan
 * satu jenis tanpa ada yang sadar — angka arus kas yang kurang satu kategori
 * tetap terlihat masuk akal.
 *
 * Perapian menyusul di commit terpisah, supaya diff-nya bisa dibaca.
 */

import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowDownLeft, ArrowUpRight, 
  X,
} from "lucide-react";
import {
  ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer,
} from "recharts";
import { api, makeAbortController } from "@/lib/api";
import { C } from "@/lib/warna-ui";
import { Kosong } from "@/components/ui-dasar";
import { Tabel } from "@/components/dasar";
import { CashflowTooltip } from "../_bersama/komponen";
import {
  fmt, fmtCompact, fmtDate,
  type ArusKasData, type ArusKasChartPoint, type ExpenseCategory, type Project,
} from "../_bersama/tipe";

export default function ArusKasPage() {
  // Rentang bawaan: awal bulan berjalan sampai hari ini. Bukan "30 hari
  // terakhir" — orang keuangan berpikir dalam bulan buku, dan rentang yang
  // menyeberang bulan menghasilkan angka yang tak bisa dicocokkan dengan
  // laporan mana pun.
  const kini = new Date();
  const awalBulan = new Date(kini.getFullYear(), kini.getMonth(), 1).toISOString().split("T")[0];
  const hariIni = kini.toISOString().split("T")[0];

  const [arusFrom, setArusFrom] = useState(awalBulan);
  const [arusTo, setArusTo] = useState(hariIni);
  const [arusProjectId, setArusProjectId] = useState("");
  const [arusTypes, setArusTypes] = useState<string[]>([
    "payment", "expense", "wage", "kasbon", "progress_payment", "settlement_borongan",
  ]);
  const [arusCategoryId, setArusCategoryId] = useState("");
  const [arusCategoryName, setArusCategoryName] = useState("");
  const [arusViewMode, setArusViewMode] = useState<"mutasi" | "chart">("mutasi");
  const [arusData, setArusData] = useState<ArusKasData | null>(null);
  const [arusChart, setArusChart] = useState<ArusKasChartPoint[]>([]);
  const [arusLoading, setArusLoading] = useState(true);
  const [arusChartLoading, setArusChartLoading] = useState(true);
  const [arusProjectList, setArusProjectList] = useState<Project[]>([]);
  const [arusCategories, setArusCategories] = useState<ExpenseCategory[]>([]);
  const [arusExpandedId, setArusExpandedId] = useState<string | null>(null);
  const arusDebounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Daftar proyek untuk dropdown — sekali saja, tak bergantung saringan.
  useEffect(() => {
    const ac = makeAbortController();
    api.get<{ projects: Project[] }>("/api/v1/projects", { signal: ac.signal })
      .then((r) => setArusProjectList(r.data.projects))
      .catch(() => {});
    return () => ac.abort();
  }, []);

  // Kategori mengikuti proyek yang dipilih: kategori pengeluaran bisa berbeda
  // per proyek, dan menampilkan kategori milik proyek lain membuat saringan
  // menghasilkan nol baris tanpa penjelasan apa pun.
  useEffect(() => {
    const ac = makeAbortController();
    const url = arusProjectId
      ? `/api/v1/cash/categories?project_id=${arusProjectId}`
      : "/api/v1/cash/categories";
    api.get<{ categories: ExpenseCategory[] }>(url, { signal: ac.signal })
      .then((r) => {
        setArusCategories(r.data.categories);
        setArusCategoryId("");
        setArusCategoryName("");
      })
      .catch(() => {});
    return () => ac.abort();
  }, [arusProjectId]);

  const loadArusKas = useCallback(async (
    from: string, to: string, projectId: string, types: string[],
    catId: string, catName: string, signal?: AbortSignal,
  ) => {
    setArusLoading(true);
    setArusChartLoading(true);
    try {
      const params: Record<string, string> = {
        date_from: from, date_to: to, type: types.join(","),
      };
      if (projectId) params.project_id = projectId;
      if (catId && projectId) params.category_id = catId;
      else if (catName) params.category_name = catName;

      const [txRes, chartRes] = await Promise.all([
        api.get<ArusKasData>("/api/v1/finance/cashflow-transactions", { params, signal }),
        api.get<{ chartData: ArusKasChartPoint[] }>("/api/v1/finance/cashflow-chart", { params, signal }),
      ]);
      setArusData(txRes.data);
      setArusChart(chartRes.data.chartData);
    } catch (e: unknown) {
      if ((e as { name?: string })?.name === "CanceledError") return;
      setArusData(null);
    } finally {
      setArusLoading(false);
      setArusChartLoading(false);
    }
  }, []);

  // Ditunda 300ms: saringan tanggal berubah tiap ketikan, dan tanpa penundaan
  // satu perubahan rentang mengirim belasan permintaan yang saling menyusul.
  useEffect(() => {
    const ac = makeAbortController();
    if (arusDebounce.current) clearTimeout(arusDebounce.current);
    arusDebounce.current = setTimeout(
      () => loadArusKas(arusFrom, arusTo, arusProjectId, arusTypes, arusCategoryId, arusCategoryName, ac.signal),
      300,
    );
    return () => {
      if (arusDebounce.current) clearTimeout(arusDebounce.current);
      ac.abort();
    };
  }, [arusFrom, arusTo, arusProjectId, arusTypes, arusCategoryId, arusCategoryName, loadArusKas]);

  /**
   * Ada saringan selain rentang tanggal.
   *
   * Dipakai dua tempat: tombol Reset, dan penjelasan di layar kosong.
   * Diangkat jadi satu ungkapan supaya keduanya tak bisa berbeda —
   * layar kosong yang bilang "tak ada saringan aktif" sementara tombol
   * Reset muncul akan membuat orang mengira sistemnya salah hitung.
   *
   * `arusTypes.length < 6` — enam adalah jumlah jenis transaksi bawaan
   * di `useState` di atas; kurang dari itu berarti ada yang dimatikan.
   */
  const adaSaringanLain = Boolean(arusProjectId) || Boolean(arusCategoryId) || arusTypes.length < 6;

  function toggleArusType(t: string) {
    setArusTypes((prev) =>
      prev.includes(t) ? (prev.length > 1 ? prev.filter((x) => x !== t) : prev) : [...prev, t],
    );
  }

  return (
    // Padding disediakan `keuangan/layout.tsx` — lihat catatan di sana.
    // Menambahkannya lagi di sini membuat jaraknya ganda dan berbeda-beda
    // antar bagian (diukur: 74px / 37px / 1px sebelum diseragamkan).
    <div style={{
      width: "100%", maxWidth: "var(--w-page)", margin: "0 auto",
    }}>
      {/* Pembungkus TANPA padding — sisa pola lama saat tiap bagian
          mengatur jaraknya sendiri. `keuangan/layout.tsx` kini yang
          menyediakannya; menyisakan 24px di sini membuat arus-kas menjorok
          49px sementara bagian lain 25px. */}
      <div>

        {/* Filter Bar */}
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 20, alignItems: "flex-end" }}>
          <div>
            <label htmlFor="arus-from" style={{ fontSize: 11, fontWeight: 600, color: C.muted, display: "block", marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.05em" }}>Dari</label>
            <input id="arus-from" aria-label="Tanggal mulai" type="date" value={arusFrom} onChange={e => setArusFrom(e.target.value)}
              style={{ padding: "6px 8px", borderRadius: 6, border: `1px solid ${C.border}`, fontSize: 12, color: C.text, background: "var(--surface)" }} />
          </div>
          <div>
            <label htmlFor="arus-to" style={{ fontSize: 11, fontWeight: 600, color: C.muted, display: "block", marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.05em" }}>Sampai</label>
            <input id="arus-to" aria-label="Tanggal akhir" type="date" value={arusTo} onChange={e => setArusTo(e.target.value)}
              style={{ padding: "6px 8px", borderRadius: 6, border: `1px solid ${C.border}`, fontSize: 12, color: C.text, background: "var(--surface)" }} />
          </div>
          <div>
            <label htmlFor="arus-project-id" style={{ fontSize: 11, fontWeight: 600, color: C.muted, display: "block", marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.05em" }}>Proyek</label>
            <select id="arus-project-id" aria-label="Saring proyek pada arus kas" value={arusProjectId} onChange={e => setArusProjectId(e.target.value)}
              style={{ padding: "6px 8px", borderRadius: 6, border: `1px solid ${C.border}`, fontSize: 12, color: C.text, background: "var(--surface)", minWidth: 160 }}>
              <option value="">Semua Proyek</option>
              {arusProjectList.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>
          <div>
            <label style={{ fontSize: 11, fontWeight: 600, color: C.muted, display: "block", marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.05em" }}>Jenis</label>
            <div style={{ display: "flex", gap: 6, padding: "6px 8px", borderRadius: 6, border: `1px solid ${C.border}`, background: "var(--surface)", flexWrap: "wrap" }}>
              {[
                { key: "payment",            label: "Pembayaran",    color: C.green },
                { key: "expense",            label: "Pengeluaran",   color: C.red },
                { key: "wage",               label: "Upah",          color: C.blue },
                { key: "kasbon",             label: "Kasbon",        color: C.yellow },
                { key: "progress_payment",   label: "Prog %",        color: "var(--aksen)" },
                { key: "settlement_borongan", label: "Settlement",   color: "var(--info)" },
              ].map(t => (
                // Warna kategori dipakai pada KOTAK penanda, bukan pada teks.
                //
                // `--data-2` (3,68:1) dan `--data-5` (3,56:1) gagal ambang teks
                // WCAG AA 4,5:1 — diukur, bukan ditaksir. Keduanya dirancang
                // sebagai pengisi grafik, di mana ambangnya 3:1 untuk komponen
                // non-teks. Memakainya sebagai warna teks meminjam palet untuk
                // tujuan yang syaratnya lebih ketat.
                //
                // Aktif/tidak tetap terbaca dari tebal huruf + centang kotaknya,
                // jadi tak ada informasi yang hilang.
                <label key={t.key} style={{ display: "flex", alignItems: "center", gap: 5, cursor: "pointer", fontSize: 11, fontWeight: arusTypes.includes(t.key) ? 700 : 500, color: arusTypes.includes(t.key) ? C.text : C.muted, userSelect: "none" }}>
                  <input type="checkbox" checked={arusTypes.includes(t.key)} onChange={() => toggleArusType(t.key)} style={{ accentColor: t.color, width: 12, height: 12 }} />
                  <span aria-hidden="true" style={{ width: 8, height: 8, borderRadius: 2, background: t.color, flexShrink: 0, opacity: arusTypes.includes(t.key) ? 1 : 0.35 }} />
                  {t.label}
                </label>
              ))}
            </div>
          </div>
          <div>
            <label htmlFor="arus-category-id" style={{ fontSize: 11, fontWeight: 600, color: C.muted, display: "block", marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.05em" }}>Kategori</label>
            <select id="arus-category-id" aria-label="Saring kategori pada arus kas" value={arusCategoryId} onChange={e => {
              const id = e.target.value;
              const found = arusCategories.find(c => c.id === id);
              setArusCategoryId(id);
              setArusCategoryName(found ? found.name : "");
            }}
              style={{ padding: "6px 8px", borderRadius: 6, border: `1px solid ${C.border}`, fontSize: 12, color: C.text, background: "var(--surface)", minWidth: 140 }}
              // `opacity: 0.4` dihapus: ia menjatuhkan kontras teks di
              // dalam select di bawah ambang WCAG. Keadaan "tak berlaku"
              // sudah disampaikan `disabled` di bawah, yang PUNYA gaya
              // bawaan peramban dan dibacakan pembaca layar.
              disabled={!arusTypes.includes("expense")}>
              <option value="">Semua Kategori</option>
              {arusCategories.filter(c => !c.parent_id).map(parent => (
                <optgroup key={parent.id} label={parent.name}>
                  {arusCategories.filter(c => c.parent_id === parent.id).map(sub => (
                    <option key={sub.id} value={sub.id}>{sub.name}</option>
                  ))}
                  <option value={parent.id}>{parent.name} (semua)</option>
                </optgroup>
              ))}
            </select>
          </div>
          {adaSaringanLain && (
            <div style={{ alignSelf: "flex-end" }}>
              <button onClick={() => { setArusProjectId(""); setArusCategoryId(""); setArusCategoryName(""); setArusTypes(["payment","expense","wage","kasbon","progress_payment","settlement_borongan"]); setArusFrom(awalBulan); setArusTo(hariIni); }}
                style={{ padding: "6px 12px", borderRadius: 6, border: `1px solid ${C.border}`, background: "var(--surface)", fontSize: 11, fontWeight: 600, color: C.mid, cursor: "pointer", display: "flex", alignItems: "center", gap: 4 }}>
                <X size={12} /> Reset
              </button>
            </div>
          )}
          {/* Mode toggle */}
          <div style={{ marginLeft: "auto", alignSelf: "flex-end" }}>
            <div style={{ display: "flex", borderRadius: 6, border: `1px solid ${C.border}`, overflow: "hidden", background: "var(--surface)" }}>
              {([
                { key: "mutasi", label: "Mutasi" },
                { key: "chart",  label: "Chart" },
              ] as const).map(m => (
                <button key={m.key} onClick={() => setArusViewMode(m.key)}
                  style={{ padding: "6px 12px", border: "none", fontSize: 11, fontWeight: 600, cursor: "pointer", transition: "all 0.15s",
                    background: arusViewMode === m.key ? C.navy : "transparent",
                    color: arusViewMode === m.key ? "var(--surface)" : C.mid }}>
                  {m.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* KPI Strip */}
        {arusLoading ? (
          <div style={{ display: "flex", gap: 12, marginBottom: 20 }}>
            {[1,2,3,4].map(i => <div key={i} style={{ flex:1, height:72, borderRadius:10, background:"var(--surface-hover)" }} />)}
          </div>
        ) : arusData && (
          <div style={{ display: "flex", gap: 12, marginBottom: 20, flexWrap: "wrap" }}>
            <div style={{ flex: 1, minWidth: 140, padding: "12px 16px", borderRadius: 10, border: `1px solid ${C.greenBorder}`, background: C.greenBg }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: C.muted, marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.05em", display: "flex", alignItems: "center", gap: 4 }}>
                <ArrowDownLeft size={12} color={C.green} /> Total Masuk
              </div>
              <div style={{ fontSize: "var(--teks-kpi)", fontWeight: 800, color: C.green, fontFamily: "var(--font-display)" }}>{fmtCompact(arusData.totalIn)}</div>
              <div style={{ fontSize: 11, color: C.green, marginTop: 2 }}>{arusData.byType.payment > 0 ? `Pembayaran ${fmtCompact(arusData.byType.payment)}` : "Tidak ada pembayaran"}</div>
            </div>
            <div style={{ flex: 1, minWidth: 140, padding: "12px 16px", borderRadius: 10, border: `1px solid ${C.redBorder}`, background: C.redBg }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: C.muted, marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.05em", display: "flex", alignItems: "center", gap: 4 }}>
                <ArrowUpRight size={12} color={C.red} /> Total Keluar
              </div>
              <div style={{ fontSize: "var(--teks-kpi)", fontWeight: 800, color: C.red, fontFamily: "var(--font-display)" }}>{fmtCompact(arusData.totalOut)}</div>
              <div style={{ fontSize: 11, color: C.mid, marginTop: 2 }}>
                Exp {fmtCompact(arusData.byType.expense)} · Upah {fmtCompact(arusData.byType.wage)} · Kasbon {fmtCompact(arusData.byType.kasbon)}
                {((arusData.byType.progress_payment ?? 0) > 0 || (arusData.byType.settlement_borongan ?? 0) > 0) && (
                  <> · Prog {fmtCompact(arusData.byType.progress_payment ?? 0)} · Settle {fmtCompact(arusData.byType.settlement_borongan ?? 0)}</>
                )}
              </div>
            </div>
            <div style={{ flex: 1, minWidth: 140, padding: "12px 16px", borderRadius: 10, border: `1px solid ${arusData.netFlow >= 0 ? C.greenBorder : C.redBorder}`, background: arusData.netFlow >= 0 ? C.greenBg : C.redBg }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: C.muted, marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.05em" }}>Net Flow</div>
              <div style={{ fontSize: "var(--teks-kpi)", fontWeight: 800, color: arusData.netFlow >= 0 ? C.green : C.red, fontFamily: "var(--font-display)" }}>
                {arusData.netFlow >= 0 ? "+" : ""}{fmtCompact(arusData.netFlow)}
              </div>
            </div>
            <div style={{ flex: 1, minWidth: 140, padding: "12px 16px", borderRadius: 10, border: `1px solid ${C.border}`, background: "var(--surface)" }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: C.muted, marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.05em" }}>Transaksi</div>
              <div style={{ fontSize: "var(--teks-kpi)", fontWeight: 800, color: C.text, fontFamily: "var(--font-display)" }}>{arusData.transactions.length}</div>
              <div style={{ fontSize: 11, color: C.mid, marginTop: 2 }}>entri di periode ini</div>
            </div>
          </div>
        )}

        {/* Mode Chart: chart bar + tabel agregasi per periode */}
        {arusViewMode === "chart" && arusChart.length > 0 && (
          <>
            <div style={{ background: "var(--surface-subtle)", borderRadius: 10, border: `1px solid ${C.border}`, padding: "16px 8px 8px", marginBottom: 20 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: C.mid, paddingLeft: 12, marginBottom: 8 }}>Trend Arus Kas</div>
              <ResponsiveContainer width="100%" height={260}>
                <ComposedChart data={arusChart} margin={{ top: 4, right: 16, bottom: 4, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--surface-hover)" />
                  <XAxis dataKey="label" tick={{ fontSize: 10, fill: C.muted }} tickLine={false} axisLine={{ stroke: C.border }} />
                  <YAxis tickFormatter={v => fmtCompact(v)} tick={{ fontSize: 10, fill: C.muted }} tickLine={false} axisLine={false} width={72} />
                  <Tooltip content={<CashflowTooltip />} />
                  <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 11, paddingTop: 8 }} />
                  <Bar dataKey="masuk" name="Masuk" fill="var(--success)" fillOpacity={0.85} radius={[4, 4, 0, 0]} />
                  <Bar dataKey="keluar" name="Keluar" fill="var(--danger)" fillOpacity={0.85} radius={[4, 4, 0, 0]} />
                  <Line dataKey="net" name="Net" stroke={C.navy} strokeWidth={2} dot={{ r: 3, fill: C.navy, strokeWidth: 0 }} />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
            {/* Tabel agregasi per periode */}
            {/* Dipindahkan ke <Tabel> 2026-08-07 (UI-0-4). Kepala baris tetap
                kolom Periode, dengan alasan yang sama seperti sebelum
                perpindahan: tanpa itu pembaca layar membacakan "Rp 4.500.000"
                tanpa menyebut periode mana, dan di tabel keuangan itu angka
                tanpa pemilik. Bedanya sekarang komponen yang menjaminnya —
                termasuk tabular-nums, yang membuat Masuk/Keluar/Net bisa
                dibandingkan sebagai kolom, bukan dibaca satu-satu.

                Prop `total` (→ `<tfoot>`) sengaja TIDAK dipakai: tabel ini
                memang tak punya baris jumlah, dan menambahkannya sekarang
                berarti memperkenalkan angka baru lewat pekerjaan yang
                seharusnya nol-perubahan-perilaku. Ringkasan periodenya sudah
                ada di kartu KPI di atas chart. */}
            <div style={{ borderRadius: 10, border: `1px solid ${C.border}`, background: "var(--surface)", overflow: "hidden" }}>
              <Tabel<ArusKasChartPoint>
              berpermukaan
                caption="Arus kas per periode: uang masuk, uang keluar, dan selisih bersihnya."
                data={arusChart}
                kunciBaris={row => row.label}
                kolom={[
                  {
                    kunci: "periode", judul: "Periode", kepalaBaris: true,
                    render: row => <span style={{ fontWeight: 600 }}>{row.label}</span>,
                  },
                  {
                    kunci: "masuk", judul: "Masuk", rata: "kanan",
                    render: row => <span style={{ color: C.green, fontWeight: 600 }}>{fmtCompact(row.masuk)}</span>,
                  },
                  {
                    kunci: "keluar", judul: "Keluar", rata: "kanan",
                    render: row => <span style={{ color: C.red }}>{fmtCompact(row.keluar)}</span>,
                  },
                  {
                    kunci: "net", judul: "Net", rata: "kanan",
                    render: row => (
                      <span style={{ fontWeight: 700, color: row.net >= 0 ? C.green : C.red }}>
                        {row.net >= 0 ? "+" : ""}{fmtCompact(row.net)}
                      </span>
                    ),
                  },
                ]}
              />
            </div>
          </>
        )}
        {arusViewMode === "chart" && !arusChartLoading && arusChart.length === 0 && (
          <Kosong
            judul="Tidak ada arus kas di rentang ini"
            sebab={<>
              Rentang aktif <strong>{fmtDate(arusFrom)} – {fmtDate(arusTo)}</strong>
              {adaSaringanLain && <>, dengan saringan proyek/jenis/kategori aktif</>}.
              {" "}Kosong di sini berarti tak ada transaksi yang lolos — bukan
              berarti datanya hilang.
            </>}
          />
        )}

        {/* Mode Mutasi: tabel kronologis */}
        {arusViewMode === "mutasi" && (arusLoading ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {[1,2,3,4,5].map(i => <div key={i} style={{ height: 52, borderRadius: 6, background: "var(--surface-hover)" }} />)}
          </div>
        ) : !arusData || arusData.transactions.length === 0 ? (
          <Kosong
            judul="Tidak ada transaksi di rentang ini"
            sebab={<>
              Rentang aktif <strong>{fmtDate(arusFrom)} – {fmtDate(arusTo)}</strong>
              {adaSaringanLain && <>, dengan saringan proyek/jenis/kategori aktif</>}.
              {" "}Coba lebarkan rentang tanggalnya sebelum menyimpulkan tak ada
              pergerakan kas.
            </>}
          />
        ) : (
          // ⚠️ TIDAK bisa dipindahkan ke <Tabel> — diperiksa 2026-08-07
          // (UI-0-4). Jangan mencobanya lagi tanpa lebih dulu menambah
          // kemampuan barisnya ke `components/dasar.tsx`.
          //
          // Sebabnya: setiap transaksi merender DUA <tr> dalam satu
          // React.Fragment — baris datanya, lalu (kalau `arusExpandedId`
          // cocok) baris rincian ber-colSpan 7 yang memuat seluruh
          // `tx.meta`. `Tabel` memetakan satu elemen data ke tepat satu
          // baris dan tak punya jalan untuk menyisipkan baris kedua;
          // colSpan hanya ada di prop `total`, yang isinya <tfoot> dan
          // cuma satu baris untuk seluruh tabel.
          //
          // Memaksakannya berarti menghapus fitur "klik untuk lihat
          // rincian" — itu perubahan produk, bukan perapian UI.
          <div style={{ overflowX: "auto", borderRadius: 10, border: `1px solid ${C.border}`, background: "var(--surface)" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12, fontVariantNumeric: "tabular-nums" }}>
              <caption className="sr-only">Rincian transaksi kas: tanggal, keterangan, proyek, jenis, kategori, serta nilai masuk dan keluar.</caption>
              <thead>
                <tr style={{ background: "var(--surface-subtle)", borderBottom: `1px solid ${C.border}` }}>
                  {["Tanggal", "Keterangan", "Proyek", "Jenis", "Kategori", "Masuk", "Keluar"].map((h, i) => (
                    <th key={i} style={{ padding: "8px 12px", textAlign: i >= 5 ? "right" : "left", fontSize: 11, fontWeight: 600, color: C.muted, textTransform: "uppercase", letterSpacing: "0.05em", whiteSpace: "nowrap" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {arusData.transactions.map(tx => {
                  const expanded = arusExpandedId === tx.id;
                  const typeMeta: Record<string, { label: string; color: string; bg: string; border: string }> = {
                    payment:             { label: "Pembayaran",    color: C.green,   bg: C.greenBg,   border: C.greenBorder },
                    expense:             { label: "Pengeluaran",   color: C.red,     bg: C.redBg,     border: C.redBorder },
                    wage:                { label: "Upah",          color: C.blue,    bg: C.blueBg,    border: C.blueBorder },
                    kasbon:              { label: "Kasbon",        color: C.yellow,  bg: C.yellowBg,  border: C.yellowBorder },
                    progress_payment:    { label: "Progress %",    color: "var(--aksen)", bg: "var(--navy-light)",   border: "var(--info-border)" },
                    settlement_borongan: { label: "Settlement",    color: "var(--info)", bg: "var(--success-bg)",   border: "#A5F3FC" },
                  };
                  const tm = typeMeta[tx.type] ?? { label: tx.type, color: C.muted, bg: "var(--surface-hover)", border: C.border };
                  const dateStr = fmtDate(tx.date);

                  return (
                    <React.Fragment key={tx.id}>
                      <tr
                        onClick={() => setArusExpandedId(expanded ? null : tx.id)}
                        style={{ borderBottom: `1px solid var(--surface-hover)`, cursor: "pointer", background: expanded ? "var(--surface-subtle)" : "transparent" }}
                        onMouseEnter={e => { if (!expanded) e.currentTarget.style.background = "var(--surface-subtle)"; }}
                        onMouseLeave={e => { if (!expanded) e.currentTarget.style.background = "transparent"; }}
                      >
                        <td style={{ padding: "8px 12px", color: C.mid, whiteSpace: "nowrap", fontSize: 11 }}>{dateStr}</td>
                        {/* `<th scope="row">` pada Keterangan, bukan pada
                            Tanggal: yang MENAMAI baris ini bagi pembaca layar
                            adalah "Pembayaran termin 2 — Ruko Cimahi", bukan
                            "3 Agu" (yang berulang di banyak baris dan tak
                            membedakan apa pun). Preseden yang sama dipakai
                            gudang/material-klien: Tanggal → Material. */}
                        <th scope="row" style={{ padding: "8px 12px", maxWidth: 240, textAlign: "left", fontWeight: 400 }}>
                          <div style={{ fontWeight: 600, color: C.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{tx.label}</div>
                          {tx.sub_label && <div style={{ fontSize: 10, color: C.muted, marginTop: 1 }}>{tx.sub_label}</div>}
                        </th>
                        <td style={{ padding: "8px 12px", color: C.mid, fontSize: 11, whiteSpace: "nowrap" }}>{tx.project?.name ?? "—"}</td>
                        <td style={{ padding: "8px 12px" }}>
                          <span style={{ display: "inline-flex", alignItems: "center", padding: "2px 8px", borderRadius: 99, fontSize: 10, fontWeight: 600, color: tm.color, background: tm.bg, border: `1px solid ${tm.border}`, whiteSpace: "nowrap" }}>
                            {tm.label}
                          </span>
                        </td>
                        <td style={{ padding: "8px 12px", fontSize: 11, color: C.mid }}>
                          {tx.category ? (
                            <span>
                              {tx.category.parent_name && <span style={{ color: C.muted }}>{tx.category.parent_name} › </span>}
                              {tx.category.name}
                            </span>
                          ) : "—"}
                        </td>
                        <td style={{ padding: "8px 12px", textAlign: "right", fontWeight: 700, color: C.green, fontFamily: "monospace", fontSize: 12 }}>
                          {tx.direction === "in" ? fmt(tx.amount) : "—"}
                        </td>
                        <td style={{ padding: "8px 12px", textAlign: "right", fontWeight: 700, color: C.red, fontFamily: "monospace", fontSize: 12 }}>
                          {tx.direction === "out" ? fmt(tx.amount) : "—"}
                        </td>
                      </tr>
                      {expanded && (
                        <tr style={{ background: "var(--surface-subtle)", borderBottom: `1px solid ${C.border}` }}>
                          <td colSpan={7} style={{ padding: "12px 16px" }}>
                            <div style={{ display: "flex", gap: 24, flexWrap: "wrap" }}>
                              {Object.entries(tx.meta).filter(([, v]) => v != null && v !== "").map(([k, v]) => (
                                <div key={k} style={{ fontSize: 11 }}>
                                  <span style={{ color: C.muted, textTransform: "uppercase", letterSpacing: "0.04em", fontWeight: 600 }}>{k.replace(/_/g," ")} </span>
                                  <span style={{ color: C.text, fontWeight: 500 }}>{String(v)}</span>
                                </div>
                              ))}
                              <div style={{ fontSize: 11 }}>
                                <span style={{ color: C.muted, textTransform: "uppercase", letterSpacing: "0.04em", fontWeight: 600 }}>jumlah </span>
                                <span style={{ color: tx.direction === "in" ? C.green : C.red, fontWeight: 700 }}>{fmt(tx.amount)}</span>
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        ))}
      </div>

    </div>
  );
}
