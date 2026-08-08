/**
 * KALENDER BULANAN — menyusun kisi tanggal, dan menandai hari yang PUNYA ISI.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * KENAPA INI PERHITUNGAN, BUKAN KOMPONEN
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Kisi kalender terlihat sepele sampai ditulis. Yang membuatnya salah nyaris
 * selalu hal yang sama, dan semuanya diam-diam:
 *
 *   - **Minggu mulai Senin**, bukan Minggu. `getDay()` mengembalikan 0 untuk
 *     Minggu, jadi tiap kisi yang memakainya mentah bergeser satu kolom untuk
 *     SELURUH bulan — dan pergeseran itu terlihat "rapi", cuma tanggalnya
 *     salah hari.
 *   - **Zona waktu.** `new Date('2026-08-01')` diurai sebagai UTC, dan di
 *     Asia/Jakarta (UTC+7) ia bisa jatuh ke tanggal SEBELUMNYA saat
 *     dirender lokal. Titik penanda lalu muncul di kotak yang salah.
 *   - **Bulan pendek/panjang** dan tahun kabisat: Februari 2028 punya 29 hari.
 *
 * Karena itu logikanya dipisah dari JSX dan diuji. Komponen yang menghitung
 * tanggal di dalam `map()` tak bisa diuji tanpa merender, dan cacat sehari
 * geser tak pernah tertangkap dengan melihat sekilas.
 *
 * ── Titik penanda: kenapa hanya ADA/TIDAK, bukan jumlahnya
 *
 * Referensi memberi titik kecil di bawah tanggal. Ia menjawab "hari mana yang
 * ramai", bukan "berapa persisnya" — dan angka di kotak selebar 28px akan jadi
 * bubur. Daftar lengkapnya sudah ada tepat di bawah kalender.
 */

/** Satu kotak di kisi. `null` = sel kosong sebelum tanggal 1 / sesudah akhir bulan. */
export interface SelKalender {
  tanggal: number | null
  /** `YYYY-MM-DD` — kunci pencocokan peristiwa. `null` untuk sel kosong. */
  iso: string | null
  hariIni: boolean
  /** Ada peristiwa (milestone) pada hari itu. */
  berisi: boolean
}

export interface Kisi {
  /** 42 sel = 6 baris x 7 hari. Tetap, supaya tinggi kartu tak melompat antar bulan. */
  sel: SelKalender[]
  /** Contoh: "Agustus 2026". */
  judul: string
}

const BULAN_ID = [
  'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
  'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember',
]

/** Kepala kolom, Senin dulu — konvensi kalender Indonesia. */
export const HARI_ID = ['Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab', 'Min']

/**
 * `YYYY-MM-DD` dari komponen tanggal LOKAL.
 *
 * Sengaja tidak memakai `toISOString()`: itu mengonversi ke UTC lebih dulu,
 * sehingga di Asia/Jakarta tanggal 1 pukul 00:00 lokal menjadi "31" bulan
 * sebelumnya. Inilah sumber cacat "titiknya geser sehari".
 */
function isoLokal(t: number, b: number, h: number): string {
  return `${t}-${String(b + 1).padStart(2, '0')}-${String(h).padStart(2, '0')}`
}

/**
 * Menyusun kisi satu bulan.
 *
 * @param acuan   tanggal mana pun di dalam bulan yang ingin ditampilkan
 * @param tanggalBerisi  daftar `YYYY-MM-DD` yang punya peristiwa
 * @param hariIni disuntik di test supaya hasilnya tak bergantung kapan dijalankan
 */
export function susunKisi(
  acuan: Date,
  tanggalBerisi: readonly string[] = [],
  hariIni: Date = new Date(),
): Kisi {
  const tahun = acuan.getFullYear()
  const bulan = acuan.getMonth()

  const berisi = new Set(tanggalBerisi.filter(Boolean))
  const isoHariIni = isoLokal(hariIni.getFullYear(), hariIni.getMonth(), hariIni.getDate())

  // Hari pertama bulan, digeser supaya SENIN = 0 (getDay(): Minggu = 0).
  const hariPertama = (new Date(tahun, bulan, 1).getDay() + 6) % 7
  // Hari ke-0 bulan berikutnya = hari terakhir bulan ini. Menangani kabisat sendiri.
  const jumlahHari = new Date(tahun, bulan + 1, 0).getDate()

  const sel: SelKalender[] = []
  for (let i = 0; i < 42; i++) {
    const tgl = i - hariPertama + 1
    if (tgl < 1 || tgl > jumlahHari) {
      sel.push({ tanggal: null, iso: null, hariIni: false, berisi: false })
      continue
    }
    const iso = isoLokal(tahun, bulan, tgl)
    sel.push({ tanggal: tgl, iso, hariIni: iso === isoHariIni, berisi: berisi.has(iso) })
  }

  return { sel, judul: `${BULAN_ID[bulan]} ${tahun}` }
}

/**
 * Mengambil bagian tanggal dari nilai apa pun yang datang dari API.
 *
 * API mengirim `date` (`2026-08-20`) maupun `timestamptz`
 * (`2026-08-20T00:00:00+07:00`). Dipotong 10 karakter pertama, BUKAN diurai
 * jadi `Date` lalu diformat ulang — penguraian itu justru yang memindahkan
 * tanggal antar zona waktu.
 */
export function kunciTanggal(nilai: string | null | undefined): string | null {
  if (typeof nilai !== 'string' || nilai.length < 10) return null
  const potong = nilai.slice(0, 10)
  return /^\d{4}-\d{2}-\d{2}$/.test(potong) ? potong : null
}
