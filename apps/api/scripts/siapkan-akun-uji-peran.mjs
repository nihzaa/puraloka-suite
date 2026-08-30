#!/usr/bin/env node
/**
 * siapkan-akun-uji-peran.mjs — akun uji satu per peran, sandi diketahui
 *
 * ── Kenapa ini ada
 *
 * `uji-dashboard-per-peran.mjs` hanya bisa menguji peran yang sandinya kita
 * punya. Diukur 2026-08-29: dari 4 peran, hanya `admin` yang teruji — tiga
 * sisanya (`pm`, `mandor`, `client`) TERLEWAT, dan justru merekalah yang
 * penyaringannya perlu dibuktikan. Skrip itu tetap mencetak ✅.
 *
 * Uji yang melewatkan justru kasus yang penting, lalu melapor lulus, lebih
 * berbahaya daripada uji yang merah — yang merah diperbaiki, yang hijau palsu
 * dipercaya.
 *
 * ── Yang dibuat
 *
 * Satu akun per peran, semuanya berpola `uji.<peran>@puraloka.test` dengan
 * sandi dari `UJI_SANDI_PERAN`. Idempoten: yang sudah ada dipakai ulang,
 * sandinya diselaraskan.
 *
 * ── Kenapa akun TERPISAH, bukan mengubah peran akun yang ada
 *
 * Mengubah peran akun sungguhan (mis. menurunkan admin jadi mandor untuk
 * menguji) berarti mengubah data orang yang memakainya. Akun uji berpola nama
 * jelas bisa dibersihkan kapan saja, dan tak seorang pun bergantung padanya.
 *
 * Dijalankan sekali. Untuk membersihkan:
 *   node scripts/siapkan-akun-uji-peran.mjs --hapus
 */
import 'dotenv/config'
import pg from 'pg'
import { createClient } from '@supabase/supabase-js'

const PERAN = ['admin', 'pm', 'direktur', 'mandor', 'client']
const SANDI = process.env.UJI_SANDI_PERAN
const HAPUS = process.argv.includes('--hapus')

const url = process.env.SUPABASE_URL
const rahasia = process.env.SUPABASE_SECRET_KEY

if (!SANDI || SANDI.length < 12) {
  console.error('❌ UJI_SANDI_PERAN kosong atau < 12 karakter.')
  console.error('   Sandi akun uji tetap sandi — pendek berarti bisa ditebak.')
  process.exit(2)
}

const sbAdmin = createClient(url, rahasia, { auth: { persistSession: false } })
const c = new pg.Client({ connectionString: process.env.DIRECT_URL })
await c.connect()

/* Company yang dipakai: yang sama dengan akun uji utama, supaya datanya
   sungguhan — akun di company kosong akan melihat nol apa pun, dan itu
   membuat uji "tak menerima angka" lulus karena alasan yang salah. */
const { rows: co } = await c.query(
  `SELECT cm.company_id FROM company_members cm
     JOIN users u ON u.id = cm.user_id
    WHERE u.email = $1 AND cm.is_default AND cm.is_active LIMIT 1`,
  [process.env.UJI_EMAIL || process.env.LAYAR_EMAIL]
)
const companyId = co[0]?.company_id
if (!companyId) {
  console.error('❌ Tak menemukan company dari UJI_EMAIL — akun uji akan yatim.')
  process.exit(2)
}

for (const peran of PERAN) {
  const email = `uji.${peran}@puraloka.test`

  const { rows: adaRole } = await c.query(
    `SELECT id FROM roles WHERE name = $1 AND company_id = $2`,
    [peran, companyId]
  )
  if (!adaRole.length) {
    console.log(`  ~ ${peran.padEnd(10)} DILEWATI — peran tak ada di company ini`)
    continue
  }

  /* Cari akun auth yang sudah ada. */
  const { data: daftar } = await sbAdmin.auth.admin.listUsers({ perPage: 1000 })
  const adaAuth = (daftar?.users ?? []).find((u) => u.email === email)

  if (HAPUS) {
    if (adaAuth) await sbAdmin.auth.admin.deleteUser(adaAuth.id)
    await c.query(`DELETE FROM company_members WHERE user_id IN (SELECT id FROM users WHERE email=$1)`, [email])
    await c.query(`DELETE FROM users WHERE email = $1`, [email])
    console.log(`  - ${peran.padEnd(10)} dihapus`)
    continue
  }

  let authId
  if (adaAuth) {
    await sbAdmin.auth.admin.updateUserById(adaAuth.id, { password: SANDI })
    authId = adaAuth.id
  } else {
    const { data, error } = await sbAdmin.auth.admin.createUser({
      email, password: SANDI, email_confirm: true,
    })
    if (error) {
      console.error(`  ✗ ${peran}: gagal membuat akun — ${error.message.slice(0, 60)}`)
      process.exitCode = 1
      continue
    }
    authId = data.user.id
  }

  /* Baris `users` + keanggotaan. Idempoten lewat ON CONFLICT. */
  await c.query(
    `INSERT INTO users (auth_id, email, name, role_id, is_active)
     VALUES ($1, $2, $3, $4, true)
     ON CONFLICT (email) DO UPDATE
       SET auth_id = EXCLUDED.auth_id, role_id = EXCLUDED.role_id, is_active = true`,
    [authId, email, `Uji ${peran}`, adaRole[0].id]
  )
  const { rows: u } = await c.query(`SELECT id FROM users WHERE email = $1`, [email])
  await c.query(
    `INSERT INTO company_members (user_id, company_id, role_id, is_default, is_active)
     VALUES ($1, $2, $3, true, true)
     ON CONFLICT (company_id, user_id) DO UPDATE
       SET role_id = EXCLUDED.role_id, is_default = true, is_active = true`,
    [u[0].id, companyId, adaRole[0].id]
  )
  console.log(`  ✓ ${peran.padEnd(10)} ${email}`)
}

await c.end()
console.log(HAPUS ? '\nAkun uji dibersihkan.' : '\nAkun uji siap. Jalankan uji-dashboard-per-peran.mjs.')
