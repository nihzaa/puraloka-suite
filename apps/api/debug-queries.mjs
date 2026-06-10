import { createClient } from '@supabase/supabase-js'
import { config } from 'dotenv'

config()

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SECRET_KEY)

async function main() {
  console.log('=== Checking with service role (should bypass RLS) ===')

  // Simple project query - same as dashboard
  const { data: proj, error: pe } = await supabase
    .from('projects')
    .select('id, name, status, contract_value, progress_pct, location, end_date')
    .order('created_at', { ascending: false })
  console.log('projects count:', proj?.length, 'error:', pe?.message ?? null)
  if (proj?.length) console.log('first project:', JSON.stringify(proj[0]))

  // Check active projects specifically
  const active = (proj ?? []).filter(p => p.status === 'active')
  console.log('active projects:', active.length)
  const totalCV = active.reduce((s, p) => s + Number(p.contract_value ?? 0), 0)
  console.log('total_contract_value:', totalCV)

  // Invoices - check what statuses exist
  const { data: allInv, error: ie } = await supabase
    .from('invoices')
    .select('id, invoice_number, status, amount_due, due_date')
  console.log('\nAll invoices:', allInv?.length, 'error:', ie?.message ?? null)
  const byStatus = {}
  for (const inv of allInv ?? []) {
    byStatus[inv.status] = (byStatus[inv.status] ?? 0) + 1
  }
  console.log('Invoice statuses:', byStatus)
  const outstanding = (allInv ?? []).filter(i => ['sent','partial','overdue'].includes(i.status))
  console.log('Outstanding invoices:', outstanding.length, 'total amount_due:', outstanding.reduce((s,i) => s + Number(i.amount_due ?? 0), 0))

  // Payments - check date range
  const { data: pays, error: pye } = await supabase
    .from('payments')
    .select('id, amount_paid, paid_at')
  console.log('\nAll payments:', pays?.length, 'error:', pye?.message ?? null)
  const dates = (pays ?? []).map(p => p.paid_at).sort()
  console.log('Payment date range:', dates[0], 'to', dates[dates.length-1])
  console.log('Total paid (all time):', (pays ?? []).reduce((s,p) => s + Number(p.amount_paid ?? 0), 0))

  // Kasbons - check statuses
  const { data: kabs, error: ke } = await supabase
    .from('kasbons')
    .select('id, amount, status, kasbon_date')
  console.log('\nAll kasbons:', kabs?.length, 'error:', ke?.message ?? null)
  const kByStatus = {}
  for (const k of kabs ?? []) {
    kByStatus[k.status] = (kByStatus[k.status] ?? 0) + 1
  }
  console.log('Kasbon statuses:', kByStatus)
  const dates2 = (kabs ?? []).map(k => k.kasbon_date).sort()
  console.log('Kasbon date range:', dates2[0], 'to', dates2[dates2.length-1])
  const activeKasbons = (kabs ?? []).filter(k => ['pending','approved'].includes(k.status))
  console.log('Active kasbons (pending+approved):', activeKasbons.length, 'total:', activeKasbons.reduce((s,k) => s + Number(k.amount ?? 0), 0))

  // Mandor assignments
  const { data: ma, error: mae } = await supabase
    .from('mandor_assignments')
    .select('id, status')
  console.log('\nAll mandor_assignments:', ma?.length, 'error:', mae?.message ?? null)
  const maByStatus = {}
  for (const m of ma ?? []) maByStatus[m.status] = (maByStatus[m.status] ?? 0) + 1
  console.log('Mandor assignment statuses:', maByStatus)
}

main().catch(console.error)
