#!/usr/bin/env node
/**
 * Hook build EAS wajib utuh — tiga berkas yang saling bergantung.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * KENAPA PENJAGA INI ADA
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Build APK gagal SEMBILAN kali sebelum berhasil, dan sebab terakhirnya
 * tersembunyi di celah antara dua versi pnpm:
 *
 *     server EAS Build   pnpm 9.15.5
 *     mesin pengembang   pnpm 11.8.0
 *
 * `overrides` di repo ini tinggal di `pnpm-workspace.yaml` — fitur pnpm 10+.
 * pnpm 9 TAK MEMBACANYA dari sana, jadi ia melihat nol overrides sementara
 * lockfile memuat dua belas, lalu menolak dengan galat yang menuduh
 * lockfile:
 *
 *     ERR_PNPM_LOCKFILE_CONFIG_MISMATCH
 *     The current "overrides" configuration doesn't match the lockfile
 *
 * Perbaikannya: hook `eas-build-pre-install` menormalkan lockfile DAN
 * menyalin `overrides` ke `package.json` — di server saja.
 *
 * ── Kenapa itu rapuh, dan kenapa dijaga
 *
 * Rantainya tiga berkas yang tak saling tahu:
 *
 *     apps/mobile/package.json     memanggil `eas-build-pre-install`
 *     apps/mobile/eas-pre-install.mjs   mencari akar, meneruskan
 *     scripts/eas-lockfile-satu-dokumen.mjs   kerjanya
 *
 * ditambah `.easignore` yang harus MENGIRIM ketiganya, dan
 * `pnpm-workspace.yaml` yang harus punya `overrides` untuk disalin.
 *
 * Menghapus atau memindahkan salah satunya tak menggagalkan `tsc`, tak
 * menyentuh test, dan tak memunculkan galat di mesin ini — pnpm 11 lokal
 * tak membutuhkan satu pun dari mereka. Yang gagal cuma build di server,
 * dua puluh menit kemudian, dengan galat yang menunjuk ke tempat lain.
 *
 * ── Yang DIJAGA, dan yang TIDAK
 *
 * DIJAGA: ketiga berkas ada, hook memanggilnya, `.easignore` mengirimnya,
 * dan `overrides` masih ada di workspace.yaml untuk disalin.
 *
 * TIDAK DIJAGA: bahwa build-nya berhasil. Itu hanya ketahuan dengan
 * menjalankan `eas build`, dan penjaga CI tak punya kredensial Expo. Batas
 * itu disebutkan supaya hijaunya tak dibaca sebagai "APK pasti jadi".
 *
 * ── Ambang NOL
 *
 * Rantai yang putus sebagian sama saja dengan putus seluruhnya.
 */
import { readFileSync, existsSync } from 'node:fs'
import { join, dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const AKAR = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..')

const PKG_MOB = join(AKAR, 'apps', 'mobile', 'package.json')
const HOOK = join(AKAR, 'apps', 'mobile', 'eas-pre-install.mjs')
const SKRIP = join(AKAR, 'scripts', 'eas-lockfile-satu-dokumen.mjs')
const EASIGNORE = join(AKAR, '.easignore')
const WS = join(AKAR, 'pnpm-workspace.yaml')

const temuan = []

// ── 1. Ketiga berkas rantai ada
for (const [nama, p, akibat] of [
  ['apps/mobile/package.json', PKG_MOB, 'tak ada yang memanggil hook'],
  ['apps/mobile/eas-pre-install.mjs', HOOK, 'hook memanggil berkas yang tak ada → "Cannot find module"'],
  ['scripts/eas-lockfile-satu-dokumen.mjs', SKRIP, 'lockfile tak dinormalkan → ERR_PNPM_BROKEN_LOCKFILE'],
]) {
  if (!existsSync(p)) temuan.push({ berkas: nama, apa: 'TAK ADA', akibat })
}

if (temuan.length > 0) {
  laporkan()
  process.exit(1)
}

// ── 2. package.json memanggil hook-nya
const pkg = JSON.parse(readFileSync(PKG_MOB, 'utf8'))
const hookCmd = pkg.scripts?.['eas-build-pre-install'] ?? ''
if (!/eas-pre-install\.mjs/.test(hookCmd)) {
  temuan.push({
    berkas: 'apps/mobile/package.json',
    apa: `scripts.eas-build-pre-install tak memanggil eas-pre-install.mjs (isinya: ${hookCmd || 'kosong'})`,
    akibat: 'lockfile tak dinormalkan di server → build gagal di INSTALL_DEPENDENCIES',
  })
}

/*
  `packageManager` TIDAK boleh ada di sini. Terbukti dua kali:
  build ketiga memuatnya dan tetap gagal; build keenam memakainya sebagai
  bahan string mustahil `yarn@pnpm@11.8.0` saat EAS menebak Yarn.
*/
if (pkg.packageManager) {
  temuan.push({
    berkas: 'apps/mobile/package.json',
    apa: `\`packageManager\` ADA (${pkg.packageManager})`,
    akibat: 'EAS bisa menempelkan prefiks pengelola yang ditebaknya — build '
      + 'keenam gagal dengan `yarn@pnpm@11.8.0`',
  })
}

// ── 3. .easignore mengirim ketiganya
if (!existsSync(EASIGNORE)) {
  temuan.push({
    berkas: '.easignore',
    apa: 'TAK ADA',
    akibat: 'arsip membengkak (219 MB terukur) — bukan kegagalan, tapi tiap build lambat',
  })
} else {
  const pola = readFileSync(EASIGNORE, 'utf8')
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith('#'))

  const cocok = (jalur) =>
    pola.some((p) => jalur === p || jalur.startsWith(p + '/'))

  for (const j of [
    'scripts/eas-lockfile-satu-dokumen.mjs',
    'apps/mobile/eas-pre-install.mjs',
    'pnpm-lock.yaml',
    'pnpm-workspace.yaml',
  ]) {
    if (cocok(j)) {
      temuan.push({
        berkas: '.easignore',
        apa: `membuang \`${j}\``,
        akibat: j === 'pnpm-lock.yaml'
          ? 'EAS mendeteksi pengelola paket dari lockfile — tanpa itu ia menebak Yarn'
          : 'berkas yang dibutuhkan build tak sampai ke server',
      })
    }
  }
}

// ── 4. overrides masih ada untuk disalin
if (existsSync(WS)) {
  const ws = readFileSync(WS, 'utf8')
  if (!/^overrides:/m.test(ws)) {
    temuan.push({
      berkas: 'pnpm-workspace.yaml',
      apa: '`overrides:` tak ada',
      akibat: 'tak ada yang perlu disalin — ini BUKAN kegagalan kalau memang '
        + 'sengaja dihapus, tetapi hook-nya jadi tak berguna dan sebaiknya '
        + 'ikut dibuang',
    })
  }
}

function laporkan() {
  console.log('══ Rantai hook build EAS utuh ═════════════════════════════════')
  console.log(`  berkas rantai      : 3`)
  console.log(`  pelanggaran        : ${temuan.length}`)
  if (temuan.length === 0) return
  console.log('')
  for (const t of temuan) {
    console.log(`  ❌ ${t.berkas}`)
    console.log(`     ${t.apa}`)
    console.log(`     → ${t.akibat}`)
  }
  console.log('')
  console.log('  Cacat rantai ini TAK menggagalkan tsc dan TAK menyentuh test —')
  console.log('  pnpm 11 di mesin ini tak membutuhkan satu pun dari mereka.')
  console.log('  Yang gagal cuma build di server, dua puluh menit kemudian,')
  console.log('  dengan galat yang menunjuk ke tempat lain.')
  console.log('')
}

laporkan()

if (temuan.length > 0) process.exit(1)

console.log('')
console.log('✅ Rantai hook utuh: dipanggil, dikirim, dan `overrides` siap disalin.')
