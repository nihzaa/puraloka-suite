/**
 * PENJAGA: DOKUMEN TAK BOLEH MENYEBUT BASIS INI "DATA DUMMY".
 *
 * ── Kenapa penjaga ini ada
 *
 * CLAUDE.md §8a.5 pernah berbunyi "Seluruh isi basis saat ini data dummy".
 * Kalimat itu bertahan berbulan-bulan sesudah tak benar, dan membuat DUA
 * sesi berbeda menulis ke PRODUKSI sambil mengira sedang di pengembangan —
 * satu di antaranya menjalankan migrasi izin sungguhan sebelum
 * memundurkannya.
 *
 * Diukur 2026-09-01:
 *
 *     apps/api/.env  dan  VPS /srv/puraloka-suite/.env  menunjuk
 *     SUPABASE_URL yang SAMA PERSIS. Satu basis, bukan dua.
 *
 *     proyek nyata 21 · klien 13 · company 2.095 · pengguna aktif 23
 *
 * ── Yang diperiksa
 *
 * Dua arah, dan keduanya perlu:
 *
 *   1. TEKS  — dokumen kunci tak boleh menyatakan basisnya dummy/percobaan
 *              tanpa peringatan produksi di dekatnya.
 *   2. FAKTA — kalau koneksi tersedia, hitung data nyata. Basis yang
 *              benar-benar kosong boleh saja disebut dummy; yang berisi
 *              21 proyek nyata tidak.
 *
 * Pemeriksaan FAKTA dilewati bila tak ada koneksi (mis. runner tanpa
 * kredensial) — dan itu DINYATAKAN, bukan diam-diam lulus.
 *
 * Ambang NOL.
 */
import { readFileSync, existsSync } from 'node:fs'
import { buatClient, REPO_ROOT, adaKoneksi } from '../../../scripts/db/_koneksi.mjs'

const BERKAS = [
  `${REPO_ROOT}/CLAUDE.md`,
  `${REPO_ROOT}/docs/execution/CHARTER.md`,
]

/* Frasa yang menyatakan basisnya tak nyata. Sengaja spesifik: "data dummy"
   di dalam kalimat yang menerangkan BASIS, bukan tiap kemunculan kata. */
const POLA = [
  /seluruh isi basis[^.\n]{0,40}data dummy/i,
  /basis(?:nya)? (?:ini )?(?:masih )?(?:cuma |hanya )?(?:berisi )?data dummy/i,
  /semua data(?: di)? bas[ei]s[^.\n]{0,30}dummy/i,
]

let temuan = []
for (const f of BERKAS) {
  if (!existsSync(f)) continue
  const isi = readFileSync(f, 'utf8')
  for (const p of POLA) {
    const m = isi.match(p)
    if (!m) continue
    /* Boleh ADA bila di dekatnya dinyatakan produksi — supaya kutipan
       sejarah ("kalimat lama berbunyi …") tak dituduh. */
    const i = isi.indexOf(m[0])
    const sekitar = isi.slice(Math.max(0, i - 600), i + 600)
    if (/MELAYANI PRODUKSI|sudah tidak benar|bukan lingkungan pengembangan/i.test(sekitar)) continue
    temuan.push(`${f.replace(REPO_ROOT + '/', '')}: "${m[0].slice(0, 70)}"`)
  }
}

console.log('══ Basis bukan dummy ═══════════════════════════════════════')
console.log(`  berkas diperiksa : ${BERKAS.length}`)
console.log(`  klaim "dummy"    : ${temuan.length}`)

let nyata = null
if (adaKoneksi()) {
  const c = buatClient()
  await c.connect()
  const { rows } = await c.query(`
    SELECT (SELECT count(*) FROM projects WHERE name NOT ILIKE '%uji%'
              AND name NOT ILIKE '%CI Seed%')::int AS proyek,
           (SELECT count(*) FROM users WHERE is_active
              AND email NOT LIKE '%.test')::int AS pengguna`)
  await c.end()
  nyata = rows[0]
  console.log(`  proyek NYATA     : ${nyata.proyek}`)
  console.log(`  pengguna aktif   : ${nyata.pengguna}`)
} else {
  console.log('  (fakta DILEWATI — tak ada koneksi basis di lingkungan ini)')
}

if (temuan.length) {
  console.error('\n❌ Dokumen menyebut basis ini "data dummy":')
  for (const t of temuan) console.error(`     ${t}`)
  console.error('\n   Basis ini MELAYANI PRODUKSI — apps/api/.env dan VPS')
  console.error('   menunjuk SUPABASE_URL yang sama. Klaim "dummy" membuat')
  console.error('   orang menulis ke data nyata sambil mengira sedang di dev,')
  console.error('   dan itu SUDAH TERJADI dua kali.')
  process.exit(1)
}

if (nyata && nyata.proyek === 0 && nyata.pengguna === 0) {
  console.log('\n✅ nol klaim dummy — dan basisnya memang kosong.')
} else {
  console.log('\n✅ nol klaim "data dummy" di dokumen kunci.')
}
