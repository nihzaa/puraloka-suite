"use client";

/**
 * PROCUREMENT — SUPPLIER. Daftar pemasok, syarat bayar, dan hutang berjalan.
 *
 * Dipindahkan utuh dari tab `suppliers` di `procurement/page.tsx` (2.464
 * baris, delapan tab). Perilaku dipertahankan seluruhnya: pencarian, tambah,
 * edit, dan detail yang memuat hutang belum lunas serta riwayat pembayaran.
 */

import { useCallback, useState } from "react";
import { MapPin, Phone, Plus, Search } from "lucide-react";

import { api } from "@/lib/api";
import { useData } from "@/lib/data-cache";
import { C } from "@/lib/warna-ui";
import { Kosong } from "@/components/ui-dasar";
import {
  Badge, Btn, Card, Input, KotakGalat, Memuat, Modal, Select,
  fmt, fmtDate, pesanError,
} from "../_bersama/ui";
import { PAYMENT_TERMS, type Supplier } from "../_bersama/tipe";

/** Detail supplier — daftar + hutang + pembayaran, dari `/suppliers/:id`. */
interface DetailSupplier {
  supplier?: Supplier;
  invoices?: Array<{
    id: string; status: string; amount_due: number;
    invoice_date: string; due_date?: string | null;
    description?: string | null; invoice_number?: string | null;
  }>;
  payments?: Array<{
    id: string; amount: number; payment_date: string;
    payment_method: string; notes?: string | null;
  }>;
}

const FORM_KOSONG = {
  name: "", contact_person: "", phone: "", email: "",
  address: "", city: "", payment_terms: "cod", notes: "",
};

export default function SupplierPage() {
  const [search, setSearch] = useState("");
  const [modal, setModal] = useState<"add" | "detail" | "edit" | null>(null);
  const [selected, setSelected] = useState<DetailSupplier | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [form, setForm] = useState(FORM_KOSONG);

  /*
    ── PINDAH KE LAPIS CACHE BERSAMA (F4-2), 2026-08-16

    `useData` menggantikan useEffect+useState+tundaSatuTick.
  */
  const { data, memuat: loading, muatUlang } = useData<{ suppliers: Supplier[] }>("/api/v1/procurement/suppliers");
  const load = useCallback(async () => { await muatUlang(); }, [muatUlang]);

  // Diturunkan, bukan disalin.
  const suppliers = data?.suppliers ?? [];

  const filtered = suppliers.filter(s => s.name.toLowerCase().includes(search.toLowerCase()));

  const save = async () => {
    if (!form.name) return;
    setSaving(true); setSaveError("");
    try {
      if (modal === "edit" && selected?.supplier?.id) {
        await api.patch(`/api/v1/procurement/suppliers/${selected.supplier.id}`, form);
      } else {
        await api.post("/api/v1/procurement/suppliers", form);
      }
      setModal(null); setForm(FORM_KOSONG); void load();
    } catch (e: unknown) {
      setSaveError(pesanError(e, "Gagal menyimpan"));
    } finally { setSaving(false); }
  };

  const openDetail = async (s: Supplier) => {
    const res = await api.get<DetailSupplier>(`/api/v1/procurement/suppliers/${s.id}`).catch(() => null);
    setSelected(res?.data ?? { supplier: s });
    setModal("detail");
  };

  const openEdit = (detail: DetailSupplier) => {
    const sup = detail.supplier;
    setForm({
      name: sup?.name ?? "", contact_person: sup?.contact_person ?? "",
      phone: sup?.phone ?? "", email: sup?.email ?? "",
      address: sup?.address ?? "", city: sup?.city ?? "",
      payment_terms: sup?.payment_terms ?? "cod", notes: "",
    });
    setModal("edit");
  };

  const belumLunas = (selected?.invoices ?? []).filter(i => i.status !== "paid");

  return (
    <div style={{ width: "100%", padding: "var(--pad-atas) var(--pad-x) var(--pad-bawah)", maxWidth: "var(--w-luas)", margin: "0 auto" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16, gap: 12, flexWrap: "wrap" }}>
        <div style={{ position: "relative", flex: 1, minWidth: 200 }}>
          <Search size={14} aria-hidden="true" style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: C.muted }} />
          <input
            value={search} onChange={e => setSearch(e.target.value)}
            aria-label="Cari supplier" placeholder="Cari supplier..."
            style={{ padding: "8px 12px 8px 32px", border: `1px solid ${C.border}`, borderRadius: 6, fontSize: 13, width: "100%", boxSizing: "border-box", background: C.surface, color: C.text }}
          />
        </div>
        <Btn onClick={() => { setForm(FORM_KOSONG); setModal("add"); }}><Plus size={14} aria-hidden="true" /> Tambah Supplier</Btn>
      </div>

      {loading ? <Memuat /> : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {filtered.length === 0 && (
            <Kosong
              judul={search ? "Tak ada supplier yang cocok" : "Belum ada supplier"}
              sebab={search
                ? `Pencarian "${search}" tak menyisakan satu pun dari ${suppliers.length} supplier. Datanya tidak hilang; kosongkan kotak pencarian.`
                : "Supplier adalah lawan bicara setiap Purchase Order. Tanpa satu pun tercatat, PO tak bisa dibuat karena tak ada yang dituju."}
            />
          )}
          {filtered.map(s => (
            <Card key={s.id} style={{ cursor: "pointer" }} onClick={() => void openDetail(s)}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8, flexWrap: "wrap" }}>
                <div>
                  <div style={{ fontWeight: 600, color: C.text, fontSize: 15 }}>{s.name}</div>
                  <div style={{ fontSize: 13, color: C.mid, marginTop: 4, display: "flex", gap: "var(--gap-bagian)", flexWrap: "wrap" }}>
                    {s.contact_person && <span style={{ display: "flex", alignItems: "center", gap: 4 }}><Phone size={11} aria-hidden="true" />{s.contact_person}</span>}
                    {s.phone && <span>{s.phone}</span>}
                    {s.city && <span style={{ display: "flex", alignItems: "center", gap: 4 }}><MapPin size={11} aria-hidden="true" />{s.city}</span>}
                  </div>
                </div>
                <div style={{ fontSize: "var(--t-kecil)", color: C.muted, textAlign: "right" }}>
                  {PAYMENT_TERMS.find(t => t.value === s.payment_terms)?.label ?? s.payment_terms}
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      {(modal === "add" || modal === "edit") && (
        <Modal title={modal === "edit" ? "Edit Supplier" : "Tambah Supplier"} onClose={() => { setModal(null); setSaveError(""); }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {saveError && <KotakGalat pesan={saveError} />}
            <Input label="Nama Toko / Perusahaan *" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Toko Bangunan Maju" />
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <Input label="Nama PIC" value={form.contact_person} onChange={e => setForm(f => ({ ...f, contact_person: e.target.value }))} />
              <Input label="No. HP / WA" value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} placeholder="08xxx" />
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <Input label="Email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} type="email" />
              <Input label="Kota" value={form.city} onChange={e => setForm(f => ({ ...f, city: e.target.value }))} />
            </div>
            <Input label="Alamat" value={form.address} onChange={e => setForm(f => ({ ...f, address: e.target.value }))} />
            <Select label="Syarat Pembayaran" value={form.payment_terms} onChange={e => setForm(f => ({ ...f, payment_terms: e.target.value }))}>
              {PAYMENT_TERMS.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
            </Select>
            <Input label="Catatan" value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} />
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 8 }}>
              <Btn variant="secondary" onClick={() => { setModal(null); setSaveError(""); }}>Batal</Btn>
              <Btn loading={saving} onClick={() => void save()}>Simpan</Btn>
            </div>
          </div>
        </Modal>
      )}

      {modal === "detail" && selected && (
        <Modal title={selected.supplier?.name ?? "Detail Supplier"} onClose={() => { setModal(null); setSelected(null); }} width={640}>
          <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 8 }}>
            <Btn variant="secondary" onClick={() => openEdit(selected)} style={{ fontSize: 12 }}>Edit Data Supplier</Btn>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, fontSize: 13 }}>
              {selected.supplier?.phone && <div><span style={{ color: C.muted }}>HP/WA: </span>{selected.supplier.phone}</div>}
              {selected.supplier?.email && <div><span style={{ color: C.muted }}>Email: </span>{selected.supplier.email}</div>}
              {selected.supplier?.city && <div><span style={{ color: C.muted }}>Kota: </span>{selected.supplier.city}</div>}
              {selected.supplier?.payment_terms && <div><span style={{ color: C.muted }}>Syarat: </span>{selected.supplier.payment_terms}</div>}
            </div>

            <div>
              <div style={{ fontWeight: 600, marginBottom: 8 }}>Hutang Belum Lunas</div>
              {belumLunas.length === 0
                ? <div style={{ fontSize: 13, color: C.muted }}>Tidak ada hutang outstanding</div>
                : belumLunas.map(inv => (
                  <div key={inv.id} style={{ display: "flex", justifyContent: "space-between", fontSize: 13, padding: "6px 0", borderBottom: `1px solid ${C.border}` }}>
                    <div>
                      <div>{inv.description ?? inv.invoice_number ?? "Invoice"}</div>
                      <div style={{ color: C.muted, fontSize: "var(--t-kecil)" }}>
                        {fmtDate(inv.invoice_date)}{inv.due_date ? ` · Jatuh tempo: ${fmtDate(inv.due_date)}` : ""}
                      </div>
                    </div>
                    <div style={{ textAlign: "right" }}>
                      <div style={{ color: C.danger, fontWeight: 600 }}>{fmt(inv.amount_due)}</div>
                      <Badge status={inv.status} />
                    </div>
                  </div>
                ))}
            </div>

            <div>
              <div style={{ fontWeight: 600, marginBottom: 8 }}>Riwayat Pembayaran</div>
              {(selected.payments ?? []).length === 0
                ? <div style={{ fontSize: 13, color: C.muted }}>Belum ada pembayaran</div>
                : (selected.payments ?? []).map(p => (
                  <div key={p.id} style={{ display: "flex", justifyContent: "space-between", fontSize: 13, padding: "6px 0", borderBottom: `1px solid ${C.border}` }}>
                    <div>
                      <div>{fmtDate(p.payment_date)} · {p.payment_method}</div>
                      {p.notes && <div style={{ color: C.muted, fontSize: "var(--t-kecil)" }}>{p.notes}</div>}
                    </div>
                    <div style={{ color: C.success, fontWeight: 600 }}>{fmt(p.amount)}</div>
                  </div>
                ))}
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
