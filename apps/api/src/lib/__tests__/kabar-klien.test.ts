/**
 * KLIEN YANG DIDIAMKAN — yang diuji cara ia menuduh proyek yang sehat, atau
 * membiarkan proyek yang benar-benar sunyi lolos.
 *
 * Angka acuan dari basis nyata 2026-08-16: 15 proyek aktif, LIMA tak pernah
 * punya laporan (dua di antaranya Dinas PUPR senilai Rp 11 M), dan sembilan
 * lagi terakhir dilaporkan >14 hari lalu — terlama 131 hari.
 */
import { describe, it, expect } from 'vitest'
import { nilaiKabarKlien } from '../kabar-klien.js'

const HARI_INI = '2026-08-16'

describe('nilaiKabarKlien', () => {
  it('proyek yang BELUM PERNAH dilaporkan dibedakan dari yang lama diam', () => {
    /*
      Keduanya berarti klien tak tahu apa-apa, tetapi tindakannya berbeda:
      yang belum pernah butuh proses pelaporannya dibereskan, yang lama diam
      cukup satu laporan menyusul.

      Menggabungkannya membuat proyek tanpa proses sama sekali terlihat seperti
      proyek yang cuma telat sekali — dan diperlakukan begitu.
    */
    const a = nilaiKabarKlien(null, HARI_INI, 14)
    expect(a.perlu).toBe(true)
    expect(a.sebab).toBe('belum_pernah')
    expect(a.hariDiam).toBeNull()

    const b = nilaiKabarKlien('2026-04-09', HARI_INI, 14)
    expect(b.perlu).toBe(true)
    expect(b.sebab).toBe('lama_diam')
    expect(b.hariDiam).toBe(129)
  })

  it('proyek yang baru dilaporkan tidak diganggu', () => {
    const h = nilaiKabarKlien('2026-08-14', HARI_INI, 14)
    expect(h.hariDiam).toBe(2)
    expect(h.perlu).toBe(false)
    expect(h.sebab).toBe('terkabari')
  })

  it('tepat DI ambang belum dilaporkan — batasnya "lebih dari", bukan "sama dengan"', () => {
    // Ambang 14 berarti "diam lebih dari dua pekan". Diam tepat 14 hari masih
    // dalam dua pekan; menuduhnya membuat peringatan datang sehari lebih awal
    // dari yang disetel orang, dan angka di layar pengaturan jadi berbohong.
    expect(nilaiKabarKlien('2026-08-02', HARI_INI, 14).perlu).toBe(false)
    expect(nilaiKabarKlien('2026-08-01', HARI_INI, 14).perlu).toBe(true)
  })

  it('TANGGAL TAK TERBACA diperlakukan BELUM PERNAH, bukan dilewati', () => {
    /*
      Melewatinya membuat proyek dengan tanggal rusak menjadi sunyi total di
      seluruh peringatan — dan kolom tanggal yang rusak justru gejala bahwa
      pencatatannya bermasalah, persis proyek yang paling perlu diperiksa.
    */
    for (const buruk of ['', 'kemarin', '00-00-0000']) {
      const h = nilaiKabarKlien(buruk, HARI_INI, 14)
      expect(h.perlu).toBe(true)
      expect(h.sebab).toBe('belum_pernah')
    }
  })

  it('tanggal MASA DEPAN dianggap terkabari, bukan diam negatif', () => {
    /*
      Salah ketik tahun membuat selisihnya negatif. Melaporkannya sebagai
      "diam -400 hari" menghasilkan pesan yang tak masuk akal; menghitungnya
      sebagai nilai MUTLAK justru menuduh proyek yang baru saja dilaporkan
      sebagai proyek yang paling lama didiamkan.
    */
    const h = nilaiKabarKlien('2027-08-16', HARI_INI, 14)
    expect(h.hariDiam).toBeLessThan(0)
    expect(h.perlu).toBe(false)
  })

  it('ambang besar menahan proyek yang diam sedang-sedang saja', () => {
    // Ambang 90: proyek yang diam 60 hari belum dilaporkan, yang 131 hari ya.
    expect(nilaiKabarKlien('2026-06-17', HARI_INI, 90).perlu).toBe(false)
    expect(nilaiKabarKlien('2026-04-09', HARI_INI, 90).perlu).toBe(true)
  })
})
