"use client";

// ============================================================================
// Scope & Progress — daftar lingkup kerja mandor, dikelompokkan per proyek.
//
// ── Sumber data
//
// Coba `GET /api/v1/mandor/my-scopes` dulu; kalau belum ada (404 di
// lingkungan lama), jatuh ke `GET /api/v1/mandor/assignments` dan menurunkan
// scope dari situ. Fallback ini DIPERTAHANKAN apa adanya dari versi lama —
// bukan bagian dari migrasi tampilan, dan mengubahnya berisiko mematahkan
// jalur yang sudah bekerja untuk lingkungan yang belum punya `my-scopes`.
// ============================================================================

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { type Penugasan, type LingkupKerja, type GalatApi, pesanGalat } from "../_bersama/tipe";
import { ChevronDown, ChevronUp, Layers, TrendingUp } from "lucide-react";
import Link from "next/link";
import EmptyState from "@/components/portal/EmptyState";
import KepalaPortal from "@/components/portal/KepalaPortal";
import SkeletonCard from "@/components/portal/SkeletonCard";
import { Tabel, type Kolom } from "@/components/dasar";

/** Satu item pekerjaan di dalam sebuah lingkup. */
type ItemPekerjaan = {
  id: string;
  item_name: string;
  unit: string | null;
  volume: number | null;
  volume_done: number | null;
};

/** Persentase penyelesaian. Volume 0 -> 0%, bukan NaN atau Infinity. */
function persen(i: ItemPekerjaan) {
  const v = i.volume ?? 0;
  return v > 0 ? Math.round(((i.volume_done ?? 0) / v) * 100) : 0;
}

function fmt(n: number) {
  return new Intl.NumberFormat("id-ID", { maximumFractionDigits: 0 }).format(n);
}
function fmtRp(n: number) {
  return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(n);
}

const SCOPE_STATUS: Record<string, { label: string; warna: string; bg: string }> = {
  active: { label: "Aktif", warna: "var(--on-success-bg)", bg: "var(--success-bg)" },
  completed: { label: "Selesai", warna: "var(--text-secondary)", bg: "var(--surface-hover)" },
  on_hold: { label: "Ditunda", warna: "var(--on-warning-bg)", bg: "var(--warning-bg)" },
  cancelled: { label: "Batal", warna: "var(--on-danger-bg)", bg: "var(--danger-bg)" },
};

const SISTEM_BAYAR: Record<string, string> = {
  harian: "Harian",
  borongan: "Borongan",
  progress_pct: "Progress %",
};

function ProgressBar({ pct, color, height = 6 }: { pct: number; color: string; height?: number }) {
  return (
    <div style={{ height, background: "var(--surface-subtle)", borderRadius: height, overflow: "hidden" }}>
      <div
        style={{
          height: "100%", borderRadius: height, background: color,
          width: `${Math.min(100, Math.max(0, pct))}%`, transition: "width 0.5s ease",
        }}
      />
    </div>
  );
}

/** Lingkup kerja dengan field turunan yang dipakai fallback `assignments`. */
interface LingkupTampil extends LingkupKerja {
  financial_pct?: number;
  settlement?: { net_payment?: number | string | null } | null;
}

export default function MandorScopePage() {
  const [scopes, setScopes] = useState<LingkupTampil[]>([]);
  const [loading, setLoading] = useState(true);
  const [galatMuat, setGalatMuat] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  useEffect(() => {
    // Coba endpoint my-scopes dulu, fallback ke assignments jika belum ada.
    // DIPERTAHANKAN dari versi lama — lihat catatan header berkas.
    api.get<{ scopes: LingkupTampil[] }>("/api/v1/mandor/my-scopes").then((res) => {
      const list = res.data?.scopes ?? [];
      setScopes(list);
      const init: Record<string, boolean> = {};
      list.forEach((s) => { if (s.status === "active") init[s.id] = true; });
      setExpanded(init);
      setGalatMuat(null);
    }).catch(() => {
      api.get<{ assignments: Penugasan[] }>("/api/v1/mandor/assignments").then((r) => {
        const asgns = r.data?.assignments ?? [];
        const allScopes: LingkupTampil[] = asgns.flatMap((a) =>
          (a.work_scopes ?? []).map((s) => ({
            ...s, project: a.project, contract_value: s.borongan_value ?? 0,
            total_kasbon: 0, total_progress_paid: 0, financial_pct: 0, settlement: null,
          })));
        setScopes(allScopes);
        const init: Record<string, boolean> = {};
        allScopes.forEach((s) => { if (s.status === "active") init[s.id] = true; });
        setExpanded(init);
        setGalatMuat(null);
      }).catch((e) => {
        setGalatMuat(pesanGalat(e as GalatApi, "Coba muat ulang halaman ini."));
      });
    }).finally(() => setLoading(false));
  }, []);

  // Buat tampilan per proyek dengan grouping
  const byProject: Record<string, { projectName: string; scopes: LingkupTampil[] }> = {};
  scopes.forEach((s) => {
    const pid = s.project?.id ?? "unknown";
    if (!byProject[pid]) byProject[pid] = { projectName: s.project?.name ?? "Proyek", scopes: [] };
    byProject[pid].scopes.push(s);
  });

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--gap-bagian)" }}>
      <KepalaPortal judul="Scope & Progress" />

      {loading && (
        <>
          <SkeletonCard tinggi={120} />
          <SkeletonCard tinggi={120} />
        </>
      )}

      {!loading && galatMuat && (
        <EmptyState
          icon={Layers}
          judul="Gagal memuat scope"
          deskripsi={galatMuat}
        />
      )}

      {!loading && !galatMuat && scopes.length === 0 && (
        <EmptyState
          icon={Layers}
          judul="Belum ada scope pekerjaan"
          deskripsi="Lingkup kerja yang ditugaskan admin atau PM akan muncul di sini, lengkap dengan progres fisik dan finansialnya."
        />
      )}

      {!loading && !galatMuat && scopes.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: "var(--gap-bagian)" }}>
          {Object.entries(byProject).map(([pid, { projectName, scopes: projectScopes }]) => {
            const activeCount = projectScopes.filter((s) => s.status === "active").length;
            const groupKey = `group_${pid}`;
            const isGroupOpen = expanded[groupKey] !== false;

            return (
              <div
                key={pid}
                style={{
                  background: "var(--surface)", borderRadius: 16,
                  border: "1px solid var(--border)", overflow: "hidden",
                }}
              >
                <button
                  onClick={() => setExpanded((prev) => ({ ...prev, [groupKey]: !isGroupOpen }))}
                  aria-expanded={isGroupOpen}
                  style={{
                    width: "100%", minHeight: 44, padding: "16px 20px",
                    display: "flex", alignItems: "center", justifyContent: "space-between",
                    background: "none", border: "none", cursor: "pointer", textAlign: "left",
                  }}
                >
                  <div>
                    <div style={{ fontSize: 15, fontWeight: 700, color: "var(--text-primary)" }}>{projectName}</div>
                    <div style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: 2 }}>
                      {projectScopes.length} scope · {activeCount} aktif
                    </div>
                  </div>
                  {isGroupOpen
                    ? <ChevronUp size={18} color="var(--text-secondary)" aria-hidden="true" />
                    : <ChevronDown size={18} color="var(--text-secondary)" aria-hidden="true" />}
                </button>

                {isGroupOpen && (
                  <div style={{ borderTop: "1px solid var(--border)" }}>
                    {projectScopes.map((scope, idx) => {
                      const meta = SCOPE_STATUS[scope.status] ?? SCOPE_STATUS.active;
                      const physicalPct = scope.progress_pct_done ?? 0;
                      const contractValue = Number(scope.contract_value ?? 0);
                      const financialPct = scope.financial_pct ?? 0;
                      const isBorongan = scope.payment_system === "borongan";
                      const isProgressPct = scope.payment_system === "progress_pct";
                      const isExpanded = expanded[scope.id] ?? false;

                      return (
                        <div
                          key={scope.id}
                          style={{
                            borderBottom: idx < projectScopes.length - 1 ? "1px solid var(--border)" : "none",
                          }}
                        >
                          <div
                            role="button"
                            tabIndex={0}
                            aria-expanded={isExpanded}
                            onKeyDown={(e) => {
                              if (e.key === "Enter" || e.key === " ") {
                                e.preventDefault(); // Spasi jangan menggulir daftar scope
                                setExpanded((prev) => ({ ...prev, [scope.id]: !isExpanded }));
                              }
                            }}
                            onClick={() => setExpanded((prev) => ({ ...prev, [scope.id]: !isExpanded }))}
                            style={{
                              padding: "16px 20px",
                              background: scope.status === "active" ? "var(--surface-subtle)" : "transparent",
                              cursor: "pointer",
                            }}
                          >
                            <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, marginBottom: 12 }}>
                              <div style={{ minWidth: 0 }}>
                                <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 4 }}>
                                  <span style={{ fontSize: 13, fontWeight: 700, color: "var(--text-primary)" }}>{scope.scope_name}</span>
                                  <span style={{ fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: "var(--portal-radius-pill)", color: meta.warna, background: meta.bg }}>
                                    {meta.label}
                                  </span>
                                  <span style={{ fontSize: 11, color: "var(--text-secondary)", background: "var(--surface-hover)", padding: "2px 8px", borderRadius: "var(--portal-radius-pill)" }}>
                                    {SISTEM_BAYAR[scope.payment_system ?? ""] ?? scope.payment_system}
                                  </span>
                                </div>
                                {contractValue > 0 && (
                                  <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>Nilai Kontrak: {fmtRp(contractValue)}</div>
                                )}
                              </div>
                              <div style={{ textAlign: "right", flexShrink: 0 }}>
                                <div style={{ fontSize: 22, fontWeight: 800, color: "var(--navy)" }}>{physicalPct}%</div>
                                <div style={{ fontSize: 10, color: "var(--text-secondary)" }}>fisik</div>
                              </div>
                            </div>

                            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                              <div>
                                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                                  <span style={{ fontSize: 11, color: "var(--text-secondary)" }}>Progress Fisik</span>
                                  <span style={{ fontSize: 11, fontWeight: 700, color: "var(--navy)" }}>{physicalPct}%</span>
                                </div>
                                <ProgressBar pct={physicalPct} color="var(--navy)" />
                              </div>

                              {isBorongan && contractValue > 0 && (
                                <div>
                                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                                    <span style={{ fontSize: 11, color: "var(--text-secondary)" }}>Kasbon / Kontrak</span>
                                    <span style={{ fontSize: 11, fontWeight: 700, color: "var(--on-warning-bg)" }}>
                                      {fmtRp(Number(scope.total_kasbon ?? 0))} / {fmtRp(contractValue)} ({financialPct}%)
                                    </span>
                                  </div>
                                  <ProgressBar pct={financialPct} color="var(--warning)" height={4} />
                                </div>
                              )}

                              {isProgressPct && contractValue > 0 && (
                                <div>
                                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                                    <span style={{ fontSize: 11, color: "var(--text-secondary)" }}>Sudah Dibayar</span>
                                    <span style={{ fontSize: 11, fontWeight: 700, color: "var(--on-success-bg)" }}>
                                      {fmtRp(Number(scope.total_progress_paid ?? 0))} ({Math.min(100, Math.round(((scope.total_progress_paid ?? 0) / contractValue) * 100))}%)
                                    </span>
                                  </div>
                                  <ProgressBar pct={Math.min(100, ((scope.total_progress_paid ?? 0) / contractValue) * 100)} color="var(--success)" height={4} />
                                </div>
                              )}
                            </div>

                            {scope.settlement && (
                              <div style={{ marginTop: 10, padding: "8px 12px", borderRadius: 10, background: "var(--success-bg)", border: "1px solid var(--success-border)", display: "flex", alignItems: "center", gap: 8 }}>
                                <TrendingUp size={14} color="var(--on-success-bg)" aria-hidden="true" />
                                <span style={{ fontSize: 12, color: "var(--on-success-bg)", fontWeight: 600 }}>
                                  Settlement selesai · {fmtRp(Number(scope.settlement.net_payment ?? 0))} dibayarkan
                                </span>
                              </div>
                            )}

                            {isBorongan && physicalPct >= 90 && !scope.settlement && scope.status === "active" && (
                              <div style={{ marginTop: 10, fontSize: 11, color: "var(--on-warning-bg)", fontWeight: 600 }}>
                                Progress {physicalPct}% — bisa ajukan settlement ke admin
                              </div>
                            )}

                            {isProgressPct && scope.status === "active" && (
                              <Link
                                href="/mandor-portal/penagihan"
                                onClick={(e) => e.stopPropagation()}
                                style={{
                                  display: "inline-flex", alignItems: "center", gap: 4, minHeight: 44,
                                  marginTop: 10, padding: "0 12px", borderRadius: "var(--portal-radius-pill)",
                                  border: "1px solid var(--navy)", background: "var(--navy-light)",
                                  color: "var(--navy)", fontSize: 12, fontWeight: 700, textDecoration: "none",
                                }}
                              >
                                Ajukan Penagihan →
                              </Link>
                            )}
                          </div>

                          {isExpanded && <ScopeItemsDetail scopeId={scope.id} />}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function ScopeItemsDetail({ scopeId }: { scopeId: string }) {
  const [items, setItems] = useState<ItemPekerjaan[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get(`/api/v1/mandor/work-scopes/${scopeId}`).then((res) => {
      setItems(res.data?.items ?? []);
    }).finally(() => setLoading(false));
  }, [scopeId]);

  if (loading) {
    return (
      <div style={{ padding: "12px 20px" }}>
        <SkeletonCard tinggi={48} />
      </div>
    );
  }

  // Komponen `<Tabel>` menggantikan tabel mentah. Yang didapat bukan
  // kerapian: caption tersembunyi, `th scope="row"` di kolom pertama,
  // `tabular-nums`, dan pembungkus `overflow-x` kini dijamin komponen dan
  // diuji di `dasar.test.tsx` — bukan diulang benar di tiap halaman dan
  // salah di satu.
  const kolomItem: Array<Kolom<ItemPekerjaan>> = [
    { kunci: "item", judul: "Item Pekerjaan", kepalaBaris: true, render: (i) => i.item_name },
    { kunci: "sat", judul: "Sat", rata: "kanan", render: (i) => i.unit ?? "—" },
    { kunci: "target", judul: "Target", rata: "kanan", render: (i) => fmt(Number(i.volume ?? 0)) },
    {
      kunci: "realisasi", judul: "Realisasi", rata: "kanan",
      render: (i) => (
        <span style={{ fontWeight: 700, color: persen(i) >= 100 ? "var(--on-success-bg)" : "var(--text-primary)" }}>
          {fmt(Number(i.volume_done ?? 0))}
        </span>
      ),
    },
    {
      kunci: "pct", judul: "%", rata: "kanan",
      render: (i) => (
        <span style={{ fontSize: 11, fontWeight: 700, color: persen(i) >= 100 ? "var(--on-success-bg)" : "var(--navy)" }}>
          {persen(i)}%
        </span>
      ),
    },
  ];

  if (items.length === 0) {
    return (
      <div style={{ padding: "4px 20px 16px" }}>
        <EmptyState
          icon={Layers}
          judul="Belum ada item pekerjaan"
          deskripsi="Rincian item, target volume, dan realisasi lingkup ini akan muncul di sini."
        />
      </div>
    );
  }

  return (
    <div style={{ padding: "0 20px 16px", overflowX: "auto" }}>
      <Tabel<ItemPekerjaan>
        berpermukaan
        caption="Rincian item pekerjaan pada lingkup ini: satuan, target volume, realisasi, dan persentase penyelesaian tiap item."
        kolom={kolomItem}
        data={items}
        kunciBaris={(i) => i.id}
      />
    </div>
  );
}
