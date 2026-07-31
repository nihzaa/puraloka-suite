#!/usr/bin/env node
/**
 * RATCHET LINT `apps/api` — jumlah warning boleh TURUN, tak boleh NAIK.
 *
 * Kenapa ada (A3, STATUS.md §AUDIT): `@typescript-eslint/no-explicit-any`
 * sebelumnya di-set `"off"` di eslint.config.mjs — padahal
 * `01-foundations/01-coding-standards.md` MUST #3 menyebut rule ITU SENDIRI
 * sebagai mekanisme verifikasinya. Aturan dan praktik bertentangan diam-diam:
 * persis governance drift yang `00-engineering-principles.md` MUST #3 larang.
 *
 * Mematikan rule lalu tetap menuliskan MUST di dokumen adalah bentuk terburuk —
 * standarnya terlihat ditegakkan padahal tidak. Menyalakannya sebagai `error`
 * juga bukan jawaban: 227 `any` yang sudah ada akan langsung memerahkan CI dan
 * memaksa satu PR raksasa lintas puluhan file.
 *
 * Keputusan founder: nyalakan sebagai `warn` + kunci jumlahnya di sini.
 * Aturan kembali selaras dengan praktik, hutangnya terlihat dan terukur, dan
 * tak bisa diam-diam bertambah. Pola yang sama dengan `tenancy-ratchet.test.ts`
 * dan `apps/web/scripts/lint-ratchet.mjs` — sudah terbukti di repo ini.
 *
 * ⚠️ KALAU GAGAL karena angka NAIK: jangan naikkan ambangnya. Beri tipe yang
 *    benar di kode baru Anda. Ambang hanya boleh turun.
 *    Kalau gagal karena angka TURUN: bagus — turunkan ambang ke angka baru.
 */
import { ESLint } from 'eslint'

/**
 * AMBANG per-rule (2026-07-31, saat `no-explicit-any` dinyalakan pertama kali).
 *
 * Dipecah PER-RULE, bukan satu angka total: kalau hanya total yang dijaga,
 * menambah 10 `any` sambil menghapus 10 `unused-vars` akan lolos — padahal
 * yang terjadi hutang bergeser, bukan berkurang.
 */
const AMBANG = {
  // 227 → 226 (ErrorMasuk di index.ts) → 225 (EmbedScope di mandor.ts), 2026-07-31.
  '@typescript-eslint/no-explicit-any': 225,
  '@typescript-eslint/no-unused-vars': 16,
}

/** Rule apa pun DI LUAR daftar di atas harus NOL — termasuk rule baru. */
const AMBANG_RULE_TAK_TERDAFTAR = 0

async function hitung() {
  // API programatik, bukan spawn `npx`: `npx.cmd` gagal EINVAL di Windows,
  // dan path `eslint/bin/*` tidak diekspos oleh ESLint v9. Jalur ini identik
  // di Windows lokal maupun Linux CI, dan tak perlu parsing stdout.
  const eslint = new ESLint({ cwd: process.cwd() })
  const hasil = await eslint.lintFiles(['src'])

  const perRule = {}
  let error = 0
  for (const berkas of hasil) {
    for (const pesan of berkas.messages) {
      const rule = pesan.ruleId ?? '(tanpa-rule)'
      perRule[rule] = (perRule[rule] ?? 0) + 1
      if (pesan.severity === 2) error++
    }
  }
  return { perRule, error }
}

const { perRule, error } = await hitung()
const pelanggaran = []

// 1. NOL ERROR. Garis keras — `warn` boleh menumpuk (dijaga ambang),
//    `error` tidak boleh ada sama sekali.
if (error > 0) {
  pelanggaran.push(`${error} ERROR lint (harus 0 — perbaiki, jangan turunkan ke warn tanpa alasan)`)
}

// 2. Tiap rule tak boleh melebihi ambangnya.
for (const [rule, jumlah] of Object.entries(perRule)) {
  const ambang = AMBANG[rule] ?? AMBANG_RULE_TAK_TERDAFTAR
  if (jumlah > ambang) {
    pelanggaran.push(
      `${rule}: ${jumlah} (ambang ${ambang})` +
      (AMBANG[rule] === undefined ? ' — rule BARU, harus nol sejak awal' : ''),
    )
  }
}

// 3. Laporkan yang TURUN supaya ambang bisa dikencangkan.
const turun = Object.entries(AMBANG)
  .filter(([rule, ambang]) => (perRule[rule] ?? 0) < ambang)
  .map(([rule, ambang]) => `${rule}: ${perRule[rule] ?? 0} < ${ambang}`)

if (pelanggaran.length) {
  console.error('\n❌ RATCHET LINT API GAGAL — hutang lint BERTAMBAH:\n')
  pelanggaran.forEach((p) => console.error('   ' + p))
  console.error(
    '\n   Jangan menaikkan ambang di scripts/lint-ratchet.mjs.' +
    '\n   Beri tipe yang benar di kode yang Anda ubah.\n',
  )
  process.exit(1)
}

console.log(`✅ Ratchet lint API: ${error} error, ${Object.values(perRule).reduce((a, b) => a + b, 0)} warning (semua di bawah/sama dengan ambang)`)
if (turun.length) {
  console.log('\n📉 Turun dari ambang — silakan kencangkan angkanya di scripts/lint-ratchet.mjs:')
  turun.forEach((t) => console.log('   ' + t))
}
