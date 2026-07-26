"use client";

// Estimasi (CECEP M4 slice 1) — tiga tab (pola procurement):
//   Komposer  : proyek → skenario → versi → item dari assembly × price book
//   Katalog   : edisi AHSP + assembly + koefisien (read-only, ber-provenance)
//   Harga     : price book — entry lahir draft → verified → active (guard DB)
// Paritas C1: BUK & pembulatan SELALU terlihat & dikirim eksplisit dari form —
// tidak ada angka bisnis tersembunyi di kode UI.

import { useCallback, useEffect, useState } from "react";
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

// ══ TAB 1 — KOMPOSER ══════════════════════════════════════════════════════════
function KomposerTab() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [projectId, setProjectId] = useState("");
  const [scenarios, setScenarios] = useState<Scenario[]>([]);
  const [openVersion, setOpenVersion] = useState<VersionDetail | null>(null);
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

function AddItemModal({ version, onClose, onDone }:
  { version: VersionDetail; onClose: () => void; onDone: () => Promise<void> }) {
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

  useEffect(() => {
    const q = version.edition ? `?edition=${encodeURIComponent(version.edition.code)}` : "";
    api.get<{ data: Assembly[] }>(`/api/v1/cecep/assemblies${q}`)
      .then(r => setAssemblies((r.data.data ?? []).filter(a => a.status === "active")))
      .catch(() => {});
  }, [version.edition]);

  return (
    <Modal title={`Tambah Item — Versi ${version.version_number}`} onClose={onClose}>
      {label(`Assembly / AHSP ${version.edition ? `(edisi ${version.edition.code})` : ""}`)}
      <select style={inputStyle} value={assemblyId} onChange={e => setAssemblyId(e.target.value)}>
        <option value="">— pilih pekerjaan —</option>
        {assemblies.map(a => <option key={a.id} value={a.id}>{a.code} — {a.name} (per {a.output_unit_code})</option>)}
      </select>
      {label("Volume")}
      <input style={inputStyle} type="number" min="0" step="any" value={qty} onChange={e => setQty(e.target.value)} placeholder="mis. 518.4" />
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
        <button style={btnPrimary} disabled={busy || !assemblyId || !qty} onClick={async () => {
          setBusy(true); setErr(""); setMissing([]);
          try {
            await api.post(`/api/v1/estimate-versions/${version.id}/items`, {
              assembly_id: assemblyId, quantity: Number(qty), price_date: priceDate,
              location: location || null,
              buk_fraction: Number(bukPct) / 100,
              rounding: { mode: roundMode, step: Number(roundStep) },
            });
            await onDone();
          } catch (e) {
            const resp = (e as { response?: { data?: { error?: string; missing?: string[] } } }).response?.data;
            setErr(resp?.error ?? "Gagal menambah item");
            setMissing(resp?.missing ?? []);
          } finally { setBusy(false); }
        }}>Hitung & Tambah</button>
      </div>
    </Modal>
  );
}

// ══ TAB 2 — KATALOG AHSP ══════════════════════════════════════════════════════
function KatalogTab() {
  const [editions, setEditions] = useState<Edition[]>([]);
  const [edition, setEdition] = useState("");
  const [assemblies, setAssemblies] = useState<Assembly[]>([]);
  const [open, setOpen] = useState<string | null>(null);

  useEffect(() => {
    api.get<{ data: Edition[] }>("/api/v1/cecep/editions").then(r => {
      const eds = r.data.data ?? [];
      setEditions(eds);
      const seeded = eds.find(e => e.source_sha256); // edisi yang sudah ter-impor
      if (seeded) setEdition(seeded.code);
    }).catch(() => {});
  }, []);
  useEffect(() => {
    const q = edition ? `?edition=${encodeURIComponent(edition)}` : "";
    api.get<{ data: Assembly[] }>(`/api/v1/cecep/assemblies${q}`).then(r => setAssemblies(r.data.data ?? [])).catch(() => {});
  }, [edition]);

  return (
    <div>
      <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 14, flexWrap: "wrap" }}>
        <select value={edition} onChange={e => setEdition(e.target.value)} style={{ ...inputStyle, width: 300 }}>
          <option value="">— semua edisi/sumber —</option>
          {editions.map(e => <option key={e.id} value={e.code}>{e.code} — {e.name}</option>)}
        </select>
        <span style={{ fontSize: 12.5, color: C.muted }}>{assemblies.length} analisa</span>
      </div>
      <div style={{ display: "grid", gap: 8 }}>
        {assemblies.map(a => (
          <div key={a.id} style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10 }}>
            <button onClick={() => setOpen(open === a.id ? null : a.id)}
              style={{ display: "flex", width: "100%", alignItems: "center", gap: 10, padding: "11px 14px", background: "none", border: "none", cursor: "pointer", textAlign: "left" }}>
              {open === a.id ? <ChevronDown size={15} color={C.mid} /> : <ChevronRight size={15} color={C.mid} />}
              <code style={{ fontSize: 12, color: C.navy, fontWeight: 700, minWidth: 76 }}>{a.code}</code>
              <span style={{ flex: 1, fontSize: 13, color: C.text }}>{a.name}</span>
              <span style={{ fontSize: 11.5, color: C.muted }}>per {a.output_unit_code}</span>
              {a.is_import_baseline && <span title="Baseline impor — jejak 'SE bilang apa', immutable" style={{ fontSize: 10.5, fontWeight: 700, color: C.navy, border: `1px solid ${C.border}`, borderRadius: 999, padding: "1px 8px" }}>BASELINE</span>}
              <StatusBadge s={a.status} />
            </button>
            {open === a.id && (
              <div style={{ borderTop: `1px solid ${C.border}`, padding: "8px 14px 12px", overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead><tr><th style={th}>Komponen</th><th style={th}>Kategori</th><th style={th}>Sat</th><th style={{ ...th, textAlign: "right" }}>Koefisien</th></tr></thead>
                  <tbody>
                    {[...a.components].sort((x, y) => x.sort_order - y.sort_order).map((cmp, i) => (
                      <tr key={i}>
                        <td style={td}>{cmp.resource?.name}</td>
                        <td style={{ ...td, color: C.mid }}>{cmp.resource?.category}</td>
                        <td style={td}>{cmp.resource?.unit_code}</td>
                        <td style={{ ...td, textAlign: "right", fontFamily: "monospace" }}>{Number(cmp.coefficient)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        ))}
        {assemblies.length === 0 && <p style={{ color: C.muted, fontSize: 13 }}>Tidak ada analisa untuk filter ini.</p>}
      </div>
    </div>
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
            <th style={th}>Berlaku</th><th style={th}>Lokasi</th><th style={th}>Status</th><th style={th}>Aksi</th>
          </tr></thead>
          <tbody>
            {entries.map(en => (
              <tr key={en.id}>
                <td style={td}><b>{en.resource?.name}</b><br /><code style={{ fontSize: 11, color: C.muted }}>{en.resource?.code}</code></td>
                <td style={{ ...td, textAlign: "right", fontWeight: 600 }}>{fmtRp(Number(en.amount))}</td>
                <td style={td}>{en.resource?.unit_code}</td>
                <td style={td}>{en.effective_date}{en.expired_date ? ` → ${en.expired_date}` : ""}</td>
                <td style={td}>{en.location ?? <span style={{ color: C.muted }}>umum</span>}</td>
                <td style={td}><StatusBadge s={en.status} /></td>
                <td style={{ ...td, whiteSpace: "nowrap" }}>
                  {en.status === "draft" && <button style={btnGhost} onClick={() => void transition(en.id, "verified")}><BadgeCheck size={13} /> Verifikasi</button>}
                  {en.status === "verified" && <button style={{ ...btnGhost, color: C.green }} onClick={() => void transition(en.id, "active")}><PlayCircle size={13} /> Aktifkan</button>}
                  {en.status === "active" && <button style={{ ...btnGhost, color: C.mid }} onClick={() => void transition(en.id, "expired")}><CircleOff size={13} /> Expire</button>}
                  {en.status === "expired" && <CheckCircle2 size={14} color={C.muted} />}
                </td>
              </tr>
            ))}
            {entries.length === 0 && <tr><td style={{ ...td, color: C.muted }} colSpan={7}>Belum ada entry harga.</td></tr>}
          </tbody>
        </table>
      </div>
      {showNew && <NewPriceModal onClose={() => setShowNew(false)} onDone={async () => { setShowNew(false); await load(); }} />}
    </div>
  );
}

function NewPriceModal({ onClose, onDone }: { onClose: () => void; onDone: () => Promise<void> }) {
  const [resources, setResources] = useState<{ code: string; name: string; unit_code: string }[]>([]);
  const [resourceCode, setResourceCode] = useState("");
  const [amount, setAmount] = useState("");
  const [effective, setEffective] = useState(new Date().toISOString().slice(0, 10));
  const [location, setLocation] = useState("");
  const [supplier, setSupplier] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    // daftar resource dari katalog assembly (union sederhana; registry resource penuh menyusul)
    api.get<{ data: Assembly[] }>("/api/v1/cecep/assemblies").then(r => {
      const seen = new Map<string, { code: string; name: string; unit_code: string }>();
      for (const a of r.data.data ?? []) for (const cmp of a.components) {
        if (cmp.resource) seen.set(cmp.resource.code, cmp.resource);
      }
      setResources([...seen.values()].sort((a, b) => a.code.localeCompare(b.code)));
    }).catch(() => {});
  }, []);

  return (
    <Modal title="Entry Harga Baru (lahir draft)" onClose={onClose}>
      {label("Resource")}
      <select style={inputStyle} value={resourceCode} onChange={e => setResourceCode(e.target.value)}>
        <option value="">— pilih resource —</option>
        {resources.map(r => <option key={r.code} value={r.code}>{r.name} ({r.code}, per {r.unit_code})</option>)}
      </select>
      {label("Harga (Rp)")}
      <input style={inputStyle} type="number" min="0" step="any" value={amount} onChange={e => setAmount(e.target.value)} />
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        <div>{label("Berlaku sejak")}
          <input style={inputStyle} type="date" value={effective} onChange={e => setEffective(e.target.value)} /></div>
        <div>{label("Lokasi (kosong = umum)")}
          <input style={inputStyle} value={location} onChange={e => setLocation(e.target.value)} placeholder="mis. Bandung" /></div>
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
              location: location || null, supplier: supplier || null,
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
