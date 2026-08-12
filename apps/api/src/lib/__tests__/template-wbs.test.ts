/**
 * F2 — aturan template WBS. MURNI, tanpa basis.
 */
import { describe, it, expect } from 'vitest'
import {
  susunBarisRab, periksaTerapTemplate, urutkanTemplate, versiBerikutnya,
  type NodeTemplate, type RingkasTemplate,
} from '../template-wbs.js'

const n = (id: string, parent: string | null, name: string, urut = 1): NodeTemplate =>
  ({ id, parent_id: parent, name, sort_order: urut })

describe('susun baris RAB dari pohon template', () => {
  it('akar jadi category, anak jadi subcategory, cucu jadi item', () => {
    const h = susunBarisRab([
      n('a', null, 'PEKERJAAN PERSIAPAN'),
      n('b', 'a', 'Bouwplank'),
      n('c', 'b', 'Pasang papan'),
    ])
    expect(h.ok).toBe(true)
    if (!h.ok) return
    expect(h.baris.map((x) => x.level)).toEqual(['category', 'subcategory', 'item'])
    expect(h.jumlahTingkat).toBe(3)
  })

  it('kedalaman DI ATAS tiga dipadatkan ke item, bukan ditolak', () => {
    // CBS memang bisa berjenjang dalam. Menolaknya membuat template yang sah
    // tak bisa dipakai sama sekali, dan hierarkinya tetap terjaga lewat parent.
    const h = susunBarisRab([
      n('a', null, 'L0'), n('b', 'a', 'L1'), n('c', 'b', 'L2'), n('d', 'c', 'L3'),
    ])
    expect(h.ok).toBe(true)
    if (!h.ok) return
    expect(h.baris.map((x) => x.level)).toEqual(['category', 'subcategory', 'item', 'item'])
  })

  it('INDUK selalu sebelum anaknya — pemanggil menulis per-tingkat', () => {
    // Urutan masukan sengaja terbalik: anak lebih dulu.
    const h = susunBarisRab([
      n('c', 'b', 'cucu'), n('b', 'a', 'anak'), n('a', null, 'akar'),
    ])
    expect(h.ok).toBe(true)
    if (!h.ok) return
    expect(h.baris.map((x) => x.kunci)).toEqual(['a', 'b', 'c'])
  })

  it('sesama tingkat diurutkan menurut sort_order', () => {
    const h = susunBarisRab([
      n('a', null, 'kedua', 2), n('b', null, 'pertama', 1), n('c', null, 'ketiga', 3),
    ])
    expect(h.ok).toBe(true)
    if (!h.ok) return
    expect(h.baris.map((x) => x.name)).toEqual(['pertama', 'kedua', 'ketiga'])
  })

  it('template kosong ditolak', () => {
    const h = susunBarisRab([])
    expect(h.ok).toBe(false)
    if (!h.ok) expect(h.galat).toMatch(/belum punya satu pun/i)
  })

  it('induk yang menunjuk ke luar daftar ditolak, dan menyebut barisnya', () => {
    const h = susunBarisRab([n('a', 'hantu', 'yatim')])
    expect(h.ok).toBe(false)
    if (!h.ok) expect(h.galat).toMatch(/yatim/)
  })

  it('lingkaran induk BERTIGA ditolak, tidak menggantung', () => {
    // `parent_id <> id` di basis hanya mencegah lingkaran SATU node. Lingkaran
    // bertiga lolos CHECK itu, dan hasilnya proses yang tak pernah selesai —
    // bukan galat yang bisa dibaca.
    const h = susunBarisRab([
      n('a', 'c', 'A'), n('b', 'a', 'B'), n('c', 'b', 'C'),
    ])
    expect(h.ok).toBe(false)
    if (!h.ok) expect(h.galat).toMatch(/lingkaran/i)
  })

  it('parent_kunci dibawa apa adanya untuk dipetakan pemanggil', () => {
    const h = susunBarisRab([n('a', null, 'akar'), n('b', 'a', 'anak')])
    expect(h.ok).toBe(true)
    if (!h.ok) return
    expect(h.baris[0].parent_kunci).toBeNull()
    expect(h.baris[1].parent_kunci).toBe('a')
  })

  it('dua akar terpisah keduanya jadi category', () => {
    const h = susunBarisRab([
      n('a', null, 'PERSIAPAN', 1), n('b', null, 'BETON', 2), n('c', 'b', 'Sloof'),
    ])
    expect(h.ok).toBe(true)
    if (!h.ok) return
    expect(h.baris.filter((x) => x.level === 'category')).toHaveLength(2)
  })
})

describe('boleh diterapkan?', () => {
  const dasar = { statusTemplate: 'active' as const, jumlahNode: 5, jumlahRabProyek: 0 }

  it('template aktif ke proyek kosong: boleh', () => {
    expect(periksaTerapTemplate(dasar).boleh).toBe(true)
  })

  it('template DRAF ditolak dengan alasan yang menjelaskan', () => {
    const h = periksaTerapTemplate({ ...dasar, statusTemplate: 'draft' })
    expect(h.boleh).toBe(false)
    if (!h.boleh) expect(h.sebab).toMatch(/aktifkan lebih dulu/i)
  })

  it('template SUPERSEDED ditolak dan menunjuk versi terbaru', () => {
    const h = periksaTerapTemplate({ ...dasar, statusTemplate: 'superseded' })
    expect(h.boleh).toBe(false)
    if (!h.boleh) expect(h.sebab).toMatch(/versi terbarunya/i)
  })

  it('template tanpa node ditolak', () => {
    expect(periksaTerapTemplate({ ...dasar, jumlahNode: 0 }).boleh).toBe(false)
  })

  it('proyek yang SUDAH ber-RAB ditolak — bukan ditimpa', () => {
    // 285 item beserta harga dan progres lapangan hilang karena satu ketukan,
    // tanpa undo. Progres itu tak bisa dibuat ulang dari mana pun.
    const h = periksaTerapTemplate({ ...dasar, jumlahRabProyek: 285 })
    expect(h.boleh).toBe(false)
    if (!h.boleh) {
      expect(h.sebab).toMatch(/285/)
      expect(h.sebab).toMatch(/tak bisa dibatalkan/i)
    }
  })

  it('satu baris RAB pun sudah cukup menolak', () => {
    expect(periksaTerapTemplate({ ...dasar, jumlahRabProyek: 1 }).boleh).toBe(false)
  })
})

describe('urutan daftar template', () => {
  const t = (o: Partial<RingkasTemplate>): RingkasTemplate => ({
    id: 'x', code: 'A', name: 'n', source: 'company', version_number: 1,
    status: 'active', ...o,
  })

  it('aktif di atas, draf di tengah, superseded paling bawah', () => {
    const u = urutkanTemplate([
      t({ code: 'C', status: 'superseded' }),
      t({ code: 'B', status: 'draft' }),
      t({ code: 'A', status: 'active' }),
    ])
    expect(u.map((x) => x.status)).toEqual(['active', 'draft', 'superseded'])
  })

  it('dalam satu status, kode diurut abjad', () => {
    const u = urutkanTemplate([t({ code: 'Z' }), t({ code: 'A' }), t({ code: 'M' })])
    expect(u.map((x) => x.code)).toEqual(['A', 'M', 'Z'])
  })

  it('kode sama: versi TERBARU di depan', () => {
    const u = urutkanTemplate([
      t({ code: 'A', version_number: 1, status: 'draft' }),
      t({ code: 'A', version_number: 3, status: 'draft' }),
      t({ code: 'A', version_number: 2, status: 'draft' }),
    ])
    expect(u.map((x) => x.version_number)).toEqual([3, 2, 1])
  })

  it('daftar kosong tidak melempar', () => {
    expect(urutkanTemplate([])).toEqual([])
  })
})

describe('versi berikutnya', () => {
  it('belum ada versi → 1', () => {
    expect(versiBerikutnya([])).toBe(1)
  })

  it('MAKS + 1, bukan jumlah baris', () => {
    // Versi yang dihapus tak boleh membuat nomornya lahir kembali — dokumen
    // yang merujuk versi lama akan menunjuk struktur yang berbeda.
    expect(versiBerikutnya([1, 5])).toBe(6)
  })

  it('urutan masukan tak berpengaruh', () => {
    expect(versiBerikutnya([5, 1, 3])).toBe(6)
  })

  it('nilai tak sah diabaikan, bukan membuat NaN', () => {
    expect(versiBerikutnya([1, NaN as unknown as number, 2])).toBe(3)
  })

  it('versi bertipe string (dari pg) tetap terbaca', () => {
    expect(versiBerikutnya(['2', '7'] as unknown as number[])).toBe(8)
  })
})
