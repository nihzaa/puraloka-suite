"use client";

// ============================================================================
// Sertifikat IPC — daftar per proyek + terbitkan + setujui (Task 32).
//
// TIDAK ADA tombol tolak/hapus — endpoint backend tak menyediakannya (hanya
// `PATCH .../setujui`, diverifikasi `sertifikat-ipc.ts`). Draft yang salah
// dibiarkan sebagai draft (bisa diterbitkan ulang dengan nomor lain).
//
// `PATCH .../setujui` atomik via `.eq('status','draft')` di WHERE — kalau
// nol baris terkena, backend membalas 409 (bukan 500), diterjemahkan lewat
// `pesanGalat`. `nilai_bersih`/`peringatan`/`layak_diajukan` DIHITUNG ulang
// tiap baca (`hitungIpc()`, PURE) — tidak disimpan, jadi selalu konsisten
// dengan komponen yang dibekukan di baris sertifikat.
//
// State galat AKSI (`galatForm`, dipakai baik oleh submit form MAUPUN
// tombol Setujui di kartu luar BottomSheet) sengaja TERPISAH dari galat
// MUAT (`galat` dari `useData`) — pelajaran Task 31: keduanya berbagi satu
// state pernah menghapus pesan gagal-muat begitu aksi gagal.
// ============================================================================

import { useMemo, useState } from "react";
import { FileCheck2, Plus, AlertTriangle } from "lucide-react";
import { useData, invalidasi } from "@/lib/data-cache";
import { api } from "@/lib/api";
import EmptyState from "@/components/portal/EmptyState";
import KepalaPortal from "@/components/portal/KepalaPortal";
import SkeletonCard from "@/components/portal/SkeletonCard";
import StatusBadge, { type VarianStatus } from "@/components/portal/StatusBadge";
import BottomSheet from "@/components/portal/BottomSheet";
import type { ProyekPM, RespSertifikatDaftar, SertifikatIpc, GalatApi } from "../../_bersama/tipe";
import { pesanGalat } from "../../_bersama/tipe";

interface RespProyek { projects: ProyekPM[] }

function fmtRupiah(v: number | string | null | undefined): string {
  if (v === null || v === undefined) return "—";
  const n = typeof v === "string" ? Number(v) : v;
  if (!Number.isFinite(n)) return "—";
  return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(n);
}
function fmtTanggal(s: string | null): string {
  if (!s) return "—";
  return new Date(s).toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric" });
}
const LABEL_STATUS: Record<string, string> = { draft: "Draf", disetujui: "Disetujui" };
const VARIAN_STATUS: Record<string, VarianStatus> = { draft: "pending", disetujui: "approved" };
const LABEL_PERINGATAN: Record<string, string> = {
  periode_negatif: "Progres periode ini lebih rendah dari yang sudah ditagih",
  potongan_melebihi_hak: "Potongan melebihi hak tagih periode ini",
  prestasi_penuh: "Progres 100% — sisa hanya retensi",
  tak_ada_yang_ditagih: "Tidak ada yang bisa ditagih periode ini",
};

export default function PmSertifikatIpcPage() {
  const [proyekId, setProyekId] = useState("");
  const [sheetBaru, setSheetBaru] = useState(false);
  const [form, setForm] = useState({ nomor: "", tanggal: "", progres_diakui_pct: "", retensi_pct: "", potongan_dp: "", potongan_lain: "", potongan_lain_alasan: "", catatan: "" });
  const [mengirim, setMengirim] = useState(false);
  const [galatForm, setGalatForm] = useState<string | null>(null);
  const [menyetujui, setMenyetujui] = useState<string | null>(null);

  const { data: dataProyek } = useData<RespProyek>("/api/v1/projects");
  const daftarProyek = useMemo(() => (dataProyek?.projects ?? []).filter((p) => p.pm), [dataProyek]);
  const proyekAktif = proyekId || daftarProyek[0]?.id || "";

  const url = proyekAktif ? `/api/v1/sertifikat-ipc?project_id=${proyekAktif}&limit=100` : null;
  const { data, memuat, galat } = useData<RespSertifikatDaftar>(url);

  async function terbitkan() {
    if (!proyekAktif) return;
    if (!form.nomor.trim()) { setGalatForm("Nomor sertifikat wajib diisi."); return; }
    setMengirim(true);
    setGalatForm(null);
    try {
      await api.post("/api/v1/sertifikat-ipc", {
        project_id: proyekAktif,
        nomor: form.nomor.trim(),
        tanggal: form.tanggal || undefined,
        progres_diakui_pct: form.progres_diakui_pct ? Number(form.progres_diakui_pct) : undefined,
        retensi_pct: form.retensi_pct ? Number(form.retensi_pct) : undefined,
        potongan_dp: form.potongan_dp ? Number(form.potongan_dp) : undefined,
        potongan_lain: form.potongan_lain ? Number(form.potongan_lain) : undefined,
        potongan_lain_alasan: form.potongan_lain_alasan.trim() || undefined,
        catatan: form.catatan.trim() || undefined,
      });
      setSheetBaru(false);
      setForm({ nomor: "", tanggal: "", progres_diakui_pct: "", retensi_pct: "", potongan_dp: "", potongan_lain: "", potongan_lain_alasan: "", catatan: "" });
      invalidasi(url ?? "");
    } catch (e) {
      setGalatForm(pesanGalat(e as GalatApi, "Gagal menerbitkan sertifikat"));
    } finally {
      setMengirim(false);
    }
  }

  async function setujui(s: SertifikatIpc) {
    setMenyetujui(s.id);
    setGalatForm(null);
    try {
      await api.patch(`/api/v1/sertifikat-ipc/${s.id}/setujui`, {});
      invalidasi(url ?? "");
    } catch (e) {
      setGalatForm(pesanGalat(e as GalatApi, "Gagal menyetujui sertifikat"));
    } finally {
      setMenyetujui(null);
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--gap-bagian)" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <KepalaPortal judul="Sertifikat IPC" />
        <button type="button" onClick={() => { setGalatForm(null); setSheetBaru(true); }} disabled={!proyekAktif}
          style={{ display: "flex", alignItems: "center", gap: 4, padding: "8px 14px", borderRadius: "var(--portal-radius-pill)", border: "none", background: proyekAktif ? "var(--grad-aksen)" : "var(--surface-subtle)", color: proyekAktif ? "var(--on-navy)" : "var(--text-muted)", fontSize: 13, fontWeight: 700, cursor: proyekAktif ? "pointer" : "default", minHeight: 40 }}>
          <Plus size={16} aria-hidden="true" /> Terbitkan
        </button>
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

      {!proyekAktif && <EmptyState icon={FileCheck2} judul="Pilih proyek" deskripsi="Sertifikat IPC tercatat per proyek." />}
      {memuat && <SkeletonCard tinggi={140} />}
      {galat && <EmptyState icon={AlertTriangle} judul="Gagal memuat" deskripsi={pesanGalat(galat as GalatApi, "Coba muat ulang.")} />}

      {galatForm && !sheetBaru && (
        <div role="alert" style={{ padding: 10, borderRadius: 10, background: "var(--danger-bg)", color: "var(--on-danger-bg)", fontSize: 12 }}>
          {galatForm}
        </div>
      )}

      {!memuat && data && data.sertifikat.length === 0 && (
        <EmptyState icon={FileCheck2} judul="Belum ada sertifikat" deskripsi="Terbitkan sertifikat IPC saat termin siap ditagih." />
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {(data?.sertifikat ?? []).map((s) => (
          <div key={s.id} style={{ background: "var(--surface)", borderRadius: "var(--portal-radius-card)", padding: "var(--pad-kartu-lega)", border: "1px solid var(--border)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ fontSize: 14, fontWeight: 700, color: "var(--text-primary)" }}>{s.nomor}</span>
                  <StatusBadge status={VARIAN_STATUS[s.status] ?? "netral"} label={LABEL_STATUS[s.status] ?? s.status} />
                </div>
                <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>{fmtTanggal(s.tanggal)} · Progres diakui {s.progres_diakui_pct}%</div>
              </div>
              <span style={{ fontSize: 15, fontWeight: 700, color: s.hitung.nilai_bersih < 0 ? "var(--danger)" : "var(--text-primary)", fontVariantNumeric: "tabular-nums" }}>
                {fmtRupiah(s.hitung.nilai_bersih)}
              </span>
            </div>

            <div style={{ display: "flex", flexWrap: "wrap", gap: 12, marginTop: 8, fontSize: 11, color: "var(--text-secondary)" }}>
              <span>Prestasi {fmtRupiah(s.hitung.nilai_prestasi)}</span>
              <span>Periode {fmtRupiah(s.hitung.nilai_periode)}</span>
              <span>Retensi {fmtRupiah(s.hitung.retensi)}</span>
            </div>

            {s.hitung.peringatan.length > 0 && (
              <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 4 }}>
                {s.hitung.peringatan.map((p) => (
                  <div key={p} style={{ fontSize: 11, color: "var(--on-warning-bg)", display: "flex", alignItems: "center", gap: 4 }}>
                    <AlertTriangle size={12} aria-hidden="true" /> {LABEL_PERINGATAN[p] ?? p}
                  </div>
                ))}
              </div>
            )}

            {s.status === "draft" && (
              <button type="button" onClick={() => void setujui(s)} disabled={menyetujui === s.id || !s.hitung.layak_diajukan}
                style={{
                  marginTop: 10, minHeight: 40, padding: "0 16px", borderRadius: "var(--portal-radius-pill)", fontSize: 13, fontWeight: 700,
                  border: "none",
                  background: menyetujui === s.id || !s.hitung.layak_diajukan ? "var(--surface-subtle)" : "var(--success)",
                  color: menyetujui === s.id || !s.hitung.layak_diajukan ? "var(--text-muted)" : "var(--on-success-bg)",
                  cursor: menyetujui === s.id || !s.hitung.layak_diajukan ? "default" : "pointer",
                }}>
                {menyetujui === s.id ? "Menyetujui…" : s.hitung.layak_diajukan ? "Setujui" : "Belum layak diajukan"}
              </button>
            )}
          </div>
        ))}
      </div>

      <BottomSheet terbuka={sheetBaru} onTutup={() => setSheetBaru(false)} judul="Terbitkan Sertifikat IPC">
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: "var(--text-secondary)" }}>Nomor Sertifikat *</span>
            <input value={form.nomor} onChange={(e) => setForm((f) => ({ ...f, nomor: e.target.value }))}
              style={{ minHeight: 44, padding: "0 12px", borderRadius: 12, border: "1px solid var(--border)", fontSize: 14 }} />
          </label>
          <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: "var(--text-secondary)" }}>Tanggal</span>
            <input type="date" value={form.tanggal} onChange={(e) => setForm((f) => ({ ...f, tanggal: e.target.value }))}
              style={{ minHeight: 44, padding: "0 12px", borderRadius: 12, border: "1px solid var(--border)", fontSize: 14 }} />
          </label>
          <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: "var(--text-secondary)" }}>Progres Diakui (%) — kosong = ambil progres proyek</span>
            <input type="number" min={0} max={100} value={form.progres_diakui_pct} onChange={(e) => setForm((f) => ({ ...f, progres_diakui_pct: e.target.value }))}
              style={{ minHeight: 44, padding: "0 12px", borderRadius: 12, border: "1px solid var(--border)", fontSize: 14 }} />
          </label>
          <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: "var(--text-secondary)" }}>Retensi (%)</span>
            <input type="number" min={0} max={100} value={form.retensi_pct} onChange={(e) => setForm((f) => ({ ...f, retensi_pct: e.target.value }))}
              style={{ minHeight: 44, padding: "0 12px", borderRadius: 12, border: "1px solid var(--border)", fontSize: 14 }} />
          </label>
          <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: "var(--text-secondary)" }}>Potongan DP</span>
            <input type="number" min={0} value={form.potongan_dp} onChange={(e) => setForm((f) => ({ ...f, potongan_dp: e.target.value }))}
              style={{ minHeight: 44, padding: "0 12px", borderRadius: 12, border: "1px solid var(--border)", fontSize: 14 }} />
          </label>
          <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: "var(--text-secondary)" }}>Potongan Lain + Alasan</span>
            <input type="number" min={0} value={form.potongan_lain} onChange={(e) => setForm((f) => ({ ...f, potongan_lain: e.target.value }))}
              style={{ minHeight: 44, padding: "0 12px", borderRadius: 12, border: "1px solid var(--border)", fontSize: 14, marginBottom: 6 }} />
            <input value={form.potongan_lain_alasan} onChange={(e) => setForm((f) => ({ ...f, potongan_lain_alasan: e.target.value }))}
              placeholder="Alasan potongan lain"
              style={{ minHeight: 44, padding: "0 12px", borderRadius: 12, border: "1px solid var(--border)", fontSize: 14 }} />
          </label>

          {galatForm && (
            <div role="alert" style={{ fontSize: 12, color: "var(--danger)" }}>{galatForm}</div>
          )}

          <button type="button" onClick={() => void terbitkan()} disabled={mengirim}
            style={{
              minHeight: 48, borderRadius: "var(--portal-radius-pill)", fontSize: 14, fontWeight: 700, border: "none",
              background: mengirim ? "var(--surface-subtle)" : "var(--grad-aksen)",
              color: mengirim ? "var(--text-muted)" : "var(--on-navy)",
              cursor: mengirim ? "default" : "pointer",
            }}>
            {mengirim ? "Menerbitkan…" : "Terbitkan Sertifikat"}
          </button>
        </div>
      </BottomSheet>
    </div>
  );
}
