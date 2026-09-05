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
  /*
    Ditambahkan 2026-09-04. Ia terlewat pada daftar pertama, dan itu
    kelalaian yang mahal: layar ini memuat tombol "Setujui"/"Tolak" yang
    mengeksekusi approval kasbon lewat mesin berjenjang — satu-satunya
    layar mobile yang memutuskan UANG.

    Layar yang paling berisiko justru yang paling tak pernah dilihat.
  */
  ['notifikasi', '/notifications'],
  /*
    Ditambahkan 2026-09-04, dan alasannya sama dengan `/notifications`:
    layar yang tak pernah dipotret adalah layar yang tak seorang pun
    pernah lihat.

    Terukur sebelum diperbaiki, layar ini merender **114 karakter** —
    judul "Mandor" plus label bilah tab. Nol isi, tiga cacat menumpuk,
    dan pesan kosongnya ("Belum ada data mandor") terbaca seperti keadaan
    yang wajar.
  */
  ['mandor', '/mandor'],
  ['lainnya', '/lainnya'],

  /*
    ── Layar TULIS ─────────────────────────────────────────────────────

    Ditambahkan 2026-09-05. Kelima layar ini tak pernah dipotret sama
    sekali, dan justru inilah yang dipakai mandor di lapangan — layar
    baca hanya menampilkan hasilnya.

    Sengaja dipotret dalam keadaan KOSONG (belum diisi). Itu keadaan yang
    dilihat pertama kali, dan tempat cacat paling mahal muncul: label yang
    tak terbaca, chip pilihan yang berdesakan, tombol simpan yang terlihat
    hidup padahal isian wajib masih kosong.

    ⚠ NOL kiriman dibuat. Skrip ini memotret, bukan mengisi — satu
    pengisian yang terkirim berarti satu NCR atau izin kerja palsu di
    basis produksi, dan itu tak bisa ditarik dari sini.
  */
  ['ncr-lapor', '/ncr/lapor'],
  ['punch-lapor', '/punch/lapor'],
  ['izin-ajukan', '/izin-kerja/ajukan'],
  ['kasbon-ajukan', '/kasbon/ajukan'],
  ['absensi-input', '/absensi/input'],
]

/**
 * Layar berparameter `[id]` — jalurnya dirakit dari data NYATA.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * KENAPA INI TERPISAH, DAN KENAPA ID-NYA DICARI
 * ══════════════════════════════════════════════════════════════════════════
 *
 * `/proyek/[id]` adalah layar terkaya di aplikasi — tiga tab, RAB
 * berhierarki, milestone, log progres. Ia juga yang paling lama tak pernah
 * dipotret, karena butuh id yang sah.
 *
 * ⚠ Dan id yang ASAL bukan pengganti yang sah. Diukur 2026-09-05: 20 proyek
 * di basis, tetapi hanya DUA yang punya RAB, dan yang terkaya punya **287
 * baris**. Memotret proyek pertama yang kebetulan muncul menghasilkan layar
 * kosong yang lulus semua pengukuran — "berisi teks, tak menggulir
 * mendatar, tak ada teks kecil" — sementara tab RAB-nya tak pernah teruji.
 *
 * Yang dicari: proyek dengan isi TERBANYAK. Bukan supaya potretnya bagus,
 * melainkan supaya kelas cacat yang hanya muncul pada data padat (hierarki
 * dalam, teks panjang, angka besar) benar-benar ikut terpotret.
 *
 * Kalau pencariannya gagal, layar ini DILEWATI dengan pesan — bukan
 * dipotret dengan id karangan. Potret dari id yang tak ada adalah layar
 * galat yang terbaca seperti layar sah.
 */
const LAYAR_BERPARAM = [['proyek-detail', (id) => `/proyek/${id}`]]

/**
 * Layar SEBELUM login — konteks yang berbeda, jadi jalur yang berbeda.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * KENAPA TAK BISA IKUT MATRIKS UTAMA
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Matriks di atas berjalan SESUDAH login berhasil — itu justru syarat yang
 * membuatnya bermakna (potret sepuluh layar login pernah dilaporkan hijau
 * sebelum syarat itu ada).
 *
 * Perkenalan dan login hidup di sisi lain syarat itu. Memotretnya butuh
 * konteks yang BELUM login, dan penyimpanan yang bersih — perkenalan hanya
 * muncul sekali seumur pemasangan, jadi konteks bekas login sebelumnya
 * akan melewatinya.
 *
 * ⚠ Ditambahkan 2026-09-05, dan keterlambatannya sendiri layak dicatat:
 * keduanya BARU DIBANGUN hari itu dan tetap tak masuk daftar potret.
 * Pelajaran "layar yang tak dipotret adalah layar yang tak seorang pun
 * lihat" sudah ditulis di berkas ini untuk `/notifications` dan `/mandor`,
 * dan tetap terulang.
 */
const LAYAR_PRA_LOGIN = [
  ['kenalan', '/kenalan', { bersihkanPenyimpanan: true }],
  ['login', '/login', { lewatiKenalan: true }],
]

/** Dua lebar yang mewakili sisi berlawanan dari rentang HP nyata. */
const LEBAR = [
  ['kecil', 360, 800],
  ['besar', 430, 932],
]

const peramban = await chromium.launch()

/*
  ── Bundel DIPANASKAN dulu, sebelum matriks dimulai ─────────────────────

  ⚠ Ini memperbaiki kegagalan yang MENUDUH hal yang salah, dua kali.

  Gejalanya: "LOGIN GAGAL @kecil" sementara @besar lolos — dan @kecil
  selalu yang pertama dijalankan. Terbaca persis seperti cacat yang
  bergantung LEBAR LAYAR, dan pertama kali saya mengejarnya ke arah itu.

  Sebab sesungguhnya: Metro membundel ulang setiap kali kode berubah, dan
  bundel pertama sesudah perubahan bisa memakan belasan detik. Konteks
  peramban PERTAMA yang menyentuhnya menanggung seluruh biaya itu; yang
  kedua mendapat bundel yang sudah hangat.

  Terbukti: jalan pertama 6/12 potret, jalan KEDUA tanpa perubahan apa pun
  12/12. Alat ukur yang hasilnya bergantung pada "sudah pernah dijalankan
  atau belum" tak bisa dipercaya untuk keduanya.

  Menunggu isian sandi terlihat (di bawah) TIDAK cukup: isian muncul
  sebelum modul yang menangani penekanan tombol selesai dimuat.

  Pemanasan ini memuat halaman sekali dan membuangnya. Biayanya beberapa
  detik pada jalan pertama, dan nol pada jalan berikutnya.
*/
{
  const ctxPanas = await peramban.newContext({ viewport: { width: 360, height: 800 } })
  const halPanas = await ctxPanas.newPage()
  await halPanas
    .goto(`${BASIS}/login`, { waitUntil: 'networkidle', timeout: 120_000 })
    .catch(() => {})
  await halPanas
    .locator('input')
    .nth(1)
    .waitFor({ state: 'visible', timeout: 60_000 })
    .catch(() => {})
  await ctxPanas.close()
}
const masalah = []

/*
  ── Layar PRA-LOGIN, dipotret lebih dulu ────────────────────────────────

  Konteks sendiri per layar, dan penyimpanan dibersihkan untuk perkenalan:
  ia muncul sekali seumur pemasangan, jadi konteks bekas akan melewatinya
  dan menghasilkan potret layar login dengan nama berkas "kenalan" —
  potret yang salah dengan nama yang meyakinkan.
*/
async function potretPraLogin(namaLebar, w, h) {
  for (const [nama, jalur, opsi] of LAYAR_PRA_LOGIN) {
    const ctx = await peramban.newContext({
      viewport: { width: w, height: h },
      colorScheme: GELAP ? 'dark' : 'light',
      deviceScaleFactor: 2,
      isMobile: true,
      hasTouch: true,
    })
    const hal = await ctx.newPage()
    try {
      await hal.goto(`${BASIS}${jalur}`, { waitUntil: 'networkidle', timeout: 60_000 })
      await hal.waitForTimeout(3500)

      /*
        Untuk layar LOGIN: perkenalan dilewati dulu lewat tombolnya, bukan
        dengan menulis penanda ke penyimpanan.

        Menulis penandanya langsung akan melewati jalur yang sesungguhnya
        dipakai orang — dan jalur itu punya cacat yang baru saja ditemukan
        (guard memantulkan kembali ke perkenalan). Menekan tombolnya
        membuat potret ini ikut menguji alurnya.
      */
      if (opsi?.lewatiKenalan) {
        const lewati = hal.getByText('Lewati', { exact: true })
        if (await lewati.count()) {
          await lewati.click()
          await hal.waitForTimeout(3000)
        }
        if (!hal.url().includes('/login')) {
          masalah.push(
            `${nama} @${namaLebar}: "Lewati" tak sampai ke /login (${hal.url()}) — ` +
              'alur perkenalan→login putus'
          )
          await ctx.close()
          continue
        }
      }

      const berkas = `mobile-${nama}-${namaLebar}${GELAP ? '-gelap' : ''}.png`
      await hal.screenshot({ path: join(KELUAR, berkas) })
      dipotret++

      const ukur = await hal.evaluate(() => ({
        panjangTeks: (document.body.innerText ?? '').trim().length,
        lebarGulir: document.body.scrollWidth,
        lebarLayar: window.innerWidth,
      }))
      if (ukur.panjangTeks < 20) {
        masalah.push(`${nama} @${namaLebar}: layar nyaris kosong (${ukur.panjangTeks} huruf)`)
      }
      if (ukur.lebarGulir > ukur.lebarLayar + 1) {
        masalah.push(
          `${nama} @${namaLebar}: menggulir MENDATAR (${ukur.lebarGulir} > ${ukur.lebarLayar}px)`
        )
      }
      console.log(
        `  ${namaLebar.padEnd(6)} ${nama.padEnd(12)} teks=${String(ukur.panjangTeks).padStart(5)} ` +
          `lebar=${ukur.lebarGulir}/${ukur.lebarLayar}  (pra-login)`
      )
    } catch (e) {
      masalah.push(`${nama} @${namaLebar}: ${String(e.message).split('\n')[0].slice(0, 80)}`)
    } finally {
      await ctx.close()
    }
  }
}
let dipotret = 0

try {
  for (const [namaLebar, w, h] of LEBAR) {
    /*
      Pra-login lebih dulu, di konteksnya sendiri — dan SEBELUM konteks
      utama login. Konteks yang sudah login tak bisa memotret layar
      perkenalan sama sekali: guard-nya langsung mengalihkan ke dashboard.
    */
    await potretPraLogin(namaLebar, w, h)

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

    /*
      ── Perkenalan dilewati dulu ────────────────────────────────────────

      Ditambahkan 2026-09-05 bersama layar perkenalan itu sendiri, dan
      keterlambatannya langsung terlihat: matriks utama gagal dengan
      "isian login tak ditemukan (0 input)" — konteks baru mendarat di
      perkenalan, bukan login, karena penyimpanannya bersih.

      Gejalanya menuduh LAYAR LOGIN ("isiannya hilang"), padahal layar
      login tak pernah dibuka. Bentuk yang sama dengan yang berulang di
      berkas ini: pesan yang benar tentang hal yang salah.

      Dilewati lewat TOMBOLNYA, bukan dengan menulis penanda ke
      penyimpanan — jalur yang sesungguhnya dipakai orang, dan jalur itu
      punya cacat yang baru ditemukan hari ini (guard memantulkan kembali
      ke perkenalan). Menekan tombolnya membuat matriks ini ikut
      menjaganya.
    */
    const lewatiKenalan = hal.getByText('Lewati', { exact: true })
    if (await lewatiKenalan.count().catch(() => 0)) {
      await lewatiKenalan.click().catch(() => {})
      await hal.waitForTimeout(3000)
    }

    /*
      ⚠ MENUNGGU KEADAAN, bukan durasi.

      Versi sebelumnya `waitForTimeout(2500)` dan itu MENIPU dengan cara
      yang paling mahal: lebar `kecil` dijalankan lebih dulu, saat Metro
      baru selesai membundel, jadi halamannya lebih lambat siap daripada
      lebar `besar` yang menyusul. Hasilnya "LOGIN GAGAL @kecil" sementara
      @besar lolos — terbaca persis seperti cacat yang bergantung LEBAR
      LAYAR, dan sempat saya kejar ke arah itu.

      Diukur terpisah, keduanya identik: 2 input, tombol ada. Yang berbeda
      cuma momennya.

      Menunggu isian benar-benar ada menghapus balapan itu sekaligus
      memberi diagnosis yang jujur bila memang tak pernah muncul.
    */
    await hal
      .locator('input')
      .nth(1)
      .waitFor({ state: 'visible', timeout: 30_000 })
      .catch(() => {})
    await hal.waitForTimeout(600)

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

    /*
      Id proyek TERKAYA dicari lewat aplikasi yang sudah login — bukan
      lewat curl terpisah dengan token sendiri.

      Alasannya: token yang dipakai peramban dan token yang dipakai skrip
      bisa milik pengguna berbeda, dan proyek yang terlihat oleh satu belum
      tentu terlihat oleh yang lain (RLS per-tenant). Id yang sah bagi
      skrip lalu menghasilkan layar "tidak ditemukan" di peramban — potret
      yang lulus semua pengukuran atas layar galat.

      `fetch` dijalankan DI DALAM halaman, memakai sesi yang sama persis
      dengan yang memotret.
    */
    let idProyek = null
    if (LAYAR_BERPARAM.length > 0) {
      idProyek = await hal
        .evaluate(async (basisApi) => {
          try {
            /*
              ⚠ Token dari `localStorage`, BUKAN `credentials: 'include'`.

              Versi pertama memakai cookie, dan pencariannya gagal untuk
              KEDUA lebar — aplikasi mobile tak pernah memakai cookie:
              `lib/api.ts:58` membaca `puraloka_token` dari penyimpanan
              lalu mengirimnya sebagai header `Authorization`. Itu justru
              seluruh alasan header `X-Client` ada.

              Kegagalannya tertangkap dua alat sekaligus (pesan `masalah`
              dan hitungan 14 dari 16), dan itu yang membedakannya dari
              "hijau atas layar yang tak pernah dibuka".
            */
            let token = null
            try {
              for (const k of Object.keys(localStorage)) {
                if (/puraloka_token/.test(k)) {
                  token = localStorage.getItem(k)
                  break
                }
              }
            } catch {
              token = null
            }
            if (!token) return null

            const ambil = (u) =>
              fetch(u, {
                headers: { Authorization: `Bearer ${token}`, 'X-Client': 'mobile' },
              }).then((r) => (r.ok ? r.json() : null))
            const daftar = await ambil(`${basisApi}/api/v1/projects`)
            const proyek = daftar?.projects ?? []
            if (proyek.length === 0) return null

            /* Yang paling padat isinya, bukan yang pertama. */
            let terbaik = null
            let skorTerbaik = -1
            for (const p of proyek.slice(0, 25)) {
              const rab = await ambil(`${basisApi}/api/v1/projects/${p.id}/rab`)
              const skor = rab?.data?.length ?? 0
              if (skor > skorTerbaik) {
                skorTerbaik = skor
                terbaik = p.id
              }
            }
            return skorTerbaik > 0 ? terbaik : proyek[0].id
          } catch {
            return null
          }
        }, process.env.EXPO_PUBLIC_API_URL ?? 'https://api.puraloka-suite.duckdns.org')
        .catch(() => null)

      if (!idProyek) {
        masalah.push(
          `@${namaLebar}: id proyek tak ditemukan — layar berparameter DILEWATI. ` +
            'Ini bukan kelulusan: layar terkaya di aplikasi tak teruji.'
        )
      }
    }

    const semuaLayar = [
      ...LAYAR,
      ...(idProyek ? LAYAR_BERPARAM.map(([n, f]) => [n, f(idProyek)]) : []),
    ]

    for (const [nama, jalur] of semuaLayar) {
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
            /*
              ── LAYAR YANG CRASH, dan kenapa ia lolos semua pengukuran ──

              Diukur 2026-09-04: `/notifications` CRASH dengan "Rendered
              more hooks than during the previous render" (hook di bawah
              early-return), dan skrip ini melapor:

                  ✅ Semua layar terisi, nol gulir mendatar,
                     nol teks di bawah 12px.

              Ketiga pengukuran BENAR untuk dirinya sendiri: overlay galat
              React berisi banyak teks (stack trace), tak menggulir
              mendatar, dan tak punya teks di bawah 12px.

              `pageerror` tak menangkapnya juga — React menangkap galat
              render di error boundary miliknya sendiri, jadi ia tak pernah
              sampai ke `window.onerror`.

              Yang ditangkap sekarang: teks khas overlay LogBox/RedBox
              Expo. Dicocokkan dengan `includes` pada 400 huruf pertama —
              overlay selalu menaruh judulnya di paling atas.

              ⚠ Batasnya jujur: ini pengenalan lewat TEKS, jadi ia bisa
              basi bila Expo mengubah kalimatnya. Tapi diam sama sekali
              lebih buruk — layar yang tak bisa dibuka dilaporkan sebagai
              lulus.
            */
            crash: (() => {
              const awal = (document.body.innerText ?? '').slice(0, 400)
              const penanda = [
                'Uncaught Error',
                'Unhandled JS Exception',
                'Render Error',
                'Console Error',
                'Rendered more hooks',
                'Element type is invalid',
              ]
              const cocok = penanda.find((p) => awal.includes(p))
              return cocok ? awal.replace(/\s+/g, ' ').slice(0, 120) : null
            })(),
          }
        })

        /*
          Crash diperiksa PERTAMA: layar yang tak bisa dibuka membuat
          seluruh pengukuran lain tak bermakna, dan melaporkannya bersama
          "8 teks di bawah 12px" menyamarkan mana yang penting.
        */
        if (ukur.crash) {
          masalah.push(`${nama} @${namaLebar}: LAYAR CRASH — ${ukur.crash}`)
        }
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
/*
  Layar berparameter IKUT dihitung.

  Kalau tidak, kegagalan mencari id proyek membuat matriks kurang dua
  potret sementara `dipotret === DIHARAPKAN` tetap terpenuhi — dan layar
  terkaya di aplikasi lolos tanpa teruji, dengan laporan hijau.

  Kegagalannya sudah dicatat sebagai `masalah` di atas, tapi angka yang
  konsisten adalah lapis kedua: dua alat yang menunjuk hal yang sama lebih
  sulit dilewati daripada satu.
*/
const DIHARAPKAN =
  (LAYAR.length + LAYAR_BERPARAM.length + LAYAR_PRA_LOGIN.length) * LEBAR.length

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
