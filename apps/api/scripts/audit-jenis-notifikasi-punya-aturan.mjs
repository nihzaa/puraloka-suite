#!/usr/bin/env node
// ============================================================================
// KUNCI ROUTING NOTIFIKASI WAJIB PUNYA ATURAN, DAN ATURAN WAJIB PUNYA PENERIMA
//
// ══════════════════════════════════════════════════════════════════════════
// KENAPA PENJAGA INI ADA
// ══════════════════════════════════════════════════════════════════════════
//
// `AUT-P2` di QUEUE.yaml mensyaratkan: "aturan routing punya PENERIMA (aturan
// tanpa target = notifikasi hilang senyap)". Syarat itu diperiksa sekali
// dengan tangan lalu tak pernah dimekaniskan — dan ia hanya menutup separuh
// lubang.
//
//   separuh yang dijaga  : aturan yang ADA tapi tak punya target
//   separuh yang menganga: kunci yang DIPAKAI kode dan tak punya aturan
//                          sama sekali
//
// Keduanya berujung sama: `resolveRecipients` memulangkan himpunan kosong,
// `createNotifications([])` menulis nol baris dan memulangkan sukses, dan
// rutenya membalas 200 dengan `notifications_created: 0` — tak bisa dibedakan
// dari "hari ini memang tak ada temuan". Otomasinya terlihat sehat selamanya
// sambil tak pernah memberi tahu siapa pun.
//
// ══════════════════════════════════════════════════════════════════════════
// SATU PREMIS SALAH YANG DIPERBAIKI SEBELUM PENJAGA INI DIPAKAI
// ══════════════════════════════════════════════════════════════════════════
//
// Bentuk pertama memeriksa `type: '<jenis>'` di dalam pemanggilan
// `createNotification`. Itu SALAH, dan salahnya baru terlihat saat dijalankan:
// ia menuduh sepuluh jenis, dan delapan tuduhannya keliru.
//
// `type:` bukan kunci routing. Ia kategori tampilan. Buktinya di
// `procurement.ts:689`:
//
//     const admins = await resolveRecipients('material_request_submitted', …)
//     createNotifications(admins.map(uid => ({ …, type: 'general' })))
//
// Kunci yang dicari di `notification_rules` adalah `material_request_submitted`;
// `general` tak pernah dicari sama sekali. Menuntut aturan untuk `general`
// berarti menuntut hal yang tak berpengaruh apa-apa.
//
// Dan sebaliknya, lima dari sepuluh yang dituduh memang tak lewat aturan sama
// sekali — `ncr_disposisi` menyasar `[dilaporkan_oleh, ditugaskan_ke]`,
// `kasbon_approved` menyasar `mandorId`. Penerimanya data, bukan peran.
//
// Penjaga yang salah menuduh akan dimatikan orang, bukan diperbaiki. Yang
// diperiksa sekarang adalah string yang BENAR-BENAR dicari ke basis:
// argumen pertama `resolveRecipients`.
//
// ── Yang dijaga (ambang NOL untuk keduanya)
//
//   1. tiap `resolveRecipients('<kunci>')` literal punya baris
//      `notification_rules.event_type`
//   2. tiap `notification_rules` punya ≥ 1 `notification_rule_targets`
//
// Diukur 2026-08-16: 73 kunci dipakai, 73 punya aturan, 0 aturan tanpa
// penerima. Penjaga ini MENGUNCI keadaan bersih itu, bukan menuntut perbaikan.
//
// Argumen non-literal sengaja dilewati — nilainya baru diketahui saat berjalan,
// dan menebaknya menghasilkan positif palsu (pelajaran dari premis salah di
// atas, dan dari `audit-izin-benar-ada` yang sudah lebih dulu memutuskan ini).
//
// Butuh basis. Dilewati bila DATABASE_URL tak ada (pola `audit-izin-benar-ada`).
// ============================================================================

import { readFileSync, globSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'

const AKAR_API = join(dirname(fileURLToPath(import.meta.url)), '..')

const DB = process.env.DATABASE_URL || process.env.DIRECT_URL
if (!DB) {
  console.log('  ⏭  kunci routing punya aturan: DILEWATI (tak ada DATABASE_URL)')
  process.exit(0)
}

const requireDari = createRequire(join(AKAR_API, 'package.json'))
let pg = null
try { pg = requireDari('pg') } catch { /* dilaporkan di bawah */ }
if (!pg) {
  console.log('  ⏭  kunci routing punya aturan: DILEWATI (pg tak ter-resolve)')
  process.exit(0)
}

/** kunci → daftar tempat ia dipakai */
const dipakai = new Map()

const berkas = globSync('src/**/*.ts', { cwd: AKAR_API })
  .filter((f) => !f.includes('__tests__') && !f.includes('test-utils'))

for (const rel of berkas) {
  const jalur = rel.split(String.fromCharCode(92)).join('/')
  const isi = readFileSync(join(AKAR_API, rel), 'utf8')

  // Komentar dilucuti: penjaga saudara penjaga ini pernah membaca contoh di
  // dalam komentar sebagai kode, dan mutasinya lolos karenanya.
  const kode = isi.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')

  for (const m of kode.matchAll(/resolveRecipients\(\s*'([a-z0-9_.]+)'/g)) {
    const baris = kode.slice(0, m.index).split('\n').length
    if (!dipakai.has(m[1])) dipakai.set(m[1], [])
    dipakai.get(m[1]).push(`${jalur}:${baris}`)
  }
}

const c = new pg.Client({ connectionString: DB })
await c.connect()
const { rows } = await c.query('SELECT DISTINCT event_type FROM notification_rules')
const { rows: yatim } = await c.query(`
  SELECT r.event_type FROM notification_rules r
  LEFT JOIN notification_rule_targets t ON t.rule_id = r.id
  GROUP BY r.id, r.event_type HAVING COUNT(t.id) = 0`)
await c.end()

const punyaAturan = new Set(rows.map((r) => r.event_type))
const hantu = [...dipakai.keys()].filter((k) => !punyaAturan.has(k)).sort()

let gagal = false

if (hantu.length > 0) {
  gagal = true
  console.error('\n❌ Kunci routing dipakai kode tetapi TAK ADA di `notification_rules`:\n')
  for (const k of hantu) {
    console.error(`   ✗ '${k}'`)
    for (const t of dipakai.get(k).slice(0, 4)) console.error(`        ${t}`)
  }
  console.error(`
  \`resolveRecipients\` memulangkan himpunan KOSONG untuk kunci ini, jadi
  notifikasinya tak pernah sampai ke siapa pun — sementara rutenya tetap
  membalas 200 dengan \`notifications_created: 0\`, tak bisa dibedakan dari
  "hari ini tak ada temuan".

  Perbaiki dengan menambahkan baris \`notification_rules\` (BESERTA targetnya)
  lewat migrasi maju bernomor. Mengganti kuncinya di kode juga sah — asal
  kunci penggantinya benar-benar ada.
`)
}

if (yatim.length > 0) {
  gagal = true
  console.error('\n❌ Aturan notifikasi TANPA satu pun penerima:\n')
  for (const r of yatim) console.error(`   ✗ '${r.event_type}'`)
  console.error(`
  Aturan yang cocok tetapi tak punya target menelan notifikasinya tanpa jejak,
  persis seperti aturan yang tak ada. Tambahkan \`notification_rule_targets\`,
  atau hapus aturannya supaya ketiadaannya jujur.
`)
}

if (gagal) process.exit(1)

console.log(
  `✅ kunci routing punya aturan: ${dipakai.size} kunci dipakai, semuanya punya ` +
  `aturan, ${punyaAturan.size} event_type terdaftar, 0 aturan tanpa penerima`,
)
