"use client";

/**
 * WIDGET SERAPAN ANGGARAN — "Budget Utilization Overview" versi jujur.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * BENTUKNYA REFERENSI, PEMBAGINYA DIUKUR
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Referensi: donat besar, "68% Utilized" di tengah, empat baris rincian
 * (Total / Utilized / Committed / Balance) dan tombol laporan.
 *
 * Bentuk itu ditiru. Yang berbeda ada di angkanya, dan bedanya penting:
 * persentase portofolio hanya sah kalau dihitung TERTIMBANG rupiah — bukan
 * rata-rata persen antar proyek. `lib/serapan.ts` (7 test) yang memutuskan,
 * dan salah satu testnya khusus menjaga jebakan itu: proyek Rp 1 juta yang
 * habis tak boleh menyeret portofolio Rp 1 miliar ke "50% terpakai".
 *
 * ── Kenapa endpointnya sendiri, bukan `/api/v1/dashboard`
 *
 * Serapan butuh RAB/RAP/belanja aktual lintas proyek — data yang tak ada di
 * muatan dashboard. `/api/v1/cost-analytics/portfolio` sudah menyediakannya.
 *
 * Endpoint itu SELALU 500 sejak ditulis (memakai `db.from()` untuk tabel
 * kategori C, yang ditolak penjaga tenancy) dan tak pernah ketahuan karena tak
 * ada yang memanggilnya. Diperbaiki bersamaan dengan widget ini — cacatnya
 * ditemukan justru karena ada yang akhirnya memakainya.
 *
 * ── Gagal = widget menjelaskan dirinya, bukan menghilang
 *
 * Kalau permintaan gagal, kartunya tetap ada dengan kalimat yang menyebutkan
 * keadaannya. Widget yang lenyap terbaca sebagai aplikasi rusak; widget yang
 * berkata "belum ada anggaran tercatat" terbaca sebagai informasi.
 */

import { useEffect, useState } from "react";
import Link from "next/link";
import { PieChart, Pie, Cell } from "recharts";
import { ArrowRight } from "lucide-react";
import { api, makeAbortController } from "@/lib/api";
import { ringkasSerapan, type BarisPortofolio } from "@/lib/serapan";
import { formatRupiahSingkat } from "@/lib/format";
import { C } from "@/lib/warna-ui";

export function WidgetSerapan() {
  const [baris, setBaris] = useState<BarisPortofolio[] | null>(null);
  const [gagal, setGagal] = useState(false);
  const [memuat, setMemuat] = useState(true);

  useEffect(() => {
    const ac = makeAbortController();
    api.get<{ data: BarisPortofolio[] }>("/api/v1/cost-analytics/portfolio", { signal: ac.signal })
      .then((r) => setBaris(r.data?.data ?? []))
      .catch((e) => {
        if (e?.name === "CanceledError") return;
        // Dicatat sebagai keadaan, bukan ditelan: kartunya akan MENGATAKAN
        // bahwa angkanya tak bisa dibaca, alih-alih menampilkan 0% yang
        // terlihat seperti fakta.
        setGagal(true);
      })
      .finally(() => setMemuat(false));
    return () => ac.abort();
  }, []);

  const r = ringkasSerapan(baris);

  // Donat butuh dua irisan. Saat serapan melewati pagu, sisa = 0 dan cincinnya
  // penuh — itu benar: tak ada lagi yang tersisa untuk digambar.
  const irisan = [
    { nama: "Terserap", nilai: Math.min(r.serapan, r.pagu) },
    { nama: "Sisa", nilai: r.sisa },
  ];

  const nadaPersen =
    r.persen > 100 ? "var(--danger)"
    : r.persen >= 90 ? "var(--warning)"
    : C.text;

  return (
    <div style={{
      padding: "var(--pad-kartu-lega)", height: "100%",
      display: "flex", flexDirection: "column", gap: 12,
    }}>
      <SectionJudul />

      {memuat ? (
        <div style={{ height: 120, borderRadius: "var(--rad-sedang)", background: "var(--surface-hover)" }} />
      ) : gagal || !r.adaData ? (
        <p style={{ margin: 0, fontSize: "var(--t-badan)", color: C.mid, lineHeight: 1.5 }}>
          {gagal
            ? "Angka serapan tak bisa dibaca saat ini."
            : "Belum ada proyek yang punya RAB, RAP, atau nilai kontrak sebagai pagu."}
        </p>
      ) : (
        <>
          <div style={{ display: "flex", alignItems: "center", gap: "var(--gap-grid)" }}>
            <div style={{ position: "relative", flexShrink: 0 }}>
              <PieChart width={110} height={110}>
                <defs>
                  <linearGradient id="serapan-terpakai" x1="0" y1="0" x2="1" y2="1">
                    <stop offset="0%" stopColor="var(--aksen-pekat)" />
                    <stop offset="60%" stopColor="var(--aksen)" />
                    <stop offset="100%" stopColor="var(--aksen-terang)" />
                  </linearGradient>
                </defs>
                <Pie
                  data={irisan} dataKey="nilai"
                  cx={55} cy={55} innerRadius={34} outerRadius={52}
                  paddingAngle={irisan[1].nilai > 0 ? 3 : 0} strokeWidth={0}
                  /* Animasi masuk dimatikan: widget ini dimuat setelah data
                     tiba, jadi animasinya justru terlihat sebagai kedipan. */
                  isAnimationActive={false}
                >
                  <Cell fill="url(#serapan-terpakai)" />
                  <Cell fill="var(--surface-hover)" />
                </Pie>
              </PieChart>
              <div style={{
                position: "absolute", top: "50%", left: "50%",
                transform: "translate(-50%,-50%)", textAlign: "center", pointerEvents: "none",
              }}>
                <div style={{
                  fontSize: 20, fontWeight: 800, color: nadaPersen, lineHeight: 1,
                  fontVariantNumeric: "tabular-nums",
                }}>
                  {r.persen}%
                </div>
                <div style={{ fontSize: 10, color: C.muted }}>terpakai</div>
              </div>
            </div>

            <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 8 }}>
              <Baris label="Total pagu" nilai={formatRupiahSingkat(r.pagu)} />
              <Baris label="Terserap" nilai={formatRupiahSingkat(r.serapan)} warna="var(--aksen)" />
              <Baris label="Sisa" nilai={formatRupiahSingkat(r.sisa)} />
            </div>
          </div>

          {/*
            Dua peringatan yang TIDAK ada di referensi, dan justru inilah yang
            membuat angka tengah bisa ditindaklanjuti: berapa proyek yang sudah
            membengkak, dan berapa yang angkanya belum bisa dipercaya karena
            paguya memang belum ada.
          */}
          {(r.lewatPagu > 0 || r.tanpaPagu > 0) && (
            <p style={{ margin: 0, fontSize: 11, color: C.muted, lineHeight: 1.45 }}>
              {r.lewatPagu > 0 && (
                <><strong style={{ color: "var(--danger)", fontWeight: 700 }}>{r.lewatPagu} proyek</strong> melewati pagunya. </>
              )}
              {r.tanpaPagu > 0 && (
                <>{r.tanpaPagu} proyek belum punya pagu — tak ikut dihitung.</>
              )}
            </p>
          )}
        </>
      )}

      <div style={{ marginTop: "auto", paddingTop: 4 }}>
        <Link
          href="/keuangan/cvr"
          style={{
            display: "inline-flex", alignItems: "center", gap: 4,
            fontSize: "var(--t-kecil)", fontWeight: 600, color: "var(--navy)",
            textDecoration: "none",
          }}
        >
          Biaya vs nilai terpasang
          <ArrowRight size={13} aria-hidden="true" />
        </Link>
      </div>
    </div>
  );
}

function SectionJudul() {
  return (
    <h3 style={{
      margin: 0, fontSize: "var(--t-badan)", fontWeight: 700, color: C.text,
      display: "flex", alignItems: "center", gap: 8,
    }}>
      <span aria-hidden="true" style={{
        width: 3, height: 14, borderRadius: 2, background: "var(--navy)",
      }} />
      Serapan Anggaran
    </h3>
  );
}

function Baris({ label, nilai, warna }: { label: string; nilai: string; warna?: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
      <span style={{ fontSize: 11, color: C.mid, flex: 1, minWidth: 0 }}>{label}</span>
      <span style={{
        fontSize: 12, fontWeight: 700, color: warna ?? C.text,
        fontVariantNumeric: "tabular-nums", flexShrink: 0,
      }}>
        {nilai}
      </span>
    </div>
  );
}
