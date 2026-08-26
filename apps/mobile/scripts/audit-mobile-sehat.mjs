#!/usr/bin/env node
/**
 * PENJAGA APPS/MOBILE — tiga kelas cacat yang semuanya GAGAL TANPA SUARA.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * KENAPA PENJAGA INI ADA
 * ══════════════════════════════════════════════════════════════════════════
 *
 * `apps/mobile` tak pernah tercakup satu pun dari 167 penjaga CI repo ini.
 * Akibatnya, tiga cacat hidup berdampingan di sana tanpa ada yang menyebut:
 *
 *   1. `/api/v1/mandor/kasbons` — rute yang TIDAK ADA. Tiap muat 404.
 *   2. `catch {}` kosong di 5 layar — 404 itu tampil sebagai "Belum ada
 *      kasbon", jadi tak seorang pun bertanya kenapa.
 *   3. Literal peran sebagai gerbang tab (`role === 'mandor'`) — melanggar
 *      ADR-004; peran custom per-tenant kehilangan seluruh menunya.
 *
 * Ketiganya kelas yang SUDAH dijaga di sisi API (`audit-catch-senyap`,
 * `adr004-ratchet`, `audit-izin-benar-ada`). Yang hilang bukan disiplinnya,
 * melainkan jangkauannya.
 *
 * ── Kenapa rute diperiksa terhadap KODE API, bukan daftar tetap
 *
 * Daftar rute yang ditulis tangan di penjaga akan basi persis seperti angka
 * di dokumen. Di sini rutenya dibaca dari `apps/api/src/routes/**` saat
 * penjaga berjalan, jadi rute yang dihapus/di-rename langsung ketahuan.
 *
 * Ambang: NOL untuk ketiganya.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const DIR = dirname(fileURLToPath(import.meta.url))
const AKAR = join(DIR, '..', '..', '..')
const MOBILE = join(AKAR, 'apps', 'mobile')
const RUTE_API = join(AKAR, 'apps', 'api', 'src', 'routes')

function berkasBer(ext, dir, keluar = []) {
  for (const nama of readdirSync(dir)) {
    if (nama === 'node_modules' || nama === '.expo') continue
    const penuh = join(dir, nama)
    if (statSync(penuh).isDirectory()) berkasBer(ext, penuh, keluar)
    else if (ext.some((e) => nama.endsWith(e))) keluar.push(penuh)
  }
  return keluar
}

const rel = (p) => p.replace(AKAR, '').replace(/\\/g, '/').replace(/^\//, '')

// ── Kumpulkan rute yang BENAR-BENAR terdaftar di API ────────────────────────
const rutePunyaApi = new Set()
for (const f of berkasBer(['.ts'], RUTE_API)) {
  if (f.includes('__tests__')) continue
  const isi = readFileSync(f, 'utf8')
  /*
    ⚠ Pola ini WAJIB memahami tiga bentuk sekaligus. Versi pertama penjaga
    ini hanya mengenali bentuk (1), lalu MENUDUH `/projects/:id/rab` sebagai
    rute hantu — padahal ia ada di `rab.ts:416`, ditulis dengan bentuk (3):

      (1) app.get('/api/v1/x', …)
      (2) app.get<{ Params: … }>('/api/v1/x', …)      ← generic
      (3) app.get<{ … }>(\n  '/api/v1/x',             ← jalur di baris BERIKUTNYA

    Penjaga yang memberi tuduhan palsu lebih berbahaya daripada yang tak ada:
    orang belajar mengabaikannya, lalu tuduhan yang BENAR ikut diabaikan.
    Karena itu `[\s\S]*?` melintasi baris, dan `<[^>]*>` menerima generic.
  */
  for (const m of isi.matchAll(
    /app\.(?:get|post|put|patch|delete)\s*(?:<[\s\S]*?>)?\s*\(\s*(?:(?:\/\/[^\n]*\n|\/\*[\s\S]*?\*\/)\s*)*'([^']+)'/g,
  )) {
    rutePunyaApi.add(m[1])
  }
}

/** `/api/v1/projects/${id}/rab` → `/api/v1/projects/:x/rab` */
function polakan(jalur) {
  return jalur.replace(/\$\{[^}]*\}/g, ':x').replace(/\/+$/, '')
}
const polaApi = new Set([...rutePunyaApi].map((r) => r.replace(/:[^/]+/g, ':x')))

const layarMobile = berkasBer(['.tsx', '.ts'], join(MOBILE, 'app'))
  .concat(berkasBer(['.ts'], join(MOBILE, 'lib')))

let rutaHantu = 0
let catchSenyap = 0
let literalPeran = 0

console.log('\n== apps/mobile sehat ==========================================\n')
console.log(`  rute terdaftar di API : ${rutePunyaApi.size}`)

// ── 1. Rute hantu ───────────────────────────────────────────────────────────
for (const f of layarMobile) {
  const isi = readFileSync(f, 'utf8')
  for (const m of isi.matchAll(/api\.(?:get|post|put|patch|delete)(?:<[^>]*>)?\(\s*[`']([^`']+)[`']/g)) {
    const jalur = polakan(m[1].split('?')[0])
    if (!jalur.startsWith('/api/')) continue
    if (!polaApi.has(jalur)) {
      console.log(`  HANTU  ${rel(f)}`)
      console.log(`           ${jalur} — tak ada di apps/api/src/routes`)
      rutaHantu++
    }
  }
}

// ── 2. catch kosong ─────────────────────────────────────────────────────────
for (const f of layarMobile) {
  const isi = readFileSync(f, 'utf8')
  // `} catch {` atau `} catch (e) {` yang badannya hanya komentar/kosong
  for (const m of isi.matchAll(/\}\s*catch\s*(?:\([^)]*\)\s*)?\{([^{}]*)\}/g)) {
    const badan = m[1].replace(/\/\/[^\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, '').trim()
    if (badan === '') {
      console.log(`  SENYAP ${rel(f)} — catch tanpa satu pun pernyataan`)
      catchSenyap++
    }
  }
}

// ── 3. Literal peran sebagai gerbang (ADR-004) ─────────────────────────────
for (const f of layarMobile) {
  const isi = readFileSync(f, 'utf8')
  // Buang komentar dulu: penjelasan yang MENGUTIP bentuk lama bukan pelanggaran.
  const kode = isi.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '')
  for (const m of kode.matchAll(/role\s*===\s*['"](admin|pm|mandor|client)['"]/g)) {
    console.log(`  PERAN  ${rel(f)} — role === '${m[1]}' dipakai sebagai gerbang`)
    literalPeran++
  }
}

const total = rutaHantu + catchSenyap + literalPeran
console.log(`\n  rute hantu      : ${rutaHantu} (ambang 0)`)
console.log(`  catch senyap    : ${catchSenyap} (ambang 0)`)
console.log(`  literal peran   : ${literalPeran} (ambang 0)\n`)

if (total > 0) {
  console.error('  Ketiganya gagal TANPA SUARA di tangan mandor:')
  console.error('   - rute hantu  → 404 yang tampil seperti "belum ada data"')
  console.error('   - catch senyap→ kegagalan tak bisa dibedakan dari kekosongan')
  console.error('   - literal peran→ peran custom kehilangan menunya (ADR-004)\n')
  process.exit(1)
}
console.log('  Bersih.\n')
