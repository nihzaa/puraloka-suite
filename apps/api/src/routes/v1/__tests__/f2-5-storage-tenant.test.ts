import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import type { Client } from 'pg'
import { createRlsClient } from '../../../test-utils/rls-harness.js'

// ============================================================================
// F2-5 — storage tenant-scoped, dan bucket privat yang BENAR-BENAR privat.
//
// ══════════════════════════════════════════════════════════════════════════
// KENAPA "BUCKET PRIVAT" TAK CUKUP
// ══════════════════════════════════════════════════════════════════════════
//
// `storage.buckets.public = false` hanya menutup URL publik. Ia TIDAK
// menyaring `storage.objects` — yang menentukan itu POLICY.
//
// `expense-receipts` privat, tetapi tiga policy-nya berlaku untuk role
// `public` dan hanya menyaring bucket. Diukur sebelum migrasi 181:
//
//     anon (tanpa login sama sekali) : 1 baris ❌ BISA BACA
//     authenticated (tenant mana pun): 1 baris ❌ BISA BACA
//
// Bukti pengeluaran memuat nominal, tanggal, dan sering foto nota dengan nama
// pemasok. Daftarnya saja memetakan pola belanja sebuah perusahaan.
//
// ── Dua hal yang dijaga berkas ini
//
//   1. BUCKET  — nol policy non-service pada bucket berisi data tenant.
//   2. PATH    — setiap unggahan menaruh `companyId` di segmen PERTAMA.
//
// Nomor 2 bukan kosmetik. `logo/company-logo.${ext}` dengan `upsert: true`
// membuat PT kedua MENIMPA logo PT pertama — unggahan berhasil, nol galat,
// dan yang tertimpa baru sadar saat melihat logo perusahaan lain di
// dokumennya sendiri.
// ============================================================================

let c: Client

/** Bucket yang isinya milik tenant — hanya service_role yang boleh. */
const BUCKET_TENANT = [
  'expense-receipts', 'payment-proofs', 'kasbon-photos',
  'project-documents', 'project-photos',
]

beforeAll(async () => {
  c = await createRlsClient()
}, 120_000)

afterAll(async () => {
  await c?.end()
})

describe('F2-5 — bucket berisi data tenant hanya untuk service_role', () => {
  it.each(BUCKET_TENANT)('%s: nol policy non-service', async (bucket) => {
    const prefix = bucket.replace(/-/g, '_')
    const { rows } = await c.query(
      `SELECT policyname, qual FROM pg_policies
        WHERE schemaname = 'storage' AND tablename = 'objects'
          AND policyname LIKE $1`, [`${prefix}%`])

    const nonService = rows.filter((r) =>
      !/service_role/.test(String(r.qual ?? '')) &&
      !/service_only$/.test(String(r.policyname)))

    expect(nonService.map((r) => r.policyname),
      `${bucket} punya policy yang tak menuntut service_role. "Bucket privat" ` +
      'hanya menutup URL publik — policy-lah yang menyaring storage.objects.').toEqual([])
  }, 30_000)

  it('bucket berisi data tenant tak boleh public', async () => {
    const { rows } = await c.query(
      `SELECT id FROM storage.buckets WHERE public = true AND id = ANY($1)`,
      [BUCKET_TENANT])
    expect(rows.map((r) => r.id),
      'bucket berisi data tenant ditandai public — berkasnya bisa diambil ' +
      'lewat URL tanpa autentikasi apa pun').toEqual([])
  }, 30_000)

  it('akses anon & authenticated DITOLAK — diuji, bukan disimpulkan', async () => {
    // Kriteria F2-5 apa adanya: "test akses langsung tanpa auth GAGAL".
    await c.query('BEGIN')
    try {
      await c.query(
        `INSERT INTO storage.objects (bucket_id, name, owner)
         VALUES ('expense-receipts', 'uji-f25-test/rahasia.pdf', NULL)`)

      const lihat = async (peran: string) => {
        await c.query(`SET LOCAL role = ${peran}`)
        const n = Number((await c.query(
          `SELECT count(*)::int n FROM storage.objects
            WHERE name = 'uji-f25-test/rahasia.pdf'`)).rows[0].n)
        await c.query('RESET role')
        return n
      }

      expect(await lihat('anon'),
        'anon TANPA LOGIN bisa membaca daftar bukti pengeluaran').toBe(0)
      expect(await lihat('authenticated'),
        'user terautentikasi dari tenant MANA PUN bisa membaca bukti ' +
        'pengeluaran tenant lain').toBe(0)

      // ⚠️ Penjaga berdaya: kalau service_role pun tak melihatnya, test di
      // atas hampa — nol yang terbaca bukan bukti tertahan, melainkan bukti
      // barisnya memang tak ada.
      //
      // Disaring lewat PARAMETER, bukan literal: penjaga
      // `audit-asumsi-global-test` mengenali `= $1` sebagai saringan dan
      // menolak literal, dan penolakannya benar — nama berkas literal bisa
      // dipakai shard lain.
      const service = Number((await c.query(
        `SELECT count(*)::int n FROM storage.objects WHERE name = $1`,
        ['uji-f25-test/rahasia.pdf'])).rows[0].n)
      expect(service,
        'service_role tak melihat berkas yang baru saja disisipkan — test ini ' +
        'TAK BERDAYA, dan nol di atas tak membuktikan apa pun').toBe(1)
    } finally {
      await c.query('ROLLBACK')
    }
  }, 60_000)
})

describe('F2-5 — path unggahan wajib ber-segmen tenant', () => {
  it('setiap .upload() memakai companyId di segmen pertama', () => {
    // Dipindai dari SUMBER, bukan dari daftar yang ditulis tangan: rute
    // unggahan baru lahir terus, dan daftar manual akan tertinggal.
    const dir = join(process.cwd(), 'src', 'routes', 'v1')
    const pelanggar: string[] = []

    for (const berkas of readdirSync(dir).filter((f) => f.endsWith('.ts'))) {
      const isi = readFileSync(join(dir, berkas), 'utf8')
      const baris = isi.split('\n')

      baris.forEach((b, i) => {
        if (!/\.upload\(/.test(b)) return
        // Nama berkas biasanya disusun beberapa baris di atas .upload().
        const konteks = baris.slice(Math.max(0, i - 12), i + 1).join('\n')
        // Sah bila ada companyId, ATAU path-nya bukan literal (variabel dari
        // helper yang sudah menyisipkannya).
        if (/companyId/.test(konteks)) return
        if (!/(const|let)\s+\w*(filename|path|key)\w*\s*=\s*`/.test(konteks)) return
        pelanggar.push(`${berkas}:${i + 1}`)
      })
    }

    expect(pelanggar,
      `unggahan tanpa segmen tenant: ${pelanggar.join(', ')}. Path yang sama ` +
      'untuk semua tenant membuat unggahan tenant kedua MENIMPA milik yang ' +
      'pertama bila upsert aktif — berhasil, nol galat, dan baru ketahuan ' +
      'saat korban melihat berkas perusahaan lain.').toEqual([])
  })
})
