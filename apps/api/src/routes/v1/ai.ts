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
import { buatAdaptor, metaPenyedia } from '../../lib/ai-adaptor.js'


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
    const penyedia = gerbang.konfigurasi.penyedia
    const metaP = metaPenyedia(penyedia)

    // Kunci diambil sesuai penyedianya, bukan selalu `ANTHROPIC_API_KEY` —
    // tenant yang memilih penyedia lain memasang kuncinya di baris lain.
    const kunci = await ambilKredensial(request, metaP?.kunciKredensial ?? 'ANTHROPIC_API_KEY')
    const dibuat = buatAdaptor({
      penyedia,
      apiKey: kunci ?? '',
      baseUrl: (await ambilKredensial(request, 'AI_PROVIDER_BASE_URL')) ?? undefined,
    })

    if (!dibuat.ok) {
      // Bukan galat 500: kunci memang opsional, dan penyedia salah ketik adalah
      // salah konfigurasi, bukan sistem rusak. Web menampilkan kalimatnya sendiri.
      request.log.warn({ alasan: dibuat.alasan, penyedia }, 'ai/insight: adaptor tak bisa dibuat')
      return {
        sumber: 'deterministik' as const,
        alasan: dibuat.alasan === 'kunci_tak_ada' ? 'kunci_belum_dipasang' : dibuat.alasan,
        fakta,
        wawasan: null,
      }
    }

    // `chat()` TIDAK PERNAH melempar — tak ada try/catch di sini, dan itu
    // disengaja. Kegagalan datang sebagai `ok: false` dengan alasan yang bisa
    // dibedakan, jadi rute ini tak perlu mengurai teks galat penyedia.
    const jawab = await dibuat.adaptor.chat({
      model,
      maxToken: gerbang.konfigurasi.maxToken,
      sistem: PROMPT_SISTEM,
      pesan: [{ peran: 'user', isi: susunPrompt(fakta) }],
      skemaJawaban: SKEMA_JAWABAN,
    })

    if (!jawab.ok) {
      request.log.warn(
        { alasan: jawab.alasan, pesan: jawab.pesan, model, penyedia },
        'ai/insight: panggilan penyedia gagal',
      )
      return { sumber: 'deterministik' as const, alasan: jawab.alasan, fakta, wawasan: null }
    }

    // Biaya dicatat SEBELUM jawabannya dinilai layak atau tidak. Token yang
    // sudah terpakai tetap ditagih penyedia meski jawabannya tak terpakai —
    // mencatatnya hanya pada jalur sukses membuat batas bulanan menghitung
    // terlalu rendah, dan batas yang menghitung terlalu rendah tak pernah
    // tercapai.
    try {
      await catatBiayaRonde(db, request.companyId!, {
        asisten: 'insight',
        penyedia,
        model,
        pakai: jawab.pemakaian,
      })
    } catch (errCatat) {
      // Gagal mencatat TIDAK membatalkan jawaban yang sudah dibayar — tapi
      // juga tidak boleh hilang: batas bulanan bergantung padanya.
      request.log.error({ err: errCatat, model }, 'ai/insight: biaya gagal dicatat')
    }

    let wawasan: ReturnType<typeof periksaJawaban> = null
    try {
      wawasan = periksaJawaban(jawab.teks ? JSON.parse(jawab.teks) : null)
    } catch (errUrai) {
      // JSON rusak dari model. Dicatat, bukan ditelan — kalau sering, skemanya
      // atau promptnya yang salah, bukan penggunanya.
      request.log.warn({ err: errUrai, model }, 'ai/insight: jawaban bukan JSON sah')
    }

    if (!wawasan) {
      // Jawaban tak memenuhi syarat (kosong, kepanjangan, bentuk salah).
      request.log.warn({ model }, 'ai/insight: jawaban model tidak layak tampil')
      return { sumber: 'deterministik' as const, alasan: 'jawaban_tak_layak', fakta, wawasan: null }
    }

    return { sumber: 'ai' as const, model, fakta, wawasan }
  })
}
