/**
 * HASIL UJI MATERIAL — yang diuji: mutu yang gagal tanpa jadi ketahuan.
 *
 * Data acuan dari basis nyata 2026-08-16, semuanya berumur 13 hari:
 *
 *   UJI-2608-002  beton K-250   231 / 250 kg/cm2   tidak_memenuhi, TANPA NCR
 *   UJI-2608-004  besi D13      4250 / 4000        kesimpulan NULL
 *   UJI-2608-005  beton K-300   195 / 210          perlu_uji_ulang
 */
import { describe, it, expect } from 'vitest'
import { nilaiHasilUji } from '../hasil-uji-material.js'

const U = (o: Partial<Parameters<typeof nilaiHasilUji>[0]> = {}) => ({
  kesimpulan: null, nilaiHasil: 231, nilaiSyarat: 250,
  adaNcr: false, hariLalu: 13, ...o,
})

describe('nilaiHasilUji', () => {
  it('beton yang TIDAK MEMENUHI dan belum jadi NCR — paling mendesak', () => {
    // UJI-2608-002 apa adanya. Beton yang tak mencapai kuat tekan rencana
    // adalah cacat STRUKTURAL: ia sudah terlanjur mengeras, dan tiap hari
    // menumpuk lebih banyak pekerjaan di atasnya.
    const h = nilaiHasilUji(U({ kesimpulan: 'tidak_memenuhi' }), 3)
    expect(h.perlu).toBe(true)
    expect(h.sebab).toBe('gagal_tanpa_ncr')
    expect(h.selisihPersen).toBeCloseTo(-7.6, 1)
  })

  it('gagal yang SUDAH punya NCR tidak ditegur lagi', () => {
    /*
      NCR adalah jalur tindak lanjut mutu yang sudah punya otomasinya sendiri.
      Menegur ulang di sini mengirim pesan kedua untuk hal yang sudah ada
      tempatnya — dan itu cara tercepat membuat tim mutu berhenti membaca.
    */
    const h = nilaiHasilUji(U({ kesimpulan: 'tidak_memenuhi', adaNcr: true }), 3)
    expect(h.perlu).toBe(false)
    expect(h.sebab).toBe('aman')
  })

  it('KESIMPULAN KOSONG dilaporkan meski ANGKANYA LULUS', () => {
    /*
      Ini keadaan yang paling mudah terlewat, dan `UJI-2608-004` contohnya:
      hasil 4.250 dari syarat 4.000 — angkanya lulus telak.

      Justru karena lulus, tak ada yang merasa perlu menindaklanjutinya, dan
      berkasnya menggantung tanpa kesimpulan selamanya. Laporan mutu yang
      menghitung "berapa yang gagal" melewatkannya, karena ia memang tak
      dihitung gagal.

      Uji tanpa kesimpulan bukan uji yang lulus — ia uji yang belum selesai.
    */
    const h = nilaiHasilUji(U({ kesimpulan: null, nilaiHasil: 4250, nilaiSyarat: 4000 }), 3)
    expect(h.selisihPersen).toBeGreaterThan(0)   // angkanya LULUS
    expect(h.perlu).toBe(true)                    // tetap dilaporkan
    expect(h.sebab).toBe('belum_disimpulkan')
  })

  it('uji yang BARU dicatat belum ditegur — laboratorium butuh waktu', () => {
    // Menegur uji yang dicatat kemarin membuat peringatan ini jadi kebisingan
    // harian bagi tim mutu, dan mereka berhenti membacanya sebelum yang
    // penting datang.
    const h = nilaiHasilUji(U({ kesimpulan: null, hariLalu: 1 }), 3)
    expect(h.perlu).toBe(false)
    expect(h.sebab).toBe('aman')
  })

  it('perlu uji ulang yang menggantung dilaporkan', () => {
    // UJI-2608-005: uji 7 hari yang tak dilanjutkan ke 28 hari tak pernah
    // menjawab pertanyaannya.
    const h = nilaiHasilUji(U({ kesimpulan: 'perlu_uji_ulang', nilaiHasil: 195, nilaiSyarat: 210 }), 3)
    expect(h.perlu).toBe(true)
    expect(h.sebab).toBe('uji_ulang_menggantung')
  })

  it('kesimpulan MEMENUHI tidak diganggu', () => {
    const h = nilaiHasilUji(U({ kesimpulan: 'memenuhi', nilaiHasil: 268.5, nilaiSyarat: 250 }), 3)
    expect(h.perlu).toBe(false)
    expect(h.selisihPersen).toBeCloseTo(7.4, 1)
  })

  it('kesimpulan ber-spasi/huruf besar tetap dikenali', () => {
    // Nilai dari basis tak dijamin rapi. Perbandingan sensitif-huruf membuat
    // "Tidak_Memenuhi" jatuh ke cabang terakhir dan dianggap aman — beton
    // gagal yang lolos karena ejaan.
    const h = nilaiHasilUji(U({ kesimpulan: '  Tidak_Memenuhi ' }), 3)
    expect(h.sebab).toBe('gagal_tanpa_ncr')
  })

  it('syarat NOL tidak menghasilkan Infinity pada selisih', () => {
    // Pembagian dengan nol menghasilkan Infinity, dan "meleset Infinity persen"
    // adalah pesan yang tak bisa ditindaklanjuti siapa pun.
    const h = nilaiHasilUji(U({ kesimpulan: 'tidak_memenuhi', nilaiSyarat: 0 }), 3)
    expect(h.selisihPersen).toBeNull()
    expect(h.perlu).toBe(true)      // tetap dilaporkan; angkanya saja yang hilang
  })
})
