import type { Client } from 'pg'

// Task 1.3.1 — helper seed data minimal untuk integration test golden path.
// Dipakai bersama di 1.3.1 (kasbon)/1.3.2 (CO)/1.3.3 (procurement) — pola
// seed sama, tabel dasar (users/clients/projects/mandor_assignments/
// work_scopes) dibutuhkan seluruh Feature 1.3, bukan spesifik kasbon saja.

export interface SeedProjectContext {
  adminId: string
  pmId: string
  mandorId: string
  clientId: string
  projectId: string
  assignmentId: string
  workScopeId: string
}

/**
 * Seed minimal: 1 admin, 1 PM, 1 mandor, 1 client, 1 project, 1 mandor
 * assignment aktif, 1 work scope aktif. Cukup untuk golden path kasbon
 * (ajukan sebagai mandor, approve sebagai PM/admin).
 */
export async function seedProjectContext(client: Client): Promise<SeedProjectContext> {
  // Sub-Fase 1B.4 CONTRACT: users.role enum di-drop; role via FK role_id.
  const { rows: adminRows } = await client.query(
    `INSERT INTO users (name, email, role_id) VALUES ('Admin Test', 'admin-test@puraloka.test', (SELECT id FROM roles WHERE name='admin')) RETURNING id`
  )
  const adminId = adminRows[0].id

  const { rows: pmRows } = await client.query(
    `INSERT INTO users (name, email, role_id) VALUES ('PM Test', 'pm-test@puraloka.test', (SELECT id FROM roles WHERE name='pm')) RETURNING id`
  )
  const pmId = pmRows[0].id

  const { rows: mandorRows } = await client.query(
    `INSERT INTO users (name, email, role_id) VALUES ('Mandor Test', 'mandor-test@puraloka.test', (SELECT id FROM roles WHERE name='mandor')) RETURNING id`
  )
  const mandorId = mandorRows[0].id

  const { rows: clientRows } = await client.query(
    `INSERT INTO clients (contact_person, phone, created_by) VALUES ('Client Test', '081234567890', $1) RETURNING id`,
    [adminId]
  )
  const clientId = clientRows[0].id

  const { rows: projectRows } = await client.query(
    `INSERT INTO projects (client_id, pm_id, name, location, start_date, end_date, created_by)
     VALUES ($1, $2, 'Proyek Test', 'Bandung', CURRENT_DATE, CURRENT_DATE + INTERVAL '90 days', $3)
     RETURNING id`,
    [clientId, pmId, adminId]
  )
  const projectId = projectRows[0].id

  const { rows: assignmentRows } = await client.query(
    `INSERT INTO mandor_assignments (project_id, mandor_id, assigned_by, status)
     VALUES ($1, $2, $3, 'active') RETURNING id`,
    [projectId, mandorId, adminId]
  )
  const assignmentId = assignmentRows[0].id

  const { rows: scopeRows } = await client.query(
    `INSERT INTO work_scopes (assignment_id, scope_name, payment_system, status)
     VALUES ($1, 'Pekerjaan Test', 'harian', 'active') RETURNING id`,
    [assignmentId]
  )
  const workScopeId = scopeRows[0].id

  return { adminId, pmId, mandorId, clientId, projectId, assignmentId, workScopeId }
}
