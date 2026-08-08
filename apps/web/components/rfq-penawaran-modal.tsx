"use client";

// ============================================================================
// CATAT PENAWARAN VENDOR — jalan masuk yang selama ini tak ada.
//
// ══════════════════════════════════════════════════════════════════════════
// KENAPA KOMPONEN INI ADA
// ══════════════════════════════════════════════════════════════════════════
//
// Diukur 2026-08-08, sehari sesudah modul RFQ dibangun: endpoint
// `POST /api/v1/rfq/:id/penawaran` hidup dan ber-test, tapi **UI tak punya
// satu pun tombol yang memanggilnya**. Halaman RFQ menyuruh
// *"Buat RFQ untuk meminta penawaran ke beberapa vendor sekaligus"*, lalu
// berhenti selamanya di *"Belum ada penawaran masuk"*.
//
// Rantainya: buat RFQ ✅ → catat penawaran ❌ → bandingkan ✅ → putuskan ✅.
// Satu mata rantai putus membuat tiga lainnya tak berguna.
//
// Ini kelas cacat yang sama dengan yang saya temukan di RFQ kemarin (kolom
// `po_id` yang dibaca tapi tak pernah ditulis): tiap bagian ada, hanya
// sambungannya yang tidak. Dan ia lolos justru karena tiap bagiannya
// ber-test sendiri-sendiri.
//
// ── Kenapa satu vendor per kali, bukan tabel semua vendor sekaligus
//
// Penawaran datang SATU VENDOR PADA SATU WAKTU — lewat WhatsApp, email, atau
// kertas. Staf pengadaan membuka penawaran vendor A, lalu mengetiknya. Tabel
// yang menuntut seluruh vendor diisi sekaligus memaksa ia menunggu semuanya
// masuk, dan yang ditunggu paling lama menahan yang sudah datang.
//
// Yang dipilih sekali di atas: vendornya. Yang diulang per baris: materialnya.
// Itu bentuk yang sama dengan surat penawaran yang benar-benar ia pegang.
//
// ── "Tidak menawar" adalah keadaan yang HARUS bisa dicatat
//
// Vendor sering menawar sebagian saja. Tanpa penanda ini, satu-satunya cara
// mencatatnya adalah mengosongkan harga — dan harga 0 memenangkan
// perbandingan sebagai "termurah". `lib/tabulasi-penawaran.ts` sudah
// membedakan keduanya; form ini yang memberi jalan menyatakannya.
// ============================================================================

import { useEffect, useMemo, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { api, makeAbortController } from "@/lib/api";
import { C } from "@/lib/warna-ui";
import { DialogBersama } from "@/components/dialog-bersama";

type Supplier = { id: string; name: string };
type Material = { id: string; name: string; unit: string | null };

/** Satu baris material dalam surat penawaran yang sedang diketik. */
type Baris = {
  /** Kunci lokal untuk React — BUKAN id dari server. */
  kunci: string;
  material_id: string;
  qty: string;
  harga_satuan: string;
  tidak_menawar: boolean;
};

const barisKosong = (): Baris => ({
  // `crypto.randomUUID` ada di semua peramban target; ia hanya kunci render.
  kunci: crypto.randomUUID(),
  material_id: "",
  qty: "",
  harga_satuan: "",
  tidak_menawar: false,
});

export interface RfqPenawaranModalProps {
  rfqId: string;
  nomorRfq: string;
  terbuka: boolean;
  onTutup: () => void;
  /** Dipanggil sesudah penawaran tersimpan — pemanggil memuat ulang tabulasi. */
  onTersimpan: () => void;
}

export function RfqPenawaranModal({
  rfqId, nomorRfq, terbuka, onTutup, onTersimpan,
}: RfqPenawaranModalProps) {
  const [supplier, setSupplier] = useState<Supplier[]>([]);
  const [material, setMaterial] = useState<Material[]>([]);
  const [vendorId, setVendorId] = useState("");
  const [waktuKirim, setWaktuKirim] = useState("");
  const [baris, setBaris] = useState<Baris[]>([barisKosong()]);
  const [menyimpan, setMenyimpan] = useState(false);
  const [galat, setGalat] = useState<string | null>(null);

  // Daftar pilihan dimuat saat dialog DIBUKA, bukan saat halaman dimuat:
  // sebagian besar kunjungan ke halaman RFQ tak membuka form ini sama sekali,
  // dan dua permintaan yang tak terpakai memperlambat halaman untuk semua.
  useEffect(() => {
    if (!terbuka) return;
    const ac = makeAbortController();

    api.get<{ suppliers?: Supplier[]; data?: Supplier[] }>(
      "/api/v1/procurement/suppliers?limit=200", { signal: ac.signal })
      .then((r) => setSupplier(r.data.suppliers ?? r.data.data ?? []))
      .catch((e) => { if (e?.name !== "CanceledError") setGalat("Gagal memuat daftar vendor"); });

    api.get<{ materials?: Material[]; data?: Material[] }>(
      "/api/v1/procurement/materials?limit=300", { signal: ac.signal })
      .then((r) => setMaterial(r.data.materials ?? r.data.data ?? []))
      .catch((e) => { if (e?.name !== "CanceledError") setGalat("Gagal memuat daftar material"); });

    return () => ac.abort();
  }, [terbuka]);

  // Dikosongkan saat ditutup supaya penawaran vendor berikutnya tak mewarisi
  // isian vendor sebelumnya — kesalahan yang tak terlihat sampai angkanya
  // sudah masuk perbandingan.
  useEffect(() => {
    if (terbuka) return;
    setVendorId(""); setWaktuKirim(""); setBaris([barisKosong()]); setGalat(null);
  }, [terbuka]);

  const ubah = (kunci: string, patch: Partial<Baris>) =>
    setBaris((b) => b.map((x) => (x.kunci === kunci ? { ...x, ...patch } : x)));

  const hapus = (kunci: string) =>
    setBaris((b) => (b.length === 1 ? b : b.filter((x) => x.kunci !== kunci)));

  const namaMaterial = useMemo(
    () => Object.fromEntries(material.map((m) => [m.id, m])), [material]);

  /**
   * Baris yang siap dikirim, beserta alasan bila belum.
   *
   * Divalidasi DI SINI dan bukan hanya mengandalkan 400 dari server: server
   * menolak satu baris pada satu waktu, dan pemakai yang mengetik lima baris
   * lalu ditolak di baris ketiga kehilangan konteks. Server tetap menjadi
   * penentu — ini hanya membuat kesalahannya terlihat lebih awal.
   */
  const masalah = useMemo(() => {
    if (!vendorId) return "Pilih vendor yang mengirim penawaran ini";
    const terisi = baris.filter((b) => b.material_id);
    if (terisi.length === 0) return "Tambahkan minimal satu material";

    const ganda = terisi.map((b) => b.material_id);
    if (new Set(ganda).size !== ganda.length) {
      return "Ada material yang sama dua kali. Satu vendor menawar satu harga per material.";
    }
    for (const b of terisi) {
      const nama = namaMaterial[b.material_id]?.name ?? "material";
      if (!b.qty || Number(b.qty) <= 0) return `Qty ${nama} harus lebih dari 0`;
      if (!b.tidak_menawar && (!b.harga_satuan || Number(b.harga_satuan) <= 0)) {
        return `Isi harga ${nama}, atau tandai "tidak menawar"`;
      }
    }
    return null;
  }, [vendorId, baris, namaMaterial]);

  async function simpan() {
    if (masalah) { setGalat(masalah); return; }
    setMenyimpan(true);
    setGalat(null);

    const terisi = baris.filter((b) => b.material_id);
    try {
      // Berurutan, bukan Promise.all: endpointnya menerima SATU baris per
      // panggilan, dan mengirim lima sekaligus membuat pesan galat baris
      // ketiga bercampur dengan keberhasilan yang lain. Berurutan juga berarti
      // yang sudah tersimpan tetap tersimpan saat satu baris ditolak.
      for (const b of terisi) {
        await api.post(`/api/v1/rfq/${rfqId}/penawaran`, {
          supplier_id: vendorId,
          material_id: b.material_id,
          qty: Number(b.qty),
          harga_satuan: b.tidak_menawar ? 0 : Number(b.harga_satuan),
          tidak_menawar: b.tidak_menawar,
          waktu_kirim_hari: waktuKirim ? Number(waktuKirim) : undefined,
        });
      }
      onTersimpan();
      onTutup();
    } catch (e) {
      const m = (e as { response?: { data?: { error?: string } } })?.response?.data?.error;
      setGalat(m ?? "Gagal menyimpan penawaran");
    } finally {
      setMenyimpan(false);
    }
  }

  const isian: React.CSSProperties = {
    padding: "7px 9px", borderRadius: 6, border: `1px solid ${C.border}`,
    background: "var(--surface)", color: C.text, fontSize: 13,
    fontFamily: "inherit", width: "100%", minHeight: 38,
  };
  const label: React.CSSProperties = {
    fontSize: 11, fontWeight: 700, color: C.muted,
    textTransform: "uppercase", letterSpacing: "0.05em",
  };

  return (
    <DialogBersama
      terbuka={terbuka}
      onTutup={onTutup}
      judul={`Catat penawaran untuk ${nomorRfq}`}
      keterangan="Satu surat penawaran, satu vendor. Materialnya boleh beberapa baris."
      lebar={720}
      kaki={
        <>
          <button type="button" onClick={onTutup} style={{
            padding: "9px 16px", borderRadius: 6, fontSize: 13, fontWeight: 600,
            border: `1px solid ${C.border}`, background: "var(--surface)",
            color: C.text, cursor: "pointer", minHeight: 40,
          }}>
            Batal
          </button>
          <button type="button" onClick={simpan} disabled={menyimpan}
            style={{
              padding: "9px 18px", borderRadius: 6, fontSize: 13, fontWeight: 700,
              border: "none",
              background: menyimpan ? C.border : C.navy,
              color: menyimpan ? C.mid : "var(--on-navy)",
              cursor: menyimpan ? "not-allowed" : "pointer", minHeight: 40,
            }}>
            {menyimpan ? "Menyimpan…" : "Simpan penawaran"}
          </button>
        </>
      }
    >
      {galat && (
        <div role="alert" style={{
          marginBottom: 14, padding: "9px 12px", borderRadius: 8, fontSize: 12.5,
          border: `1px solid ${C.redBorder}`, background: C.redBg, color: C.red,
        }}>
          {galat}
        </div>
      )}

      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 18 }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 4, minWidth: 260, flex: 1 }}>
          <label htmlFor="pen-vendor" style={label}>Vendor</label>
          <select id="pen-vendor" value={vendorId} style={isian}
            onChange={(e) => { setVendorId(e.target.value); setGalat(null); }}>
            <option value="">— pilih vendor —</option>
            {supplier.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 4, width: 170 }}>
          <label htmlFor="pen-kirim" style={label}>Waktu kirim (hari)</label>
          <input id="pen-kirim" type="number" min={0} inputMode="numeric"
            value={waktuKirim} onChange={(e) => setWaktuKirim(e.target.value)}
            placeholder="mis. 3" style={isian} />
        </div>
      </div>

      {/* Baris material. Tabel HTML, bukan grid div: pembaca layar
          mengumumkan "kolom Harga, baris 3", dan itu satu-satunya cara orang
          tahu di mana ia berada saat mengetik angka. */}
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
        <caption style={{
          captionSide: "top", textAlign: "left", ...label, paddingBottom: 6,
        }}>
          Material yang ditawar
        </caption>
        <thead>
          <tr>
            <th scope="col" style={{ ...label, textAlign: "left", padding: "0 6px 6px 0" }}>Material</th>
            <th scope="col" style={{ ...label, textAlign: "left", padding: "0 6px 6px", width: 92 }}>Qty</th>
            <th scope="col" style={{ ...label, textAlign: "left", padding: "0 6px 6px", width: 132 }}>Harga satuan</th>
            <th scope="col" style={{ ...label, textAlign: "left", padding: "0 6px 6px", width: 96 }}>Tak menawar</th>
            <th style={{ width: 40 }}><span className="sr-only">Hapus baris</span></th>
          </tr>
        </thead>
        <tbody>
          {baris.map((b, i) => {
            const unit = namaMaterial[b.material_id]?.unit;
            return (
              <tr key={b.kunci}>
                <td style={{ padding: "3px 6px 3px 0" }}>
                  <select
                    value={b.material_id} style={isian}
                    aria-label={`Material baris ${i + 1}`}
                    onChange={(e) => { ubah(b.kunci, { material_id: e.target.value }); setGalat(null); }}
                  >
                    <option value="">— pilih material —</option>
                    {material.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.name}{m.unit ? ` (${m.unit})` : ""}
                      </option>
                    ))}
                  </select>
                </td>
                <td style={{ padding: "3px 6px" }}>
                  <input
                    type="number" min={0} step="any" inputMode="decimal"
                    value={b.qty} style={isian}
                    aria-label={`Qty baris ${i + 1}${unit ? ` dalam ${unit}` : ""}`}
                    onChange={(e) => { ubah(b.kunci, { qty: e.target.value }); setGalat(null); }}
                  />
                </td>
                <td style={{ padding: "3px 6px" }}>
                  <input
                    type="number" min={0} step="any" inputMode="decimal"
                    value={b.tidak_menawar ? "" : b.harga_satuan}
                    disabled={b.tidak_menawar}
                    style={{ ...isian, opacity: b.tidak_menawar ? 0.5 : 1 }}
                    aria-label={`Harga satuan baris ${i + 1}`}
                    onChange={(e) => { ubah(b.kunci, { harga_satuan: e.target.value }); setGalat(null); }}
                  />
                </td>
                <td style={{ padding: "3px 6px", textAlign: "center" }}>
                  <input
                    type="checkbox" checked={b.tidak_menawar}
                    aria-label={`Vendor tidak menawar material baris ${i + 1}`}
                    style={{ width: 18, height: 18, cursor: "pointer" }}
                    onChange={(e) => {
                      // Harga dikosongkan saat ditandai: menyimpan angka yang
                      // tak akan dipakai membuat orang mengira ia tersimpan.
                      ubah(b.kunci, { tidak_menawar: e.target.checked, harga_satuan: "" });
                      setGalat(null);
                    }}
                  />
                </td>
                <td style={{ padding: "3px 0" }}>
                  <button
                    type="button" onClick={() => hapus(b.kunci)}
                    disabled={baris.length === 1}
                    aria-label={`Hapus baris ${i + 1}`}
                    style={{
                      minWidth: 36, minHeight: 36, display: "inline-flex",
                      alignItems: "center", justifyContent: "center",
                      border: "none", background: "none",
                      color: baris.length === 1 ? C.border : C.mid,
                      cursor: baris.length === 1 ? "not-allowed" : "pointer",
                    }}
                  >
                    <Trash2 size={15} aria-hidden="true" />
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      <button
        type="button" onClick={() => setBaris((b) => [...b, barisKosong()])}
        style={{
          marginTop: 10, padding: "8px 12px", borderRadius: 6, fontSize: 12.5,
          fontWeight: 600, border: `1px dashed ${C.border}`,
          background: "none", color: C.mid, cursor: "pointer",
          display: "inline-flex", alignItems: "center", gap: 6, minHeight: 38,
        }}
      >
        <Plus size={14} aria-hidden="true" /> Tambah material
      </button>
    </DialogBersama>
  );
}
