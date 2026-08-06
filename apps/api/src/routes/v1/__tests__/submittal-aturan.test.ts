import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import type { Client } from 'pg'
import { createRlsClient } from '../../../test-utils/rls-harness.js'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

// ============================================================
// SUBMITTAL REGISTER — aturan yang menentukan modul ini berguna atau tidak.
//
// Tiga kelompok:
//   1. REVISI — submittal ditolak lalu diajukan ulang adalah alur NORMAL.
//      Rantainya harus menunjuk pengajuan PERTAMA, tak boleh melingkar, dan
//      penomorannya tak boleh mengulang dari 001 saat sudah ada revisi.
//   2. WORKFLOW ENGINE — persetujuan lewat `approval_chains`, bukan status
//      sendiri. Rantai tanpa langkah bersifat FAIL-CLOSED: modulnya lahir
//      dengan pengajuan yang mustahil diputuskan.
//   3. CATATAN WAJIB — `ditolak` DAN `disetujui_catatan` sama-sama harus
//      beralasan. Yang kedua mudah terlupa: "boleh dipakai" tanpa menyebut
//      syaratnya membuat syaratnya hilang.
//
// Plus satu temuan yang lahir saat menyiapkan modul ini dan lebih besar
// daripada modulnya: `approval_chains` punya UNIQUE (entity_type) GLOBAL.
// ============================================================

let c: Client
let projectId: string
let userId: string

const SUMBER = join(import.meta.dirname, '..', 'submittal.ts')

beforeAll(async () => {
  c = await createRlsClient()
  await c.query('BEGIN')
  userId = (await c.query(`SELECT id FROM users WHERE is_active = true LIMIT 1`)).rows[0].id
  projectId = (await c.query(
    `SELECT id FROM projects WHERE is_deleted = false ORDER BY created_at LIMIT 1`)).rows[0].id
}, 180_000)

afterAll(async () => {
  await c?.query('ROLLBACK').catch(() => {})
  await c?.end()
})

const buat = (nomor: string, extra = '') =>
  c.query(
    `INSERT INTO submittals (project_id, nomor, judul, diajukan_oleh${extra ? ', ' + extra.split('=')[0] : ''})
     VALUES ($1, $2, '[UJI] keramik 60x60', $3${extra ? ', ' + extra.split('=')[1] : ''})
     RETURNING id, revisi`,
    [projectId, nomor, userId])

describe('Submittal — revisi sebagai warga kelas satu', () => {
  it('revisi menunjuk pengajuan PERTAMA, bukan berantai berjenjang', async () => {
    // Kalau R2 menunjuk R1 dan R1 menunjuk asli, membaca riwayat berarti
    // menelusuri satu per satu — dan satu mata rantai putus menghilangkan
    // separuh riwayatnya. API menyimpan `induk_id = akar` untuk semuanya;
    // test ini menjaga bahwa struktur itu memang yang tersimpan.
    await c.query('SAVEPOINT s1')
    const asli = await buat('SUB-901')
    const r1 = await c.query(
      `INSERT INTO submittals (project_id, nomor, judul, diajukan_oleh, revisi, induk_id)
       VALUES ($1,'SUB-901-R1','[UJI] r1',$2,1,$3) RETURNING id`,
      [projectId, userId, asli.rows[0].id])
    const r2 = await c.query(
      `INSERT INTO submittals (project_id, nomor, judul, diajukan_oleh, revisi, induk_id)
       VALUES ($1,'SUB-901-R2','[UJI] r2',$2,2,$3) RETURNING id, induk_id`,
      [projectId, userId, asli.rows[0].id])

    const riwayat = await c.query(
      `SELECT id FROM submittals WHERE id = $1 OR induk_id = $1 ORDER BY revisi`,
      [asli.rows[0].id])
    await c.query('ROLLBACK TO SAVEPOINT s1')

    expect(r2.rows[0].induk_id, 'R2 menunjuk R1, bukan pengajuan pertama')
      .toBe(asli.rows[0].id)
    expect(riwayat.rowCount, 'riwayat tak memuat seluruh percobaan').toBe(3)
    expect(riwayat.rows.map((x) => x.id)).toContain(r1.rows[0].id)
  }, 60_000)

  it('submittal tak boleh jadi induk dirinya sendiri', async () => {
    // Rantai melingkar membuat penelusuran riwayat berputar selamanya.
    await c.query('SAVEPOINT s2')
    const { rows } = await buat('SUB-902')
    let ditolak = false
    try {
      await c.query(`UPDATE submittals SET induk_id = id WHERE id = $1`, [rows[0].id])
    } catch { ditolak = true }
    await c.query('ROLLBACK TO SAVEPOINT s2')
    expect(ditolak, 'submittal bisa jadi induk dirinya sendiri — riwayat berputar').toBe(true)
  }, 60_000)

  it('penomoran mengenali nomor revisi, tidak mengulang dari 001', async () => {
    // ⚠️ Pola `^SUB-(\d+)$` ber-anchor akhir TIDAK cocok dengan `SUB-004-R2`,
    // sehingga penomoran jatuh ke 'SUB-001' dan menabrak nomor yang sudah ada.
    // Diuji dari SUMBER karena inilah yang berjalan.
    const src = readFileSync(SUMBER, 'utf8')
    const m = /const cocok = (\/.+?\/)\.exec\(data\[0\]\.nomor\)/.exec(src)
    expect(m, 'pola penomoran tak ditemukan di sumber').toBeTruthy()

    // Jalankan pola yang SEBENARNYA dipakai terhadap nomor revisi.
    const pola = new RegExp(m![1].slice(1, -1))
    expect(
      pola.exec('SUB-004-R2')?.[1],
      'pola penomoran tak mengenali nomor revisi — penomoran akan mengulang ' +
        'dari 001 dan menabrak nomor yang sudah dipakai'
    ).toBe('004')
    expect(pola.exec('SUB-004')?.[1], 'pola tak mengenali nomor biasa').toBe('004')
  })

  it('revisi hanya untuk yang ditolak atau disetujui-dengan-catatan', () => {
    // Merevisi yang sudah disetujui penuh berarti mengganti material yang
    // sudah dinyatakan boleh dipakai — itu pengajuan baru, bukan revisi.
    const src = readFileSync(SUMBER, 'utf8')
    const blok = src.slice(src.indexOf("'/api/v1/submittals/:id/revisi'")).slice(0, 1200)
    expect(blok).toContain("lama.status !== 'ditolak' && lama.status !== 'disetujui_catatan'")
  })
})

describe('Submittal — constraint yang menjaga arti keputusan', () => {
  it('`ditolak` tanpa catatan DITOLAK', async () => {
    await c.query('SAVEPOINT s3')
    const { rows } = await buat('SUB-903')
    let ditolak = false
    try {
      await c.query(
        `UPDATE submittals SET status='ditolak', diajukan_pada=now(), diputuskan_pada=now()
          WHERE id=$1`, [rows[0].id])
    } catch { ditolak = true }
    await c.query('ROLLBACK TO SAVEPOINT s3')
    expect(ditolak, 'ditolak tanpa alasan — pengaju tak tahu apa yang harus diganti')
      .toBe(true)
  }, 60_000)

  it('`disetujui_catatan` tanpa catatan DITOLAK', async () => {
    // Yang paling mudah terlupa: "boleh dipakai" tanpa menyebut syaratnya
    // membuat syaratnya HILANG, dan pekerjaan berjalan dengan asumsi salah.
    await c.query('SAVEPOINT s4')
    const { rows } = await buat('SUB-904')
    let ditolak = false
    try {
      await c.query(
        `UPDATE submittals SET status='disetujui_catatan', diajukan_pada=now(), diputuskan_pada=now()
          WHERE id=$1`, [rows[0].id])
    } catch { ditolak = true }
    await c.query('ROLLBACK TO SAVEPOINT s4')
    expect(ditolak, 'disetujui-dengan-catatan tanpa menyebut catatannya').toBe(true)
  }, 60_000)

  it('`disetujui` polos TIDAK butuh catatan (constraint tak kelewat ketat)', async () => {
    await c.query('SAVEPOINT s5')
    const { rows } = await buat('SUB-905')
    const ok = await c.query(
      `UPDATE submittals SET status='disetujui', diajukan_pada=now(), diputuskan_pada=now()
        WHERE id=$1 RETURNING id`, [rows[0].id])
    await c.query('ROLLBACK TO SAVEPOINT s5')
    expect(ok.rowCount, 'persetujuan polos ditolak — constraint terlalu ketat').toBe(1)
  }, 60_000)

  it('keputusan tak boleh mendahului pengajuan', async () => {
    await c.query('SAVEPOINT s6')
    const { rows } = await buat('SUB-906')
    let ditolak = false
    try {
      await c.query(
        `UPDATE submittals SET status='disetujui', diajukan_pada=now(),
                diputuskan_pada=now() - interval '2 days' WHERE id=$1`, [rows[0].id])
    } catch { ditolak = true }
    await c.query('ROLLBACK TO SAVEPOINT s6')
    expect(ditolak, 'keputusan mendahului pengajuan — lama menunggu negatif').toBe(true)
  }, 60_000)

  it('`diajukan` tanpa tanggal aju DITOLAK', async () => {
    await c.query('SAVEPOINT s7')
    const { rows } = await buat('SUB-907')
    let ditolak = false
    try {
      await c.query(`UPDATE submittals SET status='diajukan' WHERE id=$1`, [rows[0].id])
    } catch { ditolak = true }
    await c.query('ROLLBACK TO SAVEPOINT s7')
    expect(ditolak, 'diajukan tanpa tanggal — lama menunggu tak terhitung').toBe(true)
  }, 60_000)
})

describe('Submittal — memakai Workflow Engine, bukan mekanisme keempat', () => {
  it('rantai approval `submittal` ADA untuk tiap company', async () => {
    const kurang = await c.query(
      `SELECT c.id FROM companies c
        WHERE NOT EXISTS (SELECT 1 FROM approval_chains ac
                           WHERE ac.company_id = c.id AND ac.entity_type = 'submittal')`)
    expect(kurang.rowCount, 'ada company tanpa rantai submittal — pengajuannya tak bisa diputuskan')
      .toBe(0)
  }, 60_000)

  it('rantainya BERLANGKAH — rantai kosong bersifat fail-closed', async () => {
    // `steps.length === 0` → nol orang bisa approve (ADR-007). Rantai yang
    // ada tapi tanpa langkah adalah modul yang lahir dengan pengajuan yang
    // mustahil diputuskan — dan gejalanya "403 Akses ditolak" untuk semua.
    const q = await c.query(
      `SELECT count(*) n FROM approval_chains ac
         JOIN approval_steps s ON s.chain_id = ac.id
        WHERE ac.entity_type = 'submittal'`)
    expect(Number(q.rows[0].n), 'rantai submittal nol langkah — approval beku')
      .toBeGreaterThan(0)
  }, 60_000)

  it('langkahnya menuntut `submittal:decide`, bukan `submittal:manage`', async () => {
    // Kalau langkahnya menuntut capability pengaju, siapa pun yang bisa
    // mengajukan bisa menyetujui pengajuannya sendiri.
    const q = await c.query(
      `SELECT s.required_permission FROM approval_chains ac
         JOIN approval_steps s ON s.chain_id = ac.id
        WHERE ac.entity_type = 'submittal' ORDER BY s.level LIMIT 1`)
    expect(q.rows[0].required_permission).toBe('submittal:decide')
  }, 60_000)

  it('tabel submittals TIDAK punya kolom `disetujui_oleh`', async () => {
    // Jejak persetujuan hidup di `approval_progress`, satu tempat untuk
    // seluruh sistem. Kolom sendiri di sini akan jadi sumber kebenaran kedua
    // yang menyimpang diam-diam.
    const q = await c.query(
      `SELECT a.attname FROM pg_attribute a
        WHERE a.attrelid = 'submittals'::regclass AND a.attnum > 0
          AND NOT a.attisdropped AND a.attname LIKE '%disetujui%'`)
    expect(q.rows.map((r) => r.attname), 'ada kolom persetujuan sendiri di submittals')
      .toEqual([])
  }, 60_000)

  it('keputusan lewat endpoint tersendiri yang memanggil rantai', () => {
    const src = readFileSync(SUMBER, 'utf8')
    expect(src, 'keputusan tak lewat evaluateEntityApproval — mekanisme approval keempat')
      .toContain("evaluateEntityApproval(request, {\n        entityType: 'submittal'")
    expect(src, 'gerbang kasar canParticipateInChain hilang — keberadaan id bocor lewat 403 vs 404')
      .toContain("canParticipateInChain(request, 'submittal')")
    // configError TIDAK boleh menyamar jadi "tidak berhak" (Phase 1 §4E).
    const blok = src.slice(src.indexOf("entityType: 'submittal', entityId: id")).slice(0, 900)
    expect(blok, 'kegagalan konfigurasi menyamar sebagai penolakan otorisasi')
      .toContain('decision.configError')
  })
})

describe('approval_chains — UNIQUE per company (migrasi 158)', () => {
  it('badan usaha kedua BISA punya rantai approval sendiri', async () => {
    // Temuan yang lahir saat menyiapkan Submittal, dan lebih besar daripada
    // modulnya: `company_id NOT NULL` ditambahkan T4h tapi `UNIQUE
    // (entity_type)` GLOBAL tidak ikut diubah. Pola yang sama sudah menggigit
    // di financial_config (145), feature_flags (146), modules (155).
    //
    // Akibatnya FAIL-CLOSED: company kedua yang tak bisa punya rantai berarti
    // nol orang bisa menyetujui apa pun di sana — kasbon, CO, pengeluaran,
    // estimasi, semuanya beku.
    await c.query('SAVEPOINT s8')
    const b = await c.query(
      `INSERT INTO companies (code, name, owner_user_id)
       VALUES ('uji-158-t','Tenant B', (SELECT id FROM users ORDER BY created_at LIMIT 1)) RETURNING id`)
    let bisa = false
    try {
      await c.query(
        `INSERT INTO approval_chains (company_id, entity_type, label, is_active)
         VALUES ($1,'kasbon','Persetujuan Kasbon (B)',true)`, [b.rows[0].id])
      bisa = true
    } catch { bisa = false }
    await c.query('ROLLBACK TO SAVEPOINT s8')

    expect(
      bisa,
      'badan usaha kedua tak bisa punya rantai approval sendiri — seluruh ' +
        'persetujuan di sana beku (fail-closed)'
    ).toBe(true)
  }, 60_000)

  it('ganda DALAM satu company tetap ditolak', async () => {
    await c.query('SAVEPOINT s9')
    const b = await c.query(
      `INSERT INTO companies (code, name, owner_user_id)
       VALUES ('uji-158-u','Tenant C', (SELECT id FROM users ORDER BY created_at LIMIT 1)) RETURNING id`)
    await c.query(
      `INSERT INTO approval_chains (company_id, entity_type, label, is_active)
       VALUES ($1,'kasbon','satu',true)`, [b.rows[0].id])
    let bentrok = false
    try {
      await c.query(
        `INSERT INTO approval_chains (company_id, entity_type, label, is_active)
         VALUES ($1,'kasbon','dua',true)`, [b.rows[0].id])
    } catch (e) { bentrok = (e as { code?: string }).code === '23505' }
    await c.query('ROLLBACK TO SAVEPOINT s9')

    expect(bentrok, 'satu company bisa punya dua rantai untuk entitas yang sama').toBe(true)
  }, 60_000)

  it('tiap rantai yang ada punya minimal satu langkah', async () => {
    const q = await c.query(
      `SELECT ac.entity_type FROM approval_chains ac
        WHERE NOT EXISTS (SELECT 1 FROM approval_steps s WHERE s.chain_id = ac.id)`)
    expect(
      q.rows.map((r) => r.entity_type),
      'ada rantai tanpa langkah — approval entitas itu beku, dan gejalanya ' +
        '403 untuk semua orang, bukan pesan konfigurasi'
    ).toEqual([])
  }, 60_000)
})

describe('Submittal — isolasi tenant', () => {
  it('policy tenant_isolation RESTRICTIVE + ada PERMISSIVE', async () => {
    for (const t of ['submittals', 'submittal_documents']) {
      const r = await c.query(
        `SELECT permissive FROM pg_policies
          WHERE schemaname='public' AND tablename=$1 AND policyname='tenant_isolation'`, [t])
      expect(r.rowCount, `${t}: tenant_isolation hilang`).toBe(1)
      expect(r.rows[0].permissive, `${t}: bukan RESTRICTIVE`).toBe('RESTRICTIVE')

      const p = await c.query(
        `SELECT count(*) n FROM pg_policies
          WHERE schemaname='public' AND tablename=$1 AND permissive='PERMISSIVE'`, [t])
      expect(Number(p.rows[0].n), `${t}: nol permissive — tabel mati total`).toBeGreaterThan(0)
    }
  }, 60_000)

  it('pengaju tak bisa mencatat keputusan atas pengajuannya sendiri', async () => {
    const q = await c.query(
      `SELECT p.key FROM role_permissions rp
         JOIN roles r ON r.id = rp.role_id
         JOIN permissions p ON p.id = rp.permission_id
        WHERE r.name = 'mandor' AND p.key LIKE 'submittal:%' ORDER BY p.key`)
    const keys = q.rows.map((r) => r.key)
    expect(keys, 'mandor tak bisa mengajukan submittal').toContain('submittal:manage')
    expect(keys, 'mandor bisa menyetujui pengajuannya sendiri').not.toContain('submittal:decide')
  }, 60_000)
})
