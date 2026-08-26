"use client";

// ============================================================================
// Surat Masuk & Keluar — Portal Admin/Direktur (Task 10, Tahap 2). Salinan
// APA ADANYA dari `pm-portal/kontrak-lengkap/surat/page.tsx` (Task 14) —
// endpoint backend tak beda per role pemanggil, izin `documents:manage`
// live 2026-08-22 dipegang admin DAN direktur.
//
// Pakai endpoint LINTAS-PROYEK (`GET /api/v1/letters`) sebagai default — ini
// yang menjawab "surat mana yang wajib dijawab hari ini" lintas SEMUA proyek
// (beda dari pola pemilih-proyek Task 8/9: endpoint ini SENGAJA dirancang
// lintas-proyek, lihat komentar `surat.ts`). Form "Surat Baru" tetap memilih
// SATU proyek karena `POST` per-proyek (`.../projects/:id/letters`).
//
// Endpoint:
//   GET   /api/v1/letters?arah=&status=&project_id=   — documents:manage
//   GET   /api/v1/projects/:id/letters                — documents:manage
//   POST  /api/v1/projects/:id/letters                — documents:manage
//   PATCH /api/v1/letters/:id                         — documents:manage
//
// Izin `documents:manage` (BUKAN permission surat tersendiri) — "Surat adalah
// korespondensi dokumen, dan izin itu sudah ada" (komentar route).
//
// ARAH menentukan tanggal acuan (kirim vs terima) dan SIAPA yang lalai
// (`batas.siapaYangDitunggu`) — lihat header `lib/surat-korespondensi.ts`.
// Surat mewarisi tenancy lewat `project_id` di body PATCH, pola sama klaim.
//
// ⚠️ Beda SATU-SATUNYA dari versi PM: form "Surat Baru" memang sudah memilih
// project_id dari SELURUH daftar proyek yang tersedia lewat `data.proyek`
// (bukan daftar yang difilter kepemilikan) — tak ada `.filter((p) => p.pm)`
// di halaman aslinya untuk disunting, jadi tak ada perubahan filter di sini.
//
// Halaman ini TIDAK dapat entri NAV_ITEMS sendiri — dijangkau lewat tautan
// di badan halaman Register Kontrak (`/admin-portal/kontrak/register`), pola
// sama `/admin-portal/kontrak/asuransi` (Task 8), didaftarkan WAJAR di
// `audit-nav-yatim.mjs`.
// ============================================================================

import { useState } from "react";
import { Mail, Plus } from "lucide-react";
import { useData, invalidasi } from "@/lib/data-cache";
import { api } from "@/lib/api";
import { formatTanggal } from "@/lib/format";
import EmptyState from "@/components/portal/EmptyState";
import SkeletonCard from "@/components/portal/SkeletonCard";
import StatusBadge, { type VarianStatus } from "@/components/portal/StatusBadge";
import BottomSheet from "@/components/portal/BottomSheet";
import SegmentedTab from "@/components/portal/SegmentedTab";
import { Saklar } from "@/components/saklar";
import type { RespSuratLintasProyek, GalatApi } from "../../_bersama/tipe";
import { pesanGalat } from "../../_bersama/tipe";

const LABEL_STATUS: Record<string, string> = {
  draft: "Draf", terkirim: "Terkirim", diterima: "Diterima",
  dibalas: "Dibalas", selesai: "Selesai", kedaluwarsa: "Kedaluwarsa",
};
const VARIAN_STATUS: Record<string, VarianStatus> = {
  draft: "netral", terkirim: "pending", diterima: "pending",
  dibalas: "approved", selesai: "approved", kedaluwarsa: "rejected",
};
const LABEL_BATAS: Record<string, string> = {
  tak_perlu: "", tak_diatur: "Batas tak diatur", berjalan: "Berjalan",
  mendesak: "Mendesak", lewat: "Lewat batas", tak_terbaca: "Tanggal tak terbaca",
};

export default function AdminSuratPage() {
  const [arah, setArah] = useState<"masuk" | "keluar">("keluar");
  const [sheetTerbuka, setSheetTerbuka] = useState(false);
  const [form, setForm] = useState({
    project_id: "", nomor: "", perihal: "", arah: "keluar" as "masuk" | "keluar",
    dari_pihak: "", kepada_pihak: "", tanggal_kirim: "", tanggal_terima: "",
    butuh_balasan: false, batas_balas: "",
  });
  const [mengirim, setMengirim] = useState(false);
  const [galatForm, setGalatForm] = useState<string | null>(null);

  const url = `/api/v1/letters?arah=${arah}`;
  const { data, memuat, galat } = useData<RespSuratLintasProyek>(url);

  function bukaForm() {
    setForm({
      project_id: "", nomor: "", perihal: "", arah,
      dari_pihak: "", kepada_pihak: "", tanggal_kirim: "", tanggal_terima: "",
      butuh_balasan: false, batas_balas: "",
    });
    setGalatForm(null);
    setSheetTerbuka(true);
  }

  async function simpanSurat() {
    if (!form.project_id) {
      setGalatForm("Pilih proyek terlebih dulu.");
      return;
    }
    if (form.nomor.trim().length === 0) {
      setGalatForm("Nomor surat wajib diisi.");
      return;
    }
    if (form.perihal.trim().length < 5) {
      setGalatForm("Perihal wajib diisi, minimal 5 karakter — ini yang dibaca saat surat dicari kembali.");
      return;
    }
    if (form.dari_pihak.trim().length === 0 || form.kepada_pihak.trim().length === 0) {
      setGalatForm("Pihak pengirim dan penerima wajib diisi.");
      return;
    }
    setMengirim(true);
    setGalatForm(null);
    try {
      await api.post(`/api/v1/projects/${form.project_id}/letters`, {
        nomor: form.nomor.trim(),
        perihal: form.perihal.trim(),
        arah: form.arah,
        dari_pihak: form.dari_pihak.trim(),
        kepada_pihak: form.kepada_pihak.trim(),
        tanggal_kirim: form.tanggal_kirim || undefined,
        tanggal_terima: form.tanggal_terima || undefined,
        butuh_balasan: form.butuh_balasan,
        batas_balas: form.butuh_balasan ? (form.batas_balas || undefined) : undefined,
      });
      setSheetTerbuka(false);
      invalidasi(url);
    } catch (e) {
      setGalatForm(pesanGalat(e as GalatApi, "Gagal mencatat surat"));
    } finally {
      setMengirim(false);
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--gap-bagian)" }}>
      <h1 style={{ fontSize: 20, fontWeight: 700, color: "var(--text-primary)", margin: 0 }}>
        Surat Masuk &amp; Keluar
      </h1>

      <SegmentedTab
        opsi={[{ value: "keluar", label: "Keluar" }, { value: "masuk", label: "Masuk" }]}
        aktif={arah}
        onUbah={(v) => setArah(v as "masuk" | "keluar")}
      />

      {memuat && <SkeletonCard tinggi={100} />}
      {galat && <EmptyState icon={Mail} judul="Gagal memuat" deskripsi={pesanGalat(galat as GalatApi, "Coba muat ulang.")} />}

      {!memuat && data && (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <div style={{ flex: "1 1 45%", padding: "var(--pad-kartu)", borderRadius: 12, background: "var(--surface)", border: "1px solid var(--border)" }}>
            <div style={{ fontSize: 20, fontWeight: 700, color: "var(--danger)" }}>{data.ringkas.kita_belum_menjawab}</div>
            <div style={{ fontSize: 11, color: "var(--text-secondary)" }}>Kita belum menjawab</div>
          </div>
          <div style={{ flex: "1 1 45%", padding: "var(--pad-kartu)", borderRadius: 12, background: "var(--surface)", border: "1px solid var(--border)" }}>
            <div style={{ fontSize: 20, fontWeight: 700, color: "var(--text-primary)" }}>{data.ringkas.lawan_belum_menjawab}</div>
            <div style={{ fontSize: 11, color: "var(--text-secondary)" }}>Lawan belum menjawab</div>
          </div>
        </div>
      )}

      {!memuat && (data?.data?.length ?? 0) === 0 && (
        <EmptyState icon={Mail} judul="Belum ada surat" deskripsi="Korespondensi proyek akan muncul di sini." />
      )}

      {!memuat && data?.data.map((s) => (
        <div key={s.id} style={{ padding: "var(--pad-kartu-lega)", borderRadius: 16, background: "var(--surface)", border: "1px solid var(--border)", display: "flex", flexDirection: "column", gap: 8 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
            <div>
              <div style={{ fontSize: 14, fontWeight: 700, color: "var(--text-primary)" }}>{s.nomor}</div>
              <div style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: 2 }}>{s.perihal}</div>
              {s.project_name && <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 2 }}>{s.project_name}</div>}
            </div>
            <StatusBadge status={VARIAN_STATUS[s.status] ?? "netral"} label={LABEL_STATUS[s.status] ?? s.status} />
          </div>
          {s.butuh_balasan && s.batas.keadaan !== "tak_perlu" && (
            <div
              role="alert"
              style={{
                fontSize: 11, fontWeight: 700,
                color: s.batas.keadaan === "lewat" || s.batas.keadaan === "mendesak" ? "var(--danger)" : "var(--text-secondary)",
                alignSelf: "flex-start",
              }}
            >
              {LABEL_BATAS[s.batas.keadaan]}
              {s.batas.sisaHari !== null && ` · sisa ${s.batas.sisaHari} hari`}
              {s.batas.siapaYangDitunggu && ` · menunggu ${s.batas.siapaYangDitunggu === "kita" ? "kita" : "lawan"}`}
            </div>
          )}
          <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>
            {s.dari_pihak} → {s.kepada_pihak} · {formatTanggal(s.tanggal_kirim)}
          </div>
        </div>
      ))}

      <button
        type="button"
        onClick={bukaForm}
        style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, padding: "var(--pad-kartu-lega)", borderRadius: "var(--portal-radius-pill)", background: "var(--grad-aksen)", color: "var(--on-navy)", border: "none", fontSize: 14, fontWeight: 700, cursor: "pointer" }}
      >
        <Plus size={18} aria-hidden="true" /> Surat Baru
      </button>

      <BottomSheet terbuka={sheetTerbuka} onTutup={() => setSheetTerbuka(false)} judul="Surat Baru">
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <label style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>
            Proyek
            <select value={form.project_id} onChange={(e) => setForm((f) => ({ ...f, project_id: e.target.value }))}
              style={{ width: "100%", marginTop: 6, minHeight: 44, padding: "0 12px", borderRadius: 12, border: "1px solid var(--border)", fontSize: 14, background: "var(--surface)", color: "var(--text-primary)", boxSizing: "border-box" }}>
              <option value="">Pilih proyek</option>
              {(data?.proyek ?? []).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </label>
          <label style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>
            Arah
            <select value={form.arah} onChange={(e) => setForm((f) => ({ ...f, arah: e.target.value as "masuk" | "keluar" }))}
              style={{ width: "100%", marginTop: 6, minHeight: 44, padding: "0 12px", borderRadius: 12, border: "1px solid var(--border)", fontSize: 14, background: "var(--surface)", color: "var(--text-primary)", boxSizing: "border-box" }}>
              <option value="keluar">Keluar</option>
              <option value="masuk">Masuk</option>
            </select>
          </label>
          <label style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>
            Nomor
            <input type="text" value={form.nomor} onChange={(e) => setForm((f) => ({ ...f, nomor: e.target.value }))}
              style={{ width: "100%", marginTop: 6, minHeight: 44, padding: "0 12px", borderRadius: 12, border: "1px solid var(--border)", fontSize: 14, background: "var(--surface)", color: "var(--text-primary)", boxSizing: "border-box" }} />
          </label>
          <label style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>
            Perihal (min 5 karakter)
            <input type="text" value={form.perihal} onChange={(e) => setForm((f) => ({ ...f, perihal: e.target.value }))}
              style={{ width: "100%", marginTop: 6, minHeight: 44, padding: "0 12px", borderRadius: 12, border: "1px solid var(--border)", fontSize: 14, background: "var(--surface)", color: "var(--text-primary)", boxSizing: "border-box" }} />
          </label>
          <label style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>
            Dari Pihak
            <input type="text" value={form.dari_pihak} onChange={(e) => setForm((f) => ({ ...f, dari_pihak: e.target.value }))}
              style={{ width: "100%", marginTop: 6, minHeight: 44, padding: "0 12px", borderRadius: 12, border: "1px solid var(--border)", fontSize: 14, background: "var(--surface)", color: "var(--text-primary)", boxSizing: "border-box" }} />
          </label>
          <label style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>
            Kepada Pihak
            <input type="text" value={form.kepada_pihak} onChange={(e) => setForm((f) => ({ ...f, kepada_pihak: e.target.value }))}
              style={{ width: "100%", marginTop: 6, minHeight: 44, padding: "0 12px", borderRadius: 12, border: "1px solid var(--border)", fontSize: 14, background: "var(--surface)", color: "var(--text-primary)", boxSizing: "border-box" }} />
          </label>
          {form.arah === "keluar" ? (
            <label style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>
              Tanggal Kirim
              <input type="date" value={form.tanggal_kirim} onChange={(e) => setForm((f) => ({ ...f, tanggal_kirim: e.target.value }))}
                style={{ width: "100%", marginTop: 6, minHeight: 44, padding: "0 12px", borderRadius: 12, border: "1px solid var(--border)", fontSize: 14, background: "var(--surface)", color: "var(--text-primary)", boxSizing: "border-box" }} />
            </label>
          ) : (
            <label style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>
              Tanggal Terima
              <input type="date" value={form.tanggal_terima} onChange={(e) => setForm((f) => ({ ...f, tanggal_terima: e.target.value }))}
                style={{ width: "100%", marginTop: 6, minHeight: 44, padding: "0 12px", borderRadius: 12, border: "1px solid var(--border)", fontSize: 14, background: "var(--surface)", color: "var(--text-primary)", boxSizing: "border-box" }} />
            </label>
          )}
          <Saklar
            nyala={form.butuh_balasan}
            onUbah={(nyala) => setForm((f) => ({ ...f, butuh_balasan: nyala }))}
            label="Butuh Balasan"
          />
          {form.butuh_balasan && (
            <label style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>
              Batas Balas
              <input type="date" value={form.batas_balas} onChange={(e) => setForm((f) => ({ ...f, batas_balas: e.target.value }))}
                style={{ width: "100%", marginTop: 6, minHeight: 44, padding: "0 12px", borderRadius: 12, border: "1px solid var(--border)", fontSize: 14, background: "var(--surface)", color: "var(--text-primary)", boxSizing: "border-box" }} />
            </label>
          )}
          {galatForm && (
            <div role="alert" style={{ fontSize: 12, color: "var(--on-danger-bg)", padding: 10, borderRadius: 10, background: "var(--danger-bg)", border: "1px solid var(--danger-border)" }}>
              {galatForm}
            </div>
          )}
          <button type="button" onClick={() => void simpanSurat()} disabled={mengirim}
            style={{ minHeight: 48, borderRadius: "var(--portal-radius-pill)", background: "var(--grad-aksen)", color: "var(--on-navy)", border: "none", fontSize: 14, fontWeight: 700, cursor: mengirim ? "default" : "pointer" }}>
            {mengirim ? "Menyimpan…" : "Simpan Surat"}
          </button>
        </div>
      </BottomSheet>
    </div>
  );
}
