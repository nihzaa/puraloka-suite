/**
 * Data kepegawaian — aturan pengelolaannya. MURNI, tanpa basis.
 */
import { describe, it, expect } from 'vitest'
import {
  validasiPegawai, periksaKelengkapan, masihAktif, ringkasPegawai,
  STATUS_PTKP,
  type BarisPegawai,
} from '../pegawai.js'

const p = (o: Partial<BarisPegawai> = {}): BarisPegawai => ({
  id: 'x', nomor_induk: 'P-001', jabatan: 'Staf', departemen: 'Operasional',
  tanggal_masuk: '2025-01-01', tanggal_keluar: null,
  npwp: '01.234.567.8-901.000', nomor_bpjs_tk: '123', nomor_bpjs_kes: '456',
  status_ptkp: 'TK/0', ...o,
})

describe('validasi masukan', () => {
  it('masukan minimal sah — jam standar default 8', () => {
    const v = validasiPegawai({})
    expect(v.ok).toBe(true)
    if (v.ok) expect(v.nilai.jam_standar).toBe(8)
  })

  it('teks kosong jadi null, bukan ""', () => {
    // Kolom opsional berisi "" bukan data, itu kelalaian — dan ia lolos
    // pemeriksaan "sudah diisi?" di mana pun.
    const v = validasiPegawai({ jabatan: '  ', departemen: '' })
    expect(v.ok).toBe(true)
    if (v.ok) {
      expect(v.nilai.jabatan).toBeNull()
      expect(v.nilai.departemen).toBeNull()
    }
  })

  it('gaji kosong ("") jadi null, BUKAN nol', () => {
    // `Number('') === 0` — "belum diisi HRD" berubah jadi "orang ini tak
    // digaji", dan yang kedua adalah keputusan yang tak pernah diambil.
    const v = validasiPegawai({ gaji_pokok: '' })
    expect(v.ok).toBe(true)
    if (v.ok) expect(v.nilai.gaji_pokok).toBeNull()
  })

  it('gaji nol EKSPLISIT tetap tersimpan sebagai nol', () => {
    const v = validasiPegawai({ gaji_pokok: 0 })
    expect(v.ok).toBe(true)
    if (v.ok) expect(v.nilai.gaji_pokok).toBe(0)
  })

  it('gaji negatif ditolak', () => {
    expect(validasiPegawai({ gaji_pokok: -1 }).ok).toBe(false)
  })

  it('gaji bukan angka ditolak', () => {
    expect(validasiPegawai({ gaji_pokok: 'lima juta' }).ok).toBe(false)
  })

  it('jam standar nol ditolak — ia pembagi upah lembur', () => {
    const v = validasiPegawai({ jam_standar: 0 })
    expect(v.ok).toBe(false)
    if (!v.ok) expect(v.galat).toMatch(/pembagi/i)
  })

  it('jam standar di atas 24 ditolak', () => {
    expect(validasiPegawai({ jam_standar: 25 }).ok).toBe(false)
    expect(validasiPegawai({ jam_standar: 24 }).ok).toBe(true)
  })

  it('tanggal keluar mendahului masuk ditolak', () => {
    const v = validasiPegawai({ tanggal_masuk: '2025-06-01', tanggal_keluar: '2025-01-01' })
    expect(v.ok).toBe(false)
    if (!v.ok) expect(v.galat).toMatch(/masa kerja negatif/i)
  })

  it('tanggal sama hari diterima — masuk dan keluar di hari yang sama', () => {
    expect(validasiPegawai({
      tanggal_masuk: '2025-06-01', tanggal_keluar: '2025-06-01',
    }).ok).toBe(true)
  })

  it('bentuk tanggal salah ditolak', () => {
    expect(validasiPegawai({ tanggal_masuk: '01-06-2025' }).ok).toBe(false)
  })

  it('status PTKP tak dikenal ditolak, dan menyebut yang sah', () => {
    const v = validasiPegawai({ status_ptkp: 'TK/9' })
    expect(v.ok).toBe(false)
    if (!v.ok) expect(v.galat).toMatch(/TK\/0/)
  })

  it('seluruh status PTKP resmi diterima', () => {
    for (const s of STATUS_PTKP) {
      expect(validasiPegawai({ status_ptkp: s }).ok, s).toBe(true)
    }
  })

  it('kategori TER dinaikkan jadi huruf besar', () => {
    const v = validasiPegawai({ kategori_ter: 'b' })
    expect(v.ok).toBe(true)
    if (v.ok) expect(v.nilai.kategori_ter).toBe('B')
  })

  it('kategori TER di luar A/B/C ditolak', () => {
    expect(validasiPegawai({ kategori_ter: 'D' }).ok).toBe(false)
  })

  it('NPWP bertitik DAN polos sama-sama diterima', () => {
    // Menolak salah satu bentuk membuat orang menyalin ulang tanpa alasan.
    expect(validasiPegawai({ npwp: '01.234.567.8-901.000' }).ok).toBe(true)
    expect(validasiPegawai({ npwp: '012345678901000' }).ok).toBe(true)
  })

  it('NPWP berisi huruf ditolak', () => {
    expect(validasiPegawai({ npwp: 'NPWP-saya' }).ok).toBe(false)
  })

  it('nomor induk terlalu panjang ditolak', () => {
    expect(validasiPegawai({ nomor_induk: 'A'.repeat(41) }).ok).toBe(false)
    expect(validasiPegawai({ nomor_induk: 'A'.repeat(40) }).ok).toBe(true)
  })
})

describe('kelengkapan', () => {
  it('data lengkap: nol kurang', () => {
    const k = periksaKelengkapan(p())
    expect(k.lengkap).toBe(true)
    expect(k.kurang).toHaveLength(0)
    expect(k.kurangKritis).toHaveLength(0)
  })

  it('NPWP & PTKP kosong masuk KRITIS, bukan biasa', () => {
    // Keduanya membuat PPh 21 dihitung dengan tarif salah — itu uang yang
    // keliru masuk ke kantong orang atau ke kas negara.
    const k = periksaKelengkapan(p({ npwp: null, status_ptkp: null }))
    expect(k.kurangKritis).toContain('NPWP')
    expect(k.kurangKritis).toContain('status PTKP')
    expect(k.kurang).not.toContain('NPWP')
  })

  it('departemen kosong masuk biasa, bukan kritis', () => {
    const k = periksaKelengkapan(p({ departemen: null }))
    expect(k.kurang).toContain('departemen')
    expect(k.kurangKritis).toHaveLength(0)
  })

  it('tanggal masuk kosong KRITIS — dasar masa kerja & cuti', () => {
    const k = periksaKelengkapan(p({ tanggal_masuk: null }))
    expect(k.kurangKritis).toContain('tanggal masuk')
  })
})

describe('masih aktif', () => {
  it('tanpa tanggal keluar: aktif', () => {
    expect(masihAktif({ tanggal_keluar: null }, '2026-08-12')).toBe(true)
  })

  it('keluar KEMARIN: tidak aktif', () => {
    expect(masihAktif({ tanggal_keluar: '2026-08-11' }, '2026-08-12')).toBe(false)
  })

  it('keluar HARI INI: tidak aktif lagi', () => {
    expect(masihAktif({ tanggal_keluar: '2026-08-12' }, '2026-08-12')).toBe(false)
  })

  it('keluar di masa DEPAN: masih aktif', () => {
    // Pengunduran diri yang sudah diajukan tapi belum berlaku — orangnya
    // masih bekerja, dan gajinya masih dibayar.
    expect(masihAktif({ tanggal_keluar: '2026-09-30' }, '2026-08-12')).toBe(true)
  })
})

describe('ringkasan', () => {
  const HARI = '2026-08-12'

  it('memisahkan aktif dari yang sudah keluar', () => {
    const r = ringkasPegawai([
      p(), p({ tanggal_keluar: '2026-01-01' }), p({ tanggal_keluar: '2026-12-31' }),
    ], HARI)
    expect(r.total).toBe(3)
    expect(r.aktif).toBe(2)
    expect(r.keluar).toBe(1)
  })

  it('menghitung yang AKTIF ber-data kritis kosong', () => {
    const r = ringkasPegawai([
      p({ npwp: null }), p(), p({ status_ptkp: null }),
    ], HARI)
    expect(r.kritisKosong).toBe(2)
  })

  it('yang sudah KELUAR tak dihitung kritis', () => {
    // Datanya memang tak akan dilengkapi lagi; menghitungnya membuat angka
    // mendesak tak pernah bisa turun ke nol.
    const r = ringkasPegawai([
      p({ npwp: null, status_ptkp: null, tanggal_keluar: '2025-01-01' }),
    ], HARI)
    expect(r.kritisKosong).toBe(0)
    expect(r.keluar).toBe(1)
  })

  it('daftar kosong tidak melempar', () => {
    expect(ringkasPegawai([], HARI)).toEqual({ total: 0, aktif: 0, keluar: 0, kritisKosong: 0 })
  })
})
