"use client";

import { useCallback, useEffect, useReducer, useState } from "react";
import { createPortal } from "react-dom";
import {
  Images, ChevronLeft, ChevronRight, X, Download,
  AlertTriangle, CheckCircle2, Camera, Tag,
} from "lucide-react";
import { api } from "@/lib/api";

// ─── Types ───────────────────────────────────────────────────────────────────

interface Photo {
  id: string;
  url: string;
  caption: string | null;
  taken_at: string | null;
  uploaded_at: string;
  category: "progress" | "defect" | "serah_terima" | "other";
  progress_log_id: string | null;
  uploader: { id: string; name: string } | null;
}

interface Props {
  projectId: string;
  userRole?: string;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const C = {
  navy: "var(--navy)", navyLight: "var(--navy-light)",
  text: "var(--text-primary)", mid: "var(--text-secondary)", muted: "var(--text-muted)",
  border: "var(--border)", bg: "var(--bg)",
  green: "var(--success)", greenBg: "var(--success-bg)",
  red: "var(--danger)", redBg: "var(--danger-bg)",
  yellow: "var(--warning)", yellowBg: "var(--warning-bg)",
};

const CATEGORIES: { key: string; label: string; icon: React.ReactNode; color: string; bg: string }[] = [
  { key: "semua",       label: "Semua",        icon: <Images size={13} />,        color: C.navy,    bg: C.navyLight },
  { key: "progress",    label: "Progress",     icon: <Camera size={13} />,        color: "#0369A1", bg: "#E0F2FE" },
  { key: "defect",      label: "Defect",       icon: <AlertTriangle size={13} />, color: "#B45309", bg: "#FEF3C7" },
  { key: "serah_terima",label: "Serah Terima", icon: <CheckCircle2 size={13} />,  color: C.green,   bg: C.greenBg },
  { key: "other",       label: "Lainnya",      icon: <Tag size={13} />,           color: C.mid,     bg: "var(--surface-hover)" },
];

const CATEGORY_LABEL: Record<string, string> = {
  progress: "Progress", defect: "Defect", serah_terima: "Serah Terima", other: "Lainnya",
};

const CATEGORY_COLORS: Record<string, { color: string; bg: string }> = {
  progress:     { color: "#0369A1", bg: "#E0F2FE" },
  defect:       { color: "#B45309", bg: "#FEF3C7" },
  serah_terima: { color: C.green,   bg: C.greenBg },
  other:        { color: C.mid,     bg: "var(--surface-hover)" },
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fmtDate(d: string | null) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" });
}

// ─── Lightbox ────────────────────────────────────────────────────────────────

function LightboxContent({
  photos,
  startIndex,
  canEdit,
  projectId,
  onClose,
  onCategoryUpdate,
}: {
  photos: Photo[];
  startIndex: number;
  canEdit: boolean;
  projectId: string;
  onClose: () => void;
  onCategoryUpdate: (photoId: string, category: string) => void;
}) {
  const [idx, setIdx] = useState(startIndex);
  const [editingCategory, setEditingCategory] = useState(false);
  const [updating, setUpdating] = useState(false);

  const photo = photos[idx];
  if (!photo) return null;

  function prev() { setIdx(i => Math.max(0, i - 1)); setEditingCategory(false); }
  function next() { setIdx(i => Math.min(photos.length - 1, i + 1)); setEditingCategory(false); }

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "ArrowLeft") prev();
      if (e.key === "ArrowRight") next();
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  async function handleCategoryChange(newCategory: string) {
    setUpdating(true);
    try {
      await api.patch(`/api/v1/projects/${projectId}/photos/${photo.id}`, { category: newCategory });
      onCategoryUpdate(photo.id, newCategory);
      setEditingCategory(false);
    } catch {
      // silent
    } finally {
      setUpdating(false);
    }
  }

  const catStyle = CATEGORY_COLORS[photo.category] ?? CATEGORY_COLORS.other;

  return createPortal(
    <div
      style={{
        position: "fixed", inset: 0, zIndex: 10000,
        background: "rgba(0,0,0,0.92)",
        display: "flex", flexDirection: "column",
      }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      {/* Top bar */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 20px", flexShrink: 0 }}>
        <div style={{ color: "var(--text-muted)", fontSize: 13 }}>
          {idx + 1} / {photos.length}
        </div>
        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <a
            href={photo.url}
            download
            style={{ display: "flex", alignItems: "center", gap: 5, padding: "7px 12px", borderRadius: 8, fontSize: 12, fontWeight: 600, background: "rgba(255,255,255,0.1)", color: "var(--surface)", textDecoration: "none" }}
            onClick={e => e.stopPropagation()}
          >
            <Download size={13} /> Download
          </a>
          <button aria-label="Tutup galeri foto" onClick={onClose} style={{ background: "rgba(255,255,255,0.1)", border: "none", cursor: "pointer", color: "var(--surface)", padding: "8px", borderRadius: 8 }}>
            <X size={18} />
          </button>
        </div>
      </div>

      {/* Main image area */}
      <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 16, padding: "0 16px", minHeight: 0 }}>
        {/* Prev */}
        <button aria-label="Foto sebelumnya"
          onClick={prev}
          disabled={idx === 0}
          style={{ background: "rgba(255,255,255,0.1)", border: "none", cursor: idx === 0 ? "default" : "pointer", color: "var(--surface)", borderRadius: 10, padding: "10px 8px", opacity: idx === 0 ? 0.3 : 1, flexShrink: 0 }}
        >
          <ChevronLeft size={22} />
        </button>

        {/* Image */}
        <div style={{ flex: 1, display: "flex", justifyContent: "center", alignItems: "center", minHeight: 0, maxHeight: "calc(100vh - 200px)" }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={photo.url}
            alt={photo.caption ?? "Foto proyek"}
            style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain", borderRadius: 8 }}
          />
        </div>

        {/* Next */}
        <button aria-label="Foto berikutnya"
          onClick={next}
          disabled={idx === photos.length - 1}
          style={{ background: "rgba(255,255,255,0.1)", border: "none", cursor: idx === photos.length - 1 ? "default" : "pointer", color: "var(--surface)", borderRadius: 10, padding: "10px 8px", opacity: idx === photos.length - 1 ? 0.3 : 1, flexShrink: 0 }}
        >
          <ChevronRight size={22} />
        </button>
      </div>

      {/* Bottom info bar */}
      <div style={{
        background: "rgba(0,0,0,0.7)", padding: "14px 20px", flexShrink: 0,
        display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16,
      }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          {photo.caption && (
            <p style={{ color: "var(--surface)", fontSize: 13, fontWeight: 500, margin: "0 0 4px", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
              {photo.caption}
            </p>
          )}
          <p style={{ color: "var(--text-muted)", fontSize: 11, margin: 0 }}>
            {fmtDate(photo.taken_at ?? photo.uploaded_at)}
            {photo.uploader && ` · ${photo.uploader.name}`}
          </p>
        </div>

        {/* Category badge + edit */}
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
          {editingCategory ? (
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {["progress", "defect", "serah_terima", "other"].map(cat => (
                <button
                  key={cat}
                  onClick={() => handleCategoryChange(cat)}
                  disabled={updating}
                  style={{
                    padding: "5px 10px", borderRadius: 20, fontSize: 11, fontWeight: 600,
                    border: `2px solid ${photo.category === cat ? "var(--surface)" : "transparent"}`,
                    background: CATEGORY_COLORS[cat].bg, color: CATEGORY_COLORS[cat].color,
                    cursor: "pointer", opacity: updating ? 0.6 : 1,
                  }}
                >
                  {CATEGORY_LABEL[cat]}
                </button>
              ))}
              <button aria-label="Hapus foto" onClick={() => setEditingCategory(false)} style={{ padding: "5px 8px", borderRadius: 20, fontSize: 11, background: "rgba(255,255,255,0.1)", color: "var(--surface)", border: "none", cursor: "pointer" }}>
                <X size={11} />
              </button>
            </div>
          ) : (
            <>
              <span style={{ padding: "4px 10px", borderRadius: 20, fontSize: 11, fontWeight: 700, background: catStyle.bg, color: catStyle.color }}>
                {CATEGORY_LABEL[photo.category] ?? photo.category}
              </span>
              {canEdit && (
                <button
                  onClick={() => setEditingCategory(true)}
                  style={{ padding: "4px 8px", borderRadius: 6, fontSize: 11, background: "rgba(255,255,255,0.1)", color: "var(--text-muted)", border: "none", cursor: "pointer" }}
                >
                  Ganti
                </button>
              )}
            </>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}

function Lightbox(props: Parameters<typeof LightboxContent>[0]) {
  const [mounted, mount] = useReducer(() => true, false);
  useEffect(mount, []);
  if (!mounted) return null;
  return <LightboxContent {...props} />;
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function PhotoGallery({ projectId, userRole }: Props) {
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeCategory, setActiveCategory] = useState("semua");
  const [lightboxIdx, setLightboxIdx] = useState<number | null>(null);

  const canEdit = userRole === "admin" || userRole === "pm";

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get<{ data: Photo[] }>(`/api/v1/projects/${projectId}/photos`);
      setPhotos(res.data.data ?? []);
    } catch {
      setPhotos([]);
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => { load(); }, [load]);

  const filteredPhotos = activeCategory === "semua"
    ? photos
    : photos.filter(p => p.category === activeCategory);

  function handleCategoryUpdate(photoId: string, category: string) {
    setPhotos(prev => prev.map(p => p.id === photoId ? { ...p, category: category as Photo["category"] } : p));
  }

  // Count per category (for badges)
  const counts = photos.reduce<Record<string, number>>((acc, p) => {
    acc[p.category] = (acc[p.category] ?? 0) + 1;
    return acc;
  }, {});

  return (
    <div>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
        <div style={{
          width: 36, height: 36, borderRadius: 10,
          background: "linear-gradient(135deg, #003366, #0066CC)",
          display: "flex", alignItems: "center", justifyContent: "center",
        }}>
          <Images size={18} color="var(--surface)" />
        </div>
        <div>
          <h3 style={{ fontSize: 15, fontWeight: 700, color: C.text, margin: 0 }}>Galeri Foto</h3>
          <p style={{ fontSize: 11, color: C.muted, margin: 0 }}>{photos.length} foto dokumentasi lapangan</p>
        </div>
      </div>

      {/* Category tabs */}
      {photos.length > 0 && (
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 16 }}>
          {CATEGORIES.map(cat => {
            const count = cat.key === "semua" ? photos.length : (counts[cat.key] ?? 0);
            if (cat.key !== "semua" && count === 0) return null;
            const isActive = activeCategory === cat.key;
            return (
              <button
                key={cat.key}
                onClick={() => setActiveCategory(cat.key)}
                style={{
                  display: "flex", alignItems: "center", gap: 5,
                  padding: "6px 12px", borderRadius: 20, fontSize: 12, fontWeight: isActive ? 700 : 500,
                  border: `1px solid ${isActive ? cat.color : "var(--border)"}`,
                  background: isActive ? cat.bg : "var(--surface)",
                  color: isActive ? cat.color : C.mid,
                  cursor: "pointer", transition: "all 0.15s",
                }}
              >
                {cat.icon}
                {cat.label}
                <span style={{ fontSize: 11, opacity: 0.8 }}>({count})</span>
              </button>
            );
          })}
        </div>
      )}

      {loading ? (
        <div style={{ padding: "32px 0", textAlign: "center", fontSize: 13, color: C.muted }}>Memuat foto...</div>
      ) : photos.length === 0 ? (
        <div style={{
          padding: "40px 24px", textAlign: "center",
          border: "2px dashed #E5E7EB", borderRadius: 12, background: "#FAFAFA",
        }}>
          <Images size={32} color={C.muted} style={{ marginBottom: 12 }} />
          <p style={{ fontSize: 14, fontWeight: 600, color: C.text, marginBottom: 4 }}>Belum ada foto</p>
          <p style={{ fontSize: 12, color: C.muted }}>Foto akan muncul di sini setelah diupload melalui log progress</p>
        </div>
      ) : filteredPhotos.length === 0 ? (
        <div style={{ padding: "24px", textAlign: "center", fontSize: 13, color: C.muted }}>
          Tidak ada foto dengan kategori ini
        </div>
      ) : (
        <div style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))",
          gap: 10,
        }}>
          {filteredPhotos.map((photo) => {
            const globalIdx = photos.indexOf(photo);
            const catColor = CATEGORY_COLORS[photo.category] ?? CATEGORY_COLORS.other;
            return (
              <div
                key={photo.id}
                role="button"
                tabIndex={0}
                onClick={() => setLightboxIdx(globalIdx)}
                onKeyDown={e => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault()   // Spasi jangan menggulir galeri
                    setLightboxIdx(globalIdx)
                  }
                }}
                style={{
                  position: "relative", borderRadius: 10, overflow: "hidden",
                  cursor: "pointer", aspectRatio: "4/3",
                  border: "1px solid #E5E7EB",
                  boxShadow: "0 1px 4px rgba(0,0,0,0.06)",
                  transition: "transform 0.15s, box-shadow 0.15s",
                }}
                onMouseEnter={e => {
                  e.currentTarget.style.transform = "scale(1.02)";
                  e.currentTarget.style.boxShadow = "0 4px 16px rgba(0,0,0,0.12)";
                }}
                onMouseLeave={e => {
                  e.currentTarget.style.transform = "scale(1)";
                  e.currentTarget.style.boxShadow = "0 1px 4px rgba(0,0,0,0.06)";
                }}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={photo.url}
                  alt={photo.caption ?? "Foto proyek"}
                  style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
                  loading="lazy"
                />
                {/* Overlay gradient */}
                <div style={{
                  position: "absolute", inset: 0,
                  background: "linear-gradient(to top, rgba(0,0,0,0.6) 0%, transparent 60%)",
                }} />
                {/* Category badge */}
                <span style={{
                  position: "absolute", top: 7, right: 7,
                  padding: "2px 7px", borderRadius: 10, fontSize: 9, fontWeight: 700,
                  background: catColor.bg, color: catColor.color,
                }}>
                  {CATEGORY_LABEL[photo.category] ?? photo.category}
                </span>
                {/* Caption + date */}
                <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, padding: "8px 10px" }}>
                  {photo.caption && (
                    <p style={{ color: "var(--surface)", fontSize: 11, fontWeight: 600, margin: "0 0 2px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {photo.caption}
                    </p>
                  )}
                  <p style={{ color: "rgba(255,255,255,0.7)", fontSize: 10, margin: 0 }}>
                    {fmtDate(photo.taken_at ?? photo.uploaded_at)}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Lightbox */}
      {lightboxIdx !== null && (
        <Lightbox
          photos={photos}
          startIndex={lightboxIdx}
          canEdit={canEdit}
          projectId={projectId}
          onClose={() => setLightboxIdx(null)}
          onCategoryUpdate={handleCategoryUpdate}
        />
      )}
    </div>
  );
}
