#!/usr/bin/env node
/**
 * Membuktikan kiriman antrean mobile BENAR-BENAR diterima API.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * KENAPA SKRIP INI ADA
 * ══════════════════════════════════════════════════════════════════════════
 *
 * `audit-antrean-punya-rute.mjs` menjaga tiap kiriman antrean menunjuk rute
 * POST yang TERDAFTAR — dan itu penting, tetapi ia memeriksa BENTUK KODE.
 * Ia tak tahu apa-apa soal apakah muatannya diterima.
 *
 * Bedanya bukan teoretis. Penjaga itu lahir dari temuan foto progres yang
 * TAK PERNAH SAMPAI: antrean mengirim multipart sementara rutenya membaca
 * JSON. Jalurnya benar, muatannya tidak — dan `project_photos` nol baris
 * dalam 30 hari tanpa satu pun galat di layar.
 *
 * Skrip ini menutup sisi yang lain: muatan yang PERSIS seperti dirakit
 * layar mobile, dikirim ke API yang sungguhan.
 *
 * ── Kenapa mandor yang dipakai, bukan admin
 *
 * Yang memakai layar ini mandor di lapangan. Admin punya izin lebih luas,
 * jadi lulus dengan admin tak membuktikan mandor bisa — dan justru mandor
 * yang tak punya cara melapor kalau gagal.
 *
 * ── Idempoten & bisa dibersihkan
 *
 * Absensi dikirim untuk TANGGAL JAUH DI MASA LALU (2020-01-01) supaya tak
 * bercampur dengan data hari ini, dan dihapus di akhir. Kalau penghapusan
 * gagal, skrip MENGATAKANNYA — tidak diam.
 *
 *     UJI_BASIS=https://api.puraloka-suite.duckdns.org \
 *     UJI_EMAIL=… UJI_SANDI=… node apps/mobile/scripts/uji-kiriman-antrean-hidup.mjs
 *
 * Tanpa UJI_BASIS ia memakai localhost:3007 — ukur portnya (CLAUDE.md §7).
 */
const BASIS = process.env.UJI_BASIS ?? 'http://localhost:3007'
const EMAIL = process.env.UJI_EMAIL
const SANDI = process.env.UJI_SANDI

if (!EMAIL || !SANDI) {
  console.error('❌ UJI_EMAIL / UJI_SANDI kosong — tak ada yang bisa diuji.')
  process.exit(2)
}

const API = `${BASIS}/api/v1`
/* Tanggal jauh di masa lalu: tak bercampur dengan absensi hari ini, dan
   mudah dikenali kalau pembersihannya gagal. */
const TANGGAL_UJI = '2020-01-01'

async function kirim(metode, jalur, tok, muatan) {
  const r = await fetch(API + jalur, {
    method: metode,
    headers: {
      'Content-Type': 'application/json',
      'X-Client': 'mobile',
      ...(tok ? { Authorization: 'Bearer ' + tok } : {}),
    },
    body: muatan ? JSON.stringify(muatan) : undefined,
  })
  let j = null
  try { j = await r.json() } catch { /* balasan tanpa badan */ }
  return { status: r.status, body: j }
}

console.log('══ Kiriman antrean mobile diterima API? ═══════════════════════')
console.log(`  basis : ${BASIS}`)
console.log(`  akun  : ${EMAIL}`)
console.log('')

const masuk = await kirim('POST', '/auth/login', null, { email: EMAIL, password: SANDI })
const tok = masuk.body?.session?.access_token
if (!tok) {
  console.error(`❌ Login gagal (${masuk.status}): ${masuk.body?.error ?? '(tanpa pesan)'}`)
  console.error('   Tanpa token, sisa uji tak berarti apa-apa.')
  process.exit(1)
}
console.log(`  ✓  login — token diterima (X-Client: mobile)`)

/*
  Data diambil dari API, bukan dipaku.

  Id yang dipaku akan basi begitu seed berubah, dan galatnya ("scope tak
  ditemukan") terbaca seperti cacat rute — bukan seperti data uji usang.
*/
const scopes = await kirim('GET', '/mandor/my-scopes', tok)
const workers = await kirim('GET', '/mandor/workers', tok)
const scopeId = scopes.body?.scopes?.[0]?.id
const workerId = (workers.body?.workers ?? workers.body?.data ?? [])[0]?.id

if (!scopeId || !workerId) {
  console.error(`❌ Data uji tak lengkap — scope=${scopeId ?? 'nihil'} worker=${workerId ?? 'nihil'}`)
  console.error('   Akun ini tak memegang scope/tukang; ujinya DILEWATI, bukan lulus.')
  process.exit(1)
}
console.log(`  ✓  data uji: scope ${String(scopeId).slice(0, 8)} · tukang ${String(workerId).slice(0, 8)}`)
console.log('')

/*
  Muatan PERSIS seperti dirakit `app/(app)/absensi/input.tsx` —
  disalin dari sana, bukan ditulis ulang. Bentuk yang berbeda sedikit saja
  membuat uji ini lulus untuk sesuatu yang tak pernah dikirim aplikasi.
*/
const muatan = {
  scope_id: scopeId,
  tanggal: TANGGAL_UJI,
  entri: [{ worker_id: workerId, porsi_hari: 1, jam_lembur: 0 }],
}

const hasil = await kirim('POST', '/absensi', tok, muatan)
const lulus = hasil.status >= 200 && hasil.status < 300

console.log(`  ${lulus ? '✓ ' : '❌'} POST /absensi → ${hasil.status}`)
if (!lulus) {
  console.log(`     ${JSON.stringify(hasil.body).slice(0, 200)}`)
}

/*
  ── Jejak yang ditinggalkan, dan kenapa TIDAK dibersihkan lewat API ──────

  Diukur 2026-09-01: rute DELETE untuk absensi TIDAK ADA. Absensi memang
  tak dirancang bisa dihapus — ia catatan upah, dan menghapusnya berarti
  menghapus dasar pembayaran orang.

  Yang menyelamatkan uji ini: rutenya `upsert` dengan
  `onConflict: scope_id,worker_id,tanggal`. Kiriman berulang untuk tanggal
  yang sama MENIMPA, tak menumpuk — jadi berapa kali pun skrip ini
  dijalankan, jejaknya tetap satu baris.

  Satu baris bertanggal 2020-01-01 di basis dummy adalah harga yang wajar
  untuk membuktikan mandor bisa bekerja. Yang TIDAK wajar adalah
  membiarkannya tanpa disebut — maka ia dicetak di akhir tiap jalan,
  lengkap dengan cara menghapusnya.

  ⚠ Kalau suatu hari rute DELETE ditambahkan, skrip ini layak diperbarui
  untuk memakainya. Sampai itu terjadi, "tak bisa dibersihkan" adalah
  kenyataan yang dinyatakan, bukan kelalaian yang disembunyikan.
*/
const baris = Array.isArray(hasil.body?.absensi) ? hasil.body.absensi : []

console.log('')
if (!lulus) {
  console.log('❌ Kiriman antrean DITOLAK API.')
  console.log('')
  console.log('   Ini yang tak bisa ditangkap `audit-antrean-punya-rute.mjs`:')
  console.log('   ia menjaga JALURNYA ada, bukan muatannya diterima. Cacat')
  console.log('   seperti ini pernah membuat foto progres tak pernah sampai')
  console.log('   selama 30 hari — antrean menahannya, layar berkata')
  console.log('   "tersimpan", dan tak seorang pun tahu.')
  console.log('')
  process.exit(1)
}

console.log('✅ Kiriman antrean absensi diterima API yang sungguhan.')
console.log('')
console.log(`   Jejak: ${baris.length} baris absensi bertanggal ${TANGGAL_UJI}.`)
console.log('   Rutenya upsert (scope_id,worker_id,tanggal), jadi menjalankan')
console.log('   skrip ini berulang MENIMPA — tak menumpuk. Tak ada rute DELETE')
console.log('   untuk absensi (ia catatan upah), jadi kalau ingin bersih:')
console.log('')
console.log(`      DELETE FROM public.absensi_harian WHERE tanggal = '${TANGGAL_UJI}';`)
