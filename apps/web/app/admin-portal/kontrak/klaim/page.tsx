"use client";

// ============================================================================
// Klaim Kontraktual — Portal Admin/Direktur (Task 9, Tahap 2). Salinan APA
// ADANYA dari `pm-portal/kontrak-lengkap/klaim/page.tsx` (Task 14) — endpoint
// backend tak beda per role pemanggil, admin/direktur punya `projects:view`+
// `projects:edit` PERSIS sama seperti PM (live 2026-08-22).
//
// ⚠️ Nama "klaim" bentrok DUA modul berbeda — jangan tertukar:
//   - Ini    (`kt-claims`, tabel `contract_claims`, migrasi 184) = tuntutan
//     biaya kontraktor ke pemberi kerja. Endpoint `rantai-kontrak.ts`,
//     permission `projects:view`/`projects:edit`.
//   - `klaim-perjalanan.ts` (`klaim_perjalanan`, permission `klaim:*`) adalah
//     penggantian biaya karyawan — ENTITAS LAIN, DI LUAR scope halaman ini.
//
// Endpoint:
//   GET   /api/v1/projects/:id/claims   — projects:view
//   POST  /api/v1/projects/:id/claims   — projects:edit
//   PATCH /api/v1/claims/:id/decide     — projects:edit
//
// Klaim mewarisi tenancy lewat PROYEK (bukan lewat id klaim sendiri) — body
// PATCH wajib menyertakan `project_id`, pola sama `DokumenKontrak`/`Spk`.
//
// ⚠️ `validasiKeputusanKlaim` (lib/klaim-kontraktual.ts) menolak (422) bila
// status "disetujui" tapi nilai disetujui BUKAN PERSIS nilai diklaim — nilai
// yang berbeda wajib pakai "disetujui_sebagian". Form di sini memberi field
// nilai disetujui untuk KEDUA status supaya admin bisa mengoreksi turun tanpa
// tebak-tebak status mana yang diterima backend; galat 422 tetap disurfeskan
// lewat galatForm bila kombinasinya salah. Perilaku disalin apa adanya.
//
// ⚠️ Beda SATU-SATUNYA dari versi PM: `daftarProyek` TIDAK memfilter
// `.filter((p) => p.pm)` — pola sama Task 7 (`GET /api/v1/projects`
// company-wide, admin lihat SEMUA proyek sebagai kandidat picker, termasuk
// yang belum ditugaskan PM).
//
// Halaman ini TIDAK dapat entri NAV_ITEMS sendiri — dijangkau lewat tautan
// di badan halaman Register Kontrak (`/admin-portal/kontrak/register`),
// pola sama `/admin-portal/kontrak/asuransi` (Task 8) dan
// `mandor-portal/progress`/`laporan`, didaftarkan WAJAR di
// `audit-nav-yatim.mjs`.
// ============================================================================

import { useMemo, useState } from "react";
import { Scale, Plus } from "lucide-react";
import { useData, invalidasi } from "@/lib/data-cache";
import { api } from "@/lib/api";
import { formatRupiah, formatTanggal } from "@/lib/format";
import EmptyState from "@/components/portal/EmptyState";
import KepalaPortal from "@/components/portal/KepalaPortal";
import SkeletonCard from "@/components/portal/SkeletonCard";
import StatusBadge, { type VarianStatus } from "@/components/portal/StatusBadge";
import BottomSheet from "@/components/portal/BottomSheet";
import type { ProyekPM, RespKlaimKontraktual, KlaimKontraktual, GalatApi } from "../../_bersama/tipe";
import { pesanGalat } from "../../_bersama/tipe";
import { Pilihan } from "@/components/pilihan";

interface RespProyek { projects: ProyekPM[] }

const LABEL_STATUS: Record<string, string> = {
  draft: "Draf", diberitahukan: "Diberitahukan", diajukan: "Diajukan",
  disetujui: "Disetujui", disetujui_sebagian: "Disetujui Sebagian", ditolak: "Ditolak", gugur: "Gugur",
};
const VARIAN_STATUS: Record<string, VarianStatus> = {
  draft: "netral", diberitahukan: "pending", diajukan: "pending",
  disetujui: "approved", disetujui_sebagian: "approved", ditolak: "rejected", gugur: "rejected",
};
const LABEL_BATAS: Record<string, string> = {
  tak_diatur: "Batas tak diatur", aman: "Aman", berjalan: "Berjalan",
  mendesak: "Mendesak", terlambat: "Terlambat", tak_terbaca: "Tanggal tak terbaca",
};

export default function AdminKlaimKontraktualPage() {
  const [proyekId, setProyekId] = useState("");
  const [sheetBaru, setSheetBaru] = useState(false);
  const [formBaru, setFormBaru] = useState({
    claim_number: "", title: "", event_date: "", amount_claimed: "",
    notified_at: "", notice_days_limit: "",
  });

  const [klaimDiputuskan, setKlaimDiputuskan] = useState<KlaimKontraktual | null>(null);
  const [statusPutus, setStatusPutus] = useState<"disetujui" | "disetujui_sebagian" | "ditolak" | "gugur">("disetujui");
  const [amountApproved, setAmountApproved] = useState("");
  const [decisionNote, setDecisionNote] = useState("");

  const [mengirim, setMengirim] = useState(false);
  const [galatForm, setGalatForm] = useState<string | null>(null);

  const { data: dataProyek } = useData<RespProyek>("/api/v1/projects");
  const daftarProyek = useMemo(() => dataProyek?.projects ?? [], [dataProyek]);
  const proyekAktif = proyekId || daftarProyek[0]?.id || "";

  const url = proyekAktif ? `/api/v1/projects/${proyekAktif}/claims` : null;
  const { data, memuat, galat } = useData<RespKlaimKontraktual>(url);

  async function ajukanKlaim() {
    if (!proyekAktif) return;
    if (formBaru.claim_number.trim().length === 0) {
      setGalatForm("Nomor klaim wajib diisi.");
      return;
    }
    if (formBaru.title.trim().length < 10) {
      setGalatForm("Judul klaim wajib diisi, minimal 10 karakter — ini yang dibaca pemberi kerja saat klaim diperiksa.");
      return;
    }
    if (!formBaru.event_date) {
      setGalatForm("Tanggal peristiwa wajib diisi.");
      return;
    }
    const nilai = Number(formBaru.amount_claimed);
    if (!Number.isFinite(nilai) || nilai < 0) {
      setGalatForm("Nilai klaim tidak sah.");
      return;
    }
    setMengirim(true);
    setGalatForm(null);
    try {
      await api.post(`/api/v1/projects/${proyekAktif}/claims`, {
        claim_number: formBaru.claim_number.trim(),
        title: formBaru.title.trim(),
        event_date: formBaru.event_date,
        amount_claimed: nilai,
        notified_at: formBaru.notified_at || undefined,
        notice_days_limit: formBaru.notice_days_limit ? Number(formBaru.notice_days_limit) : undefined,
      });
      setSheetBaru(false);
      setFormBaru({ claim_number: "", title: "", event_date: "", amount_claimed: "", notified_at: "", notice_days_limit: "" });
      invalidasi(url ?? "");
    } catch (e) {
      setGalatForm(pesanGalat(e as GalatApi, "Gagal mengajukan klaim"));
    } finally {
      setMengirim(false);
    }
  }

  async function putuskanKlaim() {
    if (!klaimDiputuskan) return;
    setMengirim(true);
    setGalatForm(null);
    try {
      const butuhNilai = statusPutus === "disetujui" || statusPutus === "disetujui_sebagian";
      await api.patch(`/api/v1/claims/${klaimDiputuskan.id}/decide`, {
        project_id: klaimDiputuskan.project_id,
        status: statusPutus,
        amount_approved: butuhNilai ? Number(amountApproved) : undefined,
        decision_note: decisionNote.trim() || undefined,
      });
      setKlaimDiputuskan(null);
      setAmountApproved("");
      setDecisionNote("");
      invalidasi(url ?? "");
    } catch (e) {
      setGalatForm(pesanGalat(e as GalatApi, "Gagal memutuskan klaim"));
    } finally {
      setMengirim(false);
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--gap-bagian)" }}>
      <KepalaPortal judul="Klaim Kontraktual" />

      {daftarProyek.length > 1 && (
        <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <span style={{ fontSize: 12, fontWeight: 600, color: "var(--text-secondary)" }}>Proyek</span>
          <Pilihan
            value={proyekAktif}
            onChange={(e) => setProyekId(e.target.value)}
            style={{ minHeight: 44, padding: "0 12px", borderRadius: 12, border: "1px solid var(--border)", fontSize: 14, background: "var(--surface)", color: "var(--text-primary)" }}
          >
            {daftarProyek.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </Pilihan>
        </label>
      )}

      {!proyekAktif && <EmptyState icon={Scale} judul="Pilih proyek" deskripsi="Klaim tercatat per proyek." />}
      {memuat && <SkeletonCard tinggi={140} />}
      {galat && <EmptyState icon={Scale} judul="Gagal memuat" deskripsi={pesanGalat(galat as GalatApi, "Coba muat ulang.")} />}

      {!memuat && data && (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {[
            { label: "Total Diklaim", value: formatRupiah(data.ringkas.total_diklaim), warna: "var(--navy)" },
            { label: "Berisiko Gugur", value: String(data.ringkas.berisiko_gugur), warna: "var(--danger)" },
            { label: "Mendesak", value: String(data.ringkas.mendesak), warna: "var(--warning)" },
          ].map((k) => (
            <div key={k.label} style={{ flex: "1 1 30%", padding: "var(--pad-kartu)", borderRadius: 12, background: "var(--surface)", border: "1px solid var(--border)" }}>
              <div style={{ fontSize: 16, fontWeight: 700, color: k.warna }}>{k.value}</div>
              <div style={{ fontSize: "var(--t-kecil)", color: "var(--text-secondary)" }}>{k.label}</div>
            </div>
          ))}
        </div>
      )}

      {!memuat && (data?.data?.length ?? 0) === 0 && (
        <EmptyState icon={Scale} judul="Belum ada klaim" deskripsi="Tuntutan biaya kontraktual proyek ini akan muncul di sini." />
      )}

      {!memuat && data?.data.map((k) => (
        <div key={k.id} style={{ padding: "var(--pad-kartu-lega)", borderRadius: 16, background: "var(--surface)", border: "1px solid var(--border)", display: "flex", flexDirection: "column", gap: 8 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
            <div>
              <div style={{ fontSize: 14, fontWeight: 700, color: "var(--text-primary)" }}>{k.claim_number}</div>
              <div style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: 2 }}>{k.title}</div>
            </div>
            <StatusBadge status={VARIAN_STATUS[k.status] ?? "netral"} label={LABEL_STATUS[k.status] ?? k.status} />
          </div>
          {(k.batas_pemberitahuan.keadaan === "mendesak" || k.batas_pemberitahuan.keadaan === "terlambat") && (
            <div role="alert" style={{ fontSize: "var(--t-kecil)", fontWeight: 700, color: "var(--danger)", background: "var(--danger-bg)", padding: "4px 10px", borderRadius: 8, alignSelf: "flex-start" }}>
              {LABEL_BATAS[k.batas_pemberitahuan.keadaan]}
              {k.batas_pemberitahuan.sisaHari !== null && ` · sisa ${k.batas_pemberitahuan.sisaHari} hari`}
            </div>
          )}
          <div style={{ fontSize: 18, fontWeight: 700, color: "var(--navy)" }}>{formatRupiah(k.amount_claimed)}</div>
          {k.amount_approved !== null && (
            <div style={{ fontSize: 13, color: "var(--success)" }}>Disetujui: {formatRupiah(k.amount_approved)}</div>
          )}
          {k.decision_note && (
            <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>Catatan: {k.decision_note}</div>
          )}
          <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>Peristiwa: {formatTanggal(k.event_date)}</div>
          {(k.status === "diajukan" || k.status === "diberitahukan") && (
            <button
              type="button"
              onClick={() => {
                setKlaimDiputuskan(k);
                setStatusPutus("disetujui");
                setAmountApproved(String(k.amount_claimed));
                setDecisionNote("");
                setGalatForm(null);
              }}
              style={{ minHeight: 40, borderRadius: "var(--portal-radius-pill)", background: "var(--grad-aksen)", color: "var(--on-navy)", border: "none", fontSize: 13, fontWeight: 700, cursor: "pointer" }}
            >
              Putuskan
            </button>
          )}
        </div>
      ))}

      {proyekAktif && (
        <button
          type="button"
          onClick={() => {
            setSheetBaru(true);
            setFormBaru({ claim_number: "", title: "", event_date: "", amount_claimed: "", notified_at: "", notice_days_limit: "" });
            setGalatForm(null);
          }}
          style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, padding: "var(--pad-kartu-lega)", borderRadius: "var(--portal-radius-pill)", background: "var(--grad-aksen)", color: "var(--on-navy)", border: "none", fontSize: 14, fontWeight: 700, cursor: "pointer" }}
        >
          <Plus size={18} aria-hidden="true" /> Klaim Baru
        </button>
      )}

      <BottomSheet terbuka={sheetBaru} onTutup={() => setSheetBaru(false)} judul="Klaim Baru">
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <label style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>
            Nomor Klaim
            <input type="text" value={formBaru.claim_number} onChange={(e) => setFormBaru((f) => ({ ...f, claim_number: e.target.value }))}
              style={{ width: "100%", marginTop: 6, minHeight: 44, padding: "0 12px", borderRadius: 12, border: "1px solid var(--border)", fontSize: 14, background: "var(--surface)", color: "var(--text-primary)", boxSizing: "border-box" }} />
          </label>
          <label style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>
            Judul (min 10 karakter)
            <input type="text" value={formBaru.title} onChange={(e) => setFormBaru((f) => ({ ...f, title: e.target.value }))}
              style={{ width: "100%", marginTop: 6, minHeight: 44, padding: "0 12px", borderRadius: 12, border: "1px solid var(--border)", fontSize: 14, background: "var(--surface)", color: "var(--text-primary)", boxSizing: "border-box" }} />
          </label>
          <label style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>
            Tanggal Peristiwa
            <input type="date" value={formBaru.event_date} onChange={(e) => setFormBaru((f) => ({ ...f, event_date: e.target.value }))}
              style={{ width: "100%", marginTop: 6, minHeight: 44, padding: "0 12px", borderRadius: 12, border: "1px solid var(--border)", fontSize: 14, background: "var(--surface)", color: "var(--text-primary)", boxSizing: "border-box" }} />
          </label>
          <label style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>
            Nilai Diklaim (Rp)
            <input type="number" value={formBaru.amount_claimed} onChange={(e) => setFormBaru((f) => ({ ...f, amount_claimed: e.target.value }))}
              style={{ width: "100%", marginTop: 6, minHeight: 44, padding: "0 12px", borderRadius: 12, border: "1px solid var(--border)", fontSize: 14, background: "var(--surface)", color: "var(--text-primary)", boxSizing: "border-box" }} />
          </label>
          <label style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>
            Tanggal Pemberitahuan (opsional)
            <input type="date" value={formBaru.notified_at} onChange={(e) => setFormBaru((f) => ({ ...f, notified_at: e.target.value }))}
              style={{ width: "100%", marginTop: 6, minHeight: 44, padding: "0 12px", borderRadius: 12, border: "1px solid var(--border)", fontSize: 14, background: "var(--surface)", color: "var(--text-primary)", boxSizing: "border-box" }} />
          </label>
          <label style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>
            Batas Hari Pemberitahuan (opsional)
            <input type="number" value={formBaru.notice_days_limit} onChange={(e) => setFormBaru((f) => ({ ...f, notice_days_limit: e.target.value }))}
              style={{ width: "100%", marginTop: 6, minHeight: 44, padding: "0 12px", borderRadius: 12, border: "1px solid var(--border)", fontSize: 14, background: "var(--surface)", color: "var(--text-primary)", boxSizing: "border-box" }} />
          </label>
          {galatForm && (
            <div role="alert" style={{ fontSize: 12, color: "var(--on-danger-bg)", padding: 10, borderRadius: 10, background: "var(--danger-bg)", border: "1px solid var(--danger-border)" }}>
              {galatForm}
            </div>
          )}
          <button type="button" onClick={() => void ajukanKlaim()} disabled={mengirim}
            style={{ minHeight: 48, borderRadius: "var(--portal-radius-pill)", background: "var(--grad-aksen)", color: "var(--on-navy)", border: "none", fontSize: 14, fontWeight: 700, cursor: mengirim ? "default" : "pointer" }}>
            {mengirim ? "Mengajukan…" : "Ajukan Klaim"}
          </button>
        </div>
      </BottomSheet>

      <BottomSheet terbuka={!!klaimDiputuskan} onTutup={() => setKlaimDiputuskan(null)} judul="Putuskan Klaim">
        {klaimDiputuskan && (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <div style={{ fontSize: 13, color: "var(--text-secondary)" }}>
              {klaimDiputuskan.title} — diklaim {formatRupiah(klaimDiputuskan.amount_claimed)}
            </div>
            <label htmlFor="status-303" style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>
              Status</label>
              <Pilihan id="status-303"
                value={statusPutus}
                onChange={(e) => {
                  const v = e.target.value as typeof statusPutus;
                  setStatusPutus(v);
                  // "disetujui" WAJIB nilai persis = diklaim (validasiKeputusanKlaim);
                  // dikembalikan ke nilai penuh saat status dialihkan ke situ supaya
                  // admin tak perlu mengetik ulang.
                  if (v === "disetujui") setAmountApproved(String(klaimDiputuskan.amount_claimed));
                }}
                style={{ width: "100%", marginTop: 6, minHeight: 44, padding: "0 12px", borderRadius: 12, border: "1px solid var(--border)", fontSize: 14, background: "var(--surface)", color: "var(--text-primary)", boxSizing: "border-box" }}
              >
                <option value="disetujui">Disetujui</option>
                <option value="disetujui_sebagian">Disetujui Sebagian</option>
                <option value="ditolak">Ditolak</option>
                <option value="gugur">Gugur</option>
              </Pilihan>
            {(statusPutus === "disetujui" || statusPutus === "disetujui_sebagian") && (
              <label style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>
                Nilai Disetujui (Rp)
                {statusPutus === "disetujui" && (
                  <span style={{ display: "block", fontWeight: 400, fontSize: "var(--t-kecil)", color: "var(--text-secondary)", marginTop: 2 }}>
                    Disetujui penuh wajib sama dengan nilai diklaim — untuk nilai berbeda pakai &quot;Disetujui Sebagian&quot;.
                  </span>
                )}
                <input type="number" value={amountApproved} onChange={(e) => setAmountApproved(e.target.value)}
                  style={{ width: "100%", marginTop: 6, minHeight: 44, padding: "0 12px", borderRadius: 12, border: "1px solid var(--border)", fontSize: 14, background: "var(--surface)", color: "var(--text-primary)", boxSizing: "border-box" }} />
              </label>
            )}
            <label style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>
              Catatan Keputusan
              <textarea value={decisionNote} onChange={(e) => setDecisionNote(e.target.value)} rows={2}
                style={{ width: "100%", marginTop: 6, padding: 12, borderRadius: 12, border: "1px solid var(--border)", fontSize: 14, background: "var(--surface)", color: "var(--text-primary)", boxSizing: "border-box", fontFamily: "inherit", resize: "vertical" }} />
            </label>
            {galatForm && (
              <div role="alert" style={{ fontSize: 12, color: "var(--on-danger-bg)", padding: 10, borderRadius: 10, background: "var(--danger-bg)", border: "1px solid var(--danger-border)" }}>
                {galatForm}
              </div>
            )}
            <button type="button" onClick={() => void putuskanKlaim()} disabled={mengirim}
              style={{ minHeight: 48, borderRadius: "var(--portal-radius-pill)", background: "var(--grad-aksen)", color: "var(--on-navy)", border: "none", fontSize: 14, fontWeight: 700, cursor: mengirim ? "default" : "pointer" }}>
              {mengirim ? "Memproses…" : "Simpan Keputusan"}
            </button>
          </div>
        )}
      </BottomSheet>
    </div>
  );
}
