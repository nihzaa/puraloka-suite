"use client";

// ============================================================================
// Surat Perintah Kerja — versi PM, portal mobile (Tahap 1, Task 7).
//
// PM PUNYA mandor:view (list/pdf/addendum) + spk:kelola (terbitkan/transisi
// status/addendum) TAPI TIDAK PUNYA spk:tandatangan — SoD eksplisit
// (dikonfirmasi Task 5 + baca langsung `apps/api/src/routes/v1/spk.ts`
// L259-348): hanya admin/direktur boleh membubuhkan TANDA TANGAN PIHAK
// PENERBIT (satu route PATCH .../status yang membedakan dua operasi lewat
// body — transisi status BIASA vs pembubuhan tanda tangan, dan tanda tangan
// itu sendiri terbelah dua lagi lewat `pihak`).
//
// Karena itu tombol tanda tangan PENERBIT TIDAK PERNAH dirender di sini.
// Tanda tangan PELAKSANA dibiarkan ADA (tak butuh izin khusus di backend,
// dijaga dokumen/foto fisik bukan permission) — tapi portal PM jarang
// berperan sebagai pelaksana, jadi kartu hanya menampilkan STATUSnya
// (sudah/belum) tanpa tombol aksi; membubuhkannya tetap tugas subkon sendiri
// (mis. lewat portal mereka sendiri, di luar cakupan task ini).
//
// Cetak PDF: tombol "Unduh PDF" yang membuka tab baru (endpoint mengembalikan
// application/pdf attachment) — BUKAN preview inline, sesuai brief Step 3.
//
// Endpoint (dikonfirmasi Task 5 + baca kode):
//   GET   /api/v1/spk                       — list, butuh mandor:view
//   GET   /api/v1/spk/:id.pdf                — cetak, butuh mandor:view
//   GET   /api/v1/spk/:id/addendum           — list addendum, butuh mandor:view
//   POST  /api/v1/spk                        — terbitkan, butuh spk:kelola
//   PATCH /api/v1/spk/:id/status             — transisi status (status only,
//                                               TANPA ttd_url/pihak — supaya
//                                               tak pernah membuka cabang
//                                               tanda tangan penerbit)
//   POST  /api/v1/spk/:id/addendum           — ajukan addendum, spk:kelola
//   PATCH /api/v1/spk/addendum/:id/status    — ubah status addendum, spk:kelola
// ============================================================================

import { useMemo, useState } from "react";
import { FileSignature, Plus, Download, Lock, Clock, FilePlus2 } from "lucide-react";
import { useData, invalidasi } from "@/lib/data-cache";
import { api } from "@/lib/api";
import BottomSheet from "@/components/portal/BottomSheet";
import StatusBadge, { type VarianStatus } from "@/components/portal/StatusBadge";
import EmptyState from "@/components/portal/EmptyState";
import SkeletonCard from "@/components/portal/SkeletonCard";
import SegmentedTab from "@/components/portal/SegmentedTab";
import type {
  Spk, ResponsSpk, SpkAddendum, ResponsSpkAddendum, GalatApi,
} from "../../_bersama/tipe";
import { pesanGalat } from "../../_bersama/tipe";

interface ScopeOpsi {
  id: string; scope_name: string; payment_system: string; status: string;
  assignment: { mandor?: { id: string; name: string } | null; project?: { id: string; name: string } | null } | null;
}
interface RespScopes { scopes: ScopeOpsi[] }

const rupiah = (n: number | string | null | undefined) =>
  n === null || n === undefined || n === "" ? "—" : "Rp " + Math.round(Number(n)).toLocaleString("id-ID");

const fmtDate = (s: string | null) => {
  if (!s) return "—";
  return new Date(s).toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric" });
};

const LABEL_STATUS: Record<Spk["status"], string> = {
  draf: "Draf", diterbitkan: "Diterbitkan", ditandatangani: "Ditandatangani", dibatalkan: "Dibatalkan",
};
const VARIAN_STATUS: Record<Spk["status"], VarianStatus> = {
  draf: "netral", diterbitkan: "pending", ditandatangani: "approved", dibatalkan: "rejected",
};

export default function PmSpkPage() {
  const [filter, setFilter] = useState<"semua" | Spk["status"]>("semua");
  const [showForm, setShowForm] = useState(false);
  const [detailSpk, setDetailSpk] = useState<Spk | null>(null);

  const { data, memuat, galat, muatUlang } = useData<ResponsSpk>("/api/v1/spk");
  const daftar = useMemo(() => data?.spk ?? [], [data]);

  const tersaring = useMemo(() => {
    const bobot: Record<Spk["status"], number> = { diterbitkan: 0, draf: 1, ditandatangani: 2, dibatalkan: 3 };
    const urut = [...daftar].sort((a, b) => bobot[a.status] - bobot[b.status] || b.tanggal_terbit.localeCompare(a.tanggal_terbit));
    return filter === "semua" ? urut : urut.filter((s) => s.status === filter);
  }, [daftar, filter]);

  const terlambat = daftar.filter((s) => (s.denda?.hariTerlambat ?? 0) > 0);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--gap-bagian)" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
        <h1 style={{ fontSize: 20, fontWeight: 700, color: "var(--text-primary)", margin: 0 }}>
          Surat Perintah Kerja
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
          <Plus size={15} aria-hidden="true" /> Terbitkan
        </button>
      </div>

      {terlambat.length > 0 && (
        <div role="status" style={{ background: "var(--danger-bg)", border: "1px solid var(--danger-border)", borderRadius: 12, padding: "var(--pad-kartu)", fontSize: 13, color: "var(--on-danger-bg)", display: "flex", alignItems: "flex-start", gap: 8 }}>
          <Clock size={15} aria-hidden="true" style={{ marginTop: 1, flexShrink: 0 }} />
          <span><strong>{terlambat.length}</strong> SPK melewati tenggat. Denda dihitung ulang tiap kali dibuka — bukan disimpan.</span>
        </div>
      )}

      <SegmentedTab
        opsi={[
          { value: "semua", label: "Semua" },
          { value: "diterbitkan", label: "Terbit" },
          { value: "draf", label: "Draf" },
          { value: "ditandatangani", label: "Sah" },
        ]}
        aktif={filter}
        onUbah={(v) => setFilter(v as typeof filter)}
      />

      {memuat && (
        <div style={{ display: "flex", flexDirection: "column", gap: "var(--gap-grid)" }}>
          <SkeletonCard tinggi={130} />
          <SkeletonCard tinggi={130} />
        </div>
      )}

      {!memuat && galat && (
        <EmptyState icon={FileSignature} judul="Gagal memuat SPK" deskripsi={pesanGalat(galat as GalatApi, "Coba muat ulang halaman ini.")} />
      )}

      {!memuat && !galat && tersaring.length === 0 && (
        <EmptyState
          icon={FileSignature}
          judul="Belum ada surat perintah kerja"
          deskripsi="SPK adalah perintah kerja resmi ke subkontraktor: lingkup, nilai, jangka waktu, dan sanksi keterlambatan — tertulis, bukan hanya diingat."
        />
      )}

      {!memuat && tersaring.map((s) => (
        <button
          key={s.id}
          type="button"
          onClick={() => setDetailSpk(s)}
          style={{
            textAlign: "left", width: "100%", background: "var(--surface)", borderRadius: 16,
            padding: "var(--pad-kartu-lega)", border: "1px solid var(--border)", cursor: "pointer",
            display: "flex", flexDirection: "column", gap: 6,
          }}
        >
          <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4, flexWrap: "wrap" }}>
                <span style={{ fontSize: 14, fontWeight: 700, color: "var(--text-primary)" }}>{s.nomor}</span>
                <StatusBadge status={VARIAN_STATUS[s.status]} label={LABEL_STATUS[s.status]} />
              </div>
              <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>
                {s.scope?.scope_name ?? "—"} · {fmtDate(s.tanggal_mulai)} s.d. {fmtDate(s.tanggal_selesai)}
              </div>
            </div>
            <div style={{ textAlign: "right", flexShrink: 0 }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: "var(--text-primary)" }}>{rupiah(s.nilai_kontrak)}</div>
            </div>
          </div>
          {s.denda && s.denda.hariTerlambat > 0 && (
            <div style={{ fontSize: 12, color: "var(--on-danger-bg)", background: "var(--danger-bg)", borderRadius: 8, padding: "6px 10px" }}>
              Terlambat {s.denda.hariTerlambat} hari · denda {rupiah(s.denda.dendaTerbatas)}
              {s.denda.terkenaBatas && ` (dibatasi dari ${rupiah(s.denda.dendaKotor)})`}
            </div>
          )}
        </button>
      ))}

      <BottomSheet terbuka={showForm} onTutup={() => setShowForm(false)} judul="Terbitkan SPK">
        <FormTerbitSpk
          onBatal={() => setShowForm(false)}
          onSukses={() => { setShowForm(false); void muatUlang(); }}
        />
      </BottomSheet>

      <BottomSheet terbuka={!!detailSpk} onTutup={() => setDetailSpk(null)} judul={detailSpk?.nomor ?? "Detail SPK"}>
        {detailSpk && (
          <DetailSpk
            spk={detailSpk}
            onUbah={() => void muatUlang()}
          />
        )}
      </BottomSheet>
    </div>
  );
}

function DetailSpk({ spk: s, onUbah }: { spk: Spk; onUbah: () => void }) {
  const [mengirim, setMengirim] = useState(false);
  const [galatAksi, setGalatAksi] = useState<string | null>(null);

  const { data: dataAddendum, muatUlang: muatUlangAddendum } =
    useData<ResponsSpkAddendum>(s.status === "ditandatangani" ? `/api/v1/spk/${s.id}/addendum` : null);

  async function ubahStatus(status: "diterbitkan" | "ditandatangani") {
    setMengirim(true);
    setGalatAksi(null);
    try {
      // Body HANYA `status` — tidak pernah `ttd_url`/`pihak`, supaya cabang
      // tanda tangan (yang membutuhkan spk:tandatangan untuk pihak penerbit)
      // tak pernah terbuka dari sini.
      await api.patch(`/api/v1/spk/${s.id}/status`, { status });
      invalidasi("/api/v1/spk");
      onUbah();
    } catch (e) {
      setGalatAksi(pesanGalat(e as GalatApi, "Gagal mengubah status SPK"));
    } finally {
      setMengirim(false);
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div>
        <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 4 }}>
          Lingkup pekerjaan
        </div>
        <div style={{ fontSize: 14, color: "var(--text-primary)", lineHeight: 1.5 }}>{s.lingkup_kerja}</div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.04em" }}>Nilai kontrak</div>
          <div style={{ fontSize: 16, fontWeight: 700, color: "var(--text-primary)", marginTop: 3 }}>{rupiah(s.nilai_kontrak)}</div>
        </div>
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.04em" }}>Jangka waktu</div>
          <div style={{ fontSize: 13, color: "var(--text-primary)", marginTop: 3 }}>{fmtDate(s.tanggal_mulai)} s.d. {fmtDate(s.tanggal_selesai)}</div>
        </div>
      </div>

      {s.denda_per_hari !== null && (
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.04em" }}>Sanksi keterlambatan</div>
          <div style={{ fontSize: 13, color: "var(--text-secondary)", marginTop: 3 }}>
            {rupiah(s.denda_per_hari)}/hari{s.denda_maks_pct !== null && ` · maks ${Number(s.denda_maks_pct)}% nilai kontrak`}
          </div>
        </div>
      )}

      {s.syarat_khusus && (
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.04em" }}>Syarat khusus</div>
          <div style={{ fontSize: 13, color: "var(--text-secondary)", marginTop: 3, lineHeight: 1.5 }}>{s.syarat_khusus}</div>
        </div>
      )}

      {s.alasan_batal && (
        <div style={{ padding: 10, borderRadius: 10, background: "var(--danger-bg)", color: "var(--on-danger-bg)", fontSize: 13 }}>
          <strong>Alasan pembatalan:</strong> {s.alasan_batal}
        </div>
      )}

      {/* Dua tanda tangan — status saja, TANPA tombol aksi. Tanda tangan
          penerbit butuh spk:tandatangan (PM tak punya); tanda tangan
          pelaksana secara teknis tak butuh izin khusus tapi PM jarang
          berperan sebagai pelaksana — jadi keduanya cukup status di sini. */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, padding: "10px 0", borderTop: "1px solid var(--border)", borderBottom: "1px solid var(--border)" }}>
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.04em" }}>Penerbit</div>
          <div style={{ fontSize: 12, color: s.ttd_penerbit_url ? "var(--success)" : "var(--text-muted)", marginTop: 3, fontWeight: 600 }}>
            {s.ttd_penerbit_url ? "Sudah ditandatangani" : "Butuh izin Tanda tangani SPK"}
          </div>
        </div>
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.04em" }}>Pelaksana</div>
          <div style={{ fontSize: 12, color: s.ttd_pelaksana_url ? "var(--success)" : "var(--text-muted)", marginTop: 3, fontWeight: 600 }}>
            {s.ttd_pelaksana_url ? "Sudah ditandatangani" : "Belum ditandatangani"}
          </div>
        </div>
      </div>

      <a
        href={`/api/v1/spk/${s.id}.pdf`}
        target="_blank"
        rel="noopener noreferrer"
        style={{
          display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6, minHeight: 44,
          padding: "0 16px", borderRadius: "var(--portal-radius-pill)", fontSize: 13, fontWeight: 700,
          border: "1px solid var(--navy)", background: "var(--navy-light)", color: "var(--navy)",
          textDecoration: "none",
        }}
      >
        <Download size={15} aria-hidden="true" /> Unduh PDF
      </a>

      {galatAksi && (
        <div role="alert" style={{ fontSize: 12, color: "var(--on-danger-bg)", padding: 10, borderRadius: 10, background: "var(--danger-bg)", border: "1px solid var(--danger-border)" }}>
          {galatAksi}
        </div>
      )}

      {s.status === "draf" && (
        <button
          type="button" onClick={() => void ubahStatus("diterbitkan")} disabled={mengirim}
          style={mengirim ? {
            minHeight: 48, padding: "0 14px", borderRadius: "var(--portal-radius-pill)",
            background: "var(--surface-subtle)", color: "var(--text-muted)", border: "none",
            fontSize: 14, fontWeight: 700, cursor: "default",
          } : {
            minHeight: 48, padding: "0 14px", borderRadius: "var(--portal-radius-pill)",
            background: "var(--grad-aksen)", color: "var(--on-navy)", border: "none",
            fontSize: 14, fontWeight: 700, cursor: "pointer",
          }}
        >
          {mengirim ? "Menerbitkan…" : "Terbitkan SPK"}
        </button>
      )}

      {s.status === "diterbitkan" && (
        <button
          type="button" onClick={() => void ubahStatus("ditandatangani")}
          disabled={mengirim || !s.ttd_penerbit_url || !s.ttd_pelaksana_url}
          title={(!s.ttd_penerbit_url || !s.ttd_pelaksana_url) ? "Butuh tanda tangan kedua pihak" : undefined}
          style={{
            minHeight: 48, padding: "0 14px", borderRadius: "var(--portal-radius-pill)",
            background: (mengirim || !s.ttd_penerbit_url || !s.ttd_pelaksana_url) ? "var(--surface-subtle)" : "var(--grad-aksen)",
            color: (mengirim || !s.ttd_penerbit_url || !s.ttd_pelaksana_url) ? "var(--text-muted)" : "var(--on-navy)",
            border: "none", fontSize: 14, fontWeight: 700,
            cursor: (mengirim || !s.ttd_penerbit_url || !s.ttd_pelaksana_url) ? "default" : "pointer",
          }}
        >
          Sahkan kontrak
        </button>
      )}

      {s.status === "ditandatangani" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <div style={{ fontSize: 12, color: "var(--text-muted)", display: "flex", alignItems: "center", gap: 6 }}>
            <Lock size={12} aria-hidden="true" /> Nilai, lingkup, dan denda terkunci. Ajukan addendum bila lingkupnya berubah.
          </div>
          <FormAddendum spkId={s.id} addendum={dataAddendum?.addendum ?? []} onSukses={() => void muatUlangAddendum()} />
        </div>
      )}
    </div>
  );
}

function FormAddendum({ spkId, addendum, onSukses }: { spkId: string; addendum: SpkAddendum[]; onSukses: () => void }) {
  const [showForm, setShowForm] = useState(false);
  const [alasan, setAlasan] = useState("");
  const [lingkup, setLingkup] = useState("");
  const [nilai, setNilai] = useState("");
  const [hari, setHari] = useState("");
  const [mengirim, setMengirim] = useState(false);
  const [galatForm, setGalatForm] = useState<string | null>(null);

  async function simpan() {
    if (!alasan.trim()) {
      setGalatForm("Alasan wajib diisi.");
      return;
    }
    setMengirim(true);
    setGalatForm(null);
    try {
      await api.post(`/api/v1/spk/${spkId}/addendum`, {
        alasan: alasan.trim(),
        lingkup_tambahan: lingkup.trim() || undefined,
        nilai_delta: nilai.trim() === "" ? 0 : Number(nilai.replace(/[^\d-]/g, "")),
        hari_delta: hari.trim() === "" ? 0 : Number(hari.replace(/[^\d-]/g, "")),
      });
      setShowForm(false);
      setAlasan(""); setLingkup(""); setNilai(""); setHari("");
      onSukses();
    } catch (e) {
      setGalatForm(pesanGalat(e as GalatApi, "Gagal mengajukan addendum"));
    } finally {
      setMengirim(false);
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {addendum.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {addendum.map((a) => (
            <div key={a.id} style={{
              fontSize: 12, padding: 8, borderRadius: 8, background: "var(--surface-subtle)",
              opacity: a.status === "dibatalkan" ? 0.55 : 1,
            }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                <strong style={{ color: "var(--text-primary)", textDecoration: a.status === "dibatalkan" ? "line-through" : undefined }}>{a.nomor}</strong>
                <span style={{ color: Number(a.nilai_delta) > 0 ? "var(--success)" : Number(a.nilai_delta) < 0 ? "var(--danger)" : "var(--text-muted)", fontWeight: 700 }}>
                  {Number(a.nilai_delta) === 0 ? "—" : `${Number(a.nilai_delta) > 0 ? "+" : "−"}${Math.abs(Math.round(Number(a.nilai_delta))).toLocaleString("id-ID")}`}
                </span>
              </div>
              <div style={{ color: "var(--text-secondary)", marginTop: 2 }}>{a.alasan}</div>
            </div>
          ))}
        </div>
      )}

      {!showForm ? (
        <button
          type="button" onClick={() => setShowForm(true)}
          style={{
            display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6, minHeight: 40,
            padding: "0 14px", borderRadius: "var(--portal-radius-pill)", border: "1px dashed var(--border)",
            background: "transparent", color: "var(--text-secondary)", fontSize: 12, fontWeight: 700, cursor: "pointer",
          }}
        >
          <FilePlus2 size={13} aria-hidden="true" /> Ajukan addendum
        </button>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10, border: "1px solid var(--border)", borderRadius: 12, padding: "var(--pad-kartu)" }}>
          <label style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>
            Alasan
            <textarea
              value={alasan} onChange={(e) => setAlasan(e.target.value)} rows={2}
              placeholder="Kenapa lingkup/nilai/waktu berubah"
              style={{ width: "100%", marginTop: 6, padding: 12, borderRadius: 12, border: "1px solid var(--border)", fontSize: 14, fontFamily: "inherit", boxSizing: "border-box", resize: "vertical" }}
            />
          </label>
          <label style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>
            Lingkup tambahan (opsional)
            <textarea
              value={lingkup} onChange={(e) => setLingkup(e.target.value)} rows={2}
              style={{ width: "100%", marginTop: 6, padding: 12, borderRadius: 12, border: "1px solid var(--border)", fontSize: 14, fontFamily: "inherit", boxSizing: "border-box", resize: "vertical" }}
            />
          </label>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <label style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>
              Selisih nilai (Rp)
              <input
                value={nilai} onChange={(e) => setNilai(e.target.value)} inputMode="numeric"
                placeholder="mis. 15000000 atau -5000000"
                style={{ width: "100%", marginTop: 6, minHeight: 44, padding: "0 12px", borderRadius: 12, border: "1px solid var(--border)", fontSize: 14, background: "var(--surface)", color: "var(--text-primary)", boxSizing: "border-box" }}
              />
            </label>
            <label style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>
              Selisih hari
              <input
                value={hari} onChange={(e) => setHari(e.target.value)} inputMode="numeric"
                placeholder="mis. 7"
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
              type="button" onClick={() => setShowForm(false)} disabled={mengirim}
              style={{
                flex: 1, minHeight: 44, padding: "0 14px", borderRadius: "var(--portal-radius-pill)",
                background: "var(--surface-subtle)", color: "var(--text-secondary)", border: "1px solid var(--border)",
                fontSize: 13, fontWeight: 700, cursor: mengirim ? "default" : "pointer",
              }}
            >
              Batal
            </button>
            <button
              type="button" onClick={() => void simpan()} disabled={mengirim}
              style={mengirim ? {
                flex: 1, minHeight: 44, padding: "0 14px", borderRadius: "var(--portal-radius-pill)",
                background: "var(--surface-subtle)", color: "var(--text-muted)", border: "none",
                fontSize: 13, fontWeight: 700, cursor: "default",
              } : {
                flex: 1, minHeight: 44, padding: "0 14px", borderRadius: "var(--portal-radius-pill)",
                background: "var(--grad-aksen)", color: "var(--on-navy)", border: "none",
                fontSize: 13, fontWeight: 700, cursor: "pointer",
              }}
            >
              {mengirim ? "Menyimpan…" : "Simpan sebagai draf"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function FormTerbitSpk({ onBatal, onSukses }: { onBatal: () => void; onSukses: () => void }) {
  const { data: dataScopes } = useData<RespScopes>("/api/v1/mandor/scopes");
  const scopes = dataScopes?.scopes ?? [];

  const [scopeId, setScopeId] = useState("");
  const [lingkup, setLingkup] = useState("");
  const [nilai, setNilai] = useState("");
  const [tanggalMulai, setTanggalMulai] = useState("");
  const [tanggalSelesai, setTanggalSelesai] = useState("");
  const [dendaPerHari, setDendaPerHari] = useState("");
  const [mengirim, setMengirim] = useState(false);
  const [galatForm, setGalatForm] = useState<string | null>(null);

  async function simpan() {
    if (!scopeId || !lingkup.trim() || !nilai || !tanggalMulai || !tanggalSelesai) {
      setGalatForm("Lingkup kerja, uraian, nilai, dan jangka waktu wajib diisi.");
      return;
    }
    setMengirim(true);
    setGalatForm(null);
    try {
      await api.post("/api/v1/spk", {
        work_scope_id: scopeId,
        tanggal_terbit: new Date().toISOString().slice(0, 10),
        lingkup_kerja: lingkup.trim(),
        nilai_kontrak: Number(nilai),
        tanggal_mulai: tanggalMulai,
        tanggal_selesai: tanggalSelesai,
        denda_per_hari: dendaPerHari.trim() === "" ? null : Number(dendaPerHari),
      });
      invalidasi("/api/v1/spk");
      onSukses();
    } catch (e) {
      setGalatForm(pesanGalat(e as GalatApi, "Gagal menerbitkan SPK"));
    } finally {
      setMengirim(false);
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ fontSize: 12, color: "var(--text-muted)", lineHeight: 1.5 }}>
        SPK tersimpan sebagai draf lebih dulu, belum mengikat siapa pun. Terbitkan setelah isinya dicek.
      </div>

      <label style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>
        Lingkup kerja (proyek)
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
      </label>

      <label style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>
        Uraian pekerjaan
        <textarea
          value={lingkup} onChange={(e) => setLingkup(e.target.value)} rows={2}
          placeholder="cth: Pekerjaan struktur beton lantai 2 — kolom, balok, pelat"
          style={{ width: "100%", marginTop: 6, padding: 12, borderRadius: 12, border: "1px solid var(--border)", fontSize: 14, fontFamily: "inherit", boxSizing: "border-box", resize: "vertical" }}
        />
      </label>

      <label style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>
        Nilai kontrak (Rp)
        <input
          type="number" min={1} value={nilai} onChange={(e) => setNilai(e.target.value)} placeholder="0"
          style={{ width: "100%", marginTop: 6, minHeight: 44, padding: "0 12px", borderRadius: 12, border: "1px solid var(--border)", fontSize: 14, background: "var(--surface)", color: "var(--text-primary)", boxSizing: "border-box" }}
        />
      </label>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        <label style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>
          Mulai kerja
          <input
            type="date" value={tanggalMulai} onChange={(e) => setTanggalMulai(e.target.value)}
            style={{ width: "100%", marginTop: 6, minHeight: 44, padding: "0 12px", borderRadius: 12, border: "1px solid var(--border)", fontSize: 14, background: "var(--surface)", color: "var(--text-primary)", boxSizing: "border-box" }}
          />
        </label>
        <label style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>
          Selesai kerja
          <input
            type="date" value={tanggalSelesai} min={tanggalMulai || undefined} onChange={(e) => setTanggalSelesai(e.target.value)}
            style={{ width: "100%", marginTop: 6, minHeight: 44, padding: "0 12px", borderRadius: 12, border: "1px solid var(--border)", fontSize: 14, background: "var(--surface)", color: "var(--text-primary)", boxSizing: "border-box" }}
          />
        </label>
      </div>

      <label style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>
        Denda per hari keterlambatan (opsional)
        <input
          type="number" min={0} value={dendaPerHari} onChange={(e) => setDendaPerHari(e.target.value)} placeholder="Kosongkan bila belum diputuskan"
          style={{ width: "100%", marginTop: 6, minHeight: 44, padding: "0 12px", borderRadius: 12, border: "1px solid var(--border)", fontSize: 14, background: "var(--surface)", color: "var(--text-primary)", boxSizing: "border-box" }}
        />
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
          {mengirim ? "Menyimpan…" : "Simpan sebagai draf"}
        </button>
      </div>
    </div>
  );
}
