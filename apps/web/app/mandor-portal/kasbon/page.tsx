"use client";

import { useCallback, useMemo, useState } from "react";
import { useData } from "@/lib/data-cache";
import { kirimLapangan } from "@/lib/kirim-lapangan";
import { type Kasbon, type GalatApi, pesanGalat } from "../_bersama/tipe";
import { Plus, Wallet } from "lucide-react";
import BottomSheet from "@/components/portal/BottomSheet";
import StatusBadge, { type VarianStatus } from "@/components/portal/StatusBadge";
import EmptyState from "@/components/portal/EmptyState";
import SkeletonCard from "@/components/portal/SkeletonCard";
import SegmentedTab from "@/components/portal/SegmentedTab";

/** `Kasbon` bersama tak punya `approver` — hanya dipakai di halaman ini. */
interface KasbonDenganApprover extends Kasbon {
  approver?: { name: string } | null;
}

/** Bentuk `/api/v1/mandor/scopes` — beda dari `LingkupKerja` (my-scopes). */
interface ScopeApi {
  id: string;
  scope_name: string;
  assignment?: { project?: { id: string; name: string } | null } | null;
}

function fmt(n: number) {
  return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(n);
}
function fmtDate(s: string | null) {
  if (!s) return "—";
  return new Date(s).toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric" });
}

const VARIAN_STATUS: Record<string, VarianStatus> = {
  pending: "pending",
  approved: "approved",
  rejected: "rejected",
  settled: "approved",
};

const LABEL_STATUS: Record<string, string> = {
  pending: "Menunggu",
  approved: "Disetujui",
  rejected: "Ditolak",
  settled: "Lunas",
};

const PURPOSE_OPTIONS = [
  { value: "gaji_tukang", label: "Gaji Tukang" },
  { value: "uang_makan", label: "Uang Makan" },
  { value: "pembelian_alat", label: "Pembelian Alat" },
  { value: "operasional", label: "Operasional" },
  { value: "lain_lain", label: "Lain-lain" },
];

const FUND_OPTIONS = [
  { value: "owner_advance", label: "Uang Muka Pemilik" },
  { value: "client_fund", label: "Dana Klien" },
];

interface ProjectOption { id: string; name: string; }
interface ScopeOption { id: string; scope_name: string; project_id: string; }

const FILTER_TAB: Array<{ value: string; label: string }> = [
  { value: "all", label: "Semua" },
  { value: "pending", label: "Menunggu" },
  { value: "approved", label: "Disetujui" },
  { value: "rejected", label: "Ditolak" },
  { value: "settled", label: "Lunas" },
];

export default function MandorKasbonPage() {
  const [sheetTerbuka, setSheetTerbuka] = useState(false);
  const [filter, setFilter] = useState("all");

  const initForm = {
    project_id: "",
    work_scope_id: "",
    amount: "",
    purpose: "gaji_tukang",
    fund_source: "owner_advance",
    notes: "",
    kasbon_date: new Date().toISOString().split("T")[0],
  };
  const [form, setForm] = useState(initForm);
  const [saving, setSaving] = useState(false);
  const [galatForm, setGalatForm] = useState<string | null>(null);
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null);

  function showToast(msg: string, ok = true) {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 3500);
  }

  /*
    ── PINDAH KE LAPIS CACHE BERSAMA (F4-2), 2026-08-16

    Dua GET diam-diam (kasbon + scopes) diganti `useData`. TIDAK ada cache
    offline di jalur BACA halaman ini — `kirimLapangan` di bawah HANYA
    membungkus jalur TULIS (pengajuan kasbon), dan tidak disentuh.
  */
  const { data: dataKasbon, memuat: memuatKasbon, galat: galatMuatKasbon, muatUlang: muatUlangKasbon } =
    useData<{ kasbons: KasbonDenganApprover[] }>("/api/v1/kasbons");
  const { data: dataScopes, memuat: memuatScopes, galat: galatMuatScopes, muatUlang: muatUlangScopes } =
    useData<{ scopes: ScopeApi[] }>("/api/v1/mandor/scopes");

  const loading = memuatKasbon || memuatScopes;
  const galatMuat = galatMuatKasbon ?? galatMuatScopes;

  // Diturunkan, bukan disalin.
  const kasbons = dataKasbon?.kasbons ?? [];
  // `scopeList` sendiri dibungkus `useMemo`: turunan array yang masuk sebagai
  // dependensi `useMemo`/`useCallback` lain butuh referensi stabil, kalau
  // tidak setiap render membuat array baru dan menembus ratchet
  // `exhaustive-deps` (lihat catatan F4-2 jebakan #3 di CLAUDE.md).
  const scopeList: ScopeApi[] = useMemo(() => dataScopes?.scopes ?? [], [dataScopes]);
  const scopes: ScopeOption[] = useMemo(() => scopeList.map((s) => ({
    id: s.id,
    scope_name: s.scope_name,
    project_id: s.assignment?.project?.id ?? "",
  })), [scopeList]);
  const projects: ProjectOption[] = useMemo(() => {
    const projectMap = new Map<string, ProjectOption>();
    for (const s of scopeList) {
      const p = s.assignment?.project;
      if (p?.id && !projectMap.has(p.id)) {
        projectMap.set(p.id, { id: p.id, name: p.name });
      }
    }
    return Array.from(projectMap.values());
  }, [scopeList]);

  const loadData = useCallback(async () => {
    await Promise.all([muatUlangKasbon(), muatUlangScopes()]);
  }, [muatUlangKasbon, muatUlangScopes]);

  // Scopes filtered by selected project
  const filteredScopes = form.project_id
    ? scopes.filter((s) => s.project_id === form.project_id)
    : scopes;

  // Reset scope when project changes
  function handleProjectChange(projectId: string) {
    setForm((f) => ({ ...f, project_id: projectId, work_scope_id: "" }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.project_id && !form.work_scope_id) return;
    if (!form.amount || Number(form.amount) <= 0) return;
    setSaving(true);
    setGalatForm(null);
    try {
      // F4-3 — lewat antrean offline. Sinyal buruk adalah NORMA di lokasi
      // proyek: tanpa ini, kasbon yang gagal terkirim HILANG dan mandor
      // mengetik ulang, atau mencoba berkali-kali sampai terkirim ganda.
      const hasil = await kirimLapangan("POST", "/api/v1/kasbons", {
        project_id: form.project_id || undefined,
        work_scope_id: form.work_scope_id || undefined,
        amount: Number(form.amount),
        purpose: form.purpose,
        fund_source: form.fund_source,
        notes: form.notes || undefined,
        kasbon_date: form.kasbon_date,
      }, "Kasbon berhasil diajukan", "Gagal mengajukan kasbon");

      // Form hanya dikosongkan bila kirimannya AMAN — kalau tidak, isinya
      // hilang dan mandor harus mengetik ulang dari nol.
      if (!hasil.aman) {
        setGalatForm(hasil.pesan);
        return;
      }
      showToast(hasil.pesan, true);
      setSheetTerbuka(false);
      setForm(initForm);
      if (hasil.terkirim) void loadData();
    } catch (err) {
      setGalatForm(pesanGalat(err, "Gagal mengajukan kasbon"));
    } finally {
      setSaving(false);
    }
  }

  const filtered = filter === "all" ? kasbons : kasbons.filter((k) => k.status === filter);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
        <h1 style={{ fontSize: 20, fontWeight: 700, color: "var(--text-primary)", margin: 0 }}>Kasbon</h1>
        <button
          onClick={() => setSheetTerbuka(true)}
          style={{
            display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
            minHeight: 44, padding: "0 16px", borderRadius: "var(--portal-radius-pill)",
            background: "var(--grad-merek)", color: "var(--on-navy)", border: "none",
            fontSize: 13, fontWeight: 700, cursor: "pointer",
          }}
        >
          <Plus size={16} aria-hidden="true" /> Ajukan
        </button>
      </div>

      <SegmentedTab opsi={FILTER_TAB} aktif={filter} onUbah={setFilter} />

      {loading && (
        <>
          <SkeletonCard tinggi={80} />
          <SkeletonCard tinggi={80} />
        </>
      )}

      {!loading && galatMuat && (
        <EmptyState
          icon={Wallet}
          judul="Gagal memuat kasbon"
          deskripsi={pesanGalat(galatMuat as GalatApi, "Coba muat ulang halaman ini.")}
        />
      )}

      {!loading && !galatMuat && filtered.length === 0 && (
        <EmptyState
          icon={Wallet}
          judul="Belum ada kasbon"
          deskripsi="Kasbon yang Anda ajukan akan muncul di sini, lengkap dengan status persetujuannya."
        />
      )}

      {!loading && !galatMuat && filtered.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {filtered.map((k) => {
            const scopeName = k.work_scopes?.scope_name;
            const projectName = k.project?.name;
            const context = scopeName ? `${scopeName}${projectName ? ` · ${projectName}` : ""}` : (projectName ?? "Umum");
            return (
              <div
                key={k.id}
                style={{
                  padding: 16, borderRadius: 16, background: "var(--surface)",
                  border: "1px solid var(--border)", display: "flex", flexDirection: "column", gap: 8,
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8, flexWrap: "wrap" }}>
                  <span style={{ fontSize: 16, fontWeight: 800, color: "var(--text-primary)" }}>{fmt(Number(k.amount))}</span>
                  <StatusBadge
                    status={VARIAN_STATUS[k.status ?? ""] ?? "netral"}
                    label={LABEL_STATUS[k.status ?? ""] ?? (k.status ?? "—")}
                  />
                </div>
                <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>
                  {context} · {fmtDate(k.kasbon_date ?? null)}
                </div>
                {k.notes && (
                  <div style={{ fontSize: 13, color: "var(--text-secondary)", fontStyle: "italic" }}>{k.notes}</div>
                )}
                {k.status === "rejected" && k.approver && (
                  <div style={{ fontSize: 12, color: "var(--on-danger-bg)" }}>Ditolak oleh {k.approver.name}</div>
                )}
                {k.status === "approved" && k.approver && (
                  <div style={{ fontSize: 12, color: "var(--on-success-bg)" }}>Disetujui oleh {k.approver.name}</div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <BottomSheet terbuka={sheetTerbuka} onTutup={() => setSheetTerbuka(false)} judul="Ajukan Kasbon">
        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div>
            <label htmlFor="project-id" style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)", display: "block", marginBottom: 6 }}>
              Proyek <span style={{ color: "var(--danger)" }}>*</span>
            </label>
            <select
              id="project-id"
              aria-label="Proyek"
              value={form.project_id}
              onChange={(e) => handleProjectChange(e.target.value)}
              required
              style={{
                width: "100%", minHeight: 44, padding: "0 12px", borderRadius: 12,
                border: "1px solid var(--border)", fontSize: 14, color: "var(--text-primary)",
                background: "var(--surface)", boxSizing: "border-box",
              }}
            >
              <option value="">Pilih proyek...</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </div>

          <div>
            <label style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)", display: "block", marginBottom: 4 }}>
              Scope Pekerjaan
              <span style={{ fontSize: 11, fontWeight: 400, color: "var(--text-muted)", marginLeft: 6 }}>(opsional)</span>
            </label>
            <p style={{ fontSize: 11, color: "var(--text-muted)", margin: "0 0 6px" }}>
              Kosongkan jika kasbon bersifat umum dan tidak terikat scope tertentu.
            </p>
            <select
              aria-label="Pilih lingkup pekerjaan"
              value={form.work_scope_id}
              onChange={(e) => setForm((f) => ({ ...f, work_scope_id: e.target.value }))}
              disabled={!form.project_id}
              style={{
                width: "100%", minHeight: 44, padding: "0 12px", borderRadius: 12,
                border: "1px solid var(--border)", fontSize: 14, color: "var(--text-primary)",
                background: form.project_id ? "var(--surface)" : "var(--surface-subtle)",
                boxSizing: "border-box",
              }}
            >
              <option value="">— Kasbon umum (tidak terikat scope) —</option>
              {filteredScopes.map((s) => (
                <option key={s.id} value={s.id}>{s.scope_name}</option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="amount" style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)", display: "block", marginBottom: 6 }}>
              Jumlah (Rp) *
            </label>
            <input
              id="amount"
              type="number"
              min="1"
              placeholder="Contoh: 500000"
              value={form.amount}
              onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))}
              required
              style={{
                width: "100%", minHeight: 44, padding: "0 12px", borderRadius: 12,
                border: "1px solid var(--border)", fontSize: 14, boxSizing: "border-box",
              }}
            />
          </div>

          <div>
            <label htmlFor="purpose" style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)", display: "block", marginBottom: 6 }}>
              Keperluan
            </label>
            <select
              id="purpose"
              aria-label="Tujuan kasbon"
              value={form.purpose}
              onChange={(e) => setForm((f) => ({ ...f, purpose: e.target.value }))}
              style={{
                width: "100%", minHeight: 44, padding: "0 12px", borderRadius: 12,
                border: "1px solid var(--border)", fontSize: 14, color: "var(--text-primary)",
                background: "var(--surface)", boxSizing: "border-box",
              }}
            >
              {PURPOSE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>

          <div>
            <label htmlFor="fund-source" style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)", display: "block", marginBottom: 6 }}>
              Sumber Dana
            </label>
            <select
              id="fund-source"
              aria-label="Sumber dana kasbon"
              value={form.fund_source}
              onChange={(e) => setForm((f) => ({ ...f, fund_source: e.target.value }))}
              style={{
                width: "100%", minHeight: 44, padding: "0 12px", borderRadius: 12,
                border: "1px solid var(--border)", fontSize: 14, color: "var(--text-primary)",
                background: "var(--surface)", boxSizing: "border-box",
              }}
            >
              {FUND_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>

          <div>
            <label htmlFor="kasbon-date" style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)", display: "block", marginBottom: 6 }}>
              Tanggal
            </label>
            <input
              id="kasbon-date"
              aria-label="Tanggal"
              type="date"
              value={form.kasbon_date}
              onChange={(e) => setForm((f) => ({ ...f, kasbon_date: e.target.value }))}
              style={{
                width: "100%", minHeight: 44, padding: "0 12px", borderRadius: 12,
                border: "1px solid var(--border)", fontSize: 14, boxSizing: "border-box",
              }}
            />
          </div>

          <div>
            <label htmlFor="notes" style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)", display: "block", marginBottom: 6 }}>
              Catatan (opsional)
            </label>
            <textarea
              id="notes"
              placeholder="Keterangan tambahan..."
              value={form.notes}
              onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
              rows={3}
              style={{
                width: "100%", padding: 12, borderRadius: 12, border: "1px solid var(--border)",
                fontSize: 14, resize: "vertical", boxSizing: "border-box", fontFamily: "inherit",
              }}
            />
          </div>

          {galatForm && <div style={{ fontSize: 12, color: "var(--danger)" }}>{galatForm}</div>}

          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
            <button
              type="button"
              onClick={() => setSheetTerbuka(false)}
              style={{
                minHeight: 44, padding: "0 16px", borderRadius: "var(--portal-radius-pill)",
                border: "1px solid var(--border)", background: "var(--surface)",
                cursor: "pointer", fontSize: 13, color: "var(--text-secondary)",
              }}
            >
              Batal
            </button>
            <button
              type="submit"
              disabled={saving || !form.project_id}
              style={{
                flex: 1, minHeight: 44, padding: "0 20px", borderRadius: "var(--portal-radius-pill)",
                background: (saving || !form.project_id) ? "var(--surface-hover)" : "var(--navy)",
                color: (saving || !form.project_id) ? "var(--text-muted)" : "var(--on-navy)",
                border: "none",
                cursor: (saving || !form.project_id) ? "default" : "pointer",
                fontSize: 14, fontWeight: 700,
              }}
            >
              {saving ? "Mengajukan…" : "Ajukan Kasbon"}
            </button>
          </div>
        </form>
      </BottomSheet>

      {toast && (
        <div
          role="status"
          aria-live="polite"
          style={{
            position: "fixed", bottom: 80, left: "50%", transform: "translateX(-50%)", zIndex: 10000,
            padding: "12px 20px", borderRadius: 10,
            background: toast.ok ? "var(--success)" : "var(--danger)",
            color: toast.ok ? "var(--on-success-bg)" : "var(--on-danger-bg)",
            fontSize: 13, fontWeight: 600, boxShadow: "var(--naik-2)", whiteSpace: "nowrap",
          }}
        >
          {toast.msg}
        </div>
      )}
    </div>
  );
}
