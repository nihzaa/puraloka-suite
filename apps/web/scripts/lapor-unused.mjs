// Melaporkan warning eslint per berkas, dengan nomor baris.
// Dipakai saat membersihkan sisa setelah modul dipecah.
//
// Pakai:
//   node scripts/lapor-unused.mjs                     # no-unused-vars
//   node scripts/lapor-unused.mjs set-state-in-effect # aturan lain
//   ... --detail                                      # sertakan baris
import { execSync } from 'node:child_process'

const ATURAN = process.argv.slice(2).find((a) => !a.startsWith('--')) ?? 'no-unused-vars'

const out = execSync('npx eslint . -f json', { maxBuffer: 128 * 1024 * 1024, encoding: 'utf8' })
const per = new Map()
for (const f of JSON.parse(out)) {
  for (const m of f.messages) {
    if (!m.ruleId?.includes(ATURAN)) continue
    const k = f.filePath.replace(/.*[\\/]web[\\/]/, '').replace(/\\/g, '/')
    if (!per.has(k)) per.set(k, [])
    per.get(k).push(`${m.line}: ${m.message.replace(/ is (defined|assigned).*/, '')}`)
  }
}
for (const [k, v] of [...per].sort((a, b) => b[1].length - a[1].length)) {
  console.log(`\n${k}  (${v.length})`)
  if (process.argv.includes('--detail')) for (const x of v) console.log('   ' + x)
}
