import type { FastifyInstance } from 'fastify'
import { authenticate, requirePermission } from '../../plugins/auth.js'
import { requireModul } from '../../utils/gerbang-modul.js'
import { logAuditEvent } from '../../utils/audit.js'

/**
 * GUDANG — mengelola lokasi penyimpanan sebagai entitas tersendiri.
 *
 * ── Lubang yang ditutup
 *
 * Tabel `gudang` + `gudang_stok` ADA lengkap dengan constraint, RLS ber-FORCE,
 * dan izin `gudang:view`/`gudang:manage`. Diukur 2026-08-12: satu-satunya kode
 * yang menyentuhnya hanya MEMBACA (`gudang-ikhtisar.ts` dan `ai-tool.ts`).
 *
 * Nol jalan membuat, menyunting, atau menonaktifkan gudang — jadi satu-satunya
 * gudang yang ada masuk lewat seed, dan perusahaan yang punya dua gudang tak
 * bisa mencatat yang kedua.
 *
 * ── Kenapa gudang TIDAK bisa dihapus
 *
 * `gudang_stok.gudang_id` ber-CASCADE: menghapus gudang menghapus seluruh
 * catatan stoknya, dan itu memusnahkan riwayat yang jadi dasar rekonsiliasi.
 * Yang disediakan adalah menonaktifkan (`aktif = false`) — gudangnya berhenti
 * jadi pilihan, tetapi apa yang pernah tercatat di sana tetap terbaca.
 */
export default async function gudangKelolaRoutes(app: FastifyInstance) {
  const ALASAN = 'kategori B; disaring company_id di baris berikutnya'
  const ALASAN_STOK = 'gudang induknya sudah diverifikasi milik tenant ini'

  // ── GET /api/v1/gudang ───────────────────────────────────────────────────
  app.get<{ Querystring: { aktif?: string } }>(
    '/api/v1/gudang',
    { preHandler: [authenticate, requireModul('modul.gudang'), requirePermission('gudang:view')] },
    async (request, reply) => {
      const db = request.db!

      let query = db.unsafe('gudang', ALASAN)
        .select(`
          id, kode, nama, alamat, aktif, catatan, penjaga_id, created_at,
          penjaga:users ( id, name )
        `)
        .eq('company_id', request.companyId!)
        .order('kode')
      if (request.query.aktif === '1') query = query.eq('aktif', true)

      const { data, error } = await query
      if (error) return reply.status(500).send({ error: error.message })

      const daftar = (data ?? []) as Array<Record<string, unknown>>
      if (daftar.length === 0) return reply.send({ gudang: [] })

      // Jumlah jenis material & total kuantitas per gudang — angka yang
      // menentukan apakah gudang ini boleh dinonaktifkan tanpa kehilangan
      // jejak. Gudang kosong dan gudang berisi 800 sak terlihat sama tanpa ini.
      const { data: stok, error: errStok } = await db.unsafe('gudang_stok', ALASAN_STOK)
        .select('gudang_id, qty')
        .in('gudang_id', daftar.map((g) => g.id as string))
      if (errStok) return reply.status(500).send({ error: errStok.message })

      const hitung = new Map<string, { jenis: number; total: number }>()
      for (const s of (stok ?? []) as Array<{ gudang_id: string; qty: number | string }>) {
        const k = hitung.get(s.gudang_id) ?? { jenis: 0, total: 0 }
        k.jenis++
        // `numeric` datang sebagai STRING dari pg — `'8' + '3'` menghasilkan
        // '83' kalau tak dikonversi, dan angkanya salah tanpa satu pun galat.
        k.total += Number(s.qty ?? 0)
        hitung.set(s.gudang_id, k)
      }

      return reply.send({
        gudang: daftar.map((g) => ({
          ...g,
          jenis_material: hitung.get(g.id as string)?.jenis ?? 0,
          total_qty: Math.round((hitung.get(g.id as string)?.total ?? 0) * 100) / 100,
        })),
      })
    },
  )

  // ── POST /api/v1/gudang ──────────────────────────────────────────────────
  app.post<{
    Body: {
      kode?: string
      nama?: string
      alamat?: string
      penjaga_id?: string | null
      catatan?: string
    }
  }>(
    '/api/v1/gudang',
    { preHandler: [authenticate, requireModul('modul.gudang'), requirePermission('gudang:manage')] },
    async (request, reply) => {
      const db = request.db!
      const b = request.body

      if (!b?.kode?.trim()) return reply.status(400).send({ error: 'Kode gudang wajib diisi' })
      if (!b.nama?.trim()) return reply.status(400).send({ error: 'Nama gudang wajib diisi' })

      const kode = b.kode.trim().toUpperCase()

      // Penjaga WAJIB anggota tenant ini. Tanpa cek, gudang bisa ditugaskan ke
      // pengguna perusahaan lain — dan namanya muncul di layar mereka sebagai
      // penanggung jawab gudang yang tak pernah mereka lihat.
      if (b.penjaga_id) {
        const { data: anggota, error: errAnggota } = await db
          .unsafe('company_members', 'kategori B; disaring company_id di baris ini')
          .select('user_id')
          .eq('company_id', request.companyId!)
          .eq('user_id', b.penjaga_id)
          .maybeSingle()
        if (errAnggota) return reply.status(500).send({ error: errAnggota.message })
        if (!anggota) return reply.status(404).send({ error: 'Penjaga bukan anggota perusahaan ini' })
      }

      const { data, error } = await db.unsafe('gudang', ALASAN)
        .insert({
          company_id: request.companyId!,
          kode,
          nama: b.nama.trim(),
          alamat: b.alamat?.trim() || null,
          penjaga_id: b.penjaga_id ?? null,
          catatan: b.catatan?.trim() || null,
          aktif: true,
        })
        .select('id, kode, nama, aktif')
        .single()
      if (error) {
        if ((error as { code?: string }).code === '23505') {
          return reply.status(409).send({ error: `Kode gudang ${kode} sudah dipakai` })
        }
        if ((error as { code?: string }).code === '23514') {
          return reply.status(422).send({ error: error.message })
        }
        return reply.status(500).send({ error: error.message })
      }

      void logAuditEvent(request, {
        tableName: 'gudang', recordId: (data as { id: string }).id,
        action: 'gudang.create',
        actorId: request.currentUser!.id,
        newValues: { kode, nama: b.nama.trim() },
        severity: 'info',
      })

      return reply.status(201).send({ gudang: data })
    },
  )

  // ── PATCH /api/v1/gudang/:id ─────────────────────────────────────────────
  app.patch<{
    Params: { id: string }
    Body: {
      nama?: string
      alamat?: string | null
      penjaga_id?: string | null
      catatan?: string | null
      aktif?: boolean
    }
  }>(
    '/api/v1/gudang/:id',
    { preHandler: [authenticate, requireModul('modul.gudang'), requirePermission('gudang:manage')] },
    async (request, reply) => {
      const db = request.db!
      const { id } = request.params
      const b = request.body ?? {}

      const { data: ada, error: errBaca } = await db.unsafe('gudang', ALASAN)
        .select('id, kode, nama, aktif')
        .eq('id', id).eq('company_id', request.companyId!)
        .maybeSingle()
      if (errBaca) return reply.status(500).send({ error: errBaca.message })
      if (!ada) return reply.status(404).send({ error: 'Gudang tidak ditemukan' })

      const lama = ada as Record<string, unknown>

      if (b.penjaga_id) {
        const { data: anggota, error: errAnggota } = await db
          .unsafe('company_members', 'kategori B; disaring company_id di baris ini')
          .select('user_id')
          .eq('company_id', request.companyId!)
          .eq('user_id', b.penjaga_id)
          .maybeSingle()
        if (errAnggota) return reply.status(500).send({ error: errAnggota.message })
        if (!anggota) return reply.status(404).send({ error: 'Penjaga bukan anggota perusahaan ini' })
      }

      // Menonaktifkan gudang yang MASIH BERISI ditolak.
      //
      // Stoknya tak hilang, tapi gudangnya berhenti jadi pilihan — dan barang
      // yang tercatat di lokasi yang tak bisa dipilih adalah barang yang tak
      // bisa dikeluarkan. Yang benar: pindahkan isinya lebih dulu.
      if (b.aktif === false && lama.aktif === true) {
        const { count, error: errStok } = await db.unsafe('gudang_stok', ALASAN_STOK)
          .select('id', { count: 'exact', head: true })
          .eq('gudang_id', id)
          .gt('qty', 0)
        if (errStok) return reply.status(500).send({ error: errStok.message })
        if (count && count > 0) {
          return reply.status(409).send({
            error: `Gudang ${lama.kode} masih menyimpan ${count} jenis material. `
              + 'Pindahkan isinya lebih dulu — barang yang tercatat di gudang nonaktif '
              + 'tak bisa dikeluarkan dari mana pun.',
          })
        }
      }

      // HANYA kolom yang benar-benar dikirim yang ditulis — menyunting satu
      // kolom tak boleh menghapus sisanya (pelajaran dari rute pegawai).
      const patch: Record<string, unknown> = { updated_at: new Date().toISOString() }
      if ('nama' in b) {
        if (!b.nama?.trim()) return reply.status(400).send({ error: 'Nama gudang tak boleh kosong' })
        patch.nama = b.nama.trim()
      }
      if ('alamat' in b) patch.alamat = b.alamat?.trim() || null
      if ('penjaga_id' in b) patch.penjaga_id = b.penjaga_id ?? null
      if ('catatan' in b) patch.catatan = b.catatan?.trim() || null
      if ('aktif' in b) patch.aktif = b.aktif

      if (Object.keys(patch).length === 1) {
        return reply.status(400).send({ error: 'Tak ada kolom yang diubah' })
      }

      const { data, error } = await db.unsafe('gudang', ALASAN)
        .update(patch)
        .eq('id', id).eq('company_id', request.companyId!)
        .select('id, kode, nama, aktif')
      if (error) {
        if ((error as { code?: string }).code === '23514') {
          return reply.status(422).send({ error: error.message })
        }
        return reply.status(500).send({ error: error.message })
      }
      if (!data || data.length === 0) {
        return reply.status(409).send({ error: 'Gudang berubah dari tempat lain. Muat ulang.' })
      }

      void logAuditEvent(request, {
        tableName: 'gudang', recordId: id,
        action: b.aktif === false ? 'gudang.nonaktif' : 'gudang.ubah',
        actorId: request.currentUser!.id,
        oldValues: { nama: lama.nama, aktif: lama.aktif },
        newValues: patch,
        severity: 'info',
      })

      return reply.send({ gudang: data[0] })
    },
  )
}
