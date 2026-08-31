#!/usr/bin/env node
// ============================================================================
// OTOMASI MANA YANG BENAR-BENAR HIDUP — diukur, bukan ditulis
//
// ══════════════════════════════════════════════════════════════════════════
// KENAPA SKRIP INI ADA
// ══════════════════════════════════════════════════════════════════════════
//
// Founder bertanya dua kali dalam dua sesi: "workflow mana yang sudah dan
// mana yang belum?". Kedua kali saya menjawab dengan angka yang salah —
// pertama "13 dari 14" (padahal katalognya 138 baris berprioritas), lalu
// nyaris membangun ulang automation 3.5 yang ternyata SUDAH ada.
//
// Sebabnya bukan kecerobohan sekali: **tak ada satu pun dokumen di repo ini
// yang mencatat otomasi mana yang hidup.** Diukur 2026-08-14 — `grep` untuk
// `kasbon-outstanding`, `gr-matching`, `dependency-breach` di seluruh `docs/`
// memulangkan NOL. Katalog `06-agentic-ai...md` punya kolom terakhir yang
// mudah disalahbaca sebagai status; ia PRIORITAS ("Next"), dan enam automation
// yang sudah jalan pun masih tertulis "Next" di sana.
//
// Jadi tiap jawaban tentang "sudah/belum" selama ini adalah pembacaan ulang
// kode oleh siapa pun yang kebetulan ditanya — dan itu meleset dua kali dari
// dua kali percobaan.
//
// ── Kenapa SKRIP, bukan dokumen berisi daftar
//
// Aturan pembuka CLAUDE.md: kalau sebuah fakta bisa basi, jangan tulis
// faktanya — tulis cara mengukurnya. Daftar otomasi adalah contoh sempurna:
// ia berubah tiap kali satu alur ditambahkan, dan daftar yang tak ikut
// berubah persis yang membuat saya nyaris membangun ulang 3.5.
//
// Sumber kebenarannya KODE dan BASIS, bukan ingatan:
//
//   · tugas terjadwal  → rute `otomasi/jalankan/*` di `otomasi-terjadwal.ts`
//   · alur peristiwa   → `PETA_PERISTIWA` di `utils/terbit-peristiwa.ts`
//   · terdaftar        → tabel `otomasi_alur`
//   · benar-benar jalan → tabel `otomasi_jalan`
//
// Kolom terakhir itu yang paling penting, dan yang paling sering dilewati:
// "terdaftar dan aktif" TIDAK sama dengan "pernah jalan". Diukur 2026-08-14:
// 11 alur aktif, 9 di antaranya nol eksekusi seumur hidup — termasuk yang
// hari itu juga mengirim 28 WhatsApp sungguhan ke founder.
//
// Bukan penjaga CI: ia tak memerahkan apa pun, hanya melaporkan. Dijalankan
// saat ada yang bertanya "sudah sampai mana otomasinya".
// ============================================================================

import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'

const AKAR_API = join(dirname(fileURLToPath(import.meta.url)), '..')

// ── 1. Yang ada di KODE ──────────────────────────────────────────────────
const terjadwal = [...new Set(
  readFileSync(join(AKAR_API, 'src/routes/v1/otomasi-terjadwal.ts'), 'utf8')
    .match(/otomasi\/jalankan\/[a-z-]+/g) ?? [],
)].map(s => s.replace('otomasi/jalankan/', '')).sort()

const isiJembatan = readFileSync(join(AKAR_API, 'src/utils/terbit-peristiwa.ts'), 'utf8')
const petaBlok = isiJembatan.slice(
  isiJembatan.indexOf('PETA_PERISTIWA'),
  isiJembatan.indexOf('}', isiJembatan.indexOf('PETA_PERISTIWA')),
)
const peristiwa = [...petaBlok.matchAll(/(\w+):\s*'([a-z-]+)'/g)]
  .map(m => ({ jenis: m[1], kode: m[2] }))

console.log(`\n── Tugas terjadwal (rute otomasi/jalankan/*): ${terjadwal.length}`)
for (const t of terjadwal) console.log(`   · ${t}`)

console.log(`\n── Alur peristiwa (jembatan notifikasi → n8n): ${peristiwa.length}`)
for (const p of peristiwa) console.log(`   · ${p.jenis.padEnd(24)} → ${p.kode}`)

// ── 2. Yang tercatat di BASIS ────────────────────────────────────────────
const DB = process.env.DATABASE_URL || process.env.DIRECT_URL
if (!DB) {
  console.log('\n⏭  Bagian basis DILEWATI (tak ada DATABASE_URL).\n')
  process.exit(0)
}

const requireDari = createRequire(join(AKAR_API, 'package.json'))
let pg = null
try { pg = requireDari('pg') } catch { /* dilaporkan di bawah */ }
if (!pg) {
  console.log('\n⏭  Bagian basis DILEWATI (pg tak ter-resolve).\n')
  process.exit(0)
}

const c = new pg.Client({ connectionString: DB })
await c.connect()

const { rows } = await c.query(`
  SELECT a.kode, a.pemicu, a.aktif,
         count(j.id)::int                                   AS jalan,
         count(j.id) FILTER (WHERE j.status = 'sukses')::int AS sukses,
         count(j.id) FILTER (WHERE j.status = 'gagal')::int  AS gagal,
         to_char(max(j.dimulai_pada) AT TIME ZONE 'Asia/Jakarta', 'MM-DD HH24:MI') AS terakhir
    FROM otomasi_alur a
    LEFT JOIN otomasi_jalan j ON j.alur_id = a.id
   GROUP BY a.kode, a.pemicu, a.aktif
   ORDER BY a.aktif DESC, jalan DESC, a.kode
`)

/*
  ── DUA BUKU, dan yang di atas BUKAN yang dijalankan penjadwal

  Query di atas membaca `otomasi_alur` — buku ALUR n8n. Penjadwal tidak
  membacanya. Yang menentukan sebuah tugas jatuh tempo adalah
  `jadwal_tugas.terakhir_jalan` (`src/lib/jadwal.ts:152`), tabel yang berbeda.

  Selisihnya bukan kecil, dan sudah memakan korban. Diukur 2026-09-01:

      otomasi_alur   :  11 aktif ·   8 baris otomasi_jalan seumur hidup
      jadwal_tugas   : 329 aktif · 577 eksekusi, 326 dalam 24 jam terakhir

  Membaca yang pertama saja, saya menyimpulkan "otomasi tak pernah jalan",
  lalu menulis permintaan ratifikasi meminta founder menyalakan penjadwal —
  dan penjadwalnya sudah hidup sejak 2026-08-15.

  Skrip ini lahir persis untuk mencegah jawaban salah tentang "otomasi mana
  yang hidup" (lihat kepala berkas), lalu memberi jawaban salah dengan cara
  yang sama: mengukur satu tabel dan menamainya seluruh kebenaran. Karena itu
  buku kedua sekarang ikut dilaporkan — bukan sebagai catatan kaki.
*/
const { rows: jadwal } = await c.query(`
  SELECT jt.aktif,
         coalesce(jt.terakhir_status, '(belum pernah)')     AS status,
         count(*)::int                                      AS n,
         sum(jt.jumlah_jalan)::int                          AS total_jalan,
         count(*) FILTER (WHERE NOT co.is_active)::int      AS company_mati,
         to_char(max(jt.terakhir_jalan) AT TIME ZONE 'Asia/Jakarta',
                 'MM-DD HH24:MI')                           AS terakhir
    FROM jadwal_tugas jt
    JOIN companies co ON co.id = jt.company_id
   GROUP BY jt.aktif, coalesce(jt.terakhir_status, '(belum pernah)')
   ORDER BY jt.aktif DESC, 3 DESC
`)

await c.end()

console.log(`\n── Terdaftar di otomasi_alur: ${rows.length}\n`)
console.log('   aktif kode                             pemicu    jalan sukses gagal terakhir')
for (const r of rows) {
  console.log(
    `    ${r.aktif ? '✓' : '·'}   ${String(r.kode).padEnd(33)} ${String(r.pemicu).padEnd(9)} `
    + `${String(r.jalan).padStart(5)} ${String(r.sukses).padStart(6)} ${String(r.gagal).padStart(5)}  ${r.terakhir ?? '—'}`,
  )
}

const aktif = rows.filter(r => r.aktif)
const aktifTanpaJalan = aktif.filter(r => r.jalan === 0)

console.log(`\n── Ringkasan`)
console.log(`   terdaftar          : ${rows.length}`)
console.log(`   aktif              : ${aktif.length}`)
console.log(`   aktif TAPI nol jalan: ${aktifTanpaJalan.length}`)

if (aktifTanpaJalan.length > 0) {
  console.log('')
  console.log('   ⚠ "Aktif" TIDAK berarti "pernah jalan". Alur di bawah ini tercatat')
  console.log('     aktif tetapi nol eksekusi seumur hidup:')
  for (const r of aktifTanpaJalan) console.log(`       · ${r.kode}`)
  console.log('')
  console.log('     Sebagian wajar — alur berpemicu jadwal menunggu penjadwal luar')
  console.log('     — TAPI periksa dulu `jadwal_tugas`: kalimat lama di sini')
  console.log('     menyebut "SCHEDULER_URL, belum di-deploy", dan itu SALAH.')
  console.log('     `SCHEDULER_URL` tak dipakai satu baris kode pun; yang ada')
  console.log('     `POST /api/v1/jadwal/jalankan` + `scripts/penjadwal-lokal.mjs`.')
  console.log('     Alur peristiwa menunggu')
  console.log('     peristiwanya terjadi.')
  console.log('')
  console.log('     Yang TIDAK wajar: alur yang jelas-jelas menembak tetapi tetap nol.')
  console.log('     Itu terjadi 2026-08-14 — `teruskan-kasbon-diajukan` mengirim 28')
  console.log('     WhatsApp sungguhan sementara bukunya kosong, karena jembatannya')
  console.log('     melewati `jalankanAlur()`. Dijaga `audit-alur-tercatat.mjs`.')
}

console.log('')

// ── Buku KEDUA: jadwal_tugas — yang benar-benar dijalankan penjadwal ─────
console.log('── Tugas terjadwal di basis (jadwal_tugas) ──────────────────')
console.log('')
console.log('   Ini tabel yang DIBACA PENJADWAL. Yang di atas (otomasi_alur)')
console.log('   adalah buku alur n8n — angkanya beda jauh, dan mengira yang')
console.log('   satu mewakili yang lain sudah salah sekali (2026-09-01).')
console.log('')
console.log('   aktif status            tugas  jumlah_jalan  terakhir')
{
  let aktifSukses = 0
  let aktifGagal = 0
  let mati = 0
  for (const r of jadwal) {
    console.log(
      `    ${r.aktif ? '✓' : '·'}    ${String(r.status).padEnd(16)} `
      + `${String(r.n).padStart(5)} ${String(r.total_jalan ?? 0).padStart(13)}  ${r.terakhir ?? '—'}`,
    )
    if (r.aktif && r.status === 'sukses') aktifSukses += r.n
    if (r.aktif && r.status === 'gagal') aktifGagal += r.n
    if (r.aktif) mati += r.company_mati
  }

  console.log('')
  console.log(`   aktif & sukses terakhir : ${aktifSukses}`)
  console.log(`   aktif & GAGAL terakhir  : ${aktifGagal}`)

  if (mati > 0) {
    console.log('')
    console.log(`   ⚠ ${mati} tugas aktif milik company NONAKTIF — akan gagal 403`)
    console.log('     tiap denyut ("Anda bukan anggota perusahaan tersebut").')
    console.log('     Dijaga `audit-jadwal-company-hidup.mjs` (ambang NOL);')
    console.log('     perbaikannya migrasi maju, pola 563.')
  }

  if (aktifGagal > 0 && mati === 0) {
    console.log('')
    console.log('   ⚠ Ada tugas aktif yang gagal dan company-nya HIDUP — ini')
    console.log('     kegagalan sungguhan, bukan sisa data uji. Galat lengkapnya:')
    console.log("       SELECT tugas, terakhir_galat FROM jadwal_tugas")
    console.log("        WHERE aktif AND terakhir_status = 'gagal' LIMIT 5;")
  }
}
console.log('')


/*
  ── Silang ke katalog dokumen: apa yang dokumen masih sebut "menunggu"

  Bagian ini menjawab pertanyaan yang sudah dua kali salah dijawab, dan yang
  tak bisa dijawab dengan membaca dokumen mana pun — karena dokumennya justru
  yang sedang diperiksa.

  Kolom `N/N/L/O` di `06-agentic-ai-*.md` adalah PRIORITAS, bukan status. Itu
  sudah tertulis di sana sebagai peringatan. Tapi peringatan itu **sendiri
  memuat angka** ("tujuh automation yang sudah hidup"), dan angka itu basi
  dalam sehari: diukur 2026-08-15 jumlahnya empat belas.

  Jadi angkanya dipindahkan ke sini — tempat ia dihitung ulang tiap kali
  dijalankan, bukan tempat ia perlu diingat orang untuk diperbarui.

  Ini BUKAN penjaga CI dan sengaja tidak dijadikan penjaga: dokumen katalog
  memang tak dimaksudkan mencatat status, jadi "tidak cocok" adalah keadaan
  normalnya, bukan pelanggaran. Yang dilaporkan hanya seberapa jauh selisihnya,
  supaya yang membaca tabel itu tahu ia sedang membaca prioritas.
*/
{
  const AKAR_REPO = join(AKAR_API, '..', '..')
  const BERKAS_KATALOG_MD = join(
    AKAR_REPO,
    'docs/superpowers/specs/2026-07-18-enterprise-architecture',
    '06-agentic-ai-and-automation-architecture.md',
  )
  const BERKAS_KATALOG_TS = join(AKAR_API, 'src/lib/katalog-otomasi.ts')

  let md = null
  let ts = null
  try {
    md = readFileSync(BERKAS_KATALOG_MD, 'utf8')
    ts = readFileSync(BERKAS_KATALOG_TS, 'utf8')
  } catch {
    // Berkasnya dipindah/dihapus — dilaporkan, tidak dilempar. Skrip ini
    // pelapor, dan pelapor yang jatuh tak melaporkan apa pun.
    console.log('   (katalog dokumen atau katalog kode tak terbaca — silang dilewati)')
  }

  if (md && ts) {
    /*
      Satu entri boleh menutup BEBERAPA nomor katalog, dipisah koma —
      `polis-berakhir` menjawab 5.7 dan 9.2 sekaligus.

      Bentuk pertama pola ini hanya menerima satu nomor (`[\d.]+`), jadi 9.2
      terus terhitung "belum dikerjakan" padahal rutenya hidup. Skrip yang
      dibuat untuk menangkap katalog basi, basi dengan caranya sendiri.
    */
    const nomorHidup = new Set(
      [...ts.matchAll(/nomor:\s*'([\d.,\s]+)'/g)]
        .flatMap((m) => m[1].split(',').map((x) => x.trim()))
        .filter(Boolean),
    )

    const menunggu = []
    for (const baris of md.split(/\r?\n/)) {
      if (!/^\|\s*\d+\.\d+\s*\|/.test(baris)) continue
      const sel = baris.split('|').map((x) => x.trim())
      const nomor = sel[1]
      if (!nomorHidup.has(nomor)) continue
      const fase = sel.find((x) => /^Phase \d/.test(x)) ?? '?'
      const prio = sel.filter(Boolean).pop() ?? '?'
      menunggu.push({ nomor, nama: sel[2] ?? '', fase, prio })
    }

    console.log('── Silang ke katalog dokumen ────────────────────────────────')
    console.log(`   otomasi terjelaskan di katalog kode : ${nomorHidup.size}`)
    console.log(`   di antaranya masih tertulis menunggu: ${menunggu.length}`)

    if (menunggu.length > 0) {
      console.log('')
      console.log('   Nomor di bawah SUDAH punya rute hidup, tetapi tabel di')
      console.log('   `06-agentic-ai-*.md` masih menyebut fase/prioritas menunggu.')
      console.log('   Itu WAJAR — kolom itu prioritas, bukan status. Yang tidak wajar')
      console.log('   adalah membaca tabel itu untuk menjawab "sudah dikerjakan belum".')
      console.log('')
      for (const m of menunggu) {
        console.log(
          `       ${m.nomor.padEnd(6)} ${m.nama.slice(0, 40).padEnd(42)} `
          + `${m.fase.padEnd(9)} ${m.prio}`,
        )
      }
    }
    console.log('')
  }
}
