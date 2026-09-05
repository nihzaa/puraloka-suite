#!/usr/bin/env node
/**
 * Layar KOSONG wajib menyebut langkah berikutnya, bukan cuma keadaannya.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * KENAPA PENJAGA INI ADA
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Riset onboarding 2026-09-05 menemukan bukti kuat MENENTANG carousel
 * penjelas fitur:
 *
 *     NN/G, studi terkontrol   91% berhasil (lihat tutorial) vs 94% (lewati)
 *     Vevo, A/B 160.000 orang  login selesai naik ~10% setelah tutorial
 *                              dihapus
 *
 * Yang direkomendasikan sebagai gantinya: **contextual help** — bantuan di
 * titik yang membutuhkannya. Empty state adalah bentuk paling murninya: ia
 * muncul TEPAT saat pengguna bertanya "kenapa kosong?", dan tak mengganggu
 * siapa pun yang layarnya sudah berisi.
 *
 * ── Yang dijaga
 *
 * "Belum ada kasbon" menyatakan KEADAAN, dan berhenti di situ. Pembacanya
 * tetap tak tahu apakah ia harus menunggu, menekan sesuatu, atau menelepon
 * seseorang.
 *
 * Yang paling mahal adalah kasus KETIGA: layar yang kosong karena IZIN.
 * Penggunanya menyimpulkan aplikasinya rusak, lalu berhenti memakainya —
 * tanpa memberi tahu siapa pun, karena dari sisinya tak ada yang bisa
 * dilaporkan.
 *
 * ── Cara memeriksanya
 *
 * Komponen `<Kosong>` menuntut `petunjuk` di TIPE-nya, jadi yang memakainya
 * sudah dijaga `tsc`. Yang dijaga penjaga ini: blok kosong yang ditulis
 * TANGAN — `<View style={…empty}>` dengan satu `<Text>` di dalamnya.
 *
 * ── Ratchet, bukan ambang nol
 *
 * Sebagian empty state tulisan tangan memang sudah punya kalimat kedua
 * (mis. `kasbon/index.tsx`), dan memaksa semuanya ke `<Kosong>` dalam satu
 * commit berarti menyentuh belasan berkas sekaligus. Angka hari ini lantai:
 * boleh turun, tak boleh naik.
 */
import { existsSync, readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs'
import { join, dirname, resolve, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const AKAR = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..')
const MOBILE = join(AKAR, 'apps', 'mobile')
const LANTAI_BERKAS = join(dirname(fileURLToPath(import.meta.url)), 'kosong-mobile-lantai.json')

if (!existsSync(MOBILE)) {
  console.error(`❌ apps/mobile tak ada di ${MOBILE} — jalurnya meleset.`)
  console.error('   Nol temuan dari korpus kosong bukan bukti apa pun.')
  process.exit(1)
}

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

const berkas = [...sapu(join(MOBILE, 'app')), ...sapu(join(MOBILE, 'components'))]
if (berkas.length === 0) {
  console.error('❌ Nol berkas .tsx ditemukan — jalurnya meleset.')
  console.error('   Hijau dari korpus kosong adalah kebohongan.')
  process.exit(1)
}

/*
  CR + komentar dibuang — CLAUDE.md §7a dan §8a.2.

  ⚠ Komentar diganti SPASI yang mempertahankan barisnya, bukan satu spasi.

  Draf pertama memakai `' '` dan nomor barisnya jadi SALAH: `ncr/lapor:116`
  menunjuk `const boleh = punyaIzin(...)`, `pekerjaan:421` menunjuk isi
  perakitan larik. Keduanya tak ada hubungannya dengan empty state.

  Penjaga yang menunjuk baris yang salah memaksa orang berikutnya mencari
  sendiri — dan lebih buruk, ia membuat temuannya terlihat PALSU, jadi
  seluruh keluarannya diabaikan.

  Kelas yang sama dengan `audit-a11y-mobile.mjs` beberapa hari lalu.
*/
const bersih = (s) =>
  s
    .replace(/\r/g, '')
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, (m) => m.replace(/[^\n]/g, ' '))
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
    .replace(/\/\/[^\n]*/g, (m) => ' '.repeat(m.length))

/*
  ── Apa yang dianggap "menyebut langkah berikutnya" ────────────────────

  Tiga bentuk jawaban yang didokumentasikan di `components/ui/Kosong.tsx`,
  masing-masing dengan kata kuncinya:

      AKSI    tekan, buat, tambah, pilih, ajukan, isi, mulai, pakai, coba
      TUNGGU  akan muncul, setelah, begitu, sedang diproses, menunggu
      ORANG   hubungi, minta, tanyakan, admin, PM, atasan, mandor

  Daftar kata, bukan pemahaman — batas yang sama dengan versi sebelumnya,
  cuma dipindah ke permukaan yang benar. Yang ingin menipu penjaga ini
  cukup menulis "hubungi" tanpa maksud; yang tak diinginkan adalah orang
  JUJUR yang perbaikannya tak terbaca, dan itu yang sudah terjadi.
*/
const PETUNJUK = [
  /* AKSI */
  /\btekan\b/i, /\bbuat\b/i, /\btambah/i, /\bpilih\b/i, /\bajukan\b/i,
  /\bisi(?:kan)?\b/i, /\bmulai\b/i, /\bpakai\b/i, /\bcoba\b/i, /\bgunakan\b/i,
  /* TUNGGU */
  /akan muncul/i, /\bsetelah\b/i, /\bbegitu\b/i, /sedang diproses/i, /\bmenunggu\b/i,
  /* ORANG */
  /\bhubungi\b/i, /\bminta\b/i, /\btanyakan\b/i, /\badmin\b/i, /\bPM\b/,
  /\batasan\b/i, /\bmandor\b/i,
]

/*
  Teks yang terlihat MATA, dirakit dari satu blok JSX.

  Tag, atribut, dan `{ekspresi}` dibuang; yang tersisa kalimatnya. Tanpa
  ini `style={styles.emptyText}` menyumbang kata "empty" ke pencarian, dan
  tiap blok terlihat punya petunjuk.
*/
function tekstualkan(jsx) {
  return jsx
    .replace(/<[^>]*>/g, ' ')
    .replace(/\{[^{}]*\}/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

const berpetunjuk = (teks) => PETUNJUK.some((r) => r.test(teks))

const temuan = []

for (const p of berkas) {
  const kode = bersih(readFileSync(p, 'utf8'))
  const rel = relative(MOBILE, p).replace(/\\/g, '/')
  if (rel === 'components/ui/Kosong.tsx') continue

  const sudah = new Set()

  /*
    Bentuk PERTAMA: blok `<View style={…empty…}>` … `</View>`.
    Seluruh isinya dibaca sebagai SATU pesan — pembacanya juga begitu.
  */
  for (const m of kode.matchAll(/<View\s+style=\{[^}]*(?:empty|kosong)[^}]*\}[^>]*>([\s\S]*?)<\/View>/gi)) {
    const teks = tekstualkan(m[1])
    if (teks.length < 6) continue
    const baris = kode.slice(0, m.index).split('\n').length
    sudah.add(baris)
    if (!berpetunjuk(teks)) temuan.push({ rel, baris, cuplikan: teks.slice(0, 60) })
  }

  /*
    ── Bentuk KEDUA: `<Text>` kosong yang berdiri SENDIRI ──────────────

    ⚠ Draf pertama penjaga ini hanya mencari `<View style={…empty}>` dan
    memulangkan NOL — padahal empty state tulisan tangan masih ada di
    beberapa layar. Bentuk yang paling umum ternyata tanpa pembungkus:

        ) : projects.length === 0 ? (
          <Text style={styles.emptyText}>Belum ada proyek yang di-assign</Text>
        ) : (

    Nol temuan dari pola yang salah terlihat sama persis dengan nol temuan
    dari keadaan yang bersih — dan saya nyaris memasangnya dengan lantai 0,
    yang berarti penjaga hijau selamanya atas cacat yang masih ada.
  */
  for (const m of kode.matchAll(
    /<Text\s+style=\{[^}]*(?:emptyText|kosongIsi|emptyPetunjuk)[^}]*\}[^>]*>([\s\S]*?)<\/Text>/gi,
  )) {
    const baris = kode.slice(0, m.index).split('\n').length
    if (sudah.has(baris)) continue

    const sebelum = kode.slice(Math.max(0, m.index - 400), m.index)

    /* Sudah terhitung lewat pembungkus `<View>`? Jangan dihitung dua kali. */
    if (/<View\s+style=\{[^}]*(?:empty|kosong)[^}]*\}[^>]*>\s*(?:<Text\b[\s\S]*?<\/Text>\s*)*$/i.test(sebelum)) continue

    /*
      Gerbang izin memakai `kosongJudul` + `kosongIsi` BERPASANGAN, dan
      yang dibaca pengguna adalah keduanya. Membacanya terpisah membuat
      "Tidak ada akses" terlihat tanpa petunjuk, padahal kalimat di
      bawahnya justru menyebut siapa yang harus dihubungi — lima gerbang
      izin merah PALSU karena persis ini.
    */
    const judulDekat = /<Text\s+style=\{[^}]*kosongJudul[^}]*\}[^>]*>([\s\S]*?)<\/Text>\s*$/i.exec(sebelum)
    const teks = tekstualkan((judulDekat ? judulDekat[1] + ' ' : '') + m[1])
    if (teks.length < 6) continue
    if (!berpetunjuk(teks)) temuan.push({ rel, baris, cuplikan: teks.slice(0, 60) })
  }
}

console.log('══ Layar kosong berpetunjuk ═══════════════════════════════════')
console.log(`  berkas dipindai        : ${berkas.length}`)
console.log(`  kosong TANPA petunjuk  : ${temuan.length}`)

/*
  Lantai menyimpan DAFTAR NAMA, bukan cuma angkanya.

  Pelajaran dari `audit-daftar-mobile-virtual.mjs` (2026-09-04): merah yang
  hanya menyebut angka memaksa orang berikutnya menyisir seluruh daftar
  untuk menemukan yang baru. Diuji di sini juga — berkas baru tenggelam di
  antara 12 baris lainnya.

  CLAUDE.md §8a.2: "penjaga MERAH _dan_ menyebut namanya".
*/
const simpanan = existsSync(LANTAI_BERKAS)
  ? JSON.parse(readFileSync(LANTAI_BERKAS, 'utf8'))
  : null
const lantai = simpanan?.kosong ?? null
const lantaiDaftar = simpanan?.daftar ?? []

if (process.argv.includes('--turunkan')) {
  writeFileSync(
    LANTAI_BERKAS,
    JSON.stringify({ kosong: temuan.length, daftar: temuan.map((t) => `${t.rel}:${t.baris}`) }, null, 2) + '\n'
  )
  console.log(`\n✅ lantai kosong-mobile disetel ke ${temuan.length}`)
  process.exit(0)
}

if (lantai == null) {
  console.error(`\n❌ ${LANTAI_BERKAS} belum ada. Tetapkan lantai:`)
  console.error('   node scripts/audit-kosong-berpetunjuk.mjs --turunkan\n')
  process.exit(1)
}

console.log(`  lantai                 : ${lantai}`)

if (temuan.length > lantai) {
  const baru = temuan.filter((t) => !lantaiDaftar.includes(`${t.rel}:${t.baris}`))

  console.error('')
  console.error(`❌ BERTAMBAH: ${temuan.length} (lantai ${lantai}).`)
  console.error('')
  if (baru.length > 0) {
    console.error('  YANG BARU — ini yang menaikkan angkanya:')
    for (const t of baru) {
      console.error(`     ❌ ${t.rel}:${t.baris}${t.cuplikan ? `  "${t.cuplikan}"` : ''}`)
    }
    console.error('')
  } else {
    /*
      Angka naik tanpa nama baru berarti nomor barisnya bergeser — berkas
      di atasnya bertambah baris. Dikatakan apa adanya, bukan didiamkan.
    */
    console.error('  ⚠ Angka naik tetapi tak ada baris BARU dibanding daftar')
    console.error('    lantai — kemungkinan nomor barisnya bergeser. Setel')
    console.error('    ulang lantainya setelah diperiksa.')
    console.error('')
  }
  console.error('  Seluruh yang terhitung:')
  for (const t of temuan.slice(0, 10)) {
    console.error(`     ${t.rel}:${t.baris}${t.cuplikan ? `  "${t.cuplikan}"` : ''}`)
  }
  console.error('')
  console.error('  Pakai `<Kosong>` — ia menuntut `petunjuk` di tipenya:')
  console.error('')
  console.error("     import { Kosong } from '@/components/ui/Kosong'")
  console.error('     <Kosong ikon="…" judul="Belum ada X"')
  console.error('             petunjuk="Tekan + untuk membuat yang pertama" />')
  console.error('')
  console.error('  Layar kosong yang hanya menyatakan KEADAAN membuat pembacanya')
  console.error('  tak tahu apakah harus menunggu, menekan sesuatu, atau menelepon')
  console.error('  seseorang. Yang paling mahal: layar kosong karena IZIN dibaca')
  console.error('  sebagai aplikasi rusak, lalu ditinggalkan tanpa dilaporkan.')
  console.error('')
  process.exit(1)
}

if (temuan.length < lantai) {
  console.log('')
  console.log(`📉 Turun ${lantai - temuan.length} dari lantai — kencangkan:`)
  console.log('   node scripts/audit-kosong-berpetunjuk.mjs --turunkan')
}

console.log('')
console.log(`✅ ${temuan.length} kosong tanpa petunjuk (lantai ${lantai}) — tidak bertambah.`)
console.log('   Batas: ini pemeriksaan KATA, bukan pemahaman. Kalimat yang')
console.log('   memuat "hubungi"/"tekan" tanpa maksud benar tetap lolos.')
