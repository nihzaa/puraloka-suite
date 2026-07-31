"use client";

// Estimasi (CECEP M4 slice 1) — tiga tab (pola procurement):
//   Komposer  : proyek → skenario → versi → item dari assembly × price book
//   Katalog   : edisi AHSP + assembly + koefisien (read-only, ber-provenance)
//   Harga     : price book — entry lahir draft → verified → active (guard DB)
// Paritas C1: BUK & pembulatan SELALU terlihat & dikirim eksplisit dari form —
// tidak ada angka bisnis tersembunyi di kode UI.

import { Fragment, useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import {
  ComposedChart, Line, Area, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer,
} from "recharts";
import { api } from "@/lib/api";
import { useVirtualList } from "@/lib/use-virtual-list";
import {
  Calculator, Plus, X, ChevronRight, ChevronDown, BookOpen, Coins,
  Layers, Send, Trash2, CheckCircle2, BadgeCheck, PlayCircle, CircleOff, Pencil,
  Lock, ClipboardList, Package, HardHat, History, TrendingUp, Info,
  Scale, AlertTriangle,
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
interface CostCodeRingkas { id: string; code: string; name: string; status: string }
interface CostMapBaris {
  category_id: string; category_name: string; type: string | null;
  cost_code: CostCodeRingkas | null;
}
interface CostMapResponse { data: CostMapBaris[]; belum_dipetakan: number }
interface VariansBaris {
  cost_code_id: string | null; code: string; name: string; status: string;
  pagu: number; commitment: number; actual: number; exposure: number;
  variance: number | null; serapan_pct: number | null; jumlah_kategori: number;
}
interface VariansResponse {
  data: VariansBaris[];
  meta: {
    total_actual: number; commitment_total: number; exposure_total: number;
    jumlah_po_mengikat: number; kategori_total: number; kategori_dipetakan: number;
    actual_belum_dipetakan: number;
  };
}
interface CashflowPeriod { period: number; disbursement: number; cumulative: number }
interface CashflowResponse {
  estimate_version_id: string; status: string;
  baseline_total: number; periods: number; forecast: CashflowPeriod[];
}
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
interface RapSummary {
  id: string; name: string; status: string; notes: string | null;
  estimate_version_id: string; locked_at: string | null; created_at: string;
}
interface RapMaterialLine {
  id: string; qty_ahsp: number; qty_adjusted: number; unit_code: string;
  supplier_price: number; supplier_id: string | null; pagu: number; notes: string | null;
  resource: { code: string; name: string } | null;
}
interface RapLaborLine {
  id: string; description: string; borongan_value: number; notes: string | null;
  work_scope_id: string | null;
}
interface RapDetail {
  data: RapSummary;
  material: RapMaterialLine[];
  labor: RapLaborLine[];
  total: { material: number; labor: number; pagu: number };
}
interface RapChangeLogEntry {
  id: string; line_table: string; line_id: string; field_name: string | null;
  old_value: string | null; new_value: string | null; reason: string; changed_at: string;
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
    locked: [C.navy, C.bg],
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

      {/* Panduan sebelum proyek dipilih. Tanpa ini layar benar-benar kosong dan
          tak ada petunjuk harus mulai dari mana — halaman ini punya 4 langkah
          berjenjang, dan tak satu pun terlihat sampai langkah pertama diambil. */}
      {!projectId && <PanduanKomposer jumlahProyek={projects.length} />}

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

  // Analisa yang bisa dipilih = analisa EDISI versi ini + SELURUH analisa
  // company. Dua panggilan, sengaja.
  //
  // Sebelumnya hanya `?edition=...`, dan itu membuang seluruh 423 analisa
  // company: `assemblies.edition_id` mereka NULL — analisa milik perusahaan
  // memang tak menempel ke edisi nasional mana pun, karena ia bukan turunan
  // SE/SNI melainkan susunan sendiri. Akibatnya analisa yang justru dibuat
  // untuk dipakai tak pernah bisa dipilih saat menyusun RAB.
  useEffect(() => {
    let batal = false;
    const edisi = version.edition
      ? api.get<{ data: Assembly[] }>(`/api/v1/cecep/assemblies?edition=${encodeURIComponent(version.edition.code)}&limit=200`)
      : api.get<{ data: Assembly[] }>(`/api/v1/cecep/assemblies?source=national&limit=200`);
    const company = api.get<{ data: Assembly[] }>(`/api/v1/cecep/assemblies?source=company&limit=200`);

    void Promise.all([edisi, company])
      .then(([e, c]) => {
        if (batal) return;
        const gabung = [...(e.data.data ?? []), ...(c.data.data ?? [])];
        // Dedup by id: analisa company yang KEBETULAN punya edition_id terisi
        // akan muncul di kedua panggilan.
        const unik = new Map(gabung.map(a => [a.id, a]));
        setAssemblies([...unik.values()].filter(a => a.status === "active"));
      })
      .catch(() => {});

    api.get<{ data: CostCodeOpt[] }>("/api/v1/cecep/cost-codes?limit=200")
      .then(r => { if (!batal) setCostCodes(r.data.data ?? []); }).catch(() => {});
    return () => { batal = true; };
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
          {label(`Assembly / AHSP ${version.edition ? `(edisi ${version.edition.code} + analisa perusahaan)` : "(nasional + analisa perusahaan)"}`)}
          {/* Dikelompokkan supaya jelas mana milik perusahaan sendiri dan mana
              turunan edisi nasional — keduanya tampil berdampingan, tapi asalnya
              menentukan siapa yang bertanggung jawab atas koefisiennya. */}
          <select style={inputStyle} value={assemblyId} onChange={e => setAssemblyId(e.target.value)}>
            <option value="">— pilih pekerjaan —</option>
            {assemblies.some(a => a.source === "company") && (
              <optgroup label="Analisa Perusahaan">
                {assemblies.filter(a => a.source === "company").map(a => (
                  <option key={a.id} value={a.id}>{a.code} — {a.name} (per {a.output_unit_code})</option>
                ))}
              </optgroup>
            )}
            {assemblies.some(a => a.source !== "company") && (
              <optgroup label={version.edition ? `Edisi ${version.edition.code}` : "Analisa Nasional"}>
                {assemblies.filter(a => a.source !== "company").map(a => (
                  <option key={a.id} value={a.id}>{a.code} — {a.name} (per {a.output_unit_code})</option>
                ))}
              </optgroup>
            )}
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
  const [total, setTotal] = useState<number | null>(null);
  /** { assembly_id: jumlah resource yang belum berharga } — hanya yang > 0. */
  const [kurangHarga, setKurangHarga] = useState<Record<string, number>>({});
  const [hanyaKurang, setHanyaKurang] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  const [hsp, setHsp] = useState<Record<string, HspLive | "memuat" | "gagal">>({});
  const [adopsi, setAdopsi] = useState<Assembly | null>(null);
  const [editAsm, setEditAsm] = useState<Assembly | null>(null);
  const [aktivasi, setAktivasi] = useState<string | null>(null); // id sedang diaktifkan
  const [pesan, setPesan] = useState("");

  async function aktifkan(a: Assembly) {
    setAktivasi(a.id);
    try {
      await api.patch(`/api/v1/cecep/assemblies/${a.id}/activate`);
      setPesan(`Analisa "${a.code}" diaktifkan — sudah bisa dipakai di estimasi.`);
      muat();
    } catch (e: unknown) {
      const x = e as { response?: { data?: { error?: string } } };
      setPesan("");
      window.alert(x?.response?.data?.error ?? "Gagal mengaktifkan analisa");
    } finally { setAktivasi(null); }
  }

  useEffect(() => {
    api.get<{ data: Edition[] }>("/api/v1/cecep/editions").then(r => {
      const eds = r.data.data ?? [];
      setEditions(eds);
      const seeded = eds.find(e => e.source_sha256);
      if (seeded) setEdition(seeded.code);
    }).catch(() => {});
  }, []);

  // SELURUH katalog dimuat sekali (limit 5.000), lalu pencarian dilakukan di
  // memori — instan, tanpa bolak-balik server per ketikan.
  //
  // Beratnya dijaga di sisi render, bukan dengan memotong data: daftar
  // divirtualisasi sehingga browser hanya memegang ~30 baris kapan pun. Cara
  // lama (potong 200 + cari ke server) membuat analisa di baris ke-500 tak
  // pernah bisa DILIHAT oleh orang yang sedang mencari-cari justru karena
  // belum tahu kata kuncinya.
  const muat = useCallback(() => {
    const p = new URLSearchParams();
    if (edition) p.set("edition", edition);
    if (sumber) p.set("source", sumber);
    p.set("limit", "5000");
    api.get<{ data: Assembly[]; total: number | null }>(`/api/v1/cecep/assemblies?${p}`)
      .then(r => { setAssemblies(r.data.data ?? []); setTotal(r.data.total ?? null); })
      .catch(() => {});
  }, [edition, sumber]);

  useEffect(() => { muat(); }, [muat]);

  // Cakupan harga dimuat sekali per kombinasi filter — bukan per analisa dibuka.
  // Tanpa ini, analisa yang HSP-nya tak bisa dihitung baru ketahuan setelah
  // dipilih masuk RAB.
  useEffect(() => {
    let batal = false;
    const p = new URLSearchParams();
    if (edition) p.set("edition", edition);
    if (sumber) p.set("source", sumber);
    api.get<{ data: Record<string, number> }>(`/api/v1/cecep/assemblies/price-coverage?${p}`)
      .then(r => { if (!batal) setKurangHarga(r.data.data ?? {}); })
      .catch(() => { if (!batal) setKurangHarga({}); });
    return () => { batal = true; };
  }, [edition, sumber]);

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
  // Penyaringan di KLIEN — sekarang benar, karena seluruh katalog memang ada di
  // memori. Instan, tanpa debounce, tanpa panggilan server per ketikan.
  const terlihat = assemblies.filter(a => {
    if (hanyaKurang && !(kurangHarga[a.id] ?? 0)) return false;
    if (!cari.trim()) return true;
    const q = cari.toLowerCase();
    return a.name.toLowerCase().includes(q) || a.code.toLowerCase().includes(q);
  });
  // Terpotong hanya kalau katalog melebihi cap 5.000 — praktis tak terjadi
  // hari ini (3.043), tapi tetap dilaporkan supaya tak diam-diam menyesatkan
  // kalau katalognya tumbuh.
  const terpotong = total != null && total > assemblies.length;
  const jumlahKurang = assemblies.filter(a => (kurangHarga[a.id] ?? 0) > 0).length;

  // Tinggi baris seragam ~52px (kode + nama satu baris, padding 11px atas-bawah).
  const { pasang: pasangKatalog, mulai: vkMulai, akhir: vkAkhir, padTop: vkTop, padBottom: vkBawah, nonaktif: vkOff } = useVirtualList(terlihat.length, 52, { tinggiViewport: 560 });

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
        {/* Jujur soal pemotongan: label lama menulis "N analisa" seolah itu
            seluruhnya, padahal respons dibatasi 200 dari 3.043. Pemakai yang
            tak menemukan analisanya perlu tahu bahwa daftarnya memang dipotong,
            bukan menyimpulkan analisanya tidak ada. */}
        <span style={{ fontSize: 12.5, color: terpotong ? C.yellow : C.muted, whiteSpace: "nowrap" }}>
          {terpotong
            ? `${assemblies.length} dari ${total!.toLocaleString("id-ID")} — katalog melebihi batas muat`
            : cari.trim() || hanyaKurang
              ? `${terlihat.length.toLocaleString("id-ID")} dari ${assemblies.length.toLocaleString("id-ID")} analisa`
              : `${terlihat.length.toLocaleString("id-ID")} analisa`}
        </span>
        {jumlahKurang > 0 && (
          <button type="button" onClick={() => setHanyaKurang(v => !v)}
            aria-pressed={hanyaKurang}
            style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "6px 10px",
              fontSize: 12, fontWeight: 600, borderRadius: 8, cursor: "pointer",
              border: `1px solid ${hanyaKurang ? C.yellow : C.border}`,
              background: hanyaKurang ? C.yellowBg : C.surface,
              color: hanyaKurang ? C.yellow : C.mid, whiteSpace: "nowrap" }}>
            <AlertTriangle size={13} aria-hidden="true" />
            {hanyaKurang ? "Tampilkan semua" : `${jumlahKurang} harga belum lengkap`}
          </button>
        )}
      </div>

      {/* Wadah virtual: hanya baris yang terlihat + buffer yang dirender.
          Dua div berketinggian tetap menjaga panjang scrollbar tetap sesuai
          jumlah data sesungguhnya, sehingga posisi scroll terasa wajar.
          Saat data sedikit (<60), virtualisasi mati sendiri dan daftarnya
          dirender apa adanya. */}
      <div ref={pasangKatalog} style={{
        display: "grid", gap: 8,
        ...(vkOff ? {} : { maxHeight: 560, overflowY: "auto" as const, paddingRight: 4 }),
      }}>
        {vkTop > 0 && <div style={{ height: vkTop }} aria-hidden="true" />}
        {terlihat.slice(vkMulai, vkAkhir).map(a => {
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
                <span style={{ flex: 1, fontSize: 13, color: C.text, lineHeight: 1.45 }}>
                  {a.name}
                  {/* Penanda di level DAFTAR, bukan hanya setelah dibuka:
                      analisa yang HSP-nya tak bisa dihitung penuh harus terlihat
                      sebelum dipilih masuk RAB, bukan sesudahnya. */}
                  {(kurangHarga[a.id] ?? 0) > 0 && (
                    <span title={`${kurangHarga[a.id]} bahan/upah/alat belum punya harga aktif`}
                      style={{ display: "inline-flex", alignItems: "center", gap: 3, marginLeft: 8,
                        padding: "1px 7px", borderRadius: 999, background: C.yellowBg,
                        color: C.yellow, fontSize: 11, fontWeight: 700, whiteSpace: "nowrap" }}>
                      <AlertTriangle size={10} aria-hidden="true" />
                      {kurangHarga[a.id]} tanpa harga
                    </span>
                  )}
                  {a.source === "company" && (
                    <span style={{ marginLeft: 6, padding: "1px 7px", borderRadius: 999,
                      background: C.greenBg, color: C.green, fontSize: 11, fontWeight: 700 }}>
                      perusahaan
                    </span>
                  )}
                </span>
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
                {a.status === "draft" && (
                  <span style={{
                    fontSize: 10.5, fontWeight: 700, borderRadius: 999, padding: "2px 8px",
                    whiteSpace: "nowrap", color: C.yellow, border: `1px solid ${C.yellow}`,
                  }}>
                    DRAFT
                  </span>
                )}
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

                  <div style={{ marginTop: 12, paddingTop: 12, borderTop: `1px solid ${C.border}`,
                                display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                    {a.source === "national" && (
                      <>
                        <button onClick={() => setAdopsi(a)} style={btnGhost}>
                          <Plus size={13} /> Jadikan analisa perusahaan
                        </button>
                        <span style={{ fontSize: 11.5, color: C.muted, lineHeight: 1.5 }}>
                          Menyalin analisa ini supaya koefisiennya bisa Anda sesuaikan.
                          Analisa nasional tidak berubah.
                        </span>
                      </>
                    )}
                    <button onClick={() => setEditAsm(a)} style={btnGhost}>
                      <Pencil size={13} /> Edit (versi baru)
                    </button>
                    {a.status === "draft" && (
                      <button onClick={() => void aktifkan(a)} disabled={aktivasi === a.id}
                        style={{ ...btnGhost, color: C.green,
                                 cursor: aktivasi === a.id ? "wait" : "pointer",
                                 opacity: aktivasi === a.id ? 0.7 : 1 }}>
                        <PlayCircle size={13} /> {aktivasi === a.id ? "Mengaktifkan…" : "Aktifkan"}
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>
          );
        })}
        {vkBawah > 0 && <div style={{ height: vkBawah }} aria-hidden="true" />}
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

      {editAsm && (
        <EditAssemblyModal
          asal={editAsm}
          onClose={() => setEditAsm(null)}
          onDone={(sourceBaru) => {
            setEditAsm(null);
            setPesan(
              sourceBaru === "company"
                ? "Versi baru dibuat di katalog perusahaan (masih draft — aktifkan untuk dipakai)."
                : "Versi baru dibuat (masih draft — aktifkan untuk dipakai)."
            );
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

/**
 * Edit (versi baru) — correction (perbaikan, tetap berlabel sumber asal) atau
 * deviation (cara kerja sengaja beda; kalau asalnya nasional, otomatis jadi
 * milik perusahaan). Tak pernah mengubah baris asal — analisa yang sudah
 * dipakai estimasi tetap ke versi lama.
 */
function EditAssemblyModal({ asal, onClose, onDone }: {
  asal: Assembly; onClose: () => void; onDone: (sourceBaru: string) => void;
}) {
  const [editType, setEditType] = useState<"correction" | "deviation">("correction");
  const [alasan, setAlasan] = useState("");
  const [koef, setKoef] = useState<Record<string, string>>({});
  const [simpan, setSimpan] = useState(false);
  const [err, setErr] = useState("");

  const komponen = [...asal.components].sort((a, b) => a.sort_order - b.sort_order);
  const jadiCompany = editType === "deviation" && asal.source === "national";

  async function kirim(e: React.FormEvent) {
    e.preventDefault();
    setSimpan(true); setErr("");
    try {
      const diubah = komponen
        .filter(c => c.resource && koef[c.resource.code]?.trim())
        .map(c => ({ resource_code: c.resource!.code, coefficient: Number(koef[c.resource!.code]) }))
        .filter(x => Number.isFinite(x.coefficient) && x.coefficient > 0);

      if (diubah.length === 0) {
        setErr("Ubah minimal satu koefisien — versi baru identik dengan asalnya tidak dibuat.");
        setSimpan(false);
        return;
      }
      if (!alasan.trim()) {
        setErr("Alasan wajib diisi — tercatat sebagai jejak audit.");
        setSimpan(false);
        return;
      }

      const r = await api.post<{ data: { source: string } }>(
        `/api/v1/cecep/assemblies/${asal.id}/edit`,
        { edit_type: editType, reason: alasan.trim(), components: diubah });
      onDone(r.data.data.source);
    } catch (e: unknown) {
      const x = e as { response?: { data?: { error?: string } } };
      setErr(x?.response?.data?.error ?? "Gagal membuat versi baru");
    } finally { setSimpan(false); }
  }

  return createPortal(
    <div
      role="dialog" aria-modal="true" aria-label="Edit analisa (versi baru)"
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
              Edit <code style={{ color: C.navy }}>{asal.code}</code> (versi baru)
            </h2>
            <p style={{ fontSize: 12.5, color: C.mid, margin: 0, lineHeight: 1.55 }}>
              Membuat versi {asal.version_number + 1} berstatus draft. Analisa yang sudah
              dipakai di estimasi tetap memakai versi {asal.version_number} — tidak berubah.
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
            <label style={lbl}>Jenis perubahan</label>
            <div style={{ display: "flex", gap: 8 }}>
              <button type="button" onClick={() => setEditType("correction")}
                style={{ ...btnGhost, flex: 1, justifyContent: "center",
                         background: editType === "correction" ? C.bg : "none",
                         borderColor: editType === "correction" ? C.navy : C.border,
                         color: editType === "correction" ? C.navy : C.mid }}>
                Perbaikan (correction)
              </button>
              <button type="button" onClick={() => setEditType("deviation")}
                style={{ ...btnGhost, flex: 1, justifyContent: "center",
                         background: editType === "deviation" ? C.bg : "none",
                         borderColor: editType === "deviation" ? C.navy : C.border,
                         color: editType === "deviation" ? C.navy : C.mid }}>
                Penyimpangan (deviation)
              </button>
            </div>
            <p style={{ fontSize: 11.5, color: C.muted, margin: "6px 0 0", lineHeight: 1.5 }}>
              {editType === "correction"
                ? `Angka semula salah (mis. salah baca sumber). Hasil tetap "${asal.source === "national" ? "nasional" : "perusahaan"}" — labelnya dipertahankan.`
                : jadiCompany
                  ? "Cara kerja tim ini sengaja berbeda dari standar nasional. Hasil OTOMATIS jadi milik perusahaan — katalog nasional tetap murni."
                  : "Cara kerja sengaja diubah dari versi sebelumnya."}
            </p>
          </div>
          <div>
            <label style={lbl}>Alasan</label>
            <input value={alasan} onChange={e => setAlasan(e.target.value)}
              placeholder={editType === "correction"
                ? "Mis. koefisien terbaca 0,07, seharusnya 0,7"
                : "Mis. tim kami butuh waktu lebih lama untuk pekerjaan ini"}
              required style={inputStyle} />
          </div>
        </div>

        <div style={{ marginTop: 20 }}>
          <p style={{ fontSize: 12.5, fontWeight: 600, color: C.text, margin: "0 0 4px" }}>
            Ubah koefisien
          </p>
          <p style={{ fontSize: 11.5, color: C.muted, margin: "0 0 10px", lineHeight: 1.5 }}>
            Kosongkan yang tidak berubah. Minimal satu koefisien wajib diubah.
          </p>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5 }}>
            <thead>
              <tr>
                <th style={th}>Uraian</th>
                <th style={{ ...th, textAlign: "right" }}>Sekarang</th>
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
            {simpan ? "Menyimpan…" : "Buat versi baru (draft)"}
          </button>
          <button type="button" onClick={onClose} style={btnGhost}>Batal</button>
        </div>
      </form>
    </div>,
    document.body
  );
}

// ══ TAB 4 — MATERIAL & RAP ══════════════════════════════════════════════════
//
// RAP (Rencana Anggaran Pelaksanaan) ≠ RAB (Rencana Anggaran Biaya, tab Komposer):
// RAB = rencana JUAL ke klien (harga pasar + upah harian lewat AHSP). RAP = rencana
// BELANJA internal (harga supplier nyata + borongan mandor) — selisihnya margin yang
// dikelola. Qty material DITURUNKAN dari take-off RAB (qty_ahsp, beku) lalu boleh
// DISESUAIKAN (qty_adjusted) sebelum dikunci — itu satu-satunya titik penyesuaian.
//
// Sekali dikunci: baris material/labor beku total (guard DB, bukan hanya UI) — tak
// ada jalur "buka kunci". Penyesuaian sesudahnya HANYA lewat catatan change-log
// (murni arsip administratif, TIDAK mengubah pagu tersimpan).
function RapTab() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [projectId, setProjectId] = useState("");
  const [rapList, setRapList] = useState<RapSummary[]>([]);
  const [rapId, setRapId] = useState("");
  const [detail, setDetail] = useState<RapDetail | null>(null);
  const [changeLog, setChangeLog] = useState<RapChangeLogEntry[]>([]);
  const [showLogTable, setShowLogTable] = useState(false);
  const [showNewRap, setShowNewRap] = useState(false);
  const [showAddLabor, setShowAddLabor] = useState(false);
  const [showLogForm, setShowLogForm] = useState<{ table: "rap_material_line" | "rap_labor_line"; id: string; label: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [pesan, setPesan] = useState("");

  useEffect(() => {
    api.get<{ projects: Project[] }>("/api/v1/projects").then(r => setProjects(r.data.projects ?? [])).catch(() => {});
  }, []);

  const loadRapList = useCallback(async (pid: string) => {
    if (!pid) { setRapList([]); setRapId(""); return; }
    const r = await api.get<{ data: RapSummary[] }>(`/api/v1/projects/${pid}/rap`);
    setRapList(r.data.data ?? []);
  }, []);
  useEffect(() => { void loadRapList(projectId); setRapId(""); setDetail(null); }, [projectId, loadRapList]);

  const loadDetail = useCallback(async (id: string) => {
    if (!id) { setDetail(null); return; }
    const r = await api.get<RapDetail>(`/api/v1/rap/${id}`);
    setDetail(r.data);
  }, []);
  useEffect(() => { void loadDetail(rapId); }, [rapId, loadDetail]);

  const loadChangeLog = useCallback(async (id: string) => {
    const r = await api.get<{ data: RapChangeLogEntry[] }>(`/api/v1/rap/${id}/change-log`);
    setChangeLog(r.data.data ?? []);
  }, []);
  useEffect(() => { if (showLogTable && rapId) void loadChangeLog(rapId); }, [showLogTable, rapId, loadChangeLog]);

  const refresh = async () => { await loadDetail(rapId); await loadRapList(projectId); if (showLogTable) await loadChangeLog(rapId); };

  const locked = detail?.data.status === "locked";

  async function simpanQty(line: RapMaterialLine, field: "qty_adjusted" | "supplier_price", value: string) {
    const num = Number(value);
    if (!Number.isFinite(num) || num < 0) return;
    setErr("");
    try {
      await api.patch(`/api/v1/rap/${rapId}/material/${line.id}`, { [field]: num });
      await refresh();
    } catch (e) {
      setErr((e as { response?: { data?: { error?: string } } }).response?.data?.error ?? "Gagal menyimpan");
    }
  }

  async function kunciPagu() {
    if (!detail) return;
    if (!window.confirm(
      `Kunci pagu "${detail.data.name}"? Baris material & tenaga kerja tidak bisa diubah lagi setelah ini — hanya bisa dicatat via log perubahan.`
    )) return;
    setBusy(true); setErr("");
    try {
      await api.patch(`/api/v1/rap/${rapId}/lock`);
      setPesan("Pagu dikunci — baris material & tenaga kerja kini beku.");
      await refresh();
    } catch (e) {
      setErr((e as { response?: { data?: { error?: string } } }).response?.data?.error ?? "Gagal mengunci pagu");
    } finally { setBusy(false); }
  }

  return (
    <div>
      {pesan && (
        <div role="status" style={{ ...card, padding: "10px 14px", marginBottom: 12, display: "flex",
                      alignItems: "center", gap: 8, background: C.greenBg, borderColor: C.green }}>
          <CheckCircle2 size={15} color={C.green} />
          <span style={{ fontSize: 13, color: C.text }}>{pesan}</span>
        </div>
      )}
      {err && <div style={{ background: C.redBg, color: C.red, border: `1px solid ${C.border}`, borderRadius: 8, padding: "8px 12px", fontSize: 12.5, marginBottom: 10 }}>{err}</div>}

      <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", marginBottom: 14 }}>
        <select value={projectId} onChange={e => setProjectId(e.target.value)} style={{ ...inputStyle, width: 280 }}>
          <option value="">— Pilih proyek —</option>
          {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        {projectId && rapList.length > 0 && (
          <select value={rapId} onChange={e => setRapId(e.target.value)} style={{ ...inputStyle, width: 260 }}>
            <option value="">— Pilih RAP —</option>
            {rapList.map(r => <option key={r.id} value={r.id}>{r.name} ({r.status})</option>)}
          </select>
        )}
        {projectId && (
          <button style={btnPrimary} onClick={() => setShowNewRap(true)}><Plus size={15} /> RAP Baru</button>
        )}
      </div>

      {projectId && rapList.length === 0 && (
        <p style={{ color: C.muted, fontSize: 13 }}>
          Belum ada RAP di proyek ini — buat satu dari versi estimasi yang sudah disusun di tab Komposer.
        </p>
      )}

      {detail && (
        <div style={{ display: "grid", gap: 16 }}>
          <div style={{ ...card, padding: 16 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10 }}>
              <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                <ClipboardList size={16} color={C.navy} />
                <strong style={{ fontSize: 14.5 }}>{detail.data.name}</strong>
                <StatusBadge s={detail.data.status} />
              </div>
              {!locked && (
                <button style={{ ...btnGhost, color: C.navy }} disabled={busy || detail.total.pagu <= 0} onClick={() => void kunciPagu()}>
                  <Lock size={13} /> Kunci Pagu
                </button>
              )}
            </div>
            {detail.data.notes && <p style={{ fontSize: 12.5, color: C.mid, margin: "8px 0 0" }}>{detail.data.notes}</p>}
            <div style={{ display: "flex", gap: 24, marginTop: 14, flexWrap: "wrap" }}>
              <div>
                <div style={{ fontSize: 11, color: C.muted, textTransform: "uppercase", letterSpacing: .4 }}>Pagu Material</div>
                <div style={{ fontSize: 18, fontWeight: 700, color: C.text, fontFamily: "monospace" }}>{fmtRp(detail.total.material)}</div>
              </div>
              <div>
                <div style={{ fontSize: 11, color: C.muted, textTransform: "uppercase", letterSpacing: .4 }}>Borongan Tenaga Kerja</div>
                <div style={{ fontSize: 18, fontWeight: 700, color: C.text, fontFamily: "monospace" }}>{fmtRp(detail.total.labor)}</div>
              </div>
              <div>
                <div style={{ fontSize: 11, color: C.muted, textTransform: "uppercase", letterSpacing: .4 }}>Total Pagu</div>
                <div style={{ fontSize: 18, fontWeight: 800, color: C.navy, fontFamily: "monospace" }}>{fmtRp(detail.total.pagu)}</div>
              </div>
            </div>
          </div>

          <div style={card}>
            <div style={{ padding: "12px 16px", borderBottom: `1px solid ${C.border}`, display: "flex", alignItems: "center", gap: 8 }}>
              <Package size={15} color={C.navy} />
              <strong style={{ fontSize: 13.5 }}>Material</strong>
              <span style={{ fontSize: 11.5, color: C.muted }}>({detail.material.length} item)</span>
            </div>
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead><tr>
                  <th style={th}>Material</th><th style={{ ...th, textAlign: "right" }}>Qty RAB</th>
                  <th style={{ ...th, textAlign: "right", width: 110 }}>Qty Disesuaikan</th>
                  <th style={th}>Sat</th>
                  <th style={{ ...th, textAlign: "right", width: 140 }}>Harga Supplier</th>
                  <th style={{ ...th, textAlign: "right" }}>Pagu</th><th style={th} />
                </tr></thead>
                <tbody>
                  {detail.material.map(m => (
                    <tr key={m.id}>
                      <td style={td}>{m.resource?.name ?? "—"}</td>
                      <td style={{ ...td, textAlign: "right", fontFamily: "monospace", color: C.mid }}>{Number(m.qty_ahsp).toLocaleString("id-ID")}</td>
                      <td style={{ ...td, textAlign: "right" }}>
                        {locked ? Number(m.qty_adjusted).toLocaleString("id-ID") : (
                          <input defaultValue={Number(m.qty_adjusted)} inputMode="decimal"
                            onBlur={e => e.target.value !== String(Number(m.qty_adjusted)) && void simpanQty(m, "qty_adjusted", e.target.value)}
                            style={{ ...inputStyle, textAlign: "right", fontFamily: "monospace", padding: "5px 8px" }} />
                        )}
                      </td>
                      <td style={td}>{m.unit_code}</td>
                      <td style={{ ...td, textAlign: "right" }}>
                        {locked ? fmtRp(Number(m.supplier_price)) : (
                          <input defaultValue={Number(m.supplier_price)} inputMode="decimal"
                            onBlur={e => e.target.value !== String(Number(m.supplier_price)) && void simpanQty(m, "supplier_price", e.target.value)}
                            style={{ ...inputStyle, textAlign: "right", fontFamily: "monospace", padding: "5px 8px" }} />
                        )}
                      </td>
                      <td style={{ ...td, textAlign: "right", fontWeight: 600, fontFamily: "monospace" }}>{fmtRp(Number(m.pagu))}</td>
                      <td style={{ ...td, width: 36 }}>
                        {locked && (
                          <button title="Catat perubahan (arsip)" style={{ background: "none", border: "none", cursor: "pointer", color: C.muted }}
                            onClick={() => setShowLogForm({ table: "rap_material_line", id: m.id, label: m.resource?.name ?? m.id })}>
                            <Pencil size={13} />
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                  {detail.material.length === 0 && (
                    <tr><td style={td} colSpan={7}><span style={{ color: C.muted }}>Tidak ada baris material — versi estimasi ini mungkin tidak punya item berkategori material.</span></td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div style={card}>
            <div style={{ padding: "12px 16px", borderBottom: `1px solid ${C.border}`, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <HardHat size={15} color={C.navy} />
                <strong style={{ fontSize: 13.5 }}>Tenaga Kerja (Borongan)</strong>
              </div>
              {!locked && <button style={btnGhost} onClick={() => setShowAddLabor(true)}><Plus size={13} /> Tambah</button>}
            </div>
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead><tr>
                  <th style={th}>Uraian Pekerjaan</th><th style={{ ...th, textAlign: "right" }}>Nilai Borongan</th><th style={th} />
                </tr></thead>
                <tbody>
                  {detail.labor.map(l => (
                    <tr key={l.id}>
                      <td style={td}>{l.description}</td>
                      <td style={{ ...td, textAlign: "right", fontWeight: 600, fontFamily: "monospace" }}>{fmtRp(Number(l.borongan_value))}</td>
                      <td style={{ ...td, width: 36 }}>
                        {locked && (
                          <button title="Catat perubahan (arsip)" style={{ background: "none", border: "none", cursor: "pointer", color: C.muted }}
                            onClick={() => setShowLogForm({ table: "rap_labor_line", id: l.id, label: l.description })}>
                            <Pencil size={13} />
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                  {detail.labor.length === 0 && (
                    <tr><td style={td} colSpan={3}><span style={{ color: C.muted }}>Belum ada borongan tenaga kerja.</span></td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div style={card}>
            <button onClick={() => setShowLogTable(s => !s)}
              style={{ width: "100%", display: "flex", alignItems: "center", gap: 8, padding: "12px 16px",
                       background: "none", border: "none", cursor: "pointer", textAlign: "left" }}>
              <History size={15} color={C.mid} />
              <strong style={{ fontSize: 13.5, color: C.text }}>Log Perubahan</strong>
              <span style={{ fontSize: 11.5, color: C.muted }}>— catatan penyesuaian di luar sistem, tak mengubah pagu tersimpan</span>
              {showLogTable ? <ChevronDown size={14} color={C.mid} style={{ marginLeft: "auto" }} /> : <ChevronRight size={14} color={C.mid} style={{ marginLeft: "auto" }} />}
            </button>
            {showLogTable && (
              <div style={{ overflowX: "auto", borderTop: `1px solid ${C.border}` }}>
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead><tr>
                    <th style={th}>Waktu</th><th style={th}>Field</th><th style={th}>Lama</th><th style={th}>Baru</th><th style={th}>Alasan</th>
                  </tr></thead>
                  <tbody>
                    {changeLog.map(l => (
                      <tr key={l.id}>
                        <td style={{ ...td, fontSize: 12, color: C.mid }}>{new Date(l.changed_at).toLocaleString("id-ID")}</td>
                        <td style={td}>{l.field_name ?? "—"}</td>
                        <td style={{ ...td, color: C.mid }}>{l.old_value ?? "—"}</td>
                        <td style={td}>{l.new_value ?? "—"}</td>
                        <td style={td}>{l.reason}</td>
                      </tr>
                    ))}
                    {changeLog.length === 0 && (
                      <tr><td style={td} colSpan={5}><span style={{ color: C.muted }}>Belum ada catatan perubahan.</span></td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {showNewRap && projectId && (
        <NewRapModal projectId={projectId} onClose={() => setShowNewRap(false)}
          onDone={async (id) => { setShowNewRap(false); await loadRapList(projectId); setRapId(id); }} />
      )}
      {showAddLabor && detail && (
        <AddLaborModal rapId={detail.data.id} onClose={() => setShowAddLabor(false)}
          onDone={async () => { setShowAddLabor(false); await refresh(); }} />
      )}
      {showLogForm && detail && (
        <ChangeLogModal rapId={detail.data.id} table={showLogForm.table} lineId={showLogForm.id} label={showLogForm.label}
          onClose={() => setShowLogForm(null)}
          onDone={async () => { setShowLogForm(null); setPesan("Catatan perubahan disimpan."); if (showLogTable) await loadChangeLog(detail.data.id); }} />
      )}
    </div>
  );
}

function NewRapModal({ projectId, onClose, onDone }: { projectId: string; onClose: () => void; onDone: (id: string) => void }) {
  const [scenarios, setScenarios] = useState<Scenario[]>([]);
  const [versionId, setVersionId] = useState("");
  const [name, setName] = useState("RAP");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  useEffect(() => {
    api.get<{ data: Scenario[] }>(`/api/v1/projects/${projectId}/scenarios`).then(r => setScenarios(r.data.data ?? [])).catch(() => {});
  }, [projectId]);

  const allVersions = scenarios.flatMap(sc => sc.versions.map(v => ({ ...v, scenarioName: sc.name })));

  async function kirim(e: React.FormEvent) {
    e.preventDefault();
    if (!versionId) { setErr("Pilih versi estimasi sumber take-off terlebih dahulu"); return; }
    setBusy(true); setErr("");
    try {
      const r = await api.post<{ data: { id: string } }>(`/api/v1/projects/${projectId}/rap`, {
        estimate_version_id: versionId, name: name.trim() || undefined, notes: notes.trim() || undefined,
      });
      onDone(r.data.data.id);
    } catch (e) {
      setErr((e as { response?: { data?: { error?: string } } }).response?.data?.error ?? "Gagal membuat RAP");
    } finally { setBusy(false); }
  }

  return (
    <Modal title="RAP Baru" onClose={onClose}>
      <form onSubmit={kirim}>
        {err && <div style={{ marginBottom: 12, padding: "9px 12px", background: C.redBg, border: `1px solid ${C.red}`, borderRadius: 8, fontSize: 12.5, color: C.text }}>{err}</div>}
        <label style={lbl}>Versi estimasi (sumber take-off material)</label>
        <select value={versionId} onChange={e => setVersionId(e.target.value)} required style={{ ...inputStyle, marginBottom: 12 }}>
          <option value="">— Pilih versi —</option>
          {allVersions.map(v => (
            <option key={v.id} value={v.id}>{v.scenarioName} · v{v.version_number} ({v.status}) · {fmtRp(Number(v.total_amount))}</option>
          ))}
        </select>
        {allVersions.length === 0 && <p style={{ fontSize: 12, color: C.muted, margin: "-6px 0 12px" }}>Belum ada versi estimasi di proyek ini — buat dulu di tab Komposer.</p>}
        <label style={lbl}>Nama RAP</label>
        <input value={name} onChange={e => setName(e.target.value)} style={{ ...inputStyle, marginBottom: 12 }} />
        <label style={lbl}>Catatan (opsional)</label>
        <input value={notes} onChange={e => setNotes(e.target.value)} style={{ ...inputStyle, marginBottom: 16 }} />
        <div style={{ display: "flex", gap: 9 }}>
          <button type="submit" disabled={busy} style={{ ...btnPrimary, opacity: busy ? .7 : 1, cursor: busy ? "wait" : "pointer" }}>
            {busy ? "Membuat…" : "Buat RAP"}
          </button>
          <button type="button" onClick={onClose} style={btnGhost}>Batal</button>
        </div>
      </form>
    </Modal>
  );
}

function AddLaborModal({ rapId, onClose, onDone }: { rapId: string; onClose: () => void; onDone: () => void }) {
  const [description, setDescription] = useState("");
  const [value, setValue] = useState("");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  async function kirim(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setErr("");
    try {
      await api.post(`/api/v1/rap/${rapId}/labor`, {
        description: description.trim(), borongan_value: value ? Number(value) : undefined, notes: notes.trim() || undefined,
      });
      onDone();
    } catch (e) {
      setErr((e as { response?: { data?: { error?: string } } }).response?.data?.error ?? "Gagal menambah borongan");
    } finally { setBusy(false); }
  }

  return (
    <Modal title="Tambah Borongan Tenaga Kerja" onClose={onClose}>
      <form onSubmit={kirim}>
        {err && <div style={{ marginBottom: 12, padding: "9px 12px", background: C.redBg, border: `1px solid ${C.red}`, borderRadius: 8, fontSize: 12.5, color: C.text }}>{err}</div>}
        <label style={lbl}>Uraian pekerjaan</label>
        <input value={description} onChange={e => setDescription(e.target.value)} required
          placeholder="Mis. Borongan pasangan bata + plester lantai 1" style={{ ...inputStyle, marginBottom: 12 }} />
        <label style={lbl}>Nilai borongan (Rp)</label>
        <input value={value} onChange={e => setValue(e.target.value)} inputMode="decimal" style={{ ...inputStyle, marginBottom: 16 }} />
        <label style={lbl}>Catatan (opsional)</label>
        <input value={notes} onChange={e => setNotes(e.target.value)} style={{ ...inputStyle, marginBottom: 16 }} />
        <div style={{ display: "flex", gap: 9 }}>
          <button type="submit" disabled={busy} style={{ ...btnPrimary, opacity: busy ? .7 : 1, cursor: busy ? "wait" : "pointer" }}>
            {busy ? "Menyimpan…" : "Tambah"}
          </button>
          <button type="button" onClick={onClose} style={btnGhost}>Batal</button>
        </div>
      </form>
    </Modal>
  );
}

/** Catatan arsip murni — TIDAK mengubah pagu tersimpan (baris beku sesuai desain). */
function ChangeLogModal({ rapId, table, lineId, label, onClose, onDone }: {
  rapId: string; table: string; lineId: string; label: string; onClose: () => void; onDone: () => void;
}) {
  const [fieldName, setFieldName] = useState("");
  const [oldValue, setOldValue] = useState("");
  const [newValue, setNewValue] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  async function kirim(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setErr("");
    try {
      await api.post(`/api/v1/rap/${rapId}/change-log`, {
        line_table: table, line_id: lineId, field_name: fieldName.trim() || undefined,
        old_value: oldValue.trim() || undefined, new_value: newValue.trim() || undefined, reason: reason.trim(),
      });
      onDone();
    } catch (e) {
      setErr((e as { response?: { data?: { error?: string } } }).response?.data?.error ?? "Gagal menyimpan catatan");
    } finally { setBusy(false); }
  }

  return (
    <Modal title={`Catat Perubahan — ${label}`} onClose={onClose}>
      <form onSubmit={kirim}>
        <p style={{ fontSize: 12, color: C.mid, margin: "0 0 14px", lineHeight: 1.55 }}>
          Pagu sudah dikunci dan tak bisa diubah lagi. Catatan ini hanya arsip administratif
          (mis. harga supplier berubah setelah negosiasi ulang) — angka pagu tersimpan TIDAK berubah.
        </p>
        {err && <div style={{ marginBottom: 12, padding: "9px 12px", background: C.redBg, border: `1px solid ${C.red}`, borderRadius: 8, fontSize: 12.5, color: C.text }}>{err}</div>}
        <label style={lbl}>Field yang berubah (opsional)</label>
        <input value={fieldName} onChange={e => setFieldName(e.target.value)} placeholder="Mis. supplier_price" style={{ ...inputStyle, marginBottom: 12 }} />
        <div style={{ display: "flex", gap: 10 }}>
          <div style={{ flex: 1 }}>
            <label style={lbl}>Nilai lama (opsional)</label>
            <input value={oldValue} onChange={e => setOldValue(e.target.value)} style={{ ...inputStyle, marginBottom: 12 }} />
          </div>
          <div style={{ flex: 1 }}>
            <label style={lbl}>Nilai baru (opsional)</label>
            <input value={newValue} onChange={e => setNewValue(e.target.value)} style={{ ...inputStyle, marginBottom: 12 }} />
          </div>
        </div>
        <label style={lbl}>Alasan (wajib)</label>
        <input value={reason} onChange={e => setReason(e.target.value)} required
          placeholder="Mis. supplier menaikkan harga semen setelah pagu dikunci" style={{ ...inputStyle, marginBottom: 16 }} />
        <div style={{ display: "flex", gap: 9 }}>
          <button type="submit" disabled={busy} style={{ ...btnPrimary, opacity: busy ? .7 : 1, cursor: busy ? "wait" : "pointer" }}>
            {busy ? "Menyimpan…" : "Simpan Catatan"}
          </button>
          <button type="button" onClick={onClose} style={btnGhost}>Batal</button>
        </div>
      </form>
    </Modal>
  );
}

// ══ TAB 3 — HARGA (PRICE BOOK) ════════════════════════════════════════════════
function HargaTab() {
  const [entries, setEntries] = useState<PriceEntry[]>([]);
  const [total, setTotal] = useState<number | null>(null);
  const [status, setStatus] = useState("");
  const [cari, setCari] = useState("");
  const [showNew, setShowNew] = useState(false);
  const [prefill, setPrefill] = useState<{ code: string; name: string; unit_code: string } | null>(null);
  const [err, setErr] = useState("");

  // SELURUH price book dimuat sekali (limit 5.000), pencarian di memori.
  // Sebelumnya UI memanggil tanpa `limit` sehingga hanya dapat 100 dari 2.637 —
  // harga di luar itu tak pernah terlihat, dan pemakai menginput duplikat
  // karena mengira harganya belum ada.
  const load = useCallback(async () => {
    const p = new URLSearchParams();
    if (status) p.set("status", status);
    p.set("limit", "5000");
    const r = await api.get<{ data: PriceEntry[]; total: number | null }>(
      `/api/v1/cecep/price-book?${p}`);
    setEntries(r.data.data ?? []);
    setTotal(r.data.total ?? null);
  }, [status]);

  // Dibungkus lewat batas asinkron: `load()` menulis state di awal jalannya,
  // dan memanggilnya sinkron dari effect memicu render beruntun
  // (`react-hooks/set-state-in-effect`).
  useEffect(() => { void Promise.resolve().then(load); }, [load]);

  const terlihat = entries.filter(en => {
    if (!cari.trim()) return true;
    const q = cari.toLowerCase();
    return (en.resource?.name ?? "").toLowerCase().includes(q)
        || (en.resource?.code ?? "").toLowerCase().includes(q);
  });
  const terpotong = total != null && total > entries.length;
  const { pasang: pasangHarga, mulai: vhMulai, akhir: vhAkhir, padTop: vhTop, padBottom: vhBawah, nonaktif: vhOff } = useVirtualList(terlihat.length, 44, { tinggiViewport: 560 });

  function isiHarga(r: { code: string; name: string; unit_code: string }) {
    setPrefill(r);
    setShowNew(true);
  }

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
        <label htmlFor="harga-cari" style={{ position: "absolute", width: 1, height: 1,
          overflow: "hidden", clip: "rect(0 0 0 0)", whiteSpace: "nowrap" }}>
          Cari nama atau kode resource
        </label>
        <input id="harga-cari" type="search" value={cari} onChange={e => setCari(e.target.value)}
          placeholder="Cari resource (semen, besi, pekerja…)"
          style={{ ...inputStyle, width: 260 }} />
        <button style={btnPrimary} onClick={() => setShowNew(true)}><Plus size={14} /> Harga Baru</button>
        {/* Jujur soal pemotongan: 2.637 entri, hanya 200 termuat. Pemakai yang
            tak menemukan harganya perlu tahu daftarnya memang dipotong — bukan
            menyimpulkan harganya belum ada lalu menginput duplikat. */}
        {total != null && (
          <span style={{ fontSize: 12.5, whiteSpace: "nowrap",
            color: terpotong ? C.yellow : C.muted }}>
            {terpotong
              ? `${entries.length} dari ${total.toLocaleString("id-ID")} — melebihi batas muat`
              : cari.trim()
                ? `${terlihat.length.toLocaleString("id-ID")} dari ${entries.length.toLocaleString("id-ID")} harga`
                : `${terlihat.length.toLocaleString("id-ID")} harga`}
          </span>
        )}
      </div>
      <p style={{ fontSize: 12, color: C.muted, margin: "0 0 12px" }}>
        Alur: draft → verified → active (maju saja, dijaga database). Hanya <b>active</b> yang
        dipakai menghitung HSP.
      </p>
      {err && <div style={{ background: C.redBg, color: C.red, borderRadius: 8, padding: "8px 12px", fontSize: 12.5, marginBottom: 10 }}>{err}</div>}

      <PrioritasHarga onIsi={isiHarga} />

      {/* Wadah scroll vertikal untuk virtualisasi + horizontal untuk kolom
          yang tak muat di layar sempit. Tinggi dibatasi supaya tabel 2.637
          baris tak mendorong seluruh halaman menjadi sangat panjang. */}
      <div ref={pasangHarga} style={{ overflowX: "auto", background: C.surface,
        border: `1px solid ${C.border}`, borderRadius: 12,
        ...(vhOff ? {} : { maxHeight: 560, overflowY: "auto" as const }) }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead><tr>
            <th style={th}>Resource</th><th style={{ ...th, textAlign: "right" }}>Harga</th><th style={th}>Sat</th>
            <th style={th}>Berlaku</th><th style={th}>Lokasi</th><th style={th}>Keyakinan</th><th style={th}>Status</th><th style={th}>Aksi</th>
          </tr></thead>
          <tbody>
            {vhTop > 0 && <tr aria-hidden="true"><td colSpan={8} style={{ height: vhTop, padding: 0 }} /></tr>}
            {terlihat.slice(vhMulai, vhAkhir).map(en => (
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
            {vhBawah > 0 && <tr aria-hidden="true"><td colSpan={8} style={{ height: vhBawah, padding: 0 }} /></tr>}
            {terlihat.length === 0 && (
              <tr><td style={{ ...td, color: C.muted }} colSpan={8}>
                {cari.trim() ? `Tidak ada harga yang cocok dengan "${cari}".` : "Belum ada entry harga."}
              </td></tr>
            )}
          </tbody>
        </table>
      </div>
      {showNew && (
        <NewPriceModal
          initial={prefill}
          onClose={() => { setShowNew(false); setPrefill(null); }}
          onDone={async () => { setShowNew(false); setPrefill(null); await load(); }}
        />
      )}
    </div>
  );
}

interface ResourceTanpaHarga {
  resource_id: string; code: string; name: string; category: string
  unit_code: string; dipakai_analisa: number;
}

/**
 * Daftar bahan/upah tanpa harga, diurutkan DAMPAK — bukan abjad.
 *
 * "Sewa Tripot" sendiri memblokir 213 analisa; mengisi harganya langsung
 * menghidupkan 213 baris HSP sekaligus. Mengurutkan abjad berarti orang mengisi
 * yang dampaknya kecil dulu, sekadar karena namanya duluan di huruf A.
 */
function PrioritasHarga({ onIsi }: { onIsi: (r: { code: string; name: string; unit_code: string }) => void }) {
  const [data, setData] = useState<ResourceTanpaHarga[]>([]);
  const [total, setTotal] = useState(0);
  const [buka, setBuka] = useState(true);

  const muat = useCallback(() => {
    api.get<{ data: ResourceTanpaHarga[]; total_tanpa_harga: number }>(
      "/api/v1/cecep/prices/missing?limit=15")
      .then(r => { setData(r.data.data ?? []); setTotal(r.data.total_tanpa_harga ?? 0); })
      .catch(() => {});
  }, []);
  useEffect(() => { muat(); }, [muat]);

  if (total === 0) return null; // tak ada gunanya menunjukkan daftar kosong

  return (
    <div style={{ ...card, marginBottom: 14, background: C.yellowBg, borderColor: C.yellow }}>
      <button onClick={() => setBuka(b => !b)} aria-expanded={buka}
        style={{ display: "flex", width: "100%", alignItems: "center", gap: 9,
                 padding: "11px 14px", background: "none", border: "none", cursor: "pointer",
                 textAlign: "left" }}>
        {buka ? <ChevronDown size={15} color={C.text} /> : <ChevronRight size={15} color={C.text} />}
        <CircleOff size={15} color={C.yellow} style={{ flexShrink: 0 }} />
        <span style={{ fontSize: 13, fontWeight: 700, color: C.text }}>
          {total} bahan/upah belum punya harga
        </span>
        <span style={{ fontSize: 12, color: C.mid }}>
          — mengisi yang berdampak besar dulu menghidupkan lebih banyak analisa sekaligus
        </span>
      </button>

      {buka && (
        <div style={{ borderTop: `1px solid ${C.yellow}`, padding: "4px 14px 12px" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5 }}>
            <thead>
              <tr>
                <th style={th}>Bahan / upah</th>
                <th style={th}>Kategori</th>
                <th style={{ ...th, textAlign: "right" }}>Dipakai</th>
                <th style={th}></th>
              </tr>
            </thead>
            <tbody>
              {data.map(r => (
                <tr key={r.resource_id}>
                  <td style={td}>
                    {r.name}
                    <span style={{ color: C.muted, marginLeft: 6, fontSize: 11.5 }}>{r.unit_code}</span>
                  </td>
                  <td style={{ ...td, color: C.mid }}>{r.category}</td>
                  <td style={{ ...td, textAlign: "right", fontFamily: "monospace" }}>
                    {r.dipakai_analisa} analisa
                  </td>
                  <td style={{ ...td, whiteSpace: "nowrap" }}>
                    <button
                      onClick={() => onIsi({ code: r.code, name: r.name, unit_code: r.unit_code })}
                      style={btnGhost}
                    >
                      <Plus size={13} /> Isi harga
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {total > data.length && (
            <p style={{ fontSize: 11.5, color: C.mid, margin: "8px 2px 0" }}>
              Menampilkan {data.length} dari {total} — sisanya dampaknya lebih kecil.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function NewPriceModal({ initial, onClose, onDone }: {
  initial?: { code: string; name: string; unit_code: string } | null;
  onClose: () => void; onDone: () => Promise<void>;
}) {
  // `initial` datang dari daftar prioritas — resource-nya sudah pasti dipilih,
  // jadi kolom cari langsung menampilkan hasilnya tanpa menunggu ketikan.
  const [query, setQuery] = useState(initial?.name ?? "");
  const [resources, setResources] = useState<{ code: string; name: string; unit_code: string }[]>(
    initial ? [initial] : []);
  const [resourceCode, setResourceCode] = useState(initial?.code ?? "");
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
    // Saat resource sudah dipastikan lewat prefill, ketikan pertama (nama
    // resource itu sendiri, yang dipakai untuk mengisi kolom cari) TIDAK boleh
    // memicu pencarian ulang — kalau nama itu tak cocok persis hasil server,
    // dropdown-nya berganti isi tanpa alasan yang terlihat pengguna, padahal
    // resource-nya sudah benar dipilih.
    if (initial && query === initial.name) return;
    const t = setTimeout(() => {
      const q = query.trim() ? `?q=${encodeURIComponent(query.trim())}&limit=50` : "?limit=50";
      api.get<{ data: { code: string; name: string; unit_code: string }[] }>(`/api/v1/cecep/resources${q}`)
        .then(r => setResources(r.data.data ?? [])).catch(() => {});
    }, 250);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

// ── Panduan langkah Komposer ────────────────────────────────────────────────
//
// Menyusun RAB di sini berjenjang: proyek → skenario → versi → item. Sebelum
// langkah pertama diambil, TAK SATU PUN dari ketiga langkah berikutnya terlihat
// — jadi layarnya kosong dan pemakai baru tak punya petunjuk harus mulai dari
// mana. Panduan ini yang menutup jarak itu.
//
// Ditulis sebagai urutan, bukan daftar fitur: yang dibutuhkan orang di titik ini
// adalah "apa yang saya lakukan sekarang", bukan "apa saja yang bisa dilakukan".
function PanduanKomposer({ jumlahProyek }: { jumlahProyek: number }) {
  const langkah = [
    {
      n: 1, judul: "Pilih proyek",
      isi: jumlahProyek > 0
        ? `Dropdown di atas — ada ${jumlahProyek} proyek.`
        : "Belum ada proyek. Buat dulu di menu Proyek.",
    },
    {
      n: 2, judul: "Buat skenario",
      isi: "Wadah estimasi. Satu proyek boleh punya beberapa — misalnya “Penawaran awal” dan “Revisi klien” — supaya keduanya bisa dibandingkan tanpa saling menimpa.",
    },
    {
      n: 3, judul: "Buat versi + pilih edisi AHSP",
      isi: "Edisi menentukan koefisien yang dipakai (SE-47/2026, SE-68/2024, SNI-2013). Setelah versi keluar dari status draft, edisinya terkunci — angka yang sudah diajukan tak boleh berubah diam-diam.",
    },
    {
      n: 4, judul: "Tambah item pekerjaan",
      isi: "Pilih analisa dari katalog lalu isi volume; HSP dihitung dari koefisien × harga. Untuk pekerjaan tanpa analisa (lift, pompa, septictank) pakai mode Harga Langsung.",
    },
  ];

  return (
    <div style={{ border: `1px solid ${C.border}`, borderRadius: 12, padding: "18px 20px",
      background: C.surface, maxWidth: 720 }}>
      <h3 style={{ margin: "0 0 4px", fontSize: 15, fontWeight: 800, color: C.text,
        fontFamily: "var(--font-display, inherit)" }}>
        Menyusun RAB dari analisa AHSP
      </h3>
      <p style={{ margin: "0 0 16px", fontSize: 12.5, color: C.mid, lineHeight: 1.55 }}>
        Setiap rupiah di RAB yang disusun di sini bisa ditelusuri ke koefisien analisa
        dan harga sumbernya — berbeda dari RAB yang diunggah sebagai file Excel.
      </p>

      <ol style={{ margin: 0, padding: 0, listStyle: "none", display: "grid", gap: 12 }}>
        {langkah.map(l => (
          <li key={l.n} style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
            <span aria-hidden="true" style={{ flexShrink: 0, width: 24, height: 24, borderRadius: "50%",
              background: C.navy, color: "#fff", fontSize: 12, fontWeight: 700,
              display: "flex", alignItems: "center", justifyContent: "center" }}>
              {l.n}
            </span>
            <span>
              <span style={{ fontSize: 13, fontWeight: 700, color: C.text }}>{l.judul}</span>
              <span style={{ display: "block", fontSize: 12.5, color: C.mid, lineHeight: 1.55, marginTop: 2 }}>
                {l.isi}
              </span>
            </span>
          </li>
        ))}
      </ol>

      <p style={{ margin: "16px 0 0", paddingTop: 12, borderTop: `1px solid ${C.border}`,
        fontSize: 12, color: C.muted, lineHeight: 1.55 }}>
        Sudah punya RAB dalam bentuk file Excel? Unggah langsung di halaman
        <strong> Proyek → section RAB</strong> — jalur itu tetap tersedia dan tidak
        digantikan oleh Komposer.
      </p>
    </div>
  );
}

// ══ TAB: CASHFLOW FORECAST ════════════════════════════════════════════════════
// ROADMAP #10. Endpoint `GET /estimate-versions/:id/cashflow-forecast` sudah
// hidup sejak Milestone 4 — ber-test, dengan invariant Σ pencairan = baseline
// PERSIS — tapi tak pernah punya UI. Angka yang tak pernah dilihat siapa pun
// sama nilainya dengan angka yang tak pernah dihitung.
//
// Yang ditampilkan adalah PROYEKSI RENCANA (dari baseline estimasi), bukan kas
// aktual. Bedanya disebut eksplisit di UI: dashboard kas yang tak menyatakan
// dirinya rencana adalah cara termudah membuat orang salah membaca angkanya.
function CashflowTab() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [projectId, setProjectId] = useState("");
  const [scenarios, setScenarios] = useState<Scenario[]>([]);
  const [versionId, setVersionId] = useState("");
  const [periods, setPeriods] = useState(12);
  const [data, setData] = useState<CashflowResponse | null>(null);
  const [memuat, setMemuat] = useState(false);
  const [err, setErr] = useState("");

  useEffect(() => {
    api.get<{ projects: Project[] }>("/api/v1/projects")
      .then(r => setProjects(r.data.projects ?? [])).catch(() => {});
  }, []);

  // Effect ini TIDAK menulis state secara sinkron — semua setState terjadi di
  // dalam .then/.catch (asinkron). Menulisnya sinkron memicu render beruntun,
  // yang ditangkap `react-hooks/set-state-in-effect`. Reset saat proyek berganti
  // dilakukan di handler pemilih, tempat kejadiannya memang berasal.
  useEffect(() => {
    if (!projectId) return;
    let batal = false;
    api.get<{ data: Scenario[] }>(`/api/v1/projects/${projectId}/scenarios`)
      .then(r => { if (!batal) setScenarios(r.data.data ?? []); })
      .catch(() => { if (!batal) setScenarios([]); });
    return () => { batal = true; };
  }, [projectId]);

  // Pemuatan dibungkus effect yang tak menyentuh state secara sinkron: seluruh
  // setState terjadi setelah `await`, di dalam .then, atau di cleanup-guard.
  // Pola ini yang membuat `react-hooks/set-state-in-effect` tetap nol di sini.
  useEffect(() => {
    if (!versionId) return;
    let batal = false;
    const jalan = async () => {
      setMemuat(true); setErr("");
      try {
        const r = await api.get<CashflowResponse>(
          `/api/v1/estimate-versions/${versionId}/cashflow-forecast?periods=${periods}`);
        if (!batal) setData(r.data);
      } catch (e) {
        if (batal) return;
        setErr((e as { response?: { data?: { error?: string } } }).response?.data?.error
          ?? "Gagal memuat proyeksi");
        setData(null);
      } finally {
        if (!batal) setMemuat(false);
      }
    };
    void Promise.resolve().then(jalan);
    return () => { batal = true; };
  }, [versionId, periods]);

  // Hanya versi ber-nilai yang bisa diproyeksikan — versi Rp 0 menghasilkan
  // grafik datar yang tak memberi tahu apa pun. Ditandai di dropdown, bukan
  // disembunyikan: pengguna berhak tahu versinya ada tapi belum berisi.
  const semuaVersi = scenarios.flatMap(s =>
    s.versions.map(v => ({ ...v, scenarioName: s.name })));

  const puncak = data?.forecast.reduce(
    (a, b) => (b.disbursement > a.disbursement ? b : a), data.forecast[0]) ?? null;

  return (
    <div>
      {/* ── Pemilih ─────────────────────────────────────────────────────── */}
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "flex-end", marginBottom: 16 }}>
        <div>
          <label htmlFor="cf-proyek" style={LBL}>Proyek</label>
          <select id="cf-proyek" value={projectId}
            onChange={e => {
              setProjectId(e.target.value); setScenarios([]); setVersionId(""); setData(null);
            }}
            style={SEL}>
            <option value="">— pilih proyek —</option>
            {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </div>
        <div>
          <label htmlFor="cf-versi" style={LBL}>Versi estimasi</label>
          <select id="cf-versi" value={versionId}
            onChange={e => { setVersionId(e.target.value); if (!e.target.value) setData(null); }}
            disabled={!projectId} style={{ ...SEL, minWidth: 280 }}>
            <option value="">— pilih versi —</option>
            {semuaVersi.map(v => (
              <option key={v.id} value={v.id}>
                {v.scenarioName} · v{v.version_number} · {fmtRp(v.total_amount)}
                {Number(v.total_amount) > 0 ? "" : "  (belum berisi)"}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="cf-periode" style={LBL}>Jumlah periode</label>
          <select id="cf-periode" value={periods} onChange={e => setPeriods(Number(e.target.value))} style={SEL}>
            {[6, 12, 18, 24, 36, 52].map(n => <option key={n} value={n}>{n} periode</option>)}
          </select>
        </div>
      </div>

      {err && (
        <div role="alert" style={{ padding: "10px 12px", background: C.redBg, color: C.red,
          borderRadius: 8, fontSize: 13, marginBottom: 14 }}>{err}</div>
      )}

      {!versionId && !memuat && (
        <div style={{ padding: "40px 20px", textAlign: "center", color: C.muted, fontSize: 13,
          border: `1px dashed ${C.border}`, borderRadius: 10 }}>
          Pilih proyek dan versi estimasi untuk melihat proyeksi pencairan kas.
        </div>
      )}

      {memuat && <div style={{ padding: 24, color: C.mid, fontSize: 13 }}>Memuat proyeksi…</div>}

      {data && !memuat && (
        <>
          {/* ── Penegasan sifat angka. Bukan hiasan: ini yang membedakan
                 "rencana" dari "kas nyata", dan salah baca di sini berujung
                 keputusan belanja yang keliru. ─────────────────────────── */}
          <div style={{ display: "flex", gap: 8, alignItems: "flex-start", padding: "10px 12px",
            background: C.yellowBg, borderRadius: 8, fontSize: 12.5, color: C.text, marginBottom: 14 }}>
            <Info size={15} style={{ color: C.yellow, flexShrink: 0, marginTop: 1 }} aria-hidden="true" />
            <span>
              <strong>Ini proyeksi rencana, bukan kas nyata.</strong> Angka diturunkan dari
              baseline estimasi {fmtRp(data.baseline_total)} yang disebar mengikuti kurva-S —
              pola yang sama dengan Kurva S progres. Realisasi kas sesungguhnya ada di menu Kas.
            </span>
          </div>

          {/* ── KPI ───────────────────────────────────────────────────────── */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
            gap: 10, marginBottom: 16 }}>
            <KpiKas label="Baseline total" nilai={fmtRp(data.baseline_total)}
              ket={`status versi: ${data.status}`} />
            <KpiKas label="Periode puncak"
              nilai={puncak ? `Periode ${puncak.period}` : "—"}
              ket={puncak ? fmtRp(Math.round(puncak.disbursement)) : ""} />
            <KpiKas label="Pencairan periode 1"
              nilai={fmtRp(Math.round(data.forecast[0]?.disbursement ?? 0))}
              ket="awal proyek — kurva-S selalu landai di sini" />
            <KpiKas label="Dibagi ke"
              nilai={`${data.periods} periode`}
              ket="Σ pencairan = baseline persis" />
          </div>

          {/* ── Chart ─────────────────────────────────────────────────────── */}
          <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12,
            padding: "16px 12px 8px", marginBottom: 16 }}>
            <ResponsiveContainer width="100%" height={280}>
              <ComposedChart data={data.forecast} margin={{ top: 6, right: 12, left: 4, bottom: 4 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                <XAxis dataKey="period" tick={{ fontSize: 11, fill: "var(--text-secondary)" }}
                  label={{ value: "Periode", position: "insideBottom", offset: -2,
                    style: { fontSize: 11, fill: "var(--text-muted)" } }} />
                <YAxis tick={{ fontSize: 11, fill: "var(--text-secondary)" }}
                  tickFormatter={(v: number) => `${(v / 1_000_000).toFixed(0)} jt`} />
                <Tooltip
                  // Recharts v3 mengirim ValueType/ReactNode (bisa undefined), bukan
                  // number — jadi konversi dilakukan di sini, bukan diasumsikan.
                  formatter={(v, nama) => [fmtRp(Math.round(Number(v) || 0)), String(nama)]}
                  labelFormatter={(l) => `Periode ${String(l)}`}
                  contentStyle={{ background: "var(--surface)", border: "1px solid var(--border)",
                    borderRadius: 8, fontSize: 12 }} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Area type="monotone" dataKey="cumulative" name="Kumulatif"
                  stroke="var(--navy)" fill="var(--navy)" fillOpacity={0.10} strokeWidth={2} />
                <Line type="monotone" dataKey="disbursement" name="Pencairan per periode"
                  stroke="var(--success)" strokeWidth={2} dot={false} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>

          {/* ── Tabel ─────────────────────────────────────────────────────── */}
          <div style={{ border: `1px solid ${C.border}`, borderRadius: 12, overflow: "hidden" }}>
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                <caption style={{ captionSide: "top", textAlign: "left", padding: "10px 14px",
                  fontSize: 12.5, color: C.mid, background: C.surface }}>
                  Rincian pencairan per periode — kolom kumulatif berakhir persis di baseline.
                </caption>
                <thead>
                  <tr style={{ background: C.bg }}>
                    <th scope="col" style={TH}>Periode</th>
                    <th scope="col" style={{ ...TH, textAlign: "right" }}>Pencairan</th>
                    <th scope="col" style={{ ...TH, textAlign: "right" }}>Kumulatif</th>
                    <th scope="col" style={{ ...TH, textAlign: "right" }}>% baseline</th>
                  </tr>
                </thead>
                <tbody>
                  {data.forecast.map(p => {
                    const pct = data.baseline_total > 0
                      ? (p.cumulative / data.baseline_total) * 100 : 0;
                    return (
                      <tr key={p.period} style={{ borderTop: `1px solid ${C.border}` }}>
                        <td style={TD}>{p.period}</td>
                        <td style={{ ...TD, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
                          {fmtRp(Math.round(p.disbursement))}
                        </td>
                        <td style={{ ...TD, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
                          {fmtRp(Math.round(p.cumulative))}
                        </td>
                        <td style={{ ...TD, textAlign: "right", fontVariantNumeric: "tabular-nums", color: C.mid }}>
                          {pct.toFixed(1)}%
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

const LBL: React.CSSProperties = {
  display: "block", fontSize: 12, fontWeight: 600, color: C.mid, marginBottom: 5,
};
const SEL: React.CSSProperties = {
  padding: "8px 10px", fontSize: 13, borderRadius: 8, border: `1px solid ${C.border}`,
  background: C.surface, color: C.text, minWidth: 200, minHeight: 38,
};
const TH: React.CSSProperties = {
  padding: "9px 14px", textAlign: "left", fontSize: 12, fontWeight: 700, color: C.mid,
};
const TD: React.CSSProperties = { padding: "8px 14px", color: C.text };

function KpiKas({ label, nilai, ket }: { label: string; nilai: string; ket?: string }) {
  return (
    <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10, padding: "12px 14px" }}>
      <div style={{ fontSize: 11.5, fontWeight: 600, color: C.mid, marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 17, fontWeight: 800, color: C.text, fontVariantNumeric: "tabular-nums" }}>{nilai}</div>
      {ket && <div style={{ fontSize: 11, color: C.muted, marginTop: 3 }}>{ket}</div>}
    </div>
  );
}

// ══ TAB: VARIANS BIAYA per COST CODE ══════════════════════════════════════════
// ROADMAP #9. Migrasi 112 membangun ACL `cost_code_category_map` supaya belanja
// existing (yang hanya punya category_id) bisa dibaca per Cost Code. Tabelnya
// lahir ber-test tapi ISINYA 0 BARIS dan nol endpoint memakainya.
//
// Dua fungsi tab ini, berurutan:
//   1. ALAT PEMETAAN — tanpa peta terisi, laporan varians tak punya bahan.
//      Itu sebabnya bagian "belum dipetakan" ditaruh di ATAS, bukan disembunyikan.
//   2. LAPORAN — pagu vs commitment vs actual, dengan exposure sebagai angka
//      yang sesungguhnya menentukan apakah anggaran akan jebol.
function VariansTab() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [projectId, setProjectId] = useState("");
  const [peta, setPeta] = useState<CostMapResponse | null>(null);
  const [varians, setVarians] = useState<VariansResponse | null>(null);
  const [costCodes, setCostCodes] = useState<CostCodeRingkas[]>([]);
  const [bukaPeta, setBukaPeta] = useState(false);
  const [memuat, setMemuat] = useState(false);
  const [err, setErr] = useState("");

  useEffect(() => {
    api.get<{ projects: Project[] }>("/api/v1/projects")
      .then(r => setProjects(r.data.projects ?? [])).catch(() => {});
    api.get<{ data: CostCodeRingkas[] }>("/api/v1/cost-codes")
      .then(r => setCostCodes(r.data.data ?? [])).catch(() => {});
  }, []);

  const muat = useCallback(async (pid: string) => {
    if (!pid) return;
    setMemuat(true); setErr("");
    try {
      const [p, v] = await Promise.all([
        api.get<CostMapResponse>(`/api/v1/projects/${pid}/cost-map`),
        api.get<VariansResponse>(`/api/v1/projects/${pid}/varians`),
      ]);
      setPeta(p.data); setVarians(v.data);
    } catch (e) {
      setErr((e as { response?: { data?: { error?: string } } }).response?.data?.error
        ?? "Gagal memuat data varians");
    } finally { setMemuat(false); }
  }, []);

  useEffect(() => {
    if (!projectId) return;
    let batal = false;
    void Promise.resolve().then(() => { if (!batal) return muat(projectId); });
    return () => { batal = true; };
  }, [projectId, muat]);

  async function simpanPeta(categoryId: string, costCodeId: string) {
    setErr("");
    try {
      await api.put(`/api/v1/cost-map/${categoryId}`,
        { cost_code_id: costCodeId || null });
      await muat(projectId);
    } catch (e) {
      setErr((e as { response?: { data?: { error?: string } } }).response?.data?.error
        ?? "Gagal menyimpan pemetaan");
    }
  }

  const m = varians?.meta;

  return (
    <div>
      <div style={{ marginBottom: 16 }}>
        <label htmlFor="vr-proyek" style={LBL}>Proyek</label>
        <select id="vr-proyek" value={projectId}
          onChange={e => { setProjectId(e.target.value); setPeta(null); setVarians(null); }}
          style={SEL}>
          <option value="">— pilih proyek —</option>
          {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
      </div>

      {err && (
        <div role="alert" style={{ padding: "10px 12px", background: C.redBg, color: C.red,
          borderRadius: 8, fontSize: 13, marginBottom: 14 }}>{err}</div>
      )}

      {!projectId && !memuat && (
        <div style={{ padding: "40px 20px", textAlign: "center", color: C.muted, fontSize: 13,
          border: `1px dashed ${C.border}`, borderRadius: 10 }}>
          Pilih proyek untuk melihat belanja nyata dikelompokkan per Cost Code.
        </div>
      )}

      {memuat && <div style={{ padding: 24, color: C.mid, fontSize: 13 }}>Memuat…</div>}

      {varians && peta && !memuat && (
        <>
          {/* ── Peringatan pemetaan. Ditaruh PALING ATAS karena selama peta
                 kosong, seluruh belanja jatuh ke satu baris "belum dipetakan"
                 dan laporannya belum berguna. Ini bukan error — ini pekerjaan
                 yang menunggu, dan pengguna berhak tahu persis berapa. ─── */}
          {peta.belum_dipetakan > 0 && (
            <div style={{ display: "flex", gap: 9, alignItems: "flex-start", padding: "11px 13px",
              background: C.yellowBg, borderRadius: 8, fontSize: 12.5, color: C.text, marginBottom: 14 }}>
              <AlertTriangle size={15} style={{ color: C.yellow, flexShrink: 0, marginTop: 1 }} aria-hidden="true" />
              <span>
                <strong>{peta.belum_dipetakan} dari {peta.data.length} kategori belanja
                belum dipetakan</strong> ke Cost Code
                {m && m.actual_belum_dipetakan > 0 && (
                  <> — mencakup <strong>{fmtRp(m.actual_belum_dipetakan)}</strong> belanja
                  yang belum bisa dibaca per pos pekerjaan</>)}.
                {" "}Petakan di bagian bawah halaman ini.
              </span>
            </div>
          )}

          {/* ── KPI ───────────────────────────────────────────────────────── */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
            gap: 10, marginBottom: 16 }}>
            <KpiKas label="Belanja aktual" nilai={fmtRp(m?.total_actual ?? 0)}
              ket="expense approved/paid" />
            <KpiKas label="Commitment (PO)" nilai={fmtRp(m?.commitment_total ?? 0)}
              ket={`${m?.jumlah_po_mengikat ?? 0} PO mengikat — uang belum keluar`} />
            <KpiKas label="Exposure" nilai={fmtRp(m?.exposure_total ?? 0)}
              ket="aktual + commitment" />
            <KpiKas label="Kategori dipetakan"
              nilai={`${m?.kategori_dipetakan ?? 0} / ${m?.kategori_total ?? 0}`}
              ket="makin lengkap, makin tajam laporannya" />
          </div>

          {/* ── Kenapa kolom pagu & commitment per baris kosong ──────────── */}
          <div style={{ display: "flex", gap: 9, alignItems: "flex-start", padding: "10px 12px",
            background: C.bg, border: `1px solid ${C.border}`, borderRadius: 8,
            fontSize: 12, color: C.mid, marginBottom: 14 }}>
            <Info size={14} style={{ flexShrink: 0, marginTop: 1 }} aria-hidden="true" />
            <span>
              Kolom <strong>pagu</strong> dan <strong>commitment per baris</strong> belum terisi:
              RAP menyimpan pagu per <em>resource</em> dan PO menunjuk <em>material</em>, sementara
              jembatan keduanya ke Cost Code belum ada. Ditampilkan sebagai “—” (belum diketahui),
              bukan Rp 0 — supaya tak ada baris yang tampak jebol anggaran padahal pagunya
              memang belum diketahui.
            </span>
          </div>

          {/* ── Tabel varians ─────────────────────────────────────────────── */}
          <div style={{ border: `1px solid ${C.border}`, borderRadius: 12, overflow: "hidden", marginBottom: 20 }}>
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                <caption style={{ captionSide: "top", textAlign: "left", padding: "10px 14px",
                  fontSize: 12.5, color: C.mid, background: C.surface }}>
                  Belanja nyata dikelompokkan per Cost Code — urut exposure terbesar.
                </caption>
                <thead>
                  <tr style={{ background: C.bg }}>
                    <th scope="col" style={TH}>Cost Code</th>
                    <th scope="col" style={{ ...TH, textAlign: "right" }}>Aktual</th>
                    <th scope="col" style={{ ...TH, textAlign: "right" }}>Pagu</th>
                    <th scope="col" style={{ ...TH, textAlign: "right" }}>Sisa</th>
                    <th scope="col" style={{ ...TH, textAlign: "right" }}>Kategori</th>
                  </tr>
                </thead>
                <tbody>
                  {varians.data.length === 0 && (
                    <tr><td colSpan={5} style={{ ...TD, textAlign: "center", color: C.muted, padding: 24 }}>
                      Belum ada belanja approved/paid di proyek ini.
                    </td></tr>
                  )}
                  {varians.data.map(b => {
                    const belum = b.cost_code_id === null;
                    return (
                      <tr key={b.cost_code_id ?? "unmapped"} style={{ borderTop: `1px solid ${C.border}` }}>
                        <td style={TD}>
                          <div style={{ fontWeight: belum ? 500 : 600,
                            color: belum ? C.yellow : C.text }}>{b.name}</div>
                          {!belum && <div style={{ fontSize: 11, color: C.muted }}>{b.code}</div>}
                        </td>
                        <td style={{ ...TD, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
                          {fmtRp(b.actual)}
                        </td>
                        <td style={{ ...TD, textAlign: "right", color: C.muted }}>
                          {b.variance === null ? "—" : fmtRp(b.pagu)}
                        </td>
                        <td style={{ ...TD, textAlign: "right", fontVariantNumeric: "tabular-nums",
                          color: b.variance === null ? C.muted : b.variance < 0 ? C.red : C.green }}>
                          {b.variance === null ? "—" : fmtRp(b.variance)}
                        </td>
                        <td style={{ ...TD, textAlign: "right", color: C.mid }}>{b.jumlah_kategori}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* ── Alat pemetaan ─────────────────────────────────────────────── */}
          <div style={{ border: `1px solid ${C.border}`, borderRadius: 12, overflow: "hidden" }}>
            <button type="button" onClick={() => setBukaPeta(v => !v)}
              aria-expanded={bukaPeta}
              style={{ width: "100%", display: "flex", alignItems: "center", gap: 8, padding: "12px 14px",
                background: C.surface, border: "none", cursor: "pointer", fontSize: 13.5,
                fontWeight: 700, color: C.text, textAlign: "left" }}>
              {bukaPeta ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
              Pemetaan kategori belanja → Cost Code
              <span style={{ fontWeight: 500, color: C.mid, fontSize: 12.5 }}>
                ({peta.data.length - peta.belum_dipetakan}/{peta.data.length} terpetakan)
              </span>
            </button>

            {bukaPeta && (
              <div style={{ overflowX: "auto", borderTop: `1px solid ${C.border}` }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                  <thead>
                    <tr style={{ background: C.bg }}>
                      <th scope="col" style={TH}>Kategori belanja</th>
                      <th scope="col" style={TH}>Cost Code</th>
                    </tr>
                  </thead>
                  <tbody>
                    {peta.data.map(k => (
                      <tr key={k.category_id} style={{ borderTop: `1px solid ${C.border}` }}>
                        <td style={TD}>
                          {k.category_name}
                          {k.type && <span style={{ fontSize: 11, color: C.muted }}> · {k.type}</span>}
                        </td>
                        <td style={{ ...TD, padding: "6px 14px" }}>
                          <label htmlFor={`cc-${k.category_id}`} style={{
                            position: "absolute", width: 1, height: 1, overflow: "hidden",
                            clip: "rect(0 0 0 0)", whiteSpace: "nowrap" }}>
                            Cost Code untuk kategori {k.category_name}
                          </label>
                          <select id={`cc-${k.category_id}`}
                            value={k.cost_code?.id ?? ""}
                            onChange={e => void simpanPeta(k.category_id, e.target.value)}
                            style={{ ...SEL, minWidth: 260, minHeight: 34, padding: "6px 8px" }}>
                            <option value="">— belum dipetakan —</option>
                            {costCodes.map(c => (
                              <option key={c.id} value={c.id}>{c.name} ({c.code})</option>
                            ))}
                          </select>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

// ══ PAGE ══════════════════════════════════════════════════════════════════════
const TABS = [
  { key: "komposer", label: "Komposer", icon: Calculator },
  { key: "katalog", label: "Katalog AHSP", icon: BookOpen },
  { key: "harga", label: "Harga", icon: Coins },
  { key: "rap", label: "Material & RAP", icon: ClipboardList },
  { key: "cashflow", label: "Proyeksi Kas", icon: TrendingUp },
  { key: "varians", label: "Varians Biaya", icon: Scale },
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
      {tab === "rap" && <RapTab />}
      {tab === "cashflow" && <CashflowTab />}
      {tab === "varians" && <VariansTab />}
    </div>
  );
}
