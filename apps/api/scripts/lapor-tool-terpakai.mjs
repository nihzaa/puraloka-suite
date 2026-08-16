#!/usr/bin/env node
/**
 * LAPORAN TOOL TERPAKAI — mana yang benar-benar dipanggil, mana yang menganggur.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * KENAPA INI PENTING SETELAH KATALOG 40 TOOL
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Tiap tool berbiaya token di TIAP ronde (~4.500 token untuk 40 tool, diukur
 * 2026-08-16). Tool yang tak pernah dipanggil bukan sekadar tak berguna — ia
 * membebani setiap percakapan, selamanya, untuk kemampuan yang tak dipakai
 * siapa pun.
 *
 * Tanpa laporan ini, keputusan "tool mana yang dibuang" diambil dari dugaan.
 * Dugaan tentang pemakaian hampir selalu salah: yang dibangun paling lama
 * cenderung dianggap paling penting.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * DIBACA DARI `ai_pesan.blok` — YANG MEMANG SUDAH DISIMPAN
 * ══════════════════════════════════════════════════════════════════════════
 *
 * `ai-loop.ts` menyimpan `panggilanTool` (nama + argumen) di tiap blok ronde.
 * Itu disimpan untuk alasan lain (C-5: supaya ronde berikutnya sah di mata
 * Anthropic), dan kebetulan ia juga catatan pemakaian yang lengkap.
 *
 * Jadi tak ada tabel baru, tak ada penulisan tambahan di jalur panas.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * ANGKA NOL DIBEDAKAN DARI "BELUM PERNAH DIPAKAI SAMA SEKALI"
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Ini bedanya yang paling mudah tertukar, dan yang paling mahal salah baca:
 *
 *   · katalog 40 tool, 0 percakapan bertool  → laporan ini TAK BERARTI APA-APA
 *   · katalog 40 tool, 500 percakapan, 12 tool nol → 12 itu memang menganggur
 *
 * Yang pertama terlihat sama persis dengan yang kedua kalau hanya
 * mengurutkan "tool dengan 0 panggilan". Skrip ini menolak melapor sebelum
 * ada percakapan bertool — daripada menyajikan daftar nol yang terbaca
 * seperti temuan.
 *
 *     node -r dotenv/config scripts/lapor-tool-terpakai.mjs
 */
import { KATALOG_TOOL } from '../src/lib/ai-tool.js'
import { buatClient } from '../../../scripts/db/_koneksi.mjs'

const c = buatClient()
await c.connect()

/*
 * Dibaca dari blok, per-pesan, di aplikasi.
 *
 * Diurai di sini alih-alih lewat operator JSONB Postgres: bentuk bloknya
 * milik `ai-loop.ts` dan bisa berubah, dan query JSONB yang bentuknya
 * tertinggal akan memulangkan NOL tanpa galat — persis kelas kegagalan yang
 * membuat laporan ini berbohong.
 */
const { rows } = await c.query(`
  SELECT m.blok, p.kanal, p.asisten
    FROM ai_pesan m
    JOIN ai_percakapan p ON p.id = m.percakapan_id
   WHERE m.peran = 'assistant' AND m.blok IS NOT NULL
   ORDER BY m.dibuat_pada DESC
   LIMIT 5000`)

const hitung = new Map()
const perAsisten = new Map()
let percakapanBertool = 0

for (const r of rows) {
  const blok = Array.isArray(r.blok) ? r.blok : []
  let adaTool = false

  for (const b of blok) {
    for (const p of b?.panggilanTool ?? []) {
      const nama = p?.nama
      if (!nama) continue
      adaTool = true
      hitung.set(nama, (hitung.get(nama) ?? 0) + 1)

      const kunci = `${r.asisten ?? '?'}`
      const m = perAsisten.get(kunci) ?? new Map()
      m.set(nama, (m.get(nama) ?? 0) + 1)
      perAsisten.set(kunci, m)
    }
  }
  if (adaTool) percakapanBertool += 1
}

// ── Menolak melapor kalau datanya belum cukup ──────────────────────────────
if (percakapanBertool === 0) {
  console.log('⏸  BELUM BISA DILAPORKAN — nol pesan asisten yang memanggil tool.')
  console.log()
  console.log(`   Katalog berisi ${KATALOG_TOOL.length} tool, dan semuanya akan tampil "0 panggilan".`)
  console.log('   Daftar itu terbaca seperti temuan ("12 tool menganggur") padahal ia')
  console.log('   cuma menandakan asistennya belum pernah dipakai bicara.')
  console.log()
  console.log('   Yang dibutuhkan: percakapan sungguhan lewat chat web atau WhatsApp.')
  console.log('   `scripts/seed-pemakaian-asisten.mjs` TIDAK menghasilkan ini — ia')
  console.log('   memanggil tool langsung, tanpa model, jadi tak ada blok percakapan.')
  await c.end()
  process.exit(0)
}

// ── Laporan ────────────────────────────────────────────────────────────────
const semua = KATALOG_TOOL.map((t) => ({
  nama: t.nama,
  izin: t.izin,
  n: hitung.get(t.nama) ?? 0,
})).sort((a, b) => b.n - a.n)

const total = semua.reduce((s, x) => s + x.n, 0)
const menganggur = semua.filter((x) => x.n === 0)

console.log(`${percakapanBertool} pesan asisten memakai tool · ${total} panggilan total\n`)

console.log('TERPAKAI:')
for (const x of semua.filter((y) => y.n > 0)) {
  const pct = ((x.n / total) * 100).toFixed(1)
  console.log(`  ${String(x.n).padStart(5)}  ${pct.padStart(5)}%  ${x.nama}`)
}

if (menganggur.length > 0) {
  console.log(`\nNOL PANGGILAN (${menganggur.length} dari ${KATALOG_TOOL.length}):`)
  for (const x of menganggur) console.log(`         ${x.nama}  (${x.izin})`)
  console.log()
  console.log('  Sebelum membuang: pastikan ia memang tak dibutuhkan, bukan sekadar')
  console.log('  belum ditemukan model. Keterangan tool yang kabur membuat model tak')
  console.log('  pernah memilihnya — dan itu cacat KETERANGAN, bukan cacat kegunaan.')
}

// Per asisten — kurasi `tool_aktif` diputuskan dari sini.
if (perAsisten.size > 1) {
  console.log('\nPER ASISTEN:')
  for (const [asisten, m] of perAsisten) {
    const urut = [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5)
    console.log(`  ${asisten}: ${urut.map(([n, c2]) => `${n}(${c2})`).join(' ')}`)
  }
}

await c.end()
