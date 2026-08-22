"use client";

// ============================================================================
// Register Kontrak — Portal Admin/Direktur (Task 8, Tahap 2). COMPANY-WIDE:
// `GET /api/v1/kontrak` TANPA `project_id` sudah mengembalikan SELURUH
// kontrak tenant (`kontrak.ts:42-63`, hanya `.eq('company_id', ...)`) —
// riset Task 6 menemukan PM Portal TIDAK memakai endpoint ini (pilih
// per-proyek `/kontrak/proyek/:id` + picker wajib, karena "kontrak tercatat
// per proyek" cocok untuk PM yang kerja di satu/sedikit proyek). Admin butuh
// melihat seluruh kontrak lintas proyek sekaligus, jadi halaman ini BEDA
// STRUKTUR dari versi PM (`pm-portal/kontrak-lengkap/register/page.tsx`) —
// bukan salinan.
//
// Endpoint:
//   GET   /api/v1/kontrak                — projects:view
//   POST  /api/v1/kontrak                — projects:contract (wajib project_id)
//   PATCH /api/v1/kontrak/:id/status     — projects:contract
//
// ⚠️ `banding.cocok: true` = SESUAI — field itu hanya relevan saat membanding
// PER-PROYEK (endpoint `/kontrak/proyek/:id`, TIDAK dipanggil halaman ini);
// list company-wide di sini menampilkan status & nilai per baris tanpa banding.
// ============================================================================

import { useMemo, useState } from "react";
import Link from "next/link";
import { FileSignature, ShieldCheck, ChevronRight, Plus, CalendarClock, Scale } from "lucide-react";
import { useData, invalidasi } from "@/lib/data-cache";
import { api } from "@/lib/api";
import { formatRupiah, formatTanggal } from "@/lib/format";
import EmptyState from "@/components/portal/EmptyState";
import SkeletonCard from "@/components/portal/SkeletonCard";
import StatusBadge, { type VarianStatus } from "@/components/portal/StatusBadge";
import BottomSheet from "@/components/portal/BottomSheet";
import type { ProyekPM, DokumenKontrak, GalatApi } from "../../_bersama/tipe";
import { pesanGalat } from "../../_bersama/tipe";

interface RespProyek { projects: ProyekPM[] }
interface RespKontrakList { kontrak: DokumenKontrak[] }

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
const FILTER_STATUS = ["semua", "draf", "berlaku", "selesai", "dibatalkan"] as const;

export default function AdminRegisterKontrakPage() {
  const [filterStatus, setFilterStatus] = useState<typeof FILTER_STATUS[number]>("semua");
  const [sheetTerbuka, setSheetTerbuka] = useState(false);
  const [jenisBaru, setJenisBaru] = useState<"induk" | "addendum">("induk");
  const [indukDipilih, setIndukDipilih] = useState<DokumenKontrak | null>(null);
  const [proyekForm, setProyekForm] = useState("");
  const [form, setForm] = useState({ nomor: "", judul: "", tanggal_tanda_tangan: "", nilai: "", retensi_pct: "", syarat_pembayaran: "" });
  const [mengirim, setMengirim] = useState(false);
  const [galatForm, setGalatForm] = useState<string | null>(null);

  const [galatHalaman, setGalatHalaman] = useState<string | null>(null);
  const [batalTarget, setBatalTarget] = useState<DokumenKontrak | null>(null);
  const [alasanBatal, setAlasanBatal] = useState("");
  const [mengirimBatal, setMengirimBatal] = useState(false);
  const [galatBatal, setGalatBatal] = useState<string | null>(null);

  // Company-wide — TANPA project_id, beda dari versi PM.
  const url = "/api/v1/kontrak";
  const { data, memuat, galat } = useData<RespKontrakList>(url);
  const { data: dataProyek } = useData<RespProyek>("/api/v1/projects");
  const daftarProyek = dataProyek?.projects ?? [];

  const daftar = useMemo(() => {
    const semua = data?.kontrak ?? [];
    return filterStatus === "semua" ? semua : semua.filter((k) => k.status === filterStatus);
  }, [data, filterStatus]);
  const induk = useMemo(() => daftar.filter((k) => k.jenis === "induk"), [daftar]);
  const addendumPerInduk = useMemo(() => {
    const m = new Map<string, DokumenKontrak[]>();
    for (const k of daftar) {
      if (k.jenis !== "addendum" || !k.kontrak_induk_id) continue;
      m.set(k.kontrak_induk_id, [...(m.get(k.kontrak_induk_id) ?? []), k]);
    }
    return m;
  }, [daftar]);

  function bukaForm(jenis: "induk" | "addendum", indukBaris?: DokumenKontrak) {
    setJenisBaru(jenis);
    setIndukDipilih(indukBaris ?? null);
    setProyekForm(indukBaris?.project_id ?? daftarProyek[0]?.id ?? "");
    setForm({ nomor: "", judul: "", tanggal_tanda_tangan: "", nilai: "", retensi_pct: "", syarat_pembayaran: "" });
    setGalatForm(null);
    setSheetTerbuka(true);
  }

  async function simpanKontrak() {
    if (!proyekForm) {
      setGalatForm("Pilih proyek terlebih dulu.");
      return;
    }
    if (form.nomor.trim().length === 0 || form.judul.trim().length === 0) {
      setGalatForm("Nomor dan judul wajib diisi.");
      return;
    }
    setMengirim(true);
    setGalatForm(null);
    try {
      await api.post("/api/v1/kontrak", {
        project_id: proyekForm,
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
      invalidasi(url);
    } catch (e) {
      setGalatForm(pesanGalat(e as GalatApi, "Gagal menyimpan kontrak"));
    } finally {
      setMengirim(false);
    }
  }

  async function ubahStatus(k: DokumenKontrak, status: string) {
    if (status === "dibatalkan") {
      setBatalTarget(k);
      setAlasanBatal("");
      setGalatBatal(null);
      return;
    }
    setGalatHalaman(null);
    try {
      await api.patch(`/api/v1/kontrak/${k.id}/status`, { status });
      invalidasi(url);
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
      invalidasi(url);
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

      {/* Tautan ke modul terkait erat (asuransi menyertai tiap kontrak
          proyek; EOT/LD/Bond dan klaim kontraktual per-proyek — Task 9) —
          ketiganya bukan bagian NAV_ITEMS bottom nav (grup g-kontrak belum
          diaktifkan di kategori "Lainnya", lihat layout.tsx), jadi jalur
          masuk utamanya dari sini. */}
      <Link
        href="/admin-portal/kontrak/asuransi"
        style={{
          display: "flex", alignItems: "center", gap: 10, padding: "var(--pad-kartu)",
          borderRadius: 12, background: "var(--surface)", border: "1px solid var(--border)",
          textDecoration: "none",
        }}
      >
        <ShieldCheck size={18} color="var(--navy)" aria-hidden="true" />
        <span style={{ flex: 1, fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>
          Register Asuransi
        </span>
        <ChevronRight size={16} color="var(--text-muted)" aria-hidden="true" />
      </Link>

      <Link
        href="/admin-portal/kontrak/eot-ld-bond"
        style={{
          display: "flex", alignItems: "center", gap: 10, padding: "var(--pad-kartu)",
          borderRadius: 12, background: "var(--surface)", border: "1px solid var(--border)",
          textDecoration: "none",
        }}
      >
        <CalendarClock size={18} color="var(--navy)" aria-hidden="true" />
        <span style={{ flex: 1, fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>
          EOT, Denda &amp; Jaminan
        </span>
        <ChevronRight size={16} color="var(--text-muted)" aria-hidden="true" />
      </Link>

      <Link
        href="/admin-portal/kontrak/klaim"
        style={{
          display: "flex", alignItems: "center", gap: 10, padding: "var(--pad-kartu)",
          borderRadius: 12, background: "var(--surface)", border: "1px solid var(--border)",
          textDecoration: "none",
        }}
      >
        <Scale size={18} color="var(--navy)" aria-hidden="true" />
        <span style={{ flex: 1, fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>
          Klaim Kontraktual
        </span>
        <ChevronRight size={16} color="var(--text-muted)" aria-hidden="true" />
      </Link>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {FILTER_STATUS.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => setFilterStatus(s)}
            aria-pressed={filterStatus === s}
            style={{
              padding: "6px 14px", borderRadius: "var(--portal-radius-pill)", fontSize: 12, fontWeight: 600,
              cursor: "pointer", minHeight: 32,
              border: `1px solid ${filterStatus === s ? "var(--navy)" : "var(--border)"}`,
              background: filterStatus === s ? "var(--info-bg)" : "var(--surface)",
              color: filterStatus === s ? "var(--navy)" : "var(--text-secondary)",
            }}
          >
            {s === "semua" ? "Semua" : LABEL_STATUS[s]}
          </button>
        ))}
      </div>

      {memuat && <SkeletonCard tinggi={160} />}
      {galat && <EmptyState icon={FileSignature} judul="Gagal memuat" deskripsi={pesanGalat(galat as GalatApi, "Coba muat ulang.")} />}

      {galatHalaman && (
        <div role="alert" style={{ fontSize: 12, color: "var(--on-danger-bg)", padding: 10, borderRadius: 10, background: "var(--danger-bg)", border: "1px solid var(--danger-border)" }}>
          {galatHalaman}
        </div>
      )}

      {!memuat && induk.length === 0 && (
        <EmptyState icon={FileSignature} judul="Belum ada kontrak" deskripsi="Kontrak induk perusahaan akan muncul di sini." />
      )}

      {!memuat && induk.map((k) => (
        <div key={k.id} style={{ padding: "var(--pad-kartu-lega)", borderRadius: 16, background: "var(--surface)", border: "1px solid var(--border)", display: "flex", flexDirection: "column", gap: 10 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
            <div>
              <div style={{ fontSize: 14, fontWeight: 700, color: "var(--text-primary)" }}>{k.nomor}</div>
              <div style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: 2 }}>{k.judul}</div>
              {/* Beda dari PM: company-wide berarti nama proyek WAJIB tampil (PM sudah tahu proyeknya sendiri). */}
              {k.proyek?.name && <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 2 }}>{k.proyek.name}</div>}
            </div>
            <StatusBadge status={VARIAN_STATUS[k.status] ?? "netral"} label={LABEL_STATUS[k.status] ?? k.status} />
          </div>
          <div style={{ fontSize: 18, fontWeight: 700, color: "var(--navy)" }}>{formatRupiah(k.nilai)}</div>
          <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>
            TTD {formatTanggal(k.tanggal_tanda_tangan)}
          </div>

          {(addendumPerInduk.get(k.id) ?? []).map((a) => (
            <div key={a.id} style={{ marginLeft: 16, paddingLeft: 12, borderLeft: "2px solid var(--border)", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
              <div>
                <div style={{ fontSize: 12, fontWeight: 600, color: "var(--text-primary)" }}>{a.nomor} · {a.judul}</div>
                <div style={{ fontSize: 11, color: "var(--text-secondary)" }}>{formatRupiah(a.nilai)}</div>
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

      <button
        type="button"
        onClick={() => bukaForm("induk")}
        style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, padding: "var(--pad-kartu-lega)", borderRadius: "var(--portal-radius-pill)", background: "var(--grad-aksen)", color: "var(--on-navy)", border: "none", fontSize: 14, fontWeight: 700, cursor: "pointer" }}
      >
        <Plus size={18} aria-hidden="true" /> Kontrak Induk Baru
      </button>

      <BottomSheet terbuka={sheetTerbuka} onTutup={() => setSheetTerbuka(false)} judul={jenisBaru === "induk" ? "Kontrak Induk Baru" : `Addendum — ${indukDipilih?.nomor ?? ""}`}>
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {/* Company-wide berarti proyek WAJIB dipilih di form — beda dari PM
              yang sudah dalam konteks satu proyek lewat picker halaman. */}
          {jenisBaru === "induk" && (
            <label style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>
              Proyek
              <select value={proyekForm} onChange={(e) => setProyekForm(e.target.value)}
                style={{ width: "100%", marginTop: 6, minHeight: 44, padding: "0 12px", borderRadius: 12, border: "1px solid var(--border)", fontSize: 14, background: "var(--surface)", color: "var(--text-primary)", boxSizing: "border-box" }}>
                <option value="">Pilih proyek</option>
                {daftarProyek.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </label>
          )}
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
