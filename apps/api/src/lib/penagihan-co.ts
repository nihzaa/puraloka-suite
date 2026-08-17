/**
 * CARA MENAGIH CHANGE ORDER — `billing_mode`, dan kenapa ia harus dibaca.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * Lubang yang ditutup berkas ini, diukur 2026-08-13
 * ══════════════════════════════════════════════════════════════════════════
 *
 * `change_orders.billing_mode` ada sejak migrasi 053 dengan tiga nilai sah:
 *
 *     include_termin   ditagih menyatu dengan termin berjalan
 *     separate_co      ditagih sebagai tagihan TERSENDIRI
 *     final_account    ditagih di perhitungan akhir (final account)
 *
 * Rutenya menulisnya (`change-orders.ts:190`, `:240`). Formulir mengisinya.
 * Dan **tak satu pun baris kode membacanya** — disisir 2026-08-13 di seluruh
 * `apps/api/src`, `apps/web/app`, `apps/web/lib`: ketiga nilai itu hanya
 * muncul sekali, di CHECK constraint migrasi 053 itu sendiri.
 *
 * Akibatnya bukan "fitur belum jalan". Saat CO disetujui, `contract_value`
 * dinaikkan sebesar `total_amount_delta` TANPA memandang `billing_mode`
 * (`change-orders.ts:736`). Lalu `sertifikat_ipc` membekukan `contract_value`
 * itu dan menagih progres × nilai kontrak (`sertifikat-ipc.ts:163`).
 *
 * Jadi CO bertanda `separate_co` — yang justru berarti "JANGAN tagih lewat
 * termin" — tetap ikut tertagih lewat termin. Kalau tagihan terpisahnya juga
 * terbit, pekerjaan yang sama ditagih DUA KALI, dan tak ada satu pun galat
 * yang muncul: kedua angkanya benar menurut jalurnya masing-masing.
 *
 * Ini kelas cacat yang sama dengan `kasbons.settled_at` (dibaca keuangan,
 * tak pernah ditulis) dan `sdm:pegawai:*` (permission ada, rute nol): kolom
 * yang menjanjikan kemampuan, disimpan dengan patuh, lalu diabaikan.
 *
 * ── Yang TIDAK diputuskan di sini
 *
 * Berkas ini tidak mengubah cara CO lama diperlakukan, dan tidak menebak
 * `billing_mode` yang kosong. NULL berarti "belum diputuskan", bukan
 * "include_termin" — menebaknya persis kesalahan yang membuat lubang ini
 * tak terlihat selama ini.
 */

export type CaraTagih = 'include_termin' | 'separate_co' | 'final_account'

export const CARA_TAGIH: readonly CaraTagih[] =
  ['include_termin', 'separate_co', 'final_account'] as const

/** Penjelasan yang dipakai UI dan pesan galat — satu sumber, bukan dua. */
export const ARTI_CARA_TAGIH: Record<CaraTagih, string> = {
  include_termin:
    'Menyatu dengan termin berjalan — nilai kontrak naik, dan IPC berikutnya '
    + 'otomatis menagihnya sesuai progres.',
  separate_co:
    'Ditagih sebagai tagihan TERSENDIRI di luar termin. Nilai kontrak TIDAK '
    + 'dinaikkan, supaya pekerjaan yang sama tidak ikut tertagih lewat IPC.',
  final_account:
    'Ditahan sampai perhitungan akhir. Nilai kontrak tidak dinaikkan sekarang; '
    + 'diperhitungkan bersama seluruh penyesuaian saat proyek ditutup.',
}

/**
 * Apakah `contract_value` proyek dinaikkan saat CO ini disetujui?
 *
 * HANYA `include_termin`. Dua sisanya ditagih di luar jalur termin, jadi
 * menaikkan nilai kontrak akan membuat IPC menagihnya juga — pekerjaan yang
 * sama tertagih dua kali lewat dua jalur yang masing-masing terlihat benar.
 */
export function naikkanNilaiKontrak(mode: string | null | undefined): boolean {
  return mode === 'include_termin'
}

/**
 * Apakah CO ini ditagih lewat TAGIHAN TERSENDIRI?
 *
 * Kebalikan tepat dari `naikkanNilaiKontrak`, dan sengaja ditulis sebagai
 * fungsi sendiri alih-alih `!naikkanNilaiKontrak(m)`.
 *
 * Sebabnya `null`. "Belum diputuskan" BUKAN "ditagih terpisah" — negasi akan
 * meloloskannya, dan yang lolos adalah CO yang cara tagihnya tak pernah
 * diputuskan siapa pun. Justru di situlah tagihan ganda lahir: nilai kontrak
 * tak naik (karena bukan `include_termin`), tagihan terpisah terbit, lalu
 * seseorang membetulkan `billing_mode` jadi `include_termin` belakangan
 * supaya "konsisten" — dan IPC berikutnya menagihnya lagi.
 *
 * `final_account` IKUT di sini: ia memang ditagih tersendiri, hanya waktunya
 * ditahan sampai perhitungan akhir. Yang menentukan KAPAN adalah manusia yang
 * menerbitkannya, bukan kolom ini.
 */
export function naikkanTerpisah(mode: string | null | undefined): boolean {
  return mode === 'separate_co' || mode === 'final_account'
}

export type HasilPeriksa =
  | { boleh: true; naikkanKontrak: boolean; catatan: string }
  | { boleh: false; sebab: string }

/**
 * Boleh-tidaknya sebuah CO disetujui, ditinjau dari cara penagihannya.
 *
 * `billing_mode` KOSONG ditolak — dan itu bukan kerewelan. Menyetujui CO
 * tanpa memutuskan cara menagihnya berarti keputusan itu diambil belakangan
 * oleh siapa pun yang kebetulan menerbitkan tagihan, tanpa jejak. Justru di
 * situlah tagihan ganda lahir.
 */
export function periksaPenyetujuanCo(masukan: {
  billingMode: string | null | undefined
  deltaNilai: number | string
}): HasilPeriksa {
  const mode = (masukan.billingMode ?? '').trim()

  if (!mode) {
    return {
      boleh: false,
      sebab: 'Cara penagihan belum ditentukan. Pilih salah satu sebelum menyetujui — '
        + 'CO yang disetujui tanpa cara tagih akan diputuskan belakangan oleh siapa pun '
        + 'yang menerbitkan tagihan, dan di situlah tagihan ganda lahir.',
    }
  }

  if (!(CARA_TAGIH as readonly string[]).includes(mode)) {
    return {
      boleh: false,
      sebab: `Cara penagihan "${mode}" tidak dikenali. Pilih salah satu: ${CARA_TAGIH.join(', ')}.`,
    }
  }

  const m = mode as CaraTagih
  const delta = Number(masukan.deltaNilai)

  if (!Number.isFinite(delta)) {
    return { boleh: false, sebab: 'Nilai perubahan CO tidak terbaca sebagai angka.' }
  }

  // Delta NOL: sah untuk perubahan spesifikasi yang tak mengubah harga, tapi
  // tak ada gunanya menandainya `separate_co` — tak ada yang perlu ditagih.
  if (delta === 0 && m !== 'include_termin') {
    return {
      boleh: false,
      sebab: 'CO ini tidak mengubah nilai apa pun, jadi tak ada yang perlu ditagih '
        + 'terpisah. Pakai "menyatu dengan termin".',
    }
  }

  const naik = naikkanNilaiKontrak(m)

  return {
    boleh: true,
    naikkanKontrak: naik,
    catatan: naik
      ? `Nilai kontrak naik ${rupiah(delta)}. IPC berikutnya otomatis menagihnya sesuai progres.`
      : `Nilai kontrak TIDAK diubah — ${ARTI_CARA_TAGIH[m]} Terbitkan tagihannya lewat jalur itu.`,
  }
}

function rupiah(n: number): string {
  const tanda = n < 0 ? '−' : ''
  return `${tanda}Rp ${Math.abs(n).toLocaleString('id-ID')}`
}

export type BarisCo = {
  id: string
  co_number: string
  status: string
  billing_mode: string | null
  total_amount_delta: number | string
  kontrak_addendum_id?: string | null
}

export type Rekap = {
  /** Sudah masuk `contract_value` — tertagih lewat termin/IPC. */
  lewatTermin: number
  /** Disetujui tapi ditagih di luar termin — BELUM tentu sudah tertagih. */
  terpisah: number
  /** Ditahan sampai perhitungan akhir. */
  akhir: number
  /** Disetujui tanpa cara tagih — data lama sebelum penjaga ini. */
  tanpaCara: number
  jumlahTanpaCara: number
}

/**
 * Rekap CO yang SUDAH disetujui menurut cara penagihannya.
 *
 * Gunanya satu: menjawab "berapa yang sudah pasti tertagih, dan berapa yang
 * menunggu saya terbitkan tagihannya sendiri". Tanpa pemisahan ini, angka
 * `separate_co` tak terlihat di mana pun — ia tidak di `contract_value`, dan
 * tidak pula di daftar tagihan, jadi ia hilang sampai ada yang menagihnya
 * dari ingatan.
 */
export function rekapPenagihanCo(daftar: readonly BarisCo[]): Rekap {
  const r: Rekap = {
    lewatTermin: 0, terpisah: 0, akhir: 0, tanpaCara: 0, jumlahTanpaCara: 0,
  }

  for (const co of daftar) {
    if (co.status !== 'approved') continue

    const n = Number(co.total_amount_delta)
    if (!Number.isFinite(n)) continue

    switch (co.billing_mode) {
      case 'include_termin': r.lewatTermin += n; break
      case 'separate_co':    r.terpisah += n; break
      case 'final_account':  r.akhir += n; break
      default:
        // CO lama yang disetujui sebelum penjaga ini ada. Dihitung TERPISAH,
        // bukan dilebur ke salah satu kategori — melebur berarti menebak, dan
        // tebakan itulah yang harus terlihat supaya bisa diperbaiki manusia.
        r.tanpaCara += n
        r.jumlahTanpaCara++
    }
  }

  return {
    lewatTermin: bulat2(r.lewatTermin),
    terpisah: bulat2(r.terpisah),
    akhir: bulat2(r.akhir),
    tanpaCara: bulat2(r.tanpaCara),
    jumlahTanpaCara: r.jumlahTanpaCara,
  }
}

const bulat2 = (n: number) => Math.round(n * 100) / 100
