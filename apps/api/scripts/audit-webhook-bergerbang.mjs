#!/usr/bin/env node
/**
 * PENJAGA — webhook publik wajib bergerbang, dan urutannya wajib benar.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * KENAPA AMBANGNYA NOL, BUKAN RATCHET
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Ratchet cocok untuk hutang yang menyusut pelan-pelan. Ia salah di sini:
 * SATU webhook tanpa gerbang sudah cukup untuk membuka seluruh basis ke siapa
 * pun yang menebak URL-nya. Tak ada "sedikit lebih baik dari kemarin" untuk
 * pintu yang terbuka.
 *
 * ── Yang dijaga, dan kenapa masing-masing
 *
 * G-1  Setiap route tanpa `authenticate` di `routes/` WAJIB salah satu:
 *      memverifikasi rahasia, atau terdaftar sebagai publik-yang-disengaja.
 *      Tanpa ini, route baru yang lupa preHandler tak akan pernah terlihat —
 *      dan gejalanya nol sampai seseorang menemukannya.
 *
 * G-2  Webhook WA wajib memakai perbandingan rahasia yang tak bocor lewat
 *      waktu. `===` pada string berhenti di karakter pertama yang berbeda.
 *
 * G-3  Rahasia diperiksa SEBELUM apa pun yang menyentuh basis. Gerbang yang
 *      benar tapi terlambat berarti penyerang tetap bisa menulis baris dedup
 *      dan memetakan sistem dengan menghitung selisih balasan.
 *
 * G-4  Webhook TIDAK boleh memanggil model tanpa lewat `jalankanGiliranAi`.
 *      Panggilan langsung melewatkan saklar mati dan gerbang biaya sekaligus
 *      — dan tenant yang mematikan AI tetap ditagih.
 *
 * G-5  Nomor tak dikenal WAJIB dicatat (C-9). Percobaan yang tak terlihat
 *      berarti pola serangan tak pernah muncul di mana pun.
 *
 * ── Dibuktikan bisa MERAH
 *
 * `scripts/bukti-mutasi-webhook.sh` menyuntik pelanggaran untuk tiap G di
 * atas dan menuntut penjaga ini merah. Penjaga yang tak pernah merah adalah
 * hiasan.
 */
import { readFileSync, readdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const AKAR = join(dirname(fileURLToPath(import.meta.url)), '..', 'src')
const ROUTES = join(AKAR, 'routes')
const WEBHOOK = join(ROUTES, 'v1', 'wa-webhook.ts')

/**
 * Route yang memang SENGAJA publik, dengan alasannya.
 *
 * Daftar putih ada supaya "publik" jadi keputusan yang tertulis, bukan
 * kelalaian yang lolos. Menambah baris di sini menuntut alasan yang bisa
 * dibantah orang lain saat membaca diff.
 */
const PUBLIK_DISENGAJA = new Map([
  ['health.ts', 'liveness probe — tak menyentuh data tenant'],
])

let gagal = 0
const lapor = (kode, pesan) => {
  console.error(`  ❌ ${kode}: ${pesan}`)
  gagal++
}

function semuaBerkas(dir) {
  const keluar = []
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name)
    if (e.isDirectory()) {
      if (e.name === '__tests__') continue
      keluar.push(...semuaBerkas(p))
    } else if (e.name.endsWith('.ts')) keluar.push(p)
  }
  return keluar
}

console.log('── audit: webhook publik bergerbang ──')

// ── G-1: tak ada route tanpa autentikasi yang juga tanpa rahasia ───────────
for (const berkas of semuaBerkas(ROUTES)) {
  const isi = readFileSync(berkas, 'utf8')
  const nama = berkas.split(/[\\/]/).pop()

  // Hanya berkas yang benar-benar mendaftarkan route HTTP.
  if (!/app\.(get|post|put|patch|delete)\s*[<(]/.test(isi)) continue
  if (isi.includes('authenticate')) continue
  if (PUBLIK_DISENGAJA.has(nama)) continue

  /*
    ── Gerbang KETIGA: kunci API ber-scope (ditambahkan 2026-08-27)

    Komentar lama di sini berbunyi "satu-satunya gerbang yang tersisa adalah
    rahasia", dan itu tak lagi benar sejak `plugins/api-key-auth.ts` ada.
    Akibatnya `otomasi-umpan.ts` dilaporkan TERBUKA padahal rutenya berpagar
    `requireApiKey('otomasi:umpan:baca')`.

    `requireApiKey` bukan gerbang yang lebih lemah dari rahasia bersama —
    ia lebih KUAT. Diukur ke kodenya:

      · 401 bila header `X-API-Key` tak ada
      · 401 bila bentuk kuncinya salah (dan mencatat IP-nya)
      · dicocokkan ke `hash_kunci` di basis, bukan dibandingkan mentah
      · 503 GAGAL-TERTUTUP bila verifikasinya sendiri gagal
      · ber-SCOPE, jadi satu kunci tak otomatis membuka rute lain

    Rahasia bersama tak punya satu pun dari lima itu: satu nilai untuk semua
    pemanggil, tak bisa dicabut per-klien, tak ber-scope.

    Laporan palsu di penjaga keamanan sangat mahal: ia melatih pembacanya
    mengabaikan keluaran penjaga yang ambangnya NOL — dan yang berikutnya
    mungkin rute yang benar-benar terbuka.
  */
  const adaRahasia = /_SECRET|_WEBHOOK_SECRET|x-webhook-secret/.test(isi)
  const adaKunciApi = /requireApiKey\s*\(/.test(isi)
  if (!adaRahasia && !adaKunciApi) {
    lapor(
      'G-1',
      `${nama} mendaftarkan route TANPA authenticate dan TANPA verifikasi rahasia.\n` +
        `        Tambahkan preHandler authenticate, verifikasi rahasia, atau daftarkan\n` +
        `        di PUBLIK_DISENGAJA (dengan alasan) kalau memang sengaja terbuka.`,
    )
  }
}

const wh = readFileSync(WEBHOOK, 'utf8')

// ── G-2: perbandingan rahasia tak boleh bocor lewat waktu ──────────────────
if (!/function samaAman/.test(wh)) {
  lapor('G-2', 'wa-webhook.ts tak punya pembanding rahasia `samaAman`')
} else {
  // Pembandingnya harus benar-benar menyapu SELURUH string, bukan berhenti
  // pada perbedaan pertama.
  const badan = wh.slice(wh.indexOf('function samaAman'))
  const potong = badan.slice(0, badan.indexOf('\n}'))
  if (!/\^=|\|=|\bfor\b/.test(potong)) {
    lapor('G-2', '`samaAman` tak menyapu seluruh string — waktu eksekusinya membocorkan rahasia')
  }
  if (/rahasia\s*===\s*dikirim|dikirim\s*===\s*rahasia/.test(wh)) {
    lapor('G-2', 'webhook membandingkan rahasia dengan `===` — bocor lewat waktu')
  }
}

/*
 * ── G-3: rahasia diperiksa SEBELUM sentuhan basis pertama ─────────────────
 *
 * Diukur di dalam BADAN HANDLER saja, bukan seluruh berkas.
 *
 * Versi pertama pemeriksaan ini memindai berkas utuh dan langsung merah — ia
 * menemukan `import { supabase }` di baris 52, jauh di atas pemeriksaan
 * rahasia. Itu temuan palsu: import bukan sentuhan basis, dan penjaga yang
 * menuntutnya akan mendorong orang mengurutkan ulang import alih-alih
 * memperbaiki urutan gerbang — persis kebalikan dari tujuannya.
 */
const iHandler = wh.search(/async\s*\(request,\s*reply\)\s*=>/)
const badanHandler = iHandler === -1 ? '' : wh.slice(iHandler)
const iRahasia = badanHandler.search(/samaAman\s*\(/)
// Pemanggilan, bukan penyebutan: `klaimPesanMasuk(` dengan kurung.
const iBasis = badanHandler.search(
  /(klaimPesanMasuk|bangunSesiDariNomor|createTenantDb|ambilKredensial)\s*\(|supabase\s*\.\s*from/,
)
if (iHandler === -1) {
  lapor('G-3', 'badan handler webhook tak dikenali — pemeriksaan urutan tak bisa dilakukan')
} else if (iRahasia === -1) {
  lapor('G-3', 'tak ada pemeriksaan rahasia sama sekali di wa-webhook.ts')
} else if (iBasis !== -1 && iBasis < iRahasia) {
  lapor(
    'G-3',
    'basis disentuh SEBELUM rahasia diperiksa — penyerang tetap bisa menulis baris\n' +
      '        dan memetakan sistem dari selisih waktu balasan',
  )
}

// ── G-4: model hanya lewat inti bersama ────────────────────────────────────
if (!wh.includes('jalankanGiliranAi')) {
  lapor('G-4', 'webhook tak memakai `jalankanGiliranAi` — saklar mati & gerbang biaya terlewat')
}
for (const langsung of ['jalankanLoop(', 'buatAdaptor(', 'anthropic.messages', '.chat(']) {
  if (wh.includes(langsung)) {
    lapor('G-4', `webhook memanggil \`${langsung}\` langsung — melewati gerbang biaya`)
  }
}

/*
 * ── G-5: C-9, percobaan dari nomor tak dikenal wajib tercatat ─────────────
 *
 * Yang dicari PANGGILAN di badan handler, bukan kata `catatAksesDitolak` di
 * berkas. Perbedaannya menentukan, dan sudah terbukti sekali di sini: versi
 * pertama G-5 memotong 800 karakter dari kemunculan `bangunSesiDariNomor`
 * PERTAMA — yang ternyata baris `import`, bukan pemanggilannya. Potongan itu
 * memuat baris import `catatAksesDitolak`, jadi penjaga tetap hijau meski
 * pemanggilan sesungguhnya sudah dihapus.
 *
 * `bukti-mutasi-webhook.sh` yang menemukannya: mutasi G-5 melaporkan HIJAU
 * padahal jalur pencatatannya sudah dicabut. Tanpa mutasi, penjaga ini akan
 * dikira bekerja selama berbulan-bulan.
 */
const iPanggilSesi = badanHandler.search(/bangunSesiDariNomor\s*\(/)
if (iPanggilSesi === -1) {
  lapor('G-5', 'webhook tak memanggil `bangunSesiDariNomor` — identitas tak diresolusi')
} else {
  // Jalur penolakan adalah blok tepat setelah pemanggilan itu.
  const jalurTolak = badanHandler.slice(iPanggilSesi, iPanggilSesi + 800)
  if (!/catatAksesDitolak\s*\(/.test(jalurTolak)) {
    lapor(
      'G-5',
      '`catatAksesDitolak(...)` tak DIPANGGIL di jalur penolakan identitas (C-9) —\n' +
        '        percobaan yang tak tercatat berarti pola serangan tak pernah terlihat',
    )
  }
}

if (gagal > 0) {
  console.error(`\n❌ ${gagal} pelanggaran. Ambang penjaga ini NOL — lihat kepala berkas.`)
  process.exit(1)
}
console.log('  ✅ G-1..G-5 lulus (ambang NOL)')
