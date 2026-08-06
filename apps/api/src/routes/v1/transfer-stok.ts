import type { FastifyInstance } from 'fastify'
import { authenticate, requirePermission } from '../../plugins/auth.js'
import { proyekMilikTenant } from '../../utils/tenant-guard.js'

/**
 * TRANSFER STOK ANTAR PROYEK (F5 PEMBEDA — rekonsiliasi material 1,5/5)
 *
 * ── Cacat yang ditutup
 *
 * `stock_movements` punya SATU `project_id`. Material yang pindah dari proyek
 * A ke proyek B hanya bisa dicatat sebagai dua baris yang tak saling mengenal
 * — tak ada yang menjamin sisi lawannya ada, apalagi sama besar.
 *
 * Akibatnya terlihat di `/gudang/rekonsiliasi`: material yang PINDAH muncul
 * sebagai **susut tak terjelaskan di proyek asal**. Laporan itu menuduh orang
 * atas barang yang sebenarnya masih ada, hanya di proyek sebelah.
 *
 * ── Catatan tenancy yang TIDAK boleh hilang
 *
 * `tenant-map.generated.ts` mengklasifikasikan `stock_transfers` sebagai
 * kategori C lewat `project_asal_id` — generator memang memilih FK proyek
 * yang pertama ditemukan, dan berkas itu tak boleh disunting tangan.
 *
 * Artinya `viaProject('stock_transfers', id)` hanya menyaring sisi ASAL.
 * Query yang memakainya akan **melewatkan transfer di mana proyek ini adalah
 * TUJUAN** — barang masuk yang tak pernah terlihat.
 *
 * Karena itu daftar di bawah TIDAK memakai `viaProject`, melainkan menyaring
 * eksplisit terhadap dua sisi. Isolasi tenant-nya sendiri tidak bergantung
 * pada itu: policy RESTRICTIVE di migrasi 193 memeriksa `project_asal_id`
 * DAN `project_tujuan_id`, jadi lapis basis tetap menutup walau lapis
 * aplikasi keliru.
 */
export default async function transferStokRoutes(app: FastifyInstance) {
  // ── GET /api/v1/transfer-stok ────────────────────────────────────────────
  app.get('/api/v1/transfer-stok', {
    preHandler: [authenticate, requirePermission('procurement:view')],
  }, async (request, reply) => {
    const q = request.query as Record<string, string>

    // Daftar proyek milik tenant — dipakai untuk menyaring KEDUA sisi.
    const idProyek = await request.db!.projectIds()
    if (idProyek.length === 0) return reply.send({ transfers: [], total: 0 })

    // Satu proyek diminta? Pastikan ia milik tenant sebelum dipakai menyaring.
    if (q.project_id && !(await proyekMilikTenant(request, q.project_id))) {
      return reply.status(404).send({ error: 'Proyek tidak ditemukan' })
    }

    const batas = Math.min(Math.max(Number(q.limit) || 100, 1), 500)

    // `unsafe()`, BUKAN `supabase` mentah — bedanya bukan kosmetik: alasannya
    // tercatat di tempat kejadian, dan ratchet T4f tetap bisa menghitung akses
    // mentah yang sesungguhnya tak terkelola.
    //
    // `viaProject` tak bisa dipakai di sini karena ia menyaring SATU kolom
    // (`project_asal_id` menurut katalog), sehingga transfer di mana proyek
    // ini adalah TUJUAN akan hilang dari daftar — barang masuk yang tak
    // pernah terlihat. Penyaringan dua sisi dilakukan eksplisit di bawah.
    let kueri = request.db!
      .unsafe('stock_transfers', 'perlu saring DUA kolom proyek (asal & tujuan); viaProject hanya satu')
      .select(
        `id, qty, tanggal, alasan, created_at,
         material:materials ( id, name, unit ),
         asal:projects!stock_transfers_project_asal_id_fkey ( id, name ),
         tujuan:projects!stock_transfers_project_tujuan_id_fkey ( id, name ),
         pembuat:users ( id, name )`,
        { count: 'exact' },
      )
      // Gerbang tenant di lapis aplikasi: KEDUA sisi wajib milik tenant ini.
      // Bukan `viaProject` — lihat catatan tenancy di kepala berkas.
      .in('project_asal_id', idProyek)
      .in('project_tujuan_id', idProyek)

    // Saringan per-proyek memakai `or`: proyek ini bisa jadi asal ATAU tujuan.
    // Menyaring hanya `project_asal_id` membuat barang MASUK tak pernah
    // terlihat oleh proyek yang menerimanya.
    if (q.project_id) {
      kueri = kueri.or(`project_asal_id.eq.${q.project_id},project_tujuan_id.eq.${q.project_id}`)
    }

    const { data, error, count } = await kueri
      .order('tanggal', { ascending: false })
      .order('created_at', { ascending: false })
      .range(0, batas - 1)

    if (error) return reply.status(500).send({ error: error.message })

    return reply.send({ transfers: data ?? [], total: count ?? 0 })
  })

  // ── POST /api/v1/transfer-stok ───────────────────────────────────────────
  // Permission `procurement:material:manage` — DIVERIFIKASI ada di tabel
  // `permissions` (2026-08-06). Saya sempat menulis `procurement:stock:manage`
  // yang TIDAK ADA: gerbang gagal-tertutup akan menolak semua orang, dan
  // endpoint yang sudah jadi jadi tak bisa dipakai siapa pun tanpa satu pun
  // pesan yang menjelaskan kenapa.
  //
  // SENGAJA tidak meniru `POST /procurement/stocks/usage`, yang memakai
  // `procurement:view` — permission BACA untuk endpoint yang MENULIS saldo
  // (cacat T4j, sudah tercatat di berkas itu sendiri). Memindahkan material
  // antar proyek adalah tindakan mengelola material, bukan melihatnya.
  app.post('/api/v1/transfer-stok', {
    preHandler: [authenticate, requirePermission('procurement:material:manage')],
  }, async (request, reply) => {
    const b = request.body as {
      project_asal_id?: string
      project_tujuan_id?: string
      material_id?: string
      qty?: number
      tanggal?: string
      alasan?: string
    }

    if (!b.project_asal_id || !b.project_tujuan_id || !b.material_id || !b.qty) {
      return reply.status(400).send({
        error: 'project_asal_id, project_tujuan_id, material_id, dan qty wajib diisi',
      })
    }

    const qty = Number(b.qty)
    if (!Number.isFinite(qty) || qty <= 0) {
      return reply.status(400).send({ error: 'qty harus angka lebih dari 0' })
    }

    if (b.project_asal_id === b.project_tujuan_id) {
      // Dijaga juga oleh CHECK di basis. Diperiksa di sini supaya penggunanya
      // dapat kalimat yang bisa dimengerti, bukan galat constraint mentah.
      return reply.status(400).send({ error: 'Proyek asal dan tujuan tidak boleh sama' })
    }

    // ── Gerbang tenancy DUA SISI ──────────────────────────────────────────
    //
    // Memeriksa hanya proyek asal membuat material bisa didorong ke proyek
    // tenant LAIN: barangnya hilang dari kartu stok kita dengan alasan yang
    // terlihat sah, dan muncul di tenant yang tak pernah memintanya.
    //
    // 404 (bukan 403) untuk keduanya — membedakan "tidak ada" dari "bukan
    // milik Anda" memberi tahu penanya bahwa proyek itu ADA di tenant lain.
    if (!(await proyekMilikTenant(request, b.project_asal_id))) {
      return reply.status(404).send({ error: 'Proyek asal tidak ditemukan' })
    }
    if (!(await proyekMilikTenant(request, b.project_tujuan_id))) {
      return reply.status(404).send({ error: 'Proyek tujuan tidak ditemukan' })
    }

    // Semua penulisan di bawah lewat wrapper sadar-tenant, bukan `supabase`
    // mentah: ratchet T4f menjaga agar akses mentah tak bertambah, dan di
    // endpoint yang MENYENTUH SALDO DUA PROYEK sekaligus, saringan tenant
    // yang terpasang otomatis lebih murah daripada yang harus diingat.
    const db = request.db!

    // ── Stok asal harus cukup ─────────────────────────────────────────────
    const { data: stokAsal, error: errAsal } = await db
      .viaProject('project_stocks', b.project_asal_id)
      .select('id, qty_on_hand')
      .eq('material_id', b.material_id)
      .maybeSingle()

    if (errAsal) return reply.status(500).send({ error: errAsal.message })

    const asalSebelum = Number(stokAsal?.qty_on_hand ?? 0)
    if (qty > asalSebelum) {
      // Tanpa pemeriksaan ini stok asal jadi NEGATIF — dan stok negatif di
      // kartu gudang tak pernah terbaca sebagai galat, hanya sebagai angka
      // aneh yang diabaikan sampai opname fisik berbulan kemudian.
      return reply.status(400).send({
        error: `Stok tidak cukup di proyek asal. Tersedia: ${asalSebelum}, diminta: ${qty}`,
      })
    }

    const asalSesudah = asalSebelum - qty

    const { data: stokTujuan, error: errTujuan } = await db
      .viaProject('project_stocks', b.project_tujuan_id)
      .select('id, qty_on_hand')
      .eq('material_id', b.material_id)
      .maybeSingle()

    if (errTujuan) return reply.status(500).send({ error: errTujuan.message })

    const tujuanSebelum = Number(stokTujuan?.qty_on_hand ?? 0)
    const tujuanSesudah = tujuanSebelum + qty

    // ── Kepala transfer ditulis LEBIH DULU ────────────────────────────────
    //
    // Urutannya disengaja. Kalau mutasi ditulis lebih dulu lalu kepalanya
    // gagal, yang tertinggal adalah dua baris mutasi tanpa apa pun yang
    // menyatakan keduanya satu peristiwa — persis keadaan yang modul ini
    // dibuat untuk mengakhiri.
    //
    // Dengan kepala lebih dulu, kegagalan di tengah menyisakan kepala tanpa
    // mutasi: terlihat sebagai transfer yang stoknya belum bergerak, bisa
    // ditemukan (`movement_keluar_id IS NULL`), dan tak merusak saldo.
    const { data: kepala, error: errKepala } = await db
      .viaProject('stock_transfers', b.project_asal_id)
      .insert({
        project_asal_id: b.project_asal_id,
        project_tujuan_id: b.project_tujuan_id,
        material_id: b.material_id,
        qty,
        tanggal: b.tanggal ?? new Date().toISOString().slice(0, 10),
        alasan: b.alasan ?? null,
        created_by: request.currentUser!.id,
      })
      .select('id')
      .single()

    if (errKepala) return reply.status(500).send({ error: errKepala.message })

    // ── Dua sisi mutasi ───────────────────────────────────────────────────
    //
    // `transfer_out` bertanda NEGATIF, `transfer_in` POSITIF — mengikuti
    // konvensi yang sudah dipakai `procurement.ts` (`usage` ditulis negatif).
    // Keduanya sudah ada di CHECK `movement_type` sejak awal dan tak pernah
    // terpakai; inilah pemakaian pertamanya.
    const { data: mutasi, error: errMutasi } = await db
      .viaProject('stock_movements', b.project_asal_id)
      .insert([
        {
          project_id: b.project_asal_id, material_id: b.material_id,
          movement_type: 'transfer_out', qty: -qty,
          qty_before: asalSebelum, qty_after: asalSesudah,
          reference_type: 'stock_transfer', reference_id: kepala.id,
          notes: b.alasan ?? null, created_by: request.currentUser!.id,
        },
        {
          project_id: b.project_tujuan_id, material_id: b.material_id,
          movement_type: 'transfer_in', qty,
          qty_before: tujuanSebelum, qty_after: tujuanSesudah,
          reference_type: 'stock_transfer', reference_id: kepala.id,
          notes: b.alasan ?? null, created_by: request.currentUser!.id,
        },
      ])
      .select('id, project_id, movement_type')

    if (errMutasi) {
      // Kepala tanpa mutasi tak boleh tertinggal diam-diam: ia akan terbaca
      // sebagai transfer yang sah pada laporan, padahal tak ada barang yang
      // bergerak. Dibersihkan, dan kegagalan pembersihannya ikut dilaporkan.
      const { error: errBatal } = await db
        .viaProject('stock_transfers', b.project_asal_id).delete().eq('id', kepala.id)
      if (errBatal) {
        return reply.status(500).send({
          error: `Mutasi stok gagal (${errMutasi.message}), DAN pembatalan kepala transfer ${kepala.id} juga gagal (${errBatal.message}). Transfer ini tercatat tanpa pergerakan stok — perbaiki manual.`,
        })
      }
      return reply.status(500).send({ error: `Gagal menulis mutasi stok: ${errMutasi.message}` })
    }

    type BarisMutasi = { id: string; project_id: string; movement_type: string }
    const keluar = ((mutasi ?? []) as BarisMutasi[]).find((m) => m.movement_type === 'transfer_out')
    const masuk = ((mutasi ?? []) as BarisMutasi[]).find((m) => m.movement_type === 'transfer_in')

    // ── Saldo kedua proyek ────────────────────────────────────────────────
    //
    // Hasil tiap penulisan DIPERIKSA. Ini satu-satunya tempat saldo berubah;
    // kalau gagal diam-diam, riwayat bilang barang pindah sementara saldo
    // bilang tidak — dan selisihnya baru ketahuan saat opname, tanpa jejak
    // yang bisa dilacak lagi.
    const { error: errSimpanAsal } = stokAsal
      ? await db.viaProject('project_stocks', b.project_asal_id)
          .update({ qty_on_hand: asalSesudah, last_updated_at: new Date().toISOString() })
          .eq('id', stokAsal.id)
      : await db.viaProject('project_stocks', b.project_asal_id)
          .insert({ project_id: b.project_asal_id, material_id: b.material_id, qty_on_hand: asalSesudah })

    if (errSimpanAsal) {
      return reply.status(500).send({
        error: `Saldo proyek asal gagal diperbarui (${errSimpanAsal.message}). Transfer ${kepala.id} sudah tercatat — periksa kartu stok kedua proyek.`,
      })
    }

    const { error: errSimpanTujuan } = stokTujuan
      ? await db.viaProject('project_stocks', b.project_tujuan_id)
          .update({ qty_on_hand: tujuanSesudah, last_updated_at: new Date().toISOString() })
          .eq('id', stokTujuan.id)
      : await db.viaProject('project_stocks', b.project_tujuan_id)
          .insert({ project_id: b.project_tujuan_id, material_id: b.material_id, qty_on_hand: tujuanSesudah })

    if (errSimpanTujuan) {
      return reply.status(500).send({
        error: `Saldo proyek tujuan gagal diperbarui (${errSimpanTujuan.message}). Transfer ${kepala.id} sudah tercatat — periksa kartu stok kedua proyek.`,
      })
    }

    // Tautkan kepala ke kedua mutasinya. Gagal di sini tidak membatalkan apa
    // pun — barangnya sudah pindah dengan benar — tapi tetap dilaporkan,
    // sebab tautan yang hilang membuat jejak dua sisinya tak bisa ditelusuri.
    const { error: errTaut } = await db
      .viaProject('stock_transfers', b.project_asal_id)
      .update({ movement_keluar_id: keluar?.id ?? null, movement_masuk_id: masuk?.id ?? null })
      .eq('id', kepala.id)

    if (errTaut) {
      return reply.status(500).send({
        error: `Stok sudah dipindahkan, tapi tautan jejaknya gagal disimpan (${errTaut.message}). Transfer ${kepala.id} perlu diperiksa.`,
      })
    }

    return reply.status(201).send({
      transfer: {
        id: kepala.id,
        qty,
        asal: { project_id: b.project_asal_id, qty_before: asalSebelum, qty_after: asalSesudah },
        tujuan: { project_id: b.project_tujuan_id, qty_before: tujuanSebelum, qty_after: tujuanSesudah },
      },
    })
  })
}
