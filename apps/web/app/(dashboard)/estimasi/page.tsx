"use client";

// Estimasi (CECEP M4 slice 1) — tiga tab (pola procurement):
//   Komposer  : proyek → skenario → versi → item dari assembly × price book
//   Katalog   : edisi AHSP + assembly + koefisien (read-only, ber-provenance)
//   Harga     : price book — entry lahir draft → verified → active (guard DB)
// Paritas C1: BUK & pembulatan SELALU terlihat & dikirim eksplisit dari form —
// tidak ada angka bisnis tersembunyi di kode UI.

import { Fragment, useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { api } from "@/lib/api";
import {
  Calculator, Plus, X, ChevronRight, ChevronDown, BookOpen, Coins,
  Layers, Send, Trash2, CheckCircle2, BadgeCheck, PlayCircle, CircleOff,
} from "lucide-react";

const C = {
  navy: "var(--navy)",
  text: "var(--text-primary)", mid: "var(--text-secondary)", muted: "var(--text-muted)",
  border: "var(--border)", bg: "var(--bg)", surface: "var(--surface)",
  green: "var(--success)", greenBg: "var(--success-bg)",
  red: "var(--danger)", redBg: "var(--danger-bg)",
  yellow: "var(--warning)", yellowBg: "var(--warning-bg)",
};

const fmtRp = (n: number) => `Rp ${Number(n).toLocaleString("id-ID")}`;

// ── Types (bentuk respons API CECEP) ──────────────────────────────────────────
interface Project { id: string; name: string }
interface Edition { id: string; code: string; name: string; publish_date: string | null; source_sha256: string | null; is_active: boolean }
interface VersionSummary { id: string; version_number: number; status: string; total_amount: number }
interface Scenario { id: string; name: string; purpose: string | null; status: string; versions: VersionSummary[] }
interface AsmComponent { coefficient: number; sort_order: number; resource: { code: string; name: string; category: string; unit_code: string } | null }
interface Assembly {
  id: string; code: string; name: string; source: string; version_number: number; status: string;
  output_unit_code: string; is_import_baseline: boolean;
  edition: { code: string; name: string } | null; components: AsmComponent[];
}
interface EstItem {
  id: string; quantity: number; amount: number; notes: string | null;
  cost_code: { code: string; name: string } | null;
  assembly: { id: string; code: string; name: string; output_unit_code: string } | null;
}
interface VersionDetail {
  id: string; version_number: number; status: string; total_amount: number;
  edition: { code: string; name: string } | null; items: EstItem[];
}
interface Rollup {
  estimate_version_id: string; at_date: string; ppn_rate: number;
  groups: { name: string; subtotal: number }[];
  totalBiaya: number; ppn: number; grandTotal: number;
}
interface PriceEntry {
  id: string; amount: number; version_number: number; effective_date: string;
  expired_date: string | null; location: string | null; supplier: string | null;
  confidence_level: string | null; status: string;
  resource: { code: string; name: string; category: string; unit_code: string } | null;
}

// ── Kerangka kecil bersama ────────────────────────────────────────────────────
function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return createPortal(
    <div style={{ position: "fixed", inset: 0, background: "rgba(17,24,39,.45)", zIndex: 60, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }} onClick={onClose}>
      <div style={{ background: C.surface, borderRadius: 14, width: "100%", maxWidth: 520, maxHeight: "88vh", overflow: "auto", boxShadow: "0 20px 50px rgba(0,0,0,.25)" }} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "14px 18px", borderBottom: `1px solid ${C.border}` }}>
          <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: C.text }}>{title}</h3>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: C.muted }}><X size={18} /></button>
        </div>
        <div style={{ padding: 18 }}>{children}</div>
      </div>
    </div>, document.body);
}
const inputStyle: React.CSSProperties = {
  width: "100%", boxSizing: "border-box", padding: "8px 10px", borderRadius: 8,
  border: `1px solid ${C.border}`, fontSize: 13, color: C.text, background: C.surface,
};
const label = (t: string) => <label style={{ display: "block", fontSize: 11.5, fontWeight: 600, color: C.mid, margin: "10px 0 4px" }}>{t}</label>;
function StatusBadge({ s }: { s: string }) {
  const map: Record<string, [string, string]> = {
    draft: [C.mid, C.bg], under_review: [C.yellow, C.yellowBg], approved: [C.green, C.greenBg],
    frozen: [C.navy, C.bg], superseded: [C.muted, C.bg],
    verified: [C.yellow, C.yellowBg], active: [C.green, C.greenBg], expired: [C.muted, C.bg],
  };
  const [fg, bg] = map[s] ?? [C.mid, C.bg];
  return <span style={{ fontSize: 11, fontWeight: 700, color: fg, background: bg, border: `1px solid ${C.border}`, borderRadius: 999, padding: "2px 9px" }}>{s}</span>;
}
const th: React.CSSProperties = { textAlign: "left", padding: "8px 10px", fontSize: 11, fontWeight: 700, color: C.muted, textTransform: "uppercase", letterSpacing: .4, borderBottom: `1px solid ${C.border}` };
const td: React.CSSProperties = { padding: "9px 10px", fontSize: 13, color: C.text, borderBottom: `1px solid ${C.border}`, verticalAlign: "top" };
const btnPrimary: React.CSSProperties = { display: "inline-flex", alignItems: "center", gap: 6, background: C.navy, color: "#fff", border: "none", borderRadius: 8, padding: "8px 14px", fontSize: 13, fontWeight: 600, cursor: "pointer" };
const btnGhost: React.CSSProperties = { display: "inline-flex", alignItems: "center", gap: 6, background: C.surface, color: C.text, border: `1px solid ${C.border}`, borderRadius: 8, padding: "7px 12px", fontSize: 12.5, fontWeight: 600, cursor: "pointer" };
const card: React.CSSProperties = { background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, boxShadow: "0 1px 4px rgba(0,0,0,0.06)" };
const lbl: React.CSSProperties = { display: "block", fontSize: 12.5, fontWeight: 600, color: C.text, marginBottom: 5 };
// Baris penutup lembar analisa: label rata kanan menempel ke angkanya, supaya
// mata membaca "Jumlah ..... Rp X" sebagai satu baris, bukan dua kolom terpisah.
const tfLabel: React.CSSProperties = { padding: "6px 10px", fontSize: 12.5, color: C.mid, textAlign: "right" };
const tfAngka: React.CSSProperties = { padding: "6px 10px", fontSize: 12.5, color: C.text, textAlign: "right", fontFamily: "monospace" };

// ══ TAB 1 — KOMPOSER ══════════════════════════════════════════════════════════
function KomposerTab() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [projectId, setProjectId] = useState("");
  const [scenarios, setScenarios] = useState<Scenario[]>([]);
  const [openVersion, setOpenVersion] = useState<VersionDetail | null>(null);
  const [rollup, setRollup] = useState<Rollup | null>(null);
  const [editions, setEditions] = useState<Edition[]>([]);
  const [showNewScenario, setShowNewScenario] = useState(false);
  const [showAddItem, setShowAddItem] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  useEffect(() => {
    api.get<{ projects: Project[] }>("/api/v1/projects").then(r => setProjects(r.data.projects ?? [])).catch(() => {});
    api.get<{ data: Edition[] }>("/api/v1/cecep/editions").then(r => setEditions(r.data.data ?? [])).catch(() => {});
  }, []);

  const loadScenarios = useCallback(async (pid: string) => {
    if (!pid) { setScenarios([]); return; }
    const r = await api.get<{ data: Scenario[] }>(`/api/v1/projects/${pid}/scenarios`);
    setScenarios(r.data.data ?? []);
  }, []);
  useEffect(() => { void loadScenarios(projectId); setOpenVersion(null); }, [projectId, loadScenarios]);

  const openDetail = async (versionId: string) => {
    const r = await api.get<{ data: VersionDetail }>(`/api/v1/estimate-versions/${versionId}`);
    setOpenVersion(r.data.data);
    if ((r.data.data.items ?? []).length > 0) {
      const rr = await api.get<Rollup>(`/api/v1/estimate-versions/${versionId}/rollup`);
      setRollup(rr.data);
    } else setRollup(null);
  };
  const refreshDetail = async () => { if (openVersion) await openDetail(openVersion.id); await loadScenarios(projectId); };

  return (
    <div>
      <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", marginBottom: 14 }}>
        <select value={projectId} onChange={e => setProjectId(e.target.value)} style={{ ...inputStyle, width: 280 }}>
          <option value="">— Pilih proyek —</option>
          {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        {projectId && (
          <button style={btnPrimary} onClick={() => setShowNewScenario(true)}><Plus size={15} /> Skenario Baru</button>
        )}
      </div>
      {err && <div style={{ background: C.redBg, color: C.red, border: `1px solid ${C.border}`, borderRadius: 8, padding: "8px 12px", fontSize: 12.5, marginBottom: 10 }}>{err}</div>}

      {projectId && scenarios.length === 0 && (
        <p style={{ color: C.muted, fontSize: 13 }}>Belum ada skenario estimasi di proyek ini — buat satu untuk mulai menyusun RAB.</p>
      )}

      <div style={{ display: "grid", gap: 12 }}>
        {scenarios.map(sc => (
          <div key={sc.id} style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, padding: 14 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
              <div>
                <strong style={{ fontSize: 14, color: C.text }}>{sc.name}</strong>
                {sc.purpose && <span style={{ marginLeft: 8, fontSize: 12, color: C.muted }}>({sc.purpose})</span>}
              </div>
              <button style={btnGhost} disabled={busy} onClick={async () => {
                setBusy(true); setErr("");
                try {
                  await api.post(`/api/v1/scenarios/${sc.id}/versions`, {});
                  await loadScenarios(projectId);
                } catch (e) { setErr((e as { response?: { data?: { error?: string } } }).response?.data?.error ?? "Gagal membuat versi"); }
                finally { setBusy(false); }
              }}><Plus size={14} /> Versi baru</button>
            </div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 10 }}>
              {sc.versions.sort((a, b) => a.version_number - b.version_number).map(v => (
                <button key={v.id} onClick={() => void openDetail(v.id)}
                  style={{ ...btnGhost, borderColor: openVersion?.id === v.id ? C.navy : C.border }}>
                  v{v.version_number} <StatusBadge s={v.status} />
                  <span style={{ color: C.mid, fontWeight: 500 }}>{fmtRp(Number(v.total_amount))}</span>
                  <ChevronRight size={13} />
                </button>
              ))}
              {sc.versions.length === 0 && <span style={{ fontSize: 12.5, color: C.muted }}>belum ada versi</span>}
            </div>
          </div>
        ))}
      </div>

      {openVersion && (
        <div style={{ marginTop: 18, background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, padding: 16 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
            <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
              <Layers size={16} color={C.navy} />
              <strong style={{ fontSize: 14.5 }}>Versi {openVersion.version_number}</strong>
              <StatusBadge s={openVersion.status} />
              {openVersion.edition && <span style={{ fontSize: 12, color: C.mid }}>Edisi: <b>{openVersion.edition.code}</b></span>}
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              {openVersion.status === "draft" && (
                <>
                  <button style={btnPrimary} onClick={() => setShowAddItem(true)}><Plus size={14} /> Tambah Item</button>
                  <button style={{ ...btnGhost, color: C.green }} disabled={busy || openVersion.items.length === 0} onClick={async () => {
                    setBusy(true); setErr("");
                    try { await api.patch(`/api/v1/estimate-versions/${openVersion.id}/submit`); await refreshDetail(); }
                    catch (e) { setErr((e as { response?: { data?: { error?: string } } }).response?.data?.error ?? "Gagal submit"); }
                    finally { setBusy(false); }
                  }}><Send size={14} /> Ajukan</button>
                </>
              )}
            </div>
          </div>

          <div style={{ overflowX: "auto", marginTop: 12 }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead><tr>
                <th style={th}>Kode</th><th style={th}>Pekerjaan (assembly)</th><th style={th}>Vol</th>
                <th style={th}>Sat</th><th style={{ ...th, textAlign: "right" }}>Jumlah</th><th style={th} />
              </tr></thead>
              <tbody>
                {openVersion.items.map(it => (
                  <tr key={it.id}>
                    <td style={{ ...td, fontFamily: "monospace", fontSize: 12 }}>{it.assembly?.code ?? it.cost_code?.code}</td>
                    <td style={td}>{it.assembly?.name ?? it.cost_code?.name}</td>
                    <td style={td}>{Number(it.quantity).toLocaleString("id-ID")}</td>
                    <td style={td}>{it.assembly?.output_unit_code}</td>
                    <td style={{ ...td, textAlign: "right", fontWeight: 600 }}>{fmtRp(Number(it.amount))}</td>
                    <td style={{ ...td, width: 40 }}>
                      {openVersion.status === "draft" && (
                        <button title="Hapus item" style={{ background: "none", border: "none", cursor: "pointer", color: C.red }}
                          onClick={async () => {
                            try { await api.delete(`/api/v1/estimate-versions/${openVersion.id}/items/${it.id}`); await refreshDetail(); }
                            catch (e) { setErr((e as { response?: { data?: { error?: string } } }).response?.data?.error ?? "Gagal hapus"); }
                          }}><Trash2 size={14} /></button>
                      )}
                    </td>
                  </tr>
                ))}
                {openVersion.items.length === 0 && (
                  <tr><td style={{ ...td, color: C.muted }} colSpan={6}>Belum ada item — tambah dari katalog assembly.</td></tr>
                )}
              </tbody>
              <tfoot><tr>
                <td style={{ ...td, fontWeight: 700 }} colSpan={4}>TOTAL</td>
                <td style={{ ...td, textAlign: "right", fontWeight: 800, color: C.navy }}>{fmtRp(Number(openVersion.total_amount))}</td>
                <td style={td} />
              </tr></tfoot>
            </table>
          </div>

          {rollup && (
            <div style={{ marginTop: 16, borderTop: `1px solid ${C.border}`, paddingTop: 14 }}>
              <h4 style={{ margin: "0 0 8px", fontSize: 13, fontWeight: 700, color: C.mid, textTransform: "uppercase", letterSpacing: .4 }}>
                Rekapitulasi per Kategori
              </h4>
              <table style={{ width: "100%", borderCollapse: "collapse", maxWidth: 520 }}>
                <tbody>
                  {rollup.groups.map(g => (
                    <tr key={g.name}>
                      <td style={{ ...td, borderBottom: "none", padding: "4px 10px" }}>{g.name}</td>
                      <td style={{ ...td, borderBottom: "none", padding: "4px 10px", textAlign: "right" }}>{fmtRp(g.subtotal)}</td>
                    </tr>
                  ))}
                  <tr><td style={{ ...td, padding: "6px 10px", fontWeight: 600 }}>TOTAL BIAYA</td>
                      <td style={{ ...td, padding: "6px 10px", textAlign: "right", fontWeight: 600 }}>{fmtRp(rollup.totalBiaya)}</td></tr>
                  <tr><td style={{ ...td, borderBottom: "none", padding: "4px 10px" }}>
                        PPN ({(rollup.ppn_rate * 100).toFixed(0)}%, berlaku {rollup.at_date})
                      </td>
                      <td style={{ ...td, borderBottom: "none", padding: "4px 10px", textAlign: "right" }}>{fmtRp(rollup.ppn)}</td></tr>
                  <tr><td style={{ ...td, borderBottom: "none", padding: "6px 10px", fontWeight: 800, color: C.navy }}>GRAND TOTAL</td>
                      <td style={{ ...td, borderBottom: "none", padding: "6px 10px", textAlign: "right", fontWeight: 800, color: C.navy }}>{fmtRp(rollup.grandTotal)}</td></tr>
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {showNewScenario && (
        <NewScenarioModal projectId={projectId} editions={editions}
          onClose={() => setShowNewScenario(false)}
          onDone={async () => { setShowNewScenario(false); await loadScenarios(projectId); }} />
      )}
      {showAddItem && openVersion && (
        <AddItemModal version={openVersion} onClose={() => setShowAddItem(false)}
          onDone={async () => { setShowAddItem(false); await refreshDetail(); }} />
      )}
    </div>
  );
}

function NewScenarioModal({ projectId, editions, onClose, onDone }:
  { projectId: string; editions: Edition[]; onClose: () => void; onDone: () => Promise<void> }) {
  const [name, setName] = useState("");
  const [purpose, setPurpose] = useState("");
  const [editionCode, setEditionCode] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <Modal title="Skenario Estimasi Baru" onClose={onClose}>
      {label("Nama skenario")}
      <input style={inputStyle} value={name} onChange={e => setName(e.target.value)} placeholder="mis. Penawaran tender" />
      {label("Tujuan (opsional)")}
      <input style={inputStyle} value={purpose} onChange={e => setPurpose(e.target.value)} placeholder="tender / rap / studi" />
      {label("Edisi AHSP untuk versi pertama (opsional)")}
      <select style={inputStyle} value={editionCode} onChange={e => setEditionCode(e.target.value)}>
        <option value="">— tanpa edisi (custom) —</option>
        {editions.filter(e => e.is_active).map(e => <option key={e.id} value={e.code}>{e.code} — {e.name}</option>)}
      </select>
      {err && <p style={{ color: C.red, fontSize: 12.5 }}>{err}</p>}
      <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 16 }}>
        <button style={btnGhost} onClick={onClose}>Batal</button>
        <button style={btnPrimary} disabled={busy || !name.trim()} onClick={async () => {
          setBusy(true); setErr("");
          try {
            const sc = await api.post<{ id: string }>(`/api/v1/projects/${projectId}/scenarios`, { name, purpose: purpose || undefined });
            await api.post(`/api/v1/scenarios/${sc.data.id}/versions`, editionCode ? { edition_code: editionCode } : {});
            await onDone();
          } catch (e) { setErr((e as { response?: { data?: { error?: string } } }).response?.data?.error ?? "Gagal membuat skenario"); }
          finally { setBusy(false); }
        }}>Buat + Versi 1</button>
      </div>
    </Modal>
  );
}

interface CostCodeOpt { id: string; code: string; name: string }

// Item tak ada di katalog (§2 AHSP-EDITION-BUILDER-DESIGN.md) — 3 mode:
//   Katalog  : assembly existing (national/company) × price book (jalur lama)
//   Custom   : buat analisa company BARU di tempat (§2.2) lalu langsung dipakai
//   Lump-sum : harga langsung, TANPA analisa (§2.3 — bukan pekerjaan beranalisa)
function AddItemModal({ version, onClose, onDone }:
  { version: VersionDetail; onClose: () => void; onDone: () => Promise<void> }) {
  const [mode, setMode] = useState<"katalog" | "custom" | "lumpsum">("katalog");
  const [assemblies, setAssemblies] = useState<Assembly[]>([]);
  const [assemblyId, setAssemblyId] = useState("");
  const [qty, setQty] = useState("");
  const [priceDate, setPriceDate] = useState(new Date().toISOString().slice(0, 10));
  const [location, setLocation] = useState("");
  // C1: parameter bisnis TERLIHAT & dikirim eksplisit (bukan default tersembunyi).
  const [bukPct, setBukPct] = useState("10");
  const [roundMode, setRoundMode] = useState<"down" | "up" | "nearest" | "none">("down");
  const [roundStep, setRoundStep] = useState("100");
  const [err, setErr] = useState("");
  const [missing, setMissing] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  // Mode custom: buat analisa company baru
  const [costCodes, setCostCodes] = useState<CostCodeOpt[]>([]);
  const [customCode, setCustomCode] = useState("");
  const [customName, setCustomName] = useState("");
  const [customCostCodeId, setCustomCostCodeId] = useState("");
  const [customUnit, setCustomUnit] = useState("");
  const [customComps, setCustomComps] = useState<{ resource_code: string; coefficient: string }[]>([
    { resource_code: "", coefficient: "" },
  ]);

  // Mode lumpsum
  const [lumpCostCodeId, setLumpCostCodeId] = useState("");
  const [lumpAmount, setLumpAmount] = useState("");
  const [lumpNotes, setLumpNotes] = useState("");

  useEffect(() => {
    const q = version.edition ? `?edition=${encodeURIComponent(version.edition.code)}` : "";
    api.get<{ data: Assembly[] }>(`/api/v1/cecep/assemblies${q}`)
      .then(r => setAssemblies((r.data.data ?? []).filter(a => a.status === "active")))
      .catch(() => {});
    api.get<{ data: CostCodeOpt[] }>("/api/v1/cecep/cost-codes?limit=200")
      .then(r => setCostCodes(r.data.data ?? [])).catch(() => {});
  }, [version.edition]);

  const submitKatalog = async () => {
    await api.post(`/api/v1/estimate-versions/${version.id}/items`, {
      item_type: "assembly", assembly_id: assemblyId, quantity: Number(qty), price_date: priceDate,
      location: location || null, buk_fraction: Number(bukPct) / 100,
      rounding: { mode: roundMode, step: Number(roundStep) },
    });
  };
  const submitCustom = async () => {
    const created = await api.post<{ id: string }>("/api/v1/cecep/assemblies", {
      code: customCode, name: customName, cost_code_id: customCostCodeId,
      output_unit_code: customUnit,
      components: customComps
        .filter(c => c.resource_code.trim() && c.coefficient)
        .map(c => ({ resource_code: c.resource_code.trim(), coefficient: Number(c.coefficient) })),
      created_in_estimate_id: version.id,
    });
    await api.post(`/api/v1/estimate-versions/${version.id}/items`, {
      item_type: "assembly", assembly_id: created.data.id, quantity: Number(qty), price_date: priceDate,
      location: location || null, buk_fraction: Number(bukPct) / 100,
      rounding: { mode: roundMode, step: Number(roundStep) },
    });
  };
  const submitLumpsum = async () => {
    await api.post(`/api/v1/estimate-versions/${version.id}/items`, {
      item_type: "lumpsum", cost_code_id: lumpCostCodeId, amount: Number(lumpAmount), notes: lumpNotes || undefined,
    });
  };

  const canSubmit =
    mode === "katalog" ? Boolean(assemblyId && qty) :
    mode === "custom" ? Boolean(customCode && customName && customCostCodeId && customUnit && qty
      && customComps.some(c => c.resource_code.trim() && c.coefficient)) :
    Boolean(lumpCostCodeId && lumpAmount);

  return (
    <Modal title={`Tambah Item — Versi ${version.version_number}`} onClose={onClose}>
      <div style={{ display: "flex", gap: 6, marginBottom: 14 }}>
        {([["katalog", "Dari Katalog"], ["custom", "Buat Analisa Baru"], ["lumpsum", "Harga Langsung"]] as const).map(([k, t]) => (
          <button key={k} onClick={() => setMode(k)}
            style={{ ...btnGhost, borderColor: mode === k ? C.navy : C.border, color: mode === k ? C.navy : C.mid, fontWeight: mode === k ? 700 : 600 }}>
            {t}
          </button>
        ))}
      </div>

      {mode === "katalog" && (
        <>
          {label(`Assembly / AHSP ${version.edition ? `(edisi ${version.edition.code})` : ""}`)}
          <select style={inputStyle} value={assemblyId} onChange={e => setAssemblyId(e.target.value)}>
            <option value="">— pilih pekerjaan —</option>
            {assemblies.map(a => <option key={a.id} value={a.id}>{a.code} — {a.name} (per {a.output_unit_code})</option>)}
          </select>
          <p style={{ fontSize: 11.5, color: C.muted, margin: "6px 0 0" }}>
            Tidak ketemu? Coba tab &quot;Buat Analisa Baru&quot; atau &quot;Harga Langsung&quot; (untuk pekerjaan bukan-beranalisa: lift, pompa, septictank, dll).
          </p>
        </>
      )}

      {mode === "custom" && (
        <>
          <p style={{ fontSize: 11.5, color: C.muted, margin: "0 0 8px" }}>
            Analisa baru khusus proyek ini — tidak masuk katalog nasional/company lama.
          </p>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 2fr", gap: 10 }}>
            <div>{label("Kode")}<input style={inputStyle} value={customCode} onChange={e => setCustomCode(e.target.value)} placeholder="mis. CUSTOM-01" /></div>
            <div>{label("Nama pekerjaan")}<input style={inputStyle} value={customName} onChange={e => setCustomName(e.target.value)} /></div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 10 }}>
            <div>{label("Kategori (cost code)")}
              <select style={inputStyle} value={customCostCodeId} onChange={e => setCustomCostCodeId(e.target.value)}>
                <option value="">— pilih —</option>
                {costCodes.map(c => <option key={c.id} value={c.id}>{c.code} — {c.name}</option>)}
              </select></div>
            <div>{label("Satuan output")}<input style={inputStyle} value={customUnit} onChange={e => setCustomUnit(e.target.value)} placeholder="mis. m2, kg, unit" /></div>
          </div>
          {label("Komponen (resource code + koefisien)")}
          {customComps.map((c, i) => (
            <div key={i} style={{ display: "flex", gap: 6, marginBottom: 6 }}>
              <input style={{ ...inputStyle, flex: 2 }} value={c.resource_code} placeholder="kode resource"
                onChange={e => setCustomComps(cs => cs.map((x, xi) => xi === i ? { ...x, resource_code: e.target.value } : x))} />
              <input style={{ ...inputStyle, flex: 1 }} type="number" step="any" value={c.coefficient} placeholder="koefisien"
                onChange={e => setCustomComps(cs => cs.map((x, xi) => xi === i ? { ...x, coefficient: e.target.value } : x))} />
              {customComps.length > 1 && (
                <button style={{ background: "none", border: "none", cursor: "pointer", color: C.red }}
                  onClick={() => setCustomComps(cs => cs.filter((_, xi) => xi !== i))}><X size={16} /></button>
              )}
            </div>
          ))}
          <button style={{ ...btnGhost, marginBottom: 10 }} onClick={() => setCustomComps(cs => [...cs, { resource_code: "", coefficient: "" }])}>
            <Plus size={13} /> Tambah komponen
          </button>
          {label("Volume")}
          <input style={inputStyle} type="number" min="0" step="any" value={qty} onChange={e => setQty(e.target.value)} />
        </>
      )}

      {(mode === "katalog" || mode === "custom") && (
        <>
          {mode === "katalog" && (
            <>{label("Volume")}
              <input style={inputStyle} type="number" min="0" step="any" value={qty} onChange={e => setQty(e.target.value)} placeholder="mis. 518.4" /></>
          )}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <div>{label("Tanggal harga (price book)")}
              <input style={inputStyle} type="date" value={priceDate} onChange={e => setPriceDate(e.target.value)} /></div>
            <div>{label("Lokasi harga (opsional)")}
              <input style={inputStyle} value={location} onChange={e => setLocation(e.target.value)} placeholder="mis. Bandung" /></div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
            <div>{label("BUK %")}
              <input style={inputStyle} type="number" min="0" max="100" step="any" value={bukPct} onChange={e => setBukPct(e.target.value)} /></div>
            <div>{label("Pembulatan")}
              <select style={inputStyle} value={roundMode} onChange={e => setRoundMode(e.target.value as typeof roundMode)}>
                <option value="down">ROUNDDOWN</option><option value="up">ROUNDUP</option>
                <option value="nearest">ROUND</option><option value="none">Tanpa</option>
              </select></div>
            <div>{label("Kelipatan (Rp)")}
              <input style={inputStyle} type="number" min="0" value={roundStep} onChange={e => setRoundStep(e.target.value)} /></div>
          </div>
        </>
      )}

      {mode === "lumpsum" && (
        <>
          <p style={{ fontSize: 11.5, color: C.muted, margin: "0 0 8px" }}>
            Untuk pekerjaan yang bukan analisa AHSP (lift, pompa, septictank, air kerja, dll) — harga langsung, tanpa koefisien.
          </p>
          {label("Kategori (cost code)")}
          <select style={inputStyle} value={lumpCostCodeId} onChange={e => setLumpCostCodeId(e.target.value)}>
            <option value="">— pilih —</option>
            {costCodes.map(c => <option key={c.id} value={c.id}>{c.code} — {c.name}</option>)}
          </select>
          {label("Jumlah (Rp)")}
          <input style={inputStyle} type="number" min="0" step="any" value={lumpAmount} onChange={e => setLumpAmount(e.target.value)} />
          {label("Catatan (opsional)")}
          <input style={inputStyle} value={lumpNotes} onChange={e => setLumpNotes(e.target.value)} placeholder="mis. Sewa lift barang 1 bulan" />
        </>
      )}

      {err && (
        <div style={{ background: C.redBg, borderRadius: 8, padding: "8px 12px", marginTop: 10 }}>
          <p style={{ color: C.red, fontSize: 12.5, margin: 0 }}>{err}</p>
          {missing.length > 0 && (
            <p style={{ color: C.red, fontSize: 12, margin: "4px 0 0" }}>
              Harga belum ada di Price Book untuk: <b>{missing.join(", ")}</b> — isi lewat tab Harga.
            </p>
          )}
        </div>
      )}
      <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 16 }}>
        <button style={btnGhost} onClick={onClose}>Batal</button>
        <button style={btnPrimary} disabled={busy || !canSubmit} onClick={async () => {
          setBusy(true); setErr(""); setMissing([]);
          try {
            if (mode === "katalog") await submitKatalog();
            else if (mode === "custom") await submitCustom();
            else await submitLumpsum();
            await onDone();
          } catch (e) {
            const resp = (e as { response?: { data?: { error?: string; missing?: string[]; unknown?: string[] } } }).response?.data;
            setErr(resp?.error ?? "Gagal menambah item");
            setMissing(resp?.missing ?? resp?.unknown ?? []);
          } finally { setBusy(false); }
        }}>{mode === "lumpsum" ? "Tambah" : "Hitung & Tambah"}</button>
      </div>
    </Modal>
  );
}

// ══ TAB 2 — KATALOG AHSP ══════════════════════════════════════════════════════
//
// Rincian sengaja disusun MENYERUPAI LEMBAR ANALISA yang biasa dibaca: band
// A tenaga / B bahan / C alat, angka rata kanan, garis ganda sebelum HSP.
// Bukan tabel generik — orang yang terbiasa membaca AHSP mencari bentuk itu,
// dan menyusunnya berbeda memaksa mereka menerjemahkan ulang tiap kali.
//
// Yang membedakan dari versi sebelumnya: dulu hanya koefisien yang tampil.
// Koefisien tanpa harga tidak menjawab pertanyaan yang sebenarnya dibawa orang
// ke layar ini — "berapa harga pekerjaan ini".

interface HspKomponen {
  resource_code: string; resource_name: string; unit: string;
  coefficient: number; category: string;
  amount: number | null; subtotal: number | null;
  sumber: string | null; override_reason: string | null; effective_date: string | null;
}
interface HspLive {
  assembly: { id: string; code: string; name: string; output_unit: string; source: string; status: string };
  input: { price_date: string; location: string | null; buk_fraction: number };
  components: HspKomponen[];
  hsp_partial: boolean;
  missing_prices: string[];
  result: { groupTotals: Record<string, number>; subtotalD: number
            bukAmount: number; hspRaw: number; hspRounded: number } | null;
}

const GRUP_LABEL: Record<string, { huruf: string; judul: string }> = {
  labor:     { huruf: "A", judul: "Tenaga" },
  material:  { huruf: "B", judul: "Bahan" },
  equipment: { huruf: "C", judul: "Alat" },
};

function KatalogTab() {
  const [editions, setEditions] = useState<Edition[]>([]);
  const [edition, setEdition] = useState("");
  const [sumber, setSumber] = useState("");
  const [cari, setCari] = useState("");
  const [assemblies, setAssemblies] = useState<Assembly[]>([]);
  const [open, setOpen] = useState<string | null>(null);
  const [hsp, setHsp] = useState<Record<string, HspLive | "memuat" | "gagal">>({});
  const [adopsi, setAdopsi] = useState<Assembly | null>(null);
  const [pesan, setPesan] = useState("");

  useEffect(() => {
    api.get<{ data: Edition[] }>("/api/v1/cecep/editions").then(r => {
      const eds = r.data.data ?? [];
      setEditions(eds);
      const seeded = eds.find(e => e.source_sha256);
      if (seeded) setEdition(seeded.code);
    }).catch(() => {});
  }, []);

  const muat = useCallback(() => {
    const p = new URLSearchParams();
    if (edition) p.set("edition", edition);
    if (sumber) p.set("source", sumber);
    p.set("limit", "200");
    api.get<{ data: Assembly[] }>(`/api/v1/cecep/assemblies?${p}`)
      .then(r => setAssemblies(r.data.data ?? [])).catch(() => {});
  }, [edition, sumber]);
  useEffect(() => { muat(); }, [muat]);

  // HSP dimuat SAAT analisa dibuka, bukan untuk 3.038 baris sekaligus:
  // memuat semuanya berarti ribuan resolusi harga untuk data yang tak dilihat.
  function bukaAnalisa(a: Assembly) {
    if (open === a.id) return setOpen(null);
    setOpen(a.id);
    if (hsp[a.id] && hsp[a.id] !== "gagal") return;
    setHsp(h => ({ ...h, [a.id]: "memuat" }));
    api.get<HspLive>(`/api/v1/cecep/assemblies/${a.id}/hsp-live`)
      .then(r => setHsp(h => ({ ...h, [a.id]: r.data })))
      .catch(() => setHsp(h => ({ ...h, [a.id]: "gagal" })));
  }

  // Pencarian di sisi klien: daftar sudah dibatasi 200 baris oleh API, jadi
  // menyaring lagi ke server hanya menambah bolak-balik tanpa hasil berbeda.
  const terlihat = assemblies.filter(a => {
    if (!cari.trim()) return true;
    const q = cari.toLowerCase();
    return a.name.toLowerCase().includes(q) || a.code.toLowerCase().includes(q);
  });

  return (
    <div>
      {/* role=status: hasil salin analisa diumumkan pembaca layar, bukan hanya
          terlihat — pengguna yang tak melihat layar tetap tahu tindakannya
          berhasil. */}
      {pesan && (
        <div role="status" style={{ ...card, padding: "10px 14px", marginBottom: 12, display: "flex",
                      alignItems: "center", gap: 8, background: C.greenBg, borderColor: C.green }}>
          <CheckCircle2 size={15} color={C.green} />
          <span style={{ fontSize: 13, color: C.text }}>{pesan}</span>
        </div>
      )}

      <div style={{ display: "flex", gap: 9, alignItems: "center", marginBottom: 14, flexWrap: "wrap" }}>
        <input
          value={cari} onChange={e => setCari(e.target.value)}
          placeholder="Cari nama atau kode analisa…"
          style={{ ...inputStyle, flex: 1, minWidth: 220 }}
        />
        <select value={sumber} onChange={e => setSumber(e.target.value)} style={{ ...inputStyle, width: 168 }}>
          <option value="">Semua sumber</option>
          <option value="national">Katalog nasional</option>
          <option value="company">Katalog perusahaan</option>
        </select>
        <select value={edition} onChange={e => setEdition(e.target.value)} style={{ ...inputStyle, width: 230 }}>
          <option value="">Semua edisi</option>
          {editions.map(e => <option key={e.id} value={e.code}>{e.code}</option>)}
        </select>
        <span style={{ fontSize: 12.5, color: C.muted, whiteSpace: "nowrap" }}>
          {terlihat.length} analisa
        </span>
      </div>

      <div style={{ display: "grid", gap: 8 }}>
        {terlihat.map(a => {
          const h = hsp[a.id];
          const detail = h && h !== "memuat" && h !== "gagal" ? h : null;
          return (
            <div key={a.id} style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10 }}>
              <button onClick={() => bukaAnalisa(a)}
                aria-expanded={open === a.id}
                aria-label={`${a.code} — ${a.name}. ${open === a.id ? "Tutup" : "Buka"} rincian harga.`}
                style={{ display: "flex", width: "100%", alignItems: "flex-start", gap: 10,
                         padding: "11px 14px", background: "none", border: "none",
                         cursor: "pointer", textAlign: "left" }}>
                <span style={{ paddingTop: 2 }}>
                  {open === a.id ? <ChevronDown size={15} color={C.mid} /> : <ChevronRight size={15} color={C.mid} />}
                </span>
                <code style={{ fontSize: 12, color: C.navy, fontWeight: 700, minWidth: 84, paddingTop: 1 }}>{a.code}</code>
                <span style={{ flex: 1, fontSize: 13, color: C.text, lineHeight: 1.45 }}>{a.name}</span>
                <span style={{ fontSize: 11.5, color: C.muted, whiteSpace: "nowrap", paddingTop: 1 }}>
                  per {a.output_unit_code}
                </span>
                <span style={{
                  fontSize: 10.5, fontWeight: 700, borderRadius: 999, padding: "2px 8px",
                  whiteSpace: "nowrap",
                  color: a.source === "national" ? C.mid : C.navy,
                  border: `1px solid ${C.border}`,
                }}>
                  {a.source === "national" ? "NASIONAL" : "PERUSAHAAN"}
                </span>
              </button>

              {open === a.id && (
                <div style={{ borderTop: `1px solid ${C.border}`, padding: "12px 14px 14px" }}>
                  {h === "memuat" && <p style={{ fontSize: 12.5, color: C.muted, margin: 0 }}>Menghitung…</p>}
                  {h === "gagal" && (
                    <p style={{ fontSize: 12.5, color: C.red, margin: 0 }}>
                      Gagal memuat rincian harga. Coba tutup dan buka lagi.
                    </p>
                  )}
                  {detail && <RincianAnalisa d={detail} />}

                  {a.source === "national" && (
                    <div style={{ marginTop: 12, paddingTop: 12, borderTop: `1px solid ${C.border}`,
                                  display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                      <button onClick={() => setAdopsi(a)} style={btnGhost}>
                        <Plus size={13} /> Jadikan analisa perusahaan
                      </button>
                      <span style={{ fontSize: 11.5, color: C.muted, lineHeight: 1.5 }}>
                        Menyalin analisa ini supaya koefisiennya bisa Anda sesuaikan.
                        Analisa nasional tidak berubah.
                      </span>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
        {terlihat.length === 0 && (
          <p style={{ color: C.muted, fontSize: 13 }}>
            {cari ? `Tidak ada analisa yang cocok dengan "${cari}".` : "Tidak ada analisa untuk filter ini."}
          </p>
        )}
      </div>

      {adopsi && (
        <AdopsiModal
          asal={adopsi}
          onClose={() => setAdopsi(null)}
          onDone={(kode) => {
            setAdopsi(null);
            setPesan(`Analisa "${kode}" dibuat di katalog perusahaan.`);
            muat();
          }}
        />
      )}
    </div>
  );
}

/**
 * Rincian satu analisa, disusun seperti lembar AHSP: band per grup, angka rata
 * kanan, garis ganda sebelum HSP.
 */
function RincianAnalisa({ d }: { d: HspLive }) {
  const perGrup = (["labor", "material", "equipment"] as const)
    .map(k => ({ k, label: GRUP_LABEL[k], rows: d.components.filter(c => c.category === k) }))
    .filter(g => g.rows.length > 0);

  return (
    <div>
      {d.hsp_partial && (
        <div style={{ display: "flex", gap: 8, alignItems: "flex-start", padding: "9px 11px",
                      background: C.yellowBg, border: `1px solid ${C.yellow}`, borderRadius: 8,
                      marginBottom: 12 }}>
          <CircleOff size={14} color={C.yellow} style={{ flexShrink: 0, marginTop: 1 }} />
          <span style={{ fontSize: 12, color: C.text, lineHeight: 1.5 }}>
            {d.missing_prices.length} bahan/upah belum punya harga, jadi HSP di bawah
            <strong> belum lengkap</strong>. Isi harganya di tab Harga:{" "}
            <span style={{ color: C.mid }}>{d.missing_prices.slice(0, 4).join(", ")}
              {d.missing_prices.length > 4 && ` +${d.missing_prices.length - 4} lagi`}</span>
          </span>
        </div>
      )}

      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5 }}>
          <thead>
            <tr>
              <th style={{ ...th, width: "42%" }}>Uraian</th>
              <th style={th}>Sat</th>
              <th style={{ ...th, textAlign: "right" }}>Koefisien</th>
              <th style={{ ...th, textAlign: "right" }}>Harga satuan</th>
              <th style={{ ...th, textAlign: "right" }}>Jumlah</th>
            </tr>
          </thead>
          <tbody>
            {perGrup.map(g => (
              <Fragment key={g.k}>
                <tr>
                  <td colSpan={5} style={{
                    padding: "8px 6px 4px", fontSize: 11, fontWeight: 700,
                    color: C.mid, letterSpacing: "0.05em", textTransform: "uppercase",
                  }}>
                    {g.label.huruf}. {g.label.judul}
                  </td>
                </tr>
                {g.rows.map((c, i) => (
                  <tr key={`${g.k}-${i}`}>
                    <td style={{ ...td, lineHeight: 1.45 }}>
                      {c.resource_name}
                      {c.sumber === "override_proyek" && (
                        <span title={c.override_reason ?? ""} style={{
                          marginLeft: 6, fontSize: 10, fontWeight: 700, color: C.navy,
                          border: `1px solid ${C.border}`, borderRadius: 999, padding: "1px 6px",
                        }}>KHUSUS PROYEK</span>
                      )}
                    </td>
                    <td style={{ ...td, color: C.mid }}>{c.unit}</td>
                    <td style={{ ...td, textAlign: "right", fontFamily: "monospace" }}>
                      {Number(c.coefficient)}
                    </td>
                    <td style={{ ...td, textAlign: "right", fontFamily: "monospace",
                                 color: c.amount == null ? C.yellow : C.text }}>
                      {c.amount == null ? "belum ada" : fmtRp(c.amount)}
                    </td>
                    <td style={{ ...td, textAlign: "right", fontFamily: "monospace",
                                 color: c.subtotal == null ? C.muted : C.text }}>
                      {c.subtotal == null ? "—" : fmtRp(Math.round(c.subtotal))}
                    </td>
                  </tr>
                ))}
              </Fragment>
            ))}
          </tbody>
          {d.result && (
            <tfoot>
              <tr>
                <td colSpan={4} style={{ ...tfLabel, borderTop: `1px solid ${C.border}` }}>
                  D. Jumlah
                </td>
                <td style={{ ...tfAngka, borderTop: `1px solid ${C.border}` }}>
                  {fmtRp(Math.round(d.result.subtotalD))}
                </td>
              </tr>
              <tr>
                <td colSpan={4} style={tfLabel}>
                  Keuntungan &amp; overhead {Math.round(d.input.buk_fraction * 100)}%
                </td>
                <td style={tfAngka}>{fmtRp(Math.round(d.result.bukAmount))}</td>
              </tr>
              <tr>
                <td colSpan={4} style={{
                  ...tfLabel, fontWeight: 700, color: C.text, fontSize: 13,
                  borderTop: `3px double ${C.border}`, paddingTop: 9,
                }}>
                  Harga satuan pekerjaan, per {d.assembly.output_unit}
                </td>
                <td style={{
                  ...tfAngka, fontWeight: 700, color: C.navy, fontSize: 14,
                  borderTop: `3px double ${C.border}`, paddingTop: 9,
                }}>
                  {fmtRp(Math.round(d.result.hspRounded))}
                </td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>

      <p style={{ fontSize: 11.5, color: C.muted, margin: "10px 0 0", lineHeight: 1.5 }}>
        Harga per {new Date(d.input.price_date).toLocaleDateString("id-ID",
          { day: "numeric", month: "long", year: "numeric" })}.
        Mengubah harga di tab Harga langsung mengubah angka di sini.
      </p>
    </div>
  );
}

/** Salin analisa nasional jadi milik perusahaan, koefisien bisa disesuaikan. */
function AdopsiModal({ asal, onClose, onDone }: {
  asal: Assembly; onClose: () => void; onDone: (kode: string) => void;
}) {
  const [kode, setKode] = useState(`${asal.code}-CO`);
  const [alasan, setAlasan] = useState("");
  const [koef, setKoef] = useState<Record<string, string>>({});
  const [simpan, setSimpan] = useState(false);
  const [err, setErr] = useState("");

  const komponen = [...asal.components].sort((a, b) => a.sort_order - b.sort_order);

  async function kirim(e: React.FormEvent) {
    e.preventDefault();
    setSimpan(true); setErr("");
    try {
      const diubah = komponen
        .filter(c => c.resource && koef[c.resource.code]?.trim())
        .map(c => ({ resource_code: c.resource!.code, coefficient: Number(koef[c.resource!.code]) }))
        .filter(x => Number.isFinite(x.coefficient) && x.coefficient > 0);

      const r = await api.post<{ data: { code: string } }>(
        `/api/v1/cecep/assemblies/${asal.id}/adopt`,
        { code: kode.trim(), reason: alasan.trim() || undefined,
          components: diubah.length ? diubah : undefined });
      onDone(r.data.data.code);
    } catch (e: unknown) {
      const x = e as { response?: { data?: { error?: string } } };
      setErr(x?.response?.data?.error ?? "Gagal menyalin analisa");
    } finally { setSimpan(false); }
  }

  return createPortal(
    <div
      role="dialog" aria-modal="true" aria-label="Jadikan analisa perusahaan"
      onKeyDown={e => { if (e.key === "Escape") onClose(); }}
      style={{
        position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", zIndex: 70,
        display: "flex", alignItems: "center", justifyContent: "center", padding: 20,
      }} onClick={onClose}>
      <form onClick={e => e.stopPropagation()} onSubmit={kirim} style={{
        ...card, width: "100%", maxWidth: 660, maxHeight: "88vh", overflowY: "auto", padding: 22,
      }}>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
          <div>
            <h2 style={{ fontSize: 16, fontWeight: 700, color: C.text, margin: "0 0 4px" }}>
              Jadikan analisa perusahaan
            </h2>
            <p style={{ fontSize: 12.5, color: C.mid, margin: 0, lineHeight: 1.55 }}>
              Menyalin <code style={{ color: C.navy }}>{asal.code}</code> ke katalog perusahaan.
              Analisa nasionalnya tidak berubah, dan tetap bisa dipakai seperti biasa.
            </p>
          </div>
          <button type="button" onClick={onClose} aria-label="Tutup"
            style={{ background: "none", border: "none", cursor: "pointer", padding: 4 }}>
            <X size={17} color={C.mid} />
          </button>
        </div>

        {err && (
          <div style={{ marginTop: 14, padding: "9px 12px", background: C.redBg,
                        border: `1px solid ${C.red}`, borderRadius: 8, fontSize: 12.5, color: C.text }}>
            {err}
          </div>
        )}

        <div style={{ display: "grid", gap: 14, marginTop: 18 }}>
          <div>
            <label style={lbl}>Kode analisa baru</label>
            <input value={kode} onChange={e => setKode(e.target.value)} required style={inputStyle} />
          </div>
          <div>
            <label style={lbl}>Alasan menyesuaikan</label>
            <input value={alasan} onChange={e => setAlasan(e.target.value)}
              placeholder="Mis. tim kami butuh waktu lebih lama untuk pekerjaan ini"
              style={inputStyle} />
          </div>
        </div>

        <div style={{ marginTop: 20 }}>
          <p style={{ fontSize: 12.5, fontWeight: 600, color: C.text, margin: "0 0 4px" }}>
            Sesuaikan koefisien
          </p>
          <p style={{ fontSize: 11.5, color: C.muted, margin: "0 0 10px", lineHeight: 1.5 }}>
            Kosongkan yang tidak berubah — yang dikosongkan memakai angka aslinya.
          </p>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5 }}>
            <thead>
              <tr>
                <th style={th}>Uraian</th>
                <th style={{ ...th, textAlign: "right" }}>Asli</th>
                <th style={{ ...th, textAlign: "right", width: 130 }}>Jadi</th>
              </tr>
            </thead>
            <tbody>
              {komponen.map((c, i) => c.resource && (
                <tr key={i}>
                  <td style={{ ...td, lineHeight: 1.45 }}>
                    {c.resource.name}
                    <span style={{ color: C.muted, marginLeft: 6 }}>{c.resource.unit_code}</span>
                  </td>
                  <td style={{ ...td, textAlign: "right", fontFamily: "monospace", color: C.mid }}>
                    {Number(c.coefficient)}
                  </td>
                  <td style={{ ...td, textAlign: "right" }}>
                    <input
                      value={koef[c.resource.code] ?? ""}
                      onChange={e => setKoef(k => ({ ...k, [c.resource!.code]: e.target.value }))}
                      placeholder={String(Number(c.coefficient))}
                      inputMode="decimal"
                      style={{ ...inputStyle, textAlign: "right", fontFamily: "monospace", padding: "6px 8px" }}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div style={{ display: "flex", gap: 9, marginTop: 20 }}>
          <button type="submit" disabled={simpan} style={{
            padding: "9px 16px", borderRadius: 9, border: "none", background: C.navy,
            color: "#fff", fontSize: 13, fontWeight: 600,
            cursor: simpan ? "wait" : "pointer", opacity: simpan ? 0.7 : 1,
          }}>
            {simpan ? "Menyalin…" : "Salin ke katalog perusahaan"}
          </button>
          <button type="button" onClick={onClose} style={btnGhost}>Batal</button>
        </div>
      </form>
    </div>,
    document.body
  );
}

// ══ TAB 3 — HARGA (PRICE BOOK) ════════════════════════════════════════════════
function HargaTab() {
  const [entries, setEntries] = useState<PriceEntry[]>([]);
  const [status, setStatus] = useState("");
  const [showNew, setShowNew] = useState(false);
  const [err, setErr] = useState("");

  const load = useCallback(async () => {
    const q = status ? `?status=${status}` : "";
    const r = await api.get<{ data: PriceEntry[] }>(`/api/v1/cecep/price-book${q}`);
    setEntries(r.data.data ?? []);
  }, [status]);
  useEffect(() => { void load(); }, [load]);

  const transition = async (id: string, to: string) => {
    setErr("");
    try { await api.patch(`/api/v1/cecep/price-book/${id}/status`, { status: to }); await load(); }
    catch (e) { setErr((e as { response?: { data?: { error?: string } } }).response?.data?.error ?? "Transisi gagal"); }
  };

  return (
    <div>
      <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 12, flexWrap: "wrap" }}>
        <select value={status} onChange={e => setStatus(e.target.value)} style={{ ...inputStyle, width: 180 }}>
          <option value="">Semua status</option>
          <option value="draft">draft</option><option value="verified">verified</option>
          <option value="active">active</option><option value="expired">expired</option>
        </select>
        <button style={btnPrimary} onClick={() => setShowNew(true)}><Plus size={14} /> Harga Baru</button>
        <span style={{ fontSize: 12, color: C.muted }}>Alur: draft → verified → active (maju saja, dijaga database). Hanya <b>active</b> yang dipakai menghitung.</span>
      </div>
      {err && <div style={{ background: C.redBg, color: C.red, borderRadius: 8, padding: "8px 12px", fontSize: 12.5, marginBottom: 10 }}>{err}</div>}
      <div style={{ overflowX: "auto", background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12 }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead><tr>
            <th style={th}>Resource</th><th style={{ ...th, textAlign: "right" }}>Harga</th><th style={th}>Sat</th>
            <th style={th}>Berlaku</th><th style={th}>Lokasi</th><th style={th}>Keyakinan</th><th style={th}>Status</th><th style={th}>Aksi</th>
          </tr></thead>
          <tbody>
            {entries.map(en => (
              <tr key={en.id}>
                <td style={td}><b>{en.resource?.name}</b><br /><code style={{ fontSize: 11, color: C.muted }}>{en.resource?.code}</code></td>
                <td style={{ ...td, textAlign: "right", fontWeight: 600 }}>{fmtRp(Number(en.amount))}</td>
                <td style={td}>{en.resource?.unit_code}</td>
                <td style={td}>{en.effective_date}{en.expired_date ? ` → ${en.expired_date}` : ""}</td>
                <td style={td}>{en.location ?? <span style={{ color: C.muted }}>umum</span>}</td>
                <td style={td}>{en.confidence_level
                  ? <span style={{ fontSize: 11, fontWeight: 600, color: en.confidence_level === "high" ? C.green : en.confidence_level === "low" ? C.red : C.yellow }}>
                      {en.confidence_level === "high" ? "Tinggi" : en.confidence_level === "low" ? "Rendah" : "Sedang"}
                    </span>
                  : <span style={{ color: C.muted }}>—</span>}</td>
                <td style={td}><StatusBadge s={en.status} /></td>
                <td style={{ ...td, whiteSpace: "nowrap" }}>
                  {en.status === "draft" && <button style={btnGhost} onClick={() => void transition(en.id, "verified")}><BadgeCheck size={13} /> Verifikasi</button>}
                  {en.status === "verified" && <button style={{ ...btnGhost, color: C.green }} onClick={() => void transition(en.id, "active")}><PlayCircle size={13} /> Aktifkan</button>}
                  {en.status === "active" && <button style={{ ...btnGhost, color: C.mid }} onClick={() => void transition(en.id, "expired")}><CircleOff size={13} /> Expire</button>}
                  {en.status === "expired" && <CheckCircle2 size={14} color={C.muted} />}
                </td>
              </tr>
            ))}
            {entries.length === 0 && <tr><td style={{ ...td, color: C.muted }} colSpan={8}>Belum ada entry harga.</td></tr>}
          </tbody>
        </table>
      </div>
      {showNew && <NewPriceModal onClose={() => setShowNew(false)} onDone={async () => { setShowNew(false); await load(); }} />}
    </div>
  );
}

function NewPriceModal({ onClose, onDone }: { onClose: () => void; onDone: () => Promise<void> }) {
  const [query, setQuery] = useState("");
  const [resources, setResources] = useState<{ code: string; name: string; unit_code: string }[]>([]);
  const [resourceCode, setResourceCode] = useState("");
  const [amount, setAmount] = useState("");
  const [effective, setEffective] = useState(new Date().toISOString().slice(0, 10));
  const [expired, setExpired] = useState("");
  const [location, setLocation] = useState("");
  const [supplier, setSupplier] = useState("");
  const [confidence, setConfidence] = useState<"" | "high" | "medium" | "low">("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  // Registry resource penuh (2.400+ entri) — cari-sambil-ketik via /cecep/resources,
  // BUKAN union dari assembly (workaround lama; sekarang mencakup resource yang
  // belum dipakai assembly manapun tapi tetap perlu diberi harga).
  useEffect(() => {
    const t = setTimeout(() => {
      const q = query.trim() ? `?q=${encodeURIComponent(query.trim())}&limit=50` : "?limit=50";
      api.get<{ data: { code: string; name: string; unit_code: string }[] }>(`/api/v1/cecep/resources${q}`)
        .then(r => setResources(r.data.data ?? [])).catch(() => {});
    }, 250);
    return () => clearTimeout(t);
  }, [query]);

  return (
    <Modal title="Entry Harga Baru (lahir draft)" onClose={onClose}>
      {label("Cari resource")}
      <input style={inputStyle} value={query} onChange={e => setQuery(e.target.value)} placeholder="ketik nama resource… mis. semen" />
      <select style={{ ...inputStyle, marginTop: 6 }} size={6} value={resourceCode} onChange={e => setResourceCode(e.target.value)}>
        {resources.map(r => <option key={r.code} value={r.code}>{r.name} ({r.code}, per {r.unit_code})</option>)}
        {resources.length === 0 && <option value="" disabled>— tidak ada hasil —</option>}
      </select>
      {label("Harga (Rp)")}
      <input style={inputStyle} type="number" min="0" step="any" value={amount} onChange={e => setAmount(e.target.value)} />
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        <div>{label("Berlaku sejak")}
          <input style={inputStyle} type="date" value={effective} onChange={e => setEffective(e.target.value)} /></div>
        <div>{label("Berlaku sampai (opsional)")}
          <input style={inputStyle} type="date" value={expired} onChange={e => setExpired(e.target.value)} /></div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        <div>{label("Lokasi (kosong = umum)")}
          <input style={inputStyle} value={location} onChange={e => setLocation(e.target.value)} placeholder="mis. Bandung" /></div>
        <div>{label("Tingkat keyakinan")}
          <select style={inputStyle} value={confidence} onChange={e => setConfidence(e.target.value as typeof confidence)}>
            <option value="">— tak ditentukan —</option>
            <option value="high">Tinggi (mis. penawaran resmi supplier)</option>
            <option value="medium">Sedang (mis. survei pasar)</option>
            <option value="low">Rendah (mis. perkiraan/estimasi)</option>
          </select></div>
      </div>
      {label("Supplier (opsional)")}
      <input style={inputStyle} value={supplier} onChange={e => setSupplier(e.target.value)} />
      {err && <p style={{ color: C.red, fontSize: 12.5 }}>{err}</p>}
      <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 16 }}>
        <button style={btnGhost} onClick={onClose}>Batal</button>
        <button style={btnPrimary} disabled={busy || !resourceCode || !amount} onClick={async () => {
          setBusy(true); setErr("");
          try {
            await api.post("/api/v1/cecep/price-book", {
              resource_code: resourceCode, amount: Number(amount), effective_date: effective,
              expired_date: expired || null, location: location || null, supplier: supplier || null,
              confidence_level: confidence || null,
            });
            await onDone();
          } catch (e) { setErr((e as { response?: { data?: { error?: string } } }).response?.data?.error ?? "Gagal menyimpan"); }
          finally { setBusy(false); }
        }}>Simpan (draft)</button>
      </div>
    </Modal>
  );
}

// ══ PAGE ══════════════════════════════════════════════════════════════════════
const TABS = [
  { key: "komposer", label: "Komposer", icon: Calculator },
  { key: "katalog", label: "Katalog AHSP", icon: BookOpen },
  { key: "harga", label: "Harga", icon: Coins },
] as const;

export default function EstimasiPage() {
  const [tab, setTab] = useState<(typeof TABS)[number]["key"]>("komposer");
  return (
    <div style={{ padding: "24px 28px", maxWidth: 1200 }}>
      <div style={{ marginBottom: 4 }}>
        <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800, color: C.text, fontFamily: "var(--font-display, inherit)" }}>Estimasi</h1>
        <p style={{ margin: "4px 0 0", fontSize: 13, color: C.mid }}>
          RAB dari analisa AHSP ber-edisi × price book — setiap rupiah bisa ditelusuri ke koefisien &amp; harga sumbernya.
        </p>
      </div>
      <div style={{ display: "flex", gap: 4, borderBottom: `1px solid ${C.border}`, margin: "16px 0 18px" }}>
        {TABS.map(t => {
          const Icon = t.icon; const active = tab === t.key;
          return (
            <button key={t.key} onClick={() => setTab(t.key)}
              style={{ display: "inline-flex", alignItems: "center", gap: 7, padding: "9px 14px", fontSize: 13,
                fontWeight: active ? 700 : 500, color: active ? C.navy : C.mid, background: "none", border: "none",
                borderBottom: active ? `2px solid ${C.navy}` : "2px solid transparent", cursor: "pointer", marginBottom: -1 }}>
              <Icon size={15} /> {t.label}
            </button>
          );
        })}
      </div>
      {tab === "komposer" && <KomposerTab />}
      {tab === "katalog" && <KatalogTab />}
      {tab === "harga" && <HargaTab />}
    </div>
  );
}
