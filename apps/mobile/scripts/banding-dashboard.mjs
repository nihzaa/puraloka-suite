#!/usr/bin/env node
/**
 * BANDING DASHBOARD — tiga arah visual berdampingan, diputuskan dari GAMBAR.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * KENAPA ADA
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Founder 2026-09-05: *"desain frontend-nya kaya kurang pro anjirr"*, dan
 * saya setuju — yang dikerjakan selama ini KEBERSIHAN (kontras AAA, token,
 * layar kosong yang menuntun), bukan DESAIN. Nol pelanggaran tak sama
 * dengan berkesan.
 *
 * Arah yang dipilih founder: **terasa mahal & modern**, penonton **calon
 * pembeli SaaS dulu**, tim sendiri kedua.
 *
 * Polanya meniru `apps/web/scripts/banding-aksen.mjs` — yang MEMBUNUH usul
 * indigo pada 2026-08-07. Di atas kertas argumen indigo rapi; begitu
 * dirender, ia tidak menyatu. Keputusan visual diambil dari gambar.
 *
 * ── Kenapa TIDAK menyentuh `dashboard.tsx`
 *
 * Tiga arah × satu berkas = tiga kali bongkar-pasang untuk sesuatu yang
 * belum diputuskan, di berkas yang juga dipakai potret matriks. Halaman ini
 * berdiri sendiri; kode aplikasi tak berubah satu baris.
 *
 * ── Data NYATA, bukan lorem
 *
 * Angkanya diambil dari API produksi 2026-09-05 (lihat `DATA` di bawah).
 * Ini penting: `net_cash_estimate` NEGATIF dan `milestone_late` 13, dan
 * justru dua angka itu yang memperlihatkan bedanya hierarki. Data karangan
 * yang serba positif akan membuat ketiga kandidat terlihat sama bagusnya.
 *
 * ── Yang DIUKUR riset, bukan selera (semua bersumber)
 *
 *   Bayangan bernada navy, bukan hitam. Hitam murni mencuci latar jadi
 *   kelabu; yang benar hue latar dengan saturation turun.   (Comeau)
 *
 *   Tonal elevation > drop shadow untuk kartu daftar. M3 memilih pergeseran
 *   WARNA PERMUKAAN sebagai default; bayangan hanya untuk yang mengambang.
 *   Di RN Android ini bukan cuma selera — tiap lapis bayangan satu alpha
 *   blending, dan overdraw di daftar 60 baris mahal.        (M3, Android)
 *
 *   Encoding kuantitatif: PANJANG paling akurat, sudut paling buruk. Pie,
 *   donut, dan radial gauge ditolak eksplisit. Warna hanya untuk KATEGORI,
 *   tak pernah untuk kuantitas.                             (NN/g)
 *
 *   Sparkline = "dataword", grafik seukuran kata yang duduk di samping
 *   angkanya — bukan chart terpisah.                        (Tufte)
 *
 *   Concentricity: radius dalam = radius luar − padding. Gratis, nol biaya
 *   GPU, langsung terasa dirancang.                         (Apple HIG)
 *
 *   ⚠ Light mode BUKAN kompromi. Bukti akademik: positive-polarity
 *   advantage — makin kecil fontnya, makin unggul light mode untuk
 *   ketajaman visual. Jadi "premium = gelap" adalah asumsi yang DITOLAK
 *   bukti, bukan selera yang saya menangkan.                (NN/g)
 *
 * ── Yang riset TOLAK, dan karena itu tak dipakai di sini
 *
 *   "progressive disclosure −55% cognitive load"  tak ada di artikel NN/g
 *   "dashboard goal-based +70% usability"         tak ditemukan
 *   "ISO 9241-411: 12/15/19mm sarung tangan"      standar itu metode
 *                                                 Fitts' Law, bukan tabel
 *                                                 ukuran tombol
 *
 *   Angka-angka itu beredar luas dan terdengar meyakinkan. Tak satu pun
 *   dipakai untuk membenarkan keputusan di halaman ini.
 *
 * Jalankan (dari akar repo) — TAK butuh server, TAK butuh login:
 *   node apps/mobile/scripts/banding-dashboard.mjs
 *
 * Hasil: apps/mobile/.layar/banding/<kandidat>.png
 */
import { chromium } from '@playwright/test'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const AKAR = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const KELUAR = join(AKAR, '.layar', 'banding')

/*
  Data PRODUKSI, diambil 2026-09-05 lewat
  GET /api/v1/dashboard?period=last_30_days

  Dipaku di sini dengan sengaja: halaman banding harus memberi gambar yang
  SAMA tiap kali dijalankan, supaya dua kandidat bisa dibandingkan tanpa
  datanya ikut bergeser. Angka yang bergerak membuat perbandingan visual
  tak sah.
*/
const DATA = {
  proyekAktif: 15,
  totalKontrak: 7135525000,
  invoiceBelum: 32400,
  masukBulanIni: 1620000,
  kasBersih: -35580000,
  kasbonAktif: 37200000,
  peringatan: { kasbonMenunggu: 9, invoiceTelat: 0, milestoneTelat: 13 },
  /* cashflow_8w — 4 titik nyata; income/expense per pekan */
  arusKas: [
    { label: '09/08', masuk: 0, keluar: 0 },
    { label: '16/08', masuk: 0, keluar: 37200000 },
    { label: '23/08', masuk: 0, keluar: 0 },
    { label: '30/08', masuk: 1620000, keluar: 0 },
  ],
  sebaranStatus: [
    { status: 'aktif', jumlah: 15 },
    { status: 'draf', jumlah: 2 },
    { status: 'tahan', jumlah: 2 },
  ],
  proyek: [
    { nama: 'Ruko Pak Eko — Pasteur', persen: 30, status: 'tahan' },
    { nama: 'Renovasi Fasad Kantor CV Makmur — Cihampelas', persen: 0, status: 'aktif' },
    { nama: 'Pembangunan Ruko 2 Lantai Pak Joko — Buah Batu', persen: 0, status: 'aktif' },
    { nama: 'Renovasi Gudang Bu Sinta — Antapani', persen: 0, status: 'aktif' },
  ],
}

const rp = (n) => {
  const abs = Math.abs(n)
  const tanda = n < 0 ? '−' : ''
  if (abs >= 1e9) return `${tanda}Rp ${(abs / 1e9).toFixed(2)} M`
  if (abs >= 1e6) return `${tanda}Rp ${(abs / 1e6).toFixed(1)} jt`
  if (abs >= 1e3) return `${tanda}Rp ${(abs / 1e3).toFixed(0)} rb`
  return `${tanda}Rp ${abs}`
}

/* Sparkline: PANJANG & POSISI, bukan sudut. Digambar sebagai path SVG. */
function sparkline(nilai, lebar = 92, tinggi = 26, warna = '#003366') {
  const maks = Math.max(...nilai, 1)
  const dx = nilai.length > 1 ? lebar / (nilai.length - 1) : lebar
  const titik = nilai.map((v, i) => [i * dx, tinggi - (v / maks) * (tinggi - 3) - 1.5])
  const garis = titik.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)}`).join(' ')
  const area = `${garis} L${lebar},${tinggi} L0,${tinggi} Z`
  const [ax, ay] = titik[titik.length - 1]
  return `<svg width="${lebar}" height="${tinggi}" viewBox="0 0 ${lebar} ${tinggi}" aria-hidden="true">
    <path d="${area}" fill="${warna}" opacity="0.10"/>
    <path d="${garis}" fill="none" stroke="${warna}" stroke-width="1.6"
          stroke-linecap="round" stroke-linejoin="round"/>
    <circle cx="${ax.toFixed(1)}" cy="${ay.toFixed(1)}" r="2.6" fill="${warna}"/>
  </svg>`
}

const NAVY = '#003366'

/*
  ── Bayangan bernada navy ────────────────────────────────────────────────

  navy #003366 ≈ hsl(210 100% 20%). Bayangannya karena itu hsl(210 40% 25%),
  bukan hitam. Offset-Y = 2× offset-X (satu sumber cahaya), dan saat naik:
  offset↑ blur↑ tetapi OPACITY TURUN — yang murah menaikkan opacity.
*/
const BAYANG = {
  kartu: '0 1px 2px hsl(210 40% 25% / 0.07), 0 2px 6px hsl(210 40% 25% / 0.05)',
  angkat: '0 2px 4px hsl(210 40% 25% / 0.06), 0 6px 16px hsl(210 40% 25% / 0.045)',
  ambang: '0 4px 8px hsl(210 40% 25% / 0.05), 0 12px 32px hsl(210 40% 25% / 0.04)',
}

const DASAR = `
  *, *::before, *::after { box-sizing: border-box; }
  body { margin: 0; background: #EEF1F5; font-family: 'Plus Jakarta Sans', system-ui, sans-serif; }
  .bingkai { width: 390px; background: #F9FAFB; padding: 0 0 28px; }
  .judulKandidat {
    font: 700 13px/1.3 'Bricolage Grotesque', system-ui, sans-serif;
    letter-spacing: .06em; text-transform: uppercase;
    color: #fff; background: ${NAVY}; padding: 10px 16px;
  }
  .judulKandidat span { display:block; font-weight:400; text-transform:none;
    letter-spacing:0; font-size:11px; opacity:.8; margin-top:2px; }
  .num { font-variant-numeric: tabular-nums; }
`

/* ═══════════════════════════════════════════════════════════════════════
   KANDIDAT A — "Tenang berlapis"
   Hierarki lewat UKURAN dan RUANG, bukan warna. Satu angka memimpin,
   sisanya mengecil. Kartu tonal (border + surfaceRaised), bayangan hanya
   pada kartu utama. Paling dekat dengan Linear/Stripe.
   ═══════════════════════════════════════════════════════════════════════ */
function kandidatA() {
  const p = DATA
  return `
  <style>
    .A { padding: 0 16px; }
    .A .sapa { padding: 20px 0 4px; }
    .A .halo { font: 700 22px/1.2 'Bricolage Grotesque', sans-serif; color: #111827; letter-spacing:-.02em; }
    .A .peran { font-size: 11px; color: #6B7280; letter-spacing:.08em; margin-top:3px; }

    .A .utama {
      margin-top: 16px; background:#fff; border:1px solid #E5E7EB;
      border-radius: 18px; padding: 18px; box-shadow: ${BAYANG.angkat};
    }
    .A .utamaLabel { font-size:12px; color:#505660; font-weight:600; }
    .A .utamaNilai {
      font: 700 34px/1.05 'Bricolage Grotesque', sans-serif;
      letter-spacing:-.03em; color:#111827; margin-top:6px;
    }
    .A .utamaKaki { display:flex; align-items:flex-end; justify-content:space-between; margin-top:12px; }
    .A .delta { font-size:12px; color:#10612E; font-weight:600; }

    .A .kisi { display:grid; grid-template-columns:1fr 1fr; gap:10px; margin-top:10px; }
    .A .sel {
      background:#fff; border:1px solid #E5E7EB; border-radius:14px; padding:13px 14px;
    }
    .A .selLabel { font-size:11px; color:#505660; font-weight:600; }
    .A .selNilai { font:700 19px/1.15 'Bricolage Grotesque',sans-serif; color:#111827; margin-top:5px; letter-spacing:-.02em; }
    .A .selNilai.negatif { color:#A31919; }

    .A .bagian { font:700 12px/1 'Bricolage Grotesque',sans-serif; color:#505660;
      letter-spacing:.07em; text-transform:uppercase; margin:22px 0 10px; }

    .A .baris {
      background:#fff; border:1px solid #E5E7EB; border-radius:14px;
      padding:13px 14px; margin-bottom:8px;
    }
    .A .barisAtas { display:flex; justify-content:space-between; align-items:baseline; gap:10px; }
    .A .namaProyek { font-size:13px; font-weight:600; color:#111827; line-height:1.3; }
    .A .persen { font-size:13px; font-weight:700; color:#111827; }
    .A .rel { height:5px; background:#EEF0F3; border-radius:3px; margin-top:9px; overflow:hidden; }
    .A .isi { height:100%; background:${NAVY}; border-radius:3px; }
    .A .metaBaris { display:flex; gap:6px; margin-top:8px; }
    .A .pil { font-size:10px; font-weight:600; padding:2px 8px; border-radius:999px; }
    .A .pil.aktif { background:#E8F0FB; color:#1A47C4; }
    .A .pil.tahan { background:#FDF0E3; color:#8D4107; }
  </style>
  <div class="A">
    <div class="sapa">
      <div class="halo">Halo, Nizar</div>
      <div class="peran">ADMIN · 30 HARI TERAKHIR</div>
    </div>

    <div class="utama">
      <div class="utamaLabel">Total Nilai Kontrak</div>
      <div class="utamaNilai num">${rp(p.totalKontrak)}</div>
      <div class="utamaKaki">
        <div class="delta">${p.proyekAktif} proyek berjalan</div>
        ${sparkline([2, 3, 5, 4, 6, 7, 7, 8], 92, 26, NAVY)}
      </div>
    </div>

    <div class="kisi">
      <div class="sel"><div class="selLabel">Kas Bersih</div>
        <div class="selNilai negatif num">${rp(p.kasBersih)}</div></div>
      <div class="sel"><div class="selLabel">Kasbon Aktif</div>
        <div class="selNilai num">${rp(p.kasbonAktif)}</div></div>
      <div class="sel"><div class="selLabel">Masuk Bulan Ini</div>
        <div class="selNilai num">${rp(p.masukBulanIni)}</div></div>
      <div class="sel"><div class="selLabel">Invoice Belum Lunas</div>
        <div class="selNilai num">${rp(p.invoiceBelum)}</div></div>
    </div>

    <div class="bagian">Proyek Berjalan</div>
    ${p.proyek
      .map(
        (x) => `
      <div class="baris">
        <div class="barisAtas">
          <div class="namaProyek">${x.nama}</div>
          <div class="persen num">${x.persen}%</div>
        </div>
        <div class="rel"><div class="isi" style="width:${x.persen}%"></div></div>
        <div class="metaBaris"><span class="pil ${x.status === 'tahan' ? 'tahan' : 'aktif'}">${
          x.status === 'tahan' ? 'Ditahan' : 'Aktif'
        }</span></div>
      </div>`,
      )
      .join('')}
  </div>`
}

/* ═══════════════════════════════════════════════════════════════════════
   KANDIDAT B — "Panel navy"
   Bagian atas jadi bidang navy penuh: identitas merek langsung terlihat,
   angka utama putih di atasnya. Meneruskan panel login yang baru dibangun,
   jadi aplikasi terasa satu keluarga. Kartu di bawahnya duduk MENUMPANG
   tepi panel — kedalaman tanpa bayangan berat.
   ═══════════════════════════════════════════════════════════════════════ */
function kandidatB() {
  const p = DATA
  return `
  <style>
    /*
      overflow:hidden DIPINDAH dari panel ke pembungkus teksturnya.

      Di panel, ia memotong kartu yang sengaja menumpang tepinya. Yang
      sebenarnya perlu dikliping cuma lambang pilar yang menjorok keluar —
      jadi kliping itu dipasang tepat pada yang membutuhkannya.
    */
    .B .panel {
      background:${NAVY}; padding:22px 18px 54px; position:relative;
      border-bottom-left-radius:26px; border-bottom-right-radius:26px;
    }
    .B .teksturKotak {
      position:absolute; inset:0; overflow:hidden;
      border-bottom-left-radius:26px; border-bottom-right-radius:26px;
      pointer-events:none;
    }
    .B .tekstur { position:absolute; right:-30px; top:-18px; opacity:.07; }
    .B .halo { font:700 20px/1.2 'Bricolage Grotesque',sans-serif; color:#fff; letter-spacing:-.02em; }
    .B .peran { font-size:11px; color:#fff; opacity:.72; letter-spacing:.08em; margin-top:3px; }
    .B .angkaBesar {
      font:700 36px/1.05 'Bricolage Grotesque',sans-serif; color:#fff;
      letter-spacing:-.035em; margin-top:20px;
    }
    .B .angkaLabel { font-size:12px; color:#fff; opacity:.8; margin-top:5px; }

    /*
      ⚠ position:relative + z-index WAJIB di sini, dan sebabnya terlihat
      di render pertama: panel navy punya overflow:hidden (untuk teksturnya),
      jadi kartu yang menumpang tepinya TERPOTONG separuh — "−Rp 35.6 jt"
      terbaca setengah huruf.

      Margin negatif saja tak cukup: tanpa konteks penumpukan sendiri, kartu
      tetap digambar sebagai anak yang terkena kliping saudaranya.
    */
    .B .tumpang { margin:-38px 16px 0; display:grid; grid-template-columns:1fr 1fr; gap:10px;
      position:relative; z-index:1; }
    .B .sel { background:#fff; border-radius:15px; padding:13px 14px; box-shadow:${BAYANG.ambang}; }
    .B .selLabel { font-size:11px; color:#505660; font-weight:600; }
    .B .selNilai { font:700 18px/1.15 'Bricolage Grotesque',sans-serif; color:#111827; margin-top:5px; letter-spacing:-.02em; }
    .B .selNilai.negatif { color:#A31919; }

    .B .isiBawah { padding:0 16px; }
    .B .bagian { font:700 12px/1 'Bricolage Grotesque',sans-serif; color:#505660;
      letter-spacing:.07em; text-transform:uppercase; margin:22px 0 10px; }
    .B .baris { background:#fff; border:1px solid #E5E7EB; border-radius:14px; padding:13px 14px; margin-bottom:8px; }
    .B .barisAtas { display:flex; justify-content:space-between; align-items:baseline; gap:10px; }
    .B .namaProyek { font-size:13px; font-weight:600; color:#111827; line-height:1.3; }
    .B .persen { font-size:13px; font-weight:700; color:#111827; }
    .B .rel { height:5px; background:#EEF0F3; border-radius:3px; margin-top:9px; overflow:hidden; }
    .B .isi { height:100%; background:${NAVY}; border-radius:3px; }
    .B .pil { font-size:10px; font-weight:600; padding:2px 8px; border-radius:999px; display:inline-block; margin-top:8px; }
    .B .pil.aktif { background:#E8F0FB; color:#1A47C4; }
    .B .pil.tahan { background:#FDF0E3; color:#8D4107; }
  </style>
  <div class="B">
    <div class="panel">
      <div class="teksturKotak">
        <svg class="tekstur" width="150" height="150" viewBox="0 0 100 100" aria-hidden="true">
          <g fill="#fff">
            <rect x="14" y="30" width="12" height="58" rx="3"/>
            <rect x="32" y="18" width="12" height="70" rx="3"/>
            <rect x="50" y="26" width="12" height="62" rx="3"/>
            <rect x="68" y="10" width="12" height="78" rx="3"/>
          </g>
        </svg>
      </div>
      <div class="halo">Halo, Nizar</div>
      <div class="peran">ADMIN · 30 HARI TERAKHIR</div>
      <div class="angkaBesar num">${rp(p.totalKontrak)}</div>
      <div class="angkaLabel">Total nilai kontrak · ${p.proyekAktif} proyek berjalan</div>
    </div>

    <div class="tumpang">
      <div class="sel"><div class="selLabel">Kas Bersih</div>
        <div class="selNilai negatif num">${rp(p.kasBersih)}</div></div>
      <div class="sel"><div class="selLabel">Kasbon Aktif</div>
        <div class="selNilai num">${rp(p.kasbonAktif)}</div></div>
      <div class="sel"><div class="selLabel">Masuk Bulan Ini</div>
        <div class="selNilai num">${rp(p.masukBulanIni)}</div></div>
      <div class="sel"><div class="selLabel">Invoice Belum Lunas</div>
        <div class="selNilai num">${rp(p.invoiceBelum)}</div></div>
    </div>

    <div class="isiBawah">
      <div class="bagian">Proyek Berjalan</div>
      ${p.proyek
        .map(
          (x) => `
        <div class="baris">
          <div class="barisAtas">
            <div class="namaProyek">${x.nama}</div>
            <div class="persen num">${x.persen}%</div>
          </div>
          <div class="rel"><div class="isi" style="width:${x.persen}%"></div></div>
          <span class="pil ${x.status === 'tahan' ? 'tahan' : 'aktif'}">${
            x.status === 'tahan' ? 'Ditahan' : 'Aktif'
          }</span>
        </div>`,
        )
        .join('')}
    </div>
  </div>`
}

/* ═══════════════════════════════════════════════════════════════════════
   KANDIDAT C — "Perlu perhatian dulu"
   Mendahulukan yang HARUS DIKERJAKAN: 13 milestone terlambat, 9 kasbon
   menunggu. Angka besar tetap ada, tapi di bawah. Ini kandidat yang paling
   menjawab temuan bahwa dashboard sekarang MENYEMBUNYIKAN 13 tenggat lewat
   — bukan cuma kurang cantik.
   ═══════════════════════════════════════════════════════════════════════ */
function kandidatC() {
  const p = DATA
  const total = p.sebaranStatus.reduce((a, b) => a + b.jumlah, 0)
  return `
  <style>
    .C { padding:0 16px; }
    .C .sapa { padding:20px 0 2px; display:flex; justify-content:space-between; align-items:flex-start; }
    .C .halo { font:700 21px/1.2 'Bricolage Grotesque',sans-serif; color:#111827; letter-spacing:-.02em; }
    .C .peran { font-size:11px; color:#6B7280; letter-spacing:.08em; margin-top:3px; }

    .C .perhatian {
      margin-top:16px; background:#fff; border:1px solid #E5E7EB;
      border-left:3px solid #A31919; border-radius:14px; padding:14px 15px;
      box-shadow:${BAYANG.kartu};
    }
    .C .perhatianJudul { font:700 12px/1 'Bricolage Grotesque',sans-serif;
      letter-spacing:.06em; text-transform:uppercase; color:#A31919; }
    .C .perhatianBaris { display:flex; align-items:center; gap:10px; margin-top:11px; }
    .C .perhatianAngka { font:700 26px/1 'Bricolage Grotesque',sans-serif; color:#111827;
      letter-spacing:-.02em; min-width:34px; }
    .C .perhatianTeks { font-size:12.5px; color:#374151; line-height:1.35; }

    .C .kisi3 { display:grid; grid-template-columns:1fr 1fr; gap:10px; margin-top:12px; }
    .C .sel { background:#fff; border:1px solid #E5E7EB; border-radius:14px; padding:13px 14px; }
    .C .sel.lebar { grid-column:1 / -1; }
    .C .selLabel { font-size:11px; color:#505660; font-weight:600; }
    .C .selNilai { font:700 19px/1.15 'Bricolage Grotesque',sans-serif; color:#111827; margin-top:5px; letter-spacing:-.02em; }
    .C .selNilai.besar { font-size:27px; }
    .C .selNilai.negatif { color:#A31919; }
    .C .selKaki { display:flex; justify-content:space-between; align-items:flex-end; }

    .C .pita { display:flex; height:7px; border-radius:4px; overflow:hidden; margin-top:10px; gap:2px; }
    .C .pita i { display:block; height:100%; border-radius:2px; }
    .C .ket { display:flex; gap:12px; margin-top:8px; flex-wrap:wrap; }
    .C .ket span { font-size:10.5px; color:#505660; display:flex; align-items:center; gap:4px; }
    .C .ket b { width:7px; height:7px; border-radius:2px; display:inline-block; }

    .C .bagian { font:700 12px/1 'Bricolage Grotesque',sans-serif; color:#505660;
      letter-spacing:.07em; text-transform:uppercase; margin:22px 0 10px; }
    .C .baris { background:#fff; border:1px solid #E5E7EB; border-radius:14px; padding:13px 14px; margin-bottom:8px; }
    .C .barisAtas { display:flex; justify-content:space-between; align-items:baseline; gap:10px; }
    .C .namaProyek { font-size:13px; font-weight:600; color:#111827; line-height:1.3; }
    .C .persen { font-size:13px; font-weight:700; color:#111827; }
    .C .rel { height:5px; background:#EEF0F3; border-radius:3px; margin-top:9px; overflow:hidden; }
    .C .isi { height:100%; background:${NAVY}; border-radius:3px; }
  </style>
  <div class="C">
    <div class="sapa">
      <div>
        <div class="halo">Halo, Nizar</div>
        <div class="peran">ADMIN · 30 HARI TERAKHIR</div>
      </div>
    </div>

    <div class="perhatian">
      <div class="perhatianJudul">Perlu perhatian</div>
      <div class="perhatianBaris">
        <div class="perhatianAngka num">${p.peringatan.milestoneTelat}</div>
        <div class="perhatianTeks">tenggat milestone sudah lewat</div>
      </div>
      <div class="perhatianBaris">
        <div class="perhatianAngka num">${p.peringatan.kasbonMenunggu}</div>
        <div class="perhatianTeks">kasbon menunggu persetujuan Anda</div>
      </div>
    </div>

    <div class="kisi3">
      <div class="sel lebar">
        <div class="selKaki">
          <div>
            <div class="selLabel">Total Nilai Kontrak</div>
            <div class="selNilai besar num">${rp(p.totalKontrak)}</div>
          </div>
          ${sparkline([2, 3, 5, 4, 6, 7, 7, 8], 92, 30, NAVY)}
        </div>
        <div class="pita">
          ${p.sebaranStatus
            .map(
              (s, i) =>
                `<i style="width:${(s.jumlah / total) * 100}%;background:${
                  ['#003366', '#8FA9C4', '#C9A227'][i]
                }"></i>`,
            )
            .join('')}
        </div>
        <div class="ket">
          ${p.sebaranStatus
            .map(
              (s, i) =>
                `<span><b style="background:${['#003366', '#8FA9C4', '#C9A227'][i]}"></b>${
                  s.jumlah
                } ${s.status}</span>`,
            )
            .join('')}
        </div>
      </div>
      <div class="sel"><div class="selLabel">Kas Bersih</div>
        <div class="selNilai negatif num">${rp(p.kasBersih)}</div></div>
      <div class="sel"><div class="selLabel">Kasbon Aktif</div>
        <div class="selNilai num">${rp(p.kasbonAktif)}</div></div>
    </div>

    <div class="bagian">Proyek Berjalan</div>
    ${p.proyek
      .slice(0, 3)
      .map(
        (x) => `
      <div class="baris">
        <div class="barisAtas">
          <div class="namaProyek">${x.nama}</div>
          <div class="persen num">${x.persen}%</div>
        </div>
        <div class="rel"><div class="isi" style="width:${x.persen}%"></div></div>
      </div>`,
      )
      .join('')}
  </div>`
}

/* ── SEKARANG: layar yang benar-benar berjalan hari ini, untuk pembanding ── */
function kandidatSekarang() {
  const p = DATA
  return `
  <style>
    .S { padding:0 16px; }
    .S .top { padding-top:24px; display:flex; justify-content:space-between; align-items:center; }
    .S .halo { font:600 20px/1.2 'Plus Jakarta Sans',sans-serif; color:#111827; }
    .S .peran { font-size:11px; color:#6B7280; margin-top:2px; letter-spacing:.05em; }
    .S .keluar { font-size:13px; color:#A31919; }
    .S .bagian { font:600 15px/1 'Plus Jakarta Sans',sans-serif; color:#111827; margin:18px 0 10px; }
    .S .kisi { display:grid; grid-template-columns:1fr 1fr; gap:12px; }
    .S .kartu { background:#fff; border:1px solid #E5E7EB; border-radius:12px; padding:14px; }
    .S .lab { font-size:12px; color:#505660; }
    .S .val { font:600 24px/1.2 'Plus Jakarta Sans',sans-serif; color:#111827; margin-top:6px; }
    .S .valSm { font:600 15px/1.2 'Plus Jakarta Sans',sans-serif; color:#111827; margin-top:6px; }
    .S .proj { background:#fff; border:1px solid #E5E7EB; border-radius:12px; padding:14px; margin-bottom:10px; }
    .S .pnama { font-size:13px; color:#111827; }
    .S .rel { height:6px; background:#EEF0F3; border-radius:3px; margin-top:10px; overflow:hidden; }
    .S .isi { height:100%; background:#003366; }
    .S .plab { font-size:12px; color:#505660; margin-top:6px; }
  </style>
  <div class="S">
    <div class="top">
      <div><div class="halo">Halo, Nizar</div><div class="peran">ADMIN</div></div>
      <div class="keluar">Keluar</div>
    </div>
    <div class="bagian">Ringkasan 30 Hari</div>
    <div class="kisi">
      <div class="kartu"><div class="lab">Proyek Aktif</div><div class="val num">${p.proyekAktif}</div></div>
      <div class="kartu"><div class="lab">Total Kontrak</div><div class="valSm num">${rp(p.totalKontrak)}</div></div>
      <div class="kartu"><div class="lab">Invoice Belum Lunas</div><div class="valSm num">${rp(p.invoiceBelum)}</div></div>
      <div class="kartu"><div class="lab">Kas Bersih</div><div class="valSm num">${rp(p.kasBersih)}</div></div>
    </div>
    <div class="bagian">Proyek Aktif</div>
    ${p.proyek
      .map(
        (x) => `
      <div class="proj">
        <div class="pnama">${x.nama}</div>
        <div class="rel"><div class="isi" style="width:${x.persen}%"></div></div>
        <div class="plab num">${x.persen}%</div>
      </div>`,
      )
      .join('')}
  </div>`
}

const KANDIDAT = [
  { kunci: '0-sekarang', judul: 'SEKARANG', sub: 'yang berjalan hari ini', html: kandidatSekarang },
  { kunci: 'A-tenang', judul: 'A · Tenang Berlapis', sub: 'hierarki lewat ukuran & ruang', html: kandidatA },
  { kunci: 'B-panel', judul: 'B · Panel Navy', sub: 'merek di depan, kartu menumpang tepi', html: kandidatB },
  { kunci: 'C-perhatian', judul: 'C · Perlu Perhatian Dulu', sub: '13 tenggat lewat naik ke atas', html: kandidatC },
]

const halaman = (k) => `
<!doctype html><html lang="id"><head><meta charset="utf-8">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,400;12..96,700&family=Plus+Jakarta+Sans:wght@400;600;700&display=swap" rel="stylesheet">
<style>${DASAR}</style></head>
<body><div class="bingkai">
  <div class="judulKandidat">${k.judul}<span>${k.sub}</span></div>
  ${k.html()}
</div></body></html>`

mkdirSync(KELUAR, { recursive: true })

const b = await chromium.launch()
const hasil = []

for (const k of KANDIDAT) {
  const p = await b.newPage({ viewport: { width: 390, height: 900 }, deviceScaleFactor: 2 })
  await p.setContent(halaman(k), { waitUntil: 'networkidle' })
  /* Font web butuh sedikit waktu sesudah networkidle sebelum metriknya stabil. */
  await p.evaluate(() => document.fonts.ready)
  await p.waitForTimeout(400)

  const el = await p.locator('.bingkai')
  const berkas = join(KELUAR, `${k.kunci}.png`)
  await el.screenshot({ path: berkas })

  const kotak = await el.boundingBox()
  hasil.push({ kunci: k.kunci, tinggi: Math.round(kotak.height) })
  await p.close()
}

/* Satu gambar berjajar — supaya bisa dibandingkan tanpa membuka empat berkas. */
const gabung = `
<!doctype html><html lang="id"><head><meta charset="utf-8">
<link href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,400;12..96,700&family=Plus+Jakarta+Sans:wght@400;600;700&display=swap" rel="stylesheet">
<style>${DASAR}
  body { display:flex; gap:18px; padding:18px; align-items:flex-start; }
</style></head><body>
${KANDIDAT.map((k) => `<div class="bingkai"><div class="judulKandidat">${k.judul}<span>${k.sub}</span></div>${k.html()}</div>`).join('')}
</body></html>`

const pg = await b.newPage({ viewport: { width: 1680, height: 1100 }, deviceScaleFactor: 2 })
await pg.setContent(gabung, { waitUntil: 'networkidle' })
await pg.evaluate(() => document.fonts.ready)
await pg.waitForTimeout(400)
await pg.screenshot({ path: join(KELUAR, 'berjajar.png'), fullPage: true })
await pg.close()

await b.close()

writeFileSync(
  join(KELUAR, 'CATATAN.md'),
  [
    '# Banding dashboard — data PRODUKSI 2026-09-05',
    '',
    'Kode aplikasi TIDAK diubah. Halaman ini berdiri sendiri.',
    '',
    '| Kandidat | Tinggi render |',
    '|---|---|',
    ...hasil.map((h) => `| ${h.kunci} | ${h.tinggi}px |`),
    '',
    '## Yang membedakan',
    '',
    '- **SEKARANG** — empat kartu bobot identik; kas NEGATIF tampil sama',
    '  seperti angka positif; 13 tenggat lewat tak muncul sama sekali.',
    '- **A Tenang** — satu angka memimpin, sisanya mengecil. Bayangan bernada',
    '  navy, hanya pada kartu utama. Sparkline sebagai "dataword" (Tufte).',
    '- **B Panel** — bidang navy meneruskan layar login; kartu menumpang',
    '  tepinya. Merek langsung terlihat — paling menjual ke calon pembeli.',
    '- **C Perhatian** — mendahulukan yang harus dikerjakan. Pita status',
    '  memakai PANJANG (encoding paling akurat menurut NN/g), bukan donut.',
    '',
    '## Yang TIDAK dipakai, dan alasannya',
    '',
    '- Donut / radial gauge untuk progres — NN/g menolak eksplisit; sudut',
    '  adalah encoding kuantitatif paling tidak akurat.',
    '- Glassmorphism / blur — mahal di Android murah, dan hilang total di',
    '  bawah matahari.',
    '- Dark-first sebagai identitas "premium" — bukti akademik justru',
    '  memenangkan light mode untuk teks kecil (positive-polarity advantage).',
    '- Gradien ungu — sidik jari khas desain hasil AI.',
    '',
  ].join('\n'),
)

console.log('══ Banding dashboard ══════════════════════════════════════════')
for (const h of hasil) console.log(`  ${h.kunci.padEnd(14)} ${h.tinggi}px`)
console.log('')
console.log(`  berjajar.png + CATATAN.md di ${KELUAR}`)
