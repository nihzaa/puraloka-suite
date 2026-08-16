"use client";

/**
 * KAS — RINGKASAN. Dashboard modul, bukan tabel.
 *
 * ── Tiga lapis (ARAH-VISUAL-2026 §5b)
 *
 *   LAPIS 1  empat kartu KPI      "apa yang terjadi?"
 *   LAPIS 2  dua grafik           "ke mana arahnya?"
 *   LAPIS 3  tautan ke bagian     "apa yang harus saya kerjakan?"
 *
 * Halaman ini SENGAJA tidak memuat satu pun tabel. Yang dulu ada di tab
 * pertama (daftar akun kas) kini punya rutenya sendiri di `/kas/akun`; menaruh
 * salinannya di sini berarti dua tempat yang harus dijaga sinkron, dan
 * memaksa orang memindai daftar untuk menjawab pertanyaan yang bisa dijawab
 * satu angka.
 *
 * ── Dari mana empat KPI-nya (§5c: saldo total · masuk · keluar · selisih)
 *
 * NOL endpoint baru dibuat. Keempatnya berasal dari dua endpoint yang sudah
 * lama ada:
 *
 *   saldo total       `/api/v1/cash/summary` → totalBalance
 *   keluar bulan ini  `/api/v1/cash/summary` → expensesThisMonth
 *   masuk bulan ini   `/api/v1/finance/cashflow-chart` → Σ masuk
 *   selisih           masuk − keluar, dari sumber yang SAMA
 *
 * ── Kenapa "selisih" dihitung dari cashflow-chart, bukan dari dua angka
 *    yang kebetulan tersedia
 *
 * Godaannya adalah `cashflow.masuk − summary.expensesThisMonth`. Itu salah,
 * dan salahnya tak terlihat: keduanya menghitung "keluar" dengan cakupan
 * BERBEDA. `expensesThisMonth` hanya `project_expenses` yang approved,
 * sementara `cashflow-chart` juga menjumlahkan upah mandor, kasbon,
 * pembayaran progres, dan settlement borongan. Selisih dari dua sumber
 * berbeda akan tampak masuk akal dan selalu terlalu optimis.
 *
 * Karena itu kartu "keluar bulan ini" dan "selisih" memakai angka dari
 * cashflow-chart, sementara `expensesThisMonth` turun jadi keterangan kecil
 * di bawahnya — dua angka yang memang berbeda, disebut berbeda.
 */

import { useMemo } from "react";
import { useTerpasang } from "@/lib/use-terpasang";
import Link from "next/link";
import {
  AlertTriangle, ArrowRightLeft, Banknote, Building2, Clock,
  ShoppingCart, TrendingDown, TrendingUp, Wallet,
} from "lucide-react";
import { useData } from "@/lib/data-cache";
import { C } from "@/lib/warna-ui";
import { KartuRail, BarisRail } from "@/components/shell/rail-kartu";
import { RailIsi } from "@/components/shell/rail-isi";
import { usePasangRail } from "@/lib/rail-context";
import { formatRupiahSingkat } from "@/lib/format";
import { GrafikBatang, KartuKPI, Kosong, Panel, type BatangData } from "@/components/ui-dasar";
import { GrafikModul } from "@/components/shell/grafik-modul";
import {
  type CashSummary, type RingkasKategori, type TitikArusKas,
  TYPE_COLOR, TYPE_LABEL, fmtCompact,
} from "./_bersama/tipe";

export default function KasPage() {
  const mounted = useTerpasang();
  if (!mounted) return null;
  return <KasRingkasan />;
}

/** Awal & akhir bulan berjalan, format ISO — rentang untuk "bulan ini". */
function bulanIni() {
  const kini = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  const iso = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  return {
    dari: iso(new Date(kini.getFullYear(), kini.getMonth(), 1)),
    sampai: iso(kini),
  };
}

function KasRingkasan() {
  /*
    ── PINDAH KE LAPIS CACHE BERSAMA (F4-2), 2026-08-16

    Tiga sumber independen, tiga `useData`. Rentang tanggal (bulan berjalan,
    enam bulan terakhir) dihitung sekali per render sebagai bagian URL —
    stabil dalam satu hari, dan cache 5 menit bawaan sudah cukup pendek untuk
    tak menyimpan tanggal basi lintas hari.
  */
  const { data: ringkas, memuat: memuatRingkas, galat: galatRingkas } =
    useData<CashSummary>("/api/v1/cash/summary");
  // Menampilkan "Rp 0" pada data yang tak terbaca adalah kebohongan yang
  // menenangkan, dan di layar kas itu berbahaya — jadi galat muat dibaca
  // langsung sebagai kegagalan ringkasan, bukan diam-diam menampilkan nol.
  const gagalRingkas = Boolean(galatRingkas);

  // Enam bulan terakhir — bukan bulan berjalan saja.
  //
  // Satu bulan tak punya BENTUK untuk dibaca: grafik satu batang menjawab
  // pertanyaan yang sudah dijawab kartu KPI di atasnya. Enam bulan menjawab
  // pertanyaan yang berbeda ("arahnya ke mana"), dan itulah alasan lapis
  // kedua ada. Angka KPI-nya tetap dihitung dari titik bulan berjalan saja.
  const kini = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  const enamBulanLalu = new Date(kini.getFullYear(), kini.getMonth() - 5, 1);
  const jalurArus = `/api/v1/finance/cashflow-chart?date_from=${enamBulanLalu.getFullYear()}-${pad(enamBulanLalu.getMonth() + 1)}-01&date_to=${bulanIni().sampai}`;
  const { data: dataArus, memuat: memuatArus } = useData<{ chartData: TitikArusKas[] }>(jalurArus);
  // `useMemo`, bukan `?? []` telanjang: turunan ini masuk dependensi
  // `useMemo` lain di bawah (`titikBulanIni`), dan array baru tiap render
  // membuat memo itu tak pernah dianggap sama.
  const arus = useMemo(() => dataArus?.chartData ?? [], [dataArus]);

  const { dari, sampai } = bulanIni();
  const jalurKategori = `/api/v1/cash/expenses/summary-by-category?date_from=${dari}&date_to=${sampai}`;
  const { data: dataKategori, memuat: memuatKategori } = useData<{ summary: RingkasKategori[] }>(jalurKategori);
  const kategori = dataKategori?.summary ?? [];

  // Titik bulan BERJALAN dari deret arus kas. Dicari lewat `period`, bukan
  // diambil sebagai elemen terakhir: bulan tanpa satu pun transaksi tidak
  // muncul di deret sama sekali, jadi "elemen terakhir" bisa berarti bulan
  // lalu tanpa ada tanda apa pun bahwa angkanya sudah basi.
  const titikBulanIni = useMemo(() => {
    const kini = new Date();
    const kunci = `${kini.getFullYear()}-${String(kini.getMonth() + 1).padStart(2, "0")}`;
    // `groupBy` cashflow-chart berubah menurut panjang rentang; untuk enam
    // bulan ia mengelompokkan per bulan, jadi `period` berbentuk "YYYY-MM".
    return arus.find((t) => t.period === kunci) ?? null;
  }, [arus]);

  const masukBulanIni = titikBulanIni?.masuk ?? 0;
  const keluarBulanIni = titikBulanIni?.keluar ?? 0;
  const selisih = masukBulanIni - keluarBulanIni;

  // Deret sparkline: net per bulan, untuk membaca arah tanpa membaca sumbu.
  const sparkNet = arus.map((t) => t.net);
  const sparkMasuk = arus.map((t) => t.masuk);
  const sparkKeluar = arus.map((t) => t.keluar);

  const batangArus: BatangData[] = arus.map((t, i) => ({
    label: t.label,
    nilai: t.keluar,
    sorot: i === arus.length - 1,
  }));

  const batangKategori: BatangData[] = kategori.slice(0, 6).map((k, i) => ({
    label: TYPE_LABEL[k.type] ?? k.type,
    nilai: k.total,
    sorot: i === 0,
  }));

  /*
    RAIL KONTEKSTUAL — catatan lengkapnya di `app/(dashboard)/proyek/page.tsx`.

    Halaman kas hanya punya ANGKA RINGKAS, bukan daftar baris (daftar akun
    pindah ke `/kas/akun`). Jadi kartunya berisi saldo per jenis kas — yang
    justru pertanyaan pertama orang di halaman ini: "uangnya ada di mana?".

    `tanggalTenggat` sengaja kosong: kas tak punya tanggal jatuh tempo, dan
    Pengingat akan berkata "tak ada tenggat" — jujur, bukan angka karangan.
  */
  usePasangRail(
    <RailIsi
      konteks={
        <KartuRail
          judul="Saldo per jenis"
          tautan="/kas/akun"
          labelTautan="Akun"
          kosong={gagalRingkas ? "Saldo tak bisa dibaca saat ini." : "Belum ada akun kas."}
        >
          {ringkas ? [
            { label: "Kas utama", nilai: ringkas.mainBalance },
            { label: "Kas kolektor", nilai: ringkas.collectorBalance },
            { label: "Kas kecil", nilai: ringkas.pettyBalance },
          ].map((b, i) => (
            <BarisRail
              key={b.label}
              pertama={i === 0}
              utama={b.label}
              kanan={formatRupiahSingkat(b.nilai)}
              nadaKanan={b.nilai < 0 ? "bahaya" : "normal"}
            />
          )) : null}
        </KartuRail>
      }
    />,
    [ringkas, gagalRingkas],
  );

  return (
    // Token lebar diulang di tiap halaman bagian — `tata-letak-ratchet.mjs`
    // memeriksa `page.tsx` sendiri-sendiri, tanpa membaca layout induknya.
    <div style={{ width: "100%", maxWidth: "var(--w-page)", margin: "0 auto" }}>
      {/* ── LAPIS 1 — KEADAAN ── */}
      {gagalRingkas ? (
        <div style={{
          padding: "var(--pad-atas) var(--pad-x) var(--pad-bawah)", borderRadius: 10, marginBottom: 18,
          background: C.redBg, border: `1px solid ${C.redBorder}`,
          display: "flex", alignItems: "center", gap: 8,
        }}>
          <AlertTriangle size={16} color={C.red} style={{ flexShrink: 0 }} aria-hidden="true" />
          <span style={{ fontSize: 13, fontWeight: 600, color: C.red }}>
            Ringkasan kas gagal dimuat. Angka sengaja tidak ditampilkan — kas yang
            tampil Rp 0 saat datanya tak terbaca lebih berbahaya daripada kosong.
          </span>
        </div>
      ) : (
        <div className="rise" style={{
          display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(200px,1fr))",
          gap: 12, marginBottom: 20,
        }}>
          {memuatRingkas || memuatArus ? (
            Array.from({ length: 4 }, (_, i) => (
              <div key={i} aria-hidden="true" style={{
                height: 118, borderRadius: 14,
                background: "var(--surface-subtle)", border: `1px solid ${C.border}`,
              }} />
            ))
          ) : (
            <>
              <KartuKPI
                sorot
                label="Saldo Total"
                nilai={fmtCompact(ringkas?.totalBalance ?? 0)}
                ikon={<Wallet size={15} />}
                keterangan={`Utama ${fmtCompact(ringkas?.mainBalance ?? 0)} · Kolektor ${fmtCompact(ringkas?.collectorBalance ?? 0)} · Kecil ${fmtCompact(ringkas?.pettyBalance ?? 0)}`}
              />
              <KartuKPI
                label="Masuk Bulan Ini"
                nilai={fmtCompact(masukBulanIni)}
                ikon={<TrendingUp size={15} />}
                spark={sparkMasuk.length > 1 ? sparkMasuk : undefined}
                keterangan="pembayaran invoice yang diterima"
              />
              <KartuKPI
                label="Keluar Bulan Ini"
                nilai={fmtCompact(keluarBulanIni)}
                naikBagus={false}
                ikon={<TrendingDown size={15} />}
                spark={sparkKeluar.length > 1 ? sparkKeluar : undefined}
                // `expensesThisMonth` DISEBUT TERPISAH, bukan dipakai sebagai
                // nilai kartu: ia hanya pengeluaran proyek yang approved,
                // sementara angka besar di atas juga memuat upah, kasbon,
                // progres, dan settlement borongan.
                keterangan={`termasuk upah & kasbon · pengeluaran proyek ${fmtCompact(ringkas?.expensesThisMonth ?? 0)}`}
              />
              <KartuKPI
                label="Selisih Bulan Ini"
                nilai={fmtCompact(selisih)}
                ikon={<Banknote size={15} />}
                spark={sparkNet.length > 1 ? sparkNet : undefined}
                keterangan={selisih < 0
                  ? "keluar melebihi masuk — kas terkuras bulan ini"
                  : "masuk melebihi keluar"}
              />
            </>
          )}
        </div>
      )}

      {/* Grafik modul — lihat `components/shell/grafik-modul.tsx` */}
      <GrafikModul modul="kas" />

      {/* Yang menunggu keputusan — tautan, bukan tombol pemindah tab. Sekarang
          benar-benar berpindah halaman DENGAN saringan terbawa di URL, jadi
          hasilnya bisa dikirim ke rekan. */}
      {ringkas && (ringkas.pendingTransferAmount > 0 || ringkas.pendingExpenseAmount > 0) && (
        <div className="rise rise-1" style={{ display: "flex", gap: 8, marginBottom: 20, flexWrap: "wrap" }}>
          {ringkas.pendingTransferAmount > 0 && (
            <div style={{
              flex: 1, minWidth: 260, padding: "12px 16px", borderRadius: 10,
              background: C.yellowBg, border: `1px solid ${C.yellowBorder}`,
              display: "flex", alignItems: "center", gap: 8,
            }}>
              <Clock size={16} color={C.yellow} style={{ flexShrink: 0 }} aria-hidden="true" />
              <span style={{ fontSize: 12, color: C.yellow, fontWeight: 600 }}>
                {ringkas.pendingTransferCount} transfer menunggu konfirmasi · {fmtCompact(ringkas.pendingTransferAmount)}
              </span>
              <Link href="/kas/transfer?status=pending" style={{
                marginLeft: "auto", fontSize: 11, color: C.yellow, fontWeight: 600,
                whiteSpace: "nowrap", textDecoration: "none",
              }}>Lihat →</Link>
            </div>
          )}
          {ringkas.pendingExpenseAmount > 0 && (
            <div style={{
              flex: 1, minWidth: 260, padding: "12px 16px", borderRadius: 10,
              background: C.yellowBg, border: `1px solid ${C.yellowBorder}`,
              display: "flex", alignItems: "center", gap: 8,
            }}>
              <AlertTriangle size={16} color={C.yellow} style={{ flexShrink: 0 }} aria-hidden="true" />
              <span style={{ fontSize: 12, color: C.yellow, fontWeight: 600 }}>
                {ringkas.pendingExpenseCount} pengeluaran menunggu persetujuan · {fmtCompact(ringkas.pendingExpenseAmount)}
              </span>
              <Link href="/kas/pengeluaran?status=submitted" style={{
                marginLeft: "auto", fontSize: 11, color: C.yellow, fontWeight: 600,
                whiteSpace: "nowrap", textDecoration: "none",
              }}>Review →</Link>
            </div>
          )}
        </div>
      )}

      {/* ── LAPIS 2 — POLA ── */}
      <div className="rise rise-2" style={{
        display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(320px,1fr))",
        gap: 12, marginBottom: 20,
      }}>
        <Panel judul="Uang Keluar per Bulan" keterangan="enam bulan terakhir · batang tersorot = bulan berjalan">
          {memuatArus ? (
            <div aria-hidden="true" style={{ height: 180, borderRadius: 10, background: "var(--surface-subtle)" }} />
          ) : batangArus.length === 0 ? (
            <Kosong
              ikon={<TrendingDown size={32} aria-hidden="true" />}
              judul="Belum ada arus kas enam bulan terakhir"
              sebab="Grafik ini menjumlahkan pengeluaran proyek, upah mandor, kasbon, pembayaran progres, dan settlement borongan. Selama belum ada satu pun yang tercatat di rentang itu, tak ada bentuk yang bisa digambar."
            />
          ) : (
            <GrafikBatang data={batangArus} format={fmtCompact} />
          )}
        </Panel>

        <Panel judul="Pengeluaran per Kategori" keterangan="bulan berjalan · enam kategori terbesar">
          {memuatKategori ? (
            <div aria-hidden="true" style={{ height: 180, borderRadius: 10, background: "var(--surface-subtle)" }} />
          ) : batangKategori.length === 0 ? (
            <Kosong
              ikon={<ShoppingCart size={32} aria-hidden="true" />}
              judul="Belum ada pengeluaran disetujui bulan ini"
              sebab="Rincian kategori hanya menghitung pengeluaran yang sudah disetujui. Yang masih menunggu review belum masuk ke sini — angkanya baru berubah setelah disetujui."
            />
          ) : (
            <>
              <GrafikBatang data={batangKategori} format={fmtCompact} />
              {/* Daftar di bawah grafik, bukan legenda di sampingnya: nama
                  kategori sering panjang ("Material Struktur Bawah") dan
                  legenda menyamping memotongnya jadi tak terbaca. */}
              <ul style={{ listStyle: "none", margin: "14px 0 0", padding: 0, display: "flex", flexDirection: "column", gap: 6 }}>
                {kategori.slice(0, 6).map((k) => {
                  const warna = TYPE_COLOR[k.type] ?? C.muted;
                  return (
                    <li key={k.id} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12 }}>
                      <span aria-hidden="true" style={{ width: 8, height: 8, borderRadius: 2, background: warna, flexShrink: 0 }} />
                      <span style={{ color: C.text, flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {k.name}
                      </span>
                      <span style={{ color: C.muted, fontSize: 11 }}>{k.count}×</span>
                      <span style={{ color: warna, fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>
                        {fmtCompact(k.total)}
                      </span>
                    </li>
                  );
                })}
              </ul>
            </>
          )}
        </Panel>
      </div>

      {/* ── LAPIS 3 — DETAIL ── */}
      <div className="rise rise-3" style={{
        display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(240px,1fr))", gap: 12,
      }}>
        <PintuBagian
          href="/kas/akun"
          ikon={<Building2 size={18} />}
          judul="Akun Kas"
          sebab="Saldo tiap kas utama, kolektor, dan kas kecil — dikelompokkan per jenis."
        />
        <PintuBagian
          href="/kas/transfer"
          ikon={<ArrowRightLeft size={18} />}
          judul="Transfer Dana"
          sebab="Perpindahan uang antar akun kas, beserta yang masih menunggu konfirmasi."
          jumlah={ringkas?.pendingTransferCount}
        />
        <PintuBagian
          href="/kas/pengeluaran"
          ikon={<ShoppingCart size={18} />}
          judul="Pengeluaran"
          sebab="Belanja proyek, bayar supplier, dan pembayaran mandor yang memotong kas."
          jumlah={ringkas?.pendingExpenseCount}
          mendesak
        />
      </div>
    </div>
  );
}

/**
 * Kartu tautan ke bagian modul.
 *
 * Lapis ketiga di dashboard ini adalah PINTU, bukan tabel — halaman bagiannya
 * sudah memuat daftar penuhnya, dan menyalin sepuluh baris teratas ke sini
 * menciptakan tempat kedua yang harus dijaga sinkron.
 */
function PintuBagian({ href, ikon, judul, sebab, jumlah, mendesak }: {
  href: string; ikon: React.ReactNode; judul: string; sebab: string;
  jumlah?: number; mendesak?: boolean;
}) {
  const menunggu = (jumlah ?? 0) > 0;
  return (
    <Link href={href} style={{
      display: "block", padding: "16px 16px", borderRadius: 14,
      border: `1px solid ${menunggu && mendesak ? C.yellowBorder : C.border}`,
      background: "var(--surface)", textDecoration: "none",
      transition: "transform 150ms ease, box-shadow 150ms ease",
    }}
      onMouseEnter={e => { e.currentTarget.style.transform = "translateY(-2px)"; e.currentTarget.style.boxShadow = "var(--naik-2)"; }}
      onMouseLeave={e => { e.currentTarget.style.transform = "translateY(0)"; e.currentTarget.style.boxShadow = "none"; }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
        <span aria-hidden="true" style={{ color: C.navy, display: "flex" }}>{ikon}</span>
        <span style={{ fontSize: 14, fontWeight: 700, color: C.text, flex: 1 }}>{judul}</span>
        {menunggu && (
          <span style={{
            fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 99,
            fontVariantNumeric: "tabular-nums",
            background: mendesak ? "var(--danger-bg)" : "var(--surface-hover)",
            color: mendesak ? "var(--on-danger-bg)" : C.mid,
            border: `1px solid ${mendesak ? "var(--danger-border)" : C.border}`,
          }}>
            {jumlah} menunggu
          </span>
        )}
      </div>
      <p style={{ margin: 0, fontSize: 12, color: C.mid, lineHeight: 1.5 }}>{sebab}</p>
    </Link>
  );
}
