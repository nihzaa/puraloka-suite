"use client";

/**
 * MANDOR — kerangka modul: judul, KPI, dan navigasi antar-bagian.
 *
 * ── Kenapa layout, bukan tujuh tab di satu berkas
 *
 * Sampai 2026-08-07 modul ini adalah SATU berkas 3.848 baris — halaman
 * terbesar di repo — dengan tujuh tab di dalamnya. Uji ARAH-VISUAL §6a,
 * *"kalau saya kirim tautan ini ke rekan, apa yang ia lihat?"*, dijawab
 * "tergantung tab mana yang terakhir ia buka". Itu definisi halaman yang
 * menyamar jadi tab.
 *
 * Rute nyata memperbaiki empat hal sekaligus: tautan bisa dibagikan, tombol
 * Kembali bekerja, judul tab peramban berbeda per bagian, dan Next.js memecah
 * kodenya per rute tanpa diminta — membuka Ringkasan tak lagi mengunduh kode
 * ketujuh bagian.
 *
 * ── Kenapa KPI di layout, bukan di tiap halaman
 *
 * Lima angka teratas menggambarkan SELURUH modul, bukan bagian yang sedang
 * dibuka — itu sebabnya di versi tab pun ia berada di atas deretan tab.
 * Menaruhnya di layout membuatnya dimuat sekali dan bertahan saat berpindah
 * bagian: angka yang berkedip tiap klik membuat orang ragu datanya berubah.
 *
 * Pola ini menyalin `keuangan/layout.tsx`, yang sudah menempuh pemecahan yang
 * sama (3.449 → 523 baris + 6 sub-halaman). Pola baru tidak dibuat.
 */

import { useCallback, useEffect, useState } from "react";
import { HardHat, Clock, Banknote, Users, AlertTriangle, FileText } from "lucide-react";
import { api, makeAbortController } from "@/lib/api";
import { C } from "@/lib/warna-ui";
import { NavBagian, type Bagian } from "@/components/nav-bagian";
import { fmt, type Summary, type WorkerKasbon, type ProgressPayment } from "./_bersama/tipe";

/**
 * Angka lencana navigasi — dimuat terpisah dari KPI.
 *
 * Keduanya butuh sumber berbeda (`/summary` tak memuat jumlah kasbon aktif
 * per-baris maupun penagihan menunggu), dan keduanya boleh gagal sendiri-
 * sendiri: lencana yang hilang lebih baik daripada seluruh kerangka modul
 * yang tak muncul.
 */
function useHitunganLencana() {
  const [kasbonAktif, setKasbonAktif] = useState<number>();
  const [penagihanMenunggu, setPenagihanMenunggu] = useState<number>();

  useEffect(() => {
    const ac = makeAbortController();
    api.get<{ kasbons: WorkerKasbon[] }>("/api/v1/mandor/worker-kasbons", { signal: ac.signal })
      .then((r) => setKasbonAktif((r.data.kasbons ?? []).filter((k) => !k.is_settled).length))
      .catch(() => {});
    api.get<{ payments: ProgressPayment[] }>("/api/v1/mandor/progress-payments", { signal: ac.signal })
      .then((r) => setPenagihanMenunggu((r.data.payments ?? []).filter((p) => p.status === "pending").length))
      .catch(() => {});
    return () => ac.abort();
  }, []);

  return { kasbonAktif, penagihanMenunggu };
}

function KartuAngka({ label, nilai, sub, ikon, warna, tepi }: {
  label: string; nilai: string; sub?: string | null;
  ikon: React.ReactNode; warna: string; tepi?: string;
}) {
  return (
    <div style={{
      flex: "1 1 180px", minWidth: 180,
      background: "var(--surface)", border: `1px solid ${tepi ?? C.border}`,
      borderRadius: 10, padding: "12px 16px",
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
        <span style={{ color: warna, display: "flex" }}>{ikon}</span>
        <span style={{
          fontSize: 10, fontWeight: 700, letterSpacing: ".05em",
          textTransform: "uppercase", color: C.muted,
        }}>{label}</span>
      </div>
      <div style={{
        fontFamily: "var(--font-display)", fontSize: 22, fontWeight: 700,
        color: warna, lineHeight: 1.1, fontVariantNumeric: "tabular-nums",
      }}>{nilai}</div>
      {sub && <div style={{ fontSize: 11, color: C.muted, marginTop: 4, lineHeight: 1.4 }}>{sub}</div>}
    </div>
  );
}

export default function MandorLayout({ children }: { children: React.ReactNode }) {
  const [ringkas, setRingkas] = useState<Summary | null>(null);
  const [gagal, setGagal] = useState(false);
  const { kasbonAktif, penagihanMenunggu } = useHitunganLencana();

  const muat = useCallback((signal?: AbortSignal) => {
    api.get<Summary>("/api/v1/mandor/summary", { signal })
      .then((r) => { setRingkas(r.data); setGagal(false); })
      .catch((e) => { if (e?.name !== "CanceledError") setGagal(true); });
  }, []);

  useEffect(() => {
    const ac = makeAbortController();
    muat(ac.signal);
    return () => ac.abort();
  }, [muat]);

  const bagian: Bagian[] = [
    { href: "/mandor", label: "Ringkasan" },
    { href: "/mandor/penugasan", label: "Penugasan" },
    {
      href: "/mandor/upah", label: "Laporan Upah",
      jumlah: ringkas?.pendingReports,
      // Laporan menunggu = upah yang belum sampai ke tukang karena menunggu
      // SAYA. Itu satu-satunya angka di navigasi ini yang menuntut tindakan
      // hari ini, jadi ia satu-satunya yang boleh merah.
      mendesak: (ringkas?.pendingReports ?? 0) > 0,
    },
    { href: "/mandor/kasbon", label: "Kasbon Tukang", jumlah: kasbonAktif },
    { href: "/mandor/penagihan", label: "Penagihan Progress", jumlah: penagihanMenunggu },
    { href: "/mandor/retensi", label: "Retensi" },
    { href: "/mandor/absensi", label: "Absensi" },
    { href: "/mandor/tukang", label: "Daftar Tukang" },
  ];

  return (
    <div style={{
      padding: "var(--pad-atas) var(--pad-x) var(--pad-bawah)",
      width: "100%", maxWidth: "var(--w-luas)", margin: "0 auto",
    }}>
      <div className="rise" style={{
        display: "flex", alignItems: "center", gap: 12, marginBottom: 20,
      }}>
        <div style={{
          width: 40, height: 40, borderRadius: 10, background: C.navyLight,
          display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
        }}>
          <HardHat size={20} color={C.navy} />
        </div>
        <div style={{ minWidth: 0 }}>
          <h1 style={{
            fontFamily: "var(--font-display)", fontSize: 28, fontWeight: 700,
            color: C.text, margin: 0, lineHeight: 1.15,
          }}>Mandor</h1>
          <p style={{ fontSize: 13, color: C.mid, margin: "2px 0 0" }}>
            Penugasan, laporan upah, kasbon tukang, dan manajemen tenaga kerja
          </p>
        </div>
      </div>

      {/* KPI modul — hanya disembunyikan kalau gagal dimuat. Menampilkan
          "Rp 0" pada data yang tak terbaca adalah kebohongan yang
          menenangkan, dan pada angka upah itu berbahaya. */}
      {!gagal && (
        <div className="rise rise-2" style={{
          display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 18,
        }}>
          {ringkas ? (
            <>
              <KartuAngka label="Laporan Menunggu" nilai={`${ringkas.pendingReports}`}
                sub="laporan upah menunggu putusan"
                ikon={<Clock size={15} />} warna={C.yellow} tepi={C.yellowBorder} />
              <KartuAngka label="Perlu Dibayar" nilai={fmt(ringkas.approvedAmount)}
                sub="sudah disetujui, belum dibayar"
                ikon={<Banknote size={15} />} warna={C.green} tepi={C.greenBorder} />
              <KartuAngka label="Pekerja Terdaftar" nilai={`${ringkas.totalWorkersAll}`}
                sub={ringkas.activeWorkersThisMonth > 0
                  ? `${ringkas.activeWorkersThisMonth} aktif 30 hari terakhir`
                  : "belum ada yang aktif bulan ini"}
                ikon={<Users size={15} />} warna={C.navy} />
              <KartuAngka label="Kasbon Aktif" nilai={`${ringkas.activeKasbons}`}
                sub="belum lunas"
                ikon={<AlertTriangle size={15} />} warna={C.red} tepi={C.redBorder} />
              <KartuAngka label="Total Kasbon Aktif" nilai={fmt(ringkas.activeKasbonAmount)}
                sub="yang akan dipotong dari upah"
                ikon={<FileText size={15} />} warna={C.mid} />
            </>
          ) : (
            // Rangka, bukan spinner: tinggi yang sama dengan kartu sungguhan,
            // jadi isi di bawahnya tak melompat saat data tiba.
            Array.from({ length: 5 }, (_, i) => (
              <div key={i} aria-hidden="true" style={{
                flex: "1 1 180px", minWidth: 180, height: 96,
                background: "var(--surface-subtle)", borderRadius: 10,
                border: `1px solid ${C.border}`,
              }} />
            ))
          )}
        </div>
      )}

      <div className="rise rise-2" style={{
        background: "var(--surface)", border: `1px solid ${C.border}`,
        borderRadius: 14, boxShadow: "var(--naik-1)",
        overflow: "hidden",
      }}>
        <div style={{ padding: "0 8px" }}>
          <NavBagian bagian={bagian} />
        </div>

        {/* Padding isi ADA DI SINI, satu tempat untuk seluruh bagian —
            supaya tak lahir tiga jarak berbeda seperti yang terjadi di modul
            Keuangan sebelum layout-nya menyatukan ini. */}
        <div style={{ padding: "20px 24px 24px" }}>
          {children}
        </div>
      </div>
    </div>
  );
}
