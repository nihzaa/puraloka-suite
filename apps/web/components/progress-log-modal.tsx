"use client";

import { useCallback, useRef, useState } from "react";
import { X, Upload, Trash2, Loader2 } from "lucide-react";
import { createProgressLog } from "@/lib/api";
import { uploadProgressPhoto } from "@/lib/storage";

// ─── Types ────────────────────────────────────────────────────────────────────

interface WorkScope {
  id: string;
  scope_name: string;
}

export interface ProgressLogModalProps {
  isOpen: boolean;
  onClose: () => void;
  projectId: string;
  workScopes?: WorkScope[];
  onSuccess: (log: unknown) => void;
}

interface PhotoEntry {
  id: string;
  file: File;
  previewUrl: string;
  caption: string;
  uploading: boolean;
  uploadedUrl: string | null;
  error: string | null;
}

// ─── Design tokens (matching page.tsx) ───────────────────────────────────────

const C = {
  navy: "#003366",
  navyLight: "#EBF2FF",
  text: "#111827",
  mid: "#6B7280",
  muted: "#9CA3AF",
  border: "#E5E7EB",
  bg: "#F8F9FA",
  red: "#B91C1C",
  redBg: "#FEF2F2",
};

const WEATHER_OPTIONS = [
  { value: "cerah", label: "☀️ Cerah" },
  { value: "berawan", label: "⛅ Berawan" },
  { value: "hujan_ringan", label: "🌧️ Hujan Ringan" },
  { value: "hujan_lebat", label: "⛈️ Hujan Lebat" },
];

const todayISO = () => new Date().toISOString().split("T")[0];

// ─── Component ────────────────────────────────────────────────────────────────

export function ProgressLogModal({
  isOpen,
  onClose,
  projectId,
  workScopes = [],
  onSuccess,
}: ProgressLogModalProps) {
  const [pctOverall, setPctOverall] = useState<string>("");
  const [weather, setWeather] = useState<string>("");
  const [workerCount, setWorkerCount] = useState<string>("");
  const [notes, setNotes] = useState<string>("");
  const [loggedAt, setLoggedAt] = useState<string>(todayISO());
  const [workScopeId, setWorkScopeId] = useState<string>("");
  const [photos, setPhotos] = useState<PhotoEntry[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const reset = () => {
    setPctOverall("");
    setWeather("");
    setWorkerCount("");
    setNotes("");
    setLoggedAt(todayISO());
    setWorkScopeId("");
    setPhotos([]);
    setSubmitting(false);
    setError(null);
    setDragOver(false);
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const addFiles = useCallback((files: FileList | File[]) => {
    const arr = Array.from(files);
    setPhotos(prev => {
      const remaining = 5 - prev.length;
      if (remaining <= 0) return prev;
      const toAdd = arr.slice(0, remaining).filter(f => {
        if (!f.type.startsWith("image/")) return false;
        if (f.size > 10 * 1024 * 1024) return false;
        return true;
      });
      const entries: PhotoEntry[] = toAdd.map(f => ({
        id: `${Date.now()}-${Math.random()}`,
        file: f,
        previewUrl: URL.createObjectURL(f),
        caption: "",
        uploading: false,
        uploadedUrl: null,
        error: null,
      }));
      return [...prev, ...entries];
    });
  }, []);

  const removePhoto = (id: string) => {
    setPhotos(prev => {
      const entry = prev.find(p => p.id === id);
      if (entry) URL.revokeObjectURL(entry.previewUrl);
      return prev.filter(p => p.id !== id);
    });
  };

  const updateCaption = (id: string, caption: string) => {
    setPhotos(prev => prev.map(p => p.id === id ? { ...p, caption } : p));
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    if (e.dataTransfer.files.length > 0) addFiles(e.dataTransfer.files);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const pct = parseFloat(pctOverall);
    if (isNaN(pct) || pct < 0 || pct > 100) {
      setError("Progress harus antara 0 dan 100");
      return;
    }

    setSubmitting(true);

    try {
      // Upload semua foto satu per satu
      const uploadedPhotos: Array<{ url: string; caption?: string }> = [];

      for (let i = 0; i < photos.length; i++) {
        const entry = photos[i];
        setPhotos(prev => prev.map(p => p.id === entry.id ? { ...p, uploading: true, error: null } : p));
        try {
          const url = await uploadProgressPhoto(projectId, entry.file);
          setPhotos(prev => prev.map(p => p.id === entry.id ? { ...p, uploading: false, uploadedUrl: url } : p));
          uploadedPhotos.push({
            url,
            caption: entry.caption.trim() || undefined,
          });
        } catch (uploadErr) {
          const msg = uploadErr instanceof Error ? uploadErr.message : "Upload gagal";
          setPhotos(prev => prev.map(p => p.id === entry.id ? { ...p, uploading: false, error: msg } : p));
          setError(`Gagal upload foto: ${msg}`);
          setSubmitting(false);
          return;
        }
      }

      const result = await createProgressLog(projectId, {
        pct_overall: pct,
        weather: weather || undefined,
        worker_count: workerCount ? parseInt(workerCount, 10) : undefined,
        notes: notes.trim() || undefined,
        logged_at: loggedAt ? new Date(loggedAt + "T08:00:00").toISOString() : undefined,
        photos: uploadedPhotos.length > 0 ? uploadedPhotos : undefined,
      });

      onSuccess(result.data);
      handleClose();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Terjadi kesalahan";
      setError(msg);
      setSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div
      style={{
        position: "fixed", inset: 0, zIndex: 1000,
        background: "rgba(0,0,0,0.45)", backdropFilter: "blur(4px)",
        display: "flex", alignItems: "center", justifyContent: "center",
        padding: 16, overflowY: "auto",
      }}
      onClick={e => { if (e.target === e.currentTarget) handleClose(); }}
    >
      <div style={{
        background: "#FFFFFF", borderRadius: 16, width: "100%", maxWidth: 600,
        boxShadow: "0 24px 48px rgba(0,0,0,0.18)", overflow: "hidden",
        display: "flex", flexDirection: "column", maxHeight: "90vh",
      }}>
        {/* Header */}
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "20px 24px", borderBottom: `1px solid ${C.border}`,
          flexShrink: 0,
        }}>
          <h2 style={{
            fontFamily: "var(--font-display)", fontSize: 17, fontWeight: 700,
            color: C.text, margin: 0,
          }}>
            Log Progress Lapangan
          </h2>
          <button
            onClick={handleClose}
            style={{
              width: 32, height: 32, borderRadius: "50%", border: "none",
              background: "#F3F4F6", cursor: "pointer", display: "flex",
              alignItems: "center", justifyContent: "center", color: C.mid,
            }}
          >
            <X size={16} />
          </button>
        </div>

        {/* Body */}
        <form onSubmit={handleSubmit} style={{ overflowY: "auto", flex: 1 }}>
          <div style={{ padding: "20px 24px", display: "flex", flexDirection: "column", gap: 16 }}>

            {error && (
              <div style={{
                padding: "10px 14px", borderRadius: 10, background: C.redBg,
                border: `1px solid #FECACA`, color: C.red, fontSize: 13,
              }}>
                {error}
              </div>
            )}

            {/* Row 1: Tanggal + Cuaca */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <div>
                <label style={labelStyle}>Tanggal *</label>
                <input
                  type="date"
                  value={loggedAt}
                  max={todayISO()}
                  onChange={e => setLoggedAt(e.target.value)}
                  required
                  style={inputStyle}
                />
              </div>
              <div>
                <label style={labelStyle}>Cuaca</label>
                <select
                  value={weather}
                  onChange={e => setWeather(e.target.value)}
                  style={inputStyle}
                >
                  <option value="">-- Pilih cuaca --</option>
                  {WEATHER_OPTIONS.map(w => (
                    <option key={w.value} value={w.value}>{w.label}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Row 2: Progress % + Jumlah Pekerja */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <div>
                <label style={labelStyle}>Progress Keseluruhan * <span style={{ color: C.muted, fontWeight: 400 }}>(0–100)</span></label>
                <div style={{ position: "relative" }}>
                  <input
                    type="number"
                    value={pctOverall}
                    onChange={e => setPctOverall(e.target.value)}
                    min={0}
                    max={100}
                    step={0.01}
                    placeholder="0"
                    required
                    style={{ ...inputStyle, paddingRight: 36 }}
                  />
                  <span style={{
                    position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)",
                    fontSize: 13, color: C.muted, pointerEvents: "none",
                  }}>%</span>
                </div>
              </div>
              <div>
                <label style={labelStyle}>Jumlah Pekerja</label>
                <input
                  type="number"
                  value={workerCount}
                  onChange={e => setWorkerCount(e.target.value)}
                  min={0}
                  placeholder="0"
                  style={inputStyle}
                />
              </div>
            </div>

            {/* Scope pekerjaan (hanya jika ada workScopes) */}
            {workScopes.length > 0 && (
              <div>
                <label style={labelStyle}>Scope Pekerjaan</label>
                <select
                  value={workScopeId}
                  onChange={e => setWorkScopeId(e.target.value)}
                  style={inputStyle}
                >
                  <option value="">-- Semua scope --</option>
                  {workScopes.map(ws => (
                    <option key={ws.id} value={ws.id}>{ws.scope_name}</option>
                  ))}
                </select>
              </div>
            )}

            {/* Upload Foto */}
            <div>
              <label style={labelStyle}>Foto Lapangan <span style={{ color: C.muted, fontWeight: 400 }}>maks 5 foto, 10MB/foto</span></label>

              {photos.length < 5 && (
                <div
                  onDragOver={e => { e.preventDefault(); setDragOver(true); }}
                  onDragLeave={() => setDragOver(false)}
                  onDrop={handleDrop}
                  onClick={() => fileInputRef.current?.click()}
                  style={{
                    border: `2px dashed ${dragOver ? C.navy : C.border}`,
                    borderRadius: 12, padding: "24px 16px",
                    display: "flex", flexDirection: "column", alignItems: "center", gap: 8,
                    cursor: "pointer", transition: "all 0.15s",
                    background: dragOver ? C.navyLight : "#FAFAFA",
                    marginBottom: photos.length > 0 ? 12 : 0,
                  }}
                >
                  <div style={{
                    width: 40, height: 40, borderRadius: "50%",
                    background: C.navyLight, display: "flex", alignItems: "center",
                    justifyContent: "center", color: C.navy,
                  }}>
                    <Upload size={18} />
                  </div>
                  <p style={{ fontSize: 13, color: C.mid, margin: 0, textAlign: "center" }}>
                    <strong style={{ color: C.navy }}>Klik untuk upload</strong> atau drag &amp; drop foto
                  </p>
                  <p style={{ fontSize: 11, color: C.muted, margin: 0 }}>JPG, PNG, WEBP — maks 10MB per foto</p>
                </div>
              )}

              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                multiple
                style={{ display: "none" }}
                onChange={e => { if (e.target.files) { addFiles(e.target.files); e.target.value = ""; } }}
              />

              {/* Photo previews */}
              {photos.length > 0 && (
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {photos.map(entry => (
                    <div key={entry.id} style={{
                      display: "flex", gap: 12, padding: 12,
                      border: `1px solid ${entry.error ? "#FECACA" : C.border}`,
                      borderRadius: 12, background: entry.error ? C.redBg : "#FAFAFA",
                      alignItems: "flex-start",
                    }}>
                      {/* Thumbnail */}
                      <div style={{
                        width: 64, height: 64, borderRadius: 8, overflow: "hidden",
                        flexShrink: 0, background: "#F3F4F6", position: "relative",
                      }}>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={entry.previewUrl}
                          alt="preview"
                          style={{ width: "100%", height: "100%", objectFit: "cover" }}
                        />
                        {entry.uploading && (
                          <div style={{
                            position: "absolute", inset: 0, background: "rgba(0,0,0,0.4)",
                            display: "flex", alignItems: "center", justifyContent: "center",
                          }}>
                            <Loader2 size={20} style={{ color: "#FFFFFF", animation: "spin 1s linear infinite" }} />
                          </div>
                        )}
                      </div>

                      {/* Caption input */}
                      <div style={{ flex: 1 }}>
                        <p style={{ fontSize: 11, color: C.muted, margin: "0 0 4px" }}>
                          {entry.file.name} ({(entry.file.size / 1024 / 1024).toFixed(1)} MB)
                        </p>
                        <input
                          type="text"
                          placeholder="Caption (opsional)"
                          value={entry.caption}
                          onChange={e => updateCaption(entry.id, e.target.value)}
                          style={{ ...inputStyle, fontSize: 12, padding: "6px 10px" }}
                        />
                        {entry.error && (
                          <p style={{ fontSize: 11, color: C.red, margin: "4px 0 0" }}>{entry.error}</p>
                        )}
                        {entry.uploadedUrl && (
                          <p style={{ fontSize: 11, color: "#15803d", margin: "4px 0 0" }}>✓ Terupload</p>
                        )}
                      </div>

                      {/* Remove button */}
                      <button
                        type="button"
                        onClick={() => removePhoto(entry.id)}
                        disabled={entry.uploading}
                        style={{
                          width: 28, height: 28, borderRadius: 8, border: "none",
                          background: "#FEF2F2", cursor: entry.uploading ? "not-allowed" : "pointer",
                          display: "flex", alignItems: "center", justifyContent: "center",
                          color: C.red, flexShrink: 0,
                        }}
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Catatan */}
            <div>
              <label style={labelStyle}>Catatan</label>
              <textarea
                value={notes}
                onChange={e => setNotes(e.target.value)}
                placeholder="Deskripsi kegiatan, kendala, atau catatan lainnya..."
                rows={3}
                style={{ ...inputStyle, resize: "vertical", minHeight: 80 }}
              />
            </div>

          </div>

          {/* Footer */}
          <div style={{
            display: "flex", justifyContent: "flex-end", gap: 10,
            padding: "16px 24px", borderTop: `1px solid ${C.border}`,
            flexShrink: 0, background: "#FAFAFA",
          }}>
            <button
              type="button"
              onClick={handleClose}
              disabled={submitting}
              style={{
                padding: "9px 18px", borderRadius: 10, border: `1px solid ${C.border}`,
                background: "#FFFFFF", fontSize: 13, fontWeight: 500,
                color: C.mid, cursor: "pointer",
              }}
            >
              Batal
            </button>
            <button
              type="submit"
              disabled={submitting}
              style={{
                padding: "9px 20px", borderRadius: 10, border: "none",
                background: submitting ? "#6B7280" : C.navy, color: "#FFFFFF",
                fontSize: 13, fontWeight: 600,
                cursor: submitting ? "not-allowed" : "pointer",
                display: "flex", alignItems: "center", gap: 8, transition: "background 0.15s",
              }}
            >
              {submitting && <Loader2 size={14} style={{ animation: "spin 1s linear infinite" }} />}
              {submitting ? "Menyimpan..." : "Simpan Log"}
            </button>
          </div>
        </form>
      </div>

      <style>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        input[type=number]::-webkit-inner-spin-button,
        input[type=number]::-webkit-outer-spin-button { -webkit-appearance: none; }
        input[type=number] { -moz-appearance: textfield; }
      `}</style>
    </div>
  );
}

// ─── Shared input styles ──────────────────────────────────────────────────────

const labelStyle: React.CSSProperties = {
  display: "block", fontSize: 12, fontWeight: 600,
  color: "#374151", marginBottom: 6,
};

const inputStyle: React.CSSProperties = {
  width: "100%", padding: "9px 12px", borderRadius: 10,
  border: "1px solid #E5E7EB", background: "#FFFFFF",
  fontSize: 13, color: "#111827", outline: "none",
  fontFamily: "inherit", boxSizing: "border-box",
};

