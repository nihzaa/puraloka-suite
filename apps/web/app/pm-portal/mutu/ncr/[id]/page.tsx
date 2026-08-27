"use client";

// ============================================================================
// Detail NCR — SEMUA transisi status dalam satu halaman (bukan BottomSheet
// di atas list; NCR punya alur status non-linear + disposisi + close
// bersyarat yang butuh RUANG sendiri, sama alasan Task 24 menaruh detail
// MR/PO di halaman sendiri).
//
// State galat level-halaman TERPISAH untuk tiga aksi berbeda (pelajaran
// Tahap 2-4): simpan tindakan (PATCH biasa), disposisi (PATCH /disposisi),
// status (PATCH /status) — masing-masing form/tombolnya sendiri, masing-
// masing galatnya sendiri, supaya gagal satu tak menghapus pesan gagal yang
// lain.
//
// Endpoint: GET   /api/v1/projects/:projectId/ncr (lalu cari by id — TIDAK
//                 ADA GET satu-NCR terpisah, diverifikasi ke `ncr.ts`: hanya
//                 list, POST, dan tiga PATCH terdaftar)
//           PATCH /api/v1/ncr/:id             — isi tindakan/akar masalah
//           PATCH /api/v1/ncr/:id/disposisi   — keputusan formal
//           PATCH /api/v1/ncr/:id/status      — transisi status (termasuk close)
//
// ── `proyekId` datang dari query string, BUKAN dimuat ulang dari daftar
// proyek (koreksi wajib Step 4 atas draf awal brief) — `mutu/ncr/page.tsx`
// menautkan ke sini dengan `?proyek=<id>`. Diakses langsung tanpa query
// (mis. bookmark lama) jatuh ke EmptyState yang jelas, bukan N+1 fetch diam-
// diam ke seluruh daftar proyek.
//
// ── SoD "pelapor tak boleh menutup sendiri" DIPERIKSA DUA LAPIS: di sini
// (UI, dari `usePengguna()` — lihat `lib/use-pengguna.ts`) untuk kenyamanan
// (tombol tak terlihat bisa ditekan lalu ditolak), dan di backend
// (`ncr.ts` PATCH `/status`, penegak SEBENARNYA — cek `dilaporkan_oleh ===
// currentUser.id` DAN `hasPermission(request, 'ncr:verify')`). UI di sini
// TIDAK bisa memeriksa `ncr:verify` dari data yang tersedia (tak ada
// endpoint "izin saya" per-halaman) — tombol "Ditutup" tetap ditampilkan
// ke siapa pun yang py `ncr:manage` (rute status), dan backend menolak
// (403) dengan pesan manusiawi bila `ncr:verify` tak dimiliki. Pola sama
// dengan `SheetPutuskanIzin` di `kepatuhan/page.tsx` (Task 28): backend
// sebagai penegak, UI sebagai kenyamanan.
// ============================================================================

import { use, Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ChevronLeft, FileWarning } from "lucide-react";
import { useData } from "@/lib/data-cache";
import { api } from "@/lib/api";
import { usePengguna } from "@/lib/use-pengguna";
import StatusBadge, { type VarianStatus } from "@/components/portal/StatusBadge";
import EmptyState from "@/components/portal/EmptyState";
import SkeletonCard from "@/components/portal/SkeletonCard";
import type { RespNcrDaftar, GalatApi } from "../../../_bersama/tipe";
import { pesanGalat } from "../../../_bersama/tipe";

const TRANSISI_SAH: Record<string, string[]> = {
  terbuka: ["disposisi", "dibatalkan"],
  disposisi: ["perbaikan", "dibatalkan"],
  perbaikan: ["verifikasi", "disposisi"],
  verifikasi: ["ditutup", "perbaikan"],
  ditutup: ["perbaikan"],
  dibatalkan: ["terbuka"],
};

const LABEL_STATUS: Record<string, string> = {
  terbuka: "Terbuka", disposisi: "Disposisi", perbaikan: "Perbaikan",
  verifikasi: "Verifikasi", ditutup: "Ditutup", dibatalkan: "Dibatalkan",
};
const VARIAN_STATUS: Record<string, VarianStatus> = {
  terbuka: "netral", disposisi: "pending", perbaikan: "pending",
  verifikasi: "pending", ditutup: "approved", dibatalkan: "rejected",
};

/**
 * `useSearchParams` (untuk `?proyek=`) memaksa render sisi klien, dan Next
 * menuntut batas Suspense untuknya — tanpa ini `pnpm build` gagal saat
 * prerender. Pola sama `(dashboard)/risiko/page.tsx` dan `/jadwal`.
 */
export default function PmNcrDetailPage({ params }: { params: Promise<{ id: string }> }) {
  return (
    <Suspense fallback={<SkeletonCard tinggi={200} />}>
      <IsiDetailNcr params={params} />
    </Suspense>
  );
}

function IsiDetailNcr({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const searchParams = useSearchParams();
  const proyekId = searchParams.get("proyek");
  const pengguna = usePengguna();

  const [tindakan, setTindakan] = useState("");
  const [akarMasalah, setAkarMasalah] = useState("");
  const [galatTindakan, setGalatTindakan] = useState<string | null>(null);
  const [simpanTindakan, setSimpanTindakan] = useState(false);

  const [disposisiPilih, setDisposisiPilih] = useState<"perbaiki" | "terima" | "bongkar" | "ubah_spek" | "">("");
  const [catatanDisposisi, setCatatanDisposisi] = useState("");
  const [galatDisposisi, setGalatDisposisi] = useState<string | null>(null);
  const [kirimDisposisi, setKirimDisposisi] = useState(false);

  const [alasanBatal, setAlasanBatal] = useState("");
  const [galatStatus, setGalatStatus] = useState<string | null>(null);
  const [kirimStatus, setKirimStatus] = useState(false);

  const urlNcr = proyekId ? `/api/v1/projects/${proyekId}/ncr` : null;
  const { data, memuat, galat, muatUlang } = useData<RespNcrDaftar>(urlNcr);
  const ncr = (data?.data ?? []).find((n) => n.id === id) ?? null;

  async function simpanTindakanPerbaikan() {
    setSimpanTindakan(true); setGalatTindakan(null);
    try {
      await api.patch(`/api/v1/ncr/${id}`, {
        tindakan_perbaikan: tindakan.trim() || undefined,
        akar_masalah: akarMasalah.trim() || undefined,
      });
      await muatUlang();
    } catch (e) {
      setGalatTindakan(pesanGalat(e as GalatApi, "Gagal menyimpan tindakan"));
    } finally { setSimpanTindakan(false); }
  }

  async function kirimKeputusanDisposisi() {
    if (!disposisiPilih) { setGalatDisposisi("Pilih disposisi dulu."); return; }
    if (disposisiPilih === "terima" && catatanDisposisi.trim().length === 0) {
      setGalatDisposisi('Disposisi "terima apa adanya" wajib disertai alasan tertulis.');
      return;
    }
    setKirimDisposisi(true); setGalatDisposisi(null);
    try {
      await api.patch(`/api/v1/ncr/${id}/disposisi`, {
        disposisi: disposisiPilih, catatan: catatanDisposisi.trim() || undefined,
      });
      setDisposisiPilih(""); setCatatanDisposisi("");
      await muatUlang();
    } catch (e) {
      setGalatDisposisi(pesanGalat(e as GalatApi, "Gagal menyimpan disposisi"));
    } finally { setKirimDisposisi(false); }
  }

  async function ubahStatus(status: string) {
    if (status === "dibatalkan" && alasanBatal.trim().length === 0) {
      setGalatStatus("Alasan pembatalan wajib diisi.");
      return;
    }
    setKirimStatus(true); setGalatStatus(null);
    try {
      await api.patch(`/api/v1/ncr/${id}/status`, {
        status, catatan: status === "dibatalkan" ? alasanBatal.trim() : undefined,
      });
      setAlasanBatal("");
      await muatUlang();
    } catch (e) {
      setGalatStatus(pesanGalat(e as GalatApi, "Gagal mengubah status"));
    } finally { setKirimStatus(false); }
  }

  if (!proyekId) {
    return (
      <EmptyState
        icon={FileWarning}
        judul="Tautan NCR tidak lengkap"
        deskripsi="Buka NCR ini dari daftar (Mutu → NCR) supaya proyeknya diketahui."
      />
    );
  }

  if (memuat) return <SkeletonCard tinggi={200} />;
  if (galat || !ncr) {
    return <EmptyState icon={FileWarning} judul="NCR tidak ditemukan" deskripsi={galat ? pesanGalat(galat as GalatApi, "Coba muat ulang.") : "Periksa kembali tautannya."} />;
  }

  const sayaPelapor = !!pengguna && ncr.dilaporkan_oleh === pengguna.id;
  const transisiTersedia = TRANSISI_SAH[ncr.status] ?? [];
  const butuhTindakanSebelumTutup = !ncr.tindakan_perbaikan?.trim() || !ncr.akar_masalah?.trim();

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <button type="button" onClick={() => router.back()} aria-label="Kembali"
        style={{ display: "flex", alignItems: "center", gap: 4, background: "none", border: "none", color: "var(--text-secondary)", fontSize: 13, cursor: "pointer", padding: 0 }}>
        <ChevronLeft size={16} aria-hidden="true" /> Kembali
      </button>

      <div>
        <h1 style={{ fontSize: 18, fontWeight: 700, color: "var(--text-primary)", margin: 0 }}>{ncr.nomor}</h1>
        <div style={{ fontSize: 14, color: "var(--text-primary)", marginTop: 4 }}>{ncr.judul}</div>
        <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
          <StatusBadge status={VARIAN_STATUS[ncr.status] ?? "netral"} label={LABEL_STATUS[ncr.status] ?? ncr.status} />
        </div>
      </div>

      {ncr.deskripsi && (
        <div style={{ fontSize: 13, color: "var(--text-primary)", padding: 12, borderRadius: 12, background: "var(--surface-subtle)" }}>
          {ncr.deskripsi}
        </div>
      )}

      <div style={{ fontSize: 12, color: "var(--text-secondary)", display: "flex", flexDirection: "column", gap: 2 }}>
        {ncr.lokasi && <span>Lokasi: {ncr.lokasi}</span>}
        {ncr.pelapor?.name && <span>Pelapor: {ncr.pelapor.name}</span>}
        {ncr.petugas?.name && <span>Ditugaskan: {ncr.petugas.name}</span>}
        {ncr.target_selesai && <span>Target selesai: {ncr.target_selesai}</span>}
      </div>

      {/* Tindakan perbaikan + akar masalah — WAJIB terisi sebelum bisa
          ditutup (ditegakkan backend `ncr.ts` PATCH `/status`). Selalu bisa
          diedit terlepas dari status, backend tak membatasi PATCH ini ke
          status tertentu. */}
      <section style={{ display: "flex", flexDirection: "column", gap: 10, padding: 14, borderRadius: 14, background: "var(--surface)", border: "1px solid color-mix(in srgb, var(--border) 40%, transparent)", boxShadow: "var(--naik-1)" }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: "var(--text-primary)" }}>Tindakan Perbaikan & Akar Masalah</div>
        <label style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>
          Tindakan perbaikan
          <textarea value={tindakan || ncr.tindakan_perbaikan || ""} onChange={(e) => setTindakan(e.target.value)} rows={3}
            style={{ width: "100%", marginTop: 6, padding: 12, borderRadius: 12, border: "1px solid var(--border)", fontSize: 14, fontFamily: "inherit" }} />
        </label>
        <label style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>
          Akar masalah
          <textarea value={akarMasalah || ncr.akar_masalah || ""} onChange={(e) => setAkarMasalah(e.target.value)} rows={3}
            style={{ width: "100%", marginTop: 6, padding: 12, borderRadius: 12, border: "1px solid var(--border)", fontSize: 14, fontFamily: "inherit" }} />
        </label>
        {galatTindakan && <div role="alert" style={{ fontSize: 12, color: "var(--on-danger-bg)", padding: 10, borderRadius: 10, background: "var(--danger-bg)", border: "1px solid var(--danger-border)" }}>{galatTindakan}</div>}
        <button type="button" onClick={simpanTindakanPerbaikan} disabled={simpanTindakan}
          style={{ minHeight: 44, borderRadius: "var(--portal-radius-pill)", background: "var(--surface-subtle)", border: "1px solid var(--border)", fontSize: 13, fontWeight: 700, color: "var(--text-primary)", cursor: simpanTindakan ? "default" : "pointer" }}>
          {simpanTindakan ? "Menyimpan…" : "Simpan Tindakan"}
        </button>
      </section>

      {/* Disposisi — hanya relevan saat status terbuka/perbaikan (backend
          menerima kapan saja lewat permission, tapi TRANSISI_SAH membatasi
          status HASILNYA — form tetap ditampilkan, backend penegak akhir). */}
      <section style={{ display: "flex", flexDirection: "column", gap: 10, padding: 14, borderRadius: 14, background: "var(--surface)", border: "1px solid color-mix(in srgb, var(--border) 40%, transparent)", boxShadow: "var(--naik-1)" }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: "var(--text-primary)" }}>Disposisi</div>
        {ncr.disposisi && (
          <div style={{ fontSize: 13, color: "var(--text-secondary)" }}>
            Keputusan saat ini: <strong>{ncr.disposisi}</strong>{ncr.disposisi_catatan ? ` — ${ncr.disposisi_catatan}` : ""}
          </div>
        )}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
          {(["perbaiki", "terima", "bongkar", "ubah_spek"] as const).map((d) => (
            <button key={d} type="button" onClick={() => setDisposisiPilih(d)}
              style={disposisiPilih === d ? {
                minHeight: 44, borderRadius: 12, background: "var(--grad-aksen)", color: "var(--on-navy)",
                border: "none", fontSize: 13, fontWeight: 700, cursor: "pointer",
              } : {
                minHeight: 44, borderRadius: 12, background: "var(--surface-subtle)", color: "var(--text-primary)",
                border: "1px solid var(--border)", fontSize: 13, fontWeight: 600, cursor: "pointer",
              }}>
              {d === "perbaiki" ? "Perbaiki" : d === "terima" ? "Terima Apa Adanya" : d === "bongkar" ? "Bongkar" : "Ubah Spesifikasi"}
            </button>
          ))}
        </div>
        {disposisiPilih === "terima" && (
          <label style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>
            Alasan (wajib untuk &quot;terima apa adanya&quot;)
            <textarea value={catatanDisposisi} onChange={(e) => setCatatanDisposisi(e.target.value)} rows={2}
              style={{ width: "100%", marginTop: 6, padding: 12, borderRadius: 12, border: "1px solid var(--border)", fontSize: 14, fontFamily: "inherit" }} />
          </label>
        )}
        {galatDisposisi && <div role="alert" style={{ fontSize: 12, color: "var(--on-danger-bg)", padding: 10, borderRadius: 10, background: "var(--danger-bg)", border: "1px solid var(--danger-border)" }}>{galatDisposisi}</div>}
        <button type="button" onClick={kirimKeputusanDisposisi} disabled={kirimDisposisi || !disposisiPilih}
          style={{ minHeight: 44, borderRadius: "var(--portal-radius-pill)", background: "var(--grad-aksen)", color: "var(--on-navy)", border: "none", fontSize: 13, fontWeight: 700, cursor: (kirimDisposisi || !disposisiPilih) ? "default" : "pointer", opacity: !disposisiPilih ? 0.5 : 1 }}>
          {kirimDisposisi ? "Mengirim…" : "Kirim Disposisi"}
        </button>
      </section>

      {/* Transisi status — termasuk TUTUP dengan gerbang SoD. */}
      <section style={{ display: "flex", flexDirection: "column", gap: 10, padding: 14, borderRadius: 14, background: "var(--surface)", border: "1px solid color-mix(in srgb, var(--border) 40%, transparent)", boxShadow: "var(--naik-1)" }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: "var(--text-primary)" }}>Ubah Status</div>
        {transisiTersedia.length === 0 && (
          <div style={{ fontSize: 13, color: "var(--text-secondary)" }}>Tidak ada transisi tersedia dari status ini.</div>
        )}
        {transisiTersedia.includes("ditutup") && sayaPelapor && (
          <div style={{ fontSize: 12, color: "var(--on-warning-bg)", padding: 10, borderRadius: 10, background: "var(--warning-bg)", border: "1px solid var(--warning-border)" }}>
            Anda pelapor NCR ini — pelapor tidak boleh menutup temuannya sendiri (pemisahan tugas).
          </div>
        )}
        {transisiTersedia.includes("ditutup") && butuhTindakanSebelumTutup && (
          <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>
            Isi dulu tindakan perbaikan &amp; akar masalah di atas sebelum bisa ditutup.
          </div>
        )}
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {transisiTersedia.map((s) => {
            const nonaktif = s === "ditutup" && (sayaPelapor || butuhTindakanSebelumTutup);
            return (
              <button key={s} type="button" onClick={() => ubahStatus(s)} disabled={kirimStatus || nonaktif}
                style={nonaktif ? {
                  minHeight: 44, borderRadius: "var(--portal-radius-pill)", background: "var(--surface-subtle)",
                  color: "var(--text-muted)", border: "1px solid var(--border)", fontSize: 13, fontWeight: 700, cursor: "default",
                } : {
                  minHeight: 44, borderRadius: "var(--portal-radius-pill)", background: s === "ditutup" ? "var(--grad-aksen)" : "var(--surface-subtle)",
                  color: s === "ditutup" ? "var(--on-navy)" : "var(--text-primary)",
                  border: s === "ditutup" ? "none" : "1px solid var(--border)", fontSize: 13, fontWeight: 700, cursor: kirimStatus ? "default" : "pointer",
                }}>
                {LABEL_STATUS[s] ?? s}
              </button>
            );
          })}
        </div>
        {transisiTersedia.includes("dibatalkan") && (
          <label style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>
            Alasan pembatalan (wajib bila membatalkan)
            <textarea value={alasanBatal} onChange={(e) => setAlasanBatal(e.target.value)} rows={2}
              style={{ width: "100%", marginTop: 6, padding: 12, borderRadius: 12, border: "1px solid var(--border)", fontSize: 14, fontFamily: "inherit" }} />
          </label>
        )}
        {galatStatus && <div role="alert" style={{ fontSize: 12, color: "var(--on-danger-bg)", padding: 10, borderRadius: 10, background: "var(--danger-bg)", border: "1px solid var(--danger-border)" }}>{galatStatus}</div>}
      </section>
    </div>
  );
}
