"use client";

/**
 * CATAT INVOICE SUPPLIER — dan kenapa ia menolak berdiri sendiri.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * TIGA PENOLAKAN API YANG DIPINDAHKAN KE DEPAN
 * ══════════════════════════════════════════════════════════════════════════
 *
 * 1. **Goods Receipt WAJIB.** Bukan opsional, bukan "kalau ada":
 *    *"invoice supplier harus ter-link Goods Receipt (3-way match
 *    PO–GR–Invoice)"*. Invoice tanpa GR adalah tagihan atas barang yang tak
 *    pernah tercatat diterima — dan itulah bentuk tagihan fiktif yang paling
 *    sulit dibantah belakangan.
 *
 * 2. **Satu GR maksimal satu invoice.** Ditolak 409. Tanpa pagar itu, satu
 *    pengiriman bisa ditagih dua kali dengan dua nomor faktur berbeda.
 *
 * 3. **Nomor faktur tak boleh kembar per supplier.** Juga 409, dengan
 *    kalimat yang menyebut sebabnya: *"potensi tagihan dobel"*.
 *
 * Layar ini karena itu MULAI dari GR, bukan dari supplier: memilih GR
 * menentukan suppliernya, dan supplier yang tak cocok dengan GR ditolak API
 * (400). Membiarkan keduanya dipilih bebas berarti menyiapkan galat yang
 * baru muncul setelah seluruh form diisi.
 */

import { useEffect, useState } from "react";
import { api, makeAbortController } from "@/lib/api";
import { C } from "@/lib/warna-ui";
import {
  ModalDasar, TombolModal, KakiModal, gayaLabel, gayaInput, gayaGalat, pesanGalat,
} from "@/components/modal-dasar";

const rupiah = (n: number) => "Rp " + Math.round(n).toLocaleString("id-ID");

type GoodsReceipt = {
  id: string;
  gr_number: string;
  status: string;
  receipt_date: string;
  supplier?: { id?: string; name?: string } | null;
  project?: { id?: string; name?: string } | null;
};

export function ModalInvoiceSupplier({ onClose, onSukses }: {
  onClose: () => void; onSukses: () => void;
}) {
  const [gr, setGr] = useState<GoodsReceipt[]>([]);
  const [memuat, setMemuat] = useState(true);
  const [grId, setGrId] = useState("");
  const [nomor, setNomor] = useState("");
  const [tanggal, setTanggal] = useState(() => new Date().toISOString().slice(0, 10));
  const [jatuhTempo, setJatuhTempo] = useState("");
  const [total, setTotal] = useState("");
  const [uraian, setUraian] = useState("");
  const [kirim, setKirim] = useState(false);
  const [galat, setGalat] = useState<string | null>(null);

  useEffect(() => {
    const ac = makeAbortController();
    api.get<{ goods_receipts?: GoodsReceipt[]; data?: GoodsReceipt[] }>(
      "/api/v1/procurement/goods-receipts", { signal: ac.signal })
      .then((r) => setGr(r.data.goods_receipts ?? r.data.data ?? []))
      .catch((e) => {
        if (!ac.signal.aborted) setGalat(pesanGalat(e, "Gagal memuat daftar penerimaan barang."));
      })
      .finally(() => { if (!ac.signal.aborted) setMemuat(false); });
    return () => ac.abort();
  }, []);

  const dipilih = gr.find((g) => g.id === grId);
  const totalSah = total.trim() !== "" && Number(total) > 0;
  const tempoMundur = jatuhTempo !== "" && tanggal !== "" && jatuhTempo < tanggal;
  const lengkap = Boolean(grId) && Boolean(dipilih?.supplier?.id) && totalSah && !tempoMundur;

  async function simpan() {
    if (!lengkap || kirim || !dipilih?.supplier?.id) return;
    setKirim(true); setGalat(null);
    try {
      await api.post("/api/v1/procurement/supplier-invoices", {
        // Supplier DITURUNKAN dari GR, tak dipilih terpisah — API menolak
        // pasangan yang tak cocok (400), dan dua pemilih untuk satu fakta
        // hanya menyiapkan galat.
        supplier_id: dipilih.supplier.id,
        goods_receipt_id: grId,
        invoice_number: nomor.trim() || undefined,
        invoice_date: tanggal || undefined,
        due_date: jatuhTempo || undefined,
        total_amount: Number(total),
        description: uraian.trim() || undefined,
      });
      onSukses();
    } catch (e) {
      setGalat(pesanGalat(e, "Gagal mencatat invoice supplier."));
    } finally { setKirim(false); }
  }

  return (
    <ModalDasar judulId="judul-inv-sup" judul="Catat Invoice Supplier" lebar={560} onClose={onClose}>
      <div>
        <label htmlFor="is-gr" style={gayaLabel}>Penerimaan barang (GR)</label>
        <select id="is-gr" value={grId} style={gayaInput} disabled={memuat}
          onChange={(e) => setGrId(e.target.value)}>
          <option value="">{memuat ? "memuat…" : "— pilih penerimaan barang —"}</option>
          {gr.map((g) => (
            <option key={g.id} value={g.id}>
              {g.gr_number} — {g.supplier?.name ?? "supplier tak diketahui"}
              {g.project?.name ? ` · ${g.project.name}` : ""}
            </option>
          ))}
        </select>
        <p style={{ margin: "5px 0 0", fontSize: 11, color: C.muted, lineHeight: 1.5 }}>
          <strong>Wajib.</strong> Invoice tanpa penerimaan barang adalah tagihan atas
          barang yang tak pernah tercatat diterima — 3-way match PO–GR–Invoice.
          Satu GR hanya boleh ditagih sekali.
        </p>
      </div>

      {dipilih && (
        <p style={{ margin: 0, fontSize: 12, color: C.mid, lineHeight: 1.5 }}>
          Supplier <strong style={{ color: C.text }}>{dipilih.supplier?.name ?? "—"}</strong>
          {" "}diambil dari GR ini, tak dipilih terpisah.
          {!dipilih.supplier?.id && (
            <span style={{ color: "var(--danger)" }}> GR ini tak punya supplier —
              invoicenya tak bisa dicatat.</span>
          )}
        </p>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
        <div>
          <label htmlFor="is-nomor" style={gayaLabel}>Nomor faktur</label>
          <input id="is-nomor" value={nomor} onChange={(e) => setNomor(e.target.value)}
            placeholder="opsional" style={gayaInput} />
          <p style={{ margin: "5px 0 0", fontSize: 11, color: C.muted, lineHeight: 1.5 }}>
            Kalau diisi, tak boleh sama dengan faktur lain dari supplier ini —
            nomor kembar adalah tanda tagihan dobel.
          </p>
        </div>
        <div>
          <label htmlFor="is-total" style={gayaLabel}>Total tagihan (Rp)</label>
          <input id="is-total" type="number" min={0} step="1" value={total}
            onChange={(e) => setTotal(e.target.value)} style={gayaInput} />
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
        <div>
          <label htmlFor="is-tanggal" style={gayaLabel}>Tanggal faktur</label>
          <input id="is-tanggal" type="date" value={tanggal}
            onChange={(e) => setTanggal(e.target.value)} style={gayaInput} />
        </div>
        <div>
          <label htmlFor="is-tempo" style={gayaLabel}>Jatuh tempo</label>
          <input id="is-tempo" type="date" value={jatuhTempo}
            onChange={(e) => setJatuhTempo(e.target.value)} style={gayaInput} />
        </div>
      </div>

      {tempoMundur && (
        <p role="alert" style={{ margin: 0, fontSize: 12, color: "var(--danger)", lineHeight: 1.5 }}>
          Jatuh tempo lebih awal daripada tanggal fakturnya — tagihan ini akan
          langsung terhitung jatuh tempo begitu tersimpan.
        </p>
      )}

      <div>
        <label htmlFor="is-uraian" style={gayaLabel}>Uraian</label>
        <input id="is-uraian" value={uraian} onChange={(e) => setUraian(e.target.value)}
          style={gayaInput} />
      </div>

      {totalSah && (
        <p style={{ margin: 0, fontSize: 12, color: C.mid }}>
          Akan menambah hutang <strong style={{ color: C.text }}>{rupiah(Number(total))}</strong>.
        </p>
      )}

      {galat && <div role="alert" style={gayaGalat}>{galat}</div>}

      <KakiModal>
        <TombolModal onClick={onClose}>Batal</TombolModal>
        <TombolModal utama onClick={simpan} mati={!lengkap || kirim}>
          {kirim ? "Menyimpan…" : "Catat invoice"}
        </TombolModal>
      </KakiModal>
    </ModalDasar>
  );
}
