import { describe, it, expect } from 'vitest'
import {
  tanggalSelesaiEfektif, resolveSyaratLD, hitungLD, ringkasBond,
  type BarisEOT, type SyaratLD, type InputLD, type BarisBond,
} from '../rantai-kontrak'

// LD arah kontraktor adalah UANG NYATA yang ditagihkan pemberi kerja. Dua hal
// yang salahnya paling mahal, dan keduanya tak berbunyi:
//   1. menghitung dari `end_date` mentah, bukan tanggal EFEKTIF sesudah EOT →
//      menagih denda atas keterlambatan yang sudah dimaafkan secara kontraktual
//   2. batas 5% dihitung dari dasar yang menyusut (sisa pekerjaan), bukan dari
//      nilai kontrak → makin dekat selesai, batas dendanya makin kecil

const eot = (hari: number, status: BarisEOT['status'] = 'disetujui'): BarisEOT =>
  ({ hariTambahan: hari, status })

const syarat = (o: Partial<SyaratLD> = {}): SyaratLD => ({
  aktif: true, basis: 'nilai_kontrak',
  tarifPerHari: 0.001, batasPct: 0.05, hariTenggang: 0, ...o,
})

const input = (o: Partial<InputLD> = {}): InputLD => ({
  syarat: syarat(),
  nilaiKontrak: 1_000_000_000,
  progressPct: 0,
  tanggalKontrak: '2026-06-30',
  daftarEOT: [],
  tanggalAcuan: '2026-07-10',
  ...o,
})

describe('tanggal selesai efektif — EOT', () => {
  it('tanpa EOT → tanggal efektif = tanggal kontrak', () => {
    const r = tanggalSelesaiEfektif('2026-06-30', [])
    expect(r.tanggalEfektif).toBe('2026-06-30')
    expect(r.totalHariEOT).toBe(0)
  })

  it('EOT disetujui menggeser tanggal', () => {
    const r = tanggalSelesaiEfektif('2026-06-30', [eot(30)])
    expect(r.tanggalEfektif).toBe('2026-07-30')
    expect(r.totalHariEOT).toBe(30)
  })

  it('beberapa EOT dijumlahkan', () => {
    const r = tanggalSelesaiEfektif('2026-06-30', [eot(14), eot(21)])
    expect(r.totalHariEOT).toBe(35)
    expect(r.tanggalEfektif).toBe('2026-08-04')
  })

  it('EOT DIAJUKAN tidak menggeser apa pun', () => {
    // Kalau pengajuan sudah cukup menunda denda, tiap kontraktor yang telat
    // tinggal mengajukan EOT dan mekanismenya jadi tak berarti.
    const r = tanggalSelesaiEfektif('2026-06-30', [eot(30, 'diajukan')])
    expect(r.tanggalEfektif).toBe('2026-06-30')
    expect(r.totalHariEOT).toBe(0)
    expect(r.eotMenggantung).toBe(1)
  })

  it('EOT DITOLAK tidak menggeser', () => {
    const r = tanggalSelesaiEfektif('2026-06-30', [eot(30, 'ditolak')])
    expect(r.tanggalEfektif).toBe('2026-06-30')
    expect(r.eotMenggantung).toBe(0)
  })

  it('hari NEGATIF diabaikan, tidak memajukan tenggat', () => {
    // Salah input yang memajukan tenggat akan MENAMBAH denda — kerugian yang
    // lahir dari kesalahan ketik, dan tak seorang pun akan mencurigainya.
    const r = tanggalSelesaiEfektif('2026-06-30', [eot(-30)])
    expect(r.tanggalEfektif).toBe('2026-06-30')
    expect(r.totalHariEOT).toBe(0)
  })

  it('menghitung EOT yang masih menggantung', () => {
    const r = tanggalSelesaiEfektif('2026-06-30', [eot(10), eot(5, 'diajukan'), eot(7, 'diajukan')])
    expect(r.totalHariEOT).toBe(10)
    expect(r.eotMenggantung).toBe(2)
  })

  it('lintas bulan & tahun dihitung benar', () => {
    expect(tanggalSelesaiEfektif('2026-12-20', [eot(30)]).tanggalEfektif).toBe('2027-01-19')
  })
})

describe('LD — inti: EOT menghapus denda yang sudah dimaafkan', () => {
  it('telat 10 hari tanpa EOT → 1‰ × 10 hari', () => {
    const r = hitungLD(input())
    expect(r.hariTelat).toBe(10)
    expect(r.denda).toBe(10_000_000)   // 1 M × 0,001 × 10
    expect(r.adaDenda).toBe(true)
  })

  it('EOT disetujui membuat denda NOL — ini alasan #16 ada', () => {
    // Tanpa memakai tanggal efektif, ini akan menagih Rp 10 jt untuk
    // keterlambatan yang secara kontraktual sudah dimaafkan.
    const r = hitungLD(input({ daftarEOT: [eot(30)] }))
    expect(r.adaDenda).toBe(false)
    expect(r.denda).toBe(0)
    expect(r.hariTelat).toBe(0)
  })

  it('alasan nol menyebut EOT-nya, bukan sekadar "tidak telat"', () => {
    // Tanpa penyebutan itu, pemberi kerja melihat "tidak telat" pada proyek
    // yang jelas lewat tanggal kontrak aslinya, dan mengira sistemnya salah.
    const r = hitungLD(input({ daftarEOT: [eot(30)] }))
    expect(r.alasan).toContain('2026-07-30')
    expect(r.alasan).toContain('EOT')
  })

  it('EOT sebagian: 30 hari telat, EOT 20 hari → denda 10 hari', () => {
    const r = hitungLD(input({ tanggalAcuan: '2026-07-30', daftarEOT: [eot(20)] }))
    expect(r.hariTelat).toBe(10)
    expect(r.denda).toBe(10_000_000)
  })

  it('EOT yang baru DIAJUKAN tidak mengurangi denda', () => {
    const r = hitungLD(input({ daftarEOT: [eot(30, 'diajukan')] }))
    expect(r.denda).toBe(10_000_000)
    expect(r.tanggal.eotMenggantung).toBe(1)
  })
})

describe('LD — batas & basis', () => {
  it('denda dibatasi di batasPct dari NILAI KONTRAK', () => {
    // 100 hari × 1‰ = 10% → dipotong ke 5%.
    const r = hitungLD(input({ tanggalAcuan: '2026-10-08' }))
    expect(r.hariTelat).toBe(100)
    expect(r.dendaSebelumBatas).toBe(100_000_000)
    expect(r.denda).toBe(50_000_000)
    expect(r.kenaBatas).toBe(true)
  })

  it('basis sisa_pekerjaan memakai (100 − progres)', () => {
    const r = hitungLD(input({
      syarat: syarat({ basis: 'sisa_pekerjaan' }), progressPct: 80,
    }))
    expect(r.dasarPerhitungan).toBe(200_000_000)   // 20% dari 1 M
    expect(r.denda).toBe(2_000_000)                // × 0,001 × 10 hari
  })

  it('BATAS tetap dari nilai kontrak meski basisnya sisa pekerjaan', () => {
    // Kalau batas ikut menyusut bersama dasar, proyek yang hampir selesai
    // praktis tak bisa didenda: 5% × sisa 100 jt = 5 jt saja. Praktiknya
    // kebalikan — batas 5% adalah 5% dari NILAI KONTRAK, titik.
    //
    // Angka dipilih supaya benar-benar MENYENTUH batas: 600 hari × 1‰ ×
    // 100 jt = 60 jt > 50 jt. Percobaan pertama memakai 365 hari dan hanya
    // menghasilkan 36,5 jt — lulus tanpa pernah menguji pembatasnya, persis
    // jenis test yang terlihat menjaga padahal tidak.
    const r = hitungLD(input({
      syarat: syarat({ basis: 'sisa_pekerjaan' }),
      progressPct: 90, tanggalAcuan: '2028-02-20',
    }))
    expect(r.hariTelat).toBeGreaterThan(500)
    expect(r.dasarPerhitungan).toBe(100_000_000)
    expect(r.batasNominal).toBe(50_000_000)   // 5% × 1 M, BUKAN 5% × 100 jt
    expect(r.denda).toBe(50_000_000)
    expect(r.kenaBatas).toBe(true)
  })

  it('progres 100% → tak ada sisa yang bisa didenda', () => {
    const r = hitungLD(input({
      syarat: syarat({ basis: 'sisa_pekerjaan' }), progressPct: 100,
    }))
    expect(r.adaDenda).toBe(false)
    expect(r.alasan).toContain('100%')
    // Hari telatnya TETAP dilaporkan — telat itu fakta, dendanya yang nol.
    expect(r.hariTelat).toBe(10)
  })

  it('progres di luar 0..100 DIJEPIT — dasar tak pernah negatif', () => {
    // ⚠️ Versi pertama test ini hanya memeriksa `denda === 0`, dan uji mutasi
    // membuktikannya TIDAK MENJAGA APA PUN: tanpa jepit, progres 130 memberi
    // dasar −300 jt yang lalu tertangkap cabang `dasar <= 0`, jadi dendanya
    // kebetulan tetap 0 dan test tetap hijau. Yang harus diperiksa adalah
    // JALURNYA — dasar yang dilaporkan, bukan cuma hasil akhirnya.
    const r = hitungLD(input({
      syarat: syarat({ basis: 'sisa_pekerjaan' }), progressPct: 130,
    }))
    expect(r.dasarPerhitungan).toBe(0)          // dijepit ke 100 → sisa 0
    expect(r.dasarPerhitungan).not.toBeLessThan(0)
    expect(r.denda).toBe(0)

    // Progres negatif (salah input arah lain) tak boleh MELEBIHI kontrak:
    // tanpa jepit bawah, −20 memberi dasar 1,2 M — denda melampaui nilai
    // kontraknya sendiri.
    const r2 = hitungLD(input({
      syarat: syarat({ basis: 'sisa_pekerjaan' }), progressPct: -20,
    }))
    expect(r2.dasarPerhitungan).toBe(1_000_000_000)
    expect(r2.dasarPerhitungan).not.toBeGreaterThan(1_000_000_000)
  })

  it('hari tenggang menunda mulainya denda', () => {
    const r = hitungLD(input({ syarat: syarat({ hariTenggang: 14 }) }))
    expect(r.hariTelat).toBe(0)
    expect(r.adaDenda).toBe(false)
  })
})

describe('LD — gerbang', () => {
  it('tidak aktif → nol, dengan alasan yang jelas', () => {
    const r = hitungLD(input({ syarat: syarat({ aktif: false }) }))
    expect(r.adaDenda).toBe(false)
    expect(r.alasan).toContain('tidak diaktifkan')
  })

  it('diputihkan → nol, alasan menyebut waiver', () => {
    const r = hitungLD(input({ diputihkan: true }))
    expect(r.denda).toBe(0)
    expect(r.alasan).toContain('waiver')
  })

  it('nol denda SELALU membawa alasan — "0" tak boleh ambigu', () => {
    // Rp 0 bisa berarti: tak telat, tak aktif, diputihkan, atau sudah selesai.
    // Tanpa alasan, keempatnya terlihat sama di layar.
    for (const kasus of [
      input({ syarat: syarat({ aktif: false }) }),
      input({ diputihkan: true }),
      input({ tanggalAcuan: '2026-06-01' }),
      input({ syarat: syarat({ basis: 'sisa_pekerjaan' }), progressPct: 100 }),
    ]) {
      expect(hitungLD(kasus).alasan).toBeTruthy()
    }
  })

  it('ada denda → alasan null (tak ada yang perlu dijelaskan)', () => {
    expect(hitungLD(input()).alasan).toBeNull()
  })
})

describe('resolveSyaratLD — override per proyek', () => {
  const global = syarat({ tarifPerHari: 0.001, batasPct: 0.05 })

  it('override per-field menang, sisanya dari global', () => {
    const r = resolveSyaratLD({ tarifPerHari: 0.002 }, global)
    expect(r.tarifPerHari).toBe(0.002)
    expect(r.batasPct).toBe(0.05)
  })

  it('null/undefined jatuh ke global', () => {
    expect(resolveSyaratLD({ tarifPerHari: null }, global).tarifPerHari).toBe(0.001)
    expect(resolveSyaratLD(null, global)).toEqual(global)
  })

  it('override `aktif: false` menang atas global true', () => {
    // Proyek yang kontraknya memang tak berdenda harus bisa mematikannya,
    // dan `false` mudah tertelan oleh `??` yang salah tulis (`||`).
    expect(resolveSyaratLD({ aktif: false }, syarat({ aktif: true })).aktif).toBe(false)
  })

  it('override `hariTenggang: 0` menang atas global 14', () => {
    // Jebakan yang sama dengan `aktif: false` — nol adalah nilai yang sah.
    expect(resolveSyaratLD({ hariTenggang: 0 }, syarat({ hariTenggang: 14 })).hariTenggang).toBe(0)
  })
})

describe('register jaminan', () => {
  const bond = (o: Partial<BarisBond> = {}): BarisBond => ({
    jenis: 'pelaksanaan', nilai: 50_000_000,
    tanggalTerbit: '2026-01-01', tanggalKadaluarsa: '2026-12-31',
    status: 'aktif', ...o,
  })

  it('menjumlahkan hanya yang AKTIF', () => {
    const r = ringkasBond([
      bond(), bond({ nilai: 30_000_000 }),
      bond({ nilai: 99_000_000, status: 'dikembalikan' }),
    ], '2026-06-01')
    expect(r.totalAktif).toBe(80_000_000)
    expect(r.jumlahAktif).toBe(2)
  })

  it('menandai yang kadaluarsa ≤ 30 hari', () => {
    // Jaminan kadaluarsa tanpa diperpanjang = uang hilang: pemberi kerja bisa
    // mencairkan, atau kontraktor kehilangan hak ikut tender berikutnya.
    const r = ringkasBond([bond({ tanggalKadaluarsa: '2026-06-20' })], '2026-06-01')
    expect(r.segeraKadaluarsa).toHaveLength(1)
    expect(r.segeraKadaluarsa[0].sisaHari).toBe(19)
  })

  it('yang paling mendesak di urutan atas', () => {
    const r = ringkasBond([
      bond({ tanggalKadaluarsa: '2026-06-25' }),
      bond({ tanggalKadaluarsa: '2026-06-05' }),
    ], '2026-06-01')
    expect(r.segeraKadaluarsa.map((b) => b.sisaHari)).toEqual([4, 24])
  })

  it('sudah lewat tapi status masih aktif → telatDiperbarui, BUKAN segera', () => {
    // Dipisah karena tindakannya beda: yang segera perlu diperpanjang, yang
    // telat perlu diperiksa apakah benar-benar masih berlaku.
    const r = ringkasBond([bond({ tanggalKadaluarsa: '2026-05-01' })], '2026-06-01')
    expect(r.telatDiperbarui).toHaveLength(1)
    expect(r.segeraKadaluarsa).toHaveLength(0)
  })

  it('yang masih lama tak ikut diperingatkan', () => {
    const r = ringkasBond([bond({ tanggalKadaluarsa: '2026-12-31' })], '2026-06-01')
    expect(r.segeraKadaluarsa).toHaveLength(0)
    expect(r.telatDiperbarui).toHaveLength(0)
  })

  it('register kosong → nol semua, tanpa error', () => {
    const r = ringkasBond([], '2026-06-01')
    expect(r).toMatchObject({ totalAktif: 0, jumlahAktif: 0 })
  })
})
