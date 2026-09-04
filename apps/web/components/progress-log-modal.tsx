"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useTutupEsc } from "@/lib/use-tutup-esc";
import { createPortal } from "react-dom";
import { X, Loader2, ClipboardEdit, ImagePlus, Check, List, CalendarDays } from "lucide-react";
import { api, createProgressLog } from "@/lib/api";
import { uploadProgressPhoto } from "@/lib/storage";
import { Pilihan } from "@/components/pilihan";

// ─── Types ────────────────────────────────────────────────────────────────────

interface WorkScope {
  id: string;
  scope_name: string;
}

interface RabItem {
  id: string;
  name: string;
  category_code: string | null;
  weight_pct: number;
  progress_pct: number;
  parent_id: string | null;
  sort_order: number;
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

const WEATHER_OPTIONS = [
  { value: "cerah",        label: "Cerah",  emoji: "☀️" },
  { value: "berawan",      label: "Berawan", emoji: "⛅" },
  { value: "hujan_ringan", label: "Hujan",  emoji: "🌧️" },
  { value: "hujan_lebat",  label: "Lebat",  emoji: "⛈️" },
];

const todayISO = () => new Date().toISOString().split("T")[0];

// ─── Shared styles ────────────────────────────────────────────────────────────

const fieldInput: React.CSSProperties = {
  width: "100%",
  padding: "8px 12px",
  borderRadius: 10,
  border: "1px solid var(--border)",
  background: "var(--surface)",
  fontSize: 13,
  color: "var(--text-primary)",
  outline: "none",
  fontFamily: "inherit",
  boxSizing: "border-box",
  transition: "border-color 0.15s, box-shadow 0.15s",
};

const fieldLabel: React.CSSProperties = {
  display: "block",
  fontSize: 11,
  fontWeight: 600,
  color: "var(--text-muted)",
  textTransform: "uppercase",
  letterSpacing: "0.06em",
  marginBottom: 6,
};

// ─── Component ────────────────────────────────────────────────────────────────

export function ProgressLogModal({
  isOpen,
  onClose,
  projectId,
  workScopes = [],
  onSuccess,
}: ProgressLogModalProps) {
  useTutupEsc(onClose);
  // ── Mode ──────────────────────────────────────────────────────────────────
  const [mode, setMode] = useState<"daily" | "detail">("daily");

  // ── Common state ──────────────────────────────────────────────────────────
  const [loggedAt, setLoggedAt]       = useState(todayISO());
  const [weather, setWeather]         = useState("");
  const [description, setDescription] = useState("");
  const [workerCount, setWorkerCount] = useState("");
  const [notes, setNotes]             = useState("");
  const [photos, setPhotos]           = useState<PhotoEntry[]>([]);
  const [submitting, setSubmitting]   = useState(false);
  const [formError, setFormError]     = useState<string | null>(null);
  const [dragOver, setDragOver]       = useState(false);
  const [mounted, setMounted]         = useState(false);

  // ── Mode daily state ──────────────────────────────────────────────────────
  const [pctOverall, setPctOverall]   = useState("");
  const [workScopeId, setWorkScopeId] = useState("");

  // ── Mode detail state ─────────────────────────────────────────────────────
  const [rabItems, setRabItems]           = useState<RabItem[]>([]);
  const [loadingRab, setLoadingRab]       = useState(false);
  const [selectedRabId, setSelectedRabId] = useState("");
  const [pctCompletion, setPctCompletion] = useState("");
  const [submitResult, setSubmitResult]   = useState<{ newOverall: number | null } | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // `queueMicrotask`, bukan panggilan langsung: `setMounted()` menyetel state
  // pemuatan di baris pertamanya, dan setState SINKRON di dalam effect memicu
  // render kedua sebelum yang pertama selesai (react-hooks/set-state-in-effect).
  // Menunda satu microtask memindahkannya keluar dari fase render tanpa
  // menambah jeda yang terlihat.
  useEffect(() => { queueMicrotask(() => { void setMounted(true); }); }, []);

  // Load RAB items when mode=detail and modal opens
  useEffect(() => {
    if (mode === "detail" && isOpen && rabItems.length === 0) {
      setLoadingRab(true);
      api.get<{ data: RabItem[] }>(`/api/v1/projects/${projectId}/rab/items`)
        .then(res => setRabItems(res.data.data ?? []))
        .catch(() => {/* non-fatal */})
        .finally(() => setLoadingRab(false));
    }
  }, [mode, isOpen, projectId, rabItems.length]);

  // ── Reset ──────────────────────────────────────────────────────────────────

  const reset = () => {
    photos.forEach(p => URL.revokeObjectURL(p.previewUrl));
    setMode("daily");
    setLoggedAt(todayISO());
    setWeather("");
    setDescription("");
    setPctOverall("");
    setWorkerCount("");
    setWorkScopeId("");
    setNotes("");
    setPhotos([]);
    setSelectedRabId("");
    setPctCompletion("");
    setSubmitting(false);
    setFormError(null);
    setDragOver(false);
    setSubmitResult(null);
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

  // ── Upload photos helper ───────────────────────────────────────────────────

  async function uploadPhotos(): Promise<Array<{ url: string; caption?: string }> | null> {
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
        return null;
      }
    }
    return uploaded;
  }

  // ── Submit ─────────────────────────────────────────────────────────────────

  const handleSubmit = async () => {
    setFormError(null);
    setSubmitting(true);

    const uploaded = await uploadPhotos();
    if (uploaded === null) return;

    try {
      if (mode === "daily") {
        if (!description.trim()) {
          setFormError("Deskripsi kegiatan wajib diisi.");
          setSubmitting(false);
          return;
        }
        const pct = pctOverall !== "" ? parseFloat(pctOverall) : 0;
        if (isNaN(pct) || pct < 0 || pct > 100) {
          setFormError("Progress harus antara 0 dan 100.");
          setSubmitting(false);
          return;
        }

        const result = await createProgressLog(projectId, {
          mode: "daily",
          pct_overall: pct,
          weather: weather || undefined,
          worker_count: workerCount ? parseInt(workerCount, 10) : undefined,
          notes: `${description.trim()}${notes.trim() ? "\n\n" + notes.trim() : ""}` || undefined,
          logged_at: loggedAt ? new Date(loggedAt + "T08:00:00").toISOString() : undefined,
          photos: uploaded.length > 0 ? uploaded : undefined,
        });
        onSuccess(result.data);
        handleClose();

      } else {
        // mode=detail
        if (!selectedRabId) {
          setFormError("Pilih item pekerjaan RAB terlebih dahulu.");
          setSubmitting(false);
          return;
        }
        const pct = parseFloat(pctCompletion);
        if (isNaN(pct) || pct < 0 || pct > 100) {
          setFormError("Persentase selesai harus antara 0 dan 100.");
          setSubmitting(false);
          return;
        }

        const res = await api.post<{ data: unknown; new_overall_pct: number | null }>(
          `/api/v1/projects/${projectId}/progress-logs`,
          {
            mode: "detail",
            rab_item_id: selectedRabId,
            pct_completion: pct,
            weather: weather || undefined,
            worker_count: workerCount ? parseInt(workerCount, 10) : undefined,
            notes: `${description.trim() ? description.trim() + "\n\n" : ""}${notes.trim() || ""}`.trim() || undefined,
            logged_at: loggedAt ? new Date(loggedAt + "T08:00:00").toISOString() : undefined,
            photos: uploaded.length > 0 ? uploaded : undefined,
          }
        );

        // Show result before closing
        setSubmitResult({ newOverall: res.data.new_overall_pct });
        onSuccess(res.data.data);
        setTimeout(() => { handleClose(); }, 2000);
        setSubmitting(false);
        return;
      }
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Terjadi kesalahan.");
      setSubmitting(false);
    }
  };

  if (!isOpen || !mounted) return null;

  const selectedRabItem = rabItems.find(it => it.id === selectedRabId);
  const pctNum = pctOverall !== "" ? Math.min(Math.max(parseFloat(pctOverall) || 0, 0), 100) : null;
  const pctColor = pctNum === null ? "var(--navy)" : pctNum <= 30 ? "var(--danger)" : pctNum <= 70 ? "var(--warning)" : "var(--success)";
  const canSubmit = mode === "daily"
    ? description.trim().length > 0 && !submitting
    : selectedRabId !== "" && pctCompletion !== "" && !submitting;

  return createPortal(
    <>
      <div
        style={{ position: "fixed", inset: 0, zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: "16px" }}
        onClick={e => { if (e.target === e.currentTarget) handleClose(); }}
      >
        <div style={{ position: "absolute", inset: 0, background: "rgba(15,23,42,0.55)", backdropFilter: "blur(6px)", WebkitBackdropFilter: "blur(6px)" }} onClick={handleClose} />

        <div style={{ position: "relative", width: "100%", maxWidth: "580px", maxHeight: "92vh", backgroundColor: "var(--surface)", borderRadius: "20px", boxShadow: "var(--naik-3)", display: "flex", flexDirection: "column", overflow: "hidden" }}>
          <div style={{ height: 4, background: "linear-gradient(90deg, var(--navy), var(--aksen-terang))", flexShrink: 0 }} />

          {/* Header */}
          <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", padding: "20px 24px 16px", borderBottom: "1px solid #f1f5f9", flexShrink: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <div style={{ width: 40, height: 40, borderRadius: 10, flexShrink: 0, background: "linear-gradient(135deg, var(--navy), var(--aksen-terang))", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <ClipboardEdit size={18} color="white" />
              </div>
              <div>
                <h2 style={{ fontSize: 15, fontWeight: 600, color: "var(--text-primary)", fontFamily: "var(--font-display)", margin: 0 }}>Log Progress Lapangan</h2>
                <p style={{ fontSize: 12, color: "var(--text-muted)", margin: "2px 0 0" }}>Catat kegiatan &amp; dokumentasi hari ini</p>
              </div>
            </div>
            <button aria-label="Tutup dialog progres" onClick={handleClose} style={{ width: 32, height: 32, borderRadius: 6, border: "none", background: "var(--surface-subtle)", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--text-secondary)", flexShrink: 0 }}>
              <X size={15} />
            </button>
          </div>

          {/* Mode toggle */}
          <div style={{ padding: "14px 24px 0", flexShrink: 0 }}>
            <div style={{ display: "flex", gap: 0, borderRadius: 10, border: "1px solid var(--border)", overflow: "hidden", background: "var(--surface-subtle)" }}>
              {([
                { value: "daily", label: "Mode Harian", icon: CalendarDays, desc: "Log umum, tidak ubah % item" },
                { value: "detail", label: "Mode Detail / Item", icon: List, desc: "Pilih item RAB, isi % selesai" },
              ] as const).map(opt => (
                <button
                  key={opt.value}
                  onClick={() => { setMode(opt.value); setFormError(null); }}
                  style={{
                    flex: 1, padding: "8px 12px", border: "none", cursor: "pointer",
                    background: mode === opt.value ? "var(--navy)" : "transparent",
                    color: mode === opt.value ? "var(--surface)" : "var(--text-muted)",
                    transition: "all 0.15s",
                    display: "flex", alignItems: "center", gap: 8,
                  }}
                >
                  <opt.icon size={14} />
                  <div style={{ textAlign: "left" }}>
                    <div style={{ fontSize: 12, fontWeight: 600 }}>{opt.label}</div>
                    <div style={{ fontSize: 10 }}>{opt.desc}</div>
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Body */}
          <div style={{ overflowY: "auto", flex: 1, padding: "16px 24px" }}>
            <div style={{ display: "flex", flexDirection: "column", gap: "var(--gap-bagian)" }}>

              {/* Success result for detail mode */}
              {submitResult && (
                <div style={{ padding: "12px 16px", borderRadius: 10, background: "var(--success-bg)", border: "1px solid var(--success-border)", color: "var(--success)", fontSize: 13, fontWeight: 500, display: "flex", alignItems: "center", gap: 8 }}>
                  <Check size={16} />
                  Log tersimpan!{submitResult.newOverall !== null ? ` Progress proyek diperbarui ke ${submitResult.newOverall.toFixed(1)}%` : ""}
                </div>
              )}

              {/* Error */}
              {formError && (
                <div style={{ padding: "8px 12px", borderRadius: 10, background: "var(--danger-bg)", border: "1px solid var(--danger-border)", color: "var(--danger)", fontSize: 13 }}>
                  {formError}
                </div>
              )}

              {/* Tanggal & Cuaca */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <div>
                  <label htmlFor="logged-at" style={fieldLabel}>Tanggal *</label>
                  <input id="logged-at" type="date" value={loggedAt} max={todayISO()} onChange={e => setLoggedAt(e.target.value)} style={fieldInput}
                    onFocus={e => { e.target.style.borderColor = "var(--navy)"; e.target.style.boxShadow = "0 0 0 3px rgba(0,51,102,0.1)"; }}
                    onBlur={e => { e.target.style.borderColor = "var(--border)"; e.target.style.boxShadow = "none"; }} />
                </div>
                <div>
                  <span id="cuaca" style={fieldLabel}>Cuaca</span>
                  <div role="group" aria-labelledby="cuaca" style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                    {WEATHER_OPTIONS.map(w => (
                      <button key={w.value} type="button" onClick={() => setWeather(weather === w.value ? "" : w.value)}
                        style={{ padding: "4px 8px", borderRadius: 6, fontSize: 11, cursor: "pointer", border: `1px solid ${weather === w.value ? "var(--navy)" : "var(--border)"}`, background: weather === w.value ? "var(--navy)" : "var(--surface-subtle)", color: weather === w.value ? "white" : "var(--text-secondary)", fontWeight: weather === w.value ? 600 : 400, lineHeight: 1 }}>
                        {w.emoji} {w.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Mode daily: deskripsi + progress + scope */}
              {mode === "daily" && (
                <>
                  <div>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
                      <label htmlFor="description-2" style={{ ...fieldLabel, margin: 0 }}>Deskripsi Kegiatan *</label>
                      <span style={{ fontSize: 11, color: description.length > 450 ? "var(--danger)" : "var(--text-muted)" }}>{description.length}/500</span>
                    </div>
                    <textarea id="description-2" value={description} onChange={e => setDescription(e.target.value.slice(0, 500))} placeholder="Tuliskan kegiatan yang dilakukan hari ini…" rows={3}
                      style={{ ...fieldInput, resize: "vertical", minHeight: 80, lineHeight: 1.6 }}
                      onFocus={e => { e.target.style.borderColor = "var(--navy)"; e.target.style.boxShadow = "0 0 0 3px rgba(0,51,102,0.1)"; }}
                      onBlur={e => { e.target.style.borderColor = "var(--border)"; e.target.style.boxShadow = "none"; }} />
                  </div>

                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                    <div>
                      <label htmlFor="pct-overall" style={fieldLabel}>Progress Keseluruhan</label>
                      <div style={{ position: "relative" }}>
                        <input id="pct-overall" type="number" value={pctOverall} onChange={e => setPctOverall(e.target.value)} min={0} max={100} step={1} placeholder="0"
                          style={{ ...fieldInput, paddingRight: 36 }}
                          onFocus={e => { e.target.style.borderColor = "var(--navy)"; e.target.style.boxShadow = "0 0 0 3px rgba(0,51,102,0.1)"; }}
                          onBlur={e => { e.target.style.borderColor = "var(--border)"; e.target.style.boxShadow = "none"; }} />
                        <span style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", fontSize: 13, fontWeight: 600, color: "var(--text-muted)", pointerEvents: "none" }}>%</span>
                      </div>
                      {pctNum !== null && (
                        <div style={{ marginTop: 6, height: 5, background: "var(--surface-hover)", borderRadius: 99, overflow: "hidden" }}>
                          <div style={{ height: "100%", borderRadius: 99, transition: "width 0.3s ease", width: `${pctNum}%`, background: pctColor }} />
                        </div>
                      )}
                    </div>
                    <div>
                      {/* Label ini BERCABANG ke dua kontrol berbeda, jadi
                          `htmlFor`-nya ikut bercabang. Codemod `pasangkan-label`
                          memasang `htmlFor="work-scope-id"` di sini secara
                          otomatis; itu salah — saat tak ada scope, id itu
                          menunjuk elemen yang tak dirender, dan labelnya jadi
                          MATI (lebih buruk daripada tak berpasangan: pembaca
                          layar menyebut kaitan yang tak ada). */}
                      <label htmlFor={workScopes.length > 0 ? "work-scope-id" : "worker-count-tunggal"} style={fieldLabel}>{workScopes.length > 0 ? "Scope Pekerjaan" : "Jumlah Pekerja"}</label>
                      {workScopes.length > 0 ? (
                        <Pilihan id="work-scope-id" aria-label="Pilih lingkup pekerjaan" value={workScopeId} onChange={e => setWorkScopeId(e.target.value)} style={fieldInput}
                          onFocus={e => { e.target.style.borderColor = "var(--navy)"; }}
                          onBlur={e => { e.target.style.borderColor = "var(--border)"; }}>
                          <option value="">— Semua scope</option>
                          {workScopes.map(ws => <option key={ws.id} value={ws.id}>{ws.scope_name}</option>)}
                        </Pilihan>
                      ) : (
                        <input id="worker-count-tunggal" type="number" value={workerCount} onChange={e => setWorkerCount(e.target.value)} min={0} placeholder="0 orang" style={fieldInput}
                          onFocus={e => { e.target.style.borderColor = "var(--navy)"; e.target.style.boxShadow = "0 0 0 3px rgba(0,51,102,0.1)"; }}
                          onBlur={e => { e.target.style.borderColor = "var(--border)"; e.target.style.boxShadow = "none"; }} />
                      )}
                    </div>
                  </div>

                  {workScopes.length > 0 && (
                    <div>
                      <label htmlFor="worker-count" style={fieldLabel}>Jumlah Pekerja</label>
                      <input id="worker-count" type="number" value={workerCount} onChange={e => setWorkerCount(e.target.value)} min={0} placeholder="0 orang" style={fieldInput}
                        onFocus={e => { e.target.style.borderColor = "var(--navy)"; e.target.style.boxShadow = "0 0 0 3px rgba(0,51,102,0.1)"; }}
                        onBlur={e => { e.target.style.borderColor = "var(--border)"; e.target.style.boxShadow = "none"; }} />
                    </div>
                  )}
                </>
              )}

              {/* Mode detail: item RAB picker + % completion */}
              {mode === "detail" && (
                <>
                  <div style={{ padding: "12px 12px", borderRadius: 10, background: "var(--info-bg)", border: "1px solid var(--info-border)", fontSize: 12, color: "var(--info)" }}>
                    Mode ini mengubah progress item pekerjaan RAB secara langsung dan memperbarui progress keseluruhan proyek secara otomatis.
                  </div>

                  <div>
                    {/* `htmlFor` HANYA saat `<select>`-nya benar-benar dirender.
                        Dua cabang lain (memuat / RAB kosong) tak punya kontrol
                        sama sekali, dan `htmlFor` statis di sana menunjuk elemen
                        yang tak ada — label MATI, yang lebih buruk daripada tak
                        berpasangan karena pembaca layar menyebutkan kaitan palsu. */}
                    {/* `htmlFor` menunjuk sasaran yang BERBEDA per cabang, dan
                        selalu ada satu. Versi pertama memakai `undefined` untuk
                        dua cabang tanpa kontrol — itu membuat labelnya kembali
                        yatim, dan lint benar mempermasalahkannya. Memberi id
                        pada pesan statusnya membuat label tetap punya sasaran:
                        pembaca layar membacakan "Item Pekerjaan" lalu alasan
                        kenapa belum ada yang bisa dipilih. */}
                    <label
                      htmlFor={loadingRab ? "rab-item-memuat" : rabItems.length === 0 ? "rab-item-kosong" : "rab-item-pilihan"}
                      style={fieldLabel}
                    >Item Pekerjaan (dari RAB) *</label>
                    {loadingRab ? (
                      <div id="rab-item-memuat" style={{ padding: "8px 12px", fontSize: 13, color: "var(--text-muted)", border: "1px solid var(--border)", borderRadius: 10 }}>Memuat item RAB...</div>
                    ) : rabItems.length === 0 ? (
                      <div id="rab-item-kosong" style={{ padding: "8px 12px", fontSize: 13, color: "var(--danger)", background: "var(--danger-bg)", border: "1px solid var(--danger-border)", borderRadius: 10 }}>
                        Proyek ini belum memiliki RAB. Upload RAB Excel terlebih dahulu.
                      </div>
                    ) : (
                      <Pilihan id="rab-item-pilihan" aria-label="Pilih item RAB" value={selectedRabId} onChange={e => setSelectedRabId(e.target.value)} style={fieldInput}
                        onFocus={e => { e.target.style.borderColor = "var(--navy)"; }}
                        onBlur={e => { e.target.style.borderColor = "var(--border)"; }}>
                        <option value="">— Pilih item pekerjaan</option>
                        {rabItems.map(it => (
                          <option key={it.id} value={it.id}>
                            {it.category_code ? `${it.category_code}. ` : ""}{it.name} (bobot {it.weight_pct.toFixed(2)}%)
                          </option>
                        ))}
                      </Pilihan>
                    )}
                  </div>

                  {/* Preview info for selected item */}
                  {selectedRabItem && (
                    <div style={{ padding: "12px 12px", borderRadius: 10, background: "var(--surface-subtle)", border: "1px solid var(--border)", fontSize: 12 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                        <span style={{ color: "var(--text-muted)" }}>Progress saat ini</span>
                        <span style={{ fontWeight: 700, color: "var(--text-primary)" }}>{selectedRabItem.progress_pct.toFixed(0)}%</span>
                      </div>
                      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
                        <span style={{ color: "var(--text-muted)" }}>Bobot item ini</span>
                        <span style={{ fontWeight: 600, color: "var(--navy)" }}>{selectedRabItem.weight_pct.toFixed(3)}% dari total proyek</span>
                      </div>
                      {pctCompletion && !isNaN(parseFloat(pctCompletion)) && (
                        <div style={{ marginTop: 6, padding: "8px 8px", borderRadius: 6, background: "var(--info-bg)", border: "1px solid var(--info-border)" }}>
                          <span style={{ fontSize: 11, color: "var(--info)", fontWeight: 600 }}>
                            Mengatur item ini ke {parseFloat(pctCompletion).toFixed(0)}% akan mempengaruhi progress proyek sekitar ±{(Math.abs(parseFloat(pctCompletion) - selectedRabItem.progress_pct) * selectedRabItem.weight_pct / 100).toFixed(2)}%
                          </span>
                        </div>
                      )}
                    </div>
                  )}

                  <div>
                    <label htmlFor="pct-completion" style={fieldLabel}>Persentase Selesai Item Ini *</label>
                    <div style={{ position: "relative" }}>
                      <input id="pct-completion" type="number" value={pctCompletion} onChange={e => setPctCompletion(e.target.value)} min={0} max={100} step={1} placeholder="0"
                        style={{ ...fieldInput, paddingRight: 36, fontSize: 20, fontWeight: 700, textAlign: "center" }}
                        onFocus={e => { e.target.style.borderColor = "var(--navy)"; e.target.style.boxShadow = "0 0 0 3px rgba(0,51,102,0.1)"; }}
                        onBlur={e => { e.target.style.borderColor = "var(--border)"; e.target.style.boxShadow = "none"; }} />
                      <span style={{ position: "absolute", right: 14, top: "50%", transform: "translateY(-50%)", fontSize: 15, fontWeight: 700, color: "var(--text-muted)", pointerEvents: "none" }}>%</span>
                    </div>
                    {pctCompletion && !isNaN(parseFloat(pctCompletion)) && (
                      <div style={{ marginTop: 6, height: 6, background: "var(--surface-hover)", borderRadius: 99, overflow: "hidden" }}>
                        <div style={{ height: "100%", borderRadius: 99, width: `${Math.min(100, Math.max(0, parseFloat(pctCompletion)))}%`, background: parseFloat(pctCompletion) >= 100 ? "var(--success)" : parseFloat(pctCompletion) >= 60 ? "var(--navy)" : parseFloat(pctCompletion) >= 30 ? "var(--warning)" : "var(--danger)", transition: "width 0.3s ease" }} />
                      </div>
                    )}
                  </div>

                  <div>
                    <label htmlFor="description" style={fieldLabel}>Deskripsi / Catatan</label>
                    <textarea id="description" value={description} onChange={e => setDescription(e.target.value)} placeholder="Apa yang dikerjakan pada item ini hari ini..." rows={2}
                      style={{ ...fieldInput, resize: "vertical", lineHeight: 1.6 }}
                      onFocus={e => { e.target.style.borderColor = "var(--navy)"; e.target.style.boxShadow = "0 0 0 3px rgba(0,51,102,0.1)"; }}
                      onBlur={e => { e.target.style.borderColor = "var(--border)"; e.target.style.boxShadow = "none"; }} />
                  </div>

                  <div>
                    <label htmlFor="worker-count-2" style={fieldLabel}>Jumlah Pekerja</label>
                    <input id="worker-count-2" type="number" value={workerCount} onChange={e => setWorkerCount(e.target.value)} min={0} placeholder="0 orang" style={fieldInput}
                      onFocus={e => { e.target.style.borderColor = "var(--navy)"; e.target.style.boxShadow = "0 0 0 3px rgba(0,51,102,0.1)"; }}
                      onBlur={e => { e.target.style.borderColor = "var(--border)"; e.target.style.boxShadow = "none"; }} />
                  </div>
                </>
              )}

              {/* Foto Dokumentasi (both modes) */}
              <div>
                {/*
                  `<span id>`, bukan `<label>`: isian filenya `display: none`,
                  jadi janji "klik label untuk fokus ke isian" tak bisa
                  ditepati. Yang benar-benar diklik orang adalah dropzone di
                  bawah — dan ia `role="button"`, jadi label ini disambungkan
                  ke sana lewat `aria-labelledby`.
                */}
                <span id="foto-dokumentasi" style={fieldLabel}>Foto Dokumentasi</span>
                {photos.length < 5 && (
                  <div
                    role="button"
                    aria-labelledby="foto-dokumentasi"
                    tabIndex={0}
                    onKeyDown={e => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault()   // Spasi jangan menggulir modal
                        fileInputRef.current?.click()
                      }
                    }}
                    onDragOver={e => { e.preventDefault(); setDragOver(true); }}
                    onDragLeave={() => setDragOver(false)}
                    onDrop={e => { e.preventDefault(); setDragOver(false); addFiles(e.dataTransfer.files); }}
                    onClick={() => fileInputRef.current?.click()}
                    style={{ border: `2px dashed ${dragOver ? "var(--navy)" : "var(--data-diam)"}`, borderRadius: 14, padding: "20px 16px", textAlign: "center", cursor: "pointer", transition: "all 0.15s", background: dragOver ? "var(--info-bg)" : "var(--surface-subtle)", marginBottom: photos.length > 0 ? 10 : 0 }}
                  >
                    <ImagePlus size={24} style={{ color: dragOver ? "var(--navy)" : "var(--text-muted)", margin: "0 auto 6px" }} />
                    <p style={{ fontSize: 13, fontWeight: 600, color: dragOver ? "var(--navy)" : "var(--text-secondary)", margin: "0 0 3px" }}>Tambah Foto</p>
                    <p style={{ fontSize: 11, color: "var(--text-muted)", margin: 0 }}>Drag &amp; drop atau klik · maks 5 foto, 10MB/foto</p>
                  </div>
                )}
                <input ref={fileInputRef} type="file" accept="image/*" multiple style={{ display: "none" }} onChange={e => { if (e.target.files) { addFiles(e.target.files); e.target.value = ""; } }} />
                {photos.length > 0 && (
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
                    {photos.map(entry => (
                      <div key={entry.id} style={{ borderRadius: 10, overflow: "hidden", border: "1px solid var(--border)", background: "var(--surface)" }}>
                        <div style={{ position: "relative", aspectRatio: "1", background: "var(--surface-hover)" }}>
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={entry.previewUrl} alt="preview" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
                          {entry.uploading && (
                            <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                              <Loader2 size={22} style={{ color: "var(--surface)", animation: "spin 0.8s linear infinite" }} />
                            </div>
                          )}
                          {entry.uploadedUrl && !entry.uploading && (
                            <div style={{ position: "absolute", inset: 0, background: "rgba(16,185,129,0.25)", display: "flex", alignItems: "flex-start", justifyContent: "flex-end", padding: 4 }}>
                              <div style={{ width: 18, height: 18, borderRadius: "50%", background: "var(--success)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                                <Check size={11} color="white" strokeWidth={3} />
                              </div>
                            </div>
                          )}
                          {!entry.uploading && (
                            <button aria-label="Hapus foto" type="button" onClick={() => removePhoto(entry.id)}
                              style={{ position: "absolute", top: 4, right: 4, width: 20, height: 20, borderRadius: "50%", border: "none", background: "rgba(220,38,38,0.9)", color: "white", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
                              <X size={10} strokeWidth={2.5} />
                            </button>
                          )}
                        </div>
                        <div style={{ padding: "4px 6px" }}>
                          <input type="text" placeholder="Keterangan foto…" value={entry.caption} onChange={e => patchPhoto(entry.id, { caption: e.target.value })}
                            style={{ width: "100%", fontSize: 11, padding: "2px 4px", border: "1px solid var(--border)", borderRadius: 6, outline: "none", color: "var(--text-secondary)", fontFamily: "inherit", boxSizing: "border-box", background: "var(--surface-subtle)" }} />
                          {entry.error && <p style={{ fontSize: 10, color: "var(--danger)", margin: "2px 0 0" }}>{entry.error}</p>}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Catatan Tambahan (mode daily only in detail section, always for daily) */}
              {mode === "daily" && (
                <div>
                  <label htmlFor="notes" style={fieldLabel}>Catatan Tambahan</label>
                  <textarea id="notes" value={notes} onChange={e => setNotes(e.target.value)} placeholder="Kendala, temuan, atau hal penting lainnya…" rows={2}
                    style={{ ...fieldInput, resize: "vertical", lineHeight: 1.6 }}
                    onFocus={e => { e.target.style.borderColor = "var(--navy)"; e.target.style.boxShadow = "0 0 0 3px rgba(0,51,102,0.1)"; }}
                    onBlur={e => { e.target.style.borderColor = "var(--border)"; e.target.style.boxShadow = "none"; }} />
                </div>
              )}

            </div>
          </div>

          {/* Footer */}
          <div style={{ padding: "12px 24px", borderTop: "1px solid #f1f5f9", background: "var(--surface-subtle)", display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0 }}>
            <span style={{ fontSize: 12, color: "var(--text-muted)" }}>
              {photos.length > 0 ? `${photos.length} foto terpilih` : mode === "detail" ? "Pilih item RAB dan isi % selesai" : "Foto bersifat opsional"}
            </span>
            <div style={{ display: "flex", gap: 8 }}>
              <button type="button" onClick={handleClose} disabled={submitting}
                style={{ padding: "8px 16px", borderRadius: 10, border: "1px solid var(--border)", background: "var(--surface)", fontSize: 13, fontWeight: 500, color: "var(--text-secondary)", cursor: "pointer" }}>
                Batal
              </button>
              <button type="button" onClick={handleSubmit} disabled={!canSubmit}
                style={{ padding: "8px 20px", borderRadius: 10, border: "none", fontSize: 13, fontWeight: 600, background: !canSubmit ? "var(--text-muted)" : submitting ? "var(--text-secondary)" : "var(--navy)", color: "white", cursor: !canSubmit ? "not-allowed" : "pointer", display: "flex", alignItems: "center", gap: 6, transition: "background 0.15s", minWidth: 120, justifyContent: "center" }}
                onMouseEnter={e => { if (canSubmit) e.currentTarget.style.background = "var(--aksen-pekat)"; }}
                onMouseLeave={e => { if (canSubmit) e.currentTarget.style.background = "var(--navy)"; }}>
                {submitting
                  ? <><Loader2 size={13} style={{ animation: "spin 1s linear infinite" }} /> Menyimpan…</>
                  : <><Check size={13} /> {mode === "detail" ? "Simpan & Update Progress" : "Simpan Log"}</>
                }
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
    </>,
    document.body
  );
}
