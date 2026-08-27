"use client";

// ============================================================================
// Dashboard Keuangan — Portal Admin/Direktur (Task 14, awal Tahap 3). Salinan
// APA ADANYA dari `pm-portal/keuangan/dashboard/page.tsx` (Task 32 PM) —
// endpoint yang sama, backend tak beda per role pemanggil.
//
// KPI + grafik tagih-vs-bayar + komposisi kasbon + umur piutang + tabel
// per-proyek + invoice tertunggak. Satu request (`useData`), tanpa RAB
// (lihat komentar kepala `apps/api/src/routes/v1/keuangan-ikhtisar.ts` — RAB
// diaudit tak sehat, keputusan founder 2026-08-09, JANGAN menambah agregasi
// RAB kalau kepikiran "lebih lengkap").
//
// ⚠️ SEMUA nominal di `RespKeuanganIkhtisar` datang sebagai STRING
// (`.toFixed(2)` di backend) — dikonversi lewat `Number(...)` sebelum masuk
// `formatRupiah`/`formatRupiahSingkat` (`@/lib/format`), tak pernah dirender
// mentah.
//
// Tabel "Per Proyek" memakai `<Tabel>` bersama (`@/components/dasar`), BUKAN
// `<table>` mentah — dijaga `tabel-mentah-ratchet.mjs`/`uji-tabel-seragam.mjs`.
//
// ⚠️ GERBANG `finance:view:all` — BEDA dari pola dominan plan ini (direktur
// selalu tetap bisa BACA di modul lain). Direktur TIDAK punya permission ini
// sama sekali (diverifikasi `keuangan-ikhtisar.ts:96-108`: hanya
// `finance:view:all`, bukan `finance:view`), jadi request ini memulangkan
// HTTP 403 sungguhan untuk akun direktur. Deteksi lewat STATUS CODE, BUKAN
// isi pesan — pesan asli `requirePermission` (`apps/api/src/plugins/
// auth.ts:222`) berbunyi "Akses ditolak. Butuh permission: finance:view:all",
// TIDAK PERNAH mengandung kata "izin". `GalatApi` (`_bersama/tipe.ts`) sudah
// punya `response.status`, tak perlu field baru.
//
// Task 15 (Tahap 3) menambah tautan ketiga: General Ledger
// (`/admin-portal/keuangan/gl`) — pola sama Piutang/IPC di bawah, dijangkau
// dari sini karena `g-keuangan`/`g-tagih` belum diaktifkan di kategori
// "Lainnya". Gerbang `gl:manage`/`gl:post`/`gl:void` (admin-only, direktur
// TIDAK) hidup di halaman GL itu sendiri — lihat komentar kepala berkasnya.
//
// Task 16 (Tahap 3) menambah tautan keempat: Rekonsiliasi Bank
// (`/admin-portal/keuangan/rekonsiliasi-bank`) — pola sama. Gerbang
// `rekonsiliasi:manage`/`rekonsiliasi:lock` (admin-only, direktur TIDAK)
// hidup di halaman DETAIL koran, bukan di daftar (daftar tak punya tombol
// tulis sama sekali, warisan keputusan PM Task 35).
//
// Task 17 (Tahap 3) menambah tautan kelima: Kas & Pengeluaran
// (`/admin-portal/keuangan/kas`) — pola sama. BEDA dari GL/Rekonsiliasi:
// gerbang `cash:account:manage` (tombol "Batalkan" transfer) admin+direktur
// SAMA-SAMA punya (dikonfirmasi live query Task 13), bukan admin-only — lihat
// komentar kepala `kas/[id]/page.tsx`.
//
// Task 18 (Tahap 3, TERAKHIR fitur Tahap 3) menambah tautan keenam: Kontrak
// Payung & Pengadaan Lanjutan (`/admin-portal/keuangan/pengadaan-lanjutan`)
// — pola sama. BEDA dari GL/Rekonsiliasi (admin-only) dan SAMA dengan Kas:
// gerbang `procurement:payment:manage` (tombol Setujui/Tolak/Terapkan nota
// kredit) admin+direktur SAMA-SAMA punya, PM Portal TIDAK PUNYA sama sekali
// — arah TERBALIK dari Task 15/16 (yang MENGURANGI tombol PM untuk
// direktur). Lihat komentar kepala halamannya.
// ============================================================================

import { useMemo } from "react";
import Link from "next/link";
import { Wallet, TrendingUp, AlertTriangle, Clock, Landmark, FileCheck2, BookOpen, Scale, ChevronRight, ReceiptText } from "lucide-react";
import { useData } from "@/lib/data-cache";
import { Tabel } from "@/components/dasar";
import { formatRupiah, formatRupiahSingkat } from "@/lib/format";
import EmptyState from "@/components/portal/EmptyState";
import SkeletonCard from "@/components/portal/SkeletonCard";
import type { RespKeuanganIkhtisar, GalatApi } from "../_bersama/tipe";
import { pesanGalat } from "../_bersama/tipe";

type BarisProyekKeuangan = RespKeuanganIkhtisar["per_proyek"][number];

function KartuKpi({ label, nilai, aksen }: { label: string; nilai: string; aksen?: "warning" | "danger" }) {
  const warna = aksen === "danger" ? "var(--danger)" : aksen === "warning" ? "var(--on-warning-bg)" : "var(--text-primary)";
  return (
    <div style={{ background: "var(--surface)", borderRadius: "var(--portal-radius-card)", padding: "var(--pad-kartu-lega)", border: "1px solid var(--border)", flex: "1 1 140px", minWidth: 140 }}>
      <div style={{ fontSize: 11, color: "var(--text-secondary)", marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 17, fontWeight: 700, color: warna, fontVariantNumeric: "tabular-nums" }}>{nilai}</div>
    </div>
  );
}

export default function AdminDashboardKeuanganPage() {
  const { data, memuat, galat, muatUlang } = useData<RespKeuanganIkhtisar>("/api/v1/keuangan/ikhtisar");

  const maksBulanan = useMemo(() => {
    if (!data?.bulanan?.length) return 1;
    return Math.max(1, ...data.bulanan.map((b) => Math.max(Number(b.tagih), Number(b.bayar))));
  }, [data]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--gap-bagian)" }}>
      <h1 style={{
        fontSize: "var(--t-judul)", fontWeight: 700,
        color: "var(--text-primary)", margin: 0, letterSpacing: "-0.01em",
      }}>
        Dashboard Keuangan
      </h1>

      {/* Tautan ke Piutang, IPC, GL, Rekonsiliasi Bank, Kas, dan Pengadaan
          Lanjutan — keenamnya bukan bagian NAV_ITEMS bottom nav (bottom nav
          hanya berhenti di "Keuangan" beranda ini, lihat layout.tsx), jadi
          jalur masuk utamanya dari sini, pola sama lima tautan
          kontrak/jadwal di `kontrak/register/page.tsx`. GL ditambahkan Task
          15, Rekonsiliasi Bank Task 16, Kas Task 17, Pengadaan Lanjutan
          Task 18 (semua Tahap 3).
          Task 19 mengaktifkan `g-keuangan`/`g-tagih` di kategori "Lainnya"
          (lib/admin-portal-kategori.ts), jadi sejak itu keenam halaman ini
          punya DUA jalur: cross-link di sini, DAN grid kategori → Keuangan/
          Penagihan → fn-ar/fn-kas/fn-rekonsiliasi/tg-ipc/tg-nota-kredit di
          PETA_HREF_PORTAL (kategori/[key]/page.tsx). Cross-link di bawah
          DIPERTAHANKAN sebagai pintasan — pola identik lima tautan
          kontrak/jadwal yang dipertahankan Task 12 sesudah `g-kontrak`/
          `g-jadwal` diaktifkan (lihat WAJAR di scripts/audit-nav-yatim.mjs).
          `/admin-portal/keuangan/gl/jurnal/[id]` dan `/rekonsiliasi-bank/
          [id]` dan `/kas/[id]` TIDAK dapat tautan di sini — dicapai dari
          badan halaman induknya masing-masing (baris tabel), bukan dari
          Beranda Dashboard Keuangan. */}
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <Link
          href="/admin-portal/keuangan/piutang"
          style={{
            display: "flex", alignItems: "center", gap: 10, padding: "var(--pad-kartu)",
            borderRadius: 12, background: "var(--surface)", border: "1px solid var(--border)",
            textDecoration: "none",
          }}
        >
          <Landmark size={18} color="var(--navy)" aria-hidden="true" />
          <span style={{ flex: 1, fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>
            Register Piutang
          </span>
          <ChevronRight size={16} color="var(--text-muted)" aria-hidden="true" />
        </Link>

        <Link
          href="/admin-portal/keuangan/ipc"
          style={{
            display: "flex", alignItems: "center", gap: 10, padding: "var(--pad-kartu)",
            borderRadius: 12, background: "var(--surface)", border: "1px solid var(--border)",
            textDecoration: "none",
          }}
        >
          <FileCheck2 size={18} color="var(--navy)" aria-hidden="true" />
          <span style={{ flex: 1, fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>
            Sertifikat IPC
          </span>
          <ChevronRight size={16} color="var(--text-muted)" aria-hidden="true" />
        </Link>

        <Link
          href="/admin-portal/keuangan/gl"
          style={{
            display: "flex", alignItems: "center", gap: 10, padding: "var(--pad-kartu)",
            borderRadius: 12, background: "var(--surface)", border: "1px solid var(--border)",
            textDecoration: "none",
          }}
        >
          <BookOpen size={18} color="var(--navy)" aria-hidden="true" />
          <span style={{ flex: 1, fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>
            General Ledger
          </span>
          <ChevronRight size={16} color="var(--text-muted)" aria-hidden="true" />
        </Link>

        <Link
          href="/admin-portal/keuangan/rekonsiliasi-bank"
          style={{
            display: "flex", alignItems: "center", gap: 10, padding: "var(--pad-kartu)",
            borderRadius: 12, background: "var(--surface)", border: "1px solid var(--border)",
            textDecoration: "none",
          }}
        >
          <Scale size={18} color="var(--navy)" aria-hidden="true" />
          <span style={{ flex: 1, fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>
            Rekonsiliasi Bank
          </span>
          <ChevronRight size={16} color="var(--text-muted)" aria-hidden="true" />
        </Link>

        <Link
          href="/admin-portal/keuangan/kas"
          style={{
            display: "flex", alignItems: "center", gap: 10, padding: "var(--pad-kartu)",
            borderRadius: 12, background: "var(--surface)", border: "1px solid var(--border)",
            textDecoration: "none",
          }}
        >
          <Wallet size={18} color="var(--navy)" aria-hidden="true" />
          <span style={{ flex: 1, fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>
            Kas & Pengeluaran
          </span>
          <ChevronRight size={16} color="var(--text-muted)" aria-hidden="true" />
        </Link>

        <Link
          href="/admin-portal/keuangan/pengadaan-lanjutan"
          style={{
            display: "flex", alignItems: "center", gap: 10, padding: "var(--pad-kartu)",
            borderRadius: 12, background: "var(--surface)", border: "1px solid var(--border)",
            textDecoration: "none",
          }}
        >
          <ReceiptText size={18} color="var(--navy)" aria-hidden="true" />
          <span style={{ flex: 1, fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>
            Kontrak Payung & Pengadaan Lanjutan
          </span>
          <ChevronRight size={16} color="var(--text-muted)" aria-hidden="true" />
        </Link>
      </div>

      {memuat && <SkeletonCard tinggi={160} />}

      {!memuat && galat && (galat as GalatApi)?.response?.status === 403 && (
        <EmptyState
          icon={AlertTriangle}
          judul="Akses terbatas"
          deskripsi="Dashboard Keuangan memerlukan izin finance:view:all. Peran Anda saat ini tidak memilikinya — hubungi admin bila ini keliru."
        />
      )}
      {!memuat && galat && (galat as GalatApi)?.response?.status !== 403 && (
        <EmptyState icon={AlertTriangle} judul="Gagal memuat"
          deskripsi={pesanGalat(galat as GalatApi, "Coba muat ulang.")}
          aksi={{ label: "Muat ulang", onClick: () => void muatUlang() }} />
      )}

      {!memuat && data && (
        <>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <KartuKpi label="Nilai Kontrak" nilai={formatRupiahSingkat(data.kpi.nilai_kontrak)} />
            <KartuKpi label="Tertagih" nilai={formatRupiahSingkat(data.kpi.tertagih)} />
            <KartuKpi label="Terbayar" nilai={formatRupiahSingkat(data.kpi.terbayar)} />
            <KartuKpi label="Piutang" nilai={formatRupiahSingkat(data.kpi.piutang)} aksen={Number(data.kpi.piutang) > 0 ? "warning" : undefined} />
            <KartuKpi label="Kasbon Beredar" nilai={formatRupiahSingkat(data.kpi.kasbon_beredar)} />
            <KartuKpi label="Invoice Lewat Tempo" nilai={String(data.kpi.invoice_lewat_tempo)} aksen={data.kpi.invoice_lewat_tempo > 0 ? "danger" : undefined} />
          </div>

          <div style={{ background: "var(--surface)", borderRadius: "var(--portal-radius-card)", padding: "var(--pad-kartu-lega)", border: "1px solid var(--border)" }}>
            <h2 style={{ fontSize: 14, fontWeight: 700, color: "var(--text-primary)", margin: "0 0 12px" }}>
              Tagih vs Bayar (12 bulan)
            </h2>
            {data.bulanan.length === 0 && <EmptyState icon={TrendingUp} judul="Belum ada data" deskripsi="Belum ada tagihan/pembayaran tercatat." />}
            {data.bulanan.length > 0 && (
              <>
                <div style={{ display: "flex", alignItems: "flex-end", gap: 6, height: 120, overflowX: "auto" }}>
                  {data.bulanan.map((b) => (
                    <div key={b.bulan} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 3, minWidth: 34 }}>
                      <div style={{ display: "flex", alignItems: "flex-end", gap: 2, height: 90 }}>
                        <div title={`Tagih ${formatRupiah(b.tagih)}`} style={{ width: 8, height: `${Math.max(2, (Number(b.tagih) / maksBulanan) * 90)}px`, background: "var(--navy)", borderRadius: 2 }} />
                        <div title={`Bayar ${formatRupiah(b.bayar)}`} style={{ width: 8, height: `${Math.max(2, (Number(b.bayar) / maksBulanan) * 90)}px`, background: "var(--success)", borderRadius: 2 }} />
                      </div>
                      <span style={{ fontSize: 9, color: "var(--text-secondary)" }}>{b.bulan}</span>
                    </div>
                  ))}
                </div>
                <div style={{ display: "flex", gap: 12, marginTop: 8, fontSize: 11, color: "var(--text-secondary)" }}>
                  <span style={{ display: "flex", alignItems: "center", gap: 4 }}><span style={{ width: 8, height: 8, borderRadius: 2, background: "var(--navy)", display: "inline-block" }} /> Tagih</span>
                  <span style={{ display: "flex", alignItems: "center", gap: 4 }}><span style={{ width: 8, height: 8, borderRadius: 2, background: "var(--success)", display: "inline-block" }} /> Bayar</span>
                </div>
              </>
            )}
          </div>

          <div style={{ background: "var(--surface)", borderRadius: "var(--portal-radius-card)", padding: "var(--pad-kartu-lega)", border: "1px solid var(--border)" }}>
            <h2 style={{ fontSize: 14, fontWeight: 700, color: "var(--text-primary)", margin: "0 0 12px" }}>
              Komposisi Kasbon
            </h2>
            {data.komposisi_kasbon.length === 0 && <EmptyState icon={Wallet} judul="Belum ada kasbon" deskripsi="Kasbon approved/settled belum ada." />}
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {data.komposisi_kasbon.map((k) => (
                <div key={k.kunci} style={{ display: "flex", justifyContent: "space-between", fontSize: 13 }}>
                  <span style={{ color: "var(--text-secondary)" }}>{k.nama} ({k.jumlah})</span>
                  <span style={{ fontWeight: 600, color: "var(--text-primary)", fontVariantNumeric: "tabular-nums" }}>{formatRupiah(k.nilai)}</span>
                </div>
              ))}
            </div>
          </div>

          <div style={{ background: "var(--surface)", borderRadius: "var(--portal-radius-card)", padding: "var(--pad-kartu-lega)", border: "1px solid var(--border)" }}>
            <h2 style={{ fontSize: 14, fontWeight: 700, color: "var(--text-primary)", margin: "0 0 12px" }}>
              Umur Piutang
            </h2>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {data.umur_piutang.map((u) => (
                <div key={u.nama} style={{ display: "flex", justifyContent: "space-between", fontSize: 13 }}>
                  <span style={{ color: "var(--text-secondary)" }}>{u.nama} ({u.jumlah})</span>
                  <span style={{ fontWeight: 600, color: Number(u.nilai) > 0 && u.nama !== "Belum jatuh tempo" ? "var(--danger)" : "var(--text-primary)", fontVariantNumeric: "tabular-nums" }}>{formatRupiah(u.nilai)}</span>
                </div>
              ))}
            </div>
          </div>

          {data.invoice_tertunggak.length > 0 && (
            <div style={{ background: "var(--surface)", borderRadius: "var(--portal-radius-card)", padding: "var(--pad-kartu-lega)", border: "1px solid var(--warning-border)" }}>
              <h2 style={{ fontSize: 14, fontWeight: 700, color: "var(--text-primary)", margin: "0 0 12px", display: "flex", alignItems: "center", gap: 6 }}>
                <Clock size={16} color="var(--on-warning-bg)" aria-hidden="true" /> Invoice Tertunggak
              </h2>
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {data.invoice_tertunggak.map((i) => (
                  <div key={i.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 0", borderBottom: "1px solid var(--border)" }}>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>{i.nomor}</div>
                      <div style={{ fontSize: 11, color: "var(--text-secondary)" }}>{i.proyek ?? "—"} · lewat {i.hari_lewat} hari</div>
                    </div>
                    <span style={{ fontSize: 13, fontWeight: 700, color: "var(--danger)", fontVariantNumeric: "tabular-nums" }}>{formatRupiah(i.sisa)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div style={{ background: "var(--surface)", borderRadius: "var(--portal-radius-card)", padding: "var(--pad-kartu-lega)", border: "1px solid var(--border)" }}>
            <h2 style={{ fontSize: 14, fontWeight: 700, color: "var(--text-primary)", margin: "0 0 12px" }}>
              Per Proyek
            </h2>
            <Tabel<BarisProyekKeuangan>
              caption="Ringkasan keuangan per proyek: nilai kontrak, yang sudah tertagih, sisa piutang, dan persentase tertagih terhadap kontrak."
              data={data.per_proyek}
              kunciBaris={(p) => p.id}
              kosong={<EmptyState icon={Wallet} judul="Belum ada proyek" deskripsi="Belum ada proyek aktif dengan data keuangan." />}
              kolom={[
                { kunci: "proyek", judul: "Proyek", kepalaBaris: true, render: (p) => p.nama },
                { kunci: "kontrak", judul: "Kontrak", rata: "kanan", render: (p) => formatRupiahSingkat(p.kontrak) },
                { kunci: "tertagih", judul: "Tertagih", rata: "kanan", render: (p) => formatRupiahSingkat(p.tertagih) },
                {
                  kunci: "piutang", judul: "Piutang", rata: "kanan",
                  render: (p) => (
                    <span style={{ color: Number(p.piutang) > 0 ? "var(--on-warning-bg)" : "var(--text-primary)" }}>
                      {formatRupiahSingkat(p.piutang)}
                    </span>
                  ),
                },
                { kunci: "pct", judul: "%", rata: "kanan", render: (p) => `${p.pct_tertagih}%` },
              ]}
            />
          </div>
        </>
      )}
    </div>
  );
}
