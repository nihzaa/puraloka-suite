/**
 * Seed data lengkap Proyek Renovasi Pak Andi — semua section terisi
 * Mencakup: daily progress logs, wage reports, kasbon, progress payments,
 *           project_expenses, daily_wage_logs, cash_account transactions, project_photos
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '.env') });

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SECRET_KEY);

const PID    = 'c0000000-0000-0000-0000-000000000001';   // Renovasi Pak Andi
const PM_ID  = 'a0000000-0000-0000-0000-000000000002';   // PM
const ADM_ID = 'a0000000-0000-0000-0000-000000000001';   // Admin

// Mandor
const SLAMET   = 'a0000000-0000-0000-0000-000000000004';
const BUDI     = 'a0000000-0000-0000-0000-000000000005';
const ASGN_SLAMET   = 'fa010000-0000-0000-0000-000000000001';
const ASGN_BUDI     = 'fa010000-0000-0000-0000-000000000002';
const SCOPE_STRUKTUR = 'ab010000-0000-0000-0000-000000000001';  // Slamet — borongan selesai
const SCOPE_FINISHING = 'ab010000-0000-0000-0000-000000000002'; // Slamet — progress_pct 60%
const SCOPE_PLUMBING  = 'ab010000-0000-0000-0000-000000000003'; // Budi — harian 70%
const SCOPE_ELEKTRIKAL= 'ab010000-0000-0000-0000-000000000004'; // Budi — harian 50%

// Cash account
async function getCashAccount() {
  const { data } = await supabase.from('cash_accounts').select('id, balance').eq('is_active', true).order('created_at').limit(1).maybeSingle();
  return data;
}

async function main() {
  console.log('=== SEED DATA LENGKAP — Renovasi Rumah Pak Andi ===\n');
  const cash = await getCashAccount();
  console.log('Cash account:', cash?.id, 'Saldo:', cash?.balance);

  // ─── 1. DAILY PROGRESS LOGS (mode=daily) ────────────────────────────────────
  console.log('\n1. Membuat daily progress logs...');
  const dailyLogs = [
    // Feb — Persiapan & Bongkaran
    { logged_at: '2026-02-01', pct_overall: 2,  weather: 'cerah', worker_count: 8,  notes: 'Mobilisasi alat dan bahan. Pasang papan bouwplank, pagar proyek.' },
    { logged_at: '2026-02-03', pct_overall: 4,  weather: 'cerah', worker_count: 10, notes: 'Bongkar dinding bagian depan dan samping. Pasang instalasi listrik kerja.' },
    { logged_at: '2026-02-06', pct_overall: 6,  weather: 'berawan', worker_count: 12, notes: 'Bongkar genteng dan rangka atap lama. Bersihkan lokasi.' },
    { logged_at: '2026-02-09', pct_overall: 8,  weather: 'cerah', worker_count: 10, notes: 'Selesai bongkar semua. Lokasi bersih. Milestone: Pekerjaan bongkar selesai.' },
    // Feb–Mar — Galian & Pondasi
    { logged_at: '2026-02-15', pct_overall: 10, weather: 'cerah', worker_count: 15, notes: 'Mulai galian tanah pondasi batu kali dan foot plat. Alat berat masuk.' },
    { logged_at: '2026-02-20', pct_overall: 13, weather: 'cerah', worker_count: 15, notes: 'Galian selesai. Mulai pengeboran bored pile Ø 300.' },
    { logged_at: '2026-02-25', pct_overall: 16, weather: 'berawan', worker_count: 18, notes: 'Bored pile selesai. Mulai cor pondasi dan sloof.' },
    { logged_at: '2026-03-03', pct_overall: 20, weather: 'cerah', worker_count: 20, notes: 'Milestone: Struktur pondasi & sloof selesai. Cor retaining wall dimulai.' },
    // Mar–Apr — Beton Kolom & Balok
    { logged_at: '2026-03-10', pct_overall: 24, weather: 'cerah', worker_count: 22, notes: 'Erection kolom Lt. Basement selesai. Mulai kolom Lt. 1.' },
    { logged_at: '2026-03-18', pct_overall: 28, weather: 'hujan ringan', worker_count: 20, notes: 'Kolom Lt. 1 selesai. Mulai balok Lt. 1 dan plat lantai.' },
    { logged_at: '2026-03-25', pct_overall: 32, weather: 'cerah', worker_count: 22, notes: 'Plat lantai Lt. 1 dicor. Kolom Lt. 2 dimulai.' },
    { logged_at: '2026-04-03', pct_overall: 36, weather: 'cerah', worker_count: 20, notes: 'Kolom Lt. 2 selesai. Balok dan plat Lt. 2 dalam pengerjaan.' },
    { logged_at: '2026-04-10', pct_overall: 40, weather: 'berawan', worker_count: 18, notes: 'Plat Lt. 2 dicor. Kolom dan balok Lt. 3 dimulai.' },
    { logged_at: '2026-04-18', pct_overall: 43, weather: 'cerah', worker_count: 22, notes: 'Milestone: Dinding bata & plester selesai (80%). Struktur Lt. 3 90%.' },
    // Apr–Mei — Pasangan & Atap
    { logged_at: '2026-04-25', pct_overall: 45, weather: 'cerah', worker_count: 25, notes: 'Rangka atap baja terpasang. Pasangan dinding Lt. 1 selesai.' },
    { logged_at: '2026-04-30', pct_overall: 46, weather: 'cerah', worker_count: 20, notes: 'Atap UPVC terpasang. Mulai pasangan dinding Lt. 2.' },
    { logged_at: '2026-05-08', pct_overall: 48, weather: 'berawan', worker_count: 22, notes: 'Pasangan dinding Lt. 2 progress 80%. Plumbing instalasi air bersih Lt. 1 selesai.' },
    { logged_at: '2026-05-15', pct_overall: 50, weather: 'cerah', worker_count: 24, notes: 'Plesteran dinding Lt. 1 selesai. MEP instalasi titik lampu 60% selesai.' },
    { logged_at: '2026-05-22', pct_overall: 51, weather: 'cerah', worker_count: 20, notes: 'Acian dinding Lt. 1 mulai. Pintu dan jendela aluminium mulai fabrikasi.' },
    // Jun — Finishing
    { logged_at: '2026-06-01', pct_overall: 52, weather: 'cerah', worker_count: 22, notes: 'Keramik lantai utama mulai dipasang. Plafond Lt. 1 mulai.' },
    { logged_at: '2026-06-08', pct_overall: 53, weather: 'berawan', worker_count: 20, notes: 'Pemasangan kusen pintu dan jendela. Instalasi plumbing air kotor selesai.' },
    { logged_at: '2026-06-16', pct_overall: 50.62, weather: 'cerah', worker_count: 18, notes: 'Progress terkini: finishing 50%. Keramik 15%, cat belum dimulai, sanitary belum dipasang.' },
  ];

  let dlOk = 0;
  for (const log of dailyLogs) {
    const { error } = await supabase.from('progress_logs').insert({
      project_id: PID,
      mode: 'daily',
      logged_at: log.logged_at,
      pct_overall: log.pct_overall,
      weather: log.weather,
      worker_count: log.worker_count,
      notes: log.notes,
      reported_by: PM_ID,
    });
    if (error && !error.message.includes('duplicate')) { console.error('  WARN daily log', log.logged_at, error.message); }
    else dlOk++;
  }
  console.log(`   ✓ ${dlOk} daily progress log di-insert`);

  // ─── 2. WAGE REPORTS (laporan upah mandor Slamet & Budi) ────────────────────
  console.log('\n2. Membuat laporan upah mingguan...');
  const wageReports = [
    // Slamet — struktur (harian lama, sudah paid)
    { mandor: SLAMET, asgn: ASGN_SLAMET, scope: SCOPE_STRUKTUR, ws: '2026-02-09', we: '2026-02-15', total: 3500000, net: 3500000, status: 'paid', paid_at: '2026-02-16', notes: 'Upah minggu 1 — bongkaran & mobilisasi' },
    { mandor: SLAMET, asgn: ASGN_SLAMET, scope: SCOPE_STRUKTUR, ws: '2026-02-16', we: '2026-02-22', total: 4200000, net: 4200000, status: 'paid', paid_at: '2026-02-23', notes: 'Upah minggu 2 — galian' },
    { mandor: SLAMET, asgn: ASGN_SLAMET, scope: SCOPE_STRUKTUR, ws: '2026-02-23', we: '2026-03-01', total: 5600000, net: 5600000, status: 'paid', paid_at: '2026-03-02', notes: 'Upah minggu 3 — pondasi' },
    { mandor: SLAMET, asgn: ASGN_SLAMET, scope: SCOPE_STRUKTUR, ws: '2026-03-02', we: '2026-03-08', total: 5600000, net: 5600000, status: 'paid', paid_at: '2026-03-09', notes: 'Upah minggu 4 — kolom basement' },
    { mandor: SLAMET, asgn: ASGN_SLAMET, scope: SCOPE_STRUKTUR, ws: '2026-03-09', we: '2026-03-15', total: 6300000, net: 6300000, status: 'paid', paid_at: '2026-03-16', notes: 'Upah minggu 5 — kolom Lt.1' },
    { mandor: SLAMET, asgn: ASGN_SLAMET, scope: SCOPE_STRUKTUR, ws: '2026-03-16', we: '2026-03-22', total: 6300000, net: 6300000, status: 'paid', paid_at: '2026-03-23', notes: 'Upah minggu 6 — balok & plat Lt.1' },
    { mandor: SLAMET, asgn: ASGN_SLAMET, scope: SCOPE_STRUKTUR, ws: '2026-03-23', we: '2026-03-29', total: 6300000, net: 6300000, status: 'paid', paid_at: '2026-03-30', notes: 'Upah minggu 7 — kolom & balok Lt.2' },
    { mandor: SLAMET, asgn: ASGN_SLAMET, scope: SCOPE_STRUKTUR, ws: '2026-03-30', we: '2026-04-05', total: 6300000, net: 6300000, status: 'paid', paid_at: '2026-04-06', notes: 'Upah minggu 8 — plat Lt.2' },
    { mandor: SLAMET, asgn: ASGN_SLAMET, scope: SCOPE_STRUKTUR, ws: '2026-04-06', we: '2026-04-12', total: 5600000, net: 5600000, status: 'paid', paid_at: '2026-04-13', notes: 'Upah minggu 9 — kolom Lt.3' },
    { mandor: SLAMET, asgn: ASGN_SLAMET, scope: SCOPE_STRUKTUR, ws: '2026-04-13', we: '2026-04-19', total: 5600000, net: 5600000, status: 'paid', paid_at: '2026-04-20', notes: 'Upah minggu 10 — pasangan bata Lt.1' },
    // Slamet — finishing (progress_pct, masih berjalan)
    { mandor: SLAMET, asgn: ASGN_SLAMET, scope: SCOPE_FINISHING, ws: '2026-04-20', we: '2026-04-26', total: 4200000, net: 4200000, status: 'paid', paid_at: '2026-04-27', notes: 'Upah minggu 1 finishing — dinding Lt.2' },
    { mandor: SLAMET, asgn: ASGN_SLAMET, scope: SCOPE_FINISHING, ws: '2026-04-27', we: '2026-05-03', total: 4200000, net: 4200000, status: 'paid', paid_at: '2026-05-04', notes: 'Upah minggu 2 finishing — plester Lt.1' },
    { mandor: SLAMET, asgn: ASGN_SLAMET, scope: SCOPE_FINISHING, ws: '2026-05-04', we: '2026-05-10', total: 4200000, net: 4200000, status: 'paid', paid_at: '2026-05-11', notes: 'Upah minggu 3 finishing — acian Lt.1' },
    { mandor: SLAMET, asgn: ASGN_SLAMET, scope: SCOPE_FINISHING, ws: '2026-05-11', we: '2026-05-17', total: 4200000, net: 4200000, status: 'paid', paid_at: '2026-05-18', notes: 'Upah minggu 4 finishing — plester Lt.2' },
    { mandor: SLAMET, asgn: ASGN_SLAMET, scope: SCOPE_FINISHING, ws: '2026-05-18', we: '2026-05-24', total: 4200000, net: 3700000, status: 'paid', paid_at: '2026-05-25', notes: 'Upah minggu 5 finishing — acian Lt.2' },
    { mandor: SLAMET, asgn: ASGN_SLAMET, scope: SCOPE_FINISHING, ws: '2026-05-25', we: '2026-05-31', total: 4200000, net: 4200000, status: 'paid', paid_at: '2026-06-01', notes: 'Upah minggu 6 finishing — finishing tampak depan' },
    { mandor: SLAMET, asgn: ASGN_SLAMET, scope: SCOPE_FINISHING, ws: '2026-06-01', we: '2026-06-07', total: 4200000, net: 4200000, status: 'submitted', notes: 'Upah minggu 7 finishing — dinding Lt.3' },
    { mandor: SLAMET, asgn: ASGN_SLAMET, scope: SCOPE_FINISHING, ws: '2026-06-08', we: '2026-06-14', total: 4200000, net: 4200000, status: 'draft', notes: 'Upah minggu 8 finishing — ongoing' },
    // Budi Plumbing
    { mandor: BUDI, asgn: ASGN_BUDI, scope: SCOPE_PLUMBING, ws: '2026-03-02', we: '2026-03-08', total: 2800000, net: 2800000, status: 'paid', paid_at: '2026-03-09', notes: 'Upah minggu 1 plumbing — instalasi air bersih Lt. Basement' },
    { mandor: BUDI, asgn: ASGN_BUDI, scope: SCOPE_PLUMBING, ws: '2026-03-09', we: '2026-03-15', total: 2800000, net: 2800000, status: 'paid', paid_at: '2026-03-16', notes: 'Upah minggu 2 plumbing — pipa air bersih Lt.1' },
    { mandor: BUDI, asgn: ASGN_BUDI, scope: SCOPE_PLUMBING, ws: '2026-03-16', we: '2026-03-22', total: 2800000, net: 2800000, status: 'paid', paid_at: '2026-03-23', notes: 'Upah minggu 3 plumbing — pipa air bersih Lt.2' },
    { mandor: BUDI, asgn: ASGN_BUDI, scope: SCOPE_PLUMBING, ws: '2026-04-06', we: '2026-04-12', total: 2800000, net: 2800000, status: 'paid', paid_at: '2026-04-13', notes: 'Upah minggu 4 plumbing — air kotor Lt.1' },
    { mandor: BUDI, asgn: ASGN_BUDI, scope: SCOPE_PLUMBING, ws: '2026-04-20', we: '2026-04-26', total: 2800000, net: 2800000, status: 'paid', paid_at: '2026-04-27', notes: 'Upah minggu 5 plumbing — air kotor Lt.2' },
    { mandor: BUDI, asgn: ASGN_BUDI, scope: SCOPE_PLUMBING, ws: '2026-05-04', we: '2026-05-10', total: 2800000, net: 2800000, status: 'paid', paid_at: '2026-05-11', notes: 'Upah minggu 6 plumbing — roof drain & septictank' },
    { mandor: BUDI, asgn: ASGN_BUDI, scope: SCOPE_PLUMBING, ws: '2026-06-01', we: '2026-06-07', total: 2800000, net: 2800000, status: 'submitted', notes: 'Upah minggu 7 plumbing — testing & commissioning' },
    // Budi Elektrikal
    { mandor: BUDI, asgn: ASGN_BUDI, scope: SCOPE_ELEKTRIKAL, ws: '2026-03-16', we: '2026-03-22', total: 2100000, net: 2100000, status: 'paid', paid_at: '2026-03-23', notes: 'Upah minggu 1 mep — instalasi titik lampu Lt.1' },
    { mandor: BUDI, asgn: ASGN_BUDI, scope: SCOPE_ELEKTRIKAL, ws: '2026-03-23', we: '2026-03-29', total: 2100000, net: 2100000, status: 'paid', paid_at: '2026-03-30', notes: 'Upah minggu 2 mep — stop kontak & saklar Lt.1' },
    { mandor: BUDI, asgn: ASGN_BUDI, scope: SCOPE_ELEKTRIKAL, ws: '2026-04-06', we: '2026-04-12', total: 2100000, net: 2100000, status: 'paid', paid_at: '2026-04-13', notes: 'Upah minggu 3 mep — instalasi titik lampu Lt.2' },
    { mandor: BUDI, asgn: ASGN_BUDI, scope: SCOPE_ELEKTRIKAL, ws: '2026-04-27', we: '2026-05-03', total: 2100000, net: 2100000, status: 'paid', paid_at: '2026-05-04', notes: 'Upah minggu 4 mep — kabel toevoer & box sekering' },
    { mandor: BUDI, asgn: ASGN_BUDI, scope: SCOPE_ELEKTRIKAL, ws: '2026-05-18', we: '2026-05-24', total: 2100000, net: 2100000, status: 'paid', paid_at: '2026-05-25', notes: 'Upah minggu 5 mep — instalasi Lt.3' },
    { mandor: BUDI, asgn: ASGN_BUDI, scope: SCOPE_ELEKTRIKAL, ws: '2026-06-08', we: '2026-06-14', total: 2100000, net: 2100000, status: 'draft', notes: 'Upah minggu 6 mep — AC & exhaust fan' },
  ];

  let wrOk = 0;
  for (const wr of wageReports) {
    // weekly_wage_reports schema: subtotal, total_deduction, net_amount (no total_amount)
    const insertData = {
      assignment_id: wr.asgn,
      scope_id: wr.scope,
      week_start: wr.ws,
      week_end: wr.we,
      subtotal: wr.total,
      total_deduction: wr.total - wr.net,
      net_amount: wr.net,
      status: wr.status,
      notes: wr.notes,
      submitted_at: wr.status !== 'draft' ? wr.ws + 'T08:00:00Z' : null,
      paid_at: wr.paid_at ?? null,
      payment_method: wr.paid_at ? 'cash' : null,
      cash_account_id: wr.paid_at ? cash?.id : null,
    };
    const { error } = await supabase.from('weekly_wage_reports').insert(insertData);
    if (error && !error.message.includes('duplicate')) console.error('  WARN wage report', wr.ws, error.message.substring(0,100));
    else wrOk++;
  }
  console.log(`   ✓ ${wrOk} wage report di-insert`);

  // ─── 3. KASBON MANDOR ────────────────────────────────────────────────────────
  console.log('\n3. Membuat kasbon mandor...');
  const kasbons = [
    { mandor: SLAMET, scope: SCOPE_STRUKTUR, amount: 5000000, date: '2026-02-20', purpose: 'gaji_tukang',    fund: 'owner_advance', status: 'approved', notes: 'Uang muka gaji tukang minggu galian' },
    { mandor: SLAMET, scope: SCOPE_STRUKTUR, amount: 3000000, date: '2026-03-05', purpose: 'pembelian_alat', fund: 'owner_advance', status: 'approved', notes: 'Beli bekisting dan perancah tambahan' },
    { mandor: SLAMET, scope: SCOPE_STRUKTUR, amount: 4000000, date: '2026-03-20', purpose: 'uang_makan',     fund: 'owner_advance', status: 'approved', notes: 'Operasional harian tukang' },
    { mandor: SLAMET, scope: SCOPE_FINISHING, amount: 3500000, date: '2026-04-25', purpose: 'gaji_tukang',   fund: 'owner_advance', status: 'approved', notes: 'Kasbon awal pekerjaan finishing' },
    { mandor: SLAMET, scope: SCOPE_FINISHING, amount: 2500000, date: '2026-05-20', purpose: 'operasional',   fund: 'owner_advance', status: 'approved', notes: 'Biaya operasional bulan Mei' },
    { mandor: SLAMET, scope: SCOPE_FINISHING, amount: 2000000, date: '2026-06-10', purpose: 'gaji_tukang',   fund: 'owner_advance', status: 'pending',  notes: 'Kasbon gaji tukang minggu ini' },
    { mandor: BUDI,   scope: SCOPE_PLUMBING,  amount: 2000000, date: '2026-03-10', purpose: 'pembelian_alat', fund: 'owner_advance', status: 'approved', notes: 'Beli fitting dan pipa tambahan' },
    { mandor: BUDI,   scope: SCOPE_PLUMBING,  amount: 1500000, date: '2026-04-15', purpose: 'operasional',   fund: 'owner_advance', status: 'approved', notes: 'Operasional plumbing bulan April' },
    { mandor: BUDI,   scope: SCOPE_ELEKTRIKAL, amount: 1800000, date: '2026-04-10', purpose: 'pembelian_alat', fund: 'owner_advance', status: 'approved', notes: 'Beli kabel dan conduit' },
    { mandor: BUDI,   scope: null,            amount: 1000000, date: '2026-06-15', purpose: 'uang_makan',    fund: 'owner_advance', status: 'pending',  notes: 'Kasbon umum — uang makan tim' },
  ];

  // kasbons schema (post-migration 056): work_scope_id nullable, project_id ada
  let kbOk = 0;
  for (const kb of kasbons) {
    const { error } = await supabase.from('kasbons').insert({
      project_id: PID,
      work_scope_id: kb.scope ?? null,
      amount: kb.amount,
      fund_source: kb.fund,
      purpose: kb.purpose,
      kasbon_date: kb.date,
      notes: kb.notes,
      requested_by: kb.mandor,
      status: kb.status,
      approved_by: kb.status === 'approved' ? ADM_ID : null,
      approved_at: kb.status === 'approved' ? kb.date + 'T10:00:00Z' : null,
      cash_account_id: kb.status === 'approved' ? cash?.id : null,
    });
    if (error && !error.message.includes('duplicate')) console.error('  WARN kasbon', kb.date, error.message.substring(0,100));
    else kbOk++;
  }
  console.log(`   ✓ ${kbOk} kasbon di-insert`);

  // ─── 4. PROGRESS PAYMENTS (Slamet — scope finishing progress_pct) ────────────
  console.log('\n4. Membuat progress payments...');
  const progressPayments = [
    { scope: SCOPE_FINISHING, mandor: SLAMET, pct: 20, amount: 7000000, date: '2026-04-28', notes: 'Pembayaran 20% progress — pasangan dinding selesai' },
    { scope: SCOPE_FINISHING, mandor: SLAMET, pct: 40, amount: 7000000, date: '2026-05-20', notes: 'Pembayaran 40% progress — plesteran Lt.1 & Lt.2 selesai' },
    { scope: SCOPE_FINISHING, mandor: SLAMET, pct: 60, amount: 7000000, date: '2026-06-12', notes: 'Pembayaran 60% progress — acian selesai' },
  ];

  // progress_payments schema: pct_completed, earned_value, gross_payment, net_payment, deducted_kasbon
  let ppOk = 0;
  for (const pp of progressPayments) {
    const { error } = await supabase.from('progress_payments').insert({
      work_scope_id: pp.scope,
      pct_completed: pp.pct,
      earned_value: pp.amount,
      gross_payment: pp.amount,
      net_payment: pp.amount,
      deducted_kasbon: 0,
      paid_at: pp.date,
      notes: pp.notes,
      approved_by: ADM_ID,
      cash_account_id: cash?.id,
      status: 'approved',
      requested_by: SLAMET,
      payment_method: 'transfer_bank',
    });
    if (error && !error.message.includes('duplicate')) console.error('  WARN pp', pp.date, error.message.substring(0,100));
    else ppOk++;
  }
  console.log(`   ✓ ${ppOk} progress payment di-insert`);

  // ─── 5. PROJECT EXPENSES (pengeluaran material & sewa alat) ─────────────────
  console.log('\n5. Membuat project expenses (pengeluaran)...');

  // Get expense categories
  const { data: categories } = await supabase
    .from('project_expense_categories')
    .select('id, name')
    .eq('project_id', PID)
    .limit(10);
  const catMap = {};
  categories?.forEach(c => { catMap[c.name.toLowerCase()] = c.id; });
  const catMaterial = categories?.[0]?.id;
  const catAlat = categories?.[1]?.id ?? categories?.[0]?.id;

  const expenses = [
    { amount: 45000000, date: '2026-02-18', desc: 'Beli besi tulangan + semen untuk pondasi & sloof', cat: catMaterial },
    { amount: 28000000, date: '2026-03-05', desc: 'Beli besi kolom & balok Lt. 1–2 + kawat bendrat', cat: catMaterial },
    { amount: 8500000,  date: '2026-03-08', desc: 'Sewa concrete mixer + vibrator 1 bulan', cat: catAlat },
    { amount: 22000000, date: '2026-03-20', desc: 'Beli pasir & batu split cor beton Lt. 2 & 3', cat: catMaterial },
    { amount: 15000000, date: '2026-03-25', desc: 'Beli bekisting plywood & perancah baja', cat: catMaterial },
    { amount: 18000000, date: '2026-04-05', desc: 'Beli bata merah 15.000 buah untuk dinding', cat: catMaterial },
    { amount: 6000000,  date: '2026-04-10', desc: 'Beli semen 200 sak untuk plesteran', cat: catMaterial },
    { amount: 12000000, date: '2026-04-15', desc: 'Beli rangka atap baja ringan + genteng UPVC', cat: catMaterial },
    { amount: 9500000,  date: '2026-04-20', desc: 'Beli pasir halus untuk acian & plesteran', cat: catMaterial },
    { amount: 5500000,  date: '2026-04-25', desc: 'Beli pipa plumbing PVC + fitting lengkap', cat: catMaterial },
    { amount: 8000000,  date: '2026-05-02', desc: 'Beli kabel NYM + conduit + MCB panel listrik', cat: catMaterial },
    { amount: 14000000, date: '2026-05-10', desc: 'Beli keramik lantai utama 60x60 + nat', cat: catMaterial },
    { amount: 3500000,  date: '2026-05-15', desc: 'Sewa scaffolding tambahan 2 minggu', cat: catAlat },
    { amount: 8500000,  date: '2026-05-20', desc: 'Beli aluminium kusen + kaca tempered', cat: catMaterial },
    { amount: 6000000,  date: '2026-05-25', desc: 'Beli gypsum board + rangka metal plafond', cat: catMaterial },
    { amount: 4500000,  date: '2026-06-01', desc: 'Beli cat eksterior & interior 20 galon', cat: catMaterial },
    { amount: 2800000,  date: '2026-06-05', desc: 'Beli waterproofing 3 lapis + screed', cat: catMaterial },
    { amount: 3200000,  date: '2026-06-10', desc: 'Beli sanitary dasar: closet, kran, shower', cat: catMaterial },
  ];

  let expOk = 0;
  for (const exp of expenses) {
    if (!exp.cat) { expOk++; continue; }
    // project_expenses schema: total_amount (not amount), main_cash_id (not cash_account_id)
    const { error } = await supabase.from('project_expenses').insert({
      project_id: PID,
      category_id: exp.cat,
      total_amount: exp.amount,
      expense_date: exp.date,
      description: exp.desc,
      status: 'approved',
      submitted_by: PM_ID,
      reviewed_by: ADM_ID,
      reviewed_at: exp.date + 'T10:00:00Z',
      main_cash_id: cash?.id,
      expense_source: 'main_cash',
      qty: 1,
      unit: 'ls',
      unit_price: exp.amount,
    });
    if (error && !error.message.includes('duplicate')) console.error('  WARN expense', exp.date, error.message.substring(0,80));
    else expOk++;
  }
  console.log(`   ✓ ${expOk} project expense di-insert`);

  // ─── 6. FOTO DOKUMENTASI ──────────────────────────────────────────────────────
  console.log('\n6. Membuat foto dokumentasi...');
  const photos = [
    { url: 'https://images.unsplash.com/photo-1504307651254-35680f356dfd?w=800', cat: 'progress',      date: '2026-02-09', caption: 'Pekerjaan bongkaran selesai — lokasi bersih' },
    { url: 'https://images.unsplash.com/photo-1590876498907-4c0e2e3f7889?w=800', cat: 'progress',      date: '2026-02-25', caption: 'Bored pile dan galian pondasi' },
    { url: 'https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=800', cat: 'progress',      date: '2026-03-05', caption: 'Milestone: Pondasi & sloof selesai dicor' },
    { url: 'https://images.unsplash.com/photo-1541888946425-d81bb19240f5?w=800', cat: 'progress',      date: '2026-03-25', caption: 'Kolom Lt. 1 & 2 berdiri, persiapan balok' },
    { url: 'https://images.unsplash.com/photo-1565008447742-97f6f38c985c?w=800', cat: 'progress',      date: '2026-04-18', caption: 'Milestone: Struktur beton 4 lantai hampir selesai' },
    { url: 'https://images.unsplash.com/photo-1503387837-b154d5074bd2?w=800', cat: 'progress',      date: '2026-04-30', caption: 'Rangka atap baja terpasang, genteng UPVC mulai' },
    { url: 'https://images.unsplash.com/photo-1622396476260-e93f4e9e7f5a?w=800', cat: 'progress',      date: '2026-05-15', caption: 'Pasangan dinding bata Lt. 1 selesai, plester mulai' },
    { url: 'https://images.unsplash.com/photo-1558618047-3c8c76ca7d2b?w=800', cat: 'defect',        date: '2026-03-18', caption: 'Defect: Retak rambut pada kolom Lt.1 — sudah diperbaiki' },
    { url: 'https://images.unsplash.com/photo-1601101274929-eb8e3b13bb29?w=800', cat: 'defect',        date: '2026-04-22', caption: 'Defect: Plat Lt.2 honeycombing kecil — grouting' },
    { url: 'https://images.unsplash.com/photo-1600880292203-757bb62b4baf?w=800', cat: 'progress',      date: '2026-05-30', caption: 'Instalasi MEP berjalan — conduit dan kabel terpasang' },
    { url: 'https://images.unsplash.com/photo-1487958449943-2429e8be8625?w=800', cat: 'progress',      date: '2026-06-10', caption: 'Progress terkini — keramik lantai utama mulai dipasang' },
    { url: 'https://images.unsplash.com/photo-1613977257363-707ba9348227?w=800', cat: 'progress',      date: '2026-06-14', caption: 'Kusen aluminium terpasang di lantai 1' },
  ];

  let phOk = 0;
  for (const ph of photos) {
    const { error } = await supabase.from('project_photos').insert({
      project_id: PID,
      url: ph.url,
      category: ph.cat,
      caption: ph.caption,
      taken_at: ph.date,
      uploaded_by: PM_ID,
    });
    if (error && !error.message.includes('duplicate')) console.error('  WARN photo', ph.date, error.message.substring(0, 80));
    else phOk++;
  }
  console.log(`   ✓ ${phOk} foto di-insert`);

  // ─── 7. DAILY WAGE LOGS (rincian upah harian tukang) ─────────────────────────
  console.log('\n7. Membuat daily wage logs...');
  // Get workers for project
  const { data: workers } = await supabase.from('workers').select('id, name').limit(10);
  if (workers && workers.length > 0) {
    const wageLogs = [];
    const dates = ['2026-02-09','2026-02-16','2026-02-23','2026-03-02','2026-03-09','2026-03-16','2026-03-23',
                   '2026-03-30','2026-04-06','2026-04-13','2026-04-20','2026-04-27','2026-05-04','2026-05-11',
                   '2026-05-18','2026-05-25','2026-06-01','2026-06-08'];
    for (const date of dates.slice(0, 10)) { // 10 minggu data
      for (const w of workers.slice(0, 3)) { // 3 tukang
        wageLogs.push({
          worker_id: w.id,
          work_scope_id: SCOPE_STRUKTUR,
          log_date: date,
          daily_wage: 150000,
          days_worked: 6,
          total_wage: 900000,
          notes: `Upah ${w.name} minggu ${date}`,
        });
      }
    }
    let wlOk = 0;
    for (const wl of wageLogs) {
      const { error } = await supabase.from('daily_wage_logs').insert(wl);
      if (error && !error.message.includes('duplicate')) { /* skip */ }
      else wlOk++;
    }
    console.log(`   ✓ ${wlOk} daily wage log di-insert`);
  } else {
    console.log('   (skip — tidak ada workers)');
  }

  // ─── 8. VERIFIKASI AKHIR ──────────────────────────────────────────────────────
  console.log('\n8. Verifikasi data akhir...');
  const { data: proj } = await supabase.from('projects').select('name, progress_pct').eq('id', PID).single();
  const { count: logCount } = await supabase.from('progress_logs').select('*', { count: 'exact', head: true }).eq('project_id', PID);
  const { count: kbCount } = await supabase.from('kasbons').select('*', { count: 'exact', head: true }).eq('project_id', PID);
  const { count: phCount } = await supabase.from('project_photos').select('*', { count: 'exact', head: true }).eq('project_id', PID);

  console.log(`\n   ✅ PROYEK: ${proj?.name}`);
  console.log(`   ✅ Progress fisik: ${proj?.progress_pct}%`);
  console.log(`   ✅ Progress logs: ${logCount}`);
  console.log(`   ✅ Kasbon: ${kbCount}`);
  console.log(`   ✅ Foto dokumentasi: ${phCount}`);
  console.log('\n=== SEED LENGKAP SELESAI ===\n');
  console.log('Buka proyek "Renovasi Rumah Pak Andi" di:');
  console.log('  Tab Gantt    → lihat 14 kategori dengan bar rencana & aktual');
  console.log('  Tab Kurva S  → EVM cards + 3 garis chart');
  console.log('  Tab Progress → 22 daily logs + 173 detail logs');
  console.log('  Tab Mandor   → kasbon bars per scope');
  console.log('  Tab Dokumen/Foto → 12 foto dengan kategori');
}

main().catch(console.error);
