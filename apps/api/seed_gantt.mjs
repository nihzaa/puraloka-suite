/**
 * Seed realistis untuk Gantt Chart — Renovasi Rumah Pak Andi (Buah Batu)
 * Proyek: Feb 1 – Jul 31 2026, Rp 285jt, 4 lantai
 * Jalankan: node --loader ts-node/esm seed_gantt_proyek_andi.mjs
 * Atau langsung: node seed_gantt_proyek_andi.mjs (dari apps/api directory)
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

const PID = 'c0000000-0000-0000-0000-000000000001';
const PM_ID = 'a0000000-0000-0000-0000-000000000002';

// ─── ID Kategori dari RAB ─────────────────────────────────────────────────────
const CAT = {
  I_PERSIAPAN:   'b6bb3c64-2e9a-43c4-84c7-ed5e6e1e5348',
  II_BONGKARAN:  '6c966c79-0155-43c9-a6f8-91ef6624eb0f',
  III_TANAH:     'd4a343ef-7faf-4bdc-8c26-2af12e7f1404',
  III_BETON:     '19f2238c-7124-4569-975a-da422d641c6e',
  IV_PASANGAN:   'e28f3ea0-85a6-40eb-9fb3-62c0673e2dc9',
  V_PINTU:       'ab6ba002-694f-4cf7-9233-9bad87f9892c',
  VI_PLAFOND:    'b510c969-09d0-41be-9c7f-f84a7749fecd',
  VII_ATAP:      '1e975e4c-ddad-4cf6-a229-cf801889f75b',
  VIII_KERAMIK:  '0c74acc2-3e02-4903-8f34-a571a62a2914',
  IX_CAT:        '464d0442-bf50-4f2c-bd51-4168a33df5a8',
  X_SANITARY:    '5da7d1dc-fd74-4fab-89ed-b8d2f7393175',
  XI_PLUMBING:   '77de8738-7375-4738-86a6-c119758e8302',
  XII_MEP:       '83a3399a-a5e1-4ad6-ba4b-8703dac5505e',
  XIII_LAIN:     'e1949e15-f733-4af9-9bbe-1a1918c30719',
};

// ─── Planned dates per kategori (sesuai urutan konstruksi realistis) ──────────
// Proyek: 2026-02-01 → 2026-07-31 (6 bulan)
const PLANNED = [
  { id: CAT.I_PERSIAPAN,  start: '2026-02-01', end: '2026-02-07', deps: [] },
  { id: CAT.II_BONGKARAN, start: '2026-02-05', end: '2026-02-15', deps: [CAT.I_PERSIAPAN] },
  { id: CAT.III_TANAH,    start: '2026-02-15', end: '2026-03-05', deps: [CAT.II_BONGKARAN] },
  { id: CAT.III_BETON,    start: '2026-02-25', end: '2026-04-20', deps: [CAT.III_TANAH] },
  { id: CAT.IV_PASANGAN,  start: '2026-03-20', end: '2026-05-10', deps: [CAT.III_BETON] },
  { id: CAT.VII_ATAP,     start: '2026-04-01', end: '2026-05-01', deps: [CAT.III_BETON] },
  { id: CAT.V_PINTU,      start: '2026-04-20', end: '2026-06-10', deps: [CAT.IV_PASANGAN] },
  { id: CAT.VI_PLAFOND,   start: '2026-05-01', end: '2026-06-15', deps: [CAT.IV_PASANGAN] },
  { id: CAT.VIII_KERAMIK, start: '2026-05-15', end: '2026-07-01', deps: [CAT.IV_PASANGAN] },
  { id: CAT.XI_PLUMBING,  start: '2026-03-01', end: '2026-06-01', deps: [CAT.III_TANAH] },
  { id: CAT.XII_MEP,      start: '2026-03-15', end: '2026-06-20', deps: [CAT.III_BETON] },
  { id: CAT.IX_CAT,       start: '2026-06-01', end: '2026-07-15', deps: [CAT.VI_PLAFOND, CAT.VIII_KERAMIK] },
  { id: CAT.X_SANITARY,   start: '2026-06-15', end: '2026-07-20', deps: [CAT.XI_PLUMBING] },
  { id: CAT.XIII_LAIN,    start: '2026-06-20', end: '2026-07-25', deps: [CAT.IX_CAT] },
];

// ─── Item-level IDs yang akan diberi progress (sesuai milestone selesai) ──────
// Persiapan: 100% (milestone bongkar selesai Feb 9)
// Tanah & Pondasi: 100%
// Beton: 85% (struktur hampir selesai, finishing beton masih)
// Pasangan: 60% (dinding bata sudah, plester sedang)
// Atap: 90% (sudah terpasang, sedikit detail)
// Plumbing: 70%, MEP: 50%, Pintu: 30%, Plafond: 20%, Keramik: 10%, Cat: 0%

const ITEM_PROGRESS = [
  // --- I. PERSIAPAN (semua 100%) ---
  { id: '2ee11601-1da4-43c4-83b8-f7a00a5cd55c', pct: 100, date: '2026-02-04' }, // bouwplank
  { id: 'a23701d1-2755-4e50-8d5f-f5ceaea355ea', pct: 100, date: '2026-02-05' }, // pagar proyek
  { id: '0149038b-5913-4f52-b355-71ad21b329ea', pct: 100, date: '2026-02-06' }, // air kerja
  { id: '2049d7f0-8833-4e42-be6e-d2efddfca4bb', pct: 100, date: '2026-02-06' }, // listrik kerja
  { id: 'd5d9413a-8614-4e10-b956-299f23876475', pct: 35,  date: '2026-06-10' }, // kebersihan (ongoing)

  // --- III. TANAH & PONDASI (semua 100%) ---
  { id: '9889d338-e68a-4513-b9d6-1ba9dc241d91', pct: 100, date: '2026-02-20' }, // galian batu kali
  { id: '027a4a70-9d90-4762-8a36-99771ef32792', pct: 100, date: '2026-02-20' }, // galian foot plat
  { id: 'a95906ef-9ba6-4485-983a-088d7bd238f3', pct: 100, date: '2026-02-22' }, // galian carport
  { id: '125ebe59-3bbd-42a8-bada-87c711b66519', pct: 100, date: '2026-02-22' }, // galian retaining wall
  { id: 'e92650b3-768f-4296-8d4a-1cb5e6dda160', pct: 100, date: '2026-03-04' }, // urugan kembali
  { id: 'd0021af7-ccca-45b6-8323-71213f35c8b6', pct: 100, date: '2026-02-28' }, // bored pile

  // --- III. BETON — Pondasi & Sloof (100%) ---
  { id: '5fb2c3ad-db81-47c9-a115-d1c50186b40d', pct: 100, date: '2026-03-03' }, // bored pile beton
  { id: 'c511e1cf-d887-442f-a92c-52dbd9f955b1', pct: 100, date: '2026-03-10' }, // sloof TB3
  { id: '4666e727-f3d1-4e1b-b7c9-660fff85240f', pct: 100, date: '2026-03-12' }, // sloof TB5A

  // --- III. BETON — Kolom (80-90%) ---
  { id: '1d6bdb0e-22d5-4b3a-9f6d-a9c7b0edaf45', pct: 100, date: '2026-03-25' }, // kolom basement
  { id: 'd6a4ad8f-095b-48f4-894b-dab486f0b801', pct: 100, date: '2026-03-28' }, // kolom lt1
  { id: '235dbb3f-03dc-4db4-a4a4-9e277e4d4e69', pct: 90,  date: '2026-04-05' }, // kolom lt2
  { id: 'aa35f8dd-2e52-407d-a4b1-5d89e61d7a1b', pct: 75,  date: '2026-04-12' }, // kolom lt3

  // --- III. BETON — Plat Lantai (70-100%) ---
  { id: '8ed64b3d-4ac7-4a07-b0f8-7c5ae7ca4f76', pct: 100, date: '2026-03-30' }, // plat lt dasar
  { id: '85c9ef05-5bc3-4cdb-bcea-f0c8af18cb09', pct: 100, date: '2026-04-08' }, // plat lt1
  { id: '64a5f2b8-c9d2-4f20-aebb-9c87d02e8b56', pct: 85,  date: '2026-04-15' }, // plat lt2
  { id: 'a87cb5e1-6ad3-4f5a-b02e-5b6af09d8c3e', pct: 60,  date: '2026-04-18' }, // plat lt3

  // --- IV. PASANGAN — Pondasi (100%) ---
  { id: 'bafe3c24-de2c-4a88-be43-c3d5dd8b9c12', pct: 100, date: '2026-03-15' }, // pasangan batu kali
  { id: '5c2ea1d9-3bc7-4f6d-a856-9e43f7d02c8a', pct: 100, date: '2026-03-16' }, // rolaag bata

  // --- IV. PASANGAN — Dinding (60-100%) ---
  { id: '7de2a8f4-5b3c-4e9a-8c67-2f4d1a9b8e5c', pct: 100, date: '2026-04-05' }, // dinding basement
  { id: 'c4f8b2e1-9a7d-4c5b-8f32-6e1a9d4c7b2f', pct: 100, date: '2026-04-18' }, // dinding lt1
  { id: 'a3e7d5c9-2b8f-4a6c-9e4d-7c3b1f8a5e2d', pct: 75,  date: '2026-05-02' }, // dinding lt2
  { id: 'f1b5e9d3-7c4a-4f2e-8b6d-9a3c7e1b5f4d', pct: 50,  date: '2026-05-10' }, // dinding lt3

  // --- VII. ATAP (90%) ---
  { id: 'e8d3c7b1-5a9f-4e2d-8c6b-7f4a1e3d9c5b', pct: 90,  date: '2026-04-28' }, // atap utama

  // --- XI. PLUMBING (70%) ---
  { id: 'b2f7e4c9-8d3a-4c6b-9e5f-1a7d3c8b4e6f', pct: 100, date: '2026-04-20' }, // air bersih instalasi
  { id: 'd6e9c3b5-2f8a-4d7c-8b4e-5a1f9d3c7b2e', pct: 50,  date: '2026-05-20' }, // air kotor

  // --- XII. MEP (50%) ---
  { id: 'a4c8f2e7-6b3d-4a9c-8f5e-2d7b1c4e9a3f', pct: 60,  date: '2026-05-15' }, // instalasi listrik
];

// ─── Komponen biaya per kategori (estimasi % material/upah/alat/lain) ─────────
const KOMPONEN_BY_CATEGORY = {
  [CAT.I_PERSIAPAN]:  { material: 30, upah: 50, alat: 15, other: 5 },
  [CAT.II_BONGKARAN]: { material: 5,  upah: 75, alat: 15, other: 5 },
  [CAT.III_TANAH]:    { material: 10, upah: 50, alat: 35, other: 5 },
  [CAT.III_BETON]:    { material: 55, upah: 35, alat: 5,  other: 5 },
  [CAT.IV_PASANGAN]:  { material: 50, upah: 45, alat: 0,  other: 5 },
  [CAT.V_PINTU]:      { material: 70, upah: 25, alat: 0,  other: 5 },
  [CAT.VI_PLAFOND]:   { material: 55, upah: 40, alat: 0,  other: 5 },
  [CAT.VII_ATAP]:     { material: 65, upah: 30, alat: 0,  other: 5 },
  [CAT.VIII_KERAMIK]: { material: 60, upah: 35, alat: 0,  other: 5 },
  [CAT.IX_CAT]:       { material: 45, upah: 50, alat: 0,  other: 5 },
  [CAT.X_SANITARY]:   { material: 75, upah: 20, alat: 0,  other: 5 },
  [CAT.XI_PLUMBING]:  { material: 60, upah: 35, alat: 0,  other: 5 },
  [CAT.XII_MEP]:      { material: 55, upah: 40, alat: 0,  other: 5 },
  [CAT.XIII_LAIN]:    { material: 40, upah: 55, alat: 0,  other: 5 },
};

async function main() {
  console.log('=== SEED GANTT CHART — Renovasi Rumah Pak Andi ===\n');

  // ── 1. Set planned dates + dependencies per kategori ─────────────────────────
  console.log('1. Mengisi planned_start, planned_end, gantt_dependencies per kategori...');
  let ok = 0, fail = 0;
  for (const p of PLANNED) {
    const { error } = await supabase
      .from('rab_items')
      .update({
        planned_start: p.start,
        planned_end: p.end,
        gantt_dependencies: p.deps.length > 0 ? p.deps : null,
      })
      .eq('id', p.id);
    if (error) { console.error('  ERROR planned', p.id, error.message); fail++; }
    else ok++;
  }
  console.log(`   ✓ ${ok} kategori diupdate, ${fail} gagal\n`);

  // ── 2. Set komponen biaya per item (material/upah/alat/other) ─────────────────
  console.log('2. Mengisi komponen biaya per item RAB...');

  // Ambil semua items dengan parent_id untuk cari kategori mereka
  const { data: allItems } = await supabase
    .from('rab_items')
    .select('id, level, parent_id, total_price')
    .eq('project_id', PID)
    .eq('level', 'item');

  // Build parent→category map (walk up tree)
  const { data: allNodes } = await supabase
    .from('rab_items')
    .select('id, level, parent_id')
    .eq('project_id', PID);

  const nodeMap = {};
  allNodes?.forEach(n => { nodeMap[n.id] = n; });

  function findCategory(id) {
    let node = nodeMap[id];
    while (node) {
      if (node.level === 'category') return node.id;
      if (!node.parent_id) return null;
      node = nodeMap[node.parent_id];
    }
    return null;
  }

  let kompOk = 0, kompSkip = 0;
  for (const item of (allItems || [])) {
    if (!item.total_price || item.total_price <= 0) { kompSkip++; continue; }
    const catId = findCategory(item.id);
    const k = KOMPONEN_BY_CATEGORY[catId];
    if (!k) { kompSkip++; continue; }
    const { error } = await supabase
      .from('rab_items')
      .update({
        material_pct: k.material,
        upah_pct: k.upah,
        alat_pct: k.alat,
        other_pct: k.other,
      })
      .eq('id', item.id);
    if (error) { console.error('  ERROR komponen', item.id, error.message); }
    else kompOk++;
  }
  console.log(`   ✓ ${kompOk} item diberi komponen biaya, ${kompSkip} skip (harga 0/null)\n`);

  // ── 3. Cek item yang valid untuk progress log ─────────────────────────────────
  // Ambil semua item dengan total_price > 0 yang level = item
  const { data: validItems } = await supabase
    .from('rab_items')
    .select('id, name, weight_pct, total_price, sort_order')
    .eq('project_id', PID)
    .eq('level', 'item')
    .gt('total_price', 0)
    .order('sort_order')
    .limit(200);

  console.log(`3. Mengisi progress log mode=detail untuk ${validItems?.length} item valid...`);

  // Map sort_order ke pct berdasarkan logika proyek:
  // sort_order 1-5 (persiapan): 100%
  // sort_order 14-20 (tanah): 100%
  // sort_order 23-40 (beton pondasi/sloof): 100%
  // sort_order 43-93 (beton kolom/balok/plat): 60-100% menurun
  // sort_order 99-139 (pasangan): 40-100% menurun
  // sort_order 140-200+ (pintu, plafond, atap, keramik): 10-70%
  // rest: 0-20%

  function getPct(sortOrder, tp) {
    if (!tp || tp <= 0) return null;
    if (sortOrder <= 5) return 100;
    if (sortOrder <= 20) return 100;
    if (sortOrder <= 40) return 100;
    if (sortOrder <= 55) return 95;   // kolom basement-lt1
    if (sortOrder <= 65) return 80;   // kolom lt2-lt3
    if (sortOrder <= 85) return 75;   // balok
    if (sortOrder <= 93) return 80;   // plat lantai
    if (sortOrder <= 110) return 100; // pasangan pondasi + dinding basement-lt1
    if (sortOrder <= 120) return 70;  // dinding lt2
    if (sortOrder <= 135) return 50;  // dinding lt3 + finishing tampak
    if (sortOrder <= 145) return 40;  // profilan
    if (sortOrder <= 165) return 35;  // pintu jendela
    if (sortOrder <= 175) return 25;  // plafond
    if (sortOrder <= 185) return 90;  // atap
    if (sortOrder <= 200) return 15;  // keramik
    if (sortOrder <= 215) return 5;   // cat
    if (sortOrder <= 225) return 70;  // plumbing
    if (sortOrder <= 235) return 55;  // mep
    return 10;
  }

  function getLogDate(sortOrder) {
    if (sortOrder <= 5)   return '2026-02-06';
    if (sortOrder <= 20)  return '2026-03-04';
    if (sortOrder <= 40)  return '2026-03-12';
    if (sortOrder <= 65)  return '2026-04-05';
    if (sortOrder <= 85)  return '2026-04-15';
    if (sortOrder <= 93)  return '2026-04-20';
    if (sortOrder <= 120) return '2026-04-28';
    if (sortOrder <= 145) return '2026-05-12';
    if (sortOrder <= 165) return '2026-05-25';
    if (sortOrder <= 175) return '2026-06-05';
    if (sortOrder <= 185) return '2026-04-30';
    if (sortOrder <= 200) return '2026-06-10';
    if (sortOrder <= 215) return '2026-06-16';
    if (sortOrder <= 235) return '2026-05-20';
    return '2026-06-16';
  }

  // Insert progress logs satu per satu
  let logOk = 0, logFail = 0;
  for (const item of (validItems || [])) {
    const pct = getPct(item.sort_order, item.total_price);
    if (pct === null || pct === 0) { continue; }
    const logDate = getLogDate(item.sort_order);

    // Update rab_item.progress_pct
    const { error: updateErr } = await supabase
      .from('rab_items')
      .update({ progress_pct: pct })
      .eq('id', item.id);
    if (updateErr) { console.error('  ERROR update rab_item', item.id, updateErr.message); logFail++; continue; }

    // Insert progress_log mode=detail
    const { error: logErr } = await supabase
      .from('progress_logs')
      .insert({
        project_id: PID,
        mode: 'detail',
        logged_at: logDate,
        rab_item_id: item.id,
        pct_completion: pct,
        pct_overall: null,
        reported_by: PM_ID,
        notes: `Progress update ${item.name} — ${pct}%`,
      });
    if (logErr) {
      // Skip duplicate or constraint issues silently
      if (!logErr.message.includes('duplicate') && !logErr.message.includes('unique')) {
        console.error('  WARN log', item.name, logErr.message);
      }
      logFail++;
    } else {
      logOk++;
    }
  }
  console.log(`   ✓ ${logOk} progress log di-insert, ${logFail} skip/gagal\n`);

  // ── 4. Recalculate bubble-up: item → category → project ──────────────────────
  console.log('4. Recalculate progress_pct bubble-up...');

  // Ambil semua items dengan weight_pct dan progress_pct
  const { data: itemsForCalc } = await supabase
    .from('rab_items')
    .select('id, level, parent_id, weight_pct, progress_pct, total_price')
    .eq('project_id', PID);

  const nodeMapFull = {};
  itemsForCalc?.forEach(n => { nodeMapFull[n.id] = { ...n }; });

  // Hitung progress per parent (weighted average of children)
  const childrenOf = {};
  itemsForCalc?.forEach(n => {
    if (n.parent_id) {
      if (!childrenOf[n.parent_id]) childrenOf[n.parent_id] = [];
      childrenOf[n.parent_id].push(n);
    }
  });

  // Hitung total_price sum per parent untuk weight
  async function recalcParent(parentId) {
    const children = childrenOf[parentId] || [];
    if (children.length === 0) return;

    const totalChildPrice = children.reduce((s, c) => s + (c.total_price || 0), 0);
    if (totalChildPrice <= 0) return;

    let weightedSum = 0;
    for (const child of children) {
      const childWeight = (child.total_price || 0) / totalChildPrice;
      weightedSum += childWeight * (child.progress_pct || 0);
    }
    const parentPct = Math.round(weightedSum * 100) / 100;

    await supabase.from('rab_items').update({ progress_pct: parentPct }).eq('id', parentId);
    nodeMapFull[parentId].progress_pct = parentPct;
  }

  // Pass 1: recalc subcategories
  const subcats = itemsForCalc?.filter(n => n.level === 'subcategory') || [];
  for (const sc of subcats) {
    await recalcParent(sc.id);
  }

  // Pass 2: recalc categories
  const cats2 = itemsForCalc?.filter(n => n.level === 'category') || [];
  for (const cat of cats2) {
    await recalcParent(cat.id);
  }

  // Pass 3: project overall — weighted sum of categories
  const catItems = itemsForCalc?.filter(n => n.level === 'category') || [];
  const totalWeight = catItems.reduce((s, c) => s + (c.weight_pct || 0), 0);
  let projectPct = 0;
  if (totalWeight > 0) {
    for (const cat of catItems) {
      const updatedCat = nodeMapFull[cat.id];
      projectPct += (cat.weight_pct || 0) * (updatedCat.progress_pct || 0) / 100;
    }
  }
  projectPct = Math.round(projectPct * 100) / 100;

  const { error: projErr } = await supabase
    .from('projects')
    .update({ progress_pct: projectPct })
    .eq('id', PID);

  if (projErr) console.error('  ERROR update project progress', projErr.message);
  else console.log(`   ✓ projects.progress_pct = ${projectPct}%\n`);

  // ── 5. Cek hasilnya ──────────────────────────────────────────────────────────
  console.log('5. Verifikasi hasil...');
  const { data: proj } = await supabase.from('projects').select('name, progress_pct, start_date, end_date').eq('id', PID).single();
  console.log('   Proyek:', proj?.name);
  console.log('   Progress fisik:', proj?.progress_pct, '%');
  console.log('   Timeline:', proj?.start_date, '→', proj?.end_date);

  const { data: ganttSample } = await supabase
    .from('rab_items')
    .select('level, category_code, name, planned_start, planned_end, progress_pct')
    .eq('project_id', PID)
    .in('level', ['category'])
    .order('sort_order');

  console.log('\n   GANTT PREVIEW (kategori):');
  ganttSample?.forEach(r => {
    const bar = r.planned_start ? `${r.planned_start} → ${r.planned_end}` : '(belum diset)';
    console.log(`   ${r.category_code?.padEnd(6)} ${r.name?.substring(0,35).padEnd(36)} | ${bar} | ${r.progress_pct}%`);
  });

  console.log('\n=== SEED SELESAI ===');
}

main().catch(console.error);
