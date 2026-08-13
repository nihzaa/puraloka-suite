import type { FastifyInstance } from 'fastify'
import { requireApiKey } from '../../plugins/api-key-auth.js'
import { supabase } from '../../utils/supabase.js'

/**
 * UMPAN UNTUK n8n — data siap-kirim, penerimanya sudah diputuskan di sini.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * KENAPA ADA: n8n TAK PUNYA PINTU MASUK SEBELUM INI
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Katalog `otomasi_alur` memuat 14 alur, 11 di antaranya perlu MEMBACA data
 * Puraloka (invoice lewat tenggat, persetujuan tertahan, NCR belum ditutup)
 * lalu mengantarkannya lewat WhatsApp. Mekanisme kuncinya sudah ada
 * (`requireApiKey`, tabel `api_key`), tetapi diukur 2026-08-13: **nol rute**
 * yang memakainya. Kunci bisa dibuat, dan tak ada satu pun pintu yang mau
 * menerimanya.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * KENAPA KEPUTUSAN TINGGAL DI SINI, BUKAN DI n8n
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Godaannya besar: biarkan n8n query sendiri, lebih fleksibel. Ditolak,
 * dengan alasan yang sudah tertulis di `06-agentic-ai-and-automation`:
 *
 *   "n8n sangat baik untuk glue logic tapi buruk untuk business logic
 *    kompleks dengan banyak edge case."
 *
 * Ambang eskalasi (H+7 ke manajer, H+14 ke direktur) adalah KEBIJAKAN.
 * Menyalinnya ke n8n berarti dua tempat memutuskan hal yang sama, dan yang
 * satu akan basi tanpa memberi tahu.
 *
 * Pembagiannya tegas:
 *   Puraloka  → APA isinya, SIAPA tingkat eskalasinya  (keputusan)
 *   n8n       → MENGANTARKAN                            (kirim, retry, jadwal)
 *
 * ══════════════════════════════════════════════════════════════════════════
 * KENAPA READ-ONLY, DAN KENAPA ITU BUKAN KETERBATASAN
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Rute di sini tak mengubah apa pun. Kunci yang bocor dari n8n karena itu tak
 * bisa menyetujui kasbon, membuat PO, atau menghapus proyek — ia hanya bisa
 * membaca daftar yang memang akan dikirimkan.
 *
 * n8n menyimpan kredensialnya di `database.sqlite` di mesin ini: lapisan
 * dengan permukaan serangan yang berbeda dari API kita. Memberinya kunci yang
 * bisa menulis berarti mempertaruhkan seluruh basis pada keamanan lapisan itu.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * TENANCY: LEWAT `projects.company_id`, DAN ITU DIUKUR — BUKAN DITEBAK
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Versi pertama berkas ini menyaring `.eq('company_id', …)` pada `invoices`,
 * `milestones`, dan `progress_logs`. Ketiganya **tak punya kolom itu** —
 * diperiksa lewat `information_schema` sebelum berkas ini didaftarkan.
 *
 * Kalau lolos, PostgREST menolak dengan galat kolom, dan umpannya jadi
 * daftar kosong permanen: alur n8n "berhasil" tiap hari tanpa mengirim apa
 * pun. Kelas cacat yang sama dengan yang sudah dua kali ditemukan di repo ini
 * (`.select()` kolom karangan → `?? []` → nol baris yang terlihat sah).
 *
 * Yang punya `company_id` LANGSUNG: `kasbons`.
 * Sisanya menempel ke tenant lewat `project_id` → `projects.company_id`.
 * Karena itu id proyek diresolusi DULU, lalu dipakai sebagai saringan.
 *
 * TAK ADA satu pun query di berkas ini yang berjalan tanpa saringan tenant.
 * Kelalaian di sini berarti tenant A menerima daftar tagihan tenant B lewat
 * WhatsApp — tanpa satu pun galat yang muncul.
 */

/** Batas baris per umpan. Pesan WhatsApp berisi 500 baris tak dibaca siapa pun. */
const BATAS = 50

const JENIS_TERSEDIA = [
  'invoice-terlambat',
  'persetujuan-tertahan',
  'ncr-belum-ditutup',
  'milestone-terlambat',
  'ringkasan-harian',
] as const

interface Umpan {
  jenis: string
  jml: number
  baris: Array<Record<string, unknown>>
}

export default async function otomasiUmpanRoutes(app: FastifyInstance) {

  /**
   * GET /api/v1/otomasi/umpan/:jenis
   *
   * SATU rute untuk seluruh jenis umpan, bukan satu rute per alur —
   * alternatifnya berarti tiap alur baru menuntut deploy API.
   */
  app.get<{ Params: { jenis: string } }>(
    '/api/v1/otomasi/umpan/:jenis',
    { preHandler: [requireApiKey('otomasi:umpan:baca')] },
    async (request, reply) => {
      const companyId = request.apiKey!.companyId
      const { jenis } = request.params

      if (!(JENIS_TERSEDIA as readonly string[]).includes(jenis)) {
        // Daftar ikut dikirim: alur n8n yang salah ketik menerima 404 yang
        // MENGAJARKAN, bukan 404 buntu yang memaksa orang menebak.
        return reply.status(404).send({
          error: `Jenis umpan '${jenis}' tidak dikenal`,
          tersedia: JENIS_TERSEDIA,
        })
      }

      const idProyek = await proyekTenant(companyId)
      // Nol proyek = umpan kosong yang SAH, bukan galat. Tenant baru belum
      // punya apa-apa, dan alur n8n-nya tetap harus bisa jalan tanpa merah.
      const hasil = await bangunUmpan(jenis, companyId, idProyek)
      return reply.send(hasil)
    })
}

/**
 * Id proyek milik tenant — saringan untuk tabel yang tak punya `company_id`.
 *
 * `is_deleted` ikut disaring: proyek yang sudah dihapus tak boleh memunculkan
 * tagihan atau milestone di WhatsApp siapa pun.
 */
async function proyekTenant(companyId: string): Promise<string[]> {
  const { data, error } = await supabase
    .from('projects')
    .select('id')
    .eq('company_id', companyId)
    .eq('is_deleted', false)
  if (error) throw new Error(`gagal membaca proyek tenant: ${error.message}`)
  return (data ?? []).map((r) => (r as { id: string }).id)
}

const HARI_MS = 86_400_000
const iso = (d: Date) => d.toISOString().split('T')[0]
const umurHari = (sejak: string, kini: Date) =>
  Math.floor((kini.getTime() - new Date(sejak).getTime()) / HARI_MS)

async function bangunUmpan(
  jenis: string,
  companyId: string,
  idProyek: string[],
): Promise<Umpan> {
  const kini = new Date()
  const kosong: Umpan = { jenis, jml: 0, baris: [] }

  switch (jenis) {
    /**
     * Invoice lewat jatuh tempo — untuk `eskalasi-invoice-terlambat`.
     *
     * Status 'sent' saja: 'paid' sudah lunas. Diukur — hanya dua nilai itu
     * yang benar-benar dipakai basis ini.
     *
     * `umur_hari` dihitung DI SINI. Kalau n8n yang menghitung, zona waktu
     * server dan n8n bisa berbeda, dan eskalasi meleset sehari tanpa ada
     * yang menyadarinya.
     */
    case 'invoice-terlambat': {
      if (idProyek.length === 0) return kosong
      const { data, error } = await supabase
        .from('invoices')
        .select('id, invoice_number, total_amount, amount_due, due_date, status, project:projects(name)')
        .in('project_id', idProyek)
        .eq('status', 'sent')
        .lt('due_date', iso(kini))
        .order('due_date', { ascending: true })
        .limit(BATAS)
      if (error) throw new Error(`umpan invoice-terlambat: ${error.message}`)

      const baris = (data ?? []).map((v) => {
        const r = v as Record<string, unknown>
        const umur = umurHari(r.due_date as string, kini)
        return {
          id: r.id,
          nomor: r.invoice_number,
          proyek: (r.project as { name?: string } | null)?.name ?? null,
          nominal: Number(r.total_amount ?? 0),
          sisa: Number(r.amount_due ?? 0),
          jatuh_tempo: r.due_date,
          umur_hari: umur,
          tingkat: umur >= 14 ? 'direktur' : umur >= 7 ? 'manajer' : 'pic',
        }
      })
      return { jenis, jml: baris.length, baris }
    }

    /**
     * Kasbon yang menunggu putusan >2 hari — untuk `ingatkan-persetujuan-tertahan`.
     *
     * Kasbon SAJA, sengaja. Material request dan change order punya bentuk
     * status berbeda, dan menebaknya berarti umpan yang diam-diam kosong.
     * Ditambahkan saat bentuknya sudah diukur — bukan sekarang, supaya tak
     * ada yang menyimpulkan "sudah lengkap" dari nama jenisnya.
     *
     * Ini satu-satunya tabel di berkas ini yang punya `company_id` langsung.
     */
    case 'persetujuan-tertahan': {
      const batas = new Date(kini.getTime() - 2 * HARI_MS).toISOString()
      const { data, error } = await supabase
        .from('kasbons')
        .select('id, amount, purpose, created_at, status, project:projects(name)')
        .eq('company_id', companyId)
        .eq('status', 'pending')
        .lt('created_at', batas)
        .order('created_at', { ascending: true })
        .limit(BATAS)
      if (error) throw new Error(`umpan persetujuan-tertahan: ${error.message}`)

      const baris = (data ?? []).map((v) => {
        const r = v as Record<string, unknown>
        return {
          id: r.id,
          entitas: 'kasbon',
          nominal: Number(r.amount ?? 0),
          keperluan: r.purpose ?? null,
          proyek: (r.project as { name?: string } | null)?.name ?? null,
          tertahan_hari: umurHari(r.created_at as string, kini),
        }
      })
      return { jenis, jml: baris.length, baris }
    }

    /**
     * NCR lewat tenggat penutupan — untuk `eskalasi-ncr-belum-ditutup`.
     *
     * Tabelnya `ncr_items` (bukan `ncrs` — tabel itu tak ada), tenggatnya
     * `target_selesai`, dan status "belum selesai" adalah tiga nilai:
     * terbuka/perbaikan/verifikasi. Semuanya diukur dari basis.
     */
    case 'ncr-belum-ditutup': {
      if (idProyek.length === 0) return kosong
      const { data, error } = await supabase
        .from('ncr_items')
        .select('id, nomor, judul, severity, target_selesai, status, project:projects(name)')
        .in('project_id', idProyek)
        .in('status', ['terbuka', 'perbaikan', 'verifikasi'])
        .not('target_selesai', 'is', null)
        .lt('target_selesai', iso(kini))
        .order('target_selesai', { ascending: true })
        .limit(BATAS)
      if (error) throw new Error(`umpan ncr-belum-ditutup: ${error.message}`)

      const baris = (data ?? []).map((v) => {
        const r = v as Record<string, unknown>
        const umur = umurHari(r.target_selesai as string, kini)
        return {
          id: r.id,
          nomor: r.nomor,
          judul: r.judul,
          keparahan: r.severity ?? null,
          proyek: (r.project as { name?: string } | null)?.name ?? null,
          lewat_hari: umur,
          tingkat: umur >= 7 ? 'direktur' : 'pm',
        }
      })
      return { jenis, jml: baris.length, baris }
    }

    /**
     * Milestone lewat tenggat & belum selesai — untuk `eskalasi-milestone-terlambat`.
     *
     * Tak ada kolom `progress` di `milestones` (diukur). Yang menyatakan
     * selesai adalah `status = 'completed'`, jadi itu yang dikecualikan.
     */
    case 'milestone-terlambat': {
      if (idProyek.length === 0) return kosong
      const { data, error } = await supabase
        .from('milestones')
        .select('id, title, target_date, status, project:projects(name)')
        .in('project_id', idProyek)
        .neq('status', 'completed')
        .lt('target_date', iso(kini))
        .order('target_date', { ascending: true })
        .limit(BATAS)
      if (error) throw new Error(`umpan milestone-terlambat: ${error.message}`)

      const baris = (data ?? []).map((v) => {
        const r = v as Record<string, unknown>
        const umur = umurHari(r.target_date as string, kini)
        return {
          id: r.id,
          judul: r.title,
          proyek: (r.project as { name?: string } | null)?.name ?? null,
          status: r.status,
          lewat_hari: umur,
          tingkat: umur >= 3 ? 'direktur' : 'pm',
        }
      })
      return { jenis, jml: baris.length, baris }
    }

    /**
     * Ringkasan sore pemilik — untuk `ringkasan-harian-pemilik`.
     *
     * Bentuknya BERBEDA dari yang lain: satu baris berisi hitungan, bukan
     * daftar. Pemilik tak butuh 50 baris progres; ia butuh satu kalimat.
     */
    case 'ringkasan-harian': {
      const awalHari = iso(kini)

      const hitungProyek = async (tabel: string, kolomTanggal: string) => {
        if (idProyek.length === 0) return 0
        const { count, error } = await supabase
          .from(tabel)
          .select('id', { count: 'exact', head: true })
          .in('project_id', idProyek)
          .gte(kolomTanggal, awalHari)
        if (error) throw new Error(`umpan ringkasan-harian (${tabel}): ${error.message}`)
        return count ?? 0
      }

      const { count: kasbonBaru, error: eKasbon } = await supabase
        .from('kasbons')
        .select('id', { count: 'exact', head: true })
        .eq('company_id', companyId)
        .gte('created_at', awalHari)
      if (eKasbon) throw new Error(`umpan ringkasan-harian (kasbons): ${eKasbon.message}`)

      const [laporanProgres, ncrBaru] = await Promise.all([
        hitungProyek('progress_logs', 'created_at'),
        hitungProyek('ncr_items', 'created_at'),
      ])

      return {
        jenis,
        jml: 1,
        baris: [{
          tanggal: awalHari,
          laporan_progres: laporanProgres,
          kasbon_diajukan: kasbonBaru ?? 0,
          temuan_mutu_baru: ncrBaru,
        }],
      }
    }

    /* c8 ignore next 2 — jenis sudah disaring di handler sebelum sampai sini. */
    default:
      return kosong
  }
}
