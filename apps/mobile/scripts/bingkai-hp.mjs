#!/usr/bin/env node
/**
 * Membungkus potret layar mobile dengan bingkai HP — seperti emulator.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * KENAPA SKRIP INI ADA
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Founder meminta melihat aplikasinya "kaya mockup hp yg kaya di Android
 * Studio". Emulator Android Studio butuh ~8 GB dan tak ada di mesin ini,
 * jadi ini jalan yang memberi gambarnya tanpa memasang apa pun.
 *
 * ── Kenapa TERPISAH dari `potret-mobile.mjs`
 *
 * Keduanya menjawab pertanyaan yang berbeda, dan menggabungkannya akan
 * merusak yang pertama:
 *
 *     potret-mobile.mjs  MENGUKUR — lebar gulir, ukuran huruf, isi layar.
 *                        Bingkai menambah piksel di sekeliling layar, dan
 *                        `scrollWidth` lalu diukur terhadap bingkai, bukan
 *                        terhadap layar. Pengukurannya jadi salah tanpa
 *                        gejala.
 *
 *     bingkai-hp.mjs     MEMPERLIHATKAN — untuk dinilai mata manusia.
 *                        Tak ada ambang, tak ada exit 1 karena selera.
 *
 * Yang mengukur tak boleh dihias; yang menghias tak boleh mengaku mengukur.
 *
 * ── Kenapa membaca PNG yang sudah ada, bukan memotret sendiri
 *
 * Supaya bingkai tak pernah bisa memperlihatkan sesuatu yang tak lulus
 * pengukuran. `potret-mobile.mjs` menolak menyimpan potret saat login
 * gagal — kalau skrip ini memotret sendiri, ia akan dengan senang hati
 * membingkai layar login dan hasilnya terlihat meyakinkan.
 *
 * Urutannya wajib: ukur dulu, hias kemudian.
 *
 * ── Ukuran bingkai
 *
 * Layar sumber 360×800 (Android kelas menengah, §potret-mobile). Bingkai
 * mengikuti proporsi Pixel: bezel tipis merata, sudut membulat, punch-hole
 * kamera di tengah atas, tombol daya + volume di sisi kanan.
 *
 *     node apps/mobile/scripts/bingkai-hp.mjs
 *     node apps/mobile/scripts/bingkai-hp.mjs --gelap
 */
import { chromium } from '@playwright/test'
import { readdirSync, existsSync, readFileSync, mkdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const AKAR = dirname(dirname(fileURLToPath(import.meta.url)))
const SUMBER = join(AKAR, '.layar')
const KELUAR = join(AKAR, '.layar', 'bingkai')
const GELAP = process.argv.includes('--gelap')

if (!existsSync(SUMBER)) {
  console.error(`❌ ${SUMBER} tak ada.`)
  console.error('   Jalankan dulu yang MENGUKUR:')
  console.error('     UJI_BASIS=http://localhost:8081 node apps/mobile/scripts/potret-mobile.mjs')
  process.exit(2)
}

/*
  Hanya lebar `kecil` (360×800) yang dibingkai.

  430×932 dipotret untuk membuktikan tata letak tak pecah di layar besar —
  itu pertanyaan pengukuran. Bingkai menjawab pertanyaan lain: "bagaimana
  rupanya di HP mandor", dan HP mandor bukan iPhone Pro Max.
*/
const pola = new RegExp(`-kecil${GELAP ? '-gelap' : ''}\\.png$`)
const berkas = readdirSync(SUMBER)
  .filter((n) => pola.test(n))
  .filter((n) => (GELAP ? true : !n.includes('-gelap')))
  .sort()

if (berkas.length === 0) {
  console.error(`❌ Nol potret ${GELAP ? 'gelap' : 'terang'} berlebar 360 di ${SUMBER}.`)
  console.error('')
  console.error('   Nol berkas BUKAN "tak ada yang perlu dibingkai" — ia berarti')
  console.error('   pengukurannya belum pernah lulus. `potret-mobile.mjs` menolak')
  console.error('   menyimpan potret saat login gagal, justru supaya keadaan ini')
  console.error('   terlihat, bukan tersamar jadi galeri kosong.')
  console.error('')
  process.exit(2)
}

mkdirSync(KELUAR, { recursive: true })

/** Lebar layar sumber. Bingkai dihitung relatif terhadap ini. */
const L = 360
const T = 800
const BEZEL = 12 // tepi hitam di sekeliling layar
const SUDUT = 38 // radius sudut badan HP

const peramban = await chromium.launch()
const ctx = await peramban.newContext({ deviceScaleFactor: 2 })
const hal = await ctx.newPage()

let jadi = 0

try {
  for (const n of berkas) {
    const b64 = readFileSync(join(SUMBER, n)).toString('base64')
    const nama = n.replace(/^mobile-/, '').replace(/-kecil(-gelap)?\.png$/, '')

    /*
      Bingkai dirakit sebagai HTML lalu dipotret — bukan dengan pustaka
      pengolah gambar. Alasannya sederhana: Playwright sudah ada di repo
      ini, dan menambah `sharp`/`jimp` berarti satu dependensi biner lagi
      yang harus cocok dengan Node di tiap mesin.
    */
    await hal.setContent(`<!doctype html>
<html><head><meta charset="utf-8"><style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    width: ${L + BEZEL * 2 + 56}px;
    height: ${T + BEZEL * 2 + 56}px;
    display: grid; place-items: center;
    background: ${GELAP ? '#0C0E14' : '#EEF1F5'};
    font-family: system-ui, sans-serif;
  }
  .hp {
    position: relative;
    width: ${L + BEZEL * 2}px; height: ${T + BEZEL * 2}px;
    background: #0A0A0C;
    border-radius: ${SUDUT}px;
    padding: ${BEZEL}px;
    /* Dua lapis: bayangan jatuh + tepi logam tipis. */
    box-shadow:
      0 0 0 1.5px #2E3138,
      0 18px 44px rgba(0,0,0,${GELAP ? 0.6 : 0.28}),
      0 3px 10px rgba(0,0,0,${GELAP ? 0.5 : 0.16});
  }
  .layar {
    width: ${L}px; height: ${T}px;
    border-radius: ${SUDUT - BEZEL}px;
    overflow: hidden;
    display: block;
  }
  .layar img { width: 100%; height: 100%; display: block; }
  /* Punch-hole kamera — di ATAS layar, seperti HP sungguhan. */
  .kamera {
    position: absolute; top: ${BEZEL + 11}px; left: 50%;
    transform: translateX(-50%);
    width: 11px; height: 11px; border-radius: 50%;
    background: #08090B;
    box-shadow: inset 0 0 0 1px #23262C;
  }
  /* Tombol sisi kanan: daya (atas) + volume (bawah). */
  .tombol {
    position: absolute; left: 100%;
    width: 3px; background: #2E3138;
    border-radius: 0 2px 2px 0;
  }
  .daya   { top: 150px; height: 58px; }
  .volume { top: 232px; height: 92px; }
</style></head><body>
  <div class="hp">
    <div class="layar"><img src="data:image/png;base64,${b64}" alt=""></div>
    <div class="kamera"></div>
    <div class="tombol daya"></div>
    <div class="tombol volume"></div>
  </div>
</body></html>`)

    await hal.waitForTimeout(120)
    const keluar = `hp-${nama}${GELAP ? '-gelap' : ''}.png`
    await hal.locator('body').screenshot({ path: join(KELUAR, keluar) })
    jadi++
    console.log(`  ✓ ${keluar}`)
  }
} finally {
  await peramban.close()
}

console.log('')
console.log(`  dibingkai : ${jadi} dari ${berkas.length}`)
console.log(`  mode      : ${GELAP ? 'GELAP' : 'terang'}`)
console.log(`  keluaran  : ${KELUAR}`)

if (jadi < berkas.length) {
  console.error('')
  console.error(`❌ ${jadi} dari ${berkas.length} — sebagian gagal dibingkai.`)
  process.exit(1)
}

console.log('')
console.log('✅ Bingkai selesai.')
console.log('   Ini untuk DILIHAT, bukan diukur — yang mengukur `potret-mobile.mjs`.')
