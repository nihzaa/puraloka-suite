/**
 * GUDANG — ikhtisar. Tempat barang KEMBALI, bukan tempat barang lewat.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * KENAPA BENTUKNYA BERBEDA DARI REFERENSI
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Referensi BuildAxis "Material Management" memodelkan alur MASUK: beli →
 * gudang → kirim ke proyek. KPI-nya reorder point, lead time, supplier
 * performance — semuanya pertanyaan pembelian.
 *
 * Puraloka arahnya terbalik. Founder 2026-08-09: *"sekarang belum ada gudang,
 * tapi nanti setelah proyek selesai, nantinya semua barang, alat-alat akan
 * disimpan lagi ke gudang."* Material dibeli langsung ke lokasi proyek;
 * gudang adalah tempat SISA dan ALAT pulang.
 *
 * Jadi pertanyaan yang dijawab endpoint ini bukan "kapan harus beli lagi"
 * melainkan:
 *
 *   • berapa alat menganggur, berapa sedang bekerja
 *   • alat mana yang pulang dalam kondisi memburuk
 *   • proyek mana yang SUDAH SELESAI tapi materialnya belum ditarik
 *   • berapa nilai aset yang dimiliki, sudah tersusut berapa
 *
 * Yang ketiga paling berharga dan tak ada di referensi: sisa material di
 * proyek yang sudah selesai adalah barang yang paling mudah hilang.
 *
 * ── Tenancy
 *
 * `gudang` kategori B (punya company_id). `gudang_stok` kategori C — disaring
 * lewat `gudang_id` milik company, bukan lewat project. `assets` kategori B.
 * `asset_movements` kategori C lewat asset.
 *
 * ── Uang tetap string
 *
 * Nominal dijumlahkan sebagai Number lalu dikirim `.toFixed(2)` — klien tak
 * pernah menerima float mentah (§5.4).
 */
import type { FastifyInstance } from 'fastify'
import { authenticate, requirePermission } from '../../plugins/auth.js'

const ALASAN =
  'ikhtisar gudang lintas-proyek milik company; asset_movements disaring lewat id aset milik company, gudang_stok lewat id gudang milik company'

const rp = (n: number): string => n.toFixed(2)

/** Hari sejak sebuah timestamp, dibulatkan ke bawah. */
function hariSejak(iso: unknown): number | null {
  if (!iso) return null
  const t = Date.parse(String(iso))
  if (!Number.isFinite(t)) return null
  return Math.floor((Date.now() - t) / 86_400_000)
}

export default async function gudangIkhtisarRoutes(app: FastifyInstance) {
  /**
   * GET /api/v1/gudang/ikhtisar
   */
  app.get('/api/v1/gudang/ikhtisar', {
    // `gudang:view` — di-seed migrasi 238, diberikan ke role yang sudah punya
    // `assets:view`/`assets:manage`. Diperiksa ke DB, bukan ditebak.
    preHandler: [authenticate, requirePermission('gudang:view')],
  }, async (request, reply) => {
    const db = request.db!

    const [gudang, aset, proyek, stokGudang] = await Promise.all([
      db.from('gudang').select('id, kode, nama, alamat, aktif').eq('aktif', true),
      db.from('assets')
        .select('id, asset_code, name, category, status, condition, gudang_id, current_project_id, purchase_price, residual_value, useful_life_months, purchase_date'),
      db.from('projects')
        .select('id, name, status, actual_end_date, end_date')
        .eq('is_deleted', false),
      // Kategori C — tenancy lewat gudang. Disaring di bawah terhadap id
      // gudang milik company; `.select()` saja akan menarik seluruh tenant.
      db.unsafe('gudang_stok', ALASAN)
        .select('id, gudang_id, material_id, qty, asal_project_id, last_updated_at'),
    ])

    if (gudang.error) throw gudang.error
    if (aset.error) throw aset.error
    if (proyek.error) throw proyek.error
    if (stokGudang.error) throw stokGudang.error

    const barisGudang = (gudang.data ?? []) as Array<Record<string, unknown>>
    const barisAset = (aset.data ?? []) as Array<Record<string, unknown>>
    const barisProyek = (proyek.data ?? []) as Array<Record<string, unknown>>

    const idGudang = new Set(barisGudang.map((g) => String(g.id)))
    /*
      SARINGAN TENANT SEBENARNYA ada di baris ini.

      `gudang_stok` tak punya company_id, dan `db.unsafe()` tak menyaring
      apa pun sendiri. Tanpa filter ini, stok gudang perusahaan LAIN ikut
      terhitung — dan angkanya tetap terlihat wajar. Jangan hapus sebagai
      "optimasi".
    */
    const barisStok = ((stokGudang.data ?? []) as Array<Record<string, unknown>>)
      .filter((s) => idGudang.has(String(s.gudang_id)))

    // Pergerakan disaring lewat aset milik company — `asset_movements` juga
    // kategori C dan tak punya company_id.
    const idAset = barisAset.map((a) => String(a.id))
    let barisGerak: Array<Record<string, unknown>> = []
    if (idAset.length > 0) {
      const gerak = await db.unsafe('asset_movements', ALASAN)
        .select('id, asset_id, from_project_id, to_project_id, from_gudang_id, to_gudang_id, movement_type, moved_at, returned_at, condition_before, condition_after, notes')
        .in('asset_id', idAset)
        .order('moved_at', { ascending: false })
        .limit(60)
      if (gerak.error) throw gerak.error
      barisGerak = (gerak.data ?? []) as Array<Record<string, unknown>>
    }

    const namaProyek = new Map(barisProyek.map((p) => [String(p.id), String(p.name)]))
    const namaGudang = new Map(barisGudang.map((g) => [String(g.id), String(g.nama)]))

    const diGudang = barisAset.filter((a) => a.gudang_id !== null && a.gudang_id !== undefined)
    const diLapangan = barisAset.filter((a) => a.current_project_id !== null && a.current_project_id !== undefined)
    const perluPerhatian = barisAset.filter(
      (a) => a.status === 'perawatan' || a.status === 'rusak' || a.condition === 'buruk')

    // ── Nilai inventori & penyusutan ─────────────────────────────────────
    //
    // Garis lurus: (harga − residu) / umur_bulan × bulan_berjalan, dijepit
    // supaya tak melebihi nilai yang bisa disusutkan. Aset lama yang sudah
    // habis umurnya TIDAK boleh menghasilkan nilai buku negatif.
    let hargaPerolehan = 0
    let akumulasiSusut = 0
    for (const a of barisAset) {
      const harga = Number(a.purchase_price) || 0
      const residu = Number(a.residual_value) || 0
      const umur = Number(a.useful_life_months) || 0
      hargaPerolehan += harga
      if (harga <= 0 || umur <= 0 || !a.purchase_date) continue
      const bulan = Math.max(0, Math.floor(
        (Date.now() - Date.parse(String(a.purchase_date))) / (30.44 * 86_400_000)))
      const dapatSusut = Math.max(0, harga - residu)
      akumulasiSusut += Math.min(dapatSusut, (dapatSusut / umur) * bulan)
    }

    const hitung = (baris: Array<Record<string, unknown>>, kolom: string) => {
      const m = new Map<string, number>()
      for (const b of baris) {
        const k = String(b[kolom] ?? 'lainnya')
        m.set(k, (m.get(k) ?? 0) + 1)
      }
      return [...m.entries()].map(([nama, jml]) => ({ nama, jml })).sort((a, b) => b.jml - a.jml)
    }

    /*
      ── SISA MATERIAL DI PROYEK YANG SUDAH SELESAI ──────────────────────

      Bagian yang paling menjawab kekhawatiran founder, dan tak ada di
      referensi: proyek berstatus `completed` yang stoknya masih > 0 berarti
      material tertinggal di lokasi tanpa penanggung jawab.

      Dihitung dari `project_stocks` (kategori C, disaring lewat project milik
      company) — bukan dari `gudang_stok`, karena justru yang BELUM sampai
      gudang yang jadi masalahnya.
    */
    const idProyekSelesai = barisProyek
      .filter((p) => p.status === 'completed')
      .map((p) => String(p.id))

    let belumDitarik: Array<{ proyek: string; jenis: number; qty: string }> = []
    if (idProyekSelesai.length > 0) {
      const sisa = await db.unsafe('project_stocks', ALASAN)
        .select('project_id, qty_on_hand')
        .in('project_id', idProyekSelesai)
        .gt('qty_on_hand', 0)
      if (sisa.error) throw sisa.error

      const per = new Map<string, { jenis: number; qty: number }>()
      for (const s of (sisa.data ?? []) as Array<Record<string, unknown>>) {
        const k = String(s.project_id)
        const v = per.get(k) ?? { jenis: 0, qty: 0 }
        v.jenis += 1
        v.qty += Number(s.qty_on_hand) || 0
        per.set(k, v)
      }
      belumDitarik = [...per.entries()]
        .map(([id, v]) => ({
          proyek: namaProyek.get(id) ?? '—',
          jenis: v.jenis,
          qty: String(Math.round(v.qty * 100) / 100),
        }))
        .sort((a, b) => b.jenis - a.jenis)
    }

    return reply.send({
      kpi: {
        total_aset: barisAset.length,
        di_gudang: diGudang.length,
        di_lapangan: diLapangan.length,
        perlu_perhatian: perluPerhatian.length,
        jenis_material_gudang: barisStok.length,
        proyek_belum_ditarik: belumDitarik.length,
        nilai_perolehan: rp(hargaPerolehan),
        nilai_buku: rp(Math.max(0, hargaPerolehan - akumulasiSusut)),
        akumulasi_susut: rp(akumulasiSusut),
      },

      gudang: barisGudang.map((g) => ({
        id: String(g.id), kode: String(g.kode), nama: String(g.nama),
        alamat: g.alamat ?? null,
        jumlah_aset: diGudang.filter((a) => String(a.gudang_id) === String(g.id)).length,
        jenis_material: barisStok.filter((s) => String(s.gudang_id) === String(g.id)).length,
      })),

      aset_per_kategori: hitung(barisAset, 'category'),
      aset_per_kondisi: hitung(barisAset, 'condition'),

      // Aset di gudang, paling perlu perhatian di atas.
      isi_gudang: diGudang
        .sort((a, b) => {
          const bobot: Record<string, number> = { buruk: 0, cukup: 1, baik: 2 }
          return (bobot[String(a.condition)] ?? 9) - (bobot[String(b.condition)] ?? 9)
        })
        .slice(0, 10)
        .map((a) => ({
          id: String(a.id), kode: String(a.asset_code), nama: String(a.name),
          kategori: String(a.category), kondisi: String(a.condition),
          status: String(a.status),
          gudang: namaGudang.get(String(a.gudang_id)) ?? null,
        })),

      pergerakan: barisGerak.slice(0, 12).map((m) => ({
        id: String(m.id),
        jenis: String(m.movement_type),
        tanggal: m.moved_at ? String(m.moved_at).slice(0, 10) : null,
        hari_lalu: hariSejak(m.moved_at),
        dari: m.from_gudang_id
          ? (namaGudang.get(String(m.from_gudang_id)) ?? 'Gudang')
          : (namaProyek.get(String(m.from_project_id)) ?? null),
        ke: m.to_gudang_id
          ? (namaGudang.get(String(m.to_gudang_id)) ?? 'Gudang')
          : (namaProyek.get(String(m.to_project_id)) ?? null),
        kondisi_sebelum: m.condition_before ?? null,
        kondisi_sesudah: m.condition_after ?? null,
        /*
          Penanda kondisi MEMBURUK — dihitung di server, bukan di UI.

          Kalau UI yang membandingkan, urutan tingkat kondisi ('baik' > 'cukup'
          > 'buruk') akan ditulis ulang di setiap tempat yang menampilkannya,
          dan satu tempat yang salah urutan akan menandai alat sehat sebagai
          rusak.
        */
        memburuk: Boolean(
          m.condition_before && m.condition_after &&
          ({ baik: 2, cukup: 1, buruk: 0 } as Record<string, number>)[String(m.condition_after)] <
          ({ baik: 2, cukup: 1, buruk: 0 } as Record<string, number>)[String(m.condition_before)]),
      })),

      material_gudang: barisStok
        .sort((a, b) => (Number(b.qty) || 0) - (Number(a.qty) || 0))
        .slice(0, 10)
        .map((s) => ({
          id: String(s.id),
          material_id: String(s.material_id),
          qty: String(Number(s.qty) || 0),
          asal: s.asal_project_id ? (namaProyek.get(String(s.asal_project_id)) ?? null) : null,
        })),

      belum_ditarik: belumDitarik,
    })
  })
}
