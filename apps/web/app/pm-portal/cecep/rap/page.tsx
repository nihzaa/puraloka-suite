"use client";

// ============================================================================
// RAP — dashbor daftar per proyek (Tahap 3, Task 20).
//
// RAP (rap_budget) = rencana BELANJA internal (harga supplier + borongan
// mandor), diturunkan dari take-off RAB — beda dari RAB (estimate_*) yang
// merupakan rencana JUAL ke klien. `POST /projects/:id/rap` menurunkan
// kuantitas material otomatis dari `estimate_items` versi RAB yang dipilih
// (`apps/api/src/routes/v1/rap.ts:44-199`) — form di sini hanya perlu nama +
// `estimate_version_id` sumbernya, picker dipetik dari daftar RAB Task 19
// (`GET /api/v1/estimate-versions`) lewat dropdown sederhana, bukan endpoint
// baru.
//
// PM punya `cecep:rap:view` DAN `cecep:rap:manage` penuh (diverifikasi
// langsung ke `role_permissions`: keduanya diturunkan dari
// `cecep:estimate:view`/`:manage`, dan `estimate-chain.test.ts:195-196`
// membuktikan PM punya keduanya) — tombol "+ RAP Baru" TIDAK perlu gerbang
// `hasPermission()`, beda dari tombol approve RAB (Task 19) yang butuh
// `cecep:estimate:approve` yang PM tak punya.
// ============================================================================

import { useMemo, useState } from "react";
import Link from "next/link";
import { Wallet, Plus } from "lucide-react";
import { useData, invalidasi } from "@/lib/data-cache";
import { api } from "@/lib/api";
import EmptyState from "@/components/portal/EmptyState";
import KepalaPortal from "@/components/portal/KepalaPortal";
import SkeletonCard from "@/components/portal/SkeletonCard";
import StatusBadge, { type VarianStatus } from "@/components/portal/StatusBadge";
import BottomSheet from "@/components/portal/BottomSheet";
import type { ProyekPM, RapRingkas, RespRabDaftar, GalatApi } from "../../_bersama/tipe";
import { pesanGalat } from "../../_bersama/tipe";

interface RespProyek {
  projects: ProyekPM[];
}
interface RespRapList {
  data: RapRingkas[];
}

const LABEL_STATUS: Record<string, string> = { draft: "Draf", locked: "Terkunci" };
const VARIAN_STATUS: Record<string, VarianStatus> = { draft: "netral", locked: "approved" };

export default function PmRapDaftarPage() {
  const [proyekId, setProyekId] = useState("");
  const [sheetTerbuka, setSheetTerbuka] = useState(false);
  const [nama, setNama] = useState("");
  const [versiId, setVersiId] = useState("");
  const [mengirim, setMengirim] = useState(false);
  const [galatForm, setGalatForm] = useState<string | null>(null);

  const { data: dataProyek } = useData<RespProyek>("/api/v1/projects");
  const daftarProyek = useMemo(() => (dataProyek?.projects ?? []).filter((p) => p.pm), [dataProyek]);
  const proyekAktif = proyekId || daftarProyek[0]?.id || "";

  const url = proyekAktif ? `/api/v1/projects/${proyekAktif}/rap` : null;
  const { data, memuat, galat: galatMuat } = useData<RespRapList>(url);
  const galat = galatMuat ? pesanGalat(galatMuat as GalatApi, "Gagal memuat daftar RAP.") : null;

  // Versi RAB milik proyek aktif — dipakai sebagai picker sumber RAP baru.
  const { data: dataRab } = useData<RespRabDaftar>("/api/v1/estimate-versions?limit=200");
  const versiProyek = useMemo(
    () => (dataRab?.data ?? []).filter((b) => b.project_id === proyekAktif),
    [dataRab, proyekAktif]
  );

  function bukaTambah() {
    setNama("");
    setVersiId("");
    setGalatForm(null);
    setSheetTerbuka(true);
  }

  async function buatRap() {
    if (!proyekAktif || !url) return;
    if (nama.trim().length === 0 || !versiId) {
      setGalatForm("Nama dan RAB sumber wajib dipilih.");
      return;
    }
    setMengirim(true);
    setGalatForm(null);
    try {
      await api.post(`/api/v1/projects/${proyekAktif}/rap`, {
        name: nama.trim(),
        estimate_version_id: versiId,
      });
      setSheetTerbuka(false);
      setNama("");
      setVersiId("");
      invalidasi(url);
    } catch (e) {
      setGalatForm(pesanGalat(e as GalatApi, "Gagal membuat RAP"));
    } finally {
      setMengirim(false);
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--gap-bagian)" }}>
      <KepalaPortal judul="RAP" />

      {daftarProyek.length > 1 && (
        <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <span style={{ fontSize: 12, fontWeight: 600, color: "var(--text-secondary)" }}>Proyek</span>
          <select
            value={proyekAktif}
            onChange={(e) => setProyekId(e.target.value)}
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
            {daftarProyek.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
      )}

      {!proyekAktif && <EmptyState icon={Wallet} judul="Pilih proyek" deskripsi="RAP tercatat per proyek." />}
      {memuat && <SkeletonCard tinggi={100} />}
      {galat && <EmptyState icon={Wallet} judul="Gagal memuat" deskripsi={galat} />}
      {!memuat && !galat && proyekAktif && (data?.data ?? []).length === 0 && (
        <EmptyState icon={Wallet} judul="Belum ada RAP" deskripsi="Buat RAP dari RAB yang sudah tersusun." />
      )}

      {(data?.data ?? []).map((r) => (
        <Link
          key={r.id}
          href={`/pm-portal/cecep/rap/${r.id}`}
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 8,
            padding: "var(--pad-kartu)",
            borderRadius: "var(--portal-radius-card)",
            background: "var(--surface)",
            border: "1px solid var(--border)",
            textDecoration: "none",
          }}
        >
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>{r.name}</div>
            {r.locked_at && (
              <div style={{ fontSize: 11, color: "var(--text-secondary)" }}>
                Terkunci {new Date(r.locked_at).toLocaleDateString("id-ID")}
              </div>
            )}
          </div>
          <StatusBadge status={VARIAN_STATUS[r.status] ?? "netral"} label={LABEL_STATUS[r.status] ?? r.status} />
        </Link>
      ))}

      {proyekAktif && (
        <button
          type="button"
          onClick={bukaTambah}
          style={{
            minHeight: 48,
            borderRadius: "var(--portal-radius-pill)",
            background: "var(--grad-aksen)",
            color: "var(--on-navy)",
            border: "none",
            fontSize: 14,
            fontWeight: 700,
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 8,
          }}
        >
          <Plus size={18} aria-hidden="true" /> RAP Baru
        </button>
      )}

      <BottomSheet terbuka={sheetTerbuka} onTutup={() => setSheetTerbuka(false)} judul="RAP Baru">
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: "var(--text-secondary)" }}>Nama RAP</span>
            <input
              value={nama}
              onChange={(e) => setNama(e.target.value)}
              style={{ minHeight: 44, padding: "0 12px", borderRadius: 12, border: "1px solid var(--border)", fontSize: 14 }}
            />
          </label>
          <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: "var(--text-secondary)" }}>RAB sumber</span>
            <select
              value={versiId}
              onChange={(e) => setVersiId(e.target.value)}
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
              <option value="">Pilih RAB…</option>
              {versiProyek.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.scenario_name ?? "Utama"} · revisi {v.version_number}
                </option>
              ))}
            </select>
          </label>
          {galatForm && (
            <div role="alert" style={{ fontSize: 12, color: "var(--danger)" }}>
              {galatForm}
            </div>
          )}
          <button
            type="button"
            onClick={buatRap}
            disabled={mengirim}
            style={{
              minHeight: 48,
              borderRadius: "var(--portal-radius-pill)",
              background: "var(--grad-aksen)",
              color: "var(--on-navy)",
              border: "none",
              fontSize: 14,
              fontWeight: 700,
              cursor: mengirim ? "wait" : "pointer",
            }}
          >
            {mengirim ? "Menyimpan…" : "Buat RAP"}
          </button>
        </div>
      </BottomSheet>
    </div>
  );
}
