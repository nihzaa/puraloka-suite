"use client";

// ============================================================================
// Inspeksi & RFI — dua modul BERBEDA yang digabung satu layar lewat tab.
//
// Endpoint NYATA (diverifikasi ke inspeksi.ts DAN rfi.ts — dua file
// terpisah; brief awal menyebut satu file `rfi-inspeksi.ts` yang TIDAK ADA):
//   · Inspeksi (izin cor/izin tutup): GET/POST /api/v1/projects/:projectId/inspections
//   · RFI (Request for Information):  GET /api/v1/projects/:projectId/rfis
//
// ── Kenapa RFI tak punya form "ajukan" di sini
//
// Mandor punya `inspeksi:manage` (boleh MENGAJUKAN permintaan inspeksi) tapi
// hanya `rfi:view` untuk RFI — BUKAN `rfi:manage`. Endpoint
// `POST /api/v1/projects/:projectId/rfis` digerbangi `rfi:manage`, jadi
// tombol "Ajukan RFI" di sini akan selalu berakhir 403. RFI dibuat oleh PM
// (portal PM) — mandor hanya memantau statusnya di sini, termasuk berapa
// hari sudah menggantung (dihitung server, field `hari_menggantung`).
// ============================================================================

import { useMemo, useState } from "react";
import { FileQuestion, ClipboardCheck, Plus } from "lucide-react";
import { useData, invalidasi } from "@/lib/data-cache";
import { kirimLapangan } from "@/lib/kirim-lapangan";
import SegmentedTab from "@/components/portal/SegmentedTab";
import BottomSheet from "@/components/portal/BottomSheet";
import StatusBadge, { type VarianStatus } from "@/components/portal/StatusBadge";
import EmptyState from "@/components/portal/EmptyState";
import SkeletonCard from "@/components/portal/SkeletonCard";
import type { Penugasan, Inspeksi, Rfi, GalatApi } from "../_bersama/tipe";
import { pesanGalat } from "../_bersama/tipe";

interface RespAssignments { assignments: Penugasan[] }
interface RespInspeksi { data: Inspeksi[]; meta: { menunggu: number; terlambat: number } }
interface RespRfi { data: Rfi[]; meta: { menggantung: number; terlambat: number } }

/** Status inspeksi: diminta/dijadwalkan/lolos/tidak_lolos/dibatalkan. */
const VARIAN_INSPEKSI: Record<string, VarianStatus> = {
  diminta: "pending",
  dijadwalkan: "pending",
  lolos: "approved",
  tidak_lolos: "rejected",
  dibatalkan: "netral",
};
const LABEL_INSPEKSI: Record<string, string> = {
  diminta: "Diminta",
  dijadwalkan: "Dijadwalkan",
  lolos: "Lolos",
  tidak_lolos: "Tidak lolos",
  dibatalkan: "Dibatalkan",
};

/** Status RFI: draft/terkirim/dijawab/ditutup/dibatalkan. */
const VARIAN_RFI: Record<string, VarianStatus> = {
  draft: "netral",
  terkirim: "pending",
  dijawab: "approved",
  ditutup: "approved",
  dibatalkan: "netral",
};
const LABEL_RFI: Record<string, string> = {
  draft: "Draft",
  terkirim: "Terkirim",
  dijawab: "Dijawab",
  ditutup: "Ditutup",
  dibatalkan: "Dibatalkan",
};

export default function InspeksiRfiPage() {
  const [tab, setTab] = useState<"inspeksi" | "rfi">("inspeksi");
  const [proyekId, setProyekId] = useState("");
  const [sheetTerbuka, setSheetTerbuka] = useState(false);
  const [judul, setJudul] = useState("");
  const [lokasi, setLokasi] = useState("");
  const [pekerjaanLanjutan, setPekerjaanLanjutan] = useState("");
  const [catatan, setCatatan] = useState("");
  const [mengirim, setMengirim] = useState(false);
  const [galatForm, setGalatForm] = useState<string | null>(null);

  const { data: dataAsg } = useData<RespAssignments>("/api/v1/mandor/assignments");
  const daftarProyek = useMemo(() => {
    const map = new Map<string, string>();
    for (const a of dataAsg?.assignments ?? []) {
      if (a.project?.id) map.set(a.project.id, a.project.name);
    }
    return [...map.entries()].map(([id, name]) => ({ id, name }));
  }, [dataAsg]);

  const proyekAktif = proyekId || daftarProyek[0]?.id || "";

  const urlInspeksi = proyekAktif ? `/api/v1/projects/${proyekAktif}/inspections` : null;
  const {
    data: dataInspeksi, memuat: memuatInspeksi, galat: galatInspeksi,
  } = useData<RespInspeksi>(tab === "inspeksi" ? urlInspeksi : null);

  const urlRfi = proyekAktif ? `/api/v1/projects/${proyekAktif}/rfis` : null;
  const {
    data: dataRfi, memuat: memuatRfi, galat: galatRfi,
  } = useData<RespRfi>(tab === "rfi" ? urlRfi : null);

  async function submitInspeksi() {
    if (!proyekAktif) {
      setGalatForm("Pilih proyek terlebih dahulu.");
      return;
    }
    setMengirim(true);
    setGalatForm(null);
    const hasil = await kirimLapangan(
      "POST",
      `/api/v1/projects/${proyekAktif}/inspections`,
      {
        judul: judul.trim(),
        lokasi: lokasi.trim() || undefined,
        pekerjaan_lanjutan: pekerjaanLanjutan.trim() || undefined,
        catatan: catatan.trim() || undefined,
      },
      "Permintaan inspeksi diajukan",
      "Gagal mengajukan permintaan inspeksi",
    );
    setMengirim(false);
    if (!hasil.aman) {
      setGalatForm(hasil.pesan);
      return;
    }
    setSheetTerbuka(false);
    setJudul("");
    setLokasi("");
    setPekerjaanLanjutan("");
    setCatatan("");
    invalidasi(`/api/v1/projects/${proyekAktif}/inspections`);
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <h1 style={{ fontSize: 20, fontWeight: 700, color: "var(--text-primary)", margin: 0 }}>
        Inspeksi &amp; RFI
      </h1>

      {daftarProyek.length > 1 && (
        <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <span style={{ fontSize: 12, fontWeight: 600, color: "var(--text-secondary)" }}>Proyek</span>
          <select
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
          </select>
        </label>
      )}

      <SegmentedTab
        opsi={[
          { value: "inspeksi", label: "Inspeksi" },
          { value: "rfi", label: "RFI" },
        ]}
        aktif={tab}
        onUbah={(v) => setTab(v as typeof tab)}
      />

      {tab === "inspeksi" && (
        <>
          {dataInspeksi?.meta && (
            <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>
              {dataInspeksi.meta.menunggu} menunggu pemeriksa
              {dataInspeksi.meta.terlambat > 0 ? ` · ${dataInspeksi.meta.terlambat} terlambat` : ""}
            </div>
          )}
          <button
            onClick={() => setSheetTerbuka(true)}
            disabled={!proyekAktif}
            style={{
              display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
              padding: 14, borderRadius: "var(--portal-radius-pill)",
              background: "var(--grad-merek)", color: "var(--on-navy)",
              border: "none", fontSize: 14, fontWeight: 700,
              cursor: proyekAktif ? "pointer" : "default",
              opacity: proyekAktif ? 1 : 0.5,
            }}
          >
            <Plus size={18} aria-hidden="true" /> Minta Diperiksa
          </button>

          {!proyekAktif && (
            <EmptyState
              icon={ClipboardCheck}
              judul="Pilih proyek"
              deskripsi="Permintaan inspeksi tercatat per proyek — pilih proyek untuk melihatnya."
            />
          )}
          {proyekAktif && memuatInspeksi && <SkeletonCard tinggi={90} />}
          {proyekAktif && galatInspeksi && (
            <EmptyState
              icon={ClipboardCheck}
              judul="Gagal memuat permintaan inspeksi"
              deskripsi={pesanGalat(galatInspeksi as GalatApi, "Coba muat ulang halaman ini.")}
            />
          )}
          {proyekAktif && !memuatInspeksi && !galatInspeksi && (dataInspeksi?.data?.length ?? 0) === 0 && (
            <EmptyState
              icon={ClipboardCheck}
              judul="Belum ada permintaan inspeksi"
              deskripsi="Permintaan izin cor/izin tutup yang Anda ajukan ke pengawas akan muncul di sini beserta hasilnya."
            />
          )}
          {proyekAktif && !memuatInspeksi && (dataInspeksi?.data ?? []).map((item) => (
            <div
              key={item.id}
              style={{
                padding: 16, borderRadius: 16, background: "var(--surface)",
                border: "1px solid var(--border)", display: "flex", flexDirection: "column", gap: 8,
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
                <div style={{ flex: 1 }}>
                  <span style={{ fontSize: 12, color: "var(--text-muted)" }}>{item.nomor ?? "—"}</span>
                  <div style={{ fontSize: 14, fontWeight: 700, color: "var(--text-primary)" }}>
                    {item.judul ?? "—"}
                  </div>
                  {item.lokasi && (
                    <div style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: 2 }}>{item.lokasi}</div>
                  )}
                </div>
                <StatusBadge
                  status={VARIAN_INSPEKSI[item.status ?? ""] ?? "netral"}
                  label={LABEL_INSPEKSI[item.status ?? ""] ?? item.status ?? "—"}
                />
              </div>
              {item.status === "tidak_lolos" && item.hasil_catatan && (
                <div style={{ fontSize: 12, color: "var(--on-danger-bg)", background: "var(--danger-bg)", padding: "6px 10px", borderRadius: 8 }}>
                  {item.hasil_catatan}
                </div>
              )}
            </div>
          ))}
        </>
      )}

      {tab === "rfi" && (
        <>
          {dataRfi?.meta && (
            <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>
              {dataRfi.meta.menggantung} menggantung
              {dataRfi.meta.terlambat > 0 ? ` · ${dataRfi.meta.terlambat} terlambat` : ""}
            </div>
          )}

          {!proyekAktif && (
            <EmptyState
              icon={FileQuestion}
              judul="Pilih proyek"
              deskripsi="RFI tercatat per proyek — pilih proyek untuk melihatnya."
            />
          )}
          {proyekAktif && memuatRfi && <SkeletonCard tinggi={90} />}
          {proyekAktif && galatRfi && (
            <EmptyState
              icon={FileQuestion}
              judul="Gagal memuat RFI"
              deskripsi={pesanGalat(galatRfi as GalatApi, "Coba muat ulang halaman ini.")}
            />
          )}
          {proyekAktif && !memuatRfi && !galatRfi && (dataRfi?.data?.length ?? 0) === 0 && (
            <EmptyState
              icon={FileQuestion}
              judul="Belum ada RFI"
              deskripsi="Pertanyaan resmi ke konsultan/pemberi kerja (diajukan PM) akan muncul di sini beserta jawabannya."
            />
          )}
          {proyekAktif && !memuatRfi && (dataRfi?.data ?? []).map((item) => (
            <div
              key={item.id}
              style={{
                padding: 16, borderRadius: 16, background: "var(--surface)",
                border: "1px solid var(--border)", display: "flex", flexDirection: "column", gap: 8,
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
                <div style={{ flex: 1 }}>
                  <span style={{ fontSize: 12, color: "var(--text-muted)" }}>{item.nomor ?? "—"}</span>
                  <div style={{ fontSize: 14, fontWeight: 700, color: "var(--text-primary)" }}>
                    {item.perihal ?? "—"}
                  </div>
                </div>
                <StatusBadge
                  status={VARIAN_RFI[item.status ?? ""] ?? "netral"}
                  label={LABEL_RFI[item.status ?? ""] ?? item.status ?? "—"}
                />
              </div>
              {item.pertanyaan && (
                <div style={{ fontSize: 13, color: "var(--text-secondary)" }}>{item.pertanyaan}</div>
              )}
              {item.jawaban && (
                <div style={{ fontSize: 12, color: "var(--on-success-bg)", background: "var(--success-bg)", padding: "6px 10px", borderRadius: 8 }}>
                  Jawaban: {item.jawaban}
                </div>
              )}
              {item.hari_menggantung != null && item.status === "terkirim" && (
                <div style={{ fontSize: 12, color: "var(--text-muted)" }}>
                  Menggantung {item.hari_menggantung} hari
                  {item.terlambat ? " — terlambat" : ""}
                </div>
              )}
            </div>
          ))}
        </>
      )}

      <BottomSheet terbuka={sheetTerbuka} onTutup={() => setSheetTerbuka(false)} judul="Minta Diperiksa">
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <label style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>
            Pekerjaan yang diperiksa
            <input
              type="text"
              value={judul}
              onChange={(e) => setJudul(e.target.value)}
              placeholder="mis. Pengecoran kolom lantai 3"
              style={{
                width: "100%", marginTop: 6, minHeight: 44, padding: "0 12px", borderRadius: 12,
                border: "1px solid var(--border)", fontSize: 14,
              }}
            />
          </label>

          <label style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>
            Lokasi
            <input
              type="text"
              value={lokasi}
              onChange={(e) => setLokasi(e.target.value)}
              style={{
                width: "100%", marginTop: 6, minHeight: 44, padding: "0 12px", borderRadius: 12,
                border: "1px solid var(--border)", fontSize: 14,
              }}
            />
          </label>

          <label style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>
            Pekerjaan lanjutan yang menunggu (opsional)
            <input
              type="text"
              value={pekerjaanLanjutan}
              onChange={(e) => setPekerjaanLanjutan(e.target.value)}
              placeholder="mis. Pemasangan bekisting lantai 4"
              style={{
                width: "100%", marginTop: 6, minHeight: 44, padding: "0 12px", borderRadius: 12,
                border: "1px solid var(--border)", fontSize: 14,
              }}
            />
          </label>

          <label style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>
            Catatan (opsional)
            <textarea
              value={catatan}
              onChange={(e) => setCatatan(e.target.value)}
              rows={3}
              style={{
                width: "100%", marginTop: 6, padding: 12, borderRadius: 12,
                border: "1px solid var(--border)", fontSize: 14, fontFamily: "inherit",
              }}
            />
          </label>

          {galatForm && <div style={{ fontSize: 12, color: "var(--danger)" }}>{galatForm}</div>}

          <button
            onClick={submitInspeksi}
            disabled={mengirim || !judul.trim()}
            style={{
              padding: 14, borderRadius: "var(--portal-radius-pill)",
              background: "var(--grad-aksen)", color: "var(--on-navy)", border: "none",
              fontSize: 14, fontWeight: 700, cursor: mengirim ? "default" : "pointer",
              opacity: mengirim || !judul.trim() ? 0.5 : 1,
            }}
          >
            {mengirim ? "Mengirim…" : "Ajukan Permintaan"}
          </button>
        </div>
      </BottomSheet>
    </div>
  );
}
