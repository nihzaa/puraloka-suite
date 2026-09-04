"use client";

// ============================================================================
// Kartu Stok — Portal PM (Task 25 Step 4).
//
// Stok per proyek (pemilih proyek seperti Task 24). Tap satu baris membuka
// riwayat mutasi (BottomSheet, `GET .../movements`). Tombol "Catat" membuka
// `SheetCatatPemakaian` — pilih material dari stok yang SUDAH ADA di proyek
// ini (bukan seluruh katalog), supaya tak bisa "memakai" material yang tak
// pernah tercatat masuk ke proyek ini.
//
// ⚠️⚠️ CACAT GERBANG PRA-EKSISTING, DICATAT BUKAN DIPERBAIKI (review
// Important-4, 2026-08-21; sudah ditemukan Task 23 Step 1 riset) ⚠️⚠️
//
// `POST /api/v1/procurement/stocks/usage` bergerbang `procurement:view`
// (permission BACA) untuk sebuah aksi yang MENULIS mutasi `stock_movements`
// + `project_stocks` (`procurement.ts:1685-1688`, komentar `T4j` di kode itu
// SENDIRI sudah mendokumentasikan cacatnya tanpa memperbaikinya). Gerbang
// cacat ini PERSIS SAMA dengan `stocks/opname` (Task 26 Step 2, Temuan #2
// Task 23 Step 1).
//
// `SheetCatatPemakaian` di bawah MEMPERLUAS paparan cacat itu — menambah
// SATU jalur UI baru yang memakainya AKTIF (beda dari `stocks/opname` yang
// sekadar tidak dibangun sama sekali). Ini bukan berarti fiturnya dibatalkan:
// backend memang sudah begini sejak sebelum Task 23, dan memperbaiki
// gerbangnya di luar wewenang Task 25 (riset ini murni membangun UI portal
// PM, bukan menyentuh backend) — TAPI risikonya WAJIB tetap terlihat di sini
// untuk sesi berikutnya, dan WAJIB dilaporkan ke founder sebagai concern
// terpisah (lihat task-25-report.md §concern). JANGAN hapus catatan ini.
//
// `GET /api/v1/procurement/stocks` dan `.../movements` sendiri HANYA
// `authenticate` (tanpa requirePermission granular sama sekali) —
// dikonfirmasi baca `procurement.ts:1644-1683` langsung, bukan diasumsikan.
// ============================================================================

import { useMemo, useState } from "react";
import { Boxes, History, Plus, TriangleAlert } from "lucide-react";
import { useData, invalidasi } from "@/lib/data-cache";
import { api } from "@/lib/api";
import EmptyState from "@/components/portal/EmptyState";
import KepalaPortal from "@/components/portal/KepalaPortal";
import SkeletonCard from "@/components/portal/SkeletonCard";
import BottomSheet from "@/components/portal/BottomSheet";
import type { ProyekPM, RespStokDaftar, StokRingkas, RespMutasiDaftar, GalatApi } from "../../_bersama/tipe";
import { pesanGalat } from "../../_bersama/tipe";
import { Pilihan } from "@/components/pilihan";

interface RespProyek { projects: ProyekPM[] }

/**
 * Apakah stok material ini SUDAH di bawah ambang minimumnya?
 *
 * ⚠ Material TANPA ambang tak pernah diberi peringatan.
 *
 * Nilai jatuhan 0 akan salah ke arah yang berisik: `qty <= 0` menandai
 * setiap material berstok nol sebagai bermasalah, termasuk yang memang
 * belum pernah disetel ambangnya. Peringatan yang muncul di mana-mana
 * mengajari orang mengabaikannya — dan yang sungguhan ikut terabaikan.
 *
 * Angkanya bisa datang sebagai string dari PostgREST (kolom numeric),
 * jadi Number() dulu, dan NaN diperlakukan seperti tak punya ambang.
 */
function dibawahAmbang(s: StokRingkas): boolean {
  const min = Number(s.material?.min_stock ?? NaN);
  if (!Number.isFinite(min) || min <= 0) return false;
  const qty = Number(s.qty_on_hand ?? NaN);
  if (!Number.isFinite(qty)) return false;
  return qty <= min;
}

export default function PmStokPage() {
  const [proyekId, setProyekId] = useState("");
  const [dipilih, setDipilih] = useState<StokRingkas | null>(null);
  const [sheetPakai, setSheetPakai] = useState(false);

  const { data: dataProyek } = useData<RespProyek>("/api/v1/projects");
  const daftarProyek = useMemo(() => (dataProyek?.projects ?? []).filter((p) => p.pm), [dataProyek]);
  const proyekAktif = proyekId || daftarProyek[0]?.id || "";

  const urlStok = proyekAktif ? `/api/v1/procurement/stocks?project_id=${proyekAktif}` : null;
  const { data, memuat, galat } = useData<RespStokDaftar>(urlStok);

  const urlMutasi = dipilih && proyekAktif ? `/api/v1/procurement/stocks/${proyekAktif}/movements?limit=30` : null;
  const { data: dataMutasi, memuat: memuatMutasi } = useData<RespMutasiDaftar>(urlMutasi);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--gap-bagian)" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
        <KepalaPortal judul="Kartu Stok" />
        {proyekAktif && (
          <button type="button" onClick={() => setSheetPakai(true)}
            style={{ minHeight: 40, padding: "0 14px", borderRadius: "var(--portal-radius-pill)", background: "var(--grad-aksen)", color: "var(--on-navy)", border: "none", fontSize: 13, fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
            <Plus size={16} aria-hidden="true" /> Catat
          </button>
        )}
      </div>

      {daftarProyek.length > 1 && (
        <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <span style={{ fontSize: 12, fontWeight: 600, color: "var(--text-secondary)" }}>Proyek</span>
          <Pilihan value={proyekAktif} onChange={(e) => setProyekId(e.target.value)}
            style={{ minHeight: 44, padding: "0 12px", borderRadius: 12, border: "1px solid var(--border)", fontSize: 14, background: "var(--surface)", color: "var(--text-primary)" }}>
            {daftarProyek.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </Pilihan>
        </label>
      )}

      {!proyekAktif && <EmptyState icon={Boxes} judul="Pilih proyek" deskripsi="Kartu stok tercatat per proyek." />}
      {proyekAktif && memuat && <SkeletonCard tinggi={70} />}
      {proyekAktif && galat && <EmptyState icon={Boxes} judul="Gagal memuat" deskripsi={pesanGalat(galat as GalatApi, "Coba muat ulang.")} />}
      {proyekAktif && !memuat && !galat && (data?.stocks.length ?? 0) === 0 && (
        <EmptyState icon={Boxes} judul="Belum ada stok" deskripsi="Stok muncul setelah penerimaan barang dikonfirmasi." />
      )}

      {(data?.stocks ?? []).map((s) => (
        <button key={s.id} type="button" onClick={() => setDipilih(s)}
          style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, padding: 14, borderRadius: 14, background: "var(--surface)", border: "1px solid color-mix(in srgb, var(--border) 40%, transparent)", boxShadow: "var(--naik-1)", textAlign: "left", cursor: "pointer" }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: "var(--text-primary)" }}>{s.material?.name ?? "—"}</div>
            <div style={{ fontSize: 11, color: "var(--text-secondary)" }}>{s.material?.category?.name ?? "Tanpa kategori"}</div>
            {dibawahAmbang(s) && (
              /*
                Peringatan disertai ANGKA ambangnya, bukan kata "menipis" saja.

                PM di lapangan memutuskan pesan atau tidak; "menipis" tak
                menjawab berapa yang kurang. Angka menjawabnya tanpa membuka
                halaman lain.
              */
              <div style={{ display: "flex", alignItems: "center", gap: 4, marginTop: 4, fontSize: 11, fontWeight: 600, color: "var(--warning-teks)" }}>
                <TriangleAlert size={12} aria-hidden="true" />
                <span>Di bawah minimum ({s.material?.min_stock} {s.material?.unit ?? ""})</span>
              </div>
            )}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
            <span style={{
              fontSize: 14, fontWeight: 700,
              /*
                Warna angka ikut berubah — indikator tak boleh bergantung
                pada IKON saja. Ikon 12px di layar HP mudah terlewat, dan
                pengguna dengan gangguan penglihatan warna tetap terbantu
                oleh teks "Di bawah minimum" di sebelahnya. Tiga penanda
                (teks, ikon, warna) untuk satu keadaan.
              */
              color: dibawahAmbang(s) ? "var(--warning-teks)" : "var(--navy)",
            }}>{s.qty_on_hand} {s.material?.unit ?? ""}</span>
            <History size={14} color="var(--text-secondary)" aria-hidden="true" />
          </div>
        </button>
      ))}

      <BottomSheet terbuka={dipilih !== null} onTutup={() => setDipilih(null)} judul={dipilih?.material?.name ?? "Riwayat"}>
        {memuatMutasi && <SkeletonCard tinggi={50} />}
        {!memuatMutasi && (dataMutasi?.movements ?? []).length === 0 && (
          <EmptyState icon={History} judul="Belum ada mutasi" deskripsi="Riwayat pergerakan material ini akan muncul di sini." />
        )}
        {(dataMutasi?.movements ?? []).map((m) => (
          <div key={m.id} style={{ display: "flex", justifyContent: "space-between", padding: "10px 0", borderBottom: "1px solid var(--border)" }}>
            <div>
              <div style={{ fontSize: 12, fontWeight: 600, color: "var(--text-primary)" }}>{m.movement_type}</div>
              <div style={{ fontSize: 11, color: "var(--text-secondary)" }}>{m.created_at.slice(0, 10)} · {m.created_by?.name ?? "—"}</div>
            </div>
            <div style={{ fontSize: 13, fontWeight: 700, color: Number(m.qty) < 0 ? "var(--danger)" : "var(--success)" }}>
              {Number(m.qty) > 0 ? "+" : ""}{m.qty}
            </div>
          </div>
        ))}
      </BottomSheet>

      <SheetCatatPemakaian terbuka={sheetPakai} onTutup={() => setSheetPakai(false)} proyekId={proyekAktif} stok={data?.stocks ?? []} />
    </div>
  );
}

/**
 * ⚠️ Memanggil `POST /api/v1/procurement/stocks/usage` — lihat catatan
 * cacat gerbang pra-eksisting di kepala berkas ini SEBELUM menyunting
 * fungsi ini. Backend menerima siapa pun berpermission `procurement:view`
 * (BACA) untuk aksi TULIS ini; itu bukan sesuatu yang bisa diperbaiki dari
 * sisi UI.
 */
function SheetCatatPemakaian({ terbuka, onTutup, proyekId, stok }: { terbuka: boolean; onTutup: () => void; proyekId: string; stok: StokRingkas[] }) {
  const [materialId, setMaterialId] = useState("");
  const [jenis, setJenis] = useState<"usage" | "return" | "adjustment">("usage");
  const [qty, setQty] = useState("");
  const [catatan, setCatatan] = useState("");
  const [mengirim, setMengirim] = useState(false);
  const [galat, setGalat] = useState<string | null>(null);

  async function simpan() {
    if (!materialId || !(Number(qty) > 0)) { setGalat("Pilih material dan isi qty > 0."); return; }
    setMengirim(true); setGalat(null);
    try {
      await api.post("/api/v1/procurement/stocks/usage", { project_id: proyekId, material_id: materialId, qty: Number(qty), movement_type: jenis, notes: catatan.trim() || undefined });
      invalidasi(`/api/v1/procurement/stocks?project_id=${proyekId}`);
      setMaterialId(""); setQty(""); setCatatan(""); onTutup();
    } catch (e) {
      setGalat(pesanGalat(e as GalatApi, "Gagal mencatat mutasi"));
    } finally { setMengirim(false); }
  }

  return (
    <BottomSheet terbuka={terbuka} onTutup={onTutup} judul="Catat Pemakaian / Retur">
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <label style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>
          Material
          <Pilihan value={materialId} onChange={(e) => setMaterialId(e.target.value)}
            style={{ width: "100%", marginTop: 6, minHeight: 44, padding: "0 10px", borderRadius: 10, border: "1px solid var(--border)", fontSize: 13, background: "var(--surface)" }}>
            <option value="">Pilih material…</option>
            {stok.map((s) => <option key={s.id} value={s.material?.id}>{s.material?.name} (tersedia {s.qty_on_hand})</option>)}
          </Pilihan>
        </label>
        <label style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>
          Jenis
          <Pilihan value={jenis} onChange={(e) => setJenis(e.target.value as typeof jenis)}
            style={{ width: "100%", marginTop: 6, minHeight: 44, padding: "0 10px", borderRadius: 10, border: "1px solid var(--border)", fontSize: 13, background: "var(--surface)" }}>
            <option value="usage">Pemakaian</option>
            <option value="return">Retur (masuk kembali)</option>
            <option value="adjustment">Penyesuaian (qty absolut baru)</option>
          </Pilihan>
        </label>
        <label style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>
          Qty
          <input type="number" min="0" step="0.01" value={qty} onChange={(e) => setQty(e.target.value)}
            style={{ width: "100%", marginTop: 6, minHeight: 44, padding: "0 12px", borderRadius: 12, border: "1px solid var(--border)", fontSize: 14 }} />
        </label>
        <label style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>
          Catatan
          <textarea value={catatan} onChange={(e) => setCatatan(e.target.value)} rows={2}
            style={{ width: "100%", marginTop: 6, padding: 12, borderRadius: 12, border: "1px solid var(--border)", fontSize: 14, fontFamily: "inherit" }} />
        </label>

        {galat && <div role="alert" style={{ fontSize: 12, color: "var(--danger)" }}>{galat}</div>}

        <button type="button" onClick={simpan} disabled={mengirim}
          style={{ minHeight: 48, borderRadius: "var(--portal-radius-pill)", background: "var(--grad-aksen)", color: "var(--on-navy)", border: "none", fontSize: 14, fontWeight: 700, cursor: mengirim ? "default" : "pointer" }}>
          {mengirim ? "Menyimpan…" : "Simpan"}
        </button>
      </div>
    </BottomSheet>
  );
}
