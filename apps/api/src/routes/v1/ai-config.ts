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
  MODE_BICARA,
  awalBulan,
  bentukKonfigurasi,
  daftarModel,
  konfigurasiBawaan,
  pemakaianBulanIni,
  perkiraanPerPanggilan,
  type Asisten,
  type ModeBatas,
  type ModeBicara,
} from '../../lib/ai-config.js'
import { kursUsdIdr } from '../../lib/ai-harga.js'
import { PENYEDIA, penyediaDikenal } from '../../lib/ai-adaptor.js'
import { KATALOG_TOOL } from '../../lib/ai-tool.js'

const MAKS_TOKEN_TERTINGGI = 64_000

/**
 * `numeric` datang sebagai STRING lewat PostgREST.
 *
 * Mengirimkannya apa adanya ke UI membuat `batas_bulanan_idr` kadang string
 * kadang angka, dan perbandingan `terpakai >= batas` di sisi web diam-diam
 * membandingkan teks — "9" > "10" bernilai benar.
 */
function keAngkaPlafon(n: string | number | null | undefined): number | null {
  if (n === null || n === undefined) return null
  const v = typeof n === 'number' ? n : Number(n)
  return Number.isFinite(v) ? v : null
}

interface BadanSimpan {
  prompt_sistem?: string | null
  mode_bicara?: string
  maks_ronde?: number
  tool_aktif?: string[] | null
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
        .select('asisten, penyedia, model, max_token, aktif, batas_bulanan_idr, mode_batas, prompt_sistem, mode_bicara, maks_ronde, tool_aktif')

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
          prompt_sistem: k.promptSistem,
          mode_bicara: k.modeBicara,
          maks_ronde: k.maksRonde,
          tool_aktif: k.toolAktif,
        }
      })

      const [terpakaiIdr, rincian] = await Promise.all([
        pemakaianBulanIni(request.db!, sekarang),
        rincianPemakaian(request, sekarang),
      ])

      return reply.send({
        data: konfigurasi,
        model_tersedia: daftarModel(),
        // Daftar penyedia dikirim supaya UI punya kontrolnya. `penyedia`
        // divalidasi server sejak B1, tetapi tanpa kontrol di UI, nilai yang
        // ditolak server tak punya cara sah untuk diubah — kriteria B1
        // "field yang divalidasi server WAJIB ada di UI" (perbaikan cacat
        // maxTokens TJS) baru terpenuhi di sini.
        penyedia_tersedia: PENYEDIA,
        // Katalog tool dikirim supaya UI bisa menampilkannya sebagai pilihan.
        // Tanpa ini, "tool mana yang aktif" hanya bisa diatur lewat API — dan
        // konfigurasi yang butuh curl bukan konfigurasi dari UI.
        tool_tersedia: KATALOG_TOOL.map((t) => ({
          nama: t.nama,
          // `label` ikut dikirim supaya UI tak perlu menerjemahkan snake_case
          // sendiri. Menaruh peta nama→label di web berarti tool baru di API
          // muncul di layar sebagai kunci mentah sampai ada yang ingat
          // memperbarui peta — dan yang lupa tak menghasilkan galat apa pun.
          label: t.label,
          keterangan: t.keterangan,
          izin: t.izin,
        })),
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

  // ── GET /api/v1/ai/biaya ─────────────────────────────────────────────────
  //
  // Riwayat pemakaian untuk halaman Pemakaian & Biaya. Terpisah dari
  // `/ai/config` yang hanya mengirim bulan berjalan: halaman biaya menjawab
  // "bagaimana tren-nya", dan tren butuh deret harian.
  app.get<{ Querystring: { hari?: string } }>(
    '/api/v1/ai/biaya',
    { preHandler: [authenticate, requirePermission('settings:ai:view')] },
    async (request, reply) => {
      // Dibatasi 1–180 hari. Rentang tak terbatas membuat satu permintaan
      // menarik seluruh riwayat tenant — dan halaman yang menggantung terbaca
      // sebagai aplikasi rusak.
      const diminta = Number(request.query?.hari ?? 30)
      const hari = Number.isFinite(diminta) ? Math.min(180, Math.max(1, Math.trunc(diminta))) : 30

      /*
       * Batas dihitung dari AWAL HARI UTC, bukan dari "sekarang minus N×24 jam".
       *
       * Diukur 2026-08-10: baris tercatat 02:07 UTC hari ini, sementara kunci
       * terakhir yang dibentuk deret adalah KEMARIN — karena `Date.now() - 0`
       * menghasilkan waktu sekarang, dan `slice(0,10)`-nya bergantung pada jam
       * berapa permintaannya datang.
       *
       * Akibatnya baris hari ini masuk TOTAL tapi hilang dari GRAFIK: dua angka
       * di layar yang sama menjawab pertanyaan yang sama dengan hasil berbeda,
       * dan tak ada galat apa pun. Yang paling sering dicari orang — lonjakan
       * hari ini — justru yang hilang.
       */
      const hariIniUtc = new Date()
      hariIniUtc.setUTCHours(0, 0, 0, 0)
      const sejak = new Date(hariIniUtc.getTime() - (hari - 1) * 24 * 60 * 60 * 1000).toISOString()

      // `hariIniUtc` adalah awal hari UTC. Baris yang tercatat HARI INI
      // (jam berapa pun) harus ikut — dan `perHari` di bawah memuat kuncinya,
      // jadi rentang bacanya tak boleh berhenti sebelum hari ini berakhir.

      const { data, error } = await request.db!
        .from('ai_biaya_token')
        .select('asisten, model, biaya_idr, biaya_usd, token_masuk, token_keluar, token_cache_baca, dibuat_pada')
        .gte('dibuat_pada', sejak)
        .order('dibuat_pada', { ascending: true })

      if (error) {
        request.log.error({ err: error }, 'ai-biaya: gagal membaca riwayat')
        return reply.status(500).send({ error: 'Gagal membaca riwayat biaya' })
      }

      type Baris = {
        asisten: string; model: string
        biaya_idr: string | number; biaya_usd: string | number
        token_masuk: number; token_keluar: number; token_cache_baca: number
        dibuat_pada: string
      }
      const baris = (data ?? []) as Baris[]
      const angka = (n: unknown) => (Number.isFinite(Number(n)) ? Number(n) : 0)

      // Deret HARIAN — termasuk hari NOL. Grafik yang melompati hari tanpa
      // pemakaian menyiratkan garis lurus di antara dua puncak, dan itu
      // membaca tren yang tak pernah terjadi.
      const perHari = new Map<string, { idr: number; panggilan: number; token: number }>()
      for (let i = 0; i < hari; i++) {
        // Dari `hariIniUtc` yang SAMA dengan pembentuk `sejak` — dua sumber
        // waktu yang berbeda adalah cara baris hari ini hilang dari grafik.
        const d = new Date(hariIniUtc.getTime() - (hari - 1 - i) * 24 * 60 * 60 * 1000)
        perHari.set(d.toISOString().slice(0, 10), { idr: 0, panggilan: 0, token: 0 })
      }
      for (const b of baris) {
        const kunci = String(b.dibuat_pada).slice(0, 10)
        const k = perHari.get(kunci)
        if (!k) continue
        k.idr += angka(b.biaya_idr)
        k.panggilan += 1
        k.token += angka(b.token_masuk) + angka(b.token_keluar)
      }

      const kelompok = (ambil: (b: Baris) => string) => {
        const m = new Map<string, { kunci: string; idr: number; panggilan: number; token: number }>()
        for (const b of baris) {
          const k = ambil(b)
          const kini = m.get(k) ?? { kunci: k, idr: 0, panggilan: 0, token: 0 }
          kini.idr += angka(b.biaya_idr)
          kini.panggilan += 1
          kini.token += angka(b.token_masuk) + angka(b.token_keluar)
          m.set(k, kini)
        }
        return [...m.values()]
          .map((x) => ({ ...x, idr: Math.round(x.idr * 100) / 100 }))
          .sort((x, y) => y.idr - x.idr)
      }

      const totalIdr = baris.reduce((a, b) => a + angka(b.biaya_idr), 0)
      const totalCache = baris.reduce((a, b) => a + angka(b.token_cache_baca), 0)
      const totalMasuk = baris.reduce((a, b) => a + angka(b.token_masuk), 0)

      return reply.send({
        hari,
        total: {
          idr: Math.round(totalIdr * 100) / 100,
          panggilan: baris.length,
          token: baris.reduce((a, b) => a + angka(b.token_masuk) + angka(b.token_keluar), 0),
          // Penghematan cache DINYATAKAN. Kalau dijumlahkan diam-diam ke token
          // biasa, penghematan itu tak akan pernah terlihat — dan yang tak
          // terlihat tak akan dioptimalkan (alasan migrasi 250 memisahkannya).
          cache_baca: totalCache,
          /*
            Dibulatkan ke SATU DESIMAL, bukan ke bilangan bulat.

            Diukur 2026-08-14 pada data nyata: cache 2.400 token dari 963.083
            total = 0,249%. `Math.round(...)` mengembalikannya sebagai **0** —
            dan nol berarti "tak ada penghematan sama sekali", padahal
            penghematannya ada dan tercatat (`cache_baca` di baris atas
            menunjukkan 2.400).

            Itu persis kebalikan dari alasan migrasi 250 memisahkan token
            cache: supaya penghematannya TERLIHAT. Membulatkannya habis
            mengembalikan keadaan yang hendak diperbaiki, hanya lewat jalan
            lain — bukan disembunyikan di penjumlahan, melainkan di
            pembulatan.

            Satu desimal cukup: pemakaian AI yang baru mulai memakai cache
            wajar berada di bawah 1%, dan pertumbuhannya justru yang ingin
            dipantau.
          */
          rasio_cache: totalMasuk + totalCache > 0
            ? Math.round((totalCache / (totalMasuk + totalCache)) * 1000) / 10
            : 0,
        },
        harian: [...perHari.entries()].map(([tanggal, v]) => ({
          tanggal,
          idr: Math.round(v.idr * 100) / 100,
          panggilan: v.panggilan,
          token: v.token,
        })),
        per_asisten: kelompok((b) => b.asisten),
        per_model: kelompok((b) => b.model),
      })
    },
  )

  // ── GET /api/v1/ai/pengaturan ────────────────────────────────────────────
  //
  // Saklar mati + retensi, per tenant. Terpisah dari `/ai/config` karena
  // lingkupnya beda: config per-asisten, ini seluruh lapisan AI.
  app.get(
    '/api/v1/ai/pengaturan',
    { preHandler: [authenticate, requirePermission('settings:ai:view')] },
    async (request, reply) => {
      const { data, error } = await request.db!
        .from('ai_pengaturan_tenant')
        .select('ai_aktif, retensi_hari, batas_bulanan_idr, mode_batas')
        .maybeSingle()

      if (error) {
        request.log.error({ err: error }, 'ai-config: gagal membaca pengaturan tenant')
        return reply.status(500).send({ error: 'Gagal membaca pengaturan AI' })
      }

      // Tenant tanpa baris dianggap AKTIF dengan retensi bawaan — sama seperti
      // yang ditegakkan rute chat. Dua tempat harus sepakat, kalau tidak
      // halaman menampilkan "mati" sementara asistennya jalan.
      return reply.send({
        ai_aktif: (data as { ai_aktif?: boolean } | null)?.ai_aktif ?? true,
        retensi_hari: (data as { retensi_hari?: number | null } | null)?.retensi_hari ?? 30,
        // Plafon SELURUH kanal — pindah ke sini dari baris per-asisten oleh
        // migrasi 382. Satu angka, karena uangnya memang satu.
        batas_bulanan_idr:
          keAngkaPlafon((data as { batas_bulanan_idr?: string | number | null } | null)?.batas_bulanan_idr),
        mode_batas: (data as { mode_batas?: string } | null)?.mode_batas ?? 'peringatkan',
      })
    },
  )

  // ── PUT /api/v1/ai/pengaturan ────────────────────────────────────────────
  app.put<{
    Body: {
      ai_aktif?: boolean
      retensi_hari?: number | null
      batas_bulanan_idr?: number | null
      mode_batas?: string
    }
  }>(
    '/api/v1/ai/pengaturan',
    { preHandler: [authenticate, requirePermission('settings:ai:manage')] },
    async (request, reply) => {
      const badan = request.body ?? {}

      let retensi: number | null = null
      if (badan.retensi_hari !== undefined && badan.retensi_hari !== null) {
        retensi = Number(badan.retensi_hari)
        if (!Number.isInteger(retensi) || retensi < 1 || retensi > 3650) {
          return reply.status(422).send({ error: 'Retensi harus 1–3650 hari, atau kosong untuk selamanya' })
        }
      }

      const modeBatasTenant = (badan.mode_batas ?? 'peringatkan') as ModeBatas
      if (!(MODE_BATAS as readonly string[]).includes(modeBatasTenant)) {
        return reply.status(422).send({ error: `mode_batas harus 'blokir' atau 'peringatkan'` })
      }

      const { data: lama } = await request.db!
        .from('ai_pengaturan_tenant')
        .select('ai_aktif, retensi_hari, batas_bulanan_idr, mode_batas')
        .maybeSingle()

      /*
       * PLAFON: `undefined` berarti "jangan ubah", `null` berarti "hapus batas".
       *
       * Bedanya penting justru di rute ini. Upsert di bawah menulis SELURUH
       * baris, jadi pemanggil yang hanya menekan saklar `ai_aktif` akan
       * menghapus plafon tenant tanpa pernah menyebutnya — rem tagihan hilang
       * karena seseorang mematikan lalu menyalakan asisten.
       */
      const plafonLama = keAngkaPlafon(
        (lama as { batas_bulanan_idr?: string | number | null } | null)?.batas_bulanan_idr,
      )
      let plafon: number | null = plafonLama
      if (badan.batas_bulanan_idr !== undefined) {
        if (badan.batas_bulanan_idr === null) {
          plafon = null
        } else {
          const v = Number(badan.batas_bulanan_idr)
          if (!Number.isFinite(v) || v < 0) {
            return reply.status(422).send({ error: 'batas_bulanan_idr tidak boleh negatif' })
          }
          plafon = v
        }
      }

      const { data, error } = await request.db!
        .from('ai_pengaturan_tenant')
        .upsert(
          {
            company_id: request.companyId!,
            // `?? nilai lama`, BUKAN `?? true`. Halaman Penyedia AI menyimpan
            // batas biaya tanpa menyentuh saklar; dengan `?? true` penyimpanan
            // itu diam-diam MENYALAKAN kembali lapisan AI yang sengaja
            // dimatikan — dan tak ada satu pun galat yang menyebutkannya.
            ai_aktif:
              badan.ai_aktif ?? ((lama as { ai_aktif?: boolean } | null)?.ai_aktif ?? true),
            // Sama alasannya: `undefined` berarti "jangan ubah", bukan
            // "hapus retensi". Tanpa ini, menyimpan batas biaya membuat
            // riwayat percakapan disimpan selamanya.
            retensi_hari:
              badan.retensi_hari === undefined
                ? ((lama as { retensi_hari?: number | null } | null)?.retensi_hari ?? 30)
                : retensi,
            batas_bulanan_idr: plafon,
            mode_batas: badan.mode_batas === undefined
              ? ((lama as { mode_batas?: string } | null)?.mode_batas ?? 'peringatkan')
              : modeBatasTenant,
            diperbarui_oleh: request.currentUser!.id,
          },
          { onConflict: 'company_id' },
        )
        .select('ai_aktif, retensi_hari, batas_bulanan_idr, mode_batas')
        .maybeSingle()

      if (error) {
        request.log.error({ err: error }, 'ai-config: gagal menyimpan pengaturan tenant')
        return reply.status(500).send({ error: 'Gagal menyimpan pengaturan AI' })
      }

      // Mematikan lapisan AI menyentuh SELURUH asisten sekaligus. Yang
      // melakukannya harus terlihat tanpa perlu dicari.
      void logAuditEvent(request, {
        tableName: 'ai_pengaturan_tenant',
        recordId: request.companyId!,
        action: 'ai.pengaturan.set',
        actorId: request.currentUser!.id,
        oldValues: lama ?? null,
        newValues: data ?? null,
        severity: 'critical',
      })

      return reply.send({ ok: true, ...(data as object) })
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

      // Penyedia divalidasi terhadap DAFTAR. Kolomnya TEXT, jadi "anthropc"
      // tersimpan tanpa keluhan — lalu `buatAdaptor` menolaknya saat panggilan
      // pertama, jauh dari tempat salah ketiknya terjadi, dan asisten tenant
      // mati tanpa sebab yang terlihat di halaman pengaturan.
      const penyedia = (badan.penyedia ?? bawaan.penyedia).trim() || bawaan.penyedia
      if (!penyediaDikenal(penyedia)) {
        return reply.status(422).send({
          error: `Penyedia '${penyedia}' tidak dikenal sistem. Yang tersedia: ${PENYEDIA.map((p) => p.id).join(', ')}.`,
        })
      }

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

      // Batas ronde divalidasi SERVER, bukan hanya UI. Ronde 99 berarti satu
      // pertanyaan bisa menghabiskan kuota sebulan, dan API bisa dipanggil
      // langsung tanpa melewati halaman pengaturan.
      const maksRonde = Number(badan.maks_ronde ?? bawaan.maksRonde)
      if (!Number.isInteger(maksRonde) || maksRonde < 1 || maksRonde > 12) {
        return reply.status(422).send({ error: 'maks_ronde harus bilangan bulat 1–12' })
      }

      // Watak divalidasi SERVER. Nilai asing yang lolos ke basis akan ditolak
      // CHECK migrasi 382 sebagai galat 500 yang tak menjelaskan apa-apa;
      // ditolak di sini, penanya tahu persis pilihan yang sah.
      const modeBicara = (badan.mode_bicara ?? bawaan.modeBicara) as ModeBicara
      if (!(MODE_BICARA as readonly string[]).includes(modeBicara)) {
        return reply.status(422).send({
          error: `mode_bicara harus salah satu dari: ${MODE_BICARA.join(', ')}`,
        })
      }

      const promptSistem = badan.prompt_sistem?.trim() || null
      if (promptSistem && promptSistem.length > 8000) {
        // Prompt dikirim ULANG tiap ronde — 8.000 karakter dikali 4 ronde
        // sudah 8.000 token hanya untuk instruksi.
        return reply.status(422).send({ error: 'Instruksi tambahan maksimal 8.000 karakter' })
      }

      // Tool tak dikenal DITOLAK. Nama salah ketik tersimpan diam-diam lalu
      // membuat asisten kehilangan tool tanpa sebab yang terlihat.
      let toolAktif: string[] | null = null
      if (Array.isArray(badan.tool_aktif)) {
        const asing = badan.tool_aktif.filter((n) => !KATALOG_TOOL.some((t) => t.nama === n))
        if (asing.length > 0) {
          return reply.status(422).send({
            error: `Tool tidak dikenal: ${asing.join(', ')}. Yang tersedia: ${KATALOG_TOOL.map((t) => t.nama).join(', ')}.`,
          })
        }
        toolAktif = badan.tool_aktif
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
        .select('penyedia, model, max_token, aktif, batas_bulanan_idr, mode_batas, prompt_sistem, mode_bicara, maks_ronde, tool_aktif')
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
            penyedia,
            model,
            max_token: maxToken,
            aktif: badan.aktif ?? true,
            batas_bulanan_idr: batas,
            mode_batas: modeBatas,
            prompt_sistem: promptSistem,
            mode_bicara: modeBicara,
            maks_ronde: maksRonde,
            tool_aktif: toolAktif,
            diperbarui_oleh: request.currentUser!.id,
          },
          { onConflict: 'company_id,asisten' },
        )
        .select('asisten, penyedia, model, max_token, aktif, batas_bulanan_idr, mode_batas, prompt_sistem, mode_bicara, maks_ronde, tool_aktif, diperbarui_pada')
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
