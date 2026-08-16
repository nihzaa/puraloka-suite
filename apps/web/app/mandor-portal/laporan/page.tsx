"use client";

import { useState } from "react";
import { useData } from "@/lib/data-cache";
import { AlertCircle, ChevronDown, ChevronUp } from "lucide-react";

import { C } from "@/lib/warna-ui";
import { Tabel } from "@/components/dasar";

/** Satu baris upah pekerja di dalam laporan mingguan. */
interface WageItem {
  id: string;
  worker?: { name?: string } | null;
  days_worked?: number | null;
  daily_rate: number;
}

function fmt(n: number) {
  return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(n);
}
function fmtDate(s: string | null) {
  if (!s) return "—";
  return new Date(s).toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric" });
}

const STATUS_META: Record<string, { label: string; color: string; bg: string }> = {
  draft:     { label: "Draft",     color: C.mid,    bg: "var(--surface-hover)"  },
  submitted: { label: "Diajukan",  color: C.yellow, bg: C.yellowBg },
  approved:  { label: "Disetujui", color: C.green,  bg: C.greenBg  },
  rejected:  { label: "Ditolak",   color: C.red,    bg: C.redBg    },
  paid:      { label: "Dibayar",   color: C.navy,   bg: C.navyLight},
};

export default function MandorLaporanPage() {
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  // ── PINDAH KE LAPIS CACHE BERSAMA (F4-2), 2026-08-16 — halaman ini
  // hanya baca, tak ada tulis lapangan, jadi tak ada cache offline yang
  // perlu dipertahankan.
  const { data, memuat: loading, galat: galatMuat } = useData<{ reports: any[] }>("/api/v1/mandor/wage-reports");
  const reports = data?.reports ?? [];

  function toggle(id: string) {
    setExpanded((prev) => ({ ...prev, [id]: !prev[id] }));
  }

  if (loading) return <div style={{ textAlign: "center", padding: 60, color: C.mid }}>Memuat laporan upah...</div>;
  if (galatMuat) return (
    <div role="alert" style={{ textAlign: "center", padding: 60, color: C.red }}>
      Gagal memuat laporan upah. Coba muat ulang halaman.
    </div>
  );

  return (
    <div style={{ maxWidth: 800, margin: "0 auto" }}>
      <h1 style={{ fontSize: 20, fontWeight: 700, color: C.text, margin: "0 0 20px" }}>Laporan Upah Mingguan</h1>

      {reports.length === 0 && (
        <div style={{ background: C.surface, borderRadius: 10, padding: 48, border: `1px solid ${C.border}`, textAlign: "center" }}>
          <AlertCircle size={32} color={C.muted} style={{ marginBottom: 8 }} />
          <div style={{ fontSize: 13, color: C.mid }}>Belum ada laporan upah</div>
        </div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {reports.map((r) => {
          const meta = STATUS_META[r.status] ?? STATUS_META.draft;
          const isOpen = expanded[r.id] ?? false;
          const items: WageItem[] = r.wage_items ?? [];
          const totalWage = items.reduce((s, i) => s + (i.daily_rate * (i.days_worked ?? 1)), 0) || r.total_amount;

          return (
            <div key={r.id} style={{ background: C.surface, borderRadius: 10, border: `1px solid ${C.border}`, overflow: "hidden", boxShadow: "var(--naik-1)" }}>
              {/* Header row */}
              <button
                onClick={() => toggle(r.id)}
                style={{ width: "100%", padding: "16px 20px", display: "flex", alignItems: "center", justifyContent: "space-between", background: "none", border: "none", cursor: "pointer", textAlign: "left" }}
              >
                <div style={{ flex: 1 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4, flexWrap: "wrap" }}>
                    <span style={{ fontSize: 13, fontWeight: 700, color: C.text }}>
                      {fmtDate(r.week_start)} – {fmtDate(r.week_end)}
                    </span>
                    <span style={{ fontSize: 11, fontWeight: 600, padding: "2px 8px", borderRadius: 20, color: meta.color, background: meta.bg }}>
                      {meta.label}
                    </span>
                  </div>
                  <div style={{ display: "flex", gap: 16, fontSize: 12, color: C.mid, flexWrap: "wrap" }}>
                    <span>{r.assignment?.project?.name ?? "—"}</span>
                    <span style={{ fontWeight: 600, color: C.navy }}>{fmt(r.total_amount ?? totalWage)}</span>
                    {items.length > 0 && <span>{items.length} pekerja</span>}
                  </div>
                </div>
                {isOpen ? <ChevronUp size={18} color={C.mid} /> : <ChevronDown size={18} color={C.mid} />}
              </button>

              {/* Detail */}
              {isOpen && (
                <div style={{ borderTop: `1px solid ${C.border}`, padding: "16px 20px" }}>
                  {r.notes && (
                    <p style={{ fontSize: 13, color: C.mid, margin: "0 0 14px", fontStyle: "italic" }}>{r.notes}</p>
                  )}

                  {items.length > 0 ? (
                    /* Dipindahkan ke <Tabel> 2026-08-07 (UI-0-4). Caption,
                       scope="row", tabular-nums, dan overflow-x sekarang
                       dijamin komponen — empat hal yang tabel mentah harus
                       ingat sendiri, dan yang riwayat repo ini tunjukkan
                       TIDAK diingat. Baris totalnya pindah ke <tfoot>: di
                       <tbody> ia terbaca sebagai data biasa. */
                    <Tabel<WageItem>
              berpermukaan
                      caption="Rincian upah per pekerja untuk laporan minggu ini: hari kerja, upah harian, dan jumlah yang diterima masing-masing."
                      data={items}
                      kunciBaris={(i) => i.id}
                      kolom={[
                        { kunci: "pekerja", judul: "Pekerja", kepalaBaris: true,
                          render: (i) => i.worker?.name ?? "—" },
                        { kunci: "hari", judul: "Hari Kerja", rata: "kanan",
                          render: (i) => i.days_worked ?? 1 },
                        { kunci: "rate", judul: "Rate/Hari", rata: "kanan",
                          render: (i) => fmt(i.daily_rate) },
                        { kunci: "subtotal", judul: "Subtotal", rata: "kanan",
                          render: (i) => fmt(i.daily_rate * (i.days_worked ?? 1)) },
                      ]}
                      total={[
                        { kunci: "label", isi: "Total", rata: "kanan", rentang: 3 },
                        { kunci: "nilai", isi: fmt(r.total_amount ?? totalWage), rata: "kanan" },
                      ]}
                    />
                  ) : (
                    <div style={{ fontSize: 13, color: C.mid, textAlign: "center", padding: "12px 0" }}>
                      Total upah: <strong style={{ color: C.navy }}>{fmt(r.total_amount ?? 0)}</strong>
                    </div>
                  )}

                  {r.status === "rejected" && r.notes && (
                    <div style={{ marginTop: 12, padding: "8px 12px", borderRadius: 6, background: C.redBg, border: `1px solid ${C.red}20` }}>
                      <div style={{ fontSize: 12, color: C.red, fontWeight: 600 }}>Alasan ditolak:</div>
                      <div style={{ fontSize: 13, color: C.red, marginTop: 2 }}>{r.notes}</div>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
