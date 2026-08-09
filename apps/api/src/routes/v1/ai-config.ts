/**
 * KONFIGURASI PENYEDIA AI — dari UI, per tenant.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * KENAPA RUTE INI ADA
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Founder 2026-08-09: *"termasuk konfigurasi api nya juga yg dikonfig dari ui
 * semua"*. Sebelum ini, model dipaku di `ANTHROPIC_MODEL` — mengganti model
 * berarti menyunting berkas server dan me-restart, dan SELURUH tenant ikut
 * berganti sekaligus. Mustahil untuk SaaS.
 *
 * ── Yang TIDAK ada di sini: API key
 *
 * Kuncinya hidup di `app_credentials` terenkripsi (TJS-A1), dan nilainya tak
 * pernah keluar dari sana. Tabel config ini dibaca banyak tempat dan gampang
 * ikut ter-log; menaruh kunci di dalamnya berarti kunci muncul di log
 * pertama kali seseorang men-debug halaman pengaturan.
 *
 * ── GET mengembalikan biaya, bukan hanya niat
 *
 * Halaman pengaturan yang hanya menampilkan "model: Haiku" tak menjawab
 * pertanyaan yang sebenarnya dibawa admin ke sana: *berapa ini menghabiskan
 * uang saya?* Jadi pemakaian bulan berjalan ikut dikirim, dari sumber yang
 * sama dengan yang menegakkan batas — bukan dari penghitung terpisah.
 */

import type { FastifyInstance, FastifyRequest } from 'fastify'
import { authenticate, requirePermission } from '../../plugins/auth.js'
import { logAuditEvent } from '../../utils/audit.js'
import {
  ASISTEN,
  MODE_BATAS,
  awalBulan,
  bentukKonfigurasi,
  daftarModel,
  konfigurasiBawaan,
  pemakaianBulanIni,
  perkiraanPerPanggilan,
  type Asisten,
  type ModeBatas,
} from '../../lib/ai-config.js'
import { kursUsdIdr } from '../../lib/ai-harga.js'

const MAKS_TOKEN_TERTINGGI = 64_000

interface BadanSimpan {
  penyedia?: string
  model?: string | null
  max_token?: number
  aktif?: boolean
  batas_bulanan_idr?: number | null
  mode_batas?: string
}

function asistenSah(nilai: string): nilai is Asisten {
  return (ASISTEN as readonly string[]).includes(nilai)
}

/**
 * Rincian pemakaian per asisten & model, bulan berjalan.
 *
 * Dikelompokkan di aplikasi, bukan lewat agregat PostgREST: `numeric` datang
 * sebagai string, dan `SUM` lewat PostgREST tanpa tipe eksplisit gampang
 * mengembalikan hasil yang benar hari ini lalu berubah saat presisinya naik.
 */
async function rincianPemakaian(request: FastifyRequest, sekarang: Date) {
  const { data, error } = await request.db!
    .from('ai_biaya_token')
    .select('asisten, model, biaya_idr, biaya_usd, token_masuk, token_keluar')
    .gte('dibuat_pada', awalBulan(sekarang))

  if (error) {
    request.log.error({ err: error }, 'ai-config: gagal membaca rincian pemakaian')
    throw new Error(`Gagal membaca pemakaian AI: ${error.message}`)
  }

  const per = new Map<string, { asisten: string; model: string; panggilan: number; idr: number; token: number }>()
  for (const b of (data ?? []) as Array<Record<string, string | number>>) {
    const kunci = `${b.asisten}|${b.model}`
    const kini = per.get(kunci) ?? { asisten: String(b.asisten), model: String(b.model), panggilan: 0, idr: 0, token: 0 }
    kini.panggilan += 1
    kini.idr += Number(b.biaya_idr) || 0
    kini.token += (Number(b.token_masuk) || 0) + (Number(b.token_keluar) || 0)
    per.set(kunci, kini)
  }

  return [...per.values()]
    .map((r) => ({ ...r, idr: Math.round(r.idr * 100) / 100 }))
    .sort((a, b) => b.idr - a.idr)
}

export default async function aiConfigRoutes(app: FastifyInstance) {
  // ── GET /api/v1/ai/config ────────────────────────────────────────────────
  app.get(
    '/api/v1/ai/config',
    { preHandler: [authenticate, requirePermission('settings:ai:view')] },
    async (request, reply) => {
      const sekarang = new Date()

      const { data, error } = await request.db!
        .from('ai_provider_config')
        .select('asisten, penyedia, model, max_token, aktif, batas_bulanan_idr, mode_batas')

      if (error) {
        request.log.error({ err: error }, 'ai-config: gagal membaca konfigurasi')
        return reply.status(500).send({ error: 'Gagal membaca konfigurasi AI' })
      }

      const tersimpan = new Map(
        ((data ?? []) as Array<{ asisten: string }>).map((b) => [b.asisten, b]),
      )

      // Asisten yang BELUM punya baris tetap muncul, dengan nilai bawaannya.
      // Halaman yang hanya menampilkan yang sudah dikonfigurasi membuat admin
      // menyimpulkan asisten lain tidak ada — padahal ia berjalan dengan bawaan.
      const konfigurasi = ASISTEN.map((asisten) => {
        const baris = tersimpan.get(asisten)
        const k = baris ? bentukKonfigurasi(baris as never, asisten) : konfigurasiBawaan(asisten)
        return {
          asisten,
          penyedia: k.penyedia,
          model: k.model,
          max_token: k.maxToken,
          aktif: k.aktif,
          batas_bulanan_idr: k.batasBulananIdr,
          mode_batas: k.modeBatas,
          tersimpan: Boolean(baris),
          perkiraan_per_panggilan_idr: perkiraanPerPanggilan(k.model, k.maxToken),
        }
      })

      const [terpakaiIdr, rincian] = await Promise.all([
        pemakaianBulanIni(request.db!, sekarang),
        rincianPemakaian(request, sekarang),
      ])

      return reply.send({
        data: konfigurasi,
        model_tersedia: daftarModel(),
        // Kurs dikirim, TIDAK dipaku di komponen. Memaku `16000` di UI adalah
        // persis yang TJS lakukan, dan yang `audit-satu-sumber-harga` cegah di
        // sisi API — membiarkannya hidup di web hanya memindahkan cacatnya ke
        // tempat yang tak dijaga.
        kurs_idr: kursUsdIdr(),
        pemakaian: {
          bulan: awalBulan(sekarang).slice(0, 7),
          terpakai_idr: terpakaiIdr,
          rincian,
        },
      })
    },
  )

  // ── PUT /api/v1/ai/config/:asisten ───────────────────────────────────────
  app.put<{ Params: { asisten: string }; Body: BadanSimpan }>(
    '/api/v1/ai/config/:asisten',
    { preHandler: [authenticate, requirePermission('settings:ai:manage')] },
    async (request, reply) => {
      const { asisten } = request.params
      if (!asistenSah(asisten)) {
        return reply.status(422).send({ error: `Asisten '${asisten}' tidak dikenal sistem` })
      }

      const badan = request.body ?? {}
      const bawaan = konfigurasiBawaan(asisten)

      // Model divalidasi terhadap daftar berharga. Model tak dikenal akan
      // ditagih dengan tarif TERMAHAL oleh `hargaModel()` — perilaku yang benar
      // untuk pencatatan, tapi buruk sebagai kejutan. Ditolak di sini.
      const model = (badan.model ?? bawaan.model)?.trim() || bawaan.model
      const dikenal = daftarModel().some((m) => m.id === model)
      if (!dikenal) {
        return reply.status(422).send({
          error: `Model '${model}' tidak ada dalam daftar berharga. Menyimpannya berarti biayanya dicatat dengan tarif termahal tanpa peringatan.`,
        })
      }

      const maxToken = Number(badan.max_token ?? bawaan.maxToken)
      if (!Number.isInteger(maxToken) || maxToken < 1 || maxToken > MAKS_TOKEN_TERTINGGI) {
        return reply.status(422).send({
          error: `max_token harus bilangan bulat 1–${MAKS_TOKEN_TERTINGGI.toLocaleString('id-ID')}`,
        })
      }

      const modeBatas = (badan.mode_batas ?? bawaan.modeBatas) as ModeBatas
      if (!(MODE_BATAS as readonly string[]).includes(modeBatas)) {
        return reply.status(422).send({ error: `mode_batas harus 'blokir' atau 'peringatkan'` })
      }

      let batas: number | null = null
      if (badan.batas_bulanan_idr !== undefined && badan.batas_bulanan_idr !== null) {
        batas = Number(badan.batas_bulanan_idr)
        if (!Number.isFinite(batas) || batas < 0) {
          return reply.status(422).send({ error: 'batas_bulanan_idr tidak boleh negatif' })
        }
      }

      // Nilai LAMA dibaca dulu supaya audit memuat perubahan, bukan hanya
      // keadaan akhir. "Siapa menurunkan batas jadi nol" adalah pertanyaan yang
      // tak terjawab kalau yang tercatat cuma nilai barunya.
      const { data: lama, error: galatLama } = await request.db!
        .from('ai_provider_config')
        .select('penyedia, model, max_token, aktif, batas_bulanan_idr, mode_batas')
        .eq('asisten', asisten)
        .maybeSingle()

      if (galatLama) {
        request.log.error({ err: galatLama, asisten }, 'ai-config: gagal membaca nilai lama')
        return reply.status(500).send({ error: 'Gagal membaca konfigurasi AI' })
      }

      const { data, error } = await request.db!
        .from('ai_provider_config')
        .upsert(
          {
            company_id: request.companyId!,
            asisten,
            penyedia: (badan.penyedia ?? bawaan.penyedia).trim() || bawaan.penyedia,
            model,
            max_token: maxToken,
            aktif: badan.aktif ?? true,
            batas_bulanan_idr: batas,
            mode_batas: modeBatas,
            diperbarui_oleh: request.currentUser!.id,
          },
          { onConflict: 'company_id,asisten' },
        )
        .select('asisten, penyedia, model, max_token, aktif, batas_bulanan_idr, mode_batas, diperbarui_pada')
        .maybeSingle()

      if (error) {
        request.log.error({ err: error, asisten }, 'ai-config: gagal menyimpan konfigurasi')
        return reply.status(500).send({ error: 'Gagal menyimpan konfigurasi AI' })
      }

      void logAuditEvent(request, {
        tableName: 'ai_provider_config',
        // `asisten`, bukan UUID — inilah yang dulu membuat jejak hilang senyap
        // sebelum migrasi 249 memisahkan `record_key` (TJS-A4).
        recordId: asisten,
        action: 'ai.config.set',
        actorId: request.currentUser!.id,
        oldValues: lama ?? null,
        newValues: data ?? null,
        // Batas biaya adalah rem satu-satunya terhadap tagihan pihak ketiga.
        // Yang mengubahnya harus terlihat tanpa harus dicari.
        severity: 'critical',
      })

      return reply.send({ ok: true, data })
    },
  )
}
