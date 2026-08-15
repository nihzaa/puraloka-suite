/**
 * POST /api/v1/asisten/sapa-proaktif — asisten MEMULAI percakapan.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * SATU-SATUNYA JALUR DI MANA ASISTEN BICARA DULUAN
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Sampai berkas ini ada, `jalankanGiliranAi` hanya dipanggil dua tempat —
 * `ai-chat.ts` dan `wa-webhook.ts` — dan KEDUANYA dipicu pesan masuk. Tak ada
 * satu pun jalur di mana asisten memulai.
 *
 * Yang bisa mengirim duluan hanyalah otomasi n8n, dan itu mengirim TEMPLATE
 * MATI: kalimat yang sama tiap kali, tanpa membaca apa pun. Founder minta
 * yang lain — asisten yang menyapa karena ia melihat sesuatu, dengan
 * kalimatnya sendiri.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * URUTAN GERBANG — DAN KENAPA URUTANNYA MENENTUKAN
 * ══════════════════════════════════════════════════════════════════════════
 *
 *   1. rahasia penjadwal        ← tanpa ini siapa pun bisa memicu blast
 *   2. pagar test               ← GRATIS; test tak boleh mengirim WA sungguhan
 *   3. `bolehKirim()`           ← GRATIS; jam tenang, opt-out, kuota, libur
 *   4. `jalankanGiliranAi()`    ← BERBAYAR
 *   5. `kirimWa()`              ← berkunci idempotensi
 *   6. tulis `notifications`    ← supaya dedup harian & kuota melihatnya
 *
 * Gerbang 3 SEBELUM 4 bukan optimasi: memanggil model untuk orang yang sedang
 * jam tenang berarti membayar token untuk kalimat yang takkan pernah dikirim.
 *
 * Langkah 6 bukan pelengkap — `bolehKirim` menghitung kuota DARI tabel itu.
 * Melewatkannya membuat kuota harian tak pernah berkurang, dan batas 3 pesan
 * jadi tak terhingga tanpa satu pun galat.
 */

import type { FastifyInstance, FastifyRequest } from 'fastify'
import { authenticate, requirePermission } from '../../plugins/auth.js'
import { createTenantDb } from '../../utils/tenant-db.js'
import { supabase } from '../../utils/supabase.js'
import { kirimWa, konfigurasiKanal } from '../../lib/wa-kirim.js'
import { ambilKredensialTanpaRequest } from '../../lib/kredensial.js'
import { jalankanGiliranAi, GAYA_WHATSAPP } from '../../lib/ai-jalankan.js'
import { bolehKirim, AWALAN_TIPE_PROAKTIF, type Kepentingan } from '../../lib/gerbang-kirim.js'
import { bacaRiwayat } from '../../lib/ai-riwayat-baca.js'
import { izinDariPeran } from '../../lib/izin-peran.js'

interface Sasaran {
  userId: string
  nomor: string
  peran: string
  companyId: string
}

export interface HasilSapa {
  userId: string
  status: 'terkirim' | 'ditahan' | 'gagal' | 'tanpa-isi'
  alasan?: string
}

/**
 * Pertanyaan yang diajukan KE ASISTEN — bukan kalimat yang dikirim.
 *
 * Bedanya penting: yang dikirim ke orang adalah JAWABAN model atas ini, jadi
 * kalimatnya berbeda tiap hari dan menyebut angka yang benar-benar ia baca.
 * Template mati justru yang membuat notifikasi berhenti dibaca.
 *
 * Ditulis sebagai permintaan RINGKAS karena kanalnya WhatsApp: model yang
 * diminta "laporan lengkap" akan menghasilkan dinding teks di layar telepon.
 */
const PERMINTAAN_TEMUAN = [
  'Periksa keadaan perusahaan hari ini: invoice lewat tempo, persetujuan yang',
  'menggantung, stok menipis, dan milestone yang meleset.',
  '',
  'Kalau ADA yang perlu diketahui, sebutkan yang paling penting saja — maksimal',
  'tiga hal, masing-masing satu kalimat, dengan angkanya.',
  '',
  'Kalau TIDAK ADA yang perlu disebut, jawab persis: TIDAK ADA TEMUAN',
].join('\n')

const PERMINTAAN_SAPAAN = [
  'Sapa singkat sebagai rekan kerja, tanpa melaporkan angka apa pun.',
  'Satu atau dua kalimat. Boleh menanyakan kabar pekerjaan.',
].join('\n')

/** Model menyatakan tak ada yang layak disebut. */
const PENANDA_KOSONG = 'TIDAK ADA TEMUAN'

export default async function sapaProaktifRoutes(app: FastifyInstance) {
  /*
   * GET, bukan POST — dan itu KONTRAK PENJADWAL, bukan selera.
   *
   * `jalankanTugas()` di `jadwal.ts` memanggil tiap tugas lewat
   * `server.inject({ method: 'GET', url: meta.jalur })` dengan token AKUN
   * LAYANAN, bukan `SCHEDULER_SECRET`. Rancangan pertama berkas ini memakai
   * POST + rahasia penjadwal, dan akibatnya: tugasnya terdaftar, terlihat
   * aktif di UI, dan TAK PERNAH menghasilkan apa pun — penjadwal memanggil
   * GET, rutenya cuma menerima POST.
   *
   * Ketahuan sebelum dinyalakan, saat membaca cara penjadwal benar-benar
   * memanggil. Tak ada galat yang akan menunjukkannya: `inject` GET ke rute
   * yang cuma POST membalas 404, dan 404 itu tenggelam di antara tugas lain
   * yang sehat.
   *
   * Gerbangnya jadi `authenticate` + `requirePermission` — sama persis dengan
   * `cek-tenggat` dan `bersih-percakapan-ai`. Penjadwal tunduk pada permission
   * dan batas tenant yang sama dengan manusia; kalau akun layanannya
   * kehilangan hak, tugasnya gagal 403 yang terbaca.
   *
   * Jalurnya ditulis LANGSUNG sesudah `app.get(` tanpa parameter tipe:
   * `audit-tugas-punya-rute.mjs` mencocokkannya secara harfiah.
   */
  app.get('/api/v1/asisten/sapa-proaktif', {
    preHandler: [authenticate, requirePermission('ai:chat')],
  }, async (request, reply) => {
      /*
       * ── PAGAR TEST ───────────────────────────────────────────────────────
       *
       * Ditegakkan `audit-saluran-keluar-berpagar.mjs` (ambang NOL), dan
       * alasannya bukan teori: 2026-08-14 test suite mengirim 28 WhatsApp
       * SUNGGUHAN ke nomor nyata karena satu jembatan tak berpagar.
       *
       * Diperiksa SEBELUM apa pun yang berbiaya — termasuk sebelum membaca
       * daftar nomor.
       */
      if (process.env.NODE_ENV === 'test') {
        return reply.send({ ok: true, dilewati: 'pagar-test', hasil: [] })
      }

      /*
       * Tenant dari SESI, bukan dari parameter.
       *
       * `x-company-id` sudah diresolusi `authenticate` jadi `request.companyId`
       * — memakai query parameter di sini berarti satu tenant bisa memicu
       * sapaan ke nomor tenant lain.
       */
      const companyId = request.companyId!

      /*
       * Sapaan tanpa temuan: dinyalakan lewat query, bawaan MATI.
       *
       * Bawaan mati karena jalur ini dipanggil penjadwal tiap hari — dan
       * asisten yang selalu mengirim sesuatu, walau tak ada apa-apa,
       * mengajari orang mengabaikannya.
       */
      const q = (request.query ?? {}) as { sapaan?: string; kepentingan?: string }
      const kepentingan: Kepentingan = q.kepentingan === 'mendesak' ? 'mendesak' : 'biasa'
      const sapaan = q.sapaan === '1' || q.sapaan === 'true'

      const sasaran = await ambilSasaran(request, companyId)
      const hasil: HasilSapa[] = []

      for (const s of sasaran) {
        hasil.push(await sapaSatu(request, s, kepentingan, sapaan))
      }

      return reply.send({
        ok: true,
        diperiksa: sasaran.length,
        terkirim: hasil.filter((h) => h.status === 'terkirim').length,
        hasil,
      })
    },
  )
}

/**
 * Siapa yang disapa: nomor WhatsApp yang TERVERIFIKASI dan AKTIF.
 *
 * Lintas-tenant lewat `supabase` karena penjadwal tak punya sesi — sama
 * dengan `wa-webhook`. Begitu `company_id` diketahui, seluruh akses
 * berikutnya lewat `TenantDb`.
 */
async function ambilSasaran(
  request: FastifyRequest,
  companyId: string,
): Promise<Sasaran[]> {
  let q = supabase
    .from('wa_nomor_pengguna')
    .select('user_id, nomor, company_id')
    .eq('aktif', true)
    .not('terverifikasi_pada', 'is', null)

  // WAJIB bertenant — bukan opsional. Tanpa ini satu tick akan menyapa
  // seluruh nomor di SEMUA tenant sekaligus.
  q = q.eq('company_id', companyId)

  const { data, error } = await q

  if (error) {
    request.log.error({ err: error }, 'sapa-proaktif: gagal membaca daftar nomor')
    return []
  }

  const baris = (data ?? []) as Array<{ user_id: string; nomor: string; company_id: string }>
  const keluar: Sasaran[] = []

  for (const b of baris) {
    // Peran dibaca BASIS, tak pernah diterima pemanggil — sama seperti
    // `bangunSesiDariNomor`. Anggota yang keluar dari perusahaan berhenti
    // disapa pada tick berikutnya, tanpa langkah tambahan.
    const { data: anggota } = await supabase
      .from('company_members')
      .select('roles:role_id ( name )')
      .eq('company_id', b.company_id)
      .eq('user_id', b.user_id)
      .maybeSingle()

    const peran = (anggota as { roles?: { name?: string } } | null)?.roles?.name
    if (!peran) continue

    keluar.push({ userId: b.user_id, nomor: b.nomor, peran, companyId: b.company_id })
  }

  return keluar
}

async function sapaSatu(
  request: FastifyRequest,
  s: Sasaran,
  kepentingan: Kepentingan,
  sapaan: boolean,
): Promise<HasilSapa> {
  const db = createTenantDb(s.companyId)
  const catatGalat = (p: string, err: unknown) =>
    request.log.error({ err, userId: s.userId }, `sapa-proaktif: ${p}`)

  // ── GERBANG 3 (gratis): jam tenang, opt-out, kuota, libur ────────────────
  const izinKirim = await bolehKirim({ db, userId: s.userId, kepentingan, sapaan, catatGalat })
  if (!izinKirim.boleh) {
    return { userId: s.userId, status: 'ditahan', alasan: izinKirim.alasan }
  }

  const izin = await izinDariPeran(supabase, s.peran)
  if (!izin.has('ai:chat')) {
    return { userId: s.userId, status: 'ditahan', alasan: 'tanpa_izin_chat' }
  }

  // Asisten `owner` untuk yang boleh mengatur AI, `staff` untuk sisanya —
  // aturan yang sama dengan `wa-webhook`, lewat PERMISSION bukan literal peran.
  const asisten = izin.has('settings:ai:manage') ? 'owner' : 'staff'

  // Percakapan proaktif berbagi riwayat dengan yang lain: sapaan yang
  // mengulang hal yang baru dibahas kemarin justru membuktikan asistennya
  // tak mengingat apa pun.
  const percakapan = await ambilAtauBuatPercakapanProaktif(db, s, asisten, catatGalat)
  const riwayat = percakapan
    ? await bacaRiwayat(db, percakapan, { catatGalat })
    : []

  // ── GERBANG 4: BERBAYAR ──────────────────────────────────────────────────
  const jalan = await jalankanGiliranAi({
    db,
    companyId: s.companyId,
    userId: s.userId,
    izinPengguna: izin,
    pesanUser: sapaan ? PERMINTAAN_SAPAAN : PERMINTAAN_TEMUAN,
    riwayat,
    gayaKanal: GAYA_WHATSAPP,
    asisten,
    ambilKunci: (nama) => ambilKredensialTanpaRequest(s.companyId, nama),
    catatGalat,
  })

  if (!jalan.ok) {
    return { userId: s.userId, status: 'gagal', alasan: jalan.alasan }
  }

  const teks = jalan.hasil.teks.trim()

  /*
   * Tak ada temuan → TIDAK MENGIRIM.
   *
   * Inilah bedanya dari template mati: asisten yang mengirim "tidak ada
   * masalah hari ini" tiap pagi mengajari orang mengabaikannya, dan
   * pengabaian itu ikut menular ke pesan yang benar-benar penting.
   *
   * Rondenya tetap ditagih — model sudah membaca data untuk sampai pada
   * kesimpulan itu. Yang dihemat perhatian orang, bukan token.
   */
  if (!teks || teks.toUpperCase().includes(PENANDA_KOSONG)) {
    return { userId: s.userId, status: 'tanpa-isi' }
  }

  const cfg = await konfigurasiKanal((k) => ambilKredensialTanpaRequest(s.companyId, k))

  // ── GERBANG 5: kirim, berkunci idempotensi ───────────────────────────────
  //
  // Kunci memuat TANGGAL + jenis: dua tick yang entah bagaimana lolos klaim
  // atomik tetap tak bisa mengirim dua kali di hari yang sama.
  const hariIni = new Date().toISOString().slice(0, 10)
  const jenis = sapaan ? 'sapaan' : 'temuan'

  const kirim = await kirimWa({
    db,
    companyId: s.companyId,
    nomor: s.nomor,
    teks,
    userId: s.userId,
    konfigurasi: cfg,
    kunciIdempotensi: `proaktif:${jenis}:${s.userId}:${hariIni}`,
  })

  if (!kirim.ok) {
    return { userId: s.userId, status: 'gagal', alasan: kirim.alasan }
  }
  if (kirim.dilewati) {
    return { userId: s.userId, status: 'ditahan', alasan: 'sudah_terkirim_hari_ini' }
  }

  /*
   * ── GERBANG 6: catat ke `notifications` ──────────────────────────────────
   *
   * BUKAN pelengkap. `bolehKirim` menghitung kuota harian DARI tabel ini —
   * melewatkannya membuat kuota tak pernah berkurang, dan batas 3 pesan jadi
   * tak terhingga tanpa satu pun galat.
   *
   * `type` berawalan `proaktif_` supaya penghitung itu menemukannya, dan
   * dedup harian (`audit-notifikasi-tak-kembar`) ikut menjaganya.
   */
  const { data: tercatat, error: errCatat } = await db.from('notifications').insert({
    company_id: s.companyId,
    user_id: s.userId,
    type: `${AWALAN_TIPE_PROAKTIF}${jenis}`,
    title: sapaan ? 'Sapaan asisten' : 'Kabar dari asisten',
    message: teks.slice(0, 500),
    channel: 'whatsapp',
    action_data: { record_id: `${jenis}:${hariIni}` },
  }).select('id').maybeSingle()

  /*
   * DUA hal diperiksa, bukan satu.
   *
   * `error` saja tak cukup: INSERT yang tak menghasilkan baris mengembalikan
   * `error: null` dengan `data: null`. Notifikasi yang tak tercatat berarti
   * kuota harian TIDAK berkurang — dan batas 3 pesan jadi tak terhingga,
   * tanpa satu pun galat.
   *
   * Pesannya SUDAH terkirim dan tak bisa ditarik. Yang bisa dilakukan hanya
   * membuat kegagalannya terlihat, bukan menelannya.
   */
  if (errCatat || !tercatat) {
    catatGalat(
      'pesan terkirim TAPI gagal dicatat — kuota harian tak berkurang',
      errCatat ?? new Error('insert notifications tak menghasilkan baris'),
    )
  }

  return { userId: s.userId, status: 'terkirim' }
}

/** Percakapan kanal `proaktif` yang berjalan, atau yang baru. */
async function ambilAtauBuatPercakapanProaktif(
  db: ReturnType<typeof createTenantDb>,
  s: Sasaran,
  asisten: string,
  catatGalat: (pesan: string, err: unknown) => void,
): Promise<string | null> {
  const { data: ada, error } = await db
    .from('ai_percakapan')
    .select('id')
    .eq('user_id', s.userId)
    .eq('kanal', 'proaktif')
    .order('dibuat_pada', { ascending: false })
    .limit(1)

  if (error) {
    catatGalat('gagal membaca percakapan proaktif', error)
    return null
  }

  const lama = ((ada ?? []) as Array<{ id: string }>)[0]
  if (lama) return lama.id

  const { data: baru, error: errBuat } = await db
    .from('ai_percakapan')
    .insert({
      company_id: s.companyId,
      user_id: s.userId,
      asisten,
      kanal: 'proaktif',
    })
    .select('id')
    .maybeSingle()

  if (errBuat || !baru) {
    catatGalat('gagal membuat percakapan proaktif', errBuat)
    return null
  }
  return (baru as { id: string }).id
}
