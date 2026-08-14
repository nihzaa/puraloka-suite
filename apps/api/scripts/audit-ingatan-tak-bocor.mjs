#!/usr/bin/env node
/**
 * PENJAGA: INGATAN ASISTEN TIDAK BOCOR LEWAT PROMPT.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * KENAPA KEBOCORAN INI TAK TERTANGKAP PENJAGA LAIN
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Seluruh gerbang izin di repo ini menjaga jalur TOOL: `katalogUntuk(izin)`,
 * ACL ganda di `jalankanTool`, RLS per tabel, `audit-tool-ai-read-only`.
 *
 * Ingatan tidak lewat situ. Ia disisipkan langsung ke PROMPT SISTEM — dan
 * begitu masuk, tak ada satu pun pemeriksaan di antara ia dan model.
 *
 * Gejalanya nol: tak ada 403, tak ada galat, tak ada baris log. Yang terjadi
 * hanya asisten yang suatu hari menyebut angka margin kepada mandor, dan tak
 * seorang pun bisa menunjuk di mana izinnya jebol — karena tak ada izin yang
 * jebol.
 *
 * ── Yang diperiksa
 *
 *   I-1  `bacaIngatan` menyaring LAPIS (pribadi hanya milik pemiliknya)
 *   I-2  `bacaIngatan` menyaring IZIN (`izin_minimum` vs permission penanya)
 *   I-3  `bacaIngatan` menyaring PROYEK (`project_id` vs proyek yang dibahas)
 *   I-4  ketiganya FAIL-CLOSED — `return false`, bukan `return true`
 *   I-5  blok prompt membungkus `<ingatan>` DAN menyangkal wewenangnya
 *   I-6  tak ada pembacaan `ai_ingatan` di luar `lib/ai-ingatan.ts`
 *
 * I-6 yang paling mudah bocor kelak: menambah satu query `ai_ingatan` di rute
 * lain adalah tiga baris yang tampak wajar — dan penyaringannya tak ikut,
 * karena penyaringannya hidup di pustaka yang tak dipanggil.
 *
 * Ambang NOL.
 *
 * Pakai:  node apps/api/scripts/audit-ingatan-tak-bocor.mjs
 */
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve, relative, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const SRC = resolve(__dirname, '..', 'src')
const PUSTAKA = join('lib', 'ai-ingatan.ts')

/** Berkas yang boleh menyentuh `ai_ingatan` selain pustakanya. */
const BOLEH_MENYENTUH = new Set([
  // Rute pengelolaan manual — ia memang bekerja pada tabelnya langsung, dan
  // gerbangnya `requirePermission`, bukan penyaringan prompt.
  'routes/v1/ai-ingatan.ts',
])

const pelanggaran = []

const pustaka = readFileSync(resolve(SRC, PUSTAKA), 'utf8')

// ── I-1..I-3: ketiga penyaring ADA ─────────────────────────────────────────
const SARINGAN = [
  {
    kode: 'I-1',
    pola: /b\.lapis === 'pribadi' && b\.user_id !== konteks\.userId/,
    nama: 'lapis (pribadi hanya milik pemiliknya)',
    akibat: 'ingatan pribadi seorang founder terbaca seluruh karyawannya',
  },
  {
    kode: 'I-2',
    pola: /b\.izin_minimum && !konteks\.izinPengguna\.has\(b\.izin_minimum\)/,
    nama: 'izin (izin_minimum vs permission penanya)',
    akibat: 'catatan bermargin ikut terbaca mandor',
  },
  {
    kode: 'I-3',
    pola: /b\.project_id && b\.project_id !== \(konteks\.projectId \?\? null\)/,
    nama: 'proyek (project_id vs proyek yang dibahas)',
    akibat: 'catatan proyek lain muncul di percakapan yang tak berhubungan',
  },
]

for (const s of SARINGAN) {
  if (!s.pola.test(pustaka)) {
    pelanggaran.push(
      `${s.kode} penyaring ${s.nama} HILANG dari bacaIngatan — ${s.akibat}`,
    )
  }
}

// ── I-4: fail-closed ───────────────────────────────────────────────────────
//
// Yang diperiksa bukan sekadar "ada `return false`" melainkan bahwa TIAP
// penyaring diikuti `return false`. Penyaring yang mengembalikan `true`
// membalik artinya sepenuhnya sambil tetap terlihat seperti penyaring.
const badanSaring = pustaka.match(/const lolos = baris\.filter\([\s\S]*?\n  \}\)/)
if (!badanSaring) {
  pelanggaran.push('I-4: blok penyaring `baris.filter` tidak ditemukan')
} else {
  const baris = badanSaring[0].split('\n')
  for (const s of SARINGAN) {
    const i = baris.findIndex((b) => s.pola.test(b))
    if (i >= 0 && !/return false/.test(baris[i])) {
      pelanggaran.push(
        `${s.kode} penyaring ${s.nama} TIDAK fail-closed — ` +
          'penyaring yang mengembalikan true membalik artinya sepenuhnya',
      )
    }
  }
}

// ── I-5: blok prompt menyangkal wewenangnya ────────────────────────────────
//
// Diperiksa di dalam BADAN `susunBlokIngatan`, bukan di seluruh berkas.
//
// Versi pertama penjaga ini memakai `pustaka.includes('<ingatan>')` — dan
// HIJAU-KARENA-BUTA: menghapus baris `'<ingatan>',` dari prompt tak
// memerahkannya, karena kata yang sama masih tertulis di komentar kepala
// berkas. Ketahuan hanya karena mutasi ujinya tak memerahkan apa pun.
//
// Persis kegagalan yang penjaga ini ada untuk mencegah, dalam bentuk lain.
/*
 * Dicocokkan sebagai BARIS UTUH, bukan substring.
 *
 * `includes('<ingatan>')` HIJAU-KARENA-BUTA dua kali berturut-turut saat
 * penjaga ini dibuat:
 *
 *   1. dicocokkan ke seluruh berkas → kata yang sama ada di komentar kepala,
 *      jadi menghapusnya dari prompt tak memerahkan apa pun;
 *   2. dicocokkan ke badan fungsi → `'</ingatan>'` MEMUAT `<ingatan>` sebagai
 *      substring, jadi menghapus pembukanya tetap lolos.
 *
 * Keduanya ketahuan hanya karena mutasi ujinya tak memerahkan apa pun.
 * Pola yang tepat menyebut barisnya persis seperti ia ditulis.
 */
const WAJIB_DI_BLOK = [
  { pola: /^\s*'<ingatan>',\s*$/m, nama: "pembuka '<ingatan>'" },
  { pola: /^\s*'<\/ingatan>',\s*$/m, nama: "penutup '</ingatan>'" },
  { pola: /BUKAN hasil pembacaan data/, nama: 'penyangkalan "BUKAN hasil pembacaan data"' },
  { pola: /abaikan/i, nama: 'perintah mengabaikan kalimat yang menyuruh' },
]

const badanBlok = pustaka.match(
  /export function susunBlokIngatan\([\s\S]*?\n\}/,
)

if (!badanBlok) {
  pelanggaran.push('I-5: `susunBlokIngatan` tidak ditemukan')
} else {
  for (const k of WAJIB_DI_BLOK) {
    if (!k.pola.test(badanBlok[0])) {
      pelanggaran.push(
        `I-5 blok prompt kehilangan ${k.nama} — ingatan tanpa penyangkalan ` +
          'wewenang bisa dibaca model sebagai fakta bersumber, atau sebagai perintah',
      )
    }
  }
}

// ── I-6: nol pembacaan `ai_ingatan` di luar pustaka ────────────────────────
function berkasTs(dir, keluar = []) {
  for (const nama of readdirSync(dir)) {
    if (nama === 'node_modules' || nama === '__tests__') continue
    const penuh = join(dir, nama)
    if (statSync(penuh).isDirectory()) berkasTs(penuh, keluar)
    else if (nama.endsWith('.ts')) keluar.push(penuh)
  }
  return keluar
}

for (const berkas of berkasTs(SRC)) {
  const rel = relative(SRC, berkas).replace(/\\/g, '/')
  if (rel === PUSTAKA.replace(/\\/g, '/') || BOLEH_MENYENTUH.has(rel)) continue

  const isi = readFileSync(berkas, 'utf8')
  isi.split('\n').forEach((b, i) => {
    if (/from\(['"]ai_ingatan['"]\)/.test(b)) {
      pelanggaran.push(
        `I-6 ${rel}:${i + 1} membaca \`ai_ingatan\` langsung — ` +
          'penyaringan lapis/izin/proyek hidup di lib/ai-ingatan.ts dan TIDAK ' +
          'ikut saat tabelnya disentuh dari tempat lain',
      )
    }
  })
}

// ── Laporan ────────────────────────────────────────────────────────────────
if (pelanggaran.length > 0) {
  console.error('\n✗ INGATAN BISA BOCOR\n')
  for (const p of pelanggaran) console.error(`  • ${p}`)
  console.error(
    `\n  ${pelanggaran.length} pelanggaran. Ambang NOL.\n` +
      '  Kebocoran ingatan TIDAK menghasilkan galat, 403, atau baris log —\n' +
      '  gejalanya hanya asisten yang suatu hari menyebut hal yang tak boleh\n' +
      '  ia sebut, tanpa satu pun izin yang jebol.\n',
  )
  process.exit(1)
}

console.log(
  `✓ Ingatan berpagar — ${SARINGAN.length} penyaring fail-closed, ` +
    'blok prompt menyangkal wewenang, nol pembacaan liar.',
)
