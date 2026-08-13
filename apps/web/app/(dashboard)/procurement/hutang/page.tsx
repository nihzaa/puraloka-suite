"use client";

/**
 * PROCUREMENT — HUTANG SUPPLIER.
 *
 * Dipindahkan dari tab `invoices`. Alur dipertahankan: peringatan jatuh tempo,
 * ringkasan total hutang, saring status, dan pembayaran (dengan alokasi FIFO
 * di server serta pilihan sumber kas yang menolak akun bersaldo kurang).
 *
 * ── Yang berubah: kartu ringkasan memakai `KartuKPI`
 *
 * Dua kartu buatan sendiri diganti komponen bersama. Bukan kerapian semata —
 * versi lamanya menulis angka rupiah tanpa `tabular-nums`, jadi "Rp 111.111"
 * dan "Rp 888.888" punya lebar berbeda dan tak bisa dibandingkan sekilas.
 */

import { useEffect, useState } from "react";
import { AlertTriangle, CalendarClock, Receipt } from "lucide-react";

import { api } from "@/lib/api";
import { C } from "@/lib/warna-ui";
import { KartuKPI, Kosong } from "@/components/ui-dasar";
import {
  Badge, Btn, Card, Input, KotakGalat, Memuat, Modal, Select,
  STATUS_BADGE, fmt, fmtDate, fmtRingkas, pesanError, tundaSatuTick,
} from "../_bersama/ui";

interface SupplierInvoice {
  id: string;
  status: string;
  invoice_date: string;
  due_date?: string | null;
  invoice_number?: string | null;
  description?: string | null;
  total_amount: number;
  amount_paid: number;
  amount_due: number;
  supplier?: { id?: string; name?: string } | null;
  project?: { name?: string } | null;
}

interface AkunKas { id: string; name: string; type: string; balance?: number | string }

export default function HutangPage() {
  const [invoices, setInvoices] = useState<SupplierInvoice[]>([]);
  const [overdue, setOverdue] = useState<SupplierInvoice[]>([]);
  const [dueSoon, setDueSoon] = useState<SupplierInvoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState("");
  const [payModal, setPayModal] = useState<SupplierInvoice | null>(null);
  const [payForm, setPayForm] = useState({ amount: "", payment_method: "transfer", reference_number: "", notes: "", cash_account_id: "" });
  const [paying, setPaying] = useState(false);
  const [payError, setPayError] = useState("");
  const [summary, setSummary] = useState({ total_outstanding: 0, overdue_count: 0 });
  const [cashAccounts, setCashAccounts] = useState<AkunKas[]>([]);

  // Pemuat ditulis sebagai fungsi biasa yang menerima saringannya lewat
  // PARAMETER, bukan `useCallback` yang membacanya dari closure. Dua alasan,
  // keduanya soal lint dan bukan gaya:
  //
  //  1. `useCallback` yang dirujuk dari daftar dependensi `useEffect` membuat
  //     `react-hooks/set-state-in-effect` membaca setState di dalam pemuat
  //     sebagai setState di badan efek.
  //  2. Karena saringan masuk sebagai argumen, badan efek tak lagi menutup
  //     nilai apa pun dari luar — `exhaustive-deps` pun tak punya dependensi
  //     yang hilang untuk dikeluhkan, tanpa perlu `eslint-disable`.
  //
  // Perilakunya sama persis: efek jalan saat dipasang dan setiap kali
  // `statusFilter` berubah, dengan nilai saringan yang sama seperti dulu.
  useEffect(() => { void load(statusFilter); }, [statusFilter]);

  async function load(status: string) {
    await tundaSatuTick(); // lihat catatannya di `_bersama/ui.tsx`
    setLoading(true);
    const [invRes, alertRes, cashRes] = await Promise.all([
      api.get<{ supplier_invoices: SupplierInvoice[]; summary: { total_outstanding: number; overdue_count: number } }>(
        "/api/v1/procurement/supplier-invoices", { params: status ? { status } : {} },
      ).catch(() => null),
      api.get<{ overdue: SupplierInvoice[]; due_soon: SupplierInvoice[] }>(
        "/api/v1/procurement/supplier-invoices/overdue",
      ).catch(() => null),
      api.get<{ cash_accounts: AkunKas[] }>("/api/v1/cash/accounts").catch(() => null),
    ]);
    setInvoices(invRes?.data?.supplier_invoices ?? []);
    setSummary(invRes?.data?.summary ?? { total_outstanding: 0, overdue_count: 0 });
    setOverdue(alertRes?.data?.overdue ?? []);
    setDueSoon(alertRes?.data?.due_soon ?? []);
    // Kecualikan petty_cash — tak wajar dipakai membayar supplier.
    setCashAccounts((cashRes?.data?.cash_accounts ?? []).filter(a => a.type !== "petty_cash"));
    setLoading(false);
  }

  const pay = async () => {
    if (!payModal || !payForm.amount) return;
    setPayError(""); setPaying(true);
    try {
      await api.post("/api/v1/procurement/supplier-payments", {
        supplier_id: payModal.supplier?.id,
        amount: Number(payForm.amount),
        payment_method: payForm.payment_method,
        reference_number: payForm.reference_number || null,
        notes: payForm.notes || null,
        cash_account_id: payForm.cash_account_id || null,
      });
      setPayModal(null);
      setPayForm({ amount: "", payment_method: "transfer", reference_number: "", notes: "", cash_account_id: "" });
      void load(statusFilter);
    } catch (err: unknown) {
      setPayError(pesanError(err, "Gagal menyimpan pembayaran"));
    } finally { setPaying(false); }
  };

  return (
    <div style={{ width: "100%", padding: "var(--pad-atas) var(--pad-x) var(--pad-bawah)", maxWidth: "var(--w-luas)", margin: "0 auto" }}>
      {/* Peringatan jatuh tempo — menghilang saat tak ada, seperti spanduk di
          halaman ringkasan. Peringatan yang selalu tampil berhenti dibaca. */}
      {(overdue.length > 0 || dueSoon.length > 0) && (
        <div style={{ marginBottom: 16, display: "flex", flexDirection: "column", gap: 8 }}>
          {overdue.length > 0 && (
            <div role="alert" style={{ background: C.dangerBg, border: `1px solid ${C.danger}`, borderRadius: 10, padding: "12px 16px", display: "flex", alignItems: "center", gap: 8, fontSize: 13 }}>
              <AlertTriangle size={16} color={C.danger} aria-hidden="true" style={{ flexShrink: 0 }} />
              <span style={{ color: C.danger, fontWeight: 600 }}>{overdue.length} tagihan supplier sudah JATUH TEMPO</span>
            </div>
          )}
          {dueSoon.length > 0 && (
            <div style={{ background: C.warningBg, border: `1px solid ${C.warning}`, borderRadius: 10, padding: "12px 16px", display: "flex", alignItems: "center", gap: 8, fontSize: 13 }}>
              <CalendarClock size={16} color={C.warning} aria-hidden="true" style={{ flexShrink: 0 }} />
              <span style={{ color: C.warning, fontWeight: 600 }}>{dueSoon.length} tagihan jatuh tempo dalam 3 hari</span>
            </div>
          )}
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 12, marginBottom: 20 }}>
        <KartuKPI
          label="Total Hutang"
          nilai={fmtRingkas(summary.total_outstanding)}
          naikBagus={false}
          ikon={<Receipt size={15} />}
          keterangan="sisa tagihan supplier yang belum lunas"
        />
        <KartuKPI
          label="Jatuh Tempo"
          nilai={String(summary.overdue_count)}
          nilaiAngka={summary.overdue_count}
          naikBagus={false}
          ikon={<AlertTriangle size={15} />}
          keterangan={summary.overdue_count === 0
            ? "tak ada tagihan yang lewat tanggal jatuh tempo"
            : "sudah lewat tanggal jatuh tempo — bayar atau negosiasikan"}
        />
      </div>

      <div style={{ display: "flex", gap: 12, marginBottom: 16 }}>
        <select
          aria-label="Saring status tagihan supplier" value={statusFilter}
          onChange={e => setStatusFilter(e.target.value)}
          style={{ padding: "8px 12px", border: `1px solid ${C.border}`, borderRadius: 6, fontSize: 13, background: C.surface, color: C.text }}
        >
          <option value="">Semua Status</option>
          {["unpaid", "partial", "paid"].map(s => <option key={s} value={s}>{STATUS_BADGE[s]?.label}</option>)}
        </select>
      </div>

      {loading ? <Memuat /> : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {invoices.length === 0 && (
            <Kosong
              judul={statusFilter ? "Tak ada tagihan dengan status itu" : "Belum ada tagihan supplier"}
              sebab={statusFilter
                ? `Saringan status "${STATUS_BADGE[statusFilter]?.label ?? statusFilter}" tak menyisakan satu pun. Pilih "Semua Status" untuk melihat keseluruhannya.`
                : "Tagihan masuk setelah barang diterima. Yang jumlahnya tak cocok dengan PO dan penerimaan akan tertahan di sini, bukan lolos diam-diam."}
            />
          )}
          {invoices.map(inv => {
            const lewatTempo = !!inv.due_date && new Date(inv.due_date) < new Date() && inv.status !== "paid";
            return (
              <Card key={inv.id}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 8 }}>
                  <div>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span style={{ fontWeight: 600, color: C.text }}>{inv.supplier?.name}</span>
                      <Badge status={inv.status} />
                      {lewatTempo && (
                        <span style={{ fontSize: 11, color: C.danger, fontWeight: 600 }}>JATUH TEMPO</span>
                      )}
                    </div>
                    <div style={{ fontSize: 13, color: C.mid, marginTop: 4 }}>
                      {inv.description ?? inv.invoice_number ?? "Invoice"} · {fmtDate(inv.invoice_date)}
                      {inv.due_date && ` · Jatuh tempo: ${fmtDate(inv.due_date)}`}
                    </div>
                    {inv.project?.name && <div style={{ fontSize: 12, color: C.mid }}>Proyek: {inv.project.name}</div>}
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <div style={{ fontSize: 13, color: C.mid }}>Total: {fmt(inv.total_amount)}</div>
                    <div style={{ fontSize: 13, color: C.mid }}>Dibayar: {fmt(inv.amount_paid)}</div>
                    <div style={{ fontSize: 15, fontWeight: 700, color: inv.status === "paid" ? C.success : C.danger }}>
                      {fmt(inv.amount_due)}
                    </div>
                    {inv.status !== "paid" && (
                      <Btn
                        style={{ marginTop: 6, fontSize: 12 }}
                        onClick={() => { setPayModal(inv); setPayForm(f => ({ ...f, amount: String(inv.amount_due) })); }}
                      >Bayar</Btn>
                    )}
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {payModal && (
        <Modal title={`Bayar Hutang — ${payModal.supplier?.name}`} onClose={() => { setPayModal(null); setPayError(""); }}>
          <div style={{ fontSize: 13, color: C.mid, marginBottom: 16 }}>
            Sisa hutang: <strong style={{ color: C.danger }}>{fmt(payModal.amount_due)}</strong>
            <br />Pembayaran akan dialokasikan otomatis (FIFO) ke bon terlama.
          </div>
          {payError && <div style={{ marginBottom: 12 }}><KotakGalat pesan={payError} /></div>}
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <Input label="Jumlah Dibayar (Rp) *" value={payForm.amount} onChange={e => setPayForm(f => ({ ...f, amount: e.target.value }))} type="number" />
            <Select label="Metode Pembayaran" value={payForm.payment_method} onChange={e => setPayForm(f => ({ ...f, payment_method: e.target.value }))}>
              <option value="transfer">Transfer Bank</option>
              <option value="cash">Tunai</option>
              <option value="check">Cek / Giro</option>
            </Select>
            <Select label="Sumber Kas (opsional)" value={payForm.cash_account_id} onChange={e => setPayForm(f => ({ ...f, cash_account_id: e.target.value }))}>
              <option value="">— Catat tanpa potong kas —</option>
              {cashAccounts.map(a => {
                const kurang = !!payForm.amount && Number(a.balance) < Number(payForm.amount);
                return (
                  <option key={a.id} value={a.id} disabled={kurang}>
                    {a.name} — {fmt(Number(a.balance ?? 0))}{kurang ? " (saldo kurang)" : ""}
                  </option>
                );
              })}
            </Select>
            {payForm.cash_account_id && (
              <div style={{ fontSize: 12, color: C.info, background: C.infoBg, borderRadius: 6, padding: "8px 12px" }}>
                Saldo akun akan berkurang otomatis setelah pembayaran disimpan.
              </div>
            )}
            <Input label="No. Referensi / Bukti Transfer" value={payForm.reference_number} onChange={e => setPayForm(f => ({ ...f, reference_number: e.target.value }))} placeholder="Opsional" />
            <Input label="Catatan" value={payForm.notes} onChange={e => setPayForm(f => ({ ...f, notes: e.target.value }))} />
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 8 }}>
              <Btn variant="secondary" onClick={() => { setPayModal(null); setPayError(""); }}>Batal</Btn>
              <Btn loading={paying} onClick={() => void pay()}>Konfirmasi Bayar</Btn>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
