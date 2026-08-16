/**
 * TUKANG MENURUT KEAHLIAN (6.5).
 *
 * ══════════════════════════════════════════════════════════════════════════
 * SEPERTIGA TUKANG BELUM PUNYA KEAHLIAN TERCATAT
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Diukur 2026-08-16: 60 tukang, 41 punya `skills`, **19 tidak**.
 *
 * Daftar yang diam-diam mengabaikan 19 itu membuat pembacanya menyimpulkan
 * "cuma segini yang bisa" — padahal yang benar "cuma segini yang TERCATAT
 * bisa". Yang pertama menutup pilihan; yang kedua mengundang melengkapi data.
 *
 * ── Yang dibuktikan
 *
 *   1. jumlah yang tanpa skill DISEBUT, bukan dihilangkan
 *   2. hanya tukang AKTIF (yang berhenti masih punya baris & skill)
 *   3. pencocokan SEBAGIAN bekerja ("plester" cocok "plesteran")
 *   4. keahlian tak dikenal ditolak sambil menyebut yang ada
 *   5. jumlah cocok sama dengan hitungan SQL terpisah
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import type { Client } from 'pg'
import { createRlsClient } from '../../test-utils/rls-harness.js'
import { createTenantDb } from '../../utils/tenant-db.js'
import { toolTukangCocok } from '../ai-tool-tukang-cocok.js'
import { KATALOG_TOOL } from '../ai-tool.js'

let db: Client
let companyId: string
let skillTerbanyak: string | null = null

const ctx = () =>
  ({
    db: createTenantDb(companyId),
    companyId,
    userId: 'uji',
    izin: new Set(['mandor:view']),
  }) as never

beforeAll(async () => {
  db = await createRlsClient()
  const { rows } = await db.query(`
    SELECT company_id FROM workers GROUP BY company_id ORDER BY count(*) DESC LIMIT 1`)
  if (rows.length === 0) throw new Error('Butuh satu tenant bertukang')
  companyId = rows[0].company_id

  const { rows: s } = await db.query(
    `SELECT lower(unnest(skills)) AS k, count(*)::int n FROM workers
      WHERE company_id = $1 AND is_active IS DISTINCT FROM false AND skills IS NOT NULL
      GROUP BY 1 ORDER BY n DESC LIMIT 1`, [companyId])
  skillTerbanyak = s[0]?.k ?? null
})

afterAll(async () => {
  await db.end()
})

describe('tool tukang cocok', () => {
  it('terdaftar dengan izin mandor:view', () => {
    const t = KATALOG_TOOL.find((x) => x.nama === 'tukang_cocok')
    expect(t, 'tool `tukang_cocok` tak terdaftar').toBeTruthy()
    expect(t!.izin).toBe('mandor:view')
  })

  it('yang TANPA skill disebut jumlahnya, bukan dihilangkan', async () => {
    /*
      Inti berkas ini. "Cuma segini yang bisa" dan "cuma segini yang tercatat
      bisa" adalah dua kesimpulan berbeda, dan yang pertama menutup pilihan.
    */
    const { rows } = await db.query(
      `SELECT count(*) FILTER (WHERE skills IS NULL OR array_length(skills,1) IS NULL)::int AS tanpa
         FROM workers WHERE company_id = $1 AND is_active IS DISTINCT FROM false`, [companyId])
    if (rows[0].tanpa === 0) return

    const h = await toolTukangCocok.jalan(ctx(), {})
    expect(h.isError).toBe(false)
    expect(h.isi).toMatch(new RegExp(`${rows[0].tanpa} tukang aktif BELUM punya keahlian`))
  })

  it('hanya tukang AKTIF', async () => {
    /*
      Tukang yang sudah berhenti tetap punya baris dan skill-nya masih
      tercatat — menyebutnya membuat mandor menelepon orang yang sudah lama
      tak bekerja di sini.
    */
    const { rows } = await db.query(
      `SELECT name FROM workers
        WHERE company_id=$1 AND is_active = false AND skills IS NOT NULL
          AND array_length(skills,1) > 0 LIMIT 3`, [companyId])
    /*
      ── Kalau semua tukang aktif, yang diuji SUMBERNYA ──────────────────────

      Diukur 2026-08-16: 60 tukang, NOL nonaktif. Mutasi sengaja (saringan
      `is_active` dicabut) karena itu tetap HIJAU — datanya tak bisa
      membedakan.

      Membiarkan test yang lolos karena kebetulan tak ada bahannya lebih buruk
      daripada tak punya test: ia memberi rasa aman yang tak berdasar.
      Keempat kalinya pola ini muncul di sesi ASISTEN, dan tiap kali ditulis
      apa adanya.
    */
    if (rows.length === 0) {
      const src = await (await import('node:fs/promises')).readFile(
        new URL('../ai-tool-tukang-cocok.ts', import.meta.url), 'utf8')
      expect(
        src,
        'saringan is_active hilang — tukang yang sudah berhenti ikut jadi kandidat',
      ).toMatch(/w\.is_active !== false/)
      return
    }

    const h = await toolTukangCocok.jalan(ctx(), { keahlian: skillTerbanyak ?? 'kayu' })
    for (const w of rows as Array<{ name: string }>) {
      expect(h.isi, `tukang nonaktif '${w.name}' ikut disebut`).not.toContain(w.name)
    }
  })

  it('jumlah cocok SAMA dengan hitungan SQL terpisah', async () => {
    if (!skillTerbanyak) return

    const { rows } = await db.query(
      `SELECT count(*)::int n FROM workers
        WHERE company_id = $1 AND is_active IS DISTINCT FROM false
          AND EXISTS (SELECT 1 FROM unnest(skills) s WHERE lower(s) LIKE '%' || $2 || '%')`,
      [companyId, skillTerbanyak])

    const h = await toolTukangCocok.jalan(ctx(), { keahlian: skillTerbanyak })
    const ditulis = Number(/^(\d+) tukang aktif berkeahlian/m.exec(h.isi)?.[1] ?? NaN)
    expect(ditulis).toBe(rows[0].n)
  })

  it('tanpa kata kunci → daftar keahlian, bukan daftar seluruh tukang', async () => {
    // 60 nama tak bisa dibaca; 8 keahlian bisa. Yang berguna ringkasannya.
    const h = await toolTukangCocok.jalan(ctx(), {})
    expect(h.isi).toMatch(/Keahlian yang tercatat/i)
    expect(h.isi).toMatch(/\d+ orang/)
  })

  it('keahlian TAK DIKENAL ditolak sambil menyebut yang ada', async () => {
    // Penolakan tanpa arah memaksa penanya menebak kata yang diterima.
    const h = await toolTukangCocok.jalan(ctx(), { keahlian: 'zzxqv-tak-ada' })
    expect(h.isError).toBe(false)
    expect(h.isi).toMatch(/tak ada tukang aktif berkeahlian/i)
    expect(h.isi).toMatch(/yang tercatat:/i)
  })

  it('pencocokan SEBAGIAN bekerja', async () => {
    if (!skillTerbanyak || skillTerbanyak.length < 4) return
    // "pleste" harus tetap menemukan "plester" — orang mengetik sebagian.
    const separuh = skillTerbanyak.slice(0, skillTerbanyak.length - 1)
    const h = await toolTukangCocok.jalan(ctx(), { keahlian: separuh })
    expect(h.isi).toMatch(/tukang aktif berkeahlian/i)
  })
})
