#!/usr/bin/env node
// ============================================================
// GENERATOR PETA TENANCY — sumber kebenaran: SKEMA, bukan ketikan tangan.
//
// Menghasilkan `src/utils/tenant-map.generated.ts`: peta tabel → kategori
// tenancy (A / AB / B / C / D) yang dipakai wrapper `tenant-db.ts` untuk
// men-scope query secara OTOMATIS.
//
// KENAPA DI-GENERATE (ADR-011 §6 #1 + P3 §9.5):
//   Peta yang diketik tangan pasti basi begitu ada tabel baru — dan tabel baru
//   yang lupa diklasifikasi = lubang tenancy yang tak terlihat. Dengan
//   di-generate + dibandingkan CI, tabel ke-95 yang lahir tanpa klasifikasi
//   membuat build MERAH, bukan diam-diam lolos.
//
// CARA MENENTUKAN KATEGORI (mekanis, bukan selera):
//   B  = punya kolom company_id NOT NULL          → di-scope `eq('company_id', X)`
//   AB = punya kolom company_id NULLABLE          → `or(company_id.is.null, eq)`
//   C  = TIDAK punya company_id TAPI punya rantai FK NOT NULL ke `projects`
//        → di-scope lewat project (wrapper menolak query tanpa project_id)
//   A  = tidak punya keduanya, dan bukan D        → katalog bersama, tanpa scope
//   D  = daftar eksplisit di bawah (identitas & platform)
//
// PEMAKAIAN:
//   node gen-tenant-map.mjs emit      → tulis ulang tenant-map.generated.ts
//   node gen-tenant-map.mjs check     → exit 1 kalau file di repo != hasil generate
//                                       (dipakai CI: penegak P3)
//
// SUMBER KONEKSI: env FP_URL, atau DIRECT_URL dari apps/api/.env.
// ============================================================
import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import pg from 'pg'

const __dirname = dirname(fileURLToPath(import.meta.url))
const OUT = resolve(__dirname, '..', 'src', 'utils', 'tenant-map.generated.ts')

// Kategori D — identitas & platform. Tidak dapat diturunkan dari bentuk skema
// karena alasannya SEMANTIK, bukan struktural. Sengaja daftar eksplisit +
// alasan, supaya penambahan di sini terlihat jelas di code review.
const KATEGORI_D = {
  users: 'Identitas lintas-tenant. Satu orang bisa jadi anggota >1 company dengan peran berbeda — keanggotaan hidup di company_members (ADR-011 D6), bukan di users.',
  company_members: 'Tabel keanggotaan itu sendiri. Di-scope manual per kasus.',
  companies: 'Tabel tenant itu sendiri.',
  company_profile: 'Deprecated — digantikan companies (dibuang setelah T4).',
  document_number_series: 'Counter penomoran per company; di-scope eksplisit oleh pemakainya.',
  audit_logs: 'Punya company_id NOT NULL tapi ditulis langsung (tak pernah lewat join) supaya trail tetap terbaca meski baris induk hilang. Append-only (073).',
}

function loadUrl() {
  if (process.env.FP_URL) return process.env.FP_URL
  const txt = readFileSync(resolve(__dirname, '..', '.env'), 'utf8')
  return txt.match(/^DIRECT_URL\s*=\s*(.+)$/m)[1].trim().replace(/^["']|["']$/g, '')
}

/** Jalur FK terkuat (seluruhnya NOT NULL) menuju `projects`. Null bila tak ada. */
function jalurKuatKeProjects(tabel, fkByTable) {
  const seen = new Set([tabel])
  const antre = [{ t: tabel, path: [] }]
  while (antre.length) {
    const cur = antre.shift()
    for (const fk of fkByTable[cur.t] ?? []) {
      if (fk.nullable !== 'NO') continue // jalur lemah tak dihitung — lihat audit T1 §4
      if (fk.tgt === 'projects') return [...cur.path, `${fk.src}.${fk.col}`]
      if (!seen.has(fk.tgt) && fk.tgt !== fk.src) {
        seen.add(fk.tgt)
        antre.push({ t: fk.tgt, path: [...cur.path, `${fk.src}.${fk.col}`] })
      }
    }
  }
  return null
}

async function bangunPeta() {
  const c = new pg.Client({ connectionString: loadUrl() })
  await c.connect()
  try {
    const tables = (await c.query(
      `SELECT table_name FROM information_schema.tables
       WHERE table_schema='public' AND table_type='BASE TABLE' ORDER BY 1`
    )).rows.map((r) => r.table_name)

    const kolomCompany = Object.fromEntries((await c.query(
      `SELECT table_name, is_nullable FROM information_schema.columns
       WHERE table_schema='public' AND column_name='company_id'`
    )).rows.map((r) => [r.table_name, r.is_nullable]))

    const fks = (await c.query(
      `SELECT tc.table_name AS src, kcu.column_name AS col, ccu.table_name AS tgt,
              col.is_nullable AS nullable
       FROM information_schema.table_constraints tc
       JOIN information_schema.key_column_usage kcu
         ON kcu.constraint_name=tc.constraint_name AND kcu.table_schema='public'
       JOIN information_schema.constraint_column_usage ccu
         ON ccu.constraint_name=tc.constraint_name AND ccu.table_schema='public'
       JOIN information_schema.columns col
         ON col.table_schema='public' AND col.table_name=tc.table_name
        AND col.column_name=kcu.column_name
       WHERE tc.constraint_type='FOREIGN KEY' AND tc.table_schema='public'`
    )).rows
    const fkByTable = {}
    for (const f of fks) (fkByTable[f.src] ??= []).push(f)

    const peta = {}
    for (const t of tables) {
      if (t === 'projects') { peta[t] = { kategori: 'ANCHOR' }; continue }
      if (KATEGORI_D[t]) { peta[t] = { kategori: 'D', catatan: KATEGORI_D[t] }; continue }

      const nullability = kolomCompany[t]
      if (nullability === 'NO') { peta[t] = { kategori: 'B' }; continue }
      if (nullability === 'YES') { peta[t] = { kategori: 'AB' }; continue }

      const jalur = jalurKuatKeProjects(t, fkByTable)
      if (jalur) { peta[t] = { kategori: 'C', lewat: jalur[0].split('.')[1], jalur: jalur.join(' → ') } }
      else { peta[t] = { kategori: 'A' } }
    }
    return peta
  } finally {
    await c.end()
  }
}

function render(peta) {
  const hitung = {}
  for (const v of Object.values(peta)) hitung[v.kategori] = (hitung[v.kategori] ?? 0) + 1
  const ringkas = Object.entries(hitung).sort().map(([k, n]) => `${k}=${n}`).join(' · ')

  const baris = Object.entries(peta).sort(([a], [b]) => a.localeCompare(b)).map(([t, v]) => {
    const ekstra = v.lewat ? `, lewat: '${v.lewat}'` : ''
    const komentar = v.jalur ? `  // ${v.jalur}` : (v.catatan ? `  // ${v.catatan}` : '')
    return `  '${t}': { kategori: '${v.kategori}'${ekstra} },${komentar}`
  }).join('\n')

  return `// ============================================================
// FILE INI DI-GENERATE — JANGAN DIEDIT TANGAN.
// Sumber: skema database. Regenerate: \`node scripts/gen-tenant-map.mjs emit\`
// Penegak: \`node scripts/gen-tenant-map.mjs check\` (CI) — build MERAH kalau
// ada tabel yang belum terklasifikasi (ADR-011 §9.5 P3).
//
// ${Object.keys(peta).length} tabel · ${ringkas}
//
// Arti kategori (ADR-011 §5 + audit T1):
//   ANCHOR akar tenancy (projects) — company_id NOT NULL
//   B      milik tenant, company_id NOT NULL      → scope: eq(company_id)
//   AB     katalog bersama + boleh ditimpa tenant → scope: company_id NULL OR eq
//   C      mewarisi lewat rantai FK NOT NULL ke projects → scope lewat project
//   A      katalog/kosakata bersama semua tenant  → TANPA scope
//   D      identitas & platform, ditangani per kasus
// ============================================================

export type KategoriTenancy = 'ANCHOR' | 'A' | 'AB' | 'B' | 'C' | 'D'

export interface EntriTenancy {
  kategori: KategoriTenancy
  /** Untuk kategori C: kolom FK yang menuju induknya. */
  lewat?: string
}

export const PETA_TENANCY = {
${baris}
} as const satisfies Record<string, EntriTenancy>

export type TabelTerklasifikasi = keyof typeof PETA_TENANCY
`
}

const mode = process.argv[2] ?? 'emit'
const peta = await bangunPeta()
const isi = render(peta)

if (mode === 'check') {
  let existing = ''
  try { existing = readFileSync(OUT, 'utf8') } catch { /* belum ada */ }
  const norm = (s) => s.replace(/\r\n/g, '\n').trim()
  if (norm(existing) !== norm(isi)) {
    console.error('PETA TENANCY BASI — skema berubah tapi tenant-map.generated.ts belum di-regenerate.')
    console.error('Jalankan: node scripts/gen-tenant-map.mjs emit  lalu commit hasilnya.')
    console.error('')
    console.error('Kalau ini karena TABEL BARU: klasifikasikan dulu kategorinya (ADR-011 §5).')
    console.error('Tabel baru TIDAK BOLEH lahir tanpa kategori tenancy — itulah gunanya cek ini.')
    process.exit(1)
  }
  console.log(`peta tenancy: SINKRON (${Object.keys(peta).length} tabel)`)
} else {
  writeFileSync(OUT, isi, 'utf8')
  console.log(`ditulis: ${OUT}`)
  console.log(`${Object.keys(peta).length} tabel terklasifikasi`)
}
