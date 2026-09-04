"use client";

// ============================================================================
// Register Asuransi — versi PM (Tahap 2, Task 12).
//
// Modul BACA + CATAT, TANPA endpoint ubah-status (diverifikasi riset Task 11
// Step 1: `asuransi.ts` cuma GET+POST, nol PATCH) — status per polis murni
// TURUNAN server (`hitungRegisterAsuransi()`), bukan kolom yang bisa disunting.
//
// Endpoint:
//   GET  /api/v1/asuransi?project_id=  — projects:contract
//   POST /api/v1/asuransi              — projects:contract
// ============================================================================

import { useMemo, useState } from "react";
import { ShieldCheck, Plus } from "lucide-react";
import { useData, invalidasi } from "@/lib/data-cache";
import { api } from "@/lib/api";
import EmptyState from "@/components/portal/EmptyState";
import KepalaPortal from "@/components/portal/KepalaPortal";
import SkeletonCard from "@/components/portal/SkeletonCard";
import StatusBadge, { type VarianStatus } from "@/components/portal/StatusBadge";
import BottomSheet from "@/components/portal/BottomSheet";
import type { ProyekPM, RespAsuransi, GalatApi } from "../../_bersama/tipe";
import { pesanGalat } from "../../_bersama/tipe";
import { Pilihan } from "@/components/pilihan";

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
  aktif: "Aktif", kadaluarsa: "Kadaluarsa", belum_berlaku: "Belum Berlaku",
  segera_berakhir: "Segera Berakhir", dibatalkan: "Dibatalkan",
};
const VARIAN_STATUS: Record<string, VarianStatus> = {
  aktif: "approved", kadaluarsa: "rejected", belum_berlaku: "netral",
  segera_berakhir: "pending", dibatalkan: "netral",
};
const LABEL_JENIS: Record<string, string> = {
  car: "CAR", tpl: "TPL", jamsostek: "Jamsostek", car_tpl: "CAR + TPL", lainnya: "Lainnya",
};

export default function PmAsuransiPage() {
  const [proyekId, setProyekId] = useState("");
  const [sheetTerbuka, setSheetTerbuka] = useState(false);
  const [form, setForm] = useState({
    jenis: "car", jenis_lain: "", nomor_polis: "", penerbit: "",
    nilai_pertanggungan: "", premi: "", periode_mulai: "", periode_selesai: "", tertanggung: "",
  });
  const [mengirim, setMengirim] = useState(false);
  const [galatForm, setGalatForm] = useState<string | null>(null);

  const { data: dataProyek } = useData<RespProyek>("/api/v1/projects");
  const daftarProyek = useMemo(() => (dataProyek?.projects ?? []).filter((p) => p.pm), [dataProyek]);
  const proyekAktif = proyekId || daftarProyek[0]?.id || "";

  const url = proyekAktif ? `/api/v1/asuransi?project_id=${proyekAktif}` : "/api/v1/asuransi";
  const { data, memuat, galat } = useData<RespAsuransi>(url);

  function bukaForm() {
    setForm({ jenis: "car", jenis_lain: "", nomor_polis: "", penerbit: "", nilai_pertanggungan: "", premi: "", periode_mulai: "", periode_selesai: "", tertanggung: "" });
    setGalatForm(null);
    setSheetTerbuka(true);
  }

  async function simpanPolis() {
    if (!proyekAktif) {
      setGalatForm("Pilih proyek terlebih dulu.");
      return;
    }
    if (form.nomor_polis.trim().length === 0 || form.penerbit.trim().length === 0) {
      setGalatForm("Nomor polis dan penerbit wajib diisi.");
      return;
    }
    if (!form.periode_mulai || !form.periode_selesai) {
      setGalatForm("Periode mulai dan selesai wajib diisi.");
      return;
    }
    setMengirim(true);
    setGalatForm(null);
    try {
      await api.post("/api/v1/asuransi", {
        project_id: proyekAktif,
        jenis: form.jenis,
        jenis_lain: form.jenis === "lainnya" ? form.jenis_lain.trim() || undefined : undefined,
        nomor_polis: form.nomor_polis.trim(),
        penerbit: form.penerbit.trim(),
        nilai_pertanggungan: form.nilai_pertanggungan ? Number(form.nilai_pertanggungan) : undefined,
        premi: form.premi ? Number(form.premi) : undefined,
        periode_mulai: form.periode_mulai,
        periode_selesai: form.periode_selesai,
        tertanggung: form.tertanggung.trim() || undefined,
      });
      setSheetTerbuka(false);
      invalidasi(url);
    } catch (e) {
      setGalatForm(pesanGalat(e as GalatApi, "Gagal menyimpan polis"));
    } finally {
      setMengirim(false);
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--gap-bagian)" }}>
      <KepalaPortal judul="Register Asuransi" />

      {daftarProyek.length > 1 && (
        <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <span style={{ fontSize: 12, fontWeight: 600, color: "var(--text-secondary)" }}>Proyek</span>
          <Pilihan
            value={proyekAktif}
            onChange={(e) => setProyekId(e.target.value)}
            style={{ minHeight: 44, padding: "0 12px", borderRadius: 12, border: "1px solid var(--border)", fontSize: 14, background: "var(--surface)", color: "var(--text-primary)" }}
          >
            <option value="">Semua proyek</option>
            {daftarProyek.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </Pilihan>
        </label>
      )}

      {memuat && <SkeletonCard tinggi={160} />}
      {galat && <EmptyState icon={ShieldCheck} judul="Gagal memuat" deskripsi={pesanGalat(galat as GalatApi, "Coba muat ulang.")} />}

      {!memuat && data && (
        <div style={{ display: "flex", gap: "var(--gap-grid)", flexWrap: "wrap" }}>
          {[
            { label: "Aktif", value: data.jumlah_aktif, warna: "var(--success)" },
            { label: "Segera Berakhir", value: data.jumlah_segera_berakhir, warna: "var(--warning)" },
            { label: "Kadaluarsa", value: data.jumlah_kadaluarsa, warna: "var(--danger)" },
            { label: "Tanpa Polis", value: data.proyek_tanpa_polis.length, warna: "var(--text-secondary)" },
          ].map((k) => (
            <div key={k.label} style={{ flex: "1 1 45%", padding: "var(--pad-kartu)", borderRadius: 12, background: "var(--surface)", border: "1px solid color-mix(in srgb, var(--border) 40%, transparent)", boxShadow: "var(--naik-1)" }}>
              <div style={{ fontSize: 20, fontWeight: 700, color: k.warna }}>{k.value}</div>
              <div style={{ fontSize: 11, color: "var(--text-secondary)" }}>{k.label}</div>
            </div>
          ))}
        </div>
      )}

      {!memuat && (data?.polis?.length ?? 0) === 0 && (
        <EmptyState icon={ShieldCheck} judul="Belum ada polis" deskripsi="Polis asuransi proyek akan muncul di sini." />
      )}

      {!memuat && data?.polis.map((p) => (
        <div key={p.id} style={{ padding: "var(--pad-kartu-lega)", borderRadius: 16, background: "var(--surface)", border: "1px solid color-mix(in srgb, var(--border) 40%, transparent)", boxShadow: "var(--naik-1)", display: "flex", flexDirection: "column", gap: 8 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
            <div>
              <div style={{ fontSize: 14, fontWeight: 700, color: "var(--text-primary)" }}>{p.nomor_polis}</div>
              <div style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: 2 }}>{p.jenis_label} · {p.project_name}</div>
            </div>
            <StatusBadge status={VARIAN_STATUS[p.status] ?? "netral"} label={LABEL_STATUS[p.status] ?? p.status} />
          </div>
          <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>Penerbit: {p.penerbit}</div>
          {p.nilai_pertanggungan !== null && (
            <div style={{ fontSize: 16, fontWeight: 700, color: "var(--navy)" }}>{fmtRupiah(p.nilai_pertanggungan)}</div>
          )}
          <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>
            {fmtTanggal(p.periode_mulai)} — {fmtTanggal(p.periode_selesai)}
            {p.status === "aktif" && ` · sisa ${p.sisa_hari} hari`}
          </div>
          {(p.celah_awal > 0 || p.celah_akhir > 0) && (
            <div role="alert" style={{ fontSize: 11, color: "var(--on-warning-bg)", background: "var(--warning-bg)", padding: "6px 10px", borderRadius: 8 }}>
              Ada celah {p.celah_hari ?? "—"} hari masa proyek tanpa pertanggungan.
            </div>
          )}
        </div>
      ))}

      <button
        type="button"
        onClick={bukaForm}
        style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, padding: "var(--pad-kartu-lega)", borderRadius: "var(--portal-radius-pill)", background: "var(--grad-aksen)", color: "var(--on-navy)", border: "none", fontSize: 14, fontWeight: 700, cursor: "pointer" }}
      >
        <Plus size={18} aria-hidden="true" /> Polis Baru
      </button>

      <BottomSheet terbuka={sheetTerbuka} onTutup={() => setSheetTerbuka(false)} judul="Polis Baru">
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <label style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>
            Jenis
            <Pilihan value={form.jenis} onChange={(e) => setForm((f) => ({ ...f, jenis: e.target.value }))}
              style={{ width: "100%", marginTop: 6, minHeight: 44, padding: "0 12px", borderRadius: 12, border: "1px solid var(--border)", fontSize: 14, background: "var(--surface)", color: "var(--text-primary)", boxSizing: "border-box" }}>
              {Object.entries(LABEL_JENIS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </Pilihan>
          </label>
          {form.jenis === "lainnya" && (
            <label style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>
              Jenis Lainnya
              <input type="text" value={form.jenis_lain} onChange={(e) => setForm((f) => ({ ...f, jenis_lain: e.target.value }))}
                style={{ width: "100%", marginTop: 6, minHeight: 44, padding: "0 12px", borderRadius: 12, border: "1px solid var(--border)", fontSize: 14, background: "var(--surface)", color: "var(--text-primary)", boxSizing: "border-box" }} />
            </label>
          )}
          <label style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>
            Nomor Polis
            <input type="text" value={form.nomor_polis} onChange={(e) => setForm((f) => ({ ...f, nomor_polis: e.target.value }))}
              style={{ width: "100%", marginTop: 6, minHeight: 44, padding: "0 12px", borderRadius: 12, border: "1px solid var(--border)", fontSize: 14, background: "var(--surface)", color: "var(--text-primary)", boxSizing: "border-box" }} />
          </label>
          <label style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>
            Penerbit
            <input type="text" value={form.penerbit} onChange={(e) => setForm((f) => ({ ...f, penerbit: e.target.value }))}
              style={{ width: "100%", marginTop: 6, minHeight: 44, padding: "0 12px", borderRadius: 12, border: "1px solid var(--border)", fontSize: 14, background: "var(--surface)", color: "var(--text-primary)", boxSizing: "border-box" }} />
          </label>
          <label style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>
            Nilai Pertanggungan (Rp)
            <input type="number" value={form.nilai_pertanggungan} onChange={(e) => setForm((f) => ({ ...f, nilai_pertanggungan: e.target.value }))}
              style={{ width: "100%", marginTop: 6, minHeight: 44, padding: "0 12px", borderRadius: 12, border: "1px solid var(--border)", fontSize: 14, background: "var(--surface)", color: "var(--text-primary)", boxSizing: "border-box" }} />
          </label>
          <label style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>
            Premi (Rp)
            <input type="number" value={form.premi} onChange={(e) => setForm((f) => ({ ...f, premi: e.target.value }))}
              style={{ width: "100%", marginTop: 6, minHeight: 44, padding: "0 12px", borderRadius: 12, border: "1px solid var(--border)", fontSize: 14, background: "var(--surface)", color: "var(--text-primary)", boxSizing: "border-box" }} />
          </label>
          <label style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>
            Periode Mulai
            <input type="date" value={form.periode_mulai} onChange={(e) => setForm((f) => ({ ...f, periode_mulai: e.target.value }))}
              style={{ width: "100%", marginTop: 6, minHeight: 44, padding: "0 12px", borderRadius: 12, border: "1px solid var(--border)", fontSize: 14, background: "var(--surface)", color: "var(--text-primary)", boxSizing: "border-box" }} />
          </label>
          <label style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>
            Periode Selesai
            <input type="date" value={form.periode_selesai} onChange={(e) => setForm((f) => ({ ...f, periode_selesai: e.target.value }))}
              style={{ width: "100%", marginTop: 6, minHeight: 44, padding: "0 12px", borderRadius: 12, border: "1px solid var(--border)", fontSize: 14, background: "var(--surface)", color: "var(--text-primary)", boxSizing: "border-box" }} />
          </label>
          <label style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>
            Tertanggung
            <input type="text" value={form.tertanggung} onChange={(e) => setForm((f) => ({ ...f, tertanggung: e.target.value }))}
              style={{ width: "100%", marginTop: 6, minHeight: 44, padding: "0 12px", borderRadius: 12, border: "1px solid var(--border)", fontSize: 14, background: "var(--surface)", color: "var(--text-primary)", boxSizing: "border-box" }} />
          </label>
          {galatForm && (
            <div role="alert" style={{ fontSize: 12, color: "var(--on-danger-bg)", padding: 10, borderRadius: 10, background: "var(--danger-bg)", border: "1px solid var(--danger-border)" }}>
              {galatForm}
            </div>
          )}
          <button type="button" onClick={() => void simpanPolis()} disabled={mengirim}
            style={{ minHeight: 48, borderRadius: "var(--portal-radius-pill)", background: "var(--grad-aksen)", color: "var(--on-navy)", border: "none", fontSize: 14, fontWeight: 700, cursor: mengirim ? "default" : "pointer" }}>
            {mengirim ? "Menyimpan…" : "Simpan Polis"}
          </button>
        </div>
      </BottomSheet>
    </div>
  );
}
