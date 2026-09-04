"use client";

// ============================================================================
// Penugasan Mandor — versi PM, portal mobile (Tahap 1, Task 6).
//
// Daftar mandor yang ditugaskan ke proyek + scope pekerjaannya. Murni daftar,
// BUKAN approval — tak ada aksi biner setuju/tolak di kartu, jadi TIDAK
// memakai SwipeableCard (lihat brief Step 3).
//
// Endpoint (dikonfirmasi Task 5, `apps/api/src/routes/v1/mandor.ts`):
//   GET  /api/v1/mandor/assignments   — list, TANPA gerbang permission (authenticate saja)
//   POST /api/v1/mandor/assignments   — assign baru, butuh mandor:assign
//   GET  /api/v1/mandor/list          — dropdown mandor, butuh mandor:assign juga
//
// PM PUNYA mandor:assign (migrasi 050: semua permission kecuali 10 key
// denylist, mandor:* tak masuk situ) — jadi form "Assign Mandor" ditampilkan
// bila hasPermission("mandor:assign"); kalau tidak, halaman baca-saja.
// ============================================================================

import { useState, useSyncExternalStore } from "react";
import { HardHat, Plus, Phone } from "lucide-react";
import { useData, invalidasi } from "@/lib/data-cache";
import { api, hasPermission } from "@/lib/api";
import BottomSheet from "@/components/portal/BottomSheet";
import KepalaPortal from "@/components/portal/KepalaPortal";
import StatusBadge, { type VarianStatus } from "@/components/portal/StatusBadge";
import EmptyState from "@/components/portal/EmptyState";
import SkeletonCard from "@/components/portal/SkeletonCard";
import type { ResponsPenugasanMandor, ProyekPM, GalatApi } from "../../_bersama/tipe";
import { pesanGalat } from "../../_bersama/tipe";
import { Pilihan } from "@/components/pilihan";

interface MandorOpsi { id: string; name: string; phone: string | null }
interface RespMandorList { mandors: MandorOpsi[] }
interface RespProyek { projects: ProyekPM[] }

function fmt(n: number) {
  return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(n);
}
function fmtDate(s: string | null) {
  if (!s) return "—";
  return new Date(s).toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric" });
}

const LABEL_STATUS_SCOPE: Record<string, string> = { active: "Aktif", completed: "Selesai" };
const VARIAN_STATUS_SCOPE: Record<string, VarianStatus> = { active: "approved", completed: "netral" };

const LABEL_SISTEM: Record<string, string> = {
  harian: "Harian", borongan: "Borongan", progress_pct: "Progress %",
};

// `langganan`: dipakai `useSyncExternalStore` supaya perubahan permission
// (login/switch company) tercermin tanpa reload — pola sama dengan
// `(dashboard)/mandor/opname/page.tsx`.
const langganan = (cb: () => void) => { window.addEventListener("storage", cb); return () => window.removeEventListener("storage", cb); };

export default function PmPenugasanPage() {
  const bolehAssign = useSyncExternalStore(
    langganan, () => hasPermission("mandor:assign"), () => false);

  const [showForm, setShowForm] = useState(false);

  const { data, memuat, galat, muatUlang } = useData<ResponsPenugasanMandor>("/api/v1/mandor/assignments");
  const assignments = data?.assignments ?? [];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--gap-bagian)" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
        <KepalaPortal judul="Penugasan Mandor" />
        {bolehAssign && (
          <button
            type="button"
            onClick={() => setShowForm(true)}
            style={{
              display: "inline-flex", alignItems: "center", gap: 6, minHeight: 44,
              padding: "0 16px", borderRadius: "var(--portal-radius-pill)", fontSize: 13, fontWeight: 700,
              border: "none", background: "var(--grad-aksen)", color: "var(--on-navy)", cursor: "pointer",
            }}
          >
            <Plus size={15} aria-hidden="true" /> Assign
          </button>
        )}
      </div>

      {memuat && (
        <div style={{ display: "flex", flexDirection: "column", gap: "var(--gap-grid)" }}>
          <SkeletonCard tinggi={140} />
          <SkeletonCard tinggi={140} />
        </div>
      )}

      {!memuat && galat && (
        <EmptyState
          icon={HardHat}
          judul="Gagal memuat penugasan"
          deskripsi={pesanGalat(galat as GalatApi, "Coba muat ulang halaman ini.")}
        />
      )}

      {!memuat && !galat && assignments.length === 0 && (
        <EmptyState
          icon={HardHat}
          judul="Belum ada mandor yang ditugaskan"
          deskripsi={bolehAssign ? "Tekan \"Assign\" untuk menugaskan mandor ke proyek." : "Penugasan mandor ke proyek akan muncul di sini."}
        />
      )}

      {!memuat && assignments.map((asg) => {
        const totalNilai = asg.work_scopes.reduce((s, sc) => s + Number(sc.contract_value ?? sc.borongan_value ?? 0), 0);
        return (
          <div key={asg.id} style={{ background: "var(--surface)", borderRadius: 16, border: "1px solid var(--border)", overflow: "hidden" }}>
            <div style={{ padding: "var(--pad-kartu-lega)", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", gap: 12 }}>
              <div style={{ width: 40, height: 40, borderRadius: 10, background: "var(--navy-light)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                <HardHat size={18} color="var(--navy)" aria-hidden="true" />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: "var(--text-primary)" }}>{asg.mandor?.name ?? "—"}</div>
                <div style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: 2, display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                  <span>{asg.project?.name ?? "—"}</span>
                  {asg.mandor?.phone && (
                    <a
                      href={`https://wa.me/${asg.mandor.phone.replace(/\D/g, "")}`}
                      target="_blank" rel="noopener noreferrer"
                      style={{ color: "var(--success)", textDecoration: "none", display: "inline-flex", alignItems: "center", gap: 2 }}
                    >
                      <Phone size={11} aria-hidden="true" /> {asg.mandor.phone}
                    </a>
                  )}
                </div>
                <div style={{ fontSize: "var(--t-kecil)", color: "var(--text-muted)", marginTop: 2 }}>
                  Ditugaskan {fmtDate(asg.assigned_at)}
                </div>
              </div>
              {totalNilai > 0 && (
                <div style={{ textAlign: "right", flexShrink: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: "var(--navy)" }}>{fmt(totalNilai)}</div>
                  <div style={{ fontSize: "var(--t-mikro)", color: "var(--text-muted)" }}>total nilai</div>
                </div>
              )}
            </div>

            {asg.work_scopes.length === 0 ? (
              <div style={{ padding: "var(--pad-kartu-lega)", textAlign: "center", color: "var(--text-secondary)", fontSize: 13 }}>
                Belum ada scope pekerjaan
              </div>
            ) : (
              <div style={{ padding: "var(--pad-kartu)", display: "flex", flexDirection: "column", gap: "var(--gap-grid)" }}>
                {asg.work_scopes.map((sc) => (
                  <div key={sc.id} style={{ borderRadius: 12, border: "1px solid var(--border)", background: "var(--surface-subtle)", padding: "var(--pad-kartu)" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6, flexWrap: "wrap" }}>
                      <span style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>{sc.scope_name}</span>
                      <StatusBadge status={VARIAN_STATUS_SCOPE[sc.status] ?? "netral"} label={LABEL_STATUS_SCOPE[sc.status] ?? sc.status} />
                      <span style={{ fontSize: "var(--t-kecil)", padding: "2px 8px", borderRadius: "var(--portal-radius-pill)", background: "var(--info-bg)", color: "var(--on-info-bg)", fontWeight: 600 }}>
                        {LABEL_SISTEM[sc.payment_system] ?? sc.payment_system}
                      </span>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 3 }}>
                      <span style={{ fontSize: "var(--t-kecil)", color: "var(--text-secondary)" }}>Progress fisik</span>
                      <span style={{ fontSize: "var(--t-kecil)", fontWeight: 600, color: "var(--text-primary)" }}>{sc.progress_pct_done.toFixed(0)}%</span>
                    </div>
                    <div style={{ height: 5, borderRadius: 3, background: "var(--border)", overflow: "hidden" }}>
                      <div style={{ height: "100%", background: "var(--navy)", width: `${sc.progress_pct_done}%` }} />
                    </div>
                    {sc.payment_system === "borongan" && Number(sc.contract_value ?? 0) > 0 && (
                      <div style={{ marginTop: 8, fontSize: "var(--t-kecil)", color: "var(--text-secondary)" }}>
                        Kasbon/Kontrak: <strong style={{ color: "var(--warning)" }}>{fmt(sc.total_kasbon ?? 0)} / {fmt(Number(sc.contract_value))} ({sc.financial_pct ?? 0}%)</strong>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}

      <BottomSheet terbuka={showForm} onTutup={() => setShowForm(false)} judul="Assign Mandor ke Proyek">
        <FormAssign
          onBatal={() => setShowForm(false)}
          onSukses={() => { setShowForm(false); void muatUlang(); }}
        />
      </BottomSheet>
    </div>
  );
}

function FormAssign({ onBatal, onSukses }: { onBatal: () => void; onSukses: () => void }) {
  const { data: dataProyek } = useData<RespProyek>("/api/v1/projects");
  const { data: dataMandor } = useData<RespMandorList>("/api/v1/mandor/list");
  const proyekList = dataProyek?.projects ?? [];
  const mandorList = dataMandor?.mandors ?? [];

  const [projectId, setProjectId] = useState("");
  const [mandorId, setMandorId] = useState("");
  const [notes, setNotes] = useState("");
  const [tanggal, setTanggal] = useState(new Date().toISOString().split("T")[0]);
  const [mengirim, setMengirim] = useState(false);
  const [galatForm, setGalatForm] = useState<string | null>(null);

  async function simpan() {
    if (!projectId || !mandorId) {
      setGalatForm("Proyek dan mandor wajib dipilih.");
      return;
    }
    setMengirim(true);
    setGalatForm(null);
    try {
      await api.post("/api/v1/mandor/assignments", {
        project_id: projectId, mandor_id: mandorId,
        notes: notes.trim() || undefined, assigned_at: tanggal,
      });
      invalidasi("/api/v1/mandor/assignments");
      onSukses();
    } catch (e) {
      setGalatForm(pesanGalat(e as GalatApi, "Gagal menyimpan penugasan"));
    } finally {
      setMengirim(false);
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <label style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>
        Proyek
        <Pilihan
          value={projectId} onChange={(e) => setProjectId(e.target.value)}
          style={{ width: "100%", marginTop: 6, minHeight: 44, padding: "0 12px", borderRadius: 12, border: "1px solid var(--border)", fontSize: 14, background: "var(--surface)", color: "var(--text-primary)" }}
        >
          <option value="">-- Pilih proyek --</option>
          {proyekList.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </Pilihan>
      </label>

      <label style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>
        Mandor
        <Pilihan
          value={mandorId} onChange={(e) => setMandorId(e.target.value)}
          style={{ width: "100%", marginTop: 6, minHeight: 44, padding: "0 12px", borderRadius: 12, border: "1px solid var(--border)", fontSize: 14, background: "var(--surface)", color: "var(--text-primary)" }}
        >
          <option value="">-- Pilih mandor --</option>
          {mandorList.map((m) => <option key={m.id} value={m.id}>{m.name}{m.phone ? ` (${m.phone})` : ""}</option>)}
        </Pilihan>
      </label>

      <label style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>
        Tanggal mulai tugas
        <input
          type="date" value={tanggal} onChange={(e) => setTanggal(e.target.value)}
          style={{ width: "100%", marginTop: 6, minHeight: 44, padding: "0 12px", borderRadius: 12, border: "1px solid var(--border)", fontSize: 14, background: "var(--surface)", color: "var(--text-primary)", boxSizing: "border-box" }}
        />
      </label>

      <label style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>
        Catatan (opsional)
        <textarea
          value={notes} onChange={(e) => setNotes(e.target.value)} rows={3}
          placeholder="Deskripsi tugas, area kerja, dll"
          style={{ width: "100%", marginTop: 6, padding: 12, borderRadius: 12, border: "1px solid var(--border)", fontSize: 14, fontFamily: "inherit", boxSizing: "border-box", resize: "vertical" }}
        />
      </label>

      {galatForm && (
        <div role="alert" style={{ fontSize: 12, color: "var(--on-danger-bg)", padding: 10, borderRadius: 10, background: "var(--danger-bg)", border: "1px solid var(--danger-border)" }}>
          {galatForm}
        </div>
      )}

      <div style={{ display: "flex", gap: 10 }}>
        <button
          type="button" onClick={onBatal} disabled={mengirim}
          style={{
            flex: 1, minHeight: 48, padding: "0 14px", borderRadius: "var(--portal-radius-pill)",
            background: "var(--surface-subtle)", color: "var(--text-secondary)", border: "1px solid var(--border)",
            fontSize: 14, fontWeight: 700, cursor: mengirim ? "default" : "pointer",
          }}
        >
          Batal
        </button>
        <button
          type="button" onClick={simpan} disabled={mengirim}
          style={mengirim ? {
            flex: 1, minHeight: 48, padding: "0 14px", borderRadius: "var(--portal-radius-pill)",
            background: "var(--surface-subtle)", color: "var(--text-muted)", border: "none",
            fontSize: 14, fontWeight: 700, cursor: "default",
          } : {
            flex: 1, minHeight: 48, padding: "0 14px", borderRadius: "var(--portal-radius-pill)",
            background: "var(--grad-aksen)", color: "var(--on-navy)", border: "none",
            fontSize: 14, fontWeight: 700, cursor: "pointer",
          }}
        >
          {mengirim ? "Menyimpan…" : "Assign Mandor"}
        </button>
      </div>
    </div>
  );
}
