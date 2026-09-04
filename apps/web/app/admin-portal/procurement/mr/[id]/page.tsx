"use client";

// ============================================================================
// DETAIL MATERIAL REQUEST — Portal Admin/Direktur (Tahap 4, Task 21 Step 4)
//
// ══════════════════════════════════════════════════════════════════════════
// YANG ADA DI SINI TAPI TIDAK DI PORTAL PM: OVERRIDE KUOTA RAB
// ══════════════════════════════════════════════════════════════════════════
//
// `procurement:mr:override_quota` dimiliki admin/direktur, TIDAK oleh PM.
// Halaman PM hanya menampilkan pelanggaran kuota sebagai informasi dan
// membiarkan tombol ajukan terkunci — benar untuk PM, salah kalau disalin ke
// sini: menyalinnya apa adanya akan MENYEMBUNYIKAN kapabilitas yang
// admin/direktur benar-benar punya.
//
// ⚠ KONTRAK OVERRIDE — DIVERIFIKASI KE KODE, BUKAN KE RENCANA
//
// Plan Task 21 menulis "mengirim `override_quota: true` ke submit". Itu
// KELIRU. `procurement.ts:631-650` membaca `override_reason` (TEKS) dan
// menolak apa pun yang panjangnya < 10 karakter:
//
//     const { override_reason } = (request.body ?? {}) as { override_reason?: string }
//     if (!bolehOverride || alasan.length < 10) → 422
//
// Mengirim `override_quota: true` akan SELALU ditolak 422, dan pemakainya tak
// akan pernah tahu kenapa. Karena itu form di bawah meminta ALASAN, bukan
// centang — dan alasan itu memang layak diminta: melampaui volume RAB adalah
// keputusan yang harus bisa dipertanggungjawabkan belakangan.
//
// ⚠ Bentuk `RespQuotaCheck` juga berbeda dari yang ditulis plan (`sisa` dan
// `tanpa_kuota` sebagai objek). Yang benar ada di `_bersama/tipe.ts` —
// diturunkan dari `lib/kuota-rab-material.ts`, dan COCOK dengan tipe milik
// pm-portal yang membaca endpoint yang sama.
//
// Approve/reject SENGAJA tidak ada di sini — satu pintu di
// `/admin-portal/inbox`, pola sama dengan Portal PM. Alasannya: SoD (pengaju
// tak boleh menyetujui sendiri) dan pesan eskalasi hanya hidup di satu tempat.
// ============================================================================

import { useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { ClipboardList, ShieldAlert, CheckCircle2, ArrowLeft } from "lucide-react";
import { useData, invalidasi } from "@/lib/data-cache";
import { api } from "@/lib/api";
import { useIzin } from "@/lib/use-izin";
import { formatRupiah } from "@/lib/format";
import EmptyState from "@/components/portal/EmptyState";
import SkeletonCard from "@/components/portal/SkeletonCard";
import StatusBadge, { type VarianStatus } from "@/components/portal/StatusBadge";
import type { RespMrDetail, RespQuotaCheck, GalatApi } from "../../../_bersama/tipe";
import { pesanGalat } from "../../../_bersama/tipe";

const LABEL_STATUS: Record<string, string> = {
  draft: "Draf", submitted: "Diajukan", approved: "Disetujui", rejected: "Ditolak",
  partially_ordered: "Sebagian Dipesan", fully_ordered: "Selesai Dipesan",
};
const VARIAN_STATUS: Record<string, VarianStatus> = {
  draft: "netral", submitted: "pending", approved: "approved", rejected: "rejected",
  partially_ordered: "info", fully_ordered: "approved",
};

/** Server menolak alasan < 10 karakter (procurement.ts:645). */
const MIN_ALASAN = 10;

export default function AdminMrDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;

  const url = `/api/v1/procurement/material-requests/${id}`;
  const { data, memuat, galat } = useData<RespMrDetail>(url);
  const mr = data?.material_request;

  const bolehKelola = useIzin("procurement:mr:manage");

  const [cekKuota, setCekKuota] = useState(false);
  const { data: dataKuota, memuat: memuatKuota } =
    useData<RespQuotaCheck>(cekKuota ? `${url}/quota-check` : null);

  /*
    Galat AKSI terpisah dari galat MUAT — dua kegagalan berbeda, dua state
    berbeda (`uji-galat-muat-terpisah.mjs`, ambang NOL). Jaringan putus saat
    memuat halaman tak boleh tertimpa senyap oleh percobaan submit.
  */
  const [mengirim, setMengirim] = useState(false);
  const [galatAksi, setGalatAksi] = useState<string | null>(null);
  const [alasan, setAlasan] = useState("");
  const [sukses, setSukses] = useState<string | null>(null);

  const perluOverride = Boolean(dataKuota && !dataKuota.lolos);
  const bisaOverride = Boolean(dataKuota?.bisa_override);
  const alasanCukup = alasan.trim().length >= MIN_ALASAN;

  async function ajukan() {
    if (!mr) return;
    setMengirim(true);
    setGalatAksi(null);
    setSukses(null);
    try {
      /*
        `override_reason` hanya disertakan bila memang dibutuhkan. Mengirim
        alasan pada MR yang lolos kuota tak berbahaya, tetapi menyertakannya
        tanpa perlu membuat jejak audit berisi alasan untuk sesuatu yang tak
        pernah dilanggar.
      */
      const muatan = perluOverride && alasanCukup
        ? { override_reason: alasan.trim() }
        : {};
      await api.patch(`${url}/submit`, muatan);
      invalidasi(url);
      invalidasi("/api/v1/procurement/material-requests");
      setSukses("Material Request berhasil diajukan.");
      setAlasan("");
      setCekKuota(false);
    } catch (e) {
      /*
        422 = kuota terlampaui. Server memulangkan `pelanggaran` di badannya,
        tetapi cara paling jujur menampilkannya adalah MENYALAKAN pemeriksa
        kuota — supaya pengguna melihat rincian yang sama dengan yang server
        pakai untuk menolak, bukan ringkasan versi klien.
      */
      const status = (e as GalatApi)?.response?.status;
      if (status === 422) setCekKuota(true);
      setGalatAksi(pesanGalat(e as GalatApi, "Gagal mengajukan Material Request."));
    } finally {
      setMengirim(false);
    }
  }

  if (memuat) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <SkeletonCard tinggi={90} />
        <SkeletonCard tinggi={140} />
      </div>
    );
  }

  if (galat || !mr) {
    return (
      <EmptyState
        icon={ClipboardList}
        judul="Material Request tidak ditemukan"
        deskripsi={galat ? pesanGalat(galat as GalatApi, "Coba muat ulang.") : "MR ini mungkin sudah dihapus."}
      />
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <Link href="/admin-portal/procurement" style={tautanKembali}>
        <ArrowLeft size={16} aria-hidden="true" /> Procurement
      </Link>

      <div style={kepala}>
        <h1 style={{
        fontSize: "var(--t-judul)", fontWeight: 700,
        color: "var(--text-primary)", margin: 0, letterSpacing: "-0.01em",
      }}>
          {mr.mr_number ?? "Material Request"}
        </h1>
        <StatusBadge
          status={VARIAN_STATUS[mr.status] ?? "netral"}
          label={LABEL_STATUS[mr.status] ?? mr.status}
        />
      </div>

      <div style={kartu}>
        {/* Nama proyek WAJIB — admin membuka MR dari daftar lintas-proyek. */}
        <Baris label="Proyek" nilai={mr.project?.name ?? "—"} />
        <Baris label="Tanggal" nilai={mr.request_date ?? "—"} />
        <Baris label="Dibutuhkan" nilai={mr.needed_date ?? "—"} />
        <Baris label="Diminta oleh" nilai={mr.requested_by?.name ?? "—"} />
        {mr.approved_by?.name && <Baris label="Disetujui oleh" nilai={mr.approved_by.name} />}
        {mr.notes && <Baris label="Catatan" nilai={mr.notes} />}
      </div>

      <div style={kartu}>
        <div style={{ fontSize: 13, fontWeight: 700, color: "var(--text-primary)", marginBottom: 8 }}>
          Item ({mr.items.length})
        </div>
        {mr.items.map((it) => (
          <div key={it.id} style={barisItem}>
            <div>
              <div style={{ fontSize: 13, color: "var(--text-primary)" }}>
                {it.material?.name ?? "Material"}
              </div>
              <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>
                {Number(it.qty_requested)} {it.unit}
                {it.qty_ordered != null ? ` · dipesan ${Number(it.qty_ordered)}` : ""}
              </div>
            </div>
            {it.unit_price_est != null && (
              <div style={{ fontSize: 12, color: "var(--text-secondary)", fontVariantNumeric: "tabular-nums" }}>
                {formatRupiah(it.unit_price_est)}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* ── Pengajuan: hanya untuk MR draft ───────────────────────────── */}
      {mr.status === "draft" && bolehKelola && (
        <div style={kartu}>
          <div style={{ fontSize: 13, fontWeight: 700, color: "var(--text-primary)" }}>
            Ajukan MR ini
          </div>
          <p style={{ fontSize: 12, color: "var(--text-secondary)", margin: "6px 0 10px", lineHeight: 1.5 }}>
            Mengajukan mengunci MR dari penyuntingan dan mengirimnya ke antrean
            persetujuan.
          </p>

          {!cekKuota && (
            <button type="button" onClick={() => setCekKuota(true)} style={tombolSekunder}>
              Periksa kuota RAB dulu
            </button>
          )}

          {memuatKuota && <SkeletonCard tinggi={60} />}

          {dataKuota?.lolos && (
            <div style={kotakLolos} role="status">
              <CheckCircle2 size={16} aria-hidden="true" />
              Kuota RAB aman — tidak ada volume yang terlampaui.
            </div>
          )}

          {perluOverride && (
            <div style={kotakLanggar} role="alert">
              <div style={{ display: "flex", alignItems: "center", gap: 6, fontWeight: 700 }}>
                <ShieldAlert size={16} aria-hidden="true" />
                Melebihi volume RAB
              </div>
              {dataKuota!.pelanggaran.map((v) => (
                <div key={v.material_id} style={{ fontSize: 12, marginTop: 6 }}>
                  <strong>{v.material_name}</strong> — RAB {v.rab_quantity}{v.unit ? ` ${v.unit}` : ""},
                  sudah di MR lain {v.sudah_di_mr}, diminta {v.diminta}
                  {" "}(total {v.total}, <strong>lebih {v.kelebihan}</strong>)
                </div>
              ))}
              {dataKuota!.tanpa_kuota.length > 0 && (
                <div style={{ fontSize: 12, marginTop: 8 }}>
                  {dataKuota!.tanpa_kuota.length} material tidak punya baris kuota RAB sama sekali.
                </div>
              )}
            </div>
          )}

          {/*
            Form alasan hanya muncul bila kuota TERLAMPAUI dan pemakainya
            memang boleh melampaui. Menampilkannya pada MR yang lolos akan
            membuat orang mengira setiap pengajuan butuh pembenaran.
          */}
          {perluOverride && bisaOverride && (
            <div style={{ marginTop: 10 }}>
              <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <span style={{ fontSize: 12, fontWeight: 600, color: "var(--text-secondary)" }}>
                  Alasan melampaui RAB (minimal {MIN_ALASAN} karakter)
                </span>
                <textarea
                  value={alasan}
                  onChange={(e) => setAlasan(e.target.value)}
                  rows={3}
                  placeholder="Contoh: tambahan volume akibat perubahan desain lantai 2, disetujui owner 26/08."
                  style={isianTeks}
                />
              </label>
              {/*
                Penghitung hanya muncul SELAMA alasan masih kurang. Begitu
                cukup, "66/10 karakter" justru membingungkan — pembacanya
                mengira ada batas ATAS 10 yang sudah dilampaui.
              */}
              <div style={{ fontSize: "var(--t-kecil)", color: "var(--text-secondary)", marginTop: 4 }}>
                {alasanCukup
                  ? "Alasan cukup panjang."
                  : `Kurang ${MIN_ALASAN - alasan.trim().length} karakter lagi.`}
              </div>
            </div>
          )}

          {perluOverride && !bisaOverride && (
            <p style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: 10, lineHeight: 1.5 }}>
              Anda tidak punya izin melampaui kuota RAB. Kurangi jumlah pada
              item di atas, atau minta penambahan volume RAB lebih dulu.
            </p>
          )}

          {galatAksi && <div role="alert" style={kotakGalat}>{galatAksi}</div>}
          {sukses && <div role="status" style={kotakLolos}>{sukses}</div>}

          <button
            type="button"
            onClick={ajukan}
            disabled={mengirim || (perluOverride && (!bisaOverride || !alasanCukup))}
            style={{
              ...tombolUtama,
              background: mengirim || (perluOverride && (!bisaOverride || !alasanCukup))
                ? "var(--surface-subtle)" : "var(--grad-aksen)",
              color: mengirim || (perluOverride && (!bisaOverride || !alasanCukup))
                ? "var(--text-muted)" : "var(--on-navy)",
            }}
          >
            {mengirim ? "Mengajukan…" : perluOverride ? "Ajukan dengan alasan" : "Ajukan MR"}
          </button>
        </div>
      )}

      {mr.status === "submitted" && (
        <div style={kartu}>
          <p style={{ fontSize: 12, color: "var(--text-secondary)", margin: 0, lineHeight: 1.5 }}>
            MR ini menunggu persetujuan. Keputusan diambil di{" "}
            <Link href="/admin-portal/inbox" style={{ color: "var(--navy)", fontWeight: 600 }}>
              Menunggu Persetujuan
            </Link>{" "}
            supaya seluruh keputusan tercatat lewat satu pintu.
          </p>
        </div>
      )}
    </div>
  );
}

function Baris({ label, nilai }: { label: string; nilai: string }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", gap: 12, padding: "4px 0" }}>
      <span style={{ fontSize: 12, color: "var(--text-secondary)" }}>{label}</span>
      <span style={{ fontSize: 13, color: "var(--text-primary)", textAlign: "right" }}>{nilai}</span>
    </div>
  );
}

const kepala: React.CSSProperties = {
  display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8,
};
const kartu: React.CSSProperties = {
  padding: 14, borderRadius: 14,
  background: "var(--surface)",
  border: "1px solid color-mix(in srgb, var(--border) 40%, transparent)",
  boxShadow: "var(--naik-1)",
};
const barisItem: React.CSSProperties = {
  display: "flex", justifyContent: "space-between", alignItems: "center",
  gap: 12, padding: "8px 0", borderTop: "1px solid var(--border)",
};
const tautanKembali: React.CSSProperties = {
  display: "inline-flex", alignItems: "center", gap: 6, minHeight: 44,
  fontSize: 13, fontWeight: 600, color: "var(--text-secondary)", textDecoration: "none",
};
const isianTeks: React.CSSProperties = {
  width: "100%", padding: 10, borderRadius: 12,
  border: "1px solid var(--border)", fontSize: 13,
  background: "var(--surface)", color: "var(--text-primary)",
  fontFamily: "inherit", resize: "vertical",
};
const tombolUtama: React.CSSProperties = {
  width: "100%", minHeight: 44, marginTop: 12, borderRadius: 12,
  border: "none", fontSize: 14, fontWeight: 700, cursor: "pointer",
};
const tombolSekunder: React.CSSProperties = {
  width: "100%", minHeight: 44, borderRadius: 12,
  border: "1px solid var(--border)", background: "var(--surface)",
  color: "var(--text-primary)", fontSize: 13, fontWeight: 600, cursor: "pointer",
};
const kotakLanggar: React.CSSProperties = {
  marginTop: 10, padding: 12, borderRadius: 12,
  background: "var(--warning-bg)", color: "var(--on-warning-bg)", fontSize: 13,
};
const kotakLolos: React.CSSProperties = {
  marginTop: 10, padding: 12, borderRadius: 12,
  display: "flex", alignItems: "center", gap: 6,
  background: "var(--success-bg)", color: "var(--on-success-bg)", fontSize: 13,
};
const kotakGalat: React.CSSProperties = {
  marginTop: 10, padding: 12, borderRadius: 12,
  background: "var(--danger-bg)", color: "var(--on-danger-bg)", fontSize: 13,
};
