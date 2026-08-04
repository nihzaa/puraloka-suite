"use client";

import { useState } from "react";
import { useTutupEsc } from "@/lib/use-tutup-esc";
import { Sun, CloudRain, Cloud, CloudLightning, Trash2, X, Camera, ChevronDown } from "lucide-react";
import type { ProgressLog } from "@/lib/api";
import { deleteProgressLog } from "@/lib/api";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ProgressLogListProps {
  logs: ProgressLog[];
  loading?: boolean;
  hasMore?: boolean;
  onLoadMore?: () => void;
  onDeleted?: (logId: string) => void;
  projectId: string;
  userRole?: string;
  userId?: string;
}

// ─── Design tokens ────────────────────────────────────────────────────────────

import { C } from "@/lib/warna-ui";

// ─── Helpers ──────────────────────────────────────────────────────────────────

const MONTHS_SHORT = ["Jan","Feb","Mar","Apr","Mei","Jun","Jul","Agu","Sep","Okt","Nov","Des"];

function parseDateParts(dateStr: string) {
  const d = new Date(dateStr);
  return { day: d.getDate(), month: MONTHS_SHORT[d.getMonth()], year: d.getFullYear() };
}

function fmtDateLong(dateStr: string) {
  return new Date(dateStr).toLocaleDateString("id-ID", {
    weekday: "long", day: "numeric", month: "long", year: "numeric",
  });
}

function fmtTime(dateStr: string) {
  return new Date(dateStr).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" });
}

const WEATHER_META: Record<string, { icon: React.ReactNode; label: string }> = {
  cerah:        { icon: <Sun size={12} />, label: "Cerah" },
  berawan:      { icon: <Cloud size={12} />, label: "Berawan" },
  hujan_ringan: { icon: <CloudRain size={12} />, label: "Hujan Ringan" },
  hujan_lebat:  { icon: <CloudLightning size={12} />, label: "Hujan Lebat" },
};

// ─── Lightbox ─────────────────────────────────────────────────────────────────

function Lightbox({ url, onClose }: { url: string; onClose: () => void }) {
  useTutupEsc(onClose);
  return (
    <div
      style={{
        position: "fixed", inset: 0, zIndex: 2000, background: "rgba(0,0,0,0.92)",
        display: "flex", alignItems: "center", justifyContent: "center",
      }}
      onClick={onClose}
    >
      <button aria-label="Tutup daftar progres"
        onClick={onClose}
        style={{
          position: "absolute", top: 20, right: 20, width: 40, height: 40,
          borderRadius: "50%", border: "none", background: "rgba(255,255,255,0.15)",
          color: "var(--surface)", cursor: "pointer", display: "flex", alignItems: "center",
          justifyContent: "center", zIndex: 1,
        }}
      >
        <X size={20} />
      </button>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={url}
        alt="Foto lapangan"
        style={{
          maxWidth: "90vw", maxHeight: "90vh", objectFit: "contain",
          borderRadius: 8, boxShadow: "0 0 60px rgba(0,0,0,0.5)",
        }}
        onClick={e => e.stopPropagation()}
      />
    </div>
  );
}

// ─── Photo grid ───────────────────────────────────────────────────────────────

/**
 * Foto yang membuka lightbox — sebagai TOMBOL, bukan `<img onClick>`.
 *
 * Foto-foto di `PhotoGrid` semula `<img>` polos dengan `onClick`: bisa diklik
 * dengan tetikus, tak bisa dijangkau sama sekali dengan keyboard — tak dapat
 * fokus, tak menanggapi Enter/Space, dan pembaca layar tak menyebutnya sebagai
 * sesuatu yang bisa ditekan.
 *
 * `<button>` menyelesaikan ketiganya sekaligus tanpa menambal `role`/`tabIndex`/
 * `onKeyDown` satu per satu — browser sudah tahu apa itu tombol. Teks caption
 * dipakai untuk menamainya, jadi yang terdengar "Lihat foto: cor lantai 2",
 * bukan sekadar "tombol".
 *
 * Didefinisikan di tingkat MODUL, bukan di dalam `PhotoGrid`: komponen yang
 * lahir ulang tiap render membuat React melepas lalu memasang kembali seluruh
 * pohon anaknya — fokus keyboard hilang di tengah jalan, yang justru merusak
 * hal yang sedang diperbaiki di sini.
 */
function FotoLightboxTombol({
  url, caption, onBuka,
}: { url: string; caption?: string | null; onBuka: (url: string) => void }) {
  return (
    <button
      type="button"
      onClick={() => onBuka(url)}
      aria-label={`Lihat foto${caption ? `: ${caption}` : ""} ukuran penuh`}
      style={{
        padding: 0, border: "none", background: "none", cursor: "pointer",
        width: "100%", height: "100%", display: "block", borderRadius: 8,
      }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={url}
        alt={caption ?? "Foto progres"}
        style={{ width: "100%", height: "100%", objectFit: "cover", borderRadius: 8, display: "block" }}
      />
    </button>
  );
}

function PhotoGrid({ photos }: { photos: ProgressLog["photos"] }) {
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);

  if (!photos || photos.length === 0) return null;

  const cellStyle = (extra?: React.CSSProperties): React.CSSProperties => ({
    overflow: "hidden", borderRadius: 8, position: "relative", background: "var(--surface-hover)",
    ...extra,
  });

  let gridContent: React.ReactNode;

  if (photos.length === 1) {
    gridContent = (
      <div style={{ ...cellStyle(), aspectRatio: "16/9" }}>
        <FotoLightboxTombol url={photos[0].url} caption={photos[0].caption} onBuka={setLightboxUrl} />
      </div>
    );
  } else if (photos.length === 2) {
    gridContent = (
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
        {photos.map(p => (
          <div key={p.id} style={{ ...cellStyle(), aspectRatio: "4/3" }}>
            <FotoLightboxTombol url={p.url} caption={p.caption} onBuka={setLightboxUrl} />
          </div>
        ))}
      </div>
    );
  } else if (photos.length === 3) {
    gridContent = (
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <div style={{ ...cellStyle(), aspectRatio: "16/9" }}>
          <FotoLightboxTombol url={photos[0].url} caption={photos[0].caption} onBuka={setLightboxUrl} />
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
          {photos.slice(1).map(p => (
            <div key={p.id} style={{ ...cellStyle(), aspectRatio: "4/3" }}>
              <FotoLightboxTombol url={p.url} caption={p.caption} onBuka={setLightboxUrl} />
            </div>
          ))}
        </div>
      </div>
    );
  } else {
    // 4+ photos: 2x2 grid, last cell shows "+N"
    const visible = photos.slice(0, 4);
    const extra = photos.length - 4;
    gridContent = (
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
        {visible.map((p, i) => (
          <div key={p.id} style={{ ...cellStyle(), aspectRatio: "4/3" }}>
            <FotoLightboxTombol url={p.url} caption={p.caption} onBuka={setLightboxUrl} />
            {i === 3 && extra > 0 && (
              <div
                style={{
                  position: "absolute", inset: 0, background: "rgba(0,0,0,0.55)",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  cursor: "pointer", borderRadius: 8,
                }}
                onClick={() => setLightboxUrl(photos[3].url)}
              >
                <span style={{ color: "var(--surface)", fontSize: 22, fontWeight: 700 }}>+{extra}</span>
              </div>
            )}
          </div>
        ))}
      </div>
    );
  }

  return (
    <>
      <div style={{ marginTop: 12 }}>{gridContent}</div>
      {lightboxUrl && <Lightbox url={lightboxUrl} onClose={() => setLightboxUrl(null)} />}
    </>
  );
}

// ─── Skeleton ─────────────────────────────────────────────────────────────────

function LogSkeleton() {
  return (
    <div style={{ display: "flex", gap: 16, paddingBottom: 20, position: "relative" }}>
      <div style={{ width: 44, flexShrink: 0, display: "flex", flexDirection: "column", alignItems: "center" }}>
        <div style={{
          width: 44, height: 52, borderRadius: 10,
          background: "linear-gradient(90deg, var(--surface-hover) 0%, var(--border) 50%, var(--surface-hover) 100%)",
          backgroundSize: "200% 100%", animation: "shimmer 1.5s ease-in-out infinite",
        }} />
      </div>
      <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 8 }}>
        <div style={{ height: 16, width: "40%", borderRadius: 6, background: "linear-gradient(90deg, var(--surface-hover) 0%, var(--border) 50%, var(--surface-hover) 100%)", backgroundSize: "200% 100%", animation: "shimmer 1.5s ease-in-out infinite" }} />
        <div style={{ height: 80, borderRadius: 12, background: "linear-gradient(90deg, var(--surface-hover) 0%, var(--border) 50%, var(--surface-hover) 100%)", backgroundSize: "200% 100%", animation: "shimmer 1.5s ease-in-out infinite" }} />
      </div>
    </div>
  );
}

// ─── Single log card ──────────────────────────────────────────────────────────

function LogCard({
  log, projectId, userRole, userId, onDeleted, isLast,
}: {
  log: ProgressLog;
  projectId: string;
  userRole?: string;
  userId?: string;
  onDeleted?: (id: string) => void;
  isLast: boolean;
}) {
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const canDelete =
    userRole === "admin" ||
    userRole === "pm" ||
    (userRole === "mandor" && log.reporter?.id === userId);

  const { day, month } = parseDateParts(log.logged_at);
  const weather = log.weather ? WEATHER_META[log.weather] : null;

  const handleDelete = async () => {
    setDeleting(true);
    try {
      await deleteProgressLog(projectId, log.id);
      onDeleted?.(log.id);
    } catch {
      setDeleting(false);
      setConfirmDelete(false);
    }
  };

  return (
    <div style={{ display: "flex", gap: 0, paddingBottom: isLast ? 0 : 20, position: "relative" }}>
      {/* Vertical line */}
      {!isLast && (
        <div style={{
          position: "absolute", left: 21, top: 56, bottom: 0,
          width: 2, background: C.border,
        }} />
      )}

      {/* Date badge */}
      <div style={{ flexShrink: 0, marginRight: 16, display: "flex", flexDirection: "column", alignItems: "center" }}>
        <div style={{
          width: 44, background: C.navy, borderRadius: 10, padding: "6px 0",
          display: "flex", flexDirection: "column", alignItems: "center",
          boxShadow: "0 2px 8px rgba(0,51,102,0.2)",
        }}>
          <span style={{ fontSize: 22, fontWeight: 800, color: "var(--surface)", lineHeight: 1.1, fontFamily: "var(--font-display)" }}>
            {day}
          </span>
          <span style={{ fontSize: 10, fontWeight: 600, color: "rgba(255,255,255,0.7)", letterSpacing: "0.05em", textTransform: "uppercase" }}>
            {month}
          </span>
        </div>
      </div>

      {/* Card */}
      <div style={{
        flex: 1, background: "var(--surface)", border: `1px solid ${C.border}`,
        borderRadius: 12, boxShadow: "0 1px 4px rgba(0,0,0,0.05)", overflow: "hidden",
      }}>
        {/* Card header */}
        <div style={{
          padding: "12px 16px", borderBottom: `1px solid var(--surface-hover)`,
          display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8,
        }}>
          <div style={{ flex: 1 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              <span style={{ fontSize: 11, color: C.muted }}>
                {fmtDateLong(log.logged_at)} · {fmtTime(log.logged_at)}
              </span>
              {log.reporter && (
                <span style={{
                  fontSize: 11, color: C.navy, fontWeight: 600,
                  padding: "1px 7px", borderRadius: 99, background: C.navyLight,
                }}>
                  {log.reporter.name}
                </span>
              )}
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
              {/* Progress badge */}
              <span style={{
                fontSize: 12, fontWeight: 700, padding: "3px 10px", borderRadius: 99,
                color: "var(--on-success-bg)", background: "var(--success-bg)", border: "1px solid #A7F3D0",
              }}>
                {log.pct_overall}% selesai
              </span>

              {/* Weather badge */}
              {weather && (
                <span style={{
                  display: "inline-flex", alignItems: "center", gap: 4,
                  fontSize: 11, color: C.mid, padding: "2px 8px",
                  borderRadius: 99, background: "var(--surface-subtle)", border: `1px solid ${C.border}`,
                }}>
                  {weather.icon} {weather.label}
                </span>
              )}

              {/* Worker count */}
              {log.worker_count !== null && log.worker_count !== undefined && (
                <span style={{ fontSize: 11, color: C.muted }}>
                  👷 {log.worker_count} pekerja
                </span>
              )}
            </div>
          </div>

          {/* Delete button */}
          {canDelete && !confirmDelete && (
            <button aria-label="Hapus catatan progres"
              onClick={() => setConfirmDelete(true)}
              style={{
                width: 28, height: 28, borderRadius: 8, border: "none",
                background: "var(--danger-bg)", cursor: "pointer",
                display: "flex", alignItems: "center", justifyContent: "center",
                color: C.red, flexShrink: 0,
              }}
            >
              <Trash2 size={13} />
            </button>
          )}

          {/* Confirm delete */}
          {confirmDelete && (
            <div style={{ display: "flex", gap: 6, alignItems: "center", flexShrink: 0 }}>
              <span style={{ fontSize: 11, color: C.red }}>Hapus log ini?</span>
              <button
                onClick={handleDelete}
                disabled={deleting}
                style={{
                  padding: "4px 10px", borderRadius: 6, border: "none",
                  background: C.red, color: "var(--surface)", fontSize: 11, fontWeight: 600,
                  cursor: deleting ? "not-allowed" : "pointer",
                }}
              >
                {deleting ? "..." : "Ya"}
              </button>
              <button
                onClick={() => setConfirmDelete(false)}
                disabled={deleting}
                style={{
                  padding: "4px 10px", borderRadius: 6, border: `1px solid ${C.border}`,
                  background: "var(--surface)", color: C.mid, fontSize: 11, cursor: "pointer",
                }}
              >
                Batal
              </button>
            </div>
          )}
        </div>

        {/* Card body */}
        <div style={{ padding: "12px 16px" }}>
          {/* Notes */}
          {log.notes && (
            <p style={{ fontSize: 13, color: C.mid, lineHeight: 1.6, margin: 0 }}>
              {log.notes}
            </p>
          )}

          {/* Photos */}
          {(log.photos?.length ?? 0) > 0 && (
            <PhotoGrid photos={log.photos} />
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export function ProgressLogList({
  logs,
  loading,
  hasMore,
  onLoadMore,
  onDeleted,
  projectId,
  userRole,
  userId,
}: ProgressLogListProps) {
  if (loading && logs.length === 0) {
    return (
      <div style={{ padding: "4px 0" }}>
        {[1, 2, 3].map(n => <LogSkeleton key={n} />)}
        <style>{`@keyframes shimmer { 0% { background-position: -200% center; } 100% { background-position: 200% center; } }`}</style>
      </div>
    );
  }

  if (!loading && logs.length === 0) {
    return (
      <div style={{
        display: "flex", flexDirection: "column", alignItems: "center", gap: 12,
        padding: "40px 16px", color: C.muted,
      }}>
        <div style={{
          width: 56, height: 56, borderRadius: "50%",
          background: "var(--surface-hover)", display: "flex", alignItems: "center", justifyContent: "center",
        }}>
          <Camera size={24} style={{ color: "var(--border-strong)" }} />
        </div>
        <p style={{ fontSize: 14, fontWeight: 600, color: "var(--text-secondary)", margin: 0 }}>
          Belum ada log progress
        </p>
        <p style={{ fontSize: 13, color: C.muted, margin: 0, textAlign: "center", maxWidth: 280 }}>
          Tambahkan log progress lapangan untuk mendokumentasikan perkembangan proyek.
        </p>
      </div>
    );
  }

  return (
    <div>
      <div style={{ paddingTop: 4 }}>
        {logs.map((log, idx) => (
          <LogCard
            key={log.id}
            log={log}
            projectId={projectId}
            userRole={userRole}
            userId={userId}
            onDeleted={onDeleted}
            isLast={idx === logs.length - 1}
          />
        ))}
      </div>

      {hasMore && (
        <div style={{ display: "flex", justifyContent: "center", marginTop: 8 }}>
          <button
            onClick={onLoadMore}
            style={{
              display: "inline-flex", alignItems: "center", gap: 6,
              padding: "9px 18px", borderRadius: 10, border: `1px solid ${C.border}`,
              background: "var(--surface)", fontSize: 13, fontWeight: 500, color: C.mid,
              cursor: "pointer",
            }}
          >
            <ChevronDown size={15} />
            Muat log sebelumnya
          </button>
        </div>
      )}
    </div>
  );
}
