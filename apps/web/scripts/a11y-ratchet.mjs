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
 * **NOL sejak 2026-08-01.** Seluruh kontrol form di repo ini kini punya nama
 * aksesibel. Dari sini penjaga menolak kontrol tanpa nama SAMA SEKALI — tak
 * ada lagi "hutang terukur" yang boleh bertambah diam-diam.
 *
 * ── Bagian yang jujur: sebagian "hutang" itu ternyata LAPORAN PALSU
 *
 * Perjalanan angkanya: 96/62 → 28/24 → 8/6 → 0/0. Penurunan terakhir bukan
 * seluruhnya hasil memberi nama. Jendela pencarian teks tombol yang 14 baris
 * TERLALU SEMPIT untuk repo ini: tombol rutin punya `style={{…}}` inline 10
 * baris plus dua handler mouse, sehingga TEKS-nya baru muncul di baris ke-19
 * sampai ke-25 dan dilaporkan "tanpa nama" padahal jelas berlabel
 * (`milestone-modal.tsx:263` — teksnya "Simpan Perubahan", 19 baris di bawah).
 *
 * Melebarkan ke 40 baris TIDAK melonggarkan penjaganya: batas sebenarnya
 * adalah `</button>` yang dicari di bawah, dan tombol ikon-saja tetap
 * tertangkap karena isinya habis setelah elemen anak dibuang. Dibuktikan uji
 * mutasi — menyisipkan tombol ikon-saja tetap menaikkan angkanya.
 *
 * Pelajarannya sama dengan yang sudah tercatat di bawah, dari arah sebaliknya:
 * penjaga yang terlalu sempit menghasilkan angka hutang yang digelembungkan,
 * dan hutang palsu sama merusaknya dengan kebutaan — ia melatih pembacanya
 * mengabaikan laporan.
 */
const AMBANG = { select: 0, button: 0 }

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

  /*
    KOMENTAR BLOK MULTI-BARIS — ditambahkan 2026-08-16.

    Pemeriksaan per-baris di bawah sudah mengenali komentar SATU BARIS, dan itu
    menutup sebagian besar kasus. Yang lolos: blok komentar JSX yang pembukanya
    berada di baris LAIN.

    Contoh nyata yang membuat penjaga ini MERAH tanpa ada cacat:

        buka-blok-JSX
          `minmax(0, 1fr)` — bukan `auto` — supaya `<select>` yang
          isinya panjang tak memaksa kolomnya melebar…
        tutup-blok-JSX

    (penandanya sengaja ditulis sebagai kata: menuliskan penutup blok yang
    sebenarnya di sini akan menutup komentar INI di tengah jalan — yang persis
    terjadi pada percobaan pertama, dan membuat berkas ini gagal di-parse.)

    Baris berisi `<select>` itu diawali backtick, bukan penanda komentar, jadi
    ia lolos semua saringan dan dilaporkan sebagai kontrol tanpa nama.
    `pengaturan/penyedia-ai/page.tsx:728` merah karenanya — padahal ketiga
    `<select>` SUNGGUHAN di berkas itu semuanya sudah ber-`aria-label`.

    "Memperbaikinya" di halaman berarti merusak dokumentasi yang benar demi
    menghijaukan penjaga. Komentar di bawah sudah memperingatkan kerusakan itu
    untuk kasus satu baris; ia tetap terjadi lewat pintu multi-baris.
  */
  let dalamBlok = false

  for (let i = 0; i < baris.length; i++) {
    const _t = baris[i]
    if (dalamBlok) {
      // Baris penutup dianggap komentar seluruhnya. `<select>` yang berada
      // SESUDAH `*/` pada baris yang sama praktis tak ada di repo ini, dan
      // menganggapnya kode mengembalikan positif palsu yang sama.
      if (_t.includes('*/')) dalamBlok = false
      continue
    }
    // Pembuka tanpa penutup di baris yang sama → blok berlanjut ke baris
    // berikutnya. `lastIndexOf` dipakai supaya `/* a */ /* b` tetap terbaca
    // sebagai blok yang masih terbuka.
    const _buka = Math.max(_t.lastIndexOf('{/*'), _t.lastIndexOf('/*'))
    if (_buka >= 0 && _t.indexOf('*/', _buka) === -1) dalamBlok = true
    for (const tag of ['select', 'button']) {
      if (!baris[i].includes(`<${tag}`)) continue
      // KOMENTAR bukan kode. Berkas di repo ini menjelaskan dirinya panjang
      // lebar, dan kalimat seperti "`<select>` asli hanya bisa diloncati
      // dengan huruf awal" ikut terhitung sebagai kontrol tanpa nama.
      // Angka yang digelembungkan laporan palsu melatih pembacanya
      // mengabaikan penjaga ini — persis yang mau dicegah.
      //
      // `/*` dan `/**` ikut dikenali, bukan hanya `//` dan `*` lanjutan.
      // Tanpa itu, komentar JSDoc SATU BARIS seperti
      //     /** `<select>` dengan bentuk yang sama — … */
      // lolos: pola lama menuntut `*` berada di awal atau sesudah spasi,
      // sedangkan di sini ia didahului `/`. Itulah yang membuat
      // `components/isian.tsx:145` — sebuah kalimat penjelasan — dilaporkan
      // sebagai kontrol tanpa nama, dan "memperbaikinya" berarti merusak
      // dokumentasi yang benar demi menghijaukan penjaga.
      const sblm = baris[i].slice(0, baris[i].indexOf(`<${tag}`))
      const awal = sblm.trimStart().slice(0, 3)
      if (/^(\/\/|\/\*|\*|\{\/\*)/.test(awal) || sblm.includes('{/*')) continue
      // Komponen pembungkus generik (`<select {...props}>`) MEWARISI nama dari
      // pemanggilnya — memberi aria-label di sini justru menimpa nama yang
      // spesifik dengan yang generik di SELURUH pemakaian.
      //
      // Nama variabelnya BEBAS, bukan harus `props`. Versi pertama memaku
      // literal `{...props}`, lalu `components/isian.tsx` — yang menyebar
      // `{...sisa}` setelah mencabut `style`/`className` — tertangkap sebagai
      // pelanggar. Memberinya `aria-label` generik justru akan MENIMPA nama
      // spesifik di seluruh pemakaiannya, yaitu kerusakan yang pengecualian
      // ini ada untuk mencegahnya. Repo ini menulis kodenya dalam bahasa
      // Indonesia; penjaga yang hanya mengenali kosakata Inggris akan
      // memaksa kode dinamai ulang demi menyenangkan regex.
      if (/\{\.\.\.\w+\}/.test(baris.slice(i, i + 6).join('\n'))) continue
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
      // Kontrol yang SENGAJA disembunyikan dari pohon aksesibilitas tak punya
      // nama karena ia memang tak boleh punya — pembaca layar tak pernah
      // menemuinya. Menuntut `aria-label` di sini bukan sekadar mubazir: ia
      // menyuruh menamai sesuatu yang justru dirancang tak terlihat.
      //
      // Syaratnya DUA-DUANYA, bukan `aria-hidden` saja. `aria-hidden` pada
      // kontrol yang MASIH bisa di-Tab adalah cacat aksesibilitas yang lebih
      // buruk daripada tombol tanpa nama: fokus papan tik mendarat di kontrol
      // yang pembaca layar bersikeras tidak ada, dan penggunanya kehilangan
      // jejak sepenuhnya. Pasangan `aria-hidden` + `tabIndex={-1}` yang
      // menyatakan "ini kenyamanan TETIKUS" — itu yang sah.
      //
      // Kasus nyatanya: backdrop lightbox di `components/progress-log-list.tsx`,
      // yang jalan keluar papan tiknya sudah disediakan Esc dan tombol X.
      // Menjadikannya perhentian Tab justru MEMPERPANJANG jalan ke tombol
      // yang sebenarnya — memenuhi penjaga dengan cara yang membuat navigasi
      // papan tik lebih buruk.
      //
      // ⚠️ Diperiksa ke `blokKode`, BUKAN `blok`. Komentar di dalam tag ikut
      // terbaca, dan justru komentar yang MENJELASKAN pengecualian ini
      // («`tabIndex={-1}` + `aria-hidden`: backdrop adalah kenyamanan
      // TETIKUS») berisi kedua pola itu sebagai teks. Versi pertama lolos
      // karena membacanya: menghapus `tabIndex={-1}` yang SUNGGUHAN tetap
      // hijau, sebab penjelasannya masih menyebut namanya. Terbukti lewat
      // uji mutasi — penjaga yang mengutip dokumentasinya sendiri sebagai
      // bukti tak menjaga apa pun.
      const blokKode = blok
        .replace(/\/\*[\s\S]*?\*\//g, ' ')
        .replace(/(^|\n)\s*\/\/[^\n]*/g, '$1')
      if (
        /aria-hidden(?![\w-])/.test(blokKode)
        && /tabIndex\s*=\s*\{\s*-1\s*\}/.test(blokKode)
      ) continue
      // `<label htmlFor="x">` + `<select id="x">` adalah cara BAKU memberi nama
      // — dan justru yang paling disarankan, karena labelnya juga TERLIHAT.
      // Tanpa pengecualian ini, kontrol yang sudah benar ikut dihitung sebagai
      // pelanggaran, dan "perbaikannya" (menambah aria-label) malah membuat
      // nama ganda yang membingungkan pembaca layar.
      const punyaId = blok.match(/\bid=(?:"([^"]+)"|\{`([^`]+)`\})/)
      if (punyaId) {
        const idLiteral = punyaId[1]
        // Template literal (`cc-${x}`) tak bisa dicocokkan persis; samakan
        // bagian statisnya saja — cukup untuk membedakan "ada label" vs tidak.
        const cari = idLiteral
          ? `htmlFor="${idLiteral}"`
          : `htmlFor={\`${punyaId[2].split('${')[0]}`
        const isiBerkas = readFileSync(f, 'utf8')
        if (isiBerkas.includes(cari)) continue

        // `<Medan id="x" label="…">` merender `<label htmlFor={id}>` di
        // `components/dasar.tsx` — labelnya NYATA dan TERLIHAT, hanya saja
        // tak ditulis di berkas yang sama.
        //
        // Tanpa pengecualian ini, penjaga menuntut `aria-label` untuk kontrol
        // yang sudah bernama, dan "perbaikannya" menghasilkan NAMA GANDA:
        // pembaca layar menyebutkan aria-label dan mengabaikan label yang
        // terlihat, sehingga yang didengar berbeda dari yang dibaca orang di
        // sebelahnya. Diverifikasi axe-core runtime: 0 pelanggaran pada
        // halaman yang memakainya.
        //
        // Sengaja dicocokkan ke `id` LITERAL saja. Id yang dirakit template
        // tak bisa dipastikan cocok dengan `id` milik `Medan`, dan menebaknya
        // akan membuat penjaga ini diam untuk kasus yang benar-benar melanggar.
        if (idLiteral && isiBerkas.includes(`<Medan id="${idLiteral}"`)) continue
      }

      // <button> yang isinya teks sudah punya nama dari teksnya sendiri.
      //
      // Ini SENGAJA memakai jendela yang lebih lebar daripada `blok` di atas:
      // atributnya berhenti di `>`, tapi NAMA-nya justru datang dari ISI
      // elemen — yang ada SESUDAH `>`, sering di baris berikutnya. Memakai
      // `blok` yang sudah dipotong membuat tombol beratribut panjang dilaporkan
      // "tanpa nama" padahal teksnya ada tepat di bawahnya (423 laporan palsu
      // saat pertama kali dicoba begitu).
      if (tag === 'button') {
        // ⚠️ 14 baris TERLALU SEMPIT, dan itu menghasilkan laporan palsu.
        // Tombol di repo ini rutin punya `style={{…}}` inline 10 baris plus
        // `onMouseEnter`/`onMouseLeave`, sehingga TEKS-nya baru muncul di
        // baris ke-19 sampai ke-25 — mis. `milestone-modal.tsx:263`, yang
        // teksnya "Simpan Perubahan" ada 19 baris di bawah dan tetap
        // dilaporkan "tanpa nama".
        //
        // Melebarkan ke 40 tidak melonggarkan penjaganya: batas sebenarnya
        // adalah `</button>` yang dicari di bawah, dan tombol ikon-saja tetap
        // tertangkap karena isinya HABIS setelah elemen anak dibuang. Diuji
        // mutasi: menyisipkan tombol ikon-saja tetap menaikkan angka.
        const isi = baris.slice(i, i + 40).join('\n')
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
