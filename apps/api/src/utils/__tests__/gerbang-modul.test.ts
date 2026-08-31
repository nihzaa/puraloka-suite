import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { supabase } from '../supabase.js'
import { bacaKeadaanModul } from '../gerbang-modul.js'

/**
 * GERBANG MODUL — yang diuji ARAH KEGAGALANNYA.
 *
 * Gerbang komersial punya dua cara salah, dan keduanya senyap:
 *
 *   menutup terlalu banyak → pelanggan yang membayar berhenti bisa bekerja,
 *                            dan gejalanya "menu hilang", bukan galat
 *   membuka terlalu banyak → modul terjual tak ditegakkan, dan gejalanya
 *                            cuma tagihan yang tak naik-naik
 *
 * Test ini memakai Postgres SUNGGUHAN (bukan mock) sesuai disiplin repo,
 * karena yang paling perlu dibuktikan justru perilaku terhadap BARIS yang ada,
 * hilang, dan bernilai NULL — tiga keadaan yang mock cenderung samakan.
 */

let companyId: string
const KUNCI_TUTUP = 'modul.akuntansi'
const KUNCI_BUKA = 'modul.proyek'
const KUNCI_NULL = 'modul.gudang'
const KUNCI_TAK_TERDAFTAR = 'modul.tak_pernah_ada_uji'

beforeAll(async () => {
  // Perusahaan uji sendiri — memakai `LIMIT 1` atas data nyata membuat test
  // ini bergeser saat suite lain menyisip/membersihkan baris (CLAUDE.md §7).
  const { data, error } = await supabase
    .from('companies')
    // `code` NOT NULL dan unik — diberi akhiran waktu supaya test ini bisa
    // dijalankan ulang tanpa bentrok bila pembersihan sebelumnya gagal.
    .insert({
      name: '[UJI-GERBANG] PT Uji Gerbang Modul',
      code: `uji-gerbang-${Date.now().toString(36)}`,
    })
    .select('id')
    .single()
  if (error) throw new Error(`Gagal menyiapkan company uji: ${error.message}`)
  companyId = data.id

  const { error: galatSnapshot } = await supabase.from('entitlement_snapshot').insert([
    { company_id: companyId, kunci: KUNCI_TUTUP, terbuka: false, paket_nama: 'Kecil' },
    { company_id: companyId, kunci: KUNCI_BUKA, terbuka: true, paket_nama: 'Kecil' },
    { company_id: companyId, kunci: KUNCI_NULL, terbuka: null, paket_nama: 'Kecil' },
  ])
  if (galatSnapshot) throw new Error(`Gagal menyiapkan snapshot: ${galatSnapshot.message}`)
})

afterAll(async () => {
  // Bersih-bersih membebaskan UNIQUE (company_id, kunci) supaya test ini bisa
  // dijalankan ulang. Snapshot ikut terhapus lewat ON DELETE CASCADE, tapi
  // dihapus eksplisit supaya kegagalan cascade tak lolos diam-diam.
  if (companyId) {
    await supabase.from('entitlement_snapshot').delete().eq('company_id', companyId)
    await supabase.from('companies').delete().eq('id', companyId)
  }
})

describe('gerbang modul — menutup hanya yang DISENGAJA', () => {
  it('MENUTUP modul yang barisnya bernilai false', async () => {
    const k = await bacaKeadaanModul(companyId, KUNCI_TUTUP)
    expect(k.terbuka).toBe(false)
    // Pesannya menyebut PAKET-nya. Pesan generik membuat pengguna menyimpulkan
    // produknya rusak, bukan bahwa ada sesuatu yang bisa dibeli.
    expect(k.alasan).toMatch(/Kecil/)
    expect(k.daruratTerbuka).toBe(false)
  })

  it('MEMBUKA modul yang barisnya bernilai true', async () => {
    const k = await bacaKeadaanModul(companyId, KUNCI_BUKA)
    expect(k.terbuka).toBe(true)
    expect(k.alasan).toBeNull()
  })

  it('MEMBUKA modul yang tak punya baris sama sekali', async () => {
    // Katalog SELALU tertinggal dari kode. Kalau "tak terdaftar" berarti
    // "tertutup", tiap modul baru lahir MATI untuk semua pelanggan —
    // termasuk yang membayar paling mahal.
    const k = await bacaKeadaanModul(companyId, KUNCI_TAK_TERDAFTAR)
    expect(k.terbuka).toBe(true)
  })

  it('MEMBUKA modul yang barisnya NULL — "belum ditetapkan" bukan "ditolak"', async () => {
    // NULL berarti vendor belum memutuskan. Menyamakannya dengan false akan
    // menutup modul yang tak pernah diputuskan siapa pun.
    const k = await bacaKeadaanModul(companyId, KUNCI_NULL)
    expect(k.terbuka).toBe(true)
  })
})

describe('gerbang modul — jalur pemulihan tak boleh terkunci', () => {
  it('membuka modul.langganan MESKI barisnya false', async () => {
    // Pelanggan yang ingin membayar harus SELALU bisa membayar. Menggerbang
    // halaman langganan di belakang gerbang yang ia pulihkan mengunci
    // pelanggan di luar pintu yang ia bayar untuk masuk.
    const { error } = await supabase.from('entitlement_snapshot').insert({
      company_id: companyId,
      kunci: 'modul.langganan',
      terbuka: false,
      paket_nama: 'Kecil',
    })
    expect(error, 'gagal menyiapkan baris uji').toBeNull()

    const k = await bacaKeadaanModul(companyId, 'modul.langganan')
    expect(k.terbuka, 'modul.langganan tertutup — pelanggan tak bisa upgrade').toBe(true)
  })

  it('membuka modul.pengaturan dan modul.ekspor tanpa menyentuh basis', async () => {
    // Keduanya di daftar putih permanen; dijawab sebelum kueri apa pun.
    for (const kunci of ['modul.pengaturan', 'modul.ekspor']) {
      const k = await bacaKeadaanModul(companyId, kunci)
      expect(k.terbuka, `${kunci} tertutup`).toBe(true)
    }
  })
})

describe('gerbang modul — companyId kosong', () => {
  it('MEMBUKA saat companyId kosong, bukan menutup', async () => {
    // Permintaan tanpa company aktif belum lewat `authenticate` — menolaknya
    // di sini akan menutupi urutan preHandler yang salah pasang, dan gejalanya
    // menuduh paket padahal masalahnya autentikasi.
    const k = await bacaKeadaanModul('', KUNCI_TUTUP)
    expect(k.terbuka).toBe(true)
  })
})
