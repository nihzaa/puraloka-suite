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

import type { FastifyInstance } from 'fastify'
import { randomBytes } from 'node:crypto'
import { authenticate, requirePermission } from '../../plugins/auth.js'
import { logAuditEvent } from '../../utils/audit.js'
import { ENTITAS_TULIS, entitasTulis, persenSah } from '../../lib/ai-tool-siapkan.js'

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

interface BadanSiapkan {
  jenis?: string
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

      const { data: lihat, error: errLihat } = await request.db!
        .from('ai_token_tulis')
        .select('id, user_id, jenis, aksi, project_id, muatan, ringkasan, kedaluwarsa, dipakai_pada')
        .eq('token', token)
        .maybeSingle()

      if (errLihat) {
        // Gangguan basis TIDAK boleh menyamar jadi "token tak dikenal" — kalau
        // dibiarkan, jejak audit terisi orang yang tak melakukan kesalahan.
        request.log.error({ err: errLihat }, 'ai/tulis: gagal membaca token')
        return reply.status(503).send({ error: 'Gagal memeriksa token. Coba lagi.' })
      }
      if (!lihat) return reply.status(410).send({ error: 'Token tidak dikenal.' })

      const t = lihat as {
        id: string
        user_id: string
        jenis: string
        aksi: string
        project_id: string
        muatan: Record<string, unknown>
        ringkasan: string
        kedaluwarsa: string
        dipakai_pada: string | null
      }

      if (t.user_id !== request.currentUser!.id) {
        void logAuditEvent(request, {
          tableName: 'ai_token_tulis',
          recordId: request.currentUser!.id,
          action: 'ai.tulis.ditolak',
          actorId: request.currentUser!.id,
          newValues: { alasan: 'bukan_pemilik_token' },
          severity: 'critical',
        })
        return reply.status(403).send({ error: 'Token ini bukan milik Anda.' })
      }
      if (t.dipakai_pada) return reply.status(409).send({ error: 'Token sudah dipakai.' })
      if (new Date(t.kedaluwarsa).getTime() < Date.now()) {
        return reply.status(410).send({ error: 'Token sudah kedaluwarsa.' })
      }

      /*
       * Klaim ATOMIK sebelum menulis apa pun.
       *
       * `dipakai_pada IS NULL` ikut di WHERE — basis yang menengahi. Dengan
       * baca-lalu-tulis, dua klik bersamaan sama-sama melihat "belum dipakai"
       * dan DUA baris tercipta; pengguna melihat catatan gandanya dan tak
       * tahu mana yang benar.
       */
      const { data: diklaim, error: errKlaim } = await request.db!
        .from('ai_token_tulis')
        .update({ dipakai_pada: new Date().toISOString() })
        .eq('id', t.id)
        .is('dipakai_pada', null)
        .select('id')

      if (errKlaim) {
        request.log.error({ err: errKlaim }, 'ai/tulis: gagal mengklaim token')
        return reply.status(503).send({ error: 'Gagal mengklaim token' })
      }
      if (!diklaim || (diklaim as unknown[]).length === 0) {
        return reply.status(409).send({ error: 'Token sudah dipakai.' })
      }

      const meta = entitasTulis(t.jenis)
      if (!meta) {
        return reply.status(500).send({ error: `Jenis '${t.jenis}' tak dikenal lagi.` })
      }

      // ── Tulisan sesungguhnya ─────────────────────────────────────────────
      //
      // `viaProject`: kedua tabel kategori C, dan wrapper menolak `.from()`
      // untuk keduanya di titik pemanggilan.
      const dasar = { project_id: t.project_id }

      /*
       * `punch_items.nomor` WAJIB dan UNIK per proyek — diukur dari
       * information_schema dan `uq_punch_items_project_nomor`, bukan ditebak.
       * Formatnya `PL-YYMM-NNN`, mengikuti baris yang sudah ada.
       *
       * Nomor dihitung dari yang TERTINGGI di proyek itu, bukan dari jumlah
       * baris: baris yang pernah dihapus akan membuat hitungan menabrak nomor
       * yang masih terpakai, dan galatnya muncul sebagai "gagal menyimpan"
       * yang tak menyebut sebabnya.
       */
      let nomorBaru: string | null = null
      if (t.jenis === 'temuan_punch') {
        const { data: adaNomor } = await request.db!
          .viaProject('punch_items', t.project_id)
          .select('nomor')
          .eq('project_id', t.project_id)
          .order('nomor', { ascending: false })
          .limit(1)

        const kini = new Date()
        const yymm = `${String(kini.getFullYear()).slice(2)}${String(kini.getMonth() + 1).padStart(2, '0')}`
        const terakhir = (adaNomor as Array<{ nomor: string }> | null)?.[0]?.nomor ?? ''
        const urut = Number(terakhir.split('-').pop()) || 0
        nomorBaru = `PL-${yymm}-${String(urut + 1).padStart(3, '0')}`
      }
      // `Record<string, unknown>`: bentuk barisnya BERBEDA per jenis, dan
      // menyatukannya jadi satu tipe akan menuntut union yang harus diperbarui
      // tiap entitas baru — persis jenis pekerjaan yang pasti terlupakan.
      /*
        Cabang EKSPLISIT per jenis, bukan ternary dua arah.

        Bentuk sebelumnya (`catatan_progres ? … : …`) memperlakukan segala
        yang bukan catatan progres sebagai temuan punch. Itu benar selama
        hanya ada dua jenis — dan diam-diam salah begitu jenis ketiga
        ditambahkan: kasbon akan disimpan dengan `nomor` dan `status:
        'terbuka'` milik punch, lalu Postgres menolaknya dengan galat yang
        muncul SESUDAH token habis.

        Sekarang jenis yang tak dikenali gagal keras di `default`, sejalan
        dengan cabang `else` di jalur penyiapan.
      */
      let baris: Record<string, unknown>
      switch (t.jenis) {
        case 'catatan_progres':
          baris = {
            ...dasar,
            ...t.muatan,
            reported_by: request.currentUser!.id,
            logged_at: new Date().toISOString(),
          }
          break
        case 'temuan_punch':
          baris = {
            ...dasar,
            ...t.muatan,
            nomor: nomorBaru,
            status: 'terbuka',
            ditemukan_oleh: request.currentUser!.id,
          }
          break
        case 'pengeluaran':
          /*
            `status` SENGAJA tidak diisi — bawaan kolomnya `draft`, dan itu
            yang benar: pengeluaran yang lahir dari percakapan tetap lewat
            rantai approval `project_expense` yang sama dengan pengajuan lewat
            halaman biasa.

            Menuliskannya `approved` di sini akan membuat AI mengeluarkan uang
            tanpa satu pun persetujuan — persis kelas cacat yang gerbang PO
            kemarin tutup.

            `qty` juga tidak diisi (bawaan 1, diukur ke information_schema):
            "semen 20 sak" adalah keterangan, bukan rincian qty×harga. Memaksa
            model membaginya berarti mengarang angka satuan yang tak seorang
            pun sebutkan.
          */
          baris = {
            ...dasar,
            ...t.muatan,
            /*
              `expense_source` DIISI eksplisit, tidak dibiarkan bawaan.

              Bawaan kolomnya `petty_cash`, dan constraint
              `chk_petty_cash_source` menuntut `petty_cash_id` terisi untuk
              nilai itu. Membiarkannya bawaan membuat penulisan GAGAL dengan
              galat constraint yang muncul sesudah token habis — persis pola
              yang komentar severity punch di atas peringatkan, dan yang
              tertangkap test ini sebelum sampai ke pengguna.

              `main_cash` dipilih karena ia satu-satunya sumber yang tak
              menuntut penunjuk kas tertentu. Kalau pengeluarannya sungguh
              dari kas kecil, orang mengoreksinya di halaman Pengeluaran —
              sama seperti ia mengoreksi kategori yang salah tebak.
            */
            expense_source: 'main_cash',
            submitted_by: request.currentUser!.id,
          }
          break
        case 'permintaan_material':
          /*
            `mr_number` SENGAJA tidak diisi — `trg_generate_mr_number`
            mengisinya (diukur ke `pg_trigger`). Menghitungnya sendiri dari
            jumlah baris akan menabrak nomor yang masih terpakai begitu ada
            MR yang pernah dihapus, dan galatnya muncul sebagai "gagal
            menyimpan" yang tak menyebut sebabnya.

            `status` juga tidak diisi: bawaannya membuat MR ini masuk antrean
            approval yang sama dengan pengajuan lewat halaman biasa. MR yang
            lahir dari percakapan tak boleh melewati satu pun gerbang.
          */
          baris = {
            ...dasar,
            ...t.muatan,
            requested_by: request.currentUser!.id,
          }
          break
        default:
          request.log.error({ jenis: t.jenis }, 'ai/tulis: jenis tak dikenali saat menulis')
          return reply.status(500).send({
            error: `Jenis '${t.jenis}' belum punya bentuk baris — penyiapannya lolos tetapi penulisannya tidak.`,
          })
      }

      const { data: hasil, error: errTulis } = await request.db!
        .viaProject(meta.tabel, t.project_id)
        .insert(baris)
        .select('id')

      if (errTulis) {
        /*
         * Token SUDAH habis meski tulisannya gagal, dan itu disengaja.
         *
         * Mengembalikannya berarti token bisa dicoba berulang kali — pintu
         * untuk mencoba-coba sampai satu percobaan lolos. Pengguna cukup
         * meminta asisten menyiapkan lagi; ongkosnya satu pesan.
         */
        request.log.error({ err: errTulis, jenis: t.jenis }, 'ai/tulis: gagal menyimpan')
        void logAuditEvent(request, {
          tableName: meta.tabel,
          recordId: t.project_id,
          action: 'ai.tulis.gagal',
          actorId: request.currentUser!.id,
          newValues: { jenis: t.jenis, galat: errTulis.message },
          severity: 'critical',
        })
        return reply.status(500).send({ error: `Gagal menyimpan: ${errTulis.message}` })
      }

      const idBaru = (hasil as Array<{ id: string }>)?.[0]?.id ?? null

      // Jejak dari NIAT ke HASIL: tanpa `hasil_id`, tak ada cara menghubungkan
      // baris yang tercipta dengan token yang membuatnya.
      //
      // best-effort: barisnya SUDAH tersimpan. Nol baris di sini hanya berarti
      // tokennya lenyap di antara klaim dan penautan — jejaknya putus, tetapi
      // membatalkan tulisan yang sudah ada jauh lebih berisiko. Dicatat di
      // bawah supaya putusnya terlihat.
      const { error: errJejak } = await request.db!
        .from('ai_token_tulis')
        .update({ hasil_id: idBaru })
        .eq('id', t.id)
        .select('id')

      // Gagal menautkan jejak TIDAK membatalkan tulisannya — barisnya sudah
      // ada, dan membatalkan sesuatu yang sudah tersimpan lebih berisiko
      // daripada kehilangan tautannya. Tapi ia juga tak boleh hilang:
      // "siapa yang mencatat ini lewat asisten?" jadi tak terjawab.
      if (errJejak) {
        request.log.error(
          { err: errJejak, token: t.id, hasil: idBaru },
          'ai/tulis: hasil_id gagal ditautkan — jejak niat→hasil terputus',
        )
      }

      void logAuditEvent(request, {
        tableName: meta.tabel,
        recordId: idBaru ?? t.project_id,
        action: 'ai.tulis.berhasil',
        actorId: request.currentUser!.id,
        // Muatan ikut: yang tersimpan lewat asisten harus bisa ditelusuri
        // sampai ke isinya, bukan hanya ke fakta bahwa ia terjadi.
        newValues: { jenis: t.jenis, ringkasan: t.ringkasan, muatan: t.muatan },
        severity: 'critical',
      })

      return reply.send({ ok: true, id: idBaru, jenis: t.jenis, ringkasan: t.ringkasan })
    },
  )
}
