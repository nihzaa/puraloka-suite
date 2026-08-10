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
   * Dua bentuk yang dipakai repo ini:
   *
   *   ambilKredensial(request, 'KUNCI')      — langsung
   *   baca('KUNCI')                          — lewat fungsi yang disuntikkan
   *                                            (mis. `konfigurasiN8n`)
   *
   * Bentuk kedua penting: `otomasi-n8n.ts` dan `wa-kirim.ts` memakainya, dan
   * penjaga yang hanya mencari bentuk pertama akan melewatkan justru berkas
   * yang melahirkan cacat ini.
   */
  for (const m of isi.matchAll(/(?:ambilKredensial\([^,]+,|\bbaca\()\s*'([A-Z0-9_]+)'/g)) {
    if (!dibaca.has(m[1])) dibaca.set(m[1], rel)
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
