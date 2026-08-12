#!/usr/bin/env node
/**
 * PENJAGA: kunci kredensial yang DIBACA kode wajib punya TEMPAT DIISI.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * CACAT YANG MELAHIRKANNYA
 * ══════════════════════════════════════════════════════════════════════════
 *
 * `lib/otomasi-n8n.ts` membaca `N8N_BASE_URL` dan `N8N_API_KEY` sejak S7, dan
 * halaman Alur Otomasi berkali-kali menampilkan:
 *
 *     "N8N_BASE_URL belum diisi di halaman Kredensial."
 *
 * Padahal di halaman itu TAK ADA TEMPATNYA. `KATALOG_KREDENSIAL` yang
 * menentukan apa yang muncul di layar, dan n8n tak pernah masuk ke sana.
 *
 * Founder yang menemukannya, 2026-08-10: *"cuma ada wa, ai, sama email
 * disana."* Bukan test, bukan typecheck — keduanya hijau sempurna.
 *
 * ── Kenapa kelas cacat ini tak bergejala
 *
 * Ia bentuk ketiga dari kesalahan yang sama yang muncul TIGA KALI hari ini:
 *
 *   migrasi 270  izin dibuat, tak diberikan ke siapa pun    → fitur mati
 *   ai:history   izin dipegang, tak dibaca kode mana pun    → fitur mati
 *   N8N_*        kunci dibaca kode, tak ada tempat mengisi  → fitur mati
 *
 * Ketiganya: satu ujung ada, ujung lainnya tidak, dan tak satu pun
 * mengeluarkan galat. Yang membedakan hanya ujung mana yang hilang.
 *
 * ── Yang dijaga
 *
 * Tiap literal `ambilKredensial(x, 'KUNCI')` di `src/` wajib punya entri di
 * `KATALOG_KREDENSIAL`. Ambang NOL: kunci tanpa tempat isi selalu cacat, tak
 * ada kasus sahnya.
 *
 * Jalankan: node apps/api/scripts/audit-kredensial-punya-tempat.mjs
 */
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

const AKAR = join(import.meta.dirname, '..', 'src')
const KATALOG = join(AKAR, 'lib', 'kredensial.ts')

function berkasTs(dir) {
  const h = []
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (e.isDirectory()) {
      if (e.name === '__tests__') continue
      h.push(...berkasTs(join(dir, e.name)))
      continue
    }
    if (e.name.endsWith('.ts')) h.push(join(dir, e.name))
  }
  return h
}

// ── Kunci yang TERDAFTAR di katalog ─────────────────────────────────────────
const isiKatalog = readFileSync(KATALOG, 'utf8')
const terdaftar = new Set(
  [...isiKatalog.matchAll(/kunci:\s*'([A-Z0-9_]+)'/g)].map((m) => m[1]),
)

// ── Kunci yang DIBACA kode ──────────────────────────────────────────────────
const dibaca = new Map() // kunci → berkas pertama yang membacanya

for (const f of berkasTs(AKAR)) {
  if (f === KATALOG) continue
  const rel = f.slice(f.indexOf('src')).replace(/\\/g, '/')
  const isi = readFileSync(f, 'utf8')

  /*
   * TIGA bentuk yang dipakai repo ini:
   *
   *   ambilKredensial(request, 'KUNCI')      — langsung
   *   baca('KUNCI')                          — lewat fungsi yang disuntikkan
   *                                            (mis. `konfigurasiN8n`)
   *   kunciKredensial: 'KUNCI'               — dioper sebagai DATA, dibaca
   *                                            belakangan lewat variabel
   *
   * Bentuk kedua penting: `otomasi-n8n.ts` dan `wa-kirim.ts` memakainya, dan
   * penjaga yang hanya mencari bentuk pertama akan melewatkan justru berkas
   * yang melahirkan cacat ini.
   *
   * ── Bentuk KETIGA ditambahkan 2026-08-12, dan alasannya sebuah cacat hidup
   *
   * `ai-adaptor.ts:44` menyebut `AI_PROVIDER_API_KEY` sebagai nilai properti,
   * dan `ai-jalankan.ts:233` membacanya lewat `metaP?.kunciKredensial` —
   * tak pernah sebagai literal di titik panggil. Nama itu TIDAK ADA di
   * katalog, jadi penyedia OpenAI-compatible selalu gagal `kunci_tak_ada`.
   *
   * Penjaga ini HIJAU sepanjang cacat itu hidup ("Kunci dibaca kode: 3"),
   * karena ia hanya mengenali dua bentuk pertama. Persis kelemahan yang
   * membuat kelas cacat ini bertahan: penjaga yang mengukur bentuk, bukan
   * maksud, buta terhadap bentuk yang belum pernah dilihatnya.
   */
  /*
   * Komentar dilucuti dulu.
   *
   * Bentuk ketiga (`kunciKredensial: 'X'`) cukup umum untuk muncul di dalam
   * komentar yang MENJELASKANNYA — dan penjaga yang membaca komentar akan
   * merah karena kalimat, bukan karena kode. Penjaga yang merah tanpa sebab
   * nyata dilatih untuk diabaikan, dan penjaga yang diabaikan sama nilainya
   * dengan yang tak ada. (Terjadi seketika saat bentuk ini ditambahkan:
   * komentar perbaikan di `ai-adaptor.ts` sendiri yang membuatnya merah.)
   */
  const kode = isi
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/(^|[^:])\/\/.*$/gm, '$1')

  for (const m of kode.matchAll(
    /(?:ambilKredensial\([^,]+,|\bbaca\()\s*'([A-Z0-9_]+)'|kunciKredensial:\s*'([A-Z0-9_]+)'/g,
  )) {
    const kunci = m[1] ?? m[2]
    if (kunci && !dibaca.has(kunci)) dibaca.set(kunci, rel)
  }
}

const yatim = [...dibaca.entries()].filter(([k]) => !terdaftar.has(k))

console.log(`Kunci dibaca kode: ${dibaca.size} · terdaftar di katalog: ${terdaftar.size}`)

if (yatim.length > 0) {
  console.error(`\n❌ ${yatim.length} kunci DIBACA kode tapi tak ada tempat mengisinya\n`)
  console.error('   Halamannya akan menyuruh orang mengisi sesuatu yang tak punya kotak.')
  console.error('   Tambahkan entri di `KATALOG_KREDENSIAL` (lib/kredensial.ts).\n')
  yatim.forEach(([k, f]) => console.error(`     ${k.padEnd(24)} dibaca di ${f}`))
  console.error('')
  process.exit(1)
}

console.log('✓ Setiap kunci yang dibaca kode punya tempat diisi.')
