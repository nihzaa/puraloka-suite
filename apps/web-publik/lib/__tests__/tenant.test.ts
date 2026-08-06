import { describe, it, expect, afterEach } from 'vitest'
import { resolveTenant } from '../tenant'

const asli = process.env.SITUS_COMPANY_ID

afterEach(() => {
  if (asli === undefined) delete process.env.SITUS_COMPANY_ID
  else process.env.SITUS_COMPANY_ID = asli
})

describe('resolveTenant', () => {
  it('mengembalikan company dari env', () => {
    process.env.SITUS_COMPANY_ID = 'abc-123'
    expect(resolveTenant()).toBe('abc-123')
  })

  // Gagal CEPAT dan JELAS. Tanpa ini, situs yang belum dikonfigurasi akan
  // merender halaman kosong tanpa petunjuk apa pun — dan "kok isinya hilang"
  // jauh lebih sulit dilacak daripada satu galat yang menyebut nama env-nya.
  it('melempar galat yang menyebut nama env bila belum diset', () => {
    delete process.env.SITUS_COMPANY_ID
    expect(() => resolveTenant()).toThrow(/SITUS_COMPANY_ID/)
  })

  it('menolak nilai kosong, bukan meneruskannya sebagai tenant sah', () => {
    process.env.SITUS_COMPANY_ID = '   '
    expect(() => resolveTenant()).toThrow(/SITUS_COMPANY_ID/)
  })
})
