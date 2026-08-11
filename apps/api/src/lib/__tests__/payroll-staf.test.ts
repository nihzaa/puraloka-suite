import { describe, it, expect } from 'vitest'
import { hitungSlip, ringkasPayroll, type PegawaiPayroll } from '../payroll-staf.js'
import type { PeriodeTarif, BarisTarif, JenisTarif } from '../tarif-payroll.js'

// ══════════════════════════════════════════════════════════════════════════
// Angka di fixture ini ANGKA UJI, bukan tarif nyata.
//
// Sengaja tak menyerupai tarif Indonesia mana pun (PTKP 12jt, TER 1%/2%/3%,
// BPJS 10%/5%) supaya tak seorang pun — termasuk saya di sesi berikutnya —
// tergoda menyalinnya ke seed atau ke kode sebagai "bawaan yang masuk akal".
// R-011 melarang tarif hidup di kode; test pun bukan tempatnya.
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

const periode = (jenis: JenisTarif, isi: BarisTarif[], id = jenis): PeriodeTarif => ({
  id, jenis, berlaku_sejak: '2026-01-01',
  dasar_hukum: '[UJI] bukan aturan nyata', baris: isi,
})

/** Ketiga jenis tarif LENGKAP — dipakai test yang menguji hal lain. */
const TARIF_LENGKAP: PeriodeTarif[] = [
  periode('ptkp', [baris({ kunci: 'K/1', nilai_nominal: 15000000 })]),
  periode('ter_pph21', [
    baris({ kunci: 'A', batas_bawah: 0, batas_atas: 6000000, nilai_persen: 1 }),
    baris({ kunci: 'A', batas_bawah: 6000000, batas_atas: null, nilai_persen: 2 }),
  ]),
  periode('bpjs', [
    baris({ kunci: 'jht', label: 'Hari Tua', persen_perusahaan: 10, persen_karyawan: 5 }),
    baris({ kunci: 'jkk', label: 'Kecelakaan Kerja', persen_perusahaan: 1 }),
  ]),
]

function pegawai(p: Partial<PegawaiPayroll> = {}): PegawaiPayroll {
  return {
    id: p.id ?? 'peg-1',
    nomor_induk: p.nomor_induk !== undefined ? p.nomor_induk : 'P-01',
    nama: p.nama ?? 'Uji',
    gaji_pokok: p.gaji_pokok !== undefined ? p.gaji_pokok : 5000000,
    status_ptkp: p.status_ptkp !== undefined ? p.status_ptkp : 'K/1',
    kategori_ter: p.kategori_ter !== undefined ? p.kategori_ter : 'A',
  }
}

const ACUAN = '2026-08-31'

describe('hitungSlip — tarif belum ditetapkan tak boleh jadi angka bawaan', () => {
  it('NOL tarif → tiga penghalang, dan NOL komponen potongan', () => {
    const h = hitungSlip(pegawai(), [], ACUAN)
    const kode = h.penghalang.map((p) => p.kode).sort()
    expect(kode).toEqual(['tarif-bpjs-belum', 'tarif-ptkp-belum', 'tarif-ter-belum'])
    // Yang penting: tak ada potongan yang dibuat dengan angka tebakan.
    expect(h.komponen.filter((k) => k.jenis === 'potongan')).toHaveLength(0)
    expect(h.total_potongan).toBe(0)
    expect(h.pph21).toBe(0)
  })

  it('tarif BPJS ada, TER belum → BPJS dipotong, pajak TIDAK', () => {
    const h = hitungSlip(pegawai(), [TARIF_LENGKAP[2]], ACUAN)
    expect(h.komponen.some((k) => k.kode === 'bpjs_jht')).toBe(true)
    expect(h.komponen.some((k) => k.kode === 'pph21')).toBe(false)
    expect(h.penghalang.map((p) => p.kode)).toContain('tarif-ter-belum')
  })

  it('gaji pokok NULL → penghalang, dan TIDAK jadi 0 diam-diam', () => {
    const h = hitungSlip(pegawai({ gaji_pokok: null }), TARIF_LENGKAP, ACUAN)
    expect(h.penghalang.map((p) => p.kode)).toContain('gaji-pokok-kosong')
    // Komponen gaji pokok tak dibuat — slip dengan "Gaji pokok Rp 0" akan
    // dibayarkan sebagai nol tanpa ada yang tahu itu data yang hilang.
    expect(h.komponen.some((k) => k.kode === 'gaji_pokok')).toBe(false)
  })

  it('gaji pokok string kosong diperlakukan seperti NULL', () => {
    // `Number('') === 0` — pelajaran G2a. Di sini akibatnya: slip Rp 0.
    const h = hitungSlip(pegawai({ gaji_pokok: '' }), TARIF_LENGKAP, ACUAN)
    expect(h.penghalang.map((p) => p.kode)).toContain('gaji-pokok-kosong')
  })

  it('status PTKP kosong dilaporkan terpisah dari kategori TER', () => {
    const h = hitungSlip(
      pegawai({ status_ptkp: null, kategori_ter: null }), TARIF_LENGKAP, ACUAN)
    const kode = h.penghalang.map((p) => p.kode)
    expect(kode).toContain('status-ptkp-kosong')
    expect(kode).toContain('kategori-ter-kosong')
  })
})

describe('hitungSlip — BPJS perusahaan TIDAK mengurangi yang diterima', () => {
  it('bagian perusahaan masuk sebagai `informasi`, bukan `potongan`', () => {
    const h = hitungSlip(pegawai(), TARIF_LENGKAP, ACUAN)
    const kar = h.komponen.find((k) => k.kode === 'bpjs_jht')!
    const per = h.komponen.find((k) => k.kode === 'bpjs_jht_perusahaan')!
    expect(kar.jenis).toBe('potongan')
    // Menjadikannya potongan memotong gaji untuk sesuatu yang bukan
    // tanggungan pegawai — dan angkanya besar (10% vs 5% di fixture ini).
    expect(per.jenis).toBe('informasi')
    expect(per.nominal).toBe(500000)
  })

  it('`informasi` tak ikut penghasilan maupun potongan', () => {
    const h = hitungSlip(pegawai(), TARIF_LENGKAP, ACUAN)
    // penghasilan 5.000.000; potongan: jht karyawan 250.000 + pph21
    expect(h.total_penghasilan).toBe(5000000)
    expect(h.total_potongan).toBe(250000 + h.pph21)
    expect(h.gaji_bersih).toBe(h.total_penghasilan - h.total_potongan)
  })

  it('iuran yang hanya ditanggung perusahaan tak jadi potongan', () => {
    const h = hitungSlip(pegawai(), TARIF_LENGKAP, ACUAN)
    // `jkk` di fixture hanya punya `persen_perusahaan`.
    expect(h.komponen.some((k) => k.kode === 'bpjs_jkk')).toBe(false)
    expect(h.komponen.find((k) => k.kode === 'bpjs_jkk_perusahaan')!.jenis).toBe('informasi')
  })

  it('dasar hitung dicetak supaya bisa ditanyakan', () => {
    const h = hitungSlip(pegawai(), TARIF_LENGKAP, ACUAN)
    expect(h.komponen.find((k) => k.kode === 'bpjs_jht')!.dasar_hitung)
      .toMatch(/5\.000\.000/)
  })
})

describe('hitungSlip — PPh 21 dari BRUTO, PTKP tak dikurangkan dua kali', () => {
  it('pajak = tarif TER × bruto', () => {
    const h = hitungSlip(pegawai(), TARIF_LENGKAP, ACUAN)
    // Bruto 5.000.000 masuk lapisan A pertama (0–6jt) = 1%.
    expect(h.tarif_ter_persen).toBe(1)
    expect(h.pph21).toBe(50000)
  })

  it('PTKP dicatat sebagai JEJAK, bukan dikurangkan dari dasar pajak', () => {
    const h = hitungSlip(pegawai(), TARIF_LENGKAP, ACUAN)
    // PTKP tercatat…
    expect(h.ptkp_setahun).toBe(15000000)
    // …tapi pajaknya tetap 1% × 5.000.000. Mengurangkan PTKP dari bruto
    // berarti menghitungnya DUA KALI — TER sudah mengandungnya, itulah arti
    // "efektif".
    expect(h.pph21).toBe(50000)
  })

  it('lapisan TER dipilih menurut bruto', () => {
    const h = hitungSlip(pegawai({ gaji_pokok: 9000000 }), TARIF_LENGKAP, ACUAN)
    expect(h.tarif_ter_persen).toBe(2)
    expect(h.pph21).toBe(180000)
  })

  it('penghasilan di luar semua lapisan → penghalang, BUKAN 0%', () => {
    const sempit = [
      TARIF_LENGKAP[0], TARIF_LENGKAP[2],
      periode('ter_pph21', [
        baris({ kunci: 'A', batas_bawah: 10000000, batas_atas: null, nilai_persen: 5 }),
      ]),
    ]
    const h = hitungSlip(pegawai({ gaji_pokok: 5000000 }), sempit, ACUAN)
    expect(h.penghalang.map((p) => p.kode)).toContain('lapisan-ter-tak-cocok')
    expect(h.pph21).toBe(0)
    expect(h.komponen.some((k) => k.kode === 'pph21')).toBe(false)
  })

  it('kategori TER dipisahkan — B tak memakai lapisan A', () => {
    const h = hitungSlip(pegawai({ kategori_ter: 'B' }), TARIF_LENGKAP, ACUAN)
    // Fixture hanya punya lapisan A.
    expect(h.penghalang.map((p) => p.kode)).toContain('lapisan-ter-tak-cocok')
  })
})

describe('hitungSlip — masa pajak DESEMBER tak ditebak', () => {
  it('Desember dilaporkan sebagai penghalang', () => {
    const h = hitungSlip(pegawai(), TARIF_LENGKAP, '2026-12-31')
    // Desember memakai perhitungan setahunan (Pasal 17), bukan TER bulanan.
    // Bentuknya berbeda, bukan sekadar angka lain.
    expect(h.penghalang.map((p) => p.kode)).toContain('desember-butuh-setahunan')
  })

  it('bulan selain Desember TIDAK dilaporkan', () => {
    for (const b of ['2026-01-31', '2026-06-30', '2026-11-30']) {
      const h = hitungSlip(pegawai(), TARIF_LENGKAP, b)
      expect(h.penghalang.map((p) => p.kode)).not.toContain('desember-butuh-setahunan')
    }
  })
})

describe('hitungSlip — jejak tarif yang dipakai', () => {
  it('ID periode tarif disimpan, bukan cuma angkanya', () => {
    const h = hitungSlip(pegawai(), TARIF_LENGKAP, ACUAN)
    // "PMK-168/2023 yang Anda tetapkan berlaku 1 Januari" jauh lebih kuat
    // daripada "5% menurut sistem" saat seseorang mempertanyakan potongannya.
    expect(h.tarif_bpjs_id).toBe('bpjs')
    expect(h.tarif_ter_id).toBe('ter_pph21')
    expect(h.tarif_ptkp_id).toBe('ptkp')
  })

  it('tarif yang tak ada → ID `null`, bukan tebakan', () => {
    const h = hitungSlip(pegawai(), [], ACUAN)
    expect(h.tarif_bpjs_id).toBeNull()
    expect(h.tarif_ter_id).toBeNull()
  })
})

describe('ringkasPayroll', () => {
  const bersih = () => hitungSlip(pegawai(), TARIF_LENGKAP, ACUAN)
  const cacat = () => hitungSlip(pegawai({ id: 'peg-2', gaji_pokok: null }), TARIF_LENGKAP, ACUAN)

  it('satu slip bermasalah membuat SELURUH periode tak boleh dikunci', () => {
    const r = ringkasPayroll([bersih(), cacat()])
    expect(r.boleh_dikunci).toBe(false)
    expect(r.bermasalah).toHaveLength(1)
  })

  it('semua bersih → boleh dikunci', () => {
    const r = ringkasPayroll([bersih(), bersih()])
    expect(r.boleh_dikunci).toBe(true)
  })

  it('NOL slip → TIDAK boleh dikunci', () => {
    // Mengunci nol slip berarti menyatakan penggajian bulan itu selesai
    // tanpa seorang pun dibayar.
    const r = ringkasPayroll([])
    expect(r.boleh_dikunci).toBe(false)
    expect(r.jumlah_pegawai).toBe(0)
  })

  it('total dijumlahkan dari slip', () => {
    const s = bersih()
    const r = ringkasPayroll([s, s])
    expect(r.total_penghasilan).toBe(s.total_penghasilan * 2)
    expect(r.total_bersih).toBe(s.gaji_bersih * 2)
    expect(r.total_pph21).toBe(s.pph21 * 2)
  })
})
