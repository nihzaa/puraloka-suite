"use client";

// ============================================================================
// Detail Kategori — Portal PM. Task 9. Menampilkan daftar modul (ItemMenu) di
// dalam satu kategori, hanya yang status 'hidup' (§1 spec — modul belum
// hidup dilewati, bukan ditampilkan sebagai coming-soon).
// ============================================================================

import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import {
  ChevronLeft, ChevronRight, Building2, ShieldAlert,
  FileText, ShoppingCart,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { PETA_MENU } from "@/lib/peta-menu";
import EmptyState from "@/components/portal/EmptyState";
import { Folder } from "lucide-react";

/**
 * Peta href web (`/mandor/spk`, dst — key `ItemMenu` di `lib/peta-menu.ts`)
 * ke href portal PM (`/pm-portal/mandor-lengkap/spk`) — DIISI PROGRESIF tiap
 * Task menambah halaman baru. Item yang key-nya TAK ADA di sini masih
 * ditampilkan (status hidup di web), tapi tautannya ke path web asli sebagai
 * fallback sampai versi portalnya dibangun — BUKAN disembunyikan
 * (menyembunyikan modul yang PM tahu ada tapi belum bisa dibuka dari HP
 * lebih membingungkan daripada menautkannya ke web, meski itu bukan
 * pengalaman ideal, sampai tahap yang relevan selesai).
 *
 * Baris di bawah = SEMUA halaman portal PM yang sudah dibangun Task 6-8 dan
 * PUNYA key `ItemMenu` di grup `g-subkon`/`g-lapangan` (dikonfirmasi baca
 * ulang `lib/peta-menu.ts` + daftar direktori `app/pm-portal/`), bukan hanya
 * delapan contoh awal di draf plan sebelum riset Task 5 mengoreksinya:
 *   Task 6 — sk-paket (penugasan), sk-kasbon (kasbon), sk-opname (opname)
 *   Task 7 — sk-wo (spk), sk-tender (tender), sk-retensi (retensi),
 *            sk-backcharge (backcharge)
 *   Task 8 — sk-mandor (tukang)
 *   sk-settlement (mandor/upah settlement) dan tiga modul g-lapangan
 *   (lp-punch/lp-rfi/lp-submittal) dibangun SEBELUM plan Portal PM Lengkap
 *   ini, di sesi lain — tetap dipetakan di sini supaya tak jadi yatim
 *   sesudah grid datar diganti navigasi kategori.
 *   Mitra (Task 8) TIDAK di sini — key PETA_MENU-nya `md-subkon` tinggal di
 *   grup g-master (lihat EKSTRA_PORTAL di bawah untuk alasannya).
 *
 * Tahap 2 (Task 11-16, grup g-kontrak/g-jadwal, key persis dari
 * `lib/peta-menu.ts`, diverifikasi Task 11 riset + baca ulang saat Task 16):
 *   Task 12 — kt-register (register kontrak), kt-asuransi (register asuransi)
 *   Task 13 — kt-claims (klaim kontraktual), kt-eot/kt-ld/kt-bond (EOT, denda
 *             keterlambatan, register jaminan — satu halaman gabungan)
 *   Task 14 — kt-surat (surat masuk/keluar)
 *   Task 15 — jd-delay (analisa keterlambatan, halaman berdiri sendiri) dan
 *             dua tab BARU (histogram sumber daya, method statement) yang
 *             ditempel ke halaman `jadwal` yang SUDAH ADA sejak Tahap 1
 *             (jd-cpm/jd-histogram/jd-method/jd-milestone semua satu halaman,
 *             berbeda tab lewat SegmentedTab internal — bukan query string)
 *   kt-rfi TIDAK dibangun Task 12-15 — dipetakan ke `lp-rfi` yang sudah ada
 *   (Task 8/sebelum plan ini): RFI kontraktual (kt-rfi, ke konsultan) dan RFI
 *   lapangan (lp-rfi) beda modul di admin (lihat catatan kt-rfi di
 *   peta-menu.ts) tapi portal PM baru punya SATU halaman inspeksi/RFI —
 *   ditandai di sini, bukan diam-diam disamakan.
 *   kt-termin/kt-retensi/kt-subkon menunjuk halaman Tahap 1 yang SUDAH ADA
 *   (keuangan, retensi mandor-lengkap, penugasan) — bukan halaman baru
 *   Task 12-15, tapi key-nya baru aktif sekarang karena g-kontrak baru
 *   dinyalakan di KATEGORI_AKTIF.
 *   kt-co: UTANG, bukan selesai — lihat komentar di baris itu di bawah.
 *   jd-baseline SENGAJA TIDAK dipetakan: di peta-menu.ts key ini tak
 *   punya `href` sama sekali (hanya dicapai lewat /proyek/[id]/baseline,
 *   rute dinamis admin) — portal PM belum punya versi Tahap 2 ini, jadi
 *   fallback `it.href` jatuh ke `"#"` sebagaimana adanya sebelum Task 16.
 *
 * Tahap 3 (Task 18-22, grup g-cost/g-master/g-crm, key persis dari
 * `lib/peta-menu.ts`, diverifikasi baca ulang saat Task 22):
 *   Task 18 — cc-rab/crm-boq/crm-skenario/jd-wbs-terkait (RAB) ke
 *             cecep/rab, cc-rap/cc-revisi (RAP) ke cecep/rap
 *   Task 19 — md-resource/crm-estimating (AHSP/Master Resource) ke
 *             cecep/ahsp, md-price-book (Price Book) ke cecep/harga
 *   Task 20 — md-wbs/jd-wbs (Template WBS, dua key kembar yang sama-sama
 *             menunjuk /master/wbs di web) DIALIHKAN ke cecep/wbs, versi
 *             portal read-only Task 18 (PM punya cecep:cbs:view tapi bukan
 *             :manage — tombol "Terapkan" sengaja tak ada di sana),
 *             crm-markup (Markup & Margin) ke cecep/markup
 *   Task 21 — cc-etc/cc-bac/jd-gantt/jd-kurva-s/jd-evm (Kurva-S/EVM) ke
 *             cecep/kurva-s, cc-cashflow (Proyeksi Kas) ke cecep/kas,
 *             cc-varians (Analisa Varians) ke cecep/varians,
 *             cc-contingency (Contingency) ke cecep/contingency
 *   kt-co: UTANG Task 16 SEKARANG DILUNASI — Change Order sungguhan
 *          dibangun Task 21 di kontrak-lengkap/change-order (bukan hub
 *          `proyek/[id]` yang masih ditunda ke Task 26). Diarahkan ke
 *          sana, MENGGANTIKAN fallback `/pm-portal/kontrak` lama.
 *   jd-gantt diarahkan ke cecep/kurva-s sebagai APROKSIMASI, bukan Gantt
 *   visual sungguhan — dicatat UTANG di komentar `PETA_HREF_PORTAL`.
 *   cc-acl/cc-commitment/cc-pagu-material/cc-cvr/cc-profit/cc-wip TIDAK
 *   dipetakan — lihat komentar di baris masing-masing key di bawah untuk
 *   alasannya (tahap lain, atau fallback web tetap memadai).
 *
 * Tahap 4 (Task 25, grup g-inventory "Gudang & Material" BARU diaktifkan
 * `KATEGORI_AKTIF`; key persis dari `lib/peta-menu.ts`, diverifikasi baca
 * ulang saat Task 25):
 *   iv-gudang (Gudang Proyek) DAN md-gudang (grup g-master, "Gudang &
 *   Lokasi") SAMA-SAMA diarahkan ke halaman ikhtisar `gudang` — dua key
 *   PETA_MENU berbeda yang menunjuk satu konsep (ikhtisar lintas-gudang +
 *   tautan "Kelola Lokasi" di dalamnya), sama seperti pola cc-/crm-/md-
 *   yang saling tumpang tindih di Tahap 3. md-gudang TIDAK dipetakan
 *   langsung ke /gudang/lokasi — ikhtisar dulu, lokasi satu tap lagi
 *   (mengikuti struktur halaman Task 25 Step 2 yang punya link "Kelola
 *   Lokasi" sendiri, bukan duplikasi entri menu).
 *   iv-mutasi (Stok Masuk & Keluar) → gudang/stok (kartu stok + catat
 *   pemakaian/retur — lihat catatan cacat gerbang stocks/usage di halaman
 *   itu sendiri).
 *   iv-transfer → gudang/transfer (SUDAH ADA di `lib/peta-menu.ts` sebagai
 *   href langsung `/gudang/transfer` untuk web; portal PM Task 25
 *   membangun versi mobile terpisah di path yang sama polanya).
 *   iv-rekonsiliasi DAN iv-waste sama-sama → gudang/rekonsiliasi (satu
 *   halaman menjawab dua key PETA_MENU — keduanya memang menunjuk
 *   `lib/rekonsiliasi-material.ts` yang sama, dicatat eksplisit di
 *   `peta-menu.ts` sendiri: "susut tinggi" DIHITUNG dari fungsi yang sama
 *   dengan rekonsiliasi, bukan modul terpisah).
 *   iv-opname, iv-minstok, gd-susut SENGAJA TIDAK dipetakan — Task 25
 *   brief mencatat eksplisit: `iv-opname`/`stocks/opname` di luar scope
 *   (Task 26, gerbang cacat sama seperti stocks/usage), `iv-minstok` halaman
 *   terpisah di luar scope, `gd-susut` adalah CRUD data referensi tingkat
 *   perusahaan (peta resource↔material, rencana target %) yang SENGAJA
 *   tidak dibangun versi mobile-nya — jarang berubah, dikelola dari desktop,
 *   bukan kerja harian PM lapangan (lihat kepala `task-25-brief.md`).
 *   Ketiganya jatuh ke fallback `it.href` (web) sebagaimana pola existing.
 */
const PETA_HREF_PORTAL: Record<string, string> = {
  "sk-paket": "/pm-portal/mandor-lengkap/penugasan",
  "sk-wo": "/pm-portal/mandor-lengkap/spk",
  "sk-tender": "/pm-portal/mandor-lengkap/tender",
  "sk-retensi": "/pm-portal/mandor-lengkap/retensi",
  "sk-backcharge": "/pm-portal/mandor-lengkap/backcharge",
  "sk-mandor": "/pm-portal/mandor-lengkap/tukang",
  "sk-kasbon": "/pm-portal/mandor-lengkap/kasbon",
  "sk-opname": "/pm-portal/mandor-lengkap/opname",
  "sk-settlement": "/pm-portal/mandor",
  "lp-punch": "/pm-portal/punch-list",
  "lp-rfi": "/pm-portal/inspeksi-rfi",
  "lp-submittal": "/pm-portal/submittal",
  // Tahap 2 (Task 16) — grup g-kontrak / g-jadwal.
  "kt-register": "/pm-portal/kontrak-lengkap/register",
  "kt-asuransi": "/pm-portal/kontrak-lengkap/asuransi",
  "kt-claims": "/pm-portal/kontrak-lengkap/klaim",
  "kt-eot": "/pm-portal/kontrak-lengkap/eot-ld-bond",
  "kt-ld": "/pm-portal/kontrak-lengkap/eot-ld-bond",
  "kt-bond": "/pm-portal/kontrak-lengkap/eot-ld-bond",
  "kt-rfi": "/pm-portal/inspeksi-rfi",
  "kt-surat": "/pm-portal/kontrak-lengkap/surat",
  "kt-termin": "/pm-portal/keuangan",
  "kt-retensi": "/pm-portal/mandor-lengkap/retensi",
  "kt-subkon": "/pm-portal/mandor-lengkap/penugasan",
  // kt-co: UTANG Task 16 DILUNASI Task 21/22 — Change Order sungguhan kini
  // punya halaman portal sendiri (kontrak-lengkap/change-order), bukan lagi
  // fallback ringkasan kontrak Tahap 1.
  "kt-co": "/pm-portal/kontrak-lengkap/change-order",
  "jd-cpm": "/pm-portal/jadwal",
  "jd-histogram": "/pm-portal/jadwal",
  "jd-method": "/pm-portal/jadwal",
  "jd-milestone": "/pm-portal/jadwal",
  "jd-delay": "/pm-portal/kontrak-lengkap/keterlambatan",
  // Tahap 3 (Task 18-22) — grup g-cost / g-master / g-crm.
  "md-resource": "/pm-portal/cecep/ahsp",
  "md-price-book": "/pm-portal/cecep/harga",
  "md-wbs": "/pm-portal/cecep/wbs",
  "jd-wbs": "/pm-portal/cecep/wbs",
  "crm-estimating": "/pm-portal/cecep/ahsp",
  "crm-boq": "/pm-portal/cecep/rab",
  "crm-skenario": "/pm-portal/cecep/rab",
  "crm-markup": "/pm-portal/cecep/markup",
  "cc-rab": "/pm-portal/cecep/rab",
  "cc-rap": "/pm-portal/cecep/rap",
  "cc-revisi": "/pm-portal/cecep/rap",
  "cc-etc": "/pm-portal/cecep/kurva-s",
  "cc-cashflow": "/pm-portal/cecep/kas",
  "cc-varians": "/pm-portal/cecep/varians",
  "cc-contingency": "/pm-portal/cecep/contingency",
  "cc-bac": "/pm-portal/cecep/kurva-s",
  "jd-gantt": "/pm-portal/cecep/kurva-s",
  "jd-kurva-s": "/pm-portal/cecep/kurva-s",
  "jd-evm": "/pm-portal/cecep/kurva-s",
  // Tahap 4 (Task 25) — grup g-inventory (baru diaktifkan) + md-gudang
  // (g-master, sudah aktif sejak Tahap 3 tapi baru sekarang punya halaman
  // portal PM). Lihat catatan panjang di atas untuk alasan pemetaannya.
  "iv-gudang": "/pm-portal/gudang",
  "md-gudang": "/pm-portal/gudang",
  "iv-mutasi": "/pm-portal/gudang/stok",
  "iv-transfer": "/pm-portal/gudang/transfer",
  "iv-rekonsiliasi": "/pm-portal/gudang/rekonsiliasi",
  "iv-waste": "/pm-portal/gudang/rekonsiliasi",
  // Tahap berikutnya menambah baris di sini, sesuai key ItemMenu.
};

/**
 * Modul portal PM yang SUDAH ADA tapi key `ItemMenu`-nya tinggal di grup
 * PETA_MENU yang BELUM aktif di `kategoriUntukPm()`: Mitra (`md-subkon`,
 * grup g-master), K3 (`hse-inspeksi`, grup g-hse), Dokumen/Procurement
 * (halaman agregat lintas-modul di portal PM, tak dipetakan satu-ke-satu ke
 * satu key PETA_MENU — lihat komentar tiap halamannya di
 * `app/pm-portal/{dokumen,procurement}/page.tsx`). Tanpa baris ini,
 * keempatnya jadi TAK TERJANGKAU dari navigasi kategori — persis cacat yang
 * ingin dihindari Task 9 ("halaman yang sudah ada jangan sampai jadi tak
 * terjangkau setelah struktur navigasi diganti"). Ditempel ke "Operasi
 * Lapangan"/"Mandor & Subkon" karena itulah tempat PM mencarinya
 * sehari-hari di lapangan — sama seperti `lainnya/page.tsx` versi lama yang
 * menaruh semuanya berdampingan di satu grid. TIDAK mengubah
 * `PETA_MENU`/`KATEGORI_AKTIF` — ekstensi lokal ke halaman ini saja, dan
 * TIDAK dimaksudkan permanen: begitu grup g-hse/g-procurement diaktifkan di
 * tahap berikutnya, baris yang relevan pindah dari sini ke
 * PETA_HREF_PORTAL/KATEGORI_AKTIF yang semestinya.
 *
 * `px-jadwal` ("Jadwal & Baseline") dan `px-kontrak` ("Kontrak") DIHAPUS
 * dari sini Task 16 — g-kontrak/g-jadwal kini aktif dan PETA_HREF_PORTAL
 * di atas sudah menunjuk ke halaman yang SAMA (`jd-cpm` dkk. dan `kt-co`
 * keduanya → `/pm-portal/jadwal` dan `/pm-portal/kontrak`), jadi
 * mempertahankan baris ini akan menampilkan dua tautan kembar ke tujuan
 * yang sama pada kategori "Operasi Lapangan".
 */
const EKSTRA_PORTAL: Record<string, { key: string; label: string; href: string; icon: LucideIcon }[]> = {
  "g-subkon": [
    { key: "md-subkon", label: "Mitra", href: "/pm-portal/mandor-lengkap/mitra", icon: Building2 },
  ],
  "g-lapangan": [
    { key: "hse-inspeksi", label: "K3", href: "/pm-portal/k3", icon: ShieldAlert },
    { key: "px-dokumen", label: "Dokumen", href: "/pm-portal/dokumen", icon: FileText },
    { key: "px-procurement", label: "Procurement", href: "/pm-portal/procurement", icon: ShoppingCart },
  ],
};

export default function PmKategoriPage() {
  const { key } = useParams<{ key: string }>();
  const router = useRouter();
  const grup = PETA_MENU.find((g) => g.key === key);

  if (!grup) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <button
          type="button"
          onClick={() => router.back()}
          style={{ display: "flex", alignItems: "center", gap: 6, background: "none", border: "none", cursor: "pointer", fontSize: 13, color: "var(--navy)", fontWeight: 600, padding: 0, alignSelf: "flex-start" }}
        >
          <ChevronLeft size={16} aria-hidden="true" /> Kembali
        </button>
        <EmptyState icon={Folder} judul="Kategori tidak ditemukan" deskripsi="Kategori ini mungkin sudah dipindahkan." />
      </div>
    );
  }

  const itemHidup = grup.items.filter((it) => it.status === "hidup");
  const ekstra = EKSTRA_PORTAL[grup.key] ?? [];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <button
        type="button"
        onClick={() => router.back()}
        style={{ display: "flex", alignItems: "center", gap: 6, background: "none", border: "none", cursor: "pointer", fontSize: 13, color: "var(--navy)", fontWeight: 600, padding: 0, alignSelf: "flex-start" }}
      >
        <ChevronLeft size={16} aria-hidden="true" /> Kembali
      </button>
      <h1 style={{ fontSize: 20, fontWeight: 700, color: "var(--text-primary)", margin: 0 }}>
        {grup.label}
      </h1>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {itemHidup.map((it) => (
          <Link
            key={it.key}
            href={PETA_HREF_PORTAL[it.key] ?? it.href ?? "#"}
            style={{
              display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12,
              padding: 16, borderRadius: 14, background: "var(--surface)",
              border: "1px solid var(--border)", textDecoration: "none",
            }}
          >
            <span style={{ fontSize: 14, fontWeight: 600, color: "var(--text-primary)" }}>{it.label}</span>
            <ChevronRight size={16} color="var(--text-muted)" aria-hidden="true" />
          </Link>
        ))}
        {ekstra.map((it) => {
          const EkstraIkon = it.icon;
          return (
            <Link
              key={it.key}
              href={it.href}
              style={{
                display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12,
                padding: 16, borderRadius: 14, background: "var(--surface)",
                border: "1px solid var(--border)", textDecoration: "none",
              }}
            >
              <span style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 14, fontWeight: 600, color: "var(--text-primary)" }}>
                <EkstraIkon size={16} color="var(--text-muted)" aria-hidden="true" />
                {it.label}
              </span>
              <ChevronRight size={16} color="var(--text-muted)" aria-hidden="true" />
            </Link>
          );
        })}
      </div>
    </div>
  );
}
