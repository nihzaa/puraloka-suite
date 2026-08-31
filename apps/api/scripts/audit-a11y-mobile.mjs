#!/usr/bin/env node
/**
 * A11Y MOBILE — tombol wajib dikenali sebagai tombol.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * KENAPA PENJAGA INI ADA, DAN KENAPA STATIS
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Repo ini menuntut WCAG 2.1 AA dan menjalankannya sungguhan di web:
 * `jalankan-a11y-lengkap.mjs` membuka 137 halaman dengan axe-core dan
 * memulangkan nol pelanggaran.
 *
 * Angka itu TIDAK mengatakan apa pun tentang aplikasi HP. axe-core bekerja
 * pada DOM; React Native tak punya DOM. Jadi seluruh mobile berjalan tanpa
 * satu pun pemeriksaan aksesibilitas sampai hari ini — dan diukur 2026-08-31,
 * 25 dari 43 elemen Pressable/TouchableOpacity tak punya
 * `accessibilityRole` MAUPUN `accessibilityLabel`. Termasuk "Keluar" di
 * dashboard dan "Kembali" di seluruh layar isian.
 *
 * TalkBack dan VoiceOver menyebut elemen semacam itu sebagai teks biasa.
 * Penggunanya tahu ada tulisan "Keluar" di layar, tapi tak diberi tahu itu
 * bisa ditekan. CLAUDE.md menulis alasan kenapa ini bukan opsional di repo
 * ini: banyak pengguna berperangkat lama dan berliterasi digital rendah —
 * dan yang paling bergantung pada pembaca layar justru mereka.
 *
 * Yang diperiksa di sini KEPUTUSAN DI KODE, bukan hasil render. Itu
 * batasnya, dan disebutkan supaya tak ada yang mengira mobile kini
 * "teraudit a11y": penjaga ini tak tahu apa-apa soal kontras warna, urutan
 * fokus, atau ukuran sasaran sentuh yang sesungguhnya. Ia menjaga SATU hal
 * yang bisa dijaga tanpa emulator.
 *
 * ── Kenapa parser kurung, bukan regex
 *
 * Versi pertama pengukur ini memakai `/<Pressable\b([\s\S]*?)>/` dan SALAH:
 * `*?>` berhenti di `>` PERTAMA, yang di JSX sering berada di dalam nilai
 * atribut —
 *
 *     style={[s.chip, proyekId === p.id && s.chipAktif]}
 *                               ^ di sini
 *
 * — sehingga atribut di baris berikutnya tak pernah terbaca. Ia melapor 38
 * dari 43 "tanpa role"; yang benar 25. Temuan palsu ke arah BANYAK MASALAH
 * menghabiskan waktu memperbaiki yang tak rusak, lalu melatih orang
 * mengabaikan laporan ini.
 *
 * Sekarang batas tag dicari dengan MENGHITUNG kurung dan tanda kutip.
 *
 * ── Ambang NOL, bukan ratchet
 *
 * Lantainya sudah nol hari ini (43/43 punya role). Ratchet cocok untuk
 * hutang yang sedang dicicil; di sini tak ada hutang tersisa, jadi yang
 * dijaga adalah keadaan bersih itu sendiri.
 *
 * ── Label sengaja TIDAK dituntut
 *
 * Teks di dalam tombol sudah dibaca pembaca layar sebagai isinya.
 * `accessibilityLabel` MENIMPA teks itu, jadi menuntutnya di mana-mana
 * justru mengundang label karangan yang lebih buruk daripada teks aslinya.
 * Ia hanya perlu saat tombol tak berteks (ikon), dan penjaga ini tak bisa
 * membedakannya dari kode dengan andal — jadi ia tak berpura-pura bisa.
 */
import { readFileSync, readdirSync } from 'node:fs'
import { join, dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const AKAR = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..')
const MOBILE = join(AKAR, 'apps', 'mobile')
const AMBANG = Number(process.env.AMBANG_A11Y_MOBILE ?? 0)

function jelajah(d, hasil = []) {
  let isi
  try { isi = readdirSync(d, { withFileTypes: true }) } catch { return hasil }
  for (const e of isi) {
    if (e.name === 'node_modules' || e.name.startsWith('.')) continue
    const f = join(d, e.name)
    if (e.isDirectory()) jelajah(f, hasil)
    else if (f.endsWith('.tsx')) hasil.push(f)
  }
  return hasil
}

/**
 * Indeks '>' yang menutup tag yang dimulai di `mulai`.
 *
 * Menghitung `{}` dan tanda kutip, sehingga `>` di dalam ekspresi atribut
 * tidak dikira penutup tag. Lihat alasannya di kepala berkas.
 */
function tutupTag(isi, mulai) {
  let i = mulai
  let kurung = 0
  let kutip = null
  while (i < isi.length) {
    const c = isi[i]
    if (kutip) {
      if (c === kutip) kutip = null
    } else if (c === '"' || c === "'" || c === '`') {
      kutip = c
    } else if (c === '{') kurung++
    else if (c === '}') kurung--
    else if (c === '>' && kurung === 0) return i
    i++
  }
  return -1
}

const berkas = [
  ...jelajah(join(MOBILE, 'app')),
  ...jelajah(join(MOBILE, 'components')),
]

/*
  Korpus kosong = jalurnya meleset, BUKAN mobile yang bersih. Cacat yang
  sudah menggigit penjaga lain di repo ini (`audit-ekspor-tanpa-pemanggil`,
  dua `dirname` bukan tiga). Ambang 10 jauh di bawah jumlah nyata, jadi ia
  hanya menangkap kesalahan jalur.
*/
if (berkas.length < 10) {
  console.error(`❌ Korpus cuma ${berkas.length} berkas .tsx di ${MOBILE}`)
  console.error('   Jalurnya meleset — nol temuan dari korpus kosong bukan bukti apa pun.')
  process.exit(1)
}

let total = 0
const telanjang = []

for (const f of berkas) {
  const isi = readFileSync(f, 'utf8')
  const nama = f.replace(/\\/g, '/').replace(AKAR.replace(/\\/g, '/') + '/', '')

  for (const m of isi.matchAll(/<(Pressable|TouchableOpacity|TouchableHighlight|TouchableWithoutFeedback)\b/g)) {
    total++
    const akhir = tutupTag(isi, m.index)
    if (akhir < 0) {
      telanjang.push({ nama, baris: isi.slice(0, m.index).split('\n').length, sebab: 'tag tak tertutup' })
      continue
    }
    const tag = isi.slice(m.index, akhir)
    if (!/accessibilityRole=/.test(tag) && !/accessibilityLabel=/.test(tag)) {
      telanjang.push({ nama, baris: isi.slice(0, m.index).split('\n').length, sebab: 'tanpa role/label' })
    }
  }
}

console.log('══ A11Y mobile: tombol wajib dikenali sebagai tombol ══════════')
console.log(`  berkas .tsx       : ${berkas.length}`)
console.log(`  elemen sentuh     : ${total}`)
console.log(`  tanpa role/label  : ${telanjang.length}`)
console.log(`  ambang            : ${AMBANG}`)

if (telanjang.length > AMBANG) {
  console.log('')
  for (const t of telanjang) console.log(`  ❌ ${t.nama}:${t.baris}  ${t.sebab}`)
  console.log('')
  console.log('  Pembaca layar menyebut elemen ini teks biasa, bukan tombol.')
  console.log('  Tambahkan accessibilityRole="button" pada tag pembukanya.')
  console.log('')
  console.log(`❌ ${telanjang.length} elemen sentuh tak dikenali sebagai tombol (ambang ${AMBANG}).`)
  process.exit(1)
}

console.log('')
console.log(`✅ ${total} elemen sentuh, semuanya punya role atau label.`)
