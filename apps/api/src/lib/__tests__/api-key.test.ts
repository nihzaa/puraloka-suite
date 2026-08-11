import { describe, it, expect } from 'vitest'
import {
  AWALAN_KUNCI, buatKunci, hashKunci, hashSama, bentukSah,
  periksaKunci, punyaIzin, periksaPermintaan, kedaluwarsaDari,
  type KunciTersimpan,
} from '../api-key.js'

/**
 * Test pustaka API key.
 *
 * Yang dijaga di sini bukan "fungsinya menghasilkan string", melainkan bahwa
 * **kunci tak bisa lahir lemah, tak bisa hidup selamanya, dan tak bisa
 * mendapat izin yang tak diberikan.**
 */

const K = (o: Partial<KunciTersimpan> = {}): KunciTersimpan => ({
  id: o.id ?? 'k1',
  company_id: o.company_id ?? 'c1',
  izin: 'izin' in o ? o.izin! : ['projects:view'],
  kedaluwarsa_pada: 'kedaluwarsa_pada' in o
    ? o.kedaluwarsa_pada! : new Date(Date.now() + 86_400_000).toISOString(),
  dicabut_pada: 'dicabut_pada' in o ? o.dicabut_pada! : null,
})

describe('buatKunci', () => {
  it('berawalan plk_ supaya bisa dikenali saat bocor', () => {
    // Kunci tanpa tanda, begitu tertempel di repo publik atau riwayat chat,
    // tak bisa dikenali siapa pun sebagai kredensial.
    expect(buatKunci().kunci.startsWith(AWALAN_KUNCI)).toBe(true)
  })

  it('bagian acaknya 43 karakter (32 byte base64url)', () => {
    const k = buatKunci()
    expect(k.kunci.slice(AWALAN_KUNCI.length)).toHaveLength(43)
  })

  it('dua kunci berturut TIDAK sama', () => {
    // Kunci yang bisa diramalkan sama saja dengan tak ada kunci.
    const a = new Set(Array.from({ length: 200 }, () => buatKunci().kunci))
    expect(a.size).toBe(200)
  })

  it('hash cocok dengan kuncinya', () => {
    const k = buatKunci()
    expect(k.hash).toBe(hashKunci(k.kunci))
  })

  it('hash berbentuk 64 heksadesimal — bentuk yang ditegakkan basis', () => {
    expect(buatKunci().hash).toMatch(/^[0-9a-f]{64}$/)
  })

  it('awalan 8 karakter, terlalu pendek untuk dipakai', () => {
    const k = buatKunci()
    expect(k.awalan).toHaveLength(8)
    expect(k.kunci.startsWith(k.awalan)).toBe(true)
    // Dan ia BUKAN kuncinya.
    expect(k.awalan).not.toBe(k.kunci)
  })

  it('kunci penuh TIDAK bisa disusun ulang dari hash + awalan', () => {
    // Ini yang membedakan hash dari enkripsi: tak ada jalan balik.
    const k = buatKunci()
    expect(k.hash).not.toContain(k.kunci.slice(AWALAN_KUNCI.length))
  })
})

describe('hashSama — perbandingan waktu tetap', () => {
  it('hash identik cocok', () => {
    const h = hashKunci('plk_uji')
    expect(hashSama(h, h)).toBe(true)
  })
  it('hash berbeda tidak cocok', () => {
    expect(hashSama(hashKunci('a'), hashKunci('b'))).toBe(false)
  })
  it('panjang berbeda tidak melempar', () => {
    expect(hashSama('abc', hashKunci('a'))).toBe(false)
  })
  it('bukan heksadesimal tidak melempar', () => {
    expect(hashSama('z'.repeat(64), hashKunci('a'))).toBe(false)
  })
})

describe('bentukSah — menolak lebih awal', () => {
  it('kunci yang dibuat sendiri sah', () => {
    expect(bentukSah(buatKunci().kunci)).toBe(true)
  })
  it('tanpa awalan ditolak', () => {
    expect(bentukSah('a'.repeat(43))).toBe(false)
  })
  it('terlalu pendek ditolak', () => {
    expect(bentukSah('plk_pendek')).toBe(false)
  })
  it('null/kosong ditolak', () => {
    expect(bentukSah(null)).toBe(false)
    expect(bentukSah('')).toBe(false)
  })
  it('karakter di luar base64url ditolak', () => {
    expect(bentukSah('plk_' + '!'.repeat(43))).toBe(false)
  })
})

describe('periksaKunci — gagal-tertutup', () => {
  it('kunci hidup diterima', () => {
    expect(periksaKunci(K()).sah).toBe(true)
  })

  it('kunci tak ditemukan ditolak', () => {
    const r = periksaKunci(null)
    expect(r.sah).toBe(false)
    if (!r.sah) expect(r.kode).toBe('tak_dikenal')
  })

  it('kunci DICABUT ditolak meski belum kedaluwarsa', () => {
    const r = periksaKunci(K({ dicabut_pada: new Date().toISOString() }))
    expect(r.sah).toBe(false)
    if (!r.sah) expect(r.kode).toBe('dicabut')
  })

  it('kunci KEDALUWARSA ditolak', () => {
    const r = periksaKunci(K({
      kedaluwarsa_pada: new Date(Date.now() - 1000).toISOString(),
    }))
    expect(r.sah).toBe(false)
    if (!r.sah) expect(r.kode).toBe('kedaluwarsa')
  })

  it('kedaluwarsa PERSIS sekarang ditolak — batasnya eksklusif', () => {
    // Batas inklusif berarti kunci masih hidup pada milidetik terakhirnya.
    // Untuk kredensial, ragu berarti tolak.
    const t = new Date()
    expect(periksaKunci(K({ kedaluwarsa_pada: t.toISOString() }), t).sah).toBe(false)
  })

  it('kunci TANPA masa berlaku ditolak, bukan dianggap abadi', () => {
    // Kolomnya NOT NULL, jadi ini mustahil lewat jalur biasa. Kalau tetap
    // terjadi, yang benar adalah menolak: kunci abadi adalah keadaan yang tak
    // seorang pun putuskan.
    const r = periksaKunci(K({ kedaluwarsa_pada: null }))
    expect(r.sah).toBe(false)
    if (!r.sah) expect(r.kode).toBe('kedaluwarsa')
  })

  it('null ditolak SECARA EKSPLISIT, bukan kebetulan lewat Date(null)', () => {
    // Ditemukan mutasi: membuang penjaga `!k.kedaluwarsa_pada` tak membuat
    // test merah, karena `new Date(null).getTime()` kebetulan 0 dan cabang
    // berikutnya tetap menolak.
    //
    // Kebetulan itu rapuh: kalau perbandingan tanggal kelak diganti (misalnya
    // memakai string seperti di lib/baseline-jadwal.ts), `null` akan lolos
    // tanpa satu pun test merah. Yang diuji di sini: penolakan terjadi
    // SEBELUM tanggal dibaca — dibuktikan dengan tanggal yang, kalau dibaca,
    // justru menghasilkan kunci yang SAH.
    // Acuan SEBELUM epoch. `new Date(null).getTime()` adalah 0, jadi lewat
    // jalur tanggal `0 <= acuan` bernilai FALSE dan kuncinya akan dianggap
    // sah. Hanya penjaga eksplisit yang bisa menolaknya di sini.
    const sebelumEpoch = new Date('1960-01-01T00:00:00.000Z')
    const r = periksaKunci(K({ kedaluwarsa_pada: null }), sebelumEpoch)
    expect(r.sah).toBe(false)
  })
})

describe('punyaIzin — tak ada wildcard', () => {
  it('izin yang diberikan cocok', () => {
    expect(punyaIzin(['projects:view'], 'projects:view')).toBe(true)
  })

  it('izin yang TIDAK diberikan ditolak', () => {
    expect(punyaIzin(['projects:view'], 'projects:edit')).toBe(false)
  })

  it('daftar kosong = tak bisa apa-apa', () => {
    // Bawaan yang benar. Kunci yang lahir dengan seluruh izin adalah cara
    // paling cepat kehilangan kendali.
    expect(punyaIzin([], 'projects:view')).toBe(false)
    expect(punyaIzin(null, 'projects:view')).toBe(false)
  })

  it('"*" BUKAN semua izin — ia izin bernama bintang', () => {
    // Membiarkan wildcard berarti satu salah ketik memberi akses penuh.
    expect(punyaIzin(['*'], 'projects:view')).toBe(false)
    expect(punyaIzin(['*'], '*')).toBe(true)
  })

  it('awalan yang cocok sebagian TIDAK lolos', () => {
    expect(punyaIzin(['projects:view'], 'projects:view:all')).toBe(false)
    expect(punyaIzin(['projects'], 'projects:view')).toBe(false)
  })
})

describe('periksaPermintaan', () => {
  it('nama kosong ditolak', () => {
    expect(periksaPermintaan('', 'sinkron data ke sistem akuntansi', 30)).toMatch(/Nama/)
    expect(periksaPermintaan('   ', 'sinkron data ke sistem akuntansi', 30)).toMatch(/Nama/)
  })

  it('keperluan terlalu pendek ditolak dengan sebabnya', () => {
    const p = periksaPermintaan('Kunci A', 'sinkron', 30)
    expect(p).toMatch(/10 huruf/)
    expect(p).toMatch(/berani mencabutnya/)
  })

  it('masa berlaku KOSONG ditolak — Number("") adalah 0', () => {
    // Tanpa pemeriksaan panjang, masa berlaku yang dikosongkan menjadi
    // "0 hari" dan kuncinya mati saat itu juga.
    expect(periksaPermintaan('Kunci A', 'sinkron data ke sistem akuntansi', '' as unknown as number))
      .toMatch(/wajib diisi/)
    expect(periksaPermintaan('Kunci A', 'sinkron data ke sistem akuntansi', null))
      .toMatch(/wajib diisi/)
  })

  it('0 dan negatif ditolak', () => {
    expect(periksaPermintaan('Kunci A', 'sinkron data ke sistem akuntansi', 0)).toMatch(/minimal 1/)
    expect(periksaPermintaan('Kunci A', 'sinkron data ke sistem akuntansi', -5)).toMatch(/minimal 1/)
  })

  it('lebih dari 2 tahun ditolak', () => {
    // Kunci yang berlaku lebih lama tak pernah dipertanyakan lagi.
    expect(periksaPermintaan('Kunci A', 'sinkron data ke sistem akuntansi', 731))
      .toMatch(/730/)
  })

  it('lengkap → null', () => {
    expect(periksaPermintaan('Kunci A', 'sinkron data ke sistem akuntansi', 90)).toBeNull()
  })

  it('batas 1 dan 730 diterima', () => {
    expect(periksaPermintaan('A', 'sinkron data ke sistem akuntansi', 1)).toBeNull()
    expect(periksaPermintaan('A', 'sinkron data ke sistem akuntansi', 730)).toBeNull()
  })
})

describe('kedaluwarsaDari', () => {
  it('30 hari dari acuan', () => {
    const mulai = new Date('2026-01-01T00:00:00.000Z')
    expect(kedaluwarsaDari(30, mulai)).toBe('2026-01-31T00:00:00.000Z')
  })

  it('hasilnya di MASA DEPAN, jadi kunci baru langsung sah', () => {
    const k = K({ kedaluwarsa_pada: kedaluwarsaDari(1) })
    expect(periksaKunci(k).sah).toBe(true)
  })
})
