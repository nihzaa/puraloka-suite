"use client";

/**
 * MODAL — buat Purchase Order, dan kirim PO ke vendor (Modul 9b).
 *
 * Keduanya dikumpulkan di sini karena sama-sama berurusan dengan PO dan
 * sama-sama dipanggil dari halaman Pesanan. Memisahkannya jadi dua berkas
 * hanya menambah lompatan tanpa menambah kejelasan.
 */

import { useEffect, useState } from "react";
import { History, Plus, Send, X } from "lucide-react";

import { api } from "@/lib/api";
import { C } from "@/lib/warna-ui";
import { useUnits } from "@/lib/use-units";
import { Btn, Input, KotakGalat, Modal, Select, fmt, pesanError } from "./ui";
import type { LogKirimPo, PesanKirimPo, PoRingkas } from "./tipe";

interface Proyek { id: string; name: string }
interface Supplier { id: string; name: string }
interface Material { id: string; name: string; unit: string; unit_price?: number | null }
interface MrApproved {
  id: string; mr_number: string;
  project?: { id?: string; name?: string } | null;
  items?: Array<{ qty_requested: number; unit: string; unit_price_est?: number | null; material?: { id?: string } | null }>;
}

interface BarisItem { material_id: string; qty: string; unit: string; unit_price: string }
const BARIS_KOSONG: BarisItem = { material_id: "", qty: "", unit: "", unit_price: "" };

// ═══════════════════════════════════════════════════════════════════════════
// BUAT PO
// ═══════════════════════════════════════════════════════════════════════════

export function CreatePoModal({ onClose, onSuccess }: { onClose: () => void; onSuccess: () => void }) {
  const [projects, setProjects] = useState<Proyek[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [materials, setMaterials] = useState<Material[]>([]);
  const [approvedMrs, setApprovedMrs] = useState<MrApproved[]>([]);
  const [form, setForm] = useState({
    project_id: "", supplier_id: "", mr_id: "",
    expected_delivery_date: "", delivery_address: "", payment_terms: "", notes: "",
  });
  const [items, setItems] = useState<BarisItem[]>([{ ...BARIS_KOSONG }]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const { units } = useUnits(); // sumber tunggal satuan (master `units`)

  useEffect(() => {
    void Promise.all([
      api.get<{ projects: Proyek[] }>("/api/v1/projects").catch(() => null),
      api.get<{ suppliers: Supplier[] }>("/api/v1/procurement/suppliers").catch(() => null),
      api.get<{ materials: Material[] }>("/api/v1/procurement/materials", { params: { is_active: true } }).catch(() => null),
      api.get<{ material_requests: MrApproved[] }>("/api/v1/procurement/material-requests", { params: { status: "approved" } }).catch(() => null),
    ]).then(([pRes, sRes, mRes, mrRes]) => {
      setProjects(pRes?.data?.projects ?? []);
      setSuppliers(sRes?.data?.suppliers ?? []);
      setMaterials(mRes?.data?.materials ?? []);
      setApprovedMrs(mrRes?.data?.material_requests ?? []);
    });
  }, []);

  const loadFromMr = (mrId: string) => {
    const mr = approvedMrs.find(m => m.id === mrId);
    if (!mr) return;
    setForm(f => ({ ...f, mr_id: mrId, project_id: mr.project?.id ?? f.project_id }));
    if ((mr.items ?? []).length > 0) {
      setItems((mr.items ?? []).map(i => ({
        material_id: i.material?.id ?? "",
        qty: String(i.qty_requested),
        unit: i.unit,
        unit_price: i.unit_price_est ? String(i.unit_price_est) : "",
      })));
    }
  };

  const addItem = () => setItems(i => [...i, { ...BARIS_KOSONG }]);
  const removeItem = (idx: number) => setItems(i => i.filter((_, j) => j !== idx));
  const updateItem = (idx: number, field: keyof BarisItem, val: string) =>
    setItems(i => i.map((it, j) => j === idx ? { ...it, [field]: val } : it));

  const pilihMaterial = (idx: number, materialId: string) => {
    const mat = materials.find(m => m.id === materialId);
    setItems(prev => prev.map((it, j) => j === idx
      ? {
        ...it, material_id: materialId,
        unit: mat?.unit ?? it.unit,
        unit_price: mat?.unit_price ? String(mat.unit_price) : it.unit_price,
      }
      : it));
  };

  const total = items.reduce((s, i) => s + (Number(i.qty) * Number(i.unit_price)), 0);

  const handleSubmit = async () => {
    if (!form.project_id || !form.supplier_id) { setError("Proyek dan Supplier wajib diisi"); return; }
    const validItems = items.filter(i => i.material_id && Number(i.qty) > 0 && i.unit && Number(i.unit_price) >= 0);
    if (validItems.length === 0) { setError("Tambahkan minimal 1 item PO yang valid"); return; }
    setSaving(true); setError("");
    try {
      await api.post("/api/v1/procurement/purchase-orders", {
        project_id: form.project_id,
        supplier_id: form.supplier_id,
        mr_id: form.mr_id || null,
        expected_delivery_date: form.expected_delivery_date || null,
        delivery_address: form.delivery_address || null,
        payment_terms: form.payment_terms || null,
        notes: form.notes || null,
        items: validItems.map(i => ({
          material_id: i.material_id, qty_ordered: Number(i.qty),
          unit: i.unit, unit_price: Number(i.unit_price),
        })),
      });
      onSuccess();
    } catch (e: unknown) {
      setError(pesanError(e, "Gagal membuat PO"));
    } finally { setSaving(false); }
  };

  return (
    <Modal title="Buat Purchase Order" onClose={onClose} width={720}>
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {error && <KotakGalat pesan={error} />}

        {approvedMrs.length > 0 && (
          <div style={{ background: C.infoBg, border: `1px solid ${C.info}`, borderRadius: 6, padding: "8px 12px" }}>
            <Select
              label="BUAT DARI MR (Opsional) — Item akan terisi otomatis"
              value={form.mr_id}
              onChange={e => { setForm(f => ({ ...f, mr_id: e.target.value })); if (e.target.value) loadFromMr(e.target.value); }}
            >
              <option value="">— Buat PO manual tanpa MR —</option>
              {approvedMrs.map(m => <option key={m.id} value={m.id}>{m.mr_number} — {m.project?.name}</option>)}
            </Select>
          </div>
        )}

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <Select label="Proyek *" value={form.project_id} onChange={e => setForm(f => ({ ...f, project_id: e.target.value }))}>
            <option value="">— Pilih Proyek —</option>
            {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </Select>
          <Select label="Supplier *" value={form.supplier_id} onChange={e => setForm(f => ({ ...f, supplier_id: e.target.value }))}>
            <option value="">— Pilih Supplier —</option>
            {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </Select>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <Input label="Estimasi Tiba" value={form.expected_delivery_date} onChange={e => setForm(f => ({ ...f, expected_delivery_date: e.target.value }))} type="date" />
          <Input label="Syarat Pembayaran" value={form.payment_terms} onChange={e => setForm(f => ({ ...f, payment_terms: e.target.value }))} placeholder="cth: NET 14, COD..." />
        </div>
        <Input label="Alamat Pengiriman" value={form.delivery_address} onChange={e => setForm(f => ({ ...f, delivery_address: e.target.value }))} placeholder="Sama dengan lokasi proyek jika kosong" />
        <Input label="Catatan" value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} />

        <div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
            <span style={{ fontSize: 13, fontWeight: 600 }}>Item PO *</span>
            <Btn variant="secondary" onClick={addItem} style={{ fontSize: 12 }}>
              <Plus size={12} aria-hidden="true" /> Tambah Item
            </Btn>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {items.map((item, idx) => (
              <div key={idx} style={{ background: C.bg, borderRadius: 10, padding: "8px 12px", border: `1px solid ${C.border}` }}>
                <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr 1fr auto", gap: 8, alignItems: "end" }}>
                  <Select label="Material *" value={item.material_id} onChange={e => pilihMaterial(idx, e.target.value)}>
                    <option value="">— Pilih —</option>
                    {materials.map(m => <option key={m.id} value={m.id}>{m.name} ({m.unit})</option>)}
                  </Select>
                  <Input label="Qty *" type="number" value={item.qty} onChange={e => updateItem(idx, "qty", e.target.value)} />
                  <Select label="Satuan *" value={item.unit} onChange={e => updateItem(idx, "unit", e.target.value)}>
                    <option value="">—</option>
                    {units.map(u => <option key={u.code} value={u.symbol}>{u.symbol}</option>)}
                  </Select>
                  <Input label="Harga/Unit (Rp) *" type="number" value={item.unit_price} onChange={e => updateItem(idx, "unit_price", e.target.value)} />
                  <button
                    aria-label={`Hapus item baris ${idx + 1}`}
                    onClick={() => removeItem(idx)} disabled={items.length <= 1}
                    style={{ background: "none", border: "none", cursor: items.length <= 1 ? "not-allowed" : "pointer", color: C.danger, padding: 4, opacity: items.length <= 1 ? 0.3 : 1 }}
                  >
                    <X size={16} aria-hidden="true" />
                  </button>
                </div>
                {item.qty && item.unit_price && (
                  <div style={{ textAlign: "right", fontSize: 12, color: C.mid, marginTop: 6 }}>
                    Subtotal: <strong>{fmt(Number(item.qty) * Number(item.unit_price))}</strong>
                  </div>
                )}
              </div>
            ))}
          </div>
          {total > 0 && (
            <div style={{ textAlign: "right", marginTop: 12, fontSize: 15, fontWeight: 700, color: C.navy }}>
              Total PO: {fmt(total)}
            </div>
          )}
        </div>

        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 4 }}>
          <Btn variant="secondary" onClick={onClose}>Batal</Btn>
          <Btn loading={saving} onClick={() => void handleSubmit()}>Buat Purchase Order</Btn>
        </div>
      </div>
    </Modal>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// KIRIM PO KE VENDOR — Modul 9b (ROADMAP #12)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Kirim PO ke vendor, dengan jejak.
 *
 * Versi lama: satu `<a href="wa.me/...">` yang merakit teks di UI dan tak
 * memanggil server sama sekali. Akibatnya `whatsapp_sent_at` terisi pada NOL
 * dari 4 PO — pertanyaan "PO ini sudah dikirim belum, kapan, ke siapa" tak
 * punya jawaban selain ingatan orang.
 *
 * Sekarang: pratinjau pesan (disusun server, memuat rincian item) → buka
 * WhatsApp → catat pengiriman. Pratinjau bukan hiasan: teks ini keluar ke
 * pihak ketiga, dan yang mengirim berhak melihatnya sebelum terkirim.
 */
export function KirimPoModal({ po, onClose, onSuccess }: {
  po: PoRingkas; onClose: () => void; onSuccess: () => void;
}) {
  const [data, setData] = useState<PesanKirimPo | null>(null);
  const [riwayat, setRiwayat] = useState<LogKirimPo[]>([]);
  const [memuat, setMemuat] = useState(true);
  const [mengirim, setMengirim] = useState(false);
  const [err, setErr] = useState("");

  useEffect(() => {
    let batal = false;
    void Promise.all([
      api.get<PesanKirimPo>(`/api/v1/procurement/purchase-orders/${po.id}/delivery-message`),
      api.get<{ data: LogKirimPo[] }>(`/api/v1/procurement/purchase-orders/${po.id}/delivery-log`),
    ])
      .then(([m, l]) => {
        if (batal) return;
        setData(m.data); setRiwayat(l.data.data ?? []);
      })
      .catch((e: unknown) => { if (!batal) setErr(pesanError(e, "Gagal memuat pesan")); })
      .finally(() => { if (!batal) setMemuat(false); });
    return () => { batal = true; };
  }, [po.id]);

  async function kirim(channel: "whatsapp" | "email" | "manual") {
    setMengirim(true); setErr("");
    try {
      // WhatsApp dibuka LEBIH DULU, pencatatan menyusul. Kalau urutannya
      // dibalik dan pembukaan gagal (popup diblokir), jejaknya sudah terlanjur
      // mengklaim terkirim.
      if (channel === "whatsapp" && data?.wa_url) window.open(data.wa_url, "_blank", "noopener");
      await api.post(`/api/v1/procurement/purchase-orders/${po.id}/delivery-log`, {
        channel,
        recipient: channel === "email" ? data?.email_tujuan : po.supplier?.phone,
      });
      onSuccess();
    } catch (e: unknown) {
      setErr(pesanError(e, "Gagal mencatat pengiriman"));
    } finally { setMengirim(false); }
  }

  return (
    <Modal title={`Kirim ${po.po_number} ke Vendor`} onClose={onClose} width={620}>
      {memuat && <div style={{ padding: 20, fontSize: 13, color: "var(--text-muted)" }}>Memuat pesan…</div>}
      {err && <div style={{ marginBottom: 12 }}><KotakGalat pesan={err} /></div>}

      {data && !memuat && (
        <>
          <div style={{ fontSize: 12, fontWeight: 600, color: "var(--text-muted)", marginBottom: 6 }}>
            Pratinjau pesan
          </div>
          <pre style={{
            margin: 0, padding: 12, background: "var(--bg)", border: "1px solid var(--border)",
            borderRadius: 6, fontSize: 12, lineHeight: 1.55, whiteSpace: "pre-wrap",
            fontFamily: "inherit", maxHeight: 260, overflowY: "auto",
          }}>{data.pesan}</pre>

          {data.sudah_dikirim?.whatsapp_at && (
            <div style={{ marginTop: 10, fontSize: 12, color: "var(--warning)" }}>
              Sudah pernah dikirim via WhatsApp pada{" "}
              {new Date(data.sudah_dikirim.whatsapp_at).toLocaleString("id-ID")}. Mengirim
              ulang akan menambah catatan baru, bukan menimpa yang lama.
            </div>
          )}

          <div style={{ display: "flex", gap: 8, marginTop: 14, flexWrap: "wrap" }}>
            {/* Tombol WA disembunyikan kalau nomornya tak sah — tautan ke nomor
                ngawur lebih buruk daripada tombol yang tak muncul. */}
            {data.wa_url ? (
              <Btn onClick={() => void kirim("whatsapp")} loading={mengirim}>
                <Send size={14} aria-hidden="true" /> Buka WhatsApp &amp; catat
              </Btn>
            ) : (
              <span style={{ fontSize: 12, color: "var(--danger)" }}>
                Nomor telepon supplier tidak valid — perbaiki di menu Supplier.
              </span>
            )}
            <Btn variant="secondary" onClick={() => void kirim("manual")} loading={mengirim}>
              Catat sudah dikirim manual
            </Btn>
          </div>

          {riwayat.length > 0 && (
            <div style={{ marginTop: 18, borderTop: "1px solid var(--border)", paddingTop: 12 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, fontWeight: 600, color: "var(--text-muted)", marginBottom: 8 }}>
                <History size={13} aria-hidden="true" /> Riwayat pengiriman ({riwayat.length})
              </div>
              {riwayat.map(r => (
                <div key={r.id} style={{ fontSize: 12, color: "var(--text-primary)", padding: "5px 0", borderBottom: "1px solid var(--surface-hover)" }}>
                  <strong>{r.channel}</strong> · {new Date(r.sent_at).toLocaleString("id-ID")}
                  {r.sender?.name && ` · oleh ${r.sender.name}`}
                  {r.recipient && <span style={{ color: "var(--text-muted)" }}> · {r.recipient}</span>}
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </Modal>
  );
}
