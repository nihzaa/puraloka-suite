#!/usr/bin/env node
/**
 * Memotret layar mobile — di lebar HP sungguhan, terang DAN gelap.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * KENAPA SKRIP INI ADA
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Diukur 2026-09-04: **nol** skrip potret untuk mobile.
 *
 * Web punya `potret-portal-adaptif.mjs`, dan ia terbukti menemukan cacat
 * yang tak satu pun test tangkap — bar progres tak terlihat, menu salah
 * susun, kartu KPI yang terbaca seperti gagal muat. Semua itu lolos `tsc`,
 * lolos 1.028 test, dan lolos seluruh penjaga.
 *
 * Mobile buta terhadap kelas cacat yang sama. Penjaga yang ada
 * (`audit-kontras-mobile`, `audit-a11y-mobile`) memeriksa KEPUTUSAN DI
 * KODE — mereka tak tahu apa-apa soal tata letak yang berdesakan, teks
 * terpotong, atau warna yang hilang di mode gelap.
 *
 * ── Kenapa lewat `expo start --web`, bukan emulator
 *
 * Emulator Android butuh Android Studio, ~8 GB, dan tak ada di mesin ini.
 * `react-native-web` merender komponen React Native yang SAMA lewat DOM,
 * jadi Playwright bisa memotretnya.
 *
 * ⚠ Yang ia BUKTIKAN dan tidak. Ia membuktikan tata letak, warna,
 * tipografi, dan hierarki visual. Ia TIDAK membuktikan perilaku native —
 * gestur, haptik, perilaku papan ketik, atau bagaimana `SafeAreaView`
 * berperilaku di sekitar notch sungguhan. Untuk itu tetap butuh perangkat.
 *
 * Batas itu disebutkan supaya potret yang bagus tak dibaca sebagai
 * "mobile sudah beres".
 *
 * ── ⚠ SATU ARTEFAK YANG SUDAH MEMAKAN WAKTU: label bilah tab terpotong
 *
 * Pada potret mana pun dari skrip ini, label bilah tab ("Beranda",
 * "Proyek", …) tampak TERPOTONG di tengah huruf. Itu artefak
 * `react-native-web`, BUKAN cacat aplikasi.
 *
 * Ditelusuri sampai sumbernya (2026-09-04):
 *
 *     node_modules/react-native-web/dist/exports/Text/index.js
 *     styles.textOneLine = { overflow: 'hidden', whiteSpace: 'nowrap', … }
 *
 * Bilah tab expo-router menyetel `numberOfLines={1}` pada labelnya. Di web
 * itu memakai `textOneLine`, dan elemennya berakhir dengan
 * `height: 5px; overflow: hidden` untuk teks 11px — terukur di DOM. Di
 * React Native sungguhan `numberOfLines` hanya membatasi JUMLAH BARIS; ia
 * tak memotong tinggi.
 *
 * Yang sudah DICOBA dan tidak menolong, supaya tak diulang:
 *
 *     tinggi bilah 44 → 58px      label tetap 5px
 *     `lineHeight: 14` eksplisit  diterapkan (terlihat di inline style),
 *                                 label tetap 5px
 *
 * Aturan yang berlaku di sini sama seperti "nol hasil bukan bukti
 * ketiadaan": **cacat yang hanya muncul di alat ukur bukan cacat produk.**
 * Sebelum memperbaiki apa pun yang terlihat di potret, tanyakan dulu apakah
 * ia juga ada di APK sungguhan.
 *
 * ── Lebar yang dipotret
 *
 *     360×800   Android kelas menengah — yang paling banyak dipakai mandor
 *     430×932   iPhone Pro Max — batas atas, tempat teks jadi kesepian
 *
 * 360 dipilih, bukan 375: HP mandor di lapangan bukan iPhone.
 *
 *     UJI_BASIS=http://localhost:8081 node apps/mobile/scripts/potret-mobile.mjs
 *     … --gelap
 */
import { chromium } from '@playwright/test'
import { mkdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const BASIS = process.env.UJI_BASIS ?? 'http://localhost:8081'
const GELAP = process.argv.includes('--gelap')
const EMAIL = process.env.LAYAR_EMAIL
const SANDI = process.env.LAYAR_SANDI

if (!EMAIL || !SANDI) {
  console.error('❌ LAYAR_EMAIL / LAYAR_SANDI kosong — tak ada yang bisa dipotret.')
  console.error('   Keduanya ada di apps/web/.env.local (ter-gitignore).')
  process.exit(2)
}

const KELUAR = join(dirname(dirname(fileURLToPath(import.meta.url))), '.layar')
mkdirSync(KELUAR, { recursive: true })

/**
 * Layar yang dipotret.
 *
 * Sengaja yang paling PADAT isinya — tata letak yang tahan layar kosong
 * belum tentu tahan layar penuh, dan justru layar penuh yang dilihat
 * mandor tiap hari.
 */
const LAYAR = [
  ['dashboard', '/dashboard'],
  ['pekerjaan', '/pekerjaan'],
  ['proyek', '/proyek'],
  ['kasbon', '/kasbon'],
  ['lainnya', '/lainnya'],
]

/** Dua lebar yang mewakili sisi berlawanan dari rentang HP nyata. */
const LEBAR = [
  ['kecil', 360, 800],
  ['besar', 430, 932],
]

const peramban = await chromium.launch()
const masalah = []
let dipotret = 0

try {
  for (const [namaLebar, w, h] of LEBAR) {
    const ctx = await peramban.newContext({
      viewport: { width: w, height: h },
      colorScheme: GELAP ? 'dark' : 'light',
      deviceScaleFactor: 2,
      isMobile: true,
      hasTouch: true,
    })
    const hal = await ctx.newPage()

    /*
      Galat JS dikumpulkan. React Native Web sering gagal DIAM pada
      komponen yang tak punya padanan DOM — layarnya kosong, dan potret
      yang kosong terbaca seperti "halaman memang sederhana".
    */
    const galatJs = []
    hal.on('pageerror', (e) => galatJs.push(String(e.message).slice(0, 120)))

    await hal.goto(`${BASIS}/login`, { waitUntil: 'networkidle', timeout: 60_000 }).catch(() => {})
    await hal.waitForTimeout(2500)

    // Isian login — RN Web merender TextInput sebagai <input>.
    const isian = hal.locator('input')
    if ((await isian.count()) >= 2) {
      await isian.nth(0).fill(EMAIL)
      await isian.nth(1).fill(SANDI)
      /*
        ⚠ Tombolnya DITEKAN, bukan Enter.

        Versi pertama memakai `keyboard.press('Enter')` — kebiasaan dari
        skrip potret web, tempat isian hidup di dalam `<form>` dan Enter
        mengirimkannya.

        React Native tak punya form. `TextInput` yang dirender
        `react-native-web` adalah `<input>` telanjang, dan Enter di atasnya
        tak memicu apa pun: nol permintaan jaringan, nol galat, nol
        peringatan konsol. Layar tetap di /login, dan satu-satunya bedanya
        dengan "sandi salah" adalah tak ada pesan galat yang muncul.

        Terukur saat mendiagnosisnya: pageerror 0, requestfailed 0,
        localStorage kosong. Semua alat menjawab "tak ada yang salah",
        karena memang tak ada yang salah — cuma tak ada yang terjadi.
      */
      await hal.getByText('Masuk', { exact: true }).last().click()
      await hal.waitForTimeout(5000)
    } else {
      masalah.push(`@${namaLebar}: isian login tak ditemukan (${await isian.count()} input)`)
    }

    /*
      ── Login WAJIB dibuktikan, bukan diasumsikan ─────────────────────────

      Versi pertama skrip ini melapor:

          ✅ Semua layar terisi, nol gulir mendatar, nol teks di bawah 12px.

      atas SEPULUH potret layar login yang sama. Ketiga pengukuran lulus
      dengan mulus — layar login memang berisi teks (78 huruf), memang tak
      menggulir mendatar, dan memang tak punya teks di bawah 12px.

      Sebabnya CORS (`X-Client` tak terdaftar di `allowedHeaders`), tetapi
      itu bukan intinya. Intinya: **alat ukurnya tak bisa membedakan "layar
      sehat" dari "layar login"**, jadi ia akan hijau lagi untuk sebab
      berikutnya — sandi kedaluwarsa, akun dinonaktifkan, API mati.

      Kelas kesalahan yang sama dengan pemantau EAS di CLAUDE.md §7: nilai
      jatuhan yang terbaca seperti keadaan normal. Dan lebih mahal, karena
      di sini yang salah bukan sekadar diam — ia MELAPOR LULUS.

      Buktinya dua arah, sengaja:
        1. isian sandi HILANG  — kalau masih ada, kita masih di /login
        2. ada jejak sesi      — token tersimpan; halaman yang kebetulan
                                 tanpa <input> tak boleh lolos sebagai login
    */
    const masihDiLogin = await hal.locator('input[type="password"]').count()
    const punyaToken = await hal.evaluate(() => {
      try {
        return Object.keys(localStorage).some((k) => /token|puraloka/i.test(k))
      } catch {
        return false
      }
    })

    if (masihDiLogin > 0 || !punyaToken) {
      const cuplikan = (await hal.evaluate(() => document.body.innerText ?? ''))
        .trim().replace(/\s+/g, ' ').slice(0, 100)
      masalah.push(
        `@${namaLebar}: LOGIN GAGAL — sandi=${masihDiLogin} token=${punyaToken}. ` +
          `Layar: "${cuplikan}"`
      )
      if (galatJs.length) masalah.push(`@${namaLebar}: galat JS — ${galatJs[0]}`)
      /*
        Keluar dari lebar ini tanpa memotret. Potret layar login BUKAN
        potret aplikasi, dan menyimpannya membuat berkasnya terbaca
        seperti bukti.
      */
      await ctx.close()
      continue
    }

    for (const [nama, jalur] of LAYAR) {
      try {
        await hal.goto(`${BASIS}${jalur}`, { waitUntil: 'networkidle', timeout: 45_000 })
        await hal.waitForTimeout(2000)

        const berkas = `mobile-${nama}-${namaLebar}${GELAP ? '-gelap' : ''}.png`
        await hal.screenshot({ path: join(KELUAR, berkas) })
        dipotret++

        /*
          ── Pengukuran, bukan sekadar potret ─────────────────────────────

          Potret yang tersimpan hanya membuktikan peramban tak jatuh. Tiga
          hal di bawah punya JAWABAN BENAR, jadi diperiksa otomatis:
        */
        const ukur = await hal.evaluate(() => {
          const b = document.body
          return {
            // Isi harus ADA. Layar kosong = komponen gagal render.
            panjangTeks: (b.innerText ?? '').trim().length,
            // Tak boleh menggulir MENDATAR — tanda tata letak melebihi layar.
            lebarGulir: b.scrollWidth,
            lebarLayar: window.innerWidth,
            /*
              Teks di bawah 12px tak terbaca di bawah matahari — dan layar
              ini dibuka di lokasi proyek.

              ⚠ Label BILAH TAB dikecualikan, dan alasannya bukan kelonggaran.

              Bilah tab expo-router menyetel `numberOfLines={1}` pada
              labelnya; di web itu memakai `styles.textOneLine` milik
              react-native-web (`overflow: hidden`), dan elemennya berakhir
              5px. Ukuran 11px di sana adalah keputusan yang DIHITUNG —
              delapan tab pada layar 360px memberi ~45px per tab, dan 12px
              membuat "Beranda" dan "Lainnya" melebihi lebarnya.

              Tanpa pengecualian ini, delapan pelanggaran abadi akan muncul
              di tiap jalan. Penjaga yang selalu merah untuk hal yang benar
              mengajari orang mengabaikan keluarannya — dan kegagalan
              sungguhan berikutnya ikut terabaikan.

              Dikecualikan lewat POSISI, bukan lewat teksnya: label tab
              adalah yang berada di dalam 70px terbawah viewport. Menyaring
              lewat daftar nama ("Beranda", "Proyek", …) akan basi diam-diam
              begitu ada tab baru — kelas kesalahan yang sama dengan
              menyaring grup menu lewat nama (CLAUDE.md §8a.2).
            */
            terlaluKecil: [...document.querySelectorAll('*')].filter((el) => {
              const t = el.textContent?.trim()
              if (!t || el.children.length > 0) return false
              const fs = parseFloat(getComputedStyle(el).fontSize)
              if (!(fs > 0 && fs < 12)) return false
              const kotak = el.getBoundingClientRect()
              const diBilahTab = kotak.top >= window.innerHeight - 70
              return !diBilahTab
            }).length,
          }
        })

        if (ukur.panjangTeks < 20) {
          masalah.push(`${nama} @${namaLebar}: layar nyaris kosong (${ukur.panjangTeks} huruf)`)
        }
        if (ukur.lebarGulir > ukur.lebarLayar + 1) {
          masalah.push(`${nama} @${namaLebar}: menggulir MENDATAR (${ukur.lebarGulir} > ${ukur.lebarLayar}px)`)
        }
        if (ukur.terlaluKecil > 0) {
          masalah.push(`${nama} @${namaLebar}: ${ukur.terlaluKecil} teks di bawah 12px`)
        }

        console.log(
          `  ${namaLebar.padEnd(6)} ${nama.padEnd(12)} teks=${String(ukur.panjangTeks).padStart(5)} ` +
            `lebar=${ukur.lebarGulir}/${ukur.lebarLayar} kecil=${ukur.terlaluKecil}`
        )
      } catch (e) {
        masalah.push(`${nama} @${namaLebar}: ${String(e.message).split('\n')[0].slice(0, 80)}`)
      }
    }

    if (galatJs.length > 0) {
      const unik = [...new Set(galatJs)]
      masalah.push(`@${namaLebar}: ${unik.length} galat JS — ${unik[0]}`)
    }

    await ctx.close()
  }
} finally {
  await peramban.close()
}

console.log('')
console.log(`  potret tersimpan : ${dipotret} → ${KELUAR}`)
console.log(`  mode             : ${GELAP ? 'GELAP' : 'terang'}`)

/*
  ⚠ `masalah` dicetak SEBELUM keluar, termasuk saat nol potret.

  Versi pertama skrip potret WEB keluar lebih dulu dengan exit(2) dan tak
  pernah mencetak sebabnya — justru pada keadaan yang paling butuh
  penjelasan. Kesalahan yang sama tak diulang di sini.
*/
if (masalah.length) {
  console.error('')
  console.error(`❌ ${masalah.length} masalah:`)
  for (const m of masalah) console.error('     · ' + m)
}

/*
  ⚠ Jumlah potret dibandingkan dengan HARAPAN, bukan dengan nol.

  `dipotret === 0` menolak keadaan terburuk saja. Kalau satu lebar login
  dan satu gagal, angkanya jadi 5 — dan "5 potret tersimpan" terbaca
  seperti keberhasilan, padahal separuh alat ukurnya buta.

  Cakupan wajib disebut bersama angkanya (CLAUDE.md §8a.2): 5 dari 10
  bukan "5 potret", ia "separuh matriks hilang".
*/
const DIHARAPKAN = LAYAR.length * LEBAR.length

if (dipotret === 0) {
  console.error('')
  console.error('❌ NOL potret — tak ada yang teruji. Ini BUKAN kelulusan.')
  console.error('   Pastikan `pnpm --filter @puraloka/mobile web` hidup di 8081.')
  process.exit(2)
}

if (dipotret < DIHARAPKAN) {
  console.error('')
  console.error(`❌ ${dipotret} dari ${DIHARAPKAN} potret — matriksnya tak lengkap.`)
  console.error('   Angka parsial bukan kelulusan parsial: layar yang tak terpotret')
  console.error('   tak diuji sama sekali, dan diamnya terbaca seperti lulus.')
  process.exit(1)
}

if (masalah.length) process.exit(1)

console.log('')
console.log('✅ Semua layar terisi, nol gulir mendatar, nol teks di bawah 12px.')
console.log('   Batas: ini menguji TATA LETAK, bukan perilaku native (gestur,')
console.log('   haptik, papan ketik, notch). Untuk itu tetap butuh perangkat.')
