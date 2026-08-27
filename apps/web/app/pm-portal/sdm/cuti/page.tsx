"use client";

// ============================================================================
// Cuti & Izin — Portal PM (Task 39, Tahap 7).
//
// Picker pegawai + picker tahun + kartu saldo (hak/terpakai/tertahan/sisa) +
// daftar pengajuan + form ajukan cuti (BottomSheet) + tombol batalkan.
//
// READ+MANAGE — PM punya `sdm:cuti:view` + `sdm:cuti:manage` (ajukan/
// batalkan cuti) TAPI TIDAK punya `sdm:cuti:approve` (setuju/tolak — wewenang
// atasan/HRD) atau `sdm:cuti:hak` (koreksi jatah). TANPA tombol
// setujui/tolak dan TANPA form koreksi jatah di sini.
//
// Tiga state galat level-halaman TERPISAH (pelajaran Tahap 2-7): galat MUAT
// (EmptyState), galat AJUKAN (di BottomSheet), galat BATALKAN (di kartu
// pengajuan, per-baris) — gagal membatalkan satu baris tak boleh menghapus
// pesan galat pengajuan yang sedang diisi, dan sebaliknya.
// ============================================================================

import { useMemo, useState } from "react";
import { Plane, AlertTriangle, Plus } from "lucide-react";
import { useData, invalidasi } from "@/lib/data-cache";
import { api } from "@/lib/api";
import EmptyState from "@/components/portal/EmptyState";
import KepalaPortal from "@/components/portal/KepalaPortal";
import SkeletonCard from "@/components/portal/SkeletonCard";
import BottomSheet from "@/components/portal/BottomSheet";
import StatusBadge, { type VarianStatus } from "@/components/portal/StatusBadge";
import type { RespDaftarPegawai, RespCutiPegawai, JenisCutiPM, GalatApi } from "../../_bersama/tipe";
import { pesanGalat } from "../../_bersama/tipe";

const LABEL_JENIS: Record<JenisCutiPM, string> = {
  tahunan: "Tahunan", sakit: "Sakit", melahirkan: "Melahirkan",
  penting: "Penting", besar: "Besar", tanpa_gaji: "Tanpa Gaji",
};
const VARIAN_STATUS: Record<string, VarianStatus> = {
  diajukan: "pending", disetujui: "approved", ditolak: "rejected", dibatalkan: "netral",
};
const LABEL_STATUS: Record<string, string> = {
  diajukan: "Diajukan", disetujui: "Disetujui", ditolak: "Ditolak", dibatalkan: "Dibatalkan",
};

export default function PmCutiPage() {
  const [pegawaiId, setPegawaiId] = useState("");
  const [tahun, setTahun] = useState(new Date().getFullYear());
  const [sheetAjukan, setSheetAjukan] = useState(false);
  const [form, setForm] = useState({ jenis: "tahunan" as JenisCutiPM, tanggal_mulai: "", tanggal_selesai: "", alasan: "" });
  const [mengirim, setMengirim] = useState(false);
  const [galatForm, setGalatForm] = useState<string | null>(null);
  const [membatalkan, setMembatalkan] = useState<string | null>(null);
  const [galatBatal, setGalatBatal] = useState<string | null>(null);

  const { data: dataPegawai, memuat: memuatPegawai, galat: galatPegawai } =
    useData<RespDaftarPegawai>("/api/v1/sdm/pegawai");
  const daftarPegawai = useMemo(() => dataPegawai?.pegawai ?? [], [dataPegawai]);
  const pegawaiAktif = pegawaiId || daftarPegawai[0]?.id || "";

  const url = pegawaiAktif ? `/api/v1/sdm/pegawai/${pegawaiAktif}/cuti?tahun=${tahun}` : null;
  const { data, memuat, galat } = useData<RespCutiPegawai>(url);

  async function ajukan() {
    if (!pegawaiAktif) return;
    if (!form.tanggal_mulai || !form.tanggal_selesai) {
      setGalatForm("Tanggal mulai dan selesai wajib diisi.");
      return;
    }
    setMengirim(true);
    setGalatForm(null);
    try {
      await api.post(`/api/v1/sdm/pegawai/${pegawaiAktif}/cuti`, {
        jenis: form.jenis,
        tanggal_mulai: form.tanggal_mulai,
        tanggal_selesai: form.tanggal_selesai,
        alasan: form.alasan.trim() || undefined,
      });
      setSheetAjukan(false);
      setForm({ jenis: "tahunan", tanggal_mulai: "", tanggal_selesai: "", alasan: "" });
      invalidasi(url ?? "");
    } catch (e) {
      setGalatForm(pesanGalat(e as GalatApi, "Pengajuan cuti ditolak"));
    } finally {
      setMengirim(false);
    }
  }

  async function batalkan(id: string) {
    setMembatalkan(id);
    setGalatBatal(null);
    try {
      await api.post(`/api/v1/sdm/cuti/${id}/batal`, {});
      invalidasi(url ?? "");
    } catch (e) {
      setGalatBatal(pesanGalat(e as GalatApi, "Gagal membatalkan cuti"));
    } finally {
      setMembatalkan(null);
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--gap-bagian)" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <KepalaPortal judul="Cuti & Izin" />
        <button type="button" onClick={() => { setGalatForm(null); setSheetAjukan(true); }} disabled={!pegawaiAktif}
          style={{
            display: "flex", alignItems: "center", gap: 4, padding: "8px 14px",
            borderRadius: "var(--portal-radius-pill)", border: "none",
            background: pegawaiAktif ? "var(--grad-aksen)" : "var(--surface-subtle)",
            color: pegawaiAktif ? "var(--on-navy)" : "var(--text-muted)",
            fontSize: 13, fontWeight: 700, cursor: pegawaiAktif ? "pointer" : "default", minHeight: 40,
          }}>
          <Plus size={16} aria-hidden="true" /> Ajukan
        </button>
      </div>

      {memuatPegawai && <SkeletonCard tinggi={44} />}
      {!memuatPegawai && galatPegawai && (
        <EmptyState icon={AlertTriangle} judul="Gagal memuat daftar pegawai"
          deskripsi={pesanGalat(galatPegawai as GalatApi, "Coba muat ulang.")} />
      )}
      {!memuatPegawai && !galatPegawai && daftarPegawai.length === 0 && (
        <EmptyState icon={Plane} judul="Belum ada data pegawai" deskripsi="Daftar pegawai kosong." />
      )}

      {daftarPegawai.length > 0 && (
        <div style={{ display: "flex", gap: 8 }}>
          <label style={{ display: "flex", flexDirection: "column", gap: 6, flex: 1 }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: "var(--text-secondary)" }}>Pegawai</span>
            <select value={pegawaiAktif} onChange={(e) => setPegawaiId(e.target.value)}
              style={{ minHeight: 44, padding: "0 12px", borderRadius: 12, border: "1px solid var(--border)", fontSize: 14, background: "var(--surface)", color: "var(--text-primary)" }}>
              {daftarPegawai.map((p) => (
                <option key={p.id} value={p.id}>{p.orang?.name ?? p.nomor_induk ?? p.id}</option>
              ))}
            </select>
          </label>
          <label style={{ display: "flex", flexDirection: "column", gap: 6, width: 100 }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: "var(--text-secondary)" }}>Tahun</span>
            <input type="number" value={tahun} onChange={(e) => setTahun(Number(e.target.value) || tahun)}
              style={{ minHeight: 44, padding: "0 12px", borderRadius: 12, border: "1px solid var(--border)", fontSize: 14, background: "var(--surface)", color: "var(--text-primary)" }} />
          </label>
        </div>
      )}

      {memuat && <SkeletonCard tinggi={100} />}
      {galat && <EmptyState icon={AlertTriangle} judul="Gagal memuat cuti" deskripsi={pesanGalat(galat as GalatApi, "Coba muat ulang.")} />}

      {!memuat && !galat && data && (
        <>
          <div style={{ background: "var(--surface)", borderRadius: 14, padding: 14, border: "1px solid color-mix(in srgb, var(--border) 40%, transparent)", boxShadow: "var(--naik-1)" }}>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span style={{ fontSize: 12, color: "var(--text-secondary)" }}>Hak {tahun}</span>
              <span style={{ fontSize: 13, fontWeight: 700, color: "var(--text-primary)" }}>{data.saldo.hak} hari</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", marginTop: 4 }}>
              <span style={{ fontSize: 12, color: "var(--text-secondary)" }}>Terpakai</span>
              <span style={{ fontSize: 13, fontWeight: 700, color: "var(--text-primary)" }}>{data.saldo.terpakai} hari</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", marginTop: 4 }}>
              <span style={{ fontSize: 12, color: "var(--text-secondary)" }}>Menunggu putusan</span>
              <span style={{ fontSize: 13, fontWeight: 700, color: "var(--text-primary)" }}>{data.saldo.tertahan} hari</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", marginTop: 6, paddingTop: 6, borderTop: "1px solid var(--border)" }}>
              <span style={{ fontSize: 13, fontWeight: 700, color: "var(--text-primary)" }}>Sisa</span>
              <span style={{ fontSize: 15, fontWeight: 700, color: data.saldo.sisa < 0 ? "var(--danger)" : "var(--text-primary)" }}>{data.saldo.sisa} hari</span>
            </div>
          </div>

          {data.ambil.length === 0 && (
            <EmptyState icon={Plane} judul="Belum ada pengajuan" deskripsi="Cuti/izin yang diajukan akan muncul di sini." />
          )}
          {galatBatal && (
            <div role="alert" style={{ fontSize: 12, color: "var(--on-danger-bg)", padding: 10, borderRadius: 10, background: "var(--danger-bg)", border: "1px solid var(--danger-border)" }}>
              {galatBatal}
            </div>
          )}
          {data.ambil.length > 0 && (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {data.ambil.map((a) => (
                <div key={a.id} style={{ background: "var(--surface)", borderRadius: 12, padding: 12, border: "1px solid var(--border)" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>{LABEL_JENIS[a.jenis]} · {a.jumlah_hari} hari</div>
                      <div style={{ fontSize: 11, color: "var(--text-secondary)" }}>{a.tanggal_mulai} — {a.tanggal_selesai}</div>
                    </div>
                    <StatusBadge status={VARIAN_STATUS[a.status]} label={LABEL_STATUS[a.status]} />
                  </div>
                  {a.alasan_tolak && <div style={{ fontSize: 11, color: "var(--danger)", marginTop: 6 }}>Ditolak: {a.alasan_tolak}</div>}
                  {(a.status === "diajukan" || a.status === "disetujui") && (
                    <button type="button" onClick={() => void batalkan(a.id)} disabled={membatalkan === a.id}
                      style={{ marginTop: 8, fontSize: 12, fontWeight: 600, color: "var(--danger)", background: "none", border: "none", padding: 0, cursor: membatalkan === a.id ? "default" : "pointer" }}>
                      {membatalkan === a.id ? "Membatalkan…" : "Batalkan"}
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </>
      )}

      <BottomSheet terbuka={sheetAjukan} onTutup={() => setSheetAjukan(false)} judul="Ajukan Cuti">
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: "var(--text-secondary)" }}>Jenis</span>
            <select value={form.jenis} onChange={(e) => setForm((f) => ({ ...f, jenis: e.target.value as JenisCutiPM }))}
              style={{ minHeight: 44, padding: "0 12px", borderRadius: 12, border: "1px solid var(--border)", fontSize: 14 }}>
              {(Object.keys(LABEL_JENIS) as JenisCutiPM[]).map((j) => <option key={j} value={j}>{LABEL_JENIS[j]}</option>)}
            </select>
          </label>
          <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: "var(--text-secondary)" }}>Tanggal Mulai</span>
            <input type="date" value={form.tanggal_mulai} onChange={(e) => setForm((f) => ({ ...f, tanggal_mulai: e.target.value }))}
              style={{ minHeight: 44, padding: "0 12px", borderRadius: 12, border: "1px solid var(--border)", fontSize: 14 }} />
          </label>
          <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: "var(--text-secondary)" }}>Tanggal Selesai</span>
            <input type="date" value={form.tanggal_selesai} onChange={(e) => setForm((f) => ({ ...f, tanggal_selesai: e.target.value }))}
              style={{ minHeight: 44, padding: "0 12px", borderRadius: 12, border: "1px solid var(--border)", fontSize: 14 }} />
          </label>
          <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: "var(--text-secondary)" }}>Alasan</span>
            <input value={form.alasan} onChange={(e) => setForm((f) => ({ ...f, alasan: e.target.value }))}
              style={{ minHeight: 44, padding: "0 12px", borderRadius: 12, border: "1px solid var(--border)", fontSize: 14 }} />
          </label>
          {galatForm && (
            <div role="alert" style={{ fontSize: 12, color: "var(--on-danger-bg)", padding: 10, borderRadius: 10, background: "var(--danger-bg)", border: "1px solid var(--danger-border)" }}>
              {galatForm}
            </div>
          )}
          <button type="button" onClick={() => void ajukan()} disabled={mengirim}
            style={{
              minHeight: 48, borderRadius: "var(--portal-radius-pill)", border: "none",
              background: mengirim ? "var(--surface-subtle)" : "var(--grad-aksen)",
              color: mengirim ? "var(--text-muted)" : "var(--on-navy)",
              fontSize: 14, fontWeight: 700, cursor: mengirim ? "default" : "pointer",
            }}>
            {mengirim ? "Mengajukan…" : "Ajukan Cuti"}
          </button>
        </div>
      </BottomSheet>
    </div>
  );
}
