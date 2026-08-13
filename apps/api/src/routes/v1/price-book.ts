import type { FastifyInstance } from 'fastify'
import { authenticate, requirePermission } from '../../plugins/auth.js'
import { logAuditEvent } from '../../utils/audit.js'

// CECEP — Price Book management (M3): jalur masuk HARGA NYATA ke sistem.
//
// Lifecycle DB-guarded (104, maju saja): draft → verified → active → expired.
// Hanya entry ACTIVE yang dipakai resolusi harga (lib/price-resolver.ts).
// Verified WAJIB jejak (verified_by/at — constraint price_book_verified_trace).
// Field inti entry non-draft dikunci guard; API ini tak pernah mengedit angka
// entry non-draft — koreksi harga = entry BARU (versi berikutnya).

export default async function priceBookRoutes(app: FastifyInstance) {

  // ── GET /cecep/price-book — daftar harga (filter resource/status/lokasi) ────
  app.get<{ Querystring: {
    resource?: string; status?: string; location?: string; limit?: string; q?: string
    category?: string
  } }>(
    '/api/v1/cecep/price-book',
    { preHandler: [authenticate, requirePermission('cecep:price:view')] },
    async (request, reply) => {
      // Cap 5.000 — alasan sama dengan katalog assemblies: price book adalah
      // data REFERENSI yang dibaca sebagai daftar utuh. Dengan cap 200, harga
      // di luar 200 teratas tak pernah terlihat dan pemakai menginput duplikat
      // karena mengira harganya belum ada.
      const limit = Math.max(1, Math.min(5000, Number(request.query.limit) || 100))

      // Pencarian nama/kode resource dilakukan di SERVER. Price book berisi
      // 2.637 entri sementara respons dibatasi 200 — tanpa ini, harga yang
      // berada di luar 200 teratas tak akan pernah bisa ditemukan, dan pemakai
      // menyimpulkan harganya belum ada lalu menginput duplikat.
      // Pencarian teks DAN filter kategori (upah/bahan/alat) sama-sama
      // diselesaikan lewat `resources` — keduanya menyempitkan daftar id yang
      // sama, jadi digabung dalam satu query alih-alih dua kali bolak-balik.
      let idCari: string[] | null = null
      const cari = request.query.q?.trim()
      const kategori = request.query.category?.trim()
      if (cari || kategori) {
        let qr = request.db!.from('resources').select('id').limit(3000)
        if (cari) {
          const aman = cari.replace(/[%,()]/g, ' ')
          qr = qr.or(`name.ilike.%${aman}%,code.ilike.%${aman}%`)
        }
        if (kategori) qr = qr.eq('category', kategori)
        const { data: res } = await qr
        idCari = (res ?? []).map((r) => r.id)
        // Nol resource cocok → nol harga. Dikembalikan lebih awal supaya
        // `.in()` dengan daftar kosong tak menghasilkan seluruh baris.
        if (!idCari.length) return reply.send({ data: [], total: 0, limit })
      }

      // `resource=<kode>` (filter lama, satu resource persis) diselesaikan lebih
      // dulu supaya kriterianya sama untuk daftar maupun penghitungan total.
      let idResource: string | null = null
      if (request.query.resource) {
        const { data: r } = await request.db!
          .from('resources').select('id').eq('code', request.query.resource).maybeSingle()
        if (!r) return reply.status(404).send({ error: `Resource ${request.query.resource} tidak ditemukan` })
        idResource = r.id
      }

      let q = request.db!
        .from('price_book_entries')
        .select(`id, amount, currency, version_number, effective_date, expired_date,
                 location, supplier, confidence_level, status, verified_at, created_at,
                 resource:resources(id, code, name, category, unit_code)`)
        .order('effective_date', { ascending: false })
        .limit(limit)
      if (request.query.status) q = q.eq('status', request.query.status)
      if (request.query.location) q = q.eq('location', request.query.location)
      if (idResource) q = q.eq('resource_id', idResource)
      if (idCari) q = q.in('resource_id', idCari)

      // PostgREST membatasi respons di 1.000 baris — batas KERAS yang tak bisa
      // ditembus `.limit()`. Diambil bertahap per 1.000 supaya price book yang
      // berisi 2.957 entri benar-benar terbaca utuh.
      const HALAMAN = 1000
      const data: unknown[] = []
      for (let mulai = 0; mulai < limit; mulai += HALAMAN) {
        const akhir = Math.min(mulai + HALAMAN, limit) - 1
        const { data: bagian, error: errBagian } = await q.range(mulai, akhir)
        if (errBagian) return reply.status(500).send({ error: errBagian.message })
        data.push(...(bagian ?? []))
        if (!bagian || bagian.length < akhir - mulai + 1) break
      }

      // Total sesungguhnya untuk kriteria YANG SAMA — supaya UI bisa jujur
      // menyebut "200 dari 2.637", bukan mengesankan 200 itu seluruhnya.
      let h = request.db!
        .from('price_book_entries').select('id', { count: 'exact', head: true })
      if (request.query.status) h = h.eq('status', request.query.status)
      if (request.query.location) h = h.eq('location', request.query.location)
      if (idResource) h = h.eq('resource_id', idResource)
      if (idCari) h = h.in('resource_id', idCari)
      const { count } = await h

      return reply.send({ data, total: count ?? null, limit })
    })

  // ── POST /cecep/price-book — entry baru (selalu lahir DRAFT) ────────────────
  app.post<{ Body: { resource_code?: string; resource_id?: string; amount?: number
                     effective_date?: string; expired_date?: string | null
                     location?: string | null; supplier?: string | null
                     confidence_level?: 'high' | 'medium' | 'low' | null } }>(
    '/api/v1/cecep/price-book',
    { preHandler: [authenticate, requirePermission('cecep:price:manage')] },
    async (request, reply) => {
      const b = request.body ?? {}
      if (typeof b.amount !== 'number' || b.amount < 0) {
        return reply.status(400).send({ error: 'amount wajib angka >= 0' })
      }
      if (!b.effective_date) return reply.status(400).send({ error: 'effective_date wajib (harga = wilayah+tanggal)' })

      let resourceId = b.resource_id ?? null
      if (!resourceId && b.resource_code) {
        const { data: r } = await request.db!
          .from('resources').select('id').eq('code', b.resource_code).maybeSingle()
        if (!r) return reply.status(404).send({ error: `Resource ${b.resource_code} tidak ditemukan` })
        resourceId = r.id
      }
      if (!resourceId) return reply.status(400).send({ error: 'resource_id atau resource_code wajib' })

      // version_number = lanjutan tertinggi utk (resource, location) — jejak revisi harga
      const { data: prev } = await request.db!
        .from('price_book_entries').select('version_number')
        .eq('resource_id', resourceId)
        .order('version_number', { ascending: false }).limit(1)
      const version = ((prev?.[0]?.version_number as number | undefined) ?? 0) + 1

      const { data: row, error } = await request.db!
        .from('price_book_entries')
        .insert({
          resource_id: resourceId, amount: b.amount, effective_date: b.effective_date,
          expired_date: b.expired_date ?? null, location: b.location ?? null,
          supplier: b.supplier ?? null, confidence_level: b.confidence_level ?? null,
          version_number: version, status: 'draft', created_by: request.currentUser!.id,
        })
        .select('id, version_number').single()
      if (error) return reply.status(500).send({ error: error.message })

      void logAuditEvent(request, {
        tableName: 'price_book_entries', recordId: row.id, action: 'pricebook.created',
        actorId: request.currentUser!.id,
        newValues: { resource_id: resourceId, amount: b.amount, effective_date: b.effective_date,
                     location: b.location ?? null, version },
      })
      return reply.status(201).send({ id: row.id, version_number: row.version_number, status: 'draft' })
    })

  // ── PATCH /cecep/price-book/:id/status — transisi lifecycle (guard DB) ──────
  app.patch<{ Params: { id: string }; Body: { status?: 'verified' | 'active' | 'expired' } }>(
    '/api/v1/cecep/price-book/:id/status',
    { preHandler: [authenticate, requirePermission('cecep:price:manage')] },
    async (request, reply) => {
      const target = request.body?.status
      if (!target || !['verified', 'active', 'expired'].includes(target)) {
        return reply.status(400).send({ error: "status wajib 'verified' | 'active' | 'expired'" })
      }
      const { data: cur } = await request.db!
        .from('price_book_entries').select('id, status').eq('id', request.params.id).maybeSingle()
      if (!cur) return reply.status(404).send({ error: 'Entry tidak ditemukan' })

      const patch: Record<string, unknown> = { status: target, updated_by: request.currentUser!.id }
      if (target === 'verified') {
        patch.verified_by = request.currentUser!.id
        patch.verified_at = new Date().toISOString()
      }
      const { error } = await request.db!
        .from('price_book_entries').update(patch).eq('id', request.params.id)
      if (error) {
        // guard DB menolak transisi tak sah (mundur/lompat) → surface apa adanya
        const invalid = /tidak sah|check_violation|price_book/i.test(error.message)
        return reply.status(invalid ? 409 : 500).send({ error: error.message })
      }
      void logAuditEvent(request, {
        tableName: 'price_book_entries', recordId: request.params.id, action: `pricebook.${target}`,
        actorId: request.currentUser!.id, newValues: { from: cur.status, to: target },
      })
      return reply.send({ ok: true, status: target })
    })

  // ── GET /cecep/price-book/draft-triase ────────────────────────────────────
  //
  // ══════════════════════════════════════════════════════════════════════════
  // KENAPA ENDPOINT INI ADA
  // ══════════════════════════════════════════════════════════════════════════
  //
  // `RATIFIKASI.md` E10 mencatat "81 harga draft" sebagai perkara yang menunggu
  // founder, dengan alasan: mengaktifkannya berarti harga itu dipakai menawar
  // pekerjaan nyata.
  //
  // Alasannya benar. Angkanya yang menyesatkan.
  //
  // Diukur 2026-08-13 — dari 81 draft:
  //
  //     78  harganya IDENTIK dengan yang sudah aktif untuk resource yang sama
  //      2  belum punya harga aktif, tapi keduanya beton yang sama
  //         ("Beton Site Mix - K.250" / "-K.250"), harga sama persis
  //      1  BENAR-BENAR berbeda — dan itu satu-satunya yang menuntut putusan
  //
  // Delapan puluh satu baris yang tampak seperti delapan puluh satu keputusan
  // sebenarnya SATU. Yang membuatnya terasa berat bukan jumlah putusannya,
  // melainkan tak adanya cara melihat mana yang perlu diputuskan.
  //
  // ── Kenapa ia MENGGOLONGKAN, bukan menerapkan
  //
  // Pola yang sama dengan `GET /cost-map/saran`: harga yang diaktifkan mesin
  // diam-diam akan dipakai menawar pekerjaan, dan tebakan yang salah di sana
  // tak pernah terlihat sampai penawarannya kalah — atau menang dengan margin
  // negatif. Karena itu GET, permission `view`, nol tulisan.
  app.get(
    '/api/v1/cecep/price-book/draft-triase',
    { preHandler: [authenticate, requirePermission('cecep:price:view')] },
    async (request, reply) => {
      const db = request.db!

      const { data: draf, error: eDraf } = await db
        .from('price_book_entries')
        .select(`id, amount, effective_date, location, supplier, confidence_level,
                 resource:resources(id, code, name, category, unit_code)`)
        .eq('status', 'draft')
        .limit(5000)
      if (eDraf) return reply.status(500).send({ error: eDraf.message })

      type BarisDraf = {
        id: string
        amount: number | string
        effective_date: string | null
        location: string | null
        supplier: string | null
        confidence_level: string | null
        resource: {
          id: string; code: string; name: string
          category: string | null; unit_code: string | null
        } | null
      }
      const daftar = (draf ?? []) as unknown as BarisDraf[]

      if (daftar.length === 0) {
        return reply.send({
          total: 0, duplikat: [], baru: [], berbeda: [],
          ringkas: { duplikat: 0, baru: 0, berbeda: 0 },
        })
      }

      // Harga AKTIF untuk resource yang sama — pembanding yang menentukan
      // golongannya. Diambil SEKALI untuk seluruh draft, bukan per baris:
      // 81 permintaan berurutan menghabiskan waktu untuk jawaban yang sama.
      const idResource = [...new Set(
        daftar.map((d) => d.resource?.id).filter(Boolean),
      )] as string[]

      const { data: aktif, error: eAktif } = await db
        .from('price_book_entries')
        .select('resource_id, amount, effective_date')
        .eq('status', 'active')
        .in('resource_id', idResource)
      if (eAktif) return reply.status(500).send({ error: eAktif.message })

      // Bila satu resource punya beberapa harga aktif, yang TERBARU jadi
      // pembanding — itu yang dipakai `price-resolver.ts` saat menghitung.
      type BarisAktif = {
        resource_id: string; amount: number | string; effective_date: string | null
      }
      const petaAktif = new Map<string, { amount: number; effective_date: string | null }>()
      for (const a of (aktif ?? []) as unknown as BarisAktif[]) {
        const ada = petaAktif.get(a.resource_id)
        if (!ada || (a.effective_date ?? '') > (ada.effective_date ?? '')) {
          petaAktif.set(a.resource_id, {
            amount: Number(a.amount), effective_date: a.effective_date,
          })
        }
      }

      type Hasil = {
        id: string
        resource: BarisDraf['resource']
        draft_amount: number
        aktif_amount: number | null
        selisih_pct: number | null
        effective_date: string | null
        location: string | null
        supplier: string | null
        confidence_level: string | null
      }

      const duplikat: Hasil[] = []   // sama persis dengan yang sudah aktif
      const baru: Hasil[] = []       // resource-nya belum punya harga aktif
      const berbeda: Hasil[] = []    // ADA aktifnya, dan nilainya BEDA

      for (const d of daftar) {
        const rid = d.resource?.id
        const pembanding = rid ? petaAktif.get(rid) : undefined
        const nilai = Number(d.amount)

        const baris: Hasil = {
          id: d.id,
          resource: d.resource,
          draft_amount: nilai,
          // `null`, BUKAN nol: "tak ada pembanding" berbeda dari "pembandingnya
          // nol", dan UI harus bisa membedakan keduanya.
          aktif_amount: pembanding?.amount ?? null,
          // Selisih dihitung di server supaya UI tak mengulang rumus, dan
          // pembagi nol dijaga di satu tempat.
          selisih_pct: pembanding && pembanding.amount > 0
            ? Math.round(((nilai - pembanding.amount) / pembanding.amount) * 1000) / 10
            : null,
          effective_date: d.effective_date,
          location: d.location,
          supplier: d.supplier,
          confidence_level: d.confidence_level,
        }

        if (!pembanding) baru.push(baris)
        else if (pembanding.amount === nilai) duplikat.push(baris)
        else berbeda.push(baris)
      }

      // `berbeda` diurut selisih TERBESAR lebih dulu: itu yang paling mungkin
      // salah ketik, dan paling mahal kalau lolos.
      berbeda.sort((a, b) =>
        Math.abs(b.selisih_pct ?? 0) - Math.abs(a.selisih_pct ?? 0))

      return reply.send({
        total: daftar.length,
        duplikat, baru, berbeda,
        ringkas: {
          duplikat: duplikat.length,
          baru: baru.length,
          berbeda: berbeda.length,
        },
      })
    })

  // ── GET /cecep/price-book/usang ───────────────────────────────────────────
  //
  // ══════════════════════════════════════════════════════════════════════════
  // KENAPA ENDPOINT INI ADA
  // ══════════════════════════════════════════════════════════════════════════
  //
  // `RATIFIKASI.md` E9 mencatat "19 harga AHSP bentrok" menunggu founder.
  // Diukur ulang 2026-08-13, dan kesimpulannya keliru: 86 harga aktif memang
  // punya saudara bernilai beda, tetapi hampir seluruhnya pasangan
  // **lokasi × tanggal** yang memang dirancang berdampingan —
  //
  //     Mandor  Rp 176.000  (Kabupaten Bandung, 2019)
  //     Mandor  Rp 200.000  (umum,               2026)
  //
  // `price-resolver.ts:8-10` sudah menanganinya: lokasi persis menang atas
  // umum, `effective_date` hanya tie-break. Itu perilaku yang BENAR — harga
  // Bandung memang harus menang untuk proyek di Bandung.
  //
  // ── Yang justru perlu dilihat
  //
  // Justru karena lokasi menang, harga lokal yang USANG akan mengalahkan harga
  // umum yang baru. Diukur: **422 harga Kabupaten Bandung bertanggal 2019** —
  // tujuh tahun lalu — berdampingan dengan 2.370 harga umum 2026.
  //
  // Belum menggigit hari ini (`estimate_items.price_location` terisi 0 dari
  // seluruh baris, jadi jalur lokasi belum dipakai). Tapi ia akan menggigit
  // begitu lokasi mulai diisi, dan gejalanya berupa penawaran yang terlalu
  // murah — bukan galat.
  //
  // Endpoint ini menampakkannya SEBELUM itu terjadi. Ia tak mengubah apa pun:
  // memperbarui harga adalah keputusan tentang angka yang dipakai menawar.
  app.get<{ Querystring: { tahun?: string } }>(
    '/api/v1/cecep/price-book/usang',
    { preHandler: [authenticate, requirePermission('cecep:price:view')] },
    async (request, reply) => {
      // Ambang bawaan: harga yang berlaku sebelum tahun lalu. Bukan angka
      // ajaib — harga bahan bangunan bergerak tiap tahun, dan harga dua tahun
      // lalu sudah cukup meleset untuk mengubah menang-kalah tender.
      const tahunAmbang = Number(request.query.tahun)
        || new Date().getFullYear() - 1

      const { data, error } = await request.db!
        .from('price_book_entries')
        .select(`id, amount, effective_date, location, confidence_level,
                 resource:resources(id, code, name, category, unit_code)`)
        .eq('status', 'active')
        .lt('effective_date', `${tahunAmbang}-01-01`)
        .order('effective_date', { ascending: true })
        .limit(5000)
      if (error) return reply.status(500).send({ error: error.message })

      type Baris = {
        id: string; amount: number | string
        effective_date: string; location: string | null
        confidence_level: string | null
        resource: { id: string; code: string; name: string } | null
      }
      const daftar = (data ?? []) as unknown as Baris[]

      // Dikelompokkan per LOKASI, bukan per resource: yang menentukan apakah
      // harga usang terpakai adalah lokasinya — harga umum yang tua kalah oleh
      // harga umum yang baru, sedangkan harga LOKAL yang tua justru menang
      // atas harga umum yang baru.
      const perLokasi = new Map<string, { jumlah: number; terlama: string }>()
      for (const b of daftar) {
        const k = b.location ?? '(umum)'
        const ada = perLokasi.get(k)
        if (!ada) perLokasi.set(k, { jumlah: 1, terlama: b.effective_date })
        else {
          ada.jumlah++
          if (b.effective_date < ada.terlama) ada.terlama = b.effective_date
        }
      }

      return reply.send({
        ambang_tahun: tahunAmbang,
        total: daftar.length,
        per_lokasi: [...perLokasi.entries()]
          .map(([lokasi, v]) => ({
            lokasi,
            jumlah: v.jumlah,
            terlama: v.terlama,
            // Harga BERLOKASI yang usang lebih berbahaya daripada harga umum
            // yang usang: ia MENANG atas harga umum yang baru.
            menang_atas_umum: lokasi !== '(umum)',
          }))
          .sort((a, b) => b.jumlah - a.jumlah),
        data: daftar,
      })
    })
}

// ============================================================
// HARGA KHUSUS PER PROYEK (migrasi 140).
//
// Kebutuhan nyata: "cor lantai di acuan Rp 6,7 jt, tapi untuk proyek INI pakai
// Rp 5 jt — harga acuannya harus TETAP." Dan dalam periode berlaku yang sama,
// tiap proyek boleh memakai harga berbeda.
//
// Sumbu waktu (effective/expired) dan lokasi tidak bisa menjawab itu: keduanya
// berlaku lintas proyek. Karena itu override hidup di tabelnya sendiri dan
// dievaluasi LEBIH DULU dari price book — yang tak pernah tersentuh.
// ============================================================
export async function projectPriceOverrideRoutes(app: FastifyInstance) {

  // ── GET /projects/:projectId/price-overrides ───────────────────────────────
  app.get<{ Params: { projectId: string } }>(
    '/api/v1/projects/:projectId/price-overrides',
    { preHandler: [authenticate, requirePermission('cecep:price:view')] },
    async (request, reply) => {
      const { projectId } = request.params
      if (!(await request.db!.projectIds()).includes(projectId)) {
        return reply.status(404).send({ error: 'Proyek tidak ditemukan' })
      }

      const { data, error } = await request.db!
        .viaProject('project_price_override', projectId)
        .select(`id, resource_id, amount, currency, effective_date, expired_date,
                 reason, notes, created_at, resource:resources(code, name, unit_code, category)`)
        .order('created_at', { ascending: false })

      if (error) return reply.status(500).send({ error: error.message })
      return reply.send({ data: data ?? [] })
    })

  // ── POST /projects/:projectId/price-overrides ──────────────────────────────
  app.post<{ Params: { projectId: string } }>(
    '/api/v1/projects/:projectId/price-overrides',
    { preHandler: [authenticate, requirePermission('cecep:price:manage')] },
    async (request, reply) => {
      const { projectId } = request.params
      if (!(await request.db!.projectIds()).includes(projectId)) {
        return reply.status(404).send({ error: 'Proyek tidak ditemukan' })
      }

      const b = request.body as {
        resource_id?: string; amount?: number; reason?: string
        effective_date?: string | null; expired_date?: string | null; notes?: string
      }
      if (!b.resource_id) return reply.status(400).send({ error: 'resource_id wajib diisi' })
      if (typeof b.amount !== 'number' || b.amount < 0) {
        return reply.status(400).send({ error: 'amount wajib angka >= 0' })
      }
      // Alasan WAJIB — harga yang menyimpang dari acuan tanpa alasan tertulis
      // adalah persis yang ditanyakan belakangan dan tak terjawab.
      if (!b.reason?.trim()) {
        return reply.status(400).send({
          error: 'Alasan wajib diisi — menjelaskan kenapa proyek ini memakai harga berbeda',
        })
      }

      const { data, error } = await request.db!
        .viaProject('project_price_override', projectId)
        .insert({
          project_id: projectId,
          resource_id: b.resource_id,
          amount: b.amount,
          effective_date: b.effective_date ?? null,
          expired_date: b.expired_date ?? null,
          reason: b.reason.trim(),
          notes: b.notes?.trim() || null,
          created_by: request.currentUser!.id,
          updated_by: request.currentUser!.id,
        })
        .select('id, resource_id, amount, effective_date, expired_date, reason')
        .single()

      if (error) {
        if (/ppo_unik|duplicate/i.test(error.message)) {
          return reply.status(409).send({
            error: 'Sudah ada harga khusus untuk material ini pada tanggal berlaku yang sama',
          })
        }
        return reply.status(500).send({ error: error.message })
      }

      await logAuditEvent(request, {
        tableName: 'project_price_override',
        recordId: data.id,
        action: 'cecep.price_override_set',
        actorId: request.currentUser!.id,
        newValues: { resource_id: b.resource_id, amount: b.amount, project_id: projectId },
        reason: b.reason.trim(),
      })

      return reply.status(201).send({ data })
    })

  // ── DELETE /price-overrides/:id — kembali ke harga acuan ───────────────────
  app.delete<{ Params: { id: string } }>(
    '/api/v1/price-overrides/:id',
    { preHandler: [authenticate, requirePermission('cecep:price:manage')] },
    async (request, reply) => {
      const proyekTenant = await request.db!.projectIds()
      if (proyekTenant.length === 0) {
        return reply.status(404).send({ error: 'Harga khusus tidak ditemukan' })
      }

      // `.unsafe()`: dicari HANYA lewat id-nya, proyeknya belum diketahui, jadi
      // `.viaProject()` yang mensyaratkan project_id tak bisa dipakai.
      // Lingkupnya dijaga `.in('project_id', proyekTenant)`.
      const { data, error } = await request.db!
        .unsafe('project_price_override',
                'lookup by id; proyek belum diketahui — di-scope .in(project_id, proyekTenant)')
        .delete()
        .eq('id', request.params.id)
        .in('project_id', proyekTenant)
        .select('id, project_id, resource_id, amount')
        .maybeSingle()

      if (error) return reply.status(500).send({ error: error.message })
      if (!data) return reply.status(404).send({ error: 'Harga khusus tidak ditemukan' })

      await logAuditEvent(request, {
        tableName: 'project_price_override',
        recordId: data.id,
        action: 'cecep.price_override_removed',
        actorId: request.currentUser!.id,
        oldValues: { resource_id: data.resource_id, amount: data.amount },
        reason: 'Kembali memakai harga acuan',
      })

      return reply.send({ ok: true })
    })
}
