"use client";

// ============================================================================
// Kelola Lokasi Gudang — Portal PM (Task 25 Step 3).
//
// CRUD lokasi gudang. PM punya `gudang:manage` PENUH (Task 23 Step 1) — jadi
// tombol tambah/edit selalu tampil, tanpa cek permission tambahan di klien.
//
// Menonaktifkan gudang yang MASIH BERISI ditolak backend dengan pesan
// spesifik (409, `gudang-kelola.ts` L191-204) yang sudah menyebutkan jumlah
// jenis material yang menahannya — pesan itu DITAMPILKAN APA ADANYA lewat
// `pesanGalat`, bukan digeneralisasi jadi "gagal menyimpan".
// ============================================================================

import { useState } from "react";
import { Warehouse, Plus, Pencil } from "lucide-react";
import { useData, invalidasi } from "@/lib/data-cache";
import { api } from "@/lib/api";
import EmptyState from "@/components/portal/EmptyState";
import SkeletonCard from "@/components/portal/SkeletonCard";
import StatusBadge from "@/components/portal/StatusBadge";
import BottomSheet from "@/components/portal/BottomSheet";
import { Saklar } from "@/components/saklar";
import type { RespGudangDaftar, GudangLokasi, GalatApi } from "../../_bersama/tipe";
import { pesanGalat } from "../../_bersama/tipe";

export default function PmGudangLokasiPage() {
  const url = "/api/v1/gudang";
  const { data, memuat, galat } = useData<RespGudangDaftar>(url);
  const [sheetTambah, setSheetTambah] = useState(false);
  const [diedit, setDiedit] = useState<GudangLokasi | null>(null);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h1 style={{ fontSize: 20, fontWeight: 700, color: "var(--text-primary)", margin: 0 }}>Lokasi Gudang</h1>
        <button type="button" onClick={() => setSheetTambah(true)} aria-label="Tambah lokasi gudang"
          style={{ minHeight: 40, padding: "0 14px", borderRadius: "var(--portal-radius-pill)", background: "var(--grad-aksen)", color: "var(--on-navy)", border: "none", fontSize: 13, fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", gap: 6 }}>
          <Plus size={16} aria-hidden="true" /> Tambah
        </button>
      </div>

      {memuat && <SkeletonCard tinggi={80} />}
      {galat && <EmptyState icon={Warehouse} judul="Gagal memuat" deskripsi={pesanGalat(galat as GalatApi, "Coba muat ulang.")} />}
      {!memuat && !galat && (data?.gudang.length ?? 0) === 0 && (
        <EmptyState icon={Warehouse} judul="Belum ada gudang" deskripsi="Tambahkan lokasi gudang pertama perusahaan." />
      )}

      {(data?.gudang ?? []).map((g) => (
        <button key={g.id} type="button" onClick={() => setDiedit(g)}
          style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, padding: 14, borderRadius: 14, background: "var(--surface)", border: "1px solid var(--border)", textAlign: "left", cursor: "pointer" }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: "var(--text-primary)" }}>{g.kode} · {g.nama}</div>
            <div style={{ fontSize: 11, color: "var(--text-secondary)" }}>{g.alamat ?? "Tanpa alamat"} · {g.jenis_material} jenis material · penjaga {g.penjaga?.name ?? "—"}</div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
            {!g.aktif && <StatusBadge status="netral" label="Nonaktif" />}
            <Pencil size={16} color="var(--text-secondary)" aria-hidden="true" />
          </div>
        </button>
      ))}

      <FormGudang terbuka={sheetTambah} onTutup={() => setSheetTambah(false)} url={url} />
      <FormGudang terbuka={diedit !== null} onTutup={() => setDiedit(null)} url={url} existing={diedit} />
    </div>
  );
}

function FormGudang({ terbuka, onTutup, url, existing }: { terbuka: boolean; onTutup: () => void; url: string; existing?: GudangLokasi | null }) {
  const [kode, setKode] = useState(existing?.kode ?? "");
  const [nama, setNama] = useState(existing?.nama ?? "");
  const [alamat, setAlamat] = useState(existing?.alamat ?? "");
  const [catatan, setCatatan] = useState(existing?.catatan ?? "");
  const [aktif, setAktif] = useState(existing?.aktif ?? true);
  const [mengirim, setMengirim] = useState(false);
  const [galat, setGalat] = useState<string | null>(null);

  async function simpan() {
    if (!existing && !kode.trim()) { setGalat("Kode gudang wajib diisi."); return; }
    if (!nama.trim()) { setGalat("Nama gudang wajib diisi."); return; }
    setMengirim(true); setGalat(null);
    try {
      if (existing) {
        await api.patch(`/api/v1/gudang/${existing.id}`, { nama: nama.trim(), alamat: alamat.trim() || null, catatan: catatan.trim() || null, aktif });
      } else {
        await api.post("/api/v1/gudang", { kode: kode.trim(), nama: nama.trim(), alamat: alamat.trim() || undefined, catatan: catatan.trim() || undefined });
      }
      invalidasi(url);
      onTutup();
    } catch (e) {
      setGalat(pesanGalat(e as GalatApi, existing ? "Gagal menyimpan perubahan" : "Gagal menambah gudang"));
    } finally { setMengirim(false); }
  }

  return (
    <BottomSheet terbuka={terbuka} onTutup={onTutup} judul={existing ? `Ubah ${existing.kode}` : "Gudang Baru"}>
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        {!existing && (
          <label style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>
            Kode
            <input type="text" value={kode} onChange={(e) => setKode(e.target.value)}
              style={{ width: "100%", marginTop: 6, minHeight: 44, padding: "0 12px", borderRadius: 12, border: "1px solid var(--border)", fontSize: 14, textTransform: "uppercase" }} />
          </label>
        )}
        <label style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>
          Nama
          <input type="text" value={nama} onChange={(e) => setNama(e.target.value)}
            style={{ width: "100%", marginTop: 6, minHeight: 44, padding: "0 12px", borderRadius: 12, border: "1px solid var(--border)", fontSize: 14 }} />
        </label>
        <label style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>
          Alamat
          <input type="text" value={alamat ?? ""} onChange={(e) => setAlamat(e.target.value)}
            style={{ width: "100%", marginTop: 6, minHeight: 44, padding: "0 12px", borderRadius: 12, border: "1px solid var(--border)", fontSize: 14 }} />
        </label>
        <label style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>
          Catatan
          <textarea value={catatan ?? ""} onChange={(e) => setCatatan(e.target.value)} rows={2}
            style={{ width: "100%", marginTop: 6, padding: 12, borderRadius: 12, border: "1px solid var(--border)", fontSize: 14, fontFamily: "inherit" }} />
        </label>
        {existing && (
          <Saklar nyala={aktif} onUbah={setAktif} label="Aktif (bisa dipilih sebagai lokasi)" />
        )}

        {galat && <div role="alert" style={{ fontSize: 12, color: "var(--danger)" }}>{galat}</div>}

        <button type="button" onClick={simpan} disabled={mengirim}
          style={{ minHeight: 48, borderRadius: "var(--portal-radius-pill)", background: "var(--grad-aksen)", color: "var(--on-navy)", border: "none", fontSize: 14, fontWeight: 700, cursor: mengirim ? "default" : "pointer" }}>
          {mengirim ? "Menyimpan…" : "Simpan"}
        </button>
      </div>
    </BottomSheet>
  );
}
