"use client";

// ============================================================================
// Risiko & Perizinan — Portal PM (Task 41, Tahap 7).
//
// Dua tab: Risiko (register + mitigasi ringkas per baris) dan Perizinan
// (masa berlaku izin proyek terhadap RENTANG PROYEK, bukan hanya hari ini).
// Keduanya dari `routes/v1/risiko-proyek.ts`: `risiko:view`/`risiko:manage`
// dan `izin:view`/`izin:manage` — PM PUNYA keduanya PENUH, dikonfirmasi
// LANGSUNG lewat query live `role_permissions` untuk KEDUA baris role `pm`
// (global + tenant).
//
// ⚠️ Modul `sengketa` (Sengketa & Klaim) SENGAJA TIDAK ADA di halaman ini.
// Query yang sama membuktikan KEDUA baris role `pm` NOL baris grant untuk
// `sengketa:view` maupun `sengketa:manage` — bukan `allowed=false`, baris
// izinnya memang tidak pernah dibuat. PM genuinely tak punya akses modul
// itu sama sekali (lihat komentar `RespRisikoProyek` di `_bersama/tipe.ts`).
//
// Galat MUAT (dari `useData`, per-tab) dan galat AKSI (submit form tambah
// risiko/izin di BottomSheet, `galatForm`) dipisah — pelajaran Tahap 2-7:
// gagal simpan tak boleh menghapus/menutupi pesan gagal muat, dan sebaliknya.
// `galatForm` direset tiap sheet dibuka supaya galat sheet sebelumnya tak
// terbawa ke sheet berikutnya.
// ============================================================================

import { useMemo, useState } from "react";
import { AlertTriangle, ShieldAlert, Plus, FileCheck } from "lucide-react";
import { useData, invalidasi } from "@/lib/data-cache";
import { api } from "@/lib/api";
import EmptyState from "@/components/portal/EmptyState";
import SkeletonCard from "@/components/portal/SkeletonCard";
import SegmentedTab from "@/components/portal/SegmentedTab";
import BottomSheet from "@/components/portal/BottomSheet";
import StatusBadge, { type VarianStatus } from "@/components/portal/StatusBadge";
import type {
  ProyekPM, RespRisikoProyek, RespIzinProyek, KategoriRisikoPM, GalatApi,
} from "../_bersama/tipe";
import { pesanGalat } from "../_bersama/tipe";

interface RespProyek { projects: ProyekPM[] }

const LABEL_KATEGORI: Record<KategoriRisikoPM, string> = {
  teknis: "Teknis", keuangan: "Keuangan", jadwal: "Jadwal", k3: "K3",
  lingkungan: "Lingkungan", hukum: "Hukum", pengadaan: "Pengadaan", eksternal: "Eksternal",
};
const VARIAN_TINGKAT: Record<string, VarianStatus> = {
  rendah: "approved", sedang: "info", tinggi: "pending", ekstrem: "rejected",
};
const LABEL_TINGKAT: Record<string, string> = {
  rendah: "Rendah", sedang: "Sedang", tinggi: "Tinggi", ekstrem: "Ekstrem",
};
const LABEL_MASA_IZIN: Record<string, string> = {
  belum_terbit: "Belum Terbit", berlaku: "Berlaku", akan_habis: "Akan Habis",
  kedaluwarsa: "Kedaluwarsa", ditolak: "Ditolak", dicabut: "Dicabut",
};
const VARIAN_MASA_IZIN: Record<string, VarianStatus> = {
  belum_terbit: "netral", berlaku: "approved", akan_habis: "pending",
  kedaluwarsa: "rejected", ditolak: "rejected", dicabut: "rejected",
};

type Tab = "risiko" | "izin";

export default function PmRisikoPage() {
  const [proyekId, setProyekId] = useState("");
  const [tab, setTab] = useState<Tab>("risiko");
  const [sheetRisiko, setSheetRisiko] = useState(false);
  const [sheetIzin, setSheetIzin] = useState(false);
  const [formRisiko, setFormRisiko] = useState({
    judul: "", kategori: "teknis" as KategoriRisikoPM, dampak: "3", kemungkinan: "3",
  });
  const [formIzin, setFormIzin] = useState({ jenis: "", nomor: "", berlaku_dari: "", berlaku_sampai: "" });
  const [mengirim, setMengirim] = useState(false);
  const [galatForm, setGalatForm] = useState<string | null>(null);

  const { data: dataProyek } = useData<RespProyek>("/api/v1/projects");
  const daftarProyek = useMemo(() => (dataProyek?.projects ?? []).filter((p) => p.pm), [dataProyek]);
  const proyekAktif = proyekId || daftarProyek[0]?.id || "";

  const urlRisiko = proyekAktif ? `/api/v1/proyek/${proyekAktif}/risiko` : null;
  const urlIzin = proyekAktif ? `/api/v1/proyek/${proyekAktif}/izin` : null;
  const { data: dataRisiko, memuat: memuatRisiko, galat: galatRisiko } =
    useData<RespRisikoProyek>(tab === "risiko" ? urlRisiko : null);
  const { data: dataIzin, memuat: memuatIzin, galat: galatIzin } =
    useData<RespIzinProyek>(tab === "izin" ? urlIzin : null);

  function bukaSheetRisiko() {
    setSheetRisiko(true);
    setGalatForm(null);
  }
  function bukaSheetIzin() {
    setSheetIzin(true);
    setGalatForm(null);
  }

  async function tambahRisiko() {
    if (!proyekAktif || !formRisiko.judul.trim()) {
      setGalatForm("Judul risiko wajib diisi.");
      return;
    }
    setMengirim(true);
    setGalatForm(null);
    try {
      await api.post(`/api/v1/proyek/${proyekAktif}/risiko`, {
        judul: formRisiko.judul.trim(),
        kategori: formRisiko.kategori,
        dampak: Number(formRisiko.dampak),
        kemungkinan: Number(formRisiko.kemungkinan),
      });
      setSheetRisiko(false);
      setFormRisiko({ judul: "", kategori: "teknis", dampak: "3", kemungkinan: "3" });
      invalidasi(urlRisiko ?? "");
    } catch (e) {
      setGalatForm(pesanGalat(e as GalatApi, "Gagal menambah risiko"));
    } finally {
      setMengirim(false);
    }
  }

  async function tambahIzin() {
    if (!proyekAktif || !formIzin.jenis.trim()) {
      setGalatForm("Jenis izin wajib diisi.");
      return;
    }
    setMengirim(true);
    setGalatForm(null);
    try {
      await api.post(`/api/v1/proyek/${proyekAktif}/izin`, {
        jenis: formIzin.jenis.trim(),
        nomor: formIzin.nomor.trim() || undefined,
        berlaku_dari: formIzin.berlaku_dari || undefined,
        berlaku_sampai: formIzin.berlaku_sampai || undefined,
        status: formIzin.nomor.trim() ? "terbit" : "rencana",
      });
      setSheetIzin(false);
      setFormIzin({ jenis: "", nomor: "", berlaku_dari: "", berlaku_sampai: "" });
      invalidasi(urlIzin ?? "");
    } catch (e) {
      setGalatForm(pesanGalat(e as GalatApi, "Gagal menambah izin"));
    } finally {
      setMengirim(false);
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--gap-bagian)" }}>
      <h1 style={{ fontSize: 20, fontWeight: 700, color: "var(--text-primary)", margin: 0 }}>
        Risiko & Perizinan
      </h1>

      {daftarProyek.length > 1 && (
        <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <span style={{ fontSize: 12, fontWeight: 600, color: "var(--text-secondary)" }}>Proyek</span>
          <select
            value={proyekAktif}
            onChange={(e) => setProyekId(e.target.value)}
            style={{ minHeight: 44, padding: "0 12px", borderRadius: 12, border: "1px solid var(--border)", fontSize: 14, background: "var(--surface)", color: "var(--text-primary)" }}
          >
            {daftarProyek.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </label>
      )}

      {!proyekAktif && (
        <EmptyState icon={ShieldAlert} judul="Pilih proyek" deskripsi="Register risiko & perizinan tercatat per proyek." />
      )}

      {proyekAktif && (
        <>
          <SegmentedTab
            opsi={[{ value: "risiko", label: "Risiko" }, { value: "izin", label: "Perizinan" }]}
            aktif={tab}
            onUbah={(v) => setTab(v as Tab)}
          />

          {tab === "risiko" && (
            <>
              <button
                type="button"
                onClick={bukaSheetRisiko}
                style={{ display: "flex", alignItems: "center", gap: 4, padding: "8px 14px", borderRadius: "var(--portal-radius-pill)", border: "none", background: "var(--grad-aksen)", color: "var(--on-navy)", fontSize: 13, fontWeight: 700, cursor: "pointer", minHeight: 40, alignSelf: "flex-start" }}
              >
                <Plus size={16} aria-hidden="true" /> Risiko
              </button>
              {memuatRisiko && <SkeletonCard tinggi={120} />}
              {!memuatRisiko && galatRisiko && (
                <EmptyState icon={AlertTriangle} judul="Gagal memuat" deskripsi={pesanGalat(galatRisiko as GalatApi, "Coba lagi.")} />
              )}
              {!memuatRisiko && !galatRisiko && dataRisiko && (
                <>
                  <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                    <div style={{ background: "var(--surface)", borderRadius: 14, padding: 12, border: "1px solid color-mix(in srgb, var(--border) 40%, transparent)", boxShadow: "var(--naik-1)", flex: "1 1 100px" }}>
                      <div style={{ fontSize: 11, color: "var(--text-secondary)" }}>Total</div>
                      <div style={{ fontSize: 17, fontWeight: 700, color: "var(--text-primary)" }}>{dataRisiko.ringkas.total}</div>
                    </div>
                    <div style={{ background: "var(--surface)", borderRadius: 14, padding: 12, border: "1px solid color-mix(in srgb, var(--border) 40%, transparent)", boxShadow: "var(--naik-1)", flex: "1 1 100px" }}>
                      <div style={{ fontSize: 11, color: "var(--text-secondary)" }}>Mendesak</div>
                      <div style={{ fontSize: 17, fontWeight: 700, color: dataRisiko.ringkas.mendesak > 0 ? "var(--danger)" : "var(--text-primary)" }}>
                        {dataRisiko.ringkas.mendesak}
                      </div>
                    </div>
                    <div style={{ background: "var(--surface)", borderRadius: 14, padding: 12, border: "1px solid color-mix(in srgb, var(--border) 40%, transparent)", boxShadow: "var(--naik-1)", flex: "1 1 100px" }}>
                      <div style={{ fontSize: 11, color: "var(--text-secondary)" }}>Ekstrem</div>
                      <div style={{ fontSize: 17, fontWeight: 700, color: dataRisiko.ringkas.per_tingkat.ekstrem > 0 ? "var(--danger)" : "var(--text-primary)" }}>
                        {dataRisiko.ringkas.per_tingkat.ekstrem}
                      </div>
                    </div>
                  </div>
                  {dataRisiko.risiko.length === 0 && (
                    <EmptyState icon={ShieldAlert} judul="Belum ada risiko" deskripsi="Daftar risiko proyek akan muncul di sini." />
                  )}
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    {dataRisiko.risiko.map((r) => (
                      <div
                        key={r.id}
                        style={{ background: "var(--surface)", borderRadius: 12, padding: 12, border: `1px solid ${r.mendesak ? "var(--danger-border)" : "var(--border)"}` }}
                      >
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
                          <div>
                            <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>{r.judul}</div>
                            <div style={{ fontSize: 11, color: "var(--text-secondary)" }}>{LABEL_KATEGORI[r.kategori]} · Skor {r.skor}</div>
                          </div>
                          <StatusBadge status={VARIAN_TINGKAT[r.tingkat]} label={LABEL_TINGKAT[r.tingkat]} />
                        </div>
                        {r.mendesak && (
                          <div style={{ fontSize: 11, color: "var(--danger)", marginTop: 6 }}>
                            {r.alasan_mendesak.join(" · ")}
                          </div>
                        )}
                        {r.tindakan.length > 0 && (
                          <div style={{ fontSize: 11, color: "var(--text-secondary)", marginTop: 6 }}>
                            {r.tindakan.length} tindakan mitigasi
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </>
              )}
            </>
          )}

          {tab === "izin" && (
            <>
              <button
                type="button"
                onClick={bukaSheetIzin}
                style={{ display: "flex", alignItems: "center", gap: 4, padding: "8px 14px", borderRadius: "var(--portal-radius-pill)", border: "none", background: "var(--grad-aksen)", color: "var(--on-navy)", fontSize: 13, fontWeight: 700, cursor: "pointer", minHeight: 40, alignSelf: "flex-start" }}
              >
                <Plus size={16} aria-hidden="true" /> Izin
              </button>
              {memuatIzin && <SkeletonCard tinggi={120} />}
              {!memuatIzin && galatIzin && (
                <EmptyState icon={AlertTriangle} judul="Gagal memuat" deskripsi={pesanGalat(galatIzin as GalatApi, "Coba lagi.")} />
              )}
              {!memuatIzin && !galatIzin && dataIzin && (
                <>
                  {dataIzin.kesiapan.boleh_jalan === false && (
                    <div role="alert" style={{ fontSize: 12, color: "var(--on-danger-bg)", background: "var(--danger-bg)", border: "1px solid var(--danger-border)", borderRadius: 10, padding: 10 }}>
                      Ada izin yang MEMBLOKIR pekerjaan: {dataIzin.kesiapan.memblokir.map((i) => i.jenis).join(", ")}
                    </div>
                  )}
                  {dataIzin.izin.length === 0 && (
                    <EmptyState icon={FileCheck} judul="Belum ada izin" deskripsi="Daftar perizinan proyek akan muncul di sini." />
                  )}
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    {dataIzin.izin.map((i) => (
                      <div
                        key={i.id}
                        style={{ background: "var(--surface)", borderRadius: 12, padding: 12, border: `1px solid ${i.memblokir ? "var(--danger-border)" : "var(--border)"}` }}
                      >
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
                          <div>
                            <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>{i.jenis}</div>
                            <div style={{ fontSize: 11, color: "var(--text-secondary)" }}>{i.nomor ?? "Belum bernomor"}</div>
                          </div>
                          <StatusBadge status={VARIAN_MASA_IZIN[i.masa]} label={LABEL_MASA_IZIN[i.masa]} />
                        </div>
                        {i.sisa_hari !== null && (
                          <div style={{ fontSize: 11, color: i.sisa_hari < 0 ? "var(--danger)" : "var(--text-secondary)", marginTop: 6 }}>
                            {i.sisa_hari < 0 ? `Kedaluwarsa ${Math.abs(i.sisa_hari)} hari lalu` : `Sisa ${i.sisa_hari} hari`}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </>
              )}
            </>
          )}
        </>
      )}

      <BottomSheet terbuka={sheetRisiko} onTutup={() => setSheetRisiko(false)} judul="Tambah Risiko">
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: "var(--text-secondary)" }}>Judul *</span>
            <input
              value={formRisiko.judul}
              onChange={(e) => setFormRisiko((f) => ({ ...f, judul: e.target.value }))}
              style={{ minHeight: 44, padding: "0 12px", borderRadius: 12, border: "1px solid var(--border)", fontSize: 14 }}
            />
          </label>
          <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: "var(--text-secondary)" }}>Kategori</span>
            <select
              value={formRisiko.kategori}
              onChange={(e) => setFormRisiko((f) => ({ ...f, kategori: e.target.value as KategoriRisikoPM }))}
              style={{ minHeight: 44, padding: "0 12px", borderRadius: 12, border: "1px solid var(--border)", fontSize: 14 }}
            >
              {(Object.keys(LABEL_KATEGORI) as KategoriRisikoPM[]).map((k) => (
                <option key={k} value={k}>{LABEL_KATEGORI[k]}</option>
              ))}
            </select>
          </label>
          <div style={{ display: "flex", gap: 8 }}>
            <label style={{ display: "flex", flexDirection: "column", gap: 6, flex: 1 }}>
              <span style={{ fontSize: 12, fontWeight: 600, color: "var(--text-secondary)" }}>Dampak (1-5)</span>
              <input
                type="number" min={1} max={5}
                value={formRisiko.dampak}
                onChange={(e) => setFormRisiko((f) => ({ ...f, dampak: e.target.value }))}
                style={{ minHeight: 44, padding: "0 12px", borderRadius: 12, border: "1px solid var(--border)", fontSize: 14 }}
              />
            </label>
            <label style={{ display: "flex", flexDirection: "column", gap: 6, flex: 1 }}>
              <span style={{ fontSize: 12, fontWeight: 600, color: "var(--text-secondary)" }}>Kemungkinan (1-5)</span>
              <input
                type="number" min={1} max={5}
                value={formRisiko.kemungkinan}
                onChange={(e) => setFormRisiko((f) => ({ ...f, kemungkinan: e.target.value }))}
                style={{ minHeight: 44, padding: "0 12px", borderRadius: 12, border: "1px solid var(--border)", fontSize: 14 }}
              />
            </label>
          </div>
          {galatForm && (
            <div role="alert" style={{ fontSize: 12, color: "var(--on-danger-bg)", padding: 10, borderRadius: 10, background: "var(--danger-bg)", border: "1px solid var(--danger-border)" }}>
              {galatForm}
            </div>
          )}
          <button
            type="button"
            onClick={() => void tambahRisiko()}
            disabled={mengirim}
            style={{ minHeight: 48, borderRadius: "var(--portal-radius-pill)", border: "none", background: mengirim ? "var(--surface-subtle)" : "var(--grad-aksen)", color: mengirim ? "var(--text-muted)" : "var(--on-navy)", fontSize: 14, fontWeight: 700, cursor: mengirim ? "default" : "pointer" }}
          >
            {mengirim ? "Menyimpan…" : "Simpan Risiko"}
          </button>
        </div>
      </BottomSheet>

      <BottomSheet terbuka={sheetIzin} onTutup={() => setSheetIzin(false)} judul="Tambah Izin">
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: "var(--text-secondary)" }}>Jenis Izin *</span>
            <input
              value={formIzin.jenis}
              onChange={(e) => setFormIzin((f) => ({ ...f, jenis: e.target.value }))}
              placeholder="mis. PBG, Izin Lingkungan"
              style={{ minHeight: 44, padding: "0 12px", borderRadius: 12, border: "1px solid var(--border)", fontSize: 14 }}
            />
          </label>
          <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: "var(--text-secondary)" }}>Nomor (kosong = masih diurus)</span>
            <input
              value={formIzin.nomor}
              onChange={(e) => setFormIzin((f) => ({ ...f, nomor: e.target.value }))}
              style={{ minHeight: 44, padding: "0 12px", borderRadius: 12, border: "1px solid var(--border)", fontSize: 14 }}
            />
          </label>
          <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: "var(--text-secondary)" }}>Berlaku Dari</span>
            <input
              type="date"
              value={formIzin.berlaku_dari}
              onChange={(e) => setFormIzin((f) => ({ ...f, berlaku_dari: e.target.value }))}
              style={{ minHeight: 44, padding: "0 12px", borderRadius: 12, border: "1px solid var(--border)", fontSize: 14 }}
            />
          </label>
          <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: "var(--text-secondary)" }}>Berlaku Sampai</span>
            <input
              type="date"
              value={formIzin.berlaku_sampai}
              onChange={(e) => setFormIzin((f) => ({ ...f, berlaku_sampai: e.target.value }))}
              style={{ minHeight: 44, padding: "0 12px", borderRadius: 12, border: "1px solid var(--border)", fontSize: 14 }}
            />
          </label>
          {galatForm && (
            <div role="alert" style={{ fontSize: 12, color: "var(--on-danger-bg)", padding: 10, borderRadius: 10, background: "var(--danger-bg)", border: "1px solid var(--danger-border)" }}>
              {galatForm}
            </div>
          )}
          <button
            type="button"
            onClick={() => void tambahIzin()}
            disabled={mengirim}
            style={{ minHeight: 48, borderRadius: "var(--portal-radius-pill)", border: "none", background: mengirim ? "var(--surface-subtle)" : "var(--grad-aksen)", color: mengirim ? "var(--text-muted)" : "var(--on-navy)", fontSize: 14, fontWeight: 700, cursor: mengirim ? "default" : "pointer" }}
          >
            {mengirim ? "Menyimpan…" : "Simpan Izin"}
          </button>
        </div>
      </BottomSheet>
    </div>
  );
}
