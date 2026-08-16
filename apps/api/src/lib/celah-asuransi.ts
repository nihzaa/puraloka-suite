/**
 * CELAH PERLINDUNGAN ASURANSI PROYEK.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * TIGA CELAH, DAN YANG KETIGA TAK TERLIHAT OLEH PEMERIKSAAN BIASA
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Pemeriksaan yang lazim ditulis orang: "proyek ini punya polis?" — satu
 * hitungan, satu jawaban. Itu menangkap celah pertama saja.
 *
 *   1. TAK ADA POLIS         terlihat oleh hitungan apa pun
 *   2. POLIS KADALUARSA      terlihat kalau statusnya ikut diperiksa
 *   3. PUNYA POLIS, TAPI     TIDAK terlihat oleh keduanya
 *      BUKAN YANG MENANGGUNG
 *      PEKERJAANNYA
 *
 * Celah ketiga itu yang paling berbahaya justru karena paling tenang. Proyek
 * dengan TPL (Third Party Liability) saja punya polis aktif, muncul sebagai
 * "terasuransi" di daftar mana pun, dan lolos audit yang cuma menghitung.
 *
 * Tetapi TPL menanggung kerugian PIHAK KETIGA — tetangga yang temboknya retak,
 * pejalan kaki yang tertimpa. Kerusakan pekerjaannya SENDIRI (kebakaran,
 * longsor, banjir) tak ditanggung siapa pun. Itulah gunanya CAR.
 *
 * Diukur 2026-08-16 pada basis nyata: 11 proyek aktif, 6 ber-CAR sehat,
 * 1 kadaluarsa, 1 berakhir < 30 hari, 1 hanya-TPL, 3 tanpa polis.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * KENAPA "PALING MENDESAK" DIPILIH, BUKAN SEMUANYA DILAPORKAN
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Satu proyek bisa memenuhi beberapa celah sekaligus — mis. polis kadaluarsa
 * DAN tak punya CAR aktif. Melaporkan keduanya mengirim dua pesan untuk satu
 * keadaan, dan yang membacanya harus menyimpulkan sendiri mana yang penting.
 *
 * Yang dipulangkan SATU sebab: yang paling mendesak. Urutannya tetap dan
 * ditulis di sini supaya tak berubah diam-diam.
 */

export interface Polis {
  /** `car` · `tpl` · `jamsostek` · `car_tpl` · `lainnya` */
  jenis: string
  /** `aktif` · `kadaluarsa` · `dibatalkan` */
  status: string
  /** ISO `YYYY-MM-DD`. */
  periodeSelesai: string
  nilaiPertanggungan: number | null
}

export interface HasilCelah {
  polis: number
  polisAktif: number
  /** Hari sampai polis penanggung-pekerjaan berakhir. `null` bila tak ada. */
  hariTersisa: number | null
  celah: boolean
  sebab: 'terlindungi' | 'tanpa_polis' | 'tak_menanggung_pekerjaan'
    | 'semua_kadaluarsa' | 'segera_berakhir'
}

/** Jenis yang benar-benar menanggung PEKERJAAN, bukan pihak ketiga. */
const MENANGGUNG_PEKERJAAN = new Set(['car', 'car_tpl'])

/**
 * @param hariIni     ISO `YYYY-MM-DD`
 * @param ambangHari  berapa hari sebelum berakhir sudah dianggap celah
 */
export function nilaiCelahAsuransi(
  polis: Polis[],
  hariIni: string,
  ambangHari: number,
): HasilCelah {
  const total = polis.length
  const aktif = polis.filter((p) => p.status === 'aktif')

  const dasar = { polis: total, polisAktif: aktif.length }

  if (total === 0) {
    return { ...dasar, hariTersisa: null, celah: true, sebab: 'tanpa_polis' }
  }

  /*
    URUTAN SEBAB — tetap, dan sengaja ditulis daripada tersirat.

    Satu proyek bisa memenuhi beberapa celah sekaligus. Yang dipulangkan yang
    PALING MENDESAK, karena tindakannya berbeda:

      tanpa_polis                beli polis
      semua_kadaluarsa           perpanjang, dan proyeknya sedang tak terlindungi
      tak_menanggung_pekerjaan   TAMBAH CAR — polisnya ada, jenisnya yang salah
      segera_berakhir            urus perpanjangan sebelum jatuh tempo

    Yang ketiga ditaruh SESUDAH kadaluarsa karena kadaluarsa berarti tak
    terlindungi SEKARANG, sedangkan salah-jenis berarti tak terlindungi untuk
    SATU KELAS risiko. Keduanya serius; yang pertama lebih segera.
  */
  if (aktif.length === 0) {
    return { ...dasar, hariTersisa: null, celah: true, sebab: 'semua_kadaluarsa' }
  }

  const penanggung = aktif.filter((p) => MENANGGUNG_PEKERJAAN.has(p.jenis))
  if (penanggung.length === 0) {
    return {
      ...dasar, hariTersisa: null, celah: true,
      sebab: 'tak_menanggung_pekerjaan',
    }
  }

  /*
    Sisa hari diambil dari polis penanggung-pekerjaan yang TERJAUH, bukan
    terdekat.

    Proyek boleh punya beberapa CAR bertumpuk (mis. perpanjangan yang sudah
    diterbitkan lebih awal). Memakai yang terdekat akan melaporkan "segera
    berakhir" untuk proyek yang perpanjangannya justru sudah di tangan —
    peringatan palsu yang membuat orang berhenti membacanya.
  */
  const acuan = Date.parse(hariIni + 'T00:00:00Z')
  const HARI = 86_400_000
  let terjauh: number | null = null
  for (const p of penanggung) {
    const t = Date.parse(String(p.periodeSelesai).slice(0, 10) + 'T00:00:00Z')
    if (Number.isNaN(t)) continue
    const sisa = Math.round((t - acuan) / HARI)
    if (terjauh == null || sisa > terjauh) terjauh = sisa
  }

  if (terjauh != null && terjauh <= ambangHari) {
    return { ...dasar, hariTersisa: terjauh, celah: true, sebab: 'segera_berakhir' }
  }

  return { ...dasar, hariTersisa: terjauh, celah: false, sebab: 'terlindungi' }
}
