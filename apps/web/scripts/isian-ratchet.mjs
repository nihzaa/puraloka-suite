#!/usr/bin/env node
/**
 * PENJAGA ISIAN — gaya kotak isian yang ditulis sendiri per halaman.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * KENAPA ADA
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Diukur 2026-08-11, sebelum K-6: **16 halaman mendefinisikan `inputStyle`
 * sendiri**, dalam **11 bentuk berbeda**, dan repo ini tak punya satu pun
 * komponen input bersama. Empat bentuk di antaranya **tak punya penanda fokus
 * sama sekali** — orang yang menavigasi dengan Tab tak tahu di mana ia berada.
 *
 * Dua cacat yang diperbaiki, bukan sekadar diseragamkan:
 *
 *   RADIUS  Seluruh varian 6px sementara kartu pembungkusnya 14px. Kontrol
 *           yang jauh lebih tajam dari wadahnya terlihat DITEMPEL, bukan
 *           bagian dari kartunya — itu yang membuat halaman terasa "tidak
 *           menyatu" tanpa bisa ditunjuk apa salahnya.
 *
 *   FOKUS   Kebanyakan hanya `outline: none`. `a11y-audit` menyebut penanda
 *           fokus wajib (WCAG 2.4.7), dan pengguna berperangkat lama justru
 *           yang paling sering memakai keyboard.
 *
 * Ini pola yang sama untuk KEEMPAT kalinya: 27 varian `<h1>` (UIR-2), 8 bentuk
 * kartu (K-2), 4 gaya tab (`audit-tab-seragam`), sekarang 11 bentuk isian.
 * Sebabnya selalu sama — halaman ditulis pada waktu berbeda dan menyalin dari
 * tetangga terdekat, dan tak ada satu pun yang salah saat ditulis. Yang
 * memperbaikinya bukan kerapian sesaat, tapi lantai yang tak bisa naik.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * DUA HAL YANG DIHITUNG
 * ══════════════════════════════════════════════════════════════════════════
 *
 *   1. `const inputStyle = { … }` yang TIDAK menyebar `GAYA_ISIAN`.
 *      Menyebar lalu menimpa satu-dua properti (mis. tinggi dipaku 38px
 *      supaya sejajar tombol) tetap sah — yang dilarang adalah menyusun
 *      border/radius/fokus dari nol lagi.
 *
 *   2. Elemen form yang memakai `GAYA_ISIAN` tetapi TANPA `isian-fokus`.
 *      Memakai gaya bersama lalu membuang cincin fokusnya menghasilkan
 *      persis cacat yang penjaga ini ada untuk mencegahnya — dan bentuknya
 *      terlihat sudah benar sekilas, jadi tak akan tertangkap saat review.
 *
 * ── Kenapa RATCHET, bukan larangan
 *
 * `mandor/_bersama/komponen.tsx` dan beberapa halaman lama masih menyusun
 * gayanya sendiri untuk alasan yang sah (portal mandor punya shell berbeda).
 * Melarang hari ini berarti menolak kode yang benar. Yang ditegakkan: **angka
 * hari ini adalah lantai.**
 *
 * ── Komentar DIBUANG lebih dulu
 *
 * Berkas `isian.tsx` dan penjaga ini sendiri MENYEBUT `inputStyle` di dalam
 * komentar. Tanpa membuang komentar, dokumentasi yang menjelaskan cacatnya
 * ikut terhitung sebagai cacat. Cacat yang sama sudah terjadi di
 * `judul-ratchet` dan `suspense-ratchet`.
 *
 * Pakai:            node apps/web/scripts/isian-ratchet.mjs
 * Kencangkan lantai: node apps/web/scripts/isian-ratchet.mjs --naikkan
 */

import { readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const AKAR = join(fileURLToPath(new URL('.', import.meta.url)), '..')
const BERKAS_LANTAI = join(AKAR, 'scripts', 'isian-lantai.json')

/** Lihat catatan "Komentar DIBUANG" di kepala berkas. */
function tanpaKomentar(s) {
  return s
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, ' ')
    .replace(/^\s*\/\/.*$/gm, ' ')
}

function tsx(dir, keluar = []) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (e.name === 'node_modules' || e.name.startsWith('.')) continue
    const p = join(dir, e.name)
    if (e.isDirectory()) tsx(p, keluar)
    else if (e.name.endsWith('.tsx') && !e.name.includes('.test.')) keluar.push(p)
  }
  return keluar
}

const pelanggar = []

for (const f of [...tsx(join(AKAR, 'app')), ...tsx(join(AKAR, 'components'))]) {
  const rel = relative(AKAR, f).split(sep).join('/')
  // Kosakata bersama itu sendiri adalah satu-satunya tempat yang benar untuk
  // menyusun gaya isian dari nol.
  if (rel === 'components/isian.tsx') continue

  const s = tanpaKomentar(readFileSync(f, 'utf8'))
  let n = 0
  const sebab = []

  // (1) Definisi gaya isian dari nol.
  for (const m of s.matchAll(/const\s+\w*[iI]nputStyle\w*[^=]*=\s*\{([\s\S]*?)\};/g)) {
    if (!/GAYA_ISIAN/.test(m[1])) {
      n++
      sebab.push('inputStyle dari nol')
    }
  }

  // (2) Elemen ber-GAYA_ISIAN yang cincin fokusnya dibuang.
  //
  // Atribut hanya dilarang memuat `<`, TIDAK `>`: `onChange={(e) =>` memuat
  // `>`, dan hampir setiap input punya itu. Versi pertama skrip pemasangan
  // melarang keduanya lalu diam-diam melewatkan 12 dari 14 berkas — kegagalan
  // yang tak menimbulkan error, hanya cocok lebih sedikit.
  for (const m of s.matchAll(
    /<(input|select|textarea)(\s(?:[^<]|\n)*?)style=\{\{?\s*\.\.\.?GAYA_ISIAN/g,
  )) {
    if (!/isian-fokus/.test(m[2])) {
      n++
      sebab.push(`<${m[1]}> tanpa isian-fokus`)
    }
  }

  if (n > 0) pelanggar.push({ berkas: rel, jumlah: n, sebab: [...new Set(sebab)] })
}

pelanggar.sort((a, b) => b.jumlah - a.jumlah)
const sekarang = pelanggar.reduce((s, p) => s + p.jumlah, 0)

/**
 * Berkas lantai WAJIB ada dan WAJIB ditulis pada jalan pertama.
 *
 * Pola yang disalin dari `judul-ratchet` hanya menyetel `lantai = sekarang`
 * di dalam `catch` tanpa menyimpannya. Akibatnya, selama berkas lantai belum
 * ada, lantai selalu SAMA DENGAN angka saat ini — penjaga tak akan pernah bisa
 * merah, apa pun yang disuntikkan.
 *
 * Itu bukan teori: bukti mutasi K-6 memergokinya. Dua pelanggaran disuntik,
 * penjaga tetap hijau dua-duanya. `judul-ratchet` lolos dari cacat yang sama
 * semata-mata karena berkas lantainya kebetulan sudah ada — penjaga baru mana
 * pun yang menyalin polanya lahir mati, dan terlihat sehat di CI.
 */
let lantai
try {
  lantai = JSON.parse(readFileSync(BERKAS_LANTAI, 'utf8'))
} catch {
  lantai = {
    nilai: sekarang,
    _catatan: 'diukur otomatis pada jalan pertama',
  }
  writeFileSync(BERKAS_LANTAI, JSON.stringify({ ...lantai, _riwayat: [] }, null, 2) + '\n')
  console.log(`(berkas lantai dibuat: ${sekarang})`)
}

const simpan = (nilai, tanda) =>
  writeFileSync(
    BERKAS_LANTAI,
    JSON.stringify(
      {
        ...lantai,
        nilai,
        _diukur: new Date().toISOString().slice(0, 10),
        _riwayat: [...(lantai._riwayat || []), `${lantai.nilai} → ${nilai}${tanda}`],
      },
      null,
      2,
    ) + '\n',
  )

if (process.argv.includes('--naikkan')) {
  simpan(sekarang, '')
  console.log(`Lantai diperbarui: ${lantai.nilai} → ${sekarang}`)
  process.exit(0)
}

console.log('══ RATCHET isian (K-6) ═════════════════════════════════════════════')
console.log(`  gaya isian buatan sendiri : ${sekarang}`)
console.log(`  lantai (maks)             : ${lantai.nilai}`)

if (sekarang > lantai.nilai) {
  console.error(`\n❌ BERTAMBAH ${sekarang - lantai.nilai}.\n`)
  console.error('   Pakai kosakata bersama, bukan gaya sendiri:')
  console.error('     import { Isian, KotakIsian, BarisIsian } from "@/components/isian"')
  console.error('     <Isian id="nama" label="Nama" bantuan="…">')
  console.error('       <KotakIsian id="nama" value={v} onChange={…} />')
  console.error('     </Isian>\n')
  console.error('   Butuh menimpa satu properti (mis. tinggi dipaku supaya')
  console.error('   sejajar tombol)? Sebar dulu, baru timpa:')
  console.error('     const inputStyle = { ...GAYA_ISIAN, height: 38 }\n')
  console.error('   Memakai GAYA_ISIAN pada <input> langsung? Cincin fokusnya')
  console.error('   TIDAK ikut — ia pseudo-class, tak bisa ditulis inline:')
  console.error('     <input className="isian-fokus" style={GAYA_ISIAN} />\n')
  console.error('   Kenapa ditegakkan: sebelum K-6 ada 11 BENTUK isian berbeda,')
  console.error('   empat di antaranya tanpa penanda fokus sama sekali (WCAG')
  console.error('   2.4.7), dan semuanya ber-radius 6px sementara kartunya 14px.\n')
  console.error('   Pelanggar terbesar:')
  for (const p of pelanggar.slice(0, 8)) {
    console.error(`     ${String(p.jumlah).padStart(3)} × ${p.berkas}  (${p.sebab.join(', ')})`)
  }
  process.exit(1)
}

if (sekarang < lantai.nilai) {
  simpan(sekarang, ' (otomatis)')
  console.log(`\n  ✅ TURUN ${lantai.nilai} → ${sekarang}. Lantai ikut turun — terkunci.\n`)
  process.exit(0)
}

console.log('\n  ✅ tidak bertambah.\n')
