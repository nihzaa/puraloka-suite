/**
 * JADWAL LAPORAN — mana yang JATUH TEMPO dikirim sekarang.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * KENAPA BERKAS INI ADA
 * ══════════════════════════════════════════════════════════════════════════
 *
 * `jadwal_distribusi_laporan` sudah menyimpan irama, hari, dan jam sejak
 * awal, dan `nilaiJadwalLaporan` sudah bisa menyatakan mana yang MACET.
 * Yang tak pernah ada: apa pun yang benar-benar MENGIRIM.
 *
 * Jadi kolom `terakhir_dikirim` selamanya NULL, dan deteksi macet — yang
 * membandingkan umur kirim dengan iramanya — melaporkan seluruh jadwal
 * sebagai macet begitu lewat dua kali iramanya. Peringatan yang benar untuk
 * sebab yang salah: bukan penjadwalnya yang mati, melainkan pengirimnya yang
 * tak pernah ditulis.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * TIGA KEPUTUSAN YANG MENENTUKAN, DAN SEMUANYA TENTANG WAKTU
 * ══════════════════════════════════════════════════════════════════════════
 *
 * ── 1. Jam disimpan sebagai waktu LOKAL, dibandingkan sebagai waktu lokal
 *
 * `jam` bertipe `time without time zone` dan diisi orang dari layar di
 * Indonesia. Membandingkannya dengan `new Date().getUTCHours()` menggeser
 * seluruh jadwal tujuh jam — laporan "jam 7 pagi" terkirim tengah malam, dan
 * yang menerimanya menyimpulkan sistemnya rusak.
 *
 * Karena itu pemanggil menyerahkan waktu lokal (`YYYY-MM-DD` + `HH:MM`) yang
 * SUDAH dikonversi ke zona perusahaan, dan berkas ini tak pernah menyentuh
 * `Date` sama sekali. Fungsi yang membaca jam mesin tak bisa diuji, dan yang
 * tak bisa diuji di sini adalah persis hal yang salah diam-diam.
 *
 * ── 2. Yang TERLEWAT tetap dikirim, tidak dilompati
 *
 * Penjadwal berdenyut tiap 15 menit dan bisa mati semalaman. Jadwal jam 07:00
 * yang baru diperiksa jam 09:00 TETAP jatuh tempo — melompatinya berarti
 * laporan hari itu hilang tanpa jejak, dan yang menunggunya tak diberi tahu.
 *
 * Yang mencegah pengiriman berulang bukan jam, melainkan `terakhir_dikirim`:
 * satu kali per periode, dan periodenya ditentukan iramanya.
 *
 * ── 3. `hari_ke` untuk mingguan adalah 1=Senin, BUKAN 0=Minggu
 *
 * `Date.getDay()` memakai 0=Minggu. Layar Indonesia menulis Senin sebagai
 * hari pertama. Menyamakan keduanya menggeser tiap jadwal mingguan satu hari
 * — cukup untuk membuat laporan Jumat terkirim Sabtu, dan tak cukup mencolok
 * untuk segera ketahuan.
 */

export type IramaLaporan = 'harian' | 'mingguan' | 'bulanan'

export interface JadwalKirim {
  id: string
  nama: string
  jenis_laporan: string
  irama: string
  /** Mingguan: 1=Senin … 7=Minggu. Bulanan: 1–31. Harian: diabaikan. */
  hari_ke?: number | string | null
  /** `HH:MM` atau `HH:MM:SS` — waktu LOKAL perusahaan. */
  jam: string
  aktif: boolean
  terakhir_dikirim?: string | null
}

export interface SaatLokal {
  /** `YYYY-MM-DD` waktu lokal perusahaan. */
  tanggal: string
  /** `HH:MM` waktu lokal perusahaan. */
  jam: string
}

export type AlasanLewat =
  | 'nonaktif'
  | 'belum-harinya'
  | 'belum-jamnya'
  | 'sudah-dikirim-periode-ini'

export interface Verdict {
  jadwal: JadwalKirim
  kirim: boolean
  /** Sebab dilewati. `null` bila jatuh tempo. */
  alasan: AlasanLewat | null
}

/** `HH:MM:SS` → menit sejak tengah malam. Sampah → null. */
export function keMenit(jam: string): number | null {
  const m = /^(\d{1,2}):(\d{2})(?::(\d{2}))?$/.exec((jam ?? '').trim())
  if (!m) return null
  const h = Number(m[1]); const mnt = Number(m[2])
  if (h > 23 || mnt > 59) return null
  return h * 60 + mnt
}

/**
 * Hari dalam minggu gaya Indonesia: 1=Senin … 7=Minggu.
 *
 * Dihitung dari tanggal ISO tanpa `Date`, memakai algoritma Sakamoto —
 * `new Date('2026-08-16').getDay()` menafsirkan string itu sebagai UTC lalu
 * memulangkan hari menurut zona MESIN, dan mesin CI berzona UTC sementara
 * penggunanya tidak.
 */
export function hariMingguIso(tanggal: string): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec((tanggal ?? '').trim())
  if (!m) return null
  let y = Number(m[1]); const bl = Number(m[2]); const hr = Number(m[3])
  if (bl < 1 || bl > 12 || hr < 1 || hr > 31) return null

  const t = [0, 3, 2, 5, 0, 3, 5, 1, 4, 6, 2, 4]
  if (bl < 3) y -= 1
  const minggu = (y + Math.floor(y / 4) - Math.floor(y / 100) + Math.floor(y / 400)
    + t[bl - 1] + hr) % 7          // 0=Minggu … 6=Sabtu
  return minggu === 0 ? 7 : minggu // 1=Senin … 7=Minggu
}

/** Hari terakhir bulan itu — 28/29/30/31. */
export function hariTerakhirBulan(tanggal: string): number | null {
  const m = /^(\d{4})-(\d{2})-\d{2}$/.exec((tanggal ?? '').trim())
  if (!m) return null
  const y = Number(m[1]); const bl = Number(m[2])
  if (bl < 1 || bl > 12) return null
  const panjang = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
  if (bl === 2 && ((y % 4 === 0 && y % 100 !== 0) || y % 400 === 0)) return 29
  return panjang[bl - 1]
}

/**
 * Awal periode berjalan menurut irama — dipakai memastikan SATU KALI kirim.
 *
 * Dipulangkan sebagai `YYYY-MM-DD`. Laporan mingguan yang sudah terkirim hari
 * Senin tak boleh terkirim lagi hari Rabu meski penjadwal baru bangun.
 */
export function awalPeriode(tanggal: string, irama: string): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec((tanggal ?? '').trim())
  if (!m) return null

  if (irama === 'harian') return tanggal
  if (irama === 'bulanan') return `${m[1]}-${m[2]}-01`

  // Mingguan: mundur ke Senin.
  const hm = hariMingguIso(tanggal)
  if (hm === null) return null
  return geserHari(tanggal, -(hm - 1))
}

/** Geser tanggal ISO sejumlah hari, tanpa `Date` dan tanpa zona waktu. */
export function geserHari(tanggal: string, delta: number): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec((tanggal ?? '').trim())
  if (!m) return null
  let y = Number(m[1]); let bl = Number(m[2]); let hr = Number(m[3]) + delta

  while (hr < 1) {
    bl -= 1
    if (bl < 1) { bl = 12; y -= 1 }
    hr += hariTerakhirBulan(`${y}-${String(bl).padStart(2, '0')}-01`)!
  }
  for (;;) {
    const panjang = hariTerakhirBulan(`${y}-${String(bl).padStart(2, '0')}-01`)!
    if (hr <= panjang) break
    hr -= panjang
    bl += 1
    if (bl > 12) { bl = 1; y += 1 }
  }
  return `${y}-${String(bl).padStart(2, '0')}-${String(hr).padStart(2, '0')}`
}

/**
 * Apakah satu jadwal jatuh tempo dikirim pada saat ini?
 *
 * Urutan pemeriksaannya menentukan sebab yang dilaporkan, dan sebab itulah
 * yang dibaca orang saat bertanya "kenapa laporan saya tak datang".
 */
export function periksaJatuhTempo(j: JadwalKirim, kini: SaatLokal): Verdict {
  const lewat = (alasan: AlasanLewat): Verdict => ({ jadwal: j, kirim: false, alasan })

  if (!j.aktif) return lewat('nonaktif')

  const irama = j.irama
  const hariKe = j.hari_ke == null || j.hari_ke === '' ? null : Number(j.hari_ke)

  if (irama === 'mingguan') {
    const hm = hariMingguIso(kini.tanggal)
    // `hari_ke` KOSONG pada jadwal mingguan berarti belum ditentukan harinya.
    // Menebaknya Senin membuat laporan datang di hari yang tak pernah
    // disepakati siapa pun; jadwal itu ditahan sampai harinya diisi.
    if (hm === null || hariKe === null || hm !== hariKe) return lewat('belum-harinya')
  }

  if (irama === 'bulanan') {
    const akhir = hariTerakhirBulan(kini.tanggal)
    const hr = Number(kini.tanggal.slice(8, 10))
    if (hariKe === null) return lewat('belum-harinya')
    // Tanggal 31 di bulan berhari 30 JATUH KE HARI TERAKHIR, bukan hilang.
    // Melompatinya membuat laporan bulanan absen di empat bulan setahun, dan
    // absennya tak meninggalkan satu pun jejak.
    const sasaran = akhir !== null && hariKe > akhir ? akhir : hariKe
    if (hr !== sasaran) return lewat('belum-harinya')
  }

  const jamJadwal = keMenit(j.jam)
  const jamKini = keMenit(kini.jam)
  // Jam yang tak terbaca DITAHAN, bukan diloloskan. Fail-closed: laporan yang
  // terkirim pada jam yang tak pernah disetel lebih buruk daripada yang tak
  // terkirim, karena yang pertama tak menimbulkan pertanyaan.
  if (jamJadwal === null || jamKini === null) return lewat('belum-jamnya')
  if (jamKini < jamJadwal) return lewat('belum-jamnya')

  // Sudah pernah terkirim di periode yang SAMA? Ini satu-satunya yang
  // mencegah pengiriman berulang — bukan jam, karena yang terlewat memang
  // sengaja tetap dikirim.
  if (j.terakhir_dikirim) {
    const tglKirim = String(j.terakhir_dikirim).slice(0, 10)
    const awalKini = awalPeriode(kini.tanggal, irama)
    if (awalKini !== null && tglKirim >= awalKini) {
      return lewat('sudah-dikirim-periode-ini')
    }
  }

  return { jadwal: j, kirim: true, alasan: null }
}

/** Saring seluruh jadwal; yang dilewati tetap dipulangkan beserta sebabnya. */
export function pilihJatuhTempo(
  daftar: JadwalKirim[],
  kini: SaatLokal,
): { kirim: JadwalKirim[]; lewat: Verdict[] } {
  const semua = daftar.map((j) => periksaJatuhTempo(j, kini))
  return {
    kirim: semua.filter((v) => v.kirim).map((v) => v.jadwal),
    // Yang dilewati TIDAK dibuang. "Kenapa laporan saya tak datang" adalah
    // pertanyaan yang pasti muncul, dan jawabannya harus ada di log —
    // bukan disimpulkan dari ketiadaan baris.
    lewat: semua.filter((v) => !v.kirim),
  }
}
