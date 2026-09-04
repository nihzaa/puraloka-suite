#!/usr/bin/env node
/**
 * audit-dropdown-bisa-dicari.mjs — ambang NOL
 *
 * Elemen `select` mentah DILARANG di apps/web. Pakai `Pilihan` dari
 * `components/pilihan`, yang punya kotak pencarian.
 *
 * ── Kenapa
 *
 * Diminta founder 2026-09-04: "semua dropdown saya mau searchable juga",
 * lalu ditegaskan: semua, tanpa kecuali.
 *
 * Diukur sebelum: 418 kemunculan di 202 berkas. Sebagian memuat ribuan
 * pilihan — pemilih analisa di Komposer 3.040 baris — dan elemen bawaan
 * hanya bisa diloncati dengan mengetik huruf awal. Orang lapangan yang tahu
 * barangnya tapi tak hafal urutan katalog praktis tak bisa memakainya.
 *
 * ── Yang dijaga, dan yang tidak
 *
 * Yang dijaga: JSX. Penyebutan dalam KOMENTAR sengaja dibiarkan — beberapa
 * berkas menjelaskan kenapa mereka tak memakainya lagi, dan penjaga yang
 * memerahkan dokumentasi tentang dirinya sendiri mengajari orang menghapus
 * dokumentasi itu. Kelas cacat yang muncul EMPAT kali dalam satu hari di repo
 * ini (CLAUDE.md §8a.2).
 *
 * `apps/mobile` dan `apps/web-publik` di luar cakupan: React Native tak punya
 * elemen ini, dan situs publik tak memuat komponennya.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, dirname, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const AKAR = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..')
const WEB = join(AKAR, 'apps', 'web')
const NL = String.fromCharCode(10)
const CR = String.fromCharCode(13)
const TAG = '<' + 'select'

const berkas = []
;(function jelajah(d) {
  for (const n of readdirSync(d)) {
    if (n === 'node_modules' || n === '.next' || n.startsWith('.')) continue
    const p = join(d, n)
    if (statSync(p).isDirectory()) jelajah(p)
    else if (n.endsWith('.tsx')) berkas.push(p)
  }
})(WEB)

const temuan = []
for (const p of berkas) {
  if (p.endsWith('pilihan.tsx') || p.endsWith('pilihan.test.tsx')) continue

  const baris = readFileSync(p, 'utf8').split(NL)
  let dalamBlok = false

  baris.forEach((b, i) => {
    const t = b.split(CR).join('').trim()

    // lacak komentar blok
    const mulaiBlok = t.startsWith('/*') || t.startsWith('{/*')
    const komentar = dalamBlok || mulaiBlok || t.startsWith('//') || t.startsWith('*')
    if (mulaiBlok && !t.includes('*/')) dalamBlok = true
    else if (dalamBlok && t.includes('*/')) dalamBlok = false

    if (komentar) return
    if (!b.includes(TAG)) return

    temuan.push({ berkas: relative(AKAR, p), baris: i + 1, teks: t.slice(0, 68) })
  })
}

if (temuan.length > 0) {
  console.error('❌ ' + temuan.length + ' dropdown bawaan (tak bisa dicari):' + NL)
  for (const t of temuan) console.error('   ' + t.berkas + ':' + t.baris + NL + '     ' + t.teks)
  console.error(NL +
    '   Sebagian dropdown di aplikasi ini memuat ribuan pilihan — pemilih' + NL +
    '   analisa di Komposer 3.040 baris. Elemen bawaan hanya bisa diloncati' + NL +
    '   dengan mengetik huruf awal, jadi orang yang tahu barangnya tapi tak' + NL +
    '   hafal urutan katalog praktis tak bisa memakainya.' + NL + NL +
    '   Pakai: import { Pilihan } from "@/components/pilihan"' + NL +
    '   Isinya sama persis (option biasa), onChange tetap e.target.value.' + NL)
  process.exit(1)
}

console.log('✅ nol dropdown bawaan di apps/web (' + berkas.length + ' berkas dipindai)')
