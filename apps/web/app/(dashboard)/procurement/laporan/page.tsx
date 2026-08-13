"use client";

/**
 * PROCUREMENT — LAPORAN.
 *
 * Dipindahkan dari tab `laporan`. Dua laporan dipertahankan utuh beserta
 * saringan dan ekspor Excel-nya: rekap pembelian per periode, dan umur hutang
 * (aging) supplier.
 *
 * ── Kenapa sub-tab di sini TETAP tab, bukan dipecah lagi jadi dua rute
 *
 * Keduanya berbagi satu bilah aksi (Refresh + Export) dan satu keadaan muat,
 * dan orang berpindah antar keduanya untuk MEMBANDINGKAN — "belanja bulan ini
 * segini, hutangnya segitu". Memecahnya jadi dua rute menambah muat ulang
 * penuh pada perpindahan yang justru sering dilakukan bolak-balik. Aturan
 * ARAH-VISUAL §6 memang menyebut tab boleh bertahan untuk irisan dari
 * pertanyaan yang sama.
 *
 * DUA tabel HTML mentah diganti `<Tabel>`, termasuk baris total aging yang kini
 * duduk di `<tfoot>`.
 */

import { useEffect, useState } from "react";
import { Download, RefreshCw } from "lucide-react";

import { api } from "@/lib/api";
import { C } from "@/lib/warna-ui";
import { KartuKPI, Kosong } from "@/components/ui-dasar";
import { Tabel, type Kolom, type SelTotal } from "@/components/dasar";
import { Badge, Btn, Input, Memuat, STATUS_BADGE, fmt, fmtDate, fmtRingkas, tundaSatuTick } from "../_bersama/ui";

interface PoLaporan {
  id: string;
  po_number: string;
  order_date: string;
  total_amount: number;
  status: string;
  supplier?: { id?: string; name?: string } | null;
  project?: { name?: string } | null;
}

interface RingkasBelanja {
  total_value: number;
  total_pos: number;
  by_supplier: Array<{ id: string; name: string; total: number; count: number }>;
  by_month: Array<{ month: string; total: number; count: number }>;
}

interface InvoiceAging {
  id: string;
  invoice_number?: string | null;
  invoice_date: string;
  due_date?: string | null;
  total_amount: number;
  amount_paid: number;
  amount_due: number;
  days_overdue: number;
  bucket: string;
  supplier?: { name?: string } | null;
  project?: { name?: string } | null;
}

interface Aging {
  invoices: InvoiceAging[];
  buckets: Record<string, number> | null;
  total: number;
}

interface Proyek { id: string; name: string }
interface SupplierRingkas { id: string; name: string }

/**
 * Ramp urgensi, bukan deret kategori — sama seperti `/piutang`.
 *
 * Versi sebelumnya punya dua cacat sekaligus: "1–30" dan "31–60" berwarna
 * IDENTIK (keduanya `--warning`), dan "61–90" memakai `--data-5` yang di mode
 * gelap abu-abu terang — jadi bucket kedua-tertua justru tampil paling ringan.
 */
const BUCKET = [
  { label: "Belum Jatuh Tempo", key: "current",    color: "var(--success)", bg: "var(--success-bg)" },
  { label: "1–30 Hari",         key: "days_1_30",  color: "var(--warning)", bg: "var(--warning-bg)" },
  { label: "31–60 Hari",        key: "days_31_60", color: "color-mix(in srgb, var(--warning) 60%, var(--danger))", bg: "var(--warning-bg)" },
  { label: "61–90 Hari",        key: "days_61_90", color: "color-mix(in srgb, var(--warning) 25%, var(--danger))", bg: "var(--warning-bg)" },
  { label: "> 90 Hari",         key: "over_90",    color: "var(--danger)",  bg: "var(--danger-bg)" },
] as const;

export default function LaporanPage() {
  const [subTab, setSubTab] = useState<"rekap" | "aging">("rekap");
  const [purchases, setPurchases] = useState<{ purchase_orders: PoLaporan[]; summary: RingkasBelanja | null }>({ purchase_orders: [], summary: null });
  const [aging, setAging] = useState<Aging>({ invoices: [], buckets: null, total: 0 });
  const [loading, setLoading] = useState(false);
  const [projects, setProjects] = useState<Proyek[]>([]);
  const [suppliers, setSuppliers] = useState<SupplierRingkas[]>([]);
  const [filters, setFilters] = useState({ from: "", to: "", project_id: "", supplier_id: "" });

  useEffect(() => {
    void Promise.all([
      api.get<{ projects: Proyek[] }>("/api/v1/projects").catch(() => null),
      api.get<{ suppliers: SupplierRingkas[] }>("/api/v1/procurement/suppliers").catch(() => null),
    ]).then(([pRes, sRes]) => {
      setProjects(pRes?.data?.projects ?? []);
      setSuppliers(sRes?.data?.suppliers ?? []);
    });
  }, []);

  // Pemuat ditulis sebagai fungsi biasa yang menerima sub-tab dan saringannya
  // lewat PARAMETER, bukan `useCallback` yang membacanya dari closure. Dua
  // alasan, keduanya soal lint dan bukan gaya:
  //
  //  1. `useCallback` yang dirujuk dari daftar dependensi `useEffect` membuat
  //     `react-hooks/set-state-in-effect` membaca setState di dalam pemuat
  //     sebagai setState di badan efek.
  //  2. Karena keduanya masuk sebagai argumen, badan efek tak lagi menutup
  //     nilai apa pun dari luar — `exhaustive-deps` pun tak punya dependensi
  //     yang hilang untuk dikeluhkan, tanpa perlu `eslint-disable`.
  //
  // Medan saringan diteruskan SATU PER SATU, bukan sebagai objek `filters`
  // utuh: kalau objeknya yang dioper, badan efek menutup `filters` dan
  // `exhaustive-deps` menuntutnya masuk daftar. Objek itu selalu dibuat baru
  // oleh `setFilters`, jadi mendaftar medannya memberi pemicu yang sama
  // persis — tak ada muatan yang hilang atau bertambah.
  useEffect(
    () => { void loadData(subTab, filters.from, filters.to, filters.project_id, filters.supplier_id); },
    [subTab, filters.from, filters.to, filters.project_id, filters.supplier_id]);

  async function loadData(
    tab: "rekap" | "aging",
    from: string, to: string, projectId: string, supplierId: string,
  ) {
    await tundaSatuTick(); // lihat catatannya di `_bersama/ui.tsx`
    setLoading(true);
    if (tab === "rekap") {
      const p: Record<string, string> = {};
      if (from) p.from = from;
      if (to) p.to = to;
      if (projectId) p.project_id = projectId;
      if (supplierId) p.supplier_id = supplierId;
      const res = await api.get<{ purchase_orders: PoLaporan[]; summary: RingkasBelanja }>(
        "/api/v1/procurement/reports/purchases", { params: p },
      ).catch(() => null);
      setPurchases(res?.data ?? { purchase_orders: [], summary: null });
    } else {
      const res = await api.get<Aging>("/api/v1/procurement/reports/aging").catch(() => null);
      setAging(res?.data ?? { invoices: [], buckets: null, total: 0 });
    }
    setLoading(false);
  }

  const exportExcel = async () => {
    const XLSX = await import("xlsx");
    if (subTab === "rekap") {
      const rows = purchases.purchase_orders.map(po => ({
        "No. PO": po.po_number,
        "Tanggal": po.order_date,
        "Supplier": po.supplier?.name ?? "",
        "Proyek": po.project?.name ?? "",
        "Status": STATUS_BADGE[po.status]?.label ?? po.status,
        "Total (Rp)": Number(po.total_amount),
      }));
      const ws = XLSX.utils.json_to_sheet(rows);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Rekap Pembelian");
      if ((purchases.summary?.by_supplier ?? []).length > 0) {
        const ws2 = XLSX.utils.json_to_sheet((purchases.summary?.by_supplier ?? []).map(s => ({
          "Supplier": s.name, "Jumlah PO": s.count, "Total (Rp)": s.total,
        })));
        XLSX.utils.book_append_sheet(wb, ws2, "Per Supplier");
      }
      XLSX.writeFile(wb, `rekap-pembelian-${new Date().toISOString().slice(0, 10)}.xlsx`);
    } else {
      const rows = aging.invoices.map(inv => ({
        "No. Invoice": inv.invoice_number ?? "—",
        "Supplier": inv.supplier?.name ?? "",
        "Proyek": inv.project?.name ?? "",
        "Tgl Invoice": inv.invoice_date,
        "Jatuh Tempo": inv.due_date ?? "—",
        "Total (Rp)": Number(inv.total_amount),
        "Terbayar (Rp)": Number(inv.amount_paid),
        "Sisa (Rp)": Number(inv.amount_due),
        "Hari Terlambat": inv.days_overdue,
        "Bucket": inv.bucket,
      }));
      const ws = XLSX.utils.json_to_sheet(rows);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Aging Hutang");
      XLSX.writeFile(wb, `aging-hutang-supplier-${new Date().toISOString().slice(0, 10)}.xlsx`);
    }
  };

  const kolomPo: Kolom<PoLaporan>[] = [
    { kunci: "no", judul: "No. PO", kepalaBaris: true, render: po => <span style={{ fontWeight: 600, color: C.navy }}>{po.po_number}</span> },
    { kunci: "tgl", judul: "Tanggal", render: po => <span style={{ color: C.mid }}>{fmtDate(po.order_date)}</span> },
    { kunci: "supplier", judul: "Supplier", render: po => po.supplier?.name ?? "—" },
    { kunci: "proyek", judul: "Proyek", render: po => <span style={{ color: C.mid }}>{po.project?.name}</span> },
    { kunci: "status", judul: "Status", render: po => <Badge status={po.status} /> },
    { kunci: "total", judul: "Total", rata: "kanan", render: po => <strong>{fmt(Number(po.total_amount))}</strong> },
  ];

  const kolomAging: Kolom<InvoiceAging>[] = [
    { kunci: "supplier", judul: "Supplier", kepalaBaris: true, render: i => i.supplier?.name ?? "—" },
    { kunci: "proyek", judul: "Proyek", render: i => <span style={{ color: C.mid }}>{i.project?.name ?? "—"}</span> },
    { kunci: "tgl", judul: "Tgl Invoice", render: i => <span style={{ color: C.mid }}>{fmtDate(i.invoice_date)}</span> },
    {
      kunci: "tempo", judul: "Jatuh Tempo",
      render: i => <span style={{ color: i.days_overdue > 0 ? C.danger : C.mid }}>{i.due_date ? fmtDate(i.due_date) : "—"}</span>,
    },
    {
      kunci: "telat", judul: "Hari Terlambat", rata: "tengah",
      render: i => i.days_overdue > 0
        ? <span style={{ fontWeight: 700, color: C.danger }}>+{i.days_overdue} hari</span>
        : <span style={{ color: C.muted }}>—</span>,
    },
    { kunci: "total", judul: "Total", rata: "kanan", render: i => fmt(i.total_amount) },
    { kunci: "bayar", judul: "Terbayar", rata: "kanan", render: i => <span style={{ color: C.success }}>{fmt(i.amount_paid)}</span> },
    { kunci: "sisa", judul: "Sisa", rata: "kanan", render: i => <strong style={{ color: C.danger }}>{fmt(i.amount_due)}</strong> },
  ];

  const totalAging: SelTotal[] = [
    { kunci: "label", isi: "Total Hutang", rata: "kanan", rentang: 7 },
    { kunci: "nilai", isi: <span style={{ color: C.danger }}>{fmt(aging.total)}</span>, rata: "kanan" },
  ];

  return (
    <div style={{ width: "100%", padding: "var(--pad-atas) var(--pad-x) var(--pad-bawah)", maxWidth: "var(--w-luas)", margin: "0 auto" }}>
      <div style={{ display: "flex", gap: 8, marginBottom: 20 }}>
        {([["rekap", "Rekap Pembelian"], ["aging", "Aging Hutang"]] as const).map(([key, label]) => {
          const aktif = subTab === key;
          return (
            <button
              key={key} onClick={() => setSubTab(key)} aria-pressed={aktif}
              style={{
                padding: "8px 16px", borderRadius: 6, fontSize: 13, fontWeight: aktif ? 600 : 400,
                background: aktif ? C.navy : C.surface, color: aktif ? C.onNavy : C.mid,
                border: `1px solid ${aktif ? C.navy : C.border}`, cursor: "pointer",
              }}
            >{label}</button>
          );
        })}
      </div>

      {subTab === "rekap" ? (
        <>
          <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap", alignItems: "flex-end" }}>
            <Input label="Dari tanggal" type="date" value={filters.from} onChange={e => setFilters(f => ({ ...f, from: e.target.value }))} style={{ width: 150 }} />
            <Input label="Sampai tanggal" type="date" value={filters.to} onChange={e => setFilters(f => ({ ...f, to: e.target.value }))} style={{ width: 150 }} />
            <select
              aria-label="Saring supplier" value={filters.supplier_id}
              onChange={e => setFilters(f => ({ ...f, supplier_id: e.target.value }))}
              style={{ padding: "8px 12px", border: `1px solid ${C.border}`, borderRadius: 6, fontSize: 13, minWidth: 160, background: C.surface, color: C.text }}
            >
              <option value="">Semua Supplier</option>
              {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
            <select
              aria-label="Saring proyek" value={filters.project_id}
              onChange={e => setFilters(f => ({ ...f, project_id: e.target.value }))}
              style={{ padding: "8px 12px", border: `1px solid ${C.border}`, borderRadius: 6, fontSize: 13, minWidth: 160, background: C.surface, color: C.text }}
            >
              <option value="">Semua Proyek</option>
              {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
            <div style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
              <Btn variant="secondary" onClick={() => void loadData(subTab, filters.from, filters.to, filters.project_id, filters.supplier_id)}><RefreshCw size={13} aria-hidden="true" /> Refresh</Btn>
              <Btn variant="secondary" onClick={() => void exportExcel()}><Download size={13} aria-hidden="true" /> Export Excel</Btn>
            </div>
          </div>

          {purchases.summary && (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 12, marginBottom: 20 }}>
              <KartuKPI
                label="Total PO"
                nilai={String(purchases.summary.total_pos)}
                nilaiAngka={purchases.summary.total_pos}
                keterangan="pesanan pada rentang yang disaring · PO batal tak dihitung"
              />
              <KartuKPI
                label="Total Nilai"
                nilai={fmtRingkas(purchases.summary.total_value)}
                keterangan="nilai pembelian pada rentang yang sama"
              />
            </div>
          )}

          {(purchases.summary?.by_supplier ?? []).length > 0 && (
            <div style={{ marginBottom: 20 }}>
              <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 10 }}>Top Supplier</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {(purchases.summary?.by_supplier ?? []).slice(0, 8).map(s => (
                  <div key={s.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 12px", background: C.surface, borderRadius: 10, border: `1px solid ${C.border}`, fontSize: 13 }}>
                    <span style={{ fontWeight: 500 }}>{s.name}</span>
                    <div style={{ display: "flex", gap: 16, color: C.mid }}>
                      <span>{s.count} PO</span>
                      <span style={{ fontWeight: 600, color: C.text, fontVariantNumeric: "tabular-nums" }}>{fmt(s.total)}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {loading ? <Memuat /> : (
            <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10, overflow: "hidden" }}>
              <Tabel              berpermukaan
                kolom={kolomPo}
                data={purchases.purchase_orders}
                kunciBaris={po => po.id}
                caption="Daftar Purchase Order: nomor, tanggal, supplier, proyek, status, dan nilai total."
                kosong={
                  <Kosong
                    judul="Tidak ada pembelian pada rentang ini"
                    sebab="Rekap hanya menghitung PO yang tidak dibatalkan. Kalau ada saringan tanggal, supplier, atau proyek yang aktif, longgarkan salah satunya — datanya tidak hilang."
                  />
                }
              />
            </div>
          )}
        </>
      ) : (
        <>
          <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 16, gap: 8 }}>
            <Btn variant="secondary" onClick={() => void loadData(subTab, filters.from, filters.to, filters.project_id, filters.supplier_id)}><RefreshCw size={13} aria-hidden="true" /> Refresh</Btn>
            <Btn variant="secondary" onClick={() => void exportExcel()}><Download size={13} aria-hidden="true" /> Export Excel</Btn>
          </div>

          {aging.buckets && (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 8, marginBottom: 20 }}>
              {BUCKET.map(b => (
                <div key={b.key} style={{ background: b.bg, border: `1px solid ${C.border}`, borderRadius: 10, padding: "12px 12px", textAlign: "center" }}>
                  <div style={{ fontSize: 10, color: C.mid, marginBottom: 6, textTransform: "uppercase", letterSpacing: ".04em" }}>{b.label}</div>
                  <div style={{ fontSize: 15, fontWeight: 700, color: b.color, fontVariantNumeric: "tabular-nums" }}>
                    {fmt(aging.buckets?.[b.key] ?? 0)}
                  </div>
                </div>
              ))}
            </div>
          )}

          {loading ? <Memuat /> : (
            <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10, overflow: "hidden" }}>
              <Tabel              berpermukaan
                kolom={kolomAging}
                data={aging.invoices}
                kunciBaris={i => i.id}
                caption="Umur hutang supplier: tanggal invoice, jatuh tempo, berapa hari terlambat, dan sisa yang belum dibayar."
                tandaiBaris={i => i.bucket === "over_90" ? "var(--danger-bg)" : i.bucket === "days_61_90" ? "var(--warning-bg)" : undefined}
                total={aging.invoices.length > 0 ? totalAging : undefined}
                kosong={
                  <Kosong
                    judul="Tidak ada hutang outstanding"
                    sebab="Laporan ini hanya memuat tagihan yang belum lunas. Kosong berarti seluruh tagihan supplier sudah terbayar — bukan berarti datanya gagal dimuat."
                  />
                }
              />
            </div>
          )}
        </>
      )}
    </div>
  );
}
