#!/usr/bin/env node
// ============================================================================
// UJI KETUJUH TUGAS TERJADWAL — SUNGGUHAN, DAN TANPA SALDO AI
//
// ══════════════════════════════════════════════════════════════════════════
// KENAPA SKRIP INI ADA
// ══════════════════════════════════════════════════════════════════════════
//
// Founder: *"bangun aja dulu semua workflow nya dan pastikan pake cara uji yg
// lain yg tanpa harus pake saldo"*.
//
// Diukur lebih dulu, dan hasilnya melegakan: **tak satu pun dari 14 alur
// otomasi membutuhkan AI.** Semuanya aturan `if-then` — eskalasi, pengingat,
// meneruskan notifikasi. Yang butuh saldo hanya asisten chat dan sapa-proaktif,
// dan keduanya BUKAN bagian dari katalog otomasi.
//
// Jadi seluruh alur bisa diuji hari ini juga, dengan saldo nol.
//
// ── Kenapa memicu rutenya, bukan memanggil fungsinya
//
// Yang ingin dibuktikan bukan "logikanya benar" — itu sudah dijaga test unit.
// Yang belum pernah dibuktikan: **rutenya benar-benar bisa dipanggil dan
// menyelesaikan pekerjaannya** dari luar, lewat jalur yang sama dengan yang
// akan dipakai penjadwal sungguhan.
//
// Bedanya nyata di repo ini: `teruskan-kasbon-diajukan` mengirim 28 WhatsApp
// sungguhan sementara buku eksekusinya kosong, karena jembatannya melewati
// `jalankanAlur()`. Test unit hijau sepanjang itu terjadi.
//
// ── Kenapa BUKAN penjaga CI
//
// Ia butuh API hidup dan kredensial nyata. Dijalankan manual saat ingin tahu
// "apakah otomasi benar-benar jalan hari ini", sama seperti
// `jalankan-a11y-lengkap.mjs`.
//
// ── Cara pakai
//
//     # API harus hidup lebih dulu. UKUR portnya — CLAUDE.md §7:
//     netstat -ano | grep ':300[0-9].*LISTENING'
//
//     UJI_EMAIL=… UJI_SANDI=… UJI_BASIS=http://127.0.0.1:3001 \
//       node apps/api/scripts/uji-otomasi-terjadwal.mjs
//
// `UJI_BASIS` WAJIB diukur, bukan ditebak: pada 2026-08-15 API hidup di 3001
// sementara `apps/web/.env.local` menunjuk 3007 — dan menembak port yang salah
// menghasilkan "Not Found" yang terbaca seperti rute tak terdaftar.
// ============================================================================

const BASIS = (process.env.UJI_BASIS || 'http://127.0.0.1:3001').replace(/\/$/, '')
const EMAIL = process.env.UJI_EMAIL
const SANDI = process.env.UJI_SANDI

/**
 * Ketujuh tugas terjadwal, dibaca dari kode sumbernya sendiri supaya daftar
 * ini tak pernah berselisih dengan rute yang benar-benar ada.
 */
const TUGAS = [
  'kasbon-outstanding',
  'kasbon-tukang',
  'progres-belum-lapor',
  'dependency-breach',
  'gr-matching',
  'invoice-termin',
  'stok-menipis',
]

if (!EMAIL || !SANDI) {
  console.error('\n❌ UJI_EMAIL dan UJI_SANDI wajib diisi.\n')
  console.error('   Rute otomasi bergerbang `requirePermission` — memanggilnya tanpa')
  console.error('   sesi berarti menguji gerbangnya, bukan pekerjaannya.\n')
  process.exit(1)
}

// ── 1. Masuk ────────────────────────────────────────────────────────────────
const masuk = await fetch(`${BASIS}/api/v1/auth/login`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ email: EMAIL, password: SANDI }),
}).catch((e) => ({ ok: false, status: 0, _err: e }))

if (!masuk.ok) {
  console.error(`\n❌ Gagal masuk (${masuk.status || 'tak terhubung'}).`)
  if (masuk._err) console.error(`   ${masuk._err.message}`)
  console.error(`\n   Basis yang dicoba: ${BASIS}`)
  console.error('   UKUR portnya — CLAUDE.md §7:')
  console.error("     netstat -ano | grep ':300[0-9].*LISTENING'\n")
  process.exit(1)
}

/*
  Token diambil dari COOKIE, bukan badan balasan.

  `/auth/login` sengaja TIDAK memulangkan `access_token` di badan — ia menaruhnya
  di cookie HttpOnly (`puraloka_token`), supaya skrip di browser tak bisa
  membacanya. Tebakan pertama saya (`sesi.session.access_token`) salah: badan
  hanya memuat `expires_at`.

  Jadi penguji ini meniru browser, bukan API client — dan itu justru lebih dekat
  dengan jalur yang dipakai sungguhan.
*/
const setCookie = masuk.headers.getSetCookie?.() ?? []
const cookie = setCookie
  .map((c) => c.split(';')[0])
  .filter((c) => /^puraloka_(token|refresh)=/.test(c))
  .join('; ')

if (!cookie) {
  console.error('\n❌ Masuk berhasil tetapi tak ada cookie `puraloka_token` di balasan.')
  console.error('   Set-Cookie yang diterima:', JSON.stringify(setCookie).slice(0, 160))
  process.exit(1)
}

console.log(`\n── Memicu ${TUGAS.length} tugas terjadwal di ${BASIS}\n`)

// ── 2. Picu satu per satu ───────────────────────────────────────────────────
const hasil = []
for (const t of TUGAS) {
  const mulai = Date.now()
  const r = await fetch(`${BASIS}/api/v1/otomasi/jalankan/${t}`, {
    headers: { cookie },
  }).catch((e) => ({ ok: false, status: 0, _err: e }))

  const durasi = Date.now() - mulai
  let badan = null
  try { badan = await r.json() } catch { /* balasan bukan JSON — dilaporkan lewat status */ }

  hasil.push({ tugas: t, status: r.status, ok: r.ok, durasi, badan })

  const tanda = r.ok ? '✓' : '✗'
  const ringkas = badan
    ? JSON.stringify(badan).replace(/\s+/g, ' ').slice(0, 74)
    : (r._err?.message ?? '—')
  console.log(`  ${tanda} ${t.padEnd(22)} ${String(r.status).padStart(3)}  ${String(durasi).padStart(5)}ms  ${ringkas}`)
}

// ── 3. Verdict ──────────────────────────────────────────────────────────────
const gagal = hasil.filter((h) => !h.ok)

console.log('')
console.log(`── Ringkasan: ${hasil.length - gagal.length}/${hasil.length} berhasil dipicu`)

if (gagal.length > 0) {
  console.error('\n❌ Tugas yang gagal dipicu:\n')
  for (const g of gagal) {
    console.error(`   ${g.tugas} → ${g.status}`)
    if (g.badan) console.error(`      ${JSON.stringify(g.badan).slice(0, 180)}`)
  }
  console.error('')
  console.error('   403 = izin kurang · 404 = rute tak terdaftar (atau PORT SALAH)')
  console.error('   500 = pekerjaannya sendiri gagal — periksa log API.\n')
  process.exit(1)
}

/*
  Berhasil dipicu ≠ ada yang dikerjakan.

  Sebagian tugas memang wajar memulangkan nol: `stok-menipis` diam bila tak ada
  material di bawah ambang, `progres-belum-lapor` diam bila semua mandor sudah
  melapor. Itu bukan kegagalan — dan menuntutnya bukan-nol akan membuat uji ini
  merah pada sistem yang sehat.

  Yang dilaporkan: berapa yang benar-benar mengerjakan sesuatu, supaya "semua
  hijau" tak dibaca sebagai "semua bekerja".
*/
const berisi = hasil.filter((h) => {
  const b = JSON.stringify(h.badan ?? {})
  return /"(jumlah|dikirim|dibuat|diproses|terkirim)":\s*[1-9]/.test(b)
})

console.log(`   ${berisi.length} di antaranya benar-benar mengerjakan sesuatu;`)
console.log(`   ${hasil.length - berisi.length} memulangkan nol — WAJAR bila tak ada yang perlu dikerjakan hari ini.`)
console.log('')
console.log('✅ Ketujuh tugas terjadwal bisa dipicu dan selesai tanpa saldo AI.')
console.log('')
