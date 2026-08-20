"use client";

// ============================================================================
// Retensi Subkontraktor — versi PM, portal mobile (Tahap 1, Task 7).
//
// Uang mandor yang kita tahan sebagai jaminan mutu (biasanya 5% dari nilai
// pekerjaan), dan kapan harus dicairkan. List (`GET .../retensi-register`)
// hanya butuh `authenticate` (TANPA gerbang permission granular, dikonfirmasi
// Task 5 §Temuan mandor L2643) — selalu terbaca PM. Pencairan
// (`POST .../retensi-releases`) butuh `mandor:kasbon:approve` — izin yang
// sama dengan menyetujui pembayaran progres; PM PUNYA (Task 5, modul mandor).
//
// Endpoint (dikonfirmasi Task 5 + baca kode `mandor.ts` L2643-2810):
//   GET  /api/v1/mandor/retensi-register  — daftar, authenticate saja
//   POST /api/v1/mandor/retensi-releases  — cairkan, butuh mandor:kasbon:approve
// ============================================================================

import { useState, useSyncExternalStore } from "react";
import { Lock, HandCoins, AlertTriangle } from "lucide-react";
import { useData, invalidasi } from "@/lib/data-cache";
import { api, hasPermission } from "@/lib/api";
import BottomSheet from "@/components/portal/BottomSheet";
import EmptyState from "@/components/portal/EmptyState";
import SkeletonCard from "@/components/portal/SkeletonCard";
import type { RetensiScope, ResponsRetensiRegister, GalatApi } from "../../_bersama/tipe";
import { pesanGalat } from "../../_bersama/tipe";

// `langganan`: dipakai `useSyncExternalStore` supaya perubahan permission
// (login/switch company) tercermin tanpa reload, dan supaya render pertama
// SSR-safe (fallback `false`) — pola sama dengan
// `pm-portal/mandor-lengkap/penugasan/page.tsx`.
const langganan = (cb: () => void) => { window.addEventListener("storage", cb); return () => window.removeEventListener("storage", cb); };

const rp = (n: number) =>
  new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(n);
const rpRingkas = (n: number) => {
  if (n >= 1_000_000_000) return `Rp ${(n / 1_000_000_000).toFixed(1)}M`;
  if (n >= 1_000_000) return `Rp ${(n / 1_000_000).toFixed(0)}jt`;
  return rp(n);
};

export default function PmRetensiPage() {
  const [cairkan, setCairkan] = useState<RetensiScope | null>(null);
  const bolehCairkan = useSyncExternalStore(
    langganan, () => hasPermission("mandor:kasbon:approve"), () => false);

  const { data, memuat, galat, muatUlang } = useData<ResponsRetensiRegister>("/api/v1/mandor/retensi-register");
  const scopes = data?.scopes ?? [];

  // Yang selesai tapi retensinya belum keluar — satu-satunya yang menuntut
  // tindakan hari ini, jadi ditaruh paling atas.
  const siapCair = scopes.filter((s) => s.status === "completed" && s.outstanding > 0);
  const urut = [...scopes].sort((a, b) => {
    const prioA = a.status === "completed" && a.outstanding > 0 ? 0 : 1;
    const prioB = b.status === "completed" && b.outstanding > 0 ? 0 : 1;
    return prioA - prioB || b.outstanding - a.outstanding;
  });

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--gap-bagian)" }}>
      <h1 style={{ fontSize: 20, fontWeight: 700, color: "var(--text-primary)", margin: 0 }}>
        Retensi Subkontraktor
      </h1>
      <p style={{ fontSize: 13, color: "var(--text-secondary)", margin: 0, lineHeight: 1.5 }}>
        Uang mandor yang ditahan sebagai jaminan mutu. Angka ini <strong>utang perusahaan</strong>, bukan kas bebas.
      </p>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "var(--gap-grid)" }}>
        <div style={{ background: "var(--surface)", border: "1px solid var(--warning-border)", borderRadius: 14, padding: "var(--pad-kartu)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
            <Lock size={13} aria-hidden="true" style={{ color: "var(--warning)" }} />
            <span style={{ fontSize: 10, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase" }}>Ditahan</span>
          </div>
          <div style={{ fontSize: 18, fontWeight: 700, color: "var(--warning)" }}>{memuat ? "—" : rpRingkas(data?.total_outstanding ?? 0)}</div>
        </div>
        <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 14, padding: "var(--pad-kartu)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
            <HandCoins size={13} aria-hidden="true" style={{ color: "var(--success)" }} />
            <span style={{ fontSize: 10, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase" }}>Dicairkan</span>
          </div>
          <div style={{ fontSize: 18, fontWeight: 700, color: "var(--success)" }}>{memuat ? "—" : rpRingkas(data?.total_dicairkan ?? 0)}</div>
        </div>
      </div>

      {!memuat && siapCair.length > 0 && (
        <div role="status" style={{ background: "var(--warning-bg)", border: "1px solid var(--warning-border)", borderRadius: 12, padding: "var(--pad-kartu)", fontSize: 13, color: "var(--on-warning-bg)", display: "flex", alignItems: "flex-start", gap: 8 }}>
          <AlertTriangle size={15} aria-hidden="true" style={{ marginTop: 1, flexShrink: 0 }} />
          <span><strong>{siapCair.length} scope selesai</strong> tapi retensinya belum dicairkan · total {rpRingkas(siapCair.reduce((t, s) => t + s.outstanding, 0))}</span>
        </div>
      )}

      {memuat && (
        <div style={{ display: "flex", flexDirection: "column", gap: "var(--gap-grid)" }}>
          <SkeletonCard tinggi={90} />
          <SkeletonCard tinggi={90} />
        </div>
      )}

      {!memuat && galat && (
        <EmptyState icon={Lock} judul="Gagal memuat register retensi" deskripsi={pesanGalat(galat as GalatApi, "Coba muat ulang halaman ini.")} />
      )}

      {!memuat && !galat && urut.length === 0 && (
        <EmptyState
          icon={Lock}
          judul="Belum ada retensi tercatat"
          deskripsi="Retensi muncul di sini setelah lingkup kerja punya persentase retensi dan pembayaran progres yang disetujui."
        />
      )}

      {!memuat && urut.map((s) => {
        const selesai = s.status === "completed";
        const perluCair = selesai && s.outstanding > 0;
        return (
          <div key={s.work_scope_id} style={{
            background: "var(--surface)", borderRadius: 16, padding: "var(--pad-kartu-lega)",
            border: `1px solid ${perluCair ? "var(--warning-border)" : "var(--border)"}`,
          }}>
            <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, marginBottom: 8 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: "var(--text-primary)" }}>{s.scope_name}</div>
                <div style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: 2 }}>
                  {s.mandor?.name ?? "—"} · {s.project?.name ?? "—"}
                </div>
                <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 2 }}>
                  {selesai ? "Selesai" : s.status ?? "—"}{s.retensi_pct != null && ` · ${s.retensi_pct}%`}
                </div>
              </div>
              <div style={{ textAlign: "right", flexShrink: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: s.outstanding > 0 ? "var(--warning)" : "var(--text-muted)" }}>
                  {s.outstanding > 0 ? rp(s.outstanding) : "lunas"}
                </div>
                <div style={{ fontSize: 10, color: "var(--text-muted)" }}>dari {rp(s.ditahan)}</div>
              </div>
            </div>

            {bolehCairkan && s.outstanding > 0 && (
              <button
                type="button"
                onClick={() => setCairkan(s)}
                style={perluCair ? {
                  minHeight: 40, padding: "0 14px", borderRadius: "var(--portal-radius-pill)",
                  border: "none", background: "var(--grad-aksen)", color: "var(--on-navy)",
                  fontSize: 12, fontWeight: 700, cursor: "pointer",
                } : {
                  minHeight: 40, padding: "0 14px", borderRadius: "var(--portal-radius-pill)",
                  border: "1px solid var(--navy)", background: "var(--navy-light)", color: "var(--navy)",
                  fontSize: 12, fontWeight: 700, cursor: "pointer",
                }}
              >
                Cairkan
              </button>
            )}
          </div>
        );
      })}

      <BottomSheet terbuka={!!cairkan} onTutup={() => setCairkan(null)} judul="Cairkan Retensi">
        {cairkan && (
          <FormCairkan
            baris={cairkan}
            onBatal={() => setCairkan(null)}
            onSukses={() => { setCairkan(null); void muatUlang(); }}
          />
        )}
      </BottomSheet>
    </div>
  );
}

function FormCairkan({ baris, onBatal, onSukses }: { baris: RetensiScope; onBatal: () => void; onSukses: () => void }) {
  const [jumlah, setJumlah] = useState(String(baris.outstanding));
  const [tanggal, setTanggal] = useState(new Date().toISOString().split("T")[0]);
  const [catatan, setCatatan] = useState("");
  const [mengirim, setMengirim] = useState(false);
  const [galatForm, setGalatForm] = useState<string | null>(null);

  const nominal = Number(jumlah) || 0;
  const lebih = nominal > baris.outstanding;
  const sah = nominal > 0 && !lebih;

  async function simpan() {
    if (!sah) {
      setGalatForm(lebih ? `Melebihi sisa yang ditahan (${rp(baris.outstanding)}).` : "Nominal wajib lebih dari 0.");
      return;
    }
    setMengirim(true);
    setGalatForm(null);
    try {
      await api.post("/api/v1/mandor/retensi-releases", {
        work_scope_id: baris.work_scope_id,
        amount: nominal,
        released_at: tanggal,
        notes: catatan.trim() || undefined,
      });
      invalidasi("/api/v1/mandor/retensi-register");
      onSukses();
    } catch (e) {
      setGalatForm(pesanGalat(e as GalatApi, "Gagal mencairkan retensi"));
    } finally {
      setMengirim(false);
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ fontSize: 13, color: "var(--text-secondary)" }}>
        {baris.scope_name} · {baris.mandor?.name ?? "—"}
      </div>
      <div style={{ background: "var(--surface-subtle)", borderRadius: 10, padding: "8px 12px", display: "flex", justifyContent: "space-between", fontSize: 12, color: "var(--text-secondary)" }}>
        <span>Sisa yang ditahan</span>
        <strong style={{ color: "var(--text-primary)" }}>{rp(baris.outstanding)}</strong>
      </div>

      <label style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>
        Jumlah dicairkan
        <input
          type="number" min={0} max={baris.outstanding} value={jumlah} onChange={(e) => setJumlah(e.target.value)}
          style={{
            width: "100%", marginTop: 6, minHeight: 44, padding: "0 12px", borderRadius: 12,
            border: `1px solid ${lebih ? "var(--danger-border)" : "var(--border)"}`, fontSize: 14,
            background: "var(--surface)", color: "var(--text-primary)", boxSizing: "border-box",
          }}
        />
        {lebih && <div style={{ fontSize: 11, color: "var(--danger)", marginTop: 4 }}>Melebihi sisa yang ditahan ({rp(baris.outstanding)}).</div>}
      </label>

      <label style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>
        Tanggal pencairan
        <input
          type="date" value={tanggal} onChange={(e) => setTanggal(e.target.value)}
          style={{ width: "100%", marginTop: 6, minHeight: 44, padding: "0 12px", borderRadius: 12, border: "1px solid var(--border)", fontSize: 14, background: "var(--surface)", color: "var(--text-primary)", boxSizing: "border-box" }}
        />
      </label>

      <label style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>
        Catatan (opsional)
        <input
          value={catatan} onChange={(e) => setCatatan(e.target.value)} placeholder="mis. setelah masa pemeliharaan 90 hari"
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
          type="button" onClick={() => void simpan()} disabled={mengirim || !sah}
          style={(mengirim || !sah) ? {
            flex: 1, minHeight: 48, padding: "0 14px", borderRadius: "var(--portal-radius-pill)",
            background: "var(--surface-subtle)", color: "var(--text-muted)", border: "none",
            fontSize: 14, fontWeight: 700, cursor: "default",
          } : {
            flex: 1, minHeight: 48, padding: "0 14px", borderRadius: "var(--portal-radius-pill)",
            background: "var(--grad-aksen)", color: "var(--on-navy)", border: "none",
            fontSize: 14, fontWeight: 700, cursor: "pointer",
          }}
        >
          {mengirim ? "Menyimpan…" : "Cairkan"}
        </button>
      </div>
    </div>
  );
}
