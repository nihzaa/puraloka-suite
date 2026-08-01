#!/usr/bin/env node
/**
 * PENJAGA CATCH SENYAP — `catch` yang menelan error tanpa jejak.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * KENAPA ADA
 * ══════════════════════════════════════════════════════════════════════════
 *
 * 18 `catch { /* ignore *\/ }` di `src/routes/` (2026-08-01), hampir semuanya
 * membungkus pengiriman notifikasi. Niatnya benar — notifikasi memang tak
 * boleh membatalkan tindakan yang sudah sah. Yang salah adalah menelan
 * pesannya.
 *
 * Bukan kekhawatiran teoretis: rantai Web Push di repo ini PUTUS berbulan-bulan
 * tanpa satu pun gejala. `sendWebPushToUsers()` punya nol pemanggil, dan
 * `createNotifications()` menulis `channel: 'push'` ke DB tanpa pernah
 * benar-benar mengirim apa pun. Tak ada error, tak ada log, tak ada keluhan —
 * karena orang yang tak menerima notifikasi tak tahu ada notifikasi.
 *
 * `catch {}` adalah persis tempat gejala semacam itu seharusnya muncul.
 *
 * ── Yang diperiksa
 *
 * `catch` yang badannya KOSONG (atau hanya berisi komentar). Yang me-log,
 * membalas error, atau melempar ulang tidak dihitung — non-blocking tetap
 * boleh, asal tidak senyap.
 *
 * ⚠️ Ambang NOL, bukan ratchet. Perbaikannya satu baris `request.log.error(…)`,
 * jadi tak ada alasan menumpuk hutang di sini.
 *
 * Jalankan: node apps/api/scripts/audit-catch-senyap.mjs
 */
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

const AKAR = join(import.meta.dirname, '..', 'src')

const AMBANG = 0

/** Direktori yang diperiksa — kode yang melayani permintaan. */
const CAKUPAN = ['routes', 'lib', 'plugins', 'utils']

function berkasTs(dir) {
  const h = []
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (e.isDirectory()) {
      if (e.name === '__tests__') continue
      h.push(...berkasTs(join(dir, e.name)))
      continue
    }
    if (e.name.endsWith('.ts')) h.push(join(dir, e.name))
  }
  return h
}

const temuan = []

for (const sub of CAKUPAN) {
  let daftar
  try {
    daftar = berkasTs(join(AKAR, sub))
  } catch {
    continue // direktori tak ada — bukan kegagalan
  }

  for (const f of daftar) {
    const rel = f.slice(f.indexOf('src')).replace(/\\/g, '/')
    const baris = readFileSync(f, 'utf8').split('\n')

    for (let i = 0; i < baris.length; i++) {
      const m = /\bcatch\s*(?:\([^)]*\))?\s*\{/.exec(baris[i])
      if (!m) continue

      // Kumpulkan badan catch sampai kurung seimbang.
      let dalam = 0
      const badan = []
      let selesai = false
      for (let k = i; k < Math.min(i + 30, baris.length); k++) {
        const teks = k === i ? baris[i].slice(m.index + m[0].length - 1) : baris[k]
        for (const ch of teks) {
          if (ch === '{') dalam++
          else if (ch === '}') {
            dalam--
            if (dalam === 0) { selesai = true; break }
          }
        }
        badan.push(teks)
        if (selesai) break
      }

      // Buang komentar & kurung — sisanya kode nyata?
      const isi = badan.join('\n')
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/\/\/[^\n]*/g, '')
        .replace(/[{}]/g, '')
        .trim()

      if (isi) continue
      temuan.push(`${rel}:${i + 1}  ${baris[i].trim().slice(0, 70)}`)
    }
  }
}

console.log(`Catch yang menelan error: ${temuan.length}`)

if (temuan.length > AMBANG) {
  console.error(`\n❌ PENJAGA CATCH SENYAP GAGAL: ${temuan.length} > ambang ${AMBANG}\n`)
  console.error('   `catch` kosong membuang justru pesan yang dibutuhkan untuk menemukan')
  console.error('   sebab kegagalan. Rantai Web Push di repo ini putus berbulan-bulan')
  console.error('   tanpa satu pun gejala — orang yang tak menerima notifikasi tak tahu')
  console.error('   ada notifikasi yang seharusnya datang.')
  console.error('\n   Perbaikan: `catch (err) { request.log.error({ err }, "…") }`.')
  console.error('   Non-blocking tetap boleh — yang dilarang adalah SENYAP.\n')
  temuan.slice(0, 20).forEach((t) => console.error(`     ${t}`))
  console.error('')
  process.exit(1)
}
