"use client";

// ============================================================================
// Contingency — cadangan risiko lintas-proyek (Tahap 3, Task 21).
//
// Pemilih proyek, kartu ringkas per pos (pagu awal/terpakai/sisa — sisa
// NEGATIF ditampilkan sebagai angka negatif eksplisit, bukan diratakan nol),
// tombol tarik cadangan.
//
// ── Bentuk backend dikoreksi Task 21 dari dugaan brief
//
// Brief menebak SATU objek ringkas per proyek `{ project_id; pagu_awal;
// terpakai; sisa; penggunaan: [...] }`. Dibaca baris-per-baris ke
// `lib/contingency.ts` (`PosTerhitung`/`HasilContingency`) + rute
// `contingency.ts`:
//  - Satu proyek bisa punya BEBERAPA pos cadangan bernama (mis. "Risiko
//    cuaca", "Eskalasi harga material") — bukan satu angka gabungan.
//    Endpoint memulangkan DAFTAR pos, bukan objek tunggal.
//  - Field asli `nilai` (BUKAN `pagu_awal`), status TURUNAN
//    `aman|menipis|kritis|terlampaui|ditutup` (dihitung server dari ambang
//    60%/90%, bukan disimpan) — ditampilkan sebagai badge, bukan dihitung
//    ulang di klien.
//  - `sisa` bisa NEGATIF (tidak di-floor ke 0) — "terlampaui" adalah
//    keadaan nyata yang harus terlihat, bukan disembunyikan sebagai 0.
//  - Endpoint LIST tidak memulangkan daftar penggunaan mentah per baris
//    (tanggal/alasan/CO sumber) — hanya ringkasan teragregasi per pos
//    (`jumlah_penarikan`, `penarikan_terakhir`). Halaman ini karena itu
//    menampilkan ringkasan itu, bukan riwayat baris-demi-baris (yang butuh
//    endpoint tersendiri, di luar scope Task 21).
//  - Tombol "Tarik Cadangan" dan pemilihan CO sumber mengikuti pola
//    `components/contingency-tarik-modal.tsx` (desktop, sudah ada &
//    terverifikasi) — form disederhanakan versi mobile: nilai, alasan
//    (wajib), CO sumber opsional dari `GET /contingency/co-sumber`.
//  - Gerbang GET `projects:view`, POST pos & POST penarikan
//    `projects:contract` — PM PUNYA keduanya (diverifikasi live
//    2026-08-21).
// ============================================================================

import { useEffect, useMemo, useState } from "react";
import { ShieldAlert, Wallet, Plus } from "lucide-react";
import { useData, invalidasi } from "@/lib/data-cache";
import { api } from "@/lib/api";
import EmptyState from "@/components/portal/EmptyState";
import KepalaPortal from "@/components/portal/KepalaPortal";
import SkeletonCard from "@/components/portal/SkeletonCard";
import StatusBadge, { type VarianStatus } from "@/components/portal/StatusBadge";
import BottomSheet from "@/components/portal/BottomSheet";
import type {
  ProyekPM,
  RespContingency,
  PosContingency,
  RespCoSumberContingency,
  GalatApi,
} from "../../_bersama/tipe";
import { pesanGalat } from "../../_bersama/tipe";
import { Pilihan } from "@/components/pilihan";

interface RespProyek {
  projects: ProyekPM[];
}

const LABEL_STATUS: Record<string, string> = {
  aman: "Aman",
  menipis: "Menipis",
  kritis: "Kritis",
  terlampaui: "Terlampaui",
  ditutup: "Ditutup",
};
const VARIAN_STATUS: Record<string, VarianStatus> = {
  aman: "approved",
  menipis: "pending",
  kritis: "pending",
  terlampaui: "rejected",
  ditutup: "netral",
};

function fmtRupiah(v: number | string | null | undefined): string {
  if (v === null || v === undefined) return "—";
  const n = typeof v === "string" ? Number(v) : v;
  if (!Number.isFinite(n)) return "—";
  return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(n);
}
function fmtTanggal(s: string | null): string {
  if (!s) return "—";
  return new Date(s).toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric" });
}

export default function PmContingencyPage() {
  const [proyekId, setProyekId] = useState("");

  const [sheetBaruTerbuka, setSheetBaruTerbuka] = useState(false);
  const [namaBaru, setNamaBaru] = useState("");
  const [nilaiBaru, setNilaiBaru] = useState("");
  const [mengirimBaru, setMengirimBaru] = useState(false);
  const [galatBaru, setGalatBaru] = useState<string | null>(null);

  const [posTarik, setPosTarik] = useState<PosContingency | null>(null);
  const [nilaiTarik, setNilaiTarik] = useState("");
  const [alasanTarik, setAlasanTarik] = useState("");
  const [coIdTarik, setCoIdTarik] = useState("");
  const [coSumber, setCoSumber] = useState<RespCoSumberContingency | null>(null);
  const [mengirimTarik, setMengirimTarik] = useState(false);
  const [galatTarik, setGalatTarik] = useState<string | null>(null);

  const { data: dataProyek } = useData<RespProyek>("/api/v1/projects");
  const daftarProyek = useMemo(() => (dataProyek?.projects ?? []).filter((p) => p.pm), [dataProyek]);
  const proyekAktif = proyekId || daftarProyek[0]?.id || "";

  const url = proyekAktif ? `/api/v1/contingency?project_id=${proyekAktif}` : null;
  const { data, memuat, galat: galatMuat } = useData<RespContingency>(url);
  const galat = galatMuat ? pesanGalat(galatMuat as GalatApi, "Gagal memuat contingency.") : null;

  useEffect(() => {
    if (!posTarik) { setCoSumber(null); return; }
    let hidup = true;
    api
      .get<RespCoSumberContingency>(`/api/v1/contingency/co-sumber?project_id=${posTarik.project_id}`)
      .then(({ data: resp }) => { if (hidup) setCoSumber(resp); })
      .catch(() => { if (hidup) setCoSumber(null); });
    return () => { hidup = false; };
  }, [posTarik]);

  function bukaBaru() {
    setNamaBaru("");
    setNilaiBaru("");
    setGalatBaru(null);
    setSheetBaruTerbuka(true);
  }

  async function buatPos() {
    if (!proyekAktif || !url) return;
    if (namaBaru.trim().length === 0) {
      setGalatBaru("Nama pos wajib diisi.");
      return;
    }
    if (!nilaiBaru || Number(nilaiBaru) <= 0) {
      setGalatBaru("Nilai cadangan harus lebih dari 0.");
      return;
    }
    setMengirimBaru(true);
    setGalatBaru(null);
    try {
      await api.post("/api/v1/contingency", {
        project_id: proyekAktif,
        nama: namaBaru.trim(),
        nilai: Number(nilaiBaru),
      });
      setSheetBaruTerbuka(false);
      invalidasi(url);
    } catch (e) {
      setGalatBaru(pesanGalat(e as GalatApi, "Gagal membuat pos cadangan"));
    } finally {
      setMengirimBaru(false);
    }
  }

  function bukaTarik(p: PosContingency) {
    setPosTarik(p);
    setNilaiTarik("");
    setAlasanTarik("");
    setCoIdTarik("");
    setGalatTarik(null);
  }

  async function kirimTarik() {
    if (!posTarik || !url) return;
    if (!nilaiTarik || Number(nilaiTarik) <= 0) {
      setGalatTarik("Nilai penarikan harus lebih dari 0.");
      return;
    }
    if (alasanTarik.trim().length === 0) {
      setGalatTarik("Alasan penarikan wajib diisi.");
      return;
    }
    setMengirimTarik(true);
    setGalatTarik(null);
    try {
      await api.post(`/api/v1/contingency/${posTarik.id}/penggunaan`, {
        nilai: Number(nilaiTarik),
        alasan: alasanTarik.trim(),
        ...(coIdTarik ? { sumber_change_order_id: coIdTarik } : {}),
      });
      setPosTarik(null);
      invalidasi(url);
    } catch (e) {
      setGalatTarik(pesanGalat(e as GalatApi, "Gagal mencatat penarikan"));
    } finally {
      setMengirimTarik(false);
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--gap-bagian)" }}>
      <KepalaPortal judul="Contingency" />

      {daftarProyek.length > 1 && (
        <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <span style={{ fontSize: 12, fontWeight: 600, color: "var(--text-secondary)" }}>Proyek</span>
          <Pilihan
            value={proyekAktif}
            onChange={(e) => setProyekId(e.target.value)}
            style={{ minHeight: 44, padding: "0 12px", borderRadius: 12, border: "1px solid var(--border)", fontSize: 14, background: "var(--surface)", color: "var(--text-primary)" }}
          >
            {daftarProyek.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </Pilihan>
        </label>
      )}

      {!proyekAktif && <EmptyState icon={ShieldAlert} judul="Pilih proyek" deskripsi="Cadangan risiko dicatat per proyek." />}
      {memuat && <SkeletonCard tinggi={140} />}
      {galat && <EmptyState icon={ShieldAlert} judul="Gagal memuat" deskripsi={galat} />}

      {!memuat && !galat && data && (
        <>
          <div
            style={{
              padding: "var(--pad-kartu)",
              borderRadius: "var(--portal-radius-card)",
              background: "var(--surface)",
              border: "1px solid var(--border)",
              display: "flex",
              flexDirection: "column",
              gap: 6,
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span style={{ fontSize: 12, color: "var(--text-secondary)" }}>Total cadangan</span>
              <span style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>{fmtRupiah(data.total_cadangan)}</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span style={{ fontSize: 12, color: "var(--text-secondary)" }}>Total terpakai</span>
              <span style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>{fmtRupiah(data.total_terpakai)}</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", paddingTop: 6, borderTop: "1px solid var(--border)" }}>
              <span style={{ fontSize: 13, fontWeight: 700, color: "var(--text-primary)" }}>Total sisa</span>
              <span style={{ fontSize: 16, fontWeight: 700, color: data.total_sisa < 0 ? "var(--danger)" : "var(--navy)" }}>
                {fmtRupiah(data.total_sisa)}
              </span>
            </div>
          </div>

          {data.pos.length === 0 && (
            <EmptyState icon={ShieldAlert} judul="Belum ada pos cadangan" deskripsi="Proyek ini belum punya cadangan risiko tercatat." />
          )}

          {data.pos.map((p) => (
            <div
              key={p.id}
              style={{
                padding: "var(--pad-kartu-lega)",
                borderRadius: 16,
                background: "var(--surface)",
                border: "1px solid var(--border)",
                display: "flex",
                flexDirection: "column",
                gap: 10,
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: "var(--text-primary)" }}>{p.nama}</div>
                <StatusBadge status={VARIAN_STATUS[p.status] ?? "netral"} label={LABEL_STATUS[p.status] ?? p.status} />
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 6, fontSize: 12 }}>
                <div>
                  <div style={{ color: "var(--text-secondary)" }}>Pagu awal</div>
                  <div style={{ fontWeight: 600, color: "var(--text-primary)" }}>{fmtRupiah(p.nilai)}</div>
                </div>
                <div>
                  <div style={{ color: "var(--text-secondary)" }}>Terpakai</div>
                  <div style={{ fontWeight: 600, color: "var(--text-primary)" }}>{fmtRupiah(p.terpakai)}</div>
                </div>
                <div>
                  <div style={{ color: "var(--text-secondary)" }}>Sisa</div>
                  <div style={{ fontWeight: 700, color: p.sisa < 0 ? "var(--danger)" : "var(--text-primary)" }}>{fmtRupiah(p.sisa)}</div>
                </div>
              </div>

              <div style={{ fontSize: 11, color: "var(--text-secondary)" }}>
                {p.jumlah_penarikan} penarikan
                {p.penarikan_terakhir && ` · terakhir ${fmtTanggal(p.penarikan_terakhir)}`}
                {p.porsi_kontrak_pct !== null && ` · ${p.porsi_kontrak_pct.toFixed(1)}% dari nilai kontrak`}
              </div>

              {p.status !== "ditutup" && (
                <button
                  type="button"
                  onClick={() => bukaTarik(p)}
                  style={{ minHeight: 36, padding: "0 12px", borderRadius: "var(--portal-radius-pill)", background: "var(--surface-subtle)", color: "var(--text-primary)", border: "1px solid var(--border)", fontSize: 12, fontWeight: 600, cursor: "pointer", alignSelf: "flex-start", display: "flex", alignItems: "center", gap: 6 }}
                >
                  <Wallet size={13} aria-hidden="true" /> Tarik Cadangan
                </button>
              )}
            </div>
          ))}

          {data.proyek_tanpa_pos.length > 0 && (
            <div style={{ fontSize: 11, color: "var(--text-secondary)", padding: "8px 0" }}>
              {data.proyek_tanpa_pos.length} proyek belum punya pos cadangan.
            </div>
          )}
        </>
      )}

      {proyekAktif && (
        <button
          type="button"
          onClick={bukaBaru}
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
          <Plus size={18} aria-hidden="true" /> Pos Cadangan Baru
        </button>
      )}

      <BottomSheet terbuka={sheetBaruTerbuka} onTutup={() => setSheetBaruTerbuka(false)} judul="Pos Cadangan Baru">
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: "var(--text-secondary)" }}>Nama pos</span>
            <input
              value={namaBaru}
              onChange={(e) => setNamaBaru(e.target.value)}
              placeholder="mis. Risiko cuaca"
              style={{ minHeight: 44, padding: "0 12px", borderRadius: 12, border: "1px solid var(--border)", fontSize: 14 }}
            />
          </label>
          <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: "var(--text-secondary)" }}>Nilai cadangan (Rp)</span>
            <input
              type="number"
              value={nilaiBaru}
              onChange={(e) => setNilaiBaru(e.target.value)}
              style={{ minHeight: 44, padding: "0 12px", borderRadius: 12, border: "1px solid var(--border)", fontSize: 14 }}
            />
          </label>
          {galatBaru && (
            <div role="alert" style={{ fontSize: 12, color: "var(--danger)" }}>
              {galatBaru}
            </div>
          )}
          <button
            type="button"
            onClick={buatPos}
            disabled={mengirimBaru}
            style={{ minHeight: 48, borderRadius: "var(--portal-radius-pill)", background: "var(--grad-aksen)", color: "var(--on-navy)", border: "none", fontSize: 14, fontWeight: 700, cursor: mengirimBaru ? "wait" : "pointer" }}
          >
            {mengirimBaru ? "Menyimpan…" : "Buat Pos"}
          </button>
        </div>
      </BottomSheet>

      <BottomSheet terbuka={!!posTarik} onTutup={() => setPosTarik(null)} judul={`Tarik — ${posTarik?.nama ?? ""}`}>
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <p style={{ fontSize: 12, color: "var(--text-secondary)", margin: 0 }}>
            Sisa saat ini {fmtRupiah(posTarik?.sisa)}. Tiap penarikan mengurangi sisa dan tercatat beserta alasannya.
          </p>
          <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: "var(--text-secondary)" }}>Nilai penarikan (Rp)</span>
            <input
              type="number"
              value={nilaiTarik}
              onChange={(e) => setNilaiTarik(e.target.value)}
              style={{ minHeight: 44, padding: "0 12px", borderRadius: 12, border: "1px solid var(--border)", fontSize: 14 }}
            />
            {posTarik && Number(nilaiTarik) > posTarik.sisa && (
              <span role="status" style={{ fontSize: 11, color: "var(--on-warning-bg)" }}>
                Melebihi sisa {fmtRupiah(posTarik.sisa)} — pos akan berstatus Terlampaui. Tetap bisa dicatat.
              </span>
            )}
          </label>
          <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: "var(--text-secondary)" }}>Alasan</span>
            <input
              value={alasanTarik}
              onChange={(e) => setAlasanTarik(e.target.value)}
              placeholder="mis. penyesuaian pekerjaan galian batu"
              style={{ minHeight: 44, padding: "0 12px", borderRadius: 12, border: "1px solid var(--border)", fontSize: 14 }}
            />
          </label>
          <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: "var(--text-secondary)" }}>Dasar change order (opsional)</span>
            <Pilihan
              value={coIdTarik}
              onChange={(e) => setCoIdTarik(e.target.value)}
              disabled={!coSumber || coSumber.layak.length === 0}
              style={{ minHeight: 44, padding: "0 12px", borderRadius: 12, border: "1px solid var(--border)", fontSize: 14, background: "var(--surface)", color: "var(--text-primary)" }}
            >
              <option value="">— tanpa dasar CO —</option>
              {(coSumber?.layak ?? []).map((c) => (
                <option key={c.id} value={c.id}>
                  {c.co_number}{c.judul ? ` · ${c.judul}` : ""}
                </option>
              ))}
            </Pilihan>
            <span style={{ fontSize: 11, color: "var(--text-secondary)" }}>
              {!coSumber
                ? "Memuat change order…"
                : coSumber.layak.length === 0
                  ? "Belum ada change order yang bisa jadi dasar."
                  : `${coSumber.layak.length} dari ${coSumber.jumlah_co} CO bisa jadi dasar.`}
            </span>
          </label>
          {galatTarik && (
            <div role="alert" style={{ fontSize: 12, color: "var(--danger)" }}>
              {galatTarik}
            </div>
          )}
          <button
            type="button"
            onClick={kirimTarik}
            disabled={mengirimTarik}
            style={{ minHeight: 48, borderRadius: "var(--portal-radius-pill)", background: "var(--grad-aksen)", color: "var(--on-navy)", border: "none", fontSize: 14, fontWeight: 700, cursor: mengirimTarik ? "wait" : "pointer" }}
          >
            {mengirimTarik ? "Mencatat…" : "Catat Penarikan"}
          </button>
        </div>
      </BottomSheet>
    </div>
  );
}
