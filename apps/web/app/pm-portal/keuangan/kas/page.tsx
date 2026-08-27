"use client";

// ============================================================================
// Kas & Pengeluaran — Cash Management, Task 33.
//
// 2 tab (Akun Kas / Pengeluaran) lewat `<SegmentedTab>` (komponen bersama
// portal, pola sama Task 32 `keuangan/piutang/page.tsx`) + `useState` lokal —
// BUKAN `useSearchParams`, jadi halaman ini tak butuh <Suspense> (pelajaran
// Task 29, tak berlaku di sini karena tak ada pemakaian `useSearchParams`
// sama sekali).
//
// Bentuk respons DIVERIFIKASI baris-per-baris ke `apps/api/src/routes/v1/
// cash.ts` (Task 31 riset + verifikasi ulang sendiri saat Task 33):
// `GET /cash/summary` (SEMUA number, beda dari `keuangan/ikhtisar` yang
// string), `GET /cash/accounts`, `GET /cash/expenses`, `GET /cash/categories`.
//
// Tombol "+ Pengeluaran" (aksi utama halaman) memakai `var(--grad-aksen)`,
// BUKAN navy padat — konvensi tombol primer di repo ini (`uji-tombol-primer-
// seragam.mjs`, ditemukan Task 32 lewat menjalankan penjaga CI). Tombol
// "Transfer" outline (border navy, latar surface) sengaja TIDAK memakai
// gradasi — penjaga itu hanya menyasar LATAR PADAT elemen klikabel, dan
// tombol sekunder di repo ini memang bergaya outline, bukan gradasi.
//
// TIDAK ADA tombol approve/reject/cancel untuk pengeluaran maupun transfer
// di halaman ini (Temuan #2 Task 31, dikonfirmasi ulang langsung ke
// `cash.ts`): `cash:expense:approve` bergerbang `approval_chains` per-tenant
// yang tak bisa dijamin dimiliki PM dari kode saja — approve/reject
// pengeluaran HANYA lewat inbox terpusat (Task 36). `PATCH .../cancel`
// transfer butuh `cash:account:manage`, PM TIDAK PUNYA — tombol Batalkan
// juga tak dibangun. Satu-satunya aksi tulis PM di halaman INI (bukan
// [id]) adalah membuat transfer (`cash:transfer:create`, PM PUNYA) dan
// mencatat pengeluaran (`POST /cash/expenses`, hanya `authenticate` —
// PM otomatis `autoApprove` karena `role === 'pm'`, `cash.ts:565`).
//
// State galat AKSI (`galatForm`, dua BottomSheet) TERPISAH dari galat MUAT
// (`galatAkun`/`galatExpense` dari `useData`) — pelajaran Task 31.
// ============================================================================

import { useMemo, useState } from "react";
import Link from "next/link";
import { Wallet, Plus, ArrowLeftRight, Receipt } from "lucide-react";
import { useData, invalidasi } from "@/lib/data-cache";
import { api } from "@/lib/api";
import EmptyState from "@/components/portal/EmptyState";
import KepalaPortal from "@/components/portal/KepalaPortal";
import SkeletonCard from "@/components/portal/SkeletonCard";
import StatusBadge, { type VarianStatus } from "@/components/portal/StatusBadge";
import BottomSheet from "@/components/portal/BottomSheet";
import SegmentedTab from "@/components/portal/SegmentedTab";
import type {
  ProyekPM, RespCashSummary, RespCashAccounts, RespCashExpenses,
  RespKategoriPengeluaran, GalatApi,
} from "../../_bersama/tipe";
import { pesanGalat } from "../../_bersama/tipe";

interface RespProyek { projects: ProyekPM[] }

function fmtRupiah(v: number | string | null | undefined): string {
  if (v === null || v === undefined) return "—";
  const n = typeof v === "string" ? Number(v) : v;
  if (!Number.isFinite(n)) return "—";
  return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(n);
}
function fmtTanggal(s: string | null): string {
  if (!s) return "—";
  return new Date(s).toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric" });
}
const LABEL_TIPE_AKUN: Record<string, string> = { main: "Kas Utama", collector: "Kas Kolektor", petty_cash: "Kas Kecil" };
const LABEL_STATUS_EXP: Record<string, string> = { submitted: "Diajukan", approved: "Disetujui", rejected: "Ditolak" };
const VARIAN_STATUS_EXP: Record<string, VarianStatus> = { submitted: "pending", approved: "approved", rejected: "rejected" };

type Tab = "akun" | "pengeluaran";

export default function PmKasPage() {
  const [tab, setTab] = useState<Tab>("akun");
  const [sheetTransfer, setSheetTransfer] = useState(false);
  const [sheetExpense, setSheetExpense] = useState(false);
  const [mengirim, setMengirim] = useState(false);
  const [galatForm, setGalatForm] = useState<string | null>(null);

  const [formTransfer, setFormTransfer] = useState({ from_account_id: "", to_account_id: "", amount: "", notes: "" });
  const [formExpense, setFormExpense] = useState({
    project_id: "", category_id: "", petty_cash_id: "", description: "", unit_price: "", qty: "1", vendor_name: "",
  });

  const { data: dataSummary } = useData<RespCashSummary>("/api/v1/cash/summary");
  const { data: dataAkun, memuat: memuatAkun, galat: galatAkun } = useData<RespCashAccounts>(tab === "akun" ? "/api/v1/cash/accounts" : null);
  const { data: dataExpense, memuat: memuatExpense, galat: galatExpense } = useData<RespCashExpenses>(tab === "pengeluaran" ? "/api/v1/cash/expenses" : null);
  const { data: dataProyek } = useData<RespProyek>("/api/v1/projects");
  const daftarProyek = useMemo(() => (dataProyek?.projects ?? []).filter((p) => p.pm), [dataProyek]);

  const urlKategori = formExpense.project_id ? `/api/v1/cash/categories?project_id=${formExpense.project_id}` : "/api/v1/cash/categories";
  const { data: dataKategori } = useData<RespKategoriPengeluaran>(sheetExpense ? urlKategori : null);

  const akunPettyCash = (dataAkun?.accounts ?? []).filter((a) => a.type === "petty_cash");

  function bukaSheetTransfer() {
    setGalatForm(null);
    setSheetTransfer(true);
  }
  function bukaSheetExpense() {
    setGalatForm(null);
    setSheetExpense(true);
  }

  async function kirimTransfer() {
    if (!formTransfer.from_account_id || !formTransfer.to_account_id || !formTransfer.amount) {
      setGalatForm("Akun asal, tujuan, dan jumlah wajib diisi.");
      return;
    }
    setMengirim(true);
    setGalatForm(null);
    try {
      await api.post("/api/v1/cash/transfers", {
        from_account_id: formTransfer.from_account_id,
        to_account_id: formTransfer.to_account_id,
        amount: Number(formTransfer.amount),
        notes: formTransfer.notes.trim() || undefined,
      });
      setSheetTransfer(false);
      setFormTransfer({ from_account_id: "", to_account_id: "", amount: "", notes: "" });
      invalidasi("/api/v1/cash/");
      invalidasi("/api/v1/cash/summary");
    } catch (e) {
      setGalatForm(pesanGalat(e as GalatApi, "Gagal mencatat transfer"));
    } finally {
      setMengirim(false);
    }
  }

  async function kirimExpense() {
    if (!formExpense.project_id || !formExpense.category_id || !formExpense.description.trim() || !formExpense.unit_price) {
      setGalatForm("Proyek, kategori, deskripsi, dan harga satuan wajib diisi.");
      return;
    }
    setMengirim(true);
    setGalatForm(null);
    try {
      const fd = new FormData();
      fd.append("project_id", formExpense.project_id);
      fd.append("category_id", formExpense.category_id);
      fd.append("description", formExpense.description.trim());
      fd.append("unit_price", formExpense.unit_price);
      fd.append("qty", formExpense.qty || "1");
      fd.append("expense_source", "petty_cash");
      if (formExpense.petty_cash_id) fd.append("petty_cash_id", formExpense.petty_cash_id);
      if (formExpense.vendor_name.trim()) fd.append("vendor_name", formExpense.vendor_name.trim());
      // `lib/api.ts` MEMAKU header JSON di instance axios — override eksplisit
      // WAJIB untuk multipart, bukan opsional (dikonfirmasi Task 31/33).
      await api.post("/api/v1/cash/expenses", fd, { headers: { "Content-Type": "multipart/form-data" } });
      setSheetExpense(false);
      setFormExpense({ project_id: "", category_id: "", petty_cash_id: "", description: "", unit_price: "", qty: "1", vendor_name: "" });
      invalidasi("/api/v1/cash/expenses");
      invalidasi("/api/v1/cash/summary");
    } catch (e) {
      setGalatForm(pesanGalat(e as GalatApi, "Gagal mencatat pengeluaran"));
    } finally {
      setMengirim(false);
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--gap-bagian)" }}>
      <KepalaPortal judul="Kas & Pengeluaran" />

      {dataSummary && (
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <div style={{ background: "var(--surface)", borderRadius: 16, padding: 14, border: "1px solid var(--border)", flex: "1 1 140px" }}>
            <div style={{ fontSize: 11, color: "var(--text-secondary)" }}>Total Saldo</div>
            <div style={{ fontSize: 17, fontWeight: 700, color: "var(--text-primary)", fontVariantNumeric: "tabular-nums" }}>{fmtRupiah(dataSummary.totalBalance)}</div>
          </div>
          <div style={{ background: "var(--surface)", borderRadius: 16, padding: 14, border: "1px solid var(--border)", flex: "1 1 140px" }}>
            <div style={{ fontSize: 11, color: "var(--text-secondary)" }}>Kas Kecil Beredar</div>
            <div style={{ fontSize: 17, fontWeight: 700, color: "var(--text-primary)", fontVariantNumeric: "tabular-nums" }}>{fmtRupiah(dataSummary.pettyBalance)}</div>
          </div>
          {dataSummary.pendingExpenseCount > 0 && (
            <div style={{ background: "var(--warning-bg)", borderRadius: 16, padding: 14, border: "1px solid var(--warning-border)", flex: "1 1 140px" }}>
              <div style={{ fontSize: 11, color: "var(--on-warning-bg)" }}>Menunggu Persetujuan</div>
              <div style={{ fontSize: 17, fontWeight: 700, color: "var(--on-warning-bg)" }}>{dataSummary.pendingExpenseCount} pengeluaran</div>
            </div>
          )}
        </div>
      )}

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <button type="button" onClick={bukaSheetTransfer}
          style={{ display: "flex", alignItems: "center", gap: 4, padding: "8px 14px", borderRadius: "var(--portal-radius-pill)", border: "1px solid var(--navy)", background: "var(--surface)", color: "var(--navy)", fontSize: 13, fontWeight: 700, cursor: "pointer", minHeight: 40 }}>
          <ArrowLeftRight size={16} aria-hidden="true" /> Transfer
        </button>
        <button type="button" onClick={bukaSheetExpense}
          style={{ display: "flex", alignItems: "center", gap: 4, padding: "8px 14px", borderRadius: "var(--portal-radius-pill)", border: "none", background: "var(--grad-aksen)", color: "var(--on-navy)", fontSize: 13, fontWeight: 700, cursor: "pointer", minHeight: 40 }}>
          <Plus size={16} aria-hidden="true" /> Pengeluaran
        </button>
      </div>

      <SegmentedTab
        opsi={[
          { value: "akun", label: "Akun Kas" },
          { value: "pengeluaran", label: "Pengeluaran" },
        ]}
        aktif={tab}
        onUbah={(v) => setTab(v as Tab)}
      />

      {tab === "akun" && (
        <>
          {memuatAkun && <SkeletonCard tinggi={100} />}
          {galatAkun && <EmptyState icon={Wallet} judul="Gagal memuat" deskripsi={pesanGalat(galatAkun as GalatApi, "Coba lagi.")} />}
          {!memuatAkun && !galatAkun && dataAkun && dataAkun.accounts.length === 0 && (
            <EmptyState icon={Wallet} judul="Belum ada akun kas" deskripsi="Akun kas dikelola oleh admin/finance." />
          )}
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {(dataAkun?.accounts ?? []).map((a) => (
              <Link key={a.id} href={`/pm-portal/keuangan/kas/${a.id}`} style={{ textDecoration: "none" }}>
                <div style={{ background: "var(--surface)", borderRadius: 16, padding: "var(--pad-kartu-lega)", border: "1px solid var(--border)" }}>
                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <div>
                      <div style={{ fontSize: 14, fontWeight: 700, color: "var(--text-primary)" }}>{a.name}</div>
                      <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>{LABEL_TIPE_AKUN[a.type] ?? a.type} · {a.projects?.name ?? "Lintas proyek"}</div>
                    </div>
                    <span style={{ fontSize: 15, fontWeight: 700, color: "var(--text-primary)", fontVariantNumeric: "tabular-nums" }}>{fmtRupiah(a.balance)}</span>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </>
      )}

      {tab === "pengeluaran" && (
        <>
          {memuatExpense && <SkeletonCard tinggi={100} />}
          {galatExpense && <EmptyState icon={Receipt} judul="Gagal memuat" deskripsi={pesanGalat(galatExpense as GalatApi, "Coba lagi.")} />}
          {!memuatExpense && !galatExpense && dataExpense && dataExpense.expenses.length === 0 && (
            <EmptyState icon={Receipt} judul="Belum ada pengeluaran" deskripsi="Catat pengeluaran kas kecil di sini." />
          )}
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {(dataExpense?.expenses ?? []).map((e) => (
              <div key={e.id} style={{ background: "var(--surface)", borderRadius: 16, padding: "var(--pad-kartu-lega)", border: "1px solid var(--border)" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                  <div>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span style={{ fontSize: 13, fontWeight: 700, color: "var(--text-primary)" }}>{e.description}</span>
                      <StatusBadge status={VARIAN_STATUS_EXP[e.status] ?? "netral"} label={LABEL_STATUS_EXP[e.status] ?? e.status} />
                    </div>
                    <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>{e.projects?.name ?? "—"} · {e.category?.name ?? "—"} · {fmtTanggal(e.expense_date)}</div>
                    {e.vendor_name && <div style={{ fontSize: 11, color: "var(--text-secondary)" }}>{e.vendor_name}</div>}
                  </div>
                  <span style={{ fontSize: 14, fontWeight: 700, color: "var(--text-primary)", fontVariantNumeric: "tabular-nums" }}>{fmtRupiah(e.total_amount)}</span>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      <BottomSheet terbuka={sheetTransfer} onTutup={() => setSheetTransfer(false)} judul="Transfer Kas">
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: "var(--text-secondary)" }}>Dari Akun *</span>
            <select value={formTransfer.from_account_id} onChange={(e) => setFormTransfer((f) => ({ ...f, from_account_id: e.target.value }))}
              style={{ minHeight: 44, padding: "0 12px", borderRadius: 12, border: "1px solid var(--border)", fontSize: 14 }}>
              <option value="">Pilih akun</option>
              {(dataAkun?.accounts ?? []).map((a) => <option key={a.id} value={a.id}>{a.name} ({fmtRupiah(a.balance)})</option>)}
            </select>
          </label>
          <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: "var(--text-secondary)" }}>Ke Akun *</span>
            <select value={formTransfer.to_account_id} onChange={(e) => setFormTransfer((f) => ({ ...f, to_account_id: e.target.value }))}
              style={{ minHeight: 44, padding: "0 12px", borderRadius: 12, border: "1px solid var(--border)", fontSize: 14 }}>
              <option value="">Pilih akun</option>
              {(dataAkun?.accounts ?? []).filter((a) => a.id !== formTransfer.from_account_id).map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          </label>
          <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: "var(--text-secondary)" }}>Jumlah *</span>
            <input type="number" min={1} value={formTransfer.amount} onChange={(e) => setFormTransfer((f) => ({ ...f, amount: e.target.value }))}
              style={{ minHeight: 44, padding: "0 12px", borderRadius: 12, border: "1px solid var(--border)", fontSize: 14 }} />
          </label>
          <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: "var(--text-secondary)" }}>Catatan</span>
            <input value={formTransfer.notes} onChange={(e) => setFormTransfer((f) => ({ ...f, notes: e.target.value }))}
              style={{ minHeight: 44, padding: "0 12px", borderRadius: 12, border: "1px solid var(--border)", fontSize: 14 }} />
          </label>
          {galatForm && <div role="alert" style={{ fontSize: 12, color: "var(--danger)" }}>{galatForm}</div>}
          <button type="button" onClick={() => void kirimTransfer()} disabled={mengirim}
            style={{ minHeight: 48, borderRadius: "var(--portal-radius-pill)", fontSize: 14, fontWeight: 700, border: "none", background: mengirim ? "var(--surface-subtle)" : "var(--grad-aksen)", color: mengirim ? "var(--text-muted)" : "var(--on-navy)", cursor: mengirim ? "default" : "pointer" }}>
            {mengirim ? "Mencatat…" : "Catat Transfer"}
          </button>
        </div>
      </BottomSheet>

      <BottomSheet terbuka={sheetExpense} onTutup={() => setSheetExpense(false)} judul="Catat Pengeluaran">
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: "var(--text-secondary)" }}>Proyek *</span>
            <select value={formExpense.project_id} onChange={(e) => setFormExpense((f) => ({ ...f, project_id: e.target.value, category_id: "" }))}
              style={{ minHeight: 44, padding: "0 12px", borderRadius: 12, border: "1px solid var(--border)", fontSize: 14 }}>
              <option value="">Pilih proyek</option>
              {daftarProyek.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </label>
          <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: "var(--text-secondary)" }}>Kategori *</span>
            <select value={formExpense.category_id} onChange={(e) => setFormExpense((f) => ({ ...f, category_id: e.target.value }))}
              style={{ minHeight: 44, padding: "0 12px", borderRadius: 12, border: "1px solid var(--border)", fontSize: 14 }}>
              <option value="">Pilih kategori</option>
              {(dataKategori?.categories ?? []).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </label>
          <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: "var(--text-secondary)" }}>Sumber Kas Kecil</span>
            <select value={formExpense.petty_cash_id} onChange={(e) => setFormExpense((f) => ({ ...f, petty_cash_id: e.target.value }))}
              style={{ minHeight: 44, padding: "0 12px", borderRadius: 12, border: "1px solid var(--border)", fontSize: 14 }}>
              <option value="">Pilih akun kas kecil</option>
              {akunPettyCash.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          </label>
          <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: "var(--text-secondary)" }}>Deskripsi *</span>
            <input value={formExpense.description} onChange={(e) => setFormExpense((f) => ({ ...f, description: e.target.value }))}
              style={{ minHeight: 44, padding: "0 12px", borderRadius: 12, border: "1px solid var(--border)", fontSize: 14 }} />
          </label>
          <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: "var(--text-secondary)" }}>Qty × Harga Satuan *</span>
            <div style={{ display: "flex", gap: 8 }}>
              <input type="number" min={1} value={formExpense.qty} onChange={(e) => setFormExpense((f) => ({ ...f, qty: e.target.value }))}
                style={{ minHeight: 44, padding: "0 12px", borderRadius: 12, border: "1px solid var(--border)", fontSize: 14, width: 80 }} />
              <input type="number" min={0} value={formExpense.unit_price} onChange={(e) => setFormExpense((f) => ({ ...f, unit_price: e.target.value }))}
                style={{ minHeight: 44, padding: "0 12px", borderRadius: 12, border: "1px solid var(--border)", fontSize: 14, flex: 1 }} />
            </div>
          </label>
          <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: "var(--text-secondary)" }}>Vendor</span>
            <input value={formExpense.vendor_name} onChange={(e) => setFormExpense((f) => ({ ...f, vendor_name: e.target.value }))}
              style={{ minHeight: 44, padding: "0 12px", borderRadius: 12, border: "1px solid var(--border)", fontSize: 14 }} />
          </label>
          {galatForm && <div role="alert" style={{ fontSize: 12, color: "var(--danger)" }}>{galatForm}</div>}
          <button type="button" onClick={() => void kirimExpense()} disabled={mengirim}
            style={{ minHeight: 48, borderRadius: "var(--portal-radius-pill)", fontSize: 14, fontWeight: 700, border: "none", background: mengirim ? "var(--surface-subtle)" : "var(--grad-aksen)", color: mengirim ? "var(--text-muted)" : "var(--on-navy)", cursor: mengirim ? "default" : "pointer" }}>
            {mengirim ? "Mencatat…" : "Catat Pengeluaran"}
          </button>
        </div>
      </BottomSheet>
    </div>
  );
}
