"use client";

/**
 * MANDOR — RINGKASAN. Keadaan modul hari ini, lalu jalan ke bagian yang perlu.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * Berkas ini dulu 3.848 baris
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Halaman TERBESAR di repo, dengan tujuh tab di dalamnya. Uji ARAH-VISUAL
 * §6a — *"kalau saya kirim tautan ini ke rekan, apa yang ia lihat?"* —
 * dijawab "tergantung tab mana yang terakhir ia buka". Itu definisi halaman
 * yang menyamar jadi tab, dan founder sudah memutuskan (§10 no. 3) bahwa
 * yang seperti itu dipecah.
 *
 * Sekarang tiap tab punya rutenya sendiri (lihat `layout.tsx`), dan yang
 * tersisa di sini adalah lapisan yang §5b sebut "KEADAAN" dan "POLA":
 *
 *   · keadaan  — KPI modul (di `layout.tsx`, dibagi ke semua bagian)
 *   · pola     — komposisi laporan menurut status + beban kasbon per mandor
 *   · detail   — yang menuntut tindakan HARI INI, dengan jalan ke halamannya
 *
 * Urutannya bukan selera: ia mengikuti pertanyaan yang dibawa orang saat
 * membuka menu Mandor. Menaruh tabel di atas memaksa mereka memindai puluhan
 * baris untuk menjawab pertanyaan yang bisa dijawab satu angka.
 *
 * ── Kenapa tak ada grafik pustaka
 *
 * Dua "grafik" di sini adalah bilah proporsi yang digambar dengan `<div>`,
 * bukan komponen chart. Alasannya bukan kemalasan: keduanya menampilkan
 * KOMPOSISI dari maksimal lima kategori, dan bilah bertumpuk membacanya
 * lebih cepat daripada donat — tanpa menambah kilobita pustaka ke rute yang
 * tugasnya justru memuat cepat.
 */

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { api, makeAbortController } from "@/lib/api";
import { Kosong } from "@/components/ui-dasar";
import { GrafikModul } from "@/components/shell/grafik-modul";
import { KartuRail, BarisRail } from "@/components/shell/rail-kartu";
import { RailIsi } from "@/components/shell/rail-isi";
import { usePasangRail } from "@/lib/rail-context";
import {
  ArrowRight, Clock, HardHat, Banknote, AlertTriangle, CheckCircle2,
} from "lucide-react";
import { C } from "@/lib/warna-ui";
import {
  type WageReport, type WorkerKasbon, type ProgressPayment,
  fmt, fmtDateShort, getWageStatusBadge, kartu as card,
} from "./_bersama/tipe";

/** Warna per status laporan — dipakai bilah komposisi dan legendanya. */
const WARNA_STATUS: Record<string, string> = {
  draft: C.mid,
  submitted: C.yellow,
  approved: C.green,
  rejected: C.red,
  paid: C.blue,
};

function JudulBagian({ children, tautan, labelTautan }: {
  children: React.ReactNode; tautan?: string; labelTautan?: string;
}) {
  return (
    <div style={{
      display: "flex", alignItems: "baseline", justifyContent: "space-between",
      gap: 12, marginBottom: 10,
    }}>
      <h2 style={{
        fontFamily: "var(--font-display)", fontSize: 15, fontWeight: 650,
        color: C.text, margin: 0,
      }}>{children}</h2>
      {tautan && (
        <Link href={tautan} style={{
          fontSize: 12, fontWeight: 600, color: C.navy, textDecoration: "none",
          display: "inline-flex", alignItems: "center", gap: 4, flexShrink: 0,
        }}>
          {labelTautan ?? "Lihat semua"} <ArrowRight size={12} aria-hidden="true" />
        </Link>
      )}
    </div>
  );
}

export default function MandorRingkasanPage() {
  const [reports, setReports] = useState<WageReport[]>([]);
  const [kasbons, setKasbons] = useState<WorkerKasbon[]>([]);
  const [payments, setPayments] = useState<ProgressPayment[]>([]);
  const [loading, setLoading] = useState(true);

  const muat = useCallback((signal?: AbortSignal) => {
    setLoading(true);
    Promise.all([
      api.get<{ reports: WageReport[] }>("/api/v1/mandor/wage-reports", { signal })
        .catch(() => ({ data: { reports: [] } })),
      api.get<{ kasbons: WorkerKasbon[] }>("/api/v1/mandor/worker-kasbons", { signal })
        .catch(() => ({ data: { kasbons: [] } })),
      api.get<{ payments: ProgressPayment[] }>("/api/v1/mandor/progress-payments", { signal })
        .catch(() => ({ data: { payments: [] } })),
    ]).then(([rpt, kb, pp]) => {
      setReports(rpt.data.reports ?? []);
      setKasbons(kb.data.kasbons ?? []);
      setPayments(pp.data.payments ?? []);
    }).finally(() => setLoading(false));
  }, []);

  // `queueMicrotask`, bukan panggilan langsung: memanggil `setLoading(true)`
  // di badan efek memicu render berantai (`react-hooks/set-state-in-effect`).
  // Pola yang sama dipakai `mandor/retensi` dan sudah lolos ratchet lint.
  useEffect(() => {
    const ac = makeAbortController();
    queueMicrotask(() => { muat(ac.signal); });
    return () => ac.abort();
  }, [muat]);

  // ── POLA 1 — komposisi laporan menurut status ────────────────────────────
  const komposisi = Object.entries(
    reports.reduce<Record<string, number>>((acc, r) => {
      acc[r.status] = (acc[r.status] ?? 0) + 1;
      return acc;
    }, {}),
  ).sort((a, b) => b[1] - a[1]);
  const totalLaporan = reports.length;

  // ── POLA 2 — beban kasbon per mandor (lima teratas) ──────────────────────
  const bebanPerMandor = Array.from(
    kasbons.filter((k) => !k.is_settled).reduce((peta, k) => {
      const nama = k.mandor?.name ?? "Tidak diketahui";
      peta.set(nama, (peta.get(nama) ?? 0) + (Number(k.amount) - Number(k.amount_settled)));
      return peta;
    }, new Map<string, number>()),
  ).sort((a, b) => b[1] - a[1]).slice(0, 5);
  const bebanTerbesar = bebanPerMandor[0]?.[1] ?? 0;

  // ── DETAIL — yang menuntut tindakan hari ini ─────────────────────────────
  const menungguPutusan = reports.filter((r) => r.status === "submitted").slice(0, 5);
  const penagihanMenunggu = payments.filter((p) => p.status === "pending").slice(0, 5);

  /*
    RAIL KANAN — `/mandor` satu-satunya dari empat halaman yang diukur
    2026-08-09 yang belum punya sama sekali (nilai 2/4: tak ada grafik, tak
    ada rail).

    Isinya memakai nilai yang SUDAH dihitung di atas — `menungguPutusan` dan
    `bebanPerMandor`. Menghitung ulang di sini berarti dua sumber untuk angka
    yang sama, dan saat menyimpang tak ada yang tahu mana yang benar.
  */
  usePasangRail(
    <RailIsi
      konteks={
        <>
          <KartuRail
            judul="Menunggu putusan"
            tautan="/mandor/upah"
            kosong="Tak ada laporan menunggu."
          >
            {menungguPutusan.map((r, i) => (
              <BarisRail
                key={r.id}
                pertama={i === 0}
                /*
                  `r.assignment.mandor`, BUKAN `r.scope.assignment` — `scope`
                  hanya punya id/nama/sistem bayar. Diperiksa ke `tipe.ts`
                  sesudah tsc menolak tebakan pertama.
                */
                utama={r.assignment?.mandor?.name ?? "Mandor"}
                sub={`Minggu ${String(r.week_start ?? "").slice(5)}`}
                kanan={fmt(Number(r.net_amount) || 0)}
                nadaKanan="normal"
                href="/mandor/upah"
              />
            ))}
          </KartuRail>

          <KartuRail
            judul="Kasbon belum lunas"
            tautan="/mandor/kasbon"
            kosong="Semua kasbon sudah dilunasi."
          >
            {bebanPerMandor.map(([nama, nilai], i) => (
              <BarisRail
                key={nama}
                pertama={i === 0}
                utama={nama}
                kanan={fmt(nilai)}
                nadaKanan={nilai > 0 ? "bahaya" : "normal"}
                href="/mandor/kasbon"
              />
            ))}
          </KartuRail>
        </>
      }
    />,
    [reports, kasbons],
  );

  if (loading) {
    return (
      <div style={{ width: "100%", padding: "var(--pad-atas) var(--pad-x) var(--pad-bawah)", maxWidth: "var(--w-luas)", margin: "0 auto" }}>
        <div style={{ textAlign: "center", padding: 60, color: C.muted }}>Memuat data...</div>
      </div>
    );
  }

  return (
    // Padding disediakan `mandor/layout.tsx` — lihat catatan di sana.
    // Menambahkannya lagi di sini membuat jaraknya ganda dan berbeda-beda
    // antar bagian, cacat yang sama yang sudah ditambal di modul Keuangan.
    <div style={{
      width: "100%", maxWidth: "var(--w-luas)", margin: "0 auto",
      display: "flex", flexDirection: "column", gap: 20,
    }}>
      {/*
        GRAFIK MODUL — deret upah 12 bulan + komposisi status.

        Halaman ini SUDAH punya komposisi status (bilah bertumpuk di bawah),
        jadi yang benar-benar baru dari komponen ini adalah DERET WAKTUNYA:
        "berapa upah keluar tiap bulan" tak terjawab di mana pun sebelumnya.

        Donat komposisinya memang menggandakan bilah bertumpuk. Dibiarkan,
        dan itu keputusan sadar: memberi komponen ini prop untuk mematikan
        separuh dirinya berarti empat halaman lain ikut menanggung
        percabangan demi satu pengecualian. Dua bentuk untuk data yang sama
        di layar yang panjang lebih murah daripada komponen bercabang.
      */}
      <GrafikModul modul="mandor" />

      {/* ══ LAPIS 2 — POLA ═══════════════════════════════════════════════ */}
      <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
        {/* Komposisi laporan menurut status */}
        <div style={{ ...card, padding: "14px 16px", flex: "1 1 340px", minWidth: 300 }}>
          <JudulBagian tautan="/mandor/upah" labelTautan="Buka daftar">
            Laporan upah menurut status
          </JudulBagian>
          {totalLaporan === 0 ? (
            <div style={{ fontSize: 12, color: C.muted, padding: "12px 0" }}>
              Belum ada laporan upah yang bisa diringkas.
            </div>
          ) : (
            <>
              {/* Bilah bertumpuk. Proporsinya BUKAN satu-satunya penanda —
                  legenda di bawahnya menuliskan angka dan namanya, jadi
                  pembacaannya tak bergantung pada bisa-tidaknya seseorang
                  membedakan warna (WCAG 1.4.1). */}
              <div aria-hidden="true" style={{
                display: "flex", height: 10, borderRadius: 5,
                overflow: "hidden", background: "var(--surface-hover)", marginBottom: 12,
              }}>
                {komposisi.map(([status, jumlah]) => (
                  <div key={status} style={{
                    width: `${(jumlah / totalLaporan) * 100}%`,
                    background: WARNA_STATUS[status] ?? C.mid,
                  }} />
                ))}
              </div>
              <ul style={{
                listStyle: "none", margin: 0, padding: 0,
                display: "flex", flexDirection: "column", gap: 6,
              }}>
                {komposisi.map(([status, jumlah]) => {
                  const st = getWageStatusBadge(status);
                  return (
                    <li key={status} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12 }}>
                      <span aria-hidden="true" style={{
                        width: 8, height: 8, borderRadius: 2, flexShrink: 0,
                        background: WARNA_STATUS[status] ?? C.mid,
                      }} />
                      <span style={{ color: C.mid }}>{st.label}</span>
                      <span style={{ flex: 1, borderBottom: `1px dotted ${C.border}`, margin: "0 4px" }} />
                      <span style={{ fontWeight: 700, color: C.text, fontVariantNumeric: "tabular-nums" }}>
                        {jumlah}
                      </span>
                      <span style={{ color: C.muted, fontVariantNumeric: "tabular-nums", minWidth: 42, textAlign: "right" }}>
                        {Math.round((jumlah / totalLaporan) * 100)}%
                      </span>
                    </li>
                  );
                })}
              </ul>
            </>
          )}
        </div>

        {/* Beban kasbon per mandor */}
        <div style={{ ...card, padding: "14px 16px", flex: "1 1 340px", minWidth: 300 }}>
          <JudulBagian tautan="/mandor/kasbon" labelTautan="Buka daftar">
            Kasbon belum lunas per mandor
          </JudulBagian>
          {bebanPerMandor.length === 0 ? (
            <div style={{ fontSize: 12, color: C.muted, padding: "12px 0" }}>
              Tidak ada kasbon tukang yang masih beredar.
            </div>
          ) : (
            <ul style={{
              listStyle: "none", margin: 0, padding: 0,
              display: "flex", flexDirection: "column", gap: 10,
            }}>
              {bebanPerMandor.map(([nama, nominal]) => (
                <li key={nama}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 8, marginBottom: 4 }}>
                    <span style={{ fontSize: 12, color: C.text, fontWeight: 600 }}>{nama}</span>
                    <span style={{ fontSize: 12, color: C.red, fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>
                      {fmt(nominal)}
                    </span>
                  </div>
                  <div aria-hidden="true" style={{ height: 5, borderRadius: 3, background: "var(--surface-hover)", overflow: "hidden" }}>
                    <div style={{
                      height: "100%", background: C.yellow,
                      width: bebanTerbesar > 0 ? `${(nominal / bebanTerbesar) * 100}%` : "0%",
                    }} />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {/* ══ LAPIS 3 — DETAIL: yang menuntut tindakan hari ini ════════════ */}
      <div>
        <JudulBagian tautan="/mandor/upah?status=submitted" labelTautan="Tinjau semua">
          Menunggu putusan saya
        </JudulBagian>
        {menungguPutusan.length === 0 && penagihanMenunggu.length === 0 ? (
          <Kosong
            ikon={<CheckCircle2 size={30} aria-hidden="true" />}
            judul="Tidak ada yang menunggu putusan"
            sebab="Semua laporan upah dan pengajuan penagihan sudah ditindaklanjuti. Yang baru masuk akan muncul di sini lebih dulu."
          />
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {menungguPutusan.map((r) => (
              <Link key={r.id} href="/mandor/upah?status=submitted" style={{
                ...card, padding: "10px 14px", textDecoration: "none",
                borderLeft: `3px solid ${C.yellow}`,
                display: "flex", alignItems: "center", gap: 12,
              }}>
                <div aria-hidden="true" style={{
                  width: 32, height: 32, borderRadius: 8, background: C.yellowBg,
                  display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
                }}>
                  <Clock size={15} color={C.yellow} />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: C.text }}>
                    {r.assignment?.mandor?.name ?? "—"} · {r.scope?.scope_name ?? "—"}
                  </div>
                  <div style={{ fontSize: 11, color: C.muted }}>
                    Upah · {r.assignment?.project?.name ?? "—"} · Minggu {fmtDateShort(r.week_start)}–{fmtDateShort(r.week_end)}
                  </div>
                </div>
                <div style={{ fontSize: 14, fontWeight: 700, color: C.navy, flexShrink: 0, fontVariantNumeric: "tabular-nums" }}>
                  {fmt(r.net_amount)}
                </div>
              </Link>
            ))}
            {penagihanMenunggu.map((p) => (
              <Link key={p.id} href="/mandor/penagihan" style={{
                ...card, padding: "10px 14px", textDecoration: "none",
                borderLeft: `3px solid ${C.yellow}`,
                display: "flex", alignItems: "center", gap: 12,
              }}>
                <div aria-hidden="true" style={{
                  width: 32, height: 32, borderRadius: 8, background: C.yellowBg,
                  display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
                }}>
                  <Banknote size={15} color={C.yellow} />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: C.text }}>
                    {p.work_scope?.scope_name ?? "—"}
                  </div>
                  <div style={{ fontSize: 11, color: C.muted }}>
                    Penagihan progress · {p.project?.name ?? "—"} · {p.pct_done}% · diajukan {p.requester?.name ?? "—"}
                  </div>
                </div>
                <div style={{ fontSize: 14, fontWeight: 700, color: C.navy, flexShrink: 0, fontVariantNumeric: "tabular-nums" }}>
                  {fmt(p.gross_payment)}
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>

      {/* ══ Jalan pintas ke bagian lain ═══════════════════════════════════ */}
      <div>
        <JudulBagian>Bagian lain</JudulBagian>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {[
            { href: "/mandor/penugasan", label: "Penugasan", sub: "mandor · scope · proyek", ikon: <HardHat size={15} /> },
            { href: "/mandor/retensi", label: "Retensi", sub: "yang ditahan & siap cair", ikon: <AlertTriangle size={15} /> },
            { href: "/mandor/absensi", label: "Absensi", sub: "sumber hari kerja upah", ikon: <Clock size={15} /> },
            { href: "/mandor/tukang", label: "Daftar Tukang", sub: "master data pekerja", ikon: <HardHat size={15} /> },
          ].map((b) => (
            <Link key={b.href} href={b.href} style={{
              ...card, padding: "12px 14px", textDecoration: "none",
              flex: "1 1 200px", minWidth: 190,
              display: "flex", alignItems: "center", gap: 10,
            }}>
              <span aria-hidden="true" style={{
                width: 32, height: 32, borderRadius: 8, background: C.navyLight, color: C.navy,
                display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
              }}>{b.ikon}</span>
              <span style={{ minWidth: 0 }}>
                <span style={{ display: "block", fontSize: 13, fontWeight: 600, color: C.text }}>{b.label}</span>
                <span style={{ display: "block", fontSize: 11, color: C.muted }}>{b.sub}</span>
              </span>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
