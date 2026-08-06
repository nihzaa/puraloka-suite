import { describe, it, expect } from 'vitest'
import { keFormatWa } from '../Kontak'

describe('keFormatWa', () => {
  it('mengubah awalan 0 jadi 62', () => {
    expect(keFormatWa('081311081813')).toBe('6281311081813')
  })

  // Nomor di compro PDF ditulis dengan tanda hubung. Admin kemungkinan besar
  // menyalinnya apa adanya ke CMS.
  it('membuang tanda hubung dan spasi', () => {
    expect(keFormatWa('0813-1108-1813')).toBe('6281311081813')
    expect(keFormatWa('0813 1108 1813')).toBe('6281311081813')
  })

  it('membiarkan nomor yang sudah berawalan 62', () => {
    expect(keFormatWa('6281311081813')).toBe('6281311081813')
  })

  it('membuang tanda plus pada format internasional', () => {
    expect(keFormatWa('+62 813-1108-1813')).toBe('6281311081813')
  })

  it('mengembalikan string kosong untuk masukan kosong', () => {
    expect(keFormatWa('')).toBe('')
  })
})
