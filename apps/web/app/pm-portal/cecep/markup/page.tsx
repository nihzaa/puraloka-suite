"use client";

// ============================================================================
// Markup & Margin — READ-ONLY untuk PM (Tahap 3, Task 20).
//
// ── Dua endpoint GET berbeda di markup.ts — verifikasi ULANG langsung ke kode
//
// `apps/api/src/routes/v1/markup.ts` punya DUA rute GET yang mudah tertukar:
//
//   - `GET /api/v1/markup` (markup.ts:46-78) — daftar SELURUH periode markup
//     (`periode`), PLUS markup umum yang berlaku HARI INI (`berlaku`) dan
//     markup per jenis pekerjaan yang punya barisnya sendiri
//     (`berlaku_per_jenis`). INI yang dipakai halaman ini — endpoint LIST.
//   - `GET /api/v1/markup/berlaku?pada=&jenis=&biaya_pokok=` (markup.ts:81-130)
//     — menjawab SATU markup untuk SATU konteks (tanggal+jenis), objek
//     TUNGGAL `{ markup, pada, rincian, margin_persen }`. `biaya_pokok`
//     adalah query param OPSIONAL untuk kalkulator penawaran di endpoint yang
//     SAMA — bukan field respons list. TIDAK dipakai halaman ini.
//
// Ditemukan salah pakai di draf pertama Task 17 (endpoint kalkulator dipakai
// untuk kebutuhan daftar) — diperbaiki, dan diverifikasi ULANG langsung ke
// kode untuk Task 20 (bukan cuma percaya brief).
//
// ── Field: EMPAT fraksi terpisah, bukan satu `persentase`
//
// `SELECT` konstan (`markup.ts:34-38`): `jenis_pekerjaan`, `berlaku_sejak`,
// `overhead_fraksi`, `keuntungan_fraksi`, `kontinjensi_fraksi`, `buk_fraksi`,
// `alasan`, `catatan`, `ditetapkan_oleh`, `created_at`. Empat fraksi berbeda
// karena overhead/keuntungan/kontinjensi/BUK adalah empat keputusan bisnis
// terpisah — BUK (dikirim ke `computeAhsp`, `lib/markup.ts:139`) adalah angka
// yang BENAR-BENAR dipakai menghitung penawaran, jadi diberi penekanan visual.
//
// ── Kenapa TANPA tombol tambah/edit
//
// PM punya `cecep:markup:view` TAPI TIDAK `cecep:markup:manage` — diverifikasi
// LANGSUNG ke `role_permissions` (query live 2026-08-21): `cecep:markup:manage`
// hanya dimiliki `admin`/`estimator` (diturunkan dari `cecep:estimate:approve`,
// yang PM juga tak punya — konsisten SoD Task 19). Halaman ini karena itu
// TIDAK punya satu pun tombol tulis — tak perlu gerbang `hasPermission()`
// karena memang tak ada aksi yang dirender sama sekali.
// ============================================================================

import { useMemo } from "react";
import { Percent } from "lucide-react";
import { useData } from "@/lib/data-cache";
import EmptyState from "@/components/portal/EmptyState";
import SkeletonCard from "@/components/portal/SkeletonCard";
import type { RespMarkupList, PeriodeMarkup, MarkupTerpilih, GalatApi } from "../../_bersama/tipe";
import { pesanGalat } from "../../_bersama/tipe";

function fmtPct(v: number | string | null | undefined): string {
  if (v === null || v === undefined) return "—";
  const n = typeof v === "string" ? Number(v) : v;
  if (!Number.isFinite(n)) return "—";
  return `${(n * 100).toFixed(1)}%`;
}
function fmtTanggal(s: string): string {
  return new Date(s).toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric" });
}

function KartuBerlaku({ label, m }: { label: string; m: MarkupTerpilih | null }) {
  if (!m) {
    return (
      <div
        style={{
          padding: "var(--pad-kartu)",
          borderRadius: "var(--portal-radius-card)",
          background: "var(--warning-bg)",
          border: "1px solid var(--warning-border)",
        }}
      >
        <div style={{ fontSize: 12, fontWeight: 700, color: "var(--on-warning-bg)" }}>{label}</div>
        <div style={{ fontSize: 12, color: "var(--on-warning-bg)", marginTop: 2 }}>Belum ditetapkan.</div>
      </div>
    );
  }
  return (
    <div
      style={{
        padding: "var(--pad-kartu)",
        borderRadius: "var(--portal-radius-card)",
        background: "var(--surface)",
        border: "1px solid var(--border)",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: "var(--text-secondary)" }}>{label}</div>
        <div style={{ fontSize: 18, fontWeight: 700, color: "var(--navy)" }}>{fmtPct(m.buk)}</div>
      </div>
      <div style={{ fontSize: 11, color: "var(--text-secondary)", marginTop: 4 }}>
        Overhead {fmtPct(m.overhead)} · Keuntungan {fmtPct(m.keuntungan)} · Kontinjensi {fmtPct(m.kontinjensi)}
        {m.dari_umum ? " · dari aturan umum" : ""}
      </div>
    </div>
  );
}

export default function PmMarkupPage() {
  const { data, memuat, galat: galatMuat } = useData<RespMarkupList>("/api/v1/markup");
  const galat = galatMuat ? pesanGalat(galatMuat as GalatApi, "Gagal memuat markup.") : null;

  const kelompok = useMemo(() => {
    const m = new Map<string, PeriodeMarkup[]>();
    for (const p of data?.periode ?? []) {
      const k = p.jenis_pekerjaan ?? "(umum)";
      m.set(k, [...(m.get(k) ?? []), p]);
    }
    return [...m.entries()].sort(([a], [b]) => (a === "(umum)" ? -1 : b === "(umum)" ? 1 : a.localeCompare(b)));
  }, [data]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--gap-bagian)" }}>
      <h1 style={{ fontSize: 20, fontWeight: 700, color: "var(--text-primary)", margin: 0 }}>Markup &amp; Margin</h1>
      <p style={{ fontSize: 12, color: "var(--text-secondary)", margin: 0 }}>
        Angka yang menentukan laba tiap penawaran. Mengubah aturan hanya tersedia di web.
      </p>

      {memuat && <SkeletonCard tinggi={72} />}
      {galat && <EmptyState icon={Percent} judul="Gagal memuat" deskripsi={galat} />}

      {!memuat && !galat && (
        <>
          <div style={{ fontSize: 13, fontWeight: 700, color: "var(--text-secondary)" }}>Berlaku hari ini</div>
          <KartuBerlaku label="Umum" m={data?.berlaku ?? null} />
          {(data?.berlaku_per_jenis ?? []).map((b) => (
            <KartuBerlaku key={b.jenis_pekerjaan} label={b.jenis_pekerjaan} m={b.markup} />
          ))}
        </>
      )}

      {!memuat && !galat && (data?.periode ?? []).length === 0 && (
        <EmptyState icon={Percent} judul="Belum ada periode" deskripsi="Markup belum pernah ditetapkan." />
      )}

      {!memuat && !galat && kelompok.length > 0 && (
        <>
          <div style={{ fontSize: 13, fontWeight: 700, color: "var(--text-secondary)", marginTop: 8 }}>Riwayat periode</div>
          {kelompok.map(([jenis, daftar]) => (
            <div key={jenis} style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: "var(--text-secondary)" }}>
                {jenis === "(umum)" ? "Umum" : jenis}
              </div>
              {daftar
                .slice()
                .sort((a, b) => b.berlaku_sejak.localeCompare(a.berlaku_sejak))
                .map((p) => (
                  <div
                    key={p.id}
                    style={{
                      padding: "var(--pad-kartu)",
                      borderRadius: "var(--portal-radius-card)",
                      background: "var(--surface)",
                      border: "1px solid var(--border)",
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <span style={{ fontSize: 12, color: "var(--text-secondary)" }}>Berlaku sejak {fmtTanggal(p.berlaku_sejak)}</span>
                      <span style={{ fontSize: 14, fontWeight: 700, color: "var(--navy)" }}>BUK {fmtPct(p.buk_fraksi)}</span>
                    </div>
                    <div style={{ fontSize: 11, color: "var(--text-secondary)", marginTop: 2 }}>
                      Overhead {fmtPct(p.overhead_fraksi)} · Keuntungan {fmtPct(p.keuntungan_fraksi)} · Kontinjensi {fmtPct(p.kontinjensi_fraksi)}
                    </div>
                    {p.alasan && (
                      <div style={{ fontSize: 11, color: "var(--text-secondary)", marginTop: 4, fontStyle: "italic" }}>{p.alasan}</div>
                    )}
                  </div>
                ))}
            </div>
          ))}
        </>
      )}
    </div>
  );
}
