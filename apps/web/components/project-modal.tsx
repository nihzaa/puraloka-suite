"use client";

import { useEffect, useState, useCallback, useReducer } from "react";
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
  tax_scheme: "pph_final" | "ppn";
  commission_pct: string;
  retention_pct: string;
  start_date: string;
  end_date: string;
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

const C = {
  navy: "#003366", navyLight: "#EBF2FF",
  text: "#111827", mid: "#6B7280", muted: "#9CA3AF",
  border: "#E5E7EB", bg: "#F8F9FA",
  green: "#15803d", greenBg: "#F0FDF4",
  red: "#B91C1C", redBg: "#FEF2F2",
};

const inputStyle: React.CSSProperties = {
  width: "100%", padding: "9px 12px",
  border: "1px solid #E5E7EB", borderRadius: 8,
  fontSize: 13, color: C.text, background: "#FFFFFF",
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
  termin_schedules: [{ label: "Termin 1", pct_of_contract: 100, target_date: "" }],
};

// ─── Main modal ───────────────────────────────────────────────────────────────

export function ProjectModal({ mode, initialData, projectId, onClose, onSuccess }: ProjectModalProps) {
  const [mounted, setMounted] = useReducer(() => true, false);
  useEffect(setMounted, [setMounted]);

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
        console.log("[modal] clients loaded:", clientsRes.data.clients?.length);
        console.log("[modal] PMs loaded:", pmsRes.data.users?.length);
        setClients(clientsRes.data.clients ?? []);
        setPms(pmsRes.data.users ?? []);
      } catch (err) {
        console.error("[modal] Failed to load dropdown data:", err);
      }
    }
    loadDropdownData();
  }, []);

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
        termin_schedules: form.contract_model === "termin"
          ? form.termin_schedules.map(t => ({
              label: t.label,
              pct_of_contract: Number(t.pct_of_contract),
              target_date: t.target_date || undefined,
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
    set("termin_schedules", [...form.termin_schedules, { label: `Termin ${n}`, pct_of_contract: 0, target_date: "" }]);
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
        background: "#FFFFFF", borderRadius: 16, width: "100%", maxWidth: 600,
        boxShadow: "0 24px 48px rgba(0,0,0,0.18)",
        maxHeight: "90vh", display: "flex", flexDirection: "column",
      }}>
        {/* ── Modal header ── */}
        <div style={{ padding: "24px 28px 0", flexShrink: 0 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
            <h2 style={{ fontFamily: "var(--font-display)", fontSize: 18, fontWeight: 700, color: C.text }}>
              {mode === "create" ? "Tambah Proyek Baru" : "Edit Proyek"}
            </h2>
            <button
              onClick={onClose}
              style={{ background: "none", border: "none", cursor: "pointer", color: C.muted, padding: 4, borderRadius: 6, display: "flex" }}
              onMouseEnter={e => { e.currentTarget.style.background = "#F3F4F6"; e.currentTarget.style.color = C.text; }}
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
                    background: step > s.n ? C.navy : step === s.n ? C.navy : "#F3F4F6",
                    color: step >= s.n ? "#FFFFFF" : C.muted,
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
                    background: step > s.n ? C.navy : "#E5E7EB",
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
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              <Field label="Nama Proyek *" error={errors.name}>
                <input style={inputStyle} value={form.name} onChange={e => set("name", e.target.value)} placeholder="Contoh: Renovasi Rumah Pak Budi" />
              </Field>
              <Field label="Lokasi *" error={errors.location}>
                <input style={inputStyle} value={form.location} onChange={e => set("location", e.target.value)} placeholder="Contoh: Bandung, Jawa Barat" />
              </Field>
              <Field label="Klien *" error={errors.client_id}>
                <select style={inputStyle} value={form.client_id} onChange={e => set("client_id", e.target.value)}>
                  <option value="">-- Pilih Klien --</option>
                  {clients.map(c => (
                    <option key={c.id} value={c.id}>
                      {c.contact_person}{c.company_name ? ` (${c.company_name})` : ""}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Project Manager *" error={errors.pm_id}>
                <select style={inputStyle} value={form.pm_id} onChange={e => set("pm_id", e.target.value)}>
                  <option value="">-- Pilih PM --</option>
                  {pms.map(u => (
                    <option key={u.id} value={u.id}>{u.name} ({u.email})</option>
                  ))}
                </select>
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
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
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

              <Field label="Tax Scheme">
                <div style={{ display: "flex", gap: 12 }}>
                  <RadioCard label="PPh Final (2%)" description="Untuk klien perorangan" checked={form.tax_scheme === "pph_final"} onClick={() => set("tax_scheme", "pph_final")} />
                  <RadioCard label="PPN (11%)" description="Untuk klien perusahaan (B2B)" checked={form.tax_scheme === "ppn"} onClick={() => set("tax_scheme", "ppn")} />
                </div>
              </Field>

              {form.contract_model === "komisi" && (
                <Field label="Persentase Komisi (%)*" error={errors.commission_pct}>
                  <input style={inputStyle} type="number" min="0" max="100" step="0.5" value={form.commission_pct} onChange={e => set("commission_pct", e.target.value)} placeholder="Contoh: 10" />
                </Field>
              )}

              <Field label="Retensi (%)" error={errors.retention_pct}>
                <input style={inputStyle} type="number" min="0" max="50" step="0.5" value={form.retention_pct} onChange={e => set("retention_pct", e.target.value)} placeholder="5" />
              </Field>

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
                padding: "10px 14px", borderRadius: 8,
                background: Math.abs(terminTotal - 100) < 0.01 ? "#F0FDF4" : "#FEF2F2",
                border: `1px solid ${Math.abs(terminTotal - 100) < 0.01 ? "#BBF7D0" : "#FECACA"}`,
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

              {form.termin_schedules.map((t, i) => (
                <div key={i} style={{ border: "1px solid #E5E7EB", borderRadius: 10, padding: "14px 16px", background: "#FAFAFA" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                    <span style={{ fontSize: 12, fontWeight: 600, color: C.navy }}>Termin {i + 1}</span>
                    {form.termin_schedules.length > 1 && (
                      <button
                        onClick={() => removeTermin(i)}
                        style={{ background: "none", border: "none", cursor: "pointer", color: C.muted, display: "flex", padding: 4, borderRadius: 4 }}
                        onMouseEnter={e => { e.currentTarget.style.color = C.red; e.currentTarget.style.background = "#FEF2F2"; }}
                        onMouseLeave={e => { e.currentTarget.style.color = C.muted; e.currentTarget.style.background = "none"; }}
                      >
                        <Trash2 size={14} />
                      </button>
                    )}
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 100px 1fr", gap: 10 }}>
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
                        style={{ ...inputStyle, background: "#F9FAFB", color: C.mid }}
                        disabled
                        value={`Rp ${Math.round(contractVal * (Number(t.pct_of_contract) / 100)).toLocaleString("id-ID")}`}
                      />
                    </Field>
                  </div>
                  <div style={{ marginTop: 10 }}>
                    <Field label="Target Tanggal">
                      <input style={inputStyle} type="date" value={t.target_date} onChange={e => updateTermin(i, "target_date", e.target.value)} />
                    </Field>
                  </div>
                </div>
              ))}

              <button
                onClick={addTermin}
                style={{
                  display: "flex", alignItems: "center", gap: 6,
                  padding: "9px 14px", borderRadius: 8,
                  border: "1px dashed #E5E7EB", background: "transparent",
                  fontSize: 13, color: C.mid, cursor: "pointer",
                  transition: "all 0.12s",
                }}
                onMouseEnter={e => { e.currentTarget.style.borderColor = C.navy; e.currentTarget.style.color = C.navy; e.currentTarget.style.background = C.navyLight; }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = "#E5E7EB"; e.currentTarget.style.color = C.mid; e.currentTarget.style.background = "transparent"; }}
              >
                <Plus size={14} /> Tambah Termin
              </button>
            </div>
          )}

          {submitError && (
            <div style={{ marginTop: 16, padding: "10px 14px", borderRadius: 8, background: "#FEF2F2", border: "1px solid #FECACA", fontSize: 13, color: C.red }}>
              {submitError}
            </div>
          )}
        </div>

        {/* ── Modal footer ── */}
        <div style={{
          padding: "20px 28px", borderTop: "1px solid #F3F4F6",
          display: "flex", justifyContent: "space-between", alignItems: "center",
          flexShrink: 0,
        }}>
          <button
            onClick={step === 1 ? onClose : handleBack}
            style={{
              display: "flex", alignItems: "center", gap: 5,
              padding: "9px 16px", borderRadius: 8,
              border: "1px solid #E5E7EB", background: "#FFFFFF",
              fontSize: 13, fontWeight: 500, color: C.mid, cursor: "pointer",
              transition: "all 0.12s",
            }}
            onMouseEnter={e => { e.currentTarget.style.background = "#F9FAFB"; e.currentTarget.style.color = C.text; }}
            onMouseLeave={e => { e.currentTarget.style.background = "#FFFFFF"; e.currentTarget.style.color = C.mid; }}
          >
            {step > 1 && <ChevronLeft size={14} />}
            {step === 1 ? "Batal" : "Kembali"}
          </button>

          <button
            onClick={isLastStep ? handleSubmit : handleNext}
            disabled={submitting}
            style={{
              display: "flex", alignItems: "center", gap: 5,
              padding: "9px 20px", borderRadius: 8, border: "none",
              background: submitting ? "#9CA3AF" : C.navy,
              color: "#FFFFFF", fontSize: 13, fontWeight: 600,
              cursor: submitting ? "not-allowed" : "pointer",
              transition: "background 0.15s",
            }}
            onMouseEnter={e => { if (!submitting) e.currentTarget.style.background = "#002244"; }}
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

function Field({ label, error, children }: { label: string; error?: string; children: React.ReactNode }) {
  return (
    <div>
      <label style={labelStyle}>{label}</label>
      {children}
      {error && <p style={{ fontSize: 11, color: "#B91C1C", marginTop: 4, marginBottom: 0 }}>{error}</p>}
    </div>
  );
}

// ─── Radio card ───────────────────────────────────────────────────────────────

function RadioCard({ label, description, checked, onClick }: {
  label: string; description: string; checked: boolean; onClick: () => void;
}) {
  return (
    <div
      onClick={onClick}
      style={{
        flex: 1, padding: "12px 14px", borderRadius: 10, cursor: "pointer",
        border: `2px solid ${checked ? "#003366" : "#E5E7EB"}`,
        background: checked ? "#EBF2FF" : "#FFFFFF",
        transition: "all 0.15s",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 3 }}>
        <div style={{
          width: 14, height: 14, borderRadius: "50%", flexShrink: 0,
          border: `2px solid ${checked ? "#003366" : "#D1D5DB"}`,
          display: "flex", alignItems: "center", justifyContent: "center",
        }}>
          {checked && <div style={{ width: 6, height: 6, borderRadius: "50%", background: "#003366" }} />}
        </div>
        <span style={{ fontSize: 13, fontWeight: 600, color: checked ? "#003366" : "#374151" }}>{label}</span>
      </div>
      <p style={{ fontSize: 11, color: "#9CA3AF", margin: 0, paddingLeft: 22, lineHeight: 1.4 }}>{description}</p>
    </div>
  );
}
