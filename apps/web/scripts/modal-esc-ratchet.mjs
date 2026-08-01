#!/usr/bin/env node
/**
 * PENJAGA MODAL — setiap modal harus bisa ditutup dengan tombol Esc.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * KENAPA ADA
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Sembilan modal di halaman `/mandor` hanya bisa ditutup dengan mengklik
 * latarnya — nol penanganan Esc di seluruh berkas (diverifikasi 2026-08-01).
 * Bagi pemakai keyboard itu berarti TERJEBAK: modal terbuka, Tab berputar di
 * dalamnya, dan satu-satunya jalan keluar adalah mengambil tetikus.
 *
 * WCAG 2.1 menyebutnya "No Keyboard Trap" (2.1.2, Level A) — syarat dasar,
 * bukan penyempurnaan.
 *
 * ── Kenapa penjaga, bukan sekadar diperbaiki sekali
 *
 * Modal baru lahir terus di repo ini, dan pola yang disalin adalah modal yang
 * sudah ada. Kalau yang disalin tak punya Esc, cacatnya ikut menyebar tanpa
 * ada yang menyadarinya — persis bagaimana sembilan modal itu terbentuk.
 *
 * ── Yang dicari
 *
 * Komponen yang (a) merender lapisan modal (`position: "fixed"` + `inset: 0`)
 * dan menerima prop `onClose`, TAPI (b) tak memanggil `useTutupEsc` maupun
 * menangani `Escape` sendiri.
 *
 * Jalankan: node apps/web/scripts/modal-esc-ratchet.mjs
 */
import { readFileSync, readdirSync } from 'node:fs'
import { join, relative } from 'node:path'

const AKAR = join(import.meta.dirname, '..')

/**
 * AMBANG — modal tanpa jalan keluar papan tik.
 *
 * ⚠️ HANYA BOLEH TURUN. Kalau gagal karena NAIK: panggil `useTutupEsc(onClose)`
 * di modal baru Anda — satu baris. Jangan naikkan angkanya.
 *
 * NOL sejak 2026-08-01. Ternyata bukan masalah satu halaman: 36 modal di
 * SELURUH aplikasi tak punya jalan keluar papan tik, dan semuanya ditutup
 * sekaligus. Nol dipilih, bukan angka sisa, karena perbaikannya satu baris —
 * tak ada alasan modal baru lahir tanpa itu.
 */
const AMBANG = 0

function berkasTsx(dir) {
  const h = []
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (e.name === 'node_modules' || e.name.startsWith('.') || e.name === 'ds-bundle') continue
    const p = join(dir, e.name)
    if (e.isDirectory()) h.push(...berkasTsx(p))
    else if (e.name.endsWith('.tsx')) h.push(p)
  }
  return h
}

const temuan = []

for (const f of [...berkasTsx(join(AKAR, 'app')), ...berkasTsx(join(AKAR, 'components'))]) {
  const rel = relative(AKAR, f).replace(/\\/g, '/')
  const isi = readFileSync(f, 'utf8')
  const baris = isi.split('\n')

  // Batas komponen: satu berkas kerap memuat beberapa modal.
  const batas = [
    ...isi.matchAll(/^(?:export\s+)?(?:default\s+)?function\s+([A-Z][\w$]*)/gm),
  ].map((m) => ({ nama: m[1], baris: isi.slice(0, m.index).split('\n').length - 1 }))
  batas.push({ nama: '(akhir)', baris: baris.length })

  for (let i = 0; i < batas.length - 1; i++) {
    const { nama, baris: mulai } = batas[i]
    const lingkup = baris.slice(mulai, batas[i + 1].baris).join('\n')

    // (a) Ini lapisan modal? `position: "fixed"` + `inset: 0` adalah pola
    //     yang dipakai konsisten di repo ini untuk latar modal.
    const lapisanModal = /position:\s*["']fixed["'][^\n]*inset:\s*0/.test(lingkup)
    if (!lapisanModal) continue

    // Harus MENERIMA `onClose` sebagai parameter — bukan sekadar menyebutnya.
    //
    // ⚠️ Versi pertama hanya mencari `\bonClose\b` di seluruh lingkup, dan
    // menuduh tiga komponen HALAMAN (`MandorPageInner`, `ProjectDetailContent`,
    // `MilestoneSection`) yang cuma MERENDER modal — mereka melewatkan
    // `onClose={...}` ke anaknya, tak punya `onClose` sendiri. Sisipan otomatis
    // di sana menghasilkan `useTutupEsc(onClose)` yang merujuk nama tak ada:
    // tsc menangkapnya, tapi hanya karena kebetulan gagal keras. Kalau
    // kebetulan ada variabel bernama sama, ia akan menutup hal yang salah
    // tanpa satu pun peringatan.
    const signature = lingkup.slice(0, lingkup.indexOf('{', lingkup.indexOf('(')) + 400)
    if (!/onClose\s*[,}:)]/.test(signature)) continue

    // (b) Sudah ada jalan keluar papan tik?
    if (/useTutupEsc\s*\(/.test(lingkup)) continue
    if (/["']Escape["']/.test(lingkup)) continue

    temuan.push(`${rel}:${mulai + 1} — ${nama}`)
  }
}

console.log(`Modal tanpa jalan keluar Esc: ${temuan.length}`)

if (temuan.length > AMBANG) {
  console.error(`\n❌ PENJAGA MODAL GAGAL: ${temuan.length} > ambang ${AMBANG}\n`)
  console.error('   Modal yang hanya bisa ditutup dengan mengklik latarnya MENJEBAK')
  console.error('   pemakai keyboard: Tab berputar di dalamnya dan tak ada jalan keluar')
  console.error('   selain mengambil tetikus. WCAG 2.1.2 (Level A) melarangnya.')
  console.error('\n   Perbaikan: satu baris — `useTutupEsc(onClose)` dari @/lib/use-tutup-esc.')
  console.error('   Kalau Esc TIDAK boleh menutup (mis. sedang menyimpan), lewatkan null:')
  console.error('   `useTutupEsc(saving ? null : onClose)`.\n')
  temuan.slice(0, 60).forEach((t) => console.error(`     ${t}`))
  console.error('')
  process.exit(1)
}

if (temuan.length < AMBANG) {
  console.log(`\n📉 Turun dari ambang (${temuan.length} < ${AMBANG}) — kencangkan angkanya.`)
}
