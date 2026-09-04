"use client";

// ============================================================================
// General Ledger — Chart of Accounts, Jurnal, Buku Besar, Neraca & Laba-Rugi.
// Task 34.
//
// 4 tab (Jurnal / Bagan Akun / Buku Besar / Neraca & Laba-Rugi) + tombol "+
// Akun" (`gl:manage`) dan "+ Jurnal" (`gl:manage`). PM di modul ini punya akses
// PENUH `gl:manage`/`gl:post`/`gl:void` — BUKAN cuma view seperti dugaan awal
// (dikonfirmasi Task 31 Step 1 + verifikasi ulang langsung ke `gl.ts`).
//
// Bentuk respons DIVERIFIKASI baris-per-baris ke `apps/api/src/routes/v1/gl.ts`
// + `apps/api/src/lib/laporan-keuangan.ts` saat Task 34 (bukan hanya membaca
// brief): `GET /gl/accounts`, `GET /gl/journal-entries`, `GET /gl/ledger`,
// `GET /gl/laporan` — keempat bentuk `data`/`meta` di bawah cocok persis kode.
//
// ⚠️ Ember [C] (CLAUDE.md §5.3): keseimbangan debit=kredit, immutability
// jurnal posted, dan larangan lintas-company SEMUANYA ditegakkan TRIGGER
// DATABASE (migrasi 168) — TIDAK divalidasi ulang di sini selain menampilkan
// pesan yang backend kembalikan (`pesanRamah()`, `gl.ts:36-50`, sudah
// berbahasa manusia). Validasi keseimbangan di klien (`seimbangLini` di bawah)
// HANYA mencegah pengiriman yang jelas-jelas salah sebelum sampai ke server —
// bukan penegak invarian; kebenaran akhir tetap milik trigger DB.
//
// Tombol primer memakai `var(--grad-aksen)` (BUKAN navy padat) — konvensi
// tombol aksi utama di repo ini (`uji-tombol-primer-seragam.mjs`, pola sama
// `keuangan/kas/page.tsx` Task 33).
//
// State galat AKSI (`galatForm`, dua BottomSheet) TERPISAH dari galat MUAT
// per-tab (`galatJurnal`/`galatAkun`/`galatLedger`/`galatLaporan` dari
// `useData`) — pelajaran Task 31, sama seperti halaman keuangan lain.
//
// TANPA `useSearchParams` — tab dikendalikan `useState` lokal, jadi halaman
// ini tak butuh <Suspense> (pola sama `keuangan/kas/page.tsx`).
// ============================================================================

import { useState } from "react";
import Link from "next/link";
import { BookOpen, Plus, Scale, Landmark } from "lucide-react";
import { useData, invalidasi } from "@/lib/data-cache";
import { api } from "@/lib/api";
import EmptyState from "@/components/portal/EmptyState";
import SegmentedTab from "@/components/portal/SegmentedTab";
import KepalaPortal from "@/components/portal/KepalaPortal";
import SkeletonCard from "@/components/portal/SkeletonCard";
import StatusBadge, { type VarianStatus } from "@/components/portal/StatusBadge";
import BottomSheet from "@/components/portal/BottomSheet";
import type {
  AkunGl, RespAkunGl, RespJurnalDaftar, RespBukuBesar, RespLaporanGl,
  GalatApi,
} from "../../_bersama/tipe";
import { pesanGalat } from "../../_bersama/tipe";
import { Pilihan } from "@/components/pilihan";

function fmtRupiah(v: number | string | null | undefined): string {
  if (v === null || v === undefined) return "—";
  const n = typeof v === "string" ? Number(v) : v;
  if (!Number.isFinite(n)) return "—";
  return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(n);
}
function fmtTanggal(s: string | null): string {
  if (!s) return "—";
  return new Date(s).toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric" });
}

const LABEL_STATUS_JURNAL: Record<string, string> = { draft: "Draf", posted: "Terposting", void: "Dibatalkan" };
const VARIAN_STATUS_JURNAL: Record<string, VarianStatus> = { draft: "pending", posted: "approved", void: "rejected" };
const LABEL_TIPE_AKUN: Record<string, string> = { asset: "Aset", liability: "Liabilitas", equity: "Ekuitas", revenue: "Pendapatan", expense: "Beban" };

type Tab = "jurnal" | "akun" | "buku-besar" | "laporan";
interface BarisLini { account_id: string; debit: string; credit: string }

export default function PmGlPage() {
  const [tab, setTab] = useState<Tab>("jurnal");
  const [sheetAkun, setSheetAkun] = useState(false);
  const [sheetJurnal, setSheetJurnal] = useState(false);
  const [mengirim, setMengirim] = useState(false);
  const [galatForm, setGalatForm] = useState<string | null>(null);

  const [formAkun, setFormAkun] = useState({ code: "", name: "", type: "asset" as AkunGl["type"], description: "" });
  const [formJurnal, setFormJurnal] = useState({ entry_date: new Date().toISOString().slice(0, 10), description: "", notes: "" });
  const [lini, setLini] = useState<BarisLini[]>([
    { account_id: "", debit: "", credit: "" },
    { account_id: "", debit: "", credit: "" },
  ]);

  // Akun juga dimuat saat sheet Jurnal terbuka (dipakai dropdown pilih akun
  // per baris), bukan hanya saat tab "Bagan Akun" aktif.
  const { data: dataAkun, memuat: memuatAkun, galat: galatAkun } = useData<RespAkunGl>(
    tab === "akun" || sheetJurnal ? "/api/v1/gl/accounts" : null,
  );
  const { data: dataJurnal, memuat: memuatJurnal, galat: galatJurnal } = useData<RespJurnalDaftar>(
    tab === "jurnal" ? "/api/v1/gl/journal-entries" : null,
  );
  const { data: dataLedger, memuat: memuatLedger, galat: galatLedger } = useData<RespBukuBesar>(
    tab === "buku-besar" ? "/api/v1/gl/ledger" : null,
  );
  const { data: dataLaporan, memuat: memuatLaporan, galat: galatLaporan } = useData<RespLaporanGl>(
    tab === "laporan" ? "/api/v1/gl/laporan" : null,
  );

  const totalDebitLini = lini.reduce((s, l) => s + (Number(l.debit) || 0), 0);
  const totalKreditLini = lini.reduce((s, l) => s + (Number(l.credit) || 0), 0);
  const seimbangLini = lini.length >= 2 && totalDebitLini > 0 && Math.abs(totalDebitLini - totalKreditLini) < 0.01;

  function bukaSheetAkun() {
    setGalatForm(null);
    setSheetAkun(true);
  }
  function bukaSheetJurnal() {
    setGalatForm(null);
    setSheetJurnal(true);
  }

  async function buatAkun() {
    if (!formAkun.code.trim() || !formAkun.name.trim()) {
      setGalatForm("Kode dan nama akun wajib diisi.");
      return;
    }
    setMengirim(true);
    setGalatForm(null);
    try {
      await api.post("/api/v1/gl/accounts", {
        code: formAkun.code.trim(),
        name: formAkun.name.trim(),
        type: formAkun.type,
        description: formAkun.description.trim() || undefined,
      });
      setSheetAkun(false);
      setFormAkun({ code: "", name: "", type: "asset", description: "" });
      invalidasi("/api/v1/gl/accounts");
    } catch (e) {
      setGalatForm(pesanGalat(e as GalatApi, "Gagal membuat akun"));
    } finally {
      setMengirim(false);
    }
  }

  function ubahLini(i: number, field: keyof BarisLini, v: string) {
    setLini((prev) => prev.map((l, idx) => (idx === i ? { ...l, [field]: v } : l)));
  }

  async function buatJurnal() {
    if (!formJurnal.description.trim()) {
      setGalatForm("Deskripsi jurnal wajib diisi.");
      return;
    }
    const baris = lini.filter((l) => l.account_id && (Number(l.debit) > 0 || Number(l.credit) > 0));
    if (baris.length < 2) {
      setGalatForm("Jurnal minimal 2 baris terisi (debit ATAU kredit, tak boleh keduanya kosong).");
      return;
    }
    if (!seimbangLini) {
      setGalatForm(`Debit (${fmtRupiah(totalDebitLini)}) harus sama dengan Kredit (${fmtRupiah(totalKreditLini)}) sebelum di-posting — jurnal boleh tersimpan draf tak seimbang, tapi lebih aman disamakan dari awal.`);
      return;
    }
    setMengirim(true);
    setGalatForm(null);
    try {
      await api.post("/api/v1/gl/journal-entries", {
        entry_date: formJurnal.entry_date,
        description: formJurnal.description.trim(),
        notes: formJurnal.notes.trim() || undefined,
        lines: baris.map((l) => ({
          account_id: l.account_id,
          debit: Number(l.debit) || 0,
          credit: Number(l.credit) || 0,
        })),
      });
      setSheetJurnal(false);
      setFormJurnal({ entry_date: new Date().toISOString().slice(0, 10), description: "", notes: "" });
      setLini([{ account_id: "", debit: "", credit: "" }, { account_id: "", debit: "", credit: "" }]);
      invalidasi("/api/v1/gl/journal-entries");
    } catch (e) {
      setGalatForm(pesanGalat(e as GalatApi, "Gagal membuat jurnal"));
    } finally {
      setMengirim(false);
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--gap-bagian)" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
        <KepalaPortal judul="General Ledger" />
        <div style={{ display: "flex", gap: 8 }}>
          <button type="button" onClick={bukaSheetAkun}
            style={{
              display: "flex", alignItems: "center", gap: 4, padding: "8px 12px",
              borderRadius: "var(--portal-radius-pill)", border: "1px solid var(--navy)",
              background: "var(--surface)", color: "var(--navy)", fontSize: 12, fontWeight: 700,
              cursor: "pointer", minHeight: 36,
            }}>
            <Plus size={14} aria-hidden="true" /> Akun
          </button>
          <button type="button" onClick={bukaSheetJurnal}
            style={{
              display: "flex", alignItems: "center", gap: 4, padding: "8px 12px",
              borderRadius: "var(--portal-radius-pill)", border: "none",
              background: "var(--grad-aksen)", color: "var(--on-navy)", fontSize: 12, fontWeight: 700,
              cursor: "pointer", minHeight: 36,
            }}>
            <Plus size={14} aria-hidden="true" /> Jurnal
          </button>
        </div>
      </div>

      {/*
        `SegmentedTab melipat` — bukan tab tangan.
      
        Tab di sini dulu ditulis tangan dengan alasan yang sah dan
        tertulis: `SegmentedTab` memberi tiap opsi `flex: 1` tanpa wrap,
        jadi empat opsi berlabel panjang terpotong di 360px.
      
        Alasan itu tak lagi berlaku sejak komponennya punya mode
        `melipat` (2026-08-27): opsi memakai lebar isinya dan membungkus
        ke baris berikutnya. Yang didapat kembali: satu tempat yang
        menjaga `aria-selected`, sasaran sentuh 44px, dan penanda aktif
        non-warna — tiga hal yang tiap salinan tangan harus ingat ulang.
      */}
      <SegmentedTab
        melipat
        aktif={tab}
        onUbah={(v) => setTab(v as Tab)}
        opsi={[
          { value: "jurnal", label: "Jurnal" },
          { value: "akun", label: "Bagan Akun" },
          { value: "buku-besar", label: "Buku Besar" },
          { value: "laporan", label: "Neraca & Laba-Rugi" },
        ]}
      />

      {tab === "jurnal" && (
        <>
          {memuatJurnal && <SkeletonCard tinggi={100} />}
          {galatJurnal && (
            <EmptyState icon={BookOpen} judul="Gagal memuat" deskripsi={pesanGalat(galatJurnal as GalatApi, "Coba lagi.")} />
          )}
          {!memuatJurnal && !galatJurnal && dataJurnal && dataJurnal.data.length === 0 && (
            <EmptyState icon={BookOpen} judul="Belum ada jurnal" deskripsi="Buat jurnal manual pertama lewat tombol + Jurnal di atas." />
          )}
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {(dataJurnal?.data ?? []).map((j) => (
              <Link key={j.id} href={`/pm-portal/keuangan/gl/jurnal/${j.id}`} style={{ textDecoration: "none" }}>
                <div style={{ background: "var(--surface)", borderRadius: 12, padding: 14, border: "1px solid var(--border)" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
                    <span style={{ fontSize: 13, fontWeight: 700, color: "var(--text-primary)" }}>{j.entry_number}</span>
                    <StatusBadge status={VARIAN_STATUS_JURNAL[j.status] ?? "netral"} label={LABEL_STATUS_JURNAL[j.status] ?? j.status} />
                  </div>
                  <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>{j.description}</div>
                  <div style={{ fontSize: 11, color: "var(--text-secondary)" }}>
                    {fmtTanggal(j.entry_date)}{j.source ? ` · ${j.source}` : ""}
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </>
      )}

      {tab === "akun" && (
        <>
          {memuatAkun && <SkeletonCard tinggi={100} />}
          {galatAkun && (
            <EmptyState icon={BookOpen} judul="Gagal memuat" deskripsi={pesanGalat(galatAkun as GalatApi, "Coba lagi.")} />
          )}
          {!memuatAkun && !galatAkun && dataAkun && dataAkun.data.length === 0 && (
            <EmptyState icon={BookOpen} judul="Belum ada akun" deskripsi="Buat akun pertama lewat tombol + Akun di atas." />
          )}
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {(dataAkun?.data ?? []).map((a) => (
              <div key={a.id} style={{
                display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8,
                /* `--pad-kartu-lega` (16px), bukan 12px dipaku: baris ini memuat kode +
                   nama + saldo dalam satu lebar 390px, dan sisi yang sempit
                   membuat isinya terlihat menepel ke tepi kartu — keluhan
                   "mepet" yang dijaga `uji-baris-tak-mepet`. */
                padding: "10px var(--pad-kartu-lega)", background: "var(--surface)", borderRadius: 10, border: "1px solid var(--border)",
              }}>
                <div>
                  <span style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>{a.code}</span>
                  <span style={{ fontSize: 13, color: "var(--text-secondary)", marginLeft: 8 }}>{a.name}</span>
                  {!a.is_active && (
                    <span style={{ fontSize: 11, color: "var(--text-muted)", marginLeft: 8 }}>(nonaktif)</span>
                  )}
                </div>
                <span style={{ fontSize: 11, color: "var(--text-secondary)", flexShrink: 0 }}>
                  {LABEL_TIPE_AKUN[a.type] ?? a.type}
                </span>
              </div>
            ))}
          </div>
        </>
      )}

      {tab === "buku-besar" && (
        <>
          {memuatLedger && <SkeletonCard tinggi={100} />}
          {galatLedger && (
            <EmptyState icon={Scale} judul="Gagal memuat" deskripsi={pesanGalat(galatLedger as GalatApi, "Coba lagi.")} />
          )}
          {!memuatLedger && !galatLedger && dataLedger && dataLedger.data.length === 0 && (
            <EmptyState icon={Scale} judul="Belum ada baris buku besar" deskripsi="Buku besar hanya memuat jurnal yang sudah TERPOSTING." />
          )}
          {!memuatLedger && dataLedger && dataLedger.data.length > 0 && (
            <>
              <div style={{ display: "flex", gap: 12, flexWrap: "wrap", fontSize: 12, color: "var(--text-secondary)" }}>
                <span>Debit: <strong style={{ color: "var(--text-primary)" }}>{fmtRupiah(dataLedger.meta.total_debit)}</strong></span>
                <span>Kredit: <strong style={{ color: "var(--text-primary)" }}>{fmtRupiah(dataLedger.meta.total_credit)}</strong></span>
                <span style={{ color: Math.abs(dataLedger.meta.selisih) < 0.01 ? "var(--success)" : "var(--danger)", fontWeight: 700 }}>
                  Selisih: {fmtRupiah(dataLedger.meta.selisih)}
                </span>
              </div>
              {/* Endpoint `/gl/ledger` TIDAK punya flag "terpotong" (beda dari
                  `/gl/laporan`) — batas 500 jurnal posted diratakan jadi baris.
                  Kalau jumlah baris mendekati 500, halaman ini TAK BISA
                  membedakan "memang cuma segitu" dari "terpotong diam-diam".
                  Ini keterbatasan backend, dicatat sebagai concern laporan
                  (lihat task-34-report.md), bukan ditambal di sini. */}
              {dataLedger.meta.jumlah_baris >= 500 && (
                <div role="status" style={{
                  background: "var(--warning-bg)", border: "1px solid var(--warning-border)",
                  borderRadius: 12, padding: 12, fontSize: 12, color: "var(--on-warning-bg)",
                }}>
                  Menampilkan {dataLedger.meta.jumlah_baris} baris — mendekati batas 500 jurnal
                  posted yang dibaca sekali panggil. Ada kemungkinan sebagian jurnal
                  di luar rentang ini tidak ikut terhitung.
                </div>
              )}
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12, minWidth: 480, fontVariantNumeric: "tabular-nums" }}>
                  <caption className="sr-only">Buku besar: baris jurnal terposting per tanggal dan akun, dengan debit dan kredit.</caption>
                  <thead>
                    <tr style={{ borderBottom: "1px solid var(--border)" }}>
                      <th scope="col" style={{ textAlign: "left", padding: "var(--pad-baris)", color: "var(--text-secondary)" }}>Tanggal</th>
                      <th scope="col" style={{ textAlign: "left", padding: "var(--pad-baris)", color: "var(--text-secondary)" }}>Akun</th>
                      <th scope="col" style={{ textAlign: "right", padding: "var(--pad-baris)", color: "var(--text-secondary)" }}>Debit</th>
                      <th scope="col" style={{ textAlign: "right", padding: "var(--pad-baris)", color: "var(--text-secondary)" }}>Kredit</th>
                    </tr>
                  </thead>
                  <tbody>
                    {dataLedger.data.map((b, i) => (
                      <tr key={`${b.entry_id}-${i}`} style={{ borderBottom: "1px solid var(--border)" }}>
                        <td style={{ padding: "var(--pad-baris)" }}>{fmtTanggal(b.entry_date)}</td>
                        <th scope="row" style={{ padding: "var(--pad-baris)", textAlign: "left", fontWeight: 400 }}>{b.code} · {b.name}</th>
                        <td style={{ padding: "var(--pad-baris)", textAlign: "right" }}>
                          {b.debit > 0 ? fmtRupiah(b.debit) : "—"}
                        </td>
                        <td style={{ padding: "var(--pad-baris)", textAlign: "right" }}>
                          {b.credit > 0 ? fmtRupiah(b.credit) : "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </>
      )}

      {tab === "laporan" && (
        <>
          {memuatLaporan && <SkeletonCard tinggi={200} />}
          {galatLaporan && (
            <EmptyState icon={Landmark} judul="Gagal memuat" deskripsi={pesanGalat(galatLaporan as GalatApi, "Coba lagi.")} />
          )}
          {!memuatLaporan && dataLaporan && (
            <>
              {!dataLaporan.neraca.seimbang && (
                <div role="alert" style={{
                  background: "var(--danger-bg)", border: "1px solid var(--danger-border)",
                  borderRadius: 12, padding: 12, fontSize: 12, color: "var(--on-danger-bg)",
                }}>
                  Neraca TIDAK seimbang — selisih {fmtRupiah(dataLaporan.neraca.selisih)}. Ada
                  jurnal yang tak seimbang tersimpan; ini seharusnya tak mungkin terjadi
                  karena trigger database menolak posting yang tak seimbang.
                </div>
              )}
              {dataLaporan.meta.terpotong && (
                <div role="status" style={{
                  background: "var(--warning-bg)", border: "1px solid var(--warning-border)",
                  borderRadius: 12, padding: 12, fontSize: 12, color: "var(--on-warning-bg)",
                }}>
                  Laporan ini dipotong pada 1000 jurnal — angka di bawah BELUM tentu
                  mencakup seluruh periode. Persempit rentang tanggal untuk memastikan
                  seluruh jurnal terhitung.
                </div>
              )}

              <div style={{ background: "var(--surface)", borderRadius: 16, padding: "var(--pad-kartu-lega)", border: "1px solid var(--border)" }}>
                <h2 style={{ fontSize: 14, fontWeight: 700, color: "var(--text-primary)", margin: "0 0 10px" }}>Neraca</h2>
                {([
                  ["aset", dataLaporan.neraca.aset],
                  ["liabilitas", dataLaporan.neraca.liabilitas],
                  ["ekuitas", dataLaporan.neraca.ekuitas],
                ] as const).map(([key, kel]) => (
                  <div key={key} style={{ marginBottom: 10 }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: "var(--text-secondary)" }}>{kel.label}</div>
                    {kel.akun.length === 0 && (
                      <div style={{ fontSize: 12, color: "var(--text-muted)", padding: "2px 0" }}>Belum ada saldo.</div>
                    )}
                    {kel.akun.map((a) => (
                      <div key={a.account_id} style={{ display: "flex", justifyContent: "space-between", fontSize: 12, padding: "4px 0" }}>
                        <span style={{ color: "var(--text-secondary)" }}>{a.code} {a.name}</span>
                        <span style={{ fontVariantNumeric: "tabular-nums" }}>{fmtRupiah(a.saldo)}</span>
                      </div>
                    ))}
                    <div style={{
                      display: "flex", justifyContent: "space-between", fontSize: 12, fontWeight: 700,
                      borderTop: "1px solid var(--border)", paddingTop: 4,
                    }}>
                      <span>Total {kel.label}</span>
                      <span style={{ fontVariantNumeric: "tabular-nums" }}>{fmtRupiah(kel.total)}</span>
                    </div>
                  </div>
                ))}
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, fontWeight: 700, color: "var(--navy)" }}>
                  <span>Laba Berjalan</span>
                  <span style={{ fontVariantNumeric: "tabular-nums" }}>{fmtRupiah(dataLaporan.neraca.labaBerjalan)}</span>
                </div>
              </div>

              <div style={{ background: "var(--surface)", borderRadius: 16, padding: "var(--pad-kartu-lega)", border: "1px solid var(--border)" }}>
                <h2 style={{ fontSize: 14, fontWeight: 700, color: "var(--text-primary)", margin: "0 0 10px" }}>Laba-Rugi</h2>
                {([
                  ["pendapatan", dataLaporan.labaRugi.pendapatan],
                  ["beban", dataLaporan.labaRugi.beban],
                ] as const).map(([key, kel]) => (
                  <div key={key} style={{ marginBottom: 10 }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: "var(--text-secondary)" }}>{kel.label}</div>
                    {kel.akun.length === 0 && (
                      <div style={{ fontSize: 12, color: "var(--text-muted)", padding: "2px 0" }}>Belum ada saldo.</div>
                    )}
                    {kel.akun.map((a) => (
                      <div key={a.account_id} style={{ display: "flex", justifyContent: "space-between", fontSize: 12, padding: "4px 0" }}>
                        <span style={{ color: "var(--text-secondary)" }}>{a.code} {a.name}</span>
                        <span style={{ fontVariantNumeric: "tabular-nums" }}>{fmtRupiah(a.saldo)}</span>
                      </div>
                    ))}
                  </div>
                ))}
                <div style={{
                  display: "flex", justifyContent: "space-between", fontSize: 13, fontWeight: 700,
                  color: dataLaporan.labaRugi.labaBersih >= 0 ? "var(--success)" : "var(--danger)",
                }}>
                  <span>Laba Bersih {dataLaporan.labaRugi.marginPct !== null ? `(${dataLaporan.labaRugi.marginPct}%)` : ""}</span>
                  <span style={{ fontVariantNumeric: "tabular-nums" }}>{fmtRupiah(dataLaporan.labaRugi.labaBersih)}</span>
                </div>
              </div>
            </>
          )}
        </>
      )}

      <BottomSheet terbuka={sheetAkun} onTutup={() => setSheetAkun(false)} judul="Akun Baru">
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: "var(--text-secondary)" }}>Kode *</span>
            <input value={formAkun.code} onChange={(e) => setFormAkun((f) => ({ ...f, code: e.target.value }))}
              style={{ minHeight: 44, padding: "0 12px", borderRadius: 12, border: "1px solid var(--border)", fontSize: 14 }} />
          </label>
          <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: "var(--text-secondary)" }}>Nama *</span>
            <input value={formAkun.name} onChange={(e) => setFormAkun((f) => ({ ...f, name: e.target.value }))}
              style={{ minHeight: 44, padding: "0 12px", borderRadius: 12, border: "1px solid var(--border)", fontSize: 14 }} />
          </label>
          <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: "var(--text-secondary)" }}>Tipe *</span>
            <Pilihan value={formAkun.type} onChange={(e) => setFormAkun((f) => ({ ...f, type: e.target.value as AkunGl["type"] }))}
              style={{ minHeight: 44, padding: "0 12px", borderRadius: 12, border: "1px solid var(--border)", fontSize: 14 }}>
              {Object.entries(LABEL_TIPE_AKUN).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </Pilihan>
          </label>
          <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: "var(--text-secondary)" }}>Deskripsi</span>
            <input value={formAkun.description} onChange={(e) => setFormAkun((f) => ({ ...f, description: e.target.value }))}
              style={{ minHeight: 44, padding: "0 12px", borderRadius: 12, border: "1px solid var(--border)", fontSize: 14 }} />
          </label>
          {galatForm && <div role="alert" style={{ fontSize: 12, color: "var(--danger)" }}>{galatForm}</div>}
          <button type="button" onClick={() => void buatAkun()} disabled={mengirim}
            style={{
              minHeight: 48, borderRadius: "var(--portal-radius-pill)", fontSize: 14, fontWeight: 700, border: "none",
              background: mengirim ? "var(--surface-subtle)" : "var(--grad-aksen)",
              color: mengirim ? "var(--text-muted)" : "var(--on-navy)",
              cursor: mengirim ? "default" : "pointer",
            }}>
            {mengirim ? "Membuat…" : "Buat Akun"}
          </button>
        </div>
      </BottomSheet>

      <BottomSheet terbuka={sheetJurnal} onTutup={() => setSheetJurnal(false)} judul="Jurnal Manual">
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: "var(--text-secondary)" }}>Tanggal *</span>
            <input type="date" value={formJurnal.entry_date} onChange={(e) => setFormJurnal((f) => ({ ...f, entry_date: e.target.value }))}
              style={{ minHeight: 44, padding: "0 12px", borderRadius: 12, border: "1px solid var(--border)", fontSize: 14 }} />
          </label>
          <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: "var(--text-secondary)" }}>Deskripsi *</span>
            <input value={formJurnal.description} onChange={(e) => setFormJurnal((f) => ({ ...f, description: e.target.value }))}
              style={{ minHeight: 44, padding: "0 12px", borderRadius: 12, border: "1px solid var(--border)", fontSize: 14 }} />
          </label>
          <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: "var(--text-secondary)" }}>Catatan</span>
            <input value={formJurnal.notes} onChange={(e) => setFormJurnal((f) => ({ ...f, notes: e.target.value }))}
              style={{ minHeight: 44, padding: "0 12px", borderRadius: 12, border: "1px solid var(--border)", fontSize: 14 }} />
          </label>

          <div style={{ fontSize: 12, fontWeight: 600, color: "var(--text-secondary)" }}>Baris Jurnal</div>
          {lini.map((l, i) => (
            <div key={i} style={{ display: "flex", gap: 6, alignItems: "center" }}>
              {/*
                    Nomor baris ikut disebut: baris jurnal berulang, dan tanpa
                    itu pembaca layar mengucapkan "Akun jurnal" berkali-kali
                    tanpa cara membedakan baris mana yang sedang diisi.
                    Judul "Baris Jurnal" di atas hanya <div>, bukan label.
                  */}
                  <Pilihan aria-label={`Akun jurnal baris ${i + 1}`} value={l.account_id} onChange={(e) => ubahLini(i, "account_id", e.target.value)}
                style={{ minHeight: 40, padding: "0 8px", borderRadius: 10, border: "1px solid var(--border)", fontSize: 12, flex: 2 }}>
                <option value="">Akun</option>
                {(dataAkun?.data ?? []).map((a) => <option key={a.id} value={a.id}>{a.code} {a.name}</option>)}
              </Pilihan>
              <input aria-label={`Debit baris ${i + 1}`} type="number" min={0} placeholder="Debit" value={l.debit} onChange={(e) => ubahLini(i, "debit", e.target.value)}
                style={{ minHeight: 40, padding: "0 8px", borderRadius: 10, border: "1px solid var(--border)", fontSize: 12, flex: 1, width: 0 }} />
              <input aria-label={`Kredit baris ${i + 1}`} type="number" min={0} placeholder="Kredit" value={l.credit} onChange={(e) => ubahLini(i, "credit", e.target.value)}
                style={{ minHeight: 40, padding: "0 8px", borderRadius: 10, border: "1px solid var(--border)", fontSize: 12, flex: 1, width: 0 }} />
            </div>
          ))}
          <button type="button" onClick={() => setLini((p) => [...p, { account_id: "", debit: "", credit: "" }])}
            style={{
              minHeight: 36, borderRadius: "var(--portal-radius-pill)", fontSize: 12, fontWeight: 600,
              border: "1px dashed var(--border)", background: "transparent", color: "var(--text-secondary)", cursor: "pointer",
            }}>
            + Tambah baris
          </button>

          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: seimbangLini ? "var(--success)" : "var(--text-secondary)" }}>
            <span>Debit: {fmtRupiah(totalDebitLini)}</span>
            <span>Kredit: {fmtRupiah(totalKreditLini)}</span>
          </div>

          {galatForm && <div role="alert" style={{ fontSize: 12, color: "var(--danger)" }}>{galatForm}</div>}
          <button type="button" onClick={() => void buatJurnal()} disabled={mengirim}
            style={{
              minHeight: 48, borderRadius: "var(--portal-radius-pill)", fontSize: 14, fontWeight: 700, border: "none",
              background: mengirim ? "var(--surface-subtle)" : "var(--grad-aksen)",
              color: mengirim ? "var(--text-muted)" : "var(--on-navy)",
              cursor: mengirim ? "default" : "pointer",
            }}>
            {mengirim ? "Membuat…" : "Buat Jurnal (Draf)"}
          </button>
        </div>
      </BottomSheet>
    </div>
  );
}
