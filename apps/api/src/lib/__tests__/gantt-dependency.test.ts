/**
 * DEPENDENCY GANTT — mengunci aturan yang dipindah dari frontend.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * KENAPA TEST INI ADA
 * ══════════════════════════════════════════════════════════════════════════
 *
 * `cariPelanggaranDependency` adalah SALINAN aturan yang hidup di
 * `apps/web/components/gantt-section.tsx`. Selama dua salinan itu ada, satu-
 * satunya yang mencegahnya menyimpang adalah test yang menyebutkan perilaku
 * spesifiknya — bukan sekadar "mengembalikan array".
 *
 * Yang dikunci di sini adalah keputusan yang mudah berubah tanpa sadar saat
 * kode dipindah:
 *
 *   AMBANG DANGER   `< threshold * 0.5`, bukan `<= ` dan bukan angka lain
 *   TUMPANG 14 HARI batas advisory jadi danger
 *   actual > plan   progres NYATA menang atas rencana
 *   PENDAHULU HILANG dilewati, BUKAN dianggap 0%
 *
 * Yang terakhir itu paling halus: menganggap pendahulu hilang sebagai 0%
 * membuat peringatan muncul untuk sesuatu yang tak bisa ditindaklanjuti
 * siapa pun — dan peringatan yang tak bisa ditindaklanjuti adalah cara
 * tercepat membuat orang berhenti membaca semuanya.
 */
import { describe, it, expect } from 'vitest'
import {
  cariPelanggaranDependency,
  bacaAturanDependency,
  type TugasGantt,
} from '../gantt-dependency.js'

/** Pembuat tugas ringkas — hanya yang relevan yang disebut di tiap test. */
const tugas = (t: Partial<TugasGantt> & { id: string }): TugasGantt => ({
  uraian: `Pekerjaan ${t.id}`,
  planned_start: '2026-03-01',
  planned_end: '2026-03-31',
  progress_pct: 0,
  dep_rules: [],
  ...t,
})

describe('aturan ambang persen', () => {
  it('pendahulu di bawah ambang MENGHASILKAN peringatan', () => {
    const hasil = cariPelanggaranDependency([
      tugas({ id: 'a', uraian: 'Pondasi', progress_pct: 50 }),
      tugas({ id: 'b', uraian: 'Kolom', dep_rules: [{ item_id: 'a', threshold_pct: 80 }] }),
    ])

    expect(hasil).toHaveLength(1)
    expect(hasil[0].fromId).toBe('a')
    expect(hasil[0].toId).toBe('b')
    expect(hasil[0].message).toContain('"Kolom" butuh "Pondasi" ≥80%')
    expect(hasil[0].message).toContain('baru 50%')
  })

  it('pendahulu SUDAH memenuhi ambang tidak menghasilkan apa-apa', () => {
    const hasil = cariPelanggaranDependency([
      tugas({ id: 'a', progress_pct: 80 }),
      tugas({ id: 'b', dep_rules: [{ item_id: 'a', threshold_pct: 80 }] }),
    ])
    // Tepat di ambang = terpenuhi. `<` bukan `<=`.
    expect(hasil).toHaveLength(0)
  })

  it('danger tepat di BAWAH setengah ambang, warning tepat DI setengahnya', () => {
    // Batas yang paling gampang bergeser satu langkah saat kode dipindah.
    const pada40 = cariPelanggaranDependency([
      tugas({ id: 'a', progress_pct: 40 }),
      tugas({ id: 'b', dep_rules: [{ item_id: 'a', threshold_pct: 80 }] }),
    ])
    expect(pada40[0].severity).toBe('warning')   // 40 < 40 salah → warning

    const pada39 = cariPelanggaranDependency([
      tugas({ id: 'a', progress_pct: 39 }),
      tugas({ id: 'b', dep_rules: [{ item_id: 'a', threshold_pct: 80 }] }),
    ])
    expect(pada39[0].severity).toBe('danger')
  })

  it('progres NYATA menang atas progres rencana', () => {
    // `actual_pct` 90 mengalahkan `progress_pct` 10 — kalau terbalik,
    // pekerjaan yang sudah beres tetap diperingatkan tiap hari.
    const hasil = cariPelanggaranDependency([
      tugas({ id: 'a', progress_pct: 10, actual_pct: 90 }),
      tugas({ id: 'b', dep_rules: [{ item_id: 'a', threshold_pct: 80 }] }),
    ])
    expect(hasil).toHaveLength(0)
  })

  it('label ikut muncul di pesan bila ada', () => {
    const hasil = cariPelanggaranDependency([
      tugas({ id: 'a', uraian: 'Pondasi', progress_pct: 10 }),
      tugas({
        id: 'b', uraian: 'Kolom',
        dep_rules: [{ item_id: 'a', threshold_pct: 80, label: 'beton harus kering' }],
      }),
    ])
    expect(hasil[0].message).toContain('(beton harus kering)')
  })
})

describe('aturan advisory berbasis tanggal', () => {
  it('mulai SEBELUM pendahulu selesai menghasilkan peringatan', () => {
    const hasil = cariPelanggaranDependency([
      tugas({ id: 'a', uraian: 'Pondasi', planned_end: '2026-03-20' }),
      tugas({
        id: 'b', uraian: 'Kolom', planned_start: '2026-03-15',
        dep_rules: [{ item_id: 'a', threshold_pct: null }],
      }),
    ])
    expect(hasil).toHaveLength(1)
    expect(hasil[0].message).toContain('dimulai 5 hari sebelum')
    expect(hasil[0].severity).toBe('warning')
  })

  it('tumpang tindih LEBIH dari 14 hari jadi danger', () => {
    const hasil = cariPelanggaranDependency([
      tugas({ id: 'a', planned_end: '2026-03-20' }),
      tugas({
        id: 'b', planned_start: '2026-03-05',   // 15 hari
        dep_rules: [{ item_id: 'a', threshold_pct: null }],
      }),
    ])
    expect(hasil[0].severity).toBe('danger')
  })

  it('tepat 14 hari masih warning, bukan danger', () => {
    const hasil = cariPelanggaranDependency([
      tugas({ id: 'a', planned_end: '2026-03-20' }),
      tugas({
        id: 'b', planned_start: '2026-03-06',   // 14 hari
        dep_rules: [{ item_id: 'a', threshold_pct: null }],
      }),
    ])
    expect(hasil[0].severity).toBe('warning')
  })

  it('mulai SESUDAH pendahulu selesai tidak menghasilkan apa-apa', () => {
    const hasil = cariPelanggaranDependency([
      tugas({ id: 'a', planned_end: '2026-03-20' }),
      tugas({
        id: 'b', planned_start: '2026-03-25',
        dep_rules: [{ item_id: 'a', threshold_pct: null }],
      }),
    ])
    expect(hasil).toHaveLength(0)
  })
})

describe('bentuk data yang tak sempurna tidak meledak', () => {
  it('pendahulu yang TIDAK ADA dilewati, bukan dianggap 0%', () => {
    // Kalau dianggap 0%, ini menghasilkan peringatan yang menunjuk
    // pekerjaan yang tak ada — tak seorang pun bisa menindaklanjutinya.
    const hasil = cariPelanggaranDependency([
      tugas({ id: 'b', dep_rules: [{ item_id: 'sudah-dihapus', threshold_pct: 80 }] }),
    ])
    expect(hasil).toHaveLength(0)
  })

  it('tugas tanpa planned_start dilewati', () => {
    const hasil = cariPelanggaranDependency([
      tugas({ id: 'a', progress_pct: 0 }),
      tugas({ id: 'b', planned_start: null, dep_rules: [{ item_id: 'a', threshold_pct: 80 }] }),
    ])
    expect(hasil).toHaveLength(0)
  })

  it('advisory tanpa planned_end pendahulu dilewati', () => {
    const hasil = cariPelanggaranDependency([
      tugas({ id: 'a', planned_end: null }),
      tugas({ id: 'b', dep_rules: [{ item_id: 'a', threshold_pct: null }] }),
    ])
    expect(hasil).toHaveLength(0)
  })
})

describe('bacaAturanDependency — JSONB tanpa CHECK bisa berisi apa saja', () => {
  it('bentuk sah dibaca apa adanya', () => {
    expect(bacaAturanDependency([{ item_id: 'x', threshold_pct: 80, label: 'a' }]))
      .toEqual([{ item_id: 'x', threshold_pct: 80, label: 'a' }])
  })

  it('bukan array jadi array kosong, bukan galat', () => {
    expect(bacaAturanDependency(null)).toEqual([])
    expect(bacaAturanDependency('bukan array')).toEqual([])
    expect(bacaAturanDependency({ item_id: 'x' })).toEqual([])
  })

  it('baris tanpa item_id dibuang', () => {
    expect(bacaAturanDependency([{ threshold_pct: 80 }, null, 'teks'])).toEqual([])
  })

  it('ambang di luar 0..100 dibuang — 500% tak pernah bisa terpenuhi', () => {
    expect(bacaAturanDependency([{ item_id: 'x', threshold_pct: 500 }])).toEqual([])
    expect(bacaAturanDependency([{ item_id: 'x', threshold_pct: -1 }])).toEqual([])
  })

  it('threshold_pct null tetap sah — itu advisory', () => {
    expect(bacaAturanDependency([{ item_id: 'x', threshold_pct: null }]))
      .toEqual([{ item_id: 'x', threshold_pct: null, label: null }])
  })
})
