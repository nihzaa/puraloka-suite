import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import Fastify, { type FastifyInstance } from 'fastify'

// ============================================================
// GALAT 5xx WAJIB MEMBAWA KONTEKS, bukan cuma stack.
//
// ── Kenapa test ini ada
//
// Diukur di log PRODUKSI 2026-09-12 saat mensurvei pemantauan galat:
// nol galat 5xx dalam 24 jam. Bagus — tetapi itu justru yang membuat
// perbaikan ini harus ditulis SEKARANG: galat pertama yang nanti muncul
// hanya bisa didiagnosis dari apa yang tercatat SAAT ia terjadi.
// Menambahkan konteks sesudahnya berarti menunggu ia terulang.
//
// Sebelumnya `setErrorHandler` mencatat `app.log.error(err)` saja. Itu
// membawa pesan + stack, dan MEMBUANG tiga hal yang menentukan:
//
//   correlationId  satu-satunya jembatan ke `audit_logs.correlation_id`
//   rute + metode  tanpa itu, orang menebak di antara 601 rute
//   user + tenant  galat yang menimpa SATU perusahaan tak bisa dibedakan
//                  dari yang menimpa semuanya
//
// ── Kenapa handler-nya DISALIN, bukan meng-import `index.ts`
//
// Alasan yang sama dengan `rate-limit-429.test.ts`: meng-import entrypoint
// menyalakan server sungguhan (listen, koneksi DB, 600+ rute). Yang diuji
// di sini murni BENTUK log-nya.
//
// Konsekuensinya jujur dan sama: kalau `index.ts` disunting tanpa menyunting
// berkas ini, test bisa hijau sementara produksi kehilangan konteksnya lagi.
// Penjaganya di bawah — `it('bentuk handler di index.ts masih sama')`
// MEMBACA berkas aslinya.
// ============================================================

type ErrorMasuk = Partial<Error> & {
  statusCode?: number
  code?: string
  isRateLimit?: boolean
  error?: string
}

/** Baris log yang tertangkap, untuk diperiksa isinya. */
interface BarisLog {
  correlationId?: string
  rute?: string
  metode?: string
  userId?: string
  companyId?: string
  err?: unknown
  msg?: string
}

const tertangkap: BarisLog[] = []

let app: FastifyInstance

beforeAll(async () => {
  app = Fastify({
    requestIdHeader: false,
    genReqId: () => 'uuid-uji-tetap',
  })

  /*
    Logger diganti penangkap. `app.log.error(obj, msg)` dipanggil handler,
    dan yang diperiksa test ini adalah OBJEK pertamanya — bukan teksnya.
  */
  ;(app as unknown as { log: { error: (o: BarisLog, m?: string) => void } }).log = {
    error: (o, m) => { tertangkap.push({ ...o, msg: m }) },
  }

  app.setErrorHandler((err: ErrorMasuk, request, reply) => {
    const status = err.statusCode ?? 500
    if (status >= 500) {
      app.log.error(
        {
          err,
          correlationId: request.id,
          rute: request.routeOptions?.url ?? request.url,
          metode: request.method,
          userId: (request as { currentUser?: { id: string } }).currentUser?.id,
          companyId: (request as { companyId?: string }).companyId,
        },
        'galat 5xx',
      )
      return reply.status(500).send({ error: 'Internal server error' })
    }
    return reply.status(status).send({ error: err.message })
  })

  app.get('/pecah', async () => { throw new Error('sengaja pecah') })

  /* Rute ber-parameter: yang dicatat harus POLANYA, bukan nilai id-nya. */
  app.get('/proyek/:id/pecah', async () => { throw new Error('pecah berparam') })

  /* Pembanding: 4xx TIDAK boleh ikut tercatat sebagai galat 5xx. */
  app.get('/salah-input', async () => {
    const e: ErrorMasuk = new Error('input tak sah')
    e.statusCode = 400
    throw e
  })

  await app.ready()
})

afterAll(async () => { await app.close() })

describe('galat 5xx membawa konteks yang bisa ditindaklanjuti', () => {
  it('mencatat correlationId, rute, dan metode', async () => {
    tertangkap.length = 0
    const r = await app.inject({ method: 'GET', url: '/pecah' })

    expect(r.statusCode).toBe(500)
    expect(tertangkap).toHaveLength(1)

    const log = tertangkap[0]
    expect(log.correlationId).toBe('uuid-uji-tetap')
    expect(log.rute).toBe('/pecah')
    expect(log.metode).toBe('GET')
    expect(log.msg).toBe('galat 5xx')
  })

  it('galatnya sendiri TIDAK hilang — stack tetap terbawa', () => {
    /*
      `err` wajib ada DAN berupa Error. Kalau ia diratakan jadi string,
      pino kehilangan stack-nya dan yang tersisa cuma pesan — persis
      keadaan yang perbaikan ini tutup.
    */
    const log = tertangkap[0]
    expect(log.err).toBeInstanceOf(Error)
    expect((log.err as Error).message).toBe('sengaja pecah')
  })

  it('rute BERPARAMETER dicatat sebagai POLA, bukan nilai id-nya', async () => {
    /*
      Ini yang membuat galat bisa DIKELOMPOKKAN. Kalau yang tercatat
      `/proyek/c0000000-…/pecah`, seribu galat dari satu cacat terlihat
      seperti seribu cacat berbeda — dan tak ada yang naik ke permukaan.
    */
    tertangkap.length = 0
    await app.inject({ method: 'GET', url: '/proyek/abc-123/pecah' })

    expect(tertangkap[0].rute).toBe('/proyek/:id/pecah')
    expect(tertangkap[0].rute).not.toContain('abc-123')
  })

  it('userId & companyId boleh KOSONG — galat pra-auth kelas tersendiri', async () => {
    /*
      Galat bisa terjadi sebelum `authenticate` sempat berjalan. Ketiadaan
      keduanya bukan cacat log melainkan KETERANGAN: pra-auth vs pasca-auth
      adalah dua kelas galat yang berbeda penanganannya.
    */
    tertangkap.length = 0
    await app.inject({ method: 'GET', url: '/pecah' })

    expect(tertangkap[0]).toHaveProperty('userId')
    expect(tertangkap[0].userId).toBeUndefined()
  })

  it('4xx TIDAK dicatat sebagai galat 5xx', async () => {
    /*
      Kalau 4xx ikut tercatat, log terisi kesalahan PENGGUNA (salah isi
      form) dan galat server sungguhan tenggelam di antaranya — kelas
      cacat yang sama dengan 48 peringatan healthcheck yang baru dibuang.
    */
    tertangkap.length = 0
    const r = await app.inject({ method: 'GET', url: '/salah-input' })

    expect(r.statusCode).toBe(400)
    expect(tertangkap).toHaveLength(0)
  })
})

describe('penjaga penyimpangan — handler di index.ts', () => {
  it('bentuk handler di index.ts masih sama', () => {
    /*
      Handler di atas SALINAN. Penjaga ini membaca berkas aslinya supaya
      penghapusan konteks di produksi memerahkan test — bukan lolos diam-
      diam karena salinannya masih benar.

      Pola yang sama dipakai `rate-limit-429.test.ts` untuk `isRateLimit`.
    */
    const sumber = readFileSync(
      join(process.cwd(), 'src', 'index.ts'),
      'utf8',
    )

    /* Handler wajib MENERIMA request — `_req` berarti konteksnya dibuang. */
    expect(sumber).toContain('app.setErrorHandler((err: ErrorMasuk, request, reply)')

    for (const medan of ['correlationId: request.id', 'rute:', 'metode:', 'userId:', 'companyId:']) {
      expect(sumber, `medan konteks "${medan}" hilang dari index.ts`).toContain(medan)
    }
  })
})
