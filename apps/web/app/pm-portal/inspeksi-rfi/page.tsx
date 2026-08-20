"use client";

// ============================================================================
// Inspeksi & RFI — versi PM (memutuskan/mengelola), bukan versi mandor
// (mengajukan).
//
// ── Inspeksi (izin cor/tutup)
// PM memutuskan LOLOS/TIDAK LOLOS — butuh `inspeksi:periksa` (terpisah dari
// `inspeksi:manage`, diverifikasi ke `inspeksi.ts:290-311`), dan PM TIDAK
// BOLEH memutuskan permintaan yang ia ajukan sendiri (backend menolak 403).
// Endpoint: GET /api/v1/projects/:projectId/inspections?status=diminta
//           PATCH /api/v1/inspections/:id/status
//
// ── RFI (surat resmi ke konsultan)
// PM mengelola siklus penuh: draft -> terkirim -> dijawab -> ditutup. Cukup
// `rfi:manage`, tanpa pemisahan verifikator (surat ke pihak eksternal, bukan
// pekerjaan internal yang perlu dicek silang).
// Endpoint: GET /api/v1/projects/:projectId/rfis
//           PATCH /api/v1/rfis/:id/status
// ============================================================================

import { useMemo, useState } from "react";
import { FileQuestion, Send } from "lucide-react";
import { useData, invalidasi } from "@/lib/data-cache";
import { api } from "@/lib/api";
import SegmentedTab from "@/components/portal/SegmentedTab";
import BottomSheet from "@/components/portal/BottomSheet";
import StatusBadge, { type VarianStatus } from "@/components/portal/StatusBadge";
import EmptyState from "@/components/portal/EmptyState";
import SkeletonCard from "@/components/portal/SkeletonCard";
import type { Inspeksi, Rfi, ProyekPM, GalatApi } from "../_bersama/tipe";
import { pesanGalat } from "../_bersama/tipe";

interface RespProyek { projects: ProyekPM[] }
interface RespInspeksi { data: Inspeksi[] }
interface RespRfi { data: Rfi[] }

const LABEL_INSPEKSI: Record<string, string> = {
  diminta: "Menunggu Pemeriksaan", dijadwalkan: "Dijadwalkan",
  lolos: "Lolos", tidak_lolos: "Tidak Lolos", dibatalkan: "Dibatalkan",
};
const VARIAN_INSPEKSI: Record<string, VarianStatus> = {
  diminta: "pending", dijadwalkan: "pending", lolos: "approved", tidak_lolos: "rejected", dibatalkan: "netral",
};

const LABEL_RFI: Record<string, string> = {
  draft: "Draft", terkirim: "Terkirim", dijawab: "Dijawab", ditutup: "Ditutup", dibatalkan: "Dibatalkan",
};
const VARIAN_RFI: Record<string, VarianStatus> = {
  draft: "netral", terkirim: "pending", dijawab: "approved", ditutup: "approved", dibatalkan: "netral",
};

export default function PmInspeksiRfiPage() {
  const [modul, setModul] = useState<"inspeksi" | "rfi">("inspeksi");
  const [proyekId, setProyekId] = useState("");
  const [inspeksiDipilih, setInspeksiDipilih] = useState<Inspeksi | null>(null);
  const [rfiDipilih, setRfiDipilih] = useState<Rfi | null>(null);
  const [catatanHasil, setCatatanHasil] = useState("");
  const [jawabanRfi, setJawabanRfi] = useState("");
  const [mengirim, setMengirim] = useState(false);
  const [galatForm, setGalatForm] = useState<string | null>(null);

  const { data: dataProyek } = useData<RespProyek>("/api/v1/projects");
  const daftarProyek = useMemo(() => (dataProyek?.projects ?? []).filter((p) => p.pm), [dataProyek]);
  const proyekAktif = proyekId || daftarProyek[0]?.id || "";

  const urlInspeksi = proyekAktif ? `/api/v1/projects/${proyekAktif}/inspections?status=diminta` : null;
  const { data: dataInspeksi, memuat: memuatInspeksi, galat: galatInspeksi } =
    useData<RespInspeksi>(modul === "inspeksi" ? urlInspeksi : null);

  const urlRfi = proyekAktif ? `/api/v1/projects/${proyekAktif}/rfis` : null;
  const { data: dataRfi, memuat: memuatRfi, galat: galatRfi } =
    useData<RespRfi>(modul === "rfi" ? urlRfi : null);

  async function putuskanInspeksi(status: "lolos" | "tidak_lolos") {
    if (!inspeksiDipilih) return;
    if (status === "tidak_lolos" && catatanHasil.trim().length === 0) {
      setGalatForm("Catatan hasil wajib diisi saat tidak lolos.");
      return;
    }
    setMengirim(true);
    setGalatForm(null);
    try {
      await api.patch(`/api/v1/inspections/${inspeksiDipilih.id}/status`, {
        status, hasil_catatan: catatanHasil.trim() || undefined,
      });
      setInspeksiDipilih(null);
      setCatatanHasil("");
      invalidasi(urlInspeksi ?? "");
    } catch (e) {
      setGalatForm(pesanGalat(e as GalatApi, "Gagal memutuskan hasil pemeriksaan"));
    } finally {
      setMengirim(false);
    }
  }

  async function kirimJawabanRfi() {
    if (!rfiDipilih) return;
    if (jawabanRfi.trim().length === 0) {
      setGalatForm("Isi jawaban wajib diisi.");
      return;
    }
    setMengirim(true);
    setGalatForm(null);
    try {
      await api.patch(`/api/v1/rfis/${rfiDipilih.id}/status`, {
        status: "dijawab", jawaban: jawabanRfi.trim(),
      });
      setRfiDipilih(null);
      setJawabanRfi("");
      invalidasi(urlRfi ?? "");
    } catch (e) {
      setGalatForm(pesanGalat(e as GalatApi, "Gagal mengirim jawaban RFI"));
    } finally {
      setMengirim(false);
    }
  }

  async function kirimRfi(item: Rfi) {
    try {
      await api.patch(`/api/v1/rfis/${item.id}/status`, { status: "terkirim" });
      invalidasi(urlRfi ?? "");
    } catch (e) {
      setGalatForm(pesanGalat(e as GalatApi, "Gagal mengirim RFI"));
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <h1 style={{ fontSize: 20, fontWeight: 700, color: "var(--text-primary)", margin: 0 }}>
        Inspeksi &amp; RFI
      </h1>

      {daftarProyek.length > 1 && (
        <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <span style={{ fontSize: 12, fontWeight: 600, color: "var(--text-secondary)" }}>Proyek</span>
          <select
            value={proyekAktif}
            onChange={(e) => setProyekId(e.target.value)}
            style={{ minHeight: 44, padding: "0 12px", borderRadius: 12, border: "1px solid var(--border)", fontSize: 14, background: "var(--surface)", color: "var(--text-primary)" }}
          >
            {daftarProyek.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </label>
      )}

      <SegmentedTab
        opsi={[{ value: "inspeksi", label: "Inspeksi" }, { value: "rfi", label: "RFI" }]}
        aktif={modul}
        onUbah={(v) => setModul(v as typeof modul)}
      />

      {!proyekAktif && <EmptyState icon={FileQuestion} judul="Pilih proyek" deskripsi="Inspeksi dan RFI tercatat per proyek." />}

      {proyekAktif && modul === "inspeksi" && (
        <>
          {memuatInspeksi && <SkeletonCard tinggi={80} />}
          {galatInspeksi && <EmptyState icon={FileQuestion} judul="Gagal memuat" deskripsi={pesanGalat(galatInspeksi as GalatApi, "Coba muat ulang.")} />}
          {!memuatInspeksi && !galatInspeksi && (dataInspeksi?.data?.length ?? 0) === 0 && (
            <EmptyState icon={FileQuestion} judul="Tidak ada yang perlu diperiksa" deskripsi="Permintaan izin cor/tutup yang menunggu pemeriksaan Anda akan muncul di sini." />
          )}
          {!memuatInspeksi && (dataInspeksi?.data ?? []).map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => { setInspeksiDipilih(item); setCatatanHasil(""); setGalatForm(null); }}
              style={{ textAlign: "left", padding: 16, borderRadius: 16, background: "var(--surface)", border: "1px solid var(--border)", display: "flex", flexDirection: "column", gap: 8, cursor: "pointer" }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
                <div style={{ flex: 1 }}>
                  <span style={{ fontSize: 14, fontWeight: 700, color: "var(--text-primary)" }}>{item.judul ?? item.nomor}</span>
                  <div style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: 2 }}>{item.lokasi ?? "—"}</div>
                </div>
                <StatusBadge status={VARIAN_INSPEKSI[item.status ?? ""] ?? "netral"} label={LABEL_INSPEKSI[item.status ?? ""] ?? item.status ?? "—"} />
              </div>
              {item.pemohon?.name && <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>Diminta: {item.pemohon.name}</div>}
            </button>
          ))}
        </>
      )}

      {proyekAktif && modul === "rfi" && (
        <>
          {memuatRfi && <SkeletonCard tinggi={80} />}
          {galatRfi && <EmptyState icon={FileQuestion} judul="Gagal memuat" deskripsi={pesanGalat(galatRfi as GalatApi, "Coba muat ulang.")} />}
          {!memuatRfi && !galatRfi && (dataRfi?.data?.length ?? 0) === 0 && (
            <EmptyState icon={FileQuestion} judul="Belum ada RFI" deskripsi="Pertanyaan resmi ke konsultan/pemberi kerja akan muncul di sini." />
          )}
          {!memuatRfi && (dataRfi?.data ?? []).map((item) => (
            <div key={item.id} style={{ padding: 16, borderRadius: 16, background: "var(--surface)", border: "1px solid var(--border)", display: "flex", flexDirection: "column", gap: 8 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
                <div style={{ flex: 1 }}>
                  <span style={{ fontSize: 14, fontWeight: 700, color: "var(--text-primary)" }}>{item.perihal ?? item.nomor}</span>
                  {item.pertanyaan && <div style={{ fontSize: 13, color: "var(--text-secondary)", marginTop: 4 }}>{item.pertanyaan}</div>}
                </div>
                <StatusBadge status={VARIAN_RFI[item.status ?? ""] ?? "netral"} label={LABEL_RFI[item.status ?? ""] ?? item.status ?? "—"} />
              </div>
              {item.jawaban && (
                <div style={{ fontSize: 13, color: "var(--text-primary)", padding: 10, borderRadius: 10, background: "var(--surface-subtle)" }}>
                  {item.jawaban}
                </div>
              )}
              {item.status === "draft" && (
                <button
                  type="button"
                  onClick={() => kirimRfi(item)}
                  style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 6, minHeight: 40, padding: "0 14px", borderRadius: "var(--portal-radius-pill)", background: "var(--grad-aksen)", color: "var(--on-navy)", border: "none", fontSize: 13, fontWeight: 700, cursor: "pointer" }}
                >
                  <Send size={14} aria-hidden="true" /> Kirim RFI
                </button>
              )}
              {item.status === "terkirim" && (
                <button
                  type="button"
                  onClick={() => { setRfiDipilih(item); setJawabanRfi(""); setGalatForm(null); }}
                  style={{ minHeight: 40, padding: "0 14px", borderRadius: "var(--portal-radius-pill)", background: "var(--surface)", color: "var(--navy)", border: "1px solid var(--navy)", fontSize: 13, fontWeight: 700, cursor: "pointer" }}
                >
                  Catat Jawaban
                </button>
              )}
            </div>
          ))}
        </>
      )}

      <BottomSheet terbuka={!!inspeksiDipilih} onTutup={() => setInspeksiDipilih(null)} judul="Putuskan Hasil Pemeriksaan">
        {inspeksiDipilih && (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: "var(--text-primary)" }}>{inspeksiDipilih.judul ?? inspeksiDipilih.nomor}</div>
            <label style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>
              Catatan hasil (wajib bila tidak lolos)
              <textarea
                value={catatanHasil}
                onChange={(e) => setCatatanHasil(e.target.value)}
                rows={3}
                style={{ width: "100%", marginTop: 6, padding: 12, borderRadius: 12, border: "1px solid var(--border)", fontSize: 14, fontFamily: "inherit" }}
              />
            </label>
            {galatForm && (
              <div role="alert" style={{ fontSize: 12, color: "var(--on-danger-bg)", padding: 10, borderRadius: 10, background: "var(--danger-bg)", border: "1px solid var(--danger-border)" }}>
                {galatForm}
              </div>
            )}
            <div style={{ display: "flex", gap: 10 }}>
              <button type="button" onClick={() => putuskanInspeksi("tidak_lolos")} disabled={mengirim} style={{ flex: 1, minHeight: 48, borderRadius: "var(--portal-radius-pill)", background: "var(--danger-bg)", color: "var(--danger)", border: "1px solid var(--danger-border)", fontSize: 14, fontWeight: 700, cursor: mengirim ? "default" : "pointer" }}>
                Tidak Lolos
              </button>
              <button type="button" onClick={() => putuskanInspeksi("lolos")} disabled={mengirim} style={{ flex: 1, minHeight: 48, borderRadius: "var(--portal-radius-pill)", background: "var(--grad-aksen)", color: "var(--on-navy)", border: "none", fontSize: 14, fontWeight: 700, cursor: mengirim ? "default" : "pointer" }}>
                {mengirim ? "Memproses…" : "Lolos"}
              </button>
            </div>
          </div>
        )}
      </BottomSheet>

      <BottomSheet terbuka={!!rfiDipilih} onTutup={() => setRfiDipilih(null)} judul="Catat Jawaban RFI">
        {rfiDipilih && (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: "var(--text-primary)" }}>{rfiDipilih.perihal ?? rfiDipilih.nomor}</div>
            {rfiDipilih.pertanyaan && <div style={{ fontSize: 13, color: "var(--text-secondary)" }}>{rfiDipilih.pertanyaan}</div>}
            <label style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>
              Jawaban
              <textarea
                value={jawabanRfi}
                onChange={(e) => setJawabanRfi(e.target.value)}
                rows={4}
                style={{ width: "100%", marginTop: 6, padding: 12, borderRadius: 12, border: "1px solid var(--border)", fontSize: 14, fontFamily: "inherit" }}
              />
            </label>
            {galatForm && (
              <div role="alert" style={{ fontSize: 12, color: "var(--on-danger-bg)", padding: 10, borderRadius: 10, background: "var(--danger-bg)", border: "1px solid var(--danger-border)" }}>
                {galatForm}
              </div>
            )}
            <button type="button" onClick={kirimJawabanRfi} disabled={mengirim} style={{ minHeight: 48, borderRadius: "var(--portal-radius-pill)", background: "var(--grad-aksen)", color: "var(--on-navy)", border: "none", fontSize: 14, fontWeight: 700, cursor: mengirim ? "default" : "pointer" }}>
              {mengirim ? "Mengirim…" : "Simpan Jawaban"}
            </button>
          </div>
        )}
      </BottomSheet>
    </div>
  );
}
