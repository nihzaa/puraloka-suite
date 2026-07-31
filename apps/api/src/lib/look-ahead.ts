/**
 * LOOK-AHEAD 3 MINGGU — apa yang HARUS dikerjakan minggu ini sampai 3 minggu ke depan.
 *
 * ── Kenapa ada
 *
 * Kurva-S dan EVM menjawab "sejauh mana kita menyimpang". Keduanya menoleh ke
 * BELAKANG. Yang tak dijawab sistem ini sama sekali: "minggu depan saya harus
 * menyiapkan apa?" — padahal itu pertanyaan yang benar-benar dipakai PM tiap
 * Senin pagi, dan yang menentukan material/mandor disiapkan tepat waktu.
 *
 * Data-nya sudah ada sejak migrasi 052 (`planned_start`/`planned_end`, dipakai
 * Gantt). Yang belum ada cara membacanya sebagai daftar tindakan.
 *
 * ── Kenapa 3 minggu, bukan 4 atau 6
 *
 * Konvensi lapangan konstruksi (rolling 3-week look-ahead): cukup jauh untuk
 * memesan material dan menjadwalkan mandor, cukup dekat supaya rencananya masih
 * bermakna. Angkanya dijadikan parameter — kalau ternyata proyek ini butuh 4,
 * ubah argumen, jangan tulis ulang logikanya.
 *
 * ── Yang SENGAJA tidak dilakukan
 *
 * Tidak menghitung ulang bobot, tidak menebak durasi, tidak mengubah status.
 * Ia MEMBACA rencana yang sudah ada dan menyusunnya per minggu. Setiap
 * "kepintaran" tambahan di sini akan menjadi angka yang tak bisa ditelusuri
 * pemakainya ke mana pun.
 */

export interface ItemJadwal {
  id: string
  name: string
  categoryCode?: string | null
  plannedStart: string | null
  plannedEnd: string | null
  /** 0–100. Dipakai menandai yang sudah selesai & yang telat. */
  progressPct: number
  /** Nilai pekerjaan (Rp) — untuk mengurutkan mana yang paling berdampak. */
  totalPrice?: number
}

export type StatusLookAhead =
  /** Sudah lewat `planned_end` tapi progres < 100 → butuh perhatian SEKARANG. */
  | 'telat'
  /** Sedang berjalan pada minggu ini. */
  | 'berjalan'
  /** Mulai dalam rentang look-ahead → siapkan material/mandor. */
  | 'akan_mulai'

export interface BarisLookAhead {
  itemId: string
  name: string
  categoryCode: string | null
  plannedStart: string
  plannedEnd: string
  progressPct: number
  totalPrice: number
  status: StatusLookAhead
  /** Minggu ke-berapa dari sekarang (0 = minggu ini). `-1` untuk yang telat. */
  mingguKe: number
  /** Hari keterlambatan; 0 bila tidak telat. */
  hariTelat: number
}

const MS_HARI = 86_400_000

/** Awal minggu (Senin) dari sebuah tanggal, dinormalkan ke tengah malam. */
export function awalMinggu(d: Date): Date {
  const t = new Date(d.getFullYear(), d.getMonth(), d.getDate())
  // getDay(): 0=Minggu. Digeser supaya Senin=0 — kalender kerja Indonesia
  // mulai Senin, dan look-ahead dibaca saat rapat awal pekan.
  const geser = (t.getDay() + 6) % 7
  return new Date(t.getTime() - geser * MS_HARI)
}

/**
 * Susun daftar look-ahead.
 *
 * @param sekarang tanggal acuan — DISUNTIKKAN, bukan `new Date()` di dalam,
 *        supaya hasilnya deterministik dan bisa diuji tanpa memalsukan waktu.
 */
export function susunLookAhead(
  items: ItemJadwal[],
  sekarang: Date,
  jumlahMinggu = 3,
): BarisLookAhead[] {
  const seninIni = awalMinggu(sekarang)
  const batasAkhir = new Date(seninIni.getTime() + jumlahMinggu * 7 * MS_HARI)
  const hariIni = new Date(sekarang.getFullYear(), sekarang.getMonth(), sekarang.getDate())

  const hasil: BarisLookAhead[] = []

  for (const it of items) {
    if (!it.plannedStart || !it.plannedEnd) continue
    const mulai = new Date(it.plannedStart)
    const selesai = new Date(it.plannedEnd)
    if (Number.isNaN(mulai.getTime()) || Number.isNaN(selesai.getTime())) continue

    const progres = Number(it.progressPct) || 0
    // Selesai 100% tak pernah masuk daftar — look-ahead adalah daftar KERJA,
    // bukan laporan. Termasuk yang sudah lewat tanggalnya: kalau sudah 100%,
    // ia tidak telat, ia beres.
    if (progres >= 100) continue

    const telat = selesai.getTime() < hariIni.getTime()
    const mulaiSebelumBatas = mulai.getTime() < batasAkhir.getTime()
    const selesaiSesudahSenin = selesai.getTime() >= seninIni.getTime()

    let status: StatusLookAhead
    if (telat) {
      status = 'telat'
    } else if (mulai.getTime() <= hariIni.getTime() && selesaiSesudahSenin) {
      status = 'berjalan'
    } else if (mulaiSebelumBatas && selesaiSesudahSenin) {
      status = 'akan_mulai'
    } else {
      // Di luar horizon — bukan urusan minggu ini.
      continue
    }

    const mingguKe = telat
      ? -1
      : Math.max(0, Math.floor((awalMinggu(mulai).getTime() - seninIni.getTime()) / (7 * MS_HARI)))

    hasil.push({
      itemId: it.id,
      name: it.name,
      categoryCode: it.categoryCode ?? null,
      plannedStart: it.plannedStart,
      plannedEnd: it.plannedEnd,
      progressPct: progres,
      totalPrice: Number(it.totalPrice ?? 0),
      status,
      mingguKe,
      hariTelat: telat ? Math.ceil((hariIni.getTime() - selesai.getTime()) / MS_HARI) : 0,
    })
  }

  // Urutan = urutan PERHATIAN, bukan abjad atau tanggal:
  //   telat dulu (paling lama telat di atas), lalu berjalan, lalu akan mulai.
  //   Di dalam kelompok yang sama, nilai terbesar di atas — itu yang paling
  //   mahal kalau meleset.
  const urutanStatus: Record<StatusLookAhead, number> = { telat: 0, berjalan: 1, akan_mulai: 2 }
  return hasil.sort((a, b) =>
    urutanStatus[a.status] - urutanStatus[b.status] ||
    b.hariTelat - a.hariTelat ||
    a.mingguKe - b.mingguKe ||
    b.totalPrice - a.totalPrice)
}

/** Ringkasan angka untuk kartu di atas tabel. */
export function ringkasLookAhead(baris: BarisLookAhead[]) {
  const per = (s: StatusLookAhead) => baris.filter((b) => b.status === s)
  const telat = per('telat')
  return {
    telat: telat.length,
    berjalan: per('berjalan').length,
    akanMulai: per('akan_mulai').length,
    // Nilai pekerjaan yang telat — angka yang membuat "3 item telat" terasa
    // berbeda antara Rp 5 juta dan Rp 500 juta.
    nilaiTelat: telat.reduce((s, b) => s + b.totalPrice, 0),
    telatTerlama: telat.reduce((m, b) => Math.max(m, b.hariTelat), 0),
  }
}
