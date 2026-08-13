"use client";

// Estimasi (CECEP M4 slice 1) — tiga tab (pola procurement):
//   Komposer  : proyek → skenario → versi → item dari assembly × price book
//   Katalog   : edisi AHSP + assembly + koefisien (read-only, ber-provenance)
//   Harga     : price book — entry lahir draft → verified → active (guard DB)
// Paritas C1: BUK & pembulatan SELALU terlihat & dikirim eksplisit dari form —
// tidak ada angka bisnis tersembunyi di kode UI.

import { Fragment, Suspense, useCallback, useEffect, useRef, useState } from "react";
import { useTabUrl } from "@/lib/use-tab-url";
import { TabBagian } from "@/components/tab-bagian";
import { useTutupEsc } from "@/lib/use-tutup-esc";
import { createPortal } from "react-dom";
import {
  ComposedChart, Line, Area, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer,
} from "recharts";
import { api } from "@/lib/api";
import { useVirtualList } from "@/lib/use-virtual-list";
import { PilihCari } from "@/components/pilih-cari";
import {
  Calculator, Plus, X, ChevronRight, ChevronDown, BookOpen, Coins,
  Layers, Send, Trash2, CheckCircle2, BadgeCheck, PlayCircle, CircleOff, Pencil,
  HelpCircle,
  Lock, ClipboardList, Package, HardHat, History, TrendingUp, Info,
  Scale, AlertTriangle,
} from "lucide-react";

import { C } from "@/lib/warna-ui";
// UI-0-4: dua belas dari lima belas tabel halaman ini memakai primitif bersama.
// `Tabel` menjamin caption sr-only, kolom pertama <th scope="row">, tabular-nums,
// dan pembungkus overflow-x. Tiga yang tersisa punya catatan alasannya
// masing-masing di tempatnya — rekap tanpa kepala kolom, lembar AHSP bertingkat,
// dan price book yang divirtualisasi.
import { Tabel, KepalaHalaman } from "@/components/dasar";
import { GAYA_KARTU } from "@/components/ui-dasar";
import { GAYA_ISIAN } from "@/components/isian";

/**
 * UIR-1 — format lewat `lib/format`, bukan `toLocaleString` per halaman.
 *
 * `fmtRp` lokal yang dulu ada di sini BERBEDA keluarannya dari `formatRupiah`
 * dalam dua hal, dan keduanya perbaikan:
 *
 *   negatif   `Rp -450.000`  →  `-Rp 450.000`   (konvensi Indonesia)
 *   desimal   `Rp 1.234,56`  →  `Rp 1.235`      (rupiah tampil bulat)
 *
 * Pembulatan itu sah untuk NOMINAL — 51 halaman lain sudah memakai konvensi
 * yang sama. Ia TIDAK sah untuk kuantitas: `estimate_items.quantity` bertipe
 * `numeric(_,4)`, jadi 0,25 m³ akan tampil "0" kalau dibulatkan. Karena itu
 * kuantitas di halaman ini memakai `formatVolume`/`formatAngka` dengan desimal
 * eksplisit, bukan `formatRupiah` atau `formatAngka(n)` tanpa argumen.
 */
import {
  formatRupiah,
  formatAngka,
  formatKuantitas,
  formatTanggalJam,
} from "@/lib/format";

const fmtRp = formatRupiah;

// ── Types (bentuk respons API CECEP) ──────────────────────────────────────────
interface Project { id: string; name: string }
interface Edition {
  id: string; code: string; name: string; publish_date: string | null;
  source_sha256: string | null; is_active: boolean;
  /** Jumlah analisa AKTIF di edisi ini. 0 = terdaftar tapi isinya belum diimpor. */
  jumlah_analisa?: number;
}
interface VersionSummary { id: string; version_number: number; status: string; total_amount: number }
interface Scenario { id: string; name: string; purpose: string | null; status: string; versions: VersionSummary[] }
interface CostCodeRingkas { id: string; code: string; name: string; status: string }
interface CostMapBaris {
  category_id: string; category_name: string; type: string | null;
  cost_code: CostCodeRingkas | null;
}
interface CostMapResponse { data: CostMapBaris[]; belum_dipetakan: number }

/**
 * Usulan pemetaan dari `GET /projects/:id/cost-map/saran`.
 *
 * `skor` 0..1 dibawa ke layar dengan sengaja: pemetaan ini menentukan ke cost
 * code mana biaya jatuh, dan yang menyetujuinya berhak tahu seberapa yakin
 * mesinnya. Usul berskor 0,46 dan 0,93 tak boleh terlihat sama.
 */
interface SaranBaris {
  category_id: string; category_name: string
  cost_code_id: string; cost_code_code: string; cost_code_name: string
  skor: number
}
/**
 * Belanja aktual yang SESUNGGUHNYA — disatukan dari empat tabel.
 *
 * Diukur 2026-08-08: laporan biaya selama ini membaca `project_expenses`
 * yang NOL BARIS, sementara Rp 243 juta upah dan Rp 50 juta faktur supplier
 * tercatat di tabelnya masing-masing. Kartu "Belanja aktual Rp 0" bukan
 * berarti belum ada belanja — ia melihat ke tabel yang salah.
 */
interface BelanjaAktual {
  total: number;
  komitmen: number;
  exposure: number;
  /** Sudah pasti jadi biaya, belum disetujui. Tak masuk total. */
  menunggu: number;
  per_sumber: { upah: number; faktur: number; belanja: number; po: number };
  jumlah_baris: { upah: number; faktur: number; belanja: number; po: number };
  tak_dikenal: number;
  nilai_cacat: number;
}

interface SaranResponse {
  saran: SaranBaris[]
  jumlah_kategori: number
  sudah_dipetakan: number
  tanpa_saran: number
}
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
  useTutupEsc(onClose);
  return createPortal(
    <div style={{ position: "fixed", inset: 0, background: "rgba(17,24,39,.45)", zIndex: 60, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }} onClick={onClose}>
      <div style={{ background: C.surface, borderRadius: 14, width: "100%", maxWidth: 520, maxHeight: "88vh", overflow: "auto", boxShadow: "var(--naik-3)" }} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 16px", borderBottom: `1px solid ${C.border}` }}>
          <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: C.text }}>{title}</h3>
          <button aria-label="Tutup" onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: C.muted }}><X size={18} /></button>
        </div>
        <div style={{ padding: "var(--pad-kartu-lega)" }}>{children}</div>
      </div>
    </div>, document.body);
}
const label = (t: string) => <label style={{ display: "block", fontSize: 11, fontWeight: 600, color: C.mid, margin: "10px 0 4px" }}>{t}</label>;
function StatusBadge({ s }: { s: string }) {
  const map: Record<string, [string, string]> = {
    draft: [C.mid, C.bg], under_review: [C.yellow, C.yellowBg], approved: [C.green, C.greenBg],
    frozen: [C.navy, C.bg], superseded: [C.muted, C.bg],
    verified: [C.yellow, C.yellowBg], active: [C.green, C.greenBg], expired: [C.muted, C.bg],
    locked: [C.navy, C.bg],
  };
  const [fg, bg] = map[s] ?? [C.mid, C.bg];
  return <span style={{ fontSize: 11, fontWeight: 700, color: fg, background: bg, border: `1px solid ${C.border}`, borderRadius: 999, padding: "2px 8px" }}>{s}</span>;
}
const th: React.CSSProperties = { textAlign: "left", padding: "8px 8px", fontSize: 11, fontWeight: 700, color: C.muted, textTransform: "uppercase", letterSpacing: .4, borderBottom: `1px solid ${C.border}` };
const td: React.CSSProperties = { padding: "8px 8px", fontSize: 13, color: C.text, borderBottom: `1px solid ${C.border}`, verticalAlign: "top" };
const btnPrimary: React.CSSProperties = { display: "inline-flex", alignItems: "center", gap: 6, background: C.navy, color: C.onNavy, border: "none", borderRadius: 6, padding: "8px 12px", fontSize: 13, fontWeight: 600, cursor: "pointer" };
const btnGhost: React.CSSProperties = { display: "inline-flex", alignItems: "center", gap: 6, background: C.surface, color: C.text, border: `1px solid ${C.border}`, borderRadius: 6, padding: "6px 12px", fontSize: 12, fontWeight: 600, cursor: "pointer" };
const lbl: React.CSSProperties = { display: "block", fontSize: 12, fontWeight: 600, color: C.text, marginBottom: 5 };
// Baris penutup lembar analisa: label rata kanan menempel ke angkanya, supaya
// mata membaca "Jumlah ..... Rp X" sebagai satu baris, bukan dua kolom terpisah.
const tfLabel: React.CSSProperties = { padding: "6px 8px", fontSize: 12, color: C.mid, textAlign: "right" };
const tfAngka: React.CSSProperties = { padding: "6px 8px", fontSize: 12, color: C.text, textAlign: "right", fontFamily: "monospace" };

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
  const [terapkan, setTerapkan] = useState<VersionDetail | null>(null);
  const [explainId, setExplainId] = useState<string | null>(null);
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
      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginBottom: 14 }}>
        <select className="isian-fokus" aria-label="Proyek" value={projectId} onChange={e => setProjectId(e.target.value)} style={{ ...GAYA_ISIAN, width: 280 }}>
          <option value="">— Pilih proyek —</option>
          {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        {projectId && (
          <button style={btnPrimary} onClick={() => setShowNewScenario(true)}><Plus size={15} /> Skenario Baru</button>
        )}
      </div>
      {err && <div style={{ background: C.redBg, color: C.red, border: `1px solid ${C.border}`, borderRadius: 6, padding: "8px 12px", fontSize: 12, marginBottom: 10 }}>{err}</div>}

      {/* Panduan sebelum proyek dipilih. Tanpa ini layar benar-benar kosong dan
          tak ada petunjuk harus mulai dari mana — halaman ini punya 4 langkah
          berjenjang, dan tak satu pun terlihat sampai langkah pertama diambil. */}
      {!projectId && <PanduanKomposer jumlahProyek={projects.length} />}

      {projectId && scenarios.length === 0 && (
        <p style={{ color: C.muted, fontSize: 13 }}>Belum ada skenario estimasi di proyek ini — buat satu untuk mulai menyusun RAB.</p>
      )}

      <div style={{ display: "grid", gap: 12 }}>
        {scenarios.map(sc => (
          <div key={sc.id} style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10, padding: "var(--pad-kartu)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
              <div>
                <strong style={{ fontSize: 13, color: C.text }}>{sc.name}</strong>
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
              {sc.versions.length === 0 && <span style={{ fontSize: 12, color: C.muted }}>belum ada versi</span>}
            </div>
          </div>
        ))}
      </div>

      {openVersion && (
        <div style={{ marginTop: "var(--gap-bagian)", background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10, padding: "var(--pad-kartu-lega)" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <Layers size={16} color={C.navy} />
              <strong style={{ fontSize: 15 }}>Versi {openVersion.version_number}</strong>
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
              {/* Jembatan Komposer -> RAB proyek. Sebelum ini, RAB yang disusun
                  di sini tak berpengaruh apa pun pada Kurva S, EVM, dan progress
                  fisik — ketiganya membaca `rab_items`, tabel yang berbeda. */}
              <button style={btnGhost} disabled={busy || openVersion.items.length === 0}
                onClick={() => setTerapkan(openVersion)}>
                <ClipboardList size={14} /> Terapkan ke RAB Proyek
              </button>
            </div>
          </div>

          {/* Dipindahkan ke <Tabel> 2026-08-07 (UI-0-4). Komponen menjamin caption
              sr-only, kolom pertama <th scope="row">, tabular-nums, dan pembungkus
              overflow-x.

              `kepalaBaris` PINDAH dari Kode ke Pekerjaan, dan kedua kolom ditukar
              urutannya. Kode assembly ("A.4.1.1.7") tak dihafal siapa pun — yang
              menamai baris RAB bagi orang yang membacanya adalah uraian
              pekerjaannya. Preseden yang sama sudah diambil di akuntansi
              (Kode akun → Nama Akun, "kontraktor tak menghafal 1122").

              Baris TOTAL yang dulu ditulis sendiri di <tfoot> kini lewat prop
              `total`; pesan kosong lewat prop `kosong` — sebagai <td colSpan> di
              <tbody> ia dibacakan seolah nama sebuah baris data. */}
          <div style={{ marginTop: 12 }}>
            <Tabel<EstItem>
              caption="Rekapitulasi RAB: uraian pekerjaan, kode, volume, satuan, dan jumlah biaya tiap pos."
              data={openVersion.items}
              kunciBaris={it => it.id}
              kosong={<p style={{ fontSize: 13, color: C.muted, margin: "12px 0" }}>Belum ada item — tambah dari katalog assembly.</p>}
              kolom={[
                { kunci: "nama", judul: "Pekerjaan (assembly)", kepalaBaris: true, render: it => it.assembly?.name ?? it.cost_code?.name },
                { kunci: "kode", judul: "Kode", render: it => (
                  <code style={{ fontFamily: "monospace", fontSize: 12 }}>{it.assembly?.code ?? it.cost_code?.code}</code>
                ) },
                { kunci: "vol", judul: "Vol", rata: "kanan", render: it => formatKuantitas(it.quantity) },
                { kunci: "sat", judul: "Sat", render: it => it.assembly?.output_unit_code },
                { kunci: "jumlah", judul: "Jumlah", rata: "kanan", render: it => (
                  <span style={{ fontWeight: 600 }}>{fmtRp(Number(it.amount))}</span>
                ) },
                { kunci: "aksi", judul: "", lebar: 60, render: it => (
                  <>
                    {/* Explainability (#19) — tiap baris harus bisa menjawab
                        "kenapa angkanya segini?". Tanpa ini, angka RAB hanya
                        bisa dipertahankan dengan "keluaran sistem". */}
                    <button aria-label={`Jelaskan perhitungan ${it.assembly?.name ?? "item"}`}
                      title="Jelaskan perhitungan"
                      onClick={() => setExplainId(it.id)}
                      style={{ background: "none", border: "none", cursor: "pointer", color: C.mid, padding: 2, marginRight: 2 }}>
                      <HelpCircle size={14} />
                    </button>
                    {openVersion.status === "draft" && (
                      <button aria-label="Hapus item" title="Hapus item" style={{ background: "none", border: "none", cursor: "pointer", color: C.red }}
                        onClick={async () => {
                          try { await api.delete(`/api/v1/estimate-versions/${openVersion.id}/items/${it.id}`); await refreshDetail(); }
                          catch (e) { setErr((e as { response?: { data?: { error?: string } } }).response?.data?.error ?? "Gagal hapus"); }
                        }}><Trash2 size={14} /></button>
                    )}
                  </>
                ) },
              ]}
              total={[
                { kunci: "label", isi: "TOTAL", rentang: 4 },
                { kunci: "jumlah", isi: <span style={{ color: C.navy }}>{fmtRp(Number(openVersion.total_amount))}</span>, rata: "kanan" },
                { kunci: "aksi", isi: "" },
              ]}
            />
          </div>

          {rollup && (
            <div style={{ marginTop: 16, borderTop: `1px solid ${C.border}`, paddingTop: 14 }}>
              <h4 style={{ margin: "0 0 8px", fontSize: 13, fontWeight: 700, color: C.mid, textTransform: "uppercase", letterSpacing: .4 }}>
                Rekapitulasi per Kategori
              </h4>
              {/* TIDAK dipindahkan ke <Tabel> (diperiksa 2026-08-07, UI-0-4) —
                  dan sebaiknya jangan dicoba lagi dengan cara yang sama.

                  Ini bukan tabel data: ia tak punya <thead> sama sekali, dan tiap
                  barisnya pasangan label→nilai dengan struktur yang BERBEDA-BEDA
                  (subtotal per kategori, lalu TOTAL BIAYA, lalu PPN yang labelnya
                  memuat tarif & tanggal berlaku, lalu GRAND TOTAL). `Tabel` butuh
                  satu bentuk baris yang seragam plus judul kolom; memaksanya ke
                  sini berarti mengarang dua judul kolom yang tak pernah ada
                  ("Uraian", "Jumlah") dan menyatukan empat jenis baris yang
                  memang tidak setara.

                  Yang benar untuk struktur seperti ini adalah daftar definisi
                  (dl/dt/dd), bukan tabel mana pun — tapi itu perubahan semantik
                  tersendiri, di luar cakupan UI-0-4. Dibiarkan apa adanya,
                  caption-nya sudah ada.

                  (Nama tag sengaja dieja, bukan ditulis sebagai tag: penjaga
                  tabel-mentah memindai teks berkas dan menghitung tag di dalam
                  komentar sebagai tabel sungguhan.) */}
              <table style={{ width: "100%", borderCollapse: "collapse", maxWidth: 520, fontVariantNumeric: "tabular-nums" }}>
                <caption className="sr-only">Rekapitulasi total biaya proyek beserta komponen pembentuknya.</caption>
                <tbody>
                  {rollup.groups.map(g => (
                    <tr key={g.name}>
                      <td style={{ ...td, borderBottom: "none", padding: "4px 8px" }}>{g.name}</td>
                      <td style={{ ...td, borderBottom: "none", padding: "4px 8px", textAlign: "right" }}>{fmtRp(g.subtotal)}</td>
                    </tr>
                  ))}
                  <tr><td style={{ ...td, padding: "6px 8px", fontWeight: 600 }}>TOTAL BIAYA</td>
                      <td style={{ ...td, padding: "6px 8px", textAlign: "right", fontWeight: 600 }}>{fmtRp(rollup.totalBiaya)}</td></tr>
                  <tr><td style={{ ...td, borderBottom: "none", padding: "4px 8px" }}>
                        PPN ({(rollup.ppn_rate * 100).toFixed(0)}%, berlaku {rollup.at_date})
                      </td>
                      <td style={{ ...td, borderBottom: "none", padding: "4px 8px", textAlign: "right" }}>{fmtRp(rollup.ppn)}</td></tr>
                  <tr><td style={{ ...td, borderBottom: "none", padding: "6px 8px", fontWeight: 800, color: C.navy }}>GRAND TOTAL</td>
                      <td style={{ ...td, borderBottom: "none", padding: "6px 8px", textAlign: "right", fontWeight: 800, color: C.navy }}>{fmtRp(rollup.grandTotal)}</td></tr>
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
      {terapkan && (
        <TerapkanKeRabModal version={terapkan} onClose={() => setTerapkan(null)} />
      )}
      {explainId && <JelaskanModal itemId={explainId} onClose={() => setExplainId(null)} />}
    </div>
  );
}

// ── Terapkan versi estimasi → RAB proyek ────────────────────────────────────
//
// Operasi ini MENIMPA seluruh RAB proyek. Karena itu ia tak pernah berjalan
// dalam sekali klik: percobaan pertama dikirim tanpa konfirmasi, server menjawab
// 409 beserta angka "berapa yang akan dihapus", dan angka itulah yang
// ditunjukkan sebelum meminta persetujuan. Pemakai menyetujui sesuatu yang
// spesifik, bukan peringatan umum.
/**
 * JELASKAN — merangkai jejak satu baris RAB jadi penjelasan yang bisa DIBACAKAN.
 *
 * Constraint TERTINGGI CECEP (#19): angka RAB dibawa ke hadapan klien &
 * pemeriksa. Kalau ditanya "kenapa segini?" dan jawabannya "keluaran sistem",
 * angkanya tak bisa dipertahankan.
 *
 * Peringatan ditampilkan MENONJOL, bukan disembunyikan di bawah: penjelasan
 * yang tampak lengkap padahal bolong lebih berbahaya daripada tak ada
 * penjelasan sama sekali.
 */
function JelaskanModal({ itemId, onClose }: { itemId: string; onClose: () => void }) {
  useTutupEsc(onClose);
  const [data, setData] = useState<{
    nama: string; satuan: string | null; volume: number | null; utuh: boolean;
    langkah: { no: number; judul: string; uraian: string; nilai?: number }[];
    komponen: { kode: string; koefisien: number; hargaSatuan: number; subtotal: number;
      sumber: string; tanggalHarga: string | null; alasanOverride: string | null }[];
    peringatan: string[];
  } | null>(null);
  const [memuat, setMemuat] = useState(true);
  const [galat, setGalat] = useState<string | null>(null);

  useEffect(() => {
    api.get<{ data: NonNullable<typeof data> }>(`/api/v1/estimate-items/${itemId}/explain`)
      .then(r => setData(r.data.data))
      .catch(() => setGalat("Gagal memuat penjelasan"))
      .finally(() => setMemuat(false));
  }, [itemId]);

  return createPortal(
    // Latar gelap dibuat <button> SUNGGUHAN, bukan div ber-onClick. Div yang
    // hanya bisa diklik tak terjangkau keyboard sama sekali — pola yang sudah
    // menyumbang 232 pelanggaran WCAG di repo ini. Sebagai <button> ia
    // otomatis dapat fokus, Enter/Space, dan nama aksesibel.
    <div
      role="dialog" aria-modal="true" aria-label="Penjelasan perhitungan item"
      style={{
        position: "fixed", inset: 0, background: "rgba(0,0,0,.45)", zIndex: 1000,
        display: "flex", alignItems: "flex-start", justifyContent: "center", padding: "40px 16px", overflowY: "auto",
      }}>
      <button
        aria-label="Tutup penjelasan"
        onClick={onClose}
        style={{
          position: "fixed", inset: 0, background: "transparent",
          border: "none", cursor: "default", padding: 0,
        }}
      />
      <div style={{ position: "relative", width: "100%", maxWidth: 720 }}>
      <div style={{
        background: "var(--surface)", borderRadius: 14, width: "100%",
        boxShadow: "var(--naik-3)", overflow: "hidden",
      }}>
        <div style={{ padding: "16px 20px", borderBottom: `1px solid ${C.border}` }}>
          <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: C.text }}>Kenapa angkanya segini?</h3>
          {data && <p style={{ margin: "4px 0 0", fontSize: 12, color: C.mid }}>{data.nama}</p>}
        </div>

        <div style={{ padding: "var(--pad-kartu-lega)" }}>
          {memuat && <div style={{ color: C.mid, fontSize: 13 }}>Memuat penjelasan…</div>}
          {galat && <div style={{ color: C.red, fontSize: 13 }}>{galat}</div>}

          {data && data.peringatan.length > 0 && (
            <div style={{
              padding: "12px var(--pad-kartu-lega)", borderRadius: 10, marginBottom: 16,
              background: "var(--warning-bg)", border: `1px solid var(--warning-border)`,
              fontSize: 12, color: "var(--warning)",
            }}>
              <strong>Penjelasan ini belum utuh:</strong>
              <ul style={{ margin: "6px 0 0", paddingLeft: 18 }}>
                {data.peringatan.map((p, i) => <li key={i} style={{ marginBottom: 3 }}>{p}</li>)}
              </ul>
            </div>
          )}

          {data && data.langkah.length > 0 && (
            <ol style={{ margin: 0, paddingLeft: 0, listStyle: "none" }}>
              {data.langkah.map(l => (
                <li key={l.no} style={{ display: "flex", gap: 12, marginBottom: 14 }}>
                  <span style={{
                    flexShrink: 0, width: 24, height: 24, borderRadius: "50%",
                    background: "var(--navy-light)", color: C.navy, fontSize: 12, fontWeight: 700,
                    display: "flex", alignItems: "center", justifyContent: "center",
                  }}>{l.no}</span>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: C.text }}>{l.judul}</div>
                    <div style={{ fontSize: 12, color: C.mid, marginTop: 2 }}>{l.uraian}</div>
                  </div>
                </li>
              ))}
            </ol>
          )}

          {data && data.komponen.length > 0 && (
            <div style={{ marginTop: 18 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: C.mid, textTransform: "uppercase", letterSpacing: ".05em", marginBottom: 8 }}>
                Rincian komponen
              </div>
              {/* Dipindahkan ke <Tabel> 2026-08-07 (UI-0-4) — caption sr-only,
                  scope="row", tabular-nums, dan overflow-x dijamin komponen.

                  `kepalaBaris` di Kode: di modal "kenapa angkanya segini?" inilah
                  satu-satunya kolom yang mengidentifikasi komponennya. Koefisien
                  dan subtotal justru angka yang sedang dipertanyakan — dipakai
                  sebagai nama baris, penjelasannya jadi melingkar. */}
              <div style={{ border: `1px solid ${C.border}`, borderRadius: 10, overflow: "hidden" }}>
                <Tabel<NonNullable<typeof data>["komponen"][number]>
                  caption="Rincian analisa harga satuan pos ini: kode resource, koefisien, harga satuan, subtotal, dan sumber harganya."
                  data={data.komponen}
                  kunciBaris={k => k.kode}
                  kolom={[
                    { kunci: "kode", judul: "Kode", kepalaBaris: true, render: k => (
                      <code style={{ fontFamily: "ui-monospace, monospace" }}>{k.kode}</code>
                    ) },
                    { kunci: "koef", judul: "Koef.", rata: "kanan", render: k => k.koefisien },
                    { kunci: "harga", judul: "Harga satuan", rata: "kanan", render: k => fmtRp(k.hargaSatuan) },
                    { kunci: "subtotal", judul: "Subtotal", rata: "kanan", render: k => (
                      <span style={{ fontWeight: 600 }}>{fmtRp(k.subtotal)}</span>
                    ) },
                    { kunci: "sumber", judul: "Sumber", render: k => (
                      <span style={{ color: C.mid }}>{k.sumber}{k.tanggalHarga ? ` · ${k.tanggalHarga}` : ""}</span>
                    ) },
                  ]}
                />
              </div>
            </div>
          )}
        </div>

        <div style={{ padding: "12px 20px", borderTop: `1px solid ${C.border}`, textAlign: "right" }}>
          <button onClick={onClose} style={{
            padding: "8px 16px", borderRadius: 6, border: `1px solid ${C.border}`,
            background: "var(--surface)", color: C.text, fontSize: 13, cursor: "pointer",
          }}>Tutup</button>
        </div>
      </div>
      </div>
    </div>,
    document.body,
  );
}

function TerapkanKeRabModal({ version, onClose }: { version: VersionDetail; onClose: () => void }) {
  const [tahap, setTahap] = useState<"siap" | "konfirmasi" | "selesai">("siap");
  const [dampak, setDampak] = useState<{ akan_dihapus: number; akan_dibuat: number } | null>(null);
  const [hasil, setHasil] = useState<{ dihapus: number; dibuat: number; total: number; project_id: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  async function jalankan(konfirmasi: boolean) {
    setBusy(true); setErr("");
    try {
      const r = await api.post<{ dihapus: number; dibuat: number; total: number; project_id: string }>(
        `/api/v1/estimate-versions/${version.id}/terapkan-ke-rab`,
        konfirmasi ? { konfirmasi_timpa: true } : {});
      setHasil(r.data); setTahap("selesai");
    } catch (e) {
      const res = (e as { response?: { status?: number; data?: {
        error?: string; kode?: string; akan_dihapus?: number; akan_dibuat?: number } } }).response;
      if (res?.status === 409 && res.data?.kode === "RAB_SUDAH_ADA") {
        setDampak({ akan_dihapus: res.data.akan_dihapus ?? 0, akan_dibuat: res.data.akan_dibuat ?? 0 });
        setTahap("konfirmasi");
      } else {
        setErr(res?.data?.error ?? "Gagal menerapkan ke RAB proyek");
      }
    } finally { setBusy(false); }
  }

  return (
    <Modal title={`Terapkan Versi ${version.version_number} ke RAB Proyek`} onClose={onClose}>
      {err && <p style={{ color: C.red, fontSize: 12, margin: "0 0 10px" }}>{err}</p>}

      {tahap === "siap" && (
        <>
          <p style={{ fontSize: 13, color: C.text, lineHeight: 1.6, margin: "0 0 12px" }}>
            {version.items.length} item akan disalin menjadi RAB proyek. Setelah itu,
            <b> Kurva S, EVM, dan progress fisik</b> akan memakai angka dari versi ini —
            ketiganya membaca RAB proyek, bukan estimasi.
          </p>
          <p style={{ fontSize: 12, color: C.muted, lineHeight: 1.55, margin: "0 0 16px" }}>
            Bobot tiap item dihitung dari proporsi nilainya, dan totalnya persis 100%.
            Unggah RAB Excel di halaman Proyek tetap bisa dipakai kapan saja — keduanya
            menulis ke tempat yang sama.
          </p>
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
            <button style={btnGhost} onClick={onClose}>Batal</button>
            <button style={btnPrimary} disabled={busy} onClick={() => void jalankan(false)}>
              {busy ? "Memeriksa…" : "Terapkan"}
            </button>
          </div>
        </>
      )}

      {tahap === "konfirmasi" && dampak && (
        <>
          <div style={{ padding: "12px var(--pad-kartu-lega)", background: C.yellowBg, borderRadius: 6, marginBottom: 14 }}>
            <p style={{ margin: 0, fontSize: 13, color: C.text, lineHeight: 1.6 }}>
              RAB proyek ini sudah berisi <b>{dampak.akan_dihapus} baris</b>.
              Menerapkan versi ini akan <b>menghapus semuanya</b> dan menggantinya dengan{" "}
              <b>{dampak.akan_dibuat} baris</b> dari estimasi.
            </p>
          </div>
          <p style={{ fontSize: 12, color: C.muted, lineHeight: 1.55, margin: "0 0 16px" }}>
            Progress fisik yang sudah tercatat pada baris lama ikut hilang, karena
            barisnya diganti. Pastikan ini memang yang Anda maksud.
          </p>
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
            <button style={btnGhost} onClick={onClose}>Batal</button>
            <button style={{ ...btnPrimary, background: C.red, borderColor: C.red }}
              disabled={busy} onClick={() => void jalankan(true)}>
              {busy ? "Menerapkan…" : `Ganti ${dampak.akan_dihapus} baris`}
            </button>
          </div>
        </>
      )}

      {tahap === "selesai" && hasil && (
        <>
          <p style={{ fontSize: 13, color: C.text, lineHeight: 1.6, margin: "0 0 12px" }}>
            <b>{hasil.dibuat} baris</b> RAB dibuat
            {hasil.dihapus > 0 && <> (menggantikan {hasil.dihapus} baris lama)</>}, total{" "}
            <b>{fmtRp(hasil.total)}</b>.
          </p>
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
            <a href={`/proyek/${hasil.project_id}`} style={{ ...btnPrimary, textDecoration: "none" }}>
              Buka RAB proyek
            </a>
            <button style={btnGhost} onClick={onClose}>Tutup</button>
          </div>
        </>
      )}
    </Modal>
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
      <input className="isian-fokus" style={GAYA_ISIAN} value={name} onChange={e => setName(e.target.value)} placeholder="mis. Penawaran tender" />
      {label("Tujuan (opsional)")}
      <input className="isian-fokus" style={GAYA_ISIAN} value={purpose} onChange={e => setPurpose(e.target.value)} placeholder="tender / rap / studi" />
      {label("Edisi AHSP nasional untuk versi pertama (opsional)")}
      {/* Edisi yang belum diimpor isinya DITANDAI, bukan disembunyikan.
          Registry memuat SE-68-2024 & SNI-2013 dengan nol analisa; memilihnya
          menghasilkan katalog kosong tanpa sebab yang terlihat. Menyembunyikan
          juga salah — keduanya memang direncanakan ada, dan menghilangkannya
          membuat pemakai mengira sistem hanya mendukung satu edisi. */}
      <select className="isian-fokus" aria-label="Pilih edisi AHSP" style={GAYA_ISIAN} value={editionCode} onChange={e => setEditionCode(e.target.value)}>
        <option value="">— tanpa edisi (custom) —</option>
        {editions.filter(e => e.is_active).map(e => (
          <option key={e.id} value={e.code} disabled={(e.jumlah_analisa ?? 0) === 0}>
            {e.code} — {e.name}
            {(e.jumlah_analisa ?? 0) === 0
              ? "  (belum ada analisa)"
              : `  (${formatAngka(e.jumlah_analisa!)} analisa)`}
          </option>
        ))}
      </select>
      {/* Kebingungan yang wajar: "analisa perusahaan itu edisi yang mana?"
          Jawabannya BUKAN salah satu — analisa perusahaan tak menempel ke edisi
          mana pun (edition_id NULL), karena edisi adalah terbitan resmi
          pemerintah sementara analisa perusahaan susunan sendiri. Dinyatakan di
          sini supaya tak perlu ditebak dari perilaku. */}
      <p style={{ fontSize: 11, color: C.muted, margin: "6px 0 0", lineHeight: 1.55 }}>
        Pilihan ini hanya menentukan <b>analisa nasional</b> mana yang dipakai.
        {" "}<b>Analisa perusahaan Anda selalu ikut tersedia</b> — ia tidak terikat
        edisi mana pun, termasuk bila Anda memilih “tanpa edisi”.
        {editions.some(e => e.is_active && (e.jumlah_analisa ?? 0) === 0) && (
          <>
            {" "}Edisi bertanda “belum ada analisa” terdaftar di registry tapi isinya
            belum diimpor, jadi belum bisa dipilih.
          </>
        )}
      </p>
      {err && <p style={{ color: C.red, fontSize: 12 }}>{err}</p>}
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
  //
  // ── Kosong, BUKAN "10" (G6, migrasi 301)
  //
  // Sampai 2026-08-12 baris ini berbunyi `useState("10")`, dan komentar di
  // atasnya sudah menyatakan niat yang benar sementara kodenya melakukan
  // kebalikannya: sepuluh persen menjadi angka bawaan tanpa seorang pun
  // memutuskannya. API bahkan MENOLAK default dengan tegas
  // (`ahsp.ts:411`: "tidak ada default") — penjaga itu dibatalkan diam-diam
  // oleh satu nilai awal di sini.
  //
  // Sekarang: kosong, lalu diisi dari markup perusahaan yang BERLAKU. Kalau
  // belum ditetapkan, kolomnya tetap kosong dan layar mengatakannya —
  // estimator memilih sadar, bukan mewarisi tebakan.
  const [bukPct, setBukPct] = useState("");
  const [markupBelumAda, setMarkupBelumAda] = useState(false);
  const [markupUmum, setMarkupUmum] = useState(false);
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
    // limit 5.000, bukan 200: dropdown yang memotong di 200 dari 2.620 analisa
    // edisi berarti pekerjaan yang dicari sering tak ada di daftar, tanpa
    // penjelasan apa pun. Katalog ini data referensi — dimuat utuh sekali.
    const edisi = version.edition
      ? api.get<{ data: Assembly[] }>(`/api/v1/cecep/assemblies?edition=${encodeURIComponent(version.edition.code)}&limit=5000`)
      : api.get<{ data: Assembly[] }>(`/api/v1/cecep/assemblies?source=national&limit=5000`);
    const company = api.get<{ data: Assembly[] }>(`/api/v1/cecep/assemblies?source=company&limit=5000`);

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

    // Markup perusahaan yang BERLAKU (G6). Kalau belum ditetapkan, kolom BUK
    // dibiarkan kosong dan spanduk muncul — tak diisi angka aman.
    api.get<{ markup: { buk: number; dari_umum: boolean } | null }>(
      "/api/v1/markup/berlaku")
      .then(r => {
        if (batal) return;
        const m = r.data.markup;
        setMarkupBelumAda(!m);
        setMarkupUmum(!!m?.dari_umum);
        // Dibulatkan 2 desimal persen: 0.0825 → "8.25". Tanpa pembulatan,
        // galat titik-mengambang menampilkan "8.250000000000001".
        if (m) setBukPct(String(Math.round(m.buk * 10000) / 100));
      })
      .catch(() => { if (!batal) setMarkupBelumAda(true); });

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
          <span id="lbl-assembly">
            {label(`Assembly / AHSP ${version.edition ? `(edisi ${version.edition.code} + analisa perusahaan)` : "(nasional + analisa perusahaan)"}`)}
          </span>
          {/* Dropdown BISA DICARI: daftarnya memuat 3.040 analisa, dan `<select>`
              asli hanya bisa diloncati dengan huruf awal. Orang yang tahu
              barangnya tapi tak hafal urutan katalog praktis tak bisa memakainya.
              Dikelompokkan supaya jelas mana milik perusahaan sendiri dan mana
              turunan edisi nasional — asalnya menentukan siapa yang bertanggung
              jawab atas koefisiennya. */}
          <PilihCari
            labelId="lbl-assembly"
            value={assemblyId}
            onChange={setAssemblyId}
            placeholder="— cari pekerjaan (ketik nama atau kode) —"
            kosong="Tidak ada analisa yang cocok. Coba kata kunci lain, atau buat analisa baru."
            opsi={[
              ...assemblies.filter(a => a.source === "company").map(a => ({
                value: a.id, label: a.name,
                keterangan: `${a.code} · per ${a.output_unit_code}`,
                grup: "Analisa Perusahaan",
              })),
              ...assemblies.filter(a => a.source !== "company").map(a => ({
                value: a.id, label: a.name,
                keterangan: `${a.code} · per ${a.output_unit_code}`,
                grup: version.edition ? `Edisi ${version.edition.code}` : "Analisa Nasional",
              })),
            ]}
          />
          <p style={{ fontSize: 11, color: C.muted, margin: "6px 0 0" }}>
            Tidak ketemu? Coba tab &quot;Buat Analisa Baru&quot; atau &quot;Harga Langsung&quot; (untuk pekerjaan bukan-beranalisa: lift, pompa, septictank, dll).
          </p>
        </>
      )}

      {mode === "custom" && (
        <>
          <p style={{ fontSize: 11, color: C.muted, margin: "0 0 8px" }}>
            Analisa baru khusus proyek ini — tidak masuk katalog nasional/company lama.
          </p>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 2fr", gap: 8 }}>
            <div>{label("Kode")}<input className="isian-fokus" style={GAYA_ISIAN} value={customCode} onChange={e => setCustomCode(e.target.value)} placeholder="mis. CUSTOM-01" /></div>
            <div>{label("Nama pekerjaan")}<input className="isian-fokus" style={GAYA_ISIAN} value={customName} onChange={e => setCustomName(e.target.value)} /></div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 8 }}>
            <div>{label("Kategori (cost code)")}
              <select className="isian-fokus" aria-label="Kode biaya item custom" style={GAYA_ISIAN} value={customCostCodeId} onChange={e => setCustomCostCodeId(e.target.value)}>
                <option value="">— pilih —</option>
                {costCodes.map(c => <option key={c.id} value={c.id}>{c.code} — {c.name}</option>)}
              </select></div>
            <div>{label("Satuan output")}<input className="isian-fokus" style={GAYA_ISIAN} value={customUnit} onChange={e => setCustomUnit(e.target.value)} placeholder="mis. m2, kg, unit" /></div>
          </div>
          {label("Komponen (resource code + koefisien)")}
          {customComps.map((c, i) => (
            <div key={i} style={{ display: "flex", gap: 6, marginBottom: 6 }}>
              <input className="isian-fokus" style={{ ...GAYA_ISIAN, flex: 2 }} value={c.resource_code} placeholder="kode resource"
                onChange={e => setCustomComps(cs => cs.map((x, xi) => xi === i ? { ...x, resource_code: e.target.value } : x))} />
              <input className="isian-fokus" style={{ ...GAYA_ISIAN, flex: 1 }} type="number" step="any" value={c.coefficient} placeholder="koefisien"
                onChange={e => setCustomComps(cs => cs.map((x, xi) => xi === i ? { ...x, coefficient: e.target.value } : x))} />
              {customComps.length > 1 && (
                <button aria-label="Hapus komponen" style={{ background: "none", border: "none", cursor: "pointer", color: C.red }}
                  onClick={() => setCustomComps(cs => cs.filter((_, xi) => xi !== i))}><X size={16} /></button>
              )}
            </div>
          ))}
          <button style={{ ...btnGhost, marginBottom: 10 }} onClick={() => setCustomComps(cs => [...cs, { resource_code: "", coefficient: "" }])}>
            <Plus size={13} /> Tambah komponen
          </button>
          {label("Volume")}
          <input className="isian-fokus" style={GAYA_ISIAN} type="number" min="0" step="any" value={qty} onChange={e => setQty(e.target.value)} />
        </>
      )}

      {(mode === "katalog" || mode === "custom") && (
        <>
          {mode === "katalog" && (
            <>{label("Volume")}
              <input className="isian-fokus" style={GAYA_ISIAN} type="number" min="0" step="any" value={qty} onChange={e => setQty(e.target.value)} placeholder="mis. 518.4" /></>
          )}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            <div>{label("Tanggal harga (price book)")}
              <input className="isian-fokus" aria-label="Tanggal" style={GAYA_ISIAN} type="date" value={priceDate} onChange={e => setPriceDate(e.target.value)} /></div>
            <div>{label("Lokasi harga (opsional)")}
              <input className="isian-fokus" style={GAYA_ISIAN} value={location} onChange={e => setLocation(e.target.value)} placeholder="mis. Bandung" /></div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
            <div>{label("BUK %")}
              <input className="isian-fokus" style={GAYA_ISIAN} type="number" min="0" max="100" step="any"
                value={bukPct} onChange={e => setBukPct(e.target.value)}
                aria-describedby="buk-asal" />
              {/* Dari mana angkanya. Kolom terisi tanpa keterangan tak bisa
                  dibedakan dari kolom yang diketik sendiri — dan itu justru
                  keadaan yang G6 perbaiki. */}
              <span id="buk-asal" style={{
                display: "block", fontSize: 11, marginTop: 3, lineHeight: 1.45,
                color: markupBelumAda ? "var(--danger)" : "var(--text-muted)",
              }}>
                {markupBelumAda
                  ? "Markup perusahaan belum ditetapkan — isi sendiri, atau tetapkan di Pengaturan → Markup & Margin."
                  : markupUmum
                    ? "Dari markup umum perusahaan (bukan khusus jenis pekerjaan ini)."
                    : "Dari markup perusahaan yang berlaku."}
              </span></div>
            <div>{label("Pembulatan")}
              <select className="isian-fokus" aria-label="Metode pembulatan" style={GAYA_ISIAN} value={roundMode} onChange={e => setRoundMode(e.target.value as typeof roundMode)}>
                <option value="down">ROUNDDOWN</option><option value="up">ROUNDUP</option>
                <option value="nearest">ROUND</option><option value="none">Tanpa</option>
              </select></div>
            <div>{label("Kelipatan (Rp)")}
              <input className="isian-fokus" style={GAYA_ISIAN} type="number" min="0" value={roundStep} onChange={e => setRoundStep(e.target.value)} /></div>
          </div>
        </>
      )}

      {mode === "lumpsum" && (
        <>
          <p style={{ fontSize: 11, color: C.muted, margin: "0 0 8px" }}>
            Untuk pekerjaan yang bukan analisa AHSP (lift, pompa, septictank, air kerja, dll) — harga langsung, tanpa koefisien.
          </p>
          {label("Kategori (cost code)")}
          <select className="isian-fokus" aria-label="Kode biaya item lump-sum" style={GAYA_ISIAN} value={lumpCostCodeId} onChange={e => setLumpCostCodeId(e.target.value)}>
            <option value="">— pilih —</option>
            {costCodes.map(c => <option key={c.id} value={c.id}>{c.code} — {c.name}</option>)}
          </select>
          {label("Jumlah (Rp)")}
          <input className="isian-fokus" style={GAYA_ISIAN} type="number" min="0" step="any" value={lumpAmount} onChange={e => setLumpAmount(e.target.value)} />
          {label("Catatan (opsional)")}
          <input className="isian-fokus" style={GAYA_ISIAN} value={lumpNotes} onChange={e => setLumpNotes(e.target.value)} placeholder="mis. Sewa lift barang 1 bulan" />
        </>
      )}

      {err && (
        <div style={{ background: C.redBg, borderRadius: 6, padding: "8px 12px", marginTop: 10 }}>
          <p style={{ color: C.red, fontSize: 12, margin: 0 }}>{err}</p>
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
  /**
   * Satu nilai untuk seluruh penyaringan katalog:
   *   ""                → semua
   *   "company"         → analisa perusahaan saja
   *   "national"        → analisa nasional saja
   *   "edition:<kode>"  → satu edisi nasional
   */
  const [saring, setSaring] = useState("");
  const edition = saring.startsWith("edition:") ? saring.slice(8) : "";
  const sumber = saring === "company" || saring === "national" ? saring : "";
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
    // TIDAK memilih edisi secara otomatis. Sebelumnya edisi ber-`source_sha256`
    // dipilih sendiri saat halaman dibuka — akibatnya katalog terbuka dalam
    // keadaan TERSARING ("SE-47-2026 — nasional saja") tanpa pemakai memintanya,
    // dan 423 analisa perusahaan tak terlihat sejak awal. Default: tampilkan
    // semua, biarkan penyaringan jadi tindakan sadar.
    api.get<{ data: Edition[] }>("/api/v1/cecep/editions")
      .then(r => setEditions(r.data.data ?? []))
      .catch(() => {});
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

  // Jumlah per pilihan saringan, supaya dropdown bisa menyebut angkanya sendiri
  // ("Analisa perusahaan saja (423)") alih-alih memaksa pemakai memilih dulu
  // untuk tahu ada isinya atau tidak.
  const [jumlahPerSaring, setJumlahPerSaring] = useState<Record<string, number>>({});
  useEffect(() => {
    let batal = false;
    void Promise.all([
      api.get<{ total: number | null }>("/api/v1/cecep/assemblies?limit=1"),
      api.get<{ total: number | null }>("/api/v1/cecep/assemblies?source=company&limit=1"),
      api.get<{ total: number | null }>("/api/v1/cecep/assemblies?source=national&limit=1"),
    ])
      .then(([s, c, n]) => {
        if (batal) return;
        setJumlahPerSaring({
          semua: s.data.total ?? 0, company: c.data.total ?? 0, national: n.data.total ?? 0,
        });
      })
      .catch(() => {});
    return () => { batal = true; };
  }, []);

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

  // Penyaringan di KLIEN — benar karena seluruh katalog memang ada di memori
  // (dimuat utuh, lalu divirtualisasi saat dirender). Instan, tanpa debounce,
  // tanpa panggilan server per ketikan.
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
        <div role="status" style={{ ...GAYA_KARTU, padding: "8px 12px", marginBottom: 12, display: "flex",
                      alignItems: "center", gap: 8, background: C.greenBg, borderColor: C.green }}>
          <CheckCircle2 size={15} color={C.green} />
          <span style={{ fontSize: 13, color: C.text }}>{pesan}</span>
        </div>
      )}

      <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 14, flexWrap: "wrap" }}>
        <input className="isian-fokus"
          value={cari} onChange={e => setCari(e.target.value)}
          placeholder="Cari nama atau kode analisa…"
          style={{ ...GAYA_ISIAN, flex: 1, minWidth: 220 }}
        />
        {/* SATU dropdown, bukan dua yang saling memengaruhi.
            Sebelumnya "sumber" dan "edisi" terpisah, dan salah satunya bisa
            mematikan yang lain — pemakai harus memahami hubungan keduanya
            sebelum bisa menyaring. Di sini tiap pilihan menyebutkan sendiri apa
            yang akan tampil, beserta jumlahnya. */}
        <select className="isian-fokus" value={saring} onChange={e => setSaring(e.target.value)}
          aria-label="Saring katalog" style={{ ...GAYA_ISIAN, minWidth: 300 }}>
          <option value="">Semua ({formatAngka(jumlahPerSaring.semua ?? 0)})</option>
          <option value="company">
            Analisa perusahaan saja ({formatAngka(jumlahPerSaring.company ?? 0)})
          </option>
          <option value="national">
            Analisa nasional saja ({formatAngka(jumlahPerSaring.national ?? 0)})
          </option>
          {editions.filter(e => (e.jumlah_analisa ?? 0) > 0).map(e => (
            <option key={e.id} value={`edition:${e.code}`}>
              Edisi {e.code} ({formatAngka(e.jumlah_analisa!)})
            </option>
          ))}
          {/* Edisi kosong tetap terlihat supaya jelas ia terdaftar tapi belum
              berisi — menyembunyikannya membuat pemakai mengira sistem hanya
              mendukung satu edisi. */}
          {editions.filter(e => (e.jumlah_analisa ?? 0) === 0).map(e => (
            <option key={e.id} value={`edition:${e.code}`} disabled>
              Edisi {e.code} — belum ada analisa
            </option>
          ))}
        </select>
        {/* Jujur soal pemotongan: label lama menulis "N analisa" seolah itu
            seluruhnya, padahal respons dibatasi 200 dari 3.043. Pemakai yang
            tak menemukan analisanya perlu tahu bahwa daftarnya memang dipotong,
            bukan menyimpulkan analisanya tidak ada. */}
        <span style={{ fontSize: 12, color: terpotong ? C.yellow : C.muted, whiteSpace: "nowrap" }}>
          {terpotong
            ? `${assemblies.length} dari ${formatAngka(total!)} — katalog melebihi batas muat`
            : cari.trim() || hanyaKurang
              ? `${formatAngka(terlihat.length)} dari ${formatAngka(assemblies.length)} analisa`
              : `${formatAngka(terlihat.length)} analisa`}
        </span>
        {jumlahKurang > 0 && (
          <button type="button" onClick={() => setHanyaKurang(v => !v)}
            aria-pressed={hanyaKurang}
            style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "6px 8px",
              fontSize: 12, fontWeight: 600, borderRadius: 6, cursor: "pointer",
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
                style={{ display: "flex", width: "100%", alignItems: "flex-start", gap: 8,
                         padding: "12px var(--pad-kartu-lega)", background: "none", border: "none",
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
                      style={{ display: "inline-flex", alignItems: "center", gap: 2, marginLeft: 8,
                        padding: "0px 6px", borderRadius: 999, background: C.yellowBg,
                        color: C.yellow, fontSize: 11, fontWeight: 700, whiteSpace: "nowrap" }}>
                      <AlertTriangle size={10} aria-hidden="true" />
                      {kurangHarga[a.id]} tanpa harga
                    </span>
                  )}
                  {a.source === "company" && (
                    <span style={{ marginLeft: 6, padding: "0px 6px", borderRadius: 999,
                      background: C.greenBg, color: C.green, fontSize: 11, fontWeight: 700 }}>
                      perusahaan
                    </span>
                  )}
                </span>
                <span style={{ fontSize: 11, color: C.muted, whiteSpace: "nowrap", paddingTop: 1 }}>
                  per {a.output_unit_code}
                </span>
                <span style={{
                  fontSize: 10, fontWeight: 700, borderRadius: 999, padding: "2px 8px",
                  whiteSpace: "nowrap",
                  color: a.source === "national" ? C.mid : C.navy,
                  border: `1px solid ${C.border}`,
                }}>
                  {a.source === "national" ? "NASIONAL" : "PERUSAHAAN"}
                </span>
                {a.status === "draft" && (
                  <span style={{
                    fontSize: 10, fontWeight: 700, borderRadius: 999, padding: "2px 8px",
                    whiteSpace: "nowrap", color: C.yellow, border: `1px solid ${C.yellow}`,
                  }}>
                    DRAFT
                  </span>
                )}
              </button>

              {open === a.id && (
                <div style={{ borderTop: `1px solid ${C.border}`, padding: "12px 12px 12px" }}>
                  {h === "memuat" && <p style={{ fontSize: 12, color: C.muted, margin: 0 }}>Menghitung…</p>}
                  {h === "gagal" && (
                    <p style={{ fontSize: 12, color: C.red, margin: 0 }}>
                      Gagal memuat rincian harga. Coba tutup dan buka lagi.
                    </p>
                  )}
                  {detail && <RincianAnalisa d={detail} />}

                  <div style={{ marginTop: 12, paddingTop: 12, borderTop: `1px solid ${C.border}`,
                                display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                    {a.source === "national" && (
                      <>
                        <button onClick={() => setAdopsi(a)} style={btnGhost}>
                          <Plus size={13} /> Jadikan analisa perusahaan
                        </button>
                        <span style={{ fontSize: 11, color: C.muted, lineHeight: 1.5 }}>
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
        <div style={{ display: "flex", gap: 8, alignItems: "flex-start", padding: "8px 12px",
                      background: C.yellowBg, border: `1px solid ${C.yellow}`, borderRadius: 6,
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

      {/* TIDAK dipindahkan ke <Tabel> (diperiksa 2026-08-07, UI-0-4) — jangan
          dicoba lagi, dan alasannya tiga lapis:

          1. BARIS BERTINGKAT. Isinya dikelompokkan band A. Tenaga / B. Bahan /
             C. Alat, dan tiap band dibuka baris judul ber-`colSpan={5}`. `Tabel`
             merender satu <tr> seragam per elemen data; ia tak punya cara
             menyisipkan baris kelompok. Meratakannya jadi daftar datar akan
             MENGHAPUS pengelompokan A/B/C — dan itu bukan hiasan, itu bentuk
             lembar AHSP yang orangnya memang cari (lihat catatan di kepala
             tab Katalog).

          2. <tfoot> BERTINGKAT TIGA BARIS: D. Jumlah → BUK → HSP, dengan garis
             ganda (`3px double`) sebelum baris terakhir. Prop `total` milik
             `Tabel` merender SATU baris <tfoot>; tiga baris penutup lembar
             analisa tak bisa diwakili olehnya.

          3. Penutupnya juga bukan sekadar total kolom — "Keuntungan & overhead
             10%" adalah baris turunan, bukan jumlah dari kolom di atasnya.

          Yang penting: keempat jaminan `Tabel` sudah dipenuhi tangan di sini —
          caption sr-only ada, tabular-nums ada, pembungkus overflow-x ada.
          Yang belum: <th scope="row"> pada kolom Uraian. Itu perbaikan kecil
          yang berdiri sendiri, bukan alasan memaksakan komponennya. */}
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12, fontVariantNumeric: "tabular-nums" }}>
          <caption className="sr-only">Analisa harga satuan pekerjaan: uraian resource, satuan, koefisien, harga satuan, dan jumlah.</caption>
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
                    {/* <th scope="row"> — jaminan keempat `Tabel` yang di tabel ini
                        harus dipasang tangan (lihat catatan di atas). Tanpa ini
                        pembaca layar membacakan "0,25 · Rp 150.000" tanpa menyebut
                        bahan apa. `fontWeight: 400` supaya tampilannya tak berubah. */}
                    <th scope="row" style={{ ...td, textAlign: "left", fontWeight: 400, lineHeight: 1.45 }}>
                      {c.resource_name}
                      {c.sumber === "override_proyek" && (
                        <span title={c.override_reason ?? ""} style={{
                          marginLeft: 6, fontSize: 10, fontWeight: 700, color: C.navy,
                          border: `1px solid ${C.border}`, borderRadius: 999, padding: "0px 6px",
                        }}>KHUSUS PROYEK</span>
                      )}
                    </th>
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
                  ...tfAngka, fontWeight: 700, color: C.navy, fontSize: 13,
                  borderTop: `3px double ${C.border}`, paddingTop: 9,
                }}>
                  {fmtRp(Math.round(d.result.hspRounded))}
                </td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>

      <p style={{ fontSize: 11, color: C.muted, margin: "10px 0 0", lineHeight: 1.5 }}>
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
      }}>
      {/*
        Backdrop = `<button>` SAUDARA, bukan `onClick` pada `<div role="dialog">`.

        Bentuk lama menaruh `onClick={onClose}` pada wadah ber-`role="dialog"`,
        dan formnya harus memasang `stopPropagation` hanya untuk menahan klik
        itu — handler yang tak melakukan apa pun tapi tetap membuat `<form>`
        terhitung sebagai elemen non-interaktif yang diberi interaksi.

        `tabIndex={-1}` + `aria-hidden`: klik-latar-untuk-tutup adalah
        kenyamanan tetikus. Papan tik sudah punya Esc (`onKeyDown` di atas),
        dan menambah perhentian Tab untuk area kosong justru memperpanjang
        jalan menuju isi dialognya.
      */}
      <button
        type="button" tabIndex={-1} aria-hidden onClick={onClose}
        style={{ position: "absolute", inset: 0, width: "100%", height: "100%", background: "transparent", border: "none", padding: 0, cursor: "default" }}
      />
      <form onSubmit={kirim} style={{
        position: "relative", zIndex: 1,
        ...GAYA_KARTU, width: "100%", maxWidth: 660, maxHeight: "88vh", overflowY: "auto", padding: "var(--pad-kartu-lega)",
      }}>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
          <div>
            <h2 style={{ fontSize: 15, fontWeight: 700, color: C.text, margin: "0 0 4px" }}>
              Jadikan analisa perusahaan
            </h2>
            <p style={{ fontSize: 12, color: C.mid, margin: 0, lineHeight: 1.55 }}>
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
          <div style={{ marginTop: 14, padding: "8px 12px", background: C.redBg,
                        border: `1px solid ${C.red}`, borderRadius: 6, fontSize: 12, color: C.text }}>
            {err}
          </div>
        )}

        <div style={{ display: "grid", gap: 12, marginTop: 18 }}>
          <div>
            <label htmlFor="kode" style={lbl}>Kode analisa baru</label>
            <input className="isian-fokus" id="kode" value={kode} onChange={e => setKode(e.target.value)} required style={GAYA_ISIAN} />
          </div>
          <div>
            <label htmlFor="alasan" style={lbl}>Alasan menyesuaikan</label>
            <input className="isian-fokus" id="alasan" value={alasan} onChange={e => setAlasan(e.target.value)}
              placeholder="Mis. tim kami butuh waktu lebih lama untuk pekerjaan ini"
              style={GAYA_ISIAN} />
          </div>
        </div>

        <div style={{ marginTop: 20 }}>
          <p style={{ fontSize: 12, fontWeight: 600, color: C.text, margin: "0 0 4px" }}>
            Sesuaikan koefisien
          </p>
          <p style={{ fontSize: 11, color: C.muted, margin: "0 0 10px", lineHeight: 1.5 }}>
            Kosongkan yang tidak berubah — yang dikosongkan memakai angka aslinya.
          </p>
          {/* Dipindahkan ke <Tabel> 2026-08-07 (UI-0-4) — caption sr-only,
              scope="row", tabular-nums, dan overflow-x dijamin komponen.

              `kepalaBaris` di Uraian: nama bahan/upah itulah yang menamai baris.
              Dua kolom lain angka koefisien — dan yang satu bahkan medan isian,
              jadi tak ada isinya sampai diketik.

              `data` disaring lebih dulu ke komponen ber-resource. Dulu penyaringan
              itu dilakukan di dalam map (`c.resource && (...)`) yang menghasilkan
              `false` sebagai anak <tbody>; sebagai daftar `data` ia harus sudah
              bersih supaya `kunciBaris` tak pernah menerima baris tanpa resource. */}
          <Tabel<AsmComponent & { resource: NonNullable<AsmComponent["resource"]> }>
            caption="Perbandingan koefisien sebelum dan sesudah penyesuaian, per uraian resource."
            data={komponen.filter((c): c is AsmComponent & { resource: NonNullable<AsmComponent["resource"]> } => Boolean(c.resource))}
            kunciBaris={c => c.resource.code}
            kolom={[
              { kunci: "uraian", judul: "Uraian", kepalaBaris: true, render: c => (
                <span style={{ lineHeight: 1.45 }}>
                  {c.resource.name}
                  <span style={{ color: C.muted, marginLeft: 6 }}>{c.resource.unit_code}</span>
                </span>
              ) },
              { kunci: "asli", judul: "Asli", rata: "kanan", render: c => (
                <span style={{ fontFamily: "monospace", color: C.mid }}>{Number(c.coefficient)}</span>
              ) },
              { kunci: "jadi", judul: "Jadi", rata: "kanan", lebar: 130, render: c => (
                <input className="isian-fokus"
                  aria-label={`Koefisien baru untuk ${c.resource.name}`}
                  value={koef[c.resource.code] ?? ""}
                  onChange={e => setKoef(k => ({ ...k, [c.resource.code]: e.target.value }))}
                  placeholder={String(Number(c.coefficient))}
                  inputMode="decimal"
                  style={{ ...GAYA_ISIAN, textAlign: "right", fontFamily: "monospace", padding: "6px 8px" }}
                />
              ) },
            ]}
          />
        </div>

        <div style={{ display: "flex", gap: 8, marginTop: 20 }}>
          <button type="submit" disabled={simpan} style={{
            padding: "8px 16px", borderRadius: 10, border: "none", background: C.navy,
            color: C.onNavy, fontSize: 13, fontWeight: 600,
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
      }}>
      {/*
        Backdrop = `<button>` SAUDARA, bukan `onClick` pada `<div role="dialog">`.

        Bentuk lama menaruh `onClick={onClose}` pada wadah ber-`role="dialog"`,
        dan formnya harus memasang `stopPropagation` hanya untuk menahan klik
        itu — handler yang tak melakukan apa pun tapi tetap membuat `<form>`
        terhitung sebagai elemen non-interaktif yang diberi interaksi.

        `tabIndex={-1}` + `aria-hidden`: klik-latar-untuk-tutup adalah
        kenyamanan tetikus. Papan tik sudah punya Esc (`onKeyDown` di atas),
        dan menambah perhentian Tab untuk area kosong justru memperpanjang
        jalan menuju isi dialognya.
      */}
      <button
        type="button" tabIndex={-1} aria-hidden onClick={onClose}
        style={{ position: "absolute", inset: 0, width: "100%", height: "100%", background: "transparent", border: "none", padding: 0, cursor: "default" }}
      />
      <form onSubmit={kirim} style={{
        position: "relative", zIndex: 1,
        ...GAYA_KARTU, width: "100%", maxWidth: 660, maxHeight: "88vh", overflowY: "auto", padding: "var(--pad-kartu-lega)",
      }}>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
          <div>
            <h2 style={{ fontSize: 15, fontWeight: 700, color: C.text, margin: "0 0 4px" }}>
              Edit <code style={{ color: C.navy }}>{asal.code}</code> (versi baru)
            </h2>
            <p style={{ fontSize: 12, color: C.mid, margin: 0, lineHeight: 1.55 }}>
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
          <div style={{ marginTop: 14, padding: "8px 12px", background: C.redBg,
                        border: `1px solid ${C.red}`, borderRadius: 6, fontSize: 12, color: C.text }}>
            {err}
          </div>
        )}

        <div style={{ display: "grid", gap: 12, marginTop: 18 }}>
          <div>
            <span id="jenis-perubahan" style={lbl}>Jenis perubahan</span>
            <div role="group" aria-labelledby="jenis-perubahan" style={{ display: "flex", gap: 8 }}>
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
            <p style={{ fontSize: 11, color: C.muted, margin: "6px 0 0", lineHeight: 1.5 }}>
              {editType === "correction"
                ? `Angka semula salah (mis. salah baca sumber). Hasil tetap "${asal.source === "national" ? "nasional" : "perusahaan"}" — labelnya dipertahankan.`
                : jadiCompany
                  ? "Cara kerja tim ini sengaja berbeda dari standar nasional. Hasil OTOMATIS jadi milik perusahaan — katalog nasional tetap murni."
                  : "Cara kerja sengaja diubah dari versi sebelumnya."}
            </p>
          </div>
          <div>
            <label htmlFor="alasan-2" style={lbl}>Alasan</label>
            <input className="isian-fokus" id="alasan-2" value={alasan} onChange={e => setAlasan(e.target.value)}
              placeholder={editType === "correction"
                ? "Mis. koefisien terbaca 0,07, seharusnya 0,7"
                : "Mis. tim kami butuh waktu lebih lama untuk pekerjaan ini"}
              required style={GAYA_ISIAN} />
          </div>
        </div>

        <div style={{ marginTop: 20 }}>
          <p style={{ fontSize: 12, fontWeight: 600, color: C.text, margin: "0 0 4px" }}>
            Ubah koefisien
          </p>
          <p style={{ fontSize: 11, color: C.muted, margin: "0 0 10px", lineHeight: 1.5 }}>
            Kosongkan yang tidak berubah. Minimal satu koefisien wajib diubah.
          </p>
          {/* Dipindahkan ke <Tabel> 2026-08-07 (UI-0-4) — caption sr-only,
              scope="row", tabular-nums, dan overflow-x dijamin komponen.
              `kepalaBaris` di Uraian, alasan sama dengan tabel adopsi di atas:
              nama bahan yang menamai baris, bukan angka koefisiennya. */}
          <Tabel<AsmComponent & { resource: NonNullable<AsmComponent["resource"]> }>
            caption="Perbandingan harga satuan yang berlaku sekarang dengan yang akan diterapkan, per uraian."
            data={komponen.filter((c): c is AsmComponent & { resource: NonNullable<AsmComponent["resource"]> } => Boolean(c.resource))}
            kunciBaris={c => c.resource.code}
            kolom={[
              { kunci: "uraian", judul: "Uraian", kepalaBaris: true, render: c => (
                <span style={{ lineHeight: 1.45 }}>
                  {c.resource.name}
                  <span style={{ color: C.muted, marginLeft: 6 }}>{c.resource.unit_code}</span>
                </span>
              ) },
              { kunci: "sekarang", judul: "Sekarang", rata: "kanan", render: c => (
                <span style={{ fontFamily: "monospace", color: C.mid }}>{Number(c.coefficient)}</span>
              ) },
              { kunci: "jadi", judul: "Jadi", rata: "kanan", lebar: 130, render: c => (
                <input className="isian-fokus"
                  aria-label={`Koefisien baru untuk ${c.resource.name}`}
                  value={koef[c.resource.code] ?? ""}
                  onChange={e => setKoef(k => ({ ...k, [c.resource.code]: e.target.value }))}
                  placeholder={String(Number(c.coefficient))}
                  inputMode="decimal"
                  style={{ ...GAYA_ISIAN, textAlign: "right", fontFamily: "monospace", padding: "6px 8px" }}
                />
              ) },
            ]}
          />
        </div>

        <div style={{ display: "flex", gap: 8, marginTop: 20 }}>
          <button type="submit" disabled={simpan} style={{
            padding: "8px 16px", borderRadius: 10, border: "none", background: C.navy,
            color: C.onNavy, fontSize: 13, fontWeight: 600,
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
  // `queueMicrotask`, bukan panggilan langsung: `loadDetail()` menyetel state
  // pemuatan di baris pertamanya, dan setState SINKRON di dalam effect memicu
  // render kedua sebelum yang pertama selesai (react-hooks/set-state-in-effect).
  // Menunda satu microtask memindahkannya keluar dari fase render tanpa
  // menambah jeda yang terlihat.
  useEffect(() => { queueMicrotask(() => { void loadDetail(rapId); }); }, [rapId, loadDetail]);

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
        <div role="status" style={{ ...GAYA_KARTU, padding: "8px 12px", marginBottom: 12, display: "flex",
                      alignItems: "center", gap: 8, background: C.greenBg, borderColor: C.green }}>
          <CheckCircle2 size={15} color={C.green} />
          <span style={{ fontSize: 13, color: C.text }}>{pesan}</span>
        </div>
      )}
      {err && <div style={{ background: C.redBg, color: C.red, border: `1px solid ${C.border}`, borderRadius: 6, padding: "8px 12px", fontSize: 12, marginBottom: 10 }}>{err}</div>}

      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginBottom: 14 }}>
        <select className="isian-fokus" aria-label="Proyek" value={projectId} onChange={e => setProjectId(e.target.value)} style={{ ...GAYA_ISIAN, width: 280 }}>
          <option value="">— Pilih proyek —</option>
          {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        {projectId && rapList.length > 0 && (
          <select className="isian-fokus" aria-label="Pilih RAP" value={rapId} onChange={e => setRapId(e.target.value)} style={{ ...GAYA_ISIAN, width: 260 }}>
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
        <div style={{ display: "grid", gap: "var(--gap-grid)" }}>
          <div style={{ ...GAYA_KARTU, padding: "var(--pad-kartu-lega)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <ClipboardList size={16} color={C.navy} />
                <strong style={{ fontSize: 15 }}>{detail.data.name}</strong>
                <StatusBadge s={detail.data.status} />
              </div>
              {!locked && (
                <button style={{ ...btnGhost, color: C.navy }} disabled={busy || detail.total.pagu <= 0} onClick={() => void kunciPagu()}>
                  <Lock size={13} /> Kunci Pagu
                </button>
              )}
            </div>
            {detail.data.notes && <p style={{ fontSize: 12, color: C.mid, margin: "8px 0 0" }}>{detail.data.notes}</p>}
            <div style={{ display: "flex", gap: "var(--gap-bagian)", marginTop: 14, flexWrap: "wrap" }}>
              <div>
                <div style={{ fontSize: 11, color: C.muted, textTransform: "uppercase", letterSpacing: .4 }}>Pagu Material</div>
                <div style={{ fontSize: 17, fontWeight: 700, color: C.text, fontFamily: "monospace" }}>{fmtRp(detail.total.material)}</div>
              </div>
              <div>
                <div style={{ fontSize: 11, color: C.muted, textTransform: "uppercase", letterSpacing: .4 }}>Borongan Tenaga Kerja</div>
                <div style={{ fontSize: 17, fontWeight: 700, color: C.text, fontFamily: "monospace" }}>{fmtRp(detail.total.labor)}</div>
              </div>
              <div>
                <div style={{ fontSize: 11, color: C.muted, textTransform: "uppercase", letterSpacing: .4 }}>Total Pagu</div>
                <div style={{ fontSize: 17, fontWeight: 800, color: C.navy, fontFamily: "monospace" }}>{fmtRp(detail.total.pagu)}</div>
              </div>
            </div>
          </div>

          <div style={GAYA_KARTU}>
            <div style={{ padding: "12px 16px", borderBottom: `1px solid ${C.border}`, display: "flex", alignItems: "center", gap: 8 }}>
              <Package size={15} color={C.navy} />
              <strong style={{ fontSize: 13 }}>Material</strong>
              <span style={{ fontSize: 11, color: C.muted }}>({detail.material.length} item)</span>
            </div>
            {/* Dipindahkan ke <Tabel> 2026-08-07 (UI-0-4) — caption sr-only,
                scope="row", tabular-nums, dan overflow-x dijamin komponen.

                `kepalaBaris` di Material: nama bahannya yang menamai baris. Enam
                kolom lain angka, dan dua di antaranya medan isian — dibacakan
                tanpa nama material, tak ada yang bisa ditempatkan.

                Pesan kosong pindah ke prop `kosong`: sebagai <td colSpan> di
                <tbody> pembaca layar membacakannya seolah nama sebuah baris. */}
            <Tabel<RapMaterialLine>
              caption="Penyesuaian kuantitas material: qty RAB, qty disesuaikan, satuan, harga supplier, dan pagu."
              data={detail.material}
              kunciBaris={m => m.id}
              kosong={<p style={{ padding: "12px 16px", fontSize: 13, color: C.muted, margin: 0 }}>Tidak ada baris material — versi estimasi ini mungkin tidak punya item berkategori material.</p>}
              kolom={[
                { kunci: "material", judul: "Material", kepalaBaris: true, render: m => m.resource?.name ?? "—" },
                { kunci: "qtyAhsp", judul: "Qty RAB", rata: "kanan", render: m => (
                  <span style={{ fontFamily: "monospace", color: C.mid }}>{formatKuantitas(m.qty_ahsp)}</span>
                ) },
                { kunci: "qtyAdj", judul: "Qty Disesuaikan", rata: "kanan", lebar: 110, render: m => (
                  locked ? formatKuantitas(m.qty_adjusted) : (
                    <input className="isian-fokus" defaultValue={Number(m.qty_adjusted)} inputMode="decimal"
                      aria-label={`Qty disesuaikan untuk ${m.resource?.name ?? "material"}`}
                      onBlur={e => e.target.value !== String(Number(m.qty_adjusted)) && void simpanQty(m, "qty_adjusted", e.target.value)}
                      style={{ ...GAYA_ISIAN, textAlign: "right", fontFamily: "monospace", padding: "4px 8px" }} />
                  )
                ) },
                { kunci: "sat", judul: "Sat", render: m => m.unit_code },
                { kunci: "harga", judul: "Harga Supplier", rata: "kanan", lebar: 140, render: m => (
                  locked ? fmtRp(Number(m.supplier_price)) : (
                    <input className="isian-fokus" defaultValue={Number(m.supplier_price)} inputMode="decimal"
                      aria-label={`Harga supplier untuk ${m.resource?.name ?? "material"}`}
                      onBlur={e => e.target.value !== String(Number(m.supplier_price)) && void simpanQty(m, "supplier_price", e.target.value)}
                      style={{ ...GAYA_ISIAN, textAlign: "right", fontFamily: "monospace", padding: "4px 8px" }} />
                  )
                ) },
                { kunci: "pagu", judul: "Pagu", rata: "kanan", render: m => (
                  <span style={{ fontWeight: 600, fontFamily: "monospace" }}>{fmtRp(Number(m.pagu))}</span>
                ) },
                { kunci: "aksi", judul: "", lebar: 36, render: m => (
                  locked ? (
                    <button aria-label={`Catat perubahan untuk ${m.resource?.name ?? "material"} (arsip)`} title="Catat perubahan (arsip)" style={{ background: "none", border: "none", cursor: "pointer", color: C.muted }}
                      onClick={() => setShowLogForm({ table: "rap_material_line", id: m.id, label: m.resource?.name ?? m.id })}>
                      <Pencil size={13} />
                    </button>
                  ) : null
                ) },
              ]}
              total={detail.material.length > 0 ? [
                { kunci: "label", isi: "Total pagu material", rentang: 5 },
                { kunci: "pagu", isi: fmtRp(detail.total.material), rata: "kanan" },
                { kunci: "aksi", isi: "" },
              ] : undefined}
            />
          </div>

          <div style={GAYA_KARTU}>
            <div style={{ padding: "12px 16px", borderBottom: `1px solid ${C.border}`, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <HardHat size={15} color={C.navy} />
                <strong style={{ fontSize: 13 }}>Tenaga Kerja (Borongan)</strong>
              </div>
              {!locked && <button style={btnGhost} onClick={() => setShowAddLabor(true)}><Plus size={13} /> Tambah</button>}
            </div>
            {/* Dipindahkan ke <Tabel> 2026-08-07 (UI-0-4) — caption sr-only,
                scope="row", tabular-nums, dan overflow-x dijamin komponen.
                `kepalaBaris` di Uraian Pekerjaan: itu satu-satunya kolom yang
                mengidentifikasi borongannya. Pesan kosong pindah ke prop `kosong`. */}
            <Tabel<RapLaborLine>
              caption="Nilai borongan per uraian pekerjaan."
              data={detail.labor}
              kunciBaris={l => l.id}
              kosong={<p style={{ padding: "12px 16px", fontSize: 13, color: C.muted, margin: 0 }}>Belum ada borongan tenaga kerja.</p>}
              kolom={[
                { kunci: "uraian", judul: "Uraian Pekerjaan", kepalaBaris: true, render: l => l.description },
                { kunci: "nilai", judul: "Nilai Borongan", rata: "kanan", render: l => (
                  <span style={{ fontWeight: 600, fontFamily: "monospace" }}>{fmtRp(Number(l.borongan_value))}</span>
                ) },
                { kunci: "aksi", judul: "", lebar: 36, render: l => (
                  locked ? (
                    <button aria-label={`Catat perubahan untuk ${l.description} (arsip)`} title="Catat perubahan (arsip)" style={{ background: "none", border: "none", cursor: "pointer", color: C.muted }}
                      onClick={() => setShowLogForm({ table: "rap_labor_line", id: l.id, label: l.description })}>
                      <Pencil size={13} />
                    </button>
                  ) : null
                ) },
              ]}
              total={detail.labor.length > 0 ? [
                { kunci: "label", isi: "Total borongan" },
                { kunci: "nilai", isi: fmtRp(detail.total.labor), rata: "kanan" },
                { kunci: "aksi", isi: "" },
              ] : undefined}
            />
          </div>

          <div style={GAYA_KARTU}>
            <button onClick={() => setShowLogTable(s => !s)}
              style={{ width: "100%", display: "flex", alignItems: "center", gap: 8, padding: "12px 16px",
                       background: "none", border: "none", cursor: "pointer", textAlign: "left" }}>
              <History size={15} color={C.mid} />
              <strong style={{ fontSize: 13, color: C.text }}>Log Perubahan</strong>
              <span style={{ fontSize: 11, color: C.muted }}>— catatan penyesuaian di luar sistem, tak mengubah pagu tersimpan</span>
              {showLogTable ? <ChevronDown size={14} color={C.mid} style={{ marginLeft: "auto" }} /> : <ChevronRight size={14} color={C.mid} style={{ marginLeft: "auto" }} />}
            </button>
            {showLogTable && (
              /* Dipindahkan ke <Tabel> 2026-08-07 (UI-0-4) — caption sr-only,
                 scope="row", tabular-nums, dan overflow-x dijamin komponen.

                 Urutan kolom DITUKAR: Alasan naik ke depan dan memegang
                 `kepalaBaris`; Waktu turun ke kedua. Cap waktu tidak menamai
                 apa pun — beberapa catatan bisa dibuat dalam menit yang sama,
                 dan pembaca layar akan mengumumkan baris-baris bernama
                 "7/8/2026, 10.14.32". Alasan ("supplier menaikkan harga semen
                 setelah pagu dikunci") justru satu-satunya isi yang membedakan
                 satu catatan arsip dari yang lain — dan memang itu yang dicari
                 orang saat membuka log ini. */
              <div style={{ borderTop: `1px solid ${C.border}` }}>
                <Tabel<RapChangeLogEntry>
                  caption="Riwayat perubahan: alasan, waktu, kolom yang diubah, nilai lama, dan nilai baru."
                  data={changeLog}
                  kunciBaris={l => l.id}
                  kosong={<p style={{ padding: "12px 16px", fontSize: 13, color: C.muted, margin: 0 }}>Belum ada catatan perubahan.</p>}
                  kolom={[
                    { kunci: "alasan", judul: "Alasan", kepalaBaris: true, render: l => l.reason },
                    { kunci: "waktu", judul: "Waktu", render: l => (
                      <span style={{ fontSize: 12, color: C.mid, whiteSpace: "nowrap" }}>{formatTanggalJam(l.changed_at)}</span>
                    ) },
                    { kunci: "field", judul: "Field", render: l => l.field_name ?? "—" },
                    { kunci: "lama", judul: "Lama", render: l => <span style={{ color: C.mid }}>{l.old_value ?? "—"}</span> },
                    { kunci: "baru", judul: "Baru", render: l => l.new_value ?? "—" },
                  ]}
                />
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
        {err && <div style={{ marginBottom: 12, padding: "8px 12px", background: C.redBg, border: `1px solid ${C.red}`, borderRadius: 6, fontSize: 12, color: C.text }}>{err}</div>}
        <label htmlFor="version-id" style={lbl}>Versi estimasi (sumber take-off material)</label>
        <select className="isian-fokus" id="version-id" aria-label="Pilih versi estimasi" value={versionId} onChange={e => setVersionId(e.target.value)} required style={{ ...GAYA_ISIAN, marginBottom: 12 }}>
          <option value="">— Pilih versi —</option>
          {allVersions.map(v => (
            <option key={v.id} value={v.id}>{v.scenarioName} · v{v.version_number} ({v.status}) · {fmtRp(Number(v.total_amount))}</option>
          ))}
        </select>
        {allVersions.length === 0 && <p style={{ fontSize: 12, color: C.muted, margin: "-6px 0 12px" }}>Belum ada versi estimasi di proyek ini — buat dulu di tab Komposer.</p>}
        <label htmlFor="name" style={lbl}>Nama RAP</label>
        <input className="isian-fokus" id="name" value={name} onChange={e => setName(e.target.value)} style={{ ...GAYA_ISIAN, marginBottom: 12 }} />
        <label htmlFor="notes" style={lbl}>Catatan (opsional)</label>
        <input className="isian-fokus" id="notes" value={notes} onChange={e => setNotes(e.target.value)} style={{ ...GAYA_ISIAN, marginBottom: 16 }} />
        <div style={{ display: "flex", gap: 8 }}>
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
        {err && <div style={{ marginBottom: 12, padding: "8px 12px", background: C.redBg, border: `1px solid ${C.red}`, borderRadius: 6, fontSize: 12, color: C.text }}>{err}</div>}
        <label htmlFor="description" style={lbl}>Uraian pekerjaan</label>
        <input className="isian-fokus" id="description" value={description} onChange={e => setDescription(e.target.value)} required
          placeholder="Mis. Borongan pasangan bata + plester lantai 1" style={{ ...GAYA_ISIAN, marginBottom: 12 }} />
        <label htmlFor="value" style={lbl}>Nilai borongan (Rp)</label>
        <input className="isian-fokus" id="value" value={value} onChange={e => setValue(e.target.value)} inputMode="decimal" style={{ ...GAYA_ISIAN, marginBottom: 16 }} />
        <label htmlFor="notes-2" style={lbl}>Catatan (opsional)</label>
        <input className="isian-fokus" id="notes-2" value={notes} onChange={e => setNotes(e.target.value)} style={{ ...GAYA_ISIAN, marginBottom: 16 }} />
        <div style={{ display: "flex", gap: 8 }}>
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
        {err && <div style={{ marginBottom: 12, padding: "8px 12px", background: C.redBg, border: `1px solid ${C.red}`, borderRadius: 6, fontSize: 12, color: C.text }}>{err}</div>}
        <label htmlFor="field-name" style={lbl}>Field yang berubah (opsional)</label>
        <input className="isian-fokus" id="field-name" value={fieldName} onChange={e => setFieldName(e.target.value)} placeholder="Mis. supplier_price" style={{ ...GAYA_ISIAN, marginBottom: 12 }} />
        <div style={{ display: "flex", gap: 8 }}>
          <div style={{ flex: 1 }}>
            <label htmlFor="old-value" style={lbl}>Nilai lama (opsional)</label>
            <input className="isian-fokus" id="old-value" value={oldValue} onChange={e => setOldValue(e.target.value)} style={{ ...GAYA_ISIAN, marginBottom: 12 }} />
          </div>
          <div style={{ flex: 1 }}>
            <label htmlFor="new-value" style={lbl}>Nilai baru (opsional)</label>
            <input className="isian-fokus" id="new-value" value={newValue} onChange={e => setNewValue(e.target.value)} style={{ ...GAYA_ISIAN, marginBottom: 12 }} />
          </div>
        </div>
        <label htmlFor="reason" style={lbl}>Alasan (wajib)</label>
        <input className="isian-fokus" id="reason" value={reason} onChange={e => setReason(e.target.value)} required
          placeholder="Mis. supplier menaikkan harga semen setelah pagu dikunci" style={{ ...GAYA_ISIAN, marginBottom: 16 }} />
        <div style={{ display: "flex", gap: 8 }}>
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
/** Badge jenis harga pokok. Warna dibedakan, TAPI teksnya tetap ditulis —
 *  membedakan hanya dengan warna menyulitkan yang buta warna. */
function JenisHarga({ c }: { c: string }) {
  const peta: Record<string, { label: string; warna: string; bg: string }> = {
    labor: { label: "upah", warna: C.navy, bg: "var(--bg)" },
    material: { label: "bahan", warna: C.green, bg: C.greenBg },
    equipment: { label: "alat", warna: C.yellow, bg: C.yellowBg },
  };
  const p = peta[c];
  if (!p) return null;
  return (
    <span style={{ marginLeft: 6, padding: "0px 6px", borderRadius: 999, fontSize: 10,
      fontWeight: 700, color: p.warna, background: p.bg, whiteSpace: "nowrap" }}>
      {p.label}
    </span>
  );
}

function HargaTab() {
  const [entries, setEntries] = useState<PriceEntry[]>([]);
  const [total, setTotal] = useState<number | null>(null);
  const [status, setStatus] = useState("");
  /** labor = upah · material = bahan · equipment = alat (kolom resources.category) */
  const [kategori, setKategori] = useState("");
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
    if (kategori) p.set("category", kategori);
    p.set("limit", "5000");
    const r = await api.get<{ data: PriceEntry[]; total: number | null }>(
      `/api/v1/cecep/price-book?${p}`);
    setEntries(r.data.data ?? []);
    setTotal(r.data.total ?? null);
  }, [status, kategori]);

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
      <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 12, flexWrap: "wrap" }}>
        {/* Upah / bahan / alat sudah terpisah di `resources.category` — tinggal
            disaring. Berguna karena keduanya diperlakukan berbeda: upah berubah
            per kesepakatan mandor, harga bahan per supplier. */}
        <select className="isian-fokus" value={kategori} onChange={e => setKategori(e.target.value)}
          aria-label="Saring jenis harga pokok" style={{ ...GAYA_ISIAN, width: 170 }}>
          <option value="">Semua jenis</option>
          <option value="labor">Upah (tenaga kerja)</option>
          <option value="material">Bahan / material</option>
          <option value="equipment">Alat / peralatan</option>
        </select>
        <select className="isian-fokus" value={status} onChange={e => setStatus(e.target.value)}
          aria-label="Saring status harga" style={{ ...GAYA_ISIAN, width: 160 }}>
          <option value="">Semua status</option>
          <option value="draft">draft</option><option value="verified">verified</option>
          <option value="active">active</option><option value="expired">expired</option>
        </select>
        <label htmlFor="harga-cari" style={{ position: "absolute", width: 1, height: 1,
          overflow: "hidden", clip: "rect(0 0 0 0)", whiteSpace: "nowrap" }}>
          Cari nama atau kode resource
        </label>
        <input className="isian-fokus" id="harga-cari" type="search" value={cari} onChange={e => setCari(e.target.value)}
          placeholder="Cari resource (semen, besi, pekerja…)"
          style={{ ...GAYA_ISIAN, width: 260 }} />
        <button style={btnPrimary} onClick={() => setShowNew(true)}><Plus size={14} /> Harga Baru</button>
        {/* Jujur soal pemotongan: 2.637 entri, hanya 200 termuat. Pemakai yang
            tak menemukan harganya perlu tahu daftarnya memang dipotong — bukan
            menyimpulkan harganya belum ada lalu menginput duplikat. */}
        {total != null && (
          <span style={{ fontSize: 12, whiteSpace: "nowrap",
            color: terpotong ? C.yellow : C.muted }}>
            {terpotong
              ? `${entries.length} dari ${formatAngka(total)} — melebihi batas muat`
              : cari.trim()
                ? `${formatAngka(terlihat.length)} dari ${formatAngka(entries.length)} harga`
                : `${formatAngka(terlihat.length)} harga`}
          </span>
        )}
      </div>
      <p style={{ fontSize: 12, color: C.muted, margin: "0 0 12px" }}>
        Alur: draft → verified → active (maju saja, dijaga database). Hanya <b>active</b> yang
        dipakai menghitung HSP.
      </p>
      {err && <div style={{ background: C.redBg, color: C.red, borderRadius: 6, padding: "8px 12px", fontSize: 12, marginBottom: 10 }}>{err}</div>}

      <PrioritasHarga onIsi={isiHarga} />

      {/* Wadah scroll vertikal untuk virtualisasi + horizontal untuk kolom
          yang tak muat di layar sempit. Tinggi dibatasi supaya tabel 2.637
          baris tak mendorong seluruh halaman menjadi sangat panjang. */}
      <div ref={pasangHarga} style={{ overflowX: "auto", background: C.surface,
        border: `1px solid ${C.border}`, borderRadius: 10,
        ...(vhOff ? {} : { maxHeight: 560, overflowY: "auto" as const }) }}>
        {/* TIDAK dipindahkan ke <Tabel> (diperiksa 2026-08-07, UI-0-4) — jangan
            dicoba lagi tanpa lebih dulu mengubah komponennya.

            Tabel ini DIVIRTUALISASI: dari 2.637 entri harga, hanya ~30 baris yang
            dirender kapan pun, dan panjang scrollbar dijaga oleh dua baris
            pengganjal ber-`colSpan={8}` di awal & akhir <tbody> (`vhTop`/`vhBawah`,
            lihat `useVirtualList` di atas). `Tabel` merender `data.map()` UTUH dan
            tak punya jalan menyisipkan baris pengganjal — memakainya di sini
            berarti merender 2.637 baris sekaligus, yaitu persis beban yang
            virtualisasinya dibuat untuk menghindari.

            Memindahkannya butuh `Tabel` mendukung virtualisasi lebih dulu. Itu
            pekerjaan terhadap komponennya, bukan terhadap halaman ini.

            Keempat jaminan `Tabel` sudah dipenuhi tangan: caption sr-only ada,
            tabular-nums ada, pembungkus overflow-x ada, dan kolom Resource
            memakai <th scope="row"> (dipasang 2026-08-07 bersama catatan ini). */}
        <table style={{ width: "100%", borderCollapse: "collapse", fontVariantNumeric: "tabular-nums" }}>
          <caption className="sr-only">Daftar harga resource: harga, satuan, masa berlaku, lokasi, tingkat keyakinan, status, dan aksi.</caption>
          <thead><tr>
            <th style={th}>Resource</th><th style={{ ...th, textAlign: "right" }}>Harga</th><th style={th}>Sat</th>
            <th style={th}>Berlaku</th><th style={th}>Lokasi</th><th style={th}>Keyakinan</th><th style={th}>Status</th><th style={th}>Aksi</th>
          </tr></thead>
          <tbody>
            {vhTop > 0 && <tr aria-hidden="true"><td colSpan={8} style={{ height: vhTop, padding: 0 }} /></tr>}
            {terlihat.slice(vhMulai, vhAkhir).map(en => (
              <tr key={en.id}>
                <th scope="row" style={{ ...td, textAlign: "left", fontWeight: 400 }}>
                  <b>{en.resource?.name}</b>
                  {/* Jenis ditandai per baris, bukan hanya lewat filter: upah
                      dan bahan diperlakukan berbeda saat memutuskan harga, dan
                      keduanya berdampingan di daftar yang sama. */}
                  {en.resource?.category && <JenisHarga c={en.resource.category} />}
                  <br /><code style={{ fontSize: 11, color: C.muted }}>{en.resource?.code}</code>
                </th>
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

      <OverrideProyek />
    </div>
  );
}

// ── Harga khusus proyek (override) ────────────────────────────────────────────
//
// ROADMAP #14g. `project_price_override` sudah dipakai TIGA jalur perhitungan —
// `price-resolver.ts`, `ahsp.ts`, `estimate-versions.ts` — dan alasannya bahkan
// ikut muncul di explainability trail. Tapi endpointnya nol pemanggil dari web:
// fitur yang sudah mempengaruhi angka RAB hanya bisa dipakai lewat panggilan
// API langsung, dan tabelnya nol baris. Persis kelas cacat yang §9a dibuat
// untuk menangkap — kodenya benar dan teruji, yang kurang jalur pemakaiannya.
//
// Diletakkan DI DALAM tab Harga, bukan tab sendiri: override adalah pengecualian
// atas price book, dan memisahkannya membuat orang menyetel harga khusus tanpa
// pernah melihat harga umumnya lebih dulu. Pemilih proyek ada di sini karena
// override selalu milik satu proyek, sementara price book global.

interface OverrideHarga {
  id: string;
  resource_id: string;
  amount: number;
  currency: string;
  effective_date: string | null;
  expired_date: string | null;
  reason: string;
  notes: string | null;
  created_at: string;
  resource: { code: string; name: string; unit_code: string; category: string } | null;
}

function OverrideProyek() {
  const [proyek, setProyek] = useState<Array<{ id: string; name: string }>>([]);
  const [proyekId, setProyekId] = useState("");
  const [data, setData] = useState<OverrideHarga[]>([]);
  const [memuat, setMemuat] = useState(false);
  const [err, setErr] = useState("");
  const [formBuka, setFormBuka] = useState(false);

  useEffect(() => {
    let batal = false;
    api.get("/api/v1/projects")
      .then((r) => {
        if (batal) return;
        const d = (r.data?.projects ?? []) as Array<{ id: string; name: string }>;
        setProyek(d);
        setProyekId((k) => k || d[0]?.id || "");
      })
      .catch(() => { if (!batal) setErr("Daftar proyek tidak bisa dimuat."); });
    return () => { batal = true; };
  }, []);

  const muat = useCallback(async (pid: string) => {
    if (!pid) return;
    setMemuat(true); setErr("");
    try {
      const r = await api.get(`/api/v1/projects/${pid}/price-overrides`);
      setData(r.data?.data ?? []);
    } catch {
      setErr("Daftar harga khusus tidak bisa dimuat.");
    } finally { setMemuat(false); }
  }, []);

  useEffect(() => {
    if (!proyekId) return;
    let batal = false;
    void Promise.resolve().then(() => { if (!batal) void muat(proyekId); });
    return () => { batal = true; };
  }, [proyekId, muat]);

  const hapus = async (o: OverrideHarga) => {
    if (!window.confirm(
      `Hapus harga khusus untuk ${o.resource?.code ?? "resource ini"}?\n\n` +
      "Estimasi yang belum dikunci akan kembali memakai harga price book."
    )) return;
    try {
      await api.delete(`/api/v1/price-overrides/${o.id}`);
      await muat(proyekId);
    } catch {
      setErr("Harga khusus tidak bisa dihapus.");
    }
  };

  return (
    <section style={{ marginTop: 26, paddingTop: 20, borderTop: `1px solid ${C.border}` }}>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "flex-end",
        justifyContent: "space-between", marginBottom: 12 }}>
        <div>
          <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: C.text }}>
            Harga khusus proyek
          </h3>
          <p style={{ margin: "3px 0 0", fontSize: 12, color: C.mid, lineHeight: 1.55, maxWidth: 620 }}>
            Menimpa price book untuk satu proyek saja — dipakai saat harga di
            lokasi berbeda dari harga umum. Alasannya wajib, dan ikut muncul di
            rincian perhitungan supaya angka yang menyimpang selalu punya
            keterangannya.
          </p>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <select
            aria-label="Pilih proyek untuk harga khusus"
            value={proyekId}
            onChange={(e) => setProyekId(e.target.value)}
            style={{ minHeight: 36, padding: "0 10px", fontSize: 13, borderRadius: 6,
              border: `1px solid ${C.border}`, background: "var(--surface)", color: C.text,
              maxWidth: 220, fontFamily: "inherit" }}
          >
            {proyek.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          <button style={btnGhost} onClick={() => setFormBuka(true)} disabled={!proyekId}>
            <Plus size={13} /> Harga khusus
          </button>
        </div>
      </div>

      {err && (
        <p style={{ fontSize: 12, color: C.red, margin: "0 0 10px" }}>{err}</p>
      )}

      {memuat ? (
        <p style={{ fontSize: 13, color: C.mid, margin: 0 }}>Memuat…</p>
      ) : data.length === 0 ? (
        <p style={{ fontSize: 13, color: C.muted, margin: 0, lineHeight: 1.6 }}>
          Belum ada harga khusus di proyek ini — seluruh perhitungan memakai
          price book. Tambahkan hanya bila harga di lokasi benar-benar berbeda;
          tiap override membuat angka proyek ini menyimpang dari yang lain, dan
          alasannya harus bisa dipertanggungjawabkan.
        </p>
      ) : (
        /* Dipindahkan ke <Tabel> 2026-08-07 (UI-0-4) — caption sr-only,
           scope="row", tabular-nums, dan overflow-x dijamin komponen.

           `kepalaBaris` di Resource: kode + nama bahannya yang menamai baris.
           "Alasan" isinya kalimat panjang dan "Berlaku" tanggal — keduanya
           keterangan atas harga khusus itu, bukan identitasnya. */
        <Tabel<OverrideHarga>
          caption="Harga khusus per resource: nilai, masa berlaku, dan alasan penetapannya."
          data={data}
          kunciBaris={o => o.id}
          kolom={[
            { kunci: "resource", judul: "Resource", kepalaBaris: true, render: o => (
              <>
                <strong>{o.resource?.code ?? "—"}</strong>
                <span style={{ display: "block", color: C.mid }}>
                  {o.resource?.name ?? ""}{o.resource?.unit_code ? ` / ${o.resource.unit_code}` : ""}
                </span>
              </>
            ) },
            { kunci: "harga", judul: "Harga khusus", rata: "kanan", render: o => (
              <span style={{ fontWeight: 700 }}>{fmtRp(o.amount)}</span>
            ) },
            { kunci: "berlaku", judul: "Berlaku", render: o => (
              <span style={{ whiteSpace: "nowrap" }}>
                {o.effective_date ?? "—"}{o.expired_date ? ` → ${o.expired_date}` : ""}
              </span>
            ) },
            { kunci: "alasan", judul: "Alasan", render: o => (
              <span style={{ display: "block", maxWidth: 320 }}>{o.reason}</span>
            ) },
            { kunci: "aksi", judul: "", render: o => (
              <button style={{ ...btnGhost, color: C.red, whiteSpace: "nowrap" }}
                aria-label={`Hapus harga khusus ${o.resource?.code ?? "resource ini"}`}
                onClick={() => void hapus(o)}>
                Hapus
              </button>
            ) },
          ]}
        />
      )}

      {formBuka && (
        <FormOverride
          proyekId={proyekId}
          onTutup={() => setFormBuka(false)}
          onSimpan={async () => { setFormBuka(false); await muat(proyekId); }}
        />
      )}
    </section>
  );
}

function FormOverride({ proyekId, onTutup, onSimpan }: {
  proyekId: string; onTutup: () => void; onSimpan: () => Promise<void>;
}) {
  // API menerima `resource_id` (UUID), bukan kode. Meminta orang mengetik UUID
  // adalah rancangan yang tak bisa dipakai — jadi pencarian mengembalikan
  // pilihan, dan id-nya diambil dari yang dipilih.
  const [cari, setCari] = useState("");
  const [pilihan, setPilihan] = useState<Array<{ id: string; code: string; name: string; unit_code: string }>>([]);
  const [terpilih, setTerpilih] = useState<{ id: string; code: string; name: string; unit_code: string } | null>(null);
  /** Permintaan pencarian yang sedang berjalan. `useRef`, bukan state:
   *  indikator "Mencari…" tak perlu memicu render tersendiri, dan setState
   *  di dalam efek pencarian memicu render berantai tiap ketikan. */
  const jalanRef = useRef(0);
  const [versiHasil, setVersiHasil] = useState(0);
  const [jumlah, setJumlah] = useState("");
  const [alasan, setAlasan] = useState("");
  const [berlaku, setBerlaku] = useState("");
  const [catatan, setCatatan] = useState("");
  const [menyimpan, setMenyimpan] = useState(false);
  const [err, setErr] = useState("");
  const kodeRef = useRef<HTMLInputElement>(null);

  useEffect(() => { kodeRef.current?.focus(); }, []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onTutup(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onTutup]);

  // Cari-sambil-ketik dengan jeda. Tanpa jeda, tiap huruf jadi satu permintaan
  // ke registry 2.400+ entri.
  useEffect(() => {
    const q = cari.trim();
    // Pengosongan TIDAK dilakukan di sini: `setPilihan([])` sinkron di badan
    // efek memicu render berantai tiap ketikan. Yang ditampilkan disaring saat
    // render (`tampilPilihan`) — daftar lama tak pernah terlihat karena
    // syaratnya sama.
    if (q.length < 2 || terpilih) return;
    let batal = false;
    const t = setTimeout(() => {
      jalanRef.current += 1;
      const seri = jalanRef.current;
      api.get<{ data: Array<{ id: string; code: string; name: string; unit_code: string }> }>(
        `/api/v1/cecep/resources?q=${encodeURIComponent(q)}&limit=20`)
        .then((r) => { if (!batal) setPilihan(r.data?.data ?? []); })
        .catch(() => { if (!batal) setPilihan([]); })
        // Hasil yang datang TERLAMBAT dari pencarian sebelumnya diabaikan:
        // tanpa ini, mengetik cepat bisa menampilkan hasil kata yang sudah
        // ditinggalkan — dan orangnya memilih resource yang salah.
        .finally(() => { if (!batal && seri === jalanRef.current) setVersiHasil((v) => v + 1); });
    }, 260);
    return () => { batal = true; clearTimeout(t); };
  }, [cari, terpilih]);

  /** Hasil yang boleh tampil — diturunkan, bukan di-set dalam efek. */
  const tampilPilihan = (cari.trim().length < 2 || terpilih) ? [] : pilihan;

  const simpan = async () => {
    const n = Number(jumlah.replace(/[^\d.-]/g, ""));
    if (!terpilih) { setErr("Pilih dulu resource dari hasil pencarian."); return; }
    if (!Number.isFinite(n) || n <= 0) { setErr("Harga harus angka lebih dari nol."); return; }
    if (!alasan.trim()) {
      setErr("Alasan wajib — angka yang menyimpang tanpa keterangan tak bisa dipertanggungjawabkan.");
      return;
    }
    setMenyimpan(true); setErr("");
    try {
      await api.post(`/api/v1/projects/${proyekId}/price-overrides`, {
        resource_id: terpilih.id,
        amount: n,
        reason: alasan.trim(),
        effective_date: berlaku || undefined,
        notes: catatan.trim() || undefined,
      });
      await onSimpan();
    } catch (e) {
      // Pesan server ditampilkan apa adanya — ia sudah menyebut sebabnya
      // (mis. sudah ada override pada tanggal berlaku yang sama), dan itu
      // informasi yang paling berguna di sini.
      const p = (e as { response?: { data?: { error?: string } } }).response?.data?.error;
      setErr(p ?? "Harga khusus tidak bisa disimpan.");
    } finally { setMenyimpan(false); }
  };

  const gaya = {
    input: { minHeight: 42, padding: "8px 12px", width: "100%", boxSizing: "border-box" as const,
      border: `1px solid ${C.border}`, borderRadius: 6, fontSize: 13,
      background: "var(--surface)", color: C.text, fontFamily: "inherit" },
    label: { fontSize: 12, fontWeight: 600, color: C.text, display: "block", marginBottom: 5 },
    bantu: { fontSize: 11, color: C.muted, lineHeight: 1.5, display: "block", marginTop: 4 },
  };

  return (
    <div role="dialog" aria-modal="true" aria-labelledby="ovr-judul"
      style={{ position: "fixed", inset: 0, zIndex: 60, background: "rgba(17,24,39,0.45)",
        display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <div style={{ background: "var(--surface)", borderRadius: 10, width: "100%", maxWidth: 460,
        maxHeight: "92vh", display: "flex", flexDirection: "column", overflow: "hidden",
        boxShadow: "var(--naik-3)" }}>
        <header style={{ display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "16px 16px", borderBottom: `1px solid ${C.border}` }}>
          <h3 id="ovr-judul" style={{ margin: 0, fontSize: 15, fontWeight: 700, color: C.text }}>
            Harga khusus proyek
          </h3>
          <button onClick={onTutup} aria-label="Tutup"
            style={{ border: "none", background: "none", cursor: "pointer", color: C.mid,
              minWidth: 34, minHeight: 34 }}>✕</button>
        </header>

        <div style={{ padding: 16, overflowY: "auto", display: "grid", gap: 12 }}>
          <div>
            <label htmlFor="ovr-kode" style={gaya.label}>Resource</label>
            {terpilih ? (
              <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 12px",
                border: `1px solid ${C.border}`, borderRadius: 6, background: "var(--surface-subtle)" }}>
                <span style={{ flex: 1, fontSize: 13, color: C.text }}>
                  <strong>{terpilih.code}</strong> — {terpilih.name}
                  <span style={{ color: C.mid }}> / {terpilih.unit_code}</span>
                </span>
                <button
                  onClick={() => { setTerpilih(null); setCari(""); }}
                  style={{ ...btnGhost, minHeight: 30 }}
                >Ganti</button>
              </div>
            ) : (
              <>
                <input id="ovr-kode" ref={kodeRef} value={cari} style={gaya.input}
                  onChange={(e) => setCari(e.target.value)}
                  placeholder="Ketik nama material, upah, atau alat" />

                {tampilPilihan.length > 0 && (
                  <ul style={{ listStyle: "none", margin: "6px 0 0", padding: 0,
                    maxHeight: 168, overflowY: "auto", border: `1px solid ${C.border}`,
                    borderRadius: 6 }}>
                    {tampilPilihan.map((r) => (
                      <li key={r.id}>
                        <button
                          onClick={() => { setTerpilih(r); setPilihan([]); }}
                          style={{ width: "100%", textAlign: "left", padding: "8px 12px",
                            border: "none", background: "none", cursor: "pointer",
                            fontSize: 13, color: C.text, fontFamily: "inherit" }}
                        >
                          <strong>{r.code}</strong> — {r.name}
                          <span style={{ color: C.mid }}> / {r.unit_code}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
                {versiHasil > 0 && cari.trim().length >= 2 && tampilPilihan.length === 0 && (
                  <span style={gaya.bantu}>
                    Tak ada yang cocok. Harga khusus hanya bisa dipasang pada
                    resource yang sudah terdaftar — kalau memang baru, daftarkan
                    dulu di price book.
                  </span>
                )}
              </>
            )}
          </div>

          <div>
            <label htmlFor="ovr-harga" style={gaya.label}>Harga di proyek ini</label>
            <input id="ovr-harga" value={jumlah} style={gaya.input} inputMode="numeric"
              onChange={(e) => setJumlah(e.target.value)} placeholder="185000" />
          </div>

          <div>
            <label htmlFor="ovr-alasan" style={gaya.label}>Alasan</label>
            <textarea id="ovr-alasan" value={alasan} rows={2}
              style={{ ...gaya.input, minHeight: 62, resize: "vertical", lineHeight: 1.5 }}
              onChange={(e) => setAlasan(e.target.value)}
              placeholder="Lokasi terpencil, ongkos angkut pasir naik 40%" />
            <span style={gaya.bantu}>
              Ikut ditampilkan di rincian perhitungan tiap kali harga ini
              dipakai. Tulis sebabnya, bukan &ldquo;harga khusus&rdquo;.
            </span>
          </div>

          <div>
            <label htmlFor="ovr-berlaku" style={gaya.label}>
              Berlaku sejak <span style={{ fontWeight: 400, color: C.muted }}>(boleh dikosongkan)</span>
            </label>
            <input id="ovr-berlaku" type="date" value={berlaku} style={gaya.input}
              onChange={(e) => setBerlaku(e.target.value)} />
          </div>

          <div>
            <label htmlFor="ovr-catatan" style={gaya.label}>
              Catatan <span style={{ fontWeight: 400, color: C.muted }}>(boleh dikosongkan)</span>
            </label>
            <input id="ovr-catatan" value={catatan} style={gaya.input}
              onChange={(e) => setCatatan(e.target.value)} placeholder="Penawaran supplier 12 Jul" />
          </div>

          {err && <p style={{ margin: 0, fontSize: 12, color: C.red, lineHeight: 1.5 }}>{err}</p>}
        </div>

        <footer style={{ display: "flex", gap: 8, justifyContent: "flex-end", padding: "12px 16px",
          borderTop: `1px solid ${C.border}`, background: "var(--surface-subtle)" }}>
          <button onClick={onTutup} disabled={menyimpan}
            style={{ minHeight: 40, padding: "0 15px", borderRadius: 6, fontSize: 13,
              border: `1px solid ${C.border}`, background: "var(--surface)", color: C.mid,
              cursor: "pointer", fontFamily: "inherit" }}>Batal</button>
          <button onClick={() => void simpan()} disabled={menyimpan}
            style={{ minHeight: 40, padding: "0 15px", borderRadius: 6, fontSize: 13,
              border: "none", background: C.navy, color: C.onNavy, fontWeight: 600,
              cursor: "pointer", fontFamily: "inherit", opacity: menyimpan ? 0.6 : 1 }}>
            {menyimpan ? "Menyimpan…" : "Simpan"}
          </button>
        </footer>
      </div>
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
    <div style={{ ...GAYA_KARTU, marginBottom: 14, background: C.yellowBg, borderColor: C.yellow }}>
      <button onClick={() => setBuka(b => !b)} aria-expanded={buka}
        style={{ display: "flex", width: "100%", alignItems: "center", gap: 8,
                 padding: "12px var(--pad-kartu-lega)", background: "none", border: "none", cursor: "pointer",
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
        <div style={{ borderTop: `1px solid ${C.yellow}`, padding: "4px 12px 12px" }}>
          {/* Dipindahkan ke <Tabel> 2026-08-07 (UI-0-4) — caption sr-only,
              scope="row", tabular-nums, dan overflow-x dijamin komponen.

              `kepalaBaris` di Bahan / upah: nama bahannya yang menamai baris.
              Urutan data SENGAJA tetap urut dampak (berapa analisa terblokir),
              bukan abjad — lihat catatan di kepala komponen ini. `Tabel` tidak
              mengurutkan ulang, jadi urutan itu utuh. */}
          <Tabel<ResourceTanpaHarga>
            caption="Pemakaian bahan dan upah: nama, kategori, dan jumlah yang dipakai."
            data={data}
            kunciBaris={r => r.resource_id}
            kolom={[
              { kunci: "nama", judul: "Bahan / upah", kepalaBaris: true, render: r => (
                <>
                  {r.name}
                  <span style={{ color: C.muted, marginLeft: 6, fontSize: 11 }}>{r.unit_code}</span>
                </>
              ) },
              { kunci: "kategori", judul: "Kategori", render: r => <span style={{ color: C.mid }}>{r.category}</span> },
              { kunci: "dipakai", judul: "Dipakai", rata: "kanan", render: r => (
                <span style={{ fontFamily: "monospace" }}>{r.dipakai_analisa} analisa</span>
              ) },
              { kunci: "aksi", judul: "", render: r => (
                <button
                  aria-label={`Isi harga untuk ${r.name}`}
                  onClick={() => onIsi({ code: r.code, name: r.name, unit_code: r.unit_code })}
                  style={{ ...btnGhost, whiteSpace: "nowrap" }}
                >
                  <Plus size={13} /> Isi harga
                </button>
              ) },
            ]}
          />
          {total > data.length && (
            <p style={{ fontSize: 11, color: C.mid, margin: "8px 2px 0" }}>
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
      <input className="isian-fokus" style={GAYA_ISIAN} value={query} onChange={e => setQuery(e.target.value)} placeholder="ketik nama resource… mis. semen" />
      <select className="isian-fokus" aria-label="Pilih resource" style={{ ...GAYA_ISIAN, marginTop: 6 }} size={6} value={resourceCode} onChange={e => setResourceCode(e.target.value)}>
        {resources.map(r => <option key={r.code} value={r.code}>{r.name} ({r.code}, per {r.unit_code})</option>)}
        {resources.length === 0 && <option value="" disabled>— tidak ada hasil —</option>}
      </select>
      {label("Harga (Rp)")}
      <input className="isian-fokus" style={GAYA_ISIAN} type="number" min="0" step="any" value={amount} onChange={e => setAmount(e.target.value)} />
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
        <div>{label("Berlaku sejak")}
          <input className="isian-fokus" aria-label="Tanggal" style={GAYA_ISIAN} type="date" value={effective} onChange={e => setEffective(e.target.value)} /></div>
        <div>{label("Berlaku sampai (opsional)")}
          <input className="isian-fokus" aria-label="Tanggal" style={GAYA_ISIAN} type="date" value={expired} onChange={e => setExpired(e.target.value)} /></div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
        <div>{label("Lokasi (kosong = umum)")}
          <input className="isian-fokus" style={GAYA_ISIAN} value={location} onChange={e => setLocation(e.target.value)} placeholder="mis. Bandung" /></div>
        <div>{label("Tingkat keyakinan")}
          <select className="isian-fokus" aria-label="Tingkat keyakinan harga" style={GAYA_ISIAN} value={confidence} onChange={e => setConfidence(e.target.value as typeof confidence)}>
            <option value="">— tak ditentukan —</option>
            <option value="high">Tinggi (mis. penawaran resmi supplier)</option>
            <option value="medium">Sedang (mis. survei pasar)</option>
            <option value="low">Rendah (mis. perkiraan/estimasi)</option>
          </select></div>
      </div>
      {label("Supplier (opsional)")}
      <input className="isian-fokus" style={GAYA_ISIAN} value={supplier} onChange={e => setSupplier(e.target.value)} />
      {err && <p style={{ color: C.red, fontSize: 12 }}>{err}</p>}
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
      isi: "Edisi menentukan analisa NASIONAL mana yang dipakai (SE-47/2026, SE-68/2024, SNI-2013). Analisa perusahaan Anda selalu ikut tersedia — ia tak terikat edisi mana pun. Setelah versi keluar dari status draft, edisinya terkunci: angka yang sudah diajukan tak boleh berubah diam-diam.",
    },
    {
      n: 4, judul: "Tambah item pekerjaan",
      isi: "Pilih analisa dari katalog lalu isi volume; HSP dihitung dari koefisien × harga. Untuk pekerjaan tanpa analisa (lift, pompa, septictank) pakai mode Harga Langsung.",
    },
  ];

  return (
    <div style={{ border: `1px solid ${C.border}`, borderRadius: 10, padding: "16px 20px",
      background: C.surface, maxWidth: 720 }}>
      <h3 style={{ margin: "0 0 4px", fontSize: 15, fontWeight: 800, color: C.text,
        fontFamily: "var(--font-display, inherit)" }}>
        Menyusun RAB dari analisa AHSP
      </h3>
      <p style={{ margin: "0 0 16px", fontSize: 12, color: C.mid, lineHeight: 1.55 }}>
        Setiap rupiah di RAB yang disusun di sini bisa ditelusuri ke koefisien analisa
        dan harga sumbernya — berbeda dari RAB yang diunggah sebagai file Excel.
      </p>

      <ol style={{ margin: 0, padding: 0, listStyle: "none", display: "grid", gap: 12 }}>
        {langkah.map(l => (
          <li key={l.n} style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
            <span aria-hidden="true" style={{ flexShrink: 0, width: 24, height: 24, borderRadius: "50%",
              background: C.navy, color: C.onNavy, fontSize: 12, fontWeight: 700,
              display: "flex", alignItems: "center", justifyContent: "center" }}>
              {l.n}
            </span>
            <span>
              <span style={{ fontSize: 13, fontWeight: 700, color: C.text }}>{l.judul}</span>
              <span style={{ display: "block", fontSize: 12, color: C.mid, lineHeight: 1.55, marginTop: 2 }}>
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
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "flex-end", marginBottom: 16 }}>
        <div>
          <label htmlFor="cf-proyek" style={LBL}>Proyek</label>
          <select aria-label="Proyek" id="cf-proyek" value={projectId}
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
        <div role="alert" style={{ padding: "8px 12px", background: C.redBg, color: C.red,
          borderRadius: 6, fontSize: 13, marginBottom: 14 }}>{err}</div>
      )}

      {!versionId && !memuat && (
        <div style={{ padding: "40px 20px", textAlign: "center", color: C.muted, fontSize: 13,
          border: `1px dashed ${C.border}`, borderRadius: 10 }}>
          Pilih proyek dan versi estimasi untuk melihat proyeksi pencairan kas.
        </div>
      )}

      {memuat && <div style={{ padding: "var(--pad-kartu)", color: C.mid, fontSize: 13 }}>Memuat proyeksi…</div>}

      {data && !memuat && (
        <>
          {/* ── Penegasan sifat angka. Bukan hiasan: ini yang membedakan
                 "rencana" dari "kas nyata", dan salah baca di sini berujung
                 keputusan belanja yang keliru. ─────────────────────────── */}
          <div style={{ display: "flex", gap: 8, alignItems: "flex-start", padding: "8px 12px",
            background: C.yellowBg, borderRadius: 6, fontSize: 12, color: C.text, marginBottom: 14 }}>
            <Info size={15} style={{ color: C.yellow, flexShrink: 0, marginTop: 1 }} aria-hidden="true" />
            <span>
              <strong>Ini proyeksi rencana, bukan kas nyata.</strong> Angka diturunkan dari
              baseline estimasi {fmtRp(data.baseline_total)} yang disebar mengikuti kurva-S —
              pola yang sama dengan Kurva S progres. Realisasi kas sesungguhnya ada di menu Kas.
            </span>
          </div>

          {/* ── KPI ───────────────────────────────────────────────────────── */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
            gap: 8, marginBottom: 16 }}>
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
          <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10,
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
                    borderRadius: 6, fontSize: 12 }} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Area type="monotone" dataKey="cumulative" name="Kumulatif"
                  stroke="var(--navy)" fill="var(--navy)" fillOpacity={0.10} strokeWidth={2} />
                <Line type="monotone" dataKey="disbursement" name="Pencairan per periode"
                  stroke="var(--success)" strokeWidth={2} dot={false} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>

          {/* ── Tabel ─────────────────────────────────────────────────────────
              Dipindahkan ke <Tabel> 2026-08-07 (UI-0-4) — caption sr-only,
              scope="row", tabular-nums, dan pembungkus overflow-x dijamin
              komponen.

              `kepalaBaris` di Periode: di tabel proyeksi, nomor periodelah yang
              menamai baris — tiga kolom sisanya rupiah dan persen.

              Keterangan yang dulu jadi caption TERLIHAT (captionSide: top)
              dinaikkan jadi paragraf di atas tabel. Komponen memakai caption-nya
              sendiri untuk pembaca layar; menumpuk dua tak mungkin, dan kalimat
              itu memang ditulis untuk dibaca mata, bukan sebagai nama tabel.

              Baris total ditambahkan: invariant Σ pencairan = baseline PERSIS
              adalah janji yang diuji di API — menutup kolomnya di tfoot membuat
              janji itu terlihat, bukan hanya benar. ─────────────────────── */}
          <div style={{ border: `1px solid ${C.border}`, borderRadius: 10, overflow: "hidden" }}>
            <p style={{ margin: 0, padding: "8px 12px", fontSize: 12, color: C.mid, background: C.surface }}>
              Rincian pencairan per periode — kolom kumulatif berakhir persis di baseline.
            </p>
            <Tabel<CashflowPeriod>
              caption="Rincian pencairan kas per periode: nilai pencairan, kumulatif, dan persentasenya terhadap baseline."
              data={data.forecast}
              kunciBaris={p => String(p.period)}
              kolom={[
                { kunci: "periode", judul: "Periode", kepalaBaris: true, render: p => p.period },
                { kunci: "cair", judul: "Pencairan", rata: "kanan", render: p => fmtRp(Math.round(p.disbursement)) },
                { kunci: "kumulatif", judul: "Kumulatif", rata: "kanan", render: p => fmtRp(Math.round(p.cumulative)) },
                { kunci: "pct", judul: "% baseline", rata: "kanan", render: p => {
                  const pct = data.baseline_total > 0 ? (p.cumulative / data.baseline_total) * 100 : 0;
                  return <span style={{ color: C.mid }}>{pct.toFixed(1)}%</span>;
                } },
              ]}
              total={[
                { kunci: "label", isi: "Σ seluruh periode" },
                { kunci: "cair", isi: fmtRp(Math.round(data.baseline_total)), rata: "kanan" },
                { kunci: "kumulatif", isi: fmtRp(Math.round(data.baseline_total)), rata: "kanan" },
                { kunci: "pct", isi: "100,0%", rata: "kanan" },
              ]}
            />
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
  padding: "8px 8px", fontSize: 13, borderRadius: 6, border: `1px solid ${C.border}`,
  background: C.surface, color: C.text, minWidth: 200, minHeight: 38,
};
/* Gaya sel TH/TD dihapus 2026-08-07 (UI-0-4): seluruh tabel yang memakainya
   sudah pindah ke <Tabel>, yang membawa gaya selnya sendiri. Menyimpan
   keduanya berarti menyimpan cetak biru dialek tabel kedua — persis yang
   membuat delapan tabel "lewat komponen bersama" tetap punya delapan ritme
   sel berbeda sebelum ini. */

function KpiKas({ label, nilai, ket }: { label: string; nilai: string; ket?: string }) {
  return (
    <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10, padding: "12px var(--pad-kartu-lega)" }}>
      <div style={{ fontSize: 11, fontWeight: 600, color: C.mid, marginBottom: 4 }}>{label}</div>
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
  const [saran, setSaran] = useState<SaranResponse | null>(null);
  const [belanja, setBelanja] = useState<BelanjaAktual | null>(null);
  /** Kategori yang sedang diterapkan — tombolnya dikunci supaya tak ganda. */
  const [menerapkan, setMenerapkan] = useState<string | null>(null);
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
      const [p, v, sr, ba] = await Promise.all([
        api.get<CostMapResponse>(`/api/v1/projects/${pid}/cost-map`),
        api.get<VariansResponse>(`/api/v1/projects/${pid}/varians`),
        // Saran DIMUAT BERSAMA, bukan lewat tombol "cari saran": yang perlu
        // memetakan sedang melihat layar ini sekarang, dan tombol tambahan
        // hanya menambah satu langkah sebelum ia melihat bahwa bantuannya ada.
        api.get<SaranResponse>(`/api/v1/projects/${pid}/cost-map/saran`)
          // Saran adalah PELENGKAP. Kalau gagal, pemetaan manual tetap jalan —
          // menggagalkan seluruh tab karena usulannya tak termuat jauh lebih
          // merugikan daripada usulan yang absen.
          .catch(() => ({ data: null as SaranResponse | null })),
        // Belanja aktual dari SELURUH sumbernya, bukan `project_expenses` saja.
        // Sama seperti saran: gagal memuatnya tak boleh menggagalkan tab.
        api.get<BelanjaAktual>(`/api/v1/projects/${pid}/belanja-aktual`)
          .catch(() => ({ data: null as BelanjaAktual | null })),
      ]);
      setPeta(p.data); setVarians(v.data); setSaran(sr.data); setBelanja(ba.data);
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
        <select aria-label="Proyek" id="vr-proyek" value={projectId}
          onChange={e => { setProjectId(e.target.value); setPeta(null); setVarians(null); }}
          style={SEL}>
          <option value="">— pilih proyek —</option>
          {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
      </div>

      {err && (
        <div role="alert" style={{ padding: "8px 12px", background: C.redBg, color: C.red,
          borderRadius: 6, fontSize: 13, marginBottom: 14 }}>{err}</div>
      )}

      {!projectId && !memuat && (
        <div style={{ padding: "40px 20px", textAlign: "center", color: C.muted, fontSize: 13,
          border: `1px dashed ${C.border}`, borderRadius: 10 }}>
          Pilih proyek untuk melihat belanja nyata dikelompokkan per Cost Code.
        </div>
      )}

      {memuat && <div style={{ padding: "var(--pad-kartu)", color: C.mid, fontSize: 13 }}>Memuat…</div>}

      {varians && peta && !memuat && (
        <>
          {/* ── Peringatan pemetaan. Ditaruh PALING ATAS karena selama peta
                 kosong, seluruh belanja jatuh ke satu baris "belum dipetakan"
                 dan laporannya belum berguna. Ini bukan error — ini pekerjaan
                 yang menunggu, dan pengguna berhak tahu persis berapa. ─── */}
          {peta.belum_dipetakan > 0 && (
            <div style={{ display: "flex", gap: 8, alignItems: "flex-start", padding: "12px var(--pad-kartu-lega)",
              background: C.yellowBg, borderRadius: 6, fontSize: 12, color: C.text, marginBottom: 14 }}>
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
            gap: 8, marginBottom: 16 }}>
            {/* Belanja aktual dari SELURUH sumbernya.
                
                Sebelum 2026-08-08 kartu ini membaca `total_actual` — yang
                bersumber dari `project_expenses`, tabel yang NOL BARIS. Ia
                menampilkan "Rp 0" tepat di sebelah "Commitment Rp 11 juta",
                dan itu terbaca sebagai "proyek ini belum belanja apa-apa"
                padahal Rp 243 juta upah dan Rp 50 juta faktur sudah keluar.
                
                Angka yang salah lebih berbahaya daripada angka yang absen:
                yang absen membuat orang bertanya, yang salah membuat orang
                memutuskan. */}
            <KpiKas
              label="Belanja aktual"
              nilai={fmtRp(belanja?.total ?? m?.total_actual ?? 0)}
              ket={belanja
                ? [
                    belanja.per_sumber.upah > 0 ? `upah ${fmtRp(belanja.per_sumber.upah)}` : null,
                    belanja.per_sumber.faktur > 0 ? `faktur ${fmtRp(belanja.per_sumber.faktur)}` : null,
                    belanja.per_sumber.belanja > 0 ? `belanja ${fmtRp(belanja.per_sumber.belanja)}` : null,
                  ].filter(Boolean).join(" · ") || "belum ada yang tercatat"
                : "expense approved/paid"}
            />
            <KpiKas label="Commitment (PO)" nilai={fmtRp(belanja?.komitmen ?? m?.commitment_total ?? 0)}
              ket={`${m?.jumlah_po_mengikat ?? 0} PO mengikat — uang belum keluar`} />
            <KpiKas label="Exposure" nilai={fmtRp(belanja?.exposure ?? m?.exposure_total ?? 0)}
              ket="aktual + commitment" />
            <KpiKas label="Kategori dipetakan"
              nilai={`${m?.kategori_dipetakan ?? 0} / ${m?.kategori_total ?? 0}`}
              ket="makin lengkap, makin tajam laporannya" />
          </div>

          {/* Dari mana belanja aktual berasal — dan apa yang TIDAK ikut.
              
              Angka gabungan tanpa asal-usulnya tak bisa diperiksa siapa pun.
              Yang menunggu persetujuan disebut terpisah supaya jelas ia
              BUKAN bagian dari total: laporan tak boleh berubah saat sesuatu
              ditolak. */}
          {belanja && (
            <div style={{ display: "flex", gap: 8, alignItems: "flex-start", padding: "8px 12px",
              background: C.bg, border: `1px solid ${C.border}`, borderRadius: 6,
              fontSize: 12, color: C.mid, marginBottom: 10, lineHeight: 1.55 }}>
              <Info size={14} style={{ flexShrink: 0, marginTop: 2 }} aria-hidden="true" />
              <span>
                Belanja aktual dihitung dari <strong>upah mingguan terbayar</strong>,{" "}
                <strong>faktur supplier terbit</strong>, dan{" "}
                <strong>belanja proyek disetujui</strong> — tiga tabel tempat biaya
                benar-benar tercatat, bukan dari satu tabel saja.
                {belanja.menunggu > 0 && (
                  <> Ada <strong>{fmtRp(belanja.menunggu)}</strong> yang menunggu
                  persetujuan dan sengaja <em>belum</em> dihitung, supaya angkanya
                  tak berubah saat ditolak.</>
                )}
                {belanja.nilai_cacat > 0 && (
                  // Baris bernilai tak terbaca DINYATAKAN, bukan ditelan. Satu
                  // nilai NaN di `numeric` meracuni SUM seluruh laporan; yang
                  // dilewati harus terlihat supaya bisa diperbaiki.
                  <> <span style={{ color: "var(--warning-teks)" }}>
                    {belanja.nilai_cacat} baris nilainya tak terbaca dan dilewati.
                  </span></>
                )}
              </span>
            </div>
          )}

          {/* ── Kenapa kolom pagu & commitment per baris kosong ──────────── */}
          <div style={{ display: "flex", gap: 8, alignItems: "flex-start", padding: "8px 12px",
            background: C.bg, border: `1px solid ${C.border}`, borderRadius: 6,
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
          {/* Dipindahkan ke <Tabel> 2026-08-07 (UI-0-4) — caption sr-only,
              scope="row", tabular-nums, dan overflow-x dijamin komponen.

              `kepalaBaris` di Cost Code: nama posnya yang menamai baris (dan
              kodenya ikut di baris kedua sel yang sama). Empat kolom sisanya
              rupiah — dibacakan tanpa nama pos, tak satu pun bisa ditempatkan.

              Keterangan yang dulu <caption> TERLIHAT dinaikkan jadi paragraf di
              atas tabel, sama seperti tabel proyeksi kas; nama tabel bagi pembaca
              layar kini di prop `caption`.

              Pesan "belum ada belanja" pindah ke prop `kosong` — sebagai
              <td colSpan> di <tbody> ia dibacakan seolah nama sebuah baris data,
              padahal isinya penjelasan empat kalimat. */}
          <div style={{ border: `1px solid ${C.border}`, borderRadius: 10, overflow: "hidden", marginBottom: 20 }}>
            <p style={{ margin: 0, padding: "8px 12px", fontSize: 12, color: C.mid, background: C.surface }}>
              Belanja nyata dikelompokkan per Cost Code — urut exposure terbesar.
            </p>
            <Tabel<VariansBaris>
              caption="Belanja nyata per Cost Code: nilai aktual, pagu, sisa anggaran, dan jumlah kategori belanja di bawahnya."
              data={varians.data}
              kunciBaris={b => b.cost_code_id ?? "unmapped"}
              kosong={
                /* Kalimat kosong ini pernah MEMBANTAH kartu di atasnya.
                   
                   Terlihat saat menilai tangkapan layar 2026-08-08: kartu
                   menyatakan "Belanja aktual Rp 168.165.100" dan tepat di
                   bawahnya tabel berbunyi "Belum ada belanja di proyek ini".
                   Keduanya benar menurut sumbernya sendiri — tabel ini hanya
                   melihat `project_expenses` yang nol baris — tapi pembacanya
                   tak tahu itu, dan yang ia lihat adalah kontradiksi.
                   
                   Yang salah bukan angkanya, melainkan kalimat yang mengaku
                   bicara tentang "proyek ini" padahal bicara tentang satu
                   tabel. */
                <div style={{ padding: "var(--pad-kartu)", textAlign: "center", color: C.muted, fontSize: 13, lineHeight: 1.6 }}>
                  {belanja && belanja.total > 0 ? (
                    <>
                      <p style={{ margin: "0 0 8px", color: C.text, fontWeight: 600 }}>
                        Belanja proyek ini {fmtRp(belanja.total)} — tapi belum bisa
                        dipecah per Cost Code.
                      </p>
                      <p style={{ margin: 0 }}>
                        Upah dan faktur supplier tidak menyimpan Cost Code, jadi
                        menaruhnya di baris mana pun adalah menebak. Tabel ini hanya
                        memuat belanja yang lewat kategori belanja proyek — dan itu
                        yang belum ada.
                      </p>
                    </>
                  ) : (
                    <p style={{ margin: 0 }}>
                      Belum ada belanja berstatus approved atau paid di proyek ini.
                      Varians membandingkan anggaran dengan belanja yang SUDAH
                      disetujui — belanja yang masih menunggu persetujuan sengaja
                      tak dihitung, supaya angkanya tak berubah saat ditolak.
                    </p>
                  )}
                </div>
              }
              kolom={[
                { kunci: "kode", judul: "Cost Code", kepalaBaris: true, render: b => {
                  const belum = b.cost_code_id === null;
                  return (
                    <>
                      <div style={{ fontWeight: belum ? 500 : 600, color: belum ? C.yellow : C.text }}>{b.name}</div>
                      {!belum && <div style={{ fontSize: 11, color: C.muted }}>{b.code}</div>}
                    </>
                  );
                } },
                { kunci: "aktual", judul: "Aktual", rata: "kanan", render: b => fmtRp(b.actual) },
                { kunci: "pagu", judul: "Pagu", rata: "kanan", render: b => (
                  <span style={{ color: C.muted }}>{b.variance === null ? "—" : fmtRp(b.pagu)}</span>
                ) },
                { kunci: "sisa", judul: "Sisa", rata: "kanan", render: b => (
                  <span style={{ color: b.variance === null ? C.muted : b.variance < 0 ? C.red : C.green }}>
                    {b.variance === null ? "—" : fmtRp(b.variance)}
                  </span>
                ) },
                { kunci: "kategori", judul: "Kategori", rata: "kanan", render: b => (
                  <span style={{ color: C.mid }}>{b.jumlah_kategori}</span>
                ) },
              ]}
              total={varians.data.length > 0 ? [
                { kunci: "label", isi: "Total belanja aktual" },
                { kunci: "aktual", isi: fmtRp(m?.total_actual ?? 0), rata: "kanan" },
                { kunci: "pagu", isi: "", rentang: 3 },
              ] : undefined}
            />
          </div>

          {/* ── Alat pemetaan ─────────────────────────────────────────────── */}
          <div style={{ border: `1px solid ${C.border}`, borderRadius: 10, overflow: "hidden" }}>
            <button type="button" onClick={() => setBukaPeta(v => !v)}
              aria-expanded={bukaPeta}
              style={{ width: "100%", display: "flex", alignItems: "center", gap: 8, padding: "12px var(--pad-kartu-lega)",
                background: C.surface, border: "none", cursor: "pointer", fontSize: 13,
                fontWeight: 700, color: C.text, textAlign: "left" }}>
              {bukaPeta ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
              Pemetaan kategori belanja → Cost Code
              <span style={{ fontWeight: 500, color: C.mid, fontSize: 12 }}>
                ({peta.data.length - peta.belum_dipetakan}/{peta.data.length} terpetakan)
              </span>
            </button>

            {bukaPeta && (
              /* Dipindahkan ke <Tabel> 2026-08-07 (UI-0-4) — caption sr-only,
                 scope="row", tabular-nums, dan overflow-x dijamin komponen.

                 `kepalaBaris` di Kategori belanja: nama kategorinya yang menamai
                 baris. Kolom satunya bukan data sama sekali melainkan dropdown
                 pemetaan — dipakai sebagai nama baris, pembaca layar akan
                 membacakan isi dropdown sebagai identitas barisnya. Label
                 tersembunyi per-dropdown tetap dipertahankan: ia menyebut kategori
                 mana yang sedang dipetakan, dan itu yang membuat kontrolnya bisa
                 dipakai tanpa melihat kolom di sebelahnya.

                 (Nama tag HTML-nya sengaja TIDAK ditulis di komentar ini: penjaga
                 aksesibilitas memindai teks berkas dan membaca tag di dalam
                 komentar sebagai kontrol sungguhan yang tak bernama — pola yang
                 sudah didokumentasikan di `gayaInput`, components/dasar.tsx.) */
              <div style={{ borderTop: `1px solid ${C.border}` }}>
                {/* ── USULAN, bukan penerapan ──────────────────────────────
                    Pemetaan ini menentukan ke cost code mana biaya jatuh, dan
                    itu mengalir ke laporan varians yang dipakai menilai
                    untung-rugi. Karena itu tiap usul disetujui SATU PER SATU,
                    dengan skornya terlihat — bukan tombol "terapkan semua"
                    yang membuat orang menyetujui sepuluh tebakan sekaligus
                    tanpa membaca satu pun.

                    Endpointnya pun GET dan sudah dibuktikan tak menulis
                    (test `TIDAK MENULIS apa pun ke basis`). */}
                {saran && saran.saran.length > 0 && (
                  <div style={{
                    padding: "12px", borderBottom: `1px solid ${C.border}`,
                    background: C.subtle,
                  }}>
                    <div style={{ display: "flex", alignItems: "baseline", gap: 8, flexWrap: "wrap", marginBottom: 8 }}>
                      <strong style={{ fontSize: 12.5, color: C.text }}>
                        {saran.saran.length} usulan pemetaan
                      </strong>
                      <span style={{ fontSize: 11.5, color: C.mid }}>
                        dari kemiripan nama. Periksa dulu, lalu setujui satu per satu.
                        {saran.tanpa_saran > 0 && (
                          <> {saran.tanpa_saran} kategori tak punya usulan dan tetap manual.</>
                        )}
                      </span>
                    </div>

                    <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: 6 }}>
                      {saran.saran.map((u) => (
                        <li key={u.category_id} style={{
                          display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap",
                          padding: "8px 10px", background: C.surface,
                          border: `1px solid ${C.border}`, borderRadius: 6, fontSize: 12.5,
                        }}>
                          <span style={{ color: C.text, fontWeight: 600 }}>{u.category_name}</span>
                          <span aria-hidden="true" style={{ color: C.muted }}>&rarr;</span>
                          <span style={{ color: C.text }}>
                            {u.cost_code_name}
                            <span style={{ color: C.muted, fontSize: 11 }}> · {u.cost_code_code}</span>
                          </span>

                          {/* Skor sebagai KATA, bukan angka telanjang. "0,46"
                              tak berarti apa pun bagi yang menyetujuinya;
                              "perlu diperiksa" berarti. Angkanya tetap ada di
                              title untuk yang ingin tahu persis. */}
                          <span
                            title={`Skor kemiripan ${u.skor}`}
                            style={{
                              marginLeft: "auto", fontSize: 11, fontWeight: 700,
                              padding: "2px 8px", borderRadius: 999,
                              color: u.skor >= 0.8 ? "var(--success)" : "var(--warning-teks)",
                              background: u.skor >= 0.8 ? "var(--success-bg)" : "var(--warning-bg)",
                              border: `1px solid ${u.skor >= 0.8 ? "var(--success-border)" : "var(--warning-border)"}`,
                            }}
                          >
                            {u.skor >= 0.8 ? "cocok jelas" : "perlu diperiksa"}
                          </span>

                          {/* Tombol yang YAKIN penuh hanya untuk usulan yang
                              yakin. Versi pertama memberi navy pekat pada
                              keenam barisnya, dan sederet enam ajakan
                              sama-kuat membaca sebagai "tekan semua" —
                              justru borongan diam-diam yang dihindari modul
                              ini, hanya dipindah ke jari pemakainya.

                              Yang "perlu diperiksa" turun jadi sekunder:
                              tetap sepenuhnya bisa ditekan, tapi tak
                              mengundang. Bebannya pindah ke yang layak
                              menanggung, yakni yang ragu. */}
                          <button
                            type="button"
                            disabled={menerapkan === u.category_id}
                            onClick={async () => {
                              setMenerapkan(u.category_id);
                              try { await simpanPeta(u.category_id, u.cost_code_id); }
                              finally { setMenerapkan(null); }
                            }}
                            style={{
                              // 40px, bukan 34: ini tombol yang MENULIS ke
                              // basis, dan target sentuh yang terlalu kecil
                              // membuat orang salah tekan usulan di
                              // sebelahnya. Tak sampai 44 karena baris
                              // usulannya sendiri padat; 40 kompromi yang
                              // terukur, bukan angka yang kebetulan.
                              padding: "9px 14px", borderRadius: 6, fontSize: 12,
                              fontWeight: 700, minHeight: 40, marginLeft: 4,
                              border: u.skor >= 0.8 ? "none" : `1px solid ${C.navy}`,
                              background: menerapkan === u.category_id
                                ? C.border
                                : u.skor >= 0.8 ? C.navy : "transparent",
                              color: menerapkan === u.category_id
                                ? C.mid
                                : u.skor >= 0.8 ? "var(--on-navy)" : C.navy,
                              cursor: menerapkan === u.category_id ? "not-allowed" : "pointer",
                            }}
                          >
                            {menerapkan === u.category_id ? "Menerapkan…" : "Terapkan"}
                          </button>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                <Tabel<CostMapBaris>
                  caption="Pemetaan kategori belanja ke cost code."
                  data={peta.data}
                  kunciBaris={k => k.category_id}
                  kolom={[
                    { kunci: "kategori", judul: "Kategori belanja", kepalaBaris: true, render: k => (
                      <>
                        {k.category_name}
                        {k.type && <span style={{ fontSize: 11, color: C.muted }}> · {k.type}</span>}
                      </>
                    ) },
                    { kunci: "costcode", judul: "Cost Code", render: k => (
                      <>
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
                      </>
                    ) },
                  ]}
                />
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

// Nilai sah untuk `?tab=` DITURUNKAN dari TABS, bukan disalin. Daftar kedua
// yang disalin tangan akan menyimpang begitu satu tab ditambah.
const TAB_SAH = TABS.map((t) => t.key);

/**
 * `useTabUrl` memakai `useSearchParams`, yang memaksa render sisi klien —
 * Next menuntut batas Suspense untuk itu, kalau tidak `pnpm build` gagal
 * saat prerender.
 */
export default function EstimasiPage() {
  return (
    <Suspense fallback={null}>
      <IsiEstimasi />
    </Suspense>
  );
}

function IsiEstimasi() {
  // Tab hidup di URL: itu yang membuat "Price Book", "Analisa Varians", dan
  // "Cost Code / CBS" bisa menunjuk tab yang mereka janjikan, alih-alih
  // sama-sama mendarat di Komposer.
  const [tab, setTab] = useTabUrl<(typeof TABS)[number]["key"]>(TAB_SAH, "komposer");
  // Lebar `--w-luas` (E11): tabel di sini padat kolom — katalog, harga,
  // varians — jadi ia masuk kelompok "luas" bersama procurement/piutang/
  // laporan, bukan `--w-page` yang dipakai halaman berkartu.
  // Catatan lama di sini ("satu-satunya yang tak punya margin auto") sudah
  // tidak berlaku: 13 halaman ternyata bernasib sama, dan semuanya kini
  // memakai token yang sama. Lihat komentar --w-* di globals.css.
  return (
    <div style={{ padding: "var(--pad-atas) var(--pad-x) var(--pad-bawah)", width: "100%", maxWidth: "var(--w-luas)", margin: "0 auto" }}>
      <div style={{ marginBottom: 4 }}>
        <KepalaHalaman judul="Estimasi" keterangan="RAB dari analisa AHSP ber-edisi × price book — setiap rupiah bisa ditelusuri ke koefisien &amp; harga sumbernya." />
      </div>
      {/* Komponen BERSAMA — gaya tab tak lagi ditulis per halaman. */}
      <TabBagian
        label="Bagian estimasi"
        aktif={tab}
        onPilih={setTab}
        bagian={TABS.map((t) => {
          const Ikon = t.icon;
          return { kunci: t.key, label: t.label, ikon: <Ikon size={14} aria-hidden="true" /> };
        })}
      />
      {tab === "komposer" && <KomposerTab />}
      {tab === "katalog" && <KatalogTab />}
      {tab === "harga" && <HargaTab />}
      {tab === "rap" && <RapTab />}
      {tab === "cashflow" && <CashflowTab />}
      {tab === "varians" && <VariansTab />}
    </div>
  );
}
