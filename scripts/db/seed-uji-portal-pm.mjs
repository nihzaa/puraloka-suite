// ============================================================================
// SEED DATA UJI — Portal PM
// ============================================================================
//
// Tujuan: mengisi akun uji.pm.portal@puraloka.test (user id
// a13ffd45-9970-4fc5-b823-bcf40ddd4266, role `pm`) dengan proyek dan entitas
// pending yang cukup untuk menilai APPROVAL INBOX PM berisi data, bukan
// keadaan kosong — dan membuktikan filter proyek-milik-PM benar-benar
// menyaring (satu entitas pending sengaja ditaruh di proyek PM LAIN).
//
// Aturan keras:
//   - HANYA INSERT. Tidak ada UPDATE/DELETE/TRUNCATE terhadap baris lama.
//     (Termasuk company_members.is_default = false milik akun ini — itu
//     baris yang sudah ada sebelum skrip ini berjalan, BUKAN dibuat di sini.
//     Tidak diperbaiki karena user ini hanya punya SATU baris company_members,
//     dan apps/api/src/plugins/auth.ts:98 fallback ke keanggotaan[0] saat
//     tak ada is_default — jadi tidak memblokir login/tenancy. Dicatat di
//     laporan, bukan disentuh.)
//   - Semua baris yang dibuat skrip ini bertanda '[UJI]' pada kolom teks
//     paling masuk akal (name, purpose, notes, judul, dst) — supaya bisa
//     dicari & dibersihkan nanti lewat `WHERE ... LIKE '%[UJI]%'`.
//   - Idempoten: dijalankan ulang tidak menumpuk duplikat. Proyek dicari
//     lebih dulu lewat `name` (unik secara de-facto karena diberi tanda
//     '[UJI]' + akun PM), entitas lain lewat kombinasi kolom yang unik
//     secara praktis (purpose+requested_by, judul+project_id, dst).
//   - Nominal numeric, waktu timestamptz (tidak memperkenalkan float/
//     timestamp tanpa zona).
//   - kasbons.cash_account_id SENGAJA TIDAK DIISI (dibiarkan NULL). Kolom
//     itu memicu trigger fn_update_cash_balance_on_payment/kasbon bila
//     terisi — lihat CLAUDE.md §6 "Uang lewat percakapan". Data uji tidak
//     boleh menggerakkan saldo kas sungguhan.
//   - JANGAN mengubah pm_id proyek yang sudah ada — proyek uji PM dibuat
//     BARU dengan pm_id terisi sejak INSERT.
//
// Jalankan:
//   cd <root repo/worktree ini> && node scripts/db/seed-uji-portal-pm.mjs
// ============================================================================

import { buatClient, pastikanCwdRootRepo } from './_koneksi.mjs'

pastikanCwdRootRepo('scripts/db/seed-uji-portal-pm.mjs')

const PM_ID = 'a13ffd45-9970-4fc5-b823-bcf40ddd4266'
const TANDA = '[UJI]'

async function main() {
  const client = buatClient()
  await client.connect()

  try {
    // ── 0. Verifikasi prasyarat ──────────────────────────────────────────
    const { rows: userRows } = await client.query(
      `SELECT id, name, email, role_id FROM users WHERE id = $1`,
      [PM_ID],
    )
    if (userRows.length === 0) {
      throw new Error(`User PM uji ${PM_ID} tidak ditemukan.`)
    }
    console.log(`Akun sasaran: ${userRows[0].name} <${userRows[0].email}>`)

    const { rows: roleRows } = await client.query(
      `SELECT name FROM roles WHERE id = $1`,
      [userRows[0].role_id],
    )
    console.log(`Role: ${roleRows[0]?.name ?? '(tidak ditemukan)'}`)
    if (roleRows[0]?.name !== 'pm') {
      throw new Error(`Role user ${PM_ID} bukan 'pm' (ditemukan: ${roleRows[0]?.name}).`)
    }

    const { rows: memberRows } = await client.query(
      `SELECT company_id, is_default, is_active FROM company_members WHERE user_id = $1`,
      [PM_ID],
    )
    if (memberRows.length === 0) {
      throw new Error(`Tidak ada company_members untuk ${PM_ID}.`)
    }
    if (!memberRows.some((m) => m.is_active)) {
      throw new Error(`Tidak ada company_members AKTIF untuk ${PM_ID}.`)
    }
    const companyId = memberRows[0].company_id
    console.log(`Company (tenant): ${companyId}`)
    if (!memberRows[0].is_default) {
      console.log(
        `  ! PERINGATAN (bukan dibuat skrip ini): company_members.is_default = false ` +
        `untuk baris ini. Karena hanya ADA SATU baris company_members milik akun ini, ` +
        `auth.ts:98 tetap fallback ke keanggotaan[0] — tidak memblokir login. ` +
        `Tidak diperbaiki di sini (aturan HANYA INSERT).`,
      )
    }

    // Admin dari company yang sama, dipakai sebagai created_by/aktor.
    const { rows: adminRows } = await client.query(
      `SELECT u.id, u.name FROM company_members cm
        JOIN users u ON u.id = cm.user_id
        JOIN roles r ON r.id = cm.role_id
       WHERE cm.company_id = $1 AND cm.is_active = true AND r.name = 'admin'
       LIMIT 1`,
      [companyId],
    )
    if (adminRows.length === 0) {
      throw new Error(`Tidak ada admin aktif di company ${companyId} untuk dipakai sebagai aktor.`)
    }
    const aktorId = adminRows[0].id
    console.log(`Aktor (created_by/requested_by pengganti): ${adminRows[0].name} (${aktorId})`)

    // Mandor aktif di company yang sama, dipakai sebagai requested_by kasbon
    // (kasbons.requested_by secara logika adalah mandor yang meminta, bukan admin).
    const { rows: mandorRows } = await client.query(
      `SELECT u.id, u.name FROM company_members cm
        JOIN users u ON u.id = cm.user_id
        JOIN roles r ON r.id = cm.role_id
       WHERE cm.company_id = $1 AND cm.is_active = true AND r.name = 'mandor'
       ORDER BY u.id
       LIMIT 3`,
      [companyId],
    )
    if (mandorRows.length === 0) {
      throw new Error(`Tidak ada mandor aktif di company ${companyId}.`)
    }
    console.log(`Mandor tersedia (${mandorRows.length}):`, mandorRows.map((m) => m.name).join(', '))

    // Klien company yang sama, dipakai sebagai client_id proyek baru.
    const { rows: clientRows } = await client.query(
      `SELECT id FROM clients WHERE company_id = $1 ORDER BY id LIMIT 1`,
      [companyId],
    )
    if (clientRows.length === 0) {
      throw new Error(`Tidak ada client di company ${companyId} untuk dipakai proyek uji.`)
    }
    const clientId = clientRows[0].id

    // Proyek company yang sama TAPI BUKAN milik PM uji — untuk membuktikan
    // filter inbox benar-benar menyaring proyek.
    const { rows: proyekLainRows } = await client.query(
      `SELECT id, name FROM projects
        WHERE company_id = $1 AND is_deleted = false AND pm_id != $2
        ORDER BY created_at LIMIT 1`,
      [companyId, PM_ID],
    )
    if (proyekLainRows.length === 0) {
      throw new Error(`Tidak ada proyek company ${companyId} yang BUKAN milik PM uji — butuh minimal 1 untuk uji filter.`)
    }
    const proyekLain = proyekLainRows[0]
    console.log(`Proyek BUKAN milik PM uji (untuk uji filter): "${proyekLain.name}" (${proyekLain.id})`)

    // ── 1. Proyek BARU ber-pm_id = PM uji (2-3 proyek) ───────────────────
    const projectSpecs = [
      {
        name: `${TANDA} Renovasi Gudang Bu Sinta — Antapani`,
        location: 'Jl. Antapani Raya No. 12, Bandung',
        contract_value: 180000000,
      },
      {
        name: `${TANDA} Pembangunan Ruko 2 Lantai Pak Joko — Buah Batu`,
        location: 'Jl. Buah Batu No. 88, Bandung',
        contract_value: 650000000,
      },
      {
        name: `${TANDA} Renovasi Fasad Kantor CV Makmur — Cihampelas`,
        location: 'Jl. Cihampelas No. 45, Bandung',
        contract_value: 320000000,
      },
    ]

    const projectIds = []
    for (const spec of projectSpecs) {
      const { rows: existing } = await client.query(
        `SELECT id FROM projects WHERE name = $1 AND company_id = $2`,
        [spec.name, companyId],
      )
      if (existing.length > 0) {
        projectIds.push({ id: existing[0].id, name: spec.name })
        console.log(`  = proyek sudah ada: "${spec.name}" (${existing[0].id})`)
        continue
      }
      const { rows: inserted } = await client.query(
        `INSERT INTO projects
           (client_id, pm_id, name, description, location, contract_value,
            start_date, end_date, status, created_by, company_id)
         VALUES ($1, $2, $3, $4, $5, $6,
                 CURRENT_DATE - INTERVAL '45 days', CURRENT_DATE + INTERVAL '90 days',
                 'active', $7, $8)
         RETURNING id`,
        [
          clientId,
          PM_ID,
          spec.name,
          `${TANDA} Proyek data uji verifikasi Portal PM (approval inbox).`,
          spec.location,
          spec.contract_value,
          aktorId,
          companyId,
        ],
      )
      projectIds.push({ id: inserted[0].id, name: spec.name })
      console.log(`  + proyek baru: "${spec.name}" (${inserted[0].id})`)
    }

    // ── 2. kasbons pending, tersebar di proyek PM uji, nominal bervariasi ─
    const kasbonSpecs = [
      {
        purpose: `${TANDA} Kasbon PM uji — pembelian semen & pasir`,
        amount: 2500000,
        fund_source: 'owner_advance',
        project: projectIds[0],
        requestedBy: mandorRows[0].id,
      },
      {
        purpose: `${TANDA} Kasbon PM uji — upah mingguan tukang borongan`,
        amount: 7500000,
        fund_source: 'client_fund',
        project: projectIds[1] ?? projectIds[0],
        requestedBy: mandorRows[Math.min(1, mandorRows.length - 1)].id,
      },
      {
        purpose: `${TANDA} Kasbon PM uji — sewa alat bor & genset`,
        amount: 1200000,
        fund_source: 'owner_advance',
        project: projectIds[2] ?? projectIds[0],
        requestedBy: mandorRows[Math.min(2, mandorRows.length - 1)].id,
      },
      {
        purpose: `${TANDA} Kasbon PM uji — nominal besar untuk uji ambang`,
        amount: 15000000,
        fund_source: 'client_fund',
        project: projectIds[0],
        requestedBy: mandorRows[0].id,
      },
    ]

    for (const spec of kasbonSpecs) {
      const { rows: existing } = await client.query(
        `SELECT id FROM kasbons WHERE purpose = $1 AND requested_by = $2`,
        [spec.purpose, spec.requestedBy],
      )
      if (existing.length > 0) {
        console.log(`  = kasbon sudah ada: "${spec.purpose}" (${existing[0].id})`)
        continue
      }
      const { rows: inserted } = await client.query(
        `INSERT INTO kasbons
           (amount, fund_source, purpose, status, requested_by, project_id, company_id)
         VALUES ($1, $2, $3, 'pending', $4, $5, $6)
         RETURNING id`,
        [spec.amount, spec.fund_source, spec.purpose, spec.requestedBy, spec.project.id, companyId],
      )
      console.log(`  + kasbon pending baru: "${spec.purpose}" (${inserted[0].id}) di proyek "${spec.project.name}"`)
    }

    // ── 3. kasbon pending DI PROYEK BUKAN MILIK PM UJI (uji negatif filter) ─
    const kasbonLuarSpec = {
      purpose: `${TANDA} Kasbon PM LAIN — TIDAK BOLEH terlihat PM uji`,
      amount: 4000000,
      fund_source: 'owner_advance',
      requestedBy: mandorRows[0].id,
    }
    {
      const { rows: existing } = await client.query(
        `SELECT id FROM kasbons WHERE purpose = $1 AND requested_by = $2`,
        [kasbonLuarSpec.purpose, kasbonLuarSpec.requestedBy],
      )
      if (existing.length > 0) {
        console.log(`  = kasbon (proyek lain) sudah ada: "${kasbonLuarSpec.purpose}" (${existing[0].id})`)
      } else {
        const { rows: inserted } = await client.query(
          `INSERT INTO kasbons
             (amount, fund_source, purpose, status, requested_by, project_id, company_id)
           VALUES ($1, $2, $3, 'pending', $4, $5, $6)
           RETURNING id`,
          [kasbonLuarSpec.amount, kasbonLuarSpec.fund_source, kasbonLuarSpec.purpose,
            kasbonLuarSpec.requestedBy, proyekLain.id, companyId],
        )
        console.log(`  + kasbon pending baru (proyek LAIN, uji negatif): "${kasbonLuarSpec.purpose}" (${inserted[0].id}) di proyek "${proyekLain.name}"`)
      }
    }

    // ── 4. submittals diajukan, di proyek PM uji ──────────────────────────
    // submittal butuh: nomor, judul, jenis, status, diajukan_oleh, project_id.
    // status 'diajukan' mensyaratkan diajukan_pada terisi (chk submittal_diajukan_bertanggal).
    const submittalSpecs = [
      {
        nomor: `${TANDA}-SUB-PM-001`,
        judul: `${TANDA} Submittal PM uji — spesifikasi keramik lantai`,
        jenis: 'contoh_material',
        project: projectIds[0],
      },
      {
        nomor: `${TANDA}-SUB-PM-002`,
        judul: `${TANDA} Submittal PM uji — shop drawing atap baja ringan`,
        jenis: 'shop_drawing',
        project: projectIds[1] ?? projectIds[0],
      },
    ]

    // Verifikasi jenis yang valid di enum submittal_jenis sebelum insert —
    // menebak nilai enum sudah 2x membuang waktu di repo ini (lihat catatan
    // lib/inbox-approval.ts).
    const { rows: jenisEnumRows } = await client.query(
      `SELECT e.enumlabel FROM pg_type t
         JOIN pg_enum e ON e.enumtypid = t.oid
        WHERE t.typname = (
          SELECT udt_name FROM information_schema.columns
           WHERE table_schema='public' AND table_name='submittals' AND column_name='jenis'
        )`,
    )
    const jenisValid = new Set(jenisEnumRows.map((r) => r.enumlabel))
    console.log(`  jenis submittal valid: ${[...jenisValid].join(', ')}`)

    for (const spec of submittalSpecs) {
      if (!jenisValid.has(spec.jenis)) {
        console.log(`  ! jenis '${spec.jenis}' tidak ada di enum submittal_jenis — dilewati.`)
        continue
      }
      const { rows: existing } = await client.query(
        `SELECT id FROM submittals WHERE nomor = $1 AND project_id = $2`,
        [spec.nomor, spec.project.id],
      )
      if (existing.length > 0) {
        console.log(`  = submittal sudah ada: "${spec.judul}" (${existing[0].id})`)
        continue
      }
      const { rows: inserted } = await client.query(
        `INSERT INTO submittals
           (project_id, nomor, judul, jenis, status, diajukan_pada, diajukan_oleh)
         VALUES ($1, $2, $3, $4, 'diajukan', now(), $5)
         RETURNING id`,
        [spec.project.id, spec.nomor, spec.judul, spec.jenis, aktorId],
      )
      console.log(`  + submittal diajukan baru: "${spec.judul}" (${inserted[0].id}) di proyek "${spec.project.name}"`)
    }

    // ── 5. Verifikasi balik lewat DB ──────────────────────────────────────
    console.log('\n=== VERIFIKASI BALIK (DB) ===')

    const { rows: projCount } = await client.query(
      `SELECT count(*)::int AS n FROM projects WHERE pm_id = $1 AND is_deleted = false`,
      [PM_ID],
    )
    console.log(`projects milik PM uji: ${projCount[0].n}`)

    const { rows: kasbonPmCount } = await client.query(
      `SELECT count(*)::int AS n FROM kasbons k
         JOIN projects p ON p.id = k.project_id
        WHERE p.pm_id = $1 AND k.status = 'pending'`,
      [PM_ID],
    )
    console.log(`kasbons pending di proyek milik PM uji: ${kasbonPmCount[0].n}`)

    const { rows: kasbonLuarCount } = await client.query(
      `SELECT count(*)::int AS n FROM kasbons k
         JOIN projects p ON p.id = k.project_id
        WHERE p.company_id = $1 AND p.pm_id != $2 AND k.status = 'pending'
          AND k.purpose LIKE '${TANDA}%'`,
      [companyId, PM_ID],
    )
    console.log(`kasbons [UJI] pending di proyek BUKAN milik PM uji: ${kasbonLuarCount[0].n}`)

    const { rows: submittalCount } = await client.query(
      `SELECT count(*)::int AS n FROM submittals s
         JOIN projects p ON p.id = s.project_id
        WHERE p.pm_id = $1 AND s.status = 'diajukan'`,
      [PM_ID],
    )
    console.log(`submittals diajukan di proyek milik PM uji: ${submittalCount[0].n}`)

    const { rows: chainCheck } = await client.query(
      `SELECT entity_type, is_active FROM approval_chains
        WHERE company_id = $1 AND entity_type IN ('kasbon', 'submittal')`,
      [companyId],
    )
    console.log('approval_chains kasbon/submittal untuk company ini:', chainCheck)

    console.log('\nSelesai.')
  } finally {
    await client.end()
  }
}

main().catch((e) => {
  console.error('FATAL:', e)
  process.exit(1)
})
