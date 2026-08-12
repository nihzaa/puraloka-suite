#!/usr/bin/env node
/**
 * PENJAGA: TIAP ENTITY TYPE APPROVAL WAJIB MUNCUL DI INBOX.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * KENAPA ADA
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Inbox approval terpusat menjawab satu pertanyaan: *"apa yang menunggu
 * keputusan saya?"* Jawaban yang TIDAK LENGKAP lebih berbahaya daripada tak
 * ada jawaban sama sekali — approver belajar bahwa antrean kosong berarti tak
 * ada pekerjaan, lalu berhenti memeriksa modul yang tak pernah muncul.
 *
 * Dan modul yang tak pernah muncul tak menimbulkan keluhan: dokumennya
 * tertahan, orang yang mengajukannya menunggu, dan tak seorang pun tahu
 * sebabnya. Persis kelas cacat yang sama dengan `BackupPolicy` TJS —
 * "ada di layar, tidak di kenyataan", hanya dari arah sebaliknya.
 *
 * ── Yang diperiksa
 *
 * Tiap `ApprovalEntityType` yang dideklarasikan di `utils/approval.ts` HARUS
 * punya entri di `SUMBER_INBOX` (`lib/inbox-approval.ts`).
 *
 * Sumbernya tipe TypeScript, bukan daftar yang diketik tangan di sini: menambah
 * jenis approval baru berarti menambah anggota union itu, dan penjaga ini
 * otomatis menuntutnya muncul di inbox. Tak ada daftar kedua yang bisa
 * ketinggalan.
 *
 * ── Ambang NOL
 *
 * Tak ada jenis yang pantas "diwariskan" sebagai tak terlihat. Kalau sebuah
 * jenis memang tak boleh muncul di inbox, alasannya ditulis di
 * `DIKECUALIKAN` — di diff, terlihat, bisa dibantah.
 *
 * Pakai:  node apps/api/scripts/audit-inbox-lengkap.mjs
 */
import { readFileSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const SRC = resolve(__dirname, '..', 'src')
const APPROVAL = join(SRC, 'utils', 'approval.ts')
const KATALOG = join(SRC, 'lib', 'inbox-approval.ts')

/**
 * Jenis yang SENGAJA tak muncul di inbox, beserta alasannya.
 *
 * Kosong hari ini, dan sebaiknya tetap begitu. Tiap entri di sini adalah
 * pekerjaan yang tak akan pernah dilihat approver dari satu tempat.
 */
const DIKECUALIKAN = {}

for (const p of [APPROVAL, KATALOG]) {
  if (!existsSync(p)) {
    console.error(`✗ Berkas tak ditemukan: ${p}`)
    console.error('  Kalau dipindah, perbarui jalurnya di penjaga ini.')
    process.exit(1)
  }
}

// ── Jenis yang dideklarasikan mesin approval ─────────────────────────────
const srcApproval = readFileSync(APPROVAL, 'utf8')
const mUnion = /export type ApprovalEntityType\s*=([\s\S]*?)(?:\n\n|\n\/\*\*)/.exec(srcApproval)
if (!mUnion) {
  console.error('✗ `ApprovalEntityType` tak terbaca di utils/approval.ts')
  console.error('  Bentuknya berubah? Penjaga ini menuntutnya sebagai union literal.')
  process.exit(1)
}
const jenisMesin = [...mUnion[1].matchAll(/'([a-z_]+)'/g)].map((m) => m[1])

if (jenisMesin.length < 5) {
  // Parser yang patah akan melaporkan "semua lengkap" untuk daftar kosong —
  // penjaga yang tak memeriksa apa pun lebih buruk daripada tak ada penjaga.
  console.error(`✗ Hanya ${jenisMesin.length} jenis terbaca — parsernya mungkin patah.`)
  process.exit(1)
}

// ── Jenis yang ada di katalog inbox ──────────────────────────────────────
const srcKatalog = readFileSync(KATALOG, 'utf8')
const jenisInbox = new Set(
  [...srcKatalog.matchAll(/^\s*jenis:\s*'([a-z_]+)'/gm)].map((m) => m[1]),
)

const hilang = jenisMesin.filter((j) => !jenisInbox.has(j) && !(j in DIKECUALIKAN))
// Arah sebaliknya juga salah: katalog yang menyebut jenis yang tak dikenal
// mesin berarti salah ketik, dan barisnya tak akan pernah cocok apa pun.
const asing = [...jenisInbox].filter((j) => !jenisMesin.includes(j))

console.log('══ Inbox approval lengkap ══════════════════════════════════')
console.log(`  jenis di mesin  : ${jenisMesin.length}`)
console.log(`  jenis di inbox  : ${jenisInbox.size}`)
console.log(`  tak terwakili   : ${hilang.length}`)
console.log(`  asing di katalog: ${asing.length}`)
console.log('  ambang          : 0 (bukan ratchet)\n')

// ── Kolom katalog wajib NYATA di schema ────────────────────────────────────
//
// Entri yang LENGKAP tapi menyebut kolom yang tak ada tetap membuat jenisnya
// tak terbaca — dan gagalnya masuk daftar `dilewati` di respons, bukan
// melempar. Penjaga ini sebelumnya hanya memeriksa KEBERADAAN entri, jadi ia
// hijau sementara `opname_bersama` dan `back_charge` (E1) menyebut
// `created_at` pada tabel yang sebenarnya memakai `dibuat_pada`. Ketahuan
// lewat test, bukan lewat penjaga — dan itu urutan yang terbalik.
//
// Butuh basis. Tanpa DATABASE_URL pemeriksaan ini DILEWATI DENGAN SUARA,
// bukan dilaporkan lulus. Pola yang sama dengan `audit-sod-gerbang`.
let gagalKolom = 0
{
  const punyaDb = !!(process.env.DATABASE_URL || process.env.DIRECT_URL)
  if (!punyaDb) {
    console.log('  ⏭  kolom katalog vs schema: DILEWATI (tak ada DATABASE_URL)')
    console.log('     Ini pemeriksaan yang menangkap kolom salah nama —')
    console.log('     CI menjalankannya dengan basis, lokal boleh tanpa.\n')
  } else {
    const { default: pg } = await import('pg')
    const c = new pg.Client({
      connectionString: process.env.DATABASE_URL || process.env.DIRECT_URL,
    })
    await c.connect()

    // Blok entri dibaca utuh, lalu tiap kolomnya diambil DARI blok itu — bukan
    // satu regex panjang yang menuntut urutan field tertentu. Urutan field yang
    // berubah membuat regex begitu diam-diam berhenti cocok, dan entri yang tak
    // terbaca justru yang paling mungkin salah bentuk.
    const blok = [...srcKatalog.matchAll(/jenis: '([a-z_]+)',([\s\S]*?)jalurUi: '[^']*',/g)]
    const salah = []
    let diperiksa = 0

    for (const [, jenis, isi] of blok) {
      const tabel = /tabel: '([a-z_]+)'/.exec(isi)?.[1]
      if (!tabel) continue
      diperiksa++

      const kolom = [['status', 'status']]
      for (const medan of ['kolomNominal', 'kolomJudul', 'kolomNomor', 'kolomPengaju', 'kolomDibuat']) {
        const m = new RegExp(medan + ": '([a-z_]+)'").exec(isi)
        if (m) kolom.push([medan, m[1]])
      }

      for (const [medan, nk] of kolom) {
        const r = await c.query(
          'SELECT 1 FROM information_schema.columns WHERE table_schema=$1 AND table_name=$2 AND column_name=$3',
          ['public', tabel, nk],
        )
        if (r.rowCount === 0) salah.push({ jenis, tabel, medan, kolom: nk })
      }
    }
    await c.end()

    console.log(`  entri diperiksa vs schema: ${diperiksa}`)
    if (diperiksa !== jenisInbox.size) {
      console.error(`\n❌ Hanya ${diperiksa} dari ${jenisInbox.size} entri terbaca polanya.`)
      console.error('   Entri yang tak terbaca tak terperiksa — dan justru yang')
      console.error('   paling mungkin salah bentuk.\n')
      gagalKolom++
    }
    if (salah.length > 0) {
      console.error('\n❌ Kolom katalog TIDAK ADA di schema:\n')
      for (const x of salah) {
        console.error(`     ${x.jenis.padEnd(18)} ${x.medan.padEnd(14)} ${x.tabel}.${x.kolom}`)
      }
      console.error('\n   Jenis ini akan GAGAL dibaca inbox dan masuk daftar `dilewati` —')
      console.error('   terlihat di katalog, tapi tak pernah sampai ke approver.\n')
      gagalKolom++
    }
  }
}

if (hilang.length === 0 && asing.length === 0 && gagalKolom === 0) {
  console.log('✓ Semua jenis approval muncul di inbox, dan kolomnya nyata.')
  process.exit(0)
}
// Kolom salah tanpa jenis yang hilang: keluar merah di sini, karena daftar di
// bawah hanya membicarakan jenis yang hilang/asing.
if (hilang.length === 0 && asing.length === 0) process.exit(1)

for (const j of hilang) {
  console.error(`   ✗ '${j}' — punya rantai approval, TAPI tak muncul di inbox`)
}
for (const j of asing) {
  console.error(`   ✗ '${j}' — ada di katalog inbox, tapi bukan ApprovalEntityType`)
}

console.error(`
   Inbox yang tak lengkap mengajarkan approver bahwa antrean kosong berarti
   tak ada pekerjaan. Dokumen jenis yang hilang akan tertahan tanpa seorang
   pun tahu sebabnya — dan tak ada error yang menandainya.

   Tambahkan entrinya di src/lib/inbox-approval.ts. VERIFIKASI tiap kolom ke
   information_schema, jangan diingat: nama status dan kolom di repo ini
   TIDAK seragam antar modul (pending · submitted · under_review · diajukan),
   dan tebakan yang salah membuat jenis itu masuk daftar "dilewati" —
   terlihat, tapi tetap tak terbaca.
`)
process.exit(1)
