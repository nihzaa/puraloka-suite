"use client";

import { useState } from "react";
import { createPortal } from "react-dom";
import { FileText, X, Download, Loader } from "lucide-react";
import { generateContract } from "@/lib/api";

// ─── Design tokens ─────────────────────────────────────────────────────────────

const C = {
  navy: "var(--navy)",
  navyLight: "var(--navy-light)",
  text: "var(--text-primary)",
  mid: "var(--text-secondary)",
  muted: "var(--text-muted)",
  border: "var(--border)",
  bg: "var(--bg)",
  red: "var(--danger)",
  redBg: "var(--danger-bg)",
};

// ─── Form field components ─────────────────────────────────────────────────────

function Field({
  label, required, children,
}: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <label style={{ fontSize: 12, fontWeight: 600, color: C.mid }}>
        {label}{required && <span style={{ color: C.red }}> *</span>}
      </label>
      {children}
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  padding: "8px 11px",
  fontSize: 13,
  border: `1px solid ${C.border}`,
  borderRadius: 8,
  color: C.text,
  background: "var(--surface)",
  outline: "none",
  width: "100%",
  boxSizing: "border-box",
};

// ─── Main component ────────────────────────────────────────────────────────────

interface Props {
  projectId: string;
  projectName: string;
  onClose: () => void;
}

export function ContractGeneratorModal({ projectId, projectName, onClose }: Props) {
  const today = new Date().toISOString().split("T")[0];

  const [form, setForm] = useState({
    contract_date: today,
    duration_days: "120",
    pelaksana_nama: "",
    pelaksana_nik: "",
    pelaksana_alamat: "",
    pelaksana_telepon: "",
    rekening_bank: "",
    rekening_nomor: "",
    saksi_1: "",
    saksi_2: "",
  });

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function set(key: keyof typeof form, val: string) {
    setForm(f => ({ ...f, [key]: val }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!form.pelaksana_nama.trim()) {
      setError("Nama Pelaksana wajib diisi.");
      return;
    }
    if (!form.contract_date) {
      setError("Tanggal Kontrak wajib diisi.");
      return;
    }

    setLoading(true);
    try {
      const params: Record<string, string | number> = {
        contract_date: form.contract_date,
        duration_days: parseInt(form.duration_days, 10) || 120,
        pelaksana_nama: form.pelaksana_nama,
        pelaksana_alamat: form.pelaksana_alamat,
        pelaksana_telepon: form.pelaksana_telepon,
        rekening_bank: form.rekening_bank,
        rekening_nomor: form.rekening_nomor,
      };
      if (form.pelaksana_nik) params.pelaksana_nik = form.pelaksana_nik;
      if (form.saksi_1) params.saksi_1 = form.saksi_1;
      if (form.saksi_2) params.saksi_2 = form.saksi_2;

      const blob = await generateContract(projectId, params);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      const slug = projectName.replace(/[^a-zA-Z0-9]+/g, "_");
      a.href = url;
      a.download = `Kontrak_${slug}_${form.contract_date}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      onClose();
    } catch {
      setError("Gagal generate PDF. Periksa koneksi dan coba lagi.");
    } finally {
      setLoading(false);
    }
  }

  const modal = (
    <div
      style={{
        position: "fixed", inset: 0, zIndex: 9999,
        display: "flex", alignItems: "center", justifyContent: "center",
        background: "rgba(0,0,0,0.4)", backdropFilter: "blur(2px)",
        padding: 16,
      }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div style={{
        background: "var(--surface)",
        borderRadius: 16,
        width: "100%",
        maxWidth: 560,
        maxHeight: "90vh",
        display: "flex",
        flexDirection: "column",
        boxShadow: "0 20px 60px rgba(0,0,0,0.18)",
        overflow: "hidden",
      }}>
        {/* Header */}
        <div style={{
          padding: "18px 24px 16px",
          borderBottom: `1px solid ${C.border}`,
          display: "flex", alignItems: "center", gap: 12,
          flexShrink: 0,
        }}>
          <div style={{
            width: 36, height: 36, borderRadius: 10, flexShrink: 0,
            background: "linear-gradient(135deg, #003366, #0066CC)",
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>
            <FileText size={18} color="var(--surface)" />
          </div>
          <div style={{ flex: 1 }}>
            <h2 style={{ fontSize: 15, fontWeight: 700, color: C.text, margin: 0 }}>
              Generate Kontrak PDF
            </h2>
            <p style={{ fontSize: 12, color: C.muted, margin: 0 }}>{projectName}</p>
          </div>
          <button aria-label="Tutup dialog kontrak"
            onClick={onClose}
            style={{ background: "none", border: "none", cursor: "pointer", padding: 4, color: C.muted, borderRadius: 6 }}
          >
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <form
          onSubmit={handleSubmit}
          style={{ padding: "20px 24px", overflowY: "auto", display: "flex", flexDirection: "column", gap: 14 }}
        >
          {error && (
            <div style={{ padding: "10px 14px", borderRadius: 8, background: C.redBg, border: "1px solid #FECACA", fontSize: 13, color: C.red }}>
              {error}
            </div>
          )}

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <Field label="Tanggal Kontrak" required>
              <input type="date" value={form.contract_date} onChange={e => set("contract_date", e.target.value)}
                style={inputStyle} required />
            </Field>
            <Field label="Jangka Waktu (hari kalender)" required>
              <input type="number" min={1} value={form.duration_days} onChange={e => set("duration_days", e.target.value)}
                style={inputStyle} placeholder="120" required />
            </Field>
          </div>

          <div style={{ borderTop: `1px solid ${C.border}`, paddingTop: 12 }}>
            <p style={{ fontSize: 11, fontWeight: 700, color: C.muted, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 10 }}>
              Data Pelaksana (Pihak Kedua)
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <Field label="Nama Pelaksana" required>
                  <input type="text" value={form.pelaksana_nama} onChange={e => set("pelaksana_nama", e.target.value)}
                    style={inputStyle} placeholder="Agus Hernawan" required />
                </Field>
                <Field label="NIK Pelaksana">
                  <input type="text" value={form.pelaksana_nik} onChange={e => set("pelaksana_nik", e.target.value)}
                    style={inputStyle} placeholder="3273xxxxxxxxxxxx" />
                </Field>
              </div>
              <Field label="Alamat Pelaksana">
                <textarea
                  value={form.pelaksana_alamat}
                  onChange={e => set("pelaksana_alamat", e.target.value)}
                  rows={2}
                  style={{ ...inputStyle, resize: "vertical" }}
                  placeholder="Jl. Contoh No. 1, Bandung"
                />
              </Field>
              <Field label="Telepon Pelaksana">
                <input type="text" value={form.pelaksana_telepon} onChange={e => set("pelaksana_telepon", e.target.value)}
                  style={inputStyle} placeholder="08xxxxxxxxxx" />
              </Field>
            </div>
          </div>

          <div style={{ borderTop: `1px solid ${C.border}`, paddingTop: 12 }}>
            <p style={{ fontSize: 11, fontWeight: 700, color: C.muted, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 10 }}>
              Rekening Pembayaran
            </p>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <Field label="Bank & Nama Rekening">
                <input type="text" value={form.rekening_bank} onChange={e => set("rekening_bank", e.target.value)}
                  style={inputStyle} placeholder="BCA a.n. Agus Hernawan" />
              </Field>
              <Field label="Nomor Rekening">
                <input type="text" value={form.rekening_nomor} onChange={e => set("rekening_nomor", e.target.value)}
                  style={inputStyle} placeholder="1234567890" />
              </Field>
            </div>
          </div>

          <div style={{ borderTop: `1px solid ${C.border}`, paddingTop: 12 }}>
            <p style={{ fontSize: 11, fontWeight: 700, color: C.muted, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 10 }}>
              Saksi (Opsional)
            </p>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <Field label="Saksi 1">
                <input type="text" value={form.saksi_1} onChange={e => set("saksi_1", e.target.value)}
                  style={inputStyle} placeholder="Nama Saksi 1" />
              </Field>
              <Field label="Saksi 2">
                <input type="text" value={form.saksi_2} onChange={e => set("saksi_2", e.target.value)}
                  style={inputStyle} placeholder="Nama Saksi 2" />
              </Field>
            </div>
          </div>
        </form>

        {/* Footer */}
        <div style={{
          padding: "14px 24px",
          borderTop: `1px solid ${C.border}`,
          display: "flex", justifyContent: "flex-end", gap: 10,
          flexShrink: 0, background: C.bg,
        }}>
          <button
            onClick={onClose}
            disabled={loading}
            style={{
              padding: "8px 18px", borderRadius: 8, fontSize: 13, fontWeight: 600,
              background: "transparent", color: C.mid,
              border: `1px solid ${C.border}`, cursor: "pointer",
              opacity: loading ? 0.6 : 1,
            }}
          >
            Batal
          </button>
          <button
            onClick={handleSubmit as unknown as React.MouseEventHandler}
            disabled={loading}
            style={{
              padding: "8px 18px", borderRadius: 8, fontSize: 13, fontWeight: 600,
              background: loading ? C.muted : C.navy, color: "var(--surface)",
              border: "none", cursor: loading ? "not-allowed" : "pointer",
              display: "flex", alignItems: "center", gap: 6,
            }}
          >
            {loading ? <><Loader size={14} style={{ animation: "spin 1s linear infinite" }} /> Generating...</> : <><Download size={14} /> Generate &amp; Download PDF</>}
          </button>
        </div>
      </div>
    </div>
  );

  return createPortal(modal, document.body);
}
