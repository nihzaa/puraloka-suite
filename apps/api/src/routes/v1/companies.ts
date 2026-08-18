import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'
import { supabase } from '../../utils/supabase.js'
import { authenticate } from '../../plugins/auth.js'
import { logAuditEvent } from '../../utils/audit.js'
import { siapkanRantaiApproval } from '../../utils/approval.js'
import { lupakanKredensialCompany } from '../../lib/kredensial.js'

// ============================================================
// T9 — KELOLA BADAN USAHA (L2 penuh dari UI).
//
// Menutup jarak antara "arsitekturnya siap menampung beberapa PT/CV" dan
// "founder bisa membuatnya sendiri". Sebelum ini, mendirikan badan usaha kedua
// butuh INSERT manual ke database.
//
// OTORISASI — keputusan founder 2026-07-29 (ADR-011-T9 §3, Opsi B):
// yang boleh mendirikan badan usaha HANYA pemilik grup, bukan pemegang
// permission tertentu.
//
// Kenapa bukan permission biasa: seluruh 89 permission dievaluasi DALAM KONTEKS
// company aktif ("boleh apa orang ini di perusahaan ini"). Mendirikan badan
// usaha adalah tindakan DI ATAS semua perusahaan — memaksakannya ke model
// per-company berarti bertanya "di perusahaan mana Anda boleh mendirikan
// perusahaan?", yang tak punya jawaban bermakna.
//
// Kepemilikan grup BUKAN gerbang akses data. Pemilik grup tidak dengan
// sendirinya bisa membaca data seluruh badan usaha — itu tetap dijaga
// company_id + permission. Mencampur keduanya akan mengubah model keamanan
// tanpa diminta.
// ============================================================

/**
 * Awalan nama yang dipakai SELURUH fixture test untuk badan usaha uji
 * (`[UJI]`, `[UJI-S1]`, `[UJI-ISOLASI]`, `[UJI-RUTE]`, …).
 *
 * ══════════════════════════════════════════════════════════════════════════
 * KENAPA DISARING DI SINI, BUKAN DIHAPUS DARI BASIS
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Founder 2026-08-19: *"badan usaha itu bukan usaha sungguhan, ini untuk test,
 * hapus ajaa"* — dan itu benar, barisnya memang sampah fixture. Tapi
 * MENGHAPUSNYA tidak bisa dilakukan diam-diam:
 *
 *   • `trg_company_no_casual_delete` menolak DELETE pada `companies`. Diuji
 *     langsung (di dalam transaksi yang di-ROLLBACK): ditolak.
 *   • 216 baris turunan menempel padanya, 186 di antaranya `audit_logs` —
 *     yang dijaga `trg_audit_logs_no_delete`. Immutability audit log adalah
 *     Ember [C] (CLAUDE.md §5.3): *"jangan pernah membuatnya bisa diubah."*
 *
 * Menghapus paksa berarti mematikan DUA perlindungan itu untuk merapikan
 * data uji. Harganya tak sepadan, dan §8a.1 menuntut berhenti untuk operasi
 * destruktif yang tak bisa mundur.
 *
 * Saringan ini memberi hasil yang SAMA di layar — badan usaha uji tak pernah
 * muncul lagi — tanpa menyentuh satu pun perlindungan. Ia juga lebih tahan
 * lama daripada penghapusan: jumlahnya naik 652 → 741 hanya selama satu sesi
 * karena test terus berjalan. Sekali dihapus, besok muncul lagi; sekali
 * disaring, selamanya bersih.
 *
 * ⚠ Nama badan usaha SUNGGUHAN tak boleh diawali `[UJI`. Itu bukan batasan
 * yang mengganggu — kurung siku di awal nama PT/CV tak pernah sah — tetapi
 * kalau suatu hari perlu, saringan ini yang harus diganti (mis. kolom
 * `is_fixture` khusus), bukan namanya yang dipaksakan.
 */
const TANDA_FIXTURE = '[UJI'

/** Gerbang: hanya pemilik grup yang lolos. */
async function requireGroupOwner(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<boolean> {
  const { data, error } = await supabase.rpc('is_group_owner', {
    p_user_id: request.currentUser!.id,
  })
  if (error) {
    request.log.error({ err: error }, 'gagal memeriksa kepemilikan grup')
    reply.status(500).send({ error: 'Gagal memeriksa wewenang' })
    return false
  }
  if (data !== true) {
    // 403, bukan 404: pemanggil TAHU endpoint ini ada (ia memanggilnya), dan
    // menyamarkannya sebagai "tidak ditemukan" hanya membingungkan tanpa
    // menyembunyikan apa pun.
    reply.status(403).send({
      error: 'Hanya pemilik grup usaha yang dapat mengelola badan usaha',
    })
    return false
  }
  return true
}

const KODE_VALID = /^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$/

export default async function companiesRoutes(app: FastifyInstance) {
  // ── POST /api/v1/companies ────────────────────────────────────────────────
  // Mendirikan badan usaha baru dalam grup pemanggil.
  app.post('/api/v1/companies', { preHandler: [authenticate] }, async (request, reply) => {
    if (!(await requireGroupOwner(request, reply))) return

    const body = request.body as {
      name?: string
      legal_name?: string
      code?: string
      invoice_prefix?: string
      npwp?: string
      parent_company_id?: string
    }

    const nama = body.name?.trim()
    if (!nama) return reply.status(400).send({ error: 'Nama badan usaha wajib diisi' })

    // Kode divalidasi DI SINI dengan pesan yang bisa dibaca. Tanpa ini,
    // pelanggaran `companies_code_format` keluar sebagai error constraint
    // mentah — benar secara teknis, tak berguna bagi yang mengisi form.
    const kode = body.code?.trim().toLowerCase()
    if (!kode || !KODE_VALID.test(kode)) {
      return reply.status(400).send({
        error:
          'Kode hanya boleh huruf kecil, angka, dan tanda hubung (3–40 karakter), ' +
          'diawali dan diakhiri huruf/angka. Contoh: puraloka-karya',
      })
    }

    const { data: adaKode } = await request.db!
      .unsafe('companies', 'kategori D; T9 memang lintas company — cek keunikan kode global')
      .select('id').eq('code', kode).maybeSingle()
    if (adaKode) {
      return reply.status(409).send({ error: `Kode "${kode}" sudah dipakai badan usaha lain` })
    }

    // Induk: badan usaha baru masuk ke grup pemanggil. Kalau induk disebut
    // eksplisit, ia HARUS berada di grup yang sama — tanpa cek ini, pemilik
    // grup A bisa menyelipkan badan usaha ke dalam grup B.
    const indukId = body.parent_company_id ?? request.companyId!
    const { data: akarPemanggil } = await supabase.rpc('company_group_root', {
      p_company_id: indukId,
    })
    const { data: akarMilikSaya } = await request.db!
      .unsafe('companies', 'kategori D; T9 memang lintas company — verifikasi kepemilikan grup')
      .select('id').eq('id', akarPemanggil).eq('owner_user_id', request.currentUser!.id)
      .maybeSingle()
    if (!akarMilikSaya) {
      return reply.status(403).send({ error: 'Anda bukan pemilik grup usaha tersebut' })
    }

    const { data: baru, error: errBuat } = await request.db!
      .unsafe('companies', 'kategori D; T9 memang lintas company — pendirian badan usaha baru')
      .insert({
        code: kode,
        name: nama,
        legal_name: body.legal_name?.trim() || nama,
        npwp: body.npwp?.trim() || null,
        invoice_prefix: body.invoice_prefix?.trim() || 'INV',
        parent_company_id: indukId,
        created_by: request.currentUser!.id,
        updated_by: request.currentUser!.id,
      })
      .select('id, code, name, legal_name, invoice_prefix, parent_company_id')
      .single()

    if (errBuat || !baru) {
      request.log.error({ err: errBuat }, 'gagal membuat badan usaha')
      return reply.status(500).send({ error: 'Gagal membuat badan usaha' })
    }

    // Keanggotaan pembuat — kegagalan paling mungkin dari INSERT manual adalah
    // membuat company lalu lupa langkah ini, menghasilkan perusahaan yang TAK
    // BISA DIMASUKI siapa pun, termasuk pembuatnya. Kalau langkah ini gagal,
    // company-nya dibatalkan: lebih baik tak jadi dibuat daripada lahir mati.
    const { data: roleAdmin } = await request.db!
      .shared('roles')
      .select('id').eq('name', 'admin').maybeSingle()

    const { error: errAnggota } = await request.db!
      .unsafe('company_members', 'kategori D; T9 memang lintas company — keanggotaan di badan usaha yang baru dibuat')
      .insert({
        company_id: baru.id,
        user_id: request.currentUser!.id,
        role_id: roleAdmin?.id ?? null,
        is_default: false,
        is_active: true,
        created_by: request.currentUser!.id,
      })

    if (errAnggota) {
      await request.db!
        .unsafe('companies', 'kategori D; T9 memang lintas company — rollback badan usaha yang gagal disiapkan')
        .delete().eq('id', baru.id)
      request.log.error({ err: errAnggota }, 'gagal membuat keanggotaan; badan usaha dibatalkan')
      return reply.status(500).send({
        error: 'Gagal menyiapkan keanggotaan badan usaha. Tidak ada yang dibuat.',
      })
    }

    // Rantai approval — bagian dari PENDIRIAN, bukan tugas menyusul.
    //
    // Diukur 2026-08-07: company kedua di basis ini punya 0 dari 7 jenis
    // rantai. Konsekuensinya bukan "belum dikonfigurasi" melainkan alur
    // persetujuan yang MATI: pengajuan masuk, lalu tak pernah bisa
    // diputuskan siapa pun. Tak ada galat — hanya antrean yang tak bergerak.
    //
    // Kegagalannya TIDAK membatalkan company, berbeda dari keanggotaan di
    // atas. Alasannya: company tanpa anggota tak bisa dimasuki sama sekali,
    // sedangkan company tanpa rantai tetap bisa dipakai untuk hal lain dan
    // rantainya bisa disusulkan lewat pengaturan. Yang tak boleh adalah
    // kegagalan itu LEWAT TANPA JEJAK.
    const rantai = await siapkanRantaiApproval(baru.id)
    if (!rantai.ok) {
      request.log.error(
        { err: rantai.error, companyId: baru.id },
        'badan usaha dibuat TAPI rantai approval gagal disiapkan — alur persetujuan mati sampai diperbaiki',
      )
      await logAuditEvent(request, {
        tableName: 'companies', recordId: baru.id, action: 'company.rantai_approval_gagal',
        actorId: request.currentUser!.id, severity: 'critical',
        reason: `Rantai approval gagal disiapkan: ${rantai.error ?? 'sebab tak diketahui'}`,
      })
    }

    await logAuditEvent(request, {
      tableName: 'companies',
      recordId: baru.id,
      action: 'create',
      actorId: request.currentUser!.id,
      newValues: {
        code: baru.code, name: baru.name, parent_company_id: indukId,
        rantai_approval_disalin: rantai.disalin,
      },
      reason: 'Pendirian badan usaha baru oleh pemilik grup (T9)',
    })

    return reply.status(201).send({ data: baru })
  })

  // ── GET /api/v1/companies ─────────────────────────────────────────────────
  // Badan usaha dalam grup pemanggil, lengkap dengan jumlah anggota.
  app.get('/api/v1/companies', { preHandler: [authenticate] }, async (request, reply) => {
    if (!(await requireGroupOwner(request, reply))) return

    /*
     * `.eq('is_active', true)` BUKAN kerapian — ia yang membuat rute ini hidup.
     *
     * Badan usaha TIDAK PERNAH dihapus dari basis: trigger melarangnya, dan
     * larangan itu benar (menghapus tenant = kehilangan data lintas puluhan
     * tabel, tak bisa di-rollback). Off-boarding menyetel `is_active = false`.
     * `ai-isolasi-tenant.test.ts` tunduk pada aturan yang sama — tiap kali
     * berjalan ia MENINGGALKAN satu baris nonaktif.
     *
     * Diukur 2026-08-16: 652 baris, 647 di antaranya nonaktif, semuanya
     * dimiliki satu akun. Saringan `.or(id.in.(…),parent_company_id.in.(…))`
     * di bawah lalu tumbuh jadi 48.204 byte — jauh melewati batas baris
     * permintaan HTTP (~8 KB), jadi PostgREST menolaknya dan halaman "Badan
     * Usaha" membalas 500 setiap kali dibuka.
     *
     * Gejalanya menyesatkan: yang terlihat cuma "Gagal memuat daftar badan
     * usaha", seolah-olah izin atau jaringan. Yang sebenarnya terjadi adalah
     * URL yang terlalu panjang — dan ia akan terjadi pada pelanggan SUNGGUHAN
     * yang punya banyak anak perusahaan, bukan cuma di basis pengembangan.
     *
     * Halaman ini memang hanya menampilkan badan usaha aktif, jadi menyaring
     * di sumbernya benar dua kali: hasilnya sama, URL-nya tetap kecil.
     */
    const { data: akar } = await request.db!
      .unsafe('companies', 'kategori D; T9 memang lintas company — daftar grup milik pemanggil')
      .select('id').eq('owner_user_id', request.currentUser!.id).eq('is_active', true)
      .not('name', 'like', `${TANDA_FIXTURE}%`)
    const idAkar = (akar ?? []).map((r: { id: string }) => r.id)
    if (idAkar.length === 0) return reply.send({ data: [] })

    const { data, error } = await request.db!
      .unsafe('companies', 'kategori D; T9 memang lintas company — daftar badan usaha dalam grup')
      .select('id, code, name, legal_name, invoice_prefix, parent_company_id, is_active, created_at')
      .or(`id.in.(${idAkar.join(',')}),parent_company_id.in.(${idAkar.join(',')})`)
      // Anak perusahaan yang sudah di-off-boarding tak ikut terdaftar — dan
      // tanpa ini, sisa fixture test yang berinduk pada grup aktif tetap
      // membengkakkan daftarnya kembali.
      .eq('is_active', true)
      .not('name', 'like', `${TANDA_FIXTURE}%`)
      .order('created_at', { ascending: true })

    if (error) return reply.status(500).send({ error: 'Gagal memuat daftar badan usaha' })

    const ids = (data ?? []).map((r: { id: string }) => r.id)
    const { data: anggota } = await request.db!
      .unsafe('company_members', 'kategori D; T9 memang lintas company — hitung anggota tiap badan usaha')
      .select('company_id').in('company_id', ids).eq('is_active', true)

    const jumlah = new Map<string, number>()
    for (const a of (anggota ?? []) as { company_id: string }[]) {
      jumlah.set(a.company_id, (jumlah.get(a.company_id) ?? 0) + 1)
    }

    return reply.send({
      data: (data ?? []).map((r: Record<string, unknown>) => ({
        ...r,
        jumlah_anggota: jumlah.get(r.id as string) ?? 0,
        is_akar: r.parent_company_id === null,
      })),
    })
  })

  // ── GET /api/v1/companies/:id/members ─────────────────────────────────────
  app.get('/api/v1/companies/:id/members', { preHandler: [authenticate] }, async (request, reply) => {
    if (!(await requireGroupOwner(request, reply))) return
    const { id } = request.params as { id: string }
    if (!(await grupMilikSaya(request, id))) {
      return reply.status(403).send({ error: 'Badan usaha tersebut bukan bagian dari grup Anda' })
    }

    const { data, error } = await request.db!
      .unsafe('company_members', 'kategori D; T9 memang lintas company — daftar anggota badan usaha')
      .select('user_id, is_default, is_active, users ( id, name, email ), roles ( id, name )')
      .eq('company_id', id)

    if (error) return reply.status(500).send({ error: 'Gagal memuat anggota' })
    return reply.send({ data: data ?? [] })
  })

  // ── POST /api/v1/companies/:id/members ────────────────────────────────────
  app.post('/api/v1/companies/:id/members', { preHandler: [authenticate] }, async (request, reply) => {
    if (!(await requireGroupOwner(request, reply))) return
    const { id } = request.params as { id: string }
    const body = request.body as { user_id?: string; role_id?: string }

    if (!(await grupMilikSaya(request, id))) {
      return reply.status(403).send({ error: 'Badan usaha tersebut bukan bagian dari grup Anda' })
    }
    if (!body.user_id || !body.role_id) {
      return reply.status(400).send({ error: 'user_id dan role_id wajib diisi' })
    }

    const { error } = await request.db!
      .unsafe('company_members', 'kategori D; T9 memang lintas company — tambah anggota badan usaha')
      .upsert(
      {
        company_id: id,
        user_id: body.user_id,
        role_id: body.role_id,
        is_active: true,
        created_by: request.currentUser!.id,
      },
      { onConflict: 'company_id,user_id' }
    )
    if (error) {
      request.log.error({ err: error }, 'gagal menambah anggota')
      return reply.status(500).send({ error: 'Gagal menambah anggota' })
    }

    await logAuditEvent(request, {
      tableName: 'company_members',
      recordId: id,
      action: 'create',
      actorId: request.currentUser!.id,
      newValues: { user_id: body.user_id, role_id: body.role_id },
    })

    return reply.status(201).send({ ok: true })
  })

  // ── PATCH /api/v1/companies/:id/members/:userId ───────────────────────────
  app.patch('/api/v1/companies/:id/members/:userId', { preHandler: [authenticate] }, async (request, reply) => {
    if (!(await requireGroupOwner(request, reply))) return
    const { id, userId } = request.params as { id: string; userId: string }
    const body = request.body as { role_id?: string; is_active?: boolean }

    if (!(await grupMilikSaya(request, id))) {
      return reply.status(403).send({ error: 'Badan usaha tersebut bukan bagian dari grup Anda' })
    }

    // Pemilik grup tak boleh mencabut keanggotaannya sendiri dari akar grup —
    // hasilnya grup yang pemiliknya tak bisa masuk ke perusahaan induknya
    // sendiri, dan tak ada jalan memperbaikinya dari UI.
    if (userId === request.currentUser!.id && body.is_active === false) {
      const { data: akar } = await request.db!
        .unsafe('companies', 'kategori D; T9 memang lintas company — cek apakah badan usaha ini akar grup')
        .select('id').eq('id', id).is('parent_company_id', null).maybeSingle()
      if (akar) {
        return reply.status(400).send({
          error: 'Anda tidak dapat mencabut keanggotaan diri sendiri dari badan usaha induk',
        })
      }
    }

    const patch: Record<string, unknown> = {}
    if (body.role_id !== undefined) patch.role_id = body.role_id
    if (body.is_active !== undefined) patch.is_active = body.is_active
    if (Object.keys(patch).length === 0) {
      return reply.status(400).send({ error: 'Tidak ada perubahan yang dikirim' })
    }

    const { error } = await request.db!
      .unsafe('company_members', 'kategori D; T9 memang lintas company — ubah peran/status anggota')
      .update(patch).eq('company_id', id).eq('user_id', userId)
    if (error) return reply.status(500).send({ error: 'Gagal memperbarui anggota' })

    await logAuditEvent(request, {
      tableName: 'company_members',
      recordId: id,
      action: 'update',
      actorId: request.currentUser!.id,
      newValues: { user_id: userId, ...patch },
    })

    return reply.send({ ok: true })
  })

  /*
    ── PATCH /api/v1/companies/:id/pengaturan ────────────────────────────────

    Saklar warisan kredensial grup (migrasi 393).

    Founder: *"bisa di aktifkan jika ditanggung grup bisa juga anak grup pake
    api sendiri"*. Kolomnya sudah ada, tetapi tanpa rute ini ia hanya bisa
    diubah lewat SQL — dan "kolom DB sudah ada" bukan selesai (CHARTER §7):
    config-first berarti ada halaman pengaturannya.

    Gerbangnya `requireGroupOwner`: menentukan siapa menanggung tagihan AI
    seluruh anak perusahaan adalah keputusan pemilik grup, bukan admin salah
    satu anak. Admin anak yang ingin lepas dari tanggungan induk cukup mengisi
    kuncinya sendiri — kunci tenant SELALU menang atas warisan, tanpa perlu
    menyentuh saklar ini.

    Perusahaan INDUK (`parent_company_id` NULL) ditolak: tak ada yang bisa
    diwarisi, dan membiarkannya diubah menciptakan setelan yang tak berarti
    apa-apa tetapi terlihat bermakna di layar.
  */
  app.patch('/api/v1/companies/:id/pengaturan', { preHandler: [authenticate] }, async (request, reply) => {
    if (!(await requireGroupOwner(request, reply))) return
    const { id } = request.params as { id: string }
    const body = request.body as { warisi_kredensial_induk?: boolean }

    if (!(await grupMilikSaya(request, id))) {
      return reply.status(403).send({ error: 'Badan usaha tersebut bukan bagian dari grup Anda' })
    }

    if (typeof body.warisi_kredensial_induk !== 'boolean') {
      return reply.status(400).send({ error: '`warisi_kredensial_induk` harus true/false' })
    }

    /*
      `error` DIPERIKSA terpisah dari `!co`.

      Tanpa itu, gangguan basis terbaca sebagai "badan usaha tidak ditemukan" —
      404 yang menuntun pemilik grup mencari badan usaha yang sebenarnya ada.
      "Gagal baca" dan "tak ada" adalah dua keadaan berbeda, dan menyamakannya
      persis yang `audit-kegagalan-senyap` tegakkan.
    */
    const { data: co, error: errBaca } = await request.db!
      .unsafe('companies', 'kategori D; T9 memang lintas company — baca induk badan usaha ini')
      .select('id, parent_company_id').eq('id', id).maybeSingle()
    if (errBaca) {
      request.log.error({ err: errBaca, id }, 'companies: gagal membaca induk badan usaha')
      return reply.status(500).send({ error: 'Gagal membaca badan usaha' })
    }
    if (!co) return reply.status(404).send({ error: 'Badan usaha tidak ditemukan' })

    if (!(co as { parent_company_id?: string | null }).parent_company_id) {
      return reply.status(400).send({
        error: 'Badan usaha induk tidak mewarisi dari mana pun — setelan ini hanya untuk anak grup',
      })
    }

    /*
      `.select().maybeSingle()` — bukan sekadar `{ error }`.

      `error` hanya terisi kalau QUERY-nya gagal. Id yang barisnya tak cocok
      menghasilkan NOL BARIS tanpa satu pun galat, dan rute ini akan membalas
      `ok: true` untuk saklar yang tak pernah berubah — pemilik grup melihat
      "tersimpan" sementara anak perusahaannya tetap mewarisi kunci induk.

      Bentuk kegagalan yang persis sama dengan cacat `wa/template` yang
      melahirkan `AMBANG_ERROR_SAJA` di `audit-tulis-tanpa-periksa`. Ratchet
      itu naik 76 → 77 di commit 0f0b4e58 — commit saya sendiri, dan saya tak
      menjalankan penjaganya sebelum commit.
    */
    const { data: terubah, error } = await request.db!
      .unsafe('companies', 'kategori D; T9 memang lintas company — ubah saklar warisan kredensial')
      .update({ warisi_kredensial_induk: body.warisi_kredensial_induk, updated_by: request.currentUser!.id })
      .eq('id', id)
      .select('id')
      .maybeSingle()
    if (error) return reply.status(500).send({ error: 'Gagal memperbarui pengaturan badan usaha' })
    if (!terubah) {
      return reply.status(404).send({ error: 'Badan usaha tidak ditemukan saat menyimpan' })
    }

    /*
      Cache kredensial DILUPAKAN — tanpa ini, saklar yang baru dimatikan tetap
      memulangkan kunci induk sampai TTL habis, dan pemilik grup melihat
      setelannya "tersimpan" sementara tagihannya masih berjalan.
    */
    lupakanKredensialCompany(id)

    await logAuditEvent(request, {
      tableName: 'companies',
      recordId: id,
      action: 'update',
      actorId: request.currentUser!.id,
      newValues: { warisi_kredensial_induk: body.warisi_kredensial_induk },
      severity: 'critical',
    })

    return reply.send({ ok: true, warisi_kredensial_induk: body.warisi_kredensial_induk })
  })

  // ── PATCH /api/v1/my/companies/:id/default ────────────────────────────────
  // Badan usaha default MILIK SENDIRI. Sengaja tanpa gerbang pemilik grup:
  // ini preferensi pribadi, bukan pengelolaan grup — setiap anggota berhak
  // menentukan badan usaha mana yang terbuka saat ia login.
  app.patch('/api/v1/my/companies/:id/default', { preHandler: [authenticate] }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const uid = request.currentUser!.id

    const { data: anggota } = await request.db!
      .unsafe('company_members', 'kategori D; T9 memang lintas company — verifikasi keanggotaan diri sendiri')
      .select('company_id')
      .eq('user_id', uid).eq('company_id', id).eq('is_active', true).maybeSingle()
    if (!anggota) {
      return reply.status(403).send({ error: 'Anda bukan anggota badan usaha tersebut' })
    }

    /*
      ── NAIKKAN DULU, BARU TURUNKAN YANG LAIN (dibalik 2026-08-14)

      Urutan sebelumnya: turunkan SEMUA → naikkan yang dipilih. Alasannya
      benar (dua default sekaligus membuat `auth_company_id()` memulangkan
      salah satunya secara sembarang), dan kegagalan penurunan pun sudah
      diperiksa.

      Yang tak tertutup: kegagalan KENAIKAN. Penurunan sudah terlanjur
      tersimpan, jadi pengguna tertinggal dengan NOL default — dan itu jauh
      lebih merusak daripada dua default.

      `auth_company_id()` jatuh ke keanggotaan default. Tanpa satu pun,
      ia NULL — lalu `tenant_isolation` RESTRICTIVE (migrasi 373) menyaring
      HABIS, dan pengguna melihat NOL data tanpa satu pun galat. Gejalanya
      identik dengan kebocoran dari sisi berlawanan, dan keduanya sama-sama
      diam.

      Terukur 2026-08-14: **13 pengguna aktif tanpa keanggotaan default**,
      semuanya berkeanggotaan TUNGGAL — jadi bukan kasus rumit, melainkan
      sisa dari jendela ini. Salah satunya membuat `t5b-kill-switch` merah
      (`auth_client_id()` memulangkan NULL), dan merahnya terbaca seperti
      kebocoran lintas-tenant — sepuluh langkah dari sebabnya.

      Dibalik: naikkan yang dipilih lebih dulu, baru turunkan sisanya.

        · kenaikan gagal  → tak ada yang berubah, default lama tetap berlaku
        · penurunan gagal → dua default sementara; `auth_company_id()` memang
                            sembarang di antara keduanya, tetapi keduanya
                            company yang SAH bagi pengguna ini. Ia melihat
                            data, bukan layar kosong.

      Dua default adalah gangguan; nol default adalah kelumpuhan senyap.
      Transaksi sungguhan lebih baik lagi, tetapi `request.db` tak
      menyediakannya — dan urutan yang benar sudah menghapus kelas
      kerusakannya, bukan sekadar memperkecil peluangnya.
    */
    const { error } = await request.db!
      .unsafe('company_members', 'kategori D; T9 memang lintas company — set badan usaha utama milik user ini')
      .update({ is_default: true })
      .eq('user_id', uid).eq('company_id', id)
    if (error) return reply.status(500).send({ error: 'Gagal menyimpan badan usaha utama' })

    const { error: errTurun } = await request.db!
      .unsafe('company_members', 'kategori D; T9 memang lintas company — turunkan default lama milik user ini')
      .update({ is_default: false })
      .eq('user_id', uid).neq('company_id', id)
    if (errTurun) {
      /*
        TIDAK 500: yang dipilih pengguna SUDAH jadi default, jadi permintaannya
        terpenuhi. Membalas 500 di sini membuat UI menampilkan "gagal" untuk
        perubahan yang sebenarnya berhasil, dan pengguna menekannya lagi —
        mengulang keadaan yang sama.

        Tetapi TIDAK ditelan diam-diam: dua default membuat `auth_company_id()`
        sembarang, dan itu harus punya jejak.
      */
      request.log.error(
        { err: errTurun, uid, companyId: id },
        'default baru tersimpan tetapi default lama gagal diturunkan — dua default sekaligus',
      )
    }

    return reply.send({ ok: true })
  })
}

/** True bila `companyId` berada di grup yang dimiliki pemanggil. */
async function grupMilikSaya(request: FastifyRequest, companyId: string): Promise<boolean> {
  const { data: akar } = await supabase.rpc('company_group_root', { p_company_id: companyId })
  if (!akar) return false
  const { data } = await request.db!
    .unsafe('companies', 'kategori D; T9 memang lintas company — verifikasi grup milik pemanggil')
    .select('id')
    .eq('id', akar).eq('owner_user_id', request.currentUser!.id).maybeSingle()
  return !!data
}
