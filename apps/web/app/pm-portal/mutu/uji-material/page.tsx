"use client";

// ============================================================================
// Hasil Uji Material — beton, tanah, baja dari laboratorium.
//
// Kesimpulan TIDAK diturunkan dari angka di frontend (komentar `mutu.ts`):
// backend menyimpan `kesimpulan` sebagai field terpisah dari
// `nilai_hasil`/`nilai_syarat` — form ini MENGIRIM keduanya apa adanya,
// TIDAK menghitung "memenuhi/tidak" sendiri di klien. Kadar lumpur pasir
// dibaca TERBALIK (makin kecil makin baik), sebagian uji tak berambang
// tunggal — hitungan otomatis akan salah untuk uji semacam itu.
//
// ⚠️ KOREKSI dari brief (Task 30 riset lib nyata, lihat `_bersama/tipe.ts`):
// response `GET .../uji-material` membawa array bernama **`baris`**, BUKAN
// `data` — dan `kesimpulan` adalah union TIGA nilai (`memenuhi` |
// `tidak_memenuhi` | `perlu_uji_ulang`), bukan teks bebas. Form create di
// bawah karena itu memakai tiga tombol pilihan, bukan input teks —
// menyamakan gaya `jenis_titik` di `mutu/rencana/[id]/page.tsx`. Baris yang
// BERTENTANGAN (angka vs kesimpulan manusia tak sejalan) ditandai badge
// terpisah — itulah satu-satunya hal di halaman ini yang menuntut
// pertanyaan, dan server sudah menaikkannya ke atas urutan (`ringkasUji()`).
//
// Endpoint: GET  /api/v1/projects/:projectId/uji-material
//           POST /api/v1/projects/:projectId/uji-material
// ============================================================================

import { useMemo, useState } from "react";
import { FlaskConical, Plus, AlertTriangle } from "lucide-react";
import { useData, invalidasi } from "@/lib/data-cache";
import { api } from "@/lib/api";
import BottomSheet from "@/components/portal/BottomSheet";
import KepalaPortal from "@/components/portal/KepalaPortal";
import StatusBadge from "@/components/portal/StatusBadge";
import EmptyState from "@/components/portal/EmptyState";
import SkeletonCard from "@/components/portal/SkeletonCard";
import type { HasilNilaiUji, RespUjiMaterial, KesimpulanUji, ProyekPM, GalatApi } from "../../_bersama/tipe";
import { pesanGalat } from "../../_bersama/tipe";

interface RespProyek { projects: ProyekPM[] }

const LABEL_KESIMPULAN: Record<KesimpulanUji, string> = {
  memenuhi: "Memenuhi", tidak_memenuhi: "Tidak Memenuhi", perlu_uji_ulang: "Perlu Uji Ulang",
};

export default function PmUjiMaterialPage() {
  const [proyekId, setProyekId] = useState("");
  const [sheetBuat, setSheetBuat] = useState(false);

  const { data: dataProyek } = useData<RespProyek>("/api/v1/projects");
  const daftarProyek = useMemo(() => (dataProyek?.projects ?? []).filter((p) => p.pm), [dataProyek]);
  const proyekAktif = proyekId || daftarProyek[0]?.id || "";

  const urlUji = proyekAktif ? `/api/v1/projects/${proyekAktif}/uji-material` : null;
  const { data, memuat, galat } = useData<RespUjiMaterial>(urlUji);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--gap-bagian)" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
        <KepalaPortal judul="Hasil Uji Material" />
        {proyekAktif && (
          <button type="button" onClick={() => setSheetBuat(true)} aria-label="Catat hasil uji baru"
            style={{ minHeight: 40, padding: "0 14px", borderRadius: "var(--portal-radius-pill)", background: "var(--grad-aksen)", color: "var(--on-navy)", border: "none", fontSize: 13, fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", gap: 6 }}>
            <Plus size={16} aria-hidden="true" /> Uji
          </button>
        )}
      </div>

      {daftarProyek.length > 1 && (
        <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <span style={{ fontSize: 12, fontWeight: 600, color: "var(--text-secondary)" }}>Proyek</span>
          <select value={proyekAktif} onChange={(e) => setProyekId(e.target.value)}
            style={{ minHeight: 44, padding: "0 12px", borderRadius: 12, border: "1px solid var(--border)", fontSize: 14, background: "var(--surface)", color: "var(--text-primary)" }}>
            {daftarProyek.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </label>
      )}

      {!proyekAktif && <EmptyState icon={FlaskConical} judul="Pilih proyek" deskripsi="Hasil uji material tercatat per proyek." />}
      {proyekAktif && memuat && <SkeletonCard tinggi={70} />}
      {proyekAktif && galat && <EmptyState icon={FlaskConical} judul="Gagal memuat hasil uji" deskripsi={pesanGalat(galat as GalatApi, "Coba muat ulang.")} />}
      {proyekAktif && !memuat && !galat && (data?.baris?.length ?? 0) === 0 && (
        <EmptyState icon={FlaskConical} judul="Belum ada hasil uji" deskripsi="Hasil uji beton, tanah, dan baja dari laboratorium akan muncul di sini." />
      )}
      {proyekAktif && !memuat && (data?.baris ?? []).map((u: HasilNilaiUji) => (
        <div key={u.id} style={{ display: "flex", flexDirection: "column", gap: 6, padding: 14, borderRadius: 14, background: "var(--surface)", border: "1px solid color-mix(in srgb, var(--border) 40%, transparent)", boxShadow: "var(--naik-1)" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
            <div>
              <span style={{ fontSize: 14, fontWeight: 700, color: "var(--text-primary)" }}>{u.objek}</span>
              <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>{u.jenis_uji} · {u.nomor} · {u.tanggal_uji}</div>
            </div>
            {u.kesimpulan && (
              <StatusBadge status={u.kesimpulan === "tidak_memenuhi" ? "rejected" : u.kesimpulan === "perlu_uji_ulang" ? "pending" : "approved"} label={LABEL_KESIMPULAN[u.kesimpulan] ?? u.kesimpulan} />
            )}
          </div>
          {(u.nilai_hasil !== null || u.nilai_syarat !== null) && (
            <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>
              Hasil: {u.nilai_hasil ?? "—"} {u.satuan ?? ""} {u.nilai_syarat !== null ? `(syarat ${u.nilai_syarat} ${u.satuan ?? ""})` : ""}
            </div>
          )}
          {u.bertentangan && (
            <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "var(--on-warning-bg)", padding: 8, borderRadius: 10, background: "var(--warning-bg)", border: "1px solid var(--warning-border)" }}>
              <AlertTriangle size={14} aria-hidden="true" style={{ flexShrink: 0 }} />
              Angka dan kesimpulan tidak sejalan — layak ditanyakan ulang ke penyusunnya.
            </div>
          )}
        </div>
      ))}

      <SheetBuatUji terbuka={sheetBuat} onTutup={() => setSheetBuat(false)} proyekId={proyekAktif} urlList={urlUji} />
    </div>
  );
}

function SheetBuatUji({ terbuka, onTutup, proyekId, urlList }: { terbuka: boolean; onTutup: () => void; proyekId: string; urlList: string | null }) {
  const [nomor, setNomor] = useState("");
  const [objek, setObjek] = useState("");
  const [jenisUji, setJenisUji] = useState("");
  const [tanggalUji, setTanggalUji] = useState("");
  const [nilaiHasil, setNilaiHasil] = useState("");
  const [nilaiSyarat, setNilaiSyarat] = useState("");
  const [satuan, setSatuan] = useState("");
  const [kesimpulan, setKesimpulan] = useState<KesimpulanUji | "">("");
  const [mengirim, setMengirim] = useState(false);
  const [galat, setGalat] = useState<string | null>(null);

  async function simpan() {
    if (!nomor.trim() || !objek.trim() || !jenisUji.trim() || !tanggalUji) {
      setGalat("Nomor, objek, jenis uji, dan tanggal wajib diisi."); return;
    }
    const adaNilai = nilaiHasil.trim() !== "" && Number.isFinite(Number(nilaiHasil));
    if (!adaNilai && !kesimpulan) {
      setGalat("Isi nilai hasil ATAU kesimpulan — baris tanpa keduanya tak membuktikan apa pun."); return;
    }
    setMengirim(true); setGalat(null);
    try {
      await api.post(`/api/v1/projects/${proyekId}/uji-material`, {
        nomor: nomor.trim(), objek: objek.trim(), jenis_uji: jenisUji.trim(), tanggal_uji: tanggalUji,
        nilai_hasil: adaNilai ? Number(nilaiHasil) : undefined,
        nilai_syarat: nilaiSyarat.trim() !== "" && Number.isFinite(Number(nilaiSyarat)) ? Number(nilaiSyarat) : undefined,
        satuan: satuan.trim() || undefined, kesimpulan: kesimpulan || undefined,
      });
      if (urlList) invalidasi(urlList);
      setNomor(""); setObjek(""); setJenisUji(""); setTanggalUji(""); setNilaiHasil(""); setNilaiSyarat(""); setSatuan(""); setKesimpulan("");
      onTutup();
    } catch (e) {
      setGalat(pesanGalat(e as GalatApi, "Gagal menyimpan hasil uji"));
    } finally { setMengirim(false); }
  }

  return (
    <BottomSheet terbuka={terbuka} onTutup={onTutup} judul="Hasil Uji Material Baru">
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <label style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>
          Nomor uji
          <input value={nomor} onChange={(e) => setNomor(e.target.value)}
            style={{ width: "100%", marginTop: 6, minHeight: 44, padding: "0 12px", borderRadius: 12, border: "1px solid var(--border)", fontSize: 14 }} />
        </label>
        <label style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>
          Objek (mis. beton kolom lt.2)
          <input value={objek} onChange={(e) => setObjek(e.target.value)}
            style={{ width: "100%", marginTop: 6, minHeight: 44, padding: "0 12px", borderRadius: 12, border: "1px solid var(--border)", fontSize: 14 }} />
        </label>
        <label style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>
          Jenis uji (mis. kuat tekan beton)
          <input value={jenisUji} onChange={(e) => setJenisUji(e.target.value)}
            style={{ width: "100%", marginTop: 6, minHeight: 44, padding: "0 12px", borderRadius: 12, border: "1px solid var(--border)", fontSize: 14 }} />
        </label>
        <label style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>
          Tanggal uji
          <input type="date" value={tanggalUji} onChange={(e) => setTanggalUji(e.target.value)}
            style={{ width: "100%", marginTop: 6, minHeight: 44, padding: "0 12px", borderRadius: 12, border: "1px solid var(--border)", fontSize: 14 }} />
        </label>
        <div style={{ display: "flex", gap: 10 }}>
          <label style={{ flex: 1, fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>
            Nilai hasil
            <input type="number" value={nilaiHasil} onChange={(e) => setNilaiHasil(e.target.value)}
              style={{ width: "100%", marginTop: 6, minHeight: 44, padding: "0 12px", borderRadius: 12, border: "1px solid var(--border)", fontSize: 14 }} />
          </label>
          <label style={{ flex: 1, fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>
            Nilai syarat
            <input type="number" value={nilaiSyarat} onChange={(e) => setNilaiSyarat(e.target.value)}
              style={{ width: "100%", marginTop: 6, minHeight: 44, padding: "0 12px", borderRadius: 12, border: "1px solid var(--border)", fontSize: 14 }} />
          </label>
          <label style={{ flex: 1, fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>
            Satuan
            <input value={satuan} onChange={(e) => setSatuan(e.target.value)} placeholder="MPa"
              style={{ width: "100%", marginTop: 6, minHeight: 44, padding: "0 12px", borderRadius: 12, border: "1px solid var(--border)", fontSize: 14 }} />
          </label>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>Kesimpulan</span>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
            {(["memenuhi", "tidak_memenuhi", "perlu_uji_ulang"] as const).map((k) => (
              <button key={k} type="button" onClick={() => setKesimpulan(k)}
                style={kesimpulan === k ? {
                  minHeight: 40, borderRadius: 10, background: "var(--grad-aksen)", color: "var(--on-navy)",
                  border: "none", fontSize: 12, fontWeight: 700, cursor: "pointer",
                } : {
                  minHeight: 40, borderRadius: 10, background: "var(--surface-subtle)", color: "var(--text-primary)",
                  border: "1px solid var(--border)", fontSize: 12, fontWeight: 600, cursor: "pointer",
                }}>
                {LABEL_KESIMPULAN[k]}
              </button>
            ))}
          </div>
        </div>
        {galat && <div role="alert" style={{ fontSize: 12, color: "var(--on-danger-bg)", padding: 10, borderRadius: 10, background: "var(--danger-bg)", border: "1px solid var(--danger-border)" }}>{galat}</div>}
        <button type="button" onClick={simpan} disabled={mengirim}
          style={{ minHeight: 48, borderRadius: "var(--portal-radius-pill)", background: "var(--grad-aksen)", color: "var(--on-navy)", border: "none", fontSize: 14, fontWeight: 700, cursor: mengirim ? "default" : "pointer" }}>
          {mengirim ? "Menyimpan…" : "Simpan Hasil Uji"}
        </button>
      </div>
    </BottomSheet>
  );
}
