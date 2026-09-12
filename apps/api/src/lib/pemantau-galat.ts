import * as Sentry from '@sentry/node'

/**
 * Pemantau galat produksi — Sentry SDK, tujuan bisa dipindah.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * KENAPA MODUL INI ADA
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Diukur 2026-09-12 di JOURNAL: **154 cacat "gagal senyap"** tercatat di
 * repo ini, dan sampai hari ini produksi tak punya satu pun pemantau.
 * Log JSON ke stdout, rotasi 30 MB, tanpa agregator — kalau API 500 di HP
 * mandor jam dua siang, tak seorang pun tahu sampai ada yang mengeluh.
 *
 * ── Kenapa BARU SEKARANG, bukan lebih awal
 *
 * Urutannya disengaja, dan itu bagian dari perbaikannya:
 *
 *   1. 48 peringatan/hari yang tak berarti DIBUANG lebih dulu (564e6cea) —
 *      healthcheck yang menembak halaman depan. Memasang pemantau di atas
 *      log berisik cuma memindahkan kebisingan.
 *   2. Galat 5xx diberi KONTEKS (889b7c5e) — correlationId, rute sebagai
 *      pola, user, tenant. Pemantau tanpa konteks cuma memberi tahu bahwa
 *      sesuatu rusak, bukan apa.
 *   3. Baru pemantaunya. Terukur sebelum dipasang: 78 info · 0 warn ·
 *      0 error dalam 24 jam. Baseline bersih, jadi notifikasi pertama
 *      yang datang nanti benar-benar berarti sesuatu.
 *
 * ── Kenapa SaaS dulu, bukan langsung self-host
 *
 * Diukur: 51.146 peristiwa audit dalam 30 hari, 43 pengguna aktif, 0 galat
 * 5xx hari ini. Bahkan pada laju galat 1%, itu ~500/bulan — jauh di bawah
 * kuota gratis 5.000/bulan.
 *
 * Self-host (GlitchTip) menuntut 3-4 container tambahan di VPS yang sudah
 * menjalankan sepuluh. Menambah beban operasi untuk nol galat hari ini
 * adalah biaya yang dibayar sebelum manfaatnya ada.
 *
 * ⚠ Dan pintu keluarnya sudah terbuka: GlitchTip menerima SDK Sentry yang
 * sama persis. Pindah = mengganti `SENTRY_DSN`, bukan menulis ulang.
 * Karena itu tak ada yang terkunci oleh keputusan ini.
 *
 * ── Kenapa DEFAULT MATI
 *
 * Tanpa `SENTRY_DSN`, modul ini tak melakukan apa-apa dan mengatakannya di
 * log start. Pengembangan lokal tak boleh mengirim galatnya ke pemantau
 * produksi — galat yang sengaja dibuat saat menguji akan terbaca sebagai
 * kejadian nyata, dan itu melatih orang mengabaikan notifikasi.
 */

/**
 * Ambang sampling jejak. NOL secara sengaja.
 *
 * Yang dibutuhkan di sini adalah GALAT, bukan performa. Tracing mengirim
 * satu peristiwa per REQUEST — pada 51.146 peristiwa/bulan itu akan
 * menghabiskan kuota gratis dalam hitungan hari, dan mengubur galat yang
 * sesungguhnya di antara ribuan jejak yang sehat.
 *
 * `08-observability-plan.md` sudah memutuskan tracing ditunda sampai ada
 * lebih dari satu service; keputusan itu tak diubah di sini.
 */
const SAMPEL_JEJAK = 0

let hidup = false

/**
 * Nyalakan pemantau. Aman dipanggil sekali saat start.
 *
 * Mengembalikan `false` bila tak dinyalakan — pemanggil mencetak hasilnya
 * supaya keadaan ini TERLIHAT di log start, bukan jadi ketiadaan yang sunyi.
 */
export function nyalakanPemantauGalat(log: {
  info: (o: unknown, m?: string) => void
}): boolean {
  const dsn = process.env.SENTRY_DSN?.trim()
  if (!dsn) {
    log.info({}, 'pemantau galat TIDAK aktif: SENTRY_DSN belum disetel')
    return false
  }
  if (hidup) return true

  Sentry.init({
    dsn,
    /*
      Memisahkan produksi dari pengembangan DI DASBOR. Tanpa ini, galat
      dari laptop bercampur dengan galat pengguna nyata, dan yang kedua
      tak bisa lagi dipercaya sebagai sinyal.
    */
    environment: process.env.NODE_ENV ?? 'development',
    /*
      Versi yang dipanggang saat build — sama dengan yang dilaporkan
      `/health`. Ini yang menjawab "galat ini muncul sejak deploy mana?"
      tanpa menebak dari tanggal.
    */
    release: process.env.GIT_COMMIT || undefined,
    tracesSampleRate: SAMPEL_JEJAK,

    /*
      ⚠ PENYARING DATA PRIBADI — dan ini bagian yang paling menentukan.

      Aplikasi ini multi-tenant dan memuat data keuangan perusahaan lain.
      Mengirim badan request mentah ke layanan pihak ketiga berarti
      nominal kontrak, nama klien, dan nomor telepon mandor keluar dari
      server ini tanpa seorang pun memutuskannya.

      `sendDefaultPii: false` adalah bawaan SDK, tetapi DINYATAKAN di sini
      supaya perubahannya harus disengaja — bukan berubah diam-diam saat
      seseorang menyalin konfigurasi dari contoh di internet.
    */
    sendDefaultPii: false,

    beforeSend(peristiwa) {
      /*
        Badan request DIBUANG seluruhnya, bukan disaring per-medan.

        Penyaring per-medan menuntut daftar nama yang lengkap, dan daftar
        seperti itu selalu tertinggal dari kolom baru. Yang tertinggal
        justru yang paling berbahaya: kolom yang baru ditambahkan belum
        pernah ditimbang siapa pun.

        Konteks yang dibutuhkan untuk menindaklanjuti sudah ada di tag —
        correlationId menghubungkannya ke `audit_logs`, dan di sanalah
        rinciannya tersimpan dengan aman di server sendiri.
      */
      if (peristiwa.request) {
        delete peristiwa.request.data
        delete peristiwa.request.cookies
        if (peristiwa.request.headers) {
          for (const k of ['authorization', 'cookie', 'x-scheduler-secret', 'x-api-key']) {
            delete peristiwa.request.headers[k]
          }
        }
      }
      return peristiwa
    },
  })

  hidup = true
  log.info(
    { environment: process.env.NODE_ENV ?? 'development', release: process.env.GIT_COMMIT ?? null },
    'pemantau galat aktif',
  )
  return true
}

/**
 * Laporkan satu galat 5xx beserta konteksnya.
 *
 * Dipanggil dari `setErrorHandler`, BERDAMPINGAN dengan `app.log.error` —
 * bukan menggantikannya. Log lokal tetap sumber kebenaran yang tak
 * bergantung pada layanan luar; pemantau adalah lapis kedua yang
 * memberitahu tanpa diminta.
 */
export function laporGalat(
  err: unknown,
  konteks: {
    correlationId?: string
    rute?: string
    metode?: string
    userId?: string
    companyId?: string
  },
): void {
  if (!hidup) return
  Sentry.withScope((lingkup) => {
    /*
      `rute` jadi TAG, bukan sekadar data tambahan: tag bisa dipakai
      mengelompokkan dan menyaring di dasbor. Tanpa itu, seribu galat dari
      satu rute terlihat seperti seribu masalah berbeda.
    */
    if (konteks.rute) lingkup.setTag('rute', konteks.rute)
    if (konteks.metode) lingkup.setTag('metode', konteks.metode)
    /*
      `companyId` jadi tag supaya pertanyaan "ini menimpa satu tenant atau
      semuanya?" bisa dijawab dari dasbor. Itu pertanyaan pertama yang
      menentukan seberapa mendesak sebuah galat.
    */
    if (konteks.companyId) lingkup.setTag('tenant', konteks.companyId)
    if (konteks.correlationId) {
      lingkup.setTag('correlationId', konteks.correlationId)
      /* Jembatan ke `audit_logs.correlation_id` — rinciannya ada di sana. */
      lingkup.setContext('jejak', { correlationId: konteks.correlationId })
    }
    /*
      Hanya ID penggunanya, bukan nama/email. Yang dibutuhkan untuk
      menindaklanjuti adalah "berapa orang terdampak" dan "siapa yang
      bisa dihubungi" — yang kedua dijawab dari basis sendiri, bukan
      dari dasbor pihak ketiga.
    */
    if (konteks.userId) lingkup.setUser({ id: konteks.userId })
    Sentry.captureException(err)
  })
}
