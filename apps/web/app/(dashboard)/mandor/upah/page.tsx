"use client";

/**
 * LAPORAN UPAH — daftar laporan upah mingguan + persetujuan pembayaran.
 *
 * Dulu tab `laporan` di `mandor/page.tsx` (baris 735–880). Dipecah jadi rute
 * sendiri karena tautan ke daftar tersaring — `/mandor/upah?status=submitted`
 * — sekarang bisa dikirim ke rekan dan membuka yang sama.
 *
 * Perilakunya dipertahankan utuh: lima kriteria saringan yang tersambung ke
 * query URL, paginasi klien 15/halaman, ekspor Excel, persetujuan/penolakan
 * sebaris, dan peringatan pagar 500 dari server.
 */

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createPortal } from "react-dom";
import { api } from "@/lib/api";
import { useData } from "@/lib/data-cache";
import { Paginasi } from "@/components/paginasi";
import { useTutupEsc } from "@/lib/use-tutup-esc";
import * as XLSX from "xlsx";
import {
  Plus, RefreshCw, XCircle, FileText, Calendar, Search, X, Check, Download,
} from "lucide-react";
import { C } from "@/lib/warna-ui";
import { Pilihan } from "@/components/pilihan";
import {
  type WageReport, type WageReportDetail, type MandorUser,
  fmt, fmtDateShort, REPORT_STATUS, getWageStatusBadge, getPaymentSystemBadge,
  kartu as card,
} from "../_bersama/tipe";
import { CreateWageReportModal, WageReportDetailModal } from "../_bersama/komponen";
import { Kosong } from "@/components/ui-dasar";
import { kabari } from "@/components/tanya";

function LaporanUpahInner() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [search, setSearch] = useState("");
  /** Halaman daftar laporan (paginasi di klien — lihat catatan di dekat Paginasi). */
  const [halamanLaporan, setHalamanLaporan] = useState(1);

  // Filter state — tersambung dengan query param URL
  const [filterMandorId, setFilterMandorId] = useState(() => searchParams.get("mandor_id") ?? "");
  const [filterStatus, setFilterStatus] = useState(() => searchParams.get("status") ?? "");
  const [filterDateFrom, setFilterDateFrom] = useState(() => searchParams.get("date_from") ?? "");
  const [filterDateTo, setFilterDateTo] = useState(() => searchParams.get("date_to") ?? "");

  const [showCreateReport, setShowCreateReport] = useState(false);
  const [detailReport, setDetailReport] = useState<WageReportDetail | null>(null);

  // Persetujuan/penolakan sebaris
  const [inlineAction, setInlineAction] = useState<{
    report: WageReport;
    mode: "approve" | "reject";
  } | null>(null);
  const [inlinePaymentMethod, setInlinePaymentMethod] = useState<"cash" | "transfer_bank">("cash");
  const [inlineNotes, setInlineNotes] = useState("");
  const [inlineLoading, setInlineLoading] = useState(false);
  useTutupEsc(inlineAction ? () => setInlineAction(null) : null);

  /*
    ── PINDAH KE LAPIS CACHE BERSAMA (F4-2), 2026-08-16

    Dua `useData` menggantikan satu `Promise.all` + `useState` ganda.
    `totalReports` (jumlah SESUNGGUHNYA di server, penanda pagar 500) tetap
    diturunkan dari jawaban yang sama — bukan state terpisah yang bisa basi.
  */
  const { data: dataRpt, memuat: memuatRpt, muatUlang: muatUlangRpt } =
    useData<{ reports: WageReport[]; total: number }>("/api/v1/mandor/wage-reports");
  const { data: dataMandor, memuat: memuatMandor, muatUlang: muatUlangMandor } =
    useData<{ mandors: MandorUser[] }>("/api/v1/mandor/list");

  const loading = memuatRpt || memuatMandor;
  const load = async () => { await Promise.all([muatUlangRpt(), muatUlangMandor()]); };
  const reports = dataRpt?.reports ?? [];
  const totalReports = dataRpt?.total ?? reports.length;
  const mandorList = dataMandor?.mandors ?? [];

  function updateFilter(key: string, value: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (value) params.set(key, value); else params.delete(key);
    router.replace(`?${params.toString()}`, { scroll: false });
  }

  function resetFilters() {
    setFilterMandorId(""); setFilterStatus(""); setFilterDateFrom(""); setFilterDateTo("");
    router.replace("?", { scroll: false });
  }

  async function doInlineApprove() {
    if (!inlineAction) return;
    setInlineLoading(true);
    try {
      const today = new Date().toISOString().split("T")[0];
      await api.patch(`/api/v1/mandor/wage-reports/${inlineAction.report.id}/status`, {
        status: "approved",
        payment_method: inlinePaymentMethod,
        paid_at: today,
        review_notes: inlineNotes || undefined,
      });
      setInlineAction(null); setInlineNotes("");
      load();
    } catch { /* silent */ } finally { setInlineLoading(false); }
  }

  async function doInlineReject() {
    if (!inlineAction || !inlineNotes.trim()) return;
    setInlineLoading(true);
    try {
      await api.patch(`/api/v1/mandor/wage-reports/${inlineAction.report.id}/status`, {
        status: "rejected",
        review_notes: inlineNotes,
      });
      setInlineAction(null); setInlineNotes("");
      load();
    } catch { /* silent */ } finally { setInlineLoading(false); }
  }

  async function openDetail(id: string) {
    try {
      const r = await api.get<WageReportDetail>(`/api/v1/mandor/wage-reports/${id}`);
      setDetailReport(r.data);
    } catch { /* silent */ }
  }

  async function handleApprove(id: string, status: "approved" | "rejected" | "paid", notes?: string, cashAccountId?: string, paidAt?: string, paymentMethod?: string) {
    try {
      await api.patch(`/api/v1/mandor/wage-reports/${id}/status`, {
        status,
        review_notes: notes,
        cash_account_id: cashAccountId ?? undefined,
        paid_at: paidAt ?? undefined,
        payment_method: paymentMethod ?? undefined,
      });
      load();
      if (detailReport?.report?.id === id) {
        openDetail(id);
      }
    } catch (err: unknown) {
      // Menyetujui laporan upah adalah persetujuan PEMBAYARAN. Kegagalan
      // senyap di sini berarti orang mengira upah sudah disetujui sementara
      // mandor tak pernah menerima apa pun — dan tak ada yang menghubungkan
      // keduanya sampai ada yang bertanya.
      void kabari("Tidak berhasil", (err as { response?: { data?: { error?: string } } })?.response?.data?.error ?? "Gagal menyetujui laporan upah");
    }
  }

  const filteredReports = reports.filter(r => {
    if (search && !(
      r.assignment?.mandor?.name?.toLowerCase().includes(search.toLowerCase()) ||
      r.assignment?.project?.name?.toLowerCase().includes(search.toLowerCase()) ||
      r.scope?.scope_name?.toLowerCase().includes(search.toLowerCase())
    )) return false;
    if (filterMandorId && r.assignment?.mandor?.id !== filterMandorId) return false;
    if (filterStatus && r.status !== filterStatus) return false;
    if (filterDateFrom && r.week_start < filterDateFrom) return false;
    if (filterDateTo && r.week_start > filterDateTo) return false;
    return true;
  });

  /**
   * Paginasi daftar laporan — di KLIEN, bukan di server.
   *
   * Halaman ini menyaring dengan 5 kriteria (pencarian, mandor, status, dua
   * tanggal) dan mengekspor ke Excel, keduanya di sisi klien. Paginasi server
   * membuat filter hanya melihat halaman aktif dan ekspor menyimpan sebagian
   * data sambil tampak lengkap — salah tanpa satu pun gejala.
   */
  const PER_HALAMAN = 15;
  const totalHalamanLaporan = Math.max(1, Math.ceil(filteredReports.length / PER_HALAMAN));
  // Filter yang menyusutkan hasil bisa meninggalkan pemakai di halaman yang
  // tak ada lagi. Dijepit saat render, bukan lewat efek — efek merender sekali
  // dengan daftar kosong dulu, dan itu terbaca sebagai "tidak ada data".
  const halamanAman = Math.min(halamanLaporan, totalHalamanLaporan);
  const laporanHalamanIni = filteredReports.slice(
    (halamanAman - 1) * PER_HALAMAN,
    halamanAman * PER_HALAMAN,
  );

  function exportExcel() {
    const rows = filteredReports.flatMap(r => {
      const baseRow = {
        Mandor: r.assignment?.mandor?.name ?? "",
        Scope: r.scope?.scope_name ?? "",
        Proyek: r.assignment?.project?.name ?? "",
        "Periode Minggu": r.week_start ? `${r.week_start} s/d ${r.week_end}` : "",
        "Total Potongan": (r as any).deductions?.reduce((s: number, d: any) => s + Number(d.amount), 0) ?? 0,
        "Yang Dibayar": r.net_amount,
        Status: getWageStatusBadge(r.status).label,
        "Metode Bayar": r.payment_method ?? "",
        "Tanggal Bayar": r.paid_at ?? "",
      };
      const items = (r as any).items as Array<any> | undefined;
      if (items?.length) {
        return items.map(item => ({
          ...baseRow,
          "Nama Pekerja": item.worker_name,
          "Hari Kerja": item.days_worked,
          "Tarif/Hari": item.daily_rate,
          "Lembur (Rp)": item.overtime_amount ?? 0,
          Subtotal: item.subtotal,
        }));
      }
      return [{ ...baseRow, "Nama Pekerja": "", "Hari Kerja": "", "Tarif/Hari": "", "Lembur (Rp)": "", Subtotal: r.total_amount }];
    });
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Laporan Upah");
    XLSX.writeFile(wb, `laporan-upah-${new Date().toISOString().split("T")[0]}.xlsx`);
  }

  return (
    // Padding disediakan `mandor/layout.tsx` — lihat catatan di sana.
    // Menambahkannya lagi di sini membuat jaraknya ganda dan berbeda-beda
    // antar bagian, cacat yang sama yang sudah ditambal di modul Keuangan.
    <div style={{
      width: "100%", maxWidth: "var(--w-luas)", margin: "0 auto",
      display: "flex", flexDirection: "column", gap: 12,
    }}>
      {/* Aksi bagian + pencarian */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6, /* Padding DIHAPUS: layout bagian ini (kas/keuangan/mandor/layout.tsx)
         sudah memberi `20px 24px 24px` pada pembungkusnya. Menambahkan
         `--pad-x` di sini membuat jarak tepi terhitung DUA KALI —
         diukur 24+36=60px, sementara halaman lain 36px. */
      padding: 0, border: `1px solid ${C.border}`, borderRadius: 6, background: "var(--surface)" }}>
          <Search size={13} color={C.muted} />
          <input aria-label="Cari laporan upah" value={search} onChange={e => setSearch(e.target.value)} placeholder="Cari..." style={{ border: "none", outline: "none", fontSize: 13, width: 160, color: C.text, background: "transparent" }} />
        </div>
        <div style={{ flex: 1 }} />
        <button onClick={load} style={{ padding: "8px 12px", borderRadius: 6, border: `1px solid ${C.border}`, background: "var(--surface)", cursor: "pointer", display: "flex", alignItems: "center", gap: 6, fontSize: 13, color: C.mid }}>
          <RefreshCw size={14} /> Refresh
        </button>
        <button onClick={() => setShowCreateReport(true)} style={{ padding: "8px 12px", borderRadius: 6, border: "none", background: "var(--grad-aksen)", color: "var(--surface)", cursor: "pointer", display: "flex", alignItems: "center", gap: 6, fontSize: 13, fontWeight: 600 }}>
          <Plus size={14} /> Ajukan Upah
        </button>
      </div>

      {loading ? (
        <div style={{ textAlign: "center", padding: 60, color: C.muted }}>Memuat data...</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {/* Filter bar */}
          <div style={{ ...card, padding: "12px 16px", display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              <Pilihan aria-label="Mandor" value={filterMandorId} onChange={e => { setFilterMandorId(e.target.value); updateFilter("mandor_id", e.target.value); }}
                style={{ padding: "6px 8px", border: `1px solid ${C.border}`, borderRadius: 6, fontSize: 13, background: "var(--surface)", outline: "none", color: C.text, minWidth: 160 }}>
                <option value="">Semua Mandor</option>
                {mandorList.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
              </Pilihan>
              <Pilihan aria-label="Status" value={filterStatus} onChange={e => { setFilterStatus(e.target.value); updateFilter("status", e.target.value); }}
                style={{ padding: "6px 8px", border: `1px solid ${C.border}`, borderRadius: 6, fontSize: 13, background: "var(--surface)", outline: "none", color: C.text }}>
                <option value="">Semua Status</option>
                {Object.entries(REPORT_STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
              </Pilihan>
              <input aria-label="Tanggal mulai" type="date" value={filterDateFrom} onChange={e => { setFilterDateFrom(e.target.value); updateFilter("date_from", e.target.value); }}
                style={{ padding: "6px 8px", border: `1px solid ${C.border}`, borderRadius: 6, fontSize: 13, outline: "none", color: C.text }} />
              <span style={{ fontSize: 12, color: C.muted }}>s/d</span>
              <input aria-label="Tanggal akhir" type="date" value={filterDateTo} onChange={e => { setFilterDateTo(e.target.value); updateFilter("date_to", e.target.value); }}
                style={{ padding: "6px 8px", border: `1px solid ${C.border}`, borderRadius: 6, fontSize: 13, outline: "none", color: C.text }} />
              {(filterMandorId || filterStatus || filterDateFrom || filterDateTo) && (
                <button onClick={resetFilters} style={{ padding: "6px 12px", borderRadius: 6, border: `1px solid ${C.border}`, background: "var(--surface)", fontSize: 12, color: C.mid, cursor: "pointer", display: "flex", alignItems: "center", gap: 4 }}>
                  <X size={12} /> Reset
                </button>
              )}
              <span style={{ fontSize: 12, color: C.muted }}>{filteredReports.length} laporan</span>
              <button
                onClick={exportExcel}
                style={{ marginLeft: "auto", padding: "6px 12px", borderRadius: 6, border: `1px solid ${C.border}`, background: "var(--surface)", fontSize: 12, color: C.text, cursor: "pointer", display: "flex", alignItems: "center", gap: 4, fontWeight: 500 }}>
                <Download size={13} /> Export Excel
              </button>
          </div>
          {filteredReports.length === 0 ? (
            <Kosong
              ikon={<FileText size={20} />}
              judul="Belum ada laporan upah"
              sebab={'Klik "Ajukan Upah" untuk membuat laporan baru.'}
            />
          ) : laporanHalamanIni.map(r => {
            const st = getWageStatusBadge(r.status);
            const canApprove = r.status === "submitted";
            return (
              <div key={r.id} style={{
                ...card, padding: "12px 16px", transition: "box-shadow 0.15s",
                // Penanda tepi untuk baris yang MENUNGGU PUTUSAN SAYA.
                //
                // Warnanya BUKAN satu-satunya penanda — lencana "Diajukan"
                // dan tombol Setujui/Tolak sudah membedakannya untuk yang
                // tak bisa membedakan warna (WCAG 1.4.1).
                borderLeft: canApprove ? `3px solid ${C.yellow}` : undefined,
              }}>
                {/* `role="button"` + handler keyboard, BUKAN `<button>`:
                    isinya berisi beberapa blok bersarang yang tata letaknya
                    akan berubah kalau dibungkus tombol. Yang dibutuhkan
                    pemakai keyboard sama — bisa difokus (`tabIndex`),
                    diaktifkan (Enter/Spasi), dan dikenali pembaca layar. */}
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}
                  role="button"
                  tabIndex={0}
                  onClick={() => openDetail(r.id)}
                  onKeyDown={e => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault()   // Spasi jangan menggulir halaman
                      openDetail(r.id)
                    }
                  }}
                  onMouseEnter={e => (e.currentTarget.style.cursor = "pointer")}
                >
                  <div style={{ width: 40, height: 40, borderRadius: 10, background: st.bg, border: `1px solid ${st.border}`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                    <Calendar size={18} color={st.color} />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 3, flexWrap: "wrap" }}>
                      <span style={{ fontSize: 13, fontWeight: 600, color: C.text }}>
                        {r.assignment?.mandor?.name ?? "—"} · {r.scope?.scope_name ?? "—"}
                      </span>
                      <span style={{ fontSize: 11, fontWeight: 600, padding: "2px 8px", borderRadius: 10, background: st.bg, color: st.color, border: `1px solid ${st.border}` }}>{st.label}</span>
                      {(() => { const b = getPaymentSystemBadge(r.scope?.payment_system ?? ""); return (
                        <span style={{ fontSize: 11, padding: "2px 6px", borderRadius: 10, background: b.bg, color: b.color, border: `1px solid ${b.border}`, fontWeight: 600 }}>{b.label}</span>
                      ); })()}
                    </div>
                    <div style={{ fontSize: 12, color: C.muted }}>
                      {r.assignment?.project?.name ?? "—"} · Minggu {fmtDateShort(r.week_start)} – {fmtDateShort(r.week_end)}
                    </div>
                  </div>
                  <div style={{ textAlign: "right", flexShrink: 0 }}>
                    <div style={{ fontSize: 15, fontWeight: 700, color: C.navy }}>{fmt(r.net_amount)}</div>
                    <div style={{ fontSize: 11, color: C.muted }}>
                      {r.total_deduction > 0 && <span style={{ color: C.red }}>−{fmt(r.total_deduction)} potongan</span>}
                      {r.total_deduction === 0 && <span>Subtotal {fmt(r.subtotal)}</span>}
                    </div>
                  </div>
                </div>
                {/* Tombol setujui/tolak sebaris untuk laporan yang diajukan */}
                {canApprove && (
                  <div style={{ display: "flex", gap: 8, marginTop: 10, paddingTop: 10, borderTop: `1px solid ${C.border}` }}>
                    <button
                      onClick={e => { e.stopPropagation(); setInlineAction({ report: r, mode: "approve" }); setInlinePaymentMethod("cash"); setInlineNotes(""); }}
                      style={{ padding: "4px 12px", borderRadius: 6, border: `1px solid ${C.greenBorder}`, background: C.greenBg, color: C.green, cursor: "pointer", fontSize: 12, fontWeight: 600, display: "flex", alignItems: "center", gap: 4 }}>
                      <Check size={12} /> Setujui
                    </button>
                    <button
                      onClick={e => { e.stopPropagation(); setInlineAction({ report: r, mode: "reject" }); setInlineNotes(""); }}
                      style={{ padding: "4px 12px", borderRadius: 6, border: `1px solid ${C.redBorder}`, background: C.redBg, color: C.red, cursor: "pointer", fontSize: 12, fontWeight: 600, display: "flex", alignItems: "center", gap: 4 }}>
                      <XCircle size={12} /> Tolak
                    </button>
                  </div>
                )}
              </div>
            );
          })}

          <Paginasi
            halaman={halamanAman}
            totalHalaman={totalHalamanLaporan}
            totalEntri={filteredReports.length}
            satuan="laporan"
            onPindah={setHalamanLaporan}
          />

          {/* Pagar server (500) memotong — dinyatakan, bukan disembunyikan.
              Filter dan Export Excel bekerja atas data yang TERUNDUH; kalau
              sebagian tertinggal di server, keduanya menghasilkan jawaban
              yang tampak lengkap padahal tidak. */}
          {totalReports > reports.length && (
            <div role="status" style={{
              marginTop: 12, padding: "10px 14px", borderRadius: 8,
              border: `1px solid ${C.yellowBorder}`, background: C.yellowBg,
              fontSize: 12, color: C.text, lineHeight: 1.5,
            }}>
              Menampilkan <strong>{reports.length.toLocaleString("id-ID")}</strong> laporan
              terbaru dari <strong>{totalReports.toLocaleString("id-ID")}</strong>.
              Penyaringan dan Export Excel hanya mencakup yang termuat —
              persempit rentang tanggal untuk melihat sisanya.
            </div>
          )}
        </div>
      )}

      {/* Modal setujui/tolak sebaris */}
      {inlineAction && typeof document !== "undefined" && createPortal(
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", zIndex: 1100, display: "flex", alignItems: "center", justifyContent: "center", padding: "0 16px" }}>
          <div style={{ background: "var(--surface)", borderRadius: 14, width: "100%", maxWidth: 400, padding: 24, boxShadow: "var(--naik-3)" }}>
            {inlineAction.mode === "approve" ? (
              <>
                <h3 style={{ margin: "0 0 4px", fontSize: 15, fontWeight: 700, color: C.text }}>Setujui Laporan</h3>
                <p style={{ margin: "0 0 16px", fontSize: 12, color: C.muted }}>
                  {inlineAction.report.assignment?.mandor?.name} · {inlineAction.report.scope?.scope_name} · {fmt(inlineAction.report.net_amount)}
                </p>
                <div style={{ marginBottom: 14 }}>
                  <span id="metode-bayar-sebaris" style={{ display: "block", fontSize: 12, fontWeight: 600, color: C.mid, marginBottom: 8 }}>Metode Pembayaran</span>
                  <div role="group" aria-labelledby="metode-bayar-sebaris" style={{ display: "flex", gap: 8 }}>
                    {(["cash", "transfer_bank"] as const).map(m => (
                      <button key={m} type="button" onClick={() => setInlinePaymentMethod(m)}
                        style={{ flex: 1, padding: "8px 12px", borderRadius: 6, cursor: "pointer", fontSize: 13, fontWeight: inlinePaymentMethod === m ? 700 : 400, border: `2px solid ${inlinePaymentMethod === m ? C.green : C.border}`, background: inlinePaymentMethod === m ? C.greenBg : "var(--surface)", color: inlinePaymentMethod === m ? C.green : C.mid }}>
                        {m === "cash" ? "Cash" : "Transfer Bank"}
                      </button>
                    ))}
                  </div>
                </div>
                <div style={{ marginBottom: 16 }}>
                  <label htmlFor="catatan-setuju" style={{ display: "block", fontSize: 12, fontWeight: 600, color: C.mid, marginBottom: 6 }}>Catatan (opsional)</label>
                  <textarea id="catatan-setuju" value={inlineNotes} onChange={e => setInlineNotes(e.target.value)} rows={2} placeholder="Catatan pembayaran..."
                    style={{ width: "100%", padding: "8px 8px", border: `1px solid ${C.border}`, borderRadius: 6, fontSize: 13, outline: "none", resize: "none", boxSizing: "border-box" }} />
                </div>
                <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                  <button onClick={() => setInlineAction(null)} style={{ padding: "8px 16px", borderRadius: 6, border: `1px solid ${C.border}`, background: "var(--surface)", cursor: "pointer", fontSize: 13 }}>Batal</button>
                  <button onClick={doInlineApprove} disabled={inlineLoading}
                    style={{ padding: "8px 20px", borderRadius: 6, border: "none", background: C.green, color: "var(--surface)", cursor: inlineLoading ? "not-allowed" : "pointer", fontSize: 13, fontWeight: 600, opacity: inlineLoading ? 0.7 : 1 }}>
                    {inlineLoading ? "Memproses..." : "Bayar Sekarang"}
                  </button>
                </div>
              </>
            ) : (
              <>
                <h3 style={{ margin: "0 0 4px", fontSize: 15, fontWeight: 700, color: C.red }}>Tolak Laporan</h3>
                <p style={{ margin: "0 0 16px", fontSize: 12, color: C.muted }}>
                  {inlineAction.report.assignment?.mandor?.name} · {inlineAction.report.scope?.scope_name} · {fmt(inlineAction.report.net_amount)}
                </p>
                <div style={{ marginBottom: 16 }}>
                  <label htmlFor="alasan-tolak" style={{ display: "block", fontSize: 12, fontWeight: 600, color: C.mid, marginBottom: 6 }}>Alasan Penolakan <span style={{ color: C.red }}>*</span></label>
                  <textarea id="alasan-tolak" value={inlineNotes} onChange={e => setInlineNotes(e.target.value)} rows={3} placeholder="Jelaskan alasan penolakan..."
                    style={{ width: "100%", padding: "8px 8px", border: `1px solid ${inlineNotes.trim() ? C.border : C.redBorder}`, borderRadius: 6, fontSize: 13, outline: "none", resize: "none", boxSizing: "border-box" }} />
                  {!inlineNotes.trim() && <div style={{ fontSize: 11, color: C.red, marginTop: 4 }}>Alasan wajib diisi</div>}
                </div>
                <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                  <button onClick={() => setInlineAction(null)} style={{ padding: "8px 16px", borderRadius: 6, border: `1px solid ${C.border}`, background: "var(--surface)", cursor: "pointer", fontSize: 13 }}>Batal</button>
                  <button onClick={doInlineReject} disabled={inlineLoading || !inlineNotes.trim()}
                    style={{ padding: "8px 20px", borderRadius: 6, border: "none", background: C.red, color: "var(--surface)", cursor: (inlineLoading || !inlineNotes.trim()) ? "not-allowed" : "pointer", fontSize: 13, fontWeight: 600, opacity: (inlineLoading || !inlineNotes.trim()) ? 0.6 : 1 }}>
                    {inlineLoading ? "Memproses..." : "Tolak Laporan"}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>,
        document.body
      )}

      {showCreateReport && (
        <CreateWageReportModal
          onClose={() => setShowCreateReport(false)}
          onSuccess={() => { setShowCreateReport(false); load(); }}
        />
      )}
      {detailReport && (
        <WageReportDetailModal
          data={detailReport}
          onClose={() => setDetailReport(null)}
          onApprove={handleApprove}
        />
      )}
    </div>
  );
}

export default function LaporanUpahPage() {
  return (
    <Suspense fallback={<div style={{ padding: 48, textAlign: "center", color: "var(--text-secondary)" }}>Memuat...</div>}>
      <LaporanUpahInner />
    </Suspense>
  );
}
