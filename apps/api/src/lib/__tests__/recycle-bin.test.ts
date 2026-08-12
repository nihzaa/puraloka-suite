import { describe, it, expect } from 'vitest'
import {
  REGISTRY, AMBANG_LAMA_HARI, cariEntri, umurHari, periksaPulih,
} from '../recycle-bin.js'

/**
 * Test registry recycle bin.
 *
 * Yang dijaga di sini bukan aritmetika umur, melainkan bahwa **jejak
 * penghapusan tak bisa terhapus diam-diam** — dan bahwa tiap entri menyatakan
 * izin serta cara penyaringan tenant-nya.
 */

describe('REGISTRY — jaminan bentuk', () => {
  it('tiap entri menyatakan cara penyaringan tenant-nya', () => {
    // Recycle bin yang keliru menyatakan penyaringannya akan menampilkan data
    // perusahaan lain — dan daftar "yang terhapus" adalah tempat paling sepi
    // untuk kebocoran, karena jarang dibuka.
    for (const e of REGISTRY) {
      expect(['company', 'project']).toContain(e.tenancy)
    }
  })

  it('izin LIHAT dan PULIH keduanya disebut', () => {
    for (const e of REGISTRY) {
      expect(e.izinLihat.length).toBeGreaterThan(0)
      expect(e.izinPulih.length).toBeGreaterThan(0)
    }
  })

  it('kunci unik — ia dipakai di URL', () => {
    expect(new Set(REGISTRY.map((e) => e.kunci)).size).toBe(REGISTRY.length)
  })

  it('tiap entri menyebut kolom yang menamai barisnya', () => {
    // Tanpa ini, daftar recycle bin hanya berisi UUID — dan tak ada yang bisa
    // memutuskan mana yang hendak dipulihkan.
    for (const e of REGISTRY) {
      expect(e.kolomNama.length).toBeGreaterThan(0)
    }
  })
})

describe('cariEntri', () => {
  it('menemukan yang terdaftar', () => {
    expect(cariEntri('proyek')?.tabel).toBe('projects')
  })
  it('yang tak terdaftar jadi null, bukan melempar', () => {
    expect(cariEntri('users')).toBeNull()
    expect(cariEntri('')).toBeNull()
  })
})

describe('umurHari', () => {
  it('menghitung selisih hari', () => {
    const acuan = new Date('2026-08-12T00:00:00.000Z')
    expect(umurHari('2026-08-02T00:00:00.000Z', acuan)).toBe(10)
  })

  it('hari ini = 0, bukan null', () => {
    const acuan = new Date('2026-08-12T10:00:00.000Z')
    expect(umurHari('2026-08-12T09:00:00.000Z', acuan)).toBe(0)
  })

  it('null / tanggal rusak → null, bukan NaN', () => {
    expect(umurHari(null)).toBeNull()
    expect(umurHari(undefined)).toBeNull()
    expect(umurHari('bukan tanggal')).toBeNull()
  })

  it('tanggal SEDIKIT di masa depan → 0, bukan −1', () => {
    // `deleted_at` diisi `now()` basis. Kalau jam basis sedikit di depan jam
    // proses yang membacanya — beda zona, selisih NTP, atau sekadar milidetik
    // antara INSERT dan pembacaan — `Math.floor` membulatkan selisih negatif
    // ke −1.
    //
    // Ditemukan test endpoint: item yang BARU SAJA dihapus melaporkan umur
    // −1, dan layar akan menampilkan "dihapus −1 hari lalu". Angka yang
    // mustahil, dan pembacanya akan menyimpulkan jamnya rusak.
    const acuan = new Date('2026-08-12T00:00:00.000Z')
    expect(umurHari('2026-08-12T00:00:01.000Z', acuan)).toBe(0)
    expect(umurHari('2026-08-12T07:00:00.000Z', acuan)).toBe(0)
  })

  it('masa depan JAUH pun tetap 0, tak pernah negatif', () => {
    const acuan = new Date('2026-08-12T00:00:00.000Z')
    expect(umurHari('2027-01-01T00:00:00.000Z', acuan)).toBe(0)
  })

  it('ambang lama adalah angka hari yang masuk akal', () => {
    expect(AMBANG_LAMA_HARI).toBeGreaterThan(0)
    expect(AMBANG_LAMA_HARI).toBeLessThanOrEqual(365)
  })
})

describe('periksaPulih — jejak penghapusan tak boleh terhapus diam-diam', () => {
  it('baris yang terhapus bisa dipulihkan', () => {
    expect(periksaPulih({ is_deleted: true }).bisa).toBe(true)
  })

  it('baris yang TIDAK terhapus ditolak', () => {
    // Memulihkan yang tak terhapus akan menimpa deleted_by/deleted_at dengan
    // null pada baris hidup — menghapus jejak penghapusan SEBELUMNYA kalau ia
    // pernah dipulihkan. Jejak itu satu-satunya keterangan saat orang bertanya
    // "kenapa data ini sempat hilang?".
    const r = periksaPulih({ is_deleted: false })
    expect(r.bisa).toBe(false)
    if (!r.bisa) expect(r.kode).toBe('tak_terhapus')
  })

  it('is_deleted null diperlakukan sebagai TIDAK terhapus', () => {
    // Gagal-tertutup: ragu berarti tolak. Memulihkan baris yang keadaannya
    // tak jelas lebih berisiko daripada menolaknya.
    const r = periksaPulih({ is_deleted: null })
    expect(r.bisa).toBe(false)
  })

  it('baris tak ada ditolak dengan kode terpisah', () => {
    const r = periksaPulih(null)
    expect(r.bisa).toBe(false)
    // Kode dibedakan supaya rute bisa menjawab 404 vs 409 — dua keadaan yang
    // menuntut tindakan berbeda dari yang memanggil.
    if (!r.bisa) expect(r.kode).toBe('tak_ada')
  })

  it('undefined ditolak juga', () => {
    expect(periksaPulih(undefined).bisa).toBe(false)
  })

  it('alasan penolakan menjelaskan, bukan sekadar menolak', () => {
    const r = periksaPulih({ is_deleted: false })
    if (!r.bisa) expect(r.alasan).toMatch(/tidak sedang terhapus/)
  })
})
