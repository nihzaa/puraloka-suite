import { describe, it, expect } from 'vitest'
import { muatanWaPeristiwa } from '../terbit-peristiwa.js'

/**
 * `muatanWaPeristiwa()` diuji LANGSUNG (bukan lewat `terbitkanPeristiwa()`)
 * justru karena `terbitkanPeristiwa()` punya pagar `if (process.env.NODE_ENV
 * === 'test') return` yang sengaja membuatnya tak melakukan apa pun di
 * suite ini — lihat komentar di `terbit-peristiwa.ts` baris ~135-165.
 *
 * Task 2 (spec §5.2) mengekstrak pembacaan kredensial WA ke fungsi terpisah
 * ini SUPAYA bentuk objek `wa` bisa diverifikasi tanpa pagar itu dan tanpa
 * memanggil `jalankanAlur()`/n8n sungguhan. Pagar NODE_ENV di
 * `terbitkanPeristiwa()` sendiri TIDAK disentuh oleh perubahan ini.
 */
describe('muatanWaPeristiwa', () => {
  it('mengembalikan null untuk keempat field saat tenant belum mengisi kredensial', async () => {
    // companyId dummy — format UUID valid tapi dipastikan tak punya baris
    // di app_credentials maupun companies (jadi warisan induk pun tak aktif).
    const hasil = await muatanWaPeristiwa('00000000-0000-0000-0000-000000000000')
    expect(hasil).toEqual({ url: null, apiKey: null, instance: null, nomorTujuan: null })
  })

  it('mengembalikan bentuk objek dengan keempat kunci yang benar', async () => {
    const hasil = await muatanWaPeristiwa('00000000-0000-0000-0000-000000000000')
    expect(Object.keys(hasil).sort()).toEqual(['apiKey', 'instance', 'nomorTujuan', 'url'])
  })
})
