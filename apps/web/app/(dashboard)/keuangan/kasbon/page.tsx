"use client";

/**
 * KASBON — uang muka mandor dan tukang yang menunggu keputusan.
 *
 * ── Kenapa halaman ini yang paling berhak jadi rute sendiri
 *
 * Ini satu-satunya bagian modul Keuangan yang berisi PEKERJAAN, bukan
 * laporan: ada tombol Setujui dan Tolak, dan setiap baris yang menggantung
 * berarti mandor di lapangan sedang menunggu uang. Sebagai tab, ia hanya
 * bisa dicapai dengan dua klik dari mana pun, dan tak bisa dikirim sebagai
 * tautan ("tolong approve yang ini").
 *
 * Isinya dipindah UTUH dari tab keempat keuangan/page.tsx — 405 baris
 * dengan dua sub-tampilan (mandor / tukang) dan ringkasan per orang.
 * Menulisnya ulang berarti mempertaruhkan alur persetujuan uang.
 */

import React, { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import {
  AlertTriangle, Banknote, Clock,
  PieChart, Plus, RefreshCw, Wallet, 
} from "lucide-react";
import { api, hasPermission, makeAbortController } from "@/lib/api";
import { Kosong } from "@/components/ui-dasar";
import { Paginasi } from "@/components/paginasi";
import { C } from "@/lib/warna-ui";
import { Skeleton, StatusBadge, AddKasbonModal } from "../_bersama/komponen";
import {
  fmt, fmtCompact, fmtDate, KASBON_STATUS, PURPOSE_LABEL, FUND_SOURCE_LABEL,
  type Kasbon, type WorkerKasbon, type KasbonSummaryData, type CashAccount,
} from "../_bersama/tipe";

/** 25 baris per halaman — cukup untuk memindai sekilas tanpa menggulir. */
const PER_HALAMAN = 25;

export default function KasbonPage() {
  const [kasbons, setKasbons] = useState<Kasbon[]>([]);
  const [loadingKasbon, setLoadingKasbon] = useState(true);
  const [kasbonStatusFilter, setKasbonStatusFilter] = useState("all");
  // Paginasi: 25 per halaman. Sebelumnya `limit: 200` dirender sekaligus
  // dan halaman ini jadi 9.083px — sembilan layar gulir untuk mencari satu
  // kasbon, dua kali lipat halaman terpanjang berikutnya di seluruh aplikasi.
  const [halaman, setHalaman] = useState(1);
  const [totalKasbon, setTotalKasbon] = useState(0);
  const [kasbonSubTab, setKasbonSubTab] = useState<"daftar" | "summary">("daftar");
  const [kasbonSummary, setKasbonSummary] = useState<KasbonSummaryData | null>(null);
  const [kasbonType, setKasbonType] = useState<"mandor" | "tukang">("mandor");
  const [workerKasbons, setWorkerKasbons] = useState<WorkerKasbon[]>([]);
  const [loadingWorkerKasbon, setLoadingWorkerKasbon] = useState(false);
  const [workerKasbonFilter, setWorkerKasbonFilter] = useState("all");
  const [showAddKasbon, setShowAddKasbon] = useState(false);
  const [approvingKasbonId, setApprovingKasbonId] = useState<string | null>(null);
  const [kasbonCashAccountId, setKasbonCashAccountId] = useState("");
  const [kasbonCashAccounts, setKasbonCashAccounts] = useState<CashAccount[]>([]);
  const [galat, setGalat] = useState<string | null>(null);

  // `useSyncExternalStore` — lihat catatan di /keuangan/invoice:
  // `hasPermission` membaca localStorage, jadi memanggilnya saat render
  // pertama membuat HTML server dan klien berbeda.
  const canEdit = useSyncExternalStore(
    () => () => {},
    () => hasPermission("finance:invoice:pay"),
    () => false,
  );

  const loadKasbons = useCallback(async (signal?: AbortSignal) => {
    setLoadingKasbon(true);
    try {
      const params: Record<string, string> = {
        limit: String(PER_HALAMAN),
        offset: String((halaman - 1) * PER_HALAMAN),
      };
      if (kasbonStatusFilter !== "all") params.status = kasbonStatusFilter;
      const [listRes, summaryRes] = await Promise.all([
        api.get<{ kasbons: Kasbon[]; total?: number }>("/api/v1/finance/kasbons", { params, signal }),
        api.get<KasbonSummaryData>("/api/v1/finance/kasbon-summary", { signal }),
      ]);
      setKasbons(listRes.data.kasbons);
      setTotalKasbon(listRes.data.total ?? listRes.data.kasbons.length);
      setKasbonSummary(summaryRes.data);
      setGalat(null);
    } catch (e: unknown) {
      if ((e as { name?: string })?.name === "CanceledError") return;
      // Daftar kosong dan daftar-gagal-dimuat terlihat sama. Di halaman
      // persetujuan uang, membedakannya penting: "tak ada yang menunggu"
      // adalah kabar baik yang salah kalau sebenarnya API-nya mati.
      setKasbons([]);
      setGalat("Gagal memuat daftar kasbon.");
    } finally {
      setLoadingKasbon(false);
    }
  }, [kasbonStatusFilter, halaman]);

  const loadWorkerKasbons = useCallback(async (signal?: AbortSignal) => {
    setLoadingWorkerKasbon(true);
    try {
      const params: Record<string, string> = {};
      if (workerKasbonFilter === "settled") params.is_settled = "true";
      if (workerKasbonFilter === "active") params.is_settled = "false";
      const res = await api.get<{ kasbons: WorkerKasbon[] }>(
        "/api/v1/mandor/worker-kasbons", { params, signal });
      setWorkerKasbons(res.data.kasbons);
    } catch (e: unknown) {
      if ((e as { name?: string })?.name === "CanceledError") return;
      setWorkerKasbons([]);
    } finally {
      setLoadingWorkerKasbon(false);
    }
  }, [workerKasbonFilter]);

  // `queueMicrotask` — lihat catatan yang sama di /keuangan/invoice: kedua
  // pemuat menyetel state di baris pertamanya, dan setState sinkron di dalam
  // effect memicu render kedua sebelum yang pertama selesai.
  useEffect(() => {
    const ac = makeAbortController();
    queueMicrotask(() => { void loadKasbons(ac.signal); });
    return () => ac.abort();
  }, [loadKasbons]);

  useEffect(() => {
    if (kasbonType !== "tukang") return;
    const ac = makeAbortController();
    queueMicrotask(() => { void loadWorkerKasbons(ac.signal); });
    return () => ac.abort();
  }, [kasbonType, loadWorkerKasbons]);

  async function handleKasbonAction(
    id: string, action: "approved" | "rejected", cashAccountId?: string,
  ) {
    try {
      await api.patch(`/api/v1/kasbons/${id}/status`, {
        status: action, cash_account_id: cashAccountId || undefined,
      });
      setApprovingKasbonId(null);
      loadKasbons();
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
      // Kegagalan menyetujui HARUS terlihat: kalau diam, orang mengira uang
      // sudah disetujui padahal belum, dan mandor menunggu tanpa kabar.
      setGalat(msg ?? "Gagal memproses kasbon. Coba lagi.");
    }
  }

  function openKasbonApprove(id: string) {
    setApprovingKasbonId(id);
    if (kasbonCashAccounts.length === 0) {
      api.get<{ accounts: CashAccount[] }>("/api/v1/cash/accounts")
        .then((r) => {
          setKasbonCashAccounts(r.data.accounts);
          const utama = r.data.accounts.find((a) => a.type === "main");
          if (utama) setKasbonCashAccountId(utama.id);
        })
        .catch(() => setGalat("Gagal memuat daftar akun kas."));
    }
  }

  return (
    // Padding disediakan `keuangan/layout.tsx` — lihat catatan di sana.
    // Menambahkannya lagi di sini membuat jaraknya ganda dan berbeda-beda
    // antar bagian (diukur: 74px / 37px / 1px sebelum diseragamkan).
    <div style={{
      width: "100%", maxWidth: "var(--w-page)", margin: "0 auto",
    }}>
      {galat && (
        <div role="alert" style={{
          padding: "12px 12px", borderRadius: 10, marginBottom: 14,
          background: C.redBg, border: `1px solid ${C.redBorder}`,
          color: C.onDangerBg, fontSize: 13,
          display: "flex", alignItems: "center", gap: 8,
        }}>
          <AlertTriangle size={14} aria-hidden="true" style={{ flexShrink: 0 }} />
          {galat}
          <button onClick={() => { setGalat(null); loadKasbons(); }} style={{
            marginLeft: "auto", padding: "2px 8px", borderRadius: 6,
            border: `1px solid ${C.redBorder}`, background: "transparent",
            color: C.onDangerBg, fontSize: 12, fontWeight: 600, cursor: "pointer",
          }}>Coba lagi</button>
        </div>
      )}
      <div style={{ padding: 24 }}>

        {/* Kasbon type switcher: Mandor vs Tukang */}
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
          <div style={{ display: "flex", borderRadius: 6, border: `1px solid ${C.border}`, overflow: "hidden" }}>
            {(["mandor", "tukang"] as const).map(kt => (
              <button
                key={kt}
                onClick={() => setKasbonType(kt)}
                style={{
                  padding: "6px 16px", border: "none", cursor: "pointer",
                  background: kasbonType === kt ? C.navy : "var(--surface)",
                  color: kasbonType === kt ? "var(--surface)" : C.mid,
                  fontSize: 13, fontWeight: kasbonType === kt ? 700 : 400,
                  transition: "all 0.15s",
                }}
              >
                {kt === "mandor" ? "Kasbon Mandor" : "Kasbon Tukang"}
              </button>
            ))}
          </div>
          <span style={{ fontSize: 11, color: C.muted, fontStyle: "italic" }}>
            {kasbonType === "mandor" ? "Advance operasional mandor (dari kas proyek)" : "Advance upah tukang (dipotong dari gaji)"}
          </span>
          <div style={{ flex: 1 }} />
          {canEdit && kasbonType === "mandor" && (
            <button onClick={() => setShowAddKasbon(true)}
              style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 12px", borderRadius: 6, border: "none", background: "var(--grad-aksen)", color: "var(--surface)", fontSize: 12, fontWeight: 600, cursor: "pointer" }}
              onMouseEnter={e => { e.currentTarget.style.background = "var(--aksen-pekat)"; }}
              onMouseLeave={e => { e.currentTarget.style.background = C.navy; }}>
              <Plus size={13} /> Tambah Kasbon
            </button>
          )}
        </div>

        {/* ── Kasbon Mandor ── */}
        {kasbonType === "mandor" && (<>
        {/* Sub-tab bar */}
        <div style={{ display: "flex", alignItems: "center", gap: 0, marginBottom: 20, borderBottom: `1px solid ${C.border}` }}>
          {(["daftar", "summary"] as const).map(st => (
            <button key={st} onClick={() => setKasbonSubTab(st)} style={{
              padding: "8px 16px", border: "none", background: "transparent", cursor: "pointer",
              fontSize: 13, fontWeight: kasbonSubTab === st ? 600 : 400,
              color: kasbonSubTab === st ? C.navy : C.mid,
              borderBottom: `2px solid ${kasbonSubTab === st ? C.navy : "transparent"}`,
              marginBottom: -1, transition: "all 0.15s",
            }}>
              {st === "daftar" ? "Daftar Transaksi" : "Summary per Mandor"}
            </button>
          ))}
        </div>

        {/* Pending alert banner */}
        {kasbons.filter(k => k.status === "pending").length > 0 && (
          <div style={{ marginBottom: 16, padding: "12px 16px", borderRadius: 10, background: C.yellowBg, border: `1px solid ${C.yellowBorder}`, display: "flex", alignItems: "center", gap: 8 }}>
            <Clock size={15} color={C.yellow} style={{ flexShrink: 0 }} />
            <span style={{ fontSize: 13, fontWeight: 600, color: C.yellow, flex: 1 }}>
              {kasbons.filter(k => k.status === "pending").length} kasbon menunggu persetujuan Anda
              {" · "}{fmt(kasbons.filter(k => k.status === "pending").reduce((s, k) => s + Number(k.amount), 0))}
            </span>
            <button onClick={() => { setKasbonSubTab("daftar"); setKasbonStatusFilter("pending"); }}
              style={{ padding: "4px 12px", borderRadius: 6, border: `1px solid ${C.yellowBorder}`, background: "var(--surface)", color: C.yellow, fontSize: 12, fontWeight: 600, cursor: "pointer" }}>
              Review →
            </button>
          </div>
        )}

        {/* ── Sub-tab: Daftar ── */}
        {kasbonSubTab === "daftar" && (
          <>
            <div style={{ display: "flex", gap: 8, marginBottom: 14, flexWrap: "wrap", alignItems: "center" }}>
              <select aria-label="Saring status kasbon" value={kasbonStatusFilter} onChange={e => setKasbonStatusFilter(e.target.value)}
                style={{ padding: "6px 12px", border: `1px solid ${C.border}`, borderRadius: 6, fontSize: 13, color: C.text, background: "var(--surface)", outline: "none" }}>
                <option value="all">Semua Status</option>
                <option value="pending">Menunggu Persetujuan</option>
                <option value="approved">Disetujui</option>
                <option value="rejected">Ditolak</option>
                <option value="settled">Settled</option>
              </select>
              <button onClick={() => loadKasbons()} style={{ display: "flex", alignItems: "center", gap: 4, padding: "6px 12px", border: `1px solid ${C.border}`, borderRadius: 6, background: "var(--surface)", color: C.mid, fontSize: 12, cursor: "pointer" }}>
                <RefreshCw size={13} /> Refresh
              </button>
              {kasbons.length > 0 && (
                <span style={{ fontSize: 12, color: C.mid }}>
                  {kasbons.length} kasbon · Total <strong style={{ color: C.text }}>{fmt(kasbons.reduce((s, k) => s + Number(k.amount), 0))}</strong>
                </span>
              )}
            </div>

            {loadingKasbon ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {[1,2,3].map(i => <div key={i} style={{ padding: 16, borderRadius: 10, border: `1px solid ${C.border}` }}><Skeleton h={14} /></div>)}
              </div>
            ) : kasbons.length === 0 ? (
              <Kosong
                ikon={<Banknote size={36} aria-hidden="true" />}
                judul="Belum ada kasbon tercatat"
                sebab="Kasbon diajukan mandor dari portal lapangan, lalu disetujui di sini. Yang sudah disetujui memotong saldo kas sumbernya."
              />
            ) : (
              <>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {kasbons.map(k => {
                  const ma = k.work_scopes?.mandor_assignments?.[0];
                  const project = ma?.projects;
                  const mandor = ma?.mandor;
                  return (
                    <div key={k.id} style={{
                      padding: "12px 16px", borderRadius: 10,
                      border: `1px solid ${k.status === "pending" ? C.yellowBorder : C.border}`,
                      background: k.status === "pending" ? C.yellowBg : "var(--surface-subtle)",
                    }}>
                      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6, flexWrap: "wrap" }}>
                            <StatusBadge status={k.status} map={KASBON_STATUS} />
                            <span style={{ fontSize: 11, color: C.muted, background: "var(--surface-hover)", padding: "2px 8px", borderRadius: 6 }}>
                              {FUND_SOURCE_LABEL[k.fund_source] ?? k.fund_source}
                            </span>
                            <span style={{ fontSize: 11, fontWeight: 600, color: C.navy, background: C.navyLight, padding: "2px 8px", borderRadius: 6 }}>
                              {PURPOSE_LABEL[k.purpose] ?? k.purpose}
                            </span>
                          </div>
                          <div style={{ fontSize: 13, fontWeight: 600, color: C.text, marginBottom: 2 }}>
                            {mandor?.name ?? k.requester?.name ?? "—"}
                            {project && <span style={{ fontSize: 12, color: C.mid, fontWeight: 400 }}> · {project.name}</span>}
                          </div>
                          {k.work_scopes && (
                            <div style={{ fontSize: 11, color: C.muted, marginBottom: 3 }}>Scope: {k.work_scopes.scope_name}</div>
                          )}
                          <div style={{ fontSize: 11, color: C.muted, display: "flex", gap: 12 }}>
                            <span>{fmtDate(k.kasbon_date)}</span>
                            {k.requester && <span>oleh {k.requester.name}</span>}
                            {k.approver && k.status === "approved" && <span style={{ color: C.green }}>✓ disetujui {k.approver.name}</span>}
                          </div>
                          {k.cash_account && k.status === "approved" && (
                            <div style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 11, marginTop: 4, padding: "2px 8px", borderRadius: 6, background: C.navyLight, color: C.navy, fontWeight: 600 }}>
                              <Wallet size={10} /> {k.cash_account.name}
                            </div>
                          )}
                          {k.notes && <div style={{ fontSize: 12, color: C.mid, marginTop: 4, fontStyle: "italic" }}>“{k.notes}”</div>}
                        </div>
                        <div style={{ textAlign: "right", flexShrink: 0 }}>
                          <div style={{ fontSize: 17, fontWeight: 800, color: k.status === "pending" ? C.yellow : C.text, fontFamily: "var(--font-display)", marginBottom: 8 }}>
                            {fmt(Number(k.amount))}
                          </div>
                          {canEdit && k.status === "pending" && approvingKasbonId !== k.id && (
                            <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
                              <button onClick={() => handleKasbonAction(k.id, "rejected")}
                                style={{ padding: "4px 12px", borderRadius: 6, border: `1px solid ${C.redBorder}`, background: C.redBg, color: C.red, fontSize: 11, fontWeight: 600, cursor: "pointer" }}>
                                Tolak
                              </button>
                              <button onClick={() => openKasbonApprove(k.id)}
                                style={{ padding: "4px 12px", borderRadius: 6, border: "none", background: C.green, color: "var(--surface)", fontSize: 11, fontWeight: 600, cursor: "pointer" }}>
                                ✓ Setujui
                              </button>
                            </div>
                          )}
                          {canEdit && k.status === "pending" && approvingKasbonId === k.id && (
                            <div style={{ marginTop: 8, padding: "8px 12px", borderRadius: 10, background: C.greenBg, border: `1px solid ${C.greenBorder}`, textAlign: "left", minWidth: 230 }}>
                              <div style={{ fontSize: 11, fontWeight: 600, color: C.green, marginBottom: 6 }}>Potong dari kas:</div>
                              <select aria-label="Sumber kas pembayaran kasbon" value={kasbonCashAccountId} onChange={e => setKasbonCashAccountId(e.target.value)}
                                style={{ width: "100%", padding: "6px 8px", border: `1px solid ${C.border}`, borderRadius: 6, fontSize: 12, background: "var(--surface)", outline: "none", marginBottom: 8, boxSizing: "border-box" }}>
                                <option value="">— Tanpa potong kas —</option>
                                {kasbonCashAccounts.map(a => (
                                  <option key={a.id} value={a.id}>{a.name} · {fmtCompact(Number(a.balance))}</option>
                                ))}
                              </select>
                              <div style={{ display: "flex", gap: 6 }}>
                                <button onClick={() => setApprovingKasbonId(null)}
                                  style={{ flex: 1, padding: "6px", borderRadius: 6, border: `1px solid ${C.border}`, background: "var(--surface)", fontSize: 11, cursor: "pointer" }}>Batal</button>
                                <button onClick={() => { handleKasbonAction(k.id, "approved", kasbonCashAccountId || undefined); setApprovingKasbonId(null); }}
                                  style={{ flex: 2, padding: "6px", borderRadius: 6, border: "none", background: C.green, color: "var(--surface)", fontSize: 11, fontWeight: 600, cursor: "pointer" }}>Konfirmasi Setuju</button>
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
              <Paginasi
                halaman={halaman}
                totalHalaman={Math.max(1, Math.ceil(totalKasbon / PER_HALAMAN))}
                totalEntri={totalKasbon}
                satuan="kasbon"
                onPindah={setHalaman}
              />
              </>
            )}
          </>
        )}

        {/* ── Sub-tab: Summary per Mandor ── */}
        {kasbonSubTab === "summary" && (
          <div>
            {loadingKasbon ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                {[1,2,3].map(i => <div key={i} style={{ height: 100, borderRadius: 10, border: `1px solid ${C.border}` }}><Skeleton h={100} /></div>)}
              </div>
            ) : !kasbonSummary || kasbonSummary.summary.length === 0 ? (
              <Kosong
                ikon={<PieChart size={36} aria-hidden="true" />}
                judul="Belum ada data untuk diringkas"
                sebab="Ringkasan ini mengelompokkan kasbon yang sudah disetujui menurut tujuannya. Kasbon yang masih menunggu persetujuan belum dihitung."
              />
            ) : (
              <>
                {/* Grand total per kategori */}
                <div style={{ marginBottom: 20, padding: "16px 16px", borderRadius: 10, border: `1px solid ${C.border}`, background: "var(--surface)" }}>
                  <h3 style={{ fontSize: 12, fontWeight: 700, color: C.muted, textTransform: "uppercase", letterSpacing: "0.06em", margin: "0 0 12px", display: "flex", alignItems: "center", gap: 6 }}>
                    <PieChart size={13} color={C.navy} /> Total Kasbon per Kategori (Semua Mandor)
                  </h3>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    {Object.entries(kasbonSummary.grandByPurpose).sort((a,b) => b[1]-a[1]).map(([purpose, total]) => {
                      const purposeColors: Record<string, string> = {
                        gaji_tukang: C.navy, uang_makan: C.green,
                        pembelian_alat: C.yellow, operasional: "var(--aksen)", lain_lain: C.mid,
                      };
                      const col = purposeColors[purpose] ?? C.mid;
                      return (
                        <div key={purpose} style={{ flex: "1 1 140px", padding: "8px 12px", borderRadius: 10, border: `1px solid ${C.border}`, background: "var(--surface-subtle)" }}>
                          <div style={{ fontSize: 10, fontWeight: 700, color: col, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 4 }}>
                            {PURPOSE_LABEL[purpose] ?? purpose}
                          </div>
                          <div style={{ fontSize: 15, fontWeight: 800, color: C.text, fontFamily: "var(--font-display)" }}>
                            {fmtCompact(total)}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Per mandor */}
                <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                  {kasbonSummary.summary.map(m => {
                    const pct = m.totalApproved / (m.total || 1) * 100;
                    return (
                      <div key={m.mandorId} style={{ padding: "16px 16px", borderRadius: 10, border: `1px solid ${C.border}`, background: "var(--surface)" }}>
                        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, marginBottom: 12 }}>
                          <div style={{ flex: 1 }}>
                            <div style={{ fontSize: 13, fontWeight: 700, color: C.text, marginBottom: 2 }}>{m.mandorName}</div>
                            <div style={{ fontSize: 11, color: C.muted }}>
                              {m.kasbonCount} kasbon · {m.projectCount} proyek
                            </div>
                            {/* Progress bar: approved vs total */}
                            <div style={{ marginTop: 8, display: "flex", alignItems: "center", gap: 8 }}>
                              <div style={{ flex: 1, height: 5, borderRadius: 6, background: C.border, overflow: "hidden" }}>
                                <div style={{ height: "100%", borderRadius: 6, background: C.green, width: `${pct}%` }} />
                              </div>
                              <span style={{ fontSize: 10, color: C.mid, flexShrink: 0 }}>{Math.round(pct)}% approved</span>
                            </div>
                          </div>
                          <div style={{ textAlign: "right" }}>
                            <div style={{ fontSize: "var(--teks-kpi)", fontWeight: 800, color: C.text, fontFamily: "var(--font-display)" }}>{fmtCompact(m.total)}</div>
                            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 4 }}>
                              {m.totalPending > 0 && <span style={{ fontSize: 10, color: C.yellow, fontWeight: 600, background: C.yellowBg, padding: "2px 6px", borderRadius: 6 }}>pending {fmtCompact(m.totalPending)}</span>}
                              {m.totalApproved > 0 && <span style={{ fontSize: 10, color: C.green, fontWeight: 600, background: C.greenBg, padding: "2px 6px", borderRadius: 6 }}>approved {fmtCompact(m.totalApproved)}</span>}
                            </div>
                          </div>
                        </div>

                        {/* Breakdown per kategori */}
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
                          {Object.entries(m.byPurpose).sort((a,b) => b[1]-a[1]).map(([purpose, total]) => {
                            const purposeColors: Record<string, string> = {
                              gaji_tukang: C.navy, uang_makan: C.green,
                              pembelian_alat: C.yellow, operasional: "var(--aksen)", lain_lain: C.mid,
                            };
                            const col = purposeColors[purpose] ?? C.mid;
                            const pctOfTotal = total / (m.total || 1) * 100;
                            return (
                              <div key={purpose} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 8px", borderRadius: 6, background: "var(--surface-subtle)" }}>
                                <span style={{ width: 8, height: 8, borderRadius: "50%", background: col, flexShrink: 0 }} />
                                <div style={{ flex: 1, minWidth: 0 }}>
                                  <div style={{ fontSize: 11, color: C.text, fontWeight: 600 }}>{PURPOSE_LABEL[purpose] ?? purpose}</div>
                                  <div style={{ height: 3, borderRadius: 0, background: C.border, marginTop: 3, overflow: "hidden" }}>
                                    <div style={{ height: "100%", borderRadius: 0, background: col, width: `${pctOfTotal}%` }} />
                                  </div>
                                </div>
                                <span style={{ fontSize: 12, fontWeight: 700, color: col, flexShrink: 0 }}>{fmtCompact(total)}</span>
                              </div>
                            );
                          })}
                        </div>

                        {/* Breakdown per proyek (kalau > 1) */}
                        {m.byProject.length > 1 && (
                          <div style={{ marginTop: 10, paddingTop: 10, borderTop: `1px solid var(--surface-hover)` }}>
                            <div style={{ fontSize: 11, color: C.muted, marginBottom: 6 }}>Per Proyek:</div>
                            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                              {m.byProject.sort((a,b) => b.total-a.total).map(p => (
                                <span key={p.name} style={{ fontSize: 11, padding: "2px 8px", borderRadius: 6, background: C.navyLight, color: C.navy, fontWeight: 600 }}>
                                  {p.name} · {fmtCompact(p.total)}
                                </span>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </>
            )}
          </div>
        )}
        </>)}

        {/* ── Kasbon Tukang ── */}
        {kasbonType === "tukang" && (
          <>
            <div style={{ display: "flex", gap: 8, marginBottom: 16, alignItems: "center", flexWrap: "wrap" }}>
              <select aria-label="Saring kasbon tukang" value={workerKasbonFilter} onChange={e => setWorkerKasbonFilter(e.target.value)}
                style={{ padding: "6px 12px", border: `1px solid ${C.border}`, borderRadius: 6, fontSize: 13, color: C.text, background: "var(--surface)", outline: "none" }}>
                <option value="all">Semua</option>
                <option value="active">Belum Lunas</option>
                <option value="settled">Sudah Lunas</option>
              </select>
              <button onClick={() => loadWorkerKasbons()} style={{ display: "flex", alignItems: "center", gap: 4, padding: "6px 12px", border: `1px solid ${C.border}`, borderRadius: 6, background: "var(--surface)", color: C.mid, fontSize: 12, cursor: "pointer" }}>
                <RefreshCw size={13} /> Refresh
              </button>
              {workerKasbons.length > 0 && (
                <span style={{ fontSize: 12, color: C.mid }}>
                  {workerKasbons.length} kasbon tukang · Beredar <strong style={{ color: C.yellow }}>
                    {fmtCompact(workerKasbons.filter(k => !k.is_settled).reduce((s, k) => s + Number(k.amount) - Number(k.amount_settled ?? 0), 0))}
                  </strong>
                </span>
              )}
            </div>

            {/* Info banner */}
            <div style={{ marginBottom: 14, padding: "8px 12px", borderRadius: 6, background: C.yellowBg, border: `1px solid ${C.yellowBorder}`, fontSize: 12, color: C.yellow, fontWeight: 500 }}>
              Kasbon tukang adalah advance upah individual — dilunasi via potongan laporan upah berikutnya (bukan dari kas proyek).
            </div>

            {loadingWorkerKasbon ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {[1, 2, 3].map(i => <div key={i} style={{ padding: 16, borderRadius: 10, border: `1px solid ${C.border}` }}><Skeleton h={14} /></div>)}
              </div>
            ) : workerKasbons.length === 0 ? (
              <Kosong
                ikon={<Banknote size={36} aria-hidden="true" />}
                judul="Belum ada kasbon tukang"
                sebab="Berbeda dari kasbon mandor: ini uang muka yang diteruskan mandor ke tukangnya sendiri, dan dipotong dari upah saat pembayaran."
              />
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {workerKasbons.map(wk => {
                  const remaining = Number(wk.amount) - Number(wk.amount_settled ?? 0);
                  const pct = Number(wk.amount) > 0 ? (Number(wk.amount_settled ?? 0) / Number(wk.amount)) * 100 : 0;
                  return (
                    <div key={wk.id} style={{
                      padding: "12px 16px", borderRadius: 10,
                      border: `1px solid ${wk.is_settled ? C.border : C.yellowBorder}`,
                      background: wk.is_settled ? "var(--surface-subtle)" : C.yellowBg,
                    }}>
                      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6, flexWrap: "wrap" }}>
                            <span style={{
                              display: "inline-flex", alignItems: "center", gap: 4,
                              padding: "2px 8px", borderRadius: 99, fontSize: 11, fontWeight: 600,
                              color: wk.is_settled ? C.green : C.yellow,
                              background: wk.is_settled ? C.greenBg : C.yellowBg,
                              border: `1px solid ${wk.is_settled ? C.greenBorder : C.yellowBorder}`,
                            }}>
                              <span style={{ width: 5, height: 5, borderRadius: "50%", background: wk.is_settled ? C.green : C.yellow }} />
                              {wk.is_settled ? "Lunas" : "Beredar"}
                            </span>
                            <span style={{ fontSize: 11, background: "var(--surface-hover)", padding: "2px 8px", borderRadius: 6, color: C.mid }}>
                              {PURPOSE_LABEL[wk.purpose] ?? wk.purpose}
                            </span>
                          </div>
                          <div style={{ fontSize: 13, fontWeight: 600, color: C.text, marginBottom: 2 }}>
                            {wk.worker?.name ?? "—"}
                            {wk.mandor && <span style={{ fontSize: 12, color: C.mid, fontWeight: 400 }}> · Mandor {wk.mandor.name}</span>}
                          </div>
                          {wk.project && <div style={{ fontSize: 11, color: C.muted, marginBottom: 2 }}>{wk.project.name}{wk.scope && ` · ${wk.scope.scope_name}`}</div>}
                          <div style={{ fontSize: 11, color: C.muted }}>{fmtDate(wk.kasbon_date)}</div>
                          {!wk.is_settled && (
                            <div style={{ marginTop: 8 }}>
                              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 3 }}>
                                <span style={{ fontSize: 10, color: C.muted }}>Terlunasi {Math.round(pct)}%</span>
                                <span style={{ fontSize: 10, color: C.yellow }}>Sisa {fmtCompact(remaining)}</span>
                              </div>
                              <div style={{ height: 5, borderRadius: 99, background: C.border, overflow: "hidden" }}>
                                <div style={{ height: "100%", width: `${pct}%`, borderRadius: 99, background: C.green }} />
                              </div>
                            </div>
                          )}
                          {wk.notes && <div style={{ fontSize: 12, color: C.mid, marginTop: 4, fontStyle: "italic" }}>“{wk.notes}”</div>}
                        </div>
                        <div style={{ textAlign: "right", flexShrink: 0 }}>
                          <div style={{ fontSize: 17, fontWeight: 800, color: wk.is_settled ? C.text : C.yellow, fontFamily: "var(--font-display)" }}>
                            {fmt(Number(wk.amount))}
                          </div>
                          {Number(wk.amount_settled ?? 0) > 0 && !wk.is_settled && (
                            <div style={{ fontSize: 11, color: C.green, marginTop: 2 }}>
                              ↓ {fmtCompact(Number(wk.amount_settled))} dilunasi
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}

      </div>


      {showAddKasbon && (
        <AddKasbonModal
          onClose={() => setShowAddKasbon(false)}
          onSuccess={() => { setShowAddKasbon(false); loadKasbons(); }}
        />
      )}
    </div>
  );
}
