/**
 * DEPENDENCY GANTT — deteksi pelanggaran ambang.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * KENAPA INI PINDAH KE `lib/`, BUKAN DITULIS ULANG DI RUTE
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Aturannya sudah ada dan sudah terpakai berbulan-bulan — di FRONTEND
 * (`apps/web/components/gantt-section.tsx`, `detectWarnings`). Automation
 * 3.10 butuh aturan yang sama di server supaya bisa dijalankan penjadwal.
 *
 * Menyalinnya ke rute berarti dua salinan aturan bisnis di dua bahasa yang
 * sama. Salinan yang tak diuji akan menyimpang, dan yang menyimpang diam-diam
 * adalah yang lebih jarang dibaca — dalam hal ini yang di server, karena ia
 * berjalan tanpa ada mata yang melihat.
 *
 * Jadi aturannya diangkat ke fungsi murni di sini: bisa diuji tanpa basis
 * data, tanpa HTTP, dan bisa dipakai kedua sisi.
 *
 * ⚠ Frontend BELUM memanggil fungsi ini — ia masih punya salinannya sendiri.
 * Menyatukannya menuntut `packages/shared` yang hari ini KOSONG (CLAUDE.md §4),
 * jadi itu pekerjaan tersendiri. Yang dijamin sekarang: satu sumber di sisi
 * server, dan test yang mengunci perilakunya supaya penyimpangan terlihat.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * DUA JENIS ATURAN, DAN KENAPA KEDUANYA BUKAN PENGHALANG KERAS
 * ══════════════════════════════════════════════════════════════════════════
 *
 *   threshold_pct = 80    pendahulu harus ≥80% sebelum penerus mulai
 *   threshold_pct = null  advisory: penerus jangan mulai sebelum
 *                         `planned_end` pendahulu
 *
 * Keduanya PERINGATAN, bukan larangan — dan itu disengaja (migrasi 054).
 * Di lapangan, pekerjaan yang tumpang tindih sering justru keputusan yang
 * benar; sistem yang MELARANGnya akan dilawan dengan mematikan dependency
 * sama sekali, dan saat itu terjadi tak ada lagi yang memperingatkan apa pun.
 */

/** Satu baris pekerjaan yang ikut dinilai. */
export interface TugasGantt {
  id: string
  uraian: string
  planned_start: string | null
  planned_end: string | null
  /** Progres rencana. Dipakai kalau `actual_pct` tak ada. */
  progress_pct: number | null
  /** Progres nyata dari progress log — lebih dipercaya bila ada. */
  actual_pct?: number | null
  dep_rules: AturanDependency[]
}

export interface AturanDependency {
  item_id: string
  /** null = advisory berbasis tanggal, bukan ambang persen. */
  threshold_pct: number | null
  label?: string | null
}

export interface PeringatanDependency {
  fromId: string
  toId: string
  fromName: string
  toName: string
  severity: 'warning' | 'danger'
  message: string
}

const HARI_MS = 86_400_000

const selisihHari = (a: string, b: string) =>
  Math.round((new Date(b).getTime() - new Date(a).getTime()) / HARI_MS)

const tanggalId = (d: string) =>
  new Date(d).toLocaleDateString('id-ID', { day: 'numeric', month: 'short' })

/**
 * Cari seluruh pelanggaran dependency.
 *
 * Dipertahankan SAMA PERSIS dengan `detectWarnings` di frontend, termasuk
 * ambang `danger`-nya:
 *
 *   ambang persen   danger bila progres < setengah ambang
 *   advisory        danger bila tumpang tindih > 14 hari
 *
 * Angka-angka itu tidak dikarang di sini — ia sudah dipakai dan sudah
 * dibiasakan pengguna. Mengubahnya diam-diam saat memindahkan kode adalah
 * cara termudah membuat peringatan yang selama ini bermakna jadi kebisingan.
 */
export function cariPelanggaranDependency(tugas: TugasGantt[]): PeringatanDependency[] {
  const peta = new Map(tugas.map(t => [t.id, t]))
  const hasil: PeringatanDependency[] = []

  for (const t of tugas) {
    if (!t.planned_start || t.dep_rules.length === 0) continue

    for (const aturan of t.dep_rules) {
      const dep = peta.get(aturan.item_id)
      // Pendahulu yang tak ada di daftar (terhapus, atau di luar proyek)
      // dilewati, bukan dianggap 0% — menganggapnya nol akan memunculkan
      // peringatan untuk sesuatu yang tak bisa ditindaklanjuti siapa pun.
      if (!dep) continue

      if (aturan.threshold_pct != null) {
        const pct = dep.actual_pct ?? dep.progress_pct ?? 0
        if (pct < aturan.threshold_pct) {
          const label = aturan.label ? ` (${aturan.label})` : ''
          hasil.push({
            fromId: aturan.item_id,
            toId: t.id,
            fromName: dep.uraian,
            toName: t.uraian,
            severity: pct < aturan.threshold_pct * 0.5 ? 'danger' : 'warning',
            message: `"${t.uraian}" butuh "${dep.uraian}" ≥${aturan.threshold_pct}%${label}, saat ini baru ${pct.toFixed(0)}%`,
          })
        }
      } else {
        if (!dep.planned_end) continue
        const selisih = selisihHari(dep.planned_end, t.planned_start)
        if (selisih < 0) {
          const tumpang = Math.abs(selisih)
          hasil.push({
            fromId: aturan.item_id,
            toId: t.id,
            fromName: dep.uraian,
            toName: t.uraian,
            severity: tumpang > 14 ? 'danger' : 'warning',
            message: `"${t.uraian}" dimulai ${tumpang} hari sebelum "${dep.uraian}" selesai (${tanggalId(dep.planned_end)})`,
          })
        }
      }
    }
  }

  return hasil
}

/**
 * Bentuk `gantt_dep_rules` dari basis menjadi tipe yang aman dipakai.
 *
 * Kolomnya JSONB tanpa CHECK, jadi isinya BISA apa saja — termasuk bentuk
 * lama, hasil impor, atau baris yang ditulis tangan lewat SQL. Membacanya
 * dengan `as AturanDependency[]` membuat `undefined.item_id` meledak di
 * tengah putaran penjadwal, dan penjadwal yang meledak berhenti diam-diam.
 */
export function bacaAturanDependency(mentah: unknown): AturanDependency[] {
  if (!Array.isArray(mentah)) return []

  const hasil: AturanDependency[] = []
  for (const b of mentah) {
    if (!b || typeof b !== 'object') continue
    const o = b as Record<string, unknown>
    if (typeof o.item_id !== 'string' || o.item_id === '') continue

    // `threshold_pct` boleh null (advisory). Angka di luar 0..100 dibuang:
    // ambang 500% tak pernah bisa terpenuhi dan akan memperingatkan selamanya.
    let ambang: number | null = null
    if (o.threshold_pct != null) {
      const n = Number(o.threshold_pct)
      if (!Number.isFinite(n) || n < 0 || n > 100) continue
      ambang = n
    }

    hasil.push({
      item_id: o.item_id,
      threshold_pct: ambang,
      label: typeof o.label === 'string' ? o.label : null,
    })
  }
  return hasil
}
