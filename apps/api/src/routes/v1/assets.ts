import type { FastifyInstance } from 'fastify'
import { authenticate, requirePermission } from '../../plugins/auth.js'
import { logAuditEvent } from '../../utils/audit.js'
import {
  jadwalSusut, bebanPeriode, nilaiBuku, hitungUtilisasi, biayaSewa,
  type AsetSusut, type MetodeSusut, type PeriodePakai,
} from '../../lib/aset.js'

/**
 * ASET & ALAT — register, mutasi antar-proyek, penyusutan, sewa (ROADMAP #23,
 * migrasi 149).
 *
 * ── Scope
 *
 * Semula "versi ringan sewa". Keputusan founder 2026-08-01
 * (`docs/KEPUTUSAN-SCOPE-ERP-AI.md`) membalik itu jadi aset PENUH — keempatnya
 * dibangun: register, mutasi, penyusutan, sewa.
 *
 * ── Kenapa permission BARU (`assets:*`), bukan menumpang yang ada
 *
 * Berbeda dari `bids` yang menumpang `projects:*`: aset menyangkut harta
 * perusahaan, bukan pekerjaan proyek. Orang yang boleh melihat proyek belum
 * tentu boleh menghapus molen dari register. Migrasi 149 men-seed-nya ke role
 * yang scope-nya SUDAH setara hari ini (pemegang `cash:manage`), jadi tak ada
 * perluasan akses — hanya representasinya yang jadi eksplisit (ADR-004 +
 * Engineering Default Rule #3).
 *
 * ── Yang SENGAJA tidak dilakukan
 *
 * Penyusutan TIDAK dihitung ulang saat dibaca. Ia dicatat sebagai baris log per
 * bulan (`asset_depreciation_logs`), dan pembacaan hanya menjumlahkan yang
 * tercatat. Alasannya sama dengan `hsp_snapshot`: menghitung ulang hari ini
 * memberi angka lain kalau metode/umur pernah diubah, dan angka yang berbeda
 * dari yang sudah masuk laporan bulan lalu lebih buruk daripada tak ada angka.
 */
/**
 * Bentuk baris yang dipulangkan `SELECT` di bawah.
 *
 * Ditulis eksplisit karena klien Supabase memulangkan union yang memuat
 * `GenericStringError`; tanpa penyempitan tipe, tiap akses kolom jadi error
 * kompilasi. Alternatifnya `as any` — yang menyembunyikan masalahnya sekaligus
 * menaikkan ratchet `any` yang hanya boleh turun.
 */
interface BarisAset {
  id: string
  asset_code: string
  name: string
  ownership: 'milik' | 'sewa'
  status: string
  purchase_price: number | null
  [k: string]: unknown
}

interface BarisMutasi {
  id: string
  moved_at: string
  to_project_id: string | null
  [k: string]: unknown
}

interface BarisSewaDb {
  id: string
  rate: number | null
  rate_unit: 'hari' | 'minggu' | 'bulan' | null
  start_date: string
  end_date: string | null
  status: string
  [k: string]: unknown
}

export default async function assetRoutes(app: FastifyInstance) {

  // ── GET /api/v1/assets ────────────────────────────────────────────────────
  app.get<{ Querystring: { status?: string; category?: string; ownership?: string; project_id?: string } }>(
    '/api/v1/assets',
    { preHandler: [authenticate, requirePermission('assets:view')] },
    async (request, reply) => {
      const { status, category, ownership, project_id } = request.query

      // `assets` kategori B — wrapper menyaring company otomatis.
      let q = request.db!
        .from('assets')
        .select('id, asset_code, name, category, ownership, brand, model, serial_number, ' +
                'purchase_date, purchase_price, residual_value, useful_life_months, ' +
                'depreciation_method, current_project_id, status, condition, photo_url, notes, created_at')
        .order('asset_code', { ascending: true })

      if (status) q = q.eq('status', status)
      if (category) q = q.eq('category', category)
      if (ownership) q = q.eq('ownership', ownership)
      if (project_id) q = q.eq('current_project_id', project_id)

      const { data, error } = await q
      if (error) {
        request.log.error({ err: error }, 'gagal memuat aset')
        return reply.status(500).send({ error: 'Gagal memuat register aset' })
      }

      // Tipe baris disebut EKSPLISIT. Supabase memulangkan union yang memuat
      // `GenericStringError`, jadi tanpa ini setiap akses kolom jadi error tipe
      // — dan `as any` akan menyembunyikannya sekaligus menaikkan ratchet `any`.
      const baris = (data ?? []) as unknown as BarisAset[]

      // Akumulasi penyusutan diambil dari LOG, bukan dihitung ulang.
      //
      // ⚠️ `asset_depreciation_logs` kategori C — mewarisi tenancy lewat
      // `asset_id`, jadi `db.from()` MENOLAKNYA. Penjaga itu benar: tanpa
      // saringan, akumulasi penyusutan ikut menghitung aset perusahaan lain,
      // dan angkanya tetap terlihat masuk akal.
      //
      // Saringannya diambil dari `baris` yang SUDAH tersaring tenant di atas
      // — tak perlu query tambahan, dan tak mungkin menyimpang dari daftar
      // aset yang sedang ditampilkan.
      //
      // Daftar kosong berarti tenant ini belum punya aset sama sekali;
      // `.in()` dengan array kosong menghasilkan nol baris, yang memang benar.
      // `db.unsafe()`, bukan `supabase` mentah: keduanya melewati scoping
      // otomatis, tapi yang ini MENUNTUT alasan tertulis dan mencatatnya —
      // jadi saat audit tenancy berikutnya, penyaringan manual di bawah bisa
      // ditemukan dan diperiksa, bukan tersamar sebagai query biasa.
      const idAset = baris.map((b) => b.id)
      const { data: logs, error: logsErr } = idAset.length
        ? await request.db!
            .unsafe(
              'asset_depreciation_logs',
              'kategori C lewat asset_id; disaring .in() dengan id aset yang SUDAH tersaring tenant di query sebelumnya',
            )
            .select('asset_id, depreciation_amount, book_value_after, period_year, period_month')
            .in('asset_id', idAset)
        : { data: [] as Array<Record<string, unknown>>, error: null }

      // Galat DIPERIKSA, bukan dijadikan nol baris. Akumulasi penyusutan
      // yang gagal dimuat membuat setiap aset tampil dengan nilai buku PENUH
      // — seolah belum pernah disusutkan sama sekali. Angka itu terlihat
      // masuk akal dan salah, kelas cacat yang sama dengan kurva-s.ts yang
      // kehilangan Rp 631,7 juta selama berbulan-bulan.
      if (logsErr) {
        request.log.error({ err: logsErr }, 'gagal memuat log penyusutan aset')
        return reply.status(500).send({ error: 'Gagal memuat akumulasi penyusutan.' })
      }

      const akum = new Map<string, { total: number; buku: number; periode: number }>()
      for (const l of logs as Array<Record<string, unknown>>) {
        const id = String(l.asset_id)
        const p = Number(l.period_year) * 12 + Number(l.period_month)
        const k = akum.get(id)
        const total = (k?.total ?? 0) + Number(l.depreciation_amount ?? 0)
        // Nilai buku diambil dari baris TERBARU, bukan dijumlahkan.
        const lebihBaru = !k || p > k.periode
        akum.set(id, {
          total,
          buku: lebihBaru ? Number(l.book_value_after ?? 0) : (k?.buku ?? 0),
          periode: lebihBaru ? p : (k?.periode ?? 0),
        })
      }

      const hasil = baris.map((a) => {
        const k = akum.get(String(a.id))
        return {
          ...a,
          akumulasi_penyusutan: k?.total ?? 0,
          // Belum pernah disusutkan → nilai buku = harga perolehan, bukan 0.
          nilai_buku: k?.buku ?? Number(a.purchase_price ?? 0),
          sudah_disusutkan: k != null,
        }
      })

      const milik = hasil.filter((a) => a.ownership === 'milik')
      return reply.send({
        data: hasil,
        meta: {
          total: hasil.length,
          milik: milik.length,
          sewa: hasil.length - milik.length,
          nilai_perolehan: milik.reduce((s, a) => s + Number(a.purchase_price ?? 0), 0),
          nilai_buku: milik.reduce((s, a) => s + Number(a.nilai_buku ?? 0), 0),
          dipakai: hasil.filter((a) => a.status === 'dipakai').length,
          perawatan: hasil.filter((a) => a.status === 'perawatan').length,
        },
      })
    },
  )

  // ── POST /api/v1/assets ───────────────────────────────────────────────────
  app.post(
    '/api/v1/assets',
    { preHandler: [authenticate, requirePermission('assets:manage')] },
    async (request, reply) => {
      const b = request.body as Record<string, unknown>
      const kode = String(b.asset_code ?? '').trim()
      const nama = String(b.name ?? '').trim()
      if (!kode) return reply.status(400).send({ error: 'Kode aset wajib diisi' })
      if (!nama) return reply.status(400).send({ error: 'Nama aset wajib diisi' })

      const harga = b.purchase_price == null ? null : Number(b.purchase_price)
      const residu = Number(b.residual_value ?? 0)
      // Dijaga di API DAN di DB. Kalau hanya di DB, pemakai dapat pesan
      // constraint mentah; kalau hanya di API, jalur lain bisa menembusnya.
      if (harga != null && residu > harga) {
        return reply.status(400).send({
          error: 'Nilai residu tak boleh melebihi harga perolehan — penyusutannya akan negatif',
        })
      }

      const { data, error } = await request.db!
        .from('assets')
        .insert({
          // `company_id` tak diisi manual — wrapper yang mengisinya.
          asset_code: kode,
          name: nama,
          category: b.category ?? 'lainnya',
          ownership: b.ownership ?? 'milik',
          brand: (b.brand as string)?.trim() || null,
          model: (b.model as string)?.trim() || null,
          serial_number: (b.serial_number as string)?.trim() || null,
          purchase_date: b.purchase_date ?? null,
          purchase_price: harga,
          residual_value: residu,
          useful_life_months: Number(b.useful_life_months ?? 60),
          depreciation_method: b.depreciation_method ?? 'garis_lurus',
          current_project_id: b.current_project_id ?? null,
          status: b.status ?? 'tersedia',
          condition: b.condition ?? 'baik',
          notes: (b.notes as string)?.trim() || null,
          created_by: request.currentUser!.id,
        })
        .select()
        .single()

      if (error) {
        if (error.code === '23505') {
          return reply.status(409).send({ error: `Kode aset "${kode}" sudah dipakai` })
        }
        request.log.error({ err: error }, 'gagal membuat aset')
        return reply.status(500).send({ error: 'Gagal menyimpan aset' })
      }

      void logAuditEvent(request, {
        tableName: 'assets', recordId: data.id, action: 'asset.create',
        actorId: request.currentUser!.id, newValues: data,
      })
      return reply.status(201).send({ data })
    },
  )

  // ── PATCH /api/v1/assets/:id ──────────────────────────────────────────────
  app.patch<{ Params: { id: string } }>(
    '/api/v1/assets/:id',
    { preHandler: [authenticate, requirePermission('assets:manage')] },
    async (request, reply) => {
      const b = request.body as Record<string, unknown>

      // Baca DULU lewat wrapper — ini yang menegakkan batas tenant. Tanpa
      // pembacaan ber-scope, UPDATE by-id bisa menyentuh aset perusahaan lain
      // (kelas cacat yang sama dengan scope-item, ditutup 2026-07-31).
      const { data: lama, error: eLama } = await request.db!
        .from('assets').select('*').eq('id', request.params.id).maybeSingle()
      if (eLama) return reply.status(500).send({ error: 'Gagal membaca aset' })
      if (!lama) return reply.status(404).send({ error: 'Aset tidak ditemukan' })

      const patch: Record<string, unknown> = { updated_at: new Date().toISOString() }
      for (const k of ['name', 'category', 'ownership', 'brand', 'model', 'serial_number',
        'purchase_date', 'purchase_price', 'residual_value', 'useful_life_months',
        'depreciation_method', 'current_project_id', 'status', 'condition', 'notes']) {
        if (k in b) patch[k] = b[k]
      }

      const harga = Number(patch.purchase_price ?? lama.purchase_price ?? 0)
      const residu = Number(patch.residual_value ?? lama.residual_value ?? 0)
      if (harga > 0 && residu > harga) {
        return reply.status(400).send({
          error: 'Nilai residu tak boleh melebihi harga perolehan',
        })
      }

      const { data, error } = await request.db!
        .from('assets').update(patch).eq('id', request.params.id).select().single()
      if (error) {
        request.log.error({ err: error }, 'gagal mengubah aset')
        return reply.status(500).send({ error: 'Gagal menyimpan perubahan' })
      }

      void logAuditEvent(request, {
        tableName: 'assets', recordId: data.id, action: 'asset.update',
        actorId: request.currentUser!.id, oldValues: lama, newValues: data,
      })
      return reply.send({ data })
    },
  )

  // ── POST /api/v1/assets/:id/movements — mutasi antar-proyek ───────────────
  app.post<{ Params: { id: string } }>(
    '/api/v1/assets/:id/movements',
    { preHandler: [authenticate, requirePermission('assets:manage')] },
    async (request, reply) => {
      const b = request.body as Record<string, unknown>

      const { data: aset } = await request.db!
        .from('assets').select('id, current_project_id, condition, status')
        .eq('id', request.params.id).maybeSingle()
      if (!aset) return reply.status(404).send({ error: 'Aset tidak ditemukan' })

      const tujuan = (b.to_project_id as string) ?? null
      const jenis = (b.movement_type as string) ?? (tujuan ? 'pindah' : 'kembali')

      // `asset_movements` kategori C — tenancy lewat induk. Wrapper tak bisa
      // menyaring otomatis, jadi kepemilikan sudah ditegakkan oleh pembacaan
      // `assets` di atas (yang ber-scope).
      const { data, error } = await request.db!
        .from('asset_movements')
        .insert({
          asset_id: request.params.id,
          from_project_id: aset.current_project_id ?? null,
          to_project_id: tujuan,
          movement_type: jenis,
          moved_by: request.currentUser!.id,
          condition_before: aset.condition ?? null,
          condition_after: b.condition_after ?? null,
          return_expected_at: b.return_expected_at ?? null,
          notes: (b.notes as string)?.trim() || null,
        })
        .select().single()

      if (error) {
        request.log.error({ err: error }, 'gagal mencatat mutasi aset')
        return reply.status(500).send({ error: 'Gagal mencatat mutasi' })
      }

      // Lokasi & status aset ikut berubah — kalau tidak, register menunjukkan
      // alat masih di gudang padahal sudah dikirim ke lapangan.
      const statusBaru = jenis === 'perawatan' ? 'perawatan'
        : jenis === 'pelepasan' ? 'dilepas'
        : tujuan ? 'dipakai' : 'tersedia'
      await request.db!
        .from('assets')
        .update({
          current_project_id: tujuan,
          status: statusBaru,
          condition: b.condition_after ?? aset.condition,
          updated_at: new Date().toISOString(),
        })
        .eq('id', request.params.id)

      void logAuditEvent(request, {
        tableName: 'asset_movements', recordId: data.id, action: 'asset.move',
        actorId: request.currentUser!.id, newValues: data,
      })
      return reply.status(201).send({ data })
    },
  )

  // ── GET /api/v1/assets/:id/movements ──────────────────────────────────────
  app.get<{ Params: { id: string } }>(
    '/api/v1/assets/:id/movements',
    { preHandler: [authenticate, requirePermission('assets:view')] },
    async (request, reply) => {
      const { data: aset } = await request.db!
        .from('assets').select('id, purchase_date').eq('id', request.params.id).maybeSingle()
      if (!aset) return reply.status(404).send({ error: 'Aset tidak ditemukan' })

      const { data, error } = await request.db!
        .from('asset_movements')
        .select('id, from_project_id, to_project_id, movement_type, moved_at, ' +
                'condition_before, condition_after, return_expected_at, returned_at, notes')
        .eq('asset_id', request.params.id)
        .order('moved_at', { ascending: false })
      if (error) return reply.status(500).send({ error: 'Gagal memuat riwayat mutasi' })

      const baris = (data ?? []) as unknown as BarisMutasi[]

      // Utilisasi diturunkan dari mutasi: tiap perpindahan KE proyek adalah
      // awal pemakaian, perpindahan berikutnya menutupnya.
      const urut = [...baris].sort(
        (a, b) => new Date(String(a.moved_at)).getTime() - new Date(String(b.moved_at)).getTime())
      const periode: PeriodePakai[] = []
      for (let i = 0; i < urut.length; i++) {
        if (!urut[i].to_project_id) continue
        periode.push({
          mulai: String(urut[i].moved_at),
          selesai: urut[i + 1] ? String(urut[i + 1].moved_at) : null,
        })
      }

      const kini = new Date()
      const setahunLalu = new Date(Date.UTC(kini.getUTCFullYear() - 1, kini.getUTCMonth(), kini.getUTCDate()))
      const utilisasi = hitungUtilisasi(
        periode,
        { dari: setahunLalu.toISOString(), sampai: kini.toISOString() },
        aset.purchase_date ? String(aset.purchase_date) : null,
      )

      return reply.send({ data: baris, meta: { utilisasi_12_bulan: utilisasi } })
    },
  )

  // ── GET /api/v1/assets/:id/depreciation ───────────────────────────────────
  app.get<{ Params: { id: string } }>(
    '/api/v1/assets/:id/depreciation',
    { preHandler: [authenticate, requirePermission('assets:view')] },
    async (request, reply) => {
      const { data: a } = await request.db!
        .from('assets')
        .select('id, name, ownership, purchase_price, residual_value, useful_life_months, ' +
                'depreciation_method, purchase_date')
        .eq('id', request.params.id).maybeSingle<BarisAset>()
      if (!a) return reply.status(404).send({ error: 'Aset tidak ditemukan' })

      const { data: logs } = await request.db!
        .from('asset_depreciation_logs')
        .select('id, period_year, period_month, depreciation_amount, book_value_after, ' +
                'depreciation_method, project_id, journal_entry_id')
        .eq('asset_id', request.params.id)
        .order('period_year', { ascending: true })
        .order('period_month', { ascending: true })

      // Aset SEWA tak disusutkan — ia bukan milik kita. Menyusutkannya berarti
      // membebankan penurunan nilai barang orang lain ke laporan kita.
      if (a.ownership !== 'milik') {
        return reply.send({
          data: { tercatat: logs ?? [], proyeksi: [] },
          meta: {
            dapat_disusutkan: false,
            alasan: 'Aset sewa tidak disusutkan — bukan milik perusahaan. ' +
                    'Biayanya tercatat sebagai biaya sewa, bukan penyusutan.',
          },
        })
      }
      if (!a.purchase_price || !a.purchase_date) {
        return reply.send({
          data: { tercatat: logs ?? [], proyeksi: [] },
          meta: {
            dapat_disusutkan: false,
            alasan: 'Harga perolehan atau tanggal perolehan belum diisi — ' +
                    'penyusutan tak bisa dihitung tanpa keduanya.',
          },
        })
      }

      const spec: AsetSusut = {
        hargaPerolehan: Number(a.purchase_price),
        nilaiResidu: Number(a.residual_value ?? 0),
        umurBulan: Number(a.useful_life_months ?? 60),
        metode: (a.depreciation_method ?? 'garis_lurus') as MetodeSusut,
        tanggalPerolehan: String(a.purchase_date),
      }
      const kini = new Date()
      return reply.send({
        data: { tercatat: logs ?? [], proyeksi: jadwalSusut(spec) },
        meta: {
          dapat_disusutkan: true,
          nilai_buku_kini: nilaiBuku(spec, kini.getUTCFullYear(), kini.getUTCMonth() + 1),
          beban_bulan_ini: bebanPeriode(spec, kini.getUTCFullYear(), kini.getUTCMonth() + 1),
          // Yang TERCATAT bisa berbeda dari proyeksi bila metode/umur pernah
          // diubah. Itu bukan bug — log adalah sejarah, proyeksi adalah rencana.
          catatan: 'Proyeksi memakai metode & umur yang BERLAKU SEKARANG. Baris ' +
                   'yang sudah tercatat membawa metodenya sendiri dan tidak ditulis ulang.',
        },
      })
    },
  )

  // ── POST /api/v1/assets/:id/depreciation — catat beban satu periode ───────
  app.post<{ Params: { id: string } }>(
    '/api/v1/assets/:id/depreciation',
    { preHandler: [authenticate, requirePermission('assets:manage')] },
    async (request, reply) => {
      const b = request.body as { period_year?: number; period_month?: number }
      const kini = new Date()
      const tahun = Number(b.period_year ?? kini.getUTCFullYear())
      const bulan = Number(b.period_month ?? kini.getUTCMonth() + 1)
      if (!(bulan >= 1 && bulan <= 12)) {
        return reply.status(400).send({ error: 'Bulan harus 1–12' })
      }

      const { data: a } = await request.db!
        .from('assets')
        .select('id, ownership, purchase_price, residual_value, useful_life_months, ' +
                'depreciation_method, purchase_date, current_project_id')
        .eq('id', request.params.id).maybeSingle<BarisAset>()
      if (!a) return reply.status(404).send({ error: 'Aset tidak ditemukan' })
      if (a.ownership !== 'milik') {
        return reply.status(422).send({ error: 'Aset sewa tidak disusutkan' })
      }
      if (!a.purchase_price || !a.purchase_date) {
        return reply.status(422).send({
          error: 'Harga & tanggal perolehan wajib terisi sebelum penyusutan dicatat',
        })
      }

      const spec: AsetSusut = {
        hargaPerolehan: Number(a.purchase_price),
        nilaiResidu: Number(a.residual_value ?? 0),
        umurBulan: Number(a.useful_life_months ?? 60),
        metode: (a.depreciation_method ?? 'garis_lurus') as MetodeSusut,
        tanggalPerolehan: String(a.purchase_date),
      }
      const beban = bebanPeriode(spec, tahun, bulan)
      if (beban <= 0) {
        return reply.status(422).send({
          error: `Tidak ada beban penyusutan untuk ${bulan}/${tahun} — ` +
                 'periode di luar masa manfaat aset ini',
        })
      }

      const { data, error } = await request.db!
        .from('asset_depreciation_logs')
        .insert({
          asset_id: request.params.id,
          project_id: a.current_project_id ?? null,
          period_year: tahun,
          period_month: bulan,
          depreciation_amount: beban,
          book_value_after: nilaiBuku(spec, tahun, bulan),
          depreciation_method: spec.metode,
        })
        .select().single()

      if (error) {
        // UNIQUE(asset_id, tahun, bulan) — inilah yang membuat penjadwal
        // bulanan aman dijalankan ulang tanpa menggandakan beban.
        if (error.code === '23505') {
          return reply.status(409).send({
            error: `Penyusutan ${bulan}/${tahun} sudah pernah dicatat untuk aset ini`,
          })
        }
        request.log.error({ err: error }, 'gagal mencatat penyusutan')
        return reply.status(500).send({ error: 'Gagal mencatat penyusutan' })
      }

      void logAuditEvent(request, {
        tableName: 'asset_depreciation_logs', recordId: data.id,
        action: 'asset.depreciate', actorId: request.currentUser!.id, newValues: data,
      })
      return reply.status(201).send({ data })
    },
  )

  // ── GET /api/v1/asset-rentals ─────────────────────────────────────────────
  app.get<{ Querystring: { status?: string; project_id?: string } }>(
    '/api/v1/asset-rentals',
    { preHandler: [authenticate, requirePermission('assets:view')] },
    async (request, reply) => {
      let q = request.db!
        .from('asset_rentals')
        .select('id, asset_id, item_name, supplier_id, project_id, rate, rate_unit, ' +
                'start_date, end_date, status, notes, created_at')
        .order('start_date', { ascending: false })
      if (request.query.status) q = q.eq('status', request.query.status)
      if (request.query.project_id) q = q.eq('project_id', request.query.project_id)

      const { data, error } = await q
      if (error) return reply.status(500).send({ error: 'Gagal memuat data sewa' })

      const hariIni = new Date().toISOString().slice(0, 10)
      const baris = ((data ?? []) as unknown as BarisSewaDb[]).map((r) => ({
        ...r,
        // Biaya sewa BERJALAN ikut dihitung sampai hari ini — supaya tak muncul
        // mendadak sebagai lonjakan saat sewanya diakhiri.
        biaya_sampai_kini: biayaSewa({
          tarif: Number(r.rate ?? 0),
          satuan: (r.rate_unit ?? 'hari') as 'hari' | 'minggu' | 'bulan',
          mulai: String(r.start_date),
          selesai: r.end_date ? String(r.end_date) : null,
        }, hariIni),
      }))

      return reply.send({
        data: baris,
        meta: {
          total: baris.length,
          berjalan: baris.filter((r) => r.status === 'berjalan').length,
          biaya_berjalan: baris.filter((r) => r.status === 'berjalan')
            .reduce((s, r) => s + r.biaya_sampai_kini, 0),
          biaya_total: baris.reduce((s, r) => s + r.biaya_sampai_kini, 0),
        },
      })
    },
  )

  // ── POST /api/v1/asset-rentals ────────────────────────────────────────────
  app.post(
    '/api/v1/asset-rentals',
    { preHandler: [authenticate, requirePermission('assets:manage')] },
    async (request, reply) => {
      const b = request.body as Record<string, unknown>
      const nama = String(b.item_name ?? '').trim()
      if (!nama) return reply.status(400).send({ error: 'Nama alat yang disewa wajib diisi' })
      if (!b.start_date) return reply.status(400).send({ error: 'Tanggal mulai sewa wajib diisi' })
      if (b.rate == null || Number(b.rate) < 0) {
        return reply.status(400).send({ error: 'Tarif sewa wajib diisi dan tak boleh negatif' })
      }

      const { data, error } = await request.db!
        .from('asset_rentals')
        .insert({
          asset_id: b.asset_id ?? null,
          item_name: nama,
          supplier_id: b.supplier_id ?? null,
          project_id: b.project_id ?? null,
          rate: Number(b.rate),
          rate_unit: b.rate_unit ?? 'hari',
          start_date: b.start_date,
          end_date: b.end_date ?? null,
          status: b.status ?? 'berjalan',
          notes: (b.notes as string)?.trim() || null,
          created_by: request.currentUser!.id,
        })
        .select().single()

      if (error) {
        request.log.error({ err: error }, 'gagal membuat sewa')
        return reply.status(500).send({ error: 'Gagal menyimpan data sewa' })
      }

      void logAuditEvent(request, {
        tableName: 'asset_rentals', recordId: data.id, action: 'rental.create',
        actorId: request.currentUser!.id, newValues: data,
      })
      return reply.status(201).send({ data })
    },
  )

  // ── PATCH /api/v1/asset-rentals/:id ───────────────────────────────────────
  app.patch<{ Params: { id: string } }>(
    '/api/v1/asset-rentals/:id',
    { preHandler: [authenticate, requirePermission('assets:manage')] },
    async (request, reply) => {
      const b = request.body as Record<string, unknown>

      const { data: lama } = await request.db!
        .from('asset_rentals').select('*').eq('id', request.params.id).maybeSingle()
      if (!lama) return reply.status(404).send({ error: 'Data sewa tidak ditemukan' })

      const patch: Record<string, unknown> = { updated_at: new Date().toISOString() }
      for (const k of ['item_name', 'supplier_id', 'project_id', 'rate', 'rate_unit',
        'start_date', 'end_date', 'status', 'notes']) {
        if (k in b) patch[k] = b[k]
      }

      const { data, error } = await request.db!
        .from('asset_rentals').update(patch).eq('id', request.params.id).select().single()
      if (error) return reply.status(500).send({ error: 'Gagal menyimpan perubahan sewa' })

      void logAuditEvent(request, {
        tableName: 'asset_rentals', recordId: data.id, action: 'rental.update',
        actorId: request.currentUser!.id, oldValues: lama, newValues: data,
      })
      return reply.send({ data })
    },
  )
}
