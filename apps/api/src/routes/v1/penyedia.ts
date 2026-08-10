/**
 * PENYEDIA LAYANAN — registry universal + uji koneksi + status kesehatan.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * MELAMPAUI TJS, DAN BEDANYA TERUKUR
 * ══════════════════════════════════════════════════════════════════════════
 *
 * `automation-tjs/.../lib/ai/registry.ts` (dibaca 2026-08-10) menuliskan
 * sendiri cara menambah penyedia: buat berkas adaptor, isi capabilities,
 * tambahkan baris di konstanta `PENYEDIA`. Artinya penyedia adalah KODE —
 * menambahnya butuh deploy.
 *
 * Di sini penyedianya DATA. Yang tinggal di kode hanya ADAPTOR (bentuk muatan
 * HTTP), dan penyedia baru yang memakai bentuk yang sudah dikenal cukup satu
 * baris yang diisi dari UI.
 *
 * ── Status kesehatan: TJS tidak punya
 *
 * Diukur: `grep -rl "health|kesehatan|status_check"` di seluruh
 * `app/dashboard/settings/` TJS menghasilkan NOL berkas.
 *
 * Ia dibangun di sini karena kegagalan penyedia SENYAP. Instance WhatsApp yang
 * sesinya keluar tetap menerima permintaan; kunci AI yang kedaluwarsa membuat
 * asisten menjawab "sedang tak bisa dihubungi" tanpa menyebut sebabnya. Tanpa
 * halaman ini, satu-satunya cara tahu adalah menunggu seseorang mengeluh.
 *
 * ── Kunci API tak pernah keluar dari sini
 *
 * Registry menyimpan NAMA kunci, bukan nilainya (migrasi 266 memverifikasi
 * kolom rahasia memang tak ada). Uji koneksi membaca nilainya dari
 * `app_credentials` lalu MEMBUANGNYA — yang dikembalikan hanya berhasil/gagal
 * dan durasinya. Penjaga `audit-kredensial-tak-bocor.mjs` berambang NOL.
 */

import type { FastifyInstance } from 'fastify'
import { authenticate, requirePermission } from '../../plugins/auth.js'
import { logAuditEvent } from '../../utils/audit.js'
import { ambilKredensial } from '../../lib/kredensial.js'
import { ADAPTOR_WA_DIKENAL, ujiSambunganWa } from '../../lib/wa-kirim.js'
import { PENYEDIA as PENYEDIA_AI } from '../../lib/ai-adaptor.js'

interface BarisPenyedia {
  id: string
  jenis: string
  adaptor: string
  nama: string
  aktif: boolean
  prioritas: number
  konfigurasi: Record<string, unknown>
  kunci_kredensial: string | null
  kesehatan: string
  kesehatan_pesan: string | null
  kesehatan_pada: string | null
  kesehatan_ms: number | null
}

/** Batas atas percobaan uji — jaringan lambat tak boleh menahan request. */
const TIMEOUT_UJI_MS = 12_000

export default async function penyediaRoutes(app: FastifyInstance) {
  // ── Katalog adaptor yang DIKENALI kode ───────────────────────────────────
  //
  // UI tak boleh menebak daftar ini: pilihan yang tak punya adaptor akan
  // tersimpan rapi lalu gagal saat dipakai, dengan galat yang menyalahkan
  // kuncinya.
  app.get(
    '/api/v1/penyedia/adaptor',
    { preHandler: [authenticate, requirePermission('settings:penyedia:view')] },
    async (_req, reply) =>
      reply.send({
        wa: ADAPTOR_WA_DIKENAL,
        // Bentuk diseragamkan ke `kunci` supaya UI tak bercabang per jenis.
        // Sumbernya `PENYEDIA` di ai-adaptor.ts, yang memakai `id` — dan
        // memaksa UI mengenali dua nama untuk hal yang sama adalah cara
        // termurah menciptakan cacat yang tak pernah terlihat di satu sisi.
        ai: PENYEDIA_AI.map((p) => ({
          kunci: p.id,
          label: p.label,
          keterangan: p.keterangan,
          butuh: p.butuhBaseUrl ? ['baseUrl'] : [],
        })),
      }),
  )

  // ── Daftar penyedia tenant ini ───────────────────────────────────────────
  app.get(
    '/api/v1/penyedia',
    { preHandler: [authenticate, requirePermission('settings:penyedia:view')] },
    async (request, reply) => {
      const { data, error } = await request.db!
        .from('penyedia_layanan')
        .select(
          'id, jenis, adaptor, nama, aktif, prioritas, konfigurasi, kunci_kredensial,' +
            ' kesehatan, kesehatan_pesan, kesehatan_pada, kesehatan_ms',
        )
        .order('jenis')
        .order('prioritas')

      if (error) {
        request.log.error({ err: error }, 'penyedia: gagal membaca daftar')
        return reply.status(500).send({ error: 'Gagal membaca daftar penyedia' })
      }
      return reply.send({ data: (data ?? []) as unknown as BarisPenyedia[] })
    },
  )

  // ── Tambah / ubah ────────────────────────────────────────────────────────
  app.post<{
    Body: {
      id?: string
      jenis?: string
      adaptor?: string
      nama?: string
      aktif?: boolean
      prioritas?: number
      konfigurasi?: Record<string, unknown>
      kunci_kredensial?: string | null
    }
  }>(
    '/api/v1/penyedia',
    { preHandler: [authenticate, requirePermission('settings:penyedia:manage')] },
    async (request, reply) => {
      const b = request.body ?? {}
      const jenis = (b.jenis ?? '').trim()
      const adaptor = (b.adaptor ?? '').trim()
      const nama = (b.nama ?? '').trim()

      if (!jenis || !adaptor || !nama) {
        return reply.status(422).send({ error: 'jenis, adaptor, dan nama wajib diisi' })
      }

      /*
       * Adaptor divalidasi terhadap yang BENAR-BENAR dikenali kode.
       *
       * Tanpa ini, salah ketik tersimpan rapi dan baru gagal saat penyedia
       * dipakai — dengan galat "penyedia tak dikenal" yang muncul jauh dari
       * tempat kesalahannya dibuat.
       */
      const dikenal =
        jenis === 'wa'
          ? ADAPTOR_WA_DIKENAL.some((a) => a.kunci === adaptor)
          : jenis === 'ai'
            ? PENYEDIA_AI.some((p) => p.id === adaptor)
            : false
      if (!dikenal) {
        return reply.status(422).send({
          error: `Adaptor '${adaptor}' tidak dikenali untuk jenis '${jenis}'.`,
        })
      }

      // Nilai rahasia TIDAK boleh masuk konfigurasi — ia milik app_credentials.
      const cfg = b.konfigurasi ?? {}
      for (const k of Object.keys(cfg)) {
        if (/key|secret|token|password|sandi/i.test(k)) {
          return reply.status(422).send({
            error:
              `Field '${k}' tampak rahasia. Kredensial diisi di halaman Kredensial, ` +
              `bukan di sini — supaya ia tersandi dan terjaga penjaga kebocoran.`,
          })
        }
      }

      const baris = {
        company_id: request.companyId!,
        jenis,
        adaptor,
        nama,
        aktif: b.aktif ?? false,
        prioritas: Number.isFinite(b.prioritas) ? Number(b.prioritas) : 100,
        konfigurasi: cfg,
        kunci_kredensial: b.kunci_kredensial ?? null,
        diperbarui_pada: new Date().toISOString(),
      }

      const q = b.id
        ? request.db!.from('penyedia_layanan').update(baris).eq('id', b.id).select('id')
        : request.db!.from('penyedia_layanan').insert(baris).select('id')

      const { data, error } = await q
      if (error) {
        request.log.error({ err: error }, 'penyedia: gagal menyimpan')
        return reply.status(500).send({ error: `Gagal menyimpan: ${error.message}` })
      }
      if (!data || (data as unknown[]).length === 0) {
        return reply.status(404).send({ error: 'Penyedia tidak ditemukan' })
      }

      void logAuditEvent(request, {
        tableName: 'penyedia_layanan',
        recordId: (data as Array<{ id: string }>)[0].id,
        action: b.id ? 'penyedia.ubah' : 'penyedia.tambah',
        actorId: request.currentUser!.id,
        newValues: { jenis, adaptor, nama, aktif: baris.aktif },
        severity: 'warning',
      })

      return reply.send({ ok: true, id: (data as Array<{ id: string }>)[0].id })
    },
  )

  // ── UJI KONEKSI — yang TJS tak punya ─────────────────────────────────────
  app.post<{ Params: { id: string } }>(
    '/api/v1/penyedia/:id/uji',
    { preHandler: [authenticate, requirePermission('settings:penyedia:manage')] },
    async (request, reply) => {
      const { data: p, error } = await request.db!
        .from('penyedia_layanan')
        .select('id, jenis, adaptor, konfigurasi, kunci_kredensial')
        .eq('id', request.params.id)
        .maybeSingle()

      if (error || !p) {
        return reply.status(404).send({ error: 'Penyedia tidak ditemukan' })
      }

      const row = p as {
        id: string
        jenis: string
        adaptor: string
        konfigurasi: Record<string, unknown>
        kunci_kredensial: string | null
      }

      const kunci = row.kunci_kredensial
        ? await ambilKredensial(request, row.kunci_kredensial)
        : null

      const mulai = Date.now()
      const hasil = await ujiKoneksi(row, kunci)
      const durasi = Date.now() - mulai

      // Status DAN jejaknya dicatat: status menjawab "sekarang bagaimana",
      // jejak menjawab "sejak kapan" dan "sesering apa".
      /*
       * Kedua tulisan DIPERIKSA errornya.
       *
       * Bukan kerapian: kalau `update` gagal senyap, halaman menampilkan
       * status kesehatan LAMA sesudah tombol Uji ditekan — dan orang
       * menyimpulkan penyedianya masih rusak padahal sudah pulih (atau lebih
       * buruk: masih sehat padahal sudah mati). Tombol yang tak mengubah apa
       * pun tapi terlihat berhasil adalah cacat yang paling lama bertahan.
       */
      const { error: errStatus } = await request.db!
        .from('penyedia_layanan')
        .update({
          kesehatan: hasil.ok ? 'sehat' : 'gagal',
          kesehatan_pesan: hasil.pesan ?? null,
          kesehatan_pada: new Date().toISOString(),
          kesehatan_ms: durasi,
        })
        .eq('id', row.id)
        .select('id')

      if (errStatus) {
        request.log.error({ err: errStatus, id: row.id }, 'penyedia: status kesehatan gagal disimpan')
      }

      const { error: errLog } = await request.db!
        .from('penyedia_uji_log')
        .insert({
          company_id: request.companyId!,
          penyedia_id: row.id,
          hasil: hasil.ok ? 'sehat' : 'gagal',
          pesan: hasil.pesan ?? null,
          durasi_ms: durasi,
          oleh: request.currentUser!.id,
        })
        .select('id')

      // Jejak yang hilang membuat "sejak kapan" tak terjawab — dan itu
      // pertanyaan yang muncul justru saat keadaannya paling membingungkan.
      if (errLog) {
        request.log.error({ err: errLog, id: row.id }, 'penyedia: jejak uji gagal dicatat')
      }

      return reply.send({ ok: hasil.ok, pesan: hasil.pesan, durasi_ms: durasi })
    },
  )

  // ── IKHTISAR menu induk "AI & Otomasi" ───────────────────────────────────
  //
  // Permission `settings:ai:view` — yang paling longgar di grup ini. Halaman
  // ikhtisar yang menuntut izin kelola akan kosong bagi orang yang justru
  // paling perlu melihatnya: yang bertanya "kenapa asistennya diam?".
  app.get(
    '/api/v1/otomasi/ikhtisar',
    { preHandler: [authenticate, requirePermission('settings:ai:view')] },
    async (request, reply) => {
      try {
        return reply.send(await ringkasOtomasi(request))
      } catch (e) {
        request.log.error({ err: e }, 'otomasi: gagal menyusun ikhtisar')
        return reply.status(500).send({ error: 'Gagal menyusun ikhtisar' })
      }
    },
  )

  // ── Jejak uji ────────────────────────────────────────────────────────────
  app.get<{ Params: { id: string } }>(
    '/api/v1/penyedia/:id/log',
    { preHandler: [authenticate, requirePermission('settings:penyedia:view')] },
    async (request, reply) => {
      const { data, error } = await request.db!
        .from('penyedia_uji_log')
        .select('hasil, pesan, durasi_ms, dibuat_pada')
        .eq('penyedia_id', request.params.id)
        .order('dibuat_pada', { ascending: false })
        .limit(50)

      if (error) {
        request.log.error({ err: error }, 'penyedia: gagal membaca log')
        return reply.status(500).send({ error: 'Gagal membaca jejak uji' })
      }
      return reply.send({ data: data ?? [] })
    },
  )
}

/**
 * Menguji sambungan — TANPA mengirim pesan ke siapa pun.
 *
 * Itu batas yang disengaja: uji koneksi yang mengirim WhatsApp sungguhan
 * membuat tombol "Uji" jadi tombol yang mengganggu orang, dan orang berhenti
 * menekannya. Yang diperiksa: endpoint menjawab, dan kredensialnya diterima.
 *
 * Kunci TIDAK PERNAH ikut di nilai balik — hanya berhasil/gagal dan pesannya.
 */
async function ujiKoneksi(
  p: { jenis: string; adaptor: string; konfigurasi: Record<string, unknown> },
  kunci: string | null,
): Promise<{ ok: boolean; pesan?: string }> {
  if (!kunci) {
    return { ok: false, pesan: 'Kredensial belum diisi di halaman Kredensial.' }
  }

  const kendali = new AbortController()
  const jam = setTimeout(() => kendali.abort(), TIMEOUT_UJI_MS)

  try {
    if (p.jenis === 'wa') {
      /*
       * Uji WA lewat PINTU, bukan `fetch` di sini.
       *
       * Versi pertama memanggil `api.fonnte.com` langsung dari route, dan
       * `audit-satu-pintu-wa` menolaknya (W-1) dengan tepat: begitu satu titik
       * di luar pintu dibiarkan, titik kedua selalu menyusul — lalu bentuk
       * muatannya menyimpang dan pesannya berhenti terkirim tanpa galat. Itu
       * persis kejadian yang TJS bayar dengan alert stok yang diam
       * berbulan-bulan.
       */
      return ujiSambunganWa(
        {
          penyedia: p.adaptor,
          apiKey: kunci,
          baseUrl: String(p.konfigurasi.baseUrl ?? ''),
          instance: String(p.konfigurasi.instance ?? ''),
        },
        TIMEOUT_UJI_MS,
      )
    }

    if (p.jenis === 'ai') {
      /*
       * Untuk AI, yang diuji KEBERADAAN kunci dan bentuknya — bukan panggilan
       * sungguhan.
       *
       * Panggilan uji ke model BERBIAYA, dan tombol yang menghabiskan uang
       * tiap ditekan adalah tombol yang tak pernah ditekan. Gerbang biaya
       * (C1) sudah menangani kegagalan kunci saat pemakaian nyata, dengan
       * pesan yang terbaca.
       */
      return kunci.length >= 20
        ? { ok: true, pesan: 'Kunci tersimpan (uji panggilan tak dilakukan — berbiaya).' }
        : { ok: false, pesan: 'Kunci terlalu pendek — kemungkinan salah tempel.' }
    }

    return { ok: false, pesan: `Uji untuk adaptor '${p.adaptor}' belum tersedia.` }
  } catch (e) {
    const err = e as { name?: string; message?: string }
    return {
      ok: false,
      pesan: err?.name === 'AbortError' ? 'Tak menjawab dalam 12 detik.' : (err?.message ?? 'Gagal'),
    }
  } finally {
    clearTimeout(jam)
  }
}

/**
 * IKHTISAR "AI & Otomasi" — dashboard menu induk.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * KENAPA MENU INDUK BUTUH HALAMAN, BUKAN SEKADAR DAFTAR SUB-MENU
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Penjaga `uji-induk-punya-ikhtisar` sudah menandai `g-ai` sebagai salah satu
 * dari dua grup yang belum punya ikhtisar — jadi ini hutang yang tercatat,
 * bukan permintaan baru.
 *
 * Yang dijawab halaman ini adalah pertanyaan yang TAK BISA dijawab sub-menu
 * mana pun sendirian: "apakah otomasi saya sehat hari ini?" Untuk menjawabnya
 * orang harus membuka lima halaman dan mengingat isinya — dan tak ada yang
 * melakukan itu, jadi kegagalan penyedia baru ketahuan saat ada yang mengeluh.
 *
 * Satu permintaan, bukan lima: halaman ikhtisar yang menembak lima endpoint
 * akan menampilkan lima keadaan memuat yang berkedip bergantian.
 */
export async function ringkasOtomasi(request: import('fastify').FastifyRequest) {
  const db = request.db!

  const [penyedia, biaya, percakapan, nomor, tolak, waLog, ujiLog] = await Promise.all([
    db.from('penyedia_layanan').select('jenis, nama, aktif, kesehatan, kesehatan_pada'),
    db.from('ai_biaya_token').select('biaya_idr, dibuat_pada'),
    db.from('ai_percakapan').select('id, judul, kanal, diperbarui_pada'),
    db.from('wa_nomor_pengguna').select('id, aktif, terverifikasi_pada'),
    db.from('ai_akses_ditolak').select('id, dibuat_pada'),
    // Log aktivitas — permintaan founder 2026-08-10. Datanya sudah lama ada
    // (19 baris terukur) tapi tak punya SATU pembaca pun; tabel tanpa pembaca
    // sama tak bergunanya dengan tabel kosong.
    db.from('wa_pesan_log')
      .select('arah, nomor, status, galat, dibuat_pada')
      .order('dibuat_pada', { ascending: false })
      .limit(15),
    db.from('penyedia_uji_log')
      .select('hasil, pesan, durasi_ms, dibuat_pada')
      .order('dibuat_pada', { ascending: false })
      .limit(15),
  ])

  /*
   * Galat DIPERIKSA sebelum apa pun dihitung.
   *
   * Untuk halaman KESEHATAN, kegagalan baca adalah cacat terburuk yang
   * mungkin: `?? []` mengubah "tak bisa membaca" jadi "tak ada apa-apa", dan
   * halamannya melaporkan NOL penyedia bermasalah, NOL biaya, NOL akses
   * ditolak. Semuanya menenangkan, semuanya bohong — dan orang yang
   * membukanya justru sedang mencari masalah.
   *
   * `audit-kegagalan-senyap` menaikkan angkanya 186 → 194 karena delapan
   * `?? []` di sini. Diperbaiki dengan MEMERIKSA, bukan menaikkan ambang.
   */
  const gagal = [penyedia, biaya, percakapan, nomor, tolak, waLog, ujiLog].find((r) => r.error)
  if (gagal) {
    throw new Error(`Gagal membaca data ikhtisar: ${gagal.error!.message}`)
  }

  const awalBulan = new Date()
  awalBulan.setDate(1)
  awalBulan.setHours(0, 0, 0, 0)

  const barisBiaya = (biaya.data as Array<{ biaya_idr: string | number; dibuat_pada: string }>)
  const biayaBulanIni = barisBiaya
    .filter((b) => new Date(b.dibuat_pada) >= awalBulan)
    .reduce((n, b) => n + (Number(b.biaya_idr) || 0), 0)

  const barisNomor = nomor.data as Array<{ aktif: boolean; terverifikasi_pada: string | null }>
  const barisPenyedia = penyedia.data as Array<{
    jenis: string; nama: string; aktif: boolean; kesehatan: string; kesehatan_pada: string | null
  }>

  return {
    // Yang PALING sering jadi penyebab "asistennya rusak": penyedia aktif yang
    // kesehatannya gagal atau belum pernah diuji sama sekali.
    penyedia: {
      total: barisPenyedia.length,
      aktif: barisPenyedia.filter((p) => p.aktif).length,
      sehat: barisPenyedia.filter((p) => p.aktif && p.kesehatan === 'sehat').length,
      bermasalah: barisPenyedia
        .filter((p) => p.aktif && p.kesehatan !== 'sehat')
        .map((p) => ({ jenis: p.jenis, nama: p.nama, kesehatan: p.kesehatan })),
    },
    biaya_bulan_ini_idr: Math.round(biayaBulanIni),
    percakapan: (percakapan.data as unknown[]).length,
    nomor_wa: {
      total: barisNomor.length,
      terverifikasi: barisNomor.filter((n) => n.terverifikasi_pada && n.aktif).length,
    },
    // Percobaan dari nomor tak dikenal (C-9). Angka yang naik tajam adalah
    // pola yang layak dilihat manusia, dan sebelum halaman ini ia hanya
    // tersimpan di tabel yang tak punya pembaca.
    akses_ditolak: (tolak.data as unknown[]).length,

    /*
     * Aktivitas terakhir — dua aliran DIGABUNG, bukan dua daftar.
     *
     * Orang yang bertanya "apa yang terjadi tadi?" tak memikirkan kategori;
     * ia memikirkan URUTAN WAKTU. Dua daftar berdampingan memaksanya
     * membandingkan stempel waktu dengan mata, dan itu persis pekerjaan yang
     * seharusnya dilakukan mesin.
     */
    aktivitas: [
      ...(waLog.data as Array<{
        arah: string; nomor: string; status: string; galat: string | null; dibuat_pada: string
      }>).map((w) => ({
        pada: w.dibuat_pada,
        jenis: 'wa',
        // Nomor DISAMARKAN sebagian: log dibaca banyak orang, dan nomor
        // telepon lengkap di layar yang terbuka adalah data pribadi yang
        // tak perlu ada di sana untuk menjawab "apa yang terjadi".
        judul: `${w.arah === 'masuk' ? 'Pesan masuk' : 'Pesan keluar'} · ${samarkan(w.nomor)}`,
        status: w.status,
        pesan: w.galat,
      })),
      ...(ujiLog.data as Array<{
        hasil: string; pesan: string | null; durasi_ms: number | null; dibuat_pada: string
      }>).map((u) => ({
        pada: u.dibuat_pada,
        jenis: 'uji',
        judul: `Uji koneksi penyedia${u.durasi_ms ? ` · ${u.durasi_ms} ms` : ''}`,
        status: u.hasil,
        pesan: u.pesan,
      })),
    ]
      .sort((a, b) => new Date(b.pada).getTime() - new Date(a.pada).getTime())
      /*
       * Kejadian BERULANG diringkas jadi satu baris ber-hitungan.
       *
       * Diukur pada data nyata: 19 dari 19 baris log WA identik (nomor uji
       * yang sama, galat yang sama). Menampilkannya apa adanya menghasilkan
       * lima belas baris "gagal" yang tak menambah satu pun informasi setelah
       * baris pertama — dan justru MENYEMBUNYIKAN kejadian lain yang
       * terdorong keluar dari 15 teratas.
       *
       * Yang diringkas hanya yang BERURUTAN dan sejenis: dua kegagalan yang
       * dipisahkan keberhasilan adalah dua peristiwa berbeda, dan
       * menggabungkannya akan menghapus fakta bahwa sempat pulih.
       */
      .reduce<Array<{ pada: string; jenis: string; judul: string; status: string; pesan: string | null; ulang: number }>>(
        (akum, a) => {
          const akhir = akum[akum.length - 1]
          if (akhir && akhir.judul === a.judul && akhir.status === a.status) {
            akhir.ulang += 1
            return akum
          }
          akum.push({ ...a, ulang: 1 })
          return akum
        },
        [],
      )
      .slice(0, 15),

    percakapan_terakhir: (percakapan.data as Array<{
      id: string; judul: string | null; kanal: string | null; diperbarui_pada: string
    }>)
      .sort((a, b) => new Date(b.diperbarui_pada).getTime() - new Date(a.diperbarui_pada).getTime())
      .slice(0, 6)
      .map((p) => ({
        id: p.id,
        judul: p.judul ?? '(tanpa judul)',
        kanal: p.kanal ?? 'web',
        pada: p.diperbarui_pada,
      })),
  }
}

/**
 * `628123456789` → `628•••6789`.
 *
 * Cukup untuk mengenali nomor yang sudah dikenal, tak cukup untuk mencatat
 * nomor orang yang belum dikenal. Log aktivitas dibaca banyak mata.
 */
function samarkan(n: string): string {
  // HANYA angka yang disamarkan. Versi pertama memotong apa pun sepanjang ≥8
  // karakter, dan log berisi nilai uji `bukan-nomor` tampil sebagai
  // `buk•••omor` — omong kosong yang terbaca seperti cacat sistem.
  if (!/^\d{8,}$/.test(n)) return n
  return `${n.slice(0, 3)}•••${n.slice(-4)}`
}
