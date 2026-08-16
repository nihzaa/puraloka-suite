/**
 * 10.1 — UTILISASI ALAT (berapa jam dipakai, dan berapa hari menganggur).
 *
 * ══════════════════════════════════════════════════════════════════════════
 * ANGKA YANG DICARI BUKAN "BERAPA KALI DIPAKAI"
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Alat berat adalah modal mahal yang diam. Pertanyaan pemiliknya bukan
 * "berapa kali dipakai" melainkan "seberapa sering ia menganggur" — dan
 * keduanya menjawab berbeda: alat yang dipakai 20 kali masing-masing satu jam
 * lebih menganggur daripada alat yang dipakai 5 kali sehari penuh.
 *
 * Maka yang dihitung JAM, bukan baris, dan hari menganggur ikut disebut.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * `jam_mulai`/`jam_selesai` ADALAH HOUR METER, BUKAN JAM DINDING
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Namanya menyesatkan, dan salah membacanya menghasilkan angka yang terlihat
 * masuk akal. Diukur 2026-08-16 — keduanya `numeric`, bukan `time`:
 *
 *   2026-07-27  1172,00 → 1180,00
 *   2026-07-28  1180,00 → 1188,00
 *   2026-07-29  1188,00 → 1196,00
 *
 * Angkanya BERLANJUT antar hari dan jauh melewati 24. Ini pembacaan hour
 * meter kumulatif — odometer alat berat — bukan pukul berapa ia dinyalakan.
 * Rentang seluruh tabel 1.172,00–3.456,00; selisih per baris 6–8 jam,
 * rata-rata 7,07. Itu hari kerja alat berat yang wajar.
 *
 * Menafsirkannya sebagai `HH:MM` (tafsiran pertama saya, ditolak data)
 * membuat "1172" terurai jadi pukul 11:72 — menit yang tak ada — lalu
 * menghasilkan durasi karangan tanpa satu pun galat.
 *
 * Maka jam pakai = SELISIH langsung, tanpa penguraian waktu apa pun.
 *
 * ── Selisih yang tak masuk akal
 *
 * Tak ada batasan basis yang menahan `jam_selesai` lebih kecil daripada
 * `jam_mulai`. Selisih negatif yang ikut dijumlah diam-diam MENGURANGI total
 * — laporan "alat ini dipakai 3 jam" padahal 11 jam. Diukur hari ini nol
 * baris seperti itu, tapi nol hari ini bukan nol selamanya (dan hour meter
 * yang di-reset setelah servis membuatnya nyata).
 *
 * Baris semacam itu tidak dibuang diam-diam: jumlahnya dilaporkan di
 * `barisTakWajar`, supaya yang membaca tahu ada data yang perlu dibetulkan
 * alih-alih menyangka alatnya memang jarang dipakai.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * I-1: TOOL INI TIDAK MENULIS
 * ══════════════════════════════════════════════════════════════════════════
 */

import type { TenantDb } from '../utils/tenant-db.js'

const BATAS = 900

export interface BarisUtilisasiAlat {
  alat: string
  totalJam: number
  jumlahPemakaian: number
  hariTerpakai: number
  terakhirDipakai: string | null
  /** Baris dengan jam selesai <= jam mulai — data yang perlu dibetulkan. */
  barisTakWajar: number
}

export interface HasilUtilisasiAlat {
  sejak: string
  sampai: string
  alat: BarisUtilisasiAlat[]
  alatTakTerpakai: string[]
  catatan?: string
}

function tgl(d: Date): string {
  const b = String(d.getMonth() + 1).padStart(2, '0')
  const t = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${b}-${t}`
}

/**
 * Jam pakai = selisih dua pembacaan hour meter.
 *
 * `numeric` PostgREST datang sebagai STRING ("1172.00"), jadi `Number()` wajib
 * — dan `null` dipulangkan untuk apa pun yang tak masuk akal, bukan 0. Nol
 * berarti "alat menyala nol jam", sesuatu yang berbeda dari "datanya rusak",
 * dan menyamakan keduanya menyembunyikan cacat data di balik angka yang sah.
 */
export function jamPakai(
  mulai: string | number | null,
  selesai: string | number | null,
): number | null {
  if (mulai === null || mulai === undefined) return null
  if (selesai === null || selesai === undefined) return null

  /*
   * String kosong DITOLAK sebelum `Number()`.
   *
   * `Number('')` adalah 0, bukan NaN — jadi kolom kosong terbaca sebagai
   * "hour meter menunjuk nol", dan pasangan ('', '1200') menghasilkan 1.200
   * jam pakai dari satu baris. Ditemukan test, bukan oleh pembacaan ulang.
   */
  if (typeof mulai === 'string' && mulai.trim() === '') return null
  if (typeof selesai === 'string' && selesai.trim() === '') return null

  const a = Number(mulai)
  const b = Number(selesai)
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null
  if (b <= a) return null
  return b - a
}

export async function ringkasUtilisasiAlat(
  db: TenantDb,
  opsi: { sejak?: string; sampai?: string } = {},
): Promise<HasilUtilisasiAlat | { galat: string }> {
  const sampai = opsi.sampai ?? tgl(new Date())
  const sejak =
    opsi.sejak ??
    tgl(new Date(new Date(sampai + 'T00:00:00').getTime() - 29 * 864e5))

  const { data: aset, error: e1 } = await db
    .from('assets')
    .select('id, name')
    .limit(BATAS)

  if (e1) {
    return { galat: 'Gagal membaca daftar alat.' }
  }
  const daftarAset = (aset ?? []) as { id: string; name: string | null }[]
  if (daftarAset.length === 0) {
    return { sejak, sampai, alat: [], alatTakTerpakai: [], catatan: 'Belum ada alat terdaftar.' }
  }

  const { data: pakai, error: e2 } = await db
    .from('pemakaian_alat')
    .select('asset_id, tanggal, jam_mulai, jam_selesai')
    .gte('tanggal', sejak)
    .lte('tanggal', sampai)
    .limit(BATAS)

  if (e2) {
    return { galat: 'Gagal membaca catatan pemakaian alat.' }
  }
  const baris = (pakai ?? []) as {
    asset_id: string
    tanggal: string
    jam_mulai: string | number | null
    jam_selesai: string | number | null
  }[]

  if (baris.length >= BATAS) {
    return {
      galat:
        'Catatan pemakaian alat pada rentang ini terlalu banyak untuk diringkas ' +
        'sekaligus. Persempit rentang tanggalnya.',
    }
  }

  const namaAset = new Map(
    daftarAset.map((a) => [a.id, a.name ?? '(tanpa nama)']),
  )

  const kum = new Map<
    string,
    { jam: number; n: number; hari: Set<string>; terakhir: string | null; takWajar: number }
  >()

  for (const b of baris) {
    // Baris untuk aset di luar daftar tenant tak mungkin lolos pembungkus
    // tenancy, tapi kalau toh muncul, jangan diam-diam dihitung sebagai alat
    // tak dikenal.
    if (!namaAset.has(b.asset_id)) continue

    let k = kum.get(b.asset_id)
    if (!k) {
      k = { jam: 0, n: 0, hari: new Set(), terakhir: null, takWajar: 0 }
      kum.set(b.asset_id, k)
    }
    k.n += 1
    if (b.tanggal) {
      k.hari.add(b.tanggal)
      if (!k.terakhir || b.tanggal > k.terakhir) k.terakhir = b.tanggal
    }
    const j = jamPakai(b.jam_mulai, b.jam_selesai)
    if (j === null) k.takWajar += 1
    else k.jam += j
  }

  const daftar: BarisUtilisasiAlat[] = [...kum.entries()]
    .map(([id, k]) => ({
      alat: namaAset.get(id) ?? '(tanpa nama)',
      totalJam: Math.round(k.jam * 100) / 100,
      jumlahPemakaian: k.n,
      hariTerpakai: k.hari.size,
      terakhirDipakai: k.terakhir,
      barisTakWajar: k.takWajar,
    }))
    .sort((a, b) => b.totalJam - a.totalJam)

  /*
   * Alat yang TAK muncul sama sekali adalah temuan, bukan ketiadaan data.
   * Menghilangkannya dari keluaran membuat laporan "semua alat terpakai" —
   * persis kebalikan dari yang sedang ditanyakan.
   */
  const takTerpakai = daftarAset
    .filter((a) => !kum.has(a.id))
    .map((a) => a.name ?? '(tanpa nama)')

  return { sejak, sampai, alat: daftar, alatTakTerpakai: takTerpakai }
}
