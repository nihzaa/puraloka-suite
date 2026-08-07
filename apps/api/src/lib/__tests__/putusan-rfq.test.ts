import { describe, it, expect } from 'vitest'
import { susunPutusan } from '../putusan-rfq.js'
import { susunTabulasi, type BarisPenawaran } from '../tabulasi-penawaran.js'

/**
 * PUTUSAN RFQ — aturan siapa boleh menang, dan apa yang wajib dicatat.
 *
 * Tabulasi dibangun lewat `susunTabulasi` yang sungguhan, bukan objek karangan.
 * Alasannya: yang diuji di sini adalah perilaku PADA BENTUK DATA NYATA, dan
 * tabulasi buatan tangan mudah tanpa sadar melewatkan hal yang justru sulit —
 * mis. vendor yang tak mengirim baris sama sekali tetap muncul sebagai sel
 * `harga_satuan: null`.
 */

const P = (
  supplier: string, material: string, harga: number | string,
  extra: Partial<BarisPenawaran> = {},
): BarisPenawaran => ({
  supplier_id: supplier,
  supplier_name: `PT ${supplier.toUpperCase()}`,
  material_id: material,
  material_name: `Material ${material}`,
  unit: 'sak',
  qty: 100,
  harga_satuan: harga,
  ...extra,
})

describe('susunPutusan — vendor yang tak bisa menang', () => {
  it('menolak vendor yang tak ada di RFQ ini', () => {
    const t = susunTabulasi([P('a', 'm1', 100_000)])
    const h = susunPutusan(t, { supplier_id: 'entah' })
    expect(h.ok).toBe(false)
    if (!h.ok) expect(h.alasan).toMatch(/tidak menawar di RFQ ini/i)
  })

  // INVARIAN 1: PO kosong bukan PO. GR dan invoice di belakangnya tak akan
  // punya apa pun untuk dicocokkan, dan tak satu pun dari itu melempar error.
  it('menolak vendor yang menandai tidak_menawar untuk SEMUA material', () => {
    const t = susunTabulasi([
      P('a', 'm1', 100_000),
      P('b', 'm1', 0, { tidak_menawar: true }),
    ])
    const h = susunPutusan(t, { supplier_id: 'b' })
    expect(h.ok).toBe(false)
    if (!h.ok) expect(h.alasan).toMatch(/tidak menawar satu pun material/i)
  })

  it('menolak vendor yang hanya muncul sebagai kolom kosong', () => {
    // `b` mengirim baris untuk m2 saja; pada m1 ia jadi sel null otomatis.
    // Kalau kita minta putusan untuk vendor yang cuma punya sel null di
    // seluruh baris, hasilnya harus ditolak — bukan PO nol item.
    const t = susunTabulasi([
      P('a', 'm1', 100_000),
      P('b', 'm2', 0, { tidak_menawar: true }),
    ])
    const h = susunPutusan(t, { supplier_id: 'b' })
    expect(h.ok).toBe(false)
  })
})

describe('susunPutusan — material yang tak ditawar TIDAK masuk PO', () => {
  // INVARIAN 2: masuk dengan harga 0 akan mengalir ke `total_price` sebagai
  // potongan diam-diam, dan ke laporan sebagai material yang "dibeli gratis".
  it('melewati material yang vendornya tidak menawar', () => {
    const t = susunTabulasi([
      P('a', 'm1', 100_000),
      P('a', 'm2', 0, { tidak_menawar: true }),
      P('b', 'm2', 50_000),
    ])
    const h = susunPutusan(t, { supplier_id: 'a' })
    expect(h.ok).toBe(true)
    if (!h.ok) return
    expect(h.rencana.item).toHaveLength(1)
    expect(h.rencana.item[0].material_id).toBe('m1')
    expect(h.rencana.item.some((i) => i.unit_price === 0)).toBe(false)
  })

  it('melewati material yang barisnya tak dikirim vendor itu sama sekali', () => {
    const t = susunTabulasi([
      P('a', 'm1', 100_000),
      P('b', 'm1', 110_000),
      P('b', 'm2', 20_000),
    ])
    const h = susunPutusan(t, { supplier_id: 'a' })
    expect(h.ok).toBe(true)
    if (!h.ok) return
    expect(h.rencana.item.map((i) => i.material_id)).toEqual(['m1'])
  })

  it('melewati material ber-qty nol — memesan nol satuan tak berarti apa-apa', () => {
    const t = susunTabulasi([
      P('a', 'm1', 100_000, { qty: 0 }),
      P('a', 'm2', 50_000),
    ])
    const h = susunPutusan(t, { supplier_id: 'a' })
    expect(h.ok).toBe(true)
    if (!h.ok) return
    expect(h.rencana.item.map((i) => i.material_id)).toEqual(['m2'])
  })
})

describe('susunPutusan — alasan wajib saat bukan termurah', () => {
  const lebihMahal = () => susunTabulasi([
    P('murah', 'm1', 100_000),
    P('mahal', 'm1', 120_000),
  ])

  // INVARIAN 3 — aturan pokok migrasi 195.
  it('menolak tanpa alasan, dan menyebut MATERIAL mana yang lebih mahal', () => {
    const h = susunPutusan(lebihMahal(), { supplier_id: 'mahal' })
    expect(h.ok).toBe(false)
    if (!h.ok) {
      expect(h.alasan).toMatch(/Material m1/)
      expect(h.alasan).toMatch(/wajib/i)
    }
  })

  it('menolak alasan yang hanya spasi', () => {
    const h = susunPutusan(lebihMahal(), { supplier_id: 'mahal', alasan: '    ' })
    expect(h.ok).toBe(false)
  })

  // INVARIAN 4: "ok" mengisi kolom tanpa menjelaskan apa pun.
  it('menolak alasan basa-basi yang terlalu pendek', () => {
    const h = susunPutusan(lebihMahal(), { supplier_id: 'mahal', alasan: 'ok' })
    expect(h.ok).toBe(false)
    if (!h.ok) expect(h.alasan).toMatch(/terlalu pendek/i)
  })

  it('menerima alasan yang sungguh-sungguh', () => {
    const h = susunPutusan(lebihMahal(), {
      supplier_id: 'mahal',
      alasan: 'Stok siap kirim 2 hari; vendor termurah inden 3 minggu',
    })
    expect(h.ok).toBe(true)
    if (!h.ok) return
    expect(h.rencana.seluruhnya_termurah).toBe(false)
    expect(h.rencana.lebih_mahal).toHaveLength(1)
    expect(h.rencana.selisih_total).toBe((120_000 - 100_000) * 100)
  })

  // INVARIAN 5: memaksa alasan untuk keputusan yang sudah benar melatih orang
  // mengetik apa saja supaya tombolnya menyala.
  it('TIDAK meminta alasan bila vendornya termurah di semuanya', () => {
    const t = susunTabulasi([
      P('murah', 'm1', 100_000),
      P('mahal', 'm1', 120_000),
    ])
    const h = susunPutusan(t, { supplier_id: 'murah' })
    expect(h.ok).toBe(true)
    if (!h.ok) return
    expect(h.rencana.seluruhnya_termurah).toBe(true)
    expect(h.rencana.selisih_total).toBe(0)
  })

  // Dua vendor pada harga yang PERSIS SAMA: keduanya sah menang tanpa alasan,
  // karena tak satu pun lebih mahal daripada yang lain.
  //
  // Test ini TIDAK membedakan `harga > harga_termurah` dari `!sel.termurah` —
  // diuji dengan mutasi 2026-08-08, menukarnya tak memerahkan apa pun. Itu
  // memang benar: `susunTabulasi` menandai `termurah` pada SEMUA sel yang seri,
  // jadi kedua rumus setara hari ini. Yang dijaga di sini adalah PERILAKUNYA
  // (seri tak menuntut alasan), bukan rumus mana yang dipakai untuk mencapainya.
  it('TIDAK meminta alasan saat harganya seri dengan yang terendah', () => {
    const t = susunTabulasi([
      P('a', 'm1', 100_000),
      P('b', 'm1', 100_000),
    ])
    for (const s of ['a', 'b']) {
      const h = susunPutusan(t, { supplier_id: s })
      expect(h.ok).toBe(true)
      if (h.ok) expect(h.rencana.seluruhnya_termurah).toBe(true)
    }
  })

  it('meminta alasan bila lebih mahal di SATU material saja dari banyak', () => {
    const t = susunTabulasi([
      P('a', 'm1', 100_000), P('b', 'm1', 110_000),
      P('a', 'm2', 200_000), P('b', 'm2', 190_000),
      P('a', 'm3', 300_000), P('b', 'm3', 290_000),
    ])
    // `a` menang di m1 tapi kalah di m2 dan m3.
    const h = susunPutusan(t, { supplier_id: 'a' })
    expect(h.ok).toBe(false)
    if (!h.ok) expect(h.alasan).toMatch(/1 material lain/)
  })
})

describe('susunPutusan — aritmetika', () => {
  // INVARIAN 6: NUMERIC Postgres tiba sebagai STRING. `'100000' + '20000'`
  // merangkai jadi '10000020000' tanpa satu pun error.
  it('menghitung string NUMERIC sebagai angka, bukan merangkai teks', () => {
    const t = susunTabulasi([
      P('a', 'm1', '100000', { qty: '2' }),
      P('a', 'm2', '20000', { qty: '3' }),
    ])
    const h = susunPutusan(t, { supplier_id: 'a' })
    expect(h.ok).toBe(true)
    if (!h.ok) return
    expect(h.rencana.total).toBe(100_000 * 2 + 20_000 * 3)
    expect(String(h.rencana.total)).not.toContain('10000020000')
  })

  it('total sama dengan jumlah qty × harga tiap item', () => {
    const t = susunTabulasi([
      P('a', 'm1', 100_000, { qty: 10 }),
      P('a', 'm2', 250_000, { qty: 4 }),
    ])
    const h = susunPutusan(t, { supplier_id: 'a' })
    expect(h.ok).toBe(true)
    if (!h.ok) return
    const manual = h.rencana.item.reduce((s, i) => s + i.qty_ordered * i.unit_price, 0)
    expect(h.rencana.total).toBe(manual)
    expect(h.rencana.total).toBe(100_000 * 10 + 250_000 * 4)
  })

  it('membawa unit material apa adanya, dengan cadangan bila kosong', () => {
    const t = susunTabulasi([
      P('a', 'm1', 100_000, { unit: 'm3' }),
      P('a', 'm2', 50_000, { unit: null }),
    ])
    const h = susunPutusan(t, { supplier_id: 'a' })
    expect(h.ok).toBe(true)
    if (!h.ok) return
    const unit = Object.fromEntries(h.rencana.item.map((i) => [i.material_id, i.unit]))
    expect(unit.m1).toBe('m3')
    expect(unit.m2).toBe('unit')
  })

  it('selisih_total dihitung per satuan × qty, bukan per satuan saja', () => {
    const t = susunTabulasi([
      P('murah', 'm1', 100_000, { qty: 50 }),
      P('mahal', 'm1', 110_000, { qty: 50 }),
    ])
    const h = susunPutusan(t, {
      supplier_id: 'mahal',
      alasan: 'Mutu SNI bersertifikat; yang termurah tanpa sertifikat',
    })
    expect(h.ok).toBe(true)
    if (!h.ok) return
    expect(h.rencana.selisih_total).toBe(10_000 * 50)
  })
})
