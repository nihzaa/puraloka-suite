// CPM & KALENDER KERJA — jalur kritis, float, dan histogram. PURE, tanpa I/O.
//
// ════════════════════════════════════════════════════════════════════════════
// EMPAT HAL YANG MODUL INI TOLAK TAMPILKAN SEBAGAI KABAR BAIK
// ════════════════════════════════════════════════════════════════════════════
//
// 1. **Durasi yang dihitung dari hari KALENDER.** Pekerjaan 20 hari yang
//    dimulai Senin selesai bukan 20 hari kemudian: ada 6 hari Minggu dan
//    mungkin Lebaran di antaranya. Selisih inilah yang jadi sengketa denda
//    keterlambatan — dan pihak yang menghitung dengan hari kalender selalu
//    yang membayar.
//
// 2. **Jadwal yang "aman" karena lingkarannya tak terlihat.** A menunggu B,
//    B menunggu C, C menunggu A. Tak ada yang bisa dimulai, tapi tampilan
//    daftar tetap rapi. Algoritme naif akan berputar selamanya atau — lebih
//    buruk — berhenti dan melaporkan jadwal yang setengah terhitung sebagai
//    hasil yang sah. Di sini lingkarannya DINYATAKAN, dan sisa perhitungannya
//    ditolak.
//
// 3. **Float yang dihitung tanpa tanggal target proyek.** Tanpa batas akhir,
//    "sisa kelonggaran" hanyalah selisih terhadap jalur terpanjang — dan
//    setiap pekerjaan di jalur itu terlihat kritis meski proyeknya masih
//    punya dua bulan cadangan.
//
// 4. **Histogram sumber daya yang meratakan puncak.** 40 tukang di minggu 7
//    dan 4 tukang di minggu 8 punya rata-rata 22 — angka yang tak pernah
//    terjadi, dan yang menyembunyikan bahwa minggu 7 kekurangan 15 orang.

/** Ubah NUMERIC-dari-Postgres (string) atau number jadi number. */
function angka(v: number | string | null | undefined): number | null {
  if (v === null || v === undefined || v === '') return null
  const n = typeof v === 'number' ? v : Number(v)
  return Number.isFinite(n) ? n : null
}

// ── Kalender kerja ──────────────────────────────────────────────────────────

export interface PolaKerja {
  senin?: boolean; selasa?: boolean; rabu?: boolean; kamis?: boolean
  jumat?: boolean; sabtu?: boolean; minggu?: boolean
  jam_per_hari?: number | string | null
}

/** Pola paling umum di proyek konstruksi Indonesia. */
export const POLA_BAKU: Required<Omit<PolaKerja, 'jam_per_hari'>> = {
  senin: true, selasa: true, rabu: true, kamis: true,
  jumat: true, sabtu: true, minggu: false,
}

export interface HariLibur {
  tanggal: string
  /** Libur yang justru dikerjakan (lembur terencana) — tetap hari kerja. */
  tetap_bekerja?: boolean | null
}

/** Indeks 0=Minggu … 6=Sabtu, mengikuti `Date.getUTCDay()`. */
const URUT_HARI = ['minggu', 'senin', 'selasa', 'rabu', 'kamis', 'jumat', 'sabtu'] as const

export interface Kalender {
  /** `true` bila tanggal itu hari kerja. */
  hariKerja(tanggal: string): boolean
  /** Tanggal kerja ke-`n` sesudah `dari` (n=0 → `dari` itu sendiri bila kerja). */
  majuHariKerja(dari: string, n: number): string
  /** Jumlah HARI KERJA dari `a` sampai `b` inklusif. */
  hitungHariKerja(a: string, b: string): number
}

/**
 * Bangun kalender kerja dari pola mingguan + daftar libur.
 *
 * Libur ber-`tetap_bekerja` TIDAK dikeluarkan dari hari kerja: jejaknya tetap
 * ada bahwa hari itu semestinya libur (yang menentukan tarif upah), tapi
 * jadwalnya tetap berjalan.
 */
export function buatKalender(pola: PolaKerja | null | undefined, libur: HariLibur[] = []): Kalender {
  const p = { ...POLA_BAKU, ...(pola ?? {}) }
  const liburSet = new Set(
    libur.filter((l) => l.tetap_bekerja !== true).map((l) => l.tanggal.slice(0, 10)))

  const hariKerja = (t: string): boolean => {
    const d = new Date(t.slice(0, 10) + 'T00:00:00Z')
    if (Number.isNaN(d.getTime())) return false
    if (liburSet.has(t.slice(0, 10))) return false
    return p[URUT_HARI[d.getUTCDay()]] === true
  }

  // Pola tanpa satu pun hari kerja membuat SETIAP pencarian berputar
  // selamanya. Constraint DB menolaknya, tapi pustaka ini juga dipanggil
  // dengan data yang belum tentu lewat DB.
  const adaHariKerja = URUT_HARI.some((h) => p[h] === true)

  const majuHariKerja = (dari: string, n: number): string => {
    if (!adaHariKerja) return dari
    const d = new Date(dari.slice(0, 10) + 'T00:00:00Z')
    let sisa = n
    // n=0 berarti "hari kerja pertama pada atau sesudah `dari`".
    while (!hariKerja(iso(d))) d.setUTCDate(d.getUTCDate() + 1)
    while (sisa > 0) {
      d.setUTCDate(d.getUTCDate() + 1)
      if (hariKerja(iso(d))) sisa--
    }
    return iso(d)
  }

  const hitungHariKerja = (a: string, b: string): number => {
    if (!adaHariKerja) return 0
    const mulai = new Date(a.slice(0, 10) + 'T00:00:00Z')
    const akhir = new Date(b.slice(0, 10) + 'T00:00:00Z')
    if (akhir < mulai) return 0
    let n = 0
    for (const d = mulai; d <= akhir; d.setUTCDate(d.getUTCDate() + 1)) {
      if (hariKerja(iso(d))) n++
    }
    return n
  }

  return { hariKerja, majuHariKerja, hitungHariKerja }
}

const iso = (d: Date) => d.toISOString().slice(0, 10)

// ── CPM ─────────────────────────────────────────────────────────────────────

export type JenisRelasi = 'FS' | 'SS' | 'FF' | 'SF'

export interface Dependensi {
  milestone_id: string
  bergantung_pada: string
  jenis?: JenisRelasi | null
  jeda_hari?: number | string | null
}

export interface Pekerjaan {
  id: string
  title?: string | null
  /** Durasi dalam HARI KERJA. */
  durasi_hari?: number | string | null
  /** Tanggal mulai yang dipaksakan (constraint), bila ada. */
  mulai_paksa?: string | null
  target_date?: string | null
}

export interface HasilPekerjaan {
  id: string
  nama: string
  durasi: number
  /** Earliest start / finish — sesudah kalender diterapkan. */
  mulaiPalingAwal: string | null
  selesaiPalingAwal: string | null
  /** Latest start / finish. */
  mulaiPalingLambat: string | null
  selesaiPalingLambat: string | null
  /**
   * Total float dalam HARI KERJA. 0 berarti kritis.
   *
   * `null` bila tak bisa dihitung (proyek tanpa tanggal akhir, atau
   * pekerjaan yang terputus dari jaringan) — BUKAN 0, yang akan membuatnya
   * terbaca "kritis" dan menenggelamkan yang benar-benar kritis.
   */
  float: number | null
  kritis: boolean
}

export interface HasilCpm {
  pekerjaan: HasilPekerjaan[]
  /** Rantai pekerjaan berfloat nol, terurut. Kosong bila ada lingkaran. */
  jalurKritis: string[]
  /** Tanggal selesai proyek menurut perhitungan. */
  selesaiProyek: string | null
  /**
   * Lingkaran dependensi yang ditemukan. Kosong = jaringannya sah.
   *
   * Kalau terisi, `pekerjaan` HANYA memuat yang di luar lingkaran — dan itu
   * dinyatakan, bukan disajikan seolah jadwal lengkap.
   */
  lingkaran: string[]
  /** Pekerjaan yang tak punya durasi — tak bisa dijadwalkan. */
  tanpaDurasi: string[]
}

/**
 * Hitung jalur kritis.
 *
 * @param mulaiProyek tanggal mulai `YYYY-MM-DD`.
 * @param akhirProyek batas akhir kontraktual. Bila `null`, float dihitung
 *   terhadap jalur terpanjang — dan itu dinyatakan lewat `float` yang bisa
 *   nol untuk banyak pekerjaan sekaligus.
 */
export function hitungCpm(
  pekerjaan: Pekerjaan[],
  dependensi: Dependensi[],
  kalender: Kalender,
  mulaiProyek: string,
  akhirProyek: string | null = null,
): HasilCpm {
  const peta = new Map(pekerjaan.map((p) => [p.id, p]))
  const durasi = new Map<string, number>()
  const tanpaDurasi: string[] = []

  for (const p of pekerjaan) {
    const d = angka(p.durasi_hari)
    if (d == null || d < 0) { tanpaDurasi.push(p.id); durasi.set(p.id, 0) }
    else durasi.set(p.id, Math.round(d))
  }

  // Hanya dependensi yang KEDUA ujungnya dikenal. Relasi ke milestone yang
  // sudah dihapus akan diam-diam membuat pekerjaan terlihat tak punya
  // pendahulu — dan mulai jauh lebih awal daripada seharusnya.
  const dep = dependensi.filter(
    (d) => peta.has(d.milestone_id) && peta.has(d.bergantung_pada))

  const pendahulu = new Map<string, Dependensi[]>()
  const penerus = new Map<string, Dependensi[]>()
  for (const d of dep) {
    ;(pendahulu.get(d.milestone_id) ?? pendahulu.set(d.milestone_id, []).get(d.milestone_id)!).push(d)
    ;(penerus.get(d.bergantung_pada) ?? penerus.set(d.bergantung_pada, []).get(d.bergantung_pada)!).push(d)
  }

  // ── Urutan topologis (Kahn). Yang tersisa = lingkaran. ───────────────────
  const derajat = new Map<string, number>()
  for (const p of pekerjaan) derajat.set(p.id, (pendahulu.get(p.id) ?? []).length)

  const antre = pekerjaan.filter((p) => derajat.get(p.id) === 0).map((p) => p.id)
  const urut: string[] = []
  while (antre.length) {
    const id = antre.shift()!
    urut.push(id)
    for (const d of penerus.get(id) ?? []) {
      const n = (derajat.get(d.milestone_id) ?? 0) - 1
      derajat.set(d.milestone_id, n)
      if (n === 0) antre.push(d.milestone_id)
    }
  }

  const lingkaran = pekerjaan.map((p) => p.id).filter((id) => !urut.includes(id))

  // ── Forward pass ─────────────────────────────────────────────────────────
  const mulai = new Map<string, string>()
  const selesai = new Map<string, string>()

  for (const id of urut) {
    const p = peta.get(id)!
    const d = durasi.get(id)!
    let awal = p.mulai_paksa
      ? kalender.majuHariKerja(p.mulai_paksa, 0)
      : kalender.majuHariKerja(mulaiProyek, 0)

    for (const rel of pendahulu.get(id) ?? []) {
      const jeda = angka(rel.jeda_hari) ?? 0
      const pj = rel.bergantung_pada
      const jenis = rel.jenis ?? 'FS'
      let batas: string

      // Keempat jenis relasi. FS yang paling dipakai, tapi SS menentukan
      // pada pekerjaan paralel: pengecoran lantai 2 tak menunggu lantai 1
      // SELESAI, ia menunggu lantai 1 MULAI plus jeda curing.
      if (jenis === 'FS') batas = kalender.majuHariKerja(selesai.get(pj) ?? awal, 1 + jeda)
      else if (jenis === 'SS') batas = kalender.majuHariKerja(mulai.get(pj) ?? awal, jeda)
      else if (jenis === 'FF') {
        const ff = kalender.majuHariKerja(selesai.get(pj) ?? awal, jeda)
        batas = mundurHariKerja(kalender, ff, Math.max(0, d - 1))
      } else {
        const sf = kalender.majuHariKerja(mulai.get(pj) ?? awal, jeda)
        batas = mundurHariKerja(kalender, sf, Math.max(0, d - 1))
      }

      if (batas > awal) awal = batas
    }

    mulai.set(id, awal)
    selesai.set(id, d <= 1 ? awal : kalender.majuHariKerja(awal, d - 1))
  }

  const selesaiProyek = urut.length
    ? urut.map((id) => selesai.get(id)!).reduce((a, b) => (b > a ? b : a))
    : null

  // ── Backward pass ────────────────────────────────────────────────────────
  //
  // Batasnya `akhirProyek` bila ada — bukan tanggal selesai hasil hitung.
  // Tanpa itu, setiap pekerjaan di jalur terpanjang terlihat kritis meski
  // proyeknya masih punya dua bulan cadangan.
  const batasAkhir = akhirProyek ?? selesaiProyek
  const lambatSelesai = new Map<string, string>()
  const lambatMulai = new Map<string, string>()

  for (const id of [...urut].reverse()) {
    const d = durasi.get(id)!
    let akhir = batasAkhir ?? selesai.get(id)!

    for (const rel of penerus.get(id) ?? []) {
      const jeda = angka(rel.jeda_hari) ?? 0
      const pn = rel.milestone_id
      const jenis = rel.jenis ?? 'FS'
      if (!lambatMulai.has(pn)) continue
      let batas: string
      if (jenis === 'FS') batas = mundurHariKerja(kalender, lambatMulai.get(pn)!, 1 + jeda)
      else if (jenis === 'SS') batas = kalender.majuHariKerja(
        mundurHariKerja(kalender, lambatMulai.get(pn)!, jeda), Math.max(0, d - 1))
      else if (jenis === 'FF') batas = mundurHariKerja(kalender, lambatSelesai.get(pn)!, jeda)
      else batas = mundurHariKerja(kalender, lambatSelesai.get(pn)!, jeda)
      if (batas < akhir) akhir = batas
    }

    lambatSelesai.set(id, akhir)
    lambatMulai.set(id, d <= 1 ? akhir : mundurHariKerja(kalender, akhir, d - 1))
  }

  const hasil: HasilPekerjaan[] = pekerjaan.map((p) => {
    const id = p.id
    const dalamLingkaran = lingkaran.includes(id)
    const ms = mulai.get(id) ?? null
    const ss = selesai.get(id) ?? null
    const lm = lambatMulai.get(id) ?? null
    const ls = lambatSelesai.get(id) ?? null

    // Float `null`, bukan 0, saat tak bisa dihitung. Nol terbaca "kritis",
    // dan pekerjaan yang benar-benar kritis tenggelam di antaranya.
    //
    // Float NEGATIF harus menunjukkan SEBERAPA telat, bukan sekadar "telat".
    // Versi pertama menghitung `hitungHariKerja(ms, lm) - 1` saja; ketika
    // `lm` lebih awal dari `ms` — yaitu setiap proyek yang sudah melewati
    // tenggatnya — `hitungHariKerja` mengembalikan 0 untuk rentang terbalik,
    // sehingga proyek yang telat LIMA MINGGU melaporkan float -1. Terbaca
    // "telat sehari", dan tak ada yang panik. Ditemukan dengan menjalankan
    // modul ini atas data nyata, bukan dengan membaca ulang rumusnya.
    const flt = dalamLingkaran || ms == null || lm == null
      ? null
      : lm >= ms
        ? kalender.hitungHariKerja(ms, lm) - 1
        : -(kalender.hitungHariKerja(lm, ms) - 1)

    return {
      id,
      nama: p.title ?? id,
      durasi: durasi.get(id) ?? 0,
      mulaiPalingAwal: ms,
      selesaiPalingAwal: ss,
      mulaiPalingLambat: lm,
      selesaiPalingLambat: ls,
      float: flt,
      // Kritis = float NOL ATAU NEGATIF, bukan tepat nol.
      //
      // Pada proyek yang sudah telat, TAK ADA pekerjaan berfloat tepat nol —
      // semuanya negatif. Kalau "kritis" berarti `=== 0`, proyek yang paling
      // genting justru menampilkan jalur kritis KOSONG, dan layarnya terlihat
      // paling tenang saat keadaannya paling buruk.
      kritis: flt != null && flt <= 0,
    }
  })

  // Jalur kritis hanya sah bila jaringannya sah. Menyajikan "jalur kritis"
  // dari jaringan berlingkaran adalah menjawab pertanyaan yang tak punya
  // jawaban.
  const jalurKritis = lingkaran.length
    ? []
    : urut.filter((id) => hasil.find((h) => h.id === id)?.kritis)

  return { pekerjaan: hasil, jalurKritis, selesaiProyek, lingkaran, tanpaDurasi }
}

/** Mundur `n` hari KERJA dari `dari`. */
function mundurHariKerja(kal: Kalender, dari: string, n: number): string {
  const d = new Date(dari.slice(0, 10) + 'T00:00:00Z')
  let sisa = n
  while (!kal.hariKerja(iso(d))) d.setUTCDate(d.getUTCDate() - 1)
  while (sisa > 0) {
    d.setUTCDate(d.getUTCDate() - 1)
    if (kal.hariKerja(iso(d))) sisa--
  }
  return iso(d)
}

/**
 * Apakah menambah dependensi `dari -> ke` akan menutup lingkaran?
 *
 * Dipakai SEBELUM menyimpan. Constraint SQL hanya menutup lingkaran panjang-1
 * (pekerjaan menunggu dirinya sendiri); yang lebih panjang — A→B→C→A — harus
 * diperiksa di sini, dan gejalanya kalau lolos bukan pesan galat melainkan
 * seluruh jadwal berhenti bisa dihitung.
 *
 * @param dari pekerjaan yang MENUNGGU.
 * @param ke pekerjaan yang DITUNGGU.
 */
export function menutupLingkaran(
  dep: Array<{ milestone_id: string; bergantung_pada: string }>,
  dari: string,
  ke: string,
): boolean {
  // Menunggu diri sendiri: lingkaran terpendek.
  if (dari === ke) return true

  // Arah penelusuran: PENDAHULU, bukan penerus.
  //
  // `dari` menunggu `ke`. Kalau `ke` — lewat rantai apa pun — pada akhirnya
  // menunggu `dari`, maka relasi barunya menutup lingkaran.
  //
  // Versi pertama fungsi ini menelusuri ke arah sebaliknya dan menjawab
  // `false` untuk A→B→C yang ditutup "A menunggu C" — lingkaran paling
  // jelas yang ada. Ketahuan oleh test, bukan oleh membaca ulang kodenya.
  const pendahulu = new Map<string, string[]>()
  for (const d of dep) {
    const a = pendahulu.get(d.milestone_id) ?? []
    a.push(d.bergantung_pada)
    pendahulu.set(d.milestone_id, a)
  }

  // `dilihat` mencegah putaran tak berujung pada jaringan yang SUDAH
  // melingkar sebelum relasi ini ditambahkan.
  const dilihat = new Set<string>()
  const antre = [ke]
  while (antre.length) {
    const n = antre.pop()!
    if (n === dari) return true
    if (dilihat.has(n)) continue
    dilihat.add(n)
    antre.push(...(pendahulu.get(n) ?? []))
  }
  return false
}

// ── Histogram & leveling sumber daya ────────────────────────────────────────

export interface KebutuhanSumberDaya {
  milestone_id: string
  jenis: string
  nama: string
  kuantitas: number | string
  tersedia?: number | string | null
}

export interface PeriodeSumberDaya {
  /** Senin minggu itu, `YYYY-MM-DD`. */
  minggu: string
  dibutuhkan: number
  tersedia: number | null
  /** Kelebihan beban. 0 berarti cukup. */
  kelebihan: number
}

export interface HasilSumberDaya {
  nama: string
  jenis: string
  periode: PeriodeSumberDaya[]
  /**
   * PUNCAK, bukan rata-rata.
   *
   * 40 tukang di minggu 7 dan 4 di minggu 8 punya rata-rata 22 — angka yang
   * tak pernah terjadi, dan yang menyembunyikan kekurangan 15 orang di
   * minggu 7. Yang menentukan pengadaan tenaga adalah puncaknya.
   */
  puncak: number
  mingguPuncak: string | null
  tersedia: number | null
  /** Minggu-minggu yang kelebihan beban — yang butuh leveling. */
  mingguKelebihan: string[]
}

/**
 * Bangun histogram sumber daya per minggu dari hasil CPM.
 *
 * Kuantitas dianggap SERENTAK selama pekerjaan berjalan: 10 tukang selama
 * 5 hari berarti 10, bukan 50. Menjumlahkannya sebagai orang-hari akan
 * membuat histogram yang tak bisa dibandingkan dengan jumlah tenaga nyata.
 */
export function histogramSumberDaya(
  kebutuhan: KebutuhanSumberDaya[],
  jadwal: HasilPekerjaan[],
): HasilSumberDaya[] {
  const petaJadwal = new Map(jadwal.map((j) => [j.id, j]))
  const perSumber = new Map<string, {
    jenis: string; nama: string; tersedia: number | null
    minggu: Map<string, number>
  }>()

  for (const k of kebutuhan) {
    const j = petaJadwal.get(k.milestone_id)
    if (!j?.mulaiPalingAwal || !j.selesaiPalingAwal) continue

    const kunci = `${k.jenis}::${k.nama}`
    let s = perSumber.get(kunci)
    if (!s) {
      s = { jenis: k.jenis, nama: k.nama, tersedia: angka(k.tersedia), minggu: new Map() }
      perSumber.set(kunci, s)
    }
    // Batas tersedia yang paling ketat yang berlaku.
    const t = angka(k.tersedia)
    if (t != null) s.tersedia = s.tersedia == null ? t : Math.min(s.tersedia, t)

    const q = angka(k.kuantitas) ?? 0
    for (const m of mingguAntara(j.mulaiPalingAwal, j.selesaiPalingAwal)) {
      s.minggu.set(m, (s.minggu.get(m) ?? 0) + q)
    }
  }

  return [...perSumber.values()].map((s) => {
    const periode: PeriodeSumberDaya[] = [...s.minggu.entries()]
      .sort(([a], [b]) => (a < b ? -1 : 1))
      .map(([minggu, dibutuhkan]) => ({
        minggu,
        dibutuhkan: Math.round(dibutuhkan * 100) / 100,
        tersedia: s.tersedia,
        kelebihan: s.tersedia == null ? 0 : Math.max(0, Math.round((dibutuhkan - s.tersedia) * 100) / 100),
      }))

    const puncakBaris = periode.reduce<PeriodeSumberDaya | null>(
      (a, b) => (a == null || b.dibutuhkan > a.dibutuhkan ? b : a), null)

    return {
      nama: s.nama,
      jenis: s.jenis,
      periode,
      puncak: puncakBaris?.dibutuhkan ?? 0,
      mingguPuncak: puncakBaris?.minggu ?? null,
      tersedia: s.tersedia,
      mingguKelebihan: periode.filter((p) => p.kelebihan > 0).map((p) => p.minggu),
    }
  })
}

/** Senin dari tiap minggu yang tersentuh rentang `a`..`b`. */
function mingguAntara(a: string, b: string): string[] {
  const hasil: string[] = []
  const d = new Date(a.slice(0, 10) + 'T00:00:00Z')
  const akhir = new Date(b.slice(0, 10) + 'T00:00:00Z')
  // Mundurkan ke Senin.
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7))
  while (d <= akhir) {
    hasil.push(iso(d))
    d.setUTCDate(d.getUTCDate() + 7)
  }
  return hasil
}
