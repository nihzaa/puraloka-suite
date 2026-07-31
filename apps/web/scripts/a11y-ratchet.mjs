#!/usr/bin/env node
/**
 * PENJAGA AKSESIBILITAS STATIS — kontrol form wajib punya nama.
 *
 * ── Kenapa ada
 *
 * Audit axe-core dengan login NYATA (2026-07-31) menemukan **296 pelanggaran
 * WCAG 2.1 AA** di 17 halaman dashboard. Yang terbesar:
 *   · color-contrast ×260  · button-name ×14
 *   · select-name ×9       · label ×9   · scrollable-region-focusable ×4
 *
 * Semuanya sudah ditutup (0 pelanggaran, diverifikasi terhadap bundel
 * PRODUKSI). Yang dijaga skrip ini bukan angka hari ini, melainkan halaman
 * berikutnya — tanpa penjaga, `<select>` baru tanpa nama akan lolos persis
 * seperti 98 pendahulunya.
 *
 * ── Kenapa tidak cukup mengandalkan eslint-plugin-jsx-a11y
 *
 * Ini bagian yang mengejutkan: plugin itu SUDAH aktif penuh sejak A4, dan
 * tetap **tidak menemukan satu pun** dari 296 pelanggaran di atas. Sebabnya
 * bukan konfigurasi, melainkan batas kemampuannya:
 *   · tak ada rule untuk `<select>`/`<input>` yang berdiri TANPA label —
 *     `label-has-associated-control` hanya memeriksa `<label>` yang sudah ada,
 *     jadi kontrol yang tak punya label sama sekali tak pernah diperiksa;
 *   · `button-name` tak ada padanannya — `title=` dikira sudah cukup, padahal
 *     axe tidak menghitung `title` sebagai nama aksesibel untuk `<button>`;
 *   · kontras mustahil dilihat statis — ia hanya ada saat warna dirender.
 *
 * Jadi "lint a11y hijau" TIDAK berarti "halaman bisa dipakai pembaca layar".
 * Skrip ini menutup dua celah pertama; yang ketiga hanya bisa lewat axe.
 *
 * ── Yang TIDAK dijaga di sini (jujur soal batasnya)
 *
 * Kontras warna. Ia butuh browser + halaman ter-render + login. Menjalankan itu
 * di CI berarti menaruh kredensial di CI, dan itu ditolak sadar (lihat alasan
 * di STATUS.md soal kredensial di log CI). Jadi kontras diperiksa MANUAL dengan
 * axe saat token warna disentuh — dan token-tokennya sendiri sudah diberi
 * komentar berisi angka kontrasnya, supaya penyunting berikutnya tahu batasnya.
 *
 * Jalankan: node apps/web/scripts/a11y-ratchet.mjs
 */
import { readFileSync, readdirSync } from 'node:fs'
import { join, relative } from 'node:path'

const AKAR = join(import.meta.dirname, '..')

/**
 * AMBANG — jumlah kontrol tanpa nama aksesibel.
 *
 * ⚠️ HANYA BOLEH TURUN. Kalau gagal karena NAIK, beri `aria-label` pada
 * kontrol baru Anda — jangan naikkan angkanya.
 *
 * Angka 96/62 adalah HASIL UKUR 2026-07-31 SESUDAH detektornya diperbaiki
 * (lihat blok di bawah), bukan target yang dipilih. Sisa ini hampir semuanya
 * di dalam MODAL yang tak terbuka saat halaman dimuat, sehingga axe tak
 * menjangkaunya. Itu bukan alasan membiarkannya: modal tetap dipakai manusia.
 * Ia dicatat sebagai hutang yang terukur, bukan diklaim beres.
 */
const AMBANG = { select: 95, button: 62 }

/**
 * ⚠️ KENAPA ANGKANYA NAIK dari 83/52 — dan kenapa ini BUKAN pelanggaran
 * aturan "ratchet hanya boleh turun".
 *
 * 83/52 tak pernah nyata. Ia keluaran DETEKTOR YANG RUSAK: jendela pencarian
 * `aria-label` tidak berhenti di akhir tag pembuka, sehingga sebuah `<select>`
 * tanpa nama "meminjam" `aria-label` milik elemen BERIKUTNYA dalam 14 baris ke
 * bawah — lalu keduanya dilewati.
 *
 * Ketahuan lewat UJI MUTASI: menyisipkan `<select id="uji">` tanpa nama sama
 * sekali tidak menaikkan angkanya. Penjaga yang tak bisa gagal tidak menjaga
 * apa pun.
 *
 * Sesudah detektornya diperbaiki, hitungan JUJURnya 96/62. Jadi yang berubah
 * bukan jumlah pelanggaran (kodenya tak disentuh), melainkan kemampuan
 * melihatnya. Menurunkan paksa ke 83/52 justru akan memaksa penjaga ini
 * berbohong lagi.
 *
 * Detektornya sendiri butuh EMPAT putaran koreksi, dan tiap cacat ditemukan
 * uji mutasi — bukan review:
 *   1. jendela tak berhenti di akhir tag  → meminjam aria-label tetangga
 *   2. berhenti terlalu awal              → teks tombol di baris berikutnya terlewat
 *   3. `indexOf('>')` kena panah `() =>`  → tombol ikon-saja lolos
 *   4. daftar karakter awal terlalu sempit → 248 laporan palsu (`+`, `✓`, `←`)
 * Itu sendiri temuan: penjaga a11y yang tak diuji-mutasi cenderung hijau
 * karena BUTA, bukan karena bersih.
 *
 * Sisa 96 `<select>`: 2 sudah diberi nama otomatis oleh
 * `perbaiki-nama-aksesibel.mjs`; 75 sisanya DILEWATI dengan sengaja karena
 * namanya tak bisa diturunkan dari kode — dan nama yang salah lebih
 * menyesatkan bagi pengguna pembaca layar daripada tak ada nama. Itu hutang
 * yang terukur dan tercatat di ROADMAP, bukan yang disembunyikan.
 */

function berkasTsx(dir) {
  const h = []
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (e.name === 'node_modules' || e.name.startsWith('.')) continue
    const p = join(dir, e.name)
    if (e.isDirectory()) h.push(...berkasTsx(p))
    else if (e.name.endsWith('.tsx')) h.push(p)
  }
  return h
}

const hitung = { select: 0, button: 0 }
const contoh = { select: [], button: [] }

for (const f of [...berkasTsx(join(AKAR, 'app')), ...berkasTsx(join(AKAR, 'components'))]) {
  const rel = relative(AKAR, f).replace(/\\/g, '/')
  const baris = readFileSync(f, 'utf8').split('\n')

  for (let i = 0; i < baris.length; i++) {
    for (const tag of ['select', 'button']) {
      if (!baris[i].includes(`<${tag}`)) continue
      // Tag bisa multi-baris; lihat ke bawah sampai 14 baris — TAPI berhenti
      // di `>` yang menutup tag pembuka ini.
      //
      // ⚠️ Versi pertama tidak berhenti, dan itu membuat penjaga ini BUTA:
      // sebuah `<select>` tanpa nama yang ditulis satu baris akan "meminjam"
      // `aria-label` milik `<select>` BERIKUTNYA yang kebetulan ada dalam 14
      // baris ke bawah, lalu keduanya dilewati. Terbukti lewat uji mutasi —
      // menyisipkan `<select id="uji">` tak membuat angkanya naik sama sekali.
      //
      // Pelajarannya persis yang dijaga AUTOPILOT: penjaga yang tak pernah
      // diuji-mutasi bisa hijau selamanya tanpa menjaga apa pun.
      // Berhenti di `>` yang menutup tag pembuka — TAPI `>` di dalam ekspresi
      // JSX (`onChange={e => ...}`) tidak dihitung. Sama seperti pada <button>
      // di bawah: tanpa hitungan kedalaman kurawal, panah fungsi mengakhiri
      // blok terlalu awal dan `aria-label` di baris berikutnya tak terlihat —
      // dua `<select>` di estimasi/page.tsx yang JELAS berlabel sempat
      // dilaporkan "tanpa nama" karena itu.
      const sumber = baris.slice(i, i + 14).join('\n')
      const mulaiTag = sumber.indexOf(`<${tag}`)
      let kedalaman = 0
      let blok = ''
      for (let k = mulaiTag; k < sumber.length; k++) {
        const ch = sumber[k]
        blok += ch
        if (ch === '{') kedalaman++
        else if (ch === '}') kedalaman--
        else if (ch === '>' && kedalaman === 0) break
      }
      if (blok.includes('aria-label') || blok.includes('aria-labelledby')) continue
      // <button> yang isinya teks sudah punya nama dari teksnya sendiri.
      //
      // Ini SENGAJA memakai jendela yang lebih lebar daripada `blok` di atas:
      // atributnya berhenti di `>`, tapi NAMA-nya justru datang dari ISI
      // elemen — yang ada SESUDAH `>`, sering di baris berikutnya. Memakai
      // `blok` yang sudah dipotong membuat tombol beratribut panjang dilaporkan
      // "tanpa nama" padahal teksnya ada tepat di bawahnya (423 laporan palsu
      // saat pertama kali dicoba begitu).
      if (tag === 'button') {
        const isi = baris.slice(i, i + 14).join('\n')
        const mulai = isi.indexOf(`<${tag}`)
        // ⚠️ JANGAN pakai `indexOf('>')` polos. Handler `onClick={() => ...}`
        // mengandung `>` di dalam panah fungsinya, dan itu ditemukan LEBIH DULU
        // daripada `>` yang benar-benar menutup tag. Akibatnya isi tombol
        // terbaca mulai dari `{}}>` — dimulai `{`, dikira "ada teks", lalu
        // tombol ikon-saja lolos. Terbukti lewat uji mutasi.
        //
        // Solusinya menghitung kedalaman kurung kurawal: `>` hanya dianggap
        // penutup tag kalau ia berada DI LUAR ekspresi JSX.
        let dalam = 0, tutup = -1
        for (let k = mulai; k < isi.length; k++) {
          const ch = isi[k]
          if (ch === '{') dalam++
          else if (ch === '}') dalam--
          else if (ch === '>' && dalam === 0) { tutup = k; break }
        }
        if (tutup !== -1) {
          // Sampai `</button>`, bukan sekian ratus karakter. Atribut style
          // inline di repo ini sering >200 karakter, sehingga potongan tetap
          // akan berhenti SEBELUM teks tombolnya dan melaporkan "tanpa nama"
          // padahal teksnya ada di baris berikutnya (248 laporan palsu saat
          // batasnya masih 200 karakter).
          const akhir = isi.indexOf('</button', tutup)
          const anak = isi.slice(tutup + 1, akhir === -1 ? undefined : akhir).trim()
          // Nama datang dari TEKS atau ekspresi `{...}` di mana pun di dalam
          // elemen — bukan dari elemen anak seperti `<Icon />` sendirian,
          // yang justru kasus "tombol ikon-saja" yang mau ditangkap.
          const tanpaElemenAnak = anak.replace(/<[^>]*\/>/g, '').replace(/<[^>]*>/g, '').trim()
          // Cukup ADA isi setelah elemen anak dibuang — jangan menyaring per
          // karakter awal. Label tombol nyata di repo ini dimulai dengan `+`
          // ("+3 invoice lainnya"), `✓`, `←`, dan simbol lain; daftar karakter
          // yang "boleh" selalu ketinggalan satu, dan tiap yang ketinggalan
          // jadi laporan palsu. Yang benar-benar mau ditangkap adalah tombol
          // yang isinya HABIS setelah ikon dibuang — yaitu tombol ikon-saja.
          if (tanpaElemenAnak.length > 0) continue
        }
      }
      hitung[tag]++
      if (contoh[tag].length < 8) contoh[tag].push(`${rel}:${i + 1}`)
    }
  }
}

const gagal = []
for (const k of ['select', 'button']) {
  if (hitung[k] > AMBANG[k]) gagal.push(`<${k}> tanpa nama: ${hitung[k]} (ambang ${AMBANG[k]})`)
}

if (gagal.length) {
  console.error('\n❌ PENJAGA AKSESIBILITAS GAGAL — kontrol tanpa nama BERTAMBAH:\n')
  gagal.forEach((g) => console.error('   ' + g))
  console.error('\n   Pembaca layar akan menyebut kontrol ini tanpa nama ("kotak kombo",')
  console.error('   "tombol"), jadi pengguna tak tahu itu apa. Untuk saringan tabel,')
  console.error('   artinya kontrolnya tak bisa dipakai sama sekali tanpa melihat layar.')
  console.error('\n   Perbaikan: tambahkan `aria-label="..."` yang menyebut FUNGSINYA.')
  console.error('   Contoh baru yang perlu diperiksa:')
  for (const k of ['select', 'button']) {
    if (hitung[k] > AMBANG[k]) contoh[k].forEach((c) => console.error(`     ${c}`))
  }
  console.error('')
  process.exit(1)
}

console.log(`✅ A11y statis: <select> tanpa nama ${hitung.select}/${AMBANG.select} · ` +
            `<button> tanpa nama ${hitung.button}/${AMBANG.button}`)
const turun = ['select', 'button'].filter((k) => hitung[k] < AMBANG[k])
if (turun.length) {
  console.log('\n📉 Turun dari ambang — kencangkan angkanya di scripts/a11y-ratchet.mjs:')
  turun.forEach((k) => console.log(`   ${k}: ${hitung[k]} < ${AMBANG[k]}`))
}
