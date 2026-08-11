import { describe, it, expect } from 'vitest'
import {
  periodeBerlaku, kesiapanTarif, ptkpSetahun, tarifTer, hitungBpjs, angka,
  type PeriodeTarif, type BarisTarif, type JenisTarif,
} from '../tarif-payroll.js'

// ══════════════════════════════════════════════════════════════════════════
// Angka di fixture ini adalah ANGKA UJI, bukan tarif nyata.
//
// Sengaja dibuat TIDAK menyerupai tarif Indonesia mana pun (PTKP 12.000.000,
// TER 1%/2%/3%, BPJS 10%/5%) supaya tak seorang pun — termasuk saya di sesi
// berikutnya — tergoda menyalinnya ke seed atau ke kode sebagai "nilai
// bawaan yang masuk akal". R-011 melarang tarif hidup di kode; test pun
// bukan tempatnya.
// ══════════════════════════════════════════════════════════════════════════
function baris(p: Partial<BarisTarif> & { kunci: string }): BarisTarif {
  return {
    id: p.id ?? Math.random().toString(36).slice(2),
    urutan: p.urutan ?? 0,
    kunci: p.kunci,
    label: p.label !== undefined ? p.label : null,
    batas_bawah: p.batas_bawah !== undefined ? p.batas_bawah : null,
    batas_atas: p.batas_atas !== undefined ? p.batas_atas : null,
    nilai_nominal: p.nilai_nominal !== undefined ? p.nilai_nominal : null,
    nilai_persen: p.nilai_persen !== undefined ? p.nilai_persen : null,
    persen_perusahaan: p.persen_perusahaan !== undefined ? p.persen_perusahaan : null,
    persen_karyawan: p.persen_karyawan !== undefined ? p.persen_karyawan : null,
  }
}

function periode(
  jenis: JenisTarif, sejak: string, isi: BarisTarif[] = [], id = Math.random().toString(36).slice(2),
): PeriodeTarif {
  return { id, jenis, berlaku_sejak: sejak, dasar_hukum: '[UJI] bukan aturan nyata', baris: isi }
}

describe('angka — numeric dari Postgres', () => {
  it('string numeric dibaca; NaN dan sampah jadi null', () => {
    expect(angka('123.45')).toBe(123.45)
    // Postgres `numeric` MENERIMA NaN, dan satu NaN meracuni seluruh
    // perhitungan gaji tanpa satu pun galat.
    expect(angka('NaN')).toBeNull()
    expect(angka(null)).toBeNull()
    expect(angka('')).toBeNull()
  })
})

describe('periodeBerlaku — riwayat penggajian harus bisa diaudit', () => {
  const set = [
    periode('bpjs', '2025-01-01'),
    periode('bpjs', '2026-07-01'),
    periode('bpjs', '2026-01-01'),
    periode('ptkp', '2026-01-01'),
  ]

  it('memilih yang berlaku pada tanggalnya, bukan yang terbaru', () => {
    // Slip Januari harus dihitung dengan tarif Januari, bahkan sesudah tarif
    // berubah di Juli — kalau tidak, perbaikan retroaktif tak bisa dibedakan
    // dari kesalahan.
    expect(periodeBerlaku(set, 'bpjs', '2026-03-15')?.berlaku_sejak).toBe('2026-01-01')
    expect(periodeBerlaku(set, 'bpjs', '2026-08-15')?.berlaku_sejak).toBe('2026-07-01')
  })

  it('berlaku PERSIS di tanggal mulainya', () => {
    // `<=`, bukan `<`. Salah satu karakter membuat hari pertama tiap periode
    // memakai tarif lama.
    expect(periodeBerlaku(set, 'bpjs', '2026-07-01')?.berlaku_sejak).toBe('2026-07-01')
  })

  it('periode MASA DEPAN tidak terpilih', () => {
    const cuma = [periode('ptkp', '2027-01-01')]
    // Bahkan kalau ia satu-satunya yang ada — tarif tahun depan bukan tarif
    // yang berlaku hari ini.
    expect(periodeBerlaku(cuma, 'ptkp', '2026-05-01')).toBeNull()
  })

  it('jenis lain tak ikut terpilih', () => {
    expect(periodeBerlaku(set, 'ter_pph21', '2026-05-01')).toBeNull()
  })

  it('urutan masukan tak berpengaruh', () => {
    const terbalik = [...set].reverse()
    expect(periodeBerlaku(terbalik, 'bpjs', '2026-03-15')?.berlaku_sejak).toBe('2026-01-01')
  })
})

describe('kesiapanTarif — payroll tak boleh menghitung tanpa tarif', () => {
  it('daftar kosong: KETIGA jenis dilaporkan belum ditetapkan', () => {
    const k = kesiapanTarif([], '2026-05-01')
    expect(k.siap).toBe(false)
    expect(k.belum_ditetapkan.sort()).toEqual(['bpjs', 'ptkp', 'ter_pph21'])
  })

  it('satu jenis kurang sudah membuat TIDAK siap', () => {
    const k = kesiapanTarif([
      periode('ptkp', '2026-01-01', [baris({ kunci: 'TK/0', nilai_nominal: 12000000 })]),
      periode('bpjs', '2026-01-01', [baris({ kunci: 'jht', persen_karyawan: 5 })]),
    ], '2026-05-01')
    expect(k.siap).toBe(false)
    expect(k.belum_ditetapkan).toEqual(['ter_pph21'])
  })

  it('periode ADA tapi NOL BARIS dilaporkan TERPISAH', () => {
    const k = kesiapanTarif([
      periode('ptkp', '2026-01-01', [baris({ kunci: 'TK/0', nilai_nominal: 12000000 })]),
      periode('ter_pph21', '2026-01-01', []),
      periode('bpjs', '2026-01-01', [baris({ kunci: 'jht', persen_karyawan: 5 })]),
    ], '2026-05-01')
    // Bentuk kegagalan yang paling sulit dilihat: lolos pemeriksaan "sudah
    // ada periode", tetapi menghitung dengannya menghasilkan nol potongan —
    // slip yang tampak sah dengan angka yang salah.
    expect(k.siap).toBe(false)
    expect(k.kosong).toEqual(['ter_pph21'])
    expect(k.belum_ditetapkan).toEqual([])
  })

  it('ketiganya lengkap berisi → siap', () => {
    const k = kesiapanTarif([
      periode('ptkp', '2026-01-01', [baris({ kunci: 'TK/0', nilai_nominal: 12000000 })]),
      periode('ter_pph21', '2026-01-01', [baris({ kunci: 'A', nilai_persen: 1 })]),
      periode('bpjs', '2026-01-01', [baris({ kunci: 'jht', persen_karyawan: 5 })]),
    ], '2026-05-01')
    expect(k.siap).toBe(true)
  })
})

describe('ptkpSetahun', () => {
  const p = periode('ptkp', '2026-01-01', [
    baris({ kunci: 'TK/0', nilai_nominal: 12000000 }),
    baris({ kunci: 'K/1', nilai_nominal: 15000000 }),
  ])

  it('status yang tak ada → null, BUKAN 0', () => {
    // 0 adalah jawaban: "PTKP Anda nol" — pernyataan yang bisa salah dan
    // tampak sah. `null` memaksa layar mengatakan tarifnya belum ada.
    expect(ptkpSetahun(p, 'K/3')).toBeNull()
    expect(ptkpSetahun(p, 'K/3')).not.toBe(0)
  })

  it('periode null → null', () => {
    expect(ptkpSetahun(null, 'TK/0')).toBeNull()
  })

  it('pencocokan tak peka besar-kecil dan spasi', () => {
    // 'TK/0' vs 'tk/0' sudah pernah jadi sumber galat di repo ini.
    expect(ptkpSetahun(p, 'tk/0')).toBe(12000000)
    expect(ptkpSetahun(p, ' K/1 ')).toBe(15000000)
  })

  it('normalisasi berlaku DUA ARAH — kunci di TABEL juga dinormalkan', () => {
    // ── Kenapa test ini ditambahkan
    //
    // Mutasi membuktikan test di atas TIDAK CUKUP: melepas `.toUpperCase()`
    // dari sisi tabel tak membuatnya merah, karena fixture-nya kebetulan
    // sudah huruf besar. Yang diuji hanya normalisasi sisi MASUKAN.
    //
    // Data nyata datang dari form: kunci yang TERSIMPAN bisa 'tk/0' atau
    // 'K/1 ' dengan spasi ikut. Tanpa normalisasi dua arah, PTKP-nya
    // "tidak ditemukan" dan slip gaji memakai PTKP null — yang berarti
    // seluruh penghasilan kena pajak.
    const q = periode('ptkp', '2026-01-01', [
      baris({ kunci: 'tk/0', nilai_nominal: 12000000 }),
      baris({ kunci: ' K/1 ', nilai_nominal: 15000000 }),
    ])
    expect(ptkpSetahun(q, 'TK/0')).toBe(12000000)
    expect(ptkpSetahun(q, 'K/1')).toBe(15000000)
  })
})

describe('tarifTer — batas bawah inklusif, batas atas EKSKLUSIF', () => {
  const p = periode('ter_pph21', '2026-01-01', [
    baris({ kunci: 'A', urutan: 1, batas_bawah: 0, batas_atas: 6000000, nilai_persen: 1 }),
    baris({ kunci: 'A', urutan: 2, batas_bawah: 6000000, batas_atas: 9000000, nilai_persen: 2 }),
    baris({ kunci: 'A', urutan: 3, batas_bawah: 9000000, batas_atas: null, nilai_persen: 3 }),
    baris({ kunci: 'B', urutan: 1, batas_bawah: 0, batas_atas: 9000000, nilai_persen: 5 }),
  ])

  it('penghasilan PERSIS di batas atas masuk lapisan BERIKUTNYA', () => {
    // Peraturan menulis lapisan sebagai "di atas X sampai dengan Y".
    // Menerjemahkannya jadi dua sisi inklusif membuat nilai persis Y cocok
    // di DUA lapisan, dan yang menang bergantung pada urutan baris — cacat
    // yang hanya muncul untuk satu nilai penghasilan tertentu.
    expect(tarifTer(p, 'A', 5999999)).toBe(1)
    expect(tarifTer(p, 'A', 6000000)).toBe(2)
    expect(tarifTer(p, 'A', 8999999)).toBe(2)
    expect(tarifTer(p, 'A', 9000000)).toBe(3)
  })

  it('lapisan terakhir tanpa batas atas menampung sisanya', () => {
    expect(tarifTer(p, 'A', 500000000)).toBe(3)
  })

  it('kategori dipisahkan — B tak memakai lapisan A', () => {
    expect(tarifTer(p, 'B', 8000000)).toBe(5)
  })

  it('kategori yang tak ada → null', () => {
    expect(tarifTer(p, 'C', 5000000)).toBeNull()
  })

  it('periode null → null, bukan 0', () => {
    expect(tarifTer(null, 'A', 5000000)).toBeNull()
  })

  it('kategori di TABEL juga dinormalkan, bukan hanya masukan', () => {
    // Kelemahan test yang sama dengan `ptkpSetahun`, ditemukan lewat mutasi.
    const q = periode('ter_pph21', '2026-01-01', [
      baris({ kunci: ' a ', batas_bawah: 0, batas_atas: null, nilai_persen: 7 }),
    ])
    expect(tarifTer(q, 'A', 5000000)).toBe(7)
  })

  it('penghasilan di bawah lapisan terendah → null', () => {
    const q = periode('ter_pph21', '2026-01-01', [
      baris({ kunci: 'A', batas_bawah: 5000000, batas_atas: null, nilai_persen: 1 }),
    ])
    // Tabel yang tak menutupi seluruh rentang berarti belum lengkap, dan itu
    // harus terlihat — bukan diam-diam jadi 0%.
    expect(tarifTer(q, 'A', 1000000)).toBeNull()
  })
})

describe('hitungBpjs — batas atas upah MENGGIGIT', () => {
  const p = periode('bpjs', '2026-01-01', [
    baris({ kunci: 'jht', urutan: 1, label: 'Hari Tua', persen_perusahaan: 10, persen_karyawan: 5 }),
    // Iuran dengan ceiling upah.
    baris({ kunci: 'jp', urutan: 2, label: 'Pensiun', batas_atas: 8000000, persen_perusahaan: 4, persen_karyawan: 2 }),
    // Iuran yang HANYA ditanggung perusahaan.
    baris({ kunci: 'jkk', urutan: 3, label: 'Kecelakaan Kerja', persen_perusahaan: 1 }),
  ])

  it('iuran dihitung dari gaji saat di bawah ceiling', () => {
    const h = hitungBpjs(p, 5000000)!
    const jp = h.find((x) => x.kunci === 'jp')!
    expect(jp.karyawan).toBe(100000)
    expect(jp.kena_batas).toBe(false)
  })

  it('gaji di ATAS ceiling dihitung dari ceiling, bukan dari gaji', () => {
    const h = hitungBpjs(p, 20000000)!
    const jp = h.find((x) => x.kunci === 'jp')!
    // 2% dari 8.000.000 = 160.000. Mengabaikan ceiling menghasilkan 400.000 —
    // dua setengah kali lipat, dan tak seorang pun bisa menjelaskan
    // selisihnya dari slip.
    expect(jp.karyawan).toBe(160000)
    expect(jp.dasar_upah).toBe(8000000)
    expect(jp.kena_batas).toBe(true)
  })

  it('iuran tanpa ceiling ikut gaji penuh', () => {
    const h = hitungBpjs(p, 20000000)!
    const jht = h.find((x) => x.kunci === 'jht')!
    expect(jht.karyawan).toBe(1000000)
    expect(jht.kena_batas).toBe(false)
  })

  it('pihak yang tak menanggung → null, BUKAN 0', () => {
    const h = hitungBpjs(p, 5000000)!
    const jkk = h.find((x) => x.kunci === 'jkk')!
    // 0 berarti "ditanggung, sebesar nol". `null` berarti "tidak ditanggung".
    // Bedanya terlihat di slip: baris dengan Rp 0 vs baris yang tak ada.
    expect(jkk.karyawan).toBeNull()
    expect(jkk.perusahaan).toBe(50000)
  })

  it('dibulatkan ke rupiah penuh', () => {
    const q = periode('bpjs', '2026-01-01', [
      baris({ kunci: 'x', persen_karyawan: 3.33 }),
    ])
    // 3,33% dari 1.000.001 = 33.300,033
    expect(hitungBpjs(q, 1000001)![0].karyawan).toBe(33300)
  })

  it('urutan keluaran mengikuti `urutan`, bukan urutan masukan', () => {
    const q = periode('bpjs', '2026-01-01', [
      baris({ kunci: 'c', urutan: 30, persen_karyawan: 1 }),
      baris({ kunci: 'a', urutan: 10, persen_karyawan: 1 }),
      baris({ kunci: 'b', urutan: 20, persen_karyawan: 1 }),
    ])
    expect(hitungBpjs(q, 1000000)!.map((x) => x.kunci)).toEqual(['a', 'b', 'c'])
  })

  it('periode null atau NOL BARIS → null, bukan daftar kosong', () => {
    expect(hitungBpjs(null, 5000000)).toBeNull()
    // Daftar kosong terbaca "sudah dihitung, tak ada iuran" — pernyataan
    // yang salah. `null` berarti "belum bisa dihitung".
    expect(hitungBpjs(periode('bpjs', '2026-01-01', []), 5000000)).toBeNull()
  })
})
