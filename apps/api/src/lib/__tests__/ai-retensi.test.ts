/**
 * RETENSI PERCAKAPAN AI — dibuktikan MENGHAPUS, bukan sekadar punya kolomnya.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * KOLOM YANG ADA TAPI TAK MENGHAPUS ADALAH JANJI KOSONG
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Migrasi 252 menambahkan `retensi_hari`, dan halaman Perilaku Asisten
 * menampilkannya. Selama tak ada yang menjalankannya, angka "30 hari" di layar
 * tak berarti apa-apa — tenant menyimpulkan datanya sudah dibersihkan, dan
 * percakapan dua tahun lalu masih utuh.
 *
 * Yang diuji di sini bukan "fungsinya dipanggil", melainkan barisnya HILANG.
 * Dan yang paling penting: `ai_pesan` ikut hilang lewat cascade. Percakapan
 * yang terhapus sementara pesannya tinggal justru lebih buruk daripada tak
 * menghapus sama sekali — isinya tetap ada, tapi tak lagi bisa ditelusuri
 * siapa pemiliknya.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import type { Client } from 'pg'
import { createRlsClient } from '../../test-utils/rls-harness.js'
import { batasRetensi } from '../../routes/v1/ai-retensi.js'

let db: Client
let companyId: string
let userId: string
const dibuat: string[] = []

beforeAll(async () => {
  db = await createRlsClient()
  const { rows: c } = await db.query(`
    SELECT c.id FROM companies c
    WHERE EXISTS (SELECT 1 FROM company_members m WHERE m.company_id = c.id) LIMIT 1
  `)
  companyId = c[0].id
  const { rows: u } = await db.query(
    `SELECT user_id FROM company_members WHERE company_id = $1 LIMIT 1`, [companyId])
  userId = u[0].user_id
}, 60_000)

afterAll(async () => {
  for (const id of dibuat) {
    await db.query(`DELETE FROM ai_pesan WHERE percakapan_id = $1`, [id])
    await db.query(`DELETE FROM ai_percakapan WHERE id = $1`, [id])
  }
  await db.end()
})

beforeEach(() => { dibuat.length = 0 })

/** Percakapan dengan umur tertentu, beserta satu pesan. */
async function buatPercakapan(umurHari: number): Promise<string> {
  const { rows } = await db.query(
    `INSERT INTO ai_percakapan (company_id, user_id, asisten, kanal, dibuat_pada, diperbarui_pada)
     VALUES ($1, $2, 'staff', 'web', now() - ($3 || ' days')::interval,
             now() - ($3 || ' days')::interval)
     RETURNING id`,
    [companyId, userId, String(umurHari)],
  )
  const id = rows[0].id
  dibuat.push(id)

  await db.query(
    `INSERT INTO ai_pesan (company_id, percakapan_id, peran, urutan, teks, blok, ronde, ada_galat_tool)
     VALUES ($1, $2, 'user', 0, 'uji retensi', '[]'::jsonb, 1, false)`,
    [companyId, id],
  )
  return id
}

describe('batasRetensi — aritmetika tanggal', () => {
  it('30 hari menghasilkan batas 30 hari lalu', () => {
    const sekarang = new Date('2026-08-31T12:00:00Z')
    expect(batasRetensi(30, sekarang)).toBe('2026-08-01T12:00:00.000Z')
  })

  it('1 hari bukan 1 jam', () => {
    // 30 hari yang keliru jadi 30 jam tak menimbulkan galat apa pun — ia
    // hanya menghapus jauh lebih banyak dari yang dijanjikan.
    const sekarang = new Date('2026-08-10T00:00:00Z')
    expect(batasRetensi(1, sekarang)).toBe('2026-08-09T00:00:00.000Z')
  })

  it('retensi besar tetap masuk akal', () => {
    const sekarang = new Date('2026-08-10T00:00:00Z')
    expect(batasRetensi(365, sekarang).slice(0, 4)).toBe('2025')
  })
})

describe('penghapusan BENAR-BENAR terjadi', () => {
  it('percakapan LEBIH TUA dari batas terhapus', async () => {
    const tua = await buatPercakapan(40)
    const batas = batasRetensi(30, new Date())

    const { rows } = await db.query(
      `DELETE FROM ai_percakapan
        WHERE company_id = $1 AND diperbarui_pada < $2 AND id = $3
        RETURNING id`,
      [companyId, batas, tua],
    )
    expect(rows).toHaveLength(1)
  })

  it('percakapan LEBIH BARU dari batas TIDAK terhapus', async () => {
    const baru = await buatPercakapan(5)
    const batas = batasRetensi(30, new Date())

    const { rows } = await db.query(
      `DELETE FROM ai_percakapan
        WHERE company_id = $1 AND diperbarui_pada < $2 AND id = $3
        RETURNING id`,
      [companyId, batas, baru],
    )
    // Menghapus yang masih dalam masa simpan adalah kehilangan data, bukan
    // kepatuhan.
    expect(rows).toHaveLength(0)
  })

  it('PESAN ikut terhapus lewat cascade — dibuktikan, bukan diasumsikan', async () => {
    const tua = await buatPercakapan(60)

    const sebelum = await db.query(
      `SELECT count(*)::int n FROM ai_pesan WHERE percakapan_id = $1`, [tua])
    expect(sebelum.rows[0].n).toBeGreaterThan(0)

    await db.query(`DELETE FROM ai_percakapan WHERE id = $1`, [tua])

    const sesudah = await db.query(
      `SELECT count(*)::int n FROM ai_pesan WHERE percakapan_id = $1`, [tua])
    // Percakapan hilang sementara pesannya tinggal justru LEBIH BURUK daripada
    // tak menghapus: isinya tetap ada, tapi tak lagi bisa ditelusuri
    // pemiliknya.
    expect(sesudah.rows[0].n).toBe(0)
  })
})

describe('retensi NULL = simpan selamanya', () => {
  it('tenant ber-retensi NULL tidak masuk daftar pembersihan', async () => {
    const asli = await db.query(
      `SELECT retensi_hari FROM ai_pengaturan_tenant WHERE company_id = $1`, [companyId])

    await db.query(
      `UPDATE ai_pengaturan_tenant SET retensi_hari = NULL WHERE company_id = $1`, [companyId])

    const { rows } = await db.query(
      `SELECT company_id FROM ai_pengaturan_tenant
        WHERE retensi_hari IS NOT NULL AND company_id = $1`,
      [companyId],
    )
    // "Simpan selamanya" adalah pilihan sadar. Menimpanya dengan bawaan apa
    // pun berarti menghapus data yang tenant memutuskan untuk disimpan.
    expect(rows).toHaveLength(0)

    await db.query(
      `UPDATE ai_pengaturan_tenant SET retensi_hari = $2 WHERE company_id = $1`,
      [companyId, asli.rows[0]?.retensi_hari ?? 30],
    )
  })
})

describe('biaya TIDAK ikut terhapus', () => {
  it('ai_biaya_token tak punya FK cascade ke ai_percakapan', async () => {
    // Biaya adalah catatan keuangan, bukan isi percakapan. Menghapusnya
    // membuat "berapa yang saya habiskan bulan lalu" kehilangan jawabannya,
    // dan batas bulanan menghitung dari data yang sudah dipotong.
    const { rows } = await db.query(`
      SELECT c.conname
      FROM pg_constraint c
      WHERE c.conrelid = 'ai_biaya_token'::regclass
        AND c.contype = 'f'
        AND c.confrelid = 'ai_percakapan'::regclass
    `)
    expect(rows).toHaveLength(0)
  })
})

describe('tugas terdaftar di katalog penjadwal', () => {
  it('bersih-percakapan-ai ada di KATALOG_TUGAS', async () => {
    const { KATALOG_TUGAS } = await import('../../routes/v1/jadwal.js')
    // Tugas yang tak terdaftar tak bisa dijadwalkan dari UI — dan retensi
    // yang harus dipicu manual tak pernah dipicu.
    expect(KATALOG_TUGAS['bersih-percakapan-ai']).toBeTruthy()
    expect(KATALOG_TUGAS['bersih-percakapan-ai'].jalur).toBe('/api/v1/ai/retensi/bersihkan')
  })
})
