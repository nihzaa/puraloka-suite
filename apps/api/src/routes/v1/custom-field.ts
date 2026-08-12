import type { FastifyInstance } from 'fastify'
import { authenticate, requirePermission } from '../../plugins/auth.js'
import { logAuditEvent } from '../../utils/audit.js'
import { CF_ENTITAS, CF_TIPE, validasiDefinisi, type CfEntitas } from '../../lib/custom-field.js'

/**
 * CUSTOM FIELD PER TENANT (TJS-P5).
 *
 * ── Tiga izin, bukan satu
 *
 * `settings:customfield:view`    membaca
 * `settings:customfield:manage`  mengubah BENTUK formulir (definisi)
 * `settings:customfield:isi`     mengisi NILAI pada data
 *
 * Yang mengisi "nomor BPJS" seorang pegawai adalah staf HRD; yang memutuskan
 * ADA field bernama itu adalah admin. Menyatukan keduanya berarti tiap orang
 * yang boleh mengisi juga boleh mengubah bentuk formulirnya — dan bentuk
 * formulir yang berubah diam-diam adalah data lama yang jadi tak terbaca.
 *
 * ── Validasi ADA DI DUA TEMPAT, dan itu disengaja
 *
 * Basis sudah menolak entitas/tipe di luar daftar (enum), nilai yang tak
 * cocok tipenya (trigger), dan field ke-21 (trigger). Lapisan ini TIDAK
 * menggantikannya — ia menerjemahkan penolakan itu jadi pesan yang bisa
 * ditindaklanjuti.
 *
 * Tanpa lapisan ini, pengguna yang mengetik "dua belas" di kolom angka
 * melihat galat Postgres mentah. Tanpa lapisan basis, importer dan skrip
 * perbaikan data menulis apa saja.
 */
export default async function customFieldRoutes(app: FastifyInstance) {

  // ── Katalog: entitas & tipe yang tersedia ────────────────────────────────
  //
  // Dibaca UI untuk mengisi dropdown. Sumbernya konstanta yang dijaga
  // `audit-custom-field-entitas.mjs` agar cocok dengan enum di basis —
  // dua daftar yang berbeda diam-diam adalah dropdown yang menawarkan
  // pilihan yang lalu ditolak saat disimpan.
  app.get('/api/v1/custom-field/katalog', {
    preHandler: [authenticate, requirePermission('settings:customfield:view')],
  }, async (_request, reply) => {
    return reply.send({ entitas: CF_ENTITAS, tipe: CF_TIPE, batas_per_entitas: 20 })
  })

  // ── Definisi ─────────────────────────────────────────────────────────────
  app.get('/api/v1/custom-field/def', {
    preHandler: [authenticate, requirePermission('settings:customfield:view')],
  }, async (request, reply) => {
    const { entitas, all } = request.query as { entitas?: string; all?: string }
    let q = request.db!.from('custom_field_def')
      .select('id, entitas, tipe, kunci, label, wajib, opsi, urutan, aktif, dibuat_pada')
      .order('entitas', { ascending: true })
      .order('urutan', { ascending: true })
    if (entitas) {
      if (!CF_ENTITAS.includes(entitas as CfEntitas)) {
        return reply.status(400).send({ error: `Entitas "${entitas}" tak ada dalam daftar` })
      }
      q = q.eq('entitas', entitas)
    }
    if (all !== 'true') q = q.eq('aktif', true)

    const { data, error } = await q
    if (error) return reply.status(500).send({ error: error.message })
    return reply.send({ definisi: data ?? [] })
  })

  app.post('/api/v1/custom-field/def', {
    preHandler: [authenticate, requirePermission('settings:customfield:manage')],
  }, async (request, reply) => {
    const body = request.body as Record<string, unknown>
    const v = validasiDefinisi(body)
    if (!v.ok) return reply.status(400).send({ error: v.error })

    const { data, error } = await request.db!.from('custom_field_def').insert({
      entitas: v.nilai.entitas,
      tipe: v.nilai.tipe,
      kunci: v.nilai.kunci,
      label: v.nilai.label,
      wajib: v.nilai.wajib,
      opsi: v.nilai.opsi,
      urutan: v.nilai.urutan,
    }).select('id, entitas, tipe, kunci, label, wajib, opsi, urutan, aktif').single()

    if (error) {
      const kode = (error as { code?: string }).code
      if (kode === '23505') {
        return reply.status(409).send({ error: `Kunci "${v.nilai.kunci}" sudah dipakai di ${v.nilai.entitas}` })
      }
      // Batas 20 datang dari trigger sebagai raise_exception (P0001), bukan
      // constraint. Pesannya sudah ditulis untuk manusia di migrasi 321,
      // jadi diteruskan apa adanya — menulis ulang di sini membuat dua
      // kalimat yang harus dijaga tetap sama.
      if (kode === 'P0001') return reply.status(409).send({ error: error.message })
      return reply.status(500).send({ error: error.message })
    }

    void logAuditEvent(request, {
      tableName: 'custom_field_def', recordId: (data as { id: string }).id,
      action: 'custom_field.def.create', actorId: request.currentUser!.id,
      newValues: data as Record<string, unknown>, severity: 'info',
    })
    return reply.status(201).send({ definisi: data })
  })

  app.patch<{ Params: { id: string } }>('/api/v1/custom-field/def/:id', {
    preHandler: [authenticate, requirePermission('settings:customfield:manage')],
  }, async (request, reply) => {
    const { id } = request.params
    const body = request.body as Record<string, unknown>

    // `entitas`, `tipe`, dan `kunci` TIDAK bisa diubah.
    //
    // Mengubah tipe field yang sudah terisi membuat nilai lama tak cocok
    // dengan definisinya — dan trigger validasi hanya berjalan saat MENULIS,
    // jadi baris lama tetap tersimpan dalam bentuk yang tak mungkin lagi
    // ditulis ulang. Yang menemukannya adalah laporan yang gagal, bulan
    // depan.
    //
    // Yang berubah bentuknya: nonaktifkan yang lama, buat yang baru.
    for (const terlarang of ['entitas', 'tipe', 'kunci']) {
      if (body[terlarang] !== undefined) {
        return reply.status(400).send({
          error: `"${terlarang}" tak bisa diubah setelah field dibuat. `
            + 'Nonaktifkan field ini lalu buat yang baru — nilai lama tetap terbaca.',
        })
      }
    }

    const patch: Record<string, unknown> = {}
    if (body.label !== undefined) {
      const label = String(body.label).trim()
      if (label === '') return reply.status(400).send({ error: 'Label tak boleh kosong' })
      patch.label = label
    }
    if (body.wajib !== undefined) patch.wajib = Boolean(body.wajib)
    if (body.urutan !== undefined) patch.urutan = Number(body.urutan) || 0
    if (body.aktif !== undefined) patch.aktif = Boolean(body.aktif)
    if (body.opsi !== undefined) {
      if (!Array.isArray(body.opsi)) return reply.status(400).send({ error: 'opsi harus array' })
      patch.opsi = body.opsi.map(String).map(s => s.trim()).filter(Boolean)
    }
    if (Object.keys(patch).length === 0) {
      return reply.status(400).send({ error: 'Tak ada yang diubah' })
    }

    const { data, error } = await request.db!.from('custom_field_def')
      .update(patch).eq('id', id)
      .select('id, entitas, tipe, kunci, label, wajib, opsi, urutan, aktif')

    if (error) return reply.status(500).send({ error: error.message })
    // NOL BARIS terbarui tak boleh menyamar jadi sukses: id yang tak ada,
    // atau milik tenant lain sehingga tersaring RLS.
    if (!data || data.length === 0) {
      return reply.status(404).send({ error: 'Field tidak ditemukan' })
    }

    void logAuditEvent(request, {
      tableName: 'custom_field_def', recordId: id, action: 'custom_field.def.update',
      actorId: request.currentUser!.id, newValues: patch, severity: 'info',
    })
    return reply.send({ definisi: data[0] })
  })

  // ── Nilai ────────────────────────────────────────────────────────────────
  app.get<{ Params: { entitas: string; id: string } }>(
    '/api/v1/custom-field/nilai/:entitas/:id', {
    preHandler: [authenticate, requirePermission('settings:customfield:view')],
  }, async (request, reply) => {
    const { entitas, id } = request.params
    if (!CF_ENTITAS.includes(entitas as CfEntitas)) {
      return reply.status(400).send({ error: `Entitas "${entitas}" tak ada dalam daftar` })
    }

    // Definisi AKTIF dulu, lalu nilainya — supaya field yang belum pernah
    // diisi tetap muncul (dengan nilai null). Mengembalikan hanya baris nilai
    // membuat formulir kehilangan field kosongnya.
    const { data: def, error: errDef } = await request.db!.from('custom_field_def')
      .select('id, tipe, kunci, label, wajib, opsi, urutan')
      .eq('entitas', entitas).eq('aktif', true)
      .order('urutan', { ascending: true })
    if (errDef) return reply.status(500).send({ error: errDef.message })

    const { data: nilai, error: errNilai } = await request.db!.from('custom_field_nilai')
      .select('def_id, nilai').eq('entitas_id', id)
    if (errNilai) return reply.status(500).send({ error: errNilai.message })

    const peta = new Map((nilai ?? []).map(n => [
      (n as { def_id: string }).def_id, (n as { nilai: unknown }).nilai,
    ]))
    const hasil = (def ?? []).map(d => ({
      ...(d as Record<string, unknown>),
      nilai: peta.get((d as { id: string }).id) ?? null,
    }))
    return reply.send({ field: hasil })
  })

  app.put<{ Params: { entitas: string; id: string } }>(
    '/api/v1/custom-field/nilai/:entitas/:id', {
    preHandler: [authenticate, requirePermission('settings:customfield:isi')],
  }, async (request, reply) => {
    const { entitas, id } = request.params
    if (!CF_ENTITAS.includes(entitas as CfEntitas)) {
      return reply.status(400).send({ error: `Entitas "${entitas}" tak ada dalam daftar` })
    }
    const body = request.body as { nilai?: Record<string, unknown> }
    if (!body?.nilai || typeof body.nilai !== 'object') {
      return reply.status(400).send({ error: 'Wajib: nilai (objek {kunci: nilai})' })
    }

    const { data: def, error: errDef } = await request.db!.from('custom_field_def')
      .select('id, kunci, label, tipe, wajib').eq('entitas', entitas).eq('aktif', true)
    if (errDef) return reply.status(500).send({ error: errDef.message })

    const petaKunci = new Map((def ?? []).map(d => [(d as { kunci: string }).kunci, d]))

    // Kunci yang tak dikenal DITOLAK, bukan diabaikan diam-diam.
    //
    // Mengabaikannya berarti salah ketik pada nama field tersimpan sebagai
    // "berhasil" sementara nilainya hilang — dan yang menemukannya adalah
    // orang yang mencari data itu minggu depan.
    const asing = Object.keys(body.nilai).filter(k => !petaKunci.has(k))
    if (asing.length > 0) {
      return reply.status(400).send({
        error: `Field tak dikenal untuk ${entitas}: ${asing.join(', ')}`,
      })
    }

    const baris = Object.entries(body.nilai).map(([kunci, v]) => ({
      def_id: (petaKunci.get(kunci) as { id: string }).id,
      entitas_id: id,
      nilai: v ?? null,
    }))
    if (baris.length === 0) return reply.send({ tersimpan: 0 })

    const { data, error } = await request.db!.from('custom_field_nilai')
      .upsert(baris, { onConflict: 'def_id,entitas_id' })
      .select('def_id')

    if (error) {
      // Validasi tipe datang dari trigger sebagai P0001 dengan pesan yang
      // sudah ditulis untuk manusia ("Field "X" bertipe angka, nilainya
      // string"). Diteruskan apa adanya.
      if ((error as { code?: string }).code === 'P0001') {
        return reply.status(400).send({ error: error.message })
      }
      return reply.status(500).send({ error: error.message })
    }

    void logAuditEvent(request, {
      tableName: 'custom_field_nilai', recordId: id, action: 'custom_field.nilai.set',
      actorId: request.currentUser!.id,
      newValues: { entitas, kunci: Object.keys(body.nilai) }, severity: 'info',
    })
    return reply.send({ tersimpan: data?.length ?? 0 })
  })
}
