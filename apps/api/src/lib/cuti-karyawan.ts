// CUTI & IZIN KARYAWAN (G2d).
//
// ══════════════════════════════════════════════════════════════════════════
// DUA ATURAN YANG MENENTUKAN KEBENARAN ANGKANYA
// ══════════════════════════════════════════════════════════════════════════
//
// ── 1. Saldo DITURUNKAN dari transaksi, tak pernah disimpan
//
// Kolom `sisa_cuti` yang di-UPDATE tiap pengajuan akan menyimpang diam-diam
// dari riwayatnya: satu update yang gagal separuh, satu pembatalan yang lupa
// mengembalikan, satu koreksi manual — dan angkanya tak lagi cocok dengan
// daftar cutinya sendiri.
//
// Yang paling berkepentingan angkanya benar adalah karyawan, dan ia tak punya
// cara memeriksa. Karena itu saldo = SUM(hak) − SUM(ambil disetujui), selalu
// bisa ditelusuri ke barisnya.
//
// ── 2. Jumlah hari DIHITUNG SEKALI saat diajukan, lalu DISIMPAN
//
// Berlawanan dengan aturan pertama, dan sengaja. Jumlah hari cuti bergantung
// pada kalender libur YANG BERLAKU SAAT ITU — dan kalender bisa berubah:
// cuti bersama sering diumumkan pemerintah di tengah tahun.
//
// Kalau jumlahnya dihitung ulang saat dibaca, cuti yang sudah disetujui
// tiba-tiba memakan jatah yang berbeda dari yang disepakati. Pola yang sama
// dengan slip gaji (G2c): yang sudah diputuskan tidak berubah sendiri.
//
// ── Kenapa hanya `tahunan` yang memakan jatah
//
// Sakit, melahirkan, cuti penting, dan cuti besar adalah hak yang TERPISAH
// dari jatah tahunan — dan memotongnya dari jatah berarti karyawan yang sakit
// kehilangan liburannya. Cuti tanpa gaji memotong gaji, bukan jatah.
//
// Menghitung semuanya dari jatah adalah kesalahan yang merugikan karyawan
// secara diam-diam, dan ia baru menyadarinya saat mengajukan cuti tahunan dan
// ditolak karena "jatah habis".

export type JenisCuti =
  | 'tahunan' | 'sakit' | 'melahirkan' | 'penting' | 'besar' | 'tanpa_gaji'
export type StatusCuti = 'diajukan' | 'disetujui' | 'ditolak' | 'dibatalkan'

/** Jenis yang MEMAKAN jatah tahunan. Hanya satu — lihat kepala berkas. */
export const MEMAKAI_JATAH: ReadonlyArray<JenisCuti> = ['tahunan']

export interface BarisHak {
  id: string
  tahun: number
  /** `numeric` dari Postgres tiba sebagai string. Bisa NEGATIF (koreksi). */
  jumlah_hari: number | string
  alasan: string
  berlaku_sampai: string | null
}

export interface BarisAmbil {
  id: string
  jenis: JenisCuti
  tanggal_mulai: string
  tanggal_selesai: string
  jumlah_hari: number | string
  status: StatusCuti
  alasan: string | null
  alasan_tolak: string | null
  hari_dilewati: string | null
}

/** Angka dari Postgres. NaN, string kosong, dan sampah jadi `null`. */
export function angka(v: unknown): number | null {
  if (v === null || v === undefined) return null
  if (typeof v === 'number') return Number.isFinite(v) ? v : null
  // `Number('')` adalah 0, bukan NaN — pelajaran G2a.
  const s = String(v).trim()
  if (s === '') return null
  const n = Number(s)
  return Number.isFinite(n) ? n : null
}

/** `YYYY-MM-DD` → hari dalam minggu (0 Minggu … 6 Sabtu), bebas zona waktu. */
function hariDalamMinggu(iso: string): number {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay()
}

/** Daftar tanggal `YYYY-MM-DD` dari awal sampai akhir (inklusif). */
export function rentangTanggal(awal: string, akhir: string): string[] {
  const hasil: string[] = []
  const [ya, ma, da] = awal.split('-').map(Number)
  const [yz, mz, dz] = akhir.split('-').map(Number)
  let t = Date.UTC(ya, ma - 1, da)
  const habis = Date.UTC(yz, mz - 1, dz)
  // Rentang terbalik → daftar kosong, bukan perulangan tak berujung.
  while (t <= habis) {
    hasil.push(new Date(t).toISOString().slice(0, 10))
    t += 86400000
  }
  return hasil
}

export interface HariLibur {
  /** `YYYY-MM-DD`. */
  tanggal: string
  nama: string
  /** `true` = tetap masuk kerja meski libur (mis. proyek yang jalan terus). */
  tetap_bekerja: boolean
}

export interface HitungHari {
  /** Hari kerja yang benar-benar terpakai — inilah yang mengurangi jatah. */
  jumlah_hari: number
  /** Tanggal yang DILEWATI beserta sebabnya, untuk dijelaskan di layar. */
  dilewati: Array<{ tanggal: string; sebab: string }>
  /** Total tanggal dalam rentang, termasuk yang dilewati. */
  total_tanggal: number
}

/**
 * Hitung berapa HARI KERJA yang terpakai sebuah rentang cuti.
 *
 * INVARIAN yang diuji (`__tests__/cuti-karyawan.test.ts`):
 *  1. akhir pekan TIDAK dihitung — cuti Jumat–Senin adalah 2 hari, bukan 4
 *  2. hari libur nasional TIDAK dihitung
 *  3. libur yang `tetap_bekerja` TETAP dihitung — ia bukan libur bagi yang
 *     tetap masuk
 *  4. tanggal yang dilewati dikembalikan BESERTA sebabnya, supaya pegawai
 *     yang bertanya "kenapa cuma 3 hari" bisa dijawab dari layarnya
 *  5. rentang yang seluruhnya libur menghasilkan 0 — dan pemanggilnya WAJIB
 *     menolaknya (constraint DB juga menolak `jumlah_hari = 0`)
 */
export function hitungHariCuti(
  awal: string,
  akhir: string,
  libur: HariLibur[],
): HitungHari {
  const petaLibur = new Map(libur.map((l) => [l.tanggal, l]))
  const tanggal = rentangTanggal(awal, akhir)
  const dilewati: Array<{ tanggal: string; sebab: string }> = []
  let hari = 0

  for (const t of tanggal) {
    const h = hariDalamMinggu(t)
    if (h === 0 || h === 6) {
      dilewati.push({ tanggal: t, sebab: h === 0 ? 'Minggu' : 'Sabtu' })
      continue
    }
    const l = petaLibur.get(t)
    // `tetap_bekerja` = tetap masuk meski tanggal merah. Bagi yang bekerja
    // hari itu, cuti di tanggal tersebut MEMAKAN jatah — memperlakukannya
    // sebagai libur memberi cuti gratis yang tak pernah diputuskan siapa pun.
    if (l && !l.tetap_bekerja) {
      dilewati.push({ tanggal: t, sebab: l.nama })
      continue
    }
    hari += 1
  }

  return { jumlah_hari: hari, dilewati, total_tanggal: tanggal.length }
}

export interface SaldoCuti {
  tahun: number
  hak: number
  terpakai: number
  /** Yang sudah diajukan tapi BELUM diputuskan — menahan jatah. */
  tertahan: number
  /** hak − terpakai − tertahan. Bisa negatif kalau jatah terlanjur terpakai. */
  sisa: number
}

/**
 * Saldo cuti tahunan, DITURUNKAN dari transaksi.
 *
 * INVARIAN yang diuji:
 *  1. hanya jenis yang MEMAKAI JATAH (`tahunan`) yang mengurangi — sakit dan
 *     melahirkan tidak
 *  2. hanya status `disetujui` yang masuk `terpakai`; `diajukan` masuk
 *     `tertahan` TERPISAH
 *  3. `ditolak` dan `dibatalkan` TIDAK mengurangi apa pun
 *  4. hak NEGATIF (koreksi) ikut dijumlahkan — itulah gunanya
 *  5. sisa boleh NEGATIF, dan itu harus terlihat bukan dipotong ke nol
 */
export function hitungSaldo(
  hak: BarisHak[],
  ambil: BarisAmbil[],
  tahun: number,
): SaldoCuti {
  const totalHak = hak
    .filter((h) => h.tahun === tahun)
    .reduce((s, h) => s + (angka(h.jumlah_hari) ?? 0), 0)

  const relevan = ambil.filter((a) => MEMAKAI_JATAH.includes(a.jenis))

  const terpakai = relevan
    .filter((a) => a.status === 'disetujui')
    .reduce((s, a) => s + (angka(a.jumlah_hari) ?? 0), 0)

  // Yang diajukan tapi belum diputuskan MENAHAN jatah — kalau tidak, pegawai
  // bisa mengajukan tiga kali jatah penuh sebelum satu pun diputuskan.
  const tertahan = relevan
    .filter((a) => a.status === 'diajukan')
    .reduce((s, a) => s + (angka(a.jumlah_hari) ?? 0), 0)

  return {
    tahun,
    hak: totalHak,
    terpakai,
    tertahan,
    // Boleh NEGATIF. Memotongnya ke nol menyembunyikan jatah yang terlanjur
    // terpakai berlebih — dan itu justru yang perlu dilihat.
    sisa: totalHak - terpakai - tertahan,
  }
}

export interface PenghalangCuti {
  kode: 'saldo-kurang' | 'tumpang-tindih' | 'nol-hari' | 'rentang-terbalik'
  pesan: string
  /** Pengajuan lain yang bertabrakan, bila kodenya `tumpang-tindih`. */
  bentrok?: BarisAmbil[]
}

/**
 * Boleh tidaknya sebuah pengajuan cuti dibuat.
 *
 * INVARIAN yang diuji:
 *  1. rentang yang seluruhnya libur → `nol-hari`, bukan diterima sebagai 0
 *  2. tumpang tindih dengan pengajuan lain yang masih hidup (diajukan ATAU
 *     disetujui) ditolak — ditolak/dibatalkan tidak menghalangi
 *  3. saldo kurang HANYA menghalangi jenis yang memakai jatah
 *  4. saldo kurang menyebut angkanya, bukan sekadar "tidak cukup"
 */
export function bolehAjukan(
  jenis: JenisCuti,
  awal: string,
  akhir: string,
  hitung: HitungHari,
  saldo: SaldoCuti,
  cutiLain: BarisAmbil[],
): { boleh: boolean; penghalang: PenghalangCuti[] } {
  const penghalang: PenghalangCuti[] = []

  if (akhir < awal) {
    penghalang.push({
      kode: 'rentang-terbalik',
      pesan: 'Tanggal selesai mendahului tanggal mulai.',
    })
    return { boleh: false, penghalang }
  }

  if (hitung.jumlah_hari <= 0) {
    penghalang.push({
      kode: 'nol-hari',
      pesan: 'Rentang ini tak memuat satu pun hari kerja — seluruhnya akhir pekan '
        + 'atau hari libur, jadi tak ada yang perlu diajukan.',
    })
  }

  // Hanya yang masih HIDUP yang menghalangi. Yang ditolak atau dibatalkan
  // tak lagi memesan tanggal itu.
  const bentrok = cutiLain.filter((a) =>
    (a.status === 'diajukan' || a.status === 'disetujui')
    && a.tanggal_mulai <= akhir && a.tanggal_selesai >= awal)
  if (bentrok.length > 0) {
    penghalang.push({
      kode: 'tumpang-tindih',
      pesan: `Bertabrakan dengan ${bentrok.length} pengajuan cuti yang masih berlaku.`,
      bentrok,
    })
  }

  // Saldo hanya mengikat jenis yang memakai jatah. Menolak cuti sakit karena
  // "jatah habis" adalah kesalahan yang merugikan karyawan.
  if (MEMAKAI_JATAH.includes(jenis) && hitung.jumlah_hari > saldo.sisa) {
    penghalang.push({
      kode: 'saldo-kurang',
      pesan: `Sisa jatah ${saldo.sisa} hari, pengajuan ini ${hitung.jumlah_hari} hari.`
        + (saldo.tertahan > 0
          ? ` (${saldo.tertahan} hari sedang menunggu putusan dan ikut menahan jatah.)`
          : ''),
    })
  }

  return { boleh: penghalang.length === 0, penghalang }
}
