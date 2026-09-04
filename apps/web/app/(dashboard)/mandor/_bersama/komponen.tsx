"use client";

/**
 * MODAL BERSAMA — modul Mandor.
 *
 * Dua belas modal yang sebelumnya menumpang di `page.tsx` yang sama dengan
 * ketujuh tab. Sesudah pemecahan, sebagian dipakai lebih dari satu rute:
 *
 *   WageReportDetailModal  — /mandor (ringkasan) DAN /mandor/upah
 *   CreateWageReportModal  — /mandor/upah
 *   AddKasbonModal         — /mandor/kasbon
 *   WorkerFormModal        — /mandor/tukang
 *   ScopeDetailModal &c    — /mandor/penugasan
 *
 * Menyalinnya ke tiap halaman berarti dua formulir yang mengirim payload
 * berbeda ke endpoint yang sama — persis kelas cacat yang `keuangan/_bersama`
 * dibuat untuk mencegah.
 *
 * Isinya dipindahkan APA ADANYA. Yang berubah hanya `export` di depan tiap
 * fungsi dan impor yang dulu berbagi lingkup berkas.
 *
 * `<table>` mentah di `WageReportDetailModal` sempat dibiarkan apa adanya di
 * sini, dengan alasan yang benar untuk saat itu: menukar komponen tabel
 * adalah perubahan perilaku (markup, gaya, urutan sel) yang tak boleh
 * menyelinap ke dalam pemecahan berkas yang seharusnya nol-perubahan.
 *
 * UI-0-4 (2026-08-07) adalah pekerjaan yang berwenang melakukannya, dan
 * tabel itu sekarang memakai `<Tabel>`. Alasan tiap perbedaan tampilan
 * ditulis di komentar tepat di atas komponennya, bukan di sini — supaya
 * yang membacanya sedang melihat kodenya.
 */

import { useEffect, useState } from "react";
import { useTerpasang } from "@/lib/use-terpasang";
import { createPortal } from "react-dom";
import {
  Plus, XCircle, Banknote, FileText, Clock, RefreshCw,
  X, Trash2, Check, Camera,
  CalendarCheck,
} from "lucide-react";
import { api } from "@/lib/api";
import { useTutupEsc } from "@/lib/use-tutup-esc";
import { useUnits } from "@/lib/use-units";
import { useWorkCategories } from "@/lib/use-work-categories";
import { useKasbonPurposes } from "@/lib/use-kasbon-purposes";
import { uploadKasbonPhoto } from "@/lib/storage";
import { C } from "@/lib/warna-ui";
import { Tabel } from "@/components/dasar";
import { Pilihan } from "@/components/pilihan";
import {
  type Assignment, type Worker, type WorkerKasbon, type WageItem,
  type WageReportDetail, type MandorScope, type ScopeDetail,
  type ProgressPayment, type CashAccount, type SettlementModalState,
  type MandorUser, type ScopeItem,
  fmt, fmtDate, fmtDateShort, getMondayOfWeek,
  REPORT_STATUS, PAYMENT_SYSTEM, CATEGORY_LABELS, CATEGORY_COLORS,
  SKILL_OPTIONS, getPaymentSystemBadge, getProgressColor,
} from "./tipe";
import { formatRupiah } from "@/lib/format";
import { GAYA_ISIAN } from "@/components/isian";
import { kabari } from "@/components/tanya";

/**
 * Penjaga pemasangan modal.
 *
 * `createPortal` butuh `document.body`, yang tak ada di server. Merender
 * modal pada lintasan pertama membuat HTML server dan klien berbeda, dan
 * React membuang seluruh pohonnya.
 */
/**
 * Alias tipis ke `useTerpasang` — dipakai belasan kali di berkas ini,
 * jadi namanya dipertahankan supaya pemanggilnya tak perlu disentuh.
 *
 * Isinya kini `useSyncExternalStore`, bukan `useReducer` + efek: pola lama
 * memaksa render kedua pada tiap modal yang dibuka, dan memicu dua
 * peringatan lint sekaligus. Lihat lib/use-terpasang.ts.
 */
export const useMounted = useTerpasang;

// ─── Modal: Buat Laporan Upah ─────────────────────────────────────────────────
export function CreateWageReportModal({ onClose, onSuccess }: {
  onClose: () => void;
  onSuccess: () => void;
}) {
  useTutupEsc(onClose);
  const mounted = useMounted();
  useEffect(() => { document.body.style.overflow = "hidden"; return () => { document.body.style.overflow = ""; }; }, []);

  // Load assignments fresh di dalam modal
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [loadingAssignments, setLoadingAssignments] = useState(true);
  // Load kasbons fresh saat modal buka (bukan dari prop, agar selalu up-to-date)
  const [kasbons, setKasbons] = useState<WorkerKasbon[]>([]);

  // `loadingAssignments` sudah lahir `true`; efek ini hanya jalan sekali ([]),
  // jadi menyetelnya ulang di sini cuma memicu render bertingkat.
  useEffect(() => {
    Promise.all([
      api.get<{ assignments: Assignment[] }>("/api/v1/mandor/assignments"),
      api.get<{ kasbons: WorkerKasbon[] }>("/api/v1/mandor/worker-kasbons"),
    ]).then(([asgRes, kbRes]) => {
        setAssignments(asgRes.data.assignments);
        setKasbons(kbRes.data.kasbons ?? []);
        // Kalau mandor dan hanya punya 1 assignment, auto-select
        if (asgRes.data.assignments.length === 1) {
          setAssignmentId(asgRes.data.assignments[0].id);
        }
      })
      .catch(() => {})
      .finally(() => setLoadingAssignments(false));
  }, []);

  const [assignmentId, setAssignmentId] = useState("");
  const [scopeId, setScopeId] = useState("");
  const [weekStart, setWeekStart] = useState(getMondayOfWeek(new Date()));
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // Wage items
  const [items, setItems] = useState([{ worker_name: "", days_worked: "7", daily_rate: "125000", overtime_hours: "", overtime_rate: "15000" }]);
  // Deductions — support kolektif dan individu
  const [deductions, setDeductions] = useState<Array<{
    tipe: "kasbon_kolektif" | "kasbon_individu";
    label: string;
    amount: string;
    worker_kasbon_id: string;
    worker_name: string;
  }>>([]);

  const selectedAssignment = assignments.find(a => a.id === assignmentId);
  const availableScopes = selectedAssignment?.work_scopes ?? [];
  const projectKasbons = kasbons.filter(k =>
    selectedAssignment && k.project?.id === selectedAssignment.project?.id
  );

  const [memuatAbsensi, setMemuatAbsensi] = useState(false);

  /**
   * Isi rincian tukang dari catatan absensi minggu ini.
   *
   * Ini alasan modul absensi ada: `days_worked` seharusnya BERASAL dari
   * catatan harian, bukan diketik ulang dari ingatan. Formulir ini lahir
   * dengan default keras `"7"` — angka yang benar hanya kalau tak seorang
   * pun libur sepanjang minggu.
   *
   * MENGGANTI, bukan menambah: dua sumber angka untuk hal yang sama akan
   * berbeda suatu hari, dan yang salah tak akan ketahuan sampai tukang
   * menagih. Tarif harian yang sudah diisi DIPERTAHANKAN — absensi mencatat
   * kehadiran, bukan upah.
   */
  async function ambilDariAbsensi() {
    if (!scopeId) return;
    setMemuatAbsensi(true);
    setError("");
    try {
      const akhir = new Date(weekStart);
      akhir.setDate(akhir.getDate() + 6);
      const r = await api.get<{
        rekap: Array<{ worker_id: string; nama: string; hari: number; lembur: number }>;
      }>("/api/v1/absensi/rekap", {
        params: { scope_id: scopeId, dari: weekStart, sampai: akhir.toISOString().slice(0, 10) },
      });
      const rekap = r.data.rekap ?? [];
      if (rekap.length === 0) {
        // Kekosongan dinyatakan, bukan dibiarkan terlihat seperti "berhasil
        // tapi tak ada yang berubah". Tanpa pesan ini, orang menekan tombolnya
        // berkali-kali dan menyimpulkan fiturnya rusak.
        setError("Belum ada absensi tercatat untuk minggu ini. Isi di menu Absensi Lapangan lebih dulu.");
        return;
      }
      // Tarif lama dipertahankan per NAMA — mandor sering sudah mengisi tarif
      // sebelum menekan tombol ini.
      const tarifLama = new Map(items.map((i) => [i.worker_name, i]));
      setItems(rekap.map((k) => {
        const lama = tarifLama.get(k.nama);
        return {
          worker_name: k.nama,
          days_worked: String(k.hari),
          daily_rate: lama?.daily_rate ?? "125000",
          overtime_hours: k.lembur > 0 ? String(k.lembur) : "",
          overtime_rate: lama?.overtime_rate ?? "15000",
        };
      }));
    } catch (e: unknown) {
      const m = (e as { response?: { data?: { error?: string } } })?.response?.data?.error;
      setError(m ?? "Gagal mengambil rekap absensi");
    } finally {
      setMemuatAbsensi(false);
    }
  }

  function addItem() {
    setItems(prev => [...prev, { worker_name: "", days_worked: "7", daily_rate: "125000", overtime_hours: "", overtime_rate: "15000" }]);
  }
  function removeItem(i: number) {
    setItems(prev => prev.filter((_, idx) => idx !== i));
  }
  function updateItem(i: number, key: string, val: string) {
    setItems(prev => prev.map((item, idx) => idx === i ? { ...item, [key]: val } : item));
  }
  function addDeduction() {
    setDeductions(prev => [...prev, { tipe: "kasbon_kolektif", label: "Potong BON", amount: "", worker_kasbon_id: "", worker_name: "" }]);
  }
  function removeDeduction(i: number) {
    setDeductions(prev => prev.filter((_, idx) => idx !== i));
  }
  function updateDeduction(i: number, key: string, val: string) {
    setDeductions(prev => prev.map((d, idx) => idx === i ? { ...d, [key]: val } : d));
  }

  // Auto-fill kasbon amount saat pilih worker_kasbon
  function onKasbonSelect(i: number, kasbonId: string) {
    const kb = projectKasbons.find(k => k.id === kasbonId);
    const remaining = kb ? kb.amount - kb.amount_settled : 0;
    setDeductions(prev => prev.map((d, idx) => idx === i
      ? { ...d, worker_kasbon_id: kasbonId, amount: remaining.toString(), label: kb ? `Potong BON - ${kb.worker?.name}` : d.label }
      : d
    ));
  }

  // Hitung totals
  const subtotal = items.reduce((s, item) => {
    const days = parseFloat(item.days_worked || "0");
    const rate = parseFloat(item.daily_rate || "0");
    const ot = parseFloat(item.overtime_hours || "0");
    const otRate = parseFloat(item.overtime_rate || "0");
    return s + (days * rate) + (ot * otRate);
  }, 0);
  const totalDed = deductions.reduce((s, d) => s + (parseFloat(d.amount || "0")), 0);
  const net = Math.max(subtotal - totalDed, 0);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault(); setError("");
    if (!assignmentId || !scopeId) { setError("Pilih mandor dan scope pekerjaan"); return; }
    if (items.some(i => !i.worker_name || !i.daily_rate)) { setError("Nama tukang dan tarif harian wajib diisi"); return; }
    setLoading(true);
    try {
      await api.post("/api/v1/mandor/wage-reports", {
        assignment_id: assignmentId,
        scope_id: scopeId,
        week_start: weekStart,
        notes: notes || undefined,
        items: items.map(i => ({
          worker_name: i.worker_name,
          days_worked: parseFloat(i.days_worked || "0"),
          daily_rate: parseFloat(i.daily_rate || "0"),
          overtime_hours: parseFloat(i.overtime_hours || "0"),
          overtime_rate: parseFloat(i.overtime_rate || "0"),
        })),
        deductions: deductions.length > 0 ? deductions.map(d => ({
          tipe: d.tipe,
          label: d.label,
          amount: parseFloat(d.amount || "0"),
          worker_kasbon_id: d.worker_kasbon_id || undefined,
          worker_name: d.tipe === "kasbon_individu" ? (d.worker_name || undefined) : undefined,
        })) : undefined,
      });
      onSuccess();
    } catch (err: unknown) {
      setError((err as any)?.response?.data?.error ?? "Gagal membuat laporan");
    } finally { setLoading(false); }
  }

  
  if (!mounted) return null;
  return createPortal(
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", zIndex: 1000, display: "flex", alignItems: "flex-start", justifyContent: "center", padding: "24px 16px", overflowY: "auto" }}>
      <div style={{ background: "var(--surface)", borderRadius: 14, width: "100%", maxWidth: 700, boxShadow: "var(--naik-3)" }}>
        {/* Header */}
        <div style={{ padding: "20px 24px 16px", borderBottom: `1px solid ${C.border}`, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div>
            <h2 style={{ margin: 0, fontSize: 17, fontWeight: 700, color: C.text }}>Ajukan Laporan Upah</h2>
            <p style={{ margin: "2px 0 0", fontSize: 13, color: C.muted }}>Rincian upah tukang mingguan</p>
          </div>
          <button aria-label="Tutup" onClick={onClose} style={{ padding: 6, borderRadius: 6, border: "none", background: "transparent", cursor: "pointer", color: C.mid }}>
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit} style={{ padding: "20px 24px", display: "flex", flexDirection: "column", gap: "var(--gap-grid)" }}>
          {/* Mandor + scope + minggu */}
          {/* Mandor / Assignment — selalu tampil.
              Dulu disembunyikan saat `isMandor && assignments.length === 1`,
              tapi `/mandor` adalah layar ADMIN: cabang itu tak pernah jalan
              (diukur 2026-08-07, nol dari 5 peran). Mandor mengajukan lewat
              `/mandor-portal`, yang punya layarnya sendiri. */}
          <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: C.mid, display: "block", marginBottom: 6 }}>
                Mandor / Proyek <span style={{ color: C.red }}>*</span>
              </label>
              {loadingAssignments ? (
                <div style={{ padding: "8px 12px", border: `1px solid ${C.border}`, borderRadius: 6, fontSize: 13, color: C.muted }}>Memuat...</div>
              ) : assignments.length === 0 ? (
                <div style={{ padding: "8px 12px", background: C.yellowBg, border: `1px solid ${C.yellowBorder}`, borderRadius: 6, fontSize: 13, color: C.yellow }}>
                  Belum ada assignment mandor aktif. Assign mandor ke proyek terlebih dahulu di halaman detail proyek.
                </div>
              ) : (
                <Pilihan className="isian-fokus" aria-label="Pilih penugasan proyek" value={assignmentId} onChange={e => { setAssignmentId(e.target.value); setScopeId(""); }} style={GAYA_ISIAN}>
                  <option value="">-- Pilih mandor & proyek --</option>
                  {assignments.map(a => (
                    <option key={a.id} value={a.id}>{a.mandor?.name} — {a.project?.name}</option>
                  ))}
                </Pilihan>
              )}
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: C.mid, display: "block", marginBottom: 6 }}>Scope Pekerjaan <span style={{ color: C.red }}>*</span></label>
              {!assignmentId ? (
                <div style={{ padding: "8px 12px", border: `1px solid ${C.border}`, borderRadius: 6, fontSize: 13, color: C.muted, background: "var(--surface-subtle)" }}>Pilih mandor/proyek dulu</div>
              ) : availableScopes.length === 0 ? (
                <div style={{ padding: "8px 12px", background: C.yellowBg, border: `1px solid ${C.yellowBorder}`, borderRadius: 6, fontSize: 13, color: C.yellow }}>
                  Belum ada scope — tambahkan di detail proyek.
                </div>
              ) : (
                <Pilihan className="isian-fokus" aria-label="Pilih lingkup pekerjaan" value={scopeId} onChange={e => setScopeId(e.target.value)} style={GAYA_ISIAN}>
                  <option value="">-- Pilih scope --</option>
                  {availableScopes.map(s => (
                    <option key={s.id} value={s.id}>{s.scope_name} ({PAYMENT_SYSTEM[s.payment_system]})</option>
                  ))}
                </Pilihan>
              )}
            </div>
            <div>
              <label htmlFor="week-start" style={{ fontSize: 12, fontWeight: 600, color: C.mid, display: "block", marginBottom: 6 }}>Minggu (Senin) <span style={{ color: C.red }}>*</span></label>
              <input className="isian-fokus" id="week-start" aria-label="Tanggal mulai" type="date" value={weekStart} onChange={e => setWeekStart(e.target.value)} style={GAYA_ISIAN} />
            </div>
          </div>

          {/* Rincian tukang */}
          <div>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
              <span style={{ fontSize: 12, fontWeight: 600, color: C.mid }}>Rincian Tukang <span style={{ color: C.red }}>*</span></span>
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                {/* Inti dari modul absensi: jumlah hari kerja DIAMBIL dari
                    catatan harian, bukan diketik ulang. Formulir ini lahir
                    dengan `days_worked: "7"` sebagai default keras — angka
                    yang benar hanya kalau tak seorang pun libur. */}
                <button
                  type="button"
                  onClick={ambilDariAbsensi}
                  disabled={!scopeId || memuatAbsensi}
                  title={!scopeId ? "Pilih lingkup kerja lebih dulu" : "Isi hari kerja & lembur dari catatan absensi minggu ini"}
                  style={{
                    fontSize: 12, fontWeight: 600, padding: "4px 10px", borderRadius: 6,
                    border: `1px solid ${scopeId ? C.navy : C.border}`,
                    background: "transparent",
                    color: scopeId ? C.navy : C.muted,
                    cursor: scopeId && !memuatAbsensi ? "pointer" : "not-allowed",
                    display: "flex", alignItems: "center", gap: 4,
                  }}
                >
                  <CalendarCheck size={12} aria-hidden="true" />
                  {memuatAbsensi ? "Mengambil…" : "Ambil dari absensi"}
                </button>
                <button type="button" onClick={addItem} style={{ fontSize: 12, color: C.navy, border: "none", background: "transparent", cursor: "pointer", display: "flex", alignItems: "center", gap: 4, fontWeight: 600 }}>
                  <Plus size={12} /> Tambah Tukang
                </button>
              </div>
            </div>

            {/* Header kolom */}
            <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr 1fr 1fr 28px", gap: 6, marginBottom: 4, padding: "0 4px" }}>
              {["Nama Tukang", "Hari Kerja", "Tarif/Hari", "Lembur (jam)", "Tarif Lembur", ""].map(h => (
                <div key={h} style={{ fontSize: "var(--t-mikro)", fontWeight: 600, color: C.muted, textTransform: "uppercase", letterSpacing: "0.05em" }}>{h}</div>
              ))}
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {items.map((item, i) => {
                const subtotalItem = (parseFloat(item.days_worked || "0") * parseFloat(item.daily_rate || "0")) +
                  (parseFloat(item.overtime_hours || "0") * parseFloat(item.overtime_rate || "0"));
                return (
                  <div key={i} style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr 1fr 1fr 28px", gap: 6, alignItems: "center", padding: "8px", background: "var(--surface-subtle)", borderRadius: 6, border: `1px solid ${C.border}` }}>
                    <input className="isian-fokus" placeholder="Nama tukang" value={item.worker_name} onChange={e => updateItem(i, "worker_name", e.target.value)} style={{ ...GAYA_ISIAN, background: "var(--surface)" }} />
                    <input className="isian-fokus" type="number" placeholder="7" value={item.days_worked} onChange={e => updateItem(i, "days_worked", e.target.value)} style={{ ...GAYA_ISIAN, background: "var(--surface)" }} step="0.5" min="0" />
                    <input className="isian-fokus" type="number" placeholder="125000" value={item.daily_rate} onChange={e => updateItem(i, "daily_rate", e.target.value)} style={{ ...GAYA_ISIAN, background: "var(--surface)" }} />
                    <input className="isian-fokus" type="number" placeholder="0" value={item.overtime_hours} onChange={e => updateItem(i, "overtime_hours", e.target.value)} style={{ ...GAYA_ISIAN, background: "var(--surface)" }} step="0.5" min="0" />
                    <input className="isian-fokus" type="number" placeholder="15000" value={item.overtime_rate} onChange={e => updateItem(i, "overtime_rate", e.target.value)} style={{ ...GAYA_ISIAN, background: "var(--surface)" }} />
                    <button aria-label="Hapus baris" type="button" onClick={() => removeItem(i)} disabled={items.length === 1} style={{ padding: 4, borderRadius: 6, border: "none", background: "transparent", cursor: items.length === 1 ? "not-allowed" : "pointer", color: C.red, opacity: items.length === 1 ? 0.3 : 1 }}>
                      <Trash2 size={13} />
                    </button>
                    {subtotalItem > 0 && (
                      <div style={{ gridColumn: "1/-1", fontSize: "var(--t-kecil)", color: C.mid, textAlign: "right", paddingRight: 4 }}>
                        Subtotal: <strong style={{ color: C.text }}>{fmt(subtotalItem)}</strong>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Potongan */}
          <div>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
              <span style={{ fontSize: 12, fontWeight: 600, color: C.mid }}>Potongan</span>
              <button type="button" onClick={addDeduction} style={{ fontSize: 12, color: C.red, border: "none", background: "transparent", cursor: "pointer", display: "flex", alignItems: "center", gap: 4, fontWeight: 600 }}>
                <Plus size={12} /> Tambah Potongan
              </button>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {deductions.map((d, i) => (
                <div key={i} style={{ padding: "8px 12px", background: "var(--danger-bg)", borderRadius: 6, border: `1px solid ${C.redBorder}` }}>
                  {/* Toggle tipe */}
                  <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
                    {(["kasbon_kolektif", "kasbon_individu"] as const).map(t => (
                      <button key={t} type="button"
                        onClick={() => updateDeduction(i, "tipe", t)}
                        style={{ padding: "4px 12px", borderRadius: 20, fontSize: "var(--t-kecil)", fontWeight: d.tipe === t ? 700 : 400, cursor: "pointer", border: `1px solid ${d.tipe === t ? C.red : C.border}`, background: d.tipe === t ? C.redBg : "var(--surface)", color: d.tipe === t ? C.red : C.mid }}>
                        {t === "kasbon_kolektif" ? "Kolektif" : "Per Individu"}
                      </button>
                    ))}
                    <button aria-label="Hapus baris" type="button" onClick={() => removeDeduction(i)} style={{ marginLeft: "auto", padding: 4, borderRadius: 6, border: "none", background: "transparent", cursor: "pointer", color: C.red }}>
                      <Trash2 size={13} />
                    </button>
                  </div>

                  {d.tipe === "kasbon_kolektif" ? (
                    /* Kolektif: label + nominal */
                    <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 6 }}>
                      <input className="isian-fokus" placeholder="Keterangan (mis: Kasbon rabu)" value={d.label} onChange={e => updateDeduction(i, "label", e.target.value)} style={{ ...GAYA_ISIAN, background: "var(--surface)" }} />
                      <input className="isian-fokus" type="number" placeholder="Nominal" value={d.amount} onChange={e => updateDeduction(i, "amount", e.target.value)} style={{ ...GAYA_ISIAN, background: "var(--surface)" }} />
                    </div>
                  ) : (
                    /* Per individu: nama pekerja + kasbon link + nominal */
                    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
                        {/* Nama: search dari pekerja di baris items */}
                        <Pilihan className="isian-fokus" aria-label="Pilih tukang" value={d.worker_name} onChange={e => updateDeduction(i, "worker_name", e.target.value)} style={{ ...GAYA_ISIAN, background: "var(--surface)" }}>
                          <option value="">-- Pilih pekerja --</option>
                          {items.filter(it => it.worker_name.trim()).map((it, idx) => (
                            <option key={idx} value={it.worker_name}>{it.worker_name}</option>
                          ))}
                        </Pilihan>
                        {/* Kasbon aktif (opsional) */}
                        <Pilihan className="isian-fokus" aria-label="Pilih kasbon yang dipotong" value={d.worker_kasbon_id} onChange={e => onKasbonSelect(i, e.target.value)} style={{ ...GAYA_ISIAN, background: "var(--surface)" }}>
                          <option value="">-- Link kasbon (opsional) --</option>
                          {projectKasbons.filter(k => !k.is_settled).map(k => (
                            <option key={k.id} value={k.id}>{k.worker?.name} — sisa {fmt(k.amount - k.amount_settled)}</option>
                          ))}
                        </Pilihan>
                      </div>
                      <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 6 }}>
                        <input className="isian-fokus" placeholder="Keterangan (mis: Cicilan kasbon Ade)" value={d.label} onChange={e => updateDeduction(i, "label", e.target.value)} style={{ ...GAYA_ISIAN, background: "var(--surface)" }} />
                        <input className="isian-fokus" type="number" placeholder="Nominal" value={d.amount} onChange={e => updateDeduction(i, "amount", e.target.value)} style={{ ...GAYA_ISIAN, background: "var(--surface)" }} />
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Catatan */}
          <div>
            <label htmlFor="notes" style={{ fontSize: 12, fontWeight: 600, color: C.mid, display: "block", marginBottom: 6 }}>Catatan</label>
            <textarea className="isian-fokus" id="notes" value={notes} onChange={e => setNotes(e.target.value)} rows={2} style={{ ...GAYA_ISIAN, resize: "vertical" }} placeholder="Catatan tambahan..." />
          </div>

          {/* Summary total */}
          <div style={{ padding: "12px 16px", background: C.navyLight, borderRadius: 10, border: `1px solid ${C.border}` }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
              {[
                { label: "Subtotal Upah", value: subtotal, color: C.text },
                { label: "Total Potongan", value: totalDed, color: C.red },
                { label: "Yang Dibayar", value: net, color: C.navy },
              ].map(s => (
                <div key={s.label}>
                  <div style={{ fontSize: "var(--t-kecil)", color: C.mid, marginBottom: 2 }}>{s.label}</div>
                  <div style={{ fontSize: 15, fontWeight: 700, color: s.color }}>{fmt(s.value)}</div>
                </div>
              ))}
            </div>
          </div>

          {error && <div style={{ padding: "8px 12px", background: C.redBg, borderRadius: 6, fontSize: 13, color: C.red, border: `1px solid ${C.redBorder}` }}>{error}</div>}

          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
            <button type="button" onClick={onClose} style={{ padding: "8px 16px", borderRadius: 6, border: `1px solid ${C.border}`, background: "var(--surface)", cursor: "pointer", fontSize: 13 }}>Batal</button>
            <button type="submit" disabled={loading} style={{ padding: "8px 20px", borderRadius: 6, border: "none", background: "var(--grad-aksen)", color: "var(--surface)", cursor: loading ? "not-allowed" : "pointer", fontSize: 13, fontWeight: 600, opacity: loading ? 0.7 : 1 }}>
              {loading ? "Mengajukan..." : "Ajukan Laporan"}
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body
  );
}

// ─── Modal: Detail Laporan ────────────────────────────────────────────────────
interface CashAccountOption { id: string; name: string; type: string; balance: number; is_active?: boolean; }

export function WageReportDetailModal({ data, onClose, onApprove }: {
  data: WageReportDetail;
  onClose: () => void;
  onApprove: (id: string, status: "approved" | "rejected" | "paid", notes?: string, cashAccountId?: string, paidAt?: string, paymentMethod?: string) => void;
}) {
  useTutupEsc(onClose);
  const mounted = useMounted();
  useEffect(() => { document.body.style.overflow = "hidden"; return () => { document.body.style.overflow = ""; }; }, []);
  const [reviewNotes, setReviewNotes] = useState("");
  const [approvePaymentMethod, setApprovePaymentMethod] = useState<"cash" | "transfer_bank">("cash");
  const [rejectNotes, setRejectNotes] = useState("");
  const [loading, setLoading] = useState(false);
  const [showPayForm, setShowPayForm] = useState(false);
  const [showApproveForm, setShowApproveForm] = useState(false);
  const [showRejectForm, setShowRejectForm] = useState(false);
  const [cashAccounts, setCashAccounts] = useState<CashAccountOption[]>([]);
  const [cashAccountId, setCashAccountId] = useState("");
  const [paidAt, setPaidAt] = useState(new Date().toISOString().split("T")[0]);

  const r = data.report;
  const st = REPORT_STATUS[r?.status ?? "draft"] ?? REPORT_STATUS.draft;

  useEffect(() => {
    if (r?.status === "approved" || showPayForm) {
      api.get<{ accounts: CashAccountOption[] }>("/api/v1/cash/accounts")
        .then(res => {
          const active = res.data.accounts.filter(a => a.is_active !== false);
          setCashAccounts(active);
          const main = active.find(a => a.type === "main");
          if (main) setCashAccountId(main.id);
        }).catch(() => {});
    }
  }, [r?.status, showPayForm]);

  async function doApprove(status: "approved" | "rejected" | "paid") {
    if (status === "rejected" && !rejectNotes.trim()) return;
    setLoading(true);
    if (status === "paid") {
      await onApprove(r.id, status, reviewNotes || undefined, cashAccountId || undefined, paidAt);
    } else if (status === "approved") {
      await onApprove(r.id, status, reviewNotes || undefined, undefined, undefined, approvePaymentMethod);
    } else {
      await onApprove(r.id, status, rejectNotes);
    }
    setLoading(false);
    setShowApproveForm(false);
    setShowRejectForm(false);
  }

  if (!mounted) return null;
  return createPortal(
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", zIndex: 1000, display: "flex", alignItems: "flex-start", justifyContent: "center", padding: "24px 16px", overflowY: "auto" }}>
      <div style={{ background: "var(--surface)", borderRadius: 14, width: "100%", maxWidth: 640, boxShadow: "var(--naik-3)" }}>
        <div style={{ padding: "20px 24px 16px", borderBottom: `1px solid ${C.border}`, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div>
            <h2 style={{ margin: 0, fontSize: 17, fontWeight: 700, color: C.text }}>Detail Laporan Upah</h2>
            <p style={{ margin: "2px 0 0", fontSize: 13, color: C.muted }}>
              {r?.assignment?.mandor?.name} · {r?.scope?.scope_name} · Minggu {r && fmtDateShort(r.week_start)}–{r && fmtDateShort(r.week_end)}
            </p>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 12, fontWeight: 600, padding: "2px 8px", borderRadius: 10, background: st.bg, color: st.color, border: `1px solid ${st.border}` }}>{st.label}</span>
            <button aria-label="Tutup" onClick={onClose} style={{ padding: 6, borderRadius: 6, border: "none", background: "transparent", cursor: "pointer", color: C.mid }}><X size={18} /></button>
          </div>
        </div>

        <div style={{ padding: "20px 24px", display: "flex", flexDirection: "column", gap: "var(--gap-grid)", maxHeight: "70vh", overflowY: "auto" }}>
          {/* Rincian tukang */}
          <div>
            <div style={{ fontSize: 12, fontWeight: 600, color: C.muted, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 8 }}>Rincian Tukang</div>
            {/* Dipindahkan ke <Tabel> 2026-08-07 (UI-0-4) — mencabut catatan
                "sengaja tidak diubah" di kepala berkas: itu ditulis untuk
                pemecahan berkas yang harus nol-perubahan-perilaku, dan
                UI-0-4 justru pekerjaan yang berwenang menukarnya.

                Nama pekerja tetap kepala baris — upah adalah uang untuk
                ORANG, dan angkanya tak berarti tanpa nama pemiliknya.

                Dua perbedaan tampilan yang DISENGAJA, bukan kelalaian:
                · belang ganjil-genap hilang. `Tabel` memakai garis tipis +
                  sorot saat hover, karena pada tabel padat belang menambah
                  kebisingan tanpa menambah keterbacaan.
                · angka rata KANAN. Tiga kolom terakhir nominal upah, dan di
                  modal ini mandor membandingkan subtotal antar tukang —
                  rata kiri membuat digitnya tak pernah sejajar. */}
            <div style={{ border: `1px solid ${C.border}`, borderRadius: 10, overflow: "hidden" }}>
              <Tabel<WageItem>
              berpermukaan
                caption="Rincian upah per pekerja: jumlah hari, tarif harian, lembur, dan subtotal."
                data={data.items}
                kunciBaris={item => item.id}
                kolom={[
                  {
                    kunci: "nama", judul: "Nama", kepalaBaris: true,
                    render: item => <span style={{ fontWeight: 600 }}>{item.worker_name}</span>,
                  },
                  {
                    kunci: "hari", judul: "Hari", rata: "kanan",
                    render: item => <span style={{ color: C.mid }}>{item.days_worked}</span>,
                  },
                  {
                    kunci: "tarif", judul: "Tarif/Hari", rata: "kanan",
                    render: item => <span style={{ color: C.mid }}>{fmt(item.daily_rate)}</span>,
                  },
                  {
                    kunci: "lembur", judul: "Lembur", rata: "kanan",
                    render: item => (
                      <span style={{ color: C.mid, fontSize: 12 }}>
                        {item.overtime_hours > 0 ? `${item.overtime_hours}j × ${fmt(item.overtime_rate)}` : "—"}
                      </span>
                    ),
                  },
                  {
                    kunci: "subtotal", judul: "Subtotal", rata: "kanan",
                    render: item => <span style={{ fontWeight: 600 }}>{fmt(item.subtotal)}</span>,
                  },
                ]}
              />
            </div>
          </div>

          {/* Potongan */}
          {data.deductions.length > 0 && (
            <div>
              <div style={{ fontSize: 12, fontWeight: 600, color: C.muted, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 8 }}>Potongan</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {data.deductions.map(d => (
                  <div key={d.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 12px", background: C.redBg, borderRadius: 6, border: `1px solid ${C.redBorder}` }}>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 600, color: C.text }}>{d.label}</div>
                      {d.worker_kasbon && <div style={{ fontSize: "var(--t-kecil)", color: C.muted }}>Kasbon {d.worker_kasbon.worker?.name} · {fmtDate(d.worker_kasbon.kasbon_date)}</div>}
                    </div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: C.red }}>−{fmt(d.amount)}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Ringkasan total */}
          <div style={{ padding: "12px 16px", background: C.navyLight, borderRadius: 10, border: `1px solid #C7D9F0` }}>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, color: C.mid }}>
                <span>Subtotal upah</span><span>{fmt(r?.subtotal ?? 0)}</span>
              </div>
              {(r?.total_deduction ?? 0) > 0 && (
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, color: C.red }}>
                  <span>Total potongan</span><span>−{fmt(r?.total_deduction ?? 0)}</span>
                </div>
              )}
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 15, fontWeight: 700, color: C.navy, paddingTop: 6, borderTop: `1px solid #C7D9F0`, marginTop: 4 }}>
                <span>Yang Dibayar</span><span>{fmt(r?.net_amount ?? 0)}</span>
              </div>
            </div>
          </div>

          {/* Review notes jika ada */}
          {r?.review_notes && (
            <div style={{ padding: "8px 12px", background: "var(--surface-subtle)", borderRadius: 6, border: `1px solid ${C.border}`, fontSize: 13, color: C.text }}>
              <div style={{ fontWeight: 600, color: C.muted, fontSize: "var(--t-kecil)", marginBottom: 4 }}>Catatan Review:</div>
              {r.review_notes}
            </div>
          )}

          {/* Action: approve/reject (jika submitted) */}
          {r?.status === "submitted" && (
            <div style={{ paddingTop: 8, borderTop: `1px solid ${C.border}` }}>
              {!showApproveForm && !showRejectForm && (
                <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                  <button onClick={() => setShowRejectForm(true)} disabled={loading} style={{ padding: "8px 16px", borderRadius: 6, border: `1px solid ${C.redBorder}`, background: C.redBg, color: C.red, cursor: "pointer", fontSize: 13, fontWeight: 600, display: "flex", alignItems: "center", gap: 6 }}>
                    <XCircle size={14} /> Tolak
                  </button>
                  <button onClick={() => setShowApproveForm(true)} disabled={loading} style={{ padding: "8px 16px", borderRadius: 6, border: "none", background: C.green, color: "var(--surface)", cursor: "pointer", fontSize: 13, fontWeight: 600, display: "flex", alignItems: "center", gap: 6 }}>
                    <Check size={14} /> Setujui
                  </button>
                </div>
              )}

              {/* Form approve */}
              {showApproveForm && (
                <div style={{ display: "flex", flexDirection: "column", gap: 12, padding: "12px 16px", background: C.greenBg, borderRadius: 10, border: `1px solid ${C.greenBorder}` }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: C.green }}>Konfirmasi Persetujuan</div>
                  <div>
                    <span id="metode-pembayaran" style={{ display: "block", fontSize: "var(--t-kecil)", fontWeight: 600, color: C.mid, marginBottom: 6 }}>Metode Pembayaran <span style={{ color: C.red }}>*</span></span>
                    <div role="group" aria-labelledby="metode-pembayaran" style={{ display: "flex", gap: 8 }}>
                      {([["cash", "Cash"], ["transfer_bank", "Transfer Bank"]] as const).map(([val, lbl]) => (
                        <button key={val} type="button" onClick={() => setApprovePaymentMethod(val)}
                          style={{ flex: 1, padding: "8px 12px", borderRadius: 6, border: `2px solid ${approvePaymentMethod === val ? C.green : C.border}`, background: approvePaymentMethod === val ? C.greenBg : "var(--surface)", color: approvePaymentMethod === val ? C.green : C.mid, fontSize: 13, fontWeight: approvePaymentMethod === val ? 700 : 400, cursor: "pointer" }}>
                          {lbl}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <label htmlFor="review-notes" style={{ display: "block", fontSize: "var(--t-kecil)", fontWeight: 600, color: C.mid, marginBottom: 6 }}>Catatan (opsional)</label>
                    <textarea id="review-notes" value={reviewNotes} onChange={e => setReviewNotes(e.target.value)} rows={2} placeholder="Catatan tambahan..." style={{ width: "100%", padding: "8px 8px", border: `1px solid ${C.border}`, borderRadius: 6, fontSize: 13, outline: "none", resize: "none", boxSizing: "border-box" }} />
                  </div>
                  <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                    <button onClick={() => setShowApproveForm(false)} style={{ padding: "8px 12px", borderRadius: 6, border: `1px solid ${C.border}`, background: "var(--surface)", color: C.mid, fontSize: 13, cursor: "pointer" }}>Batal</button>
                    <button onClick={() => doApprove("approved")} disabled={loading} style={{ padding: "8px 16px", borderRadius: 6, border: "none", background: C.green, color: "var(--surface)", cursor: "pointer", fontSize: 13, fontWeight: 600, display: "flex", alignItems: "center", gap: 6 }}>
                      <Check size={14} /> {loading ? "Menyimpan..." : "Setujui"}
                    </button>
                  </div>
                </div>
              )}

              {/* Form reject */}
              {showRejectForm && (
                <div style={{ display: "flex", flexDirection: "column", gap: 12, padding: "12px 16px", background: C.redBg, borderRadius: 10, border: `1px solid ${C.redBorder}` }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: C.red }}>Tolak Laporan</div>
                  <div>
                    <label htmlFor="reject-notes" style={{ display: "block", fontSize: "var(--t-kecil)", fontWeight: 600, color: C.mid, marginBottom: 6 }}>Alasan Penolakan <span style={{ color: C.red }}>*</span></label>
                    <textarea id="reject-notes" value={rejectNotes} onChange={e => setRejectNotes(e.target.value)} rows={3} placeholder="Wajib diisi — jelaskan alasan penolakan..." style={{ width: "100%", padding: "8px 8px", border: `1px solid ${rejectNotes.trim() ? C.border : C.red}`, borderRadius: 6, fontSize: 13, outline: "none", resize: "none", boxSizing: "border-box" }} />
                    {!rejectNotes.trim() && <div style={{ fontSize: "var(--t-kecil)", color: C.red, marginTop: 4 }}>Alasan penolakan wajib diisi</div>}
                  </div>
                  <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                    <button onClick={() => setShowRejectForm(false)} style={{ padding: "8px 12px", borderRadius: 6, border: `1px solid ${C.border}`, background: "var(--surface)", color: C.mid, fontSize: 13, cursor: "pointer" }}>Batal</button>
                    <button onClick={() => doApprove("rejected")} disabled={loading || !rejectNotes.trim()} style={{ padding: "8px 16px", borderRadius: 6, border: "none", background: C.red, color: "var(--surface)", cursor: "pointer", fontSize: 13, fontWeight: 600, display: "flex", alignItems: "center", gap: 6, opacity: !rejectNotes.trim() ? 0.5 : 1 }}>
                      <XCircle size={14} /> {loading ? "Menyimpan..." : "Tolak Laporan"}
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Action: mark as paid (jika approved) */}
          {r?.status === "approved" && (
            <div style={{ paddingTop: 8, borderTop: `1px solid ${C.border}` }}>
              {!showPayForm ? (
                <div style={{ display: "flex", justifyContent: "flex-end" }}>
                  <button onClick={() => setShowPayForm(true)} style={{ padding: "8px 20px", borderRadius: 6, border: "none", background: "var(--grad-aksen)", color: "var(--surface)", cursor: "pointer", fontSize: 13, fontWeight: 600, display: "flex", alignItems: "center", gap: 6 }}>
                    <Banknote size={14} /> Tandai Sudah Dibayar
                  </button>
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 12, padding: "12px 16px", background: C.navyLight, borderRadius: 10, border: `1px solid #C7D9F0` }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: C.navy }}>Konfirmasi Pembayaran Upah</div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                    <div>
                      <label htmlFor="paid-at" style={{ display: "block", fontSize: "var(--t-kecil)", fontWeight: 600, color: C.mid, marginBottom: 5 }}>Tanggal Bayar</label>
                      <input id="paid-at" aria-label="Tanggal" type="date" value={paidAt} onChange={e => setPaidAt(e.target.value)}
                        style={{ width: "100%", padding: "8px 8px", border: `1px solid ${C.border}`, borderRadius: 6, fontSize: 13, outline: "none", boxSizing: "border-box" }} />
                    </div>
                    <div>
                      <label htmlFor="cash-account-id" style={{ display: "block", fontSize: "var(--t-kecil)", fontWeight: 600, color: C.mid, marginBottom: 5 }}>Sumber Kas <span style={{ color: C.red }}>*</span></label>
                      <Pilihan id="cash-account-id" aria-label="Sumber kas pembayaran" value={cashAccountId} onChange={e => setCashAccountId(e.target.value)}
                        style={{ width: "100%", padding: "8px 8px", border: `1px solid ${C.border}`, borderRadius: 6, fontSize: 13, background: "var(--surface)", outline: "none", boxSizing: "border-box" }}>
                        <option value="">— Tidak dari kas —</option>
                        {cashAccounts.map(a => (
                          <option key={a.id} value={a.id}>{a.name} (Rp {Number(a.balance).toLocaleString("id-ID")})</option>
                        ))}
                      </Pilihan>
                    </div>
                  </div>
                  {cashAccountId && (() => {
                    const acc = cashAccounts.find(a => a.id === cashAccountId);
                    const net = r?.net_amount ?? 0;
                    if (!acc) return null;
                    const ok = acc.balance >= net;
                    return (
                      <div style={{ fontSize: "var(--t-kecil)", color: ok ? C.green : C.red, fontWeight: 600 }}>
                        {ok ? `✓ Saldo cukup — setelah bayar: Rp ${(acc.balance - net).toLocaleString("id-ID")}` : `⚠ Saldo tidak cukup (Rp ${acc.balance.toLocaleString("id-ID")} < Rp ${net.toLocaleString("id-ID")})`}
                      </div>
                    );
                  })()}
                  <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                    <button onClick={() => setShowPayForm(false)} style={{ padding: "8px 12px", borderRadius: 6, border: `1px solid ${C.border}`, background: "var(--surface)", color: C.mid, fontSize: 13, cursor: "pointer" }}>Batal</button>
                    <button onClick={() => doApprove("paid")} disabled={loading} style={{ padding: "8px 16px", borderRadius: 6, border: "none", background: "var(--grad-aksen)", color: "var(--surface)", cursor: "pointer", fontSize: 13, fontWeight: 600, display: "flex", alignItems: "center", gap: 6 }}>
                      <Banknote size={14} /> {loading ? "Menyimpan..." : "Konfirmasi Bayar"}
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}

// ─── Modal: Tambah / Edit Pekerja ────────────────────────────────────────────
export function WorkerFormModal({ mandorId: initialMandorId, mandorName: initialMandorName, worker, onClose, onSuccess }: {
  mandorId?: string;
  mandorName?: string;
  worker?: Worker;
  onClose: () => void;
  onSuccess: () => void;
}) {
  useTutupEsc(onClose);
  const mounted = useMounted();
  useEffect(() => { document.body.style.overflow = "hidden"; return () => { document.body.style.overflow = ""; }; }, []);

  const isEdit = !!worker;

  const [mandorOptions, setMandorOptions] = useState<{ id: string; name: string }[]>(
    initialMandorId ? [{ id: initialMandorId, name: initialMandorName ?? "" }] : []
  );
  useEffect(() => {
    if (!initialMandorId) {
      api.get<{ mandors: { id: string; name: string; phone: string | null; email: string }[] }>("/api/v1/mandor/list")
        .then(r => setMandorOptions(r.data.mandors ?? []))
        .catch(() => {});
    }
  }, [initialMandorId]);

  const [mandorId, setMandorId] = useState(initialMandorId || worker?.mandor?.id || "");
  const [name, setName] = useState(worker?.name ?? "");
  const [tipe, setTipe] = useState<string>(worker?.tipe ?? "");
  const [phone, setPhone] = useState(worker?.phone ?? "");
  const [skills, setSkills] = useState<string[]>(worker?.skills ?? []);
  const [isActive, setIsActive] = useState(worker?.is_active ?? true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  function toggleSkill(val: string) {
    setSkills(prev => prev.includes(val) ? prev.filter(s => s !== val) : [...prev, val]);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault(); setError("");
    if (!name.trim()) { setError("Nama pekerja wajib diisi"); return; }
    setLoading(true);
    try {
      if (isEdit) {
        await api.patch(`/api/v1/mandor/workers/${worker!.id}`, {
          name: name.trim(),
          tipe: tipe || null,
          phone: phone || null,
          skills,
          is_active: isActive,
        });
      } else {
        await api.post("/api/v1/mandor/workers", {
          name: name.trim(),
          tipe: tipe || undefined,
          phone: phone || undefined,
          skills,
          mandor_id: mandorId || undefined,
        });
      }
      onSuccess();
    } catch (err: unknown) {
      setError((err as any)?.response?.data?.error ?? (isEdit ? "Gagal update pekerja" : "Gagal tambah pekerja"));
    } finally { setLoading(false); }
  }


  if (!mounted) return null;
  return createPortal(
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: "24px 16px" }}>
      <div style={{ background: "var(--surface)", borderRadius: 14, width: "100%", maxWidth: 460, padding: "var(--pad-kartu-lega)", boxShadow: "var(--naik-3)" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
          <div>
            <h2 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: C.text }}>
              {isEdit ? "Edit Pekerja" : "Tambah Pekerja"}
            </h2>
            {(initialMandorName || worker?.mandor?.name) && (
              <div style={{ fontSize: 12, color: C.muted, marginTop: 2 }}>
                Mandor: <strong>{initialMandorName || worker?.mandor?.name}</strong>
              </div>
            )}
          </div>
          <button aria-label="Tutup" onClick={onClose} style={{ padding: 6, borderRadius: 6, border: "none", background: "transparent", cursor: "pointer", color: C.mid }}><X size={18} /></button>
        </div>

        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {/* Mandor selector — hanya saat dibuka dari header (bukan dari grup mandor). */}
          {!initialMandorId && !isEdit && (
            <div>
              <label htmlFor="mandor-id" style={{ fontSize: 12, fontWeight: 600, color: C.mid, display: "block", marginBottom: 6 }}>Mandor <span style={{ color: C.red }}>*</span></label>
              <Pilihan className="isian-fokus" id="mandor-id" aria-label="Mandor" value={mandorId} onChange={e => setMandorId(e.target.value)} style={GAYA_ISIAN}>
                <option value="">-- Pilih mandor --</option>
                {mandorOptions.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
              </Pilihan>
            </div>
          )}

          <div>
            <label htmlFor="name" style={{ fontSize: 12, fontWeight: 600, color: C.mid, display: "block", marginBottom: 6 }}>Nama <span style={{ color: C.red }}>*</span></label>
            <input className="isian-fokus" id="name" value={name} onChange={e => setName(e.target.value)} placeholder="Nama pekerja" style={GAYA_ISIAN} autoFocus />
          </div>

          <div>
            <label htmlFor="tipe" style={{ fontSize: 12, fontWeight: 600, color: C.mid, display: "block", marginBottom: 6 }}>Tipe (opsional)</label>
            <Pilihan className="isian-fokus" id="tipe" aria-label="Tipe pekerja" value={tipe} onChange={e => setTipe(e.target.value)} style={GAYA_ISIAN}>
              <option value="">-- Tidak ditentukan --</option>
              <option value="tukang">Tukang</option>
              <option value="laden">Laden</option>
              <option value="kenek">Kenek</option>
            </Pilihan>
          </div>

          <div>
            <label htmlFor="phone" style={{ fontSize: 12, fontWeight: 600, color: C.mid, display: "block", marginBottom: 6 }}>No. HP (opsional)</label>
            <input className="isian-fokus" id="phone" value={phone} onChange={e => setPhone(e.target.value)} placeholder="08xxxxxxxxxx, tanpa tanda hubung" style={GAYA_ISIAN} />
          </div>

          <div>
            <span id="keahlian-opsional" style={{ fontSize: 12, fontWeight: 600, color: C.mid, display: "block", marginBottom: 8 }}>Keahlian (opsional)</span>
            <div role="group" aria-labelledby="keahlian-opsional" style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {SKILL_OPTIONS.map(s => {
                const selected = skills.includes(s.value);
                return (
                  <button key={s.value} type="button" onClick={() => toggleSkill(s.value)}
                    style={{
                      padding: "4px 12px", borderRadius: 20, fontSize: 12, cursor: "pointer",
                      border: `1px solid ${selected ? C.navy : C.border}`,
                      background: selected ? C.navyLight : "var(--surface)",
                      color: selected ? C.navy : C.mid,
                      fontWeight: selected ? 600 : 400,
                    }}>
                    {s.label}
                  </button>
                );
              })}
            </div>
          </div>

          {isEdit && (
            <div>
              <span id="status" style={{ fontSize: 12, fontWeight: 600, color: C.mid, display: "block", marginBottom: 8 }}>Status</span>
              <div role="group" aria-labelledby="status" style={{ display: "flex", gap: 8 }}>
                {([true, false] as const).map(val => (
                  <button key={String(val)} type="button" onClick={() => setIsActive(val)}
                    style={{
                      flex: 1, padding: "8px 12px", borderRadius: 6, cursor: "pointer", fontSize: 13,
                      border: `2px solid ${isActive === val ? (val ? C.green : C.red) : C.border}`,
                      background: isActive === val ? (val ? C.greenBg : C.redBg) : "var(--surface)",
                      color: isActive === val ? (val ? C.green : C.red) : C.mid,
                      fontWeight: isActive === val ? 700 : 400,
                    }}>
                    {val ? "Aktif" : "Nonaktif"}
                  </button>
                ))}
              </div>
            </div>
          )}

          {error && <div style={{ padding: "8px 12px", background: C.redBg, borderRadius: 6, fontSize: 13, color: C.red }}>{error}</div>}

          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 4 }}>
            <button type="button" onClick={onClose} style={{ padding: "8px 16px", borderRadius: 6, border: `1px solid ${C.border}`, background: "var(--surface)", cursor: "pointer", fontSize: 13 }}>Batal</button>
            <button type="submit" disabled={loading} style={{ padding: "8px 16px", borderRadius: 6, border: "none", background: "var(--grad-aksen)", color: "var(--surface)", cursor: "pointer", fontSize: 13, fontWeight: 600, opacity: loading ? 0.7 : 1 }}>
              {loading ? "Menyimpan..." : "Simpan"}
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body
  );
}

// ─── Modal: Catat Kasbon Tukang ───────────────────────────────────────────────
export function AddKasbonModal({ assignments, onClose, onSuccess }: {
  assignments: Assignment[];
  onClose: () => void;
  onSuccess: () => void;
}) {
  useTutupEsc(onClose);
  const mounted = useMounted();
  useEffect(() => { document.body.style.overflow = "hidden"; return () => { document.body.style.overflow = ""; }; }, []);
  const [assignmentId, setAssignmentId] = useState("");
  const [workerId, setWorkerId] = useState("");
  const [amount, setAmount] = useState("");
  const [purpose, setPurpose] = useState("gaji_tukang");
  const [date, setDate] = useState(new Date().toISOString().split("T")[0]);
  const [notes, setNotes] = useState("");
  const [workers, setWorkers] = useState<Worker[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);

  const selectedAssignment = assignments.find(a => a.id === assignmentId);

  function handlePhotoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) { setError("Foto maksimal 5MB"); return; }
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) { setError("Format foto harus JPEG, PNG, atau WebP"); return; }
    setError("");
    setPhotoFile(file);
    setPhotoPreview(URL.createObjectURL(file));
  }

  // Load workers saat assignment dipilih
  useEffect(() => {
    if (!assignmentId) return;
    const asgn = assignments.find(a => a.id === assignmentId);
    if (!asgn?.mandor?.id) return;
    // Pengosongan dipindah ke dalam `.then()`: menyetelnya sinkron di badan efek
    // memicu render bertingkat, DAN membuat daftar berkedip kosong dulu sebelum
    // yang baru datang. Pilihan tukang ikut direset di sana — daftar berganti,
    // jadi id lama belum tentu ada di dalamnya.
    let batal = false;
    api.get<{ workers: Worker[] }>(`/api/v1/mandor/workers?mandor_id=${asgn.mandor.id}`)
      .then(r => {
        if (batal) return;
        setWorkers(r.data.workers);
        setWorkerId(prev => (r.data.workers.some(w => w.id === prev) ? prev : ""));
      })
      .catch(() => {});
    return () => { batal = true; };
  }, [assignmentId]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault(); setError("");
    if (!assignmentId || !workerId || !amount) { setError("Pilih mandor, tukang, dan isi nominal"); return; }
    setLoading(true);
    try {
      let photoUrl: string | undefined;
      if (photoFile) {
        // Upload lewat API (bucket kasbon-photos privat + service_role-only, migration 098).
        // Dulu upload langsung browser→storage ke bucket yang TIDAK ADA → selalu gagal (OPEN-4).
        photoUrl = await uploadKasbonPhoto(photoFile);
      }
      await api.post("/api/v1/mandor/worker-kasbons", {
        worker_id: workerId,
        project_id: selectedAssignment?.project?.id,
        amount: parseFloat(amount),
        purpose,
        kasbon_date: date,
        notes: notes || undefined,
        mandor_id: selectedAssignment?.mandor?.id,
        photo_url: photoUrl,
      });
      onSuccess();
    } catch (err: unknown) {
      setError((err as any)?.response?.data?.error ?? (err as any)?.message ?? "Gagal catat kasbon");
    } finally { setLoading(false); }
  }


  if (!mounted) return null;
  return createPortal(
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ background: "var(--surface)", borderRadius: 14, width: 480, padding: "var(--pad-kartu-lega)", boxShadow: "var(--naik-3)", maxHeight: "90vh", overflowY: "auto" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
          <h2 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: C.text }}>Catat Kasbon Tukang</h2>
          <button aria-label="Tutup" onClick={onClose} style={{ padding: 6, borderRadius: 6, border: "none", background: "transparent", cursor: "pointer", color: C.mid }}><X size={18} /></button>
        </div>
        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div>
            <label htmlFor="assignment-id" style={{ fontSize: 12, fontWeight: 600, color: C.mid, display: "block", marginBottom: 6 }}>Mandor / Proyek <span style={{ color: C.red }}>*</span></label>
            <Pilihan className="isian-fokus" id="assignment-id" aria-label="Pilih penugasan proyek" value={assignmentId} onChange={e => setAssignmentId(e.target.value)} style={GAYA_ISIAN}>
              <option value="">-- Pilih mandor --</option>
              {assignments.map(a => <option key={a.id} value={a.id}>{a.mandor?.name} — {a.project?.name}</option>)}
            </Pilihan>
          </div>
          <div>
            <label htmlFor="worker-id" style={{ fontSize: 12, fontWeight: 600, color: C.mid, display: "block", marginBottom: 6 }}>Tukang <span style={{ color: C.red }}>*</span></label>
            <Pilihan className="isian-fokus" id="worker-id" aria-label="Tukang penerima kasbon" value={workerId} onChange={e => setWorkerId(e.target.value)} style={GAYA_ISIAN} disabled={!assignmentId}>
              <option value="">-- Pilih tukang --</option>
              {workers.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
            </Pilihan>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div>
              <label htmlFor="amount" style={{ fontSize: 12, fontWeight: 600, color: C.mid, display: "block", marginBottom: 6 }}>Nominal <span style={{ color: C.red }}>*</span></label>
              <input className="isian-fokus" id="amount" type="number" value={amount} onChange={e => setAmount(e.target.value)} placeholder="0" style={GAYA_ISIAN} />
            </div>
            <div>
              <label htmlFor="date" style={{ fontSize: 12, fontWeight: 600, color: C.mid, display: "block", marginBottom: 6 }}>Tanggal</label>
              <input className="isian-fokus" id="date" aria-label="Tanggal" type="date" value={date} onChange={e => setDate(e.target.value)} style={GAYA_ISIAN} />
            </div>
          </div>
          <div>
            <label htmlFor="purpose" style={{ fontSize: 12, fontWeight: 600, color: C.mid, display: "block", marginBottom: 6 }}>Tujuan</label>
            <Pilihan className="isian-fokus" id="purpose" aria-label="Tujuan kasbon tukang" value={purpose} onChange={e => setPurpose(e.target.value)} style={GAYA_ISIAN}>
              <option value="gaji_tukang">Gaji Tukang</option>
              <option value="uang_makan">Uang Makan</option>
              <option value="lain_lain">Lain-lain</option>
            </Pilihan>
          </div>
          <div>
            <label htmlFor="notes-2" style={{ fontSize: 12, fontWeight: 600, color: C.mid, display: "block", marginBottom: 6 }}>Catatan</label>
            <textarea className="isian-fokus" id="notes-2" value={notes} onChange={e => setNotes(e.target.value)} rows={2} placeholder="Catatan kasbon..." style={{ ...GAYA_ISIAN, resize: "none" }} />
          </div>
          {/* D2 — Foto nota */}
          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: C.mid, display: "block", marginBottom: 6 }}>
              <Camera size={12} style={{ verticalAlign: "middle", marginRight: 4 }} />Foto Nota (opsional)
            </label>
            {photoPreview ? (
              <div style={{ position: "relative", display: "inline-block" }}>
                <img src={photoPreview} alt="preview" style={{ width: "100%", maxHeight: 160, objectFit: "cover", borderRadius: 6, border: `1px solid ${C.border}` }} />
                <button type="button" onClick={() => { setPhotoFile(null); setPhotoPreview(null); }}
                  style={{ position: "absolute", top: 6, right: 6, background: "rgba(0,0,0,0.6)", border: "none", borderRadius: "50%", color: "var(--surface)", width: 24, height: 24, cursor: "pointer", fontSize: 13, display: "flex", alignItems: "center", justifyContent: "center" }}>
                  ×
                </button>
              </div>
            ) : (
              <label style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, padding: "12px", border: `2px dashed ${C.border}`, borderRadius: 6, cursor: "pointer", fontSize: 12, color: C.muted, background: "var(--surface-subtle)" }}>
                <Camera size={16} color={C.muted} /> Klik untuk pilih foto (maks 5MB)
                <input type="file" accept="image/jpeg,image/png,image/webp" onChange={handlePhotoChange} style={{ display: "none" }} />
              </label>
            )}
          </div>
          {error && <div style={{ padding: "8px 12px", background: C.redBg, borderRadius: 6, fontSize: 13, color: C.red }}>{error}</div>}
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
            <button type="button" onClick={onClose} style={{ padding: "8px 16px", borderRadius: 6, border: `1px solid ${C.border}`, background: "var(--surface)", cursor: "pointer", fontSize: 13 }}>Batal</button>
            <button type="submit" disabled={loading} style={{ padding: "8px 16px", borderRadius: 6, border: "none", background: "var(--grad-aksen)", color: "var(--surface)", cursor: "pointer", fontSize: 13, fontWeight: 600, opacity: loading ? 0.7 : 1 }}>
              {loading ? "Menyimpan..." : "Catat Kasbon"}
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body
  );
}

// ─── Modal: Ajukan Kasbon Mandor (mandor mengajukan ke admin) ─────────────────

export function SubmitMandorKasbonModal({ onClose, onSuccess }: { onClose: () => void; onSuccess: () => void }) {
  useTutupEsc(onClose);
  const mounted = useMounted();
  const { purposes: kasbonPurposes } = useKasbonPurposes(); // tujuan kasbon dari master (A4)
  useEffect(() => { document.body.style.overflow = "hidden"; return () => { document.body.style.overflow = ""; }; }, []);

  const [scopes, setScopes] = useState<MandorScope[]>([]);
  const [projects, setProjects] = useState<{ id: string; name: string }[]>([]);
  const [projectId, setProjectId] = useState("");
  const [scopeId, setScopeId] = useState("");
  const [amount, setAmount] = useState("");
  const [fundSource, setFundSource] = useState("owner_advance");
  const [purpose, setPurpose] = useState("operasional");
  const [kasbonDate, setKasbonDate] = useState(new Date().toISOString().split("T")[0]);
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);

  function handlePhotoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) { setError("Foto maksimal 5MB"); return; }
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) { setError("Format foto harus JPEG, PNG, atau WebP"); return; }
    setError("");
    setPhotoFile(file);
    setPhotoPreview(URL.createObjectURL(file));
  }

  useEffect(() => {
    api.get<{ scopes: MandorScope[] }>("/api/v1/mandor/scopes")
      .then(r => {
        const scopeList = r.data.scopes ?? [];
        setScopes(scopeList);
        // Build unique project list
        const pm = new Map<string, { id: string; name: string }>();
        for (const s of scopeList) {
          const p = s.assignment?.project;
          if (p?.id && !pm.has(p.id)) pm.set(p.id, { id: p.id, name: p.name });
        }
        setProjects(Array.from(pm.values()));
      })
      .catch(() => {});
  }, []);

  // Scopes filtered by selected project
  const filteredScopes = projectId
    ? scopes.filter(s => s.assignment?.project?.id === projectId)
    : scopes;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault(); setError("");
    if (!projectId) { setError("Pilih proyek terlebih dahulu"); return; }
    const amt = parseFloat(amount);
    if (isNaN(amt) || amt <= 0) { setError("Nominal harus lebih dari 0"); return; }
    if (!notes.trim()) { setError("Keterangan / alasan kasbon wajib diisi"); return; }

    setLoading(true);
    try {
      let photoUrl: string | undefined;
      if (photoFile) {
        // Upload lewat API (bucket kasbon-photos privat + service_role-only, migration 098).
        // Dulu upload langsung browser→storage ke bucket yang TIDAK ADA → selalu gagal (OPEN-4).
        photoUrl = await uploadKasbonPhoto(photoFile);
      }
      await api.post("/api/v1/kasbons", {
        project_id: projectId,
        work_scope_id: scopeId || undefined,
        amount: amt,
        fund_source: fundSource,
        purpose,
        kasbon_date: kasbonDate,
        notes: notes.trim(),
        photo_url: photoUrl,
      });
      onSuccess();
    } catch (err: unknown) {
      setError((err as any)?.response?.data?.error ?? (err as any)?.message ?? "Gagal mengajukan kasbon");
    } finally { setLoading(false); }
  }


  if (!mounted) return null;
  return createPortal(
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: "var(--pad-kartu-lega)" }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={{ background: "var(--surface)", borderRadius: 14, width: "100%", maxWidth: 480, boxShadow: "var(--naik-3)", display: "flex", flexDirection: "column", maxHeight: "90vh" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "20px 24px", borderBottom: `1px solid ${C.border}` }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div style={{ width: 36, height: 36, borderRadius: 10, background: "linear-gradient(135deg, var(--warning), var(--warning))", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <Banknote size={17} color="var(--surface)" />
            </div>
            <div>
              <h2 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: C.text }}>Ajukan Kasbon</h2>
              <p style={{ margin: 0, fontSize: "var(--t-kecil)", color: C.muted }}>Pengajuan akan dikirim ke admin/PM untuk disetujui</p>
            </div>
          </div>
          <button aria-label="Tutup" onClick={onClose} style={{ padding: 6, borderRadius: 6, border: "none", background: "transparent", cursor: "pointer", color: C.mid }}><X size={18} /></button>
        </div>

        <form onSubmit={handleSubmit} style={{ padding: "20px 24px", display: "flex", flexDirection: "column", gap: 12, overflowY: "auto", flex: 1 }}>

          {/* Info banner */}
          <div style={{ padding: "8px 12px", borderRadius: 6, background: C.yellowBg, border: `1px solid ${C.yellowBorder}`, fontSize: 12, color: C.yellow, display: "flex", alignItems: "flex-start", gap: 8 }}>
            <Clock size={14} style={{ flexShrink: 0, marginTop: 1 }} />
            <span>Kasbon akan berstatus <strong>Menunggu Persetujuan</strong> sampai admin atau PM menyetujuinya.</span>
          </div>

          {/* Proyek — required */}
          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: C.mid, display: "block", marginBottom: 6 }}>
              Proyek <span style={{ color: C.red }}>*</span>
            </label>
            {projects.length === 0 ? (
              <div style={{ ...GAYA_ISIAN, color: C.muted }}>Memuat...</div>
            ) : (
              <Pilihan className="isian-fokus" aria-label="Proyek" value={projectId} onChange={e => { setProjectId(e.target.value); setScopeId(""); }} style={GAYA_ISIAN} required>
                <option value="">-- Pilih proyek --</option>
                {projects.map(p => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </Pilihan>
            )}
          </div>

          {/* Scope Pekerjaan — opsional */}
          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: C.mid, display: "block", marginBottom: 4 }}>
              Scope Pekerjaan
              <span style={{ fontSize: "var(--t-kecil)", fontWeight: 400, color: C.muted, marginLeft: 6 }}>(opsional)</span>
            </label>
            <div style={{ fontSize: "var(--t-kecil)", color: C.muted, marginBottom: 6 }}>
              Kosongkan jika kasbon bersifat umum dan tidak terikat scope tertentu.
            </div>
            <Pilihan className="isian-fokus"
              aria-label="Work scope yang dibebani kasbon (opsional)"
              value={scopeId}
              onChange={e => setScopeId(e.target.value)}
              disabled={!projectId}
              style={{ ...GAYA_ISIAN, opacity: projectId ? 1 : 0.6, background: projectId ? "var(--surface)" : "var(--surface-subtle)" }}
            >
              <option value="">— Kasbon umum (tidak terikat scope) —</option>
              {filteredScopes.map(s => (
                <option key={s.id} value={s.id}>{s.scope_name}</option>
              ))}
            </Pilihan>
          </div>

          {/* Nominal + Tanggal */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div>
              <label htmlFor="amount-2" style={{ fontSize: 12, fontWeight: 600, color: C.mid, display: "block", marginBottom: 6 }}>Nominal <span style={{ color: C.red }}>*</span></label>
              <div style={{ position: "relative" }}>
                <span style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", fontSize: 12, color: C.muted }}>Rp</span>
                <input className="isian-fokus" id="amount-2" type="number" min={1} value={amount} onChange={e => setAmount(e.target.value)} required
                  style={{ ...GAYA_ISIAN, paddingLeft: 30 }} />
              </div>
            </div>
            <div>
              <label htmlFor="kasbon-date" style={{ fontSize: 12, fontWeight: 600, color: C.mid, display: "block", marginBottom: 6 }}>Tanggal</label>
              <input className="isian-fokus" id="kasbon-date" aria-label="Tanggal" type="date" value={kasbonDate} onChange={e => setKasbonDate(e.target.value)} style={GAYA_ISIAN} />
            </div>
          </div>

          {/* Keperluan + Sumber Dana.
              ⚠️ Komentar lama di sini berbunyi "sumber dana ditentukan admin/PM
              saat approve" — dan itu TIDAK PERNAH BENAR: `fund_source` hanya
              bisa diisi saat POST (kasbons.ts:161); PATCH `/status` tak pernah
              menyentuhnya. Akibatnya setiap kasbon dari halaman ini tercatat
              "Dana Owner" tanpa siapa pun memilihnya, dan kolomnya muncul apa
              adanya di laporan. Portal mandor sudah punya pemilih ini sejak
              awal — dashboard-lah yang tertinggal, bukan sebaliknya. */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div>
              <label htmlFor="purpose-2" style={{ fontSize: 12, fontWeight: 600, color: C.mid, display: "block", marginBottom: 6 }}>Keperluan <span style={{ color: C.red }}>*</span></label>
              <Pilihan className="isian-fokus" id="purpose-2" aria-label="Keperluan kasbon mandor" value={purpose} onChange={e => setPurpose(e.target.value)} style={GAYA_ISIAN}>
                {(kasbonPurposes.length > 0
                  ? kasbonPurposes.map(p => [p.code, p.label] as [string, string])
                  : [["gaji_tukang", "Gaji Tukang"], ["uang_makan", "Uang Makan"], ["pembelian_alat", "Pembelian Alat"], ["operasional", "Operasional"], ["lain_lain", "Lain-lain"]] as [string, string][]
                ).map(([code, label]) => <option key={code} value={code}>{label}</option>)}
              </Pilihan>
            </div>
            <div>
              <label htmlFor="sumber-dana-kasbon" style={{ fontSize: 12, fontWeight: 600, color: C.mid, display: "block", marginBottom: 6 }}>Sumber Dana <span style={{ color: C.red }}>*</span></label>
              <Pilihan className="isian-fokus" id="sumber-dana-kasbon" value={fundSource} onChange={e => setFundSource(e.target.value)} style={GAYA_ISIAN}>
                <option value="owner_advance">Dana Owner</option>
                <option value="client_fund">Dana Klien</option>
              </Pilihan>
            </div>
          </div>

          {/* Keterangan — wajib untuk mandor */}
          <div>
            <label htmlFor="notes-6" style={{ fontSize: 12, fontWeight: 600, color: C.mid, display: "block", marginBottom: 6 }}>
              Keterangan / Alasan <span style={{ color: C.red }}>*</span>
            </label>
            <textarea className="isian-fokus" id="notes-6" value={notes} onChange={e => setNotes(e.target.value)} rows={3} required
              placeholder="Jelaskan keperluan kasbon ini secara detail, misal: untuk beli semen 50 sak dan besi 10mm..."
              style={{ ...GAYA_ISIAN, resize: "vertical", fontFamily: "inherit" }} />
            <div style={{ fontSize: "var(--t-kecil)", color: C.muted, marginTop: 4 }}>
              Keterangan yang jelas mempercepat persetujuan dari admin/PM.
            </div>
          </div>

          {/* D2 — Foto nota */}
          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: C.mid, display: "block", marginBottom: 6 }}>
              <Camera size={12} style={{ verticalAlign: "middle", marginRight: 4 }} />Foto Nota (opsional)
            </label>
            {photoPreview ? (
              <div style={{ position: "relative" }}>
                <img src={photoPreview} alt="preview" style={{ width: "100%", maxHeight: 160, objectFit: "cover", borderRadius: 6, border: `1px solid ${C.border}` }} />
                <button type="button" onClick={() => { setPhotoFile(null); setPhotoPreview(null); }}
                  style={{ position: "absolute", top: 6, right: 6, background: "rgba(0,0,0,0.6)", border: "none", borderRadius: "50%", color: "var(--surface)", width: 24, height: 24, cursor: "pointer", fontSize: 13, display: "flex", alignItems: "center", justifyContent: "center" }}>
                  ×
                </button>
              </div>
            ) : (
              <label style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, padding: "12px", border: `2px dashed ${C.border}`, borderRadius: 6, cursor: "pointer", fontSize: 12, color: C.muted, background: "var(--surface-subtle)" }}>
                <Camera size={16} color={C.muted} /> Klik untuk pilih foto (maks 5MB)
                <input type="file" accept="image/jpeg,image/png,image/webp" onChange={handlePhotoChange} style={{ display: "none" }} />
              </label>
            )}
          </div>

          {error && <div style={{ padding: "8px 12px", background: C.redBg, borderRadius: 6, fontSize: 13, color: C.red }}>{error}</div>}

          <div style={{ display: "flex", gap: 8, paddingTop: 4 }}>
            <button type="button" onClick={onClose} style={{ flex: 1, padding: "8px", borderRadius: 6, border: `1px solid ${C.border}`, background: "var(--surface)", cursor: "pointer", fontSize: 13 }}>Batal</button>
            <button type="submit" disabled={loading || !projectId} style={{ flex: 2, padding: "8px", borderRadius: 6, border: "none", background: (loading || !projectId) ? "var(--text-muted)" : C.yellow, color: "var(--surface)", cursor: (loading || !projectId) ? "not-allowed" : "pointer", fontSize: 13, fontWeight: 600 }}>
              {loading ? "Mengajukan..." : "Ajukan Kasbon"}
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body
  );
}

// ─── Modal: Assign Mandor ke Proyek ──────────────────────────────────────────
export function AddAssignmentModal({ mandors, onClose, onSuccess }: {
  mandors: MandorUser[];
  onClose: () => void;
  onSuccess: () => void;
}) {
  useTutupEsc(onClose);
  const mounted = useMounted();
  useEffect(() => { document.body.style.overflow = "hidden"; return () => { document.body.style.overflow = ""; }; }, []);

  const [projects, setProjects] = useState<{ id: string; name: string }[]>([]);
  const [projectId, setProjectId] = useState("");
  const [mandorId, setMandorId] = useState("");
  const [notes, setNotes] = useState("");
  const [assignedAt, setAssignedAt] = useState(new Date().toISOString().split("T")[0]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    api.get<{ projects: { id: string; name: string }[] }>("/api/v1/projects")
      .then(r => setProjects(r.data.projects)).catch(() => {});
  }, []);


  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!projectId || !mandorId) { setError("Proyek dan mandor wajib dipilih"); return; }
    setLoading(true); setError("");
    try {
      await api.post("/api/v1/mandor/assignments", { project_id: projectId, mandor_id: mandorId, notes: notes || undefined, assigned_at: assignedAt });
      onSuccess();
    } catch (err: unknown) {
      setError((err as any)?.response?.data?.error ?? "Gagal menyimpan");
    } finally { setLoading(false); }
  }

  if (!mounted) return null;
  return createPortal(
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: "var(--pad-kartu-lega)" }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={{ background: "var(--surface)", borderRadius: 14, width: "100%", maxWidth: 460, boxShadow: "var(--naik-3)" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "20px 24px", borderBottom: `1px solid ${C.border}` }}>
          <div>
            <h2 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: C.text }}>Assign Mandor ke Proyek</h2>
            <p style={{ margin: 0, fontSize: 12, color: C.muted, marginTop: 2 }}>Satu mandor bisa memiliki beberapa scope pekerjaan</p>
          </div>
          <button aria-label="Tutup" onClick={onClose} style={{ padding: 6, border: "none", background: "transparent", cursor: "pointer", color: C.mid }}><X size={18} /></button>
        </div>
        <form onSubmit={handleSubmit} style={{ padding: "20px 24px", display: "flex", flexDirection: "column", gap: 12 }}>
          {error && <div style={{ padding: "8px 12px", borderRadius: 6, background: C.redBg, color: C.red, fontSize: 13, border: `1px solid ${C.redBorder}` }}>{error}</div>}
          <div>
            <label htmlFor="project-id" style={{ fontSize: 12, fontWeight: 600, color: C.text, display: "block", marginBottom: 6 }}>Proyek</label>
            <Pilihan className="isian-fokus" id="project-id" aria-label="Proyek" value={projectId} onChange={e => setProjectId(e.target.value)} style={GAYA_ISIAN} required>
              <option value="">-- Pilih proyek --</option>
              {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </Pilihan>
          </div>
          <div>
            <label htmlFor="mandor-id-2" style={{ fontSize: 12, fontWeight: 600, color: C.text, display: "block", marginBottom: 6 }}>Mandor</label>
            <Pilihan className="isian-fokus" id="mandor-id-2" aria-label="Mandor" value={mandorId} onChange={e => setMandorId(e.target.value)} style={GAYA_ISIAN} required>
              <option value="">-- Pilih mandor --</option>
              {mandors.map(m => <option key={m.id} value={m.id}>{m.name}{m.phone ? ` (${m.phone})` : ""}</option>)}
            </Pilihan>
          </div>
          <div>
            <label htmlFor="assigned-at" style={{ fontSize: 12, fontWeight: 600, color: C.text, display: "block", marginBottom: 6 }}>Tanggal Mulai Tugas</label>
            <input className="isian-fokus" id="assigned-at" aria-label="Tanggal" type="date" value={assignedAt} onChange={e => setAssignedAt(e.target.value)} style={GAYA_ISIAN} />
          </div>
          <div>
            <label htmlFor="notes-3" style={{ fontSize: 12, fontWeight: 600, color: C.text, display: "block", marginBottom: 6 }}>Catatan (opsional)</label>
            <textarea className="isian-fokus" id="notes-3" value={notes} onChange={e => setNotes(e.target.value)} rows={2} placeholder="Deskripsi tugas, area kerja, dll" style={{ ...GAYA_ISIAN, resize: "vertical" }} />
          </div>
          <div style={{ display: "flex", gap: 8, paddingTop: 4 }}>
            <button type="button" onClick={onClose} style={{ flex: 1, padding: "8px", borderRadius: 6, border: `1px solid ${C.border}`, background: "var(--surface)", cursor: "pointer", fontSize: 13, color: C.mid }}>Batal</button>
            <button type="submit" disabled={loading} style={{ flex: 2, padding: "8px", borderRadius: 6, border: "none", background: "var(--grad-aksen)", color: "var(--surface)", cursor: loading ? "wait" : "pointer", fontSize: 13, fontWeight: 600 }}>
              {loading ? "Menyimpan..." : "Assign Mandor"}
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body
  );
}

// ─── Modal: Tambah Work Scope ──────────────────────────────────────────────────
export function AddScopeModal({ assignmentId, onClose, onSuccess }: {
  assignmentId: string;
  onClose: () => void;
  onSuccess: () => void;
}) {
  useTutupEsc(onClose);
  const mounted = useMounted();
  useEffect(() => { document.body.style.overflow = "hidden"; return () => { document.body.style.overflow = ""; }; }, []);

  const [scopeName, setScopeName] = useState("");
  const [description, setDescription] = useState("");
  const [paymentSystem, setPaymentSystem] = useState<"harian" | "borongan" | "progress_pct">("borongan");
  const [boronganValue, setBoronganValue] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");


  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!scopeName) { setError("Nama scope wajib diisi"); return; }
    if (paymentSystem !== "harian" && !boronganValue) { setError("Nilai kontrak wajib diisi untuk sistem borongan/progress"); return; }
    setLoading(true); setError("");
    try {
      await api.post("/api/v1/mandor/work-scopes", {
        assignment_id: assignmentId,
        scope_name: scopeName,
        description: description || undefined,
        payment_system: paymentSystem,
        borongan_value: boronganValue ? Number(boronganValue.replace(/\D/g, "")) : undefined,
        start_date: startDate || undefined,
        end_date: endDate || undefined,
      });
      onSuccess();
    } catch (err: unknown) {
      setError((err as any)?.response?.data?.error ?? "Gagal menyimpan");
    } finally { setLoading(false); }
  }

  if (!mounted) return null;
  return createPortal(
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: "var(--pad-kartu-lega)" }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={{ background: "var(--surface)", borderRadius: 14, width: "100%", maxWidth: 480, boxShadow: "var(--naik-3)", maxHeight: "90vh", display: "flex", flexDirection: "column" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "20px 24px", borderBottom: `1px solid ${C.border}` }}>
          <div>
            <h2 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: C.text }}>Tambah Scope Pekerjaan</h2>
            <p style={{ margin: 0, fontSize: 12, color: C.muted, marginTop: 2 }}>Rincian item pekerjaan bisa ditambahkan setelah scope dibuat</p>
          </div>
          <button aria-label="Tutup" onClick={onClose} style={{ padding: 6, border: "none", background: "transparent", cursor: "pointer", color: C.mid }}><X size={18} /></button>
        </div>
        <form onSubmit={handleSubmit} style={{ padding: "20px 24px", display: "flex", flexDirection: "column", gap: 12, overflowY: "auto" }}>
          {error && <div style={{ padding: "8px 12px", borderRadius: 6, background: C.redBg, color: C.red, fontSize: 13, border: `1px solid ${C.redBorder}` }}>{error}</div>}
          <div>
            <label htmlFor="scope-name" style={{ fontSize: 12, fontWeight: 600, color: C.text, display: "block", marginBottom: 6 }}>Nama Scope Pekerjaan</label>
            <input className="isian-fokus" id="scope-name" value={scopeName} onChange={e => setScopeName(e.target.value)} placeholder="cth: Pekerjaan Struktur Lantai 1, Rangka Baja Atap" style={GAYA_ISIAN} required />
          </div>
          <div>
            <label htmlFor="description" style={{ fontSize: 12, fontWeight: 600, color: C.text, display: "block", marginBottom: 6 }}>Deskripsi (opsional)</label>
            <textarea className="isian-fokus" id="description" value={description} onChange={e => setDescription(e.target.value)} rows={2} placeholder="Detail lingkup pekerjaan..." style={{ ...GAYA_ISIAN, resize: "vertical" }} />
          </div>
          <div>
            <span id="sistem-pembayaran" style={{ fontSize: 12, fontWeight: 600, color: C.text, display: "block", marginBottom: 6 }}>Sistem Pembayaran</span>
            <div role="group" aria-labelledby="sistem-pembayaran" style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
              {(["borongan", "harian", "progress_pct"] as const).map(ps => (
                <button key={ps} type="button" onClick={() => setPaymentSystem(ps)}
                  style={{ padding: "8px 8px", borderRadius: 6, border: `2px solid ${paymentSystem === ps ? C.navy : C.border}`, background: paymentSystem === ps ? C.navyLight : "var(--surface)", cursor: "pointer", fontSize: 12, fontWeight: paymentSystem === ps ? 700 : 400, color: paymentSystem === ps ? C.navy : C.mid, textAlign: "center" }}>
                  {PAYMENT_SYSTEM[ps]}
                  <div style={{ fontSize: "var(--t-mikro)", fontWeight: 400, marginTop: 2, color: C.muted }}>
                    {ps === "borongan" ? "Bayar selesai" : ps === "harian" ? "Bayar per minggu" : "Bayar per %"}
                  </div>
                </button>
              ))}
            </div>
          </div>
          {paymentSystem !== "harian" && (
            <div>
              <label htmlFor="borongan-value-2" style={{ fontSize: 12, fontWeight: 600, color: C.text, display: "block", marginBottom: 6 }}>Nilai Kontrak (Rp)</label>
              <input className="isian-fokus" id="borongan-value-2"
                value={boronganValue}
                onChange={e => {
                  const raw = e.target.value.replace(/\D/g, "");
                  setBoronganValue(raw ? Number(raw).toLocaleString("id-ID") : "");
                }}
                placeholder="0" style={GAYA_ISIAN} required />
            </div>
          )}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            <div>
              <label htmlFor="start-date" style={{ fontSize: 12, fontWeight: 600, color: C.text, display: "block", marginBottom: 6 }}>Tanggal Mulai</label>
              <input className="isian-fokus" id="start-date" aria-label="Tanggal mulai" type="date" value={startDate} onChange={e => setStartDate(e.target.value)} style={GAYA_ISIAN} />
            </div>
            <div>
              <label htmlFor="end-date" style={{ fontSize: 12, fontWeight: 600, color: C.text, display: "block", marginBottom: 6 }}>Target Selesai</label>
              <input className="isian-fokus" id="end-date" aria-label="Tanggal akhir" type="date" value={endDate} onChange={e => setEndDate(e.target.value)} style={GAYA_ISIAN} />
            </div>
          </div>
          <div style={{ display: "flex", gap: 8, paddingTop: 4 }}>
            <button type="button" onClick={onClose} style={{ flex: 1, padding: "8px", borderRadius: 6, border: `1px solid ${C.border}`, background: "var(--surface)", cursor: "pointer", fontSize: 13, color: C.mid }}>Batal</button>
            <button type="submit" disabled={loading} style={{ flex: 2, padding: "8px", borderRadius: 6, border: "none", background: "var(--grad-aksen)", color: "var(--surface)", cursor: loading ? "wait" : "pointer", fontSize: 13, fontWeight: 600 }}>
              {loading ? "Menyimpan..." : "Simpan Scope"}
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body
  );
}

// ─── Modal: Detail Scope + Rincian Items ─────────────────────────────────────
export function ScopeDetailModal({ data, loading: isLoading, onClose, onRefresh, onAddItem }: {
  data: ScopeDetail | null;
  loading: boolean;
  onClose: () => void;
  onRefresh: () => void;
  onAddItem: () => void;
}) {
  useTutupEsc(onClose);
  const mounted = useMounted();
  const { symbolOf } = useUnits(); // resolver satuan dari master `units` (fallback legacy)
  const { labelOf } = useWorkCategories(); // resolver kategori dari master `work_categories`
  useEffect(() => { document.body.style.overflow = "hidden"; return () => { document.body.style.overflow = ""; }; }, []);

  if (!mounted) return null;

  const scope = data?.scope;
  const items = data?.items ?? [];
  const totalSubtotal = items.reduce((s, i) => s + Number(i.subtotal), 0);
  const totalDone = items.reduce((s, i) => s + Number(i.volume_done) * Number(i.unit_price), 0);
  const overallPct = totalSubtotal > 0 ? (totalDone / totalSubtotal) * 100 : 0;

  return createPortal(
    <div style={{ position: "fixed", inset: 0, zIndex: 1000, display: "flex" }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      {/* Backdrop */}
      <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.35)" }} onClick={onClose} />
      {/* Slide-over panel */}
      <div style={{ position: "absolute", top: 0, right: 0, bottom: 0, width: 480, background: "var(--surface)", boxShadow: "-4px 0 32px rgba(0,0,0,0.18)", display: "flex", flexDirection: "column" }}>
        <div style={{ padding: "20px 24px", borderBottom: `1px solid ${C.border}`, display: "flex", alignItems: "flex-start", justifyContent: "space-between", flexShrink: 0 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            {isLoading ? (
              <div style={{ color: C.muted, fontSize: 13 }}>Memuat...</div>
            ) : scope ? (
              <>
                <h2 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: C.text }}>{scope.scope_name}</h2>
                <div style={{ display: "flex", gap: 8, marginTop: 6, flexWrap: "wrap" }}>
                  {(() => { const b = getPaymentSystemBadge(scope.payment_system); return (
                    <span style={{ fontSize: "var(--t-kecil)", padding: "2px 8px", borderRadius: 10, background: b.bg, color: b.color, border: `1px solid ${b.border}`, fontWeight: 600 }}>{b.label}</span>
                  ); })()}
                  {scope.borongan_value && <span style={{ fontSize: "var(--t-kecil)", color: C.mid }}>Nilai: {new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(scope.borongan_value)}</span>}
                  {scope.start_date && <span style={{ fontSize: "var(--t-kecil)", color: C.muted }}>{new Date(scope.start_date).toLocaleDateString("id-ID", { day: "numeric", month: "short" })} {scope.end_date ? `– ${new Date(scope.end_date).toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" })}` : ""}</span>}
                </div>
              </>
            ) : null}
          </div>
          <div style={{ display: "flex", gap: 8, flexShrink: 0, marginLeft: 12 }}>
            <button onClick={onRefresh} style={{ padding: "6px 8px", borderRadius: 6, border: `1px solid ${C.border}`, background: "var(--surface)", cursor: "pointer", fontSize: 12, color: C.mid, display: "flex", alignItems: "center", gap: 4 }}>
              <RefreshCw size={12} /> Refresh
            </button>
            <button onClick={onAddItem} style={{ padding: "6px 12px", borderRadius: 6, border: "none", background: "var(--grad-aksen)", color: "var(--surface)", cursor: "pointer", fontSize: 12, fontWeight: 600, display: "flex", alignItems: "center", gap: 4 }}>
              <Plus size={12} /> Tambah Item
            </button>
            <button aria-label="Tutup" onClick={onClose} style={{ padding: 6, border: "none", background: "transparent", cursor: "pointer", color: C.mid }}><X size={18} /></button>
          </div>
        </div>

        {!isLoading && items.length > 0 && (
          <div style={{ padding: "12px 24px", background: "var(--bg)", borderBottom: `1px solid ${C.border}`, display: "flex", alignItems: "center", gap: "var(--gap-grid)" }}>
            <div style={{ flex: 1 }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 5 }}>
                <span style={{ fontSize: 12, color: C.muted }}>Progress Keseluruhan</span>
                <span style={{ fontSize: 12, fontWeight: 700, color: getProgressColor(overallPct) }}>{overallPct.toFixed(1)}%</span>
              </div>
              <div style={{ height: 6, borderRadius: 0, background: C.border, overflow: "hidden" }}>
                <div style={{ height: "100%", borderRadius: 0, background: getProgressColor(overallPct), width: `${overallPct}%` }} />
              </div>
            </div>
            <div style={{ textAlign: "right", flexShrink: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: C.navy }}>{new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(totalSubtotal)}</div>
              <div style={{ fontSize: "var(--t-kecil)", color: C.muted }}>total nilai {items.length} item</div>
            </div>
          </div>
        )}

        <div style={{ flex: 1, overflowY: "auto", padding: "16px 24px" }}>
          {isLoading ? (
            <div style={{ textAlign: "center", padding: 40, color: C.muted }}>Memuat rincian...</div>
          ) : items.length === 0 ? (
            <div style={{ textAlign: "center", padding: 40, color: C.muted }}>
              <FileText size={28} color={C.border} style={{ marginBottom: 10 }} />
              <div style={{ fontWeight: 600, marginBottom: 4 }}>Belum ada rincian item</div>
              <div style={{ fontSize: 12 }}>Klik “Tambah Item” untuk menambah rincian pekerjaan</div>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {Object.entries(
                items.reduce((acc, item) => {
                  if (!acc[item.category]) acc[item.category] = [];
                  acc[item.category].push(item);
                  return acc;
                }, {} as Record<string, ScopeItem[]>)
              ).map(([cat, catItems]) => {
                const catColor = CATEGORY_COLORS[cat] ?? CATEGORY_COLORS.lain_lain;
                const catTotal = catItems.reduce((s, i) => s + Number(i.subtotal), 0);
                return (
                  <div key={cat}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                      <span style={{ fontSize: "var(--t-kecil)", fontWeight: 700, padding: "2px 8px", borderRadius: 10, background: catColor.bg, color: catColor.color }}>
                        {labelOf(cat)}
                      </span>
                      <span style={{ fontSize: "var(--t-kecil)", color: C.muted }}>{catItems.length} item · {new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(catTotal)}</span>
                    </div>
                    {catItems.map(item => {
                      const pct = Number(item.pct_done);
                      const pctColor = getProgressColor(pct);
                      return (
                        <div key={item.id} style={{ padding: "12px var(--pad-kartu-lega)", borderRadius: 10, border: `1px solid ${C.border}`, background: "var(--surface-subtle)", marginBottom: 6 }}>
                          <div style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ fontSize: 13, fontWeight: 600, color: C.text, marginBottom: 4 }}>{item.item_name}</div>
                              {item.description && <div style={{ fontSize: 12, color: C.muted, marginBottom: 4 }}>{item.description}</div>}
                              {item.specs && item.specs.length > 0 && (
                                <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 6 }}>
                                  {item.specs.map(sp => (
                                    <span key={sp.id} style={{ fontSize: "var(--t-mikro)", padding: "2px 8px", borderRadius: 6, background: "var(--info-bg)", color: C.navy, border: "1px solid #C7D7F5" }}>
                                      {sp.spec_key}: <strong>{sp.spec_value}</strong>
                                    </span>
                                  ))}
                                </div>
                              )}
                              <div style={{ fontSize: 12, color: C.mid }}>
                                {item.volume.toLocaleString("id-ID")} {symbolOf(item.unit)} × {new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(item.unit_price)}/{symbolOf(item.unit)}
                              </div>
                              <div style={{ marginTop: 8, display: "flex", alignItems: "center", gap: 8 }}>
                                <div style={{ flex: 1, height: 4, borderRadius: 0, background: C.border, overflow: "hidden" }}>
                                  <div style={{ height: "100%", borderRadius: 0, background: pctColor, width: `${pct}%` }} />
                                </div>
                                <span style={{ fontSize: "var(--t-kecil)", color: pctColor, fontWeight: 600, flexShrink: 0 }}>
                                  {Number(item.volume_done).toLocaleString("id-ID")}/{Number(item.volume).toLocaleString("id-ID")} {symbolOf(item.unit)} ({pct.toFixed(0)}%)
                                </span>
                              </div>
                            </div>
                            <div style={{ textAlign: "right", flexShrink: 0 }}>
                              <div style={{ fontSize: 13, fontWeight: 700, color: C.navy }}>{new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(item.subtotal)}</div>
                              {item.notes && <div style={{ fontSize: "var(--t-kecil)", color: C.muted, fontStyle: "italic", marginTop: 2 }}>{item.notes}</div>}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}

// ─── Modal: Tambah Item Rincian Pekerjaan ─────────────────────────────────────
export function AddScopeItemModal({ scopeId, onClose, onSuccess }: {
  scopeId: string;
  onClose: () => void;
  onSuccess: () => void;
}) {
  useTutupEsc(onClose);
  const mounted = useMounted();
  const { grouped, symbolOf } = useUnits(); // dropdown satuan dari master `units`; mandor simpan code
  const { categories: workCategories } = useWorkCategories(); // dropdown kategori dari master `work_categories`
  useEffect(() => { document.body.style.overflow = "hidden"; return () => { document.body.style.overflow = ""; }; }, []);

  const [itemName, setItemName] = useState("");
  const [category, setCategory] = useState("lain_lain");
  const [description, setDescription] = useState("");
  const [unit, setUnit] = useState("m2");
  const [volume, setVolume] = useState("");
  const [unitPrice, setUnitPrice] = useState("");
  const [volumeDone, setVolumeDone] = useState("0");
  const [notes, setNotes] = useState("");
  const [specs, setSpecs] = useState<{ key: string; value: string }[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const estSubtotal = (Number(volume) || 0) * (Number(String(unitPrice).replace(/\D/g, "")) || 0);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const vol = Number(volume);
    const price = Number(String(unitPrice).replace(/\D/g, ""));
    if (!itemName || !vol || !price) { setError("Nama item, volume, dan harga satuan wajib diisi"); return; }
    setLoading(true); setError("");
    try {
      await api.post(`/api/v1/mandor/work-scopes/${scopeId}/items`, {
        item_name: itemName,
        category,
        description: description || undefined,
        unit,
        volume: vol,
        unit_price: price,
        volume_done: Number(volumeDone) || 0,
        notes: notes || undefined,
        specs: specs.filter(s => s.key && s.value).map((s, i) => ({ spec_key: s.key, spec_value: s.value, sort_order: i })),
      });
      onSuccess();
    } catch (err: unknown) {
      setError((err as any)?.response?.data?.error ?? "Gagal menyimpan");
    } finally { setLoading(false); }
  }

  // Satuan dari master `units` (sumber tunggal). Fallback statis dipertahankan agar
  // dropdown tetap terisi bila master belum termuat / fetch gagal (nilai = code).
  const FALLBACK_UNITS_GROUPED: { group: string; opts: [string, string][] }[] = [
    { group: "Area", opts: [["m2", "m²"]] },
    { group: "Volume", opts: [["m3", "m³"]] },
    { group: "Panjang", opts: [["m", "m"], ["m_linear", "m'"]] },
    { group: "Berat", opts: [["kg", "kg"], ["ton", "ton"]] },
    { group: "Unit/Buah", opts: [["unit", "unit"], ["buah", "buah"], ["titik", "titik"], ["batang", "batang"], ["lembar", "lembar"]] },
    { group: "Set/Lot", opts: [["set", "set"], ["ls", "ls"]] },
    { group: "Waktu", opts: [["hari", "hari"], ["minggu", "minggu"]] },
  ];
  const UNITS_GROUPED: { group: string; opts: [string, string][] }[] = grouped.length > 0
    ? grouped.map(g => ({ group: g.label, opts: g.items.map(u => [u.code, u.symbol] as [string, string]) }))
    : FALLBACK_UNITS_GROUPED;

  if (!mounted) return null;
  return createPortal(
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: "var(--pad-kartu-lega)" }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={{ background: "var(--surface)", borderRadius: 14, width: "100%", maxWidth: 560, boxShadow: "var(--naik-3)", display: "flex", flexDirection: "column", maxHeight: "92vh" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "20px 24px", borderBottom: `1px solid ${C.border}` }}>
          <div>
            <h2 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: C.text }}>Tambah Item Pekerjaan</h2>
            <p style={{ margin: 0, fontSize: 12, color: C.muted, marginTop: 2 }}>Rincian pekerjaan: sipil, baja WF, MEP, finishing</p>
          </div>
          <button aria-label="Tutup" onClick={onClose} style={{ padding: 6, border: "none", background: "transparent", cursor: "pointer", color: C.mid }}><X size={18} /></button>
        </div>
        <form onSubmit={handleSubmit} style={{ padding: "20px 24px", display: "flex", flexDirection: "column", gap: 12, overflowY: "auto" }}>
          {error && <div style={{ padding: "8px 12px", borderRadius: 6, background: C.redBg, color: C.red, fontSize: 13, border: `1px solid ${C.redBorder}` }}>{error}</div>}
          <div>
            <label htmlFor="item-name" style={{ fontSize: 12, fontWeight: 600, color: C.text, display: "block", marginBottom: 6 }}>Nama Item Pekerjaan</label>
            <input className="isian-fokus" id="item-name" value={itemName} onChange={e => setItemName(e.target.value)} placeholder="cth: Kolom Baja WF 200x100, Pasang Keramik 60x60, Cor Pondasi" style={GAYA_ISIAN} required />
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            <div>
              <label htmlFor="category" style={{ fontSize: 12, fontWeight: 600, color: C.text, display: "block", marginBottom: 6 }}>Kategori</label>
              <Pilihan className="isian-fokus" id="category" aria-label="Kategori" value={category} onChange={e => setCategory(e.target.value)} style={GAYA_ISIAN}>
                {(workCategories.length > 0
                  ? workCategories.map(c => [c.code, c.label] as [string, string])
                  : Object.entries(CATEGORY_LABELS)
                ).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </Pilihan>
            </div>
            <div>
              <label htmlFor="unit" style={{ fontSize: 12, fontWeight: 600, color: C.text, display: "block", marginBottom: 6 }}>Satuan</label>
              <Pilihan className="isian-fokus" id="unit" aria-label="Satuan" value={unit} onChange={e => setUnit(e.target.value)} style={GAYA_ISIAN}>
                {UNITS_GROUPED.map(g => (
                  <optgroup key={g.group} label={g.group}>
                    {g.opts.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                  </optgroup>
                ))}
              </Pilihan>
            </div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: C.text, display: "block", marginBottom: 6 }}>Volume ({symbolOf(unit)})</label>
              <input className="isian-fokus" value={volume} onChange={e => setVolume(e.target.value.replace(/[^0-9.]/g, ""))} placeholder="0" style={GAYA_ISIAN} required />
            </div>
            <div>
              <label htmlFor="unit-price" style={{ fontSize: 12, fontWeight: 600, color: C.text, display: "block", marginBottom: 6 }}>Harga/satuan (Rp)</label>
              <input className="isian-fokus" id="unit-price" value={unitPrice} onChange={e => { const r = e.target.value.replace(/\D/g, ""); setUnitPrice(r ? Number(r).toLocaleString("id-ID") : ""); }} placeholder="0" style={GAYA_ISIAN} required />
            </div>
          </div>
          {estSubtotal > 0 && (
            <div style={{ padding: "8px 12px", borderRadius: 6, background: C.navyLight, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontSize: 12, color: C.navy }}>Estimasi subtotal</span>
              <span style={{ fontSize: 13, fontWeight: 700, color: C.navy }}>{new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(estSubtotal)}</span>
            </div>
          )}
          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: C.text, display: "block", marginBottom: 6 }}>Volume Sudah Dikerjakan ({symbolOf(unit)}) — opsional</label>
            <input className="isian-fokus" value={volumeDone} onChange={e => setVolumeDone(e.target.value.replace(/[^0-9.]/g, ""))} placeholder="0" style={GAYA_ISIAN} />
          </div>
          <div>
            <label htmlFor="description-2" style={{ fontSize: 12, fontWeight: 600, color: C.text, display: "block", marginBottom: 6 }}>Deskripsi (opsional)</label>
            <textarea className="isian-fokus" id="description-2" value={description} onChange={e => setDescription(e.target.value)} rows={2} placeholder="Spesifikasi teknis umum, dll" style={{ ...GAYA_ISIAN, resize: "vertical" }} />
          </div>
          <div>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
              <span style={{ fontSize: 12, fontWeight: 600, color: C.text }}>Spesifikasi Teknis (opsional)</span>
              <button type="button" onClick={() => setSpecs([...specs, { key: "", value: "" }])}
                style={{ fontSize: "var(--t-kecil)", padding: "2px 8px", borderRadius: 6, border: `1px solid ${C.border}`, background: "var(--surface)", cursor: "pointer", color: C.navy }}>
                + Tambah Spec
              </button>
            </div>
            <div style={{ fontSize: "var(--t-kecil)", color: C.muted, marginBottom: 8 }}>Contoh: Profil → WF 200x100x5.5x8, Grade → BJ41, Diameter → 4 inch</div>
            {specs.map((sp, i) => (
              <div key={i} style={{ display: "grid", gridTemplateColumns: "1fr 1fr auto", gap: 6, marginBottom: 6 }}>
                <input className="isian-fokus" value={sp.key} onChange={e => { const s = [...specs]; s[i].key = e.target.value; setSpecs(s); }} placeholder="Nama spec" style={{ ...GAYA_ISIAN, fontSize: 12 }} />
                <input className="isian-fokus" value={sp.value} onChange={e => { const s = [...specs]; s[i].value = e.target.value; setSpecs(s); }} placeholder="Nilai" style={{ ...GAYA_ISIAN, fontSize: 12 }} />
                <button aria-label="Hapus item" type="button" onClick={() => setSpecs(specs.filter((_, j) => j !== i))} style={{ padding: "6px 8px", borderRadius: 6, border: `1px solid ${C.redBorder}`, background: C.redBg, cursor: "pointer", color: C.red }}>
                  <X size={12} />
                </button>
              </div>
            ))}
          </div>
          <div>
            <label htmlFor="notes-4" style={{ fontSize: 12, fontWeight: 600, color: C.text, display: "block", marginBottom: 6 }}>Catatan (opsional)</label>
            <input className="isian-fokus" id="notes-4" value={notes} onChange={e => setNotes(e.target.value)} placeholder="Catatan tambahan..." style={GAYA_ISIAN} />
          </div>
          <div style={{ display: "flex", gap: 8, paddingTop: 4 }}>
            <button type="button" onClick={onClose} style={{ flex: 1, padding: "8px", borderRadius: 6, border: `1px solid ${C.border}`, background: "var(--surface)", cursor: "pointer", fontSize: 13, color: C.mid }}>Batal</button>
            <button type="submit" disabled={loading} style={{ flex: 2, padding: "8px", borderRadius: 6, border: "none", background: "var(--grad-aksen)", color: "var(--surface)", cursor: loading ? "wait" : "pointer", fontSize: 13, fontWeight: 600 }}>
              {loading ? "Menyimpan..." : "Simpan Item"}
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body
  );
}

// ─── Modal: Settlement Borongan ───────────────────────────────────────────────
export function SettlementBoronganModal({ data, cashAccounts, onClose, onSuccess }: {
  data: SettlementModalState;
  cashAccounts: CashAccount[];
  onClose: () => void;
  onSuccess: () => void;
}) {
  useTutupEsc(onClose);
  const mounted = useMounted();
  useEffect(() => { document.body.style.overflow = "hidden"; return () => { document.body.style.overflow = ""; }; }, []);

  const [boronganValue, setBoronganValue] = useState(String(data.boronganValue || ""));
  const [totalKasbon, setTotalKasbon] = useState(String(data.totalKasbon || ""));
  const [totalOtherExpense, setTotalOtherExpense] = useState("0");
  const [cashAccountId, setCashAccountId] = useState("");
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const bv = Number(boronganValue) || 0;
  const tk = Number(totalKasbon) || 0;
  const toe = Number(totalOtherExpense) || 0;
  const netPayment = Math.max(0, bv - tk - toe);
  const fmtLocal = formatRupiah;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!cashAccountId) { setError("Pilih akun kas terlebih dahulu"); return; }
    if (bv <= 0) { setError("Nilai kontrak harus diisi"); return; }
    setLoading(true); setError("");
    try {
      await api.post("/api/v1/mandor/borongan-settlements", {
        work_scope_id: data.scopeId,
        borongan_value: bv,
        total_kasbon: tk,
        total_other_expense: toe,
        net_payment: netPayment,
        cash_account_id: cashAccountId,
        notes: notes || undefined,
      });
      onSuccess();
    } catch (err: any) {
      setError(err.response?.data?.error ?? "Gagal mencairkan settlement");
    } finally { setLoading(false); }
  }


  if (!mounted) return null;
  return createPortal(
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", zIndex: 1500, display: "flex", alignItems: "center", justifyContent: "center", padding: "var(--pad-kartu-lega)" }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={{ background: "var(--surface)", borderRadius: 14, width: "100%", maxWidth: 480, boxShadow: "var(--naik-3)", maxHeight: "90vh", overflow: "auto" }}>
        <div style={{ padding: "20px 24px", borderBottom: `1px solid ${C.border}` }}>
          <h2 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: C.text }}>Cairkan Settlement Borongan</h2>
          <p style={{ margin: "4px 0 0", fontSize: 12, color: C.mid }}>{data.scopeName} · {data.mandorName} · {data.projectName}</p>
        </div>
        <form onSubmit={handleSubmit} style={{ padding: "20px 24px", display: "flex", flexDirection: "column", gap: 12 }}>
          {error && <div style={{ padding: "8px 12px", borderRadius: 6, background: "var(--danger-bg)", color: "var(--danger)", fontSize: 13, border: "1px solid var(--danger-border)" }}>{error}</div>}
          <div>
            <label htmlFor="borongan-value" style={{ fontSize: 12, fontWeight: 600, color: C.text, display: "block", marginBottom: 5 }}>Nilai Kontrak Borongan (Rp) *</label>
            <input className="isian-fokus" id="borongan-value" type="number" min={1} value={boronganValue} onChange={e => setBoronganValue(e.target.value)} placeholder="0" style={GAYA_ISIAN} />
          </div>
          <div>
            <label htmlFor="total-kasbon" style={{ fontSize: 12, fontWeight: 600, color: C.text, display: "block", marginBottom: 5 }}>Total Kasbon Mandor (Rp)</label>
            <input className="isian-fokus" id="total-kasbon" type="number" min={0} value={totalKasbon} onChange={e => setTotalKasbon(e.target.value)} placeholder="0" style={GAYA_ISIAN} />
            <div style={{ fontSize: "var(--t-kecil)", color: C.muted, marginTop: 3 }}>Kasbon yang sudah diajukan mandor untuk scope ini</div>
          </div>
          <div>
            <label htmlFor="total-other-expense" style={{ fontSize: 12, fontWeight: 600, color: C.text, display: "block", marginBottom: 5 }}>Pengeluaran Lain (Rp)</label>
            <input className="isian-fokus" id="total-other-expense" type="number" min={0} value={totalOtherExpense} onChange={e => setTotalOtherExpense(e.target.value)} placeholder="0" style={GAYA_ISIAN} />
          </div>
          <div style={{ background: "var(--navy-light)", borderRadius: 10, padding: "12px 16px", display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            <div>
              <div style={{ fontSize: "var(--t-mikro)", color: "var(--text-secondary)", marginBottom: 2 }}>Nilai Kontrak</div>
              <div style={{ fontSize: 13, fontWeight: 700, color: "var(--navy)" }}>{fmtLocal(bv)}</div>
            </div>
            <div>
              <div style={{ fontSize: "var(--t-mikro)", color: "var(--text-secondary)", marginBottom: 2 }}>Potongan</div>
              <div style={{ fontSize: 13, fontWeight: 700, color: "var(--danger)" }}>- {fmtLocal(tk + toe)}</div>
            </div>
            <div style={{ gridColumn: "span 2", borderTop: "1px solid var(--border)", paddingTop: 10 }}>
              <div style={{ fontSize: "var(--t-mikro)", color: "var(--text-secondary)", marginBottom: 2 }}>Net Pembayaran</div>
              <div style={{ fontSize: 20, fontWeight: 800, color: netPayment > 0 ? "var(--success)" : "var(--text-secondary)" }}>{fmtLocal(netPayment)}</div>
            </div>
          </div>
          <div>
            <label htmlFor="cash-account-id-2" style={{ fontSize: 12, fontWeight: 600, color: C.text, display: "block", marginBottom: 5 }}>Akun Kas *</label>
            <Pilihan className="isian-fokus" id="cash-account-id-2" aria-label="Sumber kas pembayaran" value={cashAccountId} onChange={e => setCashAccountId(e.target.value)} style={GAYA_ISIAN}>
              <option value="">Pilih akun kas...</option>
              {cashAccounts.map(a => (
                <option key={a.id} value={a.id}>{a.name} -- {fmtLocal(a.balance)}</option>
              ))}
            </Pilihan>
          </div>
          <div>
            <label htmlFor="notes-5" style={{ fontSize: 12, fontWeight: 600, color: C.text, display: "block", marginBottom: 5 }}>Catatan</label>
            <textarea className="isian-fokus" id="notes-5" value={notes} onChange={e => setNotes(e.target.value)} rows={2} placeholder="Opsional" style={{ ...GAYA_ISIAN, resize: "none" }} />
          </div>
          <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
            <button type="button" onClick={onClose} style={{ flex: 1, padding: "8px", borderRadius: 6, border: "1px solid var(--border)", background: "var(--surface)", fontSize: 13, color: "var(--text-secondary)", cursor: "pointer" }}>Batal</button>
            <button type="submit" disabled={loading} style={{ flex: 2, padding: "8px", borderRadius: 6, border: "none", background: loading ? "var(--text-secondary)" : "var(--success)", color: "var(--surface)", fontSize: 13, fontWeight: 600, cursor: loading ? "wait" : "pointer" }}>
              {loading ? "Memproses..." : `Cairkan ${fmtLocal(netPayment)}`}
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body
  );
}

// ─── Modal: Konfirmasi Progress Payment ──────────────────────────────────────
export function PPConfirmModal({ payment, cashAccounts, loading, onClose, onAction }: {
  payment: ProgressPayment;
  cashAccounts: CashAccount[];
  loading: boolean;
  onClose: () => void;
  onAction: (action: "approved" | "rejected", cashAccountId?: string, notes?: string) => Promise<void>;
}) {
  useTutupEsc(onClose);
  const mounted = useMounted();
  useEffect(() => { document.body.style.overflow = "hidden"; return () => { document.body.style.overflow = ""; }; }, []);

  const [cashAccountId, setCashAccountId] = useState("");
  const [notes, setNotes] = useState("");
  const [mode, setMode] = useState<"approve" | "reject">("approve");
  const fmtLocal = formatRupiah;

  if (!mounted) return null;
  return createPortal(
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", zIndex: 1500, display: "flex", alignItems: "center", justifyContent: "center", padding: "var(--pad-kartu-lega)" }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={{ background: "var(--surface)", borderRadius: 14, width: "100%", maxWidth: 440, boxShadow: "var(--naik-3)" }}>
        <div style={{ padding: "20px 24px", borderBottom: "1px solid var(--border)" }}>
          <h2 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: C.text }}>Tinjau Penagihan Progress</h2>
          <p style={{ margin: "4px 0 0", fontSize: 12, color: C.mid }}>{payment.work_scope?.scope_name ?? "---"} - {payment.project?.name ?? "---"}</p>
        </div>
        <div style={{ padding: "16px 24px", background: "var(--bg)", display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, borderBottom: "1px solid var(--border)" }}>
          <div>
            <div style={{ fontSize: "var(--t-mikro)", color: "var(--text-secondary)", marginBottom: 2 }}>Diajukan oleh</div>
            <div style={{ fontSize: 13, fontWeight: 600, color: C.text }}>{payment.requester?.name ?? "---"}</div>
          </div>
          <div>
            <div style={{ fontSize: "var(--t-mikro)", color: "var(--text-secondary)", marginBottom: 2 }}>Progress Klaim</div>
            <div style={{ fontSize: 13, fontWeight: 600, color: "var(--navy)" }}>{payment.pct_done}%</div>
          </div>
          <div style={{ gridColumn: "span 2" }}>
            <div style={{ fontSize: "var(--t-mikro)", color: "var(--text-secondary)", marginBottom: 2 }}>Jumlah Tagihan</div>
            <div style={{ fontSize: 17, fontWeight: 800, color: C.text }}>{fmtLocal(payment.gross_payment)}</div>
          </div>
          {payment.notes && (
            <div style={{ gridColumn: "span 2" }}>
              <div style={{ fontSize: "var(--t-mikro)", color: "var(--text-secondary)", marginBottom: 2 }}>Catatan Mandor</div>
              <div style={{ fontSize: 12, color: "var(--text-secondary)", fontStyle: "italic" }}>{payment.notes}</div>
            </div>
          )}
        </div>
        <div style={{ padding: "20px 24px", display: "flex", flexDirection: "column", gap: 12 }}>
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={() => setMode("approve")} style={{ flex: 1, padding: "8px", borderRadius: 6, border: `1px solid ${mode === "approve" ? "var(--success)" : "var(--border)"}`, background: mode === "approve" ? "var(--success-bg)" : "var(--surface)", color: mode === "approve" ? "var(--success)" : "var(--text-secondary)", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
              Setujui
            </button>
            <button onClick={() => setMode("reject")} style={{ flex: 1, padding: "8px", borderRadius: 6, border: `1px solid ${mode === "reject" ? "var(--danger)" : "var(--border)"}`, background: mode === "reject" ? "var(--danger-bg)" : "var(--surface)", color: mode === "reject" ? "var(--danger)" : "var(--text-secondary)", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
              Tolak
            </button>
          </div>
          {mode === "approve" && (
            <div>
              <label htmlFor="cash-account-id-3" style={{ fontSize: 12, fontWeight: 600, color: C.text, display: "block", marginBottom: 5 }}>Akun Kas *</label>
              <Pilihan className="isian-fokus" id="cash-account-id-3" aria-label="Sumber kas pembayaran" value={cashAccountId} onChange={e => setCashAccountId(e.target.value)} style={GAYA_ISIAN}>
                <option value="">Pilih akun kas...</option>
                {cashAccounts.map(a => <option key={a.id} value={a.id}>{a.name} -- {fmtLocal(a.balance)}</option>)}
              </Pilihan>
            </div>
          )}
          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: C.text, display: "block", marginBottom: 5 }}>
              {mode === "reject" ? "Alasan Penolakan *" : "Catatan (opsional)"}
            </label>
            <textarea className="isian-fokus" value={notes} onChange={e => setNotes(e.target.value)} rows={2}
              placeholder={mode === "reject" ? "Jelaskan alasan penolakan..." : "Opsional"}
              style={{ ...GAYA_ISIAN, resize: "none" }} />
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={onClose} style={{ flex: 1, padding: "8px", borderRadius: 6, border: "1px solid var(--border)", background: "var(--surface)", fontSize: 13, color: "var(--text-secondary)", cursor: "pointer" }}>Batal</button>
            <button
              onClick={() => {
                if (mode === "approve" && !cashAccountId) { void kabari("Tidak berhasil", "Pilih akun kas"); return; }
                if (mode === "reject" && !notes.trim()) { void kabari("Tidak berhasil", "Isi alasan penolakan"); return; }
                onAction(mode === "approve" ? "approved" : "rejected", cashAccountId || undefined, notes || undefined);
              }}
              disabled={loading}
              style={{ flex: 2, padding: "8px", borderRadius: 6, border: "none", background: loading ? "var(--text-secondary)" : mode === "approve" ? "var(--success)" : "var(--danger)", color: "var(--surface)", fontSize: 13, fontWeight: 600, cursor: loading ? "wait" : "pointer" }}>
              {loading ? "Memproses..." : mode === "approve" ? "Setujui & Bayar" : "Tolak Tagihan"}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}


/**
 * Tombol tab — DIDEFINISIKAN DI LEVEL MODUL, bukan di dalam render.
 *
 * Versi lama membuatnya di dalam , dan
 *  menandai SETIAP pemakaiannya (6 warning,
 * naik jadi 7 saat tab Retensi ditambahkan).
 *
 * Peringatannya benar, dan bukan soal gaya: komponen yang lahir ulang tiap
 * render membuat React membongkar-pasang seluruh sub-pohonnya — state di
 * dalamnya hilang, dan transisi CSS mulai dari nol tiap induknya render.
 *
 *  dan  dulu ditutup lewat closure; sekarang jadi prop.
 */
