/**
 * Uji MODUL SUNGGUHAN — antrean.js hasil transpil tsc dari lib/antrean.ts.
 * Bukan salinan logika: kalau lib/antrean.ts berubah, uji ini ikut berubah.
 */
globalThis.__mem = {}
globalThis.__salin = []
globalThis.__hapusFoto = 0

// Jalur modul hasil transpil datang dari runner (uji-antrean.mjs).
const modul = process.env.MODUL_ANTREAN
if (!modul) {
  console.error('MODUL_ANTREAN tak diset — jalankan lewat scripts/uji-antrean.mjs')
  process.exit(1)
}
import { pathToFileURL } from 'node:url'
const { antrekan, daftarAntrean, prosesAntrean } =
  await import(pathToFileURL(modul).href)

let lulus = 0, gagal = 0
const cek = (nama, a, h) => {
  const ok = JSON.stringify(a) === JSON.stringify(h)
  console.log(`  ${ok ? 'LULUS' : 'GAGAL'}  ${nama}`)
  if (!ok) { console.log(`         harap : ${JSON.stringify(h)}`); console.log(`         aktual: ${JSON.stringify(a)}`); gagal++ } else lulus++
}

console.log('\n== Uji MODUL NYATA lib/antrean.ts =============================\n')

// 1. antrekan menyimpan & memulangkan kiriman berkunci
const k1 = await antrekan({ jenis: 'kasbon', jalur: '/api/v1/kasbons', muatan: { amount: 500000 }, ringkas: 'Kasbon Rp500.000' })
cek('antrekan: kunci terisi', typeof k1.kunci === 'string' && k1.kunci.length > 5, true)
cek('antrekan: kunci == id (dibuat sekali)', k1.kunci === k1.id, true)
cek('antrekan: percobaan mulai 0', k1.percobaan, 0)
cek('antrekan: masuk daftar', (await daftarAntrean()).length, 1)

// 2. Jaringan mati → tetap di antrean, percobaan TIDAK naik
globalThis.__jawab = async () => { const e = new Error('Network Error'); throw e }
let r = await prosesAntrean()
cek('jaringan mati: nol terkirim', r.terkirim, 0)
cek('jaringan mati: tersisa 1', r.tersisa, 1)
cek('jaringan mati: percobaan tetap 0', (await daftarAntrean())[0].percobaan, 0)

// 3. Server menolak 400 → percobaan naik, TIDAK dibuang
globalThis.__jawab = async () => { const e = new Error('Bad Request'); e.response = { status: 400, data: { error: 'amount wajib' } }; throw e }
r = await prosesAntrean()
cek('ditolak 400: gagal 1', r.gagal, 1)
const stlh = await daftarAntrean()
cek('ditolak 400: percobaan naik jadi 1', stlh[0].percobaan, 1)
cek('ditolak 400: galat dicatat', stlh[0].galatTerakhir, 'amount wajib')
cek('ditolak 400: kunci TIDAK berubah', stlh[0].kunci, k1.kunci)

// 4. Berhasil → keluar dari antrean
let headerTerkirim = null
globalThis.__jawab = async (jalur, data, cfg) => { headerTerkirim = cfg?.headers; return { data: { ok: true } } }
r = await prosesAntrean()
cek('berhasil: terkirim 1', r.terkirim, 1)
cek('berhasil: antrean kosong', (await daftarAntrean()).length, 0)
cek('berhasil: Idempotency-Key DIKIRIM', headerTerkirim?.['Idempotency-Key'], k1.kunci)

// 5. Berhenti pada jaringan mati — kiriman kedua tak ikut dicoba
await antrekan({ jenis: 'kasbon', jalur: '/a', muatan: {}, ringkas: 'satu' })
await antrekan({ jenis: 'kasbon', jalur: '/b', muatan: {}, ringkas: 'dua' })
let dicoba = 0
globalThis.__jawab = async () => { dicoba++; throw new Error('Network Error') }
await prosesAntrean()
cek('jaringan mati: hanya SATU permintaan dicoba', dicoba, 1)
cek('jaringan mati: kedua kiriman utuh', (await daftarAntrean()).length, 2)

console.log(`\n  ${lulus} lulus · ${gagal} gagal\n`)
process.exit(gagal > 0 ? 1 : 0)
