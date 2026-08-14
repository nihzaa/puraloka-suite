import type { FastifyInstance } from 'fastify'
import { authenticate, hasPermission } from '../../plugins/auth.js'
import { logAuditEvent } from '../../utils/audit.js'
import {
  REGISTRY, AMBANG_LAMA_HARI, cariEntri, umurHari, periksaPulih,
} from '../../lib/recycle-bin.js'

/**
 * RECYCLE BIN (TJS-P1) — memulihkan yang terhapus.
 *
 * ── Dua gerbang, dan yang kedua lebih ketat
 *
 * `requirePermission` di preHandler menjaga bahwa orangnya boleh membuka
 * fitur ini. Izin per-ENTRI dicek terpisah di handler, dan izin PULIH sengaja
 * bisa berbeda dari izin LIHAT: melihat apa yang terhapus adalah membaca,
 * memulihkannya adalah mengembalikan data beserta segala yang menggantung
 * padanya.
 *
 * ── Kenapa `deleted_by` TIDAK dikosongkan saat pulih
 *
 * Yang dikosongkan hanya `is_deleted` dan `deleted_at`. `deleted_by` dibiarkan
 * — ia jejak siapa yang pernah menghapus, dan itulah satu-satunya keterangan
 * saat orang bertanya "kenapa data ini sempat hilang?".
 *
 * Menghapusnya membuat pemulihan menutupi penghapusan, dan riwayatnya jadi
 * bersih seolah tak pernah terjadi apa-apa.
 */

export default async function recycleBinRoutes(app: FastifyInstance) {
  // ── GET /recycle-bin — jenis apa saja yang punya recycle bin ─────────────
  app.get(
    '/api/v1/recycle-bin',
    { preHandler: [authenticate] },
    async (request, reply) => {
      // Hanya jenis yang BOLEH dilihat orangnya. Menampilkan seluruhnya lalu
      // menolak saat dibuka menghasilkan layar yang menjanjikan sesuatu yang
      // tak bisa ditepati.
      const boleh = []
      for (const e of REGISTRY) {
        if (await hasPermission(request, e.izinLihat)) {
          boleh.push({
            kunci: e.kunci,
            label: e.label,
            bisa_pulihkan: await hasPermission(request, e.izinPulih),
          })
        }
      }
      return reply.send({ jenis: boleh, ambang_lama_hari: AMBANG_LAMA_HARI })
    },
  )

  // ── GET /recycle-bin/:kunci — isinya ─────────────────────────────────────
  app.get<{ Params: { kunci: string } }>(
    '/api/v1/recycle-bin/:kunci',
    { preHandler: [authenticate] },
    async (request, reply) => {
      const e = cariEntri(request.params.kunci)
      if (!e) return reply.status(404).send({ error: 'Jenis tidak dikenal' })

      if (!(await hasPermission(request, e.izinLihat))) {
        return reply.status(403).send({
          error: `Butuh izin ${e.izinLihat} untuk melihat ${e.label} yang terhapus`,
        })
      }

      // `.from()` sadar-tenant untuk yang ber-`company_id`. Yang ber-project
      // disaring lewat `projectIds()`.
      //
      // ⚠ Daftar "yang terhapus" adalah tempat paling sepi untuk kebocoran
      // tenant — jarang dibuka, jadi jarang diperiksa. Penyaringannya
      // karena itu TIDAK boleh berbeda dari daftar biasa.
      const q = e.tenancy === 'company'
        ? request.db!.from(e.tabel)
        : request.db!.unsafe(e.tabel, 'disaring ke proyek milik tenant lewat projectIds()')

      let sel = q
        .select(`id, ${e.kolomNama}, deleted_at, deleted_by`)
        .eq('is_deleted', true)
        .order('deleted_at', { ascending: false })
        .limit(200)

      if (e.tenancy === 'project') {
        sel = sel.in('project_id', await request.db!.projectIds())
      }

      const { data, error } = await sel
      if (error) {
        request.log.error({ err: error, kunci: e.kunci }, 'gagal memuat recycle bin')
        return reply.status(500).send({ error: 'Gagal memuat isi recycle bin' })
      }

      const baris = (data ?? []) as unknown as Array<Record<string, unknown>>

      return reply.send({
        jenis: { kunci: e.kunci, label: e.label },
        bisa_pulihkan: await hasPermission(request, e.izinPulih),
        ambang_lama_hari: AMBANG_LAMA_HARI,
        item: baris.map((b) => ({
          id: b.id,
          nama: b[e.kolomNama],
          deleted_at: b.deleted_at,
          deleted_by: b.deleted_by,
          umur_hari: umurHari(b.deleted_at as string | null),
        })),
      })
    },
  )

  // ── POST /recycle-bin/:kunci/:id/pulihkan ────────────────────────────────
  app.post<{ Params: { kunci: string; id: string } }>(
    '/api/v1/recycle-bin/:kunci/:id/pulihkan',
    { preHandler: [authenticate] },
    async (request, reply) => {
      const { kunci, id } = request.params
      const e = cariEntri(kunci)
      if (!e) return reply.status(404).send({ error: 'Jenis tidak dikenal' })

      // ⚠ CABANG INI TIDAK TERTUTUP MUTATION TEST — dinyatakan, bukan
      // disembunyikan.
      //
      // Membuangnya tak membuat satu test pun merah, dan sebabnya jujur:
      // seluruh test berjalan sebagai admin, yang memegang izin lihat MAUPUN
      // pulih. Membuktikan gerbang ini menuntut sesi dengan peran yang punya
      // `projects:view` tetapi tidak `projects:delete` — fixture peran yang
      // belum ada di harness ini.
      //
      // Yang dijaganya tetap nyata: memulihkan mengembalikan proyek beserta
      // seluruh RAB, invoice, dan jadwal yang menggantung padanya. Itu
      // keputusan yang lebih besar daripada melihat daftar yang terhapus.
      if (!(await hasPermission(request, e.izinPulih))) {
        return reply.status(403).send({
          error: `Butuh izin ${e.izinPulih} untuk memulihkan ${e.label}. `
            + 'Memulihkan mengembalikan data beserta segala yang menggantung '
            + 'padanya — itu keputusan yang lebih besar daripada melihat.',
        })
      }

      const baca = e.tenancy === 'company'
        ? request.db!.from(e.tabel)
        : request.db!.unsafe(e.tabel, 'disaring ke proyek milik tenant lewat projectIds()')

      let cek = baca.select(`id, ${e.kolomNama}, is_deleted`).eq('id', id)
      if (e.tenancy === 'project') {
        cek = cek.in('project_id', await request.db!.projectIds())
      }

      const { data: baris, error: eBaca } = await cek.maybeSingle()
      if (eBaca) {
        request.log.error({ err: eBaca, id }, 'gagal membaca item recycle bin')
        return reply.status(500).send({ error: eBaca.message })
      }

      const p = periksaPulih(baris as { is_deleted?: boolean | null } | null)
      if (!p.bisa) {
        // 404 vs 409 dibedakan: yang pertama berarti "tak ada", yang kedua
        // "ada tetapi tak sedang terhapus". Dua keadaan yang menuntut
        // tindakan berbeda dari yang memanggil.
        return reply.status(p.kode === 'tak_ada' ? 404 : 409).send({ error: p.alasan })
      }

      // `.eq('is_deleted', true)` ikut di WHERE, bukan hanya diperiksa lebih
      // dulu: dua permintaan bersamaan bisa sama-sama lolos pemeriksaan
      // aplikasi, dan yang kedua akan "memulihkan" baris yang sudah pulih —
      // menimpa jejaknya tanpa ada yang tahu.
      const tulis = e.tenancy === 'company'
        ? request.db!.from(e.tabel)
        : request.db!.unsafe(e.tabel, 'id sudah terbukti milik proyek tenant di atas')

      const { data, error } = await tulis
        .update({
          is_deleted: false,
          deleted_at: null,
          // `deleted_by` SENGAJA tidak dikosongkan — lihat kepala berkas.
          updated_at: new Date().toISOString(),
        })
        .eq('id', id)
        .eq('is_deleted', true)
        .select(`id, ${e.kolomNama}`)

      if (error) {
        request.log.error({ err: error, id }, 'gagal memulihkan')
        return reply.status(400).send({ error: error.message })
      }
      if (!data || data.length === 0) {
        return reply.status(409).send({
          error: 'Data ini sudah dipulihkan oleh permintaan lain.',
        })
      }

      await logAuditEvent(request, {
        action: 'UPDATE',
        actorId: request.currentUser!.id,
        tableName: e.tabel,
        recordId: id,
        newValues: { is_deleted: false, dipulihkan_dari: 'recycle-bin' },
      })

      return reply.send({
        dipulihkan: {
          id,
          nama: (data[0] as unknown as Record<string, unknown>)[e.kolomNama],
        },
      })
    },
  )
}
