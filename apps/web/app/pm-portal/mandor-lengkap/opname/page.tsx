"use client";

// ============================================================================
// Opname Bersama — versi PM, portal mobile (Tahap 1, Task 6).
//
// PM PUNYA mandor:view + opname:kelola (list, kesiapan tagih, ajukan/ukur)
// TAPI TIDAK PUNYA opname:verifikasi — SoD eksplisit: PM mengukur di
// lapangan, TIDAK memverifikasi (dikonfirmasi Task 5,
// `apps/api/src/routes/v1/opname-bersama.ts`, komentar baris 25-33).
//
// Karena itu tombol Verifikasi/Sengketakan TIDAK PERNAH dirender di sini —
// bukan disembunyikan kondisional, memang tak ada di kode. Server akan 403
// kalau dipaksa, tapi UI tak boleh menawarkan tombol yang selalu gagal.
// SwipeableCard juga TIDAK dipakai untuk alasan yang sama (brief Step 5):
// tak ada aksi biner approve/reject yang PM boleh lakukan dari kartu ini.
//
// Endpoint (dikonfirmasi Task 5):
//   GET  /api/v1/opname            — list, butuh mandor:view
//   POST /api/v1/opname            — ajukan, butuh opname:kelola
//   GET  /api/v1/opname/kesiapan   — kesiapan tagih per scope, butuh mandor:view
// ============================================================================

import { useMemo, useState, useSyncExternalStore } from "react";
import { ClipboardCheck, Plus, Ruler, Trash2 } from "lucide-react";
import { useData, invalidasi } from "@/lib/data-cache";
import { api, hasPermission } from "@/lib/api";
import BottomSheet from "@/components/portal/BottomSheet";
import KepalaPortal from "@/components/portal/KepalaPortal";
import StatusBadge, { type VarianStatus } from "@/components/portal/StatusBadge";
import EmptyState from "@/components/portal/EmptyState";
import SkeletonCard from "@/components/portal/SkeletonCard";
import SegmentedTab from "@/components/portal/SegmentedTab";
import type { OpnameBersama, ResponsOpnameBersama, ResponsKesiapanOpname, GalatApi } from "../../_bersama/tipe";
import { pesanGalat } from "../../_bersama/tipe";

interface ScopeOpsi {
  id: string; scope_name: string; payment_system: string; status: string;
  assignment: { mandor?: { id: string; name: string } | null; project?: { id: string; name: string } | null } | null;
}
interface RespScopes { scopes: ScopeOpsi[] }

interface ItemForm {
  uraian: string; satuan: string; volume_rencana: string; volume_terukur: string; pct_selesai: string; catatan: string;
}

const LABEL_STATUS: Record<OpnameBersama["status"], string> = {
  diajukan: "Menunggu verifikasi", diverifikasi: "Terverifikasi", disengketakan: "Disengketakan",
};
const VARIAN_STATUS: Record<OpnameBersama["status"], VarianStatus> = {
  diajukan: "pending", diverifikasi: "approved", disengketakan: "rejected",
};

const DASAR_ARTI: Record<OpnameBersama["dasar_pct"], string> = {
  nilai: "ditimbang nilai (volume × harga)",
  volume: "ditimbang volume",
  rata: "rata-rata polos — item belum bervolume",
};

const angka = (v: number | string | null | undefined) =>
  v === null || v === undefined || v === "" ? "—" : Number(v).toLocaleString("id-ID");

function itemKosong(): ItemForm {
  return { uraian: "", satuan: "", volume_rencana: "", volume_terukur: "", pct_selesai: "", catatan: "" };
}

// `langganan`: dipakai `useSyncExternalStore` supaya perubahan permission
// (login/switch company) tercermin tanpa reload — pola sama dengan
// `pm-portal/mandor-lengkap/penugasan/page.tsx`.
const langganan = (cb: () => void) => { window.addEventListener("storage", cb); return () => window.removeEventListener("storage", cb); };

export default function PmOpnamePage() {
  const [filter, setFilter] = useState<"semua" | "diajukan" | "diverifikasi" | "disengketakan">("semua");
  const [showForm, setShowForm] = useState(false);
  const bolehAjukan = useSyncExternalStore(
    langganan, () => hasPermission("opname:kelola"), () => false);

  const { data, memuat, galat, muatUlang } = useData<ResponsOpnameBersama>("/api/v1/opname");
  const { data: dataKesiapan } = useData<ResponsKesiapanOpname>("/api/v1/opname/kesiapan");

  const daftar = useMemo(() => {
    const semua = data?.opname ?? [];
    const bobot: Record<OpnameBersama["status"], number> = { diajukan: 0, disengketakan: 1, diverifikasi: 2 };
    const urut = [...semua].sort((a, b) => bobot[a.status] - bobot[b.status] || b.tanggal_opname.localeCompare(a.tanggal_opname));
    return filter === "semua" ? urut : urut.filter((o) => o.status === filter);
  }, [data, filter]);

  const menunggu = (data?.opname ?? []).filter((o) => o.status === "diajukan").length;
  const kesiapanMenunggu = (dataKesiapan?.kesiapan ?? []).filter((k) => k.wajib_opname && k.opname_menunggu === 0 && k.opname_terverifikasi === 0);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--gap-bagian)" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
        <KepalaPortal judul="Opname Bersama" />
        {bolehAjukan && (
          <button
            type="button"
            onClick={() => setShowForm(true)}
            style={{
              display: "inline-flex", alignItems: "center", gap: 6, minHeight: 44,
              padding: "0 16px", borderRadius: "var(--portal-radius-pill)", fontSize: 13, fontWeight: 700,
              border: "none", background: "var(--grad-aksen)", color: "var(--on-navy)", cursor: "pointer",
            }}
          >
            <Plus size={15} aria-hidden="true" /> Ajukan
          </button>
        )}
      </div>

      {menunggu > 0 && (
        <div role="status" style={{ background: "var(--warning-bg)", border: "1px solid var(--warning-border)", borderRadius: 12, padding: "var(--pad-kartu)", fontSize: 13, color: "var(--on-warning-bg)" }}>
          <strong>{menunggu}</strong> berita acara menunggu verifikasi pihak lain. Pembayaran untuk lingkup kerjanya tertahan sampai diputuskan.
        </div>
      )}

      {kesiapanMenunggu.length > 0 && (
        <div style={{ background: "var(--info-bg)", border: "1px solid var(--info-border)", borderRadius: 12, padding: "var(--pad-kartu)", fontSize: 12, color: "var(--on-info-bg)" }}>
          <strong>{kesiapanMenunggu.length}</strong> lingkup kerja wajib opname belum punya berita acara sama sekali — pembayaran borongan/progres di sana masih tertahan.
        </div>
      )}

      <SegmentedTab
        opsi={[
          { value: "semua", label: "Semua" },
          { value: "diajukan", label: "Menunggu" },
          { value: "diverifikasi", label: "Terverifikasi" },
          { value: "disengketakan", label: "Sengketa" },
        ]}
        aktif={filter}
        onUbah={(v) => setFilter(v as typeof filter)}
      />

      {memuat && (
        <div style={{ display: "flex", flexDirection: "column", gap: "var(--gap-grid)" }}>
          <SkeletonCard tinggi={160} />
          <SkeletonCard tinggi={160} />
        </div>
      )}

      {!memuat && galat && (
        <EmptyState icon={ClipboardCheck} judul="Gagal memuat berita acara" deskripsi={pesanGalat(galat as GalatApi, "Coba muat ulang halaman ini.")} />
      )}

      {!memuat && !galat && daftar.length === 0 && (
        <EmptyState
          icon={Ruler}
          judul="Belum ada berita acara opname"
          deskripsi={bolehAjukan
            ? "Opname adalah pengukuran volume terpasang yang disaksikan dua pihak. Selama belum ada yang terverifikasi, pembayaran borongan dan progres untuk lingkup kerja itu tertahan."
            : "Opname adalah pengukuran volume terpasang yang disaksikan dua pihak. Belum ada yang tercatat untuk lingkup kerja Anda."}
        />
      )}

      {!memuat && daftar.map((o) => (
        <div key={o.id} style={{ background: "var(--surface)", borderRadius: 16, border: "1px solid var(--border)", overflow: "hidden" }}>
          <div style={{ padding: "var(--pad-kartu-lega)", borderBottom: "1px solid var(--border)", display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4, flexWrap: "wrap" }}>
                <span style={{ fontSize: 14, fontWeight: 700, color: "var(--text-primary)" }}>{o.nomor}</span>
                <StatusBadge status={VARIAN_STATUS[o.status]} label={LABEL_STATUS[o.status]} />
              </div>
              <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>
                Diukur {o.tanggal_opname} oleh <strong>{o.pengukur?.name ?? "—"}</strong>
                {o.penyetuju
                  ? <> · diverifikasi <strong>{o.penyetuju.name}</strong></>
                  : o.status === "diajukan" ? <> · menunggu pihak kedua</> : null}
              </div>
            </div>
            <div style={{ textAlign: "right", flexShrink: 0 }}>
              <div style={{ fontSize: 22, fontWeight: 700, color: "var(--navy)" }}>{o.pct_selesai === null ? "—" : `${o.pct_selesai}%`}</div>
              <div style={{ fontSize: 10, color: "var(--text-muted)" }}>{DASAR_ARTI[o.dasar_pct]}</div>
            </div>
          </div>

          {o.alasan_sengketa && (
            <div style={{ padding: "10px var(--pad-kartu-lega)", borderBottom: "1px solid var(--border)", background: "var(--danger-bg)", color: "var(--on-danger-bg)", fontSize: 13 }}>
              <strong>Alasan sengketa:</strong> {o.alasan_sengketa}
            </div>
          )}

          <div style={{ padding: "var(--pad-kartu)", display: "flex", flexDirection: "column", gap: 8 }}>
            {[...o.opname_bersama_item].sort((a, b) => a.urutan - b.urutan).map((it) => (
              <div key={it.id} style={{ fontSize: 12, display: "flex", justifyContent: "space-between", gap: 8, borderBottom: "1px solid var(--border)", paddingBottom: 6 }}>
                <span style={{ color: "var(--text-primary)", flex: 1 }}>{it.uraian}</span>
                <span style={{ color: "var(--text-secondary)", flexShrink: 0 }}>
                  {angka(it.volume_terukur)} {it.satuan} · {angka(it.pct_selesai)}%
                </span>
              </div>
            ))}
          </div>

          {o.status === "diajukan" && (
            <div style={{ padding: "10px var(--pad-kartu-lega)", borderTop: "1px solid var(--border)", fontSize: 11, color: "var(--text-muted)" }}>
              Verifikasi butuh izin tersendiri — yang mengukur bukan yang menyetujui. Tidak tersedia dari Portal PM.
            </div>
          )}
        </div>
      ))}

      <BottomSheet terbuka={showForm} onTutup={() => setShowForm(false)} judul="Ajukan Opname">
        <FormOpname
          onBatal={() => setShowForm(false)}
          onSukses={() => { setShowForm(false); void muatUlang(); invalidasi("/api/v1/opname/kesiapan"); }}
        />
      </BottomSheet>
    </div>
  );
}

function FormOpname({ onBatal, onSukses }: { onBatal: () => void; onSukses: () => void }) {
  const { data: dataScopes } = useData<RespScopes>("/api/v1/mandor/scopes");
  const scopes = dataScopes?.scopes ?? [];

  const [scopeId, setScopeId] = useState("");
  const [tanggal, setTanggal] = useState(new Date().toISOString().split("T")[0]);
  const [catatan, setCatatan] = useState("");
  const [items, setItems] = useState<ItemForm[]>([itemKosong()]);
  const [mengirim, setMengirim] = useState(false);
  const [galatForm, setGalatForm] = useState<string | null>(null);

  function ubahItem(i: number, patch: Partial<ItemForm>) {
    setItems((prev) => prev.map((it, idx) => (idx === i ? { ...it, ...patch } : it)));
  }
  function tambahItem() {
    setItems((prev) => [...prev, itemKosong()]);
  }
  function hapusItem(i: number) {
    setItems((prev) => (prev.length <= 1 ? prev : prev.filter((_, idx) => idx !== i)));
  }

  async function simpan() {
    if (!scopeId) { setGalatForm("Pilih lingkup kerja yang diukur."); return; }
    if (!tanggal) { setGalatForm("Tanggal opname wajib diisi."); return; }
    for (const [i, it] of items.entries()) {
      if (!it.uraian.trim()) { setGalatForm(`Item ${i + 1}: uraian wajib diisi.`); return; }
      if (!it.satuan.trim()) { setGalatForm(`Item ${i + 1}: satuan wajib diisi.`); return; }
      if (it.volume_terukur === "" || Number.isNaN(Number(it.volume_terukur)) || Number(it.volume_terukur) < 0) {
        setGalatForm(`Item ${i + 1}: volume terukur harus angka >= 0.`); return;
      }
      const p = Number(it.pct_selesai);
      if (!Number.isFinite(p) || p < 0 || p > 100) { setGalatForm(`Item ${i + 1}: persen selesai harus 0-100.`); return; }
    }

    setMengirim(true);
    setGalatForm(null);
    try {
      await api.post("/api/v1/opname", {
        work_scope_id: scopeId,
        tanggal_opname: tanggal,
        catatan: catatan.trim() || undefined,
        item: items.map((it) => ({
          uraian: it.uraian.trim(),
          satuan: it.satuan.trim(),
          volume_rencana: it.volume_rencana === "" ? null : Number(it.volume_rencana),
          volume_terukur: Number(it.volume_terukur),
          pct_selesai: Number(it.pct_selesai),
          catatan: it.catatan.trim() || undefined,
        })),
      });
      invalidasi("/api/v1/opname");
      onSukses();
    } catch (e) {
      setGalatForm(pesanGalat(e as GalatApi, "Gagal mengajukan opname"));
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
      </label>

      <label style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>
        Tanggal opname
        <input
          type="date" value={tanggal} onChange={(e) => setTanggal(e.target.value)}
          style={{ width: "100%", marginTop: 6, minHeight: 44, padding: "0 12px", borderRadius: 12, border: "1px solid var(--border)", fontSize: 14, background: "var(--surface)", color: "var(--text-primary)", boxSizing: "border-box" }}
        />
      </label>

      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <span style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>Item yang diukur</span>
        {items.map((it, i) => (
          <div key={i} style={{ border: "1px solid var(--border)", borderRadius: 12, padding: "var(--pad-kartu)", display: "flex", flexDirection: "column", gap: 8 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: "var(--text-secondary)" }}>Item {i + 1}</span>
              {items.length > 1 && (
                <button
                  type="button" onClick={() => hapusItem(i)} aria-label={`Hapus item ${i + 1}`}
                  style={{ background: "none", border: "none", cursor: "pointer", color: "var(--danger)", padding: 4, display: "flex" }}
                >
                  <Trash2 size={14} aria-hidden="true" />
                </button>
              )}
            </div>
            <input
              value={it.uraian} onChange={(e) => ubahItem(i, { uraian: e.target.value })}
              placeholder="Uraian pekerjaan (mis: Pasangan bata as-3)"
              style={{ minHeight: 44, padding: "0 12px", borderRadius: 10, border: "1px solid var(--border)", fontSize: 13, background: "var(--surface)", color: "var(--text-primary)" }}
            />
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
              <input
                value={it.satuan} onChange={(e) => ubahItem(i, { satuan: e.target.value })}
                placeholder="Satuan (m2, m3, ls)"
                style={{ minHeight: 44, padding: "0 12px", borderRadius: 10, border: "1px solid var(--border)", fontSize: 13, background: "var(--surface)", color: "var(--text-primary)" }}
              />
              <input
                type="number" value={it.volume_rencana} onChange={(e) => ubahItem(i, { volume_rencana: e.target.value })}
                placeholder="Volume rencana"
                style={{ minHeight: 44, padding: "0 12px", borderRadius: 10, border: "1px solid var(--border)", fontSize: 13, background: "var(--surface)", color: "var(--text-primary)" }}
              />
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
              <input
                type="number" value={it.volume_terukur} onChange={(e) => ubahItem(i, { volume_terukur: e.target.value })}
                placeholder="Volume terukur *"
                style={{ minHeight: 44, padding: "0 12px", borderRadius: 10, border: "1px solid var(--border)", fontSize: 13, background: "var(--surface)", color: "var(--text-primary)" }}
              />
              <input
                type="number" min={0} max={100} value={it.pct_selesai} onChange={(e) => ubahItem(i, { pct_selesai: e.target.value })}
                placeholder="% selesai *"
                style={{ minHeight: 44, padding: "0 12px", borderRadius: 10, border: "1px solid var(--border)", fontSize: 13, background: "var(--surface)", color: "var(--text-primary)" }}
              />
            </div>
            <input
              value={it.catatan} onChange={(e) => ubahItem(i, { catatan: e.target.value })}
              placeholder="Catatan (opsional)"
              style={{ minHeight: 44, padding: "0 12px", borderRadius: 10, border: "1px solid var(--border)", fontSize: 13, background: "var(--surface)", color: "var(--text-primary)" }}
            />
          </div>
        ))}
        <button
          type="button" onClick={tambahItem}
          style={{
            display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6, minHeight: 40,
            padding: "0 14px", borderRadius: "var(--portal-radius-pill)", border: "1px dashed var(--border)",
            background: "transparent", color: "var(--text-secondary)", fontSize: 12, fontWeight: 700, cursor: "pointer",
          }}
        >
          <Plus size={13} aria-hidden="true" /> Tambah item
        </button>
      </div>

      <label style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>
        Catatan umum (opsional)
        <textarea
          value={catatan} onChange={(e) => setCatatan(e.target.value)} rows={2}
          style={{ width: "100%", marginTop: 6, padding: 12, borderRadius: 12, border: "1px solid var(--border)", fontSize: 14, fontFamily: "inherit", boxSizing: "border-box", resize: "vertical" }}
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
          type="button" onClick={simpan} disabled={mengirim}
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
          {mengirim ? "Mengajukan…" : "Ajukan Opname"}
        </button>
      </div>
    </div>
  );
}
