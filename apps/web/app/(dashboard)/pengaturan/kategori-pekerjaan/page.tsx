"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useIzin } from "@/lib/use-izin";
import { useData } from "@/lib/data-cache";
import { Layers, Plus, Check, X, AlertTriangle, Save, EyeOff, Eye } from "lucide-react";
import type { WorkCategoryRow } from "@/lib/use-work-categories";

import { C } from "@/lib/warna-ui";
import { KepalaHalaman } from "@/components/dasar";
import { GAYA_ISIAN } from "@/components/isian";
import { Kosong } from "@/components/ui-dasar";

const card: React.CSSProperties = {
  background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 14, boxShadow: "var(--naik-1)",
};



export default function KategoriContent() {
  const canManage = useIzin("work_categories:manage");
  const [toast, setToast] = useState<{ type: "success" | "error"; msg: string } | null>(null);

  /*
    ── PINDAH KE LAPIS CACHE BERSAMA (F4-2), 2026-08-16

    `useData` menggantikan useCallback+useEffect+queueMicrotask.
  */
  const { data, memuat: loading, galat: galatMuat, muatUlang } = useData<{ categories: WorkCategoryRow[] }>("/api/v1/work-categories?all=true");
  const load = useCallback(async () => { await muatUlang(); }, [muatUlang]);
  const rows = data?.categories ?? [];

  useEffect(() => { if (!toast) return; const t = setTimeout(() => setToast(null), 3500); return () => clearTimeout(t); }, [toast]);

  return (
    <div style={{ padding: "var(--pad-atas) var(--pad-x) var(--pad-bawah)", width: "100%", maxWidth: "var(--w-page)", margin: "0 auto" }}>
      {toast && (
        <div style={{ position: "fixed", top: 20, right: 24, zIndex: 9999, background: toast.type === "success" ? C.greenBg : C.redBg, border: `1px solid ${toast.type === "success" ? C.greenBorder : C.redBorder}`, borderRadius: 10, padding: "8px 16px", display: "flex", alignItems: "center", gap: 8, boxShadow: "var(--naik-2)", fontSize: 13, color: toast.type === "success" ? C.green : C.red }}>
          {toast.type === "success" ? <Check size={14} /> : <AlertTriangle size={14} />}{toast.msg}
        </div>
      )}
      <div style={{ marginBottom: 24, display: "flex", alignItems: "center", gap: 12 }}>
        <KepalaHalaman
        judul="Kategori Pekerjaan"
        keterangan="Sumber tunggal kategori untuk rincian pekerjaan mandor. Ubah di sini, berlaku di semua form."
        ikon={<Layers size={19} />}
      />
      </div>

      {!canManage && (
        <div style={{ marginBottom: 20, padding: "8px 12px", borderRadius: 6, background: "var(--warning-bg)", border: "1px solid var(--warning-border)", fontSize: 12, color: C.mid }}>
          Anda dapat melihat daftar, tetapi hanya pengguna dengan izin <strong>Kelola Kategori Pekerjaan</strong> yang bisa mengubahnya.
        </div>
      )}

      {canManage && <AddCard existing={rows} onDone={() => { load(); setToast({ type: "success", msg: "Kategori ditambahkan" }); }} onError={(m) => setToast({ type: "error", msg: m })} />}

      {loading ? (
        <div style={{ textAlign: "center", padding: 60, color: C.muted, fontSize: 13 }}>Memuat...</div>
      ) : galatMuat ? (
        // Galat MUAT dipisah dari `toast` (dipakai untuk galat AKSI menyimpan
        // baris) — satu state untuk keduanya membuat gagal menyimpan
        // menghapus pesan gagal memuat.
        <div role="alert" style={{ ...card, padding: 40, textAlign: "center", color: C.red, fontSize: 13 }}>
          Gagal memuat daftar kategori.{" "}
          <button onClick={() => void load()} style={{ color: C.navy, background: "none", border: "none", padding: 0, cursor: "pointer", font: "inherit", textDecoration: "underline" }}>
            Coba lagi.
          </button>
        </div>
      ) : (
        <div style={{ ...card, overflow: "hidden" }}>
          <div style={{ display: "grid", gridTemplateColumns: "160px 1fr 70px 90px", gap: 12, padding: "12px 20px", borderBottom: `1px solid ${C.border}`, fontSize: 11, fontWeight: 700, color: C.muted, textTransform: "uppercase", letterSpacing: "0.04em" }}>
            <div>Kode</div><div>Nama</div><div>Urutan</div><div style={{ textAlign: "right" }}>Status</div>
          </div>
          {rows.map(r => (
            <RowItem key={r.code} row={r} canManage={canManage}
              onSaved={() => { load(); setToast({ type: "success", msg: `"${r.code}" disimpan` }); }}
              onError={(m) => setToast({ type: "error", msg: m })} />
          ))}
          {rows.length === 0 && (
            <Kosong
              judul="Belum ada kategori pekerjaan"
              sebab="Kategori mengelompokkan lingkup kerja mandor supaya laporan biaya bisa dipecah per jenis pekerjaan. Tambahkan lewat kolom di atas."
            />
          )}
        </div>
      )}
    </div>
  );
}

function AddCard({ existing, onDone, onError }: { existing: WorkCategoryRow[]; onDone: () => void; onError: (m: string) => void }) {
  const [open, setOpen] = useState(false);
  const [code, setCode] = useState("");
  const [label, setLabel] = useState("");
  const [saving, setSaving] = useState(false);
  const normalized = code.toLowerCase().trim().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
  const dup = existing.some(r => r.code === normalized);

  async function submit() {
    if (!normalized) { onError("Kode wajib (huruf/angka)"); return; }
    if (!label.trim()) { onError("Nama wajib diisi"); return; }
    if (dup) { onError(`Kode "${normalized}" sudah ada`); return; }
    setSaving(true);
    try {
      await api.post("/api/v1/work-categories", { code: normalized, label: label.trim(), sort_order: 0 });
      setCode(""); setLabel(""); setOpen(false); onDone();
    } catch (err) { onError((err as { response?: { data?: { error?: string } } })?.response?.data?.error ?? "Gagal menambah"); }
    finally { setSaving(false); }
  }

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "8px 16px", marginBottom: 18, borderRadius: 10, border: "none", background: "var(--grad-aksen)", color: "var(--on-aksen)", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
        <Plus size={15} /> Tambah Kategori
      </button>
    );
  }
  return (
    <div style={{ ...card, marginBottom: 18, padding: 16 }}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1.6fr", gap: 12, alignItems: "end" }}>
        <div>
          <label htmlFor="code" style={{ display: "block", fontSize: 11, fontWeight: 600, color: C.mid, marginBottom: 5 }}>Kode (unik)</label>
          <input className="isian-fokus" id="code" value={code} onChange={e => setCode(e.target.value)} placeholder="cth: mep" style={GAYA_ISIAN} />
          {code && <div style={{ fontSize: 11, color: dup ? C.red : C.muted, marginTop: 3 }}>disimpan sebagai <code>{normalized || "—"}</code>{dup && " (sudah ada)"}</div>}
        </div>
        <div>
          <label htmlFor="label" style={{ display: "block", fontSize: 11, fontWeight: 600, color: C.mid, marginBottom: 5 }}>Nama</label>
          <input className="isian-fokus" id="label" value={label} onChange={e => setLabel(e.target.value)} placeholder="cth: Mekanikal Elektrikal Plumbing" style={GAYA_ISIAN} />
        </div>
      </div>
      <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
        <button onClick={submit} disabled={saving || dup} style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "8px 16px", borderRadius: 6, border: "none", background: saving || dup ? "var(--text-muted)" : C.navy, color: C.onNavy, fontSize: 13, fontWeight: 600, cursor: saving || dup ? "not-allowed" : "pointer" }}>
          <Save size={14} /> {saving ? "Menyimpan..." : "Simpan"}
        </button>
        <button onClick={() => setOpen(false)} style={{ padding: "8px 12px", borderRadius: 6, border: `1px solid ${C.border}`, background: "var(--surface)", color: C.mid, fontSize: 13, cursor: "pointer" }}>Batal</button>
      </div>
    </div>
  );
}

function RowItem({ row, canManage, onSaved, onError }: { row: WorkCategoryRow; canManage: boolean; onSaved: () => void; onError: (m: string) => void }) {
  const [editing, setEditing] = useState(false);
  const [label, setLabel] = useState(row.label);
  const [sortOrder, setSortOrder] = useState(String(row.sort_order));
  const [busy, setBusy] = useState(false);

  async function patch(body: Record<string, unknown>) {
    setBusy(true);
    try { await api.patch(`/api/v1/work-categories/${encodeURIComponent(row.code)}`, body); setEditing(false); onSaved(); }
    catch (err) { onError((err as { response?: { data?: { error?: string } } })?.response?.data?.error ?? "Gagal menyimpan"); }
    finally { setBusy(false); }
  }

  const rowStyle: React.CSSProperties = {
    display: "grid", gridTemplateColumns: "160px 1fr 70px 90px", gap: 12, padding: "8px 20px",
    borderBottom: `1px solid ${C.border}`, alignItems: "center", fontSize: 13, opacity: row.is_active ? 1 : 0.55,
  };

  if (editing) {
    return (
      <div style={{ ...rowStyle, gridTemplateColumns: "160px 1fr 70px auto" }}>
        <code style={{ fontSize: 12, color: C.muted }}>{row.code}</code>
        <input className="isian-fokus" value={label} onChange={e => setLabel(e.target.value)} style={GAYA_ISIAN} />
        <input className="isian-fokus" value={sortOrder} onChange={e => setSortOrder(e.target.value.replace(/[^0-9]/g, ""))} style={GAYA_ISIAN} />
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <button aria-label="Simpan" onClick={() => patch({ label, sort_order: Number(sortOrder) || 0 })} disabled={busy} title="Simpan" style={{ padding: 6, borderRadius: 6, border: "none", background: C.green, color: "#fff", cursor: "pointer" }}><Check size={14} /></button>
          <button aria-label="Batal" onClick={() => { setEditing(false); setLabel(row.label); setSortOrder(String(row.sort_order)); }} title="Batal" style={{ padding: 6, borderRadius: 6, border: `1px solid ${C.border}`, background: "var(--surface)", color: C.mid, cursor: "pointer" }}><X size={14} /></button>
        </div>
      </div>
    );
  }
  return (
    <div style={rowStyle}>
      <code style={{ fontSize: 12, color: C.mid, background: "var(--surface-subtle)", padding: "2px 6px", borderRadius: 6, justifySelf: "start" }}>{row.code}</code>
      <span style={{ color: C.text, fontWeight: 500 }}>{row.label}{!row.is_active && <span style={{ marginLeft: 8, fontSize: 11, color: C.red }}>(nonaktif)</span>}</span>
      <span style={{ color: C.muted }}>{row.sort_order}</span>
      <div style={{ display: "flex", justifyContent: "flex-end", gap: 6 }}>
        {canManage ? (
          <>
            <button aria-label="Edit" onClick={() => setEditing(true)} title="Edit" style={{ padding: "4px 8px", borderRadius: 6, border: `1px solid ${C.border}`, background: "var(--surface)", color: C.mid, fontSize: 12, cursor: "pointer" }}>Edit</button>
            <button onClick={() => patch({ is_active: !row.is_active })} disabled={busy} title={row.is_active ? "Nonaktifkan" : "Aktifkan"} style={{ padding: 6, borderRadius: 6, border: `1px solid ${C.border}`, background: "var(--surface)", color: row.is_active ? C.mid : C.green, cursor: "pointer" }}>
              {row.is_active ? <EyeOff size={13} /> : <Eye size={13} />}
            </button>
          </>
        ) : <span style={{ fontSize: 11, color: row.is_active ? C.green : C.muted }}>{row.is_active ? "Aktif" : "Nonaktif"}</span>}
      </div>
    </div>
  );
}
