"use client";

// ============================================================================
// Detail Aset — Portal PM (Task 40, Tahap 7).
//
// Tab Ringkas: kartu meter + biaya/jam + kesehatan servis + jadwal
// perawatan + tombol catat pemakaian/servis/biaya + mutasi antar-proyek.
// Tab Penyusutan: proyeksi nilai buku + tombol "Catat Penyusutan"
// (`POST /assets/:id/depreciation`, `assets:manage`) dan "Jurnalkan
// Periode Ini" (`POST /alat-operasional/penyusutan/jurnalkan`,
// `gl:manage`).
//
// ⚠️ PM PUNYA `gl:manage` PENUH — dikonfirmasi LANGSUNG lewat query live
// `role_permissions` untuk KEDUA baris role `pm` (global template DAN
// tenant, migrasi menyeed keduanya — lihat catatan CLAUDE.md §7 soal baris
// kembar): `gl:manage = true` pada keduanya, sama dengan `gl:view`/
// `gl:post`/`gl:void`. Tombol "Jurnalkan Periode Ini" karena itu DIBANGUN,
// bukan disembunyikan seperti draf pertama brief yang salah menyimpulkan
// sebaliknya.
//
// Data sumber TERPISAH dan bentuknya BEDA (dicek langsung ke kode, bukan
// ditebak dari nama): tab Ringkas memakai `GET /alat-operasional` (tabel
// `penyusutan_alat` untuk histori penyusutan ringkas + status jurnal), tab
// Penyusutan memakai `GET /assets/:id/depreciation` (tabel
// `asset_depreciation_logs` + proyeksi garis lurus/saldo menurun). Dua
// tabel penyusutan berbeda untuk dua modul berbeda — server tak
// menyatukannya, jadi halaman ini pun tidak.
//
// Dua state galat level-halaman TERPISAH (pelajaran Tahap 2-7): galat MUAT
// (dari `useData`, EmptyState penuh-halaman) dan galat AKSI (submit form di
// salah satu dari lima BottomSheet, `galatForm` — direset tiap sheet dibuka
// supaya galat sheet sebelumnya tak terbawa ke sheet berikutnya).
// ============================================================================

import { useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { Truck, AlertTriangle, Wrench, Fuel, ArrowLeftRight } from "lucide-react";
import { useData, invalidasi } from "@/lib/data-cache";
import { api } from "@/lib/api";
import EmptyState from "@/components/portal/EmptyState";
import SkeletonCard from "@/components/portal/SkeletonCard";
import BottomSheet from "@/components/portal/BottomSheet";
import SegmentedTab from "@/components/portal/SegmentedTab";
import type { RespAlatOperasional, RespPenyusutanAset, ProyekPM, GalatApi } from "../../_bersama/tipe";
import { pesanGalat } from "../../_bersama/tipe";

interface RespProyek { projects: ProyekPM[] }

function fmtRupiah(v: number | null | undefined): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return "—";
  return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(v);
}
const LABEL_JATUH_TEMPO: Record<string, string> = {
  aman: "Aman", segera: "Segera", jatuh_tempo: "Jatuh Tempo", belum_ada_acuan: "Belum Ada Acuan",
};

type SheetAksi = "pemakaian" | "servis" | "biaya" | "mutasi" | "catat-susut" | "jurnalkan" | null;

function bulanIni(): string {
  return new Date().toISOString().slice(0, 7) + "-01";
}

export default function PmAsetDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [tab, setTab] = useState<"ringkas" | "susut">("ringkas");
  const [sheet, setSheet] = useState<SheetAksi>(null);
  const [form, setForm] = useState({ jam_mulai: "", jam_selesai: "", biaya: "", uraian: "", jenis: "bbm", jumlah: "", to_project_id: "", periode: bulanIni() });
  const [mengirim, setMengirim] = useState(false);
  const [galatForm, setGalatForm] = useState<string | null>(null);
  const [pesanSukses, setPesanSukses] = useState<string | null>(null);

  const { data: dataOps, memuat, galat } = useData<RespAlatOperasional>("/api/v1/alat-operasional");
  const aset = useMemo(() => dataOps?.alat.find((a) => a.id === id) ?? null, [dataOps, id]);

  const urlSusut = `/api/v1/assets/${id}/depreciation`;
  const { data: dataSusut, memuat: memuatSusut, galat: galatSusut } = useData<RespPenyusutanAset>(tab === "susut" ? urlSusut : null);
  const { data: dataProyek } = useData<RespProyek>("/api/v1/projects");
  const daftarProyek = useMemo(() => dataProyek?.projects ?? [], [dataProyek]);

  function bukaSheet(s: Exclude<SheetAksi, null>) {
    setSheet(s);
    setGalatForm(null);
    setPesanSukses(null);
  }

  async function kirimAksi() {
    if (!sheet || !id) return;
    setMengirim(true);
    setGalatForm(null);
    setPesanSukses(null);
    try {
      if (sheet === "pemakaian") {
        await api.post("/api/v1/alat-operasional/pemakaian", {
          asset_id: id, jam_mulai: Number(form.jam_mulai) || undefined, jam_selesai: Number(form.jam_selesai) || undefined,
        });
      } else if (sheet === "servis") {
        await api.post("/api/v1/alat-operasional/perawatan", {
          asset_id: id, biaya: Number(form.biaya) || 0, uraian: form.uraian.trim() || undefined, tak_terjadwal: true,
        });
      } else if (sheet === "biaya") {
        await api.post("/api/v1/alat-operasional/biaya", {
          asset_id: id, jenis: form.jenis, jumlah: Number(form.jumlah) || 0, uraian: form.uraian.trim() || undefined,
        });
      } else if (sheet === "mutasi") {
        await api.post(`/api/v1/assets/${id}/movements`, { to_project_id: form.to_project_id || null });
      } else if (sheet === "catat-susut") {
        const [tahun, bulan] = form.periode.slice(0, 7).split("-").map(Number);
        await api.post(`/api/v1/assets/${id}/depreciation`, { period_year: tahun, period_month: bulan });
        invalidasi(urlSusut);
      } else if (sheet === "jurnalkan") {
        await api.post("/api/v1/alat-operasional/penyusutan/jurnalkan", { periode: form.periode });
        setPesanSukses("Penyusutan periode ini berhasil dijurnalkan. Jurnal berstatus draft — posting dilakukan terpisah di Buku Besar.");
        invalidasi(urlSusut);
      }
      if (sheet !== "jurnalkan") setSheet(null);
      setForm((f) => ({ ...f, jam_mulai: "", jam_selesai: "", biaya: "", uraian: "", jenis: "bbm", jumlah: "", to_project_id: "" }));
      invalidasi("/api/v1/alat-operasional");
    } catch (e) {
      setGalatForm(pesanGalat(e as GalatApi, "Gagal menyimpan"));
    } finally {
      setMengirim(false);
    }
  }

  if (memuat) return <SkeletonCard tinggi={200} />;
  if (galat) return <EmptyState icon={AlertTriangle} judul="Gagal memuat aset" deskripsi={pesanGalat(galat as GalatApi, "Coba muat ulang.")} />;
  if (!aset) return <EmptyState icon={Truck} judul="Aset tidak ditemukan" deskripsi="Aset ini mungkin sudah dihapus." />;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <h1 style={{ fontSize: 20, fontWeight: 700, color: "var(--text-primary)", margin: 0 }}>{aset.name}</h1>
      <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>{aset.asset_code} · {aset.condition}</div>

      <SegmentedTab
        opsi={[{ value: "ringkas", label: "Ringkas" }, { value: "susut", label: "Penyusutan" }]}
        aktif={tab}
        onUbah={(v) => setTab(v as "ringkas" | "susut")}
      />

      {tab === "ringkas" && (
        <>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <div style={{ background: "var(--surface)", borderRadius: 14, padding: 12, border: "1px solid var(--border)", flex: "1 1 100px" }}>
              <div style={{ fontSize: 11, color: "var(--text-secondary)" }}>Meter</div>
              <div style={{ fontSize: 15, fontWeight: 700, color: "var(--text-primary)" }}>{aset.meter ?? "—"}</div>
            </div>
            <div style={{ background: "var(--surface)", borderRadius: 14, padding: 12, border: "1px solid var(--border)", flex: "1 1 100px" }}>
              <div style={{ fontSize: 11, color: "var(--text-secondary)" }}>Biaya/Jam</div>
              <div style={{ fontSize: 15, fontWeight: 700, color: "var(--text-primary)" }}>{aset.biaya.perJam !== null ? fmtRupiah(aset.biaya.perJam) : "—"}</div>
            </div>
            <div style={{ background: "var(--surface)", borderRadius: 14, padding: 12, border: "1px solid var(--border)", flex: "1 1 100px" }}>
              <div style={{ fontSize: 11, color: "var(--text-secondary)" }}>Servis Mendadak</div>
              <div style={{ fontSize: 15, fontWeight: 700, color: aset.kesehatan.preventifGagal ? "var(--danger)" : "var(--text-primary)" }}>
                {aset.kesehatan.rasioMendadak !== null ? `${aset.kesehatan.rasioMendadak}%` : "—"}
              </div>
            </div>
          </div>

          {aset.perawatan.length === 0 && (
            <EmptyState icon={Wrench} judul="Belum ada jadwal perawatan" deskripsi="Jadwal servis berkala belum diatur." />
          )}
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {aset.perawatan.map((p) => (
              <div key={p.id} style={{ display: "flex", justifyContent: "space-between", padding: 10, borderRadius: 10, background: "var(--surface)", border: "1px solid var(--border)" }}>
                <span style={{ fontSize: 13, color: "var(--text-secondary)" }}>{p.nama}</span>
                <span style={{ fontSize: 12, fontWeight: 700, color: p.jatuhTempo.status === "jatuh_tempo" ? "var(--danger)" : p.jatuhTempo.status === "segera" ? "var(--on-warning-bg)" : "var(--text-primary)" }}>
                  {LABEL_JATUH_TEMPO[p.jatuhTempo.status]}
                </span>
              </div>
            ))}
          </div>

          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button type="button" onClick={() => bukaSheet("pemakaian")}
              style={{ display: "flex", alignItems: "center", gap: 4, padding: "8px 12px", borderRadius: "var(--portal-radius-pill)", border: "1px solid var(--border)", background: "var(--surface)", color: "var(--text-primary)", fontSize: 12, fontWeight: 600, cursor: "pointer", minHeight: 40 }}>
              Catat Pemakaian
            </button>
            <button type="button" onClick={() => bukaSheet("servis")}
              style={{ display: "flex", alignItems: "center", gap: 4, padding: "8px 12px", borderRadius: "var(--portal-radius-pill)", border: "1px solid var(--border)", background: "var(--surface)", color: "var(--text-primary)", fontSize: 12, fontWeight: 600, cursor: "pointer", minHeight: 40 }}>
              <Wrench size={14} aria-hidden="true" /> Catat Servis
            </button>
            <button type="button" onClick={() => bukaSheet("biaya")}
              style={{ display: "flex", alignItems: "center", gap: 4, padding: "8px 12px", borderRadius: "var(--portal-radius-pill)", border: "1px solid var(--border)", background: "var(--surface)", color: "var(--text-primary)", fontSize: 12, fontWeight: 600, cursor: "pointer", minHeight: 40 }}>
              <Fuel size={14} aria-hidden="true" /> Catat Biaya
            </button>
            <button type="button" onClick={() => bukaSheet("mutasi")}
              style={{ display: "flex", alignItems: "center", gap: 4, padding: "8px 12px", borderRadius: "var(--portal-radius-pill)", border: "1px solid var(--border)", background: "var(--surface)", color: "var(--text-primary)", fontSize: 12, fontWeight: 600, cursor: "pointer", minHeight: 40 }}>
              <ArrowLeftRight size={14} aria-hidden="true" /> Mutasi
            </button>
          </div>
        </>
      )}

      {tab === "susut" && (
        <>
          {memuatSusut && <SkeletonCard tinggi={140} />}
          {!memuatSusut && galatSusut && (
            <EmptyState icon={AlertTriangle} judul="Gagal memuat penyusutan" deskripsi={pesanGalat(galatSusut as GalatApi, "Coba muat ulang.")} />
          )}
          {!memuatSusut && !galatSusut && dataSusut && (
            <>
              {!dataSusut.meta.dapat_disusutkan && (
                <EmptyState icon={AlertTriangle} judul="Belum bisa disusutkan" deskripsi={dataSusut.meta.alasan ?? "—"} />
              )}
              {dataSusut.meta.dapat_disusutkan && (
                <>
                  <div style={{ background: "var(--surface)", borderRadius: 14, padding: 14, border: "1px solid var(--border)" }}>
                    <div style={{ display: "flex", justifyContent: "space-between" }}>
                      <span style={{ fontSize: 12, color: "var(--text-secondary)" }}>Nilai Buku Kini</span>
                      <span style={{ fontSize: 13, fontWeight: 700, color: "var(--text-primary)" }}>{fmtRupiah(dataSusut.meta.nilai_buku_kini)}</span>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between" }}>
                      <span style={{ fontSize: 12, color: "var(--text-secondary)" }}>Beban Bulan Ini</span>
                      <span style={{ fontSize: 13, fontWeight: 700, color: "var(--text-primary)" }}>{fmtRupiah(dataSusut.meta.beban_bulan_ini)}</span>
                    </div>
                    {dataSusut.meta.catatan && <div style={{ fontSize: 11, color: "var(--text-secondary)", marginTop: 8 }}>{dataSusut.meta.catatan}</div>}
                  </div>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    <button type="button" onClick={() => bukaSheet("catat-susut")}
                      style={{ display: "flex", alignItems: "center", gap: 4, padding: "8px 12px", borderRadius: "var(--portal-radius-pill)", border: "1px solid var(--border)", background: "var(--surface)", color: "var(--text-primary)", fontSize: 12, fontWeight: 600, cursor: "pointer", minHeight: 40 }}>
                      Catat Penyusutan
                    </button>
                    <button type="button" onClick={() => bukaSheet("jurnalkan")}
                      style={{ display: "flex", alignItems: "center", gap: 4, padding: "8px 12px", borderRadius: "var(--portal-radius-pill)", border: "none", background: "var(--grad-aksen)", color: "var(--on-navy)", fontSize: 12, fontWeight: 700, cursor: "pointer", minHeight: 40 }}>
                      Jurnalkan Periode Ini
                    </button>
                  </div>
                </>
              )}
              <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>
                {dataSusut.data.tercatat.length} periode tercatat.
              </div>
              {dataSusut.data.tercatat.length === 0 && (
                <EmptyState icon={Wrench} judul="Belum ada penyusutan tercatat" deskripsi="Baris penyusutan bulanan akan muncul di sini." />
              )}
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {dataSusut.data.tercatat.map((l) => (
                  <div key={l.id} style={{ display: "flex", justifyContent: "space-between", padding: 10, borderRadius: 10, background: "var(--surface)", border: "1px solid var(--border)" }}>
                    <span style={{ fontSize: 12, color: "var(--text-secondary)" }}>{l.period_month}/{l.period_year}</span>
                    <span style={{ fontSize: 12, fontWeight: 700, color: l.journal_entry_id ? "var(--on-success-bg)" : "var(--on-warning-bg)" }}>
                      {fmtRupiah(l.depreciation_amount)} {l.journal_entry_id ? "· Terjurnal" : "· Belum Dijurnalkan"}
                    </span>
                  </div>
                ))}
              </div>
            </>
          )}
        </>
      )}

      <BottomSheet terbuka={sheet === "pemakaian"} onTutup={() => setSheet(null)} judul="Catat Pemakaian">
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: "var(--text-secondary)" }}>Jam Mulai</span>
            <input type="number" value={form.jam_mulai} onChange={(e) => setForm((f) => ({ ...f, jam_mulai: e.target.value }))}
              style={{ minHeight: 44, padding: "0 12px", borderRadius: 12, border: "1px solid var(--border)", fontSize: 14 }} />
          </label>
          <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: "var(--text-secondary)" }}>Jam Selesai</span>
            <input type="number" value={form.jam_selesai} onChange={(e) => setForm((f) => ({ ...f, jam_selesai: e.target.value }))}
              style={{ minHeight: 44, padding: "0 12px", borderRadius: 12, border: "1px solid var(--border)", fontSize: 14 }} />
          </label>
          {galatForm && <div role="alert" style={{ fontSize: 12, color: "var(--on-danger-bg)", padding: 10, borderRadius: 10, background: "var(--danger-bg)", border: "1px solid var(--danger-border)" }}>{galatForm}</div>}
          <button type="button" onClick={() => void kirimAksi()} disabled={mengirim}
            style={{ minHeight: 48, borderRadius: "var(--portal-radius-pill)", border: "none", background: mengirim ? "var(--surface-subtle)" : "var(--grad-aksen)", color: mengirim ? "var(--text-muted)" : "var(--on-navy)", fontSize: 14, fontWeight: 700, cursor: mengirim ? "default" : "pointer" }}>
            {mengirim ? "Menyimpan…" : "Simpan"}
          </button>
        </div>
      </BottomSheet>

      <BottomSheet terbuka={sheet === "servis"} onTutup={() => setSheet(null)} judul="Catat Servis">
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: "var(--text-secondary)" }}>Biaya</span>
            <input type="number" value={form.biaya} onChange={(e) => setForm((f) => ({ ...f, biaya: e.target.value }))}
              style={{ minHeight: 44, padding: "0 12px", borderRadius: 12, border: "1px solid var(--border)", fontSize: 14 }} />
          </label>
          <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: "var(--text-secondary)" }}>Uraian</span>
            <input value={form.uraian} onChange={(e) => setForm((f) => ({ ...f, uraian: e.target.value }))}
              style={{ minHeight: 44, padding: "0 12px", borderRadius: 12, border: "1px solid var(--border)", fontSize: 14 }} />
          </label>
          {galatForm && <div role="alert" style={{ fontSize: 12, color: "var(--on-danger-bg)", padding: 10, borderRadius: 10, background: "var(--danger-bg)", border: "1px solid var(--danger-border)" }}>{galatForm}</div>}
          <button type="button" onClick={() => void kirimAksi()} disabled={mengirim}
            style={{ minHeight: 48, borderRadius: "var(--portal-radius-pill)", border: "none", background: mengirim ? "var(--surface-subtle)" : "var(--grad-aksen)", color: mengirim ? "var(--text-muted)" : "var(--on-navy)", fontSize: 14, fontWeight: 700, cursor: mengirim ? "default" : "pointer" }}>
            {mengirim ? "Menyimpan…" : "Simpan"}
          </button>
        </div>
      </BottomSheet>

      <BottomSheet terbuka={sheet === "biaya"} onTutup={() => setSheet(null)} judul="Catat Biaya Operasional">
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: "var(--text-secondary)" }}>Jenis</span>
            <select value={form.jenis} onChange={(e) => setForm((f) => ({ ...f, jenis: e.target.value }))}
              style={{ minHeight: 44, padding: "0 12px", borderRadius: 12, border: "1px solid var(--border)", fontSize: 14 }}>
              <option value="bbm">BBM</option>
              <option value="operator">Operator</option>
              <option value="suku_cadang">Suku Cadang</option>
              <option value="lainnya">Lainnya</option>
            </select>
          </label>
          <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: "var(--text-secondary)" }}>Jumlah</span>
            <input type="number" value={form.jumlah} onChange={(e) => setForm((f) => ({ ...f, jumlah: e.target.value }))}
              style={{ minHeight: 44, padding: "0 12px", borderRadius: 12, border: "1px solid var(--border)", fontSize: 14 }} />
          </label>
          {galatForm && <div role="alert" style={{ fontSize: 12, color: "var(--on-danger-bg)", padding: 10, borderRadius: 10, background: "var(--danger-bg)", border: "1px solid var(--danger-border)" }}>{galatForm}</div>}
          <button type="button" onClick={() => void kirimAksi()} disabled={mengirim}
            style={{ minHeight: 48, borderRadius: "var(--portal-radius-pill)", border: "none", background: mengirim ? "var(--surface-subtle)" : "var(--grad-aksen)", color: mengirim ? "var(--text-muted)" : "var(--on-navy)", fontSize: 14, fontWeight: 700, cursor: mengirim ? "default" : "pointer" }}>
            {mengirim ? "Menyimpan…" : "Simpan"}
          </button>
        </div>
      </BottomSheet>

      <BottomSheet terbuka={sheet === "mutasi"} onTutup={() => setSheet(null)} judul="Mutasi Antar-Proyek">
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: "var(--text-secondary)" }}>Proyek Tujuan (kosong = kembali ke gudang)</span>
            <select value={form.to_project_id} onChange={(e) => setForm((f) => ({ ...f, to_project_id: e.target.value }))}
              style={{ minHeight: 44, padding: "0 12px", borderRadius: 12, border: "1px solid var(--border)", fontSize: 14 }}>
              <option value="">— Kembali ke gudang —</option>
              {daftarProyek.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </label>
          {galatForm && <div role="alert" style={{ fontSize: 12, color: "var(--on-danger-bg)", padding: 10, borderRadius: 10, background: "var(--danger-bg)", border: "1px solid var(--danger-border)" }}>{galatForm}</div>}
          <button type="button" onClick={() => void kirimAksi()} disabled={mengirim}
            style={{ minHeight: 48, borderRadius: "var(--portal-radius-pill)", border: "none", background: mengirim ? "var(--surface-subtle)" : "var(--grad-aksen)", color: mengirim ? "var(--text-muted)" : "var(--on-navy)", fontSize: 14, fontWeight: 700, cursor: mengirim ? "default" : "pointer" }}>
            {mengirim ? "Memindahkan…" : "Pindahkan"}
          </button>
        </div>
      </BottomSheet>

      <BottomSheet terbuka={sheet === "catat-susut"} onTutup={() => setSheet(null)} judul="Catat Penyusutan">
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: "var(--text-secondary)" }}>Periode (bulan)</span>
            <input type="month" value={form.periode.slice(0, 7)} onChange={(e) => setForm((f) => ({ ...f, periode: e.target.value + "-01" }))}
              style={{ minHeight: 44, padding: "0 12px", borderRadius: 12, border: "1px solid var(--border)", fontSize: 14 }} />
          </label>
          <p style={{ fontSize: 11, color: "var(--text-secondary)", margin: 0 }}>
            Mencatat baris penyusutan periode ini (belum menjurnalkan). Menyimpan
            dua kali untuk periode yang sama akan ditolak — satu periode, satu baris.
          </p>
          {galatForm && <div role="alert" style={{ fontSize: 12, color: "var(--on-danger-bg)", padding: 10, borderRadius: 10, background: "var(--danger-bg)", border: "1px solid var(--danger-border)" }}>{galatForm}</div>}
          <button type="button" onClick={() => void kirimAksi()} disabled={mengirim}
            style={{ minHeight: 48, borderRadius: "var(--portal-radius-pill)", border: "none", background: mengirim ? "var(--surface-subtle)" : "var(--grad-aksen)", color: mengirim ? "var(--text-muted)" : "var(--on-navy)", fontSize: 14, fontWeight: 700, cursor: mengirim ? "default" : "pointer" }}>
            {mengirim ? "Menyimpan…" : "Simpan"}
          </button>
        </div>
      </BottomSheet>

      <BottomSheet terbuka={sheet === "jurnalkan"} onTutup={() => setSheet(null)} judul="Jurnalkan Penyusutan">
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: "var(--text-secondary)" }}>Periode (bulan)</span>
            <input type="month" value={form.periode.slice(0, 7)} onChange={(e) => setForm((f) => ({ ...f, periode: e.target.value + "-01" }))}
              style={{ minHeight: 44, padding: "0 12px", borderRadius: 12, border: "1px solid var(--border)", fontSize: 14 }} />
          </label>
          <p style={{ fontSize: 11, color: "var(--text-secondary)", margin: 0 }}>
            Menjurnalkan SELURUH baris penyusutan periode ini yang belum
            dijurnalkan (semua aset tenant, bukan cuma aset ini) ke buku besar.
            Idempoten — memanggil ulang untuk periode yang sama tidak
            menggandakan jurnal (server hanya memproses baris yang belum
            tertaut jurnal).
          </p>
          {galatForm && <div role="alert" style={{ fontSize: 12, color: "var(--on-danger-bg)", padding: 10, borderRadius: 10, background: "var(--danger-bg)", border: "1px solid var(--danger-border)" }}>{galatForm}</div>}
          {pesanSukses && <div role="status" style={{ fontSize: 12, color: "var(--on-success-bg)", background: "var(--success-bg)", border: "1px solid var(--success-border)", borderRadius: 10, padding: 10 }}>{pesanSukses}</div>}
          <button type="button" onClick={() => void kirimAksi()} disabled={mengirim}
            style={{ minHeight: 48, borderRadius: "var(--portal-radius-pill)", border: "none", background: mengirim ? "var(--surface-subtle)" : "var(--grad-aksen)", color: mengirim ? "var(--text-muted)" : "var(--on-navy)", fontSize: 14, fontWeight: 700, cursor: mengirim ? "default" : "pointer" }}>
            {mengirim ? "Menjurnalkan…" : "Jurnalkan"}
          </button>
        </div>
      </BottomSheet>
    </div>
  );
}
