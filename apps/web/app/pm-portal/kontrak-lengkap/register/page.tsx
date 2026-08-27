"use client";

// ============================================================================
// Register Kontrak — versi PM (Tahap 2, Task 12).
//
// Beda dari `pm-portal/kontrak/page.tsx` (BACA SAJA, subset kolom `projects`):
// halaman ini adalah entitas KEDUA — dokumen kontrak (tabel `kontrak`,
// migrasi 344), dibandingkan (bukan menimpa) terhadap `projects.contract_value`.
// Lihat komentar `DokumenKontrak` di `_bersama/tipe.ts` untuk pembagian
// tugasnya. PM PUNYA `projects:contract` (dikonfirmasi riset Task 11 Step 1)
// jadi form CREATE + transisi status disertakan, bukan baca saja.
//
// Endpoint:
//   GET   /api/v1/kontrak/proyek/:projectId  — projects:view
//   POST  /api/v1/kontrak                    — projects:contract
//   PATCH /api/v1/kontrak/:id/status         — projects:contract
//
// ⚠️ `banding.cocok: true` = SESUAI (bukan sebaliknya) — banner tampil saat
// `cocok` FALSE (ada selisih), logikanya kebalikan dari nama.
// ============================================================================

import { useMemo, useState } from "react";
import { FileSignature, Plus, AlertTriangle } from "lucide-react";
import { useData, invalidasi } from "@/lib/data-cache";
import { api } from "@/lib/api";
import EmptyState from "@/components/portal/EmptyState";
import SkeletonCard from "@/components/portal/SkeletonCard";
import StatusBadge, { type VarianStatus } from "@/components/portal/StatusBadge";
import BottomSheet from "@/components/portal/BottomSheet";
import type { ProyekPM, RespKontrakProyek, DokumenKontrak, GalatApi } from "../../_bersama/tipe";
import { pesanGalat } from "../../_bersama/tipe";

interface RespProyek { projects: ProyekPM[] }

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

const LABEL_STATUS: Record<string, string> = {
  draf: "Draf", berlaku: "Berlaku", selesai: "Selesai", dibatalkan: "Dibatalkan",
};
const VARIAN_STATUS: Record<string, VarianStatus> = {
  draf: "netral", berlaku: "approved", selesai: "info", dibatalkan: "rejected",
};
const TRANSISI: Record<string, string[]> = {
  draf: ["berlaku", "dibatalkan"],
  berlaku: ["selesai", "dibatalkan"],
  selesai: [],
  dibatalkan: [],
};

export default function PmRegisterKontrakPage() {
  const [proyekId, setProyekId] = useState("");
  const [sheetTerbuka, setSheetTerbuka] = useState(false);
  const [jenisBaru, setJenisBaru] = useState<"induk" | "addendum">("induk");
  const [indukDipilih, setIndukDipilih] = useState<DokumenKontrak | null>(null);
  const [form, setForm] = useState({ nomor: "", judul: "", tanggal_tanda_tangan: "", nilai: "", retensi_pct: "", syarat_pembayaran: "" });
  const [mengirim, setMengirim] = useState(false);
  const [galatForm, setGalatForm] = useState<string | null>(null);

  // Galat aksi di level HALAMAN — dipakai transisi status yang dipicu dari
  // tombol di kartu (di LUAR BottomSheet), supaya kegagalan (mis. 409 alasan
  // pembatalan kosong) tidak diam-diam tak terlihat user (Critical #2 review).
  const [galatHalaman, setGalatHalaman] = useState<string | null>(null);

  // Pembatalan WAJIB alasan (`periksaTransisiKontrak`, `apps/api/src/lib/
  // kontrak.ts`) — tanpa field ini setiap klik "→ Dibatalkan" pasti 409
  // (Critical #1 review). BottomSheet TERPISAH dari form create/addendum.
  const [batalTarget, setBatalTarget] = useState<DokumenKontrak | null>(null);
  const [alasanBatal, setAlasanBatal] = useState("");
  const [mengirimBatal, setMengirimBatal] = useState(false);
  const [galatBatal, setGalatBatal] = useState<string | null>(null);

  const { data: dataProyek } = useData<RespProyek>("/api/v1/projects");
  const daftarProyek = useMemo(() => (dataProyek?.projects ?? []).filter((p) => p.pm), [dataProyek]);
  const proyekAktif = proyekId || daftarProyek[0]?.id || "";

  const url = proyekAktif ? `/api/v1/kontrak/proyek/${proyekAktif}` : null;
  const { data, memuat, galat } = useData<RespKontrakProyek>(url);

  const induk = useMemo(() => (data?.kontrak ?? []).filter((k) => k.jenis === "induk"), [data]);
  const addendumPerInduk = useMemo(() => {
    const m = new Map<string, DokumenKontrak[]>();
    for (const k of data?.kontrak ?? []) {
      if (k.jenis !== "addendum" || !k.kontrak_induk_id) continue;
      m.set(k.kontrak_induk_id, [...(m.get(k.kontrak_induk_id) ?? []), k]);
    }
    return m;
  }, [data]);

  function bukaForm(jenis: "induk" | "addendum", indukBaris?: DokumenKontrak) {
    setJenisBaru(jenis);
    setIndukDipilih(indukBaris ?? null);
    setForm({ nomor: "", judul: "", tanggal_tanda_tangan: "", nilai: "", retensi_pct: "", syarat_pembayaran: "" });
    setGalatForm(null);
    setSheetTerbuka(true);
  }

  async function simpanKontrak() {
    if (!proyekAktif) return;
    if (form.nomor.trim().length === 0 || form.judul.trim().length === 0) {
      setGalatForm("Nomor dan judul wajib diisi.");
      return;
    }
    setMengirim(true);
    setGalatForm(null);
    try {
      await api.post("/api/v1/kontrak", {
        project_id: proyekAktif,
        jenis: jenisBaru,
        kontrak_induk_id: jenisBaru === "addendum" ? indukDipilih?.id : undefined,
        nomor: form.nomor.trim(),
        judul: form.judul.trim(),
        tanggal_tanda_tangan: form.tanggal_tanda_tangan || undefined,
        nilai: form.nilai ? Number(form.nilai) : undefined,
        retensi_pct: form.retensi_pct ? Number(form.retensi_pct) : undefined,
        syarat_pembayaran: form.syarat_pembayaran.trim() || undefined,
      });
      setSheetTerbuka(false);
      invalidasi(url ?? "");
    } catch (e) {
      setGalatForm(pesanGalat(e as GalatApi, "Gagal menyimpan kontrak"));
    } finally {
      setMengirim(false);
    }
  }

  async function ubahStatus(k: DokumenKontrak, status: string) {
    // `dibatalkan` WAJIB alasan (backend menolak 409 tanpanya) — dialihkan ke
    // BottomSheet konfirmasi terpisah, bukan langsung PATCH.
    if (status === "dibatalkan") {
      setBatalTarget(k);
      setAlasanBatal("");
      setGalatBatal(null);
      return;
    }
    setGalatHalaman(null);
    try {
      await api.patch(`/api/v1/kontrak/${k.id}/status`, { status });
      invalidasi(url ?? "");
    } catch (e) {
      setGalatHalaman(pesanGalat(e as GalatApi, "Gagal mengubah status kontrak"));
    }
  }

  async function konfirmasiBatal() {
    if (!batalTarget) return;
    if (alasanBatal.trim().length === 0) {
      setGalatBatal("Alasan pembatalan wajib diisi.");
      return;
    }
    setMengirimBatal(true);
    setGalatBatal(null);
    try {
      await api.patch(`/api/v1/kontrak/${batalTarget.id}/status`, {
        status: "dibatalkan",
        alasan: alasanBatal.trim(),
      });
      setBatalTarget(null);
      invalidasi(url ?? "");
    } catch (e) {
      setGalatBatal(pesanGalat(e as GalatApi, "Gagal membatalkan kontrak"));
    } finally {
      setMengirimBatal(false);
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--gap-bagian)" }}>
      <h1 style={{ fontSize: 20, fontWeight: 700, color: "var(--text-primary)", margin: 0 }}>
        Register Kontrak
      </h1>

      {daftarProyek.length > 1 && (
        <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <span style={{ fontSize: 12, fontWeight: 600, color: "var(--text-secondary)" }}>Proyek</span>
          <select
            value={proyekAktif}
            onChange={(e) => setProyekId(e.target.value)}
            style={{ minHeight: 44, padding: "0 12px", borderRadius: 12, border: "1px solid var(--border)", fontSize: 14, background: "var(--surface)", color: "var(--text-primary)" }}
          >
            {daftarProyek.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </label>
      )}

      {!proyekAktif && <EmptyState icon={FileSignature} judul="Pilih proyek" deskripsi="Kontrak tercatat per proyek." />}
      {memuat && <SkeletonCard tinggi={160} />}
      {galat && <EmptyState icon={FileSignature} judul="Gagal memuat" deskripsi={pesanGalat(galat as GalatApi, "Coba muat ulang.")} />}

      {/* Galat aksi level halaman — dipakai transisi status dari tombol di
          kartu (di LUAR BottomSheet manapun), supaya kegagalan tetap terlihat. */}
      {galatHalaman && (
        <div role="alert" style={{ fontSize: 12, color: "var(--on-danger-bg)", padding: 10, borderRadius: 10, background: "var(--danger-bg)", border: "1px solid var(--danger-border)" }}>
          {galatHalaman}
        </div>
      )}

      {/* cocok: true = SESUAI — banner tampil saat cocok FALSE (ada selisih), bukan sebaliknya */}
      {!memuat && data?.banding && !data.banding.cocok && (
        <div role="alert" style={{ display: "flex", alignItems: "flex-start", gap: 8, padding: "var(--pad-kartu)", borderRadius: 12, background: "var(--warning-bg)", border: "1px solid var(--warning-border)" }}>
          <AlertTriangle size={16} color="var(--warning)" aria-hidden="true" style={{ flexShrink: 0, marginTop: 1 }} />
          <div>
            <div style={{ fontSize: 12, fontWeight: 700, color: "var(--on-warning-bg)" }}>Selisih nilai kontrak: {fmtRupiah(data.banding.selisih)}</div>
            <div style={{ fontSize: 12, color: "var(--on-warning-bg)", marginTop: 2 }}>{data.banding.sebab}</div>
          </div>
        </div>
      )}

      {!memuat && proyekAktif && induk.length === 0 && (
        <EmptyState icon={FileSignature} judul="Belum ada kontrak" deskripsi="Kontrak induk proyek ini belum dicatat." />
      )}

      {!memuat && induk.map((k) => (
        <div key={k.id} style={{ padding: "var(--pad-kartu-lega)", borderRadius: 16, background: "var(--surface)", border: "1px solid color-mix(in srgb, var(--border) 40%, transparent)", boxShadow: "var(--naik-1)", display: "flex", flexDirection: "column", gap: 10 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
            <div>
              <div style={{ fontSize: 14, fontWeight: 700, color: "var(--text-primary)" }}>{k.nomor}</div>
              <div style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: 2 }}>{k.judul}</div>
            </div>
            <StatusBadge status={VARIAN_STATUS[k.status] ?? "netral"} label={LABEL_STATUS[k.status] ?? k.status} />
          </div>
          <div style={{ fontSize: 18, fontWeight: 700, color: "var(--navy)" }}>{fmtRupiah(k.nilai)}</div>
          {/* Retensi TIDAK ditampilkan di sini: GET /api/v1/kontrak/proyek/:id
              (endpoint yang dipakai halaman ini) memakai SELECT manual yang
              TIDAK menyertakan retensi_pct (beda dari SELECT_KONTRAK di
              endpoint lain) — menampilkannya akan selalu "—%" walau
              kontraknya benar-benar punya nilai retensi tersimpan. Lihat
              catatan Important #3, task-12-report.md. */}
          <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>
            TTD {fmtTanggal(k.tanggal_tanda_tangan)}
          </div>

          {(addendumPerInduk.get(k.id) ?? []).map((a) => (
            <div key={a.id} style={{ marginLeft: 16, paddingLeft: 12, borderLeft: "2px solid var(--border)", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
              <div>
                <div style={{ fontSize: 12, fontWeight: 600, color: "var(--text-primary)" }}>{a.nomor} · {a.judul}</div>
                <div style={{ fontSize: 11, color: "var(--text-secondary)" }}>{fmtRupiah(a.nilai)}</div>
              </div>
              <StatusBadge status={VARIAN_STATUS[a.status] ?? "netral"} label={LABEL_STATUS[a.status] ?? a.status} />
            </div>
          ))}

          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 4 }}>
            {(TRANSISI[k.status] ?? []).map((tujuan) => (
              <button
                key={tujuan}
                type="button"
                onClick={() => void ubahStatus(k, tujuan)}
                style={{ minHeight: 36, padding: "0 12px", borderRadius: "var(--portal-radius-pill)", background: "var(--surface-subtle)", color: "var(--text-primary)", border: "1px solid var(--border)", fontSize: 12, fontWeight: 600, cursor: "pointer" }}
              >
                → {LABEL_STATUS[tujuan]}
              </button>
            ))}
            {k.status === "berlaku" && (
              <button
                type="button"
                onClick={() => bukaForm("addendum", k)}
                style={{ minHeight: 36, padding: "0 12px", borderRadius: "var(--portal-radius-pill)", background: "var(--info-bg)", color: "var(--navy)", border: "none", fontSize: 12, fontWeight: 600, cursor: "pointer" }}
              >
                + Addendum
              </button>
            )}
          </div>
        </div>
      ))}

      {!memuat && proyekAktif && (
        <button
          type="button"
          onClick={() => bukaForm("induk")}
          style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, padding: "var(--pad-kartu-lega)", borderRadius: "var(--portal-radius-pill)", background: "var(--grad-aksen)", color: "var(--on-navy)", border: "none", fontSize: 14, fontWeight: 700, cursor: "pointer" }}
        >
          <Plus size={18} aria-hidden="true" /> Kontrak Induk Baru
        </button>
      )}

      <BottomSheet terbuka={sheetTerbuka} onTutup={() => setSheetTerbuka(false)} judul={jenisBaru === "induk" ? "Kontrak Induk Baru" : `Addendum — ${indukDipilih?.nomor ?? ""}`}>
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <label style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>
            Nomor
            <input type="text" value={form.nomor} onChange={(e) => setForm((f) => ({ ...f, nomor: e.target.value }))}
              style={{ width: "100%", marginTop: 6, minHeight: 44, padding: "0 12px", borderRadius: 12, border: "1px solid var(--border)", fontSize: 14, background: "var(--surface)", color: "var(--text-primary)", boxSizing: "border-box" }} />
          </label>
          <label style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>
            Judul
            <input type="text" value={form.judul} onChange={(e) => setForm((f) => ({ ...f, judul: e.target.value }))}
              style={{ width: "100%", marginTop: 6, minHeight: 44, padding: "0 12px", borderRadius: 12, border: "1px solid var(--border)", fontSize: 14, background: "var(--surface)", color: "var(--text-primary)", boxSizing: "border-box" }} />
          </label>
          <label style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>
            Tanggal Tanda Tangan
            <input type="date" value={form.tanggal_tanda_tangan} onChange={(e) => setForm((f) => ({ ...f, tanggal_tanda_tangan: e.target.value }))}
              style={{ width: "100%", marginTop: 6, minHeight: 44, padding: "0 12px", borderRadius: 12, border: "1px solid var(--border)", fontSize: 14, background: "var(--surface)", color: "var(--text-primary)", boxSizing: "border-box" }} />
          </label>
          <label style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>
            Nilai (Rp)
            <input type="number" value={form.nilai} onChange={(e) => setForm((f) => ({ ...f, nilai: e.target.value }))}
              style={{ width: "100%", marginTop: 6, minHeight: 44, padding: "0 12px", borderRadius: 12, border: "1px solid var(--border)", fontSize: 14, background: "var(--surface)", color: "var(--text-primary)", boxSizing: "border-box" }} />
          </label>
          <label style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>
            Retensi (%)
            <input type="number" value={form.retensi_pct} onChange={(e) => setForm((f) => ({ ...f, retensi_pct: e.target.value }))}
              style={{ width: "100%", marginTop: 6, minHeight: 44, padding: "0 12px", borderRadius: 12, border: "1px solid var(--border)", fontSize: 14, background: "var(--surface)", color: "var(--text-primary)", boxSizing: "border-box" }} />
          </label>
          <label style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>
            Syarat Pembayaran (opsional)
            <input type="text" value={form.syarat_pembayaran} onChange={(e) => setForm((f) => ({ ...f, syarat_pembayaran: e.target.value }))}
              style={{ width: "100%", marginTop: 6, minHeight: 44, padding: "0 12px", borderRadius: 12, border: "1px solid var(--border)", fontSize: 14, background: "var(--surface)", color: "var(--text-primary)", boxSizing: "border-box" }} />
          </label>
          {galatForm && (
            <div role="alert" style={{ fontSize: 12, color: "var(--on-danger-bg)", padding: 10, borderRadius: 10, background: "var(--danger-bg)", border: "1px solid var(--danger-border)" }}>
              {galatForm}
            </div>
          )}
          <button type="button" onClick={() => void simpanKontrak()} disabled={mengirim}
            style={{ minHeight: 48, borderRadius: "var(--portal-radius-pill)", background: "var(--grad-aksen)", color: "var(--on-navy)", border: "none", fontSize: 14, fontWeight: 700, cursor: mengirim ? "default" : "pointer" }}>
            {mengirim ? "Menyimpan…" : "Simpan"}
          </button>
        </div>
      </BottomSheet>

      {/* Pembatalan wajib alasan (periksaTransisiKontrak) — BottomSheet
          terpisah dari form create/addendum. */}
      <BottomSheet terbuka={!!batalTarget} onTutup={() => setBatalTarget(null)} judul={`Batalkan — ${batalTarget?.nomor ?? ""}`}>
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <p style={{ fontSize: 13, color: "var(--text-secondary)", margin: 0 }}>
            {batalTarget?.judul} akan ditandai <strong>Dibatalkan</strong>. Tindakan ini
            butuh alasan — pihak yang menandatangani berhak tahu kenapa kontraknya ditarik.
          </p>
          <label style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>
            Alasan pembatalan
            <textarea
              value={alasanBatal}
              onChange={(e) => setAlasanBatal(e.target.value)}
              rows={3}
              style={{ width: "100%", marginTop: 6, padding: 12, borderRadius: 12, border: "1px solid var(--border)", fontSize: 14, background: "var(--surface)", color: "var(--text-primary)", boxSizing: "border-box", fontFamily: "inherit", resize: "vertical" }}
            />
          </label>
          {galatBatal && (
            <div role="alert" style={{ fontSize: 12, color: "var(--on-danger-bg)", padding: 10, borderRadius: 10, background: "var(--danger-bg)", border: "1px solid var(--danger-border)" }}>
              {galatBatal}
            </div>
          )}
          <div style={{ display: "flex", gap: 10 }}>
            <button
              type="button" onClick={() => setBatalTarget(null)} disabled={mengirimBatal}
              style={{ flex: 1, minHeight: 48, padding: "0 14px", borderRadius: "var(--portal-radius-pill)", background: "var(--surface-subtle)", color: "var(--text-secondary)", border: "1px solid var(--border)", fontSize: 14, fontWeight: 700, cursor: mengirimBatal ? "default" : "pointer" }}
            >
              Batal
            </button>
            <button
              type="button" onClick={() => void konfirmasiBatal()} disabled={mengirimBatal}
              style={{ flex: 1, minHeight: 48, padding: "0 14px", borderRadius: "var(--portal-radius-pill)", background: "var(--danger)", color: "var(--on-navy)", border: "none", fontSize: 14, fontWeight: 700, cursor: mengirimBatal ? "default" : "pointer" }}
            >
              {mengirimBatal ? "Membatalkan…" : "Ya, Batalkan Kontrak"}
            </button>
          </div>
        </div>
      </BottomSheet>
    </div>
  );
}
