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
import { JudulBagian } from "@/components/judul-bagian";
import { fmt, type Summary } from "./_bersama/tipe";

/**
 * Lencana navigasi: pernah direncanakan, TIDAK jadi.
 *
 * Di sini dulu ada `useHitunganLencana()` — dua permintaan API (worker-kasbons
 * dan progress-payments) yang masing-masing mengunduh SELURUH daftar hanya
 * untuk menghitung panjangnya, lalu hasilnya tak pernah dibaca. Layout ini
 * tidak merender navigasi bagian, jadi lencananya tak punya tempat muncul.
 *
 * Pola yang sama ditemukan di TIGA layout sekaligus (kas, procurement, mandor)
 * — ketiganya menyisakan fetch lencana untuk navigasi yang tak pernah dipasang.
 * Yang membuatnya bertahan: lint hanya melaporkannya sebagai "variabel tak
 * terpakai", keluhan yang terbaca seperti kelalaian gaya.
 *
 * Ini yang paling mahal dari ketiganya: dua daftar penuh diunduh tiap muat.
 */

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
          fontSize: "var(--t-mikro)", fontWeight: 700, letterSpacing: ".05em",
          textTransform: "uppercase", color: C.muted,
        }}>{label}</span>
      </div>
      <div style={{
        fontFamily: "var(--font-display)",
        // `--teks-kpi` (28px), bukan 22px dipaku. Kartu ini muncul di SETIAP
        // halaman cabangnya, jadi ia yang paling menentukan kesan kerapatan
        // modul ini -- dan 22px membuatnya terbaca lebih ringan daripada
        // kartu KPI di modul sebelah yang memakai `KartuKPI` (28px).
        fontSize: "var(--teks-kpi)", fontWeight: 700,
        color: warna, lineHeight: 1.1, fontVariantNumeric: "tabular-nums",
      }}>{nilai}</div>
      {sub && <div style={{ fontSize: "var(--t-kecil)", color: C.muted, marginTop: 4, lineHeight: 1.4 }}>{sub}</div>}
    </div>
  );
}

export default function MandorLayout({ children }: { children: React.ReactNode }) {
  const [ringkas, setRingkas] = useState<Summary | null>(null);
  const [gagal, setGagal] = useState(false);

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
        <JudulBagian cadangan="Mandor" keterangan="Penugasan, laporan upah, kasbon tukang, dan manajemen tenaga kerja" />
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
