"use client";

// ============================================================================
// Tender Subkontraktor — versi PM, portal mobile (Tahap 1, Task 7).
//
// ⚠️ BEDA permission dari modul mandor/opname/spk/backcharge lainnya di
// kelompok ini: tender TIDAK memakai `mandor:*` sama sekali. Diverifikasi
// langsung dari kode (bukan Task 5 — modul ini di luar cakupan risetnya):
// `apps/api/src/routes/v1/tender-subkon.ts` memakai `projects:view` (baca)
// dan `projects:contract` (tulis: buat tender, ajukan penawaran, tetapkan
// pemenang, tutup tender). Keduanya TIDAK ada di denylist migrasi 050 —
// PM punya penuh, TANPA SoD (beda dari opname/backcharge/spk yang menahan
// langkah terakhir dari PM).
//
// Modul kompleks (1045 baris di web) — disederhanakan ke: list tender +
// status, ringkasan perbandingan (termurah/pemenang), BottomSheet detail
// per-penawaran, dan aksi tetapkan pemenang + tutup tender. Perbandingan
// PER-ITEM (matriks pos×penawar di versi web) SENGAJA TIDAK direplikasi —
// tabel lebar itu tak masuk akal di layar mobile sempit; ringkasan per
// penawar (termurah di X dari Y pos) sudah cukup untuk keputusan cepat.
//
// Endpoint (diverifikasi baca kode):
//   GET   /api/v1/tender-subkon             — list, projects:view
//   GET   /api/v1/tender-subkon/:id         — detail+perbandingan, projects:view
//   POST  /api/v1/tender-subkon             — buat tender, projects:contract
//   POST  /api/v1/tender-subkon/:id/penawaran        — catat penawaran, projects:contract
//   PATCH /api/v1/tender-subkon/:id/pemenang         — tetapkan pemenang, projects:contract
//   PATCH /api/v1/tender-subkon/:id/tutup            — tutup tender, projects:contract
// ============================================================================

import { useMemo, useState } from "react";
import { Gavel, Plus, Trophy, TriangleAlert, Lock } from "lucide-react";
import { useData, invalidasi } from "@/lib/data-cache";
import { api } from "@/lib/api";
import BottomSheet from "@/components/portal/BottomSheet";
import StatusBadge, { type VarianStatus } from "@/components/portal/StatusBadge";
import EmptyState from "@/components/portal/EmptyState";
import SkeletonCard from "@/components/portal/SkeletonCard";
import SegmentedTab from "@/components/portal/SegmentedTab";
import type {
  TenderSubkon, ResponsTenderSubkon, ResponsTenderDetail, PenawaranTenderBanding, GalatApi,
} from "../../_bersama/tipe";
import { pesanGalat } from "../../_bersama/tipe";

interface ProyekOpsi { id: string; name: string }
interface RespProyek { projects: ProyekOpsi[] }

const rupiah = (n: number | string | null | undefined) =>
  n === null || n === undefined || n === "" ? "—" : "Rp " + Math.round(Number(n)).toLocaleString("id-ID");

const fmtDate = (s: string | null) => {
  if (!s) return "—";
  return new Date(s).toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric" });
};

const jumlahPenawaran = (t: TenderSubkon) => t.penawaran_subkon?.[0]?.count ?? 0;

const LABEL_STATUS: Record<TenderSubkon["status"], string> = {
  draft: "Draft", terkirim: "Terbuka", selesai: "Selesai", batal: "Batal",
};
const VARIAN_STATUS: Record<TenderSubkon["status"], VarianStatus> = {
  draft: "netral", terkirim: "pending", selesai: "approved", batal: "rejected",
};

export default function PmTenderPage() {
  const [filter, setFilter] = useState<"semua" | TenderSubkon["status"]>("semua");
  const [showForm, setShowForm] = useState(false);
  const [detailId, setDetailId] = useState<string | null>(null);

  const { data, memuat, galat, muatUlang } = useData<ResponsTenderSubkon>("/api/v1/tender-subkon");
  const daftar = useMemo(() => data?.tender ?? [], [data]);

  const tersaring = useMemo(() => {
    const urut = [...daftar].sort((a, b) => (b.tanggal ?? "").localeCompare(a.tanggal ?? ""));
    return filter === "semua" ? urut : urut.filter((t) => t.status === filter);
  }, [daftar, filter]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--gap-bagian)" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
        <h1 style={{ fontSize: 20, fontWeight: 700, color: "var(--text-primary)", margin: 0 }}>
          Tender Subkontraktor
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
          <Plus size={15} aria-hidden="true" /> Buka Tender
        </button>
      </div>

      <SegmentedTab
        opsi={[
          { value: "semua", label: "Semua" },
          { value: "terkirim", label: "Terbuka" },
          { value: "selesai", label: "Selesai" },
          { value: "draft", label: "Draft" },
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
        <EmptyState icon={Gavel} judul="Gagal memuat tender" deskripsi={pesanGalat(galat as GalatApi, "Coba muat ulang halaman ini.")} />
      )}

      {!memuat && !galat && tersaring.length === 0 && (
        <EmptyState
          icon={Gavel}
          judul="Belum ada tender subkontraktor"
          deskripsi="Tender mencatat siapa yang diundang menawar, berapa penawarannya, dan kenapa satu di antaranya dipilih — jejak yang dicari saat borongan dipersoalkan."
        />
      )}

      {!memuat && tersaring.map((t) => (
        <button
          key={t.id}
          type="button"
          onClick={() => setDetailId(t.id)}
          style={{
            textAlign: "left", width: "100%", background: "var(--surface)", borderRadius: 16,
            padding: "var(--pad-kartu-lega)", border: "1px solid var(--border)", cursor: "pointer",
            display: "flex", flexDirection: "column", gap: 6,
          }}
        >
          <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4, flexWrap: "wrap" }}>
                <span style={{ fontSize: 14, fontWeight: 700, color: "var(--text-primary)" }}>{t.nomor}</span>
                <StatusBadge status={VARIAN_STATUS[t.status]} label={LABEL_STATUS[t.status]} />
              </div>
              <div style={{ fontSize: 13, color: "var(--text-primary)" }}>{t.judul}</div>
              <div style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: 2 }}>
                {t.proyek?.name ?? "—"} · dibuka {fmtDate(t.tanggal)}
              </div>
            </div>
            <div style={{ textAlign: "right", flexShrink: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: "var(--text-primary)" }}>
                {jumlahPenawaran(t) === 0 ? "—" : jumlahPenawaran(t)}
              </div>
              <div style={{ fontSize: 10, color: "var(--text-muted)" }}>penawaran</div>
            </div>
          </div>
        </button>
      ))}

      <BottomSheet terbuka={showForm} onTutup={() => setShowForm(false)} judul="Buka Tender Baru">
        <FormTender
          onBatal={() => setShowForm(false)}
          onSukses={() => { setShowForm(false); void muatUlang(); }}
        />
      </BottomSheet>

      <BottomSheet terbuka={!!detailId} onTutup={() => setDetailId(null)} judul="Detail Tender">
        {detailId && (
          <DetailTender
            id={detailId}
            onUbah={() => { void muatUlang(); }}
          />
        )}
      </BottomSheet>
    </div>
  );
}

function DetailTender({ id, onUbah }: { id: string; onUbah: () => void }) {
  const { data, memuat, galat, muatUlang } = useData<ResponsTenderDetail>(`/api/v1/tender-subkon/${id}`);
  const [calon, setCalon] = useState<PenawaranTenderBanding | null>(null);

  if (memuat) return <SkeletonCard tinggi={200} />;
  if (galat || !data) {
    return <EmptyState icon={Gavel} judul="Gagal memuat detail" deskripsi={pesanGalat(galat as GalatApi, "Coba muat ulang.")} />;
  }

  const { tender, perbandingan: b } = data;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div>
        <div style={{ fontSize: 15, fontWeight: 700, color: "var(--text-primary)" }}>{tender.nomor} — {tender.judul}</div>
        <div style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: 3 }}>{tender.proyek?.name ?? "—"}</div>
        {tender.lingkup_kerja && (
          <div style={{ fontSize: 13, color: "var(--text-primary)", marginTop: 8, lineHeight: 1.5 }}>{tender.lingkup_kerja}</div>
        )}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        <div style={{ background: "var(--surface-subtle)", borderRadius: 10, padding: 10 }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase" }}>Perkiraan</div>
          <div style={{ fontSize: 14, fontWeight: 700, color: "var(--text-primary)", marginTop: 2 }}>{rupiah(tender.nilai_perkiraan)}</div>
        </div>
        <div style={{ background: "var(--surface-subtle)", borderRadius: 10, padding: 10 }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase" }}>Termurah</div>
          <div style={{ fontSize: 14, fontWeight: 700, color: "var(--text-primary)", marginTop: 2 }}>{rupiah(b.nilai_termurah)}</div>
        </div>
      </div>

      {b.pemenang_bukan_termurah && (
        <div style={{ background: "var(--warning-bg)", border: "1px solid var(--warning-border)", borderRadius: 10, padding: 10, display: "flex", gap: 8, alignItems: "flex-start" }}>
          <TriangleAlert size={14} aria-hidden="true" style={{ color: "var(--warning)", flexShrink: 0, marginTop: 1 }} />
          <div style={{ fontSize: 12, color: "var(--on-warning-bg)", lineHeight: 1.5 }}>
            Pemenang bukan penawar termurah — selisih {rupiah(b.selisih_pemenang_termurah)}.
            {tender.alasan_pilih && <> Alasan: <em>&ldquo;{tender.alasan_pilih}&rdquo;</em></>}
          </div>
        </div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <span style={{ fontSize: 12, fontWeight: 700, color: "var(--text-secondary)" }}>Penawaran ({b.penawaran.length})</span>
        {b.penawaran.length === 0 && (
          <div style={{ fontSize: 12, color: "var(--text-muted)" }}>Belum ada mandor yang mengajukan harga.</div>
        )}
        {b.penawaran.map((p) => (
          <div key={p.id} style={{
            border: "1px solid var(--border)", borderRadius: 12, padding: "var(--pad-kartu)",
            background: p.menang ? "var(--success-bg)" : "var(--surface)",
          }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
              <span style={{ fontSize: 13, fontWeight: 700, color: "var(--text-primary)", display: "flex", alignItems: "center", gap: 5 }}>
                {p.worker_name}
                {p.menang && <Trophy size={13} aria-hidden="true" style={{ color: "var(--success)" }} />}
              </span>
              <span style={{ fontSize: 13, fontWeight: 700, color: "var(--text-primary)" }}>
                {p.nilai === null ? "tidak menawar" : rupiah(p.nilai)}
              </span>
            </div>
            <div style={{ fontSize: 11, color: "var(--text-secondary)", marginTop: 3 }}>
              {p.waktu_kerja_hari !== null && `${p.waktu_kerja_hari} hari · `}
              {p.selisih_termurah_pct === 0 ? "termurah" : p.selisih_termurah_pct !== null ? `${p.selisih_termurah_pct > 0 ? "+" : ""}${p.selisih_termurah_pct.toFixed(1)}% vs termurah` : ""}
            </div>
            {p.catatan && <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 3 }}>{p.catatan}</div>}

            {tender.status === "terkirim" && !p.menang && p.nilai !== null && p.status !== "gugur" && (
              <button
                type="button" onClick={() => setCalon(p)}
                style={{
                  marginTop: 8, minHeight: 36, padding: "0 12px", borderRadius: "var(--portal-radius-pill)",
                  border: "1px solid var(--navy)", background: "var(--navy-light)", color: "var(--navy)",
                  fontSize: 12, fontWeight: 700, cursor: "pointer",
                }}
              >
                Tetapkan sebagai pemenang
              </button>
            )}
          </div>
        ))}
      </div>

      {tender.status === "terkirim" && b.pemenang && (
        <TutupTenderAksi id={id} onUbah={() => { void muatUlang(); onUbah(); }} />
      )}

      {calon && (
        <DialogPenetapan
          id={id}
          calon={calon}
          bukanTermurah={calon.nilai !== null && b.nilai_termurah !== null && calon.nilai > b.nilai_termurah}
          onTutup={() => setCalon(null)}
          onSukses={() => { setCalon(null); void muatUlang(); onUbah(); }}
        />
      )}
    </div>
  );
}

function DialogPenetapan({ id, calon, bukanTermurah, onTutup, onSukses }: {
  id: string; calon: PenawaranTenderBanding; bukanTermurah: boolean; onTutup: () => void; onSukses: () => void;
}) {
  const [alasan, setAlasan] = useState("");
  const [mengirim, setMengirim] = useState(false);
  const [galat, setGalat] = useState<string | null>(null);
  const minAlasan = bukanTermurah ? 25 : 10;
  const cukup = alasan.trim().length >= minAlasan;

  async function tetapkan() {
    if (!cukup) return;
    setMengirim(true);
    setGalat(null);
    try {
      await api.patch(`/api/v1/tender-subkon/${id}/pemenang`, { penawaran_id: calon.id, alasan: alasan.trim() });
      invalidasi("/api/v1/tender-subkon");
      onSukses();
    } catch (e) {
      setGalat(pesanGalat(e as GalatApi, "Gagal menetapkan pemenang"));
    } finally {
      setMengirim(false);
    }
  }

  return (
    <BottomSheet terbuka onTutup={onTutup} judul={`Tetapkan ${calon.worker_name}`}>
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {bukanTermurah && (
          <div style={{ background: "var(--warning-bg)", border: "1px solid var(--warning-border)", borderRadius: 10, padding: 10, fontSize: 12, color: "var(--on-warning-bg)", lineHeight: 1.5 }}>
            Ini bukan penawar termurah. Sering ada alasan sah — rekam jejak, kapasitas, waktu kerja — tapi harus tertulis sekarang.
          </div>
        )}

        <label style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>
          Alasan pemilihan
          <textarea
            value={alasan} onChange={(e) => setAlasan(e.target.value)} rows={3}
            placeholder={bukanTermurah ? "mis. Satu-satunya yang pernah mengerjakan bore pile tanah lunak, sanggup 90 hari." : "mis. Termurah dan memenuhi seluruh syarat teknis."}
            style={{ width: "100%", marginTop: 6, padding: 12, borderRadius: 12, border: "1px solid var(--border)", fontSize: 14, fontFamily: "inherit", boxSizing: "border-box", resize: "vertical" }}
          />
          <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 4 }}>{alasan.trim().length}/{minAlasan} karakter minimum</div>
        </label>

        {galat && (
          <div role="alert" style={{ fontSize: 12, color: "var(--on-danger-bg)", padding: 10, borderRadius: 10, background: "var(--danger-bg)", border: "1px solid var(--danger-border)" }}>
            {galat}
          </div>
        )}

        <div style={{ display: "flex", gap: 10 }}>
          <button
            type="button" onClick={onTutup} disabled={mengirim}
            style={{
              flex: 1, minHeight: 48, padding: "0 14px", borderRadius: "var(--portal-radius-pill)",
              background: "var(--surface-subtle)", color: "var(--text-secondary)", border: "1px solid var(--border)",
              fontSize: 14, fontWeight: 700, cursor: mengirim ? "default" : "pointer",
            }}
          >
            Batal
          </button>
          <button
            type="button" onClick={() => void tetapkan()} disabled={mengirim || !cukup}
            style={(mengirim || !cukup) ? {
              flex: 1, minHeight: 48, padding: "0 14px", borderRadius: "var(--portal-radius-pill)",
              background: "var(--surface-subtle)", color: "var(--text-muted)", border: "none",
              fontSize: 14, fontWeight: 700, cursor: "default",
            } : {
              flex: 1, minHeight: 48, padding: "0 14px", borderRadius: "var(--portal-radius-pill)",
              background: "var(--grad-aksen)", color: "var(--on-navy)", border: "none",
              fontSize: 14, fontWeight: 700, cursor: "pointer",
            }}
          >
            {mengirim ? "Menyimpan…" : "Tetapkan pemenang"}
          </button>
        </div>
      </div>
    </BottomSheet>
  );
}

function TutupTenderAksi({ id, onUbah }: { id: string; onUbah: () => void }) {
  const [mengirim, setMengirim] = useState(false);
  const [galat, setGalat] = useState<string | null>(null);

  async function tutup() {
    setMengirim(true);
    setGalat(null);
    try {
      await api.patch(`/api/v1/tender-subkon/${id}/tutup`, {});
      invalidasi("/api/v1/tender-subkon");
      onUbah();
    } catch (e) {
      setGalat(pesanGalat(e as GalatApi, "Gagal menutup tender"));
    } finally {
      setMengirim(false);
    }
  }

  return (
    <div style={{ borderTop: "1px solid var(--border)", paddingTop: 12, display: "flex", flexDirection: "column", gap: 8 }}>
      <div style={{ fontSize: 12, color: "var(--text-secondary)", lineHeight: 1.5, display: "flex", alignItems: "flex-start", gap: 6 }}>
        <Lock size={13} aria-hidden="true" style={{ marginTop: 1, flexShrink: 0 }} />
        Menutup tender mengunci keputusan ini — pemenang dan nilainya tak bisa diubah lagi.
      </div>
      {galat && (
        <div role="alert" style={{ fontSize: 12, color: "var(--on-danger-bg)", padding: 10, borderRadius: 10, background: "var(--danger-bg)", border: "1px solid var(--danger-border)" }}>
          {galat}
        </div>
      )}
      <button
        type="button" onClick={() => void tutup()} disabled={mengirim}
        style={mengirim ? {
          minHeight: 44, padding: "0 14px", borderRadius: "var(--portal-radius-pill)",
          background: "var(--surface-subtle)", color: "var(--text-muted)", border: "none",
          fontSize: 13, fontWeight: 700, cursor: "default",
        } : {
          minHeight: 44, padding: "0 14px", borderRadius: "var(--portal-radius-pill)",
          background: "var(--grad-aksen)", color: "var(--on-navy)", border: "none",
          fontSize: 13, fontWeight: 700, cursor: "pointer",
        }}
      >
        {mengirim ? "Menutup…" : "Tutup tender"}
      </button>
    </div>
  );
}

function FormTender({ onBatal, onSukses }: { onBatal: () => void; onSukses: () => void }) {
  const { data: dataProyek } = useData<RespProyek>("/api/v1/projects");
  const proyek = dataProyek?.projects ?? [];

  const [projectId, setProjectId] = useState("");
  const [nomor, setNomor] = useState("");
  const [judul, setJudul] = useState("");
  const [lingkup, setLingkup] = useState("");
  const [nilaiPerkiraan, setNilaiPerkiraan] = useState("");
  const [batasMasuk, setBatasMasuk] = useState("");
  const [mengirim, setMengirim] = useState(false);
  const [galatForm, setGalatForm] = useState<string | null>(null);

  async function simpan() {
    if (!projectId || !nomor.trim() || !judul.trim()) {
      setGalatForm("Proyek, nomor, dan judul wajib diisi.");
      return;
    }
    setMengirim(true);
    setGalatForm(null);
    try {
      await api.post("/api/v1/tender-subkon", {
        project_id: projectId,
        nomor: nomor.trim(),
        judul: judul.trim(),
        lingkup_kerja: lingkup.trim() || undefined,
        nilai_perkiraan: nilaiPerkiraan.trim() === "" ? undefined : Number(nilaiPerkiraan),
        batas_masuk: batasMasuk || undefined,
      });
      invalidasi("/api/v1/tender-subkon");
      onSukses();
    } catch (e) {
      setGalatForm(pesanGalat(e as GalatApi, "Gagal membuka tender"));
    } finally {
      setMengirim(false);
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <label style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>
        Proyek
        <select
          value={projectId} onChange={(e) => setProjectId(e.target.value)}
          style={{ width: "100%", marginTop: 6, minHeight: 44, padding: "0 12px", borderRadius: 12, border: "1px solid var(--border)", fontSize: 14, background: "var(--surface)", color: "var(--text-primary)" }}
        >
          <option value="">-- Pilih proyek --</option>
          {proyek.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
      </label>

      <label style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>
        Nomor tender
        <input
          value={nomor} onChange={(e) => setNomor(e.target.value)} placeholder="mis. TND-2026-004"
          style={{ width: "100%", marginTop: 6, minHeight: 44, padding: "0 12px", borderRadius: 12, border: "1px solid var(--border)", fontSize: 14, background: "var(--surface)", color: "var(--text-primary)", boxSizing: "border-box" }}
        />
      </label>

      <label style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>
        Judul
        <input
          value={judul} onChange={(e) => setJudul(e.target.value)} placeholder="mis. Pekerjaan atap baja"
          style={{ width: "100%", marginTop: 6, minHeight: 44, padding: "0 12px", borderRadius: 12, border: "1px solid var(--border)", fontSize: 14, background: "var(--surface)", color: "var(--text-primary)", boxSizing: "border-box" }}
        />
      </label>

      <label style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>
        Lingkup kerja (opsional)
        <textarea
          value={lingkup} onChange={(e) => setLingkup(e.target.value)} rows={2}
          style={{ width: "100%", marginTop: 6, padding: 12, borderRadius: 12, border: "1px solid var(--border)", fontSize: 14, fontFamily: "inherit", boxSizing: "border-box", resize: "vertical" }}
        />
      </label>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        <label style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>
          Perkiraan nilai (opsional)
          <input
            type="number" min={0} value={nilaiPerkiraan} onChange={(e) => setNilaiPerkiraan(e.target.value)}
            style={{ width: "100%", marginTop: 6, minHeight: 44, padding: "0 12px", borderRadius: 12, border: "1px solid var(--border)", fontSize: 14, background: "var(--surface)", color: "var(--text-primary)", boxSizing: "border-box" }}
          />
        </label>
        <label style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>
          Batas masuk (opsional)
          <input
            type="date" value={batasMasuk} onChange={(e) => setBatasMasuk(e.target.value)}
            style={{ width: "100%", marginTop: 6, minHeight: 44, padding: "0 12px", borderRadius: 12, border: "1px solid var(--border)", fontSize: 14, background: "var(--surface)", color: "var(--text-primary)", boxSizing: "border-box" }}
          />
        </label>
      </div>

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
          {mengirim ? "Menyimpan…" : "Buka Tender"}
        </button>
      </div>
    </div>
  );
}
