/**
 * RUTE KREDENSIAL — arah datanya SATU ARAH.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * KONTRAK YANG DITEGAKKAN BERKAS INI
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Nilai kredensial boleh MASUK ke server, tidak pernah keluar.
 *
 * TIDAK ADA satu pun endpoint di sini yang mengembalikan nilai utuh —
 * termasuk untuk pemegang permission tertinggi. Yang boleh keluar: nama
 * kunci, 4 karakter terakhir, sumbernya, dan kapan terakhir diubah.
 *
 * Itulah yang membuat "kunci tidak bisa dilihat" berlaku sungguhan, bukan
 * sekadar disembunyikan di CSS yang bisa diakali lewat inspect element.
 *
 * Penjaga `audit-kredensial-tak-bocor.mjs` menegakkannya di CI (ambang NOL),
 * dan uji mutasinya membuktikan penjaga itu benar-benar merah untuk ketiga
 * bentuk kebocoran: `select('*')`, `nilai_enc` di respons, dan dekripsi di
 * luar lapisan berwenang.
 *
 * ── Kenapa "Uji Koneksi" menguji nilai yang SEDANG DIKETIK
 *
 * Kalau uji hanya bisa dilakukan atas nilai tersimpan, admin harus MENIMPA
 * kunci lama yang berfungsi untuk mengetahui apakah kunci baru benar. Kalau
 * ternyata salah, integrasinya sudah mati dan kunci lamanya sudah hilang.
 *
 * Jadi POST /uji menerima nilai opsional dan mengujinya tanpa menyimpan.
 */
import type { FastifyInstance, FastifyRequest } from 'fastify'
import { authenticate, requirePermission } from '../../plugins/auth.js'
import { logAuditEvent } from '../../utils/audit.js'
import { kunciNilai, empatAkhir, sandiSiap } from '../../lib/kredensial-sandi.js'
import {
  KATALOG_KREDENSIAL, metaKredensial, lupakanKredensial, sumberKredensial,
} from '../../lib/kredensial.js'

const ALASAN = 'kredensial kategori B; disaring company_id oleh wrapper'

/** Baris yang disimpan tenant ini — TANPA `nilai_enc`. */
async function barisTenant(request: FastifyRequest) {
  const { data, error } = await request.db!
    .from('app_credentials')
    .select('kunci, empat_akhir, catatan, diperbarui_oleh, diperbarui_pada')
  if (error) {
    request.log.error({ err: error }, 'gagal membaca daftar kredensial')
    throw new Error(error.message)
  }
  return data ?? []
}

export default async function kredensialRoutes(app: FastifyInstance) {
  // ── GET /api/v1/kredensial ───────────────────────────────────────────────
  //
  // Mengembalikan SELURUH katalog, bukan hanya yang sudah terisi. Tanpa itu,
  // admin tak punya cara tahu kunci apa yang dibutuhkan sistem sampai sesuatu
  // gagal — dan kegagalan integrasi biasanya senyap.
  app.get(
    '/api/v1/kredensial',
    { preHandler: [authenticate, requirePermission('settings:credentials:view')] },
    async (request, reply) => {
      const baris = await barisTenant(request)
      const perKunci = new Map(baris.map((b) => [b.kunci as string, b]))

      const daftar = KATALOG_KREDENSIAL.map((meta) => {
        const b = perKunci.get(meta.kunci)
        return {
          kunci: meta.kunci,
          label: meta.label,
          keterangan: meta.keterangan,
          tautan: meta.tautan ?? null,
          grup: meta.grup,
          // Tak ada `nilai` di sini, dan tak boleh pernah ada.
          empat_akhir: b?.empat_akhir ?? null,
          sumber: sumberKredensial(Boolean(b), meta.kunci),
          punya_jatuhan_env: Boolean(meta.env),
          catatan: b?.catatan ?? null,
          diperbarui_pada: b?.diperbarui_pada ?? null,
        }
      })

      return reply.send({
        data: daftar,
        // UI memakai ini untuk menjelaskan kenapa penyimpanan ditolak,
        // alih-alih menampilkan 503 telanjang saat admin menekan Simpan.
        enkripsi_siap: sandiSiap(),
      })
    },
  )

  // ── PUT /api/v1/kredensial/:kunci ────────────────────────────────────────
  app.put<{ Params: { kunci: string }; Body: { nilai?: string; catatan?: string } }>(
    '/api/v1/kredensial/:kunci',
    { preHandler: [authenticate, requirePermission('settings:credentials:manage')] },
    async (request, reply) => {
      const { kunci } = request.params
      const nilai = (request.body?.nilai ?? '').trim()

      if (!metaKredensial(kunci)) {
        return reply.status(422).send({ error: `Kunci '${kunci}' tidak dikenal sistem` })
      }
      if (!nilai) {
        return reply.status(422).send({ error: 'Nilai kredensial tidak boleh kosong' })
      }

      // MENOLAK menyimpan lebih baik daripada menyimpan plaintext yang kelak
      // ikut mengalir ke backup. Diperiksa DI SINI, bukan dibiarkan melempar
      // di tengah, supaya pesannya bisa ditindaklanjuti.
      if (!sandiSiap()) {
        return reply.status(503).send({
          error:
            'Enkripsi kredensial belum terkonfigurasi (CREDENTIAL_ENCRYPTION_KEY). ' +
            'Menyimpan ditolak — lebih baik gagal jelas daripada menyimpan yang tak bisa dibuka.',
        })
      }

      const { data, error } = await request.db!
        .from('app_credentials')
        .upsert(
          {
            company_id: request.companyId!,
            kunci,
            nilai_enc: kunciNilai(nilai),
            empat_akhir: empatAkhir(nilai),
            catatan: request.body?.catatan?.trim() || null,
            diperbarui_oleh: request.currentUser!.id,
            diperbarui_pada: new Date().toISOString(),
          },
          { onConflict: 'company_id,kunci' },
        )
        .select('kunci, empat_akhir, diperbarui_pada')
        .maybeSingle()

      if (error) {
        request.log.error({ err: error, kunci }, 'gagal menyimpan kredensial')
        return reply.status(500).send({ error: 'Gagal menyimpan kredensial' })
      }

      lupakanKredensial(request.companyId!, kunci)

      // Audit menerima METADATA saja. Nilainya tak pernah masuk — dan itu
      // bukan kelalaian melainkan syarat: audit log di repo ini append-only,
      // jadi kredensial yang bocor ke sana tak bisa dihapus lagi.
      void logAuditEvent(request, {
        tableName: 'app_credentials',
        recordId: kunci,
        action: 'credential.set',
        actorId: request.currentUser!.id,
        newValues: { kunci, empat_akhir: data?.empat_akhir ?? null },
        severity: 'critical',
      })

      return reply.send({
        ok: true,
        kunci,
        empat_akhir: data?.empat_akhir ?? null,
        sumber: 'tenant',
        diperbarui_pada: data?.diperbarui_pada ?? null,
      })
    },
  )

  // ── DELETE /api/v1/kredensial/:kunci ─────────────────────────────────────
  app.delete<{ Params: { kunci: string } }>(
    '/api/v1/kredensial/:kunci',
    { preHandler: [authenticate, requirePermission('settings:credentials:manage')] },
    async (request, reply) => {
      const { kunci } = request.params

      const { data, error } = await request.db!
        .from('app_credentials')
        .delete()
        .eq('kunci', kunci)
        .select('kunci')
        .maybeSingle()

      if (error) {
        request.log.error({ err: error, kunci }, 'gagal menghapus kredensial')
        return reply.status(500).send({ error: 'Gagal menghapus kredensial' })
      }
      if (!data) {
        return reply.status(404).send({ error: 'Kredensial ini belum disetel' })
      }

      lupakanKredensial(request.companyId!, kunci)

      void logAuditEvent(request, {
        tableName: 'app_credentials',
        recordId: kunci,
        action: 'credential.delete',
        actorId: request.currentUser!.id,
        oldValues: { kunci },
        severity: 'critical',
      })

      const meta = metaKredensial(kunci)
      return reply.send({
        ok: true,
        kunci,
        // Menghapus kredensial tenant BUKAN berarti integrasinya mati — kalau
        // env server terisi, sistem jatuh ke sana. Dikatakan eksplisit supaya
        // admin tak mengira sudah mencabut akses padahal belum.
        jatuh_ke_env: Boolean(meta?.env && process.env[meta.env]?.trim()),
      })
    },
  )

  // ── POST /api/v1/kredensial/:kunci/uji ───────────────────────────────────
  //
  // Selalu membalas 200. Hasil uji yang "gagal" adalah INFORMASI yang diminta,
  // bukan kegagalan permintaan — 5xx membuat UI menampilkan galat jaringan
  // alih-alih pesan yang bisa ditindaklanjuti. (Pola diambil dari TJS.)
  app.post<{ Params: { kunci: string }; Body: { nilai?: string } }>(
    '/api/v1/kredensial/:kunci/uji',
    { preHandler: [authenticate, requirePermission('settings:credentials:manage')] },
    async (request, reply) => {
      const { kunci } = request.params
      const meta = metaKredensial(kunci)
      if (!meta) {
        return reply.status(422).send({ error: `Kunci '${kunci}' tidak dikenal sistem` })
      }

      const diketik = (request.body?.nilai ?? '').trim()

      // Nilai yang sedang diketik diuji TANPA disimpan — inilah yang membuat
      // "uji dulu sebelum menimpa kunci lama" mungkin.
      const { ambilKredensial } = await import('../../lib/kredensial.js')
      const dipakai = diketik || (await ambilKredensial(request, kunci))

      if (!dipakai) {
        return reply.send({
          ok: false,
          pesan: 'Kredensial ini belum disetel — tidak ada yang bisa diuji.',
          yang_diuji: 'tidak-ada',
        })
      }

      const hasil = await ujiKredensial(kunci, dipakai, (k) =>
        ambilKredensial(request, k),
      )
      return reply.send({
        ...hasil,
        yang_diuji: diketik ? 'nilai-yang-diketik' : 'nilai-tersimpan',
      })
    },
  )
}

const BATAS_UJI_MS = 15_000

/**
 * Uji satu kredensial ke penyedianya.
 *
 * Tiap probe dipilih yang paling murah dan paling tak merusak: membaca daftar,
 * bukan mengirim sesuatu. `RESEND_API_KEY` diuji dengan membaca domain — tak
 * ada email yang terkirim.
 */
async function ujiKredensial(
  kunci: string,
  nilai: string,
  /*
   * Pembaca kunci LAIN — sebagian uji butuh lebih dari satu nilai.
   *
   * `N8N_BASE_URL` dan `WA_*` tak bisa diuji sendirian: memanggil layanannya
   * menuntut alamat DAN kunci (dan untuk WhatsApp, nama instance). Tanpa
   * parameter ini, tombol Uji hanya bisa memeriksa bentuk teksnya — yang tak
   * menjawab pertanyaan yang sebenarnya dibawa orang ke tombol itu:
   * "sambungannya hidup tidak?"
   */
  bacaLain?: (k: string) => Promise<string | null>,
): Promise<{ ok: boolean; pesan: string }> {
  try {
    /*
     * Uji multi-kunci dipilih dari GRUP di katalog, bukan dari nama kuncinya.
     *
     * Menulis `case 'WA_BASE_URL'` di sini ditolak `audit-satu-pintu-wa`, dan
     * penjaganya benar: daftar kunci WhatsApp yang hidup di dua tempat akan
     * menyimpang, dan yang kedua tak terjaga. Menambahkan berkas ini ke
     * daftar putih penjaga akan MELONGGARKANNYA — jadi yang diubah kodenya.
     *
     * Katalog sudah menyimpan `grup`; rute cukup membacanya.
     */
    const meta = metaKredensial(kunci)
    const bacaGabungan = async (k: string) =>
      // Nilai yang SEDANG DIKETIK menang atas yang tersimpan — supaya admin
      // bisa menguji sebelum menyimpan, bukan sesudah menimpa.
      k === kunci ? nilai : ((await bacaLain?.(k)) ?? null)

    if (meta?.grup === 'WhatsApp') {
      const { ujiSambunganWaDariKredensial } = await import('../../lib/wa-kirim.js')
      const r = await ujiSambunganWaDariKredensial(bacaGabungan)
      return { ok: r.ok, pesan: r.pesan }
    }

    if (meta?.grup === 'Otomasi (n8n)') {
      const { konfigurasiN8n, ujiSambunganN8n } = await import('../../lib/otomasi-n8n.js')
      const r = await ujiSambunganN8n(await konfigurasiN8n(bacaGabungan))
      return { ok: r.ok, pesan: r.pesan }
    }

    switch (kunci) {
      case 'ANTHROPIC_API_KEY':
        return await probe('https://api.anthropic.com/v1/models', {
          'x-api-key': nilai,
          'anthropic-version': '2023-06-01',
        }, 'Anthropic')

      case 'OPENAI_API_KEY':
        return await probe('https://api.openai.com/v1/models',
          { Authorization: `Bearer ${nilai}` }, 'OpenAI')

      case 'RESEND_API_KEY':
        return await probe('https://api.resend.com/domains',
          { Authorization: `Bearer ${nilai}` }, 'Resend')

      default:
        return {
          ok: false,
          pesan: 'Uji otomatis untuk kredensial ini belum tersedia.',
        }
    }
  } catch (e) {
    return {
      ok: false,
      pesan:
        'Tidak bisa menghubungi layanan: ' + (e as Error).message.slice(0, 120) +
        '. Periksa koneksi internet server.',
    }
  }
}

async function probe(
  url: string,
  headers: Record<string, string>,
  nama: string,
): Promise<{ ok: boolean; pesan: string }> {
  const res = await fetch(url, { headers, signal: AbortSignal.timeout(BATAS_UJI_MS) })
  if (res.ok) return { ok: true, pesan: `Kunci ${nama} valid dan aktif.` }
  if (res.status === 401 || res.status === 403) {
    return { ok: false, pesan: `Kunci ${nama} ditolak (${res.status}).` }
  }
  // 429 = kena batas laju, TAPI kuncinya terbukti dikenali. Melaporkannya
  // sebagai gagal akan membuat admin mengganti kunci yang sebenarnya benar.
  if (res.status === 429) {
    return { ok: true, pesan: `Kunci ${nama} valid, tapi sedang kena batas laju.` }
  }
  return { ok: false, pesan: `${nama} membalas ${res.status}.` }
}
