"use client";

// ============================================================================
// Kompetensi & Rekrutmen — Portal PM (Task 39, Tahap 7).
//
// Picker pegawai + tiga SegmentedTab (Sertifikat / Kinerja / Lamaran) — tab =
// sudut pandang berbeda atas data yang sama, satu endpoint
// `GET /sdm/pegawai/:id/kompetensi` untuk dua tab pertama, endpoint terpisah
// `GET /sdm/lamaran` (lintas-pegawai) untuk tab ketiga.
//
// READ-ONLY PENUH — PM punya `sdm:sertifikat:view` dan `sdm:rekrutmen:view`
// TAPI TIDAK punya `sdm:sertifikat:manage`/`sdm:kinerja:manage`/
// `sdm:rekrutmen:manage` (diverifikasi langsung ke `role_permissions` tenant
// nyata, bukan cuma katalog). TANPA tombol tambah/edit di ketiga tab.
// ============================================================================

import { useMemo, useState } from "react";
import { Award, AlertTriangle, TrendingUp, UserPlus } from "lucide-react";
import { useData } from "@/lib/data-cache";
import EmptyState from "@/components/portal/EmptyState";
import SkeletonCard from "@/components/portal/SkeletonCard";
import SegmentedTab from "@/components/portal/SegmentedTab";
import StatusBadge, { type VarianStatus } from "@/components/portal/StatusBadge";
import type { RespDaftarPegawai, RespKompetensiPegawai, RespDaftarLamaran, GalatApi } from "../../_bersama/tipe";
import { pesanGalat } from "../../_bersama/tipe";

const VARIAN_SERTIFIKAT: Record<string, VarianStatus> = { berlaku: "approved", akan_habis: "pending", kedaluwarsa: "rejected" };
const LABEL_SERTIFIKAT: Record<string, string> = { berlaku: "Berlaku", akan_habis: "Akan Habis", kedaluwarsa: "Kedaluwarsa" };
const LABEL_TAHAP: Record<string, string> = {
  masuk: "Masuk", seleksi_berkas: "Seleksi Berkas", wawancara: "Wawancara",
  tawaran: "Tawaran", diterima: "Diterima", ditolak: "Ditolak",
};
const VARIAN_TAHAP: Record<string, VarianStatus> = {
  masuk: "info", seleksi_berkas: "info", wawancara: "pending",
  tawaran: "pending", diterima: "approved", ditolak: "rejected",
};

type Tab = "sertifikat" | "kinerja" | "lamaran";

export default function PmKompetensiSdmPage() {
  const [pegawaiId, setPegawaiId] = useState("");
  const [tab, setTab] = useState<Tab>("sertifikat");

  const { data: dataPegawai, memuat: memuatPegawai, galat: galatPegawai } =
    useData<RespDaftarPegawai>("/api/v1/sdm/pegawai");
  const daftarPegawai = useMemo(() => dataPegawai?.pegawai ?? [], [dataPegawai]);
  const pegawaiAktif = pegawaiId || daftarPegawai[0]?.id || "";

  const url = pegawaiAktif ? `/api/v1/sdm/pegawai/${pegawaiAktif}/kompetensi` : null;
  const { data, memuat, galat } = useData<RespKompetensiPegawai>(tab !== "lamaran" ? url : null);
  const { data: dataLamaran, memuat: memuatLamaran, galat: galatLamaran } =
    useData<RespDaftarLamaran>(tab === "lamaran" ? "/api/v1/sdm/lamaran" : null);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <h1 style={{ fontSize: 20, fontWeight: 700, color: "var(--text-primary)", margin: 0 }}>
        Kompetensi & Rekrutmen
      </h1>

      <SegmentedTab
        opsi={[
          { value: "sertifikat", label: "Sertifikat" },
          { value: "kinerja", label: "Kinerja" },
          { value: "lamaran", label: "Rekrutmen" },
        ]}
        aktif={tab}
        onUbah={(v) => setTab(v as Tab)}
      />

      {tab !== "lamaran" && (
        <>
          {memuatPegawai && <SkeletonCard tinggi={44} />}
          {!memuatPegawai && galatPegawai && (
            <EmptyState icon={AlertTriangle} judul="Gagal memuat daftar pegawai"
              deskripsi={pesanGalat(galatPegawai as GalatApi, "Coba muat ulang.")} />
          )}
          {!memuatPegawai && !galatPegawai && daftarPegawai.length === 0 && (
            <EmptyState icon={Award} judul="Belum ada data pegawai" deskripsi="Daftar pegawai kosong." />
          )}
          {daftarPegawai.length > 0 && (
            <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <span style={{ fontSize: 12, fontWeight: 600, color: "var(--text-secondary)" }}>Pegawai</span>
              <select value={pegawaiAktif} onChange={(e) => setPegawaiId(e.target.value)}
                style={{ minHeight: 44, padding: "0 12px", borderRadius: 12, border: "1px solid var(--border)", fontSize: 14, background: "var(--surface)", color: "var(--text-primary)" }}>
                {daftarPegawai.map((p) => (
                  <option key={p.id} value={p.id}>{p.orang?.name ?? p.nomor_induk ?? p.id}</option>
                ))}
              </select>
            </label>
          )}
        </>
      )}

      {tab === "sertifikat" && (
        <>
          {memuat && <SkeletonCard tinggi={120} />}
          {galat && <EmptyState icon={AlertTriangle} judul="Gagal memuat sertifikat" deskripsi={pesanGalat(galat as GalatApi, "Coba lagi.")} />}
          {!memuat && !galat && data && data.sertifikat.baris.length === 0 && (
            <EmptyState icon={Award} judul="Belum ada sertifikat" deskripsi="SKA/SKT tenaga ahli akan muncul di sini." />
          )}
          {!memuat && !galat && data && data.sertifikat.baris.length > 0 && (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {data.sertifikat.baris.map((s) => (
                <div key={s.id} style={{ background: "var(--surface)", borderRadius: 12, padding: 12, border: "1px solid var(--border)" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>{s.nama}</div>
                      <div style={{ fontSize: 11, color: "var(--text-secondary)" }}>{s.jenis}{s.kualifikasi ? ` · ${s.kualifikasi}` : ""}</div>
                    </div>
                    <StatusBadge status={VARIAN_SERTIFIKAT[s.status]} label={LABEL_SERTIFIKAT[s.status]} />
                  </div>
                  {s.sisa_hari !== null && (
                    <div style={{ fontSize: 11, color: "var(--text-secondary)", marginTop: 6 }}>
                      {s.sisa_hari < 0 ? `Kedaluwarsa ${Math.abs(s.sisa_hari)} hari lalu` : `Sisa ${s.sisa_hari} hari`}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {tab === "kinerja" && (
        <>
          {memuat && <SkeletonCard tinggi={100} />}
          {galat && <EmptyState icon={AlertTriangle} judul="Gagal memuat kinerja" deskripsi={pesanGalat(galat as GalatApi, "Coba lagi.")} />}
          {!memuat && !galat && data && data.kinerja.tren.length === 0 && (
            <EmptyState icon={TrendingUp} judul="Belum ada penilaian" deskripsi="Penilaian kinerja berkala akan muncul di sini." />
          )}
          {!memuat && !galat && data && data.kinerja.tren.length > 0 && (
            <>
              <div style={{ background: "var(--surface)", borderRadius: 14, padding: 14, border: "1px solid var(--border)" }}>
                <div style={{ fontSize: 11, color: "var(--text-secondary)" }}>Rata-rata (final)</div>
                <div style={{ fontSize: 20, fontWeight: 700, color: "var(--text-primary)" }}>
                  {data.kinerja.rata_final !== null ? `${data.kinerja.rata_final}%` : "—"}
                </div>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {data.kinerja.tren.map((t) => (
                  <div key={t.periode} style={{ display: "flex", justifyContent: "space-between", padding: 10, borderRadius: 10, background: "var(--surface)", border: "1px solid var(--border)" }}>
                    <span style={{ fontSize: 13, color: "var(--text-secondary)" }}>{t.periode}{t.status === "draf" ? " (draf)" : ""}</span>
                    <span style={{ fontSize: 13, fontWeight: 700, color: "var(--text-primary)" }}>{t.persen !== null ? `${t.persen}%` : "—"}</span>
                  </div>
                ))}
              </div>
            </>
          )}
        </>
      )}

      {tab === "lamaran" && (
        <>
          {memuatLamaran && <SkeletonCard tinggi={120} />}
          {galatLamaran && <EmptyState icon={AlertTriangle} judul="Gagal memuat lamaran" deskripsi={pesanGalat(galatLamaran as GalatApi, "Coba lagi.")} />}
          {!memuatLamaran && !galatLamaran && (dataLamaran?.lamaran.length ?? 0) === 0 && (
            <EmptyState icon={UserPlus} judul="Belum ada lamaran" deskripsi="Lamaran kerja yang masuk akan tercatat di sini." />
          )}
          {!memuatLamaran && !galatLamaran && (dataLamaran?.lamaran.length ?? 0) > 0 && (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {(dataLamaran?.lamaran ?? []).map((l) => (
                <div key={l.id} style={{ background: "var(--surface)", borderRadius: 12, padding: 12, border: "1px solid var(--border)" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>{l.nama}</div>
                      <div style={{ fontSize: 11, color: "var(--text-secondary)" }}>{l.posisi}</div>
                    </div>
                    <StatusBadge status={VARIAN_TAHAP[l.tahap]} label={LABEL_TAHAP[l.tahap]} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
