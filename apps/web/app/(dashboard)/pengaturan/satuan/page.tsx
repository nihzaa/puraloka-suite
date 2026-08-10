"use client";

import { useEffect, useReducer, useState, useCallback } from "react";
import { api } from "@/lib/api";
import { Ruler, Plus, Check, X, AlertTriangle, Save, EyeOff, Eye } from "lucide-react";
import type { UnitRow } from "@/lib/use-units";

// ─── Design tokens (konsisten dgn /pengaturan) ─────────────────────────────────
import { C } from "@/lib/warna-ui";
import { KepalaHalaman } from "@/components/dasar";

const card: React.CSSProperties = {
  background: "var(--surface)", border: "1px solid var(--border)",
  borderRadius: 14, boxShadow: "var(--naik-1)",
};

const CATEGORIES = [
  { value: "area", label: "Area" }, { value: "length", label: "Panjang" },
  { value: "volume", label: "Volume" }, { value: "weight", label: "Berat" },
  { value: "count", label: "Unit/Buah" }, { value: "set", label: "Set/Lot" },
  { value: "time", label: "Waktu" },
];
function hasPerm(key: string): boolean {
  try {
    const raw = localStorage.getItem("puraloka_permissions");
    return raw ? (JSON.parse(raw) as string[]).includes(key) : false;
  } catch { return false; }
}

const inputStyle: React.CSSProperties = {
  width: "100%", padding: "8px 8px", border: `1px solid ${C.border}`, borderRadius: 6,
  fontSize: 13, outline: "none", background: "var(--surface)", color: C.text,
  boxSizing: "border-box", fontFamily: "inherit",
};

export default function SatuanPage() {
  const [mounted, mount] = useReducer(() => true, false);
  useEffect(mount, [mount]);
  if (!mounted) return null;
  return <SatuanContent />;
}

function SatuanContent() {
  const canManage = hasPerm("units:manage");
  const [units, setUnits] = useState<UnitRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<{ type: "success" | "error"; msg: string } | null>(null);

  // loading diinisialisasi true (lihat useState) → tak perlu setLoading(true) sinkron
  // di dalam effect (menghindari cascading render). Refetch tidak mem-flash spinner.
  const load = useCallback(async () => {
    try {
      const { data } = await api.get<{ units: UnitRow[] }>("/api/v1/units", { params: { all: true } });
      setUnits(data.units ?? []);
    } catch {
      setToast({ type: "error", msg: "Gagal memuat satuan" });
    } finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3500);
    return () => clearTimeout(t);
  }, [toast]);

  // Kelompokkan by kategori (urutan CATEGORIES).
  const groups = CATEGORIES
    .map(c => ({ ...c, items: units.filter(u => u.category === c.value) }))
    .filter(g => g.items.length > 0);

  return (
    <div style={{ padding: "var(--pad-atas) var(--pad-x) var(--pad-bawah)", width: "100%", maxWidth: "var(--w-page)", margin: "0 auto" }}>
      {toast && (
        <div style={{
          position: "fixed", top: 20, right: 24, zIndex: 9999,
          background: toast.type === "success" ? C.greenBg : C.redBg,
          border: `1px solid ${toast.type === "success" ? C.greenBorder : C.redBorder}`,
          borderRadius: 10, padding: "8px 16px", display: "flex", alignItems: "center", gap: 8,
          boxShadow: "var(--naik-2)", fontSize: 13,
          color: toast.type === "success" ? C.green : C.red,
        }}>
          {toast.type === "success" ? <Check size={14} /> : <AlertTriangle size={14} />}{toast.msg}
        </div>
      )}

      {/* Header */}
      <div style={{ marginBottom: 24, display: "flex", alignItems: "center", gap: 12 }}>
        <KepalaHalaman
        judul="Master Satuan"
        keterangan="Sumber tunggal satuan untuk dropdown Mandor & Pengadaan. Ubah di sini, berlaku di semua form."
        ikon={<Ruler size={19} />}
      />
      </div>

      {!canManage && (
        <div style={{ marginBottom: 20, padding: "8px 12px", borderRadius: 6, background: "var(--warning-bg)", border: "1px solid var(--warning-border)", fontSize: 12, color: C.mid }}>
          Anda dapat melihat daftar satuan, tetapi hanya pengguna dengan izin <strong>Kelola Satuan</strong> yang bisa mengubahnya.
        </div>
      )}

      {canManage && <AddUnitCard existing={units} onDone={(ok) => { if (ok) { load(); setToast({ type: "success", msg: "Satuan ditambahkan" }); } }} onError={(m) => setToast({ type: "error", msg: m })} />}

      {loading ? (
        <div style={{ textAlign: "center", padding: 60, color: C.muted, fontSize: 13 }}>Memuat...</div>
      ) : (
        <div style={{ ...card, overflow: "hidden" }}>
          {/* Table header */}
          <div style={{ display: "grid", gridTemplateColumns: "120px 90px 1fr 70px 90px", gap: 12, padding: "12px 20px", borderBottom: `1px solid ${C.border}`, fontSize: 11, fontWeight: 700, color: C.muted, textTransform: "uppercase", letterSpacing: "0.04em" }}>
            <div>Kode</div><div>Simbol</div><div>Nama</div><div>Urutan</div><div style={{ textAlign: "right" }}>Status</div>
          </div>
          {groups.map(g => (
            <div key={g.value}>
              <div style={{ padding: "8px 20px", background: "var(--surface-subtle)", fontSize: 11, fontWeight: 700, color: C.mid, letterSpacing: "0.03em" }}>
                {g.label}
              </div>
              {g.items.map(u => (
                <UnitRowItem key={u.code} unit={u} canManage={canManage}
                  onSaved={() => { load(); setToast({ type: "success", msg: `Satuan "${u.code}" disimpan` }); }}
                  onError={(m) => setToast({ type: "error", msg: m })} />
              ))}
            </div>
          ))}
          {groups.length === 0 && (
            <div style={{ padding: 40, textAlign: "center", color: C.muted, fontSize: 13 }}>Belum ada satuan.</div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Add form ──────────────────────────────────────────────────────────────────
function AddUnitCard({ existing, onDone, onError }: { existing: UnitRow[]; onDone: (ok: boolean) => void; onError: (m: string) => void }) {
  const [open, setOpen] = useState(false);
  const [code, setCode] = useState("");
  const [symbol, setSymbol] = useState("");
  const [label, setLabel] = useState("");
  const [category, setCategory] = useState("count");
  const [saving, setSaving] = useState(false);

  const normalized = code.toLowerCase().trim().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
  const dup = existing.some(u => u.code === normalized);

  async function submit() {
    if (!normalized) { onError("Kode wajib diisi (huruf/angka)"); return; }
    if (!symbol.trim() || !label.trim()) { onError("Simbol & nama wajib diisi"); return; }
    if (dup) { onError(`Kode "${normalized}" sudah ada`); return; }
    setSaving(true);
    try {
      await api.post("/api/v1/units", { code: normalized, symbol: symbol.trim(), label: label.trim(), category, sort_order: 0 });
      setCode(""); setSymbol(""); setLabel(""); setCategory("count"); setOpen(false);
      onDone(true);
    } catch (err) {
      onError((err as { response?: { data?: { error?: string } } })?.response?.data?.error ?? "Gagal menambah satuan");
    } finally { setSaving(false); }
  }

  if (!open) {
    return (
      <button onClick={() => setOpen(true)}
        style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "8px 16px", marginBottom: 18, borderRadius: 10, border: `1px solid ${C.navy}`, background: C.navyLight, color: C.navy, fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
        <Plus size={15} /> Tambah Satuan
      </button>
    );
  }
  return (
    <div style={{ ...card, marginBottom: 18, padding: 16 }}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1.4fr 1fr", gap: 12, alignItems: "end" }}>
        <Labeled label="Kode (unik)">
          <input value={code} onChange={e => setCode(e.target.value)} placeholder="cth: dus" style={inputStyle} />
          {code && <div style={{ fontSize: 11, color: dup ? C.red : C.muted, marginTop: 3 }}>disimpan sebagai <code>{normalized || "—"}</code>{dup && " (sudah ada)"}</div>}
        </Labeled>
        <Labeled label="Simbol"><input value={symbol} onChange={e => setSymbol(e.target.value)} placeholder="cth: dus" style={inputStyle} /></Labeled>
        <Labeled label="Nama"><input value={label} onChange={e => setLabel(e.target.value)} placeholder="cth: Dus / Kardus" style={inputStyle} /></Labeled>
        <Labeled label="Kategori">
          <select aria-label="Kategori" value={category} onChange={e => setCategory(e.target.value)} style={inputStyle}>
            {CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
          </select>
        </Labeled>
      </div>
      <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
        <button onClick={submit} disabled={saving || dup}
          style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "8px 16px", borderRadius: 6, border: "none", background: saving || dup ? "var(--text-muted)" : C.navy, color: C.onNavy, fontSize: 13, fontWeight: 600, cursor: saving || dup ? "not-allowed" : "pointer" }}>
          <Save size={14} /> {saving ? "Menyimpan..." : "Simpan"}
        </button>
        <button onClick={() => setOpen(false)}
          style={{ padding: "8px 12px", borderRadius: 6, border: `1px solid ${C.border}`, background: "var(--surface)", color: C.mid, fontSize: 13, cursor: "pointer" }}>
          Batal
        </button>
      </div>
    </div>
  );
}

// ─── Row (inline edit) ───────────────────────────────────────────────────────
function UnitRowItem({ unit, canManage, onSaved, onError }: {
  unit: UnitRow; canManage: boolean; onSaved: () => void; onError: (m: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [symbol, setSymbol] = useState(unit.symbol);
  const [label, setLabel] = useState(unit.label);
  const [category, setCategory] = useState(unit.category);
  const [sortOrder, setSortOrder] = useState(String(unit.sort_order));
  const [busy, setBusy] = useState(false);

  async function patch(body: Record<string, unknown>) {
    setBusy(true);
    try {
      await api.patch(`/api/v1/units/${encodeURIComponent(unit.code)}`, body);
      setEditing(false);
      onSaved();
    } catch (err) {
      onError((err as { response?: { data?: { error?: string } } })?.response?.data?.error ?? "Gagal menyimpan");
    } finally { setBusy(false); }
  }

  const rowStyle: React.CSSProperties = {
    display: "grid", gridTemplateColumns: "120px 90px 1fr 70px 90px", gap: 12,
    padding: "8px 20px", borderBottom: `1px solid ${C.border}`, alignItems: "center", fontSize: 13,
    opacity: unit.is_active ? 1 : 0.55,
  };

  if (editing) {
    return (
      <div style={{ ...rowStyle, gridTemplateColumns: "120px 90px 1fr 70px auto", background: "var(--surface-subtle)" }}>
        <code style={{ fontSize: 12, color: C.muted }}>{unit.code}</code>
        <input value={symbol} onChange={e => setSymbol(e.target.value)} style={inputStyle} />
        <input value={label} onChange={e => setLabel(e.target.value)} style={inputStyle} />
        <input value={sortOrder} onChange={e => setSortOrder(e.target.value.replace(/[^0-9]/g, ""))} style={inputStyle} />
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <select aria-label="Kategori" value={category} onChange={e => setCategory(e.target.value)} style={{ ...inputStyle, width: 110 }}>
            {CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
          </select>
          <button aria-label="Simpan" onClick={() => patch({ symbol, label, category, sort_order: Number(sortOrder) || 0 })} disabled={busy}
            title="Simpan" style={{ padding: 6, borderRadius: 6, border: "none", background: C.green, color: "#fff", cursor: "pointer" }}><Check size={14} /></button>
          <button aria-label="Batal" onClick={() => { setEditing(false); setSymbol(unit.symbol); setLabel(unit.label); setCategory(unit.category); setSortOrder(String(unit.sort_order)); }}
            title="Batal" style={{ padding: 6, borderRadius: 6, border: `1px solid ${C.border}`, background: "var(--surface)", color: C.mid, cursor: "pointer" }}><X size={14} /></button>
        </div>
      </div>
    );
  }

  return (
    <div style={rowStyle}>
      <code style={{ fontSize: 12, color: C.mid, background: "var(--surface-subtle)", padding: "2px 6px", borderRadius: 6, justifySelf: "start" }}>{unit.code}</code>
      <span style={{ fontWeight: 600, color: C.text }}>{unit.symbol}</span>
      <span style={{ color: C.mid }}>
        {unit.label}
        {!unit.is_active && <span style={{ marginLeft: 8, fontSize: 11, color: C.red }}>(nonaktif)</span>}
      </span>
      <span style={{ color: C.muted }}>{unit.sort_order}</span>
      <div style={{ display: "flex", justifyContent: "flex-end", gap: 6 }}>
        {canManage ? (
          <>
            <button aria-label="Edit" onClick={() => setEditing(true)} title="Edit"
              style={{ padding: "4px 8px", borderRadius: 6, border: `1px solid ${C.border}`, background: "var(--surface)", color: C.mid, fontSize: 12, cursor: "pointer" }}>Edit</button>
            <button aria-label={unit.is_active ? "Nonaktifkan" : "Aktifkan"} onClick={() => patch({ is_active: !unit.is_active })} disabled={busy}
              title={unit.is_active ? "Nonaktifkan" : "Aktifkan"}
              style={{ padding: 6, borderRadius: 6, border: `1px solid ${C.border}`, background: "var(--surface)", color: unit.is_active ? C.mid : C.green, cursor: "pointer" }}>
              {unit.is_active ? <EyeOff size={13} /> : <Eye size={13} />}
            </button>
          </>
        ) : (
          <span style={{ fontSize: 11, color: unit.is_active ? C.green : C.muted }}>{unit.is_active ? "Aktif" : "Nonaktif"}</span>
        )}
      </div>
    </div>
  );
}

function Labeled({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label style={{ display: "block", fontSize: 11, fontWeight: 600, color: C.mid, marginBottom: 5 }}>{label}</label>
      {children}
    </div>
  );
}
