"use client";

/**
 * ANALITIK KEUANGAN — bagian bergrafik, mengikuti referensi BuildAxis
 * "Cost Reports & Analytics".
 *
 * ══════════════════════════════════════════════════════════════════════════
 * KENAPA BUKAN "BUDGET vs ACTUAL"
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Referensi membangun hampir seluruh layarnya di atas ANGGARAN: Total Project
 * Cost, Budget Spent, Remaining Budget, donat Cost Breakdown, garis Budget vs
 * Actual.
 *
 * Kita tak bisa menirunya, dan alasannya diukur — bukan ditebak. Audit
 * 2026-08-09 atas `rab_items`:
 *
 *   RAB ada di      2 dari 15 proyek
 *   nilainya        5,5x nilai kontraknya sendiri (impor dari proyek lain)
 *   total_price     banyak NULL
 *   menjumlah semua level = HITUNG GANDA (11,4 M vs 5,2 M daun)
 *
 * Founder memutuskan: **RAB jangan disentuh**. Jadi grafik di sini dibangun
 * dari empat sumber yang barisnya lengkap dan konsisten — invoice, pembayaran,
 * nilai kontrak, kasbon.
 *
 * Penggantinya menjawab pertanyaan yang setara, kadang lebih mendesak:
 *
 *   REFERENSI                  DI SINI
 *   Budget vs Actual      →    TAGIHAN vs PEMBAYARAN per bulan.
 *                              Bukan rencana-vs-realisasi melainkan
 *                              janji-vs-uang-masuk. Untuk kontraktor yang
 *                              arus kasnya ketat, ini justru yang menentukan
 *                              bisa-tidaknya menggaji minggu depan.
 *   Cost Breakdown        →    komposisi KASBON per tujuan. Ini uang yang
 *                              benar-benar keluar ke lapangan, bukan rencana.
 *   Project-wise Expense  →    tabel per proyek: kontrak · tertagih · piutang.
 *
 * Judul kartunya sengaja TIDAK memakai kata "anggaran". Kalau kelak RAB
 * dibereskan dan grafik anggaran sungguhan dibangun, keduanya harus bisa
 * hidup berdampingan tanpa ada yang mengira sudah tergantikan.
 */

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  ComposedChart, Bar, Line, XAxis, YAxis, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend,
} from "recharts";
import { AlertTriangle, TrendingUp, Wallet } from "lucide-react";
import { api, makeAbortController } from "@/lib/api";
import { C } from "@/lib/warna-ui";
import { Lencana, Rangka } from "@/components/dasar";
import { Kosong, Panel } from "@/components/ui-dasar";
import { KartuRail, BarisRail } from "@/components/shell/rail-kartu";
import { RailIsi } from "@/components/shell/rail-isi";
import { usePasangRail } from "@/lib/rail-context";
import {
  type IkhtisarKeuangan, WARNA_KASBON, ringkasJt, labelBulan,
} from "@/lib/ikhtisar-keuangan";

export function AnalitikKeuangan() {
  const [data, setData] = useState<IkhtisarKeuangan | null>(null);
  const [memuat, setMemuat] = useState(true);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    const ac = makeAbortController();
    abortRef.current = ac;
    api.get<IkhtisarKeuangan>("/api/v1/keuangan/ikhtisar", { signal: ac.signal })
      .then((r) => setData(r.data))
      .catch(() => setData(null))
      .finally(() => setMemuat(false));
    return () => ac.abort();
  }, []);

  /*
    RAIL KANAN — dipasang DARI SINI, bukan dari `page.tsx`.

    Founder 2026-08-09: *"dashboard keuangan belum punya panel kanan yaa?"* —
    dan benar. Diperiksa: 5 halaman punya rail (beranda, proyek, procurement,
    aset, kas, lapangan), `/keuangan` dan `/gudang` tidak. Referensi
    "Cost Reports & Analytics" justru punya rail penuh (Report Summary ·
    AI Prediction · Delayed Payment Alerts · Assistant).

    Dipasang di komponen ini karena DI SINILAH datanya sudah ada. Memasangnya
    di `page.tsx` berarti halaman itu harus memanggil `/keuangan/ikhtisar`
    untuk kedua kalinya — dua permintaan untuk data yang identik.

    Isinya sengaja BUKAN salinan kartu tengah: rail menjawab "berapa dan ke
    mana", kolom tengah menjawab "bagaimana bentuk trennya".
  */
  usePasangRail(
    <RailIsi
      tanggalTenggat={(data?.invoice_tertunggak ?? []).map((t) => t.jatuh_tempo)}
      konteks={
        <>
          <KartuRail judul="Ringkasan penagihan" kosong="Belum ada tagihan.">
            {data ? [
              { k: "kontrak", label: "Nilai kontrak", nilai: data.kpi.nilai_kontrak, nada: "normal" as const },
              { k: "tertagih", label: "Sudah ditagih", nilai: data.kpi.tertagih, nada: "normal" as const },
              { k: "terbayar", label: "Sudah dibayar", nilai: data.kpi.terbayar, nada: "baik" as const },
              { k: "piutang", label: "Belum dibayar", nilai: data.kpi.piutang, nada: "bahaya" as const },
            ].map((b, i) => (
              <BarisRail
                key={b.k}
                pertama={i === 0}
                utama={b.label}
                kanan={ringkasJt(Number(b.nilai))}
                nadaKanan={Number(b.nilai) > 0 ? b.nada : "normal"}
              />
            )) : []}
          </KartuRail>

          <KartuRail
            judul="Menunggak"
            tautan="/keuangan/invoice"
            kosong="Tak ada invoice lewat tempo."
          >
            {(data?.invoice_tertunggak ?? []).slice(0, 5).map((t, i) => (
              <BarisRail
                key={t.id}
                pertama={i === 0}
                utama={t.nomor}
                sub={t.proyek ?? undefined}
                kanan={`${t.hari_lewat}h`}
                nadaKanan="bahaya"
                href="/keuangan/invoice"
              />
            ))}
          </KartuRail>
        </>
      }
    />,
    [data],
  );

  if (memuat) return <Rangka tinggi={240} jumlah={2} />;

  /*
    Gagal memuat → tak merender apa pun.

    Sengaja BUKAN pesan galat: bagian ini adalah tambahan analitik di atas
    halaman keuangan yang sudah lengkap sendiri (kartu saldo, daftar invoice,
    rincian biaya). Spanduk merah di puncak halaman yang sisanya sehat akan
    membuat orang mengira seluruh modul keuangan rusak.
  */
  if (!data) return null;

  const adaBulanan = data.bulanan.length >= 2;
  const adaKasbon = data.komposisi_kasbon.length > 0;

  return (
    <div style={{ display: "grid", gap: "var(--r3)", marginBottom: "var(--r4)" }}>
      {/* ── BARIS 1: tagihan vs pembayaran + komposisi kasbon ─────────── */}
      <div style={{
        display: "grid", gap: "var(--r3)",
        gridTemplateColumns: "repeat(auto-fit, minmax(340px, 1fr))",
      }}>
        <Panel
          judul="Tagihan vs pembayaran"
          keterangan="12 bulan terakhir — batang = ditagih, garis = uang masuk"
          padat
        >
          {!adaBulanan ? (
            <Kosong
              ikon={<TrendingUp size={24} />}
              judul="Belum cukup data"
              sebab="Butuh minimal dua bulan bertransaksi untuk menggambar tren."
            />
          ) : (
            <div style={{ height: 240 }}>
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={data.bulanan} margin={{ top: 8, right: 8, left: 4, bottom: 0 }}>
                  <XAxis
                    dataKey="bulan" tickLine={false} axisLine={false}
                    tick={{ fontSize: 10, fill: C.muted }}
                    tickFormatter={labelBulan}
                  />
                  {/*
                    Sumbu dalam JUTA, bukan rupiah penuh. "1.972.965.000" tak
                    muat di label sumbu mana pun, dan memaksanya membuat
                    labelnya terpotong — cacat yang persis terjadi di grafik
                    lapangan sebelum diperbaiki.
                  */}
                  <YAxis
                    tickLine={false} axisLine={false} width={52}
                    tick={{ fontSize: 10, fill: C.muted }}
                    tickFormatter={(v: number) => ringkasJt(v)}
                  />
                  <Tooltip
                    contentStyle={{
                      background: "var(--surface)", border: `1px solid ${C.border}`,
                      borderRadius: 8, fontSize: 12,
                    }}
                    formatter={((v: number, n: string) =>
                      [ringkasJt(v), n === "tagih" ? "Ditagih" : "Dibayar"]) as never}
                    labelFormatter={labelBulan as never}
                  />
                  <Legend
                    verticalAlign="top" height={26}
                    formatter={(v: string) => (
                      <span style={{ fontSize: 11, color: C.mid }}>
                        {v === "tagih" ? "Ditagih" : "Dibayar"}
                      </span>
                    )}
                  />
                  <Bar dataKey="tagih" fill="var(--navy-light)" radius={[3, 3, 0, 0]} />
                  <Line
                    type="monotone" dataKey="bayar"
                    stroke="var(--navy)" strokeWidth={2}
                    dot={{ r: 3, fill: "var(--navy)" }}
                  />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          )}
        </Panel>

        <Panel
          judul="Uang keluar ke lapangan"
          keterangan="Kasbon disetujui & disettle, per tujuan"
          padat
        >
          {!adaKasbon ? (
            <Kosong
              ikon={<Wallet size={24} />}
              judul="Belum ada kasbon"
              sebab="Belum ada kasbon yang disetujui pada periode mana pun."
            />
          ) : (
            <div style={{
              display: "flex", alignItems: "center", flexWrap: "wrap",
              /*
                `var(--gap-bagian)` (16px), bukan angka dipaku —
                `kerapatan-ratchet` menangkapnya (307 → 308) dan itu benar:
                halaman ke-N+1 disalin dari yang ke-N, jadi satu angka dipaku
                hari ini jadi sepuluh bulan depan.
              */
              gap: "var(--gap-bagian)",
            }}>
              <div style={{ width: 168, height: 168, flexShrink: 0 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={data.komposisi_kasbon.map((k) => ({ ...k, n: Number(k.nilai) }))}
                      dataKey="n" nameKey="nama"
                      innerRadius={48} outerRadius={80} paddingAngle={2}
                    >
                      {data.komposisi_kasbon.map((k, i) => (
                        <Cell key={k.kunci} fill={WARNA_KASBON[i % WARNA_KASBON.length]} />
                      ))}
                    </Pie>
                    <Tooltip
                      contentStyle={{
                        background: "var(--surface)", border: `1px solid ${C.border}`,
                        borderRadius: 8, fontSize: 12,
                      }}
                      formatter={((v: number) => [ringkasJt(v), ""]) as never}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>

              {/*
                Legenda ditulis sendiri, bukan `<Legend>` Recharts: kita perlu
                NILAI di sebelah nama, dan Recharts hanya memberi nama+warna.
                Angka tanpa nilai memaksa orang mengarahkan kursor ke tiap
                irisan untuk membaca donatnya.
              */}
              <ul style={{ listStyle: "none", margin: 0, padding: 0, flex: 1, minWidth: 140 }}>
                {data.komposisi_kasbon.map((k, i) => (
                  <li key={k.kunci} style={{
                    display: "flex", alignItems: "center", gap: 8, padding: "5px 0",
                  }}>
                    <span aria-hidden="true" style={{
                      width: 9, height: 9, borderRadius: 2, flexShrink: 0,
                      background: WARNA_KASBON[i % WARNA_KASBON.length],
                    }} />
                    <span style={{
                      flex: 1, fontSize: 12, color: C.text, minWidth: 0,
                      overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                    }}>{k.nama}</span>
                    <span style={{
                      fontSize: 12, fontWeight: 700, color: C.text,
                      fontVariantNumeric: "tabular-nums", flexShrink: 0,
                    }}>{ringkasJt(Number(k.nilai))}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </Panel>
      </div>

      {/* ── BARIS 2: per proyek + tertunggak ──────────────────────────── */}
      <div style={{
        display: "grid", gap: "var(--r3)",
        gridTemplateColumns: "repeat(auto-fit, minmax(340px, 1fr))",
      }}>
        <Panel
          judul="Penagihan per proyek"
          keterangan="Piutang terbesar di atas"
          padat
        >
          <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
            {data.per_proyek.slice(0, 7).map((p, i) => (
              <li key={p.id} style={{
                padding: "10px 0",
                borderTop: i === 0 ? "none" : `1px solid ${C.border}`,
              }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 5 }}>
                  <Link href={`/proyek/${p.id}`} style={{
                    flex: 1, minWidth: 0, fontSize: 13, fontWeight: 600, color: C.text,
                    textDecoration: "none",
                    overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                  }}>{p.nama}</Link>
                  {Number(p.piutang) > 0 && (
                    <span style={{
                      fontSize: 12, fontWeight: 700, color: "var(--danger)",
                      fontVariantNumeric: "tabular-nums", flexShrink: 0,
                    }}>{ringkasJt(Number(p.piutang))}</span>
                  )}
                </div>
                <div style={{
                  display: "flex", alignItems: "center", gap: 8,
                  fontSize: 11, color: C.muted,
                }}>
                  {/*
                    Bar tertagih terhadap nilai KONTRAK — bukan RAB. Dijepit
                    100%: penagihan bisa melebihi kontrak (pekerjaan tambah),
                    dan bar yang meluber keluar wadahnya terbaca sebagai bug
                    tata letak, bukan sebagai informasi.
                  */}
                  <span
                    role="img"
                    aria-label={`${p.nama}: tertagih ${p.pct_tertagih} persen dari nilai kontrak`}
                    style={{
                      flex: 1, height: 5, borderRadius: 3, overflow: "hidden",
                      background: "var(--surface-hover)",
                    }}
                  >
                    <span style={{
                      display: "block",
                      width: `${Math.min(100, p.pct_tertagih)}%`,
                      height: "100%", borderRadius: 3,
                      background: p.pct_tertagih >= 100 ? "var(--success)" : "var(--navy)",
                    }} />
                  </span>
                  <span style={{ fontVariantNumeric: "tabular-nums", flexShrink: 0 }}>
                    {p.pct_tertagih}% tertagih
                  </span>
                </div>
              </li>
            ))}
          </ul>
        </Panel>

        <Panel
          judul="Invoice lewat jatuh tempo"
          keterangan="Paling lama menunggak di atas"
          padat
        >
          {data.invoice_tertunggak.length === 0 ? (
            <Kosong
              ikon={<AlertTriangle size={24} />}
              judul="Tak ada yang menunggak"
              sebab="Seluruh invoice masih dalam tenggat pembayarannya."
            />
          ) : (
            <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
              {data.invoice_tertunggak.map((t, i) => (
                <li key={t.id} style={{
                  display: "flex", alignItems: "center", gap: 10, padding: "10px 0",
                  borderTop: i === 0 ? "none" : `1px solid ${C.border}`,
                }}>
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <span style={{
                      display: "block", fontSize: 13, color: C.text, fontWeight: 500,
                      overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                    }}>{t.nomor}</span>
                    <span style={{
                      display: "block", fontSize: 11, color: C.muted, marginTop: 2,
                      overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                    }}>{t.proyek ?? "—"}</span>
                  </span>
                  <Lencana nada="bahaya">{t.hari_lewat} hari</Lencana>
                  <span style={{
                    fontSize: 12, fontWeight: 700, color: C.text,
                    fontVariantNumeric: "tabular-nums", flexShrink: 0,
                  }}>{ringkasJt(Number(t.sisa))}</span>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>
    </div>
  );
}
