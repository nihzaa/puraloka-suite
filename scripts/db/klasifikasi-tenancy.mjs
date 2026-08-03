#!/usr/bin/env node
// ============================================================================
// F2-2 — KLASIFIKASI TENANCY: menerapkan aturan ADR-011 §5 ke tabel NYATA.
//
//   node scripts/db/klasifikasi-tenancy.mjs [--json] [--md]
//
// ══════════════════════════════════════════════════════════════════════════
// APA YANG ALAT INI LAKUKAN — DAN APA YANG TIDAK
// ══════════════════════════════════════════════════════════════════════════
//
// ADR-011 §5 memberi ATURAN, bukan daftar. Alat ini menerapkan aturan itu ke
// keadaan database yang sebenarnya, lalu melaporkan hasilnya per tabel.
//
// Yang membuatnya perlu ditulis sebagai program, bukan dikerjakan dengan mata:
//
//   Syarat kategori C adalah "ada rantai FK NOT NULL ke tabel kategori B".
//   Menelusurinya dengan mata untuk 80 tabel berarti membaca ratusan
//   constraint dan mengingat mana yang nullable. ADR-011 sendiri
//   memperingatkan agar ini "wajib diaudit satu-per-satu (bukan
//   diasumsikan)" — dan memberi contoh nyata: kasbons.work_scope_id dibuat
//   OPTIONAL oleh migrasi 056, jadi rantainya harus lewat project_id.
//
//   Satu salah baca = satu tabel yang kelak tak punya jalur tenancy sama
//   sekali. Kebocorannya tak menimbulkan galat; ia hanya membuat baris milik
//   satu tenant terlihat oleh tenant lain.
//
// ── Yang alat ini TIDAK lakukan
//
//   • TIDAK memutuskan apa pun sendiri. Kategori A dan A/B datang dari daftar
//     eksplisit di ADR-011; alat hanya mencocokkan.
//   • TIDAK menulis ke database. Nol DDL, nol DML.
//   • TIDAK menggantikan penilaian manusia. Keluarannya adalah TABEL KEPUTUSAN
//     yang harus dibaca orang sebelum migrasi ditulis — itu bunyi kriteria
//     F2-2 apa adanya.
//
// Tabel yang alat ini tandai `PERLU-MATA-MANUSIA` adalah yang aturannya tidak
// memberi jawaban tunggal. Itu bukan kegagalan alat; itu justru gunanya.
// ============================================================================

import { buatClient, pastikanCwdRootRepo } from './_koneksi.mjs'

pastikanCwdRootRepo()

// ── Daftar dari ADR-011 §5 — DISALIN, bukan ditebak ─────────────────────────
//
// Sengaja ditulis ulang di sini alih-alih di-parse dari berkas ADR: mengubah
// klasifikasi harus jadi tindakan SADAR yang terlihat di diff, bukan efek
// samping dari seseorang menyunting kalimat di dokumen.
const A_SHARED = new Set([
  'units', 'work_categories', 'permissions', 'modules', 'ahsp_editions',
  'cost_codes', 'resources', 'steel_profiles', 'material_pack',
  'formula_definitions', 'productivity_records',
])

const AB_OVERLAY = new Set([
  'assemblies', 'price_book_entries', 'cbs_templates', 'feature_flags',
])

// Kategori D — kasus khusus, masing-masing dengan alasannya sendiri.
const D_KHUSUS = new Map([
  ['audit_logs', 'append-only (073): backfill melanggar. company_id NULLABLE, isi baris baru saja.'],
  ['notifications', 'NOT NULL — notifikasi selalu TENTANG sesuatu di satu company'],
  ['users', 'global (D5) — TANPA company_id'],
  ['lessons_learned_records', 'B — berbagi antar tenant = fitur produk butuh consent, bukan default'],
])

// Akar tenancy: tabel yang MEMBAWA company_id dan jadi ujung rantai FK.
const AKAR = new Set(['companies'])

const c = buatClient()
await c.connect()

// ── Fakta dari database ─────────────────────────────────────────────────────
const { rows: tabel } = await c.query(`
  SELECT c.relname AS nama,
         EXISTS (SELECT 1 FROM information_schema.columns col
                  WHERE col.table_schema='public' AND col.table_name=c.relname
                    AND col.column_name='company_id') AS punya_company_id,
         (SELECT is_nullable FROM information_schema.columns col
           WHERE col.table_schema='public' AND col.table_name=c.relname
             AND col.column_name='company_id') AS company_id_nullable,
         c.reltuples::bigint AS perkiraan_baris
    FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
   WHERE n.nspname='public' AND c.relkind='r'
   ORDER BY 1`)

// Seluruh FK: anak → induk, beserta apakah SELURUH kolomnya NOT NULL.
const { rows: fk } = await c.query(`
  SELECT src.relname AS anak, tgt.relname AS induk, con.conname,
         bool_and(att.attnotnull) AS semua_not_null
    FROM pg_constraint con
    JOIN pg_class src ON src.oid = con.conrelid
    JOIN pg_class tgt ON tgt.oid = con.confrelid
    JOIN pg_namespace n ON n.oid = src.relnamespace
    JOIN unnest(con.conkey) AS k(attnum) ON true
    JOIN pg_attribute att ON att.attrelid = con.conrelid AND att.attnum = k.attnum
   WHERE con.contype='f' AND n.nspname='public'
   GROUP BY 1,2,3`)

await c.end()

const punyaCid = new Map(tabel.map((t) => [t.nama, t.punya_company_id]))
const fkKeluar = new Map()
for (const f of fk) {
  if (!fkKeluar.has(f.anak)) fkKeluar.set(f.anak, [])
  fkKeluar.get(f.anak).push(f)
}

/**
 * Telusuri rantai FK NOT NULL menuju tabel yang punya `company_id`.
 *
 * Mengembalikan jalur terpendek, atau null bila tak ada. Hanya melewati FK
 * yang SELURUH kolomnya NOT NULL — itulah syarat mutlak kategori C. FK
 * nullable memutus rantai: baris anak bisa hidup tanpa induk, dan tanpa induk
 * ia tak punya tenant.
 *
 * BFS, bukan DFS: jalur terpendek lebih mudah diverifikasi manusia, dan
 * kedalaman dibatasi supaya siklus FK (nyata di skema ini) tak menggantung.
 */
/**
 * ⚠️ Tabel yang company_id-nya BUKAN bukti tenancy.
 *
 * Ditemukan saat memverifikasi keluaran pertama alat ini, dan ia adalah
 * jebakan yang halus: empat tabel kategori A ternyata MEMBAWA `company_id`
 * (`cost_codes`, `material_pack`, `modules`, `productivity_records`).
 *
 * Rantai yang berakhir di sana terlihat sah — "ada FK NOT NULL menuju tabel
 * ber-company_id" — padahal tabel itu SHARED. `estimate_items → cost_codes`
 * sempat diklasifikasi C karena ini, dan hasilnya akan jadi tabel yang
 * dianggap punya tenancy padahal tidak.
 *
 * `users` lebih tegas lagi: ADR-011 D5 menyatakannya global. Rantai
 * `work_scope_items → users → roles` sempat lolos sebagai "sehat", padahal
 * tenant sebuah item pekerjaan jelas bukan ditentukan oleh peran pembuatnya.
 *
 * Menghitung "ada company_id" saja tak cukup — yang menentukan adalah apakah
 * kolom itu MENYATAKAN kepemilikan tenant baris tersebut.
 */
const BUKAN_JANGKAR = new Set([...A_SHARED, ...AB_OVERLAY, 'users'])

function jalurTenancy(mulai) {
  const antre = [[mulai, []]]
  const dilihat = new Set([mulai])
  while (antre.length) {
    const [kini, jalur] = antre.shift()
    if (jalur.length > 6) continue
    for (const f of fkKeluar.get(kini) ?? []) {
      if (!f.semua_not_null) continue          // FK nullable → rantai putus
      const baru = [...jalur, `${kini}.→${f.induk}`]
      // Jangkar sah HANYA bila induknya benar-benar tenant-owned.
      const jangkarSah = (punyaCid.get(f.induk) || AKAR.has(f.induk))
                         && !BUKAN_JANGKAR.has(f.induk)
      if (jangkarSah) return baru

      // ⚠️ `users` GLOBAL — rantai tak boleh LEWAT sana, bukan cuma tak boleh
      // berhenti di sana.
      //
      // Perbaikan pertama saya hanya melarang `users` jadi UJUNG. Rantai
      // `permission_scopes → users → roles` tetap lolos: ia menembus users
      // lalu berhenti di `roles` yang ber-company_id. Hasilnya enam tabel
      // diklasifikasi C tanpa punya tenancy sama sekali — termasuk
      // `borongan_settlements` dan `progress_payments` yang menyangkut uang.
      //
      // Satu orang bisa jadi anggota beberapa company (ADR-011 D5). Tenant
      // sebuah baris karenanya TIDAK BISA disimpulkan dari siapa pembuatnya:
      // `created_by → users` tak memberi tahu company mana yang memilikinya.
      //
      // Tabel A/B masih boleh dilewati — baris NULL-nya milik semua, dan
      // baris ber-company_id-nya tetap membawa tenant.
      if (f.induk === 'users') continue

      // Tetap ditelusuri LEWAT tabel shared lain — rantai bisa berlanjut ke
      // tabel tenant-owned di baliknya. Yang ditolak adalah BERHENTI di sana.
      if (!dilihat.has(f.induk)) { dilihat.add(f.induk); antre.push([f.induk, baru]) }
    }
  }
  return null
}

// ── Terapkan aturan; kategori pertama yang cocok menang (ADR-011 §5) ────────
const hasil = []
for (const t of tabel) {
  const n = t.nama
  let kat, alasan

  if (D_KHUSUS.has(n)) {
    kat = 'D'; alasan = D_KHUSUS.get(n)
  } else if (A_SHARED.has(n)) {
    kat = 'A'; alasan = 'standar publik/invariant sistem — salah bila beda antar tenant'
  } else if (AB_OVERLAY.has(n)) {
    kat = 'A/B'; alasan = 'baris standar (NULL) + baris milik tenant hidup berdampingan'
  } else if (AKAR.has(n)) {
    kat = 'AKAR'; alasan = 'tabel tenant itu sendiri'
  } else if (t.punya_company_id) {
    kat = 'B ✓'; alasan = `sudah punya company_id (${t.company_id_nullable === 'YES' ? 'nullable' : 'NOT NULL'})`
  } else {
    const jalur = jalurTenancy(n)
    if (jalur) {
      kat = 'C'; alasan = `rantai FK NOT NULL: ${jalur.join(' ')}`
    } else {
      // Tak punya company_id DAN tak punya rantai NOT NULL. Inilah tabel yang
      // benar-benar perlu keputusan manusia — dan yang paling berbahaya bila
      // dilewatkan, karena ia tak punya jalur tenancy sama sekali.
      kat = 'B?'
      const adaFkNullable = (fkKeluar.get(n) ?? []).some((f) => !f.semua_not_null)
      alasan = adaFkNullable
        ? 'PERLU-MATA-MANUSIA: punya FK tapi NULLABLE — rantai putus, kandidat C naik ke B'
        : 'PERLU-MATA-MANUSIA: nol rantai FK ke tabel ber-company_id'
    }
  }
  hasil.push({ tabel: n, kategori: kat, baris: Number(t.perkiraan_baris), alasan })
}

// ── Keluaran ────────────────────────────────────────────────────────────────
const argv = process.argv.slice(2)
if (argv.includes('--json')) {
  console.log(JSON.stringify(hasil, null, 2))
} else if (argv.includes('--md')) {
  console.log('| Tabel | Kategori | Alasan |')
  console.log('|---|---|---|')
  for (const h of hasil) console.log(`| \`${h.tabel}\` | ${h.kategori} | ${h.alasan} |`)
} else {
  const per = {}
  for (const h of hasil) (per[h.kategori] ??= []).push(h)
  const urut = ['AKAR', 'A', 'A/B', 'B ✓', 'C', 'B?', 'D']
  for (const k of urut) {
    if (!per[k]) continue
    console.log(`\n══ ${k} — ${per[k].length} tabel ${'═'.repeat(Math.max(0, 44 - k.length))}`)
    for (const h of per[k]) {
      console.log(`  ${h.tabel.padEnd(34)} ${h.alasan.slice(0, 76)}`)
    }
  }
  console.log(`\n${'─'.repeat(64)}`)
  console.log(`  total ${hasil.length} tabel`)
  const perlu = per['B?']?.length ?? 0
  console.log(perlu
    ? `  ⚠️  ${perlu} tabel PERLU KEPUTUSAN MANUSIA sebelum migrasi ditulis`
    : '  ✅ tiap tabel punya jalur tenancy yang jelas')
}
