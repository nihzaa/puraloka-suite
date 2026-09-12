/**
 * Denyut penjadwal DI DALAM container — bukan dari GitHub Actions.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * KENAPA BERKAS INI ADA
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Diukur 2026-09-12, saat menelusuri kenapa 125 dari 197 tugas terjadwal
 * berstatus `gagal`:
 *
 *     tugas aktif                197
 *       terakhir SUKSES           72   jalan 11-12 Sep
 *       terakhir GAGAL           125   jalan 1-7 Sep, lalu DIAM
 *
 * Galat pada yang 125 itu BASI ("Akun Anda dinonaktifkan") — akunnya sudah
 * dihidupkan migrasi 568 pada 11 Sep. Yang sebenarnya terjadi lebih buruk
 * daripada gagal: **mereka tak pernah dicoba lagi**.
 *
 * Sebabnya bukan di aplikasi. `.github/workflows/jadwal-tugas.yml` memasang
 * `cron: '*​/15 * * * *'`, dan itu memang niatnya. Kenyataannya, diukur dari
 * 30 jalan terakhir lewat `gh run list`:
 *
 *     jarak antar-denyut seharusnya   15 menit
 *     jarak NYATA rata-rata          209 menit
 *     jarak TERPANJANG               323 menit
 *
 * Cron GitHub Actions adalah *best effort*, dan pada repo privat ia
 * di-throttle berat. Tugas yang dijadwalkan pukul 10:20 butuh denyut yang
 * mendarat di dekat jamnya; dengan jeda 3,5 jam, sebagian besar tak pernah
 * mendapatkannya.
 *
 * Sebarannya membenarkan itu persis — semua yang dijadwalkan SESUDAH ~09:30
 * berstatus gagal, tiga per slot (satu per tenant).
 *
 * ── Kenapa di dalam container, bukan cron di host
 *
 * Container API sudah hidup 24/7 dan sudah punya `SCHEDULER_SECRET` di
 * env-nya. Cron host menuntut satu tempat lagi yang harus diingat saat
 * pindah server, dan `infra/perbarui-vps.sh` tak akan tahu kalau ia hilang.
 *
 * ── Kenapa GitHub Actions TIDAK dimatikan
 *
 * Ia jadi jaring kedua: kalau container mati atau di-deploy ulang tepat di
 * jam sebuah tugas, denyut dari luar masih bisa menangkapnya. Keduanya
 * memanggil endpoint yang SAMA, dan endpoint itu idempoten per periode
 * (`dilewati: sudah-jalan-periode-ini`), jadi denyut ganda tak berbahaya.
 *
 * ── Kenapa memanggil lewat HTTP ke diri sendiri
 *
 * Terlihat berputar, dan itu disengaja. Rutenya memuat seluruh logika
 * klaim atomik, token akun layanan, dan pencatatan `otomasi_jalan`.
 * Memanggil fungsinya langsung berarti melewati gerbang rahasia dan
 * membuat dua jalur masuk yang bisa menyimpang — kelas cacat yang sudah
 * berulang di repo ini (dua peta label, dua getTaxRate, dua sumber ikon).
 *
 * Satu jalur, satu perilaku.
 */

/**
 * Jeda antar-denyut.
 *
 * Lima menit, bukan lima belas: endpoint-nya idempoten per periode, jadi
 * denyut berlebih dijawab `dilewati` dan nyaris tak berbiaya. Yang mahal
 * adalah denyut yang TERLEWAT — sebuah tugas pukul 10:20 pada jeda 15
 * menit bisa meleset kalau denyutnya mendarat 10:19 dan 10:34.
 */
const JEDA_MS = 5 * 60 * 1000

/**
 * Tunda sebelum denyut pertama.
 *
 * Container yang baru hidup masih memuat rute dan koneksi; menembaknya
 * pada detik nol menghasilkan kegagalan yang menuduh penjadwal padahal
 * yang belum siap adalah dirinya sendiri.
 */
const TUNDA_AWAL_MS = 30 * 1000

let pewaktu: NodeJS.Timeout | null = null

/**
 * Menyalakan denyut internal. Aman dipanggil sekali saja saat start.
 *
 * Mengembalikan `false` (dan mencatat alasannya) bila tak dijalankan —
 * pemanggil yang mencetak hasilnya membuat keadaan ini TERLIHAT di log
 * start, bukan jadi ketiadaan yang sunyi.
 */
export function nyalakanDenyutPenjadwal(opsi: {
  port: number
  log: { info: (o: unknown, m?: string) => void; warn: (o: unknown, m?: string) => void }
}): boolean {
  const rahasia = process.env.SCHEDULER_SECRET?.trim()

  /*
    Tanpa rahasia, rutenya sendiri sudah membalas 503. Menyalakan denyut
    yang pasti ditolak tiap lima menit cuma mengisi log dengan kegagalan
    yang tak bisa ditindaklanjuti — dan itu melatih orang mengabaikan log.
  */
  if (!rahasia) {
    opsi.log.warn(
      {},
      'denyut penjadwal TIDAK dinyalakan: SCHEDULER_SECRET belum disetel',
    )
    return false
  }

  /*
    Dimatikan lewat env, bukan lewat komentar.

    Yang membutuhkannya: lingkungan pengembangan yang berbagi basis dengan
    produksi. Denyut dari laptop akan menjalankan otomasi TENANT SUNGGUHAN
    — termasuk yang mengirim WhatsApp.
  */
  if (process.env.DENYUT_INTERNAL === 'off') {
    opsi.log.info({}, 'denyut penjadwal dimatikan lewat DENYUT_INTERNAL=off')
    return false
  }

  /*
    PAGAR TEST — wajib, dan `audit-saluran-keluar-berpagar.mjs` benar
    memerahkannya sebelum ada.

    Modul ini memanggil `fetch()` ke rute yang MENJALANKAN OTOMASI SELURUH
    TENANT, dan sebagian otomasi itu mengirim WhatsApp sungguhan. Suite
    test di repo ini memakai Postgres NYATA dengan tenant produksi; sebuah
    test yang kebetulan mengimpor `index.ts` akan menyalakan denyut ini,
    lalu pesan sungguhan terkirim ke nomor sungguhan.

    Tak ada galat yang akan muncul. Yang muncul adalah tagihan dan
    kebingungan di pihak penerima.
  */
  if (process.env.NODE_ENV === 'test') {
    opsi.log.info({}, 'denyut penjadwal dimatikan: NODE_ENV=test')
    return false
  }

  if (pewaktu) return true

  const url = `http://127.0.0.1:${opsi.port}/api/v1/jadwal/jalankan`

  const denyut = async () => {
    try {
      const r = await fetch(url, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-scheduler-secret': rahasia,
        },
        /*
          BADAN `{}` WAJIB, walau rutenya tak butuh isi apa pun.

          Rutenya dideklarasikan `app.post<{ Body: { paksa?: string } }>`, dan
          Fastify mengurai badan begitu `content-type: application/json`
          dikirim. Tanpa `body`, yang diurai adalah string kosong — JSON tak
          sah — dan jawabannya **400**, bukan 401.

          Diukur di PRODUKSI 2026-09-12, beberapa menit sesudah deploy:

              denyut penjadwal internal dinyalakan
              denyut penjadwal ditolak   status: 400

          Uji lokal saya sebelumnya memakai rahasia yang sengaja disalahkan
          dan berhenti di 401 — gerbang rahasia diperiksa SEBELUM badan, jadi
          cacat ini tak pernah sempat terlihat. Uji yang "berhasil gagal"
          pada tahap yang salah tak membuktikan tahap sesudahnya.

          `scripts/penjadwal-lokal.mjs:142` sudah mengirim `{}` sejak lama.
          Jawabannya ada di repo; saya menulis pemanggil kedua tanpa
          membacanya lebih dulu.
        */
        body: JSON.stringify({}),
        /*
          Batas waktu WAJIB. Tanpanya sebuah putaran yang menggantung
          menahan pewaktu berikutnya selamanya, dan penjadwal berhenti
          tanpa satu pun galat — persis bentuk cacat yang berkas ini
          diciptakan untuk menutupnya.
        */
        signal: AbortSignal.timeout(4 * 60 * 1000),
      })

      if (!r.ok) {
        opsi.log.warn({ status: r.status }, 'denyut penjadwal ditolak')
        return
      }

      /*
        Kunci DIBACA dari `jadwal.ts:967` (`const ringkas`), bukan ditebak.

        Percobaan pertama berkas ini memakai `dijalankan` — kunci yang tak
        pernah ada. `r.json()` bertipe `any`, jadi `tsc` hijau, dan
        syaratnya akan selalu `0 > 0` = false: denyut berjalan benar tetapi
        TAK PERNAH mencatat apa pun. Kelas cacat yang sama dengan yang
        dijaga `audit-bentuk-balasan-mobile.mjs`.
      */
      const hasil = (await r.json()) as {
        diperiksa?: number
        sukses?: number
        gagal?: number
        dilewati?: number
      }
      /*
        Dicatat HANYA bila ada yang benar-benar dikerjakan. Denyut yang tiap
        lima menit melaporkan "0 sukses" membanjiri log dengan ketiadaan,
        dan kejadian nyata tenggelam di antaranya.
      */
      if ((hasil.sukses ?? 0) > 0 || (hasil.gagal ?? 0) > 0) {
        opsi.log.info(hasil, 'denyut penjadwal')
      }
    } catch (e) {
      opsi.log.warn({ err: (e as Error).message }, 'denyut penjadwal gagal')
    }
  }

  setTimeout(() => {
    void denyut()
    pewaktu = setInterval(() => void denyut(), JEDA_MS)
    /*
      `unref()` supaya pewaktu ini tak menahan proses tetap hidup saat
      aplikasi diminta berhenti. Tanpanya `docker compose down` menunggu
      sampai batas waktunya habis lalu membunuh paksa.
    */
    pewaktu.unref?.()
  }, TUNDA_AWAL_MS).unref?.()

  opsi.log.info(
    { jedaMenit: JEDA_MS / 60000 },
    'denyut penjadwal internal dinyalakan',
  )
  return true
}
