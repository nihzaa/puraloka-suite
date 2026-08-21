"use client";

// ============================================================================
// Detail Rencana Mutu Proyek + ITP.
//
// Dibuka dengan VERDICT (pola desktop `(dashboard)/mutu/rencana/page.tsx`,
// Task 27 Step 1): "boleh lanjut, atau ada yang menahan?" — bukan tabel.
// `ringkasan.boleh_lanjut === null` berarti ITP KOSONG, bukan "boleh" —
// dirender sebagai keadaan NETRAL terpisah, tidak disamakan dengan `true`.
//
// PM BISA: tambah titik ITP, isi hasil periksa, mengajukan (`ncr:manage`).
// PM TIDAK BISA: menyetujui (`mutu:rmp:approve` — diverifikasi LIVE Task 30
// Step 8: nol baris untuk pm) — tombol itu TIDAK ADA di halaman ini, lihat
// komentar `mutu/rencana/page.tsx`.
//
// `menahan`/`menunggu_saksi` dari `ringkasan` (bentuk PERSIS `ringkasItp()`)
// ditampilkan sebagai daftar EKSPLISIT titik yang menahan — bukan cuma
// angka `ringkasan.gagal`, karena titik yang MENAHAN adalah gabungan HOLD
// yang `null` (belum diperiksa) DAN `false` (ditolak), keduanya berbeda
// makna dari `gagal` saja.
//
// Endpoint: GET  /api/v1/rencana-mutu/:id
//           POST /api/v1/rencana-mutu/:id/titik
//           PATCH /api/v1/itp-titik/:id
//           POST /api/v1/rencana-mutu/:id/ajukan
// ============================================================================

import { use, Suspense, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { ChevronLeft, CircleHelp, CircleCheck, CircleX, BadgeCheck } from "lucide-react";
import { useData } from "@/lib/data-cache";
import { api } from "@/lib/api";
import BottomSheet from "@/components/portal/BottomSheet";
import StatusBadge from "@/components/portal/StatusBadge";
import EmptyState from "@/components/portal/EmptyState";
import SkeletonCard from "@/components/portal/SkeletonCard";
import type { RespRencanaMutuSatu, TitikItp, GalatApi } from "../../../_bersama/tipe";
import { pesanGalat } from "../../../_bersama/tipe";

const LABEL_JENIS_TITIK: Record<string, string> = { hold: "HOLD (menahan)", witness: "Witness", review: "Review" };

/**
 * `useSearchParams` memaksa render sisi klien, Next menuntut batas Suspense
 * untuknya — tanpa ini `pnpm build` gagal saat prerender (pelajaran Task 29,
 * pola sama `mutu/ncr/[id]/page.tsx`).
 */
export default function PmRencanaMutuDetailPage({ params }: { params: Promise<{ id: string }> }) {
  return (
    <Suspense fallback={<SkeletonCard tinggi={200} />}>
      <IsiDetailRencanaMutu params={params} />
    </Suspense>
  );
}

function IsiDetailRencanaMutu({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  // `proyek` dari query TIDAK dipakai untuk fetch (endpoint detail RMP
  // tak butuh project_id, tenancy dijamin server lewat projectIds()) —
  // dibaca hanya supaya tautan "Kembali" konsisten dengan pola NCR bila
  // dibutuhkan navigasi lanjutan nanti. `useSearchParams()` tetap dipanggil
  // supaya kontrak Suspense di atas benar-benar dibutuhkan (bukan hiasan).
  useSearchParams();

  const [sheetTambahTitik, setSheetTambahTitik] = useState(false);
  const [titikPeriksa, setTitikPeriksa] = useState<TitikItp | null>(null);
  const [galatAjukan, setGalatAjukan] = useState<string | null>(null);
  const [kirimAjukan, setKirimAjukan] = useState(false);

  const { data, memuat, galat, muatUlang } = useData<RespRencanaMutuSatu>(`/api/v1/rencana-mutu/${id}`);

  async function ajukan() {
    setKirimAjukan(true); setGalatAjukan(null);
    try {
      await api.post(`/api/v1/rencana-mutu/${id}/ajukan`);
      await muatUlang();
    } catch (e) {
      setGalatAjukan(pesanGalat(e as GalatApi, "Gagal mengajukan rencana mutu"));
    } finally { setKirimAjukan(false); }
  }

  if (memuat) return <SkeletonCard tinggi={200} />;
  if (galat || !data) {
    return <EmptyState icon={BadgeCheck} judul="Rencana mutu tidak ditemukan" deskripsi={galat ? pesanGalat(galat as GalatApi, "Coba muat ulang.") : "Periksa kembali tautannya."} />;
  }

  const { rencana, titik, ringkasan } = data;
  const VerdictIcon = ringkasan.boleh_lanjut === null ? CircleHelp : ringkasan.boleh_lanjut ? CircleCheck : CircleX;
  const verdictWarna = ringkasan.boleh_lanjut === null ? "var(--text-secondary)" : ringkasan.boleh_lanjut ? "var(--success)" : "var(--danger)";
  const verdictTeks = ringkasan.boleh_lanjut === null ? "ITP belum punya titik — belum menyatakan apa pun"
    : ringkasan.boleh_lanjut ? "Boleh lanjut" : "Ada yang menahan pekerjaan";

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <button type="button" onClick={() => router.back()} aria-label="Kembali"
        style={{ display: "flex", alignItems: "center", gap: 4, background: "none", border: "none", color: "var(--text-secondary)", fontSize: 13, cursor: "pointer", padding: 0 }}>
        <ChevronLeft size={16} aria-hidden="true" /> Kembali
      </button>

      <div>
        <h1 style={{ fontSize: 18, fontWeight: 700, color: "var(--text-primary)", margin: 0 }}>{rencana.nomor}</h1>
        <div style={{ fontSize: 14, color: "var(--text-primary)" }}>{rencana.judul} · Rev.{rencana.revisi}</div>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: 16, borderRadius: 16, background: "var(--surface)", border: `1px solid ${verdictWarna}` }}>
        <VerdictIcon size={28} color={verdictWarna} aria-hidden="true" />
        <div>
          <div style={{ fontSize: 15, fontWeight: 800, color: verdictWarna }}>{verdictTeks}</div>
          <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>{ringkasan.lolos} lolos · {ringkasan.gagal} gagal · {ringkasan.belum} belum diperiksa dari {ringkasan.total} titik</div>
        </div>
      </div>

      {ringkasan.menahan.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8, padding: 14, borderRadius: 14, background: "var(--danger-bg)", border: "1px solid var(--danger-border)" }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: "var(--on-danger-bg)" }}>Titik HOLD yang menahan pekerjaan</div>
          {ringkasan.menahan.map((t) => (
            <div key={t.id} style={{ fontSize: 13, color: "var(--on-danger-bg)" }}>
              • {t.tahap_pekerjaan} {t.lolos === false ? "— ditolak" : "— belum diperiksa"}
            </div>
          ))}
        </div>
      )}
      {ringkasan.menunggu_saksi.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8, padding: 14, borderRadius: 14, background: "var(--warning-bg)", border: "1px solid var(--warning-border)" }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: "var(--on-warning-bg)" }}>Titik Witness menunggu saksi (tidak menahan)</div>
          {ringkasan.menunggu_saksi.map((t) => (
            <div key={t.id} style={{ fontSize: 13, color: "var(--on-warning-bg)" }}>• {t.tahap_pekerjaan}</div>
          ))}
        </div>
      )}

      {rencana.status === "draf" && (
        <>
          {galatAjukan && <div role="alert" style={{ fontSize: 12, color: "var(--on-danger-bg)", padding: 10, borderRadius: 10, background: "var(--danger-bg)", border: "1px solid var(--danger-border)" }}>{galatAjukan}</div>}
          <button type="button" onClick={ajukan} disabled={kirimAjukan}
            style={{ minHeight: 48, borderRadius: "var(--portal-radius-pill)", background: "var(--grad-aksen)", color: "var(--on-navy)", border: "none", fontSize: 14, fontWeight: 700, cursor: kirimAjukan ? "default" : "pointer" }}>
            {kirimAjukan ? "Mengajukan…" : "Ajukan untuk Disetujui"}
          </button>
        </>
      )}
      {rencana.status === "diajukan" && (
        <div style={{ fontSize: 13, color: "var(--text-secondary)", padding: 12, borderRadius: 12, background: "var(--surface-subtle)" }}>
          Menunggu persetujuan QA/Direktur — lihat status di tab Approval.
        </div>
      )}

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: "var(--text-primary)" }}>Titik Inspection & Test Plan</div>
        {rencana.status === "draf" && (
          <button type="button" onClick={() => setSheetTambahTitik(true)} aria-label="Tambah titik ITP"
            style={{ minHeight: 36, padding: "0 12px", borderRadius: "var(--portal-radius-pill)", background: "var(--surface-subtle)", border: "1px solid var(--border)", fontSize: 12, fontWeight: 700, color: "var(--text-primary)", cursor: "pointer" }}>
            + Titik
          </button>
        )}
      </div>

      {titik.length === 0 && <EmptyState icon={BadgeCheck} judul="Belum ada titik ITP" deskripsi="Titik pemeriksaan wajib (hold/witness/review) akan muncul di sini." />}
      {titik.map((t) => (
        <button key={t.id} type="button" onClick={() => setTitikPeriksa(t)}
          style={{ textAlign: "left", padding: 14, borderRadius: 14, background: "var(--surface)", border: "1px solid var(--border)", display: "flex", flexDirection: "column", gap: 6, cursor: "pointer" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
            <div>
              <span style={{ fontSize: 14, fontWeight: 700, color: "var(--text-primary)" }}>{t.tahap_pekerjaan}</span>
              <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>{t.uraian}</div>
            </div>
            <StatusBadge status={t.jenis_titik === "hold" ? "rejected" : "info"} label={LABEL_JENIS_TITIK[t.jenis_titik]} />
          </div>
          <StatusBadge
            status={t.lolos === null ? "netral" : t.lolos ? "approved" : "rejected"}
            label={t.lolos === null ? "Belum Diperiksa" : t.lolos ? "Lolos" : "Tidak Lolos"}
          />
        </button>
      ))}

      <SheetTambahTitik terbuka={sheetTambahTitik} onTutup={() => setSheetTambahTitik(false)} rmpId={id} onSelesai={() => void muatUlang()} />
      <BottomSheet terbuka={!!titikPeriksa} onTutup={() => setTitikPeriksa(null)} judul="Hasil Pemeriksaan Titik">
        {titikPeriksa && <SheetHasilTitik titik={titikPeriksa} onSelesai={() => { setTitikPeriksa(null); void muatUlang(); }} />}
      </BottomSheet>
    </div>
  );
}

function SheetTambahTitik({ terbuka, onTutup, rmpId, onSelesai }: { terbuka: boolean; onTutup: () => void; rmpId: string; onSelesai: () => void }) {
  const [tahapPekerjaan, setTahapPekerjaan] = useState("");
  const [uraian, setUraian] = useState("");
  const [jenisTitik, setJenisTitik] = useState<"hold" | "witness" | "review" | "">("");
  const [kriteria, setKriteria] = useState("");
  const [mengirim, setMengirim] = useState(false);
  const [galat, setGalat] = useState<string | null>(null);

  async function simpan() {
    if (!tahapPekerjaan.trim() || !uraian.trim() || !jenisTitik) {
      setGalat("Tahap pekerjaan, uraian, dan jenis titik wajib diisi.");
      return;
    }
    setMengirim(true); setGalat(null);
    try {
      await api.post(`/api/v1/rencana-mutu/${rmpId}/titik`, {
        tahap_pekerjaan: tahapPekerjaan.trim(), uraian: uraian.trim(),
        jenis_titik: jenisTitik, kriteria: kriteria.trim() || undefined,
      });
      setTahapPekerjaan(""); setUraian(""); setJenisTitik(""); setKriteria("");
      onSelesai(); onTutup();
    } catch (e) {
      setGalat(pesanGalat(e as GalatApi, "Gagal menambah titik ITP"));
    } finally { setMengirim(false); }
  }

  return (
    <BottomSheet terbuka={terbuka} onTutup={onTutup} judul="Tambah Titik ITP">
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <label style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>
          Tahap pekerjaan
          <input value={tahapPekerjaan} onChange={(e) => setTahapPekerjaan(e.target.value)}
            style={{ width: "100%", marginTop: 6, minHeight: 44, padding: "0 12px", borderRadius: 12, border: "1px solid var(--border)", fontSize: 14 }} />
        </label>
        <label style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>
          Uraian
          <textarea value={uraian} onChange={(e) => setUraian(e.target.value)} rows={2}
            style={{ width: "100%", marginTop: 6, padding: 12, borderRadius: 12, border: "1px solid var(--border)", fontSize: 14, fontFamily: "inherit" }} />
        </label>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>Jenis titik</span>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
            {(["hold", "witness", "review"] as const).map((j) => (
              <button key={j} type="button" onClick={() => setJenisTitik(j)}
                style={jenisTitik === j ? {
                  minHeight: 40, borderRadius: 10, background: "var(--grad-aksen)", color: "var(--on-navy)",
                  border: "none", fontSize: 12, fontWeight: 700, cursor: "pointer",
                } : {
                  minHeight: 40, borderRadius: 10, background: "var(--surface-subtle)", color: "var(--text-primary)",
                  border: "1px solid var(--border)", fontSize: 12, fontWeight: 600, cursor: "pointer",
                }}>
                {LABEL_JENIS_TITIK[j]}
              </button>
            ))}
          </div>
        </div>
        <label style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>
          Kriteria penerimaan
          <textarea value={kriteria} onChange={(e) => setKriteria(e.target.value)} rows={2}
            style={{ width: "100%", marginTop: 6, padding: 12, borderRadius: 12, border: "1px solid var(--border)", fontSize: 14, fontFamily: "inherit" }} />
        </label>
        {galat && <div role="alert" style={{ fontSize: 12, color: "var(--on-danger-bg)", padding: 10, borderRadius: 10, background: "var(--danger-bg)", border: "1px solid var(--danger-border)" }}>{galat}</div>}
        <button type="button" onClick={simpan} disabled={mengirim}
          style={{ minHeight: 48, borderRadius: "var(--portal-radius-pill)", background: "var(--grad-aksen)", color: "var(--on-navy)", border: "none", fontSize: 14, fontWeight: 700, cursor: mengirim ? "default" : "pointer" }}>
          {mengirim ? "Menyimpan…" : "Tambah Titik"}
        </button>
      </div>
    </BottomSheet>
  );
}

function SheetHasilTitik({ titik, onSelesai }: { titik: TitikItp; onSelesai: () => void }) {
  const [catatanHasil, setCatatanHasil] = useState(titik.catatan_hasil ?? "");
  const [mengirim, setMengirim] = useState(false);
  const [galat, setGalat] = useState<string | null>(null);

  async function tandai(lolos: boolean) {
    if (!lolos && catatanHasil.trim().length === 0) {
      setGalat("Titik yang tidak lolos wajib punya catatan.");
      return;
    }
    setMengirim(true); setGalat(null);
    try {
      await api.patch(`/api/v1/itp-titik/${titik.id}`, { lolos, catatan_hasil: catatanHasil.trim() || undefined });
      onSelesai();
    } catch (e) {
      setGalat(pesanGalat(e as GalatApi, "Gagal menyimpan hasil pemeriksaan"));
    } finally { setMengirim(false); }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ fontSize: 14, fontWeight: 700, color: "var(--text-primary)" }}>{titik.tahap_pekerjaan}</div>
      <div style={{ fontSize: 13, color: "var(--text-secondary)" }}>{titik.uraian}</div>
      {titik.kriteria && (
        <div style={{ fontSize: 13, color: "var(--text-primary)", padding: 12, borderRadius: 12, background: "var(--surface-subtle)" }}>
          Kriteria: {titik.kriteria}
        </div>
      )}
      <label style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>
        Catatan hasil (wajib bila tidak lolos)
        <textarea value={catatanHasil} onChange={(e) => setCatatanHasil(e.target.value)} rows={3}
          style={{ width: "100%", marginTop: 6, padding: 12, borderRadius: 12, border: "1px solid var(--border)", fontSize: 14, fontFamily: "inherit" }} />
      </label>
      {galat && <div role="alert" style={{ fontSize: 12, color: "var(--on-danger-bg)", padding: 10, borderRadius: 10, background: "var(--danger-bg)", border: "1px solid var(--danger-border)" }}>{galat}</div>}
      <div style={{ display: "flex", gap: 10 }}>
        <button type="button" onClick={() => tandai(false)} disabled={mengirim}
          style={{ flex: 1, minHeight: 48, borderRadius: "var(--portal-radius-pill)", background: "var(--danger-bg)", color: "var(--danger)", border: "1px solid var(--danger-border)", fontSize: 14, fontWeight: 700, cursor: mengirim ? "default" : "pointer" }}>
          Tidak Lolos
        </button>
        <button type="button" onClick={() => tandai(true)} disabled={mengirim}
          style={{ flex: 1, minHeight: 48, borderRadius: "var(--portal-radius-pill)", background: "var(--grad-aksen)", color: "var(--on-navy)", border: "none", fontSize: 14, fontWeight: 700, cursor: mengirim ? "default" : "pointer" }}>
          {mengirim ? "Menyimpan…" : "Lolos"}
        </button>
      </div>
    </div>
  );
}
