import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { execFileSync } from 'node:child_process'

// ============================================================
// T4f — PENEGAK (ratchet + P3). Tanpa ini, T4 membusuk pelan-pelan.
//
// Dua hal yang dijaga, keduanya BERARAH SATU (ratchet — boleh turun, tak boleh
// naik). Alasannya: migrasi 240 call-site tak selesai dalam satu PR, jadi yang
// bisa ditegakkan hari ini bukan "nol pelanggaran" melainkan "tidak bertambah".
// Ambang diturunkan setiap gelombang selesai; ia tak pernah dinaikkan.
//
//   1. Jumlah akses `supabase` mentah di routes/ TIDAK BOLEH NAIK.
//      Route baru yang menulis `supabase.from(...)` alih-alih `request.db`
//      membuat build MERAH — ketahuan di PR, bukan enam bulan kemudian saat
//      ada tenant kedua.
//
//   2. Peta tenancy SINKRON dengan skema (P3, ADR-011 §9.5).
//      Tabel ke-98 yang lahir tanpa kategori = build merah.
//
// Kenapa test, bukan lint rule: `no-restricted-imports` hanya bisa bilang
// "boleh/tidak boleh" per-file — ia tak bisa menyatakan "boleh, tapi jumlahnya
// harus menyusut". Allowlist per-file yang menyusut juga bekerja, tapi ia
// berisik di diff (36 file) dan mudah di-`// eslint-disable`.
// ============================================================

const DIR_ROUTES = join(import.meta.dirname, '..', '..')

/**
 * AMBANG — jumlah baris ber-`supabase` mentah di `src/routes/`.
 *
 * ⚠️ ANGKA INI HANYA BOLEH TURUN. Kalau test ini gagal karena angkanya NAIK,
 * jangan menaikkan ambangnya — pakai `request.db` di kode baru Anda. Wrapper
 * menyediakan `.from()` (scope otomatis), `.viaProject()` (kategori C),
 * `.shared()` (katalog bersama), dan `.unsafe(tabel, alasan)` untuk kasus yang
 * benar-benar tak tercakup.
 *
 * Kalau gagal karena angkanya TURUN: bagus — turunkan ambangnya ke angka baru.
 */
const AMBANG_SUPABASE_MENTAH = 584

function hitungSupabaseMentah(): { total: number; perFile: Record<string, number> } {
  const perFile: Record<string, number> = {}
  let total = 0
  const telusuri = (dir: string) => {
    for (const entri of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entri.name)
      if (entri.isDirectory()) {
        if (entri.name === '__tests__') continue // test boleh akses langsung
        telusuri(path)
        continue
      }
      if (!entri.name.endsWith('.ts')) continue
      const isi = readFileSync(path, 'utf8')
      // Hitung BARIS, bukan kemunculan: pola multi-baris `supabase\n  .from(`
      // adalah satu akses, bukan dua.
      const n = isi.split('\n').filter((baris) => {
        const t = baris.trim()
        if (t.startsWith('//') || t.startsWith('*')) return false // komentar tak dihitung
        return /\bsupabase\s*$/.test(t) || /\bsupabase\.from\(/.test(t)
      }).length
      if (n > 0) {
        perFile[entri.name] = n
        total += n
      }
    }
  }
  telusuri(DIR_ROUTES)
  return { total, perFile }
}

describe('T4f — ratchet: akses supabase mentah di routes tidak boleh naik', () => {
  it(`jumlah akses supabase mentah <= ${AMBANG_SUPABASE_MENTAH}`, () => {
    const { total, perFile } = hitungSupabaseMentah()

    if (total > AMBANG_SUPABASE_MENTAH) {
      const terbesar = Object.entries(perFile)
        .sort(([, a], [, b]) => b - a)
        .slice(0, 5)
        .map(([f, n]) => `${f}=${n}`)
        .join(', ')
      throw new Error(
        `Akses supabase mentah NAIK: ${total} (ambang ${AMBANG_SUPABASE_MENTAH}).\n` +
          `Kode baru harus memakai request.db, bukan supabase langsung — kalau tidak, ` +
          `query-nya berjalan tanpa saringan tenant dan membaca data perusahaan lain.\n` +
          `Wrapper: .from() otomatis · .viaProject(t, id) kategori C · .shared() katalog ` +
          `bersama · .unsafe(t, alasan) untuk kasus tak tercakup.\n` +
          `File terbesar: ${terbesar}`
      )
    }
    expect(total).toBeLessThanOrEqual(AMBANG_SUPABASE_MENTAH)
  })

  it('ambang tidak jauh tertinggal dari kenyataan (agar ratchet tetap ketat)', () => {
    // Kalau migrasi maju banyak tapi ambang tak diturunkan, ratchet berhenti
    // menggigit: 100 pelanggaran baru bisa masuk diam-diam di bawah ambang lama.
    const { total } = hitungSupabaseMentah()
    const kelonggaran = AMBANG_SUPABASE_MENTAH - total
    expect(
      kelonggaran,
      `Ambang ${AMBANG_SUPABASE_MENTAH} tertinggal ${kelonggaran} dari kenyataan ${total}. ` +
        'Turunkan AMBANG_SUPABASE_MENTAH ke angka sekarang supaya ratchet tetap ketat.'
    ).toBeLessThanOrEqual(25)
  })
})

describe('T4f — P3: peta tenancy sinkron dengan skema (ADR-011 §9.5)', () => {
  it('setiap tabel di peta punya kategori yang sah', () => {
    const isi = readFileSync(
      join(import.meta.dirname, '..', '..', '..', 'utils', 'tenant-map.generated.ts'),
      'utf8'
    )
    const kategori = [...isi.matchAll(/kategori: '([A-Z]+)'/g)].map((m) => m[1])
    expect(kategori.length).toBeGreaterThan(90)
    const sah = new Set(['ANCHOR', 'A', 'AB', 'B', 'C', 'D'])
    const asing = [...new Set(kategori)].filter((k) => !sah.has(k))
    expect(asing).toEqual([])
  })

  it('peta SINKRON dengan skema DB — tabel baru wajib terklasifikasi', () => {
    // Inti P3: tabel ke-98 yang lahir tanpa kategori bikin build MERAH, bukan
    // diam-diam jadi lubang tenancy. Generator `check` membandingkan file di
    // repo vs hasil generate dari skema hidup; exit != 0 kalau beda.
    //
    // Dilewati kalau DIRECT_URL tak ada (mis. kontributor tanpa akses DB) —
    // tapi TIDAK dilewati di CI, karena di sanalah gerbangnya harus menggigit.
    if (!process.env.DIRECT_URL) {
      console.warn('[P3] DIRECT_URL kosong — cek sinkronisasi peta dilewati.')
      return
    }
    const skrip = join(import.meta.dirname, '..', '..', '..', '..', 'scripts', 'gen-tenant-map.mjs')
    try {
      execFileSync(process.execPath, [skrip, 'check'], { stdio: 'pipe', encoding: 'utf8' })
    } catch (e) {
      const err = e as { stderr?: string; stdout?: string }
      throw new Error(
        `Peta tenancy TIDAK sinkron dengan skema.\n${err.stderr ?? err.stdout ?? String(e)}`
      )
    }
  }, 60_000)
})
