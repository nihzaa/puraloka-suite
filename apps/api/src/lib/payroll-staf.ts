// PAYROLL STAF (G2c) — menghitung slip gaji dari tarif yang DITETAPKAN.
//
// ══════════════════════════════════════════════════════════════════════════
// ATURAN YANG TAK BISA DITAWAR
// ══════════════════════════════════════════════════════════════════════════
//
// **Berkas ini tidak memuat satu pun angka tarif.** Tak ada PTKP, tak ada
// lapisan PPh 21, tak ada persentase BPJS — bahkan sebagai fallback.
//
// Kalau tarifnya belum ditetapkan founder (G2a), `hitungSlip` mengembalikan
// `null` untuk komponen itu dan MELAPORKANNYA sebagai penghalang. Bukan
// menghitung dengan angka bawaan yang kelihatan wajar.
//
// R-011, dari alasan penolakan founder sendiri: *"aturan pajak berubah tiap
// tahun; salah hitung = urusan hukum, bukan bug"*.
//
// ── Kenapa hasilnya DISIMPAN, bukan dihitung ulang saat dibaca
//
// Slip yang sudah dibayarkan adalah pernyataan tentang uang yang SUDAH
// berpindah. Menghitungnya ulang dengan tarif hari ini membuat angka di layar
// tak lagi cocok dengan angka di rekening — dan penerimanya tak punya cara
// membuktikan mana yang benar. Pemeriksaan pajak pun menuntut bukti berapa
// yang dipotong SAAT ITU; slip yang berubah sendiri bukan bukti.
//
// Modul ini karena itu menghasilkan objek yang SIAP DISIMPAN — bukan yang
// dipanggil ulang tiap kali slip dibuka.
//
// ── Kenapa PPh 21 dihitung dari PENGHASILAN BRUTO, dan apa yang TIDAK
//    dilakukan di sini
//
// TER (PMK-168/2023) bekerja sederhana untuk masa pajak Januari–November:
// tarif efektif × penghasilan bruto sebulan. PTKP sudah TERKANDUNG di dalam
// lapisan TER-nya — itulah gunanya "efektif".
//
// Yang TIDAK dilakukan modul ini: perhitungan masa pajak DESEMBER, yang
// memakai tarif Pasal 17 atas penghasilan setahun dikurangi PTKP, biaya
// jabatan, dan iuran pensiun — lalu dikurangi yang sudah dipotong Jan–Nov.
//
// Itu perhitungan yang berbeda bentuknya, bukan sekadar angka lain, dan
// menebaknya berarti menuliskan aturan pajak ke dalam kode. `hitungSlip`
// melaporkannya sebagai penghalang bertanda `desember-butuh-setahunan`
// supaya keputusannya terlihat, bukan diam-diam salah.

import {
  periodeBerlaku, ptkpSetahun, tarifTer, hitungBpjs, angka,
  type PeriodeTarif,
} from './tarif-payroll.js'

export interface PegawaiPayroll {
  id: string
  nomor_induk: string | null
  nama: string
  /** `null` = belum ditetapkan. BUKAN nol. */
  gaji_pokok: number | string | null
  status_ptkp: string | null
  kategori_ter: string | null
}

export interface KomponenSlip {
  urutan: number
  jenis: 'penghasilan' | 'potongan' | 'informasi'
  kode: string
  label: string
  nominal: number
  /** Dari mana angkanya — dicetak di slip supaya bisa ditanyakan. */
  dasar_hitung: string | null
}

export interface Penghalang {
  kode:
    | 'gaji-pokok-kosong'
    | 'status-ptkp-kosong'
    | 'kategori-ter-kosong'
    | 'tarif-bpjs-belum'
    | 'tarif-ter-belum'
    | 'tarif-ptkp-belum'
    | 'lapisan-ter-tak-cocok'
    | 'desember-butuh-setahunan'
  pesan: string
}

export interface HasilSlip {
  pegawai_id: string
  gaji_pokok: number
  komponen: KomponenSlip[]
  total_penghasilan: number
  total_potongan: number
  gaji_bersih: number
  pph21: number
  /** Jejak tarif yang DIPAKAI — supaya bisa ditunjuk saat dipertanyakan. */
  tarif_ptkp_id: string | null
  tarif_ter_id: string | null
  tarif_bpjs_id: string | null
  status_ptkp: string | null
  kategori_ter: string | null
  ptkp_setahun: number | null
  tarif_ter_persen: number | null
  /**
   * Hal yang membuat slip ini TIDAK BOLEH dibayarkan apa adanya.
   *
   * Slip tetap dihasilkan (supaya yang sudah bisa dihitung terlihat), tetapi
   * pemanggilnya WAJIB menolak mengunci periode selama daftar ini tak kosong.
   */
  penghalang: Penghalang[]
}

const rupiah = (n: number) =>
  `Rp ${new Intl.NumberFormat('id-ID', { maximumFractionDigits: 0 }).format(n)}`

const persen = (n: number) =>
  `${new Intl.NumberFormat('id-ID', { maximumFractionDigits: 4 }).format(n)}%`

/**
 * Hitung satu slip gaji.
 *
 * INVARIAN yang diuji (`__tests__/payroll-staf.test.ts`):
 *  1. tarif yang BELUM ditetapkan → penghalang, komponennya TIDAK dibuat
 *     dengan angka bawaan
 *  2. gaji pokok `null` → penghalang, dan gaji pokok TIDAK jadi 0 diam-diam
 *  3. BPJS bagian PERUSAHAAN masuk slip sebagai `informasi` — terlihat
 *     sebagai hak pegawai, TIDAK mengurangi yang diterima
 *  4. PPh 21 dihitung dari bruto (TER sudah mengandung PTKP), bukan dari
 *     bruto dikurangi PTKP — mengurangkannya dua kali
 *  5. masa pajak DESEMBER dilaporkan sebagai penghalang, tak ditebak
 *  6. `gaji_bersih` = penghasilan − potongan, dan `informasi` tak ikut
 *     keduanya
 */
export function hitungSlip(
  pegawai: PegawaiPayroll,
  periode: PeriodeTarif[],
  /** `YYYY-MM-DD` — tanggal acuan pemilihan tarif. */
  tanggalAcuan: string,
): HasilSlip {
  const penghalang: Penghalang[] = []
  const komponen: KomponenSlip[] = []

  const gajiPokok = angka(pegawai.gaji_pokok)
  if (gajiPokok === null) {
    // `null`, bukan 0. Gaji pokok nol adalah pernyataan yang bisa salah dan
    // tampak sah — slip dengan penghasilan Rp 0 akan dibayarkan sebagai nol.
    penghalang.push({
      kode: 'gaji-pokok-kosong',
      pesan: 'Gaji pokok belum ditetapkan di data kepegawaian.',
    })
  }

  const pokok = gajiPokok ?? 0
  if (gajiPokok !== null) {
    komponen.push({
      urutan: 10, jenis: 'penghasilan', kode: 'gaji_pokok',
      label: 'Gaji pokok', nominal: pokok, dasar_hitung: null,
    })
  }

  // ── BPJS ────────────────────────────────────────────────────────────────
  const pBpjs = periodeBerlaku(periode, 'bpjs', tanggalAcuan)
  const iuran = hitungBpjs(pBpjs, pokok)
  if (!iuran) {
    penghalang.push({
      kode: 'tarif-bpjs-belum',
      pesan: 'Tarif BPJS belum ditetapkan untuk tanggal ini — potongan jaminan '
        + 'sosial tidak dihitung.',
    })
  } else {
    let urut = 100
    for (const i of iuran) {
      const dasar = i.kena_batas
        ? `dari batas upah ${rupiah(i.dasar_upah)}`
        : `dari ${rupiah(i.dasar_upah)}`
      if (i.karyawan !== null) {
        komponen.push({
          urutan: urut++, jenis: 'potongan', kode: `bpjs_${i.kunci}`,
          label: `BPJS ${i.label ?? i.kunci} (karyawan)`,
          nominal: i.karyawan, dasar_hitung: dasar,
        })
      }
      if (i.perusahaan !== null) {
        // `informasi`: ditanggung PERUSAHAAN. Wajib terlihat di slip sebagai
        // hak pegawai, tetapi TIDAK mengurangi yang diterima. Menjadikannya
        // potongan memotong gaji untuk sesuatu yang bukan tanggungannya.
        komponen.push({
          urutan: urut++, jenis: 'informasi', kode: `bpjs_${i.kunci}_perusahaan`,
          label: `BPJS ${i.label ?? i.kunci} (ditanggung perusahaan)`,
          nominal: i.perusahaan, dasar_hitung: dasar,
        })
      }
    }
  }

  // ── PPh 21 (TER) ────────────────────────────────────────────────────────
  const pTer = periodeBerlaku(periode, 'ter_pph21', tanggalAcuan)
  const pPtkp = periodeBerlaku(periode, 'ptkp', tanggalAcuan)

  // PTKP dicatat untuk JEJAK, bukan untuk dikurangkan: TER sudah
  // mengandungnya. Mengurangkannya lagi akan menghitungnya dua kali.
  const ptkp = pegawai.status_ptkp ? ptkpSetahun(pPtkp, pegawai.status_ptkp) : null
  if (!pegawai.status_ptkp) {
    penghalang.push({
      kode: 'status-ptkp-kosong',
      pesan: 'Status PTKP belum diisi di data kepegawaian.',
    })
  } else if (!pPtkp) {
    penghalang.push({
      kode: 'tarif-ptkp-belum',
      pesan: 'Tarif PTKP belum ditetapkan untuk tanggal ini.',
    })
  }

  let pph = 0
  let terPersen: number | null = null

  if (!pegawai.kategori_ter) {
    penghalang.push({
      kode: 'kategori-ter-kosong',
      pesan: 'Kategori TER (A/B/C) belum diisi di data kepegawaian — '
        + 'pemetaannya dari status PTKP mengikuti peraturan, bukan ditebak sistem.',
    })
  } else if (!pTer) {
    penghalang.push({
      kode: 'tarif-ter-belum',
      pesan: 'Lapisan tarif PPh 21 belum ditetapkan untuk tanggal ini — '
        + 'pajak tidak dipotong.',
    })
  } else {
    // Masa pajak DESEMBER memakai perhitungan setahunan (Pasal 17), bukan
    // TER. Bentuknya berbeda, bukan sekadar angka lain — menebaknya berarti
    // menuliskan aturan pajak ke dalam kode.
    const bulan = tanggalAcuan.slice(5, 7)
    if (bulan === '12') {
      penghalang.push({
        kode: 'desember-butuh-setahunan',
        pesan: 'Masa pajak Desember memakai perhitungan setahunan (Pasal 17), '
          + 'bukan tarif efektif bulanan. Angka TER di bawah BUKAN pajak Desember '
          + 'yang sebenarnya — hitung terpisah sebelum membayarkan.',
      })
    }

    terPersen = tarifTer(pTer, pegawai.kategori_ter, pokok)
    if (terPersen === null) {
      // Penghasilan tak masuk satu lapisan pun = tabel tarifnya belum
      // lengkap. Harus terlihat, bukan diam-diam jadi 0%.
      penghalang.push({
        kode: 'lapisan-ter-tak-cocok',
        pesan: `Penghasilan ${rupiah(pokok)} tidak masuk satu pun lapisan TER `
          + `kategori ${pegawai.kategori_ter} — tabel tarifnya belum lengkap.`,
      })
    } else {
      // TER × BRUTO. PTKP tidak dikurangkan: ia sudah terkandung di lapisan
      // tarifnya — itulah arti "efektif".
      pph = Math.round((pokok * terPersen) / 100)
      if (pph > 0) {
        komponen.push({
          urutan: 200, jenis: 'potongan', kode: 'pph21',
          label: 'PPh 21', nominal: pph,
          dasar_hitung: `TER ${pegawai.kategori_ter} ${persen(terPersen)} dari ${rupiah(pokok)}`,
        })
      }
    }
  }

  const total_penghasilan = komponen
    .filter((k) => k.jenis === 'penghasilan')
    .reduce((s, k) => s + k.nominal, 0)
  const total_potongan = komponen
    .filter((k) => k.jenis === 'potongan')
    .reduce((s, k) => s + k.nominal, 0)

  return {
    pegawai_id: pegawai.id,
    gaji_pokok: pokok,
    komponen: komponen.sort((a, b) => a.urutan - b.urutan),
    total_penghasilan,
    total_potongan,
    // `informasi` TIDAK ikut di kedua sisi — itulah gunanya jenis ketiga.
    gaji_bersih: total_penghasilan - total_potongan,
    pph21: pph,
    tarif_ptkp_id: pPtkp?.id ?? null,
    tarif_ter_id: pTer?.id ?? null,
    tarif_bpjs_id: pBpjs?.id ?? null,
    status_ptkp: pegawai.status_ptkp,
    kategori_ter: pegawai.kategori_ter,
    ptkp_setahun: ptkp,
    tarif_ter_persen: terPersen,
    penghalang,
  }
}

export interface RingkasanPayroll {
  slip: HasilSlip[]
  jumlah_pegawai: number
  total_penghasilan: number
  total_potongan: number
  total_bersih: number
  total_pph21: number
  /** Slip yang punya penghalang — periode tak boleh dikunci selama ada. */
  bermasalah: HasilSlip[]
  boleh_dikunci: boolean
}

/**
 * Ringkas seluruh slip satu periode.
 *
 * INVARIAN yang diuji:
 *  1. `boleh_dikunci` = false bila ADA SATU slip pun yang bermasalah
 *  2. `boleh_dikunci` = false bila NOL slip — periode kosong bukan "selesai"
 *  3. total dijumlahkan dari slip, bukan dihitung ulang
 */
export function ringkasPayroll(slip: HasilSlip[]): RingkasanPayroll {
  const bermasalah = slip.filter((s) => s.penghalang.length > 0)
  return {
    slip,
    jumlah_pegawai: slip.length,
    total_penghasilan: slip.reduce((s, x) => s + x.total_penghasilan, 0),
    total_potongan: slip.reduce((s, x) => s + x.total_potongan, 0),
    total_bersih: slip.reduce((s, x) => s + x.gaji_bersih, 0),
    total_pph21: slip.reduce((s, x) => s + x.pph21, 0),
    bermasalah,
    // Periode KOSONG bukan "boleh dikunci": mengunci nol slip berarti
    // menyatakan penggajian bulan itu selesai tanpa seorang pun dibayar.
    boleh_dikunci: slip.length > 0 && bermasalah.length === 0,
  }
}
