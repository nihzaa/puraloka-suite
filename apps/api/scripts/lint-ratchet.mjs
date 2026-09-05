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
  // 224 -> 223 (2026-08-14): `tax_records` di reports.ts diberi SATU tipe
  // bernama (`BarisPajak`) alih-alih `any` di tujuh lambda. Bukan sekadar
  // menyenangkan lint: `r.tax_amont` yang salah ketik diam-diam `undefined`,
  // lalu `Number(undefined)` jadi NaN — di laporan pajak.
  '@typescript-eslint/no-explicit-any': 223,
  // 16 → 10 (2026-08-02): tujuh impor `supabase` yatim, sisa dari migrasi
  // bertahap ke `request.db`. Enam sudah yatim sebelum hari ini; yang ketujuh
  // (`milestones`) baru menjadi yatim saat seluruh query-nya dialihkan.
  // 10 -> 8 (2026-08-14): tujuh impor mati dibuang (FastifyRequest yang tak
  // dipakai, calculateTax/getTaxRate di termin-payment, renderDariDb di
  // wa-nomor) dan enam variabel lokal mati dibereskan.
  // 8 -> 3 (2026-08-27): 19 sisa dibersihkan. Tiga di antaranya BUKAN
  // sekadar berisik lint, melainkan cacat yang tak punya gejala lain:
  //
  //   blokPenanya (ai-jalankan)  identitas penanya dibaca dari basis tiap
  //                              percakapan, disusun jadi blok konteks, lalu
  //                              DIBUANG — `susunPromptSistem` dipanggil
  //                              dengan empat argumen, parameter kelimanya
  //                              selalu jatuh ke ''. Asisten tak pernah tahu
  //                              siapa yang bertanya, dan tak ada galat.
  //
  //   analisaKolom (struktur.ts) fungsi yang SALAH untuk rute itu berada
  //                              dalam jangkauan tangan; komentar di
  //                              dispatcher menyebut varian polos membuat
  //                              kolom bermomen besar lolos dengan 'aman'.
  //
  //   sendMilestoneReminderEmail di-destructure lalu tak pernah dipanggil,
  //                              membuat pembacanya mengira jalur emailnya
  //                              ada (R-021).
  //
  // Sisa 3 adalah variabel lokal berawalan `_` yang memang sengaja.
  '@typescript-eslint/no-unused-vars': 3,
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

/*
  ── AMBANG YANG TERLALU LONGGAR ADALAH IZIN BERTAMBAH ────────────────────

  Disalin dari `apps/web/scripts/lint-ratchet.mjs` (2026-09-01) karena
  ketiadaannya di sanalah yang membuat cacat berikut bertahan tiga minggu:

      click-events-have-key-events   disetel 57, hitungan saat itu 36
      no-static-element-interactions disetel 63, hitungan saat itu 40

  Longgar 21 dan 23 SEJAK HARI PERTAMA. Hutangnya naik 36 → 54 dan
  40 → 59, dan CI hijau sepanjang itu — karena blok `turun` di atas hanya
  MENYARANKAN (exit 0), dan saran yang bisa diabaikan berminggu-minggu
  bukan penjaga.

  ── Kenapa dipasang di sini padahal API sedang SEHAT

  Diukur 2026-09-01 sebelum memasang:

      no-explicit-any   ambang 223  hitungan 223  longgar 0
      no-unused-vars    ambang   3  hitungan   3  longgar 0

  Nol kelonggaran pada keduanya. Jadi penjaga ini tak menemukan apa pun
  hari ini — dan itu justru alasannya dipasang sekarang: yang membuat
  sisi web longgar 21 selama tiga minggu bukan kelalaian sekali,
  melainkan KETIADAAN PENJAGA. Sisi API punya ketiadaan yang sama, hanya
  belum menggigit.

  Memasangnya saat sehat berarti nol pekerjaan pembersihan; menunggu
  sampai ia menggigit berarti membayar dengan hutang yang sudah terlanjur
  naik.

  ── Kenapa 8, bukan 0

  Jarak nol memaksa tiap perbaikan kecil disertai sunting berkas ini —
  gesekan yang membuat orang berhenti memperbaiki. Delapan cukup memberi
  ruang bagi pekerjaan yang sedang berjalan, dan jauh di bawah 21 yang
  lolos selama tiga minggu.

  Angkanya SENGAJA sama dengan sisi web: dua ratchet dengan aturan berbeda
  untuk hal yang sama akan membuat orang menebak mana yang berlaku.
*/
const BATAS_LONGGAR = 8
const terlaluLonggar = Object.entries(AMBANG)
  .map(([rule, ambang]) => ({ rule, ambang, kini: perRule[rule] ?? 0 }))
  .filter((x) => x.ambang - x.kini > BATAS_LONGGAR)

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

if (terlaluLonggar.length) {
  console.error(`\n❌ ${terlaluLonggar.length} ambang TERLALU LONGGAR (jarak > ${BATAS_LONGGAR}):\n`)
  for (const x of terlaluLonggar) {
    console.error(`   ${x.rule}: ambang ${x.ambang}, hitungan ${x.kini} — longgar ${x.ambang - x.kini}`)
  }
  console.error('')
  console.error('   Ambang yang jauh di atas kenyataan bukan ratchet; ia IZIN')
  console.error('   BERTAMBAH yang tak seorang pun sadar telah diberikan.')
  console.error('')
  console.error('   Diukur 2026-09-01 di sisi WEB: dua ambang dipasang longgar')
  console.error('   21 dan 23 sejak hari pertama, dan hutangnya naik 18-19')
  console.error('   sepanjang tiga minggu dengan CI hijau terus.')
  console.error('')
  console.error('   Turunkan ke sekitar hitungan sekarang — beri jarak kecil')
  console.error('   untuk pekerjaan yang sedang berjalan, bukan puluhan.')
  console.error('')
  process.exit(1)
}
