"use client";

// ============================================================================
// Susun Laporan — Portal PM (Task 43, Tahap 7).
//
// Report builder G6d, versi mobile: pilih sumber data → pilih kolom →
// jalankan → tabel hasil ringkas. Sumber yang tampil di dropdown SUDAH
// tersaring server (`GET /laporan/sumber` hanya mengirim sumber yang
// `hasPermission` PM) — frontend tak menyaring ulang, dan tak perlu
// `hasPermission()` klien untuk ini: bukan tombol approve/reject/decide,
// hanya pilihan sumber baca yang gerbangnya sudah dua lapis di server
// (lihat komentar kepala `laporan-susun.ts`: gerbang fitur `reports:susun`
// + gerbang per-sumber `sumber.izin`).
//
// Tak ada tombol tulis lain di halaman ini — murni baca & tampilkan.
// ============================================================================

import { useMemo, useState } from "react";
import { FileBarChart, AlertTriangle, Play } from "lucide-react";
import { useData } from "@/lib/data-cache";
import { api } from "@/lib/api";
import EmptyState from "@/components/portal/EmptyState";
import KepalaPortal from "@/components/portal/KepalaPortal";
import SkeletonCard from "@/components/portal/SkeletonCard";
import type { RespSumberLaporan, RespHasilLaporanSusun, GalatApi } from "../../_bersama/tipe";
import { pesanGalat } from "../../_bersama/tipe";

export default function PmSusunLaporanPage() {
  const [sumberKunci, setSumberKunci] = useState("");
  const [kolomDipilih, setKolomDipilih] = useState<string[]>([]);
  const [hasil, setHasil] = useState<RespHasilLaporanSusun | null>(null);
  const [menjalankan, setMenjalankan] = useState(false);
  const [galatJalan, setGalatJalan] = useState<string | null>(null);

  const { data, memuat, galat: galatMuat } = useData<RespSumberLaporan>("/api/v1/laporan/sumber");
  const sumberAktif = useMemo(() => data?.sumber.find((s) => s.kunci === sumberKunci) ?? null, [data, sumberKunci]);

  function pilihSumber(kunci: string) {
    setSumberKunci(kunci);
    const s = data?.sumber.find((x) => x.kunci === kunci);
    setKolomDipilih(s ? s.kolom.slice(0, 5).map((k) => k.kunci) : []);
    setHasil(null);
    setGalatJalan(null);
  }

  function toggleKolom(kunci: string) {
    setKolomDipilih((prev) => (prev.includes(kunci) ? prev.filter((k) => k !== kunci) : [...prev, kunci]));
  }

  async function jalankan() {
    if (!sumberAktif || kolomDipilih.length === 0) {
      setGalatJalan("Pilih sumber dan minimal satu kolom.");
      return;
    }
    setMenjalankan(true);
    setGalatJalan(null);
    try {
      const resp = await api.post<RespHasilLaporanSusun>("/api/v1/laporan/susun", {
        sumber: sumberAktif.kunci,
        kolom: kolomDipilih,
        batas: 100,
      });
      setHasil(resp.data);
    } catch (e) {
      setGalatJalan(pesanGalat(e as GalatApi, "Gagal menjalankan laporan"));
    } finally {
      setMenjalankan(false);
    }
  }

  const galat = galatJalan ?? (galatMuat ? pesanGalat(galatMuat as GalatApi, "Gagal memuat sumber laporan") : null);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--gap-bagian)" }}>
      <KepalaPortal judul="Susun Laporan" />

      {memuat && <SkeletonCard tinggi={100} />}
      {galatMuat && (
        <EmptyState icon={AlertTriangle} judul="Gagal memuat" deskripsi={pesanGalat(galatMuat as GalatApi, "Coba lagi.")} />
      )}
      {!memuat && !galatMuat && (data?.sumber.length ?? 0) === 0 && (
        <EmptyState
          icon={FileBarChart}
          judul="Tidak ada sumber tersedia"
          deskripsi="Anda belum punya izin membaca sumber laporan mana pun."
        />
      )}

      {!memuat && !galatMuat && data && data.sumber.length > 0 && (
        <>
          <label htmlFor="pm-laporan-sumber" style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: "var(--text-secondary)" }}>Sumber Data</span>
            <select
              id="pm-laporan-sumber"
              value={sumberKunci}
              onChange={(e) => pilihSumber(e.target.value)}
              style={{
                minHeight: 44,
                padding: "0 12px",
                borderRadius: 12,
                border: "1px solid var(--border)",
                fontSize: 14,
                background: "var(--surface)",
                color: "var(--text-primary)",
              }}
            >
              <option value="">— Pilih sumber —</option>
              {data.sumber.map((s) => (
                <option key={s.kunci} value={s.kunci}>
                  {s.label}
                </option>
              ))}
            </select>
          </label>

          {sumberAktif && (
            <>
              <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>{sumberAktif.keterangan}</div>

              <fieldset style={{ border: "none", padding: 0, margin: 0 }}>
                <legend style={{ fontSize: 12, fontWeight: 600, color: "var(--text-secondary)", marginBottom: 6, padding: 0 }}>
                  Kolom yang ditampilkan
                </legend>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                  {sumberAktif.kolom.map((k) => {
                    const dipilih = kolomDipilih.includes(k.kunci);
                    return (
                      <button
                        key={k.kunci}
                        type="button"
                        aria-pressed={dipilih}
                        onClick={() => toggleKolom(k.kunci)}
                        style={{
                          padding: "6px 12px",
                          borderRadius: "var(--portal-radius-pill)",
                          fontSize: 12,
                          fontWeight: 600,
                          cursor: "pointer",
                          minHeight: 36,
                          border: `1px solid ${dipilih ? "var(--navy)" : "var(--border)"}`,
                          background: dipilih ? "var(--info-bg)" : "var(--surface)",
                          color: dipilih ? "var(--navy)" : "var(--text-secondary)",
                        }}
                      >
                        {dipilih ? "✓ " : ""}
                        {k.label}
                      </button>
                    );
                  })}
                </div>
              </fieldset>

              {galat && (
                <div role="alert" style={{ fontSize: 12, color: "var(--danger)" }}>
                  {galat}
                </div>
              )}
              <button
                type="button"
                onClick={() => void jalankan()}
                disabled={menjalankan}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 6,
                  minHeight: 48,
                  borderRadius: "var(--portal-radius-pill)",
                  border: "none",
                  background: menjalankan ? "var(--surface-subtle)" : "var(--grad-aksen)",
                  color: menjalankan ? "var(--text-muted)" : "var(--on-navy)",
                  fontSize: 14,
                  fontWeight: 700,
                  cursor: menjalankan ? "default" : "pointer",
                }}
              >
                <Play size={16} aria-hidden="true" />
                {menjalankan ? "Menjalankan…" : "Jalankan"}
              </button>
            </>
          )}
        </>
      )}

      <div aria-live="polite">
        {hasil && (
          <div style={{ background: "var(--surface)", borderRadius: 16, padding: "var(--pad-kartu-lega)", border: "1px solid var(--border)", overflowX: "auto" }}>
            <div style={{ fontSize: 12, color: "var(--text-secondary)", marginBottom: 8 }}>
              {hasil.jumlah} baris{hasil.terpotong ? ` (dipotong batas ${hasil.batas})` : ""}
            </div>
            {hasil.baris.length === 0 && (
              <EmptyState icon={FileBarChart} judul="Tidak ada baris" deskripsi="Saringan atau sumber ini belum punya data." />
            )}
            <div style={{ display: "flex", flexDirection: "column", gap: 6, minWidth: 280 }}>
              {hasil.baris.map((baris, i) => (
                <div key={i} style={{ padding: 10, borderRadius: 10, background: "var(--surface-subtle)", fontSize: 12 }}>
                  {hasil.kolom.map((k) => (
                    <div key={k.kunci} style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                      <span style={{ color: "var(--text-secondary)" }}>{k.label}</span>
                      <span style={{ fontWeight: 600, color: "var(--text-primary)", textAlign: "right" }}>
                        {String(baris[k.kunci] ?? "—")}
                      </span>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
