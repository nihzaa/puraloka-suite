"use client";

// ============================================================================
// Back-charge — versi PM, portal mobile (Tahap 1, Task 7).
//
// Potongan biaya yang seharusnya ditanggung subkon (perbaikan cacat, material
// dibeli ulang, sewa alat) — dipotong dari tagihan mandor.
//
// PM PUNYA mandor:view (list) + backcharge:kelola (ajukan beserta bukti),
// TAPI TIDAK PUNYA backcharge:setujui — SoD eksplisit (dikonfirmasi Task 5,
// komentar `back-charge.ts` L27-31): "PM mengajukan dari lapangan, TIDAK
// menyetujui — itu pemisahannya." Karena itu tombol PUTUSKAN
// (setujui/batalkan) TIDAK PERNAH dirender di sini — bukan disembunyikan
// kondisional, memang tak ada di kode, sama seperti pola opname/page.tsx
// (Task 6). Modul ini juga TIDAK punya halaman dashboard mandiri (tertanam
// di `mandor/penagihan/page.tsx` + komponen `back-charge-aksi.tsx`) — brief
// Step 6 memilih halaman portal PM terpisah karena kelompok modul ini
// sedang dibangun sistematis satu per satu.
//
// Endpoint (dikonfirmasi Task 5, `apps/api/src/routes/v1/back-charge.ts`):
//   GET  /api/v1/back-charge   — list, butuh mandor:view
//   POST /api/v1/back-charge   — ajukan, butuh backcharge:kelola
// ============================================================================

import { useMemo, useState } from "react";
import { Wrench, Plus } from "lucide-react";
import { useData, invalidasi } from "@/lib/data-cache";
import { api } from "@/lib/api";
import BottomSheet from "@/components/portal/BottomSheet";
import StatusBadge, { type VarianStatus } from "@/components/portal/StatusBadge";
import EmptyState from "@/components/portal/EmptyState";
import SkeletonCard from "@/components/portal/SkeletonCard";
import SegmentedTab from "@/components/portal/SegmentedTab";
import type { BackCharge, ResponsBackCharge, GalatApi } from "../../_bersama/tipe";
import { pesanGalat } from "../../_bersama/tipe";

interface ScopeOpsi {
  id: string; scope_name: string; payment_system: string; status: string;
  assignment: { mandor?: { id: string; name: string } | null; project?: { id: string; name: string } | null } | null;
}
interface RespScopes { scopes: ScopeOpsi[] }

const rupiah = (n: number | string) => "Rp " + Math.round(Number(n)).toLocaleString("id-ID");
const fmtDate = (s: string | null) => {
  if (!s) return "—";
  return new Date(s).toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric" });
};

const LABEL_KATEGORI: Record<string, string> = {
  perbaikan: "Perbaikan pekerjaan", material: "Material yang ditanggung",
  alat: "Sewa alat", denda: "Denda", lainnya: "Lainnya",
};
const KATEGORI_OPSI = Object.entries(LABEL_KATEGORI).map(([kunci, label]) => ({ kunci, label }));

const LABEL_STATUS: Record<BackCharge["status"], string> = {
  diajukan: "Menunggu keputusan", disetujui: "Disetujui", dibatalkan: "Dibatalkan",
};
const VARIAN_STATUS: Record<BackCharge["status"], VarianStatus> = {
  diajukan: "pending", disetujui: "approved", dibatalkan: "rejected",
};

export default function PmBackChargePage() {
  const [filter, setFilter] = useState<"semua" | BackCharge["status"]>("semua");
  const [showForm, setShowForm] = useState(false);

  const { data, memuat, galat, muatUlang } = useData<ResponsBackCharge>("/api/v1/back-charge");
  const daftar = useMemo(() => data?.back_charge ?? [], [data]);

  const tersaring = useMemo(() => {
    const bobot: Record<BackCharge["status"], number> = { diajukan: 0, disetujui: 1, dibatalkan: 2 };
    const urut = [...daftar].sort((a, b) => bobot[a.status] - bobot[b.status] || b.tanggal.localeCompare(a.tanggal));
    return filter === "semua" ? urut : urut.filter((b) => b.status === filter);
  }, [daftar, filter]);

  const menunggu = daftar.filter((b) => b.status === "diajukan").length;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--gap-bagian)" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
        <h1 style={{ fontSize: 20, fontWeight: 700, color: "var(--text-primary)", margin: 0 }}>
          Back-charge
        </h1>
        <button
          type="button"
          onClick={() => setShowForm(true)}
          style={{
            display: "inline-flex", alignItems: "center", gap: 6, minHeight: 44,
            padding: "0 16px", borderRadius: "var(--portal-radius-pill)", fontSize: 13, fontWeight: 700,
            border: "none", background: "var(--grad-aksen)", color: "var(--on-navy)", cursor: "pointer",
          }}
        >
          <Plus size={15} aria-hidden="true" /> Catat
        </button>
      </div>

      {menunggu > 0 && (
        <div role="status" style={{ background: "var(--warning-bg)", border: "1px solid var(--warning-border)", borderRadius: 12, padding: "var(--pad-kartu)", fontSize: 13, color: "var(--on-warning-bg)" }}>
          <strong>{menunggu}</strong> potongan menunggu keputusan pihak yang berwenang menyetujui. Belum memotong tagihan mandor sampai diputuskan.
        </div>
      )}

      <SegmentedTab
        opsi={[
          { value: "semua", label: "Semua" },
          { value: "diajukan", label: "Menunggu" },
          { value: "disetujui", label: "Disetujui" },
          { value: "dibatalkan", label: "Dibatalkan" },
        ]}
        aktif={filter}
        onUbah={(v) => setFilter(v as typeof filter)}
      />

      {memuat && (
        <div style={{ display: "flex", flexDirection: "column", gap: "var(--gap-grid)" }}>
          <SkeletonCard tinggi={110} />
          <SkeletonCard tinggi={110} />
        </div>
      )}

      {!memuat && galat && (
        <EmptyState icon={Wrench} judul="Gagal memuat back-charge" deskripsi={pesanGalat(galat as GalatApi, "Coba muat ulang halaman ini.")} />
      )}

      {!memuat && !galat && tersaring.length === 0 && (
        <EmptyState
          icon={Wrench}
          judul="Belum ada back-charge tercatat"
          deskripsi="Back-charge adalah biaya yang seharusnya ditanggung subkon — perbaikan cacat, material yang dibeli ulang, sewa alat — dipotong dari tagihannya, bukan ditanggung proyek."
        />
      )}

      {!memuat && tersaring.map((b) => (
        <div key={b.id} style={{ background: "var(--surface)", borderRadius: 16, padding: "var(--pad-kartu-lega)", border: "1px solid var(--border)" }}>
          <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, marginBottom: 6 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4, flexWrap: "wrap" }}>
                <span style={{ fontSize: 14, fontWeight: 700, color: "var(--text-primary)" }}>{b.nomor}</span>
                <StatusBadge status={VARIAN_STATUS[b.status]} label={LABEL_STATUS[b.status]} />
              </div>
              <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>
                {b.scope?.scope_name ?? "—"} · {fmtDate(b.tanggal)}
              </div>
              <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 2 }}>
                {LABEL_KATEGORI[b.kategori] ?? b.kategori}
              </div>
            </div>
            <div style={{ textAlign: "right", flexShrink: 0 }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: b.status === "dibatalkan" ? "var(--text-muted)" : "var(--danger)" }}>
                {rupiah(b.nilai)}
              </div>
            </div>
          </div>

          <div style={{ fontSize: 13, color: "var(--text-primary)", lineHeight: 1.5, marginTop: 4 }}>{b.uraian}</div>

          {b.status === "dibatalkan" && b.alasan_batal && (
            <div style={{ marginTop: 8, padding: 10, borderRadius: 10, background: "var(--surface-subtle)", color: "var(--text-secondary)", fontSize: 12 }}>
              <strong>Alasan pembatalan:</strong> {b.alasan_batal}
            </div>
          )}

          {b.status === "diajukan" && (
            <div style={{ marginTop: 8, fontSize: 11, color: "var(--text-muted)" }}>
              Persetujuan/pembatalan butuh izin tersendiri — yang mengajukan bukan yang memutuskan. Tidak tersedia dari Portal PM.
            </div>
          )}
        </div>
      ))}

      <BottomSheet terbuka={showForm} onTutup={() => setShowForm(false)} judul="Catat Back-charge">
        <FormBackCharge
          onBatal={() => setShowForm(false)}
          onSukses={() => { setShowForm(false); void muatUlang(); }}
        />
      </BottomSheet>
    </div>
  );
}

function FormBackCharge({ onBatal, onSukses }: { onBatal: () => void; onSukses: () => void }) {
  const { data: dataScopes } = useData<RespScopes>("/api/v1/mandor/scopes");
  const scopes = dataScopes?.scopes ?? [];

  const [scopeId, setScopeId] = useState("");
  const [tanggal, setTanggal] = useState(new Date().toISOString().split("T")[0]);
  const [kategori, setKategori] = useState("perbaikan");
  const [nilai, setNilai] = useState("");
  const [uraian, setUraian] = useState("");
  const [mengirim, setMengirim] = useState(false);
  const [galatForm, setGalatForm] = useState<string | null>(null);

  async function simpan() {
    const n = Number(nilai);
    if (!scopeId || !tanggal || !uraian.trim() || !nilai || !Number.isFinite(n) || n <= 0) {
      setGalatForm("Lingkup kerja, tanggal, uraian, dan nilai (lebih dari 0) wajib diisi.");
      return;
    }
    setMengirim(true);
    setGalatForm(null);
    try {
      await api.post("/api/v1/back-charge", {
        work_scope_id: scopeId,
        tanggal,
        uraian: uraian.trim(),
        kategori,
        nilai: n,
      });
      invalidasi("/api/v1/back-charge");
      onSukses();
    } catch (e) {
      setGalatForm(pesanGalat(e as GalatApi, "Gagal mencatat back-charge"));
    } finally {
      setMengirim(false);
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <label style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>
        Lingkup kerja
        <select
          value={scopeId} onChange={(e) => setScopeId(e.target.value)}
          style={{ width: "100%", marginTop: 6, minHeight: 44, padding: "0 12px", borderRadius: 12, border: "1px solid var(--border)", fontSize: 14, background: "var(--surface)", color: "var(--text-primary)" }}
        >
          <option value="">-- Pilih lingkup kerja --</option>
          {scopes.map((s) => (
            <option key={s.id} value={s.id}>
              {s.scope_name} — {s.assignment?.mandor?.name ?? "—"} ({s.assignment?.project?.name ?? "—"})
            </option>
          ))}
        </select>
        <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 4, lineHeight: 1.4 }}>
          Potongan menempel pada lingkup kerja, bukan pada mandornya — satu mandor bisa memegang beberapa lingkup.
        </div>
      </label>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        <label style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>
          Tanggal
          <input
            type="date" value={tanggal} onChange={(e) => setTanggal(e.target.value)}
            style={{ width: "100%", marginTop: 6, minHeight: 44, padding: "0 12px", borderRadius: 12, border: "1px solid var(--border)", fontSize: 14, background: "var(--surface)", color: "var(--text-primary)", boxSizing: "border-box" }}
          />
        </label>
        <label style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>
          Kategori
          <select
            value={kategori} onChange={(e) => setKategori(e.target.value)}
            style={{ width: "100%", marginTop: 6, minHeight: 44, padding: "0 12px", borderRadius: 12, border: "1px solid var(--border)", fontSize: 14, background: "var(--surface)", color: "var(--text-primary)" }}
          >
            {KATEGORI_OPSI.map((k) => <option key={k.kunci} value={k.kunci}>{k.label}</option>)}
          </select>
        </label>
      </div>

      <label style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>
        Nilai (Rp)
        <input
          type="number" min={1} value={nilai} onChange={(e) => setNilai(e.target.value)} placeholder="0"
          style={{ width: "100%", marginTop: 6, minHeight: 44, padding: "0 12px", borderRadius: 12, border: "1px solid var(--border)", fontSize: 14, background: "var(--surface)", color: "var(--text-primary)", boxSizing: "border-box" }}
        />
      </label>

      <label style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>
        Uraian
        <textarea
          value={uraian} onChange={(e) => setUraian(e.target.value)} rows={3}
          placeholder="Apa yang harus diperbaiki, kenapa biayanya dibebankan ke mandor"
          style={{ width: "100%", marginTop: 6, padding: 12, borderRadius: 12, border: "1px solid var(--border)", fontSize: 14, fontFamily: "inherit", boxSizing: "border-box", resize: "vertical" }}
        />
        <div style={{ fontSize: 11, color: uraian.trim() === "" ? "var(--warning)" : "var(--text-muted)", marginTop: 4, lineHeight: 1.4 }}>
          Wajib. Potongan tanpa sebab tak bisa dijelaskan ke mandor — dan akan disengketakan saat pembayaran.
        </div>
      </label>

      {galatForm && (
        <div role="alert" style={{ fontSize: 12, color: "var(--on-danger-bg)", padding: 10, borderRadius: 10, background: "var(--danger-bg)", border: "1px solid var(--danger-border)" }}>
          {galatForm}
        </div>
      )}

      <div style={{ display: "flex", gap: 10 }}>
        <button
          type="button" onClick={onBatal} disabled={mengirim}
          style={{
            flex: 1, minHeight: 48, padding: "0 14px", borderRadius: "var(--portal-radius-pill)",
            background: "var(--surface-subtle)", color: "var(--text-secondary)", border: "1px solid var(--border)",
            fontSize: 14, fontWeight: 700, cursor: mengirim ? "default" : "pointer",
          }}
        >
          Batal
        </button>
        <button
          type="button" onClick={() => void simpan()} disabled={mengirim}
          style={mengirim ? {
            flex: 1, minHeight: 48, padding: "0 14px", borderRadius: "var(--portal-radius-pill)",
            background: "var(--surface-subtle)", color: "var(--text-muted)", border: "none",
            fontSize: 14, fontWeight: 700, cursor: "default",
          } : {
            flex: 1, minHeight: 48, padding: "0 14px", borderRadius: "var(--portal-radius-pill)",
            background: "var(--grad-aksen)", color: "var(--on-navy)", border: "none",
            fontSize: 14, fontWeight: 700, cursor: "pointer",
          }}
        >
          {mengirim ? "Menyimpan…" : "Catat Back-charge"}
        </button>
      </div>
    </div>
  );
}
