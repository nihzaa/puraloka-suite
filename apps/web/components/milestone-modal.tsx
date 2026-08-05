"use client";

import { useEffect, useState } from "react";
import { useTutupEsc } from "@/lib/use-tutup-esc";
import { createPortal } from "react-dom";
import { X, Flag, Check, Loader2 } from "lucide-react";
import { createMilestone, updateMilestone } from "@/lib/api";
import type { Milestone, CreateMilestonePayload } from "@/lib/api";

// ─── Props ────────────────────────────────────────────────────────────────────

export interface MilestoneModalProps {
  isOpen: boolean;
  onClose: () => void;
  projectId: string;
  milestone?: Milestone | null;
  onSuccess: (milestone: Milestone) => void;
}

// ─── Shared styles ────────────────────────────────────────────────────────────

const fieldLabel: React.CSSProperties = {
  display: "block",
  fontSize: 11,
  fontWeight: 600,
  color: "var(--text-muted)",
  textTransform: "uppercase",
  letterSpacing: "0.06em",
  marginBottom: 6,
};

const fieldInput: React.CSSProperties = {
  width: "100%",
  padding: "8px 12px",
  borderRadius: 10,
  border: "1px solid #e2e8f0",
  background: "var(--surface)",
  fontSize: 13,
  color: "var(--text-primary)",
  outline: "none",
  fontFamily: "inherit",
  boxSizing: "border-box",
  transition: "border-color 0.15s, box-shadow 0.15s",
};

// ─── Component ────────────────────────────────────────────────────────────────

export function MilestoneModal({
  isOpen,
  onClose,
  projectId,
  milestone,
  onSuccess,
}: MilestoneModalProps) {
  useTutupEsc(onClose);
  const isEdit = Boolean(milestone);

  const [title, setTitle]           = useState("");
  const [description, setDescription] = useState("");
  const [targetDate, setTargetDate] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError]           = useState<string | null>(null);
  const [mounted, setMounted]       = useState(false);

  useEffect(() => { setMounted(true); }, []);

  useEffect(() => {
    if (isOpen) {
      setTitle(milestone?.title ?? "");
      setDescription(milestone?.description ?? "");
      setTargetDate(milestone?.target_date?.split("T")[0] ?? "");
      setError(null);
    }
  }, [isOpen, milestone]);

  const handleClose = () => {
    if (!submitting) onClose();
  };

  const handleSubmit = async () => {
    setError(null);

    if (!title.trim()) {
      setError("Judul milestone wajib diisi.");
      return;
    }
    if (!targetDate) {
      setError("Tanggal target wajib diisi.");
      return;
    }

    setSubmitting(true);
    try {
      const payload: CreateMilestonePayload = {
        title:       title.trim(),
        description: description.trim() || undefined,
        target_date: targetDate,
      };

      let result: Milestone;
      if (isEdit && milestone) {
        const res = await updateMilestone(projectId, milestone.id, payload);
        result = res.data;
      } else {
        const res = await createMilestone(projectId, payload);
        result = res.data;
      }

      onSuccess(result);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Terjadi kesalahan.");
    } finally {
      setSubmitting(false);
    }
  };

  if (!isOpen || !mounted) return null;

  return createPortal(
    <div
      style={{
        position: "fixed", inset: 0, zIndex: 1000,
        display: "flex", alignItems: "center", justifyContent: "center",
        padding: "16px",
      }}
      onClick={e => { if (e.target === e.currentTarget) handleClose(); }}
    >
      {/* Backdrop */}
      <div
        style={{
          position: "absolute", inset: 0,
          background: "rgba(15,23,42,0.55)",
          backdropFilter: "blur(6px)",
          WebkitBackdropFilter: "blur(6px)",
        }}
        onClick={handleClose}
      />

      {/* Panel */}
      <div style={{
        position: "relative",
        width: "100%",
        maxWidth: "460px",
        background: "var(--surface)",
        borderRadius: 20,
        boxShadow: "var(--naik-3)",
        overflow: "hidden",
      }}>
        {/* Accent bar */}
        <div style={{ height: 4, background: "linear-gradient(90deg, var(--navy), var(--aksen-terang))" }} />

        {/* Header */}
        <div style={{
          display: "flex", alignItems: "flex-start", justifyContent: "space-between",
          padding: "20px 24px 16px",
          borderBottom: "1px solid #f1f5f9",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{
              width: 40, height: 40, borderRadius: 10,
              background: "linear-gradient(135deg, var(--navy), var(--aksen-terang))",
              display: "flex", alignItems: "center", justifyContent: "center",
              flexShrink: 0,
            }}>
              <Flag size={18} color="white" />
            </div>
            <div>
              <h2 style={{ fontSize: 15, fontWeight: 600, color: "var(--text-primary)", fontFamily: "var(--font-display)", margin: 0 }}>
                {isEdit ? "Edit Milestone" : "Tambah Milestone"}
              </h2>
              <p style={{ fontSize: 12, color: "var(--text-muted)", margin: "2px 0 0" }}>
                {isEdit ? "Perbarui detail milestone" : "Tetapkan target pencapaian proyek"}
              </p>
            </div>
          </div>
          <button aria-label="Tutup dialog milestone"
            onClick={handleClose}
            disabled={submitting}
            style={{
              width: 32, height: 32, borderRadius: 6, border: "none",
              background: "var(--surface-subtle)", cursor: "pointer",
              display: "flex", alignItems: "center", justifyContent: "center",
              color: "var(--text-muted)", flexShrink: 0,
            }}
          >
            <X size={15} />
          </button>
        </div>

        {/* Body */}
        <div style={{ padding: "20px 24px", display: "flex", flexDirection: "column", gap: 16 }}>
          {/* Error */}
          {error && (
            <div style={{
              padding: "8px 12px", borderRadius: 10,
              background: "var(--danger-bg)", border: "1px solid var(--danger-border)", color: "var(--danger)", fontSize: 13,
            }}>
              {error}
            </div>
          )}

          {/* Title */}
          <div>
            <label htmlFor="title" style={fieldLabel}>Judul Milestone *</label>
            <input id="title"
              type="text"
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder="cth: Pondasi selesai, Atap terpasang…"
              style={fieldInput}
              onFocus={e => { e.target.style.borderColor = "var(--navy)"; e.target.style.boxShadow = "0 0 0 3px rgba(0,51,102,0.1)"; }}
              onBlur={e => { e.target.style.borderColor = "var(--border)"; e.target.style.boxShadow = "none"; }}
              disabled={submitting}
              autoFocus
            />
          </div>

          {/* Target date */}
          <div>
            <label htmlFor="target-date" style={fieldLabel}>Tanggal Target *</label>
            <input id="target-date"
              type="date"
              value={targetDate}
              onChange={e => setTargetDate(e.target.value)}
              style={fieldInput}
              onFocus={e => { e.target.style.borderColor = "var(--navy)"; e.target.style.boxShadow = "0 0 0 3px rgba(0,51,102,0.1)"; }}
              onBlur={e => { e.target.style.borderColor = "var(--border)"; e.target.style.boxShadow = "none"; }}
              disabled={submitting}
            />
          </div>

          {/* Description */}
          <div>
            <label htmlFor="description" style={fieldLabel}>Deskripsi</label>
            <textarea id="description"
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="Keterangan atau kriteria selesai…"
              rows={3}
              style={{ ...fieldInput, resize: "vertical", lineHeight: 1.6, minHeight: 80 }}
              onFocus={e => { e.target.style.borderColor = "var(--navy)"; e.target.style.boxShadow = "0 0 0 3px rgba(0,51,102,0.1)"; }}
              onBlur={e => { e.target.style.borderColor = "var(--border)"; e.target.style.boxShadow = "none"; }}
              disabled={submitting}
            />
          </div>
        </div>

        {/* Footer */}
        <div style={{
          padding: "12px 24px", borderTop: "1px solid #f1f5f9", background: "var(--surface-subtle)",
          display: "flex", justifyContent: "flex-end", gap: 8,
        }}>
          <button
            type="button"
            onClick={handleClose}
            disabled={submitting}
            style={{
              padding: "8px 16px", borderRadius: 10, border: "1px solid #e2e8f0",
              background: "white", fontSize: 13, fontWeight: 500, color: "var(--text-secondary)", cursor: "pointer",
            }}
          >
            Batal
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={submitting || !title.trim() || !targetDate}
            style={{
              padding: "8px 20px", borderRadius: 10, border: "none", fontSize: 13, fontWeight: 600,
              background: submitting || !title.trim() || !targetDate ? "var(--text-muted)" : "var(--navy)",
              color: "white",
              cursor: submitting || !title.trim() || !targetDate ? "not-allowed" : "pointer",
              display: "flex", alignItems: "center", gap: 6,
              minWidth: 120, justifyContent: "center",
              transition: "background 0.15s",
            }}
            onMouseEnter={e => { if (!submitting && title.trim() && targetDate) e.currentTarget.style.background = "var(--aksen-pekat)"; }}
            onMouseLeave={e => { if (!submitting && title.trim() && targetDate) e.currentTarget.style.background = "var(--navy)"; }}
          >
            {submitting
              ? <><Loader2 size={13} style={{ animation: "spin 1s linear infinite" }} /> Menyimpan…</>
              : <><Check size={13} /> {isEdit ? "Simpan Perubahan" : "Tambah Milestone"}</>
            }
          </button>
        </div>
      </div>

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>,
    document.body
  );
}
