"use client";

// ============================================================================
// K3 Lapangan — versi PM (manage), bukan versi mandor (lapor).
//
// Beda dari `mandor-portal/k3`: PM tak melapor insiden baru — PM MENUTUP
// insiden yang sudah dilaporkan mandor/subkon, dengan aksi "Tutup Insiden"
// yang mewajibkan `tindakan_korektif` (diverifikasi ke
// `apps/api/src/routes/v1/k3-lapangan.ts:508-518` — PATCH menolak status
// "ditutup" tanpa tindakan_korektif >= 10 huruf, KECUALI field itu sudah
// terisi sebelumnya).
//
// Endpoint (sama seperti versi mandor, permission BEDA arah — `:manage`
// dipakai keduanya untuk field yang sama, `:view` untuk list):
//   · Insiden   → GET  /api/v1/k3/insiden?proyek=<id>
//                 PATCH /api/v1/k3/insiden/:id  { status, tindakan_korektif, ... }
//   · JSA       → GET  /api/v1/k3/jsa
//                 POST /api/v1/k3/jsa  { jenis_pekerjaan, kode?, uraian?,
//                 project_id?, catatan? } — Task 30 Step 5 (K3 lanjutan,
//                 Task 27 keputusan scope: HANYA header JSA). Butuh
//                 `k3:jsa:manage`, PM PUNYA (migrasi 293). Langkah bahaya/
//                 pengendalian (`POST /k3/jsa/:id/langkah`) TIDAK ditambah
//                 di sini — CRUD tingkat kedua yang lebih pas sebagai
//                 halaman detail JSA tersendiri, di luar scope Task 30
//                 (dicatat utang di JOURNAL.md).
//   · Inspeksi  → bagian payload GET /api/v1/proyek/:id/k3 (field `inspeksi`)
// ============================================================================

import { useMemo, useState } from "react";
import { ShieldAlert, HardHat, ClipboardCheck, Plus } from "lucide-react";
import { useData, invalidasi } from "@/lib/data-cache";
import { api } from "@/lib/api";
import SegmentedTab from "@/components/portal/SegmentedTab";
import KepalaPortal from "@/components/portal/KepalaPortal";
import BottomSheet from "@/components/portal/BottomSheet";
import StatusBadge, { type VarianStatus } from "@/components/portal/StatusBadge";
import EmptyState from "@/components/portal/EmptyState";
import SkeletonCard from "@/components/portal/SkeletonCard";
import type { InsidenK3, JsaK3, InspeksiK3, ProyekPM, GalatApi } from "../_bersama/tipe";
import { pesanGalat } from "../_bersama/tipe";
import { Pilihan } from "@/components/pilihan";

interface RespProyek { projects: ProyekPM[] }
interface RespInsiden { insiden: InsidenK3[]; jumlah: number; terpotong: boolean }
interface RespJsa { jsa: JsaK3[] }
interface RespK3Proyek {
  proyek: { id: string; name: string };
  insiden: InsidenK3[];
  inspeksi: InspeksiK3[];
}

const LABEL_JENIS: Record<string, string> = {
  nyaris_celaka: "Nyaris celaka",
  kecelakaan_ringan: "Kecelakaan ringan",
  kecelakaan_berat: "Kecelakaan berat",
  fatal: "Fatal",
  kerusakan_properti: "Kerusakan properti",
  pencemaran_lingkungan: "Pencemaran lingkungan",
};

const LABEL_STATUS_INSIDEN: Record<string, string> = {
  dilaporkan: "Dilaporkan",
  diselidiki: "Diselidiki",
  tindakan_berjalan: "Tindakan berjalan",
  ditutup: "Ditutup",
};

const VARIAN_STATUS_INSIDEN: Record<string, VarianStatus> = {
  dilaporkan: "pending",
  diselidiki: "pending",
  tindakan_berjalan: "pending",
  ditutup: "approved",
};

function label(v: string | null | undefined, kamus: Record<string, string>): string {
  if (!v) return "—";
  return kamus[v] ?? v;
}

export default function PmK3Page() {
  const [tab, setTab] = useState<"insiden" | "jsa" | "inspeksi">("insiden");
  const [proyekId, setProyekId] = useState("");
  const [dipilih, setDipilih] = useState<InsidenK3 | null>(null);
  const [tindakanKorektif, setTindakanKorektif] = useState("");
  const [mengirim, setMengirim] = useState(false);
  const [galatForm, setGalatForm] = useState<string | null>(null);
  const [sheetBuatJsa, setSheetBuatJsa] = useState(false);

  const { data: dataProyek } = useData<RespProyek>("/api/v1/projects");
  const daftarProyek = useMemo(
    () => (dataProyek?.projects ?? []).filter((p) => p.pm),
    [dataProyek],
  );
  const proyekAktif = proyekId || daftarProyek[0]?.id || "";

  const urlInsiden = "/api/v1/k3/insiden" + (proyekAktif ? `?proyek=${proyekAktif}` : "");
  const { data: dataInsiden, memuat: memuatInsiden, galat: galatInsiden } =
    useData<RespInsiden>(tab === "insiden" ? urlInsiden : null);

  const { data: dataJsa, memuat: memuatJsa, galat: galatJsa } =
    useData<RespJsa>(tab === "jsa" ? "/api/v1/k3/jsa" : null);

  const urlK3Proyek = proyekAktif ? `/api/v1/proyek/${proyekAktif}/k3` : null;
  const { data: dataK3Proyek, memuat: memuatInspeksi, galat: galatInspeksi } =
    useData<RespK3Proyek>(tab === "inspeksi" ? urlK3Proyek : null);

  function bukaTutup(item: InsidenK3) {
    setDipilih(item);
    setTindakanKorektif(item.tindakan_korektif ?? "");
    setGalatForm(null);
  }

  const korektifTerisiSebelumnya = (dipilih?.tindakan_korektif ?? "").trim().length >= 10;
  const korektifValid = korektifTerisiSebelumnya || tindakanKorektif.trim().length >= 10;

  async function tutupInsiden() {
    if (!dipilih) return;
    setMengirim(true);
    setGalatForm(null);
    try {
      await api.patch(`/api/v1/k3/insiden/${dipilih.id}`, {
        status: "ditutup",
        ...(tindakanKorektif.trim() ? { tindakan_korektif: tindakanKorektif.trim() } : {}),
      });
      setDipilih(null);
      setTindakanKorektif("");
      invalidasi(urlInsiden);
    } catch (e) {
      setGalatForm(pesanGalat(e as GalatApi, "Gagal menutup insiden"));
    } finally {
      setMengirim(false);
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--gap-bagian)" }}>
      <KepalaPortal judul="K3 Lapangan" />

      {daftarProyek.length > 1 && (
        <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <span style={{ fontSize: 12, fontWeight: 600, color: "var(--text-secondary)" }}>Proyek</span>
          <Pilihan
            value={proyekAktif}
            onChange={(e) => setProyekId(e.target.value)}
            style={{
              minHeight: 44, padding: "0 12px", borderRadius: 12,
              border: "1px solid var(--border)", fontSize: 14, background: "var(--surface)",
              color: "var(--text-primary)",
            }}
          >
            {daftarProyek.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </Pilihan>
        </label>
      )}

      <SegmentedTab
        opsi={[
          { value: "insiden", label: "Insiden" },
          { value: "jsa", label: "JSA" },
          { value: "inspeksi", label: "Inspeksi" },
        ]}
        aktif={tab}
        onUbah={(v) => setTab(v as typeof tab)}
      />

      {tab === "insiden" && (
        <>
          {memuatInsiden && <SkeletonCard tinggi={80} />}
          {galatInsiden && (
            <EmptyState icon={ShieldAlert} judul="Gagal memuat insiden" deskripsi={pesanGalat(galatInsiden as GalatApi, "Coba muat ulang halaman ini.")} />
          )}
          {!memuatInsiden && !galatInsiden && (dataInsiden?.insiden?.length ?? 0) === 0 && (
            <EmptyState icon={ShieldAlert} judul="Belum ada insiden tercatat" deskripsi="Insiden K3 yang dilaporkan mandor/subkon akan muncul di sini." />
          )}
          {!memuatInsiden && (dataInsiden?.insiden ?? []).map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => item.status !== "ditutup" && bukaTutup(item)}
              disabled={item.status === "ditutup"}
              style={{
                textAlign: "left", padding: "var(--pad-kartu-lega)", borderRadius: 16, background: "var(--surface)",
                border: "1px solid var(--border)", display: "flex", flexDirection: "column", gap: 8,
                cursor: item.status === "ditutup" ? "default" : "pointer",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
                <div style={{ flex: 1 }}>
                  <span style={{ fontSize: 14, fontWeight: 700, color: "var(--text-primary)" }}>
                    {label(item.jenis, LABEL_JENIS)}
                  </span>
                  <div style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: 2 }}>
                    {item.tanggal ?? "—"}{item.lokasi ? ` · ${item.lokasi}` : ""}
                  </div>
                </div>
                <StatusBadge
                  status={VARIAN_STATUS_INSIDEN[item.status ?? ""] ?? "netral"}
                  label={label(item.status, LABEL_STATUS_INSIDEN)}
                />
              </div>
              {item.kronologi && <div style={{ fontSize: 13, color: "var(--text-secondary)" }}>{item.kronologi}</div>}
              {item.melukai && (
                <StatusBadge status="rejected" label={`Melukai${item.korban_nama ? ` — ${item.korban_nama}` : ""}`} />
              )}
            </button>
          ))}
        </>
      )}

      {tab === "jsa" && (
        <>
          <div style={{ display: "flex", justifyContent: "flex-end" }}>
            <button type="button" onClick={() => setSheetBuatJsa(true)} aria-label="Buat JSA baru"
              style={{ minHeight: 36, padding: "0 12px", borderRadius: "var(--portal-radius-pill)", background: "var(--grad-aksen)", color: "var(--on-navy)", border: "none", fontSize: 12, fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", gap: 6 }}>
              <Plus size={14} aria-hidden="true" /> JSA
            </button>
          </div>
          {memuatJsa && <SkeletonCard tinggi={80} />}
          {galatJsa && (
            <EmptyState icon={HardHat} judul="Gagal memuat JSA" deskripsi={pesanGalat(galatJsa as GalatApi, "Coba muat ulang halaman ini.")} />
          )}
          {!memuatJsa && !galatJsa && (dataJsa?.jsa?.length ?? 0) === 0 && (
            <EmptyState icon={HardHat} judul="Belum ada Job Safety Analysis" deskripsi="JSA yang berlaku untuk proyek ini akan tampil di sini." />
          )}
          {!memuatJsa && (dataJsa?.jsa ?? []).map((item) => (
            <div key={item.id} style={{ padding: "var(--pad-kartu-lega)", borderRadius: 16, background: "var(--surface)", border: "1px solid color-mix(in srgb, var(--border) 40%, transparent)", boxShadow: "var(--naik-1)", display: "flex", flexDirection: "column", gap: 8 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
                <div style={{ flex: 1 }}>
                  <span style={{ fontSize: 14, fontWeight: 700, color: "var(--text-primary)" }}>{item.jenis_pekerjaan ?? "—"}</span>
                  {item.kode && <div style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: 2 }}>{item.kode}</div>}
                </div>
                <StatusBadge status={item.berlaku ? "approved" : "netral"} label={item.berlaku ? "Berlaku" : "Tidak berlaku"} />
              </div>
              {item.uraian && <div style={{ fontSize: 13, color: "var(--text-secondary)" }}>{item.uraian}</div>}
            </div>
          ))}
        </>
      )}

      {tab === "inspeksi" && (
        <>
          {!proyekAktif && (
            <EmptyState icon={ClipboardCheck} judul="Pilih proyek" deskripsi="Inspeksi rutin K3 tercatat per proyek — pilih proyek untuk melihatnya." />
          )}
          {proyekAktif && memuatInspeksi && <SkeletonCard tinggi={80} />}
          {proyekAktif && galatInspeksi && (
            <EmptyState icon={ClipboardCheck} judul="Gagal memuat inspeksi" deskripsi={pesanGalat(galatInspeksi as GalatApi, "Coba muat ulang halaman ini.")} />
          )}
          {proyekAktif && !memuatInspeksi && !galatInspeksi && (dataK3Proyek?.inspeksi?.length ?? 0) === 0 && (
            <EmptyState icon={ClipboardCheck} judul="Belum ada inspeksi K3 rutin" deskripsi="Inspeksi rutin K3 di proyek ini akan muncul di sini." />
          )}
          {proyekAktif && !memuatInspeksi && (dataK3Proyek?.inspeksi ?? []).map((item) => (
            <div key={item.id} style={{ padding: "var(--pad-kartu-lega)", borderRadius: 16, background: "var(--surface)", border: "1px solid color-mix(in srgb, var(--border) 40%, transparent)", boxShadow: "var(--naik-1)", display: "flex", flexDirection: "column", gap: 6 }}>
              <span style={{ fontSize: 14, fontWeight: 700, color: "var(--text-primary)" }}>{item.area ?? item.nomor ?? "Inspeksi"}</span>
              <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>
                {item.tanggal ?? "—"}{item.pemeriksa_nama ? ` · ${item.pemeriksa_nama}` : ""}
              </div>
              {item.ringkasan && <div style={{ fontSize: 13, color: "var(--text-secondary)" }}>{item.ringkasan}</div>}
            </div>
          ))}
        </>
      )}

      <BottomSheet terbuka={!!dipilih} onTutup={() => setDipilih(null)} judul="Tutup Insiden K3">
        {dipilih && (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <div style={{ fontSize: 13, color: "var(--text-secondary)" }}>
              {label(dipilih.jenis, LABEL_JENIS)} — {dipilih.tanggal ?? "—"}
            </div>
            {dipilih.kronologi && (
              <div style={{ fontSize: 13, color: "var(--text-primary)", padding: 12, borderRadius: 12, background: "var(--surface-subtle)" }}>
                {dipilih.kronologi}
              </div>
            )}

            <label style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>
              Tindakan korektif {korektifTerisiSebelumnya ? "(sudah tercatat, boleh diperbarui)" : "(wajib, minimal 10 huruf)"}
              <textarea
                value={tindakanKorektif}
                onChange={(e) => setTindakanKorektif(e.target.value)}
                rows={4}
                placeholder="Perbaikan apa yang dilakukan supaya insiden ini tak terulang?"
                style={{
                  width: "100%", marginTop: 6, padding: 12, borderRadius: 12,
                  border: "1px solid var(--border)", fontSize: 14, fontFamily: "inherit",
                }}
              />
            </label>

            {galatForm && (
              <div role="alert" style={{ fontSize: 12, color: "var(--on-danger-bg)", padding: 10, borderRadius: 10, background: "var(--danger-bg)", border: "1px solid var(--danger-border)" }}>
                {galatForm}
              </div>
            )}

            <button
              type="button"
              onClick={tutupInsiden}
              disabled={mengirim || !korektifValid}
              style={!korektifValid || mengirim ? {
                padding: 14, borderRadius: "var(--portal-radius-pill)",
                background: "var(--surface-subtle)", color: "var(--text-muted)",
                border: "1px solid var(--border)", fontSize: 14, fontWeight: 700, cursor: "default",
              } : {
                padding: 14, borderRadius: "var(--portal-radius-pill)",
                background: "var(--grad-aksen)", color: "var(--on-navy)", border: "none",
                fontSize: 14, fontWeight: 700, cursor: "pointer",
              }}
            >
              {mengirim ? "Menutup…" : "Tutup Insiden"}
            </button>
          </div>
        )}
      </BottomSheet>

      <BottomSheet terbuka={sheetBuatJsa} onTutup={() => setSheetBuatJsa(false)} judul="Job Safety Analysis Baru">
        <SheetBuatJsa
          proyekId={proyekAktif}
          onSelesai={() => { setSheetBuatJsa(false); invalidasi("/api/v1/k3/jsa"); }}
        />
      </BottomSheet>
    </div>
  );
}

/**
 * Form header JSA saja (`jenis_pekerjaan`, `kode`, `uraian`) — TANPA langkah
 * bahaya/pengendalian, sengaja (Task 30 Step 5). Langkah adalah CRUD tingkat
 * kedua (`POST /k3/jsa/:id/langkah`) yang lebih pas jadi halaman detail JSA
 * tersendiri, di luar scope task ini.
 */
function SheetBuatJsa({ proyekId, onSelesai }: { proyekId: string; onSelesai: () => void }) {
  const [jenisPekerjaan, setJenisPekerjaan] = useState("");
  const [kode, setKode] = useState("");
  const [uraian, setUraian] = useState("");
  const [mengirim, setMengirim] = useState(false);
  const [galat, setGalat] = useState<string | null>(null);

  async function simpan() {
    if (!jenisPekerjaan.trim()) { setGalat("Jenis pekerjaan wajib diisi."); return; }
    setMengirim(true); setGalat(null);
    try {
      await api.post("/api/v1/k3/jsa", {
        jenis_pekerjaan: jenisPekerjaan.trim(),
        kode: kode.trim() || undefined,
        uraian: uraian.trim() || undefined,
        project_id: proyekId || undefined,
      });
      setJenisPekerjaan(""); setKode(""); setUraian("");
      onSelesai();
    } catch (e) {
      setGalat(pesanGalat(e as GalatApi, "Gagal membuat JSA"));
    } finally { setMengirim(false); }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <label style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>
        Jenis pekerjaan
        <input value={jenisPekerjaan} onChange={(e) => setJenisPekerjaan(e.target.value)} placeholder="mis. Pengecoran kolom lantai 2"
          style={{ width: "100%", marginTop: 6, minHeight: 44, padding: "0 12px", borderRadius: 12, border: "1px solid var(--border)", fontSize: 14 }} />
      </label>
      <label style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>
        Kode (opsional)
        <input value={kode} onChange={(e) => setKode(e.target.value)}
          style={{ width: "100%", marginTop: 6, minHeight: 44, padding: "0 12px", borderRadius: 12, border: "1px solid var(--border)", fontSize: 14 }} />
      </label>
      <label style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>
        Uraian
        <textarea value={uraian} onChange={(e) => setUraian(e.target.value)} rows={3}
          style={{ width: "100%", marginTop: 6, padding: 12, borderRadius: 12, border: "1px solid var(--border)", fontSize: 14, fontFamily: "inherit" }} />
      </label>
      {galat && (
        <div role="alert" style={{ fontSize: 12, color: "var(--on-danger-bg)", padding: 10, borderRadius: 10, background: "var(--danger-bg)", border: "1px solid var(--danger-border)" }}>
          {galat}
        </div>
      )}
      <button type="button" onClick={simpan} disabled={mengirim}
        style={{ minHeight: 48, borderRadius: "var(--portal-radius-pill)", background: "var(--grad-aksen)", color: "var(--on-navy)", border: "none", fontSize: 14, fontWeight: 700, cursor: mengirim ? "default" : "pointer" }}>
        {mengirim ? "Menyimpan…" : "Buat JSA"}
      </button>
    </div>
  );
}
