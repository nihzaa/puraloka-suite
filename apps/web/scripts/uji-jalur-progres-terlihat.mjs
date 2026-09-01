#!/usr/bin/env node
/**
 * Jalur bar progres wajib TERLIHAT di atas permukaan kartunya.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * KENAPA PENJAGA INI ADA
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Diukur 2026-09-01 dengan MEMOTRET /pm-portal @1440px: tiga proyek,
 * ketiganya 0%, dan di bawah tiap judul ada RUANG KOSONG.
 *
 * Bar-nya sebenarnya ada. Jalurnya memakai `--surface-subtle` (#F9FAFB) di
 * atas kartu `--surface` (#FFFFFF) — kontras 1,05:1, praktis tak terlihat.
 * Isian 0% berarti lebar nol, jadi yang tersisa cuma jalur yang tak
 * tergambar.
 *
 * Yang dilihat orang bukan "progres nol", melainkan elemen yang GAGAL
 * DIRENDER. Dan itu keliru ke arah yang mahal: pengguna mencari masalah
 * teknis pada halaman yang sebenarnya baik-baik saja.
 *
 * ── Kenapa tak terlihat dari mana pun
 *
 * `tsc` hijau. `uji-token-css-ada` hijau — `--surface-subtle` memang ada
 * dan terdefinisi. `potret-portal-adaptif` hijau untuk ketiga
 * pengukurannya. Tak satu pun dari mereka punya pendapat soal apakah dua
 * warna bisa dibedakan mata.
 *
 * ── Yang DIJAGA
 *
 * Tiap `<div>` bergaya inline dengan `height` kecil (<= 20px) yang memakai
 * token warna sebagai latar harus memakai `--jalur-progres`, bukan token
 * yang kontrasnya terlalu rendah terhadap permukaan kartu.
 *
 * Kontras DIHITUNG dari nilai hex di globals.css, bukan ditaksir — dan
 * dihitung untuk KEDUA mode. Jalur yang terlihat di mode terang bisa
 * lenyap di gelap; itu dua warna yang berbeda dan dua pemeriksaan yang
 * berbeda.
 *
 * ── Yang TIDAK dijaga
 *
 * Pemakaian `--surface-subtle` di luar pola bar (latar `<pre>`, sel
 * kalender kosong, kerangka pemuatan) — 533 pemakaian, dan hampir semuanya
 * sah. Token yang samar memang tepat untuk latar; ia hanya salah untuk
 * wadah yang harus terlihat saat isinya nol.
 *
 * ── Ambang NOL
 *
 * Satu bar tak terlihat sudah cukup membuat halaman tampak rusak.
 */
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs'
import { join, dirname, resolve, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const AKAR = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const CSS = join(AKAR, 'app', 'globals.css')

if (!existsSync(CSS)) {
  console.error(`❌ globals.css tak ada di ${CSS} — jalurnya meleset.`)
  console.error('   Nol temuan dari korpus kosong bukan bukti apa pun.')
  process.exit(1)
}

/*
  ⚠ CR dibuang sebelum memisah baris — CLAUDE.md §7a. Pola berjangkar
  akhir-baris tak pernah cocok dengan `#F9FAFB;\r`, dan hasilnya "nol
  token terbaca" yang terlihat hijau.
*/
const barisCss = readFileSync(CSS, 'utf8').replace(/\r/g, '').split(String.fromCharCode(10))

/**
 * Nilai token per mode. Blok `:root` pertama = terang; definisi kedua
 * (di dalam blok mode gelap) menimpanya untuk mode gelap.
 */
function bacaToken() {
  const terang = {}
  const gelap = {}
  let sudahRoot = false
  let diGelap = false
  for (const l of barisCss) {
    if (/^:root\s*\{/.test(l)) { sudahRoot = true; continue }
    if (/prefers-color-scheme:\s*dark|\[data-theme=["']dark["']\]/.test(l)) diGelap = true
    const m = l.match(/^\s*(--[a-z0-9-]+):\s*(#[0-9a-fA-F]{3,8})\s*;/)
    if (!m || !sudahRoot) continue
    const [, nama, hex] = m
    if (diGelap || nama in terang) gelap[nama] = hex
    else terang[nama] = hex
  }
  return { terang, gelap }
}

const TOKEN = bacaToken()
if (Object.keys(TOKEN.terang).length === 0) {
  console.error('❌ Nol token terbaca dari globals.css — polanya meleset.')
  process.exit(1)
}

/** Luminansi relatif WCAG. */
function lum(hex) {
  const h = hex.replace('#', '')
  const p = h.length === 3 ? h.split('').map((c) => c + c) : [h.slice(0, 2), h.slice(2, 4), h.slice(4, 6)]
  const c = p.map((x) => {
    const v = parseInt(x, 16) / 255
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]
}

function kontras(a, b) {
  const x = lum(a), y = lum(b)
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05)
}

/*
  Ambang 1,2:1 — sengaja RENDAH, dan itu keputusan sadar.

  Jalur bar bukan teks dan bukan elemen yang menyampaikan informasi
  sendirian: angka persennya tertulis di sebelahnya. Ambang WCAG 3:1 tak
  berlaku, dan memaksakannya akan menghasilkan jalur gelap yang bersaing
  dengan isian bar — merusak hal yang justru harus menonjol.

  Yang dijaga: jalurnya bisa DIBEDAKAN dari kartu. 1,05:1 tidak;
  1,31:1 (nilai yang dipakai sekarang) bisa.
*/
const AMBANG = 1.2
const PERMUKAAN = '--surface'

const temuan = []
let diperiksa = 0

/** Semua .tsx di app/ dan components/. */
function sapu(dir, keluar = []) {
  if (!existsSync(dir)) return keluar
  for (const n of readdirSync(dir)) {
    if (n === 'node_modules' || n === '.next') continue
    const p = join(dir, n)
    if (statSync(p).isDirectory()) sapu(p, keluar)
    else if (n.endsWith('.tsx')) keluar.push(p)
  }
  return keluar
}

/*
  Cakupan: PORTAL saja — bukan seluruh app/.

  Pemindaian pertama menemukan 56 pelanggaran, sebagian besar di
  `app/(dashboard)/`. Sebagiannya bar progres sungguhan, sebagiannya
  bukan — `components/saklar.tsx` adalah toggle, dan polanya memungutnya
  juga lalu membandingkan `--surface` dengan dirinya sendiri (1,00:1),
  temuan yang tak berarti apa-apa.

  Menjadikan itu ambang NOL berarti memaksa perubahan lintas puluhan
  halaman yang belum satu pun diperiksa dengan mata. Penjaga yang
  menuntut perbaikan yang belum ditimbang akan dilemahkan orang pertama
  yang terhalang olehnya — dan pelemahan itu ikut membuang perlindungan
  yang sudah benar.

  Yang dijaga di sini adalah yang sudah DIUKUR: sepuluh bar di portal,
  dilihat di potret, diperbaiki, dan diverifikasi terlihat. Dashboard
  layak diperiksa juga — dengan mata, sebelum dengan penjaga.
*/
const PORTAL = ['portal', 'pm-portal', 'mandor-portal', 'admin-portal']
const berkas = [
  ...PORTAL.flatMap((p) => sapu(join(AKAR, 'app', p))),
  ...sapu(join(AKAR, 'components', 'portal')),
]

if (berkas.length === 0) {
  console.error('❌ Nol berkas .tsx ditemukan — jalurnya meleset.')
  process.exit(1)
}

console.log('══ Jalur bar progres terlihat ═════════════════════════════════')
console.log(`  berkas dipindai : ${berkas.length}`)
console.log('')

for (const f of berkas) {
  const isi = readFileSync(f, 'utf8').replace(/\r/g, '')
  /*
    Pola bar progres, dan kenapa `height` kecil + `background` SAJA tak cukup.

    Versi pertama memakai kedua syarat itu dan memungut dua hal yang bukan
    sasaran:

      components/saklar.tsx        toggle — `--surface` dibandingkan dengan
                                   dirinya sendiri, 1,00:1, temuan hampa
      components/portal/ActionCard lencana notifikasi — `--danger-bg` di
                                   bawah teks `--danger`; kontras latarnya
                                   memang rendah, dan itu BENAR

    Keduanya punya `overflow: hidden` juga, jadi itu pun bukan pembeda.

    Yang benar-benar membedakan bar progres: anaknya diberi lebar
    PERSENTASE yang dihitung. Lencana dan toggle tak punya itu — isinya
    teks atau lingkaran, bukan isian yang tumbuh.
  */
  const re = /height:\s*(\d+),[\s\S]{0,80}?background:\s*"var\((--[a-z0-9-]+)\)"[\s\S]{0,400}?width:\s*`\$\{/g
  let m
  while ((m = re.exec(isi)) !== null) {
    const tinggi = Number(m[1])
    const token = m[2]
    if (tinggi > 20) continue
    diperiksa++

    for (const [mode, peta] of [['terang', TOKEN.terang], ['gelap', TOKEN.gelap]]) {
      const jalur = peta[token] ?? TOKEN.terang[token]
      const kartu = peta[PERMUKAAN] ?? TOKEN.terang[PERMUKAAN]
      if (!jalur || !kartu) continue
      const k = kontras(jalur, kartu)
      if (k < AMBANG) {
        temuan.push({
          berkas: relative(AKAR, f).replace(/\\/g, '/'),
          token, mode, tinggi,
          kontras: k.toFixed(2),
          jalur, kartu,
        })
      }
    }
  }
}

if (diperiksa === 0) {
  console.error('❌ Nol bar progres terbaca padahal ada berkas — polanya meleset.')
  console.error('   Hijau dari korpus kosong adalah kebohongan.')
  process.exit(1)
}

console.log(`  bar diperiksa   : ${diperiksa}`)
console.log(`  ambang kontras  : ${AMBANG}:1 terhadap ${PERMUKAAN}`)
console.log(`  pelanggaran     : ${temuan.length}`)

if (temuan.length > 0) {
  console.log('')
  for (const t of temuan) {
    console.log(`  ❌ ${t.berkas}`)
    console.log(`     ${t.token} (${t.jalur}) di atas ${t.kartu} — ${t.kontras}:1 di mode ${t.mode}`)
    console.log(`     → pakai \`var(--jalur-progres)\``)
  }
  console.log('')
  console.log('  Bar 0% berarti isian selebar nol, jadi yang tersisa cuma jalurnya.')
  console.log('  Jalur yang tak terbedakan dari kartu membuat baris itu tampak')
  console.log('  seperti elemen yang GAGAL DIRENDER — dan pengguna mencari masalah')
  console.log('  teknis pada halaman yang sebenarnya baik-baik saja.')
  console.log('')
  process.exit(1)
}

console.log('')
console.log(`✅ ${diperiksa} bar progres, semuanya terlihat di mode terang dan gelap.`)
