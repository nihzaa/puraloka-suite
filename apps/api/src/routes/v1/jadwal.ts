/**
 * RUTE JADWAL TUGAS — pemicu berkala + pengelolaannya.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * INILAH YANG SELAMA INI HILANG
 * ══════════════════════════════════════════════════════════════════════════
 *
 * `/sistem` adalah dua tombol manual. Kalau tak ada manusia yang menekannya,
 * notifikasi tenggat & milestone TIDAK PERNAH TERBIT. Berkas ini yang
 * menggantikan manusia itu.
 *
 * ── Kenapa satu endpoint "jalankan" untuk semua tugas
 *
 * Pemicunya cron GitHub Actions — satu panggilan, dan SERVER yang memutuskan
 * tugas mana yang jatuh tempo. Alternatifnya (satu cron per tugas) membuat
 * jadwal hidup di DUA tempat: di basis dan di `.yml`. Dua tempat berarti
 * cepat atau lambat berbeda, dan yang berbeda diam-diam adalah yang di
 * `.yml`, karena tak ada yang membacanya.
 *
 * ── DUA lapis autentikasi, dan kenapa keduanya perlu
 *
 * 1. PEMICUNYA (cron → endpoint ini) dijaga rahasia bersama
 *    `SCHEDULER_SECRET`. Cron tak punya sesi, dan memberinya sesi berarti
 *    sesi itu harus diperbarui — pekerjaan yang cepat atau lambat terlupa.
 *    Dibandingkan dengan `timingSafeEqual`, bukan `===`: perbandingan string
 *    biasa keluar lebih awal pada karakter pertama yang berbeda, dan selisih
 *    waktunya cukup untuk menebak rahasianya karakter demi karakter.
 *
 * 2. TUGASNYA dijalankan dengan AKUN LAYANAN SUNGGUHAN, lewat jalur
 *    `authenticate` + `requirePermission` yang sama persis dengan manusia.
 *
 * Rancangan pertama menyatukan keduanya: satu header rahasia yang membuat
 * `authenticate` melewatkan pemeriksaan sesi. Itu dibatalkan setelah membaca
 * `plugins/auth.ts` — di sana ada peringatan panjang bahwa urutan resolusi
 * company LOAD-BEARING, dan bahwa peran sengaja dibaca per-company untuk
 * mencegah kewenangan menyeberang antar tenant.
 *
 * Menaruh cabang yang melewati semua itu, di fungsi yang dipakai SETIAP rute,
 * demi satu fitur — harganya tak sebanding. Dengan akun layanan, penjadwal
 * tunduk pada batas yang sama; kalau akunnya kehilangan hak, tugasnya gagal
 * dengan 403 yang terbaca, bukan diam-diam berjalan dengan kewenangan yang
 * tak pernah diberikan siapa pun.
 *
 * ── Kenapa tetap ada tombol manual
 *
 * Dua tombol di `/sistem` TIDAK dihapus. Saat sesuatu tak terkirim, hal
 * pertama yang ingin dilakukan orang adalah memicunya sekarang dan melihat
 * apa yang terjadi — bukan menunggu besok pagi untuk tahu apakah tebakannya
 * benar.
 */
import type { FastifyInstance, FastifyRequest } from 'fastify'
import { timingSafeEqual } from 'node:crypto'
import { authenticate, requirePermission } from '../../plugins/auth.js'
import { logAuditEvent } from '../../utils/audit.js'
import { awalPeriode, harusJalan, jadwalLintasTenant, type Jadwal, type JenisJadwal } from '../../lib/jadwal.js'
import { tokenAkunLayanan } from '../../lib/akun-layanan.js'
import { sudahWaktunya } from '../../lib/jadwal-acak.js'

/**
 * Katalog tugas yang dikenal.
 *
 * Daftar, bukan kolom bebas: tugas yang tak dikenal berarti seseorang mengetik
 * salah, dan tugas salah ketik yang diterima diam-diam akan tampak
 * "terjadwal" tanpa pernah berjalan — kelas cacat yang sama dengan yang
 * penjaga L-4 cegah.
 */
export const KATALOG_TUGAS: Record<string, { label: string; keterangan: string; jalur: string }> = {
  'cek-tenggat': {
    label: 'Cek Tenggat',
    keterangan: 'Termin jatuh tempo, invoice lewat tenggat, kasbon menggantung, proyek mendekati akhir.',
    jalur: '/api/v1/notifications/check-deadlines',
  },
  'cek-milestone': {
    label: 'Cek Milestone',
    keterangan: 'Milestone yang mendekat (3 hari) atau sudah lewat.',
    jalur: '/api/v1/notifications/check-milestones',
  },
  // Retensi yang tak pernah dijalankan adalah janji kosong: tenant membaca
  // "riwayat disimpan 30 hari", menyimpulkan datanya sudah dibersihkan, dan
  // percakapan dua tahun lalu masih utuh di basis.
  'bersih-percakapan-ai': {
    label: 'Bersihkan Riwayat AI',
    keterangan: 'Menghapus percakapan asisten yang melewati batas retensi tiap tenant.',
    jalur: '/api/v1/ai/retensi/bersihkan',
  },

  /*
   * Sapaan proaktif — SATU-SATUNYA tugas yang memakai jendela acak.
   *
   * Founder menolak jam kaku ("emang ga tepat seperti yang dijadwalkan"), jadi
   * `jam` di sini berarti AWAL JENDELA dan `jendela_menit` lebarnya. Waktu
   * sasarannya diundi sekali per periode dan disimpan di `sasaran_berikut`.
   *
   * Rutenya sendiri memegang gerbang keluar (jam tenang, opt-out, kuota) —
   * jadi jadwal yang jatuh di jam tenang tetap ditahan, bukan dikirim karena
   * "kan sudah waktunya".
   */
  'sapa-proaktif': {
    label: 'Sapaan Asisten',
    keterangan: 'Asisten menyapa duluan pada jam yang berbeda tiap hari, kalau ada yang perlu disebut.',
    /*
     * `?sapaan=1` — founder memilih "harian, TERMASUK sapaan tanpa temuan"
     * (2026-08-15). Tanpanya asisten hanya bersuara saat ada temuan, dan
     * pada data yang bersih ia diam berhari-hari — sulit dinilai apakah
     * jadwalnya bekerja atau tidak.
     *
     * Query string ditaruh di sini, bukan di penjadwal: `jalankanTugas`
     * memakai `meta.jalur` APA ADANYA, jadi tiap tugas memegang parameternya
     * sendiri tanpa penjadwal perlu tahu apa pun tentangnya.
     *
     * ⚠ `audit-tugas-punya-rute` mencocokkan jalur ini dengan pendaftaran
     * rute secara harfiah — pemisahan query-nya ditangani penjaga itu.
     */
    jalur: '/api/v1/asisten/sapa-proaktif?sapaan=1',
  },

  // ── Otomasi terjadwal (katalog automation Phase 2, rule-based) ────────────
  //
  // Ketiganya rule-based — NOL ketergantungan AI. Gerbangnya Phase 2, dan
  // Phase 2 sudah lewat, jadi tak ada yang menahannya selain belum ditulis.
  //
  // Dedup harian ada di endpoint-nya masing-masing (ledger = tabel
  // `notifications`), jadi denyut 15 menit tak menghasilkan pesan berulang.
  'kasbon-outstanding': {
    label: 'Kasbon Belum Lunas',
    keterangan: 'Kasbon yang sudah disetujui tapi belum dilunasi melewati ambang hari.',
    jalur: '/api/v1/otomasi/jalankan/kasbon-outstanding',
  },
  'kasbon-tukang': {
    label: 'Cicilan Kasbon Tukang',
    keterangan: 'Kasbon tukang yang belum lunas dan perlu dipotong dari upah.',
    jalur: '/api/v1/otomasi/jalankan/kasbon-tukang',
  },
  'progres-belum-lapor': {
    label: 'Progres Belum Dilaporkan',
    keterangan: 'Mandor ber-penugasan aktif yang belum mengirim laporan progres hari ini.',
    jalur: '/api/v1/otomasi/jalankan/progres-belum-lapor',
  },
  'invoice-termin': {
    label: 'Invoice dari Termin',
    keterangan: 'Termin yang sudah memenuhi syarat tagih diterbitkan invoice-nya.',
    jalur: '/api/v1/otomasi/jalankan/invoice-termin',
  },
  'stok-menipis': {
    label: 'Stok Menipis',
    keterangan: 'Material yang sisanya di bawah ambang pesan-ulang.',
    jalur: '/api/v1/otomasi/jalankan/stok-menipis',
  },
  'gr-matching': {
    label: 'Kecocokan PO & Penerimaan',
    keterangan: 'PO yang statusnya tak cocok dengan barang diterima, atau menggantung lewat tenggat.',
    jalur: '/api/v1/otomasi/jalankan/gr-matching',
  },
  'dependency-breach': {
    label: 'Ambang Dependency Terlampaui',
    keterangan: 'Pekerjaan yang pendahulunya jauh di bawah ambang progres — hanya yang parah.',
    jalur: '/api/v1/otomasi/jalankan/dependency-breach',
  },

  // ── Otomasi Phase 3-5 & modul yang ternyata sudah ada (2026-08-16) ────────
  //
  // Delapan rute ini SUDAH ADA sejak 2026-08-15/16 dan tak pernah terdaftar di
  // sini — jadi mereka tak pernah dijalankan penjadwal sekali pun.
  //
  // Saya sempat menyebut sebabnya "menunggu deploy / SCHEDULER_URL". Diukur
  // hari ini: `SCHEDULER_URL` tidak dipakai satu baris kode pun di repo ini —
  // ia hanya muncul sebagai KALIMAT di skrip laporan buatan saya sendiri.
  //
  // Yang sesungguhnya menahan cuma dua hal, keduanya bisa dikerjakan lokal:
  //
  //   1. tugasnya belum terdaftar di sini   → diperbaiki blok ini
  //   2. tak ada yang memanggil denyutnya   → `scripts/jalankan-penjadwal.cmd`
  //
  // Pelajaran yang sama dengan pembuka CLAUDE.md, dalam bentuk lain: bukan
  // hanya angka yang membusuk, ALASAN pun membusuk. "Menunggu deploy" terdengar
  // seperti kesimpulan teknis, padahal ia tebakan yang tak pernah diukur, dan
  // ia menahan delapan otomasi selama dua hari tanpa satu pun gejala.

  'invoice-terlambat': {
    label: 'Tagihan Lewat Jatuh Tempo',
    keterangan: 'Tagihan ke klien yang lewat jatuh tempo dan masih ada sisa belum dibayar.',
    jalur: '/api/v1/otomasi/jalankan/invoice-terlambat',
  },
  'saldo-menipis': {
    label: 'Saldo Kas Menipis',
    keterangan: 'Total saldo kas turun di bawah batas aman yang disetel.',
    jalur: '/api/v1/otomasi/jalankan/saldo-menipis',
  },
  'milestone-berisiko': {
    label: 'Milestone Terancam Meleset',
    keterangan: 'Milestone yang tenggatnya mendekat sementara pekerjaannya belum selesai.',
    jalur: '/api/v1/otomasi/jalankan/milestone-berisiko',
  },
  'hutang-supplier': {
    label: 'Pembayaran Supplier Mendekat',
    keterangan: 'Tagihan supplier yang mendekati jatuh tempo — ditegur SEBELUM lewat.',
    jalur: '/api/v1/otomasi/jalankan/hutang-supplier',
  },
  'harga-material-naik': {
    label: 'Harga Material Naik',
    keterangan: 'Kenaikan harga material yang melampaui batas persen dibanding sebelumnya.',
    jalur: '/api/v1/otomasi/jalankan/harga-material-naik',
  },
  'evm-kinerja': {
    label: 'Kinerja Proyek Menurun',
    keterangan: 'Proyek yang indeks jadwal atau indeks biayanya turun di bawah ambang.',
    jalur: '/api/v1/otomasi/jalankan/evm-kinerja',
  },
  'polis-berakhir': {
    label: 'Asuransi Berakhir / Belum Ada',
    keterangan: 'Polis yang mendekati akhir masa berlaku, dan proyek yang belum berasuransi.',
    jalur: '/api/v1/otomasi/jalankan/polis-berakhir',
  },
  'rab-harga-menyimpang': {
    label: 'Harga Satuan RAB Menyimpang',
    keterangan: 'Pekerjaan sama dihargai berbeda jauh antar proyek.',
    jalur: '/api/v1/otomasi/jalankan/rab-harga-menyimpang',
  },
  'upah-menyimpang': {
    label: 'Laporan Upah Menyimpang',
    keterangan: 'Upah mingguan jauh dari kebiasaan lingkup kerjanya sendiri.',
    jalur: '/api/v1/otomasi/jalankan/upah-menyimpang',
  },
  'kontrak-klien-berakhir': {
    label: 'Kontrak Klien Mendekati Akhir',
    keterangan: 'Peluang pekerjaan berikutnya selagi klien masih sering dihubungi.',
    jalur: '/api/v1/otomasi/jalankan/kontrak-klien-berakhir',
  },
  'penyusutan-belum-ditutup': {
    label: 'Penyusutan Alat Belum Ditutup',
    keterangan: 'Buku penyusutan bulan lalu yang belum dihitung atau belum dijurnalkan.',
    jalur: '/api/v1/otomasi/jalankan/penyusutan-belum-ditutup',
  },
  'perawatan-alat': {
    label: 'Perawatan & Sertifikasi Alat',
    keterangan: 'Servis berkala dan sertifikat alat yang jatuh tempo, plus alat tanpa jadwal.',
    jalur: '/api/v1/otomasi/jalankan/perawatan-alat',
  },
  'konflik-mandor': {
    label: 'Mandor Bentrok Dua Proyek',
    keterangan: 'Lingkup kerja mandor yang sama bertabrakan di proyek berbeda.',
    jalur: '/api/v1/otomasi/jalankan/konflik-mandor',
  },
  'kontrak-payung-habis': {
    label: 'Kontrak Payung Segera Habis',
    keterangan: 'Kontrak payung pemasok yang mendekati akhir masa berlaku.',
    jalur: '/api/v1/otomasi/jalankan/kontrak-payung-habis',
  },
  'retensi-tertahan': {
    label: 'Retensi Tertahan',
    keterangan: 'Uang retensi yang tertahan pada proyek yang sudah lewat tanggal selesai.',
    jalur: '/api/v1/otomasi/jalankan/retensi-tertahan',
  },
  'audit-aksi-berisiko': {
    label: 'Ringkasan Aksi Berisiko',
    keterangan: 'Perubahan izin, penghapusan berklaster, dan lonjakan aktivitas 24 jam.',
    jalur: '/api/v1/otomasi/jalankan/audit-aksi-berisiko',
  },
  'serapan-anggaran': {
    label: 'Serapan Anggaran Tinggi',
    keterangan: 'Belanja proyek mendekati atau melampaui pagunya.',
    jalur: '/api/v1/otomasi/jalankan/serapan-anggaran',
  },
  'absensi-berhenti': {
    label: 'Absensi Berhenti Dicatat',
    keterangan: 'Lingkup kerja yang absensinya berhenti dicatat beberapa hari.',
    jalur: '/api/v1/otomasi/jalankan/absensi-berhenti',
  },
  'subkon-tak-layak': {
    label: 'Subkontraktor Tak Layak',
    keterangan: 'Subkon yang menurut evaluasi terakhir tak boleh dipakai.',
    jalur: '/api/v1/otomasi/jalankan/subkon-tak-layak',
  },
  'kepatuhan-dokumen': {
    label: 'Dokumen Kepatuhan & Izin Habis',
    keterangan: 'Dokumen legalitas pihak dan izin proyek yang mendekati atau melewati masa berlaku.',
    jalur: '/api/v1/otomasi/jalankan/kepatuhan-dokumen',
  },
  'sertifikat-berakhir': {
    label: 'Sertifikat Pegawai Berakhir',
    keterangan: 'Sertifikat keahlian pegawai yang mendekati atau melewati masa berlaku.',
    jalur: '/api/v1/otomasi/jalankan/sertifikat-berakhir',
  },
  'k3-kepatuhan': {
    label: 'Kepatuhan K3 Proyek',
    keterangan: 'Temuan berat lewat tenggat, temuan berulang, dan induksi pekerja yang kedaluwarsa.',
    jalur: '/api/v1/otomasi/jalankan/k3-kepatuhan',
  },
  'transmittal-menggantung': {
    label: 'Transmittal Belum Dikonfirmasi',
    keterangan: 'Transmittal yang sudah dikirim tetapi belum dikonfirmasi diterima.',
    jalur: '/api/v1/otomasi/jalankan/transmittal-menggantung',
  },
}

interface BarisJadwal {
  id: string
  company_id: string
  tugas: string
  jenis: JenisJadwal
  jam: string
  hari_pekan: number | null
  hari_bulan: number | null
  aktif: boolean
  terakhir_jalan: string | null
  terakhir_status: string | null
  terakhir_galat: string | null
  terakhir_durasi_ms: number | null
  jumlah_jalan: number
  /** Lebar jendela acak (migrasi 391). 0 = jalan tepat pada `jam`. */
  jendela_menit?: number | null
  /** Waktu acak terpilih untuk periode berjalan. */
  sasaran_berikut?: string | null
}

/** Bandingkan rahasia tanpa membocorkan panjangnya lewat waktu. */
function rahasiaCocok(diberikan: string, benar: string): boolean {
  const a = Buffer.from(diberikan)
  const b = Buffer.from(benar)
  if (a.length !== b.length) {
    // Tetap lakukan satu perbandingan supaya waktunya tak menandakan
    // "panjangnya salah" — informasi yang mempersempit tebakan.
    timingSafeEqual(b, b)
    return false
  }
  return timingSafeEqual(a, b)
}

export default async function jadwalRoutes(app: FastifyInstance) {
  // ── POST /api/v1/jadwal/jalankan ─────────────────────────────────────────
  //
  // Dipanggil cron. Memutuskan sendiri tugas mana yang jatuh tempo.
  app.post<{ Body: { paksa?: string } }>(
    '/api/v1/jadwal/jalankan',
    async (request, reply) => {
      const rahasia = process.env.SCHEDULER_SECRET?.trim()
      if (!rahasia) {
        // MENOLAK, bukan mengizinkan. Endpoint yang memicu pekerjaan untuk
        // seluruh tenant tak boleh terbuka hanya karena env-nya lupa diisi.
        request.log.error('SCHEDULER_SECRET belum disetel — pemicu jadwal ditolak')
        return reply.status(503).send({
          error: 'Penjadwal belum terkonfigurasi (SCHEDULER_SECRET).',
        })
      }

      const diberikan = String(request.headers['x-scheduler-secret'] ?? '')
      if (!rahasiaCocok(diberikan, rahasia)) {
        request.log.warn({ ip: request.ip }, 'pemicu jadwal ditolak: rahasia salah')
        return reply.status(401).send({ error: 'Unauthorized' })
      }

      // Token akun layanan diambil SEKALI untuk seluruh putaran. Mengambilnya
      // per-tugas berarti 52 login untuk 26 tenant × 2 tugas — beban yang tak
      // membeli apa pun, karena tokennya sama.
      let token: string
      try {
        token = await tokenAkunLayanan()
      } catch (e) {
        request.log.error({ err: e }, 'akun layanan penjadwal tak bisa dipakai')
        return reply.status(503).send({
          error: 'Akun layanan penjadwal belum terkonfigurasi: ' + (e as Error).message,
        })
      }

      const now = new Date()

      /*
        BERHALAMAN — dan ini bukan kehati-hatian berlebihan.

        PostgREST memotong di 1.000 baris TANPA galat dan TANPA penanda.
        Selama tabel ini berisi sepuluh baris, `.select('*')` benar; ia berhenti
        benar pada baris ke-1.001, dan cara berhentinya sunyi: tugas ke-1.001
        dan seterusnya TAK PERNAH DIJALANKAN, sementara respons penjadwal tetap
        `ok: true`.

        Terlihat 2026-08-16 saat migrasi 401 sempat menjadwalkan untuk seluruh
        perusahaan: `diperiksa: 1000` dari 4.794 baris yang ada. Penyebab
        angkanya sudah diperbaiki (scope migrasi), tetapi pemotongannya bukan —
        dan ia akan kembali diam-diam pada tenant ke-56 (56 × 18 > 1.000).

        Pola sama dengan `utils/role-guard.ts` dan `notification-rules.ts`.
        `.limit()` yang dinaikkan BUKAN perbaikan: ia memindahkan ambangnya.
      */
      const HALAMAN = 1000
      const data: BarisJadwal[] = []
      for (let dari = 0; ; dari += HALAMAN) {
        const { data: halaman, error } = await (await jadwalLintasTenant())
          .select('*')
          .eq('aktif', true)
          .order('id', { ascending: true })
          .range(dari, dari + HALAMAN - 1)

        if (error) {
          request.log.error({ err: error }, 'gagal membaca jadwal tugas')
          return reply.status(500).send({ error: 'Gagal membaca jadwal' })
        }
        if (!halaman || halaman.length === 0) break
        data.push(...(halaman as unknown as BarisJadwal[]))
        if (halaman.length < HALAMAN) break
      }

      const semua = data
      const paksa = request.body?.paksa
      const hasil: Array<{ tugas: string; company_id: string; status: string; alasan?: string }> = []

      for (const baris of semua) {
        if (!KATALOG_TUGAS[baris.tugas]) {
          hasil.push({ tugas: baris.tugas, company_id: baris.company_id, status: 'tak-dikenal' })
          continue
        }

        const jadwal: Jadwal = {
          jenis: baris.jenis,
          jam: baris.jam,
          hari_pekan: baris.hari_pekan,
          hari_bulan: baris.hari_bulan,
          terakhir_jalan: baris.terakhir_jalan,
          aktif: baris.aktif,
        }

        const keputusan = paksa === baris.tugas
          ? { jalan: true, alasan: 'dipaksa' as const }
          : harusJalan(jadwal, now)

        if (!keputusan.jalan) {
          hasil.push({
            tugas: baris.tugas, company_id: baris.company_id,
            status: 'dilewati', alasan: keputusan.alasan,
          })
          continue
        }

        /*
         * ── JENDELA ACAK (migrasi 391) ─────────────────────────────────────
         *
         * Dipasang SESUDAH `harusJalan()` dan SEBELUM klaim atomik — dua lapis
         * yang menjawab pertanyaan berbeda:
         *
         *   harusJalan()  periode mana yang berlaku, dan belum dijalankan
         *   di sini       di dalam periode itu, apakah menit acaknya sudah lewat
         *
         * Menyatukannya akan membuat undian ikut menentukan "periode mana",
         * dan tugas yang sasarannya jatuh sesudah tick terakhir hari itu akan
         * terlewat diam-diam.
         *
         * `jendela_menit = 0` (bawaan) melewati blok ini sepenuhnya — seluruh
         * tugas lama tak berubah perilakunya sama sekali.
         */
        const jendela = Number(baris.jendela_menit ?? 0)
        if (jendela > 0 && paksa !== baris.tugas) {
          const awal = awalPeriode(jadwal, now)
          const tersimpan = baris.sasaran_berikut ? new Date(baris.sasaran_berikut) : null

          // Sasaran dari periode SEBELUMNYA tak berlaku lagi — kalau dipakai,
          // ia sudah lewat dan tugasnya jalan pada tick pertama periode baru,
          // yaitu kembali jadi jadwal kaku.
          const masihPeriodeIni =
            tersimpan !== null && tersimpan.getTime() >= awal.getTime()

          const keputusanSasaran = sudahWaktunya(
            masihPeriodeIni ? tersimpan : null,
            now,
            { awal, jendelaMenit: jendela },
          )

          if (!masihPeriodeIni) {
            // Sasaran baru DISIMPAN, bukan diundi ulang tiap tick: mengundi
            // per tick membuat peluangnya menumpuk, dan tugas berjendela lebar
            // hampir selalu tertembak di tick-tick pertama — selalu pagi.
            const { data: tersimpanSasaran, error: errSasaran } = await (
              await jadwalLintasTenant()
            )
              .update({ sasaran_berikut: keputusanSasaran.sasaran.toISOString() })
              .eq('id', baris.id)
              .select('id')
              .maybeSingle()

            /*
             * HASILNYA diperiksa, bukan cuma `error`.
             *
             * UPDATE yang tak mengenai satu baris pun mengembalikan
             * `error: null` dengan `data: null`. Sasaran yang gagal tersimpan
             * akan diundi ULANG pada tick berikutnya — dan mengundi tiap tick
             * persis cacat yang jendela acak ini ada untuk mencegah: peluang
             * menumpuk, tugasnya hampir selalu tertembak di tick-tick awal,
             * dan sapaannya kembali selalu pagi.
             *
             * Tak menghentikan tugasnya (sasarannya toh sudah lewat), tetapi
             * tak boleh senyap.
             */
            if (errSasaran || !tersimpanSasaran) {
              request.log.error(
                { err: errSasaran, tugas: baris.tugas, tersimpan: Boolean(tersimpanSasaran) },
                'gagal menyimpan sasaran acak — akan diundi ulang tick berikutnya',
              )
            }
          }

          if (!keputusanSasaran.jalan) {
            hasil.push({
              tugas: baris.tugas, company_id: baris.company_id,
              status: 'dilewati', alasan: keputusanSasaran.alasan,
            })
            continue
          }
        }

        // ── Klaim atomik: `terakhir_jalan` LAMA ikut di WHERE.
        //
        // Dua cron yang tumpang tindih (GitHub Actions bisa mengulang job)
        // akan sama-sama membaca baris ini dan sama-sama menjalankannya.
        // Untuk notifikasi itu berarti pesan ganda; untuk tugas yang kelak
        // menyentuh uang, lebih buruk.
        //
        // Sama seperti TJS: dicatat saat MULAI, bukan saat berhasil — supaya
        // tugas yang gagal tak diulang tiap tick.
        const mulai = Date.now()
        const q = (await jadwalLintasTenant())
          .update({
            terakhir_jalan: now.toISOString(),
            jumlah_jalan: baris.jumlah_jalan + 1,
          })
          .eq('id', baris.id)

        const { data: klaim, error: errKlaim } = await (
          baris.terakhir_jalan
            ? q.eq('terakhir_jalan', baris.terakhir_jalan)
            : q.is('terakhir_jalan', null)
        ).select('id').maybeSingle()

        if (errKlaim) {
          request.log.error({ err: errKlaim, tugas: baris.tugas }, 'gagal mengklaim jadwal')
          hasil.push({ tugas: baris.tugas, company_id: baris.company_id, status: 'gagal-klaim' })
          continue
        }
        if (!klaim) {
          // Proses lain menang. Bukan galat — justru bukti klaimnya bekerja.
          hasil.push({
            tugas: baris.tugas, company_id: baris.company_id,
            status: 'dilewati', alasan: 'diklaim-proses-lain',
          })
          continue
        }

        try {
          await jalankanTugas(request, baris.tugas, baris.company_id, token)
          await catatHasil(request, baris.id, {
            terakhir_status: 'sukses',
            terakhir_galat: null,
            terakhir_durasi_ms: Date.now() - mulai,
          })
          hasil.push({ tugas: baris.tugas, company_id: baris.company_id, status: 'sukses' })
        } catch (e) {
          const pesan = (e as Error).message.slice(0, 500)
          request.log.error({ err: e, tugas: baris.tugas, companyId: baris.company_id }, 'tugas terjadwal gagal')
          // Kegagalan DICATAT, tidak ditelan. Tanpa ini, tugas yang gagal tiap
          // hari terlihat persis seperti tugas yang berhasil tiap hari.
          await catatHasil(request, baris.id, {
            terakhir_status: 'gagal',
            terakhir_galat: pesan,
            terakhir_durasi_ms: Date.now() - mulai,
          })
          hasil.push({ tugas: baris.tugas, company_id: baris.company_id, status: 'gagal' })
        }
      }

      const ringkas = {
        diperiksa: semua.length,
        sukses: hasil.filter((h) => h.status === 'sukses').length,
        gagal: hasil.filter((h) => h.status === 'gagal').length,
        dilewati: hasil.filter((h) => h.status === 'dilewati').length,
      }
      request.log.info(ringkas, 'pemicu jadwal selesai')
      return reply.send({ ok: true, waktu: now.toISOString(), ...ringkas, hasil })
    },
  )

  // ── GET /api/v1/jadwal ───────────────────────────────────────────────────
  app.get(
    '/api/v1/jadwal',
    { preHandler: [authenticate, requirePermission('settings:schedule:view')] },
    async (request, reply) => {
      const { data, error } = await request.db!
        .from('jadwal_tugas')
        .select('id, tugas, jenis, jam, hari_pekan, hari_bulan, aktif, terakhir_jalan, terakhir_status, terakhir_galat, terakhir_durasi_ms, jumlah_jalan')
        .order('tugas')

      if (error) {
        request.log.error({ err: error }, 'gagal membaca jadwal')
        return reply.status(500).send({ error: 'Gagal membaca jadwal' })
      }

      const now = new Date()
      const daftar = ((data ?? []) as BarisJadwal[]).map((b) => {
        const meta = KATALOG_TUGAS[b.tugas]
        return {
          ...b,
          label: meta?.label ?? b.tugas,
          keterangan: meta?.keterangan ?? null,
          dikenal: Boolean(meta),
          // Apa yang AKAN diputuskan pemicu berikutnya — supaya "kenapa ini
          // belum jalan" terjawab di layar, bukan lewat menunggu.
          keputusan_sekarang: harusJalan(
            {
              jenis: b.jenis, jam: b.jam, hari_pekan: b.hari_pekan,
              hari_bulan: b.hari_bulan, terakhir_jalan: b.terakhir_jalan, aktif: b.aktif,
            },
            now,
          ),
        }
      })

      return reply.send({
        data: daftar,
        penjadwal_siap: Boolean(process.env.SCHEDULER_SECRET?.trim()),
      })
    },
  )

  // ── PATCH /api/v1/jadwal/:tugas ──────────────────────────────────────────
  app.patch<{
    Params: { tugas: string }
    Body: { jenis?: JenisJadwal; jam?: string; hari_pekan?: number | null; hari_bulan?: number | null; aktif?: boolean }
  }>(
    '/api/v1/jadwal/:tugas',
    { preHandler: [authenticate, requirePermission('settings:schedule:manage')] },
    async (request, reply) => {
      const { tugas } = request.params
      if (!KATALOG_TUGAS[tugas]) {
        return reply.status(422).send({ error: `Tugas '${tugas}' tidak dikenal sistem` })
      }

      const b = request.body ?? {}
      const ubahan: Record<string, unknown> = {}
      if (b.jenis !== undefined) {
        if (!['harian', 'mingguan', 'bulanan'].includes(b.jenis)) {
          return reply.status(422).send({ error: 'Jenis jadwal tidak sah' })
        }
        ubahan.jenis = b.jenis
      }
      if (b.jam !== undefined) {
        if (!/^([01][0-9]|2[0-3]):[0-5][0-9]$/.test(b.jam)) {
          return reply.status(422).send({ error: 'Jam harus berbentuk HH:MM (00:00–23:59)' })
        }
        ubahan.jam = b.jam
      }
      if (b.hari_pekan !== undefined) ubahan.hari_pekan = b.hari_pekan
      if (b.hari_bulan !== undefined) ubahan.hari_bulan = b.hari_bulan
      if (b.aktif !== undefined) ubahan.aktif = b.aktif

      if (Object.keys(ubahan).length === 0) {
        return reply.status(422).send({ error: 'Tidak ada yang diubah' })
      }

      const { data, error } = await request.db!
        .from('jadwal_tugas')
        .update(ubahan)
        .eq('tugas', tugas)
        .select('tugas, jenis, jam, hari_pekan, hari_bulan, aktif')
        .maybeSingle()

      if (error) {
        request.log.error({ err: error, tugas }, 'gagal mengubah jadwal')
        return reply.status(500).send({ error: 'Gagal mengubah jadwal' })
      }
      if (!data) return reply.status(404).send({ error: 'Jadwal tidak ditemukan' })

      void logAuditEvent(request, {
        tableName: 'jadwal_tugas',
        recordId: tugas,
        action: 'schedule.update',
        actorId: request.currentUser!.id,
        newValues: ubahan,
        severity: 'warning',
      })

      return reply.send({ ok: true, data })
    },
  )
}

/**
 * Catat hasil satu tugas, dan PERIKSA bahwa catatannya benar-benar tersimpan.
 *
 * `audit-tulis-tanpa-periksa` menangkap kedua penulisan ini — dan ia benar.
 * Ironisnya komentar di atas salah satunya berbunyi "kegagalan DICATAT, tidak
 * ditelan", padahal pencatatannya sendiri bisa gagal tanpa jejak.
 *
 * Akibatnya nyata: `terakhir_status` tertinggal di nilai lama. Tugas yang
 * kemarin sukses dan hari ini gagal akan tetap terbaca "sukses" — dan halaman
 * pengaturan menampilkan kebohongan yang meyakinkan, karena `terakhir_jalan`
 * ikut diperbarui saat klaim.
 *
 * Tidak melempar: tugasnya sendiri SUDAH berjalan, dan menggagalkan seluruh
 * putaran karena satu baris status tak tersimpan akan menghentikan tenant
 * lain yang tak bersalah. Yang dijamin cuma satu — kegagalannya terlihat.
 */
async function catatHasil(
  request: FastifyRequest,
  id: string,
  nilai: { terakhir_status: string; terakhir_galat: string | null; terakhir_durasi_ms: number },
): Promise<void> {
  const { data, error } = await (await jadwalLintasTenant())
    .update(nilai)
    .eq('id', id)
    .select('id')
    .maybeSingle()

  if (error) {
    request.log.error({ err: error, jadwalId: id, status: nilai.terakhir_status },
      'gagal mencatat hasil tugas — status di basis akan TERTINGGAL di nilai lama')
    return
  }
  if (!data) {
    request.log.error({ jadwalId: id },
      'baris jadwal hilang saat mencatat hasil — dihapus di tengah putaran?')
  }
}

/**
 * Jalankan satu tugas untuk satu tenant.
 *
 * Memanggil handler yang SUDAH ADA lewat `app.inject` — bukan menyalin
 * logikanya. Menyalin berarti dua tempat yang cepat atau lambat berbeda, dan
 * yang berbeda diam-diam adalah salinan, karena tak ada yang mengujinya.
 *
 * Keduanya sudah idempoten (dedup per hari) sejak lama, jadi memanggilnya
 * otomatis tak menghasilkan notifikasi ganda — dan itu prasyarat sebelum
 * penjadwal ini dibuat, bukan sesudahnya.
 */
async function jalankanTugas(
  request: FastifyRequest,
  tugas: string,
  companyId: string,
  token: string,
): Promise<void> {
  const meta = KATALOG_TUGAS[tugas]
  if (!meta) throw new Error(`Tugas '${tugas}' tidak dikenal`)

  const res = await request.server.inject({
    method: 'GET',
    url: meta.jalur,
    headers: {
      // Token akun layanan SUNGGUHAN — bukan bypass.
      //
      // Rancangan pertama memakai header rahasia yang membuat `authenticate`
      // melewatkan pemeriksaan sesi. Itu dibatalkan setelah membaca
      // `plugins/auth.ts`: di sana ada peringatan panjang bahwa urutan
      // resolusi company LOAD-BEARING, dan bahwa peran dibaca per-company
      // justru untuk mencegah kewenangan menyeberang antar tenant.
      //
      // Menambahkan jalan pintas ke fungsi itu berarti menaruh cabang yang
      // melewati seluruh pengamanan tersebut, di jalur yang dipakai SETIAP
      // rute — demi satu fitur. Harganya tak sebanding.
      //
      // Dengan akun layanan, penjadwal tunduk pada permission dan batas tenant
      // yang sama persis dengan manusia. Kalau akunnya kehilangan hak, tugasnya
      // gagal dengan 403 yang terbaca — bukan diam-diam berjalan dengan
      // kewenangan yang tak pernah diberikan siapa pun.
      authorization: `Bearer ${token}`,
      'x-company-id': companyId,
    },
  })

  if (res.statusCode >= 400) {
    throw new Error(`${meta.jalur} membalas ${res.statusCode}: ${res.body.slice(0, 200)}`)
  }
}
