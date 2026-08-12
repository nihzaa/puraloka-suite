/**
 * REGISTER KONTRAK — dokumen kontrak sebagai entitas. PURE, tanpa I/O.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * LUBANG YANG DITUTUP
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Data kontrak menempel di `projects`. Tiga hal hilang karenanya:
 *
 *   1. NILAI AWAL tak bisa dibedakan dari nilai berjalan. Satu change order
 *      Rp 50 juta sudah disetujui dan `contract_value` memuat hasilnya — yang
 *      bertanya "berapa pembengkakan proyek ini" tak punya pembanding.
 *   2. ADDENDUM tak punya dokumennya sendiri. `change_orders` mencatat
 *      perubahan LINGKUP; addendum adalah dokumen hukum bernomor.
 *   3. SATU KLIEN BANYAK KONTRAK tak terlacak (diukur: satu klien 3 proyek).
 *
 * ── Pembagian tugas yang disepakati (founder, 2026-08-12)
 *
 *     kontrak.nilai            apa yang DITANDATANGANI
 *     projects.contract_value  apa yang BERLAKU sekarang
 *
 * `contract_value` dibaca 104 tempat — memindahkannya berarti menyentuh
 * seluruhnya, dan satu pembaca yang terlewat membuat invoice terbit dengan
 * angka salah tanpa satu pun galat. Jadi tabel kontrak MERUJUK proyek, dan
 * kolom lamanya tak disentuh.
 *
 * ── Kenapa modul ini tak MENULIS nilai berjalan
 *
 * Menghitung ulang `contract_value` dari (induk + Σ addendum) akan menimpa
 * nilai yang kini diisi jalur change order — dua penulis untuk satu kolom
 * pasti berselisih. Yang disediakan hanya PEMBANDING; manusia yang memutuskan.
 */

export type JenisKontrak = 'induk' | 'addendum'
export type StatusKontrak = 'draf' | 'berlaku' | 'selesai' | 'dibatalkan'

export interface MasukanKontrak {
  jenis?: string
  nomor?: string
  judul?: string
  tanggal_tanda_tangan?: string
  tanggal_mulai?: string | null
  tanggal_selesai?: string | null
  nilai?: number | string | null
  retensi_pct?: number | string | null
  syarat_pembayaran?: string | null
  lingkup?: string | null
  catatan?: string | null
}

export interface NilaiKontrak {
  jenis: JenisKontrak
  nomor: string
  judul: string
  tanggal_tanda_tangan: string
  tanggal_mulai: string | null
  tanggal_selesai: string | null
  nilai: number
  retensi_pct: number | null
  syarat_pembayaran: string | null
  lingkup: string | null
  catatan: string | null
}

export type HasilValidasi =
  | { ok: true; nilai: NilaiKontrak }
  | { ok: false; galat: string }

const TGL = /^\d{4}-\d{2}-\d{2}$/

function teks(v: string | null | undefined): string | null {
  const t = (v ?? '').trim()
  return t === '' ? null : t
}

export function validasiKontrak(m: MasukanKontrak): HasilValidasi {
  const jenis = m.jenis === 'addendum' ? 'addendum' : m.jenis === 'induk' ? 'induk' : null
  if (jenis === null) {
    return { ok: false, galat: 'jenis wajib "induk" atau "addendum"' }
  }

  const nomor = teks(m.nomor)
  if (nomor === null) return { ok: false, galat: 'Nomor kontrak wajib diisi' }

  const judul = teks(m.judul)
  if (judul === null) {
    return {
      ok: false,
      galat: 'Judul wajib diisi — kontrak tanpa judul tak bisa dikenali di daftar '
        + 'yang berisi puluhan nomor.',
    }
  }

  const ttd = teks(m.tanggal_tanda_tangan)
  if (ttd === null || !TGL.test(ttd)) {
    return { ok: false, galat: 'tanggal_tanda_tangan wajib, bentuk YYYY-MM-DD' }
  }

  const mulai = teks(m.tanggal_mulai)
  const selesai = teks(m.tanggal_selesai)
  if (mulai !== null && !TGL.test(mulai)) {
    return { ok: false, galat: 'tanggal_mulai harus berbentuk YYYY-MM-DD' }
  }
  if (selesai !== null && !TGL.test(selesai)) {
    return { ok: false, galat: 'tanggal_selesai harus berbentuk YYYY-MM-DD' }
  }
  if (mulai !== null && selesai !== null && selesai < mulai) {
    // Perbandingan STRING pada YYYY-MM-DD benar secara leksikal, dan
    // menghindari pergeseran zona waktu saat mem-parse Date.
    return {
      ok: false,
      galat: `Tanggal selesai (${selesai}) mendahului mulai (${mulai}) — jangka waktu `
        + 'negatif membuat denda keterlambatan terhitung sejak hari pertama.',
    }
  }

  // `Number('') === 0`, bukan NaN — kosong ditolak SEBELUM konversi supaya
  // "belum diisi" tak lolos jadi nol lalu ditolak CHECK dengan pesan lain.
  if (m.nilai === null || m.nilai === undefined || String(m.nilai).trim() === '') {
    return { ok: false, galat: 'Nilai kontrak wajib diisi' }
  }
  const nilai = Number(m.nilai)
  if (!Number.isFinite(nilai)) {
    return { ok: false, galat: 'Nilai kontrak tak terbaca sebagai angka' }
  }

  if (jenis === 'induk' && nilai <= 0) {
    return { ok: false, galat: 'Nilai kontrak induk harus lebih dari nol' }
  }
  if (jenis === 'addendum' && nilai === 0) {
    return {
      ok: false,
      galat: 'Addendum bernilai nol tak mengubah apa pun — dokumen yang tak perlu ada. '
        + 'Untuk pengurangan lingkup, isikan nilai NEGATIF.',
    }
  }

  let retensi: number | null = null
  if (m.retensi_pct !== null && m.retensi_pct !== undefined
      && String(m.retensi_pct).trim() !== '') {
    const r = Number(m.retensi_pct)
    if (!Number.isFinite(r)) return { ok: false, galat: 'Retensi tak terbaca sebagai angka' }
    if (r < 0 || r > 100) return { ok: false, galat: 'Retensi harus 0–100 persen' }
    retensi = r
  }

  return {
    ok: true,
    nilai: {
      jenis,
      nomor,
      judul,
      tanggal_tanda_tangan: ttd,
      tanggal_mulai: mulai,
      tanggal_selesai: selesai,
      nilai,
      retensi_pct: retensi,
      syarat_pembayaran: teks(m.syarat_pembayaran),
      lingkup: teks(m.lingkup),
      catatan: teks(m.catatan),
    },
  }
}

export type HasilTransisi =
  | { boleh: true }
  | { boleh: false; sebab: string }

/**
 * Bolehkah kontrak berpindah status?
 *
 * `draf` → `berlaku` → `selesai`, dan `dibatalkan` dari mana pun kecuali yang
 * sudah selesai.
 *
 * ── Kenapa yang SELESAI tak bisa dibatalkan
 *
 * Kontrak selesai berarti pekerjaannya diserahterimakan dan pembayarannya
 * tuntas. Membatalkannya sesudah itu tak menghapus apa pun yang sudah terjadi
 * — ia hanya membuat riwayat pembayaran menunjuk dokumen yang katanya tak
 * pernah berlaku.
 */
export function periksaTransisiKontrak(m: {
  statusSekarang: StatusKontrak
  statusTujuan: StatusKontrak
  alasanBatal?: string | null
}): HasilTransisi {
  const { statusSekarang: dari, statusTujuan: ke } = m

  if (dari === ke) return { boleh: false, sebab: `Kontrak sudah berstatus ${ke}.` }

  if (dari === 'dibatalkan') {
    return {
      boleh: false,
      sebab: 'Kontrak ini sudah dibatalkan. Terbitkan kontrak baru — menghidupkan '
        + 'yang lama membuat alasan pembatalannya menggantung pada dokumen yang berlaku.',
    }
  }

  if (dari === 'selesai') {
    return {
      boleh: false,
      sebab: 'Kontrak sudah selesai. Membatalkannya tak menghapus pembayaran yang '
        + 'sudah terjadi — ia hanya membuat riwayatnya menunjuk dokumen yang katanya '
        + 'tak pernah berlaku.',
    }
  }

  if (ke === 'dibatalkan') {
    if (!m.alasanBatal?.trim()) {
      return {
        boleh: false,
        sebab: 'Pembatalan wajib beralasan — pihak yang menandatangani berhak tahu '
          + 'kenapa kontraknya ditarik.',
      }
    }
    return { boleh: true }
  }

  if (ke === 'berlaku') {
    if (dari !== 'draf') {
      return { boleh: false, sebab: `Hanya draf yang bisa diberlakukan; ini berstatus ${dari}.` }
    }
    return { boleh: true }
  }

  if (ke === 'selesai') {
    if (dari !== 'berlaku') {
      return {
        boleh: false,
        sebab: `Hanya kontrak berlaku yang bisa diselesaikan; ini berstatus ${dari}.`,
      }
    }
    return { boleh: true }
  }

  if (ke === 'draf') {
    return {
      boleh: false,
      sebab: 'Kontrak tak bisa dikembalikan ke draf. Batalkan dan terbitkan yang baru.',
    }
  }

  return { boleh: false, sebab: `Perpindahan ${dari} → ${ke} tak dikenal.` }
}

export interface BarisKontrak {
  id: string
  jenis: JenisKontrak
  status: StatusKontrak
  nilai: number | string
  kontrak_induk_id: string | null
}

export interface HasilNilai {
  /** Nilai kontrak INDUK yang berlaku — apa yang mula-mula ditandatangani. */
  awal: number
  /** Σ addendum berlaku. Bisa negatif (pengurangan lingkup). */
  addendum: number
  /** awal + addendum — nilai kontraktual berjalan. */
  berjalan: number
  jumlahAddendum: number
}

/**
 * Nilai kontraktual sebuah proyek, diturunkan dari dokumennya.
 *
 * ── Kenapa hanya yang BERLAKU dihitung
 *
 * Draf adalah rancangan; yang dibatalkan tak pernah terjadi. Menghitungnya
 * membuat nilai kontrak berubah setiap kali seseorang menyusun rancangan
 * baru — dan angka yang bergerak karena pekerjaan yang belum disepakati
 * adalah angka yang tak bisa dipakai menagih.
 *
 * `selesai` IKUT dihitung: kontrak yang tuntas tetap menentukan berapa yang
 * pernah disepakati, dan laporan penutupan proyek membacanya.
 */
export function hitungNilaiKontrak(daftar: readonly BarisKontrak[]): HasilNilai {
  let awal = 0
  let addendum = 0
  let jumlahAddendum = 0

  for (const k of daftar) {
    if (k.status !== 'berlaku' && k.status !== 'selesai') continue

    // Numeric dari pg datang sebagai STRING. `'100' + '25'` menghasilkan
    // '10025' kalau tak dikonversi — angka yang salah tanpa satu pun galat.
    const n = Number(k.nilai ?? 0)
    if (!Number.isFinite(n)) continue

    if (k.jenis === 'induk') {
      awal += n
    } else {
      addendum += n
      jumlahAddendum++
    }
  }

  return {
    awal: bulat2(awal),
    addendum: bulat2(addendum),
    berjalan: bulat2(awal + addendum),
    jumlahAddendum,
  }
}

export interface HasilBanding {
  /** Nilai menurut dokumen kontrak. */
  menurutKontrak: number
  /** Nilai yang dipakai jalur uang (`projects.contract_value`). */
  menurutProyek: number
  selisih: number
  cocok: boolean
  sebab: string
}

/** Toleransi pembulatan NUMERIC(15,2) — 1 sen, bukan parameter bisnis. */
export const EPSILON_KONTRAK = 0.01

/**
 * Bandingkan nilai menurut dokumen dengan nilai yang dipakai jalur uang.
 *
 * ── Kenapa MEMBANDINGKAN, bukan memperbaiki
 *
 * Selisih di sini bukan selalu kesalahan: change order yang sudah disetujui
 * tetapi belum diaddendumkan menghasilkan selisih yang SAH — pekerjaannya
 * sudah berjalan, dokumennya menyusul. Itu praktik nyata.
 *
 * Yang tak sah adalah selisih yang tak seorang pun tahu. Jadi yang dilakukan:
 * menyebut angkanya beserta kemungkinan sebabnya, dan membiarkan manusia
 * memutuskan.
 */
export function bandingkanNilai(m: {
  menurutKontrak: number
  menurutProyek: number | string
  adaCoBelumAddendum?: boolean
}): HasilBanding {
  const proyek = Number(m.menurutProyek ?? 0)
  const kontrak = Number(m.menurutKontrak ?? 0)
  const selisih = bulat2(proyek - kontrak)
  const cocok = Math.abs(selisih) <= EPSILON_KONTRAK

  let sebab: string
  if (cocok) {
    sebab = 'Nilai dokumen kontrak cocok dengan nilai yang dipakai penagihan.'
  } else if (kontrak === 0) {
    sebab = 'Belum ada kontrak berlaku yang tercatat untuk proyek ini — nilai '
      + 'penagihannya berasal dari data proyek, bukan dari dokumen.'
  } else if (selisih > 0 && m.adaCoBelumAddendum) {
    sebab = `Nilai penagihan ${selisih} lebih tinggi. Ada change order disetujui yang `
      + 'belum diaddendumkan — sah bila pekerjaannya memang sudah berjalan, tetapi '
      + 'dokumennya perlu menyusul.'
  } else if (selisih > 0) {
    sebab = `Nilai penagihan ${selisih} lebih tinggi daripada dokumen kontrak, dan `
      + 'tak ada change order yang menjelaskannya.'
  } else {
    sebab = `Nilai penagihan ${Math.abs(selisih)} lebih RENDAH daripada dokumen kontrak — `
      + 'sebagian yang sudah disepakati belum masuk hitungan penagihan.'
  }

  return { menurutKontrak: kontrak, menurutProyek: proyek, selisih, cocok, sebab }
}

function bulat2(n: number): number {
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : 0
}
