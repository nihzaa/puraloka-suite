"use client";

// ============================================================================
// Kasbon Tukang — versi PM, portal mobile (Tahap 1, Task 6).
//
// ⚠️ BUKAN duplikat `pm-portal/keuangan/page.tsx`. Dua entitas kasbon yang
// berbeda hidup di API ini (dikonfirmasi baca kode langsung, bukan tebakan):
//
//   `pm-portal/keuangan/page.tsx`  → tabel `kasbons`        → GET /api/v1/finance/kasbons
//                                     kasbon PROYEK, PM approve/reject (SUDAH ADA, lengkap)
//   halaman INI                    → tabel `worker_kasbons` → GET /api/v1/mandor/worker-kasbons
//                                     kasbon TUKANG dari mandornya sendiri, TANPA approval —
//                                     hanya dicicil sampai lunas (PATCH .../cicilan)
//
// Keputusan ini dicatat di commit message task ini, sesuai brief Step 4.
//
// Endpoint (dikonfirmasi Task 5, `apps/api/src/routes/v1/mandor.ts`):
//   GET   /api/v1/mandor/worker-kasbons             — list, authenticate saja (tanpa gerbang permission)
//   POST  /api/v1/mandor/worker-kasbons              — catat kasbon baru, authenticate saja
//   PATCH /api/v1/mandor/worker-kasbons/:id/cicilan  — catat cicilan, authenticate saja
// ============================================================================

import { useState } from "react";
import { Banknote, Plus } from "lucide-react";
import { useData, invalidasi } from "@/lib/data-cache";
import { api } from "@/lib/api";
import BottomSheet from "@/components/portal/BottomSheet";
import KepalaPortal from "@/components/portal/KepalaPortal";
import StatusBadge, { type VarianStatus } from "@/components/portal/StatusBadge";
import EmptyState from "@/components/portal/EmptyState";
import SkeletonCard from "@/components/portal/SkeletonCard";
import SegmentedTab from "@/components/portal/SegmentedTab";
import type { KasbonTukang, ResponsKasbonTukang, PenugasanMandor, ResponsPenugasanMandor, GalatApi } from "../../_bersama/tipe";
import { pesanGalat } from "../../_bersama/tipe";
import { Pilihan } from "@/components/pilihan";

interface WorkerOpsi { id: string; name: string }
interface RespWorkers { workers: WorkerOpsi[] }

function fmt(n: number) {
  return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(n);
}
function fmtDate(s: string | null) {
  if (!s) return "—";
  return new Date(s).toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric" });
}

const LABEL_TUJUAN: Record<string, string> = {
  gaji_tukang: "Gaji", uang_makan: "Makan", pembelian_alat: "Alat",
  operasional: "Operasional", lain_lain: "Lain-lain",
};

export default function PmKasbonTukangPage() {
  const [filter, setFilter] = useState<"aktif" | "lunas">("aktif");
  const [showForm, setShowForm] = useState(false);
  const [cicilanTarget, setCicilanTarget] = useState<KasbonTukang | null>(null);

  const { data, memuat, galat, muatUlang } = useData<ResponsKasbonTukang>("/api/v1/mandor/worker-kasbons");
  const kasbons = data?.kasbons ?? [];
  const tersaring = kasbons.filter((k) => (filter === "aktif" ? !k.is_settled : k.is_settled));

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--gap-bagian)" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
        <KepalaPortal judul="Kasbon Tukang" />
        <button
          type="button"
          onClick={() => setShowForm(true)}
          style={{
            display: "inline-flex", alignItems: "center", gap: 6, minHeight: 44,
            padding: "0 16px", borderRadius: "var(--portal-radius-pill)", fontSize: 13, fontWeight: 700,
            border: "none", background: "var(--grad-aksen)", color: "var(--on-navy)", cursor: "pointer",
          }}
        >
          <Plus size={15} aria-hidden="true" /> Tambah
        </button>
      </div>

      <SegmentedTab
        opsi={[
          { value: "aktif", label: "Aktif" },
          { value: "lunas", label: "Lunas" },
        ]}
        aktif={filter}
        onUbah={(v) => setFilter(v as typeof filter)}
      />

      {memuat && (
        <div style={{ display: "flex", flexDirection: "column", gap: "var(--gap-grid)" }}>
          <SkeletonCard tinggi={100} />
          <SkeletonCard tinggi={100} />
        </div>
      )}

      {!memuat && galat && (
        <EmptyState icon={Banknote} judul="Gagal memuat kasbon" deskripsi={pesanGalat(galat as GalatApi, "Coba muat ulang halaman ini.")} />
      )}

      {!memuat && !galat && tersaring.length === 0 && (
        <EmptyState
          icon={Banknote}
          judul={filter === "aktif" ? "Tidak ada kasbon aktif" : "Belum ada kasbon lunas"}
          deskripsi="Uang muka yang diteruskan mandor ke tukangnya sendiri. Dipotong dari upah saat pembayaran, jadi ia mengurangi yang diterima tukang — bukan menambah biaya proyek."
        />
      )}

      {!memuat && tersaring.map((k) => {
        const remaining = k.amount - k.amount_settled;
        const pct = k.amount > 0 ? (k.amount_settled / k.amount) * 100 : 0;
        return (
          <div key={k.id} style={{ background: "var(--surface)", borderRadius: 16, padding: "var(--pad-kartu-lega)", border: `1px solid ${k.is_settled ? "var(--border)" : "var(--warning-border)"}` }}>
            <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, marginBottom: 8 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4, flexWrap: "wrap" }}>
                  <span style={{ fontSize: 14, fontWeight: 700, color: "var(--text-primary)" }}>{k.worker?.name ?? "—"}</span>
                  <StatusBadge status={(k.is_settled ? "approved" : "pending") as VarianStatus} label={k.is_settled ? "Lunas" : "Aktif"} />
                </div>
                <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>
                  {k.mandor?.name ?? "—"} · {k.project?.name ?? "—"} · {fmtDate(k.kasbon_date)}
                </div>
                <div style={{ fontSize: "var(--t-kecil)", color: "var(--text-muted)", marginTop: 2 }}>
                  {LABEL_TUJUAN[k.purpose ?? ""] ?? k.purpose ?? "—"}
                </div>
              </div>
              <div style={{ textAlign: "right", flexShrink: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: k.is_settled ? "var(--success)" : "var(--danger)" }}>{fmt(remaining)}</div>
                <div style={{ fontSize: "var(--t-kecil)", color: "var(--text-muted)" }}>dari {fmt(k.amount)}</div>
              </div>
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: k.is_settled ? 0 : 10 }}>
              <div style={{ flex: 1, height: 4, borderRadius: 3, background: "var(--border)", overflow: "hidden" }}>
                <div style={{ height: "100%", background: k.is_settled ? "var(--success)" : "var(--warning)", width: `${pct}%` }} />
              </div>
              <span style={{ fontSize: "var(--t-kecil)", color: "var(--text-muted)", flexShrink: 0 }}>{Math.round(pct)}%</span>
            </div>

            {!k.is_settled && (
              <button
                type="button"
                onClick={() => setCicilanTarget(k)}
                style={{
                  minHeight: 40, padding: "0 14px", borderRadius: "var(--portal-radius-pill)",
                  border: "1px solid var(--navy)", background: "var(--navy-light)", color: "var(--navy)",
                  fontSize: 12, fontWeight: 700, cursor: "pointer",
                }}
              >
                Catat Cicilan
              </button>
            )}
          </div>
        );
      })}

      <BottomSheet terbuka={showForm} onTutup={() => setShowForm(false)} judul="Catat Kasbon Tukang">
        <FormKasbon
          onBatal={() => setShowForm(false)}
          onSukses={() => { setShowForm(false); void muatUlang(); }}
        />
      </BottomSheet>

      <BottomSheet terbuka={!!cicilanTarget} onTutup={() => setCicilanTarget(null)} judul="Catat Cicilan Kasbon">
        {cicilanTarget && (
          <FormCicilan
            kasbon={cicilanTarget}
            onBatal={() => setCicilanTarget(null)}
            onSukses={() => { setCicilanTarget(null); void muatUlang(); }}
          />
        )}
      </BottomSheet>
    </div>
  );
}

function FormKasbon({ onBatal, onSukses }: { onBatal: () => void; onSukses: () => void }) {
  const { data: dataAsg } = useData<ResponsPenugasanMandor>("/api/v1/mandor/assignments");
  const assignments: PenugasanMandor[] = dataAsg?.assignments ?? [];

  const [assignmentId, setAssignmentId] = useState("");
  const [workerId, setWorkerId] = useState("");
  const [workers, setWorkers] = useState<WorkerOpsi[]>([]);
  const [amount, setAmount] = useState("");
  const [purpose, setPurpose] = useState("gaji_tukang");
  const [tanggal, setTanggal] = useState(new Date().toISOString().split("T")[0]);
  const [notes, setNotes] = useState("");
  const [mengirim, setMengirim] = useState(false);
  const [galatForm, setGalatForm] = useState<string | null>(null);

  const selectedAssignment = assignments.find((a) => a.id === assignmentId);

  async function pilihAssignment(id: string) {
    setAssignmentId(id);
    setWorkerId("");
    setWorkers([]);
    const asg = assignments.find((a) => a.id === id);
    if (!asg?.mandor?.id) return;
    try {
      const r = await api.get<RespWorkers>(`/api/v1/mandor/workers?mandor_id=${asg.mandor.id}`);
      setWorkers(r.data.workers);
    } catch { /* best-effort: daftar tukang kosong bila gagal — form tetap bisa dibatalkan */ }
  }

  async function simpan() {
    if (!assignmentId || !workerId || !amount) {
      setGalatForm("Pilih mandor, tukang, dan isi nominal.");
      return;
    }
    setMengirim(true);
    setGalatForm(null);
    try {
      await api.post("/api/v1/mandor/worker-kasbons", {
        worker_id: workerId,
        project_id: selectedAssignment?.project?.id,
        mandor_id: selectedAssignment?.mandor?.id,
        amount: parseFloat(amount),
        purpose,
        kasbon_date: tanggal,
        notes: notes.trim() || undefined,
      });
      invalidasi("/api/v1/mandor/worker-kasbons");
      onSukses();
    } catch (e) {
      setGalatForm(pesanGalat(e as GalatApi, "Gagal catat kasbon"));
    } finally {
      setMengirim(false);
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <label style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>
        Mandor / Proyek
        <Pilihan
          value={assignmentId} onChange={(e) => void pilihAssignment(e.target.value)}
          style={{ width: "100%", marginTop: 6, minHeight: 44, padding: "0 12px", borderRadius: 12, border: "1px solid var(--border)", fontSize: 14, background: "var(--surface)", color: "var(--text-primary)" }}
        >
          <option value="">-- Pilih mandor --</option>
          {assignments.map((a) => <option key={a.id} value={a.id}>{a.mandor?.name} — {a.project?.name}</option>)}
        </Pilihan>
      </label>

      <label style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>
        Tukang
        <Pilihan
          value={workerId} onChange={(e) => setWorkerId(e.target.value)} disabled={!assignmentId}
          style={{ width: "100%", marginTop: 6, minHeight: 44, padding: "0 12px", borderRadius: 12, border: "1px solid var(--border)", fontSize: 14, background: assignmentId ? "var(--surface)" : "var(--surface-subtle)", color: "var(--text-primary)" }}
        >
          <option value="">-- Pilih tukang --</option>
          {workers.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
        </Pilihan>
      </label>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        <label style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>
          Nominal
          <input
            type="number" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0"
            style={{ width: "100%", marginTop: 6, minHeight: 44, padding: "0 12px", borderRadius: 12, border: "1px solid var(--border)", fontSize: 14, background: "var(--surface)", color: "var(--text-primary)", boxSizing: "border-box" }}
          />
        </label>
        <label style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>
          Tanggal
          <input
            type="date" value={tanggal} onChange={(e) => setTanggal(e.target.value)}
            style={{ width: "100%", marginTop: 6, minHeight: 44, padding: "0 12px", borderRadius: 12, border: "1px solid var(--border)", fontSize: 14, background: "var(--surface)", color: "var(--text-primary)", boxSizing: "border-box" }}
          />
        </label>
      </div>

      <label style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>
        Tujuan
        <Pilihan
          value={purpose} onChange={(e) => setPurpose(e.target.value)}
          style={{ width: "100%", marginTop: 6, minHeight: 44, padding: "0 12px", borderRadius: 12, border: "1px solid var(--border)", fontSize: 14, background: "var(--surface)", color: "var(--text-primary)" }}
        >
          <option value="gaji_tukang">Gaji Tukang</option>
          <option value="uang_makan">Uang Makan</option>
          <option value="pembelian_alat">Beli Alat</option>
          <option value="operasional">Operasional</option>
          <option value="lain_lain">Lain-lain</option>
        </Pilihan>
      </label>

      <label style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>
        Catatan (opsional)
        <textarea
          value={notes} onChange={(e) => setNotes(e.target.value)} rows={2}
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
          {mengirim ? "Menyimpan…" : "Simpan Kasbon"}
        </button>
      </div>
    </div>
  );
}

function FormCicilan({ kasbon, onBatal, onSukses }: { kasbon: KasbonTukang; onBatal: () => void; onSukses: () => void }) {
  const remaining = kasbon.amount - kasbon.amount_settled;
  const [nominal, setNominal] = useState("");
  const [catatan, setCatatan] = useState("");
  const [mengirim, setMengirim] = useState(false);
  const [galatForm, setGalatForm] = useState<string | null>(null);

  async function simpan() {
    const n = Number(nominal);
    if (!nominal || n <= 0) {
      setGalatForm("Nominal cicilan wajib diisi dan lebih dari 0.");
      return;
    }
    setMengirim(true);
    setGalatForm(null);
    try {
      await api.patch(`/api/v1/mandor/worker-kasbons/${kasbon.id}/cicilan`, {
        nominal: n, catatan: catatan.trim() || undefined,
      });
      invalidasi("/api/v1/mandor/worker-kasbons");
      onSukses();
    } catch (e) {
      setGalatForm(pesanGalat(e as GalatApi, "Gagal catat cicilan"));
    } finally {
      setMengirim(false);
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ fontSize: 13, color: "var(--text-secondary)" }}>
        Sisa outstanding: <strong style={{ color: "var(--danger)" }}>{fmt(remaining)}</strong>
      </div>

      <label style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>
        Nominal cicilan
        <input
          type="number" min={1} max={remaining} value={nominal} onChange={(e) => setNominal(e.target.value)}
          placeholder="Rp 0"
          style={{ width: "100%", marginTop: 6, minHeight: 44, padding: "0 12px", borderRadius: 12, border: "1px solid var(--border)", fontSize: 14, background: "var(--surface)", color: "var(--text-primary)", boxSizing: "border-box" }}
        />
      </label>

      <label style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>
        Catatan (opsional)
        <textarea
          value={catatan} onChange={(e) => setCatatan(e.target.value)} rows={2}
          placeholder="Mis: bayar dari upah minggu ini"
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
          {mengirim ? "Menyimpan…" : "Simpan Cicilan"}
        </button>
      </div>
    </div>
  );
}

