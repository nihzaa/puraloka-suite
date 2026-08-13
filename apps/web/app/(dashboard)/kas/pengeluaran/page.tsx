"use client";

/**
 * KAS — PENGELUARAN. Semua uang yang keluar lewat kas.
 *
 * Isinya dipindah dari tab ketiga `kas/page.tsx`, tidak ditulis ulang. Itu
 * disengaja: halaman ini menampilkan EMPAT aliran keluar dari empat endpoint
 * berbeda — pengeluaran proyek, bayar supplier, pembayaran progres mandor,
 * dan settlement borongan — dan menulisnya ulang "sambil merapikan" adalah
 * cara paling mudah menghilangkan satu aliran tanpa ada yang sadar. Total
 * pengeluaran yang kurang satu kategori tetap terlihat masuk akal.
 *
 * ── Saringan status kini ada di URL
 *
 * `/kas/pengeluaran?status=submitted` adalah alamat sungguhan yang ditautkan
 * dashboard, menggantikan `setTab(...) + setExpenseStatusFilter(...)` yang tak
 * meninggalkan jejak di alamat.
 */

import { Suspense, useCallback, useEffect, useState } from "react";
import { useTerpasang } from "@/lib/use-terpasang";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Building2, CheckCircle2, RefreshCw, ShoppingCart, TrendingDown,
} from "lucide-react";
import { api, makeAbortController } from "@/lib/api";
import { useIzin } from "@/lib/use-izin";
import { C } from "@/lib/warna-ui";
import { Kosong } from "@/components/ui-dasar";
import { ExpenseRow, RangkaBaris } from "../_bersama/komponen";
import {
  type Expense, type RingkasKategori,
  TYPE_COLOR, TYPE_LABEL, fmt, fmtCompact, fmtDate, pesanGalat,
} from "../_bersama/tipe";

const STATUS_SAH = ["submitted", "approved", "rejected", "draft"] as const;

export default function PengeluaranKasPage() {
  const mounted = useTerpasang();
  if (!mounted) return null;
  return (
    <Suspense fallback={<RangkaBaris />}>
      <PengeluaranIsi />
    </Suspense>
  );
}

function PengeluaranIsi() {
  const router = useRouter();
  const params = useSearchParams();

  // ADR-004: capability, bukan nama jabatan — diverifikasi ke `requirePermission`
  // pada `PATCH /api/v1/cash/expenses/:id/status`.
  const bolehApprove = useIzin("cash:expense:approve");

  const dariUrl = params.get("status") ?? "";
  const saring = (STATUS_SAH as readonly string[]).includes(dariUrl) ? dariUrl : "all";

  const [pengeluaran, setPengeluaran] = useState<Expense[]>([]);
  const [memuat, setMemuat] = useState(true);

  const [kategori, setKategori] = useState<RingkasKategori[]>([]);
  const [bukaKategori, setBukaKategori] = useState(false);

  const [bayarSupplier, setBayarSupplier] = useState<BarisSupplier[]>([]);
  const [memuatSupplier, setMemuatSupplier] = useState(true);

  const [bayarProgres, setBayarProgres] = useState<BarisProgres[]>([]);
  const [settlementBorongan, setSettlementBorongan] = useState<BarisSettlement[]>([]);
  const [memuatMandor, setMemuatMandor] = useState(true);

  const muat = useCallback(async (status: string, signal?: AbortSignal) => {
    setMemuat(true);
    try {
      const q: Record<string, string> = { limit: "100" };
      if (status !== "all") q.status = status;
      const r = await api.get<{ expenses: Expense[] }>("/api/v1/cash/expenses", { params: q, signal });
      setPengeluaran(r.data.expenses);
    } finally { setMemuat(false); }
  }, []);

  useEffect(() => {
    const ac = makeAbortController();
    // `queueMicrotask`: setState di baris pertama `muat()` jatuh di dalam
    // fase render effect. Menundanya satu microtask memindahkannya keluar
    // tanpa jeda yang terlihat — `ac.abort()` di cleanup tetap bekerja,
    // karena pembatalan terjadi belakangan.
    queueMicrotask(() => { void muat(saring, ac.signal).catch(() => {}); });
    return () => ac.abort();
  }, [saring, muat]);

  // Aliran keluar pendamping dimuat SEKALI — ketiganya tak bergantung saringan
  // status pengeluaran proyek. Memuat ulang tiap kali saringan berubah berarti
  // tiga panggilan sia-sia yang hasilnya persis sama.
  useEffect(() => {
    const ac = makeAbortController();

    api.get<{ supplier_payments?: BarisSupplier[] }>("/api/v1/procurement/supplier-payments", {
      params: { limit: "100" }, signal: ac.signal,
    })
      // Hanya yang punya `cash_account` — sisanya tidak memotong saldo kas,
      // jadi menampilkannya di halaman kas akan menggandakan angka keluar.
      .then(r => setBayarSupplier((r.data.supplier_payments ?? []).filter(p => p.cash_account)))
      .catch(() => setBayarSupplier([]))
      .finally(() => setMemuatSupplier(false));

    Promise.all([
      api.get<{ payments?: BarisProgres[] }>("/api/v1/mandor/progress-payments", {
        params: { status: "approved" }, signal: ac.signal,
      }).catch(() => ({ data: { payments: [] as BarisProgres[] } })),
      api.get<{ settlements?: BarisSettlement[] }>("/api/v1/mandor/borongan-settlements", {
        signal: ac.signal,
      }).catch(() => ({ data: { settlements: [] as BarisSettlement[] } })),
    ])
      .then(([pp, bs]) => {
        setBayarProgres((pp.data.payments ?? []).filter(p => p.cash_account_id));
        setSettlementBorongan((bs.data.settlements ?? []).filter(s => s.cash_account_id));
      })
      .catch(() => { /* non-fatal — dua bagian ini pelengkap */ })
      .finally(() => setMemuatMandor(false));

    api.get<{ summary: RingkasKategori[] }>("/api/v1/cash/expenses/summary-by-category", { signal: ac.signal })
      .then(r => setKategori(r.data.summary))
      .catch(() => setKategori([]));

    return () => ac.abort();
  }, []);

  function gantiSaring(nilai: string) {
    router.replace(nilai === "all" ? "/kas/pengeluaran" : `/kas/pengeluaran?status=${nilai}`);
  }

  async function setujui(id: string) {
    try {
      await api.patch(`/api/v1/cash/expenses/${id}/status`, { status: "approved" });
      setPengeluaran(prev => prev.map(e => e.id === id ? { ...e, status: "approved" } : e));
    } catch (err: unknown) {
      alert(pesanGalat(err, "Gagal approve"));
    }
  }

  async function tolak(id: string) {
    try {
      await api.patch(`/api/v1/cash/expenses/${id}/status`, { status: "rejected" });
      setPengeluaran(prev => prev.map(e => e.id === id ? { ...e, status: "rejected" } : e));
    } catch (err: unknown) {
      // Kembarannya (`setujui`) sudah memberi tahu sejak awal; yang menolak
      // justru diam. Inkonsistensi itu berarti PENOLAKAN yang gagal terlihat
      // berhasil — pengeluaran tetap menunggu persetujuan tanpa ada yang tahu.
      alert(pesanGalat(err, "Gagal menolak pengeluaran"));
    }
  }

  const totalDisetujui = pengeluaran
    .filter(e => e.status === "approved")
    .reduce((s, e) => s + e.total_amount, 0);

  return (
    // Token lebar diulang di tiap halaman bagian — `tata-letak-ratchet.mjs`
    // memeriksa `page.tsx` sendiri-sendiri, tanpa membaca layout induknya.
    <div style={{ width: "100%", maxWidth: "var(--w-page)", margin: "0 auto" }}>
      <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap", alignItems: "center" }}>
        <select aria-label="Saring status pengeluaran" value={saring} onChange={e => gantiSaring(e.target.value)}
          style={{ padding: "8px 12px", border: `1px solid ${C.border}`, borderRadius: 6, fontSize: 13, background: "var(--surface)", outline: "none" }}>
          <option value="all">Semua Status</option>
          <option value="submitted">Menunggu Review</option>
          <option value="approved">Disetujui</option>
          <option value="rejected">Ditolak</option>
          <option value="draft">Draft</option>
        </select>
        <button onClick={() => void muat(saring)} style={{
          display: "flex", alignItems: "center", gap: 4, padding: "8px 12px",
          border: `1px solid ${C.border}`, borderRadius: 6, background: "var(--surface)",
          color: C.mid, fontSize: 12, cursor: "pointer",
        }}>
          <RefreshCw size={13} aria-hidden="true" /> Refresh
        </button>
        {pengeluaran.length > 0 && (
          <span style={{ marginLeft: "auto", fontSize: 12, color: C.mid }}>
            Total disetujui: <strong style={{ color: C.text }}>{fmtCompact(totalDisetujui)}</strong>
          </span>
        )}
      </div>

      {kategori.length > 0 && (
        <div style={{ marginBottom: 20, borderRadius: 10, border: `1px solid ${C.border}`, background: "var(--surface-subtle)", overflow: "hidden" }}>
          <button
            onClick={() => setBukaKategori(p => !p)}
            aria-expanded={bukaKategori}
            style={{
              width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between",
              padding: "12px 16px", background: "transparent", border: "none", cursor: "pointer",
              borderBottom: bukaKategori ? `1px solid ${C.border}` : "none",
            }}
          >
            <span style={{ fontSize: 12, fontWeight: 700, color: C.text, display: "flex", alignItems: "center", gap: 6 }}>
              <ShoppingCart size={13} color={C.navy} aria-hidden="true" /> Ringkasan per Kategori
              <span style={{ fontWeight: 400, color: C.muted }}>
                ({kategori.length} kategori · Total {fmtCompact(kategori.reduce((s, c) => s + c.total, 0))})
              </span>
            </span>
            <span aria-hidden="true" style={{
              fontSize: 11, color: C.muted, display: "inline-block",
              transform: bukaKategori ? "rotate(90deg)" : "rotate(0)", transition: "transform 0.15s",
            }}>▶</span>
          </button>
          {bukaKategori && (
            <div style={{ padding: "12px 16px" }}>
              {(() => {
                const total = kategori.reduce((s, c) => s + c.total, 0);
                return kategori.map(cat => {
                  const pct = total > 0 ? Math.round((cat.total / total) * 100) : 0;
                  const warna = TYPE_COLOR[cat.type] ?? C.muted;
                  return (
                    <div key={cat.id} style={{ marginBottom: 10 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 3 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                          <span style={{ fontSize: 11, color: warna, fontWeight: 600, padding: "0px 6px", borderRadius: 6, background: "var(--surface-hover)" }}>
                            {TYPE_LABEL[cat.type] ?? cat.type}
                          </span>
                          <span style={{ fontSize: 12, color: C.text }}>{cat.name}</span>
                          <span style={{ fontSize: 11, color: C.muted }}>({cat.count}×)</span>
                        </div>
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <span style={{ fontSize: 11, color: C.muted }}>{pct}%</span>
                          <span style={{ fontSize: 13, fontWeight: 700, color: warna, fontVariantNumeric: "tabular-nums" }}>
                            {fmtCompact(cat.total)}
                          </span>
                        </div>
                      </div>
                      <div style={{ height: 6, borderRadius: 99, background: "var(--border)", overflow: "hidden" }}>
                        <div style={{ height: "100%", width: `${pct}%`, borderRadius: 99, background: warna, transition: "width 0.4s" }} />
                      </div>
                    </div>
                  );
                });
              })()}
            </div>
          )}
        </div>
      )}

      {memuat ? (
        <RangkaBaris />
      ) : pengeluaran.length === 0 ? (
        <Kosong
          ikon={<ShoppingCart size={40} aria-hidden="true" />}
          judul={saring === "all" ? "Belum ada pengeluaran dicatat" : "Tidak ada pengeluaran dengan status itu"}
          sebab={saring === "all"
            ? "Pengeluaran yang dicatat di sini mengurangi saldo akun kas sumbernya. Belanja lewat kasbon mandor tercatat terpisah, di menu Kasbon."
            : "Saringan status sedang aktif. Pilih \"Semua Status\" untuk melihat seluruh pengeluaran yang pernah dicatat."}
        />
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {pengeluaran.map(e => (
            <ExpenseRow key={e.id} e={e} canReview={bolehApprove} onApprove={setujui} onReject={tolak} />
          ))}
        </div>
      )}

      {/* ── Bayar Supplier — pembayaran hutang supplier yang memotong kas ── */}
      {(bayarSupplier.length > 0 || memuatSupplier) && (
        <section style={{ marginTop: 28 }}>
          <JudulAliran>Bayar Supplier (dari kas)</JudulAliran>
          {memuatSupplier ? <RangkaBaris jumlah={2} tinggi={16} /> : (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {bayarSupplier.map(sp => (
                <div key={sp.id} style={{ padding: "12px 16px", borderRadius: 10, border: `1px solid ${C.border}`, background: "var(--surface-subtle)" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                    <IkonAliran latar={C.blueBg}><Building2 size={16} color={C.blue} /></IkonAliran>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: C.text, marginBottom: 2 }}>
                        Bayar Supplier · {sp.supplier?.name ?? "—"}
                      </div>
                      <div style={{ display: "flex", gap: 8, fontSize: 11, color: C.muted, flexWrap: "wrap" }}>
                        <span style={{ background: C.navyLight, color: C.navy, padding: "0px 6px", borderRadius: 6 }}>
                          dari: {sp.cash_account?.name}
                        </span>
                        <span>{fmtDate(sp.payment_date)}</span>
                        <span>· {sp.payment_method === "transfer" ? "Transfer Bank" : sp.payment_method === "cash" ? "Tunai" : "Cek/Giro"}</span>
                        {sp.reference_number && <span>· ref: {sp.reference_number}</span>}
                        {sp.creator && <span>· {sp.creator.name}</span>}
                      </div>
                    </div>
                    <NominalKeluar>{fmt(sp.amount)}</NominalKeluar>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      {/* ── Pembayaran progres mandor yang sudah approved & memotong kas ── */}
      {(bayarProgres.length > 0 || memuatMandor) && (
        <section style={{ marginTop: 28 }}>
          <JudulAliran>Pembayaran Progress Mandor (dari kas)</JudulAliran>
          {memuatMandor ? <RangkaBaris jumlah={2} tinggi={16} /> : (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {bayarProgres.map(pp => (
                <div key={pp.id} style={{ padding: "12px 16px", borderRadius: 10, border: `1px solid ${C.greenBorder}`, background: C.greenBg }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                    <IkonAliran latar="var(--success-bg)"><TrendingDown size={16} color={C.green} /></IkonAliran>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: C.text, marginBottom: 2 }}>
                        Bayar Progress {pp.pct_completed ?? pp.pct_done ?? 0}% · {pp.scope?.scope_name ?? "—"}
                      </div>
                      <div style={{ display: "flex", gap: 8, fontSize: 11, color: C.muted, flexWrap: "wrap" }}>
                        {pp.scope?.assignment?.mandor && <span>mandor: {pp.scope.assignment.mandor.name}</span>}
                        {pp.requester && <span>· diminta: {pp.requester.name}</span>}
                        <span>· {fmtDate(pp.paid_at ?? pp.created_at)}</span>
                      </div>
                    </div>
                    <NominalKeluar>{fmt(pp.gross_payment ?? 0)}</NominalKeluar>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      {/* ── Settlement borongan — pembayaran final yang memotong kas ── */}
      {(settlementBorongan.length > 0 || memuatMandor) && (
        <section style={{ marginTop: 28 }}>
          <JudulAliran>Settlement Borongan (dari kas)</JudulAliran>
          {memuatMandor ? <RangkaBaris jumlah={2} tinggi={16} /> : (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {settlementBorongan.map(bs => (
                <div key={bs.id} style={{ padding: "12px 16px", borderRadius: 10, border: `1px solid ${C.purpleBorder}`, background: C.purpleBg }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                    <IkonAliran latar="var(--navy-light)"><CheckCircle2 size={16} color={C.purple} /></IkonAliran>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: C.text, marginBottom: 2 }}>
                        Settlement Borongan · {bs.scope?.scope_name ?? "—"}
                      </div>
                      <div style={{ display: "flex", gap: 8, fontSize: 11, color: C.muted, flexWrap: "wrap" }}>
                        {bs.scope?.assignment?.mandor && <span>mandor: {bs.scope.assignment.mandor.name}</span>}
                        <span>· {fmtDate(bs.settled_at ?? bs.created_at)}</span>
                        <span style={{ background: "var(--navy-light)", color: C.purple, padding: "0px 6px", borderRadius: 6, border: `1px solid ${C.purpleBorder}` }}>
                          Borongan {fmtCompact(bs.borongan_value ?? 0)} · Kasbon {fmtCompact(bs.total_kasbon ?? 0)}
                        </span>
                      </div>
                    </div>
                    <NominalKeluar>{fmt(bs.net_payment ?? 0)}</NominalKeluar>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      )}
    </div>
  );
}

// ─── Bentuk baris aliran pendamping ───────────────────────────────────────────
//
// Diketik minimal — hanya medan yang benar-benar dibaca layar ini. Versi tab
// memakai `any[]`, yang berarti salah ketik nama medan (`pct_done` vs
// `pct_completed`) menghasilkan `undefined` yang tampil sebagai "0%" tanpa satu
// pun peringatan dari TypeScript.

interface BarisSupplier {
  id: string; amount: number; payment_date: string; payment_method: string;
  reference_number: string | null;
  supplier: { name: string } | null;
  cash_account: { id: string; name: string } | null;
  creator: { name: string } | null;
}

interface BarisProgres {
  id: string; gross_payment: number | null;
  pct_completed?: number | null; pct_done?: number | null;
  paid_at: string | null; created_at: string;
  cash_account_id: string | null;
  requester: { name: string } | null;
  scope: { scope_name: string | null; assignment?: { mandor?: { name: string } | null } | null } | null;
}

interface BarisSettlement {
  id: string; net_payment: number | null;
  borongan_value: number | null; total_kasbon: number | null;
  settled_at: string | null; created_at: string;
  cash_account_id: string | null;
  scope: { scope_name: string | null; assignment?: { mandor?: { name: string } | null } | null } | null;
}

function JudulAliran({ children }: { children: React.ReactNode }) {
  return (
    <h2 style={{
      fontSize: 11, fontWeight: 700, textTransform: "uppercase",
      letterSpacing: "0.1em", color: C.muted, margin: "0 0 10px",
    }}>{children}</h2>
  );
}

function IkonAliran({ latar, children }: { latar: string; children: React.ReactNode }) {
  return (
    <div aria-hidden="true" style={{
      width: 36, height: 36, borderRadius: 10, background: latar,
      display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
    }}>{children}</div>
  );
}

/** Nominal yang MENGURANGI kas — selalu didahului tanda minus. */
function NominalKeluar({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      fontSize: 15, fontWeight: 800, color: C.red,
      fontFamily: "var(--font-display)", flexShrink: 0,
    }}>-{children}</div>
  );
}
