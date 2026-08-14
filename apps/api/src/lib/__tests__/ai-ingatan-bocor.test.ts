/**
 * INGATAN TIDAK BOCOR — dan bocornya TAK AKAN tertangkap penjaga lain.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * KENAPA INI TEST YANG PALING PENTING DI FASE 2
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Ingatan bocor lewat PROMPT, bukan lewat tool. Seluruh gerbang izin di repo
 * ini menjaga jalur tool — `katalogUntuk(izin)`, ACL ganda di `jalankanTool`,
 * RLS per tabel. Tak satu pun melihat kalimat yang sudah terlanjur disisipkan
 * ke prompt sistem.
 *
 * Jadi kalau penyaringan di `bacaIngatan` salah, gejalanya NOL: tak ada 403,
 * tak ada galat, tak ada baris log. Yang terjadi hanya asisten yang suatu hari
 * menyebut angka margin kepada mandor — dan tak seorang pun bisa menunjuk di
 * mana izinnya jebol, karena tak ada izin yang jebol.
 *
 * Yang dibuktikan di sini, semuanya terhadap Postgres NYATA:
 *
 *   1. ingatan PRIBADI milik A tak pernah terbaca B
 *   2. `izin_minimum` benar-benar menahan (rahasia)
 *   3. `project_id` benar-benar menahan (relevansi)
 *   4. keduanya digabung — dan mandor proyek itu TETAP tak lihat yang rahasia
 *   5. blok prompt membawa penyangkalan wewenang, bukan cuma isinya
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import type { Client } from 'pg'
import { createRlsClient } from '../../test-utils/rls-harness.js'
import { createTenantDb } from '../../utils/tenant-db.js'
import { bacaIngatan, susunBlokIngatan } from '../ai-ingatan.js'

let db: Client
let companyId: string
let userA: string
let userB: string
let projectId: string
let projectLain: string

const KUNCI = 'ujibocor'

beforeAll(async () => {
  db = await createRlsClient()

  const { rows: co } = await db.query(`
    SELECT c.id FROM companies c
    WHERE (SELECT count(*) FROM company_members m WHERE m.company_id = c.id) >= 2
      AND EXISTS (SELECT 1 FROM projects p WHERE p.company_id = c.id)
    LIMIT 1
  `)
  if (co.length === 0) throw new Error('butuh tenant dengan ≥2 anggota dan ≥1 proyek')
  companyId = co[0].id

  const { rows: us } = await db.query(
    `SELECT user_id FROM company_members WHERE company_id = $1 ORDER BY user_id LIMIT 2`,
    [companyId],
  )
  userA = us[0].user_id
  userB = us[1].user_id

  const { rows: pr } = await db.query(
    `SELECT id FROM projects WHERE company_id = $1 ORDER BY id LIMIT 2`,
    [companyId],
  )
  projectId = pr[0].id
  // Tenant bisa saja hanya punya satu proyek; kasus "proyek lain" dilewati
  // dengan jujur alih-alih memakai UUID karangan yang tak ada di basis.
  projectLain = pr[1]?.id ?? ''

  await bersihkan()
}, 90_000)

afterAll(async () => {
  await bersihkan()
  await db.end()
})

async function bersihkan() {
  await db.query(`DELETE FROM ai_ingatan WHERE company_id = $1 AND kunci LIKE $2`, [
    companyId,
    `${KUNCI}%`,
  ])
}

async function tulis(o: {
  kunci: string
  nilai: string
  lapis: 'pribadi' | 'bersama'
  userId?: string | null
  izin?: string | null
  proyek?: string | null
}) {
  await db.query(
    `INSERT INTO ai_ingatan (company_id, user_id, lapis, kunci, nilai, izin_minimum, project_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [companyId, o.userId ?? null, o.lapis, o.kunci, o.nilai, o.izin ?? null, o.proyek ?? null],
  )
}

const kunciDari = (r: Awaited<ReturnType<typeof bacaIngatan>>) => r.map((x) => x.kunci)

describe('LAPIS PRIBADI — milik satu orang, titik', () => {
  it('ingatan pribadi A TIDAK terbaca B', async () => {
    await tulis({ kunci: `${KUNCI}-pribadi-a`, nilai: 'rahasia A', lapis: 'pribadi', userId: userA })

    const punyaA = await bacaIngatan(createTenantDb(companyId), {
      izinPengguna: new Set(), userId: userA,
    })
    const punyaB = await bacaIngatan(createTenantDb(companyId), {
      izinPengguna: new Set(), userId: userB,
    })

    expect(kunciDari(punyaA)).toContain(`${KUNCI}-pribadi-a`)
    // Inilah barisnya. RLS TIDAK menangkap ini — ia menyaring tenant, dan
    // A dengan B ada di tenant yang sama.
    expect(kunciDari(punyaB)).not.toContain(`${KUNCI}-pribadi-a`)
  })

  it('ingatan bersama terbaca KEDUANYA', async () => {
    await tulis({ kunci: `${KUNCI}-umum`, nilai: 'rapat Senin', lapis: 'bersama' })

    for (const u of [userA, userB]) {
      const r = await bacaIngatan(createTenantDb(companyId), {
        izinPengguna: new Set(), userId: u,
      })
      expect(kunciDari(r)).toContain(`${KUNCI}-umum`)
    }
  })
})

describe('PENANDA IZIN — menjawab pertanyaan RAHASIA', () => {
  it('ingatan ber-izin TIDAK terbaca yang tak memegangnya', async () => {
    await tulis({
      kunci: `${KUNCI}-margin`, nilai: 'margin tipis', lapis: 'bersama', izin: 'finance:view',
    })

    const mandor = await bacaIngatan(createTenantDb(companyId), {
      izinPengguna: new Set(['projects:view']), userId: userB,
    })
    expect(kunciDari(mandor)).not.toContain(`${KUNCI}-margin`)
  })

  it('terbaca oleh yang MEMEGANG izinnya', async () => {
    const keuangan = await bacaIngatan(createTenantDb(companyId), {
      izinPengguna: new Set(['finance:view']), userId: userB,
    })
    expect(kunciDari(keuangan)).toContain(`${KUNCI}-margin`)
  })

  it('izin yang sudah TIDAK ADA di katalog → fail-closed, bukan terbuka', async () => {
    // `izin_minimum` sengaja TEKS, bukan FK (migrasi 385): izin yang dihapus
    // membuat ingatannya tak terbaca siapa pun, alih-alih ikut terhapus.
    await tulis({
      kunci: `${KUNCI}-izinhilang`, nilai: 'x', lapis: 'bersama', izin: 'izin:yang:tak:pernah:ada',
    })
    const r = await bacaIngatan(createTenantDb(companyId), {
      izinPengguna: new Set(['finance:view', 'projects:view']), userId: userA,
    })
    expect(kunciDari(r)).not.toContain(`${KUNCI}-izinhilang`)
  })
})

describe('PENANDA PROYEK — menjawab pertanyaan RELEVANSI', () => {
  it('ingatan ber-proyek hanya ikut saat proyek itu dibicarakan', async () => {
    await tulis({
      kunci: `${KUNCI}-cimahi`, nilai: 'klien minta lapor Jumat',
      lapis: 'bersama', proyek: projectId,
    })

    const tepat = await bacaIngatan(createTenantDb(companyId), {
      izinPengguna: new Set(), userId: userA, projectId,
    })
    expect(kunciDari(tepat)).toContain(`${KUNCI}-cimahi`)
  })

  it('TIDAK ikut saat tak ada proyek yang dibicarakan', async () => {
    // Pertanyaan umum tak boleh terkubur di bawah catatan belasan proyek
    // yang tak ditanyakan.
    const umum = await bacaIngatan(createTenantDb(companyId), {
      izinPengguna: new Set(), userId: userA, projectId: null,
    })
    expect(kunciDari(umum)).not.toContain(`${KUNCI}-cimahi`)
  })

  it('TIDAK ikut saat proyek LAIN yang dibicarakan', async () => {
    if (!projectLain) return // tenant hanya punya satu proyek — dilewati jujur
    const lain = await bacaIngatan(createTenantDb(companyId), {
      izinPengguna: new Set(), userId: userA, projectId: projectLain,
    })
    expect(kunciDari(lain)).not.toContain(`${KUNCI}-cimahi`)
  })
})

describe('KEDUANYA DIGABUNG — kasus yang jadi alasan founder memilih gabungan', () => {
  it('mandor DI proyek itu tetap TIDAK lihat yang berizin keuangan', async () => {
    await tulis({
      kunci: `${KUNCI}-gabung`, nilai: 'margin Cimahi tipis', lapis: 'bersama',
      izin: 'finance:view', proyek: projectId,
    })

    // Inilah lubang yang "proyek saja" tinggalkan: mandor PUNYA akses proyek
    // ini, jadi penyaringan proyek meloloskannya. Yang menahan izinnya.
    const mandor = await bacaIngatan(createTenantDb(companyId), {
      izinPengguna: new Set(['projects:view']), userId: userB, projectId,
    })
    expect(kunciDari(mandor)).not.toContain(`${KUNCI}-gabung`)
  })

  it('orang keuangan DI proyek itu MELIHATNYA', async () => {
    const keuangan = await bacaIngatan(createTenantDb(companyId), {
      izinPengguna: new Set(['finance:view']), userId: userA, projectId,
    })
    expect(kunciDari(keuangan)).toContain(`${KUNCI}-gabung`)
  })

  it('orang keuangan di proyek LAIN tidak melihatnya', async () => {
    if (!projectLain) return
    const keuangan = await bacaIngatan(createTenantDb(companyId), {
      izinPengguna: new Set(['finance:view']), userId: userA, projectId: projectLain,
    })
    expect(kunciDari(keuangan)).not.toContain(`${KUNCI}-gabung`)
  })
})

describe('BLOK PROMPT — catatan, bukan perintah', () => {
  it('kosong saat tak ada ingatan — nol token terbuang', () => {
    expect(susunBlokIngatan([])).toBe('')
  })

  it('dibungkus <ingatan> dan menyangkal wewenangnya sendiri', () => {
    const blok = susunBlokIngatan([
      { id: '1', lapis: 'bersama', kunci: 'k', nilai: 'v', izinMinimum: null, projectId: null },
    ])
    expect(blok).toContain('<ingatan>')
    expect(blok).toContain('</ingatan>')
    // Tanpa penyangkalan ini, ingatan bisa dibaca model sebagai fakta
    // bersumber — padahal ia catatan, bukan hasil tool.
    expect(blok).toContain('BUKAN hasil pembacaan data')
    expect(blok).toContain('BUKAN')
    expect(blok).toMatch(/abaikan/i)
  })
})
