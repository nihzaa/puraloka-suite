/**
 * Seed data procurement — Puraloka Suite
 * Membuat: supplier, material, MR, PO, GR, stok, hutang supplier
 * Jalankan: node seed_procurement.mjs (dari apps/api directory)
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

// ─── IDs tetap (dari seed utama) ─────────────────────────────────────────────
const ADMIN_ID = 'a0000000-0000-0000-0000-000000000001';
const PM1_ID   = 'a0000000-0000-0000-0000-000000000002'; // Rizky
const PM2_ID   = 'a0000000-0000-0000-0000-000000000003'; // Dinda

const P_ANDI   = 'c0000000-0000-0000-0000-000000000001'; // Renovasi Buah Batu
const P_SARI   = 'c0000000-0000-0000-0000-000000000002'; // Pembangunan Dago
const P_HENDRA = 'c0000000-0000-0000-0000-000000000003'; // Renovasi Cihampelas

function log(msg) { console.log(`  ${msg}`); }

async function cleanup() {
  log('Cleanup data procurement lama...');
  // Hapus urutan FK reverse
  await supabase.from('stock_movements').delete().neq('id', '00000000-0000-0000-0000-000000000000');
  await supabase.from('project_stocks').delete().neq('id', '00000000-0000-0000-0000-000000000000');
  await supabase.from('supplier_payment_allocations').delete().neq('id', '00000000-0000-0000-0000-000000000000');
  await supabase.from('supplier_payments').delete().neq('id', '00000000-0000-0000-0000-000000000000');
  await supabase.from('supplier_invoices').delete().neq('id', '00000000-0000-0000-0000-000000000000');
  await supabase.from('goods_receipt_items').delete().neq('id', '00000000-0000-0000-0000-000000000000');
  await supabase.from('goods_receipts').delete().neq('id', '00000000-0000-0000-0000-000000000000');
  await supabase.from('purchase_order_items').delete().neq('id', '00000000-0000-0000-0000-000000000000');
  await supabase.from('purchase_orders').delete().neq('id', '00000000-0000-0000-0000-000000000000');
  await supabase.from('material_request_items').delete().neq('id', '00000000-0000-0000-0000-000000000000');
  await supabase.from('material_requests').delete().neq('id', '00000000-0000-0000-0000-000000000000');
  await supabase.from('materials').delete().neq('id', '00000000-0000-0000-0000-000000000000');
  await supabase.from('material_categories').delete().neq('id', '00000000-0000-0000-0000-000000000000');
  await supabase.from('suppliers').delete().neq('id', '00000000-0000-0000-0000-000000000000');
  log('Cleanup selesai.');
}

async function seedCategories() {
  log('Insert material categories...');
  const { data, error } = await supabase.from('material_categories').insert([
    { name: 'Beton & Semen',   description: 'Semen, beton siap pakai, mortar', sort_order: 1 },
    { name: 'Besi & Baja',     description: 'Besi beton, besi hollow, plat baja, wire mesh', sort_order: 2 },
    { name: 'Pasir & Batu',    description: 'Pasir pasang, pasir cor, batu split, sirtu', sort_order: 3 },
    { name: 'Bata & Blok',     description: 'Bata merah, batako, hebel/AAC', sort_order: 4 },
    { name: 'Kayu & Plywood',  description: 'Kayu bekisting, multiplek, dolken', sort_order: 5 },
    { name: 'Keramik & Granit',description: 'Keramik lantai, keramik dinding, granit', sort_order: 6 },
    { name: 'Cat & Pelapis',   description: 'Cat tembok, cat kayu, waterproofing', sort_order: 7 },
    { name: 'Sanitary',        description: 'Kloset, wastafel, shower, aksesoris KM', sort_order: 8 },
    { name: 'Pipa & Plumbing', description: 'Pipa PVC, fitting, stop kran, gate valve', sort_order: 9 },
    { name: 'Listrik & MEP',   description: 'Kabel, saklar, stop kontak, panel listrik', sort_order: 10 },
  ]).select();
  if (error) throw new Error(`categories: ${error.message}`);
  log(`  → ${data.length} kategori`);
  return Object.fromEntries(data.map(c => [c.name, c.id]));
}

async function seedSuppliers() {
  log('Insert suppliers...');
  const { data, error } = await supabase.from('suppliers').insert([
    {
      code: 'SUP-001', name: 'Toko Bangunan Maju Jaya', contact_person: 'Pak Surya',
      phone: '081234567890', email: 'majujaya@gmail.com', city: 'Bandung',
      address: 'Jl. Soekarno-Hatta No. 45, Bandung',
      payment_terms: 'net_14', credit_limit: 100000000, created_by: ADMIN_ID,
    },
    {
      code: 'SUP-002', name: 'CV Sinar Abadi Beton', contact_person: 'Bu Wulan',
      phone: '082233445566', email: 'sinarabadi@gmail.com', city: 'Bandung',
      address: 'Jl. Kiaracondong No. 12, Bandung',
      payment_terms: 'cod', created_by: ADMIN_ID,
    },
    {
      code: 'SUP-003', name: 'UD Besi Kuat Mandiri', contact_person: 'Pak Rahmat',
      phone: '083344556677', city: 'Bandung',
      address: 'Jl. Industri No. 78, Bandung',
      payment_terms: 'net_7', credit_limit: 50000000, created_by: ADMIN_ID,
    },
    {
      code: 'SUP-004', name: 'Toko Keramik Indah', contact_person: 'Bu Santi',
      phone: '084455667788', email: 'keramikindah@gmail.com', city: 'Bandung',
      address: 'Jl. Otista No. 33, Bandung',
      payment_terms: 'net_14', credit_limit: 30000000, created_by: ADMIN_ID,
    },
    {
      code: 'SUP-005', name: 'PT Wahana Cat & Material', contact_person: 'Pak Deni',
      phone: '085566778899', email: 'wahanacat@yahoo.com', city: 'Bandung',
      address: 'Jl. Gatot Subroto No. 99, Bandung',
      payment_terms: 'net_30', credit_limit: 20000000, created_by: ADMIN_ID,
    },
  ]).select();
  if (error) throw new Error(`suppliers: ${error.message}`);
  log(`  → ${data.length} supplier`);
  return data;
}

async function seedMaterials(catIds) {
  log('Insert materials...');
  const mats = [
    // Beton & Semen
    { code: 'MAT-001', name: 'Semen Portland 50kg', unit: 'sak',    unit_price: 65000,  category: 'Beton & Semen' },
    { code: 'MAT-002', name: 'Beton Siap Pakai K-250', unit: 'm³', unit_price: 1050000, category: 'Beton & Semen' },
    { code: 'MAT-003', name: 'Mortar Instan 40kg',     unit: 'sak', unit_price: 80000,  category: 'Beton & Semen' },
    // Besi & Baja
    { code: 'MAT-010', name: 'Besi Beton Ø10mm SNI',  unit: 'batang', unit_price: 85000,  category: 'Besi & Baja' },
    { code: 'MAT-011', name: 'Besi Beton Ø12mm SNI',  unit: 'batang', unit_price: 120000, category: 'Besi & Baja' },
    { code: 'MAT-012', name: 'Besi Hollow 40×40×2mm', unit: 'batang', unit_price: 95000,  category: 'Besi & Baja' },
    { code: 'MAT-013', name: 'Wire Mesh M6 2.1×5.4m', unit: 'lembar',unit_price: 275000, category: 'Besi & Baja' },
    // Pasir & Batu
    { code: 'MAT-020', name: 'Pasir Pasang',  unit: 'm³', unit_price: 185000, category: 'Pasir & Batu' },
    { code: 'MAT-021', name: 'Pasir Cor',     unit: 'm³', unit_price: 210000, category: 'Pasir & Batu' },
    { code: 'MAT-022', name: 'Batu Split 2/3', unit: 'm³',unit_price: 250000, category: 'Pasir & Batu' },
    // Bata & Blok
    { code: 'MAT-030', name: 'Bata Merah',    unit: 'buah', unit_price: 800,    category: 'Bata & Blok' },
    { code: 'MAT-031', name: 'Batako Pres',   unit: 'buah', unit_price: 2500,   category: 'Bata & Blok' },
    { code: 'MAT-032', name: 'Hebel AAC 10cm', unit: 'buah', unit_price: 9500,  category: 'Bata & Blok' },
    // Kayu & Plywood
    { code: 'MAT-040', name: 'Multiplek 9mm', unit: 'lembar', unit_price: 165000, category: 'Kayu & Plywood' },
    { code: 'MAT-041', name: 'Multiplek 18mm',unit: 'lembar', unit_price: 310000, category: 'Kayu & Plywood' },
    { code: 'MAT-042', name: 'Kayu Bekisting 5/7',unit: 'm³', unit_price: 4200000, category: 'Kayu & Plywood' },
    // Keramik & Granit
    { code: 'MAT-050', name: 'Keramik Lantai 60×60cm Polos', unit: 'm²', unit_price: 115000, category: 'Keramik & Granit' },
    { code: 'MAT-051', name: 'Keramik Dinding 25×40cm',      unit: 'm²', unit_price: 85000,  category: 'Keramik & Granit' },
    { code: 'MAT-052', name: 'Granit 60×60cm Premium',       unit: 'm²', unit_price: 240000, category: 'Keramik & Granit' },
    // Cat & Pelapis
    { code: 'MAT-060', name: 'Cat Tembok Dulux 5L',   unit: 'kaleng', unit_price: 185000, category: 'Cat & Pelapis' },
    { code: 'MAT-061', name: 'Waterproofing Aquaproof 4kg', unit: 'kaleng', unit_price: 95000, category: 'Cat & Pelapis' },
    // Pipa & Plumbing
    { code: 'MAT-070', name: 'Pipa PVC 4" AW',  unit: 'batang', unit_price: 55000, category: 'Pipa & Plumbing' },
    { code: 'MAT-071', name: 'Pipa PVC 3/4" AW', unit: 'batang', unit_price: 22000, category: 'Pipa & Plumbing' },
  ];

  const { data, error } = await supabase.from('materials').insert(
    mats.map(m => ({
      code: m.code, name: m.name, unit: m.unit, unit_price: m.unit_price,
      category_id: catIds[m.category],
      is_active: true, created_by: ADMIN_ID,
    }))
  ).select();
  if (error) throw new Error(`materials: ${error.message}`);
  log(`  → ${data.length} material`);
  return data;
}

async function seedProcurementFlow(suppliers, materials) {
  const supMap = Object.fromEntries(suppliers.map(s => [s.code, s.id]));
  const matMap = Object.fromEntries(materials.map(m => [m.code, m.id]));

  // ─── Material Request 1 — Proyek Andi (approved → PO → GR) ────────────────
  log('Insert MR-001 (Andi, approved)...');
  const { data: mr1 } = await supabase.from('material_requests').insert({
    mr_number: 'MR-2026-001', project_id: P_ANDI, requested_by: PM1_ID,
    approved_by: ADMIN_ID, status: 'fully_ordered',
    request_date: '2026-03-15', needed_date: '2026-03-22',
    notes: 'Kebutuhan semen dan besi untuk pekerjaan struktur lantai 2',
    approved_at: '2026-03-16T09:00:00+07:00',
  }).select().single();

  await supabase.from('material_request_items').insert([
    { mr_id: mr1.id, material_id: matMap['MAT-001'], qty_requested: 80,  qty_ordered: 80,  unit: 'sak', unit_price_est: 65000 },
    { mr_id: mr1.id, material_id: matMap['MAT-010'], qty_requested: 200, qty_ordered: 200, unit: 'batang', unit_price_est: 85000 },
    { mr_id: mr1.id, material_id: matMap['MAT-011'], qty_requested: 150, qty_ordered: 150, unit: 'batang', unit_price_est: 120000 },
  ]);

  // ─── PO-001 (dari MR-001) ──────────────────────────────────────────────────
  log('Insert PO-001 (fully_received)...');
  const { data: po1 } = await supabase.from('purchase_orders').insert({
    po_number: 'PO-2026-001', project_id: P_ANDI, supplier_id: supMap['SUP-001'],
    mr_id: mr1.id, created_by: PM1_ID, approved_by: ADMIN_ID,
    status: 'fully_received', order_date: '2026-03-17',
    expected_delivery_date: '2026-03-21', payment_terms: 'net_14',
    delivery_address: 'Jl. Buah Batu No. 12, Bandung',
    total_amount: 80*65000 + 200*85000 + 150*120000,
    notes: 'Pengiriman langsung ke site, konfirmasi H-1',
  }).select().single();

  const poi1Res = await supabase.from('purchase_order_items').insert([
    { po_id: po1.id, material_id: matMap['MAT-001'], qty_ordered: 80,  unit: 'sak',    unit_price: 65000  },
    { po_id: po1.id, material_id: matMap['MAT-010'], qty_ordered: 200, unit: 'batang', unit_price: 85000  },
    { po_id: po1.id, material_id: matMap['MAT-011'], qty_ordered: 150, unit: 'batang', unit_price: 120000 },
  ]).select();
  if (poi1Res.error) throw new Error(`poi1: ${poi1Res.error.message}`);
  const poi1 = poi1Res.data;

  // ─── GR-001 (dari PO-001, fully received) ─────────────────────────────────
  log('Insert GR-001 (confirmed)...');
  const { data: gr1 } = await supabase.from('goods_receipts').insert({
    gr_number: 'GR-2026-001', project_id: P_ANDI, po_id: po1.id,
    supplier_id: supMap['SUP-001'], received_by: PM1_ID,
    status: 'confirmed', receipt_date: '2026-03-21',
    notes: 'Material tiba sesuai pesanan, kondisi baik',
  }).select().single();

  await supabase.from('goods_receipt_items').insert([
    { gr_id: gr1.id, material_id: matMap['MAT-001'], po_item_id: poi1[0].id, qty_received: 80,  unit: 'sak',    unit_price: 65000  },
    { gr_id: gr1.id, material_id: matMap['MAT-010'], po_item_id: poi1[1].id, qty_received: 200, unit: 'batang', unit_price: 85000  },
    { gr_id: gr1.id, material_id: matMap['MAT-011'], po_item_id: poi1[2].id, qty_received: 150, unit: 'batang', unit_price: 120000 },
  ]);

  // Insert supplier invoice untuk GR-001
  const { data: si1 } = await supabase.from('supplier_invoices').insert({
    supplier_id: supMap['SUP-001'], project_id: P_ANDI,
    goods_receipt_id: gr1.id,
    invoice_number: 'INV/MJ/2026/0321',
    invoice_date: '2026-03-21', due_date: '2026-04-04',
    total_amount: 80*65000 + 200*85000 + 150*120000,
    amount_paid: 80*65000 + 200*85000 + 150*120000,
    status: 'paid', description: 'Semen + Besi beton untuk proyek Buah Batu',
    created_by: ADMIN_ID,
  }).select().single();

  // ─── Material Request 2 — Proyek Sari (submitted, menunggu) ───────────────
  log('Insert MR-002 (Sari, submitted)...');
  const { data: mr2 } = await supabase.from('material_requests').insert({
    mr_number: 'MR-2026-002', project_id: P_SARI, requested_by: PM1_ID,
    status: 'submitted', request_date: '2026-04-10', needed_date: '2026-04-17',
    notes: 'Kebutuhan pasir dan batu split untuk pengecoran pondasi',
  }).select().single();

  await supabase.from('material_request_items').insert([
    { mr_id: mr2.id, material_id: matMap['MAT-020'], qty_requested: 15,  qty_ordered: 0, unit: 'm³', unit_price_est: 185000 },
    { mr_id: mr2.id, material_id: matMap['MAT-022'], qty_requested: 10,  qty_ordered: 0, unit: 'm³', unit_price_est: 250000 },
    { mr_id: mr2.id, material_id: matMap['MAT-001'], qty_requested: 120, qty_ordered: 0, unit: 'sak', unit_price_est: 65000 },
  ]);

  // ─── Material Request 3 — Proyek Sari (approved → PO confirmed, belum GR) ─
  log('Insert MR-003 (Sari, keramik, partially_ordered)...');
  const { data: mr3 } = await supabase.from('material_requests').insert({
    mr_number: 'MR-2026-003', project_id: P_SARI, requested_by: PM2_ID,
    approved_by: ADMIN_ID, status: 'partially_ordered',
    request_date: '2026-04-20', needed_date: '2026-05-01',
    notes: 'Keramik lantai ruang tamu dan kamar tidur',
    approved_at: '2026-04-21T10:00:00+07:00',
  }).select().single();

  await supabase.from('material_request_items').insert([
    { mr_id: mr3.id, material_id: matMap['MAT-050'], qty_requested: 85, qty_ordered: 85, unit: 'm²', unit_price_est: 115000 },
    { mr_id: mr3.id, material_id: matMap['MAT-051'], qty_requested: 30, qty_ordered: 0,  unit: 'm²', unit_price_est: 85000 },
  ]);

  // PO-002 (dari MR-003, keramik lantai)
  log('Insert PO-002 (Sari, keramik, confirmed)...');
  const { data: po2 } = await supabase.from('purchase_orders').insert({
    po_number: 'PO-2026-002', project_id: P_SARI, supplier_id: supMap['SUP-004'],
    mr_id: mr3.id, created_by: PM2_ID, approved_by: ADMIN_ID,
    status: 'confirmed', order_date: '2026-04-22',
    expected_delivery_date: '2026-04-30', payment_terms: 'net_14',
    delivery_address: 'Jl. Dago Atas No. 5, Bandung',
    total_amount: 85 * 115000,
    notes: 'Keramik 60×60 polos untuk lantai',
  }).select().single();

  await supabase.from('purchase_order_items').insert([
    { po_id: po2.id, material_id: matMap['MAT-050'], qty_ordered: 85, unit: 'm²', unit_price: 115000 },
  ]);

  // ─── PO-003 tanpa MR (langsung pembelian cat, proyek Andi) ────────────────
  log('Insert PO-003 (Andi, cat, sent)...');
  const { data: po3 } = await supabase.from('purchase_orders').insert({
    po_number: 'PO-2026-003', project_id: P_ANDI, supplier_id: supMap['SUP-005'],
    created_by: PM1_ID, approved_by: ADMIN_ID,
    status: 'sent', order_date: '2026-05-03',
    expected_delivery_date: '2026-05-07', payment_terms: 'net_30',
    delivery_address: 'Jl. Buah Batu No. 12, Bandung',
    total_amount: 24 * 185000 + 8 * 95000,
    notes: 'Cat eksterior + waterproofing untuk finishing',
  }).select().single();

  await supabase.from('purchase_order_items').insert([
    { po_id: po3.id, material_id: matMap['MAT-060'], qty_ordered: 24, unit: 'kaleng', unit_price: 185000 },
    { po_id: po3.id, material_id: matMap['MAT-061'], qty_ordered: 8,  unit: 'kaleng', unit_price: 95000  },
  ]);

  // ─── GR-002 partial (PO-002 keramik) ──────────────────────────────────────
  log('Insert GR-002 (Sari, keramik, sebagian)...');
  const { data: gr2 } = await supabase.from('goods_receipts').insert({
    gr_number: 'GR-2026-002', project_id: P_SARI, po_id: po2.id,
    supplier_id: supMap['SUP-004'], received_by: PM2_ID,
    status: 'confirmed', receipt_date: '2026-04-29',
    notes: '50 m² diterima, 35 m² sisanya dikirim minggu depan',
  }).select().single();

  const { data: poItems2 } = await supabase.from('purchase_order_items').select('id').eq('po_id', po2.id).limit(1);
  await supabase.from('goods_receipt_items').insert([
    { gr_id: gr2.id, material_id: matMap['MAT-050'], po_item_id: poItems2[0].id, qty_received: 50, unit: 'm²', unit_price: 115000 },
  ]);

  // Supplier invoice GR-002 (belum lunas)
  const { data: si2 } = await supabase.from('supplier_invoices').insert({
    supplier_id: supMap['SUP-004'], project_id: P_SARI,
    goods_receipt_id: gr2.id,
    invoice_number: 'KI/2026/0429',
    invoice_date: '2026-04-29', due_date: '2026-05-13',
    total_amount: 50 * 115000, amount_paid: 0,
    status: 'unpaid', description: 'Keramik lantai 60×60 — pengiriman pertama (50 m²)',
    created_by: ADMIN_ID,
  }).select().single();

  // ─── MR-004 — Proyek Hendra (draft) ───────────────────────────────────────
  log('Insert MR-004 (Hendra, draft)...');
  const { data: mr4 } = await supabase.from('material_requests').insert({
    mr_number: 'MR-2026-004', project_id: P_HENDRA, requested_by: PM2_ID,
    status: 'draft', request_date: '2026-05-15', needed_date: '2026-05-22',
    notes: 'Pipa dan material plumbing untuk renovasi kamar mandi',
  }).select().single();

  await supabase.from('material_request_items').insert([
    { mr_id: mr4.id, material_id: matMap['MAT-070'], qty_requested: 12, qty_ordered: 0, unit: 'batang', unit_price_est: 55000 },
    { mr_id: mr4.id, material_id: matMap['MAT-071'], qty_requested: 20, qty_ordered: 0, unit: 'batang', unit_price_est: 22000 },
  ]);

  // ─── Stok proyek (update dari GR yang sudah dikonfirmasi) ─────────────────
  log('Insert project_stocks (dari GR-001 & GR-002)...');
  // Simulated stock after GR-001 + some usage
  const stocks = [
    { project_id: P_ANDI, material_id: matMap['MAT-001'], qty_on_hand: 32,  qty_reserved: 0  }, // 80 masuk, 48 dipakai
    { project_id: P_ANDI, material_id: matMap['MAT-010'], qty_on_hand: 85,  qty_reserved: 0  }, // 200 masuk, 115 dipakai
    { project_id: P_ANDI, material_id: matMap['MAT-011'], qty_on_hand: 60,  qty_reserved: 0  }, // 150 masuk, 90 dipakai
    { project_id: P_SARI, material_id: matMap['MAT-050'], qty_on_hand: 50,  qty_reserved: 0  }, // 50 masuk dari GR-002
    { project_id: P_HENDRA, material_id: matMap['MAT-001'], qty_on_hand: 0, qty_reserved: 0  }, // belum ada GR
  ];
  await supabase.from('project_stocks').upsert(stocks, { onConflict: 'project_id,material_id' });

  // Stock movements untuk GR-001
  await supabase.from('stock_movements').insert([
    { project_id: P_ANDI, material_id: matMap['MAT-001'], movement_type: 'goods_receipt', qty: 80,  qty_before: 0,  qty_after: 80,  reference_type: 'goods_receipt', reference_id: gr1.id, created_by: PM1_ID, notes: 'GR-001' },
    { project_id: P_ANDI, material_id: matMap['MAT-001'], movement_type: 'usage',          qty: -48, qty_before: 80, qty_after: 32,  reference_type: 'manual', created_by: PM1_ID, notes: 'Pemakaian pengecoran lt.2' },
    { project_id: P_ANDI, material_id: matMap['MAT-010'], movement_type: 'goods_receipt', qty: 200, qty_before: 0,  qty_after: 200, reference_type: 'goods_receipt', reference_id: gr1.id, created_by: PM1_ID, notes: 'GR-001' },
    { project_id: P_ANDI, material_id: matMap['MAT-010'], movement_type: 'usage',          qty: -115,qty_before: 200,qty_after: 85,  reference_type: 'manual', created_by: PM1_ID, notes: 'Pemakaian kolom & ring balok' },
    { project_id: P_ANDI, material_id: matMap['MAT-011'], movement_type: 'goods_receipt', qty: 150, qty_before: 0,  qty_after: 150, reference_type: 'goods_receipt', reference_id: gr1.id, created_by: PM1_ID, notes: 'GR-001' },
    { project_id: P_ANDI, material_id: matMap['MAT-011'], movement_type: 'usage',          qty: -90, qty_before: 150,qty_after: 60,  reference_type: 'manual', created_by: PM1_ID, notes: 'Pemakaian kolom struktur' },
    { project_id: P_SARI, material_id: matMap['MAT-050'], movement_type: 'goods_receipt', qty: 50,  qty_before: 0,  qty_after: 50,  reference_type: 'goods_receipt', reference_id: gr2.id, created_by: PM2_ID, notes: 'GR-002' },
  ]);

  log('Procurement seed selesai!');
  return { mr1, mr2, mr3, mr4, po1, po2, po3, gr1, gr2, si1, si2 };
}

async function main() {
  console.log('\n🏗️  Seed Procurement — Puraloka Suite\n');
  try {
    await cleanup();
    const catIds = await seedCategories();
    const suppliers = await seedSuppliers();
    const materials = await seedMaterials(catIds);
    const result = await seedProcurementFlow(suppliers, materials);

    console.log('\n✅ Selesai! Summary:');
    console.log('   Material categories : 10');
    console.log('   Materials           : 23');
    console.log('   Suppliers           : 5');
    console.log('   Material Requests   : 4 (1 fully_ordered, 1 submitted, 1 partially_ordered, 1 draft)');
    console.log('   Purchase Orders     : 3 (1 fully_received, 1 confirmed, 1 sent)');
    console.log('   Goods Receipts      : 2 (1 confirmed full, 1 confirmed partial)');
    console.log('   Supplier Invoices   : 2 (1 paid, 1 unpaid)');
    console.log('   Stock Movements     : 7');
    console.log('   Project Stocks      : 5 records');
  } catch (err) {
    console.error('\n❌ Error:', err.message);
    process.exit(1);
  }
}

main();
