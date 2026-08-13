"use client";

import { useEffect, useState } from "react";
import { useTutupEsc } from "@/lib/use-tutup-esc";
import { createPortal } from "react-dom";
import { api } from "@/lib/api";
import { type Penugasan, type LogProgres, type ProyekRingkas, pesanGalat } from "../_bersama/tipe";
import { kirimLapangan } from "@/lib/kirim-lapangan";
import { ambilLokasi } from "@/lib/lokasi-perangkat";
import { uploadProgressPhoto, attachProgressPhoto } from "@/lib/storage";
import { Plus, Image, X, Check, Loader2, AlertCircle, Calendar, MapPin } from "lucide-react";

import { C } from "@/lib/warna-ui";
import { antrekan as antrekanFoto, tautkanKeLog, companyAktif } from "@/lib/antrean-foto";

function fmtDate(s: string | null) {
  if (!s) return "—";
  return new Date(s).toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric" });
}

const WEATHER_OPTIONS = [
  { value: "cerah",        label: "Cerah ☀️"  },
  { value: "berawan",      label: "Berawan ⛅" },
  { value: "hujan_ringan", label: "Hujan 🌧️"  },
  { value: "hujan_lebat",  label: "Lebat ⛈️"  },
];

interface PhotoEntry { id: string; file: File; previewUrl: string; caption: string; uploading: boolean; uploadedUrl: string | null; error: string | null; }

export default function MandorProgressPage() {
  const [assignments, setAssignments] = useState<Penugasan[]>([]);
  const [logs, setLogs] = useState<LogProgres[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  // Modal di portal ini tak punya prop `onClose` — ia dikendalikan state
  // lokal — sehingga penjaga `modal-esc-ratchet` tak menjangkaunya, dan
  // kelima modal portal mandor menjebak pemakai keyboard tanpa terdeteksi.
  // Penjaganya ikut diperluas; ini perbaikan kodenya.
  useTutupEsc(showModal ? () => setShowModal(false) : null);
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null);

  // Form state
  const [projectId, setProjectId] = useState("");
  const [scopeId, setScopeId] = useState("");
  const [logDate, setLogDate] = useState(new Date().toISOString().split("T")[0]);
  const [notes, setNotes] = useState("");
  const [weather, setWeather] = useState("cerah");
  const [workersCount, setWorkersCount] = useState("");
  const [photos, setPhotos] = useState<PhotoEntry[]>([]);
  const [saving, setSaving] = useState(false);
  // Foto yang gagal terupload padahal log SUDAH tersimpan → bisa dicoba ulang
  // tanpa mengetik ulang laporan (lihat handleSubmit).
  const [retry, setRetry] = useState<{ logId: string; items: PhotoEntry[] } | null>(null);
  /**
   * Kenapa lokasi GAGAL diambil — ditampilkan, tidak ditelan.
   *
   * Mandor yang menolak izin lalu melihat fotonya tak bertitik lokasi berhak
   * tahu sebabnya. Diam membuat orang mengira fiturnya rusak.
   */
  const [pesanLokasi, setPesanLokasi] = useState<string | null>(null);

  function showToast(msg: string, ok = true) {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 3500);
  }

  function loadData() {
    return Promise.all([
      api.get("/api/v1/mandor/assignments"),
      api.get("/api/v1/projects?limit=100"),
    ]).then(([aRes]) => {
      setAssignments(aRes.data?.assignments ?? []);
    }).finally(() => setLoading(false));
  }

  function loadLogs(pid: string) {
    if (!pid) return;
    api.get(`/api/v1/projects/${pid}/progress-logs`).then((res) => {
      setLogs(res.data?.logs ?? []);
    });
  }

  useEffect(() => { loadData(); }, []);

  // Available projects from assignments
  // `filter(Boolean)` TIDAK menyempitkan tipe di TypeScript — ia tetap
  // `(ProyekRingkas | null | undefined)[]`. Selama `assignments` bertipe
  // `any[]`, hal itu tak terlihat; begitu bertipe, compiler menunjukkan bahwa
  // `p.id` di baris berikutnya bisa meledak pada penugasan tanpa proyek.
  const projects = assignments
    .map((a) => a.project)
    .filter((p): p is ProyekRingkas => Boolean(p))
    .filter((p, i, arr) => arr.findIndex((x) => x.id === p.id) === i);

  // Scopes for selected project
  const projectScopes = projectId
    ? assignments.filter((a) => a.project?.id === projectId).flatMap((a) => (a.work_scopes ?? []).filter((s) => s.status === "active"))
    : [];

  function handlePhotoAdd(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    const entries: PhotoEntry[] = files.map((f) => ({
      id: Math.random().toString(36).slice(2),
      file: f,
      previewUrl: URL.createObjectURL(f),
      caption: "",
      uploading: false,
      uploadedUrl: null,
      error: null,
    }));
    setPhotos((prev) => [...prev, ...entries]);
    e.target.value = "";
  }

  function removePhoto(id: string) {
    setPhotos((prev) => prev.filter((p) => p.id !== id));
  }

  /** Coba upload ulang foto yang gagal, tautkan ke log yang sudah tersimpan. */
  async function retryFailedPhotos() {
    if (!retry || !projectId) return;
    setSaving(true);
    const stillFailed: PhotoEntry[] = [];
    for (const ph of retry.items) {
      try {
        await attachProgressPhoto(projectId, retry.logId, ph.file, ph.caption || undefined);
      } catch {
        stillFailed.push(ph);
      }
    }
    setSaving(false);
    if (stillFailed.length === 0) {
      setRetry(null); setPhotos([]);
      showToast("Semua foto berhasil diupload");
    } else {
      setRetry({ logId: retry.logId, items: stillFailed });
      setPhotos(stillFailed);
      showToast(`${stillFailed.length} foto masih gagal — coba lagi saat sinyal membaik`, false);
    }
    loadLogs(projectId);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!projectId || !notes) return;
    setSaving(true);
    try {
      // Upload foto. Kegagalan foto TIDAK membatalkan laporan: mandor sering di lokasi
      // bersinyal buruk dan foto (file besar) jauh lebih rentan gagal daripada teks.
      // All-or-nothing = laporan harian hilang gara-gara foto. Foto = tabel terpisah
      // (project_photos.progress_log_id nullable) sehingga log sah tanpa foto.
      // ── Geotag ──
      //
      // Diambil SEKALI untuk seluruh foto satu laporan, bukan per foto: lima
      // foto berturut-turut di titik kerja yang sama menghasilkan lima
      // penguncian GPS dan lima kali menunggu, untuk koordinat yang praktis
      // identik.
      //
      // Diambil SEBELUM unggah, bukan sesudah: kalau sesudah, mandor sudah
      // menunggu unggahan selesai lalu menunggu GPS lagi.
      //
      // Gagal TIDAK membatalkan apa pun — foto tanpa geotag tetap berguna,
      // foto yang tak terunggah tidak (`lokasi-perangkat.ts`).
      const lokasi = await ambilLokasi();
      setPesanLokasi(lokasi.gagal);

      const uploadedPhotos: { url: string; caption: string }[] = [];
      const failedPhotos: PhotoEntry[] = [];
      for (const ph of photos) {
        setPhotos((prev) => prev.map((p) => p.id === ph.id ? { ...p, uploading: true, error: null } : p));
        try {
          const url = await uploadProgressPhoto(projectId, ph.file);
          uploadedPhotos.push({ url, caption: ph.caption });
          setPhotos((prev) => prev.map((p) => p.id === ph.id ? { ...p, uploading: false, uploadedUrl: url } : p));
        } catch (e) {
          const msg = e instanceof Error ? e.message : "Gagal upload";
          setPhotos((prev) => prev.map((p) => p.id === ph.id ? { ...p, uploading: false, error: msg } : p));
          failedPhotos.push(ph);

          // ── Foto yang gagal MASUK ANTREAN yang bertahan ─────────────────
          //
          // Sampai 2026-08-13 daftar coba-ulang hanya hidup di `useState`.
          // Mandor menutup aplikasi — atau baterainya habis, atau ponselnya
          // membunuh tab di latar, yang lumrah pada ponsel lama di lapangan —
          // dan fotonya LENYAP. Yang tersisa laporan tanpa bukti visual, dan
          // pemotretan ulang yang sudah tak mungkin: betonnya sudah tertutup.
          //
          // `logId` sengaja null di sini: lognya belum tentu terkirim. Ia
          // ditautkan sesudah log berhasil (`tautkanKeLog` di bawah).
          const antre = await antrekanFoto({
            company: companyAktif(),
            projectId,
            logId: null,
            file: ph.file,
            keterangan: ph.caption,
          });
          if (!antre.ok) {
            // Gagal MENGANTRE dikatakan apa adanya. Menyamarkannya membuat
            // mandor menutup aplikasi mengira fotonya aman.
            showToast(antre.sebab, false);
          }
        }
      }

      // F4-3 — teks laporan lewat antrean offline.
      //
      // FOTO kini ikut diantre — lewat antrean TERPISAH (`antrean-foto.ts`,
      // IndexedDB), bukan antrean teks ini.
      //
      // Terpisah karena bentuk kegagalannya berbeda: teks kecil dan urutannya
      // MENGIKAT (laporan minggu ke-2 tak boleh mendahului ke-1), foto besar
      // dan urutannya tidak. Menggabungkannya berarti satu foto 5 MB menahan
      // seluruh laporan teks di belakangnya.
      //
      // Catatan lama di sini menyatakan foto "punya jalur coba-ulang sendiri".
      // Itu benar hanya selama halaman terbuka — diukur 2026-08-13, daftarnya
      // hidup di `useState` dan lenyap begitu aplikasi ditutup.
      //
      // Antrean menyimpan URL foto yang SUDAH berhasil terunggah, jadi saat
      // sinyal kembali, laporan tetap membawa fotonya.
      const hasil = await kirimLapangan(
        "POST", `/api/v1/projects/${projectId}/progress-logs`,
        {
          pct_overall: 0,
          weather: weather || undefined,
          worker_count: workersCount ? Number(workersCount) : undefined,
          notes: notes || undefined,
          logged_at: logDate ? new Date(logDate + "T08:00:00").toISOString() : undefined,
          photos: uploadedPhotos.map((p) => ({
            url: p.url,
            caption: p.caption || undefined,
            // Koordinat hanya disertakan bila benar-benar didapat. Server
            // menyaringnya lagi (`barisGeotag`), tapi mengirim yang jelas
            // kosong membuat badan permintaan penuh null tanpa arti.
            ...(lokasi.lintang !== null && lokasi.bujur !== null
              ? {
                  lintang: lokasi.lintang,
                  bujur: lokasi.bujur,
                  akurasi_m: lokasi.akurasi_m ?? undefined,
                  sumber_lokasi: lokasi.sumber_lokasi,
                }
              : {}),
          })),
        },
        "Progress berhasil dicatat", "Gagal menyimpan progress",
      );

      if (!hasil.aman) {
        // Form dibiarkan terisi — catatan harian tak boleh hilang.
        showToast(hasil.pesan, false);
        return;
      }

      if (!hasil.terkirim) {
        // Diantre: `logId` belum ada, jadi jalur coba-ulang foto (yang butuh
        // logId) belum bisa dipakai. Foto yang gagal DIPERTAHANKAN di form
        // supaya mandor tak kehilangannya.
        showToast(hasil.pesan, true);
        setShowModal(false);
        setNotes(""); setWorkersCount(""); setScopeId("");
        setPhotos(failedPhotos);
        setRetry(null);
        return;
      }

      const created = hasil.data as { data?: { id?: string } } | undefined;
      const logId = created?.data?.id;
      setShowModal(false);
      setNotes(""); setWorkersCount(""); setScopeId("");

      if (logId) {
        // Foto yang tertahan di antrean menunggu inilah: tanpa logId mereka
        // tak tahu harus menempel ke mana, dan tertahan selamanya.
        await tautkanKeLog(companyAktif(), projectId, logId);
      }

      if (failedPhotos.length > 0 && logId) {
        // Laporan AMAN tersimpan; foto yang gagal bisa dicoba ulang tanpa mengetik ulang.
        setPhotos(failedPhotos);
        setRetry({ logId, items: failedPhotos });
        showToast(`Progress TERSIMPAN, tapi ${failedPhotos.length} foto GAGAL terupload — coba upload ulang.`, false);
      } else {
        setPhotos([]);
        setRetry(null);
        showToast("Progress berhasil dicatat");
      }
      loadLogs(projectId);
    } catch (err: unknown) {
      showToast(pesanGalat(err, "Gagal menyimpan progress"), false);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={{ maxWidth: 800, margin: "0 auto" }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
        <h1 style={{ fontSize: 20, fontWeight: 700, color: C.text, margin: 0 }}>Input Progress</h1>
        <button
          onClick={() => setShowModal(true)}
          style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 16px", borderRadius: 6, background: "var(--grad-aksen)", color: "var(--surface)", border: "none", cursor: "pointer", fontSize: 13, fontWeight: 600 }}
        >
          <Plus size={15} />
          Input Progress
        </button>
      </div>

      {/* Lokasi tak terambil — dinyatakan, tidak ditelan.
          `role="status"`, bukan `alert`: ini bukan kegagalan yang menuntut
          tindakan. Foto sudah terkirim; yang tak ada hanya titik lokasinya,
          dan kalimatnya sendiri sudah mengatakan itu. */}
      {pesanLokasi && (
        <div role="status" style={{
          marginBottom: 14, padding: "10px 12px", borderRadius: 8, fontSize: 12.5,
          lineHeight: 1.5, border: "1px solid var(--info-border)",
          background: "var(--info-bg)", color: "var(--info)",
          display: "flex", alignItems: "flex-start", gap: 8,
        }}>
          <MapPin size={15} style={{ flexShrink: 0, marginTop: 1 }} aria-hidden="true" />
          <span>{pesanLokasi}</span>
        </div>
      )}

      {/* Banner: laporan sudah tersimpan, tapi sebagian foto gagal terupload.
          Mandor bisa coba ulang tanpa mengetik ulang laporan. */}
      {retry && retry.items.length > 0 && (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap", padding: "12px 12px", marginBottom: 16, borderRadius: 10, background: "var(--warning-bg)", border: "1px solid var(--warning-border)" }}>
          <div style={{ fontSize: 13, color: C.text, lineHeight: 1.5 }}>
            <strong>Progress sudah tersimpan.</strong> {retry.items.length} foto gagal terupload
            (kemungkinan sinyal lemah). Laporanmu aman — foto bisa dicoba lagi.
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button
              onClick={retryFailedPhotos}
              disabled={saving}
              style={{ padding: "8px 12px", borderRadius: 6, background: "var(--grad-aksen)", color: "var(--surface)", border: "none", cursor: saving ? "default" : "pointer", fontSize: 13, fontWeight: 600, opacity: saving ? 0.7 : 1 }}
            >
              {saving ? "Mengupload…" : "Coba upload ulang"}
            </button>
            <button
              onClick={() => { setRetry(null); setPhotos([]); }}
              disabled={saving}
              style={{ padding: "8px 12px", borderRadius: 6, background: "transparent", border: `1px solid ${C.border}`, color: C.mid, cursor: "pointer", fontSize: 13 }}
            >
              Lewati
            </button>
          </div>
        </div>
      )}

      {/* Project selector for log history */}
      <div style={{ marginBottom: 16 }}>
        <select aria-label="Proyek"
          value={projectId}
          onChange={(e) => { setProjectId(e.target.value); loadLogs(e.target.value); }}
          style={{ padding: "8px 12px", borderRadius: 6, border: `1px solid ${C.border}`, fontSize: 13, color: C.text, background: "var(--surface)", minWidth: 220 }}
        >
          <option value="">Pilih proyek untuk lihat history</option>
          {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
      </div>

      {/* Log history */}
      {!loading && projectId && logs.length === 0 && (
        <div style={{ background: C.surface, borderRadius: 10, padding: 40, border: `1px solid ${C.border}`, textAlign: "center" }}>
          <AlertCircle size={28} color={C.muted} style={{ marginBottom: 8 }} />
          <div style={{ fontSize: 13, color: C.mid }}>Belum ada catatan progress</div>
        </div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {logs.map((log) => (
          <div key={log.id} style={{ background: C.surface, borderRadius: 10, padding: "16px 20px", border: `1px solid ${C.border}`, boxShadow: "var(--naik-1)" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
              <Calendar size={14} color={C.mid} />
              <span style={{ fontSize: 13, fontWeight: 600, color: C.text }}>{fmtDate(log.log_date ?? null)}</span>
              {log.weather && <span style={{ fontSize: 12, color: C.mid }}>· {log.weather}</span>}
              {log.worker_count && <span style={{ fontSize: 12, color: C.mid }}>· {log.worker_count} pekerja</span>}
            </div>
            <p style={{ fontSize: 13, color: C.text, margin: "0 0 8px", lineHeight: 1.6 }}>{log.notes}</p>
            {(log.project_photos ?? []).length > 0 && (
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {(log.project_photos ?? []).map((ph) => (
                  <a key={ph.id} href={ph.photo_url ?? undefined} target="_blank" rel="noopener noreferrer">
                    <img src={ph.photo_url ?? undefined} alt={ph.caption ?? "foto"} style={{ width: 80, height: 80, objectFit: "cover", borderRadius: 6, border: `1px solid ${C.border}` }} />
                  </a>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Modal */}
      {showModal && typeof window !== "undefined" && createPortal(
        <div style={{ position: "fixed", inset: 0, zIndex: 9999, display: "flex", alignItems: "flex-start", justifyContent: "center", padding: 16, paddingTop: 40, overflowY: "auto" }}>
          <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)" }} onClick={() => setShowModal(false)} />
          <div style={{ position: "relative", background: C.surface, borderRadius: 14, width: "100%", maxWidth: 520, boxShadow: "var(--naik-3)", zIndex: 1 }}>
            <div style={{ padding: "20px 24px", borderBottom: `1px solid ${C.border}`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <h2 style={{ fontSize: 15, fontWeight: 700, color: C.text, margin: 0 }}>Input Progress Harian</h2>
              <button aria-label="Tutup input progress harian" onClick={() => setShowModal(false)} style={{ background: "none", border: "none", cursor: "pointer", color: C.mid }}><X size={20} /></button>
            </div>
            <form onSubmit={handleSubmit} style={{ padding: 24, display: "flex", flexDirection: "column", gap: 16 }}>
              <div>
                <label htmlFor="project-id" style={{ fontSize: 13, fontWeight: 600, color: C.text, display: "block", marginBottom: 6 }}>Proyek *</label>
                <select id="project-id" aria-label="Proyek"
                  value={projectId}
                  onChange={(e) => { setProjectId(e.target.value); setScopeId(""); }}
                  required
                  style={{ width: "100%", padding: "8px 12px", borderRadius: 6, border: `1px solid ${C.border}`, fontSize: 13, color: C.text, background: "var(--surface)" }}
                >
                  <option value="">Pilih proyek...</option>
                  {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </div>

              {projectScopes.length > 0 && (
                <div>
                  <label htmlFor="scope-id" style={{ fontSize: 13, fontWeight: 600, color: C.text, display: "block", marginBottom: 6 }}>Scope (opsional)</label>
                  <select id="scope-id" aria-label="Pilih lingkup pekerjaan"
                    value={scopeId}
                    onChange={(e) => setScopeId(e.target.value)}
                    style={{ width: "100%", padding: "8px 12px", borderRadius: 6, border: `1px solid ${C.border}`, fontSize: 13, color: C.text, background: "var(--surface)" }}
                  >
                    <option value="">Semua scope</option>
                    {projectScopes.map((s) => <option key={s.id} value={s.id}>{s.scope_name}</option>)}
                  </select>
                </div>
              )}

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <div>
                  <label htmlFor="log-date" style={{ fontSize: 13, fontWeight: 600, color: C.text, display: "block", marginBottom: 6 }}>Tanggal</label>
                  <input id="log-date" aria-label="Tanggal" type="date" value={logDate} onChange={(e) => setLogDate(e.target.value)} style={{ width: "100%", padding: "8px 12px", borderRadius: 6, border: `1px solid ${C.border}`, fontSize: 13, boxSizing: "border-box" }} />
                </div>
                <div>
                  <label htmlFor="weather" style={{ fontSize: 13, fontWeight: 600, color: C.text, display: "block", marginBottom: 6 }}>Cuaca</label>
                  <select id="weather" aria-label="Cuaca hari ini" value={weather} onChange={(e) => setWeather(e.target.value)} style={{ width: "100%", padding: "8px 12px", borderRadius: 6, border: `1px solid ${C.border}`, fontSize: 13, color: C.text, background: "var(--surface)" }}>
                    {WEATHER_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </div>
              </div>

              <div>
                <label htmlFor="workers-count" style={{ fontSize: 13, fontWeight: 600, color: C.text, display: "block", marginBottom: 6 }}>Jumlah Pekerja</label>
                <input id="workers-count" type="number" min="0" placeholder="Opsional" value={workersCount} onChange={(e) => setWorkersCount(e.target.value)} style={{ width: "100%", padding: "8px 12px", borderRadius: 6, border: `1px solid ${C.border}`, fontSize: 13, boxSizing: "border-box" }} />
              </div>

              <div>
                <label htmlFor="notes" style={{ fontSize: 13, fontWeight: 600, color: C.text, display: "block", marginBottom: 6 }}>Catatan Pekerjaan *</label>
                <textarea id="notes" placeholder="Deskripsikan pekerjaan hari ini..." value={notes} onChange={(e) => setNotes(e.target.value)} required rows={4} style={{ width: "100%", padding: "8px 12px", borderRadius: 6, border: `1px solid ${C.border}`, fontSize: 13, resize: "vertical", boxSizing: "border-box" }} />
              </div>

              {/* Photo upload */}
              <div>
                <label style={{ fontSize: 13, fontWeight: 600, color: C.text, display: "block", marginBottom: 6 }}>Foto Dokumentasi</label>
                {photos.length > 0 && (
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 8 }}>
                    {photos.map((ph) => (
                      <div key={ph.id} style={{ position: "relative" }}>
                        <img src={ph.previewUrl} alt="" style={{ width: 72, height: 72, objectFit: "cover", borderRadius: 6, border: `1px solid ${C.border}` }} />
                        {ph.uploading && (
                          <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,0.4)", borderRadius: 6 }}>
                            <Loader2 size={18} color="var(--surface)" style={{ animation: "spin 1s linear infinite" }} />
                          </div>
                        )}
                        {ph.uploadedUrl && (
                          <div style={{ position: "absolute", bottom: 2, right: 2, background: C.green, borderRadius: 10, padding: 2 }}>
                            <Check size={10} color="var(--surface)" />
                          </div>
                        )}
                        {!ph.uploading && !ph.uploadedUrl && (
                          <button aria-label="Hapus foto" type="button" onClick={() => removePhoto(ph.id)} style={{ position: "absolute", top: -6, right: -6, background: C.red, border: "none", borderRadius: "50%", width: 18, height: 18, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
                            <X size={10} color="var(--surface)" />
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                )}
                <label style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 12px", borderRadius: 6, border: `1px dashed ${C.border}`, cursor: "pointer", fontSize: 13, color: C.mid }}>
                  <Image size={16} />
                  Tambah foto
                  <input type="file" accept="image/*" multiple onChange={handlePhotoAdd} style={{ display: "none" }} />
                </label>
              </div>

              <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                <button type="button" onClick={() => setShowModal(false)} style={{ padding: "8px 16px", borderRadius: 6, border: `1px solid ${C.border}`, background: "var(--surface)", cursor: "pointer", fontSize: 13, color: C.mid }}>
                  Batal
                </button>
                <button type="submit" disabled={saving} style={{ padding: "8px 20px", borderRadius: 6, background: "var(--grad-aksen)", color: "var(--surface)", border: "none", cursor: saving ? "not-allowed" : "pointer", fontSize: 13, fontWeight: 600, opacity: saving ? 0.7 : 1 }}>
                  {saving ? "Menyimpan..." : "Simpan Progress"}
                </button>
              </div>
            </form>
          </div>
        </div>,
        document.body
      )}

      {toast && typeof window !== "undefined" && createPortal(
        <div style={{ position: "fixed", bottom: 80, left: "50%", transform: "translateX(-50%)", zIndex: 10000, padding: "12px 20px", borderRadius: 10, background: toast.ok ? "var(--success)" : C.red, color: "var(--surface)", fontSize: 13, fontWeight: 500, boxShadow: "var(--naik-2)", whiteSpace: "nowrap" }}>
          {toast.msg}
        </div>,
        document.body
      )}

      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
