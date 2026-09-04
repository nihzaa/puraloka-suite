"use client";

/**
 * TRANSFER STOK ANTAR PROYEK (F5 PEMBEDA — rekonsiliasi material 1,5/5)
 *
 * ── Yang dijawab halaman ini
 *
 * "Besi 10 batang dikirim dari proyek Dago ke proyek Cihampelas — ke mana
 * jejaknya?"
 *
 * Sebelum ada layar ini, perpindahan hanya bisa dicatat sebagai dua koreksi
 * stok yang tak saling mengenal. Di `/gudang/rekonsiliasi`, barang yang
 * pindah muncul sebagai **susut tak terjelaskan di proyek asal** — menuduh
 * mandor atas barang yang ia kirim atas perintah kantor.
 *
 * ── Kenapa formnya menolak lebih dulu, bukan mengeluh belakangan
 *
 * Stok asal ditampilkan begitu material dipilih, dan tombol kirim mati kalau
 * jumlahnya melebihi yang ada. Galat setelah tombol ditekan berarti orang
 * gudang sudah terlanjur mengetik seluruh formulir untuk ditolak.
 */

import { useMemo, useState } from "react";
import { ArrowLeftRight, ArrowRight, PackageSearch, RefreshCw } from "lucide-react";
import { api } from "@/lib/api";
import { useData, invalidasi } from "@/lib/data-cache";
import { C } from "@/lib/warna-ui";
import { Kosong } from "@/components/ui-dasar";
import { Tabel, KepalaHalaman } from "@/components/dasar";
import { Pilihan } from "@/components/pilihan";

type Proyek = { id: string; name: string };
type Material = { id: string; name: string; unit: string | null };

type Transfer = {
  id: string;
  qty: number | string;
  tanggal: string;
  alasan: string | null;
  material: Material | null;
  asal: Proyek | null;
  tujuan: Proyek | null;
  pembuat: { id: string; name: string } | null;
};

/**
 * Bentuk mengikuti `GET /api/v1/procurement/stocks` apa adanya
 * (`procurement.ts:1450`): TIDAK ada `material_id` di tingkat atas — id-nya
 * hanya ada di dalam `material`. Versi pertama berkas ini memakai
 * `s.material_id` dan mendapat `undefined` untuk setiap baris: daftar
 * material tetap tampil, tapi tak satu pun bisa dipilih.
 */
type Stok = { id: string; qty_on_hand: number | string; material?: Material | null };

/** Id material sebuah baris stok — satu tempat, supaya tak salah lagi. */
const idMaterial = (s: Stok) => s.material?.id ?? "";

const angka = (n: number | string) =>
  new Intl.NumberFormat("id-ID", { maximumFractionDigits: 2 }).format(Number(n));

const tanggalTerbaca = (iso: string) =>
  new Date(iso + "T00:00:00").toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" });

export default function TransferStokPage() {
  const [sukses, setSukses] = useState<string | null>(null);
  const [mengirim, setMengirim] = useState(false);

  const [asal, setAsal] = useState("");
  const [tujuan, setTujuan] = useState("");
  const [materialId, setMaterialId] = useState("");
  const [qty, setQty] = useState("");
  const [alasan, setAlasan] = useState("");

  /*
    ── PINDAH KE LAPIS CACHE BERSAMA (F4-2), 2026-08-16

    Tiga permintaan lama jadi tiga `useData`. Stok proyek asal memakai URL
    DINAMIS bergantung `asal` — `useData` memakai URL sebagai kunci cache,
    jadi ganti proyek lalu kembali tak perlu mengambil ulang selama masih
    segar, DAN stok proyek lama otomatis tak terpakai lagi begitu `asal`
    berganti (kunci cache-nya beda, bukan state yang harus dikosongkan
    manual seperti sebelumnya).
  */
  const { data: dataProyek, memuat, galat: galatMuatProyek } =
    useData<{ projects: Proyek[] }>("/api/v1/projects");
  const proyek = dataProyek?.projects ?? [];

  const { data: dataTransfer, galat: galatMuatTransfer, muatUlang: muatUlangTransfer } =
    useData<{ transfers: Transfer[] }>("/api/v1/transfer-stok");
  const transfer = dataTransfer?.transfers ?? [];

  const { data: dataStok, muatUlang: muatUlangStok } = useData<{ stocks: Stok[] }>(
    asal ? `/api/v1/procurement/stocks?project_id=${asal}` : null,
  );
  const stok = useMemo(() => dataStok?.stocks ?? [], [dataStok]);

  /*
    Galat MUAT dan galat AKSI (kirim transfer) sengaja dipisah — satu state
    untuk keduanya membuat gagal mengirim menghapus pesan gagal memuat.
    Ditemukan berpola di halaman lain F4-2.
  */
  const [galatAksi, setGalatAksi] = useState<string | null>(null);
  const galat = galatAksi ?? (
    (galatMuatProyek || galatMuatTransfer) ? "Gagal memuat data transfer" : null
  );

  const stokTerpilih = useMemo(
    () => stok.find((s) => idMaterial(s) === materialId) ?? null,
    [stok, materialId],
  );
  const tersedia = Number(stokTerpilih?.qty_on_hand ?? 0);
  const jumlah = Number(qty);

  // Alasan tombol mati DINYATAKAN, bukan hanya membuat tombol abu-abu.
  // Tombol mati tanpa penjelasan membuat orang menekan berulang kali lalu
  // menyerah, dan tak ada yang tahu apa yang kurang.
  const halangan = useMemo(() => {
    if (!asal) return "Pilih proyek asal lebih dulu.";
    if (!tujuan) return "Pilih proyek tujuan.";
    if (asal === tujuan) return "Proyek asal dan tujuan tidak boleh sama.";
    if (!materialId) return "Pilih material yang dipindahkan.";
    if (!qty || !Number.isFinite(jumlah) || jumlah <= 0) return "Isi jumlah lebih dari 0.";
    if (jumlah > tersedia) return `Stok tidak cukup — tersedia ${angka(tersedia)}.`;
    return null;
  }, [asal, tujuan, materialId, qty, jumlah, tersedia]);

  async function kirim() {
    if (halangan) return;
    setMengirim(true);
    setGalatAksi(null);
    setSukses(null);
    try {
      await api.post("/api/v1/transfer-stok", {
        project_asal_id: asal, project_tujuan_id: tujuan,
        material_id: materialId, qty: jumlah, alasan: alasan || undefined,
      });
      const nm = stokTerpilih?.material?.name ?? "Material";
      setSukses(`${nm} ${angka(jumlah)} dipindahkan. Kartu stok kedua proyek sudah diperbarui.`);
      setQty(""); setAlasan("");
      await muatUlangTransfer();
      // Muat ulang stok asal supaya angka tersedianya ikut turun. Juga
      // menghapus cache stok proyek TUJUAN kalau pernah dibuka sebagai asal
      // sebelumnya — invalidasi berawalan menjangkau semua kunci company
      // untuk endpoint ini, bukan cuma proyek yang sedang aktif.
      invalidasi("/api/v1/procurement/stocks");
      await muatUlangStok();
    } catch (e) {
      const m = (e as { response?: { data?: { error?: string } } })?.response?.data?.error;
      setGalatAksi(m ?? "Gagal memindahkan stok");
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
      <KepalaHalaman
        judul="Transfer Stok Antar Proyek"
        keterangan="Material yang pindah proyek dicatat sebagai satu peristiwa dengan dua sisi. Tanpa ini, barang yang dikirim ke proyek sebelah terbaca sebagai susut yang tak bisa dijelaskan di proyek asalnya."
              ikon={<ArrowLeftRight size={19} />}
      />

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
      ) : proyek.length < 2 ? (
        <Kosong
          ikon={<PackageSearch size={28} />}
          judul="Butuh minimal dua proyek"
          sebab="Transfer memindahkan material dari satu proyek ke proyek lain. Halaman ini berguna begitu ada dua proyek berjalan."
        />
      ) : (
        <>
          {/* ── Formulir ────────────────────────────────────────────────── */}
          <div className="rise rise-2" style={{ ...kartu, padding: "var(--pad-kartu-lega)", marginBottom: 18 }}>
            {/* Asal → panah → tujuan, sebaris.
                Versi pertama menaruh keduanya sebagai dua dropdown kembar di
                grid seragam: tak ada apa pun yang menunjukkan bahwa barang
                BERGERAK, apalagi ke arah mana. Padahal itu satu-satunya hal
                yang layar ini lakukan, dan transfer yang terbalik arahnya
                baru ketahuan setelah stok di dua proyek sama-sama salah.

                Panahnya `aria-hidden` — arahnya sudah terbaca dari label
                "Dari proyek" dan "Ke proyek", jadi bagi pembaca layar ia
                hiasan yang mengulang. */}
            <div style={{
              display: "flex", gap: 10, alignItems: "flex-end",
              flexWrap: "wrap", marginBottom: 12,
            }}>
              <div style={{ display: "flex", flexDirection: "column", gap: 4, flex: "1 1 240px", minWidth: 200 }}>
                <label htmlFor="tr-asal" style={labelGaya}>Dari proyek</label>
                <Pilihan id="tr-asal" value={asal} onChange={(e) => { setAsal(e.target.value); setMaterialId(""); }} style={isianGaya}>
                  <option value="">— pilih —</option>
                  {proyek.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </Pilihan>
              </div>

              <ArrowRight
                size={16} aria-hidden="true"
                style={{ color: C.muted, flexShrink: 0, marginBottom: 10 }}
              />

              <div style={{ display: "flex", flexDirection: "column", gap: 4, flex: "1 1 240px", minWidth: 200 }}>
                <label htmlFor="tr-tujuan" style={labelGaya}>Ke proyek</label>
                <Pilihan id="tr-tujuan" value={tujuan} onChange={(e) => setTujuan(e.target.value)} style={isianGaya}>
                  <option value="">— pilih —</option>
                  {proyek.filter((p) => p.id !== asal).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </Pilihan>
              </div>

            </div>

            <div style={{
              display: "grid", gap: 12,
              gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))",
            }}>
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                <label htmlFor="tr-material" style={labelGaya}>Material</label>
                <Pilihan id="tr-material" value={materialId} onChange={(e) => setMaterialId(e.target.value)} disabled={!asal} style={{ ...isianGaya, opacity: asal ? 1 : 0.6 }}>
                  <option value="">{asal ? "— pilih —" : "pilih proyek asal dulu"}</option>
                  {stok.filter((s) => idMaterial(s)).map((s) => (
                    <option key={idMaterial(s)} value={idMaterial(s)}>
                      {s.material?.name ?? idMaterial(s)} — tersedia {angka(s.qty_on_hand)}
                      {s.material?.unit ? ` ${s.material.unit}` : ""}
                    </option>
                  ))}
                </Pilihan>
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                <label htmlFor="tr-qty" style={labelGaya}>Jumlah</label>
                <input
                  id="tr-qty" type="number" min="0" step="0.001" inputMode="decimal"
                  value={qty} onChange={(e) => setQty(e.target.value)}
                  disabled={!materialId}
                  aria-describedby="tr-tersedia"
                  style={{ ...isianGaya, opacity: materialId ? 1 : 0.6 }}
                />
                <span id="tr-tersedia" style={{ fontSize: 11, color: C.mid }}>
                  {materialId
                    ? `Tersedia ${angka(tersedia)}${stokTerpilih?.material?.unit ? ` ${stokTerpilih.material.unit}` : ""} di proyek asal`
                    : "Pilih material untuk melihat stoknya"}
                </span>
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: 4, gridColumn: "1 / -1" }}>
                <label htmlFor="tr-alasan" style={labelGaya}>Alasan <span style={{ fontWeight: 400, textTransform: "none", letterSpacing: 0 }}>(boleh dikosongkan)</span></label>
                <input
                  id="tr-alasan" type="text" value={alasan} onChange={(e) => setAlasan(e.target.value)}
                  placeholder="mis. kebutuhan cor lantai 2 dipercepat"
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
                <ArrowLeftRight size={14} aria-hidden="true" />
                {mengirim ? "Memindahkan…" : "Pindahkan stok"}
              </button>

              {/* Alasan tombol mati ditulis sebagai KALIMAT, bukan disimpan di
                  kepala pengembang. `role="status"` supaya pembaca layar ikut
                  mendengarnya saat isian berubah. */}
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
                Riwayat perpindahan
              </h2>
              <button
                type="button" onClick={() => void muatUlangTransfer()}
                style={{
                  padding: "5px 10px", borderRadius: 6, border: `1px solid ${C.border}`,
                  background: "var(--surface)", color: C.mid, fontSize: 12, cursor: "pointer",
                  display: "flex", alignItems: "center", gap: 6,
                }}
              >
                <RefreshCw size={12} aria-hidden="true" /> Muat ulang
              </button>
            </div>

            {transfer.length === 0 ? (
              <div style={{ padding: "28px 16px", textAlign: "center", fontSize: 13, color: C.mid, lineHeight: 1.6 }}>
                Belum ada perpindahan tercatat.<br />
                <span style={{ fontSize: 12, color: C.muted }}>
                  Setiap transfer di sini otomatis berhenti dihitung sebagai susut
                  di Rekonsiliasi Material.
                </span>
              </div>
            ) : (
              /* Dipindahkan ke <Tabel> 2026-08-07 (UI-0-4). Caption sr-only,
                 kolom pertama <th scope="row">, tabular-nums, dan pembungkus
                 overflow-x sekarang dijamin komponen — empat hal yang tabel
                 mentah harus ingat sendiri setiap kali.

                 Kolom pertama berpindah dari "Tanggal" ke "Material": yang
                 menamai baris bagi pembaca layar seharusnya barang yang
                 pindah, bukan tanggalnya. Sepuluh transfer di hari yang sama
                 membuat "12 Agu 2026" jadi nama baris yang tak membedakan
                 apa pun — dan halaman ini justru dibuka untuk melacak SATU
                 material tertentu.

                 `minWidth: 720` sengaja dilepas, bukan lupa: komponen sudah
                 membungkus dengan overflow-x, jadi gulir horizontalnya tetap
                 ada tanpa memaksa lebar mati ke primitif bersama. */
              <Tabel<Transfer>
              berpermukaan
                caption="Riwayat perpindahan material antar proyek: material, jumlah, tanggal, proyek asal, proyek tujuan, dan alasannya."
                data={transfer}
                kunciBaris={(t) => t.id}
                kolom={[
                  {
                    kunci: "material", judul: "Material", kepalaBaris: true,
                    render: (t) => (
                      <>
                        {t.material?.name ?? "—"}
                        {t.material?.unit && <span style={{ fontSize: 11, color: C.mid }}> · {t.material.unit}</span>}
                      </>
                    ),
                  },
                  {
                    kunci: "qty", judul: "Jumlah", rata: "kanan",
                    render: (t) => <span style={{ fontWeight: 700 }}>{angka(t.qty)}</span>,
                  },
                  {
                    kunci: "tanggal", judul: "Tanggal",
                    render: (t) => (
                      <span style={{ color: C.mid, whiteSpace: "nowrap" }}>{tanggalTerbaca(t.tanggal)}</span>
                    ),
                  },
                  {
                    kunci: "asal", judul: "Dari",
                    render: (t) => <span style={{ color: C.mid }}>{t.asal?.name ?? "—"}</span>,
                  },
                  {
                    kunci: "tujuan", judul: "Ke",
                    render: (t) => <span style={{ color: C.mid }}>{t.tujuan?.name ?? "—"}</span>,
                  },
                  {
                    kunci: "alasan", judul: "Alasan",
                    // Nilai kosong sengaja lebih pudar daripada nilai terisi:
                    // "—" yang sepekat data membuat mata berhenti di tempat
                    // yang tak berisi apa-apa.
                    render: (t) => (
                      <span style={{ color: t.alasan ? C.mid : C.muted }}>{t.alasan || "—"}</span>
                    ),
                  },
                ]}
              />
            )}
          </div>
        </>
      )}
    </div>
  );
}
