/**
 * UJI ALUR MFA — daftar → TOTP nyata → verifikasi → cabut.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * KENAPA MENGHITUNG TOTP SENDIRI, BUKAN MEMALSUKAN BALASAN
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Yang diuji di sini bukan "rutenya membalas 200" melainkan "kode dari
 * aplikasi autentikator BENAR-BENAR diterima". Mock akan lulus meskipun
 * rahasianya salah encoding, jam servernya meleset, atau tantangannya tak
 * pernah dibuat — dan ketiganya baru terlihat saat pengguna sungguhan
 * memindai QR.
 *
 * Dua cacat NYATA ditemukan uji ini pada 2026-08-11, keduanya lolos typecheck:
 *
 *   1. `friendlyName` memakai tanggal saja → percobaan KEDUA di hari yang
 *      sama selalu ditolak ("A factor with the friendly name … already
 *      exists"). Itu justru jalur paling umum: orang salah memasukkan kode,
 *      menutup halaman, lalu mencoba lagi.
 *   2. Pembersihan faktor `unverified` melewatkan sebagian karena
 *      `listFactors()` tak selalu mengembalikan yang belum terverifikasi.
 *
 * ── Akun uji DIBERSIHKAN di akhir
 *
 * Meninggalkan akun uji ber-MFA aktif akan mengunci sesi berikutnya di luar —
 * tak ada perangkat autentikator yang memegang rahasianya.
 *
 * Pakai (API uji di port terpisah, JANGAN yang dipakai founder):
 *   cd apps/api && PORT=3099 npx tsx src/index.ts &
 *   node apps/api/scripts/uji-alur-mfa.mjs
 */
import crypto from 'node:crypto'
const API = 'http://localhost:3099'

function totp(b32) {
  const A = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'
  let bits = ''
  for (const ch of b32.replace(/=+$/, '').toUpperCase()) bits += A.indexOf(ch).toString(2).padStart(5, '0')
  const bytes = Buffer.from((bits.match(/.{8}/g) || []).map((b) => parseInt(b, 2)))
  const t = Math.floor(Date.now() / 1000 / 30)
  const msg = Buffer.alloc(8); msg.writeUInt32BE(0, 0); msg.writeUInt32BE(t >>> 0, 4)
  const h = crypto.createHmac('sha1', bytes).update(msg).digest()
  const o = h[h.length - 1] & 0xf
  return String((((h[o] & 0x7f) << 24) | (h[o+1] << 16) | (h[o+2] << 8) | h[o+3]) % 1e6).padStart(6, '0')
}

const login = await fetch(`${API}/api/v1/auth/login`, {
  method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ email: 'layar.admin@puraloka.test', password: 'Layar#2026aman' }),
})
const ck = login.headers.getSetCookie().map((c) => c.split(';')[0]).join('; ')

const daftar = await (await fetch(`${API}/api/v1/keamanan/mfa/daftar`, { method: 'POST', headers: { cookie: ck } })).json()
if (daftar.error) { console.log('❌ daftar:', daftar.error); process.exit(1) }
console.log('daftar    : faktor', daftar.faktor_id.slice(0, 8) + '…')

const kode = totp(daftar.rahasia)
const ver = await (await fetch(`${API}/api/v1/keamanan/mfa/verifikasi`, {
  method: 'POST', headers: { 'Content-Type': 'application/json', cookie: ck },
  body: JSON.stringify({ faktor_id: daftar.faktor_id, kode }),
})).json()
console.log('verifikasi:', ver.error ? '❌ ' + ver.error : '✅ ok (kode ' + kode + ')')

const st = await (await fetch(`${API}/api/v1/keamanan/status`, { headers: { cookie: ck } })).json()
console.log('status    : mfa.aktif =', st.mfa?.aktif, '| faktor:', (st.mfa?.faktor ?? []).map((f) => f.status).join(','))
console.log('            sesi', (st.sesi ?? []).length, '| riwayat_tersedia', st.riwayat_tersedia)

// Bersihkan: akun uji tak boleh ditinggalkan ber-MFA — sesi berikutnya akan
// terkunci di luar tanpa perangkat autentikator.
for (const f of st.mfa?.faktor ?? []) {
  const d = await (await fetch(`${API}/api/v1/keamanan/mfa/${f.id}`, { method: 'DELETE', headers: { cookie: ck } })).json()
  console.log('matikan   :', d.error ? '❌ ' + d.error : '✅ faktor dicabut')
}
const akhir = await (await fetch(`${API}/api/v1/keamanan/status`, { headers: { cookie: ck } })).json()
console.log('akhir     : mfa.aktif =', akhir.mfa?.aktif)
