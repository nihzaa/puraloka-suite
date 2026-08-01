#!/usr/bin/env node
/**
 * PENJAGA GUARD SADAR-SCHEMA — `to_regclass` tanpa kualifikasi skema.
 *
 * ── Kenapa ada
 *
 * 2026-08-01, ENAM berkas integration test ketahuan **tak pernah benar-benar
 * berjalan** — 24 test yang selama ini dilaporkan sebagai "skipped" dan
 * dianggap normal.
 *
 * Akarnya satu baris di migrasi 080:
 *
 *     IF to_regclass('audit_logs') IS NOT NULL THEN … CREATE VIEW … END IF;
 *
 * Niatnya benar dan tertulis di komentarnya: "hanya jika audit_logs ada — view
 * tak relevan di schema test minimal". Tapi `to_regclass` TANPA nama skema
 * mengikuti `search_path`, **dan pencarian itu tidak berhenti di schema
 * pertama**. Dijalankan dengan `search_path = test, extensions`, ia tetap
 * menemukan `public.audit_logs` — guard lolos, view dibuat, lalu gagal karena
 * di schema `test` tabelnya memang tak ada.
 *
 * Diverifikasi langsung, bukan disimpulkan:
 *     SET search_path TO ujiA, extensions;
 *     SELECT to_regclass('audit_logs');   → audit_logs   (KETEMU)
 *
 * ── Kenapa berbahaya melebihi kejadiannya
 *
 * Guard bermaksud "apakah objek ini ada DI SINI", tapi menjawab "apakah objek
 * ini ada DI MANA PUN yang bisa kucari". Di production keduanya sama, jadi
 * cacatnya tak pernah muncul — sampai ada schema kedua. Dan repo ini punya
 * schema kedua: schema test, plus rencana multi-tenant.
 *
 * ── Yang dijaga
 *
 * `to_regclass('nama')` tanpa titik = tanpa skema. Yang benar salah satu dari:
 *   • `to_regclass('public.nama')`      — bila memang selalu public
 *   • cek `pg_class JOIN pg_namespace WHERE nspname = current_schema()`
 *
 * Komentar dibuang sebelum diperiksa — penjaga yang menghukum orang karena
 * MENJELASKAN cacat lama akan membuat orang berhenti menulis penjelasan.
 *
 * Jalankan: node apps/api/scripts/audit-guard-schema.mjs
 */
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

const DIR = join(import.meta.dirname, '..', '..', '..', 'db', 'migrations')

/**
 * Ambang. HANYA BOLEH TURUN.
 *
 * 080 tak bisa diperbaiki di tempat (riwayat migrasi tak boleh berubah isinya)
 * — ia sudah ditutup migrasi maju 154. Sisanya di 145/146 memakai `to_regclass`
 * pada objek yang hanya ada di `public` dan tak pernah dijalankan di schema
 * test; ditinjau satu per satu, bukan diasumsikan aman.
 */
const AMBANG = 4

const temuan = []
for (const f of readdirSync(DIR).filter((n) => n.endsWith('.sql')).sort()) {
  const mentah = readFileSync(join(DIR, f), 'utf8')
  // Buang komentar SQL (`--` sampai akhir baris) sebelum memeriksa.
  const isi = mentah.split('\n').map((b) => b.replace(/--.*$/, '')).join('\n')
  for (const m of isi.matchAll(/to_regclass\(\s*'([^']+)'\s*\)/gi)) {
    const target = m[1]
    if (target.includes('.')) continue   // sudah berkualifikasi skema
    const baris = isi.slice(0, m.index).split('\n').length
    temuan.push({ berkas: f, baris, target })
  }
}

console.log(`to_regclass tanpa kualifikasi skema: ${temuan.length} (ambang ${AMBANG})`)
for (const t of temuan) console.log(`   ${t.berkas}:${t.baris}  to_regclass('${t.target}')`)

if (temuan.length > AMBANG) {
  console.error(`\n❌ RATCHET GAGAL: ${temuan.length} > ambang ${AMBANG}\n`)
  console.error(
    "   `to_regclass('nama')` tanpa skema mengikuti search_path, dan pencarian\n" +
    '   itu MENEMBUS ke schema lain. Guard yang bermaksud "ada di sini?" jadi\n' +
    '   menjawab "ada di mana pun?" — di production keduanya sama, jadi cacatnya\n' +
    '   diam sampai ada schema kedua.\n\n' +
    '   Pakai salah satu:\n' +
    "     to_regclass('public.nama')\n" +
    "     EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace\n" +
    "              WHERE c.relname='nama' AND n.nspname = current_schema())\n\n" +
    '   Kenapa ditegakkan: pola ini membuat 24 integration test tak pernah\n' +
    '   berjalan selama berbulan-bulan — dan gejalanya "skipped", bukan "failed".\n',
  )
  process.exit(1)
}

console.log(`\n✅ Guard skema: ${temuan.length}/${AMBANG} — tidak bertambah.`)
