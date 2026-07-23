"use client";

import { useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api";
import { Landmark, Plus, Check, X, CalendarClock, AlertTriangle, Info } from "lucide-react";

// ─── Design tokens (konsisten Architectural Precision, sama dgn /pengaturan/roles) ──
const C = {
  navy: "var(--navy)", navyLight: "var(--navy-light)",
  text: "var(--text-primary)", mid: "var(--text-secondary)", muted: "var(--text-muted)",
  border: "var(--border)", bg: "var(--bg)", surface: "var(--surface)",
  green: "var(--success)", greenBg: "var(--success-bg)",
  red: "var(--danger)", redBg: "var(--danger-bg)",
  amber: "var(--warning)", amberBg: "var(--warning-bg)",
};
const card: React.CSSProperties = {
  background: "var(--surface)", border: "1px solid #E5E7EB",
  borderRadius: 14, boxShadow: "0 1px 4px rgba(0,0,0,0.06)",
};

interface ConfigRow {
  key: string;
  value: number | string | boolean;
  value_type: string;
  effective_from: string;   // YYYY-MM-DD
  effective_to: string | null;
  note: string | null;
}

// Kelompok config finansial yang dikelola halaman ini. Menambah retensi/denda kelak
// = tambah entri di sini + backend (config-first).
const pctFmt = (v: number) => `${(v * 100).toFixed(2)}%`;   // financial_config = fraksi 0..1
const FINANCE_KEYS: { key: string; label: string; hint: string; format: (v: number) => string }[] = [
  { key: "tax.ppn_rate", label: "PPN", hint: "Pajak Pertambahan Nilai (klien badan/B2B)", format: pctFmt },
  { key: "tax.pph_final_rate", label: "PPh Final 4(2)", hint: "PPh final jasa konstruksi (klien perorangan)", format: pctFmt },
  { key: "retention.default_pct", label: "Retensi (default proyek baru)", hint: "Persentase ditahan sampai akhir masa pemeliharaan; bisa di-override per proyek", format: pctFmt },
];

function hasFinancePerm(): boolean {
  try {
    const raw = localStorage.getItem("puraloka_permissions");
    const perms = raw ? (JSON.parse(raw) as string[]) : [];
    return perms.includes("settings:finance:manage");
  } catch { return false; }
}

function todayWIB(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Jakarta" });
}

export default function KeuanganSettingsPage() {
  const [rows, setRows] = useState<ConfigRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [canEdit, setCanEdit] = useState(false);
  const [editKey, setEditKey] = useState<string | null>(null);
  const [pct, setPct] = useState("");
  const [effFrom, setEffFrom] = useState(todayWIB());
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{ type: "ok" | "err"; msg: string } | null>(null);
  const [kasbonLimitOn, setKasbonLimitOn] = useState(false);
  const [togglingKasbon, setTogglingKasbon] = useState(false);
  const [dpPct, setDpPct] = useState("");
  const [maintDays, setMaintDays] = useState("");
  const [savingDefaults, setSavingDefaults] = useState(false);

  useEffect(() => {
    setCanEdit(hasFinancePerm());
    load();
    api.get<{ enabled: boolean }>("/api/v1/settings/kasbon-limit")
      .then(({ data }) => setKasbonLimitOn(data.enabled))
      .catch(() => {});
    api.get<{ dp_default_pct: number; maintenance_days: number }>("/api/v1/settings/project-defaults")
      .then(({ data }) => { setDpPct(String(data.dp_default_pct)); setMaintDays(String(data.maintenance_days)); })
      .catch(() => {});
  }, []);

  async function saveProjectDefaults() {
    const dp = parseFloat(dpPct), md = parseInt(maintDays);
    if (isNaN(dp) || dp < 0 || dp > 100) { setToast({ type: "err", msg: "DP harus 0–100%" }); return; }
    if (isNaN(md) || md < 0 || md > 3650) { setToast({ type: "err", msg: "Masa pemeliharaan 0–3650 hari" }); return; }
    setSavingDefaults(true);
    try {
      await api.put("/api/v1/settings/project-defaults", { dp_default_pct: dp, maintenance_days: md });
      setToast({ type: "ok", msg: "Default proyek baru disimpan" });
    } catch (e) {
      const msg = (e as { response?: { data?: { error?: string } } })?.response?.data?.error;
      setToast({ type: "err", msg: msg ?? "Gagal menyimpan" });
    } finally { setSavingDefaults(false); }
  }

  async function toggleKasbonLimit(next: boolean) {
    setTogglingKasbon(true);
    try {
      await api.put("/api/v1/settings/kasbon-limit", { enabled: next });
      setKasbonLimitOn(next);
      setToast({ type: "ok", msg: next ? "Batas kasbon diaktifkan" : "Batas kasbon dimatikan" });
    } catch (e) {
      const msg = (e as { response?: { data?: { error?: string } } })?.response?.data?.error;
      setToast({ type: "err", msg: msg ?? "Gagal mengubah batas kasbon" });
    } finally { setTogglingKasbon(false); }
  }

  async function load() {
    setLoading(true);
    try {
      const { data } = await api.get<{ config: ConfigRow[] }>("/api/v1/settings/finance");
      setRows(data.config ?? []);
    } catch {
      setToast({ type: "err", msg: "Gagal memuat konfigurasi keuangan" });
    } finally { setLoading(false); }
  }

  const byKey = useMemo(() => {
    const m: Record<string, ConfigRow[]> = {};
    for (const r of rows) (m[r.key] ??= []).push(r);
    // urut terbaru dulu (effective_from desc)
    for (const k of Object.keys(m)) m[k].sort((a, b) => b.effective_from.localeCompare(a.effective_from));
    return m;
  }, [rows]);

  function activeRow(key: string): ConfigRow | undefined {
    return (byKey[key] ?? []).find((r) => r.effective_to === null);
  }

  function openEdit(key: string) {
    const active = activeRow(key);
    setEditKey(key);
    setPct(active ? String(Number(active.value) * 100) : "");
    setEffFrom(todayWIB());
    setNote("");
  }

  async function save() {
    if (!editKey) return;
    const num = parseFloat(pct);
    if (isNaN(num) || num < 0 || num > 100) {
      setToast({ type: "err", msg: "Tarif harus 0–100 (persen)" });
      return;
    }
    setSaving(true);
    try {
      await api.put("/api/v1/settings/finance", {
        key: editKey,
        value: num / 100,          // simpan sebagai fraksi 0..1
        value_type: "number",
        effective_from: effFrom,
        note: note.trim() || undefined,
      });
      setToast({ type: "ok", msg: `Tarif diperbarui, berlaku ${effFrom}` });
      setEditKey(null);
      await load();
    } catch (e) {
      const msg = (e as { response?: { data?: { error?: string } } })?.response?.data?.error;
      setToast({ type: "err", msg: msg ?? "Gagal menyimpan tarif" });
    } finally { setSaving(false); }
  }

  const fmt = (d: string | null) =>
    d ? new Date(d + "T00:00:00").toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" }) : "sekarang";

  return (
    <div style={{ maxWidth: 900, margin: "0 auto", padding: "8px 4px 60px" }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 6 }}>
        <div style={{ width: 40, height: 40, borderRadius: 10, background: C.navyLight, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
          <Landmark size={20} color={C.navy} />
        </div>
        <div>
          <h1 style={{ margin: 0, fontFamily: "var(--font-display)", fontSize: 22, fontWeight: 700, color: C.text, letterSpacing: "-0.3px" }}>
            Konfigurasi Keuangan
          </h1>
          <p style={{ margin: "2px 0 0", fontSize: 13, color: C.muted }}>
            Tarif pajak berlaku per tanggal. Dokumen memakai tarif yang berlaku saat diterbitkan — mengubah tarif tidak mengubah dokumen lama.
          </p>
        </div>
      </div>

      {!canEdit && (
        <div style={{ ...card, display: "flex", gap: 10, padding: "12px 16px", margin: "16px 0", background: C.amberBg, borderColor: "var(--warning-border)" }}>
          <Info size={16} color={C.amber} style={{ flexShrink: 0, marginTop: 2 }} />
          <span style={{ fontSize: 13, color: C.text }}>
            Kamu bisa melihat konfigurasi, tapi mengubah tarif butuh permission <b>Kelola Konfigurasi Finansial</b> (settings:finance:manage).
          </span>
        </div>
      )}

      {loading ? (
        <div style={{ textAlign: "center", padding: 60, color: C.muted, fontSize: 14 }}>Memuat…</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 16, marginTop: 20 }}>
          {FINANCE_KEYS.map(({ key, label, hint, format }) => {
            const history = byKey[key] ?? [];
            const active = activeRow(key);
            return (
              <div key={key} style={{ ...card, padding: 0, overflow: "hidden" }}>
                {/* Header baris config */}
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 20px", borderBottom: `1px solid ${C.border}` }}>
                  <div>
                    <div style={{ fontSize: 15, fontWeight: 600, color: C.text }}>{label}</div>
                    <div style={{ fontSize: 12, color: C.muted, marginTop: 1 }}>{hint}</div>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                    <div style={{ textAlign: "right" }}>
                      <div style={{ fontFamily: "var(--font-display)", fontSize: 24, fontWeight: 700, color: C.navy, lineHeight: 1 }}>
                        {active ? format(Number(active.value)) : "—"}
                      </div>
                      <div style={{ fontSize: 11, color: C.muted, marginTop: 2 }}>berlaku sekarang</div>
                    </div>
                    {canEdit && (
                      <button onClick={() => openEdit(key)}
                        style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 14px", borderRadius: 9, background: C.navy, color: "#fff", border: "none", fontSize: 13, fontWeight: 500, cursor: "pointer" }}>
                        <Plus size={14} /> Ubah tarif
                      </button>
                    )}
                  </div>
                </div>

                {/* Signature: timeline periode tarif — tiap tarif = rentang [dari..sampai) */}
                <div style={{ padding: "14px 20px 18px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase", color: C.muted, marginBottom: 10 }}>
                    <CalendarClock size={12} /> Riwayat berlaku
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    {history.length === 0 && <div style={{ fontSize: 13, color: C.muted }}>Belum ada tarif.</div>}
                    {history.map((r, i) => {
                      const isActive = r.effective_to === null;
                      return (
                        <div key={i} style={{ display: "flex", alignItems: "center", gap: 12 }}>
                          <div style={{ width: 8, height: 8, borderRadius: "50%", background: isActive ? C.green : C.border, flexShrink: 0 }} />
                          <div style={{ display: "flex", alignItems: "baseline", gap: 10, flex: 1, minWidth: 0 }}>
                            <span style={{ fontFamily: "var(--font-display)", fontSize: 15, fontWeight: 600, color: isActive ? C.text : C.mid, minWidth: 64 }}>
                              {format(Number(r.value))}
                            </span>
                            <span style={{ fontSize: 12.5, color: C.mid }}>
                              {fmt(r.effective_from)} <span style={{ color: C.muted }}>→</span> {fmt(r.effective_to)}
                            </span>
                            {r.note && <span style={{ fontSize: 11, color: C.muted, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>· {r.note}</span>}
                          </div>
                          {isActive && (
                            <span style={{ fontSize: 10, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.04em", color: C.green, background: C.greenBg, padding: "2px 7px", borderRadius: 5 }}>Aktif</span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Default Proyek Baru — DP% + masa pemeliharaan (Q4/Q5) */}
      {!loading && (
        <div style={{ ...card, padding: "18px 20px", marginTop: 16 }}>
          <div style={{ fontSize: 15, fontWeight: 600, color: C.text }}>Default Proyek Baru</div>
          <p style={{ margin: "4px 0 14px", fontSize: 13, color: C.mid }}>
            Nilai awal yang otomatis terisi saat membuat proyek — tetap bisa diubah per proyek.
          </p>
          <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
            <label style={{ display: "flex", flexDirection: "column", gap: 6, flex: 1, minWidth: 160 }}>
              <span style={{ fontSize: 12.5, fontWeight: 600, color: C.text }}>Uang muka (DP) default</span>
              <div style={{ position: "relative" }}>
                <input type="number" step="1" min="0" max="100" value={dpPct} onChange={(e) => setDpPct(e.target.value)} disabled={!canEdit}
                  style={{ width: "100%", padding: "10px 30px 10px 12px", borderRadius: 9, border: `1px solid ${C.border}`, fontSize: 14, boxSizing: "border-box" }} />
                <span style={{ position: "absolute", right: 12, top: 11, fontSize: 13, color: C.muted }}>%</span>
              </div>
            </label>
            <label style={{ display: "flex", flexDirection: "column", gap: 6, flex: 1, minWidth: 160 }}>
              <span style={{ fontSize: 12.5, fontWeight: 600, color: C.text }}>Masa pemeliharaan default</span>
              <div style={{ position: "relative" }}>
                <input type="number" step="1" min="0" max="3650" value={maintDays} onChange={(e) => setMaintDays(e.target.value)} disabled={!canEdit}
                  style={{ width: "100%", padding: "10px 44px 10px 12px", borderRadius: 9, border: `1px solid ${C.border}`, fontSize: 14, boxSizing: "border-box" }} />
                <span style={{ position: "absolute", right: 12, top: 11, fontSize: 13, color: C.muted }}>hari</span>
              </div>
            </label>
          </div>
          {canEdit && (
            <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 14 }}>
              <button onClick={saveProjectDefaults} disabled={savingDefaults}
                style={{ display: "flex", alignItems: "center", gap: 6, padding: "9px 18px", borderRadius: 9, background: C.navy, color: "#fff", border: "none", fontSize: 13, fontWeight: 500, cursor: savingDefaults ? "default" : "pointer", opacity: savingDefaults ? 0.7 : 1 }}>
                <Check size={14} /> {savingDefaults ? "Menyimpan…" : "Simpan default"}
              </button>
            </div>
          )}
        </div>
      )}

      {/* Batas Kasbon — toggle enforcement (Q2, default OFF) */}
      {!loading && (
        <div style={{ ...card, padding: "18px 20px", marginTop: 16 }}>
          <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 15, fontWeight: 600, color: C.text }}>Batas Kasbon</div>
              <p style={{ margin: "4px 0 0", fontSize: 13, color: C.mid, lineHeight: 1.5 }}>
                Membatasi kasbon maksimal sebesar persentase (default 80%, diatur per proyek) dari
                <b> earned value</b> untuk pekerjaan sistem <b>progress</b>. Saat aktif, kasbon yang melebihi
                batas <b>ditolak saat disetujui</b>. Pekerjaan harian & borongan tidak terpengaruh.
              </p>
              {kasbonLimitOn && (
                <div style={{ display: "flex", gap: 8, marginTop: 10, fontSize: 12.5, color: C.text, background: C.amberBg, padding: "9px 12px", borderRadius: 9 }}>
                  <AlertTriangle size={14} color={C.amber} style={{ flexShrink: 0, marginTop: 1 }} />
                  Aktif — persetujuan kasbon di atas batas akan diblokir. Matikan bila perlu mencairkan lebih dulu.
                </div>
              )}
            </div>
            {/* Toggle switch */}
            <button
              onClick={() => canEdit && !togglingKasbon && toggleKasbonLimit(!kasbonLimitOn)}
              disabled={!canEdit || togglingKasbon}
              aria-pressed={kasbonLimitOn}
              title={canEdit ? (kasbonLimitOn ? "Matikan" : "Aktifkan") : "Butuh permission settings:finance:manage"}
              style={{
                position: "relative", width: 46, height: 26, borderRadius: 13, border: "none", flexShrink: 0,
                background: kasbonLimitOn ? C.green : C.border, cursor: canEdit && !togglingKasbon ? "pointer" : "not-allowed",
                transition: "background 0.2s", opacity: canEdit ? 1 : 0.5,
              }}>
              <span style={{
                position: "absolute", top: 3, left: kasbonLimitOn ? 23 : 3, width: 20, height: 20, borderRadius: "50%",
                background: "#fff", transition: "left 0.2s", boxShadow: "0 1px 3px rgba(0,0,0,0.2)",
              }} />
            </button>
          </div>
        </div>
      )}

      {/* Modal ubah tarif */}
      {editKey && (
        <div onClick={(e) => { if (e.target === e.currentTarget) setEditKey(null); }}
          style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
          <div style={{ ...card, width: "100%", maxWidth: 440, padding: 0 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "18px 22px", borderBottom: `1px solid ${C.border}` }}>
              <div>
                <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: C.text }}>
                  Ubah tarif {FINANCE_KEYS.find((f) => f.key === editKey)?.label}
                </h2>
                <p style={{ margin: "2px 0 0", fontSize: 12, color: C.muted }}>Tarif baru berlaku sejak tanggal yang dipilih (WIB).</p>
              </div>
              <button onClick={() => setEditKey(null)} style={{ padding: 6, background: "transparent", border: "none", cursor: "pointer", color: C.muted }}><X size={18} /></button>
            </div>
            <div style={{ padding: 22, display: "flex", flexDirection: "column", gap: 16 }}>
              <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <span style={{ fontSize: 12.5, fontWeight: 600, color: C.text }}>Tarif (%)</span>
                <input type="number" step="0.01" min="0" max="100" value={pct} onChange={(e) => setPct(e.target.value)} placeholder="mis. 11"
                  style={{ padding: "10px 12px", borderRadius: 9, border: `1px solid ${C.border}`, fontSize: 14, boxSizing: "border-box" }} />
              </label>
              <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <span style={{ fontSize: 12.5, fontWeight: 600, color: C.text }}>Berlaku sejak</span>
                <input type="date" value={effFrom} onChange={(e) => setEffFrom(e.target.value)}
                  style={{ padding: "10px 12px", borderRadius: 9, border: `1px solid ${C.border}`, fontSize: 14, boxSizing: "border-box" }} />
              </label>
              <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <span style={{ fontSize: 12.5, fontWeight: 600, color: C.text }}>Catatan <span style={{ color: C.muted, fontWeight: 400 }}>(opsional)</span></span>
                <input type="text" value={note} onChange={(e) => setNote(e.target.value)} placeholder="mis. Penyesuaian regulasi 2027"
                  style={{ padding: "10px 12px", borderRadius: 9, border: `1px solid ${C.border}`, fontSize: 14, boxSizing: "border-box" }} />
              </label>
              <div style={{ display: "flex", gap: 8, fontSize: 12, color: C.mid, background: C.bg, padding: "10px 12px", borderRadius: 9 }}>
                <AlertTriangle size={14} color={C.amber} style={{ flexShrink: 0, marginTop: 1 }} />
                Dokumen yang sudah terbit tidak berubah. Tarif baru hanya berlaku untuk dokumen bertanggal ≥ tanggal berlaku.
              </div>
              <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
                <button onClick={() => setEditKey(null)} style={{ padding: "9px 16px", borderRadius: 9, background: "transparent", border: `1px solid ${C.border}`, fontSize: 13, cursor: "pointer", color: C.mid }}>Batal</button>
                <button onClick={save} disabled={saving}
                  style={{ display: "flex", alignItems: "center", gap: 6, padding: "9px 18px", borderRadius: 9, background: C.navy, color: "#fff", border: "none", fontSize: 13, fontWeight: 500, cursor: saving ? "default" : "pointer", opacity: saving ? 0.7 : 1 }}>
                  <Check size={14} /> {saving ? "Menyimpan…" : "Simpan tarif"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div onAnimationEnd={() => setTimeout(() => setToast(null), 2600)}
          style={{ position: "fixed", bottom: 24, left: "50%", transform: "translateX(-50%)", zIndex: 1100,
            display: "flex", alignItems: "center", gap: 8, padding: "11px 18px", borderRadius: 10,
            background: toast.type === "ok" ? C.green : C.red, color: "#fff", fontSize: 13, fontWeight: 500, boxShadow: "0 8px 24px rgba(0,0,0,0.18)" }}>
          {toast.type === "ok" ? <Check size={15} /> : <X size={15} />} {toast.msg}
        </div>
      )}
    </div>
  );
}
