import { createClient } from '@supabase/supabase-js'
import * as dotenv from 'dotenv'
import { readFileSync } from 'fs'

// Load env from apps/api/.env
const envContent = readFileSync('apps/api/.env', 'utf8')
const env = {}
for (const line of envContent.split('\n')) {
  const [k, ...v] = line.split('=')
  if (k && v.length) env[k.trim()] = v.join('=').trim()
}

const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SECRET_KEY)

async function main() {
  console.log('\n=== Simple table queries ===')

  const tables = [
    { name: 'projects', select: 'id, name, status, contract_value, progress_pct' },
    { name: 'invoices', select: 'id, invoice_number, status, amount_due, due_date' },
    { name: 'payments', select: 'id, amount_paid, paid_at' },
    { name: 'kasbons', select: 'id, amount, status, kasbon_date, purpose' },
    { name: 'mandor_assignments', select: 'id, status' },
    { name: 'work_scopes', select: 'id, scope_name, payment_system, status, progress_pct_done, assignment_id' },
    { name: 'milestones', select: 'id, title, status, target_date' },
    { name: 'progress_logs', select: 'id, pct_overall, logged_at' },
    { name: 'tax_records', select: 'id, tax_amount, status, period_month' },
  ]

  for (const t of tables) {
    const { data, error, count } = await supabase.from(t.name).select(t.select, { count: 'exact' }).limit(3)
    if (error) {
      console.log(`❌ ${t.name}: ERROR - ${error.message} (code: ${error.code})`)
    } else {
      console.log(`✅ ${t.name}: ${count ?? data?.length} rows total`)
      if (data?.length) console.log('   first row:', JSON.stringify(data[0]))
    }
  }

  console.log('\n=== FK join test: projects with clients ===')
  const { data: pWithC, error: e1 } = await supabase
    .from('projects')
    .select('id, name, clients!projects_client_id_fkey ( contact_person )')
    .limit(2)
  if (e1) console.log('❌ projects+clients join:', e1.message)
  else console.log('✅ projects+clients:', JSON.stringify(pWithC))

  console.log('\n=== FK join test: projects with pm (users) ===')
  const { data: pWithPm, error: e2 } = await supabase
    .from('projects')
    .select('id, name, pm:users!projects_pm_id_fkey ( name )')
    .limit(2)
  if (e2) console.log('❌ projects+pm join:', e2.message)
  else console.log('✅ projects+pm:', JSON.stringify(pWithPm))

  console.log('\n=== FK join test: kasbons with work_scopes ===')
  const { data: kWithWs, error: e3 } = await supabase
    .from('kasbons')
    .select('id, amount, work_scopes!kasbons_work_scope_id_fkey ( scope_name )')
    .limit(2)
  if (e3) console.log('❌ kasbons+work_scopes join:', e3.message)
  else console.log('✅ kasbons+work_scopes:', JSON.stringify(kWithWs))

  console.log('\n=== mandor_assignments FK join ===')
  const { data: ma, error: e4 } = await supabase
    .from('mandor_assignments')
    .select('id, status, mandor:users!mandor_id ( name ), projects!mandor_assignments_project_id_fkey ( name )')
    .limit(2)
  if (e4) console.log('❌ mandor_assignments join:', e4.message)
  else console.log('✅ mandor_assignments:', JSON.stringify(ma))

  console.log('\n=== invoices FK join ===')
  const { data: inv, error: e5 } = await supabase
    .from('invoices')
    .select('id, invoice_number, status, amount_due, projects!invoices_project_id_fkey ( name, clients!projects_client_id_fkey ( contact_person ) )')
    .in('status', ['sent', 'partial', 'overdue'])
    .limit(2)
  if (e5) console.log('❌ invoices join:', e5.message)
  else console.log('✅ invoices:', JSON.stringify(inv))
}

main().catch(console.error)
