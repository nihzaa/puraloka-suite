#!/usr/bin/env node
/**
 * PENJAGA: JEJAK AUDIT TIDAK BOLEH HILANG DIAM-DIAM.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * CACAT YANG MELAHIRKANNYA — DAN IA SUDAH AKTIF BERBULAN-BULAN
 * ══════════════════════════════════════════════════════════════════════════
 *
 * `audit_logs.record_id` bertipe `uuid`. Lima modul memakai `recordId` untuk
 * identitas yang BUKAN UUID:
 *
 *     kasbon_purposes    recordId: code
 *     notification_rules recordId: eventType
 *     approval_chains    recordId: entityType
 *     app_credentials    recordId: kunci
 *     jadwal_tugas       recordId: tugas
 *
 * Insert-nya ditolak basis, `logAuditEvent` menangkap galatnya, dan barisnya
 * tak pernah sampai. Diukur 2026-08-09: NOL baris audit untuk ketiga modul
 * konfigurasi itu — padahal justru merekalah yang mengubah cara sistem
 * MEMUTUSKAN. "Siapa mengubah rantai approval" adalah pertanyaan yang tak
 * punya jawaban selama itu.
 *
 * Yang membuatnya bertahan: tak ada gejala. Galatnya masuk log aplikasi, tapi
 * tak seorang pun membaca log untuk memastikan audit tertulis — orang membaca
 * AUDIT untuk memastikan sesuatu terjadi.
 *
 * Migrasi 249 + pemisahan di `logAuditEvent` memperbaikinya untuk SELURUH
 * pemanggil sekaligus. Penjaga ini menjaga perbaikan itu tetap di tempatnya.
 *
 * ── Yang diperiksa
 *
 *   J-1  `logAuditEvent` memisahkan `recordId` → `record_id` / `record_key`
 *   J-2  hanya `utils/audit.ts` yang MENULIS ke `audit_logs`
 *   J-3  kolom `via` diteruskan, bukan diabaikan
 *
 * J-2 yang paling menentukan: begitu ada penulis kedua, perbaikan di helper
 * berhenti berlaku untuknya — dan kegagalannya akan senyap dengan cara yang
 * persis sama.
 *
 * Ambang NOL.
 *
 * Pakai:  node apps/api/scripts/audit-jejak-tak-hilang.mjs
 */
import { readFileSync, readdirSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const SRC = resolve(__dirname, '..', 'src')
const HELPER = join(SRC, 'utils', 'audit.ts')

if (!existsSync(HELPER)) {
  console.error(`✗ utils/audit.ts tak ditemukan: ${HELPER}`)
  process.exit(1)
}

function berkasTs(dir) {
  const hasil = []
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name)
    if (e.isDirectory()) hasil.push(...berkasTs(p))
    else if (e.name.endsWith('.ts')) hasil.push(p)
  }
  return hasil
}

/** Buang komentar TANPA mengubah jumlah baris. */
function tanpaKomentar(src) {
  let dalamBlok = false
  return src.split('\n').map((b) => {
    const t = b.trim()
    if (dalamBlok) {
      if (t.includes('*/')) dalamBlok = false
      return ''
    }
    if (t.startsWith('/*')) {
      if (!t.includes('*/')) dalamBlok = true
      return ''
    }
    if (t.startsWith('//') || t.startsWith('*')) return ''
    return b
  }).join('\n')
}

const gagal = []
const srcHelper = tanpaKomentar(readFileSync(HELPER, 'utf8'))

// ── J-1 pemisahan record_id / record_key ─────────────────────────────────
if (!/record_key\s*:/.test(srcHelper)) {
  gagal.push({
    aturan: 'J-1',
    pesan: '`logAuditEvent` tak mengisi `record_key`',
    akibat:
      'recordId yang bukan UUID ditolak basis, dan jejaknya hilang — persis ' +
      'cacat yang membuat 5 modul konfigurasi tak punya audit sama sekali.',
  })
}
if (!/asUuidOrNull\(entry\.recordId\)/.test(srcHelper)) {
  gagal.push({
    aturan: 'J-1',
    pesan: '`recordId` tak dilewatkan `asUuidOrNull` sebelum masuk `record_id`',
    akibat: 'nilai non-UUID akan menggagalkan insert, bukan dialihkan ke record_key.',
  })
}

// ── J-3 kanal diteruskan ─────────────────────────────────────────────────
if (!/\bvia\s*:/.test(srcHelper)) {
  gagal.push({
    aturan: 'J-3',
    pesan: '`logAuditEvent` tak meneruskan kolom `via`',
    akibat:
      'approval lewat WhatsApp tak bisa dibedakan dari lewat dashboard — dan ' +
      'kalau satu kanal disalahgunakan, tak ada cara tahu tindakan mana asalnya.',
  })
}

// ── J-2 penulis tunggal ──────────────────────────────────────────────────
const penulisLain = []
for (const path of berkasTs(SRC)) {
  const rel = path.slice(SRC.length + 1).replace(/\\/g, '/')
  if (rel === 'utils/audit.ts') continue
  if (rel.includes('__tests__') || rel.includes('test-utils')) continue

  const src = tanpaKomentar(readFileSync(path, 'utf8'))
  src.split('\n').forEach((isi, i) => {
    // `.from('audit_logs')` yang diikuti operasi TULIS dalam jendela pendek.
    if (!/from\(\s*['"`]audit_logs['"`]\s*\)/.test(isi)) return
    const jendela = src.split('\n').slice(i, i + 3).join('\n')
    if (/\.(insert|upsert|update|delete)\s*\(/.test(jendela)) {
      penulisLain.push({ berkas: rel, baris: i + 1 })
    }
  })
}

for (const p of penulisLain) {
  gagal.push({
    aturan: 'J-2',
    pesan: `${p.berkas}:${p.baris} menulis ke audit_logs langsung`,
    akibat:
      'penulis kedua tak ikut perbaikan record_key/via, dan kegagalannya akan ' +
      'senyap dengan cara yang persis sama. Pakai logAuditEvent().',
  })
}

console.log('══ Jejak audit tak hilang ══════════════════════════════════')
console.log(`  berkas dipindai   : ${berkasTs(SRC).length}`)
console.log(`  penulis audit_logs: ${penulisLain.length + 1} (helper + ${penulisLain.length} lain)`)
console.log(`  pelanggaran       : ${gagal.length}`)
console.log('  ambang            : 0 (bukan ratchet)\n')

if (gagal.length > 0) {
  for (const g of gagal) {
    console.error(`   [${g.aturan}] ${g.pesan}`)
    console.error(`         → ${g.akibat}`)
  }
  console.error(`
   Audit yang gagal tersimpan TIDAK menimbulkan gejala: galatnya masuk log
   aplikasi, dan tak seorang pun membaca log untuk memastikan audit tertulis.
   Orang membaca AUDIT untuk memastikan sesuatu terjadi — dan menemukan
   kekosongan yang terlihat persis seperti "tak ada yang mengubahnya".
`)
  process.exit(1)
}

console.log('✓ Jejak audit terjaga: satu penulis, record_key & via diteruskan.')
