"use client";

/**
 * PROCUREMENT — RINGKASAN. Dashboard modul, bukan langsung daftar (UI-2-3).
 *
 * ── Tiga lapis (ARAH-VISUAL-2026 §5b)
 *
 *   LAPIS 1  empat kartu KPI       "apa yang terjadi?"
 *   LAPIS 2  dua panel pola        "yang mana yang bermasalah?"
 *   LAPIS 3  pintu ke sub-halaman  "apa yang harus saya kerjakan?"
 *
 * Seperti `/kas` dan berbeda dari `/proyek`, lapis ketiga di sini adalah
 * PINTU, bukan daftar penuh. Alasannya: modul ini punya sembilan bagian dengan
 * bentuk data yang sama sekali berbeda (supplier, material, MR, PO, GR,
 * tagihan, stok, laporan) — tak ada satu daftar yang bisa menjadi "daftar
 * procurement". Yang dicari orang berbeda-beda, dan menaruh salah satunya di
 * sini berarti memihak satu perjalanan atas delapan lainnya.
 *
 * ── Dari mana KPI-nya (§5c: PO terbuka · menunggu terima · nilai bulan ini ·
 *    vendor aktif) — NOL endpoint baru
 *
 *   PO terbuka        `/procurement/purchase-orders` → status ≠ fully_received/cancelled
 *   menunggu terima   `/procurement/purchase-orders` → status sent/confirmed/partially_received
 *   nilai bulan ini   `/procurement/dashboard`       → po_value_this_month
 *   vendor aktif      `/procurement/suppliers`       → panjang daftar (API sudah menyaring is_active)
 *
 * Hitungan dua yang pertama ada di `lib/ringkasan-procurement.ts` — di sana ia
 * bisa diuji tanpa merender halaman, dan batas tanggalnya (yang paling sunyi
 * kalau salah) sudah punya 32 test.
 *
 * ── Kenapa "nilai bulan ini" DIAMBIL dari endpoint, bukan dihitung ulang
 *
 * Godaannya adalah menjumlahkan `total_amount` dari daftar PO yang sudah
 * terlanjur dimuat. Itu salah, dan salahnya tak terlihat: `/purchase-orders`
 * memberi `.limit(200)` baris TERBARU. Pada perusahaan yang ramai, jumlah
 * versi klien akan selalu lebih kecil dari kenyataan — tanpa satu pun tanda
 * bahwa ia terpotong. Server menghitungnya dari `order_date >= awal bulan`
 * tanpa batas baris, jadi angkanya yang dipakai.
 *
 * ── Kenapa kartunya disebut "LEWAT JANJI KIRIM", bukan "VENDOR TELAT"
 *
 * Preseden langsung dari `/proyek`, yang menamai kartunya "Lewat Tenggat"
 * bukan "Telat" karena EOT tak tersedia di endpoint itu. Di sini bahannya
 * kurang dengan cara yang berbeda: `expected_delivery_date` adalah janji yang
 * dicatat SAAT PO DIBUAT, dan tak ada satu pun kolom yang mencatat apakah
 * tanggal itu kemudian direvisi bersama supplier. Menyebut angkanya "vendor
 * telat" berarti mencetak tuduhan yang tak bisa dibantah vendor mana pun —
 * dan sekali disebut di rapat, ia jadi fakta. Kartunya menyatakan fakta
 * tanggal, dan menyerahkan vonisnya ke orang yang tahu percakapannya.
 *
 * ── KPI §5c yang DIHILANGKAN: tidak ada
 *
 * Keempatnya punya sumber. Yang TIDAK dibuat adalah KPI kelima "vendor telat
 * kirim" berbentuk peringkat per-vendor — menghitungnya butuh tanggal
 * penerimaan NYATA per item, dan `/purchase-orders` hanya mengirim janjinya.
 */

import { useEffect, useMemo, useReducer, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle, Boxes, Building2, ClipboardList, Clock, FileText,
  PackageCheck, Receipt, ShoppingCart, Truck, Wallet,
} from "lucide-react";

import { api, makeAbortController } from "@/lib/api";
import { C } from "@/lib/warna-ui";
import { KartuKPI, Kosong, Panel } from "@/components/ui-dasar";
import { hariIniWIB } from "@/lib/ringkasan-proyek";
import {
  konsentrasiVendor, palingLamaMenunggu, ringkasPo,
  type BarisTunggu, type BarisVendor,
} from "@/lib/ringkasan-procurement";
import { KerangkaKpi, fmt, fmtRingkas } from "./_bersama/ui";
import type { KpiProcurement, PurchaseOrder, Supplier } from "./_bersama/tipe";

export default function ProcurementPage() {
  const [mounted, mount] = useReducer(() => true, false);
  useEffect(mount, [mount]);
  if (!mounted) return null;
  return <ProcurementRingkasan />;
}

function ProcurementRingkasan() {
  const [kpi, setKpi] = useState<KpiProcurement | null>(null);
  const [gagalKpi, setGagalKpi] = useState(false);
  const [pos, setPos] = useState<PurchaseOrder[]>([]);
  const [vendor, setVendor] = useState<Supplier[]>([]);
  const [memuat, setMemuat] = useState(true);

  // Tanggal acuan DIBEKUKAN saat halaman dipasang, bukan dibaca ulang tiap
  // render. Kalau tidak, kartu KPI dan panel di bawahnya bisa memakai tanggal
  // berbeda saat halaman dibuka melewati tengah malam — dan angka yang tak
  // cocok dengan daftarnya sendiri adalah cara tercepat membuat orang
  // berhenti memercayai keduanya.
  const [hariIni] = useState(() => hariIniWIB());

  useEffect(() => {
    const ac = makeAbortController();

    void Promise.all([
      api.get<KpiProcurement>("/api/v1/procurement/dashboard", { signal: ac.signal })
        .then((r) => { setKpi(r.data); setGagalKpi(false); })
        // Menampilkan "Rp 0" pada data yang tak terbaca adalah kebohongan yang
        // menenangkan, dan di layar yang menyatakan komitmen uang itu berbahaya.
        .catch((e) => { if (e?.name !== "CanceledError") setGagalKpi(true); }),
      api.get<{ purchase_orders: PurchaseOrder[] }>("/api/v1/procurement/purchase-orders", { signal: ac.signal })
        .then((r) => setPos(r.data.purchase_orders ?? []))
        .catch(() => setPos([])),
      api.get<{ suppliers: Supplier[] }>("/api/v1/procurement/suppliers", { signal: ac.signal })
        .then((r) => setVendor(r.data.suppliers ?? []))
        .catch(() => setVendor([])),
    ]).finally(() => setMemuat(false));

    return () => ac.abort();
  }, []);

  // ── LAPIS 1 & 2 — dihitung dari respons yang SAMA dengan pintunya ─────────
  const ringkas = useMemo(() => ringkasPo(pos, hariIni), [pos, hariIni]);
  const tertunggak = useMemo(() => palingLamaMenunggu(pos, hariIni), [pos, hariIni]);
  const konsentrasi = useMemo(() => konsentrasiVendor(pos), [pos]);

  return (
    // Token lebar diulang di tiap halaman bagian — `tata-letak-ratchet.mjs`
    // memeriksa `page.tsx` sendiri-sendiri, tanpa membaca layout induknya.
    <div style={{ width: "100%", maxWidth: "var(--w-luas)", margin: "0 auto" }}>
      {/* ── LAPIS 1 — KEADAAN ── */}
      {gagalKpi && (
        <div role="alert" style={{
          padding: "12px 16px", borderRadius: 10, marginBottom: 18,
          background: C.redBg, border: `1px solid ${C.redBorder}`,
          display: "flex", alignItems: "center", gap: 8,
        }}>
          <AlertTriangle size={16} color={C.red} style={{ flexShrink: 0 }} aria-hidden="true" />
          <span style={{ fontSize: 13, fontWeight: 600, color: C.red }}>
            Ringkasan pengadaan gagal dimuat. Nilai PO bulan ini sengaja tidak
            ditampilkan — angka komitmen yang tampil Rp 0 saat datanya tak
            terbaca lebih berbahaya daripada kosong.
          </span>
        </div>
      )}

      <div className="rise" style={{
        display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(200px,1fr))",
        gap: 12, marginBottom: 20,
      }}>
        {memuat ? <KerangkaKpi /> : (
          <>
            <KartuKPI
              sorot
              label="PO Terbuka"
              nilai={String(ringkas.terbuka)}
              nilaiAngka={ringkas.terbuka}
              ikon={<ShoppingCart size={15} />}
              keterangan={`${fmtRingkas(ringkas.nilaiTerbuka)} komitmen belum tuntas · ${ringkas.total} PO tercatat`}
            />
            <KartuKPI
              label="Menunggu Terima"
              nilai={String(ringkas.menungguTerima)}
              nilaiAngka={ringkas.menungguTerima}
              naikBagus={false}
              ikon={<Truck size={15} />}
              keterangan={ringkas.menungguTerima === 0
                ? "tak ada barang yang sedang ditunggu tiba"
                : `${ringkas.lewatJanjiKirim} lewat janji kirim · ${ringkas.segeraTiba} dijanjikan ≤7 hari`}
            />
            <KartuKPI
              label="Nilai PO Bulan Ini"
              // Angka yang tak ada TIDAK ditulis "Rp 0". Nol berarti "sebulan
              // berjalan tanpa satu pun pembelian" — pernyataan yang sangat
              // berbeda dari "angkanya gagal dimuat", dan hanya salah satunya
              // menuntut panggilan telepon.
              nilai={kpi ? fmtRingkas(kpi.po_value_this_month) : "—"}
              ikon={<Wallet size={15} />}
              keterangan={kpi
                ? `${kpi.po_this_month} PO diterbitkan bulan ini`
                : "gagal dimuat — angka sengaja tidak dikarang"}
            />
            <KartuKPI
              label="Vendor Aktif"
              nilai={String(vendor.length)}
              nilaiAngka={vendor.length}
              ikon={<Building2 size={15} />}
              keterangan={konsentrasi.length > 0
                ? `${konsentrasi[0].nama} memegang ${konsentrasi[0].persen.toFixed(0)}% nilai PO terbuka`
                : "supplier berstatus aktif di daftar"}
            />
          </>
        )}
      </div>

      {/* Yang menuntut tindakan HARI INI — spanduk, bukan kartu KPI kelima.
          Kartu KPI menyatakan keadaan; spanduk ini menyatakan bahwa ada yang
          harus dikerjakan, dan karena itu ia menghilang saat tak ada. */}
      {!memuat && (
        <div className="rise rise-1" style={{ display: "flex", gap: 8, marginBottom: 20, flexWrap: "wrap" }}>
          {(kpi?.mr_pending_approval ?? 0) > 0 && (
            <Spanduk
              ikon={<ClipboardList size={16} aria-hidden="true" />}
              teks={`${kpi?.mr_pending_approval} permintaan material menunggu persetujuan — pekerjaan lapangan berhenti sampai diputuskan`}
              href="/procurement/permintaan"
              tautan="Review →"
              nada="kuning"
            />
          )}
          {(kpi?.overdue_invoices ?? 0) > 0 && (
            <Spanduk
              ikon={<Receipt size={16} aria-hidden="true" />}
              teks={`${kpi?.overdue_invoices} tagihan supplier sudah jatuh tempo · ${fmt(kpi?.overdue_amount ?? 0)}`}
              href="/procurement/hutang"
              tautan="Bayar →"
              nada="merah"
            />
          )}
          {(kpi?.low_stock_count ?? 0) > 0 && (
            <Spanduk
              ikon={<Boxes size={16} aria-hidden="true" />}
              teks={`${kpi?.low_stock_count} material di bawah stok minimum — pesan ulang sebelum pekerjaan berhenti`}
              href="/procurement/stok"
              tautan="Lihat stok →"
              nada="kuning"
            />
          )}
        </div>
      )}

      {/* ── LAPIS 2 — POLA ──
          Dua panel, dua pertanyaan yang TAK BISA dibaca dari daftar mana pun
          tanpa kalkulator:

            1. "pesanan mana yang paling lama tak datang?"
               Daftar PO diurutkan menurut tanggal DIBUAT, bukan menurut
               seberapa jauh janji kirimnya sudah terlewati. Untuk
               menjawabnya orang harus mengurangkan dua tanggal per baris.

            2. "berapa banyak uang pengadaan yang bergantung pada satu vendor?"
               Daftar PO mengurutkan per PO, bukan per vendor — jawabannya
               butuh menjumlahkan beberapa baris lalu membaginya dengan total.

          Grafik batang "nilai PO per bulan" sengaja TIDAK dipilih meski
          datanya tersedia: ia menggambar ulang angka yang sudah ada di kartu
          KPI dan di tab Laporan, dan grafik yang mengulang angka lain adalah
          hiasan. */}
      <div className="rise rise-2" style={{
        display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(320px,1fr))",
        gap: 12, marginBottom: 20,
      }}>
        <Panel
          judul="Paling Lama Lewat Janji Kirim"
          keterangan="PO yang barangnya ditunggu dan tanggal janjinya sudah terlewat"
          aksi={
            <Link href="/procurement/pesanan" style={{
              fontSize: 11, fontWeight: 600, color: C.navy,
              textDecoration: "none", whiteSpace: "nowrap",
            }}>Semua pesanan →</Link>
          }
        >
          {memuat ? (
            <div aria-hidden="true" style={{ height: 180, borderRadius: 10, background: "var(--surface-subtle)" }} />
          ) : tertunggak.length === 0 ? (
            <Kosong
              ikon={<PackageCheck size={32} aria-hidden="true" />}
              judul={ringkas.menungguTerima === 0
                ? "Tak ada barang yang sedang ditunggu"
                : "Tak ada PO yang lewat janji kirim"}
              sebab={ringkas.menungguTerima === 0
                ? "Perbandingan ini hanya menghitung PO yang sudah dikirim ke supplier dan barangnya belum masuk penuh. PO draft belum dikirim ke siapa pun, jadi belum ada janji yang bisa terlewat."
                : `Seluruh ${ringkas.menungguTerima} PO yang ditunggu masih dalam tanggal janjinya${ringkas.tanpaTanggalJanji > 0 ? ` — kecuali ${ringkas.tanpaTanggalJanji} yang memang tak punya tanggal janji sama sekali, dan karena itu tak pernah bisa terhitung terlambat` : ""}.`}
            />
          ) : (
            <DaftarTertunggak baris={tertunggak} tanpaTanggal={ringkas.tanpaTanggalJanji} />
          )}
        </Panel>

        <Panel
          judul="Konsentrasi Vendor"
          keterangan="porsi nilai PO terbuka per supplier · enam terbesar"
          aksi={
            <Link href="/procurement/supplier" style={{
              fontSize: 11, fontWeight: 600, color: C.navy,
              textDecoration: "none", whiteSpace: "nowrap",
            }}>Daftar supplier →</Link>
          }
        >
          {memuat ? (
            <div aria-hidden="true" style={{ height: 180, borderRadius: 10, background: "var(--surface-subtle)" }} />
          ) : konsentrasi.length === 0 ? (
            <Kosong
              ikon={<Building2 size={32} aria-hidden="true" />}
              judul="Belum ada PO terbuka untuk dibandingkan"
              sebab="Porsi ini hanya menghitung PO yang belum tuntas — komitmen yang masih berjalan. PO yang barangnya sudah masuk penuh tak lagi menyandera siapa pun, jadi ia tak dihitung sebagai ketergantungan."
            />
          ) : (
            <DaftarKonsentrasi baris={konsentrasi} />
          )}
        </Panel>
      </div>

      {/* ── LAPIS 3 — PINTU ── */}
      <div className="rise rise-3" style={{
        display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(240px,1fr))", gap: 12,
      }}>
        <Pintu
          href="/procurement/permintaan" ikon={<ClipboardList size={18} />}
          judul="Permintaan Material"
          sebab="Permintaan dari lapangan, persetujuannya, dan yang siap dijadikan pesanan."
          jumlah={kpi?.mr_pending_approval} mendesak
        />
        <Pintu
          href="/procurement/pesanan" ikon={<ShoppingCart size={18} />}
          judul="Purchase Order"
          sebab="Pesanan resmi ke supplier — harga dan jumlah yang mengikat, beserta pengirimannya."
        />
        <Pintu
          href="/procurement/penerimaan" ikon={<Truck size={18} />}
          judul="Penerimaan Barang"
          sebab="Barang yang tiba di lokasi, dicocokkan dengan pesanannya sebelum menambah stok."
        />
        <Pintu
          href="/procurement/hutang" ikon={<Receipt size={18} />}
          judul="Hutang Supplier"
          sebab="Tagihan yang belum lunas, jatuh temponya, dan pembayaran yang memotong kas."
          jumlah={kpi?.overdue_invoices} mendesak
        />
        <Pintu
          href="/procurement/stok" ikon={<Boxes size={18} />}
          judul="Stok Proyek"
          sebab="Persediaan per proyek, pemakaian, opname, dan peringatan pesan ulang."
          jumlah={kpi?.low_stock_count} mendesak
        />
        <Pintu
          href="/procurement/supplier" ikon={<Building2 size={18} />}
          judul="Supplier"
          sebab="Daftar pemasok beserta syarat pembayaran dan hutang yang masih berjalan."
        />
        <Pintu
          href="/procurement/material" ikon={<Boxes size={18} />}
          judul="Katalog Material"
          sebab="Nama, satuan, harga referensi, dan batas stok minimum tiap material."
        />
        <Pintu
          href="/procurement/laporan" ikon={<FileText size={18} />}
          judul="Laporan"
          sebab="Rekap pembelian per periode dan umur hutang supplier — bisa diekspor ke Excel."
        />
      </div>
    </div>
  );
}

/**
 * Spanduk peringatan — muncul HANYA saat ada yang harus dikerjakan.
 *
 * Bentuknya sengaja berbeda dari kartu KPI: kartu menyatakan keadaan dan
 * selalu ada, spanduk menyatakan tugas dan menghilang saat selesai. Kalau
 * keduanya tampil sama, "0 menunggu" dan "5 menunggu" terbaca sama cepat —
 * dan yang penting justru perbedaannya.
 */
function Spanduk({ ikon, teks, href, tautan, nada }: {
  ikon: React.ReactNode; teks: string; href: string; tautan: string;
  nada: "kuning" | "merah";
}) {
  const warna = nada === "merah"
    ? { bg: C.redBg, border: C.redBorder, teks: "var(--on-danger-bg)" }
    : { bg: C.yellowBg, border: C.yellowBorder, teks: "var(--on-warning-bg)" };
  return (
    <div style={{
      flex: 1, minWidth: 260, padding: "12px 16px", borderRadius: 10,
      background: warna.bg, border: `1px solid ${warna.border}`,
      display: "flex", alignItems: "center", gap: 8,
    }}>
      <span style={{ color: warna.teks, flexShrink: 0, display: "flex" }}>{ikon}</span>
      <span style={{ fontSize: 12, color: warna.teks, fontWeight: 600 }}>{teks}</span>
      <Link href={href} style={{
        marginLeft: "auto", fontSize: 11, color: warna.teks, fontWeight: 700,
        whiteSpace: "nowrap", textDecoration: "none",
      }}>{tautan}</Link>
    </div>
  );
}

/**
 * Batang menyamping: seberapa jauh tiap PO melewati janji kirimnya.
 *
 * ── Kenapa menyamping, bukan `GrafikBatang` tegak yang sudah ada
 *
 * Sama alasannya dengan grafik selisih di `/proyek`: nomor PO dan nama
 * supplier ("PO-2026-0042 · Toko Bangunan Maju Jaya") panjang, dan pada
 * batang tegak ia terpotong jadi tak terbaca — yang menghapus gunanya grafik
 * yang tugasnya menunjuk pesanan tertentu untuk ditelepon.
 *
 * ── Kenapa jumlah hari disebut angka, bukan cuma digambar
 *
 * Panjang batang menyatakan besaran; angka menyatakan berapa persisnya. Yang
 * pertama untuk memindai, yang kedua untuk ditulis di notulen rapat.
 */
function DaftarTertunggak({ baris, tanpaTanggal }: { baris: BarisTunggu[]; tanpaTanggal: number }) {
  const terlama = Math.max(...baris.map((b) => b.hariLewat), 1);
  return (
    <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 14 }}>
      {baris.map((b, i) => (
        <li key={b.id}>
          <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 5 }}>
            <span style={{
              fontSize: 12, fontWeight: 600, color: C.text, flex: 1, minWidth: 0,
              overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
            }}>{b.po_number} · {b.supplier}</span>
            <span style={{
              fontSize: 11, fontWeight: 700, color: C.red,
              fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap",
            }}>+{b.hariLewat} hari</span>
          </div>

          <div
            role="img"
            aria-label={`${b.po_number} dari ${b.supplier}: lewat janji kirim ${b.hariLewat} hari, nilai ${fmtRingkas(b.nilai)}`}
            style={{ position: "relative", height: 14, background: "var(--surface-hover)", borderRadius: 4, overflow: "hidden" }}
          >
            <div style={{
              position: "absolute", top: 3, bottom: 3, left: 0,
              width: `${(b.hariLewat / terlama) * 100}%`,
              // Hanya baris TERPARAH yang bergradasi — aturan "satu aksen per
              // layar" (`ui-dasar.tsx`). Kalau enam batang bergradasi, tak ada
              // yang menonjol dan daftar urut kehilangan gunanya.
              background: i === 0 ? "var(--grad-aksen)" : "var(--aksen)",
              borderRadius: 3, transition: "width 500ms cubic-bezier(.16,1,.3,1)",
            }} />
          </div>

          <div style={{ marginTop: 4, fontSize: 10, color: C.muted }}>
            nilai {fmtRingkas(b.nilai)}
          </div>
        </li>
      ))}

      <li style={{ fontSize: 10, color: C.muted, lineHeight: 1.5, marginTop: 2 }}>
        <Clock size={10} aria-hidden="true" style={{ verticalAlign: "-1px", marginRight: 4 }} />
        Dihitung dari tanggal janji kirim yang dicatat saat PO dibuat. Kalau
        tanggalnya sudah direvisi bersama supplier, revisi itu tidak tercatat
        di mana pun — jadi angka ini mengurutkan mana yang perlu ditanya, bukan
        memvonis vendor terlambat.
        {tanpaTanggal > 0 && ` ${tanpaTanggal} PO lain yang ditunggu tak punya tanggal janji sama sekali, jadi tak pernah muncul di sini.`}
      </li>
    </ul>
  );
}

/**
 * Porsi nilai PO terbuka per vendor.
 *
 * Batang menyamping dengan persen di ujungnya, bukan donat: yang dicari
 * pembaca adalah "apakah ada SATU yang terlalu besar", dan itu terbaca dari
 * panjang batang teratas dibanding sisanya. Donat memaksa mata membandingkan
 * sudut, yang jauh lebih sulit — terutama saat potongannya berdekatan.
 */
function DaftarKonsentrasi({ baris }: { baris: BarisVendor[] }) {
  const terbesar = Math.max(...baris.map((b) => b.nilai), 1);
  return (
    <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 12 }}>
      {baris.map((b, i) => (
        <li key={b.id}>
          <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 5 }}>
            <span style={{
              fontSize: 12, fontWeight: 600, color: C.text, flex: 1, minWidth: 0,
              overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
            }}>{b.nama}</span>
            <span style={{ fontSize: 10, color: C.muted, whiteSpace: "nowrap" }}>{b.jumlahPo} PO</span>
            <span style={{
              fontSize: 11, fontWeight: 700, color: C.text,
              fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap",
            }}>{b.persen.toFixed(0)}%</span>
          </div>
          <div
            role="img"
            aria-label={`${b.nama}: ${b.jumlahPo} PO terbuka senilai ${fmtRingkas(b.nilai)}, ${b.persen.toFixed(0)} persen dari total`}
            style={{ position: "relative", height: 12, background: "var(--surface-hover)", borderRadius: 4, overflow: "hidden" }}
          >
            <div style={{
              position: "absolute", inset: 0, width: `${(b.nilai / terbesar) * 100}%`,
              background: i === 0 ? "var(--grad-aksen)" : "var(--aksen)",
              borderRadius: 4, transition: "width 500ms cubic-bezier(.16,1,.3,1)",
            }} />
          </div>
          <div style={{ marginTop: 4, fontSize: 10, color: C.muted }}>{fmtRingkas(b.nilai)}</div>
        </li>
      ))}
    </ul>
  );
}

/**
 * Kartu tautan ke bagian modul.
 *
 * Lapis ketiga di dashboard ini adalah PINTU, bukan tabel — halaman bagiannya
 * sudah memuat daftar penuhnya, dan menyalin sepuluh baris teratas ke sini
 * menciptakan tempat kedua yang harus dijaga sinkron.
 */
function Pintu({ href, ikon, judul, sebab, jumlah, mendesak }: {
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
          }}>{jumlah}</span>
        )}
      </div>
      <p style={{ margin: 0, fontSize: 12, color: C.mid, lineHeight: 1.5 }}>{sebab}</p>
    </Link>
  );
}
