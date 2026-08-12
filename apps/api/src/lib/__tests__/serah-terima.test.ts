/**
 * E2 — aturan serah terima PHO/FHO. MURNI, tanpa basis.
 *
 * Yang diuji di sini adalah keputusannya; yang menyentuh Postgres ada di
 * `routes/v1/__tests__/serah-terima.test.ts`.
 */
import { describe, it, expect } from 'vitest'
import {
  porsiRetensiBolehCair,
  periksaPencairanRetensi,
  periksaTransisiSerahTerima,
  periksaKesiapanPho,
  akhirMasaPemeliharaan,
  PORSI_CAIR_PHO_DEFAULT,
  type BeritaAcara,
} from '../serah-terima.js'

const ba = (o: Partial<BeritaAcara> = {}): BeritaAcara => ({
  jenis: 'pho', status: 'ditandatangani', tanggal: '2026-08-01', ...o,
})

describe('porsi retensi yang boleh cair', () => {
  it('tanpa berita acara: NOL — fail-closed', () => {
    const h = porsiRetensiBolehCair([])
    expect(h.boleh).toBe(false)
    expect(h.porsiMaks).toBe(0)
  })

  it('PHO draf TIDAK membuka apa pun — draf adalah niat, bukan kesepakatan', () => {
    const h = porsiRetensiBolehCair([ba({ status: 'draf' })])
    expect(h.boleh).toBe(false)
    expect(h.porsiMaks).toBe(0)
  })

  it('PHO dibatalkan TIDAK membuka apa pun', () => {
    const h = porsiRetensiBolehCair([ba({ status: 'dibatalkan' })])
    expect(h.boleh).toBe(false)
  })

  it('PHO ditandatangani membuka setengah', () => {
    const h = porsiRetensiBolehCair([ba()])
    expect(h.boleh).toBe(true)
    expect(h.porsiMaks).toBe(PORSI_CAIR_PHO_DEFAULT)
    expect(h.sebab).toMatch(/menunggu FHO/i)
  })

  it('FHO ditandatangani membuka seluruhnya', () => {
    const h = porsiRetensiBolehCair([ba(), ba({ jenis: 'fho' })])
    expect(h.porsiMaks).toBe(1)
  })

  it('FHO menang atas PHO walau urutan daftarnya terbalik', () => {
    const h = porsiRetensiBolehCair([ba({ jenis: 'fho' }), ba()])
    expect(h.porsiMaks).toBe(1)
  })

  it('porsi di luar 0–1 KEMBALI ke default, tidak di-clamp diam-diam', () => {
    // 1.5 yang jadi 1 berarti PHO mencairkan seluruh retensi tanpa seorang
    // pun menyadari aturannya dilanggar.
    expect(porsiRetensiBolehCair([ba()], 1.5).porsiMaks).toBe(PORSI_CAIR_PHO_DEFAULT)
    expect(porsiRetensiBolehCair([ba()], 0).porsiMaks).toBe(PORSI_CAIR_PHO_DEFAULT)
    expect(porsiRetensiBolehCair([ba()], -0.3).porsiMaks).toBe(PORSI_CAIR_PHO_DEFAULT)
    expect(porsiRetensiBolehCair([ba()], NaN).porsiMaks).toBe(PORSI_CAIR_PHO_DEFAULT)
  })

  it('porsi khusus tenant (30%) dipakai apa adanya', () => {
    expect(porsiRetensiBolehCair([ba()], 0.3).porsiMaks).toBe(0.3)
  })
})

describe('gerbang pencairan retensi', () => {
  const D = { ditahan: 10_000_000, sudahDicairkan: 0 }

  it('MENOLAK saat belum ada serah terima — inti seluruh E2', () => {
    const v = periksaPencairanRetensi({ ...D, diminta: 1_000_000, daftar: [] })
    expect(v.ok).toBe(false)
    if (!v.ok) expect(v.galat).toMatch(/belum ada berita acara/i)
  })

  it('PHO membuka setengah, bukan seluruhnya', () => {
    const v = periksaPencairanRetensi({ ...D, diminta: 5_000_000, daftar: [ba()] })
    expect(v.ok).toBe(true)
    expect(v.plafon).toBe(5_000_000)
  })

  it('permintaan melebihi plafon PHO ditolak walau saldo mencukupi', () => {
    // Justru kasus ini yang lolos sebelum E2: saldo 10 juta memang ada, tapi
    // masa pemeliharaan belum lewat.
    const v = periksaPencairanRetensi({ ...D, diminta: 7_000_000, daftar: [ba()] })
    expect(v.ok).toBe(false)
    if (!v.ok) {
      expect(v.galat).toMatch(/melebihi plafon/i)
      expect(v.galat).toMatch(/setelah FHO/i)
    }
  })

  it('FHO membuka sisanya', () => {
    const v = periksaPencairanRetensi({
      ditahan: 10_000_000, sudahDicairkan: 5_000_000, diminta: 5_000_000,
      daftar: [ba(), ba({ jenis: 'fho' })],
    })
    expect(v.ok).toBe(true)
    expect(v.plafon).toBe(10_000_000)
    expect(v.tersedia).toBe(5_000_000)
  })

  it('plafon tahap yang sudah habis memberi pesan yang menyebut FHO', () => {
    const v = periksaPencairanRetensi({
      ditahan: 10_000_000, sudahDicairkan: 5_000_000, diminta: 1,
      daftar: [ba()],
    })
    expect(v.ok).toBe(false)
    if (!v.ok) expect(v.galat).toMatch(/sudah cair seluruhnya/i)
  })

  it('nol dan negatif ditolak — bukan diperlakukan sebagai tak-apa-apa', () => {
    expect(periksaPencairanRetensi({ ...D, diminta: 0, daftar: [ba()] }).ok).toBe(false)
    expect(periksaPencairanRetensi({ ...D, diminta: -1, daftar: [ba()] }).ok).toBe(false)
  })

  it('NaN ditolak', () => {
    expect(periksaPencairanRetensi({ ...D, diminta: NaN, daftar: [ba()] }).ok).toBe(false)
  })

  it('toleransi 1 sen diterima — pembulatan NUMERIC(15,2), bukan kelonggaran', () => {
    const v = periksaPencairanRetensi({
      ditahan: 10_000_000, sudahDicairkan: 0, diminta: 5_000_000.005, daftar: [ba()],
    })
    expect(v.ok).toBe(true)
  })
})

describe('transisi status', () => {
  const dasar = { adaTtdPenyerah: true, adaTtdPenerima: true }

  it('draf → ditandatangani dengan dua tanda tangan', () => {
    const h = periksaTransisiSerahTerima({
      statusSekarang: 'draf', statusTujuan: 'ditandatangani', ...dasar,
    })
    expect(h.boleh).toBe(true)
  })

  it('satu tanda tangan ditolak, dan pesannya menyebut PIHAK MANA', () => {
    const h = periksaTransisiSerahTerima({
      statusSekarang: 'draf', statusTujuan: 'ditandatangani',
      adaTtdPenyerah: true, adaTtdPenerima: false,
    })
    expect(h.boleh).toBe(false)
    if (!h.boleh) expect(h.sebab).toMatch(/tanda tangan penerima/i)
  })

  it('nol tanda tangan menyebut keduanya', () => {
    const h = periksaTransisiSerahTerima({
      statusSekarang: 'draf', statusTujuan: 'ditandatangani',
      adaTtdPenyerah: false, adaTtdPenerima: false,
    })
    if (!h.boleh) expect(h.sebab).toMatch(/kedua tanda tangan/i)
  })

  it('yang sudah dibatalkan tak bisa diapa-apakan', () => {
    const h = periksaTransisiSerahTerima({
      statusSekarang: 'dibatalkan', statusTujuan: 'ditandatangani', ...dasar,
    })
    expect(h.boleh).toBe(false)
  })

  it('pembatalan wajib beralasan', () => {
    const tanpa = periksaTransisiSerahTerima({
      statusSekarang: 'ditandatangani', statusTujuan: 'dibatalkan', ...dasar,
    })
    expect(tanpa.boleh).toBe(false)

    const dengan = periksaTransisiSerahTerima({
      statusSekarang: 'ditandatangani', statusTujuan: 'dibatalkan', ...dasar,
      alasanBatal: 'Salah lingkup — seharusnya per work scope',
    })
    expect(dengan.boleh).toBe(true)
  })

  it('alasan berisi spasi saja TIDAK dihitung sebagai alasan', () => {
    const h = periksaTransisiSerahTerima({
      statusSekarang: 'draf', statusTujuan: 'dibatalkan', ...dasar, alasanBatal: '   ',
    })
    expect(h.boleh).toBe(false)
  })

  it('tak bisa kembali ke draf', () => {
    const h = periksaTransisiSerahTerima({
      statusSekarang: 'ditandatangani', statusTujuan: 'draf', ...dasar,
    })
    expect(h.boleh).toBe(false)
    if (!h.boleh) expect(h.sebab).toMatch(/batalkan dan terbitkan/i)
  })
})

describe('kesiapan PHO', () => {
  it('cacat terbuka membuat TIDAK siap, tapi pesannya tak melarang', () => {
    const k = periksaKesiapanPho({ punchTerbuka: 19, punchTotal: 19 })
    expect(k.siap).toBe(false)
    expect(k.sebab).toMatch(/19 dari 19/)
    // PHO bersyarat sah — melarangnya membuat orang menutup punch item massal
    // supaya tombolnya menyala.
    expect(k.sebab).toMatch(/tetap bisa diterbitkan/i)
  })

  it('semua tertutup: siap', () => {
    const k = periksaKesiapanPho({ punchTerbuka: 0, punchTotal: 12 })
    expect(k.siap).toBe(true)
  })

  it('nol temuan: siap, TAPI mengingatkan bedanya dengan belum diperiksa', () => {
    const k = periksaKesiapanPho({ punchTerbuka: 0, punchTotal: 0 })
    expect(k.siap).toBe(true)
    expect(k.sebab).toMatch(/belum diperiksa/i)
  })

  it('angka tak sah diperlakukan nol, tidak melempar', () => {
    expect(periksaKesiapanPho({ punchTerbuka: NaN, punchTotal: NaN }).siap).toBe(true)
    expect(periksaKesiapanPho({ punchTerbuka: -5, punchTotal: 10 }).punchTerbuka).toBe(0)
  })
})

describe('akhir masa pemeliharaan', () => {
  it('90 hari sesudah PHO', () => {
    expect(akhirMasaPemeliharaan('2026-08-01', 90)).toBe('2026-10-30')
  })

  it('null saat masa tak diisi — bukan tanggal PHO itu sendiri', () => {
    // Mengembalikan tanggal PHO berarti masa pemeliharaan nol hari, dan itu
    // keputusan yang tak pernah diambil siapa pun.
    expect(akhirMasaPemeliharaan('2026-08-01', null)).toBeNull()
    expect(akhirMasaPemeliharaan('2026-08-01', undefined)).toBeNull()
  })

  it('tanggal tak terbaca → null, tidak melempar', () => {
    expect(akhirMasaPemeliharaan('bukan-tanggal', 90)).toBeNull()
  })

  it('nol hari sah — dan berbeda dari null', () => {
    expect(akhirMasaPemeliharaan('2026-08-01', 0)).toBe('2026-08-01')
  })
})
