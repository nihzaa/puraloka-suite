"use client";

import { getStoredUser } from "@/lib/api";
import { useData } from "@/lib/data-cache";
import { type Penugasan, type Kasbon, type LaporanUpah } from "./_bersama/tipe";
import { Briefcase, Wallet, Clock, CheckCircle, ChevronRight, CreditCard, ClipboardList, AlertCircle } from "lucide-react";
import Link from "next/link";

import { C } from "@/lib/warna-ui";
import { namaSapaan } from "@/lib/nama-sapaan";
import { Kosong } from "@/components/ui-dasar";

function fmt(n: number) {
  return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(n);
}
function fmtDate(s: string | null) {
  if (!s) return "—";
  return new Date(s).toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric" });
}

const KASBON_STATUS: Record<string, { label: string; color: string; bg: string }> = {
  pending:  { label: "Menunggu",  color: C.yellow, bg: C.yellowBg },
  approved: { label: "Disetujui", color: C.green,  bg: C.greenBg  },
  rejected: { label: "Ditolak",   color: C.red,    bg: C.redBg    },
  settled:  { label: "Lunas",     color: C.mid,    bg: "var(--surface-hover)"  },
};

const SCOPE_STATUS: Record<string, { label: string; color: string; bg: string }> = {
  active:    { label: "Aktif",   color: C.green,  bg: C.greenBg   },
  completed: { label: "Selesai", color: C.mid,    bg: "var(--surface-hover)"   },
  on_hold:   { label: "Ditunda", color: C.yellow, bg: C.yellowBg  },
  cancelled: { label: "Batal",   color: C.red,    bg: C.redBg     },
};

const PAYMENT_LABEL: Record<string, string> = {
  harian: "Harian", borongan: "Borongan", progress_pct: "Progress %",
};

const REPORT_STATUS: Record<string, { label: string; color: string }> = {
  submitted: { label: "Menunggu", color: C.yellow },
  approved:  { label: "Disetujui", color: C.green },
  rejected:  { label: "Ditolak", color: C.red },
  paid:      { label: "Dibayar", color: C.green },
};

export default function MandorDashboardPage() {
  const user = getStoredUser();

  // ── PINDAH KE LAPIS CACHE BERSAMA (F4-2), 2026-08-16 — halaman ini
  // hanya baca (ringkasan), tak ada tulis lapangan di sini, jadi tak ada
  // cache offline yang perlu dipertahankan.
  const { data: dataAssign, memuat: memuatAssign, galat: galatAssign } =
    useData<{ assignments: Penugasan[] }>("/api/v1/mandor/assignments");
  const { data: dataKasbon, memuat: memuatKasbon, galat: galatKasbon } =
    useData<{ kasbons: Kasbon[] }>("/api/v1/kasbons");
  const { data: dataWorkerKasbon, memuat: memuatWorkerKasbon, galat: galatWorkerKasbon } =
    useData<{ kasbons: Kasbon[] }>("/api/v1/mandor/worker-kasbons");
  const { data: dataReports, memuat: memuatReports, galat: galatReports } =
    useData<{ reports: LaporanUpah[] }>("/api/v1/mandor/wage-reports");

  const loading = memuatAssign || memuatKasbon || memuatWorkerKasbon || memuatReports;
  const galatMuat = galatAssign ?? galatKasbon ?? galatWorkerKasbon ?? galatReports;

  // Diturunkan, bukan disalin.
  const assignments = dataAssign?.assignments ?? [];
  const kasbons = dataKasbon?.kasbons ?? [];
  const workerKasbons = dataWorkerKasbon?.kasbons ?? [];
  const recentReports = (dataReports?.reports ?? []).slice(0, 3);

  const allScopes = assignments.flatMap((a) => (a.work_scopes ?? []).map((s) => ({ ...s, project: a.project })));
  const activeScopes = allScopes.filter((s) => s.status === "active");
  const pendingKasbons = kasbons.filter((k) => k.status === "pending");
  const totalKasbonPending = pendingKasbons.reduce((s, k) => s + Number(k.amount ?? 0), 0);
  const pendingWorkerKasbons = workerKasbons.filter((k) => !k.is_settled);
  const recentKasbons = kasbons.slice(0, 3);

  return (
    <div style={{ maxWidth: 800, margin: "0 auto" }}>
      {/* Greeting */}
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: C.text, margin: 0 }}>
          Halo, {namaSapaan(user?.name)} 👷
        </h1>
        <p style={{ fontSize: 13, color: C.mid, margin: "4px 0 0" }}>
          Ringkasan pekerjaan, upah, dan kasbon Anda
        </p>
      </div>

      {!loading && galatMuat && (
        <div role="alert" style={{ background: C.redBg, border: `1px solid ${C.red}`, borderRadius: 10, padding: "12px 16px", marginBottom: 16, fontSize: 13, color: C.red }}>
          Sebagian ringkasan gagal dimuat. Coba muat ulang halaman.
        </div>
      )}

      {/* KPI Cards */}
      {!loading && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 12, marginBottom: 24 }}>
          <div style={{ background: C.surface, borderRadius: 10, padding: 16, border: `1px solid ${C.border}`, boxShadow: "var(--naik-1)" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
              <Briefcase size={16} color={C.navy} />
              <span style={{ fontSize: 11, color: C.mid, fontWeight: 500 }}>Scope Aktif</span>
            </div>
            <div style={{ fontSize: 28, fontWeight: 700, color: C.navy }}>{activeScopes.length}</div>
          </div>
          <div style={{ background: C.surface, borderRadius: 10, padding: 16, border: `1px solid ${C.border}`, boxShadow: "var(--naik-1)" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
              <Clock size={16} color={C.yellow} />
              <span style={{ fontSize: 11, color: C.mid, fontWeight: 500 }}>Kasbon Pending</span>
            </div>
            <div style={{ fontSize: 28, fontWeight: 700, color: C.yellow }}>{pendingKasbons.length}</div>
            {totalKasbonPending > 0 && (
              <div style={{ fontSize: 11, color: C.mid, marginTop: 2 }}>{fmt(totalKasbonPending)}</div>
            )}
          </div>
          <div style={{ background: C.surface, borderRadius: 10, padding: 16, border: `1px solid ${C.border}`, boxShadow: "var(--naik-1)" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
              <CreditCard size={16} color="var(--aksen)" />
              <span style={{ fontSize: 11, color: C.mid, fontWeight: 500 }}>Kasbon Tukang Aktif</span>
            </div>
            <div style={{ fontSize: 28, fontWeight: 700, color: "var(--aksen)" }}>{pendingWorkerKasbons.length}</div>
          </div>
          <div style={{ background: C.surface, borderRadius: 10, padding: 16, border: `1px solid ${C.border}`, boxShadow: "var(--naik-1)" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
              <ClipboardList size={16} color={C.green} />
              <span style={{ fontSize: 11, color: C.mid, fontWeight: 500 }}>Laporan Upah</span>
            </div>
            <div style={{ fontSize: 28, fontWeight: 700, color: C.green }}>{recentReports.filter((r) => r.status === "submitted").length}</div>
            <div style={{ fontSize: 11, color: C.mid, marginTop: 2 }}>menunggu review</div>
          </div>
        </div>
      )}

      {/* Active Scopes */}
      <section style={{ marginBottom: 24 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <h2 style={{ fontSize: 15, fontWeight: 700, color: C.text, margin: 0 }}>Scope Aktif</h2>
          <Link href="/mandor-portal/scope" style={{ fontSize: 13, color: C.navy, textDecoration: "none", fontWeight: 500 }}>
            Lihat semua →
          </Link>
        </div>

        {loading && <div style={{ textAlign: "center", padding: 40, color: C.mid }}>Memuat...</div>}

        {!loading && activeScopes.length === 0 && (
          // Jalan keluarnya BUKAN tombol: mandor tak bisa menugaskan lingkup
          // kerja untuk dirinya sendiri — itu wewenang admin/PM. Layar kosong
          // yang menawarkan tombol yang tak akan pernah berhasil lebih buruk
          // daripada yang menjelaskan siapa yang harus dihubungi.
          <Kosong
            ikon={<AlertCircle size={28} />}
            judul="Belum ada lingkup kerja aktif"
            sebab={
              <>
                Lingkup kerja ditugaskan oleh admin atau PM proyek. Selama belum
                ada, Anda belum bisa mengajukan laporan upah maupun kasbon —
                keduanya selalu menunjuk ke satu lingkup. Hubungi PM proyek Anda
                bila seharusnya sudah ada penugasan.
              </>
            }
          />
        )}

        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {activeScopes.slice(0, 3).map((s) => {
            const meta = SCOPE_STATUS[s.status] ?? SCOPE_STATUS.active;
            const progress = s.progress_pct_done ?? 0;
            return (
              <Link key={s.id} href="/mandor-portal/scope" style={{ textDecoration: "none" }}>
                <div style={{
                  background: C.surface, borderRadius: 10, padding: "12px 16px",
                  border: `1px solid ${C.border}`, boxShadow: "var(--naik-1)",
                }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 2 }}>
                        <span style={{ fontSize: 13, fontWeight: 600, color: C.text }}>{s.scope_name}</span>
                        <span style={{ fontSize: 11, fontWeight: 600, padding: "2px 8px", borderRadius: 20, color: meta.color, background: meta.bg }}>
                          {meta.label}
                        </span>
                      </div>
                      <div style={{ fontSize: 12, color: C.mid }}>
                        {s.project?.name} · {PAYMENT_LABEL[s.payment_system ?? ""] ?? s.payment_system}
                      </div>
                    </div>
                    <ChevronRight size={16} color={C.muted} />
                  </div>
                  {/* Progress bar */}
                  <div>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                      <span style={{ fontSize: 11, color: C.mid }}>Progress Fisik</span>
                      <span style={{ fontSize: 11, fontWeight: 600, color: C.navy }}>{progress}%</span>
                    </div>
                    <div style={{ height: 5, background: C.border, borderRadius: 6, overflow: "hidden" }}>
                      <div style={{ height: "100%", borderRadius: 6, background: C.navy, width: `${progress}%`, transition: "width 0.3s" }} />
                    </div>
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      </section>

      {/* Recent Wage Reports */}
      {recentReports.length > 0 && (
        <section style={{ marginBottom: 24 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
            <h2 style={{ fontSize: 15, fontWeight: 700, color: C.text, margin: 0 }}>Laporan Upah Terbaru</h2>
            <Link href="/mandor-portal/laporan-upah" style={{ fontSize: 13, color: C.navy, textDecoration: "none", fontWeight: 500 }}>
              Lihat semua →
            </Link>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {recentReports.map((r) => {
              const meta = REPORT_STATUS[r.status ?? ""] ?? REPORT_STATUS.submitted;
              return (
                <div key={r.id} style={{
                  background: C.surface, borderRadius: 10, padding: "12px 16px",
                  border: `1px solid ${C.border}`, boxShadow: "var(--naik-1)",
                  display: "flex", justifyContent: "space-between", alignItems: "center",
                }}>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: C.text }}>{r.scope?.scope_name ?? "—"}</div>
                    <div style={{ fontSize: 11, color: C.mid }}>{fmtDate(r.week_start ?? null)} – {fmtDate(r.week_end ?? null)}</div>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: C.text }}>{fmt(Number(r.net_amount ?? 0))}</div>
                    <div style={{ fontSize: 11, color: meta.color, fontWeight: 500 }}>{meta.label}</div>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* Recent Kasbons */}
      <section>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <h2 style={{ fontSize: 15, fontWeight: 700, color: C.text, margin: 0 }}>Kasbon Terbaru</h2>
          <Link href="/mandor-portal/kasbon" style={{ fontSize: 13, color: C.navy, textDecoration: "none", fontWeight: 500 }}>
            Lihat semua →
          </Link>
        </div>

        {loading && <div style={{ textAlign: "center", padding: 40, color: C.mid }}>Memuat...</div>}

        {!loading && recentKasbons.length === 0 && (
          // Berbeda dari lingkup kerja di atas: kasbon MEMANG bisa diajukan
          // mandor sendiri, jadi di sini tombolnya benar — mengarah ke tempat
          // pengajuannya, bukan sekadar memberi tahu.
          <Kosong
            ikon={<Wallet size={28} />}
            judul="Belum ada kasbon"
            sebab={
              activeScopes.length === 0 ? (
                <>
                  Kasbon selalu menunjuk ke satu lingkup kerja, dan Anda belum
                  punya penugasan aktif. Setelah lingkup kerja masuk, pengajuan
                  bisa dibuat dari halaman Kasbon Saya.
                </>
              ) : (
                <>
                  Kasbon adalah uang muka untuk kebutuhan lapangan, dan
                  potongannya otomatis masuk ke laporan upah berikutnya.
                  Ajukan dari halaman Kasbon Saya.
                </>
              )
            }
            aksi={
              activeScopes.length > 0 ? (
                <Link
                  href="/mandor-portal/kasbon"
                  style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "8px 16px", borderRadius: 6, background: "var(--grad-aksen)", color: "var(--on-navy)", fontSize: 13, fontWeight: 600, textDecoration: "none" }}
                >
                  Ajukan kasbon
                </Link>
              ) : undefined
            }
          />
        )}

        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {recentKasbons.map((k) => {
            const meta = KASBON_STATUS[k.status ?? ""] ?? KASBON_STATUS.pending;
            return (
              <div key={k.id} style={{
                background: C.surface, borderRadius: 10, padding: "12px 16px",
                border: `1px solid ${C.border}`, boxShadow: "var(--naik-1)",
                display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12,
              }}>
                <div style={{ flex: 1 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                    <span style={{ fontSize: 13, fontWeight: 600, color: C.text }}>{fmt(Number(k.amount ?? 0))}</span>
                    <span style={{ fontSize: 11, fontWeight: 600, padding: "2px 8px", borderRadius: 20, color: meta.color, background: meta.bg }}>
                      {meta.label}
                    </span>
                  </div>
                  <div style={{ fontSize: 12, color: C.mid }}>
                    {k.work_scopes?.scope_name ?? "—"} · {fmtDate(k.kasbon_date ?? null)}
                  </div>
                </div>
                {k.status === "approved" && <CheckCircle size={16} color={C.green} />}
                {k.status === "pending" && <Clock size={16} color={C.yellow} />}
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}
