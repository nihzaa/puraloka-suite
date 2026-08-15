/**
 * POST /api/v1/ai/siapkan-tulis — menerbitkan token (tak menulis apa pun)
 * POST /api/v1/ai/tulis         — memakai token, MENULIS satu baris
 * GET  /api/v1/ai/tulis/entitas — apa saja yang bisa dicatat lewat asisten
 *
 * ══════════════════════════════════════════════════════════════════════════
 * SATU-SATUNYA TEMPAT ASISTEN BISA MENULIS — DAN IA BUKAN TOOL
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Founder memilih "CRUD terbatas + token konfirmasi", melampaui TJS yang nol
 * create/update/delete.
 *
 * Yang membuatnya boleh ada: **I-1 tetap utuh**. Tak satu pun tool menulis;
 * `audit-tool-ai-read-only` tetap berambang NOL dan tetap hijau. Tulisannya
 * terjadi DI SINI, dan hanya bisa dipicu permintaan yang membawa token —
 * yaitu klik manusia, bukan kalimat model.
 *
 * Injeksi lewat dokumen bisa membuat model memanggil `siapkan_tulis`. Ia tak
 * bisa membuat manusia menekan tombol, dan token yang tak diklaim kedaluwarsa
 * dalam 15 menit tanpa mengubah apa pun.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * DUA IZIN YANG BERBEDA, DAN ITU DISENGAJA
 * ══════════════════════════════════════════════════════════════════════════
 *
 * `ai:chat` untuk bertanya. `ai:tulis` untuk menyimpan. Kalau keduanya satu
 * izin, memberi seseorang akses asisten diam-diam memberinya jalan menulis —
 * dan yang memberikan izin itu tak pernah bermaksud begitu.
 */

import type { FastifyInstance, FastifyRequest } from 'fastify'
import { randomBytes } from 'node:crypto'
import { authenticate, requirePermission } from '../../plugins/auth.js'
import { logAuditEvent } from '../../utils/audit.js'
import { ENTITAS_TULIS, entitasTulis, persenSah } from '../../lib/ai-tool-siapkan.js'
import { klaimTokenTulis, type SebabGagal } from '../../lib/tulis-klaim.js'
import { terbitkanTokenWa } from '../../lib/tulis-konfirmasi-wa.js'

/**
 * Sebab kegagalan → kode HTTP.
 *
 * Peta, bukan rantai `if`: pustaka klaim dipakai dua kanal, dan sebab baru
 * yang lupa dipetakan di sini akan gagal COMPILE (`Record` lengkap) — bukan
 * diam-diam terkirim sebagai 500 yang tak menjelaskan apa pun.
 */
const KODE_SEBAB: Record<SebabGagal, number> = {
  gangguan: 503,
  tak_dikenal: 410,
  bukan_pemilik: 403,
  sudah_dipakai: 409,
  kedaluwarsa: 410,
  tanpa_izin: 403,
  jenis_asing: 500,
  gagal_simpan: 500,
}

/** Umur token. Sama dengan token setujui — satu kebiasaan, bukan dua. */
const UMUR_TOKEN_MS = 15 * 60_000

/**
 * Batas atas pengeluaran yang boleh DISIAPKAN lewat percakapan (automation 1.1).
 *
 * Bukan batas pengeluaran — itu urusan rantai approval, dan diatur per tenant
 * lewat `approval_steps.min_amount`. Ini batas JALUR: di atasnya, pengajuan
 * lewat halaman Pengeluaran yang menampilkan angkanya besar-besar sebelum
 * disimpan.
 *
 * Alasannya satu, dan bukan kehati-hatian berlebihan: salah ketik nol adalah
 * kekeliruan paling mudah terjadi lewat percakapan. "Lima juta" jadi 50 juta
 * hanya butuh satu ketukan berlebih, dan asisten tak punya cara membedakannya
 * dari maksud sungguhan.
 *
 * Dipaku di kode, BUKAN dijadikan pengaturan — dan itu disengaja. Ia bukan
 * kebijakan bisnis (berapa pengeluaran yang boleh diajukan) melainkan batas
 * kepercayaan pada satu KANAL. Menaruhnya di UI mengundang orang menaikkannya
 * sampai tak berarti, dan yang dipertaruhkan bukan kenyamanan mereka sendiri.
 */
const BATAS_PENGELUARAN_SIAP = 10_000_000

/**
 * Batas atas kasbon yang boleh DISIAPKAN lewat percakapan.
 *
 * Lebih tinggi daripada `BATAS_PENGELUARAN_SIAP`, dan itu bukan
 * kelonggaran — perbedaannya punya sebab yang bisa diperiksa:
 *
 *   · pengeluaran mencatat uang yang SUDAH keluar; salah ketiknya baru
 *     ketahuan saat rekonsiliasi
 *   · kasbon MEMINTA uang yang belum keluar, dan permintaannya melewati
 *     rantai approval yang menampilkan nominalnya kepada manusia
 *
 * Jadi yang dijaga di sini bukan "jangan sampai uangnya lepas" — approval yang
 * menjaga itu. Yang dijaga: kasbon dengan nol berlebih tak sampai ke meja
 * approver dan membuang waktu orang membaca angka yang tak masuk akal.
 *
 * Dipaku, bukan pengaturan — alasannya sama dengan konstanta di atas: ini
 * batas kepercayaan pada satu KANAL, bukan kebijakan bisnis.
 */
const BATAS_KASBON_SIAP = 50_000_000

interface BadanSiapkan {
  jenis?: string
  /** kasbon */
  sumber_dana?: string
  project_id?: string
  persen?: number
  catatan?: string
  judul?: string
  lokasi?: string
  severity?: string
  kanal?: string
  /** Automation 1.1 — pengeluaran proyek lewat percakapan. */
  jumlah?: number
  keperluan?: string
  kategori?: string
  /** Permintaan material (MR) lewat percakapan. */
  kebutuhan?: string
  dibutuhkan_tanggal?: string
  /** Pembayaran masuk — diresolusi lewat invoice, bukan proyek. */
  invoice?: string
  metode?: string
  bank?: string
  referensi?: string
}

/**
 * Batas nominal pembayaran yang boleh dicatat lewat percakapan.
 *
 * Bukan batas pembayaran — invoice bernilai berapa pun tetap boleh dibayar
 * lewat halaman Pembayaran. Ini batas KEPERCAYAAN pada percakapan, dan nilainya
 * sama persis dengan jalur WhatsApp.
 */
const BATAS_PEMBAYARAN_SIAP = 100_000_000

/**
 * Validasi pembayaran masuk — dipakai jalur WEB.
 *
 * Aturannya SAMA PERSIS dengan `terbitkanPembayaran` di
 * `lib/tulis-konfirmasi-wa.ts` (batas nominal, metode sah, invoice belum
 * lunas, tolak lebih bayar). Dua kanal yang menegakkan aturan uang berbeda
 * berarti yang longgar jadi pintu masuk, dan yang longgar tak akan pernah
 * diperiksa siapa pun.
 */
async function siapkanPembayaran(
  db: NonNullable<FastifyRequest['db']>,
  b: BadanSiapkan,
): Promise<
  | { ok: true; muatan: Record<string, unknown>; ringkasan: string; projectId: string }
  | { ok: false; kode: number; pesan: string }
> {
  const cari = (b.invoice ?? '').trim()
  if (!cari) return { ok: false, kode: 422, pesan: 'invoice wajib diisi' }

  const jumlah = Number(b.jumlah)
  if (!Number.isFinite(jumlah) || jumlah <= 0) {
    return { ok: false, kode: 422, pesan: 'jumlah harus angka rupiah lebih dari 0' }
  }
  if (jumlah > BATAS_PEMBAYARAN_SIAP) {
    return {
      ok: false,
      kode: 422,
      pesan: `Pembayaran di atas Rp ${BATAS_PEMBAYARAN_SIAP.toLocaleString('id-ID')} `
        + 'dicatat lewat halaman Pembayaran, bukan lewat percakapan.',
    }
  }

  // Nilai enum `payment_method` — DIUKUR dari pg_enum, bukan ditebak.
  const METODE = ['transfer_bank', 'cash', 'qris', 'cek', 'giro']
  const metode = (b.metode ?? '').trim()
  if (metode && !METODE.includes(metode)) {
    return { ok: false, kode: 422, pesan: `metode harus salah satu: ${METODE.join(', ')}` }
  }

  const { data, error } = await db
    .from('invoices')
    .select('id, invoice_number, amount_due, project_id')
    .neq('status', 'paid')
    .order('issued_date', { ascending: false })
    .limit(200)

  if (error) return { ok: false, kode: 500, pesan: 'Gagal memeriksa invoice' }

  const semua = (data ?? []) as unknown as Array<{
    id: string
    invoice_number: string
    amount_due: string | number
    project_id: string
  }>
  const cocok = semua.filter((i) =>
    (i.invoice_number ?? '').toLowerCase().includes(cari.toLowerCase()),
  )

  if (cocok.length === 0) {
    return { ok: false, kode: 404, pesan: `Tak ada invoice belum lunas yang cocok dengan '${cari}'.` }
  }
  if (cocok.length > 1) {
    return {
      ok: false,
      kode: 409,
      pesan: `Ada ${cocok.length} invoice yang cocok: ${cocok.map((i) => i.invoice_number).join(', ')}.`,
    }
  }

  const inv = cocok[0]
  const sisa = Number(inv.amount_due)

  // Lebih bayar DITOLAK — `amount_due` negatif merusak laporan piutang tanpa
  // satu pun galat, dan yang membacanya menyimpulkan ada kredit yang tak nyata.
  if (Number.isFinite(sisa) && jumlah > sisa) {
    return {
      ok: false,
      kode: 422,
      pesan: `Sisa tagihan ${inv.invoice_number} tinggal Rp ${sisa.toLocaleString('id-ID')} — `
        + `nominal Rp ${jumlah.toLocaleString('id-ID')} melebihi itu.`,
    }
  }

  return {
    ok: true,
    projectId: inv.project_id,
    muatan: {
      invoice_id: inv.id,
      jumlah,
      metode: metode || 'transfer_bank',
      bank: (b.bank ?? '').trim() || null,
      referensi: (b.referensi ?? '').trim() || null,
      catatan: (b.catatan ?? '').trim() || null,
    },
    ringkasan:
      `Pembayaran masuk ${inv.invoice_number}: Rp ${jumlah.toLocaleString('id-ID')}`
      + ` (sisa tagihan Rp ${Number.isFinite(sisa) ? sisa.toLocaleString('id-ID') : '?'})`
      + ' — dicatat TANPA menggerakkan saldo kas; rekonsiliasi bank tetap manual.',
  }
}

export default async function aiTulisRoutes(app: FastifyInstance) {
  // ── Apa saja yang bisa dicatat — supaya UI tak menebak ───────────────────
  app.get(
    '/api/v1/ai/tulis/entitas',
    { preHandler: [authenticate, requirePermission('ai:tulis')] },
    async (_req, reply) =>
      reply.send({
        data: ENTITAS_TULIS.map((e) => ({
          jenis: e.jenis,
          label: e.label,
          aksi: e.aksi,
          field: e.field,
        })),
      }),
  )

  // ── SIAPKAN: menerbitkan token. Tak menyentuh entitasnya sama sekali. ────
  app.post<{ Body: BadanSiapkan }>(
    '/api/v1/ai/siapkan-tulis',
    {
      preHandler: [authenticate, requirePermission('ai:tulis')],
      config: { rateLimit: { max: 30, timeWindow: '1 minute' } },
    },
    async (request, reply) => {
      const b = request.body ?? {}
      const jenis = (b.jenis ?? '').trim()
      const meta = entitasTulis(jenis)

      if (!meta) {
        return reply.status(422).send({
          error: `Jenis '${jenis}' tidak bisa dicatat lewat asisten.`,
          tersedia: ENTITAS_TULIS.map((e) => e.jenis),
        })
      }

      const projectId = (b.project_id ?? '').trim()
      /*
       * PEMBAYARAN MASUK — diresolusi lewat INVOICE, jadi ia mendahului
       * pemeriksaan `project_id` di bawah.
       *
       * `payments` mewarisi tenancy lewat `invoice_id`, bukan `project_id`
       * (`tenant-map.generated.ts:176`). Menuntut proyek lebih dulu akan
       * menolak permintaan yang sah, dan menebak invoice dari proyek berarti
       * melunasi tagihan yang salah — satu proyek punya banyak invoice.
       */
      /*
       * ABSENSI — memakai penerbit yang SAMA dengan WhatsApp.
       *
       * Aturan anti-gandanya hidup di `terbitkanAbsensi` (basis tak punya
       * unique constraint), dan menulis ulang di sini berarti dua tempat yang
       * harus sama-sama benar. Yang berbeda diam-diam adalah salinan.
       *
       * `companyId` & `userId` diambil dari sesi, bukan dari badan permintaan.
       */
      if (jenis === 'absensi') {
        const hasil = await terbitkanTokenWa(
          request.db!,
          request.companyId!,
          request.currentUser!.id,
          { jenis: 'absensi', argumen: b as unknown as Record<string, unknown> },
          (pesan: string, err: unknown) => request.log.error({ err }, pesan),
          // 'web' EKSPLISIT: token bertanda `ai_whatsapp` bisa diklaim kalimat
          // "ya" dari nomor orang itu — konfirmasi untuk sesuatu yang ia
          // siapkan di layar, tanpa pernah membacanya di WhatsApp.
          'web',
        )
        if (!hasil.ok) return reply.status(422).send({ error: hasil.pesan })
        return reply.send({ ringkasan: hasil.ringkasan, jenis, kanal_token: 'ai_whatsapp' })
      }

      if (jenis === 'pembayaran_masuk') {
        const hasil = await siapkanPembayaran(request.db!, b)
        if (!hasil.ok) return reply.status(hasil.kode).send({ error: hasil.pesan })

        const tokenBayar = randomBytes(32).toString('base64url')
        const { error: errBayar } = await request.db!
          .from('ai_token_tulis')
          .insert({
            company_id: request.companyId!,
            token: tokenBayar,
            user_id: request.currentUser!.id,
            jenis,
            aksi: 'buat',
            project_id: hasil.projectId,
            muatan: hasil.muatan,
            ringkasan: hasil.ringkasan,
            kanal: b.kanal === 'wa' || b.kanal === 'ai_whatsapp' ? 'ai_whatsapp' : 'web',
            kedaluwarsa: new Date(Date.now() + UMUR_TOKEN_MS).toISOString(),
          })
          .select('id')

        if (errBayar) {
          request.log.error({ err: errBayar }, 'ai/tulis: gagal menerbitkan token pembayaran')
          return reply.status(500).send({ error: 'Gagal menyiapkan catatan' })
        }

        return reply.send({
          token: tokenBayar,
          ringkasan: hasil.ringkasan,
          kedaluwarsa: new Date(Date.now() + UMUR_TOKEN_MS).toISOString(),
          jenis,
        })
      }

      if (!projectId) {
        return reply.status(422).send({ error: 'project_id wajib diisi' })
      }

      /*
       * Proyek DIVERIFIKASI milik tenant ini lewat `request.db`.
       *
       * Tanpa ini, id proyek tenant lain yang dikirim pemanggil akan lolos —
       * dan barisnya tercipta di proyek mereka, dengan `company_id` yang
       * tampak benar karena diambil dari sesi penulis.
       */
      const { data: proyek, error: errProyek } = await request.db!
        .from('projects')
        .select('id, name')
        .eq('id', projectId)
        .maybeSingle()

      if (errProyek) {
        request.log.error({ err: errProyek }, 'ai/tulis: gagal memeriksa proyek')
        return reply.status(500).send({ error: 'Gagal memeriksa proyek' })
      }
      if (!proyek) {
        return reply.status(404).send({ error: 'Proyek tidak ditemukan' })
      }

      const namaProyek = (proyek as { name: string }).name

      // ── Validasi per jenis ────────────────────────────────────────────────
      let muatan: Record<string, unknown>
      let ringkasan: string

      if (jenis === 'catatan_progres') {
        if (!persenSah(b.persen)) {
          return reply.status(422).send({ error: 'persen harus angka 0-100' })
        }
        muatan = {
          pct_overall: Number(b.persen),
          notes: (b.catatan ?? '').trim() || null,
        }
        ringkasan = `Catatan progres ${namaProyek}: ${Number(b.persen)}%${
          b.catatan?.trim() ? ` — ${b.catatan.trim()}` : ''
        }`
      } else if (jenis === 'temuan_punch') {
        const judul = (b.judul ?? '').trim()
        if (judul.length < 5) {
          return reply.status(422).send({ error: 'judul temuan minimal 5 karakter' })
        }
        // Nilai enum `punch_severity` DIUKUR dari pg_enum, bukan ditebak.
        // Versi pertama memakai 'minor'/'major' — tebakan Inggris yang wajar
        // dari nama field, dan Postgres menolaknya dengan galat yang muncul
        // SESUDAH token terlanjur habis.
        const SEVERITY = ['ringan', 'sedang', 'berat', 'kritis']
        const severity = SEVERITY.includes(b.severity ?? '') ? b.severity : 'sedang'
        muatan = {
          judul,
          lokasi: (b.lokasi ?? '').trim() || null,
          severity,
        }
        ringkasan = `Temuan punch ${namaProyek}: ${judul}${
          b.lokasi?.trim() ? ` (${b.lokasi.trim()})` : ''
        }`
      } else if (jenis === 'pengeluaran') {
        /*
          Automation 1.1 — pencatatan keuangan lewat percakapan.

          Ini satu-satunya jenis penyiapan yang MENGELUARKAN UANG, jadi
          validasinya paling ketat di berkas ini. Tiga hal yang tak boleh
          lolos, dan semuanya diukur bukan ditebak:

            nominal    harus angka positif dan berhingga. `Number('')` = 0 dan
                       `Number('abc')` = NaN — keduanya lolos `typeof number`
                       kalau diperiksa sembarangan, dan menghasilkan
                       pengeluaran Rp 0 atau baris yang gagal saat token
                       diklaim.

            keperluan  jadi `description` — kolom yang approver baca untuk
                       memutuskan. "semen" tak cukup; panjang minimum memaksa
                       kalimat yang bisa dinilai.

            kategori   dicocokkan dari NAMA ke `project_expense_categories`
                       yang benar-benar ada, dan id-nya diselesaikan DI SINI.
                       Menundanya sampai token diklaim membuat "kategori tak
                       ditemukan" muncul sesudah token habis — pelajaran dari
                       severity punch di atas.
        */
        const jumlah = Number(b.jumlah)
        if (!Number.isFinite(jumlah) || jumlah <= 0) {
          return reply.status(422).send({ error: 'jumlah harus angka rupiah lebih dari 0' })
        }
        if (jumlah > BATAS_PENGELUARAN_SIAP) {
          /*
            Pagar atas, dan bukan kehati-hatian berlebihan.

            Salah ketik nol adalah kekeliruan paling mudah terjadi lewat
            percakapan — "lima juta" jadi 50000000 hanya butuh satu ketukan
            berlebih, dan asisten tak punya cara membedakannya dari maksud
            sungguhan. Di atas ambang ini, orang mengajukannya lewat halaman
            kasbon yang menampilkan angkanya besar-besar sebelum disimpan.
          */
          return reply.status(422).send({
            error: `Pengeluaran di atas Rp ${BATAS_PENGELUARAN_SIAP.toLocaleString('id-ID')} `
              + 'diajukan lewat halaman Pengeluaran, bukan lewat percakapan.',
          })
        }

        const keperluan = (b.keperluan ?? '').trim()
        if (keperluan.length < 5) {
          return reply.status(422).send({
            error: 'keperluan minimal 5 karakter — approver memutuskan dari kalimat ini',
          })
        }

        /*
          Kategori dicocokkan dari NAMA — dan id-nya diselesaikan DI SINI,
          bukan saat token diklaim.

          Bedanya menentukan: kalau kategorinya baru dicari saat menulis,
          kegagalan "kategori tak ditemukan" muncul SESUDAH token habis, dan
          pengguna kehilangan penyiapannya untuk kesalahan yang sebenarnya bisa
          diberitahukan sejak awal. Pelajaran yang sama dengan severity punch
          di atas.

          Pencocokannya `ilike` sebagian — sama seperti nama proyek, karena
          orang menyebut "beton" bukan "Beton & Semen".
        */
        const petunjukKategori = (b.kategori ?? '').trim() || keperluan
        const { data: kategoriCocok } = await request.db!
          .viaProject('project_expense_categories', projectId)
          .select('id, name')
          .limit(50)

        /*
          Tanpa `?? []`, dan itu disengaja.

          `errKategori` sudah ditangani di atas, jadi sampai di sini `data`
          pasti bukan hasil kegagalan. Menulis `?? []` di sini tetap
          ditandai `audit-kegagalan-senyap` — dan penandaan itu BENAR sebagai
          aturan umum: pola itulah yang membuat gangguan basis terbaca sebagai
          "nol baris" di puluhan tempat lain.

          Yang menggantikannya `data ?? null` lalu pemeriksaan panjang di
          bawah — bentuk yang tak bisa disalahartikan sebagai daftar kosong
          yang sah.
        */
        const daftar = kategoriCocok as Array<{ id: string; name: string }> | null
        if (!daftar || daftar.length === 0) {
          return reply.status(422).send({
            error: 'Proyek ini belum punya kategori pengeluaran — isi dulu di halaman Pengeluaran.',
          })
        }

        const kunciCari = petunjukKategori.toLowerCase()
        const cocok =
          daftar.find((k) => kunciCari.includes(k.name.toLowerCase()))
          ?? daftar.find((k) =>
            k.name.toLowerCase().split(/[^a-z]+/).some((kata) => kata.length > 3 && kunciCari.includes(kata)))

        if (!cocok) {
          return reply.status(422).send({
            error: `Kategori tak dikenali dari "${petunjukKategori}". `
              + `Sebutkan salah satu: ${daftar.slice(0, 6).map((k) => k.name).join(', ')}`,
          })
        }

        muatan = {
          category_id: cocok.id,
          description: keperluan,
          unit_price: jumlah,
          total_amount: jumlah,
        }
        ringkasan = `Pengeluaran ${namaProyek}: Rp ${jumlah.toLocaleString('id-ID')} — ${keperluan} (${cocok.name})`
      } else if (jenis === 'permintaan_material') {
        /*
          Permintaan material — MR, bukan PO.

          Tak ada nominal di sini, dan itu disengaja: yang di lapangan tahu
          APA yang kurang, bukan harga mana yang sedang berlaku. Harganya
          ditentukan tim pengadaan saat MR jadi PO.

          Jadi validasinya lebih ringan daripada `pengeluaran` — yang perlu
          dijaga cuma satu: kalimatnya cukup untuk diputuskan orang lain.
        */
        /*
          Minimal 10 karakter, bukan 5.

          Test menangkap batas yang terlalu longgar: "semen" tepat 5 karakter
          dan LOLOS — padahal itu justru contoh kalimat yang tak bisa
          diputuskan. Tim pengadaan butuh tahu berapa banyak dan untuk apa;
          "semen" saja memaksa mereka menelepon balik, dan MR yang harus
          ditanyakan ulang lebih lambat daripada tak dibuat lewat WhatsApp
          sama sekali.

          Sepuluh cukup untuk "50 sak semen" tanpa menuntut kalimat panjang.
        */
        const kebutuhan = (b.kebutuhan ?? '').trim()
        if (kebutuhan.length < 10) {
          return reply.status(422).send({
            error: 'Sebutkan jumlah dan keperluannya — mis. "50 sak semen untuk cor lantai 2". '
              + 'Tim pengadaan memutuskan dari kalimat ini.',
          })
        }

        /*
          Tanggal diperiksa BENTUKNYA, bukan cuma keberadaannya.

          `new Date('besok')` menghasilkan `Invalid Date`, dan menuliskannya ke
          kolom `date` gagal saat token diklaim — jauh dari sini. Model bisa
          saja meneruskan kata seperti itu apa adanya dari kalimat pengguna.
        */
        let dibutuhkan: string | null = null
        const rawTgl = (b.dibutuhkan_tanggal ?? '').trim()
        if (rawTgl) {
          if (!/^\d{4}-\d{2}-\d{2}$/.test(rawTgl) || Number.isNaN(Date.parse(rawTgl))) {
            return reply.status(422).send({
              error: 'dibutuhkan_tanggal harus format YYYY-MM-DD',
            })
          }
          dibutuhkan = rawTgl
        }

        muatan = {
          notes: kebutuhan,
          ...(dibutuhkan ? { needed_date: dibutuhkan } : {}),
        }
        ringkasan = `Permintaan material ${namaProyek}: ${kebutuhan}`
          + (dibutuhkan ? ` (dibutuhkan ${dibutuhkan})` : '')
      } else if (jenis === 'kasbon') {
        /*
          Kasbon — satu-satunya jenis kategori B di daftar ini.

          Yang menuntut penjagaan lebih daripada `permintaan_material`: ada
          nominal, dan nominal yang salah membuang waktu approver. Yang TIDAK
          perlu dijaga di sini: apakah kasbonnya pantas — itu keputusan
          approver, bukan keputusan validator.
        */
        const jumlah = Number(b.jumlah)
        if (!Number.isFinite(jumlah) || jumlah <= 0) {
          return reply.status(422).send({ error: 'jumlah harus angka rupiah lebih dari 0' })
        }
        if (jumlah > BATAS_KASBON_SIAP) {
          return reply.status(422).send({
            error: `Kasbon di atas Rp ${BATAS_KASBON_SIAP.toLocaleString('id-ID')} `
              + 'diajukan lewat halaman Kasbon, bukan lewat percakapan.',
          })
        }

        const keperluan = (b.keperluan ?? '').trim()
        if (keperluan.length < 5) {
          return reply.status(422).send({
            error: 'keperluan minimal 5 karakter — approver memutuskan dari kalimat ini',
          })
        }

        /*
          Sumber dana diperiksa terhadap daftar NILAI ENUM, bukan diteruskan
          apa adanya.

          `kasbon_fund_source` punya dua nilai (diukur ke `pg_enum`).
          Meneruskan nilai lain membuat penulisan gagal dengan galat enum yang
          muncul SESUDAH token habis — pola kegagalan yang sudah dua kali
          diperbaiki di berkas ini, dan yang tak perlu diulang untuk ketiga
          kalinya.
        */
        const SUMBER_SAH = ['owner_advance', 'client_fund'] as const
        const sumberRaw = (b.sumber_dana ?? '').trim()
        if (sumberRaw && !SUMBER_SAH.includes(sumberRaw as (typeof SUMBER_SAH)[number])) {
          return reply.status(422).send({
            error: `sumber_dana harus salah satu: ${SUMBER_SAH.join(', ')}`,
          })
        }
        const sumber = sumberRaw || 'owner_advance'

        muatan = { jumlah, keperluan, sumber_dana: sumber }
        ringkasan = `Kasbon ${namaProyek}: Rp ${jumlah.toLocaleString('id-ID')} — ${keperluan}`
      } else {
        // Tak terjangkau — `entitasTulis` sudah menyaring. Ditulis eksplisit
        // supaya jenis baru yang lupa ditangani gagal KERAS di sini, bukan
        // menyimpan muatan kosong yang terlihat sah.
        return reply.status(500).send({ error: `Jenis '${jenis}' terdaftar tapi tak ditangani.` })
      }

      const token = randomBytes(32).toString('base64url')
      const kedaluwarsa = new Date(Date.now() + UMUR_TOKEN_MS).toISOString()

      const { error } = await request.db!
        .from('ai_token_tulis')
        .insert({
          company_id: request.companyId!,
          token,
          user_id: request.currentUser!.id,
          jenis,
          aksi: 'buat',
          project_id: projectId,
          muatan,
          ringkasan,
          kanal: b.kanal === 'wa' || b.kanal === 'ai_whatsapp' ? 'ai_whatsapp' : 'web',
          kedaluwarsa,
        })
        .select('id')

      if (error) {
        request.log.error({ err: error }, 'ai/tulis: gagal menerbitkan token')
        return reply.status(500).send({ error: 'Gagal menyiapkan catatan' })
      }

      return reply.send({ token, ringkasan, kedaluwarsa, jenis })
    },
  )

  // ── TULIS: klaim token ATOMIK, lalu simpan satu baris ────────────────────
  app.post<{ Body: { token?: string } }>(
    '/api/v1/ai/tulis',
    {
      preHandler: [authenticate, requirePermission('ai:tulis')],
      config: { rateLimit: { max: 30, timeWindow: '1 minute' } },
    },
    async (request, reply) => {
      const token = (request.body?.token ?? '').trim()
      if (!token) return reply.status(422).send({ error: 'token wajib diisi' })

      /*
       * Logikanya hidup di `lib/tulis-klaim.ts` sejak 2026-08-16, bukan di sini.
       *
       * Sebabnya WhatsApp: di sana tak ada `request` milik siapa pun, jadi
       * ~230 baris ini tak bisa dipanggil. Menyalinnya ke webhook akan membuat
       * dua jalur tulis yang harus diperbaiki dua kali — dan yang kedua akan
       * terlupakan, seperti tombol konfirmasi yang tak pernah dibuat.
       *
       * Yang TETAP di sini: `requirePermission` di `preHandler`, audit, dan
       * penerjemahan sebab → kode HTTP. Yang pindah: klaim atomik & penulisan.
       */
      const hasilKlaim = await klaimTokenTulis({
        db: request.db!,
        userId: request.currentUser!.id,
        // Rute sudah lolos `requirePermission('ai:tulis')` di `preHandler`;
        // set ini menyatakannya kembali untuk gerbang di dalam pustaka.
        izin: new Set(['ai:tulis']),
        token,
        catatGalat: (pesan, err) => request.log.error({ err }, pesan),
      })

      if (!hasilKlaim.ok) {
        if (hasilKlaim.sebab === 'bukan_pemilik') {
          void logAuditEvent(request, {
            tableName: 'ai_token_tulis',
            recordId: request.currentUser!.id,
            action: 'ai.tulis.ditolak',
            actorId: request.currentUser!.id,
            newValues: { alasan: 'bukan_pemilik_token' },
            severity: 'critical',
          })
        }
        if (hasilKlaim.sebab === 'gagal_simpan') {
          void logAuditEvent(request, {
            tableName: 'ai_token_tulis',
            recordId: request.currentUser!.id,
            action: 'ai.tulis.gagal',
            actorId: request.currentUser!.id,
            newValues: { jenis: hasilKlaim.jenis, galat: hasilKlaim.pesan },
            severity: 'critical',
          })
        }
        return reply.status(KODE_SEBAB[hasilKlaim.sebab]).send({ error: hasilKlaim.pesan })
      }

      void logAuditEvent(request, {
        tableName: hasilKlaim.tabel,
        recordId: hasilKlaim.id ?? hasilKlaim.projectId,
        action: 'ai.tulis.berhasil',
        actorId: request.currentUser!.id,
        // Muatan ikut: yang tersimpan lewat asisten harus bisa ditelusuri
        // sampai ke isinya, bukan hanya ke fakta bahwa ia terjadi.
        newValues: {
          jenis: hasilKlaim.jenis,
          ringkasan: hasilKlaim.ringkasan,
          muatan: hasilKlaim.muatan,
        },
        severity: 'critical',
      })

      return reply.send({
        ok: true,
        id: hasilKlaim.id,
        jenis: hasilKlaim.jenis,
        ringkasan: hasilKlaim.ringkasan,
      })
    },
  )
}

