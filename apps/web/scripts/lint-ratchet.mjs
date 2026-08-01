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
  // 255 → 253 (2026-07-31) → 88 → 44 (2026-08-01, codemod `pasangkan-label.mjs`
  // dua gelombang: bentuk satu-baris dulu, lalu label MULTI-BARIS yang semula
  // dilewatkan begitu saja — 9 label di `termin-payment-modal.tsx` lolos di
  // gelombang pertama hanya karena teksnya dipecah beberapa baris).
  //
  // 167 label dipasangkan `htmlFor` ↔ `id`, id DITURUNKAN dari `value={state}`
  // yang sudah ada — tak dikarang. Efek sampingnya bagus untuk semua orang,
  // bukan hanya pembaca layar: teks label jadi bisa diketuk untuk memfokuskan
  // kontrolnya, sehingga target sentuh membesar — persis yang dibutuhkan
  // mandor di HP, satu tangan, di bawah matahari.
  //
  // Satu cacat ketahuan saat memeriksa hasilnya: label di `progress-log-modal`
  // BERCABANG ke dua kontrol berbeda (`select` scope vs `input` jumlah
  // pekerja). `htmlFor` statis menunjuk elemen yang tak dirender di salah satu
  // cabang — label MATI, yang lebih buruk daripada tak berpasangan karena
  // pembaca layar menyebutkan kaitan yang tak ada. Diperbaiki manual;
  // pemindaian menyeluruh memastikan hanya satu yang berbentuk begitu.
  //
  // 44 sisanya dilewati codemod dengan alasan: di dalam `.map()` (id tak akan
  // unik) atau tak punya `value={state}`/`name=` untuk menurunkan id.
  'jsx-a11y/label-has-associated-control': 44,
  // 117 → 112 → 104 → 102 → 98 → 93 → 88 (2026-08-01/02): 5 foto di `progress-log-list` yang semula
  // `<img onClick>` — bisa diklik tetikus, TAK BISA dijangkau keyboard sama
  // sekali. Diganti `<button>`, bukan ditambal `role`+`tabIndex`+`onKeyDown`:
  // browser sudah tahu apa itu tombol, dan tambalan manual mudah tak lengkap.
  'jsx-a11y/click-events-have-key-events': 88,
  // 115 → 108 → 106 (2026-08-01; `rab-section`, lalu kartu proyek jadi `<Link>`): baris kategori/sub-kategori yang
  // bisa dilipat, sel komponen biaya, dan area seret-jatuh. Dipakai helper
  // `lib/dapat-ditekan.ts` supaya `role`+`tabIndex`+Enter/Space selalu lengkap
  // — separuh implementasi (umumnya Enter ditangani, Space tidak) terasa rusak
  // sesekali, dan itu lebih membingungkan daripada rusak konsisten.
  'jsx-a11y/no-static-element-interactions': 96,
  'jsx-a11y/no-noninteractive-element-interactions': 6,

  // ── Hutang lint lain ────────────────────────────────────────────────────
  '@typescript-eslint/no-explicit-any': 193, // turun dari 194 (2026-08-01)
  'react-hooks/set-state-in-effect': 69, // 71 → 70 (HargaTab) → 69 (2026-08-01, klien)
  // turun 71 → 67 (.ds-sync diabaikan) → 15 (2026-08-01).
  //
  // Sebagian besar adalah 50 impor ikon/helper yatim yang menumpuk saat
  // remediasi ADR-004 mencabut `getStoredUser()` dari 8 halaman. Impor yatim
  // tak punya ambiguitas — tak dipakai berarti dibuang, `tsc` membuktikannya.
  //
  // Tapi sisanya BUKAN kerja kosmetik, dan justru di situ nilainya: variabel
  // yatim ternyata penanda fitur yang tak tersambung. Yang ditemukan lewat
  // daftar ini dan diperbaiki hari yang sama:
  //   · `setNotes` (kas)        → modal pengeluaran mengirim `notes` ke API
  //                               tapi TAK PUNYA input. Selalu kosong.
  //   · `setFundSource` (mandor)→ kasbon selalu tercatat "Dana Owner" karena
  //                               pemilihnya tak pernah dirender; komentar di
  //                               sana menjanjikan alur approve yang tak ada.
  //   · `rowOk` (rab-schedule)  → validasi constraint DB dihitung lalu dibuang;
  //                               baris salah tak ditandai dan tombol simpan
  //                               tetap aktif sampai Postgres menolaknya.
  //   · `hasBorongan` (portal)  → dua saudaranya membuka menu, yang ini tidak:
  //                               halaman settlement borongan memang belum ada.
  //
  // 11 sisanya menunggu penilaian serupa, bukan penyapuan.
  '@typescript-eslint/no-unused-vars': 11,
  'react-hooks/exhaustive-deps': 31,
  'react/no-unescaped-entities': 28,
  'react-hooks/static-components': 14,
  '@next/next/no-img-element': 11,
  'react-hooks/immutability': 4,
  'react-hooks/purity': 2,
  'react-hooks/rules-of-hooks': 1,
  // NOL sejak 2026-08-01: satu-satunya pelanggaran adalah ternary-sebagai-statement
  // di `mandor-section.tsx` (`next.has(id) ? next.delete(id) : next.add(id)`).
  // Berfungsi, tapi memakai ekspresi bercabang untuk efek samping menyembunyikan
  // maksudnya; `if/else` menyatakannya langsung.
  '@typescript-eslint/no-unused-expressions': 0,
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
