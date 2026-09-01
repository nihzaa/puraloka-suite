#!/usr/bin/env node
/**
 * Menyamakan sandi tiga akun uji PORTAL dengan `LAYAR_SANDI`.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * KENAPA SKRIP INI ADA
 * ══════════════════════════════════════════════════════════════════════════
 *
 * `potret-portal-adaptif.mjs` tak pernah bisa memotret `/pm-portal` dan
 * `/mandor-portal`. Laporannya selalu NOL POTRET — dan nol temuan dari
 * korpus kosong tak membuktikan apa pun.
 *
 * Sebabnya BUKAN akun yang hilang. Diukur 2026-09-01:
 *
 *     uji.pm.portal@puraloka.test      konfirm=true  login terakhir 20 Agu
 *     uji.mandor.portal@puraloka.test  konfirm=true  login terakhir 20 Agu
 *     uji.klien.portal@puraloka.test   konfirm=true  login terakhir  6 Agu
 *
 * Ketiganya sehat, terkonfirmasi, tak diblokir, dan PERNAH berhasil login.
 * Sandinya saja yang berbeda dari `LAYAR_SANDI`, dan tak tercatat di mana
 * pun — termasuk pada founder.
 *
 * ── Kenapa menyetel ulang, bukan membuat akun baru
 *
 * Akun baru berarti data uji baru yang harus dibersihkan, peran yang harus
 * dipasang ulang, dan seed portal (`seed-uji-portal-pm.mjs`,
 * `seed-uji-portal-mandor.mjs`) yang menunjuk user id LAMA. Ketiga akun ini
 * sudah punya semuanya.
 *
 * ── Kenapa sandinya disamakan, bukan dibuat baru
 *
 * Supaya tak ada rahasia baru yang harus dititipkan ke suatu tempat.
 * `LAYAR_SANDI` sudah hidup di `apps/web/.env.local` (ter-gitignore,
 * diverifikasi `git check-ignore`), sudah dipakai audit a11y dan potret,
 * dan founder tak perlu mengingat apa pun yang baru.
 *
 * ── Kenapa lewat Admin API, bukan UPDATE ke auth.users
 *
 * `encrypted_password` punya bentuk hash yang ditentukan GoTrue, dan
 * menulisnya langsung berarti menebak algoritma serta parameternya. Salah
 * tebak menghasilkan baris yang TERLIHAT benar dan menolak setiap login —
 * kegagalan yang tak menyebut sebabnya.
 *
 * Admin API juga yang memelihara `updated_at` dan membatalkan sesi lama.
 *
 * ── Idempoten
 *
 * Menjalankannya berkali-kali aman: sandinya disetel ke nilai yang sama.
 * Skrip ini TIDAK membuat akun, TIDAK mengubah peran, dan TIDAK menyentuh
 * akun di luar ketiga alamat yang disebutkan.
 *
 * Jalankan dari akar repo:
 *
 *     node scripts/db/setel-sandi-akun-uji-portal.mjs
 */
import { readFileSync, existsSync } from 'node:fs'
import { join, dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const AKAR = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')

/*
  Hanya tiga alamat ini. Daftar dipaku, bukan pola `uji.%` — pola akan ikut
  menyapu `uji.admin@` yang sandinya sudah benar dan sedang dipakai, dan
  menyetel ulang sandi akun yang berfungsi adalah cara membuat kerusakan
  dari perbaikan.
*/
const AKUN = [
  'uji.pm.portal@puraloka.test',
  'uji.mandor.portal@puraloka.test',
  'uji.klien.portal@puraloka.test',
]

/*
  ⚠ Parser env sendiri, dan alasannya ada di CLAUDE.md §7.

  Berkas `.env` di repo ini diawali BOM, nilainya dibungkus tanda kutip, dan
  salah satunya pernah berakhiran CR SAJA — yang membuat `grep -E "^PORT"`
  memulangkan NOL pada berkas yang jelas memuat barisnya.
*/
function bacaEnv(p) {
  if (!existsSync(p)) return {}
  const isi = readFileSync(p, 'utf8').replace(/^﻿/, '')
  const out = {}
  for (const baris of isi.split(/\r?\n|\r/)) {
    const b = baris.trim()
    if (!b || b.startsWith('#')) continue
    const i = b.indexOf('=')
    if (i < 0) continue
    out[b.slice(0, i).trim()] = b.slice(i + 1).trim().replace(/^["']|["']$/g, '')
  }
  return out
}

const envApi = bacaEnv(join(AKAR, 'apps', 'api', '.env'))
const envWeb = bacaEnv(join(AKAR, 'apps', 'web', '.env.local'))

const URL_SB = envApi.SUPABASE_URL
const KUNCI = envApi.SUPABASE_SECRET_KEY ?? envApi.SUPABASE_SERVICE_ROLE_KEY
const SANDI = process.env.LAYAR_SANDI ?? envWeb.LAYAR_SANDI

for (const [nama, nilai, dari] of [
  ['SUPABASE_URL', URL_SB, 'apps/api/.env'],
  ['SUPABASE_SECRET_KEY', KUNCI, 'apps/api/.env'],
  ['LAYAR_SANDI', SANDI, 'apps/web/.env.local'],
]) {
  if (!nilai) {
    console.error(`❌ ${nama} kosong — dibaca dari ${dari}.`)
    console.error('   Berhenti TANPA menyentuh satu akun pun.')
    process.exit(1)
  }
}

const kepala = {
  apikey: KUNCI,
  Authorization: `Bearer ${KUNCI}`,
  'Content-Type': 'application/json',
}

/** Cari satu pengguna auth berdasarkan email. Memulangkan id, atau null. */
async function cariId(email) {
  const u = `${URL_SB}/auth/v1/admin/users?filter=${encodeURIComponent(email)}`
  const r = await fetch(u, { headers: kepala })
  if (!r.ok) throw new Error(`cari ${email}: HTTP ${r.status} ${await r.text()}`)
  const j = await r.json()
  const daftar = j.users ?? []
  /*
    Cocokkan PERSIS. `filter` di Admin API mencocokkan sebagian, jadi
    'uji.pm.portal@…' bisa memulangkan beberapa baris — dan mengambil
    `[0]` berarti menyetel sandi akun yang salah tanpa satu pun galat.
  */
  const tepat = daftar.filter((x) => String(x.email).toLowerCase() === email.toLowerCase())
  if (tepat.length > 1) throw new Error(`${email}: ${tepat.length} akun beremail sama`)
  return tepat[0]?.id ?? null
}

console.log('══ Setel sandi akun uji portal ════════════════════════════════')
console.log(`  Supabase : ${URL_SB.replace(/^https:\/\//, '').slice(0, 28)}…`)
console.log(`  sandi    : dari LAYAR_SANDI (${SANDI.length} karakter, tak dicetak)`)
console.log('')

let berhasil = 0
const gagal = []

for (const email of AKUN) {
  try {
    const id = await cariId(email)
    if (!id) {
      gagal.push(`${email}: tak ada di auth.users`)
      console.log(`  ❌ ${email.padEnd(32)} tak ditemukan`)
      continue
    }
    const r = await fetch(`${URL_SB}/auth/v1/admin/users/${id}`, {
      method: 'PUT',
      headers: kepala,
      body: JSON.stringify({ password: SANDI, email_confirm: true }),
    })
    if (!r.ok) {
      gagal.push(`${email}: HTTP ${r.status} ${(await r.text()).slice(0, 120)}`)
      console.log(`  ❌ ${email.padEnd(32)} HTTP ${r.status}`)
      continue
    }
    berhasil++
    console.log(`  ✓  ${email.padEnd(32)} sandi disetel`)
  } catch (e) {
    gagal.push(`${email}: ${e.message}`)
    console.log(`  ❌ ${email.padEnd(32)} ${e.message.slice(0, 60)}`)
  }
}

console.log('')
console.log(`  berhasil : ${berhasil} dari ${AKUN.length}`)

if (gagal.length) {
  console.log('')
  for (const g of gagal) console.log(`  ❌ ${g}`)
  console.log('')
  process.exit(1)
}

console.log('')
console.log('✅ Ketiga akun uji portal memakai LAYAR_SANDI.')
console.log('   Verifikasi lewat rute LOGIN sungguhan, bukan dari keluaran ini —')
console.log('   Admin API menjawab 200 untuk perubahan yang belum tentu bisa dipakai masuk.')
