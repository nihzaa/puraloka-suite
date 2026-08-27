"use client";

// ============================================================================
// TENDER SUBKON — Portal Admin/Direktur (Tahap 6)
//
// ══════════════════════════════════════════════════════════════════════════
// KENAPA JUMLAH PENAWARAN DITAMPILKAN, DAN YANG NOL DISOROT
// ══════════════════════════════════════════════════════════════════════════
//
// Server menuliskan alasannya sendiri di `tender-subkon.ts`:
//
//   "tanpa angka ini layar tak punya cara memilih tender mana yang dibuka
//    lebih dulu, dan urutan `tanggal DESC` membuat tender TERBARU yang
//    menang — yang justru paling mungkin belum ada penawarannya. Pengguna
//    membuka layar perbandingan dan disambut 'belum ada penawaran', padahal
//    tender lain penuh isinya."
//
// Karena itu jumlah penawaran bukan hiasan: ia yang menentukan tender mana
// yang layak dibuka. Yang NOL disorot supaya tak tenggelam.
//
// ⚠ `penawaran_subkon` adalah ARRAY `[{ count: n }]`, bukan angka — bentuk
// embed count Supabase. Menulisnya langsung ke layar menghasilkan
// "[object Object]".
//
// ── Penyaring proyek OPSIONAL, pola Task 21
//
// Admin/direktur bekerja lintas proyek. `project_id` opsional di server, dan
// tanpa parameter itu seluruh proyek tenant ikut. "Semua Proyek" adalah
// bawaan, bukan prasyarat — konsekuensinya nama proyek WAJIB di tiap kartu.
// ============================================================================

import { useMemo, useState } from "react";
import Link from "next/link";
import { Gavel, Users } from "lucide-react";
import { useData } from "@/lib/data-cache";
import { formatRupiah } from "@/lib/format";
import SegmentedTab from "@/components/portal/SegmentedTab";
import KepalaPortal from "@/components/portal/KepalaPortal";
import StatusBadge, { type VarianStatus } from "@/components/portal/StatusBadge";
import EmptyState from "@/components/portal/EmptyState";
import SkeletonCard from "@/components/portal/SkeletonCard";
import type { ProyekPM, RespTenderSubkon, GalatApi } from "../_bersama/tipe";
import { pesanGalat } from "../_bersama/tipe";

interface RespProyek { projects: ProyekPM[] }

const LABEL_STATUS: Record<string, string> = {
  draft: "Draf", dibuka: "Dibuka", ditutup: "Ditutup",
  dievaluasi: "Dievaluasi", selesai: "Selesai", dibatalkan: "Dibatalkan",
};
const VARIAN_STATUS: Record<string, VarianStatus> = {
  draft: "netral", dibuka: "pending", ditutup: "info",
  dievaluasi: "info", selesai: "approved", dibatalkan: "rejected",
};

/** "Semua Proyek" — string kosong supaya `?project_id=` tak dikirim. */
const SEMUA = "";

/**
 * Sisa hari menuju batas masuk. Negatif berarti SUDAH LEWAT.
 *
 * Pola yang sama dipakai di Task 23 & Tahap 5: menampilkan "sisa -3 hari"
 * apa adanya terbaca janggal dan menyembunyikan yang justru penting.
 */
function labelBatas(iso: string | null): { teks: string; lewat: boolean } | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return null;
  const hari = Math.ceil((t - Date.now()) / 86_400_000);
  if (hari < 0) return { teks: `lewat ${Math.abs(hari)} hari`, lewat: true };
  if (hari === 0) return { teks: "tutup hari ini", lewat: false };
  return { teks: `sisa ${hari} hari`, lewat: false };
}

export default function AdminTenderPage() {
  const [proyekId, setProyekId] = useState(SEMUA);
  const [status, setStatus] = useState("semua");

  const { data: dataProyek } = useData<RespProyek>("/api/v1/projects");
  const daftarProyek = useMemo(() => dataProyek?.projects ?? [], [dataProyek]);

  const qs = proyekId ? `?project_id=${encodeURIComponent(proyekId)}` : "";
  const { data, memuat, galat } =
    useData<RespTenderSubkon>(`/api/v1/tender-subkon${qs}`);

  const tender = useMemo(() => {
    const xs = data?.tender ?? [];
    return status === "semua" ? xs : xs.filter((t) => t.status === status);
  }, [data, status]);

  const tanpaPenawaran = tender.filter(
    (t) => (t.penawaran_subkon?.[0]?.count ?? 0) === 0,
  ).length;

  if (memuat) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <SkeletonCard tinggi={80} />
        <SkeletonCard tinggi={120} />
      </div>
    );
  }

  if (galat) {
    return (
      <EmptyState
        icon={Gavel}
        judul="Gagal memuat tender"
        deskripsi={pesanGalat(galat as GalatApi, "Coba muat ulang.")}
      />
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <KepalaPortal judul="Tender Subkon" />

      {daftarProyek.length > 1 && (
        <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <span style={labelKecil}>Proyek</span>
          <select value={proyekId} onChange={(e) => setProyekId(e.target.value)} style={isian}>
            <option value={SEMUA}>Semua Proyek</option>
            {daftarProyek.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </label>
      )}

      <SegmentedTab
        opsi={[
          { value: "semua", label: "Semua" },
          { value: "dibuka", label: "Dibuka" },
          { value: "selesai", label: "Selesai" },
        ]}
        aktif={status}
        onUbah={setStatus}
      />

      {/*
        Peringatan tender tanpa penawaran — inilah yang server minta
        ditonjolkan. Tanpa ini, urutan `tanggal DESC` menyembunyikannya.
      */}
      {tanpaPenawaran > 0 && (
        <div style={kotakPeringatan} role="status">
          {tanpaPenawaran} tender belum punya satu pun penawaran.
        </div>
      )}

      {tender.length === 0 ? (
        <EmptyState
          icon={Gavel}
          judul="Belum ada tender"
          deskripsi={
            status === "semua"
              ? "Tender subkontraktor akan muncul di sini."
              : `Tidak ada tender berstatus "${LABEL_STATUS[status] ?? status}".`
          }
        />
      ) : (
        tender.map((t) => {
          const jml = t.penawaran_subkon?.[0]?.count ?? 0;
          const batas = labelBatas(t.batas_masuk);
          return (
            <article key={t.id} style={kartu}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                <div style={{ minWidth: 0 }}>
                  <h2 style={{ fontSize: 14, fontWeight: 700, color: "var(--text-primary)", margin: 0 }}>
                    {t.judul ?? t.nomor ?? "Tender"}
                  </h2>
                  <div style={metaKecil}>
                    {t.nomor ? `${t.nomor} · ` : ""}
                    {/* Nama proyek WAJIB — daftar ini lintas-proyek. */}
                    {t.proyek?.name ?? "Proyek tak diketahui"}
                  </div>
                </div>
                {t.status && (
                  <StatusBadge
                    status={VARIAN_STATUS[t.status] ?? "netral"}
                    label={LABEL_STATUS[t.status] ?? t.status}
                  />
                )}
              </div>

              {t.lingkup_kerja && (
                <p style={{ ...metaKecil, margin: "8px 0 0" }}>{t.lingkup_kerja}</p>
              )}

              <div style={{ display: "flex", gap: 14, marginTop: 10, flexWrap: "wrap" }}>
                <Mini
                  label="Penawaran masuk"
                  nilai={String(jml)}
                  sorot={jml === 0}
                  ikon={Users}
                />
                {t.nilai_perkiraan != null && (
                  <Mini label="Perkiraan nilai" nilai={formatRupiah(t.nilai_perkiraan)} />
                )}
                {batas && (
                  <Mini label="Batas masuk" nilai={batas.teks} sorot={batas.lewat} />
                )}
              </div>
            </article>
          );
        })
      )}

      <p style={{ ...metaKecil, margin: 0, lineHeight: 1.5 }}>
        Data klien pemberi kerja ada di{" "}
        <Link href="/admin-portal/klien" style={{ color: "var(--navy)", fontWeight: 600 }}>
          Daftar Klien
        </Link>.
      </p>
    </div>
  );
}

function Mini({
  label, nilai, sorot, ikon: Ikon,
}: {
  label: string; nilai: string; sorot?: boolean; ikon?: typeof Users;
}) {
  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 4, ...metaKecil, fontSize: 11 }}>
        {Ikon && <Ikon size={12} aria-hidden="true" />}
        {label}
      </div>
      <div style={{
        fontSize: 14, fontWeight: 700,
        color: sorot ? "var(--on-danger-bg)" : "var(--text-primary)",
        fontVariantNumeric: "tabular-nums",
      }}>
        {nilai}
      </div>
    </div>
  );
}

const kartu: React.CSSProperties = {
  padding: 14, borderRadius: 14,
  background: "var(--surface)",
  border: "1px solid color-mix(in srgb, var(--border) 40%, transparent)",
  boxShadow: "var(--naik-1)",
};
const labelKecil: React.CSSProperties = {
  fontSize: 12, fontWeight: 600, color: "var(--text-secondary)",
};
const metaKecil: React.CSSProperties = {
  fontSize: 12, color: "var(--text-secondary)",
};
const isian: React.CSSProperties = {
  minHeight: 44, padding: "0 12px", borderRadius: 12,
  border: "1px solid var(--border)", fontSize: 14,
  background: "var(--surface)", color: "var(--text-primary)",
};
const kotakPeringatan: React.CSSProperties = {
  padding: 12, borderRadius: 12,
  background: "var(--warning-bg)", color: "var(--on-warning-bg)",
  fontSize: 12, lineHeight: 1.5,
};
