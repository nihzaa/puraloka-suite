"use client";

/**
 * LAPANGAN — DASHBOARD MODUL, mengikuti referensi BuildAxis "Site Progress".
 *
 * ══════════════════════════════════════════════════════════════════════════
 * CATATAN LAMA DI BERKAS INI SUDAH TIDAK BERLAKU — DAN ITU PENTING DICATAT
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Versi sebelumnya menulis panjang lebar bahwa tiga KPI (punch belum tutup,
 * NCR aktif, inspeksi menunggu) **tidak bisa dibuat**, karena modul lapangan
 * hanya dilayani rute bersarang per-proyek. Halaman ini bahkan memasang
 * spanduk yang menyatakannya kepada pemakai.
 *
 * Alasannya benar saat ditulis, dan ia menutup dirinya sendiri dengan syarat
 * pencabutan yang jelas: *"Menghidupkannya butuh satu endpoint agregat baru
 * (mis. GET /api/v1/lapangan/ringkasan)."*
 *
 * Endpoint itu sekarang ADA (`routes/v1/lapangan.ts`, 13 test). Jadi
 * batasannya dicabut beserta spanduknya — bukan dibiarkan menempel seperti
 * peringatan GL di `CLAUDE.md` §5.5 yang bertahan berbulan-bulan setelah
 * penyebabnya diperbaiki, lalu menyesatkan sesi berikutnya.
 *
 * ── Bentuknya meniru referensi; angkanya tidak
 *
 * Referensi "Site Progress" punya enam KPI, grafik progres harian, milestone
 * tracker, labor strength, dan issue tracker. Semuanya ditiru. Yang TIDAK
 * ditiru: "AI Delay Prediction 9.5 days" dan "AI Progress Forecast". Itu
 * ramalan tanpa model di baliknya — di sini setiap angka datang dari baris
 * yang bisa ditelusuri.
 *
 * Satu penyimpangan yang perlu disebut: referensi menggambar bar persentase
 * per milestone ("Foundation Work 100%"). Tabel `milestones` di basis ini
 * **tidak punya kolom progres** — hanya status. Jadi kartunya menampilkan
 * status dan tenggat, bukan bar karangan.
 *
 * ── Satu permintaan, bukan N
 *
 * Seluruh halaman ini dilayani `GET /api/v1/lapangan/ringkasan`. Versi
 * sebelumnya memanggil `/projects` + `/dashboard/fokus`; menambah punch, NCR,
 * dan inspeksi lewat rute per-proyek akan berarti 3×N permintaan dari
 * peramban di halaman yang dibuka setiap hari.
 */

import Link from "next/link";
import {
  AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer,
  BarChart, Bar, Cell,
} from "recharts";
import {
  AlertTriangle, CalendarClock, CheckCircle2, ClipboardCheck,
  HardHat, RefreshCw, TrendingUp, Users,
} from "lucide-react";
import { useCallback } from "react";
import { useData } from "@/lib/data-cache";
import { C } from "@/lib/warna-ui";
import { Galat, Lencana, Rangka, Tombol, KepalaHalaman } from "@/components/dasar";
import { KartuKPI, Kosong, Panel } from "@/components/ui-dasar";
import { KartuRail, BarisRail } from "@/components/shell/rail-kartu";
import { RailIsi } from "@/components/shell/rail-isi";
import { usePasangRail } from "@/lib/rail-context";
import {
  type RingkasanLapangan, NADA_SEVERITY, labelStatus, persenSelesai,
} from "@/lib/ringkas-lapangan";

export default function LapanganRingkasanPage() {
  /*
    ── PINDAH KE LAPIS CACHE BERSAMA (F4-2), 2026-08-16

    `useData` menggantikan ref-AbortController + fungsi `muat()` biasa.
    Halaman ini murni baca — tak ada aksi tulis, jadi tak ada galat aksi
    terpisah dari galat muat.
  */
  const { data, memuat, galat: galatMuat, muatUlang } = useData<RingkasanLapangan>("/api/v1/lapangan/ringkasan");
  const muat = useCallback(async () => { await muatUlang(); }, [muatUlang]);
  const galat = galatMuat ? "Gagal memuat ikhtisar lapangan. Pastikan API server berjalan." : "";

  const kpi = data?.kpi;

  /*
    RAIL KONTEKSTUAL — Asisten & Pengingat ditambahkan `RailIsi` (selalu ada).
    Yang relevan DI SINI: temuan yang menunggu tindakan, karena itulah yang
    membuat orang membuka halaman lapangan di pagi hari.
  */
  usePasangRail(
    <RailIsi
      tanggalTenggat={(data?.milestone ?? []).map((m) => m.tanggal)}
      konteks={
        <>
          {/*
            NOMOR ikut ditampilkan di baris utama, dan itu bukan hiasan.

            Diukur dari layar: rail sempat menampilkan "Nat keramik tidak
            rata" dua kali dan "Pasangan bata tidak tegak lurus" tiga kali.
            Datanya BENAR — cacat yang sama memang ditemukan di beberapa
            proyek — tetapi tanpa pembeda, daftar itu terbaca sebagai bug
            duplikasi, dan pemakai akan berhenti memercayai kartunya.

            Nomor (PL-2608-014) adalah pembeda terpendek yang tersedia. Nama
            proyek sudah ada di baris `sub`, tetapi di kolom 300px ia terpotong
            justru di bagian yang membedakan ("Renovasi Dapur & KM Pak Hendra
            — Ci…" vs "…— Cih…").
          */}
          <KartuRail
            judul="Punch mendesak"
            tautan="/lapangan/punch-list"
            kosong="Tak ada temuan terbuka."
          >
            {(data?.punch_terbaru ?? []).map((p, i) => (
              <BarisRail
                key={p.id}
                pertama={i === 0}
                utama={`${p.nomor} · ${p.judul}`}
                sub={p.proyek ?? undefined}
                kanan={p.severity}
                nadaKanan={NADA_SEVERITY[p.severity] ?? "normal"}
                href="/lapangan/punch-list"
              />
            ))}
          </KartuRail>

          <KartuRail
            judul="NCR aktif"
            tautan="/mutu/ncr"
            kosong="Tak ada ketidaksesuaian aktif."
          >
            {(data?.ncr_terbaru ?? []).map((n, i) => (
              <BarisRail
                key={n.id}
                pertama={i === 0}
                utama={`${n.nomor} · ${n.judul}`}
                sub={n.proyek ?? undefined}
                kanan={n.severity}
                nadaKanan={NADA_SEVERITY[n.severity] ?? "normal"}
                href="/mutu/ncr"
              />
            ))}
          </KartuRail>
        </>
      }
    />,
    [data],
  );

  return (
    <div style={{
      padding: "var(--pad-atas) var(--pad-x) var(--pad-bawah)",
      width: "100%", maxWidth: "var(--w-page)", margin: "0 auto",
    }}>
      <div className="rise" style={{
        display: "flex", justifyContent: "space-between", alignItems: "flex-start",
        gap: 12, flexWrap: "wrap", marginBottom: 20,
      }}>
        <KepalaHalaman judul="Lapangan" keterangan="Keadaan pekerjaan hari ini — progres, tenaga kerja, dan temuan mutu"         ikon={<HardHat size={19} />}
      />
        <Tombol onClick={() => void muat()} ikon={<RefreshCw size={14} />}>
          Muat ulang
        </Tombol>
      </div>

      {galat && <Galat pesan={galat} onCobaLagi={() => void muat()} />}
      {memuat && !galat && <Rangka tinggi={96} jumlah={3} />}

      {!memuat && !galat && kpi && data && (
        <>
          {/* ── KPI STRIP — enam kartu, urutan referensi ──────────────────── */}
          {/*
            Enam kolom DIPAKSA + kelas `.kpi-strip` — pola yang SAMA dengan
            beranda, dan alasannya sama persis.

            `auto-fit minmax(190px)` memilih lima kolom pada lebar konten di
            sini (rail memakan 300px), sehingga kartu keenam turun sendirian
            ke baris kedua dan terbaca sebagai kartu tercecer. Terlihat di
            tangkapan layar pertama halaman ini.

            Titik pembungkusan untuk layar sempit diputuskan media query
            `.kpi-strip` di globals.css (3 kolom di bawah 1400px, 2 di bawah
            700px) — bukan ditebak `auto-fit`.
          */}
          <div className="rise rise-2 kpi-strip" style={{
            display: "grid", gap: "var(--r3)", marginBottom: "var(--r4)",
            gridTemplateColumns: "repeat(6, minmax(0, 1fr))",
          }}>
            <KartuKPI
              label="Progres rata-rata"
              nilai={`${kpi.progres_rata}%`}
              nilaiAngka={kpi.progres_rata}
              ikon={<TrendingUp size={16} />}
              keterangan={`Rerata ${kpi.proyek_aktif} proyek aktif`}
            />
            <KartuKPI
              label="Milestone selesai"
              nilai={`${kpi.milestone_selesai}/${kpi.milestone_total}`}
              ikon={<CheckCircle2 size={16} />}
              keterangan={`${persenSelesai(kpi.milestone_selesai, kpi.milestone_total)}% dari seluruh milestone`}
            />
            <KartuKPI
              label="Tukang hadir"
              nilai={String(kpi.tukang_hadir_hari_ini)}
              nilaiAngka={kpi.tukang_hadir_hari_ini}
              ikon={<Users size={16} />}
              // Nol pada hari Minggu adalah KEADAAN NORMAL, bukan kegagalan.
              // Tanpa kalimat ini, kartu "0" di hari libur terbaca sebagai
              // data rusak — dan orang akan melapor bug yang tak ada.
              keterangan={kpi.tukang_hadir_hari_ini === 0
                ? `Belum ada absensi hari ini · ${kpi.tukang_aktif} tukang aktif`
                : `dari ${kpi.tukang_aktif} tukang aktif`}
            />
            <KartuKPI
              label="Punch terbuka"
              nilai={String(kpi.punch_terbuka)}
              nilaiAngka={kpi.punch_terbuka}
              ikon={<ClipboardCheck size={16} />}
              sorot={kpi.punch_terbuka > 0}
              keterangan="Temuan sisa pekerjaan belum tuntas"
            />
            <KartuKPI
              label="NCR aktif"
              nilai={String(kpi.ncr_aktif)}
              nilaiAngka={kpi.ncr_aktif}
              ikon={<AlertTriangle size={16} />}
              keterangan="Ketidaksesuaian belum ditutup"
            />
            <KartuKPI
              label="Inspeksi menunggu"
              nilai={String(kpi.inspeksi_menunggu)}
              nilaiAngka={kpi.inspeksi_menunggu}
              ikon={<CalendarClock size={16} />}
              keterangan="Diminta atau sudah dijadwalkan"
            />
          </div>

          {/* ── BARIS DUA — progres harian + kehadiran ────────────────────── */}
          <div className="rise rise-2" style={{
            display: "grid", gap: "var(--r3)", marginBottom: "var(--r4)",
            gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
          }}>
            <Panel judul="Progres dilaporkan" keterangan="Rerata laporan harian, 6 bulan terakhir" padat>
              {data.progres_harian.length < 2 ? (
                <Kosong
                  ikon={<TrendingUp size={24} />}
                  judul="Belum cukup laporan"
                  sebab="Butuh minimal dua hari berlaporan untuk menggambar tren."
                />
              ) : (
                <div style={{ height: 220 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    {/*
                        `margin.left: 0`, BUKAN negatif.

                        Percobaan pertama memakai -18 (disalin dari widget
                        dashboard yang sumbunya tanpa satuan). Di sini
                        labelnya "100%" — tiga huruf lebih panjang — dan
                        margin negatif menarik sumbu keluar area gambar
                        sehingga yang terbaca cuma "9%". Angka sumbu yang
                        terpotong lebih buruk daripada tak ada sumbu: ia
                        terbaca sebagai nilai, bukan sebagai potongan.
                      */}
                      <AreaChart data={data.progres_harian} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                      <defs>
                        <linearGradient id="gradProgres" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="var(--navy)" stopOpacity={0.28} />
                          <stop offset="100%" stopColor="var(--navy)" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <XAxis
                        dataKey="tanggal" tickLine={false} axisLine={false}
                        tick={{ fontSize: 10, fill: C.muted }}
                        tickFormatter={(t: string) => t.slice(5)}
                        minTickGap={24}
                      />
                      <YAxis
                        tickLine={false} axisLine={false} width={44}
                        tick={{ fontSize: 10, fill: C.muted }}
                        domain={[0, 100]} unit="%"
                      />
                      <Tooltip
                        contentStyle={{
                          background: "var(--surface)", border: `1px solid ${C.border}`,
                          borderRadius: 8, fontSize: 12,
                        }}
                        formatter={((v: number) => [`${v}%`, "Progres"]) as never}
                      />
                      <Area
                        type="monotone" dataKey="progres"
                        stroke="var(--navy)" strokeWidth={2}
                        fill="url(#gradProgres)"
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              )}
            </Panel>

            <Panel judul="Kehadiran tukang" keterangan="Orang-hari per tanggal, 30 hari terakhir" padat>
              {data.tenaga_kerja.hadir_30_hari.length === 0 ? (
                <Kosong
                  ikon={<Users size={24} />}
                  judul="Belum ada absensi"
                  sebab="Absensi harian belum dicatat untuk periode ini."
                />
              ) : (
                <div style={{ height: 220 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={data.tenaga_kerja.hadir_30_hari} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                      <XAxis
                        dataKey="tanggal" tickLine={false} axisLine={false}
                        tick={{ fontSize: 10, fill: C.muted }}
                        tickFormatter={(t: string) => t.slice(5)}
                        minTickGap={20}
                      />
                      <YAxis tickLine={false} axisLine={false} width={34}
                        tick={{ fontSize: 10, fill: C.muted }} />
                      <Tooltip
                        contentStyle={{
                          background: "var(--surface)", border: `1px solid ${C.border}`,
                          borderRadius: 8, fontSize: 12,
                        }}
                        formatter={((v: number) => [`${v} orang-hari`, "Setara penuh"]) as never}
                      />
                      {/*
                        `orang_hari`, bukan `orang`: setengah hari adalah
                        setengah orang-hari. Menggambar jumlah BARIS membuat
                        grafik selalu lebih tinggi daripada tenaga kerja
                        sebenarnya — dan itu angka yang dipakai menghitung upah.
                      */}
                      <Bar dataKey="orang_hari" radius={[3, 3, 0, 0]} fill="var(--navy)" />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </Panel>
          </div>

          {/* ── BARIS TIGA — milestone · temuan · proyek ──────────────────── */}
          <div className="rise rise-3" style={{
            display: "grid", gap: "var(--r3)", marginBottom: "var(--r4)",
            gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))",
          }}>
            <Panel judul="Milestone berikutnya" keterangan="Yang belum selesai, tenggat terdekat di atas" padat>
              {data.milestone.length === 0 ? (
                <Kosong
                  ikon={<CheckCircle2 size={24} />}
                  judul="Semua milestone selesai"
                  sebab="Tak ada milestone yang masih berjalan di proyek mana pun."
                />
              ) : (
                <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
                  {data.milestone.map((m, i) => (
                    <li key={m.id} style={{
                      display: "flex", alignItems: "flex-start", gap: 10,
                      padding: "9px var(--pad-kartu-lega)",
                      borderTop: i === 0 ? "none" : `1px solid ${C.border}`,
                    }}>
                      <span style={{ flex: 1, minWidth: 0 }}>
                        <span style={{
                          display: "block", fontSize: 13, color: C.text, fontWeight: 500,
                          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                        }}>{m.judul}</span>
                        <span style={{
                          display: "block", fontSize: 11, color: C.muted, marginTop: 2,
                          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                        }}>{m.proyek ?? "—"}</span>
                      </span>
                      {m.terlambat
                        ? <Lencana nada="bahaya">telat</Lencana>
                        : <span style={{
                            fontSize: 11, color: C.mid, flexShrink: 0,
                            fontVariantNumeric: "tabular-nums",
                          }}>{String(m.tanggal ?? "—").slice(5)}</span>}
                    </li>
                  ))}
                </ul>
              )}
            </Panel>

            <Panel judul="Temuan mutu" keterangan="Punch list per keadaan" padat>
              {data.temuan.punch_per_status.length === 0 ? (
                <Kosong
                  ikon={<ClipboardCheck size={24} />}
                  judul="Belum ada temuan"
                  sebab="Punch list belum diisi untuk proyek mana pun."
                />
              ) : (
                <div style={{ height: 190 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={data.temuan.punch_per_status}
                      layout="vertical"
                      margin={{ top: 4, right: 24, left: 4, bottom: 0 }}
                    >
                      <XAxis type="number" hide />
                      <YAxis
                        type="category" dataKey="nama" width={96}
                        tickLine={false} axisLine={false}
                        tick={{ fontSize: 11, fill: C.mid }}
                        tickFormatter={labelStatus}
                      />
                      <Tooltip
                        cursor={{ fill: "var(--surface-hover)" }}
                        contentStyle={{
                          background: "var(--surface)", border: `1px solid ${C.border}`,
                          borderRadius: 8, fontSize: 12,
                        }}
                        formatter={((v: number) => [`${v} temuan`, ""]) as never}
                        labelFormatter={labelStatus as never}
                      />
                      <Bar dataKey="jml" radius={[0, 3, 3, 0]}>
                        {data.temuan.punch_per_status.map((s) => (
                          <Cell
                            key={s.nama}
                            /*
                              Warna mengikuti MAKNA statusnya, bukan urutan:
                              "terbuka" merah, "ditutup" hijau. Palet berputar
                              otomatis akan memberi warna hijau pada status
                              terburuk separuh waktu.
                            */
                            fill={s.nama === "ditutup" ? "var(--success)"
                              : s.nama === "terbuka" ? "var(--danger)"
                              : s.nama === "ditolak" ? C.muted
                              : "var(--warning)"}
                          />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </Panel>

            <Panel judul="Tenaga kerja" keterangan="Komposisi tukang aktif" padat>
              <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
                {data.tenaga_kerja.per_tipe.map((t, i) => (
                  <li key={t.nama} style={{
                    display: "flex", alignItems: "center", gap: 10,
                    padding: "10px var(--pad-kartu-lega)",
                    borderTop: i === 0 ? "none" : `1px solid ${C.border}`,
                  }}>
                    <span style={{ flex: 1, fontSize: 13, color: C.text, textTransform: "capitalize" }}>
                      {t.nama}
                    </span>
                    <span style={{
                      fontSize: 15, fontWeight: 700, color: C.text,
                      fontVariantNumeric: "tabular-nums",
                    }}>{t.jml}</span>
                  </li>
                ))}
                <li style={{
                  display: "flex", alignItems: "center", gap: 10,
                  padding: "10px var(--pad-kartu-lega)", borderTop: `1px solid ${C.border}`,
                }}>
                  <span style={{ flex: 1, fontSize: 13, color: C.mid }}>Total aktif</span>
                  <span style={{
                    fontSize: 15, fontWeight: 700, color: "var(--navy)",
                    fontVariantNumeric: "tabular-nums",
                  }}>{kpi.tukang_aktif}</span>
                </li>
              </ul>
            </Panel>
          </div>

          {/* ── PROYEK BERJALAN — paling tertinggal di atas ───────────────── */}
          <div className="rise rise-3">
            <Panel
              judul="Proyek berjalan"
              keterangan="Progres terendah di atas — di sinilah pekerjaan perlu dikejar"
              padat
            >
              {data.proyek.length === 0 ? (
                <Kosong
                  ikon={<HardHat size={26} />}
                  judul="Tidak ada proyek berjalan"
                  sebab="Semua proyek sudah berstatus selesai atau dibatalkan."
                  aksi={<Tombol href="/proyek" jenis="utama">Buka daftar proyek</Tombol>}
                />
              ) : (
                <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
                  {data.proyek.map((p, i) => (
                    <li key={p.id} style={{
                      padding: "12px var(--pad-kartu-lega)",
                      borderTop: i === 0 ? "none" : `1px solid ${C.border}`,
                    }}>
                      <div style={{
                        display: "flex", alignItems: "center", gap: 10, marginBottom: 6,
                      }}>
                        <Link href={`/proyek/${p.id}`} style={{
                          flex: 1, minWidth: 0, color: C.text, fontWeight: 600,
                          fontSize: 13, textDecoration: "none",
                          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                        }}>{p.nama}</Link>
                        {p.lewat_tenggat && <Lencana nada="bahaya">lewat tenggat</Lencana>}
                        <span style={{
                          fontSize: 13, fontWeight: 700, color: C.text,
                          fontVariantNumeric: "tabular-nums", flexShrink: 0,
                        }}>{Math.round(p.progres)}%</span>
                      </div>
                      {/*
                        Bar progres. `role="img"` + label: bar tanpa nama
                        aksesibel tak terbaca sama sekali oleh pembaca layar,
                        dan persentasenya memang sudah tertulis di atas —
                        tetapi hubungan antara keduanya tidak.
                      */}
                      <div
                        role="img"
                        aria-label={`${p.nama}: ${Math.round(p.progres)} persen`}
                        style={{
                          height: 6, borderRadius: 3, overflow: "hidden",
                          background: "var(--surface-hover)",
                        }}
                      >
                        <div style={{
                          width: `${Math.min(100, Math.max(0, p.progres))}%`,
                          height: "100%", borderRadius: 3,
                          background: p.lewat_tenggat ? "var(--danger)" : "var(--navy)",
                          transition: "width 500ms cubic-bezier(0.16,1,0.3,1)",
                        }} />
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </Panel>
          </div>
        </>
      )}
    </div>
  );
}
