"use client";

import { useEffect, useState, useCallback } from "react";
import { useTerpasang } from "@/lib/use-terpasang";
import { useTutupEsc } from "@/lib/use-tutup-esc";
import { createPortal } from "react-dom";
import { X, Plus, Trash2, ChevronRight, ChevronLeft, Check } from "lucide-react";
import { api } from "@/lib/api";

// ─── Types ────────────────────────────────────────────────────────────────────

interface ClientOption { id: string; contact_person: string; company_name: string | null }
interface UserOption { id: string; name: string; email: string }

interface TerminRow {
  label: string;
  pct_of_contract: number;
  target_date: string;
  trigger_type: "on_sign" | "on_progress" | "on_retention";
  trigger_pct: string;    // hanya untuk on_progress (threshold %)
  due_days: string;       // hanya untuk on_retention (hari setelah serah terima)
}

export interface ProjectFormData {
  // Step 1
  name: string;
  location: string;
  client_id: string;
  pm_id: string;
  description: string;
  // Step 2
  contract_model: "termin" | "komisi";
  contract_value: string;
  tax_scheme: "pph_final" | "ppn" | "tanpa_pajak";
  commission_pct: string;
  retention_pct: string;
  start_date: string;
  end_date: string;
  // Denda — override per proyek (opsional; false = ikuti aturan global)
  penalty_override: boolean;
  penalty_enabled: boolean;
  penalty_basis: string;
  penalty_rate_permil: string;   // ‰/hari
  penalty_cap_pct: string;       // %
  penalty_grace_days: string;    // hari
  // Step 3
  termin_schedules: TerminRow[];
}

interface ProjectModalProps {
  mode: "create" | "edit";
  initialData?: Partial<ProjectFormData>;
  projectId?: string;
  onClose: () => void;
  onSuccess: () => void;
}

// ─── Design tokens ────────────────────────────────────────────────────────────

import { C } from "@/lib/warna-ui";
import { Saklar } from "@/components/saklar";
import { Pilihan } from "@/components/pilihan";

const inputStyle: React.CSSProperties = {
  width: "100%", padding: "8px 12px",
  border: "1px solid var(--border)", borderRadius: 6,
  fontSize: 13, color: C.text, background: "var(--surface)",
  outline: "none", transition: "border-color 0.15s, box-shadow 0.15s",
  boxSizing: "border-box",
};

const labelStyle: React.CSSProperties = {
  display: "block", fontSize: 12, fontWeight: 600,
  color: C.mid, marginBottom: 5, letterSpacing: "0.03em",
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtRupiah(val: string): string {
  const n = val.replace(/\D/g, "");
  return n ? Number(n).toLocaleString("id-ID") : "";
}

function parseRupiah(val: string): number {
  return Number(val.replace(/\D/g, "")) || 0;
}

// ─── Default form state ───────────────────────────────────────────────────────

const DEFAULT_FORM: ProjectFormData = {
  name: "", location: "", client_id: "", pm_id: "", description: "",
  contract_model: "termin",
  contract_value: "",
  tax_scheme: "pph_final",
  commission_pct: "",
  retention_pct: "5",
  start_date: "", end_date: "",
  penalty_override: false, penalty_enabled: false, penalty_basis: "invoice_telat",
  penalty_rate_permil: "1", penalty_cap_pct: "5", penalty_grace_days: "0",
  termin_schedules: [
    { label: "Tahap 1 — DP Kontrak", pct_of_contract: 30, target_date: "", trigger_type: "on_sign", trigger_pct: "", due_days: "" },
    { label: "Tahap 2", pct_of_contract: 20, target_date: "", trigger_type: "on_progress", trigger_pct: "40", due_days: "" },
    { label: "Tahap 3", pct_of_contract: 20, target_date: "", trigger_type: "on_progress", trigger_pct: "70", due_days: "" },
    { label: "Tahap 4 — Selesai", pct_of_contract: 25, target_date: "", trigger_type: "on_progress", trigger_pct: "100", due_days: "" },
    { label: "Retensi", pct_of_contract: 5, target_date: "", trigger_type: "on_retention", trigger_pct: "", due_days: "90" },
  ],
};

// ─── Main modal ───────────────────────────────────────────────────────────────

export function ProjectModal({ mode, initialData, projectId, onClose, onSuccess }: ProjectModalProps) {
  useTutupEsc(onClose);
  const mounted = useTerpasang();

  const [step, setStep] = useState(1);
  const [form, setForm] = useState<ProjectFormData>(() => ({ ...DEFAULT_FORM, ...initialData }));
  const [clients, setClients] = useState<ClientOption[]>([]);
  const [pms, setPms] = useState<UserOption[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitError, setSubmitError] = useState("");

  // Load clients + PMs on mount
  useEffect(() => {
    async function loadDropdownData() {
      try {
        const [clientsRes, pmsRes] = await Promise.all([
          api.get<{ clients: ClientOption[] }>("/api/v1/clients"),
          api.get<{ users: UserOption[] }>("/api/v1/users?role=pm"),
        ]);
        setClients(clientsRes.data.clients ?? []);
        setPms(pmsRes.data.users ?? []);
      } catch (err) {
        console.error("[modal] Failed to load dropdown data:", err);
      }
    }
    loadDropdownData();

    // AKTA 3 Q4/Q5: pre-fill default DP%, retensi, masa pemeliharaan dari config
    // (bukan hardcode). HANYA saat buat proyek baru — jangan timpa data edit.
    if (mode === "create") {
      api.get<{ dp_default_pct: number; maintenance_days: number; retention_pct: number }>("/api/v1/settings/project-defaults")
        .then(({ data }) => {
          setForm(prev => ({
            ...prev,
            retention_pct: String(data.retention_pct),
            termin_schedules: prev.termin_schedules.map(t =>
              t.trigger_type === "on_sign" ? { ...t, pct_of_contract: data.dp_default_pct }
              : t.trigger_type === "on_retention" ? { ...t, pct_of_contract: data.retention_pct, due_days: String(data.maintenance_days) }
              : t
            ),
          }));
        })
        .catch(() => { /* pakai default hardcode bila config tak terbaca */ });
    }
  }, [mode]);

  const set = useCallback(<K extends keyof ProjectFormData>(key: K, val: ProjectFormData[K]) => {
    setForm(prev => ({ ...prev, [key]: val }));
    setErrors(prev => { const e = { ...prev }; delete e[key]; return e; });
  }, []);

  // ── Step validation ──────────────────────────────────────────────────────────

  function validateStep1(): boolean {
    const e: Record<string, string> = {};
    if (!form.name.trim()) e.name = "Nama proyek wajib diisi";
    if (!form.location.trim()) e.location = "Lokasi wajib diisi";
    if (!form.client_id) e.client_id = "Pilih klien";
    if (!form.pm_id) e.pm_id = "Pilih Project Manager";
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  function validateStep2(): boolean {
    const e: Record<string, string> = {};
    if (!form.contract_value || parseRupiah(form.contract_value) <= 0) e.contract_value = "Nilai kontrak wajib diisi";
    if (!form.start_date) e.start_date = "Tanggal mulai wajib diisi";
    if (!form.end_date) e.end_date = "Tanggal selesai wajib diisi";
    if (form.start_date && form.end_date && form.end_date <= form.start_date) e.end_date = "Tanggal selesai harus setelah tanggal mulai";
    if (form.contract_model === "komisi" && !form.commission_pct) e.commission_pct = "Persentase komisi wajib diisi";
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  function validateStep3(): boolean {
    if (form.contract_model !== "termin") return true;
    const total = form.termin_schedules.reduce((s, t) => s + Number(t.pct_of_contract), 0);
    if (Math.abs(total - 100) > 0.01) {
      setErrors({ _termin: `Total persentase harus 100% (saat ini ${total}%)` });
      return false;
    }
    const e: Record<string, string> = {};
    form.termin_schedules.forEach((t, i) => {
      if (!t.label.trim()) e[`termin_label_${i}`] = "Label wajib diisi";
    });
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  // ── Navigation ───────────────────────────────────────────────────────────────

  function handleNext() {
    if (step === 1 && !validateStep1()) return;
    if (step === 2 && !validateStep2()) return;
    // If komisi, skip step 3
    if (step === 2 && form.contract_model === "komisi") {
      handleSubmit();
      return;
    }
    setStep(s => s + 1);
  }

  function handleBack() {
    setErrors({});
    setStep(s => s - 1);
  }

  // ── Submit ───────────────────────────────────────────────────────────────────

  async function handleSubmit() {
    if (step === 3 && !validateStep3()) return;
    setSubmitting(true);
    setSubmitError("");
    try {
      const payload = {
        name: form.name.trim(),
        location: form.location.trim(),
        client_id: form.client_id,
        pm_id: form.pm_id || undefined,
        description: form.description.trim() || undefined,
        contract_model: form.contract_model,
        contract_value: parseRupiah(form.contract_value),
        tax_scheme: form.tax_scheme,
        commission_pct: form.commission_pct ? Number(form.commission_pct) : undefined,
        retention_pct: Number(form.retention_pct) || 5,
        start_date: form.start_date,
        end_date: form.end_date,
        // Override denda per proyek: null = ikuti global effective. Simpan fraksi (‰→/1000, %→/100).
        penalty_enabled:      form.penalty_override ? form.penalty_enabled : null,
        penalty_basis:        form.penalty_override ? form.penalty_basis : null,
        penalty_rate_per_day: form.penalty_override ? (Number(form.penalty_rate_permil) || 0) / 1000 : null,
        penalty_cap_pct:      form.penalty_override ? (Number(form.penalty_cap_pct) || 0) / 100 : null,
        penalty_grace_days:   form.penalty_override ? (Number(form.penalty_grace_days) || 0) : null,
        termin_schedules: form.contract_model === "termin"
          ? form.termin_schedules.map(t => ({
              label: t.label,
              pct_of_contract: Number(t.pct_of_contract),
              target_date: t.target_date || undefined,
              trigger_type: t.trigger_type,
              trigger_pct: t.trigger_pct ? Number(t.trigger_pct) : null,
              due_days: t.due_days ? Number(t.due_days) : null,
            }))
          : undefined,
      };

      if (mode === "create") {
        await api.post("/api/v1/projects", payload);
      } else {
        await api.put(`/api/v1/projects/${projectId}`, payload);
      }

      onSuccess();
      onClose();
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })
        ?.response?.data?.error ?? "Terjadi kesalahan. Coba lagi.";
      setSubmitError(msg);
    } finally {
      setSubmitting(false);
    }
  }

  // ── Termin helpers ───────────────────────────────────────────────────────────

  function addTermin() {
    const n = form.termin_schedules.length + 1;
    set("termin_schedules", [...form.termin_schedules, {
      label: `Termin ${n}`, pct_of_contract: 0, target_date: "",
      trigger_type: "on_progress", trigger_pct: "", due_days: "",
    }]);
  }

  function removeTermin(i: number) {
    set("termin_schedules", form.termin_schedules.filter((_, idx) => idx !== i));
  }

  function updateTermin(i: number, field: keyof TerminRow, val: string | number) {
    const updated = form.termin_schedules.map((t, idx) => idx === i ? { ...t, [field]: val } : t);
    set("termin_schedules", updated);
  }

  const terminTotal = form.termin_schedules.reduce((s, t) => s + Number(t.pct_of_contract), 0);
  const contractVal = parseRupiah(form.contract_value);

  // ── Steps metadata ───────────────────────────────────────────────────────────

  const totalSteps = form.contract_model === "termin" ? 3 : 2;
  const STEPS = [
    { n: 1, label: "Info Dasar" },
    { n: 2, label: "Kontrak" },
    ...(form.contract_model === "termin" ? [{ n: 3, label: "Jadwal Termin" }] : []),
  ];

  const isLastStep = step === totalSteps;

  if (!mounted) return null;

  return createPortal(
    <div
      style={{
        position: "fixed", inset: 0,
        background: "rgba(0,0,0,0.4)",
        display: "flex", alignItems: "center", justifyContent: "center",
        zIndex: 1000, padding: 24,
      }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div style={{
        background: "var(--surface)", borderRadius: 14, width: "100%", maxWidth: 600,
        boxShadow: "var(--naik-3)",
        maxHeight: "90vh", display: "flex", flexDirection: "column",
      }}>
        {/* ── Modal header ── */}
        <div style={{ padding: "24px 28px 0", flexShrink: 0 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
            <h2 style={{ fontFamily: "var(--font-display)", fontSize: 17, fontWeight: 700, color: C.text }}>
              {mode === "create" ? "Tambah Proyek Baru" : "Edit Proyek"}
            </h2>
            <button aria-label="Tutup dialog proyek"
              onClick={onClose}
              style={{ background: "none", border: "none", cursor: "pointer", color: C.muted, padding: 4, borderRadius: 6, display: "flex" }}
              onMouseEnter={e => { e.currentTarget.style.background = "var(--surface-hover)"; e.currentTarget.style.color = C.text; }}
              onMouseLeave={e => { e.currentTarget.style.background = "none"; e.currentTarget.style.color = C.muted; }}
            >
              <X size={18} />
            </button>
          </div>

          {/* Step indicator */}
          <div style={{ display: "flex", alignItems: "center", gap: 0, marginBottom: 24 }}>
            {STEPS.map((s, idx) => (
              <div key={s.n} style={{ display: "flex", alignItems: "center", flex: idx < STEPS.length - 1 ? 1 : "none" }}>
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
                  <div style={{
                    width: 28, height: 28, borderRadius: "50%",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: 11, fontWeight: 700,
                    background: step > s.n ? C.navy : step === s.n ? C.navy : "var(--surface-hover)",
                    color: step >= s.n ? "var(--surface)" : C.muted,
                    transition: "all 0.2s",
                    flexShrink: 0,
                  }}>
                    {step > s.n ? <Check size={13} /> : s.n}
                  </div>
                  <span style={{ fontSize: 10, fontWeight: step === s.n ? 600 : 400, color: step === s.n ? C.navy : C.muted, whiteSpace: "nowrap" }}>
                    {s.label}
                  </span>
                </div>
                {idx < STEPS.length - 1 && (
                  <div style={{
                    flex: 1, height: 2, marginBottom: 16, marginLeft: 4, marginRight: 4,
                    background: step > s.n ? C.navy : "var(--border)",
                    transition: "background 0.2s",
                  }} />
                )}
              </div>
            ))}
          </div>
        </div>

        {/* ── Modal body (scrollable) ── */}
        <div style={{ flex: 1, overflowY: "auto", padding: "0 28px" }}>

          {/* ── STEP 1: Info Dasar ── */}
          {step === 1 && (
            <div style={{ display: "flex", flexDirection: "column", gap: "var(--gap-bagian)" }}>
              <Field label="Nama Proyek *" error={errors.name}>
                <input style={inputStyle} value={form.name} onChange={e => set("name", e.target.value)} placeholder="Contoh: Renovasi Rumah Pak Budi" />
              </Field>
              <Field label="Lokasi *" error={errors.location}>
                <input style={inputStyle} value={form.location} onChange={e => set("location", e.target.value)} placeholder="Contoh: Bandung, Jawa Barat" />
              </Field>
              <Field label="Klien *" error={errors.client_id}>
                <Pilihan aria-label="Klien pemberi kerja proyek" style={inputStyle} value={form.client_id} onChange={e => set("client_id", e.target.value)}>
                  <option value="">-- Pilih Klien --</option>
                  {clients.map(c => (
                    <option key={c.id} value={c.id}>
                      {c.contact_person}{c.company_name ? ` (${c.company_name})` : ""}
                    </option>
                  ))}
                </Pilihan>
              </Field>
              <Field label="Project Manager *" error={errors.pm_id}>
                <Pilihan aria-label="Project manager penanggung jawab" style={inputStyle} value={form.pm_id} onChange={e => set("pm_id", e.target.value)}>
                  <option value="">-- Pilih PM --</option>
                  {pms.map(u => (
                    <option key={u.id} value={u.id}>{u.name} ({u.email})</option>
                  ))}
                </Pilihan>
              </Field>
              <Field label="Deskripsi" error={errors.description}>
                <textarea
                  style={{ ...inputStyle, minHeight: 80, resize: "vertical" }}
                  value={form.description}
                  onChange={e => set("description", e.target.value)}
                  placeholder="Deskripsi singkat proyek (opsional)"
                />
              </Field>
            </div>
          )}

          {/* ── STEP 2: Kontrak ── */}
          {step === 2 && (
            <div style={{ display: "flex", flexDirection: "column", gap: "var(--gap-bagian)" }}>
              <Field label="Model Kontrak">
                <div style={{ display: "flex", gap: 12 }}>
                  {(["termin", "komisi"] as const).map(m => (
                    <RadioCard
                      key={m}
                      label={m === "termin" ? "Termin" : "Komisi"}
                      description={m === "termin" ? "Tagih klien per tahap" : "Tagih berdasarkan pengeluaran + komisi"}
                      checked={form.contract_model === m}
                      onClick={() => set("contract_model", m)}
                    />
                  ))}
                </div>
              </Field>

              <Field label="Nilai Kontrak *" error={errors.contract_value}>
                <div style={{ position: "relative" }}>
                  <span style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", fontSize: 13, color: C.muted, pointerEvents: "none" }}>Rp</span>
                  <input
                    style={{ ...inputStyle, paddingLeft: 32 }}
                    value={fmtRupiah(form.contract_value)}
                    onChange={e => set("contract_value", e.target.value.replace(/\D/g, ""))}
                    placeholder="0"
                    inputMode="numeric"
                  />
                </div>
              </Field>

              {/*
                Saklar pajak — diminta founder 2026-09-04: "pas bikin proyek
                juga bisa gapake pajak … ada saklar on off nya".

                Sebelum ini pilihannya cuma DUA, dan keduanya berarti "kena":
                PPh Final atau PPN. Untuk borongan kecil dan pekerjaan
                perorangan, tidak dikenai pajak adalah keadaan yang WAJAR —
                dan memaksa memilih salah satu membuat angka RAB serta invoice
                memuat pajak yang tak pernah ditagihkan ke klien.

                Nilai ketiga `tanpa_pajak` ditambahkan ke enum lewat migrasi
                566, BUKAN kolom boolean terpisah: satu kolom, satu kebenaran.
                Kolom `kena_pajak` di samping `tax_scheme` melahirkan keadaan
                mustahil (mati tapi skemanya PPN), dan tiap pembaca harus tahu
                mana yang menang.

                Saat saklar dimatikan, pilihan skemanya DISEMBUNYIKAN — bukan
                sekadar diabaikan. Pilihan yang terlihat tapi tak berpengaruh
                mengajari orang bahwa layar ini tak bisa dipercaya.
              */}
              <Field label="Pajak">
                <Saklar
                  nyala={form.tax_scheme !== "tanpa_pajak"}
                  onUbah={(n) => set("tax_scheme", n ? "pph_final" : "tanpa_pajak")}
                  label="Proyek ini dikenai pajak"
                  ringkas={
                    form.tax_scheme === "tanpa_pajak"
                      ? "Dimatikan — RAB dan invoice dihitung tanpa pajak."
                      : "Pilih skemanya di bawah."
                  }
                />
              </Field>

              {form.tax_scheme !== "tanpa_pajak" && (
                <Field label="Skema Pajak">
                  <div style={{ display: "flex", gap: 12 }}>
                    <RadioCard label="PPh Final (2%)" description="Untuk klien perorangan" checked={form.tax_scheme === "pph_final"} onClick={() => set("tax_scheme", "pph_final")} />
                    <RadioCard label="PPN (11%)" description="Untuk klien perusahaan (B2B)" checked={form.tax_scheme === "ppn"} onClick={() => set("tax_scheme", "ppn")} />
                  </div>
                </Field>
              )}

              {form.contract_model === "komisi" && (
                <Field label="Persentase Komisi (%)*" error={errors.commission_pct}>
                  <input style={inputStyle} type="number" min="0" max="100" step="0.5" value={form.commission_pct} onChange={e => set("commission_pct", e.target.value)} placeholder="Contoh: 10" />
                </Field>
              )}

              <Field label="Retensi (%)" error={errors.retention_pct}>
                <input style={inputStyle} type="number" min="0" max="50" step="0.5" value={form.retention_pct} onChange={e => set("retention_pct", e.target.value)} placeholder="5" />
              </Field>

              {/* Denda — override per proyek (syarat kontrak; default ikuti aturan global) */}
              <div style={{ border: `1px solid ${C.border}`, borderRadius: 10, padding: "12px 12px", background: "var(--surface-subtle)" }}>
                <Saklar
                  nyala={form.penalty_override}
                  onUbah={(v) => set("penalty_override", v)}
                  label="Atur denda khusus proyek ini"
                  ringkas={form.penalty_override
                    ? "Nilai di bawah menimpa aturan denda global untuk proyek ini."
                    : "Mengikuti aturan denda global (Konfigurasi Keuangan)."}
                />
                {form.penalty_override && (
                  <div style={{ marginLeft: 24, marginTop: 12, display: "flex", flexDirection: "column", gap: 8 }}>
                    <Saklar
                      nyala={form.penalty_enabled}
                      onUbah={(v) => set("penalty_enabled", v)}
                      label="Denda aktif untuk proyek ini"
                    />
                    <Field label="Basis denda">
                      <Pilihan id="penalty-basis" aria-label="Basis perhitungan denda keterlambatan" style={inputStyle} value={form.penalty_basis} onChange={e => set("penalty_basis", e.target.value)}>
                        <option value="invoice_telat">Nilai invoice yang telat</option>
                        <option value="outstanding_proyek">Sisa outstanding proyek</option>
                        <option value="kontrak_total">Nilai kontrak total</option>
                      </Pilihan>
                    </Field>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
                      <Field label="Tarif (‰/hari)">
                        <input style={inputStyle} type="number" min="0" step="0.1" value={form.penalty_rate_permil} onChange={e => set("penalty_rate_permil", e.target.value)} placeholder="1" />
                      </Field>
                      <Field label="Cap (%)">
                        <input style={inputStyle} type="number" min="0" max="100" step="0.1" value={form.penalty_cap_pct} onChange={e => set("penalty_cap_pct", e.target.value)} placeholder="5" />
                      </Field>
                      <Field label="Grace (hari)">
                        <input style={inputStyle} type="number" min="0" step="1" value={form.penalty_grace_days} onChange={e => set("penalty_grace_days", e.target.value)} placeholder="0" />
                      </Field>
                    </div>
                  </div>
                )}
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <Field label="Tanggal Mulai *" error={errors.start_date}>
                  <input style={inputStyle} type="date" value={form.start_date} onChange={e => set("start_date", e.target.value)} />
                </Field>
                <Field label="Tanggal Selesai *" error={errors.end_date}>
                  <input style={inputStyle} type="date" value={form.end_date} min={form.start_date} onChange={e => set("end_date", e.target.value)} />
                </Field>
              </div>
            </div>
          )}

          {/* ── STEP 3: Jadwal Termin ── */}
          {step === 3 && (
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {/* Total indicator */}
              <div style={{
                padding: "8px 12px", borderRadius: 6,
                background: Math.abs(terminTotal - 100) < 0.01 ? "var(--success-bg)" : "var(--danger-bg)",
                border: `1px solid ${Math.abs(terminTotal - 100) < 0.01 ? "var(--success-border)" : "var(--danger-border)"}`,
                display: "flex", justifyContent: "space-between", alignItems: "center",
              }}>
                <span style={{ fontSize: 13, color: Math.abs(terminTotal - 100) < 0.01 ? C.green : C.red, fontWeight: 600 }}>
                  Total persentase: {terminTotal}%
                  {Math.abs(terminTotal - 100) < 0.01 ? " ✓" : " — harus 100%"}
                </span>
                <span style={{ fontSize: 12, color: C.muted }}>
                  Nilai kontrak: Rp {contractVal.toLocaleString("id-ID")}
                </span>
              </div>

              {errors._termin && (
                <p style={{ fontSize: 12, color: C.red, margin: 0 }}>{errors._termin}</p>
              )}

              {form.termin_schedules.map((t, i) => {
                return (
                  <div key={i} style={{ border: "1px solid var(--border)", borderRadius: 10, padding: "12px 16px", background: "var(--surface-subtle)" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <span style={{ fontSize: 12, fontWeight: 600, color: C.navy }}>Termin {i + 1}</span>
                        <span style={{
                          fontSize: 10, fontWeight: 600, padding: "2px 8px", borderRadius: 20,
                          background: t.trigger_type === "on_sign" ? "var(--navy-light)" : t.trigger_type === "on_retention" ? "var(--warning-bg)" : C.navyLight,
                          color: t.trigger_type === "on_sign" ? "var(--info)" : t.trigger_type === "on_retention" ? "var(--warning)" : C.navy,
                        }}>
                          {t.trigger_type === "on_sign" ? "ON SIGN" : t.trigger_type === "on_retention" ? "RETENSI" : `ON PROGRESS ≥ ${t.trigger_pct || "?"}%`}
                        </span>
                      </div>
                      {form.termin_schedules.length > 1 && (
                        <button aria-label="Hapus termin ini"
                          onClick={() => removeTermin(i)}
                          style={{ background: "none", border: "none", cursor: "pointer", color: C.muted, display: "flex", padding: 4, borderRadius: 6 }}
                          onMouseEnter={e => { e.currentTarget.style.color = C.red; e.currentTarget.style.background = "var(--danger-bg)"; }}
                          onMouseLeave={e => { e.currentTarget.style.color = C.muted; e.currentTarget.style.background = "none"; }}
                        >
                          <Trash2 size={14} />
                        </button>
                      )}
                    </div>

                    <div style={{ display: "grid", gridTemplateColumns: "1fr 90px 1fr", gap: 8, marginBottom: 10 }}>
                      <Field label="Label" error={errors[`termin_label_${i}`]}>
                        <input style={inputStyle} value={t.label} onChange={e => updateTermin(i, "label", e.target.value)} placeholder={`Termin ${i + 1}`} />
                      </Field>
                      <Field label="Persentase (%)">
                        <input
                          style={inputStyle} type="number" min="0" max="100" step="0.5"
                          value={t.pct_of_contract}
                          onChange={e => updateTermin(i, "pct_of_contract", Number(e.target.value))}
                        />
                      </Field>
                      <Field label="Nilai (auto)">
                        <input
                          style={{ ...inputStyle, background: "var(--surface-subtle)", color: C.mid }}
                          disabled
                          value={`Rp ${Math.round(contractVal * (Number(t.pct_of_contract) / 100)).toLocaleString("id-ID")}`}
                        />
                      </Field>
                    </div>

                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                      <Field label="Trigger Pembayaran">
                        <Pilihan
                          aria-label="Pemicu penagihan termin"
                          style={inputStyle}
                          value={t.trigger_type}
                          onChange={e => updateTermin(i, "trigger_type", e.target.value)}
                        >
                          <option value="on_sign">Saat TTD Kontrak</option>
                          <option value="on_progress">Saat Progress Capai (%)</option>
                          <option value="on_retention">Retensi (setelah serah terima)</option>
                        </Pilihan>
                      </Field>

                      {t.trigger_type === "on_progress" && (
                        <Field label="Threshold Progress (%)">
                          <input
                            style={inputStyle} type="number" min="1" max="100" step="1"
                            value={t.trigger_pct}
                            onChange={e => updateTermin(i, "trigger_pct", e.target.value)}
                            placeholder="Contoh: 40"
                          />
                        </Field>
                      )}

                      {t.trigger_type === "on_retention" && (
                        <Field label="Jatuh Tempo (hari setelah serah terima)">
                          <input
                            style={inputStyle} type="number" min="1" step="1"
                            value={t.due_days}
                            onChange={e => updateTermin(i, "due_days", e.target.value)}
                            placeholder="Contoh: 90"
                          />
                        </Field>
                      )}

                      {t.trigger_type === "on_sign" && (
                        <Field label="Target Tanggal (opsional)">
                          <input style={inputStyle} type="date" value={t.target_date} onChange={e => updateTermin(i, "target_date", e.target.value)} />
                        </Field>
                      )}
                    </div>
                  </div>
                );
              })}

              <button
                onClick={addTermin}
                style={{
                  display: "flex", alignItems: "center", gap: 6,
                  padding: "8px 12px", borderRadius: 6,
                  border: "1px dashed var(--border)", background: "transparent",
                  fontSize: 13, color: C.mid, cursor: "pointer",
                  transition: "all 0.12s",
                }}
                onMouseEnter={e => { e.currentTarget.style.borderColor = C.navy; e.currentTarget.style.color = C.navy; e.currentTarget.style.background = C.navyLight; }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = "var(--border)"; e.currentTarget.style.color = C.mid; e.currentTarget.style.background = "transparent"; }}
              >
                <Plus size={14} /> Tambah Termin
              </button>
            </div>
          )}

          {submitError && (
            <div style={{ marginTop: 16, padding: "8px 12px", borderRadius: 6, background: "var(--danger-bg)", border: "1px solid var(--danger-border)", fontSize: 13, color: C.red }}>
              {submitError}
            </div>
          )}
        </div>

        {/* ── Modal footer ── */}
        <div style={{
          padding: "20px 28px", borderTop: "1px solid var(--surface-hover)",
          display: "flex", justifyContent: "space-between", alignItems: "center",
          flexShrink: 0,
        }}>
          <button
            onClick={step === 1 ? onClose : handleBack}
            style={{
              display: "flex", alignItems: "center", gap: 4,
              padding: "8px 16px", borderRadius: 6,
              border: "1px solid var(--border)", background: "var(--surface)",
              fontSize: 13, fontWeight: 500, color: C.mid, cursor: "pointer",
              transition: "all 0.12s",
            }}
            onMouseEnter={e => { e.currentTarget.style.background = "var(--surface-subtle)"; e.currentTarget.style.color = C.text; }}
            onMouseLeave={e => { e.currentTarget.style.background = "var(--surface)"; e.currentTarget.style.color = C.mid; }}
          >
            {step > 1 && <ChevronLeft size={14} />}
            {step === 1 ? "Batal" : "Kembali"}
          </button>

          <button
            onClick={isLastStep ? handleSubmit : handleNext}
            disabled={submitting}
            style={{
              display: "flex", alignItems: "center", gap: 4,
              padding: "8px 20px", borderRadius: 6, border: "none",
              background: submitting ? "var(--text-muted)" : C.navy,
              color: "var(--surface)", fontSize: 13, fontWeight: 600,
              cursor: submitting ? "not-allowed" : "pointer",
              transition: "background 0.15s",
            }}
            onMouseEnter={e => { if (!submitting) e.currentTarget.style.background = "var(--aksen-pekat)"; }}
            onMouseLeave={e => { if (!submitting) e.currentTarget.style.background = C.navy; }}
          >
            {submitting ? "Menyimpan..." : isLastStep ? mode === "create" ? "Buat Proyek" : "Simpan Perubahan" : (
              <>{step === 2 && form.contract_model === "komisi" ? mode === "create" ? "Buat Proyek" : "Simpan" : "Berikutnya"} <ChevronRight size={14} /></>
            )}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}

// ─── Field wrapper ────────────────────────────────────────────────────────────

/**
 * Label + kontrol.
 *
 * ⚠️ Labelnya TIDAK terhubung ke kontrolnya (`<label>` tanpa `htmlFor`) —
 * ia hanya teks yang terlihat. Sempat diubah jadi label pembungkus, tapi
 * dikembalikan: pembungkusan terjadi LINTAS BERKAS (label di sini, kontrol di
 * pemanggil), sehingga penjaga statis tak bisa melihatnya dan angkanya tak
 * turun sedikit pun. Menambah kerumitan tanpa manfaat terukur.
 *
 * Karena itu tiap `<select>` yang memakai `Field` diberi `aria-label`
 * eksplisit. Namanya sengaja LEBIH SPESIFIK daripada teks labelnya — pembaca
 * layar menyebut kontrol tanpa konteks di sekitarnya, jadi "Klien" saja tak
 * cukup membedakannya dari dropdown klien di layar lain.
 */
function Field({ label, error, children }: { label: string; error?: string; children: React.ReactNode }) {
  return (
    <div>
      <label style={labelStyle}>{label}</label>
      {children}
      {error && <p style={{ fontSize: 11, color: "var(--danger)", marginTop: 4, marginBottom: 0 }}>{error}</p>}
    </div>
  );
}

// ─── Radio card ───────────────────────────────────────────────────────────────

function RadioCard({ label, description, checked, onClick }: {
  label: string; description: string; checked: boolean; onClick: () => void;
}) {
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={e => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault()   // Spasi jangan menggulir modal
          onClick()
        }
      }}
      style={{
        flex: 1, padding: "12px 12px", borderRadius: 10, cursor: "pointer",
        border: `2px solid ${checked ? "var(--navy)" : "var(--border)"}`,
        background: checked ? "var(--navy-light)" : "var(--surface)",
        transition: "all 0.15s",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 3 }}>
        <div style={{
          width: 14, height: 14, borderRadius: "50%", flexShrink: 0,
          border: `2px solid ${checked ? "var(--navy)" : "var(--border-strong)"}`,
          display: "flex", alignItems: "center", justifyContent: "center",
        }}>
          {checked && <div style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--navy)" }} />}
        </div>
        <span style={{ fontSize: 13, fontWeight: 600, color: checked ? "var(--navy)" : "var(--text-secondary)" }}>{label}</span>
      </div>
      <p style={{ fontSize: 11, color: "var(--text-muted)", margin: 0, paddingLeft: 22, lineHeight: 1.4 }}>{description}</p>
    </div>
  );
}
