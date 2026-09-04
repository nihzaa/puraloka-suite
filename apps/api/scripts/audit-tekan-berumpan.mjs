#!/usr/bin/env node
/**
 * Tiap `Pressable` wajib memberi umpan balik saat ditekan.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * KENAPA PENJAGA INI ADA
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Diukur 2026-09-04:
 *
 *     <Pressable>          17 dipakai · 1 berumpan · **16 TELANJANG**
 *     <TouchableOpacity>   26 dipakai · semuanya aman (bawaan memudar 0.2)
 *
 * `Pressable` BAWAANNYA TIDAK MELAKUKAN APA-APA saat ditekan — tak ada
 * ripple, tak ada pudar. Umpan balik hanya muncul kalau `style` ditulis
 * sebagai fungsi `({ pressed }) => …`, atau `android_ripple` dipasang.
 *
 * Itu membuatnya LEBIH berbahaya daripada `TouchableOpacity`: keduanya
 * terlihat sama di kode, dan hanya satu yang diam total.
 *
 * ── Kenapa ini bukan soal kehalusan
 *
 * Tiga dari enam berkas yang terdampak adalah layar TULIS: `ncr/lapor`,
 * `punch/lapor`, `izin-kerja/ajukan`. Mandor menekan dengan sarung tangan,
 * layar berdebu, di bawah matahari. Tanpa umpan balik, tekanan pertama tak
 * terasa terjadi — jadi ditekan lagi.
 *
 * Hasilnya dua NCR dari satu temuan, atau dua izin kerja untuk satu
 * pekerjaan. Tak ada galat; yang muncul cuma baris kembar yang kemudian
 * disalahkan pada "mandornya dobel input".
 *
 * `ui-ux-pro-max` menempatkannya di prioritas 2 (CRITICAL — Touch &
 * Interaction): *"Instant state changes (0ms)"* adalah anti-pattern, dan
 * umpan balik wajib muncul dalam 100ms.
 *
 * ── Kenapa tak satu pun alat lain melihatnya
 *
 *     tsc                   `Pressable` tanpa `style` fungsi SAH secara tipe
 *     audit-a11y-mobile     memeriksa `accessibilityRole`/`Label`, bukan umpan
 *     audit-kontras-mobile  memeriksa warna teks
 *     potret layar          umpan balik hanya ada SAAT jari menempel;
 *                           tangkapan layar statis tak bisa memotretnya
 *
 * Yang terakhir itu penting: ini kelas cacat yang bahkan MEMOTRET tak bisa
 * temukan, karena ia hanya hidup selama 100 milidetik saat disentuh.
 *
 * ── Cara memperbaikinya
 *
 * Pakai `components/ui/Tekan.tsx` — ia memasang ripple di Android dan
 * opasitas di iOS (`platform-adaptive`), plus `hitSlop` untuk ikon kecil.
 *
 * ── Ambang NOL
 *
 * Satu tombol yang diam adalah satu baris kembar di basis, tanpa gejala.
 */
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { join, dirname, resolve, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const AKAR = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..')
const MOBILE = join(AKAR, 'apps', 'mobile')

if (!existsSync(MOBILE)) {
  console.error(`❌ apps/mobile tak ada di ${MOBILE} — jalurnya meleset.`)
  console.error('   Nol temuan dari korpus kosong bukan bukti apa pun.')
  process.exit(1)
}

/*
  `Tekan.tsx` sendiri dikecualikan: di situlah `<Pressable>` mentah memang
  harus tinggal, dan ia MEMANG memasang umpan baliknya.
*/
const DIKECUALIKAN = ['components/ui/Tekan.tsx']

function sapu(dir, keluar = []) {
  if (!existsSync(dir)) return keluar
  for (const n of readdirSync(dir)) {
    if (n === 'node_modules' || n.startsWith('.')) continue
    const p = join(dir, n)
    if (statSync(p).isDirectory()) sapu(p, keluar)
    else if (/\.tsx$/.test(n)) keluar.push(p)
  }
  return keluar
}

const berkas = [...sapu(join(MOBILE, 'app')), ...sapu(join(MOBILE, 'components'))].filter(
  (p) => !DIKECUALIKAN.includes(relative(MOBILE, p).replace(/\\/g, '/'))
)

if (berkas.length === 0) {
  console.error('❌ Nol berkas .tsx ditemukan — jalurnya meleset.')
  console.error('   Hijau dari korpus kosong adalah kebohongan.')
  process.exit(1)
}

/*
  ⚠ Tag dibaca UTUH, bukan lewat konteks baris.

  Pengukuran pertama memakai `grep -A2` dan memulangkan angka yang SALAH —
  tag `<Pressable>` di repo ini sering membentang 4-8 baris, jadi atribut
  `style={({ pressed }) => …}` sering berada di luar jendela dua baris.

  Kelas yang sama dengan CR di CLAUDE.md §7a: alat yang jendelanya terlalu
  sempit memulangkan hasil yang terlihat masuk akal.
*/
const temuan = []
let total = 0
let berumpan = 0

for (const p of berkas) {
  const isi = readFileSync(p, 'utf8').replace(/\r/g, '')
  const rel = relative(MOBILE, p).replace(/\\/g, '/')
  const baris = isi.split('\n')

  for (const m of isi.matchAll(/<Pressable\b([\s\S]*?)>/g)) {
    total++
    const atribut = m[1]
    const punyaUmpan =
      /\(\s*\{\s*pressed\s*\}\s*\)/.test(atribut) || /android_ripple/.test(atribut)
    if (punyaUmpan) {
      berumpan++
      continue
    }
    const nomorBaris = isi.slice(0, m.index).split('\n').length
    temuan.push({
      rel,
      baris: nomorBaris,
      cuplikan: (baris[nomorBaris - 1] ?? '').trim().slice(0, 60),
    })
  }
}

console.log('══ Pressable berumpan balik ═══════════════════════════════════')
console.log(`  berkas dipindai  : ${berkas.length}`)
console.log(`  <Pressable>      : ${total}`)
console.log(`  berumpan balik   : ${berumpan}`)
console.log(`  TELANJANG        : ${temuan.length}`)

if (temuan.length > 0) {
  console.error('')
  console.error('  ❌ Pressable tanpa umpan balik tekan:')
  for (const t of temuan.slice(0, 20)) {
    console.error(`     ${t.rel}:${t.baris}`)
    if (t.cuplikan) console.error(`       ${t.cuplikan}`)
  }
  if (temuan.length > 20) console.error(`     … dan ${temuan.length - 20} lagi`)
  console.error('')
  console.error('  Pakai `Tekan` — ripple di Android, opasitas di iOS:')
  console.error('')
  console.error("     import { Tekan } from '@/components/ui/Tekan'")
  console.error('     <Tekan onPress={…} accessibilityRole="button">…</Tekan>')
  console.error('')
  console.error('  `Pressable` BAWAANNYA diam total saat ditekan. Di lapangan,')
  console.error('  dengan sarung tangan dan layar berdebu, tekanan yang tak')
  console.error('  terasa terjadi akan diulang — dan di layar TULIS itu berarti')
  console.error('  dua NCR dari satu temuan. Tak ada galat; yang muncul cuma')
  console.error('  baris kembar yang lalu disalahkan pada mandornya.')
  console.error('')
  process.exit(1)
}

console.log('')
console.log('✅ Tiap Pressable memberi umpan balik saat ditekan.')
console.log('   Batas: yang diperiksa KEPUTUSAN DI KODE. Apakah umpannya')
console.log('   benar-benar terlihat di bawah matahari hanya bisa diuji di')
console.log('   perangkat — potret statis pun tak bisa memotretnya.')
