// ============================================================================
// SEED DATA UJI — Portal Mandor
// ============================================================================
//
// Tujuan: mengisi akun uji.mandor.portal@puraloka.test (user id
// 38ff9f16-30c8-4141-8d53-c0e7229f396a) dengan data yang cukup untuk menilai
// tampilan Portal Mandor BERISI DATA, bukan keadaan kosong.
//
// Aturan keras:
//   - HANYA INSERT. Tidak ada UPDATE/DELETE/TRUNCATE terhadap data lama.
//   - Semua baris yang dibuat skrip ini bertanda '[UJI]' pada kolom teks
//     paling masuk akal (scope_name, purpose, notes, name) — supaya bisa
//     dicari & dibersihkan nanti lewat `WHERE ... LIKE '%[UJI]%'`.
//   - Idempoten: dijalankan ulang tidak menumpuk duplikat. Untuk
//     mandor_assignments ini otomatis dijamin oleh UNIQUE(project_id,
//     mandor_id) di skema — skrip memeriksa dulu sebelum insert supaya
//     tidak bergantung pada exception ON CONFLICT untuk baris lain
//     (work_scopes/kasbons/workers/daily_wage_logs) yang tidak punya
//     unique constraint alami.
//   - Nominal numeric, waktu timestamptz (tidak memperkenalkan float/
//     timestamp tanpa zona).
//   - kasbons.cash_account_id SENGAJA TIDAK DIISI (dibiarkan NULL). Kolom
//     itu memicu trigger fn_update_cash_balance_on_payment/kasbon bila
//     terisi — lihat CLAUDE.md §6 "Uang lewat percakapan". Data uji tidak
//     boleh menggerakkan saldo kas sungguhan.
//
// Jalankan:
//   cd <root repo/worktree ini> && node scripts/db/seed-uji-portal-mandor.mjs
// ============================================================================

import { buatClient, pastikanCwdRootRepo } from './_koneksi.mjs'

pastikanCwdRootRepo('scripts/db/seed-uji-portal-mandor.mjs')

const MANDOR_ID = '38ff9f16-30c8-4141-8d53-c0e7229f396a'
const TANDA = '[UJI]'

async function main() {
  const client = buatClient()
  await client.connect()

  try {
    // ── 0. Verifikasi prasyarat ──────────────────────────────────────────
    const { rows: userRows } = await client.query(
      `SELECT id, name, email FROM users WHERE id = $1`,
      [MANDOR_ID],
    )
    if (userRows.length === 0) {
      throw new Error(`User mandor uji ${MANDOR_ID} tidak ditemukan.`)
    }
    console.log(`Akun sasaran: ${userRows[0].name} <${userRows[0].email}>`)

    const { rows: memberRows } = await client.query(
      `SELECT company_id FROM company_members
        WHERE user_id = $1 AND is_default = true AND is_active = true`,
      [MANDOR_ID],
    )
    if (memberRows.length === 0) {
      throw new Error(`Tidak ada company_members default+aktif untuk ${MANDOR_ID}.`)
    }
    const companyId = memberRows[0].company_id
    console.log(`Company (tenant): ${companyId}`)

    // Admin dari company yang sama, dipakai sebagai assigned_by/approved_by/recorded_by.
    const { rows: adminRows } = await client.query(
      `SELECT u.id, u.name FROM company_members cm
        JOIN users u ON u.id = cm.user_id
       WHERE cm.company_id = $1 AND cm.is_active = true
         AND u.id IN (SELECT id FROM users WHERE role_id IN (
           SELECT id FROM roles WHERE name = 'admin'
         ))
       LIMIT 1`,
      [companyId],
    )
    if (adminRows.length === 0) {
      throw new Error(`Tidak ada admin aktif di company ${companyId} untuk dipakai sebagai aktor.`)
    }
    const aktorId = adminRows[0].id
    console.log(`Aktor (assigned_by/approved_by/recorded_by): ${adminRows[0].name} (${aktorId})`)

    // Proyek aktif milik company yang sama, belum dihapus.
    const { rows: projectRows } = await client.query(
      `SELECT id, name FROM projects
        WHERE company_id = $1 AND is_deleted = false AND status = 'active'
        ORDER BY created_at
        LIMIT 3`,
      [companyId],
    )
    if (projectRows.length < 2) {
      throw new Error(`Butuh minimal 2 proyek aktif di company ${companyId}, hanya ada ${projectRows.length}.`)
    }
    console.log(`Proyek dipakai (${projectRows.length}):`, projectRows.map((p) => p.name).join(', '))

    // ── 1. mandor_assignments (2-3 proyek) ───────────────────────────────
    const assignmentIds = []
    for (const project of projectRows) {
      const { rows: existing } = await client.query(
        `SELECT id FROM mandor_assignments WHERE project_id = $1 AND mandor_id = $2`,
        [project.id, MANDOR_ID],
      )
      if (existing.length > 0) {
        assignmentIds.push({ id: existing[0].id, projectName: project.name })
        console.log(`  = assignment sudah ada untuk proyek "${project.name}" (${existing[0].id})`)
        continue
      }
      const { rows: inserted } = await client.query(
        `INSERT INTO mandor_assignments (project_id, mandor_id, notes, status, assigned_by)
         VALUES ($1, $2, $3, 'active', $4)
         RETURNING id`,
        [project.id, MANDOR_ID, `${TANDA} Penugasan data uji verifikasi Portal Mandor`, aktorId],
      )
      assignmentIds.push({ id: inserted[0].id, projectName: project.name })
      console.log(`  + assignment baru untuk proyek "${project.name}" (${inserted[0].id})`)
    }

    // ── 2. work_scopes — payment_system bervariasi ───────────────────────
    // Rencana: assignment[0] -> harian, assignment[1] -> progress_pct,
    // assignment[2] (kalau ada) -> borongan. Kalau hanya 2 assignment,
    // assignment[0] dapat dua scope (harian + borongan) supaya tetap variatif.
    const scopeSpecs = []
    scopeSpecs.push({
      assignment: assignmentIds[0],
      scope_name: `${TANDA} Pekerjaan Harian — ${assignmentIds[0].projectName}`,
      payment_system: 'harian',
      progress_pct_done: 40,
      description: `${TANDA} Lingkup kerja harian untuk verifikasi menu Laporan Upah.`,
    })
    scopeSpecs.push({
      assignment: assignmentIds[1],
      scope_name: `${TANDA} Pekerjaan Progress — ${assignmentIds[1].projectName}`,
      payment_system: 'progress_pct',
      progress_pct_done: 65,
      // chk_work_scope_borongan_req: wajib diisi untuk payment_system selain 'harian'.
      borongan_value: 40000000,
      description: `${TANDA} Lingkup kerja progress_pct untuk verifikasi menu Penagihan.`,
    })
    if (assignmentIds.length >= 3) {
      scopeSpecs.push({
        assignment: assignmentIds[2],
        scope_name: `${TANDA} Pekerjaan Borongan — ${assignmentIds[2].projectName}`,
        payment_system: 'borongan',
        progress_pct_done: 20,
        borongan_value: 25000000,
        description: `${TANDA} Lingkup kerja borongan untuk variasi tampilan.`,
      })
    } else {
      scopeSpecs.push({
        assignment: assignmentIds[0],
        scope_name: `${TANDA} Pekerjaan Borongan Tambahan — ${assignmentIds[0].projectName}`,
        payment_system: 'borongan',
        progress_pct_done: 20,
        borongan_value: 15000000,
        description: `${TANDA} Lingkup kerja borongan kedua di proyek yang sama, untuk variasi tampilan.`,
      })
    }

    const scopeIdBySystem = {}
    for (const spec of scopeSpecs) {
      const { rows: existing } = await client.query(
        `SELECT id, payment_system FROM work_scopes
          WHERE assignment_id = $1 AND scope_name = $2`,
        [spec.assignment.id, spec.scope_name],
      )
      let scopeId
      if (existing.length > 0) {
        scopeId = existing[0].id
        console.log(`  = work_scope sudah ada: "${spec.scope_name}" (${scopeId})`)
      } else {
        const { rows: inserted } = await client.query(
          `INSERT INTO work_scopes
             (assignment_id, scope_name, description, payment_system,
              borongan_value, progress_pct_done, status, start_date)
           VALUES ($1, $2, $3, $4, $5, $6, 'active', CURRENT_DATE - INTERVAL '30 days')
           RETURNING id`,
          [
            spec.assignment.id,
            spec.scope_name,
            spec.description,
            spec.payment_system,
            spec.borongan_value ?? null,
            spec.progress_pct_done,
          ],
        )
        scopeId = inserted[0].id
        console.log(`  + work_scope baru (${spec.payment_system}): "${spec.scope_name}" (${scopeId})`)
      }
      // Simpan satu scope representatif per payment_system untuk dipakai kasbon/laporan upah.
      if (!scopeIdBySystem[spec.payment_system]) scopeIdBySystem[spec.payment_system] = scopeId
      scopeIdBySystem[`__all__:${spec.scope_name}`] = scopeId
    }

    // ── 3. kasbons — status bervariasi (pending/approved/rejected) ───────
    const kasbonSpecs = [
      {
        purpose: `${TANDA} Kasbon uji status pending — pembelian material`,
        status: 'pending',
        amount: 1500000,
        fund_source: 'owner_advance',
        work_scope_id: scopeIdBySystem['harian'],
        project_id: assignmentIds[0]
          ? projectRows.find((p) => p.name === assignmentIds[0].projectName)?.id
          : null,
      },
      {
        purpose: `${TANDA} Kasbon uji status approved — upah tukang mingguan`,
        status: 'approved',
        amount: 3000000,
        fund_source: 'client_fund',
        work_scope_id: scopeIdBySystem['progress_pct'],
        project_id: projectRows.find((p) => p.name === assignmentIds[1].projectName)?.id,
        approved: true,
      },
      {
        purpose: `${TANDA} Kasbon uji status rejected — permintaan ditolak PM`,
        status: 'rejected',
        amount: 800000,
        fund_source: 'owner_advance',
        work_scope_id: scopeIdBySystem['borongan'] ?? scopeIdBySystem['harian'],
        project_id: projectRows[0].id,
      },
    ]

    for (const spec of kasbonSpecs) {
      const { rows: existing } = await client.query(
        `SELECT id FROM kasbons WHERE purpose = $1 AND requested_by = $2`,
        [spec.purpose, MANDOR_ID],
      )
      if (existing.length > 0) {
        console.log(`  = kasbon sudah ada: "${spec.purpose}" (${existing[0].id})`)
        continue
      }
      const { rows: inserted } = await client.query(
        `INSERT INTO kasbons
           (work_scope_id, amount, fund_source, purpose, status,
            requested_by, approved_by, approved_at, project_id, company_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
         RETURNING id`,
        [
          spec.work_scope_id,
          spec.amount,
          spec.fund_source,
          spec.purpose,
          spec.status,
          MANDOR_ID,
          spec.status === 'pending' ? null : aktorId,
          spec.status === 'pending' ? null : new Date(),
          spec.project_id,
          companyId,
        ],
      )
      console.log(`  + kasbon baru (${spec.status}): "${spec.purpose}" (${inserted[0].id})`)
    }

    // ── 4. workers — beberapa tukang di bawah mandor ini ─────────────────
    // workers_tipe_check: hanya menerima 'tukang' | 'laden' | 'kenek'.
    const workerSpecs = [
      { name: `${TANDA} Tukang Dedi`, tipe: 'tukang', skills: ['batu', 'plester'] },
      { name: `${TANDA} Tukang Ujang`, tipe: 'tukang', skills: ['kayu', 'atap'] },
      { name: `${TANDA} Kenek Yayat`, tipe: 'kenek', skills: ['besi', 'cor'] },
    ]
    const workerIds = []
    for (const spec of workerSpecs) {
      const { rows: existing } = await client.query(
        `SELECT id FROM workers WHERE name = $1 AND mandor_id = $2`,
        [spec.name, MANDOR_ID],
      )
      if (existing.length > 0) {
        workerIds.push(existing[0].id)
        console.log(`  = worker sudah ada: "${spec.name}" (${existing[0].id})`)
        continue
      }
      const { rows: inserted } = await client.query(
        `INSERT INTO workers (mandor_id, name, phone, notes, is_active, skills, tipe, company_id)
         VALUES ($1, $2, $3, $4, true, $5, $6, $7)
         RETURNING id`,
        [
          MANDOR_ID,
          spec.name,
          '0812' + String(Math.floor(10000000 + Math.random() * 89999999)),
          `${TANDA} Data uji verifikasi Portal Mandor`,
          spec.skills,
          spec.tipe,
          companyId,
        ],
      )
      workerIds.push(inserted[0].id)
      console.log(`  + worker baru: "${spec.name}" (${inserted[0].id})`)
    }

    // ── 5. daily_wage_logs — 1-2 laporan upah pada scope 'harian' ─────────
    const harianScopeId = scopeIdBySystem['harian']
    if (harianScopeId) {
      const wageLogSpecs = [
        {
          work_date: 'CURRENT_DATE - INTERVAL \'2 days\'',
          worker_count: 3,
          daily_rate: 150000,
          notes: `${TANDA} Laporan upah harian — hari kerja normal`,
        },
        {
          work_date: 'CURRENT_DATE - INTERVAL \'1 day\'',
          worker_count: 4,
          daily_rate: 150000,
          notes: `${TANDA} Laporan upah harian — tambah 1 tukang lembur`,
        },
      ]
      for (const spec of wageLogSpecs) {
        const { rows: existing } = await client.query(
          `SELECT id FROM daily_wage_logs WHERE work_scope_id = $1 AND notes = $2`,
          [harianScopeId, spec.notes],
        )
        if (existing.length > 0) {
          console.log(`  = daily_wage_log sudah ada: "${spec.notes}" (${existing[0].id})`)
          continue
        }
        const totalAmount = spec.worker_count * spec.daily_rate
        const { rows: inserted } = await client.query(
          `INSERT INTO daily_wage_logs
             (work_scope_id, work_date, worker_count, daily_rate, total_amount, notes, recorded_by)
           VALUES ($1, ${spec.work_date}, $2, $3, $4, $5, $6)
           RETURNING id`,
          [harianScopeId, spec.worker_count, spec.daily_rate, totalAmount, spec.notes, aktorId],
        )
        console.log(`  + daily_wage_log baru: "${spec.notes}" (${inserted[0].id})`)
      }
    } else {
      console.log('  ! tidak ada scope "harian" — daily_wage_logs dilewati.')
    }

    // ── 6. Verifikasi balik ───────────────────────────────────────────────
    console.log('\n=== VERIFIKASI BALIK ===')

    const { rows: assignCount } = await client.query(
      `SELECT count(*)::int AS n FROM mandor_assignments WHERE mandor_id = $1`,
      [MANDOR_ID],
    )
    console.log(`mandor_assignments milik akun uji: ${assignCount[0].n}`)

    const { rows: scopeCount } = await client.query(
      `SELECT ws.payment_system, count(*)::int AS n
         FROM work_scopes ws
         JOIN mandor_assignments ma ON ma.id = ws.assignment_id
        WHERE ma.mandor_id = $1
        GROUP BY ws.payment_system
        ORDER BY ws.payment_system`,
      [MANDOR_ID],
    )
    console.log('work_scopes per payment_system:', scopeCount)

    const { rows: kasbonCount } = await client.query(
      `SELECT status, count(*)::int AS n FROM kasbons WHERE requested_by = $1 GROUP BY status ORDER BY status`,
      [MANDOR_ID],
    )
    console.log('kasbons per status:', kasbonCount)

    const { rows: workerCount } = await client.query(
      `SELECT count(*)::int AS n FROM workers WHERE mandor_id = $1`,
      [MANDOR_ID],
    )
    console.log(`workers milik akun uji: ${workerCount[0].n}`)

    const { rows: wageLogCount } = await client.query(
      `SELECT count(*)::int AS n
         FROM daily_wage_logs dwl
         JOIN work_scopes ws ON ws.id = dwl.work_scope_id
         JOIN mandor_assignments ma ON ma.id = ws.assignment_id
        WHERE ma.mandor_id = $1`,
      [MANDOR_ID],
    )
    console.log(`daily_wage_logs terkait akun uji: ${wageLogCount[0].n}`)

    console.log('\nSelesai.')
  } finally {
    await client.end()
  }
}

main().catch((e) => {
  console.error('FATAL:', e)
  process.exit(1)
})
