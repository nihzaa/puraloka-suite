"use client";

// ============================================================================
// EOT + Denda Keterlambatan + Register Jaminan — versi PM (Tahap 2, Task 13).
//
// Tiga modul berbeda, satu halaman standalone dengan SegmentedTab 3-arah
// (pola sama `pm-portal/jadwal/page.tsx` yang menggabung CPM+Baseline).
// `pm-portal/proyek/[id]/page.tsx` PM saat ini murni redirect ke admin
// (bukan hub tab sendiri) — membangun hub tab PM penuh adalah pekerjaan besar
// tersendiri (Task 16/tahap terpisah). Endpoint semuanya per-proyek, jadi tak
// butuh hub untuk berfungsi.
//
// Endpoint:
//   GET   /api/v1/projects/:id/eot                  — projects:view
//   POST  /api/v1/projects/:id/eot                   — projects:edit
//   PATCH /api/v1/eot/:id/decide                      — projects:edit
//   GET   /api/v1/projects/:id/liquidated-damages    — projects:view (baca saja, tak ada POST/PATCH)
//   GET   /api/v1/bonds?project_id=&status=          — projects:view
//   POST  /api/v1/bonds                               — projects:edit
//   PATCH /api/v1/bonds/:id                           — projects:edit
//
// LD tak bisa dihitung benar tanpa EOT (tanggal efektif bergeser oleh EOT
// yang DISETUJUI, `apps/api/src/lib/rantai-kontrak.ts`) — itu sebabnya
// ketiganya satu rantai di backend, dan digabung satu halaman di sini.
// ============================================================================

import { useMemo, useState } from "react";
import { CalendarClock, TriangleAlert, ShieldCheck, Plus } from "lucide-react";
import { useData, invalidasi } from "@/lib/data-cache";
import { api } from "@/lib/api";
import EmptyState from "@/components/portal/EmptyState";
import SkeletonCard from "@/components/portal/SkeletonCard";
import StatusBadge, { type VarianStatus } from "@/components/portal/StatusBadge";
import BottomSheet from "@/components/portal/BottomSheet";
import SegmentedTab from "@/components/portal/SegmentedTab";
import type { ProyekPM, RespEot, RespLd, RespBond, EotProyek, BondProyek, GalatApi } from "../../_bersama/tipe";
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

const LABEL_EOT: Record<string, string> = { diajukan: "Diajukan", disetujui: "Disetujui", ditolak: "Ditolak" };
const VARIAN_EOT: Record<string, VarianStatus> = { diajukan: "pending", disetujui: "approved", ditolak: "rejected" };
const LABEL_BOND: Record<string, string> = {
  penawaran: "Jaminan Penawaran", pelaksanaan: "Jaminan Pelaksanaan",
  uang_muka: "Jaminan Uang Muka", pemeliharaan: "Jaminan Pemeliharaan",
};
const LABEL_STATUS_BOND: Record<string, string> = {
  aktif: "Aktif", dikembalikan: "Dikembalikan", dicairkan: "Dicairkan", kadaluarsa: "Kadaluarsa",
};
const VARIAN_STATUS_BOND: Record<string, VarianStatus> = {
  aktif: "approved", dicairkan: "info", dikembalikan: "netral", kadaluarsa: "rejected",
};

export default function PmEotLdBondPage() {
  const [tab, setTab] = useState<"eot" | "ld" | "bond">("eot");
  const [proyekId, setProyekId] = useState("");

  const [sheetEot, setSheetEot] = useState(false);
  const [formEot, setFormEot] = useState({ eot_number: "", days_requested: "", reason: "" });

  const [eotDiputuskan, setEotDiputuskan] = useState<EotProyek | null>(null);
  const [daysApproved, setDaysApproved] = useState("");
  const [decisionNote, setDecisionNote] = useState("");

  const [sheetBond, setSheetBond] = useState(false);
  const [formBond, setFormBond] = useState({ bond_type: "pelaksanaan", bond_number: "", issuer: "", amount: "", issued_date: "", expiry_date: "" });

  const [mengirim, setMengirim] = useState(false);
  const [galatForm, setGalatForm] = useState<string | null>(null);

  // Galat aksi di level HALAMAN — dipakai transisi status jaminan yang
  // dipicu dari tombol di kartu (di LUAR BottomSheet manapun), supaya
  // kegagalan tetap terlihat user (pelajaran Task 12: galat aksi luar sheet
  // butuh state terpisah dari galat form).
  const [galatHalaman, setGalatHalaman] = useState<string | null>(null);

  const { data: dataProyek } = useData<RespProyek>("/api/v1/projects");
  const daftarProyek = useMemo(() => (dataProyek?.projects ?? []).filter((p) => p.pm), [dataProyek]);
  const proyekAktif = proyekId || daftarProyek[0]?.id || "";

  const urlEot = proyekAktif ? `/api/v1/projects/${proyekAktif}/eot` : null;
  const { data: dataEot, memuat: memuatEot, galat: galatEot } = useData<RespEot>(tab === "eot" ? urlEot : null);

  const urlLd = proyekAktif ? `/api/v1/projects/${proyekAktif}/liquidated-damages` : null;
  const { data: dataLd, memuat: memuatLd, galat: galatLd } = useData<RespLd>(tab === "ld" ? urlLd : null);

  const urlBond = proyekAktif ? `/api/v1/bonds?project_id=${proyekAktif}` : null;
  const { data: dataBond, memuat: memuatBond, galat: galatBond } = useData<RespBond>(tab === "bond" ? urlBond : null);

  function ubahTab(v: string) {
    setTab(v as "eot" | "ld" | "bond");
    setGalatHalaman(null);
  }

  async function ajukanEot() {
    if (!proyekAktif) return;
    const hari = Number(formEot.days_requested);
    if (!Number.isFinite(hari) || hari < 0) {
      setGalatForm("Jumlah hari tidak sah.");
      return;
    }
    if (formEot.reason.trim().length < 10) {
      setGalatForm("Alasan wajib diisi, minimal 10 karakter.");
      return;
    }
    setMengirim(true);
    setGalatForm(null);
    try {
      await api.post(`/api/v1/projects/${proyekAktif}/eot`, {
        eot_number: formEot.eot_number.trim() || undefined,
        days_requested: Math.trunc(hari),
        reason: formEot.reason.trim(),
      });
      setSheetEot(false);
      setFormEot({ eot_number: "", days_requested: "", reason: "" });
      invalidasi(urlEot ?? "");
    } catch (e) {
      setGalatForm(pesanGalat(e as GalatApi, "Gagal mengajukan EOT"));
    } finally {
      setMengirim(false);
    }
  }

  async function putuskanEot(status: "disetujui" | "ditolak") {
    if (!eotDiputuskan) return;
    setMengirim(true);
    setGalatForm(null);
    try {
      await api.patch(`/api/v1/eot/${eotDiputuskan.id}/decide`, {
        status,
        days_approved: status === "disetujui" && daysApproved ? Number(daysApproved) : undefined,
        decision_note: decisionNote.trim() || undefined,
      });
      setEotDiputuskan(null);
      setDaysApproved("");
      setDecisionNote("");
      invalidasi(urlEot ?? "");
    } catch (e) {
      setGalatForm(pesanGalat(e as GalatApi, "Gagal memutuskan EOT"));
    } finally {
      setMengirim(false);
    }
  }

  async function simpanBond() {
    if (!proyekAktif) return;
    if (!formBond.issued_date || !formBond.expiry_date) {
      setGalatForm("Tanggal terbit dan kadaluarsa wajib diisi.");
      return;
    }
    setMengirim(true);
    setGalatForm(null);
    try {
      await api.post("/api/v1/bonds", {
        project_id: proyekAktif,
        bond_type: formBond.bond_type,
        bond_number: formBond.bond_number.trim() || undefined,
        issuer: formBond.issuer.trim() || undefined,
        amount: formBond.amount ? Number(formBond.amount) : undefined,
        issued_date: formBond.issued_date,
        expiry_date: formBond.expiry_date,
      });
      setSheetBond(false);
      invalidasi(urlBond ?? "");
    } catch (e) {
      setGalatForm(pesanGalat(e as GalatApi, "Gagal menyimpan jaminan"));
    } finally {
      setMengirim(false);
    }
  }

  async function ubahStatusBond(b: BondProyek, status: string) {
    setGalatHalaman(null);
    try {
      await api.patch(`/api/v1/bonds/${b.id}`, {
        status,
        released_at: status === "dikembalikan" ? new Date().toISOString().slice(0, 10) : undefined,
      });
      invalidasi(urlBond ?? "");
    } catch (e) {
      setGalatHalaman(pesanGalat(e as GalatApi, "Gagal mengubah status jaminan"));
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--gap-bagian)" }}>
      <h1 style={{ fontSize: 20, fontWeight: 700, color: "var(--text-primary)", margin: 0 }}>
        EOT, Denda &amp; Jaminan
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
        opsi={[{ value: "eot", label: "EOT" }, { value: "ld", label: "Denda" }, { value: "bond", label: "Jaminan" }]}
        aktif={tab}
        onUbah={ubahTab}
      />

      {/* Galat aksi level halaman — dipakai transisi status jaminan dari
          tombol di kartu (di LUAR BottomSheet manapun), supaya kegagalan
          tetap terlihat. */}
      {galatHalaman && (
        <div role="alert" style={{ fontSize: 12, color: "var(--on-danger-bg)", padding: 10, borderRadius: 10, background: "var(--danger-bg)", border: "1px solid var(--danger-border)" }}>
          {galatHalaman}
        </div>
      )}

      {!proyekAktif && <EmptyState icon={CalendarClock} judul="Pilih proyek" deskripsi="Data ini tercatat per proyek." />}

      {proyekAktif && tab === "eot" && (
        <>
          {memuatEot && <SkeletonCard tinggi={100} />}
          {galatEot && <EmptyState icon={CalendarClock} judul="Gagal memuat" deskripsi={pesanGalat(galatEot as GalatApi, "Coba muat ulang.")} />}
          {dataEot?.meta && (
            <div style={{ fontSize: 12, color: "var(--text-secondary)", padding: 10, borderRadius: 10, background: "var(--surface-subtle)" }}>
              Tanggal efektif: {fmtTanggal(dataEot.meta.tanggalEfektif)} (asli {fmtTanggal(dataEot.meta.tanggalAsli)} + {dataEot.meta.totalHariEOT} hari EOT disetujui)
              {dataEot.meta.eotMenggantung > 0 && ` · ${dataEot.meta.eotMenggantung} pengajuan belum diputus`}
            </div>
          )}
          {!memuatEot && (dataEot?.data?.length ?? 0) === 0 && (
            <EmptyState icon={CalendarClock} judul="Belum ada pengajuan EOT" deskripsi="Perpanjangan waktu proyek ini akan muncul di sini." />
          )}
          {!memuatEot && dataEot?.data.map((e) => (
            <div key={e.id} style={{ padding: "var(--pad-kartu-lega)", borderRadius: 16, background: "var(--surface)", border: "1px solid color-mix(in srgb, var(--border) 40%, transparent)", boxShadow: "var(--naik-1)", display: "flex", flexDirection: "column", gap: 8 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: "var(--text-primary)" }}>{e.eot_number ?? "EOT"} · {e.days_requested} hari</div>
                  {e.days_approved !== null && <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>Disetujui: {e.days_approved} hari</div>}
                </div>
                <StatusBadge status={VARIAN_EOT[e.status] ?? "netral"} label={LABEL_EOT[e.status] ?? e.status} />
              </div>
              <div style={{ fontSize: 13, color: "var(--text-secondary)" }}>{e.reason}</div>
              {e.status === "diajukan" && (
                <div style={{ display: "flex", gap: 8 }}>
                  <button
                    type="button"
                    onClick={() => { setEotDiputuskan(e); setDaysApproved(String(e.days_requested)); setDecisionNote(""); setGalatForm(null); }}
                    style={{ flex: 1, minHeight: 40, borderRadius: "var(--portal-radius-pill)", background: "var(--grad-aksen)", color: "var(--on-navy)", border: "none", fontSize: 13, fontWeight: 700, cursor: "pointer" }}
                  >
                    Putuskan
                  </button>
                </div>
              )}
            </div>
          ))}
          <button
            type="button"
            onClick={() => { setSheetEot(true); setFormEot({ eot_number: "", days_requested: "", reason: "" }); setGalatForm(null); }}
            style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, padding: "var(--pad-kartu-lega)", borderRadius: "var(--portal-radius-pill)", background: "var(--grad-aksen)", color: "var(--on-navy)", border: "none", fontSize: 14, fontWeight: 700, cursor: "pointer" }}
          >
            <Plus size={18} aria-hidden="true" /> Ajukan EOT
          </button>
        </>
      )}

      {proyekAktif && tab === "ld" && (
        <>
          {memuatLd && <SkeletonCard tinggi={160} />}
          {galatLd && <EmptyState icon={TriangleAlert} judul="Gagal memuat" deskripsi={pesanGalat(galatLd as GalatApi, "Coba muat ulang.")} />}
          {!memuatLd && dataLd && (
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: dataLd.meta.label.startsWith("Angka final") ? "var(--success)" : "var(--warning)" }}>
                {dataLd.meta.label}
              </div>
              {dataLd.meta.peringatan && (
                <div role="alert" style={{ fontSize: 12, color: "var(--on-warning-bg)", background: "var(--warning-bg)", padding: 10, borderRadius: 10 }}>
                  {dataLd.meta.peringatan}
                </div>
              )}
              {!dataLd.data.adaDenda ? (
                <EmptyState icon={ShieldCheck} judul="Tidak ada denda" deskripsi={dataLd.data.alasan ?? "Proyek ini tidak terkena denda keterlambatan."} />
              ) : (
                <div style={{ padding: "var(--pad-kartu-lega)", borderRadius: 16, background: "var(--surface)", border: "1px solid color-mix(in srgb, var(--border) 40%, transparent)", boxShadow: "var(--naik-1)", display: "flex", flexDirection: "column", gap: 10 }}>
                  <div>
                    <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>Denda {dataLd.data.kenaBatas ? "(menyentuh batas)" : ""}</div>
                    <div style={{ fontSize: 22, fontWeight: 700, color: "var(--danger)" }}>{fmtRupiah(dataLd.data.denda)}</div>
                  </div>
                  <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>
                    Telat {dataLd.data.hariTelat} hari · dasar {fmtRupiah(dataLd.data.dasarPerhitungan)} · batas {fmtRupiah(dataLd.data.batasNominal)}
                  </div>
                </div>
              )}
            </div>
          )}
        </>
      )}

      {proyekAktif && tab === "bond" && (
        <>
          {memuatBond && <SkeletonCard tinggi={100} />}
          {galatBond && <EmptyState icon={ShieldCheck} judul="Gagal memuat" deskripsi={pesanGalat(galatBond as GalatApi, "Coba muat ulang.")} />}
          {dataBond?.meta && dataBond.meta.segeraKadaluarsa.length > 0 && (
            <div role="alert" style={{ fontSize: 12, color: "var(--on-warning-bg)", background: "var(--warning-bg)", padding: 10, borderRadius: 10 }}>
              {dataBond.meta.segeraKadaluarsa.length} jaminan segera kadaluarsa.
            </div>
          )}
          {!memuatBond && (dataBond?.data?.length ?? 0) === 0 && (
            <EmptyState icon={ShieldCheck} judul="Belum ada jaminan" deskripsi="Register jaminan proyek ini belum dicatat." />
          )}
          {!memuatBond && dataBond?.data.map((b) => (
            <div key={b.id} style={{ padding: "var(--pad-kartu-lega)", borderRadius: 16, background: "var(--surface)", border: "1px solid color-mix(in srgb, var(--border) 40%, transparent)", boxShadow: "var(--naik-1)", display: "flex", flexDirection: "column", gap: 8 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: "var(--text-primary)" }}>{LABEL_BOND[b.bond_type]}</div>
                  <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>{b.bond_number ?? "—"} · {b.issuer ?? "—"}</div>
                </div>
                <StatusBadge status={VARIAN_STATUS_BOND[b.status] ?? "netral"} label={LABEL_STATUS_BOND[b.status] ?? b.status} />
              </div>
              <div style={{ fontSize: 16, fontWeight: 700, color: "var(--navy)" }}>{fmtRupiah(b.amount)}</div>
              <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>
                {fmtTanggal(b.issued_date)} — {fmtTanggal(b.expiry_date)}
              </div>
              {b.status === "aktif" && (
                <div style={{ display: "flex", gap: 8 }}>
                  <button
                    type="button"
                    onClick={() => void ubahStatusBond(b, "dicairkan")}
                    style={{ flex: 1, minHeight: 36, borderRadius: "var(--portal-radius-pill)", background: "var(--danger-bg)", color: "var(--danger)", border: "1px solid var(--danger-border)", fontSize: 12, fontWeight: 600, cursor: "pointer" }}
                  >
                    Tandai Dicairkan
                  </button>
                  <button
                    type="button"
                    onClick={() => void ubahStatusBond(b, "dikembalikan")}
                    style={{ flex: 1, minHeight: 36, borderRadius: "var(--portal-radius-pill)", background: "var(--surface-subtle)", color: "var(--text-primary)", border: "1px solid var(--border)", fontSize: 12, fontWeight: 600, cursor: "pointer" }}
                  >
                    Tandai Dikembalikan
                  </button>
                </div>
              )}
            </div>
          ))}
          <button
            type="button"
            onClick={() => { setSheetBond(true); setFormBond({ bond_type: "pelaksanaan", bond_number: "", issuer: "", amount: "", issued_date: "", expiry_date: "" }); setGalatForm(null); }}
            style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, padding: "var(--pad-kartu-lega)", borderRadius: "var(--portal-radius-pill)", background: "var(--grad-aksen)", color: "var(--on-navy)", border: "none", fontSize: 14, fontWeight: 700, cursor: "pointer" }}
          >
            <Plus size={18} aria-hidden="true" /> Jaminan Baru
          </button>
        </>
      )}

      <BottomSheet terbuka={sheetEot} onTutup={() => setSheetEot(false)} judul="Ajukan EOT">
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <label style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>
            Nomor EOT (opsional)
            <input type="text" value={formEot.eot_number} onChange={(e) => setFormEot((f) => ({ ...f, eot_number: e.target.value }))}
              style={{ width: "100%", marginTop: 6, minHeight: 44, padding: "0 12px", borderRadius: 12, border: "1px solid var(--border)", fontSize: 14, background: "var(--surface)", color: "var(--text-primary)", boxSizing: "border-box" }} />
          </label>
          <label style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>
            Jumlah Hari
            <input type="number" value={formEot.days_requested} onChange={(e) => setFormEot((f) => ({ ...f, days_requested: e.target.value }))}
              style={{ width: "100%", marginTop: 6, minHeight: 44, padding: "0 12px", borderRadius: 12, border: "1px solid var(--border)", fontSize: 14, background: "var(--surface)", color: "var(--text-primary)", boxSizing: "border-box" }} />
          </label>
          <label style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>
            Alasan (min 10 karakter)
            <textarea value={formEot.reason} onChange={(e) => setFormEot((f) => ({ ...f, reason: e.target.value }))} rows={3}
              style={{ width: "100%", marginTop: 6, padding: 12, borderRadius: 12, border: "1px solid var(--border)", fontSize: 14, background: "var(--surface)", color: "var(--text-primary)", boxSizing: "border-box", fontFamily: "inherit", resize: "vertical" }} />
          </label>
          {galatForm && (
            <div role="alert" style={{ fontSize: 12, color: "var(--on-danger-bg)", padding: 10, borderRadius: 10, background: "var(--danger-bg)", border: "1px solid var(--danger-border)" }}>
              {galatForm}
            </div>
          )}
          <button type="button" onClick={() => void ajukanEot()} disabled={mengirim}
            style={{ minHeight: 48, borderRadius: "var(--portal-radius-pill)", background: "var(--grad-aksen)", color: "var(--on-navy)", border: "none", fontSize: 14, fontWeight: 700, cursor: mengirim ? "default" : "pointer" }}>
            {mengirim ? "Mengajukan…" : "Ajukan"}
          </button>
        </div>
      </BottomSheet>

      <BottomSheet terbuka={!!eotDiputuskan} onTutup={() => setEotDiputuskan(null)} judul="Putuskan EOT">
        {eotDiputuskan && (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <div style={{ fontSize: 13, color: "var(--text-secondary)" }}>Diajukan: {eotDiputuskan.days_requested} hari — {eotDiputuskan.reason}</div>
            <label style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>
              Hari Disetujui (bila disetujui)
              <input type="number" value={daysApproved} onChange={(e) => setDaysApproved(e.target.value)}
                style={{ width: "100%", marginTop: 6, minHeight: 44, padding: "0 12px", borderRadius: 12, border: "1px solid var(--border)", fontSize: 14, background: "var(--surface)", color: "var(--text-primary)", boxSizing: "border-box" }} />
            </label>
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
            <div style={{ display: "flex", gap: 10 }}>
              <button type="button" onClick={() => void putuskanEot("ditolak")} disabled={mengirim}
                style={{ flex: 1, minHeight: 48, borderRadius: "var(--portal-radius-pill)", background: "var(--danger-bg)", color: "var(--danger)", border: "1px solid var(--danger-border)", fontSize: 14, fontWeight: 700, cursor: mengirim ? "default" : "pointer" }}>
                Tolak
              </button>
              <button type="button" onClick={() => void putuskanEot("disetujui")} disabled={mengirim}
                style={{ flex: 1, minHeight: 48, borderRadius: "var(--portal-radius-pill)", background: "var(--grad-aksen)", color: "var(--on-navy)", border: "none", fontSize: 14, fontWeight: 700, cursor: mengirim ? "default" : "pointer" }}>
                {mengirim ? "Memproses…" : "Setujui"}
              </button>
            </div>
          </div>
        )}
      </BottomSheet>

      <BottomSheet terbuka={sheetBond} onTutup={() => setSheetBond(false)} judul="Jaminan Baru">
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <label style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>
            Jenis
            <select value={formBond.bond_type} onChange={(e) => setFormBond((f) => ({ ...f, bond_type: e.target.value }))}
              style={{ width: "100%", marginTop: 6, minHeight: 44, padding: "0 12px", borderRadius: 12, border: "1px solid var(--border)", fontSize: 14, background: "var(--surface)", color: "var(--text-primary)", boxSizing: "border-box" }}>
              {Object.entries(LABEL_BOND).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </label>
          <label style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>
            Nomor
            <input type="text" value={formBond.bond_number} onChange={(e) => setFormBond((f) => ({ ...f, bond_number: e.target.value }))}
              style={{ width: "100%", marginTop: 6, minHeight: 44, padding: "0 12px", borderRadius: 12, border: "1px solid var(--border)", fontSize: 14, background: "var(--surface)", color: "var(--text-primary)", boxSizing: "border-box" }} />
          </label>
          <label style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>
            Penerbit
            <input type="text" value={formBond.issuer} onChange={(e) => setFormBond((f) => ({ ...f, issuer: e.target.value }))}
              style={{ width: "100%", marginTop: 6, minHeight: 44, padding: "0 12px", borderRadius: 12, border: "1px solid var(--border)", fontSize: 14, background: "var(--surface)", color: "var(--text-primary)", boxSizing: "border-box" }} />
          </label>
          <label style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>
            Nilai (Rp)
            <input type="number" value={formBond.amount} onChange={(e) => setFormBond((f) => ({ ...f, amount: e.target.value }))}
              style={{ width: "100%", marginTop: 6, minHeight: 44, padding: "0 12px", borderRadius: 12, border: "1px solid var(--border)", fontSize: 14, background: "var(--surface)", color: "var(--text-primary)", boxSizing: "border-box" }} />
          </label>
          <label style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>
            Tanggal Terbit
            <input type="date" value={formBond.issued_date} onChange={(e) => setFormBond((f) => ({ ...f, issued_date: e.target.value }))}
              style={{ width: "100%", marginTop: 6, minHeight: 44, padding: "0 12px", borderRadius: 12, border: "1px solid var(--border)", fontSize: 14, background: "var(--surface)", color: "var(--text-primary)", boxSizing: "border-box" }} />
          </label>
          <label style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>
            Tanggal Kadaluarsa
            <input type="date" value={formBond.expiry_date} onChange={(e) => setFormBond((f) => ({ ...f, expiry_date: e.target.value }))}
              style={{ width: "100%", marginTop: 6, minHeight: 44, padding: "0 12px", borderRadius: 12, border: "1px solid var(--border)", fontSize: 14, background: "var(--surface)", color: "var(--text-primary)", boxSizing: "border-box" }} />
          </label>
          {galatForm && (
            <div role="alert" style={{ fontSize: 12, color: "var(--on-danger-bg)", padding: 10, borderRadius: 10, background: "var(--danger-bg)", border: "1px solid var(--danger-border)" }}>
              {galatForm}
            </div>
          )}
          <button type="button" onClick={() => void simpanBond()} disabled={mengirim}
            style={{ minHeight: 48, borderRadius: "var(--portal-radius-pill)", background: "var(--grad-aksen)", color: "var(--on-navy)", border: "none", fontSize: 14, fontWeight: 700, cursor: mengirim ? "default" : "pointer" }}>
            {mengirim ? "Menyimpan…" : "Simpan Jaminan"}
          </button>
        </div>
      </BottomSheet>
    </div>
  );
}
