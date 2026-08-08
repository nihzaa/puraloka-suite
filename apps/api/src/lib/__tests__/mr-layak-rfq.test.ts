import { describe, it, expect } from 'vitest'
import { sisaKebutuhan, mrLayakRfq, ringkasKelayakan } from '../mr-layak-rfq.js'

/**
 * MR mana yang layak dimintakan penawaran — dan BERAPA.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * KENAPA PUSTAKA INI ADA
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Diukur 2026-08-08: `rfq.mr_id` ada di schema, rute API sudah menerimanya,
 * dan **3 dari 3 RFQ punya `mr_id` NULL** — karena UI tak punya satu pun cara
 * mengisinya. Kelas cacat yang sama dengan `po_id` yang dibaca-tapi-tak-pernah-
 * ditulis: tiap bagian ada, hanya sambungannya yang tidak.
 *
 * Akibatnya "RFQ ini untuk kebutuhan apa?" tak terjawab selamanya.
 *
 * ── Kenapa SISA, bukan qty penuh
 *
 * Diukur pada data nyata: MR-2026-003 berstatus `partially_ordered` — 115
 * diminta, 85 sudah dipesan. Menawarkannya dengan qty penuh berarti meminta
 * vendor menghargai 85 unit yang sudah dibeli. Vendor menjawab dengan benar,
 * angkanya salah, dan tak ada yang menyadarinya karena RFQ-nya sendiri
 * terlihat rapi.
 *
 * Sisa = diminta − dipesan. Kalau nol, item itu tak ikut.
 *
 * ── Kenapa hanya yang SUDAH disetujui
 *
 * `draft`/`submitted` belum disetujui. Meminta harga untuk kebutuhan yang
 * belum tentu jadi adalah membuang waktu vendor — dan hubungan dengan vendor
 * adalah aset yang tak muncul di neraca.
 */

const mr = (status: string, items: [number, number][]) => ({
  id: 'x', mr_number: 'MR-TEST', status,
  items: items.map(([diminta, dipesan], i) => ({
    id: `i${i}`, qty_requested: diminta, qty_ordered: dipesan,
    unit: 'sak', material: { id: `m${i}`, name: `Bahan ${i}`, unit: 'sak' },
  })),
})

describe('sisaKebutuhan', () => {
  it('belum dipesan sama sekali → sisa = seluruhnya', () => {
    expect(sisaKebutuhan({ qty_requested: 100, qty_ordered: 0 })).toBe(100)
  })

  it('sebagian dipesan → sisa = selisihnya', () => {
    expect(sisaKebutuhan({ qty_requested: 115, qty_ordered: 85 })).toBe(30)
  })

  it('sudah dipesan penuh → sisa nol', () => {
    expect(sisaKebutuhan({ qty_requested: 50, qty_ordered: 50 })).toBe(0)
  })

  // `qty_ordered` nullable di basis. NULL berarti "belum ada", bukan nol
  // yang tak diketahui — tapi hasilnya sama, dan yang penting ia tak
  // menghasilkan NaN yang meracuni seluruh penjumlahan.
  it('qty_ordered NULL diperlakukan sebagai nol, bukan NaN', () => {
    expect(sisaKebutuhan({ qty_requested: 40, qty_ordered: null })).toBe(40)
    expect(sisaKebutuhan({ qty_requested: 40, qty_ordered: undefined })).toBe(40)
  })

  // Postgres `numeric` tiba sebagai STRING. `100 - "85"` kebetulan bekerja di
  // JS, tapi `"100" + "85"` menyambung jadi "10085" — dan sekali satu jalur
  // memakai string, sisanya ikut. Dipaksa jadi angka di satu tempat.
  it('numeric yang tiba sebagai string tetap dihitung sebagai angka', () => {
    expect(sisaKebutuhan({ qty_requested: '115.000' as never, qty_ordered: '85.000' as never })).toBe(30)
  })

  // Dipesan LEBIH dari diminta: nyata terjadi (pembulatan ke kelipatan
  // kemasan). Sisanya nol, bukan negatif — RFQ ber-qty negatif adalah
  // permintaan yang tak punya arti.
  it('dipesan melebihi diminta memberi nol, bukan negatif', () => {
    expect(sisaKebutuhan({ qty_requested: 100, qty_ordered: 120 })).toBe(0)
  })

  it('nilai tak terbaca memberi nol, bukan NaN', () => {
    expect(sisaKebutuhan({ qty_requested: 'abc' as never, qty_ordered: 0 })).toBe(0)
  })
})

describe('mrLayakRfq — hanya yang sudah disetujui', () => {
  it('approved dengan sisa → layak', () => {
    expect(mrLayakRfq(mr('approved', [[100, 0]])).layak).toBe(true)
  })

  it('partially_ordered dengan sisa → layak', () => {
    expect(mrLayakRfq(mr('partially_ordered', [[115, 85]])).layak).toBe(true)
  })

  // INVARIAN. Meminta harga untuk kebutuhan yang belum disetujui membuang
  // waktu vendor, dan vendor yang merasa waktunya dibuang berhenti menjawab.
  it('draft TIDAK layak meski punya sisa', () => {
    const h = mrLayakRfq(mr('draft', [[32, 0]]))
    expect(h.layak).toBe(false)
    expect(h.sebab).toMatch(/belum disetujui/i)
  })

  it('submitted TIDAK layak — diajukan bukan disetujui', () => {
    expect(mrLayakRfq(mr('submitted', [[145, 0]])).layak).toBe(false)
  })

  it('rejected TIDAK layak', () => {
    expect(mrLayakRfq(mr('rejected', [[50, 0]])).layak).toBe(false)
  })

  // Status apa pun yang belum dikenal diperlakukan TIDAK layak. Gagal-tertutup:
  // status baru yang lolos diam-diam menghasilkan RFQ untuk kebutuhan yang
  // belum tentu sah.
  it('status yang tak dikenal TIDAK layak (gagal-tertutup)', () => {
    expect(mrLayakRfq(mr('entah_apa', [[50, 0]])).layak).toBe(false)
  })
})

describe('mrLayakRfq — yang tak bersisa tak perlu ditawar', () => {
  it('fully_ordered TIDAK layak', () => {
    const h = mrLayakRfq(mr('fully_ordered', [[430, 430]]))
    expect(h.layak).toBe(false)
    expect(h.sebab).toMatch(/sudah dipesan/i)
  })

  // approved tapi seluruh itemnya sudah dipesan — statusnya belum sempat
  // berpindah. Yang menentukan kelayakan adalah SISA, bukan label status.
  it('approved yang seluruh itemnya habis dipesan TIDAK layak', () => {
    expect(mrLayakRfq(mr('approved', [[50, 50], [30, 30]])).layak).toBe(false)
  })

  it('MR tanpa item sama sekali TIDAK layak', () => {
    expect(mrLayakRfq(mr('approved', [])).layak).toBe(false)
  })
})

describe('mrLayakRfq — hanya item bersisa yang dibawa', () => {
  // Ini alasan pustaka ini ada. Membawa item yang sudah dipesan penuh
  // membuat vendor menghargai barang yang sudah dibeli.
  it('item yang sudah dipesan penuh TIDAK ikut', () => {
    const h = mrLayakRfq(mr('partially_ordered', [[100, 100], [50, 20]]))
    expect(h.item).toHaveLength(1)
    expect(h.item[0].qty).toBe(30)
  })

  it('qty yang dibawa adalah SISA, bukan yang diminta', () => {
    const h = mrLayakRfq(mr('partially_ordered', [[115, 85]]))
    expect(h.item[0].qty).toBe(30)
    expect(h.item[0].qty_diminta).toBe(115)
  })

  it('membawa material_id — itu yang dibutuhkan rfq_penawaran', () => {
    const h = mrLayakRfq(mr('approved', [[10, 0]]))
    expect(h.item[0].material_id).toBe('m0')
    expect(h.item[0].material_name).toBe('Bahan 0')
  })

  // Item tanpa material tak bisa jadi baris penawaran: `rfq_penawaran.material_id`
  // NOT NULL. Dilewati diam-diam akan membuat RFQ kekurangan baris tanpa
  // gejala; dilewati DENGAN dihitung membuatnya terlihat.
  it('item tanpa material dilewati dan DIHITUNG', () => {
    const rusak = {
      id: 'x', mr_number: 'MR-X', status: 'approved',
      items: [
        { id: 'a', qty_requested: 10, qty_ordered: 0, unit: 'sak', material: null },
        { id: 'b', qty_requested: 5, qty_ordered: 0, unit: 'sak', material: { id: 'm1', name: 'Semen', unit: 'sak' } },
      ],
    }
    const h = mrLayakRfq(rusak as never)
    expect(h.item).toHaveLength(1)
    expect(h.tanpa_material).toBe(1)
  })
})

describe('ringkasKelayakan — daftar untuk dipilih manusia', () => {
  const daftar = [
    mr('approved', [[66, 0]]),
    mr('draft', [[32, 0]]),
    mr('fully_ordered', [[430, 430]]),
    mr('partially_ordered', [[115, 85]]),
  ]

  it('hanya yang layak yang bisa dipilih', () => {
    const r = ringkasKelayakan(daftar)
    expect(r.layak).toHaveLength(2)
  })

  // Yang TIDAK layak tetap dilaporkan jumlahnya. Daftar yang diam-diam
  // menyusut membuat orang bertanya "MR saya ke mana" tanpa jawaban.
  it('yang tidak layak dihitung, bukan dihilangkan diam-diam', () => {
    const r = ringkasKelayakan(daftar)
    expect(r.tak_layak).toBe(2)
  })

  it('daftar kosong tidak melempar', () => {
    expect(ringkasKelayakan([]).layak).toEqual([])
  })

  // Yang paling banyak sisanya lebih dulu: itu yang paling mendesak dicarikan
  // harga, dan yang paling besar dampaknya bila salah.
  it('diurutkan dari sisa terbesar', () => {
    const r = ringkasKelayakan(daftar)
    expect(r.layak[0].total_sisa).toBeGreaterThanOrEqual(r.layak[1].total_sisa)
  })
})
