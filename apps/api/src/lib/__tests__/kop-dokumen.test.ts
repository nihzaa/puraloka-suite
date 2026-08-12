/**
 * Kop dokumen per tenant — aturannya. MURNI, tanpa basis.
 *
 * Yang dijaga: identitas yang KOSONG dilewati (bukan dicetak sebagai baris
 * kosong), dan kekurangannya DINYATAKAN — bukan menghentikan pencetakan.
 * Dokumen yang tak bisa terbit jauh lebih merugikan daripada dokumen berkop
 * tipis.
 */
import { describe, it, expect } from 'vitest'
import { susunKop, kopLayakKirim, type IdentitasTenant } from '../kop-dokumen.js'

const lengkap: IdentitasTenant = {
  name: 'Puraloka',
  legal_name: 'PT Puraloka Persada',
  address: 'Jl. Dago No. 123',
  city: 'Bandung',
  postal_code: '40135',
  phone: '022-1234567',
  email: 'halo@puraloka.id',
  website: 'puraloka.id',
  npwp: '01.234.567.8-901.000',
  logo_url: 'https://contoh/logo.png',
  tagline: 'Membangun dengan tertib',
}

describe('susun kop', () => {
  it('identitas lengkap tersusun rapi', () => {
    const k = susunKop(lengkap)
    expect(k.nama).toBe('PT Puraloka Persada')
    expect(k.baris[0]).toBe('Jl. Dago No. 123, Bandung, 40135')
    expect(k.baris[1]).toContain('Telp. 022-1234567')
    expect(k.baris[1]).toContain('halo@puraloka.id')
    expect(k.baris.some((b) => b.includes('NPWP'))).toBe(true)
    expect(k.logoUrl).toBe('https://contoh/logo.png')
    expect(k.yangHilang).toHaveLength(0)
  })

  it('legal_name MENANG atas name — kontrak adalah dokumen hukum', () => {
    const k = susunKop({ name: 'Puraloka', legal_name: 'PT Puraloka Persada' })
    expect(k.nama).toBe('PT Puraloka Persada')
  })

  it('tanpa legal_name jatuh ke name, dan itu DICATAT sebagai kurang', () => {
    const k = susunKop({ name: 'Puraloka' })
    expect(k.nama).toBe('Puraloka')
    expect(k.yangHilang).toContain('nama resmi perusahaan')
  })

  it('identitas KOSONG SAMA SEKALI tidak melempar', () => {
    // Tenant baru yang belum mengisi apa pun tetap harus bisa mencetak.
    for (const v of [null, undefined, {}]) {
      const k = susunKop(v as IdentitasTenant)
      expect(k.nama).toBe('Perusahaan Belum Bernama')
      expect(k.baris).toHaveLength(0)
      expect(k.logoUrl).toBeNull()
    }
  })

  it('bidang kosong DILEWATI, bukan dicetak sebagai baris kosong', () => {
    // Alamat tak diisi lalu tercetak sebagai garis kosong membuat kertasnya
    // terlihat rusak; melewatinya membuat kop merapat dan tetap wajar.
    const k = susunKop({ legal_name: 'PT Uji', phone: '021-9' })
    expect(k.baris).toEqual(['Telp. 021-9'])
    expect(k.baris.every((b) => b.trim() !== '')).toBe(true)
  })

  it('alamat parsial digabung tanpa koma menggantung', () => {
    const k = susunKop({ legal_name: 'PT Uji', city: 'Bandung' })
    expect(k.baris[0]).toBe('Bandung')
    expect(k.baris[0]).not.toMatch(/^,|,$/)
  })

  it('spasi saja diperlakukan kosong', () => {
    const k = susunKop({ legal_name: '   ', name: '  ', address: '   ' })
    expect(k.nama).toBe('Perusahaan Belum Bernama')
    expect(k.baris).toHaveLength(0)
  })

  it('yangHilang menyebut apa yang akan lenyap dari kertas', () => {
    const k = susunKop({ legal_name: 'PT Uji' })
    expect(k.yangHilang).toContain('alamat')
    expect(k.yangHilang).toContain('telepon atau email')
    expect(k.yangHilang).toContain('NPWP')
    expect(k.yangHilang).toContain('logo')
    expect(k.yangHilang).not.toContain('nama resmi perusahaan')
  })

  it('telepon ATAU email cukup — bukan dituntut keduanya', () => {
    expect(susunKop({ legal_name: 'PT Uji', phone: '021-9' }).yangHilang)
      .not.toContain('telepon atau email')
    expect(susunKop({ legal_name: 'PT Uji', email: 'a@b.id' }).yangHilang)
      .not.toContain('telepon atau email')
  })
})

describe('kelayakan kirim', () => {
  it('identitas lengkap layak', () => {
    expect(kopLayakKirim(susunKop(lengkap)).layak).toBe(true)
  })

  it('kosong sama sekali TIDAK layak, dan sebabnya disebut', () => {
    const h = kopLayakKirim(susunKop({}))
    expect(h.layak).toBe(false)
    expect(h.sebab).toMatch(/belum diisi sama sekali/i)
  })

  it('punya nama tapi tanpa cara dihubungi TIDAK layak', () => {
    const h = kopLayakKirim(susunKop({ legal_name: 'PT Uji', address: 'Jl. A' }))
    expect(h.layak).toBe(false)
    expect(h.sebab).toMatch(/menghubungi balik/i)
  })

  it('nama + telepon saja sudah layak — ambangnya bukan kelengkapan', () => {
    // Menuntut kelengkapan penuh akan menghentikan pencetakan untuk tenant
    // yang baru mulai, dan dokumen yang tak bisa terbit lebih merugikan
    // daripada dokumen berkop tipis.
    const h = kopLayakKirim(susunKop({ legal_name: 'PT Uji', phone: '021-9' }))
    expect(h.layak).toBe(true)
    expect(h.sebab).toBeNull()
  })

  it('email saja juga layak', () => {
    expect(kopLayakKirim(susunKop({ legal_name: 'PT Uji', email: 'a@b.id' })).layak).toBe(true)
  })
})
