import type { FastifyInstance } from 'fastify'
import { authenticate, requirePermission } from '../../plugins/auth.js'
import { logAuditEvent } from '../../utils/audit.js'
import { periksaRencana, periksaFaktor } from '../../lib/susut-material.js'

/**
 * RENCANA SUSUT & JEMBATAN AHSP↔GUDANG (G6e).
 *
 * ── Yang dijawab modul ini, dan yang tidak
 *
 * `/gudang/rekonsiliasi` sudah menjawab "berapa yang hilang". Yang tak bisa
 * dijawabnya: **apakah yang hilang itu wajar.** Rencana susut memberi
 * pembandingnya.
 *
 * Yang TIDAK dijawab siapa pun: apakah selisihnya berarti pencurian,
 * kesalahan catat, atau material yang memang lebih rapuh dari dugaan.
 * Ketiganya menghasilkan angka yang sama persis.
 *
 * ── Kenapa jembatannya diisi manusia
 *
 * Diukur: `resources` (2.830, kode `AHSP-*`) dan `materials` (24, kode
 * `MAT-*`) punya NOL kode yang cocok. Menyambungkannya lewat pencocokan nama
 * adalah tebakan — dan tebakan di sini menghasilkan angka susut yang menuduh
 * orang atas material yang tak pernah mereka pegang.
 */

const SELECT_PETA = `
  id, resource_id, material_id, faktor, catatan, created_at,
  resources ( id, code, name, unit_code ),
  materials ( id, code, name, unit )
`

const SELECT_RENCANA = `
  id, material_id, susut_fraksi, dasar, catatan, created_at,
  materials ( id, code, name, unit )
`

export default async function susutMaterialRoutes(app: FastifyInstance) {
  // ── GET /gudang/susut/peta ───────────────────────────────────────────────
  app.get(
    '/api/v1/gudang/susut/peta',
    { preHandler: [authenticate, requirePermission('gudang:susut:view')] },
    async (request, reply) => {
      const { data, error } = await request.db!
        .from('peta_resource_material')
        .select(SELECT_PETA)
        .limit(3000)
      if (error) {
        request.log.error({ err: error }, 'gagal memuat peta resource-material')
        return reply.status(500).send({ error: 'Gagal memuat pemetaan' })
      }

      // Material gudang — daftar pendek (24 baris terukur), jadi dikirim utuh
      // supaya layar tak perlu memanggil endpoint lain hanya untuk pemilihnya.
      const { data: material, error: eMat } = await request.db!
        .shared('materials')
        .select('id, code, name, unit')
        .eq('is_active', true)
        .order('code', { ascending: true })
        .limit(500)
      if (eMat) {
        request.log.error({ err: eMat }, 'gagal memuat material')
        return reply.status(500).send({ error: 'Gagal memuat material' })
      }

      // Resource AHSP kategori material — 2.830 baris terukur, jadi TIDAK
      // dikirim utuh. Layar mencarinya lewat endpoint pencarian di bawah.
      //
      // Mengirim seluruhnya akan membuat balasan ini puluhan kali lebih besar
      // dari isinya yang berguna, dan pemilih dengan 2.830 pilihan tak bisa
      // dipakai siapa pun.
      return reply.send({ peta: data, material })
    },
  )

  // ── GET /gudang/susut/resource — pencarian untuk pemilih ─────────────────
  app.get<{ Querystring: { cari?: string } }>(
    '/api/v1/gudang/susut/resource',
    { preHandler: [authenticate, requirePermission('gudang:susut:view')] },
    async (request, reply) => {
      const cari = (request.query.cari ?? '').trim()

      // Pencarian kosong menjawab DAFTAR KOSONG, bukan seluruh 2.830 baris.
      // Mengirim semuanya saat kotak pencarian masih kosong adalah cara
      // paling mudah membuat halaman terasa rusak pada sambungan lambat.
      if (cari.length < 2) {
        return reply.send({
          resource: [],
          pesan: 'Ketik minimal 2 huruf — katalog AHSP berisi ribuan resource.',
        })
      }

      // `%`, `,`, dan tanda kurung DILUCUTI — ketiganya bermakna khusus di
      // sintaks `.or()` PostgREST, bukan sekadar karakter biasa. Tanpa ini,
      // sebuah koma di kotak pencarian memecah kondisi jadi dua dan
      // menghasilkan hasil yang bukan apa yang diminta.
      //
      // Pola yang sama dipakai `ahsp.ts:308` (variabelnya juga bernama
      // `aman`), dan disamakan dengan sengaja: dua pembersihan berbeda untuk
      // masalah yang sama akan berbeda cacatnya.
      const aman = cari.replace(/[%,()]/g, ' ')

      const { data, error } = await request.db!
        .shared('resources')
        .select('id, code, name, unit_code, category')
        .eq('category', 'material')
        .or(`name.ilike.%${aman}%,code.ilike.%${aman}%`)
        .order('name', { ascending: true })
        .limit(50)

      if (error) {
        request.log.error({ err: error }, 'gagal mencari resource')
        return reply.status(500).send({ error: 'Gagal mencari resource' })
      }

      return reply.send({ resource: data })
    },
  )

  // ── PUT /gudang/susut/peta ───────────────────────────────────────────────
  app.put<{ Body: { resource_id?: string; material_id?: string; faktor?: number | string; catatan?: string } }>(
    '/api/v1/gudang/susut/peta',
    { preHandler: [authenticate, requirePermission('gudang:susut:manage')] },
    async (request, reply) => {
      const b = request.body ?? {}
      if (!b.resource_id) return reply.status(400).send({ error: 'resource_id wajib diisi' })
      if (!b.material_id) return reply.status(400).send({ error: 'material_id wajib diisi' })

      const p = periksaFaktor(b.faktor)
      if (p) return reply.status(400).send({ error: p })

      const { data, error } = await request.db!
        .from('peta_resource_material')
        .upsert({
          resource_id: b.resource_id,
          material_id: b.material_id,
          faktor: b.faktor,
          catatan: b.catatan?.trim() || null,
          dipetakan_oleh: request.currentUser!.id,
          updated_at: new Date().toISOString(),
        }, { onConflict: 'company_id,resource_id' })
        .select(SELECT_PETA)
        .single()

      if (error) {
        request.log.error({ err: error }, 'gagal menyimpan pemetaan')
        return reply.status(400).send({ error: error.message })
      }

      await logAuditEvent(request, {
        action: 'UPDATE',
        actorId: request.currentUser!.id,
        tableName: 'peta_resource_material',
        recordId: data!.id as string,
        newValues: data as Record<string, unknown>,
      })
      return reply.send({ peta: data })
    },
  )

  // ── DELETE /gudang/susut/peta/:id ────────────────────────────────────────
  app.delete<{ Params: { id: string } }>(
    '/api/v1/gudang/susut/peta/:id',
    { preHandler: [authenticate, requirePermission('gudang:susut:manage')] },
    async (request, reply) => {
      const { id } = request.params
      const { data, error } = await request.db!
        .from('peta_resource_material').delete().eq('id', id).select('id').maybeSingle()
      if (error) return reply.status(400).send({ error: error.message })
      if (!data) return reply.status(404).send({ error: 'Pemetaan tidak ditemukan' })

      await logAuditEvent(request, {
        action: 'DELETE',
        actorId: request.currentUser!.id,
        tableName: 'peta_resource_material',
        recordId: id,
        oldValues: { id },
      })
      return reply.send({ dihapus: id })
    },
  )

  // ── GET /gudang/susut/rencana ────────────────────────────────────────────
  app.get(
    '/api/v1/gudang/susut/rencana',
    { preHandler: [authenticate, requirePermission('gudang:susut:view')] },
    async (request, reply) => {
      const { data, error } = await request.db!
        .from('rencana_susut_material')
        .select(SELECT_RENCANA)
        .limit(500)
      if (error) {
        request.log.error({ err: error }, 'gagal memuat rencana susut')
        return reply.status(500).send({ error: 'Gagal memuat rencana susut' })
      }
      return reply.send({ rencana: data })
    },
  )

  // ── PUT /gudang/susut/rencana ────────────────────────────────────────────
  app.put<{ Body: { material_id?: string; susut_persen?: number | string; dasar?: string } }>(
    '/api/v1/gudang/susut/rencana',
    { preHandler: [authenticate, requirePermission('gudang:susut:manage')] },
    async (request, reply) => {
      const b = request.body ?? {}
      if (!b.material_id) return reply.status(400).send({ error: 'material_id wajib diisi' })

      const p = periksaRencana(b.susut_persen)
      if (p) return reply.status(400).send({ error: p })

      // Persen → fraksi di SATU tempat. Membaginya di beberapa tempat adalah
      // cara paling mudah kehilangan faktor 100 (pelajaran G6a).
      const fraksi = Number(b.susut_persen) / 100

      const { data, error } = await request.db!
        .from('rencana_susut_material')
        .upsert({
          material_id: b.material_id,
          susut_fraksi: fraksi,
          dasar: b.dasar?.trim() || null,
          ditetapkan_oleh: request.currentUser!.id,
          updated_at: new Date().toISOString(),
        }, { onConflict: 'company_id,material_id' })
        .select(SELECT_RENCANA)
        .single()

      if (error) {
        request.log.error({ err: error }, 'gagal menyimpan rencana susut')
        return reply.status(400).send({ error: error.message })
      }

      await logAuditEvent(request, {
        action: 'UPDATE',
        actorId: request.currentUser!.id,
        tableName: 'rencana_susut_material',
        recordId: data!.id as string,
        newValues: data as Record<string, unknown>,
      })
      return reply.send({ rencana: data })
    },
  )
}
