/**
 * GET /api/v1/ai/insight — penjelasan kesehatan portofolio dari Claude.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * APA YANG DIKERJAKAN MODEL, DAN APA YANG TIDAK
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Referensi menaruh "AI Project Insights — 78/100 Project Success Probability"
 * di samping hero. Angka itu karangan. Yang dibangun di sini membagi tugasnya:
 *
 *   SKOR       dihitung deterministik (`apps/web/lib/kesehatan.ts`, 10 test).
 *              Model tak pernah menyentuhnya.
 *   PENJELASAN dari Claude — kalimat penilaian + satu rekomendasi tindakan.
 *
 * Pembagian itu ditegakkan di skema jawaban: `SKEMA_JAWABAN` hanya punya dua
 * field TEKS, jadi tak ada tempat bagi model menaruh angka. Aturan Emas §9
 * brief: jangan menampilkan data yang tidak ada.
 *
 * ── Kenapa gagal berarti 200, bukan 500
 *
 * Kartu ini pelengkap, bukan sumber kebenaran. Kunci belum dipasang, kuota
 * habis, jaringan putus, model menjawab ngawur — semuanya berakhir sama:
 * `sumber: 'deterministik'`, dan web menampilkan kalimat yang dihitung sendiri.
 * Kalau ini 500, satu panggilan pihak ketiga yang mati akan menampilkan pesan
 * galat di beranda, padahal SELURUH angka di halaman itu masih benar.
 *
 * Ini pengecualian sadar terhadap `audit-kegagalan-senyap.mjs`: galatnya TIDAK
 * ditelan — dicatat lewat `request.log.warn` dengan sebabnya, dan `sumber` di
 * muatan memberi tahu pemanggil bahwa AI tidak berjalan. Yang dilarang penjaga
 * itu adalah kegagalan yang hilang tanpa jejak, bukan kegagalan yang ditangani.
 *
 * ── Kenapa fakta dihitung di sini, bukan diterima dari web
 *
 * Kalau angkanya dikirim klien, siapa pun bisa mengarang "50 proyek lewat
 * tenggat" dan memancing model mengarang cerita di atasnya. Fakta dibaca ulang
 * dari DB dengan saringan tenant yang sama seperti `/dashboard/fokus`.
 */

import type { FastifyInstance, FastifyRequest } from 'fastify'
import Anthropic from '@anthropic-ai/sdk'
import { authenticate } from '../../plugins/auth.js'
import {
  PROMPT_SISTEM,
  SKEMA_JAWABAN,
  susunPrompt,
  periksaJawaban,
  type FaktaPortofolio,
} from '../../lib/wawasan-ai.js'
import { catatBiayaRonde, periksaGerbangAi } from '../../lib/ai-config.js'
import { ambilKredensial } from '../../lib/kredensial.js'

/**
 * Klien Anthropic untuk TENANT ini.
 *
 * ── Kenapa tidak satu klien global lagi (diubah 2026-08-10, TJS-B1)
 *
 * Sampai hari ini kuncinya dibaca langsung dari `ANTHROPIC_API_KEY`, dan
 * klien-nya dibuat sekali untuk seluruh proses. Itu benar untuk satu
 * perusahaan; salah untuk SaaS. Tiap tenant menanggung tagihannya sendiri, jadi
 * kuncinya pun harus miliknya sendiri — kalau tidak, pemakaian tenant A ditagih
 * ke kartu kredit tenant B, dan tak ada satu pun angka di sistem yang
 * menunjukkannya.
 *
 * Urutan jatuhannya ditangani `ambilKredensial()`: kredensial tenant lebih
 * dulu, lalu env server. Env dipertahankan supaya pemasangan satu-perusahaan
 * yang sudah jalan tidak mendadak kehilangan asistennya.
 *
 * Cache-nya per kunci, bukan global: dua tenant dengan kunci berbeda tak boleh
 * saling memakai klien yang sama. `ambilKredensial` sendiri sudah men-cache
 * pembacaan basisnya, jadi ini hanya menghindari pembuatan objek berulang.
 */
const klienPerKunci = new Map<string, Anthropic>()
async function ambilKlien(request: FastifyRequest): Promise<Anthropic | null> {
  const kunci = (await ambilKredensial(request, 'ANTHROPIC_API_KEY'))?.trim()
  if (!kunci) return null
  let k = klienPerKunci.get(kunci)
  if (!k) {
    k = new Anthropic({ apiKey: kunci })
    klienPerKunci.set(kunci, k)
  }
  return k
}

/**
 * Model dipatok di env supaya bisa diganti tanpa deploy ulang kode.
 *
 * ── Bawaannya HAIKU, bukan Opus — diubah 2026-08-09
 *
 * Founder: *"ai disini ada alternatif gak? soalnya lumayan makan biaya token
 * api nya"*. Diukur sebelum mengubah apa pun, dan sebagian besar biayanya
 * ternyata bukan dari kelas modelnya:
 *
 *   • DUA komponen memanggil endpoint ini (`kartu-kesehatan`, `rail-asisten`)
 *     dan keduanya tampil bersamaan di beranda → 2 panggilan tiap buka
 *   • nol cache → tiap muat ulang panggilan baru
 *
 * Keduanya dibereskan di sisi web (panggilan jadi manual lewat tombol).
 * Yang dibereskan DI SINI: kelas modelnya.
 *
 * Tugas model di endpoint ini sangat sempit — menulis DUA KALIMAT dari fakta
 * yang sudah dihitung deterministik, dengan skema jawaban yang hanya punya
 * dua field teks (`SKEMA_JAWABAN`). Tak ada penalaran panjang, tak ada
 * aritmetika, tak ada keputusan. Opus dipakai untuk pekerjaan yang tak
 * seperti itu.
 *
 * ── Modelnya kini dari BASIS per tenant, bukan env (TJS-B1, 2026-08-10)
 *
 * Env tetap dibaca sebagai jatuhan terakhir, tetapi sumber utamanya
 * `ai_provider_config` milik tenant. Alasannya bukan kerapian: dengan env,
 * mengganti model berarti SELURUH tenant ikut berganti sekaligus — mustahil
 * untuk SaaS tempat tiap pelanggan menanggung tagihannya sendiri.
 */
const MODEL_JATUHAN = process.env.ANTHROPIC_MODEL?.trim() || 'claude-haiku-4-5'

export default async function aiRoutes(app: FastifyInstance) {
  app.get('/api/v1/ai/insight', {
    preHandler: [authenticate],
    config: {
      // Panggilan berbayar ke pihak ketiga. Tanpa batas, satu tab yang
      // menyegarkan otomatis bisa menghabiskan kuota sebulan dalam semalam.
      rateLimit: { max: 20, timeWindow: '1 minute' },
    },
  }, async (request) => {
    const db = request.db!
    const hariIni = new Date().toISOString().split('T')[0]

    // Tabel kategori C (tenancy diwarisi lewat project) — pola sah yang sama
    // dengan `/dashboard/fokus`: ambil id milik company, saring dengan `.in()`,
    // dan catat alasannya. `db.from()` menolak kategori C di titik `from()`.
    const ALASAN = 'fakta portofolio lintas-proyek milik company; disaring lewat idProyek dari db.projectIds()'
    const idProyek = await db.projectIds()

    const [proyek, invoice, milestone] = await Promise.all([
      // `is_deleted` WAJIB disaring: proyek yang sudah dihapus lunak tetap
      // ada barisnya, dan tanpa saringan ini proyek lama yang tenggatnya
      // memang sudah lewat akan terus menekan skor selamanya.
      db.from('projects').select('progress_pct, end_date, status').eq('is_deleted', false),
      db.unsafe('invoices', ALASAN).select('due_date, amount_due, status')
        .neq('status', 'cancelled').gt('amount_due', 0)
        .in('project_id', idProyek),
      db.unsafe('milestones', ALASAN).select('target_date, completed_at')
        .in('project_id', idProyek),
    ])

    // Fakta yang salah lebih berbahaya daripada kartu yang hilang: model akan
    // menulis kalimat meyakinkan di atas angka yang keliru. Jadi gagal keras
    // di sini — beda dengan kegagalan panggilan AI di bawah, yang ditangani.
    //
    // Ditulis satu per satu, BUKAN sebagai loop atas `Object.entries()`.
    // Loop itu benar saat dijalankan tetapi tak terlihat oleh
    // `audit-kegagalan-senyap.mjs`, yang mencari `<variabel>.error` secara
    // harfiah — dan penjaga yang tak bisa melihat pemeriksaan sama saja
    // dengan pemeriksaan yang tak ada, bagi sesi berikutnya yang menyalin
    // pola ini. Tiga baris eksplisit lebih murah daripada penjaga yang buta.
    if (proyek.error) {
      request.log.error({ err: proyek.error }, 'ai/insight: query proyek gagal')
      throw new Error(`Gagal membaca proyek: ${proyek.error.message}`)
    }
    if (invoice.error) {
      request.log.error({ err: invoice.error }, 'ai/insight: query invoice gagal')
      throw new Error(`Gagal membaca invoice: ${invoice.error.message}`)
    }
    if (milestone.error) {
      request.log.error({ err: milestone.error }, 'ai/insight: query milestone gagal')
      throw new Error(`Gagal membaca milestone: ${milestone.error.message}`)
    }

    const barisProyek = (proyek.data ?? []) as Array<{
      progress_pct: number | null; end_date: string | null; status: string | null
    }>
    // Hanya proyek BERJALAN. Yang sudah selesai atau batal tak bisa "mandek".
    const aktif = barisProyek.filter((p) => p.status !== 'completed' && p.status !== 'cancelled')

    const angka = (n: unknown) => (typeof n === 'number' && Number.isFinite(n) ? n : 0)

    const fakta: FaktaPortofolio = {
      // Skor dihitung dengan bobot yang SAMA PERSIS dengan kartu di web
      // (`apps/web/lib/kesehatan.ts`). Kalau keduanya berbeda, kalimat model
      // akan menjelaskan skor yang tidak terlihat pemakai.
      skor: 0, // diisi di bawah, setelah pengurangnya diketahui
      proyekAktif: aktif.length,
      invoiceLewatTempo: ((invoice.data ?? []) as Array<{ due_date: string | null }>)
        .filter((i) => i.due_date && i.due_date < hariIni).length,
      milestoneTelat: ((milestone.data ?? []) as Array<{ target_date: string | null; completed_at: string | null }>)
        .filter((m) => !m.completed_at && m.target_date && m.target_date < hariIni).length,
      proyekMandek: aktif.filter((p) => angka(p.progress_pct) <= 0).length,
      proyekLewatTenggat: aktif.filter(
        (p) => p.end_date && p.end_date < hariIni && angka(p.progress_pct) < 100,
      ).length,
    }

    const BOBOT = { invoice: 3, milestone: 2, mandek: 6, lewatTenggat: 8 }
    fakta.skor = Math.max(0, Math.min(100, 100 - (
      fakta.invoiceLewatTempo * BOBOT.invoice +
      fakta.milestoneTelat * BOBOT.milestone +
      fakta.proyekMandek * BOBOT.mandek +
      fakta.proyekLewatTenggat * BOBOT.lewatTenggat
    )))

    const anthropic = await ambilKlien(request)
    if (!anthropic) {
      // Bukan galat: kunci memang opsional. Web menampilkan kalimatnya sendiri.
      return { sumber: 'deterministik' as const, alasan: 'kunci_belum_dipasang', fakta, wawasan: null }
    }

    // ── GERBANG: config + batas biaya, SEBELUM panggilan berbayar ──────────
    //
    // Urutannya menentukan. Memeriksa setelah panggilan berarti batasnya cuma
    // laporan kerusakan — uangnya sudah keluar saat barisnya muncul. Penjaga
    // `audit-gerbang-biaya-ai.mjs` menegakkan urutan ini, karena ia gampang
    // terbalik saat seseorang menyisipkan panggilan kedua di kemudian hari.
    const gerbang = await periksaGerbangAi(db, 'insight')
    if (!gerbang.boleh) {
      request.log.warn(
        { alasan: gerbang.alasan, terpakaiIdr: gerbang.terpakaiIdr },
        'ai/insight: panggilan dicegah gerbang biaya',
      )
      return { sumber: 'deterministik' as const, alasan: gerbang.alasan, fakta, wawasan: null }
    }

    const model = gerbang.konfigurasi.model || MODEL_JATUHAN
    const maxToken = gerbang.konfigurasi.maxToken

    try {
      const jawab = await anthropic.messages.create({
        model,
        max_tokens: maxToken,
        system: PROMPT_SISTEM,
        // Dua kalimat pendek dari fakta yang sudah jadi — tak ada yang perlu
        // dipikirkan panjang, dan efort tinggi hanya menambah biaya + latensi
        // pada kartu yang harus muncul cepat.
        output_config: { effort: 'low', format: { type: 'json_schema', schema: SKEMA_JAWABAN } },
        messages: [{ role: 'user', content: susunPrompt(fakta) }],
      })

      // Biaya dicatat SEBELUM jawabannya dinilai layak atau tidak. Token yang
      // sudah terpakai tetap ditagih penyedia meski jawabannya ditolak atau
      // tak terpakai — mencatatnya hanya pada jalur sukses membuat batas
      // bulanan menghitung terlalu rendah, dan batas yang menghitung terlalu
      // rendah tak pernah tercapai.
      try {
        await catatBiayaRonde(db, request.companyId!, {
          asisten: 'insight',
          penyedia: gerbang.konfigurasi.penyedia,
          model,
          pakai: {
            masuk: jawab.usage?.input_tokens ?? 0,
            keluar: jawab.usage?.output_tokens ?? 0,
            cacheTulis: jawab.usage?.cache_creation_input_tokens ?? 0,
            cacheBaca: jawab.usage?.cache_read_input_tokens ?? 0,
          },
        })
      } catch (errCatat) {
        // Gagal mencatat TIDAK membatalkan jawaban yang sudah dibayar — tapi
        // juga tidak boleh hilang: batas bulanan bergantung padanya.
        request.log.error({ err: errCatat, model }, 'ai/insight: biaya gagal dicatat')
      }

      // Model bisa MENOLAK menjawab (200 + stop_reason 'refusal'), dan saat itu
      // `content` kosong. Membaca content[0] tanpa memeriksa ini melempar
      // TypeError yang menyamar sebagai galat jaringan.
      if (jawab.stop_reason === 'refusal') {
        request.log.warn({ stop: jawab.stop_details }, 'ai/insight: model menolak menjawab')
        return { sumber: 'deterministik' as const, alasan: 'ditolak_model', fakta, wawasan: null }
      }

      const teks = jawab.content.find((b) => b.type === 'text')
      const wawasan = periksaJawaban(teks ? JSON.parse(teks.text) : null)

      if (!wawasan) {
        // Jawaban tak memenuhi syarat (kosong, kepanjangan, bentuk salah).
        // Dicatat supaya bisa ditinjau — kalau sering, promptnya yang salah.
        request.log.warn({ model }, 'ai/insight: jawaban model tidak layak tampil')
        return { sumber: 'deterministik' as const, alasan: 'jawaban_tak_layak', fakta, wawasan: null }
      }

      return { sumber: 'ai' as const, model, fakta, wawasan }
    } catch (err) {
      // Kuota habis, jaringan putus, JSON rusak — semuanya berakhir sama.
      // TIDAK ditelan: dicatat dengan sebabnya, dan `sumber` memberi tahu
      // pemanggil bahwa AI tidak berjalan.
      request.log.warn({ err, model }, 'ai/insight: panggilan Claude gagal')
      return { sumber: 'deterministik' as const, alasan: 'panggilan_gagal', fakta, wawasan: null }
    }
  })
}
