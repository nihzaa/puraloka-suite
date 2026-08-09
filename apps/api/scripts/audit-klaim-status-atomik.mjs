#!/usr/bin/env node
/**
 * PENJAGA: TRANSISI STATUS FINANSIAL WAJIB DIKLAIM SECARA ATOMIK.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * KENAPA ADA
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Ditemukan 2026-08-09 saat memverifikasi rencana lapisan AI. `kasbons.ts`
 * mengklaim status secara atomik:
 *
 *     .update(data).eq('id', id).eq('status', 'pending')   ← status IKUT WHERE
 *     if (!data) → 409 "sudah berstatus X"
 *
 * Enam modul lain TIDAK. Dan yang terburuk bukan sekadar "dobel tercatat" —
 * `change-orders.ts` menulis status lalu menghitung:
 *
 *     contract_value = project.contract_value + co.total_amount_delta
 *
 * Itu baca-ubah-tulis. Dua approval yang tiba bersamaan sama-sama membaca
 * nilai lama, sama-sama menambahkan delta, dan yang kedua menimpa yang
 * pertama — **nilai kontrak bertambah dua kali**. Tanpa error, tanpa test
 * merah, tanpa satu pun baris log yang aneh.
 *
 * ── Kenapa ini bukan masalah yang dibawa AI
 *
 * Risikonya sudah ada hari ini. Rencana AI hanya menambah pemanggil kedua
 * (WhatsApp) yang bisa memicunya lebih sering — dan lebih sulit ditelusuri,
 * karena dua pesan yang tiba berdekatan adalah hal biasa di WhatsApp.
 *
 * Jadi penjaga ini dibayar sekalipun lapisan AI dibatalkan.
 *
 * ── Kenapa STATIS, bukan test integrasi
 *
 * Test konkurensi yang sungguhan (dua request paralel) sudah ada tempatnya
 * dan memang harus ditulis. Tapi ia hanya menguji rute yang terpikir saat
 * menulisnya. Penjaga statis menangkap rute KETUJUH yang ditambahkan enam
 * bulan lagi oleh orang yang tak pernah membaca dokumen ini.
 *
 * ── Yang diperiksa
 *
 * Tiap pemanggilan `.update({ ... status: 'approved' | 'rejected' ... })`
 * pada tabel yang berstatus finansial WAJIB punya `.eq('status', …)` atau
 * `.in('status', …)` dalam rantai yang sama.
 *
 * ── Ratchet
 *
 * Angka LANTAI di bawah adalah jumlah pelanggaran yang diketahui saat penjaga
 * ini lahir. Ia hanya boleh TURUN. Menaikkannya butuh ratifikasi (G-5).
 *
 * Pakai:  node apps/api/scripts/audit-klaim-status-atomik.mjs
 */
import { readFileSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const RUTE = resolve(__dirname, '..', 'src', 'routes', 'v1')

/**
 * LANTAI — turunkan seiring modul diperbaiki, jangan pernah dinaikkan.
 *
 * **10 pada 2026-08-09, DIUKUR — bukan diperkirakan.**
 *
 *   APPROVAL (10) change-orders ×2 · estimate-versions · kepatuhan-k3
 *                 lessons-learned · notifications · pengadaan-lanjutan
 *                 procurement ×2 · rantai-kontrak
 *
 * ── Riwayat angkanya, supaya tak membingungkan sesi berikutnya
 *
 *   7  perkiraan manual saya. SALAH dua arah: memuat `cash`/`submittal` yang
 *      ternyata tak melanggar, melewatkan `notifications` (jalur kedua kasbon)
 *      dan dua cacat UANG yang tak saya cari sama sekali.
 *   8  hasil ukur pertama: 6 APPROVAL + 2 UANG.
 *  10  sesudah cacat pemotongan rantai diperbaiki (lihat `rantaiUpdate`).
 *      Dua UANG hilang karena memang SUDAH diperbaiki di commit yang sama —
 *      penjaga sebelumnya buta terhadap perbaikan itu. Empat approval baru
 *      muncul karena rantainya kini benar-benar terbaca: `kepatuhan-k3`,
 *      `pengadaan-lanjutan`, `procurement` (satu lagi), `rantai-kontrak`.
 *
 * Pelajarannya: angka yang turun belum tentu kabar baik, dan angka yang naik
 * belum tentu kabar buruk. Yang menentukan adalah apakah alatnya melihat.
 *
 * Lantai diisi dari KELUARAN penjaga, bukan dari ingatan.
 *
 * `kasbons` TIDAK ada di daftar ini — ia sudah benar, dan justru jadi pola
 * yang dicontoh yang lain. Uji mutasi memakainya: lepas `.eq('status',
 * 'pending')` di sana → penjaga WAJIB melaporkannya.
 *
 * ── Kenapa ratchet ini PER BERKAS, bukan sekadar jumlah
 *
 * Uji mutasi lolos DUA KALI sebelum bentuk ini ditemukan. Yang kedua paling
 * menipu: klaim atomik `kasbons` dilepas, penjaga benar-benar melihatnya —
 * tapi pada saat yang sama satu berkas lain keluar dari daftar, jumlahnya
 * tetap 8, dan ratchet-berbasis-jumlah diam.
 *
 * Itu bukan kasus buatan. Justru begitulah kerusakan nyata masuk: satu modul
 * diperbaiki dan satu modul dirusak dalam PR yang sama, dan angka totalnya
 * menutupi keduanya.
 *
 * Jadi yang dijaga adalah HIMPUNANNYA. Berkas boleh keluar (perbaikan);
 * berkas baru masuk = MERAH, sekalipun totalnya turun.
 */
const LANTAI_BERKAS = {
  'change-orders.ts': 2,
  'estimate-versions.ts': 1,
  'kepatuhan-k3.ts': 1,
  'lessons-learned.ts': 1,
  'notifications.ts': 1,
  'pengadaan-lanjutan.ts': 1,
  'procurement.ts': 2,
  'rantai-kontrak.ts': 1,
}
const LANTAI = Object.values(LANTAI_BERKAS).reduce((a, b) => a + b, 0)

/**
 * Status yang menandai keputusan resmi. Sengaja sempit: `draft`, `sent`,
 * `confirmed` dan kawan-kawan adalah perpindahan alur biasa yang idempoten,
 * bukan gerbang yang boleh dilewati dua kali.
 */
const STATUS_KEPUTUSAN = ['approved', 'rejected']

/**
 * Nama variabel yang, bila dipakai sebagai `status:`, berisi keputusan.
 *
 * ── Kenapa daftar ini ada, padahal daftar-yang-diketik-tangan biasanya salah
 *
 * Versi pertama penjaga ini hanya mencocokkan literal `status: 'approved'`.
 * Ia melaporkan 5 pelanggaran, dan saya hampir menerimanya — padahal
 * perkiraan manual saya 7. Selisihnya ternyata BUKAN positif palsu; ia dua
 * bentuk yang tak terlihat oleh regex literal:
 *
 *   submittal.ts:528   `status: keputusan`   ← nilainya dari badan request
 *   cash.ts            `status` dari body    ← 'approved' | 'rejected'
 *
 * Dan justru bentuk itulah yang lebih berbahaya: nilainya tak terbaca di
 * tempat penulisan, jadi pembaca kode tak punya petunjuk visual bahwa baris
 * itu gerbang keputusan.
 *
 * Daftar ini memang bisa ketinggalan nama baru. Itu diterima dengan sadar:
 * penjaga yang menangkap dua bentuk lebih baik daripada penjaga yang
 * menangkap satu, dan `audit-gerbang-tenancy.mjs` sudah membuktikan bahwa
 * MENURUNKAN nama dari sumber lebih baik — tapi di sini sumbernya adalah
 * tipe TypeScript, yang tak bisa dibaca tanpa parser TS penuh.
 *
 * Kompromi: nama dicocokkan longgar (mengandung 'status'/'keputusan'), jadi
 * `statusBaru`, `keputusan`, `newStatus` semuanya tertangkap.
 */
const RE_VAR_STATUS = /^(.*status.*|.*keputusan.*)$/i

/**
 * Kolom akumulatif — yang nilainya DIHITUNG dari nilai lamanya sendiri.
 *
 * ── Temuan yang tak dicari, dan lebih berbahaya dari yang dicari
 *
 * Penjaga ini lahir untuk approval. Begitu ia diperluas ke `status` bentuk
 * variabel, ia menemukan dua tempat yang bukan approval sama sekali —
 * `finance.ts:1291` dan `termin-payment.ts:288`:
 *
 *     const newPaid = Number(invoice.amount_paid) + amountPaid
 *     …
 *     .update({ amount_paid: newPaid, amount_due: newDue, status: newStatus })
 *       .eq('id', id)                       ← nilai lama TIDAK ikut WHERE
 *
 * Dua pembayaran yang tiba bersamaan sama-sama membaca `amount_paid` lama,
 * sama-sama menambahkan, dan yang kedua MENIMPA yang pertama. Satu pembayaran
 * klien hilang dari catatan — bukan tertunda, hilang. Dan `payments`-nya
 * tetap tercatat, jadi buku kas dan invoice jadi tak cocok tanpa satu pun
 * error.
 *
 * Kelas cacatnya sama (baca-ubah-tulis tanpa klaim), akibatnya berbeda:
 * approval dobel = keputusan tercatat dua kali; pembayaran dobel = UANG
 * HILANG. Keduanya dilaporkan, dengan label yang membedakan supaya yang
 * kedua tak ikut tenggelam di antara enam approval.
 */
const KOLOM_AKUMULATIF = ['amount_paid', 'amount_due', 'paid_amount', 'total_paid']

/**
 * Buang komentar supaya contoh di dalam docstring tak ikut terhitung —
 * TAPI PERTAHANKAN JUMLAH BARISNYA.
 *
 * Versi pertama memakai `.replace(…, '')` polos, dan akibatnya tiap nomor
 * baris yang dilaporkan meleset sejauh total baris komentar di atasnya —
 * `rantai-kontrak.ts:138` sebenarnya di baris 400-an. Laporan penjaga yang
 * nomor barisnya salah lebih buruk daripada tak ada nomor baris: ia mengirim
 * pembaca ke kode yang tak bersalah, dan pembaca menyimpulkan penjaganya
 * yang keliru.
 *
 * Jadi komentar diganti baris kosong sebanyak barisnya, bukan dihapus.
 *
 * Percobaan kedua pun masih meleset: `.replace(/^\s*\/\/.*$/gm, '')` memang
 * menyisakan baris kosong, TAPI regex blok `/*…*\/` yang dijalankan lebih
 * dulu ikut memakan baris-baris di dalamnya. Cara yang benar-benar aman:
 * proses PER BARIS dan jangan pernah mengubah jumlahnya sama sekali.
 */
function tanpaKomentar(src) {
  const baris = src.split('\n')
  let dalamBlok = false
  return baris
    .map((b) => {
      const t = b.trim()
      if (dalamBlok) {
        if (t.includes('*/')) dalamBlok = false
        return ''
      }
      if (t.startsWith('/*')) {
        if (!t.includes('*/')) dalamBlok = true
        return ''
      }
      if (t.startsWith('//')) return ''
      return b
    })
    .join('\n')
}

/**
 * Ambil rantai pemanggilan yang bermula di `.update({` sampai penutupnya.
 *
 * Dihitung dengan mencocokkan kurung, BUKAN regex sampai `.select()` —
 * sebagian rute tak memanggil `.select()` sama sekali (`estimate-versions`
 * berhenti di `.eq('id', id)`), dan regex yang mengandaikannya akan diam-diam
 * melewatkannya. Penjaga yang melewatkan justru pada bentuk yang paling
 * bermasalah tak berguna.
 */
function rantaiUpdate(src) {
  const hasil = []
  // `.update({` ATAU `.update(namaVariabel)`.
  //
  // Bentuk kedua ditambahkan setelah UJI MUTASI GAGAL: klaim atomik di
  // `kasbons.ts` dilepas sengaja, dan penjaga tetap HIJAU. Penyebabnya
  // `kasbons` memakai `.update(updateData)` — objek yang dirakit di atasnya,
  // bukan literal. Jadi pola PALING AMAN di repo ini justru tak terlihat,
  // dan modul lain yang meniru bentuknya akan lolos diam-diam.
  //
  // Ini persis alasan uji mutasi wajib (CLAUDE.md §8a.2): tanpa mutasi,
  // penjaga ini akan lulus CI selamanya sambil melewatkan bentuk yang paling
  // penting dijaga.
  const re = /\.update\(\s*(\{|[A-Za-z_$][\w$]*\s*\))/g
  let m
  while ((m = re.exec(src)) !== null) {
    const literalObjek = m[1] === '{'
    let i = m.index + m[0].length - 1
    let dalam = 0
    if (literalObjek) {
      // Lewati objek argumennya…
      for (; i < src.length; i++) {
        if (src[i] === '{') dalam++
        else if (src[i] === '}') { dalam--; if (dalam === 0) { i++; break } }
      }
      // …LALU lewati `)` penutup `.update(`.
      //
      // Tanpa baris ini, `i` berhenti TEPAT di `)` itu, dan loop pemotongan di
      // bawah langsung `break` karena melihat `)` pada kedalaman nol. Seluruh
      // rantai `.eq(…)` sesudahnya tak pernah terbaca — artinya penjaga ini
      // MENUDUH kode yang justru sudah benar.
      //
      // Ketahuan 2026-08-09 saat perbaikan `finance.ts` yang sungguhan tetap
      // dilaporkan melanggar. Cacatnya ada sejak versi pertama; ia tak terlihat
      // hanya karena sampai saat itu belum ada satu pun kode yang benar untuk
      // dituduh.
      while (i < src.length && src[i] !== ')') i++
      i++
    } else {
      i = m.index + m[0].length      // tepat sesudah ')'
    }
    // lanjut sampai rantai berhenti: baris yang tak lagi diawali '.' atau ')'
    const mulai = m.index
    let j = i
    let kurung = 0
    for (; j < src.length; j++) {
      const c = src[j]
      if (c === '(') kurung++
      else if (c === ')') { if (kurung === 0) break; kurung-- }
      else if (c === ';' && kurung === 0) break
    }
    hasil.push({
      teks: src.slice(mulai, j),
      indeks: mulai,
      // Untuk `.update(namaVar)`, isi objeknya tak ada di rantai — ia dirakit
      // di atasnya. Nama variabelnya dibawa supaya perakitannya bisa dibaca.
      varObjek: literalObjek ? null : m[1].replace(/\s*\)$/, ''),
    })
  }
  return hasil
}

/**
 * Untuk `.update(updateData)`: baca perakitan variabelnya di ATAS pemanggilan.
 *
 * Dibatasi 60 baris ke belakang — cukup untuk pola "rakit lalu update" yang
 * lazim, dan cukup sempit supaya tak menyerap kode rute lain di berkas yang
 * sama (yang akan menghasilkan tuduhan palsu).
 */
function perakitanVar(src, indeks, nama) {
  const sebelum = src.slice(0, indeks).split('\n')
  const jendela = sebelum.slice(Math.max(0, sebelum.length - 60))

  // Ambil BARIS UTUH yang menyebut variabelnya, plus baris-baris sesudahnya
  // selama masih di dalam literal objek yang dibuka baris itu.
  //
  // Versi pertama memakai `\b${nama}\b[^\n]*` dan mengembalikan NOL baris
  // untuk `kasbons.ts`. Dua sebab, keduanya baru terlihat lewat uji mutasi:
  //
  //   1. `\b` gagal pada `updateData:` dan `updateData.` di sebagian mesin
  //      regex karena `nama` sendiri sudah mengandung batas kata.
  //   2. Lebih fatal: deklarasinya `const updateData: … = {` — isi objeknya
  //      ada di BARIS-BARIS BERIKUTNYA, dan pola satu-baris tak pernah
  //      melihat `status,` di dalamnya.
  //
  // Akibatnya penjaga buta persis pada pola PALING AMAN di repo ini, dan
  // uji mutasi tiga kali berturut-turut melaporkan HIJAU untuk kerusakan
  // yang nyata.
  const potong = []
  for (let i = 0; i < jendela.length; i++) {
    if (!jendela[i].includes(nama)) continue
    potong.push(jendela[i])
    // Kalau baris ini membuka objek, serap sampai penutupnya.
    let dalam = (jendela[i].match(/\{/g) || []).length - (jendela[i].match(/\}/g) || []).length
    for (let j = i + 1; j < jendela.length && dalam > 0; j++) {
      potong.push(jendela[j])
      dalam += (jendela[j].match(/\{/g) || []).length
      dalam -= (jendela[j].match(/\}/g) || []).length
    }
  }
  return potong.join('\n')
}

const pelanggaran = []

for (const berkas of readdirSync(RUTE).filter((f) => f.endsWith('.ts'))) {
  const path = join(RUTE, berkas)
  const asli = readFileSync(path, 'utf8')
  const src = tanpaKomentar(asli)

  for (const { teks, indeks, varObjek } of rantaiUpdate(src)) {
    // Untuk `.update(namaVar)`, isi objeknya dibaca dari perakitannya.
    const isi = varObjek ? teks + '\n' + perakitanVar(src, indeks, varObjek) : teks

    // Bentuk 1 — literal:  status: 'approved'  /  updateData.status = 'approved'
    const literal = STATUS_KEPUTUSAN.find((s) =>
      new RegExp(`status[:=]\\s*'${s}'`).test(isi),
    )

    // Bentuk 2 — variabel: status: keputusan   /   status: statusBaru
    // (`status: status` dari shorthand juga tertangkap: `status,`)
    let variabel = null
    const mVar = isi.match(/status[:=]\s*([A-Za-z_$][\w$]*)/)
    if (mVar && RE_VAR_STATUS.test(mVar[1])) variabel = mVar[1]
    // Shorthand `{ status, … }` — termasuk yang `status`-nya di baris sendiri
    // dengan indentasi. Versi pertama menuntut `status` tepat sesudah `{`, dan
    // karena itu MELEWATKAN `kasbons.ts:382-385`:
    //
    //     const updateData: Record<string, unknown> = {
    //       status,                    ← baris sendiri, ada indentasi
    //       updated_at: …,
    //     }
    //
    // Itu ketahuan lewat uji mutasi, bukan lewat membaca ulang regexnya.
    if (!variabel && /(^|[{,])\s*status\s*,/m.test(isi)) variabel = 'status'

    // Kolom akumulatif: bahaya walau statusnya bukan keputusan.
    const akumulatif = KOLOM_AKUMULATIF.filter((k) => new RegExp(`\\b${k}:`).test(teks))

    if (!literal && !variabel && akumulatif.length === 0) continue

    // Sudah diklaim atomik lewat status ATAU lewat nilai lama kolomnya.
    if (/\.(eq|in)\(\s*'status'/.test(teks)) continue
    if (akumulatif.some((k) => new RegExp(`\\.eq\\(\\s*'${k}'`).test(teks))) continue

    // Nomor baris dari teks ASLI supaya bisa diklik.
    const baris = src.slice(0, indeks).split('\n').length

    if (akumulatif.length > 0) {
      pelanggaran.push({
        berkas, baris, kelas: 'UANG',
        detail: `${akumulatif.join(', ')} dihitung dari nilai lama tanpa klaim`,
      })
      continue
    }

    // Transisi alur yang BUKAN gerbang keputusan — mis. mutasi lokasi aset
    // (`statusBaru = 'perawatan' | 'tersedia'`). Idempoten dan tak berkonsekuensi
    // finansial, jadi tak dituntut klaim atomik. Dikecualikan dengan syarat
    // sempit: hanya bila tak ada satu pun nilai keputusan di rantainya.
    const punyaNilaiKeputusan = /'(approved|rejected|disetujui|ditolak)'/.test(isi)
    if (variabel && !punyaNilaiKeputusan) continue

    pelanggaran.push({
      berkas, baris, kelas: 'APPROVAL',
      detail: literal ? `status: '${literal}'` : `status: ${variabel} (variabel)`,
    })
  }
}

console.log('══ Klaim status atomik pada transisi keputusan ═════════════')
console.log(`  pelanggaran : ${pelanggaran.length}`)
console.log(`  lantai      : ${LANTAI}\n`)

if (pelanggaran.length > 0) {
  const uang = pelanggaran.filter((p) => p.kelas === 'UANG')
  const appr = pelanggaran.filter((p) => p.kelas === 'APPROVAL')

  if (uang.length > 0) {
    console.log('  ── UANG: baca-ubah-tulis pada kolom akumulatif ──────────')
    console.log('     Dua pembayaran bersamaan → satu HILANG dari catatan.')
    console.log('')
    for (const p of uang) console.log(`   ${p.berkas}:${p.baris}  → ${p.detail}`)
    console.log('')
  }
  if (appr.length > 0) {
    console.log('  ── APPROVAL: transisi keputusan tanpa klaim status ─────')
    for (const p of appr) console.log(`   ${p.berkas}:${p.baris}  → ${p.detail}`)
    console.log('')
  }
}

// ── Verdikt: per BERKAS, bukan sekadar jumlah ─────────────────────────────
//
// Lihat catatan di `LANTAI_BERKAS`. Ratchet berbasis jumlah lolos saat satu
// berkas diperbaiki dan satu berkas dirusak dalam perubahan yang sama.
const sekarang = {}
for (const p of pelanggaran) sekarang[p.berkas] = (sekarang[p.berkas] ?? 0) + 1

const naik = []
for (const [berkas, n] of Object.entries(sekarang)) {
  const lantai = LANTAI_BERKAS[berkas] ?? 0
  if (n > lantai) naik.push(`${berkas}: ${lantai} → ${n}`)
}
const turun = []
for (const [berkas, lantai] of Object.entries(LANTAI_BERKAS)) {
  const n = sekarang[berkas] ?? 0
  if (n < lantai) turun.push(`${berkas}: ${lantai} → ${n}`)
}

function jelaskanPola() {
  console.error('')
  console.error('   Transisi status keputusan WAJIB mengikutkan status lama di WHERE:')
  console.error('')
  console.error("     .update({ status: 'approved', … })")
  console.error("       .eq('id', id)")
  console.error("       .eq('status', 'pending')      ← ini")
  console.error('       .select().maybeSingle()')
  console.error('')
  console.error('     if (!data) → 409, bukan diam-diam sukses')
  console.error('')
  console.error('   Untuk kolom akumulatif (amount_paid dsb), nilai LAMA yang ikut:')
  console.error("       .eq('amount_paid', invoice.amount_paid)")
  console.error('')
  console.error('   Polanya ada di apps/api/src/routes/v1/kasbons.ts:397-410.')
  console.error('   Tanpa ini, dua permintaan bersamaan sama-sama berhasil — pada')
  console.error('   change-orders itu MENGGANDAKAN nilai kontrak, dan pada invoice')
  console.error('   itu MENGHILANGKAN satu pembayaran klien.')
}

if (naik.length > 0) {
  console.error('❌ PELANGGARAN BERTAMBAH DI BERKAS:\n')
  for (const n of naik) console.error(`   ${n}`)
  jelaskanPola()
  process.exit(1)
}

if (turun.length > 0) {
  console.log('✓ Pelanggaran TURUN — perbarui LANTAI_BERKAS di kepala berkas ini:\n')
  for (const t of turun) console.log(`   ${t}`)
  process.exit(0)
}

console.log('✓ Tidak bertambah di berkas mana pun.')
