"use client";

/**
 * PROCUREMENT — STOK PROYEK.
 *
 * Dipindahkan dari tab `stocks`. Alur dipertahankan: peringatan pesan ulang,
 * saring proyek & pencarian, catat pemakaian, opname stok, dan log mutasi.
 *
 * TIGA tabel HTML mentah (stok, log mutasi, opname) diganti `<Tabel>`.
 */

import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, Plus, RefreshCw, Search } from "lucide-react";

import { api } from "@/lib/api";
import { useData } from "@/lib/data-cache";
import { useIzin } from "@/lib/use-izin";
import { C } from "@/lib/warna-ui";
import { Kosong } from "@/components/ui-dasar";
import { Tabel, type Kolom } from "@/components/dasar";
import { Btn, Input, KotakGalat, Memuat, Modal, Select, fmtDate, pesanError, tundaSatuTick } from "../_bersama/ui";
import { Pilihan } from "@/components/pilihan";

interface Proyek { id: string; name: string }

interface Stok {
  id: string;
  qty_on_hand: number;
  qty_reserved: number;
  last_updated_at: string;
  project?: { id?: string; name?: string } | null;
  material?: {
    id?: string; name?: string; unit?: string; min_stock?: number | null;
    category?: { name?: string } | null;
  } | null;
}

interface Mutasi {
  id: string;
  movement_type: string;
  qty: number;
  qty_before: number;
  qty_after: number;
  reference_type?: string | null;
  created_at: string;
  material?: { name?: string; unit?: string } | null;
  created_by?: { name?: string } | null;
}

const MOVEMENT_CONFIG: Record<string, { label: string; color: string; bg: string; sign: string }> = {
  goods_receipt: { label: "Masuk (GR)",     color: "var(--success)", bg: "var(--success-bg)", sign: "+" },
  usage:         { label: "Pemakaian",      color: "var(--danger)",  bg: "var(--danger-bg)",  sign: "−" },
  return:        { label: "Return",         color: "var(--info)",    bg: "var(--navy-light)", sign: "+" },
  adjustment:    { label: "Adjustment",     color: "var(--warning)", bg: "var(--warning-bg)", sign: "±" },
  transfer_in:   { label: "Transfer Masuk", color: "var(--success)", bg: "var(--success-bg)", sign: "+" },
  transfer_out:  { label: "Transfer Keluar",color: "var(--aksen)",   bg: "var(--navy-light)", sign: "−" },
};

export default function StokPage() {
  // Stock usage & opname: API menuntut `procurement:view` (lihat procurement.ts
  // POST /stocks/usage & /stocks/opname). Sebelumnya UI mengecek
  // `role === admin|pm|mandor` — role kustom `direktur` yang punya 7 permission
  // procurement TIDAK melihat tombolnya (ADR-004).
  const canEdit = useIzin("procurement:view");

  const [projectFilter, setProjectFilter] = useState("");
  const [search, setSearch] = useState("");

  const [logProject, setLogProject] = useState("");
  const [showLog, setShowLog] = useState(false);

  const [showUsage, setShowUsage] = useState(false);
  const [showOpname, setShowOpname] = useState(false);

  /*
    ── PINDAH KE LAPIS CACHE BERSAMA (F4-2), 2026-08-16

    `useData` menggantikan dua pasang useEffect+useState+tundaSatuTick.
    Saringan proyek masuk sebagai bagian dari URL. Log mutasi memakai URL
    KONDISIONAL — `null` sampai panelnya dibuka DAN proyeknya terpilih,
    sama seperti efek keduanya dulu.
  */
  const { data: dataStocks, memuat: loading, muatUlang: muatUlangStocks } =
    useData<{ stocks: Stok[] }>(`/api/v1/procurement/stocks${projectFilter ? `?project_id=${projectFilter}` : ""}`);
  const { data: dataProjects } = useData<{ projects: Proyek[] }>("/api/v1/projects");
  const { data: dataLog, memuat: loadingLog, muatUlang: muatUlangLog } =
    useData<{ movements: Mutasi[] }>(
      showLog && logProject ? `/api/v1/procurement/stocks/${logProject}/movements?limit=200` : null,
    );

  const load = useCallback(async () => { await muatUlangStocks(); }, [muatUlangStocks]);
  const loadLog = useCallback(async () => { await muatUlangLog(); }, [muatUlangLog]);

  // Diturunkan, bukan disalin.
  const stocks = dataStocks?.stocks ?? [];
  const projects = dataProjects?.projects ?? [];
  const movements = dataLog?.movements ?? [];

  const filtered = stocks.filter(s => (s.material?.name ?? "").toLowerCase().includes(search.toLowerCase()));
  const dibawahMinimum = (s: Stok) => {
    const min = Number(s.material?.min_stock ?? 0);
    return min > 0 && Number(s.qty_on_hand) < min;
  };
  const lowStockItems = filtered.filter(dibawahMinimum);

  const kolomStok: Kolom<Stok>[] = [
    {
      kunci: "material", judul: "Material", kepalaBaris: true,
      render: s => (
        <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
          {s.material?.name}
          {dibawahMinimum(s) && (
            <span style={{ fontSize: 10, padding: "0px 6px", background: C.dangerBg, color: C.danger, borderRadius: 99, fontWeight: 700, border: `1px solid ${C.danger}` }}>
              REORDER
            </span>
          )}
        </span>
      ),
    },
    { kunci: "kategori", judul: "Kategori", render: s => <span style={{ color: C.mid }}>{s.material?.category?.name ?? "—"}</span> },
    { kunci: "proyek", judul: "Proyek", render: s => <span style={{ color: C.mid }}>{s.project?.name}</span> },
    {
      kunci: "onhand", judul: "Stok di Tangan", rata: "kanan",
      render: s => (
        <span style={{ fontWeight: 600, color: dibawahMinimum(s) || Number(s.qty_on_hand) <= 0 ? C.danger : C.text }}>
          {s.qty_on_hand} {s.material?.unit}
        </span>
      ),
    },
    {
      kunci: "min", judul: "Stok Min", rata: "kanan",
      render: s => (s.material?.min_stock ?? 0) > 0
        ? <span style={{ color: C.mid }}>{s.material?.min_stock} {s.material?.unit}</span>
        : <span style={{ color: C.muted }}>—</span>,
    },
    { kunci: "reserved", judul: "Reserved", rata: "kanan", render: s => <span style={{ color: C.mid }}>{s.qty_reserved} {s.material?.unit}</span> },
    { kunci: "update", judul: "Terakhir Update", render: s => <span style={{ color: C.muted, fontSize: 12 }}>{fmtDate(s.last_updated_at)}</span> },
  ];

  const kolomMutasi: Kolom<Mutasi>[] = [
    {
      kunci: "waktu", judul: "Waktu", kepalaBaris: true,
      render: m => (
        <span style={{ color: C.muted, fontSize: 12, whiteSpace: "nowrap" }}>
          {new Date(m.created_at).toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}
        </span>
      ),
    },
    {
      kunci: "tipe", judul: "Tipe",
      render: m => {
        const cfg = MOVEMENT_CONFIG[m.movement_type] ?? { label: m.movement_type, color: C.mid, bg: "var(--surface-hover)", sign: "" };
        return (
          <span style={{ padding: "2px 8px", borderRadius: 99, fontSize: 11, fontWeight: 600, color: cfg.color, background: cfg.bg, whiteSpace: "nowrap" }}>
            {cfg.label}
          </span>
        );
      },
    },
    { kunci: "material", judul: "Material", render: m => <span style={{ fontWeight: 500 }}>{m.material?.name}</span> },
    {
      kunci: "qty", judul: "Qty", rata: "kanan",
      render: m => {
        const cfg = MOVEMENT_CONFIG[m.movement_type];
        const keluar = ["usage", "transfer_out"].includes(m.movement_type);
        return (
          <span style={{ fontWeight: 700, color: keluar ? C.danger : "var(--success)", whiteSpace: "nowrap" }}>
            {cfg?.sign ?? ""}{Math.abs(Number(m.qty))} {m.material?.unit}
          </span>
        );
      },
    },
    { kunci: "sebelum", judul: "Sebelum", rata: "kanan", render: m => <span style={{ color: C.mid }}>{m.qty_before} {m.material?.unit}</span> },
    { kunci: "sesudah", judul: "Sesudah", rata: "kanan", render: m => <span style={{ color: C.mid }}>{m.qty_after} {m.material?.unit}</span> },
    {
      kunci: "sumber", judul: "Sumber",
      render: m => <span style={{ color: C.muted, fontSize: 12 }}>
        {m.reference_type === "opname" ? "Opname" : m.reference_type === "manual" ? "Manual" : "GR"}
      </span>,
    },
    { kunci: "oleh", judul: "Dicatat oleh", render: m => <span style={{ color: C.mid, fontSize: 12 }}>{m.created_by?.name ?? "—"}</span> },
  ];

  return (
    <div style={{ width: "100%", maxWidth: "var(--w-luas)", margin: "0 auto" }}>
      {lowStockItems.length > 0 && (
        <div role="alert" style={{ background: C.dangerBg, border: `1px solid ${C.danger}`, borderRadius: 10, padding: "var(--pad-atas) var(--pad-x) var(--pad-bawah)", marginBottom: 16, display: "flex", gap: 8, alignItems: "flex-start" }}>
          <AlertTriangle size={16} color={C.danger} aria-hidden="true" style={{ flexShrink: 0, marginTop: 1 }} />
          <div>
            <div style={{ fontSize: 13, fontWeight: 600, color: C.danger }}>
              {lowStockItems.length} material di bawah stok minimum
            </div>
            <div style={{ fontSize: 12, color: C.mid, marginTop: 4 }}>
              {lowStockItems.slice(0, 5).map(s => `${s.material?.name} (${s.qty_on_hand}/${s.material?.min_stock} ${s.material?.unit})`).join(" · ")}
              {lowStockItems.length > 5 && ` dan ${lowStockItems.length - 5} lainnya`}
            </div>
          </div>
        </div>
      )}

      <div style={{ display: "flex", gap: 12, marginBottom: 16, flexWrap: "wrap", alignItems: "center" }}>
        <div style={{ position: "relative", flex: 1, minWidth: 180 }}>
          <Search size={14} aria-hidden="true" style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: C.muted }} />
          <input
            value={search} onChange={e => setSearch(e.target.value)}
            aria-label="Cari material di stok" placeholder="Cari material..."
            style={{ padding: "8px 12px 8px 32px", border: `1px solid ${C.border}`, borderRadius: 6, fontSize: 13, width: "100%", boxSizing: "border-box", background: C.surface, color: C.text }}
          />
        </div>
        <Pilihan
          aria-label="Saring proyek" value={projectFilter} onChange={e => setProjectFilter(e.target.value)}
          style={{ padding: "8px 12px", border: `1px solid ${C.border}`, borderRadius: 6, fontSize: 13, minWidth: 200, background: C.surface, color: C.text }}
        >
          <option value="">Semua Proyek</option>
          {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
        </Pilihan>
        <div style={{ display: "flex", gap: 8, marginLeft: "auto" }}>
          {canEdit && (
            <>
              <Btn onClick={() => setShowUsage(true)}><Plus size={14} aria-hidden="true" /> Catat Pemakaian</Btn>
              <Btn variant="secondary" onClick={() => setShowOpname(true)}>Opname Stok</Btn>
            </>
          )}
          <Btn variant="secondary" onClick={() => setShowLog(v => !v)} aria-expanded={showLog}>
            {showLog ? "Sembunyikan Log" : "Lihat Log Mutasi"}
          </Btn>
        </div>
      </div>

      {loading ? <Memuat /> : (
        <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10, overflow: "hidden" }}>
          <Tabel              berpermukaan
            kolom={kolomStok}
            data={filtered}
            kunciBaris={s => s.id}
            caption="Stok per material dan proyek: yang ada di tangan, batas minimum, dan yang sudah direservasi. Stok tersedia adalah di tangan dikurangi reserved."
            tandaiBaris={s => dibawahMinimum(s) ? "var(--danger-bg)" : undefined}
            kosong={
              <Kosong
                judul={search || projectFilter ? "Tak ada stok yang cocok" : "Belum ada data stok"}
                sebab={search || projectFilter
                  ? `Saringan yang sedang aktif tak menyisakan satu pun dari ${stocks.length} baris stok. Datanya tidak hilang; longgarkan saringannya.`
                  : "Stok bertambah otomatis saat penerimaan barang dikonfirmasi. Selama belum ada satu pun Goods Receipt yang dikonfirmasi, belum ada apa pun untuk dihitung."}
              />
            }
          />
        </div>
      )}

      {showLog && (
        <div style={{ marginTop: 28 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 14, flexWrap: "wrap" }}>
            <span style={{ fontWeight: 700, fontSize: 13, color: C.text }}>Log Arus Material</span>
            <Pilihan
              aria-label="Pilih proyek untuk log mutasi" value={logProject}
              onChange={e => setLogProject(e.target.value)}
              style={{ padding: "6px 12px", border: `1px solid ${C.border}`, borderRadius: 6, fontSize: 13, background: C.surface, color: C.text }}
            >
              <option value="">— Pilih Proyek —</option>
              {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </Pilihan>
            {logProject && (
              <Btn variant="secondary" onClick={() => void loadLog()} aria-label="Muat ulang log mutasi">
                <RefreshCw size={13} aria-hidden="true" />
              </Btn>
            )}
          </div>

          {!logProject ? (
            <Kosong
              judul="Pilih proyek dulu"
              sebab="Log mutasi dicatat per proyek, karena stok yang sama bisa berpindah di beberapa lokasi sekaligus. Tanpa memilih proyek, tak ada satu deret waktu yang bisa ditampilkan."
            />
          ) : loadingLog ? <Memuat teks="Memuat log..." /> : (
            <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10, overflow: "hidden" }}>
              <Tabel              berpermukaan
                kolom={kolomMutasi}
                data={movements}
                kunciBaris={m => m.id}
                caption="Riwayat pergerakan stok: waktu, jenis mutasi, jumlah, saldo sebelum dan sesudah, sumbernya, serta siapa yang mencatat."
                kosong={<Kosong judul="Belum ada riwayat mutasi" sebab="Proyek ini belum pernah mencatat penerimaan, pemakaian, maupun opname. Baris pertama muncul begitu salah satunya terjadi." />}
              />
            </div>
          )}
        </div>
      )}

      {showUsage && (
        <UsageModal
          projects={projects} stocks={stocks}
          onClose={() => setShowUsage(false)}
          onSuccess={() => { setShowUsage(false); void load(); if (showLog && logProject) void loadLog(); }}
        />
      )}

      {showOpname && (
        <OpnameModal
          projects={projects}
          onClose={() => setShowOpname(false)}
          onSuccess={() => { setShowOpname(false); void load(); if (showLog && logProject) void loadLog(); }}
        />
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// MODAL — catat pemakaian
// ═══════════════════════════════════════════════════════════════════════════

function UsageModal({ projects, stocks, onClose, onSuccess }: {
  projects: Proyek[]; stocks: Stok[];
  onClose: () => void; onSuccess: () => void;
}) {
  const [projectId, setProjectId] = useState("");
  const [materialId, setMaterialId] = useState("");
  const [movementType, setMovementType] = useState("usage");
  const [qty, setQty] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const projectStocks = stocks.filter(s => !projectId || s.project?.id === projectId);
  const selectedStock = projectStocks.find(s => s.material?.id === materialId);

  async function handleSubmit() {
    setError("");
    if (!projectId || !materialId || !qty) { setError("Semua field wajib diisi"); return; }
    setSaving(true);
    try {
      await api.post("/api/v1/procurement/stocks/usage", {
        project_id: projectId, material_id: materialId,
        qty: Number(qty), movement_type: movementType, notes: notes || null,
      });
      onSuccess();
    } catch (err: unknown) {
      setError(pesanError(err, "Gagal menyimpan"));
    } finally { setSaving(false); }
  }

  return (
    <Modal title="Catat Pemakaian Material" onClose={onClose}>
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {error && <KotakGalat pesan={error} />}

        <Select label="Proyek *" value={projectId} onChange={e => { setProjectId(e.target.value); setMaterialId(""); }}>
          <option value="">— Pilih Proyek —</option>
          {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
        </Select>

        <Select label="Material *" value={materialId} onChange={e => setMaterialId(e.target.value)} disabled={!projectId}>
          <option value="">— Pilih Material —</option>
          {projectStocks.map(s => (
            <option key={s.material?.id} value={s.material?.id}>
              {s.material?.name} — stok: {s.qty_on_hand} {s.material?.unit}
            </option>
          ))}
        </Select>

        {selectedStock && (
          <div style={{ fontSize: 12, color: C.mid, background: C.bg, borderRadius: 6, padding: "8px 12px" }}>
            Stok saat ini: <strong style={{ color: C.text }}>{selectedStock.qty_on_hand} {selectedStock.material?.unit}</strong>
          </div>
        )}

        <Select label="Jenis" value={movementType} onChange={e => setMovementType(e.target.value)}>
          <option value="usage">Pemakaian (stok berkurang)</option>
          <option value="return">Return / Dikembalikan (stok bertambah)</option>
          <option value="adjustment">Adjustment manual (set stok ke nilai baru)</option>
        </Select>

        <Input
          label={movementType === "adjustment" ? "Stok Baru (nilai absolut) *" : "Jumlah *"}
          value={qty} onChange={e => setQty(e.target.value)} type="number"
          placeholder={movementType === "adjustment" ? "Masukkan stok aktual sekarang" : ""}
        />
        <Input label="Catatan" value={notes} onChange={e => setNotes(e.target.value)} placeholder="Opsional — misal: cor kolom K-1" />

        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 4 }}>
          <Btn variant="secondary" onClick={onClose}>Batal</Btn>
          <Btn onClick={() => void handleSubmit()} loading={saving}>Simpan</Btn>
        </div>
      </div>
    </Modal>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// MODAL — opname stok
// ═══════════════════════════════════════════════════════════════════════════

interface BarisOpname {
  material_id: string;
  material_name: string;
  unit: string;
  qty_system: number;
  qty_actual: string;
}

interface HasilOpname {
  opname_by: string;
  total_items_checked: number;
  items_with_adjustment: number;
  items_unchanged: number;
}

function OpnameModal({ projects, onClose, onSuccess }: {
  projects: Proyek[]; onClose: () => void; onSuccess: () => void;
}) {
  const [projectId, setProjectId] = useState("");
  const [notes, setNotes] = useState("");
  const [items, setItems] = useState<BarisOpname[]>([]);
  const [loadingItems, setLoadingItems] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<HasilOpname | null>(null);

  useEffect(() => {
    let batal = false;
    // Seluruh setState — termasuk pengosongan saat proyek dilepas — dijalankan
    // SESUDAH satu tick, bukan di badan effect. Alasannya sama dengan pemuat
    // lain di modul ini; catatannya ada di `_bersama/ui.tsx`.
    void (async () => {
      await tundaSatuTick();
      if (batal) return;
      if (!projectId) { setItems([]); return; }
      setLoadingItems(true);
      try {
        const r = await api.get<{ stocks: Stok[] }>(
          "/api/v1/procurement/stocks", { params: { project_id: projectId } },
        );
        if (batal) return;
        setItems((r.data?.stocks ?? []).map(s => ({
          material_id: s.material?.id ?? "",
          material_name: s.material?.name ?? "—",
          unit: s.material?.unit ?? "",
          qty_system: Number(s.qty_on_hand),
          qty_actual: String(s.qty_on_hand), // bawaan = stok sistem
        })));
      } catch {
        if (!batal) setItems([]);
      } finally {
        if (!batal) setLoadingItems(false);
      }
    })();
    return () => { batal = true; };
  }, [projectId]);

  async function handleSubmit() {
    setError("");
    if (!projectId || items.length === 0) { setError("Pilih proyek terlebih dahulu"); return; }
    setSaving(true);
    try {
      const r = await api.post<HasilOpname>("/api/v1/procurement/stocks/opname", {
        project_id: projectId,
        notes: notes || null,
        items: items.map(i => ({ material_id: i.material_id, qty_actual: Number(i.qty_actual) })),
      });
      setResult(r.data);
    } catch (err: unknown) {
      setError(pesanError(err, "Gagal menyimpan opname"));
    } finally { setSaving(false); }
  }

  const kolom: Kolom<BarisOpname>[] = [
    { kunci: "material", judul: "Material", kepalaBaris: true, render: i => i.material_name },
    { kunci: "sistem", judul: "Stok Sistem", rata: "kanan", render: i => <span style={{ color: C.mid }}>{i.qty_system} {i.unit}</span> },
    {
      kunci: "fisik", judul: "Stok Fisik Aktual", rata: "tengah",
      render: (i) => {
        const idx = items.findIndex(x => x.material_id === i.material_id);
        return (
          <>
            <input
              type="number" value={i.qty_actual}
              aria-label={`Stok fisik aktual untuk ${i.material_name}`}
              onChange={e => setItems(prev => prev.map((it, j) => j === idx ? { ...it, qty_actual: e.target.value } : it))}
              style={{ width: 90, textAlign: "center", padding: "4px 8px", border: `1px solid ${C.border}`, borderRadius: 6, fontSize: 13, background: C.surface, color: C.text }}
            />
            <span style={{ marginLeft: 4, color: C.muted, fontSize: 12 }}>{i.unit}</span>
          </>
        );
      },
    },
    {
      kunci: "selisih", judul: "Selisih", rata: "kanan",
      render: (i) => {
        const selisih = Number(i.qty_actual) - i.qty_system;
        return (
          <span style={{ fontWeight: 600, color: selisih < 0 ? C.danger : selisih > 0 ? C.success : C.muted }}>
            {selisih === 0 ? "—" : `${selisih > 0 ? "+" : ""}${selisih} ${i.unit}`}
          </span>
        );
      },
    },
  ];

  if (result) {
    return (
      <Modal title="Opname Selesai" onClose={onSuccess} width={440}>
        <div style={{ textAlign: "center", padding: "8px 0 16px" }}>
          <div style={{ fontWeight: 700, fontSize: 15, color: C.text, marginBottom: 8 }}>Opname berhasil disimpan</div>
          <div style={{ fontSize: 13, color: C.mid, marginBottom: 16 }}>
            Dilakukan oleh: <strong>{result.opname_by}</strong>
          </div>
          <div style={{ display: "flex", gap: 12, justifyContent: "center", fontSize: 13, flexWrap: "wrap" }}>
            <div style={{ background: C.bg, borderRadius: 10, padding: "12px 20px", textAlign: "center" }}>
              <div style={{ fontSize: 24, fontWeight: 800, color: C.text, fontVariantNumeric: "tabular-nums" }}>{result.total_items_checked}</div>
              <div style={{ color: C.mid }}>Item diperiksa</div>
            </div>
            <div style={{ background: "var(--warning-bg)", borderRadius: 10, padding: "12px 20px", textAlign: "center" }}>
              <div style={{ fontSize: 24, fontWeight: 800, color: C.warning, fontVariantNumeric: "tabular-nums" }}>{result.items_with_adjustment}</div>
              <div style={{ color: C.mid }}>Ada selisih</div>
            </div>
            <div style={{ background: "var(--success-bg)", borderRadius: 10, padding: "12px 20px", textAlign: "center" }}>
              <div style={{ fontSize: 24, fontWeight: 800, color: C.success, fontVariantNumeric: "tabular-nums" }}>{result.items_unchanged}</div>
              <div style={{ color: C.mid }}>Sesuai</div>
            </div>
          </div>
          <div style={{ display: "flex", justifyContent: "center", marginTop: 20 }}>
            <Btn onClick={onSuccess}>Tutup</Btn>
          </div>
        </div>
      </Modal>
    );
  }

  return (
    <Modal title="Opname Stok" onClose={onClose} width={640}>
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {error && <KotakGalat pesan={error} />}

        <Select label="Proyek *" value={projectId} onChange={e => setProjectId(e.target.value)}>
          <option value="">— Pilih Proyek —</option>
          {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
        </Select>

        <Input label="Catatan Opname" value={notes} onChange={e => setNotes(e.target.value)} placeholder="cth: Opname Minggu 2 Juni 2026" />

        {projectId && (
          <>
            <div style={{ fontSize: 13, fontWeight: 600, color: C.text, marginTop: 4 }}>Input Stok Fisik Aktual</div>
            {loadingItems ? <Memuat teks="Memuat daftar material..." /> : (
              <div style={{ border: `1px solid ${C.border}`, borderRadius: 10, overflow: "hidden" }}>
                <Tabel              berpermukaan
                  kolom={kolom}
                  data={items}
                  kunciBaris={i => i.material_id}
                  caption="Stok material di proyek ini: jumlah menurut sistem, jumlah fisik yang dihitung, dan selisih keduanya."
                  kosong={<Kosong judul="Belum ada stok di proyek ini" sebab="Opname mencocokkan catatan dengan fisik. Selama proyek ini belum pernah menerima material, tak ada catatan untuk dicocokkan." />}
                />
              </div>
            )}
          </>
        )}

        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 4 }}>
          <Btn variant="secondary" onClick={onClose}>Batal</Btn>
          <Btn onClick={() => void handleSubmit()} loading={saving} disabled={!projectId || items.length === 0}>
            Simpan Opname
          </Btn>
        </div>
      </div>
    </Modal>
  );
}
