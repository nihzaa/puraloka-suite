import type { FastifyInstance } from 'fastify'
import * as XLSX from 'xlsx'
import { authenticate, requirePermission } from '../../plugins/auth.js'
import { supabase } from '../../utils/supabase.js'
import { logAuditEvent } from '../../utils/audit.js'
import {
  usulkanPemetaan, validasi, BATAS_BARIS,
  type SkemaImpor,
} from '../../lib/importer.js'
import { terminPemasok } from '../../lib/importer-nilai.js'
import {
  susunEkspor, formatSah, FORMAT_EKSPOR,
} from '../../lib/ekspor-tabel.js'

/**
 * Batas baris per berkas ekspor.
 *
 * PostgREST memotong SENYAP di 1.000 baris. Berkas yang terpotong diam-diam
 * lebih berbahaya daripada ekspor yang gagal: orang menyuntingnya lalu
 * mengimpornya kembali, dan yang tak ikut terekspor terlihat seperti data
 * yang memang tak ada.
 *
 * Karena itu batasnya DISEBUT, dan kelebihannya DILAPORKAN lewat header.
 */
const BATAS_EKSPOR = 5000

/**
 * IMPORTER GENERIK (TJS-P3) — unggah → petakan → pratinjau → commit.
 *
 * ── Empat tahap, dan yang ketiga TIDAK MENULIS APA PUN
 *
 *   1. `POST /impor/baca`      berkas → judul kolom + usulan pemetaan
 *   2. (di layar)              pengguna mengoreksi pemetaan
 *   3. `POST /impor/pratinjau` validasi penuh, NOL tulisan ke tabel target
 *   4. `POST /impor/commit`    satu transaksi, all-or-nothing
 *
 * Tahap 3 yang membedakan importer ini dari yang sudah ada di `rab.ts`: di
 * sana validasi dan penulisan menyatu, dan berkas dengan satu baris rusak
 * meninggalkan data setengah jadi.
 *
 * ── Kenapa commit lewat RPC, bukan perulangan di sini
 *
 * Supabase client tak punya transaksi. Menulis 500 baris berarti 500
 * permintaan terpisah — gagal di baris ke-300 meninggalkan 299 yang masuk.
 * `impor_commit` (migrasi 316) adalah satu pemanggilan = satu transaksi.
 *
 * ── Skema di KODE, sama alasannya dengan sumber laporan (G6d)
 *
 * "Tabel mana yang boleh ditulis massal" tak boleh bisa diubah lewat UI.
 */

const SKEMA: SkemaImpor[] = [
  {
    kunci: 'material',
    label: 'Material Gudang',
    keterangan: 'Daftar material beserta satuan, harga, dan stok minimum.',
    kolom: [
      { kunci: 'code', label: 'Kode', jenis: 'teks', wajib: false, alias: ['kode barang', 'sku', 'kode material'] },
      { kunci: 'name', label: 'Nama', jenis: 'teks', wajib: true, alias: ['nama barang', 'nama material', 'deskripsi'] },
      { kunci: 'unit', label: 'Satuan', jenis: 'teks', wajib: true, alias: ['uom', 'satuan unit'] },
      { kunci: 'unit_price', label: 'Harga Satuan', jenis: 'angka', wajib: false, alias: ['harga', 'harga satuan rp'] },
      { kunci: 'min_stock', label: 'Stok Minimum', jenis: 'angka', wajib: false, alias: ['stok min', 'minimum stok'] },
      { kunci: 'is_active', label: 'Aktif', jenis: 'bool', wajib: false, alias: ['status aktif'] },
    ],
  },
  {
    kunci: 'supplier',
    label: 'Pemasok',
    keterangan: 'Daftar pemasok beserta kontak, kota, dan termin pembayarannya.',
    kolom: [
      { kunci: 'code', label: 'Kode', jenis: 'teks', wajib: false, alias: ['kode supplier', 'kode pemasok', 'kode vendor'] },
      { kunci: 'name', label: 'Nama', jenis: 'teks', wajib: true, alias: ['nama supplier', 'nama pemasok', 'nama vendor', 'nama perusahaan'] },
      { kunci: 'contact_person', label: 'Nama Kontak', jenis: 'teks', wajib: false, alias: ['kontak', 'pic', 'narahubung', 'contact'] },
      { kunci: 'phone', label: 'Telepon', jenis: 'teks', wajib: false, alias: ['no telp', 'nomor telepon', 'hp', 'whatsapp'] },
      { kunci: 'email', label: 'Email', jenis: 'teks', wajib: false, alias: ['surel', 'e mail'] },
      { kunci: 'address', label: 'Alamat', jenis: 'teks', wajib: false, alias: ['alamat lengkap'] },
      { kunci: 'city', label: 'Kota', jenis: 'teks', wajib: false, alias: ['kabupaten', 'kota kabupaten'] },
      // `payment_terms` adalah DAFTAR TERTUTUP di basis
      // (`suppliers_payment_terms_check`: cod · prepaid · net_7 · net_14 ·
      // net_30 · open_account), bukan angka hari dan bukan teks bebas.
      //
      // Diukur 2026-08-16 — dan skema versi pertama saya menuliskannya
      // sebagai angka hari, yang membuat SELURUH berkas ditolak basis.
      // Berkas orang menuliskannya "NET 30", "30 hari", "tunai"; yang
      // memetakannya ke nilai sah adalah `TERMIN_PEMASOK` di
      // `lib/importer-nilai.ts`, bukan importir yang menebak.
      { kunci: 'payment_terms', label: 'Termin Bayar', jenis: 'teks', wajib: false, alias: ['termin', 'tempo', 'payment terms', 'cara bayar'] },
      { kunci: 'credit_limit', label: 'Plafon Kredit', jenis: 'angka', wajib: false, alias: ['limit kredit', 'plafon'] },
      { kunci: 'notes', label: 'Catatan', jenis: 'teks', wajib: false, alias: ['keterangan'] },
      { kunci: 'is_active', label: 'Aktif', jenis: 'bool', wajib: false, alias: ['status aktif'] },
    ],
  },
  {
    kunci: 'cost_code',
    label: 'Cost Code',
    keterangan: 'Struktur kode biaya untuk mengelompokkan anggaran & realisasi.',
    kolom: [
      { kunci: 'code', label: 'Kode', jenis: 'teks', wajib: true, alias: ['kode biaya', 'kode cost code', 'cost code'] },
      { kunci: 'name', label: 'Nama', jenis: 'teks', wajib: true, alias: ['nama biaya', 'uraian', 'deskripsi'] },
      { kunci: 'description', label: 'Keterangan', jenis: 'teks', wajib: false, alias: ['penjelasan', 'catatan'] },
      { kunci: 'category', label: 'Kategori', jenis: 'teks', wajib: false, alias: ['kelompok', 'golongan'] },
    ],
  },
  {
    // Diambil dari `feat/kematangan-modul` (migrasi 441, kini digabung ke
    // 446). Skema ini TIDAK bertabrakan dengan tiga di atas — ia menulis ke
    // `workers`, tabel yang tak disentuh skema lain.
    kunci: 'pekerja',
    label: 'Pekerja (Tukang / Laden / Kenek)',
    keterangan: 'Registry pekerja lapangan. Penugasan ke mandor TIDAK ikut '
      + 'diimpor — itu ditentukan per lingkup kerja, bukan per orang.',
    kolom: [
      { kunci: 'name', label: 'Nama', jenis: 'teks', wajib: true, alias: ['nama pekerja', 'nama tukang', 'nama'] },
      { kunci: 'phone', label: 'Telepon', jenis: 'teks', wajib: false, alias: ['hp', 'no hp', 'wa', 'whatsapp'] },
      // `tukang` / `laden` / `kenek`. Yang lain jadi KOSONG, bukan ditebak —
      // "Tukang Batu" yang ditebak jadi `tukang` akan dipakai laporan
      // komposisi regu sebagai fakta.
      { kunci: 'tipe', label: 'Tipe', jenis: 'teks', wajib: false, alias: ['jenis', 'posisi', 'keahlian'] },
      { kunci: 'notes', label: 'Catatan', jenis: 'teks', wajib: false, alias: ['keterangan'] },
      { kunci: 'is_active', label: 'Aktif', jenis: 'bool', wajib: false, alias: ['status aktif'] },
    ],
  },
]

const cariSkema = (k: string) => SKEMA.find((s) => s.kunci === k) ?? null

/**
 * Menormalkan nilai berdaftar-tertutup SESUDAH `validasi()`.
 *
 * `lib/importer.ts` hanya tahu teks/angka/tanggal/bool — tak ada jenis "salah
 * satu dari daftar". Kolom yang dijaga CHECK di basis diterjemahkan di sini.
 *
 * ⚠ Dipanggil di PRATINJAU **dan** COMMIT, dengan fungsi yang sama. Kalau
 * hanya commit yang menormalkan, pratinjau memperlihatkan "NET 30" lalu yang
 * tersimpan `net_30` — layar berbohong tentang apa yang akan masuk. Kalau
 * hanya pratinjau, commit-nya ditolak basis padahal layar bilang aman.
 */
function normalkanBerdaftar(
  kunciSkema: string,
  baris: Array<Record<string, unknown>>,
): Array<Record<string, unknown>> {
  if (kunciSkema !== 'supplier') return baris
  return baris.map((b) => (
    'payment_terms' in b ? { ...b, payment_terms: terminPemasok(b.payment_terms) } : b
  ))
}

/** Nama tabel per skema — dari KODE, tak pernah dari masukan pengguna. */
const TABEL: Record<string, string> = {
  material: 'materials',
  supplier: 'suppliers',
  cost_code: 'cost_codes',
  pekerja: 'workers',
}

/** Izin per skema. Impor massal menulis ratusan baris sekaligus — ia lebih
 *  dekat ke mengelola daripada membuat satu per satu.
 *
 *  Sengaja BUKAN satu izin untuk semua: yang boleh mengimpor material tak
 *  otomatis boleh mengimpor pemasok — daftar pemasok menentukan ke mana uang
 *  perusahaan keluar. */
const IZIN: Record<string, string> = {
  material: 'gudang:manage',
  supplier: 'procurement:supplier:manage',
  cost_code: 'cecep:cost_code:manage',
  // Diukur ada di tabel `permissions` sebelum dipakai — kunci hantu menolak
  // SEMUA orang tanpa gejala apa pun.
  pekerja: 'mandor:worker:manage',
}

interface BodiBaca { skema?: string; berkas_base64?: string }

export default async function importerRoutes(app: FastifyInstance) {
  // ── GET /impor/skema ─────────────────────────────────────────────────────
  app.get(
    '/api/v1/impor/skema',
    { preHandler: [authenticate] },
    async (_request, reply) => reply.send({
      skema: SKEMA.map((s) => ({
        kunci: s.kunci, label: s.label, keterangan: s.keterangan, kolom: s.kolom,
      })),
      batas_baris: BATAS_BARIS,
    }),
  )

  // ── GET /impor/:skema/template — CSV ber-BOM ─────────────────────────────
  app.get<{ Params: { skema: string } }>(
    '/api/v1/impor/:skema/template',
    { preHandler: [authenticate] },
    async (request, reply) => {
      const s = cariSkema(request.params.skema)
      if (!s) return reply.status(404).send({ error: 'Skema tidak dikenal' })

      const judul = s.kolom.map((k) => k.wajib ? `${k.label}*` : k.label).join(',')

      // ⚠ BOM UTF-8 (﻿) WAJIB. Tanpanya, Excel di Windows membaca CSV
      // sebagai ANSI dan "Ukuran Ø12mm" berubah jadi "Ukuran Ã˜12mm" —
      // pengguna memperbaikinya manual di 500 baris, atau lebih buruk,
      // mengimpornya begitu saja.
      const isi = '﻿' + judul + '\n'

      return reply
        .header('content-type', 'text/csv; charset=utf-8')
        .header('content-disposition', `attachment; filename="template-${s.kunci}.csv"`)
        .send(isi)
    },
  )

  // ── POST /impor/baca — tahap 1 ───────────────────────────────────────────
  app.post<{ Body: BodiBaca }>(
    '/api/v1/impor/baca',
    { preHandler: [authenticate] },
    async (request, reply) => {
      const b = request.body ?? {}
      const s = cariSkema(b.skema ?? '')
      if (!s) return reply.status(400).send({ error: 'Skema tidak dikenal' })
      if (!b.berkas_base64) return reply.status(400).send({ error: 'Berkas wajib diunggah' })

      let baris: Array<Record<string, unknown>>
      let judul: string[]
      try {
        const buf = Buffer.from(b.berkas_base64, 'base64')
        const wb = XLSX.read(buf, { type: 'buffer' })
        const sheet = wb.Sheets[wb.SheetNames[0]]
        if (!sheet) return reply.status(400).send({ error: 'Berkas tak punya lembar data' })

        const mentah = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '' })
        baris = mentah
        judul = Object.keys(mentah[0] ?? {})
      } catch (e) {
        request.log.error({ err: e }, 'gagal membaca berkas impor')
        return reply.status(400).send({
          error: 'Berkas tak bisa dibaca. Pastikan formatnya CSV atau Excel (.xlsx).',
        })
      }

      if (baris.length === 0) {
        return reply.status(400).send({ error: 'Berkas tak berisi satu baris data pun' })
      }
      if (baris.length > BATAS_BARIS) {
        return reply.status(400).send({
          error: `Berkas berisi ${baris.length} baris, melebihi batas ${BATAS_BARIS}. `
            + 'Satu transaksi sebesar itu mengunci tabel dan membuat seluruh '
            + 'aplikasi menunggu — pecah berkasnya.',
        })
      }

      return reply.send({
        judul,
        jumlah_baris: baris.length,
        usulan: usulkanPemetaan(judul, s),
        // Contoh 5 baris pertama — supaya layar bisa menampilkan isinya
        // saat pengguna memetakan, bukan hanya nama kolomnya.
        contoh: baris.slice(0, 5),
      })
    },
  )

  // ── POST /impor/pratinjau — tahap 3, NOL tulisan ─────────────────────────
  app.post<{
    Body: { skema?: string; baris?: Array<Record<string, unknown>>; pemetaan?: Record<string, string> }
  }>(
    '/api/v1/impor/pratinjau',
    { preHandler: [authenticate] },
    async (request, reply) => {
      const b = request.body ?? {}
      const s = cariSkema(b.skema ?? '')
      if (!s) return reply.status(400).send({ error: 'Skema tidak dikenal' })
      if (!Array.isArray(b.baris) || b.baris.length === 0) {
        return reply.status(400).send({ error: 'Tak ada baris untuk divalidasi' })
      }
      if (b.baris.length > BATAS_BARIS) {
        return reply.status(400).send({ error: `Melebihi batas ${BATAS_BARIS} baris` })
      }

      const h = validasi(b.baris, s, b.pemetaan ?? {})

      return reply.send({
        wajib_hilang: h.wajibHilang,
        galat: h.galat,
        jumlah_siap: h.galat.length === 0 && h.wajibHilang.length === 0 ? h.siap.length : 0,
        // Contoh hasil parsing — pengguna melihat apa yang AKAN masuk, bukan
        // hanya diberi tahu bahwa tak ada galat. Dinormalkan dengan fungsi
        // yang SAMA dengan commit, supaya yang terlihat = yang tersimpan.
        contoh: normalkanBerdaftar(s.kunci, h.siap.slice(0, 5)),
        bisa_commit: h.galat.length === 0 && h.wajibHilang.length === 0,
      })
    },
  )

  // ── POST /impor/commit — tahap 4, satu transaksi ─────────────────────────
  app.post<{
    Body: { skema?: string; baris?: Array<Record<string, unknown>>; pemetaan?: Record<string, string> }
  }>(
    '/api/v1/impor/commit',
    { preHandler: [authenticate] },
    async (request, reply) => {
      const b = request.body ?? {}
      const s = cariSkema(b.skema ?? '')
      if (!s) return reply.status(400).send({ error: 'Skema tidak dikenal' })

      // Izin per-skema dicek DI SINI, bukan di preHandler: tiap skema menulis
      // ke tabel yang berbeda, dan satu izin untuk semuanya berarti yang
      // boleh mengimpor material otomatis boleh mengimpor apa pun.
      const izin = IZIN[s.kunci]
      const gerbang = requirePermission(izin)
      await gerbang(request, reply)
      if (reply.sent) return

      if (!Array.isArray(b.baris) || b.baris.length === 0) {
        return reply.status(400).send({ error: 'Tak ada baris untuk diimpor' })
      }

      // Divalidasi ULANG di sini, tidak percaya hasil pratinjau. Yang dikirim
      // klien bisa berbeda dari yang divalidasi — dan "sudah lolos pratinjau"
      // adalah klaim klien, bukan fakta server.
      const h = validasi(b.baris, s, b.pemetaan ?? {})
      if (h.wajibHilang.length > 0) {
        return reply.status(400).send({
          error: `Kolom wajib belum dipetakan: ${h.wajibHilang.join(', ')}`,
        })
      }
      if (h.galat.length > 0) {
        return reply.status(400).send({
          error: `Masih ada ${h.galat.length} galat. Perbaiki berkasnya lebih dulu — `
            + 'impor ini all-or-nothing, jadi tak ada sebagian yang masuk.',
          galat: h.galat.slice(0, 50),
        })
      }

      const tabel = TABEL[s.kunci]
      // `request.companyId`, BUKAN `currentUser.companyId` — yang kedua tak
      // ada, dan tsc menangkapnya. Company aktif ditaruh di request oleh
      // `authenticate()` karena ia bisa BERBEDA dari company bawaan pengguna
      // (header `x-company-id`, ADR-011 D6).
      const companyId = request.companyId

      // ⚠ `supabase` mentah, BUKAN `request.db`: RPC bukan query tabel, jadi
      // pembungkus sadar-tenant tak berlaku. Isolasinya dijaga dua lapis —
      // `p_company_id` diambil dari sesi (bukan dari badan permintaan), dan
      // fungsinya SECURITY INVOKER sehingga RLS tetap berlaku.
      const { data, error } = await supabase.rpc('impor_commit', {
        p_tabel: tabel,
        p_company_id: companyId,
        p_baris: normalkanBerdaftar(s.kunci, h.siap),
      })

      if (error) {
        request.log.error({ err: error, skema: s.kunci }, 'commit impor gagal')
        return reply.status(400).send({
          error: `Impor gagal dan TIDAK ADA baris yang masuk. ${error.message}`,
        })
      }

      const masuk = (data as { masuk?: number } | null)?.masuk ?? 0

      await logAuditEvent(request, {
        action: 'INSERT',
        actorId: request.currentUser!.id,
        tableName: tabel,
        recordId: request.currentUser!.id,
        newValues: { impor: s.kunci, baris_masuk: masuk },
      })

      return reply.send({ masuk, skema: s.kunci })
    },
  )

  // ══════════════════════════════════════════════════════════════════════════
  // EKSPOR — sisi lain dari menu yang bernama "Impor & Ekspor Data"
  // ══════════════════════════════════════════════════════════════════════════
  //
  // Diukur 2026-08-17: menunya bernama "Impor & Ekspor Data", dan yang ada
  // cuma impor. Masalahnya bukan fitur kurang, melainkan **menu yang
  // berbohong tentang isinya**: orang yang membukanya mencari tombol ekspor,
  // tak menemukannya, lalu menyimpulkan aplikasinya rusak — bukan
  // menyimpulkan fiturnya memang belum ada.
  //
  // ── Kenapa memakai SKEMA yang sama dengan impor, bukan daftar kolom sendiri
  //
  // Supaya berkas hasil ekspor bisa langsung diimpor kembali. Ekspor yang
  // bentuknya berbeda dari impor menghasilkan berkas yang tak bisa dipakai
  // untuk apa pun kecuali dibaca — sementara pemakaian yang paling lazim
  // justru: ekspor → sunting massal di Excel → impor lagi.
  //
  // Urutan kolomnya pun mengikuti `SKEMA`. Kalau berbeda, orang yang
  // menyunting hasil ekspor lalu mengimpornya harus memetakan kolom secara
  // manual — dan salah petakan pada kolom HARGA tak menimbulkan galat apa pun.
  //
  // ── Kenapa izinnya sama dengan impor, bukan izin baca biasa
  //
  // Ekspor mengeluarkan SELURUH isi tabel dalam satu berkas yang bisa dikirim
  // ke mana saja. Daftar pemasok lengkap beserta kontak dan terminnya adalah
  // data yang paling berharga bagi pesaing. Yang boleh membaca satu baris di
  // layar tidak otomatis boleh membawa pulang seluruhnya.
  app.get<{ Params: { skema: string }; Querystring: { format?: string } }>(
    '/api/v1/ekspor/:skema',
    { preHandler: [authenticate] },
    async (request, reply) => {
      const s = SKEMA.find((x) => x.kunci === request.params.skema)
      if (!s) {
        return reply.status(404).send({
          error: `Skema '${request.params.skema}' tak dikenal. `
            + `Yang tersedia: ${SKEMA.map((x) => x.kunci).join(', ')}.`,
        })
      }

      // Gerbang izin dijalankan SESUDAH skema dikenali, sama seperti jalur
      // impor: kunci izinnya bergantung pada skema, jadi ia tak bisa dipasang
      // sebagai preHandler statis.
      // Pola yang SAMA dengan `/impor/commit` beberapa baris di atas —
      // bukan pembungkus buatan sendiri. Versi pertama saya membungkus
      // `reply` dengan proxy penangkap status; itu menambah cara kedua untuk
      // memeriksa izin di berkas yang sama, dan dua cara yang pelan-pelan
      // berbeda adalah cara gerbang izin berhenti menjaga.
      const gerbang = requirePermission(IZIN[s.kunci])
      await gerbang(request, reply)
      if (reply.sent) return

      const format = formatSah(request.query.format ?? 'xlsx')
      if (!format) {
        return reply.status(400).send({
          error: `Format tak dikenal. Yang tersedia: ${FORMAT_EKSPOR.join(', ')}.`,
        })
      }

      const tabel = TABEL[s.kunci]

      // Kolom diambil dari SKEMA — satu sumber dengan impor.
      const kunciKolom = s.kolom.map((k) => k.kunci)

      const { data, error } = await request.db!
        .unsafe(tabel, 'ekspor massal; disaring company_id di baris berikutnya')
        .select(kunciKolom.join(', '))
        .eq('company_id', request.companyId!)
        .order('created_at', { ascending: true })
        // Batas eksplisit. PostgREST memotong senyap di 1.000 baris, dan
        // berkas yang terpotong diam-diam lebih berbahaya daripada ekspor
        // yang gagal: orang menyuntingnya lalu mengimpornya kembali, dan
        // yang tak ikut terekspor terlihat seperti data yang memang tak ada.
        .limit(BATAS_EKSPOR + 1)

      if (error) {
        request.log.error({ err: error, tabel }, 'gagal membaca tabel untuk ekspor')
        return reply.status(500).send({ error: `Gagal membaca data ${s.label}` })
      }

      // Lewat `unknown` lebih dulu: `.select()` bernilai string DINAMIS, jadi
      // TypeScript tak bisa menyimpulkan bentuk barisnya dan memulangkan tipe
      // galat generik. Kolomnya sendiri berasal dari `SKEMA` (konstanta di
      // kode), bukan dari masukan pengguna — jadi yang hilang cuma inferensi,
      // bukan jaminannya.
      const semua = (data ?? []) as unknown as Array<Record<string, unknown>>
      const terpotong = semua.length > BATAS_EKSPOR
      const baris = terpotong ? semua.slice(0, BATAS_EKSPOR) : semua

      // Identitas tenant untuk kop dokumen. Gagal memuatnya TIDAK
      // menghentikan ekspor — berkas tanpa kop tetap berguna, berkas yang
      // tak bisa terbit tidak.
      const { data: perusahaan } = await request.db!
        .unsafe('companies', 'nama tenant untuk kop; disaring ke companyId di baris berikutnya')
        .select('name, legal_name')
        .eq('id', request.companyId!)
        .maybeSingle()
      const namaTenant = (perusahaan as { legal_name?: string; name?: string } | null)
        ?.legal_name ?? (perusahaan as { name?: string } | null)?.name ?? null

      const hasil = await susunEkspor(format, {
        judul: s.label,
        tenant: namaTenant,
        keterangan: terpotong
          ? `PERHATIAN: terpotong di ${BATAS_EKSPOR} baris pertama — masih ada sisanya.`
          : s.keterangan,
        kolom: s.kolom.map((k) => ({
          kunci: k.kunci,
          judul: k.label,
          angka: k.jenis === 'angka',
        })),
        baris,
      })

      const tanggal = new Date().toISOString().slice(0, 10)
      const namaBerkas = `${s.kunci}-${tanggal}.${hasil.ekstensi}`

      return reply
        .header('Content-Type', hasil.tipeKonten)
        .header('Content-Disposition', `attachment; filename="${namaBerkas}"`)
        // Dibaca `TombolUnduh` di web dan dilaporkan ke pemakai. Berkas 0
        // baris yang terunduh diam-diam membuat orang mengira datanya memang
        // kosong.
        .header('x-ekspor-jumlah', String(baris.length))
        .header('x-ekspor-terpotong', terpotong ? '1' : '0')
        .send(hasil.isi)
    },
  )
}
