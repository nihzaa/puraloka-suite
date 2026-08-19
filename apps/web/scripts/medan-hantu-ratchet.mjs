#!/usr/bin/env node
/**
 * PENJAGA MEDAN HANTU — nilai yang DIKIRIM ke API tapi tak pernah BISA DIISI.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * KENAPA ADA
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Pada 2026-08-01, membersihkan `no-unused-vars` menemukan tiga bug yang
 * bentuknya identik dan tak satu pun tertangkap oleh test, tsc, atau review:
 *
 *   · `setNotes` (kas)         — modal pengeluaran mengirim `notes` ke API
 *                                tapi TAK PUNYA textarea. Selalu "".
 *   · `setFundSource` (mandor) — kasbon selalu tercatat "Dana Owner" karena
 *                                pemilihnya tak pernah dirender.
 *   · `rowOk` (rab-schedule)   — validasi dihitung lalu dibuang.
 *
 * Ketiganya **berfungsi sempurna** menurut tsc: state ada, dikirim, tipenya
 * benar. Yang salah ada di antara — tak ada jalan bagi manusia untuk mengubah
 * nilainya. Bug semacam ini tak pernah melempar error; ia hanya menghasilkan
 * data yang selalu sama, dan orang baru sadar berbulan-bulan kemudian saat
 * ada yang bertanya "kenapa kolom ini kosong terus".
 *
 * ── Kenapa `no-unused-vars` saja tidak cukup
 *
 * ESLint menangkapnya HANYA kalau setter-nya benar-benar nol pemakaian. Begitu
 * seseorang menulis `setNotes("")` di fungsi reset — sesuatu yang sangat wajar
 * — warning-nya hilang sementara bug-nya tetap ada. Penjaga ini menanyakan hal
 * yang lebih tepat: apakah nilainya bisa diubah oleh PEMAKAI, bukan sekadar
 * apakah ia disebut di suatu tempat.
 *
 * ── Yang dicari
 *
 * State yang (a) nilainya ikut dikirim ke API, TAPI (b) setter-nya tak pernah
 * dipanggil dari penangan interaksi (`onChange`/`onClick`/`onInput`/`onBlur`).
 *
 * Jalankan: node apps/web/scripts/medan-hantu-ratchet.mjs
 */
import { readFileSync, readdirSync } from 'node:fs'
import { join, relative } from 'node:path'

const AKAR = join(import.meta.dirname, '..')

/**
 * AMBANG — jumlah medan hantu.
 *
 * ⚠️ HANYA BOLEH TURUN. Kalau gagal karena NAIK: medan yang Anda kirim ke API
 * tak punya cara diisi. Entah tambahkan input-nya, atau berhenti mengirimnya —
 * jangan naikkan angkanya.
 *
 * NOL sejak 2026-08-01, hari penjaga ini dibuat: ketiga temuan yang
 * melahirkannya sudah ditutup lebih dulu.
 */
const AMBANG = 0

/**
 * Dikecualikan DENGAN ALASAN.
 *
 * Ada nilai yang memang tak seharusnya diisi manusia — dan itu bukan bug:
 * id dari URL, timestamp, hasil unggah berkas, nilai turunan.
 */
const NAMA_SAH = new Set([
  // Diisi program, bukan orang.
  'photoUrl', 'receiptUrl', 'proofUrl', 'fileUrl', 'logoUrl',
  'projectId', 'clientId', 'userId', 'scopeId', 'itemId', 'invoiceId',
  // State PROSES, bukan medan isian. Diubah oleh kodenya sendiri saat
  // permintaan mulai/selesai; tak pernah ada yang mengetiknya.
  'loading', 'saving', 'error', 'success', 'deleting', 'uploading',
  'submitting', 'kirim', 'mengirim', 'memuat', 'menyimpan', 'galat', 'busy',
])

function berkasTsx(dir) {
  const hasil = []
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (e.name === 'node_modules' || e.name.startsWith('.') || e.name === 'ds-bundle') continue
    const p = join(dir, e.name)
    if (e.isDirectory()) hasil.push(...berkasTsx(p))
    else if (e.name.endsWith('.tsx')) hasil.push(p)
  }
  return hasil
}

/** `const [nilai, setNilai] = useState(...)` */
const POLA_STATE = /const\s*\[\s*([A-Za-z_$][\w$]*)\s*,\s*(set[A-Za-z_$][\w$]*)\s*\]\s*=\s*useState/g

const temuan = []

for (const f of [...berkasTsx(join(AKAR, 'app')), ...berkasTsx(join(AKAR, 'components'))]) {
  const rel = relative(AKAR, f).replace(/\\/g, '/')
  const isi = readFileSync(f, 'utf8')

  // Baris komentar dibuang dulu: berkas di repo ini menjelaskan dirinya
  // panjang lebar, dan kalimat "dulu memakai setNotes" ikut terhitung sebagai
  // pemakaian kalau tidak dibersihkan.
  const kode = isi
    .split('\n')
    .map((b) => {
      const t = b.trim()
      return t.startsWith('//') || t.startsWith('*') || t.startsWith('/*') ? '' : b
    })
    .join('\n')

  // Batas tiap komponen di berkas ini. Diperlukan karena satu berkas kerap
  // memuat BEBERAPA komponen — `kas/page.tsx` punya tiga modal, masing-masing
  // dengan `notes`/`setNotes` sendiri.
  //
  // ⚠️ Tanpa ini penjaga MELEWATKAN bug yang justru melahirkannya: textarea
  // milik modal transfer "menutupi" modal pengeluaran yang tak punya, dan
  // pencarian per-berkas melaporkan aman. Terbukti lewat uji mutasi —
  // mengembalikan bug aslinya tetap hijau. Alat yang tak diuji-mutasi bisa
  // melaporkan nol sambil buta terhadap kasus yang ia dibuat untuk menangkap.
  const batasKomponen = [
    ...kode.matchAll(/^(?:export\s+)?(?:default\s+)?function\s+[A-Z][\w$]*/gm),
  ].map((c) => kode.slice(0, c.index).split('\n').length - 1)
  batasKomponen.push(Number.MAX_SAFE_INTEGER)

  const semuaBaris = kode.split('\n')

  /** Potongan kode milik komponen yang memuat baris ke-`n`. */
  function lingkupKomponen(n) {
    let mulai = 0
    for (const b of batasKomponen) {
      if (b <= n) mulai = b
      else return semuaBaris.slice(mulai, b === Number.MAX_SAFE_INTEGER ? undefined : b).join('\n')
    }
    return semuaBaris.slice(mulai).join('\n')
  }

  for (const m of kode.matchAll(POLA_STATE)) {
    const [, nilai, setter] = m
    if (NAMA_SAH.has(nilai)) continue

    // Semua pemeriksaan di bawah dibatasi ke KOMPONEN tempat state ini hidup.
    const barisState = kode.slice(0, m.index).split('\n').length - 1
    const lingkup = lingkupKomponen(barisState)

    // (a) Nilainya benar-benar DIKIRIM ke API?
    //
    // ⚠️ `nama: nilai` saja TIDAK CUKUP untuk menyimpulkan itu. Versi pertama
    // memakainya dan menuduh palsu `sidebar.tsx:713` — `top: tooltipTop` di
    // dalam `style={{...}}` bentuknya identik dengan medan payload. Repo ini
    // memakai gaya inline-style di mana-mana, jadi kesalahan itu akan terus
    // berulang, bukan kebetulan sekali.
    //
    // Yang dipakai sekarang: nama medan harus `snake_case` (konvensi API di
    // repo ini — DB dan payload seluruhnya snake_case, sedangkan properti CSS
    // camelCase/kebab), ATAU lewat FormData yang tak punya kembaran CSS.
    // (a) Nilainya benar-benar DIKIRIM ke API?
    //
    // ⚠️ `nama: nilai` saja TIDAK CUKUP. Versi pertama memakainya dan menuduh
    // palsu `sidebar.tsx:713` — `top: tooltipTop` di dalam `style={{...}}`
    // bentuknya identik dengan medan payload. Repo ini memakai inline-style
    // di mana-mana, jadi kesalahan itu akan berulang, bukan kebetulan sekali.
    //
    // Yang dipakai sekarang: nama medan harus `snake_case` (konvensi API di
    // repo ini — DB dan payload seluruhnya snake_case, sedangkan properti CSS
    // camelCase), ATAU lewat FormData yang tak punya kembaran CSS.
    const dikirim =
      new RegExp(`\\.append\\(\\s*["'][\\w_]+["']\\s*,\\s*${nilai}\\b`).test(lingkup) ||
      new RegExp(`^\\s*[a-z][a-z0-9]*_[\\w_]*:\\s*${nilai}\\s*[,}]`, 'm').test(lingkup) ||
      new RegExp(`^\\s*[a-z][a-z0-9]*_[\\w_]*:\\s*${nilai}\\s*(\\?\\?|\\|\\||\\.trim)`, 'm').test(lingkup)
    if (!dikirim) continue

    // (b) Setter bisa dicapai dari penangan interaksi DI KOMPONEN YANG SAMA?
    //
    // ⚠️ Versi pertama hanya melihat 3 baris sebelum panggilan setter, dan
    // menuduh palsu `namaBerubah()` di halaman perusahaan: ia memanggil
    // `setNama()` di dalam fungsi bernama, lalu fungsi ITU yang dipasang ke
    // `onChange`. Perantara satu tingkat adalah pola yang sangat wajar (di
    // sana: mengisi slug otomatis dari nama) — alat yang tak mengenalinya
    // justru menuduh kode yang ditulis rapi.
    const baris = lingkup.split('\n')
    const rxSetter = new RegExp(`\\b${setter}\\s*\\(`)
    const RX_PENANGAN =
      /\bon(Change|Click|Input|Blur|Submit|KeyDown|KeyUp|Select|Drop|MouseEnter|MouseLeave|Focus|Toggle|Ubah|Pilih|Klik|Simpan|Tutup|Batal)\s*=/

    let bisaDiisi = false

    // (b0) Setter DIOPER LANGSUNG sebagai prop, tanpa dipanggil.
    //
    //      <Saklar nyala={x} onUbah={setX} />
    //
    // `rxSetter` menuntut `setX(` — dengan kurung — jadi bentuk ini luput.
    // Padahal ia idiom React yang paling biasa, dan di repo ini dipakai 27
    // berkas lewat prop `onUbah`.
    //
    // Diukur 2026-08-19: dari 11 temuan penjaga ini, tak satu pun nyata.
    // Penjaga yang menuduh kode yang BENAR lebih berbahaya daripada tak ada
    // penjaga: orang berhenti membacanya, lalu temuan yang SUNGGUHAN ikut
    // terlewat.
    const rxSetterProp = new RegExp(`\\bon[A-Z]\\w*\\s*=\\s*\\{\\s*${setter}\\s*\\}`)
    if (rxSetterProp.test(lingkup)) bisaDiisi = true

    // (b1) Langsung di dalam/berdekatan dengan penangan.
    for (let i = 0; i < baris.length && !bisaDiisi; i++) {
      if (!rxSetter.test(baris[i])) continue
      if (RX_PENANGAN.test(baris.slice(Math.max(0, i - 3), i + 1).join('\n'))) bisaDiisi = true
    }

    // (b2) Lewat fungsi perantara: cari fungsi yang BADANNYA memanggil setter,
    //      lalu periksa apakah fungsi itu dirujuk oleh penangan mana pun.
    //      Satu tingkat sudah cukup untuk pola nyata di repo ini.
    if (!bisaDiisi) {
      const POLA_FN = /(?:function\s+([A-Za-z_$][\w$]*)|const\s+([A-Za-z_$][\w$]*)\s*=\s*(?:async\s*)?\()/g
      for (const fn of lingkup.matchAll(POLA_FN)) {
        const namaFn = fn[1] ?? fn[2]
        if (!namaFn) continue
        // Badan fungsi didekati sebagai 40 baris sesudah deklarasinya — cukup
        // untuk penangan, dan tak menuntut parser penuh.
        const mulaiFn = lingkup.slice(0, fn.index).split('\n').length - 1
        if (!rxSetter.test(baris.slice(mulaiFn, mulaiFn + 40).join('\n'))) continue
        if (new RegExp(`\\bon\\w+\\s*=\\s*\\{?[^}\\n]*\\b${namaFn}\\b`).test(lingkup)) {
          bisaDiisi = true
          break
        }
      }
    }

    // (b3) Setter DISIMPAN SEBAGAI NILAI di larik/objek konfigurasi, lalu
    //      dipanggil lewat propertinya — `{ v: bBawah, s: setBBawah }` yang
    //      di-`map` jadi `<input onChange={(e) => f.s(e.target.value)} />`.
    //
    //      Ditemukan 2026-08-13 di `pengaturan/tarif-payroll`: tiga medan
    //      terpasang LENGKAP dengan label, input, dan onChange — dan penjaga
    //      ini tetap menuduhnya hantu karena namanya tak pernah muncul
    //      berdekatan dengan `onChange`.
    //
    //      Pola ini bukan kelalaian melainkan cara menghindari enam salinan
    //      blok input yang identik. Alat yang tak mengenalinya menghukum kode
    //      yang justru ditulis rapi — dan penjaga yang merah karena hal yang
    //      benar akan dimatikan orang.
    //
    //      Syaratnya DUA, supaya tak jadi lubang: (1) setter muncul sebagai
    //      NILAI properti (`s: setX` / `setter: setX`), dan (2) properti itu
    //      benar-benar dipanggil dari sebuah penangan (`f.s(`, `x.setter(`).
    if (!bisaDiisi) {
      const mProp = new RegExp(`([A-Za-z_$][\\w$]*)\\s*:\\s*${setter}\\s*[,}]`).exec(lingkup)
      if (mProp) {
        const namaProp = mProp[1]
        // Dipanggil lewat properti itu DARI penangan — bukan sekadar disimpan.
        const rxPakai = new RegExp(
          `on\\w+\\s*=\\s*\\{[^}]*\\b[A-Za-z_$][\\w$]*\\.${namaProp}\\s*\\(`)
        if (rxPakai.test(lingkup)) bisaDiisi = true
      }
    }

    if (bisaDiisi) continue

    const nomor = kode.slice(0, m.index).split('\n').length
    temuan.push({ rel, nomor, nilai, setter })
  }
}

console.log(`Medan hantu: ${temuan.length} nilai dikirim ke API tanpa cara mengisinya`)

if (temuan.length > AMBANG) {
  console.error(`\n❌ PENJAGA MEDAN HANTU GAGAL: ${temuan.length} > ambang ${AMBANG}\n`)
  console.error('   Nilai ini DIKIRIM ke API tapi setter-nya tak pernah dipanggil dari')
  console.error('   penangan interaksi — artinya tak ada cara bagi pemakai mengubahnya,')
  console.error('   dan API selalu menerima nilai awal yang sama.')
  console.error('\n   Bug semacam ini tak pernah melempar error. Ia hanya menghasilkan data')
  console.error('   yang selalu identik, dan baru ketahuan saat ada yang bertanya "kenapa')
  console.error('   kolom ini kosong terus".')
  console.error('\n   Perbaikan: tambahkan input-nya, ATAU berhenti mengirim medannya.')
  console.error('   Kalau memang diisi program (id dari URL, hasil unggah), daftarkan')
  console.error('   namanya di NAMA_SAH beserta alasannya.\n')
  for (const t of temuan.slice(0, 15)) {
    console.error(`     ${t.rel}:${t.nomor} — \`${t.nilai}\` (setter \`${t.setter}\`)`)
  }
  console.error('')
  process.exit(1)
}

if (temuan.length < AMBANG) {
  console.log(`\n📉 Turun dari ambang (${temuan.length} < ${AMBANG}) — kencangkan angkanya.`)
}
