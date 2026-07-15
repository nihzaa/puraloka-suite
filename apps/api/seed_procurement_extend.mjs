/**
 * Seed procurement extension — Puraloka Suite
 * Menambahkan: min_stock, supplier payment, PO cancelled, MR-005, stok reorder alerts
 * Jalankan SETELAH seed_procurement.mjs
 * Perintah: node seed_procurement_extend.mjs
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '.env') });

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SECRET_KEY
);

const ADMIN_ID = 'a0000000-0000-0000-0000-000000000001';
const PM1_ID   = 'a0000000-0000-0000-0000-000000000002';
const PM2_ID   = 'a0000000-0000-0000-0000-000000000003';
const P_ANDI   = 'c0000000-0000-0000-0000-000000000001';
const P_SARI   = 'c0000000-0000-0000-0000-000000000002';
const P_HENDRA = 'c0000000-0000-0000-0000-000000000003';

function log(msg) { console.log(`  ${msg}`); }

async function setMinStock() {
  log('Set min_stock pada material (untuk reorder alerts)...');

  // Ambil semua material
  const { data: mats } = await supabase.from('materials').select('id, code').order('code');
  const matMap = Object.fromEntries(mats.map(m => [m.code, m.id]));

  // Material dengan min_stock — stok proyek Andi akan di bawah threshold beberapa
  const minStocks = [
    { code: 'MAT-001', min_stock: 20 },   // Semen: stok 32, min 20 → aman
    { code: 'MAT-010', min_stock: 100 },  // Besi Ø10: stok 85, min 100 → REORDER
    { code: 'MAT-011', min_stock: 80 },   // Besi Ø12: stok 60, min 80 → REORDER
    { code: 'MAT-020', min_stock: 5 },    // Pasir pasang: stok 0, min 5 → REORDER
    { code: 'MAT-022', min_stock: 3 },    // Batu split: stok 0, min 3 → REORDER
    { code: 'MAT-050', min_stock: 30 },   // Keramik: stok 50, min 30 → aman
    { code: 'MAT-060', min_stock: 10 },   // Cat: stok 0 → REORDER
    { code: 'MAT-070', min_stock: 5 },    // Pipa 4": stok 0 → REORDER
    { code: 'MAT-002', min_stock: 2 },    // Beton readymix
    { code: 'MAT-030', min_stock: 500 },  // Bata merah
    { code: 'MAT-040', min_stock: 10 },   // Multiplek 9mm
  ];

  for (const item of minStocks) {
    if (!matMap[item.code]) continue;
    await supabase.from('materials').update({ min_stock: item.min_stock }).eq('id', matMap[item.code]);
  }
  log(`  → ${minStocks.length} material diset min_stock`);
}

async function addSupplierPayment() {
  log('Insert supplier payment untuk INV/MJ/2026/0321 (GR-001)...');

  // Ambil akun kas utama
  const { data: kasAccs } = await supabase.from('cash_accounts').select('id, name').limit(3);
  if (!kasAccs?.length) {
    log('  ⚠ Tidak ada akun kas — skip supplier payment');
    return;
  }
  const kasId = kasAccs[0].id;

  // Ambil supplier invoice yang sudah paid (GR-001)
  const { data: si1 } = await supabase.from('supplier_invoices')
    .select('id, total_amount, supplier_id')
    .eq('invoice_number', 'INV/MJ/2026/0321')
    .single();
  if (!si1) { log('  ⚠ Supplier invoice tidak ditemukan — skip'); return; }

  // Cek apakah sudah ada payment
  const { data: existPay } = await supabase.from('supplier_payments')
    .select('id').eq('notes', 'Pembayaran penuh GR-001 — Maju Jaya').limit(1);
  if (existPay?.length) { log('  → Payment sudah ada, skip'); return; }

  const { data: pay } = await supabase.from('supplier_payments').insert({
    supplier_id: si1.supplier_id,
    payment_date: '2026-04-03',
    amount: si1.total_amount,
    payment_method: 'transfer',
    reference_number: 'TF/BCA/20260403/001',
    cash_account_id: kasId,
    notes: 'Pembayaran penuh GR-001 — Maju Jaya',
    created_by: ADMIN_ID,
  }).select().single();

  if (pay) {
    // Alokasikan ke invoice
    await supabase.from('supplier_payment_allocations').insert({
      payment_id: pay.id,
      invoice_id: si1.id,
      amount: si1.total_amount,
    });
    log(`  → Payment Rp ${si1.total_amount.toLocaleString('id-ID')} ke Maju Jaya`);
  }
}

async function addPartialPaymentKeramik() {
  log('Insert supplier payment partial untuk KI/2026/0429 (GR-002)...');

  const { data: kasAccs } = await supabase.from('cash_accounts').select('id').limit(1);
  if (!kasAccs?.length) { log('  ⚠ Tidak ada akun kas — skip'); return; }

  const { data: si2 } = await supabase.from('supplier_invoices')
    .select('id, total_amount, supplier_id')
    .eq('invoice_number', 'KI/2026/0429')
    .single();
  if (!si2) { log('  ⚠ Invoice keramik tidak ditemukan — skip'); return; }

  const { data: existPay } = await supabase.from('supplier_payments')
    .select('id').eq('notes', 'DP keramik 50% — Toko Keramik Indah').limit(1);
  if (existPay?.length) { log('  → Payment DP sudah ada, skip'); return; }

  const dpAmount = Math.floor(si2.total_amount / 2);
  const { data: pay } = await supabase.from('supplier_payments').insert({
    supplier_id: si2.supplier_id,
    payment_date: '2026-05-01',
    amount: dpAmount,
    payment_method: 'transfer',
    reference_number: 'TF/BCA/20260501/002',
    cash_account_id: kasAccs[0].id,
    notes: 'DP keramik 50% — Toko Keramik Indah',
    created_by: ADMIN_ID,
  }).select().single();

  if (pay) {
    await supabase.from('supplier_payment_allocations').insert({
      payment_id: pay.id,
      invoice_id: si2.id,
      amount: dpAmount,
    });
    // Update invoice amount_paid
    await supabase.from('supplier_invoices').update({
      amount_paid: dpAmount,
      status: 'partial',
    }).eq('id', si2.id);
    log(`  → DP Rp ${dpAmount.toLocaleString('id-ID')} ke Keramik Indah`);
  }
}

async function addCancelledPO() {
  log('Insert PO-004 (cancelled — change of plan)...');

  // Cek apakah sudah ada
  const { data: exists } = await supabase.from('purchase_orders')
    .select('id').eq('po_number', 'PO-2026-004').limit(1);
  if (exists?.length) { log('  → PO-004 sudah ada, skip'); return; }

  // Ambil material & supplier
  const { data: mats } = await supabase.from('materials').select('id, code');
  const { data: sups } = await supabase.from('suppliers').select('id, code');
  const matMap = Object.fromEntries(mats.map(m => [m.code, m.id]));
  const supMap = Object.fromEntries(sups.map(s => [s.code, s.id]));

  const { data: po4, error: po4err } = await supabase.from('purchase_orders').insert({
    po_number: 'PO-2026-004', project_id: P_HENDRA, supplier_id: supMap['SUP-003'],
    created_by: PM2_ID, approved_by: ADMIN_ID,
    status: 'cancelled',
    order_date: '2026-05-10',
    expected_delivery_date: '2026-05-17', payment_terms: 'net_7',
    delivery_address: 'Jl. Cihampelas No. 45, Bandung',
    total_amount: 30 * 85000 + 20 * 120000,
    notes: 'Besi untuk pagar — dibatalkan: owner ganti spec ke hollow galvanis',
  }).select().single();

  if (po4err) { log(`  ⚠ PO-004 error: ${po4err.message}`); return; }
  if (po4) {
    await supabase.from('purchase_order_items').insert([
      { po_id: po4.id, material_id: matMap['MAT-010'], qty_ordered: 30, unit: 'batang', unit_price: 85000 },
      { po_id: po4.id, material_id: matMap['MAT-011'], qty_ordered: 20, unit: 'batang', unit_price: 120000 },
    ]);
    log(`  → PO-004 cancelled (Hendra, besi)`);
  }
}

async function addMR005() {
  log('Insert MR-005 (Andi, material tambahan, approved)...');

  const { data: exists } = await supabase.from('material_requests')
    .select('id').eq('mr_number', 'MR-2026-005').limit(1);
  if (exists?.length) { log('  → MR-005 sudah ada, skip'); return; }

  const { data: mats } = await supabase.from('materials').select('id, code');
  const matMap = Object.fromEntries(mats.map(m => [m.code, m.id]));

  const { data: mr5 } = await supabase.from('material_requests').insert({
    mr_number: 'MR-2026-005', project_id: P_ANDI, requested_by: PM1_ID,
    approved_by: ADMIN_ID, status: 'approved',
    request_date: '2026-05-20', needed_date: '2026-05-27',
    notes: 'Kebutuhan finishing: cat, keramik kamar mandi, pipa air bersih',
    approved_at: '2026-05-21T08:30:00+07:00',
  }).select().single();

  if (mr5) {
    await supabase.from('material_request_items').insert([
      { mr_id: mr5.id, material_id: matMap['MAT-060'], qty_requested: 20, qty_ordered: 0, unit: 'kaleng', unit_price_est: 185000 },
      { mr_id: mr5.id, material_id: matMap['MAT-051'], qty_requested: 25, qty_ordered: 0, unit: 'm²',    unit_price_est: 85000  },
      { mr_id: mr5.id, material_id: matMap['MAT-071'], qty_requested: 15, qty_ordered: 0, unit: 'batang',unit_price_est: 22000  },
      { mr_id: mr5.id, material_id: matMap['MAT-061'], qty_requested: 6,  qty_ordered: 0, unit: 'kaleng',unit_price_est: 95000  },
    ]);
    log(`  → MR-005 approved, 4 item (finishing Buah Batu)`);
  }
}

async function addMoreStockMovements() {
  log('Tambah stock movements untuk demo opname...');

  const { data: mats } = await supabase.from('materials').select('id, code');
  const matMap = Object.fromEntries(mats.map(m => [m.code, m.id]));

  // Cek apakah sudah ada opname movement
  const { data: existOpname } = await supabase.from('stock_movements')
    .select('id').eq('movement_type', 'opname').limit(1);
  if (existOpname?.length) { log('  → Opname movement sudah ada, skip'); return; }

  // Tambah movement: pemakaian lebih lanjut + 1 opname
  const movements = [
    // Pemakaian tambahan proyek Andi (setelah seed awal)
    {
      project_id: P_ANDI, material_id: matMap['MAT-001'],
      movement_type: 'usage', qty: -8, qty_before: 32, qty_after: 24,
      reference_type: 'manual', created_by: PM1_ID,
      notes: 'Pemakaian pengecoran kolom lt.3',
    },
    // Opname proyek Sari — koreksi stok keramik (kurang 2 m²)
    {
      project_id: P_SARI, material_id: matMap['MAT-050'],
      movement_type: 'adjustment', qty: -2, qty_before: 50, qty_after: 48,
      reference_type: 'manual', created_by: PM2_ID,
      notes: 'Opname mingguan — koreksi 2 m² pecah saat handling',
    },
    // Pemakaian keramik
    {
      project_id: P_SARI, material_id: matMap['MAT-050'],
      movement_type: 'usage', qty: -20, qty_before: 48, qty_after: 28,
      reference_type: 'manual', created_by: PM2_ID,
      notes: 'Pemasangan lantai ruang tamu',
    },
  ];

  const { error } = await supabase.from('stock_movements').insert(movements);
  if (error) { log(`  ⚠ ${error.message}`); return; }

  // Update stok aktual proyek
  await supabase.from('project_stocks')
    .update({ qty_on_hand: 24 })
    .match({ project_id: P_ANDI, material_id: matMap['MAT-001'] });
  await supabase.from('project_stocks')
    .update({ qty_on_hand: 28 })
    .match({ project_id: P_SARI, material_id: matMap['MAT-050'] });

  log(`  → ${movements.length} movements (pemakaian + opname)`);
}

async function main() {
  console.log('\n🔧  Extend Procurement Seed — Puraloka Suite\n');
  try {
    await setMinStock();
    await addSupplierPayment();
    await addPartialPaymentKeramik();
    await addCancelledPO();
    await addMR005();
    await addMoreStockMovements();

    console.log('\n✅ Extension selesai! Data tambahan:');
    console.log('   min_stock        : 11 material (beberapa trigger reorder alert)');
    console.log('   Supplier payments: 2 (1 lunas penuh, 1 DP 50%)');
    console.log('   PO cancelled     : PO-2026-004 (Hendra, besi)');
    console.log('   MR approved      : MR-2026-005 (Andi, finishing)');
    console.log('   Stock movements  : +3 (pemakaian lt.3 + opname keramik)');
    console.log('\n   Reorder alerts yang akan muncul:');
    console.log('   ⚠ Besi Ø10mm — stok 85 < min 100');
    console.log('   ⚠ Besi Ø12mm — stok 60 < min 80');
    console.log('   ⚠ Cat Dulux   — stok 0 < min 10');
  } catch (err) {
    console.error('\n❌ Error:', err.message);
    process.exit(1);
  }
}

main();
