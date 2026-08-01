/**
 * ASET & ALAT — penyusutan, nilai buku, dan utilisasi (ROADMAP #23).
 *
 * ── Kenapa aritmetikanya dipisah ke lib
 *
 * Penyusutan adalah angka yang MASUK KE BIAYA PROYEK dan, setelah GL dibangun,
 * masuk ke jurnal. Salah sedikit ia tak berbunyi: tak ada error, tak ada baris
 * merah — hanya nilai buku yang perlahan menyimpang dan laporan yang terlihat
 * wajar. Kelas kesalahan yang sama dengan BAC EVM sebelum diperbaiki.
 *
 * Karena itu ia diuji terpisah dari DB, dengan uji mutasi: kalau rumusnya
 * dirusak, test HARUS merah.
 *
 * ── Keputusan yang sengaja diambil
 *
 * **1. Nilai buku tak pernah menembus nilai residu.** Alat yang habis umur
 * ekonomisnya tidak berharga Rp 0 — ia masih bisa dijual. Menyusutkan sampai nol
 * membuat laporan menyatakan perusahaan tak punya apa-apa padahal molen-nya
 * masih di gudang dan laku dijual.
 *
 * **2. Penyusutan dihitung PER BULAN PENUH, tak diprorata harian.** Ini pilihan
 * sadar: PSAK mengizinkan kebijakan bulan-penuh, dan prorata harian menambah
 * ketelitian yang tak dipakai siapa pun sambil memperumit rekonsiliasi jurnal
 * bulanan. Bulan pembelian dihitung penuh.
 *
 * **3. `garis_lurus` dan `saldo_menurun` keduanya didukung**, karena keduanya
 * dipakai di Indonesia: garis lurus untuk pembukuan komersial, saldo menurun
 * ganda sering dipakai mengikuti tarif fiskal. Metode disimpan sebagai SNAPSHOT
 * di tiap baris log — mengubah metode aset tak boleh menulis ulang sejarah.
 *
 * **4. Utilisasi = hari terpakai ÷ hari tersedia**, dan `null` bila aset belum
 * pernah tersedia. Nol akan terbaca "alat menganggur total" — kebalikan dari
 * "belum ada datanya", dan itu memicu keputusan menjual alat yang sebenarnya
 * baru dibeli.
 */

export type MetodeSusut = 'garis_lurus' | 'saldo_menurun'

export interface AsetSusut {
  /** Harga perolehan. */
  hargaPerolehan: number
  /** Nilai sisa saat umur ekonomis habis. Nol bila tak ditetapkan. */
  nilaiResidu?: number
  /** Umur ekonomis dalam BULAN. */
  umurBulan: number
  metode: MetodeSusut
  /** Tanggal perolehan (ISO). Bulan ini dihitung sebagai bulan penuh pertama. */
  tanggalPerolehan: string
}

export interface BarisSusut {
  tahun: number
  bulan: number
  /** Beban penyusutan bulan itu. */
  beban: number
  /** Nilai buku SESUDAH beban bulan itu. */
  nilaiBukuSesudah: number
  /** Akumulasi penyusutan s.d. bulan itu. */
  akumulasi: number
  metode: MetodeSusut
}

const bulat2 = (n: number) => Math.round(n * 100) / 100
const num = (v: number | null | undefined) => Number(v ?? 0) || 0

/**
 * Jumlah bulan dari tanggal perolehan sampai (tahun, bulan) target — inklusif.
 * Bulan perolehan = periode ke-1.
 */
export function periodeKe(tanggalPerolehan: string, tahun: number, bulan: number): number {
  const d = new Date(tanggalPerolehan)
  const th = d.getUTCFullYear()
  const bl = d.getUTCMonth() + 1
  return (tahun - th) * 12 + (bulan - bl) + 1
}

/**
 * Beban penyusutan untuk SATU periode tertentu.
 *
 * Mengembalikan `0` bila periode di luar masa manfaat (sebelum perolehan, atau
 * sesudah umur habis) — bukan melempar error, karena penjadwal bulanan akan
 * memanggilnya untuk semua aset termasuk yang sudah lunas susut.
 */
export function bebanPeriode(a: AsetSusut, tahun: number, bulan: number): number {
  const p = periodeKe(a.tanggalPerolehan, tahun, bulan)
  if (p < 1 || p > a.umurBulan) return 0

  const harga = num(a.hargaPerolehan)
  const residu = num(a.nilaiResidu)
  // Aset yang harga perolehannya tak melebihi residu tak menyusut sama sekali.
  if (harga <= residu) return 0

  if (a.metode === 'garis_lurus') {
    return bulat2((harga - residu) / a.umurBulan)
  }

  // Saldo menurun ganda: tarif = 2 / umur, dikenakan atas NILAI BUKU berjalan.
  // Karena bergantung nilai buku, ia harus diiterasi dari awal — tak ada rumus
  // tertutup yang aman setelah pembatasan residu ikut bermain.
  const tarif = 2 / a.umurBulan
  let buku = harga
  let beban = 0
  for (let i = 1; i <= p; i++) {
    beban = bulat2(buku * tarif)
    // Jangan menembus residu: beban bulan ini dipotong pas sampai residu.
    if (buku - beban < residu) beban = bulat2(buku - residu)
    if (beban < 0) beban = 0
    buku = bulat2(buku - beban)
  }
  return beban
}

/** Jadwal penyusutan penuh sepanjang umur ekonomis. */
export function jadwalSusut(a: AsetSusut): BarisSusut[] {
  const d = new Date(a.tanggalPerolehan)
  const harga = num(a.hargaPerolehan)
  const residu = num(a.nilaiResidu)
  const hasil: BarisSusut[] = []
  let buku = harga
  let akum = 0

  for (let i = 0; i < a.umurBulan; i++) {
    const t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + i, 1))
    const tahun = t.getUTCFullYear()
    const bulan = t.getUTCMonth() + 1

    let beban: number
    if (a.metode === 'garis_lurus') {
      beban = harga <= residu ? 0 : bulat2((harga - residu) / a.umurBulan)
    } else {
      beban = bulat2(buku * (2 / a.umurBulan))
    }
    // Pagar yang sama untuk KEDUA metode: nilai buku tak pernah di bawah residu.
    // Pada garis lurus pun ini perlu — pembulatan per bulan bisa menumpuk
    // beberapa rupiah dan membuat baris terakhir menembus batas.
    if (buku - beban < residu) beban = bulat2(buku - residu)
    if (beban < 0) beban = 0

    buku = bulat2(buku - beban)
    akum = bulat2(akum + beban)
    hasil.push({ tahun, bulan, beban, nilaiBukuSesudah: buku, akumulasi: akum, metode: a.metode })
  }
  return hasil
}

/** Nilai buku pada akhir (tahun, bulan). */
export function nilaiBuku(a: AsetSusut, tahun: number, bulan: number): number {
  const p = periodeKe(a.tanggalPerolehan, tahun, bulan)
  if (p < 1) return bulat2(num(a.hargaPerolehan))
  const jadwal = jadwalSusut(a)
  if (p > jadwal.length) return jadwal[jadwal.length - 1]?.nilaiBukuSesudah ?? 0
  return jadwal[p - 1].nilaiBukuSesudah
}

// ── Utilisasi ───────────────────────────────────────────────────────────────

export interface PeriodePakai {
  /** Mulai dipakai (ISO). */
  mulai: string
  /** Selesai; `null` = masih berjalan. */
  selesai: string | null
}

export interface HasilUtilisasi {
  hariTerpakai: number
  hariTersedia: number
  /** `null` bila aset belum tersedia sama sekali pada rentang ini — BUKAN 0. */
  utilisasiPct: number | null
  /** Menganggur = tersedia tapi tak terpakai. */
  hariMenganggur: number
}

const HARI = 86_400_000

function hariAntara(a: Date, b: Date): number {
  return Math.max(0, Math.round((b.getTime() - a.getTime()) / HARI))
}

/**
 * Utilisasi aset pada rentang [dari, sampai].
 *
 * Periode pakai yang TUMPANG TINDIH dihitung sekali — bukan dijumlahkan.
 * Tanpa itu, satu alat yang tercatat dua kali di hari yang sama menghasilkan
 * utilisasi >100%, angka yang mustahil dan langsung menghancurkan kepercayaan
 * pada seluruh laporan.
 */
export function hitungUtilisasi(
  periode: PeriodePakai[],
  rentang: { dari: string; sampai: string },
  tersediaSejak?: string | null,
): HasilUtilisasi {
  const dari = new Date(rentang.dari)
  const sampai = new Date(rentang.sampai)

  // Aset tak bisa terpakai sebelum ia dimiliki.
  const mulaiTersedia = tersediaSejak && new Date(tersediaSejak) > dari ? new Date(tersediaSejak) : dari
  const hariTersedia = hariAntara(mulaiTersedia, sampai)

  if (hariTersedia <= 0) {
    return { hariTerpakai: 0, hariTersedia: 0, utilisasiPct: null, hariMenganggur: 0 }
  }

  // Gabungkan rentang tumpang tindih sebelum menjumlah.
  const potong = periode
    .map((p) => {
      const a = new Date(p.mulai) < mulaiTersedia ? mulaiTersedia : new Date(p.mulai)
      const b = p.selesai == null || new Date(p.selesai) > sampai ? sampai : new Date(p.selesai)
      return { a, b }
    })
    .filter((p) => p.b > p.a)
    .sort((x, y) => x.a.getTime() - y.a.getTime())

  const gabung: { a: Date; b: Date }[] = []
  for (const p of potong) {
    const akhir = gabung[gabung.length - 1]
    if (akhir && p.a <= akhir.b) {
      if (p.b > akhir.b) akhir.b = p.b
    } else {
      gabung.push({ ...p })
    }
  }

  const hariTerpakai = gabung.reduce((s, p) => s + hariAntara(p.a, p.b), 0)
  return {
    hariTerpakai,
    hariTersedia,
    utilisasiPct: bulat2((hariTerpakai / hariTersedia) * 100),
    hariMenganggur: Math.max(0, hariTersedia - hariTerpakai),
  }
}

// ── Sewa ────────────────────────────────────────────────────────────────────

export interface BarisSewa {
  /** Tarif per satuan waktu. */
  tarif: number
  satuan: 'hari' | 'minggu' | 'bulan'
  mulai: string
  selesai: string | null
}

/**
 * Biaya sewa sampai tanggal acuan. Sewa berjalan (selesai=null) dihitung
 * sampai `hingga` — supaya biaya yang SEDANG berjalan ikut terlihat, bukan
 * muncul mendadak saat sewanya diakhiri.
 */
export function biayaSewa(s: BarisSewa, hingga: string): number {
  const mulai = new Date(s.mulai)
  const akhirRaw = s.selesai ? new Date(s.selesai) : new Date(hingga)
  const akhir = akhirRaw > new Date(hingga) ? new Date(hingga) : akhirRaw
  const hari = hariAntara(mulai, akhir)
  if (hari <= 0) return 0

  // Satuan minggu/bulan DIBULATKAN KE ATAS — begitulah tagihan sewa alat
  // bekerja: menyewa 8 hari dengan tarif mingguan dibayar 2 minggu, bukan 1,14.
  const pembagi = s.satuan === 'hari' ? 1 : s.satuan === 'minggu' ? 7 : 30
  const satuan = s.satuan === 'hari' ? hari : Math.ceil(hari / pembagi)
  return bulat2(satuan * num(s.tarif))
}
