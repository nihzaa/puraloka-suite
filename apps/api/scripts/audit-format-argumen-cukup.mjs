#!/usr/bin/env node
/**
 * PENJAGA — `format()` di migrasi SQL wajib punya argumen sebanyak placeholder-nya.
 *
 * ── Cacat yang dijaga
 *
 * Migrasi 212 dan 215 keduanya menulis
 *
 *     EXECUTE format(
 *       'CREATE POLICY %I ON %I AS RESTRICTIVE FOR ALL ...',
 *       t);            -- DUA %I, SATU argumen
 *
 * Postgres menolaknya saat DIJALANKAN, bukan saat migrasinya ditulis, dengan
 *
 *     too few arguments for format()
 *
 * Galat itu tak menyebut baris, tak menyebut nama policy, tak menyebut tabel —
 * hanya nama berkasnya. Dan karena tiap migrasi dibungkus transaksi, kegagalan
 * di blok policy me-ROLLBACK TABEL yang dibuat ratusan baris di atasnya, jadi
 * gejala berikutnya berbunyi `relation "..." does not exist` di migrasi LAIN.
 *
 * Yang lebih mahal: cacat kedua (215) tak pernah terlihat selama cacat pertama
 * (212) masih ada, karena rantainya berhenti di yang pertama. Tiga putaran CI
 * habis untuk menemukan dua cacat yang bentuknya identik dan bisa dipindai
 * sekaligus dalam sepersekian detik.
 *
 * ── Kenapa pemindai ini pernah BOHONG
 *
 * Versi pertamanya menuntut kutip literal tepat di posisi 0 sesudah `format(`.
 * Semua panggilan multi-baris — yaitu semua `CREATE POLICY` — menaruh literalnya
 * di baris BERIKUTNYA, dan dilewati diam-diam. Pemindai itu memulangkan
 * "0 temuan" pada berkas yang cacatnya masih terpasang.
 *
 * Ketahuannya HANYA lewat uji mutasi: cacatnya dipasang ulang di salinan, dan
 * pemindainya tetap hijau. Tanpa uji itu, "0 temuan" akan tercatat sebagai bukti.
 *
 * Ambang NOL.
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const AKAR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..')
const DIR = path.join(AKAR, 'db', 'migrations')

/** Potong isi `format( ... )` mulai tepat sesudah kurung buka, kurung seimbang. */
function isiPanggilan(s, mulai) {
  let i = mulai, dalam = 1, q = null, buf = ''
  while (i < s.length) {
    const ch = s[i]
    if (q) {
      buf += ch
      if (ch === q) { if (s[i + 1] === q) { buf += s[++i] } else q = null }
      i++
      continue
    }
    if (ch === "'") { q = ch; buf += ch; i++; continue }
    if (ch === '(') dalam++
    if (ch === ')') { dalam--; if (!dalam) return buf }
    buf += ch
    i++
  }
  return null
}

/** Pisah argumen di level koma teratas, hormati kutip & kurung bersarang. */
function pisahArgumen(s) {
  const out = []
  let d = 0, cur = '', q = null
  for (let i = 0; i < s.length; i++) {
    const ch = s[i]
    if (q) { cur += ch; if (ch === q) { if (s[i + 1] === q) cur += s[++i]; else q = null } continue }
    if (ch === "'") { q = ch; cur += ch; continue }
    if (ch === '(') d++
    if (ch === ')') d--
    if (ch === ',' && d === 0) { if (cur.trim()) out.push(cur.trim()); cur = ''; continue }
    cur += ch
  }
  if (cur.trim()) out.push(cur.trim())
  return out
}

const temuan = []
for (const f of fs.readdirSync(DIR).filter((x) => x.endsWith('.sql')).sort()) {
  const s = fs.readFileSync(path.join(DIR, f), 'utf8')
  const re = /\bformat\s*\(/g
  let m
  while ((m = re.exec(s))) {
    const isi = isiPanggilan(s, m.index + m[0].length)
    if (isi === null) continue

    // Literal format HARUS argumen pertama — tapi boleh didahului spasi/newline.
    const kiri = isi.replace(/^\s+/, '')
    if (!kiri.startsWith("'")) continue // format(var, ...) — tak bisa dihitung statis

    // Baca literal pertama, hormati '' sebagai escape kutip.
    let j = 1, lit = ''
    while (j < kiri.length) {
      if (kiri[j] === "'") { if (kiri[j + 1] === "'") { lit += "'"; j += 2; continue } break }
      lit += kiri[j]; j++
    }
    if (j >= kiri.length) continue // literal tak tertutup — bukan urusan penjaga ini

    // %% adalah persen harfiah, BUKAN placeholder. Buang dulu.
    const spec = (lit.replace(/%%/g, '').match(/%[IsL]/g) || []).length
    if (!spec) continue

    const sisa = kiri.slice(j + 1).replace(/^\s*,/, '')
    const args = pisahArgumen(sisa)
    if (args.length < spec) {
      temuan.push({
        berkas: f,
        baris: s.slice(0, m.index).split('\n').length,
        spec,
        args: args.length,
        cuplik: lit.replace(/\s+/g, ' ').slice(0, 64),
      })
    }
  }
}

for (const t of temuan) {
  console.error(
    `${t.berkas}:${t.baris} — ${t.spec} placeholder, ${t.args} argumen\n    ${t.cuplik}`,
  )
}
console.log(`format() kurang argumen: ${temuan.length} (ambang 0)`)
if (temuan.length) {
  console.error('\nTiap satu di antaranya MATI saat migrasi dijalankan, dengan galat')
  console.error('`too few arguments for format()` yang tak menyebut barisnya.')
  process.exit(1)
}
