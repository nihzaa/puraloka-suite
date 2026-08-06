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
  // Presedens: env eksplisit > .env lokal. Di CI tak ada file .env sama sekali
  // (kredensial datang dari secrets), jadi membaca file duluan = crash ENOENT.
  if (process.env.FP_URL) return process.env.FP_URL
  if (process.env.DIRECT_URL) return process.env.DIRECT_URL
  try {
    const txt = readFileSync(resolve(__dirname, '..', '.env'), 'utf8')
    const m = txt.match(/^DIRECT_URL\s*=\s*(.+)$/m)
    if (m) return m[1].trim().replace(/^["']|["']$/g, '')
  } catch { /* tak ada .env — jatuh ke pesan di bawah */ }
  throw new Error(
    'Tidak ada koneksi DB: set FP_URL atau DIRECT_URL, atau sediakan apps/api/.env.'
  )
}

/**
 * Jalur FK terkuat (seluruhnya NOT NULL) menuju sebuah AKAR tenancy.
 *
 * Akar = `projects` (ANCHOR) ATAU tabel mana pun berkategori B — yakni yang
 * `company_id`-nya NOT NULL.
 *
 * ⚠️ Sampai 2026-08-01 fungsi ini HANYA melacak `projects`, dan itu celah
 * senyap: tabel anak dari tabel B (yang tak punya rantai ke `projects`) jatuh
 * ke kategori **A — katalog bersama, TANPA scope sama sekali**. Ketahuan saat
 * `asset_movements` & `asset_depreciation_logs` lahir: keduanya milik satu
 * perusahaan lewat `assets.company_id`, tapi digolongkan A sehingga wrapper
 * tak menyaring apa pun.
 *
 * Ini bukan cacat khusus aset — tabel B mana pun yang punya anak akan kena.
 * Diperbaiki di akar, bukan dengan mengecualikan empat tabel.
 *
 * Mengembalikan `{ path, akar }`; `akar` menentukan cara wrapper men-scope:
 * lewat project, atau lewat induk ber-`company_id`.
 */
function jalurKuatKeAkar(tabel, fkByTable, kolomCompany) {
  const adalahAkarB = (t) => kolomCompany[t] === 'NO'
  const seen = new Set([tabel])
  const antre = [{ t: tabel, path: [] }]
  // Kandidat lewat induk-B ditampung dulu, TIDAK langsung dikembalikan.
  // `projects` selalu menang bila ada — bukan karena lebih benar secara teori,
  // melainkan karena mengubah jalur scope tabel yang SUDAH dipakai adalah
  // perubahan perilaku diam-diam. `worker_kasbons` punya DUA jalur sah
  // (project_id NOT NULL dan worker_id → workers.company_id NOT NULL);
  // memilih yang kedua akan mengubah cara query lama disaring tanpa satu pun
  // test menyatakannya. Prioritas ini menjaga peta lama tetap identik.
  let lewatIndukB = null
  while (antre.length) {
    const cur = antre.shift()
    for (const fk of fkByTable[cur.t] ?? []) {
      if (fk.nullable !== 'NO') continue // jalur lemah tak dihitung — lihat audit T1 §4
      const path = [...cur.path, `${fk.src}.${fk.col}`]
      if (fk.tgt === 'projects') return { path, akar: 'projects' }
      if (adalahAkarB(fk.tgt)) {
        if (!lewatIndukB) lewatIndukB = { path, akar: fk.tgt }
        continue // jangan telusuri lebih dalam lewat akar
      }
      if (!seen.has(fk.tgt) && fk.tgt !== fk.src) {
        seen.add(fk.tgt)
        antre.push({ t: fk.tgt, path })
      }
    }
  }
  return lewatIndukB
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

    // ── FK dibaca dari `pg_catalog`, BUKAN `information_schema` ────────────
    //
    // Versi lama menggabung EMPAT view `information_schema`
    // (table_constraints + key_column_usage + constraint_column_usage +
    // columns). View-view itu sendiri adalah kueri berat di atas katalog, dan
    // gabungannya tumbuh sangat cepat seiring jumlah tabel.
    //
    // Diukur 2026-08-06 pada 134 tabel / 415 FK:
    //
    //   3-join information_schema   6.505 ms
    //   4-join (yang dipakai di sini)  TAK PERNAH SELESAI — melewati
    //                                  statement_timeout 90 detik
    //   pg_catalog (di bawah)          50 ms   ← 130× lebih cepat
    //
    // Akibatnya penjaga ini menggantung tanpa satu pun pesan: `gen-tenant-map
    // check` di CI akan mati kena timeout job, dan kelihatannya seperti
    // masalah jaringan. Ia sempat berhasil beberapa kali di awal sesi lalu
    // berhenti sama sekali — degradasi bertahap, bukan kegagalan yang jelas.
    //
    // Hasil keduanya DIBUKTIKAN IDENTIK sebelum ditukar: 415 baris sama
    // persis, nol beda pada `nullable`. Penjaga yang dipercepat tapi hasilnya
    // berubah lebih buruk daripada penjaga yang lambat — ia akan
    // mengklasifikasikan tabel secara berbeda tanpa ada yang menyatakannya.
    //
    // `unnest(conkey)` menggantikan `key_column_usage`: satu FK bisa memuat
    // beberapa kolom, dan tiap kolomnya jadi satu baris — sama seperti view
    // lama.
    //
    // ── `ORDER BY` BUKAN kosmetik ──────────────────────────────────────────
    //
    // Tabel yang punya DUA jalur FK sama-sama sah (mis. `expense_items` lewat
    // `category_id` ATAU `expense_report_id`, keduanya NOT NULL) akan
    // diklasifikasikan menurut FK mana yang lebih dulu ditemui. Tanpa urutan
    // yang pasti, Postgres bebas mengembalikannya dalam urutan berbeda tiap
    // kali — dan peta ini ikut berubah TANPA satu pun perubahan skema.
    //
    // Terjadi dua kali di sesi 2026-08-06: empat tabel berpindah `lewat`
    // bolak-balik. Nol kode memakainya, jadi tak ada perilaku yang rusak —
    // tapi `gen-tenant-map check` di CI akan merah tanpa sebab yang bisa
    // dijelaskan siapa pun, dan penjaga yang merah tanpa sebab adalah penjaga
    // yang akan dimatikan orang.
    const fks = (await c.query(
      `SELECT src.relname AS src,
              a.attname   AS col,
              tgt.relname AS tgt,
              CASE WHEN a.attnotnull THEN 'NO' ELSE 'YES' END AS nullable
         FROM pg_constraint co
         JOIN pg_class src   ON src.oid = co.conrelid
         JOIN pg_class tgt   ON tgt.oid = co.confrelid
         JOIN pg_namespace n ON n.oid = src.relnamespace AND n.nspname = 'public'
         JOIN LATERAL unnest(co.conkey) AS k(attnum) ON true
         JOIN pg_attribute a ON a.attrelid = co.conrelid AND a.attnum = k.attnum
        WHERE co.contype = 'f'
        ORDER BY src.relname, a.attname, tgt.relname`
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

      const jalur = jalurKuatKeAkar(t, fkByTable, kolomCompany)
      if (jalur) {
        peta[t] = {
          kategori: 'C',
          lewat: jalur.path[0].split('.')[1],
          jalur: jalur.path.join(' → '),
          // Akar menentukan CARA scope: lewat project, atau lewat induk
          // ber-company_id. Dicatat supaya wrapper & pembaca peta tak menebak.
          akar: jalur.akar,
        }
      } else { peta[t] = { kategori: 'A' } }
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
