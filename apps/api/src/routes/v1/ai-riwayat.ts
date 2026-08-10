/**
 * RIWAYAT ASISTEN — apa yang DIBICARAKAN, dan apa yang benar-benar TERJADI.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * KENAPA ADA, DAN KENAPA PERMINTAANNYA MUNCUL DI DUA PROJECT
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Founder Puraloka: "ada juga log aktivitas (termasuk history percakapan
 * dengan ai assistant)". Founder TJS meminta hal yang sama dengan kalimatnya
 * sendiri, dan tercatat di `owner-ai/activity/page.tsx`: "agar owner juga bisa
 * cek apa aja yg dilakukan dia dan orang lain yg dapat akses asisten ini".
 *
 * Dua orang berbeda sampai pada kebutuhan yang sama, dan itu masuk akal:
 * asisten yang bisa membaca seluruh data perusahaan adalah pihak yang paling
 * tak terlihat di sistem. Tanpa halaman ini, satu-satunya jejaknya ada di
 * tabel yang tak punya pembaca.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * MENGGABUNG LIMA SUMBER — DAN KENAPA MEMISAHKANNYA BERBAHAYA
 * ══════════════════════════════════════════════════════════════════════════
 *
 * TJS menulis alasan penggabungannya dengan tepat: supaya pemilik "tidak perlu
 * buka beberapa halaman berbeda untuk 'apa yang dibicarakan' vs 'apa yang
 * benar-benar dieksekusi'." Dua hal itu BISA BERBEDA, dan justru bedanya yang
 * perlu terlihat.
 *
 * TJS menggabungkan empat: percakapan, tool, galat, approval. Di sini LIMA —
 * yang kelima BIAYA, dan TJS tak punya padanannya:
 *
 *   1. `ai_percakapan` — siapa bertanya, lewat kanal apa, kapan
 *   2. `ai_pesan`      — isinya, beserta `ada_galat_tool` per pesan
 *   3. `audit_logs` `ai.*` — keputusan NYATA (tulis berhasil/gagal/ditolak)
 *   4. `ai.entitas.asing` — I-4: asisten melihat entitas di luar hasil tool,
 *      penanda paling awal upaya injeksi lewat dokumen
 *   5. `ai_biaya_token` — token dan rupiah per ronde
 *
 * ══════════════════════════════════════════════════════════════════════════
 * ISI PERCAKAPAN TIDAK IKUT DI DAFTAR — DAN ITU BUKAN KELALAIAN
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Daftar hanya memulangkan METADATA (judul, kanal, jumlah pesan, penanda
 * galat). Isinya baru terbaca saat satu percakapan DIBUKA.
 *
 * Alasannya bukan performa. Halaman yang menampilkan potongan isi percakapan
 * semua orang sekaligus mengubah "log aktivitas" jadi papan pengumuman: satu
 * layar yang tak sengaja terlihat rekan kerja membocorkan pertanyaan orang
 * lain tentang gaji, kasbon, atau sengketa. Membuka satu per satu adalah
 * tindakan yang disengaja, dan tindakan yang disengaja bisa dipertanggung-
 * jawabkan.
 *
 * ── Membaca percakapan ORANG LAIN dicatat
 *
 * Yang membuka percakapan milik orang lain meninggalkan jejak audit. Ini
 * pengawasan atas pengawas: halaman yang dibuat agar pemilik bisa mengawasi
 * asisten tak boleh jadi jendela sepihak untuk mengintip bawahan.
 */

import type { FastifyInstance } from 'fastify'
import { authenticate, requirePermission } from '../../plugins/auth.js'
import { logAuditEvent } from '../../utils/audit.js'

/** Batas atas satu halaman. Riwayat panjang tak boleh menahan request. */
const BATAS = 50

export default async function aiRiwayatRoutes(app: FastifyInstance) {
  // ── GET /api/v1/ai/riwayat — daftar percakapan (METADATA saja) ───────────
  app.get<{ Querystring: { kanal?: string; galat?: string } }>(
    '/api/v1/ai/riwayat',
    { preHandler: [authenticate, requirePermission('ai:history:view')] },
    async (request, reply) => {
      const { data, error } = await request.db!
        .from('ai_percakapan')
        .select('id, user_id, asisten, judul, kanal, dibuat_pada, diperbarui_pada')
        .order('diperbarui_pada', { ascending: false })
        .limit(BATAS)

      if (error) {
        request.log.error({ err: error }, 'ai/riwayat: gagal membaca percakapan')
        return reply.status(500).send({ error: 'Gagal membaca riwayat' })
      }

      const percakapan = (data ?? []) as Array<{
        id: string; user_id: string | null; asisten: string
        judul: string | null; kanal: string; dibuat_pada: string; diperbarui_pada: string
      }>
      if (percakapan.length === 0) {
        return reply.send({ data: [], ringkas: kosong() })
      }

      const ids = percakapan.map((p) => p.id)

      /*
       * Pesan diambil TANPA kolom `teks`.
       *
       * Yang dibutuhkan daftar hanya JUMLAH dan penanda galat. Mengambil isinya
       * lalu membuangnya di sini berarti isi percakapan seluruh perusahaan
       * sempat melewati memori proses untuk sesuatu yang tak menampilkannya —
       * dan yang tak pernah ditampilkan tetap bisa bocor lewat log galat.
       */
      const { data: pesan, error: errPesan } = await request.db!
        .from('ai_pesan')
        .select('percakapan_id, peran, ada_galat_tool')
        .in('percakapan_id', ids)

      // Gagal di sini akan menampilkan "0 pesan · 0 galat" untuk percakapan
      // yang sebenarnya penuh galat — menenangkan, dan salah.
      if (errPesan) {
        request.log.error({ err: errPesan }, 'ai/riwayat: gagal menghitung pesan')
        return reply.status(500).send({ error: 'Gagal membaca riwayat' })
      }

      const hitung = new Map<string, { pesan: number; galat: number }>()
      for (const m of (pesan ?? []) as Array<{ percakapan_id: string; ada_galat_tool: boolean | null }>) {
        const h = hitung.get(m.percakapan_id) ?? { pesan: 0, galat: 0 }
        h.pesan += 1
        if (m.ada_galat_tool) h.galat += 1
        hitung.set(m.percakapan_id, h)
      }

      // Nama penanya — daftar tanpa nama menuntut orang menghafal UUID.
      const userIds = [...new Set(percakapan.map((p) => p.user_id).filter(Boolean))] as string[]
      const { data: pengguna, error: errUser } = userIds.length
        ? await request.db!
            .unsafe(
              'users',
              'id-nya DITURUNKAN dari ai_percakapan yang sudah tersaring tenant; ' +
                '`.in()` hanya memulangkan baris untuk id itu, jadi tak ada pengguna ' +
                'tenant lain yang bisa ikut terbaca',
            )
            .select('id, name')
            .in('id', userIds)
        : { data: [], error: null }
      // Nama yang gagal dibaca TIDAK memblokir halaman — daftarnya masih
      // berguna tanpa nama. Tapi ia dicatat: "—" di semua baris adalah gejala
      // yang tanpa log ini terlihat seperti data yang memang kosong.
      if (errUser) {
        request.log.warn({ err: errUser }, 'ai/riwayat: nama penanya gagal dibaca')
      }
      const namaUser = new Map(
        ((pengguna ?? []) as Array<{ id: string; name: string }>).map((u) => [u.id, u.name]),
      )

      let ringkas
      try {
        ringkas = await ringkasan(request)
      } catch (e) {
        // Ringkasan yang tak bisa dihitung TIDAK boleh jadi nol — lihat
        // catatan di `ringkasan()`.
        request.log.error({ err: e }, 'ai/riwayat: ringkasan gagal dihitung')
        return reply.status(500).send({ error: 'Gagal menghitung ringkasan riwayat' })
      }

      return reply.send({
        data: percakapan.map((p) => ({
          ...p,
          nama: p.user_id ? (namaUser.get(p.user_id) ?? '—') : '—',
          jumlah_pesan: hitung.get(p.id)?.pesan ?? 0,
          jumlah_galat: hitung.get(p.id)?.galat ?? 0,
        })),
        ringkas,
      })
    },
  )

  /*
   * `/keputusan` DIDAFTARKAN SEBELUM `/:id` — urutannya menentukan.
   *
   * Fastify mencocokkan rute statis lebih dulu daripada parametrik, jadi
   * hari ini keduanya bisa hidup berdampingan. Tapi urutan ini ditulis
   * eksplisit supaya tak bergantung pada perilaku itu: kalau suatu saat
   * `/:id` yang menang, `/keputusan` akan dibaca sebagai ID percakapan dan
   * membalas 404 — galat yang menunjuk ke "percakapan tak ada", bukan ke
   * rute yang tertutup.
   */
  // ── GET /api/v1/ai/riwayat/keputusan — apa yang benar-benar TERJADI ──────
  //
  // Terpisah dari percakapan, dan itu inti halaman ini: yang DIBICARAKAN
  // belum tentu yang DIEKSEKUSI. Baris di sini adalah tindakan nyata —
  // tulisan yang mendarat, yang ditolak, dan entitas asing yang terdeteksi.
  app.get(
    '/api/v1/ai/riwayat/keputusan',
    { preHandler: [authenticate, requirePermission('ai:history:view')] },
    async (request, reply) => {
      const { data, error } = await request.db!
        .unsafe(
          'audit_logs',
          'kategori D: company_id ditulis langsung, tak pernah lewat join. Disaring ' +
            'eksplisit dengan .eq(company_id) di baris berikutnya',
        )
        .select('id, action, record_id, user_id, new_values, severity, created_at')
        .eq('company_id', request.companyId!)
        .like('action', 'ai.%')
        /*
         * Jejak PENGAWASAN dikeluarkan dari kolom "yang benar-benar terjadi".
         *
         * `ai.riwayat.baca_milik_orang_lain` adalah jejak orang membuka halaman
         * ini, bukan jejak asisten mengerjakan sesuatu. Dibiarkan bercampur, ia
         * MENDOMINASI: 14 dari 99 baris pada 2026-08-10, semuanya berturut-turut
         * di puncak daftar, menenggelamkan 2 deteksi entitas asing yang justru
         * paling perlu dilihat.
         *
         * Halaman ini menjawab "asisten ngapain?". Yang menjawab "siapa membaca
         * apa" adalah Audit Log (`/audit`), dan di sanalah barisnya tetap utuh —
         * disaring di sini, bukan dihapus.
         */
        .not('action', 'eq', 'ai.riwayat.baca_milik_orang_lain')
        .order('created_at', { ascending: false })
        .limit(BATAS)

      if (error) {
        request.log.error({ err: error }, 'ai/riwayat: gagal membaca keputusan')
        return reply.status(500).send({ error: 'Gagal membaca jejak keputusan' })
      }
      return reply.send({ data: data ?? [] })
    },
  )

  // ── GET /api/v1/ai/riwayat/:id — isi satu percakapan ─────────────────────
  app.get<{ Params: { id: string } }>(
    '/api/v1/ai/riwayat/:id',
    { preHandler: [authenticate, requirePermission('ai:history:view')] },
    async (request, reply) => {
      const { data: kepala, error: errKepala } = await request.db!
        .from('ai_percakapan')
        .select('id, user_id, asisten, judul, kanal, dibuat_pada')
        .eq('id', request.params.id)
        .maybeSingle()

      if (errKepala) {
        request.log.error({ err: errKepala }, 'ai/riwayat: gagal membaca percakapan')
        return reply.status(500).send({ error: 'Gagal membaca percakapan' })
      }
      if (!kepala) return reply.status(404).send({ error: 'Percakapan tidak ditemukan' })

      const k = kepala as { id: string; user_id: string | null; judul: string | null }

      const { data: pesan, error } = await request.db!
        .from('ai_pesan')
        .select('id, peran, urutan, teks, ronde, ada_galat_tool, dibuat_pada')
        .eq('percakapan_id', request.params.id)
        .order('urutan')

      if (error) {
        request.log.error({ err: error }, 'ai/riwayat: gagal membaca pesan')
        return reply.status(500).send({ error: 'Gagal membaca isi percakapan' })
      }

      /*
       * Membaca percakapan ORANG LAIN dicatat — pengawasan atas pengawas.
       *
       * Halaman ini dibuat supaya pemilik bisa mengawasi asisten. Ia tak boleh
       * berubah jadi jendela sepihak untuk mengintip bawahan tanpa jejak. Yang
       * membaca percakapannya sendiri TIDAK dicatat: mencatatnya hanya
       * memenuhi audit dengan baris yang tak pernah jadi pertanyaan siapa pun.
       */
      if (k.user_id && k.user_id !== request.currentUser!.id) {
        void logAuditEvent(request, {
          tableName: 'ai_percakapan',
          recordId: k.id,
          action: 'ai.riwayat.baca_milik_orang_lain',
          actorId: request.currentUser!.id,
          newValues: { pemilik: k.user_id, judul: k.judul },
          severity: 'warning',
        })
      }

      return reply.send({ percakapan: kepala, pesan: pesan ?? [] })
    },
  )
}

/**
 * Mengambil `data`, dan MELEMPAR kalau querynya gagal.
 *
 * Menggantikan `?? []`, yang di ringkasan ini adalah bentuk paling berbahaya
 * dari kegagalan senyap: RLS yang menolak atau kolom yang berubah nama
 * menghasilkan "0 entitas asing" — kalimat yang menenangkan justru saat
 * sistemnya sedang tak bisa melihat. Penjaga `audit-kegagalan-senyap`
 * menghitung pola `?? []` apa adanya, dan ia benar: yang membedakan "nol"
 * dari "tak terbaca" harus ada di kodenya, bukan di kepala penulisnya.
 */
function wajib<T>(
  nama: string,
  hasil: { data: unknown; error: { message: string } | null },
): T[] {
  if (hasil.error) {
    throw new Error(`ringkasan riwayat: gagal membaca ${nama}: ${hasil.error.message}`)
  }
  return (hasil.data as T[] | null) ?? []
}

const kosong = () => ({
  percakapan: 0, pesan: 0, galat_tool: 0, entitas_asing: 0,
  tulis_berhasil: 0, tulis_gagal: 0, biaya_idr: 0,
})

/**
 * Ringkasan untuk rail kanan.
 *
 * Dihitung dari sumbernya tiap kali, bukan disimpan. Angka turunan yang
 * disimpan bisa basi tanpa menyatakan dirinya basi — pelajaran yang sama
 * dengan `kesehatan_pada` di katalog otomasi (migrasi 272).
 */
async function ringkasan(request: import('fastify').FastifyRequest) {
  const db = request.db!
  const [percakapan, pesan, jejak, biaya] = await Promise.all([
    db.from('ai_percakapan').select('id'),
    db.from('ai_pesan').select('id, ada_galat_tool'),
    db
      .unsafe('audit_logs', 'kategori D — disaring eksplisit dengan .eq(company_id) di bawah')
      .select('action')
      .eq('company_id', request.companyId!)
      .like('action', 'ai.%')
      .not('action', 'eq', 'ai.riwayat.baca_milik_orang_lain'),
    db.from('ai_biaya_token').select('biaya_idr'),
  ])

  /*
   * Query yang GAGAL tak boleh jadi angka NOL.
   *
   * `?? []` di sini adalah bentuk paling berbahaya dari kegagalan senyap:
   * ringkasan ini yang menjawab "ada yang mencurigakan tidak?", dan RLS yang
   * menolak atau kolom yang berubah nama akan menampilkan "0 entitas asing"
   * — kalimat yang menenangkan justru saat sistemnya sedang tak bisa melihat.
   *
   * Yang benar: melempar. Pemanggilnya membalas 500, dan orang tahu angkanya
   * TIDAK diketahui alih-alih percaya angka yang tak pernah dihitung.
   */
  const c = wajib<{ id: string }>('percakapan', percakapan)
  const p = wajib<{ ada_galat_tool: boolean | null }>('pesan', pesan)
  const j = wajib<{ action: string }>('jejak', jejak)
  const b = wajib<{ biaya_idr: string | number | null }>('biaya', biaya)

  return {
    percakapan: c.length,
    pesan: p.length,
    galat_tool: p.filter((x) => x.ada_galat_tool).length,
    // I-4: asisten melihat entitas di luar hasil tool. Penanda paling awal
    // upaya injeksi lewat dokumen — dan satu-satunya yang muncul SEBELUM ada
    // kerusakan yang bisa dilihat.
    entitas_asing: j.filter((x) => x.action === 'ai.entitas.asing').length,
    tulis_berhasil: j.filter((x) => x.action === 'ai.tulis.berhasil').length,
    tulis_gagal: j.filter((x) => x.action === 'ai.tulis.gagal' || x.action === 'ai.tulis.ditolak').length,
    biaya_idr: b.reduce((s, x) => s + Number(x.biaya_idr ?? 0), 0),
  }
}
