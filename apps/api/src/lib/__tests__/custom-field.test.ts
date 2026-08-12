/**
 * TJS-P5 — validasi bentuk definisi custom field (murni, tanpa basis).
 *
 * Penegakannya ada di basis (enum + trigger + CHECK) dan diuji di
 * `routes/v1/__tests__/custom-field.test.ts` terhadap Postgres nyata.
 * Yang diuji DI SINI: terjemahan penolakan itu jadi pesan yang bisa
 * ditindaklanjuti, plus normalisasi masukan.
 */
import { describe, it, expect } from 'vitest'
import { validasiDefinisi, CF_ENTITAS, CF_TIPE } from '../custom-field.js'

const dasar = { entitas: 'projects', tipe: 'teks', kunci: 'kode_internal', label: 'Kode Internal' }

describe('daftar tertutup', () => {
  it('entitas di luar daftar ditolak, dan pesannya menyebut yang tersedia', () => {
    const h = validasiDefinisi({ ...dasar, entitas: 'kasbons' })
    expect(h.ok).toBe(false)
    if (!h.ok) {
      expect(h.error).toMatch(/tak ada dalam daftar/i)
      // Pesan yang hanya berkata "tidak valid" memaksa pengguna menebak.
      expect(h.error).toMatch(/projects/)
    }
  })

  it('tipe di luar daftar ditolak', () => {
    const h = validasiDefinisi({ ...dasar, tipe: 'json' })
    expect(h.ok).toBe(false)
    if (!h.ok) expect(h.error).toMatch(/tak ada dalam daftar/i)
  })

  it('katalog berisi TEPAT nilai yang diniatkan', () => {
    // Gagal saat seseorang menambah entitas di sini tanpa `ALTER TYPE` di
    // basis — dropdown akan menawarkan pilihan yang lalu ditolak saat simpan.
    expect([...CF_ENTITAS]).toEqual(['projects', 'suppliers', 'materials', 'pegawai', 'clients'])
    expect([...CF_TIPE]).toEqual(['teks', 'angka', 'tanggal', 'boolean', 'pilihan', 'uang'])
  })
})

describe('kunci teknis', () => {
  it('dinormalkan, bukan ditolak, saat berhuruf besar atau berspasi', () => {
    // "Kode Internal" jelas maksudnya; menolaknya hanya membuat pengguna
    // menebak-nebak bentuk yang diterima.
    const h = validasiDefinisi({ ...dasar, kunci: '  Kode Internal  ' })
    expect(h.ok).toBe(true)
    if (h.ok) expect(h.nilai.kunci).toBe('kode_internal')
  })

  it('menolak yang diawali angka', () => {
    const h = validasiDefinisi({ ...dasar, kunci: '1kode' })
    expect(h.ok).toBe(false)
  })

  it('menolak tanda baca yang memaksa pengutipan', () => {
    // Kunci ini jadi nama properti di respons API. Yang lupa mengutip
    // mendapat `undefined` tanpa galat.
    for (const k of ['kode-internal', 'kode.internal', 'kode"x']) {
      expect(validasiDefinisi({ ...dasar, kunci: k }).ok, k).toBe(false)
    }
  })

  it('menolak yang terlalu pendek', () => {
    expect(validasiDefinisi({ ...dasar, kunci: 'a' }).ok).toBe(false)
  })
})

describe('opsi — hanya bermakna untuk tipe pilihan', () => {
  it('pilihan tanpa opsi ditolak dengan alasan yang jelas', () => {
    const h = validasiDefinisi({ ...dasar, tipe: 'pilihan', opsi: [] })
    expect(h.ok).toBe(false)
    if (!h.ok) expect(h.error).toMatch(/tak bisa diisi siapa pun/i)
  })

  it('opsi pada tipe NON-pilihan ditolak', () => {
    // Data yang tak pernah dibaca selalu jadi salah tanpa ketahuan.
    const h = validasiDefinisi({ ...dasar, tipe: 'teks', opsi: ['A', 'B'] })
    expect(h.ok).toBe(false)
    if (!h.ok) expect(h.error).toMatch(/hanya berlaku untuk tipe "pilihan"/i)
  })

  it('opsi kembar ditolak', () => {
    const h = validasiDefinisi({ ...dasar, tipe: 'pilihan', opsi: ['A', 'A'] })
    expect(h.ok).toBe(false)
    if (!h.ok) expect(h.error).toMatch(/kembar/i)
  })

  it('opsi dibersihkan dari spasi dan entri kosong', () => {
    const h = validasiDefinisi({ ...dasar, tipe: 'pilihan', opsi: [' Utara ', '', 'Selatan'] })
    expect(h.ok).toBe(true)
    if (h.ok) expect(h.nilai.opsi).toEqual(['Utara', 'Selatan'])
  })
})

describe('urutan — Number("") === 0, bukan NaN', () => {
  it('kosong/undefined jadi 0, bukan NaN', () => {
    // Kelas cacat yang berulang di repo ini: `Number('')` bernilai 0, jadi
    // pemeriksaan `isNaN` sesudah konversi tak pernah menangkap string
    // kosong. Ditangani SEBELUM konversi.
    for (const v of [undefined, null, '']) {
      const h = validasiDefinisi({ ...dasar, urutan: v })
      expect(h.ok, String(v)).toBe(true)
      if (h.ok) expect(h.nilai.urutan).toBe(0)
    }
  })

  it('bukan angka ditolak', () => {
    expect(validasiDefinisi({ ...dasar, urutan: 'kedua' }).ok).toBe(false)
  })
})

describe('label', () => {
  it('kosong atau hanya spasi ditolak', () => {
    for (const l of ['', '   ']) {
      expect(validasiDefinisi({ ...dasar, label: l }).ok, JSON.stringify(l)).toBe(false)
    }
  })
})

describe('definisi yang sah', () => {
  it('diterima dengan nilai bawaan yang masuk akal', () => {
    const h = validasiDefinisi(dasar)
    expect(h.ok).toBe(true)
    if (h.ok) {
      expect(h.nilai).toEqual({
        entitas: 'projects', tipe: 'teks', kunci: 'kode_internal',
        label: 'Kode Internal', wajib: false, opsi: [], urutan: 0,
      })
    }
  })
})
