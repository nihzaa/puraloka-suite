"use client";

import { useCallback, useRef, useState } from "react";
import { X, Upload, Trash2, Loader2, Camera } from "lucide-react";
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

// ─── Constants ────────────────────────────────────────────────────────────────

const NAVY = "#003366";
const NAVY_LIGHT = "#EBF2FF";
const BORDER = "#E5E7EB";
const TEXT = "#111827";
const MID = "#6B7280";
const MUTED = "#9CA3AF";
const RED = "#B91C1C";

const WEATHER_OPTIONS = [
  { value: "cerah",        label: "☀️  Cerah" },
  { value: "berawan",      label: "⛅  Berawan" },
  { value: "hujan_ringan", label: "🌧️  Hujan Ringan" },
  { value: "hujan_lebat",  label: "⛈️  Hujan Lebat" },
];

const todayISO = () => new Date().toISOString().split("T")[0];

// ─── Shared styles ────────────────────────────────────────────────────────────

const label: React.CSSProperties = {
  display: "block",
  fontSize: 11,
  fontWeight: 600,
  color: MID,
  textTransform: "uppercase",
  letterSpacing: "0.06em",
  marginBottom: 6,
};

const input: React.CSSProperties = {
  width: "100%",
  padding: "10px 12px",
  borderRadius: 10,
  border: `1px solid ${BORDER}`,
  background: "#FFFFFF",
  fontSize: 13,
  color: TEXT,
  outline: "none",
  fontFamily: "inherit",
  boxSizing: "border-box",
  transition: "border-color 0.15s",
};

// ─── Component ────────────────────────────────────────────────────────────────

export function ProgressLogModal({
  isOpen,
  onClose,
  projectId,
  workScopes = [],
  onSuccess,
}: ProgressLogModalProps) {
  const [pctOverall, setPctOverall] = useState("");
  const [weather, setWeather]       = useState("");
  const [workerCount, setWorkerCount] = useState("");
  const [notes, setNotes]           = useState("");
  const [loggedAt, setLoggedAt]     = useState(todayISO());
  const [workScopeId, setWorkScopeId] = useState("");
  const [photos, setPhotos]         = useState<PhotoEntry[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError]   = useState<string | null>(null);
  const [dragOver, setDragOver]     = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // ── Reset ──────────────────────────────────────────────────────────────────

  const reset = () => {
    photos.forEach(p => URL.revokeObjectURL(p.previewUrl));
    setPctOverall(""); setWeather(""); setWorkerCount("");
    setNotes(""); setLoggedAt(todayISO()); setWorkScopeId("");
    setPhotos([]); setSubmitting(false); setFormError(null); setDragOver(false);
  };

  const handleClose = () => { reset(); onClose(); };

  // ── Photos ─────────────────────────────────────────────────────────────────

  const addFiles = useCallback((files: FileList | File[]) => {
    const arr = Array.from(files);
    setPhotos(prev => {
      const slots = 5 - prev.length;
      if (slots <= 0) return prev;
      const valid = arr.slice(0, slots).filter(
        f => f.type.startsWith("image/") && f.size <= 10 * 1024 * 1024
      );
      return [
        ...prev,
        ...valid.map(f => ({
          id: `${Date.now()}-${Math.random()}`,
          file: f,
          previewUrl: URL.createObjectURL(f),
          caption: "",
          uploading: false,
          uploadedUrl: null,
          error: null,
        })),
      ];
    });
  }, []);

  const removePhoto = (id: string) =>
    setPhotos(prev => {
      const e = prev.find(p => p.id === id);
      if (e) URL.revokeObjectURL(e.previewUrl);
      return prev.filter(p => p.id !== id);
    });

  const patchPhoto = (id: string, patch: Partial<PhotoEntry>) =>
    setPhotos(prev => prev.map(p => (p.id === id ? { ...p, ...patch } : p)));

  // ── Submit ─────────────────────────────────────────────────────────────────

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    const pct = parseFloat(pctOverall);
    if (isNaN(pct) || pct < 0 || pct > 100) {
      setFormError("Progress harus antara 0 dan 100.");
      return;
    }

    setSubmitting(true);

    try {
      const uploaded: Array<{ url: string; caption?: string }> = [];

      for (const entry of photos) {
        patchPhoto(entry.id, { uploading: true, error: null });
        try {
          const url = await uploadProgressPhoto(projectId, entry.file);
          patchPhoto(entry.id, { uploading: false, uploadedUrl: url });
          uploaded.push({ url, caption: entry.caption.trim() || undefined });
        } catch (err) {
          const msg = err instanceof Error ? err.message : "Upload gagal";
          patchPhoto(entry.id, { uploading: false, error: msg });
          setFormError(`Gagal upload foto "${entry.file.name}": ${msg}`);
          setSubmitting(false);
          return;
        }
      }

      const result = await createProgressLog(projectId, {
        pct_overall: pct,
        weather:      weather || undefined,
        worker_count: workerCount ? parseInt(workerCount, 10) : undefined,
        notes:        notes.trim() || undefined,
        logged_at:    loggedAt
          ? new Date(loggedAt + "T08:00:00").toISOString()
          : undefined,
        photos: uploaded.length > 0 ? uploaded : undefined,
      });

      onSuccess(result.data);
      handleClose();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Terjadi kesalahan.");
      setSubmitting(false);
    }
  };

  if (!isOpen) return null;

  const anyUploading = photos.some(p => p.uploading);

  return (
    <>
      {/* ── Backdrop ── */}
      <div
        style={{
          position: "fixed", inset: 0, zIndex: 1000,
          background: "rgba(15,23,42,0.5)",
          backdropFilter: "blur(6px)",
          WebkitBackdropFilter: "blur(6px)",
          display: "flex", alignItems: "center", justifyContent: "center",
          padding: "24px 16px",
        }}
        onClick={e => { if (e.target === e.currentTarget) handleClose(); }}
      >
        {/* ── Sheet ── */}
        <div
          style={{
            background: "#FFFFFF",
            borderRadius: 20,
            width: "100%",
            maxWidth: 560,
            maxHeight: "calc(100vh - 48px)",
            display: "flex",
            flexDirection: "column",
            boxShadow: "0 32px 64px rgba(0,0,0,0.22), 0 0 0 1px rgba(0,0,0,0.06)",
            overflow: "hidden",
          }}
        >
          {/* ── Header ── */}
          <div style={{
            display: "flex", alignItems: "center", justifyContent: "space-between",
            padding: "18px 24px",
            borderBottom: `1px solid ${BORDER}`,
            flexShrink: 0,
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <div style={{
                width: 34, height: 34, borderRadius: 10,
                background: NAVY_LIGHT,
                display: "flex", alignItems: "center", justifyContent: "center",
              }}>
                <Camera size={16} style={{ color: NAVY }} />
              </div>
              <div>
                <h2 style={{
                  fontFamily: "var(--font-display)",
                  fontSize: 16, fontWeight: 700, color: TEXT, margin: 0,
                }}>
                  Log Progress Lapangan
                </h2>
                <p style={{ fontSize: 12, color: MUTED, margin: 0 }}>
                  Dokumentasi harian perkembangan proyek
                </p>
              </div>
            </div>
            <button
              onClick={handleClose}
              style={{
                width: 32, height: 32, borderRadius: "50%", border: "none",
                background: "#F3F4F6", cursor: "pointer",
                display: "flex", alignItems: "center", justifyContent: "center",
                color: MID, flexShrink: 0,
              }}
            >
              <X size={15} />
            </button>
          </div>

          {/* ── Body (scrollable) ── */}
          <div style={{ flex: 1, overflowY: "auto", padding: "20px 24px" }}>
            <form id="progress-form" onSubmit={handleSubmit}>
              <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>

                {/* Error banner */}
                {formError && (
                  <div style={{
                    padding: "10px 14px", borderRadius: 10,
                    background: "#FEF2F2", border: "1px solid #FECACA",
                    color: RED, fontSize: 13,
                  }}>
                    {formError}
                  </div>
                )}

                {/* ── Row: Tanggal + Cuaca ── */}
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                  <div>
                    <label style={label}>Tanggal *</label>
                    <input
                      type="date"
                      value={loggedAt}
                      max={todayISO()}
                      onChange={e => setLoggedAt(e.target.value)}
                      required
                      style={input}
                      onFocus={e => { e.target.style.borderColor = NAVY; }}
                      onBlur={e =>  { e.target.style.borderColor = BORDER; }}
                    />
                  </div>
                  <div>
                    <label style={label}>Cuaca</label>
                    <select
                      value={weather}
                      onChange={e => setWeather(e.target.value)}
                      style={input}
                      onFocus={e => { e.target.style.borderColor = NAVY; }}
                      onBlur={e =>  { e.target.style.borderColor = BORDER; }}
                    >
                      <option value="">— Pilih cuaca</option>
                      {WEATHER_OPTIONS.map(w => (
                        <option key={w.value} value={w.value}>{w.label}</option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* ── Row: Progress % + Jumlah Pekerja ── */}
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                  <div>
                    <label style={label}>Progress Keseluruhan *</label>
                    <div style={{ position: "relative" }}>
                      <input
                        type="number"
                        value={pctOverall}
                        onChange={e => setPctOverall(e.target.value)}
                        min={0} max={100} step={1}
                        placeholder="0"
                        required
                        style={{ ...input, paddingRight: 38 }}
                        onFocus={e => { e.target.style.borderColor = NAVY; }}
                        onBlur={e =>  { e.target.style.borderColor = BORDER; }}
                      />
                      <span style={{
                        position: "absolute", right: 12, top: "50%",
                        transform: "translateY(-50%)",
                        fontSize: 13, fontWeight: 600, color: MID,
                        pointerEvents: "none",
                      }}>%</span>
                    </div>
                    {/* Visual slider */}
                    {pctOverall !== "" && !isNaN(parseFloat(pctOverall)) && (
                      <div style={{ marginTop: 6, height: 4, background: "#F3F4F6", borderRadius: 4 }}>
                        <div style={{
                          height: "100%",
                          width: `${Math.min(Math.max(parseFloat(pctOverall), 0), 100)}%`,
                          background: `linear-gradient(90deg, ${NAVY}, #0066CC)`,
                          borderRadius: 4, transition: "width 0.2s ease",
                        }} />
                      </div>
                    )}
                  </div>
                  <div>
                    <label style={label}>Jumlah Pekerja</label>
                    <input
                      type="number"
                      value={workerCount}
                      onChange={e => setWorkerCount(e.target.value)}
                      min={0}
                      placeholder="0 orang"
                      style={input}
                      onFocus={e => { e.target.style.borderColor = NAVY; }}
                      onBlur={e =>  { e.target.style.borderColor = BORDER; }}
                    />
                  </div>
                </div>

                {/* ── Scope pekerjaan ── */}
                {workScopes.length > 0 && (
                  <div>
                    <label style={label}>Scope Pekerjaan</label>
                    <select
                      value={workScopeId}
                      onChange={e => setWorkScopeId(e.target.value)}
                      style={input}
                      onFocus={e => { e.target.style.borderColor = NAVY; }}
                      onBlur={e =>  { e.target.style.borderColor = BORDER; }}
                    >
                      <option value="">— Semua scope</option>
                      {workScopes.map(ws => (
                        <option key={ws.id} value={ws.id}>{ws.scope_name}</option>
                      ))}
                    </select>
                  </div>
                )}

                {/* ── Catatan / Deskripsi ── */}
                <div>
                  <label style={label}>Deskripsi Kegiatan</label>
                  <textarea
                    value={notes}
                    onChange={e => setNotes(e.target.value)}
                    placeholder="Ceritakan kegiatan hari ini: pekerjaan yang dilakukan, kendala yang dihadapi, dll."
                    rows={3}
                    style={{
                      ...input,
                      resize: "vertical",
                      minHeight: 88,
                      lineHeight: 1.6,
                    }}
                    onFocus={e => { e.target.style.borderColor = NAVY; }}
                    onBlur={e =>  { e.target.style.borderColor = BORDER; }}
                  />
                </div>

                {/* ── Upload Foto ── */}
                <div>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
                    <label style={{ ...label, margin: 0 }}>Foto Lapangan</label>
                    <span style={{ fontSize: 11, color: MUTED }}>
                      {photos.length}/5 foto · maks 10 MB
                    </span>
                  </div>

                  {/* Drop zone */}
                  {photos.length < 5 && (
                    <div
                      onDragOver={e => { e.preventDefault(); setDragOver(true); }}
                      onDragLeave={() => setDragOver(false)}
                      onDrop={e => { e.preventDefault(); setDragOver(false); addFiles(e.dataTransfer.files); }}
                      onClick={() => fileInputRef.current?.click()}
                      style={{
                        border: `2px dashed ${dragOver ? NAVY : BORDER}`,
                        borderRadius: 12,
                        padding: "20px 16px",
                        display: "flex", flexDirection: "column", alignItems: "center", gap: 6,
                        cursor: "pointer", transition: "all 0.15s",
                        background: dragOver ? NAVY_LIGHT : "#FAFAFA",
                        marginBottom: photos.length > 0 ? 10 : 0,
                      }}
                    >
                      <div style={{
                        width: 36, height: 36, borderRadius: 10,
                        background: dragOver ? NAVY : NAVY_LIGHT,
                        display: "flex", alignItems: "center", justifyContent: "center",
                        transition: "background 0.15s",
                      }}>
                        <Upload size={16} style={{ color: dragOver ? "#FFFFFF" : NAVY }} />
                      </div>
                      <p style={{ fontSize: 13, color: MID, margin: 0, textAlign: "center" }}>
                        <span style={{ fontWeight: 600, color: NAVY }}>Klik</span> atau <span style={{ fontWeight: 600, color: NAVY }}>drag & drop</span> foto
                      </p>
                      <p style={{ fontSize: 11, color: MUTED, margin: 0 }}>
                        JPG · PNG · WEBP — maks 10 MB per foto
                      </p>
                    </div>
                  )}

                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    multiple
                    style={{ display: "none" }}
                    onChange={e => {
                      if (e.target.files) { addFiles(e.target.files); e.target.value = ""; }
                    }}
                  />

                  {/* Photo list */}
                  {photos.length > 0 && (
                    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                      {photos.map(entry => (
                        <div key={entry.id} style={{
                          display: "flex", gap: 10, padding: "10px 12px",
                          border: `1px solid ${entry.error ? "#FECACA" : BORDER}`,
                          borderRadius: 12,
                          background: entry.error ? "#FEF2F2" : "#FFFFFF",
                          alignItems: "center",
                        }}>
                          {/* Thumbnail */}
                          <div style={{
                            width: 52, height: 52, borderRadius: 8,
                            overflow: "hidden", flexShrink: 0,
                            background: "#F3F4F6", position: "relative",
                          }}>
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                              src={entry.previewUrl}
                              alt="preview"
                              style={{ width: "100%", height: "100%", objectFit: "cover" }}
                            />
                            {entry.uploading && (
                              <div style={{
                                position: "absolute", inset: 0,
                                background: "rgba(0,0,0,0.45)",
                                display: "flex", alignItems: "center", justifyContent: "center",
                              }}>
                                <Loader2 size={18} style={{ color: "#FFF", animation: "spin 0.8s linear infinite" }} />
                              </div>
                            )}
                            {entry.uploadedUrl && (
                              <div style={{
                                position: "absolute", inset: 0,
                                background: "rgba(21,128,61,0.35)",
                                display: "flex", alignItems: "center", justifyContent: "center",
                              }}>
                                <span style={{ fontSize: 18, lineHeight: 1 }}>✓</span>
                              </div>
                            )}
                          </div>

                          {/* Meta */}
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <p style={{
                              fontSize: 11, color: MUTED, margin: "0 0 4px",
                              whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                            }}>
                              {entry.file.name}
                              <span style={{ marginLeft: 6, color: "#D1D5DB" }}>
                                {(entry.file.size / 1024 / 1024).toFixed(1)} MB
                              </span>
                            </p>
                            <input
                              type="text"
                              placeholder="Tambah caption..."
                              value={entry.caption}
                              onChange={e => patchPhoto(entry.id, { caption: e.target.value })}
                              style={{
                                ...input,
                                fontSize: 12,
                                padding: "6px 10px",
                                borderRadius: 8,
                              }}
                              onFocus={e => { e.target.style.borderColor = NAVY; }}
                              onBlur={e =>  { e.target.style.borderColor = BORDER; }}
                            />
                            {entry.error && (
                              <p style={{ fontSize: 11, color: RED, margin: "3px 0 0" }}>
                                {entry.error}
                              </p>
                            )}
                          </div>

                          {/* Remove */}
                          <button
                            type="button"
                            onClick={() => removePhoto(entry.id)}
                            disabled={entry.uploading}
                            style={{
                              width: 30, height: 30, borderRadius: 8, border: "none",
                              background: "#FEF2F2", color: RED,
                              cursor: entry.uploading ? "not-allowed" : "pointer",
                              display: "flex", alignItems: "center", justifyContent: "center",
                              flexShrink: 0, opacity: entry.uploading ? 0.5 : 1,
                            }}
                          >
                            <Trash2 size={13} />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

              </div>
            </form>
          </div>

          {/* ── Footer ── */}
          <div style={{
            padding: "14px 24px",
            borderTop: `1px solid ${BORDER}`,
            background: "#FAFAFA",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            flexShrink: 0,
            gap: 10,
          }}>
            <p style={{ fontSize: 12, color: MUTED, margin: 0 }}>
              {photos.length > 0
                ? anyUploading
                  ? "Mengupload foto..."
                  : `${photos.length} foto siap diupload`
                : "Foto bersifat opsional"}
            </p>
            <div style={{ display: "flex", gap: 8 }}>
              <button
                type="button"
                onClick={handleClose}
                disabled={submitting}
                style={{
                  padding: "9px 18px", borderRadius: 10,
                  border: `1px solid ${BORDER}`, background: "#FFFFFF",
                  fontSize: 13, fontWeight: 500, color: MID,
                  cursor: submitting ? "not-allowed" : "pointer",
                }}
              >
                Batal
              </button>
              <button
                type="submit"
                form="progress-form"
                disabled={submitting}
                style={{
                  padding: "9px 22px", borderRadius: 10, border: "none",
                  background: submitting ? "#6B7280" : NAVY, color: "#FFFFFF",
                  fontSize: 13, fontWeight: 600,
                  cursor: submitting ? "not-allowed" : "pointer",
                  display: "flex", alignItems: "center", gap: 7,
                  transition: "background 0.15s",
                  minWidth: 120, justifyContent: "center",
                }}
                onMouseEnter={e => { if (!submitting) e.currentTarget.style.background = "#002244"; }}
                onMouseLeave={e => { if (!submitting) e.currentTarget.style.background = NAVY; }}
              >
                {submitting && (
                  <Loader2 size={13} style={{ animation: "spin 0.8s linear infinite" }} />
                )}
                {submitting ? "Menyimpan..." : "Simpan Log"}
              </button>
            </div>
          </div>
        </div>
      </div>

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        input[type=number]::-webkit-inner-spin-button,
        input[type=number]::-webkit-outer-spin-button { -webkit-appearance: none; }
        input[type=number] { -moz-appearance: textfield; }
      `}</style>
    </>
  );
}
