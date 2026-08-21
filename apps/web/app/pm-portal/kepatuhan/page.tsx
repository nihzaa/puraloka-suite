"use client";

// ============================================================================
// Kepatuhan & Izin Kerja — versi PM (kelola PENUH, bukan cuma lihat).
//
// BEDA dari K3/Punch/Inspeksi/Submittal (Task-dasar 2026-08-19): PM di sini
// TIDAK cuma verifikasi/tutup — PM punya kepatuhan:manage PENUH (buat dokumen,
// verifikasi dokumen, catat evaluasi subkon) DAN k3:permit:manage +
// k3:permit:decide (PM bisa MENGAJUKAN izin kerja MAUPUN MEMUTUSKANNYA,
// asal bukan izin yang ia ajukan sendiri — SoD ditegakkan backend
// `kepatuhan-k3.ts:397-403`, Task 27 Step 1).
//
// Tiga bagian satu halaman (pola desktop `(dashboard)/kepatuhan/page.tsx`):
//   kesiapan  — GET /api/v1/kepatuhan → field `kesiapan` (pihak boleh
//               kerja atau tidak, gabungan dokumen+evaluasi+izin)
//   dokumen   — GET /api/v1/kepatuhan → field `dokumen` + POST buat +
//               PATCH verifikasi
//   izin      — GET /api/v1/kepatuhan/izin-kerja (endpoint TERPISAH,
//               BUKAN bagian /kepatuhan) + POST buat + PATCH putuskan
//   evaluasi  — GET /api/v1/kepatuhan → field `evaluasi` + POST catat
//
// "izin" dipetakan dari `lp-permit`/`kt-*` di peta-menu — ditaruh SEBAGAI
// TAB di halaman yang sama (bukan halaman terpisah) karena keputusan izin
// (boleh kerja hari ini atau tidak) adalah PERSIS pertanyaan yang sama
// dengan kesiapan/dokumen/evaluasi — empat sudut satu jawaban, komentar
// `kepatuhan-k3.ts:11-19`.
//
// ── Field frontend dikoreksi dari bacaan `lib/kepatuhan-k3.ts` utuh ────────
// (bukan ditebak dari nama route) — lihat komentar tiap tipe di
// `_bersama/tipe.ts`. Paling penting: `KesiapanPihak.nama` (BUKAN
// `pihak_nama`), `DokumenDinilai.hijauTapiMati`, `EvaluasiDinilai.skor` /
// `.bolehDipakai` / `.alasanTakBolehDipakai`, `IzinKerjaDinilai.sisaJam`
// (BUKAN `sisaHari`) dengan union `statusNyata` lima nilai.
// ============================================================================

import { useMemo, useState } from "react";
import { ShieldCheck, FileWarning, ClipboardList, Award, Plus, AlertTriangle } from "lucide-react";
import { useData, invalidasi } from "@/lib/data-cache";
import { api } from "@/lib/api";
import SegmentedTab from "@/components/portal/SegmentedTab";
import BottomSheet from "@/components/portal/BottomSheet";
import StatusBadge, { type VarianStatus } from "@/components/portal/StatusBadge";
import EmptyState from "@/components/portal/EmptyState";
import SkeletonCard from "@/components/portal/SkeletonCard";
import type {
  ProyekPM, GalatApi, RespKepatuhan, RespIzinKerja, RespIkhtisarMutu,
  DokumenDinilai, EvaluasiDinilai, KesiapanPihak, IzinKerjaDinilai,
} from "../_bersama/tipe";
import { pesanGalat } from "../_bersama/tipe";

interface RespProyek { projects: ProyekPM[] }

const LABEL_STATUS_DOK: Record<string, string> = {
  kedaluwarsa: "Kedaluwarsa", segera_habis: "Segera Habis",
  belum_diverifikasi: "Belum Diverifikasi", berlaku: "Berlaku", tanpa_masa: "Tanpa Masa Berlaku",
};
const VARIAN_STATUS_DOK: Record<string, VarianStatus> = {
  kedaluwarsa: "rejected", segera_habis: "pending",
  belum_diverifikasi: "info", berlaku: "approved", tanpa_masa: "netral",
};
const LABEL_STATUS_IZIN: Record<string, string> = {
  draft: "Draf", diajukan: "Diajukan", disetujui: "Disetujui", ditolak: "Ditolak",
};
const VARIAN_STATUS_IZIN: Record<string, VarianStatus> = {
  draft: "netral", diajukan: "pending", disetujui: "approved", ditolak: "rejected",
};
const LABEL_STATUS_NYATA_IZIN: Record<string, string> = {
  aktif: "Aktif", belum_mulai: "Belum Mulai", kedaluwarsa: "Kedaluwarsa",
  menunggu: "Menunggu", tak_berlaku: "Tak Berlaku",
};
const VARIAN_STATUS_NYATA_IZIN: Record<string, VarianStatus> = {
  aktif: "approved", belum_mulai: "info", kedaluwarsa: "rejected",
  menunggu: "pending", tak_berlaku: "netral",
};

function labelSisaHari(n: number | null): string {
  if (n === null) return "tanpa tenggat";
  if (n < 0) return `lewat ${Math.abs(n)} hr`;
  if (n === 0) return "hari ini";
  return `${n} hr lagi`;
}

function labelSisaJam(n: number | null): string {
  if (n === null) return "tanpa tenggat";
  if (n < 0) return `lewat ${Math.abs(n)} jam`;
  if (n === 0) return "berakhir sekarang";
  if (n < 24) return `${n} jam lagi`;
  return `${Math.round(n / 24)} hr lagi`;
}

export default function PmKepatuhanPage() {
  const [bagian, setBagian] = useState<"kesiapan" | "dokumen" | "izin" | "evaluasi">("kesiapan");
  const [proyekId, setProyekId] = useState("");
  const [sheetDokumen, setSheetDokumen] = useState(false);
  const [sheetIzin, setSheetIzin] = useState(false);
  const [sheetEvaluasi, setSheetEvaluasi] = useState(false);
  const [izinDipilih, setIzinDipilih] = useState<IzinKerjaDinilai | null>(null);
  // Galat AKSI (verifikasi dokumen di kartu, LUAR BottomSheet) terpisah dari
  // galat MUAT — pola sama `procurement/po/[id]/page.tsx`.
  const [galatAksi, setGalatAksi] = useState<string | null>(null);
  const [memverifikasiId, setMemverifikasiId] = useState<string | null>(null);

  const { data: dataProyek } = useData<RespProyek>("/api/v1/projects");
  const daftarProyek = useMemo(() => (dataProyek?.projects ?? []).filter((p) => p.pm), [dataProyek]);
  const proyekAktif = proyekId || daftarProyek[0]?.id || "";

  const { data: dataKepatuhan, memuat: memuatKepatuhan, galat: galatKepatuhan } =
    useData<RespKepatuhan>("/api/v1/kepatuhan");
  const { data: dataIzin, memuat: memuatIzin, galat: galatIzin } =
    useData<RespIzinKerja>(bagian === "izin" ? "/api/v1/kepatuhan/izin-kerja" : null);
  const { data: dataIkhtisar } = useData<RespIkhtisarMutu>("/api/v1/mutu/ikhtisar");

  const izinProyek = (dataIzin?.izin ?? []).filter((z) => !proyekAktif || z.project_id === proyekAktif);

  async function verifikasiDokumen(id: string) {
    setMemverifikasiId(id); setGalatAksi(null);
    try {
      await api.patch(`/api/v1/kepatuhan/dokumen/${id}/verifikasi`);
      invalidasi("/api/v1/kepatuhan");
    } catch (e) {
      setGalatAksi(pesanGalat(e as GalatApi, "Gagal memverifikasi dokumen"));
    } finally {
      setMemverifikasiId(null);
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <h1 style={{ fontSize: 20, fontWeight: 700, color: "var(--text-primary)", margin: 0 }}>
        Kepatuhan & Izin Kerja
      </h1>

      {daftarProyek.length > 1 && (
        <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <span style={{ fontSize: 12, fontWeight: 600, color: "var(--text-secondary)" }}>Proyek (untuk tab Izin Kerja)</span>
          <select
            value={proyekAktif}
            onChange={(e) => setProyekId(e.target.value)}
            style={{ minHeight: 44, padding: "0 12px", borderRadius: 12, border: "1px solid var(--border)", fontSize: 14, background: "var(--surface)", color: "var(--text-primary)" }}
          >
            {daftarProyek.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </label>
      )}

      {dataIkhtisar && (
        <div style={{ display: "flex", gap: 8, overflowX: "auto" }}>
          <div style={{ flex: "0 0 auto", padding: "10px 14px", borderRadius: 14, background: "var(--danger-bg)", border: "1px solid var(--danger-border)" }}>
            <div style={{ fontSize: 18, fontWeight: 800, color: "var(--on-danger-bg)" }}>{dataIkhtisar.dokumen.kedaluwarsa}</div>
            <div style={{ fontSize: 11, color: "var(--on-danger-bg)" }}>Dokumen kedaluwarsa</div>
          </div>
          <div style={{ flex: "0 0 auto", padding: "10px 14px", borderRadius: 14, background: "var(--warning-bg)", border: "1px solid var(--warning-border)" }}>
            <div style={{ fontSize: 18, fontWeight: 800, color: "var(--on-warning-bg)" }}>{dataIkhtisar.izin_kerja.menunggu}</div>
            <div style={{ fontSize: 11, color: "var(--on-warning-bg)" }}>Izin menunggu</div>
          </div>
          <div style={{ flex: "0 0 auto", padding: "10px 14px", borderRadius: 14, background: "var(--surface-subtle)" }}>
            <div style={{ fontSize: 18, fontWeight: 800, color: "var(--text-primary)" }}>{dataIkhtisar.k3.daftar_hitam}</div>
            <div style={{ fontSize: 11, color: "var(--text-secondary)" }}>Daftar hitam</div>
          </div>
        </div>
      )}

      <SegmentedTab
        opsi={[
          { value: "kesiapan", label: "Kesiapan" },
          { value: "dokumen", label: "Dokumen" },
          { value: "izin", label: "Izin Kerja" },
          { value: "evaluasi", label: "Evaluasi" },
        ]}
        aktif={bagian}
        onUbah={(v) => setBagian(v as typeof bagian)}
      />

      {galatAksi && (
        <div role="alert" style={{ fontSize: 12, color: "var(--on-danger-bg)", padding: 10, borderRadius: 10, background: "var(--danger-bg)", border: "1px solid var(--danger-border)" }}>
          {galatAksi}
        </div>
      )}

      {bagian === "kesiapan" && (
        <>
          {memuatKepatuhan && <SkeletonCard tinggi={80} />}
          {galatKepatuhan && <EmptyState icon={ShieldCheck} judul="Gagal memuat kesiapan" deskripsi={pesanGalat(galatKepatuhan as GalatApi, "Coba muat ulang.")} />}
          {!memuatKepatuhan && !galatKepatuhan && (dataKepatuhan?.kesiapan?.length ?? 0) === 0 && (
            <EmptyState icon={ShieldCheck} judul="Belum ada data kesiapan" deskripsi="Kesiapan dihitung dari dokumen & evaluasi yang sudah tercatat." />
          )}
          {!memuatKepatuhan && (dataKepatuhan?.kesiapan ?? []).map((k: KesiapanPihak) => (
            <div key={k.supplier_id ?? k.nama} style={{ display: "flex", flexDirection: "column", gap: 6, padding: 14, borderRadius: 14, background: "var(--surface)", border: "1px solid var(--border)" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
                <span style={{ fontSize: 14, fontWeight: 700, color: "var(--text-primary)" }}>{k.nama}</span>
                <StatusBadge status={k.bolehBekerja ? "approved" : "rejected"} label={k.bolehBekerja ? "Boleh Bekerja" : "Ditahan"} />
              </div>
              <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>
                Skor terakhir: {k.skorTerakhir ?? "belum dinilai"}
                {k.dokumenKedaluwarsa > 0 && ` · ${k.dokumenKedaluwarsa} dok. kedaluwarsa`}
                {k.dokumenSegeraHabis > 0 && ` · ${k.dokumenSegeraHabis} dok. segera habis`}
              </div>
              {k.alasan.length > 0 && (
                <div style={{ display: "flex", alignItems: "flex-start", gap: 6, fontSize: 12, color: "var(--on-danger-bg)", background: "var(--danger-bg)", padding: 10, borderRadius: 10 }}>
                  <AlertTriangle size={14} aria-hidden="true" style={{ flexShrink: 0, marginTop: 1 }} />
                  <span>{k.alasan.join("; ")}</span>
                </div>
              )}
            </div>
          ))}
        </>
      )}

      {bagian === "dokumen" && (
        <>
          <div style={{ display: "flex", justifyContent: "flex-end" }}>
            <button type="button" onClick={() => setSheetDokumen(true)} aria-label="Tambah dokumen kepatuhan"
              style={{ minHeight: 40, padding: "0 14px", borderRadius: "var(--portal-radius-pill)", background: "var(--grad-aksen)", color: "var(--on-navy)", border: "none", fontSize: 13, fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", gap: 6 }}>
              <Plus size={16} aria-hidden="true" /> Dokumen
            </button>
          </div>
          {memuatKepatuhan && <SkeletonCard tinggi={70} />}
          {galatKepatuhan && <EmptyState icon={FileWarning} judul="Gagal memuat dokumen" deskripsi={pesanGalat(galatKepatuhan as GalatApi, "Coba muat ulang.")} />}
          {!memuatKepatuhan && !galatKepatuhan && (dataKepatuhan?.dokumen?.dokumen?.length ?? 0) === 0 && (
            <EmptyState icon={FileWarning} judul="Belum ada dokumen kepatuhan" deskripsi="Sertifikat, izin, dan asuransi pemasok/subkon akan muncul di sini." />
          )}
          {!memuatKepatuhan && (dataKepatuhan?.dokumen?.dokumen ?? []).map((d: DokumenDinilai) => (
            <div key={d.id} style={{ display: "flex", flexDirection: "column", gap: 6, padding: 14, borderRadius: 14, background: "var(--surface)", border: "1px solid var(--border)" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
                <div>
                  <span style={{ fontSize: 14, fontWeight: 700, color: "var(--text-primary)" }}>{d.pihak_nama ?? "—"}</span>
                  <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>{d.jenis} · {labelSisaHari(d.sisaHari)}</div>
                </div>
                <StatusBadge status={VARIAN_STATUS_DOK[d.status] ?? "netral"} label={LABEL_STATUS_DOK[d.status] ?? d.status} />
              </div>
              {d.hijauTapiMati && (
                <div style={{ display: "flex", alignItems: "flex-start", gap: 6, fontSize: 12, color: "var(--on-danger-bg)", background: "var(--danger-bg)", padding: 10, borderRadius: 10 }}>
                  <AlertTriangle size={14} aria-hidden="true" style={{ flexShrink: 0, marginTop: 1 }} />
                  <span>Sudah pernah diverifikasi, tapi masa berlakunya sudah lewat — perlu diperbarui.</span>
                </div>
              )}
              {!d.terverifikasi && (
                <button type="button" onClick={() => verifikasiDokumen(d.id)} disabled={memverifikasiId === d.id}
                  style={{ alignSelf: "flex-start", minHeight: 36, padding: "0 12px", borderRadius: "var(--portal-radius-pill)", background: "var(--surface-subtle)", border: "1px solid var(--border)", fontSize: 12, fontWeight: 700, color: "var(--text-primary)", cursor: memverifikasiId === d.id ? "default" : "pointer" }}>
                  {memverifikasiId === d.id ? "Memverifikasi…" : "Tandai Terverifikasi"}
                </button>
              )}
            </div>
          ))}
        </>
      )}

      {bagian === "izin" && (
        <>
          <div style={{ display: "flex", justifyContent: "flex-end" }}>
            <button type="button" onClick={() => setSheetIzin(true)} aria-label="Ajukan izin kerja baru"
              style={{ minHeight: 40, padding: "0 14px", borderRadius: "var(--portal-radius-pill)", background: "var(--grad-aksen)", color: "var(--on-navy)", border: "none", fontSize: 13, fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", gap: 6 }}>
              <Plus size={16} aria-hidden="true" /> Izin Kerja
            </button>
          </div>
          {memuatIzin && <SkeletonCard tinggi={80} />}
          {galatIzin && <EmptyState icon={ClipboardList} judul="Gagal memuat izin kerja" deskripsi={pesanGalat(galatIzin as GalatApi, "Coba muat ulang.")} />}
          {!memuatIzin && !galatIzin && izinProyek.length === 0 && (
            <EmptyState icon={ClipboardList} judul="Belum ada izin kerja" deskripsi="Work permit untuk pekerjaan berisiko tinggi akan muncul di sini." />
          )}
          {!memuatIzin && izinProyek.map((z) => (
            <button key={z.id} type="button"
              onClick={() => z.status === "diajukan" && setIzinDipilih(z)}
              disabled={z.status !== "diajukan"}
              style={{ textAlign: "left", padding: 14, borderRadius: 14, background: "var(--surface)", border: "1px solid var(--border)", display: "flex", flexDirection: "column", gap: 6, cursor: z.status === "diajukan" ? "pointer" : "default" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
                <div>
                  <span style={{ fontSize: 14, fontWeight: 700, color: "var(--text-primary)" }}>{z.nomor}</span>
                  <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>{z.jenis} · {z.uraian_pekerjaan}</div>
                </div>
                <StatusBadge
                  status={z.disetujuiTapiLewat ? "rejected" : (VARIAN_STATUS_NYATA_IZIN[z.statusNyata] ?? VARIAN_STATUS_IZIN[z.status] ?? "netral")}
                  label={z.disetujuiTapiLewat ? "Tidak Berizin (Lewat)" : (LABEL_STATUS_NYATA_IZIN[z.statusNyata] ?? LABEL_STATUS_IZIN[z.status] ?? z.status)}
                />
              </div>
              <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>
                {z.berlaku_dari} s/d {z.berlaku_sampai} · {labelSisaJam(z.sisaJam)}
              </div>
            </button>
          ))}
        </>
      )}

      {bagian === "evaluasi" && (
        <>
          <div style={{ display: "flex", justifyContent: "flex-end" }}>
            <button type="button" onClick={() => setSheetEvaluasi(true)} aria-label="Catat evaluasi subkon baru"
              style={{ minHeight: 40, padding: "0 14px", borderRadius: "var(--portal-radius-pill)", background: "var(--grad-aksen)", color: "var(--on-navy)", border: "none", fontSize: 13, fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", gap: 6 }}>
              <Plus size={16} aria-hidden="true" /> Evaluasi
            </button>
          </div>
          {memuatKepatuhan && <SkeletonCard tinggi={70} />}
          {galatKepatuhan && <EmptyState icon={Award} judul="Gagal memuat evaluasi" deskripsi={pesanGalat(galatKepatuhan as GalatApi, "Coba muat ulang.")} />}
          {!memuatKepatuhan && !galatKepatuhan && (dataKepatuhan?.evaluasi?.length ?? 0) === 0 && (
            <EmptyState icon={Award} judul="Belum ada evaluasi subkon" deskripsi="Skor mutu, waktu, K3, dan kepatuhan subkon akan muncul di sini." />
          )}
          {!memuatKepatuhan && (dataKepatuhan?.evaluasi ?? []).map((e: EvaluasiDinilai) => (
            <div key={e.id} style={{ display: "flex", flexDirection: "column", gap: 6, padding: 14, borderRadius: 14, background: "var(--surface)", border: "1px solid var(--border)" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
                <div>
                  <span style={{ fontSize: 14, fontWeight: 700, color: "var(--text-primary)" }}>{e.pihak_nama ?? "—"}</span>
                  <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>Skor gabungan: {e.skor}</div>
                </div>
                <StatusBadge status={e.bolehDipakai ? "approved" : "rejected"} label={e.bolehDipakai ? "Boleh Dipakai" : "Tidak Boleh Dipakai"} />
              </div>
              <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>
                Mutu {e.skor_mutu} · Waktu {e.skor_waktu} · K3 {e.skor_k3} · Kepatuhan {e.skor_kepatuhan} · Kerja sama {e.skor_kerjasama}
              </div>
              {e.titikLemah.length > 0 && (
                <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>Titik lemah: {e.titikLemah.join(", ")}</div>
              )}
              {!e.bolehDipakai && (
                <div style={{ display: "flex", alignItems: "flex-start", gap: 6, fontSize: 12, color: "var(--on-danger-bg)", background: "var(--danger-bg)", padding: 10, borderRadius: 10 }}>
                  <AlertTriangle size={14} aria-hidden="true" style={{ flexShrink: 0, marginTop: 1 }} />
                  <span>{e.alasanTakBolehDipakai.join("; ")}</span>
                </div>
              )}
            </div>
          ))}
        </>
      )}

      <SheetTambahDokumen terbuka={sheetDokumen} onTutup={() => setSheetDokumen(false)} />
      <SheetAjukanIzin terbuka={sheetIzin} onTutup={() => setSheetIzin(false)} proyekId={proyekAktif} />
      <SheetCatatEvaluasi terbuka={sheetEvaluasi} onTutup={() => setSheetEvaluasi(false)} proyekId={proyekAktif} />

      <BottomSheet terbuka={!!izinDipilih} onTutup={() => setIzinDipilih(null)} judul="Putuskan Izin Kerja">
        {izinDipilih && <SheetPutuskanIzin izin={izinDipilih} onSelesai={() => setIzinDipilih(null)} />}
      </BottomSheet>
    </div>
  );
}

function SheetTambahDokumen({ terbuka, onTutup }: { terbuka: boolean; onTutup: () => void }) {
  const [pihakNama, setPihakNama] = useState("");
  const [jenis, setJenis] = useState("");
  const [nomor, setNomor] = useState("");
  const [berlakuSampai, setBerlakuSampai] = useState("");
  const [mengirim, setMengirim] = useState(false);
  const [galat, setGalat] = useState<string | null>(null);

  async function simpan() {
    if (!jenis.trim()) { setGalat("Jenis dokumen wajib diisi."); return; }
    if (!pihakNama.trim()) { setGalat("Nama pihak wajib diisi."); return; }
    setMengirim(true); setGalat(null);
    try {
      await api.post("/api/v1/kepatuhan/dokumen", {
        pihak_nama: pihakNama.trim(), jenis: jenis.trim(),
        nomor: nomor.trim() || undefined,
        berlaku_sampai: berlakuSampai || undefined,
      });
      invalidasi("/api/v1/kepatuhan");
      setPihakNama(""); setJenis(""); setNomor(""); setBerlakuSampai(""); onTutup();
    } catch (e) {
      setGalat(pesanGalat(e as GalatApi, "Gagal menyimpan dokumen"));
    } finally { setMengirim(false); }
  }

  return (
    <BottomSheet terbuka={terbuka} onTutup={onTutup} judul="Dokumen Kepatuhan Baru">
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <label style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>
          Nama pihak (pemasok/subkon)
          <input value={pihakNama} onChange={(e) => setPihakNama(e.target.value)}
            style={{ width: "100%", marginTop: 6, minHeight: 44, padding: "0 12px", borderRadius: 12, border: "1px solid var(--border)", fontSize: 14 }} />
        </label>
        <label style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>
          Jenis dokumen (mis. SIUJK, Asuransi, NPWP)
          <input value={jenis} onChange={(e) => setJenis(e.target.value)}
            style={{ width: "100%", marginTop: 6, minHeight: 44, padding: "0 12px", borderRadius: 12, border: "1px solid var(--border)", fontSize: 14 }} />
        </label>
        <label style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>
          Nomor
          <input value={nomor} onChange={(e) => setNomor(e.target.value)}
            style={{ width: "100%", marginTop: 6, minHeight: 44, padding: "0 12px", borderRadius: 12, border: "1px solid var(--border)", fontSize: 14 }} />
        </label>
        <label style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>
          Berlaku sampai
          <input type="date" value={berlakuSampai} onChange={(e) => setBerlakuSampai(e.target.value)}
            style={{ width: "100%", marginTop: 6, minHeight: 44, padding: "0 12px", borderRadius: 12, border: "1px solid var(--border)", fontSize: 14 }} />
        </label>
        {galat && <div role="alert" style={{ fontSize: 12, color: "var(--on-danger-bg)", padding: 10, borderRadius: 10, background: "var(--danger-bg)", border: "1px solid var(--danger-border)" }}>{galat}</div>}
        <button type="button" onClick={simpan} disabled={mengirim}
          style={{ minHeight: 48, borderRadius: "var(--portal-radius-pill)", background: "var(--grad-aksen)", color: "var(--on-navy)", border: "none", fontSize: 14, fontWeight: 700, cursor: mengirim ? "default" : "pointer" }}>
          {mengirim ? "Menyimpan…" : "Simpan Dokumen"}
        </button>
      </div>
    </BottomSheet>
  );
}

function SheetAjukanIzin({ terbuka, onTutup, proyekId }: { terbuka: boolean; onTutup: () => void; proyekId: string }) {
  const [nomor, setNomor] = useState("");
  const [jenis, setJenis] = useState("");
  const [uraian, setUraian] = useState("");
  const [berlakuDari, setBerlakuDari] = useState("");
  const [berlakuSampai, setBerlakuSampai] = useState("");
  const [pengendalian, setPengendalian] = useState("");
  const [mengirim, setMengirim] = useState(false);
  const [galat, setGalat] = useState<string | null>(null);

  async function simpan(ajukan: boolean) {
    if (!proyekId) { setGalat("Pilih proyek dulu."); return; }
    if (!nomor.trim() || !jenis.trim() || !uraian.trim() || !berlakuDari || !berlakuSampai) {
      setGalat("Nomor, jenis, uraian pekerjaan, dan jendela waktu wajib diisi.");
      return;
    }
    setMengirim(true); setGalat(null);
    try {
      await api.post("/api/v1/kepatuhan/izin-kerja", {
        project_id: proyekId, nomor: nomor.trim(), jenis: jenis.trim(),
        uraian_pekerjaan: uraian.trim(), berlaku_dari: berlakuDari, berlaku_sampai: berlakuSampai,
        pengendalian_risiko: pengendalian.trim() || undefined, ajukan,
      });
      invalidasi("/api/v1/kepatuhan/izin-kerja");
      setNomor(""); setJenis(""); setUraian(""); setBerlakuDari(""); setBerlakuSampai(""); setPengendalian("");
      onTutup();
    } catch (e) {
      setGalat(pesanGalat(e as GalatApi, "Gagal mengajukan izin kerja"));
    } finally { setMengirim(false); }
  }

  return (
    <BottomSheet terbuka={terbuka} onTutup={onTutup} judul="Izin Kerja Baru">
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <label style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>
          Nomor izin
          <input value={nomor} onChange={(e) => setNomor(e.target.value)}
            style={{ width: "100%", marginTop: 6, minHeight: 44, padding: "0 12px", borderRadius: 12, border: "1px solid var(--border)", fontSize: 14 }} />
        </label>
        <label style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>
          Jenis pekerjaan berisiko
          <input value={jenis} onChange={(e) => setJenis(e.target.value)} placeholder="mis. bekerja di ketinggian, panas, ruang terbatas"
            style={{ width: "100%", marginTop: 6, minHeight: 44, padding: "0 12px", borderRadius: 12, border: "1px solid var(--border)", fontSize: 14 }} />
        </label>
        <label style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>
          Uraian pekerjaan
          <textarea value={uraian} onChange={(e) => setUraian(e.target.value)} rows={3}
            style={{ width: "100%", marginTop: 6, padding: 12, borderRadius: 12, border: "1px solid var(--border)", fontSize: 14, fontFamily: "inherit" }} />
        </label>
        <div style={{ display: "flex", gap: 10 }}>
          <label style={{ flex: 1, fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>
            Berlaku dari
            <input type="date" value={berlakuDari} onChange={(e) => setBerlakuDari(e.target.value)}
              style={{ width: "100%", marginTop: 6, minHeight: 44, padding: "0 12px", borderRadius: 12, border: "1px solid var(--border)", fontSize: 14 }} />
          </label>
          <label style={{ flex: 1, fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>
            Sampai
            <input type="date" value={berlakuSampai} onChange={(e) => setBerlakuSampai(e.target.value)}
              style={{ width: "100%", marginTop: 6, minHeight: 44, padding: "0 12px", borderRadius: 12, border: "1px solid var(--border)", fontSize: 14 }} />
          </label>
        </div>
        <label style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>
          Pengendalian risiko (wajib diisi sebelum bisa disetujui siapa pun)
          <textarea value={pengendalian} onChange={(e) => setPengendalian(e.target.value)} rows={3}
            style={{ width: "100%", marginTop: 6, padding: 12, borderRadius: 12, border: "1px solid var(--border)", fontSize: 14, fontFamily: "inherit" }} />
        </label>
        {galat && <div role="alert" style={{ fontSize: 12, color: "var(--on-danger-bg)", padding: 10, borderRadius: 10, background: "var(--danger-bg)", border: "1px solid var(--danger-border)" }}>{galat}</div>}
        <div style={{ display: "flex", gap: 10 }}>
          <button type="button" onClick={() => simpan(false)} disabled={mengirim}
            style={{ flex: 1, minHeight: 48, borderRadius: "var(--portal-radius-pill)", background: "var(--surface-subtle)", border: "1px solid var(--border)", fontSize: 14, fontWeight: 700, color: "var(--text-primary)", cursor: mengirim ? "default" : "pointer" }}>
            Simpan Draf
          </button>
          <button type="button" onClick={() => simpan(true)} disabled={mengirim}
            style={{ flex: 1, minHeight: 48, borderRadius: "var(--portal-radius-pill)", background: "var(--grad-aksen)", color: "var(--on-navy)", border: "none", fontSize: 14, fontWeight: 700, cursor: mengirim ? "default" : "pointer" }}>
            {mengirim ? "Mengajukan…" : "Ajukan"}
          </button>
        </div>
      </div>
    </BottomSheet>
  );
}

/** Diputuskan DI DALAM BottomSheet induk (bukan sheet sendiri) — mengikuti
 * pola `pm-portal/submittal/page.tsx`. SoD: kalau `izin.diajukan_oleh` sama
 * dengan user berjalan, backend MENOLAK (403) — UI tetap menampilkan tombol
 * (permission PM mengizinkan aksinya SECARA UMUM), tapi galat 403 dari
 * backend menampilkan pesan yang sudah manusiawi dari endpoint
 * (`kepatuhan-k3.ts:399-403`), bukan disembunyikan sejak awal — karena UI
 * tak tahu SIAPA `diajukan_oleh` tanpa membandingkan ke id user berjalan,
 * yang tak tersedia di tipe `IzinKerjaDinilai` (hanya id, bukan pembanding
 * langsung); pola sama dengan Task 24 (backend sebagai penegak, UI sebagai
 * kenyamanan). */
function SheetPutuskanIzin({ izin, onSelesai }: { izin: import("../_bersama/tipe").IzinKerjaDinilai; onSelesai: () => void }) {
  const [alasanTolak, setAlasanTolak] = useState("");
  const [mengirim, setMengirim] = useState(false);
  const [galat, setGalat] = useState<string | null>(null);

  async function putuskan(setujui: boolean) {
    if (!setujui && alasanTolak.trim().length < 10) {
      setGalat("Alasan penolakan wajib diisi, minimal 10 huruf.");
      return;
    }
    setMengirim(true); setGalat(null);
    try {
      await api.patch(`/api/v1/kepatuhan/izin-kerja/${izin.id}/putuskan`, {
        setujui, alasan_tolak: setujui ? undefined : alasanTolak.trim(),
      });
      invalidasi("/api/v1/kepatuhan/izin-kerja");
      onSelesai();
    } catch (e) {
      setGalat(pesanGalat(e as GalatApi, "Gagal memutuskan izin kerja"));
    } finally { setMengirim(false); }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ fontSize: 14, fontWeight: 700, color: "var(--text-primary)" }}>{izin.nomor} — {izin.jenis}</div>
      <div style={{ fontSize: 13, color: "var(--text-secondary)" }}>{izin.uraian_pekerjaan}</div>
      {izin.pengendalian_risiko && (
        <div style={{ fontSize: 13, color: "var(--text-primary)", padding: 12, borderRadius: 12, background: "var(--surface-subtle)" }}>
          {izin.pengendalian_risiko}
        </div>
      )}
      <label style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>
        Alasan tolak (wajib bila menolak)
        <textarea value={alasanTolak} onChange={(e) => setAlasanTolak(e.target.value)} rows={3}
          style={{ width: "100%", marginTop: 6, padding: 12, borderRadius: 12, border: "1px solid var(--border)", fontSize: 14, fontFamily: "inherit" }} />
      </label>
      {galat && <div role="alert" style={{ fontSize: 12, color: "var(--on-danger-bg)", padding: 10, borderRadius: 10, background: "var(--danger-bg)", border: "1px solid var(--danger-border)" }}>{galat}</div>}
      <div style={{ display: "flex", gap: 10 }}>
        <button type="button" onClick={() => putuskan(false)} disabled={mengirim}
          style={{ flex: 1, minHeight: 48, borderRadius: "var(--portal-radius-pill)", background: "var(--danger-bg)", color: "var(--danger)", border: "1px solid var(--danger-border)", fontSize: 14, fontWeight: 700, cursor: mengirim ? "default" : "pointer" }}>
          Tolak
        </button>
        <button type="button" onClick={() => putuskan(true)} disabled={mengirim}
          style={{ flex: 1, minHeight: 48, borderRadius: "var(--portal-radius-pill)", background: "var(--grad-aksen)", color: "var(--on-navy)", border: "none", fontSize: 14, fontWeight: 700, cursor: mengirim ? "default" : "pointer" }}>
          {mengirim ? "Memproses…" : "Setujui"}
        </button>
      </div>
    </div>
  );
}

function SheetCatatEvaluasi({ terbuka, onTutup, proyekId }: { terbuka: boolean; onTutup: () => void; proyekId: string }) {
  const [pihakNama, setPihakNama] = useState("");
  const [skorMutu, setSkorMutu] = useState("80");
  const [skorWaktu, setSkorWaktu] = useState("80");
  const [skorK3, setSkorK3] = useState("80");
  const [skorKepatuhan, setSkorKepatuhan] = useState("80");
  const [jumlahKecelakaan, setJumlahKecelakaan] = useState("0");
  const [mengirim, setMengirim] = useState(false);
  const [galat, setGalat] = useState<string | null>(null);

  async function simpan() {
    if (!pihakNama.trim()) { setGalat("Nama pihak wajib diisi."); return; }
    setMengirim(true); setGalat(null);
    try {
      await api.post("/api/v1/kepatuhan/evaluasi", {
        pihak_nama: pihakNama.trim(), project_id: proyekId || undefined,
        skor_mutu: Number(skorMutu), skor_waktu: Number(skorWaktu),
        skor_k3: Number(skorK3), skor_kepatuhan: Number(skorKepatuhan),
        jumlah_kecelakaan: Number(jumlahKecelakaan) || 0,
      });
      invalidasi("/api/v1/kepatuhan");
      setPihakNama(""); onTutup();
    } catch (e) {
      setGalat(pesanGalat(e as GalatApi, "Gagal menyimpan evaluasi"));
    } finally { setMengirim(false); }
  }

  return (
    <BottomSheet terbuka={terbuka} onTutup={onTutup} judul="Evaluasi Subkon Baru">
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <label style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>
          Nama subkon/pemasok
          <input value={pihakNama} onChange={(e) => setPihakNama(e.target.value)}
            style={{ width: "100%", marginTop: 6, minHeight: 44, padding: "0 12px", borderRadius: 12, border: "1px solid var(--border)", fontSize: 14 }} />
        </label>
        {(
          [
            ["Mutu", skorMutu, setSkorMutu], ["Waktu", skorWaktu, setSkorWaktu],
            ["K3", skorK3, setSkorK3], ["Kepatuhan", skorKepatuhan, setSkorKepatuhan],
          ] as Array<[string, string, (v: string) => void]>
        ).map(([lbl, val, setter]) => (
          <label key={lbl} style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>
            Skor {lbl} (0-100)
            <input type="number" min="0" max="100" value={val}
              onChange={(e) => setter(e.target.value)}
              style={{ width: "100%", marginTop: 6, minHeight: 44, padding: "0 12px", borderRadius: 12, border: "1px solid var(--border)", fontSize: 14 }} />
          </label>
        ))}
        <label style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>
          Jumlah kecelakaan (menggugurkan skor K3, bukan diratakan)
          <input type="number" min="0" value={jumlahKecelakaan} onChange={(e) => setJumlahKecelakaan(e.target.value)}
            style={{ width: "100%", marginTop: 6, minHeight: 44, padding: "0 12px", borderRadius: 12, border: "1px solid var(--border)", fontSize: 14 }} />
        </label>
        {galat && <div role="alert" style={{ fontSize: 12, color: "var(--on-danger-bg)", padding: 10, borderRadius: 10, background: "var(--danger-bg)", border: "1px solid var(--danger-border)" }}>{galat}</div>}
        <button type="button" onClick={simpan} disabled={mengirim}
          style={{ minHeight: 48, borderRadius: "var(--portal-radius-pill)", background: "var(--grad-aksen)", color: "var(--on-navy)", border: "none", fontSize: 14, fontWeight: 700, cursor: mengirim ? "default" : "pointer" }}>
          {mengirim ? "Menyimpan…" : "Simpan Evaluasi"}
        </button>
      </div>
    </BottomSheet>
  );
}
