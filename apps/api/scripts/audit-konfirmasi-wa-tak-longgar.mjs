#!/usr/bin/env node
/**
 * PENJAGA — konfirmasi WhatsApp tak boleh dicocokkan LONGGAR. Ambang NOL.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * APA YANG DIJAGA, DAN KENAPA KEGAGALANNYA SENYAP
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Di WhatsApp, kata "ya" adalah satu-satunya yang memisahkan usulan dari
 * kasbon yang benar-benar tercatat atas nama seseorang.
 *
 * Cara paling wajar menuliskannya juga yang paling berbahaya:
 *
 *     if (teks.toLowerCase().includes('ya')) …        ← SALAH
 *
 * Kalimat "yang penting jangan dulu" memuat "ya", dan `includes()` akan
 * menyimpan kasbon yang justru sedang ditolak. Tak ada galat, tak ada gejala:
 * yang mengetiknya baru tahu saat approver bertanya.
 *
 * Karena itu pencocokan HARUS atas pesan yang sudah dinormalkan dan
 * dibandingkan UTUH (`Set.has`), bukan `includes`/`startsWith`/regex tanpa
 * jangkar.
 *
 * ── Dua hal lain yang ikut dijaga
 *
 *   2. Jendela konfirmasi kalimat wajib LEBIH PENDEK dari umur token (15
 *      menit). Token web aman selama 15 menit karena tombolnya menempel pada
 *      usulan yang terlihat; kalimat tak menempel pada apa pun.
 *
 *   3. `tokenMenunggu` wajib menyaring `user_id` DI BASIS. Menyaringnya di
 *      memori berarti token orang lain sempat terbaca, dan satu `[0]` yang
 *      keliru cukup untuk mengklaim kasbon orang lain di tenant yang sama.
 *
 * ── Dibuktikan bisa MERAH
 *
 * Mutasi sengaja (2026-08-16): `includes` disuntikkan → MERAH; jendela
 * dinaikkan ke 20 menit → MERAH; `.eq('user_id'…)` dihapus → MERAH. Penjaga
 * yang tak pernah merah adalah hiasan.
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const akar = join(dirname(fileURLToPath(import.meta.url)), '..')
const berkas = join(akar, 'src/lib/tulis-konfirmasi-wa.ts')

const pelanggaran = []
let isi

try {
  isi = readFileSync(berkas, 'utf8')
} catch {
  console.error(`✗ ${berkas} tidak ditemukan.`)
  console.error('  Konfirmasi WhatsApp adalah gerbang; menghapusnya butuh ratifikasi.')
  process.exit(1)
}

/*
 * Baris yang benar-benar MEMUTUSKAN, bukan seluruh berkas.
 *
 * Empat kali di repo ini penjaga hijau-karena-buta: mencocokkan seluruh
 * berkas berarti komentar yang MENJELASKAN bahaya ikut dihitung sebagai
 * bukti bahwa bahayanya ditangani. Di sini komentar justru menyebut
 * `includes()` sebagai contoh yang SALAH — mencocokkan mentah akan
 * merahkan berkas yang benar.
 */
const baris = isi
  .split('\n')
  .map((t, i) => ({ n: i + 1, t }))
  // Komentar dibuang: yang dijaga adalah KEPUTUSAN, bukan penyebutan nama.
  .filter(({ t }) => {
    const s = t.trim()
    return s && !s.startsWith('*') && !s.startsWith('//') && !s.startsWith('/*')
  })

// ── 1. Pencocokan longgar pada teks pesan ───────────────────────────────────
for (const { n, t } of baris) {
  if (/\b(?:n|teks|pesan|s)\s*\.\s*(?:includes|startsWith|endsWith|indexOf|search)\s*\(/.test(t)) {
    pelanggaran.push({
      n,
      t: t.trim(),
      apa: 'pencocokan LONGGAR pada teks pesan — "yang penting jangan dulu" memuat "ya"',
    })
  }
}

// ── 2. Niat wajib diputuskan lewat perbandingan UTUH (`Set.has`) ────────────
const adaSetHas = baris.some(({ t }) => /\b(?:YA|BATAL)\s*\.\s*has\s*\(/.test(t))
if (!adaSetHas) {
  pelanggaran.push({
    n: 0,
    t: '(tidak ditemukan)',
    apa: 'niatKonfirmasi tak lagi memakai `YA.has(...)`/`BATAL.has(...)` — '
      + 'perbandingan utuh adalah satu-satunya yang menahan "ya" di tengah kalimat',
  })
}

// ── 3. Jendela kalimat wajib lebih pendek dari umur token ───────────────────
const mJendela = isi.match(/JENDELA_KONFIRMASI_MS\s*=\s*([0-9_]+)\s*\*\s*([0-9_]+)/)
if (!mJendela) {
  pelanggaran.push({
    n: 0,
    t: '(tidak ditemukan)',
    apa: 'JENDELA_KONFIRMASI_MS tak ditemukan — jendela konfirmasi kalimat wajib dinyatakan',
  })
} else {
  const ms = Number(mJendela[1].replace(/_/g, '')) * Number(mJendela[2].replace(/_/g, ''))
  if (!(ms > 0 && ms < 15 * 60_000)) {
    pelanggaran.push({
      n: 0,
      t: `JENDELA_KONFIRMASI_MS = ${ms} ms`,
      apa: 'jendela kalimat WAJIB lebih pendek dari umur token (15 menit) — '
        + '"ya" yang datang belasan menit kemudian hampir selalu menjawab hal lain',
    })
  }
}

// ── 4. Token menunggu wajib disaring per-user DI BASIS ──────────────────────
if (!/\.eq\(\s*['"]user_id['"]\s*,\s*userId\s*\)/.test(isi)) {
  pelanggaran.push({
    n: 0,
    t: '(tidak ditemukan)',
    apa: '`tokenMenunggu` tak menyaring `user_id` di basis — token orang lain ikut terbaca',
  })
}

// ── 5. Pembatalan wajib MEMAKAI token, bukan menghapus barisnya ─────────────
if (/\.from\(\s*['"]ai_token_tulis['"]\s*\)[\s\S]{0,120}?\.delete\s*\(/.test(isi)) {
  pelanggaran.push({
    n: 0,
    t: '.delete() pada ai_token_tulis',
    apa: 'token yang dibatalkan DIHAPUS — jejak "pernah diusulkan lalu ditolak" hilang',
  })
}

if (pelanggaran.length > 0) {
  console.error('✗ Konfirmasi WhatsApp melonggar — ambang NOL.\n')
  for (const p of pelanggaran) {
    console.error(`  ${p.n > 0 ? `baris ${p.n}` : 'berkas'}: ${p.apa}`)
    console.error(`    ${p.t}\n`)
  }
  console.error('Sebabnya di kepala `audit-konfirmasi-wa-tak-longgar.mjs`.')
  process.exit(1)
}

console.log('✓ Konfirmasi WhatsApp tetap ketat (cocok utuh, jendela pendek, saring per-user).')
