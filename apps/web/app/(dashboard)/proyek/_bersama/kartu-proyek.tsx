"use client";

/**
 * KARTU PROYEK — tampilan grid & daftar untuk lapis DETAIL `/proyek`.
 *
 * ── Kenapa dipindah keluar dari `page.tsx`
 *
 * `page.tsx` berubah dari "langsung daftar" jadi dashboard tiga lapis
 * (UI-2-3): KPI → grafik → daftar. Kedua kartu di bawah ini adalah lapis
 * ketiganya, dan isinya tidak berubah sama sekali — hanya pindah rumah,
 * supaya halamannya tetap di bawah batas 800 baris tanpa memotong satu pun
 * informasi yang sudah ada di sana.
 *
 * Yang SENGAJA tidak ikut disederhanakan: status, model kontrak, klien, PM,
 * serapan, nilai kontrak, dan tenggat. Semuanya sudah dipakai orang; menghapus
 * kolom saat memindahkan berkas adalah cara paling senyap menghilangkan fitur.
 */

import {
  AlertTriangle, ArrowRight, Calendar, Clock, MapPin, User,
} from "lucide-react";
import { C } from "@/lib/warna-ui";
import { selisihHari } from "@/lib/ringkasan-proyek";
import { formatRupiah } from "@/lib/format";

// ─── Tipe ────────────────────────────────────────────────────────────────────

export interface Client { id: string; contact_person: string; phone: string; client_type: string }
export interface PM { id: string; name: string; email: string; phone: string }

export interface Project {
  id: string;
  name: string;
  description: string | null;
  location: string;
  contract_model: "termin" | "komisi";
  tax_scheme: "pph_final" | "ppn";
  contract_value: number;
  commission_pct: number | null;
  start_date: string;
  end_date: string;
  actual_end_date: string | null;
  status: "draft" | "active" | "on_hold" | "completed" | "cancelled";
  progress_pct: number;
  notes: string | null;
  created_at: string;
  clients: Client | null;
  pm: PM | null;
}

// ─── Format ──────────────────────────────────────────────────────────────────

export const fmt = formatRupiah;

export const fmtCompact = (n: number) => {
  if (n >= 1_000_000_000) return `Rp ${(n / 1_000_000_000).toFixed(1)}M`;
  if (n >= 1_000_000) return `Rp ${(n / 1_000_000).toFixed(0)}jt`;
  return fmt(n);
};

export const fmtDate = (d: string) =>
  new Date(d).toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" });

export const fmtDateShort = (d: string) =>
  new Date(d).toLocaleDateString("id-ID", { day: "numeric", month: "short" });

const initials = (name: string) =>
  name.split(" ").slice(0, 2).map((w) => w[0]).join("").toUpperCase();

export const kartu: React.CSSProperties = {
  background: "var(--surface)",
  border: "1px solid var(--border)",
  borderRadius: 14,
  boxShadow: "var(--naik-1)",
};

export const STATUS_META: Record<string, { label: string; color: string; bg: string; border: string }> = {
  active:      { label: "Aktif",       color: C.navy,   bg: C.navyLight,            border: "var(--info-border)" },
  in_progress: { label: "Berlangsung", color: C.navy,   bg: C.navyLight,            border: "var(--info-border)" },
  completed:   { label: "Selesai",     color: C.green,  bg: C.greenBg,              border: C.greenBorder },
  on_hold:     { label: "Ditunda",     color: C.yellow, bg: C.yellowBg,             border: C.yellowBorder },
  draft:       { label: "Draft",       color: C.muted,  bg: "var(--surface-hover)", border: "var(--border)" },
  cancelled:   { label: "Batal",       color: C.red,    bg: C.redBg,                border: C.redBorder },
};

// ─── Bagian kecil ────────────────────────────────────────────────────────────

export function Skeleton({ h = 20, w = "100%" }: { h?: number; w?: string | number }) {
  return (
    <div style={{
      height: h, width: w, borderRadius: 6,
      background: "linear-gradient(90deg, var(--surface-hover) 0%, var(--border) 50%, var(--surface-hover) 100%)",
      backgroundSize: "200% 100%",
      animation: "shimmer 1.5s ease-in-out infinite",
    }} />
  );
}

export function StatusBadge({ status }: { status: string }) {
  const m = STATUS_META[status] ?? { label: status, color: C.muted, bg: "var(--surface-hover)", border: "var(--border)" };
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 4,
      padding: "2px 8px", borderRadius: 99, fontSize: 11, fontWeight: 600,
      color: m.color, background: m.bg, border: `1px solid ${m.border}`,
    }}>
      <span aria-hidden="true" style={{ width: 5, height: 5, borderRadius: "50%", background: m.color, flexShrink: 0 }} />
      {m.label}
    </span>
  );
}

function ModelBadge({ model }: { model: "termin" | "komisi" }) {
  return (
    <span style={{
      display: "inline-block", padding: "2px 8px", borderRadius: 6,
      fontSize: 10, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase",
      background: "var(--surface-hover)", color: C.mid, border: "1px solid var(--border)",
    }}>
      {model === "termin" ? "TERMIN" : "KOMISI"}
    </span>
  );
}

function Avatar({ name, size = 28 }: { name: string; size?: number }) {
  return (
    <div aria-hidden="true" style={{
      width: size, height: size, borderRadius: "50%",
      background: C.navyLight, color: C.navy,
      display: "flex", alignItems: "center", justifyContent: "center",
      fontSize: size * 0.36, fontWeight: 700, flexShrink: 0,
      border: "1.5px solid var(--info-border)",
    }}>
      {initials(name)}
    </div>
  );
}

export function ProgressBar({ pct, color = C.navy }: { pct: number; color?: string }) {
  return (
    <div style={{ height: 6, background: "var(--surface-hover)", borderRadius: 0, overflow: "hidden" }}>
      <div style={{
        height: "100%", width: `${Math.min(pct, 100)}%`,
        background: `linear-gradient(90deg, ${color}, color-mix(in srgb, ${color} 80%, transparent))`,
        borderRadius: 0, transition: "width 0.5s ease",
      }} />
    </div>
  );
}

/**
 * Keadaan tenggat sebuah proyek.
 *
 * Dihitung lewat `selisihHari` (`lib/ringkasan-proyek.ts`), BUKAN lewat
 * `new Date(d) - Date.now()` seperti versi sebelumnya. Yang lama mencampur
 * tengah malam UTC dengan jam lokal WIB, sehingga proyek yang tenggatnya
 * hari ini bisa berubah dari "0 hari lagi" jadi "1 hari terlambat" hanya
 * karena jam dinding lewat pukul lima sore. Sekarang halaman ini dan KPI di
 * atasnya memakai definisi "terlambat" yang SAMA — dua angka yang berbeda
 * untuk hal yang sama adalah cara tercepat membuat orang tak percaya keduanya.
 */
export function keadaanTenggat(p: Project, hariIni: string) {
  const sisa = selisihHari(hariIni, p.end_date);
  const beres = p.status === "completed" || p.status === "cancelled";
  return {
    sisa,
    lewat: !beres && sisa < 0,
    segera: !beres && sisa >= 0 && sisa <= 14,
  };
}

// ─── Kartu grid ──────────────────────────────────────────────────────────────

export function ProjectCardGrid({ project: p, hariIni, onClick }: {
  project: Project; hariIni: string; onClick: () => void;
}) {
  const { sisa, lewat, segera } = keadaanTenggat(p, hariIni);

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={e => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();   // Spasi jangan menggulir daftar proyek
          onClick();
        }
      }}
      style={{
        ...kartu, padding: 20, cursor: "pointer",
        transition: "all 0.15s ease",
        borderColor: lewat ? C.redBorder : segera ? C.yellowBorder : "var(--border)",
      }}
      onMouseEnter={e => {
        e.currentTarget.style.boxShadow = "var(--naik-2)";
        e.currentTarget.style.transform = "translateY(-2px)";
      }}
      onMouseLeave={e => {
        e.currentTarget.style.boxShadow = "var(--naik-1)";
        e.currentTarget.style.transform = "translateY(0)";
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 10, flexWrap: "wrap" }}>
        <StatusBadge status={p.status} />
        <ModelBadge model={p.contract_model} />
        {lewat && (
          <span style={{
            marginLeft: "auto", display: "inline-flex", alignItems: "center", gap: 2,
            padding: "2px 8px", borderRadius: 99, fontSize: 10, fontWeight: 700,
            background: C.redBg, color: C.onDangerBg, border: `1px solid ${C.redBorder}`,
          }}>
            <AlertTriangle size={9} aria-hidden="true" /> {Math.abs(sisa)}h terlambat
          </span>
        )}
        {segera && (
          <span style={{
            marginLeft: "auto", display: "inline-flex", alignItems: "center", gap: 2,
            padding: "2px 8px", borderRadius: 99, fontSize: 10, fontWeight: 700,
            background: C.yellowBg, color: C.onWarningBg, border: `1px solid ${C.yellowBorder}`,
          }}>
            <Clock size={9} aria-hidden="true" /> {sisa}h lagi
          </span>
        )}
      </div>

      <h3 style={{ fontSize: 15, fontWeight: 700, color: C.text, marginBottom: 4, lineHeight: 1.35 }}>
        {p.name}
      </h3>

      <div style={{ display: "flex", alignItems: "center", gap: 4, marginBottom: 14 }}>
        <MapPin size={11} aria-hidden="true" style={{ color: C.muted, flexShrink: 0 }} />
        <span style={{ fontSize: 12, color: C.muted }}>{p.location}</span>
      </div>

      <div style={{
        display: "flex", alignItems: "center", gap: 12,
        paddingBottom: 14, borderBottom: "1px solid var(--surface-hover)", marginBottom: 14,
      }}>
        {p.clients && (
          <div style={{ display: "flex", alignItems: "center", gap: 6, flex: 1, minWidth: 0 }}>
            <Avatar name={p.clients.contact_person} size={26} />
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 10, color: C.muted }}>Klien</div>
              <div style={{ fontSize: 12, fontWeight: 500, color: C.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {p.clients.contact_person}
              </div>
            </div>
          </div>
        )}
        {p.clients && p.pm && <div aria-hidden="true" style={{ width: 1, height: 28, background: "var(--surface-hover)", flexShrink: 0 }} />}
        {p.pm && (
          <div style={{ display: "flex", alignItems: "center", gap: 6, flex: 1, minWidth: 0 }}>
            <Avatar name={p.pm.name} size={26} />
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 10, color: C.muted }}>PM</div>
              <div style={{ fontSize: 12, fontWeight: 500, color: C.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {p.pm.name}
              </div>
            </div>
          </div>
        )}
      </div>

      <div style={{ marginBottom: 14 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
          <span style={{ fontSize: 11, color: C.muted }}>Serapan Anggaran</span>
          <span style={{ fontSize: 13, fontWeight: 700, color: C.navy }}>{Number(p.progress_pct).toFixed(1)}%</span>
        </div>
        <ProgressBar pct={Number(p.progress_pct)} color="var(--info)" />
      </div>

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
        <div>
          <div style={{ fontSize: 10, color: C.muted, marginBottom: 2 }}>Nilai Kontrak</div>
          <div style={{ fontSize: 13, fontWeight: 700, color: C.text }}>{fmtCompact(Number(p.contract_value))}</div>
        </div>
        <div style={{ textAlign: "right" }}>
          <div style={{ fontSize: 10, color: C.muted, marginBottom: 2 }}>Tenggat</div>
          <div style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 12, color: lewat ? C.red : C.mid, fontWeight: lewat ? 600 : 400 }}>
            <Calendar size={11} aria-hidden="true" />
            {fmtDate(p.end_date)}
          </div>
        </div>
        <div aria-hidden="true" style={{
          width: 30, height: 30, borderRadius: 6, flexShrink: 0,
          background: C.navyLight, display: "flex", alignItems: "center", justifyContent: "center",
        }}>
          <ArrowRight size={13} style={{ color: C.navy }} />
        </div>
      </div>
    </div>
  );
}

// ─── Kartu daftar ────────────────────────────────────────────────────────────

export function ProjectCardList({ project: p, hariIni, onClick }: {
  project: Project; hariIni: string; onClick: () => void;
}) {
  const { sisa, lewat, segera } = keadaanTenggat(p, hariIni);

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={e => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();   // Spasi jangan menggulir daftar
          onClick();
        }
      }}
      style={{
        ...kartu, padding: "16px 20px", cursor: "pointer",
        display: "grid",
        gridTemplateColumns: "1fr 160px 160px 120px 36px",
        alignItems: "center", gap: "var(--gap-bagian)",
        transition: "all 0.15s ease",
        borderColor: lewat ? C.redBorder : "var(--border)",
      }}
      onMouseEnter={e => {
        e.currentTarget.style.boxShadow = "var(--naik-2)";
        e.currentTarget.style.borderColor = lewat ? C.redBorder : "var(--info-border)";
      }}
      onMouseLeave={e => {
        e.currentTarget.style.boxShadow = "var(--naik-1)";
        e.currentTarget.style.borderColor = lewat ? C.redBorder : "var(--border)";
      }}
    >
      <div style={{ minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 5, flexWrap: "wrap" }}>
          <StatusBadge status={p.status} />
          <ModelBadge model={p.contract_model} />
        </div>
        <div style={{ fontSize: 13, fontWeight: 700, color: C.text, marginBottom: 3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {p.name}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <span style={{ display: "flex", alignItems: "center", gap: 2, fontSize: 11, color: C.muted }}>
            <MapPin size={10} aria-hidden="true" /> {p.location}
          </span>
          {p.clients && (
            <span style={{ display: "flex", alignItems: "center", gap: 2, fontSize: 11, color: C.muted }}>
              <User size={10} aria-hidden="true" /> {p.clients.contact_person}
            </span>
          )}
        </div>
      </div>

      <div>
        <div style={{ fontSize: 13, fontWeight: 700, color: C.text, marginBottom: 3 }}>
          {fmtCompact(Number(p.contract_value))}
        </div>
        {p.pm && (
          <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <Avatar name={p.pm.name} size={18} />
            <span style={{ fontSize: 11, color: C.mid, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {p.pm.name}
            </span>
          </div>
        )}
      </div>

      <div>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 5 }}>
          <span style={{ fontSize: 10, color: C.muted }}>Serapan</span>
          <span style={{ fontSize: 11, fontWeight: 700, color: C.navy }}>{Number(p.progress_pct).toFixed(1)}%</span>
        </div>
        <ProgressBar pct={Number(p.progress_pct)} color="var(--info)" />
      </div>

      <div style={{ textAlign: "right" }}>
        <div style={{ fontSize: 10, color: C.muted, marginBottom: 3 }}>Tenggat</div>
        <div style={{ fontSize: 12, fontWeight: lewat ? 600 : 400, color: lewat ? C.red : segera ? C.yellow : C.mid }}>
          {fmtDateShort(p.end_date)}
        </div>
        {lewat && <div style={{ fontSize: 10, color: C.red, marginTop: 2 }}>{Math.abs(sisa)}h terlambat</div>}
        {segera && <div style={{ fontSize: 10, color: C.yellow, marginTop: 2 }}>{sisa}h lagi</div>}
      </div>

      <div aria-hidden="true" style={{
        width: 30, height: 30, borderRadius: 6,
        background: C.navyLight, display: "flex", alignItems: "center", justifyContent: "center",
      }}>
        <ArrowRight size={13} style={{ color: C.navy }} />
      </div>
    </div>
  );
}
