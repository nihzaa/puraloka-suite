"use client";

import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  FileText, Upload, Trash2, File, ExternalLink, X,
  Download, Lock, Unlock,
} from "lucide-react";
import { api } from "@/lib/api";

// ─── Types ───────────────────────────────────────────────────────────────────

interface Doc {
  id: string;
  project_id: string;
  doc_type: string;
  title: string;
  file_url: string;
  file_size_kb: number;
  file_extension: string | null;
  version: string | null;
  is_visible_to_client: boolean;
  uploaded_at: string;
  uploader: { id: string; name: string } | null;
}

interface Props {
  projectId: string;
  userRole?: string;
}

// ─── Design tokens ────────────────────────────────────────────────────────────

const C = {
  navy: "var(--navy)", navyLight: "var(--navy-light)",
  text: "var(--text-primary)", mid: "var(--text-secondary)", muted: "var(--text-muted)",
  border: "var(--border)", bg: "var(--bg)",
  green: "var(--success)", greenBg: "var(--success-bg)", greenBorder: "var(--success-border)",
  red: "var(--danger)", redBg: "var(--danger-bg)", redBorder: "var(--danger-border)",
  yellow: "var(--warning)", yellowBg: "var(--warning-bg)",
  purple: "#7C3AED", purpleBg: "#F5F3FF",
};

const DOC_TYPE_LABELS: Record<string, string> = {
  kontrak: "Kontrak",
  gambar_kerja: "Gambar Kerja",
  foto_progress: "Foto Progress",
  invoice: "Invoice",
  berita_acara: "Berita Acara",
  spk: "SPK",
  lainnya: "Lainnya",
};

// doc_type → badge color
const DOC_TYPE_COLORS: Record<string, { bg: string; color: string }> = {
  kontrak:      { bg: "#FEF3C7", color: "#B45309" },
  gambar_kerja: { bg: "#DBEAFE", color: "#1E40AF" },
  foto_progress:{ bg: "#D1FAE5", color: "#065F46" },
  invoice:      { bg: "#EDE9FE", color: "#5B21B6" },
  berita_acara: { bg: "#E0F2FE", color: "#0369A1" },
  spk:          { bg: "#FCE7F3", color: "#9D174D" },
  lainnya:      { bg: "var(--surface-hover)", color: "#374151" },
};

const ALL_FILTER = "semua";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fmtSizeKb(kb: number): string {
  if (kb < 1024) return `${kb} KB`;
  return `${(kb / 1024).toFixed(1)} MB`;
}

function fmtDate(d: string): string {
  return new Date(d).toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" });
}

function logAccess(documentId: string, action: "view" | "download") {
  api.post(`/api/v1/documents/${documentId}/access-log`, { action }).catch(() => {});
}

// ─── Main component ───────────────────────────────────────────────────────────

export function DocumentSection({ projectId, userRole }: Props) {
  const [docs, setDocs] = useState<Doc[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [filterType, setFilterType] = useState(ALL_FILTER);

  const [showUploadModal, setShowUploadModal] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [togglingId, setTogglingId] = useState<string | null>(null);

  // Upload form state
  const [uploadTitle, setUploadTitle] = useState("");
  const [uploadType, setUploadType] = useState("lainnya");
  const [uploadVisible, setUploadVisible] = useState(false);
  const [uploadFile, setUploadFile] = useState<File | null>(null);

  const canEdit = userRole === "admin" || userRole === "pm";

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.get<{ data: Doc[] }>(`/api/v1/projects/${projectId}/documents`);
      setDocs(res.data.data ?? []);
    } catch {
      setError("Gagal memuat dokumen");
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => { load(); }, [load]);

  // ── Filter ─────────────────────────────────────────────────────────────────

  const filteredDocs = filterType === ALL_FILTER
    ? docs
    : docs.filter(d => d.doc_type === filterType);

  const typeCounts = docs.reduce<Record<string, number>>((acc, d) => {
    acc[d.doc_type] = (acc[d.doc_type] ?? 0) + 1;
    return acc;
  }, {});

  // ── Upload ─────────────────────────────────────────────────────────────────

  async function handleUpload() {
    if (!uploadFile || !uploadTitle.trim()) return;
    setUploading(true);
    setUploadError(null);
    try {
      const base64 = await fileToBase64(uploadFile);
      const res = await api.post<{ data: Doc }>(`/api/v1/projects/${projectId}/documents/upload`, {
        title: uploadTitle.trim(),
        doc_type: uploadType,
        is_visible_to_client: uploadVisible,
        file_base64: base64,
        file_name: uploadFile.name,
        file_type: uploadFile.type,
      });
      setDocs(prev => [res.data.data, ...prev]);
      setShowUploadModal(false);
      setUploadTitle(""); setUploadType("lainnya"); setUploadVisible(false); setUploadFile(null);
      setSuccessMsg("Dokumen berhasil diupload");
      setTimeout(() => setSuccessMsg(null), 4000);
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { error?: string } } })?.response?.data?.error;
      setUploadError(msg ?? "Gagal upload dokumen");
    } finally {
      setUploading(false);
    }
  }

  async function handleDelete(doc: Doc) {
    if (!confirm(`Hapus dokumen "${doc.title}"?`)) return;
    setDeletingId(doc.id);
    try {
      await api.delete(`/api/v1/projects/${projectId}/documents/${doc.id}`);
      setDocs(prev => prev.filter(d => d.id !== doc.id));
    } catch {
      // silent
    } finally {
      setDeletingId(null);
    }
  }

  async function handleToggleVisibility(doc: Doc) {
    setTogglingId(doc.id);
    try {
      const res = await api.patch<{ data: Doc }>(`/api/v1/projects/${projectId}/documents/${doc.id}`, {
        is_visible_to_client: !doc.is_visible_to_client,
      });
      setDocs(prev => prev.map(d => d.id === doc.id ? res.data.data : d));
    } catch {
      // silent
    } finally {
      setTogglingId(null);
    }
  }

  // ─── Render ────────────────────────────────────────────────────────────────

  const filterTabs = [ALL_FILTER, ...Object.keys(typeCounts).sort()];

  return (
    <div>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{
            width: 36, height: 36, borderRadius: 10,
            background: "linear-gradient(135deg, #003366, #0066CC)",
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>
            <FileText size={18} color="var(--surface)" />
          </div>
          <div>
            <h3 style={{ fontSize: 15, fontWeight: 700, color: C.text, margin: 0 }}>Dokumen Proyek</h3>
            <p style={{ fontSize: 11, color: C.muted, margin: 0 }}>{docs.length} file terlampir</p>
          </div>
        </div>
        {canEdit && (
          <button
            onClick={() => setShowUploadModal(true)}
            style={{
              display: "flex", alignItems: "center", gap: 6,
              padding: "8px 14px", borderRadius: 8, fontSize: 12, fontWeight: 600,
              background: C.navy, color: "var(--surface)", border: "none", cursor: "pointer",
            }}
            onMouseEnter={e => { e.currentTarget.style.background = "#002244"; }}
            onMouseLeave={e => { e.currentTarget.style.background = C.navy; }}
          >
            <Upload size={13} /> Upload Dokumen
          </button>
        )}
      </div>

      {/* Messages */}
      {successMsg && (
        <div style={{ marginBottom: 12, padding: "10px 14px", borderRadius: 8, background: C.greenBg, border: `1px solid ${C.greenBorder}`, fontSize: 13, color: C.green, fontWeight: 500 }}>
          {successMsg}
        </div>
      )}
      {error && (
        <div style={{ marginBottom: 12, padding: "10px 14px", borderRadius: 8, background: C.redBg, border: `1px solid ${C.redBorder}`, fontSize: 13, color: C.red }}>
          {error}
        </div>
      )}

      {/* Filter tabs */}
      {docs.length > 0 && (
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 14 }}>
          {filterTabs.map(tab => {
            const isActive = filterType === tab;
            const count = tab === ALL_FILTER ? docs.length : (typeCounts[tab] ?? 0);
            const label = tab === ALL_FILTER ? "Semua" : (DOC_TYPE_LABELS[tab] ?? tab);
            return (
              <button
                key={tab}
                onClick={() => setFilterType(tab)}
                style={{
                  padding: "5px 10px", borderRadius: 20, fontSize: 11, fontWeight: isActive ? 700 : 500, cursor: "pointer",
                  border: `1px solid ${isActive ? C.navy : "var(--border)"}`,
                  background: isActive ? C.navy : "var(--surface)",
                  color: isActive ? "var(--surface)" : C.mid,
                  transition: "all 0.15s",
                }}
              >
                {label} <span style={{ opacity: 0.7 }}>({count})</span>
              </button>
            );
          })}
        </div>
      )}

      {loading ? (
        <div style={{ padding: "24px 0", textAlign: "center", fontSize: 13, color: C.muted }}>Memuat dokumen...</div>
      ) : docs.length === 0 ? (
        <div style={{
          padding: "32px 24px", textAlign: "center",
          border: "2px dashed #E5E7EB", borderRadius: 12, background: "#FAFAFA",
          cursor: canEdit ? "pointer" : "default",
        }}
          onClick={() => canEdit && setShowUploadModal(true)}
        >
          <FileText size={28} color={C.muted} style={{ marginBottom: 10 }} />
          <p style={{ fontSize: 14, fontWeight: 600, color: C.text, marginBottom: 4 }}>Belum ada dokumen</p>
          <p style={{ fontSize: 12, color: C.muted }}>
            {canEdit ? "Klik untuk upload dokumen (PDF, gambar, Word)" : "Belum ada dokumen untuk proyek ini"}
          </p>
        </div>
      ) : filteredDocs.length === 0 ? (
        <div style={{ padding: "20px", textAlign: "center", fontSize: 13, color: C.muted }}>
          Tidak ada dokumen dengan tipe ini
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {filteredDocs.map(doc => {
            const typeColor = DOC_TYPE_COLORS[doc.doc_type] ?? DOC_TYPE_COLORS.lainnya;
            return (
              <div key={doc.id} style={{
                display: "flex", alignItems: "center", gap: 12,
                padding: "12px 16px", borderRadius: 10,
                border: "1px solid #E5E7EB", background: "#FAFAFA",
              }}>
                {/* Icon */}
                <div style={{
                  width: 36, height: 36, borderRadius: 8, flexShrink: 0,
                  background: typeColor.bg, border: "1px solid #E5E7EB",
                  display: "flex", alignItems: "center", justifyContent: "center",
                }}>
                  <File size={16} color={typeColor.color} />
                </div>

                {/* Info */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ fontSize: 13, fontWeight: 600, color: C.text, margin: 0, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                    {doc.title}
                    {doc.version && doc.version !== "1.0" && (
                      <span style={{ marginLeft: 6, fontSize: 10, background: "var(--surface-hover)", color: C.mid, padding: "1px 5px", borderRadius: 4, fontWeight: 600 }}>
                        v{doc.version}
                      </span>
                    )}
                  </p>
                  <p style={{ fontSize: 11, color: C.muted, margin: "3px 0 0", display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                    <span style={{
                      display: "inline-block", padding: "1px 7px", borderRadius: 10,
                      background: typeColor.bg, color: typeColor.color, fontWeight: 700, fontSize: 10,
                    }}>
                      {DOC_TYPE_LABELS[doc.doc_type] ?? doc.doc_type}
                    </span>
                    <span>{fmtSizeKb(doc.file_size_kb)}</span>
                    <span>·</span>
                    <span>{fmtDate(doc.uploaded_at)}</span>
                    {doc.uploader && <><span>·</span><span>{doc.uploader.name}</span></>}
                    {/* Visibility badge */}
                    {canEdit && (
                      <span style={{
                        display: "inline-flex", alignItems: "center", gap: 3,
                        padding: "1px 6px", borderRadius: 10, fontSize: 10, fontWeight: 600,
                        background: doc.is_visible_to_client ? C.greenBg : "var(--surface-hover)",
                        color: doc.is_visible_to_client ? C.green : C.muted,
                        border: `1px solid ${doc.is_visible_to_client ? C.greenBorder : "var(--border)"}`,
                      }}>
                        {doc.is_visible_to_client ? <><Unlock size={9} /> Klien bisa lihat</> : <><Lock size={9} /> Internal</>}
                      </span>
                    )}
                  </p>
                </div>

                {/* Actions */}
                <div style={{ display: "flex", gap: 5, flexShrink: 0, alignItems: "center" }}>
                  {/* Toggle visibility (admin/pm only) */}
                  {canEdit && (
                    <button aria-label={doc.is_visible_to_client ? "Sembunyikan dari klien" : "Tampilkan ke klien"}
                      onClick={() => handleToggleVisibility(doc)}
                      disabled={togglingId === doc.id}
                      title={doc.is_visible_to_client ? "Sembunyikan dari klien" : "Tampilkan ke klien"}
                      style={{
                        display: "flex", alignItems: "center", padding: "6px 8px", borderRadius: 6,
                        background: "transparent", color: doc.is_visible_to_client ? C.green : C.muted,
                        border: `1px solid ${doc.is_visible_to_client ? C.greenBorder : "var(--border)"}`,
                        cursor: "pointer", opacity: togglingId === doc.id ? 0.5 : 1,
                      }}
                    >
                      {doc.is_visible_to_client ? <Unlock size={12} /> : <Lock size={12} />}
                    </button>
                  )}

                  {/* View */}
                  <a
                    href={doc.file_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={() => logAccess(doc.id, "view")}
                    style={{
                      display: "flex", alignItems: "center", gap: 4,
                      padding: "6px 10px", borderRadius: 6, fontSize: 11, fontWeight: 600,
                      background: C.navyLight, color: C.navy, border: "none",
                      textDecoration: "none", cursor: "pointer",
                    }}
                  >
                    <ExternalLink size={12} /> Buka
                  </a>

                  {/* Download */}
                  <a
                    href={doc.file_url}
                    download
                    onClick={() => logAccess(doc.id, "download")}
                    style={{
                      display: "flex", alignItems: "center",
                      padding: "6px 8px", borderRadius: 6,
                      background: "transparent", color: C.mid,
                      border: "1px solid #E5E7EB", textDecoration: "none",
                    }}
                    title="Download"
                  >
                    <Download size={12} />
                  </a>

                  {/* Delete */}
                  {canEdit && (
                    <button aria-label="Hapus dokumen"
                      onClick={() => handleDelete(doc)}
                      disabled={deletingId === doc.id}
                      style={{
                        display: "flex", alignItems: "center",
                        padding: "6px 8px", borderRadius: 6, fontSize: 11,
                        background: "transparent", color: C.muted,
                        border: "1px solid #E5E7EB", cursor: "pointer",
                      }}
                      onMouseEnter={e => { e.currentTarget.style.background = C.redBg; e.currentTarget.style.color = C.red; e.currentTarget.style.borderColor = C.redBorder; }}
                      onMouseLeave={e => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = C.muted; e.currentTarget.style.borderColor = "var(--border)"; }}
                      title="Hapus dokumen"
                    >
                      <Trash2 size={12} />
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Upload Modal */}
      {showUploadModal && (
        <UploadModal
          uploadTitle={uploadTitle} setUploadTitle={setUploadTitle}
          uploadType={uploadType} setUploadType={setUploadType}
          uploadVisible={uploadVisible} setUploadVisible={setUploadVisible}
          uploadFile={uploadFile} setUploadFile={setUploadFile}
          uploading={uploading} uploadError={uploadError}
          onClose={() => {
            setShowUploadModal(false);
            setUploadTitle(""); setUploadType("lainnya"); setUploadVisible(false);
            setUploadFile(null); setUploadError(null);
          }}
          onSubmit={handleUpload}
        />
      )}
    </div>
  );
}

// ─── Upload Modal ─────────────────────────────────────────────────────────────

interface UploadModalProps {
  uploadTitle: string; setUploadTitle: (v: string) => void;
  uploadType: string; setUploadType: (v: string) => void;
  uploadVisible: boolean; setUploadVisible: (v: boolean) => void;
  uploadFile: File | null; setUploadFile: (f: File | null) => void;
  uploading: boolean; uploadError: string | null;
  onClose: () => void; onSubmit: () => void;
}

function UploadModalContent({
  uploadTitle, setUploadTitle, uploadType, setUploadType,
  uploadVisible, setUploadVisible, uploadFile, setUploadFile,
  uploading, uploadError, onClose, onSubmit,
}: UploadModalProps) {
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = ""; };
  }, []);

  const canSubmit = !!uploadFile && uploadTitle.trim().length > 0 && !uploading;

  const inpStyle: React.CSSProperties = {
    width: "100%", padding: "9px 12px", border: "1px solid #E5E7EB",
    borderRadius: 8, fontSize: 13, color: "var(--text-primary)", outline: "none",
    boxSizing: "border-box",
  };

  return (
    <div
      style={{
        position: "fixed", inset: 0, zIndex: 9999,
        background: "rgba(0,0,0,0.45)", backdropFilter: "blur(3px)",
        display: "flex", alignItems: "center", justifyContent: "center", padding: 20,
      }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div style={{
        background: "var(--surface)", borderRadius: 16, width: "100%", maxWidth: 480,
        boxShadow: "0 20px 60px rgba(0,0,0,0.18)",
        display: "flex", flexDirection: "column", maxHeight: "90vh",
      }}>
        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "20px 24px", borderBottom: "1px solid #E5E7EB" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ width: 36, height: 36, borderRadius: 10, flexShrink: 0, background: "linear-gradient(135deg, #003366, #0066CC)", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <Upload size={17} color="var(--surface)" />
            </div>
            <h3 style={{ fontSize: 15, fontWeight: 700, color: "var(--text-primary)", margin: 0 }}>Upload Dokumen</h3>
          </div>
          <button aria-label="Tutup pratinjau dokumen" onClick={onClose} style={{ background: "transparent", border: "none", cursor: "pointer", color: "var(--text-secondary)", padding: 4, borderRadius: 6 }}>
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div style={{ padding: "20px 24px", display: "flex", flexDirection: "column", gap: 16, overflowY: "auto" }}>
          {/* Judul */}
          <div>
            <label htmlFor="upload-title" style={{ display: "block", fontSize: 12, fontWeight: 600, color: "var(--text-secondary)", marginBottom: 6 }}>
              Judul Dokumen <span style={{ color: C.red }}>*</span>
            </label>
            <input id="upload-title" value={uploadTitle} onChange={e => setUploadTitle(e.target.value)}
              placeholder="Contoh: Kontrak Kerja Rev.1" autoFocus style={inpStyle}
              onFocus={e => { e.target.style.borderColor = C.navy; }}
              onBlur={e => { e.target.style.borderColor = "var(--border)"; }}
            />
          </div>

          {/* Tipe */}
          <div>
            <label htmlFor="upload-type" style={{ display: "block", fontSize: 12, fontWeight: 600, color: "var(--text-secondary)", marginBottom: 6 }}>Tipe Dokumen</label>
            <select id="upload-type" aria-label="Jenis dokumen" value={uploadType} onChange={e => setUploadType(e.target.value)} style={{ ...inpStyle, background: "var(--surface)" }}>
              {Object.entries(DOC_TYPE_LABELS).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </select>
          </div>

          {/* Visibility */}
          <label style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer", padding: "10px 12px", borderRadius: 8, border: `1px solid ${uploadVisible ? C.greenBorder : "var(--border)"}`, background: uploadVisible ? C.greenBg : "#FAFAFA" }}>
            <input type="checkbox" checked={uploadVisible} onChange={e => setUploadVisible(e.target.checked)} style={{ accentColor: C.green, width: 15, height: 15 }} />
            <div>
              <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>Tampilkan ke Klien</div>
              <div style={{ fontSize: 11, color: "var(--text-secondary)" }}>Klien dapat melihat dokumen ini di portal mereka</div>
            </div>
          </label>

          {/* File picker */}
          <div>
            <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "var(--text-secondary)", marginBottom: 6 }}>
              File <span style={{ color: C.red }}>*</span>
              <span style={{ color: "var(--text-muted)", fontWeight: 400 }}> (PDF, gambar, DOCX · max 20MB)</span>
            </label>
            <input ref={fileRef} type="file" accept=".pdf,.jpg,.jpeg,.png,.webp,.docx" style={{ display: "none" }}
              onChange={e => {
                const f = e.target.files?.[0] ?? null;
                if (f && f.size > 20 * 1024 * 1024) { alert("Ukuran file maksimal 20 MB"); e.target.value = ""; return; }
                setUploadFile(f);
              }}
            />
            {uploadFile ? (
              <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 14px", borderRadius: 10, background: C.greenBg, border: `1.5px solid ${C.greenBorder}` }}>
                <File size={20} color={C.green} style={{ flexShrink: 0 }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{uploadFile.name}</div>
                  <div style={{ fontSize: 11, color: "var(--text-muted)" }}>{fmtSizeKb(Math.ceil(uploadFile.size / 1024))}</div>
                </div>
                <button type="button" aria-label="Buang berkas yang dipilih" onClick={() => { setUploadFile(null); if (fileRef.current) fileRef.current.value = ""; }}
                  style={{ background: "transparent", border: "none", cursor: "pointer", color: C.red, padding: 4 }}>
                  <X size={15} />
                </button>
              </div>
            ) : (
              <div onClick={() => fileRef.current?.click()}
                style={{ padding: "24px 16px", border: "2px dashed #E5E7EB", borderRadius: 10, textAlign: "center", cursor: "pointer", background: "#FAFAFA" }}
                onMouseEnter={e => { e.currentTarget.style.borderColor = C.navy; e.currentTarget.style.background = C.navyLight; }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = "var(--border)"; e.currentTarget.style.background = "#FAFAFA"; }}
              >
                <Upload size={22} color="var(--text-muted)" style={{ marginBottom: 8 }} />
                <p style={{ fontSize: 13, color: "var(--text-secondary)", margin: 0, fontWeight: 500 }}>Klik untuk pilih file</p>
                <p style={{ fontSize: 11, color: "var(--text-muted)", margin: "4px 0 0" }}>PDF, JPG, PNG, DOCX · maks 20MB</p>
              </div>
            )}
          </div>

          {uploadError && (
            <div style={{ padding: "10px 14px", borderRadius: 8, background: C.redBg, border: `1px solid ${C.redBorder}`, fontSize: 13, color: C.red }}>
              {uploadError}
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{ display: "flex", gap: 10, padding: "16px 24px", borderTop: "1px solid #F3F4F6" }}>
          <button onClick={onClose} disabled={uploading}
            style={{ flex: 1, padding: "10px", borderRadius: 8, border: "1px solid #E5E7EB", background: "var(--surface)", fontSize: 13, color: "var(--text-secondary)", cursor: "pointer", fontWeight: 500 }}>
            Batal
          </button>
          <button onClick={onSubmit} disabled={!canSubmit}
            style={{ flex: 2, padding: "10px", borderRadius: 8, border: "none", background: canSubmit ? C.navy : "var(--text-muted)", color: "var(--surface)", fontSize: 13, fontWeight: 600, cursor: canSubmit ? "pointer" : "not-allowed" }}
            onMouseEnter={e => { if (canSubmit) e.currentTarget.style.background = "#002244"; }}
            onMouseLeave={e => { if (canSubmit) e.currentTarget.style.background = C.navy; }}
          >
            {uploading ? "Mengupload..." : "Upload"}
          </button>
        </div>
      </div>
    </div>
  );
}

function UploadModal(props: UploadModalProps) {
  const [mounted, mount] = useReducer(() => true, false);
  useEffect(mount, []);
  if (!mounted) return null;
  return createPortal(<UploadModalContent {...props} />, document.body);
}

// ─── Helper ──────────────────────────────────────────────────────────────────

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      resolve(result.split(",")[1]);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}
