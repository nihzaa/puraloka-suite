/**
 * TJS-P4 — Segregation of Duties.
 *
 * Test di sini menguji ATURAN-nya (murni, tanpa basis). Jalur nyata —
 * gerbang di rute, penulisan `sod_override`, dan immutability-nya — diuji
 * di `__tests__/sod-gerbang.test.ts` terhadap Postgres sungguhan.
 */
import { describe, it, expect } from 'vitest'
import { ATURAN_SOD, aturanSod, periksaSod } from '../sod.js'

const PENGAJU = '11111111-1111-1111-1111-111111111111'
const ORANG_LAIN = '22222222-2222-2222-2222-222222222222'

describe('ATURAN_SOD — registri', () => {
  it('tak ada jenis kembar', () => {
    const jenis = ATURAN_SOD.map(a => a.jenis)
    expect(new Set(jenis).size).toBe(jenis.length)
  })

  it('tiap entri punya kolom pengaju yang tak kosong', () => {
    // Bukan sekadar bertele-tele: `inbox-approval.ts` punya DUA entri dengan
    // `kolomPengaju: null` yang ternyata SALAH — kolomnya ada di basis.
    // Registri yang membolehkan `null` mengundang tepat kesalahan itu.
    for (const a of ATURAN_SOD) {
      expect(a.kolomPengaju, a.jenis).toBeTruthy()
      expect(a.kolomPengaju.trim(), a.jenis).not.toBe('')
    }
  })

  it('aturanSod() mengembalikan undefined untuk jenis tak dikenal', () => {
    // Penting: BUKAN mengembalikan aturan bawaan yang membolehkan. Pemanggil
    // memperlakukan undefined sebagai TOLAK (fail-closed).
    expect(aturanSod('jenis-karangan')).toBeUndefined()
  })
})

describe('periksaSod — orang berbeda', () => {
  it('membolehkan penyetuju yang bukan pengaju', () => {
    const h = periksaSod({ pengajuId: PENGAJU, penyetujuId: ORANG_LAIN, punyaIzinOverride: false })
    expect(h).toEqual({ boleh: true, overrideDipakai: false })
  })

  it('tidak menganggapnya override meski orangnya punya izin override', () => {
    // Kalau ini keliru, tiap approval oleh pemegang izin override akan
    // menulis baris `sod_override` — dan daftar overridenya jadi tak berarti
    // karena penuh baris yang bukan override.
    const h = periksaSod({ pengajuId: PENGAJU, penyetujuId: ORANG_LAIN, punyaIzinOverride: true, alasanOverride: 'apa pun' })
    expect(h).toEqual({ boleh: true, overrideDipakai: false })
  })
})

describe('periksaSod — pengaju menyetujui miliknya sendiri', () => {
  it('DITOLAK tanpa izin override', () => {
    const h = periksaSod({ pengajuId: PENGAJU, penyetujuId: PENGAJU, punyaIzinOverride: false })
    expect(h.boleh).toBe(false)
    if (!h.boleh) expect(h.sebab).toMatch(/tidak bisa menyetujui pengajuan Anda sendiri/i)
  })

  it('DITOLAK meski punya izin override, bila alasannya kosong', () => {
    const h = periksaSod({ pengajuId: PENGAJU, penyetujuId: PENGAJU, punyaIzinOverride: true, alasanOverride: '' })
    expect(h.boleh).toBe(false)
    if (!h.boleh) expect(h.sebab).toMatch(/alasan tertulis/i)
  })

  it('DITOLAK bila alasannya hanya spasi', () => {
    // `sod_override.alasan` punya CHECK (btrim(alasan) <> '') di basis. Kalau
    // lapisan ini meloloskan spasi, permintaannya sampai ke basis lalu gagal
    // dengan galat Postgres mentah — pengguna melihat pesan yang tak bisa
    // ditindaklanjuti, bukan "alasannya wajib diisi".
    const h = periksaSod({ pengajuId: PENGAJU, penyetujuId: PENGAJU, punyaIzinOverride: true, alasanOverride: '   \t ' })
    expect(h.boleh).toBe(false)
  })

  it('DITOLAK bila alasan tidak diberikan sama sekali', () => {
    const h = periksaSod({ pengajuId: PENGAJU, penyetujuId: PENGAJU, punyaIzinOverride: true })
    expect(h.boleh).toBe(false)
  })

  it('DIIZINKAN dengan izin override + alasan, dan ditandai override', () => {
    const h = periksaSod({
      pengajuId: PENGAJU, penyetujuId: PENGAJU,
      punyaIzinOverride: true, alasanOverride: 'Direktur sedang cuti, pekerjaan tak bisa menunggu',
    })
    expect(h).toEqual({ boleh: true, overrideDipakai: true, pengajuId: PENGAJU })
  })
})

describe('periksaSod — pengaju tak diketahui', () => {
  it('DIIZINKAN dan BUKAN override (data lama)', () => {
    // Keputusan yang disengaja dan berisiko, jadi diuji eksplisit supaya
    // perubahannya kelak terlihat: entitas lama yang kolom pengajunya null
    // tetap bisa disetujui. Memblokirnya melumpuhkan approval atas seluruh
    // data historis.
    for (const kosong of [null, undefined, '']) {
      const h = periksaSod({ pengajuId: kosong, penyetujuId: PENGAJU, punyaIzinOverride: false })
      expect(h, String(kosong)).toEqual({ boleh: true, overrideDipakai: false })
    }
  })
})
