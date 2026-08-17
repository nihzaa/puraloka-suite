/**
 * 8.5 — KELAYAKAN INVESTASI ALAT: lebih untung DIMILIKI atau DISEWA?
 *
 * ══════════════════════════════════════════════════════════════════════════
 * PERTANYAAN YANG TAK PUNYA PEMBANDING SAMPAI HARI INI
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Sistem sudah tahu biaya MEMILIKI alat — penyusutan, biaya operasional, jam
 * pakai. Yang tak pernah ia punya adalah pembandingnya: berapa kalau disewa.
 * `asset_rentals` nol baris sampai 2026-08-16.
 *
 * Angka tunggal tanpa pembanding bukan analisis. "Excavator menyusut Rp 52
 * juta" tidak menjawab apa pun sendirian; ia baru berarti setelah diadu dengan
 * "menyewanya Rp 2,2 juta/hari × berapa hari dipakai".
 *
 * ══════════════════════════════════════════════════════════════════════════
 * BIAYA MEMILIKI = PENYUSUTAN + OPERASIONAL. BUKAN HARGA BELI.
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Godaan terbesarnya membandingkan HARGA BELI dengan biaya sewa. Itu selalu
 * memenangkan sewa, dan selalu salah: harga beli tersebar sepanjang umur
 * ekonomis alat, sementara sewa dibayar habis tiap pemakaian.
 *
 * Yang dibandingkan di sini biaya per PERIODE YANG SAMA:
 *
 *   memiliki = penyusutan tercatat + biaya operasional tercatat
 *   menyewa  = tarif sewa × lama pemakaian nyata (dari `pemakaian_alat`)
 *
 * ══════════════════════════════════════════════════════════════════════════
 * ALAT YANG TAK PERNAH DIPAKAI ADALAH TEMUAN, BUKAN BARIS KOSONG
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Diukur 2026-08-16: Mobile Crane 25 Ton seharga Rp 2,4 M punya NOL jam
 * pakai, dan tetap menyusut Rp 54 juta. Itu modal mati — temuan paling mahal
 * yang bisa diberikan tool ini, dan justru yang paling mudah hilang kalau
 * baris tanpa pemakaian dibuang karena "tak ada datanya".
 *
 * Alat semacam itu dinyatakan `verdict: 'modal-mati'`, bukan disembunyikan.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * YANG TOOL INI TIDAK LAKUKAN
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Ia TIDAK meramal. Semua angkanya historis — tercatat, bukan diproyeksikan.
 * Kalau suatu alat belum punya catatan penyusutan, itu DINYATAKAN, bukan
 * ditambal dengan hitungan garis lurus dari harga beli: tambalan semacam itu
 * tak bisa dibedakan dari angka nyata begitu masuk ke jawaban asisten.
 *
 * I-1: hanya SELECT.
 */

import type { TenantDb } from '../utils/tenant-db.js'

const BATAS = 900

export type VerdictAlat =
  | 'modal-mati'
  | 'lebih-baik-sewa'
  | 'lebih-baik-milik'
  | 'data-belum-cukup'

export interface BarisInvestasiAlat {
  alat: string
  hargaBeli: number
  /** Penyusutan + biaya operasional yang BENAR-BENAR tercatat. */
  biayaMemiliki: number
  jamPakai: number
  hariPakai: number
  /** Biaya bila periode pemakaian yang sama itu disewa. `null` = tarif tak ada. */
  biayaMenyewa: number | null
  verdict: VerdictAlat
  alasan: string
}

export interface HasilInvestasiAlat {
  alat: BarisInvestasiAlat[]
  /** Alat yang belum dimiliki tapi pernah disewa — kandidat pembelian. */
  kandidatBeli: {
    nama: string
    totalSewa: number
    jumlahSewa: number
    catatan: string
  }[]
  catatan?: string
}

const rp = (n: number) => `Rp ${Math.round(n).toLocaleString('id-ID')}`

/**
 * Biaya sewa untuk lama pemakaian tertentu.
 *
 * `rate_unit` diukur dari basis: hari|minggu|bulan. Nilai di luar itu
 * memulangkan `null` — BUKAN diperlakukan sebagai hari. Menebak satuan berarti
 * salah 7× atau 30× lipat, dan hasilnya tetap berupa angka yang wajar dibaca.
 */
export function biayaSewa(
  tarif: number,
  satuan: string,
  hariPakai: number,
): number | null {
  if (!Number.isFinite(tarif) || tarif < 0) return null
  if (hariPakai <= 0) return null
  switch (satuan) {
    case 'hari':
      return tarif * hariPakai
    case 'minggu':
      return tarif * (hariPakai / 7)
    case 'bulan':
      return tarif * (hariPakai / 30)
    default:
      return null
  }
}

export async function analisisInvestasiAlat(
  db: TenantDb,
): Promise<HasilInvestasiAlat | { galat: string }> {
  const { data: aset, error: e1 } = await db
    .from('assets')
    .select('id, name, purchase_price, ownership')
    .eq('ownership', 'milik')
    .limit(BATAS)

  if (e1) return { galat: 'Gagal membaca daftar alat.' }
  const daftarAset = (aset ?? []) as {
    id: string
    name: string | null
    purchase_price: string | number | null
  }[]

  const { data: pakai, error: e2 } = await db
    .from('pemakaian_alat')
    .select('asset_id, tanggal, jam_mulai, jam_selesai')
    .limit(BATAS)
  if (e2) return { galat: 'Gagal membaca pemakaian alat.' }

  const { data: susut, error: e3 } = await db
    .from('penyusutan_alat')
    .select('asset_id, nilai')
    .limit(BATAS)
  if (e3) return { galat: 'Gagal membaca penyusutan alat.' }

  const { data: ops, error: e4 } = await db
    .from('biaya_operasional_alat')
    .select('asset_id, jumlah')
    .limit(BATAS)
  if (e4) return { galat: 'Gagal membaca biaya operasional alat.' }

  const { data: sewa, error: e5 } = await db
    .from('asset_rentals')
    .select('asset_id, item_name, rate, rate_unit, start_date, end_date, status')
    .limit(BATAS)
  if (e5) return { galat: 'Gagal membaca sewa alat.' }

  const barisSewa = (sewa ?? []) as {
    asset_id: string | null
    item_name: string | null
    rate: string | number | null
    rate_unit: string | null
    start_date: string | null
    end_date: string | null
    status: string | null
  }[]

  // ── Kumpulkan per aset
  const jam = new Map<string, number>()
  const hari = new Map<string, Set<string>>()
  for (const p of (pakai ?? []) as {
    asset_id: string
    tanggal: string
    jam_mulai: string | number | null
    jam_selesai: string | number | null
  }[]) {
    const a = Number(p.jam_mulai)
    const b = Number(p.jam_selesai)
    if (Number.isFinite(a) && Number.isFinite(b) && b > a) {
      jam.set(p.asset_id, (jam.get(p.asset_id) ?? 0) + (b - a))
    }
    if (p.tanggal) {
      let s = hari.get(p.asset_id)
      if (!s) { s = new Set(); hari.set(p.asset_id, s) }
      s.add(p.tanggal)
    }
  }

  const jumlah = (
    rows: { asset_id: string; [k: string]: unknown }[],
    kolom: string,
  ): Map<string, number> => {
    const m = new Map<string, number>()
    for (const r of rows) {
      const v = Number(r[kolom] ?? 0)
      if (Number.isFinite(v)) m.set(r.asset_id, (m.get(r.asset_id) ?? 0) + v)
    }
    return m
  }
  const totalSusut = jumlah((susut ?? []) as never, 'nilai')
  const totalOps = jumlah((ops ?? []) as never, 'jumlah')

  /*
   * Tarif sewa acuan per aset — dari baris sewa yang BERPASANGAN dengan aset
   * itu. Kalau satu aset punya beberapa baris, dipakai yang terakhir dicatat;
   * merata-ratakan tarif berbeda satuan (hari vs bulan) menghasilkan angka
   * yang tak berarti apa pun.
   */
  const tarif = new Map<string, { rate: number; unit: string }>()
  for (const s of barisSewa) {
    if (!s.asset_id) continue
    const r = Number(s.rate)
    if (!Number.isFinite(r) || !s.rate_unit) continue
    tarif.set(s.asset_id, { rate: r, unit: s.rate_unit })
  }

  const daftar: BarisInvestasiAlat[] = daftarAset.map((a) => {
    const jamPakai = Math.round((jam.get(a.id) ?? 0) * 100) / 100
    const hariPakai = hari.get(a.id)?.size ?? 0
    const biayaMemiliki =
      (totalSusut.get(a.id) ?? 0) + (totalOps.get(a.id) ?? 0)
    const t = tarif.get(a.id)
    const biayaMenyewa = t ? biayaSewa(t.rate, t.unit, hariPakai) : null
    const harga = Number(a.purchase_price ?? 0)

    let verdict: VerdictAlat
    let alasan: string

    if (hariPakai === 0 && biayaMemiliki > 0) {
      /*
       * Modal mati — kasus paling mahal, dan yang paling mudah hilang kalau
       * baris tanpa pemakaian dibuang. Diukur 2026-08-16: Mobile Crane
       * Rp 2,4 M, nol jam pakai, tetap menyusut Rp 54 juta.
       */
      verdict = 'modal-mati'
      alasan =
        `Tidak dipakai sama sekali, tetapi menanggung ${rp(biayaMemiliki)} ` +
        'penyusutan + operasional.'
    } else if (hariPakai === 0) {
      /*
       * Nol pakai DAN nol biaya tercatat — ini BUKAN modal mati, melainkan
       * alat yang belum pernah masuk pencatatan mana pun.
       *
       * Membedakan keduanya menentukan apakah tool ini berguna. Diukur
       * 2026-08-16: 11 alat kecil (gerinda Rp 1,2 juta, bor beton Rp 2,8 juta)
       * jatuh ke sini. Menandai semuanya "modal-mati" menghasilkan 11 baris
       * peringatan yang menenggelamkan satu temuan sungguhan — Mobile Crane
       * Rp 2,4 M yang benar-benar menganggur sambil menyusut Rp 54 juta.
       *
       * Peringatan yang terlalu sering berbunyi berhenti dibaca.
       */
      verdict = 'data-belum-cukup'
      alasan =
        'Belum ada catatan pemakaian maupun biaya untuk alat ini — bukan ' +
        'berarti menganggur, melainkan belum tercatat.'
    } else if (biayaMenyewa === null) {
      verdict = 'data-belum-cukup'
      alasan =
        'Belum ada tarif sewa pembanding untuk alat ini, jadi untung-rugi ' +
        'memiliki vs menyewa tak bisa dihitung.'
    } else if (biayaMemiliki === 0) {
      verdict = 'data-belum-cukup'
      alasan =
        'Belum ada penyusutan maupun biaya operasional tercatat, jadi biaya ' +
        'memiliki belum bisa dibandingkan.'
    } else if (biayaMenyewa < biayaMemiliki) {
      verdict = 'lebih-baik-sewa'
      /*
       * Peringatan periode pendek DIIKUTKAN, bukan disimpan di kepala berkas.
       *
       * Penyusutan tercatat mencakup seluruh periode pembukuan, sementara
       * biaya sewa dihitung dari hari pakai NYATA yang bisa jauh lebih pendek.
       * Diukur 2026-08-16: Excavator 12 hari pakai vs penyusutan sebulan
       * penuh — perbandingan itu condong ke sewa karena satuannya timpang,
       * bukan karena menyewa benar-benar lebih murah.
       *
       * Founder membaca verdict, bukan komentar kode. Jadi keterbatasannya
       * ikut di kalimat yang sama dengan kesimpulannya.
       */
      alasan =
        `Menyewa ${hariPakai} hari ≈ ${rp(biayaMenyewa)}, lebih murah daripada ` +
        `${rp(biayaMemiliki)} biaya memiliki pada periode tercatat. ` +
        'CATATAN: biaya memiliki mencakup seluruh periode pembukuan sementara ' +
        `sewa dihitung ${hariPakai} hari pakai saja — kalau alat ini dipakai ` +
        'jauh lebih sering, kesimpulannya bisa berbalik.'
    } else {
      verdict = 'lebih-baik-milik'
      alasan =
        `Memiliki ${rp(biayaMemiliki)} lebih murah daripada menyewa ${hariPakai} ` +
        `hari ≈ ${rp(biayaMenyewa)}.`
    }

    return {
      alat: a.name ?? '(tanpa nama)',
      hargaBeli: harga,
      biayaMemiliki: Math.round(biayaMemiliki),
      jamPakai,
      hariPakai,
      biayaMenyewa: biayaMenyewa === null ? null : Math.round(biayaMenyewa),
      verdict,
      alasan,
    }
  })

  /*
   * Kandidat beli — alat yang BELUM dimiliki (asset_id NULL) tapi berulang
   * disewa. Ini sisi lain pertanyaan yang sama, dan tanpa bagian ini tool
   * hanya bisa menilai yang sudah terlanjur dibeli.
   */
  const kandidat = new Map<string, { total: number; n: number }>()
  for (const s of barisSewa) {
    if (s.asset_id) continue
    const nama = (s.item_name ?? '').trim()
    if (!nama) continue
    const r = Number(s.rate)
    if (!Number.isFinite(r)) continue

    // Lama sewa dari rentang tanggalnya sendiri — bukan dari pemakaian_alat,
    // karena alat ini memang tak punya baris di sana.
    let hariSewa = 0
    if (s.start_date && s.end_date) {
      const d =
        (new Date(s.end_date).getTime() - new Date(s.start_date).getTime()) / 864e5
      if (Number.isFinite(d) && d >= 0) hariSewa = Math.round(d) + 1
    }
    const biaya = biayaSewa(r, s.rate_unit ?? '', hariSewa)
    if (biaya === null) continue

    const k = kandidat.get(nama) ?? { total: 0, n: 0 }
    k.total += biaya
    k.n += 1
    kandidat.set(nama, k)
  }

  const kandidatBeli = [...kandidat.entries()]
    .map(([nama, k]) => ({
      nama,
      totalSewa: Math.round(k.total),
      jumlahSewa: k.n,
      catatan:
        `Belum dimiliki. Sudah ${k.n}× disewa, total ${rp(k.total)} pada data ` +
        'tercatat — bandingkan dengan harga unit sebelum memutuskan membeli.',
    }))
    .sort((a, b) => b.totalSewa - a.totalSewa)

  if (daftar.length === 0 && kandidatBeli.length === 0) {
    return { alat: [], kandidatBeli: [], catatan: 'Belum ada alat terdaftar.' }
  }

  // Termahal lebih dulu — modal mati yang besar harus terbaca pertama.
  daftar.sort((a, b) => b.biayaMemiliki - a.biayaMemiliki)

  return { alat: daftar, kandidatBeli }
}
