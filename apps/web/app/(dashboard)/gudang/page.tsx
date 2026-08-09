"use client";

/**
 * GUDANG — IKHTISAR. Tempat barang KEMBALI, bukan tempat barang lewat.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * KENAPA BENTUKNYA BERBEDA DARI REFERENSI
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Referensi BuildAxis "Material Management" memodelkan alur MASUK: beli →
 * gudang → kirim ke proyek. Kartunya reorder alert, lead time, supplier
 * performance — semuanya pertanyaan PEMBELIAN.
 *
 * Puraloka arahnya terbalik. Founder 2026-08-09: *"sekarang belum ada gudang,
 * tapi nanti setelah proyek selesai, nantinya semua barang, alat-alat akan
 * disimpan lagi ke gudang."* Material dibeli langsung ke lokasi proyek;
 * gudang adalah tempat sisa dan alat PULANG.
 *
 * Meniru referensi apa adanya akan menghasilkan halaman berisi kartu yang
 * tak satu pun bisa dijawab datanya — reorder point untuk gudang yang tak
 * pernah membeli, lead time untuk supplier yang mengirim ke proyek.
 *
 * Jadi yang ditiru BENTUKNYA (KPI strip · komposisi · daftar · riwayat), dan
 * yang diganti PERTANYAANNYA:
 *
 *   Total Materials in Stock  →  berapa alat menganggur vs bekerja
 *   Low-Stock Alerts          →  alat kondisi buruk / perlu perawatan
 *   Inventory Valuation       →  nilai perolehan & nilai buku (sama)
 *   Inward & Outward Stock    →  riwayat keluar-masuk gudang
 *   —                         →  PROYEK SELESAI YANG MATERIALNYA BELUM DITARIK
 *
 * Yang terakhir tak ada di referensi dan justru paling berharga di sini:
 * sisa material di proyek yang sudah selesai adalah barang yang paling mudah
 * hilang, dan tak ada satu pun layar yang selama ini menunjukkannya.
 */

import { useEffect, useRef, useState } from "react";
import {
  PieChart, Pie, Cell, ResponsiveContainer, Tooltip,
} from "recharts";
import {
  AlertTriangle, ArrowLeftRight, Boxes, PackageOpen,
  RefreshCw, Warehouse, Wrench,
} from "lucide-react";
import { api, makeAbortController } from "@/lib/api";
import { C } from "@/lib/warna-ui";
import { Galat, KepalaHalaman, Lencana, Rangka, Tombol } from "@/components/dasar";
import { KartuKPI, Kosong, Panel } from "@/components/ui-dasar";
import { KartuRail, BarisRail } from "@/components/shell/rail-kartu";
import { RailIsi } from "@/components/shell/rail-isi";
import { usePasangRail } from "@/lib/rail-context";
import {
  type IkhtisarGudang, NADA_KONDISI,
  labelGerak, labelKategori, persenNilaiBuku, ringkasRp,
} from "@/lib/ikhtisar-gudang";

/** Warna irisan donat kategori — token, bukan hex (ikut berbalik di mode gelap). */
const WARNA_KATEGORI = [
  "var(--navy)",
  "var(--warning)",
  "var(--success)",
  "var(--danger)",
  "var(--text-muted)",
] as const;

export default function GudangIkhtisarPage() {
  const [data, setData] = useState<IkhtisarGudang | null>(null);
  const [memuat, setMemuat] = useState(true);
  const [galat, setGalat] = useState("");
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    void muat();
    return () => abortRef.current?.abort();
  }, []);

  async function muat() {
    abortRef.current?.abort();
    abortRef.current = makeAbortController();
    const signal = abortRef.current.signal;
    setMemuat(true);
    setGalat("");
    try {
      const r = await api.get<IkhtisarGudang>("/api/v1/gudang/ikhtisar", { signal });
      setData(r.data);
    } catch (e: unknown) {
      if ((e as { name?: string })?.name === "CanceledError") return;
      setGalat("Gagal memuat ikhtisar gudang. Pastikan API server berjalan.");
    }
    setMemuat(false);
  }

  const kpi = data?.kpi;

  /*
    RAIL KANAN — founder 2026-08-09 menanyakannya untuk keuangan, dan gudang
    punya kekurangan yang sama.

    Isinya BUKAN salinan kolom tengah. Yang di tengah menjawab "bagaimana
    keadaannya"; rail menjawab "apa yang harus saya kerjakan":

      • alat yang perlu diperbaiki (kondisi buruk / rusak / perawatan)
      • material yang masih tertinggal di proyek selesai

    Keduanya menuntut tindakan, dan keduanya mudah terlewat kalau harus
    di-scroll.
  */
  usePasangRail(
    <RailIsi
      konteks={
        <>
          <KartuRail
            judul="Perlu diperbaiki"
            tautan="/aset"
            kosong="Semua alat dalam kondisi layak."
          >
            {(data?.isi_gudang ?? [])
              .filter((a) => a.kondisi === "buruk" || a.status === "rusak" || a.status === "perawatan")
              .slice(0, 6)
              .map((a, i) => (
                <BarisRail
                  key={a.id}
                  pertama={i === 0}
                  utama={a.nama}
                  sub={a.kode}
                  kanan={a.kondisi}
                  nadaKanan={a.kondisi === "buruk" ? "bahaya" : "normal"}
                  href="/aset"
                />
              ))}
          </KartuRail>

          <KartuRail
            judul="Belum ditarik"
            kosong="Semua material sudah kembali."
          >
            {(data?.belum_ditarik ?? []).slice(0, 6).map((b, i) => (
              <BarisRail
                key={b.proyek}
                pertama={i === 0}
                utama={b.proyek}
                sub={`${b.jenis} jenis material`}
                kanan={`${b.qty}`}
                nadaKanan="bahaya"
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
      {/*
        `KepalaHalaman`, BUKAN <h1> sendiri.

        Percobaan pertama menulis <h1> beserta gayanya di sini, dan
        `judul-ratchet` menangkapnya (51 → 52). Penjaga itu benar: sebelum
        UIR-2 ada 27 varian gaya <h1> berbeda di repo ini, dan itulah sumber
        paling langsung dari "tiap halaman terasa buatan orang berbeda".
      */}
      <div className="rise">
        <KepalaHalaman
          judul="Gudang"
          keterangan="Alat dan sisa material yang kembali setelah proyek selesai"
          ikon={<Warehouse size={19} />}
          aksi={
            <Tombol onClick={() => void muat()} ikon={<RefreshCw size={14} />}>
              Muat ulang
            </Tombol>
          }
        />
      </div>

      {galat && <Galat pesan={galat} onCobaLagi={() => void muat()} />}
      {memuat && !galat && <Rangka tinggi={96} jumlah={3} />}

      {!memuat && !galat && kpi && data && (
        <>
          {/* ── KPI ────────────────────────────────────────────────────── */}
          <div className="rise rise-2 kpi-strip" style={{
            display: "grid", gap: "var(--r3)", marginBottom: "var(--r4)",
            gridTemplateColumns: "repeat(6, minmax(0, 1fr))",
          }}>
            <KartuKPI
              label="Alat di gudang"
              nilai={String(kpi.di_gudang)}
              nilaiAngka={kpi.di_gudang}
              ikon={<Warehouse size={16} />}
              keterangan={`dari ${kpi.total_aset} unit dimiliki`}
            />
            <KartuKPI
              label="Sedang di proyek"
              nilai={String(kpi.di_lapangan)}
              nilaiAngka={kpi.di_lapangan}
              ikon={<ArrowLeftRight size={16} />}
              keterangan="Belum kembali ke gudang"
            />
            <KartuKPI
              label="Perlu perhatian"
              nilai={String(kpi.perlu_perhatian)}
              nilaiAngka={kpi.perlu_perhatian}
              ikon={<Wrench size={16} />}
              sorot={kpi.perlu_perhatian > 0}
              keterangan="Rusak, perawatan, atau kondisi buruk"
            />
            <KartuKPI
              label="Jenis material"
              nilai={String(kpi.jenis_material_gudang)}
              nilaiAngka={kpi.jenis_material_gudang}
              ikon={<Boxes size={16} />}
              keterangan="Sisa proyek yang sudah ditarik"
            />
            <KartuKPI
              label="Belum ditarik"
              nilai={String(kpi.proyek_belum_ditarik)}
              nilaiAngka={kpi.proyek_belum_ditarik}
              ikon={<PackageOpen size={16} />}
              keterangan="Proyek selesai, material masih di lokasi"
            />
            <KartuKPI
              label="Nilai buku aset"
              nilai={ringkasRp(Number(kpi.nilai_buku))}
              ikon={<Boxes size={16} />}
              keterangan={`${persenNilaiBuku(kpi.nilai_buku, kpi.nilai_perolehan)}% dari ${ringkasRp(Number(kpi.nilai_perolehan))} perolehan`}
            />
          </div>

          {/* ── BARIS: belum ditarik + komposisi ───────────────────────── */}
          <div className="rise rise-2" style={{
            display: "grid", gap: "var(--r3)", marginBottom: "var(--r4)",
            gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))",
          }}>
            {/*
              DITARUH PALING KIRI, sebelum komposisi dan riwayat.

              Ini satu-satunya kartu di halaman ini yang menuntut TINDAKAN;
              sisanya menyampaikan keadaan. Menaruhnya di bawah grafik berarti
              hal yang harus dikerjakan tenggelam di antara hal yang cuma
              perlu diketahui.
            */}
            <Panel
              judul="Material belum ditarik"
              keterangan="Proyek sudah selesai, materialnya masih di lokasi"
              padat
            >
              {data.belum_ditarik.length === 0 ? (
                <Kosong
                  ikon={<PackageOpen size={24} />}
                  judul="Semua sudah ditarik"
                  sebab="Tak ada proyek selesai yang materialnya masih tertinggal."
                />
              ) : (
                <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
                  {data.belum_ditarik.map((b, i) => (
                    <li key={b.proyek} style={{
                      display: "flex", alignItems: "center", gap: 10, padding: "10px 0",
                      borderTop: i === 0 ? "none" : `1px solid ${C.border}`,
                    }}>
                      <AlertTriangle size={15} aria-hidden="true"
                        style={{ color: "var(--warning)", flexShrink: 0 }} />
                      <span style={{
                        flex: 1, minWidth: 0, fontSize: 13, color: C.text,
                        overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                      }}>{b.proyek}</span>
                      <span style={{
                        fontSize: 11, color: C.muted, flexShrink: 0,
                        fontVariantNumeric: "tabular-nums",
                      }}>{b.jenis} jenis · {b.qty} unit</span>
                    </li>
                  ))}
                </ul>
              )}
            </Panel>

            <Panel judul="Komposisi alat" keterangan="Menurut kategori" padat>
              {data.aset_per_kategori.length === 0 ? (
                <Kosong
                  ikon={<Boxes size={24} />}
                  judul="Belum ada aset"
                  sebab="Belum ada alat yang tercatat di perusahaan ini."
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
                          data={data.aset_per_kategori}
                          dataKey="jml" nameKey="nama"
                          innerRadius={42} outerRadius={72} paddingAngle={2}
                        >
                          {data.aset_per_kategori.map((k, i) => (
                            <Cell key={k.nama} fill={WARNA_KATEGORI[i % WARNA_KATEGORI.length]} />
                          ))}
                        </Pie>
                        <Tooltip
                          contentStyle={{
                            background: "var(--surface)", border: `1px solid ${C.border}`,
                            borderRadius: 8, fontSize: 12,
                          }}
                          formatter={((v: number) => [`${v} unit`, ""]) as never}
                          labelFormatter={labelKategori as never}
                        />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                  <ul style={{ listStyle: "none", margin: 0, padding: 0, flex: 1, minWidth: 130 }}>
                    {data.aset_per_kategori.map((k, i) => (
                      <li key={k.nama} style={{
                        display: "flex", alignItems: "center", gap: 8, padding: "4px 0",
                      }}>
                        <span aria-hidden="true" style={{
                          width: 9, height: 9, borderRadius: 2, flexShrink: 0,
                          background: WARNA_KATEGORI[i % WARNA_KATEGORI.length],
                        }} />
                        <span style={{
                          flex: 1, fontSize: 12, color: C.text, minWidth: 0,
                          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                        }}>{labelKategori(k.nama)}</span>
                        <span style={{
                          fontSize: 12, fontWeight: 700, color: C.text,
                          fontVariantNumeric: "tabular-nums", flexShrink: 0,
                        }}>{k.jml}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </Panel>
          </div>

          {/* ── BARIS: isi gudang + riwayat ────────────────────────────── */}
          <div className="rise rise-3" style={{
            display: "grid", gap: "var(--r3)",
            gridTemplateColumns: "repeat(auto-fit, minmax(340px, 1fr))",
          }}>
            <Panel
              judul="Isi gudang"
              keterangan="Kondisi terburuk di atas — yang perlu diperbaiki dulu"
              padat
            >
              {data.isi_gudang.length === 0 ? (
                <Kosong
                  ikon={<Warehouse size={24} />}
                  judul="Gudang kosong"
                  sebab="Seluruh alat sedang berada di lokasi proyek."
                />
              ) : (
                <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
                  {data.isi_gudang.map((a, i) => (
                    <li key={a.id} style={{
                      display: "flex", alignItems: "center", gap: 10, padding: "10px 0",
                      borderTop: i === 0 ? "none" : `1px solid ${C.border}`,
                    }}>
                      <span style={{ flex: 1, minWidth: 0 }}>
                        <span style={{
                          display: "block", fontSize: 13, color: C.text, fontWeight: 500,
                          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                        }}>{a.nama}</span>
                        <span style={{
                          display: "block", fontSize: 11, color: C.muted, marginTop: 2,
                        }}>{a.kode} · {labelKategori(a.kategori)}</span>
                      </span>
                      <Lencana nada={NADA_KONDISI[a.kondisi] ?? "peringatan"}>
                        {a.kondisi}
                      </Lencana>
                    </li>
                  ))}
                </ul>
              )}
            </Panel>

            <Panel
              judul="Riwayat pergerakan"
              keterangan="Keluar ke proyek dan kembali ke gudang"
              padat
            >
              {data.pergerakan.length === 0 ? (
                <Kosong
                  ikon={<ArrowLeftRight size={24} />}
                  judul="Belum ada pergerakan"
                  sebab="Belum ada alat yang tercatat keluar atau masuk gudang."
                />
              ) : (
                <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
                  {data.pergerakan.map((m, i) => (
                    <li key={m.id} style={{
                      display: "flex", alignItems: "center", gap: 10, padding: "10px 0",
                      borderTop: i === 0 ? "none" : `1px solid ${C.border}`,
                    }}>
                      <span style={{ flex: 1, minWidth: 0 }}>
                        <span style={{
                          display: "block", fontSize: 13, color: C.text, fontWeight: 500,
                        }}>{labelGerak(m.jenis)}</span>
                        <span style={{
                          display: "block", fontSize: 11, color: C.muted, marginTop: 2,
                          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                        }}>
                          {m.dari ?? "—"} → {m.ke ?? "—"}
                        </span>
                      </span>
                      {/*
                        Lencana MEMBURUK memakai `memburuk` dari server, bukan
                        membandingkan kondisi di sini. Urutan tingkat kondisi
                        yang ditulis ulang di tiap tempat akan menyimpang, dan
                        satu tempat yang salah urutan menandai alat sehat
                        sebagai rusak.
                      */}
                      {/*
                        Lencana + waktu DIBUNGKUS SATU KOLOM, bukan dua anak
                        sejajar.

                        Diukur sesudah rail dipasang: kolom tengah menyempit
                        ~300px, dan tiga anak sebaris (teks · lencana · waktu)
                        mendorong "32h lalu" sampai menempel garis tepi kartu.
                        Menumpuknya membuat lebar yang dibutuhkan tinggal
                        selebar lencana, dan waktunya tak lagi berebut ruang.
                      */}
                      <span style={{
                        display: "flex", flexDirection: "column",
                        alignItems: "flex-end", gap: 3, flexShrink: 0,
                      }}>
                        {m.memburuk && (
                          <Lencana nada="bahaya">
                            {m.kondisi_sebelum} → {m.kondisi_sesudah}
                          </Lencana>
                        )}
                        <span style={{
                          fontSize: 11, color: C.muted,
                          fontVariantNumeric: "tabular-nums",
                        }}>{m.hari_lalu !== null ? `${m.hari_lalu}h lalu` : "—"}</span>
                      </span>
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
