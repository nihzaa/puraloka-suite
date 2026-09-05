#!/usr/bin/env node
/**
 * Layar mobile wajib membaca bentuk balasan yang BENAR-BENAR dikirim rute.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * KENAPA PENJAGA INI ADA
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Diukur 2026-09-04, potret pertama dashboard mobile yang berhasil login:
 *
 *     Proyek Aktif        0
 *     Total Kontrak       Rp 0
 *     Invoice Belum Lunas Rp 0
 *     Kas Bersih          Rp 0
 *
 * Semuanya nol. Diukur langsung ke API produksi pada detik yang sama:
 * **15 proyek aktif, Rp 7.135.525.000 nilai kontrak.**
 *
 * Sebabnya satu tingkat sarang:
 *
 *     API mengirim   { kpis: { active_projects: 15, … } }
 *     layar membaca    data?.active_projects ?? 0
 *
 * Plus dua nama yang tak pernah cocok: `net_cash` (sebenarnya
 * `net_cash_estimate`) dan `recent_projects` (sebenarnya `projects_list`,
 * berisi 19 proyek yang tak pernah tampil).
 *
 * ── Kenapa ini bertahan tanpa satu pun gejala
 *
 * `?? 0` mengubah `undefined` jadi nol, dan **nol yang salah tak bisa
 * dibedakan dari nol yang benar**. Layar memuat cepat, tak ada galat, tak
 * ada spanduk merah — dan memberi tahu pemilik perusahaan bahwa ia punya
 * nol proyek dan nol nilai kontrak.
 *
 * Semua alat menjawab hijau:
 *
 *     tsc         `res.data` bertipe `any` dari axios; TypeScript dengan
 *                 senang hati mencocokkan apa pun ke `DashboardData`
 *     test        tak ada test yang membandingkan bentuk balasan rute
 *                 dengan tipe yang dipakai layar
 *     penjaga     nol yang memeriksa lintas-batas API↔mobile
 *     mata        nol adalah angka yang sah; tak ada yang mencurigakan
 *                 tentang perusahaan baru dengan nol proyek
 *
 * ── Yang DIJAGA
 *
 * Kunci puncak yang dibaca layar mobile dari `res.data` wajib ADA di objek
 * yang dikembalikan rutenya. Yang diperiksa BENTUK, bukan nilai — nilai
 * berubah tiap hari, bentuk tidak.
 *
 * ── Yang sengaja TIDAK dijaga
 *
 * Kedalaman penuh (`data.kpis.active_projects` sampai ke daun). Rute di repo
 * ini merakit balasannya dari banyak query, dan melacak tiap cabang lewat
 * pembacaan teks akan salah ke dua arah — melewatkan yang benar, dan
 * merahkan yang benar. Yang dijaga LAPIS PERTAMA, tempat cacat 2026-09-04
 * terjadi dan tempat kesalahan sarang paling mungkin muncul.
 *
 * Batas itu disebutkan supaya hijaunya tak dibaca sebagai "bentuk balasan
 * mobile sudah terjamin".
 *
 * ⚠ BATAS YANG TERUKUR, bukan diperkirakan.
 *
 * Uji mutasi mengembalikan KEDUA kunci datar dari cacat aslinya:
 *
 *     recent_projects   → TERTANGKAP (rute tak punya kunci itu sama sekali)
 *     active_projects   → LOLOS      (kunci itu ADA di rute — di dalam
 *                                     `kpis`, dan pembacaan lapis-pertama
 *                                     ini tak tahu ia bersarang)
 *
 * Jadi penjaga ini menangkap kunci yang SALAH NAMA, tidak kunci yang SALAH
 * SARANG. Cacat 2026-09-04 punya keduanya, dan ia hanya akan menangkap
 * separuhnya.
 *
 * Ditulis di sini alih-alih diperbaiki, karena memperbaikinya berarti
 * memodelkan sarang objek dari pembacaan teks — dan penjaga yang salah
 * merah lebih cepat dimatikan daripada penjaga yang jangkauannya sempit
 * tapi jujur. Separuh yang tertangkap tetap separuh lebih banyak daripada
 * nol, ASALKAN pembacanya tahu separuh mana.
 *
 * ── Ambang NOL
 *
 * Satu kunci yang salah = satu angka salah di layar keputusan, tanpa gejala.
 */
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { join, dirname, resolve, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const AKAR = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..')
const MOBILE = join(AKAR, 'apps', 'mobile', 'app')
const RUTE = join(AKAR, 'apps', 'api', 'src', 'routes', 'v1')

for (const [nama, p] of [['apps/mobile/app', MOBILE], ['apps/api/src/routes/v1', RUTE]]) {
  if (!existsSync(p)) {
    console.error(`❌ ${nama} tak ada di ${p} — jalurnya meleset.`)
    console.error('   Nol temuan dari korpus kosong bukan bukti apa pun.')
    process.exit(1)
  }
}

/* CR dibuang sebelum apa pun — CLAUDE.md §7a. */
const baca = (p) => readFileSync(p, 'utf8').replace(/\r/g, '')
const tanpaKomentar = (s) =>
  s.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/\/\/[^\n]*/g, ' ')

function sapu(dir, keluar = []) {
  if (!existsSync(dir)) return keluar
  for (const n of readdirSync(dir)) {
    if (n === 'node_modules' || n === '__tests__' || n.startsWith('.')) continue
    const p = join(dir, n)
    if (statSync(p).isDirectory()) sapu(p, keluar)
    else if (/\.tsx?$/.test(n)) keluar.push(p)
  }
  return keluar
}

/*
  Pasangan yang diperiksa.

  Ditulis tangan dan sengaja PENDEK: penjaga yang mencoba menemukan
  pasangannya sendiri lewat pembacaan teks akan salah ke dua arah, dan
  penjaga yang salah merah lebih cepat dimatikan daripada penjaga yang
  tak ada.

  Menambah baris di sini adalah cara memperluas jangkauannya — dan tiap
  baris baru wajib dibuktikan bisa merah lewat mutasi.
*/
const PASANGAN = [
  {
    layar: 'app/(app)/dashboard.tsx',
    rute: 'dashboard.ts',
    tipe: 'DashboardData',
  },
  /*
    Ditambahkan 2026-09-04, sesudah cacat kedua dari kelas yang sama.

    Layar notifikasi membaca `n.body`; rutenya mengirim `message`. **Nol
    dari 30 notifikasi** pernah menampilkan isinya — yang tampil cuma judul
    dan waktu, dan `?? ''` menelan seluruhnya tanpa galat.

    Yang hilang bukan hiasan: `message` memuat keterangannya ("Kasbon
    Rp 4.000.000 dari Pak Budi menunggu persetujuan Anda"), sementara
    judulnya hanya menyebut JENIS. Tanpa itu, "Izin Kerja Sudah Habis Masa
    Berlakunya" tak menyebutkan izin kerja yang MANA.

    Ini tepat kelas yang penjaga ini tangkap: kunci SALAH NAMA (bukan salah
    sarang), dan ia memang menangkapnya — terbukti lewat mutasi.
  */
  {
    layar: 'app/(app)/notifications/index.tsx',
    rute: 'notifications.ts',
    tipe: 'Notification',
  },
  /*
    Ditambahkan 2026-09-05, sesudah cacat KETIGA dari kelas yang sama —
    dan yang terbesar sejauh ini.

    `proyek/[id].tsx` adalah layar terkaya di aplikasi (tiga tab, RAB
    berhierarki, milestone, log progres). Diukur ke API produksi:

        ProgressLog membaca `log_date`  → yang ada `logged_at`
                                          (20 log bertanggal "—")
        RabItem membaca `uraian`        → yang ada `name`
                `no_urut`               → yang ada `category_code`
                `level` sebagai ANGKA   → nilainya string 'category' |
                                          'subcategory' | 'item'

    Yang terakhir tak bisa ditangkap penjaga ini (ia memeriksa NAMA kunci,
    bukan tipenya) — batas yang sudah tertulis di kepala berkas. Tapi tiga
    yang pertama bisa, dan ketiganya kelas SALAH NAMA.
  */
  {
    layar: 'app/(app)/proyek/[id].tsx',
    rute: 'projects.ts',
    tipe: 'ProgressLog',
  },
]

const temuan = []
const laporan = []

for (const { layar, rute, tipe } of PASANGAN) {
  const pLayar = join(AKAR, 'apps', 'mobile', layar)
  const pRute = join(RUTE, rute)

  for (const [nama, p] of [[layar, pLayar], [`routes/v1/${rute}`, pRute]]) {
    if (!existsSync(p)) {
      console.error(`❌ ${nama} tak ada — pasangan di PASANGAN sudah basi.`)
      console.error('   Penjaga yang memeriksa berkas yang tak ada selalu hijau.')
      process.exit(1)
    }
  }

  const kodeLayar = tanpaKomentar(baca(pLayar))
  const kodeRute = tanpaKomentar(baca(pRute))

  /*
    Kunci yang DIBACA layar: dari deklarasi `interface <tipe> { … }`.

    Diambil dari interface, bukan dari `data?.x` di JSX: interface adalah
    tempat kontraknya dinyatakan, dan membacanya menangkap juga medan yang
    dideklarasikan tetapi belum dipakai — yang justru paling mungkin salah,
    karena tak ada yang pernah melihat hasilnya di layar.
  */
  const blok = new RegExp(`interface\\s+${tipe}\\s*\\{([\\s\\S]*?)\\n\\}`).exec(kodeLayar)
  if (!blok) {
    console.error(`❌ interface ${tipe} tak ditemukan di ${layar}.`)
    console.error('   Namanya berubah, atau bentuknya bukan `interface` lagi.')
    console.error('   Nol kunci dari interface yang tak ketemu akan HIJAU — dan itu bohong.')
    process.exit(1)
  }

  /* Hanya medan LAPIS PERTAMA: baris berindentasi tepat dua spasi. */
  const kunciLayar = [
    ...new Set(
      [...blok[1].matchAll(/^ {2}([A-Za-z_][A-Za-z0-9_]*)\??\s*:/gm)].map((m) => m[1])
    ),
  ]

  if (kunciLayar.length === 0) {
    console.error(`❌ Nol kunci terbaca dari interface ${tipe} — pembacaannya meleset.`)
    process.exit(1)
  }

  /*
    Kunci yang DIKIRIM rute: dari objek yang dikembalikan.

    Rute di repo ini memulangkan lewat `return reply.send({ … })` atau
    `return { … }`. Yang dicari kunci di lapis pertama objek itu — dicocokkan
    dengan pola `^      nama:` / `^    nama:` (indentasi 4-6 spasi, bentuk
    yang dipakai berkas rute), plus bentuk singkat `nama,`.
  */
  const kunciRute = new Set()

  /* Bentuk 1: properti objek — `      nama: …` atau `      nama,` */
  for (const m of kodeRute.matchAll(/^ {4,8}([a-z_][a-z0-9_]*)\s*[:,]/gm)) {
    kunciRute.add(m[1])
  }

  /*
    Bentuk 2: daftar kolom PostgREST di dalam `.select(...)`.

    ⚠ Ditambahkan 2026-09-04 setelah penjaga ini SALAH MERAH empat kali.

    `notifications.ts` memilih kolomnya sebagai satu string berkoma:

        .select(`
          id, user_id, project_id, title, message, channel,
          is_read, read_at, action_url, sent_at, created_at, …
        `)

    Pembacaan bentuk-1 tak mengenalinya sama sekali, jadi penjaga
    melaporkan `message`, `created_at`, `action_type`, dan `priority`
    sebagai "tak pernah dikirim" — padahal keempatnya ADA, dan saya sudah
    mengukurnya langsung ke API produksi.

    Penjaga yang SALAH MERAH lebih cepat dimatikan daripada penjaga yang
    tak ada. Empat temuan palsu pada satu berkas sudah cukup untuk membuat
    orang berikutnya menganggap seluruh keluarannya sampah.

    Yang diambil: kata-kata di dalam tiap `.select( … )`, dipisah koma.
    Alias PostgREST (`nama:tabel!fk(...)`) ikut terambil sebagai `nama` —
    itu memang nama kunci yang dikirim.
  */
  for (const m of kodeRute.matchAll(/\.select\(\s*([`'"])([\s\S]*?)\1/g)) {
    for (const potong of m[2].split(',')) {
      const nama = potong.trim().split(/[:(\s]/)[0]
      if (/^[a-z_][a-z0-9_]*$/.test(nama)) kunciRute.add(nama)
    }
  }

  const hilang = kunciLayar.filter((k) => !kunciRute.has(k))

  laporan.push({
    layar,
    rute,
    dibaca: kunciLayar.length,
    dikirim: kunciRute.size,
    hilang,
  })

  for (const k of hilang) {
    temuan.push({
      layar,
      rute,
      kunci: k,
      akibat:
        `layar membaca \`data.${k}\`, dan rutenya tak pernah mengirim kunci itu. ` +
        'Dengan `?? 0` hasilnya NOL di layar — dan nol yang salah tak bisa ' +
        'dibedakan dari nol yang benar.',
    })
  }
}

console.log('══ Bentuk balasan mobile cocok dengan rutenya ═════════════════')
for (const r of laporan) {
  console.log(`  ${r.layar}`)
  console.log(`    ← routes/v1/${r.rute}`)
  console.log(`    kunci dibaca layar : ${r.dibaca}`)
  console.log(`    kunci dikirim rute : ${r.dikirim}`)
  console.log(`    tak terkirim       : ${r.hilang.length}`)
}

if (temuan.length > 0) {
  console.error('')
  for (const t of temuan) {
    console.error(`  ❌ ${t.layar} — kunci \`${t.kunci}\``)
    console.error(`     ${t.akibat}`)
  }
  console.error('')
  console.error('  Diukur 2026-09-04: cacat persis ini membuat dashboard mobile')
  console.error('  menampilkan "Proyek Aktif 0 · Total Kontrak Rp 0" sementara')
  console.error('  API mengirim 15 proyek dan Rp 7,14 miliar. Tak ada galat,')
  console.error('  tak ada spanduk merah, dan layarnya memuat cepat.')
  console.error('')
  process.exit(1)
}

console.log('')
console.log('✅ Tiap kunci yang dibaca layar mobile benar-benar dikirim rutenya.')
console.log('   Batas: yang diperiksa LAPIS PERTAMA. Kedalaman penuh sengaja')
console.log('   tak dijaga — hijaunya bukan "bentuk balasan mobile terjamin".')
