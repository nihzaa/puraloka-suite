/**
 * INBOX APPROVAL TERPUSAT.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * MASALAH YANG DISELESAIKAN
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Tujuh jenis dokumen memakai mesin approval yang sama, tetapi approver harus
 * membuka tujuh halaman berbeda untuk mengetahui apa yang menunggunya. Yang
 * tak dibuka tak diputuskan — dan yang tak diputuskan menahan pekerjaan
 * lapangan tanpa ada yang tahu sebabnya.
 *
 * ── Kenapa baru bisa dibangun SEKARANG
 *
 * TJS-A3a membongkar pintu approval kedua (`notifications.ts` yang menyetujui
 * kasbon di luar mesin). Selama pintu itu ada, inbox akan menampilkan antrean
 * yang bisa dikosongkan lewat jalur yang tak dilihatnya — dan approver akan
 * melihat pekerjaan yang sebenarnya sudah selesai.
 *
 * Inbox yang tak lengkap LEBIH BERBAHAYA daripada tak ada inbox: ia
 * mengajarkan bahwa antrean kosong berarti tak ada yang menunggu.
 *
 * ── Kenapa membaca tabel entitas, bukan `approval_progress`
 *
 * `approval_progress` mencatat langkah yang SUDAH disetujui. Inbox yang
 * membacanya saja akan melewatkan dokumen yang belum tersentuh sama sekali —
 * justru yang paling perlu ditampilkan.
 *
 * Jadi: entitas berstatus menunggu diambil dari tabelnya masing-masing
 * (katalog di `lib/inbox-approval.ts`), lalu `approval_progress` dipakai untuk
 * tahu sudah sampai level berapa.
 */
import type { FastifyInstance, FastifyRequest } from 'fastify'
import { authenticate } from '../../plugins/auth.js'
import { SUMBER_INBOX, type SumberInbox } from '../../lib/inbox-approval.js'
import { canParticipateInChain } from '../../utils/approval.js'

interface BarisInbox {
  jenis: string
  label: string
  id: string
  judul: string | null
  nomor: string | null
  nominal: number | null
  pengaju_id: string | null
  dibuat_pada: string | null
  project_id: string | null
  /** Level yang SUDAH disetujui — 0 berarti belum tersentuh siapa pun. */
  level_selesai: number
  jalur_ui: string
  /** Pengaju tak boleh menyetujui pengajuannya sendiri (SoD). */
  saya_pengajunya: boolean
}

/** Kolom yang perlu diambil untuk satu sumber, tanpa duplikat. */
function kolomUntuk(s: SumberInbox): string {
  // `kolomDibuat` dari katalog, BUKAN 'created_at' yang dipaku. Modul
  // berbahasa Indonesia memakai `dibuat_pada`, dan memakunya membuat jenis itu
  // GAGAL dibaca — masuk daftar `dilewati`, bukan melempar.
  const k = new Set(['id', 'status', s.kolomDibuat])
  if (s.kolomNominal) k.add(s.kolomNominal)
  if (s.kolomJudul) k.add(s.kolomJudul)
  if (s.kolomNomor) k.add(s.kolomNomor)
  if (s.kolomPengaju) k.add(s.kolomPengaju)
  if (s.tenancy === 'C') k.add('project_id')
  if (s.tenancy === 'C-scenario') k.add('scenario_id')
  if (s.tenancy === 'C-pegawai') k.add('pegawai_id')
  return [...k].join(', ')
}

export default async function approvalInboxRoutes(app: FastifyInstance) {
  // ── GET /api/v1/approval/inbox ───────────────────────────────────────────
  //
  // Tanpa `requirePermission` tersendiri: yang boleh dilihat ditentukan
  // `canParticipateInChain` per jenis — persis mesin yang menentukan siapa
  // boleh menyetujui apa. Permission terpisah di sini akan jadi kebenaran
  // KEDUA tentang siapa berwenang, dan dua kebenaran cepat atau lambat
  // berbeda.
  app.get(
    '/api/v1/approval/inbox',
    { preHandler: [authenticate] },
    async (request, reply) => {
      const hasil: BarisInbox[] = []
      const ringkas: Record<string, number> = {}
      const dilewati: Array<{ jenis: string; sebab: string }> = []
      const userId = request.currentUser!.id

      for (const s of SUMBER_INBOX) {
        // Hanya jenis yang boleh diikuti pengguna ini. Menampilkan yang lain
        // berarti memberi daftar pekerjaan yang tak bisa ia kerjakan.
        const izin = await canParticipateInChain(request, s.jenis as never)
        if (izin.configError) {
          // Gagal baca konfigurasi TIDAK boleh menyamar jadi "tak ada yang
          // menunggu" — itu membuat antrean terlihat kosong padahal tak
          // terbaca. Dilaporkan ke pemanggil, bukan ditelan.
          request.log.error({ configError: izin.configError, jenis: s.jenis },
            'inbox: baca rantai approval gagal')
          dilewati.push({ jenis: s.jenis, sebab: 'konfigurasi rantai tak terbaca' })
          continue
        }
        if (!izin.ok) continue

        const q = s.tenancy === 'B'
          ? request.db!.from(s.tabel)
          : request.db!.unsafe(s.tabel, 'inbox approval; disaring project_id di baris berikutnya')

        let query = q.select(kolomUntuk(s)).in('status', s.statusMenunggu)
        if (s.tenancy === 'C') {
          query = query.in('project_id', await request.db!.projectIds())
        }
        if (s.tenancy === 'C-pegawai') {
          // Cuti menuju tenant lewat PEGAWAI, bukan proyek — cuti bukan milik
          // proyek mana pun. Dibatasi di query, bukan disaring sesudah
          // membaca: menyaring di aplikasi berarti baris tenant lain sempat
          // terbaca.
          const { data: peg, error: errPeg } = await request.db!
            .from('pegawai')
            .select('id')
          if (errPeg) {
            request.log.error({ err: errPeg, jenis: s.jenis },
              'inbox: gagal membaca pegawai untuk tenancy cuti')
            dilewati.push({ jenis: s.jenis, sebab: 'daftar pegawai tak terbaca' })
            continue
          }
          const idPeg = (peg ?? []).map((x) => (x as { id: string }).id)
          if (idPeg.length === 0) continue
          query = query.in('pegawai_id', idPeg)
        }
        if (s.tenancy === 'C-scenario') {
          // Dua lompatan: skenario milik proyek tenant ini, lalu versi milik
          // skenario itu. Dibatasi di sini, bukan disaring sesudah membaca —
          // menyaring di aplikasi berarti baris tenant lain sempat terbaca.
          const { data: skenario, error: errSkenario } = await request.db!
            .unsafe('scenarios', 'inbox approval; disaring project_id di baris ini juga')
            .select('id')
            .in('project_id', await request.db!.projectIds())
          if (errSkenario) {
            // Gagal membaca skenario berarti versi estimasi TIDAK terbaca.
            // Dilaporkan, bukan ditelan — kalau tidak, jenis ini terlihat
            // "kosong" padahal cuma tak terjangkau.
            request.log.error({ err: errSkenario, jenis: s.jenis },
              'inbox: gagal membaca skenario untuk tenancy estimasi')
            dilewati.push({ jenis: s.jenis, sebab: errSkenario.message })
            continue
          }
          const idSkenario = ((skenario ?? []) as Array<{ id: string }>).map((x) => x.id)
          if (idSkenario.length === 0) { ringkas[s.jenis] = 0; continue }
          query = query.in('scenario_id', idSkenario)
        }

        const { data, error } = await query.order(s.kolomDibuat, { ascending: true }).limit(200)

        if (error) {
          request.log.error({ err: error, jenis: s.jenis }, 'inbox: gagal membaca entitas')
          dilewati.push({ jenis: s.jenis, sebab: error.message })
          continue
        }

        const baris = (data ?? []) as unknown as Array<Record<string, unknown>>
        if (baris.length === 0) { ringkas[s.jenis] = 0; continue }

        // Level yang sudah disetujui, satu query untuk seluruh jenis ini.
        const ids = baris.map((b) => String(b.id))
        const { data: progres, error: errProgres } = await request.db!
          .from('approval_progress')
          .select('entity_id, level')
          .eq('entity_type', s.jenis)
          .in('entity_id', ids)

        if (errProgres) {
          // TIDAK menggugurkan jenis ini — barisnya tetap ditampilkan, hanya
          // tanpa penanda level. Menyembunyikan seluruh antrean karena satu
          // kolom informatif gagal dibaca akan menukar kerugian kecil dengan
          // kerugian besar: dokumen yang menunggu jadi tak terlihat.
          //
          // Tapi kegagalannya tetap DICATAT — `level_selesai: 0` pada dokumen
          // yang sebenarnya sudah disetujui level 1 adalah angka yang salah,
          // dan angka salah yang tak pernah dipertanyakan lebih berbahaya
          // daripada angka yang hilang.
          request.log.error({ err: errProgres, jenis: s.jenis },
            'inbox: level approval tak terbaca — baris tetap tampil tanpa penanda level')
        }

        const levelTertinggi = new Map<string, number>()
        for (const p of (progres ?? []) as Array<{ entity_id: string; level: number }>) {
          const kini = levelTertinggi.get(p.entity_id) ?? 0
          if (p.level > kini) levelTertinggi.set(p.entity_id, p.level)
        }

        for (const b of baris) {
          const id = String(b.id)
          const pengaju = s.kolomPengaju ? (b[s.kolomPengaju] as string | null) : null
          hasil.push({
            jenis: s.jenis,
            label: s.label,
            id,
            judul: s.kolomJudul ? ((b[s.kolomJudul] as string | null) ?? null) : null,
            nomor: s.kolomNomor ? ((b[s.kolomNomor] as string | null) ?? null) : null,
            // Nominal `numeric` datang sebagai string dari Postgres — dijaga
            // begitu sampai batas API, lalu diubah SEKALI di sini.
            nominal: s.kolomNominal && b[s.kolomNominal] != null
              ? Number(b[s.kolomNominal])
              : null,
            pengaju_id: pengaju,
            dibuat_pada: (b[s.kolomDibuat] as string | null) ?? null,
            project_id: (b.project_id as string | null) ?? null,   // null untuk C-scenario
            level_selesai: levelTertinggi.get(id) ?? 0,
            jalur_ui: s.jalurUi,
            saya_pengajunya: pengaju === userId,
          })
        }
        ringkas[s.jenis] = baris.length
      }

      // Yang paling lama menunggu di ATAS. Approver yang membuka inbox dengan
      // waktu terbatas harus melihat yang paling tertahan lebih dulu —
      // pengurutan menurut jenis akan menyembunyikan kasbon dua pekan di
      // bawah change order kemarin.
      hasil.sort((a, b) => (a.dibuat_pada ?? '').localeCompare(b.dibuat_pada ?? ''))

      return reply.send({
        data: hasil,
        total: hasil.length,
        ringkas,
        // Non-kosong berarti sebagian antrean TIDAK terbaca. UI menampilkannya
        // supaya "kosong" tak pernah salah dibaca sebagai "tak ada pekerjaan".
        dilewati,
      })
    },
  )
}
