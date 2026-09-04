"use client";

/**
 * GRAFIK MODUL — satu komponen, empat halaman ikhtisar.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * KENAPA BERSAMA, BUKAN SATU PER HALAMAN
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Diukur 2026-08-09 terhadap ciri referensi BuildAxis (KPI · grafik · rail ·
 * kartu): dari 11 halaman ikhtisar, hanya TIGA punya grafik. Referensi selalu
 * punya minimal satu per halaman, dan itulah beda paling terasa.
 *
 * Empat halaman (`/proyek`, `/kas`, `/procurement`, `/mandor`) membutuhkan
 * bentuk yang sama: deret bulanan + komposisi. Menulisnya empat kali berarti
 * empat tempat yang harus diperbaiki saat sumbu terpotong, saat warna donat
 * bertabrakan, atau saat format rupiah berubah — tiga cacat yang SUDAH
 * terjadi masing-masing sekali sesi ini.
 *
 * Endpoint `/api/v1/deret/:modul` sengaja mengembalikan bentuk identik untuk
 * keempatnya, jadi komponen ini tak perlu tahu ia sedang menggambar apa.
 *
 * ── Pelajaran yang sudah dibayar, dipasang sejak awal di sini
 *
 *   `margin.left: 0`     bukan negatif — label "100%"/"4.9 M" terpotong
 *                        (cacat di grafik lapangan, ketahuan dari layar)
 *   sumbu diringkas      "1.972.965.000" tak muat di label mana pun
 *   warna donat berjarak `--aksen` dan `--navy` tampak sama di irisan kecil
 *   token, bukan hex     hex tak berbalik di mode gelap
 */

import { useEffect, useRef, useState } from "react";
import {
  AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell,
} from "recharts";
import { TrendingUp } from "lucide-react";
import { api, makeAbortController } from "@/lib/api";
import { C } from "@/lib/warna-ui";
import { Kosong, Panel } from "@/components/ui-dasar";
import {
  type DeretModul, WARNA_DERET, labelBulanPendek, ringkasNilai, labelKomposisi,
} from "@/lib/deret-modul";

export function GrafikModul({ modul }: { modul: "proyek" | "kas" | "procurement" | "mandor" }) {
  const [data, setData] = useState<DeretModul | null>(null);
  const [memuat, setMemuat] = useState(true);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    const ac = makeAbortController();
    abortRef.current = ac;
    api.get<DeretModul>(`/api/v1/deret/${modul}`, { signal: ac.signal })
      .then((r) => setData(r.data))
      .catch(() => setData(null))
      .finally(() => setMemuat(false));
    return () => ac.abort();
  }, [modul]);

  /*
    Memuat / gagal → tak merender apa pun.

    Grafik ini TAMBAHAN di atas halaman yang sudah lengkap sendiri (KPI,
    tabel, daftar). Spanduk galat di puncak halaman yang sisanya sehat akan
    membuat orang mengira seluruh modul rusak — pola yang sama sudah dipakai
    `AnalitikKeuangan`.
  */
  if (memuat || !data) return null;

  const adaDeret = data.deret.some((d) => Number(d.nilai) > 0);
  const adaKomposisi = data.komposisi.length > 0;
  if (!adaDeret && !adaKomposisi) return null;

  const deretAngka = data.deret.map((d) => ({ bulan: d.bulan, nilai: Number(d.nilai) }));
  const komposisiAngka = data.komposisi.map((k) => ({
    nama: labelKomposisi(k.nama), n: Number(k.nilai), jumlah: k.jumlah,
  }));

  return (
    <div className="rise rise-2" style={{
      display: "grid", gap: "var(--r3)", marginBottom: "var(--r4)",
      gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
    }}>
      <Panel judul={data.label_deret} keterangan="12 bulan terakhir" padat>
        {!adaDeret ? (
          <Kosong
            ikon={<TrendingUp size={24} />}
            judul="Belum ada data"
            sebab="Belum ada transaksi tercatat pada periode ini."
          />
        ) : (
          <div style={{ height: 220 }}>
            <ResponsiveContainer width="100%" height="100%">
              {/*
                `margin.left: 0`, BUKAN negatif — label sumbu di sini bisa
                sepanjang "4.9 M", dan margin negatif menariknya keluar area
                gambar sehingga yang terbaca cuma potongannya. Cacat itu
                sudah terjadi sekali di grafik lapangan ("9%" alih-alih
                "100%") dan ketahuan dari tangkapan layar, bukan dari kode.
              */}
              <AreaChart data={deretAngka} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id={`grad-${modul}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--navy)" stopOpacity={0.26} />
                    <stop offset="100%" stopColor="var(--navy)" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <XAxis
                  dataKey="bulan" tickLine={false} axisLine={false}
                  tick={{ fontSize: "var(--t-mikro)", fill: C.muted }}
                  tickFormatter={labelBulanPendek}
                  minTickGap={20}
                />
                <YAxis
                  tickLine={false} axisLine={false} width={52}
                  tick={{ fontSize: "var(--t-mikro)", fill: C.muted }}
                  tickFormatter={(v: number) => ringkasNilai(v)}
                />
                <Tooltip
                  contentStyle={{
                    background: "var(--surface)", border: `1px solid ${C.border}`,
                    borderRadius: 8, fontSize: 12,
                  }}
                  formatter={((v: number) => [ringkasNilai(v), ""]) as never}
                  labelFormatter={labelBulanPendek as never}
                />
                <Area
                  type="monotone" dataKey="nilai"
                  stroke="var(--navy)" strokeWidth={2}
                  fill={`url(#grad-${modul})`}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        )}
      </Panel>

      <Panel judul={data.label_komposisi} keterangan="Menurut nilai" padat>
        {!adaKomposisi ? (
          <Kosong
            ikon={<TrendingUp size={24} />}
            judul="Belum ada data"
            sebab="Belum ada baris yang bisa dikelompokkan."
          />
        ) : (
          <div style={{
            display: "flex", alignItems: "center",
            gap: "var(--gap-bagian)", flexWrap: "wrap",
          }}>
            <div style={{ width: 152, height: 152, flexShrink: 0 }}>
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={komposisiAngka} dataKey="n" nameKey="nama"
                    innerRadius={42} outerRadius={72} paddingAngle={2}
                  >
                    {komposisiAngka.map((k, i) => (
                      <Cell key={k.nama} fill={WARNA_DERET[i % WARNA_DERET.length]} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{
                      background: "var(--surface)", border: `1px solid ${C.border}`,
                      borderRadius: 8, fontSize: 12,
                    }}
                    formatter={((v: number) => [ringkasNilai(v), ""]) as never}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>

            {/*
              Legenda ditulis sendiri, bukan `<Legend>` Recharts: kita perlu
              NILAI di sebelah nama. Donat tanpa angka memaksa orang
              mengarahkan kursor ke tiap irisan untuk membacanya.
            */}
            <ul style={{ listStyle: "none", margin: 0, padding: 0, flex: 1, minWidth: 130 }}>
              {komposisiAngka.map((k, i) => (
                <li key={k.nama} style={{
                  display: "flex", alignItems: "center", gap: 8, padding: "4px 0",
                }}>
                  <span aria-hidden="true" style={{
                    width: 9, height: 9, borderRadius: 2, flexShrink: 0,
                    background: WARNA_DERET[i % WARNA_DERET.length],
                  }} />
                  <span style={{
                    flex: 1, fontSize: 12, color: C.text, minWidth: 0,
                    overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                  }}>{k.nama}</span>
                  <span style={{
                    fontSize: 12, fontWeight: 700, color: C.text,
                    fontVariantNumeric: "tabular-nums", flexShrink: 0,
                  }}>{ringkasNilai(k.n)}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </Panel>
    </div>
  );
}
