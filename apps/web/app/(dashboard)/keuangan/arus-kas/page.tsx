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

  function toggleArusType(t: string) {
    setArusTypes((prev) =>
      prev.includes(t) ? (prev.length > 1 ? prev.filter((x) => x !== t) : prev) : [...prev, t],
    );
  }

  return (
    <div style={{ padding: 20 }}>
      <div style={{ padding: 24 }}>

        {/* Filter Bar */}
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 20, alignItems: "flex-end" }}>
          <div>
            <label htmlFor="arus-from" style={{ fontSize: 11, fontWeight: 600, color: C.muted, display: "block", marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.05em" }}>Dari</label>
            <input id="arus-from" aria-label="Tanggal mulai" type="date" value={arusFrom} onChange={e => setArusFrom(e.target.value)}
              style={{ padding: "7px 10px", borderRadius: 8, border: `1px solid ${C.border}`, fontSize: 12, color: C.text, background: "var(--surface)" }} />
          </div>
          <div>
            <label htmlFor="arus-to" style={{ fontSize: 11, fontWeight: 600, color: C.muted, display: "block", marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.05em" }}>Sampai</label>
            <input id="arus-to" aria-label="Tanggal akhir" type="date" value={arusTo} onChange={e => setArusTo(e.target.value)}
              style={{ padding: "7px 10px", borderRadius: 8, border: `1px solid ${C.border}`, fontSize: 12, color: C.text, background: "var(--surface)" }} />
          </div>
          <div>
            <label htmlFor="arus-project-id" style={{ fontSize: 11, fontWeight: 600, color: C.muted, display: "block", marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.05em" }}>Proyek</label>
            <select id="arus-project-id" aria-label="Saring proyek pada arus kas" value={arusProjectId} onChange={e => setArusProjectId(e.target.value)}
              style={{ padding: "7px 10px", borderRadius: 8, border: `1px solid ${C.border}`, fontSize: 12, color: C.text, background: "var(--surface)", minWidth: 160 }}>
              <option value="">Semua Proyek</option>
              {arusProjectList.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>
          <div>
            <label style={{ fontSize: 11, fontWeight: 600, color: C.muted, display: "block", marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.05em" }}>Jenis</label>
            <div style={{ display: "flex", gap: 6, padding: "7px 10px", borderRadius: 8, border: `1px solid ${C.border}`, background: "var(--surface)", flexWrap: "wrap" }}>
              {[
                { key: "payment",            label: "Pembayaran",    color: C.green },
                { key: "expense",            label: "Pengeluaran",   color: C.red },
                { key: "wage",               label: "Upah",          color: C.blue },
                { key: "kasbon",             label: "Kasbon",        color: C.yellow },
                { key: "progress_payment",   label: "Prog %",        color: "var(--aksen)" },
                { key: "settlement_borongan", label: "Settlement",   color: "var(--data-2)" },
              ].map(t => (
                <label key={t.key} style={{ display: "flex", alignItems: "center", gap: 4, cursor: "pointer", fontSize: 11, fontWeight: 600, color: arusTypes.includes(t.key) ? t.color : C.muted, userSelect: "none" }}>
                  <input type="checkbox" checked={arusTypes.includes(t.key)} onChange={() => toggleArusType(t.key)} style={{ accentColor: t.color, width: 12, height: 12 }} />
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
              style={{ padding: "7px 10px", borderRadius: 8, border: `1px solid ${C.border}`, fontSize: 12, color: C.text, background: "var(--surface)", minWidth: 140, opacity: arusTypes.includes("expense") ? 1 : 0.4 }}>
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
          {(arusProjectId || arusCategoryId || arusTypes.length < 6) && (
            <div style={{ alignSelf: "flex-end" }}>
              <button onClick={() => { setArusProjectId(""); setArusCategoryId(""); setArusCategoryName(""); setArusTypes(["payment","expense","wage","kasbon","progress_payment","settlement_borongan"]); setArusFrom(awalBulan); setArusTo(hariIni); }}
                style={{ padding: "7px 12px", borderRadius: 8, border: `1px solid ${C.border}`, background: "var(--surface)", fontSize: 11, fontWeight: 600, color: C.mid, cursor: "pointer", display: "flex", alignItems: "center", gap: 4 }}>
                <X size={12} /> Reset
              </button>
            </div>
          )}
          {/* Mode toggle */}
          <div style={{ marginLeft: "auto", alignSelf: "flex-end" }}>
            <div style={{ display: "flex", borderRadius: 8, border: `1px solid ${C.border}`, overflow: "hidden", background: "var(--surface)" }}>
              {([
                { key: "mutasi", label: "Mutasi" },
                { key: "chart",  label: "Chart" },
              ] as const).map(m => (
                <button key={m.key} onClick={() => setArusViewMode(m.key)}
                  style={{ padding: "7px 14px", border: "none", fontSize: 11, fontWeight: 600, cursor: "pointer", transition: "all 0.15s",
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
            <div style={{ flex: 1, minWidth: 140, padding: "14px 16px", borderRadius: 10, border: `1px solid ${C.greenBorder}`, background: C.greenBg }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: C.muted, marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.05em", display: "flex", alignItems: "center", gap: 4 }}>
                <ArrowDownLeft size={12} color={C.green} /> Total Masuk
              </div>
              <div style={{ fontSize: 22, fontWeight: 800, color: C.green, fontFamily: "var(--font-display)" }}>{fmtCompact(arusData.totalIn)}</div>
              <div style={{ fontSize: 11, color: C.green, marginTop: 2 }}>{arusData.byType.payment > 0 ? `Pembayaran ${fmtCompact(arusData.byType.payment)}` : "Tidak ada pembayaran"}</div>
            </div>
            <div style={{ flex: 1, minWidth: 140, padding: "14px 16px", borderRadius: 10, border: `1px solid ${C.redBorder}`, background: C.redBg }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: C.muted, marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.05em", display: "flex", alignItems: "center", gap: 4 }}>
                <ArrowUpRight size={12} color={C.red} /> Total Keluar
              </div>
              <div style={{ fontSize: 22, fontWeight: 800, color: C.red, fontFamily: "var(--font-display)" }}>{fmtCompact(arusData.totalOut)}</div>
              <div style={{ fontSize: 11, color: C.mid, marginTop: 2 }}>
                Exp {fmtCompact(arusData.byType.expense)} · Upah {fmtCompact(arusData.byType.wage)} · Kasbon {fmtCompact(arusData.byType.kasbon)}
                {((arusData.byType.progress_payment ?? 0) > 0 || (arusData.byType.settlement_borongan ?? 0) > 0) && (
                  <> · Prog {fmtCompact(arusData.byType.progress_payment ?? 0)} · Settle {fmtCompact(arusData.byType.settlement_borongan ?? 0)}</>
                )}
              </div>
            </div>
            <div style={{ flex: 1, minWidth: 140, padding: "14px 16px", borderRadius: 10, border: `1px solid ${arusData.netFlow >= 0 ? C.greenBorder : C.redBorder}`, background: arusData.netFlow >= 0 ? C.greenBg : C.redBg }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: C.muted, marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.05em" }}>Net Flow</div>
              <div style={{ fontSize: 22, fontWeight: 800, color: arusData.netFlow >= 0 ? C.green : C.red, fontFamily: "var(--font-display)" }}>
                {arusData.netFlow >= 0 ? "+" : ""}{fmtCompact(arusData.netFlow)}
              </div>
            </div>
            <div style={{ flex: 1, minWidth: 140, padding: "14px 16px", borderRadius: 10, border: `1px solid ${C.border}`, background: "var(--surface)" }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: C.muted, marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.05em" }}>Transaksi</div>
              <div style={{ fontSize: 22, fontWeight: 800, color: C.text, fontFamily: "var(--font-display)" }}>{arusData.transactions.length}</div>
              <div style={{ fontSize: 11, color: C.mid, marginTop: 2 }}>entri di periode ini</div>
            </div>
          </div>
        )}

        {/* Mode Chart: chart bar + tabel agregasi per periode */}
        {arusViewMode === "chart" && arusChart.length > 0 && (
          <>
            <div style={{ background: "var(--surface-subtle)", borderRadius: 12, border: `1px solid ${C.border}`, padding: "16px 8px 8px", marginBottom: 20 }}>
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
            <div style={{ overflowX: "auto", borderRadius: 12, border: `1px solid ${C.border}`, background: "var(--surface)" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                <thead>
                  <tr style={{ background: "var(--surface-subtle)", borderBottom: `1px solid ${C.border}` }}>
                    {["Periode", "Masuk", "Keluar", "Net"].map((h, i) => (
                      <th key={i} style={{ padding: "10px 14px", textAlign: i === 0 ? "left" : "right", fontSize: 11, fontWeight: 600, color: C.muted, textTransform: "uppercase", letterSpacing: "0.05em", whiteSpace: "nowrap" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {arusChart.map((row, i) => (
                    <tr key={i} style={{ borderBottom: `1px solid var(--surface-hover)` }}>
                      <td style={{ padding: "10px 14px", fontWeight: 600, color: C.text }}>{row.label}</td>
                      <td style={{ padding: "10px 14px", textAlign: "right", color: C.green, fontWeight: 600, fontFamily: "monospace" }}>{fmtCompact(row.masuk)}</td>
                      <td style={{ padding: "10px 14px", textAlign: "right", color: C.red, fontFamily: "monospace" }}>{fmtCompact(row.keluar)}</td>
                      <td style={{ padding: "10px 14px", textAlign: "right", fontWeight: 700, fontFamily: "monospace", color: row.net >= 0 ? C.green : C.red }}>{row.net >= 0 ? "+" : ""}{fmtCompact(row.net)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
        {arusViewMode === "chart" && !arusChartLoading && arusChart.length === 0 && (
          <div style={{ padding: "48px 24px", textAlign: "center", color: C.muted, fontSize: 13, background: "var(--surface-subtle)", borderRadius: 12, border: `1px solid ${C.border}` }}>
            Tidak ada data di periode ini
          </div>
        )}

        {/* Mode Mutasi: tabel kronologis */}
        {arusViewMode === "mutasi" && (arusLoading ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {[1,2,3,4,5].map(i => <div key={i} style={{ height: 52, borderRadius: 8, background: "var(--surface-hover)" }} />)}
          </div>
        ) : !arusData || arusData.transactions.length === 0 ? (
          <div style={{ padding: "48px 24px", textAlign: "center", color: C.muted, fontSize: 13, background: "var(--surface-subtle)", borderRadius: 12, border: `1px solid ${C.border}` }}>
            Tidak ada transaksi di periode ini
          </div>
        ) : (
          <div style={{ overflowX: "auto", borderRadius: 12, border: `1px solid ${C.border}`, background: "var(--surface)" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
              <thead>
                <tr style={{ background: "var(--surface-subtle)", borderBottom: `1px solid ${C.border}` }}>
                  {["Tanggal", "Keterangan", "Proyek", "Jenis", "Kategori", "Masuk", "Keluar"].map((h, i) => (
                    <th key={i} style={{ padding: "10px 12px", textAlign: i >= 5 ? "right" : "left", fontSize: 11, fontWeight: 600, color: C.muted, textTransform: "uppercase", letterSpacing: "0.05em", whiteSpace: "nowrap" }}>{h}</th>
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
                    settlement_borongan: { label: "Settlement",    color: "var(--data-2)", bg: "var(--success-bg)",   border: "#A5F3FC" },
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
                        <td style={{ padding: "10px 12px", color: C.mid, whiteSpace: "nowrap", fontSize: 11 }}>{dateStr}</td>
                        <td style={{ padding: "10px 12px", maxWidth: 240 }}>
                          <div style={{ fontWeight: 600, color: C.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{tx.label}</div>
                          {tx.sub_label && <div style={{ fontSize: 10, color: C.muted, marginTop: 1 }}>{tx.sub_label}</div>}
                        </td>
                        <td style={{ padding: "10px 12px", color: C.mid, fontSize: 11, whiteSpace: "nowrap" }}>{tx.project?.name ?? "—"}</td>
                        <td style={{ padding: "10px 12px" }}>
                          <span style={{ display: "inline-flex", alignItems: "center", padding: "2px 8px", borderRadius: 99, fontSize: 10, fontWeight: 600, color: tm.color, background: tm.bg, border: `1px solid ${tm.border}`, whiteSpace: "nowrap" }}>
                            {tm.label}
                          </span>
                        </td>
                        <td style={{ padding: "10px 12px", fontSize: 11, color: C.mid }}>
                          {tx.category ? (
                            <span>
                              {tx.category.parent_name && <span style={{ color: C.muted }}>{tx.category.parent_name} › </span>}
                              {tx.category.name}
                            </span>
                          ) : "—"}
                        </td>
                        <td style={{ padding: "10px 12px", textAlign: "right", fontWeight: 700, color: C.green, fontFamily: "monospace", fontSize: 12 }}>
                          {tx.direction === "in" ? fmt(tx.amount) : "—"}
                        </td>
                        <td style={{ padding: "10px 12px", textAlign: "right", fontWeight: 700, color: C.red, fontFamily: "monospace", fontSize: 12 }}>
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
