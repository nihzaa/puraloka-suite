"use client";

/**
 * UMUR PIUTANG — berapa lama uang yang belum masuk sudah menunggu.
 *
 * ── Kenapa ini yang ditambahkan, bukan grafik lain
 *
 * Endpoint `/api/v1/finance/ar-aging` sudah ada dan TIDAK PERNAH dipakai UI
 * — persis kelas "API tanpa layar" yang bikin fitur terasa hilang padahal
 * datanya siap. Ditemukan saat menyisir endpoint keuangan.
 *
 * Yang dijawabnya berbeda dari KPI "Outstanding Invoice" di atas. KPI itu
 * bilang BERAPA; ini bilang SEJAK KAPAN. Rp 120 juta yang menunggu 10 hari
 * dan Rp 120 juta yang menunggu 90 hari adalah dua situasi yang sama sekali
 * berbeda — yang kedua kemungkinan besar tak akan pernah masuk.
 *
 * ── Kenapa batang bertumpuk horizontal, bukan donat
 *
 * Halaman ini sudah punya batang vertikal (arus kas). Mengulang bentuk yang
 * sama membuat mata berhenti membedakan — dan founder secara khusus meminta
 * variasi ("ga masalah untuk tidak pakai pola yang sama").
 *
 * Bertumpuk horizontal juga yang paling tepat untuk data ini: ember umur
 * punya URUTAN alami (0-30 → 90+), dan sumbu mendatar membacanya sebagai
 * perjalanan waktu. Donat akan membuang urutan itu.
 */

import { C } from "@/lib/warna-ui";

/**
 * Bentuk `buckets` dari API: `Record<AgingBucketKey, number>` — ANGKA
 * langsung, bukan objek `{ amount, count }`.
 *
 * Kuncinya `d1_30` (dengan awalan `d`), bukan `1_30`. Diverifikasi di
 * `apps/api/src/lib/ar-register.ts:8` — bukan ditebak. Menebak nama kunci
 * menghasilkan grafik kosong tanpa satu pun galat, kelas kegagalan yang
 * persis sama dengan endpoint yang salah tulis.
 */
export type PetaUmur = Partial<Record<
  "current" | "d1_30" | "d31_60" | "d61_90" | "d90_plus", number
>>;

const rp = (n: number) => {
  if (n >= 1_000_000_000) return `Rp ${(n / 1_000_000_000).toFixed(1)}M`;
  if (n >= 1_000_000) return `Rp ${(n / 1_000_000).toFixed(0)}jt`;
  if (n >= 1_000) return `Rp ${(n / 1_000).toFixed(0)}rb`;
  return `Rp ${n}`;
};

/**
 * Urutan dan warna ember.
 *
 * Warnanya MENANJAK dari netral ke bahaya, bukan lima warna berbeda: umur
 * piutang adalah satu sumbu yang memburuk, dan warna yang menanjak
 * membacanya tanpa perlu legenda. Warna acak akan menyembunyikan itu.
 */
const EMBER = [
  { kunci: "current",  label: "Belum jatuh tempo", warna: C.navy,   ket: "masih dalam tenggat" },
  { kunci: "d1_30",    label: "1–30 hari",         warna: C.blue,   ket: "baru lewat" },
  { kunci: "d31_60",   label: "31–60 hari",        warna: C.yellow, ket: "perlu ditagih" },
  { kunci: "d61_90",   label: "61–90 hari",        warna: C.orange, ket: "sudah lama" },
  { kunci: "d90_plus", label: "lebih dari 90 hari", warna: C.red,   ket: "berisiko tak tertagih" },
] as const;

export function UmurPiutang({ buckets, total }: {
  buckets: PetaUmur | null;
  total: number;
}) {
  const data = EMBER.map((e) => ({ ...e, amount: buckets?.[e.kunci] ?? 0 }));
  const jumlah = total || data.reduce((s, d) => s + d.amount, 0);

  if (!jumlah) {
    return (
      <div style={{
        padding: "28px 16px", textAlign: "center", color: C.muted, fontSize: 13,
        background: "var(--surface-subtle)", borderRadius: 12,
        border: `1px solid ${C.border}`,
      }}>
        Tidak ada piutang beredar — semua invoice sudah lunas.
      </div>
    );
  }

  // Yang sudah lewat tenggat = semua kecuali ember pertama. Angka ini yang
  // benar-benar menentukan tindakan, jadi ia disebut terpisah.
  const lewat = data.slice(1).reduce((s, d) => s + d.amount, 0);
  const pctLewat = Math.round((lewat / jumlah) * 100);

  return (
    <div>
      <div style={{
        display: "flex", alignItems: "baseline", gap: 10,
        marginBottom: 12, flexWrap: "wrap",
      }}>
        <span style={{
          fontFamily: "var(--font-display)", fontSize: 20, fontWeight: 700,
          color: C.text, fontVariantNumeric: "tabular-nums",
        }}>{rp(jumlah)}</span>
        <span style={{ fontSize: 12, color: C.muted }}>total belum tertagih</span>
        {lewat > 0 && (
          <span style={{
            marginLeft: "auto", fontSize: 12, fontWeight: 600,
            padding: "3px 9px", borderRadius: 99,
            background: C.redBg, color: C.onDangerBg,
            border: `1px solid ${C.redBorder}`,
          }}>
            {rp(lewat)} ({pctLewat}%) lewat tenggat
          </span>
        )}
      </div>

      {/* Satu batang bertumpuk — proporsi terbaca sekaligus, tanpa mata
          harus membandingkan lima batang terpisah. */}
      <div style={{
        display: "flex", height: 26, borderRadius: 8, overflow: "hidden",
        border: `1px solid ${C.border}`, marginBottom: 14,
      }} role="img" aria-label={
        `Umur piutang: ${data.filter((d) => d.amount > 0)
          .map((d) => `${d.label} ${rp(d.amount)}`).join(", ")}`
      }>
        {data.filter((d) => d.amount > 0).map((d) => {
          const pct = (d.amount / jumlah) * 100;
          return (
            <div key={d.kunci} title={`${d.label}: ${rp(d.amount)}`}
              style={{
                width: `${pct}%`,
                // Gradasi mendatar searah baca — pekat di kiri, memudar ke
                // kanan, jadi tiap segmen punya arah yang sama.
                background: `linear-gradient(90deg, ${d.warna} 0%, color-mix(in srgb, ${d.warna} 72%, white) 100%)`,
                display: "flex", alignItems: "center", justifyContent: "center",
              }}>
              {/* Persentase hanya ditulis kalau segmennya cukup lebar —
                  teks yang terpotong lebih buruk daripada tak ada teks. */}
              {pct >= 9 && (
                <span style={{
                  fontSize: 10.5, fontWeight: 700, color: "#fff",
                  fontVariantNumeric: "tabular-nums",
                  textShadow: "0 1px 2px rgba(0,0,0,.25)",
                }}>{Math.round(pct)}%</span>
              )}
            </div>
          );
        })}
      </div>

      {/* Rincian — bukan legenda warna, tapi daftar yang bisa dibaca sendiri.
          Legenda menuntut mata bolak-balik antara warna dan nama; daftar ini
          sudah memuat keduanya berikut angkanya. */}
      <div style={{ display: "grid", gap: 1, background: C.border, borderRadius: 10, overflow: "hidden" }}>
        {data.map((d) => (
          <div key={d.kunci} style={{
            display: "grid",
            gridTemplateColumns: "12px minmax(0,1fr) auto auto",
            alignItems: "center", gap: 10,
            padding: "9px 12px", background: "var(--surface)",
            opacity: d.amount ? 1 : 0.45,
          }}>
            <span aria-hidden="true" style={{
              width: 10, height: 10, borderRadius: 3, background: d.warna,
            }} />
            <span style={{ fontSize: 12.5, color: C.text, minWidth: 0 }}>
              {d.label}
              <span style={{ color: C.muted, fontSize: 11 }}> · {d.ket}</span>
            </span>
            <span style={{
              fontSize: 11, color: C.muted, fontVariantNumeric: "tabular-nums",
            }}>{jumlah ? `${Math.round((d.amount / jumlah) * 100)}%` : "—"}</span>
            <span style={{
              fontSize: 12.5, fontWeight: 600, color: d.amount ? C.text : C.muted,
              fontVariantNumeric: "tabular-nums", minWidth: 72, textAlign: "right",
            }}>{d.amount ? rp(d.amount) : "—"}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
