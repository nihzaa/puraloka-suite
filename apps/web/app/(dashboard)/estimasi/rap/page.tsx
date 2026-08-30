"use client";

/**
 * ANGGARAN PELAKSANAAN (RAP) — layar lengkap: pagu, material, tenaga kerja.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * DISALIN dari berkas 4.070 baris, BUKAN ditulis ulang
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Layar ini memuat aturan bisnis yang mahal kalau menyimpang sedikit saja:
 *
 *   • **RAP ≠ RAB.** RAB = rencana JUAL ke klien (harga pasar + upah harian
 *     lewat AHSP). RAP = rencana BELANJA internal (harga supplier nyata +
 *     borongan mandor). Selisihnya margin yang dikelola. Tertukar sekali,
 *     seluruh CPI/SPI jadi optimistis sistematis.
 *
 *   • **qty_ahsp beku, qty_adjusted yang boleh diubah.** Volume material
 *     DITURUNKAN dari take-off RAB lalu boleh disesuaikan sebelum dikunci —
 *     itu SATU-SATUNYA titik penyesuaian, dan jejak asalnya tetap ada.
 *
 *   • **Sekali dikunci, beku total.** Guard-nya di DB, bukan cuma UI, dan tak
 *     ada jalur "buka kunci". Penyesuaian sesudahnya hanya lewat change-log
 *     yang WAJIB beralasan (ditegakkan trigger, bukan validasi form).
 *
 * Mengetik ulang semua itu = mengundang salah satu aturan hilang tanpa gejala.
 * Yang dipindahkan cukup rumahnya: dari tab di berkas raksasa jadi rute
 * `/estimasi/rap`.
 */

import { Suspense, useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { api } from "@/lib/api";
import { C } from "@/lib/warna-ui";
import { Tabel } from "@/components/dasar";
import { KebutuhanMaterial } from "@/components/kebutuhan-material";
import { GAYA_KARTU } from "@/components/ui-dasar";
import { GAYA_ISIAN } from "@/components/isian";
import { formatRupiah, formatKuantitas, formatTanggalJam } from "@/lib/format";
import {
  CheckCircle2, ClipboardList, Lock, Package, Plus, History, 
  Pencil, HardHat, ChevronDown, ChevronRight,
} from "lucide-react";
import { Modal, StatusBadge, btnPrimary, btnGhost } from "../_bersama/kerangka";
import { LayarKosong } from "@/components/layar-kosong";

const fmtRp = formatRupiah;
const lbl: React.CSSProperties = {
  display: "block", fontSize: 12, fontWeight: 600,
  color: "var(--text-primary)", marginBottom: 5,
};


// ── Tipe respons API ──────────────────────────────────────────────────────
interface Project { id: string; name: string }
interface VersionSummary { id: string; version_number: number; status: string; total_amount: number }
interface Scenario { id: string; name: string; purpose: string | null; status: string; versions: VersionSummary[] }
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


function RapTab() {
  /*
    PROYEK HIDUP DI URL, bukan di state.

    Versi tab menyimpannya sebagai `useState` — wajar saat itu, karena seluruh
    modul memang satu halaman. Setelah dipecah jadi rute, itu jadi cacat:
    `/estimasi/rap?proyek=…` mengabaikan parameternya, sehingga tautan dari
    layar RAB ("Buka RAB proyek ini") dan tautan yang dibagikan ke rekan
    mendarat di layar kosong yang menyuruh memilih proyek lagi.

    Kemampuan berbagi tautan justru salah satu alasan §6c memecah tab jadi
    halaman. Menyalin state lokalnya apa adanya akan membatalkan alasan itu.
  */
  const router = useRouter();
  const params = useSearchParams();
  const projectId = params.get("proyek") ?? "";
  const setProjectId = useCallback((id: string) => {
    router.push(id ? `/estimasi/rap?proyek=${id}` : "/estimasi/rap");
  }, [router]);

  const [projects, setProjects] = useState<Project[]>([]);
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

      {/*
        Kekosongan yang MENJELASKAN DIRI (spec §5), bukan satu baris abu-abu.

        Kalimat lama berbunyi "…buat satu dari versi estimasi yang sudah
        disusun di tab Komposer" — menunjuk tab yang SUDAH TIDAK ADA sejak
        modul ini dipecah jadi rute. Petunjuk yang menunjuk tempat yang tak
        ada lebih buruk daripada tak ada petunjuk: pemakainya mencari sesuatu
        yang mustahil ditemukan, lalu menyimpulkan dirinya yang salah.
      */}
      {/*
        Proyek BELUM dipilih — keadaan pertama yang dilihat setiap orang, dan
        sampai 2026-08-17 ia menghasilkan HALAMAN PUTIH.

        Seluruh isi halaman ini bersyarat `projectId`, jadi tanpa proyek
        terpilih tak satu pun blok di bawah dirender: tak ada tabel, tak ada
        empty state, tak ada penjelasan. Persis kegagalan yang jadi ALASAN
        utama rombak modul ini (spec §5, "Material & RAP = halaman putih"), dan
        ia lolos karena `uji-layar-kosong-menjelaskan` memeriksa apakah berkas
        PUNYA empty state — bukan apakah setiap jalan kosong sampai ke sana.

        /estimasi/rab dan /estimasi/varians sudah menangani keadaan ini sejak
        awal; RAP tertinggal karena ia memakai state lokal, bukan `?proyek=`
        di URL, sehingga tak ikut pola early-return keduanya.
      */}
      {!projectId && (
        <LayarKosong
          ikon={<ClipboardList size={21} />}
          judul="Pilih proyek dulu"
          apa="RAP adalah anggaran biaya pelaksanaan — rencana belanja internal satu proyek, beda dari RAB yang merupakan nilai jual ke klien."
          kenapa="Ia selalu melekat pada satu proyek. Pilih proyeknya di atas, atau buka dari daftar di Ikhtisar."
          aksi={{ label: "Lihat daftar proyek", href: "/estimasi" }}
        />
      )}

      {projectId && rapList.length === 0 && (
        <LayarKosong
          ikon={<ClipboardList size={21} />}
          judul="Belum ada RAP untuk proyek ini"
          apa="RAP adalah anggaran biaya pelaksanaan — rencana belanja internal, beda dari RAB yang merupakan nilai jual ke klien."
          kenapa="Ia dibentuk dari RAB yang sudah terkunci; take-off materialnya jadi dasar pagu."
          aksi={{ label: "Buka RAB proyek ini", href: `/estimasi/rab?proyek=${projectId}` }}
        />
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
            {/*
              KEBUTUHAN MATERIAL — ditaruh SEBELUM tabel penyesuaian.

              Tabel di bawah menjawab "berapa yang saya anggarkan": qty yang
              sudah disesuaikan tangan, harga supplier, pagu. Yang ini
              menjawab pertanyaan yang datang LEBIH DULU: "sebenarnya butuh
              berapa, dan dari pekerjaan mana saja?"

              Urutannya disengaja. Menyesuaikan qty tanpa tahu asal angkanya
              adalah menebak — dan angka tebakan yang sudah masuk pagu
              terlihat persis sama dengan angka yang dihitung.

              Rutenya (`material-takeoff`) sudah ada sejak lama dan benar,
              tapi diukur 2026-08-20: NOL halaman memakainya.
            */}
            <div style={{ marginBottom: 16 }}>
              <KebutuhanMaterial estimateVersionId={detail.data.estimate_version_id} />
            </div>
            {/* Dipindahkan ke <Tabel> 2026-08-07 (UI-0-4) — caption sr-only,
                scope="row", tabular-nums, dan overflow-x dijamin komponen.

                `kepalaBaris` di Material: nama bahannya yang menamai baris. Enam
                kolom lain angka, dan dua di antaranya medan isian — dibacakan
                tanpa nama material, tak ada yang bisa ditempatkan.

                Pesan kosong pindah ke prop `kosong`: sebagai <td colSpan> di
                <tbody> pembaca layar membacakannya seolah nama sebuah baris. */}
            <Tabel<RapMaterialLine>
              berpermukaan
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
              berpermukaan
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
              berpermukaan
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
        {allVersions.length === 0 && <p style={{ fontSize: 12, color: C.muted, margin: "-6px 0 12px" }}>Belum ada RAB di proyek ini — susun dulu di halaman Susun RAB.</p>}
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

// ── Halaman ───────────────────────────────────────────────────────────────
export default function RapPage() {
  /*
    `useSearchParams()` menuntut batas Suspense di App Router. Tanpa ini,
    build gagal dengan "missing suspense boundary" — dan `next dev` TIDAK
    menampilkannya, jadi baru ketahuan saat `next build`.
  */
  return (
    <Suspense fallback={null}>
      <RapTab />
    </Suspense>
  );
}
