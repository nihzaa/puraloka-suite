import { describe, it, expect } from 'vitest'
import { bubbleUpProgress, type RabItemNode } from '../rab-aggregation'

// Task 1.2.3 — test case wajib per Phase1/06-test-strategy.md § Unit Test:
// kategori dengan 1 item vs banyak item, weight di luar 99.9-100.1% (constraint
// migration 052) — plus kasus edge yang ditemukan saat membaca kode asal
// (totalWeight=0 di-skip lapis 1, tapi TIDAK di-skip di lapis 2).

describe('bubbleUpProgress', () => {
  it('kategori dengan 1 item — progress kategori = progress item itu', () => {
    const items: RabItemNode[] = [
      { id: 'cat-1', parent_id: null, level: 'category', weight_pct: 100, progress_pct: 0 },
      { id: 'item-1', parent_id: 'cat-1', level: 'item', weight_pct: 100, progress_pct: 75 },
    ]
    const result = bubbleUpProgress(items)
    expect(result.categoryProgress.get('cat-1')).toBe(75)
    expect(result.overallProgress).toBe(75)
  })

  it('kategori dengan banyak item — weighted average, bukan rata-rata polos', () => {
    const items: RabItemNode[] = [
      { id: 'cat-1', parent_id: null, level: 'category', weight_pct: 100, progress_pct: 0 },
      { id: 'item-1', parent_id: 'cat-1', level: 'item', weight_pct: 80, progress_pct: 100 },
      { id: 'item-2', parent_id: 'cat-1', level: 'item', weight_pct: 20, progress_pct: 0 },
    ]
    const result = bubbleUpProgress(items)
    // weighted: (80*100 + 20*0) / 100 = 80, BUKAN (100+0)/2 = 50
    expect(result.categoryProgress.get('cat-1')).toBe(80)
  })

  it('weight item di luar rentang 99.9-100.1% (constraint migration 052) tetap dihitung apa adanya — bukan tanggung jawab pure function untuk menolak', () => {
    const items: RabItemNode[] = [
      { id: 'cat-1', parent_id: null, level: 'category', weight_pct: 100, progress_pct: 0 },
      { id: 'item-1', parent_id: 'cat-1', level: 'item', weight_pct: 60, progress_pct: 50 }, // total 60%, bukan 100%
    ]
    const result = bubbleUpProgress(items)
    // totalWeight item = 60 (bukan 100) — formula tetap jalan pakai totalWeight aktual
    // weighted: (60*50)/60 = 50 (proporsional terhadap total weight ITEM, bukan grand total kategori)
    expect(result.categoryProgress.get('cat-1')).toBe(50)
  })

  it('kategori tanpa item level="item" di bawahnya (totalWeight<=0) — DILEWATI lapis 1, progress_pct tidak diubah', () => {
    const items: RabItemNode[] = [
      { id: 'cat-1', parent_id: null, level: 'category', weight_pct: 100, progress_pct: 42 },
      // nol item level='item' dengan parent_id='cat-1'
    ]
    const result = bubbleUpProgress(items)
    expect(result.categoryProgress.has('cat-1')).toBe(false)
    // Lapis 2 fallback ke progress_pct existing kategori (42) karena categoryProgress kosong untuk cat-1
    expect(result.overallProgress).toBe(42)
  })

  it('dua kategori, salah satu totalWeight=0 di item-nya — kategori itu di-skip lapis 1, tapi TETAP masuk lapis 2 pakai nilai existing (identik kode asal, tanpa guard)', () => {
    const items: RabItemNode[] = [
      { id: 'cat-1', parent_id: null, level: 'category', weight_pct: 50, progress_pct: 10 },
      { id: 'item-1', parent_id: 'cat-1', level: 'item', weight_pct: 0, progress_pct: 90 }, // weight 0 → totalWeight cat-1 = 0
      { id: 'cat-2', parent_id: null, level: 'category', weight_pct: 50, progress_pct: 0 },
      { id: 'item-2', parent_id: 'cat-2', level: 'item', weight_pct: 100, progress_pct: 60 },
    ]
    const result = bubbleUpProgress(items)
    expect(result.categoryProgress.has('cat-1')).toBe(false) // di-skip, totalWeight=0
    expect(result.categoryProgress.get('cat-2')).toBe(60)
    // overall: cat-1 pakai progress_pct existing (10), cat-2 pakai hasil baru (60)
    // (50*10 + 50*60) / 100 = 35
    expect(result.overallProgress).toBe(35)
  })

  it('nol kategori sama sekali — overallProgress null (proyek belum ada RAB kategori)', () => {
    const items: RabItemNode[] = []
    const result = bubbleUpProgress(items)
    expect(result.overallProgress).toBeNull()
  })

  it('overall di-clamp ke 100 meski hasil kalkulasi melebihi (floating point safety)', () => {
    const items: RabItemNode[] = [
      { id: 'cat-1', parent_id: null, level: 'category', weight_pct: 100, progress_pct: 0 },
      { id: 'item-1', parent_id: 'cat-1', level: 'item', weight_pct: 100, progress_pct: 100 },
    ]
    const result = bubbleUpProgress(items)
    expect(result.overallProgress).toBeLessThanOrEqual(100)
  })

  it('weight_pct null di level item diperlakukan sebagai 0, bukan error', () => {
    const items: RabItemNode[] = [
      { id: 'cat-1', parent_id: null, level: 'category', weight_pct: 100, progress_pct: 0 },
      { id: 'item-1', parent_id: 'cat-1', level: 'item', weight_pct: 100, progress_pct: 50 },
      { id: 'item-2', parent_id: 'cat-1', level: 'item', weight_pct: null, progress_pct: 100 }, // weight null → kontribusi 0
    ]
    const result = bubbleUpProgress(items)
    // totalWeight = 100+0 = 100; weighted = (100*50 + 0*100)/100 = 50
    expect(result.categoryProgress.get('cat-1')).toBe(50)
  })

  it('progress_pct null di level item diperlakukan sebagai 0, bukan error', () => {
    const items: RabItemNode[] = [
      { id: 'cat-1', parent_id: null, level: 'category', weight_pct: 100, progress_pct: 0 },
      { id: 'item-1', parent_id: 'cat-1', level: 'item', weight_pct: 100, progress_pct: null },
    ]
    const result = bubbleUpProgress(items)
    expect(result.categoryProgress.get('cat-1')).toBe(0)
  })

  it('weight_pct null di level kategori diperlakukan sebagai 0 saat kontribusi ke overall', () => {
    const items: RabItemNode[] = [
      { id: 'cat-1', parent_id: null, level: 'category', weight_pct: null, progress_pct: 80 },
      { id: 'item-1', parent_id: 'cat-1', level: 'item', weight_pct: 100, progress_pct: 80 },
    ]
    const result = bubbleUpProgress(items)
    // cat-1 weight null → kontribusi ke overall = 0 * 80/100 = 0, walau progress kategorinya sendiri 80
    expect(result.overallProgress).toBe(0)
  })
})
