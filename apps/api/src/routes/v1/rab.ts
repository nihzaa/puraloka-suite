import type { FastifyInstance } from 'fastify'
import { proyekMilikTenant } from '../../utils/tenant-guard.js'
import * as XLSX from 'xlsx'
import { supabase } from '../../utils/supabase.js'
import { authenticate, requirePermission } from '../../plugins/auth.js'
import { bubbleUpProgress } from '../../lib/rab-aggregation.js'
import { logAuditEvent } from '../../utils/audit.js'

// ─── Type untuk baris RAB hasil parse ──────────────────────────────────────

interface RabRow {
  no: string
  name: string
  qty: number | null
  unit: string | null
  unit_price: number | null
  total_price: number | null
  weight_pct: number | null
  level: 'category' | 'subcategory' | 'item'
  sort_order: number
  // Referensi ke induk dalam array hasil parse (sebelum insert ke DB)
  parentIdx?: number
}

// ─── Helpers ────────────────────────────────────────────────────────────────

/** Deteksi angka Romawi dengan atau tanpa titik */
function isRomanNumeral(s: string): boolean {
  const clean = s.trim().replace(/\.$/, '')
  return clean.length > 0 && /^(XIV|XIII|XII|XI|IX|VIII|VII|VI|IV|III|II|I|X{1,3}V?I{0,3}|X{0,3}IX|X{0,3}IV|X{0,3}V)$/i.test(clean)
}

/** Deteksi huruf sub-kategori: "A", "B", "C" tunggal (kadang dengan titik) */
function isSubcategoryCode(s: string): boolean {
  return /^[A-Z]\.?$/i.test(s.trim())
}

/** Parse angka dari cell Excel — handle number langsung atau string dengan separator */
function parseNumber(val: unknown): number | null {
  if (val === null || val === undefined || val === '') return null
  if (typeof val === 'number') return isNaN(val) ? null : val
  const str = String(val).replace(/[^0-9.,-]/g, '').replace(/,/g, '')
  const n = parseFloat(str)
  return isNaN(n) ? null : n
}

/**
 * Pilih sheet RAB yang paling relevan dari workbook.
 * Prioritas: sheet bernama "BoQ", "RAB", dll.
 * Fallback ke sheet yang mengandung "Uraian Pekerjaan" di baris awal.
 */
function pickRabSheet(workbook: XLSX.WorkBook): XLSX.WorkSheet {
  const priority = ['BoQ', 'RAB', 'Bill of Quantity', 'BOQ', 'rab', 'boq']
  for (const name of priority) {
    if (workbook.Sheets[name]) return workbook.Sheets[name]
  }
  for (const name of workbook.SheetNames) {
    const sheet = workbook.Sheets[name]
    const raw = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: '', blankrows: false }) as unknown[][]
    for (let i = 0; i < Math.min(15, raw.length); i++) {
      const rowStr = raw[i].join(' ').toLowerCase()
      if (rowStr.includes('uraian') && rowStr.includes('pekerjaan')) return sheet
    }
  }
  return workbook.Sheets[workbook.SheetNames[0]]
}

/**
 * Deteksi kolom utama dari baris header (multi-row) + distribusi data aktual.
 *
 * Pola Excel RAB Indonesia yang umum:
 *   Col 0: No.
 *   Col 1: (kosong — merge dengan col 2)
 *   Col 2: Uraian Pekerjaan (tapi data bisa di col 2 atau col 3 karena merged cells)
 *   Col 13: Vol. / Estimasi
 *   Col 14: Sat.
 *   Col 15: Harga Satuan
 *   Col 16: Jumlah Harga
 *
 * Strategi: scan header row untuk label, lalu konfirmasi dengan distribusi data.
 */
function detectColumns(rows: unknown[][]): {
  colNo: number; colName: number; colQty: number; colUnit: number
  colUnitPrice: number; colTotal: number; headerRowIdx: number
} {
  let headerRowIdx = -1

  // Cari baris header — ada kata "uraian" dan "pekerjaan"
  for (let i = 0; i < Math.min(20, rows.length); i++) {
    const rowStr = rows[i].join(' ').toLowerCase()
    if (rowStr.includes('uraian') && rowStr.includes('pekerjaan')) { headerRowIdx = i; break }
  }
  if (headerRowIdx === -1) {
    for (let i = 0; i < Math.min(20, rows.length); i++) {
      const rowStr = rows[i].join(' ').toLowerCase()
      if (rowStr.includes('uraian') || rowStr.includes('harga satuan')) { headerRowIdx = i; break }
    }
  }
  if (headerRowIdx === -1) headerRowIdx = 0

  // Gabungkan 2 baris header (Vol / Estimasi sering di baris kedua)
  const headerCombined = [...rows[headerRowIdx]]
  if (headerRowIdx + 1 < rows.length) {
    rows[headerRowIdx + 1].forEach((cell, i) => {
      if (String(cell ?? '').trim()) headerCombined[i] = (headerCombined[i] || '') + ' ' + String(cell)
    })
  }

  let colNo = 0, colName = -1, colQty = -1, colUnit = -1, colUnitPrice = -1, colTotal = -1

  headerCombined.forEach((cell, i) => {
    const h = String(cell ?? '').toLowerCase().trim()
    if (!h) return
    if (/^no\.?$/.test(h)) colNo = i
    else if ((h.includes('uraian') || h.includes('pekerjaan')) && colName === -1) colName = i
    else if ((h.includes('vol') || h.includes('qty') || h.includes('estimasi')) && colQty === -1) colQty = i
    else if ((/^sat\.?$/.test(h) || h === 'satuan') && colUnit === -1) colUnit = i
    else if (h.includes('harga') && h.includes('satuan')) colUnitPrice = i
    else if ((h.includes('jumlah') && h.includes('harga')) || h === 'total') colTotal = i
  })

  if (colName === -1) colName = 1

  // Konfirmasi kolom nama dengan distribusi data: karena merged cells, nama bisa di col+1 atau col+2
  const dataRows = rows.slice(headerRowIdx + 1, headerRowIdx + 30)
  if (dataRows.length > 0) {
    const candidates = [colName, colName + 1, colName + 2]
    const scores = candidates.map(c =>
      dataRows.filter(r => String(r[c] ?? '').trim().length > 4).length
    )
    const bestIdx = scores.indexOf(Math.max(...scores))
    colName = candidates[bestIdx]
  }

  return { colNo, colName, colQty, colUnit, colUnitPrice, colTotal, headerRowIdx }
}

/**
 * Gabungkan nilai non-null dari kolom "spec teknis" (antara kolom nama dan kolom qty)
 * menjadi satu string keterangan. Contoh: "0.3 x 6 m D13-150"
 *
 * Skip: nilai float presisi tinggi (>4 desimal) yang merupakan hasil formula internal.
 * Keep: dimensi sederhana (0.3, 0.5), teks (x, m, D13-150), angka bulat.
 */
function buildSpecNotes(row: unknown[], colNameEnd: number, colQty: number): string | null {
  const parts: string[] = []
  const specStart = colNameEnd + 1
  const specEnd = colQty > 0 ? colQty : specStart + 10
  for (let c = specStart; c < specEnd; c++) {
    const val = row[c]
    if (val === null || val === undefined || val === '') continue
    if (typeof val === 'number') {
      // Skip angka dengan floating point error — hasil formula Excel yang "bocor"
      // Deteksi: jika representasi desimal lebih dari 4 digit signifikan setelah koma
      const str4 = val.toFixed(4)
      const strFull = val.toString()
      // Jika strFull jauh lebih panjang dari str4, ini floating point error
      if (strFull.length > str4.length + 2) continue
      // Skip angka yang sangat kecil (< 0.01) yang bukan dimensi bermakna
      if (val > 0 && val < 0.01) continue
      parts.push(String(parseFloat(val.toFixed(4))))
    } else {
      const s = String(val).trim()
      if (s) parts.push(s)
    }
  }
  if (parts.length === 0) return null
  return parts.join(' ').replace(/\s+/g, ' ').trim() || null
}

/**
 * Parse sheet RAB menjadi array RabRow — mendukung format RAB konstruksi Indonesia.
 *
 * Hierarki yang didukung:
 *   category  (I, II, III, IV — angka Romawi)
 *   subcategory (A, B, C — huruf tunggal)
 *   item        (1, 2, 3 — angka, ada harga sendiri)
 *   item-container (angka, tanpa harga, diikuti sub-item komponen "- xxx")
 *   sub-item komponen (col[0]=null, col[colName+1] starts "-", ada harga)
 *
 * Key behaviors:
 * - Duplikat nomor Romawi (dua "IV.") ditangani via parentIdx berbasis array index
 * - Sub-item komponen terdeteksi dari col di sebelah kanan colName yang starts "-"
 * - Spec teknis (dimensi, jenis besi) di kolom tengah digabung jadi field `notes` item
 * - Baris spec teknis tanpa nama bermakna dan tanpa harga = di-skip
 */
function parseRabSheet(workbook: XLSX.WorkBook): RabRow[] {
  const sheet = pickRabSheet(workbook)
  const raw = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
    header: 1,
    defval: null,
    blankrows: true,
  }) as unknown[][]

  const { colNo, colName, colQty, colUnit, colUnitPrice, colTotal, headerRowIdx } = detectColumns(raw)

  // Data dimulai setelah header (skip sub-header "Estimasi" jika ada)
  let dataStart = headerRowIdx + 1
  if (dataStart < raw.length) {
    const nextRowStr = (raw[dataStart] ?? []).join(' ').toLowerCase()
    if (nextRowStr.includes('estimasi') || nextRowStr.replace(/\s/g, '') === '') {
      dataStart++
    }
  }

  const SKIP_PATTERNS = /^(sub\s*total|grand\s*total|total\s*keseluruhan|total\s*harga|total\s*rab|fee|ppn|keterangan|total)$/i

  const rows: RabRow[] = []
  let sortOrder = 0

  // Stack: track parent category/subcategory saat ini
  type StackEntry = { level: 'category' | 'subcategory'; rowIdx: number }
  const parentStack: StackEntry[] = []

  // Index item terakhir (yang bernomor angka) — parent potensial untuk sub-item komponen
  let lastNumberedItemIdx: number | undefined = undefined

  for (let i = dataStart; i < raw.length; i++) {
    const row = raw[i] ?? []

    const noRaw = String(row[colNo] ?? '').trim()

    // Nilai di kolom nama utama
    const nameMain = String(row[colName] ?? '').trim()

    // Kolom tepat di sebelah kanan colName sering berisi sub-item komponen "- xxx"
    const nameNext = String(row[colName + 1] ?? '').trim()

    const name = nameMain || nameNext

    // Deteksi baris sub-item komponen: col[0] kosong, nameNext starts "-", ada harga
    // Ini terjadi ketika Excel merges cells dan teks sub-item ada di col sebelah kanan
    const isComponentSubItem = !noRaw && (
      nameNext.startsWith('-') || nameNext.startsWith('–') ||
      nameMain.startsWith('-') || nameMain.startsWith('–')
    )

    const total = colTotal >= 0 ? parseNumber(row[colTotal]) : null
    const hasRealTotal = total !== null && total > 0
    const qty = colQty >= 0 ? parseNumber(row[colQty]) : null
    const unit = colUnit >= 0 ? (String(row[colUnit] ?? '').trim() || null) : null
    const unitPrice = colUnitPrice >= 0 ? parseNumber(row[colUnitPrice]) : null

    // ── Sub-item komponen (prefix "-") ────────────────────────────────────
    if (isComponentSubItem) {
      // Hanya masukkan jika punya harga nyata
      if (!hasRealTotal) continue
      // Nama bersih: strip prefix "-" dan spasi
      const cleanName = name.replace(/^[-–]\s*/, '').trim()
      if (!cleanName) continue

      // Parent = item bernomor terakhir (item container)
      rows.push({
        no: '',
        name: cleanName,
        qty,
        unit,
        unit_price: unitPrice,
        total_price: total,
        weight_pct: null,
        level: 'item',
        sort_order: sortOrder++,
        parentIdx: lastNumberedItemIdx,
      })
      continue
    }

    // Skip baris kosong total
    if (!noRaw && !name) continue

    // Skip sub-total / grand total
    if (SKIP_PATTERNS.test(name.trim())) continue
    if (SKIP_PATTERNS.test(noRaw)) continue
    if (!name && row.some(c => /sub\s*total/i.test(String(c ?? '')))) continue

    // ── Kategori utama (I, II, III, IV, ...) ──────────────────────────────
    if (isRomanNumeral(noRaw)) {
      const idx = rows.length
      rows.push({
        no: noRaw.replace(/\.$/, ''),
        name,
        qty: null,
        unit: null,
        unit_price: null,
        total_price: null,
        weight_pct: null,
        level: 'category',
        sort_order: sortOrder++,
      })
      parentStack.length = 0
      parentStack.push({ level: 'category', rowIdx: idx })
      lastNumberedItemIdx = undefined
      continue
    }

    // ── Sub-kategori (A, B, C, ...) ────────────────────────────────────────
    if (isSubcategoryCode(noRaw)) {
      const idx = rows.length
      rows.push({
        no: noRaw.replace(/\.$/, ''),
        name,
        qty: null,
        unit: null,
        unit_price: null,
        total_price: null,
        weight_pct: null,
        level: 'subcategory',
        sort_order: sortOrder++,
        parentIdx: parentStack.find(s => s.level === 'category')?.rowIdx,
      })
      while (parentStack.length > 0 && parentStack[parentStack.length - 1].level === 'subcategory') {
        parentStack.pop()
      }
      parentStack.push({ level: 'subcategory', rowIdx: idx })
      lastNumberedItemIdx = undefined
      continue
    }

    // ── Item bernomor angka ────────────────────────────────────────────────
    const hasNo = noRaw !== '' && /^\d+$/.test(noRaw)

    if (hasNo && name) {
      // Kumpulkan spec teknis dari kolom tengah (antara colName dan colQty) sebagai notes
      const specNotes = buildSpecNotes(row, colName, colQty)
      const displayName = specNotes ? `${name} (${specNotes})` : name

      const idx = rows.length
      const parentEntry = parentStack.length > 0 ? parentStack[parentStack.length - 1] : undefined

      rows.push({
        no: noRaw,
        name: displayName,
        qty,
        unit,
        unit_price: unitPrice,
        total_price: hasRealTotal ? total : null,
        weight_pct: null,
        level: 'item',
        sort_order: sortOrder++,
        parentIdx: parentEntry?.rowIdx,
      })

      // Simpan sebagai potential parent untuk sub-item komponen berikutnya
      lastNumberedItemIdx = idx
      continue
    }

    // ── Baris lain tanpa nomor — skip (spec teknis, keterangan, dll) ───────
    // Baris ini adalah sisa spec teknis yang tersebar atau keterangan yang tidak bermakna
  }

  return rows
}

/**
 * Hitung total_price setiap parent dari item-item di bawahnya,
 * lalu hitung weight_pct per kategori dari grand total.
 *
 * Mendukung hierarki 3 level:
 *   sub-item komponen → item container → subcategory → category
 *
 * Strategi: akumulasi bottom-up berulang hingga semua total tersebar ke category.
 */
function computeWeights(rows: RabRow[]): void {
  // Bottom-up: akumulasi total setiap baris ke parentnya
  // Ulangi beberapa kali untuk menangani hierarki dalam (item → item-container → subcategory → category)
  for (let pass = 0; pass < 4; pass++) {
    for (let i = rows.length - 1; i >= 0; i--) {
      const row = rows[i]
      if (row.parentIdx === undefined || !row.total_price) continue
      const parent = rows[row.parentIdx]
      if (!parent) continue
      // Hindari double-count: akumulasi hanya jika parent belum punya total dari file
      // (kita set total_price parent dari sum children, bukan override jika sudah ada)
      // Cara aman: reset semua non-category-level total dulu dan hitung ulang
      parent.total_price = (parent.total_price ?? 0) + row.total_price
    }
  }

  // Reset total semua non-leaf, lalu hitung ulang dari leaf (agar tidak double-count)
  // Leaf = item yang tidak punya children (tidak ada row lain yang parentIdx ke dia)
  const hasChildren = new Set(rows.map(r => r.parentIdx).filter(p => p !== undefined))

  // Bersihkan total semua non-leaf
  for (let i = 0; i < rows.length; i++) {
    if (hasChildren.has(i)) rows[i].total_price = 0
  }

  // Akumulasi ulang dari leaf ke root
  for (let i = rows.length - 1; i >= 0; i--) {
    const row = rows[i]
    if (row.parentIdx === undefined || !row.total_price) continue
    const parent = rows[row.parentIdx]
    if (parent) parent.total_price = (parent.total_price ?? 0) + row.total_price
  }

  const grandTotal = rows
    .filter(r => r.level === 'category')
    .reduce((sum, r) => sum + (r.total_price ?? 0), 0)

  if (grandTotal <= 0) return

  for (const row of rows) {
    if (row.level === 'category') {
      row.weight_pct = parseFloat(((row.total_price ?? 0) / grandTotal * 100).toFixed(4))
    }
  }
}

// ─── Routes ────────────────────────────────────────────────────────────────

export default async function rabRoutes(app: FastifyInstance) {
  // ── GET /api/v1/projects/:projectId/rab ──────────────────────────────────
  app.get<{ Params: { projectId: string } }>(
    '/api/v1/projects/:projectId/rab',
    { preHandler: [authenticate] },
    async (request, reply) => {
      const { projectId } = request.params

      if (!(await proyekMilikTenant(request, projectId))) {
        return reply.status(404).send({ error: 'Proyek tidak ditemukan' })
      }

      const { data, error } = await supabase
        .from('rab_items')
        .select('*')
        .eq('project_id', projectId)
        .order('sort_order', { ascending: true })

      if (error) {
        app.log.error(error)
        return reply.status(500).send({ error: 'Gagal mengambil data RAB' })
      }

      // Tambahkan flag komponen_set: true jika total komponen biaya = 100
      const enriched = (data ?? []).map(item => ({
        ...item,
        komponen_set: item.material_pct > 0 || item.upah_pct > 0 || item.alat_pct > 0 || item.other_pct > 0,
      }))

      return reply.send({ data: enriched })
    }
  )

  // ── GET /api/v1/projects/:projectId/rab/categories ───────────────────────
  // List sub-kategori RAB (level=subcategory) untuk dropdown mandor assign
  app.get<{ Params: { projectId: string } }>(
    '/api/v1/projects/:projectId/rab/categories',
    { preHandler: [authenticate] },
    async (request, reply) => {
      const { projectId } = request.params

      if (!(await proyekMilikTenant(request, projectId))) {
        return reply.status(404).send({ error: 'Proyek tidak ditemukan' })
      }

      const { data, error } = await supabase
        .from('rab_items')
        .select('id, category_code, name, total_price, weight_pct, level, sort_order')
        .eq('project_id', projectId)
        .in('level', ['category', 'subcategory'])
        .order('sort_order', { ascending: true })

      if (error) {
        app.log.error(error)
        return reply.status(500).send({ error: 'Gagal mengambil kategori RAB' })
      }

      return reply.send({ data: data ?? [] })
    }
  )

  // ── GET /api/v1/projects/:projectId/rab/items ────────────────────────────
  // List item detail RAB (level=item) untuk dropdown progress log mode detail
  app.get<{ Params: { projectId: string } }>(
    '/api/v1/projects/:projectId/rab/items',
    { preHandler: [authenticate] },
    async (request, reply) => {
      const { projectId } = request.params

      if (!(await proyekMilikTenant(request, projectId))) {
        return reply.status(404).send({ error: 'Proyek tidak ditemukan' })
      }

      const { data, error } = await supabase
        .from('rab_items')
        .select('id, category_code, name, unit, weight_pct, progress_pct, parent_id, sort_order')
        .eq('project_id', projectId)
        .eq('level', 'item')
        .order('sort_order', { ascending: true })

      if (error) {
        app.log.error(error)
        return reply.status(500).send({ error: 'Gagal mengambil item RAB' })
      }

      return reply.send({ data: data ?? [] })
    }
  )

  // ── GET /api/v1/projects/:projectId/rab/gantt ────────────────────────────
  // Data Gantt WBS: semua items dengan planned_start/end + dependencies
  app.get<{ Params: { projectId: string } }>(
    '/api/v1/projects/:projectId/rab/gantt',
    { preHandler: [authenticate] },
    async (request, reply) => {
      const { projectId } = request.params

      if (!(await proyekMilikTenant(request, projectId))) {
        return reply.status(404).send({ error: 'Proyek tidak ditemukan' })
      }

      const { data, error } = await supabase
        .from('rab_items')
        .select('id, category_code, name, level, parent_id, sort_order, progress_pct, weight_pct, planned_start, planned_end, gantt_dep_rules')
        .eq('project_id', projectId)
        .order('sort_order', { ascending: true })

      if (error) {
        app.log.error(error)
        return reply.status(500).send({ error: 'Gagal mengambil data Gantt' })
      }

      // Ambil progress logs mode=detail per rab_item untuk tanggal aktual
      // Diambil ascending agar first/earned-completion bisa dipetakan dengan benar
      const { data: logs } = await supabase
        .from('progress_logs')
        .select('rab_item_id, logged_at, pct_completion')
        .eq('project_id', projectId)
        .eq('mode', 'detail')
        .not('rab_item_id', 'is', null)
        .order('logged_at', { ascending: true })

      // Map: rab_item_id → { actual_start, actual_end, execution_end, latest_pct }
      // actual_start    = first log date (earliest activity)
      // actual_end      = first timestamp saat pct_completion >= 100 (earned completion, untuk EVM/schedule)
      // execution_end   = last log date (untuk audit aktivitas lapangan)
      // latest_pct      = pct_completion dari log terbaru
      type LogEntry = { rab_item_id: string; logged_at: string; pct_completion: number | null }
      const logMap = new Map<string, {
        actual_start: string
        actual_end: string | null    // earned completion: first time >= 100%
        execution_end: string        // latest activity (audit only)
        latest_pct: number | null
      }>()
      for (const log of (logs ?? []) as LogEntry[]) {
        const id = log.rab_item_id!
        const existing = logMap.get(id)
        if (!existing) {
          logMap.set(id, {
            actual_start:  log.logged_at,
            actual_end:    (log.pct_completion ?? 0) >= 100 ? log.logged_at : null,
            execution_end: log.logged_at,
            latest_pct:    log.pct_completion,
          })
        } else {
          // execution_end selalu update ke log terbaru
          existing.execution_end = log.logged_at
          existing.latest_pct    = log.pct_completion
          // actual_end hanya diisi saat pertama kali mencapai 100% (tidak overwrite setelahnya)
          if (!existing.actual_end && (log.pct_completion ?? 0) >= 100) {
            existing.actual_end = log.logged_at
          }
        }
      }

      const tasks = (data ?? []).map(item => {
        const actuals = logMap.get(item.id)
        return {
          id: item.id,
          no_urut: item.category_code,
          uraian: item.name,
          level: item.level === 'category' ? 1 : item.level === 'subcategory' ? 2 : 3,
          parent_id: item.parent_id,
          sort_order: item.sort_order,
          progress_pct: item.progress_pct,
          weight_pct: item.weight_pct,
          planned_start: item.planned_start,
          planned_end: item.planned_end,
          dep_rules: (item.gantt_dep_rules ?? []) as { item_id: string; threshold_pct: number | null; label: string | null }[],
          dependencies: (item.gantt_dep_rules ?? []).map((r: { item_id: string }) => r.item_id),
          actual_start:   actuals?.actual_start   ?? null,
          actual_end:     actuals?.actual_end     ?? null,
          execution_end:  actuals?.execution_end  ?? null,
          actual_pct:     actuals?.latest_pct     ?? null,
        }
      })

      return reply.send({ tasks })
    }
  )

  // ── POST /api/v1/projects/:projectId/rab/upload ──────────────────────────
  // Upload + parse Excel RAB, hapus data lama dan insert baru
  app.post<{ Params: { projectId: string } }>(
    '/api/v1/projects/:projectId/rab/upload',
    { preHandler: [authenticate, requirePermission('projects:edit')] },
    async (request, reply) => {
      const { projectId } = request.params

      if (!(await proyekMilikTenant(request, projectId))) {
        return reply.status(404).send({ error: 'Proyek tidak ditemukan' })
      }

      // Ambil file dari multipart. Cap 10MB — RAB Excel realistis < beberapa MB;
      // 100MB lama = anomali (cap lain 2/5MB) + risiko DoS/memori (AKTA 1 census B2).
      const file = await request.file({ limits: { fileSize: 10 * 1024 * 1024 } })
      if (!file) {
        return reply.status(400).send({ error: 'File tidak ditemukan' })
      }

      const ext = file.filename.split('.').pop()?.toLowerCase()
      if (!ext || !['xlsx', 'xls', 'ods'].includes(ext)) {
        return reply.status(400).send({ error: 'Format file harus .xlsx, .xls, atau .ods' })
      }

      // Baca buffer — tidak ada cap ukuran untuk file RAB
      const chunks: Buffer[] = []
      for await (const chunk of file.file) {
        chunks.push(chunk as Buffer)
      }
      const buffer = Buffer.concat(chunks)

      // Parse Excel — XLSX.read berjalan sinkron
      let rows: RabRow[]
      try {
        const workbook = XLSX.read(buffer, { type: 'buffer' })
        rows = parseRabSheet(workbook)
      } catch (e) {
        app.log.error(e)
        return reply.status(400).send({ error: 'Gagal membaca file Excel. Pastikan format file valid.' })
      }

      if (rows.length === 0) {
        return reply.status(400).send({ error: 'Tidak ada data RAB yang dapat diparse dari file ini' })
      }

      // Hitung bobot jika tidak ada di file
      const hasAnyBobot = rows.some(r => r.weight_pct !== null && r.weight_pct !== undefined)
      if (!hasAnyBobot) computeWeights(rows)

      // Hapus RAB lama: item dulu → subcategory → category (urutan penting karena self-ref FK)
      for (const level of ['item', 'subcategory', 'category']) {
        const { error: deleteError } = await supabase
          .from('rab_items')
          .delete()
          .eq('project_id', projectId)
          .eq('level', level)
        if (deleteError) {
          app.log.error(deleteError)
          return reply.status(500).send({ error: 'Gagal menghapus data RAB lama' })
        }
      }

      // 3-pass insert menggunakan parentIdx (index dalam array rows) sebagai referensi.
      // Diperlukan karena sub-item komponen bisa punya item-container sebagai parent.
      //
      // Pass 1: category
      // Pass 2: subcategory + item-container (item dengan sub-item di bawahnya)
      // Pass 3: item biasa + sub-item komponen (parent sudah ada dari pass 1+2)

      // Tentukan mana item-container: item yang menjadi parentIdx dari item lain
      const idByArrayIdx = new Map<number, string>()
      const isContainer = new Set(rows.map(r => r.parentIdx).filter((p): p is number => p !== undefined))

      // Helper: insert batch dan daftarkan UUID ke idByArrayIdx
      async function insertBatch(
        batch: Array<{ r: RabRow; idx: number }>,
        errorMsg: string
      ): Promise<string | null> {
        if (batch.length === 0) return null
        const { data: inserted, error } = await supabase
          .from('rab_items')
          .insert(batch.map(({ r }) => ({
            project_id:    projectId,
            level:         r.level,
            category_code: r.no || null,
            name:          r.name,
            qty:           r.level === 'item' ? r.qty : null,
            unit:          r.level === 'item' ? r.unit : null,
            unit_price:    r.level === 'item' ? r.unit_price : null,
            total_price:   r.total_price,
            weight_pct:    r.weight_pct ?? 0,
            progress_pct:  0,
            sort_order:    r.sort_order,
            parent_id:     r.parentIdx !== undefined ? (idByArrayIdx.get(r.parentIdx) ?? null) : null,
          })))
          .select('id, sort_order')
        if (error) { app.log.error(error); return errorMsg }
        const sortToId = new Map((inserted ?? []).map(c => [c.sort_order, c.id]))
        for (const { r, idx } of batch) {
          const id = sortToId.get(r.sort_order)
          if (id) idByArrayIdx.set(idx, id)
        }
        return null
      }

      const indexed = rows.map((r, idx) => ({ r, idx }))

      // Pass 1: category
      const err1 = await insertBatch(
        indexed.filter(({ r }) => r.level === 'category'),
        'Gagal menyimpan kategori RAB'
      )
      if (err1) return reply.status(500).send({ error: err1 })

      // Pass 2: subcategory + item-container (item yang parentIdx-nya ada di isContainer)
      const err2 = await insertBatch(
        indexed.filter(({ r, idx }) => r.level === 'subcategory' || (r.level === 'item' && isContainer.has(idx))),
        'Gagal menyimpan sub-kategori / item container RAB'
      )
      if (err2) return reply.status(500).send({ error: err2 })

      // Pass 3: item biasa + sub-item komponen (semua item yang belum di-insert)
      const err3 = await insertBatch(
        indexed.filter(({ r, idx }) => r.level === 'item' && !isContainer.has(idx)),
        'Gagal menyimpan item RAB'
      )
      if (err3) return reply.status(500).send({ error: err3 })

      // Ambil semua data yang baru diinsert
      const { data: allRab, error: fetchError } = await supabase
        .from('rab_items')
        .select('*')
        .eq('project_id', projectId)
        .order('sort_order', { ascending: true })

      if (fetchError) {
        return reply.send({ data: [], message: 'Upload berhasil tapi gagal mengambil data' })
      }

      return reply.send({
        data: allRab ?? [],
        message: `Berhasil mengimport ${rows.length} baris RAB`,
      })
    }
  )

  // ── PATCH /api/v1/projects/:projectId/rab/:itemId ────────────────────────
  // Update progress_pct dan/atau komponen biaya satu item RAB
  app.patch<{
    Params: { projectId: string; itemId: string }
    Body: {
      progress_pct?: number
      material_pct?: number
      upah_pct?: number
      alat_pct?: number
      other_pct?: number
    }
  }>(
    '/api/v1/projects/:projectId/rab/:itemId',
    { preHandler: [authenticate, requirePermission('projects:edit')] },
    async (request, reply) => {
      const { projectId, itemId } = request.params

      if (!(await proyekMilikTenant(request, projectId))) {
        return reply.status(404).send({ error: 'Proyek tidak ditemukan' })
      }
      const { progress_pct, material_pct, upah_pct, alat_pct, other_pct } = request.body

      const updateFields: Record<string, unknown> = { updated_at: new Date().toISOString() }

      if (progress_pct !== undefined) {
        if (progress_pct < 0 || progress_pct > 100) {
          return reply.status(400).send({ error: 'progress_pct harus antara 0 dan 100' })
        }
        updateFields.progress_pct = progress_pct
      }

      // Update komponen biaya jika ada field yang dikirim
      const hasPct = material_pct !== undefined || upah_pct !== undefined || alat_pct !== undefined || other_pct !== undefined
      if (hasPct) {
        const mat = material_pct ?? 0
        const upah = upah_pct ?? 0
        const alat = alat_pct ?? 0
        const other = other_pct ?? 0
        const total = mat + upah + alat + other
        // Validasi: total = 0 (belum diisi) atau = 100 (dengan toleransi 0.1)
        if (total !== 0 && (total < 99.9 || total > 100.1)) {
          return reply.status(400).send({ error: `Total komponen biaya harus 0 (belum diisi) atau 100 (didapat: ${total.toFixed(2)})` })
        }
        updateFields.material_pct = mat
        updateFields.upah_pct = upah
        updateFields.alat_pct = alat
        updateFields.other_pct = other
      }

      if (Object.keys(updateFields).length === 1) {
        return reply.status(400).send({ error: 'Tidak ada field yang diupdate' })
      }

      const { data, error } = await supabase
        .from('rab_items')
        .update(updateFields)
        .eq('id', itemId)
        .eq('project_id', projectId)
        .select('*')
        .single()

      if (error) {
        app.log.error(error)
        return reply.status(500).send({ error: 'Gagal memperbarui item RAB' })
      }

      // Audit: override komponen biaya RAB (rab_materials.override)
      if (hasPct) {
        void logAuditEvent(request, {
          tableName: 'rab_items',
          recordId: itemId,
          action: 'rab_materials.override',
          actorId: request.currentUser!.id,
          newValues: {
            material_pct: data.material_pct, upah_pct: data.upah_pct,
            alat_pct: data.alat_pct, other_pct: data.other_pct,
          },
          severity: 'warning',
        })
      }

      // Bubble-up recalculation jika progress berubah (sama seperti progress.ts mode=detail)
      // Logic diekstrak ke lib/rab-aggregation.ts (Task 1.2.3, testable tanpa HTTP/DB;
      // sebelumnya duplikat identik di rab.ts dan progress.ts)
      if (progress_pct !== undefined) {
        const { data: allItems } = await supabase
          .from('rab_items')
          .select('id, parent_id, level, weight_pct, progress_pct')
          .eq('project_id', projectId)

        if (allItems && allItems.length > 0) {
          const { categoryProgress, overallProgress } = bubbleUpProgress(allItems)

          const catUpdates = Array.from(categoryProgress.entries()).map(([parentId, pct]) =>
            supabase
              .from('rab_items')
              .update({ progress_pct: pct, updated_at: new Date().toISOString() })
              .eq('id', parentId)
          )
          if (catUpdates.length > 0) await Promise.all(catUpdates)

          if (overallProgress !== null) {
            await request.db!
              .from('projects')
              .update({ progress_pct: overallProgress, updated_at: new Date().toISOString() })
              .eq('id', projectId)
          }
        }
      }

      return reply.send({ data: { ...data, komponen_set: (data.material_pct > 0 || data.upah_pct > 0 || data.alat_pct > 0 || data.other_pct > 0) } })
    }
  )

  // ── PATCH /api/v1/projects/:projectId/rab/bulk-komponen ──────────────────
  // Bulk update komponen biaya beberapa items sekaligus
  app.patch<{
    Params: { projectId: string }
    Body: { items: Array<{ id: string; material_pct: number; upah_pct: number; alat_pct: number; other_pct: number }> }
  }>(
    '/api/v1/projects/:projectId/rab/bulk-komponen',
    { preHandler: [authenticate, requirePermission('projects:edit')] },
    async (request, reply) => {
      const { projectId } = request.params

      if (!(await proyekMilikTenant(request, projectId))) {
        return reply.status(404).send({ error: 'Proyek tidak ditemukan' })
      }
      const { items } = request.body

      if (!Array.isArray(items) || items.length === 0) {
        return reply.status(400).send({ error: 'items harus array tidak kosong' })
      }

      const errors: string[] = []
      for (const item of items) {
        const total = (item.material_pct ?? 0) + (item.upah_pct ?? 0) + (item.alat_pct ?? 0) + (item.other_pct ?? 0)
        if (total !== 0 && (total < 99.9 || total > 100.1)) {
          errors.push(`Item ${item.id}: total komponen = ${total.toFixed(2)} (harus 0 atau 100)`)
        }
      }

      if (errors.length > 0) {
        return reply.status(400).send({ error: errors.join('; ') })
      }

      const results = await Promise.allSettled(
        items.map(item =>
          supabase
            .from('rab_items')
            .update({
              material_pct: item.material_pct,
              upah_pct: item.upah_pct,
              alat_pct: item.alat_pct,
              other_pct: item.other_pct,
              updated_at: new Date().toISOString(),
            })
            .eq('id', item.id)
            .eq('project_id', projectId)
        )
      )

      const failedCount = results.filter(r => r.status === 'rejected').length
      return reply.send({ success: true, updated: items.length - failedCount, failed: failedCount })
    }
  )

  // ── PATCH /api/v1/projects/:projectId/rab/:itemId/gantt ──────────────────
  // Update planned dates dan dependency rules untuk Gantt
  app.patch<{
    Params: { projectId: string; itemId: string }
    Body: {
      planned_start?: string
      planned_end?: string
      dep_rules?: { item_id: string; threshold_pct?: number | null; label?: string | null }[]
    }
  }>(
    '/api/v1/projects/:projectId/rab/:itemId/gantt',
    { preHandler: [authenticate, requirePermission('projects:edit')] },
    async (request, reply) => {
      const { projectId, itemId } = request.params

      if (!(await proyekMilikTenant(request, projectId))) {
        return reply.status(404).send({ error: 'Proyek tidak ditemukan' })
      }
      const { planned_start, planned_end, dep_rules } = request.body

      const updateFields: Record<string, unknown> = { updated_at: new Date().toISOString() }
      if (planned_start !== undefined) updateFields.planned_start = planned_start || null
      if (planned_end !== undefined) updateFields.planned_end = planned_end || null
      if (dep_rules !== undefined) {
        const rules = dep_rules.map(r => ({
          item_id: r.item_id,
          threshold_pct: r.threshold_pct ?? null,
          label: r.label ?? null,
        }))
        updateFields.gantt_dep_rules = rules
        // keep legacy array in sync for backward compat
        updateFields.gantt_dependencies = rules.map(r => r.item_id)
      }

      const { data, error } = await supabase
        .from('rab_items')
        .update(updateFields)
        .eq('id', itemId)
        .eq('project_id', projectId)
        .select('id, planned_start, planned_end, gantt_dep_rules')
        .single()

      if (error) {
        app.log.error(error)
        return reply.status(500).send({ error: 'Gagal memperbarui data Gantt' })
      }

      return reply.send({ data })
    }
  )

  // ── DELETE /api/v1/projects/:projectId/rab ───────────────────────────────
  // Hapus semua RAB items untuk proyek
  app.delete<{ Params: { projectId: string } }>(
    '/api/v1/projects/:projectId/rab',
    { preHandler: [authenticate, requirePermission('projects:edit')] },
    async (request, reply) => {
      const { projectId } = request.params

      if (!(await proyekMilikTenant(request, projectId))) {
        return reply.status(404).send({ error: 'Proyek tidak ditemukan' })
      }

      const { error } = await supabase
        .from('rab_items')
        .delete()
        .eq('project_id', projectId)

      if (error) {
        app.log.error(error)
        return reply.status(500).send({ error: 'Gagal menghapus data RAB' })
      }

      return reply.send({ success: true })
    }
  )
}
