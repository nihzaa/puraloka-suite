export interface RabItemNode {
  id: string
  parent_id: string | null
  level: 'category' | 'item' | string
  weight_pct: number | null
  progress_pct: number | null
}

export interface BubbleUpResult {
  /** progress_pct baru per kategori/sub-kategori (key: rab_items.id) */
  categoryProgress: Map<string, number>
  /**
   * progress_pct baru untuk projects.progress_pct — null HANYA jika nol
   * kategori sama sekali (identik kode asal: proyek tanpa RAB kategori
   * tidak pernah update projects.progress_pct). Jika kategori ada tapi
   * totalWeight=0, nilainya 0 (bukan null) — identik kode asal, yang
   * TIDAK punya guard totalWeight>0 di lapis 2.
   */
  overallProgress: number | null
}

/**
 * Bubble-up progress 2 lapis — diekstrak dari duplikasi identik di
 * rab.ts:777-829 dan progress.ts:121-179 (dikonfirmasi sama persis saat
 * audit Task 1.2.3, konsisten dengan keputusan desain
 * Phase1/02-target-architecture.md: "projects.progress_pct = SUM(item.weight_pct
 * × item.progress_pct / 100)").
 *
 * Lapis 1: setiap category/sub-category = rata-rata tertimbang item level='item'
 *          di bawahnya (bobot per-item, bukan rata-rata polos).
 * Lapis 2: projects.progress_pct = SUM(category.weight_pct × category.progress_pct / 100)
 *          dari SELURUH category (bukan hanya yang baru diupdate di lapis 1).
 *
 * Kategori dengan totalWeight<=0 (nol item level='item' berbobot di bawahnya,
 * atau seluruh weight_pct null/0) DILEWATI di lapis 1 — progress_pct-nya tidak
 * diubah, identik perilaku kode asal (`if (totalW <= 0) continue`).
 */
export function bubbleUpProgress(items: RabItemNode[]): BubbleUpResult {
  const itemsByParent = new Map<string, RabItemNode[]>()
  for (const it of items) {
    if (it.level === 'item' && it.parent_id) {
      const list = itemsByParent.get(it.parent_id) ?? []
      list.push(it)
      itemsByParent.set(it.parent_id, list)
    }
  }

  const categoryProgress = new Map<string, number>()
  for (const [parentId, children] of itemsByParent.entries()) {
    const totalWeight = children.reduce((s, c) => s + (c.weight_pct ?? 0), 0)
    if (totalWeight <= 0) continue
    const weightedProgress = children.reduce(
      (s, c) => s + (c.weight_pct ?? 0) * (c.progress_pct ?? 0) / 100,
      0
    )
    categoryProgress.set(parentId, parseFloat(((weightedProgress / totalWeight) * 100).toFixed(2)))
  }

  // Lapis 2 memakai progress_pct kategori TERBARU (hasil lapis 1 jika diupdate,
  // fallback ke nilai existing di `items` jika kategori itu tidak punya item
  // level='item' langsung di bawahnya — identik perilaku kode asal yang re-fetch
  // dari DB setelah update, di sini disimulasikan via override map).
  const categories = items.filter((it) => it.level === 'category')
  if (categories.length === 0) {
    return { categoryProgress, overallProgress: null }
  }

  const weightedOverall = categories.reduce((sum, cat) => {
    const progress = categoryProgress.get(cat.id) ?? cat.progress_pct ?? 0
    return sum + (cat.weight_pct ?? 0) * progress / 100
  }, 0)

  // Identik kode asal: nol guard totalWeight>0 di lapis 2 — selama ada
  // >=1 kategori, overall dihitung dan di-clamp 0-100 (weight 0 → overall 0).
  const overallProgress = Math.min(100, Math.max(0, parseFloat(weightedOverall.toFixed(2))))

  return { categoryProgress, overallProgress }
}
