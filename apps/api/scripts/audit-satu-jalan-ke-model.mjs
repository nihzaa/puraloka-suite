#!/usr/bin/env node
/**
 * PENJAGA L-6: SATU JALAN KE MODEL.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * KENAPA PEMANGGILAN SDK LANGSUNG BERBAHAYA MESKI "BEKERJA"
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Lapisan adaptor memikul EMPAT hal yang tak satu pun terlihat di titik
 * panggilan:
 *
 *   TIMEOUT     TJS tak punya sama sekali — bawaan SDK 10 menit, dikali 16
 *               ronde tool-calling = satu permintaan menggantung 160 menit
 *   isError     C-6: adaptor selain Anthropic menelannya, jadi model tak
 *               pernah tahu tool-nya gagal dan melanjutkan seolah berhasil
 *   ALASAN      kegagalan datang sebagai union yang bisa dibedakan, bukan
 *               galat yang harus dicocokkan teksnya
 *   ARGUMEN     penyedia gaya OpenAI mengirim argumen tool sebagai STRING
 *               JSON; melewatkannya berarti `args.qty` bernilai undefined
 *               tanpa galat apa pun
 *
 * Pemanggilan SDK langsung melewati keempatnya SEKALIGUS — dan tetap bekerja,
 * sampai penyedianya lambat atau tool-nya gagal. Itulah sebabnya ini butuh
 * penjaga, bukan sekadar konvensi: jalur pintasnya tidak pernah terasa salah
 * saat ditulis.
 *
 * ── Yang diperiksa
 *
 *   L-6a  impor SDK penyedia hanya di lapisan adaptor
 *   L-6b  `messages.create(` / `messages.stream(` hanya di lapisan adaptor
 *   L-6c  fetch ke host penyedia (api.anthropic.com, openai.com, dst) hanya
 *         di lapisan adaptor — menghindari SDK lalu memanggil HTTP mentah
 *         melewati penjaga yang hanya melihat impor
 *
 * Ambang NOL.
 *
 * Pakai:  node apps/api/scripts/audit-satu-jalan-ke-model.mjs
 */
import { readFileSync, readdirSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const SRC = resolve(__dirname, '..', 'src')

/** Satu-satunya berkas yang boleh menyentuh SDK/HTTP penyedia. */
const LAPISAN = new Set([
  'lib/ai-penyedia.ts',
  'lib/ai-penyedia-anthropic.ts',
  'lib/ai-penyedia-openai.ts',
  'lib/ai-adaptor.ts',
])

/** Paket SDK penyedia model. */
const SDK = [
  '@anthropic-ai/sdk',
  'openai',
  '@google/generative-ai',
  '@mistralai/mistralai',
  'cohere-ai',
]

/**
 * Endpoint INFERENSI penyedia — menangkap `fetch` mentah yang melewati SDK.
 *
 * Yang dicocokkan endpoint-nya, BUKAN host-nya. Versi pertama penjaga ini
 * mencocokkan host saja dan langsung menuduh `routes/v1/kredensial.ts`, yang
 * memanggil `api.anthropic.com/v1/models` untuk menguji apakah sebuah kunci
 * masih sah. Panggilan itu tak melewati satu pun yang L-6 jaga: tak ada tool,
 * tak ada `isError`, tak ada token yang ditagih — ia membaca daftar.
 *
 * Mengecualikan BERKASNYA akan salah: berkas yang sama kelak bisa memanggil
 * inferensi sungguhan dan penjaga ini akan diam. Yang dipersempit polanya.
 */
const ENDPOINT_INFERENSI = [
  'api.anthropic.com/v1/messages',
  'api.openai.com/v1/chat',
  'api.openai.com/v1/responses',
  'generativelanguage.googleapis.com/v1beta/models',
  'api.mistral.ai/v1/chat',
  'api.groq.com/openai/v1/chat',
  'openrouter.ai/api/v1/chat',
]

for (const rel of LAPISAN) {
  if (!existsSync(join(SRC, rel))) {
    console.error(`✗ Berkas lapisan tak ada: ${rel}`)
    console.error('  Kalau dipindah/di-rename, perbarui LAPISAN di penjaga ini —')
    console.error('  daftar yang menunjuk berkas hilang membuat penjaga ini diam-diam melar.')
    process.exit(1)
  }
}

function berkasTs(dir) {
  const hasil = []
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name)
    if (e.isDirectory()) hasil.push(...berkasTs(p))
    else if (e.name.endsWith('.ts')) hasil.push(p)
  }
  return hasil
}

/** Buang komentar TANPA mengubah jumlah baris. */
function tanpaKomentar(src) {
  let dalamBlok = false
  return src.split('\n').map((b) => {
    const t = b.trim()
    if (dalamBlok) {
      if (t.includes('*/')) dalamBlok = false
      return ''
    }
    if (t.startsWith('/*')) {
      if (!t.includes('*/')) dalamBlok = true
      return ''
    }
    if (t.startsWith('//') || t.startsWith('*')) return ''
    return b
  }).join('\n')
}

const temuan = []
const berkas = berkasTs(SRC)

for (const path of berkas) {
  const rel = path.slice(SRC.length + 1).replace(/\\/g, '/')
  if (LAPISAN.has(rel)) continue
  // Test BOLEH mengimpor SDK — mis. untuk menyusun tipe balasan tiruan.
  if (rel.includes('__tests__') || rel.endsWith('.test.ts') || rel.includes('test-utils')) continue

  const src = tanpaKomentar(readFileSync(path, 'utf8'))
  src.split('\n').forEach((isi, i) => {
    for (const paket of SDK) {
      // Impor statis maupun dinamis.
      if (new RegExp(`(from|import\\(|require\\()\\s*['"\`]${paket.replace(/[/@.-]/g, '\\$&')}['"\`]`).test(isi)) {
        temuan.push({ aturan: 'L-6a', berkas: rel, baris: i + 1, pesan: `mengimpor SDK '${paket}'` })
      }
    }
    if (/\bmessages\s*\.\s*(create|stream)\s*\(/.test(isi)) {
      temuan.push({ aturan: 'L-6b', berkas: rel, baris: i + 1, pesan: 'memanggil messages.create/stream langsung' })
    }
    for (const host of ENDPOINT_INFERENSI) {
      if (isi.includes(host)) {
        temuan.push({ aturan: 'L-6c', berkas: rel, baris: i + 1, pesan: `menyebut host penyedia '${host}'` })
      }
    }
  })
}

console.log('══ Satu jalan ke model (L-6) ═══════════════════════════════')
console.log(`  berkas dipindai : ${berkas.length}`)
console.log(`  lapisan sah     : ${[...LAPISAN].join(', ')}`)
console.log(`  pelanggaran     : ${temuan.length}`)
console.log('  ambang          : 0 (bukan ratchet)\n')

if (temuan.length > 0) {
  for (const t of temuan) console.error(`   [${t.aturan}] ${t.berkas}:${t.baris}  ${t.pesan}`)
  console.error(`
   Memanggil SDK langsung melewati TIMEOUT, isError (C-6), pemetaan alasan
   gagal, dan normalisasi argumen tool — keempatnya sekaligus. Jalur pintas itu
   tetap bekerja sampai penyedianya lambat atau tool-nya gagal, jadi ia tak
   pernah terasa salah saat ditulis.

   Pola yang sah:
     const dibuat = buatAdaptor({ penyedia, apiKey, baseUrl })
     if (!dibuat.ok) return ...jalur tanpa AI...
     const jawab = await dibuat.adaptor.chat({ model, maxToken, pesan })
     if (!jawab.ok) return ...alasan: jawab.alasan...
`)
  process.exit(1)
}

console.log('✓ SDK penyedia hanya disentuh lapisan adaptor.')
