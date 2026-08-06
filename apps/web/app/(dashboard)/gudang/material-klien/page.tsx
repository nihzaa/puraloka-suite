"use client";

/**
 * MATERIAL MILIK KLIEN — free issue (F5 PEMBEDA)
 *
 * ── Yang dijawab halaman ini
 *
 * "Keramik 200 m² dipasok owner, bukan kita beli — kenapa laporan bilang kita
 * memborong 200% melebihi RAB?"
 *
 * Pada kontrak konstruksi, owner sering memasok sendiri material tertentu
 * (keramik, sanitair, lift) dan kontraktor hanya memasangnya. Sebelum layar
 * ini, barang itu hanya bisa masuk lewat penerimaan pembelian — dan di
 * `/gudang/rekonsiliasi` ia menggelembungkan penyebut susut SEKALIGUS membuat
 * perusahaan tampak memborong material yang tak pernah ia beli sesen pun.
 *
 * ── Kenapa tak ada kolom harga
 *
 * Material owner tak pernah kita bayar. Menyediakan kolom harganya mengundang
 * seseorang mengisinya, dan angka itu akan mengalir ke laporan biaya sebagai
 * pengeluaran yang tak pernah terjadi.
 */

import { useEffect, useMemo, useState } from "react";
import { PackageSearch, HandCoins, RefreshCw } from "lucide-react";
import { api, makeAbortController } from "@/lib/api";
import { C } from "@/lib/warna-ui";
import { Kosong } from "@/components/ui-dasar";

type Proyek = { id: string; name: string };
type Material = { id: string; name: string; unit: string | null };

type Penerimaan = {
  id: string;
  qty: number | string;
  tanggal: string;
  pemasok: string | null;
  nomor_surat_jalan: string | null;
  catatan: string | null;
  material: Material | null;
  proyek: Proyek | null;
  pembuat: { id: string; name: string } | null;
};

const angka = (n: number | string) =>
  new Intl.NumberFormat("id-ID", { maximumFractionDigits: 2 }).format(Number(n));

const tanggalTerbaca = (iso: string) =>
  new Date(iso + "T00:00:00").toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" });

export default function MaterialKlienPage() {
  const [proyek, setProyek] = useState<Proyek[]>([]);
  const [material, setMaterial] = useState<Material[]>([]);
  const [penerimaan, setPenerimaan] = useState<Penerimaan[]>([]);
  const [memuat, setMemuat] = useState(true);
  const [galat, setGalat] = useState<string | null>(null);
  const [sukses, setSukses] = useState<string | null>(null);
  const [mengirim, setMengirim] = useState(false);
  const [muatUlangKe, setMuatUlangKe] = useState(0);

  const [proyekId, setProyekId] = useState("");
  const [materialId, setMaterialId] = useState("");
  const [qty, setQty] = useState("");
  const [pemasok, setPemasok] = useState("");
  const [suratJalan, setSuratJalan] = useState("");

  useEffect(() => {
    const ac = makeAbortController();
    Promise.all([
      api.get<{ projects: Proyek[] }>("/api/v1/projects", { signal: ac.signal }),
      api.get<{ materials: Material[] }>("/api/v1/procurement/materials", { signal: ac.signal }),
    ])
      .then(([p, m]) => {
        setProyek(p.data.projects ?? []);
        setMaterial(m.data.materials ?? []);
      })
      .catch((e) => { if (e?.name !== "CanceledError") setGalat("Gagal memuat daftar proyek atau material"); })
      .finally(() => setMemuat(false));
    return () => ac.abort();
  }, []);

  useEffect(() => {
    const ac = makeAbortController();
    api.get<{ penerimaan: Penerimaan[] }>("/api/v1/material-klien", { signal: ac.signal })
      .then((r) => setPenerimaan(r.data.penerimaan ?? []))
      .catch((e) => { if (e?.name !== "CanceledError") setGalat("Gagal memuat riwayat penerimaan"); });
    return () => ac.abort();
  }, [muatUlangKe]);

  const jumlah = Number(qty);
  const materialTerpilih = useMemo(
    () => material.find((m) => m.id === materialId) ?? null,
    [material, materialId],
  );

  // Alasan tombol mati DINYATAKAN, bukan hanya membuat tombol abu-abu. Tombol
  // mati tanpa penjelasan membuat orang menekan berulang kali lalu menyerah.
  const halangan = useMemo(() => {
    if (!proyekId) return "Pilih proyek penerima lebih dulu.";
    if (!materialId) return "Pilih material yang dipasok owner.";
    if (!qty || !Number.isFinite(jumlah) || jumlah <= 0) return "Isi jumlah lebih dari 0.";
    return null;
  }, [proyekId, materialId, qty, jumlah]);

  async function kirim() {
    if (halangan) return;
    setMengirim(true);
    setGalat(null);
    setSukses(null);
    try {
      await api.post("/api/v1/material-klien", {
        project_id: proyekId, material_id: materialId, qty: jumlah,
        pemasok: pemasok || undefined,
        nomor_surat_jalan: suratJalan || undefined,
      });
      const nm = materialTerpilih?.name ?? "Material";
      setSukses(`${nm} ${angka(jumlah)} tercatat sebagai material milik klien. Stok gudang bertambah, tapi ini TIDAK dihitung sebagai pembelian.`);
      setQty(""); setSuratJalan("");
      setMuatUlangKe((n) => n + 1);
    } catch (e) {
      const m = (e as { response?: { data?: { error?: string } } })?.response?.data?.error;
      setGalat(m ?? "Gagal mencatat penerimaan");
    } finally {
      setMengirim(false);
    }
  }

  const kartu: React.CSSProperties = {
    background: "var(--surface)", border: `1px solid ${C.border}`,
    borderRadius: 10, boxShadow: "var(--naik-1)",
  };
  const labelGaya: React.CSSProperties = {
    fontSize: 11, fontWeight: 700, color: C.muted,
    textTransform: "uppercase", letterSpacing: "0.05em",
  };
  const isianGaya: React.CSSProperties = {
    padding: "8px 10px", borderRadius: 6, border: `1px solid ${C.border}`,
    background: "var(--surface)", color: C.text, fontSize: 13, width: "100%",
  };

  return (
    <div style={{
      padding: "var(--pad-atas) var(--pad-x) var(--pad-bawah)",
      width: "100%", maxWidth: "var(--w-luas)", margin: "0 auto",
    }}>
      <div className="rise" style={{ marginBottom: 20 }}>
        <h1 style={{ fontFamily: "var(--font-display)", fontSize: 28, fontWeight: 700, color: C.text, margin: 0 }}>
          Material Milik Klien
        </h1>
        <p style={{ fontSize: 13, color: C.mid, margin: "6px 0 0", maxWidth: "68ch", lineHeight: 1.55 }}>
          Material yang dipasok owner (free issue) masuk gudang dan terpakai
          seperti material lain — tapi bukan pembelian kita. Dicatat terpisah
          supaya ia tidak menggelembungkan angka susut, dan tidak membuat
          perusahaan tampak memborong melebihi RAB.
        </p>
      </div>

      {galat && (
        <div role="alert" style={{
          marginBottom: 14, padding: "10px 14px", borderRadius: 8, fontSize: 13,
          border: `1px solid ${C.redBorder}`, background: C.redBg, color: C.red,
        }}>
          {galat}
        </div>
      )}

      {sukses && (
        <div role="status" style={{
          marginBottom: 14, padding: "10px 14px", borderRadius: 8, fontSize: 13,
          border: `1px solid ${C.greenBorder}`, background: C.greenBg, color: C.green,
        }}>
          {sukses}
        </div>
      )}

      {memuat ? (
        <div style={{ ...kartu, padding: 40, textAlign: "center", color: C.mid, fontSize: 13 }}>Memuat…</div>
      ) : proyek.length === 0 ? (
        <Kosong
          ikon={<PackageSearch size={28} />}
          judul="Belum ada proyek"
          sebab="Material milik klien dicatat per proyek. Daftar ini terisi sendiri begitu ada proyek berjalan."
        />
      ) : (
        <>
          {/* ── Formulir ────────────────────────────────────────────────── */}
          <div className="rise rise-2" style={{ ...kartu, padding: 16, marginBottom: 18 }}>
            <div style={{
              display: "grid", gap: 12,
              gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))",
            }}>
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                <label htmlFor="mk-proyek" style={labelGaya}>Proyek penerima</label>
                <select id="mk-proyek" value={proyekId} onChange={(e) => setProyekId(e.target.value)} style={isianGaya}>
                  <option value="">— pilih —</option>
                  {proyek.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                <label htmlFor="mk-material" style={labelGaya}>Material</label>
                <select id="mk-material" value={materialId} onChange={(e) => setMaterialId(e.target.value)} style={isianGaya}>
                  <option value="">— pilih —</option>
                  {material.map((m) => (
                    <option key={m.id} value={m.id}>{m.name}{m.unit ? ` (${m.unit})` : ""}</option>
                  ))}
                </select>
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                <label htmlFor="mk-qty" style={labelGaya}>Jumlah</label>
                <input
                  id="mk-qty" type="number" min="0" step="0.001" inputMode="decimal"
                  value={qty} onChange={(e) => setQty(e.target.value)}
                  aria-describedby="mk-satuan"
                  style={isianGaya}
                />
                <span id="mk-satuan" style={{ fontSize: 11, color: C.mid }}>
                  {materialTerpilih?.unit
                    ? `Satuan: ${materialTerpilih.unit}`
                    : "Pilih material untuk melihat satuannya"}
                </span>
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                <label htmlFor="mk-pemasok" style={labelGaya}>
                  Pemasok dari owner{" "}
                  <span style={{ fontWeight: 400, textTransform: "none", letterSpacing: 0 }}>(boleh kosong)</span>
                </label>
                <input
                  id="mk-pemasok" type="text" value={pemasok} onChange={(e) => setPemasok(e.target.value)}
                  placeholder="mis. PT Owner Sejahtera"
                  style={isianGaya}
                />
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                <label htmlFor="mk-sj" style={labelGaya}>
                  Nomor surat jalan{" "}
                  <span style={{ fontWeight: 400, textTransform: "none", letterSpacing: 0 }}>(boleh kosong)</span>
                </label>
                <input
                  id="mk-sj" type="text" value={suratJalan} onChange={(e) => setSuratJalan(e.target.value)}
                  placeholder="mis. SJ-2026-001"
                  style={isianGaya}
                />
              </div>
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 14, flexWrap: "wrap" }}>
              <button
                type="button" onClick={kirim} disabled={!!halangan || mengirim}
                style={{
                  padding: "9px 18px", borderRadius: 6, fontSize: 13, fontWeight: 700,
                  border: "none", background: halangan || mengirim ? C.border : C.navy,
                  color: halangan || mengirim ? C.mid : "var(--on-navy)",
                  cursor: halangan || mengirim ? "not-allowed" : "pointer",
                  display: "flex", alignItems: "center", gap: 7,
                }}
              >
                <HandCoins size={14} aria-hidden="true" />
                {mengirim ? "Mencatat…" : "Catat penerimaan"}
              </button>

              {halangan && (
                <span role="status" style={{ fontSize: 12, color: C.mid }}>{halangan}</span>
              )}
            </div>
          </div>

          {/* ── Riwayat ─────────────────────────────────────────────────── */}
          <div className="rise rise-3" style={{ ...kartu, overflow: "hidden" }}>
            <div style={{
              display: "flex", alignItems: "center", justifyContent: "space-between",
              padding: "12px 16px", borderBottom: `1px solid ${C.border}`,
            }}>
              <h2 style={{ fontSize: 14, fontWeight: 700, color: C.text, margin: 0 }}>
                Riwayat penerimaan
              </h2>
              <button
                type="button" onClick={() => setMuatUlangKe((n) => n + 1)}
                style={{
                  padding: "5px 10px", borderRadius: 6, border: `1px solid ${C.border}`,
                  background: "var(--surface)", color: C.mid, fontSize: 12, cursor: "pointer",
                  display: "flex", alignItems: "center", gap: 6,
                }}
              >
                <RefreshCw size={12} aria-hidden="true" /> Muat ulang
              </button>
            </div>

            {penerimaan.length === 0 ? (
              <div style={{ padding: "28px 16px", textAlign: "center", fontSize: 13, color: C.mid, lineHeight: 1.6 }}>
                Belum ada material dari klien yang tercatat.<br />
                <span style={{ fontSize: 12, color: C.muted }}>
                  Yang dicatat di sini menambah stok gudang, tapi tidak pernah
                  dihitung sebagai pembelian di Rekonsiliasi Material.
                </span>
              </div>
            ) : (
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, fontVariantNumeric: "tabular-nums", minWidth: 760 }}>
                  <caption className="sr-only">
                    Riwayat penerimaan material milik klien: tanggal, material,
                    jumlah, proyek penerima, pemasok dari owner, dan nomor surat jalan.
                  </caption>
                  <thead>
                    <tr style={{ background: "var(--surface-subtle)" }}>
                      {[
                        ["Tanggal", "left"], ["Material", "left"], ["Jumlah", "right"],
                        ["Proyek", "left"], ["Pemasok owner", "left"], ["Surat jalan", "left"],
                      ].map(([h, rata]) => (
                        <th key={h} scope="col" style={{
                          textAlign: rata as "left" | "right", padding: "8px 12px",
                          fontSize: 10, fontWeight: 700, color: C.muted,
                          textTransform: "uppercase", letterSpacing: "0.05em", whiteSpace: "nowrap",
                        }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {penerimaan.map((p) => (
                      <tr key={p.id} style={{ borderTop: `1px solid ${C.border}` }}>
                        <td style={{ padding: "10px 12px", color: C.mid, whiteSpace: "nowrap" }}>
                          {tanggalTerbaca(p.tanggal)}
                        </td>
                        <th scope="row" style={{ textAlign: "left", padding: "10px 12px", fontWeight: 500, color: C.text }}>
                          {p.material?.name ?? "—"}
                          {p.material?.unit && <span style={{ fontSize: 11, color: C.mid }}> · {p.material.unit}</span>}
                        </th>
                        <td style={{ textAlign: "right", padding: "10px 12px", fontWeight: 700, color: C.text }}>
                          {angka(p.qty)}
                        </td>
                        <td style={{ padding: "10px 12px", color: C.mid }}>{p.proyek?.name ?? "—"}</td>
                        <td style={{ padding: "10px 12px", color: p.pemasok ? C.mid : C.muted }}>
                          {p.pemasok || "—"}
                        </td>
                        <td style={{ padding: "10px 12px", color: p.nomor_surat_jalan ? C.mid : C.muted }}>
                          {p.nomor_surat_jalan || "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <p style={{
              margin: 0, padding: "10px 14px", borderTop: `1px solid ${C.border}`,
              background: "var(--surface-subtle)", fontSize: 11, color: C.mid, lineHeight: 1.55,
            }}>
              Tidak ada kolom harga: material owner tak pernah kita bayar, dan
              angka harga di sini akan mengalir ke laporan biaya sebagai
              pengeluaran yang tak pernah terjadi. Di{" "}
              <strong>Rekonsiliasi Material</strong> barang ini muncul di kolom
              “Dari klien” — ikut dihitung sebagai barang yang ADA di gudang,
              tapi tidak sebagai pembelian.
            </p>
          </div>
        </>
      )}
    </div>
  );
}
