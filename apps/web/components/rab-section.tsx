"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Upload, BarChart2, ChevronDown, ChevronRight, RefreshCw, Percent, CheckCircle } from "lucide-react";
import { api } from "@/lib/api";
import { dapatDitekan, dapatDitekanTerpisah } from "@/lib/dapat-ditekan";

// ─── Types ───────────────────────────────────────────────────────────────────

interface RabItem {
  id: string;
  project_id: string;
  level: "category" | "subcategory" | "item";
  category_code: string | null;
  parent_id: string | null;
  name: string;
  unit: string | null;
  qty: number | null;
  unit_price: number | null;
  total_price: number | null;
  weight_pct: number;
  progress_pct: number;
  material_pct: number;
  upah_pct: number;
  alat_pct: number;
  other_pct: number;
  komponen_set: boolean;
  sort_order: number;
}

interface Props {
  projectId: string;
  userRole?: string;
  hideHeader?: boolean;
  onSerapanUpdated?: () => void;
  onOverallSerapanChange?: (pct: number) => void;
  serapanRefreshKey?: number;
}

// ─── Design tokens ────────────────────────────────────────────────────────────

import { C } from "@/lib/warna-ui";

const fmt = (n: number) =>
  new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(n);

const fmtCompact = (n: number) => {
  if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(1)}M`;
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}Jt`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`;
  return n.toString();
};

// ─── Progress bar ─────────────────────────────────────────────────────────────

function ProgressBar({ pct, color = C.navy }: { pct: number; color?: string }) {
  return (
    <div style={{ height: 6, borderRadius: 0, background: "var(--border)", overflow: "hidden" }}>
      <div style={{
        height: "100%", borderRadius: 0,
        width: `${Math.min(100, Math.max(0, pct))}%`,
        background: pct >= 100 ? C.green : pct >= 60 ? color : pct >= 30 ? C.yellow : C.red,
        transition: "width 0.4s ease",
      }} />
    </div>
  );
}

// ─── Komponen biaya mini bar ──────────────────────────────────────────────────

function KomponenBar({ mat, upah, alat, other }: { mat: number; upah: number; alat: number; other: number }) {
  const total = mat + upah + alat + other;
  if (total === 0) return null;
  return (
    <div style={{ display: "flex", height: 5, borderRadius: 0, overflow: "hidden", gap: 0 }}>
      {mat > 0 && <div style={{ flex: mat, background: "var(--info)" }} title={`Material ${mat}%`} />}
      {upah > 0 && <div style={{ flex: upah, background: "var(--success)" }} title={`Upah ${upah}%`} />}
      {alat > 0 && <div style={{ flex: alat, background: "var(--warning)" }} title={`Alat ${alat}%`} />}
      {other > 0 && <div style={{ flex: other, background: "var(--aksen)" }} title={`Lain ${other}%`} />}
    </div>
  );
}


/**
 * Sel yang isinya interaktif (input serapan, tombol komponen) di dalam baris
 * yang BISA DILIPAT. Kliknya tak boleh menembus ke baris induk.
 *
 * ⚠️ `onKeyDown` ikut dihentikan, dan itu BUKAN kelebihan hati-hati. Sejak
 * baris induk dijadikan `role="button"` dengan penanganan Enter/Space, menekan
 * Space di dalam kotak angka akan menembus ke induknya dan MELIPAT barisnya di
 * tengah orang mengetik. Menambahkan aksesibilitas ke induk menciptakan jalur
 * baru yang sebelumnya tak ada — jadi penghalangnya harus ikut diperlebar.
 *
 * Bukan `role="button"`: ini pembungkus pasif, tak melakukan apa pun sendiri.
 * Menandainya tombol akan membuat pembaca layar mengumumkan tombol yang tak
 * bisa ditekan.
 */
const tanpaTembus = {
  onClick: (e: React.MouseEvent) => e.stopPropagation(),
  onKeyDown: (e: React.KeyboardEvent) => e.stopPropagation(),
} as const

// ─── Main component ───────────────────────────────────────────────────────────

export function RabSection({ projectId, userRole, hideHeader = false, onSerapanUpdated, onOverallSerapanChange, serapanRefreshKey }: Props) {
  const [items, setItems] = useState<RabItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [uploadMsg, setUploadMsg] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  // serapanMap: item_id → serapan kumulatif % (dari absorption_log)
  const [serapanMap, setSerapanMap] = useState<Record<string, number>>({});
  const [editingSerapan, setEditingSerapan] = useState<Record<string, string>>({});
  const [editingKomponen, setEditingKomponen] = useState<Record<string, { mat: string; upah: string; alat: string; other: string }>>({});
  const [savingId, setSavingId] = useState<string | null>(null);
  const [showKomponen, setShowKomponen] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const canEdit = userRole === "admin" || userRole === "pm";

  const loadSerapan = useCallback(async () => {
    try {
      const res = await api.get<{ data: Record<string, number> }>(`/api/v1/projects/${projectId}/absorption/summary`);
      setSerapanMap(res.data.data ?? {});
    } catch {
      // silent — serapan optional
    }
  }, [projectId]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [rabRes] = await Promise.all([
        api.get<{ data: RabItem[] }>(`/api/v1/projects/${projectId}/rab`),
        loadSerapan(),
      ]);
      setItems(rabRes.data.data ?? []);
    } catch {
      setError("Gagal memuat data RAB");
    } finally {
      setLoading(false);
    }
  }, [projectId, loadSerapan]);

  // `queueMicrotask`, bukan panggilan langsung: `load()` menyetel state
  // pemuatan di baris pertamanya, dan setState SINKRON di dalam effect memicu
  // render kedua sebelum yang pertama selesai (react-hooks/set-state-in-effect).
  // Menunda satu microtask memindahkannya keluar dari fase render tanpa
  // menambah jeda yang terlihat.
  useEffect(() => { queueMicrotask(() => { void load(); }); }, [load]);
  useEffect(() => { if (serapanRefreshKey) loadSerapan(); }, [serapanRefreshKey, loadSerapan]);

  // ── Upload ────────────────────────────────────────────────────────────────

  async function handleUpload(file: File) {
    setUploading(true);
    setError(null);
    setUploadMsg(null);
    const formData = new FormData();
    formData.append("file", file);
    try {
      const res = await api.post<{ data: RabItem[]; message: string }>(
        `/api/v1/projects/${projectId}/rab/upload`,
        formData,
        { headers: { "Content-Type": "multipart/form-data" } }
      );
      setItems(res.data.data ?? []);
      setUploadMsg(res.data.message ?? "Upload berhasil");
      setTimeout(() => setUploadMsg(null), 5000);
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { error?: string } } })?.response?.data?.error;
      setError(msg ?? "Gagal upload file RAB");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file) handleUpload(file);
  }

  // ── Serapan dana update (dari kolom inline di tabel RAB) ─────────────────
  // Simpan sebagai absorption log minggu ini, distribusikan ke komponen proporsional

  async function saveSerapan(item: RabItem) {
    const raw = editingSerapan[item.id];
    const newTotal = raw !== undefined ? parseFloat(raw) : (serapanMap[item.id] ?? 0);
    if (isNaN(newTotal) || newTotal < 0 || newTotal > 100) return;

    const currentTotal = serapanMap[item.id] ?? 0;
    if (Math.abs(newTotal - currentTotal) < 0.01) {
      setEditingSerapan(prev => { const n = { ...prev }; delete n[item.id]; return n; });
      return;
    }

    setSavingId(item.id);
    try {
      const today = new Date().toISOString().split("T")[0];
      // Kirim total_pct absolut — server yang hitung delta dan distribusi komponen
      // agar tidak ada race condition jika user save lebih dari sekali
      await api.post(`/api/v1/projects/${projectId}/absorption`, {
        rab_item_id: item.id,
        week_start: today,
        total_pct: newTotal,
        notes: "Input dari RAB section",
      });

      setSerapanMap(prev => ({ ...prev, [item.id]: newTotal }));
      setEditingSerapan(prev => { const n = { ...prev }; delete n[item.id]; return n; });
      onSerapanUpdated?.();
    } catch {
      setError("Gagal menyimpan serapan dana");
    } finally {
      setSavingId(null);
    }
  }

  // (`refreshSerapan` dihapus 2026-08-01: mekanisme refresh dari luar sekarang
  //  lewat prop `serapanRefreshKey` — lihat efek di atas. Fungsi lama tak punya
  //  pemanggil dan tak bisa punya: ia tak pernah diekspos ke parent.)

  // ── Komponen biaya update ─────────────────────────────────────────────────

  function startEditKomponen(item: RabItem) {
    setEditingKomponen(prev => ({
      ...prev,
      [item.id]: {
        mat: item.material_pct > 0 ? String(item.material_pct) : "",
        upah: item.upah_pct > 0 ? String(item.upah_pct) : "",
        alat: item.alat_pct > 0 ? String(item.alat_pct) : "",
        other: item.other_pct > 0 ? String(item.other_pct) : "",
      },
    }));
  }

  async function saveKomponen(item: RabItem) {
    const k = editingKomponen[item.id];
    if (!k) return;
    const mat = parseFloat(k.mat || "0");
    const upah = parseFloat(k.upah || "0");
    const alat = parseFloat(k.alat || "0");
    const other = parseFloat(k.other || "0");
    const total = mat + upah + alat + other;
    if (total !== 0 && (total < 99.9 || total > 100.1)) {
      setError(`Total komponen biaya harus 100% (sekarang ${total.toFixed(1)}%)`);
      return;
    }
    setSavingId(item.id + "_k");
    try {
      await api.patch(`/api/v1/projects/${projectId}/rab/${item.id}`, {
        material_pct: mat, upah_pct: upah, alat_pct: alat, other_pct: other,
      });
      setItems(prev => prev.map(it =>
        it.id === item.id
          ? { ...it, material_pct: mat, upah_pct: upah, alat_pct: alat, other_pct: other, komponen_set: total > 0 }
          : it
      ));
      setEditingKomponen(prev => { const n = { ...prev }; delete n[item.id]; return n; });
      setError(null);
    } catch {
      setError("Gagal menyimpan komponen biaya");
    } finally {
      setSavingId(null);
    }
  }

  function toggleCollapse(id: string) {
    setCollapsed(prev => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id); else n.add(id);
      return n;
    });
  }

  // ── Derived ────────────────────────────────────────────────────────────────

  const categories = items.filter(it => it.level === "category");
  const totalRab = categories.reduce((s, it) => s + (it.total_price ?? 0), 0);

  // Serapan dana keseluruhan proyek = weighted avg serapan per item
  const leafItems = items.filter(it => it.level === "item");
  const overallSerapan = totalRab > 0
    ? leafItems.reduce((sum, it) => {
        const serapan = serapanMap[it.id] ?? 0;
        return sum + ((it.total_price ?? 0) / totalRab) * serapan;
      }, 0)
    : 0;

  // Notify parent whenever overallSerapan changes (setelah items & serapanMap loaded)
  useEffect(() => {
    if (items.length > 0) onOverallSerapanChange?.(parseFloat(overallSerapan.toFixed(1)));
  }, [overallSerapan, items.length, onOverallSerapanChange]);

  // Komponen biaya summary dari items (level=item) yang sudah diset
  const itemsWithKomponen = items.filter(it => it.level === "item" && it.komponen_set);
  const komponenSummary = itemsWithKomponen.reduce(
    (acc, it) => {
      const v = it.total_price ?? 0;
      acc.mat += v * it.material_pct / 100;
      acc.upah += v * it.upah_pct / 100;
      acc.alat += v * it.alat_pct / 100;
      acc.other += v * it.other_pct / 100;
      return acc;
    },
    { mat: 0, upah: 0, alat: 0, other: 0 }
  );
  const komponenTotal = komponenSummary.mat + komponenSummary.upah + komponenSummary.alat + komponenSummary.other;

  // ── Helper: ambil semua leaf items di bawah suatu container ────────────────

  function getLeafItems(containerId: string): RabItem[] {
    const result: RabItem[] = [];
    const directChildren = items.filter(it => it.parent_id === containerId);
    for (const child of directChildren) {
      const hasChildren = items.some(it => it.parent_id === child.id);
      if (!hasChildren) {
        // True leaf: tidak punya children apapun (termasuk item-container)
        result.push(child);
      } else {
        result.push(...getLeafItems(child.id));
      }
    }
    return result;
  }

  function getWeightedSerapan(leafItems: RabItem[]): number {
    const total = leafItems.reduce((s, it) => s + (it.total_price ?? 0), 0);
    if (total === 0) return 0;
    return leafItems.reduce((s, it) => s + ((it.total_price ?? 0) / total) * (serapanMap[it.id] ?? 0), 0);
  }

  // Simpan serapan untuk container: set semua leaf items ke nilai yang sama
  // Server yang handle distribusi komponen dan idempotency per leaf
  async function saveContainerSerapan(containerId: string, leafList: RabItem[]) {
    const raw = editingSerapan[containerId];
    const newPct = raw !== undefined ? parseFloat(raw) : 0;
    if (isNaN(newPct) || newPct < 0 || newPct > 100) return;

    const today = new Date().toISOString().split("T")[0];
    setSavingId(containerId);

    try {
      // Jalankan semua request paralel, skip leaf yang sudah di nilai yang sama
      await Promise.all(
        leafList
          .filter(leaf => Math.abs((serapanMap[leaf.id] ?? 0) - newPct) >= 0.01)
          .map(leaf =>
            api.post(`/api/v1/projects/${projectId}/absorption`, {
              rab_item_id: leaf.id,
              week_start: today,
              total_pct: newPct,
              notes: "Input dari RAB section (container)",
            })
          )
      );

      // Update serapanMap untuk semua leaf sekaligus
      setSerapanMap(prev => {
        const next = { ...prev };
        for (const leaf of leafList) next[leaf.id] = newPct;
        return next;
      });
      setEditingSerapan(prev => { const n = { ...prev }; delete n[containerId]; return n; });
      onSerapanUpdated?.();
    } catch {
      setError("Gagal menyimpan serapan dana");
    } finally {
      setSavingId(null);
    }
  }

  // ── Render serapan dana cell (kolom "Serapan" di tabel RAB) ─────────────────
  // Kategori & subcategory: editable → distribusi ke semua leaf items di bawahnya
  // Item leaf: editable langsung

  function renderSerapanCell(item: RabItem) {
    const isLeaf = item.level === "item";
    const leafList = isLeaf ? [] : getLeafItems(item.id);
    const currentSerapan = isLeaf
      ? (serapanMap[item.id] ?? 0)
      : getWeightedSerapan(leafList);

    const editVal = editingSerapan[item.id];
    const isEditing = editVal !== undefined;
    const isDirty = isEditing && editVal !== currentSerapan.toFixed(1);
    const isSaving = savingId === item.id;
    const hasLeaves = leafList.length > 0;

    // Non-editable view for non-PM/admin, or for category without children
    if (!canEdit || (!isLeaf && !hasLeaves)) {
      return (
        <div style={{ textAlign: "right", minWidth: 72 }}>
          <span style={{ fontSize: item.level === "category" ? 12 : 11, fontWeight: item.level === "category" ? 600 : 400, color: currentSerapan >= 100 ? C.green : C.text }}>
            {currentSerapan.toFixed(1)}%
          </span>
          {item.level !== "subcategory" && (
            <div style={{ marginTop: 3 }}><ProgressBar pct={currentSerapan} /></div>
          )}
        </div>
      );
    }

    const onSave = () => isLeaf ? saveSerapan(item) : saveContainerSerapan(item.id, leafList);
    const onEscape = () => setEditingSerapan(prev => { const n = { ...prev }; delete n[item.id]; return n; });
    const onFocus = () => !isEditing && setEditingSerapan(prev => ({ ...prev, [item.id]: currentSerapan.toFixed(1) }));
    const onChange = (v: string) => setEditingSerapan(prev => ({ ...prev, [item.id]: v }));

    const hint = !isLeaf && hasLeaves
      ? <div style={{ fontSize: "var(--t-mikro)", color: C.muted, marginTop: 1 }}>{leafList.length} item</div>
      : null;

    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 2, alignItems: "flex-end" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
          {/* `aria-label` menyebut BARISNYA, bukan sekadar "Serapan".
              Satu halaman RAB memuat puluhan input identik; label yang sama
              untuk semuanya membuat pembaca layar mengumumkan "serapan,
              serapan, serapan" tanpa satu pun petunjuk sedang mengisi
              pekerjaan yang mana. Audit menemukan 85 input tanpa label di
              halaman ini — halaman yang tak pernah dipindai karena rutenya
              dinamis (`/proyek/[id]`). */}
          <input
            type="number" min="0" max="100" step="1"
            aria-label={`Serapan anggaran (%) untuk ${item.name}`}
            value={isEditing ? editVal : currentSerapan.toFixed(1)}
            onFocus={onFocus}
            onChange={e => onChange(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter") onSave(); if (e.key === "Escape") onEscape(); }}
            style={{
              width: 56, padding: "2px 4px", fontSize: 12, textAlign: "right",
              border: isDirty ? `1.5px solid ${C.navy}` : `1px solid var(--border)`,
              borderRadius: 6, color: C.text, background: "var(--surface)", outline: "none",
            }}
          />
          <span style={{ fontSize: "var(--t-kecil)", color: C.mid }}>%</span>
          {isDirty && (
            <button onClick={onSave} disabled={isSaving}
              style={{ padding: "2px 6px", fontSize: "var(--t-kecil)", fontWeight: 600, background: "var(--grad-aksen)", color: C.onNavy, border: "none", borderRadius: 6, cursor: "pointer", opacity: isSaving ? 0.6 : 1 }}>
              {isSaving ? "..." : "Simpan"}
            </button>
          )}
        </div>
        <ProgressBar pct={currentSerapan} />
        {hint}
      </div>
    );
  }

  // ── Render komponen biaya cell ────────────────────────────────────────────

  function renderKomponenCell(item: RabItem) {
    if (item.level !== "item") return <div />;

    const editing = editingKomponen[item.id];
    const isSaving = savingId === item.id + "_k";

    if (editing) {
      const mat = parseFloat(editing.mat || "0");
      const upah = parseFloat(editing.upah || "0");
      const alat = parseFloat(editing.alat || "0");
      const other = parseFloat(editing.other || "0");
      const total = mat + upah + alat + other;
      const totalOk = total === 0 || (total >= 99.9 && total <= 100.1);

      return (
        <div style={{ display: "flex", flexDirection: "column", gap: 4, minWidth: 200 }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 2 }}>
            {[
              { key: "mat", label: "Mat.", color: "var(--info)" },
              { key: "upah", label: "Upah", color: "var(--success)" },
              { key: "alat", label: "Alat", color: "var(--warning)" },
              { key: "other", label: "Lain", color: "var(--aksen)" },
            ].map(({ key, label, color }) => (
              <div key={key} style={{ textAlign: "center" }}>
                <div style={{ fontSize: "var(--t-mikro)", color, fontWeight: 700, marginBottom: 2 }}>{label}</div>
                <div style={{ display: "flex", alignItems: "center", gap: 0 }}>
                  <input
                    type="number" min="0" max="100" step="0.5"
                    // Label memuat NAMA KOMPONEN dan NAMA BARIS: empat input
                    // berdampingan (upah/bahan/alat/lain) dikali puluhan baris.
                    aria-label={`Porsi ${label} (%) untuk ${item.name}`}
                    value={editing[key as keyof typeof editing]}
                    onChange={e => setEditingKomponen(prev => ({ ...prev, [item.id]: { ...prev[item.id], [key]: e.target.value } }))}
                    style={{
                      width: "100%", padding: "2px 2px", fontSize: "var(--t-kecil)", textAlign: "center",
                      border: `1px solid ${color}`, borderRadius: 6, outline: "none",
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 4 }}>
            <span style={{ fontSize: "var(--t-mikro)", color: totalOk ? C.green : C.red, fontWeight: 600 }}>
              Total: {total.toFixed(1)}%
            </span>
            <div style={{ display: "flex", gap: 2 }}>
              <button onClick={() => { setEditingKomponen(prev => { const n = { ...prev }; delete n[item.id]; return n; }); }}
                style={{ padding: "2px 6px", fontSize: "var(--t-mikro)", border: "1px solid var(--border)", borderRadius: 6, background: "var(--surface)", cursor: "pointer", color: C.mid }}>
                Batal
              </button>
              <button onClick={() => saveKomponen(item)} disabled={!totalOk || isSaving}
                style={{ padding: "2px 6px", fontSize: "var(--t-mikro)", fontWeight: 600, background: totalOk ? C.navy : "var(--text-muted)", color: "var(--surface)", border: "none", borderRadius: 6, cursor: totalOk ? "pointer" : "not-allowed" }}>
                {isSaving ? "..." : "Simpan"}
              </button>
            </div>
          </div>
        </div>
      );
    }

    if (item.komponen_set) {
      return (
        <div style={{ cursor: canEdit ? "pointer" : "default" }} {...dapatDitekan(canEdit ? () => startEditKomponen(item) : null, `Ubah komponen biaya ${item.name}`)}>
          <div style={{ display: "flex", gap: 6, fontSize: "var(--t-mikro)", marginBottom: 3, flexWrap: "wrap" }}>
            {item.material_pct > 0 && <span style={{ color: "var(--info)" }}>Mat {item.material_pct}%</span>}
            {item.upah_pct > 0 && <span style={{ color: "var(--success)" }}>Upah {item.upah_pct}%</span>}
            {item.alat_pct > 0 && <span style={{ color: "var(--warning)" }}>Alat {item.alat_pct}%</span>}
            {item.other_pct > 0 && <span style={{ color: "var(--aksen)" }}>Lain {item.other_pct}%</span>}
          </div>
          <KomponenBar mat={item.material_pct} upah={item.upah_pct} alat={item.alat_pct} other={item.other_pct} />
        </div>
      );
    }

    if (!canEdit) return <span style={{ fontSize: "var(--t-mikro)", color: C.muted }}>—</span>;

    return (
      <button onClick={() => startEditKomponen(item)}
        style={{ fontSize: "var(--t-mikro)", color: C.mid, background: "none", border: "1px dashed var(--border-strong)", borderRadius: 6, padding: "2px 6px", cursor: "pointer", whiteSpace: "nowrap" }}>
        + Isi %
      </button>
    );
  }

  // ── Build tree ────────────────────────────────────────────────────────────

  // Grid: toggle | uraian | vol | sat | harga sat | jumlah | bobot | progress | (komponen jika showKomponen)
  const gridCols = showKomponen
    ? "28px minmax(0,1fr) 60px 50px 100px 100px 60px 90px 200px"
    : "28px minmax(0,1fr) 60px 50px 100px 100px 60px 100px";
  const headerCols = showKomponen
    ? ["", "Uraian Pekerjaan", "Volume", "Sat.", "Harga Satuan", "Jumlah Harga", "Bobot", "Serapan %", "Komponen Biaya"]
    : ["", "Uraian Pekerjaan", "Volume", "Sat.", "Harga Satuan", "Jumlah Harga", "Bobot", "Serapan %"];

  function renderItems() {
    return categories.map(cat => {
      const isCollapsed = collapsed.has(cat.id);
      const children = items.filter(it => it.parent_id === cat.id);
      const hasChildren = children.length > 0;

      // `role="button"` di SEL CHEVRON, bukan di barisnya.
      //
      // Baris ini memuat kotak serapan; menandai seluruh baris sebagai tombol
      // membuat input bersarang di dalam tombol (`nested-interactive`) — 21
      // node begini ditemukan di halaman ini. Kliknya tetap di seluruh baris.
      const lipat = dapatDitekanTerpisah(
        hasChildren ? () => toggleCollapse(cat.id) : null,
        `${isCollapsed ? "Buka" : "Lipat"} kategori ${cat.name}`,
        { terbuka: !isCollapsed },
      );

      return (
        <div key={cat.id}>
          <div
            style={{ display: "grid", gridTemplateColumns: gridCols, gap: 6, alignItems: "center", padding: "8px 12px", background: C.navyLight, borderBottom: "1px solid var(--border-strong)", cursor: hasChildren ? "pointer" : "default" }}
            {...lipat.baris}
          >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center" }} {...lipat.pemicu}>
              {hasChildren ? (isCollapsed ? <ChevronRight size={13} color={C.navy} /> : <ChevronDown size={13} color={C.navy} />) : null}
            </div>
            <div><span style={{ fontSize: 12, fontWeight: 700, color: C.navy }}>{cat.category_code ? `${cat.category_code}. ` : ""}{cat.name}</span></div>
            <div style={{ textAlign: "right", fontSize: "var(--t-kecil)", color: C.mid }}>—</div>
            <div style={{ textAlign: "right", fontSize: "var(--t-kecil)", color: C.mid }}>—</div>
            <div style={{ textAlign: "right", fontSize: "var(--t-kecil)", color: C.mid }}>—</div>
            <div style={{ textAlign: "right", fontSize: 12, fontWeight: 600, color: C.text }}>{cat.total_price ? fmt(cat.total_price) : "—"}</div>
            <div style={{ textAlign: "right", fontSize: 12, fontWeight: 700, color: C.navy }}>{cat.weight_pct.toFixed(2)}%</div>
            <div {...tanpaTembus}>{renderSerapanCell(cat)}</div>
            {showKomponen && <div />}
          </div>

          {!isCollapsed && children.map(child => {
            if (child.level === "subcategory") {
              const subChildren = items.filter(it => it.parent_id === child.id);
              const subCollapsed = collapsed.has(child.id);
              // Alasan sama dengan baris kategori di atas: pemicu di sel
              // chevron supaya kotak serapan tak bersarang di dalam tombol.
              const lipatSub = dapatDitekanTerpisah(
                subChildren.length > 0 ? () => toggleCollapse(child.id) : null,
                `${subCollapsed ? "Buka" : "Lipat"} sub-kategori ${child.name}`,
                { terbuka: !subCollapsed },
              );
              return (
                <div key={child.id}>
                  <div
                    style={{ display: "grid", gridTemplateColumns: gridCols, gap: 6, alignItems: "center", padding: "8px 12px 8px 28px", background: "var(--bg)", borderBottom: "1px solid var(--border)", cursor: subChildren.length > 0 ? "pointer" : "default" }}
                    {...lipatSub.baris}
                  >
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "center" }} {...lipatSub.pemicu}>
                      {subChildren.length > 0 ? (subCollapsed ? <ChevronRight size={12} color={C.mid} /> : <ChevronDown size={12} color={C.mid} />) : null}
                    </div>
                    <span style={{ fontSize: 12, fontWeight: 600, color: C.text }}>{child.category_code ? `${child.category_code}. ` : ""}{child.name}</span>
                    <div style={{ textAlign: "right", fontSize: "var(--t-kecil)", color: C.mid }}>—</div>
                    <div style={{ textAlign: "right", fontSize: "var(--t-kecil)", color: C.mid }}>—</div>
                    <div style={{ textAlign: "right", fontSize: "var(--t-kecil)", color: C.mid }}>—</div>
                    <div style={{ textAlign: "right", fontSize: 12, color: C.mid }}>{child.total_price ? fmt(child.total_price) : "—"}</div>
                    <div />
                    <div {...tanpaTembus}>{renderSerapanCell(child)}</div>
                    {showKomponen && <div />}
                  </div>
                  {!subCollapsed && subChildren.map(it => renderItemRow(it, 48))}
                </div>
              );
            }
            return renderItemRow(child, 28);
          })}
        </div>
      );
    });
  }

  function renderItemRow(item: RabItem, paddingLeft: number) {
    return (
      <div key={item.id} style={{ display: "grid", gridTemplateColumns: gridCols, gap: 6, alignItems: "center", padding: `7px 14px 7px ${paddingLeft}px`, background: "var(--surface)", borderBottom: "1px solid var(--surface-hover)" }}>
        <div />
        <span style={{ fontSize: 12, color: C.text }}>{item.category_code ? `${item.category_code}. ` : ""}{item.name}</span>
        <div style={{ textAlign: "right", fontSize: "var(--t-kecil)", color: C.mid }}>{item.qty !== null ? item.qty.toLocaleString("id-ID") : "—"}</div>
        <div style={{ textAlign: "right", fontSize: "var(--t-kecil)", color: C.mid }}>{item.unit ?? "—"}</div>
        <div style={{ textAlign: "right", fontSize: "var(--t-kecil)", color: C.mid }}>{item.unit_price ? fmt(item.unit_price) : "—"}</div>
        <div style={{ textAlign: "right", fontSize: 12, color: C.text }}>{item.total_price ? fmt(item.total_price) : "—"}</div>
        <div style={{ textAlign: "right", fontSize: "var(--t-kecil)", color: C.mid }}>{item.weight_pct > 0 ? `${item.weight_pct.toFixed(2)}%` : "—"}</div>
        <div {...tanpaTembus}>{renderSerapanCell(item)}</div>
        {showKomponen && <div {...tanpaTembus}>{renderKomponenCell(item)}</div>}
      </div>
    );
  }

  // ─── Render ────────────────────────────────────────────────────────────────

  if (loading) {
    return <div style={{ padding: 24, textAlign: "center", color: C.muted, fontSize: 13 }}>Memuat data RAB...</div>;
  }

  const hasData = items.length > 0;
  const itemCount = items.filter(it => it.level === "item").length;
  const komponenSetCount = items.filter(it => it.level === "item" && it.komponen_set).length;

  return (
    <div>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16, flexWrap: "wrap", gap: 8 }}>
        {!hideHeader && (
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div style={{ width: 36, height: 36, borderRadius: 10, background: "linear-gradient(135deg, var(--navy), var(--aksen-terang))", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <BarChart2 size={18} color="var(--surface)" />
            </div>
            <div>
              <h3 style={{ fontSize: 15, fontWeight: 700, color: C.text, margin: 0 }}>RAB — Rencana Anggaran Biaya</h3>
              {hasData && (
                <p style={{ fontSize: "var(--t-kecil)", color: C.muted, margin: 0 }}>
                  {categories.length} kategori · {itemCount} item · Total {fmt(totalRab)}
                  {canEdit && itemCount > 0 && (
                    <span style={{ marginLeft: 8, color: komponenSetCount === itemCount ? C.green : C.yellow }}>
                      · Komponen biaya {komponenSetCount}/{itemCount} item
                    </span>
                  )}
                </p>
              )}
            </div>
          </div>
        )}
        {hideHeader && hasData && (
          <p style={{ fontSize: "var(--t-kecil)", color: C.muted, margin: 0 }}>
            {categories.length} kategori · {itemCount} item · Total {fmt(totalRab)}
            {canEdit && itemCount > 0 && (
              <span style={{ marginLeft: 8, color: komponenSetCount === itemCount ? C.green : C.yellow }}>
                · Komponen biaya {komponenSetCount}/{itemCount} item
              </span>
            )}
          </p>
        )}

        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          {hasData && canEdit && (
            <button
              onClick={() => setShowKomponen(s => !s)}
              style={{
                display: "flex", alignItems: "center", gap: 6,
                padding: "6px 12px", borderRadius: 6, fontSize: 12, fontWeight: 500,
                background: showKomponen ? C.navyLight : "var(--surface)",
                color: showKomponen ? C.navy : C.mid,
                border: `1px solid ${showKomponen ? C.navy : "var(--border)"}`,
                cursor: "pointer",
              }}
            >
              <Percent size={13} />
              {showKomponen ? "Sembunyikan Komponen" : "Isi Komponen Biaya"}
              {komponenSetCount > 0 && komponenSetCount < itemCount && (
                <span style={{ background: C.yellow, color: "var(--surface)", borderRadius: 10, padding: "0px 4px", fontSize: "var(--t-mikro)" }}>
                  {itemCount - komponenSetCount} belum
                </span>
              )}
              {komponenSetCount === itemCount && itemCount > 0 && (
                <CheckCircle size={12} color={C.green} />
              )}
            </button>
          )}

          {canEdit && (
            <>
              <input ref={fileRef} type="file" accept=".xlsx,.xls,.ods" style={{ display: "none" }} onChange={e => { const f = e.target.files?.[0]; if (f) handleUpload(f); }} />
              <button aria-label="Refresh"
                onClick={() => fileRef.current?.click()}
                disabled={uploading}
                style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 12px", borderRadius: 6, fontSize: 12, fontWeight: 600, background: uploading ? "var(--text-muted)" : C.navy, color: "var(--surface)", border: "none", cursor: uploading ? "not-allowed" : "pointer" }}
                onMouseEnter={e => { if (!uploading) e.currentTarget.style.background = "var(--aksen-pekat)"; }}
                onMouseLeave={e => { if (!uploading) e.currentTarget.style.background = C.navy; }}
              >
                <Upload size={14} />
                {uploading ? "Mengupload..." : hasData ? "Ganti File RAB" : "Upload RAB (.xlsx)"}
              </button>
              {hasData && (
                <button aria-label="Refresh" onClick={load}
                  style={{ display: "flex", alignItems: "center", gap: 4, padding: "8px 8px", borderRadius: 6, fontSize: 12, background: "transparent", color: C.mid, border: "1px solid var(--border)", cursor: "pointer" }}
                  title="Refresh">
                  <RefreshCw size={13} />
                </button>
              )}
            </>
          )}
        </div>
      </div>

      {/* Messages */}
      {uploadMsg && (
        <div style={{ marginBottom: 12, padding: "8px 12px", borderRadius: 6, background: C.greenBg, border: `1px solid ${C.greenBorder}`, fontSize: 13, color: C.green, fontWeight: 500 }}>
          {uploadMsg}
        </div>
      )}
      {error && (
        <div style={{ marginBottom: 12, padding: "8px 12px", borderRadius: 6, background: C.redBg, border: `1px solid ${C.redBorder}`, fontSize: 13, color: C.red }}>
          {error}
          <button onClick={() => setError(null)} style={{ float: "right", background: "none", border: "none", color: C.red, cursor: "pointer", fontSize: 15, lineHeight: 1 }}>×</button>
        </div>
      )}

      {/* Empty state */}
      {!hasData && (
        /* ⚠️ BUG yang ikut ketahuan: area ini memanggil `fileRef.current?.click()`,
           tapi `<input ref={fileRef}>` berada di blok header yang hanya dirender
           kalau `hasData`. Di keadaan kosong ref-nya NULL — jadi mengkliknya tak
           melakukan apa pun, tanpa pesan. Proyek yang belum punya RAB tak punya
           jalan mengunggah RAB.

           Diperbaiki dengan `<label>` yang membungkus input-nya SENDIRI: bisa
           difokus, menanggapi Enter, tak butuh ref, dan tak butuh
           `role`/`tabIndex`/`onKeyDown` sama sekali — browser sudah tahu bahwa
           label yang membungkus input berkas adalah pemicu unggah. */
        /* Seret-jatuh dipasang di pembungkus `<div>`, bukan di `<label>`-nya:
           menaruh penangan drop pada label membuat eslint (benar) menganggapnya
           elemen non-interaktif yang menerima interaksi. Memisahkan keduanya
           menjaga label tetap murni sebagai pemicu unggah. */
        <div onDrop={handleDrop} onDragOver={e => e.preventDefault()}>
        <label
          style={{ padding: "40px 24px", textAlign: "center", border: "2px dashed var(--border)", borderRadius: 10, display: "block", background: "var(--surface-subtle)", cursor: canEdit ? "pointer" : "default" }}
        >
          {canEdit && (
            <input
              type="file" accept=".xlsx,.xls,.ods" style={{ display: "none" }}
              onChange={e => { const f = e.target.files?.[0]; if (f) handleUpload(f); }}
            />
          )}
          <Upload size={28} color={C.muted} style={{ marginBottom: 10 }} />
          <p style={{ fontSize: 13, fontWeight: 600, color: C.text, marginBottom: 4 }}>Belum ada data RAB</p>
          <p style={{ fontSize: 12, color: C.muted }}>
            {canEdit ? "Upload file Excel RAB (.xlsx) atau drag & drop ke sini" : "Belum ada data RAB untuk proyek ini"}
          </p>
        </label>
        {/*
          Jalan KEDUA dari keadaan kosong — diminta founder 2026-09-04.

          Sebelum ini satu-satunya jalan keluar dari layar ini adalah mengunggah
          Excel. Yang belum punya berkasnya sama sekali menemui jalan buntu:
          layar bertuliskan "belum ada data" tanpa memberi tahu bagaimana cara
          mengadakannya.

          Tautan, bukan salinan layar RAB di sini — alasannya sama dengan tombol
          di header halaman proyek: RAB punya skenario + versi, dan dua layar
          yang menyusunnya dengan aturan berbeda melahirkan angka yang berbeda
          untuk hal yang sama.
        */}
        {canEdit && (
          <p style={{ fontSize: 12, color: C.muted, textAlign: "center", marginTop: 10 }}>
            Belum punya berkasnya?{" "}
            <a
              href={`/estimasi/rab?proyek=${projectId}`}
              style={{ color: "var(--navy)", fontWeight: 600, textDecoration: "underline" }}
            >
              Susun RAB dari nol
            </a>
            {" · "}
            <a
              href={`/estimasi/rap?proyek=${projectId}`}
              style={{ color: "var(--navy)", fontWeight: 600, textDecoration: "underline" }}
            >
              Buat RAP
            </a>
          </p>
        )}
        </div>
      )}

      {/* Overall progress summary */}
      {hasData && categories.length > 0 && (
        <div style={{ marginBottom: 16, padding: "12px 16px", borderRadius: 10, background: "linear-gradient(135deg, var(--navy), var(--aksen-terang))", display: "flex", alignItems: "center", gap: 20, flexWrap: "wrap" }}>
          <div>
            <p style={{ fontSize: "var(--t-kecil)", color: "color-mix(in srgb, var(--on-navy) 80%, transparent)", margin: "0 0 2px" }}>Serapan Dana (Weighted)</p>
            <p style={{ fontSize: 28, fontWeight: 700, color: "#fff", margin: 0, lineHeight: 1 }}>{overallSerapan.toFixed(1)}%</p>
          </div>
          <div style={{ flex: 1, minWidth: 120 }}>
            <div style={{ height: 8, borderRadius: 6, background: "rgba(255,255,255,0.2)", overflow: "hidden" }}>
              <div style={{ height: "100%", borderRadius: 6, width: `${Math.min(100, overallSerapan)}%`, background: overallSerapan >= 100 ? "var(--success)" : "var(--info)", transition: "width 0.5s ease" }} />
            </div>
            <p style={{ fontSize: "var(--t-kecil)", color: "rgba(255,255,255,0.6)", margin: "6px 0 0" }}>Dari {categories.length} kategori RAB</p>
          </div>
          {/* Komponen biaya breakdown */}
          {komponenTotal > 0 && (
            <div style={{ borderLeft: "1px solid rgba(255,255,255,0.2)", paddingLeft: 20 }}>
              <p style={{ fontSize: "var(--t-mikro)", color: "rgba(255,255,255,0.6)", margin: "0 0 6px" }}>Serapan Rencana (dari komponen biaya)</p>
              <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
                {komponenSummary.mat > 0 && <div><p style={{ fontSize: "var(--t-mikro)", color: "var(--info-border)", margin: 0 }}>Material</p><p style={{ fontSize: 13, fontWeight: 600, color: "var(--surface)", margin: 0 }}>{fmtCompact(komponenSummary.mat)}</p></div>}
                {komponenSummary.upah > 0 && <div><p style={{ fontSize: "var(--t-mikro)", color: "#6EE7B7", margin: 0 }}>Upah</p><p style={{ fontSize: 13, fontWeight: 600, color: "var(--surface)", margin: 0 }}>{fmtCompact(komponenSummary.upah)}</p></div>}
                {komponenSummary.alat > 0 && <div><p style={{ fontSize: "var(--t-mikro)", color: "#FCD34D", margin: 0 }}>Alat</p><p style={{ fontSize: 13, fontWeight: 600, color: "var(--surface)", margin: 0 }}>{fmtCompact(komponenSummary.alat)}</p></div>}
                {komponenSummary.other > 0 && <div><p style={{ fontSize: "var(--t-mikro)", color: "var(--aksen-terang)", margin: 0 }}>Lain</p><p style={{ fontSize: 13, fontWeight: 600, color: "var(--surface)", margin: 0 }}>{fmtCompact(komponenSummary.other)}</p></div>}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Table */}
      {hasData && (
        <div style={{ borderRadius: 10, border: "1px solid var(--border)", overflow: "hidden" }}>
          <div style={{ display: "grid", gridTemplateColumns: gridCols, gap: 6, padding: "8px 12px", background: "var(--surface-hover)", borderBottom: "1px solid var(--border)" }}>
            {headerCols.map((h, i) => (
              <div key={i} style={{ fontSize: "var(--t-kecil)", fontWeight: 700, color: C.mid, textAlign: i >= 2 && i < 8 ? "right" : "left" }}>{h}</div>
            ))}
          </div>

          <div style={{ maxHeight: 560, overflowY: "auto" }}>
            {renderItems()}
          </div>

          <div style={{ display: "grid", gridTemplateColumns: gridCols, gap: 6, padding: "8px 12px", background: "var(--bg)", borderTop: "2px solid var(--border)" }}>
            <div />
            <span style={{ fontSize: 13, fontWeight: 700, color: C.text }}>TOTAL RAB</span>
            <div /><div /><div />
            <div style={{ textAlign: "right", fontSize: 13, fontWeight: 700, color: C.navy }}>{fmt(totalRab)}</div>
            <div style={{ textAlign: "right", fontSize: 13, fontWeight: 700, color: C.navy }}>100%</div>
            <div style={{ textAlign: "right", fontSize: 13, fontWeight: 700, color: C.navy }}>{overallSerapan.toFixed(1)}%</div>
            {showKomponen && <div />}
          </div>
        </div>
      )}
    </div>
  );
}
