import { describe, it, expect } from 'vitest'
import { sarankanPemetaan, skorKemiripan } from '../saran-cost-map.js'

/**
 * SARAN PEMETAAN kategori material → cost code.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * KENAPA PUSTAKA INI ADA — dan kenapa ia hanya MENYARANKAN
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Diukur 2026-08-08: `cost_code_category_map` **nol baris**, padahal
 * endpoint dan UI-nya sudah ada di `/estimasi`. Peta kosong itu memblokir
 * tiga hal sekaligus:
 *
 *   • CVR (biaya terpakai vs nilai terpasang) tak punya cara menghubungkan
 *     pengeluaran ke cost code
 *   • varians per cost code kehilangan sisi "aktual"
 *   • impor BOQ → RFQ mustahil: BOQ menghasilkan `cost_code_id`, RFQ butuh
 *     `material_id`, dan peta inilah jembatannya
 *
 * Mengisi 10 baris manual bukan pekerjaan besar, tapi tak seorang pun
 * melakukannya selama berbulan-bulan — dan itu sendiri informasi: yang tak
 * disarankan tak akan diisi.
 *
 * ── Kenapa MENYARANKAN, bukan menerapkan
 *
 * Pemetaan ini menentukan ke cost code mana sebuah biaya jatuh, dan itu
 * mengalir ke laporan varians yang dipakai menilai untung-rugi. Tebakan mesin
 * yang diterapkan diam-diam menghasilkan laporan yang terlihat benar dan
 * salah di tempat yang tak seorang pun periksa.
 *
 * Yang dijamin pustaka ini: **nol saran lebih baik daripada saran yang
 * salah.** Ambangnya sengaja tinggi.
 */

const KATEGORI = [
  { id: 'k1', name: 'Beton & Semen' },
  { id: 'k2', name: 'Besi & Baja' },
  { id: 'k3', name: 'Pasir & Batu' },
  { id: 'k4', name: 'Sanitary' },
]

const COST_CODE = [
  { id: 'c1', code: 'CC-SE47-beton', name: 'Beton' },
  { id: 'c2', code: 'CC-SE47-baja', name: 'BAJA' },
  { id: 'c3', code: 'CC-SE47-pasir', name: 'Pasir Urug' },
  { id: 'c4', code: 'CC-SE47-listrik', name: 'ANALISA LISTRIK' },
]

describe('skorKemiripan', () => {
  it('kata yang sama persis memberi skor penuh', () => {
    expect(skorKemiripan('Beton', 'Beton')).toBe(1)
  })

  // Nama kategori memakai "&" dan huruf besar-kecil campur; cost code sering
  // HURUF BESAR SEMUA. Perbandingan yang peka huruf tak akan menemukan apa pun.
  it('tidak peka huruf besar-kecil', () => {
    expect(skorKemiripan('BAJA', 'baja')).toBe(1)
  })

  // Penyebutnya nama TERPENDEK, bukan terpanjang. "Beton & Semen" vs "Beton"
  // = 1/1 = skor penuh, dan itu disengaja: cost code bernama pendek dan tepat
  // ("Beton") justru padanan terbaik untuk kategori bernama panjang.
  //
  // Test ini semula menuntut skornya < 1, dan MERAH pada percobaan pertama.
  // Yang salah testnya, bukan kodenya: memakai nama terpanjang sebagai
  // penyebut akan menghukum cost code bernama jelas seperti "Pekerjaan Beton
  // Bertulang K-250" — padahal nama panjang itu yang paling tak ambigu.
  it('nama panjang yang memuat seluruh kata nama pendek mendekati skor penuh', () => {
    // Tidak persis 1: ada bonus kelengkapan yang menahan sedikit karena
    // "Semen" tak punya padanan. Yang dijamin: TINGGI, dan jauh di atas
    // ambang 0,4 — bukan bahwa ia identik dengan sama-persis.
    expect(skorKemiripan('Beton & Semen', 'Beton')).toBeGreaterThan(0.85)
    // Dan tetap kalah dari padanan yang benar-benar lengkap.
    expect(skorKemiripan('Beton & Semen', 'Beton'))
      .toBeLessThan(skorKemiripan('Beton', 'Beton'))
  })

  // Kecocokan SEBAGIAN yang sesungguhnya: sebagian kata cocok di kedua arah.
  it('kecocokan sebagian memberi skor di antara 0 dan 1', () => {
    // "beton pracetak" vs "beton prategang": 1 dari 2 kata cocok.
    const s = skorKemiripan('Beton Pracetak', 'Beton Prategang')
    expect(s).toBeGreaterThan(0)
    expect(s).toBeLessThan(1)
  })

  it('tak ada kata yang sama memberi nol', () => {
    expect(skorKemiripan('Sanitary', 'Beton')).toBe(0)
  })

  // "&" dan "dan" adalah penghubung, bukan isi. Menghitungnya sebagai kata
  // membuat "Cat & Pelapis" cocok dengan "Besi & Baja" hanya karena keduanya
  // memakai "&".
  it('kata penghubung tidak dihitung sebagai kecocokan', () => {
    expect(skorKemiripan('Cat & Pelapis', 'Besi & Baja')).toBe(0)
    expect(skorKemiripan('Bata dan Blok', 'Pasir dan Batu')).toBe(0)
  })

  it('nama kosong tidak melempar, hasilnya nol', () => {
    expect(skorKemiripan('', 'Beton')).toBe(0)
    expect(skorKemiripan('Beton', '')).toBe(0)
  })
})

describe('sarankanPemetaan — yang jelas cocok', () => {
  it('menyarankan Beton & Semen ke cost code Beton', () => {
    const s = sarankanPemetaan(KATEGORI, COST_CODE)
    const beton = s.find((x) => x.category_id === 'k1')
    expect(beton?.cost_code_id).toBe('c1')
  })

  it('menyarankan Besi & Baja ke BAJA meski beda huruf besar-kecil', () => {
    const s = sarankanPemetaan(KATEGORI, COST_CODE)
    expect(s.find((x) => x.category_id === 'k2')?.cost_code_id).toBe('c2')
  })

  it('membawa skor dan nama supaya manusia bisa menilai', () => {
    const s = sarankanPemetaan(KATEGORI, COST_CODE)
    const beton = s.find((x) => x.category_id === 'k1')!
    expect(beton.skor).toBeGreaterThan(0)
    expect(beton.category_name).toBe('Beton & Semen')
    expect(beton.cost_code_name).toBe('Beton')
  })
})

describe('sarankanPemetaan — NOL saran lebih baik daripada saran salah', () => {
  // INVARIAN INTI. Pemetaan yang salah mengalir ke laporan varians yang
  // dipakai menilai untung-rugi proyek, dan salahnya terlihat rapi.
  it('kategori tanpa padanan TIDAK disarankan sama sekali', () => {
    const s = sarankanPemetaan(KATEGORI, COST_CODE)
    // "Sanitary" tak punya cost code yang mirip di daftar ini.
    expect(s.find((x) => x.category_id === 'k4')).toBeUndefined()
  })

  it('daftar cost code kosong menghasilkan nol saran, bukan galat', () => {
    expect(sarankanPemetaan(KATEGORI, [])).toEqual([])
  })

  it('daftar kategori kosong menghasilkan nol saran', () => {
    expect(sarankanPemetaan([], COST_CODE)).toEqual([])
  })

  // Ambang dinaikkan = saran berkurang. Yang diuji: ambangnya benar-benar
  // dipatuhi, bukan sekadar ada sebagai parameter.
  it('ambang yang lebih tinggi menyaring saran yang lemah', () => {
    const longgar = sarankanPemetaan(KATEGORI, COST_CODE, { ambang: 0.1 })
    const ketat = sarankanPemetaan(KATEGORI, COST_CODE, { ambang: 0.99 })
    expect(ketat.length).toBeLessThan(longgar.length)
  })
})

describe('sarankanPemetaan — satu kategori satu cost code', () => {
  // Constraint basis: UNIQUE(category_id). Menyarankan dua cost code untuk
  // satu kategori menghasilkan usul yang tak mungkin diterapkan.
  it('tiap kategori muncul paling banyak sekali', () => {
    const s = sarankanPemetaan(KATEGORI, COST_CODE)
    const id = s.map((x) => x.category_id)
    expect(new Set(id).size).toBe(id.length)
  })

  // Kebalikannya SAH: banyak kategori boleh menunjuk cost code yang sama
  // (migrasi 112: "rollup beberapa kategori ke satu pekerjaan generik").
  it('cost code yang sama boleh disarankan untuk beberapa kategori', () => {
    const kat = [
      { id: 'a', name: 'Beton Ready Mix' },
      { id: 'b', name: 'Beton Precast' },
    ]
    const s = sarankanPemetaan(kat, [{ id: 'c1', code: 'CC', name: 'Beton' }])
    expect(s).toHaveLength(2)
    expect(s.every((x) => x.cost_code_id === 'c1')).toBe(true)
  })

  it('memilih padanan TERBAIK saat beberapa cost code cocok', () => {
    const kat = [{ id: 'a', name: 'Beton Pracetak' }]
    const cc = [
      { id: 'lemah', code: 'CC1', name: 'Beton' },
      { id: 'kuat', code: 'CC2', name: 'Beton Pracetak' },
    ]
    expect(sarankanPemetaan(kat, cc)[0].cost_code_id).toBe('kuat')
  })
})

describe('sarankanPemetaan — yang SUDAH dipetakan tidak diganggu', () => {
  // Saran yang menimpa keputusan manusia adalah saran yang merusak. Yang
  // sudah dipetakan dilewati sepenuhnya.
  it('kategori yang sudah punya pemetaan dilewati', () => {
    const s = sarankanPemetaan(KATEGORI, COST_CODE, { sudahDipetakan: ['k1'] })
    expect(s.find((x) => x.category_id === 'k1')).toBeUndefined()
    // Yang lain tetap disarankan.
    expect(s.find((x) => x.category_id === 'k2')).toBeDefined()
  })
})
