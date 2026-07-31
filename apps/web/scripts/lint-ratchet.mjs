#!/usr/bin/env node
/**
 * RATCHET LINT `apps/web` — jumlah warning boleh TURUN, tak boleh NAIK.
 *
 * Kenapa ada (A1, STATUS.md §AUDIT): sampai 2026-07-31 `apps/web` SAMA SEKALI
 * tidak masuk CI — hanya job `api` yang ada. Akibatnya 315 lint error menumpuk
 * tanpa pernah menghalangi siapa pun, dan frontend bisa rusak tanpa CI tahu.
 *
 * Menaikkan job CI web sambil membiarkan semuanya `error` = CI merah sejak
 * menit pertama. Memperbaiki 315 sekaligus = satu PR raksasa lintas puluhan
 * file, justru berisiko regresi UI. Jalan tengahnya: aturan diturunkan ke
 * `warn` di `eslint.config.mjs`, lalu jumlahnya dikunci di sini.
 *
 * Efeknya: CI tetap menangkap yang benar-benar rusak (tsc, build, error baru),
 * DAN hutang lint tak bisa diam-diam bertambah. Ini pola yang sama dengan
 * `apps/api/src/routes/v1/__tests__/tenancy-ratchet.test.ts` — sudah terbukti
 * di repo ini: ambang diturunkan tiap gelombang beres, tak pernah dinaikkan.
 *
 * ⚠️ KALAU SCRIPT INI GAGAL karena angka NAIK: jangan naikkan ambangnya.
 *    Perbaiki warning di kode baru Anda. Ambang hanya boleh turun.
 *    Kalau gagal karena angka TURUN: bagus — turunkan ambang ke angka baru.
 */
import { ESLint } from 'eslint'

/**
 * AMBANG per-rule. Angka 2026-07-31, sesudah `ds-bundle/**` diabaikan
 * (6.070 dari 6.503 problem lama ternyata semu — keluaran bundler, bukan kode
 * yang kita tulis; lihat komentar di eslint.config.mjs).
 *
 * Dipecah PER-RULE, bukan satu angka total: kalau hanya total yang dijaga,
 * menambah 10 `any` sambil menghapus 10 `unused-vars` akan lolos — padahal
 * yang terjadi adalah hutang bergeser, bukan berkurang.
 */
const AMBANG = {
  // ── Aksesibilitas (A4, 2026-07-31) ──────────────────────────────────────
  // Angka ini muncul saat `eslint-plugin-jsx-a11y` dinyalakan PERTAMA KALI —
  // sebelumnya nol penegakan, jadi 498 temuan ini memang tak pernah terlihat.
  // Prioritas perbaikan menurut dampak ke pengguna nyata (mandor & tukang,
  // perangkat lama, sering di bawah sinar matahari):
  //   1. click-events + no-static-element-interactions (232) — bisa diklik
  //      tapi TAK BISA dijangkau keyboard. Melanggar MUST #7 langsung.
  //   2. label-has-associated-control (255) — pembaca layar tak bisa
  //      menyebutkan field apa yang sedang diisi.
  'jsx-a11y/label-has-associated-control': 253, // turun dari 255 (2026-07-31)
  'jsx-a11y/click-events-have-key-events': 117,
  'jsx-a11y/no-static-element-interactions': 115,
  'jsx-a11y/no-noninteractive-element-interactions': 11,

  // ── Hutang lint lain ────────────────────────────────────────────────────
  '@typescript-eslint/no-explicit-any': 194,
  'react-hooks/set-state-in-effect': 70, // turun dari 71 (2026-07-31, HargaTab)
  '@typescript-eslint/no-unused-vars': 71,
  'react-hooks/exhaustive-deps': 31,
  'react/no-unescaped-entities': 28,
  'react-hooks/static-components': 14,
  '@next/next/no-img-element': 11,
  'react-hooks/immutability': 4,
  'react-hooks/purity': 2,
  'react-hooks/rules-of-hooks': 1,
  '@typescript-eslint/no-unused-expressions': 1,
}

/** Rule apa pun DI LUAR daftar di atas harus NOL — termasuk rule baru. */
const AMBANG_RULE_TAK_TERDAFTAR = 0

async function hitung() {
  // API programatik, bukan spawn `npx`: `npx.cmd` gagal EINVAL di Windows,
  // dan path `eslint/bin/*` tidak diekspos oleh ESLint v9. Jalur ini identik
  // di Windows lokal maupun Linux CI, dan tak perlu parsing stdout.
  const eslint = new ESLint({ cwd: process.cwd() })
  const hasil = await eslint.lintFiles(['.'])

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

// 1. NOL ERROR. Ini garis keras — `warn` boleh menumpuk (dijaga ambang),
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
  console.error('\n❌ RATCHET LINT GAGAL — hutang lint BERTAMBAH:\n')
  pelanggaran.forEach((p) => console.error('   ' + p))
  console.error(
    '\n   Jangan menaikkan ambang di scripts/lint-ratchet.mjs.' +
    '\n   Perbaiki warning di kode yang Anda ubah.\n',
  )
  process.exit(1)
}

console.log(`✅ Ratchet lint web: ${error} error, ${Object.values(perRule).reduce((a, b) => a + b, 0)} warning (semua di bawah/sama dengan ambang)`)
if (turun.length) {
  console.log('\n📉 Turun dari ambang — silakan kencangkan angkanya di scripts/lint-ratchet.mjs:')
  turun.forEach((t) => console.log('   ' + t))
}
