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

/**
 * KOSONG SEJAK 2026-08-22 — dan itu keputusan, bukan kelalaian.
 *
 * Sampai spec 2026-08-22 §5.5, ini berisi 8 jenis yang memberi makan 8 resep
 * jadwal n8n generasi lama (cron di n8n + rute ini + `X-API-Key` dipatok per
 * instance). Diukur produksi: 6/8 nol eksekusi seumur hidup, 2/8 tepat sekali
 * dan sudah lewat seminggu — bukan pola pemakaian aktif. Mekanisme itu lebih
 * tua dari jalur `jadwal_tugas` + `terbitkanPeristiwa` yang sudah jadi jalur
 * utama sebelum spec ini ditulis, dan kedelapan resepnya dipensiunkan
 * (`scripts/n8n/bangun-alur.mjs`'s `RESEP` dihapus di commit yang sama).
 *
 * Rute `GET /api/v1/otomasi/umpan/:jenis` TETAP HIDUP — dikosongkan, bukan
 * dihapus — sebagai infrastruktur dorman untuk `jenis` berikutnya yang
 * benar-benar butuh pola "n8n menarik data siap-kirim". Nilai apa pun yang
 * dikirim ke sini sekarang jatuh ke 404 lewat pengecekan di bawah.
 */
const JENIS_TERSEDIA = [] as const

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

/**
 * Semua 8 `case` yang dulu ada di sini (`invoice-terlambat`,
 * `persetujuan-tertahan`, `ncr-belum-ditutup`, `milestone-terlambat`,
 * `invoice-jatuh-tempo`, `milestone-mendekat`, `ringkasan-harian`,
 * `rekap-mingguan-proyek`) dipensiunkan bersama `JENIS_TERSEDIA` (lihat
 * komentar di atasnya). Helper tanggal (`HARI_MS`/`iso`/`umurHari`) dan
 * `BATAS` (batas baris per umpan) yang hanya dipakai kedelapan `case` itu
 * ikut dihapus — tak ada pemakai lain di berkas ini.
 *
 * Fungsi ini sendiri jadi TAK TERJANGKAU dari handler: `JENIS_TERSEDIA`
 * kosong membuat pengecekan di handler selalu menolak sebelum sampai ke
 * `bangunUmpan()`. Dipertahankan (bukan dihapus) sebagai kerangka siap-pakai
 * untuk `jenis` berikutnya — tanda tangannya (`jenis, companyId, idProyek`)
 * sudah benar untuk pola yang sama.
 */
async function bangunUmpan(
  jenis: string,
  companyId: string,
  idProyek: string[],
): Promise<Umpan> {
  const kosong: Umpan = { jenis, jml: 0, baris: [] }
  // `companyId`/`idProyek` sengaja tak dipakai selama switch hanya berisi
  // `default` — akan dipakai lagi begitu `case` pertama ditambahkan.
  void companyId
  void idProyek

  switch (jenis) {
    /* c8 ignore next 2 — jenis sudah disaring di handler sebelum sampai sini. */
    default:
      return kosong
  }
}

