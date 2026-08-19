"use client";

import { useCallback, useState } from "react";
import { useData } from "@/lib/data-cache";
import { type Kasbon, type Tukang, type Penugasan, type GalatApi, pesanGalat } from "../_bersama/tipe";
import { kirimLapangan } from "@/lib/kirim-lapangan";
import { CreditCard, Plus } from "lucide-react";
import BottomSheet from "@/components/portal/BottomSheet";
import EmptyState from "@/components/portal/EmptyState";
import SkeletonCard from "@/components/portal/SkeletonCard";

function fmt(n: number) {
  return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(n);
}
function fmtDate(s: string | null) {
  if (!s) return "—";
  return new Date(s).toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric" });
}

const PURPOSE_LABELS: Record<string, string> = {
  gaji_tukang: "Gaji Tukang", uang_makan: "Uang Makan",
  pembelian_alat: "Beli Alat", operasional: "Operasional", lain_lain: "Lain-lain",
};

export default function KasbonTukangPage() {
  const [sheetTerbuka, setSheetTerbuka] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [galatForm, setGalatForm] = useState<string | null>(null);
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null);

  // Form
  const [form, setForm] = useState({
    worker_id: "", project_id: "", scope_id: "",
    amount: "", purpose: "gaji_tukang", kasbon_date: "", notes: "",
  });

  /*
    ── PINDAH KE LAPIS CACHE BERSAMA (F4-2), 2026-08-16

    Tiga GET berpasangan diganti `useData`. TIDAK ada cache offline di jalur
    BACA halaman ini — `kirimLapangan` di bawah hanya membungkus jalur TULIS
    (pengajuan kasbon tukang), tidak disentuh.
  */
  const { data: dataKasbon, memuat: memuatKasbon, galat: galatMuatKasbon, muatUlang: muatUlangKasbon } =
    useData<{ kasbons: Kasbon[] }>("/api/v1/mandor/worker-kasbons");
  const { data: dataWorkers, memuat: memuatWorkers, galat: galatMuatWorkers, muatUlang: muatUlangWorkers } =
    useData<{ workers: Tukang[] }>("/api/v1/mandor/workers");
  const { data: dataAssign, memuat: memuatAssign, galat: galatMuatAssign, muatUlang: muatUlangAssign } =
    useData<{ assignments: Penugasan[] }>("/api/v1/mandor/assignments");

  const loading = memuatKasbon || memuatWorkers || memuatAssign;
  const galatMuat = galatMuatKasbon ?? galatMuatWorkers ?? galatMuatAssign;

  // Diturunkan, bukan disalin.
  const kasbons = dataKasbon?.kasbons ?? [];
  const workers = dataWorkers?.workers ?? [];
  const assignments = dataAssign?.assignments ?? [];

  const loadData = useCallback(async () => {
    await Promise.all([muatUlangKasbon(), muatUlangWorkers(), muatUlangAssign()]);
  }, [muatUlangKasbon, muatUlangWorkers, muatUlangAssign]);

  const scopesForProject = assignments
    .find((a) => a.project?.id === form.project_id)
    ?.work_scopes ?? [];

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.worker_id || !form.project_id || !form.amount) {
      setGalatForm("Tukang, proyek, dan jumlah wajib diisi");
      return;
    }
    setSubmitting(true);
    setGalatForm(null);
    try {
      // F4-3 — lewat antrean offline; sinyal buruk adalah norma di lapangan.
      const hasil = await kirimLapangan("POST", "/api/v1/mandor/worker-kasbons", {
        worker_id: form.worker_id,
        project_id: form.project_id,
        scope_id: form.scope_id || undefined,
        amount: Number(form.amount),
        purpose: form.purpose,
        kasbon_date: form.kasbon_date || undefined,
        notes: form.notes || undefined,
      }, "Kasbon tukang berhasil diajukan", "Gagal mengajukan kasbon");

      // Form dikosongkan hanya bila kirimannya AMAN — kalau tidak, isian
      // mandor hilang dan ia harus mengetik ulang.
      if (!hasil.aman) {
        setGalatForm(hasil.pesan);
        return;
      }
      setToast({ msg: hasil.pesan, ok: true });
      setTimeout(() => setToast(null), 3500);
      setSheetTerbuka(false);
      setForm({ worker_id: "", project_id: "", scope_id: "", amount: "", purpose: "gaji_tukang", kasbon_date: "", notes: "" });
      if (hasil.terkirim) await loadData();
    } catch (err) {
      setGalatForm(pesanGalat(err, "Gagal mengajukan kasbon"));
    } finally {
      setSubmitting(false);
    }
  }

  const pending = kasbons.filter((k) => !k.is_settled).length;
  const totalOutstanding = kasbons
    .filter((k) => !k.is_settled)
    .reduce((s, k) => s + (Number(k.amount) - Number(k.amount_settled ?? 0)), 0);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 700, color: "var(--text-primary)", margin: 0 }}>Kasbon Tukang</h1>
          <p style={{ fontSize: 13, color: "var(--text-secondary)", margin: "4px 0 0" }}>Ajukan kasbon untuk tukang di bawah Anda</p>
        </div>
        <button
          onClick={() => setSheetTerbuka(true)}
          style={{
            display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
            minHeight: 44, padding: "0 16px", borderRadius: "var(--portal-radius-pill)",
            border: "none", background: "var(--grad-merek)", color: "var(--on-navy)",
            fontSize: 13, fontWeight: 700, cursor: "pointer", flexShrink: 0,
          }}
        >
          <Plus size={16} aria-hidden="true" /> Ajukan
        </button>
      </div>

      {!loading && !galatMuat && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <div style={{ background: "var(--surface)", borderRadius: 16, padding: 16, border: "1px solid var(--border)" }}>
            <div style={{ fontSize: 11, color: "var(--text-secondary)", fontWeight: 600, marginBottom: 6 }}>Kasbon Aktif</div>
            <div style={{ fontSize: 26, fontWeight: 800, color: "var(--on-warning-bg)" }}>{pending}</div>
          </div>
          <div style={{ background: "var(--surface)", borderRadius: 16, padding: 16, border: "1px solid var(--border)" }}>
            <div style={{ fontSize: 11, color: "var(--text-secondary)", fontWeight: 600, marginBottom: 6 }}>Total Outstanding</div>
            <div style={{ fontSize: 15, fontWeight: 800, color: "var(--on-danger-bg)" }}>{fmt(totalOutstanding)}</div>
          </div>
        </div>
      )}

      {loading && (
        <>
          <SkeletonCard tinggi={80} />
          <SkeletonCard tinggi={80} />
        </>
      )}

      {!loading && galatMuat && (
        <EmptyState
          icon={CreditCard}
          judul="Gagal memuat kasbon tukang"
          deskripsi={pesanGalat(galatMuat as GalatApi, "Coba muat ulang halaman ini.")}
        />
      )}

      {!loading && !galatMuat && kasbons.length === 0 && (
        <EmptyState
          icon={CreditCard}
          judul="Belum ada kasbon tukang"
          deskripsi="Kasbon yang Anda ajukan untuk tukang akan muncul di sini, lengkap dengan status pelunasannya."
        />
      )}

      {!loading && !galatMuat && kasbons.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {kasbons.map((k) => (
            <div
              key={k.id}
              style={{
                padding: 16, borderRadius: 16, background: "var(--surface)",
                border: "1px solid var(--border)", display: "flex", flexDirection: "column", gap: 8,
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: "var(--text-primary)" }}>{k.worker?.name ?? "—"}</div>
                  <div style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: 2 }}>
                    {PURPOSE_LABELS[k.purpose ?? ""] ?? k.purpose} · {k.project?.name ?? "—"} · {fmtDate(k.kasbon_date ?? null)}
                  </div>
                </div>
                <div style={{ textAlign: "right", flexShrink: 0 }}>
                  <div style={{ fontSize: 15, fontWeight: 800, color: "var(--text-primary)" }}>{fmt(Number(k.amount))}</div>
                  <div style={{ fontSize: 11, color: k.is_settled ? "var(--on-success-bg)" : "var(--on-warning-bg)", fontWeight: 600, marginTop: 2 }}>
                    {k.is_settled ? "Lunas" : `Sisa ${fmt(Number(k.amount) - Number(k.amount_settled ?? 0))}`}
                  </div>
                </div>
              </div>
              {Number(k.amount_settled ?? 0) > 0 && !k.is_settled && (
                <div>
                  <div style={{ height: 4, background: "var(--surface-subtle)", borderRadius: 6, overflow: "hidden" }}>
                    <div
                      style={{
                        height: "100%", borderRadius: 6, background: "var(--success)",
                        width: `${Math.min(100, (Number(k.amount_settled) / Number(k.amount)) * 100)}%`,
                      }}
                    />
                  </div>
                  <div style={{ fontSize: 11, color: "var(--text-secondary)", marginTop: 3 }}>
                    Dicicil {fmt(Number(k.amount_settled ?? 0))} dari {fmt(Number(k.amount))}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <BottomSheet terbuka={sheetTerbuka} onTutup={() => setSheetTerbuka(false)} judul="Ajukan Kasbon Tukang">
        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div>
            <label htmlFor="worker-id" style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)", display: "block", marginBottom: 6 }}>
              Tukang *
            </label>
            <select
              id="worker-id"
              aria-label="Pilih tukang"
              value={form.worker_id}
              onChange={(e) => setForm((f) => ({ ...f, worker_id: e.target.value }))}
              style={{
                width: "100%", minHeight: 44, padding: "0 12px", borderRadius: 12,
                border: "1px solid var(--border)", fontSize: 14, color: "var(--text-primary)",
                background: "var(--surface)", boxSizing: "border-box",
              }}
            >
              <option value="">Pilih tukang...</option>
              {workers.filter((w) => w.is_active).map((w) => (
                <option key={w.id} value={w.id}>{w.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="project-id" style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)", display: "block", marginBottom: 6 }}>
              Proyek *
            </label>
            <select
              id="project-id"
              aria-label="Proyek"
              value={form.project_id}
              onChange={(e) => setForm((f) => ({ ...f, project_id: e.target.value, scope_id: "" }))}
              style={{
                width: "100%", minHeight: 44, padding: "0 12px", borderRadius: 12,
                border: "1px solid var(--border)", fontSize: 14, color: "var(--text-primary)",
                background: "var(--surface)", boxSizing: "border-box",
              }}
            >
              <option value="">Pilih proyek...</option>
              {assignments.map((a) => (
                <option key={a.project?.id} value={a.project?.id ?? ""}>{a.project?.name}</option>
              ))}
            </select>
          </div>
          {scopesForProject.length > 0 && (
            <div>
              <label htmlFor="scope-id" style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)", display: "block", marginBottom: 6 }}>
                Scope (opsional)
              </label>
              <select
                id="scope-id"
                aria-label="Lingkup"
                value={form.scope_id}
                onChange={(e) => setForm((f) => ({ ...f, scope_id: e.target.value }))}
                style={{
                  width: "100%", minHeight: 44, padding: "0 12px", borderRadius: 12,
                  border: "1px solid var(--border)", fontSize: 14, color: "var(--text-primary)",
                  background: "var(--surface)", boxSizing: "border-box",
                }}
              >
                <option value="">Semua scope</option>
                {scopesForProject.map((s) => (
                  <option key={s.id} value={s.id}>{s.scope_name}</option>
                ))}
              </select>
            </div>
          )}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            <div>
              <label htmlFor="amount" style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)", display: "block", marginBottom: 6 }}>
                Jumlah (Rp) *
              </label>
              <input
                id="amount"
                type="number"
                min="1"
                value={form.amount}
                onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))}
                placeholder="0"
                style={{
                  width: "100%", minHeight: 44, padding: "0 12px", borderRadius: 12,
                  border: "1px solid var(--border)", fontSize: 14, boxSizing: "border-box",
                }}
              />
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
          </div>
          <div>
            <label htmlFor="purpose" style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)", display: "block", marginBottom: 6 }}>
              Tujuan
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
              {Object.entries(PURPOSE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </div>
          <div>
            <label htmlFor="notes" style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)", display: "block", marginBottom: 6 }}>
              Catatan
            </label>
            <textarea
              id="notes"
              value={form.notes}
              onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
              rows={2}
              placeholder="Opsional"
              style={{
                width: "100%", padding: 12, borderRadius: 12, border: "1px solid var(--border)",
                fontSize: 14, resize: "vertical", boxSizing: "border-box", fontFamily: "inherit",
              }}
            />
          </div>

          {galatForm && <div style={{ fontSize: 12, color: "var(--danger)" }}>{galatForm}</div>}

          <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
            <button
              type="button"
              onClick={() => setSheetTerbuka(false)}
              style={{
                flex: 1, minHeight: 44, padding: "0 12px", borderRadius: "var(--portal-radius-pill)",
                border: "1px solid var(--border)", background: "var(--surface)",
                color: "var(--text-secondary)", fontSize: 13, fontWeight: 700, cursor: "pointer",
              }}
            >
              Batal
            </button>
            <button
              type="submit"
              disabled={submitting}
              style={{
                flex: 2, minHeight: 44, padding: "0 12px", borderRadius: "var(--portal-radius-pill)",
                border: "none",
                background: submitting ? "var(--surface-hover)" : "var(--navy)",
                color: submitting ? "var(--text-muted)" : "var(--on-navy)",
                fontSize: 13, fontWeight: 700, cursor: submitting ? "default" : "pointer",
              }}
            >
              {submitting ? "Mengajukan…" : "Ajukan Kasbon"}
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
