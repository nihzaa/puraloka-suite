#!/usr/bin/env node
/**
 * PENJAGA — migrasi yang memaku id perusahaan WAJIB bergerbang.
 *
 * ── Cacat yang dijaga
 *
 * `237_seed_lapangan_dummy.sql` memaku id perusahaan basis DEV sebagai literal:
 *
 *     '48befb54-113d-4e1b-b4dd-91cf79d6d8a0'::uuid
 *
 * Di basis dev itu benar. Di basis CI — yang dimulai kosong — baris perusahaan
 * itu tak pernah ada, jadi FK-nya menolak:
 *
 *     HARD FAIL — 237_seed_lapangan_dummy.sql
 *       insert or update on table "workers"
 *       violates foreign key constraint "workers_company_id_fkey"
 *
 * Dan karena tiap migrasi dibungkus transaksi, satu seed dummy MENGHENTIKAN
 * SELURUH rantai migrasi di belakangnya. Enam shard test merah selama
 * berhari-hari karena data hiasan dashboard.
 *
 * ── Kenapa gerbang, bukan allowlist
 *
 * Memasukkannya ke `SKIP_ALLOWLIST` memperbaiki CI, dan HANYA CI. Setiap
 * lingkungan baru — VPS, mesin developer baru, tenant baru — menabrak
 * kegagalan yang sama, dan di sana tak ada allowlist yang menolong.
 *
 * Gerbangnya satu baris:
 *
 *     IF NOT EXISTS (SELECT 1 FROM companies WHERE id = '<id>'::uuid) THEN
 *       RAISE NOTICE '...'; RETURN;
 *     END IF;
 *
 * ⚠ Dan gerbangnya wajib ada di SETIAP blok yang menyentuh data itu, termasuk
 * blok VERIFIKASI di ujung berkas. Diukur 2026-08-31: gerbang dipasang di blok
 * seed, no-op berhasil, lalu blok verifikasi yang gagal — karena ia mendapati
 * nol baris dan RAISE EXCEPTION. Gerbang di satu tempat dan lupa tempat kedua
 * adalah cara paling mudah menyimpulkan "sudah beres" atas yang belum.
 *
 * Karena itu penjaga ini mencacah blok `DO`-nya, bukan sekadar keberadaan satu
 * gerbang.
 *
 * Ambang NOL.
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const AKAR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..')
const DIR = path.join(AKAR, 'db', 'migrations')

const UUID = /'([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})'\s*::\s*uuid/gi
const GERBANG = /NOT\s+EXISTS\s*\(\s*SELECT\s+1\s+FROM\s+companies\s+WHERE\s+id\s*=/gi

/** Buang komentar SQL supaya id yang hanya DISEBUT di penjelasan tak dituduh. */
function tanpaKomentar(s) {
  return s
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .split('\n')
    .map((b) => b.replace(/--.*$/, ''))
    .join('\n')
}

const temuan = []
for (const f of fs.readdirSync(DIR).filter((x) => x.endsWith('.sql')).sort()) {
  const mentah = fs.readFileSync(path.join(DIR, f), 'utf8')
  const kode = tanpaKomentar(mentah)

  // Hanya id yang dipakai sebagai company_id yang relevan. Cari baris yang
  // menyebut company_id / companies di dekat literal uuid-nya.
  if (!/company_id|companies/i.test(kode)) continue

  /*
    ⚠ VERSI PERTAMA PENJAGA INI MENUDUH TIGA MIGRASI YANG BENAR.

    Ia menandai setiap literal uuid yang KEBETULAN berada dalam 400 karakter
    dari kata `company_id`. Yang tertuduh:

      213  coalesce(project_id, '000…0'::uuid) di PARTITION BY — sentinel,
           bukan id perusahaan; `company_id` kebetulan di baris yang sama
      386  COALESCE(user_id, '000…0'::uuid) di kolom GENERATED — sentinel juga
      335  template_id IN ('47f1…'::uuid) di dalam CHECK yang menyebut
           company_id — id TEMPLATE, bukan perusahaan

    Ketiganya akan memaksa orang memasang gerbang yang tak ada gunanya, dan
    penjaga yang menuntut hal sia-sia akan dimatikan orang — lalu berhenti
    menjaga cacat yang sungguhan.

    Yang berbahaya hanya literal yang benar-benar MENGISI kolom `company_id`.
    Dua bentuk yang mungkin: nilai `company_id = '<uuid>'`, atau literal yang
    berdiri di posisi company_id dalam INSERT ... SELECT.

    UUID nol dikecualikan tanpa syarat: ia sentinel di mana-mana di repo ini,
    dan tak ada baris `companies` ber-id nol.
  */
  const NOL = '00000000-0000-0000-0000-000000000000'
  const ids = new Set()

  /*
    Yang dicari: literal uuid yang MENGISI kolom `company_id` — bukan setiap
    uuid yang kebetulan dekat dengan kata itu.

    Dua bentuk yang dipakai di repo ini:

      a. penugasan langsung   company_id = '<uuid>'::uuid
      b. INSERT ... SELECT    INSERT INTO t (…, company_id, …) SELECT …,
                              '<uuid>'::uuid, …   ← posisi kolomnya dicocokkan

    Untuk (b) posisi literal dihitung sungguhan: kolom ke-berapa `company_id`
    berada di daftar INSERT, lalu ekspresi ke-berapa literal itu di SELECT.
    Menebak dari kedekatan teks tidak cukup — versi pertama penjaga ini
    menuduh tiga migrasi yang benar (213, 335, 386) justru karena menebak.

    UUID nol dikecualikan: ia sentinel COALESCE di mana-mana, dan tak ada
    baris `companies` ber-id nol.
  */

  // (a) penugasan langsung
  for (const m2 of kode.matchAll(
    /company_id\s*=\s*'([0-9a-f-]{36})'\s*::\s*uuid/gi,
  )) {
    if (m2[1].toLowerCase() !== NOL) ids.add(m2[1])
  }

  // (b) INSERT INTO t (kolom, …) SELECT ekspresi, …
  for (const ins of kode.matchAll(
    /INSERT\s+INTO\s+\w+\s*\(([^)]*)\)\s*(?:SELECT|VALUES)([\s\S]{0,4000})/gi,
  )) {
    const kolom = ins[1].split(',').map((x) => x.trim().toLowerCase())
    const posisi = kolom.indexOf('company_id')
    if (posisi < 0) continue

    // Pisah ekspresi SELECT/VALUES di level koma teratas.
    const badan = ins[2]
    const eks = []
    let d = 0, cur = '', q = null
    for (let i = 0; i < badan.length && eks.length <= posisi; i++) {
      const ch = badan[i]
      if (q) { cur += ch; if (ch === q) { if (badan[i + 1] === q) cur += badan[++i]; else q = null } continue }
      if (ch === "'") { q = ch; cur += ch; continue }
      if (ch === '(') d++
      if (ch === ')') { if (d === 0) break; d-- }
      if (ch === ',' && d === 0) { eks.push(cur); cur = ''; continue }
      if (/\bFROM\b/i.test(cur.slice(-6)) && d === 0) break
      cur += ch
    }
    eks.push(cur)

    const nilai = (eks[posisi] ?? '').trim()
    const lit = nilai.match(/^'([0-9a-f-]{36})'\s*::\s*uuid$/i)
    if (lit && lit[1].toLowerCase() !== NOL) ids.add(lit[1])
  }

  if (!ids.size) continue

  const nGerbang = (kode.match(GERBANG) || []).length
  // Tiap blok DO yang menyentuh data bergantung-perusahaan butuh gerbangnya
  // sendiri. Perkiraan aman: jumlah gerbang minimal 1, dan minimal sebanyak
  // blok DO yang menyebut salah satu tabel ber-company_id.
  const nBlokDo = (kode.match(/\bDO\s+\$/g) || []).length

  if (nGerbang === 0) {
    temuan.push({ f, ids: [...ids], sebab: `memaku ${ids.size} id perusahaan TANPA gerbang` })
  } else if (nBlokDo > 0 && nGerbang < nBlokDo) {
    temuan.push({
      f,
      ids: [...ids],
      sebab: `${nGerbang} gerbang untuk ${nBlokDo} blok DO — blok tanpa gerbang akan tetap gagal`,
    })
  }
}

for (const t of temuan) {
  console.error(`❌ ${t.f}\n   ${t.sebab}\n   id: ${t.ids.join(', ')}`)
}
console.log(`migrasi memaku id perusahaan tanpa gerbang lengkap: ${temuan.length} (ambang 0)`)
if (temuan.length) {
  console.error(`
   Migrasi begini BERHASIL di basis dev dan MEMBUNUH rantai di basis mana pun
   yang tak punya baris perusahaan itu — CI, VPS, mesin baru, tenant baru.
   Karena tiap migrasi dibungkus transaksi, kegagalannya menghentikan SEMUA
   migrasi di belakangnya.

   Perbaikan (bukan allowlist — allowlist hanya menolong CI):

     DO $blok$
     BEGIN
     IF NOT EXISTS (SELECT 1 FROM companies WHERE id = '<id>'::uuid) THEN
       RAISE NOTICE '<nnn> dilewati: perusahaan tak ada. Seed dummy — bukan galat.';
       RETURN;
     END IF;
     ...
     END $blok$;

   Pasang di SETIAP blok, termasuk blok verifikasi di ujung berkas.`)
  process.exit(1)
}
